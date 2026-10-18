"use client";

import { useState } from "react";
import { setProductDisabledAction, setVariantDisabledAction } from "@/app/comptoir/(app)/catalogue/actions";
import { ActionFeedback, useAction } from "./useAction";

type V = { id: string; label: string; disabled: boolean };

/**
 * Article manquant : on désactive le produit (masqué du site et de la caisse) ou seulement
 * une version (proposée comme indisponible), puis on réactive d'un geste. Rien n'est supprimé.
 */
export function Availability({
  productId,
  productName,
  disabled: initial,
  variants: initialVariants,
}: {
  productId: string;
  productName: string;
  disabled: boolean;
  variants: V[];
}) {
  const [disabled, setDisabled] = useState(initial);
  const [variants, setVariants] = useState(initialVariants);
  const { run, pending, failure, success, setSuccess } = useAction();
  const several = variants.length > 1;
  return (
    <div className="grid gap-3" data-testid="disponibilite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px]">
          {disabled ? (
            <strong className="text-gps-red-ink">Produit désactivé : masqué du site et de la caisse.</strong>
          ) : (
            <span>Produit actif.</span>
          )}
        </p>
        <button
          type="button"
          className={`btn btn-sm ${disabled ? "btn-primary" : "btn-outline"}`}
          disabled={pending}
          onClick={() =>
            run(() => setProductDisabledAction(productId, !disabled), {
              onSuccess: (r) => {
                setDisabled(r.disabled);
                setSuccess(r.message);
              },
            })
          }
        >
          {disabled ? "Réactiver le produit" : "Désactiver le produit (manquant)"}
        </button>
      </div>
      {several ? (
        <fieldset className="grid gap-1" disabled={disabled}>
          <legend className="mb-1 text-[13px] font-bold text-ink-mute">
            Versions disponibles (décochez celles qui manquent)
          </legend>
          {variants.map((v) => (
            <label key={v.id} className="flex min-h-10 items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={!v.disabled}
                aria-label={`${v.label} disponible — ${productName}`}
                onChange={(e) => {
                  // Affichage immédiat ; on revient en arrière si l'enregistrement échoue.
                  const next = !e.target.checked;
                  const mark = (d: boolean) =>
                    setVariants((all) => all.map((x) => (x.id === v.id ? { ...x, disabled: d } : x)));
                  mark(next);
                  run(
                    async () => {
                      const r = await setVariantDisabledAction(v.id, next);
                      if (!r.ok) mark(!next);
                      return r;
                    },
                    {
                      onSuccess: (r) =>
                        setSuccess(r.disabled ? `${v.label} : indisponible.` : `${v.label} : de nouveau disponible.`),
                    },
                  );
                }}
              />
              <span className={v.disabled ? "text-ink-mute line-through" : ""}>{v.label}</span>
              {v.disabled ? <span className="text-[12px] font-bold text-gps-red-ink">indisponible</span> : null}
            </label>
          ))}
        </fieldset>
      ) : null}
      <ActionFeedback failure={failure} success={success} />
    </div>
  );
}
