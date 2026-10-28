// match-tool — واجهة الإضافة: تبويب «مباريات» داخل محرر mycanva
export function register(ui) {
  const { h, ic, toast, btn, row, modal, closeModal, guard, ask, plugin: P } = ui;
  const FORMATS = [["story", "Story 1080×1920"], ["post", "Instagram 1080×1350"], ["square", "Square 1080×1080"], ["fb-post", "Facebook 1200×630"], ["x-post", "X 1600×900"], ["yt-thumb", "YouTube 1280×720"], ["slide", "Slide 1920×1080"]];
  const blank = () => ({ home: "", away: "", time: "", note: "", hs: "", as: "", state: "scheduled", minute: "", pens: "", stadium: "", channels: "", status: "", day: "", homeEvents: [], awayEvents: [] });
  const NOSCORE = ["scheduled", "postponed", "cancelled"];
  /** القوالب القديمة result/live صارت قالب «مباراة» بحالة مناسبة */
  const migrate = (d) => { if (d.template === "result" || d.template === "live") { const st = d.template === "result" ? "ft" : "live"; d.matches = (d.matches ?? []).map((m) => ({ ...m, state: m.state && m.state !== "scheduled" ? m.state : st })); d.template = "single"; } d.matches = (d.matches?.length ? d.matches : [blank()]).map((m) => ({ ...blank(), ...m, channels: Array.isArray(m.channels) ? m.channels.join("، ") : m.channels ?? "" })); return d; };
  const fresh = () => ({ template: "single", brand: "", lang: ui.lang, title: "", date: "", comp: "", swap: null, disclaimer: null, plate: true, glow: true, matches: [blank()] });
  const S = { data: fresh(), formats: new Set(["story", "post"]), langs: new Set([ui.lang]), schedule: { date: "", status: "draft" }, replace: null, previewFmt: "post", info: null, logos: [], thumbs: new Map(), loaded: false, root: null, filter: "", misses: new Map(), fetching: new Set(), seen: 0, leagues: [], packAsked: false };
  const L = (ar, en) => (ui.lang === "en" ? en : ar);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const timers = {}; const later = (k, fn, ms) => { clearTimeout(timers[k]); timers[k] = setTimeout(fn, ms); };

  ui.i18nRules([
    [/^مباراة (\d+)$/, (m) => `Match ${m[1]}`],
    [/^تعدّل التصميم (.+)\. «تحديث» يستبدله، و«إنشاء» يُنتج تصاميم جديدة\.$/, (m) => `You're editing the design ${m[1]}. “Update” replaces it; “Create” makes new designs.`],
    [/^تمت إضافة (\d+) شعار$/, (m) => `Added ${m[1]} logos`],
    [/^تم جلب (\d+) شعار(?: — لم أجد: (.+))?$/, (m) => `Fetched ${m[1]} logos${m[2] ? ` — not found: ${m[2].replaceAll("، ", ", ")}` : ""}`],
    [/^تمت إضافة (\d+) مباراة(?: — (.+))?$/, (m) => `Added ${m[1]} matches${m[2] ? ` — ${ui.T(m[2])}` : ""}`],
    [/^تمت إضافة (\d+) مباراة\. (.+)$/, (m) => `Added ${m[1]} matches. ${ui.T(m[2])}`],
    [/^مكتبة الشعارات \((\d+)\)$/, (m) => `Logo library (${m[1]})`],
    [/^سيتم جلب (\d+) شعار من TheSportsDB .*$/, (m) => `Fetching ${m[1]} logos from TheSportsDB (each logo is stored inside the plugin and never requested again). Club badges are trademarks of their clubs and are used as they are. Continue?`],
    [/^دوري غير مدعوم: (.+)$/, (m) => `Unsupported league: ${m[1]}`],
    [/^TheSportsDB حدّ الطلبات مؤقتاً: سيُكمل الجلب تلقائياً بعد (\d+) (ثانية|دقيقة)$/, (m) => `TheSportsDB is rate-limiting: fetching resumes automatically in ${m[1]} ${m[2] === "ثانية" ? "s" : "min"}`],
    [/^لم أجد شعاراً لـ "(.+)"$/, (m) => `No logo found for "${m[1]}"`],
    [/^السطر (\d+): لم أفهم الفريقين \("(.*)"\)$/, (m) => `Line ${m[1]}: couldn't understand the two teams ("${m[2]}")`],
    [/^لوني الفريق للتوهج خلف الشعار\.(?: المصدر: (.+))?$/, (m) => `The team's two colors for the glow behind the logo.${m[1] ? ` Source: ${m[1]}` : ""}`],
  ]);

  ui.addTab({ id: "matches", label: "مباريات", icon: "trophy", render, onShow: () => { active = true; preview(); }, onHide: () => { active = false; ui.clearDraft(); } });
  ui.addPageAction({ label: "تحرير بأداة المباريات", icon: "pencil", when: (d) => !!d?.meta?.matchTool, onClick: (d, id) => edit(d, id) });

  /* ---------- بيانات ---------- */
  async function boot() {
    if (S.loaded) return; S.loaded = true;
    const [info, logos, state, leagues] = await Promise.all([P.get("/info"), P.get("/logos"), P.get("/state"), P.get("/leagues")]);
    S.info = info; S.logos = logos; S.leagues = leagues;
    if (state?.data) { S.data = migrate({ ...fresh(), ...state.data }); S.formats = new Set(state.formats?.length ? state.formats : String(info.settings.defaultFormats || "story,post").split(",")); S.langs = new Set(state.langs?.length ? state.langs : [S.data.lang]); }
    else S.formats = new Set(String(info.settings.defaultFormats || "story,post").split(",").map((x) => x.trim()).filter(Boolean));
    const brands = Object.keys(ui.brands()); if (!S.data.brand || !brands.includes(S.data.brand)) S.data.brand = ui.current()?.design.brand ?? brands[0] ?? "";
  }
  const changed = () => { later("save", () => P.post("/state", { data: S.data, formats: [...S.formats], langs: [...S.langs] }).catch(() => {}), 700); later("prev", preview, 350); };
  const tplLabel = (t) => (ui.lang === "en" ? t.en : t.ar);

  function edit(design, id) {
    const d = clone(design.meta.matchTool.data); S.data = migrate({ ...fresh(), ...d }); S.replace = id; S.formats = new Set([design.format]); S.langs = new Set([d.lang]); S.previewFmt = design.format;
    ui.switchTab("p:match-tool:matches"); toast("تم تحميل بيانات التصميم في أداة المباريات");
  }

  /* ---------- معاينة حية على المسرح الرئيسي ---------- */
  let active = false, prevSeq = 0, prevMsg;
  async function preview() {
    if (!active) return; const seq = ++prevSeq;
    try {
      const { design } = await P.post("/build", { data: S.data, format: S.previewFmt }); if (seq !== prevSeq || !active) return;
      prevMsg?.replaceChildren();
      ui.setDraft(design, { label: L("معاينة المباراة", "Match preview"), note: L("مسودة غير محفوظة — تتحدّث مع كل تعديل", "Unsaved draft — updates as you edit"), actions: [{ label: L("إنشاء التصاميم", "Create designs"), icon: "layers", onClick: () => create(false) }] });
    } catch (e) { prevMsg?.replaceChildren(h("p", { class: "warn small" }, e.message)); }
  }

  /* ---------- شعارات ---------- */
  async function thumb(img, name) {
    name = (name ?? "").trim(); if (!name) { img.removeAttribute("src"); img.classList.add("none"); return; }
    let slug = S.thumbs.get(name);
    if (slug === undefined) { try { const r = await P.get(`/resolve?name=${encodeURIComponent(name)}`); slug = r.logo?.slug ?? null; S.misses.set(name, !!r.miss); } catch { slug = null; } S.thumbs.set(name, slug); }
    img.classList.toggle("miss", !slug && !!S.misses.get(name));
    if (slug) { img.src = P.url(`/logo-file/${slug}?v=${S.logos.length}`); img.classList.remove("none"); } else { img.removeAttribute("src"); img.classList.add("none"); }
  }
  /** عند مغادرة حقل فريق جديد: يُجلب شعاره مرة واحدة ويُخزَّن بالإضافة (إن كان الجلب التلقائي مفعّلاً) */
  async function autoFetch(name, img) {
    name = (name ?? "").trim(); if (!name || !S.info?.settings.autoFetch || S.thumbs.get(name) || S.misses.get(name) || S.fetching.has(name)) return;
    S.fetching.add(name); img.classList.add("loading");
    try {
      const r = (await P.post("/logos/ensure", { names: [name], budgetMs: 9000 })).results[name]; const st = r?.status;
      if (st === "fetched") { toast(L(`تم حفظ شعار ${name} داخل الإضافة`, `Saved the ${name} logo inside the plugin`)); S.logos = await P.get("/logos"); S.thumbs.delete(name); await thumb(img, name); renderLogos(); changed(); refreshStatus(); }
      else if (st === "queued") { toast(L(`وصلنا حد الطلبات: سيُجلب شعار ${name} تلقائياً بالخلفية`, `Request limit reached: the ${name} logo will be fetched automatically in the background`)); watchStatus(); }
      else if (st === "miss" && !r.known) { S.misses.set(name, true); S.thumbs.set(name, null); await thumb(img, name); toast(L(`لم أجد شعاراً لـ ${name}. ارفعه يدوياً ولن نسأل عنه ثانية.`, `No logo found for ${name}. Upload it manually; we won't ask again.`), true); refreshStatus(); }
    } catch { /* تجاهل: الشبكة غير متاحة */ } finally { S.fetching.delete(name); img.classList.remove("loading"); }
  }
  async function reloadLogos() { S.logos = await P.get("/logos"); S.thumbs.clear(); renderLogos(); renderMatches(); changed(); }
  async function uploadFiles(files) {
    for (const f of files) { const name = f.name.replace(/\.[^.]+$/, ""); await P.upload(`/logos?name=${encodeURIComponent(name)}`, f, f.type || "application/octet-stream"); }
    toast(`تمت إضافة ${files.length} شعار`); await reloadLogos();
  }
  const missingNames = () => [...new Set(S.data.matches.flatMap((m) => [m.home, m.away]).map((x) => (x ?? "").trim()).filter(Boolean))].filter((n) => S.thumbs.get(n) === null);
  async function fetchMissing(btnEl) {
    const names = missingNames(); if (!names.length) return toast("كل الفرق لها شعارات");
    if (!ask(`سيتم جلب ${names.length} شعار من TheSportsDB (يُخزَّن كل شعار داخل الإضافة ولا يُطلب ثانية). الشعارات علامات تجارية لأنديتها وتُستعمل كما هي. متابعة؟`)) return;
    btnEl.disabled = true; let ok = 0, queued = 0; const failed = [];
    for (const [i, n] of names.entries()) {
      btnEl.textContent = `${i + 1}/${names.length} ${n}`;
      try { const r = (await P.post("/logos/ensure", { names: [n], budgetMs: 20000, force: true })).results[n]; if (r.status === "fetched" || r.status === "have") ok++; else if (r.status === "queued") { queued++; } else failed.push(n); } catch { failed.push(n); }
    }
    btnEl.disabled = false; btnEl.replaceChildren(ic("download"), "جلب الشعارات الناقصة");
    toast(L(`تم جلب ${ok} شعار`, `Fetched ${ok} logos`) + (queued ? L(` — ${queued} بالطابور (حد الطلبات): ستُجلب تلقائياً`, ` — ${queued} queued (rate limit): they'll be fetched automatically`) : "") + (failed.length ? L(` — لم أجد: ${failed.join("، ")}`, ` — not found: ${failed.join(", ")}`) : "")); if (queued) watchStatus(); await reloadLogos(); refreshStatus();
  }
  /* ---------- حالة المكتبة والطابور ---------- */
  let statusBox, packsBox, missBox, watchTimer;
  const fmtWait = (ms) => (ms < 90000 ? L(`${Math.ceil(ms / 1000)} ثانية`, `${Math.ceil(ms / 1000)} s`) : L(`${Math.ceil(ms / 60000)} دقيقة`, `${Math.ceil(ms / 60000)} min`));
  async function refreshStatus() {
    if (!statusBox?.isConnected) return null; let st; try { st = await P.get("/logos/status"); } catch { return null; }
    const q = st.quota, parts = [L(`${st.logos} شعار محفوظ بالإضافة`, `${st.logos} logos stored in the plugin`), L(`${q.cachedQueries} بحث محفوظ`, `${q.cachedQueries} searches cached`)];
    if (st.queue.length) parts.push(L(`${st.queue.length} بالطابور: ${st.queue.slice(0, 3).join("، ")}${st.queue.length > 3 ? "…" : ""}`, `${st.queue.length} queued: ${st.queue.slice(0, 3).join(", ")}${st.queue.length > 3 ? "…" : ""}`));
    statusBox.replaceChildren(...[h("div", {}, parts.join(" · ")), q.blockedFor > 0 ? h("div", { class: "warn" }, L(`TheSportsDB يحدّ الطلبات مؤقتاً: سيُكمل الجلب بعد ${fmtWait(q.blockedFor)}`, `TheSportsDB is rate-limiting: fetching resumes in ${fmtWait(q.blockedFor)}`)) : null].filter(Boolean));
    missBox.replaceChildren(...(st.misses.length ? [h("div", { class: "muted small" }, L("فرق لم نجد لها شعاراً (لن نسأل عنها ثانية)", "Teams with no logo found (we won't ask again)")), h("div", { class: "mt-chips" }, ...st.misses.map((m) => h("button", { class: "mt-chip", title: L("اضغط لإعادة المحاولة", "Click to retry"), onclick: guard(async () => { await P.post("/logos/misses/clear", { name: m.name }); S.misses.delete(m.name); S.thumbs.delete(m.name); toast(L(`سيُعاد البحث عن ${m.name} عند الحاجة`, `${m.name} will be searched again when needed`)); refreshStatus(); renderMatches(); }) }, m.name + "  ×")))] : []));
    const ev = st.events.filter((e) => e.ts > S.seen); if (ev.length) { if (S.seen) { S.logos = await P.get("/logos"); S.thumbs.clear(); renderLogos(); renderMatches(); toast(L(`وصلت ${ev.length} شعارات جديدة`, `${ev.length} new logos arrived`)); const cur = ui.current()?.id, ref = ev.flatMap((e) => e.refreshed ?? []); if (cur && ref.includes(cur)) ui.openDesign(cur); else if (ref.length) toast(L(`تم تحديث ${ref.length} تصميم بالشعارات الجديدة`, `${ref.length} designs updated with the new logos`)); changed(); } S.seen = Math.max(...ev.map((e) => e.ts)); } else if (!S.seen) S.seen = Date.now();
    return st;
  }
  /** يراقب الطابور حتى يفرغ (كل 6 ثوانٍ) */
  function watchStatus() { clearInterval(watchTimer); watchTimer = setInterval(async () => { const st = await refreshStatus(); if (!st || (!st.queue.length && !st.quota.blockedFor)) clearInterval(watchTimer); }, 6000); }
  async function leaguePack(lg, chipEl) {
    if (!S.packAsked && !ask("سيتم تحميل شعارات الدوري بطلب واحد (10 فرق بالمفتاح المجاني) وتخزينها داخل الإضافة. الشعارات علامات تجارية لأنديتها وتُستعمل كما هي. متابعة؟")) return; S.packAsked = true;
    chipEl.disabled = true; try { const r = await P.post("/logos/league-pack", { league: lg.en }); if (r.rateLimited) return toast(r.message, true); toast(L(`${lg.ar}: أُضيف ${r.added.length} شعار (${r.had.length} موجود مسبقاً)`, `${lg.en}: added ${r.added.length} logos (${r.had.length} already stored)`)); await reloadLogos(); refreshStatus(); } finally { chipEl.disabled = false; }
  }

  function logoModal(l) {
    const names = h("input", { value: l.names.join("، ") }), cols = h("input", { value: l.colors.join(", "), placeholder: "#004d98, #a50044" });
    modal(l.name, h("div", {}, h("div", { class: "mt-logobig" }, h("img", { src: P.url(`/logo-file/${l.slug}?v=${l.added}`) })), row("الأسماء", names), h("p", { class: "muted small" }, "أسماء بديلة تُطابَق مع هذا الشعار (افصل بفاصلة)."), row("الألوان", cols), h("p", { class: "muted small" }, "لوني الفريق للتوهج خلف الشعار." + (l.source ? ` المصدر: ${l.source}` : ""))),
      [h("button", { class: "btn danger", onclick: guard(async () => { if (!ask("حذف هذا الشعار؟")) return; await P.del(`/logos/${l.slug}`); closeModal(); await reloadLogos(); }) }, "حذف"), h("button", { class: "btn", onclick: closeModal }, "إلغاء"),
        h("button", { class: "btn primary", onclick: guard(async () => { await P.post(`/logos/${l.slug}`, { names: names.value.split(/[,،]/).map((x) => x.trim()).filter(Boolean), colors: cols.value.split(/[,،\s]+/).filter(Boolean) }); closeModal(); await reloadLogos(); }) }, "حفظ")]);
  }

  /* ---------- مباريات ---------- */
  let matchesBox, logosBox, dl;
  const field = (label, input) => h("div", { class: "mt-f" }, h("label", {}, label), input);
  const bindInput = (obj, key, ph, o = {}) => { const i = h("input", { value: obj[key] ?? "", placeholder: ph ?? "", ...(o.list ? { list: o.list } : {}), oninput: (e) => { obj[key] = e.target.value; o.onInput?.(e.target.value); changed(); } }); return i; };
  async function suggest(q) { if (!q.trim()) return; later("sug", async () => { try { const r = await P.get(`/teams?q=${encodeURIComponent(q)}`); dl.replaceChildren(...r.flatMap((t) => [h("option", { value: t.name }), t.ar ? h("option", { value: t.ar }) : null].filter(Boolean))); } catch { /* تجاهل */ } }, 200); }
  function teamInput(m, key, ph) {
    const img = h("img", { class: "mt-logo none" }); thumb(img, m[key]);
    const inp = h("input", { value: m[key] ?? "", placeholder: ph, list: "mt-teams", oninput: (e) => { m[key] = e.target.value; suggest(e.target.value); later("th" + key + m.__i, () => thumb(img, m[key]), 350); changed(); }, onchange: () => { thumb(img, m[key]).then(() => autoFetch(m[key], img)); } });
    return h("div", { class: "mt-team" }, img, inp);
  }
  const STATE_OPTS = () => (S.info.states ?? []).map((x) => [x.id, ui.lang === "en" ? x.en : x.ar]);
  function matchCard(m, i) {
    m.__i = i; const moveTo = (j) => { const a = S.data.matches; [a[i], a[j]] = [a[j], a[i]]; renderMatches(); changed(); };
    const st = m.state || "scheduled", scored = !NOSCORE.includes(st);
    const stateSel = h("select", { onchange: (e) => { m.state = e.target.value; renderMatches(); changed(); } }, STATE_OPTS().map(([v, t]) => h("option", { value: v, selected: v === st }, t)));
    const evs = (key, ph) => h("textarea", { rows: 3, placeholder: ph, oninput: (e) => { m[key] = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean); changed(); } }, (m[key] ?? []).join("\n"));
    const events = scored ? h("details", { class: "mt-ev" }, h("summary", {}, "الأهداف والأحداث"), h("div", { class: "grid2" }, evs("homeEvents", "Saka 23'\nHavertz 67'"), evs("awayEvents", "Palmer 80'")), h("p", { class: "muted small" }, "الأول للفريق المضيف، والثاني للضيف. سطر لكل حدث.")) : null;
    return h("div", { class: "mt-card" },
      h("div", { class: "mt-chead" }, h("b", {}, `مباراة ${i + 1}`), h("span", { class: "grow" }), h("button", { class: "btn small icon", title: "للأعلى", disabled: i === 0, onclick: () => moveTo(i - 1) }, ic("arrow-up")), h("button", { class: "btn small icon", title: "للأسفل", disabled: i === S.data.matches.length - 1, onclick: () => moveTo(i + 1) }, ic("arrow-down")),
        h("button", { class: "btn small icon", title: "نسخ", onclick: () => { S.data.matches.splice(i + 1, 0, clone(m)); renderMatches(); changed(); } }, ic("copy")), h("button", { class: "btn small icon danger", title: "حذف", onclick: () => { S.data.matches.splice(i, 1); if (!S.data.matches.length) S.data.matches.push(blank()); renderMatches(); changed(); } }, ic("trash-2"))),
      teamInput(m, "home", "الفريق المضيف"), teamInput(m, "away", "الفريق الضيف"),
      h("div", { class: "grid2" }, field("حالة المباراة", stateSel), st === "live" ? field("الدقيقة الحالية", bindInput(m, "minute", "67'")) : field("الوقت", bindInput(m, "time", "21:00"))),
      scored ? h("div", { class: "grid2" }, bindInput(m, "hs", "أهداف المضيف"), bindInput(m, "as", "أهداف الضيف")) : null,
      st === "live" ? field("وقت البداية (اختياري)", bindInput(m, "time", "21:00")) : null,
      st === "pen" ? field("نتيجة الركلات", bindInput(m, "pens", "4-3")) : null,
      field("الملعب (اختياري)", bindInput(m, "stadium", "Santiago Bernabéu")), field("القنوات الناقلة (افصل بفاصلة)", bindInput(m, "channels", "beIN Sports 1، SSC")), field("ملاحظة", bindInput(m, "note", "ذهاب ربع النهائي")),
      S.data.template === "weekly" ? field("اليوم (للتجميع)", bindInput(m, "day", "السبت")) : null, events);
  }
  function renderMatches() { if (!matchesBox) return; const multi = ["list", "weekly"].includes(S.data.template); if (!multi && S.data.matches.length > 1) { /* قوالب المباراة الواحدة تستعمل الأولى فقط */ } matchesBox.replaceChildren(...S.data.matches.map(matchCard), ...(S.data.matches.length > 1 && !multi ? [h("p", { class: "muted small" }, "هذا القالب يعرض المباراة الأولى فقط.")] : [])); }
  function renderLogos() {
    if (!logosBox) return; const q = S.filter.trim().toLowerCase(), list = S.logos.filter((l) => !q || l.names.some((n) => n.toLowerCase().includes(q)));
    logosBox.replaceChildren(...(list.length ? list.map((l) => h("button", { class: "mt-lg", title: l.names.join(" / "), onclick: () => logoModal(l) }, h("img", { src: P.url(`/logo-file/${l.slug}?v=${l.added}`) }), h("span", {}, l.name))) : [h("p", { class: "muted small" }, "لا شعارات بعد. ارفع ملفات (اسم الملف = اسم الفريق) أو اجلبها.")]));
  }

  /* ---------- استيراد ---------- */
  function addMatches(ms) { const blankOnly = S.data.matches.length === 1 && !S.data.matches[0].home && !S.data.matches[0].away; S.data.matches = [...(blankOnly ? [] : S.data.matches), ...ms.map((m) => ({ ...blank(), ...m }))]; renderMatches(); changed(); }
  function importSection() {
    const ta = h("textarea", { rows: 4, placeholder: "Real Madrid vs Barcelona 21:00 | Bernabeu\nالهلال × النصر 20:30\nArsenal 2-1 Chelsea" });
    const comp = h("select", { style: { width: "100%" } }, [h("option", { value: "" }, "— اختر دوري —"), ...(S.info.competitions.filter((c) => c.id).map((c) => h("option", { value: c.id }, ui.lang === "en" ? c.en : c.ar)))]);
    const mode = h("select", { style: { width: "100%" } }, [["next", "القادمة"], ["past", "الأخيرة"], ["day", "ليوم محدد"]].map(([v, t]) => h("option", { value: v }, t))), day = h("input", { type: "date", value: new Date().toISOString().slice(0, 10) });
    return h("details", { class: "mt-sec" }, h("summary", {}, "استيراد مباريات"),
      h("p", { class: "muted small" }, "الصق نصاً (سطر لكل مباراة) وسأفهم الفريقين والوقت والملاحظة والنتيجة."), ta,
      btn([ic("wand-sparkles"), "فهم النص وإضافته"], guard(async () => { const r = await P.post("/fixtures/parse", { text: ta.value }); if (r.matches.length) { addMatches(r.matches); ta.value = ""; } toast(`تمت إضافة ${r.matches.length} مباراة` + (r.warnings.length ? ` — ${r.warnings[0]}` : ""), !r.matches.length); })),
      h("h3", { style: { marginTop: "10px" } }, "من TheSportsDB"), row("الدوري", comp), row("النوع", mode), row("التاريخ", day),
      btn([ic("download"), "جلب المباريات"], guard(async () => { if (!comp.value && mode.value !== "day") return toast("اختر دورياً", true); const r = await P.get(`/fixtures/league?id=${comp.value || 0}&mode=${mode.value}&date=${day.value}`); if (!r.matches.length) return toast("لا مباريات متاحة (المفتاح المجاني محدود)", true); if (r.matches[0].date && !S.data.date) { S.data.date = new Intl.DateTimeFormat(ui.lang === "ar" ? "ar" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date(r.matches[0].date + "T12:00:00")); } addMatches(r.matches.slice(0, 12)); toast(`تمت إضافة ${Math.min(12, r.matches.length)} مباراة. ${r.note}`); })));
  }

  /* ---------- الواجهة ---------- */
  async function render(root) {
    await boot(); S.root = root; const D = S.data, brands = Object.keys(ui.brands());
    dl = h("datalist", { id: "mt-teams" });
    const sel = (cur, opts, on) => h("select", { style: { width: "100%" }, onchange: (e) => on(e.target.value) }, opts.map(([v, t]) => h("option", { value: v, selected: String(v) === String(cur) }, t)));
    const chk = (label, val, on) => h("label", { class: "chk" }, h("input", { type: "checkbox", checked: val, onchange: (e) => on(e.target.checked) }), h("span", {}, label));
    const chip = (set, k, label, after) => h("label", { class: "mt-chip" + (set.has(k) ? " on" : "") }, h("input", { type: "checkbox", checked: set.has(k), onchange: (e) => { e.target.checked ? set.add(k) : set.delete(k); e.target.parentElement.classList.toggle("on", e.target.checked); after?.(); changed(); } }), label);
    matchesBox = h("div"); logosBox = h("div", { class: "mt-logos" }); prevMsg = h("div");
    const tplSel = sel(D.template, S.info.templates.filter((t) => !t.legacy).map((t) => [t.id, tplLabel(t)]), (v) => { D.template = v; renderMatches(); changed(); });
    const custom = h("input", { placeholder: "1200x628", style: { maxWidth: "110px" }, onchange: (e) => { const m = e.target.value.trim().match(/^(\d{2,5})x(\d{2,5})$/i); if (m) { S.formats.add(m[0]); e.target.value = ""; render(root); } } });
    const status = h("select", { style: { width: "auto" }, onchange: (e) => (S.schedule.status = e.target.value) }, [["draft", "مسودة"], ["approved", "موافق عليه"], ["scheduled", "مجدول"]].map(([v, t]) => h("option", { value: v, selected: S.schedule.status === v }, t)));
    const fileIn = h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: guard(async (e) => { await uploadFiles([...e.target.files]); e.target.value = ""; }) });
    let fetchBtn;
    root.replaceChildren(...[h("h3", { style: { marginTop: 0 } }, "منشورات المباريات"), dl,
      S.replace ? h("div", { class: "note" }, `تعدّل التصميم ${S.replace}. «تحديث» يستبدله، و«إنشاء» يُنتج تصاميم جديدة.`, btn("إلغاء التعديل", () => { S.replace = null; render(root); }, "small")) : null,
      h("div", { class: "grid2" }, field("القالب", tplSel), field("الهوية", sel(D.brand, brands.map((id) => [id, ui.brands()[id].brand?.name ?? id]), (v) => { D.brand = v; changed(); }))),
      h("div", { class: "grid2" }, field("اللغة", sel(D.lang, [["ar", "العربية"], ["en", "English"]], (v) => { D.lang = v; S.langs = new Set([v]); render(root); changed(); })), field("الدوري / المسابقة", bindInput(D, "comp", "Champions League", { list: "mt-comps" }))),
      h("datalist", { id: "mt-comps" }, S.info.competitions.map((c) => h("option", { value: ui.lang === "en" ? c.en : c.ar }))),
      field("العنوان (فارغ = الافتراضي)", bindInput(D, "title", "مباراة اليوم / Match of the day")), field("التاريخ", bindInput(D, "date", "السبت 25 تشرين الأول")),
      chk("الفريق المضيف على اليمين (افتراضي للعربية)", D.swap ?? D.lang === "ar", (v) => { D.swap = v; changed(); }), chk("سطر التنبيه والتذييل حسب الهوية", D.disclaimer ?? true, (v) => { D.disclaimer = v ? null : false; changed(); }),
      chk("قاعدة دائرية خلف الشعار", D.plate !== false, (v) => { D.plate = v; changed(); }), chk("توهج بلون الفريق", D.glow !== false, (v) => { D.glow = v; changed(); }),
      h("h3", {}, "المباريات"), matchesBox, h("div", { class: "grid2" }, btn([ic("plus"), "إضافة مباراة"], () => { S.data.matches.push(blank()); renderMatches(); changed(); }), (fetchBtn = btn([ic("download"), "جلب الشعارات الناقصة"], () => fetchMissing(fetchBtn)))),
      importSection(),
      h("details", { class: "mt-sec" }, h("summary", {}, `مكتبة الشعارات (${S.logos.length})`), h("div", { class: "row" }, h("input", { placeholder: "بحث…", oninput: (e) => { S.filter = e.target.value; renderLogos(); } }), btn([ic("upload"), "رفع"], () => fileIn.click()), fileIn),
        h("p", { class: "muted small" }, "اسم الملف = اسم الفريق (عربي أو إنكليزي). تُطابَق الأسماء تلقائياً: «ريال مدريد» = Real Madrid."), h("p", { class: "muted small" }, "الشعارات تُحفظ داخل الإضافة ولا تُطلب مرة ثانية."), (statusBox = h("div", { class: "small mt-status" })),
        h("h3", {}, "حزم الدوريات (طلب واحد لكل دوري)"), (packsBox = h("div", { class: "mt-chips" })), (missBox = h("div")), logosBox),
      h("h3", {}, "المقاسات واللغات"), h("div", { class: "mt-chips" }, ...[...FORMATS, ...[...S.formats].filter((f) => !FORMATS.some(([k]) => k === f)).map((f) => [f, f])].map(([k, l]) => chip(S.formats, k, l, () => { if (!S.formats.has(S.previewFmt)) S.previewFmt = [...S.formats][0] ?? "post"; }))), h("div", { class: "row" }, custom),
      h("div", { class: "mt-chips" }, chip(S.langs, "ar", "العربية"), chip(S.langs, "en", "English")),
      h("div", { class: "row" }, h("label", {}, "الجدولة"), h("input", { type: "date", value: S.schedule.date, onchange: (e) => (S.schedule.date = e.target.value) }), status),
      h("h3", {}, "معاينة"), h("div", { class: "row" }, h("label", {}, "مقاس المعاينة"), sel(S.previewFmt, [...new Set([...S.formats, "post"])].map((f) => [f, (FORMATS.find(([k]) => k === f) ?? [f, f])[1]]), (v) => { S.previewFmt = v; preview(); })), prevMsg, h("p", { class: "muted small" }, "تظهر المعاينة في المسرح الرئيسي ويمكنك تكبيرها وتصديرها من هناك."),
      h("div", { class: "mt-actions" }, h("button", { class: "btn primary", onclick: guard(() => create(false)) }, ic("layers"), "إنشاء التصاميم"), ...(S.replace ? [h("button", { class: "btn", onclick: guard(() => create(true)) }, ic("refresh-cw"), "تحديث التصميم")] : [])),
      historySection()].filter(Boolean));
    packsBox.replaceChildren(...S.leagues.map((lg) => { const b = h("button", { class: "mt-chip", onclick: guard(() => leaguePack(lg, b)) }, ic("download"), ui.lang === "en" ? lg.en : lg.ar); return b; }));
    renderMatches(); renderLogos(); preview(); refreshStatus().then((st) => st && (st.queue.length || st.quota.blockedFor) && watchStatus());
    P.get("/history").then((hs) => { const box = root.querySelector(".mt-hist"); if (!box) return; box.replaceChildren(...(hs.length ? hs.slice(0, 8).map((x) => h("button", { class: "mt-h", onclick: guard(async () => { const e = await P.get(`/history/${x.ts}`); S.data = migrate({ ...fresh(), ...e.data }); S.langs = new Set([S.data.lang]); S.replace = null; render(root); changed(); }) }, `${x.title} · ${x.ids.length}`)) : [h("p", { class: "muted small" }, "لا سجل بعد.")])); }).catch(() => {});
  }
  const historySection = () => h("details", { class: "mt-sec" }, h("summary", {}, "آخر ما أنشأته"), h("div", { class: "mt-hist" }));
  async function create(update) {
    if (!S.data.matches.some((m) => m.home || m.away)) throw new Error("أضف مباراة واحدة على الأقل");
    if (!S.formats.size) throw new Error("اختر مقاساً واحداً على الأقل");
    const r = await P.post("/create", { data: S.data, formats: [...S.formats], langs: [...S.langs], ...(update ? { replace: S.replace } : {}), ...(S.schedule.date ? { schedule: { date: S.schedule.date, status: S.schedule.status } } : {}) });
    toast(`تم إنشاء ${r.ids.length} تصميم`); ui.clearDraft(); S.replace = update ? S.replace : null; await ui.openDesign(r.ids[0]);
  }
}
