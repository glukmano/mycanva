import fs from "node:fs/promises";
import path from "node:path";
import { allNames, lookup, norm } from "./teams.js";

const slugify = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "logo";

/** مكتبة الشعارات: ملفات PNG مصغّرة + فهرس (أسماء بديلة، ألوان الفريق، مصدر كل شعار) */
export async function createLogos(api) {
  const dir = path.join(api.dataDir, "logos"), indexFile = path.join(api.dataDir, "logos.json"), sharp = api.libs.sharp;
  await fs.mkdir(dir, { recursive: true });
  let items = [];
  try { items = JSON.parse(await fs.readFile(indexFile, "utf8")).logos ?? []; } catch { /* مكتبة جديدة */ }
  const save = () => fs.writeFile(indexFile, JSON.stringify({ logos: items }, null, 2));

  const keysOf = (it) => new Set(it.names.map(norm).filter(Boolean));
  /** يبحث عن شعار باسم (أي لغة/مرادف). يعيد المدخل أو null */
  const find = (name) => {
    if (!name || !String(name).trim()) return null;
    const want = new Set(allNames(name).map(norm).filter(Boolean));
    return items.find((it) => { const have = keysOf(it); for (const k of want) if (have.has(k)) return true; return false; }) ?? null;
  };

  async function add({ name, buf, source = "upload", kind, colors, meta = {} }) {
    const e = lookup(name), canonical = e?.en ?? String(name).trim();
    if (!canonical) throw new Error("اسم الفريق مطلوب");
    let img = sharp(buf, { density: 200 }).rotate();
    try { img = sharp(await img.trim({ threshold: 8 }).toBuffer()); } catch { img = sharp(buf, { density: 200 }).rotate(); } // قصّ الهوامش الشفافة إن أمكن
    const png = await img.resize(256, 256, { fit: "inside", withoutEnlargement: false, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const slug = slugify(canonical), file = `${slug}.png`;
    await fs.writeFile(path.join(dir, file), png);
    let cols = colors;
    if (!cols?.length) { try { cols = (await api.core.dominantColors(png, 5)).filter((c) => c.share > 0.04).slice(0, 2).map((c) => c.color); } catch { cols = []; } }
    const entry = { slug, name: canonical, names: [...new Set([canonical, ...(e ? [e.ar, ...e.aliases] : []), ...(meta.names ?? [])].filter(Boolean))], file, source, kind: kind ?? e?.kind ?? "team", colors: cols ?? [], added: Date.now(), ...(meta.info ? { info: meta.info } : {}) };
    const i = items.findIndex((x) => x.slug === slug); if (i >= 0) items[i] = { ...items[i], ...entry, names: [...new Set([...items[i].names, ...entry.names])] }; else items.push(entry);
    await save(); return items.find((x) => x.slug === slug);
  }
  /** استيراد شعار جاهز من حزمة (بدون إعادة معالجة). لا يستبدل شعاراً موجوداً بنفس الاسم */
  async function importEntry(e, buf) {
    if (items.some((x) => x.slug === e.slug)) return false;
    await fs.writeFile(path.join(dir, `${slugify(e.slug)}.png`), buf);
    items.push({ slug: slugify(e.slug), name: e.name, names: e.names ?? [e.name], file: `${slugify(e.slug)}.png`, source: e.source ?? "bundled", kind: e.kind ?? "team", colors: e.colors ?? [], added: Date.now() });
    await save(); return true;
  }
  async function remove(slug) { const it = items.find((x) => x.slug === slug); if (!it) throw new Error("الشعار غير موجود"); items = items.filter((x) => x.slug !== slug); await fs.rm(path.join(dir, it.file), { force: true }); await save(); }
  async function update(slug, patch) {
    const it = items.find((x) => x.slug === slug); if (!it) throw new Error("الشعار غير موجود");
    if (Array.isArray(patch.names)) it.names = [...new Set([it.name, ...patch.names.map((s) => String(s).trim()).filter(Boolean)])];
    if (Array.isArray(patch.colors)) it.colors = patch.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 2);
    await save(); return it;
  }
  return {
    list: () => items.map(({ slug, name, names, file, source, kind, colors, added }) => ({ slug, name, names, file, source, kind, colors, added })).sort((a, b) => a.name.localeCompare(b.name)),
    find, add, remove, update, importEntry, dir, file: (slug) => path.join(dir, slugify(slug) + ".png"),
    /** مرجع جاهز لعنصر image بالتصميم */
    ref: (it) => (it ? `plugin:${api.id}/logos/${it.file}` : null),
  };
}
