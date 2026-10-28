import { contrast, readableOn } from "../core/palette.js";
import type { Element } from "../core/types.js";
import { estH, hero, txt, type Ctx } from "./common.js";

const pill = (x: number, y: number, w: number, h: number, fill: string): Element => ({ type: "shape", kind: "pill", x, y, w, h, fill } as Element);
const DARK = new Set(["quote", "event", "countdown", "qr-card"]);
const NO_VISUAL = new Set(["quote", "checklist", "testimonial"]);
export const isLandscape = (w: number, h: number) => w / h > 1.2;

/** تخطيط أفقي: عمود نص من جهة البداية + عنصر بصري من الجهة الأخرى. يُبنى بتخطيط RTL ثم يُعكس للهويات LTR */
export function landscape(id: string, ctx: Ctx): Element[] {
  const { brand, w, h, c } = ctx, hr = hero(ctx), dark = DARK.has(id);
  const P = Math.round(h * 0.09), hasVisual = !NO_VISUAL.has(id), TW = hasVisual ? Math.round(w * 0.54) : w - P * 2, tx = w - P - TW;
  const ink = dark ? hr.ink : "text", soft = dark ? hr.soft : "muted", mark = dark ? hr.mark : "primary", onMark = dark ? hr.onMark : "onPrimary";
  const els: Element[] = dark ? [hr.bg] : [];
  if (brand.logo.default) els.push({ type: "logo", x: tx, y: Math.round(P * 0.75), w: TW, h: Math.round(Math.min(64, h * 0.09)), align: "start", variant: dark && hr.dark && brand.logo.light ? "light" : "default" } as Element);

  // عمود النص: نبني قائمة عناصر بارتفاعاتها ثم نوسّطها عمودياً
  const tSize = Math.round(Math.min(h * 0.125, 92)), stack: { h: number; make: (y: number) => Element[]; gap?: number }[] = [];
  const text = (t: string, size: number, o: object = {}, lh = 1.25, lines = 4) => { const hh = estH(t, size, TW, lh, lines); stack.push({ h: hh, make: (y) => [txt({ x: tx, y, w: TW, h: hh, text: t, size, lineHeight: lh, ...o } as never)] }); };
  if (c.badge && id !== "offer" && id !== "stat") { const bw = 70 + c.badge.length * 24; stack.push({ h: 56, gap: 16, make: (y) => [pill(w - P - bw, y, bw, 56, dark ? mark : "accent"), txt({ x: w - P - bw, y, w: bw, h: 56, text: c.badge!, font: "heading", size: 26, weight: 800, color: dark ? onMark : readableOn(brand.colors.accent), align: "center", valign: "middle" })] }); }
  if (id === "countdown" || id === "stat") { /* الرقم في العنصر البصري */ }
  text(c.title, id === "quote" ? Math.round(tSize * 0.78) : tSize, { font: "heading", weight: id === "quote" ? 700 : 800, color: ink }, id === "quote" ? 1.4 : 1.2);
  if (c.subtitle) text(c.subtitle, Math.round(tSize * 0.4), { weight: 400, color: soft, opacity: dark ? 0.85 : 1 }, 1.45, 3);
  if (id === "quote" && c.author) text(c.author, Math.round(tSize * 0.42), { weight: 700, color: ink }, 1.3, 1);
  if (id === "testimonial" && c.author) text(c.author, Math.round(tSize * 0.46), { font: "heading", weight: 800, color: "text" }, 1.3, 1);
  if (id === "checklist") for (const it of (c.items ?? []).slice(0, 4)) stack.push({ h: 58, gap: 8, make: (y) => [
    { type: "shape", kind: "circle", x: w - P - 40, y: y + 9, w: 40, h: 40, fill: "primary" } as Element, { type: "icon", name: "check", x: w - P - 40 + 9, y: y + 18, size: 22, color: "onPrimary", strokeWidth: 3 } as Element,
    txt({ x: tx, y, w: TW - 60, h: 58, text: it, size: Math.round(tSize * 0.36), weight: 600, valign: "middle" })] });
  if (id === "event") for (const [ic, val] of [["calendar-days", c.date], ["map-pin", c.place]] as const) if (val) stack.push({ h: 64, gap: 12, make: (y) => [
    { type: "shape", kind: "circle", x: w - P - 56, y: y + 4, w: 56, h: 56, fill: mark } as Element, { type: "icon", name: ic, x: w - P - 56 + 14, y: y + 18, size: 28, color: onMark, strokeWidth: 2 } as Element,
    txt({ x: tx, y, w: TW - 76, h: 64, text: val, font: "heading", size: Math.round(tSize * 0.4), weight: 700, color: ink, valign: "middle" })] });
  if (c.cta) { const cw = Math.min(TW, 130 + c.cta.length * 26); stack.push({ h: 84, make: (y) => [pill(w - P - cw, y, cw, 84, dark ? mark : id === "product" ? "text" : "primary"), txt({ x: w - P - cw, y, w: cw, h: 84, text: c.cta!, font: "heading", size: 34, weight: 700, color: dark ? onMark : id === "product" ? "bg" : "onPrimary", align: "center", valign: "middle" })] }); }
  const gap = Math.round(h * 0.035), total = stack.reduce((s, it) => s + it.h + (it.gap ?? gap), -gap);
  let y = Math.max(P * 0.75 + 80, (h - total) / 2);
  for (const it of stack) { els.push(...it.make(Math.round(y))); y += it.h + (it.gap ?? gap); }

  // العنصر البصري
  if (hasVisual) {
    const vx = P, vw = w - TW - P * 3, vh = h - P * 2, s = Math.round(Math.min(vw, vh * 0.92)), x = Math.round(vx + (vw - s) / 2), yy = Math.round((h - s) / 2);
    const disc = (iconName?: string, label?: string) => { els.push(dark ? { type: "shape", kind: "circle", x, y: yy, w: s, h: s, fill: "surface" } as Element : { type: "shape", kind: "circle", x, y: yy, w: s, h: s, fill: "primary", gradient: { from: "primary", to: "secondary", angle: 135 } } as Element);
      if (label) els.push(txt({ x, y: yy, w: s, h: s, text: label, font: "heading", size: Math.round(s * 0.34), weight: 800, color: "onPrimary", align: "center", valign: "middle" }));
      else if (iconName) els.push({ type: "icon", name: iconName, x: x + s * 0.27, y: yy + s * 0.27, size: Math.round(s * 0.46), color: dark ? "primary" : "onPrimary", strokeWidth: 1.6 } as Element); };
    if (id === "offer") disc(undefined, c.badge ?? "%");
    else if (id === "announcement") disc(c.icon ?? "sparkles");
    else if (id === "tip") disc(c.icon ?? "lightbulb");
    else if (id === "event") disc("calendar-days");
    else if (id === "stat" || id === "countdown") { els.push({ type: "shape", kind: "rect", x, y: yy, w: s, h: s, fill: "surface", radius: Math.round(s * 0.2) } as Element, txt({ x, y: yy, w: s, h: s, text: c.number ?? (id === "stat" ? "100%" : "7"), font: "heading", size: Math.round(s * (String(c.number ?? "").length > 3 ? 0.3 : 0.5)), weight: 800, color: "primary", align: "center", valign: "middle", lineHeight: 1 })); }
    else if (id === "product") { els.push(c.image ? { type: "image", src: c.image, x, y: yy, w: s, h: s, fit: "cover", radius: Math.round(s * 0.08) } as Element : { type: "shape", kind: "rect", x, y: yy, w: s, h: s, fill: "primary", radius: Math.round(s * 0.08), gradient: { from: "primary", to: "secondary", angle: 135 } } as Element); if (!c.image) els.push({ type: "icon", name: "package", x: x + s * 0.3, y: yy + s * 0.3, size: Math.round(s * 0.4), color: "onPrimary", strokeWidth: 1.4 } as Element); }
    else if (id === "qr-card") { els.push({ type: "shape", kind: "rect", x, y: yy, w: s, h: s, fill: "surface", radius: Math.round(s * 0.09) } as Element, { type: "qr", data: c.qr ?? "https://example.com", x: Math.round(x + s * 0.08), y: Math.round(yy + s * 0.08), size: Math.round(s * 0.84), dots: "rounded", eyeOuter: "rounded", eyeInner: "rounded", fg: "text", eyeColor: "primary", bg: "surface", margin: 0, ec: "Q", logoScale: 0.22, angle: 135, bgRadius: 0 } as Element); }
  } else if (id === "testimonial") {
    els.unshift({ type: "shape", kind: "rect", x: P, y: P * 1.6, w: w - P * 2, h: h - P * 3.2, fill: "surface", radius: 36 } as Element);
  } else if (id === "quote") els.push({ type: "icon", name: "quote", x: w - P - 90, y: Math.round(P * 1.5), size: 90, color: contrast(brand.colors.accent, brand.colors.primary) >= 3 || hr.mark === "primary" ? hr.mark : "onPrimary", strokeWidth: 1.6 } as Element);
  return els;
}
