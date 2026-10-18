"use client";

import { useState } from "react";
import { bulkStatusAction } from "@/app/comptoir/(app)/catalogue/actions";
import { ActionFeedback, useAction } from "./useAction";

/**
 * Publication en série des brouillons prêts : la personne coche, puis confirme
 * d'un second geste. Rien ne part en ligne sans cette décision.
 */
export function PublishReady({ products }: { products: { id: string; name: string }[] }) {
  const [picked, setPicked] = useState<string[]>(products.map((p) => p.id));
  const [confirm, setConfirm] = useState(false);
  const { run, pending, failure, success, setSuccess } = useAction();
  if (!products.length) return null;
  const n = picked.length;
  return (
    <section className="mb-5 rounded-[6px] border border-wa/40 bg-card p-4" aria-labelledby="t-prets">
      <h2 id="t-prets" className="font-bold">
        {products.length} produit{products.length > 1 ? "s" : ""} prêt{products.length > 1 ? "s" : ""} à publier
      </h2>
      <ul className="my-3 grid gap-1 sm:grid-cols-2">
        {products.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={picked.includes(p.id)}
                onChange={(e) => {
                  setConfirm(false);
                  setPicked((all) => (e.target.checked ? [...all, p.id] : all.filter((x) => x !== p.id)));
                }}
              />
              <span className="[overflow-wrap:anywhere]">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
      <ActionFeedback failure={failure} success={success} />
      <div className="mt-2 flex flex-wrap gap-2">
        {confirm ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || !n}
              onClick={() =>
                run(() => bulkStatusAction(picked, "published"), {
                  onSuccess: (r) => {
                    setConfirm(false);
                    setSuccess(
                      r.blocked.length
                        ? `Publiés, sauf : ${r.blocked.join(" ; ")}`
                        : `${n} produit${n > 1 ? "s" : ""} en ligne.`,
                    );
                  },
                })
              }
            >
              Oui, mettre en ligne ces {n} produit{n > 1 ? "s" : ""}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Annuler
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-blue" disabled={!n} onClick={() => setConfirm(true)}>
            Publier la sélection ({n})
          </button>
        )}
      </div>
    </section>
  );
}
