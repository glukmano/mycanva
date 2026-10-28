import sharp from "sharp";
import { availableFonts } from "./fonts.js";
import { contrast, generatePalette, readableOn } from "./palette.js";
import type { Brand } from "./types.js";

type RGB = [number, number, number];
const hex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const sat = ([r, g, b]: RGB) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const lum = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** ألوان سائدة في صورة (k-means بسيط على عيّنة مصغّرة). يتجاهل الشفاف */
export async function dominantColors(input: Buffer, k = 6): Promise<{ color: string; share: number }[]> {
  const { data, info } = await sharp(input, { density: 200 }).resize(96, 96, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  if (px.length < 10) return [];
  // تهيئة بنقاط متباعدة
  const cent: RGB[] = [px[Math.floor(px.length / 2)]];
  while (cent.length < Math.min(k, px.length)) { let best = px[0], bd = -1; for (let i = 0; i < px.length; i += 7) { const p = px[i], d = Math.min(...cent.map((c) => (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2)); if (d > bd) { bd = d; best = p; } } cent.push(best); }
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 8; it++) {
    px.forEach((p, i) => { let b = 0, bd = Infinity; cent.forEach((c, j) => { const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2; if (d < bd) { bd = d; b = j; } }); assign[i] = b; });
    cent.forEach((_, j) => { const m = px.filter((_, i) => assign[i] === j); if (m.length) cent[j] = [0, 1, 2].map((ch) => m.reduce((s, p) => s + p[ch], 0) / m.length) as RGB; });
  }
  const counts = cent.map((_, j) => assign.filter((a) => a === j).length);
  return cent.map((c, j) => ({ color: hex(c), share: counts[j] / px.length })).filter((x) => x.share > 0.01).sort((a, b) => b.share - a.share);
}

export interface Suggestion { colors: Brand["colors"]; swatches: string[]; fonts?: { heading?: string; body?: string; found: string[] }; title?: string; logoUrl?: string }

/** يقترح هوية من ألوان سائدة: الأساسي = الأكثر تشبّعاً وظهوراً، والباقي يُولَّد */
export function suggestFromColors(found: { color: string; share: number }[], dark = false): Suggestion {
  const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
  const colorful = found.filter((f) => sat(rgb(f.color)) > 0.25 && lum(rgb(f.color)) > 0.12 && lum(rgb(f.color)) < 0.9);
  const primary = (colorful.sort((a, b) => b.share * sat(rgb(b.color)) - a.share * sat(rgb(a.color)))[0] ?? found[0])?.color ?? "#1E6FD9";
  const second = colorful.find((c) => c.color !== primary && contrast(c.color, primary) > 1.3)?.color;
  const neutrals = found.filter((f) => sat(rgb(f.color)) <= 0.25).map((f) => f.color);
  const colors = generatePalette(primary, { secondary: second, dark });
  const ink = neutrals.find((n) => lum(rgb(n)) < 0.25);
  if (ink && contrast(ink, colors.bg) >= 7) colors.text = ink;
  colors.onPrimary = readableOn(colors.primary);
  return { colors, swatches: found.slice(0, 8).map((f) => f.color) };
}

const GOOGLE_OK = new Set(availableFonts.map((f) => f.toLowerCase()));
function pickFonts(names: string[]) {
  const known = names.filter((n) => GOOGLE_OK.has(n.toLowerCase())).map((n) => availableFonts.find((f) => f.toLowerCase() === n.toLowerCase())!);
  return { heading: known[0], body: known[1] ?? known[0], found: names };
}

/** هل العنوان عام وآمن للجلب من هذا الجهاز؟ (يمنع الشبكة الداخلية) */
export function assertPublicUrl(raw: string): URL {
  const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!/^https?:$/.test(u.protocol)) throw new Error("الرابط يجب أن يكون http أو https");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(h)) throw new Error("عناوين الشبكة الداخلية غير مسموحة");
  return u;
}
async function get(url: URL, max = 2_000_000): Promise<{ buf: Buffer; type: string }> {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(10000), headers: { "user-agent": "Mozilla/5.0 MyCanva-brand-extractor" } });
  if (!r.ok) throw new Error(`تعذّر جلب ${url.hostname} (${r.status})`);
  assertPublicUrl(r.url); // بعد التحويلات
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > max) throw new Error("الملف كبير");
  return { buf, type: r.headers.get("content-type") ?? "" };
}

/** يستخرج اقتراح هوية من موقع: theme-color + ألوان CSS + شعار/أيقونة + أسماء الخطوط */
export async function suggestFromUrl(raw: string): Promise<Suggestion> {
  const url = assertPublicUrl(raw), { buf } = await get(url, 3_000_000), html = buf.toString("utf8");
  const title = html.match(/<title[^>]*>([^<]{1,80})/i)?.[1]?.trim();
  const attr = (re: RegExp) => html.match(re)?.[1];
  const theme = attr(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{6})["']/i) ?? attr(/<meta[^>]+content=["'](#[0-9a-f]{6})["'][^>]+name=["']theme-color["']/i);
  // خطوط
  const fams = new Set<string>();
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"']+(?:,[^;}"']+)*)/gi)) for (const n of m[1].split(",")) { const c = n.trim().replace(/["']/g, ""); if (c && !/^(sans-serif|serif|monospace|system-ui|inherit|initial|-apple-system|blinkmacsystemfont)$/i.test(c)) fams.add(c); }
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^&"']+)/gi)) for (const n of decodeURIComponent(m[1]).split("|")) fams.add(n.split(":")[0].replace(/\+/g, " "));
  // شعار: apple-touch-icon > icon > og:image
  const cand = [attr(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i), attr(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i), attr(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i), "/favicon.ico"].filter(Boolean) as string[];
  let found: { color: string; share: number }[] = [], logoUrl: string | undefined;
  for (const c of cand) {
    try { const u = new URL(c, url); assertPublicUrl(u.href); const { buf: img } = await get(u, 3_000_000); found = await dominantColors(img); if (found.length) { logoUrl = u.href; break; } } catch {}
  }
  if (theme) found = [{ color: theme.toUpperCase(), share: 0.5 }, ...found];
  for (const m of html.matchAll(/#([0-9a-f]{6})\b/gi)) if (found.length < 12) found.push({ color: "#" + m[1].toUpperCase(), share: 0.001 });
  if (!found.length) throw new Error("لم أجد ألواناً في هذا الموقع");
  const s = suggestFromColors(found.slice(0, 12)); const f = pickFonts([...fams].slice(0, 8));
  return { ...s, fonts: f, title, logoUrl };
}
