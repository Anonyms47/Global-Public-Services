import { cache } from "react";
import { connection } from "next/server";
import { getDb, isDemoMode } from "./db";
import { getSettings } from "./domain/settings";
import { hasDemoData } from "./demo/seed";

/** Base de données pour un rendu à la requête (jamais figé au build). */
export async function pageDb() {
  await connection();
  return getDb();
}

/** Contexte partagé par les pages publiques, calculé une fois par requête. */
export const siteContext = cache(async () => {
  const db = await pageDb();
  const [settings, demoData] = await Promise.all([getSettings(db), hasDemoData(db)]);
  const demo = isDemoMode() || demoData;
  return {
    db,
    settings,
    /** Catalogue ou données d'exemple visibles : bandeau, pas d'indexation. */
    demo,
    /** Indexation autorisée seulement sans données d'exemple et sur décision explicite. */
    indexable: !demo && process.env.SITE_INDEXABLE === "true",
    whatsappReady: settings.company.whatsapp.replace(/\D/g, "").length >= 8,
  };
});

export function siteUrl(path = "") {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
