import { describe, expect, it } from "vitest";
import {
  brandIndex,
  brandKey,
  brandLooksLikeModel,
  isGenericName,
  isNotABrand,
  median,
  nameTokens,
  normalizeProductName,
  priceLooksWrong,
  showcaseIssues,
  similarity,
} from "@/lib/catalog-rules";

describe("règles du catalogue", () => {
  it("marques : même marque malgré la casse, valeurs qui ne sont pas des marques", () => {
    expect(brandKey("TDKC313")).toBe(brandKey("Tdkc313"));
    const idx = brandIndex(["TDKC313", "TDKC313", "Tdkc313", " Oraimo ", "oraimo", ""]);
    expect(idx.get(brandKey("tdkc313"))).toBe("TDKC313");
    expect(idx.get("oraimo")).toBe("Oraimo");
    expect(idx.size).toBe(2);
    expect(isNotABrand("Chaussures")).toBe(true);
    expect(isNotABrand("Earphone")).toBe(true);
    expect(isNotABrand("Montres", ["Montres"])).toBe(true);
    expect(isNotABrand("Plokama", ["Création de contenu"])).toBe(false);
    expect(isNotABrand("")).toBe(false);
    expect(brandLooksLikeModel("Samsung galaxie A06")).toBe(true);
    expect(brandLooksLikeModel("Oraimo")).toBe(false);
    expect(brandLooksLikeModel("TDKC313")).toBe(false);
  });

  it("noms : casse, unités, ponctuation et « Galaxy »", () => {
    expect(normalizeProductName("Galaxie   S22 ultra")).toBe("Galaxy S22 ultra");
    expect(normalizeProductName("Galaxie Tab A11    128go")).toBe("Galaxy Tab A11 128 Go");
    expect(normalizeProductName("Galaxie Tab A11.      256go")).toBe("Galaxy Tab A11 256 Go");
    expect(normalizeProductName("13 pro 256go")).toBe("13 pro 256 Go");
    expect(normalizeProductName("Chargeur Super Fast. 27w")).toBe("Chargeur Super Fast 27 W");
    expect(normalizeProductName("Rgb led")).toBe("RGB LED");
    expect(normalizeProductName("batterie externe 60000mah")).toBe("Batterie externe 60000 mAh");
    expect(normalizeProductName("câble usb-c vers lightning")).toBe("Câble USB-C vers lightning");
    // Rien d'autre ne change : marques, modèles et mots courants restent tels quels.
    expect(normalizeProductName("Hublot Classic Fusion")).toBe("Hublot Classic Fusion");
    expect(normalizeProductName("Galaxie du bonheur")).toBe("Galaxie du bonheur");
    expect(normalizeProductName("  Oraimo   OpenCirclet 2 ")).toBe("Oraimo OpenCirclet 2");
  });

  it("prix manifestement faux signalés, jamais corrigés ; noms vagues", () => {
    for (const bad of [11111111, 7777777, 99999999, 6_000_000, 5]) expect(priceLooksWrong(bad)).toBe(true);
    for (const ok of [0, 1500, 255000, 295000, 999999]) expect(priceLooksWrong(ok)).toBe(false);
    expect(median([1, 9, 3])).toBe(3);
    expect(median([2, 4, 6, 8])).toBe(5);
    for (const g of ["Samsung", "Tablette", "Chaussures", "iPhone", "Airpod", " IPHONE "])
      expect(isGenericName(g)).toBe(true);
    // Un nom de marque de luxe ou un nom précis n'est pas « vague ».
    for (const n of ["Cartier", "Hublot Classic Fusion", "iPhone 13 Pro — 256 Go", "Samsung Galaxy A06"])
      expect(isGenericName(n)).toBe(false);
  });

  it("vedette : une fiche incomplète n'est jamais mise en avant", () => {
    const ok = {
      name: "Samsung Galaxy A06 4G",
      description: "Smartphone Samsung avec écran de 6,7 pouces et batterie de 5 000 mAh.",
      imageCount: 2,
      minPrice: 70000,
    };
    expect(showcaseIssues(ok)).toEqual([]);
    expect(showcaseIssues({ ...ok, imageCount: 0 })).toContain("sans photo");
    expect(showcaseIssues({ ...ok, description: "" })).toContain("sans description");
    expect(showcaseIssues({ ...ok, name: "iPhone" })).toContain("nom trop vague");
    expect(showcaseIssues({ ...ok, minPrice: 11111111 })).toContain("prix à vérifier");
    expect(showcaseIssues({ name: "iPhone", description: "", imageCount: 12, minPrice: 11111111 })).toHaveLength(3);
  });

  it("ressemblance des noms : Galaxie = Galaxy, mots vides ignorés", () => {
    expect(nameTokens("Coque pour iPhone 16 Pro Max")).toEqual(["coque", "iphone", "16", "pro", "max"]);
    expect(similarity("Galaxie A06", "Samsung Galaxy A06")).toBeGreaterThan(0.5);
    expect(similarity("Coque iPhone 16 Pro", "Coque iPhone 16 Pro Max")).toBeGreaterThan(0.7);
    expect(similarity("Coque iPhone 16", "Câble USB-C")).toBe(0);
    expect(similarity("", "Coque")).toBe(0);
  });
});
