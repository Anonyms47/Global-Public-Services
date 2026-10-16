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

/**
 * Périmètre des indicateurs. Par défaut, les données de démonstration sont
 * exclues : une commande est « de démonstration » si elle est marquée comme
 * telle ou si elle contient un produit d'exemple. Ses paiements, remboursements
 * et lignes suivent la commande.
 */
export interface Scope {
  includeDemo: boolean;
}
export const realOnly: Scope = { includeDemo: false };

export const demoOrderSql = (alias = "o") =>
  `(${alias}.is_demo or exists (select 1 from order_lines dl join products dp on dp.id = dl.product_id
     where dl.order_id = ${alias}.id and dp.is_demo))`;

/** Condition SQL à ajouter (« and … ») pour respecter le périmètre. */
export const scopeSql = (scope: Scope, alias = "o") => (scope.includeDemo ? "" : ` and not ${demoOrderSql(alias)}`);

/** Lit le filtre « Inclure la démonstration » d'une adresse (?demo=1). Désactivé par défaut. */
export const scopeFromParam = (value: unknown): Scope => ({ includeDemo: value === "1" });

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

async function ordersCreatedIn(db: Db, period: Period, scope: Scope) {
  const rows = await db.query<OrderSummary>(
    `${summarySelect} where o.created_at >= $1 and o.created_at < $2${scopeSql(scope)} order by o.created_at desc`,
    [period.from, period.to],
  );
  return rows.map((r) => ({ ...r, ...money(r) }));
}

async function paymentsIn(db: Db, period: Period, scope: Scope) {
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
      where p.created_at >= $1 and p.created_at < $2${scopeSql(scope)} order by p.created_at desc`,
    [period.from, period.to],
  );
}

export async function computeMetrics(db: Db, period: Period, scope: Scope = realOnly): Promise<Metrics> {
  const [orders, payments, done, cancelled] = await Promise.all([
    ordersCreatedIn(db, period, scope),
    paymentsIn(db, period, scope),
    db.one<{ n: number }>(
      `select count(*)::int as n from orders o
        where o.status = 'completed' and o.completed_at >= $1 and o.completed_at < $2${scopeSql(scope)}`,
      [period.from, period.to],
    ),
    db.one<{ n: number }>(
      `select count(*)::int as n from orders o
        where o.status = 'cancelled' and o.cancelled_at >= $1 and o.cancelled_at < $2${scopeSql(scope)}`,
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
export async function metricDetail(
  db: Db,
  key: MetricKey,
  period: Period,
  scope: Scope = realOnly,
): Promise<DetailRow[]> {
  const orderRow = (o: Awaited<ReturnType<typeof ordersCreatedIn>>[number], amount: number | null): DetailRow => ({
    at: o.created_at,
    href: `/comptoir/commandes/${o.id}`,
    reference: o.reference,
    label: o.customer_name || "Vente au comptoir",
    amount,
  });
  if (["ca", "montant", "reste", "commandes", "panier"].includes(key)) {
    const live = (await ordersCreatedIn(db, period, scope)).filter((o) => o.status !== "cancelled");
    if (key === "reste") return live.filter((o) => o.balance > 0).map((o) => orderRow(o, o.balance));
    if (key === "montant") return live.map((o) => orderRow(o, o.due));
    return live.map((o) => orderRow(o, o.subtotal - o.returned_value));
  }
  if (key === "finalisees" || key === "annulees") {
    const col = key === "finalisees" ? "completed_at" : "cancelled_at";
    const status = key === "finalisees" ? "completed" : "cancelled";
    const rows = await db.query<{ id: string; reference: string; customer_name: string; at: Date }>(
      `select o.id, o.reference, o.customer_name, o.${col} as at from orders o
        where o.status = $3 and o.${col} >= $1 and o.${col} < $2${scopeSql(scope)} order by o.${col} desc`,
      [period.from, period.to, status],
    );
    // Indicateurs de nombre : pas de montant dans le détail.
    return rows.map((r) => ({
      at: r.at,
      href: `/comptoir/commandes/${r.id}`,
      reference: r.reference,
      label: r.customer_name || "Vente au comptoir",
      amount: null,
    }));
  }
  const payments = await paymentsIn(db, period, scope);
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

// ——— Marge brute (propriétaire) : détail par commande ———

export interface MarginRow {
  at: Date;
  href: string;
  reference: string;
  label: string;
  revenue: number;
  cost: number | null;
  margin: number | null;
  missing: number;
}

/**
 * Marge par commande non annulée créée sur la période : ventes (quantité −
 * retours) × prix enregistré, moins le coût d'achat enregistré à la vente.
 * Une ligne sans coût rend la marge de sa commande inconnue (null).
 */
export async function marginDetail(db: Db, period: Period, scope: Scope = realOnly): Promise<MarginRow[]> {
  const rows = await db.query<{
    id: string;
    reference: string;
    customer_name: string;
    created_at: Date;
    revenue: number;
    cost: number;
    missing: number;
  }>(
    `select o.id, o.reference, o.customer_name, o.created_at,
            coalesce(sum((l.quantity - l.returned_quantity) * l.unit_price), 0)::int as revenue,
            coalesce(sum((l.quantity - l.returned_quantity) * l.cost_price), 0)::int as cost,
            count(*) filter (where l.cost_price is null)::int as missing
       from orders o join order_lines l on l.order_id = o.id
      where o.status <> 'cancelled' and o.created_at >= $1 and o.created_at < $2${scopeSql(scope)}
      group by o.id order by o.created_at desc`,
    [period.from, period.to],
  );
  return rows.map((r) => ({
    at: r.created_at,
    href: `/comptoir/commandes/${r.id}`,
    reference: r.reference,
    label: r.customer_name || "Vente au comptoir",
    revenue: r.revenue,
    cost: r.missing ? null : r.cost,
    margin: r.missing ? null : r.revenue - r.cost,
    missing: r.missing,
  }));
}

// ——— Graphiques ———

export interface SeriesPoint {
  start: Date;
  label: string;
  ca: number;
  encaissements: number;
}

/**
 * Évolution sur la période, en tranches : par heure pour un jour, par jour
 * jusqu'à 92 jours, par semaine au-delà. Mêmes règles que les indicateurs :
 * la somme des tranches est égale au chiffre affiché.
 */
export async function metricSeries(db: Db, period: Period, scope: Scope = realOnly): Promise<SeriesPoint[]> {
  const span = period.to.getTime() - period.from.getTime();
  const step = span <= 2 * 86400_000 ? 3600_000 : span <= 92 * 86400_000 ? 86400_000 : 7 * 86400_000;
  const points: SeriesPoint[] = [];
  for (let t = period.from.getTime(); t < period.to.getTime(); t += step) {
    const d = new Date(t);
    const label =
      step === 3600_000
        ? `${String(d.getUTCHours()).padStart(2, "0")} h`
        : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Africa/Dakar" });
    points.push({ start: d, label, ca: 0, encaissements: 0 });
  }
  const at = (date: Date) => Math.floor((new Date(date).getTime() - period.from.getTime()) / step);
  const [orders, payments] = await Promise.all([ordersCreatedIn(db, period, scope), paymentsIn(db, period, scope)]);
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const i = at(o.created_at);
    if (points[i]) points[i].ca += o.subtotal - o.returned_value;
  }
  for (const p of payments) {
    const i = at(p.created_at);
    if (!points[i]) continue;
    if (p.kind === "payment") points[i].encaissements += p.amount;
    if (p.kind === "reversal") points[i].encaissements -= p.amount;
  }
  return points;
}

/** Encaissements nets de la période par moyen de paiement (corrections déduites). */
export async function paymentsByMethod(db: Db, period: Period, scope: Scope = realOnly) {
  const payments = await paymentsIn(db, period, scope);
  const by = new Map<string, number>();
  for (const p of payments) {
    if (p.kind === "refund") continue;
    by.set(p.method, (by.get(p.method) ?? 0) + (p.kind === "reversal" ? -p.amount : p.amount));
  }
  return [...by.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount);
}

/** Nombre de commandes de démonstration de la période (exclues ou incluses selon le périmètre). */
export async function demoOrdersIn(db: Db, period: Period) {
  const row = await db.one<{ n: number }>(
    `select count(*)::int as n from orders o where o.created_at >= $1 and o.created_at < $2 and ${demoOrderSql()}`,
    [period.from, period.to],
  );
  return row?.n ?? 0;
}
