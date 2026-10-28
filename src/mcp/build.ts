import fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createBrand, listBrands, loadBrand } from "../core/brand.js";
import { availableFonts } from "../core/fonts.js";
import { searchIcons } from "../core/icons.js";
import { checkContrast, generatePalette } from "../core/palette.js";
import { DESIGNS_DIR, EXPORTS_DIR } from "../core/paths.js";
import { cloneDesign, listTexts, setSchedule, createBatch, createCarousel, createFromTemplate, listDesigns, listGroup, loadDesign, renumberGroup, resizeDesign, safeId, saveDesign } from "../core/designs.js";
import { exportDesigns } from "../core/exporter.js";
import { lintDesign } from "../core/lint.js";
import { suggestFromUrl } from "../core/extract.js";
import { renderVideo } from "../core/video.js";
import { listUserTemplates, saveUserTemplate } from "../core/usertemplates.js";
import { fetchSheetCsv, rowsFromCsv } from "../core/csv.js";
import { generateImage, importStock, removeBackground, searchStock } from "../core/images.js";
import { ANIM_TYPES } from "../core/types.js";
import { QR_TYPES } from "../core/qr.js";
import { QrSpecSchema, saveQr } from "../core/qrtool.js";
import { renderDesign } from "../core/render.js";
import { BrandSchema, DesignSchema, ElementSchema, FORMATS, type Design } from "../core/types.js";
import { buildFromTemplate, TEMPLATES } from "../templates/index.js";
import { plugins } from "../plugins/manager.js";

const ContentSchema = z.object({
  title: z.string(), subtitle: z.string().optional(), cta: z.string().optional(), badge: z.string().optional(), icon: z.string().optional(), author: z.string().optional(),
  image: z.string().optional(), items: z.array(z.string()).optional(), date: z.string().optional(), place: z.string().optional(), number: z.string().optional(), qr: z.string().optional(),
});
const SizeShape = { format: z.string().default("post").describe("مفتاح مقاس جاهز (list_templates) — أو مرّر width و height"), width: z.number().int().min(64).max(8000).optional(), height: z.number().int().min(64).max(8000).optional() };

/** في الوضع البعيد (ChatGPT عبر النفق) نمنع قراءة ملفات من جهازك: مسارات مطلقة أو خروج من المجلد */
const unsafePath = (p?: string) => !!p && !/^(data:|https?:|brand:)/.test(p) && (p.startsWith("/") || p.startsWith("~") || p.includes(".."));
function assertRemoteSafe(els: unknown[] = []) {
  for (const e of els as { type: string; src?: string; logo?: string }[]) {
    if ((e.type === "image" && unsafePath(e.src)) || (e.type === "qr" && unsafePath(e.logo))) throw new Error("غير مسموح في الوضع البعيد: مسارات ملفات من الجهاز. استخدم اسم ملف من مجلد assets أو رابط https");
  }
}

export function buildServer(opts: { remote?: boolean } = {}) {
const remote = !!opts.remote;
const server = new McpServer({ name: "mycanva", version: "0.1.0" });
const text = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] });
const wrap = <A,>(fn: (a: A) => Promise<ReturnType<typeof text>>) => async (a: A) => { try { return await fn(a); } catch (e) { return fail(e); } };


server.registerTool("list_brands", { description: "قائمة الهويات البصرية المحفوظة" }, wrap(async () => text(await listBrands())));

server.registerTool("get_brand", { description: "تفاصيل هوية (ألوان، خطوط، نبرة)", inputSchema: { brand: z.string() } },
  wrap(async ({ brand }) => text(await loadBrand(brand))));

server.registerTool("generate_palette", {
  description: "يولّد لوحة ألوان كاملة من لون أساسي (مع فحص التباين) بدون حفظ",
  inputSchema: { primary: z.string().describe("hex"), secondary: z.string().optional(), accent: z.string().optional(), dark: z.boolean().optional() },
}, wrap(async ({ primary, ...o }) => { const colors = generatePalette(primary, o); return text({ colors, contrastWarnings: checkContrast(colors) }); }));

server.registerTool("create_brand", {
  description: "ينشئ/يحدّث هوية بصرية. كفاية تعطي primary وسيتم توليد الباقي؛ أي لون تحدده يطغى على المولَّد. اللوغو: مرر svg كنص أو مسار ملف.",
  inputSchema: {
    id: z.string().describe("اسم المجلد، مثال: my-cafe"),
    name: z.string(),
    primary: z.string(),
    colors: z.record(z.string(), z.string()).optional().describe("تجاوز ألوان محددة: secondary, accent, bg, surface, text, muted, onPrimary"),
    dark: z.boolean().optional(),
    headingFont: z.enum(availableFonts as [string, ...string[]]).optional(),
    bodyFont: z.enum(availableFonts as [string, ...string[]]).optional(),
    language: z.enum(["ar", "en"]).optional(),
    logoSvg: z.string().optional().describe("محتوى SVG للوغو الأساسي"),
    logoLightSvg: z.string().optional().describe("نسخة فاتحة للخلفيات الغامقة"),
    logoPath: z.string().optional().describe("مسار ملف لوغو موجود (svg/png) ليتم نسخه"),
    iconSet: z.enum(["lucide", "tabler", "ph"]).optional(),
    pattern: z.enum(["none", "dots", "grid", "waves"]).optional(),
    radius: z.number().optional(),
    tone: z.string().optional(), hashtags: z.array(z.string()).optional(), cta: z.array(z.string()).optional(),
  },
}, wrap(async (a) => {
  if (remote && a.logoPath) throw new Error("logoPath غير مسموح في الوضع البعيد؛ مرّر logoSvg كنص");
  const brand = await createBrand(a);
  return text({ saved: `brands/${a.id}/brand.json`, brand, contrastWarnings: checkContrast(brand.colors) });
}));

server.registerTool("list_templates", { description: "القوالب والمقاسات المتاحة" },
  wrap(async () => text({ templates: [...Object.values(TEMPLATES).filter((t) => !t.hidden).map((t) => ({ id: t.id, label: t.label, fields: t.fields })), ...(await listUserTemplates()).map((t) => ({ id: "user:" + t.id, label: t.name, fields: [] }))], formats: FORMATS, qrTypes: Object.fromEntries(Object.entries(QR_TYPES).map(([k, v]) => [k, v.fields.map((f) => f.key)])) })));

server.registerTool("search_icons", {
  description: "يبحث عن أيقونات (lucide, tabler, ph). ابحث بالإنجليزي: heart, rocket, phone…",
  inputSchema: { query: z.string(), limit: z.number().optional() },
}, wrap(async ({ query, limit }) => text(searchIcons(query, undefined, limit ?? 30))));

server.registerTool("create_design", {
  description: "ينشئ تصميمًا من قالب جاهز بهوية معيّنة (أو بعناصر مخصصة فقط). يحفظه كـ designs/<id>.json ثم استخدم render_design لرؤيته.",
  inputSchema: {
    id: z.string(), brand: z.string(), ...SizeShape,
    template: z.string().optional().describe("معرّف قالب من list_templates (announcement, quote, offer, tip, checklist, testimonial, event, countdown, product, stat, qr-card) — أو اتركه فارغًا وأضف elements"),
    content: ContentSchema.optional().describe("الحقول المستخدمة تختلف بحسب القالب (list_templates → fields)"),
    elements: z.array(ElementSchema).optional().describe("عناصر إضافية/بديلة (إحداثيات بالبكسل)"),
    background: z.string().optional(), caption: z.string().optional(), hashtags: z.array(z.string()).optional(),
  },
}, wrap(async (a) => {
  if (remote) assertRemoteSafe(a.elements); if (remote && a.content?.image) assertRemoteSafe([{ type: "image", src: a.content.image }]);
  const brand = await loadBrand(a.brand);
  const base = createFromTemplate(a.template, brand, a.brand, { format: a.format, width: a.width, height: a.height }, a.content ?? { title: "" });
  const design = DesignSchema.parse({ ...base, background: a.background ?? base.background, caption: a.caption, hashtags: a.hashtags, elements: [...base.elements, ...(a.elements ?? [])] });
  await saveDesign(a.id, design);
  return text({ saved: `designs/${a.id}.json`, size: { format: design.format, width: design.width ?? FORMATS[design.format]?.w, height: design.height ?? FORMATS[design.format]?.h }, elements: design.elements.length });
}));

server.registerTool("resize_design", {
  description: "ينشئ نسخة من تصميم بمقاس آخر (جاهز أو مخصص) مع تحجيم العناصر وتوسيطها",
  inputSchema: { id: z.string(), newId: z.string(), format: z.string().optional(), width: z.number().int().min(64).max(8000).optional(), height: z.number().int().min(64).max(8000).optional() },
}, wrap(async ({ id, newId, ...t }) => { const d = resizeDesign(await loadDesign(id), t); await saveDesign(newId, d); return text({ saved: `designs/${newId}.json`, format: d.format, width: d.width, height: d.height }); }));

server.registerTool("get_design", { description: "يقرأ spec تصميم محفوظ", inputSchema: { id: z.string() } }, wrap(async ({ id }) => text(await loadDesign(id))));

server.registerTool("update_design", {
  description: "تعديل تصميم: add (عناصر جديدة)، remove (فهارس عناصر تُحذف)، patch (تعديل خصائص عنصر بفهرسه)، set (background/format/caption/hashtags)",
  inputSchema: {
    id: z.string(),
    add: z.array(ElementSchema).optional(),
    remove: z.array(z.number()).optional(),
    patch: z.array(z.object({ index: z.number(), props: z.record(z.string(), z.unknown()) })).optional(),
    set: z.object({ background: z.string().optional(), format: z.string().optional(), caption: z.string().optional(), hashtags: z.array(z.string()).optional() }).optional(),
  },
}, wrap(async ({ id, add, remove, patch, set }) => {
  if (remote) { assertRemoteSafe(add); assertRemoteSafe(patch?.map((p) => ({ type: "image", ...p.props }))); }
  const d = await loadDesign(id);
  for (const p of patch ?? []) { if (!d.elements[p.index]) throw new Error(`لا يوجد عنصر بالفهرس ${p.index}`); d.elements[p.index] = ElementSchema.parse({ ...d.elements[p.index], ...p.props }); }
  if (remove?.length) d.elements = d.elements.filter((_, i) => !remove.includes(i));
  if (add) d.elements.push(...add);
  Object.assign(d, set ?? {});
  const parsed = DesignSchema.parse(d);
  await saveDesign(id, parsed);
  return text({ elements: parsed.elements.map((e, i) => `${i}: ${e.type}${"text" in e ? ` "${e.text.slice(0, 24)}"` : ""}`) });
}));

server.registerTool("render_design", {
  description: "يرندر تصميمًا محفوظًا إلى PNG/JPG ويعيد الصورة لأراجعها + تحذيرات (نص يتجاوز الصندوق…). format يغيّر المقاس لنفس التصميم عبر إعادة بناء القالب غير مدعوم هنا؛ استخدم create_design بمقاس جديد.",
  inputSchema: { id: z.string(), type: z.enum(["png", "jpeg"]).default("png"), scale: z.number().min(1).max(3).default(2) },
}, async ({ id, type, scale }) => {
  try {
    const d = await loadDesign(id);
    const out = path.join(EXPORTS_DIR, `${safeId(id)}.${type === "jpeg" ? "jpg" : "png"}`);
    const r = await renderDesign(d, { out, type, scale });
    // معاينة مصغّرة حتى لا تكبر الاستجابة
    const sharp = (await import("sharp")).default;
    const preview = await sharp(out).resize({ width: 800 }).jpeg({ quality: 80 }).toBuffer();
    return {
      content: [
        { type: "text" as const, text: JSON.stringify({ file: r.file, pixels: `${r.width}x${r.height}`, warnings: r.warnings, caption: d.caption, hashtags: d.hashtags }, null, 2) },
        { type: "image" as const, data: preview.toString("base64"), mimeType: "image/jpeg" },
      ],
    };
  } catch (e) { return fail(e); }
});

server.registerTool("list_designs", { description: "قائمة التصاميم المحفوظة (مع المجموعات: كاروسيل/دفعة)" }, wrap(async () => text((await listDesigns()).map(({ mtime, ...d }) => d))));

server.registerTool("create_carousel", {
  description: "ينشئ كاروسيل (غلاف + شرائح محتوى + ختام اختياري) بنفس الهوية، كل شريحة تصميم مستقل ضمن مجموعة. يعيد معرّفات الشرائح؛ ارندر كل واحدة بـ render_design أو صدّرها بـ export_designs (pdf للينكدإن).",
  inputSchema: {
    id: z.string().describe("معرّف المجموعة"), brand: z.string(), ...SizeShape,
    cover: z.object({ title: z.string(), subtitle: z.string().optional(), badge: z.string().optional() }),
    slides: z.array(z.object({ title: z.string(), body: z.string().optional(), icon: z.string().optional().describe("اسم أيقونة lucide") })).min(1).max(18),
    outro: z.object({ title: z.string(), subtitle: z.string().optional(), cta: z.string().optional() }).optional(),
  },
}, wrap(async ({ id, brand, format, width, height, cover, slides, outro }) => {
  const ids = await createCarousel(id, brand, { format, width, height }, { cover, slides, outro });
  return text({ group: safeId(id), slides: ids });
}));

server.registerTool("create_batch", {
  description: "توليد دفعة: عدة صفوف محتوى × عدة مقاسات من قالب واحد. مثالي لمحتوى أسبوع كامل. يعيد معرّفات التصاميم.",
  inputSchema: {
    name: z.string(), brand: z.string(), template: z.string(),
    formats: z.array(z.object({ format: z.string().optional(), width: z.number().int().optional(), height: z.number().int().optional() })).min(1).describe("مثال: [{format:'post'},{format:'story'},{width:1200,height:628}]"),
    rows: z.array(ContentSchema).min(1),
  },
}, wrap(async ({ name, brand, template, formats, rows }) => {
  if (remote) rows.forEach((r) => assertRemoteSafe([{ type: "image", src: r.image }]));
  const ids = await createBatch(name, brand, template, formats, rows);
  return text({ group: safeId(name), count: ids.length, designs: ids });
}));

server.registerTool("export_designs", {
  description: "يصدّر عدة تصاميم دفعة واحدة: ZIP من الصور، أو ملف PDF متعدد الصفحات (للكاروسيل). مرّر ids أو group.",
  inputSchema: { name: z.string(), ids: z.array(z.string()).optional(), group: z.string().optional(), type: z.enum(["png", "jpeg", "pdf"]).default("png") },
}, wrap(async ({ name, ids, group, type }) => {
  const list = ids ?? (group ? (await listGroup(group)).map((x) => x.id) : []);
  const r = await exportDesigns(list, { name, type });
  return text({ file: r.file, count: r.count, warnings: r.warnings });
}));

server.registerTool("renumber_group", { description: "يعيد ترقيم شرائح كاروسيل/دفعة وتحديث مؤشرات 1/N بعد تعديل ترتيبها", inputSchema: { group: z.string() } },
  wrap(async ({ group }) => text({ slides: await renumberGroup(group) })));

server.registerTool("create_qr", {
  description: "ينشئ QR code متقدم (SVG + PNG) بأنماط نقاط وعيون وألوان وتدرّج وشعار بالوسط. الأنواع: url, text, wifi, vcard, email, phone, sms, whatsapp, geo. لإضافته داخل تصميم استخدم update_design بعنصر type:'qr'.",
  inputSchema: { name: z.string().describe("اسم الملف"), ...QrSpecSchema.shape },
}, async ({ name, ...spec }) => {
  try {
    if (remote) assertRemoteSafe([{ type: "qr", logo: spec.logo }]);
    const r = await saveQr(spec, name);
    const preview = await (await import("sharp")).default(r.pngFile).resize({ width: 500 }).png().toBuffer();
    return { content: [{ type: "text" as const, text: JSON.stringify({ payload: r.payload, svg: r.svgFile, png: r.pngFile, modules: r.modules, warnings: r.warnings, tip: "جرّب مسح الكود بجوالك قبل الطباعة" }, null, 2) }, { type: "image" as const, data: preview.toString("base64"), mimeType: "image/png" }] };
  } catch (e) { return fail(e); }
});

const dayShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const localOnly = (what: string) => { if (remote) throw new Error(`${what} غير متاح في الوضع البعيد`); };

server.registerTool("check_design", { description: "فحص مطابقة تصميم للهوية وقواعد الجودة: تباين النص، ألوان خارج الهوية، حجم خط صغير، حدود، QR، مناطق الستوري الآمنة", inputSchema: { id: z.string() } },
  wrap(async ({ id }) => { const d = await loadDesign(id); const issues = lintDesign(d, await loadBrand(d.brand)); return text({ ok: !issues.some((i) => i.level !== "info"), issues }); }));

server.registerTool("set_schedule", {
  description: "يضبط حالة المنشور وموعده بتقويم المحتوى (id لتصميم أو group لكاروسيل/دفعة كاملة). الحالات: draft, approved, scheduled, published. مرّر null لمسح قيمة.",
  inputSchema: { id: z.string().optional(), group: z.string().optional(), status: z.enum(["draft", "approved", "scheduled", "published"]).nullable().optional(), date: dayShape.nullable().optional(), time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional() },
}, wrap(async ({ id, group, ...v }) => text({ updated: await setSchedule({ id, group }, v) })));

server.registerTool("list_calendar", {
  description: "قائمة المنشورات المجدولة بالتقويم بين تاريخين (أو الكل). الكاروسيل يظهر كمنشور واحد.",
  inputSchema: { from: dayShape.optional(), to: dayShape.optional(), status: z.enum(["draft", "approved", "scheduled", "published"]).optional() },
}, wrap(async ({ from, to, status }) => {
  const all = (await listDesigns()).filter((d) => d.date && (!from || d.date >= from) && (!to || d.date <= to) && (!status || d.status === status));
  const seen = new Set<string>(), out = all.filter((d) => { const k = d.group ?? d.id; if (seen.has(k)) return false; seen.add(k); return true; }).map((d) => ({ id: d.group ?? d.id, kind: d.kind ?? "single", date: d.date, time: d.time, status: d.status, brand: d.brand }));
  return text(out.sort((a, b) => (a.date! + (a.time ?? "")).localeCompare(b.date! + (b.time ?? ""))));
}));

server.registerTool("save_as_template", { description: "يحفظ تصميماً كقالب خاص يُستخدم لاحقاً في create_design بـ template:'user:<id>' (يتكيّف مع أي هوية)", inputSchema: { id: z.string(), name: z.string() } },
  wrap(async ({ id, name }) => { const t = await saveUserTemplate(name, await loadDesign(id)); return text({ template: "user:" + t.id }); }));

server.registerTool("list_texts", { description: "نصوص تصميم مع فهارسها (للترجمة)", inputSchema: { id: z.string() } }, wrap(async ({ id }) => text(listTexts(await loadDesign(id)))));
server.registerTool("clone_design", {
  description: "ينسخ تصميماً بهوية أخرى ونصوص جديدة (للترجمة عربي↔English). texts = {\"فهرس العنصر\": \"النص\"} من list_texts. mirror:true يعكس التخطيط عند تغيّر الاتجاه RTL↔LTR.",
  inputSchema: { id: z.string(), newId: z.string(), brand: z.string().optional(), texts: z.record(z.string(), z.string()).optional(), mirror: z.boolean().optional(), caption: z.string().optional(), hashtags: z.array(z.string()).optional() },
}, wrap(async ({ id, newId, ...o }) => { const d = await cloneDesign(id, safeId(newId), o); return text({ saved: `designs/${safeId(newId)}.json`, brand: d.brand, texts: listTexts(d).length }); }));

server.registerTool("brand_from_url", { description: "يستخرج اقتراح هوية (ألوان، خطوط معروفة، شعار) من موقع ويب. لا يحفظ؛ استعمل النتيجة مع create_brand.", inputSchema: { url: z.string() } },
  wrap(async ({ url }) => { localOnly("brand_from_url"); return text(await suggestFromUrl(url)); }));

server.registerTool("export_video", {
  description: "يصدّر تصميماً فيه حركات (anim على عناصره) كفيديو MP4 أو GIF. أضف anim عبر update_design/patch: {type: fade|slide-up|slide-down|slide-left|slide-right|zoom|pop, delay, duration}.",
  inputSchema: { id: z.string(), format: z.enum(["mp4", "gif"]).default("mp4"), fps: z.number().int().min(8).max(30).optional() },
}, wrap(async ({ id, format, fps }) => { const out = path.join(EXPORTS_DIR, `${safeId(id)}.${format}`); const r = await renderVideo(await loadDesign(id), { out, format, fps }); return text({ ...r, animTypes: ANIM_TYPES }); }));

server.registerTool("import_csv_batch", {
  description: "يولّد دفعة من CSV أو Google Sheet عام. الأعمدة: title, subtitle, cta, badge, icon, image, author, items(;), date, place, number, qr + publish_date(YYYY-MM-DD), status, caption, hashtags.",
  inputSchema: { name: z.string(), brand: z.string(), template: z.string(), formats: z.array(z.object({ format: z.string().optional(), width: z.number().int().optional(), height: z.number().int().optional() })).min(1), csv: z.string().optional(), sheetUrl: z.string().optional() },
}, wrap(async ({ name, brand, template, formats, csv, sheetUrl }) => {
  if (sheetUrl) localOnly("استيراد Google Sheet");
  const { rows, warnings } = rowsFromCsv(sheetUrl ? await fetchSheetCsv(sheetUrl) : csv ?? "");
  if (remote) rows.forEach((r) => assertRemoteSafe([{ type: "image", src: r.image }]));
  const ids = await createBatch(name, brand, template, formats, rows); return text({ count: ids.length, designs: ids, warnings });
}));

server.registerTool("remove_background", { description: "يزيل خلفية بلون موحّد من صورة بمجلد assets ويحفظ PNG شفاف. لا يصلح للخلفيات المعقدة.", inputSchema: { asset: z.string(), tolerance: z.number().min(5).max(120).default(32) } },
  wrap(async ({ asset, tolerance }) => text({ asset: await removeBackground(asset, tolerance) })));
server.registerTool("search_stock", { description: "يبحث عن صور مجانية (Pexels) — يحتاج مفتاحاً بالإعدادات. للتنزيل استعمل import_stock بـ full.", inputSchema: { query: z.string(), page: z.number().default(1) } },
  wrap(async ({ query, page }) => { localOnly("search_stock"); return text(await searchStock(query, page)); }));
server.registerTool("import_stock", { description: "ينزّل صورة Pexels إلى assets ويعيد اسم الملف لاستعماله بعنصر image", inputSchema: { url: z.string(), name: z.string().optional() } },
  wrap(async ({ url, name }) => { localOnly("import_stock"); return text({ asset: await importStock(url, name) }); }));
server.registerTool("generate_image", { description: "يولّد صورة بالذكاء الاصطناعي (OpenAI) ويحفظها بـ assets. يستهلك رصيد حساب المستخدم، فاسأله قبل الاستعمال المتكرر.", inputSchema: { prompt: z.string(), size: z.enum(["1024x1024", "1024x1536", "1536x1024"]).default("1024x1024") } },
  wrap(async ({ prompt, size }) => { localOnly("generate_image"); return text({ asset: await generateImage(prompt, size) }); }));

// أدوات الإضافات المفعّلة (في الوضع البعيد: فقط ما صرّحت الإضافة أنه آمن)
for (const t of plugins.mcpTools()) {
  if (remote && !t.remoteSafe) continue;
  server.registerTool(t.name, { description: t.description, inputSchema: t.inputSchema }, (async (args: unknown) => {
    try {
      const r = await t.handler(args) as { content?: unknown } | string;
      if (r && typeof r === "object" && Array.isArray(r.content)) return r as never;
      return text(r) as never;
    } catch (e) { return fail(e) as never; }
  }) as never);
}

return server;
}

