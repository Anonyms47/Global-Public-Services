import { openDb, type Db } from "@/server/db/client";
import { ensureBaseSettings } from "@/server/domain/settings";
import { seedDemo } from "@/server/demo/seed";

/**
 * Base de test : PGlite en mémoire par défaut, ou un vrai PostgreSQL si
 * TEST_DATABASE_URL est défini (schéma public réinitialisé à chaque fois).
 */
export async function demoDb(now = new Date()) {
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const { Client } = await import("pg");
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query("drop schema public cascade; create schema public;");
    await c.end();
  }
  const db = await openDb(url ? { url } : { memory: true });
  await ensureBaseSettings(db);
  await seedDemo(db, { now });
  return db;
}

export async function variantBySku(db: Db, sku: string) {
  return (await db.one<{
    id: string;
    on_hand: number;
    reserved: number;
    price: number;
  }>("select id, on_hand, reserved, price from variants where sku = $1", [sku]))!;
}

export async function userByRole(db: Db, role: string) {
  return (await db.one<{
    id: string;
    name: string;
    role: "owner" | "manager" | "seller";
    email: string;
    active: boolean;
    is_demo: boolean;
  }>("select id, name, role, email, active, is_demo from users where role = $1 limit 1", [role]))!;
}
