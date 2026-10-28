import Color from "colorjs.io";
import type { Brand } from "./types.js";

const hex = (c: Color) => c.to("srgb").toString({ format: "hex", collapse: false });
const oklch = (l: number, c: number, h: number) => hex(new Color("oklch", [l, c, h]).toGamut({ space: "srgb", method: "oklch.c" }));

export function contrast(a: string, b: string): number {
  return new Color(a).contrastWCAG21(new Color(b));
}

/** لون نص مناسب (أبيض/أسود تقريبًا) فوق خلفية معيّنة */
export function readableOn(bg: string, light = "#FFFFFF", dark = "#111111"): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/** يولّد لوحة ألوان كاملة للهوية من لون أساسي (واختياريًا ثانوي/أكسنت) */
export function generatePalette(primary: string, opts: { secondary?: string; accent?: string; dark?: boolean } = {}): Brand["colors"] {
  const p = new Color(primary).to("oklch"); const pl = p.l ?? 0.5, pc = p.c ?? 0.1;
  const h = p.h == null || Number.isNaN(p.h) ? 250 : p.h;
  const secondary = opts.secondary ?? oklch(Math.max(0.25, pl - 0.22), Math.min(pc, 0.12), h);
  // ألوان أساسية ترابية/خافتة: أكسنت مجاور دافئ، وإلا لون مكمّل
  const accent = opts.accent ?? (pc < 0.1 ? oklch(0.78, 0.14, (h + 40) % 360) : oklch(0.8, Math.max(0.13, Math.min(pc, 0.18)), (h + 150) % 360));
  const dark = !!opts.dark;
  const bg = dark ? oklch(0.18, 0.02, h) : oklch(0.975, 0.008, h);
  const surface = dark ? oklch(0.24, 0.025, h) : "#FFFFFF";
  const text = dark ? oklch(0.96, 0.01, h) : oklch(0.22, 0.03, h);
  const muted = dark ? oklch(0.72, 0.02, h) : oklch(0.5, 0.03, h);
  return { primary: hex(p), secondary, accent, bg, surface, text, muted, onPrimary: readableOn(hex(p)), extra: [] };
}

export function checkContrast(colors: Brand["colors"]): string[] {
  const pairs: [string, string, string, number][] = [
    ["text", colors.text, colors.bg, 4.5],
    ["text on surface", colors.text, colors.surface, 4.5],
    ["onPrimary on primary", colors.onPrimary, colors.primary, 4.5],
    ["muted on bg", colors.muted, colors.bg, 3],
  ];
  return pairs.filter(([, a, b, min]) => contrast(a, b) < min).map(([n, a, b, min]) => `تباين ضعيف (${n}): ${contrast(a, b).toFixed(2)} < ${min}`);
}
