import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD } from "./helpers";

test.describe("Parcours mobile et clavier", () => {
  test("boutique sur deux colonnes, menu et filtres au clavier", async ({ page }) => {
    await page.goto("/boutique");
    const cards = page.locator("main ul li article");
    const a = await cards.nth(0).boundingBox();
    const b = await cards.nth(1).boundingBox();
    expect(a && b && Math.abs(a.y - b.y) < 2).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();

    await page.getByRole("button", { name: /Filtres/ }).click();
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Filtres" })).toBeHidden();
  });

  test("ajout au panier au clavier", async ({ page }) => {
    await page.goto("/produits/volta-chargeur-25w");
    const option = page.getByRole("button", { name: "Contenu Avec câble USB-C" });
    await option.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Ajouter au panier" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Ajouté au panier")).toBeVisible();
    await expect(page.getByRole("link", { name: /Panier, 1 article/ })).toBeVisible();
  });

  test("Comptoir mobile : bouton d'action rapide", async ({ page }) => {
    await page.goto("/comptoir/connexion");
    await page.getByLabel("Adresse e-mail").fill("gestion@demo.gps");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/comptoir$/);
    const width = page.viewportSize()!.width;
    for (const path of ["/comptoir", "/comptoir/file", "/comptoir/tableau-de-bord", "/comptoir/lancement"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
    }
    await page.goto("/comptoir");
    await page.getByRole("button", { name: "Actions rapides" }).click();
    const sheet = page.getByRole("dialog", { name: "Actions rapides" });
    await sheet.getByRole("link", { name: "Nouvelle vente" }).click();
    await expect(page).toHaveURL(/\/comptoir\/vente$/);
  });
});
