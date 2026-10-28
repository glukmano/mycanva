// عميل TheSportsDB: مفتاح مجاني عام (123)، حدّه ~30 طلباً بالدقيقة. شعارات الأندية علامات تجارية لأصحابها: تُستعمل كما هي.
// لتوفير الطلبات: (1) كل نتائج البحث عن الفرق تُحفظ على القرص (الناجح للأبد، الفاشل 14 يوماً)،
// (2) كل الطلبات تمر بطابور واحد بفاصل ≥ 2.2 ثانية، (3) عند الاقتراب من الحد أو الخطأ 429 نتوقف ونعيد المحاولة لاحقاً بدل الإلحاح.
import fs from "node:fs/promises";
import path from "node:path";
import { norm } from "./teams.js";

const BASE = "https://www.thesportsdb.com/api/v1/json", GAP = 3000, WINDOW = 60000, SAFE_LIMIT = 20, NEG_TTL = 14 * 864e5, MAX_BLOCK = 15 * 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimitError extends Error {
  constructor(ms) { const m = Math.ceil(ms / 60000); super(`TheSportsDB حدّ الطلبات مؤقتاً: سيُكمل الجلب تلقائياً بعد ${ms < 90000 ? `${Math.ceil(ms / 1000)} ثانية` : `${m} دقيقة`}`); this.status = 429; this.retryIn = ms; }
}

export async function createTsdb(api) {
  const cacheFile = path.join(api.dataDir, "tsdb-cache.json"); let cache = { teams: {} };
  try { cache = { teams: {}, ...JSON.parse(await fs.readFile(cacheFile, "utf8")) }; } catch { /* ذاكرة جديدة */ }
  cache.block ??= { until: 0, strikes: 0 };
  let saveTimer; const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(cacheFile, JSON.stringify(cache)).catch(() => {}), 400); };
  const L = { times: [], blockedUntil: cache.block.until || 0, strikes: cache.block.strikes || 0, last: 0, total: 0, cacheHits: 0 }; let chain = Promise.resolve();
  const prune = () => { const c = Date.now() - WINDOW; L.times = L.times.filter((t) => t > c); };
  const key = () => api.settings.get().tsdbKey || "123";

  /** ينفّذ طلباً عبر الطابور الموحّد مع فاصل ثابت وحماية من الحد */
  function throttled(fn) {
    const run = async () => {
      const now = Date.now(); if (now < L.blockedUntil) throw new RateLimitError(L.blockedUntil - now);
      prune(); if (L.times.length >= SAFE_LIMIT) throw new RateLimitError(L.times[0] + WINDOW - now + 500);
      const gap = Math.max(0, L.last + GAP - Date.now()); if (gap) await sleep(gap);
      L.last = Date.now(); L.times.push(L.last); L.total++;
      try { const r = await fn(); if (L.strikes) { L.strikes = 0; cache.block = { until: 0, strikes: 0 }; persist(); } return r; }
      catch (e) { // 429: نلتزم بترويسة Retry-After ونتراجع تصاعدياً (Cloudflare يمدّد الحظر إن أصررنا)
        if (e.status === 429) { L.strikes++; const ms = Math.min(MAX_BLOCK, Math.max((e.retryAfter || 0) * 1000, 30000) * 2 ** (L.strikes - 1)); L.blockedUntil = Date.now() + ms; cache.block = { until: L.blockedUntil, strikes: L.strikes }; persist(); throw new RateLimitError(ms); }
        throw e; }
    };
    const p = chain.then(run, run); chain = p.catch(() => {}); return p;
  }
  const get = (endpoint) => throttled(async () => {
    const r = await fetch(`${BASE}/${key()}/${endpoint}`, { signal: AbortSignal.timeout(15000) });
    if (r.status === 429) { const e = new Error("429"); e.status = 429; e.retryAfter = Number(r.headers.get("retry-after")) || 0; throw e; }
    if (!r.ok) throw new Error(`TheSportsDB: ${r.status}`);
    return r.json();
  });

  /** يبحث عن فريق (كرة قدم). الناجح يُحفظ للأبد والفاشل 14 يوماً: نفس السؤال لا يُرسَل مرتين */
  async function searchTeam(query, hint, { refresh = false } = {}) {
    const ck = `${norm(query)}|${norm(hint || "")}`, hit = cache.teams[ck];
    if (hit && !refresh && (hit.result.pick || Date.now() - hit.t < NEG_TTL)) { L.cacheHits++; return { ...hit.result, cached: true }; }
    const j = await get(`searchteams.php?t=${encodeURIComponent(query)}`);
    const teams = (j.teams ?? []).filter((t) => t.strSport === "Soccer");
    const hinted = hint ? teams.filter((x) => `${x.strCountry} ${x.strLeague} ${x.strTeam}`.toLowerCase().includes(String(hint).toLowerCase())) : teams, pick = hinted[0] ?? null;
    const result = { pick: pick && { team: pick.strTeam, league: pick.strLeague, country: pick.strCountry, badge: pick.strBadge, colors: [pick.strColour1, pick.strColour2].filter((c) => /^#[0-9a-f]{6}$/i.test(c ?? "")) }, candidates: teams.slice(0, 6).map((t) => ({ team: t.strTeam, country: t.strCountry, league: t.strLeague })), ambiguous: teams.length > 1 && !hint };
    cache.teams[ck] = { t: Date.now(), result }; persist(); return result;
  }
  /** كل فرق دوري بطلب واحد (المفتاح المجاني يعيد 10 فرق): اسم، شعار، ألوان، أسماء بديلة */
  async function searchAllTeams(league) {
    const j = await get(`search_all_teams.php?l=${encodeURIComponent(league)}`);
    return (j.teams ?? []).filter((t) => t.strSport === "Soccer" && t.strBadge).map((t) => ({ team: t.strTeam, alternate: String(t.strTeamAlternate ?? "").split(",").map((x) => x.trim()).filter(Boolean), badge: t.strBadge, league: t.strLeague, country: t.strCountry, colors: [t.strColour1, t.strColour2].filter((c) => /^#[0-9a-f]{6}$/i.test(c ?? "")) }));
  }
  async function downloadBadge(url) { // تنزيل الصورة من CDN لا يُحسب من حد الـ API
    const u = new URL(url); if (!/(^|\.)thesportsdb\.com$/.test(u.hostname)) throw new Error("مصدر الشعار غير مسموح");
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`تعذّر تنزيل الشعار (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 5_000_000) throw new Error("الشعار كبير"); return buf;
  }
  const mapEvent = (e) => ({ id: e.idEvent, league: e.strLeague, date: e.dateEvent, time: e.strTime?.slice(0, 5), timestamp: e.strTimestamp ?? (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}` : null), home: e.strHomeTeam, away: e.strAwayTeam, venue: e.strVenue, status: e.strStatus, hs: e.intHomeScore, as: e.intAwayScore });
  return {
    searchTeam, searchAllTeams, downloadBadge,
    nextLeagueEvents: async (id) => ((await get(`eventsnextleague.php?id=${id}`)).events ?? []).map(mapEvent),
    pastLeagueEvents: async (id) => ((await get(`eventspastleague.php?id=${id}`)).events ?? []).map(mapEvent),
    eventsOnDay: async (date, league) => ((await get(`eventsday.php?d=${date}&s=Soccer${league ? `&l=${encodeURIComponent(league)}` : ""}`)).events ?? []).map(mapEvent),
    /** حالة الحصة الحالية للواجهة */
    status: () => { prune(); return { used: L.times.length, limit: 30, blockedFor: Math.max(0, L.blockedUntil - Date.now()), strikes: L.strikes, total: L.total, cacheHits: L.cacheHits, cachedQueries: Object.keys(cache.teams).length }; },
    flush: async () => { clearTimeout(saveTimer); await fs.writeFile(cacheFile, JSON.stringify(cache)).catch(() => {}); },
  };
}
