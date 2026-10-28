import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSettings } from "../settings.js";
import { assertPublicUrl } from "./extract.js";
import { ASSETS_DIR } from "./paths.js";

const safe = (n: string) => n.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "image";
async function save(buf: Buffer, base: string, ext: string) {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  const name = `${safe(base)}-${Date.now().toString(36)}.${ext}`; await fs.writeFile(path.join(ASSETS_DIR, name), buf); return name;
}
const assetPath = (name: string) => { const f = path.resolve(ASSETS_DIR, name); if (!f.startsWith(ASSETS_DIR + path.sep)) throw new Error("مسار غير صالح"); return f; };

/** إزالة خلفية بلون موحّد: نملأ من الحواف بالألوان القريبة من لون الزوايا ثم نُنعّم الحافة. لا يصلح للخلفيات المتدرجة/المعقدة */
export async function removeBackground(asset: string, tolerance = 32): Promise<string> {
  const { data, info } = await sharp(assetPath(asset)).rotate().resize(2000, 2000, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info, px = (x: number, y: number) => (y * W + x) * 4;
  const corners = [px(0, 0), px(W - 1, 0), px(0, H - 1), px(W - 1, H - 1)].map((i) => [data[i], data[i + 1], data[i + 2]]);
  const bg = [0, 1, 2].map((c) => corners.map((k) => k[c]).sort((a, b) => a - b)[1]); // وسيط الزوايا
  const tol2 = tolerance * tolerance, near = (i: number) => (data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2 <= tol2;
  const seen = new Uint8Array(W * H), stack: number[] = [];
  const push = (x: number, y: number) => { const k = y * W + x; if (!seen[k] && near(k * 4)) { seen[k] = 1; stack.push(k); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); } for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const k = stack.pop()!, x = k % W, y = (k / W) | 0; if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1); }
  const removed = seen.reduce((s, v) => s + v, 0);
  if (removed < W * H * 0.03) throw new Error("لم أجد خلفية بلون موحّد قابلة للإزالة. جرّب رفع التسامح أو صورة بخلفية سادة");
  if (removed > W * H * 0.97) throw new Error("التسامح عالٍ جداً: كاد يمسح الصورة كلها");
  const alpha = Buffer.alloc(W * H); for (let k = 0; k < W * H; k++) alpha[k] = seen[k] ? 0 : 255;
  const soft = await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(0.9).extractChannel(0).raw().toBuffer(); // حافة ناعمة (قناة واحدة)
  for (let k = 0; k < W * H; k++) data[k * 4 + 3] = soft[k];
  const out = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  return save(out, path.parse(asset).name + "-nobg", "png");
}

export async function cropAsset(asset: string, o: { left: number; top: number; width: number; height: number }): Promise<string> {
  const out = await sharp(assetPath(asset)).rotate().extract({ left: Math.round(o.left), top: Math.round(o.top), width: Math.round(o.width), height: Math.round(o.height) }).toBuffer();
  return save(out, path.parse(asset).name + "-crop", "png");
}

/* ---------- صور مجانية (Pexels) ---------- */
export interface StockPhoto { id: number; thumb: string; full: string; by: string; page: string; alt: string }
export async function searchStock(q: string, page = 1): Promise<StockPhoto[]> {
  const key = (await getSettings()).pexelsKey; if (!key) throw new Error("أضف مفتاح Pexels من الإعدادات / عام (مجاني من pexels.com/api)");
  if (!q.trim()) throw new Error("اكتب كلمة للبحث");
  const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=24&page=${page}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(12000) });
  if (r.status === 401) throw new Error("مفتاح Pexels غير صحيح");
  if (!r.ok) throw new Error(`Pexels: ${r.status}`);
  const j = await r.json() as { photos: { id: number; src: { medium: string; large2x: string }; photographer: string; url: string; alt?: string }[] };
  return j.photos.map((p) => ({ id: p.id, thumb: p.src.medium, full: p.src.large2x, by: p.photographer, page: p.url, alt: p.alt ?? "" }));
}
export async function importStock(url: string, name = "stock"): Promise<string> {
  const u = assertPublicUrl(url); if (u.hostname !== "images.pexels.com") throw new Error("المصدر غير مسموح");
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("تعذّر تنزيل الصورة");
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 12_000_000) throw new Error("الصورة كبيرة");
  return save(await sharp(buf).rotate().resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(), name, "jpg");
}

/* ---------- توليد صور بالذكاء الاصطناعي (OpenAI Images) — يستهلك رصيد حسابك ---------- */
export async function generateImage(prompt: string, size: "1024x1024" | "1024x1536" | "1536x1024" = "1024x1024"): Promise<string> {
  const s = await getSettings(); if (!s.openaiKey) throw new Error("أضف مفتاح OpenAI من الإعدادات / عام");
  if (!prompt.trim() || prompt.length > 3000) throw new Error("اكتب وصفاً (حتى 3000 حرف)");
  const r = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${s.openaiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: s.imageModel ?? "gpt-image-1", prompt, size, n: 1 }), signal: AbortSignal.timeout(180000) });
  const j = await r.json().catch(() => ({})) as { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } };
  if (!r.ok) throw new Error(`OpenAI: ${j.error?.message ?? r.status}`);
  const d = j.data?.[0]; let buf: Buffer;
  if (d?.b64_json) buf = Buffer.from(d.b64_json, "base64"); else if (d?.url) buf = Buffer.from(await (await fetch(d.url)).arrayBuffer()); else throw new Error("لم يرجع المزوّد صورة");
  return save(buf, "ai", "png");
}
