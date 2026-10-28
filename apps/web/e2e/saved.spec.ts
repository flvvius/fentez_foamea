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
