import type { Db } from "../db/client";
import { fail, newId } from "./errors";
import { checkCart } from "./cart";
import { createOrder, event } from "./orders";
import { phoneMatches } from "./customers";

/**
 * Demandes WhatsApp : le panier enregistre une demande avec une référence
 * (GPS-R-1001…) reprise dans le message. Trois états, distincts de ceux de la
 * commande : nouvelle → convertie en commande, ou classée sans suite.
 * Aucune réservation tant que GPS n'a pas confirmé.
 */
export type RequestStatus = "new" | "converted" | "dismissed";

export const requestStatusLabels: Record<RequestStatus, string> = {
  new: "Nouvelle",
  converted: "Convertie en commande",
  dismissed: "Classée sans suite",
};

export interface RequestLine {
  variantId: string;
  sku: string;
  name: string;
  optionsLabel: string;
  quantity: number;
  unitPrice: number;
}

export interface RequestInput {
  items: { variantId: string; quantity: number; seenPrice: number }[];
  name: string;
  phone?: string;
  reception: "pickup" | "delivery";
  zone?: string;
  address?: string;
  deliveryFee: number | null;
  note?: string;
  /** Demande précédente du même panier (identifiant non devinable), remplacée par celle-ci. */
  replacesId?: string;
}

/** Garde-fou contre les envois en rafale depuis le site public. */
const MAX_PER_MINUTE = 20;

export async function createRequest(db: Db, input: RequestInput) {
  const name = String(input.name ?? "")
    .trim()
    .slice(0, 120);
  if (!name) fail("validation", "Indiquez votre nom.");
  if (!["pickup", "delivery"].includes(input.reception)) fail("validation", "Mode de réception invalide.");
  const checked = await checkCart(db, input.items);
  const lines: RequestLine[] = checked
    .filter((c) => !c.issues.some((i) => i.kind === "unavailable"))
    .map((c) => ({
      variantId: c.variantId,
      sku: c.sku,
      name: c.name,
      optionsLabel: c.optionsLabel,
      quantity: Math.min(c.quantity, Math.max(1, c.available)),
      unitPrice: c.unitPrice,
    }));
  if (!lines.length) fail("validation", "Le panier est vide ou indisponible.");
  const recent = await db.one<{ n: number }>(
    "select count(*)::int as n from order_requests where created_at > now() - interval '1 minute'",
  );
  if ((recent?.n ?? 0) >= MAX_PER_MINUTE)
    fail("conflict", "Beaucoup de demandes en ce moment : réessayez dans un instant.");
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const isDemo = checked.some((c) => c.isDemo);
  return db.tx(async (tx) => {
    const seq = await tx.one<{ n: string }>("select nextval('request_number_seq')::text as n");
    const reference = `GPS-R-${seq!.n}`;
    const id = newId();
    await tx.query(
      `insert into order_requests (id, reference, customer_name, customer_phone, reception, delivery_zone, delivery_address,
                                   delivery_fee, note, lines, subtotal, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        reference,
        name,
        String(input.phone ?? "")
          .trim()
          .slice(0, 40),
        input.reception,
        String(input.zone ?? "").slice(0, 80),
        String(input.address ?? "")
          .trim()
          .slice(0, 300),
        input.reception === "delivery" ? input.deliveryFee : 0,
        String(input.note ?? "")
          .trim()
          .slice(0, 500),
        JSON.stringify(lines),
        subtotal,
        isDemo,
      ],
    );
    if (input.replacesId) {
      await tx.query(
        `update order_requests set status = 'dismissed', status_note = $2, updated_at = now()
          where id = $1 and status = 'new' and created_at > now() - interval '1 day'`,
        [input.replacesId, `Remplacée par ${reference} (panier modifié par le client).`],
      );
    }
    return { id, reference, lines, subtotal };
  });
}

export interface OrderRequest {
  id: string;
  reference: string;
  status: RequestStatus;
  customer_name: string;
  customer_phone: string;
  reception: "pickup" | "delivery";
  delivery_zone: string;
  delivery_address: string;
  delivery_fee: number | null;
  note: string;
  lines: RequestLine[];
  subtotal: number;
  order_id: string | null;
  order_reference: string | null;
  status_note: string;
  handled_by_name: string | null;
  created_at: Date;
  updated_at: Date;
  is_demo: boolean;
}

const select = `select r.*, o.reference as order_reference, u.name as handled_by_name
                  from order_requests r left join orders o on o.id = r.order_id left join users u on u.id = r.handled_by`;

export async function listRequests(db: Db, opts: { status?: RequestStatus; q?: string; limit?: number } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`r.status = $${params.length}`);
  }
  if (opts.q?.trim()) {
    params.push(`%${opts.q.trim()}%`);
    where.push(
      `(r.reference ilike $${params.length} or r.customer_name ilike $${params.length} or r.customer_phone ilike $${params.length})`,
    );
  }
  params.push(opts.limit ?? 200);
  return db.query<OrderRequest>(
    `${select} ${where.length ? `where ${where.join(" and ")}` : ""} order by r.created_at desc limit $${params.length}`,
    params,
  );
}

export async function getRequest(db: Db, id: string) {
  return db.one<OrderRequest>(`${select} where r.id = $1`, [id]);
}

export async function requestCounts(db: Db) {
  const rows = await db.query<{ status: RequestStatus; n: number }>(
    "select status, count(*)::int as n from order_requests group by status",
  );
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<RequestStatus, number>>;
}

type Actor = { id: string; name: string; is_demo: boolean };

/**
 * Convertit la demande en commande WhatsApp confirmée (réservation du stock),
 * aux prix en vigueur. Le client existant est repris si le numéro correspond.
 */
export async function convertRequest(db: Db, actor: Actor, id: string, opts: { isDemo: boolean }) {
  return db.tx(async (tx) => {
    const r = await tx.one<OrderRequest>("select * from order_requests where id = $1 for update", [id]);
    if (!r) return fail("not_found", "Demande introuvable.");
    if (r.status !== "new") fail("conflict", `Cette demande est déjà ${requestStatusLabels[r.status].toLowerCase()}.`);
    const known = r.customer_phone ? await phoneMatches(tx, r.customer_phone) : [];
    const order = await createOrder(tx, actor, {
      idempotencyKey: `request:${r.id}`,
      channel: "whatsapp",
      reception: r.reception,
      customerId: known[0]?.id ?? null,
      newCustomer:
        known.length || !r.customer_name
          ? undefined
          : { name: r.customer_name, phone: r.customer_phone, allowDuplicate: true },
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      deliveryAddress: r.delivery_address,
      deliveryZone: r.delivery_zone,
      deliveryFee: r.reception === "delivery" ? r.delivery_fee : null,
      notes: [r.note, `Demande ${r.reference}`].filter(Boolean).join(" · "),
      lines: r.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      isDemo: opts.isDemo || r.is_demo,
    });
    await event(tx, order.id, "request", `Créée depuis la demande ${r.reference} reçue sur WhatsApp.`, actor.id);
    await tx.query(
      "update order_requests set status = 'converted', order_id = $2, handled_by = $3, updated_at = now() where id = $1",
      [id, order.id, actor.id],
    );
    return order;
  });
}

export async function dismissRequest(db: Db, actor: Actor, id: string, reason: string) {
  if (!reason.trim()) fail("validation", "Indiquez la raison.", { reason: "Obligatoire." });
  const r = await db.one<{ status: RequestStatus }>("select status from order_requests where id = $1", [id]);
  if (!r) return fail("not_found", "Demande introuvable.");
  if (r.status !== "new") fail("conflict", "Seule une nouvelle demande peut être classée sans suite.");
  await db.query(
    "update order_requests set status = 'dismissed', status_note = $2, handled_by = $3, updated_at = now() where id = $1",
    [id, reason.trim().slice(0, 300), actor.id],
  );
}

export async function reopenRequest(db: Db, id: string) {
  const r = await db.one<{ status: RequestStatus }>("select status from order_requests where id = $1", [id]);
  if (!r) return fail("not_found", "Demande introuvable.");
  if (r.status !== "dismissed") fail("conflict", "Seule une demande classée peut être rouverte.");
  await db.query("update order_requests set status = 'new', status_note = '', updated_at = now() where id = $1", [id]);
}
