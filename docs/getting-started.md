# Getting started · البدء السريع

## English

**Requirements:** Node.js 20+, Chromium for Playwright (rendering), `ffmpeg` (optional — video/GIF export), `ngrok` or `cloudflared` (optional — ChatGPT connector).

```bash
npm install
npx playwright install chromium
./start.command            # macOS: starts in the background, opens http://127.0.0.1:3333
./stop.command             # stop it
# any OS:  npm start       # PORT=3400 npm start to change the port
```

One server provides the editor UI (`/`), the API (`/api`) and MCP over HTTP (`/mcp`).

**Workflow:** create or import a brand ([guide](importing-a-brand.md)) → *Designs* tab → pick a template and format → edit on the canvas (drag, align, layers, icons, images, QR) → export PNG/JPG/PDF, carousels, video/GIF, or batch from CSV / Google Sheets. Use *Calendar* to schedule and track status. Settings holds the language switch, connection status and the ChatGPT tunnel.

**Where things live** (all git-ignored except `brands/example`): `brands/` brand kits · `designs/` saved designs · `exports/` rendered files · `user-templates/` your saved templates · `.cache/` settings and tokens · `plugins/<id>/data/` plugin data.

**Plugins:** see [plugins/README.md](../plugins/README.md). New plugins install disabled; enable them from Settings → Plugins. Plugins run with full trust — install only code you trust.

## العربية

**المتطلبات:** Node.js 20+، متصفح Chromium لـ Playwright (للتصيير)، و`ffmpeg` (اختياري — لتصدير الفيديو/GIF)، و`ngrok` أو `cloudflared` (اختياري — لربط ChatGPT).

```bash
npm install
npx playwright install chromium
./start.command            # macOS: يشغّل بالخلفية ويفتح http://127.0.0.1:3333
./stop.command             # للإيقاف
# أي نظام:  npm start      # PORT=3400 npm start لتغيير المنفذ
```

سيرفر واحد يقدّم الواجهة (`/`) والـ API (`/api`) وMCP عبر HTTP (`/mcp`).

**طريقة العمل:** أنشئ هوية أو استوردها ([الدليل](importing-a-brand.md)) ← تبويب «التصاميم» ← اختر قالباً ومقاساً ← عدّل على اللوحة (سحب، محاذاة، طبقات، أيقونات، صور، QR) ← صدّر PNG/JPG/PDF أو كاروسيل أو فيديو/GIF أو دفعة من CSV / Google Sheets. «التقويم» للجدولة ومتابعة الحالة. والإعدادات فيها تبديل اللغة وحالة الاتصال ونفق ChatGPT.

**أين تُحفظ الملفات** (كلها مستثناة من Git عدا `brands/example`): `brands/` الهويات · `designs/` التصاميم · `exports/` المخرجات · `user-templates/` قوالبك · `.cache/` الإعدادات والتوكن · `plugins/<id>/data/` بيانات الإضافات.

**الإضافات:** انظر [plugins/README.md](../plugins/README.md). الإضافة الجديدة تُثبَّت معطّلة وتُفعَّل من الإعدادات ← الإضافات. الإضافات تعمل بثقة كاملة، فثبّت كوداً تثق به فقط.
