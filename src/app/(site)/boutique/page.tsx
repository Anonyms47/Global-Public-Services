import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { listCategories, publishedProducts } from "@/server/domain/catalog";
import { ShopListing } from "@/components/shop/ShopListing";
import { parseShopQuery } from "@/components/shop/query";

export async function generateMetadata({
  searchParams,
}: PageProps<"/boutique">): Promise<Metadata> {
  const q = parseShopQuery(await searchParams);
  return {
    title: q.q ? `Recherche « ${q.q} »` : "Boutique",
    description:
      "Le catalogue GPS : téléphones, écouteurs, casques, chargeurs, accessoires, lunettes, chaussures et plus.",
    alternates: { canonical: "/boutique" },
  };
}

export default async function BoutiquePage({
  searchParams,
}: PageProps<"/boutique">) {
  const { db } = await siteContext();
  const query = parseShopQuery(await searchParams);
  const [all, categories] = await Promise.all([
    publishedProducts(db),
    listCategories(db),
  ]);
  return (
    <>
      <div className="container-site pt-8 pb-6 md:pt-12">
        <p className="eyebrow text-gps-red-ink">Catalogue</p>
        <h1 className="font-display mt-2 text-[56px] leading-[0.9] font-extrabold uppercase md:text-[80px]">
          {query.q ? (
            <>
              Recherche <span className="text-gps-blue">« {query.q} »</span>
            </>
          ) : (
            "La boutique"
          )}
        </h1>
      </div>
      <ShopListing
        all={all}
        query={query}
        basePath="/boutique"
        categories={categories}
      />
    </>
  );
}
