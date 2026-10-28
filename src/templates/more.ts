import { readableOn } from "../core/palette.js";
import type { Element } from "../core/types.js";
import { M, chrome, estH, hero, txt, type Ctx, type Template } from "./common.js";

const pill = (x: number, y: number, w: number, h: number, fill: string): Element => ({ type: "shape", kind: "pill", x, y, w, h, fill } as Element);
const icon = (name: string, x: number, y: number, size: number, color: string, strokeWidth = 1.8): Element => ({ type: "icon", name, x, y, size, color, strokeWidth } as Element);
const ctaPill = (ctx: Ctx, fill: string, color: string, y?: number): Element[] => {
  const { w, h, c } = ctx; if (!c.cta) return [];
  const cw = Math.min(w - M * 2, 140 + c.cta.length * 30), ch = 104, yy = y ?? h - M - ch;
  return [pill(M, yy, cw, ch, fill), txt({ x: M, y: yy, w: cw, h: ch, text: c.cta, font: "heading", size: 42, weight: 700, color, align: "center", valign: "middle" })];
};

const tip: Template = {
  id: "tip", label: "نصيحة / معلومة", fields: ["badge", "title", "subtitle", "icon", "cta"],
  build(ctx) {
    const { w, h, c } = ctx; const d = Math.min(240, w * 0.22), y0 = M + 110;
    const els: Element[] = [...chrome(ctx, false)];
    els.push({ type: "shape", kind: "circle", x: w - M - d, y: y0 + 20, w: d, h: d, fill: "primary", gradient: { from: "primary", to: "secondary", angle: 135 } } as Element, icon(c.icon ?? "lightbulb", w - M - d + d * 0.25, y0 + 20 + d * 0.25, d * 0.5, "onPrimary", 1.6));
    let y = y0 + d + 70;
    if (c.badge) { els.push(txt({ x: M, y, w: w - M * 2, h: 60, text: c.badge, font: "heading", size: 40, weight: 800, color: "primary" })); y += 80; }
    const th = estH(c.title, 92, w - M * 2, 1.2); els.push(txt({ x: M, y, w: w - M * 2, h: th, text: c.title, font: "heading", size: 92, weight: 800, lineHeight: 1.2 })); y += th + 20;
    if (c.subtitle) els.push(txt({ x: M, y, w: w - M * 2, h: Math.max(160, h - y - M - 140), text: c.subtitle, size: 46, weight: 400, color: "muted", lineHeight: 1.5 }));
    return [...els, ...ctaPill(ctx, "primary", "onPrimary")];
  },
};

const checklist: Template = {
  id: "checklist", label: "قائمة نقاط", fields: ["title", "items", "cta"],
  build(ctx) {
    const { w, h, c } = ctx; const items = (c.items ?? []).slice(0, 7); const els: Element[] = [...chrome(ctx, false)];
    const top = M + 110, th = Math.min(260, h * 0.17);
    els.push(txt({ x: M, y: top, w: w - M * 2, h: th, text: c.title, font: "heading", size: 84, weight: 800, lineHeight: 1.2, valign: "middle" }));
    const bottom = c.cta ? h - M - 104 - 40 : h - M, avail = bottom - (top + th + 30), gap = 22;
    const rowH = Math.min(150, (avail - gap * (items.length - 1)) / Math.max(1, items.length));
    items.forEach((it, i) => {
      const y = top + th + 30 + i * (rowH + gap), d = rowH * 0.56;
      els.push({ type: "shape", kind: "rect", x: M, y, w: w - M * 2, h: rowH, fill: "surface", radius: 28 } as Element,
        { type: "shape", kind: "circle", x: w - M - 28 - d, y: y + (rowH - d) / 2, w: d, h: d, fill: "primary" } as Element,
        icon("check", w - M - 28 - d + d * 0.2, y + (rowH - d) / 2 + d * 0.2, d * 0.6, "onPrimary", 2.6),
        txt({ x: M + 30, y, w: w - M * 2 - d - 100, h: rowH, text: it, size: Math.min(46, rowH * 0.36), weight: 600, valign: "middle" }));
    });
    return [...els, ...ctaPill(ctx, "primary", "onPrimary")];
  },
};

const testimonial: Template = {
  id: "testimonial", label: "شهادة عميل", fields: ["title", "author", "subtitle", "image"],
  build(ctx) {
    const { w, h, c } = ctx; const els: Element[] = [...chrome(ctx, false)];
    const cy = h * 0.2, ch = h * 0.66;
    els.push({ type: "shape", kind: "rect", x: M, y: cy, w: w - M * 2, h: ch, fill: "surface", radius: 44 } as Element);
    els.push(icon("quote", w - M - 60 - 90, cy + 56, 90, "accent", 1.6));
    for (let i = 0; i < 5; i++) els.push(icon("star", M + 60 + i * 62, cy + 62, 52, "accent", 1.8));
    els.push(txt({ x: M + 60, y: cy + 190, w: w - M * 2 - 120, h: ch - 190 - 230, text: c.title, font: "heading", size: 58, weight: 700, lineHeight: 1.5, valign: "middle" }));
    const ay = cy + ch - 190;
    if (c.image) els.push({ type: "image", src: c.image, x: w - M - 60 - 130, y: ay + 20, w: 130, h: 130, fit: "cover", radius: 65 } as Element);
    const tx = c.image ? 190 : 0;
    els.push(txt({ x: M + 60, y: ay + 20, w: w - M * 2 - 120 - tx, h: 70, text: c.author ?? "", font: "heading", size: 48, weight: 800, valign: "bottom" }));
    if (c.subtitle) els.push(txt({ x: M + 60, y: ay + 96, w: w - M * 2 - 120 - tx, h: 60, text: c.subtitle, size: 36, weight: 400, color: "muted" }));
    return els;
  },
};

const event: Template = {
  id: "event", label: "دعوة فعالية", fields: ["badge", "title", "date", "place", "cta"],
  build(ctx) {
    const { w, h, c } = ctx; const hr = hero(ctx); const els: Element[] = [hr.bg, ...chrome(ctx, hr.dark)];
    let y = h * 0.24;
    if (c.badge) { const bw = 80 + c.badge.length * 26; els.push(pill(w - M - bw, y, bw, 70, hr.mark), txt({ x: w - M - bw, y, w: bw, h: 70, text: c.badge, font: "heading", size: 32, weight: 800, color: hr.onMark, align: "center", valign: "middle" })); y += 110; }
    const th = h * 0.26; els.push(txt({ x: M, y, w: w - M * 2, h: th, text: c.title, font: "heading", size: 112, weight: 800, color: hr.ink, lineHeight: 1.18 })); y += th + 40;
    for (const [ic, val] of [["calendar-days", c.date], ["map-pin", c.place]] as const) if (val) {
      els.push({ type: "shape", kind: "circle", x: w - M - 84, y, w: 84, h: 84, fill: hr.mark } as Element, icon(ic, w - M - 84 + 22, y + 22, 40, hr.onMark, 2),
        txt({ x: M, y, w: w - M * 2 - 120, h: 84, text: val, font: "heading", size: 44, weight: 700, color: hr.ink, valign: "middle" })); y += 116;
    }
    return [...els, ...ctaPill(ctx, hr.mark, hr.onMark)];
  },
};

const countdown: Template = {
  id: "countdown", label: "عدّ تنازلي", fields: ["number", "title", "subtitle", "cta"],
  build(ctx) {
    const { w, h, c } = ctx; const hr = hero(ctx); const els: Element[] = [hr.bg, ...chrome(ctx, hr.dark)];
    const d = Math.min(w * 0.62, h * 0.34), cx = (w - d) / 2, cy = h * 0.2;
    els.push({ type: "shape", kind: "rect", x: cx, y: cy, w: d, h: d, fill: "surface", radius: d * 0.22 } as Element,
      txt({ x: cx, y: cy, w: d, h: d, text: c.number ?? "7", font: "heading", size: d * 0.62, weight: 800, color: "primary", align: "center", valign: "middle" }));
    els.push(txt({ x: M, y: cy + d + 50, w: w - M * 2, h: 190, text: c.title, font: "heading", size: 96, weight: 800, color: hr.ink, align: "center", valign: "middle", lineHeight: 1.2 }));
    if (c.subtitle) els.push(txt({ x: M, y: cy + d + 250, w: w - M * 2, h: 90, text: c.subtitle, size: 44, weight: 400, color: hr.soft, opacity: 0.85, align: "center" }));
    if (c.cta) { const cw = Math.min(w - M * 2, 160 + c.cta.length * 30); els.push(pill((w - cw) / 2, h - M - 104, cw, 104, hr.mark), txt({ x: (w - cw) / 2, y: h - M - 104, w: cw, h: 104, text: c.cta, font: "heading", size: 42, color: hr.onMark, align: "center", valign: "middle" })); }
    return els;
  },
};

const product: Template = {
  id: "product", label: "إعلان منتج", fields: ["image", "badge", "title", "subtitle", "cta"],
  build(ctx) {
    const { w, h, c } = ctx; const els: Element[] = [...chrome(ctx, false)];
    const iy = M + 100, ih = h * 0.42, iw = w - M * 2;
    els.push(c.image ? { type: "image", src: c.image, x: M, y: iy, w: iw, h: ih, fit: "cover", radius: 40 } as Element
      : { type: "shape", kind: "rect", x: M, y: iy, w: iw, h: ih, fill: "primary", radius: 40, gradient: { from: "primary", to: "secondary", angle: 135 } } as Element);
    if (!c.image) els.push(icon("package", (w - ih * 0.4) / 2, iy + ih * 0.3, ih * 0.4, "onPrimary", 1.4));
    if (c.badge) { const bw = 70 + c.badge.length * 24; els.push(pill(w - M - 30 - bw, iy + 30, bw, 64, "accent"), txt({ x: w - M - 30 - bw, y: iy + 30, w: bw, h: 64, text: c.badge, font: "heading", size: 30, weight: 800, color: readableOn(ctx.brand.colors.accent), align: "center", valign: "middle" })); }
    let y = iy + ih + 50;
    const pth = estH(c.title, 76, w - M * 2, 1.2); els.push(txt({ x: M, y, w: w - M * 2, h: pth, text: c.title, font: "heading", size: 76, weight: 800, lineHeight: 1.2 })); y += pth + 10;
    if (c.subtitle) els.push(txt({ x: M, y, w: w - M * 2, h: 100, text: c.subtitle, font: "heading", size: 64, weight: 800, color: "primary" }));
    return [...els, ...ctaPill(ctx, "text", "bg")];
  },
};

const stat: Template = {
  id: "stat", label: "رقم / إحصائية", fields: ["number", "title", "subtitle"],
  build(ctx) {
    const { w, h, c } = ctx; const els: Element[] = [...chrome(ctx, false)];
    const nh = Math.min(420, h * 0.3);
    els.push(txt({ x: M, y: h * 0.24, w: w - M * 2, h: nh, text: c.number ?? "100%", font: "heading", size: Math.min(380, w * 0.34), weight: 800, color: "primary", valign: "middle", lineHeight: 1 }));
    els.push({ type: "shape", kind: "rect", x: w - M - 140, y: h * 0.24 + nh + 20, w: 140, h: 10, fill: "accent", radius: 5 } as Element);
    const sth = estH(c.title, 80, w - M * 2);
    els.push(txt({ x: M, y: h * 0.24 + nh + 70, w: w - M * 2, h: sth, text: c.title, font: "heading", size: 80, weight: 800, lineHeight: 1.25 }));
    if (c.subtitle) els.push(txt({ x: M, y: h * 0.24 + nh + 70 + sth + 10, w: w - M * 2, h: h * 0.14, text: c.subtitle, size: 44, weight: 400, color: "muted", lineHeight: 1.5 }));
    return els;
  },
};

const qrCard: Template = {
  id: "qr-card", label: "بطاقة QR", fields: ["title", "subtitle", "qr", "cta"],
  build(ctx) {
    const { w, h, c } = ctx; const hr = hero(ctx); const els: Element[] = [hr.bg, ...chrome(ctx, hr.dark)];
    const cardW = w - M * 2, qr = Math.min(cardW - 120, h * 0.4), cardH = qr + 120 + (c.cta ? 130 : 0), cy = Math.max(M + 330, (h - cardH) / 2 + 120);
    els.push(txt({ x: M, y: M + 110, w: w - M * 2, h: cy - M - 130, text: c.title, font: "heading", size: 84, weight: 800, color: hr.ink, align: "center", valign: "middle", lineHeight: 1.2 }));
    els.push({ type: "shape", kind: "rect", x: M, y: cy, w: cardW, h: cardH, fill: "surface", radius: 48 } as Element);
    els.push({ type: "qr", data: c.qr ?? "https://example.com", x: Math.round((w - qr) / 2), y: Math.round(cy + 60), size: Math.round(qr), dots: "rounded", eyeOuter: "rounded", eyeInner: "rounded", fg: "text", eyeColor: "primary", bg: "surface", margin: 0, ec: "Q", logoScale: 0.22, angle: 135, bgRadius: 0 } as Element);
    if (c.cta) els.push(txt({ x: M, y: cy + qr + 60, w: cardW, h: 120, text: c.cta, font: "heading", size: 48, weight: 800, color: "text", align: "center", valign: "middle" }));
    if (c.subtitle) els.push(txt({ x: M, y: cy + cardH + 30, w: w - M * 2, h: 90, text: c.subtitle, size: 38, weight: 400, color: hr.soft, opacity: 0.85, align: "center" }));
    return els;
  },
};

export const MORE_TEMPLATES: Record<string, Template> = { tip, checklist, testimonial, event, countdown, product, stat, "qr-card": qrCard };
