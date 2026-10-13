import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { getDb, isDemoMode } from "./db";
import { userFromToken, assertCan, type User } from "./domain/auth";
import { AppError } from "./domain/errors";
import type { Db } from "./db/client";
import { can, type Permission } from "@/lib/permissions";
import type { ActionResult } from "@/lib/action-result";

export const SESSION_COOKIE = "gps_comptoir";

export const currentUser = cache(async (): Promise<User | null> => {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userFromToken(await getDb(), token, { allowDemo: isDemoMode() });
});

/** Pour les pages : redirige vers la connexion, ou signale les droits insuffisants. */
export async function requirePage(permission?: Permission) {
  const user = await currentUser();
  if (!user) redirect("/comptoir/connexion");
  const db = await getDb();
  return { db, user, allowed: permission ? can(user.role, permission) : true };
}

/**
 * Enveloppe des actions serveur du Comptoir : session et droits vérifiés
 * côté serveur à chaque appel, erreurs métier renvoyées proprement,
 * pages rafraîchies après succès.
 */
export async function guarded<T>(
  permission: Permission,
  fn: (ctx: { db: Db; user: User }) => Promise<T>,
  opts: { message?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const user = await currentUser();
    assertCan(user, permission);
    const db = await getDb();
    const data = await fn({ db, user });
    revalidatePath("/", "layout");
    return { ok: true, data, message: opts.message };
  } catch (error) {
    if (error instanceof AppError) {
      return {
        ok: false,
        code: error.code,
        error: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error && typeof error === "object" && "digest" in error) throw error; // redirect / notFound
    console.error(error);
    const msg =
      error instanceof Error && /duplicate key|unique/i.test(error.message)
        ? "Cette valeur existe déjà (référence ou identifiant en double)."
        : "L'enregistrement a échoué. Votre saisie est conservée : réessayez dans un instant.";
    return { ok: false, code: "internal", error: msg };
  }
}
