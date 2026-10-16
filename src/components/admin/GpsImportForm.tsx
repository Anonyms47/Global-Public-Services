"use client";

import Link from "next/link";
import { useState } from "react";
import { applyGpsImportAction } from "@/app/comptoir/(app)/catalogue/import/actions";
import { ActionFeedback, useAction } from "./useAction";

type Report =
  Awaited<ReturnType<typeof applyGpsImportAction>> extends infer R
    ? R extends { ok: true; data: infer D }
      ? D
      : never
    : never;

/** Confirmation tapée, puis rapport avec un lien vers chaque brouillon créé. */
export function GpsImportForm({ pending }: { pending: number }) {
  const [confirm, setConfirm] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const { run, pending: busy, failure } = useAction();
  return (
    <div className="grid gap-3">
      {pending ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => applyGpsImportAction(confirm), { onSuccess: (r) => setReport(r) });
          }}
        >
          <p className="text-[14px] text-ink-soft">
            {pending} produit{pending > 1 ? "s" : ""} seront créés en brouillon. Une sauvegarde datée est faite avant.
            Relancer l&apos;import ne crée jamais de doublon.
          </p>
          <div>
            <label className="label" htmlFor="gps-import-confirm">
              Tapez IMPORTER pour confirmer
            </label>
            <input
              id="gps-import-confirm"
              className="field"
              autoComplete="off"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className="btn btn-blue" disabled={busy || confirm.trim().toUpperCase() !== "IMPORTER"}>
            {busy ? "Import en cours…" : `Importer ${pending} brouillon${pending > 1 ? "s" : ""}`}
          </button>
        </form>
      ) : (
        <p className="font-semibold text-wa-ink">Tout le manifeste est déjà importé.</p>
      )}
      <ActionFeedback failure={failure} />
      {report ? (
        <section role="status" aria-label="Rapport d'import" className="grid gap-2 text-[14px]">
          <p className="font-bold">
            {report.created.length} brouillon{report.created.length > 1 ? "s" : ""} créé
            {report.created.length > 1 ? "s" : ""} · {report.skipped.length} ignoré
            {report.skipped.length > 1 ? "s" : ""} · {report.errors.length} erreur{report.errors.length > 1 ? "s" : ""}
          </p>
          <p className="text-ink-mute">Sauvegarde : {report.backup}</p>
          {report.errors.length ? (
            <ul className="text-gps-red-ink">
              {report.errors.map((e) => (
                <li key={e.name}>
                  {e.name} : {e.error}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="grid max-h-80 gap-1 overflow-auto">
            {report.created.map((c) => (
              <li key={c.id}>
                <Link href={`/comptoir/catalogue/${c.id}`} className="text-gps-blue underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
