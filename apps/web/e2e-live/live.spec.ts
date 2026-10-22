import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204 }));
});

test("the live site lists offers refreshed in the last few hours", async ({ page }) => {
  const response = await page.goto(`/?health=${Date.now()}`);
  expect(response?.status()).toBe(200);
  const lede = page.locator(".lede");
  const count = Number((await lede.textContent())?.match(/^(\d+)/)?.[1]);
  expect(count).toBeGreaterThan(1000);
  await expect(lede).toContainText(/Actualizat (chiar acum|acum \d+ min|acum [1-3] h)\./);
  await expect(page.locator("#oferte article").first()).toBeVisible();
});

test("category pages and link previews are served", async ({ page, request }) => {
  await page.goto("/pachete-anti-risipa");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pachete anti-risipă în București, azi.");
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect((await request.get(image!)).ok()).toBe(true);
});
