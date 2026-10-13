import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { listCategories, productForEdit } from "@/server/domain/catalog";
import { can } from "@/lib/permissions";
import { Badge, Forbidden, PageTitle } from "@/components/admin/ui";
import { ProductFormClient } from "@/components/admin/ProductForm";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Produit" };

export default async function EditProductPage({
  params,
}: PageProps<"/comptoir/catalogue/[id]">) {
  const { db, user, allowed } = await requirePage("catalog.view");
  if (!allowed) return <Forbidden />;
  const canEdit = can(user.role, "catalog.edit");
  const p = await productForEdit(db, (await params).id, {
    withCosts: can(user.role, "catalog.costs"),
  });
  if (!p) notFound();
  const categories = await listCategories(db);
  return (
    <>
      <Link
        href="/comptoir/catalogue"
        className="text-gps-blue mb-3 inline-flex min-h-11 items-center gap-1 font-bold hover:underline"
      >
        <IconArrowLeft size={18} /> Catalogue
      </Link>
      <PageTitle
        eyebrow="Catalogue"
        title={p.name || "Produit sans nom"}
        actions={
          p.status === "published" ? (
            <Link
              href={`/produits/${p.slug}`}
              target="_blank"
              className="btn btn-outline btn-sm"
            >
              Voir sur le site
            </Link>
          ) : null
        }
      >
        {p.isDemo ? <Badge>Exemple</Badge> : null}{" "}
        {p.hasSales
          ? "Déjà vendu : les variantes retirées seront désactivées, l'historique est conservé."
          : null}
      </PageTitle>
      {canEdit ? (
        <ProductFormClient
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          canCosts={can(user.role, "catalog.costs")}
          initial={{
            id: p.id,
            updatedAt: p.updatedAt,
            name: p.name,
            brand: p.brand,
            categoryId: p.categoryId,
            description: p.description,
            specs: p.specs,
            condition: p.condition,
            axes: p.axes,
            axisValues: {},
            images: p.images,
            variants: p.variants,
            status: p.status,
            featured: p.featured,
            hasSales: p.hasSales,
          }}
        />
      ) : (
        <div className="border-line bg-card rounded-[6px] border p-5">
          <p className="text-ink-soft">
            Consultation seule : votre rôle ne permet pas de modifier le
            catalogue.
          </p>
          <ul className="divide-line-soft mt-3 divide-y text-[14px]">
            {p.variants.map((v) => (
              <li key={v.id} className="flex justify-between py-2">
                <span>
                  {Object.values(v.options).join(" · ") || "Article unique"}{" "}
                  <span className="text-ink-mute">· {v.sku}</span>
                </span>
                <span className="tabular">
                  {v.price.toLocaleString("fr-FR")} FCFA ·{" "}
                  {v.onHand - v.reserved} dispo.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
