import type { Db } from "../db/client";

export type HealthStatus = "ok" | "warn" | "error" | "info";

export interface HealthCheck {
  key: string;
  label: string;
  status: HealthStatus;
  value: string;
  detail: string;
}

const EXPECTED_TABLES = [
  "settings",
  "users",
  "sessions",
  "categories",
  "products",
  "media",
  "product_images",
  "variants",
  "promotions",
  "customers",
  "orders",
  "order_lines",
  "payments",
  "stock_batches",
  "stock_movements",
  "order_events",
  "services",
  "queue_items",
  "order_requests",
  "audit_log",
];

/**
 * Santé du Comptoir : contrôles en lecture seule, sans effet de bord.
 * Ne renvoie jamais de secret (adresse de base, mots de passe, jetons).
 */
export async function healthChecks(
  db: Db,
  env: { demoMode: boolean; indexable: boolean; protectedDemo: boolean; postgres: boolean; region: string },
): Promise<HealthCheck[]> {
  const t0 = performance.now();
  await db.query("select 1");
  const latency = Math.round(performance.now() - t0);

  const [tables, overReserved, reserveDrift, toRefund, unpaidDone, broken, counts, last] = await Promise.all([
    db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = current_schema() and table_name = any($1)",
      [EXPECTED_TABLES],
    ),
    db.one<{ n: number }>(
      "select count(*)::int as n from variants where reserved + unsellable > on_hand or on_hand < 0",
    ),
    db.one<{ n: number }>(
      `select count(*)::int as n from variants v
        where v.reserved <> coalesce((select sum(l.quantity) from order_lines l join orders o on o.id = l.order_id
                                       where l.variant_id = v.id and o.status = 'confirmed'), 0)`,
    ),
    db.one<{ n: number }>(
      `select count(*)::int as n from orders o where o.status <> 'cancelled' and
         coalesce((select sum(case when p.kind = 'payment' then p.amount when p.kind = 'reversal' then -p.amount else -p.amount end) from payments p where p.order_id = o.id), 0)
         > o.subtotal - coalesce((select sum(l.returned_quantity * l.unit_price) from order_lines l where l.order_id = o.id), 0) + coalesce(o.delivery_fee, 0)`,
    ),
    db.one<{ n: number }>(
      `select count(*)::int as n from orders o where o.status = 'completed' and
         coalesce((select sum(case when p.kind = 'payment' then p.amount when p.kind = 'reversal' then -p.amount else -p.amount end) from payments p where p.order_id = o.id), 0)
         < o.subtotal - coalesce((select sum(l.returned_quantity * l.unit_price) from order_lines l where l.order_id = o.id), 0) + coalesce(o.delivery_fee, 0)`,
    ),
    db.one<{ no_variant: number; no_image: number }>(
      `select count(*) filter (where not exists (select 1 from variants v where v.product_id = p.id and v.active))::int as no_variant,
              count(*) filter (where not exists (select 1 from product_images i where i.product_id = p.id))::int as no_image
         from products p where p.status = 'published'`,
    ),
    db.one<{
      products: number;
      orders: number;
      customers: number;
      users: number;
      sessions: number;
      demo: number;
      media: number;
    }>(
      `select (select count(*) from products)::int as products, (select count(*) from orders)::int as orders,
              (select count(*) from customers)::int as customers, (select count(*) from users where active)::int as users,
              (select count(*) from sessions where expires_at > now())::int as sessions,
              (select count(*) from products where is_demo)::int as demo,
              (select count(*) from media)::int as media`,
    ),
    db.one<{ order_at: Date | null; payment_at: Date | null }>(
      "select (select max(created_at) from orders) as order_at, (select max(created_at) from payments) as payment_at",
    ),
  ]);
  const missing = EXPECTED_TABLES.filter((t) => !tables.some((r) => r.table_name === t));
  const n = (x: { n: number } | null) => x?.n ?? 0;
  const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleString("fr-FR", { timeZone: "Africa/Dakar" }) : "—");

  return [
    {
      key: "db",
      label: "Base de données",
      status: latency > 800 ? "warn" : "ok",
      value: `${latency} ms`,
      detail: `${env.postgres ? "PostgreSQL" : "PGlite (démonstration locale)"} · temps de réponse d'une requête simple.`,
    },
    {
      key: "schema",
      label: "Schéma",
      status: missing.length ? "error" : "ok",
      value: `${EXPECTED_TABLES.length - missing.length}/${EXPECTED_TABLES.length} tables`,
      detail: missing.length
        ? `Tables manquantes : ${missing.join(", ")}.`
        : "Toutes les tables attendues sont présentes.",
    },
    {
      key: "stock",
      label: "Cohérence du stock",
      status: n(overReserved) ? "error" : n(reserveDrift) ? "warn" : "ok",
      value: n(overReserved) + n(reserveDrift) ? `${n(overReserved) + n(reserveDrift)} écart(s)` : "Aucun écart",
      detail:
        "Réservé + non vendable ≤ physique pour chaque variante, et réservé = quantités des commandes confirmées non remises." +
        (n(reserveDrift) ? ` ${n(reserveDrift)} variante(s) à contrôler (inventaire).` : ""),
    },
    {
      key: "refunds",
      label: "Trop-perçus",
      status: n(toRefund) ? "warn" : "ok",
      value: `${n(toRefund)} commande(s)`,
      detail: "Commandes où l'encaissé dépasse le montant dû : remboursement à faire.",
    },
    {
      key: "unpaid",
      label: "Remises non soldées",
      status: n(unpaidDone) ? "warn" : "ok",
      value: `${n(unpaidDone)} commande(s)`,
      detail: "Commandes remises au client avec un solde restant.",
    },
    {
      key: "catalog",
      label: "Fiches publiées incomplètes",
      status: broken?.no_variant ? "error" : broken?.no_image ? "warn" : "ok",
      value: `${broken?.no_variant ?? 0} sans variante · ${broken?.no_image ?? 0} sans photo`,
      detail: "Un produit publié doit avoir au moins une variante active et une photo.",
    },
    {
      key: "volume",
      label: "Volumes",
      status: "info",
      value: `${counts?.products ?? 0} produits · ${counts?.orders ?? 0} commandes`,
      detail: `${counts?.customers ?? 0} clients · ${counts?.users ?? 0} comptes actifs · ${counts?.sessions ?? 0} session(s) ouverte(s) · ${counts?.media ?? 0} fichier(s) en médiathèque.`,
    },
    {
      key: "activity",
      label: "Dernière activité",
      status: "info",
      value: fmtDate(last?.order_at ?? null),
      detail: `Dernière commande ; dernier encaissement : ${fmtDate(last?.payment_at ?? null)} (heure de Dakar).`,
    },
    {
      key: "mode",
      label: "Mode du serveur",
      status: env.demoMode ? "info" : "ok",
      value: env.demoMode ? "Démonstration" : env.indexable ? "Ouvert" : "Test privé",
      detail: `DEMO_MODE=${env.demoMode} · SITE_INDEXABLE=${env.indexable} · démonstration ${env.protectedDemo ? "protégée" : "libre"} · ${counts?.demo ?? 0} produit(s) d'exemple${env.region ? ` · région ${env.region}` : ""}.`,
    },
  ];
}
