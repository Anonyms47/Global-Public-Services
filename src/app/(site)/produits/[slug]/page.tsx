import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteContext, siteUrl } from "@/server/context";
import {
  publishedProductBySlug,
  publishedProducts,
  relatedProducts,
} from "@/server/domain/catalog";
import { ProductView, BackToResults } from "@/components/shop/ProductView";
import { ProductCard } from "@/components/shop/ProductCard";
import { IconStore, IconTruck, IconInfo } from "@/components/ui/icons";
import { TO_CONFIRM } from "@/lib/whatsapp";

export async function generateMetadata({
  params,
}: PageProps<"/produits/[slug]">): Promise<Metadata> {
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

export default async function ProductPage({
  params,
  searchParams,
}: PageProps<"/produits/[slug]">) {
  const { db, settings, indexable } = await siteContext();
  const { slug } = await params;
  const product = await publishedProductBySlug(db, slug);
  if (!product) notFound();
  const back = safeBack((await searchParams).depuis);
  const related = relatedProducts(await publishedProducts(db), product);
  const r = settings.reception;
  const pol = settings.policies;

  const jsonLd = indexable
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        brand: product.brand
          ? { "@type": "Brand", name: product.brand }
          : undefined,
        description: product.description,
        image: product.images.map((i) => siteUrl(i.url)),
        offers: product.variants.map((v) => ({
          "@type": "Offer",
          sku: v.sku,
          price: v.price,
          priceCurrency: "XOF",
          availability:
            v.available > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
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
          <nav aria-label="Fil d'Ariane" className="text-ink-mute text-[14px]">
            <Link href="/boutique" className="hover:underline">
              Boutique
            </Link>
            {product.categoryName ? (
              <>
                {" / "}
                <Link
                  href={`/categories/${product.categorySlug}`}
                  className="hover:underline"
                >
                  {product.categoryName}
                </Link>
              </>
            ) : null}
            {" / "}
            <span aria-current="page">{product.name}</span>
          </nav>
        </div>

        <ProductView
          product={product}
          url={siteUrl(`/produits/${product.slug}`)}
          whatsapp={settings.company.whatsapp}
        />

        <div className="border-line mt-16 grid gap-12 border-t pt-12 lg:grid-cols-12">
          <section
            className="lg:col-span-7"
            aria-labelledby="titre-description"
          >
            <h2
              id="titre-description"
              className="font-display text-4xl font-bold uppercase"
            >
              Description
            </h2>
            <p className="text-ink-soft mt-4 max-w-[65ch] text-[17px] leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
            {product.specs.length ? (
              <>
                <h3 className="font-display mt-10 text-2xl font-bold uppercase">
                  Caractéristiques
                </h3>
                <dl className="divide-line border-line mt-3 divide-y border-y">
                  {product.specs.map((s) => (
                    <div
                      key={s.label}
                      className="grid grid-cols-[minmax(120px,40%)_1fr] gap-4 py-3 text-[15px]"
                    >
                      <dt className="text-ink-mute">{s.label}</dt>
                      <dd className="font-semibold">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            {product.isDemo ? (
              <p className="bg-gps-blue-soft text-gps-blue mt-6 flex gap-2 rounded-[6px] p-3 text-[14px]">
                <IconInfo className="shrink-0" size={18} /> Produit
                d&apos;exemple pour la démonstration : nom, marque, prix, stock
                et visuels sont fictifs.
              </p>
            ) : null}
          </section>
          <aside className="lg:col-span-5" aria-labelledby="titre-reception">
            <h2
              id="titre-reception"
              className="font-display text-4xl font-bold uppercase"
            >
              Réception & garantie
            </h2>
            <ul className="divide-line border-line bg-card mt-4 divide-y rounded-[6px] border">
              {r.pickupEnabled ? (
                <li className="flex gap-3 p-4">
                  <IconStore className="text-gps-blue mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">Retrait en boutique</p>
                    <p className="text-ink-soft text-[15px]">
                      {r.pickupDetails ||
                        `Lieu et délais : ${TO_CONFIRM.toLowerCase()}.`}
                    </p>
                  </div>
                </li>
              ) : null}
              {r.deliveryEnabled ? (
                <li className="flex gap-3 p-4">
                  <IconTruck className="text-gps-blue mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold">Livraison</p>
                    <p className="text-ink-soft text-[15px]">
                      {r.deliveryDetails ||
                        (r.zones.length
                          ? `Zones : ${r.zones.map((z) => z.name).join(", ")}.`
                          : `Zones, délais et frais : ${TO_CONFIRM.toLowerCase()}.`)}
                    </p>
                  </div>
                </li>
              ) : null}
              <li className="flex gap-3 p-4">
                <IconInfo className="text-gps-blue mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Garantie</p>
                  <p className="text-ink-soft text-[15px]">
                    {pol.warranty || `${TO_CONFIRM}.`}
                  </p>
                </div>
              </li>
              <li className="flex gap-3 p-4">
                <IconInfo className="text-gps-blue mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">Paiement</p>
                  <p className="text-ink-soft text-[15px]">
                    Aucun paiement en ligne.{" "}
                    {pol.payment || `Modalités : ${TO_CONFIRM.toLowerCase()}.`}
                  </p>
                </div>
              </li>
            </ul>
          </aside>
        </div>

        {related.length ? (
          <section
            className="border-line mt-16 border-t pt-12"
            aria-labelledby="titre-associes"
          >
            <h2
              id="titre-associes"
              className="font-display text-4xl font-bold uppercase"
            >
              À voir aussi
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-4">
              {related.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
