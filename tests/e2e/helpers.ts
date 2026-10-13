import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "demo-gps-2026";

export async function login(page: Page, email: string) {
  await page.goto("/comptoir/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/comptoir$/);
}

export async function availability(page: Page, sku: string) {
  await page.goto(`/comptoir/stock?q=${encodeURIComponent(sku)}`);
  const row = page.locator("tbody tr", { hasText: sku });
  const cells = row.locator("td");
  const num = async (i: number) => Number((await cells.nth(i).innerText()).replace(/\D/g, ""));
  return { onHand: await num(1), reserved: await num(2), available: await num(3) };
}
