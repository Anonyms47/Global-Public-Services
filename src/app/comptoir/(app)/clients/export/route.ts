import { currentUser } from "@/server/admin";
import { getDb } from "@/server/db";
import { allCustomersForExport } from "@/server/domain/customers";
import { can } from "@/lib/permissions";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // Neutralise les formules dans les tableurs (=, +, -, @).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Export CSV des clients : réservé au propriétaire, vérifié côté serveur. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Session expirée", { status: 401 });
  if (!can(user, "customers.export")) return new Response("Droits insuffisants", { status: 403 });
  const rows = await allCustomersForExport(await getDb());
  const header = ["Nom", "Téléphone", "E-mail", "Adresse", "Commandes", "Créé le", "Exemple"];
  const csv = [
    header.map(cell).join(";"),
    ...rows.map((r) =>
      [
        r.name,
        r.phone,
        r.email,
        r.address,
        r.order_count,
        new Date(r.created_at).toISOString().slice(0, 10),
        r.is_demo ? "oui" : "",
      ]
        .map(cell)
        .join(";"),
    ),
  ].join("\r\n");
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-gps-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
