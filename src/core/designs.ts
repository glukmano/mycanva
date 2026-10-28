import fs from "node:fs/promises";
import path from "node:path";
import { DESIGNS_DIR } from "./paths.js";
import { buildCarousel, repage, type CarouselContent } from "../templates/carousel.js";
import { buildFromTemplate, type Content } from "../templates/index.js";
import { loadBrand } from "./brand.js";
import { mirror } from "../templates/common.js";
import { loadUserTemplateSync } from "./usertemplates.js";
import type { BatchRow } from "./csv.js";
import { DesignSchema, FORMATS, SIZE_LIMITS, type Brand, type Design, type Element } from "./types.js";

export const safeId = (id: string) => id.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "design";
const file = (id: string) => path.join(DESIGNS_DIR, `${safeId(id)}.json`);

export type DesignInfo = { id: string; brand: string; format: string; mtime: number; group?: string; order?: number; kind?: string; status?: string; date?: string; time?: string };
export async function listDesigns(): Promise<DesignInfo[]> {
  const names = (await fs.readdir(DESIGNS_DIR).catch(() => [])).filter((n) => n.endsWith(".json"));
  const out = await Promise.all(names.map(async (n) => {
    try {
      const f = path.join(DESIGNS_DIR, n);
      const d = JSON.parse(await fs.readFile(f, "utf8"));
      return { id: n.slice(0, -5), brand: d.brand as string, format: (d.format ?? "post") as string, mtime: (await fs.stat(f)).mtimeMs, group: d.group, order: d.order, kind: d.kind, status: d.status, date: d.date, time: d.time } as DesignInfo;
    } catch { return null; }
  }));
  return out.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.mtime - a.mtime);
}

export async function loadDesign(id: string): Promise<Design> {
  return DesignSchema.parse(JSON.parse(await fs.readFile(file(id), "utf8")));
}
export async function saveDesign(id: string, d: Design): Promise<Design> {
  const parsed = DesignSchema.parse(d);
  await fs.mkdir(DESIGNS_DIR, { recursive: true });
  await fs.writeFile(file(id), JSON.stringify(parsed, null, 2));
  return parsed;
}
export async function deleteDesign(id: string) { await fs.unlink(file(id)); }

export function designSize(d: Design) {
  const f = FORMATS[d.format] ?? FORMATS.post;
  return { w: d.width ?? f.w, h: d.height ?? f.h };
}

export type SizeTarget = { format?: string; width?: number; height?: number };
export function targetSize(t: SizeTarget): { w: number; h: number; format: string } {
  if (t.width && t.height) {
    const w = Math.round(t.width), h = Math.round(t.height);
    if (w < SIZE_LIMITS.min || h < SIZE_LIMITS.min || w > SIZE_LIMITS.max || h > SIZE_LIMITS.max) throw new Error(`المقاس يجب أن يكون بين ${SIZE_LIMITS.min} و${SIZE_LIMITS.max} بكسل`);
    const hit = Object.entries(FORMATS).find(([, f]) => f.w === w && f.h === h);
    return { w, h, format: hit?.[0] ?? "custom" };
  }
  const f = FORMATS[t.format ?? ""];
  if (!f) throw new Error(`مقاس غير معروف: ${t.format}`);
  return { w: f.w, h: f.h, format: t.format! };
}

/** نسخة بمقاس آخر (جاهز أو مخصص): تحجيم الإحداثيات نسبيًا (الخط بحسب أصغر نسبة) وتوسيط المحتوى */
export function resizeDesign(d: Design, target: SizeTarget | string): Design {
  const t = targetSize(typeof target === "string" ? { format: target } : target);
  const from = designSize(d), to = { w: t.w, h: t.h };
  const k = Math.min(to.w / from.w, to.h / from.h);
  const ox = (to.w - from.w * k) / 2, oy = (to.h - from.h * k) / 2;
  const els = d.elements.map((el) => {
    const e = { ...el } as unknown as Record<string, number | undefined>;
    // العناصر التي تغطي الخلفية كاملة تتمدد، والباقي يتحجّم ويتوسّط
    const full = "w" in el && "h" in el && el.w >= from.w * 0.95 && el.h >= from.h * 0.95;
    if (full) return { ...el, x: 0, y: 0, w: to.w, h: to.h } as Element;
    if (e.x != null) e.x = Math.round(e.x * k + ox);
    if (e.y != null) e.y = Math.round(e.y * k + oy);
    for (const key of ["w", "h", "size"] as const) if (e[key] != null) e[key] = Math.round(e[key]! * k);
    return e as unknown as Element;
  });
  const custom = t.format === "custom";
  return DesignSchema.parse({ ...d, format: t.format, width: custom ? t.w : undefined, height: custom ? t.h : undefined, elements: els });
}

/** تصميم من قالب لأي مقاس (المقاسات المتطرفة تأخذ تخطيط شريط/عمودي ضيق تلقائياً) */
export function createFromTemplate(templateId: string | undefined, brand: Brand, brandId: string, target: SizeTarget, content: Content): Design {
  const t = targetSize(target);
  if (templateId?.startsWith("user:")) { // قالب محفوظ من المستخدم: الألوان رموز فيتكيّف مع الهوية
    const tpl = loadUserTemplateSync(templateId.slice(5)).design, base = DesignSchema.parse({ ...tpl, brand: brandId }), cur = designSize(base);
    return cur.w === t.w && cur.h === t.h ? base : resizeDesign(base, target);
  }
  const empty = DesignSchema.parse({ brand: brandId, format: t.format, width: t.format === "custom" ? t.w : undefined, height: t.format === "custom" ? t.h : undefined, elements: [] });
  if (!templateId) return empty;
  return { ...empty, elements: buildFromTemplate(templateId, brand, t.format, content, { w: t.w, h: t.h }) };
}

/** شرائح مجموعة (كاروسيل/دفعة) مرتّبة */
export async function listGroup(group: string): Promise<{ id: string; design: Design }[]> {
  const infos = (await listDesigns()).filter((d) => d.group === group);
  const items = await Promise.all(infos.map(async (i) => ({ id: i.id, design: await loadDesign(i.id) })));
  return items.sort((a, b) => (a.design.order ?? 0) - (b.design.order ?? 0) || a.id.localeCompare(b.id));
}

/** يعيد ترقيم المجموعة (order) وتحديث مؤشرات الكاروسيل 1/N وشريط التقدّم */
export async function renumberGroup(group: string): Promise<number> {
  const items = await listGroup(group); const n = items.length;
  for (let i = 0; i < n; i++) {
    let d: Design = { ...items[i].design, order: i };
    if (d.kind === "carousel") { const sz = designSize(d); d = repage(d, await loadBrand(d.brand), sz.w, sz.h, i, n); }
    await saveDesign(items[i].id, d);
  }
  return n;
}

export async function createCarousel(id: string, brandId: string, target: SizeTarget, content: CarouselContent): Promise<string[]> {
  const brand = await loadBrand(brandId), t = targetSize(target), group = safeId(id);
  if (!content.slides.length) throw new Error("أضف شريحة واحدة على الأقل");
  if (content.slides.length > 18) throw new Error("الحد الأقصى 18 شريحة");
  const pages = buildCarousel(brand, t.w, t.h, content), ids: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const sid = `${group}-${String(i + 1).padStart(2, "0")}`;
    await saveDesign(sid, DesignSchema.parse({ brand: brandId, format: t.format, width: t.format === "custom" ? t.w : undefined, height: t.format === "custom" ? t.h : undefined, elements: pages[i], group, order: i, kind: "carousel" }));
    ids.push(sid);
  }
  return ids;
}

/** توليد دفعة: صفوف محتوى × مقاسات → تصاميم من نفس القالب. الصف قد يحمل publish_date/status/caption/hashtags للتقويم */
export async function createBatch(name: string, brandId: string, templateId: string, targets: SizeTarget[], rows: (Content | BatchRow)[]): Promise<string[]> {
  if (!rows.length || !targets.length) throw new Error("أضف صفاً واحداً ومقاساً واحداً على الأقل");
  if (rows.length * targets.length > 200) throw new Error("الحد الأقصى 200 تصميم بالدفعة الواحدة (صفوف × مقاسات)");
  const brand = await loadBrand(brandId), group = safeId(name), ids: string[] = []; let order = 0;
  for (let r = 0; r < rows.length; r++) {
    const { publish_date, status, caption, hashtags, ...content } = rows[r] as BatchRow;
    for (const target of targets) {
      const t = targetSize(target), id = `${group}-${String(r + 1).padStart(2, "0")}-${t.format === "custom" ? `${t.w}x${t.h}` : t.format}`;
      const d = createFromTemplate(templateId, brand, brandId, target, { title: "", ...content } as Content);
      await saveDesign(id, { ...d, group, order: order++, kind: "batch",
        date: publish_date && /^\d{4}-\d{2}-\d{2}$/.test(publish_date) ? publish_date : undefined, status: (status as Design["status"]) ?? (publish_date ? "scheduled" : undefined), caption: caption || undefined,
        hashtags: hashtags ? hashtags.split(/\s+/).filter(Boolean) : undefined });
      ids.push(id);
    }
  }
  return ids;
}

/** نسخة من تصميم: بهوية أخرى ونصوص مترجمة (فهرس العنصر → النص) مع عكس التخطيط عند تغيّر الاتجاه */
export async function cloneDesign(id: string, newId: string, o: { brand?: string; texts?: Record<string, string>; mirror?: boolean; caption?: string; hashtags?: string[] } = {}): Promise<Design> {
  const d = await loadDesign(id);
  let els = d.elements.map((e, i) => (e.type === "text" && o.texts?.[String(i)] != null ? { ...e, text: o.texts[String(i)] } : e)) as Element[];
  if (o.mirror) els = mirror(els, designSize(d).w, ["pager", "track", "progress"]);
  const out: Design = { ...d, group: undefined, order: undefined, kind: undefined, brand: o.brand ?? d.brand, elements: els, caption: o.caption ?? d.caption, hashtags: o.hashtags ?? d.hashtags, status: "draft", date: undefined, time: undefined };
  return saveDesign(newId, out);
}
export const listTexts = (d: Design) => d.elements.flatMap((e, i) => (e.type === "text" ? [{ index: i, text: e.text, font: e.font, size: e.size }] : []));

/** يضبط حالة/موعد تصميم أو مجموعة كاملة (كاروسيل = منشور واحد) */
export async function setSchedule(target: { id?: string; group?: string }, v: { status?: Design["status"] | null; date?: string | null; time?: string | null }): Promise<string[]> {
  const ids = target.group ? (await listGroup(target.group)).map((x) => x.id) : target.id ? [target.id] : [];
  if (!ids.length) throw new Error("حدّد id أو group");
  for (const id of ids) { const d = await loadDesign(id); await saveDesign(id, { ...d, ...(v.status !== undefined ? { status: v.status ?? undefined } : {}), ...(v.date !== undefined ? { date: v.date ?? undefined } : {}), ...(v.time !== undefined ? { time: v.time ?? undefined } : {}) }); }
  return ids;
}
