import Link from "next/link";
import type { PublicProduct, ShopQuery } from "@/server/domain/catalog";
import { facets, filterProducts } from "@/server/domain/catalog";
import { ProductCard } from "./ProductCard";
import { ShopControls, ScrollMemory } from "./ShopControls";
import { shopQueryToParams } from "./query";

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

  return (
    <div className="container-site pb-8">
      <ScrollMemory listingKey={here} />
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
        <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
          {results.map((p, i) => (
            <li key={p.id}>
              <ProductCard product={p} priority={i < 4} from={here} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 rounded-[6px] border border-line bg-card px-6 py-12 text-center md:py-16">
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
          {!fixedCategory && categories.length ? (
            <ul className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Univers">
              {categories
                .filter((c) => c.product_count > 0)
                .map((c) => (
                  <li key={c.slug}>
                    <Link className="chip" href={`/categories/${c.slug}`}>
                      {c.name}
                    </Link>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
