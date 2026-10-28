import { competitionLookup, displayName } from "./teams.js";

/** القوالب: single/list/weekly/poll تدعم كل حالات المباراة تلقائياً. result/live قديمان (إعدادات افتراضية للحالة) */
export const TEMPLATES = {
  single: { ar: "مباراة واحدة", en: "Single match" }, list: { ar: "قائمة مباريات", en: "Matches list" }, weekly: { ar: "جدول أسبوعي", en: "Weekly schedule" }, poll: { ar: "تصويت (من سيفوز؟)", en: "Poll (who wins?)" },
  result: { ar: "النتيجة النهائية", en: "Full time", legacy: true }, live: { ar: "مباشر الآن", en: "Live now", legacy: true },
};
export const STATES = {
  scheduled: { ar: "مجدولة", en: "Scheduled" }, live: { ar: "مباشر", en: "LIVE" }, ht: { ar: "استراحة", en: "HT" }, ft: { ar: "انتهت", en: "FT" }, aet: { ar: "بعد التمديد", en: "AET" },
  pen: { ar: "ركلات الترجيح", en: "PEN" }, postponed: { ar: "مؤجلة", en: "Postponed" }, cancelled: { ar: "ملغاة", en: "Cancelled" }, suspended: { ar: "متوقفة", en: "Suspended" },
};
const TITLES = { // العنوان الافتراضي بحسب حالة المباراة
  ar: { scheduled: "مباراة اليوم", live: "مباشر الآن", ft: "النتيجة النهائية", ht: "استراحة بين الشوطين", list: "مباريات اليوم", listDone: "نتائج المباريات", weekly: "مباريات الأسبوع", poll: "من سيفوز؟" },
  en: { scheduled: "Match of the day", live: "Live now", ft: "Full time", ht: "Half time", list: "Today's matches", listDone: "Match results", weekly: "This week's fixtures", poll: "Who wins?" },
};
const WORDS = { ar: { draw: "تعادل", vote: "صوّت بالتعليقات", pens: "ركلات الترجيح" }, en: { draw: "Draw", vote: "Vote in the comments", pens: "Penalties" } };
const RED = "#D6173F", AMBER = "#FFB547";

const hexLum = (h) => { const m = /^#?([0-9a-f]{6})/i.exec(h ?? ""); if (!m) return 0; const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const mix = (a, b, t) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
export const parseMap = (txt) => Object.fromEntries(String(txt ?? "").split(/\r?\n/).map((l) => l.split("=").map((s) => s.trim())).filter((p) => p[0] && p[1] !== undefined));
/** يعزل الدقائق (12' أو 90+3') داخل نص عربي فتظهر العلامة بعد الرقم لا قبله */
const isoMinutes = (t) => String(t).replace(/(\d{1,3}(?:\+\d{1,2})?\s*['′’])/g, "\u2066$1\u2069");
const splitList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[,،|؛;\n]/)).map((x) => String(x).trim()).filter(Boolean);

/** يستنتج حالة المباراة من الحقل الحر القديم status ("67'", "FT", "استراحة"…) */
function inferState(status) {
  const s = String(status ?? "").trim(); if (!s) return null;
  if (/^\d{1,3}(\s*\+\s*\d{1,2})?\s*['′’]?$/.test(s)) return "live";
  if (/^(ft|full|انتهت|نهاية|نهائي)/i.test(s)) return "ft"; if (/^(ht|half|استراحة)/i.test(s)) return "ht"; if (/^(aet|extra|تمديد|بعد التمديد)/i.test(s)) return "aet";
  if (/pen|ترجيح/i.test(s)) return "pen"; if (/postp|مؤجل/i.test(s)) return "postponed"; if (/cancel|ملغ/i.test(s)) return "cancelled"; if (/susp|متوقف|أوقف/i.test(s)) return "suspended"; if (/live|مباشر/i.test(s)) return "live";
  return null;
}
const blankMatch = () => ({ home: "", away: "", time: "", note: "", hs: "", as: "", state: "", minute: "", pens: "", status: "", day: "", stadium: "", channels: [], homeEvents: [], awayEvents: [] });

/** يوحّد بيانات النموذج ويملأ القيم الافتراضية */
export function normalizeData(raw = {}, settings = {}) {
  const d = { template: "single", brand: "", lang: "ar", title: "", date: "", comp: "", swap: null, disclaimer: null, plate: true, glow: settings.teamGlow !== false, ...raw };
  if (!TEMPLATES[d.template]) throw new Error(`قالب غير معروف: ${d.template} (المتاح: ${Object.keys(TEMPLATES).join(", ")})`);
  d.lang = d.lang === "en" ? "en" : "ar";
  d.matches = (Array.isArray(d.matches) ? d.matches : []).map((m) => ({ ...blankMatch(), ...m, hs: m?.hs ?? "", as: m?.as ?? "", channels: splitList(m?.channels) }));
  if (!d.matches.length) d.matches = [blankMatch()];
  return d;
}

/** حالة المباراة الفعلية + نصها وألوانها (بحسب اللغة والقالب) */
export function stateOf(m, tpl, lang) {
  const hasScore = String(m.hs ?? "") !== "" && String(m.as ?? "") !== "";
  let st = STATES[m.state] ? m.state : inferState(m.status) ?? (tpl === "result" ? "ft" : tpl === "live" ? "live" : hasScore ? "ft" : "scheduled");
  const minute = String(m.minute || (inferState(m.status) === "live" && /\d/.test(m.status ?? "") ? m.status : "")).trim();
  const showScore = !["scheduled", "postponed", "cancelled"].includes(st), label = STATES[st][lang];
  const tone = st === "live" ? { fill: RED, text: "#FFFFFF" } : st === "ht" || st === "postponed" || st === "suspended" ? { fill: AMBER, text: "#1A1200" } : st === "cancelled" ? { fill: RED, text: "#FFFFFF", soft: true } : null; // null = شارة هادئة (ft/aet/pen)
  return { st, label, showScore, minute, tone, pens: String(m.pens ?? "").trim() };
}

/** يبني تصميم mycanva كاملاً من بيانات المباريات. logoOf(name) → {ref, colors}|null */
export function buildMatchDesign({ data, brand, brandId, format, size, logoOf, settings }) {
  const d = data, W = size.w, H = size.h, lang = d.lang, ar = lang === "ar", rtlBrand = brand.direction === "rtl", tpl = d.template;
  const wide = W / H > 1.5, scale = (W / 1080) * (wide ? 0.72 : 1), pad = (wide ? 44 : 70) * (W / 1080), els = [], missing = new Set();
  const swapped = d.swap ?? ar, dark = hexLum(brand.colors.bg) < 0.4, words = WORDS[lang];
  const A = (side) => (side === "center" ? "center" : (side === "left") === rtlBrand ? "end" : "start"); // محاذاة فيزيائية ← منطقية
  const border = mix(brand.colors.surface, brand.colors.text, dark ? 0.2 : 0.14);
  const sat = (h) => { const m = /^#?([0-9a-f]{6})/i.exec(h ?? ""); if (!m) return 0; const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; return Math.max(...c) - Math.min(...c); };
  const pickColor = (cols = []) => cols.find((c) => sat(c) > 50 && hexLum(c) > 0.02) ?? null;

  const team = (name) => {
    const raw = String(name ?? "").trim(), lg = raw ? logoOf(raw) : null; if (raw && !lg) missing.add(raw);
    return { name: settings.autoNames === false ? raw : displayName(raw, lang), ref: lg?.ref ?? null, color: pickColor(lg?.colors) };
  };
  /* ---- لبنات ---- */
  const text = (t, x, cy, o = {}) => {
    if (t == null || String(t).trim() === "") return; const sz = o.size ?? 32, maxW = o.maxW ?? W - pad * 2, align = o.align ?? "center", h = Math.round(sz * 1.5);
    const bx = align === "center" ? x - maxW / 2 : align === "left" ? x : x - maxW;
    els.push({ type: "text", text: String(t), x: Math.round(bx), y: Math.round(cy - h / 2), w: Math.round(maxW), h, font: o.font ?? "body", size: Math.round(sz), weight: o.weight ?? 600, color: o.color ?? "text", align: A(align), valign: "middle", lineHeight: 1.15, fit: true, ...(o.opacity != null ? { opacity: o.opacity } : {}) });
  };
  const shape = (kind, x, y, w, h, fill, o = {}) => els.push({ type: "shape", kind, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), fill, ...o });
  const glow = (cx, cy, dia, color, op) => shape("circle", cx - dia / 2, cy - dia / 2, dia, dia, color, { gradient: { from: color, to: "transparent", angle: 0, kind: "radial" }, opacity: op });
  const pill = (cx, cy, w, h, fill, o = {}) => shape("pill", cx - w / 2, cy - h / 2, w, h, fill, o);
  const icon = (name, x, y, sz, color = "muted") => els.push({ type: "icon", name, x: Math.round(x), y: Math.round(y), size: Math.round(sz), color, strokeWidth: 2 });
  /** شارة حالة (LIVE، FT، دقيقة…) */
  const badge = (label, cx, cy, info, sz) => {
    const w = Math.max(String(label).length * sz * 0.62 + sz * 1.4, sz * 3.2), h = sz * 1.9;
    if (info.tone) pill(cx, cy, w, h, info.tone.fill, info.tone.soft ? { opacity: 0.92 } : {}); else pill(cx, cy, w, h, "surface", { stroke: "muted", strokeWidth: 2 });
    text(label, cx, cy, { size: sz, weight: 800, font: "heading", color: info.tone ? info.tone.text : "muted", maxW: w - sz * 0.6 });
  };
  /** سطر معلومات مع أيقونة (ملعب/قنوات/ملاحظة) بمنتصف cx */
  const infoLine = (line, cx, cy, sz, maxW) => {
    const tw = Math.min(maxW, String(line.text).length * sz * 0.52), isz = sz * 1.15, gap = sz * 0.5, total = tw + isz + gap, left = cx - total / 2;
    // الأيقونة من جهة بداية القراءة (يمين بالعربي)
    const ix = ar ? left + tw + gap : left, tx = ar ? left + tw / 2 : left + isz + gap + tw / 2;
    icon(line.icon, ix, cy - isz / 2, isz); text(line.text, tx, cy, { size: sz, weight: 500, color: "muted", maxW: tw + 8 });
  };
  const infoLines = (m) => [m.stadium && { icon: "map-pin", text: m.stadium, key: "stadium" }, m.channels?.length && { icon: "tv", text: m.channels.join(" · "), key: "channels" }, m.note && { icon: "info", text: m.note, key: "note" }].filter(Boolean);

  function background() { glow(W * 0.2, -H * 0.05, W * 1.8, "primary", 0.2); glow(W * 0.9, H * 1.02, W * 1.6, "secondary", 0.2); }
  function plate(name, cx, cy, size) {
    const t = team(name);
    if (d.glow !== false && t.color) glow(cx, cy, size * 1.9, t.color, 0.32);
    if (d.plate !== false) { const bw = Math.max(2, size / 30); shape("circle", cx - size / 2 - bw, cy - size / 2 - bw, size + bw * 2, size + bw * 2, border); shape("circle", cx - size / 2, cy - size / 2, size, size, "surface"); }
    const inner = d.plate !== false ? size * 0.68 : size;
    if (t.ref) els.push({ type: "image", src: t.ref, x: Math.round(cx - inner / 2), y: Math.round(cy - inner / 2), w: Math.round(inner), h: Math.round(inner), fit: "contain" });
    else text((t.name || "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(), cx, cy, { size: size * 0.32, weight: 700, color: "muted", font: "heading", maxW: size });
    return t;
  }
  function timePill(t, cx, cy, size) {
    if (!t) { text("VS", cx, cy, { size: size * 0.5, weight: 800, color: "muted", font: "heading", maxW: size * 3 }); return; }
    const pw = Math.max(String(t).length * size * 0.62 + size, size * 3); pill(cx, cy, pw, size * 1.6, "primary"); text(t, cx, cy, { size, weight: 800, color: "onPrimary", font: "heading", maxW: pw - size * 0.6 });
  }
  const sides = (m) => (swapped ? { l: m.away, r: m.home, ls: m.as, rs: m.hs, le: m.awayEvents, re: m.homeEvents } : { l: m.home, r: m.away, ls: m.hs, rs: m.as, le: m.homeEvents, re: m.awayEvents });
  const scoreText = (m, info) => { const s = sides(m), a = String(s.ls) === "" ? "0" : s.ls, b = String(s.rs) === "" ? "0" : s.rs; return `${a} - ${b}`; };

  function defaultTitle() {
    const T = TITLES[lang], infos = d.matches.filter((m) => m.home || m.away).map((m) => stateOf(m, tpl, lang));
    if (tpl === "poll") return T.poll; if (tpl === "weekly") return T.weekly;
    if (tpl === "list") return infos.length && infos.every((i) => ["ft", "aet", "pen"].includes(i.st)) ? T.listDone : T.list;
    const i = infos[0] ?? { st: "scheduled" }; return ["ft", "aet", "pen"].includes(i.st) ? T.ft : i.st === "live" ? T.live : i.st === "ht" ? T.ht : T.scheduled;
  }
  function header() {
    const title = (d.title || "").trim() || defaultTitle(), wmH = Math.round(64 * scale);
    if (brand.logo?.default) els.push({ type: "logo", x: Math.round(pad), y: Math.round(pad), w: Math.round(W - pad * 2), h: wmH, align: A(ar ? "right" : "left"), variant: dark && brand.logo.light ? "light" : "default" });
    const cl = d.comp && logoOf(d.comp);
    if (cl?.ref) els.push({ type: "image", src: cl.ref, x: Math.round(ar ? pad : W - pad - wmH), y: Math.round(pad), w: wmH, h: wmH, fit: "contain" });
    let y = pad + wmH + 90 * scale;
    text(title, W / 2, y, { size: 84 * scale, weight: 800, font: "heading", maxW: W - pad * 2 }); y += 84 * scale;
    const sub = [d.date, d.comp && (competitionLookup(d.comp) ? (ar ? competitionLookup(d.comp).ar : competitionLookup(d.comp).en) : d.comp)].map((s) => String(s ?? "").trim()).filter(Boolean).join("  ·  ");
    if (sub) { text(sub, W / 2, y, { size: 34 * scale, weight: 500, color: "muted", maxW: W - pad * 2 }); y += 30 * scale; }
    return y + 40 * scale;
  }
  function footer() {
    const y = H - pad * 0.7, foot = parseMap(settings.footerMap)[brandId] ?? "", discOn = d.disclaimer ?? String(settings.disclaimerBrands ?? "").split(/[,\s]+/).includes(brandId);
    if (foot) text(foot, ar ? pad : W - pad, y, { size: 34 * scale, weight: 600, color: "primary", align: ar ? "left" : "right", maxW: 400 });
    const disc = ar ? settings.disclaimerAr : settings.disclaimerEn;
    if (discOn && disc) text(disc, ar ? W - pad : pad, y, { size: 20 * scale, weight: 400, color: "muted", align: ar ? "right" : "left", maxW: W - pad * 2 - (foot ? 360 : 0) });
  }

  /* ---- مباراة واحدة: تتكيّف مع كل الحالات ---- */
  function single(y0) {
    const m = d.matches[0], s = sides(m), info = stateOf(m, tpl, lang), free = H - y0 - pad * 1.2, lines = infoLines(m).slice(0, 3);
    const evN = Math.min(5, Math.max(s.le?.length ?? 0, s.re?.length ?? 0)), reserve = (evN ? 40 * scale + evN * 42 * scale : 0) + (lines.length ? lines.length * 54 * scale + 30 * scale : 0) + (info.pens ? 40 * scale : 0) + 110 * scale;
    const size = Math.max(110 * scale, Math.min(W * 0.26, free * 0.55, (free - reserve) * 0.78)), avail = Math.max(0, free - reserve - size), dx = W * 0.3;
    const cy = y0 + size / 2 + 36 * scale + avail * (H / W > 1.6 ? 0.45 : wide ? 0.2 : 0.35);
    const tl = plate(s.l, W / 2 - dx, cy, size), tr = plate(s.r, W / 2 + dx, cy, size), ny = cy + size / 2 + 56 * scale;
    text(tl.name, W / 2 - dx, ny, { size: 44 * scale, weight: 700, maxW: W * 0.36 }); text(tr.name, W / 2 + dx, ny, { size: 44 * scale, weight: 700, maxW: W * 0.36 });
    const bs = Math.min(130 * scale, size * 0.62);
    if (info.showScore) {
      text(scoreText(m, info), W / 2, cy, { size: bs, weight: 800, font: "heading", maxW: W * 0.28 });
      if (info.st === "live") { badge(STATES.live[lang], W / 2, cy - bs * 0.85, info, 26 * scale); if (info.minute) badge(info.minute, W / 2, cy + bs * 0.8, { tone: { fill: mix(RED, "#000000", 0.25), text: "#FFFFFF" } }, 26 * scale); }
      else badge(info.label, W / 2, cy + bs * 0.8, info, 26 * scale);
      if (info.st === "pen" && info.pens) text(`(${info.pens})`, W / 2, cy + bs * 0.8 + 56 * scale, { size: 30 * scale, weight: 700, color: "muted", font: "heading", maxW: W * 0.3 });
    } else if (info.st === "scheduled") timePill(m.time, W / 2, cy, 64 * scale);
    else { badge(info.label, W / 2, cy, info, 30 * scale); if (m.time) text(m.time, W / 2, cy + 64 * scale, { size: 30 * scale, weight: 600, color: "muted", font: "heading", maxW: W * 0.28 }); }
    let y = ny + 30 * scale;
    for (let i = 0; i < evN; i++) { y += 42 * scale; if (s.le?.[i]) text(isoMinutes(s.le[i]), W / 2 - dx, y, { size: 28 * scale, weight: 500, color: "muted", maxW: W * 0.4 }); if (s.re?.[i]) text(isoMinutes(s.re[i]), W / 2 + dx, y, { size: 28 * scale, weight: 500, color: "muted", maxW: W * 0.4 }); }
    if (evN) y += 20 * scale; y += info.pens ? 20 * scale : 0;
    for (const ln of lines) { y += 54 * scale; infoLine(ln, W / 2, y, 32 * scale, W - pad * 2.4); }
  }
  /* ---- بطاقة صف (قائمة/جدول) ---- */
  function rowCard(m, x, y, rowW, rh) {
    shape("rect", x, y, rowW, rh, "surface", { radius: Math.round(26 * scale), stroke: border, strokeWidth: 2 });
    const s = sides(m), info = stateOf(m, tpl, lang), ls = Math.min(rh * 0.72, 120 * scale), cy = y + rh / 2, lx = x + 26 * scale + ls / 2, rx = x + rowW - 26 * scale - ls / 2, mid = x + rowW / 2, nameW = rowW / 2 - ls - 130 * scale;
    const tl = plate(s.l, lx, cy, ls), tr = plate(s.r, rx, cy, ls);
    // العمود الأوسط: الرئيسي (نتيجة/وقت/حالة) ثم الشارة ثم سطور المعلومات بحسب ما يتسع
    const mainSz = Math.min(40 * scale, rh * 0.26), badgeSz = Math.min(20 * scale, rh * 0.13), lnSz = Math.min(22 * scale, rh * 0.15);
    const needsBadge = info.showScore || ["postponed", "cancelled"].includes(info.st), lines = infoLines(m);
    const avail = rh - 2 * 10 * scale, mainH = (info.showScore ? mainSz * 1.5 : mainSz * 1.6), badgeH = needsBadge && info.showScore ? badgeSz * 2.2 : 0, lnH = lnSz * 1.7;
    let n = Math.min(lines.length, 3); while (n > 0 && mainH + badgeH + n * lnH > avail) n--; // نُسقط الأقل أولوية (الملاحظة ثم الملعب) إن ضاق الصف
    const shown = lines.slice(0, n), total = mainH + badgeH + shown.length * lnH; let yy = cy - total / 2;
    if (info.showScore) text(scoreText(m, info), mid, yy + mainH / 2, { size: Math.min(52 * scale, rh * 0.34), weight: 800, font: "heading", maxW: rowW * 0.2 });
    else if (info.st === "scheduled") timePill(m.time, mid, yy + mainH / 2, mainSz); else badge(info.label, mid, yy + mainH / 2, info, Math.min(24 * scale, rh * 0.16));
    yy += mainH;
    if (badgeH) { const lab = info.st === "live" ? (info.minute || STATES.live[lang]) : info.label; badge(lab, mid, yy + badgeH / 2, info.st === "live" ? { tone: { fill: RED, text: "#FFFFFF" } } : info, badgeSz); yy += badgeH; }
    for (const ln of shown) { yy += lnH; infoLine(ln, mid, yy - lnH / 2, lnSz, rowW * 0.4); }
    text(tl.name, lx + ls / 2 + 20 * scale, cy, { size: 36 * scale, weight: 700, align: "left", maxW: nameW }); text(tr.name, rx - ls / 2 - 20 * scale, cy, { size: 36 * scale, weight: 700, align: "right", maxW: nameW });
  }
  function list(y0) {
    const ms = d.matches.filter((m) => m.home || m.away || m.time), n = Math.max(1, ms.length), free = H - y0 - pad * 1.4, gap = 16 * scale, rh = Math.min(170 * scale, (free - gap * (n - 1)) / n), rowW = W - pad * 2;
    ms.forEach((m, i) => rowCard(m, pad, y0 + i * (rh + gap), rowW, rh));
  }
  function weekly(y0) {
    const ms = d.matches.filter((m) => m.home || m.away), groups = []; for (const m of ms) { const k = m.day || ""; let g = groups.find((x) => x.k === k); if (!g) groups.push((g = { k, ms: [] })); g.ms.push(m); }
    const n = Math.max(1, ms.length), gh = groups.filter((g) => g.k).length * 56 * scale, gap = 12 * scale, free = H - y0 - pad * 1.4 - gh, rh = Math.min(150 * scale, (free - gap * (n - 1)) / n), rowW = W - pad * 2; let y = y0;
    for (const g of groups) { if (g.k) { text(g.k, W / 2, y + 22 * scale, { size: 32 * scale, weight: 700, color: "primary", font: "heading", maxW: rowW }); y += 56 * scale; } for (const m of g.ms) { rowCard(m, pad, y, rowW, rh); y += rh + gap; } }
  }
  function poll(y0) {
    const m = d.matches[0], s = sides(m), free = H - y0 - pad * 1.2, lines = infoLines(m).slice(0, 2), size = Math.min(W * 0.28, free * 0.5), cy = y0 + free * 0.4, dx = W * 0.3;
    const tl = plate(s.l, W / 2 - dx, cy, size), tr = plate(s.r, W / 2 + dx, cy, size), ny = cy + size / 2 + 56 * scale;
    text(tl.name, W / 2 - dx, ny, { size: 44 * scale, weight: 700, maxW: W * 0.36 }); text(tr.name, W / 2 + dx, ny, { size: 44 * scale, weight: 700, maxW: W * 0.36 });
    for (const [x, lab] of [[W / 2 - dx, swapped ? "2" : "1"], [W / 2, "X"], [W / 2 + dx, swapped ? "1" : "2"]]) { const by = x === W / 2 ? cy : ny + 100 * scale; pill(x, by, 150 * scale, 90 * scale, x === W / 2 ? "primary" : "surface", x === W / 2 ? {} : { stroke: "primary", strokeWidth: 3 }); text(lab, x, by, { size: 52 * scale, weight: 800, color: x === W / 2 ? "onPrimary" : "primary", font: "heading", maxW: 120 * scale }); }
    text(words.draw, W / 2, cy + 90 * scale, { size: 30 * scale, weight: 600, color: "muted", maxW: W * 0.25 });
    text(words.vote, W / 2, ny + 230 * scale, { size: 36 * scale, weight: 600, color: "muted", maxW: W - pad * 2 });
    let y = ny + 310 * scale; if (m.time) { text(m.time, W / 2, y, { size: 32 * scale, weight: 600, color: "muted", font: "heading", maxW: W - pad * 2 }); y += 20 * scale; }
    for (const ln of lines) { y += 54 * scale; infoLine(ln, W / 2, y, 30 * scale, W - pad * 2.4); }
  }

  background(); const y0 = header();
  ({ single: () => single(y0), result: () => single(y0), live: () => single(y0), list: () => list(y0), weekly: () => weekly(y0), poll: () => poll(y0) })[tpl]();
  footer();

  const clean = { ...d, brand: brandId };
  return { brand: brandId, format, ...(format === "custom" ? { width: W, height: H } : {}), background: "bg", elements: els, caption: caption(d, lang, team, settings, tpl), hashtags: hashtags(d, lang, team, brand, settings), meta: { matchTool: { v: 2, data: clean, missing: [...missing] } } };
}

function caption(d, lang, team, settings, tpl) {
  const ar = lang === "ar", T = TITLES[lang], infos = d.matches.map((m) => stateOf(m, tpl, lang)), first = infos[0]?.st ?? "scheduled";
  const title = (d.title || "").trim() || (tpl === "list" ? T.list : tpl === "weekly" ? T.weekly : tpl === "poll" ? T.poll : ["ft", "aet", "pen"].includes(first) ? T.ft : first === "live" ? T.live : T.scheduled);
  const comp = d.comp && competitionLookup(d.comp) ? (ar ? competitionLookup(d.comp).ar : competitionLookup(d.comp).en) : d.comp;
  const lines = [title, [d.date, comp].filter(Boolean).join(" · ")].filter(Boolean);
  d.matches.forEach((m, i) => {
    if (!m.home && !m.away) return; const h = team(m.home).name, a = team(m.away).name, info = infos[i];
    const mid = info.showScore ? `${m.hs === "" ? 0 : m.hs}-${m.as === "" ? 0 : m.as}` : ar ? "×" : "vs", tail = info.st === "scheduled" ? (m.time ? ` — ${m.time}` : "") : info.st === "live" ? ` — ${info.minute || STATES.live[lang]}` : ` — ${info.label}`;
    lines.push(`${h} ${mid} ${a}${tail}`);
    if (m.stadium) lines.push(`${ar ? "الملعب" : "Stadium"}: ${m.stadium}`);
    if (m.channels?.length) lines.push(`${ar ? "القنوات الناقلة" : "Broadcast"}: ${m.channels.join(" · ")}`);
    if (m.note) lines.push(m.note);
  });
  const foot = parseMap(settings.footerMap)[d.brand] ?? ""; if (foot) lines.push("", foot);
  return lines.join("\n");
}
function hashtags(d, lang, team, brand, settings) {
  const tag = (s) => { const t = String(s ?? "").replace(/[^\p{L}\p{N}]+/gu, ""); return t ? "#" + t : ""; };
  const comp = d.comp && competitionLookup(d.comp) ? competitionLookup(d.comp)[lang === "ar" ? "ar" : "en"] : d.comp;
  const all = [tag(comp), ...d.matches.flatMap((m) => [tag(team(m.home).name), tag(team(m.away).name)]), ...String(settings.hashtagsExtra ?? "").split(/\s+/), ...(brand.voice?.hashtags ?? []), lang === "ar" ? "#مباراة_اليوم" : "#matchday"];
  return [...new Set(all.map((t) => (t.startsWith("#") ? t : t ? "#" + t : "")).filter(Boolean))].slice(0, 12);
}
