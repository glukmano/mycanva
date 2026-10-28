import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { loadBrand, brandDir } from "./brand.js";
import { fontFaceCss, svgFontCss } from "./fonts.js";
import { iconSvg } from "./icons.js";
import { ASSETS_DIR, EXPORTS_DIR, ROOT, pluginFile } from "./paths.js";
import { qrSvg, DEFAULT_QR_STYLE } from "./qr.js";
import { DesignSchema, FORMATS, type Brand, type Design, type Element } from "./types.js";

const MIME: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function imageFilter(f?: { brightness: number; contrast: number; saturate: number; blur: number; grayscale: number; sepia: number }) {
  if (!f) return "";
  const parts = [f.brightness !== 100 && `brightness(${f.brightness}%)`, f.contrast !== 100 && `contrast(${f.contrast}%)`, f.saturate !== 100 && `saturate(${f.saturate}%)`, f.blur > 0 && `blur(${f.blur}px)`, f.grayscale > 0 && `grayscale(${f.grayscale}%)`, f.sepia > 0 && `sepia(${f.sepia}%)`].filter(Boolean);
  return parts.length ? `filter:${parts.join(" ")};` : "";
}

export function resolveColor(brand: Brand, c: string): string {
  const v = (brand.colors as Record<string, unknown>)[c];
  return typeof v === "string" ? v : c;
}

export async function toDataUri(src: string, brandId: string): Promise<string> {
  if (/^(data:|https?:)/.test(src)) return src;
  const pf = pluginFile(src);
  if (src.startsWith("plugin:")) { if (!pf) throw new Error(`مرجع إضافة غير صالح: ${src}`); const buf = await fs.readFile(pf).catch(() => { throw new Error(`الملف غير موجود: ${src}`); }); return `data:${MIME[path.extname(pf).toLowerCase()] ?? "application/octet-stream"};base64,${buf.toString("base64")}`; }
  const candidates = path.isAbsolute(src) ? [src] : [path.join(brandDir(brandId), src), path.join(ASSETS_DIR, src), path.join(ROOT, src)];
  for (const file of candidates) {
    try {
      let buf = await fs.readFile(file);
      if (path.extname(file).toLowerCase() === ".svg" && buf.includes("<text")) {
        const css = svgFontCss(buf.toString("utf8"));
        if (css) buf = Buffer.from(buf.toString("utf8").replace(/<svg[^>]*>/, (m) => `${m}<style>${css}</style>`));
      }
      return `data:${MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream"};base64,${buf.toString("base64")}`;
    } catch {}
  }
  throw new Error(`الملف غير موجود: ${src}`);
}

function patternSvg(kind: string, w: number, h: number, color: string): string {
  if (kind === "grid") {
    return `<svg width="${w}" height="${h}"><defs><pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="${color}" stroke-width="2"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  }
  if (kind === "waves") {
    return `<svg width="${w}" height="${h}"><defs><pattern id="g" width="80" height="40" patternUnits="userSpaceOnUse"><path d="M0 20 Q20 0 40 20 T80 20" fill="none" stroke="${color}" stroke-width="3"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  }
  return `<svg width="${w}" height="${h}"><defs><pattern id="g" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="${color}"/></pattern></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

type QrEl = Extract<Element, { type: "qr" }>;
/** يبني SVG لعنصر QR مع حلّ ألوان الهوية وشعارها */
export async function qrElementSvg(el: QrEl, brand: Brand, brandId: string, idSuffix = "", px = 1000) {
  const col = (c: string) => (c === "transparent" ? c : resolveColor(brand, c));
  let logo: string | undefined;
  if (el.logo) {
    const file = el.logo.startsWith("brand:") ? brand.logo[el.logo.slice(6) as "default" | "light" | "mark"] : el.logo;
    if (file) logo = await toDataUri(file, brandId);
  }
  return qrSvg(el.data, { ...DEFAULT_QR_STYLE, dots: el.dots, eyeOuter: el.eyeOuter, eyeInner: el.eyeInner, fg: col(el.fg), fg2: el.fg2 ? col(el.fg2) : undefined, angle: el.angle, eyeColor: el.eyeColor ? col(el.eyeColor) : undefined, bg: col(el.bg), bgRadius: el.bgRadius, margin: el.margin, ec: el.ec, logo, logoScale: el.logoScale, idSuffix }, px);
}

const ANIM_KEYFRAMES = `@keyframes mc-fade{from{opacity:0}}@keyframes mc-slide-up{from{opacity:0;translate:0 70px}}@keyframes mc-slide-down{from{opacity:0;translate:0 -70px}}@keyframes mc-slide-left{from{opacity:0;translate:-90px 0}}@keyframes mc-slide-right{from{opacity:0;translate:90px 0}}@keyframes mc-zoom{from{opacity:0;scale:.6}}@keyframes mc-pop{from{opacity:0;scale:.2}}`;
export const animEnd = (d: Design) => Math.max(0, ...d.elements.map((e) => (e.anim ? e.anim.delay + e.anim.duration : 0)));

async function elementHtml(el: Element, brand: Brand, brandId: string, i: number, warn: string[], animate: boolean): Promise<string> {
  const col = (c: string) => resolveColor(brand, c);
  const base = (box: { x: number; y: number; w?: number; h?: number }) =>
    `position:absolute;left:${box.x}px;top:${box.y}px;${box.w != null ? `width:${box.w}px;` : ""}${box.h != null ? `height:${box.h}px;` : ""}` +
    (el.opacity != null ? `opacity:${el.opacity};` : "") + (el.rotate ? `transform:rotate(${el.rotate}deg);` : "") +
    (animate && el.anim ? `animation:mc-${el.anim.type} ${el.anim.duration}ms ${el.anim.type === "pop" ? "cubic-bezier(.34,1.56,.64,1)" : "cubic-bezier(.22,1,.36,1)"} ${el.anim.delay}ms both;` : "");
  const id = `el-${el.id ?? i}`;
  switch (el.type) {
    case "text": {
      const justify = { top: "flex-start", middle: "center", bottom: "flex-end" }[el.valign];
      const font = brand.fonts[el.font];
      return `<div id="${id}" data-fit="${el.fit}" data-size="${el.size}" style="${base(el)}display:flex;flex-direction:column;justify-content:${justify};overflow:hidden"><div class="t" style="font-family:'${font}','${brand.fonts.body}','${brand.fonts.heading}',sans-serif;font-size:${el.size}px;font-weight:${el.weight};color:${col(el.color)};text-align:${el.align === "start" ? "start" : el.align === "end" ? "end" : "center"};line-height:${el.lineHeight};white-space:pre-wrap;overflow-wrap:anywhere">${esc(brand.direction === "rtl" && !/[\u0590-\u08FF]/.test(el.text) ? `\u2066${el.text}\u2069` : el.text)}</div></div>`;
    }
    case "shape": {
      const radius = el.kind === "circle" ? "50%" : el.kind === "pill" ? `${Math.min(el.w, el.h)}px` : `${el.radius ?? 0}px`;
      const bg = el.gradient ? (el.gradient.kind === "radial" ? `radial-gradient(circle closest-side,${col(el.gradient.from)},${col(el.gradient.to)})` : `linear-gradient(${el.gradient.angle}deg,${col(el.gradient.from)},${col(el.gradient.to)})`) : col(el.fill);
      return `<div id="${id}" style="${base(el)}background:${bg};border-radius:${radius};${el.stroke ? `border:${el.strokeWidth ?? 2}px solid ${col(el.stroke)};box-sizing:border-box;` : ""}${el.blur ? `filter:blur(${el.blur}px);` : ""}"></div>`;
    }
    case "icon": {
      let svg: string;
      try { svg = iconSvg(el.name, brand.style.iconSet, el.size, el.strokeWidth); }
      catch { warn.push(`أيقونة غير موجودة: "${el.name}"`); svg = `<svg width="${el.size}" height="${el.size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 17h.01"/></svg>`; }
      return `<div id="${id}" style="${base({ x: el.x, y: el.y, w: el.size, h: el.size })}color:${col(el.color)}">${svg}</div>`;
    }
    case "image": {
      const src = await toDataUri(el.src, brandId);
      return `<div id="${id}" style="${base(el)}border-radius:${el.radius ?? 0}px;overflow:hidden"><img src="${src}" style="width:100%;height:100%;object-fit:${el.fit};object-position:${el.posX}% ${el.posY}%;transform:scale(${el.zoom});transform-origin:${el.posX}% ${el.posY}%;${imageFilter(el.filter)}display:block"></div>`;
    }
    case "logo": {
      const file = brand.logo[el.variant] ?? brand.logo.default;
      if (!file) return "";
      const src = await toDataUri(file, brandId);
      const j = { start: "flex-start", center: "center", end: "flex-end" }[el.align];
      return `<div id="${id}" style="${base({ x: el.x, y: el.y, w: el.w, h: el.h })}display:flex;justify-content:${j}"><img src="${src}" style="height:100%;width:auto;max-width:100%;object-fit:contain;display:block"></div>`;
    }
    case "qr": {
      const { svg } = await qrElementSvg(el, brand, brandId, String(i), el.size);
      return `<div id="${id}" style="${base({ x: el.x, y: el.y, w: el.size, h: el.size })}">${svg}</div>`;
    }
    case "pattern":
      return `<div id="${id}" style="${base(el)}overflow:hidden">${patternSvg(el.kind, el.w, el.h, col(el.color))}</div>`;
  }
}

/** يضبط الخط داخل صناديق النص ويعيد تحذيرات — يُستخدم في المعاينة والتصدير بنفس المنطق */
const FIT_SCRIPT = `window.__fit=function(){var w=(window.__pre||[]).slice();document.querySelectorAll("[data-fit]").forEach(function(b){var t=b.querySelector(".t"),s=parseFloat(b.dataset.size),o=s,min=s*0.4;if(b.dataset.fit==="true")while(t.scrollHeight>b.clientHeight+1&&s>min){s-=2;t.style.fontSize=s+"px"}var tx=t.textContent.slice(0,30);if(t.scrollHeight>b.clientHeight+1)w.push("النص يتجاوز الصندوق: "+tx);else if(s<o)w.push("تم تصغير الخط "+o+"→"+s+": "+tx)});return w};`;

export async function designToHtml(input: Design, opts: { fontsUrl?: string; animate?: boolean; paused?: boolean } = {}): Promise<{ html: string; width: number; height: number; brand: Brand }> {
  const design = DesignSchema.parse(input);
  const brand = await loadBrand(design.brand);
  const f = FORMATS[design.format] ?? FORMATS.post;
  const width = design.width ?? f.w, height = design.height ?? f.h;
  const pre: string[] = [];
  const body = (await Promise.all(design.elements.map((el, i) => elementHtml(el, brand, design.brand, i, pre, !!opts.animate)))).join("\n");
  const fams = [...new Set([brand.fonts.heading, brand.fonts.body])];
  const html = `<!doctype html><html lang="${brand.language}" dir="${brand.direction}"><head><meta charset="utf-8">${opts.fontsUrl ? `<link rel="stylesheet" href="${opts.fontsUrl}?f=${encodeURIComponent(fams.join(","))}">` : ""}<style>
${opts.fontsUrl ? "" : fams.map(fontFaceCss).join("\n")}
${opts.animate ? ANIM_KEYFRAMES : ""}${opts.paused ? "*{animation-play-state:paused!important}" : ""}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;overflow:hidden}
#canvas{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:${resolveColor(brand, design.background)};direction:${brand.direction};-webkit-font-smoothing:antialiased}
</style></head><body><div id="canvas">${body}</div><script>window.__pre=${JSON.stringify(pre).replace(/</g, "\\u003c")};${FIT_SCRIPT}
(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){var w=window.__fit();try{parent.postMessage({type:"mycanva-fit",warnings:w},"*")}catch(e){}});</script></body></html>`;
  return { html, width, height, brand };
}

let browser: Browser | undefined;
export async function getBrowser() { return (browser ??= await chromium.launch()); }
export async function closeBrowser() { await browser?.close(); browser = undefined; }

export interface RenderResult { file: string; width: number; height: number; warnings: string[] }

export async function renderDesign(input: Design, opts: { out?: string; type?: "png" | "jpeg"; scale?: number } = {}): Promise<RenderResult> {
  const { html, width, height } = await designToHtml(input);
  let scale = opts.scale ?? 2;
  while (scale > 1 && width * height * scale * scale > 48e6) scale = Math.max(1, scale - 0.5); // حماية الذاكرة للمقاسات الكبيرة
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const warnings: string[] = await page.evaluate(() => (window as unknown as { __fit: () => string[] }).__fit());
    const type = opts.type ?? "png";
    const file = opts.out ?? path.join(EXPORTS_DIR, `${input.brand}-${input.format}-${Date.now()}.${type === "jpeg" ? "jpg" : "png"}`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type, ...(type === "jpeg" ? { quality: 92 } : {}), clip: { x: 0, y: 0, width, height } });
    return { file, width: Math.round(width * scale), height: Math.round(height * scale), warnings };
  } finally {
    await ctx.close();
  }
}
