import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteContext } from "@/server/context";
import {
  categoryBySlug,
  listCategories,
  publishedProducts,
} from "@/server/domain/catalog";
import { ShopListing } from "@/components/shop/ShopListing";
import { parseShopQuery } from "@/components/shop/query";

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { db } = await siteContext();
  const cat = await categoryBySlug(db, (await params).slug);
  if (!cat) return { title: "Univers introuvable" };
  return {
    title: cat.name,
    description: cat.description || `${cat.name} chez GPS.`,
    alternates: { canonical: `/categories/${cat.slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">) {
  const { db } = await siteContext();
  const { slug } = await params;
  const cat = await categoryBySlug(db, slug);
  if (!cat) notFound();
  const query = parseShopQuery(await searchParams);
  const [all, categories] = await Promise.all([
    publishedProducts(db),
    listCategories(db),
  ]);
  return (
    <>
      <div className="container-site pt-8 pb-6 md:pt-12">
        <nav aria-label="Fil d'Ariane" className="text-ink-mute text-[14px]">
          <Link href="/categories" className="hover:underline">
            Univers
          </Link>{" "}
          / <span aria-current="page">{cat.name}</span>
        </nav>
        <h1 className="font-display mt-2 text-[56px] leading-[0.9] font-extrabold uppercase md:text-[80px]">
          {cat.name}
        </h1>
        {cat.description ? (
          <p className="text-ink-soft mt-3 max-w-xl">{cat.description}</p>
        ) : null}
      </div>
      <ShopListing
        all={all}
        query={query}
        basePath={`/categories/${cat.slug}`}
        categories={categories}
        fixedCategory={cat.slug}
      />
    </>
  );
}
