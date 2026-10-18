import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { todayCounts } from "@/server/domain/orders";
import { lowStockCount } from "@/server/domain/stock";
import { getSettings } from "@/server/domain/settings";
import { periodFromKey } from "@/server/domain/reports";
import { computeMetrics } from "@/server/domain/metrics";
import { listQueue, queueKindLabels } from "@/server/domain/queue";
import { requestCounts } from "@/server/domain/requests";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Money, PageTitle, Panel } from "@/components/admin/ui";
import { IconArrowRight, IconBag, IconGrid, IconPlus, IconList } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Aujourd'hui" };

export default async function TodayPage() {
  const { db, user } = await requirePage();
  const settings = await getSettings(db);
  const finance = can(user, "dashboard.finance");
  const [counts, low, m, queue, requests] = await Promise.all([
    todayCounts(db),
    // Tâche opérationnelle : elle renvoie à la liste du stock, produits d'exemple compris.
    lowStockCount(db, settings.stock.defaultLowThreshold, { includeDemo: true }),
    computeMetrics(db, periodFromKey("jour")),
    listQueue(db, { view: "a-faire", userId: user.id, lowThreshold: settings.stock.defaultLowThreshold }),
    requestCounts(db),
  ]);

  const tasks = [
    {
      label: "Demandes WhatsApp à traiter",
      value: requests.new ?? 0,
      href: "/comptoir/demandes",
      tone: "red" as const,
    },
    {
      label: "Commandes à préparer",
      value: counts.to_prepare,
      href: "/comptoir/commandes?vue=a-preparer",
      tone: "red" as const,
    },
    {
      label: "Retraits et livraisons",
      value: counts.pickups_ready + counts.deliveries,
      href:
        counts.pickups_ready || !counts.deliveries
          ? "/comptoir/commandes?vue=retraits"
          : "/comptoir/commandes?vue=livraisons",
      tone: "blue" as const,
    },
    {
      label: "Stocks faibles",
      value: low,
      href: "/comptoir/stock?faible=1",
      tone: "warn" as const,
    },
  ];
  const shortcuts = [
    {
      href: "/comptoir/vente",
      label: "Nouvelle vente",
      icon: IconPlus,
      ok: can(user, "sales.quick"),
    },
    {
      href: "/comptoir/commandes/nouvelle",
      label: "Enregistrer une commande",
      icon: IconBag,
      ok: can(user, "orders.create"),
    },
    {
      href: "/comptoir/catalogue/nouveau",
      label: "Ajouter un produit",
      icon: IconGrid,
      ok: can(user, "catalog.edit"),
    },
    {
      href: "/comptoir/stock/reapprovisionner",
      label: "Réapprovisionner",
      icon: IconList,
      ok: can(user, "stock.restock"),
    },
  ].filter((s) => s.ok);

  return (
    <>
      <PageTitle eyebrow={formatDate(new Date())} title="Aujourd'hui">
        Bonjour {user.name.split(" ")[0]}. Les tâches en attente d&apos;abord, les chiffres ensuite.
      </PageTitle>

      <section aria-labelledby="titre-taches">
        <h2 id="titre-taches" className="sr-only">
          Tâches
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tasks.map((t) => (
            <li key={t.label}>
              <Link
                href={t.href}
                className={`group flex h-full flex-col justify-between rounded-[6px] border-[1.5px] p-4 transition-colors md:p-5 ${
                  t.value > 0
                    ? t.tone === "red"
                      ? "border-gps-red bg-gps-red text-white"
                      : t.tone === "warn"
                        ? "border-warn/40 bg-warn-soft"
                        : "border-gps-blue bg-gps-blue text-white"
                    : "border-line bg-card text-ink-soft"
                }`}
              >
                <span className="font-display text-[52px] leading-none font-extrabold tabular md:text-[64px]">
                  {t.value}
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[15px] font-bold">
                  {t.label}{" "}
                  <IconArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {counts.with_balance > 0 ? (
          <Link
            href="/comptoir/commandes?vue=solde"
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold text-gps-blue hover:underline"
          >
            {counts.with_balance} commande{counts.with_balance > 1 ? "s" : ""} avec un solde à encaisser{" "}
            <IconArrowRight size={16} />
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="titre-raccourcis" className="mt-8">
        <h2 id="titre-raccourcis" className="eyebrow mb-3 text-ink-mute">
          Raccourcis
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {shortcuts.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="flex min-h-14 items-center gap-3 rounded-[6px] border-[1.5px] border-ink bg-card px-4 font-bold hover:bg-ink hover:text-white"
              >
                <s.icon size={20} /> {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="File GPS"
          id="titre-file"
          actions={
            <Link href="/comptoir/file" className="text-[14px] font-semibold text-gps-blue hover:underline">
              Tout voir ({queue.counts["a-faire"]})
            </Link>
          }
        >
          {queue.items.length === 0 ? (
            <p className="text-ink-mute">Rien en attente.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {queue.items.slice(0, 6).map((i) => (
                <li key={i.key}>
                  <Link href={i.href || "/comptoir/file"} className="group flex items-center gap-3 py-2.5">
                    <Badge tone={i.priority === 1 ? "red" : i.priority === 2 ? "blue" : "neutral"}>
                      {queueKindLabels[i.kind]}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold group-hover:underline">{i.title}</span>
                      {i.detail ? <span className="block truncate text-[13px] text-ink-mute">{i.detail}</span> : null}
                    </span>
                    <IconArrowRight size={16} className="shrink-0 text-ink-mute" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Chiffres du jour"
          id="titre-chiffres"
          actions={
            <Link href="/comptoir/tableau-de-bord" className="text-[14px] font-semibold text-gps-blue hover:underline">
              Tableau de bord
            </Link>
          }
        >
          <dl className="grid gap-3">
            {(finance
              ? ([
                  ["ca", "Chiffre d'affaires", <Money key="ca" value={m.ca} />],
                  ["encaissements", "Encaissements", <Money key="enc" value={m.encaissements} />],
                  ["reste", "Reste à encaisser", <Money key="reste" value={m.reste} />],
                  ["commandes", "Commandes", m.commandes],
                ] as const)
              : ([
                  ["commandes", "Commandes", m.commandes],
                  ["finalisees", "Ventes finalisées", m.finalisees],
                ] as const)
            ).map(([k, label, value]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-2">
                <dt className="text-[14px] text-ink-soft">
                  <Link href={`/comptoir/tableau-de-bord?periode=jour&detail=${k}#detail`} className="hover:underline">
                    {label}
                  </Link>
                </dt>
                <dd className="text-[20px] font-extrabold tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint mt-3">
            {isDemoMode() ? "Périmètre : données réelles uniquement (démonstration exclue). " : ""}Transferts
            d&apos;argent exclus : leurs fonds restent séparés des ventes.
          </p>
        </Panel>
      </div>
    </>
  );
}
