import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Appel d'une tâche planifiée Vercel : l'en-tête `Authorization: Bearer <CRON_SECRET>` est ajouté par Vercel
 * quand la variable CRON_SECRET existe. Sans secret configuré, tout appel est refusé.
 */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined) {
  if (!secret || secret.length < 16 || !authorization) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
