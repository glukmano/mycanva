import fs from "node:fs/promises";
import path from "node:path";
import { norm } from "./teams.js";

/**
 * «الجالب»: يضمن أن لكل فريق شعاراً محفوظاً بمجلد الإضافة بأقل عدد طلبات ممكن.
 *  - الشعار المحفوظ لا يُطلب أبداً مرة ثانية.
 *  - الفريق الذي لم نجد له شعاراً يُتذكَّر ولا يُسأل عنه كل مرة (يُعاد بعد missRetryDays أو يدوياً).
 *  - عند حد الطلبات يدخل الاسم طابوراً ويُجلب تلقائياً بالخلفية، ثم تُحدَّث التصاميم التي كانت ناقصة (عبر onFetched).
 */
export async function createFetcher(api, { logos, tsdb, teams, onFetched }) {
  const missFile = path.join(api.dataDir, "misses.json"), queueFile = path.join(api.dataDir, "queue.json");
  const read = async (f, d) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return d; } };
  let misses = await read(missFile, {}), queue = await read(queueFile, []); const events = []; let busy = false;
  const saveMisses = () => fs.writeFile(missFile, JSON.stringify(misses, null, 2)), saveQueue = () => fs.writeFile(queueFile, JSON.stringify(queue, null, 2));
  const retryDays = () => Number(api.settings.get().missRetryDays) || 14;
  const isMiss = (name) => { const m = misses[norm(name)]; return !!m && Date.now() - m.ts < retryDays() * 864e5; };
  const inQueue = (name) => queue.some((q) => norm(q.name) === norm(name));
  async function enqueue(name) { if (!inQueue(name)) { queue.push({ name, ts: Date.now(), tries: 0 }); await saveQueue(); } }

  /** يجرّب عدة صيغ للاسم (الرسمي ثم المرادفات اللاتينية). كل صيغة تُخزَّن نتيجتها فلا تُسأل مرتين */
  async function fetchOne(name, { query, hint, force } = {}) {
    const e = teams.lookup(name), latin = (x) => x && /^[\x20-\x7E]+$/.test(x);
    const tries = [...new Set([query, e?.en, ...(e?.aliases ?? []).filter(latin), name].filter(latin))].slice(0, 4); let last = { pick: null, candidates: [], ambiguous: false };
    for (const q of tries) { last = await tsdb.searchTeam(q, hint || e?.hint || "", { refresh: force }); if (last.pick?.badge) break; }
    if (!last.pick?.badge) return { ok: false, candidates: last.candidates, query: tries[0] ?? name };
    const entry = await logos.add({ name, buf: await tsdb.downloadBadge(last.pick.badge), source: `TheSportsDB: ${last.pick.team} (${last.pick.league ?? ""}, ${last.pick.country ?? ""})`, colors: last.pick.colors });
    return { ok: true, entry, matched: last.pick, ambiguous: last.ambiguous, candidates: last.candidates };
  }

  /** الحالات: have | fetched | miss | queued | skipped | error */
  async function ensure(rawName, { force = false, query, hint } = {}) {
    const name = String(rawName ?? "").trim(); if (!name) return { status: "skipped" };
    const have = logos.find(name); if (have) return { status: "have", entry: have };
    if (!force && isMiss(name)) return { status: "miss", known: true, candidates: misses[norm(name)].candidates };
    if (!force && api.settings.get().autoFetch === false) return { status: "skipped" };
    try {
      const r = await fetchOne(name, { force, query, hint });
      if (r.ok) { delete misses[norm(name)]; queue = queue.filter((q) => norm(q.name) !== norm(name)); await Promise.all([saveMisses(), saveQueue()]); events.unshift({ ts: Date.now(), type: "fetched", name, team: r.matched.team }); events.length = Math.min(events.length, 30); return { status: "fetched", entry: r.entry, matched: r.matched, ambiguous: r.ambiguous, candidates: r.candidates }; }
      misses[norm(name)] = { name, ts: Date.now(), candidates: r.candidates }; await saveMisses(); return { status: "miss", candidates: r.candidates };
    } catch (e) {
      if (e.status === 429) { await enqueue(name); return { status: "queued", retryIn: e.retryIn }; }
      return { status: "error", message: e.message };
    }
  }
  /** عدة أسماء ضمن ميزانية زمنية؛ ما يتبقى يدخل الطابور ويكمل بالخلفية */
  async function ensureMany(names, { budgetMs = 15000 } = {}) {
    const start = Date.now(), results = {};
    for (const n of [...new Set(names.map((x) => String(x ?? "").trim()).filter(Boolean))]) {
      if (logos.find(n)) { results[n] = { status: "have" }; continue; }
      if (Date.now() - start > budgetMs && !isMiss(n) && api.settings.get().autoFetch !== false) { await enqueue(n); results[n] = { status: "queued" }; continue; }
      results[n] = await ensure(n);
    }
    return results;
  }

  /** حزمة دوري: كل فرقه بطلب API واحد ثم تنزيل الشعارات من الـCDN (لا تُحسب من الحد). الموجود منها لا يُعاد */
  const LEAGUES = { "English Premier League": "الدوري الإنجليزي الممتاز", "Spanish La Liga": "الدوري الإسباني", "German Bundesliga": "الدوري الألماني", "Italian Serie A": "الدوري الإيطالي", "French Ligue 1": "الدوري الفرنسي", "Saudi-Arabian Pro League": "دوري روشن السعودي" };
  async function leaguePack(league) {
    if (!LEAGUES[league]) throw new Error(`دوري غير مدعوم: ${league}`);
    const list = await tsdb.searchAllTeams(league), out = { league, found: list.length, added: [], had: [], failed: [] };
    for (const t of list) {
      const names = [t.team, ...t.alternate]; if (names.some((n) => logos.find(n))) { out.had.push(t.team); continue; }
      try { await logos.add({ name: t.team, buf: await tsdb.downloadBadge(t.badge), source: `TheSportsDB: ${t.team} (${t.league}, ${t.country})`, colors: t.colors, meta: { names: t.alternate } }); delete misses[norm(t.team)]; out.added.push(t.team); await new Promise((r) => setTimeout(r, 250)); }
      catch (e) { out.failed.push(`${t.team}: ${e.message}`); }
    }
    await saveMisses(); for (const n of out.added) events.unshift({ ts: Date.now(), type: "fetched", name: n, team: n }); events.length = Math.min(events.length, 30);
    for (const n of out.added) { const it = logos.find(n); if (it) await onFetched?.(it).catch(() => {}); }
    return out;
  }

  /* ---------- عامل الخلفية: يعالج الطابور كلما سمحت الحصة ---------- */
  async function tick() {
    if (busy || !queue.length || tsdb.status().blockedFor > 0) return; busy = true;
    try {
      const item = queue[0], r = await ensure(item.name);
      if (r.status === "queued") return; // ما زلنا بالحد: نبقيه
      queue = queue.filter((q) => norm(q.name) !== norm(item.name)); await saveQueue();
      if (r.status === "fetched") { const refreshed = await onFetched?.(r.entry).catch(() => []); if (refreshed?.length) events[0] = { ...events[0], refreshed }; }
      else if (r.status === "error" && ++item.tries < 3) { queue.push(item); await saveQueue(); }
    } finally { busy = false; }
  }
  const timer = setInterval(() => tick().catch(() => {}), 6000); api.onDeactivate(() => clearInterval(timer));

  return {
    ensure, ensureMany, fetchOne, leaguePack, LEAGUES,
    status: () => ({ quota: tsdb.status(), queue: queue.map((q) => q.name), misses: Object.values(misses).filter((m) => Date.now() - m.ts < retryDays() * 864e5).map((m) => ({ name: m.name, ts: m.ts })), events: events.slice(0, 10) }),
    clearMisses: async (name) => { if (name) delete misses[norm(name)]; else misses = {}; await saveMisses(); },
    isMiss,
  };
}
