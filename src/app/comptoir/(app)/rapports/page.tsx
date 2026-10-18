import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { periodFromKey, report, stockSummary, storeReport } from "@/server/domain/reports";
import { demoOrdersIn, scopeFromParam } from "@/server/domain/metrics";
import { getSettings } from "@/server/domain/settings";
import { PeriodPicker } from "@/components/admin/PeriodPicker";
import { ScopeFilter } from "@/components/admin/ScopeFilter";
import { methodLabels, type PaymentMethod } from "@/server/domain/orders";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Forbidden, Money, PageTitle, Panel } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Rapports" };

export default async function ReportsPage({ searchParams }: PageProps<"/comptoir/rapports">) {
  const { db, user, allowed } = await requirePage("reports.view");
  if (!allowed) return <Forbidden what="les rapports" />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = periodFromKey(str("periode") ?? "30j", new Date(), {
    from: str("du"),
    to: str("au"),
  });
  const withMargin = can(user, "reports.margin");
  const scope = scopeFromParam(str("demo"));
  const settings = await getSettings(db);
  const [r, demoCount, stock, byStore] = await Promise.all([
    report(db, period, { withMargin, scope }),
    demoOrdersIn(db, period),
    stockSummary(db, { scope, withCost: withMargin, defaultThreshold: settings.stock.defaultLowThreshold }),
    storeReport(db, period, { scope }),
  ]);
  const toggle = new URLSearchParams({ periode: period.key });
  if (period.key === "perso") {
    toggle.set("du", period.from.toISOString().slice(0, 10));
    toggle.set("au", new Date(period.to.getTime() - 86400000).toISOString().slice(0, 10));
  }
  if (!scope.includeDemo) toggle.set("demo", "1");
  const payments = r.cashflow.filter((c) => c.kind === "payment");
  const maxBest = Math.max(1, ...r.best.map((b) => b.amount));
  const toDay = new Date(period.to.getTime() - 86400000);

  return (
    <>
      <PageTitle eyebrow="Pilotage" title="Rapports">
        {period.label} : du {formatDate(period.from)} au {formatDate(toDay)}. Les ventes enregistrées ne sont ni des
        encaissements ni un bénéfice.
      </PageTitle>
      <div className="mb-6 grid gap-3">
        <PeriodPicker base="/comptoir/rapports" period={period} extra={scope.includeDemo ? { demo: "1" } : {}} />
        <ScopeFilter
          includeDemo={scope.includeDemo}
          demoCount={demoCount}
          demoMode={isDemoMode()}
          toggleHref={`/comptoir/rapports?${toggle.toString()}`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Ventes enregistrées</p>
          <p className="mt-1 text-2xl font-extrabold">
            <Money value={r.sales.amount} />
          </p>
          <p className="text-[13px] text-ink-mute">
            {r.sales.count} commande(s) · retours déduits (
            {r.sales.returned ? <Money value={r.sales.returned} /> : "aucun"}) · frais de livraison à part :{" "}
            <Money value={r.sales.fees} />
          </p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Encaissements</p>
          <p className="mt-1 text-2xl font-extrabold text-wa-ink">
            <Money value={r.encaissements} />
          </p>
          <p className="text-[13px] text-ink-mute">Argent reçu sur la période, corrections déduites.</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Remboursements</p>
          <p className={`mt-1 text-2xl font-extrabold ${r.remboursements ? "text-gps-red-ink" : ""}`}>
            <Money value={r.remboursements} />
          </p>
          <p className="text-[13px] text-ink-mute">Argent rendu aux clients sur la période.</p>
        </Panel>
        <Panel>
          <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Soldes restants</p>
          <p className="mt-1 text-2xl font-extrabold">
            <Money value={r.soldes} />
          </p>
          <p className="text-[13px] text-ink-mute">À encaisser sur les commandes ouvertes, toutes dates.</p>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Meilleurs produits (montant vendu)" id="t-best">
          {r.best.length === 0 ? (
            <p className="text-ink-mute">Aucune vente sur la période.</p>
          ) : (
            <ol className="grid gap-3">
              {r.best.map((b) => (
                <li key={b.sku}>
                  <div className="flex justify-between gap-2 text-[14px]">
                    <span>
                      <span className="font-semibold">{b.name}</span> <span className="text-ink-mute">· {b.sku}</span>
                    </span>
                    <span className="font-bold whitespace-nowrap tabular">
                      {b.quantity} × · <Money value={b.amount} />
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-paper-deep" aria-hidden="true">
                    <div className="h-2 rounded-full bg-gps-blue" style={{ width: `${(b.amount / maxBest) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Encaissements par moyen" id="t-moyens">
          {payments.length === 0 ? (
            <p className="text-ink-mute">Aucun encaissement.</p>
          ) : (
            <table className="w-full text-[14px]">
              <tbody className="divide-y divide-line-soft">
                {payments.map((c) => (
                  <tr key={c.method}>
                    <td className="py-2">{methodLabels[c.method as PaymentMethod]}</td>
                    <td className="py-2 text-right text-ink-mute tabular">{c.n} opération(s)</td>
                    <td className="py-2 text-right font-bold">
                      <Money value={c.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint mt-3">
            Les fonds des transferts d&apos;argent ne sont pas mélangés aux ventes : ils ne figurent pas dans ces
            rapports.
          </p>
        </Panel>

        <Panel title="Marge" id="t-marge">
          {r.margin.available ? (
            <>
              <p className="text-2xl font-extrabold">
                <Money value={r.margin.value} />{" "}
                <Badge tone="blue">
                  {Math.round((r.margin.value / Math.max(1, r.margin.revenue)) * 100)} % des ventes
                </Badge>
              </p>
              <p className="hint">{r.margin.method}</p>
            </>
          ) : (
            <p className="text-ink-soft">
              Marge non affichée : {r.margin.reason}
              {withMargin && /coût/i.test(r.margin.reason)
                ? " Renseignez les coûts d'achat des variantes (propriétaire) pour l'obtenir."
                : null}
            </p>
          )}
        </Panel>

        {byStore.length ? (
          <Panel title="Par point de vente" id="t-boutiques" className="lg:col-span-2">
            <p className="hint mb-3">Ventes réparties par boutique.</p>
            <div className="rtable -mx-4 overflow-x-auto md:mx-0">
              <table className="w-full min-w-[640px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                    <th className="px-4 py-2 md:px-0">Point de vente</th>
                    <th className="py-2 text-right">Chiffre d&apos;affaires</th>
                    <th className="py-2 text-right">Encaissements</th>
                    <th className="py-2 text-right">Commandes</th>
                    <th className="py-2 text-right">Au comptoir</th>
                    <th className="py-2 text-right">Panier moyen</th>
                    <th className="py-2 pr-4 md:pr-0">Vendeurs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {byStore.map((b) => (
                    <tr key={b.id ?? "none"}>
                      <td className="px-4 py-2 font-semibold md:px-0">{b.name}</td>
                      <td className="py-2 text-right" data-label="Chiffre d'affaires">
                        <Money value={b.ca} />
                      </td>
                      <td className="py-2 text-right" data-label="Encaissements">
                        <Money value={b.encaissements} />
                      </td>
                      <td className="py-2 text-right tabular" data-label="Commandes">
                        {b.orders}
                      </td>
                      <td className="py-2 text-right tabular" data-label="Au comptoir">
                        {b.counter}
                      </td>
                      <td className="py-2 text-right" data-label="Panier moyen">
                        {b.basket === null ? "—" : <Money value={b.basket} />}
                      </td>
                      <td className="py-2 pr-4 text-ink-soft md:pr-0" data-label="Vendeurs">
                        {b.sellers.join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : null}

        {settings.stock.tracking ? (
          <Panel title="Stock commercial" id="t-stock">
            <dl className="grid grid-cols-2 gap-3 text-[14px]">
              <div>
                <dt className="text-ink-mute">Unités en stock</dt>
                <dd className="text-xl font-extrabold tabular">{stock.units}</dd>
              </div>
              <div>
                <dt className="text-ink-mute">Disponibles à la vente</dt>
                <dd className="text-xl font-extrabold tabular">{stock.available}</dd>
              </div>
              <div>
                <dt className="text-ink-mute">Valeur au prix de vente</dt>
                <dd className="text-xl font-extrabold">
                  <Money value={stock.saleValue} />
                </dd>
              </div>
              {stock.costValue !== null ? (
                <div>
                  <dt className="text-ink-mute">Valeur au coût d&apos;achat</dt>
                  <dd className="text-xl font-extrabold">
                    <Money value={stock.costValue} />
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="hint mt-3">
              {stock.variants} variante(s) active(s) · {stock.low} en stock faible
              {stock.costValue !== null && stock.missingCost
                ? ` · ${stock.missingCost} sans coût d'achat (non comptée(s) dans la valeur au coût)`
                : ""}
              . Hors stock non vendable
              {isDemoMode() || demoCount
                ? `, ${scope.includeDemo ? "produits d'exemple inclus" : "produits d'exemple exclus"}`
                : ""}
              .
            </p>
          </Panel>
        ) : null}

        <Panel title="Soldes à encaisser" id="t-soldes">
          {r.openBalances.length === 0 ? (
            <p className="text-ink-mute">Aucun solde ouvert.</p>
          ) : (
            <ul className="divide-y divide-line-soft text-[14px]">
              {r.openBalances.map((o) => (
                <li key={o.id} className="flex justify-between gap-2 py-2">
                  <Link href={`/comptoir/commandes/${o.id}`} className="font-semibold text-gps-blue hover:underline">
                    {o.reference}{" "}
                    <span className="font-normal text-ink-mute">· {o.customer_name || "client de passage"}</span>
                  </Link>
                  <span className="font-bold text-gps-red-ink">
                    <Money value={o.balance} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
