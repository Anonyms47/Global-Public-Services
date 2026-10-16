"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { applyImport, previewImport, type ImportMapping } from "@/server/domain/import";
import { can } from "@/lib/permissions";

const MAX_CHARS = 1_000_000;

function text(input: unknown) {
  const s = String(input ?? "");
  if (s.length > MAX_CHARS) throw new AppError("validation", "Fichier trop volumineux (1 Mo de texte au maximum).");
  return s;
}

const mappingSchema = z.record(z.string(), z.number().int().min(0).max(200).nullable()).optional();
const mapping = (m: unknown) => mappingSchema.parse(m ?? undefined) as ImportMapping | undefined;

export async function previewImportAction(csv: string, columns?: unknown) {
  return guarded("catalog.bulk", ({ db }) => previewImport(db, text(csv), mapping(columns)));
}

export async function applyImportAction(csv: string, opts?: { mapping?: unknown; partial?: boolean }) {
  return guarded(
    "catalog.bulk",
    ({ db, user }) =>
      applyImport(
        db,
        text(csv),
        { userId: user.id, withCosts: can(user, "catalog.costs"), isDemo: isDemoMode() },
        { mapping: mapping(opts?.mapping), partial: !!opts?.partial },
      ),
    { message: "Import terminé : les produits sont en brouillon, ajoutez-leur des photos avant de publier." },
  );
}

/**
 * Import du catalogue réel de la boutique (manifeste versionné) : propriétaire
 * seulement, confirmation tapée, tout en brouillon, sans doublon si relancé.
 */
export async function applyGpsImportAction(confirmation: string, only?: string[]) {
  return guarded("catalog.import", async ({ db, user }) => {
    if (
      String(confirmation ?? "")
        .trim()
        .toUpperCase() !== "IMPORTER"
    ) {
      throw new AppError("validation", "Tapez « IMPORTER » pour confirmer.", {
        confirmation: "Confirmation incorrecte.",
      });
    }
    const keys = z.array(z.string().max(80)).max(200).optional().parse(only);
    const { applyGpsImport } = await import("@/server/domain/catalog-import-gps");
    return applyGpsImport(db, { id: user.is_demo ? null : user.id }, { only: keys });
  });
}
