"use client";

import Link from "next/link";
import { useState } from "react";
import { applyImportAction, previewImportAction } from "@/app/comptoir/(app)/catalogue/import/actions";
import type { ImportPreview } from "@/server/domain/import";
import { fcfa } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";
import { Badge } from "./ui";
import { IconUpload } from "../ui/icons";

export function ImportForm() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const check = useAction();
  const apply = useAction();
  const [done, setDone] = useState(false);
  return (
    <div className="grid gap-5">
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-line bg-white p-5 text-center focus-within:border-gps-blue hover:border-gps-blue">
        <IconUpload />
        <span className="font-bold">{fileName || "Choisir un fichier CSV"}</span>
        <span className="text-[13px] text-ink-mute">Séparateur « ; » ou « , » · UTF-8 · 1 000 lignes maximum</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFileName(f.name);
            setCsv(await f.text());
            setPreview(null);
            setDone(false);
          }}
        />
      </label>
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
          onChange={(e) => (setCsv(e.target.value), setPreview(null), setDone(false))}
        />
      </details>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ink"
          disabled={!csv.trim() || check.pending}
          onClick={() => check.run(() => previewImportAction(csv), { refresh: false, onSuccess: (p) => setPreview(p) })}
        >
          {check.pending ? "Vérification…" : "Vérifier le fichier"}
        </button>
        <Link href="/comptoir/catalogue/import/modele" className="btn btn-outline" prefetch={false}>
          Télécharger le modèle
        </Link>
      </div>
      <ActionFeedback failure={check.failure} />

      {preview ? (
        <section aria-labelledby="t-apercu" className="rounded-[6px] border border-line bg-card p-4">
          <h2 id="t-apercu" className="font-bold">
            Aperçu : {preview.lines} ligne{preview.lines > 1 ? "s" : ""}, {preview.products.length} produit
            {preview.products.length > 1 ? "s" : ""}, {preview.errors.length} erreur
            {preview.errors.length > 1 ? "s" : ""}
          </h2>
          {preview.errors.length ? (
            <ul className="mt-3 grid gap-1 rounded-[6px] bg-gps-red-soft p-3 text-[14px] text-gps-red-ink">
              {preview.errors.slice(0, 50).map((e) => (
                <li key={e.line}>
                  Ligne {e.line} : {e.message}
                </li>
              ))}
              {preview.errors.length > 50 ? <li>… et {preview.errors.length - 50} autre(s).</li> : null}
            </ul>
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
          {done ? (
            <Link href="/comptoir/catalogue?statut=draft" className="btn btn-blue mt-4">
              Voir les brouillons importés
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary mt-4"
              disabled={apply.pending || preview.errors.length > 0 || !preview.products.length}
              onClick={() => apply.run(() => applyImportAction(csv), { onSuccess: () => setDone(true) })}
            >
              {apply.pending ? "Import…" : `Importer ${preview.products.length} produit(s) en brouillon`}
            </button>
          )}
          <div className="mt-3">
            <ActionFeedback failure={apply.failure} success={apply.success} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
