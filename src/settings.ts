import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./core/paths.js";

const FILE = path.join(ROOT, ".cache/settings.json");
export interface Settings { token: string; customUrl?: string; pexelsKey?: string; openaiKey?: string; imageModel?: string }

let cache: Settings | undefined;
export async function getSettings(): Promise<Settings> {
  if (cache) return cache;
  try { cache = JSON.parse(await fs.readFile(FILE, "utf8")); } catch {}
  if (!cache?.token) { cache = { ...cache, token: newToken() }; await persist(); }
  return cache!;
}
const newToken = () => crypto.randomBytes(24).toString("base64url");
async function persist() { await fs.mkdir(path.dirname(FILE), { recursive: true }); await fs.writeFile(FILE, JSON.stringify(cache, null, 2), { mode: 0o600 }); }
export async function regenerateToken() { const s = await getSettings(); s.token = newToken(); await persist(); return s.token; }
export async function setCustomUrl(url: string | undefined) {
  const s = await getSettings();
  if (url && !/^https:\/\/[^\s/]+(\/)?$/i.test(url.trim())) throw new Error("الرابط يجب أن يكون https://… بدون مسار");
  s.customUrl = url?.trim().replace(/\/$/, "") || undefined; await persist(); return s.customUrl;
}
export async function tokenMatches(candidate: string): Promise<boolean> {
  const t = (await getSettings()).token, a = Buffer.from(candidate), b = Buffer.from(t);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- سجل النشاط ---------- */
export interface Activity { t: number; client: string; remote: boolean; method: string; tool?: string; status: number; ms: number }
const log: Activity[] = [];
export const recordActivity = (a: Activity) => { log.unshift(a); if (log.length > 200) log.pop(); };
export const recentActivity = (n = 40) => log.slice(0, n);
export function clientsSeen() {
  const m = new Map<string, { client: string; remote: boolean; last: number; calls: number }>();
  for (const a of log) { const k = `${a.client}|${a.remote}`; const e = m.get(k); if (e) e.calls++; else m.set(k, { client: a.client, remote: a.remote, last: a.t, calls: 1 }); }
  return [...m.values()];
}

/* ---------- النفق (للوصول من ChatGPT) ---------- */
export type Provider = "ngrok" | "cloudflared";
export interface TunnelState { state: "off" | "starting" | "on" | "error"; provider?: Provider; url?: string; error?: string; startedAt?: number }
const tunnel: TunnelState = { state: "off" };
const cur = () => tunnel.state as TunnelState["state"]; // TS لا يرى التغيير عبر Object.assign داخل الحلقات
let child: ChildProcess | undefined;

export function findBinary(name: string): string | undefined {
  for (const dir of [...(process.env.PATH ?? "").split(":"), "/opt/homebrew/bin", "/usr/local/bin"]) {
    const f = path.join(dir, name); try { fsSync.accessSync(f, fsSync.constants.X_OK); return f; } catch {}
  }
}
export const availableProviders = () => ({ ngrok: !!findBinary("ngrok"), cloudflared: !!findBinary("cloudflared") });
export const tunnelState = (): TunnelState => ({ ...tunnel });

export async function startTunnel(provider: Provider, port: number): Promise<TunnelState> {
  if (tunnel.state === "starting" || tunnel.state === "on") throw new Error("النفق يعمل بالفعل. أوقفه أولاً");
  const bin = findBinary(provider);
  if (!bin) throw new Error(provider === "ngrok" ? "ngrok غير مثبّت (brew install ngrok)" : "cloudflared غير مثبّت (brew install cloudflared)");
  Object.assign(tunnel, { state: "starting", provider, url: undefined, error: undefined, startedAt: Date.now() });
  let out = "";
  const args = provider === "ngrok" ? ["http", `127.0.0.1:${port}`, "--log=stdout"] : ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"];
  child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
  const proc = child;
  const fail = (msg: string) => { if (child === proc) { Object.assign(tunnel, { state: "error", error: msg, url: undefined }); proc.kill(); child = undefined; } };
  const onData = (d: Buffer) => {
    out = (out + d.toString()).slice(-4000);
    if (provider === "cloudflared") { const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && cur() === "starting") Object.assign(tunnel, { state: "on", url: m[0] }); }
  };
  proc.stdout?.on("data", onData); proc.stderr?.on("data", onData);
  proc.on("exit", (code) => {
    if (child !== proc) return; child = undefined;
    const hint = /ERR_NGROK_4018|authtoken/i.test(out) ? "ngrok يحتاج authtoken: شغّل `ngrok config add-authtoken <TOKEN>` (حساب مجاني من ngrok.com)" : out.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 240);
    Object.assign(tunnel, { state: "error", error: `توقف النفق (${code}). ${hint}`, url: undefined });
  });
  // ngrok: نقرأ الرابط من واجهته المحلية
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && cur() === "starting") {
    await new Promise((r) => setTimeout(r, 700));
    if (provider === "ngrok") {
      try {
        const j = await (await fetch("http://127.0.0.1:4040/api/tunnels", { signal: AbortSignal.timeout(1500) })).json() as { tunnels?: { public_url: string; config?: { addr?: string } }[] };
        const t = j.tunnels?.find((x) => x.public_url.startsWith("https://") && String(x.config?.addr).includes(String(port)));
        if (t && cur() === "starting") Object.assign(tunnel, { state: "on", url: t.public_url });
      } catch {}
    }
  }
  if (cur() === "starting") fail("انتهت المهلة قبل أن يجهز النفق");
  return tunnelState();
}
export function stopTunnel() { const c = child; child = undefined; c?.kill(); Object.assign(tunnel, { state: "off", url: undefined, error: undefined, provider: undefined }); return tunnelState(); }

/* ---------- مفاتيح خدمات الصور (تُخزَّن محلياً بصلاحيات مقيّدة ولا تُرسَل للواجهة) ---------- */
export async function setKeys(k: { pexels?: string; openai?: string; imageModel?: string }) {
  const s = await getSettings();
  if (k.pexels !== undefined) s.pexelsKey = k.pexels.trim() || undefined;
  if (k.openai !== undefined) s.openaiKey = k.openai.trim() || undefined;
  if (k.imageModel !== undefined) s.imageModel = k.imageModel.trim() || undefined;
  await persist();
}
export async function keyStatus() { const s = await getSettings(); return { pexels: !!s.pexelsKey, openai: !!s.openaiKey, imageModel: s.imageModel ?? "gpt-image-1" }; }
