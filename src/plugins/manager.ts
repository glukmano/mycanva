import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync, zipSync } from "fflate";
import sharp from "sharp";
import { z } from "zod";
import { listBrands, loadBrand } from "../core/brand.js";
import { cloneDesign, createFromTemplate, designSize, listDesigns, loadDesign, safeId, saveDesign, setSchedule } from "../core/designs.js";
import { assertPublicUrl, dominantColors } from "../core/extract.js";
import { ASSETS_DIR, PLUGINS_DIR, ROOT } from "../core/paths.js";
import { renderDesign } from "../core/render.js";
import { DesignSchema, ElementSchema, FORMATS } from "../core/types.js";
import { TEMPLATES } from "../templates/index.js";
import type { Template } from "../templates/common.js";

const rel = z.string().min(1).refine((p) => !p.startsWith("/") && !p.split(/[\\/]/).includes(".."), "المسار يجب أن يكون نسبياً بدون ..");
const SettingSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][\w]{0,40}$/), type: z.enum(["text", "textarea", "boolean", "number", "select", "password"]).default("text"),
  label: z.string(), label_ar: z.string().optional(), help: z.string().optional(), help_ar: z.string().optional(), default: z.unknown().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string(), label_ar: z.string().optional() })).optional(),
});
export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, "id: أحرف لاتينية صغيرة وأرقام وشرطات"), name: z.string().min(1), name_ar: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), description: z.string().default(""), description_ar: z.string().optional(),
  author: z.string().optional(), license: z.string().optional(), homepage: z.string().optional(),
  mycanva: z.string().regex(/^(>=)?\d+\.\d+\.\d+$/).optional().describe("أدنى إصدار مدعوم من التطبيق، مثل >=1.0.0"),
  main: rel.optional(), ui: z.object({ entry: rel, styles: z.array(rel).default([]) }).optional(), i18n: rel.optional(),
  toolPrefix: z.string().regex(/^[a-z][a-z0-9_]{0,20}$/).optional(),
  permissions: z.array(z.string()).default([]), settings: z.array(SettingSchema).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;
/** يقرأ manifest مع رسالة خطأ مقروءة (بدل JSON خام) */
function parseManifest(obj: unknown): Manifest {
  const r = ManifestSchema.safeParse(obj);
  if (r.success) return r.data;
  throw new Error("plugin.json غير صالح: " + r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join(" · "));
}

export interface RouteCtx { method: string; path: string; params: Record<string, string>; query: Record<string, string>; req: import("node:http").IncomingMessage; json: (limit?: number) => Promise<any>; buffer: (limit?: number) => Promise<Buffer> }
export type RouteHandler = (ctx: RouteCtx) => unknown | Promise<unknown>;
export interface RawReply { __raw: true; status: number; headers: Record<string, string>; body: Buffer | string }
export const raw = (body: Buffer | string, contentType: string, status = 200, headers: Record<string, string> = {}): RawReply => ({ __raw: true, status, headers: { "content-type": contentType, ...headers }, body });
export interface ToolReg { plugin: string; name: string; description: string; inputSchema: z.ZodRawShape; handler: (args: any) => unknown | Promise<unknown>; remoteSafe: boolean }
interface Reg { packHooks: (() => Promise<{ path: string; data: Uint8Array | Buffer }[]>)[]; templates: string[]; routes: { method: string; re: RegExp; keys: string[]; handler: RouteHandler }[]; tools: ToolReg[]; cleanup: (() => unknown)[] }
interface Rec { manifest: Manifest; dir: string; enabled: boolean; status: "active" | "disabled" | "error"; error?: string; reg: Reg; ver: number }
interface State { enabled: Record<string, boolean>; settings: Record<string, Record<string, unknown>> }

const APP_VERSION = (() => { try { return JSON.parse(fsSync.readFileSync(path.join(ROOT, "package.json"), "utf8")).version as string; } catch { return "1.0.0"; } })();
const cmp = (a: string, b: string) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const emptyReg = (): Reg => ({ packHooks: [], templates: [], routes: [], tools: [], cleanup: [] });
const STATE_FILE = path.join(PLUGINS_DIR, ".state.json");
const SKIP = new Set(["data", "node_modules", ".git", ".DS_Store"]);

class PluginManager {
  private recs = new Map<string, Rec>();
  private state: State = { enabled: {}, settings: {} };
  private counter = 0;

  /* ---------- الحالة ---------- */
  private async loadState() { try { this.state = { enabled: {}, settings: {}, ...JSON.parse(await fs.readFile(STATE_FILE, "utf8")) }; } catch { /* أول تشغيل */ } }
  private async saveState() { await fs.mkdir(PLUGINS_DIR, { recursive: true }); await fs.writeFile(STATE_FILE, JSON.stringify(this.state, null, 2), { mode: 0o600 }); }

  /* ---------- الاكتشاف والتحميل ---------- */
  async loadAll() {
    await fs.mkdir(PLUGINS_DIR, { recursive: true }); await this.loadState();
    for (const e of await fs.readdir(PLUGINS_DIR, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      await this.scan(e.name);
    }
    for (const rec of this.recs.values()) if (rec.enabled && rec.status !== "error") await this.activate(rec);
  }
  private async scan(dirName: string): Promise<Rec | null> {
    const dir = path.join(PLUGINS_DIR, dirName);
    try {
      const manifest = parseManifest(JSON.parse(await fs.readFile(path.join(dir, "plugin.json"), "utf8")));
      if (manifest.id !== dirName) throw new Error(`id (${manifest.id}) لا يطابق اسم المجلد (${dirName})`);
      const rec: Rec = { manifest, dir, enabled: this.state.enabled[manifest.id] ?? true, status: "disabled", reg: emptyReg(), ver: 0 };
      if (manifest.mycanva && cmp(APP_VERSION, manifest.mycanva.replace(">=", "")) < 0) { rec.status = "error"; rec.error = `تحتاج التطبيق ${manifest.mycanva} (الحالي ${APP_VERSION})`; }
      this.recs.set(manifest.id, rec); return rec;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; // مجلد بيانات متبقٍ بلا manifest
      console.error(`[plugins] ${dirName}: manifest غير صالح — ${(e as Error).message}`); return null;
    }
  }
  private async activate(rec: Rec) {
    await this.deactivate(rec); rec.reg = emptyReg(); rec.error = undefined; rec.ver = ++this.counter;
    try {
      if (rec.manifest.main) {
        const mod = await import(pathToFileURL(path.join(rec.dir, rec.manifest.main)).href + `?v=${rec.ver}`);
        if (typeof mod.activate !== "function") throw new Error("ملف main يجب أن يصدّر دالة activate(api)");
        await mod.activate(this.makeApi(rec));
      }
      rec.status = "active";
    } catch (e) {
      await this.deactivate(rec); rec.status = "error"; rec.error = (e as Error).message; console.error(`[plugin:${rec.manifest.id}] فشل التفعيل — ${rec.error}`);
    }
  }
  private async deactivate(rec: Rec) {
    for (const id of rec.reg.templates) delete TEMPLATES[id];
    for (const fn of rec.reg.cleanup.splice(0)) { try { await fn(); } catch { /* تجاهل */ } }
    rec.reg = emptyReg(); if (rec.status === "active") rec.status = "disabled";
  }

  /* ---------- الواجهة البرمجية التي تتسلّمها الإضافة ---------- */
  private makeApi(rec: Rec) {
    const { manifest: m } = rec, id = m.id, reg = rec.reg, dataDir = path.join(rec.dir, "data"); fsSync.mkdirSync(dataDir, { recursive: true });
    const prefix = m.toolPrefix ?? id.replace(/-/g, "_");
    return {
      id, version: m.version, dir: rec.dir, dataDir, appVersion: APP_VERSION, z, raw, log: (...a: unknown[]) => console.log(`[plugin:${id}]`, ...a),
      libs: { sharp },
      core: { listBrands, loadBrand, saveDesign, loadDesign, listDesigns, createFromTemplate, cloneDesign, setSchedule, safeId, designSize, renderDesign, assertPublicUrl, dominantColors, DesignSchema, ElementSchema, FORMATS, paths: { ASSETS_DIR, ROOT } },
      settings: { get: () => this.settingsOf(id), set: (patch: Record<string, unknown>) => this.setSettings(id, patch) },
      import: (r: string) => import(pathToFileURL(path.resolve(rec.dir, r)).href + `?v=${rec.ver}`), // استيراد نسخة جديدة عند إعادة التحميل
      registerTemplate: (t: Omit<Template, "id" | "plugin"> & { id: string }) => { const full = `${id}:${t.id}`; TEMPLATES[full] = { ...t, id: full, plugin: id, fields: t.fields ?? [] }; reg.templates.push(full); },
      registerRoute: (method: string, pattern: string, handler: RouteHandler) => {
        const keys: string[] = [], re = new RegExp("^" + pattern.replace(/\/:(\w+)/g, (_, k) => (keys.push(k), "/([^/]+)")) + "/?$");
        reg.routes.push({ method: method.toUpperCase(), re, keys, handler });
      },
      registerMcpTool: (name: string, cfg: { description: string; inputSchema?: z.ZodRawShape; remoteSafe?: boolean }, handler: (a: any) => unknown) => {
        reg.tools.push({ plugin: id, name: `${prefix}_${name}`, description: `[${m.name}] ${cfg.description}`, inputSchema: cfg.inputSchema ?? {}, handler, remoteSafe: !!cfg.remoteSafe });
      },
      onDeactivate: (fn: () => unknown) => reg.cleanup.push(fn),
      /** ملفات إضافية تُضمَّن بحزمة zip عند «تصدير مع البيانات» (مسارها داخل الحزمة، مثل assets/bundled/x.png) */
      onPack: (fn: () => Promise<{ path: string; data: Uint8Array | Buffer }[]>) => reg.packHooks.push(fn),
    };
  }

  /* ---------- الإعدادات ---------- */
  settingsOf(id: string): Record<string, unknown> {
    const rec = this.recs.get(id); if (!rec) return {};
    const out: Record<string, unknown> = {}; for (const s of rec.manifest.settings) out[s.key] = this.state.settings[id]?.[s.key] ?? s.default ?? (s.type === "boolean" ? false : "");
    return out;
  }
  /** قيم الإعدادات للواجهة: كلمات السر لا تُرسل أبداً (تُرسل "__set__" إن كانت محفوظة) */
  private publicValues(r: Rec) { const v = this.settingsOf(r.manifest.id); for (const s of r.manifest.settings) if (s.type === "password") v[s.key] = v[s.key] ? "__set__" : ""; return v; }
  async setSettings(id: string, patch: Record<string, unknown>) {
    const rec = this.must(id), cur = { ...(this.state.settings[id] ?? {}) };
    for (const s of rec.manifest.settings) if (s.key in patch) { let v = patch[s.key]; if (s.type === "password") { if (v === "__set__") continue; if (v === "__clear__") v = ""; } cur[s.key] = s.type === "boolean" ? !!v : s.type === "number" ? Number(v) : String(v ?? ""); }
    this.state.settings[id] = cur; await this.saveState(); return this.settingsOf(id);
  }

  /* ---------- الإدارة ---------- */
  private must(id: string): Rec { const r = this.recs.get(id); if (!r) throw new Error(`الإضافة غير موجودة: ${id}`); return r; }
  async enable(id: string) { const r = this.must(id); this.state.enabled[id] = true; r.enabled = true; await this.saveState(); if (r.status !== "error" || !r.error?.startsWith("تحتاج")) await this.activate(r); return this.info(r); }
  async disable(id: string) { const r = this.must(id); this.state.enabled[id] = false; r.enabled = false; await this.saveState(); await this.deactivate(r); r.status = "disabled"; r.error = undefined; return this.info(r); }
  async reload(id: string) { const old = this.must(id); await this.deactivate(old); this.recs.delete(id); const r = await this.scan(id); if (!r) throw new Error("manifest غير صالح بعد إعادة التحميل"); if (r.enabled && r.status !== "error") await this.activate(r); return this.info(r); }
  async uninstall(id: string, removeData = false) {
    const r = this.must(id); await this.deactivate(r); this.recs.delete(id);
    for (const e of await fs.readdir(r.dir)) if (removeData || e !== "data") await fs.rm(path.join(r.dir, e), { recursive: true, force: true });
    if (removeData) await fs.rm(r.dir, { recursive: true, force: true });
    delete this.state.enabled[id]; if (removeData) delete this.state.settings[id]; await this.saveState();
  }

  /* ---------- التثبيت والتحزيم ---------- */
  private async finishInstall(id: string, update: boolean) {
    const old = this.recs.get(id); if (old) { await this.deactivate(old); this.recs.delete(id); }
    if (!update || this.state.enabled[id] === undefined) this.state.enabled[id] = false; // الإضافة الجديدة تبدأ معطّلة حتى يوافق المستخدم
    await this.saveState(); const r = await this.scan(id); if (!r) throw new Error("manifest غير صالح"); if (r.enabled && r.status !== "error") await this.activate(r); return this.info(r);
  }
  async installZip(buf: Uint8Array) {
    let files: Record<string, Uint8Array>; let total = 0;
    try { files = unzipSync(buf, { filter: (f) => { total += f.originalSize; if (total > 40_000_000) throw new Error("الحزمة كبيرة جداً (> 40MB)"); return !f.name.endsWith("/"); } }); } catch (e) { throw new Error(`ملف zip غير صالح: ${(e as Error).message}`); }
    const names = Object.keys(files), mf = names.filter((n) => /(^|\/)plugin\.json$/.test(n)).sort((a, b) => a.length - b.length)[0];
    if (!mf) throw new Error("لا يوجد plugin.json داخل الحزمة");
    const prefix = mf.slice(0, mf.length - "plugin.json".length), manifest = parseManifest(JSON.parse(strFromU8(files[mf])));
    const target = path.join(PLUGINS_DIR, manifest.id), existed = fsSync.existsSync(path.join(target, "plugin.json"));
    if (existed) for (const e of await fs.readdir(target)) if (e !== "data") await fs.rm(path.join(target, e), { recursive: true, force: true }); // تحديث: نحافظ على data
    for (const n of names) {
      if (!n.startsWith(prefix)) continue; const r = n.slice(prefix.length), parts = r.split("/");
      if (parts.some((p) => p === ".." || p === "") || SKIP.has(parts[0])) continue;
      const out = path.resolve(target, r); if (!out.startsWith(target + path.sep)) continue;
      await fs.mkdir(path.dirname(out), { recursive: true }); await fs.writeFile(out, files[n]);
    }
    return this.finishInstall(manifest.id, existed);
  }
  async installDir(src: string) {
    const abs = path.resolve(src), manifest = parseManifest(JSON.parse(await fs.readFile(path.join(abs, "plugin.json"), "utf8").catch(() => { throw new Error("لا يوجد plugin.json بهذا المجلد"); })));
    const target = path.join(PLUGINS_DIR, manifest.id); if (abs === target) throw new Error("المجلد هو المثبّت بالفعل");
    const existed = fsSync.existsSync(path.join(target, "plugin.json"));
    if (existed) for (const e of await fs.readdir(target)) if (e !== "data") await fs.rm(path.join(target, e), { recursive: true, force: true });
    await fs.cp(abs, target, { recursive: true, filter: (s) => !SKIP.has(path.basename(s)) });
    return this.finishInstall(manifest.id, existed);
  }
  async pack(id: string, bundle = false): Promise<Uint8Array> {
    const r = this.must(id), files: Record<string, Uint8Array> = {};
    const walk = async (d: string, base: string) => { for (const e of await fs.readdir(d, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const p = path.join(d, e.name), k = base + e.name; if (e.isDirectory()) await walk(p, k + "/"); else files[`${id}/${k}`] = new Uint8Array(await fs.readFile(p)); } };
    await walk(r.dir, "");
    if (bundle) for (const hook of r.reg.packHooks) for (const f of await hook()) { const rel = f.path.replace(/^\/+/, ""); if (rel.split("/").includes("..")) continue; files[`${id}/${rel}`] = new Uint8Array(f.data); }
    return zipSync(files, { level: 6 });
  }

  /* ---------- الاستعلام ---------- */
  info(r: Rec) {
    const m = r.manifest;
    return { id: m.id, name: m.name, name_ar: m.name_ar, version: m.version, description: m.description, description_ar: m.description_ar, author: m.author, license: m.license, homepage: m.homepage, permissions: m.permissions,
      enabled: r.enabled, status: r.status, error: r.error, hasUi: !!m.ui, hasBackend: !!m.main, settings: m.settings, values: this.publicValues(r),
      canBundle: r.reg.packHooks.length > 0, tools: r.reg.tools.map((t) => t.name), templates: r.reg.templates, routes: r.reg.routes.length };
  }
  list() { return [...this.recs.values()].map((r) => this.info(r)).sort((a, b) => a.name.localeCompare(b.name)); }
  get(id: string) { return this.recs.get(id); }
  mcpTools(): ToolReg[] { return [...this.recs.values()].filter((r) => r.status === "active").flatMap((r) => r.reg.tools); }
  async uiEntries() {
    const out = [];
    for (const r of this.recs.values()) {
      if (r.status !== "active" || !r.manifest.ui) continue;
      const m = r.manifest, ver = `${m.version}.${(await fs.stat(path.join(r.dir, m.ui!.entry)).catch(() => ({ mtimeMs: 0 }))).mtimeMs | 0}`;
      let dict: unknown; if (m.i18n) { try { dict = JSON.parse(await fs.readFile(path.join(r.dir, m.i18n), "utf8")); } catch { /* بدون ترجمة */ } }
      out.push({ id: m.id, name: m.name, name_ar: m.name_ar, entry: `/plugins/${m.id}/${m.ui!.entry}?v=${ver}`, styles: m.ui!.styles.map((s) => `/plugins/${m.id}/${s}?v=${ver}`), i18n: dict });
    }
    return out;
  }
  /** مسار ملف ثابت للواجهة (ui/ و assets/ فقط) من إضافة مفعّلة */
  staticFile(id: string, relPath: string): string | null {
    const r = this.recs.get(id); if (!r || r.status !== "active") return null;
    const clean = path.posix.normalize("/" + relPath).slice(1), top = clean.split("/")[0];
    if (!["ui", "assets", "public"].includes(top)) return null;
    const f = path.resolve(r.dir, clean); return f.startsWith(r.dir + path.sep) ? f : null;
  }
  findRoute(id: string, method: string, p: string) {
    const r = this.recs.get(id); if (!r || r.status !== "active") return null;
    for (const rt of r.reg.routes) { if (rt.method !== method) continue; const m = p.match(rt.re); if (m) return { handler: rt.handler, params: Object.fromEntries(rt.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; }
    return null;
  }
}
export const plugins = new PluginManager();
export const isPluginId = (s: string) => /^[a-z][a-z0-9-]{1,40}$/.test(s);
export { safeId };
