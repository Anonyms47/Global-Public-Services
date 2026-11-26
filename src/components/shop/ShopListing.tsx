import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicProduct, ShopQuery } from "@/server/domain/catalog";
import { facets, filterProducts } from "@/server/domain/catalog";
import { ProductCard } from "./ProductCard";
import { ShopControls, ScrollMemory } from "./ShopControls";
import { shopQueryToParams, shownCount, PAGE_SIZE } from "./query";
import { IconSearch } from "../ui/icons";
import { categoryCover } from "@/lib/home";
import { attributeFacets } from "@/lib/attributes";

/** Liste de la boutique, partagée par /boutique et /categories/[slug]. */
export function ShopListing({
  all,
  query,
  basePath,
  categories,
  fixedCategory,
}: {
  all: PublicProduct[];
  query: ShopQuery;
  basePath: string;
  categories: { slug: string; name: string; product_count: number }[];
  fixedCategory?: string;
}) {
  const scope = fixedCategory ? all.filter((p) => p.categorySlug === fixedCategory) : all;
  const results = filterProducts(scope, {
    ...query,
    categorie: fixedCategory ?? query.categorie,
  });
  const f = facets(scope);
  // Critères propres au rayon : seulement dans un rayon choisi, et seulement s'ils sont fiables.
  const attrScope = fixedCategory
    ? scope
    : query.categorie
      ? all.filter((p) => p.categorySlug === query.categorie)
      : [];
  const attrFacets = attributeFacets(attrScope);
  const params = shopQueryToParams(query, { omitCategory: !!fixedCategory });
  const shown = shownCount(query.n);
  // Clé de la liste : les filtres seuls (« Voir plus » ajoute des cartes sans tout réafficher).
  const filtersKey = `${basePath}${params.size ? `?${params}` : ""}`;
  // Lieu exact d'où l'on ouvre une fiche : inclut le nombre d'articles chargés, pour y revenir tel quel.
  const hereParams = new URLSearchParams(params);
  if (shown > PAGE_SIZE) hereParams.set("n", String(shown));
  const here = `${basePath}${hereParams.size ? `?${hereParams}` : ""}`;
  const visible = results.slice(0, shown);
  const remaining = results.length - visible.length;
  const moreParams = new URLSearchParams(params);
  moreParams.set("n", String(shown + PAGE_SIZE));
  const moreHref = `${basePath}?${moreParams}`;

  const univers = fixedCategory ? [] : categories.filter((c) => c.product_count > 0);
  const linkFor = (categorie?: string) => {
    // Changer de rayon efface les critères propres à l'ancien rayon.
    const p = shopQueryToParams({ ...query, categorie, attrs: undefined });
    return `${basePath}${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="container-site pb-8">
      <ScrollMemory listingKey={here} />
      {univers.length ? (
        <nav aria-label="Univers" className="univers-rail -mx-[16px] mb-5 px-[16px] sm:mx-0 sm:px-0">
          <ul className="flex gap-2 overflow-x-auto pb-1">
            <li>
              <Link
                href={linkFor(undefined)}
                aria-current={!query.categorie ? "page" : undefined}
                className="rail-pill"
                scroll={false}
              >
                <span className="rail-thumb rail-thumb-all" aria-hidden="true">
                  GPS
                </span>
                Tout
                <span className="rail-count tabular">{all.length}</span>
              </Link>
            </li>
            {univers.map((c) => {
              const cover = categoryCover(c, all);
              const img = cover ? { url: cover } : undefined;
              return (
                <li key={c.slug}>
                  <Link
                    href={linkFor(c.slug)}
                    aria-current={query.categorie === c.slug ? "page" : undefined}
                    className="rail-pill"
                    scroll={false}
                  >
                    <span className="rail-thumb" aria-hidden="true">
                      {img ? (
                        <Image
                          src={img.url}
                          alt=""
                          width={64}
                          height={64}
                          unoptimized={img.url.endsWith(".svg")}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    {c.name}
                    <span className="rail-count tabular">{c.product_count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      <ShopControls
        basePath={basePath}
        query={query}
        facets={f}
        attrFacets={attrFacets}
        categories={
          fixedCategory
            ? []
            : categories.filter((c) => c.product_count > 0).map((c) => ({ slug: c.slug, name: c.name }))
        }
        count={results.length}
      />
      {results.length ? (
        <>
          <h2 className="sr-only">Articles</h2>
          <ul
            key={filtersKey}
            className="mt-6 grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4"
          >
            {visible.map((p, i) => (
              <li key={p.id} className="card-in" style={{ "--i": Math.min(i, 11) } as CSSProperties}>
                <ProductCard product={p} priority={i < 2} from={here} />
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="text-[14px] text-ink-mute">
                {visible.length} articles affichés sur {results.length}
              </p>
              <Link href={moreHref} scroll={false} className="btn btn-outline min-h-11">
                Voir {Math.min(PAGE_SIZE, remaining)} article{Math.min(PAGE_SIZE, remaining) > 1 ? "s" : ""} de plus
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-8 rounded-[24px] border border-line bg-card px-6 py-12 text-center md:py-16">
          <span
            aria-hidden="true"
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-gps-blue-soft text-gps-blue"
          >
            <IconSearch size={28} />
          </span>
          <p className="font-display text-4xl font-bold uppercase">Aucun article ne correspond</p>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">
            {query.q ? (
              <>
                Rien pour « <strong>{query.q}</strong> » avec ces critères. Vérifiez l&apos;orthographe, essayez une
                marque ou une référence, ou retirez un filtre.
              </>
            ) : (
              "Retirez un filtre ou élargissez la fourchette de prix."
            )}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href={basePath} className="btn btn-ink">
              Effacer les filtres
            </Link>
            <Link href="/contact" className="btn btn-outline">
              Demander un article à GPS
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
