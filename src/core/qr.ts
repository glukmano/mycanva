import QRCode from "qrcode";
import { contrast } from "./palette.js";

export type QrType = "url" | "text" | "wifi" | "vcard" | "email" | "phone" | "sms" | "whatsapp" | "geo";
export const QR_TYPES: Record<QrType, { label: string; fields: { key: string; label: string; placeholder?: string; area?: boolean }[] }> = {
  url: { label: "رابط", fields: [{ key: "url", label: "الرابط", placeholder: "https://example.com" }] },
  text: { label: "نص", fields: [{ key: "text", label: "النص", area: true }] },
  wifi: { label: "واي فاي", fields: [{ key: "ssid", label: "اسم الشبكة" }, { key: "password", label: "كلمة المرور" }, { key: "security", label: "التشفير (WPA / WEP / nopass)", placeholder: "WPA" }] },
  vcard: { label: "جهة اتصال", fields: [{ key: "name", label: "الاسم" }, { key: "org", label: "الشركة" }, { key: "title", label: "المسمى" }, { key: "phone", label: "الهاتف" }, { key: "email", label: "الإيميل" }, { key: "url", label: "الموقع" }] },
  email: { label: "إيميل", fields: [{ key: "to", label: "إلى" }, { key: "subject", label: "الموضوع" }, { key: "body", label: "النص", area: true }] },
  phone: { label: "اتصال هاتفي", fields: [{ key: "phone", label: "رقم الهاتف", placeholder: "+963..." }] },
  sms: { label: "رسالة SMS", fields: [{ key: "phone", label: "الرقم" }, { key: "message", label: "الرسالة", area: true }] },
  whatsapp: { label: "واتساب", fields: [{ key: "phone", label: "الرقم بصيغة دولية بدون +", placeholder: "963912345678" }, { key: "message", label: "رسالة جاهزة", area: true }] },
  geo: { label: "موقع جغرافي", fields: [{ key: "lat", label: "خط العرض" }, { key: "lng", label: "خط الطول" }] },
};

const esc = (s = "") => s.replace(/([\;,:"])/g, "\\$1");
const vEsc = (s = "") => s.replace(/([\;,])/g, "\\$1").replace(/\n/g, "\\n");

/** يبني النص الذي يُرمَّز داخل الـ QR بحسب النوع */
export function qrPayload(type: QrType, f: Record<string, string>): string {
  const need = (k: string) => { if (!f[k]?.trim()) throw new Error(`الحقل مطلوب: ${QR_TYPES[type].fields.find((x) => x.key === k)?.label ?? k}`); return f[k].trim(); };
  switch (type) {
    case "url": { const u = need("url"); return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`; }
    case "text": return need("text");
    case "wifi": { const sec = (f.security || "WPA").toUpperCase(); return `WIFI:T:${sec === "NOPASS" ? "nopass" : sec};S:${esc(need("ssid"))};${sec === "NOPASS" ? "" : `P:${esc(f.password ?? "")};`};`; }
    case "vcard": return ["BEGIN:VCARD", "VERSION:3.0", `FN:${vEsc(need("name"))}`, f.org && `ORG:${vEsc(f.org)}`, f.title && `TITLE:${vEsc(f.title)}`, f.phone && `TEL:${vEsc(f.phone)}`, f.email && `EMAIL:${vEsc(f.email)}`, f.url && `URL:${vEsc(f.url)}`, "END:VCARD"].filter(Boolean).join("\n");
    case "email": { const q = [f.subject && `subject=${encodeURIComponent(f.subject)}`, f.body && `body=${encodeURIComponent(f.body)}`].filter(Boolean).join("&"); return `mailto:${need("to")}${q ? "?" + q : ""}`; }
    case "phone": return `tel:${need("phone").replace(/\s+/g, "")}`;
    case "sms": return `SMSTO:${need("phone").replace(/\s+/g, "")}:${f.message ?? ""}`;
    case "whatsapp": return `https://wa.me/${need("phone").replace(/\D/g, "")}${f.message ? `?text=${encodeURIComponent(f.message)}` : ""}`;
    case "geo": { const lat = Number(need("lat")), lng = Number(need("lng")); if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("إحداثيات غير صالحة"); return `geo:${lat},${lng}`; }
  }
}

export type DotStyle = "square" | "rounded" | "dots" | "diamond" | "classy";
export type EyeStyle = "square" | "rounded" | "circle";
export interface QrStyle {
  dots: DotStyle; eyeOuter: EyeStyle; eyeInner: EyeStyle;
  fg: string; fg2?: string; angle: number; eyeColor?: string;
  bg: string; bgRadius: number; margin: number;
  ec: "L" | "M" | "Q" | "H";
  logo?: string; logoScale: number; // logo: data URI جاهز
  idSuffix?: string;
}
export const DEFAULT_QR_STYLE: Omit<QrStyle, "fg" | "bg"> = { dots: "rounded", eyeOuter: "rounded", eyeInner: "rounded", angle: 135, bgRadius: 0, margin: 2, ec: "Q", logoScale: 0.22 };

const f = (n: number) => +n.toFixed(3);
function rrect(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: number[]) {
  return `M${f(x + tl)} ${f(y)}H${f(x + w - tr)}${tr ? `A${tr} ${tr} 0 0 1 ${f(x + w)} ${f(y + tr)}` : ""}V${f(y + h - br)}${br ? `A${br} ${br} 0 0 1 ${f(x + w - br)} ${f(y + h)}` : ""}H${f(x + bl)}${bl ? `A${bl} ${bl} 0 0 1 ${f(x)} ${f(y + h - bl)}` : ""}V${f(y + tl)}${tl ? `A${tl} ${tl} 0 0 1 ${f(x + tl)} ${f(y)}` : ""}Z`;
}
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${f(2 * r)} 0a${r} ${r} 0 1 0 ${f(-2 * r)} 0Z`;
const eyeShape = (style: EyeStyle, x: number, y: number, s: number, rr: number) => style === "circle" ? circle(x + s / 2, y + s / 2, s / 2) : style === "rounded" ? rrect(x, y, s, s, [rr, rr, rr, rr]) : rrect(x, y, s, s, [0, 0, 0, 0]);

export interface QrResult { svg: string; warnings: string[]; modules: number }

/** يولّد SVG للـ QR. الألوان يجب أن تكون قيَم CSS جاهزة (hex). */
export function qrSvg(data: string, style: QrStyle, size = 1000): QrResult {
  const warnings: string[] = [];
  const ec = style.logo ? "H" : style.ec;
  const qr = QRCode.create(data, { errorCorrectionLevel: ec });
  const n = qr.modules.size, bits = qr.modules.data as unknown as ArrayLike<number>;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && !!bits[y * n + x];
  const inEye = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const m = Math.max(0, style.margin), total = n + m * 2;

  // منطقة الشعار: نمسح الوحدات تحتها
  const ls = style.logo ? Math.min(0.3, Math.max(0.08, style.logoScale)) * n : 0;
  const lc = n / 2, clear = (x: number, y: number) => ls > 0 && Math.abs(x + 0.5 - lc) < ls / 2 + 0.6 && Math.abs(y + 0.5 - lc) < ls / 2 + 0.6;

  let d = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!on(x, y) || inEye(x, y) || clear(x, y)) continue;
    const X = x + m, Y = y + m;
    switch (style.dots) {
      case "square": d += `M${X} ${Y}h1v1h-1Z`; break;
      case "dots": d += circle(X + 0.5, Y + 0.5, 0.46); break;
      case "diamond": d += `M${X + 0.5} ${Y - 0.05}L${X + 1.05} ${Y + 0.5}L${X + 0.5} ${Y + 1.05}L${X - 0.05} ${Y + 0.5}Z`; break;
      case "classy": d += rrect(X, Y, 1, 1, [0.5, 0, 0.5, 0]); break;
      case "rounded": { // نُدوّر الزوايا التي ليس فيها جار فقط، فتتصل الوحدات المتجاورة
        const u = on(x, y - 1), r = on(x + 1, y), b = on(x, y + 1), l = on(x - 1, y), R = 0.5;
        d += rrect(X, Y, 1, 1, [!u && !l ? R : 0, !u && !r ? R : 0, !b && !r ? R : 0, !b && !l ? R : 0]); break;
      }
    }
  }

  // العيون الثلاث: إطار 7×7 (بسماكة 1) + بؤبؤ 3×3
  let eyes = "";
  for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    const X = ex + m, Y = ey + m;
    eyes += eyeShape(style.eyeOuter, X, Y, 7, 2) + eyeShape(style.eyeOuter, X + 1, Y + 1, 5, 1.2); // evenodd يشكّل الحلقة
    eyes += eyeShape(style.eyeInner, X + 2, Y + 2, 3, 0.9);
  }

  const id = `qg${style.idSuffix ?? ""}`;
  const a = (style.angle * Math.PI) / 180, cx = total / 2, cy = total / 2, r = total / 2;
  const grad = style.fg2 ? `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(cx - Math.cos(a) * r)}" y1="${f(cy - Math.sin(a) * r)}" x2="${f(cx + Math.cos(a) * r)}" y2="${f(cy + Math.sin(a) * r)}"><stop offset="0" stop-color="${style.fg}"/><stop offset="1" stop-color="${style.fg2}"/></linearGradient></defs>` : "";
  const fill = style.fg2 ? `url(#${id})` : style.fg;
  const bg = style.bg && style.bg !== "transparent" ? `<rect width="${total}" height="${total}" rx="${style.bgRadius}" fill="${style.bg}"/>` : "";
  let logo = "";
  if (style.logo) {
    const s = ls + 1.2, pos = lc + m - s / 2;
    const pad = style.bg && style.bg !== "transparent" ? style.bg : "#FFFFFF";
    logo = `<rect x="${f(pos)}" y="${f(pos)}" width="${f(s)}" height="${f(s)}" rx="${f(s * 0.22)}" fill="${pad}"/><image href="${style.logo}" x="${f(pos + 0.3)}" y="${f(pos + 0.3)}" width="${f(s - 0.6)}" height="${f(s - 0.6)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="geometricPrecision">${grad}${bg}<path d="${d}" fill="${fill}"${style.dots === "square" ? ' shape-rendering="crispEdges"' : ""}/><path d="${eyes}" fill="${style.eyeColor ?? fill}" fill-rule="evenodd"/>${logo}</svg>`;

  // فحوصات قابلية المسح
  try {
    const bgc = style.bg === "transparent" ? "#FFFFFF" : style.bg;
    const c1 = contrast(style.fg, bgc), c2 = style.fg2 ? contrast(style.fg2, bgc) : c1;
    if (Math.min(c1, c2) < 3) warnings.push(`تباين اللون مع الخلفية ضعيف (${Math.min(c1, c2).toFixed(1)}) وقد يصعب المسح`);
    if (contrast(style.fg, "#000000") > contrast(bgc, "#000000")) warnings.push("الكود فاتح على خلفية أغمق (معكوس)، بعض القارئات القديمة لا تدعمه");
  } catch {}
  if (style.margin < 2) warnings.push("الهامش أقل من وحدتين، يُفضّل 2 فأكثر لمسح أسهل");
  if (n > 57) warnings.push(`المحتوى طويل (${n}×${n} وحدة)؛ الكود كثيف ويصعب مسحه من مسافة. اختصر الرابط إن أمكن`);
  if (style.logo && style.logoScale > 0.26) warnings.push("الشعار كبير؛ جرّب مسح الكود قبل الطباعة");
  return { svg, warnings, modules: n };
}
