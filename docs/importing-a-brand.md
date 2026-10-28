# Importing a brand identity · استيراد هوية بصرية

Brand kits live in `brands/<id>/` and are git-ignored (except `example`), so your identities stay private.
الهويات تُحفظ في `brands/<id>/` وهي مستثناة من Git (عدا `example`) فتبقى خاصة بك.

### English

Pick whichever method fits:

1. **From the UI** — open the **Brand** tab → *New brand*, set the name, language, the 8 color tokens (primary, secondary, accent, bg, surface, text, muted, onPrimary) and fonts, then upload the logo (default = for light backgrounds, light = for dark backgrounds, mark = icon only). Save.
2. **From a website** — in the Brand tab open the brand-extraction dialog, paste the site URL and press *Analyze* (“From a website”): colors, known fonts and the logo are suggested; review them, then save. You can also upload a logo image (“Or from the logo image”) and the colors are extracted from it. (Over MCP: `brand_from_url`, then `create_brand`. Local use only.)
3. **From a logo/colors via AI** — ask Claude over MCP: “create a brand from #1E6FD9 with this logo”; `generate_palette` builds a full palette and `create_brand` saves it.
4. **Manually (files)** — copy `brands/example/` to `brands/<your-id>/`, edit `brand.json`, and replace `logo.svg` / `logo-light.svg`:

```json
{
  "name": "My Brand", "language": "en", "direction": "ltr",
  "colors": { "primary": "#2F6BFF", "secondary": "#0F1B3D", "accent": "#FF7A59",
              "bg": "#F4F7FF", "surface": "#FFFFFF", "text": "#0F1B3D",
              "muted": "#5B6785", "onPrimary": "#FFFFFF", "extra": [] },
  "fonts": { "heading": "Space Grotesk", "body": "Inter" },
  "logo": { "default": "logo.svg", "light": "logo-light.svg", "mark": "mark.svg" },
  "style": { "radius": 24, "iconSet": "lucide", "pattern": "dots" },
  "voice": { "tone": "Friendly", "hashtags": [], "cta": [] }
}
```

Restart is not needed — reload the page and the brand appears in every template. Tips: use SVG logos, keep text/background contrast high (the brand linter warns otherwise), and pick fonts from the bundled list (Cairo, Tajawal, Almarai, IBM Plex Sans Arabic, Noto Kufi, Readex Pro, Inter, Poppins, Montserrat, DM Sans, Space Grotesk, Playfair Display).

### العربية

اختر الطريقة المناسبة:

1. **من الواجهة** — افتح تبويب **الهوية** ← *هوية جديدة*، أدخل الاسم واللغة وألوان الهوية الثمانية (primary وsecondary وaccent وbg وsurface وtext وmuted وonPrimary) والخطوط، ثم ارفع اللوغو (الافتراضي للخلفيات الفاتحة، والفاتح للخلفيات الداكنة، والرمز للأيقونة وحدها) واحفظ.
2. **من موقع ويب** — في تبويب الهوية افتح نافذة استخراج الهوية، الصق رابط الموقع واضغط *تحليل* («من موقع»): تُقترح الألوان والخطوط المعروفة والشعار، راجعها ثم احفظ. ويمكنك أيضاً رفع صورة الشعار («أو من صورة الشعار») فتُستخرج الألوان منها. (عبر MCP: `brand_from_url` ثم `create_brand`، للاستخدام المحلي فقط.)
3. **من شعار أو لون عبر الذكاء الاصطناعي** — اطلب من Claude عبر MCP: «أنشئ هوية من #1E6FD9 بهذا الشعار»؛ تبني `generate_palette` باليت كاملة وتحفظها `create_brand`.
4. **يدوياً بالملفات** — انسخ `brands/example/` إلى `brands/<معرّف-هويتك>/`، عدّل `brand.json`، واستبدل `logo.svg` و`logo-light.svg` (انظر مثال JSON أعلاه).

لا حاجة لإعادة تشغيل السيرفر: حدّث الصفحة فتظهر الهوية في كل القوالب. نصائح: استخدم شعاراً بصيغة SVG، وحافظ على تباين جيد بين النص والخلفية (سيحذّرك فاحص الهوية)، واختر الخطوط من القائمة المضمّنة (Cairo وTajawal وAlmarai وIBM Plex Sans Arabic وNoto Kufi وReadex Pro وInter وPoppins وMontserrat وDM Sans وSpace Grotesk وPlayfair Display).
