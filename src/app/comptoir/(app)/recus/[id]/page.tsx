import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { getOrder, methodLabels, receptionLabels } from "@/server/domain/orders";
import { getSettings, legalIds } from "@/server/domain/settings";
import { fcfa, formatDateTime } from "@/lib/format";
import { Forbidden } from "@/components/admin/ui";
import { Logo } from "@/components/brand/Logo";
import { IconArrowLeft } from "@/components/ui/icons";
import { ReceiptActions } from "./ReceiptActions";

export const metadata: Metadata = { title: "Reçu" };

export default async function ReceiptPage({ params }: PageProps<"/comptoir/recus/[id]">) {
  const { db, allowed } = await requirePage("orders.view");
  if (!allowed) return <Forbidden />;
  const o = await getOrder(db, (await params).id);
  if (!o) notFound();
  const s = await getSettings(db);
  const c = s.company;
  const payments = o.payments.filter((p) => p.kind !== "reversal" && !o.payments.some((r) => r.reverses_id === p.id));

  const text = [
    "GPS — Global Public Services",
    "Le service qui rassure",
    [c.address, c.city].filter(Boolean).join(", "),
    c.phone && `Tél. ${c.phone}`,
    [c.legalName, legalIds(c)].filter(Boolean).join(" · "),
    s.receipt.header,
    "",
    `Reçu ${o.reference} — ${formatDateTime(o.created_at)}`,
    o.customer_name && `Client : ${o.customer_name}`,
    `Réception : ${receptionLabels[o.reception]}`,
    "",
    ...o.lines.map(
      (l) =>
        `${l.name}${l.options_label ? ` (${l.options_label})` : ""} — ${l.sku}\n  ${l.quantity} × ${fcfa(l.unit_price)} = ${fcfa(l.quantity * l.unit_price)}${l.returned_quantity ? ` (retour : ${l.returned_quantity})` : ""}`,
    ),
    "",
    `Total articles : ${fcfa(o.subtotal)}`,
    o.returned_value ? `Retours : -${fcfa(o.returned_value)}` : "",
    o.reception === "delivery" ? `Livraison : ${o.delivery_fee === null ? "à confirmer" : fcfa(o.delivery_fee)}` : "",
    `Montant dû : ${fcfa(o.due)}`,
    ...payments.map(
      (p) =>
        `${p.kind === "refund" ? "Remboursement" : "Paiement"} ${methodLabels[p.method]} : ${fcfa(p.amount)}${p.note ? ` (${p.note})` : ""}${p.tendered !== null && p.change_given > 0 ? ` — reçu ${fcfa(p.tendered)}, rendu ${fcfa(p.change_given)}` : ""}`,
    ),
    `Solde : ${fcfa(o.balance)}`,
    "",
    s.receipt.footer,
    o.is_demo ? "\n*** EXEMPLE — DÉMONSTRATION, SANS VALEUR ***" : "",
  ]
    .filter((x): x is string => typeof x === "string")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/comptoir/commandes/${o.id}`}
          className="inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
        >
          <IconArrowLeft size={18} /> Fiche {o.reference}
        </Link>
        <ReceiptActions text={text} filename={`recu-${o.reference}.txt`} />
      </div>
      <article className="relative overflow-hidden rounded-[6px] border border-line bg-white p-6 text-[14px] md:p-10 print:border-0 print:p-0">
        {o.is_demo ? (
          <p className="mb-4 rounded-[4px] bg-gps-blue-soft px-2 py-1 text-center text-[12px] font-bold text-gps-blue uppercase">
            Exemple — démonstration, sans valeur
          </p>
        ) : null}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <Logo className="h-16 w-auto" />
          </div>
          <div className="text-right text-[13px] text-ink-soft">
            {[c.address, c.city].filter(Boolean).join(", ") || "Adresse à confirmer"}
            {c.phone ? <div>Tél. {c.phone}</div> : null}
            {c.legalName || legalIds(c) ? <div>{[c.legalName, legalIds(c)].filter(Boolean).join(" · ")}</div> : null}
            {s.receipt.header ? <div className="mt-1">{s.receipt.header}</div> : null}
          </div>
        </header>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <div>
            <p className="font-display text-3xl font-extrabold uppercase">Reçu</p>
            <p className="font-bold">{o.reference}</p>
          </div>
          <div className="text-right">
            <p>{formatDateTime(o.created_at)}</p>
            {o.customer_name ? <p>Client : {o.customer_name}</p> : null}
            <p>{receptionLabels[o.reception]}</p>
          </div>
        </div>
        <table className="mt-6 w-full">
          <thead>
            <tr className="border-b border-ink text-left text-[12px] uppercase">
              <th className="py-1">Article</th>
              <th className="py-1 pl-3 text-right">Qté</th>
              <th className="py-1 pl-3 text-right">P.U.</th>
              <th className="py-1 pl-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id} className="border-b border-line-soft align-top">
                <td className="py-2">
                  {l.name}
                  <div className="text-[12px] text-ink-mute">
                    {l.options_label ? `${l.options_label} · ` : ""}
                    {l.sku}
                    {l.returned_quantity ? ` · retour : ${l.returned_quantity}` : ""}
                  </div>
                </td>
                <td className="py-2 pl-3 text-right tabular">{l.quantity}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular">{fcfa(l.unit_price)}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular">{fcfa(l.unit_price * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto grid max-w-xs gap-1 tabular">
          <div className="flex justify-between">
            <dt>Total articles</dt>
            <dd>{fcfa(o.subtotal)}</dd>
          </div>
          {o.returned_value ? (
            <div className="flex justify-between">
              <dt>Retours</dt>
              <dd>− {fcfa(o.returned_value)}</dd>
            </div>
          ) : null}
          {o.reception === "delivery" ? (
            <div className="flex justify-between">
              <dt>Livraison</dt>
              <dd>{o.delivery_fee === null ? "à confirmer" : fcfa(o.delivery_fee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-ink pt-1 font-bold">
            <dt>Montant dû</dt>
            <dd>{fcfa(o.due)}</dd>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="text-[13px]">
              <div className="flex justify-between">
                <dt>
                  {p.kind === "refund" ? "Remboursement" : "Payé"} · {methodLabels[p.method]}
                </dt>
                <dd>
                  {p.kind === "refund" ? "− " : ""}
                  {fcfa(p.amount)}
                </dd>
              </div>
              {p.tendered !== null && p.change_given > 0 ? (
                <div className="flex justify-between text-ink-soft">
                  <dt>Espèces reçues {fcfa(p.tendered)}</dt>
                  <dd>Monnaie rendue {fcfa(p.change_given)}</dd>
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex justify-between font-bold">
            <dt>Solde</dt>
            <dd>{fcfa(o.balance)}</dd>
          </div>
        </dl>
        {s.receipt.footer ? <p className="mt-8 text-center text-ink-soft">{s.receipt.footer}</p> : null}
        <p className="mt-2 text-center font-display text-lg font-bold text-gps-blue uppercase">
          Le service qui rassure
        </p>
      </article>
    </div>
  );
}
