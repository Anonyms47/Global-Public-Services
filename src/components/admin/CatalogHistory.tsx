"use client";

import { useRouter } from "next/navigation";
import { purgeProductAction, restoreProductAction, restoreVersionAction } from "@/app/comptoir/(app)/catalogue/actions";
import { ActionFeedback, useAction } from "./useAction";

/** Restaurer ou supprimer définitivement un produit de la corbeille. */
export function TrashActions({ id, canPurge, hasSales }: { id: string; canPurge: boolean; hasSales: boolean }) {
  const a = useAction();
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-blue btn-sm"
          disabled={a.pending}
          onClick={() =>
            a.run(() => restoreProductAction(id), {
              refresh: false,
              onSuccess: () => router.push(`/comptoir/catalogue/${id}`),
            })
          }
        >
          Restaurer
        </button>
        {canPurge && !hasSales ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={a.pending}
            onClick={() => {
              if (confirm("Supprimer définitivement ce produit ? Cette action est irréversible."))
                a.run(() => purgeProductAction(id));
            }}
          >
            Supprimer définitivement
          </button>
        ) : null}
      </div>
      {hasSales ? <p className="hint">Déjà vendu : conservé pour l&apos;historique des commandes.</p> : null}
      <ActionFeedback failure={a.failure} success={a.success} />
    </div>
  );
}

export function VersionList({
  versions,
}: {
  versions: { id: string; at: string; who: string; name: string; status: string }[];
}) {
  const a = useAction();
  if (!versions.length) return <p className="text-[14px] text-ink-mute">Aucune version antérieure.</p>;
  return (
    <div className="grid gap-2">
      <ul className="divide-y divide-line-soft text-[14px]">
        {versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <span className="font-semibold">
                {new Date(v.at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
              </span>{" "}
              <span className="text-ink-mute">
                · {v.who} · « {v.name} »
              </span>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={a.pending}
              onClick={() => {
                if (confirm("Restaurer le contenu de cette version ? Le stock et le statut ne changent pas."))
                  a.run(() => restoreVersionAction(v.id), { onSuccess: () => window.location.reload() });
              }}
            >
              Restaurer
            </button>
          </li>
        ))}
      </ul>
      <ActionFeedback failure={a.failure} success={a.success} />
    </div>
  );
}
