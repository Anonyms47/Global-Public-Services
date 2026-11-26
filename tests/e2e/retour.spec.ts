import { expect, test, type Page } from "@playwright/test";

/** Ouvre une fiche depuis la liste (carte tout en bas de ce qui est affiché), puis revient. */
async function openLastCardThenReturn(page: Page, how: "lien" | "navigateur") {
  const cards = page.locator("main ul.grid > li a[href*='depuis=']");
  const count = await cards.count();
  const last = cards.nth(count - 1);
  await last.scrollIntoViewIfNeeded();
  const yBefore = await page.evaluate(() => window.scrollY);
  expect(yBefore).toBeGreaterThan(300);
  const href = decodeURIComponent((await last.getAttribute("href")) ?? "");
  await last.click();
  await expect(page).toHaveURL(/\/produits\//);
  if (how === "lien") await page.getByRole("link", { name: "Retour aux résultats" }).click();
  else await page.goBack();
  await expect(page).toHaveURL(/\/(boutique|categories)/);
  // Même nombre de cartes, même position, la carte ouverte est de nouveau à l'écran.
  await expect(cards).toHaveCount(count);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(yBefore - 400);
  await expect(last).toBeInViewport();
  return { count, href };
}

for (const how of ["lien", "navigateur"] as const) {
  test.describe(`Retour aux résultats (${how})`, () => {
    test("« Voir plus » (page de 6 → 12 articles) → fiche → retour : liste et position conservées", async ({
      page,
    }) => {
      await page.goto("/boutique");
      await page.getByRole("link", { name: /article.* de plus/ }).click();
      await expect(page).toHaveURL(/n=12/);
      await expect.poll(() => page.locator("main ul.grid > li").count()).toBeGreaterThan(6);
      const { count } = await openLastCardThenReturn(page, how);
      expect(count).toBeGreaterThan(6);
      await expect(page).toHaveURL(/n=12/);
    });

    test("recherche + tri + rayon conservés au retour", async ({ page }) => {
      await page.goto("/boutique?tri=prix-desc&n=18");
      const before = await page.locator("main ul.grid > li").count();
      expect(before).toBeGreaterThan(5);
      const names = await page.locator("main ul.grid > li h3, main ul.grid > li h2").allTextContents();
      await openLastCardThenReturn(page, how);
      await expect(page).toHaveURL(/tri=prix-desc/);
      const after = await page.locator("main ul.grid > li h3, main ul.grid > li h2").allTextContents();
      expect(after).toEqual(names);
    });

    test("rayon direct : retour dans /categories/…", async ({ page }) => {
      await page.goto("/boutique");
      const first = await page.locator("nav[aria-label='Univers'] a").nth(1).getAttribute("href");
      await page.goto(first!);
      await page.locator("main ul.grid > li a[href*='depuis=']").first().click();
      await expect(page).toHaveURL(/\/produits\//);
      if (how === "lien") await page.getByRole("link", { name: "Retour aux résultats" }).click();
      else await page.goBack();
      await expect(page).toHaveURL(new RegExp(first!.split("?")[0]));
    });
  });
}

test("adresse de provenance falsifiée : pas de lien de retour externe", async ({ page }) => {
  await page.goto("/produits/pas-urbain?depuis=https://example.org/boutique");
  await expect(page.getByRole("link", { name: "Retour aux résultats" })).toHaveCount(0);
  await page.goto("/produits/pas-urbain?depuis=//example.org");
  await expect(page.getByRole("link", { name: "Retour aux résultats" })).toHaveCount(0);
});
