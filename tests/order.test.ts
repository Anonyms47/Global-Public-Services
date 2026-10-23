import { describe, expect, it } from "vitest";
import { optionPrices, selectOption } from "@/lib/variant-select";
import { orderHint } from "@/lib/order-hints";

// Coque réelle : le type fixe le prix, chaque type n'existe qu'en certaines couleurs.
const coque = [
  { options: { "Type de coque": "Transparente avec anneau", Couleur: "Transparent" }, price: 1500, available: 1 },
  { options: { "Type de coque": "Aspect cuir", Couleur: "Marron" }, price: 2500, available: 1 },
  { options: { "Type de coque": "Aspect cuir", Couleur: "Noir" }, price: 2500, available: 1 },
  { options: { "Type de coque": "Givrée", Couleur: "Gris et orange" }, price: 5000, available: 1 },
  { options: { "Type de coque": "Carbone", Couleur: "Noir" }, price: 5000, available: 1 },
];
const axes = ["Type de coque", "Couleur"];

describe("choix des options", () => {
  it("retire une couleur impossible avec le type choisi puis complète la seule possible", () => {
    const sel = selectOption(coque, axes, { Couleur: "Transparent" }, "Type de coque", "Givrée", ["Couleur"]);
    expect(sel).toEqual({ "Type de coque": "Givrée", Couleur: "Gris et orange" });
  });

  it("garde une couleur compatible et laisse choisir quand plusieurs restent possibles", () => {
    expect(selectOption(coque, axes, { Couleur: "Noir" }, "Type de coque", "Carbone")).toEqual({
      "Type de coque": "Carbone",
      Couleur: "Noir",
    });
    expect(selectOption(coque, axes, {}, "Type de coque", "Aspect cuir")).toEqual({
      "Type de coque": "Aspect cuir",
      Couleur: undefined,
    });
  });

  it("choisit une couleur disponible pour un axe visuel", () => {
    const sel = selectOption(coque, axes, {}, "Type de coque", "Aspect cuir", ["Couleur"]);
    expect(sel.Couleur).toBe("Marron");
  });

  it("affiche un prix par valeur seulement quand l'axe fixe le prix", () => {
    expect(optionPrices(coque, "Type de coque")).toEqual({
      "Transparente avec anneau": 1500,
      "Aspect cuir": 2500,
      Givrée: 5000,
      Carbone: 5000,
    });
    // « Noir » existe à 2 500 et 5 000 FCFA : pas de prix sur les couleurs.
    expect(optionPrices(coque, "Couleur")).toBeNull();
    // Même prix partout : rien à afficher.
    const tailles = ["42 mm", "44 mm"].map((t) => ({ options: { Taille: t }, price: 5000, available: 1 }));
    expect(optionPrices(tailles, "Taille")).toBeNull();
  });
});

describe("conseil avant commande", () => {
  it("adapte le conseil au type de produit", () => {
    expect(orderHint("protections-coques", axes, "Coque iPhone 16 Pro Max")).toMatch(/modèle exact/);
    expect(orderHint("protections-coques", ["Taille"], "Coque compatible Apple Watch")).toMatch(/gravée au dos/);
    expect(orderHint("montres", ["Taille"], "Bracelet compatible Apple Watch")).toMatch(/taille/);
    expect(orderHint("montres", [], "Montre connectée")).toBeNull();
    expect(orderHint("cables", [], "Câble USB-C")).toMatch(/USB-C ou Lightning/);
    expect(orderHint("jeux", [], "Manette")).toBeNull();
  });
});
