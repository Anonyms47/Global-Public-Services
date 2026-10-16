import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteContext, siteUrl } from "@/server/context";
import { publishedProductBySlug, publishedProducts, relatedProducts } from "@/server/domain/catalog";
import { ProductView, BackToResults } from "@/components/shop/ProductView";
import { ProductCard } from "@/components/shop/ProductCard";
import { IconArrowRight, IconChevronRight, IconStore, IconTruck, IconInfo, IconCheck } from "@/components/ui/icons";
import { TO_CONFIRM } from "@/lib/whatsapp";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";

export async function generateMetadata({ params }: PageProps<"/produits/[slug]">): Promise<Metadata> {
  const { db, indexable } = await siteContext();
  const p = await publishedProductBySlug(db, (await params).slug);
  if (!p) return { title: "Produit introuvable", robots: { index: false } };
  const image = p.images[0]?.url;
  return {
    title: `${p.name}${p.brand ? ` — ${p.brand}` : ""}`,
    description: p.description.slice(0, 160),
    alternates: { canonical: `/produits/${p.slug}` },
    openGraph: {
      title: p.name,
      description: p.description.slice(0, 160),
      images: image && !image.endsWith(".svg") ? [image] : undefined,
      type: "website",
    },
    robots: indexable ? undefined : { index: false, follow: false },
  };
}

function safeBack(depuis: string | string[] | undefined) {
  const v = Array.isArray(depuis) ? depuis[0] : depuis;
  return v && /^\/(boutique|categories)(\/|\?|$)/.test(v) ? v : null;
}

export default async function ProductPage({ params, searchParams }: PageProps<"/produits/[slug]">) {
  const { db, settings, indexable } = await siteContext();
  const { slug } = await params;
  const product = await publishedProductBySlug(db, slug);
  if (!product) notFound();
  const back = safeBack((await searchParams).depuis);
  const related = relatedProducts(await publishedProducts(db), product);
  const r = settings.reception;
  const pol = settings.policies;
  const toConfirm = TO_CONFIRM.charAt(0).toLowerCase() + TO_CONFIRM.slice(1);

  const jsonLd = indexable
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        description: product.description,
        image: product.images.map((i) => siteUrl(i.url)),
        offers: product.variants.map((v) => ({
          "@type": "Offer",
          sku: v.sku,
          price: v.price,
          priceCurrency: "XOF",
          availability: v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        })),
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <div className="container-site pt-4 pb-8 md:pt-8">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          {back ? <BackToResults href={back} /> : null}
          <nav aria-label="Fil d'Ariane" className="min-w-0 text-[14px] text-ink-mute">
            <ol className="flex min-w-0 items-center gap-1">
              <li className="shrink-0">
                <Link href="/boutique" className="hover:text-ink hover:underline">
                  Boutique
                </Link>
              </li>
              {product.categoryName ? (
                <li className="flex shrink-0 items-center gap-1">
                  <IconChevronRight size={14} aria-hidden="true" />
                  <Link href={`/categories/${product.categorySlug}`} className="hover:text-ink hover:underline">
                    {product.categoryName}
                  </Link>
                </li>
              ) : null}
              <li className="flex min-w-0 items-center gap-1">
                <IconChevronRight size={14} aria-hidden="true" className="shrink-0" />
                <span aria-current="page" className="truncate font-semibold text-ink">
                  {product.name}
                </span>
              </li>
            </ol>
          </nav>
        </div>

        <ProductView
          product={product}
          url={siteUrl(`/produits/${product.slug}`)}
          whatsapp={settings.company.whatsapp}
        />

        <div className="mt-14 grid gap-5 md:mt-20 lg:grid-cols-12 lg:gap-6">
          <section className="pdp-card lg:col-span-7" aria-labelledby="titre-description" data-reveal>
            <p className="eyebrow text-gps-red-ink">En détail</p>
            <h2 id="titre-description" className="mt-1 font-display text-4xl font-bold uppercase">
              Description
            </h2>
            <p className="mt-4 max-w-[65ch] text-[17px] leading-relaxed whitespace-pre-line text-ink-soft">
              {product.description}
            </p>
            {product.specs.length ? (
              <>
                <h3 className="mt-8 font-display text-2xl font-bold uppercase">Caractéristiques</h3>
                <dl className="mt-3 overflow-hidden rounded-[16px] border border-line">
                  {product.specs.map((s, i) => (
                    <div
                      key={s.label}
                      className={`grid grid-cols-[minmax(120px,40%)_1fr] gap-4 px-4 py-3 text-[15px] ${i % 2 ? "bg-card" : "bg-paper"}`}
                    >
                      <dt className="text-ink-mute">{s.label}</dt>
                      <dd className="font-semibold">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            {product.isDemo ? (
              <p className="mt-6 flex gap-2 rounded-[14px] bg-gps-blue-soft p-3 text-[14px] text-gps-blue">
                <IconInfo className="shrink-0" size={18} /> Produit d&apos;exemple pour la démonstration : nom, marque,
                prix, stock et visuels sont fictifs.
              </p>
            ) : null}
          </section>
          <aside
            className="pdp-card text-white lg:col-span-5"
            style={{ background: "var(--color-gps-blue-night)", borderColor: "transparent" }}
            aria-labelledby="titre-reception"
            data-reveal
          >
            <p className="eyebrow text-white/60">Après la commande</p>
            <h2 id="titre-reception" className="mt-1 font-display text-4xl font-bold uppercase">
              Réception & garantie
            </h2>
            <ul className="mt-5 grid gap-4">
              {r.pickupEnabled ? (
                <li className="flex gap-3">
                  <span className="pdp-icon !bg-white/10 !text-white">
                    <IconStore size={20} />
                  </span>
                  <div>
                    <p className="font-bold">Retrait en boutique</p>
                    <p className="text-[15px] text-white/70">{r.pickupDetails || `Lieu et délais : ${toConfirm}.`}</p>
                  </div>
                </li>
              ) : null}
              {r.deliveryEnabled ? (
                <li className="flex gap-3">
                  <span className="pdp-icon !bg-white/10 !text-white">
                    <IconTruck size={20} />
                  </span>
                  <div>
                    <p className="font-bold">Livraison</p>
                    <p className="text-[15px] text-white/70">
                      {r.deliveryDetails ||
                        (r.zones.length
                          ? `Zones : ${r.zones.map((z) => z.name).join(", ")}.`
                          : `Zones, délais et frais : ${toConfirm}.`)}
                    </p>
                  </div>
                </li>
              ) : null}
              <li className="flex gap-3">
                <span className="pdp-icon !bg-white/10 !text-white">
                  <IconCheck size={20} />
                </span>
                <div>
                  <p className="font-bold">Garantie</p>
                  <p className="text-[15px] text-white/70">{product.warranty || pol.warranty || `${TO_CONFIRM}.`}</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="pdp-icon !bg-white/10 !text-white">
                  <IconInfo size={20} />
                </span>
                <div>
                  <p className="font-bold">Paiement</p>
                  <p className="text-[15px] text-white/70">
                    Aucun paiement en ligne. {pol.payment || `Modalités : ${toConfirm}.`}
                  </p>
                </div>
              </li>
            </ul>
          </aside>
        </div>

        {related.length ? (
          <section className="mt-16 md:mt-24" aria-labelledby="titre-associes" data-reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-gps-red-ink">Dans le même esprit</p>
                <h2 id="titre-associes" className="mt-1 font-display text-4xl font-bold uppercase md:text-5xl">
                  À voir aussi
                </h2>
              </div>
              {product.categorySlug ? (
                <Link
                  href={`/categories/${product.categorySlug}`}
                  className="btn btn-outline btn-sm hidden sm:inline-flex"
                >
                  Tout l&apos;univers <IconArrowRight size={16} />
                </Link>
              ) : null}
            </div>
            <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-9 sm:gap-x-5 md:grid-cols-4">
              {related.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <RevealOnScroll />
    </>
  );
}
