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

describe("recherche : pertinence", () => {
  it("« iphone 13 » ne retourne plus une coque iPhone 16 Pro Max à cause de sa référence", () => {
    const r = rankBySearch("iphone 13", all);
    expect(r).not.toContain(coque16pm);
    expect(r).not.toContain(phone16);
    expect(r[0]).toBeDefined();
  });
  it("le modèle exact passe avant tout, les autres modèles de la famille ne sont pas équivalents", () => {
    const r = rankBySearch("iphone 13", all);
    expect(r).toContain(phone13);
    expect(r).toContain(coque13);
    expect(r).not.toContain(phone13pro);
    expect(r).not.toContain(coque13pm);
  });
  it("« 13 pro » ne retient pas l'iPhone 13 simple", () => {
    const r = rankBySearch("iphone 13 pro", all);
    expect(r).toContain(phone13pro);
    expect(r).not.toContain(phone13);
    expect(r).not.toContain(coque13);
  });
  it("un chiffre doit correspondre exactement", () => {
    expect(searchScore("iphone 1", [phone13][0])).toBe(0);
    expect(searchScore("a5", a54)).toBe(0);
    expect(searchScore("a54", a54)).toBeGreaterThan(0);
    expect(searchScore("a 54", a54)).toBeGreaterThan(0);
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
