import { readableOn } from "../core/palette.js";
import type { Brand, Element } from "../core/types.js";

export interface Content {
  title: string;
  subtitle?: string;
  cta?: string;
  badge?: string;
  icon?: string;
  image?: string;
  footer?: string;
  author?: string;
  items?: string[];
  date?: string;
  place?: string;
  number?: string;
  qr?: string;
  data?: unknown; // حمولة خاصة بالإضافات
}
export type ContentField = keyof Content;
export type Ctx = { brand: Brand; w: number; h: number; c: Content };
export interface Template { id: string; label: string; fields: ContentField[]; build: (ctx: Ctx) => Element[]; plugin?: string; hidden?: boolean }

export const M = 88;

export function chrome({ brand, w, h }: Ctx, dark: boolean): Element[] {
  const els: Element[] = [];
  if (brand.style.pattern !== "none") els.push({ type: "pattern", kind: brand.style.pattern, x: w - 420, y: -20, w: 440, h: 440, color: dark ? "onPrimary" : "primary", opacity: dark ? 0.12 : 0.14 } as Element);
  if (brand.logo.default) els.push({ type: "logo", x: M, y: M - 8, w: w - M * 2, h: 64, align: "start", variant: dark && brand.logo.light ? "light" : "default" } as Element);
  return els;
}

/** خلفية "بطولية": هوية داكنة → سطح الهوية، وإلا تدرّج الأساسي. تعيد ألوان النص والعلامات المناسبة */
export function hero(ctx: Ctx) {
  const { brand, w, h } = ctx;
  const darkBrand = readableOn(brand.colors.bg) === "#FFFFFF";
  const bg: Element = darkBrand
    ? { type: "shape", kind: "rect", x: 0, y: 0, w, h, fill: "surface", gradient: { from: "surface", to: "bg", angle: 160 } } as Element
    : { type: "shape", kind: "rect", x: 0, y: 0, w, h, fill: "primary", gradient: { from: "primary", to: "secondary", angle: 160 } } as Element;
  return { bg, dark: !darkBrand /* chrome(ctx, dark) */, ink: darkBrand ? "text" : "onPrimary", mark: darkBrand ? "primary" : "accent", onMark: readableOn(darkBrand ? brand.colors.primary : brand.colors.accent), soft: darkBrand ? "muted" : "onPrimary" };
}

export const txt = (o: Partial<Extract<Element, { type: "text" }>> & { x: number; y: number; w: number; h: number; text: string; size: number }): Element => ({ type: "text", font: "body", weight: 700, color: "text", align: "start", lineHeight: 1.3, valign: "top", fit: true, ...o } as Element);

/** تقدير ارتفاع نص بالسطور (عرض الحرف ≈ 0.5 من الحجم) لتفادي الفراغات الزائدة */
export const estH = (text: string, size: number, width: number, lh = 1.25, maxLines = 4) =>
  Math.round(Math.min(maxLines, Math.max(1, Math.ceil((text.length * size * 0.52) / width))) * size * lh + 16);

/** يعكس التخطيط أفقياً (التصاميم مبنية لـ RTL). العناصر ذات id للمؤشر تُستثنى لأنها تراعي الاتجاه أصلاً */
export function mirror(els: Element[], w: number, skipIds: string[] = []): Element[] {
  return els.map((e) => {
    if (e.id && skipIds.includes(e.id)) return e;
    const width = e.type === "icon" || e.type === "qr" ? e.size : "w" in e ? e.w : 0;
    if (width >= w * 0.97) return e; // عنصر بعرض الصفحة كاملة
    const c = { ...e } as Element & { x: number; rotate?: number };
    c.x = Math.round(w - e.x - width);
    if (c.rotate) c.rotate = -c.rotate;
    if (c.type === "icon" && c.name === "arrow-left") c.name = "arrow-right";
    return c as Element;
  });
}
