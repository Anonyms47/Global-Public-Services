"use client";

import Link from "next/link";
import { useState } from "react";
import { applyImportAction, previewImportAction } from "@/app/comptoir/(app)/catalogue/import/actions";
import type { ImportField, ImportMapping, ImportPreview, ImportReport } from "@/server/domain/import";
import { fcfa } from "@/lib/format";
import { toCsv } from "@/lib/csv";
import { ActionFeedback, useAction } from "./useAction";
import { Badge } from "./ui";
import { IconDownload, IconUpload } from "../ui/icons";

const FIELDS: [ImportField, string, boolean][] = [
  ["nom", "Nom du produit", true],
  ["reference", "Référence (variante)", true],
  ["prix", "Prix de vente", true],
  ["marque", "Marque", false],
  ["categorie", "Catégorie", false],
  ["description", "Description", false],
  ["cout", "Coût d'achat", false],
  ["stock", "Stock initial", false],
  ["options", "Options (Couleur=Noir|…)", false],
];

/**
 * Lecture du fichier : UTF-8, sinon Windows-1252 (CSV enregistré par Excel
 * en français) ; un classeur Excel (.xlsx) est signalé avec la marche à suivre.
 */
async function readCsv(file: File): Promise<{ text: string } | { error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return {
      error:
        "C'est un classeur Excel (.xlsx). Dans Excel : Fichier → Enregistrer sous → « CSV UTF-8 (délimité par des virgules) », puis choisissez ce fichier.",
    };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes) };
  }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportForm() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | undefined>(undefined);
  const [partial, setPartial] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const check = useAction();
  const apply = useAction();

  const reset = () => (setPreview(null), setReport(null), setMapping(undefined), setPartial(false));
  const verify = (m?: ImportMapping) =>
    check.run(() => previewImportAction(csv, m), {
      refresh: false,
      onSuccess: (p) => (setPreview(p), setMapping(p.mapping), setReport(null)),
    });
  const valid = preview ? preview.products.reduce((s, p) => s + p.variants.length, 0) : 0;
  const errorReport = (rows: ImportPreview["errors"], headers: string[]) =>
    download(
      "lignes-a-corriger.csv",
      toCsv([["ligne", "erreur", ...headers], ...rows.map((e) => [e.line, e.message, ...e.raw])]),
    );

  return (
    <div className="grid gap-5">
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-line bg-white p-5 text-center focus-within:border-gps-blue hover:border-gps-blue">
        <IconUpload />
        <span className="font-bold">{fileName || "Choisir un fichier CSV"}</span>
        <span className="text-[13px] text-ink-mute">
          Séparateur « ; » ou « , » · UTF-8 ou CSV d&apos;Excel · 1 000 lignes maximum · colonnes reconnues ou à
          associer
        </span>
        <input
          type="file"
          accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setFileName(f.name);
            reset();
            const r = await readCsv(f);
            if ("error" in r) return (setFileError(r.error), setCsv(""));
            setFileError(null);
            setCsv(r.text);
          }}
        />
      </label>
      {fileError ? (
        <p role="alert" className="rounded-[6px] bg-warn-soft p-3 text-[14px] font-semibold text-warn">
          {fileError}
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-[14px] font-semibold text-gps-blue">
          Ou coller le contenu du fichier
        </summary>
        <label htmlFor="import-text" className="sr-only">
          Contenu CSV
        </label>
        <textarea
          id="import-text"
          className="field mt-2 min-h-40 font-mono text-[13px]"
          value={csv}
          onChange={(e) => (setCsv(e.target.value), reset())}
        />
      </details>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ink"
          disabled={!csv.trim() || check.pending}
          onClick={() => verify(undefined)}
        >
          {check.pending ? "Vérification…" : "Vérifier le fichier"}
        </button>
        <Link href="/comptoir/catalogue/import/modele" className="btn btn-outline" prefetch={false}>
          Télécharger le modèle
        </Link>
      </div>
      <ActionFeedback failure={check.failure} />

      {preview && mapping ? (
        <details
          open={preview.missing.length > 0}
          className="rounded-[6px] border border-line bg-card p-4"
          aria-labelledby="t-colonnes"
        >
          <summary id="t-colonnes" className="cursor-pointer font-bold">
            Association des colonnes{" "}
            {preview.missing.length ? (
              <Badge tone="red">À compléter</Badge>
            ) : (
              <span className="text-[14px] font-normal text-ink-mute">(reconnue automatiquement, modifiable)</span>
            )}
          </summary>
          <p className="mt-2 text-[14px] text-ink-soft">
            Pour chaque information, choisissez la colonne correspondante de votre fichier. Les colonnes marquées * sont
            obligatoires.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(([k, label, required]) => (
              <div key={k}>
                <label className="label" htmlFor={`map-${k}`}>
                  {label}
                  {required ? " *" : ""}
                </label>
                <select
                  id={`map-${k}`}
                  className="field"
                  aria-invalid={required && mapping[k] == null}
                  value={mapping[k] ?? ""}
                  onChange={(e) =>
                    setMapping({ ...mapping, [k]: e.target.value === "" ? null : Number(e.target.value) })
                  }
                >
                  <option value="">— Aucune —</option>
                  {preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Colonne ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ink btn-sm mt-3"
            disabled={check.pending}
            onClick={() => verify(mapping)}
          >
            Appliquer et vérifier à nouveau
          </button>
        </details>
      ) : null}

      {preview && !preview.missing.length ? (
        <section aria-labelledby="t-apercu" className="rounded-[6px] border border-line bg-card p-4">
          <h2 id="t-apercu" className="font-bold">
            Aperçu : {preview.lines} ligne{preview.lines > 1 ? "s" : ""}, {preview.products.length} produit
            {preview.products.length > 1 ? "s" : ""} ({valid} variante{valid > 1 ? "s" : ""}), {preview.errors.length}{" "}
            erreur{preview.errors.length > 1 ? "s" : ""}
          </h2>
          {preview.warnings.length ? (
            <ul className="mt-3 grid gap-1 rounded-[6px] bg-warn-soft p-3 text-[14px] text-warn">
              {preview.warnings.slice(0, 20).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {preview.errors.length ? (
            <div className="mt-3 rounded-[6px] bg-gps-red-soft p-3 text-[14px] text-gps-red-ink">
              <ul className="grid gap-1">
                {preview.errors.slice(0, 50).map((e) => (
                  <li key={e.line}>
                    Ligne {e.line} : {e.message}
                  </li>
                ))}
                {preview.errors.length > 50 ? <li>… et {preview.errors.length - 50} autre(s).</li> : null}
              </ul>
              <button
                type="button"
                className="btn btn-outline btn-sm mt-2"
                onClick={() => errorReport(preview.errors, preview.headers)}
              >
                <IconDownload size={16} /> Télécharger les lignes à corriger
              </button>
            </div>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                  <th className="py-2 font-bold">Produit</th>
                  <th className="py-2 font-bold">Référence</th>
                  <th className="py-2 font-bold">Options</th>
                  <th className="py-2 text-right font-bold">Prix</th>
                  <th className="py-2 text-right font-bold">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {preview.products.flatMap((p) =>
                  p.variants.map((v, i) => (
                    <tr key={v.sku}>
                      <td className="py-1.5">
                        {i === 0 ? (
                          <>
                            <span className="font-semibold">{p.name}</span>{" "}
                            {!p.category ? <Badge tone="warn">Sans catégorie</Badge> : null}
                          </>
                        ) : null}
                      </td>
                      <td className="py-1.5">{v.sku}</td>
                      <td className="py-1.5 text-ink-mute">
                        {Object.entries(v.options)
                          .map(([k, val]) => `${k} : ${val}`)
                          .join(" · ") || "—"}
                      </td>
                      <td className="py-1.5 text-right tabular">{fcfa(v.price)}</td>
                      <td className="py-1.5 text-right tabular">{v.stock}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {!report ? (
            <div className="mt-4 grid gap-3">
              {preview.errors.length && preview.products.length ? (
                <label className="flex min-h-11 items-start gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={partial}
                    onChange={(e) => setPartial(e.target.checked)}
                  />
                  <span>
                    <strong>Importer seulement les lignes valides</strong> ({valid} variante{valid > 1 ? "s" : ""}). Les{" "}
                    {preview.errors.length} ligne{preview.errors.length > 1 ? "s" : ""} en erreur seront listées dans le
                    rapport, à corriger et réimporter.
                  </span>
                </label>
              ) : null}
              <button
                type="button"
                className="btn btn-primary justify-self-start"
                disabled={apply.pending || !preview.products.length || (preview.errors.length > 0 && !partial)}
                onClick={() =>
                  apply.run(() => applyImportAction(csv, { mapping, partial }), { onSuccess: (r) => setReport(r) })
                }
              >
                {apply.pending ? "Import…" : `Importer ${preview.products.length} produit(s) en brouillon`}
              </button>
            </div>
          ) : null}
          <div className="mt-3">
            <ActionFeedback failure={apply.failure} success={apply.success} />
          </div>
        </section>
      ) : null}

      {report ? (
        <section aria-labelledby="t-rapport" className="rounded-[6px] border-[1.5px] border-wa bg-card p-4">
          <h2 id="t-rapport" className="font-bold">
            Rapport d&apos;import : {report.products} produit{report.products > 1 ? "s" : ""} créé
            {report.products > 1 ? "s" : ""} ({report.variants} variante{report.variants > 1 ? "s" : ""}),{" "}
            {report.skipped.length} ligne{report.skipped.length > 1 ? "s" : ""} ignorée
            {report.skipped.length > 1 ? "s" : ""}
          </h2>
          <ul className="mt-3 grid gap-1 text-[14px]">
            {report.created.map((c) => (
              <li key={c.id}>
                <Link href={`/comptoir/catalogue/${c.id}`} className="font-semibold text-gps-blue hover:underline">
                  {c.name}
                </Link>{" "}
                <span className="text-ink-mute">
                  · {c.variants} variante{c.variants > 1 ? "s" : ""} · brouillon
                </span>
              </li>
            ))}
          </ul>
          {report.skipped.length ? (
            <button
              type="button"
              className="btn btn-outline btn-sm mt-3"
              onClick={() => errorReport(report.skipped, report.headers)}
            >
              <IconDownload size={16} /> Télécharger les lignes ignorées (à corriger)
            </button>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/comptoir/catalogue?statut=draft" className="btn btn-blue">
              Voir les brouillons importés
            </Link>
            <button type="button" className="btn btn-outline" onClick={() => (setCsv(""), setFileName(""), reset())}>
              Nouvel import
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
