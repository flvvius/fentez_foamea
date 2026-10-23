import { expect, test } from "./fixtures";

test("creates an account, signs out and signs back in", async ({ page }, testInfo) => {
  const email = `cont-${testInfo.project.name}-${Date.now()}@example.com`;
  const password = "parola-lunga-123";

  await page.goto("/autentificare?redirect=/");
  await page.getByRole("button", { name: "Creează unul" }).click();
  await page.getByLabel("Nume").fill("Ana Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Parolă").fill(password);
  await page.getByRole("button", { name: "Creează cont" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Ana Test")).toBeVisible();

  await page.getByRole("button", { name: "Ieși" }).click();
  await expect(page.getByText("Ana Test")).toBeHidden();

  await page.goto("/autentificare?redirect=/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Parolă").fill(password);
  await page.getByRole("button", { name: "Intră", exact: true }).click();
  await expect(page.getByText("Ana Test")).toBeVisible();
});

test("the session endpoint answers for a visitor without an account", async ({ request }) => {
  const response = await request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
});
