import { expect, type Locator, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "demo-gps-2026";

export async function login(page: Page, email: string) {
  await page.goto("/comptoir/connexion");
  await page.getByLabel("Identifiant ou e-mail").fill(email);
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

/** Choisit dans une liste déroulante, native (écran tactile) ou personnalisée (ordinateur). */
export async function choose(list: Locator, opt: { label: string } | { index: number }) {
  const tag = await list.evaluate((el) => el.tagName);
  if (tag === "SELECT") {
    await list.selectOption(opt);
    return;
  }
  await list.click();
  const options = list.page().getByRole("listbox").getByRole("option");
  if ("label" in opt) {
    const esc = opt.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await options
      .filter({ hasText: new RegExp(`^\\s*${esc}(\\s|$)`) })
      .first()
      .click();
  } else await options.nth(opt.index).click();
}
