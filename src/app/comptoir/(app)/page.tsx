import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { todayCounts } from "@/server/domain/orders";
import { lowStockCount } from "@/server/domain/stock";
import { getSettings } from "@/server/domain/settings";
import { periodFromKey, report } from "@/server/domain/reports";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format";
import { methodLabels, type PaymentMethod } from "@/server/domain/orders";
import { Badge, Money, PageTitle, Panel } from "@/components/admin/ui";
import {
  IconArrowRight,
  IconBag,
  IconGrid,
  IconPlus,
  IconList,
} from "@/components/ui/icons";

export const metadata: Metadata = { title: "Aujourd'hui" };

const periods = [
  ["jour", "Aujourd'hui"],
  ["7j", "7 jours"],
  ["30j", "30 jours"],
  ["mois", "Ce mois"],
] as const;

export default async function TodayPage({
  searchParams,
}: PageProps<"/comptoir">) {
  const { db, user } = await requirePage();
  const sp = await searchParams;
  const period = periodFromKey(
    typeof sp.periode === "string" ? sp.periode : undefined,
  );
  const settings = await getSettings(db);
  const [counts, low, r] = await Promise.all([
    todayCounts(db),
    lowStockCount(db, settings.stock.defaultLowThreshold),
    report(db, period, { withMargin: false }),
  ]);

  const tasks = [
    {
      label: "Commandes à préparer",
      value: counts.to_prepare,
      href: "/comptoir/commandes?vue=a-preparer",
      tone: "red" as const,
    },
    {
      label: "Retraits prêts",
      value: counts.pickups_ready,
      href: "/comptoir/commandes?vue=retraits",
      tone: "blue" as const,
    },
    {
      label: "Livraisons en cours",
      value: counts.deliveries,
      href: "/comptoir/commandes?vue=livraisons",
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
      ok: can(user.role, "sales.quick"),
    },
    {
      href: "/comptoir/commandes/nouvelle",
      label: "Enregistrer une commande",
      icon: IconBag,
      ok: can(user.role, "orders.create"),
    },
    {
      href: "/comptoir/catalogue/nouveau",
      label: "Ajouter un produit",
      icon: IconGrid,
      ok: can(user.role, "catalog.edit"),
    },
    {
      href: "/comptoir/stock/reapprovisionner",
      label: "Réapprovisionner",
      icon: IconList,
      ok: can(user.role, "stock.restock"),
    },
  ].filter((s) => s.ok);

  return (
    <>
      <PageTitle eyebrow={formatDate(new Date())} title="Aujourd'hui">
        Bonjour {user.name.split(" ")[0]}. Les tâches en attente d&apos;abord,
        les chiffres ensuite.
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
                <span className="tabular font-display text-[52px] leading-none font-extrabold md:text-[64px]">
                  {t.value}
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-[15px] font-bold">
                  {t.label}{" "}
                  <IconArrowRight
                    size={18}
                    className="shrink-0 transition-transform group-hover:translate-x-1"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {counts.with_balance > 0 ? (
          <Link
            href="/comptoir/commandes?vue=solde"
            className="text-gps-blue mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-bold hover:underline"
          >
            {counts.with_balance} commande{counts.with_balance > 1 ? "s" : ""}{" "}
            avec un solde à encaisser <IconArrowRight size={16} />
          </Link>
        ) : null}
      </section>

      <section aria-labelledby="titre-raccourcis" className="mt-8">
        <h2 id="titre-raccourcis" className="eyebrow text-ink-mute mb-3">
          Raccourcis
        </h2>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {shortcuts.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="border-ink bg-card hover:bg-ink flex min-h-14 items-center gap-3 rounded-[6px] border-[1.5px] px-4 font-bold hover:text-white"
              >
                <s.icon size={20} /> {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titre-chiffres" className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2
            id="titre-chiffres"
            className="font-display text-3xl font-bold uppercase"
          >
            Chiffres · {period.label}
          </h2>
          <nav aria-label="Période" className="flex flex-wrap gap-1">
            {periods.map(([k, label]) => (
              <Link
                key={k}
                href={`/comptoir?periode=${k}`}
                aria-current={period.key === k ? "page" : undefined}
                className={`chip ${period.key === k ? "border-ink bg-ink text-white" : ""}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Panel>
            <p className="text-ink-mute text-[13px] font-bold tracking-wide uppercase">
              Ventes enregistrées
            </p>
            <p className="mt-1 text-[28px] font-extrabold">
              <Money value={r.sales.amount} />
            </p>
            <p className="text-ink-mute text-[13px]">
              {r.sales.count} commande{r.sales.count > 1 ? "s" : ""} ou vente
              {r.sales.count > 1 ? "s" : ""}, hors annulations et retours, hors
              frais de livraison.
            </p>
          </Panel>
          <Panel>
            <p className="text-ink-mute text-[13px] font-bold tracking-wide uppercase">
              Encaissements
            </p>
            <p className="text-wa-ink mt-1 text-[28px] font-extrabold">
              <Money value={r.encaissements} />
            </p>
            <p className="text-ink-mute text-[13px]">
              Argent effectivement reçu sur la période
              {r.remboursements ? ` · remboursements : ` : "."}
              {r.remboursements ? <Money value={r.remboursements} /> : null}
            </p>
          </Panel>
          <Panel>
            <p className="text-ink-mute text-[13px] font-bold tracking-wide uppercase">
              Soldes restants
            </p>
            <p className="text-gps-red-ink mt-1 text-[28px] font-extrabold">
              <Money value={r.soldes} />
            </p>
            <p className="text-ink-mute text-[13px]">
              Reste à encaisser sur les commandes en cours, toutes dates
              confondues.
            </p>
          </Panel>
        </div>

        <Panel title="Détail des opérations" className="mt-4" id="titre-ops">
          {r.operations.length === 0 ? (
            <p className="text-ink-mute">Aucune opération sur la période.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto md:mx-0">
              <table className="w-full min-w-[560px] text-[14px]">
                <thead>
                  <tr className="border-line text-ink-mute border-b text-left text-[12px] tracking-wide uppercase">
                    <th className="px-4 py-2 font-bold md:px-0">Heure</th>
                    <th className="py-2 font-bold">Opération</th>
                    <th className="py-2 font-bold">Commande</th>
                    <th className="py-2 font-bold">Détail</th>
                    <th className="py-2 pr-4 text-right font-bold md:pr-0">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-line-soft divide-y">
                  {r.operations.map((o, i) => (
                    <tr key={i}>
                      <td className="text-ink-mute px-4 py-2 whitespace-nowrap md:px-0">
                        {formatDateTime(o.at)}
                      </td>
                      <td className="py-2">
                        {o.kind === "vente" ? (
                          <Badge tone="blue">Vente</Badge>
                        ) : o.kind === "payment" ? (
                          <Badge tone="green">Encaissement</Badge>
                        ) : o.kind === "refund" ? (
                          <Badge tone="red">Remboursement</Badge>
                        ) : (
                          <Badge tone="warn">Correction</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <Link
                          className="text-gps-blue font-semibold hover:underline"
                          href={`/comptoir/commandes/${o.order_id}`}
                        >
                          {o.reference}
                        </Link>
                      </td>
                      <td className="text-ink-soft py-2">
                        {o.kind === "vente"
                          ? o.detail || "Vente au comptoir"
                          : (methodLabels[o.detail as PaymentMethod] ??
                            o.detail)}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right font-bold md:pr-0 ${o.kind === "refund" || o.kind === "reversal" ? "text-gps-red-ink" : ""}`}
                      >
                        {o.kind === "refund" || o.kind === "reversal"
                          ? "− "
                          : ""}
                        <Money value={o.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint mt-3">
            Les transferts d&apos;argent ne sont pas enregistrés ici : leurs
            fonds restent séparés des ventes de produits.
          </p>
        </Panel>
      </section>
    </>
  );
}
