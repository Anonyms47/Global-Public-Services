"use client";

import { markChecksDoneAction } from "@/app/comptoir/(app)/catalogue/actions";
import { formatDateTime } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";

/** Vérifications d'une fiche importée : notées comme faites (rien n'est supprimé, journalisé). */
export function MarkChecksDone({
  productId,
  doneAt,
  doneBy,
}: {
  productId: string;
  doneAt: string | null;
  doneBy: string | null;
}) {
  const { run, pending, failure, success } = useAction();
  if (doneAt)
    return (
      <p className="text-[14px] font-semibold text-wa-ink">
        Vérifications faites le {formatDateTime(doneAt)}
        {doneBy ? ` par ${doneBy}` : ""}.
      </p>
    );
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="btn btn-outline btn-sm justify-self-start"
        disabled={pending}
        onClick={() => run(() => markChecksDoneAction(productId))}
      >
        J&apos;ai vérifié ces points sur le produit
      </button>
      <ActionFeedback failure={failure} success={success} />
    </div>
  );
}
