import { randomBytes } from "node:crypto";
import type { Db } from "../db/client";
import { AppError } from "./errors";
import { event, getOrder } from "./orders";
import { externalPayments, isExternalMethod } from "@/lib/payment-links";

/** Jeton du lien de paiement d'une commande (créé une fois, réutilisé ensuite). */
export async function ensurePayToken(db: Db, actor: { id: string; name: string }, orderId: string) {
  return db.tx(async (tx) => {
    const o = await tx.one<{ pay_token: string | null; status: string }>(
      "select pay_token, status from orders where id = $1 for update",
      [orderId],
    );
    if (!o) throw new AppError("not_found", "Commande introuvable.");
    if (o.status === "cancelled") throw new AppError("conflict", "Commande annulée : pas de lien de paiement.");
    if (o.pay_token) return o.pay_token;
    const token = randomBytes(18).toString("base64url");
    await tx.query("update orders set pay_token = $2 where id = $1", [orderId, token]);
    await event(tx, orderId, "payment_link", `Lien de paiement créé par ${actor.name}.`, actor.id);
    return token;
  });
}

export interface PayView {
  reference: string;
  /** Reste à payer, jamais le seul sous-total quand la livraison n'est pas chiffrée. */
  balance: number;
  amountKnown: boolean;
  paid: boolean;
  declaredAt: string | null;
  declaredMethod: string | null;
}

export async function payViewByToken(db: Db, token: string): Promise<PayView | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const row = await db.one<{ id: string; payment_declared_at: Date | null; payment_declared_method: string | null }>(
    "select id, payment_declared_at, payment_declared_method from orders where pay_token = $1 and status <> 'cancelled'",
    [token],
  );
  if (!row) return null;
  const o = await getOrder(db, row.id);
  if (!o) return null;
  return {
    reference: o.reference,
    balance: Math.max(0, o.balance),
    amountKnown: !o.feeUnknown,
    paid: o.balance <= 0 && !o.feeUnknown,
    declaredAt: row.payment_declared_at ? new Date(row.payment_declared_at).toISOString() : null,
    declaredMethod: row.payment_declared_method,
  };
}

/**
 * Le client dit avoir payé. Aucune ligne de paiement n'est créée : la commande reste « à vérifier »
 * jusqu'à un encaissement enregistré au Comptoir par une personne autorisée.
 */
export async function declarePayment(db: Db, token: string, method: string) {
  if (!isExternalMethod(method)) throw new AppError("validation", "Moyen de paiement inconnu.");
  return db.tx(async (tx) => {
    const row = await tx.one<{ id: string; status: string; payment_declared_at: Date | null }>(
      "select id, status, payment_declared_at from orders where pay_token = $1 for update",
      [token],
    );
    if (!row || row.status === "cancelled") throw new AppError("not_found", "Lien de paiement introuvable.");
    const o = await getOrder(tx, row.id);
    if (!o || o.feeUnknown || o.balance <= 0) throw new AppError("conflict", "Aucun montant à régler pour le moment.");
    if (!row.payment_declared_at) {
      await tx.query("update orders set payment_declared_at = now(), payment_declared_method = $2 where id = $1", [
        row.id,
        method,
      ]);
      await event(
        tx,
        row.id,
        "payment_declared",
        `Paiement déclaré par le client (${externalPayments[method].label}) — à vérifier dans l'application avant d'enregistrer l'encaissement.`,
        null,
      );
    }
  });
}

export async function payInfo(db: Db, orderId: string) {
  const r = await db.one<{
    pay_token: string | null;
    payment_declared_at: Date | null;
    payment_declared_method: string | null;
  }>("select pay_token, payment_declared_at, payment_declared_method from orders where id = $1", [orderId]);
  return {
    token: r?.pay_token ?? null,
    declaredAt: r?.payment_declared_at ? new Date(r.payment_declared_at).toISOString() : null,
    declaredMethod: r?.payment_declared_method ?? null,
  };
}
