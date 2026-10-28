import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WEIGHTS = [400, 500, 600, 700, 800];
const SUBSETS: Record<string, string> = {
  arabic: "U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC",
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
};
const FONTS: Record<string, { pkg: string; subsets: string[] }> = {
  Cairo: { pkg: "cairo", subsets: ["arabic", "latin"] },
  Tajawal: { pkg: "tajawal", subsets: ["arabic", "latin"] },
  Inter: { pkg: "inter", subsets: ["latin"] },
  "Readex Pro": { pkg: "readex-pro", subsets: ["arabic", "latin"] },
  "IBM Plex Sans Arabic": { pkg: "ibm-plex-sans-arabic", subsets: ["arabic", "latin"] },
  "Space Grotesk": { pkg: "space-grotesk", subsets: ["latin"] },
  Poppins: { pkg: "poppins", subsets: ["latin"] },
  Montserrat: { pkg: "montserrat", subsets: ["latin"] },
  "DM Sans": { pkg: "dm-sans", subsets: ["latin"] },
  "Playfair Display": { pkg: "playfair-display", subsets: ["latin"] },
  "Noto Kufi Arabic": { pkg: "noto-kufi-arabic", subsets: ["arabic", "latin"] },
  Almarai: { pkg: "almarai", subsets: ["arabic", "latin"] },
};
export const availableFonts = Object.keys(FONTS);
const cache = new Map<string, string>();

/** @font-face مضمّنة (base64) حتى لا يعتمد الريندر على الإنترنت */
export function fontFaceCss(family: string): string {
  const key = FONTS[family] ? family : "Cairo";
  const hit = cache.get(key);
  if (hit) return hit;
  const { pkg, subsets } = FONTS[key];
  const dir = require.resolve(`@fontsource/${pkg}/package.json`).replace(/package\.json$/, "files/");
  let css = "";
  for (const subset of subsets) for (const w of WEIGHTS) {
    const file = `${dir}${pkg}-${subset}-${w}-normal.woff2`;
    if (!fs.existsSync(file)) continue;
    const b64 = fs.readFileSync(file).toString("base64");
    css += `@font-face{font-family:"${key}";font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${b64}) format("woff2");unicode-range:${SUBSETS[subset]}}\n`;
  }
  cache.set(key, css);
  return css;
}

/** CSS لعائلات مطلوبة (قائمة مفصولة بفواصل) — يقدَّم للمعاينة عبر /api/fonts.css */
export function fontsCssFor(list: string): string {
  return list.split(",").filter((f) => FONTS[f]).map(fontFaceCss).join("\n");
}

/** @font-face للخطوط المذكورة داخل SVG (تضمينها داخل الملف لأن <img> لا يرى خطوط الصفحة) */
export function svgFontCss(svg: string): string {
  return availableFonts.filter((f) => svg.includes(f)).map(fontFaceCss).join("\n");
}
