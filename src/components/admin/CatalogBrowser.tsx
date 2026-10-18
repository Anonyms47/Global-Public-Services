"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  bulkCategoryAction,
  bulkStatusAction,
  bulkTrashAction,
  priceApplyAction,
  pricePreviewAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { fcfa } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";
import { Badge, Empty } from "./ui";
import { QuickEdit } from "./QuickEdit";
import { IconGrid, IconList } from "../ui/icons";

interface Row {
  id: string;
  name: string;
  brand: string;
  category_id?: string | null;
  category_name: string | null;
  status: "draft" | "published" | "archived";
  featured: boolean;
  is_demo: boolean;
  image: string | null;
  variant_count: number;
  min_price: number | null;
  max_price: number | null;
  on_hand: number;
  available: number;
  has_sales: boolean;
  updated_at: string;
  disabled?: boolean;
  disabled_variants?: number;
}

const statusBadge = (s: Row["status"]) =>
  s === "published" ? (
    <Badge tone="green">Publié</Badge>
  ) : s === "draft" ? (
    <Badge tone="warn">Brouillon</Badge>
  ) : (
    <Badge>Archivé</Badge>
  );

const priceRange = (r: Row) =>
  r.min_price == null
    ? "—"
    : r.min_price === r.max_price
      ? fcfa(r.min_price)
      : `${fcfa(r.min_price)} – ${fcfa(r.max_price!)}`;

export function CatalogBrowser({
  rows,
  categories,
  view,
  viewHref,
  canBulk,
  canEdit,
  canCount = false,
  emptyHint,
}: {
  rows: Row[];
  categories: { id: string; name: string }[];
  view: "grille" | "liste";
  viewHref: { grille: string; liste: string };
  canBulk: boolean;
  canEdit: boolean;
  /** Correction de stock depuis la modification rapide (droit d'inventaire). */
  canCount?: boolean;
  emptyHint: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState("");
  const [preview, setPreview] = useState<{ sku: string; name: string; price: number; newPrice: number }[] | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState(false);
  const [category, setCategory] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);
  const { run, pending, failure, success, setSuccess } = useAction();
  const ids = [...selected];
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setPreview(null);
    setArchiveConfirm(false);
    setTrashConfirm(false);
  };
  const clear = () => {
    setSelected(new Set());
    setPreview(null);
    setArchiveConfirm(false);
    setTrashConfirm(false);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {canBulk && rows.length ? (
            <label className="flex min-h-11 items-center gap-2 text-[14px] font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={selected.size === rows.length && rows.length > 0}
                onChange={(e) => (e.target.checked ? setSelected(new Set(rows.map((r) => r.id))) : clear())}
              />
              Tout sélectionner
            </label>
          ) : null}
          <span className="text-[14px] text-ink-mute">
            {rows.length} produit{rows.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex gap-1" role="group" aria-label="Affichage">
          <Link
            href={viewHref.grille}
            aria-current={view === "grille" ? "page" : undefined}
            className={`btn btn-sm ${view === "grille" ? "btn-ink" : "btn-outline"}`}
            aria-label="Vue visuelle"
          >
            <IconGrid size={18} />
          </Link>
          <Link
            href={viewHref.liste}
            aria-current={view === "liste" ? "page" : undefined}
            className={`btn btn-sm ${view === "liste" ? "btn-ink" : "btn-outline"}`}
            aria-label="Vue liste"
          >
            <IconList size={18} />
          </Link>
        </div>
      </div>

      {selected.size > 0 && canBulk ? (
        <div
          className="sticky top-16 z-20 mb-4 grid gap-3 rounded-[6px] border-[1.5px] border-gps-blue bg-gps-blue-soft p-3"
          role="region"
          aria-label="Actions groupées"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 font-bold text-gps-blue-deep">{selected.size} sélectionné(s)</p>
            <button
              className="btn btn-sm btn-blue"
              disabled={pending}
              onClick={() =>
                run(() => bulkStatusAction(ids, "published"), {
                  onSuccess: (r) => (setBlocked(r.blocked), setSuccess(r.blocked.length ? null : "Produits publiés.")),
                })
              }
            >
              Publier
            </button>
            <button
              className="btn btn-sm btn-outline"
              disabled={pending}
              onClick={() =>
                run(() => bulkStatusAction(ids, "draft"), {
                  successMessage: "Repassés en brouillon (retirés du site).",
                })
              }
            >
              Mettre en brouillon
            </button>
            <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => setArchiveConfirm(true)}>
              Archiver…
            </button>
            <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => setTrashConfirm(true)}>
              Corbeille…
            </button>
            <span className="flex items-center gap-1">
              <label className="sr-only" htmlFor="bulk-cat">
                Nouvelle catégorie
              </label>
              <select
                id="bulk-cat"
                className="field h-10 min-h-10 w-44 py-0 text-[14px]"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Catégorie…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm btn-outline"
                disabled={!category || pending}
                onClick={() => run(() => bulkCategoryAction(ids, category))}
              >
                Appliquer
              </button>
            </span>
            <span className="flex items-center gap-1">
              <label className="sr-only" htmlFor="bulk-pct">
                Variation de prix en pourcentage
              </label>
              <input
                id="bulk-pct"
                inputMode="decimal"
                placeholder="Prix ±%"
                className="field h-10 min-h-10 w-24 py-0 text-[14px]"
                value={percent}
                onChange={(e) => (setPercent(e.target.value.replace(/[^\d-]/g, "")), setPreview(null))}
              />
              <button
                className="btn btn-sm btn-outline"
                disabled={!percent || pending}
                onClick={() =>
                  run(() => pricePreviewAction(ids, Number(percent)), {
                    refresh: false,
                    onSuccess: setPreview,
                  })
                }
              >
                Aperçu
              </button>
            </span>
            <button className="ml-auto text-[13px] font-bold text-gps-blue underline" onClick={clear}>
              Désélectionner
            </button>
          </div>
          {trashConfirm ? (
            <div className="rounded-[6px] bg-white p-3">
              <p className="font-bold">Mettre {selected.size} produit(s) à la corbeille ?</p>
              <p className="text-[14px] text-ink-soft">
                Retirés du site et de la vente. Chacun reste restaurable depuis l&apos;onglet Corbeille ;
                l&apos;historique des ventes est conservé.
              </p>
              <ul className="mt-2 max-h-32 overflow-y-auto text-[14px]">
                {rows
                  .filter((r) => selected.has(r.id))
                  .map((r) => (
                    <li key={r.id}>• {r.name}</li>
                  ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-ghost" onClick={() => setTrashConfirm(false)}>
                  Annuler
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  onClick={() => run(() => bulkTrashAction(ids), { onSuccess: clear })}
                >
                  Confirmer la mise à la corbeille
                </button>
              </div>
            </div>
          ) : null}
          {archiveConfirm ? (
            <div className="rounded-[6px] bg-white p-3">
              <p className="font-bold">Archiver {selected.size} produit(s) ?</p>
              <p className="text-[14px] text-ink-soft">
                Ils disparaissent du site et de la vente. L&apos;historique des ventes est conservé. Réversible depuis
                l&apos;onglet Archivés.
              </p>
              <ul className="mt-2 max-h-32 overflow-y-auto text-[14px]">
                {rows
                  .filter((r) => selected.has(r.id))
                  .map((r) => (
                    <li key={r.id}>• {r.name}</li>
                  ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-ghost" onClick={() => setArchiveConfirm(false)}>
                  Annuler
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={pending}
                  onClick={() =>
                    run(() => bulkStatusAction(ids, "archived"), {
                      successMessage: "Produits archivés.",
                      onSuccess: clear,
                    })
                  }
                >
                  Confirmer l&apos;archivage
                </button>
              </div>
            </div>
          ) : null}
          {preview ? (
            <div className="rounded-[6px] bg-white p-3">
              <p className="font-bold">
                Aperçu : {Number(percent) > 0 ? "+" : ""}
                {percent} % sur {preview.length} variante(s) (arrondi à 50 FCFA)
              </p>
              <div className="mt-2 max-h-56 overflow-y-auto">
                <table className="w-full text-[14px]">
                  <tbody className="divide-y divide-line-soft">
                    {preview.map((p) => (
                      <tr key={p.sku}>
                        <td className="py-1">
                          {p.name} <span className="text-ink-mute">· {p.sku}</span>
                        </td>
                        <td className="py-1 text-right text-ink-mute tabular line-through">{fcfa(p.price)}</td>
                        <td className="py-1 text-right font-bold tabular">{fcfa(p.newPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">Les commandes existantes gardent leurs prix enregistrés.</p>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-ghost" onClick={() => setPreview(null)}>
                  Annuler
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={pending}
                  onClick={() =>
                    run(() => priceApplyAction(ids, Number(percent)), {
                      successMessage: "Prix mis à jour.",
                      onSuccess: () => (setPreview(null), setPercent("")),
                    })
                  }
                >
                  Appliquer les nouveaux prix
                </button>
              </div>
            </div>
          ) : null}
          <ActionFeedback failure={failure} success={success} />
          {blocked.length ? (
            <div role="alert" className="rounded-[6px] bg-warn-soft p-3 text-[14px] text-warn">
              <p className="font-bold">Non publiés (informations manquantes) :</p>
              <ul>
                {blocked.map((b) => (
                  <li key={b}>• {b}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <Empty
          title="Aucun produit"
          action={
            canEdit ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/comptoir/catalogue/nouveau" className="btn btn-blue btn-sm">
                  Ajouter le premier produit
                </Link>
                <Link href="/comptoir/catalogue/import" className="btn btn-outline btn-sm">
                  Importer un catalogue
                </Link>
              </div>
            ) : null
          }
        >
          {emptyHint}
        </Empty>
      ) : view === "grille" ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`relative rounded-[6px] border-[1.5px] bg-card ${selected.has(r.id) ? "border-gps-blue" : "border-line"}`}
            >
              {canBulk ? (
                <input
                  type="checkbox"
                  className="absolute top-2 left-2 z-10 h-6 w-6"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`Sélectionner ${r.name}`}
                />
              ) : null}
              <Link href={`/comptoir/catalogue/${r.id}`} className="block">
                <div className="overflow-hidden rounded-t-[5px] bg-paper-deep">
                  {r.image ? (
                    <Image
                      src={r.image}
                      alt=""
                      width={300}
                      height={375}
                      unoptimized={r.image.endsWith(".svg") || r.image.startsWith("/media/")}
                      className="aspect-[4/5] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/5] items-center justify-center text-[13px] text-ink-mute">
                      Sans photo
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {statusBadge(r.status)}
                    {r.disabled ? <Badge tone="red">Désactivé</Badge> : null}
                    {!r.disabled && r.disabled_variants ? (
                      <Badge tone="warn">{r.disabled_variants} version(s) indisponible(s)</Badge>
                    ) : null}
                    {r.featured ? <Badge tone="blue">Vedette</Badge> : null}
                  </div>
                  <p className="mt-1 leading-snug font-bold">{r.name}</p>
                  <p className="text-[13px] text-ink-mute">{r.category_name ?? "Sans catégorie"}</p>
                  <p className="mt-1 text-[14px] font-semibold tabular">{priceRange(r)}</p>
                  <p className={`text-[13px] ${r.available <= 0 ? "font-bold text-gps-red-ink" : "text-ink-soft"}`}>
                    {r.available} dispo. · {r.variant_count} variante
                    {r.variant_count > 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
              {canEdit && r.status !== "archived" ? (
                <div className="px-3 pb-3">
                  <QuickEdit
                    product={{
                      id: r.id,
                      name: r.name,
                      status: r.status,
                      categoryId: r.category_id ?? null,
                      disabled: !!r.disabled,
                    }}
                    categories={categories}
                    canCount={canCount}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                {canBulk ? <th className="w-10 px-3 py-3" /> : null}
                <th className="px-3 py-3 font-bold">Produit</th>
                <th className="py-3 font-bold">Statut</th>
                <th className="py-3 font-bold">Prix</th>
                <th className="py-3 text-right font-bold">Stock</th>
                <th className="px-3 py-3 text-right font-bold">Dispo.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? "bg-gps-blue-soft" : ""}>
                  {canBulk ? (
                    <td className="px-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`Sélectionner ${r.name}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <Link href={`/comptoir/catalogue/${r.id}`} className="font-bold text-gps-blue hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-[13px] text-ink-mute">
                      {[r.brand, r.category_name].filter(Boolean).join(" · ")} · {r.variant_count} variante(s)
                    </div>
                    {canEdit && r.status !== "archived" ? (
                      <div className="mt-1">
                        <QuickEdit
                          product={{
                            id: r.id,
                            name: r.name,
                            status: r.status,
                            categoryId: r.category_id ?? null,
                            disabled: !!r.disabled,
                          }}
                          categories={categories}
                          canCount={canCount}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {statusBadge(r.status)}
                      {r.disabled ? <Badge tone="red">Désactivé</Badge> : null}
                      {!r.disabled && r.disabled_variants ? (
                        <Badge tone="warn">{r.disabled_variants} version(s) indisponible(s)</Badge>
                      ) : null}
                      {r.featured ? <Badge tone="blue">Vedette</Badge> : null}
                      {r.is_demo ? <Badge>Exemple</Badge> : null}
                    </div>
                  </td>
                  <td className="py-2 tabular">{priceRange(r)}</td>
                  <td className="py-2 text-right tabular">{r.on_hand}</td>
                  <td
                    className={`px-3 py-2 text-right font-bold tabular ${r.available <= 0 ? "text-gps-red-ink" : ""}`}
                  >
                    {r.available}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
