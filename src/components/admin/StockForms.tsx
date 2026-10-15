"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  adjustAction,
  inventoryApplyAction,
  inventoryPreviewAction,
  restockAction,
  unsellableAction,
} from "@/app/comptoir/(app)/stock/actions";
import { ActionFeedback, useAction } from "./useAction";
import { Sheet } from "../ui/Sheet";
import { IconTrash } from "../ui/icons";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AdjustButton({
  variantId,
  label,
  onHand,
  reserved,
}: {
  variantId: string;
  label: string;
  onHand: number;
  reserved: number;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const { run, pending, failure, success, setSuccess } = useAction();
  const d = Number(delta);
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => (setOpen(true), setSuccess(null))}>
        Ajuster
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Ajustement" side="center">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => adjustAction(variantId, d, reason), {
              onSuccess: () => (setDelta(""), setReason("")),
            });
          }}
        >
          <p className="font-semibold">{label}</p>
          <p className="text-[14px] text-ink-soft">
            Physique actuel : {onHand} · réservé : {reserved}. Pour un comptage complet, préférez l&apos;inventaire.
          </p>
          <div>
            <label className="label" htmlFor={`adj-${variantId}`}>
              Variation (ex. −1 pour une casse, +2 pour un oubli)
            </label>
            <input
              id={`adj-${variantId}`}
              inputMode="numeric"
              className="field"
              value={delta}
              onChange={(e) => setDelta(e.target.value.replace(/[^\d-]/g, ""))}
            />
            {Number.isInteger(d) && d !== 0 ? <p className="hint">Nouveau stock physique : {onHand + d}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor={`adj-r-${variantId}`}>
              Motif (obligatoire)
            </label>
            <input
              id={`adj-r-${variantId}`}
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Casse, perte, erreur de saisie…"
            />
          </div>
          <ActionFeedback failure={failure} success={success} />
          <button className="btn btn-blue" disabled={pending || !delta || !reason.trim()}>
            Enregistrer l&apos;ajustement
          </button>
        </form>
      </Sheet>
    </>
  );
}

const unsellableChoices = [
  [
    "unsellable",
    "Passer en non vendable",
    "Abîmé, en contrôle, pièce d'exposition : retiré de la vente, toujours en stock.",
  ],
  ["sellable", "Remettre en vente", "L'article est de nouveau vendable."],
  [
    "writeoff",
    "Sortir du stock",
    "L'article non vendable quitte définitivement le stock (casse, perte, retour fournisseur).",
  ],
] as const;

export function UnsellableButton({
  variantId,
  label,
  available,
  unsellable,
}: {
  variantId: string;
  label: string;
  available: number;
  unsellable: number;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<(typeof unsellableChoices)[number][0]>("unsellable");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const { run, pending, failure, success, setSuccess } = useAction();
  const max = action === "unsellable" ? available : unsellable;
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => (setOpen(true), setSuccess(null))}>
        Non vendable
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Stock non vendable" side="center">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => unsellableAction({ variantId, action, quantity: Number(quantity), reason }), {
              onSuccess: () => setReason(""),
            });
          }}
        >
          <p className="font-semibold">{label}</p>
          <p className="text-[14px] text-ink-soft">
            Disponible à la vente : {available} · non vendable : {unsellable}.
          </p>
          <fieldset className="grid gap-2">
            <legend className="label">Opération</legend>
            {unsellableChoices.map(([k, title, text]) => (
              <label key={k} className="flex gap-2 rounded-[6px] border border-line p-2 text-[14px]">
                <input
                  type="radio"
                  name={`uns-${variantId}`}
                  checked={action === k}
                  disabled={k !== "unsellable" && unsellable === 0}
                  onChange={() => setAction(k)}
                />
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="text-ink-mute">{text}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div>
            <label className="label" htmlFor={`uns-q-${variantId}`}>
              Quantité (max. {max})
            </label>
            <input
              id={`uns-q-${variantId}`}
              inputMode="numeric"
              className="field"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div>
            <label className="label" htmlFor={`uns-r-${variantId}`}>
              Motif (obligatoire)
            </label>
            <input
              id={`uns-r-${variantId}`}
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Écran fissuré, boîte abîmée, exposition…"
            />
          </div>
          <ActionFeedback failure={failure} success={success} />
          <button
            className="btn btn-blue"
            disabled={pending || !reason.trim() || !Number(quantity) || Number(quantity) > max}
          >
            Enregistrer
          </button>
        </form>
      </Sheet>
    </>
  );
}

interface V {
  id: string;
  label: string;
  sku: string;
  available: number;
  onHand: number;
  low: boolean;
}

export function RestockForm({ variants, preselect }: { variants: V[]; preselect?: string }) {
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<{ id: string; quantity: number }[]>(() =>
    preselect && variants.some((v) => v.id === preselect) ? [{ id: preselect, quantity: 1 }] : [],
  );
  const [reference, setReference] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const { run, pending, failure, success } = useAction();
  const found = useMemo(() => {
    const t = norm(q).split(/\s+/).filter(Boolean);
    const list = t.length
      ? variants.filter((v) => t.every((x) => norm(`${v.label} ${v.sku}`).includes(x)))
      : variants.filter((v) => v.low);
    return list.filter((v) => !lines.some((l) => l.id === v.id)).slice(0, 12);
  }, [q, variants, lines]);
  const byId = (id: string) => variants.find((v) => v.id === id)!;
  const total = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
      <section aria-labelledby="t-recherche">
        <h2 id="t-recherche" className="mb-2 font-bold">
          Articles reçus
        </h2>
        <label htmlFor="rs-q" className="sr-only">
          Rechercher un article
        </label>
        <input
          id="rs-q"
          className="field"
          placeholder="Rechercher (nom, référence)… — les stocks faibles sont proposés par défaut"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="mt-2 divide-y divide-line-soft rounded-[6px] border border-line bg-card">
          {found.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-paper"
                onClick={() => (setLines([...lines, { id: v.id, quantity: 1 }]), setReview(false))}
              >
                <span>
                  <span className="font-semibold">{v.label}</span>
                  <span className="block text-[12px] text-ink-mute">{v.sku}</span>
                </span>
                <span className={`text-[13px] ${v.low ? "font-bold text-warn" : "text-ink-mute"}`}>
                  {v.available} dispo.
                </span>
              </button>
            </li>
          ))}
          {found.length === 0 ? (
            <li className="p-3 text-ink-mute">
              {q ? "Aucun article." : "Aucun stock faible : recherchez un article."}
            </li>
          ) : null}
        </ul>
      </section>
      <section aria-labelledby="t-lot" className="rounded-[6px] border border-line bg-card p-4">
        <h2 id="t-lot" className="font-bold">
          Lot à enregistrer
        </h2>
        {lines.length === 0 ? <p className="mt-2 text-ink-mute">Aucun article ajouté.</p> : null}
        <ul className="mt-2 divide-y divide-line-soft">
          {lines.map((l) => {
            const v = byId(l.id);
            return (
              <li key={l.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 text-[14px]">
                  <span className="font-semibold">{v.label}</span>
                  <span className="block text-[12px] text-ink-mute">
                    {v.sku} · physique {v.onHand} → {v.onHand + l.quantity}
                  </span>
                </span>
                <label className="sr-only" htmlFor={`rq-${l.id}`}>
                  Quantité reçue
                </label>
                <input
                  id={`rq-${l.id}`}
                  type="number"
                  min={1}
                  className="field h-10 min-h-10 w-20"
                  value={l.quantity}
                  onChange={(e) => (
                    setLines(
                      lines.map((x) =>
                        x.id === l.id
                          ? {
                              ...x,
                              quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                            }
                          : x,
                      ),
                    ),
                    setReview(false)
                  )}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-2"
                  onClick={() => setLines(lines.filter((x) => x.id !== l.id))}
                  aria-label={`Retirer ${v.label}`}
                >
                  <IconTrash size={18} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rs-ref">
                Réf. du lot / bon
              </label>
              <input id="rs-ref" className="field" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="rs-sup">
                Fournisseur
              </label>
              <input id="rs-sup" className="field" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="rs-note">
              Note
            </label>
            <input id="rs-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <ActionFeedback failure={failure} success={success} />
          {!review ? (
            <button type="button" className="btn btn-ink" disabled={!lines.length} onClick={() => setReview(true)}>
              Vérifier le lot ({total} article{total > 1 ? "s" : ""})
            </button>
          ) : (
            <div className="rounded-[6px] bg-gps-blue-soft p-3 text-[14px] text-gps-blue-deep">
              <p className="font-bold">
                {lines.length} référence(s), {total} article(s) ajoutés au stock physique.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReview(false)}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm flex-1"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        restockAction({
                          lines: lines.map((l) => ({
                            variantId: l.id,
                            quantity: l.quantity,
                          })),
                          reference,
                          supplier,
                          note,
                        }),
                      {
                        onSuccess: () => (setLines([]), setReview(false), setReference(""), setNote("")),
                      },
                    )
                  }
                >
                  Confirmer le réapprovisionnement
                </button>
              </div>
            </div>
          )}
          {success ? (
            <Link
              href="/comptoir/stock/mouvements?type=restock"
              className="text-[14px] font-semibold text-gps-blue hover:underline"
            >
              Voir les mouvements enregistrés
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function InventoryForm({
  rows,
}: {
  rows: {
    id: string;
    label: string;
    sku: string;
    onHand: number;
    reserved: number;
  }[];
}) {
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<
    | {
        variantId: string;
        sku: string;
        name: string;
        recorded: number;
        counted: number;
        delta: number;
        problem: string | null;
      }[]
    | null
  >(null);
  const { run, pending, failure, success, setSuccess } = useAction();
  const list = useMemo(() => {
    const t = norm(q).split(/\s+/).filter(Boolean);
    return t.length ? rows.filter((r) => t.every((x) => norm(`${r.label} ${r.sku}`).includes(x))) : rows;
  }, [q, rows]);
  const entered = Object.entries(counts)
    .filter(([, v]) => v.trim() !== "")
    .map(([variantId, v]) => ({
      variantId,
      counted: Math.max(0, Math.floor(Number(v) || 0)),
    }));
  const changes = preview?.filter((p) => p.delta !== 0) ?? [];
  const problems = preview?.filter((p) => p.problem) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <section aria-labelledby="t-comptage">
        <h2 id="t-comptage" className="sr-only">
          Comptage
        </h2>
        <label htmlFor="inv-q" className="sr-only">
          Filtrer
        </label>
        <input
          id="inv-q"
          className="field mb-2"
          placeholder="Filtrer (nom, référence)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                <th className="px-3 py-2 font-bold">Article</th>
                <th className="py-2 text-right font-bold">Enregistré</th>
                <th className="px-3 py-2 text-right font-bold">Compté</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-[12px] text-ink-mute">
                      {r.sku}
                      {r.reserved ? ` · ${r.reserved} réservé(s)` : ""}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular">{r.onHand}</td>
                  <td className="px-3 py-2 text-right">
                    <label className="sr-only" htmlFor={`inv-${r.id}`}>
                      Quantité comptée pour {r.label}
                    </label>
                    <input
                      id={`inv-${r.id}`}
                      type="number"
                      min={0}
                      className="field ml-auto h-10 min-h-10 w-24 text-right"
                      value={counts[r.id] ?? ""}
                      onChange={(e) => (
                        setCounts({ ...counts, [r.id]: e.target.value }),
                        setPreview(null),
                        setSuccess(null)
                      )}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        className="grid content-start gap-3 rounded-[6px] border border-line bg-card p-4 lg:sticky lg:top-24"
        aria-labelledby="t-ecarts"
      >
        <h2 id="t-ecarts" className="font-bold">
          Écarts
        </h2>
        <p className="text-[14px] text-ink-soft">{entered.length} article(s) compté(s).</p>
        <button
          type="button"
          className="btn btn-ink"
          disabled={!entered.length || pending}
          onClick={() =>
            run(() => inventoryPreviewAction(entered), {
              refresh: false,
              onSuccess: setPreview,
            })
          }
        >
          Calculer les écarts
        </button>
        {preview ? (
          <>
            {changes.length === 0 ? (
              <p className="font-semibold text-wa-ink">Aucun écart : le stock enregistré correspond au comptage.</p>
            ) : (
              <ul className="divide-y divide-line-soft text-[14px]">
                {changes.map((p) => (
                  <li key={p.variantId} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {p.name} <span className="text-ink-mute">· {p.sku}</span>
                      {p.problem ? <span className="block font-semibold text-gps-red-ink">{p.problem}</span> : null}
                    </span>
                    <span className="whitespace-nowrap tabular">
                      {p.recorded} → {p.counted}{" "}
                      <strong className={p.delta > 0 ? "text-wa-ink" : "text-gps-red-ink"}>
                        ({p.delta > 0 ? "+" : ""}
                        {p.delta})
                      </strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <label className="label" htmlFor="inv-note">
              Note d&apos;inventaire
            </label>
            <input
              id="inv-note"
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. inventaire mensuel"
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending || changes.length === 0 || problems.length > 0}
              onClick={() =>
                run(() => inventoryApplyAction(entered, note), {
                  onSuccess: (r) => (
                    setSuccess(`Inventaire validé : ${r.changed} ajustement(s) enregistré(s).`),
                    setCounts({}),
                    setPreview(null)
                  ),
                })
              }
            >
              Valider l&apos;inventaire
            </button>
          </>
        ) : null}
        <ActionFeedback failure={failure} success={success} />
      </section>
    </div>
  );
}
