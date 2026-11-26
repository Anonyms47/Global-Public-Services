import { expect, test } from "@playwright/test";

test("mention « Site réalisé par Drifty » : pied de page public et page de connexion du Comptoir", async ({ page }) => {
  for (const url of ["/", "/a-propos", "/boutique", "/comptoir/connexion"]) {
    await page.goto(url);
    const link = page.getByRole("link", { name: "Drifty", exact: true });
    await expect(link).toHaveAttribute("href", "https://driftysn.com/fr");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
});
