import { expect, offerList, test } from "./fixtures";

test("the home page leads with today's best offers and links each to its venue on the map", async ({ page }) => {
  await page.goto("/");
  const highlights = page.getByRole("region", { name: "Cele mai bune oferte de azi" });
  await expect(highlights.getByRole("listitem").first()).toBeVisible();
  await expect(highlights.getByRole("link", { name: /Pachet surpriză patiserie/ })).toBeVisible();
  await expect(highlights.getByRole("listitem").filter({ hasText: "doar livrare" })).toHaveCount(0);

  await highlights.getByRole("link", { name: /Pachet surpriză patiserie/ }).click();
  await expect(page).toHaveURL(/\/harta\?local=/);
  await expect(offerList(page)).toContainText("Pachet surpriză patiserie");
});

test("the home page links to each category with today's count", async ({ page }) => {
  await page.goto("/");
  const categories = page.getByRole("navigation", { name: "Pe categorii" });
  await expect(categories.getByRole("link", { name: /Pachete anti-risipă \d+/ })).toHaveAttribute("href", "/pachete-anti-risipa");
  await expect(categories.getByRole("link", { name: /Toate pe hartă/ })).toHaveAttribute("href", "/harta");
});
