import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db/client";
import { createOrder, getOrder } from "@/server/domain/orders";
import { ensurePayToken } from "@/server/domain/payment-link";
import { handleWaveEvent, startWavePayment, verifyWaveSignature } from "@/server/domain/wave-checkout";
import { demoDb, userByRole, variantBySku } from "./helpers";

const SECRET = "wave_sn_WHS_test";
const sign = (body: string, t: number) =>
  `t=${t},v1=${createHmac("sha256", SECRET).update(`${t}${body}`).digest("hex")}`;

let db: Db;
let manager: { id: string; name: string };
beforeAll(async () => {
  db = await demoDb();
  manager = await userByRole(db, "manager");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function newOrder() {
  const v = await variantBySku(db, "SON-ST2-NO");
  const o = await createOrder(db, manager, {
    idempotencyKey: crypto.randomUUID(),
    channel: "whatsapp",
    reception: "pickup",
    customerName: "Test",
    customerPhone: "000",
    lines: [{ variantId: v.id, quantity: 1 }],
  });
  const full = (await getOrder(db, o.id))!;
  return { id: o.id, balance: full.balance, token: await ensurePayToken(db, manager, o.id) };
}
async function session(orderId: string, amount: number, id: string) {
  await db.query(
    "insert into wave_sessions (id, order_id, amount, launch_url) values ($1,$2,$3,'https://pay.wave.com/c/x')",
    [id, orderId, amount],
  );
}
const waveReturns = (s: Record<string, unknown>) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(s), { status: 200 })),
  );

describe("Wave automatique", () => {
  it("signature : valide, falsifiée, périmée, plusieurs v1", () => {
    const body = '{"id":"AE_1"}';
    const now = Date.now();
    const t = Math.floor(now / 1000);
    expect(verifyWaveSignature(body, sign(body, t), SECRET, now)).toBe(true);
    expect(verifyWaveSignature(body + " ", sign(body, t), SECRET, now)).toBe(false);
    expect(verifyWaveSignature(body, sign(body, t), "autre", now)).toBe(false);
    expect(verifyWaveSignature(body, sign(body, t - 600), SECRET, now)).toBe(false);
    expect(verifyWaveSignature(body, `${sign(body, t)},v1=abcd`, SECRET, now)).toBe(true);
    expect(verifyWaveSignature(body, null, SECRET, now)).toBe(false);
    expect(verifyWaveSignature(body, "n'importe quoi", SECRET, now)).toBe(false);
  });

  it("session créée pour le reste à payer puis réutilisée ; sans clé, refus", async () => {
    const o = await newOrder();
    await expect(startWavePayment(db, o.token)).rejects.toThrow(/pas activé/);
    vi.stubEnv("WAVE_API_KEY", "k");
    vi.stubEnv("WAVE_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.example.com");
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "cos-A1",
            wave_launch_url: "https://pay.wave.com/c/cos-A1",
            when_expires: new Date(Date.now() + 1_800_000).toISOString(),
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", f);
    expect(await startWavePayment(db, o.token)).toBe("https://pay.wave.com/c/cos-A1");
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent).toMatchObject({
      amount: String(o.balance),
      currency: "XOF",
      success_url: `https://www.example.com/paiement/${o.token}?retour=succes`,
    });
    expect(await startWavePayment(db, o.token)).toBe("https://pay.wave.com/c/cos-A1");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("paiement enregistré une seule fois, après relecture auprès de Wave", async () => {
    vi.stubEnv("WAVE_API_KEY", "k");
    const o = await newOrder();
    await session(o.id, o.balance, "cos-B1");
    waveReturns({
      id: "cos-B1",
      amount: String(o.balance),
      currency: "XOF",
      checkout_status: "complete",
      payment_status: "succeeded",
      transaction_id: "TX1",
    });
    const ev = { id: "EV_1", type: "checkout.session.completed", data: { id: "cos-B1" } };
    expect(await handleWaveEvent(db, ev)).toBe("recorded");
    expect(await handleWaveEvent(db, ev)).toBe("duplicate");
    const d = (await getOrder(db, o.id))!;
    expect(d.payments).toHaveLength(1);
    expect(d.payments[0]).toMatchObject({ method: "wave", amount: o.balance });
    expect(d.payment).toBe("paid");
    // Autre notification pour la même session : aucun second paiement.
    expect(await handleWaveEvent(db, { ...ev, id: "EV_2" })).toBe("ignored");
    expect((await getOrder(db, o.id))!.payments).toHaveLength(1);
  });

  it("montant ou état non concordant : rien d'enregistré, à vérifier ; échec réseau : relance possible", async () => {
    vi.stubEnv("WAVE_API_KEY", "k");
    const o = await newOrder();
    await session(o.id, o.balance, "cos-C1");
    waveReturns({
      id: "cos-C1",
      amount: "1",
      currency: "XOF",
      checkout_status: "complete",
      payment_status: "succeeded",
    });
    expect(await handleWaveEvent(db, { id: "EV_3", type: "checkout.session.completed", data: { id: "cos-C1" } })).toBe(
      "to_review",
    );
    expect((await getOrder(db, o.id))!.payments).toHaveLength(0);

    const o2 = await newOrder();
    await session(o2.id, o2.balance, "cos-D1");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oups", { status: 500 })),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      handleWaveEvent(db, { id: "EV_4", type: "checkout.session.completed", data: { id: "cos-D1" } }),
    ).rejects.toThrow();
    spy.mockRestore();
    waveReturns({
      id: "cos-D1",
      amount: String(o2.balance),
      currency: "XOF",
      checkout_status: "complete",
      payment_status: "succeeded",
    });
    expect(await handleWaveEvent(db, { id: "EV_4", type: "checkout.session.completed", data: { id: "cos-D1" } })).toBe(
      "recorded",
    );
    // Session inconnue : ignorée.
    expect(await handleWaveEvent(db, { id: "EV_5", type: "checkout.session.completed", data: { id: "cos-ZZ" } })).toBe(
      "ignored",
    );
  });
});
