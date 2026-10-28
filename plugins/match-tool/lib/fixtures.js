import { COMPETITIONS, competitionLookup } from "./teams.js";

const TIME_RE = /(?<![\d:])(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|ص|م)?(?![\d])/i;
const SEP_RE = /\s+(?:vs\.?|v|x|×|ضد|مقابل)\s+|\s*[×]\s*|\s+[-–—]\s+/i;

/** يحوّل وقت UTC (أو ISO) إلى نص "HH:MM" بمنطقة زمنية محددة */
export function formatTime(isoOrDate, tz = "UTC") {
  const d = typeof isoOrDate === "string" && !/[zZ]|[+-]\d\d:?\d\d$/.test(isoOrDate) ? new Date(isoOrDate + "Z") : new Date(isoOrDate);
  if (isNaN(d)) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(d);
}
export function formatDate(iso, lang, tz = "UTC") {
  const d = typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00Z") : new Date(iso);
  if (isNaN(d)) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
}
const to24 = (h, m, ap) => { h = +h; if (ap) { const pm = /pm|م/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; } return `${String(h).padStart(2, "0")}:${m}`; };

const STATE_SEG = /^(?:(live|مباشر)\s*(\d{1,3}(?:\s*\+\s*\d{1,2})?\s*['′’]?)?|(\d{1,3}(?:\s*\+\s*\d{1,2})?\s*['′’])|(ft|full ?time|انتهت|نهاية المباراة)|(ht|half ?time|استراحة)|(aet|بعد التمديد)|(pen|penalties|ركلات الترجيح)|(postponed|مؤجلة?)|(cancel+ed|ملغاة?)|(suspended|متوقفة?))$/i;
const TAG_STADIUM = /^(?:@|stadium\s*[:：]|venue\s*[:：]|ملعب\s*[:：]?|الملعب\s*[:：])\s*/i, TAG_TV = /^(?:tv\s*[:：]|channels?\s*[:：]|broadcast\s*[:：]|قناة\s*[:：]|قنوات\s*[:：]|القنوات\s*[:：]|البث\s*[:：])\s*/i;
const splitCh = (v) => v.split(/[,،+&]|\s\/\s/).map((x) => x.trim()).filter(Boolean);

/** يقرأ نصاً حراً (سطر لكل مباراة): "Real Madrid vs Barcelona 21:00 | Bernabeu | beIN Sports 1, beIN Sports 2"
 *  - الأجزاء بعد الأول تُفصل بـ | أو ؛ : وقت، حالة (live 67' / FT / HT / مؤجلة)، "@الملعب" أو "ملعب: x"، "قنوات: a, b"، وغير الموسومة: أولها ملعب ثم قنوات ثم ملاحظة.
 *  - النتيجة: "Arsenal 2-1 Chelsea". */
export function parseFixtures(text) {
  const matches = [], warnings = [];
  for (const [i, raw] of String(text ?? "").split(/\r?\n/).entries()) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const segs = line.split(/\s*[|;؛\t]\s*/).filter(Boolean); let first = segs.shift(), time = "", stadium = "", channels = [], note = [], state = "", minute = "", pens = "", plain = 0;
    const t = first.match(TIME_RE); if (t) { time = to24(t[1], t[2], t[3]); first = first.replace(TIME_RE, " ").replace(/\s{2,}/g, " ").trim(); }
    for (const sg of segs) {
      const tm = sg.match(TIME_RE), st = sg.match(STATE_SEG);
      if (tm && !time && sg.replace(TIME_RE, "").trim().length < 3) time = to24(tm[1], tm[2], tm[3]);
      else if (st) {
        const [liveW, liveMin, bareMin, ft, ht, aet, pen, postp, canc] = st.slice(1);
        state = liveW || bareMin ? "live" : ft ? "ft" : ht ? "ht" : aet ? "aet" : pen ? "pen" : postp ? "postponed" : canc ? "cancelled" : "suspended";
        minute = (liveMin ?? bareMin ?? "").replace(/\s+/g, ""); if (minute && !/['′’]$/.test(minute)) minute += "'";
      }
      else if (state === "pen" && !pens && /^\(?\d{1,2}\s*[-–:]\s*\d{1,2}\)?$/.test(sg)) pens = sg.replace(/[()\s]/g, "").replace(/[–:]/g, "-");
      else if (TAG_STADIUM.test(sg)) stadium = sg.replace(TAG_STADIUM, "").trim();
      else if (TAG_TV.test(sg)) channels = splitCh(sg.replace(TAG_TV, ""));
      else { plain++; if (plain === 1) stadium = stadium || sg; else if (plain === 2) channels = channels.length ? channels : splitCh(sg); else note.push(sg); }
    }
    let home, away, hs, as;
    const sc = first.match(/^(.+?)\s+(\d{1,2})\s*[-–:×x]\s*(\d{1,2})\s+(.+)$/);
    if (sc) { home = sc[1]; hs = sc[2]; as = sc[3]; away = sc[4]; }
    else { const parts = first.split(SEP_RE).map((x) => x.trim()).filter(Boolean); if (parts.length >= 2) { home = parts[0]; away = parts.slice(1).join(" "); } }
    if (!home || !away) { warnings.push(`السطر ${i + 1}: لم أفهم الفريقين ("${line.slice(0, 40)}")`); continue; }
    matches.push({ home, away, time, stadium, channels, note: note.join(" · "), ...(state ? { state } : {}), ...(minute ? { minute } : {}), ...(pens ? { pens } : {}), ...(hs != null ? { hs, as } : {}) });
  }
  return { matches, warnings };
}

/** يحوّل أحداث TheSportsDB إلى مباريات مع توقيت المنطقة الزمنية المطلوبة */
export function eventsToMatches(events, tz) {
  const stateOf = (st) => { const x = String(st ?? "").toLowerCase(); return /finish|^ft$|after|ended/.test(x) ? "ft" : /postpone/.test(x) ? "postponed" : /cancel/.test(x) ? "cancelled" : /suspend|abandon/.test(x) ? "suspended" : /half|^ht$/.test(x) ? "ht" : /live|1h|2h|in play/.test(x) ? "live" : ""; };
  return events.filter((e) => e.home && e.away).map((e) => ({ home: e.home, away: e.away, time: e.timestamp ? formatTime(e.timestamp, tz) : e.time ?? "", stadium: e.venue ?? "", channels: [], ...(stateOf(e.status) ? { state: stateOf(e.status) } : {}), league: e.league, date: e.timestamp ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(e.timestamp + "Z")) : e.date, ...(e.hs != null && e.hs !== "" ? { hs: String(e.hs), as: String(e.as) } : {}) }));
}
export { COMPETITIONS, competitionLookup };
