import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { listCategories } from "@/server/domain/catalog";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { ProductFormClient } from "@/components/admin/ProductForm";
import { videoMaxMb } from "@/server/domain/media";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage() {
  const { db, user, allowed } = await requirePage("catalog.edit");
  if (!allowed) return <Forbidden />;
  const categories = await listCategories(db);
  return (
    <>
      <PageTitle eyebrow="Catalogue" title="Nouveau produit">
        Présenter, configurer, publier. Vous pouvez enregistrer un brouillon à tout moment.
      </PageTitle>
      <ProductFormClient
        videoMaxMb={videoMaxMb()}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        canCosts={can(user, "catalog.costs")}
        initial={{
          name: "",
          brand: "",
          categoryId: null,
          description: "",
          specs: [],
          condition: null,
          axes: [],
          axisValues: {},
          images: [],
          variants: [{ sku: "", options: {}, price: 0, initialStock: 0 }],
          status: "draft",
          featured: false,
        }}
      />
    </>
  );
}
