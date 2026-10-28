// أيقونات Lucide بدل الإيموجي والرموز: كل رمز في الخريطة يتحوّل تلقائياً إلى أيقونة (للنص الحالي وأي نص يظهر لاحقاً).
// الأيقونة تُرسم بقناع CSS من /api/icon (SVG من مجموعة lucide على السيرفر) فتأخذ لون النص المحيط.
export const GLYPHS = {
  "💾": "save", "🌐": "languages", "📅": "calendar-days", "⚙": "settings", "🔒": "lock", "🔓": "lock-open", "✨": "sparkles", "🎬": "clapperboard",
  "📚": "gallery-horizontal", "⚡": "zap", "✂": "eraser", "▶": "play", "▲": "chevron-up", "▼": "chevron-down", "✕": "x", "✓": "check", "⚠": "triangle-alert",
  "⛔": "octagon-x", "ℹ": "info", "⧉": "copy", "⇄": "arrow-left-right", "↶": "undo-2", "↷": "redo-2", "◼": "square", "●": "circle", "⬬": "rectangle-horizontal",
  "◎": "badge", "░": "grid-3x3", "▦": "qr-code", "★": "star", "🖼": "image", "‹": "chevron-left", "›": "chevron-right",
  "⇤": "align-start-vertical", "⇔": "align-center-vertical", "⇥": "align-end-vertical", "⤒": "align-start-horizontal", "⇕": "align-center-horizontal", "⤓": "align-end-horizontal",
  "⇹": "align-horizontal-distribute-center", "⇳": "align-vertical-distribute-center",
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE = new RegExp(`(${Object.keys(GLYPHS).map(esc).join("|")})\\uFE0F?`, "gu");
const TEST = new RegExp(`${Object.keys(GLYPHS).map(esc).join("|")}`, "u");
const NO_MARKUP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "TITLE", "OPTION", "OPTGROUP", "SELECT"]);

export function ic(name, cls = "") { const el = document.createElement("i"); el.className = "ic" + (cls ? " " + cls : ""); el.style.setProperty("--m", `url(/api/icon?name=lucide:${name})`); el.setAttribute("aria-hidden", "true"); return el; }

function convertText(n) {
  const v = n.nodeValue, p = n.parentElement; if (!p) return;
  if (NO_MARKUP.has(p.tagName)) { if (TEST.test(v)) n.nodeValue = v.replace(RE, "").replace(/\s{2,}/g, " ").trim(); return; } // خيارات القوائم لا تقبل أيقونات
  const btn = p.tagName === "BUTTON" || p.classList.contains("btn");
  let parts = [], last = 0;
  // "+ نص" بأول زر → أيقونة plus، و"T نص" → أيقونة type
  const lead = btn ? v.match(/^(\s*)(\+|T)\s+(?=\S)/) : null; if (lead) { parts.push(ic(lead[2] === "+" ? "plus" : "type")); last = lead[0].length; }
  if (!lead && !TEST.test(v)) return;
  RE.lastIndex = last;
  for (const m of v.matchAll(RE)) {
    if (m.index < last) continue;
    const before = v.slice(last, m.index).replace(/\s+$/, ""); if (before) parts.push(before);
    parts.push(ic(GLYPHS[m[1]])); last = m.index + m[0].length;
  }
  const rest = v.slice(last).replace(/^\s+/, ""); if (rest) parts.push(rest);
  if (!parts.some((x) => typeof x !== "string")) return;
  n.replaceWith(...parts);
}
function stripAttrs(el) { for (const a of ["title", "placeholder", "label"]) { const v = el.getAttribute?.(a); if (v && TEST.test(v)) el.setAttribute(a, v.replace(RE, "").replace(/\s{2,}/g, " ").trim()); } }
function walk(n) {
  if (n.nodeType === 3) return convertText(n);
  if (n.nodeType !== 1 || n.tagName === "SCRIPT" || n.tagName === "STYLE" || n.classList?.contains("ic")) return;
  stripAttrs(n); if (n.tagName === "TEXTAREA") return;
  for (const c of [...n.childNodes]) walk(c);
}
export function startIcons() {
  walk(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach((x) => x.isConnected && walk(x));
      else if (m.type === "characterData") { if (m.target.isConnected) convertText(m.target); }
      else if (m.type === "attributes") stripAttrs(m.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["title", "placeholder", "label"] });
}
