import { expect, test } from "./fixtures";
import { decodeSnapshot } from "../src/lib/offers";

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

test("describes the site search to search engines", async ({ page }) => {
  await page.goto("/");
  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
  expect(data.potentialAction.target.urlTemplate).toBe("https://fentez-foamea.vercel.app/?q={search_term_string}&km=oras");
});

test("names the search in a shared search link", async ({ page }) => {
  await page.goto("/?q=covrigi");
  await expect(page).toHaveTitle("Oferte cu „covrigi” în București · fentez foamea");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Oferte cu „covrigi” în București");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oferte cu „covrigi” în București, acum.");
});

test("names the venue in a shared venue link", async ({ page }) => {
  await page.goto("/?local=00000000-0000-0000-0000-00000000a002");
  await expect(page).toHaveTitle("Oferte la City Grill Centru · fentez foamea");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^3 oferte la City Grill Centru acum/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\?local=00000000-0000-0000-0000-00000000a002$/);
  const image = await page.request.get("/og?local=00000000-0000-0000-0000-00000000a002");
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("serves the offer snapshot as a CDN-cacheable document", async ({ request }) => {
  const response = await request.get("/api/snapshot");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cdn-cache-control"]).toContain("s-maxage=");
  const snapshot = decodeSnapshot(await response.json());
  expect(snapshot.offers.map((offer) => offer.id)).toContain("00000000-0000-0000-0000-00000000b001");
});
