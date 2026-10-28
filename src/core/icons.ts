import fs from "node:fs";
import { createRequire } from "node:module";
import { getIconData, iconToSVG, iconToHTML, replaceIDs } from "@iconify/utils";
import type { IconifyJSON } from "@iconify/types";

const require = createRequire(import.meta.url);
const sets = new Map<string, IconifyJSON>();

export function loadSet(prefix: string): IconifyJSON {
  let set = sets.get(prefix);
  if (!set) {
    set = JSON.parse(fs.readFileSync(require.resolve(`@iconify-json/${prefix}/icons.json`), "utf8")) as IconifyJSON;
    sets.set(prefix, set);
  }
  return set;
}

/** SVG جاهز بلون currentColor */
export function iconSvg(fullName: string, defaultSet: string, size: number, strokeWidth?: number): string {
  const [prefix, name] = fullName.includes(":") ? fullName.split(":") : [defaultSet, fullName];
  const data = getIconData(loadSet(prefix), name);
  if (!data) throw new Error(`الأيقونة غير موجودة: ${prefix}:${name}`);
  const r = iconToSVG(data, { height: size, width: size });
  let body = r.body;
  if (strokeWidth) body = body.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
  return iconToHTML(replaceIDs(body), r.attributes).replace(/<svg /, '<svg style="display:block" ');
}

export function searchIcons(query: string, prefixes = ["lucide", "tabler", "ph"], limit = 40): string[] {
  const q = query.toLowerCase().trim();
  const out: string[] = [];
  for (const p of prefixes) {
    const set = loadSet(p);
    const names = [...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})];
    const exact = names.filter((n) => n === q);
    const starts = names.filter((n) => n !== q && n.startsWith(q));
    const incl = names.filter((n) => !n.startsWith(q) && n.includes(q));
    for (const n of [...exact, ...starts, ...incl]) {
      out.push(`${p}:${n}`);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
