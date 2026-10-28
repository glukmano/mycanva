import fs from "node:fs/promises";
import path from "node:path";
import { BRANDS_DIR } from "./paths.js";
import { generatePalette, readableOn } from "./palette.js";
import { BrandSchema, type Brand } from "./types.js";

const safe = (id: string) => id.replace(/[^\p{L}\p{N}_-]+/gu, "-");

export async function listBrands(): Promise<string[]> {
  const entries = await fs.readdir(BRANDS_DIR, { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function loadBrand(id: string): Promise<Brand> {
  const raw = await fs.readFile(path.join(BRANDS_DIR, safe(id), "brand.json"), "utf8");
  return BrandSchema.parse(JSON.parse(raw));
}

export async function saveBrand(id: string, brand: Brand): Promise<string> {
  const dir = path.join(BRANDS_DIR, safe(id));
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "brand.json");
  await fs.writeFile(file, JSON.stringify(BrandSchema.parse(brand), null, 2));
  return file;
}

export function brandDir(id: string) {
  return path.join(BRANDS_DIR, safe(id));
}

export interface CreateBrandArgs {
  id: string; name: string; primary: string; colors?: Record<string, string>; dark?: boolean;
  headingFont?: string; bodyFont?: string; language?: "ar" | "en";
  logoSvg?: string; logoLightSvg?: string; logoPath?: string;
  iconSet?: "lucide" | "tabler" | "ph"; pattern?: "none" | "dots" | "grid" | "waves"; radius?: number;
  tone?: string; hashtags?: string[]; cta?: string[];
}

/** ينشئ/يحدّث هوية: يولّد باقي الألوان من primary ويطبّق أي تجاوزات */
export async function createBrand(a: CreateBrandArgs): Promise<Brand> {
  const colors = { ...generatePalette(a.primary, { secondary: a.colors?.secondary, accent: a.colors?.accent, dark: a.dark }), ...(a.colors ?? {}) };
  if (a.colors && !a.colors.onPrimary) colors.onPrimary = readableOn(colors.primary);
  const dir = brandDir(a.id);
  await fs.mkdir(dir, { recursive: true });
  let prev: Partial<Brand> = {};
  try { prev = await loadBrand(a.id); } catch {}
  const logo: Record<string, string> = { ...(prev.logo ?? {}) };
  if (a.logoSvg) { await fs.writeFile(path.join(dir, "logo.svg"), a.logoSvg); logo.default = "logo.svg"; }
  if (a.logoLightSvg) { await fs.writeFile(path.join(dir, "logo-light.svg"), a.logoLightSvg); logo.light = "logo-light.svg"; }
  if (a.logoPath) { const f = `logo${path.extname(a.logoPath)}`; await fs.copyFile(a.logoPath, path.join(dir, f)); logo.default = f; }
  const lang = a.language ?? "ar";
  const brand = BrandSchema.parse({
    name: a.name, language: lang, direction: lang === "ar" ? "rtl" : "ltr", colors, logo,
    fonts: { heading: a.headingFont ?? "Cairo", body: a.bodyFont ?? "Tajawal" },
    style: { radius: a.radius ?? 24, iconSet: a.iconSet ?? "lucide", pattern: a.pattern ?? "dots" },
    voice: { tone: a.tone ?? "", hashtags: a.hashtags ?? [], cta: a.cta ?? [] },
  });
  await saveBrand(a.id, brand);
  return brand;
}
