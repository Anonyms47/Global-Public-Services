import type { MetadataRoute } from "next";
import { siteContext, siteUrl } from "@/server/context";
import { listCategories, publishedProducts } from "@/server/domain/catalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { db, indexable } = await siteContext();
  if (!indexable) return [];
  const [products, categories] = await Promise.all([publishedProducts(db), listCategories(db)]);
  const pages = [
    "",
    "/boutique",
    "/categories",
    "/services",
    "/a-propos",
    "/contact",
    "/faq",
    "/conditions-de-vente",
    "/confidentialite",
  ];
  return [
    ...pages.map((p) => ({ url: siteUrl(p) })),
    ...categories.filter((c) => c.product_count > 0).map((c) => ({ url: siteUrl(`/categories/${c.slug}`) })),
    ...products.map((p) => ({
      url: siteUrl(`/produits/${p.slug}`),
      lastModified: p.createdAt,
    })),
  ];
}
