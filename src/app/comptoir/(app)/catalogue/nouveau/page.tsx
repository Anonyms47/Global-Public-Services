import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { listCategories, productForEdit } from "@/server/domain/catalog";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { ProductFormClient } from "@/components/admin/ProductForm";
import { videoMaxMb } from "@/server/domain/media";
import { getSettings } from "@/server/domain/settings";
import { specLabelsByCategory } from "@/server/domain/catalog-entry";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage({ searchParams }: PageProps<"/comptoir/catalogue/nouveau">) {
  const { db, user, allowed } = await requirePage("catalog.edit");
  if (!allowed) return <Forbidden />;
  const canCosts = can(user, "catalog.costs");
  const modele = (await searchParams).modele;
  const [categories, source, settings, specLabels] = await Promise.all([
    listCategories(db, { scope: "active" }),
    typeof modele === "string" ? productForEdit(db, modele, { withCosts: canCosts }) : null,
    getSettings(db),
    specLabelsByCategory(db),
  ]);
  return (
    <>
      <PageTitle eyebrow="Catalogue" title="Nouveau produit">
        {source
          ? `Copie de « ${source.name} » : mêmes réglages, sans nom, références, code-barres, photos ni stock.`
          : "Photos, nom, catégorie, prix et stock : le reste est facultatif. Un brouillon s'enregistre à tout moment."}
      </PageTitle>
      <ProductFormClient
        videoMaxMb={videoMaxMb()}
        categories={categories.map((c) => ({ id: c.id, name: c.name, profile: c.profile ?? null }))}
        canCosts={canCosts}
        userId={user.id}
        quickValues={settings.catalog.quickValues}
        specLabels={specLabels}
        initial={
          source
            ? {
                // Duplication : les valeurs uniques (nom, références, code-barres, photos, stock) repartent à zéro.
                createId: crypto.randomUUID(),
                name: "",
                brand: source.brand,
                model: source.model ?? "",
                details: source.details ?? {},
                categoryId: source.categoryId,
                description: source.description,
                specs: source.specs,
                condition: source.condition,
                warranty: source.warranty ?? "",
                axes: source.axes,
                axisValues: {},
                images: [],
                variants: source.variants.map((v) => ({
                  sku: "",
                  barcode: "",
                  options: v.options,
                  price: v.price,
                  costPrice: canCosts ? (v.costPrice ?? null) : undefined,
                  lowStockThreshold: v.lowStockThreshold ?? null,
                  initialStock: 0,
                })),
                status: "draft",
                featured: false,
              }
            : undefined
        }
      />
    </>
  );
}
