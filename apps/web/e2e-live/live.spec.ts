import { type APIRequestContext, expect, test } from "@playwright/test";

const LONGEST_SCRAPE_GAP_HOURS = 15;

async function hoursSinceLastScrape(request: APIRequestContext): Promise<number> {
  const { updatedAt } = (await (await request.get("/api/snapshot")).json()) as { updatedAt: string | null };
  return updatedAt ? (Date.now() - Date.parse(updatedAt)) / 3_600_000 : Infinity;
}

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204 }));
});

test("the live site lists offers from the latest scrapes", async ({ page, request }) => {
  const response = await page.goto(`/harta?health=${Date.now()}`);
  expect(response?.status()).toBe(200);
  const lede = page.locator(".lede");
  const count = Number((await lede.textContent())?.match(/^(\d+)/)?.[1]);
  expect(count).toBeGreaterThan(1000);
  await expect(lede).toContainText(/Actualizat (chiar acum|acum \d+ (min|h))\./);
  expect(await hoursSinceLastScrape(request)).toBeLessThan(LONGEST_SCRAPE_GAP_HOURS);
  await expect(page.locator("#oferte article").first()).toBeVisible();
});

test("category pages and link previews are served", async ({ page, request }) => {
  await page.goto("/pachete-anti-risipa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pachete anti-risipă în București, azi.");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect((await request.get(image!)).ok()).toBe(true);
});

test("zone pages, the sitemap and search work", async ({ page, request }) => {
  await page.goto("/zona/universitate/pachete-anti-risipa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pachete anti-risipă lângă Universitate, acum.");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap.match(/<url>/g)?.length).toBeGreaterThan(100);

  await page.goto("/harta?q=pizza&km=oras");
  await expect(page.locator("#oferte article").first()).toContainText(/pizza/i);
});

test("the offer snapshot is served from the CDN cache", async ({ request }) => {
  await request.get("/api/snapshot");
  const response = await request.get("/api/snapshot");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-vercel-cache"]).toMatch(/HIT|STALE/);
});

test("the bags feed lists bags with a pickup window", async ({ request }) => {
  const feed = await (await request.get("/feed.xml")).text();
  expect(feed).toContain("<channel>");
  test.skip(await hoursSinceLastScrape(request) > 3, "Bags from the last scrape may all have expired");
  const items = feed.match(/<item>/g)?.length ?? 0;
  expect(items).toBeGreaterThan(5);
  expect(feed).toMatch(/<title>[^<]+, ridici [^<]+<\/title>/);
});

test("the community feed and sign-in are up", async ({ page, request }) => {
  const response = await page.goto(`/?health=${Date.now()}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oferte de mâncare, de la oameni");
  expect((await request.get("/api/auth/get-session")).status()).toBe(200);
});

test("Vercel Web Analytics and Speed Insights scripts are served", async ({ request }) => {
  expect((await request.get("/_vercel/insights/script.js")).status()).toBe(200);
  expect((await request.get("/_vercel/speed-insights/script.js")).status()).toBe(200);
});
