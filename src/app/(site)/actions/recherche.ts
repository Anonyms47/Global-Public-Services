"use server";

import { getDb } from "@/server/db";
import { filterProducts, publishedProducts } from "@/server/domain/catalog";

export interface SearchHit {
  slug: string;
  name: string;
  brand: string;
  category: string | null;
  image: string | null;
  price: number;
  basePrice: number;
  available: boolean;
}

/** Recherche instantanée du site public : articles publiés uniquement. */
export async function searchProducts(raw: string): Promise<{ hits: SearchHit[]; total: number }> {
  const q = String(raw ?? "")
    .trim()
    .slice(0, 80);
  if (q.length < 2) return { hits: [], total: 0 };
  try {
    const db = await getDb();
    const found = filterProducts(await publishedProducts(db), { q });
    return {
      total: found.length,
      hits: found.slice(0, 6).map((p) => ({
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        category: p.categoryName,
        image: p.images[0]?.url ?? null,
        price: p.minPrice,
        basePrice: p.minBasePrice,
        available: p.available > 0,
      })),
    };
  } catch (error) {
    console.error(error);
    return { hits: [], total: 0 };
  }
}
