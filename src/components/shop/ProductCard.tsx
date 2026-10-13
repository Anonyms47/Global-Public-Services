import Link from "next/link";
import type { PublicProduct } from "@/server/domain/catalog";
import { ProductImage } from "./ProductImage";
import { Price } from "./Price";

export function availabilityText(
  p: Pick<PublicProduct, "available" | "variants">,
) {
  if (p.available === 0) return { text: "Épuisé", tone: "out" as const };
  const out = p.variants.filter((v) => v.available === 0).length;
  if (out > 0)
    return { text: "Certaines options épuisées", tone: "partial" as const };
  if (p.available <= 3)
    return { text: "Derniers articles", tone: "low" as const };
  return { text: "Disponible", tone: "ok" as const };
}

/**
 * Carte produit sobre : le visuel porte la carte, sans ombre.
 * `layout="wide"` sert aux mises en avant (cadrage plus large, texte à côté).
 */
export function ProductCard({
  product,
  layout = "tall",
  priority,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  from,
  imageClassName = "",
}: {
  product: PublicProduct;
  layout?: "tall" | "wide";
  priority?: boolean;
  sizes?: string;
  from?: string;
  imageClassName?: string;
}) {
  const prices = new Set(product.variants.map((v) => v.price));
  const image = product.images[0];
  const a = availabilityText(product);
  const href = `/produits/${product.slug}${from ? `?depuis=${encodeURIComponent(from)}` : ""}`;
  return (
    <article
      className={`group relative ${layout === "wide" ? "grid gap-4 sm:grid-cols-2 sm:items-end" : ""}`}
    >
      <div className="bg-paper-deep relative overflow-hidden rounded-[6px]">
        <ProductImage
          src={image?.url}
          alt={image?.alt ?? product.name}
          sizes={sizes}
          priority={priority}
          className={`${imageClassName} transition-transform duration-300 ease-out group-hover:scale-[1.02]`}
        />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          {product.promo ? (
            <span className="bg-gps-red rounded-[4px] px-2 py-1 text-[12px] font-extrabold text-white">
              {product.promo.label}
            </span>
          ) : null}
          {product.condition && product.condition !== "Neuf" ? (
            <span className="text-ink rounded-[4px] bg-white px-2 py-1 text-[12px] font-bold">
              {product.condition.split(" —")[0]}
            </span>
          ) : null}
        </div>
        {product.isDemo ? (
          <span className="bg-ink/70 absolute right-2 bottom-2 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
            Illustration
          </span>
        ) : null}
      </div>
      <div className={layout === "wide" ? "" : "mt-3"}>
        <p className="text-ink-mute text-[13px] font-semibold">
          {product.brand}
          {product.categoryName ? (
            <span className="sr-only">, {product.categoryName}</span>
          ) : null}
        </p>
        <h3
          className={`leading-snug font-bold ${layout === "wide" ? "font-display text-3xl uppercase" : "text-[15px] md:text-base"}`}
        >
          <Link
            href={href}
            className="[&:focus-visible]:after:outline-gps-blue after:absolute after:inset-0 focus-visible:outline-none [&:focus-visible]:after:outline-3"
          >
            {product.name}
          </Link>
        </h3>
        <Price
          price={product.minPrice}
          basePrice={product.promo ? product.minBasePrice : undefined}
          from={prices.size > 1}
          size={layout === "wide" ? "lg" : "md"}
          className="mt-1"
        />
        <p
          className={`mt-1 text-[13px] font-semibold ${
            a.tone === "out"
              ? "text-gps-red-ink"
              : a.tone === "ok"
                ? "text-wa-ink"
                : "text-warn"
          }`}
        >
          {a.text}
        </p>
      </div>
    </article>
  );
}
