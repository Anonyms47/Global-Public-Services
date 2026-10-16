import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { cleanupStaleUploads, listMedia, mediaLimits } from "@/server/domain/media";
import { mediaStorage } from "@/server/storage";
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
  const storage = mediaStorage();
  // Envois abandonnés depuis plus de 24 h : nettoyés au passage.
  await cleanupStaleUploads(db, storage).catch(() => 0);
  const rows = await listMedia(db, { view });
  const canEdit = can(user, "catalog.edit");
  const limits = mediaLimits(storage.backend);
  const mo = (n: number) => Math.round(n / 1024 / 1024);
  const where =
    storage.backend === "supabase"
      ? "Supabase Storage (compartiment privé)"
      : storage.backend === "local"
        ? "dossier local (démonstration)"
        : storage.backend === "database"
          ? "base de données (mode de secours)"
          : null;
  return (
    <>
      <PageTitle eyebrow="Développer" title="Médiathèque">
        Toutes les photos et vidéos téléversées, avec les fiches qui les utilisent. Un fichier utilisé ne peut pas être
        mis à la corbeille ; un fichier à la corbeille n&apos;est plus visible sur le site et reste restaurable.
      </PageTitle>
      {!storage.backend ? (
        <p role="alert" className="mb-6 rounded-[6px] border border-gps-red/40 bg-gps-red-soft p-3 text-[14px]">
          {storage.problem} Les fichiers existants restent affichés ; les nouveaux envois sont suspendus.
        </p>
      ) : null}
      {canEdit && storage.backend ? (
        <Panel className="mb-6" title="Ajouter des fichiers" id="t-envoi">
          <MediaUploader videoMaxMb={mo(limits.video)} />
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
        Limites : photos de {mo(limits.photo)} Mo après réduction automatique (côté le plus long ramené à 2 000 px),
        vidéos de {mo(limits.video)} Mo, lues progressivement. Stockage : {where ?? "non configuré"}. Les fichiers
        d&apos;une fiche publiée ou de la vitrine sont visibles sur le site ; les autres (brouillons, non utilisés,
        corbeille) restent réservés à l&apos;équipe connectée.
      </p>
    </>
  );
}
