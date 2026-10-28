// match-tool — إضافة mycanva لمنشورات المباريات (انظر README.md)
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

export async function activate(api) {
  const { z, core } = api;
  const [{ buildMatchDesign, normalizeData, TEMPLATES, STATES }, teams, { createLogos }, { createTsdb }, { createFetcher }, fx] = await Promise.all([
    api.import("./lib/builder.js"), api.import("./lib/teams.js"), api.import("./lib/logos.js"), api.import("./lib/tsdb.js"), api.import("./lib/fetcher.js"), api.import("./lib/fixtures.js"),
  ]);
  const logos = await createLogos(api), tsdb = await createTsdb(api);
  const stateFile = path.join(api.dataDir, "state.json"), historyFile = path.join(api.dataDir, "history.json");
  const readJson = async (f, d) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return d; } };
  const FORMAT_ALIAS = { feed: "post", wide: "fb-post" }; // أسماء الأداة الأصلية
  const settings = () => api.settings.get();

  /* ---------- المقاسات ---------- */
  function sizeOf(fmt) {
    const key = FORMAT_ALIAS[fmt] ?? fmt, m = String(key).match(/^(\d{2,5})x(\d{2,5})$/i);
    if (m) return { key: "custom", w: +m[1], h: +m[2] };
    const f = core.FORMATS[key]; if (!f) throw new Error(`مقاس غير معروف: ${fmt}`);
    return { key, w: f.w, h: f.h };
  }
  const logoOf = (name) => { const it = logos.find(name); return it ? { ref: logos.ref(it), colors: it.colors } : null; };
  async function brandOf(data) { const id = data.brand || (await core.listBrands())[0]; if (!id) throw new Error("أنشئ هوية أولاً"); return { id, brand: await core.loadBrand(id) }; }

  async function build(data, fmt) {
    const { id, brand } = await brandOf(data), sz = sizeOf(fmt), s = settings();
    return buildMatchDesign({ data: normalizeData({ ...data, brand: id }, s), brand, brandId: id, format: sz.key, size: sz, logoOf, settings: s });
  }
  /** تصميم مُحقَّق مع بصمة العناصر: تدلّ لاحقاً هل عدّلت التصميم يدوياً (فلا نكتب فوق عملك عند التحديث التلقائي) */
  async function buildStamped(data, fmt) {
    const parsed = core.DesignSchema.parse(await build(data, fmt)); parsed.meta.matchTool.hash = sha(JSON.stringify(parsed.elements)); return parsed;
  }

  /* ---------- جلب الشعارات (مرة واحدة، يُخزَّن، ويكمل بالخلفية) ---------- */
  /** عند وصول شعار متأخر: نحدّث التصاميم التي أُنشئت ناقصة ولم تُعدَّل يدوياً */
  async function refreshForLogo(entry) {
    const ids = [...new Set((await readJson(historyFile, [])).flatMap((h) => h.ids))], done = [], mine = new Set(entry.names.map(teams.norm));
    for (const id of ids) {
      const d = await core.loadDesign(id).catch(() => null), mt = d?.meta?.matchTool;
      if (!mt?.missing?.length || !mt.hash || !mt.missing.some((n) => mine.has(teams.norm(n)))) continue;
      if (sha(JSON.stringify(d.elements)) !== mt.hash) continue; // عُدّل يدوياً
      const fresh = await buildStamped(mt.data, d.format === "custom" ? `${d.width}x${d.height}` : d.format);
      await core.saveDesign(id, { ...fresh, group: d.group, order: d.order, kind: d.kind, date: d.date, time: d.time, status: d.status, caption: d.caption ?? fresh.caption, hashtags: d.hashtags ?? fresh.hashtags }); done.push(id);
    }
    return done;
  }
  const fetcher = await createFetcher(api, { logos, tsdb, teams, onFetched: refreshForLogo });
  const summarize = (results) => { const by = (st) => Object.entries(results).filter(([, r]) => r.status === st).map(([n]) => n); return { fetched: by("fetched"), queued: by("queued"), missing: by("miss"), errors: by("error") }; };

  /* ---------- شعارات مضمّنة بالحزمة (تُبذَر عند التفعيل، وتُضمَّن عند «تصدير مع البيانات») ---------- */
  const bundledDir = path.join(api.dir, "assets", "bundled");
  const seed = async () => {
    const idx = await readJson(path.join(bundledDir, "index.json"), null); if (!idx?.logos) return;
    let n = 0; for (const e of idx.logos) { try { if (await logos.importEntry(e, await fs.readFile(path.join(bundledDir, e.file)))) n++; } catch { /* ملف ناقص */ } }
    if (n) api.log(`تم بذر ${n} شعار من الحزمة`);
  };
  await seed();
  api.onPack(async () => [{ path: "assets/bundled/index.json", data: Buffer.from(JSON.stringify({ logos: logos.list() }, null, 2)) }, ...(await Promise.all(logos.list().map(async (l) => ({ path: `assets/bundled/${l.file}`, data: await fs.readFile(path.join(logos.dir, l.file)) }))))]);

  /* ---------- الإنشاء (عدة مقاسات × لغات) ---------- */
  async function create({ data, formats, langs, replace, group, schedule, budgetMs = 20000 }) {
    const s = settings(), fmts = (formats?.length ? formats : String(s.defaultFormats || "story,post").split(",").map((x) => x.trim()).filter(Boolean)), lgs = langs?.length ? langs : [data.lang === "en" ? "en" : "ar"];
    const ensured = await fetcher.ensureMany(data.matches.flatMap((m) => [m.home, m.away]), { budgetMs }), logosReport = summarize(ensured);
    const ymd = new Date().toISOString().slice(0, 10), base = (data.title || data.comp || data.template).toString();
    const grp = core.safeId(group || `match-${(data.date || ymd).toString().replace(/[^\p{L}\p{N}]+/gu, "") || ymd}-${data.template}`);
    const many = fmts.length * lgs.length > 1, ids = []; let order = 0;
    for (const lang of lgs) for (const fmt of fmts) {
      const design = await buildStamped({ ...data, lang }, fmt), sz = sizeOf(fmt), id = replace ?? core.safeId(`${grp}-${lang}-${sz.key === "custom" ? `${sz.w}x${sz.h}` : sz.key}`);
      let extra = {};
      if (replace) { const ex = await core.loadDesign(replace).catch(() => null); if (ex) extra = { group: ex.group, order: ex.order, kind: ex.kind, date: ex.date, time: ex.time, status: ex.status }; }
      else if (many) extra = { group: grp, order: order++, kind: "batch" };
      if (schedule?.date) extra = { ...extra, date: schedule.date, time: schedule.time, status: schedule.status ?? "scheduled" };
      await core.saveDesign(id, { ...design, ...extra }); ids.push(id);
    }
    const hist = await readJson(historyFile, []); hist.unshift({ ts: Date.now(), title: base, template: data.template, ids, data }); await fs.writeFile(historyFile, JSON.stringify(hist.slice(0, 40), null, 2));
    return { group: many ? grp : null, ids, logos: logosReport };
  }

  /* ---------- المسارات ---------- */
  const R = api.registerRoute;
  R("GET", "/info", async () => ({ templates: Object.entries(TEMPLATES).map(([id, v]) => ({ id, ar: v.ar, en: v.en, legacy: !!v.legacy })), states: Object.entries(STATES).map(([id, v]) => ({ id, ar: v.ar, en: v.en })), competitions: teams.COMPETITIONS.map((c) => ({ en: c.en, ar: c.ar, id: c.tsdbId })), settings: settings(), formats: core.FORMATS }));
  R("GET", "/state", async () => readJson(stateFile, {}));
  R("POST", "/state", async (c) => { await fs.writeFile(stateFile, JSON.stringify(await c.json())); return { ok: true }; });
  R("GET", "/history", async () => (await readJson(historyFile, [])).map(({ ts, title, template, ids }) => ({ ts, title, template, ids })));
  R("GET", "/history/:ts", async (c) => { const h = (await readJson(historyFile, [])).find((x) => String(x.ts) === c.params.ts); if (!h) throw new Error("غير موجود"); return h; });

  R("GET", "/logos", async () => logos.list());
  R("GET", "/logos/status", async () => ({ logos: logos.list().length, ...fetcher.status() }));
  R("POST", "/logos/ensure", async (c) => { const { names, budgetMs, force } = await c.json(); const res = force ? Object.fromEntries(await Promise.all((names ?? []).map(async (n) => [n, await fetcher.ensure(n, { force: true })]))) : await fetcher.ensureMany(names ?? [], { budgetMs: Math.min(Number(budgetMs) || 8000, 60000) }); return { results: res, ...summarize(res) }; });
  R("GET", "/leagues", async () => Object.entries(fetcher.LEAGUES).map(([en, ar]) => ({ en, ar })));
  R("POST", "/logos/league-pack", async (c) => { try { return await fetcher.leaguePack((await c.json()).league); } catch (e) { if (e.status === 429) return { rateLimited: true, message: e.message, retryIn: e.retryIn }; throw e; } });
  R("POST", "/logos/misses/clear", async (c) => { await fetcher.clearMisses((await c.json()).name); return { ok: true }; });
  R("POST", "/logos/fetch-one", async (c) => { const { name, query, hint } = await c.json(); if (!name) throw new Error("name مطلوب"); const r = await fetcher.ensure(name, { force: true, query, hint }); return { ok: r.status === "fetched" || r.status === "have", ...r, message: r.status === "miss" ? `لم أجد شعاراً لـ "${name}"` : r.status === "queued" ? `وصلنا حد الطلبات؛ سيُجلب "${name}" تلقائياً بعد قليل` : r.message }; });
  R("GET", "/logo-file/:slug", async (c) => { const f = logos.file(c.params.slug); try { return api.raw(await fs.readFile(f), "image/png", 200, { "cache-control": "max-age=3600" }); } catch { throw Object.assign(new Error("غير موجود"), { status: 404 }); } });
  R("POST", "/logos", async (c) => { const name = String(c.query.name ?? "").trim(); if (!name) throw new Error("name مطلوب"); await fetcher.clearMisses(name); return logos.add({ name, buf: await c.buffer(8 * 1024 * 1024), kind: c.query.kind }); });
  R("POST", "/logos/:slug", async (c) => logos.update(c.params.slug, await c.json()));
  R("DELETE", "/logos/:slug", async (c) => { await logos.remove(c.params.slug); return { ok: true }; });
  R("GET", "/teams", async (c) => {
    const q = c.query.q ?? "", seen = new Set(), out = [];
    for (const e of teams.suggest(q, 10)) { const it = logos.find(e.en); out.push({ name: e.en, ar: e.ar, kind: e.kind, slug: it?.slug ?? null }); seen.add(teams.norm(e.en)); }
    for (const it of logos.list()) if (!seen.has(teams.norm(it.name)) && it.names.some((n) => teams.norm(n).includes(teams.norm(q)))) out.push({ name: it.name, ar: it.names.find((n) => /[؀-ۿ]/.test(n)) ?? "", kind: it.kind, slug: it.slug });
    return out.slice(0, 12);
  });
  R("GET", "/resolve", async (c) => { const e = teams.lookup(c.query.name ?? ""), it = logos.find(c.query.name ?? ""); return { entry: e, logo: it ? { slug: it.slug, name: it.name } : null, miss: !it && fetcher.isMiss(c.query.name ?? "") }; });

  R("POST", "/fixtures/parse", async (c) => fx.parseFixtures((await c.json()).text));
  R("GET", "/fixtures/league", async (c) => {
    const s = settings(), id = Number(c.query.id), mode = c.query.mode ?? "next"; let ev;
    if (mode === "day") ev = await tsdb.eventsOnDay(c.query.date ?? new Date().toISOString().slice(0, 10), c.query.league);
    else ev = mode === "past" ? await tsdb.pastLeagueEvents(id) : await tsdb.nextLeagueEvents(id);
    return { matches: fx.eventsToMatches(ev, s.tz || "UTC"), note: "المفتاح المجاني يعيد عدداً محدوداً من المباريات؛ استعمل مفتاحاً مدفوعاً من الإعدادات للمزيد." };
  });

  R("POST", "/build", async (c) => { const { data, format } = await c.json(); return { design: await build(data, format ?? "post") }; });
  R("POST", "/create", async (c) => create(await c.json()));

  /* ---------- قوالب (مخفية من النموذج العام، تُستعمل عبر create_design) ---------- */
  for (const id of Object.keys(TEMPLATES)) api.registerTemplate({ id, label: `${TEMPLATES[id].en} (match-tool)`, hidden: true, fields: [], build: () => [] });

  /* ---------- أدوات MCP ---------- */
  const matchShape = z.object({ home: z.string(), away: z.string(), time: z.string().optional().describe("وقت البداية 21:00 (للمجدولة)"), stadium: z.string().optional().describe("الملعب (اختياري)"), channels: z.array(z.string()).optional().describe("القنوات الناقلة (اختياري؛ المستخدم يحدّدها بنفسه)"), note: z.string().optional(),
    state: z.enum(Object.keys(STATES)).optional().describe("scheduled (الافتراضي), live, ht, ft, aet, pen, postponed, cancelled, suspended"), minute: z.string().optional().describe("الدقيقة الحالية للمباشر مثل 67' أو 90+3'"), penalties: z.string().optional().describe("نتيجة ركلات الترجيح مثل 4-3"),
    home_score: z.union([z.string(), z.number()]).optional(), away_score: z.union([z.string(), z.number()]).optional(), status: z.string().optional().describe("قديم: نص حر FT / HT / 67'"), day: z.string().optional().describe("للجدول الأسبوعي: اسم اليوم"), home_events: z.array(z.string()).optional(), away_events: z.array(z.string()).optional() });
  api.registerMcpTool("create_post", {
    remoteSafe: true,
    description: "ينشئ منشورات مباريات كتصاميم mycanva. القوالب: single, list, weekly, poll. كل مباراة لها state (مجدولة، مباشر مع minute، استراحة، انتهت، تمديد، ركلات ترجيح، مؤجلة، ملغاة، متوقفة) مع النتيجة والملعب والقنوات الناقلة (اختياريان)، والتصميم يتكيّف تلقائياً. يولّد كل مقاسات ولغات مطلوبة دفعة واحدة، ويضع الكابشن والهاشتاغات. الشعارات تُطابَق بالاسم (عربي/إنكليزي)، وأي شعار ناقص يُجلب مرة واحدة ويُحفظ داخل الإضافة تلقائياً (بدون إعادة الطلب لاحقاً).",
    inputSchema: {
      template: z.enum(Object.keys(TEMPLATES)).default("single").describe("single (مباراة واحدة)، list، weekly، poll. حالة كل مباراة (مجدولة/مباشر/استراحة/انتهت/…) تُحدَّد بحقل state فتتكيّف كل القوالب"), brand: z.string().optional(), lang: z.enum(["ar", "en"]).default("ar"), langs: z.array(z.enum(["ar", "en"])).optional().describe("لتوليد النسختين: [\"ar\",\"en\"]"),
      formats: z.array(z.string()).optional().describe("story, post, square, fb-post, x-post أو 1200x630. الافتراضي من الإعدادات"),
      title: z.string().optional(), date: z.string().optional().describe("نص التاريخ المعروض"), competition: z.string().optional(), matches: z.array(matchShape).min(1),
      publish_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), status: z.enum(["draft", "approved", "scheduled", "published"]).optional(), name: z.string().optional().describe("معرّف المجموعة"), swap: z.boolean().optional(), disclaimer: z.boolean().optional(),
    },
  }, async (a) => {
    const data = { template: a.template, brand: a.brand ?? "", lang: a.lang, title: a.title ?? "", date: a.date ?? "", comp: a.competition ?? "", swap: a.swap ?? null, disclaimer: a.disclaimer ?? null,
      matches: a.matches.map((m) => ({ home: m.home, away: m.away, time: m.time ?? "", stadium: m.stadium ?? "", channels: m.channels ?? [], note: m.note ?? "", hs: m.home_score ?? "", as: m.away_score ?? "", state: m.state ?? "", minute: m.minute ?? "", pens: m.penalties ?? "", status: m.status ?? "", day: m.day ?? "", homeEvents: m.home_events ?? [], awayEvents: m.away_events ?? [] })) };
    const r = await create({ data, formats: a.formats, langs: a.langs, group: a.name, schedule: a.publish_date ? { date: a.publish_date, status: a.status } : undefined, budgetMs: 25000 });
    const l = r.logos; return { ...r, hint: l.queued.length ? `${l.queued.length} شعار في الطابور (حد طلبات TheSportsDB): سيُجلب بالخلفية وتتحدّث التصاميم تلقائياً.` : l.missing.length ? `لا شعار معروف لـ: ${l.missing.join("، ")}. أضفه بـ match_add_logo_from_url.` : "ارندر أي تصميم بـ render_design للمراجعة." };
  });
  api.registerMcpTool("list_logos", { remoteSafe: true, description: "مكتبة شعارات الفرق المخزّنة داخل الإضافة", inputSchema: { query: z.string().optional() } }, async ({ query }) => logos.list().filter((l) => !query || l.names.some((n) => teams.norm(n).includes(teams.norm(query)))).map(({ slug, name, names, kind, colors, source }) => ({ slug, name, names, kind, colors, source })));
  api.registerMcpTool("logo_status", { remoteSafe: true, description: "حالة جلب الشعارات: عدد المخزّن، الطابور، الفرق التي لم يوجد لها شعار، وحصة طلبات TheSportsDB", inputSchema: {} }, async () => ({ logos: logos.list().length, ...fetcher.status() }));
  api.registerMcpTool("league_pack", { description: "يحمّل شعارات دوري كامل بطلب واحد إلى TheSportsDB ويخزّنها داخل الإضافة للأبد (المفتاح المجاني يعيد 10 فرق لكل دوري). الدوريات: English Premier League, Spanish La Liga, German Bundesliga, Italian Serie A, French Ligue 1, Saudi-Arabian Pro League.", inputSchema: { league: z.string() } }, async ({ league }) => { try { return await fetcher.leaguePack(league); } catch (e) { if (e.status === 429) return { rateLimited: true, message: e.message }; throw e; } });
  api.registerMcpTool("resolve_team", { remoteSafe: true, description: "يعرّف اسم فريق (عربي/إنكليزي/مرادف): الاسم الرسمي والعربي وهل له شعار محفوظ", inputSchema: { name: z.string() } }, async ({ name }) => ({ entry: teams.lookup(name), hasLogo: !!logos.find(name), knownMiss: fetcher.isMiss(name) }));
  api.registerMcpTool("fetch_logo", { description: "يجلب شعار فريق من TheSportsDB ويحفظه داخل الإضافة (لا يُطلب ثانية). query/hint لاختيار الفريق الصحيح مثل hint=Saudi. الفرق المحفوظة لا تُطلب مجدداً.", inputSchema: { name: z.string(), query: z.string().optional(), hint: z.string().optional(), force: z.boolean().default(true).describe("false = لا تحاول إن كان معروفاً أنه غير موجود") } }, async ({ name, query, hint, force }) => {
    const r = await fetcher.ensure(name, { force, query, hint });
    return { status: r.status, saved: r.entry?.slug, matched: r.matched?.team, league: r.matched?.league, country: r.matched?.country, ambiguous: r.ambiguous, candidates: r.candidates, retryInSeconds: r.retryIn ? Math.ceil(r.retryIn / 1000) : undefined, message: r.message };
  });
  api.registerMcpTool("add_logo_from_url", { description: "يضيف شعار فريق من رابط صورة عام (https) ويحفظه داخل الإضافة", inputSchema: { name: z.string(), url: z.string() } }, async ({ name, url }) => {
    const u = core.assertPublicUrl(url), r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`تعذّر التنزيل (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 8_000_000) throw new Error("الصورة كبيرة"); await fetcher.clearMisses(name); const it = await logos.add({ name, buf, source: `url: ${u.hostname}` }); return { saved: it.slug };
  });
  api.registerMcpTool("fixtures", { description: "يجلب مباريات من TheSportsDB لدوري (league_id: 4328 EPL, 4335 La Liga, 4331 Bundesliga, 4332 Serie A, 4334 Ligue 1, 4480 UCL, 4481 UEL, 4668 Saudi) أو ليوم محدد. المفتاح المجاني محدود العدد.", inputSchema: { league_id: z.number().optional(), mode: z.enum(["next", "past", "day"]).default("next"), date: z.string().optional() } }, async ({ league_id, mode, date }) => {
    const s = settings(); const ev = mode === "day" ? await tsdb.eventsOnDay(date ?? new Date().toISOString().slice(0, 10)) : mode === "past" ? await tsdb.pastLeagueEvents(league_id) : await tsdb.nextLeagueEvents(league_id);
    return fx.eventsToMatches(ev, s.tz || "UTC");
  });
  api.registerMcpTool("parse_fixtures", { remoteSafe: true, description: "يحوّل نصاً حراً (سطر لكل مباراة، مثل 'Real Madrid vs Barcelona 21:00 | Bernabeu') إلى مصفوفة مباريات", inputSchema: { text: z.string() } }, async ({ text }) => fx.parseFixtures(text));

  api.onDeactivate(() => tsdb.flush());
  api.log(`جاهزة — ${logos.list().length} شعار، ${Object.keys(TEMPLATES).length} قوالب، ${Object.keys(tsdb.status()).length ? tsdb.status().cachedQueries : 0} بحث مخزّن`);
}
