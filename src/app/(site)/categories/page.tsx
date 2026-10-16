import type { Metadata } from "next";
import Link from "next/link";
import { siteContext } from "@/server/context";
import { listCategories, publishedProducts } from "@/server/domain/catalog";
import { ProductImage } from "@/components/shop/ProductImage";
import { fcfa } from "@/lib/format";

export const metadata: Metadata = {
  title: "Univers",
  description: "Les univers produits de GPS.",
};

export default async function CategoriesPage() {
  const { db } = await siteContext();
  const [categories, products] = await Promise.all([listCategories(db), publishedProducts(db)]);
  const list = categories.filter((c) => c.product_count > 0);
  return (
    <div className="container-site pt-8 pb-8 md:pt-12">
      <p className="eyebrow text-gps-red-ink">Catégories</p>
      <h1 className="mt-2 font-display text-[56px] leading-[0.9] font-extrabold uppercase md:text-[80px]">
        Les univers GPS
      </h1>
      {list.length === 0 ? <p className="mt-8 text-ink-soft">Aucun article publié pour le moment.</p> : null}
      <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-6 md:gap-x-6">
        {list.map((c, i) => {
          const items = products.filter((p) => p.categorySlug === c.slug);
          const min = Math.min(...items.map((p) => p.minPrice));
          // Rythme : deux grandes cases puis des cases plus petites.
          const span = i < 2 ? "col-span-2 md:col-span-3" : "col-span-1 md:col-span-2";
          return (
            <li key={c.id} className={span}>
              <Link href={`/categories/${c.slug}`} className="group block">
                <div className="overflow-hidden rounded-[6px] bg-paper-deep">
                  <ProductImage
                    src={c.image_url ?? items[0]?.images[0]?.url}
                    alt=""
                    sizes={i < 2 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 33vw"}
                    className={`${i < 2 ? "aspect-[16/10]" : "aspect-[4/5]"} transition-transform duration-300 group-hover:scale-[1.02]`}
                  />
                </div>
                <h2 className="mt-3 font-display text-[28px] leading-none font-bold uppercase group-hover:text-gps-blue md:text-[36px]">
                  {c.name}
                </h2>
                <p className="mt-1 text-[14px] text-ink-mute">
                  {c.product_count} article{c.product_count > 1 ? "s" : ""}
                  {Number.isFinite(min) ? ` · dès ${fcfa(min)}` : ""}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
