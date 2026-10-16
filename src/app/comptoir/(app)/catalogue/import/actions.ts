"use server";

import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { applyImport, previewImport } from "@/server/domain/import";
import { can } from "@/lib/permissions";

const MAX_CHARS = 1_000_000;

function text(input: unknown) {
  const s = String(input ?? "");
  if (s.length > MAX_CHARS) throw new AppError("validation", "Fichier trop volumineux (1 Mo de texte au maximum).");
  return s;
}

export async function previewImportAction(csv: string) {
  return guarded("catalog.bulk", ({ db }) => previewImport(db, text(csv)));
}

export async function applyImportAction(csv: string) {
  return guarded(
    "catalog.bulk",
    ({ db, user }) =>
      applyImport(db, text(csv), { userId: user.id, withCosts: can(user, "catalog.costs"), isDemo: isDemoMode() }),
    { message: "Import terminé : les produits sont en brouillon, ajoutez-leur des photos avant de publier." },
  );
}
