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

  test("vente rapide sur téléphone : monnaie à rendre et reçu", async ({ page }) => {
    await page.goto("/comptoir/connexion");
    await page.getByLabel("Identifiant ou e-mail").fill("vente@demo.gps");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/comptoir$/);
    await page.goto("/comptoir/vente");
    await page.locator("#pos-search").fill("batterie");
    await page.getByRole("button", { name: /Volta Batterie/ }).click();
    await page.getByRole("button", { name: /^Vente · 1/ }).click();
    const total = Number((await page.locator("#p-amount").getAttribute("placeholder")) ?? "0");
    await page.locator("#p-amount").fill(String(total + 5000));
    await expect(page.getByText("Monnaie à rendre")).toBeVisible();
    await page.getByRole("button", { name: "Vérifier la vente" }).click();
    await page.getByRole("button", { name: "Confirmer la vente" }).click();
    await expect(page.getByText("Vente enregistrée")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Vente enregistrée" })).toContainText(
      /rendre :\s*5\s000\sFCFA/,
    );
    await page.getByRole("link", { name: /Reçu/ }).click();
    await expect(page.locator("article")).toContainText(/Monnaie rendue 5\s000\sFCFA/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
  test("saisie produit sur téléphone : photos, envoi en erreur, enregistrer et ajouter un autre, fiche publiée", async ({
    page,
  }) => {
    const fs = await import("node:fs");
    await page.goto("/comptoir/connexion");
    await page.getByLabel("Identifiant ou e-mail").fill("gestion@demo.gps");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/comptoir$/);
    await page.goto("/comptoir/catalogue/nouveau");
    // Téléphone : mode rapide, une seule partie ouverte à la fois, photos en premier.
    await expect(page.getByRole("radio", { name: "Mode rapide" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("progression")).toHaveText("Fiche complétée à 0 %");
    await expect(page.locator("#etape-photos-t")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#etape-identity-t")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/Prenez la face avant, l'arrière/)).toBeVisible();
    await page.getByTestId("media-input").setInputFiles([
      { name: "face.png", mimeType: "image/png", buffer: fs.readFileSync("public/brand/logo-gps-mark.png") },
      { name: "dos.png", mimeType: "image/png", buffer: fs.readFileSync("public/brand/logo-gps.png") },
      { name: "faux.png", mimeType: "image/png", buffer: Buffer.from("pas une image") },
    ]);
    const uploads = page.getByRole("list", { name: "Envois en cours" });
    await expect(uploads.getByText("Envoyé")).toHaveCount(2, { timeout: 30_000 });
    const bad = uploads.locator("li", { hasText: "faux.png" });
    await expect(bad.getByText(/Format non pris en charge/)).toBeVisible();
    await bad.getByRole("button", { name: "Réessayer" }).click();
    await expect(bad.getByText(/Format non pris en charge/)).toBeVisible();
    await bad.getByRole("button", { name: "Retirer" }).click();
    await expect(page.getByTestId("media-item")).toHaveCount(2);
    // Photo principale au choix.
    await page.getByTestId("media-item").nth(1).getByRole("button", { name: "Définir comme photo principale" }).click();
    await expect(page.getByTestId("media-item").nth(0).getByText("Principale")).toBeVisible();

    await page.getByRole("button", { name: "Suivant : Identité" }).click();
    await expect(page.locator("#etape-photos-t")).toHaveAttribute("aria-expanded", "false");
    await page.locator("#p-name").fill("Mobile E2E Un");
    await page.locator("#p-cat").selectOption({ index: 1 });
    const category = await page.locator("#p-cat").inputValue();
    await page.locator("label", { hasText: "Visible dès l'enregistrement" }).click();
    await page.getByRole("button", { name: "Suivant : Prix et stock" }).click();
    // Gestionnaire : ni coût ni marge.
    await expect(page.locator("#p-cost")).toHaveCount(0);
    await expect(page.getByTestId("marge")).toHaveCount(0);
    await expect(page.locator("#p-price")).toHaveAttribute("inputmode", "numeric");
    await page.locator("#p-price").fill("15000");
    await page.locator("#p-stock").fill("2");
    await expect(page.getByTestId("progression")).not.toHaveText("Fiche complétée à 0 %");

    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole("button", { name: "Enregistrer et rester sur la fiche" })).toBeInViewport();
    await expect(page.getByRole("main")).not.toContainText(/démonstration|fictif/i);

    await page.getByRole("button", { name: "Enregistrer et ajouter un autre produit" }).click();
    await expect(page.getByText("Produit enregistré. La fiche suivante est prête.")).toBeVisible();
    await expect(page.getByText("« Mobile E2E Un » enregistré et publié.")).toBeVisible();
    // Fiche vierge : catégorie gardée, valeurs uniques remises à zéro, retour aux photos.
    await expect(page.locator("#etape-photos-t")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("media-item")).toHaveCount(0);
    await page.locator("#etape-identity-t").click();
    await expect(page.locator("#p-name")).toHaveValue("");
    await expect(page.locator("#p-cat")).toHaveValue(category);
    await page.locator("#etape-pricing-t").click();
    await expect(page.locator("#p-price")).toHaveValue("");
    await expect(page.locator("#p-stock")).toHaveValue("");

    // Incomplet : enregistré en brouillon, jamais publié.
    await page.locator("#etape-identity-t").click();
    await page.locator("#p-name").fill("Mobile E2E Brouillon");
    await page.getByRole("button", { name: "Enregistrer et ajouter un autre produit" }).click();
    await expect(page.getByText("« Mobile E2E Brouillon » enregistré en brouillon.")).toBeVisible();
    await expect(page.getByText("2 produits saisis à la suite.")).toBeVisible();

    const published = await page.request.get("/produits/mobile-e2e-un");
    expect(published.status()).toBe(200);
    expect(await published.text()).toContain("Mobile E2E Un");
    expect((await page.request.get("/produits/mobile-e2e-brouillon")).status()).toBe(404);
  });
});
