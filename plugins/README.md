# نظام الإضافات (Plugins) في MyCanva

الإضافة مجلد داخل `plugins/<id>/` فيه `plugin.json`. تضيف: **قوالب**، **مسارات API**، **أدوات MCP**، **تبويبات وأزرار بالواجهة**، **إعدادات**، **ترجمات**. تُثبَّت وتُعطَّل وتُحذف وتُصدَّر كملف zip من **الإعدادات ← الإضافات**.

> الإضافات تعمل بصلاحيات كاملة على جهازك (Node.js عادي). ثبّت فقط ما تثق بمصدره.

## الهيكل

```
plugins/my-plugin/
  plugin.json        ← المانيفست (إلزامي)
  index.js           ← الخلفية: export async function activate(api)   (اختياري)
  ui/index.js        ← الواجهة: export function register(ui)          (اختياري)
  ui/style.css
  i18n.json          ← { "en": { "نص عربي": "English text" } }
  data/              ← بياناتك (لا تُضمَّن في zip ولا تُحذف عند التحديث)
```

## plugin.json

| حقل | وصف |
|---|---|
| `id` | معرّف فريد: أحرف لاتينية صغيرة وأرقام وشرطات، ويطابق اسم المجلد |
| `name` / `name_ar`, `description` / `description_ar` | يظهران بقائمة الإضافات حسب لغة الواجهة |
| `version` | `1.2.3` |
| `mycanva` | أدنى إصدار للتطبيق، مثل `>=1.0.0` |
| `main` | ملف الخلفية (ESM) |
| `ui` | `{ "entry": "ui/index.js", "styles": ["ui/style.css"] }` |
| `i18n` | ملف ترجمات للواجهة |
| `toolPrefix` | بادئة أدوات MCP (الافتراضي: id بشرطات سفلية) |
| `permissions` | وصف إعلامي لما تفعله الإضافة |
| `settings` | حقول إعدادات تُبنى لها نافذة تلقائياً: `text` `textarea` `boolean` `number` `select` `password` |

## الخلفية: `activate(api)`

```js
export async function activate(api) {
  const { z, core } = api;                       // zod + دوال النواة
  api.settings.get();                            // قيم الإعدادات (دمج الافتراضي بالمحفوظ)
  api.dataDir;                                   // مجلد بياناتك: plugins/<id>/data
  const lib = await api.import("./lib/x.js");    // استيراد يُعاد تحميله عند reload (استعمله بدل import العادي)

  api.registerRoute("GET", "/hello/:name", async (c) => ({ hi: c.params.name }));   // → /api/p/<id>/hello/ali
  api.registerRoute("POST", "/upload", async (c) => { const buf = await c.buffer(); ... });
  api.registerTemplate({ id: "promo", label: "...", fields: ["title"], hidden: false, build: ({ brand, w, h, c }) => [/* عناصر */] }); // → <id>:promo
  api.registerMcpTool("do_it", { description, inputSchema: { x: z.string() }, remoteSafe: false }, async (args) => ({ ok: true }));
  api.onDeactivate(() => { /* تنظيف */ });
  api.onPack(async () => [{ path: "assets/bundled/x.png", data: buf }]);   // ملفات تُضمَّن عند «تصدير مع البيانات» (ابذرها عند التفعيل من assets/bundled)
  return api.raw(buffer, "image/png");           // رد ثنائي من مسار
}
```

- `api.core`: `listBrands loadBrand saveDesign loadDesign listDesigns createFromTemplate cloneDesign setSchedule safeId designSize renderDesign dominantColors assertPublicUrl DesignSchema ElementSchema FORMATS`، و`api.libs.sharp`.
- ملفات بياناتك تُستعمل بالتصاميم بمرجع `plugin:<id>/<مسار داخل data>` مثل `plugin:match-tool/logos/real-madrid.png`.
- التصاميم التي تولّدها تحفظ بياناتها بـ `design.meta.<اسمك>` ليُعاد توليدها لاحقاً.
- أدوات MCP **لا تظهر للوضع البعيد (ChatGPT)** إلا إذا صرّحت `remoteSafe: true`. اجعلها كذلك فقط إن لم تقرأ ملفات الجهاز ولا تتصل بالشبكة.
- رمي خطأ داخل مسار يتحول لرد `400` برسالته (أو `error.status`).

## الواجهة: `register(ui)`

```js
export function register(ui) {
  const { h, ic, toast, modal, btn, row, plugin: P } = ui;
  ui.addTab({ id: "main", label: "أداتي", icon: "sparkles", render: async (root) => { root.replaceChildren(h("p", {}, "مرحباً")); }, onShow: () => {}, onHide: () => ui.clearDraft() });
  // معاينة على المسرح الرئيسي بدل لوحة الإضافة: ui.setDraft(design, { label, note, actions: [{ label, icon, onClick }] })
  ui.addPageAction({ label: "إجراء", icon: "wand-sparkles", when: (design) => !!design.meta?.myplugin, onClick: (design, id) => {} });
  const data = await P.get("/hello/ali");  // P.post / P.del / P.upload(path, blob, type) / P.url(path)
  ui.openDesign(id); ui.reloadDesigns(); ui.brands(); ui.current();
  ui.previewHtml(design);                    // HTML معاينة لتصميم غير محفوظ
  ui.i18n({ "نص": "Text" }); ui.i18nRules([[/^عدد (\d+)$/, (m) => `Count ${m[1]}`]]);
}
```

الأيقونات: اسم أيقونة [Lucide](https://lucide.dev) مثل `ic("trophy")`. **لا إيموجي بالواجهة.**

## التثبيت

- **من الواجهة**: الإعدادات ← الإضافات ← «من ملف zip…» أو «تثبيت من مجلد». الإضافة الجديدة تبدأ **معطّلة** حتى توافق.
- **يدوياً**: ضع المجلد بـ `plugins/` وأعد تشغيل السيرفر.
- **تصدير**: «تصدير zip» (بدون `data`)، و«تصدير مع البيانات» لو سجّلت `api.onPack` (مثلاً شعارات match-tool). التحديث يحافظ على `data` وعلى حالة التفعيل.
- **الإزالة**: مع خيار إبقاء البيانات أو حذفها.
- بعد التفعيل/التعطيل تُحدَّث الصفحة تلقائياً. أدوات MCP عبر stdio تحتاج إعادة اتصال Claude.

## الأمان (ما يفعله التطبيق)

- ملفات zip: يُرفض أي مسار فيه `..`، ولا يُكتب شيء خارج مجلد الإضافة، وحدّ 40MB، ويُتجاهل `data/` و`node_modules/` و`.git/`.
- مسارات manifest (`main`, `ui`, `i18n`) نسبية فقط.
- ملفات الواجهة تُقدَّم من `ui/` و`assets/` و`public/` فقط وللإضافات المفعّلة فقط.
- كلمات سر الإعدادات (`password`) لا تُرسل للواجهة بعد حفظها.
- كل شيء محلي؛ مسارات الإضافات غير متاحة عبر نفق ChatGPT.
