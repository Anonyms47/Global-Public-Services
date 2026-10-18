"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { entryGridSaveAction } from "@/app/comptoir/(app)/catalogue/actions";
import type { GridRow } from "@/server/domain/catalog-entry";
import { IconImage } from "../ui/icons";
import { ActionFeedback, useAction } from "./useAction";

type Field = "price" | "cost" | "counted";
type Edit = Partial<Record<Field, string>>;
type Filter = "tous" | "sans-prix" | "sans-cout" | "sans-stock";

const digits = (s: string) => s.replace(/\D/g, "");
const toNum = (s: string) => (digits(s) === "" ? null : Number(digits(s)));

/**
 * Saisie en grille : prix, coût et stock de toutes les variantes, sans ouvrir les
 * fiches une par une. Entrée passe au champ suivant ; un seul enregistrement à la fin.
 * Chaque valeur est tapée par la personne : rien n'est deviné, rien n'est publié.
 */
export function EntryGrid({ rows, canCosts, canCount }: { rows: GridRow[]; canCosts: boolean; canCount: boolean }) {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [filter, setFilter] = useState<Filter>("sans-prix");
  const [q, setQ] = useState("");
  const { run, pending, failure, success, setSuccess } = useAction();

  // Valeur affichée : la saisie en cours, sinon la valeur enregistrée.
  const shown = (r: GridRow, f: Field) =>
    edits[r.variantId]?.[f] ??
    (f === "price" ? (r.price ? String(r.price) : "") : f === "cost" ? (r.cost == null ? "" : String(r.cost)) : "");

  const changes = useMemo(() => {
    const out: { variantId: string; price?: number; cost?: number | null; counted?: number }[] = [];
    for (const r of rows) {
      const e = edits[r.variantId];
      if (!e) continue;
      const c: (typeof out)[number] = { variantId: r.variantId };
      if (e.price !== undefined) {
        const n = toNum(e.price) ?? 0;
        if (n !== r.price) c.price = n;
      }
      if (canCosts && e.cost !== undefined) {
        const n = toNum(e.cost);
        if (n !== (r.cost ?? null)) c.cost = n;
      }
      if (canCount && e.counted !== undefined && toNum(e.counted) !== null) {
        const n = toNum(e.counted)!;
        if (n !== r.onHand) c.counted = n;
      }
      if (Object.keys(c).length > 1) out.push(c);
    }
    return out;
  }, [edits, rows, canCosts, canCount]);

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const r of rows) {
      const e = edits[r.variantId];
      const counted = e?.counted !== undefined ? toNum(e.counted) : null;
      if (counted !== null && counted < r.locked) out[r.variantId] = `Au moins ${r.locked} (réservé ou non vendable).`;
      else if (r.status === "published" && e?.price !== undefined && !toNum(e.price))
        out[r.variantId] = "Produit en ligne : le prix ne peut pas être vide.";
    }
    return out;
  }, [edits, rows]);

  // Ne pas perdre une saisie en quittant la page par erreur.
  useEffect(() => {
    if (!changes.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changes.length]);

  const set = (id: string, f: Field, v: string) =>
    setEdits((all) => ({ ...all, [id]: { ...all[id], [f]: digits(v) } }));

  const missing = (r: GridRow, f: Filter) =>
    f === "sans-prix"
      ? !(r.price > 0)
      : f === "sans-cout"
        ? r.cost == null
        : f === "sans-stock"
          ? r.onHand === 0
          : true;
  const needle = q.trim().toLowerCase();
  // Un produit reste affiché tant qu'on y travaille, même si sa saisie le sort du filtre.
  const visible = rows.filter(
    (r) =>
      (missing(r, filter) || edits[r.variantId]) &&
      (!needle || `${r.product} ${r.label} ${r.sku} ${r.category ?? ""}`.toLowerCase().includes(needle)),
  );
  const groups: { productId: string; rows: GridRow[] }[] = [];
  for (const r of visible) {
    const g = groups.at(-1);
    if (g?.productId === r.productId) g.rows.push(r);
    else groups.push({ productId: r.productId, rows: [r] });
  }

  const filters: [Filter, string][] = [
    ["sans-prix", "Sans prix"],
    ...(canCosts ? ([["sans-cout", "Sans coût"]] as [Filter, string][]) : []),
    ...(canCount ? ([["sans-stock", "Stock à 0"]] as [Filter, string][]) : []),
    ["tous", "Tout"],
  ];

  // Entrée = champ suivant, comme dans un tableur.
  const nextOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("[data-grid-input]"));
    all[all.indexOf(e.currentTarget) + 1]?.focus();
  };

  const input = (r: GridRow, f: Field, label: string, placeholder = "") => (
    <label className="grid min-w-0 gap-0.5">
      <span className="text-[12px] font-bold text-ink-mute">{label}</span>
      <input
        data-grid-input
        className={`field !min-h-11 tabular ${edits[r.variantId]?.[f] !== undefined ? "!border-gps-blue" : ""}`}
        inputMode="numeric"
        pattern="[0-9 ]*"
        enterKeyHint="next"
        autoComplete="off"
        aria-label={`${label} — ${r.product}${r.label ? ` ${r.label}` : ""}`}
        placeholder={placeholder}
        value={shown(r, f)}
        onChange={(e) => set(r.variantId, f, e.target.value)}
        onKeyDown={nextOnEnter}
      />
    </label>
  );

  const samePrice = (g: GridRow[]) => {
    const first = toNum(shown(g[0], "price"));
    if (!first) return;
    setEdits((all) => {
      const next = { ...all };
      for (const r of g.slice(1)) next[r.variantId] = { ...next[r.variantId], price: String(first) };
      return next;
    });
  };

  const blocked = Object.keys(errors).length > 0;

  return (
    <div className="pb-28">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Filtres" className="flex flex-wrap gap-2">
          {filters.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={`chip ${filter === k ? "!border-ink !bg-ink !text-white" : ""}`}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {l} ({rows.filter((r) => missing(r, k)).length})
            </button>
          ))}
        </nav>
        <label className="sr-only" htmlFor="grid-q">
          Rechercher
        </label>
        <input
          id="grid-q"
          type="search"
          className="field !min-h-11 max-w-xs"
          placeholder="Rechercher un produit…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {groups.length ? (
        <ul className="grid gap-3" aria-label="Variantes à saisir">
          {groups.map(({ productId, rows: g }) => (
            <li key={productId} className="rounded-[6px] border border-line bg-card p-3" data-testid="grid-product">
              <div className="mb-2 flex items-center gap-3">
                <span className="relative block h-12 w-10 shrink-0 overflow-hidden rounded-[4px] bg-paper-deep">
                  {g[0].photo ? (
                    <Image src={g[0].photo} alt="" fill sizes="40px" unoptimized className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-ink-mute">
                      <IconImage size={18} />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/comptoir/catalogue/${productId}`}
                    className="font-bold [overflow-wrap:anywhere] hover:underline"
                  >
                    {g[0].product}
                  </Link>
                  <p className="text-[13px] text-ink-mute">
                    {g[0].category ?? "Sans catégorie"}
                    {g[0].status === "published" ? " · en ligne" : " · brouillon"}
                  </p>
                </div>
                {g.length > 1 && toNum(shown(g[0], "price")) ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => samePrice(g)}>
                    Même prix partout
                  </button>
                ) : null}
              </div>
              <div className="grid gap-2">
                {g.map((r) => (
                  <div key={r.variantId} className="grid gap-1">
                    {g.length > 1 || r.label ? (
                      <p className="text-[13px] font-semibold text-ink-soft">{r.label || r.sku}</p>
                    ) : null}
                    <div className={`grid gap-2 ${canCosts && canCount ? "grid-cols-3" : "grid-cols-2"}`}>
                      {input(r, "price", "Prix FCFA")}
                      {canCosts ? input(r, "cost", "Coût FCFA") : null}
                      {canCount ? input(r, "counted", `Stock (${r.onHand})`, String(r.onHand)) : null}
                    </div>
                    {errors[r.variantId] ? (
                      <p role="alert" className="text-[13px] font-semibold text-gps-red-ink">
                        {errors[r.variantId]}
                      </p>
                    ) : canCosts &&
                      (toNum(shown(r, "cost")) ?? 0) > 0 &&
                      (toNum(shown(r, "price")) ?? 0) > 0 &&
                      toNum(shown(r, "cost"))! >= toNum(shown(r, "price"))! ? (
                      <p className="text-[13px] font-semibold text-gps-red-ink">
                        Attention : le coût dépasse le prix de vente.
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[6px] border border-line bg-card p-5 text-ink-soft">
          Rien à saisir dans ce filtre. Choisissez « Tout » pour revoir les valeurs déjà saisies.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 py-3 pr-20 pb-[max(12px,env(safe-area-inset-bottom))] pl-4 backdrop-blur lg:pr-4">
        <div className="mx-auto grid max-w-5xl gap-2">
          <ActionFeedback failure={failure} success={success} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] text-ink-soft" data-testid="grid-pending">
              {changes.length
                ? `${changes.length} ligne${changes.length > 1 ? "s" : ""} modifiée${changes.length > 1 ? "s" : ""}, pas encore enregistrée${changes.length > 1 ? "s" : ""}.`
                : "Tapez les valeurs : Entrée passe au champ suivant."}
            </p>
            <div className="flex gap-2">
              {changes.length ? (
                <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setEdits({})}>
                  Annuler
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending || !changes.length || blocked}
                onClick={() =>
                  run(() => entryGridSaveAction({ changes }), {
                    onSuccess: (d) => {
                      setEdits({});
                      setSuccess(d.message);
                    },
                  })
                }
              >
                {pending ? "Enregistrement…" : `Tout enregistrer${changes.length ? ` (${changes.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
