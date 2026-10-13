import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { periodFromKey, report } from "@/server/domain/reports";
import { methodLabels, type PaymentMethod } from "@/server/domain/orders";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { Badge, Forbidden, Money, PageTitle, Panel } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Rapports" };

const periods = [
  ["jour", "Aujourd'hui"],
  ["7j", "7 jours"],
  ["30j", "30 jours"],
  ["mois", "Ce mois"],
] as const;

export default async function ReportsPage({ searchParams }: PageProps<"/comptoir/rapports">) {
  const { db, user, allowed } = await requirePage("reports.view");
  if (!allowed) return <Forbidden what="les rapports" />;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const period = periodFromKey(str("periode") ?? "30j", new Date(), {
    from: str("du"),
    to: str("au"),
  });
  const withMargin = can(user.role, "reports.margin");
  const r = await report(db, period, { withMargin });
  const payments = r.cashflow.filter((c) => c.kind === "payment");
  const maxBest = Math.max(1, ...r.best.map((b) => b.amount));
  const toDay = new Date(period.to.getTime() - 86400000);

  return (
    <>
      <PageTitle eyebrow="Pilotage" title="Rapports">
        {period.label} : du {formatDate(period.from)} au {formatDate(toDay)}. Les ventes enregistrées ne sont ni des
        encaissements ni un bénéfice.
      </PageTitle>
      <div className="mb-6 flex flex-wrap items-end gap-2">
        {periods.map(([k, label]) => (
          <Link
            key={k}
            href={`/comptoir/rapports?periode=${k}`}
            aria-current={period.key === k ? "page" : undefined}
            className={`chip ${period.key === k ? "border-ink bg-ink text-white" : ""}`}
          >
            {label}
          </Link>
        ))}
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="periode" value="perso" />
          <div>
            <label className="label text-[13px]" htmlFor="du">
              Du
            </label>
            <input
              id="du"
              name="du"
              type="date"
              className="field h-10 min-h-10 py-0"
              defaultValue={period.key === "perso" ? period.from.toISOString().slice(0, 10) : undefined}
            />
          </div>
          <div>
            <label className="label text-[13px]" htmlFor="au">
              Au
            </label>
            <input
              id="au"
              name="au"
              type="date"
              className="field h-10 min-h-10 py-0"
              defaultValue={period.key === "perso" ? toDay.toISOString().slice(0, 10) : undefined}
            />
          </div>
          <button className="btn btn-outline btn-sm">Appliquer</button>
        </form>
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
              {!withMargin ? null : " Renseignez les coûts d'achat des variantes (propriétaire) pour l'obtenir."}
            </p>
          )}
        </Panel>

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
