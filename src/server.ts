import fs from "node:fs/promises";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { brandDir, createBrand, listBrands, loadBrand, saveBrand } from "./core/brand.js";
import { cloneDesign, listTexts, setSchedule, createBatch, createCarousel, createFromTemplate, deleteDesign, listDesigns, loadDesign, renumberGroup, resizeDesign, safeId, saveDesign } from "./core/designs.js";
import { exportDesigns } from "./core/exporter.js";
import { lintDesign } from "./core/lint.js";
import { dominantColors, suggestFromColors, suggestFromUrl, assertPublicUrl } from "./core/extract.js";
import { renderVideo } from "./core/video.js";
import { deleteUserTemplate, listUserTemplates, saveUserTemplate } from "./core/usertemplates.js";
import { fetchSheetCsv, rowsFromCsv } from "./core/csv.js";
import { cropAsset, generateImage, importStock, removeBackground, searchStock } from "./core/images.js";
import { QR_TYPES } from "./core/qr.js";
import { buildQr } from "./core/qrtool.js";
import { keyStatus, setKeys, availableProviders, findBinary, getSettings, recentActivity, clientsSeen, recordActivity, regenerateToken, setCustomUrl, startTunnel, stopTunnel, tokenMatches, tunnelState } from "./settings.js";
import { availableFonts, fontsCssFor } from "./core/fonts.js";
import { iconSvg, searchIcons } from "./core/icons.js";
import { checkContrast, generatePalette } from "./core/palette.js";
import { ASSETS_DIR, EXPORTS_DIR, ROOT } from "./core/paths.js";
import { chromium } from "playwright";
import { closeBrowser, designToHtml, renderDesign } from "./core/render.js";
import { DesignSchema, FORMATS, SIZE_LIMITS } from "./core/types.js";
import { buildServer } from "./mcp/build.js";
import { plugins } from "./plugins/manager.js";
import fsSync from "node:fs";
import { TEMPLATES } from "./templates/index.js";

const PORT = Number(process.env.PORT ?? 3333);
const UI_DIR = path.join(ROOT, "src/ui");
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".json": "application/json" };
const IMG_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]);

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function readBody(req: IncomingMessage, limit = 30 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw new HttpError(413, "الملف كبير"); chunks.push(c as Buffer); }
  return Buffer.concat(chunks);
}
const readJson = async (req: IncomingMessage) => { const b = await readBody(req, 12 * 1024 * 1024); return b.length ? JSON.parse(b.toString()) : {}; };
const json = (res: ServerResponse, data: unknown, status = 200) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(data)); };

async function serveFile(res: ServerResponse, root: string, rel: string) {
  const file = path.resolve(root, "." + path.posix.normalize("/" + rel));
  if (!file.startsWith(root + path.sep)) throw new HttpError(403, "ممنوع");
  try {
    const buf = await fs.readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" }).end(buf);
  } catch { throw new HttpError(404, "غير موجود"); }
}

async function handleMcp(req: IncomingMessage, res: ServerResponse, remote: boolean) {
  const t0 = Date.now(), raw = (await readBody(req, 12 * 1024 * 1024)).toString();
  let parsed: unknown; try { parsed = raw ? JSON.parse(raw) : undefined; } catch {}
  const msgs = (Array.isArray(parsed) ? parsed : parsed ? [parsed] : []) as { method?: string; params?: { name?: string; clientInfo?: { name?: string; version?: string } } }[];
  const init = msgs.find((m) => m.method === "initialize")?.params?.clientInfo;
  const client = init?.name ? `${init.name}${init.version ? " " + init.version : ""}` : /^Mozilla/.test(String(req.headers["user-agent"])) ? "المتصفح (اختبار من الواجهة)" : String(req.headers["user-agent"] ?? "غير معروف").slice(0, 60);
  const server = buildServer({ remote });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close(); server.close();
    for (const m of msgs) if (m.method && m.method !== "ping" && !m.method.startsWith("notifications/")) recordActivity({ t: t0, client, remote, method: m.method, tool: m.method === "tools/call" ? m.params?.name : undefined, status: res.statusCode, ms: Date.now() - t0 });
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsed);
}

async function statusInfo() {
  const [st, brands, designs] = await Promise.all([getSettings(), listBrands(), listDesigns()]);
  const tools = Object.keys((buildServer() as unknown as { _registeredTools: object })._registeredTools);
  let chromiumOk = false; try { chromiumOk = fsSync.existsSync(chromium.executablePath()); } catch {}
  const tun = tunnelState(), base = tun.url ?? st.customUrl;
  const pkg = JSON.parse(fsSync.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return {
    version: pkg.version, uptime: Math.round(process.uptime()), pid: process.pid, port: PORT, node: process.version,
    chromium: chromiumOk, brands: brands.length, designs: designs.length, tools,
    mcp: { local: `http://127.0.0.1:${PORT}/mcp`, remote: base ? `${base}/mcp/${st.token}` : null, token: st.token, customUrl: st.customUrl ?? null },
    stdio: { command: process.execPath, args: ["--import", path.join(ROOT, "node_modules/tsx/dist/esm/index.mjs"), path.join(ROOT, "src/mcp/index.ts")], root: ROOT },
    tunnel: { ...tun, available: availableProviders() },
    plugins: plugins.list().map((p) => ({ id: p.id, enabled: p.enabled, status: p.status })), keys: await keyStatus(), ffmpeg: !!findBinary("ffmpeg"),
    clients: clientsSeen(), activity: recentActivity(40),
  };
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL) {
  const m = req.method ?? "GET";
  const seg = url.pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent); // بعد "api"
  const [a, b, c] = seg;

  if (a === "meta" && m === "GET") {
    const ut = await listUserTemplates(), pl = await plugins.uiEntries();
    return json(res, { qrTypes: QR_TYPES, templates: Object.values(TEMPLATES).filter((t) => !t.hidden).map((t) => ({ id: t.id, label: t.label, fields: t.fields })), plugins: pl, formats: FORMATS, limits: SIZE_LIMITS, fonts: availableFonts, userTemplates: ut.map((t) => ({ id: "user:" + t.id, label: t.name, fields: [], user: true })) });
  }

  if (a === "brands") {
    if (!b && m === "GET") {
      const ids = await listBrands();
      return json(res, await Promise.all(ids.map(async (id) => ({ id, brand: await loadBrand(id).catch(() => null) }))));
    }
    if (!b && m === "POST") {
      const body = await readJson(req);
      body.id = safeId(body.id ?? body.name ?? "brand");
      const brand = await createBrand(body);
      return json(res, { id: body.id, brand, contrastWarnings: checkContrast(brand.colors) });
    }
    if (b && !c && m === "GET") return json(res, await loadBrand(b));
    if (b && c === "logo" && m === "POST") { // ?variant=default|light&ext=png
      const variant = url.searchParams.get("variant") === "light" ? "light" : "default";
      const ext = "." + (url.searchParams.get("ext") ?? "png").replace(/[^a-z]/gi, "").toLowerCase();
      if (!IMG_EXT.has(ext)) throw new HttpError(400, "نوع ملف غير مدعوم");
      const brand = await loadBrand(b);
      const name = `logo${variant === "light" ? "-light" : ""}${ext}`;
      await fs.writeFile(path.join(brandDir(b), name), await readBody(req));
      brand.logo[variant] = name;
      await saveBrand(b, brand);
      return json(res, brand);
    }
  }
  if (a === "brand-file" && b && c && m === "GET") return serveFile(res, brandDir(b), c);

  if (a === "palette" && m === "GET") {
    const colors = generatePalette(url.searchParams.get("primary") ?? "#1E6FD9", { dark: url.searchParams.get("dark") === "1" });
    return json(res, { colors, contrastWarnings: checkContrast(colors) });
  }

  if (a === "designs") {
    if (!b && m === "GET") return json(res, await listDesigns());
    if (!b && m === "POST") { // إنشاء من قالب
      const x = await readJson(req);
      const brand = await loadBrand(x.brand);
      const id = safeId(x.id || `${x.brand}-${x.template ?? "blank"}-${Date.now().toString(36)}`);
      const d = await saveDesign(id, createFromTemplate(x.template || undefined, brand, x.brand, { format: x.format ?? "post", width: x.width, height: x.height }, x.content ?? { title: "" }));
      return json(res, { id, design: d });
    }
    if (b && !c && m === "GET") return json(res, await loadDesign(b));
    if (b && !c && m === "PUT") return json(res, await saveDesign(b, await readJson(req)));
    if (b && !c && m === "DELETE") { const g = (await loadDesign(b).catch(() => null))?.group; await deleteDesign(b); if (g) await renumberGroup(g); return json(res, { ok: true }); }
    if (b && c === "resize" && m === "POST") {
      const x = await readJson(req);
      const id = safeId(x.newId || `${b}-${x.format ?? `${x.width}x${x.height}`}`);
      await saveDesign(id, resizeDesign(await loadDesign(b), x));
      return json(res, { id });
    }
  }

  if (a === "resize" && m === "POST") { // تحجيم بدون حفظ (للتعديل في نفس التصميم)
    const x = await readJson(req);
    return json(res, resizeDesign(DesignSchema.parse(x.design), x.target));
  }
  if (a === "html" && m === "POST") { // معاينة تصميم غير محفوظ
    const { design, animate } = await readJson(req);
    const origin = `http://${req.headers.host}`;
    const r = await designToHtml(DesignSchema.parse(design), { fontsUrl: `${origin}/api/fonts.css`, animate: !!animate });
    return void res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(r.html);
  }
  if (a === "fonts.css") return void res.writeHead(200, { "content-type": "text/css", "cache-control": "max-age=86400" }).end(fontsCssFor(url.searchParams.get("f") ?? ""));

  if (a === "render" && m === "POST") {
    const x = await readJson(req);
    const type = x.type === "jpeg" ? "jpeg" : "png";
    const name = safeId(x.name ?? "design");
    const out = path.join(EXPORTS_DIR, `${name}.${type === "jpeg" ? "jpg" : "png"}`);
    const r = await renderDesign(DesignSchema.parse(x.design), { out, type, scale: Math.min(3, Math.max(1, Number(x.scale ?? 2))) });
    return json(res, { url: `/exports/${path.basename(out)}`, width: r.width, height: r.height, warnings: r.warnings });
  }

  if (a === "icons" && m === "GET") return json(res, searchIcons(url.searchParams.get("q") ?? "", undefined, 60));
  if (a === "icon" && m === "GET") {
    const svg = iconSvg(url.searchParams.get("name") ?? "", "lucide", 48);
    return void res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=86400" }).end(svg);
  }

  if (a === "plugins") {
    if (!b && m === "GET") return json(res, plugins.list());
    if (b === "install" && m === "POST") {
      if ((req.headers["content-type"] ?? "").includes("json")) return json(res, await plugins.installDir((await readJson(req)).path));
      return json(res, await plugins.installZip(new Uint8Array(await readBody(req, 45 * 1024 * 1024))));
    }
    if (b && c === "enable" && m === "POST") return json(res, await plugins.enable(b));
    if (b && c === "disable" && m === "POST") return json(res, await plugins.disable(b));
    if (b && c === "reload" && m === "POST") return json(res, await plugins.reload(b));
    if (b && c === "settings") { if (m === "GET") return json(res, plugins.info(plugins.get(b)!).values); if (m === "POST") { await plugins.setSettings(b, await readJson(req)); return json(res, plugins.info(plugins.get(b)!).values); } }
    if (b && c === "pack" && m === "GET") { const z = Buffer.from(await plugins.pack(b, url.searchParams.get("bundle") === "1")); return void res.writeHead(200, { "content-type": "application/zip", "content-disposition": `attachment; filename="${b}${url.searchParams.get("bundle") === "1" ? "-with-data" : ""}.zip"` }).end(z); }
    if (b && !c && m === "DELETE") { await plugins.uninstall(b, url.searchParams.get("data") === "1"); return json(res, { ok: true }); }
  }
  if (a === "p" && b) { // مسارات الإضافات: /api/p/<id>/<path>
    const sub = "/" + seg.slice(2).join("/"), rt = plugins.findRoute(b, m, sub);
    if (!rt) throw new HttpError(404, "مسار الإضافة غير موجود أو الإضافة معطّلة");
    let out: unknown;
    try { out = await rt.handler({ method: m, path: sub, params: rt.params, query: Object.fromEntries(url.searchParams), req, json: async (l) => { const bf = await readBody(req, l ?? 12 * 1024 * 1024); return bf.length ? JSON.parse(bf.toString()) : {}; }, buffer: (l) => readBody(req, l ?? 30 * 1024 * 1024) }); }
    catch (e) { throw new HttpError((e as { status?: number }).status ?? 400, e instanceof Error ? e.message : String(e)); }
    const r = out as { __raw?: boolean; status: number; headers: Record<string, string>; body: Buffer | string } | undefined;
    if (r?.__raw) return void res.writeHead(r.status, r.headers).end(r.body);
    return json(res, out ?? { ok: true });
  }

  if (a === "status" && m === "GET") return json(res, await statusInfo());
  if (a === "settings") {
    if (b === "token" && m === "POST") return json(res, { token: await regenerateToken() });
    if (b === "keys" && m === "POST") { const x = await readJson(req); await setKeys({ pexels: x.pexels, openai: x.openai, imageModel: x.imageModel }); return json(res, await keyStatus()); }
    if (b === "custom-url" && m === "POST") return json(res, { url: await setCustomUrl((await readJson(req)).url) });
  }
  if (a === "tunnel" && m === "POST") {
    if (b === "stop") return json(res, stopTunnel());
    if (b === "start") { const p = (await readJson(req)).provider; if (p !== "ngrok" && p !== "cloudflared") throw new HttpError(400, "مزوّد غير معروف"); return json(res, await startTunnel(p, PORT)); }
  }
  if (a === "export" && m === "POST") {
    const x = await readJson(req);
    const ids: string[] = x.ids ?? (x.group ? (await listDesigns()).filter((d) => d.group === x.group).sort((p, q) => (p.order ?? 0) - (q.order ?? 0)).map((d) => d.id) : []);
    if (ids.length > 220) throw new HttpError(400, "الحد الأقصى 220 تصميم");
    return json(res, await exportDesigns(ids, { name: x.name ?? x.group ?? "export", type: ["png", "jpeg", "pdf"].includes(x.type) ? x.type : "png", zip: x.zip }));
  }
  if (a === "batch" && m === "POST") {
    const x = await readJson(req);
    const ids = await createBatch(x.name || `batch-${Date.now().toString(36)}`, x.brand, x.template, x.formats ?? [{ format: "post" }], x.rows ?? []);
    return json(res, { group: safeId(x.name || ""), ids });
  }
  if (a === "carousel" && m === "POST") {
    if (b && c === "renumber") return json(res, { slides: await renumberGroup(b) });
    const x = await readJson(req);
    const id = x.id?.trim() || `carousel-${Date.now().toString(36)}`;
    return json(res, { group: safeId(id), ids: await createCarousel(id, x.brand, { format: x.format ?? "post", width: x.width, height: x.height }, { cover: x.cover, slides: x.slides, outro: x.outro }) });
  }
  if (a === "groups" && b && c === "renumber" && m === "POST") return json(res, { slides: await renumberGroup(b) });
  if (a === "qr" && m === "POST") {
    const spec = await readJson(req); const r = await buildQr(spec);
    if (b === "png") return void res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }).end(await r.png());
    return json(res, { svg: r.svg, warnings: r.warnings, payload: r.payload, modules: r.modules });
  }

  if (a === "lint" && m === "POST") { const { design } = await readJson(req); const d = DesignSchema.parse(design); return json(res, lintDesign(d, await loadBrand(d.brand))); }
  if (a === "brand-extract" && m === "POST") {
    if (b === "image") { const buf = await readBody(req, 8 * 1024 * 1024); const f = await dominantColors(buf); if (!f.length) throw new HttpError(400, "لم أستطع قراءة ألوان الصورة"); return json(res, suggestFromColors(f)); }
    const x = await readJson(req); if (!x.url) throw new HttpError(400, "الرابط مطلوب"); return json(res, await suggestFromUrl(x.url));
  }
  if (a === "brands" && b && c === "logo-url" && m === "POST") {
    const u = assertPublicUrl((await readJson(req)).url); const r = await fetch(u, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new HttpError(400, "تعذّر تنزيل الشعار");
    const ct = r.headers.get("content-type") ?? "", ext = ct.includes("svg") ? ".svg" : ct.includes("png") ? ".png" : ct.includes("webp") ? ".webp" : ct.includes("jpeg") ? ".jpg" : u.pathname.endsWith(".ico") ? ".png" : ".png";
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 3_000_000) throw new HttpError(413, "الملف كبير");
    const out = ct.includes("icon") ? await (await import("sharp")).default(buf).png().toBuffer() : buf; // favicon → PNG
    const brand = await loadBrand(b); const name = `logo${ext}`; await fs.writeFile(path.join(brandDir(b), name), out); brand.logo.default = name; await saveBrand(b, brand); return json(res, brand);
  }
  if (a === "video" && m === "POST") {
    const x = await readJson(req); const format = x.format === "gif" ? "gif" : "mp4", name = safeId(x.name ?? "story");
    const out = path.join(EXPORTS_DIR, `${name}.${format}`); const r = await renderVideo(DesignSchema.parse(x.design), { out, format, fps: x.fps });
    return json(res, { url: `/exports/${name}.${format}`, ...r });
  }
  if (a === "user-templates") {
    if (m === "GET") return json(res, await listUserTemplates());
    if (m === "POST") { const x = await readJson(req); const t = await saveUserTemplate(x.name ?? "", DesignSchema.parse(x.design)); return json(res, { id: "user:" + t.id }); }
    if (m === "DELETE" && b) { await deleteUserTemplate(b); return json(res, { ok: true }); }
  }
  if (a === "designs" && b && c === "clone" && m === "POST") { const x = await readJson(req); const id = safeId(x.newId || `${b}-copy`); const d = await cloneDesign(b, id, x); return json(res, { id, design: d }); }
  if (a === "designs" && b && c === "texts" && m === "GET") return json(res, listTexts(await loadDesign(b)));
  if (a === "schedule" && m === "POST") { const x = await readJson(req); return json(res, { ids: await setSchedule({ id: x.id, group: x.group }, { status: x.status, date: x.date, time: x.time }) }); }
  if (a === "csv-parse" && m === "POST") { const x = await readJson(req); const text = x.sheetUrl ? await fetchSheetCsv(x.sheetUrl) : String(x.csv ?? ""); return json(res, rowsFromCsv(text)); }
  if (a === "stock") {
    if (m === "GET") return json(res, await searchStock(url.searchParams.get("q") ?? "", Number(url.searchParams.get("page") ?? 1)));
    if (m === "POST" && b === "import") { const x = await readJson(req); return json(res, { name: await importStock(x.url, x.name) }); }
  }
  if (a === "ai-image" && m === "POST") { const x = await readJson(req); return json(res, { name: await generateImage(x.prompt, x.size) }); }
  if (a === "remove-bg" && m === "POST") { const x = await readJson(req); return json(res, { name: await removeBackground(x.asset, Number(x.tolerance ?? 32)) }); }
  if (a === "crop" && m === "POST") { const x = await readJson(req); return json(res, { name: await cropAsset(x.asset, x) }); }

  if (a === "assets") {
    if (m === "GET") return json(res, (await fs.readdir(ASSETS_DIR).catch(() => [])).filter((f) => IMG_EXT.has(path.extname(f).toLowerCase())));
    if (m === "POST") {
      const ext = path.extname(url.searchParams.get("name") ?? "").toLowerCase();
      if (!IMG_EXT.has(ext)) throw new HttpError(400, "نوع ملف غير مدعوم");
      const base = safeId(path.basename(url.searchParams.get("name")!, ext)) + "-" + Date.now().toString(36) + ext;
      await fs.mkdir(ASSETS_DIR, { recursive: true });
      await fs.writeFile(path.join(ASSETS_DIR, base), await readBody(req));
      return json(res, { name: base });
    }
  }
  throw new HttpError(404, "مسار API غير معروف");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    // حماية: الواجهة والـ API للجهاز فقط. أي Host غير محلي (نفق أو DNS rebinding) لا يصل إلا إلى /mcp/<token>
    const host = req.headers.host ?? "";
    const local = host === `127.0.0.1:${PORT}` || host === `localhost:${PORT}`;
    const mcp = url.pathname.match(/^\/mcp(?:\/([^/]+))?$/);
    if (!local) {
      if (!mcp?.[1] || !(await tokenMatches(mcp[1]))) throw new HttpError(404, "غير موجود");
      return await handleMcp(req, res, true);
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) throw new HttpError(403, "Origin غير مسموح");

    if (mcp) { if (mcp[1] && !(await tokenMatches(mcp[1]))) throw new HttpError(404, "غير موجود"); return await handleMcp(req, res, false); }
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname.startsWith("/plugins/")) { // ملفات واجهة الإضافات (ui/ و assets/ فقط)
      const [, , pid, ...rest] = url.pathname.split("/"), f = plugins.staticFile(pid, decodeURIComponent(rest.join("/")));
      if (!f) throw new HttpError(404, "غير موجود");
      const buf = await fs.readFile(f).catch(() => { throw new HttpError(404, "غير موجود"); });
      return void res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" }).end(buf);
    }
    if (url.pathname.startsWith("/exports/")) return await serveFile(res, EXPORTS_DIR, url.pathname.slice(9));
    if (url.pathname.startsWith("/assets/")) return await serveFile(res, ASSETS_DIR, decodeURIComponent(url.pathname.slice(8)));
    return await serveFile(res, UI_DIR, url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof SyntaxError ? 400 : (e as { name?: string }).name === "ZodError" ? 400 : 500;
    if (!res.headersSent) json(res, { error: e instanceof Error ? e.message : String(e) }, status);
  }
});

await plugins.loadAll();
server.listen(PORT, "127.0.0.1", () => console.log(`mycanva: http://127.0.0.1:${PORT}   (MCP: /mcp)`));
const shutdown = async () => { stopTunnel(); await closeBrowser(); server.close(); process.exit(0); };
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
