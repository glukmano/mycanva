# Connecting AI (MCP) · الربط مع الذكاء الاصطناعي

## English

### Claude Code / Claude Desktop (local, stdio)
Copy `.mcp.json.example` to `.mcp.json` and set `cwd` to your project folder:

```json
{ "mcpServers": { "mycanva": { "command": "npx", "args": ["tsx", "src/mcp/index.ts"], "cwd": "/path/to/mycanva" } } }
```

Then ask: “create a brand from #1E6FD9 and make a 1080×1350 offer post”. Claude designs, renders, looks at the image and fixes issues (`check_design` lints contrast and overflow).

### ChatGPT (remote, HTTP)
1. Install `ngrok` (and run `ngrok config add-authtoken …`) or `cloudflared`.
2. Settings → Connection → start the tunnel. A URL like `https://…/mcp/<token>` is shown.
3. In ChatGPT: Settings → Connectors → Advanced → Developer mode → add the URL.

**Security:** the token in the URL *is* the password — never share it or paste it into chats/issues; regenerate it from Settings if exposed. Remote clients only reach a safe subset of tools (local-only tools like `brand_from_url` and file-path tools are not exposed), and the server rejects non-local hosts/origins outside `/mcp/<token>`. Keep API keys (Pexels, OpenAI, TheSportsDB) in Settings, never in prompts.

### Tools
Brands: `list_brands`, `get_brand`, `create_brand`, `generate_palette`, `brand_from_url` · Designs: `create_design`, `get_design`, `update_design`, `resize_design`, `clone_design`, `render_design`, `check_design`, `list_designs`, `list_texts` · Templates/icons: `list_templates`, `save_as_template`, `search_icons` · Series: `create_carousel`, `create_batch`, `import_csv_batch`, `renumber_group`, `export_designs` · Media: `create_qr`, `export_video`, `remove_background`, `search_stock`, `import_stock`, `generate_image` · Planning: `set_schedule`, `list_calendar`. Plugins add their own tools (e.g. `match_*`).

## العربية

### Claude Code / Claude Desktop (محلي، stdio)
انسخ `.mcp.json.example` إلى `.mcp.json` وغيّر `cwd` إلى مجلد مشروعك (المثال أعلاه). ثم اطلب مثلاً: «أنشئ هوية من #1E6FD9 وسوّي بوست عرض 1080×1350». يصمّم Claude ويصيّر الصورة ويراجعها ويصلح الأخطاء (`check_design` يفحص التباين والتجاوز).

### ChatGPT (بعيد، HTTP)
1. ثبّت `ngrok` (ونفّذ `ngrok config add-authtoken …`) أو `cloudflared`.
2. الإعدادات ← الاتصال ← شغّل النفق. سيظهر رابط بالشكل `https://…/mcp/<token>`.
3. في ChatGPT: Settings ← Connectors ← Advanced ← Developer mode ← أضف الرابط.

**الأمان:** التوكن داخل الرابط هو كلمة السر — لا تشاركه ولا تلصقه في محادثة أو issue، وولّد غيره من الإعدادات إن انكشف. العملاء البعيدون يصلون لمجموعة أدوات آمنة فقط (الأدوات المحلية مثل `brand_from_url` وأدوات المسارات غير متاحة)، ويرفض السيرفر أي Host/Origin غير محلي خارج `/mcp/<token>`. ضع مفاتيح API (Pexels وOpenAI وTheSportsDB) في الإعدادات لا في المحادثة.

### الأدوات
مذكورة أعلاه بالإنكليزية؛ والإضافات تضيف أدواتها (مثل `match_*`).
