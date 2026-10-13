import { expect, test } from "@playwright/test";
import { availability, login } from "./helpers";

test.describe("Le Comptoir", () => {
  test("accès protégé et droits vérifiés côté serveur", async ({ page, request }) => {
    await page.goto("/comptoir/commandes");
    await expect(page).toHaveURL(/\/comptoir\/connexion/);
    const anon = await request.get("/comptoir/clients/export", { maxRedirects: 0 });
    expect([307, 401]).toContain(anon.status());

    await login(page, "vente@demo.gps");
    await page.goto("/comptoir/rapports");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();
    await page.goto("/comptoir/parametres");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();
    const exp = await page.request.get("/comptoir/clients/export");
    expect(exp.status()).toBe(403);
    await expect(page.getByRole("navigation", { name: "Comptoir" }).getByText("Rapports")).toHaveCount(0);
  });

  test("commande : réservation, paiement partiel, solde, remise", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    const before = await availability(page, "LUM-RIV-EC");

    await page.goto("/comptoir/commandes/nouvelle");
    await page.locator("#pos-search").fill("lumen");
    await page.getByRole("button", { name: /Lumen Rive/ }).click();
    await page.getByRole("button", { name: /Monture : Écaille/ }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Client E2E");
    await page.getByLabel("Téléphone", { exact: true }).fill("000 99 88 77");
    await page.locator("#p-method").selectOption("mobile_money");
    await page.locator("#p-amount").fill("5000");
    await page.getByRole("button", { name: "Vérifier la commande" }).click();
    await page.getByRole("button", { name: "Confirmer et réserver" }).click();
    await expect(page).toHaveURL(/\/comptoir\/commandes\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Paiement partiel")).toBeVisible();
    const orderUrl = page.url();

    const reserved = await availability(page, "LUM-RIV-EC");
    expect(reserved.reserved).toBe(before.reserved + 1);
    expect(reserved.available).toBe(before.available - 1);
    expect(reserved.onHand).toBe(before.onHand);

    await page.goto(orderUrl);
    await expect(page.locator("dd", { hasText: /13\s000\sFCFA/ }).first()).toBeVisible();
    await page.getByLabel("Montant (FCFA)").fill("13000");
    await page.getByRole("button", { name: "Enregistrer l'encaissement" }).click();
    await expect(page.getByText("Payée", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Marquer prête au retrait" }).click();
    await expect(page.getByRole("button", { name: "Confirmer la remise au client" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmer la remise au client" }).click();
    await expect(page.getByText("Terminée", { exact: true })).toBeVisible();

    const after = await availability(page, "LUM-RIV-EC");
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.reserved).toBe(before.reserved);
  });

  test("annulation : réservation libérée", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    const before = await availability(page, "SON-ST2-NO");
    await page.goto("/comptoir/commandes/nouvelle");
    await page.locator("#pos-search").fill("studio");
    await page.getByRole("button", { name: /Sonna Studio 2/ }).click();
    await page.getByRole("button", { name: /Couleur : Noir/ }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Client Annulation");
    await page.getByRole("button", { name: "Vérifier la commande" }).click();
    await page.getByRole("button", { name: "Confirmer et réserver" }).click();
    await expect(page).toHaveURL(/\/comptoir\/commandes\/[0-9a-f-]{36}$/);
    const url = page.url();
    expect((await availability(page, "SON-ST2-NO")).reserved).toBe(before.reserved + 1);
    await page.goto(url);
    await page.locator("summary", { hasText: "Annuler la commande" }).click();
    await page.getByLabel("Motif").fill("Client injoignable");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(page.getByText("Annulée", { exact: true })).toBeVisible();
    const after = await availability(page, "SON-ST2-NO");
    expect(after.reserved).toBe(before.reserved);
    expect(after.available).toBe(before.available);
  });

  test("vente en boutique puis retour remis en stock et remboursé", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    const before = await availability(page, "VOL-PB20");
    await page.goto("/comptoir/vente");
    await page.locator("#pos-search").fill("batterie");
    await page.getByRole("button", { name: /Volta Batterie/ }).click();
    await page.getByRole("button", { name: "Vérifier la vente" }).click();
    await page.getByRole("button", { name: "Confirmer la vente" }).click();
    await expect(page.getByText("Vente enregistrée")).toBeVisible();
    expect((await availability(page, "VOL-PB20")).onHand).toBe(before.onHand - 1);

    await page.goto("/comptoir/vente");
    await page.getByRole("button", { name: "Vérifier la vente" }).isDisabled();
    await page.goto("/comptoir/commandes?vue=remises&canal=boutique");
    await page.locator("tbody tr").first().getByRole("link").click();
    await page.locator("summary", { hasText: "Enregistrer un retour" }).click();
    await page.getByLabel(/Quantité retournée pour Volta Batterie/).fill("1");
    await page.getByLabel("Revendable — remettre en stock").check();
    await page.getByLabel("Motif du retour").fill("Ne convient pas");
    await page.getByRole("button", { name: /Enregistrer le retour/ }).click();
    await expect(
      page.getByText(/Retour de 1 article\(s\) enregistré .* remis en stock après validation/),
    ).toBeVisible();
    await expect(page.getByText("Remboursement", { exact: true }).first()).toBeVisible();
    expect((await availability(page, "VOL-PB20")).onHand).toBe(before.onHand);
  });

  test("réapprovisionnement et inventaire tracés", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    const before = await availability(page, "ORB-N12-512-SA");
    await page.goto("/comptoir/stock/reapprovisionner");
    await page.locator("#rs-q").fill("ORB-N12-512-SA");
    await page.getByRole("button", { name: /ORB-N12-512-SA/ }).click();
    await page.getByLabel("Quantité reçue").fill("5");
    await page.locator("#rs-ref").fill("LOT-E2E");
    await page.getByRole("button", { name: /Vérifier le lot/ }).click();
    await page.getByRole("button", { name: "Confirmer le réapprovisionnement" }).click();
    await expect(page.getByText("Réapprovisionnement enregistré.")).toBeVisible();
    expect((await availability(page, "ORB-N12-512-SA")).onHand).toBe(before.onHand + 5);

    await page.goto("/comptoir/stock/inventaire");
    await page.locator("#inv-q").fill("ORB-N12-512-SA");
    await page.getByLabel(/Quantité comptée pour Orbis Nova 12/).fill(String(before.onHand + 4));
    await page.getByRole("button", { name: "Calculer les écarts" }).click();
    await expect(page.getByText("(-1)")).toBeVisible();
    await page.getByRole("button", { name: "Valider l'inventaire" }).click();
    await expect(page.getByText(/Inventaire validé/)).toBeVisible();
    expect((await availability(page, "ORB-N12-512-SA")).onHand).toBe(before.onHand + 4);
    await page.goto("/comptoir/stock/mouvements");
    await expect(page.getByText("Lot LOT-E2E").first()).toBeVisible();
  });
});
