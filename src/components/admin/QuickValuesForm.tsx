"use client";

import { useState } from "react";
import { saveQuickValuesAction } from "@/app/comptoir/(app)/parametres/actions";
import { quickListLabels, type QuickListKey, type QuickValues } from "@/lib/product-kit";
import { ActionFeedback, useAction } from "./useAction";

/** Valeurs proposées en un geste dans la fiche produit (une par ligne), modifiables par le propriétaire. */
export function QuickValuesForm({ initial }: { initial: QuickValues }) {
  const keys = Object.keys(quickListLabels) as QuickListKey[];
  const [text, setText] = useState(() => Object.fromEntries(keys.map((k) => [k, initial[k].join("\n")])));
  const { run, pending, failure, success } = useAction();
  return (
    <section
      className="mt-8 rounded-[6px] border border-line bg-card"
      aria-labelledby="t-valeurs-rapides"
      id="valeurs-rapides"
    >
      <div className="border-b border-line px-4 py-3 md:px-5">
        <h2 id="t-valeurs-rapides" className="text-[15px] font-extrabold tracking-wide uppercase">
          Valeurs rapides de saisie
        </h2>
        <p className="text-[14px] text-ink-soft">
          Proposées en un geste dans les fiches produits. Une valeur par ligne.
        </p>
      </div>
      <form
        className="grid gap-4 p-4 md:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            saveQuickValuesAction(
              Object.fromEntries(
                keys.map((k) => [
                  k,
                  text[k]
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                ]),
              ),
            ),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {keys.map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`qv-${k}`}>
                {quickListLabels[k]}
              </label>
              <textarea
                id={`qv-${k}`}
                rows={6}
                className="field text-[14px]"
                value={text[k]}
                onChange={(e) => setText((t) => ({ ...t, [k]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button className="btn btn-blue justify-self-start" disabled={pending}>
          Enregistrer les valeurs rapides
        </button>
        <ActionFeedback failure={failure} success={success} />
      </form>
    </section>
  );
}
