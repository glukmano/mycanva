// الترجمة: النصوص الأصلية عربية. بوضع English يترجمها قاموس + قواعد للنصوص الديناميكية،
// ومراقب DOM يترجم أي نص أو سمة (title/placeholder/label) تظهر لاحقاً، فلا نحتاج لمسها واحدة واحدة.
import { EN } from "./i18n-dict.js";

export const LANG = (() => { try { return localStorage.getItem("lang") === "en" ? "en" : "ar"; } catch { return "ar"; } })();
export const isEn = LANG === "en";
export const extendRules = (r) => { for (const x of r ?? []) RULES.unshift(x); };
export const extendDict = (d) => { if (d && typeof d === "object") Object.assign(EN, d); };
export function setLang(v) { try { localStorage.setItem("lang", v === "en" ? "en" : "ar"); } catch {} location.reload(); }

const AR = /[؀-ۿ]/;
const num = (s) => s;
const plural = (n, one, many) => `${n} ${+n === 1 ? one : many}`;
const RULES = [
  [/^(\d+) أدوات MCP$/, (m) => `${m[1]} MCP tools`],
  [/^(\d+) مسارات$/, (m) => `${m[1]} routes`],
  [/^(.+) — الإعدادات$/, (m) => `${m[1]} — Settings`],
  [/^إزالة الإضافة «(.+)»؟$/, (m) => `Remove the plugin “${m[1]}”?`],
  [/^تعذّر تحميل واجهة الإضافة (.+?): (.+)$/, (m) => `Couldn't load the plugin UI ${m[1]}: ${m[2]}`],
  [/^plugin\.json غير صالح: (.+)$/, (m) => `plugin.json is invalid: ${m[1]}`],
  [/^id \((.+)\) لا يطابق اسم المجلد \((.+)\)$/, (m) => `id (${m[1]}) doesn't match the folder name (${m[2]})`],
  [/^تحتاج التطبيق (.+) \(الحالي (.+)\)$/, (m) => `Requires app ${m[1]} (current ${m[2]})`],
  [/^الإضافة غير موجودة: (.+)$/, (m) => `Plugin not found: ${m[1]}`],
  [/^ملف zip غير صالح: (.+)$/, (m) => `Invalid zip file: ${m[1]}`],
  [/^(\d+) عناصر محددة$/, (m) => `${m[1]} elements selected`],
  [/^(\d+) عناصر متحركة · المدة ≈ ([\d.]+) ث$/, (m) => `${m[1]} animated elements · duration ≈ ${m[2]} s`],
  [/^⚠ (\d+) ملاحظات$/, (m) => `⚠ ${m[1]} issues`],
  [/^✓ مطابق \((\d+) تلميحات\)$/, (m) => `✓ Matches (${m[1]} hints)`],
  [/^✓ (\d+) صفوف من الملف$/, (m) => `✓ ${m[1]} rows from the file`],
  [/^تم التصدير · ([\d.]+) ث$/, (m) => `Exported · ${m[1]} s`],
  [/^تم حفظ الهوية لكن تعذّر حفظ الشعار: (.+)$/, (m) => `Brand saved but the logo couldn't be saved: ${T(m[1])}`],
  [/^خطوط الموقع: (.*?)(?: \/ سأستعمل (.+)| \(لا مطابق متوفر، سأستعمل الافتراضي\))$/, (m) => `Site fonts: ${m[1].replaceAll("، ", ", ")}${m[2] ? ` → will use ${m[2]}` : " (no match available, using the default)"}`],
  [/^تعذّر جلب (.+) \((\d+)\)$/, (m) => `Couldn't fetch ${m[1]} (${m[2]})`],
  [/^عمود غير معروف تم تجاهله: "(.+)"$/, (m) => `Unknown column ignored: "${m[1]}"`],
  [/^(\d+) صفوف تاريخها ليس بصيغة YYYY-MM-DD وسيُتجاهل$/, (m) => `${m[1]} rows have a date not in YYYY-MM-DD format; it will be ignored`],
  [/^قالب المستخدم غير موجود: (.+)$/, (m) => `User template not found: ${m[1]}`],
  [/^ffmpeg فشل: (.*)$/, (m) => `ffmpeg failed: ${m[1]}`],
  [/^لون خارج الهوية: (.+)$/, (m) => `Color outside the brand: ${m[1]}`],
  [/^حجم الخط صغير \((\d+)px\) وقد لا يُقرأ على الجوال$/, (m) => `Font size is small (${m[1]}px); it may be hard to read on phones`],
  [/^تباين النص ضعيف \(([\d.]+) من ([\d.]+)\)$/, (m) => `Weak text contrast (${m[1]} of ${m[2]})`],
  [/^الـ QR صغير \((\d+)px\) وقد يصعب مسحه$/, (m) => `The QR is small (${m[1]}px); it may be hard to scan`],
  [/^تباين الـ QR ضعيف \(([\d.]+)\)$/, (m) => `Weak QR contrast (${m[1]})`],
  [/^(.+?) \((\u2066\d+×\d+\u2069)\)$/, (m) => { const t = T(m[1]); return t === m[1] ? null : `${t} (${m[2]})`; }],
  [/^(.+?) · (⁦\d+×\d+⁩)$/, (m) => `${T(m[1])} · ${m[2]}`],
  [/^(⁦[^⁩]+⁩) بكسل · نسبة (.+) · التصدير بدقة مضاعفة \(حتى (⁦[^⁩]+⁩)\)$/, (m) => `${m[1]} px · ratio ${m[2]} · exported at 2× (up to ${m[3]})`],
  [/^المقاس يجب أن يكون بين (\d+) و(\d+) بكسل$/, (m) => `Size must be between ${m[1]} and ${m[2]} px`],
  [/^تم التصدير (.+)$/, (m) => `Exported ${m[1]}`],
  [/^الهوية «(.+)» غير موجودة$/, (m) => `Brand “${m[1]}” not found`],
  [/^تم إنشاء (\d+) شرائح$/, (m) => `Created ${plural(m[1], "slide", "slides")}`],
  [/^تم إنشاء (\d+) تصميم$/, (m) => `Created ${plural(m[1], "design", "designs")}`],
  [/^تم تصدير (\d+) ?(شريحة|صورة)?$/, (m) => `Exported ${m[1]} ${m[2] === "شريحة" ? "slides" : m[2] === "صورة" ? "images" : "files"}`],
  [/^حذف المجموعة «(.+)» بكل تصاميمها \((\d+)\)؟ لا يمكن التراجع\.$/, (m) => `Delete the group “${m[1]}” with all its designs (${m[2]})? This can't be undone.`],
  [/^حذف التصميم «(.+)»؟ لا يمكن التراجع\.$/, (m) => `Delete the design “${m[1]}”? This can't be undone.`],
  [/^(\d+) شرائح$/, (m) => `${m[1]} slides`],
  [/^(\d+) هويات · (\d+) تصميم$/, (m) => `${plural(m[1], "brand", "brands")} · ${plural(m[2], "design", "designs")}`],
  [/^(\d+) تصميم$/, (m) => plural(m[1], "design", "designs")],
  [/^سيتم إنشاء (\d+) تصميم$/, (m) => `${plural(m[1], "design", "designs")} will be created`],
  [/^✓ (\d+)×(\d+) وحدة · جرّب مسحه بجوالك قبل الطباعة$/, (m) => `✓ ${m[1]}×${m[2]} modules · test-scan it with your phone before printing`],
  [/^(\d+) ث$/, (m) => `${m[1]} s`], [/^(\d+) د$/, (m) => `${m[1]} min`], [/^(\d+) س (\d+) د$/, (m) => `${m[1]} h ${m[2]} min`],
  [/^السيرفر شغّال · (\d+) أداة MCP( · النفق \(ChatGPT\) فعّال)?$/, (m) => `Server running · ${m[1]} MCP tools${m[2] ? " · tunnel (ChatGPT) active" : ""}`],
  [/^✓ اتصال MCP سليم — (\d+) أداة \((\d+)ms\)$/, (m) => `✓ MCP connection OK — ${m[1]} tools (${m[2]}ms)`],
  [/^شغّال منذ (.+) · المنفذ (\d+) · PID (\d+)$/, (m) => `Running for ${T(m[1])} · port ${m[2]} · PID ${m[3]}`],
  [/^(\d+) أداة$/, (m) => `${m[1]} tools`],
  [/^(.+) · آخر نشاط (.+)$/, (m) => `${T(m[1])} · last activity ${m[2]}`],
  [/^الإصدار (.+) · Node (.+)$/, (m) => `Version ${m[1]} · Node ${m[2]}`],
  [/^قائمة الأدوات \((\d+)\)$/, (m) => `Tools list (${m[1]})`],
  [/^(ngrok|cloudflared) ?(\(غير مثبّت\))?$/, (m) => m[1] + (m[2] ? " (not installed)" : "")],
  [/^تعذّر التشغيل: (.+)$/, (m) => `Couldn't start: ${T(m[1])}`],
  [/^تعذّر الاتصال بالسيرفر: (.+)$/, (m) => `Can't reach the server: ${T(m[1])}`],
  [/^إن كنت تشغّل نفقك بنفسك .*المنفذ (\d+) وضع رابطه هنا:$/, (m) => `If you run your own tunnel (ngrok with a fixed domain, Cloudflare Tunnel…), point it at port ${m[1]} and put its link here:`],
  [/^الأعمدة بالترتيب \(افصل بـ \| \): (.*?)( — النقاط افصلها بـ ;)?$/, (m) => `Columns in order (separate with | ): ${m[1].split(" | ").map(T).join(" | ")}${m[2] ? " — separate items with ;" : ""}`],
  [/^النص يتجاوز الصندوق: (.+)$/, (m) => `Text overflows its box: ${m[1]}`],
  [/^تم تصغير الخط ([\d.]+)→([\d.]+): (.+)$/, (m) => `Font shrunk ${m[1]}→${m[2]}: ${m[3]}`],
  [/^أيقونة غير موجودة: (.+)$/, (m) => `Icon not found: ${m[1]}`],
  [/^الملف غير موجود: (.+)$/, (m) => `File not found: ${m[1]}`],
  [/^مقاس غير معروف: (.+)$/, (m) => `Unknown size: ${m[1]}`],
  [/^قالب غير معروف: (.+?) \(المتاح: (.+)\)$/, (m) => `Unknown template: ${m[1]} (available: ${m[2]})`],
  [/^تباين ضعيف \((.+)\): (.+)$/, (m) => `Weak contrast (${m[1]}): ${m[2]}`],
  [/^توقف النفق \((.+)\)\. (.*)$/, (m) => `The tunnel stopped (${m[1]}). ${T(m[2])}`],
  [/^الحقل مطلوب: (.+)$/, (m) => `Required field: ${T(m[1])}`],
  [/^تباين اللون مع الخلفية ضعيف \((.+)\) وقد يصعب المسح$/, (m) => `Weak contrast with the background (${m[1]}); the code may be hard to scan`],
  [/^المحتوى طويل \((\d+)×(\d+) وحدة\)؛.*$/, (m) => `Long content (${m[1]}×${m[2]} modules); the code is dense and hard to scan from a distance. Shorten the link if possible`],
  [/^([\w.-]+): (.+)$/, (m) => { const t = T(m[2]); return t === m[2] ? null : `${m[1]}: ${t}`; }],
  [/^(.+ · .+)$/, (m) => { const parts = m[1].split(" · "), tr = parts.map((x) => T(x)); return tr.some((x, i) => x !== parts[i]) ? tr.join(" · ") : null; }],
];

const SEP = " — ⚠ ";
export function T(s) {
  if (!isEn || typeof s !== "string" || !AR.test(s)) return s;
  const m0 = s.match(/^(\s*)([\s\S]*?)(\s*)$/), core = m0[2];
  let out = EN[core];
  if (out == null && core.includes(SEP)) out = core.split(SEP).map(T).join(SEP);
  if (out == null) for (const [re, fn] of RULES) { const m = core.match(re); if (m) { const r = fn(m); if (r != null) { out = r; break; } } }
  return out == null ? s : m0[1] + out + m0[3];
}

const ATTRS = ["title", "placeholder", "label", "alt", "aria-label"];
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);
function fixNode(n) {
  if (n.nodeType === 3) { if (!n.parentElement || SKIP.has(n.parentElement.tagName)) return; const v = n.nodeValue; if (AR.test(v)) { const t = T(v); if (t !== v) n.nodeValue = t; } }
  else if (n.nodeType === 1) {
    if (n.tagName === "SCRIPT" || n.tagName === "STYLE") return;
    for (const a of ATTRS) { const v = n.getAttribute(a); if (v && AR.test(v)) { const t = T(v); if (t !== v) n.setAttribute(a, t); } }
    if (n.tagName !== "TEXTAREA") for (const c of n.childNodes) fixNode(c); // محتوى textarea بيانات المستخدم فلا نترجمه
  }
}
export function startI18n() {
  if (!isEn) return;
  document.documentElement.lang = "en"; document.documentElement.dir = "ltr";
  document.title = T(document.title);
  fixNode(document.body);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(fixNode);
      else if (m.type === "characterData") fixNode(m.target);
      else if (m.type === "attributes") fixNode(m.target);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
