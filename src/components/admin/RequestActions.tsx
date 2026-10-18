"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { convertRequestAction, dismissRequestAction, reopenRequestAction } from "@/app/comptoir/(app)/demandes/actions";
import { ActionFeedback, useAction } from "./useAction";

export function RequestActions({ id, status }: { id: string; status: "new" | "converted" | "dismissed" }) {
  const a = useAction();
  const router = useRouter();
  const [reason, setReason] = useState("");
  if (status === "converted") return null;
  if (status === "dismissed") {
    return (
      <div className="grid gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm justify-self-start"
          disabled={a.pending}
          onClick={() => a.run(() => reopenRequestAction(id))}
        >
          Rouvrir
        </button>
        <ActionFeedback failure={a.failure} success={a.success} />
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={a.pending}
          onClick={() =>
            a.run(() => convertRequestAction(id), {
              refresh: false,
              onSuccess: (o) => router.push(`/comptoir/commandes/${o.id}`),
            })
          }
        >
          Confirmer : créer la commande
        </button>
        <details>
          <summary className="btn btn-outline btn-sm list-none">Classer sans suite</summary>
          <form
            className="mt-2 grid gap-2 sm:w-80"
            onSubmit={(e) => {
              e.preventDefault();
              a.run(() => dismissRequestAction(id, reason));
            }}
          >
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Raisons fréquentes">
              {["Client injoignable", "Doublon", "Article indisponible", "Acheté en boutique"].map((r) => (
                <button
                  key={r}
                  type="button"
                  className="chip"
                  disabled={a.pending}
                  onClick={() => {
                    setReason(r);
                    a.run(() => dismissRequestAction(id, r));
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="label text-[13px]" htmlFor={`dismiss-${id}`}>
              Autre raison
            </label>
            <input
              id={`dismiss-${id}`}
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Client injoignable, doublon, article indisponible…"
            />
            <button className="btn btn-outline btn-sm" disabled={a.pending || !reason.trim()}>
              Classer
            </button>
          </form>
        </details>
      </div>
      <ActionFeedback failure={a.failure} success={a.success} />
    </div>
  );
}
