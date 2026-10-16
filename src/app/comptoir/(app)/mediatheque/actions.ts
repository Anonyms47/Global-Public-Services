"use server";

import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import {
  MEDIA_MAX_BYTES,
  listMedia,
  purgeMedia,
  restoreMedia,
  setMediaAlt,
  storeMedia,
  trashMedia,
} from "@/server/domain/media";

export async function uploadMediaAction(formData: FormData) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("validation", "Aucun fichier reçu.");
    if (file.size > MEDIA_MAX_BYTES) throw new AppError("validation", "Fichier trop lourd (3 Mo maximum).");
    return storeMedia(db, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      userId: user.id,
      isDemo: isDemoMode(),
    });
  });
}

/** Photos disponibles pour une fiche produit (sélecteur de la médiathèque). */
export async function pickableImagesAction() {
  return guarded("catalog.edit", async ({ db }) =>
    (await listMedia(db, { view: "all" }))
      .filter((m) => m.mime.startsWith("image/"))
      .map((m) => ({ id: m.id, url: `/media/${m.id}`, name: m.name, alt: m.alt, used: m.used_by })),
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
