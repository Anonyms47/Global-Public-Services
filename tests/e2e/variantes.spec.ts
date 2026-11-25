import { expect, test } from "@playwright/test";

const URL = "/produits/coque-aster-9";

test.describe("Fiche produit : galerie, photo de la variante, options", () => {
  test("un seul média : la grande galerie prend toute la largeur, sans débordement", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL);
    const box = await page.locator(".pdp-media").first().boundingBox();
    expect(box!.width).toBeGreaterThan(400);
    expect(await page.locator('ul[aria-label="Miniatures"]').count()).toBe(0);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });

  test("plusieurs médias : miniatures et grande galerie côte à côte", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/produits/orbis-nova-12");
    await expect(page.locator('ul[aria-label="Miniatures"]')).toBeVisible();
    const box = await page.locator(".pdp-media").first().boundingBox();
    expect(box!.width).toBeGreaterThan(400);
  });

  test("la photo reste liée à sa variante : jamais celle d'une autre", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: /^Type de coque Givrée/ }).click();
    await expect(page.getByRole("button", { name: /Agrandir la photo 1/ })).toBeVisible();

    await page.getByRole("button", { name: /^Type de coque Transparente avec anneau/ }).click();
    await expect(page.getByText("La photo de cette variante n'est pas encore disponible.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Agrandir la photo/ })).toHaveCount(0);
    // Prix et couleur suivent bien la sélection.
    await expect(page.getByText("1 500 FCFA").first()).toBeVisible();
    await expect(page.getByText("Couleur adaptée à ce choix : Transparent")).toBeVisible();

    // Voir les autres photos : clairement présentées comme celles d'autres variantes.
    await page.getByRole("button", { name: "Voir les photos des autres variantes" }).click();
    await expect(page.getByText(/Photos d'autres variantes du produit/)).toBeVisible();
  });

  test("combinaison inexistante ≠ rupture : seule la vraie rupture est signalée", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: /^Type de coque Aspect cuir/ }).click();
    // Les types ne sont jamais barrés ni annoncés indisponibles à cause de la sélection actuelle.
    for (const type of ["Givrée", "Transparente avec anneau", "Aspect cuir"]) {
      const b = page.getByRole("button", { name: new RegExp(`^Type de coque ${type}`) });
      await expect(b).toBeVisible();
      await expect(b).not.toHaveAttribute("aria-label", /indisponible|épuisé/i);
    }
    // Couleurs proposées : celles du type choisi seulement ; le noir est réellement épuisé.
    await expect(page.getByRole("button", { name: /^Couleur Marron/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Couleur Transparent/ })).toHaveCount(0);
    const noir = page.getByRole("button", { name: /^Couleur Noir/ });
    await expect(noir).toHaveAttribute("aria-label", /épuisé|indisponible/i);
    await expect(noir).toContainText(/Épuisé|Indisponible/);
    // Une rupture n'est pas un changement d'option : on peut la choisir, le statut l'explique.
    await noir.click();
    await expect(page.getByRole("status").filter({ hasText: /Épuisé|Indisponible/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajouter au panier" })).toBeDisabled();
  });

  test("prix, référence et variante conservés dans le panier", async ({ page }) => {
    await page.goto(URL);
    await page.getByRole("button", { name: /^Type de coque Aspect cuir/ }).click();
    await page.getByRole("button", { name: /^Couleur Marron/ }).click();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("link", { name: "Voir le panier" }).click();
    await expect(page.getByText(/Aspect cuir/).first()).toBeVisible();
    await expect(page.getByText(/Marron/).first()).toBeVisible();
    await expect(page.getByText(/2\s500\sFCFA/).first()).toBeVisible();
  });

  test("téléphone : galerie tactile sans débordement, état sans photo explicite", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(URL);
    await page.getByRole("button", { name: /^Type de coque Transparente avec anneau/ }).click();
    await expect(page.getByText("La photo de cette variante n'est pas encore disponible.")).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
  });

  test("recherche : un modèle précis ne retourne pas un autre modèle", async ({ page }) => {
    await page.goto("/boutique?q=coque aster");
    await expect(page.getByRole("link", { name: "Coque Aster 9" })).toBeVisible();
    await page.goto("/boutique?q=aster 90");
    await expect(page.getByText("Aucun article ne correspond")).toBeVisible();
  });
});

test.describe("Filtres propres au rayon", () => {
  test("modèle compatible : filtre, puce retirable, retour au rayon complet", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/categories/accessoires");
    const chip = page.getByRole("button", { name: /^Zelto 7 \(2\)/ });
    await expect(chip).toBeVisible();
    const total = await page.locator(".product-card").count();
    await chip.click();
    await expect(page).toHaveURL(/a=compat%3AZelto\+7|a=compat%3AZelto%207/);
    await expect(page.locator(".product-card")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /Modèle compatible : Zelto 7/ })).toBeVisible();
    await page.getByRole("button", { name: /Modèle compatible : Zelto 7/ }).click();
    await expect(page.locator(".product-card")).toHaveCount(total);
  });

  test("aucun critère proposé quand les données sont trop pauvres", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/categories/telephones");
    await expect(page.getByText("Modèle compatible")).toHaveCount(0);
    await expect(page.getByText("Puissance", { exact: true })).toHaveCount(0);
  });
});
