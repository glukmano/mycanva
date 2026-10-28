import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { USER_TEMPLATES_DIR } from "./paths.js";
import { DesignSchema, type Design } from "./types.js";

export interface UserTemplate { id: string; name: string; design: Design; created: number }
const safe = (id: string) => id.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "template";
const file = (id: string) => path.join(USER_TEMPLATES_DIR, `${safe(id)}.json`);

export async function listUserTemplates(): Promise<Omit<UserTemplate, "design">[]> {
  const names = (await fsp.readdir(USER_TEMPLATES_DIR).catch(() => [])).filter((n) => n.endsWith(".json"));
  const out = await Promise.all(names.map(async (n) => { try { const t = JSON.parse(await fsp.readFile(path.join(USER_TEMPLATES_DIR, n), "utf8")) as UserTemplate; return { id: t.id, name: t.name, created: t.created }; } catch { return null; } }));
  return out.filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.created - a.created);
}
export function loadUserTemplateSync(id: string): UserTemplate {
  try { return JSON.parse(fs.readFileSync(file(id), "utf8")); } catch { throw new Error(`قالب المستخدم غير موجود: ${id}`); }
}
/** يحفظ تصميماً كقالب. الألوان تبقى رموزاً (primary…) فيتكيّف القالب مع أي هوية */
export async function saveUserTemplate(name: string, design: Design): Promise<UserTemplate> {
  if (!name.trim()) throw new Error("اسم القالب مطلوب");
  const id = safe(name), clean = DesignSchema.parse({ ...design, group: undefined, order: undefined, kind: undefined, status: undefined, date: undefined, time: undefined, caption: undefined, hashtags: undefined });
  const t: UserTemplate = { id, name: name.trim(), design: clean, created: Date.now() };
  await fsp.mkdir(USER_TEMPLATES_DIR, { recursive: true }); await fsp.writeFile(file(id), JSON.stringify(t, null, 2));
  return t;
}
export async function deleteUserTemplate(id: string) { await fsp.unlink(file(id)); }
