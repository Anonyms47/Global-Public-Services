"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { sellableProducts } from "@/server/domain/catalog";
import { phoneMatches, searchCustomers } from "@/server/domain/customers";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import {
  addOrderNote,
  advanceOrder,
  cancelOrder,
  correctDeliveryFee,
  createOrder,
  processReturn,
  recordPayment,
  refund,
  reversePayment,
  type Fulfillment,
} from "@/server/domain/orders";
import { can } from "@/lib/permissions";
import { optionsLabel } from "@/lib/format";

const method = z.enum([
  "cash",
  "mobile_money",
  "card",
  "bank_transfer",
  "other",
]);
const money = z.coerce.number().int("Montant entier attendu.").min(0);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues)
      fieldErrors[issue.path.join(".")] ??= issue.message;
    throw new AppError(
      "validation",
      "Certaines informations sont invalides.",
      fieldErrors,
    );
  }
  return r.data;
}

/** Catalogue simplifié pour la saisie de commandes et la vente rapide. */
export async function sellableAction() {
  return guarded("sales.quick", async ({ db }) =>
    (await sellableProducts(db)).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.categoryName,
      image: p.images[0]?.url ?? null,
      axes: p.axes,
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        label: optionsLabel(v.options, p.axes),
        options: v.options,
        price: v.price,
        available: v.available,
      })),
    })),
  );
}

export async function customerSearchAction(q: string) {
  return guarded("customers.view", async ({ db }) => {
    const rows = await searchCustomers(db, String(q).slice(0, 60), 8);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
    }));
  });
}

export async function phoneMatchesAction(phone: string) {
  return guarded("customers.view", async ({ db }) =>
    (await phoneMatches(db, String(phone))).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
    })),
  );
}

const lineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPrice: money.optional(),
});

const orderSchema = z.object({
  idempotencyKey: z.string().min(8),
  channel: z.enum(["whatsapp", "boutique", "telephone", "autre"]),
  reception: z.enum(["pickup", "delivery", "immediate"]),
  customerId: z.string().nullish(),
  newCustomer: z
    .object({
      name: z.string(),
      phone: z.string(),
      address: z.string().optional(),
      allowDuplicate: z.boolean().optional(),
    })
    .nullish(),
  deliveryAddress: z.string().max(300).optional(),
  deliveryZone: z.string().max(80).optional(),
  deliveryFee: money.nullish(),
  notes: z.string().max(1000).optional(),
  lines: z.array(lineSchema).min(1, "Ajoutez au moins un article."),
  payment: z
    .object({ method, amount: money, note: z.string().max(200).optional() })
    .nullish(),
});

export async function createOrderAction(input: unknown) {
  return guarded("orders.create", async ({ db, user }) => {
    const data = parse(orderSchema, input);
    // Un prix différent du catalogue n'est accepté que pour les rôles autorisés à corriger.
    const lines = data.lines.map((l) =>
      can(user.role, "orders.correct") ? l : { ...l, unitPrice: undefined },
    );
    return createOrder(db, user, {
      ...data,
      lines,
      newCustomer: data.newCustomer ?? undefined,
      isDemo: isDemoMode(),
    });
  });
}

export async function quickSaleAction(input: unknown) {
  return guarded("sales.quick", async ({ db, user }) => {
    const data = parse(orderSchema, input);
    const lines = data.lines.map((l) =>
      can(user.role, "orders.correct") ? l : { ...l, unitPrice: undefined },
    );
    return createOrder(db, user, {
      ...data,
      channel: "boutique",
      reception: "immediate",
      lines,
      newCustomer: data.newCustomer ?? undefined,
      isDemo: isDemoMode(),
    });
  });
}

export async function advanceAction(id: string, to: Fulfillment) {
  return guarded(
    "orders.progress",
    ({ db, user }) =>
      advanceOrder(
        db,
        user,
        String(id),
        parse(z.enum(["ready", "out_for_delivery", "handed_over"]), to),
      ),
    {
      message: "Étape enregistrée.",
    },
  );
}

export async function cancelAction(id: string, reason: string) {
  return guarded(
    "orders.cancel",
    ({ db, user }) => cancelOrder(db, user, String(id), String(reason ?? "")),
    { message: "Commande annulée, réservations libérées." },
  );
}

export async function paymentAction(id: string, input: unknown) {
  return guarded(
    "payments.record",
    ({ db, user }) =>
      recordPayment(
        db,
        user,
        String(id),
        parse(
          z.object({
            method,
            amount: money.min(1, "Montant requis."),
            note: z.string().max(200).optional(),
          }),
          input,
        ),
      ),
    {
      message: "Encaissement enregistré.",
    },
  );
}

export async function refundAction(id: string, input: unknown) {
  return guarded(
    "payments.refund",
    ({ db, user }) =>
      refund(
        db,
        user,
        String(id),
        parse(
          z.object({
            method,
            amount: money.min(1, "Montant requis."),
            note: z.string().max(200),
          }),
          input,
        ),
      ),
    {
      message: "Remboursement enregistré.",
    },
  );
}

export async function reversePaymentAction(paymentId: string, reason: string) {
  return guarded(
    "orders.correct",
    ({ db, user }) =>
      reversePayment(db, user, String(paymentId), String(reason ?? "")),
    { message: "Encaissement corrigé (contre-passation)." },
  );
}

export async function deliveryFeeAction(
  id: string,
  fee: number | null,
  reason: string,
) {
  return guarded(
    "orders.correct",
    ({ db, user }) =>
      correctDeliveryFee(
        db,
        user,
        String(id),
        fee === null ? null : parse(money, fee),
        String(reason ?? ""),
      ),
    {
      message: "Frais de livraison corrigés.",
    },
  );
}

export async function noteAction(id: string, note: string) {
  return guarded(
    "orders.progress",
    ({ db, user }) =>
      addOrderNote(db, user, String(id), String(note ?? "").slice(0, 1000)),
    { message: "Note ajoutée." },
  );
}

export async function returnAction(id: string, input: unknown) {
  return guarded(
    "returns.process",
    ({ db, user }) =>
      processReturn(
        db,
        user,
        String(id),
        parse(
          z.object({
            lines: z.array(
              z.object({
                lineId: z.string(),
                quantity: z.coerce.number().int().min(0),
              }),
            ),
            resellable: z.boolean(),
            reason: z.string().max(300),
            refund: z.object({ method, amount: money }).nullish(),
          }),
          input,
        ),
      ),
    { message: "Retour enregistré." },
  );
}
