import { describe, expect, it } from "vitest";
import { demoDb, variantBySku, userByRole } from "./helpers";
import { createRequest, convertRequest, getRequest, purgeExpiredRequests } from "@/server/domain/requests";

describe("conservation des demandes : 48 h maximum", () => {
  it("supprime les demandes non transformées après 48 h, garde les récentes et les converties", async () => {
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
    const old = await createRequest(db, input);
    const recent = await createRequest(db, input);
    const converted = await createRequest(db, input);
    await convertRequest(db, owner, converted.id, { isDemo: true });
    // Les demandes de démonstration ne sont jamais purgées : on les marque comme réelles pour ce test.
    await db.query("update order_requests set is_demo = false where id in ($1,$2,$3)", [
      old.id,
      recent.id,
      converted.id,
    ]);
    await db.query("update order_requests set created_at = now() - interval '49 hours' where id in ($1,$2)", [
      old.id,
      converted.id,
    ]);
    const n = await purgeExpiredRequests(db);
    expect(n).toBe(1);
    expect(await getRequest(db, old.id)).toBeFalsy();
    expect((await getRequest(db, recent.id))?.status).toBe("new");
    expect((await getRequest(db, converted.id))?.status).toBe("converted");
    const log = await db.query("select detail from audit_log where action = 'requests_purged'");
    expect(JSON.stringify(log)).not.toMatch(/Purge|000 11/);
  });
});
