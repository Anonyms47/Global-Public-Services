import { currentUser } from "@/server/admin";
import { importTemplate } from "@/server/domain/import";
import { can } from "@/lib/permissions";

/** Modèle CSV d'import du catalogue (séparateur « ; », encodage UTF-8 avec BOM pour Excel). */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Session expirée", { status: 401 });
  if (!can(user, "catalog.bulk")) return new Response("Droits insuffisants", { status: 403 });
  return new Response(`﻿${importTemplate()}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele-import-catalogue-gps.csv"',
    },
  });
}
