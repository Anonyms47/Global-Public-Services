import { devices, expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Listes déroulantes", () => {
  test("liste avec recherche : clavier, filtre sans accent, aucun résultat, Échap", async ({ page }) => {
    await login(page, "proprietaire@demo.gps");
    await page.goto("/comptoir/vitrine");
    const box = page.getByRole("combobox", { name: "Ajouter à la sélection" });
    await expect(box).toBeVisible();
    await box.click();
    const list = page.getByRole("listbox");
    await expect(list).toBeVisible();
    const total = await list.getByRole("option").count();
    expect(total).toBeGreaterThan(8);

    // Recherche : la liste se réduit, ↓ puis Entrée choisit.
    await box.fill("zzzz-introuvable");
    await expect(list.getByText(/Aucun résultat/)).toBeVisible();
    await box.fill("");
    const first = (await list.getByRole("option").nth(1).textContent())!.trim();
    await box.fill(first.slice(0, 4).toUpperCase());
    expect(await list.getByRole("option").count()).toBeLessThan(total);
    await box.press("ArrowDown");
    await box.press("Enter");
    await expect(list).toBeHidden();
    await expect(box).not.toHaveValue("");

    // Échap ferme sans changer le choix.
    const chosen = await box.inputValue();
    await box.press("ArrowDown");
    await expect(list).toBeVisible();
    await box.press("Escape");
    await expect(list).toBeHidden();
    await expect(box).toHaveValue(chosen);
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
