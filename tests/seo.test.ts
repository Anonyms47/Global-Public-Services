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

describe("données structurées : adresse et variantes", () => {
  it("« Dakar » seul n'est pas une adresse de rue", async () => {
    const { isStreetAddress, localBusinessJsonLd } = await import("@/lib/seo");
    expect(isStreetAddress("Dakar")).toBe(false);
    expect(isStreetAddress("")).toBe(false);
    expect(isStreetAddress("12 rue Carnot")).toBe(true);
    expect(isStreetAddress("Avenue Cheikh Anta Diop")).toBe(true);
    expect(isStreetAddress("Cité Keur Gorgui")).toBe(true);
    const ld = localBusinessJsonLd({
      company: { name: "GPS", phone: "", email: "", address: "Dakar", city: "Petit Mbao", mapsUrl: "" },
      stores: [],
      url: "https://x.test",
      logo: "https://x.test/l.png",
    });
    const a = ld.address as { streetAddress?: string; addressLocality?: string; addressRegion?: string };
    expect(a.streetAddress).toBeUndefined();
    expect(a.addressLocality).toBe("Petit Mbao");
    expect(a.addressRegion).toBe("Dakar");
  });

  const abs = (p: string) => `https://x.test${p}`;
  const base = {
    name: "Coque Aster 9",
    slug: "coque-aster-9",
    brand: "",
    description: "Coque de protection.",
    condition: "Neuf",
    axes: ["Type de coque", "Couleur"],
  };
  it("une seule variante : Product simple", async () => {
    const { productJsonLd } = await import("@/lib/seo");
    const ld = productJsonLd(
      {
        ...base,
        axes: [],
        images: [{ url: "/m/1", alt: "" }],
        variants: [{ sku: "A", options: {}, price: 1000, available: 2 }],
      },
      abs,
    );
    expect(ld["@type"]).toBe("Product");
  });
  it("plusieurs variantes : ProductGroup, chaque variante avec sa photo, jamais celle d'une autre", async () => {
    const { productJsonLd } = await import("@/lib/seo");
    const givree = { url: "/m/givree", alt: "", options: { "Type de coque": "Givrée", Couleur: "Gris" } };
    const ld = productJsonLd(
      {
        ...base,
        images: [givree],
        variants: [
          { sku: "G", options: { "Type de coque": "Givrée", Couleur: "Gris" }, price: 5000, available: 3 },
          { sku: "T", options: { "Type de coque": "Transparente", Couleur: "Transparent" }, price: 1500, available: 0 },
        ],
      },
      abs,
    ) as unknown as {
      "@type": string;
      variesBy: string[];
      hasVariant: { sku: string; image?: string[]; color?: string; offers: { availability: string; price: number } }[];
    };
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.variesBy).toEqual(["https://schema.org/color"]);
    expect(ld.hasVariant[0].image).toEqual(["https://x.test/m/givree"]);
    expect(ld.hasVariant[1].image).toBeUndefined();
    expect(ld.hasVariant[1].color).toBe("Transparent");
    expect(ld.hasVariant[1].offers.availability).toBe("https://schema.org/OutOfStock");
    expect(ld.hasVariant[0].offers.price).toBe(5000);
  });
});
