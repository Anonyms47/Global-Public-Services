import { expect, test } from "@playwright/test";
import { availability, login } from "./helpers";

test.describe("Le Comptoir", () => {
  test("accès protégé et droits vérifiés côté serveur", async ({ page, request }) => {
    await page.goto("/comptoir/commandes");
    await expect(page).toHaveURL(/\/comptoir\/connexion/);
    const anon = await request.get("/comptoir/clients/export", { maxRedirects: 0 });
    expect([307, 401]).toContain(anon.status());

    // La page d'installation reste accessible sans session (fermée tant qu'aucun code n'est défini).
    await page.goto("/comptoir/installation");
    await expect(page).toHaveURL(/\/comptoir\/installation$/);
    await expect(page.getByText(/installation n.est pas ouverte/)).toBeVisible();

    await login(page, "vente@demo.gps");
    await page.goto("/comptoir/rapports");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();
    await page.goto("/comptoir/parametres");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();
    const exp = await page.request.get("/comptoir/clients/export");
    expect(exp.status()).toBe(403);
    await expect(page.getByRole("navigation", { name: "Comptoir" }).getByText("Rapports")).toHaveCount(0);
  });

  test("équipe : mot de passe provisoire à changer à la première connexion", async ({ page, context }) => {
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/parametres/equipe");
    await page.getByLabel("Nom").fill("Recette vendeuse");
    await page.getByLabel("Identifiant de connexion").fill("recette.vendeuse");
    await page.getByLabel("Mot de passe provisoire").fill("provisoire-2026");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page.getByText("Recette vendeuse")).toBeVisible();
    await expect(page.getByText("Mot de passe provisoire").first()).toBeVisible();

    await context.clearCookies();
    await page.goto("/comptoir/connexion");
    await page.getByLabel("Identifiant ou e-mail").fill("recette.vendeuse");
    await page.getByLabel("Mot de passe").fill("provisoire-2026");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/comptoir\/mon-compte\?provisoire=1/);
    // Aucune autre page tant que le mot de passe provisoire n'est pas changé.
    await page.goto("/comptoir/commandes");
    await expect(page).toHaveURL(/\/comptoir\/mon-compte/);
    await page.getByLabel("Mot de passe actuel").fill("provisoire-2026");
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("mon-propre-mdp-1");
    await page.getByLabel("Confirmer le nouveau mot de passe").fill("mon-propre-mdp-1");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page).toHaveURL(/\/comptoir$/);
    await page.goto("/comptoir/commandes");
    await expect(page).toHaveURL(/\/comptoir\/commandes/);
  });

  test("catalogue : aperçu téléphone et ordinateur d'un produit", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/catalogue");
    const href = await page
      .locator("a[href^='/comptoir/catalogue/']")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")).find((h) => /\/[0-9a-f-]{36}$/.test(h ?? "")));
    await page.goto(href!);
    await page.getByRole("link", { name: "Aperçu téléphone / ordinateur" }).click();
    const frame = page.frameLocator("iframe");
    await expect(frame.getByText(/Aperçu du Comptoir/)).toBeVisible();
    await expect(frame.getByRole("button", { name: /Ajouter au panier|Commander/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /Ordinateur/ }).click();
    await expect(page.locator("iframe")).toHaveAttribute("title", "Aperçu ordinateur");
    await expect(frame.getByText(/Aperçu du Comptoir/)).toBeVisible();
    // Sans session, l'aperçu n'existe pas.
    const anon = await page.context().request.fetch("/apercu/inconnu", { headers: { cookie: "" } });
    expect(anon.status()).toBe(404);
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

  test("navigation : palette de commandes, tableau de bord détaillé, file GPS", async ({ page }) => {
    await login(page, "proprietaire@demo.gps");
    const nav = page.getByRole("navigation", { name: "Comptoir" });
    for (const g of ["Piloter", "Exploiter", "Développer"])
      await expect(nav.getByText(g, { exact: true })).toBeVisible();

    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: /Rechercher une action/ });
    await expect(box).toBeFocused();
    await box.fill("réappro");
    await expect(page.getByRole("option", { name: "Réapprovisionner" })).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(/\/comptoir\/stock\/reapprovisionner$/);

    await page.goto("/comptoir/tableau-de-bord?periode=30j");
    await page.getByRole("link", { name: /Chiffre d'affaires/ }).click();
    await expect(page.getByText("Calcul :")).toBeVisible();
    await expect(page.locator("table").getByRole("link").first()).toBeVisible();

    await page.goto("/comptoir/file");
    await page.getByLabel("Nouvelle tâche").fill("Tâche E2E");
    await page.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByText("Tâche E2E")).toBeVisible();
    const row = page.locator("li", { hasText: "Tâche E2E" }).last();
    await row.getByRole("button", { name: "Fait" }).click();
    await expect(page.getByText("Tâche E2E")).toHaveCount(0);
    await page.goto("/comptoir/file?vue=resolues");
    await expect(page.getByText("Tâche E2E")).toBeVisible();

    await page.goto("/comptoir/demandes");
    const req = page.locator("li", { hasText: "Client Test" }).first();
    await expect(req.getByText(/GPS-R-\d+/)).toBeVisible();
    await req.getByRole("button", { name: "Confirmer : créer la commande" }).click();
    await expect(page).toHaveURL(/\/comptoir\/commandes\/[0-9a-f-]{36}$/);
    await expect(page.getByText(/Créée depuis la demande GPS-R-/)).toBeVisible();

    await page.goto("/comptoir/lancement");
    await expect(page.getByText("Compte du propriétaire réel")).toBeVisible();
    await expect(page.getByRole("link", { name: /Corriger/ }).first()).toBeVisible();
  });

  test("vendeur : sans montants ni centre de lancement", async ({ page }) => {
    await login(page, "vente@demo.gps");
    await page.goto("/comptoir/tableau-de-bord");
    await expect(page.getByText("Les montants sont réservés")).toBeVisible();
    await expect(page.getByRole("link", { name: /Chiffre d'affaires/ })).toHaveCount(0);
    await page.goto("/comptoir/tableau-de-bord?detail=ca");
    await expect(page.getByText("Calcul :")).toHaveCount(0);
    await page.goto("/comptoir/lancement");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();
  });

  test("configuration : NINEA et RCCM enregistrés puis affichés sur les conditions de vente", async ({ page }) => {
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/parametres");
    await page.getByLabel("NINEA").fill("0000000 0A0");
    await page.getByLabel("RCCM").fill("SN-TEST-0000");
    await page
      .getByRole("button", { name: /Enregistrer/ })
      .first()
      .click();
    await expect(page.getByText("Paramètres enregistrés.")).toBeVisible();
    await page.goto("/conditions-de-vente");
    await expect(page.getByText(/Immatriculation : NINEA 0000000 0A0 · RCCM SN-TEST-0000/)).toBeVisible();
    await page.goto("/comptoir/sante");
    await expect(page.getByText("Configuration modifiée")).toBeVisible();
  });

  test("catalogue : corbeille puis restauration, historique des versions", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/catalogue?statut=tous&vue=liste&q=Nuance");
    await page
      .getByRole("link", { name: /Nuance Ambre/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "Historique des versions" })).toBeVisible();
    await page.getByRole("button", { name: /3\s*Publier/ }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Mettre à la corbeille" }).click();
    await expect(page).toHaveURL(/statut=corbeille/);
    const row = page.locator("li", { hasText: "Nuance Ambre" });
    await row.getByRole("button", { name: "Restaurer" }).click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Brouillon").first()).toBeVisible();
  });

  test("import CSV avec aperçu, puis médiathèque", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/catalogue/import");
    await page.getByText("Ou coller le contenu du fichier").click();
    await page
      .getByLabel("Contenu CSV")
      .fill(
        "nom;reference;prix;stock;options\nImport E2E;E2E-IMP-1;5000;2;Couleur=Noir\nImport E2E;E2E-IMP-1;5000;1;Couleur=Bleu",
      );
    await page.getByRole("button", { name: "Vérifier le fichier" }).click();
    await expect(page.getByText(/Ligne 3 : .*double/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Importer 1 produit/ })).toBeDisabled();
    // Import partiel : seules les lignes valides, rapport final avec la ligne ignorée.
    await page.getByText("Importer seulement les lignes valides").click();
    await page.getByRole("button", { name: /Importer 1 produit/ }).click();
    const report = page.getByRole("region", { name: /Rapport d.import/ });
    await expect(report).toContainText("1 produit créé");
    await expect(report).toContainText("1 ligne ignorée");
    await expect(report.getByRole("link", { name: "Import E2E" })).toBeVisible();
    await expect(report.getByRole("button", { name: /Télécharger les lignes ignorées/ })).toBeVisible();
    expect((await availability(page, "E2E-IMP-1")).onHand).toBe(2);

    // Intitulés inconnus : association manuelle des colonnes.
    await page.goto("/comptoir/catalogue/import");
    await page.getByText("Ou coller le contenu du fichier").click();
    await page.getByLabel("Contenu CSV").fill("Article;Code;Montant\nImport E2E Assoc;E2E-MAP-1;4000");
    await page.getByRole("button", { name: "Vérifier le fichier" }).click();
    await expect(page.getByText("À compléter")).toBeVisible();
    await page.getByLabel("Prix de vente *").selectOption({ label: "Montant" });
    await page.getByRole("button", { name: "Appliquer et vérifier à nouveau" }).click();
    await expect(page.getByText("E2E-MAP-1")).toBeVisible();
    await expect(page.getByRole("button", { name: /Importer 1 produit/ })).toBeEnabled();

    await page.goto("/comptoir/mediatheque");
    await expect(page.getByText(/Déposez vos fichiers/)).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles("public/brand/logo-gps-mark.png");
    await expect(page.getByText("Envoyé")).toBeVisible();
    await page.reload();
    await expect(page.getByText("logo-gps-mark.png")).toBeVisible();
  });

  test("médias : grande photo réduite avant l'envoi, progression, erreur puis nouvel essai", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/mediatheque");
    // Photo de 3 000 × 3 000 px (bruit, plusieurs Mo) : réduite à 2 000 px dans le navigateur.
    const big = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 3000;
      const ctx = c.getContext("2d")!;
      const img = ctx.createImageData(3000, 3000);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761) % 251;
      ctx.putImageData(img, 0, 0);
      return c.toDataURL("image/png").split(",")[1];
    });
    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: "grande-photo.png", mimeType: "image/png", buffer: Buffer.from(big, "base64") });
    const row = page.getByRole("list", { name: "Envois en cours" }).locator("li", { hasText: "grande-photo.png" });
    await expect(row.getByText("Envoyé")).toBeVisible({ timeout: 30_000 });
    await expect(row.getByText(/Optimisée : .* Mo → /)).toBeVisible();
    await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");

    // Fichier refusé (faux PNG) : erreur sur sa ligne, avec « Réessayer » et « Retirer ».
    await input.setInputFiles({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("pas une image") });
    const bad = page.getByRole("list", { name: "Envois en cours" }).locator("li", { hasText: "faux.png" });
    await expect(bad.getByText(/Format non pris en charge/)).toBeVisible();
    await bad.getByRole("button", { name: "Réessayer" }).click();
    await expect(bad.getByText(/Format non pris en charge/)).toBeVisible();
    await bad.getByRole("button", { name: "Retirer" }).click();
    await expect(bad).toHaveCount(0);
  });
});
