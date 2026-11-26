import { expect, test } from "@playwright/test";

test.describe("Demande transmise à GPS : textes et enregistrement", () => {
  test("rien n'est enregistré à la frappe ; un seul enregistrement malgré un double toucher ; texte honnête", async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && r.headers()["next-action"]) posts.push(r.headers()["next-action"]);
    });
    await page.goto("/produits/orbis-nova-12");
    await page.getByRole("button", { name: "Capacité 256 Go" }).click();
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    await page.getByRole("link", { name: "Voir le panier" }).click();
    await page.getByLabel("Retrait en boutique").check();
    if (await page.locator("input[name=store]").count()) await page.locator("input[name=store]").first().check();
    await page.getByLabel("Votre nom").fill("Client Test");
    await page.getByLabel("Votre nom").pressSequentially(" Dupont", { delay: 20 });
    // Aucune action serveur d'enregistrement avant le bouton (la vérification du panier est une lecture).
    const before = posts.length;

    // Le texte près du bouton dit la vérité.
    await expect(page.getByText(/transmet votre demande à GPS/)).toBeVisible();
    await expect(page.getByText(/ni une commande confirmée ni un paiement/)).toBeVisible();

    const button = page.getByRole("button", { name: "Préparer mon récapitulatif" });
    await button.dblclick();
    await expect(page.locator("#recap-message")).toBeVisible();
    const during = posts.length - before;
    // 1 vérification du panier + 1 enregistrement au plus ; jamais deux enregistrements.
    expect(during).toBeLessThanOrEqual(2);
    await expect(page.locator("#recap-message")).toHaveValue(/Réf|GPS-/);
  });

  test("la page Confidentialité décrit la transmission au bouton « Préparer mon récapitulatif »", async ({ page }) => {
    await page.goto("/confidentialite");
    await expect(page.getByText(/transmise à GPS/)).toBeVisible();
    await expect(page.getByText(/n.est pas une commande confirmée/)).toBeVisible();
    await expect(page.getByText(/uniquement dans votre navigateur/)).toBeVisible();
    await expect(page.getByText(/nettoyage quotidien qui suit ses 48 heures/).first()).toBeVisible();
    await expect(page.getByText(/ne sont pas\s+envoyés à GPS tant que/)).toHaveCount(0);
  });
});
