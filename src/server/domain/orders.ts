import type { Db } from "../db/client";
import { applyMovement } from "./stock";
import { fail, newId } from "./errors";
import { bestPromo, discounted, type Promotion } from "./catalog";
import { createCustomer, type CustomerInput } from "./customers";
import { optionsLabel } from "@/lib/format";

export type Channel = "whatsapp" | "boutique" | "telephone" | "autre";
export type OrderStatus = "confirmed" | "completed" | "cancelled";
export type Fulfillment = "to_prepare" | "ready" | "out_for_delivery" | "handed_over";
export type Reception = "pickup" | "delivery" | "immediate";
export type PaymentMethod = "cash" | "wave" | "orange_money" | "mobile_money" | "card" | "bank_transfer" | "other";

export const channelLabels: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  boutique: "Boutique",
  telephone: "Téléphone",
  autre: "Autre",
};
export const statusLabels: Record<OrderStatus, string> = {
  confirmed: "Confirmée",
  completed: "Terminée",
  cancelled: "Annulée",
};
export const fulfillmentLabels: Record<Fulfillment, string> = {
  to_prepare: "À préparer",
  ready: "Prête",
  out_for_delivery: "En livraison",
  handed_over: "Remise au client",
};
export const receptionLabels: Record<Reception, string> = {
  pickup: "Retrait en boutique",
  delivery: "Livraison",
  immediate: "Vente au comptoir",
};
export const methodLabels: Record<PaymentMethod, string> = {
  cash: "Espèces",
  wave: "Wave",
  orange_money: "Orange Money",
  mobile_money: "Autre mobile money",
  card: "Carte",
  bank_transfer: "Virement",
  other: "Autre",
};

export interface LineInput {
  variantId: string;
  quantity: number;
  /** Prix unitaire convenu ; à défaut, prix catalogue en vigueur (promotion incluse). */
  unitPrice?: number;
}

/** Encaissement saisi à la création ; « tendered » : somme remise en espèces (monnaie rendue = tendered − amount). */
export interface PaymentInput {
  method: PaymentMethod;
  amount: number;
  note?: string;
  tendered?: number;
}

export interface OrderInput {
  idempotencyKey: string;
  channel: Channel;
  reception: Reception;
  customerId?: string | null;
  newCustomer?: CustomerInput & { allowDuplicate?: boolean };
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryZone?: string;
  deliveryFee?: number | null;
  notes?: string;
  lines: LineInput[];
  payment?: PaymentInput | null;
  /** Paiement mixte : plusieurs moyens pour une même vente. */
  payments?: PaymentInput[];
  isDemo?: boolean;
  /** Point de vente : retrait choisi par le client, ou boutique où la vente est réalisée. */
  storeId?: string | null;
}

interface Actor {
  id: string;
  name: string;
}

async function nextReference(tx: Db, at: Date) {
  const r = await tx.one<{ n: number }>("select nextval('order_number_seq')::int as n");
  return `GPS-${at.getFullYear()}-${String(r!.n).padStart(5, "0")}`;
}

export async function event(tx: Db, orderId: string, kind: string, message: string, userId: string | null) {
  await tx.query("insert into order_events (id, order_id, kind, message, user_id) values ($1,$2,$3,$4,$5)", [
    newId(),
    orderId,
    kind,
    message,
    userId,
  ]);
}

async function resolveLines(tx: Db, lines: LineInput[], now: Date) {
  if (!lines.length) fail("validation", "Ajoutez au moins un article.");
  const merged = new Map<string, LineInput>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1)
      fail("validation", "Les quantités doivent être des entiers positifs.");
    const prev = merged.get(l.variantId);
    merged.set(l.variantId, prev ? { ...prev, quantity: prev.quantity + l.quantity } : { ...l });
  }
  const ids = [...merged.keys()];
  const variants = await tx.query<{
    id: string;
    product_id: string;
    sku: string;
    options: Record<string, string>;
    price: number;
    cost_price: number | null;
    name: string;
    axes: string[];
    status: string;
    active: boolean;
    disabled: boolean;
  }>(
    `select v.id, v.product_id, v.sku, v.options, v.price, v.cost_price, v.active, p.name, p.axes, p.status,
            (v.disabled or p.disabled) as disabled
       from variants v join products p on p.id = v.product_id where v.id = any($1)`,
    [ids],
  );
  const promos = await tx.query<Promotion>("select * from promotions where product_id = any($1) and active", [
    variants.map((v) => v.product_id),
  ]);
  return ids.map((id, position) => {
    const v = variants.find((x) => x.id === id);
    if (!v || !v.active || v.status === "archived")
      return fail("validation", "Un article n'est plus disponible au catalogue.");
    if (v.disabled)
      return fail(
        "stock",
        `${v.name}${Object.values(v.options ?? {}).length ? ` (${Object.values(v.options).join(" · ")})` : ""} est désactivé : réactivez-le dans le catalogue pour le vendre.`,
      );
    const l = merged.get(id)!;
    const promo = bestPromo(
      promos.filter((p) => p.product_id === v.product_id),
      v.price,
      now,
    );
    const catalogPrice = promo ? discounted(v.price, promo) : v.price;
    const unitPrice = l.unitPrice ?? catalogPrice;
    if (!Number.isInteger(unitPrice) || unitPrice < 0) fail("validation", `Prix invalide pour ${v.sku}.`);
    return {
      variantId: id,
      productId: v.product_id,
      sku: v.sku,
      name: v.name,
      optionsLabel: optionsLabel(v.options, v.axes),
      unitPrice,
      costPrice: v.cost_price,
      quantity: l.quantity,
      position,
    };
  });
}

/**
 * Enregistre une commande confirmée (après échange WhatsApp, téléphone…)
 * ou une vente immédiate en boutique. Commande, lignes, réservation ou sortie
 * de stock, paiement et chronologie sont écrits dans une seule transaction.
 */
export async function createOrder(db: Db, actor: Actor, input: OrderInput, now = new Date()) {
  const immediate = input.reception === "immediate";
  return db.tx(async (tx) => {
    const dup = await tx.one<{ id: string; reference: string }>(
      "select id, reference from orders where idempotency_key = $1",
      [input.idempotencyKey],
    );
    if (dup) return { ...dup, duplicate: true };

    const lines = await resolveLines(tx, input.lines, now);

    let customerId = input.customerId ?? null;
    let customerName = input.customerName?.trim() ?? "";
    let customerPhone = input.customerPhone?.trim() ?? "";
    if (!customerId && input.newCustomer?.name?.trim()) {
      customerId = await createCustomer(tx, input.newCustomer, {
        allowDuplicate: input.newCustomer.allowDuplicate,
        isDemo: input.isDemo,
      });
    }
    if (customerId) {
      const c = await tx.one<{ name: string; phone: string }>("select name, phone from customers where id = $1", [
        customerId,
      ]);
      if (!c) fail("validation", "Client introuvable.");
      customerName = c!.name;
      customerPhone = c!.phone;
    }
    if (!immediate && !customerName) {
      fail("validation", "Indiquez le client : ses coordonnées sont nécessaires pour une commande à préparer.", {
        customer: "Obligatoire.",
      });
    }
    if (input.reception === "delivery" && !input.deliveryAddress?.trim()) {
      fail("validation", "Indiquez l'adresse de livraison.", {
        deliveryAddress: "Obligatoire pour une livraison.",
      });
    }
    const deliveryFee = input.reception === "delivery" ? (input.deliveryFee ?? null) : 0;
    if (deliveryFee !== null && (!Number.isInteger(deliveryFee) || deliveryFee < 0))
      fail("validation", "Frais de livraison invalides.");
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    const id = newId();
    const reference = await nextReference(tx, now);
    await tx.query(
      `insert into orders (id, reference, idempotency_key, customer_id, customer_name, customer_phone, channel, status,
                           fulfillment, reception, delivery_address, delivery_zone, delivery_fee, subtotal, notes,
                           created_by, created_at, updated_at, completed_at, is_demo, store_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18,$19,$20)`,
      [
        id,
        reference,
        input.idempotencyKey,
        customerId,
        customerName,
        customerPhone,
        input.channel,
        immediate ? "completed" : "confirmed",
        immediate ? "handed_over" : "to_prepare",
        input.reception,
        input.deliveryAddress?.trim() ?? "",
        input.deliveryZone?.trim() ?? "",
        deliveryFee,
        subtotal,
        input.notes?.trim() ?? "",
        actor.id,
        now,
        immediate ? now : null,
        !!input.isDemo,
        input.storeId
          ? ((await tx.one<{ id: string }>("select id from stores where id = $1", [input.storeId]))?.id ?? null)
          : null,
      ],
    );
    for (const l of lines) {
      await tx.query(
        `insert into order_lines (id, order_id, variant_id, product_id, sku, name, options_label, unit_price, cost_price, quantity, position)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          newId(),
          id,
          l.variantId,
          l.productId,
          l.sku,
          l.name,
          l.optionsLabel,
          l.unitPrice,
          l.costPrice,
          l.quantity,
          l.position,
        ],
      );
      await applyMovement(
        tx,
        immediate
          ? {
              variantId: l.variantId,
              kind: "sale",
              onHandDelta: -l.quantity,
              reason: `Vente ${reference}`,
              orderId: id,
              userId: actor.id,
            }
          : {
              variantId: l.variantId,
              kind: "reservation",
              reservedDelta: l.quantity,
              reason: `Commande ${reference}`,
              orderId: id,
              userId: actor.id,
            },
      );
    }
    await event(
      tx,
      id,
      "created",
      immediate
        ? `Vente enregistrée au comptoir par ${actor.name}.`
        : `Commande ${channelLabels[input.channel]} enregistrée par ${actor.name}. Articles réservés.`,
      actor.id,
    );

    const pays = [...(input.payment ? [input.payment] : []), ...(input.payments ?? [])].filter((p) => p.amount > 0);
    const totalPaid = pays.reduce((sum, p) => sum + p.amount, 0);
    const dueNow = subtotal + (input.deliveryFee ?? 0);
    if (totalPaid > dueNow && input.deliveryFee !== null) {
      fail("validation", `Le total encaissé (${totalPaid.toLocaleString("fr-FR")} FCFA) dépasse le montant dû.`);
    }
    for (const p of pays) {
      await insertPayment(
        tx,
        actor,
        id,
        "payment",
        p.method,
        p.amount,
        p.note ?? (pays.length > 1 ? "Paiement mixte" : ""),
        null,
        p.tendered ?? null,
      );
    }
    return { id, reference, duplicate: false };
  });
}

async function insertPayment(
  tx: Db,
  actor: Actor,
  orderId: string,
  kind: "payment" | "refund" | "reversal",
  method: PaymentMethod,
  amount: number,
  note: string,
  reversesId: string | null = null,
  tendered: number | null = null,
) {
  if (!Number.isInteger(amount) || amount <= 0)
    fail("validation", "Le montant doit être un nombre entier positif.", {
      amount: "Montant invalide.",
    });
  // Monnaie rendue : seulement sur un encaissement en espèces, somme remise ≥ montant encaissé.
  if (tendered !== null) {
    if (kind !== "payment" || method !== "cash" || !Number.isInteger(tendered) || tendered < amount) {
      fail("validation", "La somme remise doit être en espèces et au moins égale au montant encaissé.");
    }
  }
  const changeGiven = tendered !== null ? tendered - amount : 0;
  await tx.query(
    `insert into payments (id, order_id, kind, method, amount, note, reverses_id, created_by, tendered, change_given)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [newId(), orderId, kind, method, amount, note, reversesId, actor.id, tendered, changeGiven],
  );
  if (changeGiven > 0) {
    note = `${note ? `${note} — ` : ""}reçu ${tendered!.toLocaleString("fr-FR")} FCFA, rendu ${changeGiven.toLocaleString("fr-FR")} FCFA`;
  }
  const verb =
    kind === "payment" ? "Encaissement" : kind === "refund" ? "Remboursement" : "Annulation d'un encaissement";
  await event(
    tx,
    orderId,
    kind,
    `${verb} de ${amount.toLocaleString("fr-FR")} FCFA (${methodLabels[method]})${note ? ` — ${note}` : ""}.`,
    actor.id,
  );
}

// ——— Lecture ———

export interface OrderSummary {
  id: string;
  reference: string;
  store_id: string | null;
  store_name: string | null;
  customer_name: string;
  customer_phone: string;
  channel: Channel;
  status: OrderStatus;
  fulfillment: Fulfillment;
  reception: Reception;
  subtotal: number;
  delivery_fee: number | null;
  returned_value: number;
  paid: number;
  refunded: number;
  created_at: Date;
  is_demo: boolean;
  item_count: number;
}

export function money(
  o: Pick<OrderSummary, "subtotal" | "delivery_fee" | "returned_value" | "paid" | "refunded" | "status">,
) {
  const due = o.status === "cancelled" ? 0 : o.subtotal - o.returned_value + (o.delivery_fee ?? 0);
  const net = o.paid - o.refunded;
  const balance = due - net;
  let payment: "unpaid" | "partial" | "paid" | "to_refund" | "none";
  if (balance < 0) payment = "to_refund";
  else if (due === 0) payment = net > 0 ? "to_refund" : "none";
  else if (net <= 0) payment = "unpaid";
  else if (balance > 0) payment = "partial";
  else payment = "paid";
  return { due, net, balance, payment, feeUnknown: o.delivery_fee === null };
}

export const paymentLabels = {
  unpaid: "Non payée",
  partial: "Paiement partiel",
  paid: "Payée",
  to_refund: "À rembourser",
  none: "Aucun montant dû",
} as const;

export const summarySelect = `
  select o.id, o.reference, o.customer_name, o.customer_phone, o.channel, o.status, o.fulfillment, o.reception,
         o.subtotal, o.delivery_fee, o.created_at, o.is_demo, o.store_id,
         (select st.name from stores st where st.id = o.store_id) as store_name,
         coalesce((select sum(l.returned_quantity * l.unit_price) from order_lines l where l.order_id = o.id), 0)::int as returned_value,
         coalesce((select sum(l.quantity) from order_lines l where l.order_id = o.id), 0)::int as item_count,
         coalesce((select sum(case when p.kind = 'payment' then p.amount when p.kind = 'reversal' then -p.amount else 0 end)
                     from payments p where p.order_id = o.id), 0)::int as paid,
         coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.kind = 'refund'), 0)::int as refunded
    from orders o`;

export type OrderView =
  "a-preparer" | "pretes" | "en-livraison" | "remises" | "annulees" | "toutes" | "retraits" | "livraisons" | "solde";

export async function listOrders(
  db: Db,
  opts: { view?: OrderView; q?: string; channel?: string; store?: string; limit?: number } = {},
) {
  const where: string[] = [];
  const params: unknown[] = [];
  switch (opts.view) {
    case "a-preparer":
      where.push("o.status = 'confirmed' and o.fulfillment = 'to_prepare'");
      break;
    case "pretes":
      where.push("o.status = 'confirmed' and o.fulfillment = 'ready'");
      break;
    case "retraits":
      where.push("o.status = 'confirmed' and o.fulfillment = 'ready' and o.reception = 'pickup'");
      break;
    case "livraisons":
      where.push(
        "o.status = 'confirmed' and o.reception = 'delivery' and o.fulfillment in ('ready', 'out_for_delivery')",
      );
      break;
    case "en-livraison":
      where.push("o.status = 'confirmed' and o.fulfillment = 'out_for_delivery'");
      break;
    case "remises":
      where.push("o.status = 'completed'");
      break;
    case "annulees":
      where.push("o.status = 'cancelled'");
      break;
  }
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim()}%`);
    const i = params.length;
    const digits = opts.q.replace(/\D/g, "");
    params.push(digits.length >= 3 ? `%${digits}%` : null);
    where.push(
      `(o.reference ilike $${i} or o.customer_name ilike $${i} or ($${i + 1}::text is not null and regexp_replace(o.customer_phone, '[^0-9]', '', 'g') like $${i + 1}))`,
    );
  }
  if (opts.channel) {
    params.push(opts.channel);
    where.push(`o.channel = $${params.length}`);
  }
  if (opts.store) {
    params.push(opts.store);
    where.push(`o.store_id = $${params.length}`);
  }
  params.push(opts.limit ?? 200);
  const rows = await db.query<OrderSummary>(
    `${summarySelect} ${where.length ? `where ${where.join(" and ")}` : ""} order by o.created_at desc limit $${params.length}`,
    params,
  );
  const out = rows.map((r) => ({ ...r, ...money(r) }));
  return opts.view === "solde" ? out.filter((o) => o.balance > 0 && o.status !== "cancelled") : out;
}

export async function getOrder(db: Db, id: string) {
  const o = await db.one<
    OrderSummary & {
      delivery_address: string;
      delivery_zone: string;
      notes: string;
      customer_id: string | null;
      created_by_name: string | null;
      completed_at: Date | null;
      cancelled_at: Date | null;
    }
  >(
    `select s.*, o.delivery_address, o.delivery_zone, o.notes, o.customer_id, o.completed_at, o.cancelled_at, u.name as created_by_name
       from (${summarySelect} where o.id = $1) s join orders o on o.id = s.id left join users u on u.id = o.created_by`,
    [id],
  );
  if (!o) return null;
  const [lines, payments, events] = await Promise.all([
    db.query<{
      id: string;
      variant_id: string;
      sku: string;
      name: string;
      options_label: string;
      unit_price: number;
      cost_price: number | null;
      quantity: number;
      returned_quantity: number;
    }>("select * from order_lines where order_id = $1 order by position", [id]),
    db.query<{
      id: string;
      kind: "payment" | "refund" | "reversal";
      method: PaymentMethod;
      amount: number;
      note: string;
      reverses_id: string | null;
      tendered: number | null;
      change_given: number;
      created_at: Date;
      user_name: string | null;
    }>(
      "select p.*, u.name as user_name from payments p left join users u on u.id = p.created_by where order_id = $1 order by p.created_at",
      [id],
    ),
    db.query<{
      id: string;
      kind: string;
      message: string;
      created_at: Date;
      user_name: string | null;
    }>(
      "select e.*, u.name as user_name from order_events e left join users u on u.id = e.user_id where order_id = $1 order by e.created_at desc",
      [id],
    ),
  ]);
  return { ...o, ...money(o), lines, payments, events };
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

// ——— Étapes ———

/** Étape suivante proposée comme action principale. */
export function nextStep(
  o: Pick<OrderSummary, "status" | "fulfillment" | "reception">,
): { to: Fulfillment; label: string } | null {
  if (o.status !== "confirmed") return null;
  if (o.fulfillment === "to_prepare")
    return {
      to: "ready",
      label: o.reception === "delivery" ? "Marquer prête à livrer" : "Marquer prête au retrait",
    };
  if (o.fulfillment === "ready" && o.reception === "delivery")
    return { to: "out_for_delivery", label: "Marquer en livraison" };
  if (o.fulfillment === "ready" || o.fulfillment === "out_for_delivery")
    return { to: "handed_over", label: "Confirmer la remise au client" };
  return null;
}

async function lockOrder(tx: Db, id: string) {
  const o = await tx.one<{
    id: string;
    reference: string;
    status: OrderStatus;
    fulfillment: Fulfillment;
    reception: Reception;
  }>("select id, reference, status, fulfillment, reception from orders where id = $1 for update", [id]);
  if (!o) return fail("not_found", "Commande introuvable.");
  return o;
}

export async function advanceOrder(db: Db, actor: Actor, id: string, to: Fulfillment) {
  return db.tx(async (tx) => {
    const o = await lockOrder(tx, id);
    const step = nextStep(o);
    if (!step || step.to !== to) {
      fail(
        "conflict",
        "Cette étape n'est plus d'actualité : la commande a changé entre-temps. La page a été actualisée.",
      );
    }
    if (to === "handed_over") {
      const lines = await tx.query<{ variant_id: string; quantity: number }>(
        "select variant_id, quantity from order_lines where order_id = $1",
        [id],
      );
      for (const l of lines) {
        await applyMovement(tx, {
          variantId: l.variant_id,
          kind: "sale",
          onHandDelta: -l.quantity,
          reservedDelta: -l.quantity,
          reason: `Remise ${o.reference}`,
          orderId: id,
          userId: actor.id,
        });
      }
      await tx.query(
        "update orders set fulfillment = 'handed_over', status = 'completed', completed_at = now(), updated_at = now() where id = $1",
        [id],
      );
      await event(
        tx,
        id,
        "handed_over",
        `Commande remise au client (${actor.name}). Sortie de stock finalisée.`,
        actor.id,
      );
    } else {
      await tx.query("update orders set fulfillment = $2, updated_at = now() where id = $1", [id, to]);
      await event(tx, id, to, `Étape : ${fulfillmentLabels[to]} (${actor.name}).`, actor.id);
    }
  });
}

export async function cancelOrder(db: Db, actor: Actor, id: string, reason: string) {
  if (!reason.trim())
    fail("validation", "Indiquez le motif d'annulation.", {
      reason: "Obligatoire.",
    });
  return db.tx(async (tx) => {
    const o = await lockOrder(tx, id);
    if (o.status !== "confirmed")
      fail(
        "conflict",
        "Seule une commande en cours peut être annulée. Pour un article déjà remis, enregistrez un retour.",
      );
    const lines = await tx.query<{ variant_id: string; quantity: number }>(
      "select variant_id, quantity from order_lines where order_id = $1",
      [id],
    );
    for (const l of lines) {
      await applyMovement(tx, {
        variantId: l.variant_id,
        kind: "release",
        reservedDelta: -l.quantity,
        reason: `Annulation ${o.reference}`,
        orderId: id,
        userId: actor.id,
      });
    }
    await tx.query("update orders set status = 'cancelled', cancelled_at = now(), updated_at = now() where id = $1", [
      id,
    ]);
    await event(
      tx,
      id,
      "cancelled",
      `Commande annulée par ${actor.name} — ${reason.trim()}. Réservations libérées.`,
      actor.id,
    );
  });
}

export async function recordPayment(
  db: Db,
  actor: Actor,
  orderId: string,
  input: { method: PaymentMethod; amount: number; note?: string },
) {
  return db.tx(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status === "cancelled") fail("conflict", "Commande annulée : aucun encaissement possible.");
    const full = await getOrder(tx, orderId);
    if (full && input.amount > full.balance && !full.feeUnknown) {
      fail("validation", `Le montant dépasse le solde restant (${full.balance.toLocaleString("fr-FR")} FCFA).`, {
        amount: "Supérieur au solde.",
      });
    }
    await insertPayment(tx, actor, orderId, "payment", input.method, input.amount, input.note ?? "");
  });
}

export async function refund(
  db: Db,
  actor: Actor,
  orderId: string,
  input: { method: PaymentMethod; amount: number; note: string },
) {
  if (!input.note.trim())
    fail("validation", "Indiquez le motif du remboursement.", {
      note: "Obligatoire.",
    });
  return db.tx(async (tx) => {
    await lockOrder(tx, orderId);
    const full = await getOrder(tx, orderId);
    if (!full) return fail("not_found", "Commande introuvable.");
    if (input.amount > full.net)
      fail("validation", `Le remboursement dépasse les sommes encaissées (${full.net.toLocaleString("fr-FR")} FCFA).`, {
        amount: "Trop élevé.",
      });
    await insertPayment(tx, actor, orderId, "refund", input.method, input.amount, input.note.trim());
  });
}

/** Corrige un encaissement saisi par erreur : contre-passation, l'original reste visible. */
export async function reversePayment(db: Db, actor: Actor, paymentId: string, reason: string) {
  if (!reason.trim())
    fail("validation", "Indiquez le motif de la correction.", {
      reason: "Obligatoire.",
    });
  return db.tx(async (tx) => {
    const p = await tx.one<{
      id: string;
      order_id: string;
      kind: string;
      method: PaymentMethod;
      amount: number;
    }>("select * from payments where id = $1 for update", [paymentId]);
    if (!p || p.kind !== "payment") return fail("not_found", "Encaissement introuvable.");
    const already = await tx.one("select 1 from payments where reverses_id = $1", [paymentId]);
    if (already) fail("conflict", "Cet encaissement a déjà été corrigé.");
    await insertPayment(tx, actor, p.order_id, "reversal", p.method, p.amount, `Correction : ${reason.trim()}`, p.id);
  });
}

export async function correctDeliveryFee(db: Db, actor: Actor, orderId: string, fee: number | null, reason: string) {
  if (!reason.trim())
    fail("validation", "Indiquez le motif de la correction.", {
      reason: "Obligatoire.",
    });
  if (fee !== null && (!Number.isInteger(fee) || fee < 0))
    fail("validation", "Frais invalides.", { fee: "Montant invalide." });
  return db.tx(async (tx) => {
    const o = await tx.one<{
      delivery_fee: number | null;
      reception: Reception;
    }>("select delivery_fee, reception from orders where id = $1 for update", [orderId]);
    if (!o) return fail("not_found", "Commande introuvable.");
    if (o.reception !== "delivery") fail("validation", "Cette commande n'est pas en livraison.");
    await tx.query("update orders set delivery_fee = $2, updated_at = now() where id = $1", [orderId, fee]);
    const fmt = (v: number | null) => (v === null ? "à confirmer" : `${v.toLocaleString("fr-FR")} FCFA`);
    await event(
      tx,
      orderId,
      "correction",
      `Frais de livraison : ${fmt(o.delivery_fee)} → ${fmt(fee)} (${actor.name}) — ${reason.trim()}.`,
      actor.id,
    );
  });
}

export async function addOrderNote(db: Db, actor: Actor, orderId: string, note: string) {
  if (!note.trim()) fail("validation", "La note est vide.", { note: "Obligatoire." });
  await event(db, orderId, "note", note.trim(), actor.id);
}

/**
 * Retour d'articles remis. La remise en stock n'a lieu que si l'état
 * a été validé comme revendable ; sinon le retour est tracé sans stock.
 */
export async function processReturn(
  db: Db,
  actor: Actor,
  orderId: string,
  input: {
    lines: { lineId: string; quantity: number }[];
    resellable: boolean;
    reason: string;
    refund?: { method: PaymentMethod; amount: number } | null;
  },
) {
  if (!input.reason.trim())
    fail("validation", "Indiquez le motif du retour.", {
      reason: "Obligatoire.",
    });
  const chosen = input.lines.filter((l) => l.quantity > 0);
  if (!chosen.length) fail("validation", "Sélectionnez au moins un article retourné.");
  return db.tx(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status !== "completed") fail("conflict", "Un retour ne concerne que des articles déjà remis au client.");
    for (const c of chosen) {
      const l = await tx.one<{
        id: string;
        variant_id: string;
        quantity: number;
        returned_quantity: number;
        sku: string;
      }>("select * from order_lines where id = $1 and order_id = $2 for update", [c.lineId, orderId]);
      if (!l) return fail("not_found", "Ligne introuvable.");
      if (!Number.isInteger(c.quantity) || c.quantity > l.quantity - l.returned_quantity) {
        fail(
          "validation",
          `Réf. ${l.sku} : au plus ${l.quantity - l.returned_quantity} article(s) peuvent être retournés.`,
        );
      }
      await tx.query("update order_lines set returned_quantity = returned_quantity + $2 where id = $1", [
        l.id,
        c.quantity,
      ]);
      await applyMovement(
        tx,
        input.resellable
          ? {
              variantId: l.variant_id,
              kind: "return_restock",
              onHandDelta: c.quantity,
              reason: `Retour ${o.reference} — état validé revendable · ${input.reason.trim()}`,
              orderId,
              userId: actor.id,
            }
          : {
              variantId: l.variant_id,
              kind: "return_no_restock",
              reason: `Retour ${o.reference} — non revendable · ${input.reason.trim()}`,
              orderId,
              userId: actor.id,
            },
      );
    }
    const count = chosen.reduce((s, c) => s + c.quantity, 0);
    await event(
      tx,
      orderId,
      "return",
      `Retour de ${count} article(s) enregistré par ${actor.name} — ${input.resellable ? "remis en stock après validation de l'état" : "non remis en stock"} — ${input.reason.trim()}.`,
      actor.id,
    );
    if (input.refund && input.refund.amount > 0) {
      const full = await getOrder(tx, orderId);
      if (full && input.refund.amount > full.net) fail("validation", "Le remboursement dépasse les sommes encaissées.");
      await insertPayment(
        tx,
        actor,
        orderId,
        "refund",
        input.refund.method,
        input.refund.amount,
        `Retour : ${input.reason.trim()}`,
      );
    }
    await tx.query("update orders set updated_at = now() where id = $1", [orderId]);
  });
}

// ——— Tableau de bord ———

export async function todayCounts(db: Db) {
  const r = await db.one<{
    to_prepare: number;
    pickups_ready: number;
    deliveries: number;
    with_balance: number;
  }>(
    `select
       count(*) filter (where status = 'confirmed' and fulfillment = 'to_prepare')::int as to_prepare,
       count(*) filter (where status = 'confirmed' and fulfillment = 'ready' and reception = 'pickup')::int as pickups_ready,
       count(*) filter (where status = 'confirmed' and reception = 'delivery' and fulfillment in ('ready', 'out_for_delivery'))::int as deliveries,
       0 as with_balance
     from orders`,
  );
  const balances = await listOrders(db, { view: "solde" });
  return { ...r!, with_balance: balances.length };
}
