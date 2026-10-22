import { expect, offerTitles, test, waitForHydration } from "./fixtures";

test("a category page opens with its filter on and its own title", async ({ page }) => {
  await page.goto("/pachete-anti-risipa?km=oras");
  await expect(page).toHaveTitle("Pachete anti-risipă în București, azi · fentez foamea");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pachete anti-risipă în București, azi.");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/pachete-anti-risipa$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet surpriză patiserie", "Pachet de seară Titan", "Pachet verificat acum 2 ore", "Pachet pentru mâine"]);

  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /Pachet anti-risipă/ })).toHaveAttribute("aria-pressed", "true");
});

test("changing the category leaves for the main page with the filters kept", async ({ page }) => {
  await page.goto("/meniul-zilei");
  await waitForHydration(page);
  await page.getByRole("button", { name: /Combo/ }).click();
  await expect(page).toHaveURL(/\/\?tip=combo%2Cmeniul-zilei$|\/\?tip=combo,meniul-zilei$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mâncare ieftină în București, acum.");
});

test("the footer links to every category", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Categorii" }).getByRole("link", { name: "Meniul zilei" }).click();
  await expect(page).toHaveURL(/\/meniul-zilei$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Meniul zilei în București, lângă tine.");
});

test("unknown categories are a 404", async ({ request }) => {
  expect((await request.get("/nu-exista")).status()).toBe(404);
});

test("robots.txt points at a sitemap listing the category pages", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://fentez-foamea.vercel.app/sitemap.xml");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>https://fentez-foamea.vercel.app/pachete-anti-risipa</loc>");
});

test("a category page previews with its own image", async ({ page, request }) => {
  await page.goto("/meniul-zilei");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/og\?categorie=meniul-zilei$/);
  const image = await request.get("/og?categorie=meniul-zilei");
  expect(image.headers()["content-type"]).toBe("image/png");
  expect((await request.get("/og?categorie=nimic", { maxRedirects: 0 })).status()).toBe(302);
});
