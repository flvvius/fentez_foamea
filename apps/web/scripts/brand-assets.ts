import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const fontDir = `${require.resolve("@fontsource-variable/inter/package.json").replace("package.json", "")}files/`;
const font = (subset: string) => readFileSync(`${fontDir}inter-${subset}-wght-normal.woff2`).toString("base64");
const mark = readFileSync(`${publicDir}favicon.svg`, "utf8");

const base = `
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${font("latin")}) format("woff2"); font-weight: 100 900; }
  @font-face { font-family: Inter; src: url(data:font/woff2;base64,${font("latin-ext")}) format("woff2"); font-weight: 100 900;
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
  * { margin: 0; box-sizing: border-box; }
  body { font-family: Inter, sans-serif; background: #fcfbf8; color: #1d1a16; }
`;

const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${base}
  body { width: 1200px; height: 630px; padding: 72px 80px; display: grid; grid-template-columns: 1fr 380px; gap: 64px; align-items: center; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 30px; font-weight: 600; }
  .brand svg { width: 56px; height: 56px; }
  h1 { font-size: 76px; line-height: 1.04; font-weight: 700; letter-spacing: -0.03em; margin: 36px 0 28px; }
  p { font-size: 28px; line-height: 1.4; color: #6b645b; }
  .rows { border-top: 2px solid #e7e3dc; }
  .row { display: grid; grid-template-columns: 150px 1fr; padding: 22px 0; border-bottom: 2px solid #e7e3dc; align-items: baseline; }
  .price { font-size: 44px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .price small { font-size: 20px; font-weight: 500; color: #6b645b; margin-left: 4px; }
  .what { font-size: 22px; line-height: 1.3; font-weight: 500; }
  .off { display: block; color: #c2410c; font-weight: 600; font-size: 20px; margin-top: 4px; }
</style></head><body>
  <div>
    <div class="brand">${mark}fentez foamea</div>
    <h1>Mâncare ieftină în București, acum.</h1>
    <p>Pachete anti-risipă, meniuri de prânz și reduceri de lângă tine, pe o singură hartă.</p>
  </div>
  <div class="rows">
    <div class="row"><span class="price">15<small>lei</small></span><span class="what">Pachet anti-risipă<span class="off">−67% · ridici azi</span></span></div>
    <div class="row"><span class="price">25<small>lei</small></span><span class="what">Meniul zilei<span class="off">ciorbă + fel principal</span></span></div>
    <div class="row"><span class="price">1+1</span><span class="what">Combo de marți<span class="off">la fast-food</span></span></div>
  </div>
</body></html>`;

const iconHtml = (size: number, padding: number) => `<!doctype html><html><head><style>${base}
  body { width: ${size}px; height: ${size}px; display: grid; place-items: center; background: #1d1a16; }
  svg { width: ${size - padding * 2}px; height: ${size - padding * 2}px; }
</style></head><body>${mark}</body></html>`;

const browser = await chromium.launch();
async function render(html: string, width: number, height: number, file: string) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  writeFileSync(`${publicDir}${file}`, await page.screenshot({ type: "png" }));
  await page.close();
}

await render(ogHtml, 1200, 630, "og.png");
await render(iconHtml(512, 96), 512, 512, "icon-512.png");
await render(iconHtml(192, 36), 192, 192, "icon-192.png");
await render(iconHtml(180, 30), 180, 180, "apple-touch-icon.png");
await browser.close();
