import { test as base, expect, type Locator, type Page } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 204 }));
    await use(page);
  },
});

export { expect };

export function offerList(page: Page): Locator {
  return page.locator("#oferte");
}

export function offerRow(page: Page, title: string): Locator {
  return offerList(page).locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

export async function offerTitles(page: Page): Promise<string[]> {
  return offerList(page).locator("article h2").allTextContents();
}

export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator(".leaflet-container")).toBeVisible();
}
