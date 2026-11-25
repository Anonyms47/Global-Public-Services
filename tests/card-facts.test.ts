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
    expect(facts).toEqual(["6,7 pouces · 60 Hz", "5 000 mAh"]);
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

describe("valeurs courtes : seulement ce qui est écrit", () => {
  it("écran : taille et fréquence, sans le nom de la technologie tronqué", async () => {
    const { shortFact } = await import("@/lib/card-facts");
    expect(shortFact("Écran", "Super Retina XDR OLED 6,1 pouces, ProMotion 120 Hz")).toBe("6,1 pouces · 120 Hz");
    expect(shortFact("Écran", "8,7 pouces LCD (1340 × 800), 90 Hz")).toBe("8,7 pouces · 90 Hz");
    expect(shortFact("Écran", "6.7 pouces")).toBe("6,7 pouces");
    // Sans taille lisible : on ne devine rien, on coupe proprement.
    expect(shortFact("Écran", "OLED très lumineux")).toBe("OLED très lumineux");
  });
  it("batterie, puissance, stockage", async () => {
    const { shortFact } = await import("@/lib/card-facts");
    expect(shortFact("Batterie", "5 000 mAh, charge rapide 25 W")).toBe("5 000 mAh");
    expect(shortFact("Batterie", "40 000 mAh")).toBe("40 000 mAh");
    expect(shortFact("Puissance maximale", "45 W annoncés")).toBe("45 W");
    expect(shortFact("Puissance maximale", "22,5 W annoncés")).toBe("22,5 W");
    expect(shortFact("Stockage", "256 Go (extensible)")).toBe("256 Go");
    expect(shortFact("Stockage", "à relever")).toBe("à relever");
  });
});

describe("valeurs incertaines", () => {
  it("jamais affichées sur une carte", () => {
    expect(
      cardFacts([
        { label: "Stockage", value: "à relever" },
        { label: "Batterie", value: "5 000 mAh ?" },
        { label: "Écran", value: "6,5 pouces" },
      ]),
    ).toEqual(["6,5 pouces"]);
  });
});
