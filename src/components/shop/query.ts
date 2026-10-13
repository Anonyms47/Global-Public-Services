import type { ShopQuery, SortKey } from "@/server/domain/catalog";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | undefined) => {
  if (!v) return undefined;
  const n = Number(v.replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

/** Lit les paramètres d'URL (partageables) de la boutique. */
export function parseShopQuery(sp: Params): ShopQuery {
  const marque = sp.marque;
  const brands = (Array.isArray(marque) ? marque : marque ? marque.split(",") : [])
    .map((m) => m.trim())
    .filter(Boolean);
  const tri = first(sp.tri);
  return {
    q: first(sp.q)?.trim().slice(0, 80) || undefined,
    categorie: first(sp.categorie) || undefined,
    marque: brands.length ? brands : undefined,
    prixMin: num(first(sp.prix_min)),
    prixMax: num(first(sp.prix_max)),
    dispo: first(sp.dispo) === "1" || undefined,
    promo: first(sp.promo) === "1" || undefined,
    etat: first(sp.etat) || undefined,
    tri: (["nouveautes", "prix-asc", "prix-desc"] as SortKey[]).includes(tri as SortKey)
      ? (tri as SortKey)
      : "nouveautes",
  };
}

export function shopQueryToParams(q: ShopQuery, opts: { omitCategory?: boolean } = {}) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.categorie && !opts.omitCategory) p.set("categorie", q.categorie);
  if (q.marque?.length) p.set("marque", q.marque.join(","));
  if (q.prixMin != null) p.set("prix_min", String(q.prixMin));
  if (q.prixMax != null) p.set("prix_max", String(q.prixMax));
  if (q.dispo) p.set("dispo", "1");
  if (q.promo) p.set("promo", "1");
  if (q.etat) p.set("etat", q.etat);
  if (q.tri && q.tri !== "nouveautes") p.set("tri", q.tri);
  return p;
}
