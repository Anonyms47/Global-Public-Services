import { describe, expect, it } from "vitest";
import { cardFacts, isNew } from "@/lib/card-facts";

describe("faits clés d'une carte produit", () => {
  it("reprend les valeurs courtes dans l'ordre utile, sans inventer ni montrer le privé", () => {
    const facts = cardFacts([
      { label: "Référence fabricant", value: "OPN-672", private: true },
      { label: "Batterie", value: "5 000 mAh, charge rapide 25 W" },
      { label: "Écran", value: "6,7 pouces HD+ (720 × 1600), 60 Hz" },
      { label: "Couleur", value: "Noir" },
    ]);
    expect(facts).toEqual(["6,7 pouces HD+", "5 000 mAh"]);
  });

  it("limite à trois faits, coupe les valeurs longues, écarte un « Type » isolé", () => {
    const many = cardFacts([
      { label: "Écran", value: "8,7 pouces LCD" },
      { label: "Stockage", value: "128 Go" },
      { label: "Batterie", value: "5 100 mAh" },
      { label: "Autonomie", value: "jusqu'à 16 h" },
    ]);
    expect(many).toHaveLength(3);
    expect(cardFacts([{ label: "Type", value: "Chargeur secteur" }])).toEqual([]);
    expect(
      cardFacts([{ label: "Compatibilité", value: "Un texte vraiment très long qui dépasse la limite" }])[0].length,
    ).toBeLessThanOrEqual(24);
    expect(cardFacts([])).toEqual([]);
  });

  it("nouveauté : moins de 21 jours seulement", () => {
    const now = Date.parse("2026-11-24T12:00:00Z");
    expect(isNew("2026-11-10T00:00:00Z", 21, now)).toBe(true);
    expect(isNew("2026-10-20T00:00:00Z", 21, now)).toBe(false);
    expect(isNew("2026-12-01T00:00:00Z", 21, now)).toBe(false);
    expect(isNew("pas une date", 21, now)).toBe(false);
  });
});
