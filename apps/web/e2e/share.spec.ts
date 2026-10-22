import { expect, offerList, offerRow, offerTitles, test, waitForHydration } from "./fixtures";

const BAG = "00000000-0000-0000-0000-00000000b001";
const EXPIRED_BAG = "00000000-0000-0000-0000-00000000b009";
const TITAN = "00000000-0000-0000-0000-00000000a007";

test("keeps filters in the URL so a reload or a shared link shows the same list", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await page.getByRole("button", { name: /Pachet anti-risipă/ }).click();
  await page.getByLabel("Distanță").selectOption({ label: "tot orașul" });
  await page.getByLabel("Ordine").selectOption({ label: "cele mai ieftine" });
  await expect(page).toHaveURL(/\?tip=anti-risipa&km=oras&ordine=pret$/);

  await page.reload();
  await waitForHydration(page);
  await expect(page.getByRole("button", { name: /Pachet anti-risipă/ })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet verificat acum 2 ore", "Pachet de seară Titan", "Pachet surpriză patiserie", "Pachet pentru mâine"]);
});

test("opens a venue link even when the venue is outside the default radius", async ({ page }) => {
  await page.goto(`/?local=${TITAN}`);
  await expect(offerList(page).locator(".venue-scope")).toContainText("Patiserie Titan");
  await expect.poll(() => offerTitles(page)).toEqual(["Pachet de seară Titan"]);
});

test.describe("a shared offer link", () => {
  test("shows the offer on top", async ({ page }) => {
    await page.goto(`/?oferta=${BAG}`);
    const shared = page.getByRole("region", { name: "Oferta primită" });
    await expect(shared).toContainText("Ți-a trimis cineva oferta asta");
    await expect(shared.getByRole("heading", { name: "Pachet surpriză patiserie" })).toBeVisible();
    await expect(offerRow(page, "Pachet surpriză patiserie")).toHaveCount(0);

    await waitForHydration(page);
    await shared.getByRole("button", { name: "Închide" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(offerRow(page, "Pachet surpriză patiserie")).toHaveCount(1);
  });

  test("says so when the offer is gone", async ({ page }) => {
    await page.goto(`/?oferta=${EXPIRED_BAG}`);
    await expect(page.getByRole("region", { name: "Oferta primită" })).toContainText("nu mai e disponibilă");
  });

  test.describe("preview", () => {
    test.use({ javaScriptEnabled: false });

    test("names the deal in the link preview", async ({ page }) => {
      await page.goto(`/?oferta=${BAG}`);
      await expect(page).toHaveTitle("15 lei −67% · Pachet surpriză patiserie la Brutăria din Colț · fentez foamea");
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        "15 lei −67% · Pachet surpriză patiserie la Brutăria din Colț",
      );
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", new RegExp(`\\?oferta=${BAG}$`));
      await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/og\\?oferta=${BAG}$`));
    });
  });
});

test.describe("share button", () => {
  test("uses the system share sheet when there is one", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        value: (data: ShareData) => {
          (window as unknown as { shared: ShareData }).shared = data;
          return Promise.resolve();
        },
      });
    });
    await page.goto("/");
    await waitForHydration(page);
    await offerRow(page, "Pachet surpriză patiserie").getByRole("button", { name: "Trimite" }).click();
    await expect(offerRow(page, "Pachet surpriză patiserie").getByRole("button", { name: "Trimis" })).toBeVisible();
    const shared = await page.evaluate(() => (window as unknown as { shared: ShareData }).shared);
    expect(shared.text).toBe("15 lei −67% · Pachet surpriză patiserie la Brutăria din Colț");
    expect(shared.url).toMatch(new RegExp(`/\\?oferta=${BAG}$`));
  });

  test("copies the link otherwise", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));
    await page.goto("/");
    await waitForHydration(page);
    await offerRow(page, "Pachet surpriză patiserie").getByRole("button", { name: "Trimite" }).click();
    await expect(offerRow(page, "Pachet surpriză patiserie").getByRole("button", { name: "Link copiat" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `15 lei −67% · Pachet surpriză patiserie la Brutăria din Colț ${baseURL}/?oferta=${BAG}`,
    );
  });
});

test.describe("offer image", () => {
  test("renders the deal as a 1200x630 PNG", async ({ request }) => {
    const response = await request.get(`/og?oferta=${BAG}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const png = await response.body();
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  test("falls back to the site image for unknown offers", async ({ request }) => {
    const response = await request.get("/og?oferta=nu-exista", { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toMatch(/\/og\.png$/);
  });
});
