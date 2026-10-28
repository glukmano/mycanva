import { contrast, readableOn } from "../core/palette.js";
import { FORMATS, type Brand, type Element } from "../core/types.js";

import { M, chrome, mirror, type Content, type Ctx, type Template } from "./common.js";
import { MORE_TEMPLATES } from "./more.js";
import { isLandscape, landscape } from "./landscape.js";
export type { Content, Template } from "./common.js";

const announcement: Template = {
  id: "announcement", label: "إعلان / عنوان رئيسي", fields: ["badge", "title", "subtitle", "cta", "icon"],
  build(ctx) {
    const { w, h, c } = ctx; const story = h / w > 1.6;
    const els: Element[] = [{ type: "shape", kind: "circle", x: -w * 0.25, y: h * 0.62, w: w * 0.8, h: w * 0.8, fill: "primary", opacity: 0.1 } as Element, ...chrome(ctx, false)];
    const titleY = story ? h * 0.3 : h * 0.26;
    if (c.badge) els.push({ type: "shape", kind: "pill", x: w - M - (60 + c.badge.length * 26), y: titleY - 110, w: 60 + c.badge.length * 26, h: 64, fill: "accent" } as Element, { type: "text", x: w - M - (60 + c.badge.length * 26), y: titleY - 110, w: 60 + c.badge.length * 26, h: 64, text: c.badge, font: "heading", size: 30, weight: 800, color: readableOn(ctx.brand.colors.accent), align: "center", valign: "middle", fit: true } as Element);
    const tSize = story ? 118 : 104;
    const lines = Math.min(4, Math.max(1, Math.ceil((c.title.length * tSize * 0.5) / (w - M * 2))));
    const tH = lines * tSize * 1.2 + 20;
    els.push({ type: "text", x: M, y: titleY, w: w - M * 2, h: tH, text: c.title, font: "heading", size: tSize, weight: 800, color: "text", lineHeight: 1.2 } as Element);
    if (c.subtitle) els.push({ type: "text", x: M, y: titleY + tH + 30, w: w - M * 2, h: h * 0.14, text: c.subtitle, font: "body", size: 46, weight: 400, color: "muted", lineHeight: 1.5 } as Element);
    if (c.cta) els.push({ type: "shape", kind: "pill", x: M, y: h - M - 112, w: Math.min(w - M * 2, 120 + c.cta.length * 30), h: 112, fill: "primary" } as Element, { type: "text", x: M, y: h - M - 112, w: Math.min(w - M * 2, 120 + c.cta.length * 30), h: 112, text: c.cta, font: "heading", size: 42, weight: 700, color: "onPrimary", align: "center", valign: "middle" } as Element);
    if (c.icon) els.push({ type: "icon", name: c.icon, x: w - M - 150, y: h - M - 150, size: 150, color: "primary", strokeWidth: 1.5 } as Element);
    return els;
  },
};

const quote: Template = {
  id: "quote", label: "اقتباس", fields: ["title", "author"],
  build(ctx) {
    const { brand, w, h, c } = ctx;
    // هوية داكنة: خلفية الهوية نفسها مع لمسة الأساسي. هوية فاتحة: تدرّج الأساسي ← الثانوي
    const darkBrand = readableOn(brand.colors.bg) === "#FFFFFF";
    const els: Element[] = [darkBrand
      ? { type: "shape", kind: "rect", x: 0, y: 0, w, h, fill: "surface", gradient: { from: "surface", to: "bg", angle: 160 } } as Element
      : { type: "shape", kind: "rect", x: 0, y: 0, w, h, fill: "primary", gradient: { from: "primary", to: "secondary", angle: 160 } } as Element, ...chrome(ctx, !darkBrand)];
    const mark = darkBrand ? "primary" : contrast(brand.colors.accent, brand.colors.primary) >= 3 && contrast(brand.colors.accent, brand.colors.secondary) >= 3 ? "accent" : "onPrimary";
    const ink = darkBrand ? "text" : "onPrimary";
    const top = Math.max(M + 120, (h - 720) / 2);
    els.push({ type: "icon", name: "quote", x: M, y: top, size: 140, color: mark, strokeWidth: 1.6 } as Element);
    els.push({ type: "text", x: M, y: top + 190, w: w - M * 2, h: 400, text: c.title, font: "heading", size: 78, weight: 700, color: ink, lineHeight: 1.4 } as Element);
    if (c.author) els.push({ type: "shape", kind: "rect", x: M, y: top + 630, w: 90, h: 6, fill: mark } as Element, { type: "text", x: M, y: top + 660, w: w - M * 2, h: 90, text: c.author, font: "body", size: 44, weight: 700, color: ink, opacity: 0.9 } as Element);
    return els;
  },
};

const offer: Template = {
  id: "offer", label: "عرض / خصم", fields: ["badge", "title", "subtitle", "cta"],
  build(ctx) {
    const { w, h, c } = ctx;
    const els: Element[] = [...chrome(ctx, false)];
    const d = Math.min(w * 0.55, h * 0.4), cy = M + 100, cx = (w - d) / 2;
    els.push({ type: "shape", kind: "circle", x: cx, y: cy, w: d, h: d, fill: "primary", gradient: { from: "primary", to: "secondary", angle: 135 } } as Element);
    els.push({ type: "shape", kind: "circle", x: cx + d * 0.76, y: cy - d * 0.04, w: d * 0.26, h: d * 0.26, fill: "accent" } as Element);
    if (c.badge) els.push({ type: "text", x: cx + 30, y: cy + d * 0.2, w: d - 60, h: d * 0.6, text: c.badge, font: "heading", size: d * 0.4, weight: 800, color: "onPrimary", align: "center", valign: "middle" } as Element);
    const ty = cy + d + 44;
    els.push({ type: "text", x: M, y: ty, w: w - M * 2, h: 150, text: c.title, font: "heading", size: 76, weight: 800, color: "text", align: "center", lineHeight: 1.25, valign: "middle" } as Element);
    if (c.subtitle) els.push({ type: "text", x: M, y: ty + 160, w: w - M * 2, h: 70, text: c.subtitle, font: "body", size: 40, weight: 400, color: "muted", align: "center" } as Element);
    if (c.cta) els.push({ type: "shape", kind: "pill", x: (w - 640) / 2, y: h - M - 100, w: 640, h: 100, fill: "text" } as Element, { type: "text", x: (w - 640) / 2, y: h - M - 100, w: 640, h: 100, text: c.cta, font: "heading", size: 40, weight: 700, color: "bg", align: "center", valign: "middle" } as Element);
    return els;
  },
};

/** تخطيطات للمقاسات المتطرفة: شريط أفقي (بانرات/أغلفة) وعمودي ضيق (سكاي سكرابر) */
function strip(ctx: Ctx, dark: boolean): Element[] {
  const { brand, w, h, c } = ctx;
  const rtl = brand.direction === "rtl";
  const X = (x: number, width: number) => Math.round(rtl ? w - x - width : x); // x من جهة البداية
  const tall = h / w > 1;
  const textColor = dark ? "onPrimary" : "text", subColor = dark ? "onPrimary" : "muted";
  const els: Element[] = dark
    ? [{ type: "shape", kind: "rect", x: 0, y: 0, w, h, fill: "primary", gradient: { from: "primary", to: "secondary", angle: 135 } } as Element]
    : [{ type: "shape", kind: "rect", x: X(0, Math.min(w, h) * 0.06), y: 0, w: Math.min(w, h) * 0.06, h, fill: "accent" } as Element];
  const logo = brand.logo.default ? (dark && brand.logo.light ? "light" : "default") : null;
  if (!tall) {
    const pad = h * 0.16, gap = pad * 1.4, logoH = h * 0.4, logoW = logo ? Math.min(w * 0.2, logoH * 3.6) : 0;
    const ctaH = h * 0.42, ctaW = c.cta ? Math.min(w * 0.26, ctaH * (1.3 + c.cta.length * 0.3)) : 0;
    let x = pad * 1.6;
    if (logo) { els.push({ type: "logo", x: X(x, logoW), y: Math.round((h - logoH) / 2), w: Math.round(logoW), h: Math.round(logoH), variant: logo, align: "start" } as Element); x += logoW + gap; }
    const tw = w - x - pad * 1.6 - (ctaW ? ctaW + gap : 0);
    const tSize = Math.round(h * (c.subtitle ? 0.24 : 0.3)), tH = c.subtitle ? h * 0.46 : h * 0.7;
    const top = c.subtitle ? h * 0.14 : h * 0.15;
    els.push({ type: "text", x: X(x, tw), y: Math.round(top), w: Math.round(tw), h: Math.round(tH), text: c.title, font: "heading", size: tSize, weight: 800, color: textColor, valign: "middle", lineHeight: 1.2 } as Element);
    if (c.subtitle) els.push({ type: "text", x: X(x, tw), y: Math.round(top + tH + h * 0.02), w: Math.round(tw), h: Math.round(h * 0.26), text: c.subtitle, font: "body", size: Math.round(h * 0.14), weight: 400, color: subColor, opacity: dark ? 0.85 : 1, valign: "top" } as Element);
    if (c.cta) els.push({ type: "shape", kind: "pill", x: Math.round(rtl ? pad * 1.6 : w - pad * 1.6 - ctaW), y: Math.round((h - ctaH) / 2), w: Math.round(ctaW), h: Math.round(ctaH), fill: dark ? "accent" : "primary" } as Element,
      { type: "text", x: Math.round(rtl ? pad * 1.6 : w - pad * 1.6 - ctaW), y: Math.round((h - ctaH) / 2), w: Math.round(ctaW), h: Math.round(ctaH), text: c.cta, font: "heading", size: Math.round(ctaH * 0.42), weight: 700, color: dark ? readableOn(brand.colors.accent) : "onPrimary", align: "center", valign: "middle" } as Element);
  } else {
    const pad = w * 0.1, iw = w - pad * 2;
    if (logo) els.push({ type: "logo", x: Math.round(pad), y: Math.round(pad), w: Math.round(iw), h: Math.round(w * 0.22), variant: logo, align: "center" } as Element);
    els.push({ type: "text", x: Math.round(pad), y: Math.round(h * 0.2), w: Math.round(iw), h: Math.round(h * 0.4), text: c.title, font: "heading", size: Math.round(w * 0.2), weight: 800, color: textColor, align: "center", valign: "middle", lineHeight: 1.25 } as Element);
    if (c.subtitle) els.push({ type: "text", x: Math.round(pad), y: Math.round(h * 0.62), w: Math.round(iw), h: Math.round(h * 0.14), text: c.subtitle, font: "body", size: Math.round(w * 0.11), weight: 400, color: subColor, align: "center" } as Element);
    if (c.cta) els.push({ type: "shape", kind: "pill", x: Math.round(pad), y: Math.round(h - pad - w * 0.28), w: Math.round(iw), h: Math.round(w * 0.28), fill: dark ? "accent" : "primary" } as Element,
      { type: "text", x: Math.round(pad), y: Math.round(h - pad - w * 0.28), w: Math.round(iw), h: Math.round(w * 0.28), text: c.cta, font: "heading", size: Math.round(w * 0.12), weight: 700, color: dark ? readableOn(brand.colors.accent) : "onPrimary", align: "center", valign: "middle" } as Element);
  }
  return els;
}
const isExtreme = (w: number, h: number) => w / h > 2.4 || h / w > 2.2;

export const TEMPLATES: Record<string, Template> = { announcement, quote, offer, ...MORE_TEMPLATES };

export function buildFromTemplate(templateId: string, brand: Brand, format: string, content: Content, size?: { w: number; h: number }): Element[] {
  const t = TEMPLATES[templateId];
  if (!t) throw new Error(`قالب غير معروف: ${templateId} (المتاح: ${Object.keys(TEMPLATES).join(", ")})`);
  const f = size ?? FORMATS[format] ?? FORMATS.post;
  const ctx = { brand, w: f.w, h: f.h, c: content };
  if (isExtreme(f.w, f.h)) return strip(ctx, templateId === "quote"); // strip يراعي الاتجاه بنفسه
  const els = isLandscape(f.w, f.h) ? landscape(templateId, ctx) : t.build(ctx);
  return brand.direction === "ltr" ? mirror(els, f.w) : els;
}
