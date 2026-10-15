"use server";

import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { convertRequest, dismissRequest, reopenRequest } from "@/server/domain/requests";

export async function convertRequestAction(id: string) {
  return guarded("orders.create", ({ db, user }) => convertRequest(db, user, String(id), { isDemo: isDemoMode() }), {
    message: "Commande créée, articles réservés.",
  });
}

export async function dismissRequestAction(id: string, reason: string) {
  return guarded(
    "orders.create",
    ({ db, user }) => dismissRequest(db, user, String(id), String(reason ?? "").slice(0, 300)),
    { message: "Demande classée sans suite." },
  );
}

export async function reopenRequestAction(id: string) {
  return guarded("orders.create", ({ db }) => reopenRequest(db, String(id)), { message: "Demande rouverte." });
}
