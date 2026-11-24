import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db/client";
import { createOrder, getOrder, recordPayment } from "@/server/domain/orders";
import { declarePayment, ensurePayToken, payInfo, payViewByToken } from "@/server/domain/payment-link";
import { externalPayments } from "@/lib/payment-links";
import { demoDb, userByRole, variantBySku } from "./helpers";

let db: Db;
let manager: { id: string; name: string };

beforeAll(async () => {
  db = await demoDb();
  manager = await userByRole(db, "manager");
});

describe("Paiement à distance : déclaré puis vérifié", () => {
  it("les liens Wave et Orange Money sont exactement ceux de GPS, sans montant ajouté", () => {
    expect(externalPayments.wave.url).toBe("https://pay.wave.com/m/M_sn_FYzmkydjF1K-/c/sn/");
    expect(externalPayments.orange_money.url).toBe("https://sugu.orange-sonatel.com/mp/dmeNogywEehFTqIm7Com");
  });

  it("une déclaration du client ne crée jamais de paiement ; seul le Comptoir encaisse", async () => {
    const v = await variantBySku(db, "SON-ST2-NO");
    const o = await createOrder(db, manager, {
      idempotencyKey: crypto.randomUUID(),
      channel: "whatsapp",
      reception: "pickup",
      customerName: "Test",
      customerPhone: "000",
      lines: [{ variantId: v.id, quantity: 1 }],
    });
    const token = await ensurePayToken(db, manager, o.id);
    expect(await ensurePayToken(db, manager, o.id)).toBe(token);

    const view = (await payViewByToken(db, token))!;
    expect(view.amountKnown).toBe(true);
    expect(view.balance).toBe((await getOrder(db, o.id))!.balance);
    expect(await payViewByToken(db, "inconnu-inconnu-inconnu")).toBeNull();

    await expect(declarePayment(db, token, "bitcoin")).rejects.toThrow();
    await declarePayment(db, token, "wave");
    await declarePayment(db, token, "orange_money"); // répété : sans effet
    const after = await getOrder(db, o.id);
    expect(after!.payments).toHaveLength(0);
    expect(after!.payment).toBe("unpaid");
    expect(after!.balance).toBe(view.balance);
    const info = await payInfo(db, o.id);
    expect(info.declaredMethod).toBe("wave");
    expect(after!.events.filter((e) => e.kind === "payment_declared")).toHaveLength(1);

    await recordPayment(db, manager, o.id, { method: "wave", amount: view.balance });
    expect((await getOrder(db, o.id))!.payment).toBe("paid");
    expect((await payViewByToken(db, token))!.paid).toBe(true);
    await expect(declarePayment(db, token, "wave")).rejects.toThrow(/Aucun montant/);
  });

  it("livraison non chiffrée : aucun montant présenté, déclaration refusée", async () => {
    const v = await variantBySku(db, "SON-ST2-NO");
    const o = await createOrder(db, manager, {
      idempotencyKey: crypto.randomUUID(),
      channel: "whatsapp",
      reception: "delivery",
      deliveryAddress: "Quelque part",
      customerName: "Test",
      customerPhone: "000",
      lines: [{ variantId: v.id, quantity: 1 }],
    });
    const token = await ensurePayToken(db, manager, o.id);
    const view = (await payViewByToken(db, token))!;
    expect(view.amountKnown).toBe(false);
    await expect(declarePayment(db, token, "wave")).rejects.toThrow();
  });
});
