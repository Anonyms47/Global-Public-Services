import { openDb, type Db } from "./client";
import { ensureBaseSettings } from "../domain/settings";
import { seedDemo } from "../demo/seed";

export type { Db };

/** Mode démonstration : données d'exemple et comptes de démonstration autorisés. */
export function isDemoMode() {
  if (process.env.DEMO_MODE) return process.env.DEMO_MODE === "true";
  return !process.env.DATABASE_URL;
}

const g = globalThis as unknown as { __gpsDb?: Promise<Db> };

async function init(): Promise<Db> {
  const db = await openDb({
    url: process.env.DATABASE_URL,
    dataDir: process.env.PGLITE_DIR ?? ".data/pglite",
  });
  await ensureBaseSettings(db);
  if (isDemoMode()) await seedDemo(db, { onlyIfEmpty: true });
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
