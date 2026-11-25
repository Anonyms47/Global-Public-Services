import { expect, test } from "@playwright/test";

test.describe("Accueil", () => {
  test("produits d'abord, univers prioritaires, numérotation continue, pas de défilement automatique", async ({
    page,
  }) => {
    await page.goto("/");
    const order = await page.evaluate(() => {
      const sel = document.getElementById("titre-selection");
      const uni = document.getElementById("titre-univers");
      return sel && uni ? !!(sel.compareDocumentPosition(uni) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
    });
    expect(order).toBe(true);
    const nums = await page.locator(".eyebrow .tabular").allInnerTexts();
    expect(nums.length).toBeGreaterThan(3);
    expect(nums.map(Number)).toEqual(nums.map((_, i) => i + 1));
    expect(await page.locator(".marquee, .marquee-track").count()).toBe(0);
    expect(await page.locator("ul.univers-grid > li").count()).toBeLessThanOrEqual(6);
    await page.getByRole("link", { name: "Tous les univers" }).click();
    await expect(page).toHaveURL(/\/categories$/);
  });

  test("sans JavaScript : toutes les sections restent visibles", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "La bonne adresse. Le bon produit." })).toBeVisible();
    for (const id of ["titre-selection", "titre-univers"]) {
      const opacity = await page.locator(`#${id}`).evaluate((el) => {
        const sec = el.closest("section")!;
        return Number(getComputedStyle(sec.querySelector("[data-reveal]") ?? sec).opacity);
      });
      expect(opacity).toBe(1);
    }
    await ctx.close();
  });

  test("animations réduites : le contenu est affiché sans attendre", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    const hidden = await page.evaluate(
      () => [...document.querySelectorAll("[data-reveal]")].filter((el) => getComputedStyle(el).opacity !== "1").length,
    );
    expect(hidden).toBe(0);
    await ctx.close();
  });

  test("pied de page : le nom de l'entreprise n'est pas répété", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("footer").innerText();
    const hits = text.match(/Global Public Services/g) ?? [];
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  test("téléphone, 360 px : aucun débordement", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
  });
});
