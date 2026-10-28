import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findBinary } from "../settings.js";
import { animEnd, designToHtml, getBrowser } from "./render.js";
import type { Design } from "./types.js";

export interface VideoResult { file: string; seconds: number; frames: number }

/** يحوّل تصميماً فيه حركات (anim) إلى MP4 أو GIF: نلتقط إطارات بتحريك الزمن يدوياً ثم يجمّعها ffmpeg */
export async function renderVideo(input: Design, opts: { out: string; format?: "mp4" | "gif"; fps?: number; scale?: number; hold?: number }): Promise<VideoResult> {
  const ffmpeg = findBinary("ffmpeg");
  if (!ffmpeg) throw new Error("ffmpeg غير مثبّت (brew install ffmpeg)");
  const format = opts.format ?? "mp4", fps = Math.min(30, Math.max(8, opts.fps ?? (format === "gif" ? 15 : 24)));
  const end = animEnd(input);
  if (!end) throw new Error("لا توجد عناصر متحركة. أضف حركة لعنصر واحد على الأقل");
  const total = Math.min(15000, end + (opts.hold ?? 1000));
  const { html, width, height } = await designToHtml(input, { animate: true, paused: true });
  const scale = opts.scale ?? (format === "gif" ? 0.5 : 1);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mycanva-vid-"));
  const ctx = await (await getBrowser()).newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const frames = Math.ceil((total / 1000) * fps) + 1;
    for (let k = 0; k < frames; k++) {
      await page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), (k * 1000) / fps);
      await page.screenshot({ path: path.join(dir, `f${String(k).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92, clip: { x: 0, y: 0, width, height } });
    }
    await fs.mkdir(path.dirname(opts.out), { recursive: true });
    const src = ["-y", "-framerate", String(fps), "-i", path.join(dir, "f%04d.jpg")];
    const args = format === "mp4"
      ? [...src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-movflags", "+faststart", opts.out]
      : [...src, "-vf", `fps=${fps},split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer`, "-loop", "0", opts.out];
    await new Promise<void>((resolve, reject) => {
      const p = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] }); let err = "";
      p.stderr.on("data", (d) => (err = (err + d).slice(-800)));
      p.on("error", reject); p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("ffmpeg فشل: " + err.split("\n").slice(-3).join(" ")))));
    });
    return { file: opts.out, seconds: +(total / 1000).toFixed(1), frames };
  } finally { await ctx.close(); await fs.rm(dir, { recursive: true, force: true }); }
}
