import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { periodFromKey, report } from "@/server/domain/reports";
import {
  change,
  computeMetrics,
  metricDefs,
  metricDetail,
  metricKeys,
  previousPeriod,
  type MetricKey,
} from "@/server/domain/metrics";
import { can } from "@/lib/permissions";
import { fcfa, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { PeriodPicker } from "@/components/admin/PeriodPicker";
import { Money, PageTitle, Panel } from "@/components/admin/ui";
import { IconArrowRight, IconInfo } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Tableau de bord" };

const order: MetricKey[] = [
  "ca",
  "encaissements",
  "reste",
  "montant",
  "commandes",
  "finalisees",
  "panier",
  "remboursements",
  "annulees",
];

export default async function DashboardPage({ searchParams }: PageProps<"/comptoir/tableau-de-bord">) {
  const { db, user } = await requirePage();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = periodFromKey(str("periode") ?? "jour", new Date(), { from: str("du"), to: str("au") });
  const prev = previousPeriod(period);
  const finance = can(user, "dashboard.finance");
  const visible = order.filter((k) => finance || !metricDefs[k].finance);
  const detailKey = metricKeys.includes(str("detail") as MetricKey) ? (str("detail") as MetricKey) : null;
  const detailAllowed = detailKey && (finance || !metricDefs[detailKey].finance) ? detailKey : null;

  const [now, before, detail, margin] = await Promise.all([
    computeMetrics(db, period),
    computeMetrics(db, prev),
    detailAllowed ? metricDetail(db, detailAllowed, period) : Promise.resolve([]),
    can(user, "reports.margin") ? report(db, period, { withMargin: true }).then((r) => r.margin) : null,
  ]);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    p.set("periode", period.key);
    if (period.key === "perso") {
      p.set("du", period.from.toISOString().slice(0, 10));
      p.set("au", new Date(period.to.getTime() - 86400000).toISOString().slice(0, 10));
    }
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/comptoir/tableau-de-bord?${p.toString()}`;
  };
  const fmt = (k: MetricKey, v: number | null) =>
    v === null ? "—" : metricDefs[k].finance ? fcfa(v) : formatNumber(v);

  return (
    <>
      <PageTitle eyebrow="Piloter" title="Tableau de bord">
        {period.label} · du {formatDate(period.from)} au {formatDate(new Date(period.to.getTime() - 86400000))}.
        Comparaison avec la période précédente de même durée. Touchez un chiffre pour voir les opérations qui le
        composent.
      </PageTitle>
      <div className="mb-6">
        <PeriodPicker base="/comptoir/tableau-de-bord" period={period} />
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {visible.map((k) => {
          const d = change(now[k], before[k]);
          return (
            <li key={k}>
              <Link
                href={`${qs({ detail: k })}#detail`}
                className="kpi-card"
                aria-current={detailAllowed === k ? "true" : undefined}
              >
                <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">
                  {metricDefs[k].label}
                </span>
                <span className="kpi-value">{fmt(k, now[k])}</span>
                <span className="mt-auto pt-3 text-[13px] text-ink-mute">
                  {d === null ? (
                    "Pas de comparaison"
                  ) : (
                    <>
                      <span className={`font-bold ${d > 0 ? "text-wa-ink" : d < 0 ? "text-gps-red-ink" : ""}`}>
                        {d > 0 ? "+" : ""}
                        {d} %
                      </span>{" "}
                      vs {fmt(k, before[k])}
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        {margin ? (
          <li>
            <div className="kpi-card">
              <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">Marge brute</span>
              {margin.available ? (
                <span className="kpi-value">
                  <Money value={margin.value} />
                </span>
              ) : (
                <span className="mt-2 text-[14px] text-ink-soft">{margin.reason}</span>
              )}
              <span className="mt-auto pt-3 text-[13px] text-ink-mute">Propriétaire uniquement</span>
            </div>
          </li>
        ) : null}
      </ul>
      {!finance ? (
        <p className="mt-3 flex gap-2 text-[14px] text-ink-mute">
          <IconInfo size={18} className="shrink-0" /> Les montants sont réservés au propriétaire et aux gestionnaires.
        </p>
      ) : null}

      {detailAllowed ? (
        <Panel
          className="mt-6 scroll-mt-24"
          id="detail"
          title={`${metricDefs[detailAllowed].label} · ${fmt(detailAllowed, now[detailAllowed])}`}
          actions={
            <Link href={qs({})} className="text-[14px] font-semibold text-gps-blue hover:underline">
              Fermer
            </Link>
          }
        >
          <p className="mb-4 rounded-[6px] bg-paper-deep p-3 text-[14px] text-ink-soft">
            <strong>Calcul :</strong> {metricDefs[detailAllowed].formula}
          </p>
          {detail.length === 0 ? (
            <p className="text-ink-mute">Aucune opération sur la période.</p>
          ) : (
            <div className="rtable -mx-4 overflow-x-auto md:mx-0">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                    <th className="px-4 py-2 font-bold md:px-0">Date</th>
                    <th className="py-2 font-bold">Référence</th>
                    <th className="py-2 font-bold">Détail</th>
                    {metricDefs[detailAllowed].finance ? (
                      <th className="py-2 pr-4 text-right font-bold md:pr-0">Montant</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {detail.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 whitespace-nowrap text-ink-mute md:px-0">{formatDateTime(r.at)}</td>
                      <td className="py-2" data-label="Référence">
                        <Link href={r.href} className="font-semibold text-gps-blue hover:underline">
                          {r.reference}
                        </Link>
                      </td>
                      <td className="rt-full py-2 text-ink-soft" data-label="Détail">
                        {r.label}
                      </td>
                      {metricDefs[detailAllowed].finance ? (
                        <td className="py-2 pr-4 text-right font-bold md:pr-0" data-label="Montant">
                          {r.amount === null ? "—" : fcfa(r.amount)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      <details className="mt-8 rounded-[6px] border border-line bg-card p-4 md:p-5">
        <summary className="cursor-pointer font-bold">Comment les chiffres sont calculés</summary>
        <dl className="mt-4 grid gap-3 text-[14px]">
          {visible.map((k) => (
            <div key={k}>
              <dt className="font-bold">{metricDefs[k].label}</dt>
              <dd className="text-ink-soft">{metricDefs[k].formula}</dd>
            </div>
          ))}
          <div>
            <dt className="font-bold">Transferts d&apos;argent</dt>
            <dd className="text-ink-soft">Jamais comptés : leurs fonds restent séparés des ventes.</dd>
          </div>
        </dl>
        <Link
          href="/comptoir/rapports"
          className="mt-4 inline-flex min-h-10 items-center gap-1 text-[14px] font-semibold text-gps-blue hover:underline"
        >
          Rapports détaillés <IconArrowRight size={16} />
        </Link>
      </details>
    </>
  );
}
