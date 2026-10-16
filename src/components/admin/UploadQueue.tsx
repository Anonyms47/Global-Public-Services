"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { optimizePhoto, precheck, uploadFile } from "@/lib/upload";

export type UploadStatus = "wait" | "optimize" | "send" | "done" | "error";
export interface UploadItem {
  key: string;
  name: string;
  status: UploadStatus;
  progress: number;
  originalSize: number;
  size: number;
  error?: string;
  file: File;
}
export interface Uploaded {
  id: string;
  url: string;
  mime: string;
  name: string;
}

const kb = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

/**
 * File d'envoi : chaque fichier est réduit (photos), envoyé avec sa propre
 * progression, et peut être renvoyé en cas d'erreur sans refaire les autres.
 */
export function useUploadQueue(opts: { photosOnly?: boolean; onUploaded: (u: Uploaded) => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(false);
  const pending = useRef<UploadItem[]>([]);
  const cb = useRef(opts);
  useEffect(() => {
    cb.current = opts;
  });

  const patch = (key: string, p: Partial<UploadItem>) =>
    setItems((list) => list.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (pending.current.length) {
      const item = pending.current.shift()!;
      patch(item.key, { status: "optimize", progress: 0, error: undefined });
      const file = await optimizePhoto(item.file);
      const problem = precheck(file, !!cb.current.photosOnly);
      if (problem) {
        patch(item.key, { status: "error", error: problem, size: file.size });
        continue;
      }
      patch(item.key, { status: "send", size: file.size });
      const r = await uploadFile(file, {
        photosOnly: cb.current.photosOnly,
        onProgress: (p) => patch(item.key, { progress: p }),
      });
      if (r.ok) {
        patch(item.key, { status: "done", progress: 1 });
        cb.current.onUploaded({ ...r.data, name: item.name });
      } else patch(item.key, { status: "error", error: r.error });
    }
    running.current = false;
  }, []);

  const add = (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).map((file) => ({
      key: crypto.randomUUID(),
      name: file.name,
      status: "wait" as const,
      progress: 0,
      originalSize: file.size,
      size: file.size,
      file,
    }));
    if (!list.length) return;
    setItems((x) => [...x.filter((i) => i.status !== "done"), ...list]);
    pending.current.push(...list);
    void pump();
  };
  const retry = (key: string) => {
    const item = items.find((x) => x.key === key);
    if (!item) return;
    patch(key, { status: "wait", error: undefined, progress: 0 });
    pending.current.push(item);
    void pump();
  };
  const dismiss = (key: string) => setItems((x) => x.filter((i) => i.key !== key));
  const busy = items.some((i) => i.status === "wait" || i.status === "optimize" || i.status === "send");
  return { items, add, retry, dismiss, busy };
}

export function UploadList({
  items,
  retry,
  dismiss,
}: {
  items: UploadItem[];
  retry: (key: string) => void;
  dismiss: (key: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 grid gap-2" aria-label="Envois en cours">
      {items.map((it) => (
        <li key={it.key} className="rounded-[6px] border border-line bg-white p-2 text-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate font-semibold">{it.name}</span>
            <span
              className={
                it.status === "done"
                  ? "font-semibold text-wa-ink"
                  : it.status === "error"
                    ? "text-gps-red-ink"
                    : "text-ink-mute"
              }
              role={it.status === "error" ? "alert" : undefined}
            >
              {it.status === "wait"
                ? "En attente…"
                : it.status === "optimize"
                  ? "Réduction de la photo…"
                  : it.status === "send"
                    ? `Envoi ${Math.round(it.progress * 100)} %`
                    : it.status === "done"
                      ? "Envoyé"
                      : it.error}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-deep"
            role="progressbar"
            aria-label={`Progression de ${it.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(it.progress * 100)}
          >
            <div
              className={`h-full rounded-full transition-[width] ${it.status === "error" ? "bg-gps-red" : it.status === "done" ? "bg-wa" : "bg-gps-blue"}`}
              style={{
                width: `${it.status === "error" ? 100 : Math.max(it.status === "wait" ? 0 : 4, it.progress * 100)}%`,
              }}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-mute">
            <span>
              {it.size < it.originalSize ? `Optimisée : ${kb(it.originalSize)} → ${kb(it.size)}` : kb(it.size)}
            </span>
            {it.status === "error" ? (
              <span className="flex gap-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => retry(it.key)}>
                  Réessayer
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => dismiss(it.key)}>
                  Retirer
                </button>
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
