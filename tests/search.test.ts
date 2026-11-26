import { describe, expect, it } from "vitest";
import { rankBySearch, searchScore, tokens, type SearchableProduct } from "@/lib/search";

const p = (name: string, extra: Partial<SearchableProduct> = {}): SearchableProduct => ({
  name,
  brand: "",
  categoryName: null,
  specs: [],
  variants: [],
  ...extra,
});

const coque16pm = p("Coque iPhone 16 Pro Max", {
  categoryName: "Protections & coques",
  specs: [{ label: "Téléphone compatible", value: "iPhone 16 Pro Max" }],
  variants: [{ sku: "COQUEDET-IPHO-13-GIV-GRI", options: { Couleur: "Gris et orange", "Type de coque": "Givrée" } }],
});
const coque13 = p("Coque iPhone 13", {
  categoryName: "Protections & coques",
  specs: [{ label: "Téléphone compatible", value: "iPhone 13" }],
  variants: [{ sku: "COQ-13", options: {} }],
});
const coque13pm = p("Coque iPhone 13 Pro Max", {
  categoryName: "Protections & coques",
  specs: [{ label: "Téléphone compatible", value: "iPhone 13 Pro Max" }],
});
const phone13pro = p("iPhone 13 Pro — 256 Go", { brand: "Apple", categoryName: "Téléphones" });
const phone13 = p("iPhone 13 — 128 Go", { brand: "Apple", categoryName: "Téléphones" });
const phone16 = p("iPhone 16", { brand: "Apple", categoryName: "Téléphones" });
const a54 = p("Galaxy A54", { brand: "Samsung", categoryName: "Téléphones" });
const chargeur = p("Chargeur USB-C 45 W", {
  categoryName: "Chargeurs",
  variants: [{ sku: "CHG-USBC-45W", options: {} }],
});
const all = [coque16pm, coque13, coque13pm, phone13pro, phone13, phone16, a54, chargeur];

describe("recherche : téléphones, familles et accessoires", () => {
  const phone13pm = p("iPhone 13 Pro Max — 256 Go", { brand: "Apple", categoryName: "Téléphones" });
  const phone16pm = p("iPhone 16 Pro Max — 256 Go", { brand: "Apple", categoryName: "Téléphones" });
  const coque13pro = p("Coque iPhone 13 Pro", {
    categoryName: "Protections & coques",
    specs: [{ label: "Téléphone compatible", value: "iPhone 13 Pro" }],
  });
  const world = [
    coque16pm,
    coque13,
    coque13pm,
    coque13pro,
    phone13pro,
    phone13,
    phone13pm,
    phone16,
    phone16pm,
    a54,
    chargeur,
  ];
  const names = (q: string) => rankBySearch(q, world).map((x) => x.name);

  it("« iphone 13 » présente les téléphones de la famille 13, le modèle exact d'abord", () => {
    const r = names("iphone 13");
    expect(r[0]).toBe("iPhone 13 — 128 Go");
    expect(r).toContain("iPhone 13 Pro — 256 Go");
    expect(r).toContain("iPhone 13 Pro Max — 256 Go");
    expect(r.indexOf("iPhone 13 — 128 Go")).toBeLessThan(r.indexOf("iPhone 13 Pro — 256 Go"));
    // Jamais un autre modèle (16) ni une coque réservée à un autre modèle.
    expect(r).not.toContain("iPhone 16");
    expect(r).not.toContain("Coque iPhone 16 Pro Max");
    expect(r).not.toContain("Coque iPhone 13 Pro");
    expect(r).not.toContain("Coque iPhone 13 Pro Max");
  });
  it("téléphones avant accessoires quand on ne cherche pas d'accessoire", () => {
    const r = names("iphone 13");
    const lastPhone = Math.max(...r.filter((n) => !n.startsWith("Coque")).map((n) => r.indexOf(n)));
    expect(r.indexOf("Coque iPhone 13")).toBeGreaterThan(lastPhone);
  });
  it("« iphone 13 pro » : le Pro et le Pro Max (famille), pas le 13 simple ; coque Pro seulement pour la recherche de coque", () => {
    const r = names("iphone 13 pro");
    expect(r[0]).toBe("iPhone 13 Pro — 256 Go");
    expect(r).toContain("iPhone 13 Pro Max — 256 Go");
    expect(r).not.toContain("iPhone 13 — 128 Go");
    expect(r).not.toContain("Coque iPhone 13");
  });
  it("« coque iphone 13 » : uniquement la coque faite pour le 13", () => {
    expect(names("coque iphone 13")).toEqual(["Coque iPhone 13"]);
  });
  it("« coque iphone 13 pro » : la coque du 13 Pro, ni celle du 13 ni celle du 13 Pro Max", () => {
    expect(names("coque iphone 13 pro")).toEqual(["Coque iPhone 13 Pro"]);
  });
  it("« iphone 16 pro max » : ce modèle et sa coque, pas le 16 Pro ni le 16", () => {
    const r = names("iphone 16 pro max");
    expect(r).toContain("iPhone 16 Pro Max — 256 Go");
    expect(r).toContain("Coque iPhone 16 Pro Max");
    expect(r).not.toContain("iPhone 16");
    expect(r[0]).toBe("iPhone 16 Pro Max — 256 Go");
  });
  it("même logique pour Samsung et les tablettes", () => {
    const a54plus = p("Galaxy A54 5G", { brand: "Samsung", categoryName: "Téléphones" });
    const cA54 = p("Coque Samsung Galaxy A54", {
      categoryName: "Protections & coques",
      specs: [{ label: "Téléphone compatible", value: "Samsung Galaxy A54" }],
    });
    const cA34 = p("Coque Samsung Galaxy A34", {
      categoryName: "Protections & coques",
      specs: [{ label: "Téléphone compatible", value: "Samsung Galaxy A34" }],
    });
    const tab = p("Galaxy Tab A11", { brand: "Samsung", categoryName: "Tablettes" });
    const tabPlus = p("Galaxy Tab A11 Plus", { brand: "Samsung", categoryName: "Tablettes" });
    const list = [a54, a54plus, cA54, cA34, tab, tabPlus];
    const r = (q: string) => rankBySearch(q, list).map((x) => x.name);
    expect(r("galaxy a54")).toEqual(["Galaxy A54", "Galaxy A54 5G", "Coque Samsung Galaxy A54"]);
    expect(r("coque galaxy a54")).toEqual(["Coque Samsung Galaxy A54"]);
    expect(r("tab a11")).toEqual(["Galaxy Tab A11", "Galaxy Tab A11 Plus"]);
    expect(r("galaxy tab a11 plus")).toEqual(["Galaxy Tab A11 Plus"]);
  });
  it("une référence interne ne crée jamais une fausse compatibilité", () => {
    const r = names("ipho 13");
    expect(r).not.toContain("Coque iPhone 16 Pro Max");
    expect(names("COQUEDET-IPHO-13-GIV-GRI")).toEqual(["Coque iPhone 16 Pro Max"]);
  });
  it("un chiffre doit correspondre exactement", () => {
    expect(searchScore("iphone 1", [phone13][0])).toBe(0);
    expect(searchScore("a5", a54)).toBe(0);
    expect(searchScore("a54", a54)).toBeGreaterThan(0);
    expect(searchScore("a 54", a54)).toBeGreaterThan(0);
  });
  it("téléphone / smartphone et écouteurs / ecouteur", () => {
    const buds = p("Écouteurs sans fil Oraimo", { categoryName: "AirPods & écouteurs" });
    expect(searchScore("ecouteur", buds)).toBeGreaterThan(0);
    expect(searchScore("ÉCOUTEURS", buds)).toBeGreaterThan(0);
    expect(searchScore("smartphone", p("Galaxy A54", { categoryName: "Téléphones" }))).toBeGreaterThan(0);
    expect(searchScore("telephone", p("Galaxy A54", { categoryName: "Smartphones" }))).toBeGreaterThan(0);
  });
  it("accents, casse, pluriel et synonymes", () => {
    expect(searchScore("TÉLÉPHONES", phone13)).toBeGreaterThan(0);
    expect(searchScore("smartphone iphone", phone13)).toBeGreaterThan(0);
    expect(searchScore("coques", coque13)).toBeGreaterThan(0);
    expect(searchScore("case iphone 13", coque13)).toBeGreaterThan(0);
    expect(searchScore("iphone13", phone13)).toBeGreaterThan(0);
  });
  it("la catégorie compte moins que le nom", () => {
    const named = p("Chargeur rapide", { categoryName: "Accessoires" });
    const categorised = p("Boîtier", { categoryName: "Chargeurs" });
    const r = rankBySearch("chargeur", [categorised, named]);
    expect(r[0]).toBe(named);
  });
  it("une référence exacte reste trouvable, un mot isolé de la référence ne suffit pas", () => {
    expect(searchScore("COQUEDET-IPHO-13-GIV-GRI", coque16pm)).toBeGreaterThan(500);
    expect(searchScore("coquedet-ipho-13", coque16pm)).toBeGreaterThan(0);
    expect(searchScore("ipho 13", coque16pm)).toBe(0);
    expect(searchScore("chg-usbc-45w", chargeur)).toBeGreaterThan(500);
    expect(searchScore("45", chargeur)).toBeGreaterThan(0); // via le nom
  });
  it("recherche vide ou sans lien : aucun résultat", () => {
    expect(rankBySearch("", all)).toEqual([]);
    expect(rankBySearch("xyz", all)).toEqual([]);
  });
  it("découpe lettres et chiffres", () => {
    expect(tokens("iPhone13Pro")).toEqual(["iphone", "13", "pro"]);
  });
});
