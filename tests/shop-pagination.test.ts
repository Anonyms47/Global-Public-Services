import { describe, expect, it } from "vitest";
import { PAGE_SIZE, parseShopQuery, shopQueryToParams, shownCount } from "@/components/shop/query";

describe("Voir plus : nombre d'articles affichés", () => {
  it("une page par défaut, par paquets entiers, borné", () => {
    expect(shownCount(undefined)).toBe(PAGE_SIZE);
    expect(shownCount(0)).toBe(PAGE_SIZE);
    expect(shownCount(10)).toBe(PAGE_SIZE);
    expect(shownCount(25)).toBe(PAGE_SIZE * 2);
    expect(shownCount(48)).toBe(48);
    expect(shownCount(100000)).toBe(480);
    expect(shownCount(Number.NaN)).toBe(PAGE_SIZE);
  });
  it("se lit dans l'adresse mais disparaît dès qu'un filtre change", () => {
    const q = parseShopQuery({ n: "48", marque: "Apple" });
    expect(q.n).toBe(48);
    expect(shopQueryToParams({ ...q, marque: ["Samsung"] }).has("n")).toBe(false);
  });
});
