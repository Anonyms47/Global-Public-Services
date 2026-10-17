"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { quickCountAction } from "@/app/comptoir/(app)/stock/actions";
import { ActionFeedback, useAction } from "./useAction";
import { IconImage } from "../ui/icons";

interface Row {
  variantId: string;
  productId: string;
  name: string;
  variant: string;
  sku: string;
  onHand: number;
  reserved: number;
  photo: string | null;
}

/** Comptage article par article : nouvelle quantité, écart calculé, mouvement d'inventaire tracé. */
export function QuickCount({ rows, query }: { rows: Row[]; query: string }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("Comptage rapide");
  const [q, setQ] = useState(query);
  const [done, setDone] = useState<Record<string, { before: number; after: number }>>({});
  const { run, pending, failure, success } = useAction();
  const r = rows[i];
  const current = r ? (done[r.variantId]?.after ?? r.onHand) : 0;
  const n = counted.trim() === "" ? null : Math.max(0, Math.round(Number(counted.replace(/\s/g, "")) || 0));
  const diff = n === null ? null : n - current;
  const next = () => {
    setCounted("");
    setI((x) => Math.min(x + 1, rows.length));
  };

  return (
    <div className="grid max-w-xl gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/comptoir/stock/comptage${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        }}
      >
        <input
          aria-label="Rechercher un produit, une référence ou un code-barres"
          className="field min-w-0 flex-1"
          placeholder="Nom, référence ou code-barres"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn btn-outline">Chercher</button>
      </form>

      {!rows.length ? (
        <p className="rounded-[6px] border border-line bg-card p-5 text-ink-soft">Aucun article trouvé.</p>
      ) : !r ? (
        <div className="rounded-[6px] border-[1.5px] border-wa/40 bg-wa-soft p-5">
          <p className="font-bold text-wa-ink">Comptage terminé : {Object.keys(done).length} article(s) corrigé(s).</p>
          <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setI(0)}>
            Recommencer depuis le début
          </button>
        </div>
      ) : (
        <section
          className="grid gap-4 rounded-[6px] border-[1.5px] border-ink bg-card p-4"
          aria-label={`Comptage de ${r.name}`}
        >
          <p className="text-[13px] font-bold text-ink-mute">
            Article {i + 1} sur {rows.length}
          </p>
          <div className="grid grid-cols-[96px_1fr] gap-3">
            <div className="relative aspect-[4/5] w-24 overflow-hidden rounded-[4px] bg-paper-deep">
              {r.photo ? (
                <Image src={r.photo} alt="" fill sizes="96px" unoptimized className="object-cover" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-ink-mute">
                  <IconImage size={24} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-display text-2xl leading-tight font-bold [overflow-wrap:anywhere] uppercase">
                {r.name}
              </p>
              {r.variant ? <p className="font-semibold">{r.variant}</p> : null}
              <p className="font-mono text-[13px] text-ink-mute">{r.sku}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[6px] bg-paper-deep p-2">
              <dt className="text-[12px] text-ink-mute">Stock actuel</dt>
              <dd className="text-2xl font-bold tabular" data-testid="stock-actuel">
                {current}
              </dd>
            </div>
            <div className="rounded-[6px] bg-paper-deep p-2">
              <dt className="text-[12px] text-ink-mute">Nouvelle quantité</dt>
              <dd className="text-2xl font-bold tabular">{n ?? "—"}</dd>
            </div>
            <div className="rounded-[6px] bg-paper-deep p-2">
              <dt className="text-[12px] text-ink-mute">Différence</dt>
              <dd
                className={`text-2xl font-bold tabular ${diff ? (diff > 0 ? "text-wa-ink" : "text-gps-red-ink") : ""}`}
                data-testid="difference"
              >
                {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
              </dd>
            </div>
          </dl>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (n === null) return;
              if (diff === 0) return next();
              run(() => quickCountAction({ variantId: r.variantId, counted: n, reason }), {
                refresh: false,
                successMessage: `${r.name} : ${current} → ${n}.`,
                onSuccess: () => {
                  setDone((d) => ({ ...d, [r.variantId]: { before: current, after: n } }));
                  next();
                },
              });
            }}
          >
            <div>
              <label className="label" htmlFor="qc-count">
                Quantité comptée
              </label>
              <input
                id="qc-count"
                className="field text-2xl tabular"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                autoFocus
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
              {r.reserved ? (
                <p className="hint">
                  {r.reserved} réservé(s) ou non vendable(s) : la quantité ne peut pas être inférieure.
                </p>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="qc-reason">
                Motif
              </label>
              <input
                id="qc-reason"
                className="field"
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={pending || n === null || !reason.trim()}>
                {diff === 0 ? "Quantité juste · suivant" : "Enregistrer et suivant"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={next}>
                Passer
              </button>
            </div>
          </form>
          <ActionFeedback failure={failure} success={success} />
        </section>
      )}
    </div>
  );
}
