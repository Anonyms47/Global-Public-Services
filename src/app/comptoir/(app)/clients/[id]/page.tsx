import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { getCustomer } from "@/server/domain/customers";
import { money } from "@/server/domain/orders";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { Forbidden, Money, PageTitle, Panel } from "@/components/admin/ui";
import { FulfillmentBadge, PaymentBadge, StatusBadge } from "@/components/admin/OrderBadges";
import { CustomerEditForm } from "@/components/admin/CustomerForms";
import { IconArrowLeft } from "@/components/ui/icons";
import type { OrderSummary } from "@/server/domain/orders";

export const metadata: Metadata = { title: "Client" };

export default async function CustomerPage({ params }: PageProps<"/comptoir/clients/[id]">) {
  const { db, user, allowed } = await requirePage("customers.view");
  if (!allowed) return <Forbidden />;
  const id = (await params).id;
  const c = await getCustomer(db, id);
  if (!c) notFound();
  const orders = (
    await db.query<OrderSummary>(
      `select o.id, o.reference, o.status, o.fulfillment, o.reception, o.channel, o.subtotal, o.delivery_fee, o.created_at,
              coalesce((select sum(l.returned_quantity * l.unit_price) from order_lines l where l.order_id = o.id), 0)::int as returned_value,
              coalesce((select sum(case when p.kind = 'payment' then p.amount when p.kind = 'reversal' then -p.amount else 0 end) from payments p where p.order_id = o.id), 0)::int as paid,
              coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.kind = 'refund'), 0)::int as refunded
         from orders o where o.customer_id = $1 order by o.created_at desc`,
      [id],
    )
  ).map((o) => ({ ...o, ...money(o) }));
  const spent = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.due, 0);
  const balance = orders.reduce((s, o) => s + Math.max(0, o.balance), 0);
  return (
    <>
      <Link
        href="/comptoir/clients"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Clients
      </Link>
      <PageTitle eyebrow="Client" title={c.name}>
        {c.phone || "Sans téléphone"} · client depuis le {formatDateTime(c.created_at)}
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-4 lg:col-span-7">
          <div className="grid grid-cols-3 gap-3">
            <Panel>
              <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Commandes</p>
              <p className="mt-1 text-2xl font-extrabold tabular">{orders.length}</p>
            </Panel>
            <Panel>
              <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Montant dû total</p>
              <p className="mt-1 text-xl font-extrabold">
                <Money value={spent} />
              </p>
            </Panel>
            <Panel>
              <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Solde ouvert</p>
              <p className={`mt-1 text-xl font-extrabold ${balance ? "text-gps-red-ink" : ""}`}>
                <Money value={balance} />
              </p>
            </Panel>
          </div>
          <Panel title="Historique" id="t-hist">
            {orders.length === 0 ? (
              <p className="text-ink-mute">Aucune commande.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/comptoir/commandes/${o.id}`} className="font-bold text-gps-blue hover:underline">
                        {o.reference}
                      </Link>
                      <span className="ml-2 text-[13px] text-ink-mute">{formatDateTime(o.created_at)}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusBadge status={o.status} />
                        <FulfillmentBadge f={o.fulfillment} reception={o.reception} status={o.status} />
                        <PaymentBadge p={o.payment} />
                      </div>
                    </div>
                    <span className="font-bold">
                      <Money value={o.due} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="lg:col-span-5">
          <CustomerEditForm
            id={c.id}
            canEdit={can(user.role, "customers.edit")}
            initial={{
              name: c.name,
              phone: c.phone,
              email: c.email,
              address: c.address,
              notes: c.notes,
            }}
          />
        </div>
      </div>
    </>
  );
}
