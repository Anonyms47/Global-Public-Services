import { describe, expect, it } from "vitest";
import {
  clip,
  localBusinessJsonLd,
  openingHoursSpec,
  plainDescription,
  productMetaDescription,
  productTitle,
  schemaCondition,
} from "@/lib/seo";

const raw =
  "64 go\n\nPoints forts :\n• Écran 6,7 pouces\n• Batterie 5 000 mAh\n\nContenu de la boîte : câble\n\nDisponible en stock";

describe("descriptions pour les moteurs de recherche", () => {
  it("retire puces, titres de liste et promesse de stock", () => {
    const t = plainDescription(raw);
    expect(t).not.toContain("•");
    expect(t).not.toContain("\n");
    expect(t.toLowerCase()).not.toContain("disponible en stock");
    expect(t).toContain("Écran 6,7 pouces");
  });
  it("coupe à la fin d'un mot et ne dépasse pas la limite", () => {
    const c = clip("Un texte assez long pour devoir être raccourci proprement sans couper un mot en deux", 40);
    expect(c.length).toBeLessThanOrEqual(40);
    expect(c.endsWith("…")).toBe(true);
    expect(c).not.toMatch(/\s…$/);
    expect(clip("court", 40)).toBe("court");
  });
  it("retombe sur une phrase neutre quand la fiche n'a rien", () => {
    expect(productMetaDescription({ name: "Montres hublots", brand: "", description: "" })).toBe(
      "Montres hublots, à commander chez GPS.",
    );
  });
  it("ne double pas la marque déjà dans le nom", () => {
    expect(productTitle({ name: "Écouteurs OKMAX KM-813", brand: "OKMAX" })).toBe("Écouteurs OKMAX KM-813");
    expect(productTitle({ name: "Galaxy A07", brand: "Samsung" })).toBe("Galaxy A07 — Samsung");
    expect(productTitle({ name: "Chaussures", brand: "" })).toBe("Chaussures");
  });
});

describe("données structurées", () => {
  it("état de l'article reconnu, sinon omis", () => {
    expect(schemaCondition("Neuf")).toBe("https://schema.org/NewCondition");
    expect(schemaCondition("Occasion — très bon état")).toBe("https://schema.org/UsedCondition");
    expect(schemaCondition("Inconnu")).toBeUndefined();
    expect(schemaCondition(null)).toBeUndefined();
  });
  it("horaires : seulement les jours confirmés", () => {
    expect(openingHoursSpec({ open: "09:00", close: "20:00", days: {} })).toBeUndefined();
    const spec = openingHoursSpec({
      open: "09:00",
      close: "20:00",
      days: { mon: { enabled: true }, tue: { enabled: false }, wed: { enabled: true, open: "10:00" } },
    });
    expect(spec).toHaveLength(2);
    expect(spec?.[1]).toMatchObject({ dayOfWeek: "Wednesday", opens: "10:00", closes: "20:00" });
  });
  it("commerce local : champs vides omis, rien d'inventé", () => {
    const ld = localBusinessJsonLd({
      company: { name: "GPS", phone: "", email: "", address: "", city: "", mapsUrl: "" },
      stores: [],
      url: "https://x.test",
      logo: "https://x.test/l.png",
    });
    expect(ld.address).toBeUndefined();
    expect(ld.telephone).toBeUndefined();
    expect(ld.openingHoursSpecification).toBeUndefined();
    expect(ld["@type"]).toBe("Store");
  });
});

describe("téléphone des données structurées", () => {
  it("format international, jamais un numéro trop court", async () => {
    const { internationalPhone } = await import("@/lib/seo");
    expect(internationalPhone("221771760836")).toBe("+221771760836");
    expect(internationalPhone("+221 77 176 08 36")).toBe("+221771760836");
    expect(internationalPhone("123")).toBeUndefined();
    expect(internationalPhone("")).toBeUndefined();
  });
});
