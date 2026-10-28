import { readableOn } from "../core/palette.js";
import type { Brand, Design, Element } from "../core/types.js";
import { M, chrome, hero, mirror, txt } from "./common.js";

export interface CarouselContent {
  cover: { title: string; subtitle?: string; badge?: string };
  slides: { title: string; body?: string; icon?: string }[];
  outro?: { title: string; subtitle?: string; cta?: string };
}

const pill = (x: number, y: number, w: number, h: number, fill: string): Element => ({ type: "shape", kind: "pill", x, y, w, h, fill } as Element);

/** عناصر المؤشر (رقم الشريحة + شريط التقدّم). تُعرَّف بـ id ثابت ليُعاد ترقيمها عند إضافة/حذف/نقل الشرائح */
export function pager(brand: Brand, w: number, h: number, i: number, n: number, dark = false): Element[] {
  const rtl = brand.direction === "rtl", bw = w - M * 2, y = h - M - 10;
  const fillW = Math.max(24, Math.round((bw * (i + 1)) / n));
  return [
    { type: "shape", id: "track", kind: "rect", x: M, y, w: bw, h: 10, fill: dark ? "onPrimary" : "muted", radius: 5, opacity: 0.25 } as Element,
    { type: "shape", id: "progress", kind: "rect", x: rtl ? M + bw - fillW : M, y, w: fillW, h: 10, fill: dark ? "onPrimary" : "primary", radius: 5 } as Element,
    txt({ id: "pager", x: M, y: y - 80, w: bw, h: 60, text: `${i + 1}/${n}`, font: "heading", size: 34, weight: 700, color: dark ? "onPrimary" : "muted", align: "end", valign: "bottom" } as never),
  ];
}

/** يحدّث المؤشر داخل تصميم موجود إلى الموضع i من n */
export function repage(d: Design, brand: Brand, w: number, h: number, i: number, n: number): Design {
  if (!d.elements.some((e) => e.id === "pager")) return d;
  const dark = d.elements.find((e) => e.id === "progress")?.type === "shape" && (d.elements.find((e) => e.id === "progress") as { fill?: string }).fill === "onPrimary";
  const fresh = pager(brand, w, h, i, n, dark);
  return { ...d, elements: d.elements.map((e) => fresh.find((f) => f.id === e.id) ?? e) };
}

export function buildCarousel(brand: Brand, w: number, h: number, c: CarouselContent): Element[][] {
  const rtl = true, ar = brand.language === "ar"; // نبني بتخطيط RTL ثم نعكس لهويات LTR
  const n = c.slides.length + 1 + (c.outro ? 1 : 0), ctx = (cc: object) => ({ brand, w, h, c: cc as never });
  const out: Element[][] = [];

  // الغلاف
  {
    const hr = hero(ctx({})); const els: Element[] = [hr.bg, ...chrome(ctx({}), hr.dark)];
    let y = h * 0.25;
    if (c.cover.badge) { const bw = 80 + c.cover.badge.length * 26; els.push(pill(w - M - bw, y, bw, 70, hr.mark), txt({ x: w - M - bw, y, w: bw, h: 70, text: c.cover.badge, font: "heading", size: 32, weight: 800, color: hr.onMark, align: "center", valign: "middle" })); y += 110; }
    const th = h * 0.34; els.push(txt({ x: M, y, w: w - M * 2, h: th, text: c.cover.title, font: "heading", size: 124, weight: 800, color: hr.ink, lineHeight: 1.15 })); y += th + 30;
    if (c.cover.subtitle) els.push(txt({ x: M, y, w: w - M * 2, h: h * 0.14, text: c.cover.subtitle, size: 50, weight: 400, color: hr.soft, opacity: 0.85, lineHeight: 1.45 }));
    // تلميح السحب
    const sw = 300, sy = h - M - 100, sx = rtl ? M : w - M - sw;
    els.push(pill(sx, sy, sw, 100, hr.mark), txt({ x: sx + (rtl ? 100 : 40), y: sy, w: sw - 140, h: 100, text: ar ? "اسحب" : "Swipe", font: "heading", size: 40, weight: 800, color: hr.onMark, valign: "middle", align: rtl ? "start" : "start" }),
      { type: "icon", name: rtl ? "arrow-left" : "arrow-right", x: rtl ? sx + 36 : sx + sw - 36 - 48, y: sy + 26, size: 48, color: hr.onMark, strokeWidth: 2.4 } as Element);
    out.push(els);
  }
  // شرائح المحتوى
  c.slides.forEach((s, k) => {
    const els: Element[] = [...chrome(ctx({}), false)];
    const num = String(k + 1).padStart(2, "0"), y0 = M + 150;
    els.push({ type: "shape", kind: "rect", x: w - M - 190, y: y0, w: 190, h: 190, fill: "primary", radius: 56 } as Element);
    els.push(txt({ x: w - M - 190, y: y0, w: 190, h: 190, text: num, font: "heading", size: 96, weight: 800, color: "onPrimary", align: "center", valign: "middle" }));
    if (s.icon) els.push({ type: "icon", name: s.icon, x: M, y: y0 + 30, size: 130, color: "accent", strokeWidth: 1.6 } as Element);
    const ty = y0 + 190 + 80, th = h * 0.2;
    els.push(txt({ x: M, y: ty, w: w - M * 2, h: th, text: s.title, font: "heading", size: 88, weight: 800, lineHeight: 1.2 }));
    if (s.body) els.push(txt({ x: M, y: ty + th + 20, w: w - M * 2, h: h - (ty + th + 20) - M - 120, text: s.body, size: 48, weight: 400, color: "muted", lineHeight: 1.55 }));
    els.push(...pager(brand, w, h, k + 1, n));
    out.push(els);
  });
  // الختام
  if (c.outro) {
    const hr = hero(ctx({})); const els: Element[] = [hr.bg, ...chrome(ctx({}), hr.dark)];
    els.push(txt({ x: M, y: h * 0.28, w: w - M * 2, h: h * 0.3, text: c.outro.title, font: "heading", size: 110, weight: 800, color: hr.ink, align: "center", valign: "middle", lineHeight: 1.2 }));
    if (c.outro.subtitle) els.push(txt({ x: M, y: h * 0.6, w: w - M * 2, h: 120, text: c.outro.subtitle, size: 46, weight: 400, color: hr.soft, opacity: 0.85, align: "center" }));
    if (c.outro.cta) { const cw = Math.min(w - M * 2, 200 + c.outro.cta.length * 30); els.push(pill((w - cw) / 2, h * 0.72, cw, 120, hr.mark), txt({ x: (w - cw) / 2, y: h * 0.72, w: cw, h: 120, text: c.outro.cta, font: "heading", size: 46, weight: 800, color: hr.onMark, align: "center", valign: "middle" })); }
    els.push(...pager(brand, w, h, n - 1, n, hr.ink === "onPrimary"));
    out.push(els);
  }
  const ltr = brand.direction === "ltr";
  return ltr ? out.map((els) => mirror(els, w, ["pager", "track", "progress"])) : out;
}
