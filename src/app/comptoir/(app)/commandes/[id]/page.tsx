import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { getOrder, methodLabels, nextStep, receptionLabels, channelLabels } from "@/server/domain/orders";
import { renderTemplate, templateMeta } from "@/lib/templates";
import { getSettings } from "@/server/domain/settings";
import { can } from "@/lib/permissions";
import { fcfa, formatDateTime } from "@/lib/format";
import { Badge, Forbidden, Money, Panel } from "@/components/admin/ui";
import { FulfillmentBadge, PaymentBadge, StatusBadge } from "@/components/admin/OrderBadges";
import {
  CancelForm,
  FeeForm,
  NextStepButton,
  NoteForm,
  PaymentForm,
  RefundForm,
  ReturnForm,
  ReversePaymentButton,
  WhatsAppMessages,
} from "@/components/admin/OrderActions";
import { IconArrowLeft, IconPrint } from "@/components/ui/icons";

export async function generateMetadata({ params }: PageProps<"/comptoir/commandes/[id]">): Promise<Metadata> {
  const { db } = await requirePage("orders.view");
  const o = await getOrder(db, (await params).id);
  return { title: o ? o.reference : "Commande" };
}

export default async function OrderPage({ params }: PageProps<"/comptoir/commandes/[id]">) {
  const { db, user, allowed } = await requirePage("orders.view");
  if (!allowed) return <Forbidden />;
  const o = await getOrder(db, (await params).id);
  if (!o) notFound();
  const settings = await getSettings(db);
  const step = nextStep(o);
  const showCost = can(user, "catalog.costs");
  const reversed = new Set(o.payments.filter((p) => p.reverses_id).map((p) => p.reverses_id));

  const linesText = o.lines
    .map((l) => `• ${l.name}${l.options_label ? ` (${l.options_label})` : ""} × ${l.quantity}`)
    .join("\n");
  const first = o.customer_name.split(" ")[0] || "";
  const vars = {
    prenom: first,
    reference: o.reference,
    articles: linesText,
    total: fcfa(o.subtotal),
    livraison:
      o.reception === "delivery"
        ? `Livraison : ${o.delivery_fee === null ? "frais à confirmer" : fcfa(o.delivery_fee)}`
        : "",
    reception: receptionLabels[o.reception].toLowerCase(),
    reste: o.balance > 0 ? `Reste à régler : ${fcfa(o.balance)}.` : "",
    solde: fcfa(Math.max(0, o.balance)),
    horaires: settings.company.hours ? `(${settings.company.hours})` : "",
    adresse: o.delivery_address ? `à : ${o.delivery_address}` : "",
  };
  const m = settings.messages;
  const templates = [
    { label: templateMeta.confirmation.label, text: renderTemplate(m.confirmation, vars) },
    o.reception === "delivery"
      ? { label: templateMeta.readyDelivery.label, text: renderTemplate(m.readyDelivery, vars) }
      : { label: templateMeta.readyPickup.label, text: renderTemplate(m.readyPickup, vars) },
    { label: templateMeta.balance.label, text: renderTemplate(m.balance, vars) },
  ];

  return (
    <>
      <Link
        href="/comptoir/commandes"
        className="no-print mb-3 inline-flex min-h-11 items-center gap-1 text-[15px] font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Commandes
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-gps-red-ink">
            {channelLabels[o.channel]} · {receptionLabels[o.reception]} · {formatDateTime(o.created_at)}
          </p>
          <h1 className="mt-1 font-display text-[40px] leading-none font-extrabold uppercase md:text-[52px]">
            {o.reference}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status={o.status} />
            <FulfillmentBadge f={o.fulfillment} reception={o.reception} status={o.status} />
            <PaymentBadge p={o.payment} />
            {o.is_demo ? <Badge>Exemple</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {step && can(user, "orders.progress") ? (
            <NextStepButton orderId={o.id} to={step.to} label={step.label} />
          ) : null}
          <Link href={`/comptoir/recus/${o.id}`} className="btn btn-outline">
            <IconPrint size={18} /> Reçu
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="grid content-start gap-6 lg:col-span-7">
          <Panel title="Articles (prix enregistrés)" id="t-articles">
            <div className="-mx-4 overflow-x-auto md:-mx-5">
              <table className="w-full min-w-[520px] text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                    <th className="px-4 py-2 font-bold md:px-5">Article</th>
                    <th className="py-2 text-right font-bold">Qté</th>
                    <th className="py-2 text-right font-bold">P.U.</th>
                    {showCost ? <th className="py-2 text-right font-bold">Coût</th> : null}
                    <th className="px-4 py-2 text-right font-bold md:px-5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {o.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2 md:px-5">
                        <div className="font-semibold">{l.name}</div>
                        <div className="text-[13px] text-ink-mute">
                          {l.options_label ? `${l.options_label} · ` : ""}
                          {l.sku}
                        </div>
                        {l.returned_quantity ? <Badge tone="warn">{l.returned_quantity} retourné(s)</Badge> : null}
                      </td>
                      <td className="py-2 text-right tabular">{l.quantity}</td>
                      <td className="py-2 text-right">
                        <Money value={l.unit_price} />
                      </td>
                      {showCost ? (
                        <td className="py-2 text-right text-ink-mute">
                          {l.cost_price == null ? "—" : <Money value={l.cost_price} />}
                        </td>
                      ) : null}
                      <td className="px-4 py-2 text-right font-bold md:px-5">
                        <Money value={l.unit_price * l.quantity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 grid gap-1 border-t border-line pt-3 text-[15px]">
              <div className="flex justify-between">
                <dt>Total des articles</dt>
                <dd className="font-semibold">
                  <Money value={o.subtotal} />
                </dd>
              </div>
              {o.returned_value ? (
                <div className="flex justify-between text-warn">
                  <dt>Retours</dt>
                  <dd>
                    − <Money value={o.returned_value} />
                  </dd>
                </div>
              ) : null}
              {o.reception === "delivery" ? (
                <div className="flex justify-between">
                  <dt>Livraison</dt>
                  <dd className="font-semibold">
                    {o.delivery_fee === null ? (
                      <Badge tone="warn">À confirmer</Badge>
                    ) : (
                      <Money value={o.delivery_fee} />
                    )}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between text-lg">
                <dt className="font-bold">Montant dû</dt>
                <dd className="font-extrabold">
                  <Money value={o.due} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Encaissé (net)</dt>
                <dd className="font-semibold text-wa-ink">
                  <Money value={o.net} />
                </dd>
              </div>
              <div className="flex justify-between text-lg">
                <dt className="font-bold">{o.balance < 0 ? "À rembourser" : "Solde restant"}</dt>
                <dd className={`font-extrabold ${o.balance !== 0 ? "text-gps-red-ink" : ""}`}>
                  <Money value={Math.abs(o.balance)} />
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Paiements" id="t-paiements">
            {o.payments.length === 0 ? (
              <p className="text-ink-mute">Aucun encaissement.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {o.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {p.kind === "payment" ? (
                          <Badge tone="green">Encaissement</Badge>
                        ) : p.kind === "refund" ? (
                          <Badge tone="red">Remboursement</Badge>
                        ) : (
                          <Badge tone="warn">Correction</Badge>
                        )}
                        {methodLabels[p.method]}
                        {reversed.has(p.id) ? <Badge>corrigé</Badge> : null}
                      </p>
                      <p className="text-[13px] text-ink-mute">
                        {formatDateTime(p.created_at)} · {p.user_name ?? "—"}
                        {p.note ? ` · ${p.note}` : ""}
                      </p>
                      {p.kind === "payment" && !reversed.has(p.id) && can(user, "orders.correct") ? (
                        <ReversePaymentButton paymentId={p.id} />
                      ) : null}
                    </div>
                    <p className={`font-bold ${p.kind === "payment" ? "" : "text-gps-red-ink"}`}>
                      {p.kind === "payment" ? "" : "− "}
                      <Money value={p.amount} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Chronologie" id="t-chrono">
            <ol className="grid gap-3">
              {o.events.map((e) => (
                <li key={e.id} className="grid grid-cols-[12px_1fr] gap-3">
                  <span
                    className={`mt-1.5 h-3 w-3 rounded-full ${e.kind === "note" ? "bg-gps-blue" : e.kind === "cancelled" || e.kind === "refund" ? "bg-gps-red" : "bg-line"}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[14px]">
                      {e.kind === "note" ? <strong>Note : </strong> : null}
                      {e.message}
                    </p>
                    <p className="text-[12px] text-ink-mute">
                      {formatDateTime(e.created_at)}
                      {e.user_name ? ` · ${e.user_name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 border-t border-line pt-4">
              <NoteForm orderId={o.id} />
            </div>
          </Panel>
        </div>

        <div className="grid content-start gap-4 lg:col-span-5">
          <Panel title="Client & réception" id="t-client">
            <dl className="grid gap-3 text-[15px]">
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Client</dt>
                <dd className="font-semibold">
                  {o.customer_id ? (
                    <Link className="text-gps-blue hover:underline" href={`/comptoir/clients/${o.customer_id}`}>
                      {o.customer_name}
                    </Link>
                  ) : (
                    o.customer_name || "Client de passage"
                  )}
                  {o.customer_phone ? (
                    <span className="block font-normal text-ink-soft">{o.customer_phone}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Réception</dt>
                <dd>
                  {receptionLabels[o.reception]}
                  {o.delivery_zone ? ` · ${o.delivery_zone}` : ""}
                  {o.delivery_address ? <span className="block text-ink-soft">{o.delivery_address}</span> : null}
                </dd>
              </div>
              {o.notes ? (
                <div>
                  <dt className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Note à la saisie</dt>
                  <dd className="text-ink-soft">{o.notes}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">Enregistrée par</dt>
                <dd className="text-ink-soft">{o.created_by_name ?? "—"}</dd>
              </div>
            </dl>
          </Panel>

          {o.status !== "cancelled" && o.balance > 0 && can(user, "payments.record") ? (
            <PaymentForm orderId={o.id} balance={o.balance} feeUnknown={o.feeUnknown} />
          ) : null}
          {o.status !== "cancelled" && o.feeUnknown && o.balance === 0 && can(user, "payments.record") ? (
            <PaymentForm orderId={o.id} balance={0} feeUnknown />
          ) : null}
          {o.customer_phone || o.customer_name ? (
            <WhatsAppMessages phone={o.customer_phone} templates={templates} />
          ) : null}
          {o.reception === "delivery" && o.status !== "cancelled" && can(user, "orders.correct") ? (
            <FeeForm orderId={o.id} current={o.delivery_fee} />
          ) : null}
          {o.status === "completed" && can(user, "returns.process") ? (
            <ReturnForm orderId={o.id} lines={o.lines} net={o.net} />
          ) : null}
          {o.net > 0 && can(user, "payments.refund") ? (
            <RefundForm orderId={o.id} net={o.net} suggested={Math.max(0, -o.balance)} />
          ) : null}
          {o.status === "confirmed" && can(user, "orders.cancel") ? <CancelForm orderId={o.id} /> : null}
        </div>
      </div>
    </>
  );
}
