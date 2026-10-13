import type { Db } from "../db/client";
import { listOrders } from "./orders";

export interface Period {
  from: Date;
  to: Date;
  label: string;
}

export function periodFromKey(
  key: string | undefined,
  now = new Date(),
  custom?: { from?: string; to?: string },
): Period & { key: string } {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86400_000);
  switch (key) {
    case "7j":
      return {
        key,
        from: new Date(today.getTime() - 6 * 86400_000),
        to: tomorrow,
        label: "7 derniers jours",
      };
    case "30j":
      return {
        key,
        from: new Date(today.getTime() - 29 * 86400_000),
        to: tomorrow,
        label: "30 derniers jours",
      };
    case "mois":
      return {
        key,
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: tomorrow,
        label: "Ce mois-ci",
      };
    case "perso": {
      const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : today;
      const toDay = custom?.to ? new Date(`${custom.to}T00:00:00`) : today;
      if (
        !Number.isNaN(from.getTime()) &&
        !Number.isNaN(toDay.getTime()) &&
        toDay >= from
      ) {
        return {
          key,
          from,
          to: new Date(toDay.getTime() + 86400_000),
          label: "Période personnalisée",
        };
      }
      return { key: "jour", from: today, to: tomorrow, label: "Aujourd'hui" };
    }
    default:
      return { key: "jour", from: today, to: tomorrow, label: "Aujourd'hui" };
  }
}

/**
 * Indicateurs de la période. Les ventes enregistrées (valeur des commandes
 * confirmées), les encaissements (argent reçu) et les soldes restants sont
 * distincts. Les transferts d'argent ne sont pas comptés ici.
 */
export async function report(
  db: Db,
  period: Period,
  opts: { withMargin: boolean },
) {
  const sales = await db.one<{
    n: number;
    amount: number;
    fees: number;
    returned: number;
  }>(
    `select count(*)::int as n, coalesce(sum(subtotal), 0)::int as amount, coalesce(sum(delivery_fee), 0)::int as fees,
            coalesce(sum((select sum(l.returned_quantity * l.unit_price) from order_lines l where l.order_id = o.id)), 0)::int as returned
       from orders o where status <> 'cancelled' and created_at >= $1 and created_at < $2`,
    [period.from, period.to],
  );
  const cashflow = await db.query<{
    kind: string;
    method: string;
    total: number;
    n: number;
  }>(
    `select kind, method, sum(amount)::int as total, count(*)::int as n from payments
      where created_at >= $1 and created_at < $2 group by kind, method order by kind, method`,
    [period.from, period.to],
  );
  const sum = (k: string) =>
    cashflow.filter((c) => c.kind === k).reduce((s, c) => s + c.total, 0);
  const encaissements = sum("payment") - sum("reversal");
  const remboursements = sum("refund");

  const best = await db.query<{
    name: string;
    sku: string;
    quantity: number;
    amount: number;
  }>(
    `select l.name, l.sku, sum(l.quantity - l.returned_quantity)::int as quantity,
            sum((l.quantity - l.returned_quantity) * l.unit_price)::int as amount
       from order_lines l join orders o on o.id = l.order_id
      where o.status <> 'cancelled' and o.created_at >= $1 and o.created_at < $2
      group by l.name, l.sku having sum(l.quantity - l.returned_quantity) > 0
      order by amount desc limit 8`,
    [period.from, period.to],
  );

  const operations = await db.query<{
    at: Date;
    kind: string;
    reference: string;
    order_id: string;
    amount: number;
    detail: string;
  }>(
    `select o.created_at as at, 'vente' as kind, o.reference, o.id as order_id, o.subtotal as amount, o.customer_name as detail
       from orders o where o.status <> 'cancelled' and o.created_at >= $1 and o.created_at < $2
     union all
     select p.created_at, p.kind, o.reference, o.id, p.amount, p.method
       from payments p join orders o on o.id = p.order_id where p.created_at >= $1 and p.created_at < $2
     order by at desc limit 100`,
    [period.from, period.to],
  );

  const open = await listOrders(db, { view: "solde", limit: 1000 });
  const soldes = open.reduce((s, o) => s + o.balance, 0);

  let margin:
    | { available: false; reason: string }
    | { available: true; value: number; revenue: number; method: string } = {
    available: false,
    reason: "Réservée au propriétaire.",
  };
  if (opts.withMargin) {
    const m = await db.one<{
      lines: number;
      missing: number;
      revenue: number;
      cost: number;
    }>(
      `select count(*)::int as lines, count(*) filter (where l.cost_price is null)::int as missing,
              coalesce(sum((l.quantity - l.returned_quantity) * l.unit_price), 0)::int as revenue,
              coalesce(sum((l.quantity - l.returned_quantity) * l.cost_price), 0)::int as cost
         from order_lines l join orders o on o.id = l.order_id
        where o.status <> 'cancelled' and o.created_at >= $1 and o.created_at < $2`,
      [period.from, period.to],
    );
    if (!m || m.lines === 0)
      margin = { available: false, reason: "Aucune vente sur la période." };
    else if (m.missing > 0) {
      margin = {
        available: false,
        reason: `Coût d'achat non renseigné pour ${m.missing} ligne(s) sur ${m.lines} : la marge n'est pas calculée.`,
      };
    } else {
      margin = {
        available: true,
        value: m.revenue - m.cost,
        revenue: m.revenue,
        method:
          "Marge brute = prix de vente enregistré − coût d'achat renseigné au moment de la vente, hors frais de livraison, retours déduits. Hors charges, taxes et frais généraux.",
      };
    }
  }

  return {
    sales: {
      count: sales?.n ?? 0,
      amount: (sales?.amount ?? 0) - (sales?.returned ?? 0),
      fees: sales?.fees ?? 0,
      returned: sales?.returned ?? 0,
    },
    encaissements,
    remboursements,
    cashflow,
    soldes,
    openBalances: open.slice(0, 20),
    best,
    operations,
    margin,
  };
}
