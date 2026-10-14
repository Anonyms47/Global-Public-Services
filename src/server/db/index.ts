import { openDb, type Db } from "./client";
import { ensureBaseSettings } from "../domain/settings";
import { refreshDemoImages, seedDemo } from "../demo/seed";

export type { Db };

/** Mode démonstration : données d'exemple et comptes de démonstration autorisés. */
export function isDemoMode() {
  if (process.env.DEMO_MODE) return process.env.DEMO_MODE === "true";
  return !process.env.DATABASE_URL;
}

const g = globalThis as unknown as { __gpsDb?: Promise<Db> };

async function init(): Promise<Db> {
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL manquante : renseignez l'adresse PostgreSQL dans Vercel (voir docs/mise-en-ligne.md).",
    );
  }
  const db = await openDb({
    url: process.env.DATABASE_URL,
    dataDir: process.env.PGLITE_DIR ?? ".data/pglite",
  });
  // Plusieurs instances peuvent démarrer ensemble (serverless) : l'initialisation
  // se fait dans une transaction sous verrou, une seule à la fois, tout ou rien.
  await db.tx(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(4747000)");
    await ensureBaseSettings(tx);
    if (isDemoMode()) {
      await seedDemo(tx, { onlyIfEmpty: true });
      await refreshDemoImages(tx);
    }
  });
  return db;
}

/** Connexion partagée (une par processus). */
export function getDb(): Promise<Db> {
  if (!g.__gpsDb) {
    g.__gpsDb = init().catch((error) => {
      g.__gpsDb = undefined;
      throw error;
    });
  }
  return g.__gpsDb;
}
