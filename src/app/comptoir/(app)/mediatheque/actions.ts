"use server";

import { guarded } from "@/server/admin";
import { listMedia, purgeMedia, restoreMedia, setMediaAlt, trashMedia } from "@/server/domain/media";

/** Photos et vidéos disponibles pour une fiche produit (sélecteur de la médiathèque). */
export async function pickableImagesAction() {
  return guarded("catalog.edit", async ({ db }) =>
    (await listMedia(db, { view: "all" })).map((m) => ({
      id: m.id,
      url: `/media/${m.id}`,
      name: m.name,
      alt: m.alt,
      used: m.used_by,
      kind: m.mime.startsWith("video/") ? ("video" as const) : ("image" as const),
    })),
  );
}

export async function trashMediaAction(id: string) {
  return guarded("catalog.edit", ({ db }) => trashMedia(db, String(id)), { message: "Fichier mis à la corbeille." });
}

export async function restoreMediaAction(id: string) {
  return guarded("catalog.edit", ({ db }) => restoreMedia(db, String(id)), { message: "Fichier restauré." });
}

export async function purgeMediaAction(id: string) {
  return guarded("catalog.bulk", ({ db }) => purgeMedia(db, String(id)), {
    message: "Fichier supprimé définitivement.",
  });
}

export async function mediaAltAction(id: string, alt: string) {
  return guarded("catalog.edit", ({ db }) => setMediaAlt(db, String(id), String(alt ?? "")), {
    message: "Description enregistrée.",
  });
}
