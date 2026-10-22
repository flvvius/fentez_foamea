import { expect, offerList, offerTitles, test, waitForHydration } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/harta");
  await waitForHydration(page);
});

test("shows the first offer without scrolling", async ({ page }) => {
  const viewport = page.viewportSize()!;
  const box = await offerList(page).locator("article").first().boundingBox();
  expect(box!.y).toBeLessThan(viewport.height - 80);
});

test("keeps the filters in reach while scrolling the list", async ({ page, isMobile }) => {
  await offerList(page).locator("article").nth(4).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 600);
  const filters = page.getByRole("group", { name: "Filtre" });
  if (isMobile) {
    await expect(filters).not.toBeInViewport();
    await page.getByRole("searchbox").focus();
    await expect(filters).toBeInViewport();
    await page.mouse.wheel(0, -100);
  }
  await expect(filters).toBeInViewport();
  const box = await offerList(page).locator("article").last().boundingBox();
  expect(box).not.toBeNull();
});

test("has no horizontal scroll", async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("map pins are one control each and work from the keyboard", async ({ page }) => {
  const pin = page.locator('.leaflet-marker-icon[title="Brutăria din Colț"]');
  await expect(pin.locator("button, a")).toHaveCount(0);
  await expect(pin).toHaveAttribute("role", "button");
  await pin.focus();
  await page.keyboard.press("Enter");
  await expect(offerList(page).locator(".venue-scope")).toContainText("Brutăria din Colț");
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet surpriză patiserie", "Covrigi cu brânză", "Pachet pentru mâine"]);
});

test("the best deals keep their price tag when the map is zoomed out", async ({ page }) => {
  await expect(page.locator(".map-far")).toHaveCount(1);
  const featured = page.locator(".pin-featured");
  await expect(featured.first()).toBeVisible();
  await expect(featured.first()).toContainText("lei");
});

test("a zoomed-out dot can be tapped just beside it", async ({ page }) => {
  const marker = page.locator(".leaflet-marker-icon").filter({ has: page.locator(".pin:not(.pin-featured, .pin-selected)") }).first();
  const name = await marker.getAttribute("title");
  const box = (await marker.locator(".pin").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2 + 11, box.y + box.height / 2);
  await expect(offerList(page).locator(".venue-scope")).toContainText(name!);
});
