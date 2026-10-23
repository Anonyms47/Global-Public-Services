"use client";

import { useState } from "react";
import { IconDownload, IconPrint } from "@/components/ui/icons";

export function ReceiptActions({ pdfHref, filename }: { pdfHref: string; filename: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sur téléphone, un lien vers un PDF l'affiche sans l'enregistrer : on passe
   * par le menu de partage (Enregistrer dans Fichiers, WhatsApp…). Ailleurs,
   * le fichier est téléchargé directement.
   */
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(pdfHref, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], filename, { type: "application/pdf" });
      const mobile = window.matchMedia("(pointer: coarse)").matches;
      if (mobile && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (e) {
          if ((e as DOMException).name === "AbortError") return;
          // Partage refusé par le navigateur : téléchargement classique.
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Le reçu n'a pas pu être préparé. Vérifiez la connexion puis réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print grid gap-2">
      <div className="flex flex-wrap gap-2">
        <a
          href={pdfHref}
          download={filename}
          className="btn btn-ink"
          aria-busy={busy}
          onClick={(e) => {
            e.preventDefault();
            if (!busy) void download();
          }}
        >
          <IconDownload size={18} /> {busy ? "Préparation…" : "Télécharger le PDF"}
        </a>
        <button type="button" className="btn btn-outline" onClick={() => window.print()}>
          <IconPrint size={18} /> Imprimer
        </button>
      </div>
      {error ? (
        <p role="alert" className="error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
