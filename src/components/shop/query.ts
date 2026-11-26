import type { ShopQuery, SortKey } from "@/server/domain/catalog";
import { parseAttr, serializeAttr } from "@/lib/attributes";

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const num = (v: string | undefined) => {
  if (!v) return undefined;
  const n = Number(v.replace(/\s/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

/** Articles affichés d'un coup ; « Voir plus » en ajoute autant. */
export const PAGE_SIZE =
  Number(process.env.NEXT_PUBLIC_SHOP_PAGE_SIZE) > 0 ? Number(process.env.NEXT_PUBLIC_SHOP_PAGE_SIZE) : 24;
const MAX_SHOWN = 480;

/** Nombre d'articles à montrer d'après `?n=` : multiple de PAGE_SIZE, entre une page et MAX_SHOWN. */
export function shownCount(n: number | undefined) {
  if (!n || !Number.isFinite(n)) return PAGE_SIZE;
  return Math.min(MAX_SHOWN, Math.max(PAGE_SIZE, Math.ceil(n / PAGE_SIZE) * PAGE_SIZE));
}

/** Tri par défaut : pertinence pendant une recherche, sinon les plus récents. */
export const defaultSort = (q?: string): SortKey => (q ? "pertinence" : "nouveautes");

/** Lit les paramètres d'URL (partageables) de la boutique. */
export function parseShopQuery(sp: Params): ShopQuery {
  const marque = sp.marque;
  const brands = (Array.isArray(marque) ? marque : marque ? marque.split(",") : [])
    .map((m) => m.trim())
    .filter(Boolean);
  const tri = first(sp.tri);
  const attrs = (Array.isArray(sp.a) ? sp.a : sp.a ? [sp.a] : [])
    .slice(0, 12)
    .map(parseAttr)
    .filter((a): a is NonNullable<typeof a> => !!a);
  return {
    q: first(sp.q)?.trim().slice(0, 80) || undefined,
    categorie: first(sp.categorie) || undefined,
    marque: brands.length ? brands : undefined,
    prixMin: num(first(sp.prix_min)),
    prixMax: num(first(sp.prix_max)),
    dispo: first(sp.dispo) === "1" || undefined,
    promo: first(sp.promo) === "1" || undefined,
    etat: first(sp.etat) || undefined,
    attrs: attrs.length ? attrs : undefined,
    n: num(first(sp.n)),
    tri: (["pertinence", "nouveautes", "prix-asc", "prix-desc"] as SortKey[]).includes(tri as SortKey)
      ? (tri as SortKey)
      : defaultSort(first(sp.q)?.trim()),
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
  for (const a of q.attrs ?? []) p.append("a", serializeAttr(a));
  if (q.tri && q.tri !== defaultSort(q.q)) p.set("tri", q.tri);
  return p;
}
