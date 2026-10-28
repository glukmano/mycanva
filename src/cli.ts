import fs from "node:fs/promises";
import path from "node:path";
import { loadBrand, saveBrand } from "./core/brand.js";
import { generatePalette, checkContrast } from "./core/palette.js";
import { closeBrowser, renderDesign } from "./core/render.js";
import { BrandSchema, DesignSchema } from "./core/types.js";
import { buildFromTemplate, TEMPLATES } from "./templates/index.js";

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "render") {
  const spec = DesignSchema.parse(JSON.parse(await fs.readFile(args[0], "utf8")));
  const r = await renderDesign(spec, { out: args[1] });
  console.log(r.file, r.warnings);
} else if (cmd === "demo") {
  // يبني هوية مثال من لون واحد ويولّد 3 قوالب × 3 مقاسات
  const id = args[0] ?? "example";
  const primary = args[1] ?? "#1E6FD9";
  const colors = generatePalette(primary);
  console.log("تحذيرات التباين:", checkContrast(colors));
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 64"><rect width="64" height="64" rx="18" fill="${colors.primary}"/><circle cx="32" cy="32" r="12" fill="${colors.accent}"/><text x="80" y="43" font-family="Cairo" font-weight="800" font-size="32" fill="${colors.text}">براند</text></svg>`;
  await fs.mkdir(`brands/${id}`, { recursive: true });
  await fs.writeFile(`brands/${id}/logo-light.svg`, logoSvg.replace(`fill="${colors.text}"`, `fill="#FFFFFF"`).replace(`<rect width="64" height="64" rx="18" fill="${colors.primary}"/>`, `<rect width="64" height="64" rx="18" fill="#FFFFFF"/>`));
  await fs.writeFile(`brands/${id}/logo.svg`, logoSvg);
  await saveBrand(id, BrandSchema.parse({ name: id, colors, logo: { default: "logo.svg", light: "logo-light.svg" }, voice: { tone: "ودّي ومحترف" } }));
  const brand = await loadBrand(id);
  const jobs: [string, string, object][] = [
    ["announcement", "post", { badge: "جديد", title: "نطلق خدماتنا الجديدة هذا الأسبوع", subtitle: "تجربة أسرع وأبسط لكل عملائنا", cta: "اعرف أكثر", icon: "rocket" }],
    ["quote", "story", { title: "الجودة ليست صدفة، بل نتيجة جهد ذكي ومتواصل.", author: "فريق براند" }],
    ["offer", "square", { badge: "30%", title: "خصم نهاية الأسبوع", subtitle: "على جميع الباقات حتى الجمعة", cta: "احجز الآن" }],
  ];
  for (const [tpl, format, content] of jobs) {
    const spec = DesignSchema.parse({ brand: id, format, elements: buildFromTemplate(tpl, brand, format, content as never) });
    const r = await renderDesign(spec, { out: path.join("exports", `${id}-${tpl}-${format}.png`) });
    console.log(r.file, r.warnings);
  }
} else {
  console.log("usage: render <spec.json> [out.png] | demo [brandId] [#primary]\ntemplates:", Object.keys(TEMPLATES).join(", "));
}
await closeBrowser();
