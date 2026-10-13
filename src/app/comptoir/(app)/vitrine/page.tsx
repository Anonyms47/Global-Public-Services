import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { publishedProducts } from "@/server/domain/catalog";
import { getSettings } from "@/server/domain/settings";
import { listServices } from "@/server/domain/services";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { ServicesEditor, StorefrontEditor } from "@/components/admin/StorefrontEditor";

export const metadata: Metadata = { title: "Vitrine & services" };

export default async function StorefrontPage() {
  const { db, allowed } = await requirePage("storefront.edit");
  if (!allowed) return <Forbidden />;
  const [products, settings, services] = await Promise.all([publishedProducts(db), getSettings(db), listServices(db)]);
  const options = products.map((p) => ({
    id: p.id,
    name: p.name,
    image: p.images[0]?.url ?? null,
  }));
  return (
    <>
      <PageTitle eyebrow="Site public" title="Vitrine & services">
        Ce que voient les visiteurs sur l&apos;accueil, et les services de transfert d&apos;argent présentés sur le
        site.
      </PageTitle>
      <StorefrontEditor
        products={options}
        initial={{
          heroProductId: settings.storefront.heroProductId,
          focusProductId: settings.storefront.focusProductId,
          focusText: settings.storefront.focusText,
          storeText: settings.company.storeText,
          storePhotoUrl: settings.company.storePhotoUrl,
          selection: products
            .filter((p) => p.featured)
            .sort((a, b) => a.featuredPosition - b.featuredPosition)
            .map((p) => p.id),
        }}
      />
      <ServicesEditor services={services} />
    </>
  );
}
