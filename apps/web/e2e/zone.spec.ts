import { expect, offerTitles, test, waitForHydration } from "./fixtures";

test("a zone page centres the list on the zone and keeps to 1 km", async ({ page }) => {
  await page.goto("/zona/titan");
  await expect(page).toHaveTitle("Mâncare ieftină lângă Titan · fentez foamea");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mâncare ieftină lângă Titan, acum.");
  await expect(page.locator(".lede")).toContainText("1 ofertă la cel mult 1 km de Titan: pachete");
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet de seară Titan"]);
  await waitForHydration(page);
  await expect(page.getByLabel("Distanță")).toHaveValue("1");
  await expect(page.getByRole("button", { name: /Pachet anti-risipă/ }).locator(".chip-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: /Combo/ })).toHaveCount(0);
});

test("offers a wider radius when a zone has few offers", async ({ page }) => {
  await page.goto("/zona/titan");
  await waitForHydration(page);
  await page.getByRole("button", { name: /^Încă \d+ (ofertă|oferte) până la 10 km$/ }).click();
  await expect(page).toHaveURL(/\/zona\/titan\?km=10$/);
  await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
  await expect(page.getByRole("button", { name: /^Încă/ })).toHaveCount(0);
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

test.describe("zone preview", () => {
  test.use({ javaScriptEnabled: false });

  test("points link previews at an image of the zone's deals", async ({ page, request }) => {
    await page.goto("/zona/titan");
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\?zona=titan$/);

    const image = await request.get("/og?zona=titan");
    expect(image.headers()["content-type"]).toBe("image/png");
    const unknown = await request.get("/og?zona=atlantis", { maxRedirects: 0 });
    expect(unknown.status()).toBe(302);
    expect(unknown.headers().location).toMatch(/\/og$/);
  });
});

test("a zone can be narrowed to one category, with its own page", async ({ page, request }) => {
  await page.goto("/zona/titan");
  await waitForHydration(page);
  await page.getByRole("navigation", { name: "Categorii" }).getByRole("link", { name: "Pachet anti-risipă lângă Titan" }).click();
  await expect(page).toHaveURL(/\/zona\/titan\/pachete-anti-risipa$/);
  await expect(page).toHaveTitle("Pachete anti-risipă lângă Titan · fentez foamea");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pachete anti-risipă lângă Titan, acum.");
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet de seară Titan"]);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\?zona=titan&categorie=pachete-anti-risipa$/);

  await page.getByRole("button", { name: /Pachet anti-risipă/ }).click();
  await expect(page).toHaveURL(/\/zona\/titan$/);

  expect((await request.get("/zona/titan/happy-hour")).status()).toBe(404);
  const image = await request.get("/og?zona=titan&categorie=pachete-anti-risipa");
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("the sitemap lists zone and category pages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.headers()["content-type"]).toContain("application/xml");
  const sitemap = await response.text();
  expect(sitemap).toContain("<loc>https://fentez-foamea.vercel.app/zona/titan/meniul-zilei</loc>");
  expect(sitemap).not.toContain("/zona/titan/happy-hour");
});

test("the zone picker opens a zone page and goes back to the whole city", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await page.getByLabel("Zonă").selectOption({ label: "Titan" });
  await expect(page).toHaveURL(/\/zona\/titan$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mâncare ieftină lângă Titan, acum.");
  await page.getByLabel("Zonă").selectOption({ label: "Tot Bucureștiul" });
  await expect(page).toHaveURL(/\/$/);
});
