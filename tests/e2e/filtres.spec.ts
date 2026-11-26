import { expect, test } from "@playwright/test";

const WIDTHS = [320, 337, 360, 390, 430, 768];

test.describe("Panneau Filtres : rien n'est coupé", () => {
  for (const zoom of [1, 1.5]) {
    for (const w of WIDTHS) {
      test(`${w} px, texte ×${zoom} : champs de prix, bouton OK et barre d'outils entièrement visibles`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: w, height: 780 });
        await page.goto("/boutique?dispo=1&tri=prix-desc&prix_min=1000");
        if (zoom !== 1) await page.addStyleTag({ content: `html{font-size:${zoom * 100}%}` });
        // Barre compteur / Filtres / Tri avec des filtres actifs : ni coupée ni débordante.
        const bar = await page.locator(".shop-toolbar").evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
        expect(bar.sw).toBeLessThanOrEqual(bar.cw + 1);
        await page.getByRole("button", { name: /Filtres/ }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const ok = dialog.getByRole("button", { name: "OK", exact: true });
        await ok.scrollIntoViewIfNeeded();
        const boxes = await dialog.locator("input, button, select").evaluateAll((els) =>
          els
            .map((e) => {
              const r = e.getBoundingClientRect();
              return {
                t: (e as HTMLElement).innerText?.slice(0, 20) || e.getAttribute("aria-label") || e.tagName,
                l: r.left,
                r: r.right,
                w: r.width,
              };
            })
            .filter((b) => b.w > 0),
        );
        for (const b of boxes) {
          expect(b.l, `${b.t} coupé à gauche`).toBeGreaterThanOrEqual(-0.5);
          expect(b.r, `${b.t} coupé à droite`).toBeLessThanOrEqual(w + 0.5);
        }
        await expect(ok).toBeVisible();
        const over = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(over).toBeLessThanOrEqual(0);
        // Le bouton de validation reste atteignable et fonctionne.
        await dialog.getByLabel("Prix max.").fill("500000");
        await ok.click();
        await expect(page).toHaveURL(/prix_max=500000/);
      });
    }
  }
});
