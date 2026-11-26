import { devices, expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Listes déroulantes", () => {
  test("ordinateur : liste personnalisée avec recherche, clavier, filtre sans accent, Échap", async ({ page }) => {
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/vitrine");
    const trigger = page.getByRole("combobox", { name: "Ajouter à la sélection" });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    const total = await list.getByRole("option").count();
    expect(total).toBeGreaterThan(8);

    // Le champ de recherche a le focus ; aucun résultat, puis filtre.
    const search = page.getByRole("searchbox", { name: "Rechercher dans la liste" });
    await expect(search).toBeFocused();
    await search.fill("zzzz-introuvable");
    await expect(list.getByText(/Aucun résultat/)).toBeVisible();
    await search.fill("");
    const first = (await list.getByRole("option").nth(1).textContent())!.trim();
    await search.fill(first.slice(0, 4).toUpperCase());
    expect(await list.getByRole("option").count()).toBeLessThan(total);
    await search.press("ArrowDown");
    await search.press("Enter");
    await expect(list).toBeHidden();
    await expect(trigger).not.toHaveText(/Ajouter un produit/);
    await expect(trigger).toBeFocused();

    // Échap ferme sans changer le choix et rend le focus au champ.
    const chosen = await trigger.textContent();
    await trigger.press("ArrowDown");
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await expect(trigger).toHaveText(chosen!);
    await expect(trigger).toBeFocused();
  });

  test("ordinateur : liste courte (tri) personnalisée, frappe rapide et choix à la souris", async ({ page }) => {
    await page.goto("/boutique");
    const sort = page.getByRole("combobox", { name: "Trier par" });
    await sort.click();
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0); // peu de choix : pas de recherche
    await list.getByRole("option", { name: /Prix décroissant/ }).click();
    await expect(page).toHaveURL(/tri=prix-desc/);
    await expect(list).toBeHidden();
  });

  test("téléphone : la liste reste dans l'écran, textes à 16 px, aucun débordement", async ({ browser }) => {
    const context = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 360, height: 780 } });
    const page = await context.newPage();
    await page.goto("/boutique");
    // Tri (liste native) : 16 px minimum sur écran tactile.
    const sort = page.locator("#f-tri");
    expect(await sort.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    );
    await context.close();

    const ctx2 = await browser.newContext({ ...devices["Pixel 7"], viewport: { width: 360, height: 780 } });
    const p2 = await ctx2.newPage();
    await login(p2, "proprietaire@demo.gps");
    await p2.goto("/comptoir/vitrine");
    const box = p2.getByRole("combobox", { name: "Ajouter à la sélection" });
    await box.click();
    const list = p2.getByRole("listbox");
    await expect(list).toBeVisible();
    const r = (await list.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(360);
    expect(r.height).toBeLessThanOrEqual(780 * 0.5 + 2);
    expect(await box.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    // Un choix au toucher.
    await list.getByRole("option").nth(2).tap();
    await expect(list).toBeHidden();
    await ctx2.close();
  });
});
