import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { listCategories, publishedProducts } from "@/server/domain/catalog";
import { ShopListing } from "@/components/shop/ShopListing";
import { parseShopQuery } from "@/components/shop/query";

export async function generateMetadata({ searchParams }: PageProps<"/boutique">): Promise<Metadata> {
  const q = parseShopQuery(await searchParams);
  return {
    title: q.q ? `Recherche « ${q.q} »` : "Boutique",
    description:
      "Le catalogue GPS : téléphones, écouteurs, casques, chargeurs, accessoires, lunettes, chaussures et plus.",
    alternates: { canonical: "/boutique" },
  };
}

export default async function BoutiquePage({ searchParams }: PageProps<"/boutique">) {
  const { db } = await siteContext();
  const query = parseShopQuery(await searchParams);
  const [all, categories] = await Promise.all([publishedProducts(db), listCategories(db)]);
  const total = all.length;
  return (
    <>
      <div className="shop-hero container-site pt-8 pb-6 md:pt-14 md:pb-8">
        <p className="eyebrow hero-fade text-gps-red-ink" style={{ animationDelay: "0ms" }}>
          {query.q ? "Recherche" : "Catalogue GPS"}
        </p>
        <h1 className="mt-2 font-display text-[56px] leading-[0.9] font-extrabold uppercase md:text-[88px]">
          {query.q ? (
            <span className="hero-line block">
              Recherche <span className="text-gps-blue">« {query.q} »</span>
            </span>
          ) : (
            <>
              <span className="hero-line block md:inline-block">La</span>{" "}
              <span className="hero-line block md:inline-block" style={{ animationDelay: "90ms" }}>
                boutique<span className="text-gps-red">.</span>
              </span>
            </>
          )}
        </h1>
        {query.q ? null : (
          <p
            className="hero-fade mt-4 max-w-xl text-[16px] text-ink-soft md:text-lg"
            style={{ animationDelay: "200ms" }}
          >
            <strong className="text-ink tabular">{total}</strong> article{total > 1 ? "s" : ""} à découvrir. Vous
            commandez ici, GPS confirme avec vous sur WhatsApp : aucun paiement en ligne.
          </p>
        )}
      </div>
      <ShopListing all={all} query={query} basePath="/boutique" categories={categories} />
    </>
  );
}
