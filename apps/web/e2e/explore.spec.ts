import { expect, offerList, offerRow, offerTitles, test, waitForHydration } from "./fixtures";

test.describe("server render", () => {
  test.use({ javaScriptEnabled: false });

  test("lists live offers before any script runs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mâncare ieftină");
    await expect(offerRow(page, "Pachet surpriză patiserie")).toBeVisible();
    await expect(page.getByText("Pachet expirat")).toHaveCount(0);
  });
});

test.describe("explorer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
  });

  test("counts live offers and says when data was refreshed", async ({ page }) => {
    await expect(page.locator(".lede")).toContainText("12 oferte");
    await expect(page.locator(".lede")).toContainText(/Actualizat acum 1\d min/);
  });

  test("recommends the deepest concrete deal nearby first and leaves tomorrow's bags for later", async ({ page }) => {
    await expect(page.getByLabel("Ordine")).toHaveValue("best");
    await expect.poll(async () => (await offerTitles(page)).slice(0, 2)).toEqual(["Pachet surpriză patiserie", "Burger dublu cu cartofi"]);
    expect((await offerTitles(page)).slice(-2)).toEqual(["Pachet pentru mâine", "Ziua berii 1+1"]);
  });

  test("shows a pickup countdown on bags closing within the hour", async ({ page }) => {
    const bag = offerRow(page, "Pachet surpriză patiserie");
    await expect(bag).toContainText(/mai ai (39|40) min/);
    await expect(bag).toContainText("mai sunt 2");
    await expect(bag.getByRole("link", { name: /Vezi pe Bonapp/ })).toHaveAttribute("href", "https://bonapp.eco/p/bag-1");
  });

  test("drops offers sources stopped confirming and says when a bag was last checked", async ({ page }) => {
    await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
    await expect(offerRow(page, "Pachet verificat acum 2 ore")).toContainText("verificat acum 2 h");
    await expect(offerRow(page, "Pachet surpriză patiserie")).not.toContainText("verificat");
    await expect(offerRow(page, "Pachet nevăzut de 7 ore")).toHaveCount(0);
    await expect(offerRow(page, "Ofertă KFC de acum 4 zile")).toHaveCount(0);
  });

  test("filters by kind", async ({ page }) => {
    await page.getByRole("button", { name: /Pachet anti-risipă/ }).click();
    await expect.poll(() => offerTitles(page)).toEqual(["Pachet surpriză patiserie", "Pachet pentru mâine"]);
    await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
    await expect.poll(() => offerTitles(page)).toEqual([
      "Pachet surpriză patiserie",
      "Pachet de seară Titan",
      "Pachet verificat acum 2 ore",
      "Pachet pentru mâine",
    ]);
  });

  test("keeps to a budget", async ({ page }) => {
    await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
    await page.getByLabel("Buget").selectOption({ label: "sub 15 lei" });
    await expect(page).toHaveURL(/buget=15/);
    await expect.poll(() => offerTitles(page)).toEqual(["Pachet surpriză patiserie", "Pachet de seară Titan", "Pachet verificat acum 2 ore", "Pachet pentru mâine", "Ziua berii 1+1"]);
  });

  test("reads a price ceiling from the title", async ({ page }) => {
    const lunch = offerRow(page, "Prânzul sub 25 lei");
    await expect(lunch.locator(".figure")).toHaveText("sub25lei");
    await page.getByLabel("Buget").selectOption({ label: "sub 25 lei" });
    await expect(lunch).toHaveCount(1);
    await page.getByLabel("Buget").selectOption({ label: "sub 15 lei" });
    await expect(lunch).toHaveCount(0);
  });

  test("hides delivery-only offers when asked", async ({ page }) => {
    await expect(offerRow(page, "Burger dublu cu cartofi")).toContainText("doar livrare");
    await page.getByLabel("și livrări").uncheck();
    await expect(offerRow(page, "Burger dublu cu cartofi")).toHaveCount(0);
  });

  test("leaves venues without a location out of distance-limited lists", async ({ page }) => {
    await expect(offerList(page).locator("article").first()).toBeVisible();
    await expect(offerRow(page, "-30% la shaorma")).toHaveCount(0);
    await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
    await expect(offerRow(page, "-30% la shaorma")).toHaveCount(1);
  });

  test("shows the percent from a store promo's title where the price would be", async ({ page }) => {
    await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
    await expect(offerRow(page, "-30% la shaorma").locator(".figure")).toHaveText("−30%");
  });

  test("collapses chain copies to the nearest store", async ({ page }) => {
    await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
    await expect(offerRow(page, "Meniu Crispy Strips 2+1")).toHaveCount(1);
    await expect(offerRow(page, "Meniu Crispy Strips 2+1")).toContainText("și în alte 2 locații");
  });

  test("puts deals that do not run today last, marked", async ({ page }) => {
    const titles = await offerTitles(page);
    expect(titles.at(-1)).toBe("Ziua berii 1+1");
    await expect(offerRow(page, "Ziua berii 1+1")).toContainText("nu azi");
  });

  test("scopes the list to a venue and clears it", async ({ page }) => {
    await offerRow(page, "Meniul zilei City Grill").getByRole("button", { name: "City Grill Centru" }).click();
    await expect(offerList(page).locator(".venue-scope")).toContainText("City Grill Centru");
    await expect.poll(() => offerTitles(page)).toEqual(["Meniul zilei City Grill", "Ziua berii 1+1"]);
    await page.getByRole("button", { name: "Toate ofertele" }).click();
    await expect.poll(async () => (await offerTitles(page)).length).toBeGreaterThan(2);
  });

  test("scopes the list from a map pin", async ({ page }) => {
    await page.locator(".leaflet-marker-icon[title=\"Brutăria din Colț\"] .pin").click();
    await expect(offerList(page).locator(".venue-scope")).toContainText("Brutăria din Colț");
    await expect.poll(() => offerTitles(page)).toEqual(["Pachet surpriză patiserie", "Pachet pentru mâine"]);
  });
});

test.describe("near me", () => {
  test.use({ geolocation: { latitude: 44.4205, longitude: 26.1795 }, permissions: ["geolocation"] });

  test("re-sorts by distance from the visitor", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByRole("button", { name: "Arată ce e lângă mine" }).click();
    await expect(page.getByRole("button", { name: "Actualizează locația" })).toBeVisible();
    await expect.poll(async () => (await offerTitles(page))[0]).toBe("Pachet de seară Titan");
  });
});
