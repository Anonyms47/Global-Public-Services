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
    await page.getByLabel("Identifiant ou e-mail").fill("gestion@demo.gps");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/comptoir$/);
    const width = page.viewportSize()!.width;
    const paths = [
      "/comptoir",
      "/comptoir/file",
      "/comptoir/tableau-de-bord",
      "/comptoir/lancement",
      "/comptoir/commandes",
      "/comptoir/stock",
      "/comptoir/stock/inventaire",
      "/comptoir/stock/mouvements",
      "/comptoir/clients",
      "/comptoir/catalogue/promotions",
    ];
    for (const path of paths) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
    }
    // Les tableaux deviennent des fiches : chaque cellule porte sa légende, sans défilement horizontal.
    await page.goto("/comptoir/stock");
    await expect(page.locator(".rtable td[data-label='Disponible']").first()).toBeVisible();
    // Une page qui a sa propre barre d'action en bas masque le bouton flottant.
    await page.goto("/comptoir/vente");
    await expect(page.getByRole("button", { name: "Actions rapides" })).toBeHidden();
    await page.goto("/comptoir");
    await page.getByRole("button", { name: "Actions rapides" }).click();
    const sheet = page.getByRole("dialog", { name: "Actions rapides" });
    await sheet.getByRole("link", { name: "Nouvelle vente" }).click();
    await expect(page).toHaveURL(/\/comptoir\/vente$/);
  });

  test("Comptoir mobile : actions rapides visibles même sans boîte de dialogue native", async ({ page }) => {
    // Certains navigateurs mobiles (anciens ou intégrés à une application) n'ouvrent pas <dialog> en modal.
    await page.addInitScript(() => {
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", { value: undefined });
    });
    await page.goto("/comptoir/connexion");
    await page.getByLabel("Identifiant ou e-mail").fill("gestion@demo.gps");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/comptoir$/);
    await page.mouse.wheel(0, 600);
    await page.getByRole("button", { name: "Actions rapides" }).click();
    const sheet = page.getByRole("dialog", { name: "Actions rapides" });
    await expect(sheet).toBeInViewport();
    await sheet.getByRole("button", { name: "Fermer" }).click();
    await expect(sheet).toBeHidden();
  });
});
