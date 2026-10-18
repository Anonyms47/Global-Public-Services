import Link from "next/link";
import type { PublicProduct } from "@/server/domain/catalog";
import { ProductImage } from "./ProductImage";
import { Price } from "./Price";
import { IconArrowRight } from "../ui/icons";

export function availabilityText(p: Pick<PublicProduct, "available" | "variants" | "stockTracked">) {
  // Stock non suivi : seul un article désactivé (manquant) est signalé.
  if (!p.stockTracked) return p.available === 0 ? { text: "Indisponible", tone: "out" as const } : null;
  if (p.available === 0) return { text: "Épuisé", tone: "out" as const };
  const out = p.variants.filter((v) => v.available === 0).length;
  if (out > 0) return { text: "Certaines options épuisées", tone: "partial" as const };
  if (p.available <= 3) return { text: "Derniers articles", tone: "low" as const };
  return { text: "Disponible", tone: "ok" as const };
}

/**
 * Carte produit : visuel arrondi qui porte la carte, seconde photo au survol,
 * pastilles (promo, état, disponibilité) posées sur l'image.
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
  const second = product.images[1];
  const a = availabilityText(product);
  const href = `/produits/${product.slug}${from ? `?depuis=${encodeURIComponent(from)}` : ""}`;
  return (
    <article
      className={`product-card group relative ${layout === "wide" ? "grid gap-4 sm:grid-cols-2 sm:items-end" : ""}`}
    >
      <div className="product-card-media relative overflow-hidden rounded-[18px] bg-paper-deep">
        <ProductImage
          src={image?.url}
          alt={image?.alt ?? product.name}
          sizes={sizes}
          priority={priority}
          className={`${imageClassName} transition-transform duration-700 ease-out group-hover:scale-[1.04]`}
        />
        {second ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          >
            <ProductImage src={second.url} alt="" sizes={sizes} className={`${imageClassName} !h-full`} />
          </div>
        ) : null}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {product.promo ? <span className="card-pill card-pill-red">{product.promo.label}</span> : null}
          {product.condition && product.condition !== "Neuf" ? (
            <span className="card-pill">{product.condition.split(" —")[0]}</span>
          ) : null}
        </div>
        {product.isDemo ? (
          <span className="absolute bottom-2.5 left-2.5 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase backdrop-blur-sm">
            Illustration
          </span>
        ) : null}
        <span aria-hidden="true" className="card-go absolute right-2.5 bottom-2.5">
          <IconArrowRight size={17} />
        </span>
      </div>
      <div className={layout === "wide" ? "" : "mt-3 px-0.5"}>
        <p className="text-[11.5px] font-bold tracking-[0.08em] text-ink-mute uppercase">
          {product.brand}
          {product.categoryName ? <span className="sr-only">, {product.categoryName}</span> : null}
        </p>
        <h3
          className={`mt-0.5 leading-snug font-bold ${layout === "wide" ? "font-display text-3xl uppercase" : "text-[15px] md:text-base"}`}
        >
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-[18px] focus-visible:outline-none [&:focus-visible]:after:outline-3 [&:focus-visible]:after:outline-offset-4 [&:focus-visible]:after:outline-gps-blue"
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
        {a ? <p className={`stock-dot stock-${a.tone} mt-1.5 text-[12.5px] font-semibold`}>{a.text}</p> : null}
      </div>
    </article>
  );
}
