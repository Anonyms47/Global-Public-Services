import type { Db } from "../db/client";
import { fail, newId } from "./errors";

export type MovementKind =
  | "initial"
  | "restock"
  | "reservation"
  | "release"
  | "sale"
  | "return_restock"
  | "return_no_restock"
  | "inventory"
  | "adjustment"
  | "unsellable"
  | "sellable"
  | "writeoff";

export const movementLabels: Record<MovementKind, string> = {
  initial: "Stock initial",
  restock: "Réapprovisionnement",
  reservation: "Réservation (commande confirmée)",
  release: "Réservation libérée",
  sale: "Sortie (remise au client)",
  return_restock: "Retour remis en stock",
  return_no_restock: "Retour non remis en stock",
  inventory: "Inventaire",
  adjustment: "Ajustement",
  unsellable: "Passé en non vendable",
  sellable: "Remis en vente",
  writeoff: "Sorti du stock (non vendable)",
};

export interface MovementInput {
  variantId: string;
  kind: MovementKind;
  onHandDelta?: number;
  reservedDelta?: number;
  unsellableDelta?: number;
  reason?: string;
  orderId?: string | null;
  batchId?: string | null;
  userId?: string | null;
}

/**
 * Applique un mouvement de stock de façon atomique.
 *
 * La mise à jour est conditionnelle : elle n'aboutit que si le stock physique
 * reste positif et couvre les réservations. Deux réservations concurrentes du
 * dernier article ne peuvent donc pas réussir toutes les deux (la contrainte
 * `reserved_within_stock` le garantit aussi au niveau de la base).
 */
export async function applyMovement(tx: Db, m: MovementInput) {
  const dOn = m.onHandDelta ?? 0;
  const dRes = m.reservedDelta ?? 0;
  const dUns = m.unsellableDelta ?? 0;
  // Les unités non vendables ne peuvent être ni réservées ni vendues.
  const row = await tx.one<{ on_hand: number; reserved: number; unsellable: number }>(
    `update variants set on_hand = on_hand + $2, reserved = reserved + $3, unsellable = unsellable + $4
      where id = $1 and on_hand + $2 >= 0 and reserved + $3 >= 0 and unsellable + $4 >= 0
        and reserved + $3 + unsellable + $4 <= on_hand + $2
      returning on_hand, reserved, unsellable`,
    [m.variantId, dOn, dRes, dUns],
  );
  if (!row) {
    const v = await tx.one<{
      sku: string;
      name: string;
      on_hand: number;
      reserved: number;
      unsellable: number;
    }>(
      `select v.sku, p.name, v.on_hand, v.reserved, v.unsellable from variants v join products p on p.id = v.product_id where v.id = $1`,
      [m.variantId],
    );
    if (!v) return fail("not_found", "Article introuvable.");
    const available = v.on_hand - v.reserved - v.unsellable;
    return fail(
      "stock",
      `Stock insuffisant pour ${v.name} (réf. ${v.sku}) : ${Math.max(0, available)} disponible(s) à la vente.`,
    );
  }
  await tx.query(
    `insert into stock_movements (id, variant_id, kind, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
                                  reason, order_id, batch_id, user_id, unsellable_delta, unsellable_after)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      newId(),
      m.variantId,
      m.kind,
      dOn,
      dRes,
      row.on_hand,
      row.reserved,
      m.reason ?? "",
      m.orderId ?? null,
      m.batchId ?? null,
      m.userId ?? null,
      dUns,
      row.unsellable,
    ],
  );
  return row;
}

export interface StockRow {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string;
  sku: string;
  options: Record<string, string>;
  on_hand: number;
  reserved: number;
  unsellable: number;
  available: number;
  threshold: number;
  low: boolean;
  is_demo: boolean;
  status: string;
}

export async function stockList(db: Db, opts: { q?: string; low?: boolean; defaultThreshold: number }) {
  const params: unknown[] = [opts.defaultThreshold];
  let where = "v.active and p.status <> 'archived'";
  if (opts.q) {
    params.push(`%${opts.q.trim()}%`);
    where += ` and (p.name ilike $2 or v.sku ilike $2 or p.brand ilike $2)`;
  }
  const rows = await db.query<StockRow>(
    `select v.id as variant_id, p.id as product_id, p.name as product_name, p.brand, v.sku, v.options,
            v.on_hand, v.reserved, v.unsellable, (v.on_hand - v.reserved - v.unsellable) as available,
            coalesce(v.low_stock_threshold, $1)::int as threshold,
            (v.on_hand - v.reserved - v.unsellable) <= coalesce(v.low_stock_threshold, $1) as low,
            p.is_demo, p.status
       from variants v join products p on p.id = v.product_id
      where ${where}
      order by ((v.on_hand - v.reserved - v.unsellable) <= coalesce(v.low_stock_threshold, $1)) desc, p.name, v.position`,
    params,
  );
  return opts.low ? rows.filter((r) => r.low) : rows;
}

/** Variantes publiées en stock faible (indicateur : produits d'exemple exclus sauf demande). */
export async function lowStockCount(db: Db, defaultThreshold: number, opts: { includeDemo?: boolean } = {}) {
  const r = await db.one<{ n: number }>(
    `select count(*)::int as n from variants v join products p on p.id = v.product_id
      where v.active and p.status = 'published' and (v.on_hand - v.reserved - v.unsellable) <= coalesce(v.low_stock_threshold, $1)
        ${opts.includeDemo ? "" : "and not p.is_demo"}`,
    [defaultThreshold],
  );
  return r?.n ?? 0;
}

export interface BatchLine {
  variantId: string;
  quantity: number;
}

/** Réapprovisionnement par lot : un seul enregistrement, plusieurs articles. */
export async function restock(
  db: Db,
  input: {
    lines: BatchLine[];
    reference: string;
    supplier: string;
    note: string;
    userId: string;
    isDemo?: boolean;
  },
) {
  const lines = input.lines.filter((l) => l.quantity !== 0);
  if (!lines.length) fail("validation", "Indiquez au moins une quantité reçue.");
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1)
      fail("validation", "Les quantités reçues doivent être des nombres entiers positifs.");
  }
  return db.tx(async (tx) => {
    const batchId = newId();
    await tx.query(
      "insert into stock_batches (id, kind, reference, supplier, note, user_id, is_demo) values ($1,'restock',$2,$3,$4,$5,$6)",
      [batchId, input.reference, input.supplier, input.note, input.userId, !!input.isDemo],
    );
    for (const l of lines) {
      await applyMovement(tx, {
        variantId: l.variantId,
        kind: "restock",
        onHandDelta: l.quantity,
        reason:
          [input.reference && `Lot ${input.reference}`, input.supplier && `Fournisseur : ${input.supplier}`, input.note]
            .filter(Boolean)
            .join(" · ") || "Réapprovisionnement",
        batchId,
        userId: input.userId,
      });
    }
    return batchId;
  });
}

/** Aperçu d'inventaire : écarts entre stock compté et stock enregistré. */
export async function inventoryPreview(db: Db, counts: { variantId: string; counted: number }[]) {
  if (!counts.length) return [];
  const rows = await db.query<{
    id: string;
    sku: string;
    name: string;
    on_hand: number;
    reserved: number;
  }>(
    `select v.id, v.sku, p.name, v.on_hand, v.reserved from variants v join products p on p.id = v.product_id where v.id = any($1)`,
    [counts.map((c) => c.variantId)],
  );
  return counts
    .map((c) => {
      const r = rows.find((x) => x.id === c.variantId);
      if (!r) return null;
      return {
        variantId: r.id,
        sku: r.sku,
        name: r.name,
        recorded: r.on_hand,
        reserved: r.reserved,
        counted: c.counted,
        delta: c.counted - r.on_hand,
        problem:
          c.counted < r.reserved ? `Compté ${c.counted}, mais ${r.reserved} réservé(s) pour des commandes.` : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export async function applyInventory(
  db: Db,
  input: {
    counts: { variantId: string; counted: number }[];
    note: string;
    userId: string;
  },
) {
  for (const c of input.counts) {
    if (!Number.isInteger(c.counted) || c.counted < 0)
      fail("validation", "Les quantités comptées doivent être des entiers positifs ou nuls.");
  }
  return db.tx(async (tx) => {
    const batchId = newId();
    await tx.query("insert into stock_batches (id, kind, note, user_id) values ($1,'inventory',$2,$3)", [
      batchId,
      input.note,
      input.userId,
    ]);
    let changed = 0;
    for (const c of input.counts) {
      const v = await tx.one<{
        on_hand: number;
        reserved: number;
        unsellable: number;
        sku: string;
      }>("select on_hand, reserved, unsellable, sku from variants where id = $1 for update", [c.variantId]);
      if (!v) continue;
      if (c.counted < v.reserved + v.unsellable) {
        fail(
          "stock",
          `Réf. ${v.sku} : ${c.counted} compté(s) pour ${v.reserved} réservé(s) et ${v.unsellable} non vendable(s). Ajustez d'abord les commandes ou le stock non vendable.`,
        );
      }
      const delta = c.counted - v.on_hand;
      if (delta === 0) continue;
      changed++;
      await applyMovement(tx, {
        variantId: c.variantId,
        kind: "inventory",
        onHandDelta: delta,
        reason: `Inventaire : ${v.on_hand} → ${c.counted}${input.note ? ` · ${input.note}` : ""}`,
        batchId,
        userId: input.userId,
      });
    }
    return { batchId, changed };
  });
}

export async function adjustStock(db: Db, input: { variantId: string; delta: number; reason: string; userId: string }) {
  if (!input.reason.trim())
    fail("validation", "Le motif est obligatoire pour un ajustement.", {
      reason: "Obligatoire.",
    });
  if (!Number.isInteger(input.delta) || input.delta === 0)
    fail("validation", "Indiquez une variation entière non nulle.");
  return db.tx((tx) =>
    applyMovement(tx, {
      variantId: input.variantId,
      kind: "adjustment",
      onHandDelta: input.delta,
      reason: input.reason.trim(),
      userId: input.userId,
    }),
  );
}

/**
 * Stock non vendable : abîmé, en contrôle, pièce d'exposition…
 * - « unsellable » : n unités disponibles passent en non vendable (physique inchangé) ;
 * - « sellable » : n unités non vendables reviennent en vente ;
 * - « writeoff » : n unités non vendables quittent le stock (physique − n).
 */
export async function moveUnsellable(
  db: Db,
  input: {
    variantId: string;
    action: "unsellable" | "sellable" | "writeoff";
    quantity: number;
    reason: string;
    userId: string;
  },
) {
  if (!input.reason.trim()) fail("validation", "Le motif est obligatoire.", { reason: "Obligatoire." });
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    fail("validation", "Indiquez une quantité entière positive.", { quantity: "Quantité invalide." });
  }
  const q = input.quantity;
  return db.tx(async (tx) => {
    if (input.action !== "unsellable") {
      const v = await tx.one<{ unsellable: number }>("select unsellable from variants where id = $1", [
        input.variantId,
      ]);
      if (!v) fail("not_found", "Article introuvable.");
      if (v!.unsellable < q) fail("stock", `Seulement ${v!.unsellable} unité(s) non vendable(s) pour cet article.`);
    }
    return applyMovement(tx, {
      variantId: input.variantId,
      kind: input.action,
      onHandDelta: input.action === "writeoff" ? -q : 0,
      unsellableDelta: input.action === "unsellable" ? q : -q,
      reason: input.reason.trim(),
      userId: input.userId,
    });
  });
}

export async function movements(db: Db, opts: { variantId?: string; kind?: string; limit?: number } = {}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.variantId) {
    params.push(opts.variantId);
    where.push(`m.variant_id = $${params.length}`);
  }
  if (opts.kind) {
    params.push(opts.kind);
    where.push(`m.kind = $${params.length}`);
  }
  params.push(opts.limit ?? 200);
  return db.query<{
    id: string;
    kind: MovementKind;
    on_hand_delta: number;
    reserved_delta: number;
    on_hand_after: number;
    reserved_after: number;
    reason: string;
    created_at: Date;
    sku: string;
    product_name: string;
    user_name: string | null;
    order_id: string | null;
    order_reference: string | null;
  }>(
    `select m.*, v.sku, p.name as product_name, u.name as user_name, o.reference as order_reference
       from stock_movements m
       join variants v on v.id = m.variant_id join products p on p.id = v.product_id
       left join users u on u.id = m.user_id left join orders o on o.id = m.order_id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by m.created_at desc limit $${params.length}`,
    params,
  );
}
