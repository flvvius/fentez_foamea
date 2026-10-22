import { expect, test } from "./fixtures";

test.use({ javaScriptEnabled: false });

test("carries the tags link previews read", async ({ page, request }) => {
  await page.goto("/");
  const meta = (key: string) => page.locator(`meta[property="${key}"], meta[name="${key}"]`).first();

  await expect(meta("og:title")).toHaveAttribute("content", /fentez foamea/);
  await expect(meta("og:description")).toHaveAttribute("content", /anti-risipă/);
  await expect(meta("twitter:card")).toHaveAttribute("content", "summary_large_image");

  const image = await meta("og:image").getAttribute("content");
  expect(image).toMatch(/^https:\/\/.+\/og$/);
  const served = await request.get(new URL(image!).pathname);
  expect(served.headers()["content-type"]).toBe("image/png");
  const png = await served.body();
  expect(png.length).toBeLessThan(300_000);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});

test("is installable", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ lang: "ro", display: "standalone", start_url: "/" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);
});
