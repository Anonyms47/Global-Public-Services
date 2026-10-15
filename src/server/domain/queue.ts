import type { Db } from "../db/client";
import { fail, newId } from "./errors";
import { listOrders } from "./orders";
import { fcfa } from "@/lib/format";

/**
 * File GPS : une boîte de réception unique pour le travail du jour.
 * Les éléments dérivés viennent des commandes et du stock ; leur clé contient
 * l'état qui les a fait naître, donc un élément résolu revient si la situation
 * change (nouveau solde, nouveau seuil…). Les éléments manuels sont libres.
 */
export type QueueKind =
  "request" | "prepare" | "pickup" | "delivery" | "balance" | "refund" | "fee" | "stock" | "manual";

export const queueKindLabels: Record<QueueKind, string> = {
  request: "Demande WhatsApp",
  prepare: "À préparer",
  pickup: "Retrait",
  delivery: "Livraison",
  balance: "Solde",
  refund: "À rembourser",
  fee: "Frais à confirmer",
  stock: "Stock faible",
  manual: "Tâche",
};

export interface QueueItem {
  key: string;
  kind: QueueKind;
  title: string;
  detail: string;
  href: string;
  at: Date;
  /** 1 = urgent, 3 = quand possible */
  priority: 1 | 2 | 3;
  assignee_id: string | null;
  assignee_name: string | null;
  note: string;
  snoozed_until: Date | null;
  resolved_at: Date | null;
}

type Derived = Omit<QueueItem, "assignee_id" | "assignee_name" | "note" | "snoozed_until" | "resolved_at">;

export async function derivedItems(db: Db, lowThreshold: number): Promise<Derived[]> {
  const [open, low] = await Promise.all([
    listOrders(db, { limit: 500 }).then((r) => r.filter((o) => o.status !== "cancelled")),
    db.query<{ id: string; name: string; sku: string; product_id: string; available: number }>(
      `select v.id, p.name, v.sku, p.id as product_id, (v.on_hand - v.reserved - v.unsellable)::int as available
         from variants v join products p on p.id = v.product_id
        where v.active and p.status = 'published' and (v.on_hand - v.reserved - v.unsellable) <= coalesce(v.low_stock_threshold, $1)
        order by available, p.name`,
      [lowThreshold],
    ),
  ]);
  const out: Derived[] = [];
  const requests = await db.query<{
    id: string;
    reference: string;
    customer_name: string;
    subtotal: number;
    created_at: Date;
  }>(
    "select id, reference, customer_name, subtotal, created_at from order_requests where status = 'new' order by created_at",
  );
  for (const r of requests) {
    out.push({
      key: `request:${r.id}`,
      kind: "request",
      title: `Répondre à la demande ${r.reference}`,
      detail: `${r.customer_name} · ${fcfa(r.subtotal)}`,
      href: `/comptoir/demandes#${r.reference}`,
      at: r.created_at,
      priority: 1,
    });
  }
  for (const o of open) {
    const who = o.customer_name || "Vente au comptoir";
    const href = `/comptoir/commandes/${o.id}`;
    if (o.status === "confirmed") {
      if (o.fulfillment === "to_prepare") {
        out.push({
          key: `order:${o.id}:prepare`,
          kind: "prepare",
          title: `Préparer ${o.reference}`,
          detail: `${who} · ${o.item_count} article${o.item_count > 1 ? "s" : ""}`,
          href,
          at: o.created_at,
          priority: 1,
        });
      } else if (o.fulfillment === "ready" && o.reception === "pickup") {
        out.push({
          key: `order:${o.id}:pickup`,
          kind: "pickup",
          title: `Remettre ${o.reference}`,
          detail: `${who} · prête au comptoir`,
          href,
          at: o.created_at,
          priority: 2,
        });
      } else if (o.reception === "delivery" && (o.fulfillment === "ready" || o.fulfillment === "out_for_delivery")) {
        out.push({
          key: `order:${o.id}:delivery:${o.fulfillment}`,
          kind: "delivery",
          title: `${o.fulfillment === "ready" ? "Expédier" : "Suivre la livraison"} ${o.reference}`,
          detail: who,
          href,
          at: o.created_at,
          priority: 2,
        });
      }
      if (o.reception === "delivery" && o.feeUnknown) {
        out.push({
          key: `order:${o.id}:fee`,
          kind: "fee",
          title: `Confirmer les frais de ${o.reference}`,
          detail: who,
          href,
          at: o.created_at,
          priority: 2,
        });
      }
    }
    if (o.balance > 0) {
      out.push({
        key: `order:${o.id}:balance:${o.balance}`,
        kind: "balance",
        title: `Encaisser ${fcfa(o.balance)}`,
        detail: `${o.reference} · ${who}`,
        href,
        at: o.created_at,
        priority: o.status === "completed" ? 1 : 3,
      });
    } else if (o.balance < 0) {
      out.push({
        key: `order:${o.id}:refund:${-o.balance}`,
        kind: "refund",
        title: `Rembourser ${fcfa(-o.balance)}`,
        detail: `${o.reference} · ${who}`,
        href,
        at: o.created_at,
        priority: 1,
      });
    }
  }
  for (const v of low) {
    out.push({
      key: `stock:${v.id}:${v.available}`,
      kind: "stock",
      title: v.available <= 0 ? `Rupture : ${v.name}` : `Stock faible : ${v.name}`,
      detail: `${v.sku} · ${v.available} disponible${v.available > 1 ? "s" : ""}`,
      href: `/comptoir/catalogue/${v.product_id}`,
      at: new Date(0),
      priority: v.available <= 0 ? 2 : 3,
    });
  }
  return out;
}

export type QueueView = "a-faire" | "moi" | "reportees" | "resolues";

export async function listQueue(db: Db, opts: { view: QueueView; userId: string; lowThreshold: number; now?: Date }) {
  const now = opts.now ?? new Date();
  const [derived, states] = await Promise.all([
    derivedItems(db, opts.lowThreshold),
    db.query<{
      key: string;
      kind: QueueKind;
      title: string;
      href: string;
      note: string;
      assignee_id: string | null;
      assignee_name: string | null;
      snoozed_until: Date | null;
      resolved_at: Date | null;
      created_at: Date;
    }>(
      `select q.key, q.kind, q.title, q.href, q.note, q.assignee_id, u.name as assignee_name, q.snoozed_until, q.resolved_at, q.created_at
         from queue_items q left join users u on u.id = q.assignee_id`,
    ),
  ]);
  const byKey = new Map(states.map((s) => [s.key, s]));
  const items: QueueItem[] = derived.map((d) => {
    const s = byKey.get(d.key);
    return {
      ...d,
      assignee_id: s?.assignee_id ?? null,
      assignee_name: s?.assignee_name ?? null,
      note: s?.note ?? "",
      snoozed_until: s?.snoozed_until ?? null,
      resolved_at: s?.resolved_at ?? null,
    };
  });
  for (const s of states) {
    if (s.kind !== "manual") continue;
    items.push({
      key: s.key,
      kind: "manual",
      title: s.title,
      detail: "",
      href: s.href,
      at: s.created_at,
      priority: 2,
      assignee_id: s.assignee_id,
      assignee_name: s.assignee_name,
      note: s.note,
      snoozed_until: s.snoozed_until,
      resolved_at: s.resolved_at,
    });
  }
  const snoozed = (i: QueueItem) => !!i.snoozed_until && new Date(i.snoozed_until) > now;
  const active = (i: QueueItem) => !i.resolved_at && !snoozed(i);
  const filtered =
    opts.view === "resolues"
      ? items.filter((i) => i.resolved_at)
      : opts.view === "reportees"
        ? items.filter((i) => !i.resolved_at && snoozed(i))
        : opts.view === "moi"
          ? items.filter((i) => active(i) && i.assignee_id === opts.userId)
          : items.filter(active);
  filtered.sort((a, b) => a.priority - b.priority || new Date(a.at).getTime() - new Date(b.at).getTime());
  return {
    items: opts.view === "resolues" ? filtered.slice(0, 100) : filtered,
    counts: {
      "a-faire": items.filter(active).length,
      moi: items.filter((i) => active(i) && i.assignee_id === opts.userId).length,
      reportees: items.filter((i) => !i.resolved_at && snoozed(i)).length,
      resolues: items.filter((i) => i.resolved_at).length,
    },
  };
}

type Actor = { id: string; is_demo: boolean };

async function ensureRow(db: Db, actor: Actor, key: string, lowThreshold: number) {
  const exists = await db.one("select 1 from queue_items where key = $1", [key]);
  if (exists) return;
  if (key.startsWith("manual:")) fail("not_found", "Tâche introuvable.");
  const d = (await derivedItems(db, lowThreshold)).find((x) => x.key === key);
  if (!d) fail("not_found", "Cet élément n'est plus d'actualité : la file a été mise à jour.");
  await db.query(
    "insert into queue_items (key, kind, title, href, created_by, is_demo) values ($1, $2, $3, $4, $5, $6) on conflict (key) do nothing",
    [key, d!.kind, d!.title, d!.href, actor.id, actor.is_demo],
  );
}

export async function updateQueueItem(
  db: Db,
  actor: Actor,
  key: string,
  change:
    | { action: "assign"; userId: string | null }
    | { action: "note"; note: string }
    | { action: "snooze"; until: Date }
    | { action: "resolve" }
    | { action: "reopen" },
  lowThreshold: number,
) {
  return db.tx(async (tx) => {
    await ensureRow(tx, actor, key, lowThreshold);
    switch (change.action) {
      case "assign":
        if (change.userId && !(await tx.one("select 1 from users where id = $1 and active", [change.userId]))) {
          fail("validation", "Membre de l'équipe introuvable.");
        }
        await tx.query("update queue_items set assignee_id = $2, updated_at = now() where key = $1", [
          key,
          change.userId,
        ]);
        break;
      case "note":
        await tx.query("update queue_items set note = $2, updated_at = now() where key = $1", [
          key,
          change.note.slice(0, 1000),
        ]);
        break;
      case "snooze":
        if (!(change.until.getTime() > Date.now())) fail("validation", "Choisissez une date à venir.");
        await tx.query("update queue_items set snoozed_until = $2, updated_at = now() where key = $1", [
          key,
          change.until,
        ]);
        break;
      case "resolve":
        await tx.query(
          "update queue_items set resolved_at = now(), resolved_by = $2, updated_at = now() where key = $1",
          [key, actor.id],
        );
        break;
      case "reopen":
        await tx.query(
          "update queue_items set resolved_at = null, resolved_by = null, snoozed_until = null, updated_at = now() where key = $1",
          [key],
        );
        break;
    }
  });
}

export async function addManualTask(
  db: Db,
  actor: Actor,
  input: { title: string; note?: string; assigneeId?: string | null },
) {
  const title = input.title.trim();
  if (!title) fail("validation", "Indiquez la tâche.", { title: "Obligatoire." });
  const key = `manual:${newId()}`;
  await db.query(
    "insert into queue_items (key, kind, title, note, assignee_id, created_by, is_demo) values ($1, 'manual', $2, $3, $4, $5, $6)",
    [key, title.slice(0, 200), (input.note ?? "").slice(0, 1000), input.assigneeId || null, actor.id, actor.is_demo],
  );
  return key;
}
