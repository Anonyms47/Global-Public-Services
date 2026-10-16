import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@/server/admin";
import { siteContext, siteUrl } from "@/server/context";
import { previewProductById } from "@/server/domain/catalog";
import { can } from "@/lib/permissions";
import { ProductView } from "@/components/shop/ProductView";

export const metadata: Metadata = { title: "Aperçu", robots: { index: false, follow: false } };

/**
 * Aperçu d'un produit tel qu'il apparaîtra sur le site, brouillons compris.
 * Réservé à l'équipe connectée au Comptoir ; affiché dans le cadre de l'aperçu
 * téléphone / ordinateur.
 */
export default async function PreviewPage({ params }: PageProps<"/apercu/[id]">) {
  const user = await currentUser();
  if (!user || !can(user, "catalog.view")) notFound();
  const { db, settings } = await siteContext();
  const product = await previewProductById(db, (await params).id);
  if (!product) notFound();
  return (
    <div className="container-site pt-4 pb-8 md:pt-8">
      <p className="mb-4 rounded-[6px] bg-gps-blue-soft px-3 py-2 text-[14px] font-semibold text-gps-blue">
        Aperçu du Comptoir — version enregistrée, visible par l&apos;équipe uniquement.
      </p>
      <ProductView product={product} url={siteUrl(`/produits/${product.slug}`)} whatsapp={settings.company.whatsapp} />
      {product.description ? (
        <section className="pdp-card mt-10">
          <h2 className="font-display text-3xl font-bold uppercase">Description</h2>
          <p className="mt-3 max-w-[65ch] text-[17px] leading-relaxed whitespace-pre-line text-ink-soft">
            {product.description}
          </p>
        </section>
      ) : null}
    </div>
  );
}
