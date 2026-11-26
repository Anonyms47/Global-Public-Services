import { describe, expect, it } from "vitest";
import { safeBackUrl } from "@/lib/safe-back";
import { parseShopQuery, shopQueryToParams } from "@/components/shop/query";

describe("retour aux résultats : adresse de provenance", () => {
  it("accepte la boutique et les univers, avec le nombre d'articles chargés", () => {
    expect(safeBackUrl("/boutique")).toBe("/boutique");
    expect(safeBackUrl("/boutique?n=48")).toBe("/boutique?n=48");
    expect(safeBackUrl("/categories/protections-coques?a=compat%3AiPhone+13&n=72")).toBe(
      "/categories/protections-coques?a=compat%3AiPhone+13&n=72",
    );
    expect(safeBackUrl("/boutique?q=iphone+13&tri=prix-asc&marque=Apple&prix_min=1000&dispo=1&n=96")).toContain("n=96");
  });
  it("refuse tout ce qui sort de la boutique ou des univers", () => {
    for (const bad of [
      "https://evil.test/boutique",
      "//evil.test/boutique",
      "/\\evil.test",
      "/comptoir",
      "/comptoir/catalogue",
      "/boutique/../comptoir",
      "/boutique/..%2fcomptoir",
      "/categories/../comptoir",
      "/categories/",
      "/categories/Slug Avec Espace",
      "/panier",
      "/boutique?redirect=/comptoir",
      "javascript:alert(1)",
      "/boutique\n/x",
      "",
      undefined,
    ])
      expect(safeBackUrl(bad as string | undefined), String(bad)).toBeNull();
  });
  it("prend la première valeur si le paramètre est répété", () => {
    expect(safeBackUrl(["/boutique?n=48", "/comptoir"])).toBe("/boutique?n=48");
    expect(safeBackUrl(["/comptoir", "/boutique"])).toBeNull();
  });
  it("une adresse produite par la boutique (recherche, tri, filtres, n) est toujours acceptée", () => {
    const q = parseShopQuery({
      q: "coque iphone 13",
      tri: "prix-asc",
      marque: "Apple",
      prix_min: "1000",
      dispo: "1",
      a: ["compat:iPhone 13"],
      n: "48",
    });
    const p = shopQueryToParams(q);
    p.set("n", "48");
    const url = `/boutique?${p}`;
    expect(safeBackUrl(url)).toBe(url);
  });
});
