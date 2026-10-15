import { expect, test } from "@playwright/test";

test.describe("Boutique et commande WhatsApp", () => {
  test("variantes et quantités exactes dans le message, frais à confirmer", async ({ page }) => {
    await page.goto("/produits/pas-urbain");
    await page.getByRole("button", { name: "Ajouter au panier" }).click({ force: true });
    await expect(page.locator("#aide-ajout")).toContainText("Sélection manquante : pointure");
    await page.getByRole("button", { name: "Couleur Noir" }).click();
    await page.getByRole("button", { name: /^Pointure 41$/ }).click();
    await page.getByRole("button", { name: "Augmenter la quantité" }).click();
    await page.getByRole("button", { name: "Augmenter la quantité" }).click();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await expect(page.getByText("Ajouté au panier")).toBeVisible();

    await page.goto("/produits/orbis-nova-12");
    await page.getByRole("button", { name: "Capacité 256 Go" }).click();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("link", { name: "Voir le panier" }).click();

    await page.getByLabel("Livraison").check();
    await page.getByLabel("Adresse ou point de repère").fill("Quartier test");
    await page.getByLabel("Votre nom").fill("Client Test");
    await page.getByRole("button", { name: "Préparer mon récapitulatif" }).click();
    const message = await page.locator("#recap-message").inputValue();
    expect(message).toContain("Pas Urbain — Couleur : Noir · Pointure : 41");
    expect(message).toMatch(/Réf\. PAS-URB-NO-41 · Qté 3 × 32\s000\sFCFA = 96\s000\sFCFA/);
    expect(message).toContain("Orbis Nova 12 — Capacité : 256 Go · Couleur : Graphite");
    expect(message).toMatch(/Total des produits : 311\s000\sFCFA/);
    expect(message).toContain("Frais de livraison : À confirmer avec GPS");
    expect(message).toContain("Nom : Client Test");
    // Mode démonstration : aucun numéro contacté, copie possible.
    await expect(page.getByRole("button", { name: "Envoyer ma commande sur WhatsApp" })).toBeDisabled();
    await expect(page.getByText("Numéro WhatsApp bientôt disponible")).toBeVisible();
    await expect(page.getByText(/ne garantit ni l'envoi du message/)).toBeVisible();
  });

  test("une variante épuisée ne peut pas être ajoutée", async ({ page }) => {
    await page.goto("/produits/sonna-buds-air");
    await page.getByRole("button", { name: /Couleur Bleu nuit, épuisé/ }).click();
    await expect(page.getByRole("status").first()).toContainText("Épuisé");
    await page.getByRole("button", { name: "Ajouter au panier" }).click({ force: true });
    await expect(page.getByText("Ajouté au panier")).toHaveCount(0);
  });

  test("panier conservé, changement de prix expliqué, suppression annulable", async ({ page }) => {
    await page.goto("/produits/sonna-buds-air");
    await page.getByRole("button", { name: "Couleur Blanc" }).click();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    // Simule un prix vu avant le début de la promotion.
    await page.evaluate(() => {
      const items = JSON.parse(localStorage.getItem("gps-panier-v1") ?? "[]");
      items[0].unitPrice = 25000;
      localStorage.setItem("gps-panier-v1", JSON.stringify(items));
    });
    // Le panier est relu sur l'appareil puis revérifié par le serveur.
    await page.goto("/panier");
    await expect(page.getByText("Votre panier a été mis à jour")).toBeVisible();
    await expect(page.getByText(/Prix mis à jour : 25\s000\sFCFA → 20\s000\sFCFA/)).toBeVisible();
    await page.getByRole("button", { name: /Retirer Sonna Buds Air du panier/ }).click();
    await expect(page.getByText("Votre panier est vide")).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("link", { name: "Sonna Buds Air" })).toBeVisible();
  });

  test("recherche instantanée : résultats pendant la saisie, clavier, page de résultats", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("button", { name: /Rechercher/ })
      .first()
      .click();
    const box = page.getByRole("combobox", { name: /Rechercher un produit/ });
    await box.fill("orbis");
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    await expect(page.getByText(/articles? pour « orbis »/)).toBeVisible();
    await box.press("ArrowDown");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/produits\//);

    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: /Rechercher un produit/ }).fill("zzzz");
    await expect(page.getByText("Aucun article trouvé")).toBeVisible();
    await page.getByRole("combobox", { name: /Rechercher un produit/ }).fill("chargeur");
    await page.getByRole("combobox", { name: /Rechercher un produit/ }).press("Enter");
    await expect(page).toHaveURL(/\/boutique\?q=chargeur/);
  });

  test("recherche, filtres partageables et retour aux résultats", async ({ page }) => {
    await page.goto("/boutique?q=orbis&tri=prix-asc");
    await expect(page.getByText(/^4 articles/)).toBeVisible();
    await page.getByRole("button", { name: "Disponibles uniquement" }).click();
    await expect(page).toHaveURL(/dispo=1/);
    await expect(page.getByRole("button", { name: "Retirer le filtre « orbis »" })).toBeVisible();
    await page.getByRole("link", { name: "Orbis Lite 8" }).click();
    await page.getByRole("link", { name: "Retour aux résultats" }).click();
    await expect(page).toHaveURL(/q=orbis/);
    await expect(page).toHaveURL(/dispo=1/);
    await page.goto("/boutique?q=introuvablexyz");
    await expect(page.getByText("Aucun article ne correspond")).toBeVisible();
  });

  test("pages publiques, 404 et non-indexation de la démonstration", async ({ page, request }) => {
    for (const path of [
      "/",
      "/categories",
      "/services",
      "/a-propos",
      "/contact",
      "/faq",
      "/conditions-de-vente",
      "/confidentialite",
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
    }
    expect((await page.goto("/produits/nexiste-pas"))?.status()).toBe(404);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /");
    await page.goto("/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
