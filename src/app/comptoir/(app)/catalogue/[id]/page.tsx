import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { listCategories, listVersions, productForEdit } from "@/server/domain/catalog";
import { TrashActions, VersionList } from "@/components/admin/CatalogHistory";
import { can } from "@/lib/permissions";
import { Badge, Forbidden, PageTitle, Panel } from "@/components/admin/ui";
import { ProductFormClient } from "@/components/admin/ProductForm";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Produit" };

export default async function EditProductPage({ params }: PageProps<"/comptoir/catalogue/[id]">) {
  const { db, user, allowed } = await requirePage("catalog.view");
  if (!allowed) return <Forbidden />;
  const canEdit = can(user, "catalog.edit");
  const p = await productForEdit(db, (await params).id, {
    withCosts: can(user, "catalog.costs"),
  });
  if (!p) notFound();
  const [categories, versions] = await Promise.all([listCategories(db), listVersions(db, p.id)]);
  return (
    <>
      <Link
        href="/comptoir/catalogue"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Catalogue
      </Link>
      <PageTitle
        eyebrow="Catalogue"
        title={p.name || "Produit sans nom"}
        actions={
          p.status === "published" ? (
            <Link href={`/produits/${p.slug}`} target="_blank" className="btn btn-outline btn-sm">
              Voir sur le site
            </Link>
          ) : null
        }
      >
        {p.isDemo ? <Badge>Exemple</Badge> : null}{" "}
        {p.hasSales ? "Déjà vendu : les variantes retirées seront désactivées, l'historique est conservé." : null}
      </PageTitle>
      {p.deletedAt ? (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-[6px] border-[1.5px] border-gps-red/30 bg-gps-red-soft p-4">
          <p className="font-semibold text-gps-red-ink">
            À la corbeille depuis le {new Date(p.deletedAt).toLocaleDateString("fr-FR", { dateStyle: "long" })} : retiré
            du site et de la vente.
          </p>
          {canEdit ? <TrashActions id={p.id} canPurge={can(user, "catalog.bulk")} hasSales={p.hasSales} /> : null}
        </div>
      ) : null}
      {canEdit && !p.deletedAt ? (
        <ProductFormClient
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          canCosts={can(user, "catalog.costs")}
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
            publishAt: p.publishAt ?? null,
          }}
        />
      ) : p.deletedAt ? null : (
        <div className="rounded-[6px] border border-line bg-card p-5">
          <p className="text-ink-soft">Consultation seule : votre rôle ne permet pas de modifier le catalogue.</p>
          <ul className="mt-3 divide-y divide-line-soft text-[14px]">
            {p.variants.map((v) => (
              <li key={v.id} className="flex justify-between py-2">
                <span>
                  {Object.values(v.options).join(" · ") || "Article unique"}{" "}
                  <span className="text-ink-mute">· {v.sku}</span>
                </span>
                <span className="tabular">
                  {v.price.toLocaleString("fr-FR")} FCFA · {v.onHand - v.reserved - v.unsellable} dispo.
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {canEdit ? (
        <Panel className="mt-6 mb-24" title="Historique des versions" id="t-versions">
          <VersionList
            versions={versions.map((v) => ({
              id: v.id,
              at: new Date(v.created_at).toISOString(),
              who: v.user_name ?? "—",
              name: v.name,
              status: v.status,
            }))}
          />
        </Panel>
      ) : null}
    </>
  );
}
