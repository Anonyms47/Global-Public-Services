"use client";

import { useState } from "react";
import {
  bulkCategoryAction,
  bulkStatusAction,
  bulkTrashAction,
  quickVariantAction,
  quickVariantsAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { quickCountAction } from "@/app/comptoir/(app)/stock/actions";
import { fcfa } from "@/lib/format";
import { Sheet } from "../ui/Sheet";
import { ActionFeedback, useAction } from "./useAction";
import { Availability } from "./Availability";

type V = {
  id: string;
  sku: string;
  label: string;
  price: number;
  threshold: number | null;
  onHand: number;
  reserved: number;
  disabled?: boolean;
};

/** Modification rapide depuis le catalogue : prix, stock, seuil, catégorie, statut, corbeille. */
export function QuickEdit({
  product,
  categories,
  canCount,
}: {
  product: {
    id: string;
    name: string;
    status: "draft" | "published" | "archived";
    categoryId: string | null;
    disabled?: boolean;
  };
  categories: { id: string; name: string }[];
  canCount: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [variants, setVariants] = useState<V[] | null>(null);
  const [edits, setEdits] = useState<Record<string, { price: string; stock: string; threshold: string }>>({});
  const [category, setCategory] = useState(product.categoryId ?? "");
  const [trash, setTrash] = useState(false);
  const load = useAction();
  const act = useAction();
  const openSheet = () => {
    setOpen(true);
    load.run(() => quickVariantsAction(product.id), {
      refresh: false,
      onSuccess: (rows) => {
        setVariants(rows);
        setEdits(
          Object.fromEntries(
            rows.map((v) => [
              v.id,
              {
                price: v.price ? String(v.price) : "",
                stock: String(v.onHand),
                threshold: v.threshold == null ? "" : String(v.threshold),
              },
            ]),
          ),
        );
      },
    });
  };
  const n = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s.replace(/\s/g, "")) || 0)));
  const saveVariant = (v: V) => {
    const e = edits[v.id];
    const price = n(e.price) ?? 0;
    const threshold = n(e.threshold);
    const stock = n(e.stock);
    act.run(
      async () => {
        if (price !== v.price || threshold !== v.threshold) {
          const r = await quickVariantAction({ variantId: v.id, price, lowStockThreshold: threshold });
          if (!r.ok) return r;
        }
        if (stock !== null && stock !== v.onHand) {
          const r = await quickCountAction({
            variantId: v.id,
            counted: stock,
            reason: "Modification rapide (catalogue)",
          });
          if (!r.ok) return r;
        }
        return { ok: true as const, data: null };
      },
      {
        successMessage: `${v.label || product.name} enregistré.`,
        onSuccess: () =>
          setVariants((list) =>
            (list ?? []).map((x) => (x.id === v.id ? { ...x, price, threshold, onHand: stock ?? x.onHand } : x)),
          ),
      },
    );
  };
  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={openSheet}
        aria-label={`Modifier rapidement ${product.name}`}
      >
        Modifier rapidement
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={product.name} side="right">
        <div className="grid gap-4">
          {load.pending && !variants ? <p className="text-ink-mute">Chargement…</p> : null}
          <ActionFeedback failure={load.failure} />
          <ul className="grid gap-3" aria-label="Variantes">
            {(variants ?? []).map((v) => (
              <li key={v.id} className="grid gap-2 rounded-[6px] border border-line p-3">
                <p className="font-bold">
                  {v.label || "Article unique"} <span className="font-mono text-[12px] text-ink-mute">{v.sku}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["price", "Prix (FCFA)"],
                      ...(canCount
                        ? [
                            ["stock", "Stock compté"],
                            ["threshold", "Seuil"],
                          ]
                        : []),
                    ] as [keyof (typeof edits)[string], string][]
                  ).map(([k, l]) => (
                    <label key={k} className="grid gap-1 text-[12px] font-bold text-ink-mute">
                      {l}
                      <input
                        aria-label={`${l} ${v.label || product.name}`}
                        className="field h-10 min-h-10 text-[14px] tabular"
                        inputMode="numeric"
                        value={edits[v.id]?.[k] ?? ""}
                        onChange={(e) => setEdits((x) => ({ ...x, [v.id]: { ...x[v.id], [k]: e.target.value } }))}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[12px] text-ink-mute">
                  Actuel : {v.price ? fcfa(v.price) : "prix non saisi"}
                  {canCount
                    ? ` · ${v.onHand} en stock${v.reserved ? ` (${v.reserved} réservé${v.reserved > 1 ? "s" : ""})` : ""}. Une correction de stock crée un mouvement d'inventaire tracé.`
                    : "."}
                </p>
                <button
                  type="button"
                  className="btn btn-blue btn-sm justify-self-start"
                  disabled={act.pending}
                  onClick={() => saveVariant(v)}
                >
                  Enregistrer
                </button>
              </li>
            ))}
          </ul>
          {variants ? (
            <div className="border-t border-line pt-3">
              <p className="label">Disponibilité</p>
              <Availability
                productId={product.id}
                productName={product.name}
                disabled={!!product.disabled}
                variants={variants.map((v) => ({
                  id: v.id,
                  label: v.label || v.sku,
                  disabled: !!v.disabled,
                }))}
              />
            </div>
          ) : null}
          <div className="grid gap-2 border-t border-line pt-3">
            <label className="label" htmlFor={`qe-cat-${product.id}`}>
              Catégorie
            </label>
            <div className="flex gap-2">
              <select
                id={`qe-cat-${product.id}`}
                className="field min-w-0 flex-1"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Choisir…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!category || category === product.categoryId || act.pending}
                onClick={() => act.run(() => bulkCategoryAction([product.id], category))}
              >
                Appliquer
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {product.status !== "published" ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={act.pending}
                onClick={() =>
                  act.run(() => bulkStatusAction([product.id], "published"), {
                    onSuccess: (r) =>
                      r.blocked.length
                        ? act.setFailure({ ok: false, code: "validation", error: r.blocked.join(" ") })
                        : act.setSuccess("Produit publié."),
                  })
                }
              >
                Mettre en ligne
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={act.pending}
                onClick={() =>
                  act.run(() => bulkStatusAction([product.id], "draft"), { successMessage: "Repassé en brouillon." })
                }
              >
                Repasser en brouillon
              </button>
            )}
            {trash ? (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={act.pending}
                onClick={() => act.run(() => bulkTrashAction([product.id]), { onSuccess: () => setOpen(false) })}
              >
                Confirmer la mise à la corbeille
              </button>
            ) : (
              <button type="button" className="btn btn-ghost btn-sm text-gps-red-ink" onClick={() => setTrash(true)}>
                Corbeille…
              </button>
            )}
          </div>
          <ActionFeedback failure={act.failure} success={act.success} />
        </div>
      </Sheet>
    </>
  );
}
