import { describe, expect, it } from "vitest";
import { availableNeeds, displayPhone, distinctLegalName, priorityUnivers, type HomeCategory } from "@/lib/home";

const cat = (slug: string, position: number, n: number, featured = false): HomeCategory => ({
  slug,
  name: slug,
  position,
  product_count: n,
  featured,
});

describe("accueil : univers prioritaires", () => {
  const all = [
    cat("telephones", 0, 13),
    cat("airpods-ecouteurs", 1, 6),
    cat("casques", 2, 3),
    cat("chargeurs", 3, 10),
    cat("accessoires", 4, 1),
    cat("lunettes", 5, 0),
    cat("montres", 7, 10),
    cat("batteries-externes", 10, 3),
    cat("informatique", 11, 4),
    cat("protections-coques", 16, 30),
  ];
  it("six univers au plus, dans l'ordre du Comptoir, sans univers vide ni presque vide", () => {
    const r = priorityUnivers(all).map((c) => c.slug);
    expect(r).toEqual(["telephones", "airpods-ecouteurs", "casques", "chargeurs", "montres", "batteries-externes"]);
  });
  it("les univers épinglés au Comptoir passent d'abord et seuls", () => {
    const pinned = all.map((c) =>
      c.slug === "protections-coques" || c.slug === "accessoires" ? { ...c, featured: true } : c,
    );
    expect(priorityUnivers(pinned).map((c) => c.slug)).toEqual(["accessoires", "protections-coques"]);
  });
  it("catalogue très petit : on garde ce qui existe", () => {
    expect(priorityUnivers([cat("a", 0, 1), cat("b", 1, 2)]).map((c) => c.slug)).toEqual(["a", "b"]);
    expect(priorityUnivers([])).toEqual([]);
  });
});

describe("accueil : entrées par besoin", () => {
  it("seulement des univers réels et non vides", () => {
    const needs = availableNeeds([
      cat("chargeurs", 3, 10),
      cat("protections-coques", 16, 30),
      cat("creation-de-contenu", 12, 0),
    ]);
    expect(needs.map((n) => n.key)).toEqual(["charger", "proteger"]);
    expect(needs[1].count).toBe(30);
  });
});

describe("pied de page", () => {
  it("raison sociale identique au nom commercial : non répétée", () => {
    expect(distinctLegalName("GPS — Global Public Services", "GPS - Global Public Services")).toBe("");
    expect(distinctLegalName("GPS Services SARL", "GPS — Global Public Services")).toBe("GPS Services SARL");
    expect(distinctLegalName("", "GPS")).toBe("");
  });
  it("numéro sénégalais lisible, autres formats inchangés", () => {
    expect(displayPhone("221771760836")).toBe("+221 77 176 08 36");
    expect(displayPhone("+221 77 176 08 36")).toBe("+221 77 176 08 36");
    expect(displayPhone("0771760836")).toBe("0771760836");
  });
});

describe("couvertures d'univers", () => {
  const p = (name: string, slug: string, urls: string[], ready = true) => ({
    name,
    categorySlug: slug,
    images: urls.map((url) => ({ url })),
    ready,
  });
  it("la couverture choisie au Comptoir passe toujours avant", async () => {
    const { categoryCover } = await import("@/lib/home");
    expect(
      categoryCover({ slug: "cables", name: "Câbles", image_url: "/choisie" }, [p("Câble USB", "cables", ["/a"])]),
    ).toBe("/choisie");
  });
  it("un univers est représenté par un article qui en porte le nom, pas par le plus récent", async () => {
    const { categoryCover } = await import("@/lib/home");
    const cables = [
      p("Écouteurs filaires", "cables", ["/ecouteurs"]),
      p("Câble USB-C vers Lightning — 2 m", "cables", ["/cable"]),
    ];
    expect(categoryCover({ slug: "cables", name: "Câbles" }, cables)).toBe("/cable");
    const casques = [
      p("Écouteurs tour de cou Oraimo", "casques", ["/tour-de-cou"]),
      p("Casque sans fil Oraimo BoomPop Lite", "casques", ["/casque"]),
    ];
    expect(categoryCover({ slug: "casques", name: "Casques" }, casques)).toBe("/casque");
    expect(
      categoryCover({ slug: "airpods-ecouteurs", name: "AirPods & écouteurs" }, [
        p("Écouteurs sans fil", "airpods-ecouteurs", ["/e"]),
      ]),
    ).toBe("/e");
  });
  it("sans nom correspondant : premier article complet illustré ; sans photo : rien", async () => {
    const { categoryCover } = await import("@/lib/home");
    const list = [
      p("Kit Plokama", "creation-de-contenu", ["/k"], false),
      p("Anneau lumineux", "creation-de-contenu", ["/a", "/b"], true),
    ];
    expect(categoryCover({ slug: "creation-de-contenu", name: "Création de contenu" }, list)).toBe("/a");
    expect(categoryCover({ slug: "x", name: "X" }, [p("Truc", "x", [])])).toBeUndefined();
  });
});

describe("accueil : une fiche dépubliée ou archivée disparaît de toutes les sélections", () => {
  it("vedette, héros et sélection ne reprennent jamais une fiche non publiée", async () => {
    const { demoDb } = await import("./helpers");
    const { publishedProducts } = await import("@/server/domain/catalog");
    const db = await demoDb();
    const before = await publishedProducts(db);
    const target = before.find((p) => p.featured) ?? before[0];
    expect(target).toBeDefined();
    await db.query("update products set featured = true where id = $1", [target.id]);
    expect((await publishedProducts(db)).some((p) => p.id === target.id)).toBe(true);
    await db.query("update products set status = 'draft' where id = $1", [target.id]);
    expect((await publishedProducts(db)).some((p) => p.id === target.id)).toBe(false);
    await db.query("update products set status = 'published', deleted_at = now() where id = $1", [target.id]);
    expect((await publishedProducts(db)).some((p) => p.id === target.id)).toBe(false);
  });
});
