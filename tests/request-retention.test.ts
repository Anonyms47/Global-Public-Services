import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Db } from "@/server/db/client";
import { demoDb, variantBySku, userByRole } from "./helpers";
import { createRequest, convertRequest, getRequest, purgeExpiredRequests } from "@/server/domain/requests";
import { isAuthorizedCron } from "@/lib/cron-auth";

let current: Db;
const getDbMock = vi.fn(async () => current);
vi.mock("@/server/db", () => ({ getDb: () => getDbMock() }));

const SECRET = "secret-de-test-0123456789abcdef";
const call = async (headers: Record<string, string> = {}) => {
  const { GET } = await import("@/app/api/cron/purge-demandes/route");
  return GET(new Request("http://localhost/api/cron/purge-demandes", { headers }));
};

async function seed() {
  const db = await demoDb();
  const owner = await userByRole(db, "owner");
  const v = await variantBySku(db, "SON-ST2-NO");
  const input = {
    items: [{ variantId: v.id, quantity: 1, seenPrice: v.price }],
    name: "Cliente Purge",
    phone: "000 11 22 33",
    reception: "pickup" as const,
    deliveryFee: 0,
  };
  const make = async (hoursOld: number) => {
    const r = await createRequest(db, input);
    // Les demandes de démonstration ne sont jamais purgées : on les rend « réelles » pour ce test.
    await db.query(
      "update order_requests set is_demo = false, created_at = now() - ($2 || ' hours')::interval where id = $1",
      [r.id, String(hoursOld)],
    );
    return r;
  };
  return { db, owner, make };
}

const counts = (db: Db) =>
  db.one<{ o: number; c: number; p: number }>(
    "select (select count(*) from orders)::int o, (select count(*) from customers)::int c, (select count(*) from payments)::int p",
  );

describe("route de purge : authentification", () => {
  beforeEach(() => {
    getDbMock.mockClear();
    vi.unstubAllEnvs();
  });

  it("sans secret configuré, sans en-tête ou avec un mauvais secret : 401, base jamais ouverte, aucune écriture", async () => {
    const { db, make } = await seed();
    current = db;
    const old = await make(60);
    const before = await db.one<{ n: number }>("select count(*)::int n from audit_log");

    // Secret serveur absent : refus par défaut, même avec un en-tête plausible.
    vi.stubEnv("CRON_SECRET", "");
    expect((await call({ authorization: `Bearer ${SECRET}` })).status).toBe(401);
    expect((await call()).status).toBe(401);

    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer mauvais" })).status).toBe(401);
    expect((await call({ authorization: SECRET })).status).toBe(401);

    expect(getDbMock).not.toHaveBeenCalled();
    expect(await getRequest(db, old.id)).toBeTruthy();
    expect((await db.one<{ n: number }>("select count(*)::int n from audit_log"))?.n).toBe(before?.n);
  });

  it("appel autorisé : purge normale, réponse sans cache, exécution répétée cohérente", async () => {
    const { db, make } = await seed();
    current = db;
    vi.stubEnv("CRON_SECRET", SECRET);
    await make(60);
    const res = await call({ authorization: `Bearer ${SECRET}` });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toEqual({ purged: 1 });
    const again = await call({ authorization: `Bearer ${SECRET}` });
    expect(await again.json()).toEqual({ purged: 0 });
  });

  it("secret trop court ou comparaison : refusé", () => {
    expect(isAuthorizedCron("Bearer court", "court")).toBe(false);
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
});

describe("conservation des demandes : 48 h", () => {
  it("supprime les demandes expirées éligibles ; garde récentes et converties ; ne touche ni commandes, clients, paiements", async () => {
    const { db, owner, make } = await seed();
    const old = await make(49);
    const dismissedOld = await make(72);
    await db.query("update order_requests set status = 'dismissed' where id = $1", [dismissedOld.id]);
    const recent = await make(47);
    const converted = await make(60);
    await convertRequest(db, owner, converted.id, { isDemo: true });
    await db.query("update order_requests set created_at = now() - interval '60 hours' where id = $1", [converted.id]);
    const before = await counts(db);

    expect(await purgeExpiredRequests(db)).toBe(2);
    expect(await getRequest(db, old.id)).toBeFalsy();
    expect(await getRequest(db, dismissedOld.id)).toBeFalsy();
    expect((await getRequest(db, recent.id))?.status).toBe("new");
    expect((await getRequest(db, converted.id))?.status).toBe("converted");
    expect(await counts(db)).toEqual(before);

    // Exécution répétée : rien de plus à supprimer, même résultat.
    expect(await purgeExpiredRequests(db)).toBe(0);
    expect((await getRequest(db, recent.id))?.status).toBe("new");
  });

  it("conversion et purge : une demande supprimée ne peut plus être convertie, une convertie n'est jamais supprimée", async () => {
    const { db, owner, make } = await seed();
    const a = await make(60);
    const b = await make(60);
    // Conversion d'abord : la purge qui suit l'ignore, la commande reste liée.
    const order = await convertRequest(db, owner, a.id, { isDemo: true });
    await db.query("update order_requests set created_at = now() - interval '60 hours' where id = $1", [a.id]);
    expect(await purgeExpiredRequests(db)).toBe(1);
    expect((await getRequest(db, a.id))?.order_id).toBe(order.id);
    // Purge d'abord : la conversion échoue proprement, aucune commande orpheline.
    const orders = (await counts(db))?.o;
    await expect(convertRequest(db, owner, b.id, { isDemo: true })).rejects.toThrow();
    expect((await counts(db))?.o).toBe(orders);
  });

  it("le journal ne garde que des informations techniques, aucune donnée personnelle", async () => {
    const { db, make } = await seed();
    await make(60);
    await purgeExpiredRequests(db);
    const rows = await db.query<{ detail: unknown }>(
      "select detail from audit_log where action = 'requests_purged' order by created_at desc limit 1",
    );
    const text = JSON.stringify(rows);
    expect(text).toContain('"count":1');
    expect(text).not.toMatch(/Purge|000 11|GPS-R/);
  });
});
