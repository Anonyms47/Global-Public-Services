import { describe, expect, it } from "vitest";
import {
  attributeFacets,
  matchesAttrs,
  parseAttr,
  productAttr,
  serializeAttr,
  ATTRIBUTES,
  type WithSpecs,
} from "@/lib/attributes";
import { parseShopQuery, shopQueryToParams } from "@/components/shop/query";

const coque = (model: string | null): WithSpecs => ({
  specs: model ? [{ label: "Téléphone compatible", value: model }] : [],
});
const charger = (w: string | null): WithSpecs => ({
  specs: w ? [{ label: "Puissance maximale", value: w }] : [],
});

describe("filtres de rayon : seulement avec des données fiables", () => {
  it("coques : le modèle compatible devient un filtre (renseigné presque partout, plusieurs valeurs)", () => {
    const list = [coque("iPhone 13"), coque("iPhone 13"), coque("iPhone 14"), coque("Galaxy A54"), coque(null)];
    const f = attributeFacets(list);
    expect(f).toHaveLength(1);
    expect(f[0].key).toBe("compat");
    expect(f[0].values.find((v) => v.value === "iPhone 13")?.count).toBe(2);
  });
  it("trop peu d'articles renseignés, une seule valeur ou un petit rayon : aucun filtre", () => {
    expect(attributeFacets([charger("45 W"), charger(null), charger(null), charger(null), charger("20 W")])).toEqual(
      [],
    );
    expect(attributeFacets([charger("45 W"), charger("45 W"), charger("45 W"), charger("45 W")])).toEqual([]);
    expect(attributeFacets([charger("45 W"), charger("20 W")])).toEqual([]);
  });
  it("valeurs normalisées : « 45 W annoncés » et « 45 W » sont la même puissance", () => {
    const f = attributeFacets([charger("45 W annoncés"), charger("45 W"), charger("20 W"), charger("20 W annoncés")]);
    expect(f[0].values).toEqual([
      { value: "20 W", count: 2 },
      { value: "45 W", count: 2 },
    ]);
  });
  it("une valeur « à relever » n'est jamais un critère", () => {
    const def = ATTRIBUTES.find((d) => d.key === "stockage")!;
    expect(productAttr(def, { specs: [{ label: "Stockage", value: "à relever" }] })).toBeUndefined();
    expect(
      productAttr(def, { specs: [{ label: "Stockage", value: "256 Go (extensible)", private: true }] }),
    ).toBeUndefined();
    expect(productAttr(def, { specs: [{ label: "Stockage", value: "256 Go (extensible)" }] })).toBe("256 Go");
  });
});

describe("filtres : combinaison et adresse partageable", () => {
  const p = {
    specs: [
      { label: "Téléphone compatible", value: "iPhone 13" },
      { label: "Puissance maximale", value: "45 W" },
    ],
  };
  it("une valeur ou l'autre pour un même critère, tous les critères ensemble", () => {
    expect(matchesAttrs(p, undefined)).toBe(true);
    expect(matchesAttrs(p, [{ key: "compat", value: "iPhone 13" }])).toBe(true);
    expect(
      matchesAttrs(p, [
        { key: "compat", value: "iPhone 14" },
        { key: "compat", value: "iPhone 13" },
      ]),
    ).toBe(true);
    expect(
      matchesAttrs(p, [
        { key: "compat", value: "iPhone 13" },
        { key: "puissance", value: "20 W" },
      ]),
    ).toBe(false);
    expect(matchesAttrs(p, [{ key: "inconnu", value: "x" }])).toBe(false);
    expect(matchesAttrs({ specs: [] }, [{ key: "compat", value: "iPhone 13" }])).toBe(false);
  });
  it("lecture et écriture de l'adresse, séparateur au premier « : »", () => {
    expect(parseAttr("compat:iPhone 13")).toEqual({ key: "compat", value: "iPhone 13" });
    expect(parseAttr("ports:USB-C: 2")).toEqual({ key: "ports", value: "USB-C: 2" });
    expect(parseAttr("nimporte:x")).toBeNull();
    expect(parseAttr("compat:")).toBeNull();
    const q = parseShopQuery({ a: ["compat:iPhone 13", "puissance:45 W"], categorie: "x" });
    expect(q.attrs).toHaveLength(2);
    expect(shopQueryToParams(q).getAll("a")).toEqual(["compat:iPhone 13", "puissance:45 W"]);
    expect(serializeAttr({ key: "compat", value: "A" })).toBe("compat:A");
    expect(parseShopQuery({ a: "bidon" }).attrs).toBeUndefined();
  });
});

describe("rayons très fournis en valeurs (coques)", () => {
  it("jusqu'à 40 valeurs distinctes ; au-delà, pas de filtre", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => coque(`Modèle ${i}`));
    expect(attributeFacets(many(25))[0].values).toHaveLength(25);
    expect(attributeFacets(many(41))).toEqual([]);
  });
  it("tri naturel des valeurs : 9 avant 13", () => {
    const f = attributeFacets([coque("iPhone 13"), coque("iPhone 9"), coque("iPhone 11"), coque("iPhone 13")]);
    expect(f[0].values.map((v) => v.value)).toEqual(["iPhone 9", "iPhone 11", "iPhone 13"]);
  });
});
