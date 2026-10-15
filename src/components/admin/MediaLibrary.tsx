"use client";

import Image from "next/image";
import { useState } from "react";
import {
  mediaAltAction,
  pickableImagesAction,
  purgeMediaAction,
  restoreMediaAction,
  trashMediaAction,
  uploadMediaAction,
} from "@/app/comptoir/(app)/mediatheque/actions";
import { ActionFeedback, useAction } from "./useAction";
import { Badge } from "./ui";
import { Sheet } from "../ui/Sheet";
import { IconCopy, IconUpload } from "../ui/icons";

export interface MediaItem {
  id: string;
  mime: string;
  name: string;
  size: number;
  alt: string;
  createdAt: string;
  uploader: string | null;
  usedBy: number;
  products: string[];
  trashed: boolean;
}

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

/** Envoi multiple : un fichier à la fois, progression et erreurs par fichier. */
export function MediaUploader() {
  const a = useAction();
  const [queue, setQueue] = useState<{ name: string; state: "wait" | "ok" | "error"; error?: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const send = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setQueue(list.map((f) => ({ name: f.name, state: "wait" })));
    for (const [i, file] of list.entries()) {
      const fd = new FormData();
      fd.append("file", file);
      let res: { ok: boolean; error?: string } = { ok: false, error: "Envoi impossible (connexion ou taille)." };
      try {
        res = (await uploadMediaAction(fd)) as typeof res;
      } catch {}
      setQueue((q) => q.map((x, j) => (j === i ? { ...x, state: res.ok ? "ok" : "error", error: res.error } : x)));
    }
    a.run(async () => ({ ok: true as const, data: null }), { successMessage: "Envoi terminé." });
  };
  return (
    <div>
      <label
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void send(e.dataTransfer.files);
        }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed p-6 text-center focus-within:border-gps-blue hover:border-gps-blue ${drag ? "border-gps-blue bg-gps-blue-soft" : "border-line bg-white"}`}
      >
        <IconUpload />
        <span className="font-bold">Déposez vos fichiers ici ou touchez pour choisir</span>
        <span className="text-[13px] text-ink-mute">
          Photos JPEG, PNG, WebP · vidéos courtes MP4, WebM · 3 Mo maximum par fichier · plusieurs fichiers à la fois
        </span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          className="sr-only"
          onChange={(e) => (void send(e.target.files), (e.target.value = ""))}
        />
      </label>
      {queue.length ? (
        <ul className="mt-3 grid gap-1 text-[14px]" aria-live="polite">
          {queue.map((q, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2">
              <span className="truncate">{q.name}</span>
              <span
                className={
                  q.state === "ok"
                    ? "font-semibold text-wa-ink"
                    : q.state === "error"
                      ? "text-gps-red-ink"
                      : "text-ink-mute"
                }
              >
                {q.state === "ok" ? "Envoyé" : q.state === "error" ? q.error : "En attente…"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2">
        <ActionFeedback failure={a.failure} success={a.success} />
      </div>
    </div>
  );
}

function MediaCard({ m, canEdit, canPurge }: { m: MediaItem; canEdit: boolean; canPurge: boolean }) {
  const a = useAction();
  const [alt, setAlt] = useState(m.alt);
  const url = `/media/${m.id}`;
  const video = m.mime.startsWith("video/");
  return (
    <li className="flex flex-col overflow-hidden rounded-[6px] border border-line bg-card">
      <div className="relative aspect-square bg-paper-deep">
        {m.trashed ? (
          <span className="flex h-full items-center justify-center text-[13px] text-ink-mute">Aperçu masqué</span>
        ) : video ? (
          <video src={url} className="h-full w-full object-cover" muted controls preload="metadata" />
        ) : (
          <Image src={url} alt={m.alt || m.name} fill sizes="240px" className="object-cover" unoptimized />
        )}
      </div>
      <div className="grid gap-2 p-3 text-[13px]">
        <p className="truncate font-semibold" title={m.name}>
          {m.name || "Sans nom"}
        </p>
        <p className="flex flex-wrap gap-1 text-ink-mute">
          <Badge>{video ? "Vidéo" : "Photo"}</Badge>
          <span>{kb(m.size)}</span>
          {m.usedBy ? <Badge tone="green">{m.products.slice(0, 2).join(", ")}</Badge> : <Badge>Non utilisé</Badge>}
        </p>
        {canEdit && !m.trashed && !video ? (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              a.run(() => mediaAltAction(m.id, alt));
            }}
          >
            <label className="sr-only" htmlFor={`alt-${m.id}`}>
              Description de la photo
            </label>
            <input
              id={`alt-${m.id}`}
              className="field h-9 min-h-9 py-0 text-[13px]"
              value={alt}
              placeholder="Description (accessibilité)"
              onChange={(e) => setAlt(e.target.value)}
            />
            <button className="btn btn-ghost btn-sm" disabled={a.pending}>
              OK
            </button>
          </form>
        ) : null}
        <div className="flex flex-wrap gap-1">
          {!m.trashed ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigator.clipboard?.writeText(new URL(url, window.location.origin).toString())}
            >
              <IconCopy size={14} /> Lien
            </button>
          ) : null}
          {canEdit && !m.trashed ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-gps-red-ink"
              disabled={a.pending || m.usedBy > 0}
              title={m.usedBy ? "Utilisé par une fiche produit" : undefined}
              onClick={() => a.run(() => trashMediaAction(m.id))}
            >
              Corbeille
            </button>
          ) : null}
          {canEdit && m.trashed ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={a.pending}
              onClick={() => a.run(() => restoreMediaAction(m.id))}
            >
              Restaurer
            </button>
          ) : null}
          {canPurge && m.trashed ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm text-gps-red-ink"
              disabled={a.pending}
              onClick={() => {
                if (confirm("Supprimer définitivement ce fichier ?")) a.run(() => purgeMediaAction(m.id));
              }}
            >
              Supprimer
            </button>
          ) : null}
        </div>
        <ActionFeedback failure={a.failure} />
      </div>
    </li>
  );
}

export function MediaGrid({ items, canEdit, canPurge }: { items: MediaItem[]; canEdit: boolean; canPurge: boolean }) {
  if (!items.length) return <p className="text-ink-mute">Aucun fichier dans cette vue.</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((m) => (
        <MediaCard key={m.id} m={m} canEdit={canEdit} canPurge={canPurge} />
      ))}
    </ul>
  );
}

/** Sélecteur de photos de la médiathèque, pour la fiche produit. */
export function MediaPicker({ onPick }: { onPick: (img: { url: string; alt: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; url: string; name: string; alt: string; used: number }[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setOpen(true);
    const r = await pickableImagesAction().catch(() => null);
    if (r?.ok) setItems(r.data);
    else setError(r && !r.ok ? r.error : "Chargement impossible.");
  };
  return (
    <>
      <button type="button" className="btn btn-outline btn-sm mt-2" onClick={load}>
        Choisir dans la médiathèque
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Médiathèque" side="right">
        {error ? <p className="text-gps-red-ink">{error}</p> : null}
        {!items ? <p className="text-ink-mute">Chargement…</p> : null}
        {items && !items.length ? <p className="text-ink-mute">Aucune photo dans la médiathèque.</p> : null}
        <ul className="grid grid-cols-2 gap-2">
          {items?.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="block w-full overflow-hidden rounded-[6px] border border-line text-left hover:border-gps-blue"
                onClick={() => {
                  onPick({ url: m.url, alt: m.alt });
                  setOpen(false);
                }}
              >
                <span className="relative block aspect-square">
                  <Image src={m.url} alt={m.alt || m.name} fill sizes="200px" className="object-cover" unoptimized />
                </span>
                <span className="block truncate p-1.5 text-[12px]">
                  {m.name || "Photo"} {m.used ? "· utilisée" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
