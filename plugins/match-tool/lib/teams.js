// قاموس الفرق والمسابقات (عربي ↔ English) + تطبيع الأسماء للمطابقة الذكية.
// الصيغة: [الاسم الإنكليزي, العربي, مرادفات (مفصولة بـ |), تلميح الدولة لجلب الشعار]

const CLUBS = [
  // الدوري الإنجليزي
  ["Manchester City", "مانشستر سيتي", "Man City|سيتي|Manchester City FC", "England"], ["Manchester United", "مانشستر يونايتد", "Man United|Man Utd|يونايتد", "England"],
  ["Liverpool", "ليفربول", "", "England"], ["Arsenal", "آرسنال", "ارسنال|أرسنال", "England"], ["Chelsea", "تشيلسي", "", "England"],
  ["Tottenham Hotspur", "توتنهام", "Tottenham|Spurs|توتنهام هوتسبير", "England"], ["Newcastle United", "نيوكاسل يونايتد", "Newcastle|نيوكاسل", "England"],
  ["Aston Villa", "أستون فيلا", "اسطون فيلا|استون فيلا", "England"], ["West Ham United", "وست هام", "West Ham|وست هام يونايتد", "England"], ["Everton", "إيفرتون", "ايفرتون", "England"], ["Brighton", "برايتون", "Brighton & Hove Albion", "England"],
  // الدوري الإسباني
  ["Real Madrid", "ريال مدريد", "Real|ريال|الملكي", "Spain"], ["Barcelona", "برشلونة", "FC Barcelona|Barca|Barça|برشلونه", "Spain"], ["Atletico Madrid", "أتلتيكو مدريد", "Atlético Madrid|اتلتيكو مدريد|أتلتيكو", "Spain"],
  ["Sevilla", "إشبيلية", "اشبيلية|Sevilla FC", "Spain"], ["Real Sociedad", "ريال سوسيداد", "", "Spain"], ["Villarreal", "فياريال", "", "Spain"], ["Valencia", "فالنسيا", "", "Spain"],
  ["Athletic Club", "أتلتيك بيلباو", "Athletic Bilbao|بيلباو|اتلتيك بيلباو", "Spain"], ["Real Betis", "ريال بيتيس", "Betis|بيتيس", "Spain"],
  // الدوري الألماني
  ["Bayern Munich", "بايرن ميونخ", "Bayern|Bayern München|بايرن", "Germany"], ["Borussia Dortmund", "بوروسيا دورتموند", "Dortmund|دورتموند", "Germany"],
  ["Bayer Leverkusen", "باير ليفركوزن", "Leverkusen|ليفركوزن", "Germany"], ["RB Leipzig", "لايبزيغ", "Leipzig|لايبزيج|آر بي لايبزيغ", "Germany"],
  // الدوري الإيطالي
  ["Juventus", "يوفنتوس", "Juve|يوفي", "Italy"], ["Inter Milan", "إنتر ميلان", "Inter|Internazionale|انتر ميلان|إنتر|انتر", "Italy"], ["AC Milan", "ميلان", "Milan|إي سي ميلان|ايه سي ميلان", "Italy"],
  ["Napoli", "نابولي", "", "Italy"], ["AS Roma", "روما", "Roma", "Italy"], ["Lazio", "لاتسيو", "", "Italy"], ["Atalanta", "أتالانتا", "اتالانتا", "Italy"],
  // الدوري الفرنسي
  ["Paris Saint-Germain", "باريس سان جيرمان", "PSG|Paris SG|Paris Saint Germain|باريس", "France"], ["Marseille", "مرسيليا", "Olympique Marseille|OM", "France"], ["Lyon", "ليون", "Olympique Lyonnais", "France"], ["Monaco", "موناكو", "AS Monaco", "France"],
  // أوروبا أخرى
  ["Ajax", "أياكس", "اياكس", "Netherlands"], ["Porto", "بورتو", "FC Porto", "Portugal"], ["Benfica", "بنفيكا", "", "Portugal"], ["Sporting CP", "سبورتينغ لشبونة", "Sporting Lisbon|Sporting|سبورتنج", "Portugal"],
  ["Celtic", "سيلتيك", "", "Scotland"], ["Galatasaray", "غلطة سراي", "جالطة سراي|غلاطة سراي", "Turkey"], ["Fenerbahce", "فنربخشة", "Fenerbahçe|فنربهتشه|فنار باخشه", "Turkey"], ["Shakhtar Donetsk", "شاختار دونيتسك", "Shakhtar", "Ukraine"],
  // السعودية
  ["Al Hilal", "الهلال", "Al-Hilal|Al Hilal SFC|هلال", "Saudi"], ["Al Nassr", "النصر", "Al-Nassr|نصر", "Saudi"], ["Al Ittihad", "الاتحاد", "Al-Ittihad|اتحاد جدة|الاتحاد السعودي", "Saudi"],
  ["Al Ahli", "الأهلي السعودي", "Al-Ahli Saudi|Al Ahli Jeddah|الاهلي السعودي|أهلي جدة", "Saudi"], ["Al Shabab", "الشباب", "Al-Shabab", "Saudi"], ["Al Ettifaq", "الاتفاق", "Al-Ettifaq", "Saudi"],
  ["Al Fateh", "الفتح", "Al-Fateh", "Saudi"], ["Al Taawoun", "التعاون", "Al-Taawoun", "Saudi"], ["Al Qadsiah", "القادسية", "Al-Qadsiah", "Saudi"], ["Al Fayha", "الفيحاء", "Al-Fayha", "Saudi"],
  // مصر والمغرب العربي والخليج
  ["Al Ahly", "الأهلي", "Al-Ahly|Al Ahly SC|الاهلي المصري|الأهلي المصري", "Egypt"], ["Zamalek", "الزمالك", "Zamalek SC", "Egypt"], ["Pyramids", "بيراميدز", "Pyramids FC", "Egypt"],
  ["Wydad Casablanca", "الوداد", "Wydad AC|الوداد البيضاوي|Wydad", "Morocco"], ["Raja Casablanca", "الرجاء", "Raja CA|الرجاء البيضاوي|Raja", "Morocco"],
  ["Esperance de Tunis", "الترجي", "Espérance|الترجي التونسي|Esperance Sportive de Tunis", "Tunisia"], ["Club Africain", "النادي الإفريقي", "الافريقي", "Tunisia"],
  ["Al Ain", "العين", "Al-Ain", "United Arab Emirates"], ["Al Sadd", "السد", "Al-Sadd", "Qatar"], ["Al Duhail", "الدحيل", "Al-Duhail", "Qatar"],
  // سوريا
  ["Al Karamah", "الكرامة", "Al-Karamah|Karamah", "Syria"], ["Al Jaish", "الجيش", "Al-Jaish|Jaish", "Syria"], ["Tishreen", "تشرين", "Teshreen", "Syria"], ["Al Wathba", "الوثبة", "Al-Wathba", "Syria"], ["Al Wahda Damascus", "الوحدة", "Al-Wahda Syria|الوحدة السوري", "Syria"],
].map(([en, ar, al, hint]) => ({ en, ar, aliases: al ? al.split("|") : [], kind: "club", hint }));

const NATIONALS = [
  ["Syria", "سوريا", "سورية"], ["Saudi Arabia", "السعودية", "المملكة العربية السعودية|KSA"], ["Egypt", "مصر", ""], ["Morocco", "المغرب", ""], ["Algeria", "الجزائر", ""], ["Tunisia", "تونس", ""],
  ["Iraq", "العراق", ""], ["Jordan", "الأردن", "الاردن"], ["Lebanon", "لبنان", ""], ["Palestine", "فلسطين", ""], ["Qatar", "قطر", ""], ["United Arab Emirates", "الإمارات", "UAE|الامارات|الإمارات العربية المتحدة"],
  ["Kuwait", "الكويت", ""], ["Oman", "عُمان", "عمان"], ["Bahrain", "البحرين", ""], ["Yemen", "اليمن", ""], ["Libya", "ليبيا", ""], ["Sudan", "السودان", ""],
  ["Brazil", "البرازيل", ""], ["Argentina", "الأرجنتين", "الارجنتين"], ["France", "فرنسا", ""], ["Germany", "ألمانيا", "المانيا"], ["Spain", "إسبانيا", "اسبانيا"], ["England", "إنجلترا", "انجلترا|إنكلترا"],
  ["Portugal", "البرتغال", ""], ["Italy", "إيطاليا", "ايطاليا"], ["Netherlands", "هولندا", "Holland"], ["Belgium", "بلجيكا", ""], ["Croatia", "كرواتيا", ""], ["Uruguay", "أوروغواي", "اوروجواي|الأوروغواي"],
  ["Colombia", "كولومبيا", ""], ["Mexico", "المكسيك", ""], ["United States", "الولايات المتحدة", "USA|USMNT|أمريكا"], ["Japan", "اليابان", ""], ["South Korea", "كوريا الجنوبية", "Korea Republic|كوريا"],
  ["Turkey", "تركيا", "Türkiye|Turkiye"], ["Senegal", "السنغال", ""], ["Nigeria", "نيجيريا", ""], ["Ghana", "غانا", ""], ["Cameroon", "الكاميرون", ""], ["Iran", "إيران", "ايران"], ["Australia", "أستراليا", "استراليا"],
].map(([en, ar, al]) => ({ en, ar, aliases: al ? al.split("|") : [], kind: "national", hint: "" }));

// [الاسم الإنكليزي, العربي, مرادفات, معرّف TheSportsDB]
export const COMPETITIONS = [
  ["Champions League", "دوري أبطال أوروبا", "UEFA Champions League|UCL", 4480], ["Europa League", "الدوري الأوروبي", "UEFA Europa League|UEL", 4481],
  ["Premier League", "الدوري الإنجليزي الممتاز", "EPL|English Premier League|الدوري الإنجليزي", 4328], ["La Liga", "الدوري الإسباني", "LaLiga|Spanish La Liga|الليغا", 4335],
  ["Bundesliga", "الدوري الألماني", "German Bundesliga|البوندسليغا", 4331], ["Serie A", "الدوري الإيطالي", "Italian Serie A|سيري آ", 4332], ["Ligue 1", "الدوري الفرنسي", "French Ligue 1", 4334],
  ["Saudi Pro League", "دوري روشن السعودي", "Roshn Saudi League|الدوري السعودي|دوري روشن", 4668], ["AFC Champions League", "دوري أبطال آسيا", "ACL", null],
  ["World Cup", "كأس العالم", "FIFA World Cup", null], ["World Cup Qualifiers", "تصفيات كأس العالم", "WC Qualifiers", null], ["Arab Cup", "كأس العرب", "FIFA Arab Cup", null],
  ["Africa Cup of Nations", "كأس أمم إفريقيا", "AFCON|كأس الأمم الإفريقية", null], ["Asian Cup", "كأس آسيا", "AFC Asian Cup|كأس الأمم الآسيوية", null],
  ["Copa del Rey", "كأس ملك إسبانيا", "كأس الملك", null], ["FA Cup", "كأس الاتحاد الإنجليزي", "", null], ["Club World Cup", "كأس العالم للأندية", "FIFA Club World Cup", null], ["Friendly", "مباراة ودية", "Friendlies|ودية", null],
].map(([en, ar, al, id]) => ({ en, ar, aliases: al ? al.split("|") : [], kind: "competition", tsdbId: id }));

export const DICTIONARY = [...CLUBS, ...NATIONALS, ...COMPETITIONS];

/** تطبيع اسم للمقارنة: بدون تشكيل/همزات/حروف خاصة/أداة التعريف/لواحق مثل FC */
export function norm(s) {
  let t = String(s ?? "").normalize("NFKD").replace(/[ً-ٰٟـ̀-ͯ]/g, "").toLowerCase()
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ئ/g, "ي").replace(/ؤ/g, "و")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const stop = new Set(["fc", "cf", "sc", "afc", "club", "football", "the", "al", "el", "de", "ال", "نادي", "فريق", "منتخب"]);
  return t.split(" ").filter((w) => w && !stop.has(w)).map((w) => (/^ال.{3,}/.test(w) ? w.slice(2) : w)).join(" ");
}

const INDEX = new Map();
for (const e of DICTIONARY) for (const n of [e.en, e.ar, ...e.aliases]) { const k = norm(n); if (k && !INDEX.has(k)) INDEX.set(k, e); }

/** يعيد مدخل القاموس لاسم (عربي أو إنكليزي أو مرادف) أو null */
export const lookup = (name) => INDEX.get(norm(name)) ?? null;
/** كل صيغ الاسم المعروفة (للمطابقة مع مكتبة الشعارات) */
export const allNames = (name) => { const e = lookup(name); return [...new Set([name, ...(e ? [e.en, e.ar, ...e.aliases] : [])].filter(Boolean))]; };
export const displayName = (name, lang) => { const e = lookup(name); return e ? (lang === "ar" ? e.ar : e.en) : String(name ?? "").trim(); };
export function suggest(q, limit = 12) {
  const k = norm(q); if (!k) return [];
  const starts = [], inc = [];
  for (const e of DICTIONARY) { if (e.kind === "competition") continue; const keys = [e.en, e.ar, ...e.aliases].map(norm); if (keys.some((x) => x.startsWith(k) || x.split(" ").some((w) => w.startsWith(k)))) starts.push(e); else if (k.length > 2 && keys.some((x) => x.includes(k))) inc.push(e); }
  return [...starts, ...inc].slice(0, limit);
}
export const competitionLookup = (name) => { const e = lookup(name); return e?.kind === "competition" ? e : null; };
