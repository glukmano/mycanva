import { contrast } from "./palette.js";
import { designSize } from "./designs.js";
import { resolveColor } from "./render.js";
import type { Brand, Design, Element } from "./types.js";

export interface Issue { level: "error" | "warn" | "info"; code: string; message: string; index?: number }

const isHex = (c: string) => /^#[0-9a-f]{3,8}$/i.test(c);
const box = (e: Element) => e.type === "icon" || e.type === "qr" ? { x: e.x, y: e.y, w: e.size, h: e.size } : { x: e.x, y: e.y, w: "w" in e ? e.w : 0, h: "h" in e ? e.h : 0 };

/** فحص ثابت لمطابقة التصميم للهوية وقواعد الجودة (بدون رندر) */
export function lintDesign(d: Design, brand: Brand): Issue[] {
  const { w: W, h: H } = designSize(d), issues: Issue[] = [];
  const add = (level: Issue["level"], code: string, message: string, index?: number) => issues.push({ level, code, message, index });
  const palette = new Set([...Object.values(brand.colors).flat().filter((v): v is string => typeof v === "string")].map((c) => c.toLowerCase()));
  const story = H / W >= 1.7;

  d.elements.forEach((e, i) => {
    const b = box(e), full = b.w >= W * 0.97 && b.h >= H * 0.97, decor = e.type === "shape" && (e.blur || e.gradient?.kind === "radial"); // توهجات زخرفية
    // خارج حدود الصفحة
    if (!full && !decor && e.type !== "pattern" && (b.x < -W * 0.02 || b.y < -H * 0.02 || b.x + b.w > W * 1.02 || b.y + b.h > H * 1.02)) add("warn", "bounds", "العنصر يخرج عن حدود التصميم", i);
    // ألوان خارج الهوية
    const colors = [("fill" in e ? e.fill : undefined), ("color" in e ? e.color : undefined), ("stroke" in e ? e.stroke : undefined), e.type === "qr" ? e.fg : undefined].filter((c): c is string => !!c && c !== "transparent");
    for (const c of colors) if (!decor && isHex(c) && !palette.has(c.toLowerCase())) add("info", "off-brand-color", `لون خارج الهوية: ${c}`, i);

    if (e.type === "text") {
      if (!e.text.trim()) add("warn", "empty-text", "نص فارغ", i);
      if (e.size < (e.color === "muted" ? Math.max(18, W * 0.016) : Math.max(22, W * 0.022))) add("warn", "small-text", `حجم الخط صغير (${Math.round(e.size)}px) وقد لا يُقرأ على الجوال`, i);
      // التباين: نبحث عن أقرب شكل تحت النص يحتوي مركزه
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2; let bgs = [resolveColor(brand, d.background)];
      for (let j = i - 1; j >= 0; j--) {
        const s = d.elements[j]; if (s.type !== "shape" || (s.opacity ?? 1) < 0.6) continue;
        const sb = box(s); if (cx >= sb.x && cx <= sb.x + sb.w && cy >= sb.y && cy <= sb.y + sb.h) { bgs = s.gradient ? [resolveColor(brand, s.gradient.from), resolveColor(brand, s.gradient.to)] : [resolveColor(brand, s.fill)]; break; }
      }
      const fg = resolveColor(brand, e.color), large = e.size >= 56 || (e.size >= 42 && e.weight >= 700), min = large ? 3 : 4.5;
      try { const worst = Math.min(...bgs.filter(isHex).map((bg) => contrast(fg, bg))); if (isFinite(worst) && worst < min) add("warn", "contrast", `تباين النص ضعيف (${worst.toFixed(1)} من ${min})`, i); } catch {}
    }
    if (e.type === "logo" && b.h < Math.max(36, W * 0.03)) add("info", "small-logo", "الشعار صغير جداً", i);
    if (e.type === "qr") {
      if (e.size < Math.max(180, W * 0.16)) add("warn", "qr-small", `الـ QR صغير (${Math.round(e.size)}px) وقد يصعب مسحه`, i);
      const bg = e.bg === "transparent" ? resolveColor(brand, d.background) : resolveColor(brand, e.bg);
      try { const c = contrast(resolveColor(brand, e.fg), bg); if (c < 3) add("error", "qr-contrast", `تباين الـ QR ضعيف (${c.toFixed(1)})`, i); } catch {}
    }
    // منطقة ستوري الآمنة (واجهة التطبيق تغطي أعلى وأسفل الشاشة)
    if (story && (e.type === "text" || e.type === "logo" || e.type === "qr" || e.type === "icon") && !full) {
      if (b.y < H * 0.1 && e.type !== "icon") add("info", "story-top", "داخل منطقة أعلى الستوري التي قد تغطيها واجهة التطبيق", i);
      else if (b.y + b.h > H * 0.9) add("info", "story-bottom", "داخل منطقة أسفل الستوري التي قد يغطيها شريط الرد", i);
    }
  });
  if (brand.logo.default && !d.elements.some((e) => e.type === "logo")) add("info", "no-logo", "لا يوجد شعار الهوية في التصميم");
  const order = { error: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}
