import { z } from "zod";

export const ColorToken = z.string().describe("اسم لون من الهوية (primary, secondary, accent, bg, text, surface, muted) أو hex/css");

export const BrandSchema = z.object({
  name: z.string(),
  language: z.enum(["ar", "en"]).default("ar"),
  direction: z.enum(["rtl", "ltr"]).default("rtl"),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    bg: z.string(),
    surface: z.string(),
    text: z.string(),
    muted: z.string(),
    onPrimary: z.string(),
    extra: z.array(z.string()).default([]),
  }),
  fonts: z.object({ heading: z.string().default("Cairo"), body: z.string().default("Tajawal") }).default({ heading: "Cairo", body: "Tajawal" }),
  logo: z.object({ default: z.string().optional(), light: z.string().optional(), mark: z.string().optional() }).default({}),
  style: z.object({
    radius: z.number().default(24),
    iconSet: z.enum(["lucide", "tabler", "ph"]).default("lucide"),
    pattern: z.enum(["none", "dots", "grid", "waves"]).default("dots"),
  }).default({ radius: 24, iconSet: "lucide", pattern: "dots" }),
  voice: z.object({
    tone: z.string().default(""),
    hashtags: z.array(z.string()).default([]),
    cta: z.array(z.string()).default([]),
  }).default({ tone: "", hashtags: [], cta: [] }),
});
export type Brand = z.infer<typeof BrandSchema>;

const Box = { x: z.number(), y: z.number(), w: z.number(), h: z.number() };
export const ANIM_TYPES = ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom", "pop"] as const;
const AnimSchema = z.object({ type: z.enum(ANIM_TYPES), delay: z.number().min(0).max(10000).default(0), duration: z.number().min(100).max(5000).default(600) });
const Common = { id: z.string().optional(), opacity: z.number().min(0).max(1).optional(), rotate: z.number().optional(), locked: z.boolean().optional(), anim: AnimSchema.optional().describe("حركة دخول للفيديو/GIF") };
const ImageFilter = z.object({ brightness: z.number().min(0).max(250).default(100), contrast: z.number().min(0).max(250).default(100), saturate: z.number().min(0).max(300).default(100), blur: z.number().min(0).max(40).default(0), grayscale: z.number().min(0).max(100).default(0), sepia: z.number().min(0).max(100).default(0) });

export const ElementSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"), ...Common, ...Box,
    text: z.string(),
    font: z.enum(["heading", "body"]).default("body"),
    size: z.number(), weight: z.number().default(700),
    color: ColorToken.default("text"),
    align: z.enum(["start", "center", "end"]).default("start"),
    lineHeight: z.number().default(1.3),
    valign: z.enum(["top", "middle", "bottom"]).default("top"),
    fit: z.boolean().default(true).describe("يصغّر الخط تلقائيًا إذا النص أكبر من الصندوق"),
  }),
  z.object({
    type: z.literal("shape"), ...Common, ...Box,
    kind: z.enum(["rect", "circle", "pill"]).default("rect"),
    fill: ColorToken.default("primary"),
    radius: z.number().optional(),
    stroke: ColorToken.optional(), strokeWidth: z.number().optional(),
    gradient: z.object({ from: ColorToken, to: ColorToken, angle: z.number().default(135), kind: z.enum(["linear", "radial"]).default("linear") }).optional(),
    blur: z.number().min(0).max(300).optional().describe("ضبابية بالبكسل (للتوهج)"),
  }),
  z.object({
    type: z.literal("icon"), ...Common, x: z.number(), y: z.number(), size: z.number(),
    name: z.string().describe("مثال: lucide:heart أو heart (يستخدم iconSet الهوية)"),
    color: ColorToken.default("primary"), strokeWidth: z.number().optional(),
  }),
  z.object({
    type: z.literal("image"), ...Common, ...Box,
    src: z.string().describe("مسار ملف أو رابط أو data URI"),
    fit: z.enum(["cover", "contain"]).default("cover"),
    radius: z.number().optional(),
    posX: z.number().min(0).max(100).default(50).describe("نقطة التركيز الأفقية %"), posY: z.number().min(0).max(100).default(50),
    zoom: z.number().min(1).max(4).default(1), filter: ImageFilter.optional(),
  }),
  z.object({
    type: z.literal("logo"), ...Common, x: z.number(), y: z.number(), h: z.number(),
    w: z.number().default(400).describe("عرض الصندوق الحاوي للوغو"),
    align: z.enum(["start", "center", "end"]).default("start"),
    variant: z.enum(["default", "light", "mark"]).default("default"),
  }),
  z.object({
    type: z.literal("qr"), ...Common, x: z.number(), y: z.number(), size: z.number(),
    data: z.string().min(1).max(2000).describe("النص المرمَّز (رابط…). استخدم qrPayload/أداة create_qr لبناء واي فاي وجهات اتصال…"),
    dots: z.enum(["square", "rounded", "dots", "diamond", "classy"]).default("rounded"),
    eyeOuter: z.enum(["square", "rounded", "circle"]).default("rounded"),
    eyeInner: z.enum(["square", "rounded", "circle"]).default("rounded"),
    fg: ColorToken.default("text"), fg2: ColorToken.optional(), angle: z.number().default(135), eyeColor: ColorToken.optional(),
    bg: ColorToken.default("surface").describe("أو transparent"), bgRadius: z.number().default(0), margin: z.number().min(0).max(8).default(2),
    ec: z.enum(["L", "M", "Q", "H"]).default("Q"),
    logo: z.string().optional().describe("brand:default | brand:light | brand:mark أو مسار صورة"), logoScale: z.number().default(0.22),
  }),
  z.object({
    type: z.literal("pattern"), ...Common, ...Box,
    kind: z.enum(["dots", "grid", "waves"]).default("dots"),
    color: ColorToken.default("primary"),
  }),
]);
export type Element = z.infer<typeof ElementSchema>;

export const SIZE_LIMITS = { min: 64, max: 8000 };
const _sizeNum = z.number().int().min(SIZE_LIMITS.min).max(SIZE_LIMITS.max);

export const DesignSchema = z.object({
  brand: z.string().describe("اسم مجلد الهوية داخل brands/"),
  format: z.string().default("post"),
  width: _sizeNum.optional(), height: _sizeNum.optional(),
  background: ColorToken.default("bg"),
  elements: z.array(ElementSchema).default([]),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  group: z.string().optional().describe("معرّف المجموعة (كاروسيل أو دفعة)"),
  order: z.number().optional(),
  kind: z.enum(["carousel", "batch"]).optional(),
  status: z.enum(["draft", "approved", "scheduled", "published"]).optional().describe("حالة المنشور بالتقويم"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("تاريخ النشر YYYY-MM-DD"),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  meta: z.record(z.string(), z.unknown()).optional().describe("بيانات تحتفظ بها الإضافات (مثل match-tool) لإعادة توليد التصميم"),
});
export type Design = z.infer<typeof DesignSchema>;

export interface Format { w: number; h: number; label: string; group: string }
const F = (group: string, items: [string, number, number, string][]) => items.map(([k, w, h, label]) => [k, { w, h, label, group }] as const);
export const FORMATS: Record<string, Format> = Object.fromEntries([
  ...F("انستغرام", [["post", 1080, 1350, "منشور 4:5"], ["square", 1080, 1080, "منشور مربع 1:1"], ["story", 1080, 1920, "ستوري / ريلز 9:16"], ["ig-landscape", 1080, 566, "منشور أفقي 1.91:1"], ["ig-profile", 320, 320, "صورة البروفايل"]]),
  ...F("فيسبوك", [["fb-post", 1200, 630, "منشور"], ["cover", 1640, 624, "غلاف الصفحة"], ["fb-group-cover", 1640, 856, "غلاف المجموعة"], ["fb-event", 1920, 1005, "غلاف فعالية"], ["fb-ad", 1080, 1080, "إعلان مربع"]]),
  ...F("تيك توك / سناب / واتساب", [["tiktok", 1080, 1920, "تيك توك"], ["snap", 1080, 1920, "سناب شات"], ["wa-status", 1080, 1920, "حالة واتساب"]]),
  ...F("X (تويتر) / ثريدز", [["x-post", 1600, 900, "منشور X"], ["x-header", 1500, 500, "غلاف X"], ["threads", 1080, 1350, "ثريدز"]]),
  ...F("لينكدإن", [["li-post", 1200, 627, "منشور"], ["li-cover", 1584, 396, "غلاف الملف"], ["li-company", 1128, 191, "غلاف الشركة"]]),
  ...F("يوتيوب", [["yt-thumb", 1280, 720, "صورة مصغّرة"], ["yt-banner", 2560, 1440, "غلاف القناة"]]),
  ...F("بنترست", [["pin", 1000, 1500, "بِن 2:3"], ["pin-long", 1000, 2100, "بِن طويل"]]),
  ...F("ويب وإعلانات", [["og", 1200, 630, "صورة مشاركة OG"], ["web-hero", 1920, 600, "بانر موقع"], ["email-header", 1200, 400, "رأس إيميل"], ["ad-rect", 300, 250, "إعلان 300×250"], ["ad-leader", 728, 90, "إعلان 728×90"], ["ad-sky", 160, 600, "إعلان 160×600"], ["ad-billboard", 970, 250, "إعلان 970×250"]]),
  ...F("عروض وطباعة", [["slide", 1920, 1080, "شريحة عرض 16:9"], ["a4", 1240, 1754, "A4 عمودي (150dpi)"], ["a4-land", 1754, 1240, "A4 أفقي (150dpi)"], ["a5", 874, 1240, "A5 (150dpi)"], ["flyer", 1275, 1650, "فلاير Letter"], ["logo-square", 1000, 1000, "لوغو / أيقونة"]]),
]);

