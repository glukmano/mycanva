import { T, isEn, startI18n, setLang, extendDict, extendRules } from "./i18n.js";
import { ic, startIcons } from "./icons.js";
const ask = (m) => confirm(T(m));
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) { if (sk.includes("-")) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const api = async (path, opts) => {
  const r = await fetch("/api" + path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const post = (p, body, method = "POST") => api(p, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const clone = (o) => JSON.parse(JSON.stringify(o));
const dims = (w, h) => `\u2066${w}×${h}\u2069`; // عزل اتجاه الأرقام داخل واجهة RTL
const COLOR_KEYS = ["primary", "secondary", "accent", "bg", "surface", "text", "muted", "onPrimary"];
const QR_DOTS = [["rounded", "مدورة"], ["square", "مربعة"], ["dots", "دوائر"], ["diamond", "معيّنات"], ["classy", "أنيقة"]];
const QR_EYES = [["rounded", "مدورة"], ["square", "مربعة"], ["circle", "دائرة"]];
let assetNames = [];
const COLOR_LABEL = { primary: "أساسي", secondary: "ثانوي", accent: "أكسنت", bg: "خلفية", surface: "سطح", text: "نص", muted: "خافت", onPrimary: "نص على الأساسي" };

const S = { multi: new Set(), lintT: null, animPrev: false, dirty: false, settingsTab: "status", qr: null, meta: null, brands: {}, designs: [], id: null, design: null, sel: -1, zoom: 0.5, hist: [], future: [], lastKey: "", lastT: 0, fitAuto: true, brandEdit: null, iconQ: "" };

/* ---------- أدوات عامة ---------- */
let toastT;
function toast(msg, err = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), err ? 5000 : 2200);
}
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
function modal(title, body, actions = [], opts = {}) {
  const card = $("#modalCard"); card.classList.toggle("wide", !!opts.wide); card.classList.toggle("big", !!opts.big); S.onModalClose = opts.onClose;
  card.replaceChildren(h("h2", {}, title), body, h("div", { class: "modal-actions" }, actions));
  $("#modal").hidden = false;
}
const closeModal = () => { $("#modal").hidden = true; const f = S.onModalClose; S.onModalClose = null; f?.(); };
$("#modal").addEventListener("pointerdown", (e) => { if (e.target.id === "modal") closeModal(); });
const brand = () => S.brands[S.design?.brand]?.brand;
const brandColors = () => brand()?.colors ?? {};
const view = () => S.draft?.design ?? S.design;
const size = () => { const d = view(), f = S.meta.formats[d.format] ?? S.meta.formats.post; return { w: d.width ?? f.w, h: d.height ?? f.h }; };
const resolveColor = (c) => (typeof brandColors()[c] === "string" ? brandColors()[c] : c);
const elBox = (el) => (el.type === "icon" || el.type === "qr" ? { x: el.x, y: el.y, w: el.size, h: el.size } : { x: el.x, y: el.y, w: el.w ?? 100, h: el.h ?? 100 });
const elLabel = (el) => ({ text: () => `“${(el.text ?? "").slice(0, 22)}”`, icon: () => el.name, shape: () => ({ rect: "مستطيل", circle: "دائرة", pill: "كبسولة" })[el.kind] ?? "شكل", image: () => "صورة", logo: () => "لوغو", pattern: () => "نمط", qr: () => "QR · " + (el.data ?? "").slice(0, 16) })[el.type]();
const TYPE_ICON = { text: "type", icon: "star", shape: "square", image: "image", logo: "badge", pattern: "grid-3x3", qr: "qr-code" };

/* ---------- التاريخ والحفظ ---------- */
let saveT, prevT;
function snapshot(key) {
  const now = Date.now();
  if (key && key === S.lastKey && now - S.lastT < 1000) { S.lastT = now; return; }
  S.hist.push(clone(S.design)); if (S.hist.length > 100) S.hist.shift();
  S.future = []; S.lastKey = key ?? ""; S.lastT = now; updateHist();
}
function updateHist() { $("#undoBtn").disabled = !S.hist.length; $("#redoBtn").disabled = !S.future.length; }
function undo() { if (!S.hist.length) return; S.future.push(clone(S.design)); S.design = S.hist.pop(); S.lastKey = ""; refresh(); updateHist(); }
function redo() { if (!S.future.length) return; S.hist.push(clone(S.design)); S.design = S.future.pop(); S.lastKey = ""; refresh(); updateHist(); }
function scheduleSave() {
  $("#saveState").textContent = "…"; S.dirty = true;
  clearTimeout(saveT);
  saveT = setTimeout(guard(flushSave), 500);
}
async function flushSave() {
  clearTimeout(saveT); if (!S.design || !S.dirty) return;
  S.dirty = false; await post(`/designs/${encodeURIComponent(S.id)}`, S.design, "PUT"); $("#saveState").textContent = "تم الحفظ ✓";
}
function change(fn, { key, props = true } = {}) {
  snapshot(key); fn(S.design); scheduleSave();
  schedulePreview(); renderOverlay(); renderLayers(); if (props) renderProps(); scheduleLint();
}
function refresh() { scheduleSave(); schedulePreview(); applyZoom(); renderOverlay(); renderLayers(); renderProps(); syncTop(); }

/* ---------- المعاينة ---------- */
function schedulePreview(ms = 120) { clearTimeout(prevT); prevT = setTimeout(renderPreview, ms); }
let prevSeq = 0;
const renderPreview = guard(async () => {
  if (!view()) return;
  const seq = ++prevSeq, { w, h: hh } = size();
  const r = await fetch("/api/html", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ design: view(), animate: S.animPrev }) });
  const html = await r.text();
  if (!r.ok) throw new Error(JSON.parse(html).error);
  if (seq !== prevSeq) return;
  const f = h("iframe", { style: { width: w + "px", height: hh + "px", visibility: "hidden" } });
  f.addEventListener("load", () => { if (seq !== prevSeq) return f.remove(); const box = $("#frameBox"); [...box.children].forEach((c) => c !== f && c.remove()); f.style.visibility = "visible"; }, { once: true });
  f.srcdoc = html; $("#frameBox").append(f);
});
window.addEventListener("message", (e) => { if (e.data?.type === "mycanva-fit") $("#warn").textContent = e.data.warnings.length ? "⚠ " + e.data.warnings.join(" · ") : ""; });
function liveSync(i) { // تحديث العنصر داخل الـ iframe أثناء السحب بدون إعادة رندر
  const doc = $("#frameBox iframe:last-child")?.contentDocument; const el = S.design.elements[i];
  const node = doc?.getElementById("el-" + (el.id ?? i)); if (!node) return;
  const b = elBox(el); Object.assign(node.style, { left: b.x + "px", top: b.y + "px" });
  if (el.type !== "icon") { node.style.width = b.w + "px"; node.style.height = b.h + "px"; }
  node.style.transform = el.rotate ? `rotate(${el.rotate}deg)` : "";
}

/* ---------- الزوم ---------- */
function applyZoom() {
  if (!view()) return;
  const { w, h: hh } = size(), z = S.zoom;
  Object.assign($("#stage").style, { width: w * z + "px", height: hh * z + "px" });
  const inner = $("#inner"); Object.assign(inner.style, { width: w + "px", height: hh + "px", transform: `scale(${z})` });
  inner.style.setProperty("--hs", String(1 / z));
  $("#zoom").value = Math.round(z * 100); $("#zoomVal").textContent = Math.round(z * 100) + "%";
}
function fit() {
  if (!view()) return; const { w, h: hh } = size(), sc = $("#stageScroll");
  S.zoom = Math.max(0.1, Math.min(1.5, Math.min((sc.clientWidth - 70) / w, (sc.clientHeight - 70) / hh))); applyZoom();
}
$("#zoom").addEventListener("input", (e) => { S.zoom = e.target.value / 100; applyZoom(); });
$("#zoomFit").addEventListener("click", fit);
window.addEventListener("resize", () => S.fitAuto && fit());

/* ---------- الطبقة التفاعلية (تحديد/سحب/تحجيم) ---------- */
function renderOverlay() {
  const ov = $("#overlay"); ov.replaceChildren(); if (!S.design || S.draft) return;
  const single = S.multi.size === 1;
  S.design.elements.forEach((el, i) => {
    const b = elBox(el), sel = S.multi.has(i);
    const box = h("div", { class: "box" + (sel ? " sel" : "") + (el.locked ? " locked" : ""), style: { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px", transform: el.rotate ? `rotate(${el.rotate}deg)` : "" } });
    box.addEventListener("pointerdown", (e) => { if (!el.locked) startDrag(e, i, null); });
    if (sel && single && !el.locked) {
      for (const c of ["nw", "ne", "sw", "se"]) { const hd = h("i", { class: "h " + c }); hd.addEventListener("pointerdown", (e) => { e.stopPropagation(); startDrag(e, i, c); }); box.append(hd); }
      const rot = h("i", { class: "rot", title: "تدوير (Shift = كل 15°)" }); rot.addEventListener("pointerdown", (e) => { e.stopPropagation(); startRotate(e, i, box); }); box.append(rot);
    }
    box.addEventListener("dblclick", () => { if (el.type === "text") $("#p-text")?.focus(); });
    ov.append(box);
  });
  if (S.multi.size > 1) { const bb = selBounds(); if (bb) ov.append(h("div", { class: "groupbox", style: { left: bb.x + "px", top: bb.y + "px", width: bb.w + "px", height: bb.h + "px" } })); }
}
const selBounds = (ids = [...S.multi]) => {
  const bs = ids.map((k) => S.design.elements[k]).filter(Boolean).map(elBox); if (!bs.length) return null;
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y)), x2 = Math.max(...bs.map((b) => b.x + b.w)), y2 = Math.max(...bs.map((b) => b.y + b.h));
  return { x, y, w: x2 - x, h: y2 - y };
};
$("#stageScroll").addEventListener("pointerdown", (e) => { if (e.target.closest(".box") || e.target.closest(".empty")) return; if (S.design && S.multi.size && !e.shiftKey) select(-1); });

function drawGuides(list) {
  const ov = $("#overlay"); ov.querySelectorAll(".guide").forEach((g) => g.remove()); const { w, h: hh } = size();
  const seen = new Set(); for (const g of list) { const k = g.axis + Math.round(g.at); if (seen.has(k)) continue; seen.add(k); ov.append(h("div", { class: "guide " + g.axis, style: g.axis === "v" ? { left: g.at + "px", top: "0", height: hh + "px" } : { top: g.at + "px", left: "0", width: w + "px" } })); }
}
function startDrag(e, i, handle) {
  e.preventDefault();
  if (e.shiftKey || e.metaKey || e.ctrlKey) { select(i, true); return; }
  if (!S.multi.has(i)) select(i);
  const ids = handle ? [i] : [...S.multi].filter((k) => !S.design.elements[k].locked), z = S.zoom, before = clone(S.design), { w: W, h: H } = size();
  const starts = new Map(ids.map((k) => [k, { ...elBox(S.design.elements[k]) }])), g = selBounds(ids), px = e.clientX, py = e.clientY;
  const xs = [0, W / 2, W], ys = [0, H / 2, H];
  S.design.elements.forEach((o, k) => { if (ids.includes(k) || o.locked) return; const b = elBox(o); if (b.w >= W * 0.97 && b.h >= H * 0.97) return; xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); });
  const nodes = new Map(ids.map((k) => [k, $("#overlay").children[k]])); nodes.get(ids[0])?.setPointerCapture?.(e.pointerId); let moved = false;
  const target = nodes.get(ids[0]);
  const move = (ev) => {
    let dx = (ev.clientX - px) / z, dy = (ev.clientY - py) / z; if (Math.abs(dx) + Math.abs(dy) > 1) moved = true; const guides = [];
    if (!handle) {
      const T = 6 / z, ex = [g.x + dx, g.x + g.w / 2 + dx, g.x + g.w + dx], ey = [g.y + dy, g.y + g.h / 2 + dy, g.y + g.h + dy];
      if (!ev.altKey) { // مغناطيس: حواف/مراكز الصفحة والعناصر الأخرى (Alt يعطّله)
        let bx = null, by = null;
        for (const v of ex) for (const t of xs) { const d = t - v; if (Math.abs(d) <= T && (bx === null || Math.abs(d) < Math.abs(bx))) bx = d; }
        for (const v of ey) for (const t of ys) { const d = t - v; if (Math.abs(d) <= T && (by === null || Math.abs(d) < Math.abs(by))) by = d; }
        if (bx !== null) dx += bx; if (by !== null) dy += by;
        for (const v of [g.x + dx, g.x + g.w / 2 + dx, g.x + g.w + dx]) for (const t of xs) if (Math.abs(t - v) < 0.6) guides.push({ axis: "v", at: t });
        for (const v of [g.y + dy, g.y + g.h / 2 + dy, g.y + g.h + dy]) for (const t of ys) if (Math.abs(t - v) < 0.6) guides.push({ axis: "h", at: t });
      }
      for (const k of ids) { const s = starts.get(k), el = S.design.elements[k]; el.x = Math.round(s.x + dx); el.y = Math.round(s.y + dy); }
    } else {
      const el = S.design.elements[i], s = starts.get(i); let { x, y, w, h: hh } = s;
      if (handle.includes("e")) w = Math.max(12, s.w + dx);
      if (handle.includes("w")) { w = Math.max(12, s.w - dx); x = s.x + s.w - w; }
      if (handle.includes("s")) hh = Math.max(12, s.h + dy);
      if (handle.includes("n")) { hh = Math.max(12, s.h - dy); y = s.y + s.h - hh; }
      Object.assign(el, { x: Math.round(x), y: Math.round(y) });
      if (el.type === "icon" || el.type === "qr") el.size = Math.round(Math.max(w, hh)); else { el.w = Math.round(w); el.h = Math.round(hh); }
    }
    for (const k of ids) { const b = elBox(S.design.elements[k]), n = nodes.get(k); Object.assign(n.style, { left: b.x + "px", top: b.y + "px", width: b.w + "px", height: b.h + "px" }); liveSync(k); }
    const gb = S.multi.size > 1 ? selBounds() : null, gnode = $("#overlay .groupbox"); if (gb && gnode) Object.assign(gnode.style, { left: gb.x + "px", top: gb.y + "px", width: gb.w + "px", height: gb.h + "px" });
    drawGuides(guides);
  };
  const up = () => {
    target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); $("#overlay").querySelectorAll(".guide").forEach((x) => x.remove());
    if (moved) { S.hist.push(before); S.future = []; S.lastKey = ""; updateHist(); scheduleSave(); schedulePreview(0); renderProps(); scheduleLint(); }
  };
  target.addEventListener("pointermove", move); target.addEventListener("pointerup", up);
}
function startRotate(e, i, node) {
  e.preventDefault(); const el = S.design.elements[i], r = node.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, before = clone(S.design); let moved = false;
  node.setPointerCapture?.(e.pointerId);
  const move = (ev) => { moved = true; let a = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90; if (ev.shiftKey) a = Math.round(a / 15) * 15; a = Math.round(((a + 540) % 360) - 180); el.rotate = a; node.style.transform = `rotate(${a}deg)`; liveSync(i); };
  const up = () => { node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); if (moved) { S.hist.push(before); S.future = []; S.lastKey = ""; updateHist(); scheduleSave(); schedulePreview(0); renderProps(); } };
  node.addEventListener("pointermove", move); node.addEventListener("pointerup", up);
}
function select(i, additive = false) {
  if (i < 0) { S.sel = -1; S.multi = new Set(); }
  else if (additive) { if (S.multi.has(i)) S.multi.delete(i); else S.multi.add(i); S.sel = S.multi.has(i) ? i : S.multi.size ? [...S.multi].pop() : -1; }
  else { S.sel = i; S.multi = new Set([i]); }
  renderOverlay(); renderLayers(); renderProps();
}
/* ---------- الطبقات ---------- */
function renderLayers() {
  const box = $("#layers"); box.replaceChildren(); if (S.draft) return void box.append(h("p", { class: "muted small" }, "تعرض المعاينة مسودة من إضافة — لا طبقات للتعديل هنا."));
  if (!S.design) return;
  const els = S.design.elements;
  if (!els.length) box.append(h("p", { class: "muted small" }, "لا توجد عناصر. أضف من تبويب «إضافة»."));
  for (let i = els.length - 1; i >= 0; i--) {
    const act = (fn) => (e) => { e.stopPropagation(); fn(); };
    box.append(h("div", { class: "layer" + (S.multi.has(i) ? " on" : "") + (els[i].locked ? " lockd" : ""), onclick: (e) => select(i, e.shiftKey || e.metaKey || e.ctrlKey) },
      h("span", { class: "chip" }, ic(TYPE_ICON[els[i].type])), h("span", { class: "t" }, elLabel(els[i])),
      h("button", { title: els[i].locked ? "فك القفل" : "قفل الطبقة", onclick: act(() => toggleLock(i)) }, els[i].locked ? "🔒" : "🔓"),
      h("button", { title: "للأمام", onclick: act(() => moveLayer(i, 1)) }, "▲"),
      h("button", { title: "للخلف", onclick: act(() => moveLayer(i, -1)) }, "▼"),
      h("button", { title: "نسخ", onclick: act(() => dupe(i)) }, "⧉"),
      h("button", { title: "حذف", onclick: act(() => remove(i)) }, "✕")));
  }
}
function toggleLock(i) { change((x) => { const el = x.elements[i]; if (el.locked) delete el.locked; else el.locked = true; }); }
function moveLayer(i, d) {
  const j = i + d; if (j < 0 || j >= S.design.elements.length) return;
  change((x) => { [x.elements[i], x.elements[j]] = [x.elements[j], x.elements[i]]; }, { props: false }); S.sel = S.sel === i ? j : S.sel; S.multi = S.sel >= 0 ? new Set([S.sel]) : new Set(); renderOverlay(); renderLayers();
}
function dupe(i) { change((x) => { const c = clone(x.elements[i]); delete c.id; delete c.locked; c.x += 30; c.y += 30; x.elements.splice(i + 1, 0, c); S.sel = i + 1; S.multi = new Set([i + 1]); }); }
function remove(i) { change((x) => { x.elements.splice(i, 1); S.sel = -1; S.multi = new Set(); }); }
function addElement(el) { change((x) => { x.elements.push(el); S.sel = x.elements.length - 1; S.multi = new Set([S.sel]); }); }
function dupeSel() { const ids = [...S.multi].sort((a, b) => a - b); if (!ids.length) return; change((x) => { const n = x.elements.length; ids.forEach((k) => { const c = clone(x.elements[k]); delete c.id; delete c.locked; c.x += 30; c.y += 30; x.elements.push(c); }); S.multi = new Set(ids.map((_, j) => n + j)); S.sel = n + ids.length - 1; }); }
function removeSel() { const ids = [...S.multi].sort((a, b) => b - a); if (!ids.length) return; change((x) => { ids.forEach((k) => x.elements.splice(k, 1)); S.sel = -1; S.multi = new Set(); }); }
function lockSel(on) { const ids = [...S.multi]; change((x) => ids.forEach((k) => { if (on) x.elements[k].locked = true; else delete x.elements[k].locked; })); }
/* محاذاة: عنصر واحد / إلى الصفحة، عدة عناصر / إلى حدود التحديد */
function alignSel(mode) {
  const ids = [...S.multi].filter((k) => !S.design.elements[k].locked); if (!ids.length) return; const { w: W, h: H } = size();
  const boxes = ids.map((k) => elBox(S.design.elements[k])), rel = ids.length === 1 ? { x: 0, y: 0, w: W, h: H } : selBounds(ids);
  change((d) => ids.forEach((k, n) => { const el = d.elements[k], b = boxes[n];
    if (mode === "left") el.x = Math.round(rel.x); else if (mode === "hcenter") el.x = Math.round(rel.x + (rel.w - b.w) / 2); else if (mode === "right") el.x = Math.round(rel.x + rel.w - b.w);
    else if (mode === "top") el.y = Math.round(rel.y); else if (mode === "vmiddle") el.y = Math.round(rel.y + (rel.h - b.h) / 2); else if (mode === "bottom") el.y = Math.round(rel.y + rel.h - b.h); }), { key: "align" });
}
function distributeSel(axis) {
  const ids = [...S.multi].filter((k) => !S.design.elements[k].locked); if (ids.length < 3) return toast("اختر 3 عناصر على الأقل للتوزيع", true);
  const pos = axis === "h" ? "x" : "y", dim = axis === "h" ? "w" : "h", items = ids.map((k) => ({ k, b: elBox(S.design.elements[k]) })).sort((a, b) => a.b[pos] - b.b[pos]);
  const first = items[0].b[pos], last = items[items.length - 1].b[pos] + items[items.length - 1].b[dim], total = items.reduce((s, it) => s + it.b[dim], 0), gap = (last - first - total) / (items.length - 1);
  let at = first; change((d) => items.forEach((it) => { d.elements[it.k][pos] = Math.round(at); at += it.b[dim] + gap; }), { key: "dist" });
}
const ALIGN_BTNS = [["left", "⇤", "محاذاة لليسار"], ["hcenter", "⇔", "توسيط أفقي"], ["right", "⇥", "محاذاة لليمين"], ["top", "⤒", "محاذاة للأعلى"], ["vmiddle", "⇕", "توسيط عمودي"], ["bottom", "⤓", "محاذاة للأسفل"]];
function alignBar() {
  return h("div", { class: "alignbar" }, ALIGN_BTNS.map(([m, g, t]) => h("button", { class: "btn small", title: t, onclick: () => alignSel(m) }, g)),
    S.multi.size > 2 ? [h("button", { class: "btn small", title: "توزيع أفقي متساوٍ", onclick: () => distributeSel("h") }, "⇹"), h("button", { class: "btn small", title: "توزيع عمودي متساوٍ", onclick: () => distributeSel("v") }, "⇳")] : null);
}
/* ---------- لوحة الخصائص ---------- */
function setProp(k, v, opts = {}) { const i = S.sel; change((d) => { if (v === undefined) delete d.elements[i][k]; else d.elements[i][k] = v; }, { key: k + i, props: !!opts.redraw }); }
const row = (label, ...c) => h("div", { class: "row" }, h("label", {}, label), ...c);
const numF = (el, k, label, step = 1, min) => row(label, h("input", { type: "number", step, min, value: el[k] ?? "", oninput: (e) => e.target.value !== "" && setProp(k, +e.target.value) }));
const selF = (el, k, label, opts, def) => row(label, h("select", { style: { width: "100%" }, onchange: (e) => setProp(k, k === "weight" ? +e.target.value : e.target.value, { redraw: true }) }, opts.map(([v, t]) => h("option", { value: v, selected: String(el[k] ?? def) === String(v) }, t))));
function colorF(label, cur, onPick, cols = brandColors(), transparent = false) {
  const resolved = typeof cols[cur] === "string" ? cols[cur] : cur ?? "";
  const sw = COLOR_KEYS.filter((k) => cols[k]).map((k) => h("button", { class: "sw" + (cur === k ? " on" : ""), style: { background: cols[k] }, title: COLOR_LABEL[k], onclick: () => onPick(k) }));
  if (transparent) sw.push(h("button", { class: "sw" + (cur === "transparent" ? " on" : ""), style: { background: "repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/8px 8px" }, title: "شفاف", onclick: () => onPick("transparent") }));
  const hex = /^#[0-9a-f]{6}$/i.test(resolved) ? resolved : "#000000";
  return h("div", { class: "row col" }, h("label", { style: { width: "auto" } }, label), h("div", { class: "swatches" }, sw, h("input", { type: "color", value: hex, title: "لون مخصص", oninput: (e) => onPick(e.target.value) })));
}
const segF = (label, cur, opts, on) => row(label, h("div", { class: "seg" }, opts.map(([v, t]) => h("button", { class: cur === v ? "on" : "", onclick: () => on(v) }, t))));

function renderProps() {
  const box = $("#props"); box.replaceChildren(); if (S.draft) return void box.append(h("p", { class: "muted small" }, "تعرض المعاينة مسودة من إضافة. أنشئها كتصميم لتعديلها هنا."));
  const el = S.design?.elements[S.sel];
  if (S.design && S.multi.size > 1) { box.append(h("p", { class: "small" }, `${S.multi.size} عناصر محددة`), alignBar(), h("div", { class: "grid2" }, btn("نسخ", dupeSel), btn("حذف", removeSel, "danger"), btn("🔒 قفل", () => lockSel(true)), btn("🔓 فك القفل", () => lockSel(false)))); return; }
  if (!el) { box.append(h("p", { class: "muted small" }, S.design ? "اختر عنصراً من التصميم لتعديله." : "افتح تصميماً أولاً.")); renderPageProps(box); return; }
  const P = [];
  if (el.type === "text") P.push(
    h("div", { class: "row col" }, h("textarea", { id: "p-text", rows: 3, oninput: (e) => setProp("text", e.target.value) }, el.text)),
    selF(el, "font", "الخط", [["heading", "عناوين"], ["body", "نص"]], "body"), numF(el, "size", "الحجم", 2, 6),
    selF(el, "weight", "السماكة", [["400", "عادي"], ["700", "عريض"], ["800", "أعرض"]].map(([v, t]) => [v, t]), "700"),
    colorF("اللون", el.color ?? "text", (c) => setProp("color", c, { redraw: true })),
    segF("المحاذاة", el.align ?? "start", [["start", "بداية"], ["center", "وسط"], ["end", "نهاية"]], (v) => setProp("align", v, { redraw: true })),
    segF("عمودياً", el.valign ?? "top", [["top", "أعلى"], ["middle", "وسط"], ["bottom", "أسفل"]], (v) => setProp("valign", v, { redraw: true })),
    numF(el, "lineHeight", "تباعد", 0.05, 0.8),
    row("تصغير آلي", h("input", { type: "checkbox", style: { width: "auto" }, checked: el.fit !== false, onchange: (e) => setProp("fit", e.target.checked) })));
  if (el.type === "shape") P.push(
    selF(el, "kind", "الشكل", [["rect", "مستطيل"], ["circle", "دائرة"], ["pill", "كبسولة"]], "rect"),
    colorF("التعبئة", el.fill ?? "primary", (c) => setProp("fill", c, { redraw: true })), numF(el, "radius", "الاستدارة", 2, 0),
    row("تدرّج", h("input", { type: "checkbox", style: { width: "auto" }, checked: !!el.gradient, onchange: (e) => setProp("gradient", e.target.checked ? { from: "primary", to: "secondary", angle: 135 } : undefined, { redraw: true }) })),
    ...(el.gradient ? [colorF("من", el.gradient.from, (c) => setProp("gradient", { ...el.gradient, from: c }, { redraw: true })), colorF("إلى", el.gradient.to, (c) => setProp("gradient", { ...el.gradient, to: c }, { redraw: true })),
      row("الزاوية", h("input", { type: "number", value: el.gradient.angle, oninput: (e) => setProp("gradient", { ...el.gradient, angle: +e.target.value }) }))] : []),
    colorF("إطار", el.stroke ?? "", (c) => setProp("stroke", c, { redraw: true })));
  if (el.type === "icon") P.push(
    row("الأيقونة", h("input", { value: el.name, onchange: (e) => setProp("name", e.target.value.trim(), { redraw: true }) })),
    h("button", { class: "btn small", style: { marginBottom: "8px" }, onclick: () => switchTab("add") }, "بحث عن أيقونة…"),
    numF(el, "size", "الحجم", 2, 8), colorF("اللون", el.color ?? "primary", (c) => setProp("color", c, { redraw: true })), numF(el, "strokeWidth", "سماكة الخط", 0.25, 0.25));
  if (el.type === "image") P.push(row("المصدر", h("input", { value: el.src, onchange: (e) => setProp("src", e.target.value, { redraw: true }) })),
    segF("الملاءمة", el.fit ?? "cover", [["cover", "ملء"], ["contain", "احتواء"]], (v) => setProp("fit", v, { redraw: true })), numF(el, "radius", "الاستدارة", 2, 0));
  if (el.type === "logo") P.push(selF(el, "variant", "النسخة", [["default", "أساسي"], ["light", "فاتح"], ["mark", "رمز"]], "default"),
    segF("المحاذاة", el.align ?? "start", [["start", "بداية"], ["center", "وسط"], ["end", "نهاية"]], (v) => setProp("align", v, { redraw: true })));
  if (el.type === "pattern") P.push(selF(el, "kind", "النمط", [["dots", "نقاط"], ["grid", "شبكة"], ["waves", "موجات"]], "dots"), colorF("اللون", el.color ?? "primary", (c) => setProp("color", c, { redraw: true })));
  if (el.type === "qr") P.push(
    h("div", { class: "row col" }, h("textarea", { rows: 3, oninput: (e) => setProp("data", e.target.value || " ") }, el.data)),
    selF(el, "dots", "النقاط", QR_DOTS, "rounded"), selF(el, "eyeOuter", "إطار العين", QR_EYES, "rounded"), selF(el, "eyeInner", "بؤبؤ العين", QR_EYES, "rounded"),
    colorF("لون الكود", el.fg ?? "text", (c) => setProp("fg", c, { redraw: true })),
    colorF("لون العيون (اختياري)", el.eyeColor ?? "", (c) => setProp("eyeColor", c, { redraw: true })),
    colorF("الخلفية", el.bg ?? "surface", (c) => setProp("bg", c, { redraw: true }), brandColors(), true),
    numF(el, "margin", "الهامش", 1, 0), selF(el, "ec", "تصحيح الأخطاء", [["L", "L منخفض"], ["M", "M"], ["Q", "Q"], ["H", "H عالٍ"]], "Q"),
    row("الشعار", h("select", { style: { width: "100%" }, onchange: (e) => setProp("logo", e.target.value || undefined, { redraw: true }) }, [["", "بدون"], ["brand:default", "شعار الهوية"], ["brand:mark", "رمز الهوية"], ["brand:light", "الشعار الفاتح"], ...assetNames.map((n) => [n, n])].map(([v, t]) => h("option", { value: v, selected: (el.logo ?? "") === v }, t)))),
    h("p", { class: "muted small" }, "جرّب مسح الكود بجوالك قبل الطباعة أو النشر."));
  // الموضع
  const pos = el.type === "icon" || el.type === "qr" ? [numF(el, "x", "X"), numF(el, "y", "Y")] : el.type === "logo" ? [numF(el, "x", "X"), numF(el, "y", "Y"), numF(el, "w", "العرض", 1, 10), numF(el, "h", "الارتفاع", 1, 10)] : [numF(el, "x", "X"), numF(el, "y", "Y"), numF(el, "w", "العرض", 1, 10), numF(el, "h", "الارتفاع", 1, 10)];
  P.push(h("hr"), ...pos, row("الشفافية", h("input", { type: "range", min: 0, max: 1, step: 0.05, value: el.opacity ?? 1, style: { padding: 0 }, oninput: (e) => setProp("opacity", +e.target.value) })), numF(el, "rotate", "تدوير", 1), ...(el.type === "image" ? imageExtras(el) : []), ...animRows(el));
  box.append(alignBar(), ...P);
}
function renderPageProps(box) {
  if (!S.design) return;
  box.append(colorF("خلفية التصميم", S.design.background ?? "bg", (c) => change((d) => (d.background = c), { key: "bg" })), designActions());
}

/* ---------- الشريط العلوي ---------- */
function syncTop() {
  const has = !!S.design, vis = !!view();
  $("#empty").hidden = vis; $("#stage").hidden = !vis;
  renderDraftBar();
  $("#docTitle").textContent = has ? `${S.id} · ${brand()?.name ?? S.design.brand}` : "لا يوجد تصميم مفتوح";
  if (has) { const { w, h: hh } = size(); $("#sizeBtn").textContent = `${S.meta.formats[S.design.format]?.label ?? "مخصص"} · ${dims(w, hh)}`; } else $("#sizeBtn").textContent = "المقاس";
  for (const id of ["#sizeBtn", "#expPng", "#expJpg"]) $(id).disabled = !vis;
  if (S.draft) $("#sizeBtn").disabled = true;
  $("#pubStatus").value = S.design?.status ?? ""; $("#pubDate").value = S.design?.date ?? ""; $("#pubTime").value = S.design?.time ?? ""; scheduleLint();
  $("#caption").value = S.design?.caption ?? ""; $("#hashtags").value = (S.design?.hashtags ?? []).join(" ");
}
$("#undoBtn").onclick = undo; $("#redoBtn").onclick = redo;
$("#caption").addEventListener("input", (e) => change((d) => (d.caption = e.target.value), { key: "cap", props: false }));
$("#hashtags").addEventListener("input", (e) => change((d) => (d.hashtags = e.target.value.split(/\s+/).filter(Boolean)), { key: "tags", props: false }));
$("#copyCaption").onclick = () => navigator.clipboard.writeText([S.design.caption, (S.design.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n")).then(() => toast("تم النسخ"));
/* منتقي المقاس: مقاسات جاهزة مجمّعة + مقاس مخصص */
function sizePicker(initialKey, initial) {
  const { min, max } = S.meta.limits; const groups = {};
  for (const [k, f] of Object.entries(S.meta.formats)) (groups[f.group] ??= []).push([k, f]);
  const sel = h("select", { style: { width: "100%" } }, [...Object.entries(groups).map(([g, items]) => h("optgroup", { label: g }, items.map(([k, f]) => h("option", { value: k }, `${f.label} (${dims(f.w, f.h)})`)))), h("optgroup", { label: "غير ذلك" }, h("option", { value: "custom" }, "مقاس مخصص…"))]);
  const wI = h("input", { type: "number", min, max, value: initial?.w ?? 1080 }), hI = h("input", { type: "number", min, max, value: initial?.h ?? 1080 });
  const hint = h("div", { class: "muted small", style: { marginBottom: "8px" } });
  const customBox = h("div", {}, h("div", { class: "row" }, h("label", {}, "العرض"), wI, h("label", { style: { width: "auto" } }, "px")), h("div", { class: "row" }, h("label", {}, "الارتفاع"), hI, h("label", { style: { width: "auto" } }, "px")),
    h("div", { class: "row" }, h("button", { class: "btn small", onclick: () => { [wI.value, hI.value] = [hI.value, wI.value]; upd(); } }, "⇄ تبديل العرض والارتفاع")));
  const upd = () => {
    const custom = sel.value === "custom";
    if (!custom) { const f = S.meta.formats[sel.value]; wI.value = f.w; hI.value = f.h; }
    customBox.hidden = !custom; const w = +wI.value, hh = +hI.value;
    hint.textContent = w && hh ? `${dims(w, hh)} بكسل · نسبة ${(w / hh).toFixed(2)}:1 · التصدير بدقة مضاعفة (حتى ${dims(w * 2, hh * 2)})` : "";
  };
  sel.onchange = upd; wI.oninput = hI.oninput = upd; sel.value = initialKey; upd();
  const el = h("div", {}, sel, h("div", { style: { height: "8px" } }), customBox, hint);
  const get = () => {
    if (sel.value !== "custom") return { format: sel.value };
    const w = Math.round(+wI.value), hh = Math.round(+hI.value);
    if (!(w >= min && w <= max && hh >= min && hh <= max)) throw new Error(`المقاس يجب أن يكون بين ${min} و${max} بكسل`);
    return { width: w, height: hh };
  };
  return { el, get };
}
$("#sizeBtn").onclick = () => {
  const { w, h: hh } = size(); const sp = sizePicker(S.meta.formats[S.design.format] ? S.design.format : "custom", { w, h: hh });
  const copy = h("input", { type: "checkbox", style: { width: "auto" } });
  modal("مقاس التصميم", h("div", {}, h("p", { class: "muted small" }, "تُحجَّم العناصر وتتوسّط تلقائياً بحسب المقاس الجديد. بعدها عدّل يدوياً إذا لزم."), sp.el, h("label", { class: "row", style: { marginTop: "8px", cursor: "pointer" } }, copy, h("span", {}, "إنشاء نسخة جديدة (الأصل يبقى كما هو)"))),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => {
      const target = sp.get();
      if (copy.checked) { const r = await post(`/designs/${encodeURIComponent(S.id)}/resize`, target); closeModal(); await loadDesigns(); await openDesign(r.id); return; }
      const next = await post("/resize", { design: S.design, target }); closeModal();
      snapshot(); S.design = next; refresh(); S.fitAuto = true; fit();
    }) }, "تطبيق")]);
};
const exportAs = (type) => guard(async () => {
  toast("جاري التصدير…"); const dn = S.draft ? "draft-" + (S.draft.plugin ?? "x") : S.id; const r = await post("/render", { design: view(), name: dn, type, scale: 2 });
  const a = h("a", { href: r.url, download: `${dn}.${type === "jpeg" ? "jpg" : "png"}` }); document.body.append(a); a.click(); a.remove();
  toast(`تم التصدير ${dims(r.width, r.height)}` + (r.warnings.length ? ` — ⚠ ${r.warnings[0]}` : ""));
});
$("#expPng").onclick = exportAs("png"); $("#expJpg").onclick = exportAs("jpeg");

/* ---------- التبويبات ---------- */
function switchTab(name) {
  if (S.curTab !== name) { PLUG.tabs.get(S.curTab)?.onHide?.(); }
  const prevTab = S.curTab; S.curTab = name;
  document.querySelectorAll("#leftTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("on", p.id === "tab-" + name));
  const pt = PLUG.tabs.get(name); if (pt) { guard(async () => pt.render(pt.sec))(); if (prevTab !== name) pt.onShow?.(); }
  if (name === "brand") renderBrandTab(); if (name === "add") renderAddTab(); if (name === "designs") renderDesignsTab(); if (name === "qr") renderQrTab();
}
$("#leftTabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) switchTab(b.dataset.tab); });

/* ----- تبويب الهوية ----- */
function renderBrandTab() {
  const p = $("#tab-brand"); p.replaceChildren();
  const ids = Object.keys(S.brands);
  p.append(h("div", { class: "list", style: { marginBottom: "10px" } }, ids.map((id) => h("div", { class: "item" + (S.brandEdit?.id === id ? " on" : ""), onclick: () => { S.brandEdit = { id, ...clone(S.brands[id].brand) }; renderBrandTab(); } },
    h("span", { class: "sw", style: { background: S.brands[id].brand?.colors.primary, width: "18px", height: "18px" } }), h("span", { class: "t" }, S.brands[id].brand?.name ?? id))),
    h("button", { class: "btn", onclick: () => { S.brandEdit = { id: "", isNew: true, name: "", language: "ar", colors: gen("#1e6fd9"), fonts: { heading: "Cairo", body: "Tajawal" }, style: { pattern: "dots", iconSet: "lucide", radius: 24 }, voice: { tone: "" }, logo: {} }; renderBrandTab(); } }, "+ هوية جديدة"), h("button", { class: "btn", onclick: brandFromModal }, "✨ من شعار أو موقع")));
  const b = S.brandEdit; if (!b) return p.append(h("p", { class: "muted small" }, "اختر هوية للتعديل أو أنشئ هوية جديدة."));
  p.append(h("hr"), h("h3", {}, b.isNew ? "هوية جديدة" : "تعديل الهوية"));
  const bind = (obj, k) => (e) => (obj[k] = e.target.value);
  p.append(row("المعرّف", h("input", { value: b.id, disabled: !b.isNew, placeholder: "my-cafe", oninput: bind(b, "id") })), row("الاسم", h("input", { value: b.name, oninput: bind(b, "name") })));
  const prim = h("input", { type: "color", value: b.colors.primary, oninput: (e) => { b.colors.primary = e.target.value; } });
  p.append(row("الأساسي", prim, h("button", { class: "btn small", title: "يولّد باقي الألوان من الأساسي", onclick: guard(async () => { const r = await api(`/palette?primary=${encodeURIComponent(prim.value)}&dark=${b.dark ? 1 : 0}`); b.colors = r.colors; if (r.contrastWarnings.length) toast(r.contrastWarnings[0], true); renderBrandTab(); }) }, "توليد الباقي")));
  p.append(h("div", { class: "grid2" }, COLOR_KEYS.filter((k) => k !== "primary").map((k) => h("div", { class: "row" }, h("input", { type: "color", value: b.colors[k], oninput: (e) => { b.colors[k] = e.target.value; prevBar(); } }), h("span", { class: "small muted" }, COLOR_LABEL[k])))));
  const pv = h("div", { class: "palette-prev" }); const prevBar = () => pv.replaceChildren(...COLOR_KEYS.map((k) => h("span", { style: { background: b.colors[k] }, title: COLOR_LABEL[k] }))); prevBar(); p.append(pv);
  p.append(row("اللغة / Language", h("select", { style: { width: "100%" }, onchange: (e) => (b.language = e.target.value) }, [["ar", "العربية"], ["en", "English"]].map(([v, t]) => h("option", { value: v, selected: (b.language ?? "ar") === v }, t)))));
  const fopt = (cur, on) => h("select", { style: { width: "100%" }, onchange: on }, S.meta.fonts.map((f) => h("option", { selected: f === cur }, f)));
  p.append(row("خط العناوين", fopt(b.fonts.heading, (e) => (b.fonts.heading = e.target.value))), row("خط النص", fopt(b.fonts.body, (e) => (b.fonts.body = e.target.value))),
    row("النمط", h("select", { style: { width: "100%" }, onchange: bind(b.style, "pattern") }, [["none", "بدون"], ["dots", "نقاط"], ["grid", "شبكة"], ["waves", "موجات"]].map(([v, t]) => h("option", { value: v, selected: b.style.pattern === v }, t)))),
    row("الأيقونات", h("select", { style: { width: "100%" }, onchange: bind(b.style, "iconSet") }, ["lucide", "tabler", "ph"].map((v) => h("option", { selected: b.style.iconSet === v }, v)))),
    row("النبرة", h("input", { value: b.voice.tone ?? "", oninput: bind(b.voice, "tone") })));
  p.append(h("button", { class: "btn primary", style: { width: "100%", marginTop: "6px" }, onclick: guard(saveBrandForm) }, b.isNew ? "إنشاء الهوية" : "حفظ التعديلات"));
  if (!b.isNew) {
    p.append(h("hr"), h("h3", {}, "اللوغو"));
    for (const [v, label] of [["default", "اللوغو الأساسي"], ["light", "نسخة فاتحة (للخلفيات الغامقة)"]]) {
      const inp = h("input", { type: "file", accept: ".png,.jpg,.jpeg,.svg,.webp", hidden: true, onchange: guard(async (e) => { const f = e.target.files[0]; if (!f) return; const ext = f.name.split(".").pop(); await fetch(`/api/brands/${b.id}/logo?variant=${v}&ext=${ext}`, { method: "POST", body: f }); await loadBrands(); S.brandEdit = { id: b.id, ...clone(S.brands[b.id].brand) }; toast("تم رفع اللوغو"); renderBrandTab(); schedulePreview(0); }) });
      const file = b.logo?.[v];
      p.append(h("div", { class: "row" }, file ? h("img", { src: `/api/brand-file/${b.id}/${file}?t=${Date.now()}`, style: { height: "34px", maxWidth: "90px", background: v === "light" ? "#456" : "#fff", borderRadius: "6px", padding: "3px" } }) : h("span", { class: "muted small" }, "—"), h("button", { class: "btn small", onclick: () => inp.click() }, label), inp));
    }
  }
}
async function saveBrandForm() {
  const b = S.brandEdit; const id = (b.id || b.name).trim(); if (!id || !b.name.trim()) throw new Error("المعرّف والاسم مطلوبان");
  const { primary, ...others } = b.colors; delete others.extra;
  const r = await post("/brands", { id, name: b.name, primary, colors: others, headingFont: b.fonts.heading, bodyFont: b.fonts.body, language: b.language ?? "ar", iconSet: b.style.iconSet, pattern: b.style.pattern, radius: b.style.radius, tone: b.voice.tone });
  if (b.pendingLogo) { try { if (b.pendingLogo.file) await fetch(`/api/brands/${r.id}/logo?variant=default&ext=${b.pendingLogo.file.name.split(".").pop()}`, { method: "POST", body: b.pendingLogo.file }); else await post(`/brands/${r.id}/logo-url`, { url: b.pendingLogo.url }); } catch (e) { toast("تم حفظ الهوية لكن تعذّر حفظ الشعار: " + e.message, true); } }
  await loadBrands(); S.brandEdit = { id: r.id, ...clone(S.brands[r.id].brand) };
  toast(r.contrastWarnings.length ? "تم الحفظ — ⚠ " + r.contrastWarnings[0] : "تم حفظ الهوية ✓", !!r.contrastWarnings.length);
  renderBrandTab(); if (S.design) { renderProps(); schedulePreview(0); }
}
function gen(hex) { return { primary: hex, secondary: "#1a4a99", accent: "#ffa062", bg: "#f4f7fc", surface: "#ffffff", text: "#161b27", muted: "#6a7385", onPrimary: "#ffffff", extra: [] }; }

/* ----- تبويب الإضافة ----- */
function renderAddTab() {
  const p = $("#tab-add"); p.replaceChildren(); const { w, h: hh } = S.design ? size() : { w: 1080, h: 1080 };
  if (!S.design) return p.append(h("p", { class: "muted small" }, "افتح تصميماً لإضافة عناصر."));
  const add = (label, el) => h("button", { class: "btn", onclick: () => addElement(el) }, label);
  p.append(h("h3", {}, "عناصر"), h("div", { class: "grid2" },
    add("T نص", { type: "text", x: 80, y: Math.round(hh / 2 - 60), w: w - 160, h: 160, text: T("نص جديد"), font: "heading", size: 72, weight: 700, color: "text", align: "start", valign: "top", lineHeight: 1.3, fit: true }),
    add("◼ مستطيل", { type: "shape", kind: "rect", x: 100, y: 100, w: 400, h: 240, fill: "primary", radius: 24 }),
    add("● دائرة", { type: "shape", kind: "circle", x: 100, y: 100, w: 300, h: 300, fill: "accent" }),
    add("⬬ كبسولة", { type: "shape", kind: "pill", x: 100, y: 100, w: 420, h: 110, fill: "primary" }),
    add("◎ لوغو", { type: "logo", x: 80, y: 80, w: 400, h: 72, variant: "default", align: "start" }),
    add("░ نمط", { type: "pattern", kind: brand()?.style.pattern === "none" ? "dots" : brand()?.style.pattern ?? "dots", x: w - 460, y: 0, w: 440, h: 440, color: "primary", opacity: 0.15 })));
  p.append(h("hr"), h("h3", {}, "أيقونات"));
  const grid = h("div", { class: "icons" });
  const q = h("input", { placeholder: "ابحث بالإنجليزي: heart, phone, star…", value: S.iconQ, oninput: (e) => { S.iconQ = e.target.value; loadIcons(); } });
  const loadIcons = guard(async () => {
    if (!S.iconQ.trim()) return grid.replaceChildren(h("p", { class: "muted small", style: { gridColumn: "1/-1" } }, "اكتب كلمة للبحث."));
    const names = await api(`/icons?q=${encodeURIComponent(S.iconQ)}`);
    grid.replaceChildren(...names.map((n) => h("button", { class: "ico", title: n, onclick: () => addElement({ type: "icon", name: n, x: Math.round(w / 2 - 60), y: Math.round(hh / 2 - 60), size: 120, color: "primary" }) }, h("i", { style: { "--m": `url(/api/icon?name=${encodeURIComponent(n)})` } }))));
  });
  p.append(q, h("div", { style: { height: "8px" } }), grid); loadIcons();
  p.append(h("hr"), h("h3", {}, "صور"));
  const file = h("input", { type: "file", accept: ".png,.jpg,.jpeg,.webp,.svg,.gif", hidden: true, onchange: guard(async (e) => { const f = e.target.files[0]; if (!f) return; const r = await fetch(`/api/assets?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f }); const j = await r.json(); if (!r.ok) throw new Error(j.error); addImage(j.name); renderAddTab(); }) });
  const addImage = (name) => addElement({ type: "image", src: name, x: 80, y: 200, w: w - 160, h: Math.round((w - 160) * 0.75), fit: "cover", radius: 24 });
  const assets = h("div", { class: "assets" });
  p.append(h("button", { class: "btn", style: { width: "100%" }, onclick: () => file.click() }, "رفع صورة / عنصر (PNG, JPG, SVG)"), file, assets);
  api("/assets").then((list) => assets.replaceChildren(...list.map((n) => h("img", { src: `/assets/${encodeURIComponent(n)}`, title: n, onclick: () => addImage(n) })))).catch(() => {});
  imageSources(p, addImage);
}

/* ---------- التحميل والفتح ---------- */
async function loadBrands() { const l = await api("/brands"); S.brands = Object.fromEntries(l.filter((x) => x.brand).map((x) => [x.id, x])); }
async function loadDesigns() { S.designs = await api("/designs"); renderDesignsTab(); renderStrip(); }
async function openDesign(id) {
  await flushSave();
  S.design = await api(`/designs/${encodeURIComponent(id)}`); S.id = id; S.sel = -1; S.multi = new Set(); S.hist = []; S.future = []; S.lastKey = "";
  if (!S.brands[S.design.brand]) toast(`الهوية «${S.design.brand}» غير موجودة`, true);
  localStorage.setItem("lastDesign", id); updateHist(); syncTop(); S.fitAuto = true; fit(); renderPreview(); renderOverlay(); renderLayers(); renderProps(); renderDesignsTab(); renderStrip();
  if ($("#tab-add").classList.contains("on")) renderAddTab(); $("#saveState").textContent = "";
}
$("#emptyNew").onclick = newDesignModal;

/* ---------- حقول القوالب الديناميكية ---------- */
const FIELD_LABEL = { title: "العنوان", subtitle: "نص فرعي", cta: "نص الزر", badge: "شارة", icon: "أيقونة", image: "صورة", author: "الاسم / الكاتب", items: "النقاط (سطر لكل نقطة)", date: "التاريخ", place: "المكان", number: "الرقم", qr: "رابط QR" };
const AREA_FIELDS = new Set(["title", "subtitle", "items"]);
const loadAssetNames = async () => { try { assetNames = await api("/assets"); } catch { assetNames = []; } };
function contentForm(fields) {
  const inputs = {};
  const el = h("div", {}, fields.map((f) => {
    const input = f === "image" ? h("select", { style: { width: "100%" } }, [h("option", { value: "" }, "— بدون —"), ...assetNames.map((n) => h("option", { value: n }, n))])
      : h(AREA_FIELDS.has(f) ? "textarea" : "input", { rows: f === "items" ? 4 : 2, placeholder: f === "icon" ? "rocket, heart, camera…" : f === "qr" ? "https://…" : "" });
    inputs[f] = input; return row(FIELD_LABEL[f], input);
  }));
  const get = () => { const c = {}; for (const [k, i] of Object.entries(inputs)) { const v = i.value.trim(); if (v) c[k] = k === "items" ? v.split("\n").map((x) => x.trim()).filter(Boolean) : v; } return c; };
  return { el, get };
}
const brandSelect = (cur) => h("select", { style: { width: "100%" } }, Object.keys(S.brands).map((id) => h("option", { value: id, selected: id === cur }, S.brands[id].brand?.name ?? id)));
const needBrands = () => { if (Object.keys(S.brands).length) return false; toast("أنشئ هوية أولاً من تبويب «الهوية»", true); switchTab("brand"); return true; };
const btn = (label, onclick, cls = "") => h("button", { class: "btn small " + cls, onclick }, label);

/* ----- تصميم جديد ----- */
function newDesignModal() {
  if (needBrands()) return;
  const bSel = brandSelect(S.design?.brand), UT = S.meta.userTemplates ?? [], tSel = h("select", { style: { width: "100%" } }, [h("option", { value: "" }, "فارغ (أبني بنفسي)"), ...S.meta.templates.map((t) => h("option", { value: t.id }, t.label)), ...(UT.length ? [h("optgroup", { label: "قوالبي" }, UT.map((t) => h("option", { value: t.id }, t.label)))] : [])]);
  const delT = h("button", { class: "btn small danger", hidden: true, onclick: guard(async () => { if (!ask("حذف هذا القالب؟")) return; await api(`/user-templates/${encodeURIComponent(tSel.value.slice(5))}`, { method: "DELETE" }); S.meta = await api("/meta"); closeModal(); newDesignModal(); }) }, "حذف القالب");
  const sp = sizePicker("post"), formBox = h("div"); let form = null, fields = [];
  const draw = () => { const t = [...S.meta.templates, ...UT].find((x) => x.id === tSel.value); fields = t?.fields ?? []; form = t && fields.length ? contentForm(fields) : null; delT.hidden = !t?.user; formBox.replaceChildren(form ? form.el : h("p", { class: "muted small" }, t?.user ? "قالب خاص بك: يُنشأ بتخطيطه المحفوظ وبالهوية والمقاس المختارين." : "تصميم فارغ: أضف العناصر من تبويب «إضافة».")); };
  tSel.onchange = draw; tSel.value = "announcement"; draw();
  modal("تصميم جديد", h("div", {}, row("الهوية", bSel), row("القالب", tSel), delT, h("hr"), sp.el, h("hr"), formBox),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => {
      const c = form?.get() ?? {}; if (fields.includes("title") && !c.title) return toast("اكتب العنوان", true);
      const r = await post("/designs", { brand: bSel.value, ...sp.get(), template: tSel.value || undefined, content: c });
      closeModal(); await loadDesigns(); await openDesign(r.id);
    }) }, "إنشاء")]);
}

/* ----- كاروسيل جديد ----- */
function parseSlides(text) {
  return text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).map((b) => {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean); let icon; const last = lines[lines.length - 1];
    if (last?.startsWith("@")) { icon = last.slice(1).trim(); lines.pop(); }
    return { title: lines[0] ?? "", body: lines.slice(1).join(" ") || undefined, icon };
  });
}
function carouselModal() {
  if (needBrands()) return;
  const bSel = brandSelect(S.design?.brand), sp = sizePicker("post");
  const f = (ph, rows = 1) => h(rows > 1 ? "textarea" : "input", { placeholder: ph, rows });
  const id = f("my-carousel"), cT = f("عنوان الغلاف", 2), cS = f("نص فرعي (اختياري)"), cB = f("شارة، مثل: دليل"), oT = f("عنوان الختام، مثل: جاهز تبدأ؟"), oS = f("نص الختام (اختياري)"), oC = f("نص الزر، مثل: ابدأ الآن");
  const slides = h("textarea", { rows: 9, placeholder: "اختر منتجاً يحل مشكلة\nابدأ بسؤال واحد: ما المشكلة التي يدفع الناس لحلها؟\n@lightbulb\n\nصوّر منتجك باحتراف\nصور واضحة ترفع المبيعات.\n@camera" });
  modal("كاروسيل جديد", h("div", {}, row("الهوية", bSel), sp.el, h("hr"), h("h3", {}, "الغلاف"), row("العنوان", cT), row("فرعي", cS), row("شارة", cB), h("hr"), h("h3", {}, "الشرائح"),
    h("p", { class: "muted small" }, "افصل بين الشرائح بسطر فارغ. أول سطر = العنوان، الباقي = النص. لإضافة أيقونة اكتب في سطر أخير: @اسم_الأيقونة (إنجليزي)."), slides,
    h("hr"), h("h3", {}, "الختام (اختياري)"), row("العنوان", oT), row("فرعي", oS), row("الزر", oC), h("hr"), row("المعرّف", id)),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => {
      if (!cT.value.trim()) return toast("اكتب عنوان الغلاف", true);
      const sl = parseSlides(slides.value); if (!sl.length) return toast("أضف شريحة واحدة على الأقل", true);
      const outro = oT.value.trim() ? { title: oT.value.trim(), subtitle: oS.value.trim() || undefined, cta: oC.value.trim() || undefined } : undefined;
      const r = await post("/carousel", { id: id.value.trim() || undefined, brand: bSel.value, ...sp.get(), cover: { title: cT.value.trim(), subtitle: cS.value.trim() || undefined, badge: cB.value.trim() || undefined }, slides: sl, outro });
      closeModal(); await loadDesigns(); await openDesign(r.ids[0]); toast(`تم إنشاء ${r.ids.length} شرائح`);
    }) }, "إنشاء الكاروسيل")], { wide: true });
}

/* ----- توليد دفعة ----- */
const BATCH_FORMATS = ["post", "square", "story", "fb-post", "li-post", "x-post", "yt-thumb", "slide"];
function batchModal() {
  if (needBrands()) return;
  const bSel = brandSelect(S.design?.brand), name = h("input", { placeholder: "اسم الدفعة، مثل: week-1" });
  const tSel = h("select", { style: { width: "100%" } }, S.meta.templates.map((t) => h("option", { value: t.id }, t.label))); tSel.value = "tip";
  const rowsTa = h("textarea", { rows: 8 }), hint = h("p", { class: "muted small" }), custom = h("input", { placeholder: "مقاسات مخصصة: 1200x628, 800x800" }), count = h("p", { class: "small" });
  const checks = BATCH_FORMATS.map((k) => { const cb = h("input", { type: "checkbox", value: k, checked: k === "post", onchange: upd }); return { k, cb, el: h("label", {}, cb, S.meta.formats[k]?.label ?? k) }; });
  const tpl = () => S.meta.templates.find((t) => t.id === tSel.value);
  let imported = null; const imp = csvImporter((rows) => { imported = rows; upd(); });
  const parseRows = () => imported ?? rowsTa.value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const cols = l.split("|").map((x) => x.trim()); const c = {}; tpl().fields.forEach((f, i) => { if (cols[i]) c[f] = f === "items" ? cols[i].split(/[;؛]/).map((x) => x.trim()).filter(Boolean) : cols[i]; }); return c; });
  const parseFormats = () => [...checks.filter((c) => c.cb.checked).map((c) => ({ format: c.k })), ...custom.value.split(/[,،]/).map((x) => x.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i)).filter(Boolean).map((m) => ({ width: +m[1], height: +m[2] }))];
  function upd() { const t = tpl(); hint.textContent = `الأعمدة بالترتيب (افصل بـ | ): ${t.fields.map((f) => FIELD_LABEL[f]).join(" | ")}` + (t.fields.includes("items") ? " — النقاط افصلها بـ ;" : ""); count.textContent = `سيتم إنشاء ${parseRows().length * parseFormats().length} تصميم`; }
  tSel.onchange = () => { rowsTa.placeholder = ""; upd(); }; rowsTa.oninput = () => { imported = null; imp.info.textContent = ""; upd(); }; custom.oninput = upd; upd();
  modal("توليد دفعة", h("div", {}, h("p", { class: "muted small" }, "سطر لكل منشور × عدة مقاسات دفعة واحدة. اطلب مني (Claude) عبر MCP أن أكتب لك المحتوى جاهزاً."), row("الهوية", bSel), row("القالب", tSel), row("الاسم", name), hint, rowsTa, imp.el,
    h("h3", { style: { marginTop: "10px" } }, "المقاسات"), h("div", { class: "pillgrid" }, checks.map((c) => c.el)), h("div", { style: { height: "8px" } }), custom, count),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => {
      const rows = parseRows(), formats = parseFormats(), t = tpl();
      if (!rows.length) return toast("أضف سطراً واحداً على الأقل", true); if (!formats.length) return toast("اختر مقاساً", true);
      if (t.fields.includes("title") && rows.some((r) => !r.title)) return toast("كل سطر يحتاج عنواناً (العمود الأول)", true);
      const r = await post("/batch", { name: name.value.trim() || `batch-${Date.now().toString(36)}`, brand: bSel.value, template: tSel.value, formats, rows });
      closeModal(); await loadDesigns(); await openDesign(r.ids[0]); toast(`تم إنشاء ${r.ids.length} تصميم`);
    }) }, "إنشاء الدفعة")], { wide: true });
}

/* ----- قائمة التصاميم (مجمّعة) + تصدير ----- */
const exportGroup = (group, type, label) => guard(async () => {
  toast("جاري التصدير…"); const r = await post("/export", { group, name: group, type });
  const a = h("a", { href: r.url, download: r.url.split("/").pop() }); document.body.append(a); a.click(); a.remove();
  toast(`تم تصدير ${r.count} ${label ?? ""}` + (r.warnings.length ? ` — ⚠ ${r.warnings[0]}` : ""));
});
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
function renderDesignsTab() {
  const p = $("#tab-designs");
  p.replaceChildren(h("div", { class: "grid3" }, h("button", { class: "btn primary", onclick: newDesignModal }, "+ تصميم"), h("button", { class: "btn", onclick: carouselModal }, "+ كاروسيل"), h("button", { class: "btn", onclick: batchModal }, "⚡ دفعة")));
  const groups = new Map(), singles = [];
  for (const d of S.designs) d.group ? (groups.get(d.group) ?? groups.set(d.group, []).get(d.group)).push(d) : singles.push(d);
  const list = h("div", { class: "list" });
  if (!S.designs.length) list.append(h("p", { class: "muted small" }, "لا توجد تصاميم بعد."));
  for (const [g, items] of groups) {
    items.sort(byOrder); const kind = items[0].kind, on = items.some((d) => d.id === S.id);
    list.append(h("div", { class: "item" + (on ? " on" : ""), onclick: guard(() => openDesign(on ? S.id : items[0].id)) },
      h("span", {}, kind === "carousel" ? "📚" : "⚡"), h("span", { class: "t" }, g), h("span", { class: "chip" }, items.length + (kind === "carousel" ? " شرائح" : " تصميم")),
      ...(kind === "carousel" ? [btn("PDF", (e) => { e.stopPropagation(); exportGroup(g, "pdf", "شريحة")(); })] : []),
      btn("ZIP", (e) => { e.stopPropagation(); exportGroup(g, "png", "صورة")(); }),
      btn("✕", guard(async (e) => { e.stopPropagation(); if (!ask(`حذف المجموعة «${g}» بكل تصاميمها (${items.length})؟ لا يمكن التراجع.`)) return; for (const d of items) await api(`/designs/${encodeURIComponent(d.id)}`, { method: "DELETE" }); if (items.some((d) => d.id === S.id)) { S.id = null; S.design = null; localStorage.removeItem("lastDesign"); syncTop(); renderOverlay(); renderLayers(); renderProps(); } await loadDesigns(); }), "danger")));
  }
  for (const d of singles) list.append(h("div", { class: "item" + (d.id === S.id ? " on" : ""), onclick: guard(() => openDesign(d.id)) },
    h("span", { class: "t" }, d.id), h("span", { class: "chip" }, S.meta.formats[d.format]?.label.split(" ")[0] ?? d.format),
    btn("✕", guard(async (e) => { e.stopPropagation(); if (!ask(`حذف التصميم «${d.id}»؟ لا يمكن التراجع.`)) return; await api(`/designs/${encodeURIComponent(d.id)}`, { method: "DELETE" }); if (S.id === d.id) { S.id = null; S.design = null; localStorage.removeItem("lastDesign"); syncTop(); renderOverlay(); renderLayers(); renderProps(); } await loadDesigns(); }), "danger")));
  p.append(list);
}

/* ----- شريط الشرائح ----- */
function groupItems() { const g = S.design?.group; return g ? S.designs.filter((d) => d.group === g).sort(byOrder) : []; }
function renderStrip() {
  const box = $("#strip"), g = S.design?.group; if (!g) { box.hidden = true; return; }
  const items = groupItems(), carousel = S.design.kind === "carousel";
  box.hidden = false;
  box.replaceChildren(h("div", { class: "strip-list" }, items.map((d, i) => h("button", { class: "slide" + (d.id === S.id ? " on" : ""), title: d.id, onclick: guard(() => openDesign(d.id)) }, String(i + 1)))),
    h("div", { class: "strip-actions" },
      ...(carousel ? [btn("+ شريحة", guard(addSlide)), btn("تقديم", guard(() => moveSlide(-1))), btn("تأخير", guard(() => moveSlide(1)))] : []),
      btn("حذف", guard(delSlide), "danger"), ...(carousel ? [btn("PDF", exportGroup(g, "pdf", "شريحة"))] : []), btn("ZIP", exportGroup(g, "png", "صورة"))));
}
async function addSlide() {
  await flushSave(); const g = S.design.group, id = `${g}-${Date.now().toString(36)}`;
  await post(`/designs/${id}`, { ...clone(S.design), order: (S.design.order ?? 0) + 0.5 }, "PUT"); await post(`/groups/${encodeURIComponent(g)}/renumber`, {});
  await loadDesigns(); await openDesign(id); toast("تمت إضافة نسخة من الشريحة بعد الحالية");
}
async function moveSlide(dir) {
  const items = groupItems(), i = items.findIndex((d) => d.id === S.id), j = i + dir; if (j < 0 || j >= items.length) return;
  S.design.order = (items[j].order ?? j) + (dir > 0 ? 0.5 : -0.5); S.dirty = true; await flushSave();
  await post(`/groups/${encodeURIComponent(S.design.group)}/renumber`, {}); const id = S.id; await loadDesigns(); await openDesign(id);
}
async function delSlide() {
  const items = groupItems(), i = items.findIndex((d) => d.id === S.id); if (items.length < 2) return toast("لا يمكن حذف آخر شريحة. احذف المجموعة من قائمة التصاميم.", true);
  if (!ask("حذف هذه الشريحة؟ لا يمكن التراجع.")) return;
  const next = items[i + 1] ?? items[i - 1]; S.dirty = false; await api(`/designs/${encodeURIComponent(S.id)}`, { method: "DELETE" }); S.id = null; S.design = null;
  await loadDesigns(); await openDesign(next.id);
}

/* ---------- أداة QR ---------- */
const QR_DEFAULT = () => ({ brand: S.design?.brand ?? Object.keys(S.brands)[0] ?? "", type: "url", fields: { url: "https://" }, dots: "rounded", eyeOuter: "rounded", eyeInner: "rounded", fg: "text", gradient: false, fg2: "primary", eyeColor: "", bg: "surface", margin: 3, ec: "Q", logo: "", logoScale: 0.22, payload: "", pxSize: 1024 });
const qrSpec = (px = 600) => { const q = S.qr; return { brand: q.brand || undefined, type: q.type, fields: q.fields, dots: q.dots, eyeOuter: q.eyeOuter, eyeInner: q.eyeInner, fg: q.fg, fg2: q.gradient ? q.fg2 : undefined, eyeColor: q.eyeColor || undefined, bg: q.bg, margin: q.margin, ec: q.ec, logo: q.logo || undefined, logoScale: q.logoScale, size: px }; };
const qrElement = () => { const q = S.qr; return { type: "qr", data: q.payload, x: 0, y: 0, size: 360, dots: q.dots, eyeOuter: q.eyeOuter, eyeInner: q.eyeInner, fg: q.fg, fg2: q.gradient ? q.fg2 : undefined, eyeColor: q.eyeColor || undefined, bg: q.bg, bgRadius: 0, margin: Math.min(q.margin, 3), ec: q.ec, logo: q.logo || undefined, logoScale: q.logoScale, angle: 135 }; };
const download = (blob, name) => { const a = h("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
let qrT, qrSeq = 0, qrPrev, qrWarn;
function qrRefresh() {
  clearTimeout(qrT);
  qrT = setTimeout(async () => {
    const seq = ++qrSeq;
    try { const r = await post("/qr", qrSpec()); if (seq !== qrSeq) return; qrPrev.innerHTML = r.svg; S.qr.payload = r.payload; qrWarn.replaceChildren(...(r.warnings.length ? r.warnings.map((w) => h("div", { class: "warn" }, "⚠ " + w)) : [h("div", { class: "muted small" }, `✓ ${r.modules}×${r.modules} وحدة · جرّب مسحه بجوالك قبل الطباعة`)])); }
    catch (e) { if (seq !== qrSeq) return; qrPrev.replaceChildren(); S.qr.payload = ""; qrWarn.replaceChildren(h("div", { class: "warn" }, e.message)); }
  }, 250);
}
function renderQrTab() {
  const p = $("#tab-qr"); p.replaceChildren(); S.qr ??= QR_DEFAULT(); const q = S.qr;
  if (!S.brands[q.brand]) q.brand = Object.keys(S.brands)[0] ?? "";
  const cols = S.brands[q.brand]?.brand?.colors ?? {};
  const upd = (fn, redraw = false) => { fn(); redraw ? renderQrTab() : qrRefresh(); };
  const sel = (cur, opts, on) => h("select", { style: { width: "100%" }, onchange: (e) => on(e.target.value) }, opts.map(([v, t]) => h("option", { value: v, selected: v === cur }, t)));
  qrPrev = h("div", { class: "qr-prev" }); qrWarn = h("div");
  p.append(qrPrev, qrWarn, h("div", { class: "grid2", style: { margin: "8px 0" } }, btn("تحميل SVG", guard(async () => { const r = await post("/qr", qrSpec(1000)); download(new Blob([r.svg], { type: "image/svg+xml" }), "qr.svg"); })),
    btn("تحميل PNG", guard(async () => { const res = await fetch("/api/qr/png", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(qrSpec(q.pxSize)) }); if (!res.ok) throw new Error((await res.json()).error); download(await res.blob(), "qr.png"); }))),
    h("div", { class: "grid2" }, btn("+ أضف للتصميم", guard(async () => { if (!S.design) throw new Error("افتح تصميماً أولاً"); if (!q.payload) throw new Error("أكمل بيانات الكود"); const { w, h: hh } = size(); addElement({ ...qrElement(), x: Math.round((w - 360) / 2), y: Math.round((hh - 360) / 2) }); toast("تمت الإضافة. عدّل الحجم والموضع من لوحة الخصائص"); })),
      btn("▦ بطاقة QR جديدة", guard(async () => {
        if (!q.payload) throw new Error("أكمل بيانات الكود"); const brandId = q.brand;
        const r = await post("/designs", { brand: brandId, format: "post", template: "qr-card", content: { title: T("امسح الكود"), qr: q.payload, cta: T("امسح للمتابعة") } });
        const d = await api(`/designs/${encodeURIComponent(r.id)}`); const i = d.elements.findIndex((e) => e.type === "qr"); const old = d.elements[i];
        d.elements[i] = { ...qrElement(), x: old.x, y: old.y, size: old.size, bg: "transparent" === q.bg ? "transparent" : q.bg, margin: 0 }; await post(`/designs/${encodeURIComponent(r.id)}`, d, "PUT");
        await loadDesigns(); await openDesign(r.id); switchTab("designs");
      }))),
    h("hr"), h("h3", {}, "المحتوى"), row("الهوية", sel(q.brand, Object.keys(S.brands).map((id) => [id, S.brands[id].brand?.name ?? id]), (v) => upd(() => (q.brand = v, q.fg = "text", q.bg = "surface"), true))),
    row("النوع", sel(q.type, Object.entries(S.meta.qrTypes).map(([k, v]) => [k, v.label]), (v) => upd(() => { q.type = v; q.fields = {}; }, true))));
  for (const f of S.meta.qrTypes[q.type].fields) p.append(h("div", { class: "row col" }, h("label", { style: { width: "auto" } }, f.label), h(f.area ? "textarea" : "input", { rows: 3, value: q.fields[f.key] ?? "", placeholder: f.placeholder ?? "", oninput: (e) => upd(() => (q.fields[f.key] = e.target.value)) })));
  p.append(h("hr"), h("h3", {}, "الشكل"), row("النقاط", sel(q.dots, QR_DOTS, (v) => upd(() => (q.dots = v)))), row("إطار العين", sel(q.eyeOuter, QR_EYES, (v) => upd(() => (q.eyeOuter = v)))), row("بؤبؤ العين", sel(q.eyeInner, QR_EYES, (v) => upd(() => (q.eyeInner = v)))),
    colorF("لون الكود", q.fg, (c) => upd(() => (q.fg = c), true), cols),
    row("تدرّج", h("input", { type: "checkbox", style: { width: "auto" }, checked: q.gradient, onchange: (e) => upd(() => (q.gradient = e.target.checked), true) })),
    ...(q.gradient ? [colorF("اللون الثاني", q.fg2, (c) => upd(() => (q.fg2 = c), true), cols)] : []),
    colorF("لون العيون (اختياري)", q.eyeColor, (c) => upd(() => (q.eyeColor = c), true), cols),
    colorF("الخلفية", q.bg, (c) => upd(() => (q.bg = c), true), cols, true),
    h("hr"), h("h3", {}, "شعار بالوسط"),
    row("الشعار", sel(q.logo, [["", "بدون"], ["brand:default", "شعار الهوية"], ["brand:mark", "رمز الهوية"], ["brand:light", "الشعار الفاتح"], ...assetNames.map((n) => [n, n])], (v) => upd(() => (q.logo = v)))),
    row("الحجم", h("input", { type: "range", min: 0.12, max: 0.28, step: 0.02, value: q.logoScale, style: { padding: 0 }, oninput: (e) => upd(() => (q.logoScale = +e.target.value)) })),
    h("hr"), h("h3", {}, "متقدم"), row("الهامش", h("input", { type: "number", min: 0, max: 8, value: q.margin, oninput: (e) => upd(() => (q.margin = +e.target.value)) })),
    row("تصحيح الأخطاء", sel(q.ec, [["L", "L منخفض"], ["M", "M متوسط"], ["Q", "Q جيد"], ["H", "H عالٍ (للشعار)"]], (v) => upd(() => (q.ec = v)))),
    row("حجم PNG", sel(String(q.pxSize), [["512", "512 px"], ["1024", "1024 px"], ["2048", "2048 px"], ["4000", "4000 px (طباعة)"]], (v) => upd(() => (q.pxSize = +v)))),
    h("p", { class: "note" }, "نصيحة: مع الشعار يُرفع تصحيح الأخطاء تلقائياً. حافظ على تباين عالٍ بين الكود والخلفية، وجرّب المسح بجوالك قبل الطباعة."));
  qrRefresh();
}

/* ---------- الإعدادات وحالة الاتصال ---------- */
const copyText = (t) => navigator.clipboard.writeText(t).then(() => toast("تم النسخ ✓")).catch(() => toast("تعذّر النسخ", true));
const codeBox = (t) => h("div", { class: "codebox" }, h("pre", {}, t), h("button", { class: "btn small", onclick: () => copyText(t) }, "نسخ"));
const fmtUp = (s) => (s < 60 ? `${s} ث` : s < 3600 ? `${Math.floor(s / 60)} د` : `${Math.floor(s / 3600)} س ${Math.floor((s % 3600) / 60)} د`);
const fmtT = (t) => new Date(t).toLocaleTimeString("en-GB");
let statusT;
async function pollStatus() {
  try { const st = await api("/status"); S.status = st; $("#statusDot").className = "dot " + (st.tunnel.state === "on" ? "on" : "ok"); $("#settingsBtn").title = `السيرفر شغّال · ${st.tools.length} أداة MCP` + (st.tunnel.state === "on" ? " · النفق (ChatGPT) فعّال" : ""); return st; }
  catch { $("#statusDot").className = "dot bad"; $("#settingsBtn").title = "تعذّر الاتصال بالسيرفر"; }
}
async function openSettings() {
  let st = await api("/status"), refreshing = false; S.plist = await api("/plugins").catch(() => []);
  const body = h("div"), stabs = h("div", { class: "stabs" }), content = h("div");
  const TABS = [["status", "الحالة"], ["general", "عام"], ["plugins", "الإضافات"], ["claude", "Claude"], ["chatgpt", "ChatGPT"], ["activity", "النشاط"]];
  const srow = (state, label, value) => h("div", { class: "srow" }, h("span", { class: "dot " + state }), h("b", {}, label), h("span", { class: "grow" }), h("span", { class: "muted small" }, value));
  const testMcp = guard(async () => {
    const t0 = performance.now(); const r = await fetch("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    const txt = await r.text(); const m = txt.match(/data: (.*)/); const n = JSON.parse(m ? m[1] : txt).result?.tools?.length;
    toast(`✓ اتصال MCP سليم — ${n} أداة (${Math.round(performance.now() - t0)}ms)`);
  });
  const draw = () => {
    stabs.replaceChildren(...TABS.map(([k, t]) => h("button", { class: S.settingsTab === k ? "on" : "", onclick: () => { S.settingsTab = k; draw(); } }, t)));
    const t = st.tunnel, c = [];
    if (S.settingsTab === "status") {
      const local = st.clients.filter((x) => !x.remote), remote = st.clients.filter((x) => x.remote);
      c.push(srow("ok", "السيرفر", `شغّال منذ ${fmtUp(st.uptime)} · المنفذ ${st.port} · PID ${st.pid}`), srow(st.chromium ? "ok" : "bad", "محرّك الصور (Chromium)", st.chromium ? "جاهز" : "غير مثبّت — شغّل: npx playwright install chromium"), srow(st.ffmpeg ? "ok" : "bad", "FFmpeg (فيديو / GIF)", st.ffmpeg ? "جاهز" : "غير مثبّت — شغّل: brew install ffmpeg"),
        srow("ok", "المحتوى", `${st.brands} هويات · ${st.designs} تصميم`), srow("ok", "أدوات MCP", `${st.tools.length} أداة`),
        srow(local.length ? "ok" : "idle", "اتصالات محلية (Claude Code / Desktop)", local.length ? local.map((x) => `${x.client} · آخر نشاط ${fmtT(x.last)}`).join(" | ") : "لا نشاط بعد"),
        srow(t.state === "on" ? "on" : t.state === "error" ? "bad" : t.state === "starting" ? "idle" : "idle", "النفق (ChatGPT)", t.state === "on" ? t.url : t.state === "starting" ? "جاري التشغيل…" : t.state === "error" ? t.error : "متوقف"),
        srow(remote.length ? "ok" : "idle", "اتصالات بعيدة (ChatGPT)", remote.length ? remote.map((x) => `${x.client} · ${fmtT(x.last)}`).join(" | ") : "لا نشاط بعد"),
        h("div", { style: { margin: "12px 0" } }, h("button", { class: "btn primary", onclick: testMcp }, "اختبار اتصال MCP")),
        h("details", { class: "tools" }, h("summary", {}, "قائمة الأدوات (" + st.tools.length + ")"), h("p", { class: "small", style: { direction: "ltr", textAlign: "left" } }, st.tools.join(" · "))),
        h("p", { class: "muted small" }, `الإصدار ${st.version} · Node ${st.node}`));
    } else if (S.settingsTab === "plugins") {
      c.push(...pluginsPane());
    } else if (S.settingsTab === "general") {
      const k = st.keys ?? {}, mk = (ph) => h("input", { type: "password", autocomplete: "off", placeholder: ph }), pex = mk(k.pexels ? "•••••• (محفوظ — اكتب لاستبداله)" : "Pexels API key"), oai = mk(k.openai ? "•••••• (محفوظ — اكتب لاستبداله)" : "OpenAI API key"), model = h("input", { value: k.imageModel ?? "gpt-image-1" });
      const saveKeys = (body, ok = "تم الحفظ ✓") => guard(async () => { await post("/settings/keys", body); st = await api("/status"); S.status = st; draw(); toast(ok); });
      c.push(h("h3", {}, "اللغة / Language"), row("اللغة", h("select", { style: { width: "100%" }, onchange: (e) => setLang(e.target.value) }, [["ar", "العربية"], ["en", "English"]].map(([v, t]) => h("option", { value: v, selected: (isEn ? "en" : "ar") === v }, t)))), h("p", { class: "muted small" }, "تغيير اللغة يعيد تحميل الصفحة، ويقلب اتجاه الواجهة."),
        h("hr"), h("h3", {}, "مفاتيح خدمات الصور (اختيارية)"), h("p", { class: "muted small" }, "تُحفظ على جهازك فقط ولا تظهر في الواجهة بعد الحفظ. لا تكتبها في محادثة مع أي ذكاء اصطناعي."),
        row("Pexels", pex, h("button", { class: "btn small", onclick: () => pex.value.trim() && saveKeys({ pexels: pex.value })() }, "حفظ"), k.pexels ? h("button", { class: "btn small danger", onclick: saveKeys({ pexels: "" }, "تم المسح") }, "مسح") : null),
        h("p", { class: "muted small" }, "للبحث عن صور مجانية. احصل على مفتاح مجاني من pexels.com/api"),
        row("OpenAI", oai, h("button", { class: "btn small", onclick: () => oai.value.trim() && saveKeys({ openai: oai.value })() }, "حفظ"), k.openai ? h("button", { class: "btn small danger", onclick: saveKeys({ openai: "" }, "تم المسح") }, "مسح") : null),
        row("النموذج", model, h("button", { class: "btn small", onclick: saveKeys({ imageModel: model.value }) }, "حفظ")),
        h("p", { class: "muted small" }, "لتوليد الصور بالذكاء الاصطناعي. كل صورة تستهلك رصيد حسابك لدى OpenAI."));
    } else if (S.settingsTab === "claude") {
      c.push(h("h3", {}, "Claude Code"), h("p", { class: "small" }, "شغّل هذا الأمر مرة واحدة بالتيرمنال (والسيرفر شغّال):"), codeBox(`claude mcp add --transport http mycanva ${st.mcp.local}`),
        h("p", { class: "muted small" }, "أو بلا حاجة لتشغيل السيرفر: الملف .mcp.json بمجلد المشروع يشغّله تلقائياً عند فتح Claude Code فيه."),
        h("h3", { style: { marginTop: "16px" } }, "Claude Desktop"), h("p", { class: "small" }, "أضف هذا في Settings / Developer / Edit Config ثم أعد تشغيل التطبيق (لا يحتاج السيرفر شغّال):"),
        codeBox(JSON.stringify({ mcpServers: { mycanva: { command: st.stdio.command, args: st.stdio.args } } }, null, 2)),
        h("div", { class: "note" }, "بعد الربط اضغط «اختبار اتصال MCP» في تبويب الحالة، وتابع آخر نشاط في تبويب النشاط."));
    } else if (S.settingsTab === "chatgpt") {
      const avail = t.available, prov = h("select", {}, [["ngrok", `ngrok ${avail.ngrok ? "" : "(غير مثبّت)"}`], ["cloudflared", `cloudflared ${avail.cloudflared ? "" : "(غير مثبّت)"}`]].map(([v, l]) => h("option", { value: v, disabled: !avail[v] }, l)));
      prov.value = avail.ngrok ? "ngrok" : "cloudflared";
      c.push(h("div", { class: "note" }, "ChatGPT يحتاج رابط HTTPS عام للوصول إلى السيرفر، فنستخدم نفقاً (tunnel) يوصل جهازك بالإنترنت مؤقتاً. بعد الإيقاف يُغلق الوصول."),
        h("div", { class: "note warn" }, "⚠ الرابط يعطي أي شخص يملكه تحكماً بأدوات التصميم عندك (إنشاء وتعديل وتصدير تصاميم وهويات). لا تشاركه. الوصول البعيد محمي برمز سري ومحدود: لا يقرأ ملفات من جهازك ولا يفتح الواجهة. يمكنك تجديد الرمز بأي وقت."),
        h("h3", {}, "1) شغّل النفق"),
        h("div", { class: "row" }, prov, t.state === "on" || t.state === "starting" ? h("button", { class: "btn danger", onclick: guard(async () => { await post("/tunnel/stop", {}); st = await api("/status"); draw(); }) }, "إيقاف النفق")
          : h("button", { class: "btn primary", onclick: guard(async (e) => { e.target.disabled = true; e.target.textContent = "جاري التشغيل…"; const r = await post("/tunnel/start", { provider: prov.value }); st = await api("/status"); draw(); if (r.state === "error") toast(r.error, true); }) }, "تشغيل النفق")),
        t.state === "on" ? srow("on", "النفق فعّال", t.url) : t.state === "starting" ? srow("idle", "جاري التشغيل…", "") : t.state === "error" ? h("div", { class: "note warn" }, "تعذّر التشغيل: " + t.error) : null,
        avail.ngrok ? null : h("p", { class: "muted small" }, "ثبّت ngrok: brew install ngrok ثم ngrok config add-authtoken <TOKEN> (حساب مجاني)."),
        h("h3", { style: { marginTop: "14px" } }, "2) أضف الموصل في ChatGPT"),
        h("ol", { class: "small", style: { lineHeight: 2, paddingInlineStart: "20px" } }, h("li", {}, "افتح ChatGPT / Settings / Connectors / Advanced وفعّل Developer mode (يتوفر بحسب خطتك)."), h("li", {}, "اضغط Create / Add custom connector."), h("li", {}, "الصق الرابط أدناه كـ MCP Server URL، واختر Authentication: None."), h("li", {}, "في محادثة جديدة فعّل الموصل من زر + ثم Developer mode، واطلب مثلاً: «سوّي بوست لهوية melyo».")),
        st.mcp.remote ? codeBox(st.mcp.remote) : h("p", { class: "muted small" }, "سيظهر الرابط هنا بعد تشغيل النفق أو حفظ رابطك الخاص."),
        h("h3", { style: { marginTop: "14px" } }, "نفق خاص بك (اختياري)"), h("p", { class: "muted small" }, "إن كنت تشغّل نفقك بنفسك (ngrok بدومين ثابت، Cloudflare Tunnel…) وجّهه إلى المنفذ " + st.port + " وضع رابطه هنا:"),
        (() => { const inp = h("input", { placeholder: "https://my-domain.example.com", value: st.mcp.customUrl ?? "" }); return h("div", { class: "row" }, inp, h("button", { class: "btn", onclick: guard(async () => { await post("/settings/custom-url", { url: inp.value.trim() }); st = await api("/status"); draw(); toast("تم الحفظ"); }) }, "حفظ")); })(),
        h("h3", { style: { marginTop: "14px" } }, "الرمز السري"), h("p", { class: "muted small" }, "جزء من الرابط. إذا شككت أنه تسرّب جدّده (سيتوقف الرابط القديم فوراً)."),
        h("button", { class: "btn danger", onclick: guard(async () => { if (!ask("تجديد الرمز؟ سيتوقف الرابط الحالي ويجب تحديثه في ChatGPT.")) return; await post("/settings/token", {}); st = await api("/status"); draw(); toast("تم تجديد الرمز"); }) }, "تجديد الرمز"));
    } else {
      c.push(h("h3", {}, "الأجهزة المتصلة"), st.clients.length ? h("table", { class: "tbl" }, h("tr", {}, ...["العميل", "المصدر", "آخر نشاط", "الطلبات"].map((x) => h("th", {}, x))), ...st.clients.map((x) => h("tr", {}, h("td", {}, x.client), h("td", {}, x.remote ? "بعيد (نفق)" : "محلي"), h("td", {}, fmtT(x.last)), h("td", {}, x.calls)))) : h("p", { class: "muted small" }, "لا نشاط بعد."),
        h("h3", { style: { marginTop: "16px" } }, "آخر الطلبات"), st.activity.length ? h("table", { class: "tbl" }, h("tr", {}, ...["الوقت", "العميل", "الطلب", "الحالة", "المدة"].map((x) => h("th", {}, x))), ...st.activity.map((a) => h("tr", {}, h("td", {}, fmtT(a.t)), h("td", {}, (a.remote ? "🌐 " : "") + a.client), h("td", {}, a.tool ?? a.method), h("td", {}, h("span", { class: "dot " + (a.status < 400 ? "ok" : "bad") })), h("td", {}, a.ms + "ms")))) : h("p", { class: "muted small" }, "لا طلبات بعد."));
    }
    content.replaceChildren(...c.filter(Boolean));
  };
  body.append(stabs, content); draw();
  const tick = setInterval(async () => { if (refreshing || $("#modal").hidden || content.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; refreshing = true; try { st = await api("/status"); draw(); } catch {} refreshing = false; }, 3000);
  modal("الإعدادات وحالة الاتصال", body, [h("button", { class: "btn", onclick: closeModal }, "إغلاق")], { wide: true, onClose: () => { clearInterval(tick); pollStatus(); } });
}
$("#settingsBtn").onclick = guard(openSettings);
startI18n(); startIcons();

/* ---------- أدوات إضافية للخصائص ---------- */
const sliderF = (label, value, min, max, step, on, fmt = (v) => v) => { const out = h("span", { class: "small muted", style: { width: "38px", textAlign: "end" } }, String(fmt(value))); return row(label, h("input", { type: "range", min, max, step, value, style: { padding: 0 }, oninput: (e) => { out.textContent = fmt(+e.target.value); on(+e.target.value); } }), out); };
const FILTER_DEF = { brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0 };
const ANIMS = [["", "بدون"], ["fade", "ظهور تدريجي"], ["slide-up", "صعود"], ["slide-down", "نزول"], ["slide-left", "من اليسار"], ["slide-right", "من اليمين"], ["zoom", "تكبير"], ["pop", "ارتداد"]];
function imageExtras(el) {
  const f = { ...FILTER_DEF, ...(el.filter ?? {}) }, setF = (k, v) => setProp("filter", { ...FILTER_DEF, ...(S.design.elements[S.sel].filter ?? {}), [k]: v });
  return [h("h3", { style: { marginTop: "10px" } }, "قص وتركيز"),
    sliderF("تركيز أفقي", el.posX ?? 50, 0, 100, 1, (v) => setProp("posX", v), (v) => v + "%"), sliderF("تركيز عمودي", el.posY ?? 50, 0, 100, 1, (v) => setProp("posY", v), (v) => v + "%"), sliderF("تكبير", el.zoom ?? 1, 1, 4, 0.05, (v) => setProp("zoom", v), (v) => v.toFixed(2) + "×"),
    h("h3", { style: { marginTop: "10px" } }, "فلاتر"),
    sliderF("السطوع", f.brightness, 0, 250, 1, (v) => setF("brightness", v)), sliderF("التباين", f.contrast, 0, 250, 1, (v) => setF("contrast", v)), sliderF("التشبّع", f.saturate, 0, 300, 1, (v) => setF("saturate", v)),
    sliderF("ضبابية", f.blur, 0, 40, 1, (v) => setF("blur", v)), sliderF("رمادي", f.grayscale, 0, 100, 1, (v) => setF("grayscale", v)), sliderF("بني قديم", f.sepia, 0, 100, 1, (v) => setF("sepia", v)),
    h("div", { class: "grid2", style: { marginTop: "6px" } }, btn("إعادة ضبط", () => { setProp("filter", undefined, { redraw: true }); setProp("posX", 50); setProp("posY", 50); setProp("zoom", 1, { redraw: true }); }),
      btn("✂ إزالة الخلفية", guard(async () => { const src = S.design.elements[S.sel].src; if (/^(https?:|data:)/.test(src)) throw new Error("ارفع الصورة أولاً (يجب أن تكون ملفاً من مجلد assets)"); toast("جاري إزالة الخلفية…"); const r = await post("/remove-bg", { asset: src, tolerance: S.bgTol ?? 32 }); await loadAssetNames(); setProp("src", r.name, { redraw: true }); toast("تمت إزالة الخلفية ✓"); }))),
    sliderF("تسامح الإزالة", S.bgTol ?? 32, 5, 120, 1, (v) => (S.bgTol = v)), h("p", { class: "muted small" }, "إزالة الخلفية تناسب الخلفيات السادة (لون موحّد). للخلفيات المعقدة استخدم أداة خارجية.")];
}
function animRows(el) {
  const a = el.anim;
  return [h("hr"), h("h3", {}, "حركة (للفيديو / GIF)"), row("النوع", h("select", { style: { width: "100%" }, onchange: (e) => setProp("anim", e.target.value ? { type: e.target.value, delay: el.anim?.delay ?? 0, duration: el.anim?.duration ?? 600 } : undefined, { redraw: true }) }, ANIMS.map(([v, t]) => h("option", { value: v, selected: (a?.type ?? "") === v }, t)))),
    ...(a ? [row("تأخير (ms)", h("input", { type: "number", step: 50, min: 0, value: a.delay, oninput: (e) => setProp("anim", { ...S.design.elements[S.sel].anim, delay: +e.target.value }) })), row("المدة (ms)", h("input", { type: "number", step: 50, min: 100, value: a.duration, oninput: (e) => setProp("anim", { ...S.design.elements[S.sel].anim, duration: Math.max(100, +e.target.value) }) }))] : []),
    row("قفل الطبقة", h("input", { type: "checkbox", style: { width: "auto" }, checked: !!el.locked, onchange: () => toggleLock(S.sel) }))];
}

/* ---------- إجراءات التصميم (عند عدم تحديد عنصر) ---------- */
function designActions() {
  return h("div", {}, h("hr"), h("h3", {}, "إجراءات التصميم"), h("div", { class: "grid2" },
    btn("💾 حفظ كقالب", saveTemplateModal), btn("🌐 نسخة مترجمة", guard(cloneModal)), btn("✓ فحص الهوية", lintModal), btn("🎬 فيديو / GIF", videoModal), btn("⧉ تكرار التصميم", guard(duplicateDesign)), ...pluginActionButtons()));
}
async function duplicateDesign() {
  await flushSave(); const base = S.id.replace(/-copy\d*$/, ""); let n = 1, id = `${base}-copy`; while (S.designs.some((d) => d.id === id)) id = `${base}-copy${++n}`;
  const r = await post(`/designs/${encodeURIComponent(S.id)}/clone`, { newId: id }); await loadDesigns(); await openDesign(r.id); toast("تم إنشاء نسخة");
}
function saveTemplateModal() {
  const name = h("input", { placeholder: "مثال: عرض الجمعة" });
  modal("حفظ كقالب", h("div", {}, h("p", { class: "muted small" }, "يُحفظ التصميم الحالي كقالب خاص بك. ألوانه مرتبطة بالهوية، فيتكيّف مع أي هوية تختارها عند الاستخدام."), row("الاسم", name)),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => { if (!name.value.trim()) return toast("اكتب اسم القالب", true); await flushSave(); await post("/user-templates", { name: name.value.trim(), design: S.design }); S.meta = await api("/meta"); closeModal(); toast("تم حفظ القالب. تجده في «تصميم جديد» / قوالبي"); }) }, "حفظ")]);
}
async function cloneModal() {
  await flushSave(); const texts = await api(`/designs/${encodeURIComponent(S.id)}/texts`);
  const bSel = brandSelect(S.design.brand), mir = h("input", { type: "checkbox", style: { width: "auto" } }), fields = texts.map((t) => ({ t, ta: h("textarea", { rows: 2 }, t.text) }));
  const dirOf = (id) => S.brands[id]?.brand?.direction ?? "rtl", sync = () => (mir.checked = dirOf(bSel.value) !== dirOf(S.design.brand)); bSel.onchange = sync;
  modal("نسخة مترجمة", h("div", {}, h("p", { class: "muted small" }, "تُنشأ نسخة بهوية أخرى (مثلاً هوية إنكليزية) مع نصوص جديدة. اكتب الترجمة هنا، أو اطلب من Claude عبر MCP أن يترجمها لك (أداتا list_texts وclone_design). عند تغيّر اتجاه الكتابة يُعكس التخطيط تلقائياً."),
    row("الهوية", bSel), h("label", { class: "row", style: { cursor: "pointer" } }, mir, h("span", {}, "عكس التخطيط (RTL / LTR)")), h("hr"), ...fields.map((f) => h("div", { class: "row col" }, h("label", { style: { width: "auto" } }, `#${f.t.index}`), f.ta))),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => {
      const out = {}; for (const f of fields) if (f.ta.value !== f.t.text) out[f.t.index] = f.ta.value;
      const r = await post(`/designs/${encodeURIComponent(S.id)}/clone`, { newId: `${S.id}-${bSel.value === S.design.brand ? "v2" : bSel.value}`, brand: bSel.value, texts: out, mirror: mir.checked });
      closeModal(); await loadDesigns(); await openDesign(r.id); toast("تم إنشاء النسخة");
    }) }, "إنشاء النسخة")], { wide: true });
}

/* ---------- فاحص الهوية ---------- */
const LINT_ICON = { error: "⛔", warn: "⚠", info: "ℹ" };
let lintRes = [];
function scheduleLint() { clearTimeout(S.lintT); S.lintT = setTimeout(runLint, 900); }
async function runLint() {
  const chip = $("#lintChip"); if (!S.design) { chip.hidden = true; return; }
  try { lintRes = await post("/lint", { design: S.design }); } catch { return; }
  const n = lintRes.filter((i) => i.level !== "info").length; chip.hidden = false;
  chip.textContent = n ? `⚠ ${n} ملاحظات` : lintRes.length ? `✓ مطابق (${lintRes.length} تلميحات)` : "✓ مطابق للهوية"; chip.className = "chip-btn" + (n ? " warn" : " ok");
}
function lintModal() {
  const list = h("div", { class: "list" }, lintRes.length ? lintRes.map((i) => h("div", { class: "item", onclick: () => { closeModal(); if (i.index != null) select(i.index); } }, h("span", {}, LINT_ICON[i.level]), h("span", { class: "t", style: { whiteSpace: "normal" } }, i.message), i.index != null ? h("span", { class: "chip" }, "#" + i.index) : null)) : [h("p", { class: "muted small" }, "لا ملاحظات. التصميم مطابق للهوية وقواعد الجودة ✓")]);
  modal("فحص الهوية والجودة", h("div", {}, h("p", { class: "muted small" }, "يفحص التباين، الألوان خارج الهوية، حجم الخط، حدود العناصر، الـ QR، ومناطق الستوري الآمنة. اضغط ملاحظة لتحديد العنصر."), list), [h("button", { class: "btn", onclick: closeModal }, "إغلاق")]);
}
$("#lintChip").onclick = lintModal;

/* ---------- الفيديو / GIF ---------- */
const animCount = () => S.design.elements.filter((e) => e.anim).length;
const animTotal = () => Math.max(0, ...S.design.elements.map((e) => (e.anim ? e.anim.delay + e.anim.duration : 0)));
function autoAnimate() {
  change((d) => { let t = 0; d.elements.forEach((e, i) => { if (e.type === "pattern" || (e.type === "shape" && (e.w ?? 0) >= size().w * 0.9)) { e.anim = { type: "fade", delay: 0, duration: 500 }; return; }
    const type = e.type === "text" ? "slide-up" : e.type === "image" ? "zoom" : e.type === "shape" ? "fade" : "pop"; e.anim = { type, delay: Math.min(2600, 250 + t), duration: 600 }; t += 140; }); });
}
function previewAnimation() { if (!animCount()) return toast("أضف حركة لعنصر واحد على الأقل", true); S.animPrev = true; renderPreview(); toast("معاينة الحركة…"); setTimeout(() => { S.animPrev = false; renderPreview(); }, animTotal() + 1500); }
function videoModal() {
  const fmt = h("select", { style: { width: "100%" } }, [["mp4", "MP4 (فيديو، يناسب ستوري وريلز)"], ["gif", "GIF (أصغر، دقة أقل)"]].map(([v, t]) => h("option", { value: v }, t)));
  const info = h("p", { class: "small" });
  const upd = () => (info.textContent = animCount() ? `${animCount()} عناصر متحركة · المدة ≈ ${((animTotal() + 1000) / 1000).toFixed(1)} ث` : "لا توجد عناصر متحركة بعد.");
  upd();
  modal("فيديو / GIF", h("div", {}, h("p", { class: "muted small" }, "كل عنصر له حركة دخول (من لوحة خصائصه). اضغط «تحريك تلقائي» لإضافة حركات متتابعة لكل العناصر دفعة واحدة."), info, row("الصيغة", fmt),
    h("div", { class: "grid2", style: { marginTop: "8px" } }, btn("✨ تحريك تلقائي", () => { autoAnimate(); upd(); }), btn("▶ معاينة", () => { closeModal(); previewAnimation(); }))),
    [h("button", { class: "btn", onclick: closeModal }, "إغلاق"), h("button", { class: "btn primary", onclick: guard(async () => {
      if (!animCount()) return toast("أضف حركة لعنصر واحد على الأقل", true); toast("جاري توليد الفيديو… قد يستغرق عدة ثوانٍ"); await flushSave();
      const r = await post("/video", { design: S.design, format: fmt.value, name: S.id }); const a = h("a", { href: r.url, download: r.url.split("/").pop() }); document.body.append(a); a.click(); a.remove(); toast(`تم التصدير · ${r.seconds} ث`);
    }) }, "تصدير")]);
}

/* ---------- حالة المنشور والتقويم ---------- */
const STATUS_META = { draft: ["مسودة", "#8a93a6"], approved: ["موافق عليه", "#2f7cf6"], scheduled: ["مجدول", "#e8890c"], published: ["تم النشر", "#1fa971"] };
const setPub = guard(async () => {
  if (!S.design) return; const v = { status: $("#pubStatus").value || null, date: $("#pubDate").value || null, time: $("#pubTime").value || null };
  await flushSave(); await post("/schedule", { ...(S.design.group ? { group: S.design.group } : { id: S.id }), ...v });
  Object.assign(S.design, { status: v.status ?? undefined, date: v.date ?? undefined, time: v.time ?? undefined }); await loadDesigns(); toast("تم الحفظ ✓");
});
for (const id of ["#pubStatus", "#pubDate", "#pubTime"]) $(id).addEventListener("change", setPub);
$("#pubApprove").onclick = () => { $("#pubStatus").value = "approved"; setPub(); };
function calendarModal() {
  let cur = new Date(); cur.setDate(1); const loc = isEn ? "en-GB" : "ar-EG", weekStart = isEn ? 1 : 6;
  const body = h("div"), iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const posts = () => { const m = new Map(); for (const d of [...S.designs].sort(byOrder)) { const k = d.group ?? d.id; if (!m.has(k)) m.set(k, { key: k, group: d.group, id: d.id, kind: d.kind, date: d.date, time: d.time, status: d.status, brand: d.brand }); } return [...m.values()]; };
  const open = guard(async (p) => { closeModal(); await openDesign(p.id); });
  const chip = (p) => { const [lbl, col] = STATUS_META[p.status ?? "draft"] ?? STATUS_META.draft; const el = h("div", { class: "cchip", draggable: "true", title: `${p.key} · ${T(lbl)}${p.time ? " · " + p.time : ""}`, style: { borderInlineStartColor: col }, onclick: () => open(p) }, (p.kind === "carousel" ? "📚 " : p.kind === "batch" ? "⚡ " : "") + p.key);
    el.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", JSON.stringify({ group: p.group, id: p.id }))); return el; };
  const drop = guard(async (e, date) => { e.preventDefault(); const t = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); await post("/schedule", { ...(t.group ? { group: t.group } : { id: t.id }), date, ...(date && !posts().find((p) => p.key === (t.group ?? t.id))?.status ? { status: "scheduled" } : {}) }); await loadDesigns(); draw(); });
  function draw() {
    const all = posts(), y = cur.getFullYear(), mo = cur.getMonth(), first = new Date(y, mo, 1), startOff = (first.getDay() - weekStart + 7) % 7, days = new Date(y, mo + 1, 0).getDate(), today = iso(new Date());
    const head = h("div", { class: "calhead" }, h("button", { class: "btn small", onclick: () => { cur = new Date(y, mo - 1, 1); draw(); } }, isEn ? "‹" : "›"), h("b", { style: { flex: 1, textAlign: "center" } }, cur.toLocaleDateString(loc, { month: "long", year: "numeric" })), h("button", { class: "btn small", onclick: () => { cur = new Date(y, mo + 1, 1); draw(); } }, isEn ? "›" : "‹"), h("button", { class: "btn small", onclick: () => { cur = new Date(); cur.setDate(1); draw(); } }, "اليوم"));
    const grid = h("div", { class: "calgrid" }, Array.from({ length: 7 }, (_, i) => h("div", { class: "calwd" }, new Date(2024, 0, 7 + ((i + weekStart) % 7)).toLocaleDateString(loc, { weekday: "short" }))));
    for (let i = 0; i < startOff; i++) grid.append(h("div", { class: "calcell off" }));
    for (let d = 1; d <= days; d++) {
      const ds = iso(new Date(y, mo, d)), items = all.filter((p) => p.date === ds), cell = h("div", { class: "calcell" + (ds === today ? " today" : ""), ondragover: (e) => e.preventDefault(), ondrop: (e) => drop(e, ds) }, h("span", { class: "dn" }, String(d)), items.slice(0, 3).map(chip), items.length > 3 ? h("span", { class: "small muted" }, `+${items.length - 3}`) : null);
      grid.append(cell);
    }
    const unscheduled = all.filter((p) => !p.date), legend = h("div", { class: "legend" }, Object.entries(STATUS_META).map(([k, [l, c]]) => h("span", {}, h("i", { style: { background: c } }), l)));
    const side = h("div", { class: "calside", ondragover: (e) => e.preventDefault(), ondrop: (e) => drop(e, null) }, h("h3", {}, "غير مجدول"), unscheduled.length ? unscheduled.map(chip) : h("p", { class: "muted small" }, "كل المنشورات لها موعد"), h("p", { class: "muted small" }, "اسحب أي منشور إلى يوم لتحديد موعده، أو أعده هنا لإلغاء الموعد."));
    body.replaceChildren(head, h("div", { class: "calwrap" }, h("div", {}, grid, legend), side));
  }
  draw(); modal("تقويم المحتوى", body, [h("button", { class: "btn", onclick: closeModal }, "إغلاق")], { wide: true, big: true });
}
$("#calBtn").onclick = calendarModal;

/* ---------- اختصارات لوحة المفاتيح ---------- */
/* ---------- هوية من شعار أو موقع ---------- */
function brandFromModal() {
  const url = h("input", { placeholder: "https://example.com" }), file = h("input", { type: "file", accept: ".png,.jpg,.jpeg,.webp,.svg", hidden: true }), out = h("div"), swatchRow = (arr, on) => h("div", { class: "swatches", style: { margin: "6px 0" } }, arr.map((c) => h("button", { class: "sw", style: { background: c }, title: c, onclick: () => on(c) })));
  let sug = null, logoFile = null;
  const analyze = (p) => guard(async () => {
    out.replaceChildren(h("p", { class: "muted small" }, "جاري التحليل…")); sug = await p(); renderRes();
  });
  const renderRes = () => {
    const pal = h("div", { class: "palette-prev" }); const paint = () => pal.replaceChildren(...["primary", "secondary", "accent", "bg", "surface", "text", "muted"].map((k) => h("span", { style: { background: sug.colors[k] }, title: k })));
    paint();
    out.replaceChildren(h("h3", {}, "ألوان وجدتها (اضغط لتعيينها أساسياً)"), swatchRow(sug.swatches, async (c) => { const r = await api(`/palette?primary=${encodeURIComponent(c)}`); sug.colors = r.colors; paint(); }), h("h3", {}, "اللوحة المقترحة"), pal,
      sug.fonts?.found?.length ? h("p", { class: "small" }, "خطوط الموقع: " + sug.fonts.found.join("، ") + (sug.fonts.heading ? ` / سأستعمل ${sug.fonts.heading}` : " (لا مطابق متوفر، سأستعمل الافتراضي)")) : null,
      sug.logoUrl ? h("p", { class: "small" }, "وجدت شعاراً/أيقونة وسأحفظها مع الهوية.") : null);
  };
  file.onchange = guard(async () => { const f = file.files[0]; if (!f) return; logoFile = f; await analyze(async () => { const r = await fetch("/api/brand-extract/image", { method: "POST", body: f }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; })(); });
  modal("هوية من شعار أو موقع", h("div", {}, h("p", { class: "muted small" }, "ارفع شعارك أو أدخل رابط موقعك: نستخرج الألوان السائدة ونقترح هوية كاملة (ألوان، خطوط معروفة، شعار) تعدّلها بعدها كما تشاء."),
    h("h3", {}, "من موقع"), h("div", { class: "row" }, url, btn("تحليل", () => analyze(() => post("/brand-extract", { url: url.value.trim() }))())), h("h3", {}, "أو من صورة الشعار"), btn("رفع الشعار…", () => file.click()), file, out),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: () => {
      if (!sug) return toast("حلّل موقعاً أو شعاراً أولاً", true);
      const name = (sug.title ?? "").split(/[|\-–—:]/)[0].trim().slice(0, 40) || "";
      S.brandEdit = { id: "", isNew: true, name, language: /[؀-ۿ]/.test(name) ? "ar" : "en", colors: sug.colors, fonts: { heading: sug.fonts?.heading ?? "Cairo", body: sug.fonts?.body ?? "Tajawal" }, style: { pattern: "dots", iconSet: "lucide", radius: 24 }, voice: { tone: "" }, logo: {}, pendingLogo: logoFile ? { file: logoFile } : sug.logoUrl ? { url: sug.logoUrl } : null };
      closeModal(); switchTab("brand"); toast("عدّل الاسم والمعرّف ثم أنشئ الهوية");
    } }, "استخدم هذه النتيجة")], { wide: true });
}

/* ---------- مصادر الصور: مجانية + ذكاء اصطناعي ---------- */
function imageSources(p, addImage) {
  const keys = S.status?.keys ?? {}, openKeys = () => { S.settingsTab = "general"; openSettings(); };
  p.append(h("hr"), h("h3", {}, "صور مجانية (Pexels)"));
  if (!keys.pexels) p.append(h("p", { class: "muted small" }, "أضف مفتاح Pexels المجاني من الإعدادات / عام لتفعيل البحث."), btn("فتح الإعدادات", openKeys));
  else {
    const q = h("input", { placeholder: "mountain, coffee, office…" }), grid = h("div", { class: "assets" });
    const go = guard(async () => { const r = await api(`/stock?q=${encodeURIComponent(q.value)}`); grid.replaceChildren(...(r.length ? r.map((ph) => h("img", { src: ph.thumb, title: `${ph.alt || ""} — ${ph.by}`, onclick: guard(async () => { toast("جاري التنزيل…"); const x = await post("/stock/import", { url: ph.full, name: "stock" }); await loadAssetNames(); addImage(x.name); }) })) : [h("p", { class: "muted small", style: { gridColumn: "1/-1" } }, "لا نتائج")])); });
    q.addEventListener("keydown", (e) => e.key === "Enter" && go()); p.append(h("div", { class: "row" }, q, btn("بحث", go)), grid);
  }
  p.append(h("hr"), h("h3", {}, "توليد صورة بالذكاء الاصطناعي"));
  if (!keys.openai) p.append(h("p", { class: "muted small" }, "أضف مفتاح OpenAI من الإعدادات / عام. كل صورة تستهلك رصيد حسابك."), btn("فتح الإعدادات", openKeys));
  else {
    const pr = h("textarea", { rows: 3, placeholder: "A cozy coffee shop interior, warm light, minimal…" }), sz = h("select", { style: { width: "100%" } }, [["1024x1024", "مربع 1:1"], ["1024x1536", "عمودي 2:3"], ["1536x1024", "أفقي 3:2"]].map(([v, t]) => h("option", { value: v }, t)));
    p.append(pr, row("الحجم", sz), btn("✨ توليد", guard(async (e) => { if (!pr.value.trim()) return toast("اكتب وصف الصورة", true); if (!ask("سيستهلك رصيد حسابك في OpenAI. متابعة؟")) return; toast("جاري التوليد… قد يستغرق دقيقة"); const x = await post("/ai-image", { prompt: pr.value.trim(), size: sz.value }); await loadAssetNames(); addImage(x.name); toast("تم توليد الصورة ✓"); })));
  }
}

/* ---------- استيراد CSV / Google Sheet (يُستعمل داخل نافذة الدفعة) ---------- */
function csvImporter(onRows) {
  const info = h("p", { class: "small" }), file = h("input", { type: "file", accept: ".csv,text/csv,.tsv", hidden: true }), url = h("input", { placeholder: "https://docs.google.com/spreadsheets/d/…" });
  const apply = (r) => { onRows(r.rows); info.replaceChildren(`✓ ${r.rows.length} صفوف من الملف` + (r.warnings.length ? ` — ⚠ ${r.warnings.join(" · ")}` : "")); };
  file.onchange = guard(async () => { const f = file.files[0]; if (f) apply(await post("/csv-parse", { csv: await f.text() })); });
  return { info, el: h("div", {}, h("h3", { style: { marginTop: "10px" } }, "استيراد من CSV أو Google Sheet"), h("p", { class: "muted small" }, "الأعمدة: title, subtitle, cta, badge, icon, image, author, items, date, place, number, qr + publish_date (YYYY-MM-DD), status, caption, hashtags. الجدول يجب أن يكون «Anyone with the link»."),
    h("div", { class: "row" }, btn("رفع CSV…", () => file.click()), file), h("div", { class: "row" }, url, btn("جلب", guard(async () => apply(await post("/csv-parse", { sheetUrl: url.value.trim() }))))), info) };
}

/* ---------- معاينة مسودة (من إضافة) على المسرح الرئيسي ---------- */
function renderDraftBar() {
  const bar = $("#draftBar"), d = S.draft; bar.hidden = !d; if (!d) return bar.replaceChildren();
  bar.replaceChildren(h("span", { class: "draft-tag" }, ic("eye"), d.label || "معاينة مسودة"), h("span", { class: "muted small grow" }, d.note || "لم تُحفظ بعد — عدّل من لوحة الإضافة"),
    ...(d.actions ?? []).map((a) => btn([a.icon ? ic(a.icon) : null, a.label], guard(async () => a.onClick())))); 
}
function setDraft(plugin, design, opts) {
  const had = !!S.draft; S.draft = { plugin, design, ...opts }; S.sel = -1; S.multi = new Set();
  const sizeChanged = !had;
  syncTop(); renderOverlay(); renderLayers(); renderProps(); renderPreview(); if (sizeChanged || S.fitAuto) fit(); else applyZoom();
  if (S.draft.fitOnce) fit();
}
function clearDraft(plugin) {
  if (!S.draft || (plugin && S.draft.plugin !== plugin)) return; S.draft = null;
  syncTop(); renderOverlay(); renderLayers(); renderProps(); if (S.design) { renderPreview(); fit(); } else $("#frameBox").replaceChildren();
}

/* ---------- مضيف الإضافات ---------- */
const PLUG = { tabs: new Map(), actions: [] };
function makeUiApi(p) {
  const base = `/p/${p.id}`;
  return {
    id: p.id, lang: isEn ? "en" : "ar", h, ic, T, toast, modal, closeModal, row, btn, guard, ask, dims, api, post, flushSave, switchTab, i18n: extendDict, i18nRules: extendRules,
    get state() { return S; }, brands: () => S.brands, current: () => (S.design ? { id: S.id, design: S.design } : null),
    openDesign: guard(async (id) => { await loadDesigns(); await openDesign(id); }), reloadDesigns: loadDesigns,
    plugin: {
      get: (path) => api(`${base}${path}`), post: (path, body) => post(`${base}${path}`, body), del: (path) => api(`${base}${path}`, { method: "DELETE" }), url: (path) => `/api${base}${path}`,
      upload: async (path, body, type = "application/octet-stream") => { const r = await fetch(`/api${base}${path}`, { method: "POST", headers: { "content-type": type }, body }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; },
    },
    previewHtml: async (design) => { const r = await fetch("/api/html", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ design }) }); const t = await r.text(); if (!r.ok) throw new Error(JSON.parse(t).error); return t; },
    addTab: ({ id, label, icon, render, onShow, onHide }) => {
      const name = `p:${p.id}:${id}`, tabBtn = h("button", { "data-tab": name, title: label }, icon ? ic(icon) : null, h("span", {}, label)), sec = h("section", { id: "tab-" + name, class: "pane" });
      $("#leftTabs").append(tabBtn); $("#leftTabs").parentElement.append(sec); PLUG.tabs.set(name, { render, sec, onShow, onHide });
    },
    setDraft: (design, opts = {}) => setDraft(p.id, design, opts), clearDraft: () => clearDraft(p.id),
    addPageAction: (a) => PLUG.actions.push({ ...a, plugin: p.id }),
  };
}
async function loadPlugins() {
  for (const p of S.meta.plugins ?? []) {
    try {
      if (p.i18n?.en) extendDict(p.i18n.en);
      for (const css of p.styles ?? []) document.head.append(h("link", { rel: "stylesheet", href: css }));
      const mod = await import(p.entry); await mod.register?.(makeUiApi(p));
    } catch (e) { console.error(`[plugin:${p.id}]`, e); toast(`تعذّر تحميل واجهة الإضافة ${p.name}: ${e.message}`, true); }
  }
}
function pluginActionButtons() { return PLUG.actions.filter((a) => !a.when || a.when(S.design)).map((a) => btn([a.icon ? ic(a.icon) : null, a.label], () => a.onClick(S.design, S.id))); }

/* ---------- إدارة الإضافات (تبويب بالإعدادات) ---------- */
const reloadSoon = (msg = "تم. جاري تحديث الصفحة…") => { toast(msg); setTimeout(() => location.reload(), 900); };
function pluginSettingsModal(pl) {
  const fields = pl.settings.map((s) => {
    const label = (isEn ? s.label : s.label_ar) || s.label, help = (isEn ? s.help : s.help_ar) || s.help, v = pl.values[s.key];
    const inp = s.type === "boolean" ? h("input", { type: "checkbox", style: { width: "auto" }, checked: !!v }) : s.type === "textarea" ? h("textarea", { rows: 3 }, v ?? "") : s.type === "select" ? h("select", { style: { width: "100%" } }, (s.options ?? []).map((o) => h("option", { value: o.value, selected: o.value === v }, (isEn ? o.label : o.label_ar) || o.label))) : h("input", { type: s.type === "password" ? "password" : s.type === "number" ? "number" : "text", value: s.type === "password" ? "" : (v ?? ""), placeholder: s.type === "password" && v === "__set__" ? "•••••• (محفوظ — اكتب لاستبداله)" : "", autocomplete: "off" });
    return { s, inp, el: h("div", { class: "row col" }, h("label", { style: { width: "auto" } }, label), inp, help ? h("p", { class: "muted small", style: { margin: "2px 0 0" } }, help) : null) };
  });
  modal(`${(isEn ? pl.name : pl.name_ar) || pl.name} — الإعدادات`, h("div", {}, ...fields.map((f) => f.el)),
    [h("button", { class: "btn", onclick: closeModal }, "إلغاء"), h("button", { class: "btn primary", onclick: guard(async () => {
      const body = {}; for (const f of fields) { const { s, inp } = f; if (s.type === "boolean") body[s.key] = inp.checked; else if (s.type === "password") { if (inp.value) body[s.key] = inp.value; } else body[s.key] = inp.value; }
      await post(`/plugins/${pl.id}/settings`, body); closeModal(); toast("تم الحفظ"); }) }, "حفظ")], { wide: true });
}
function pluginsPane(refresh) {
  const list = S.plist ?? [];
  const card = (p) => {
    const name = (isEn ? p.name : p.name_ar) || p.name, desc = (isEn ? p.description : p.description_ar) || p.description;
    const sw = h("input", { type: "checkbox", checked: p.enabled, onchange: guard(async (e) => { await post(`/plugins/${p.id}/${e.target.checked ? "enable" : "disable"}`, {}); reloadSoon(); }) });
    const pack = (bundle) => guard(async () => { const r = await fetch(`/api/plugins/${p.id}/pack${bundle ? "?bundle=1" : ""}`); if (!r.ok) throw new Error((await r.json()).error); download(await r.blob(), `${p.id}-${p.version}${bundle ? "-with-data" : ""}.zip`); });
    const uninstall = guard(async () => { if (!ask(`إزالة الإضافة «${name}»؟`)) return; const wipe = ask("حذف بياناتها أيضاً (الشعارات والسجل…)؟ اختر «إلغاء» للإبقاء عليها."); await api(`/plugins/${p.id}${wipe ? "?data=1" : ""}`, { method: "DELETE" }); reloadSoon(); });
    return h("div", { class: "pcard" },
      h("div", { class: "phead" }, h("span", { class: "dot " + (p.status === "active" ? "ok" : p.status === "error" ? "bad" : "idle") }), h("b", {}, name), h("span", { class: "chip" }, "v" + p.version), h("span", { class: "grow" }), h("label", { class: "switch", title: p.enabled ? "تعطيل" : "تفعيل" }, sw, h("span"))),
      h("p", { class: "small", style: { margin: "6px 0" } }, desc), p.error ? h("p", { class: "warn" }, p.error) : null,
      h("p", { class: "muted small", style: { margin: "0 0 8px" } }, [p.author, `${p.tools.length} أدوات MCP`, `${p.routes} مسارات`, p.hasUi ? "واجهة" : null].filter(Boolean).join(" · ")),
      h("div", { class: "pactions" }, ...(p.settings.length ? [btn([ic("settings"), "الإعدادات"], () => pluginSettingsModal(p))] : []),
        btn([ic("refresh-cw"), "إعادة تحميل"], guard(async () => { await post(`/plugins/${p.id}/reload`, {}); reloadSoon(); })), btn([ic("download"), "تصدير zip"], pack(false)), ...(p.canBundle ? [btn([ic("package"), "تصدير مع البيانات"], pack(true))] : []), btn([ic("trash-2"), "إزالة"], uninstall, "danger")));
  };
  const zip = h("input", { type: "file", accept: ".zip", hidden: true, onchange: guard(async (e) => {
    const f = e.target.files[0]; if (!f) return; const r = await fetch("/api/plugins/install", { method: "POST", headers: { "content-type": "application/zip" }, body: f }); const j = await r.json(); if (!r.ok) throw new Error(j.error); e.target.value = ""; installedModal(j);
  }) });
  const dir = h("input", { placeholder: "/path/to/plugin-folder" });
  return [h("p", { class: "muted small" }, "الإضافات تضيف قوالب وأدوات MCP وتبويبات للواجهة. تعمل بصلاحيات كاملة على جهازك: ثبّت فقط ما تثق بمصدره."),
    ...(list.length ? list.map(card) : [h("p", { class: "muted small" }, "لا توجد إضافات مثبّتة.")]),
    h("h3", { style: { marginTop: "14px" } }, "تثبيت إضافة"), h("div", { class: "row" }, btn([ic("upload"), "من ملف zip…"], () => zip.click()), zip),
    h("div", { class: "row" }, dir, btn("تثبيت من مجلد", guard(async () => { if (!dir.value.trim()) return; const j = await post("/plugins/install", { path: dir.value.trim() }); installedModal(j); })))];
}
function installedModal(p) {
  modal("تم تثبيت الإضافة", h("div", {}, h("p", {}, `${(isEn ? p.name : p.name_ar) || p.name} v${p.version}`), h("p", { class: "muted small" }, "الإضافة معطّلة حتى تفعّلها. الإضافات تعمل بصلاحيات كاملة على جهازك؛ فعّلها فقط إن وثقت بمصدرها.")),
    [h("button", { class: "btn", onclick: () => { closeModal(); reloadSoon("تم التثبيت."); } }, "لاحقاً"), h("button", { class: "btn primary", onclick: guard(async () => { await post(`/plugins/${p.id}/enable`, {}); closeModal(); reloadSoon(); }) }, "تفعيل الآن")]);
}


document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") { if (typing && document.activeElement.tagName !== "BODY" && !document.activeElement.closest("#props")) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (typing || !S.design || S.draft) return;
  if (e.key === "Escape") return select(-1);
  if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); S.multi = new Set(S.design.elements.map((_, i) => i).filter((i) => !S.design.elements[i].locked)); S.sel = [...S.multi].pop() ?? -1; renderOverlay(); renderLayers(); renderProps(); return; }
  if (!S.multi.size) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
  else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dupeSel(); }
  else if (e.key.startsWith("Arrow")) {
    e.preventDefault(); const st = e.shiftKey ? 10 : 1, ids = [...S.multi].filter((k) => !S.design.elements[k].locked);
    const [dx, dy] = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    change((d) => ids.forEach((k) => { d.elements[k].x += dx; d.elements[k].y += dy; }), { key: "nudge" + ids.join(",") });
  }
});

/* ---------- بدء التشغيل ---------- */
(async () => {
  try {
    S.meta = await api("/meta");
    await Promise.all([loadBrands(), loadDesigns(), loadAssetNames()]);
    await loadPlugins();
    pollStatus(); setInterval(pollStatus, 15000);
    syncTop(); updateHist();
    const last = localStorage.getItem("lastDesign");
    if (last && S.designs.some((d) => d.id === last)) await openDesign(last);
    else if (S.designs[0]) await openDesign(S.designs[0].id);
  } catch (e) { toast("تعذّر الاتصال بالسيرفر: " + e.message, true); }
})();
