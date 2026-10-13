import { openDb, type Db } from "@/server/db/client";
import { ensureBaseSettings } from "@/server/domain/settings";
import { seedDemo } from "@/server/demo/seed";

export async function demoDb(now = new Date()) {
  const db = await openDb({ memory: true });
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
  }>("select id, on_hand, reserved, price from variants where sku = $1", [
    sku,
  ]))!;
}

export async function userByRole(db: Db, role: string) {
  return (await db.one<{
    id: string;
    name: string;
    role: "owner" | "manager" | "seller";
    email: string;
    active: boolean;
    is_demo: boolean;
  }>(
    "select id, name, role, email, active, is_demo from users where role = $1 limit 1",
    [role],
  ))!;
}
