import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicProduct, ShopQuery } from "@/server/domain/catalog";
import { facets, filterProducts } from "@/server/domain/catalog";
import { ProductCard } from "./ProductCard";
import { ShopControls, ScrollMemory } from "./ShopControls";
import { shopQueryToParams } from "./query";
import { IconSearch } from "../ui/icons";

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
  const params = shopQueryToParams(query, { omitCategory: !!fixedCategory });
  const here = `${basePath}${params.size ? `?${params}` : ""}`;

  const univers = fixedCategory ? [] : categories.filter((c) => c.product_count > 0);
  const linkFor = (categorie?: string) => {
    const p = shopQueryToParams({ ...query, categorie });
    return `${basePath}${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="container-site pb-8">
      <ScrollMemory listingKey={here} />
      {univers.length ? (
        <nav aria-label="Univers" className="univers-rail -mx-4 mb-5 px-4 sm:mx-0 sm:px-0">
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
              const img = all.find((p) => p.categorySlug === c.slug)?.images[0];
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
        categories={
          fixedCategory
            ? []
            : categories.filter((c) => c.product_count > 0).map((c) => ({ slug: c.slug, name: c.name }))
        }
        count={results.length}
      />
      {results.length ? (
        <ul key={here} className="mt-6 grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
          {results.map((p, i) => (
            <li key={p.id} className="card-in" style={{ "--i": Math.min(i, 11) } as CSSProperties}>
              <ProductCard product={p} priority={i < 4} from={here} />
            </li>
          ))}
        </ul>
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
