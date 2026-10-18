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
    await page.getByRole("radio", { name: "Autre mobile money" }).click();
    await page.locator("#p-amount").fill("5000");
    await page.getByRole("button", { name: "Confirmer et réserver" }).click();
    await expect(page).toHaveURL(/\/comptoir\/commandes\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Paiement partiel")).toBeVisible();
    const orderUrl = page.url();
    // Message WhatsApp adapté à la situation : confirmation conseillée, avec le reste à régler.
    await page.locator("summary", { hasText: "Préparer un message WhatsApp" }).click();
    await expect(page.getByRole("combobox", { name: "Modèle" })).toHaveValue("0");
    await expect(page.getByRole("option", { name: /★ Conseillé : Confirmation de commande/ })).toHaveCount(1);
    await expect(page.getByLabel("Message préparé")).toHaveValue(/Déjà réglé : 5\s000\sFCFA\. Reste à régler/);

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
    await page.getByRole("button", { name: /^Encaisser / }).click();
    await expect(page.getByText("Vente enregistrée")).toBeVisible();
    expect((await availability(page, "VOL-PB20")).onHand).toBe(before.onHand - 1);

    await page.goto("/comptoir/vente");
    await expect(page.getByRole("button", { name: "Enregistrer la vente" })).toBeDisabled();
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
    // Par défaut, données réelles uniquement : les commandes d'exemple sont exclues et annoncées.
    const scope = page.getByTestId("scope");
    await expect(scope).toContainText("données réelles uniquement");
    await expect(scope).toContainText(/commandes? d'exemple exclues?/);
    const toggle = page.getByRole("switch", { name: "Inclure la démonstration" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(page).toHaveURL(/demo=1/);
    await expect(page.getByRole("switch", { name: "Inclure la démonstration" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(scope).toContainText("données réelles et données de démonstration");
    await expect(page.getByText("Calcul :")).toBeVisible();
    await expect(page.locator("table").getByRole("link").first()).toBeVisible();
    // La période choisie conserve le filtre.
    await page.getByRole("link", { name: "7 jours" }).click();
    await expect(page).toHaveURL(/periode=7j&demo=1/);

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
    await page.locator("summary", { hasText: "Autres actions" }).click();
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
    await expect(page.getByText("À compléter", { exact: true })).toBeVisible();
    await page.getByLabel("Prix de vente *").selectOption({ label: "Montant" });
    await page.getByRole("button", { name: "Appliquer et vérifier à nouveau" }).click();
    await expect(page.getByRole("cell", { name: "E2E-MAP-1" })).toBeVisible();
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

  test("médias : fichiers hors base, privé réservé à l'équipe, glisser-déposer sur ordinateur", async ({
    page,
    request,
  }) => {
    const fs = await import("node:fs");
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/mediatheque");
    await expect(page.getByText(/Stockage : dossier local/)).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "prive-e2e.png",
      mimeType: "image/png",
      buffer: fs.readFileSync("public/brand/logo-gps-mark.png"),
    });
    await expect(page.getByText("Envoyé")).toBeVisible();
    await page.reload();
    const src = await page.getByAltText("prive-e2e.png").first().getAttribute("src");
    const id = /\/media\/([0-9a-f-]{36})/.exec(src ?? "")![1];
    // Le fichier est dans le stockage (dossier), pas en base.
    const files = fs.readdirSync(".data/e2e-media", { recursive: true }).map(String);
    expect(files.some((f) => f.endsWith(`${id}.png`))).toBe(true);
    // Non utilisé par une fiche publiée : servi à l'équipe connectée, introuvable pour le public.
    expect((await page.request.get(`/media/${id}`)).status()).toBe(200);
    expect((await request.get(`/media/${id}`)).status()).toBe(404);
    const partial = await page.request.get(`/media/${id}`, { headers: { Range: "bytes=0-7" } });
    expect(partial.status()).toBe(206);

    // Fiche produit : la 2e vignette glissée sur la 1re devient la photo principale ; les boutons restent là.
    await page.goto("/comptoir/catalogue?q=Sonna%20Studio");
    await page
      .getByRole("link", { name: /Sonna Studio 2/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);
    const items = page.getByTestId("media-item");
    await expect(items.nth(1)).toBeVisible();
    const thumb = (i: number) => items.nth(i).locator("img, video").first().getAttribute("src");
    const [first, second] = [await thumb(0), await thumb(1)];
    await expect(items.nth(0).getByRole("button", { name: "Descendre la photo 1" })).toBeVisible();
    await items.nth(1).getByTestId("media-grip").dragTo(items.nth(0));
    expect(await thumb(0)).toBe(second);
    expect(await thumb(1)).toBe(first);
    await expect(items.nth(0).getByText("Principale")).toBeVisible();

    // La zone d'envoi reste là quand la fiche a déjà des photos : on en ajoute d'autres à la suite.
    const zone = page.getByTestId("media-dropzone");
    await expect(zone).toContainText("Déposez ou choisissez d'autres photos");
    const n = await items.count();
    await zone.locator('input[type="file"]').setInputFiles({
      name: "autre.png",
      mimeType: "image/png",
      buffer: fs.readFileSync("public/brand/logo-gps-mark.png"),
    });
    await expect(items).toHaveCount(n + 1);
    await expect(zone).toBeVisible();
  });

  test("points de vente : deux boutiques, deux itinéraires distincts, aucune mention « à confirmer »", async ({
    page,
  }) => {
    await login(page, "proprietaire@demo.gps");
    for (const [name, maps] of [
      ["GPS Petit Mbao 1", "https://maps.app.goo.gl/qM3MVde8n8LfCe2n6?g_st=ic"],
      ["GPS Petit Mbao 2", "https://maps.app.goo.gl/5c21wooLPBo1aThDA"],
    ]) {
      await page.goto("/comptoir/parametres/points-de-vente");
      await page.getByRole("button", { name: "Ajouter un point de vente" }).click();
      await page.getByLabel("Nom (identifiant interne) *").fill(name);
      await page.getByLabel("Quartier").fill("Dabakh Malick");
      await page.getByLabel("Localité").fill("Petit Mbao");
      await page.getByLabel("Lien Google Maps").fill(maps);
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(page.getByText("Point de vente enregistré.")).toBeVisible();
    }
    await page.goto("/contact");
    const stores = page.getByRole("list", { name: "Nos points de vente" });
    await expect(stores.getByText("Point de vente 1")).toBeVisible();
    await expect(stores.getByText("Point de vente 2")).toBeVisible();
    const hrefs = await stores
      .getByRole("link", { name: "Itinéraire" })
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual([
      "https://maps.app.goo.gl/qM3MVde8n8LfCe2n6?g_st=ic",
      "https://maps.app.goo.gl/5c21wooLPBo1aThDA",
    ]);
    await expect(stores.getByText("9 h – 22 h").first()).toBeVisible();
    for (const path of ["/contact", "/a-propos", "/conditions-de-vente", "/faq", "/services"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText(/à confirmer/i);
    }
  });
  test("saisie en boutique : clavier, variantes, vidéo, brouillon repris, duplication sans valeurs uniques, sans doublon", async ({
    page,
  }) => {
    const fs = await import("node:fs");
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/catalogue/nouveau");
    // Clavier : le nom a le focus, Tab mène à la catégorie.
    await expect(page.locator("#p-name")).toBeFocused();
    await page.keyboard.type("Clavier E2E Série");
    await page.keyboard.press("Tab");
    await expect(page.locator("#p-cat")).toBeFocused();
    await page.locator("#p-cat").selectOption({ index: 1 });
    // Ordinateur : toutes les parties ouvertes, aperçu permanent ; coût visible dès le mode rapide.
    await expect(page.getByRole("complementary", { name: "Aperçu du produit" })).toBeVisible();
    await expect(page.locator("#p-cost")).toBeVisible();
    await page.getByRole("radio", { name: "Mode complet" }).click();
    await page.locator("#p-price").fill("20000");
    await page.locator("#p-cost").fill("25000");
    await expect(page.getByText(/Prix inférieur au coût : perte de 5\s000/)).toBeVisible();
    await page.locator("#p-cost").fill("15000");
    await expect(page.getByTestId("marge")).toContainText("(25 %)");

    // Fermeture accidentelle : la saisie est retrouvée sur l'appareil.
    page.on("dialog", (d) => d.accept());
    await page.reload();
    await expect(page.getByText("Une saisie non enregistrée a été retrouvée sur cet appareil.")).toBeVisible();
    await page.getByRole("button", { name: "Restaurer" }).click();
    await expect(page.locator("#p-name")).toHaveValue("Clavier E2E Série");
    await expect(page.locator("#p-price")).toHaveValue("20000");

    // Variantes : valeurs en étiquettes, option personnalisée, combinaisons, réglage groupé.
    await page.locator("label", { hasText: /^Oui$/ }).click();
    await page.getByRole("button", { name: "Couleur", exact: true }).click();
    await page.getByLabel("Ajouter des valeurs pour Couleur").fill("Noir, Blanc");
    await page.getByLabel("Ajouter des valeurs pour Couleur").press("Enter");
    await page.getByLabel("Autre option (ex. Matière)").fill("Matière");
    await page.getByLabel("Autre option (ex. Matière)").press("Enter");
    for (const v of ["Cuir", "Tissu"]) {
      await page.getByLabel("Ajouter des valeurs pour Matière").fill(v);
      await page.getByLabel("Ajouter des valeurs pour Matière").press("Enter");
    }
    await expect(page.getByTestId("combos-preview")).toHaveText("2 × 2 = 4 combinaisons · 4 variantes seront créées");
    await page.getByRole("button", { name: /Générer les 4 combinaisons/ }).click();
    await expect(page.getByTestId("variant-count")).toHaveText(/4 variantes · 4 proposées/);
    await page.getByLabel("Proposer Blanc · Tissu").uncheck();
    await expect(page.getByTestId("variant-count")).toHaveText(/4 variantes · 3 proposées/);
    await page.getByLabel("Prix pour la sélection").fill("30000");
    await page.getByLabel("Stock initial pour la sélection").fill("2");
    await page.getByRole("button", { name: "Appliquer à toutes" }).click();
    await expect(page.getByLabel("Prix Noir · Cuir")).toHaveValue("30000");
    await expect(page.getByLabel("Stock initial Blanc · Cuir")).toHaveValue("2");
    await page.locator("#p-barcode-0").fill("E2E-CODE-1");

    // Photo + vidéo dans le même envoi, progression par fichier.
    await page.getByTestId("media-input").setInputFiles([
      { name: "photo.png", mimeType: "image/png", buffer: fs.readFileSync("public/brand/logo-gps-mark.png") },
      {
        name: "clip.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(64)]),
      },
    ]);
    await expect(page.getByRole("list", { name: "Envois en cours" }).getByText("Envoyé")).toHaveCount(2);
    const items = page.getByTestId("media-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0).getByText("Principale")).toBeVisible();
    await expect(items.nth(1).getByText("Vidéo")).toBeVisible();

    // Publication immédiate, enregistrée au clavier (Ctrl + S).
    await page.locator("label", { hasText: "Visible dès l'enregistrement" }).click();
    await expect(page.getByText("Prêt à publier.")).toBeVisible();
    await page.keyboard.press("Control+s");
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Tout est enregistré")).toBeVisible();

    // Duplication : mêmes réglages, sans nom, références, code-barres, photos ni stock.
    await page.locator("summary", { hasText: "Autres actions" }).click();
    await page.getByRole("link", { name: "Dupliquer" }).click();
    await expect(page).toHaveURL(/\/catalogue\/nouveau\?modele=/);
    await expect(page.locator("#p-name")).toHaveValue("");
    await expect(page.getByTestId("variant-count")).toHaveText(/3 variantes/);
    await expect(page.getByLabel("Prix Noir · Cuir")).toHaveValue("30000");
    await expect(page.locator("#p-sku-0")).toHaveValue("");
    await expect(page.locator("#p-barcode-0")).toHaveValue("");
    await expect(page.getByLabel("Stock initial Noir · Cuir")).toHaveValue("");
    await expect(page.getByTestId("media-item")).toHaveCount(0);

    // Double clic : un seul produit créé.
    await page.locator("#p-name").fill("Doublon E2E");
    await page.getByRole("button", { name: "Enregistrer et rester sur la fiche" }).dblclick();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);
    await page.goto("/comptoir/stock?q=Doublon%20E2E");
    await expect(page.locator("tbody tr", { hasText: "Doublon E2E" })).toHaveCount(3);
  });
  test("catalogue de la boutique : simulation, import en brouillons par le propriétaire, sans doublon", async ({
    page,
    request,
  }) => {
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/catalogue/import/boutique");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();

    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/catalogue/import");
    await page.getByRole("link", { name: /Catalogue relevé en boutique/ }).click();
    await expect(page.getByRole("heading", { name: "Catalogue de la boutique" })).toBeVisible();
    const products = page.getByRole("list", { name: "Produits du manifeste" });
    await expect(products.getByText("Oraimo PowerBox 600 — 60 000 mAh (OPB-P600Q)")).toBeVisible();
    const button = page.getByRole("button", { name: /Importer \d+ brouillons/ });
    await expect(button).toBeDisabled();
    await page.getByLabel("Tapez IMPORTER pour confirmer").fill("importer");
    await button.click();
    const report = page.getByRole("status", { name: "Rapport d'import" });
    await expect(report).toContainText(/\d+ brouillons créés · 0 ignoré · 0 erreur/, { timeout: 30_000 });
    await report.getByRole("link", { name: "Oraimo Watch 5 Lite (OSW-804)" }).click();
    await expect(page.getByText(/Fiche importée du relevé de la boutique/)).toBeVisible();
    await expect(
      page.getByText("☐ Résolution (240 × 296 ou 240 × 280 selon les sources) : relever sur la boîte"),
    ).toBeVisible();
    // Brouillon : invisible sur le site public.
    expect((await request.get("/produits/oraimo-watch-5-lite-osw-804")).status()).toBe(404);
    // Relancer : rien à créer.
    await page.goto("/comptoir/catalogue/import/boutique");
    await expect(page.getByText("Tout le manifeste est déjà importé.")).toBeVisible();
  });

  test("saisie complète sur ordinateur : nom proposé, modèle intact, caractéristiques, URL refusée, doublon signalé, publication bloquée sans photo", async ({
    page,
  }) => {
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/catalogue/nouveau");
    await page.getByRole("radio", { name: "Mode complet" }).click();
    await page.locator("#p-cat").selectOption({ label: "Téléphones" });
    await page.locator("#p-brand").fill("Orbis");
    await page.locator("#p-model").fill("ORB-N12 Pro");
    // Caractéristiques propres aux téléphones, avec valeurs rapides.
    await expect(page.locator("#p-spec-ram")).toBeVisible();
    await page.locator("#p-spec-stockage").fill("256 Go");
    // Nom simple proposé à partir des informations sûres, sans slogan.
    await expect(page.getByTestId("name-suggestion")).toHaveText("Orbis ORB-N12 Pro 256 Go");
    await page.getByRole("button", { name: "Utiliser", exact: true }).click();
    await expect(page.locator("#p-name")).toHaveValue("Orbis ORB-N12 Pro 256 Go");
    await expect(page.locator("#p-model")).toHaveValue("ORB-N12 Pro");
    // Information incertaine : jamais reprise dans le nom proposé.
    await page.locator("#p-spec-stockage").fill("256 Go ?");
    await expect(page.getByTestId("name-suggestion")).toHaveText("Orbis ORB-N12 Pro");

    // Produit déjà au catalogue : avertissement, jamais de fusion automatique.
    await page.locator("#p-name").fill("Orbis Nova 12");
    await expect(page.getByText("Un produit similaire existe peut-être.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Modifier l'existant" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Continuer quand même" }).click();
    await expect(page.getByText("Un produit similaire existe peut-être.")).toHaveCount(0);
    await page.locator("#p-name").fill("Orbis ORB-N12 Pro 256 Go");

    // Import par URL : https seulement.
    await page.getByRole("button", { name: "Importer depuis une URL" }).click();
    await page.locator("#p-media-url").fill("http://exemple.test/photo.jpg");
    await page.getByRole("button", { name: "Importer la photo" }).click();
    await expect(page.getByText("Seules les adresses https:// sont acceptées.")).toBeVisible();

    // Caractéristique personnalisée privée, description composée sans texte inventé.
    await page.locator("#p-short").fill("Téléphone double SIM.");
    await expect(page.getByTestId("verification")).toBeVisible();
    await page.locator("#p-price").fill("150000");
    // Sans photo : la publication est refusée, le brouillon reste possible.
    await page.locator("label", { hasText: "Visible dès l'enregistrement" }).click();
    await expect(page.getByText("Ajoutez au moins une photo.").first()).toBeVisible();
    await expect(page.getByText("Il manque des informations pour publier.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer et rester sur la fiche" })).toBeDisabled();
    await page.locator("label", { hasText: "Invisible sur le site" }).click();
    await page.getByRole("button", { name: "Enregistrer et rester sur la fiche" }).click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);
    await expect(page.locator("#p-model")).toHaveValue("ORB-N12 Pro");
    await expect(page.getByTestId("progression")).toContainText("Fiche complétée à");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("produits à compléter, comptage rapide et modification rapide depuis le catalogue", async ({ page }) => {
    await login(page, "gestion@demo.gps");
    // Un brouillon incomplet, comme ceux relevés en boutique.
    await page.goto("/comptoir/catalogue/nouveau");
    await page.locator("#p-name").fill("Brouillon à compléter E2E");
    await page.locator("#p-cat").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Enregistrer et rester sur la fiche" }).click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);
    await page.goto("/comptoir/catalogue/a-completer");
    await expect(page.getByTestId("progression-catalogue")).toHaveText(/\d+ produits? complétés? sur \d+/);
    // Gestionnaire : aucun filtre sur le coût.
    await expect(page.getByRole("link", { name: "Sans coût" })).toHaveCount(0);
    await page.getByRole("link", { name: "Sans photo" }).click();
    await expect(page).toHaveURL(/filtre=sans-photo/);
    await page.getByRole("link", { name: /Commencer par/ }).click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}\?completer=/);
    // Suivant, ou retour à la liste sur le dernier produit ; rien n'est publié.
    const first = page.url();
    await page.getByRole("button", { name: /Enregistrer et (passer au produit suivant|revenir à la liste)/ }).click();
    await expect(page).not.toHaveURL(first);
    await expect(page).toHaveURL(/completer=|\/a-completer/);

    // Comptage rapide : différence affichée, mouvement tracé.
    await page.goto("/comptoir/stock/comptage?q=Volta%20Chargeur");
    const card = page.getByRole("region", { name: /Comptage de Volta Chargeur 25W/ });
    const sku = (await card.locator("p.font-mono").innerText()).trim();
    const before = Number(await page.getByTestId("stock-actuel").innerText());
    await expect(page.locator("#qc-reason")).toHaveValue("Comptage rapide");
    await page.locator("#qc-count").fill(String(before + 3));
    await expect(page.getByTestId("difference")).toHaveText("+3");
    await page.getByRole("button", { name: "Enregistrer et suivant" }).click();
    await expect(page.getByText(`Volta Chargeur 25W : ${before} → ${before + 3}.`)).toBeVisible();
    expect((await availability(page, sku)).onHand).toBe(before + 3);

    // Modification rapide depuis le catalogue : prix d'une variante.
    await page.goto("/comptoir/catalogue?q=Lumen%20Rive");
    await page.getByRole("button", { name: "Modifier rapidement Lumen Rive" }).first().click();
    const sheet = page.getByRole("dialog");
    const price = sheet.getByLabel(/^Prix \(FCFA\)/).first();
    await expect(price).toBeVisible();
    await price.fill("12345");
    await sheet.getByRole("button", { name: "Enregistrer", exact: true }).first().click();
    await expect(sheet.getByText(/enregistré\.$/)).toBeVisible();
    await expect(sheet.getByText(/Actuel : 12\s345\sFCFA/).first()).toBeVisible();
  });

  test("saisie en grille : prix, coût et stock des brouillons en un seul enregistrement", async ({ page }) => {
    await login(page, "proprietaire@demo.gps");
    // Le coût est visible d'emblée pour le propriétaire, sans passer en mode complet.
    await page.goto("/comptoir/catalogue/nouveau");
    await expect(page.locator("#p-cost")).toBeVisible();
    await page.locator("#p-name").fill("Brouillon grille E2E");
    await page.locator("#p-cat").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Enregistrer et rester sur la fiche" }).click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/[0-9a-f-]{36}$/);

    await page.goto("/comptoir/catalogue/a-completer");
    await page.getByTestId("lien-saisie-grille").click();
    await expect(page).toHaveURL(/\/comptoir\/catalogue\/saisie$/);
    await page.getByPlaceholder("Rechercher un produit…").fill("Brouillon grille E2E");
    const card = page.getByTestId("grid-product").filter({ hasText: "Brouillon grille E2E" });
    await card.getByLabel(/^Prix FCFA/).fill("15000");
    await page.keyboard.press("Enter");
    await expect(card.getByLabel(/^Coût FCFA/)).toBeFocused();
    await page.keyboard.type("9000");
    await card.getByLabel(/^Stock/).fill("3");
    await expect(page.getByTestId("grid-pending")).toHaveText(/1 ligne modifiée/);
    await page.getByRole("button", { name: /Tout enregistrer \(1\)/ }).click();
    await expect(page.getByText("Enregistré : 1 prix, 1 coût, 1 stock.")).toBeVisible();
    // Le produit reste un brouillon : rien n'est publié.
    await page.getByPlaceholder("Rechercher un produit…").fill("Brouillon grille E2E");
    await page.getByRole("button", { name: /^Tout \(/ }).click();
    await expect(card.getByText(/· brouillon$/)).toBeVisible();
    await expect(card.getByLabel(/^Prix FCFA/)).toHaveValue("15000");
  });

  test("droits : le vendeur ne complète ni ne compte, le gestionnaire ne voit pas les coûts", async ({ page }) => {
    await login(page, "vente@demo.gps");
    for (const path of ["/comptoir/catalogue/a-completer", "/comptoir/stock/comptage", "/comptoir/catalogue/nouveau"]) {
      await page.goto(path);
      await expect(page.getByText("Droits insuffisants")).toBeVisible();
    }
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/catalogue/nouveau");
    await page.getByRole("radio", { name: "Mode complet" }).click();
    await expect(page.locator("#p-cost")).toHaveCount(0);
    await expect(page.getByTestId("valeurs-stock")).toHaveCount(0);
    await page.goto("/comptoir/parametres");
    await expect(page.getByText("Droits insuffisants")).toBeVisible();
  });

  test("profils de catégories : pas de couleur pour un chargeur, profil modifiable par le propriétaire", async ({
    page,
  }) => {
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/catalogue/nouveau");
    await page.getByRole("radio", { name: "Mode complet" }).click();
    await page.locator("#p-cat").selectOption({ label: "Chargeurs" });
    await page.locator("label", { hasText: /^Oui$/ }).click();
    await expect(page.getByTestId("no-variant-presets")).toBeVisible();
    await expect(page.getByRole("button", { name: "Couleur", exact: true })).toHaveCount(0);
    await expect(page.locator("#p-spec-couleur")).toHaveCount(0);
    await page.locator("#p-spec-types-de-ports").fill("USB-C");
    await page.locator("#p-spec-puissance-maximale").fill("35 W");
    await expect(page.getByTestId("name-suggestion")).toHaveText("Chargeur USB-C 35 W");

    // Le propriétaire ajoute une option réellement disponible : elle est proposée dans la fiche.
    page.on("dialog", (d) => d.accept());
    await page.goto("/comptoir/catalogue/categories");
    const profile = page.getByTestId("profil-Chargeurs");
    await profile.locator("summary").click();
    await expect(profile).toContainText("aucune (une fiche par version)");
    await profile.getByLabel("Options de variantes proposées").fill("Prise");
    await profile.getByRole("button", { name: "Enregistrer le profil" }).click();
    await expect(profile.getByText("Profil de la catégorie enregistré.")).toBeVisible();
    await page.goto("/comptoir/catalogue/nouveau");
    await page.locator("#p-cat").selectOption({ label: "Chargeurs" });
    await page.locator("label", { hasText: /^Oui$/ }).click();
    await expect(page.getByRole("button", { name: "Prise", exact: true }).first()).toBeVisible();
    await page.goto("/comptoir/catalogue/categories");
    await page.getByTestId("profil-Chargeurs").locator("summary").click();
    await page.getByTestId("profil-Chargeurs").getByRole("button", { name: "Revenir au profil par défaut" }).click();
    await expect(page.getByTestId("profil-Chargeurs").getByText("Profil de la catégorie enregistré.")).toBeVisible();

    // Le gestionnaire ne modifie pas les profils.
    await login(page, "gestion@demo.gps");
    await page.goto("/comptoir/catalogue/categories");
    await expect(page.getByRole("heading", { name: "Champs de la fiche produit" })).toHaveCount(0);
  });
});
