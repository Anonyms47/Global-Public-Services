import { describe, expect, it } from "vitest";
import { parseDescription } from "@/lib/description";

describe("description d'une fiche", () => {
  it("une puce par ligne : phrase, liste titrée, paragraphe", () => {
    const b = parseDescription(
      "Montre chronographe sportive.\n\nPoints forts :\n• Cadran noir\n• Lunette tachymètre\n\nContenu de la boîte : câble",
    );
    expect(b).toEqual([
      { type: "p", text: "Montre chronographe sportive." },
      { type: "list", title: "Points forts :", items: ["Cadran noir", "Lunette tachymètre"] },
      { type: "p", text: "Contenu de la boîte : câble" },
    ]);
  });

  it("puces collées sur une ligne : vraie liste", () => {
    expect(parseDescription("Points forts : • Écran 6,7 pouces • Batterie 5 000 mAh • Double SIM")).toEqual([
      { type: "list", title: "Points forts :", items: ["Écran 6,7 pouces", "Batterie 5 000 mAh", "Double SIM"] },
    ]);
    expect(parseDescription("• Rapide • Compact")).toEqual([{ type: "list", items: ["Rapide", "Compact"] }]);
    expect(parseDescription("Points forts : • Un seul point")).toEqual([
      { type: "list", title: "Points forts :", items: ["Un seul point"] },
    ]);
  });

  it("tirets et lignes répétées, texte simple", () => {
    expect(parseDescription("Avantages\n- Léger\n- Solide")).toEqual([
      { type: "p", text: "Avantages" },
      { type: "list", items: ["Léger", "Solide"] },
    ]);
    expect(parseDescription("Même ligne\nMême ligne")).toEqual([{ type: "p", text: "Même ligne\nMême ligne" }]);
    expect(parseDescription("  \n ")).toEqual([]);
    // Un tiret dans une phrase n'est pas une puce.
    expect(parseDescription("Câble USB-C - 1 m de long")).toEqual([{ type: "p", text: "Câble USB-C - 1 m de long" }]);
  });

  it("suivi des quantités désactivé : aucune annonce de disponibilité", () => {
    const text = "Smartphone Samsung.\n\nDisponible en stock";
    expect(parseDescription(text)).toHaveLength(2);
    expect(parseDescription(text, { dropStockClaims: true })).toEqual([{ type: "p", text: "Smartphone Samsung." }]);
    expect(parseDescription("En stock immédiatement", { dropStockClaims: true })).toEqual([]);
    // Une phrase qui parle de stock sans l'annoncer reste.
    expect(parseDescription("Le stock est géré en boutique.", { dropStockClaims: true })).toHaveLength(1);
  });
});
