"use client";

import { IconDownload, IconPrint } from "@/components/ui/icons";

export function ReceiptActions({ pdfHref }: { pdfHref: string }) {
  return (
    <div className="no-print flex flex-wrap gap-2">
      <a href={pdfHref} download className="btn btn-ink">
        <IconDownload size={18} /> Télécharger le PDF
      </a>
      <button type="button" className="btn btn-outline" onClick={() => window.print()}>
        <IconPrint size={18} /> Imprimer
      </button>
    </div>
  );
}
