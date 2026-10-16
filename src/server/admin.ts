import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { connection } from "next/server";
import { getDb, isDemoMode, isDemoProtected } from "./db";
import { userFromToken, assertCan, hasRealOwner, type User } from "./domain/auth";
import { AppError } from "./domain/errors";
import type { Db } from "./db/client";
import { can, type Permission } from "@/lib/permissions";
import type { ActionResult } from "@/lib/action-result";

export const SESSION_COOKIE = "gps_comptoir";

/**
 * Politique des comptes de démonstration pour cette requête :
 * - hors mode démonstration : refusés ;
 * - démonstration protégée (production) : bridés, puis refusés dès qu'un
 *   propriétaire réel existe ;
 * - en local : libres.
 */
export const demoAccess = cache(async (db: Db) => {
  if (!isDemoMode()) return { allowDemo: false, restricted: false };
  if (!isDemoProtected()) return { allowDemo: true, restricted: false };
  return { allowDemo: !(await hasRealOwner(db)), restricted: true };
});

export const currentUser = cache(async (): Promise<User | null> => {
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const access = await demoAccess(db);
  const user = await userFromToken(db, token, { allowDemo: access.allowDemo });
  return user && user.is_demo && access.restricted ? { ...user, restricted: true } : user;
});

/** Pour les pages : redirige vers la connexion, ou signale les droits insuffisants. */
export async function requirePage(permission?: Permission) {
  const user = await currentUser();
  if (!user) redirect("/comptoir/connexion");
  // Mot de passe provisoire : aucune page avant de l'avoir changé.
  if (user.must_change_password) redirect("/comptoir/mon-compte?provisoire=1");
  const db = await getDb();
  return { db, user, allowed: permission ? can(user, permission) : true };
}

/**
 * Enveloppe des actions serveur du Comptoir : session et droits vérifiés
 * côté serveur à chaque appel, erreurs métier renvoyées proprement,
 * pages rafraîchies après succès.
 */
export async function guarded<T>(
  permission: Permission,
  fn: (ctx: { db: Db; user: User }) => Promise<T>,
  opts: { message?: string; allowTemporary?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const user = await currentUser();
    assertCan(user, permission);
    if (user.must_change_password && !opts.allowTemporary) {
      throw new AppError("forbidden", "Changez d'abord votre mot de passe provisoire (Mon compte).");
    }
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

/** Adresse IP (première de X-Forwarded-For, fournie par l'hébergeur) et navigateur, pour la limitation des connexions. */
export function requestOrigin(h: Headers) {
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 64);
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 200) };
}

/** Configuration du serveur, sans aucun secret. */
export function serverEnv() {
  return {
    demoMode: isDemoMode(),
    indexable: process.env.SITE_INDEXABLE === "true",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    protectedDemo: isDemoProtected(),
    postgres: !!process.env.DATABASE_URL,
    region: process.env.VERCEL_REGION ?? "",
  };
}
