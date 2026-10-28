import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const BRANDS_DIR = path.join(ROOT, "brands");
export const DESIGNS_DIR = path.join(ROOT, "designs");
export const EXPORTS_DIR = path.join(ROOT, "exports");
export const ASSETS_DIR = path.join(ROOT, "assets");
export const USER_TEMPLATES_DIR = path.join(ROOT, "user-templates");
export const PLUGINS_DIR = path.join(ROOT, "plugins");

/** مرجع ملف داخل بيانات إضافة: "plugin:<id>/<مسار نسبي>" → مسار مطلق آمن (داخل plugins/<id>/data فقط) */
export function pluginFile(ref: string): string | null {
  const m = ref.match(/^plugin:([a-z0-9-]+)\/(.+)$/);
  if (!m) return null;
  const base = path.join(PLUGINS_DIR, m[1], "data"), f = path.resolve(base, m[2]);
  return f.startsWith(base + path.sep) ? f : null;
}
