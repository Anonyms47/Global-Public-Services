"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addProductPhotoAction } from "@/app/comptoir/(app)/catalogue/actions";
import { IconImage } from "@/components/ui/icons";
import { UploadList, useUploadQueue } from "./UploadQueue";

/**
 * Photo prise directement depuis la liste : le téléphone ouvre l'appareil photo,
 * la photo est réduite, envoyée puis ajoutée à la fiche. Sur ordinateur, le même
 * bouton ouvre le choix de fichier.
 */
export function QuickPhoto({ productId }: { productId: string }) {
  const router = useRouter();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const q = useUploadQueue({
    photosOnly: true,
    onUploaded: async (u) => {
      const r = await addProductPhotoAction(productId, u.id).catch(() => null);
      if (r?.ok) {
        setNote({ ok: true, text: r.data.message });
        router.refresh();
      } else setNote({ ok: false, text: r && !r.ok ? r.error : "Ajout impossible : réessayez." });
    },
  });
  return (
    <div className="grid w-full gap-1">
      <label className="btn btn-outline btn-sm w-fit cursor-pointer focus-within:outline-3 focus-within:outline-gps-blue">
        <IconImage size={16} /> Photographier
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          data-testid="quick-photo"
          onChange={(e) => {
            setNote(null);
            q.add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <UploadList items={q.items} retry={q.retry} dismiss={q.dismiss} />
      {note ? (
        <p role="status" className={`text-[13px] font-semibold ${note.ok ? "text-wa-ink" : "text-gps-red-ink"}`}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
