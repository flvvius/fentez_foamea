import { expect, offerList, offerRow, test, waitForHydration } from "./fixtures";

test("saves a venue and lists only saved venues, even after a reload", async ({ page }) => {
  await page.goto("/harta");
  await waitForHydration(page);
  const bag = offerRow(page, "Pachet surpriză patiserie");
  const save = bag.getByRole("button", { name: /^Salvează/ });
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await waitForHydration(page);
  const savedChip = page.getByRole("button", { name: /^Salvate/ });
  await savedChip.click();
  await expect(page).toHaveURL(/salvate=da/);
  await expect(offerList(page).locator("article h2").first()).toHaveText("Pachet surpriză patiserie");
  await expect(offerList(page).locator("article").filter({ hasText: "Burger dublu cu cartofi" })).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("link", { name: /Localurile salvate/ })).toHaveAttribute("href", "/harta?salvate=da");
});

test("explains the saved list before anything is saved", async ({ page }) => {
  await page.goto("/harta?salvate=da");
  await waitForHydration(page);
  await expect(offerList(page)).toContainText("Nu ai salvat niciun local");
});

test("links an offer with a pickup place to directions, but not a delivery-only one", async ({ page }) => {
  await page.goto("/harta");
  await expect(offerRow(page, "Pachet surpriză patiserie").getByRole("link", { name: /^Traseu/ })).toHaveAttribute(
    "href",
    /google\.com\/maps\/dir\/\?api=1&destination=44\.\d+,26\.\d+/,
  );
  await expect(offerRow(page, "Burger dublu cu cartofi").getByRole("link", { name: /^Traseu/ })).toHaveCount(0);
});

test("the home page lists today's offers at saved venues", async ({ page }) => {
  await page.goto("/harta");
  await waitForHydration(page);
  await offerRow(page, "Pachet surpriză patiserie").getByRole("button", { name: /^Salvează/ }).click();

  await page.goto("/");
  const saved = page.getByRole("region", { name: "La localurile tale" });
  await expect(saved.getByRole("link", { name: /Pachet surpriză patiserie/ })).toBeVisible();
  await expect(saved).not.toContainText("Pachet de seară Titan");
});

test("offers to install the site once a venue is saved", async ({ page }) => {
  await page.goto("/harta");
  await waitForHydration(page);
  await offerRow(page, "Pachet surpriză patiserie").getByRole("button", { name: /^Salvează/ }).click();

  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: async () => {
        (window as unknown as { prompted: boolean }).prompted = true;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(event);
  });
  const offer = page.getByRole("complementary", { name: "Instalează aplicația" });
  await offer.getByRole("button", { name: "Instalează" }).click();
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(offer).toBeHidden();
});
