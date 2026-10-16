import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { listMedia } from "@/server/domain/media";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle, Panel } from "@/components/admin/ui";
import { MediaGrid, MediaUploader } from "@/components/admin/MediaLibrary";

export const metadata: Metadata = { title: "Médiathèque" };

const views = [
  ["all", "Tous"],
  ["unused", "Non utilisés"],
  ["trash", "Corbeille"],
] as const;

export default async function MediaPage({ searchParams }: PageProps<"/comptoir/mediatheque">) {
  const { db, user, allowed } = await requirePage("catalog.view");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const view = views.find(([k]) => k === sp.vue)?.[0] ?? "all";
  const rows = await listMedia(db, { view });
  const canEdit = can(user, "catalog.edit");
  return (
    <>
      <PageTitle eyebrow="Développer" title="Médiathèque">
        Toutes les photos et vidéos téléversées, avec les fiches qui les utilisent. Un fichier utilisé ne peut pas être
        mis à la corbeille ; un fichier à la corbeille n&apos;est plus servi et reste restaurable.
      </PageTitle>
      {canEdit ? (
        <Panel className="mb-6" title="Ajouter des fichiers" id="t-envoi">
          <MediaUploader />
        </Panel>
      ) : null}
      <nav aria-label="Vues de la médiathèque" className="mb-4 flex flex-wrap gap-1">
        {views.map(([k, label]) => (
          <Link
            key={k}
            href={`/comptoir/mediatheque?vue=${k}`}
            aria-current={view === k ? "page" : undefined}
            className={`chip ${view === k ? "border-ink bg-ink text-white" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <MediaGrid
        canEdit={canEdit}
        canPurge={can(user, "catalog.bulk")}
        items={rows.map((m) => ({
          id: m.id,
          mime: m.mime,
          name: m.name,
          size: m.size,
          alt: m.alt,
          createdAt: new Date(m.created_at).toISOString(),
          uploader: m.uploader,
          usedBy: m.used_by,
          products: m.products,
          trashed: !!m.deleted_at,
        }))}
      />
      <p className="hint mt-6">
        Limites : photos de 3 Mo après réduction automatique (côté le plus long ramené à 2 000 px), vidéos de 4 Mo. Les
        fichiers sont stockés dans la base de données ; pour de nombreuses vidéos, un stockage de fichiers dédié sera
        préférable.
      </p>
    </>
  );
}
