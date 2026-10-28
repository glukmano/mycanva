import fs from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import { designSize, loadDesign, safeId } from "./designs.js";
import { EXPORTS_DIR } from "./paths.js";
import { getBrowser, renderDesign } from "./render.js";

export interface ExportResult { url: string; file: string; count: number; warnings: string[] }

/** يصدّر مجموعة تصاميم: ملفات داخل ZIP، أو ملف PDF متعدد الصفحات (للكاروسيل) */
export async function exportDesigns(ids: string[], opts: { name: string; type: "png" | "jpeg" | "pdf"; zip?: boolean; scale?: number }): Promise<ExportResult> {
  if (!ids.length) throw new Error("لا توجد تصاميم للتصدير");
  const name = safeId(opts.name), dir = path.join(EXPORTS_DIR, name);
  await fs.mkdir(dir, { recursive: true });
  const warnings: string[] = [], files: { id: string; file: string }[] = [];
  const raster = opts.type === "pdf" ? "png" : opts.type;
  for (const id of ids) {
    const d = await loadDesign(id), out = path.join(dir, `${safeId(id)}.${raster === "jpeg" ? "jpg" : "png"}`);
    const r = await renderDesign(d, { out, type: raster, scale: opts.scale ?? (opts.type === "pdf" ? 1.5 : 2) });
    warnings.push(...r.warnings.map((w) => `${id}: ${w}`)); files.push({ id, file: out });
  }
  if (opts.type === "pdf") {
    const { w, h } = designSize(await loadDesign(ids[0]));
    const imgs = await Promise.all(files.map(async (f) => `<div class="p"><img src="data:image/png;base64,${(await fs.readFile(f.file)).toString("base64")}"></div>`));
    const html = `<!doctype html><meta charset="utf-8"><style>@page{size:${w}px ${h}px;margin:0}*{margin:0;padding:0}.p{width:${w}px;height:${h}px;page-break-after:always;overflow:hidden}.p:last-child{page-break-after:auto}img{width:${w}px;height:${h}px;display:block}</style>${imgs.join("")}`;
    const ctx = await (await getBrowser()).newContext(), page = await ctx.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      const file = path.join(EXPORTS_DIR, `${name}.pdf`);
      await page.pdf({ path: file, width: `${w}px`, height: `${h}px`, printBackground: true });
      await Promise.all(files.map((f) => fs.unlink(f.file).catch(() => {}))); await fs.rmdir(dir).catch(() => {});
      return { url: `/exports/${name}.pdf`, file, count: files.length, warnings };
    } finally { await ctx.close(); }
  }
  if (opts.zip === false && files.length === 1) return { url: `/exports/${name}/${path.basename(files[0].file)}`, file: files[0].file, count: 1, warnings };
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[path.basename(f.file)] = new Uint8Array(await fs.readFile(f.file));
  const zipFile = path.join(EXPORTS_DIR, `${name}.zip`);
  await fs.writeFile(zipFile, zipSync(entries, { level: 0 })); // الصور مضغوطة أصلاً
  return { url: `/exports/${name}.zip`, file: zipFile, count: files.length, warnings };
}
