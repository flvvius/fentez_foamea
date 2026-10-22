import { expect, offerTitles, test, waitForHydration } from "./fixtures";

test("a zone page centres the list on the zone and keeps to 1 km", async ({ page }) => {
  await page.goto("/zona/titan");
  await expect(page).toHaveTitle("Mâncare ieftină lângă Titan · fentez foamea");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mâncare ieftină lângă Titan, acum.");
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet de seară Titan"]);
  await waitForHydration(page);
  await expect(page.getByLabel("Distanță")).toHaveValue("1");
});

test("widening the radius on a zone page stays on the page and survives a reload", async ({ page }) => {
  await page.goto("/zona/titan");
  await waitForHydration(page);
  await page.getByLabel("Distanță").selectOption({ label: "până la 3 km" });
  await expect(page).toHaveURL(/\/zona\/titan\?km=3$/);
  await page.reload();
  await waitForHydration(page);
  await expect(page.getByLabel("Distanță")).toHaveValue("3");
  await page.getByLabel("Distanță").selectOption({ label: "până la 1 km" });
  await expect(page).toHaveURL(/\/zona\/titan$/);
});

test("the footer links to zones and unknown zones are a 404", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Zone" }).getByRole("link", { name: "Politehnica" }).click();
  await expect(page).toHaveURL(/\/zona\/politehnica$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mâncare ieftină lângă Politehnica, acum.");
  expect((await request.get("/zona/atlantis")).status()).toBe(404);
});
