/** قارئ CSV بسيط (اقتباس، فواصل داخل الحقول، أسطر داخل الحقول، BOM) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  const t = text.replace(/^﻿/, "");
  const delim = (t.split("\n", 1)[0].match(/;/g)?.length ?? 0) > (t.split("\n", 1)[0].match(/,/g)?.length ?? 0) ? ";" : (t.split("\n", 1)[0].includes("\t") ? "\t" : ",");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const ALIASES: Record<string, string> = {
  title: "title", العنوان: "title", عنوان: "title", subtitle: "subtitle", "نص فرعي": "subtitle", "النص الفرعي": "subtitle", "العنوان الفرعي": "subtitle", "الوصف": "subtitle", description: "subtitle", فرعي: "subtitle", cta: "cta", button: "cta", "نص الزر": "cta", الزر: "cta",
  badge: "badge", شارة: "badge", icon: "icon", أيقونة: "icon", image: "image", صورة: "image", author: "author", name: "author", الاسم: "author", الكاتب: "author",
  items: "items", النقاط: "items", date: "date", التاريخ: "date", place: "place", المكان: "place", number: "number", الرقم: "number", qr: "qr", "رابط qr": "qr",
  publish_date: "publish_date", "publish date": "publish_date", "تاريخ النشر": "publish_date", status: "status", الحالة: "status", caption: "caption", الكابشن: "caption", hashtags: "hashtags", الهاشتاغات: "hashtags",
};
const STATUS: Record<string, string> = { draft: "draft", مسودة: "draft", approved: "approved", موافق: "approved", scheduled: "scheduled", مجدول: "scheduled", published: "published", منشور: "published" };

export interface BatchRow { title?: string; subtitle?: string; cta?: string; badge?: string; icon?: string; image?: string; author?: string; items?: string[]; date?: string; place?: string; number?: string; qr?: string; publish_date?: string; status?: string; caption?: string; hashtags?: string }

/** يحوّل CSV إلى صفوف دفعة. الأعمدة غير المعروفة تُتجاهل وتُذكر في warnings */
export function rowsFromCsv(text: string): { rows: BatchRow[]; warnings: string[]; headers: string[] } {
  const grid = parseCsv(text); if (grid.length < 2) throw new Error("الملف يحتاج سطر عناوين وصفاً واحداً على الأقل");
  const heads = grid[0].map((h) => h.trim()), keys = heads.map((h) => ALIASES[h.toLowerCase()] ?? ALIASES[h]), warnings: string[] = [];
  heads.forEach((h, i) => { if (!keys[i]) warnings.push(`عمود غير معروف تم تجاهله: "${h}"`); });
  const rows = grid.slice(1).map((r) => {
    const o: Record<string, unknown> = {};
    keys.forEach((k, i) => { const v = (r[i] ?? "").trim(); if (!k || !v) return; o[k] = k === "items" ? v.split(/[;؛\n]/).map((x) => x.trim()).filter(Boolean) : k === "status" ? (STATUS[v.toLowerCase()] ?? STATUS[v] ?? "draft") : v; });
    return o as BatchRow;
  }).filter((r) => Object.keys(r).length);
  const bad = rows.filter((r) => r.publish_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.publish_date)).length;
  if (bad) warnings.push(`${bad} صفوف تاريخها ليس بصيغة YYYY-MM-DD وسيُتجاهل`);
  return { rows, warnings, headers: heads };
}

/** رابط Google Sheet عام → رابط تصدير CSV. الجدول يجب أن يكون "Anyone with the link" */
export function sheetCsvUrl(raw: string): string {
  const u = new URL(raw); if (u.hostname !== "docs.google.com") throw new Error("الرابط يجب أن يكون من docs.google.com");
  const id = u.pathname.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1]; if (!id) throw new Error("رابط Google Sheet غير صالح");
  const gid = u.searchParams.get("gid") ?? u.hash.match(/gid=(\d+)/)?.[1] ?? "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
export async function fetchSheetCsv(raw: string): Promise<string> {
  const r = await fetch(sheetCsvUrl(raw), { redirect: "follow", signal: AbortSignal.timeout(12000) });
  const t = await r.text();
  if (!r.ok || /^\s*<(!doctype|html)/i.test(t)) throw new Error("تعذّر قراءة الجدول. اجعله «Anyone with the link: Viewer» أو انسخ محتواه كـ CSV");
  return t;
}
