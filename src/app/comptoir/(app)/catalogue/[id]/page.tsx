import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { listCategories, listVersions, productForEdit } from "@/server/domain/catalog";
import { TrashActions, VersionList } from "@/components/admin/CatalogHistory";
import { can } from "@/lib/permissions";
import { Badge, Forbidden, PageTitle, Panel } from "@/components/admin/ui";
import { ProductFormClient } from "@/components/admin/ProductForm";
import { videoMaxMb } from "@/server/domain/media";
import { importedInfo } from "@/server/domain/catalog-import-gps";
import { listToComplete, specLabelsByCategory, type ToCompleteFilter } from "@/server/domain/catalog-entry";
import { getSettings } from "@/server/domain/settings";
import { MarkChecksDone } from "@/components/admin/ToComplete";
import { Availability } from "@/components/admin/Availability";
import { IconArrowLeft } from "@/components/ui/icons";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Produit" };

export default async function EditProductPage({ params, searchParams }: PageProps<"/comptoir/catalogue/[id]">) {
  const { db, user, allowed } = await requirePage("catalog.view");
  if (!allowed) return <Forbidden />;
  const canEdit = can(user, "catalog.edit");
  const p = await productForEdit(db, (await params).id, {
    withCosts: can(user, "catalog.costs"),
  });
  if (!p) notFound();
  const canCosts = can(user, "catalog.costs");
  const completer = (await searchParams).completer;
  const [categories, versions, imported, settings, specLabels, todo, availability] = await Promise.all([
    listCategories(db, { scope: "active" }),
    listVersions(db, p.id),
    importedInfo(db, p.id),
    getSettings(db),
    specLabelsByCategory(db),
    typeof completer === "string" ? listToComplete(db, { canCosts }) : null,
    db.one<{ disabled: boolean; variants: { id: string; label: string; disabled: boolean }[] }>(
      `select p.disabled, coalesce((select json_agg(json_build_object('id', v.id, 'disabled', v.disabled,
                'label', coalesce(nullif((select string_agg(value, ' · ') from jsonb_each_text(v.options)), ''), v.sku))
                order by v.position) from variants v where v.product_id = p.id and v.active), '[]') as variants
         from products p where p.id = $1`,
      [p.id],
    ),
  ]);
  // Parcours « Produits à compléter » : position et produit suivant dans la même sélection.
  let completion: { nextHref: string | null; position: string; listHref: string } | null = null;
  if (todo && typeof completer === "string") {
    const list = (
      completer === "tous" ? todo.rows : todo.rows.filter((r) => r.flags.includes(completer as ToCompleteFilter))
    ).filter((r) => !r.flags.includes("pret") || completer === "pret");
    const ids = list.map((r) => r.id);
    const at = ids.indexOf(p.id);
    const next = ids.find((id, i) => i > at && id !== p.id) ?? ids.find((id) => id !== p.id) ?? null;
    const q = `completer=${encodeURIComponent(completer)}`;
    completion = {
      nextHref: next ? `/comptoir/catalogue/${next}?${q}` : null,
      position: at >= 0 ? `${at + 1} sur ${ids.length}` : `${ids.length} restant${ids.length > 1 ? "s" : ""}`,
      listHref: `/comptoir/catalogue/a-completer${completer === "tous" ? "" : `?filtre=${encodeURIComponent(completer)}`}`,
    };
  }
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
          <>
            {!p.deletedAt ? (
              <Link href={`/comptoir/catalogue/${p.id}/apercu`} className="btn btn-outline btn-sm">
                Aperçu téléphone / ordinateur
              </Link>
            ) : null}
            {p.status === "published" ? (
              <Link href={`/produits/${p.slug}`} target="_blank" className="btn btn-outline btn-sm">
                Voir sur le site
              </Link>
            ) : null}
          </>
        }
      >
        {p.isDemo ? <Badge>Exemple</Badge> : null}{" "}
        {p.hasSales ? "Déjà vendu : les variantes retirées seront désactivées, l'historique est conservé." : null}
      </PageTitle>
      {imported && canEdit ? (
        <details
          className="mb-6 rounded-[6px] border-[1.5px] border-warn/40 bg-warn-soft p-4"
          open={p.status !== "published"}
        >
          <summary className="cursor-pointer font-bold text-warn">
            Fiche importée du relevé de la boutique : {imported.humanChecks.length} vérifications avant publication
          </summary>
          <ul className="mt-2 grid gap-1 text-[14px]">
            {imported.humanChecks.map((c) => (
              <li key={c}>
                {imported.checksDoneAt ? "☑" : "☐"} {c}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <MarkChecksDone
              productId={p.id}
              doneAt={imported.checksDoneAt ?? null}
              doneBy={imported.checksDoneBy ?? null}
            />
          </div>
          {imported.notes ? <p className="mt-2 text-[14px] text-ink-soft">Note : {imported.notes}</p> : null}
          <p className="mt-2 text-[13px] text-ink-mute">
            Référence : {imported.model} · Sources :{" "}
            {imported.sources.map((s, i) => (
              <span key={s.id + i}>
                {i ? " · " : ""}
                {s.url && /^https:\/\//.test(s.url) ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.kind}
                  </a>
                ) : (
                  s.kind
                )}
              </span>
            ))}
          </p>
        </details>
      ) : null}
      {p.deletedAt ? (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3 rounded-[6px] border-[1.5px] border-gps-red/30 bg-gps-red-soft p-4">
          <p className="font-semibold text-gps-red-ink">
            À la corbeille depuis le {formatDate(p.deletedAt)} : retiré du site et de la vente.
          </p>
          {canEdit ? <TrashActions id={p.id} canPurge={can(user, "catalog.bulk")} hasSales={p.hasSales} /> : null}
        </div>
      ) : null}
      {canEdit && !p.deletedAt && availability ? (
        <Panel title="Disponibilité" id="t-dispo" className="mb-6">
          <Availability
            productId={p.id}
            productName={p.name}
            disabled={availability.disabled}
            variants={availability.variants}
          />
        </Panel>
      ) : null}
      {canEdit && !p.deletedAt ? (
        <ProductFormClient
          key={p.updatedAt}
          videoMaxMb={videoMaxMb()}
          categories={categories.map((c) => ({ id: c.id, name: c.name, profile: c.profile ?? null }))}
          canCosts={canCosts}
          userId={user.id}
          quickValues={settings.catalog.quickValues}
          stock={settings.stock.tracking}
          specLabels={specLabels}
          modelHint={imported?.model}
          photoCandidates={imported?.photoCandidates ?? []}
          completion={completion}
          initial={{
            id: p.id,
            updatedAt: p.updatedAt,
            name: p.name,
            brand: p.brand,
            model: p.model ?? "",
            details: p.details ?? {},
            categoryId: p.categoryId,
            description: p.description,
            specs: p.specs,
            condition: p.condition,
            warranty: p.warranty ?? "",
            slug: p.slug,
            axes: p.axes,
            axisValues: {},
            images: p.images,
            variants: p.variants,
            status: p.status,
            featured: p.featured,
            hasSales: p.hasSales,
            publishAt: p.publishAt ?? null,
            unpublishAt: p.unpublishAt ?? null,
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
