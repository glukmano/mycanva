import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { loadBrand } from "./brand.js";
import { EXPORTS_DIR } from "./paths.js";
import { QR_TYPES, qrPayload, type QrType } from "./qr.js";
import { qrElementSvg } from "./render.js";
import { BrandSchema, type Brand } from "./types.js";

const TYPES = Object.keys(QR_TYPES) as [QrType, ...QrType[]];
export const QrSpecSchema = z.object({
  type: z.enum(TYPES).default("url"),
  fields: z.record(z.string(), z.string()).optional().describe("حقول النوع: url | text | ssid,password,security | name,org,title,phone,email,url | to,subject,body | phone,message | lat,lng"),
  data: z.string().optional().describe("نص جاهز يتجاوز type/fields"),
  dots: z.enum(["square", "rounded", "dots", "diamond", "classy"]).default("rounded"),
  eyeOuter: z.enum(["square", "rounded", "circle"]).default("rounded"),
  eyeInner: z.enum(["square", "rounded", "circle"]).default("rounded"),
  fg: z.string().default("#14112E"), fg2: z.string().optional(), angle: z.number().default(135), eyeColor: z.string().optional(),
  bg: z.string().default("#FFFFFF").describe("لون أو transparent"), bgRadius: z.number().default(0), margin: z.number().min(0).max(8).default(4),
  ec: z.enum(["L", "M", "Q", "H"]).default("Q"),
  logo: z.string().optional().describe("brand:default | brand:light | brand:mark أو اسم ملف من assets"), logoScale: z.number().default(0.22),
  brand: z.string().optional().describe("معرّف هوية لحلّ ألوان الهوية (primary…) وشعارها"),
  size: z.number().int().min(100).max(4000).default(1000),
});
export type QrSpec = z.infer<typeof QrSpecSchema>;

const FALLBACK_BRAND = BrandSchema.parse({ name: "-", colors: { primary: "#000000", secondary: "#000000", accent: "#000000", bg: "#FFFFFF", surface: "#FFFFFF", text: "#000000", muted: "#555555", onPrimary: "#FFFFFF" } });

export async function buildQr(input: unknown) {
  const s = QrSpecSchema.parse(input);
  const payload = s.data?.trim() ? s.data.trim() : qrPayload(s.type, s.fields ?? {});
  const brand: Brand = s.brand ? await loadBrand(s.brand) : FALLBACK_BRAND;
  const { svg, warnings, modules } = await qrElementSvg({ type: "qr", x: 0, y: 0, size: s.size, data: payload, dots: s.dots, eyeOuter: s.eyeOuter, eyeInner: s.eyeInner, fg: s.fg, fg2: s.fg2, angle: s.angle, eyeColor: s.eyeColor, bg: s.bg, bgRadius: s.bgRadius, margin: s.margin, ec: s.ec, logo: s.logo, logoScale: s.logoScale }, brand, s.brand ?? "", "", s.size);
  return { svg, warnings, payload, modules, png: () => sharp(Buffer.from(svg)).png().toBuffer() };
}

export async function saveQr(input: unknown, name: string) {
  const r = await buildQr(input), dir = path.join(EXPORTS_DIR, "qr"), base = name.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "qr";
  await fs.mkdir(dir, { recursive: true });
  const svgFile = path.join(dir, `${base}.svg`), pngFile = path.join(dir, `${base}.png`);
  await fs.writeFile(svgFile, r.svg); await fs.writeFile(pngFile, await r.png());
  return { ...r, svgFile, pngFile };
}
