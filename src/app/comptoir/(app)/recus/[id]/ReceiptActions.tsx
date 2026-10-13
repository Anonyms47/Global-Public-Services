"use client";

import { IconDownload, IconPrint } from "@/components/ui/icons";

export function ReceiptActions({
  text,
  filename,
}: {
  text: string;
  filename: string;
}) {
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-ink"
        onClick={() => window.print()}
      >
        <IconPrint size={18} /> Imprimer / PDF
      </button>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([text], { type: "text/plain;charset=utf-8" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        }}
      >
        <IconDownload size={18} /> Télécharger (.txt)
      </button>
    </div>
  );
}
