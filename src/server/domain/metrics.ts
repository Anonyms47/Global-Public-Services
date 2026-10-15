import type { Db } from "../db/client";
import { money, summarySelect, type OrderSummary } from "./orders";
import type { Period } from "./reports";

/**
 * Indicateurs du tableau de bord : une seule source de calcul, documentée.
 * Toutes les sommes sont en FCFA entiers. Les périodes sont des intervalles
 * [début, fin[ ; Dakar vit à l'heure UTC toute l'année (Africa/Dakar, sans
 * heure d'été), ce qui correspond à l'horloge des serveurs.
 * Les transferts d'argent ne sont jamais comptés : leurs fonds sont séparés.
 */
export const metricDefs = {
  ca: {
    label: "Chiffre d'affaires",
    finance: true,
    formula:
      "Somme des sous-totaux des commandes et ventes non annulées créées sur la période, moins la valeur des articles retournés. Hors frais de livraison.",
  },
  montant: {
    label: "Montant des commandes",
    finance: true,
    formula:
      "Sous-totaux des commandes non annulées créées sur la période, plus les frais de livraison connus (frais « à confirmer » comptés zéro), moins les retours.",
  },
  encaissements: {
    label: "Encaissements",
    finance: true,
    formula:
      "Paiements reçus sur la période, moins les corrections d'encaissement de la période. Les remboursements sont comptés à part.",
  },
  reste: {
    label: "Reste à encaisser",
    finance: true,
    formula:
      "Pour les commandes non annulées créées sur la période : montant dû (sous-total − retours + frais connus) − (encaissé − remboursé). Seuls les soldes positifs sont additionnés.",
  },
  commandes: {
    label: "Commandes",
    finance: false,
    formula: "Nombre de commandes et ventes au comptoir non annulées créées sur la période.",
  },
  finalisees: {
    label: "Ventes finalisées",
    finance: false,
    formula: "Commandes remises au client (statut « remise ») dont la remise a eu lieu sur la période.",
  },
  panier: {
    label: "Panier moyen",
    finance: true,
    formula: "Chiffre d'affaires ÷ nombre de commandes de la période, arrondi au franc. Non calculé sans commande.",
  },
  remboursements: {
    label: "Remboursements",
    finance: true,
    formula: "Somme des remboursements enregistrés sur la période, quelle que soit la date de la commande.",
  },
  annulees: {
    label: "Annulations",
    finance: false,
    formula: "Commandes annulées sur la période (date d'annulation).",
  },
} as const;

export type MetricKey = keyof typeof metricDefs;
export const metricKeys = Object.keys(metricDefs) as MetricKey[];

export interface Metrics {
  ca: number;
  montant: number;
  encaissements: number;
  reste: number;
  commandes: number;
  finalisees: number;
  panier: number | null;
  remboursements: number;
  annulees: number;
}

async function ordersCreatedIn(db: Db, period: Period) {
  const rows = await db.query<OrderSummary>(
    `${summarySelect} where o.created_at >= $1 and o.created_at < $2 order by o.created_at desc`,
    [period.from, period.to],
  );
  return rows.map((r) => ({ ...r, ...money(r) }));
}

async function paymentsIn(db: Db, period: Period) {
  return db.query<{
    id: string;
    order_id: string;
    reference: string;
    kind: "payment" | "refund" | "reversal";
    method: string;
    amount: number;
    created_at: Date;
  }>(
    `select p.id, p.order_id, o.reference, p.kind, p.method, p.amount, p.created_at
       from payments p join orders o on o.id = p.order_id
      where p.created_at >= $1 and p.created_at < $2 order by p.created_at desc`,
    [period.from, period.to],
  );
}

export async function computeMetrics(db: Db, period: Period): Promise<Metrics> {
  const [orders, payments, done, cancelled] = await Promise.all([
    ordersCreatedIn(db, period),
    paymentsIn(db, period),
    db.one<{ n: number }>(
      "select count(*)::int as n from orders where status = 'completed' and completed_at >= $1 and completed_at < $2",
      [period.from, period.to],
    ),
    db.one<{ n: number }>(
      "select count(*)::int as n from orders where status = 'cancelled' and cancelled_at >= $1 and cancelled_at < $2",
      [period.from, period.to],
    ),
  ]);
  const live = orders.filter((o) => o.status !== "cancelled");
  const ca = live.reduce((s, o) => s + o.subtotal - o.returned_value, 0);
  const sumKind = (k: string) => payments.filter((p) => p.kind === k).reduce((s, p) => s + p.amount, 0);
  return {
    ca,
    montant: live.reduce((s, o) => s + o.due, 0),
    encaissements: sumKind("payment") - sumKind("reversal"),
    reste: live.reduce((s, o) => s + Math.max(0, o.balance), 0),
    commandes: live.length,
    finalisees: done?.n ?? 0,
    panier: live.length ? Math.round(ca / live.length) : null,
    remboursements: sumKind("refund"),
    annulees: cancelled?.n ?? 0,
  };
}

/** Période de même durée, juste avant. */
export function previousPeriod(period: Period): Period {
  const span = period.to.getTime() - period.from.getTime();
  return { from: new Date(period.from.getTime() - span), to: period.from, label: "Période précédente" };
}

/** Évolution en % (null si la base est nulle). */
export function change(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

export type DetailRow = {
  at: Date;
  href: string;
  reference: string;
  label: string;
  amount: number | null;
};

/** Les opérations qui composent un indicateur. */
export async function metricDetail(db: Db, key: MetricKey, period: Period): Promise<DetailRow[]> {
  const orderRow = (o: Awaited<ReturnType<typeof ordersCreatedIn>>[number], amount: number | null): DetailRow => ({
    at: o.created_at,
    href: `/comptoir/commandes/${o.id}`,
    reference: o.reference,
    label: o.customer_name || "Vente au comptoir",
    amount,
  });
  if (["ca", "montant", "reste", "commandes", "panier"].includes(key)) {
    const live = (await ordersCreatedIn(db, period)).filter((o) => o.status !== "cancelled");
    if (key === "reste") return live.filter((o) => o.balance > 0).map((o) => orderRow(o, o.balance));
    if (key === "montant") return live.map((o) => orderRow(o, o.due));
    return live.map((o) => orderRow(o, o.subtotal - o.returned_value));
  }
  if (key === "finalisees" || key === "annulees") {
    const col = key === "finalisees" ? "completed_at" : "cancelled_at";
    const status = key === "finalisees" ? "completed" : "cancelled";
    const rows = await db.query<{ id: string; reference: string; customer_name: string; at: Date; subtotal: number }>(
      `select id, reference, customer_name, ${col} as at, subtotal from orders
        where status = $3 and ${col} >= $1 and ${col} < $2 order by ${col} desc`,
      [period.from, period.to, status],
    );
    return rows.map((r) => ({
      at: r.at,
      href: `/comptoir/commandes/${r.id}`,
      reference: r.reference,
      label: r.customer_name || "Vente au comptoir",
      amount: r.subtotal,
    }));
  }
  const payments = await paymentsIn(db, period);
  const kinds = key === "remboursements" ? ["refund"] : ["payment", "reversal"];
  return payments
    .filter((p) => kinds.includes(p.kind))
    .map((p) => ({
      at: p.created_at,
      href: `/comptoir/commandes/${p.order_id}`,
      reference: p.reference,
      label: p.kind === "reversal" ? "Correction d'encaissement" : p.kind === "refund" ? "Remboursement" : "Paiement",
      amount: p.kind === "reversal" ? -p.amount : p.amount,
    }));
}
