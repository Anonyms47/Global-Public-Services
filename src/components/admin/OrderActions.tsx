"use client";

import { useState } from "react";
import {
  advanceAction,
  cancelAction,
  deliveryFeeAction,
  noteAction,
  paymentAction,
  refundAction,
  returnAction,
  reversePaymentAction,
} from "@/app/comptoir/(app)/commandes/actions";
import type { Fulfillment } from "@/server/domain/orders";
import { fcfa } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import { ActionFeedback, useAction } from "./useAction";
import { IconCopy, IconWhatsApp } from "../ui/icons";

const methods = [
  ["cash", "Espèces"],
  ["mobile_money", "Mobile money"],
  ["card", "Carte"],
  ["bank_transfer", "Virement"],
  ["other", "Autre"],
] as const;

export function NextStepButton({ orderId, to, label }: { orderId: string; to: Fulfillment; label: string }) {
  const { run, pending, failure, success } = useAction();
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => run(() => advanceAction(orderId, to))}
      >
        {pending ? "Enregistrement…" : label}
      </button>
      <ActionFeedback failure={failure} success={success} />
    </div>
  );
}

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-[6px] border border-line bg-card">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-bold [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-xl text-gps-red transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}

export function PaymentForm({
  orderId,
  balance,
  feeUnknown,
}: {
  orderId: string;
  balance: number;
  feeUnknown: boolean;
}) {
  const [method, setMethod] = useState<(typeof methods)[number][0]>("cash");
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : "");
  const [note, setNote] = useState("");
  const { run, pending, failure, success, fieldErrors } = useAction();
  return (
    <Section title="Enregistrer un encaissement" open={balance > 0}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => paymentAction(orderId, { method, amount: Number(amount), note }), {
            onSuccess: () => (setAmount(""), setNote("")),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pay-m">
              Moyen
            </label>
            <select
              id="pay-m"
              className="field"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {methods.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pay-a">
              Montant (FCFA)
            </label>
            <input
              id="pay-a"
              inputMode="numeric"
              className="field"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!fieldErrors.amount}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pay-n">
            Note (facultatif)
          </label>
          <input id="pay-n" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {feeUnknown ? (
          <p className="hint">Frais de livraison encore à confirmer : le solde affiché ne les inclut pas.</p>
        ) : null}
        <ActionFeedback failure={failure} success={success} />
        <button className="btn btn-blue" disabled={pending || !amount}>
          {pending ? "Enregistrement…" : "Enregistrer l'encaissement"}
        </button>
      </form>
    </Section>
  );
}

export function ReversePaymentButton({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending, failure } = useAction();
  if (!open) {
    return (
      <button
        type="button"
        className="text-[13px] font-semibold text-gps-red-ink underline"
        onClick={() => setOpen(true)}
      >
        Corriger
      </button>
    );
  }
  return (
    <form
      className="mt-2 grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => reversePaymentAction(paymentId, reason), {
          onSuccess: () => setOpen(false),
        });
      }}
    >
      <label className="sr-only" htmlFor={`rev-${paymentId}`}>
        Motif de la correction
      </label>
      <input
        id={`rev-${paymentId}`}
        className="field"
        placeholder="Motif (ex. saisi sur la mauvaise commande)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        autoFocus
      />
      <ActionFeedback failure={failure} />
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Annuler
        </button>
        <button className="btn btn-danger btn-sm" disabled={pending}>
          Contre-passer l&apos;encaissement
        </button>
      </div>
    </form>
  );
}

export function RefundForm({ orderId, net, suggested }: { orderId: string; net: number; suggested: number }) {
  const [method, setMethod] = useState<(typeof methods)[number][0]>("cash");
  const [amount, setAmount] = useState(suggested > 0 ? String(suggested) : "");
  const [note, setNote] = useState("");
  const { run, pending, failure, success, fieldErrors } = useAction();
  return (
    <Section title="Rembourser" open={suggested > 0}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => refundAction(orderId, { method, amount: Number(amount), note }));
        }}
      >
        <p className="text-[14px] text-ink-soft">
          Encaissé net : {fcfa(net)}. Le remboursement est conservé dans l&apos;historique.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <select
            aria-label="Moyen de remboursement"
            className="field"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            {methods.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            aria-label="Montant remboursé"
            inputMode="numeric"
            className="field"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
            aria-invalid={!!fieldErrors.amount}
          />
        </div>
        <input
          aria-label="Motif du remboursement"
          className="field"
          placeholder="Motif (obligatoire)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={!!fieldErrors.note}
        />
        <ActionFeedback failure={failure} success={success} />
        <button className="btn btn-danger" disabled={pending || !amount}>
          Enregistrer le remboursement
        </button>
      </form>
    </Section>
  );
}

export function CancelForm({ orderId }: { orderId: string }) {
  const [reason, setReason] = useState("");
  const { run, pending, failure, success, fieldErrors } = useAction();
  return (
    <Section title="Annuler la commande">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (confirm("Annuler cette commande ? Les articles réservés redeviennent disponibles."))
            run(() => cancelAction(orderId, reason));
        }}
      >
        <p className="text-[14px] text-ink-soft">
          Libère les réservations. Les encaissements éventuels restent à rembourser.
        </p>
        <label className="label" htmlFor="cancel-r">
          Motif
        </label>
        <input
          id="cancel-r"
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={!!fieldErrors.reason}
        />
        <ActionFeedback failure={failure} success={success} />
        <button className="btn btn-danger" disabled={pending}>
          Annuler la commande
        </button>
      </form>
    </Section>
  );
}

export function ReturnForm({
  orderId,
  lines,
  net,
}: {
  orderId: string;
  lines: {
    id: string;
    name: string;
    options_label: string;
    quantity: number;
    returned_quantity: number;
    unit_price: number;
  }[];
  net: number;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [resellable, setResellable] = useState<"" | "yes" | "no">("");
  const [reason, setReason] = useState("");
  const [withRefund, setWithRefund] = useState(true);
  const [method, setMethod] = useState<(typeof methods)[number][0]>("cash");
  const value = lines.reduce((s, l) => s + (qty[l.id] ?? 0) * l.unit_price, 0);
  const [refundAmount, setRefundAmount] = useState("");
  const { run, pending, failure, success } = useAction();
  const returnable = lines.filter((l) => l.quantity > l.returned_quantity);
  if (!returnable.length) return null;
  return (
    <Section title="Enregistrer un retour">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!resellable) return;
          const amount = refundAmount === "" ? Math.min(value, net) : Number(refundAmount);
          run(
            () =>
              returnAction(orderId, {
                lines: Object.entries(qty).map(([lineId, quantity]) => ({
                  lineId,
                  quantity,
                })),
                resellable: resellable === "yes",
                reason,
                refund: withRefund && amount > 0 ? { method, amount } : null,
              }),
            { onSuccess: () => (setQty({}), setReason(""), setResellable("")) },
          );
        }}
      >
        <ul className="grid gap-2">
          {returnable.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3">
              <span className="text-[14px]">
                <span className="font-semibold">{l.name}</span> {l.options_label ? `— ${l.options_label}` : ""}
              </span>
              <label className="flex items-center gap-2 text-[14px]">
                <span className="sr-only">Quantité retournée pour {l.name}</span>
                <input
                  type="number"
                  min={0}
                  max={l.quantity - l.returned_quantity}
                  className="field h-10 min-h-10 w-20"
                  value={qty[l.id] ?? 0}
                  onChange={(e) =>
                    setQty({
                      ...qty,
                      [l.id]: Math.max(0, Math.min(l.quantity - l.returned_quantity, Number(e.target.value) || 0)),
                    })
                  }
                />
                / {l.quantity - l.returned_quantity}
              </label>
            </li>
          ))}
        </ul>
        <fieldset>
          <legend className="label">État constaté de l&apos;article</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label
              className={`flex min-h-12 items-center gap-2 rounded-[6px] border-[1.5px] px-3 ${resellable === "yes" ? "border-wa bg-wa-soft" : "border-line"}`}
            >
              <input type="radio" name="etat" checked={resellable === "yes"} onChange={() => setResellable("yes")} />{" "}
              Revendable — remettre en stock
            </label>
            <label
              className={`flex min-h-12 items-center gap-2 rounded-[6px] border-[1.5px] px-3 ${resellable === "no" ? "border-gps-red bg-gps-red-soft" : "border-line"}`}
            >
              <input type="radio" name="etat" checked={resellable === "no"} onChange={() => setResellable("no")} />{" "}
              Défectueux — ne pas remettre en stock
            </label>
          </div>
          {!resellable ? (
            <p className="hint">
              Validez l&apos;état avant d&apos;enregistrer : la remise en stock n&apos;a lieu que pour un article
              revendable.
            </p>
          ) : null}
        </fieldset>
        <input
          aria-label="Motif du retour"
          className="field"
          placeholder="Motif (obligatoire)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <label className="flex items-center gap-2 text-[15px]">
          <input type="checkbox" checked={withRefund} onChange={(e) => setWithRefund(e.target.checked)} /> Rembourser
          maintenant
        </label>
        {withRefund ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Moyen de remboursement"
              className="field"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {methods.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              aria-label="Montant remboursé"
              inputMode="numeric"
              className="field"
              placeholder={String(Math.min(value, net))}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        ) : null}
        <ActionFeedback failure={failure} success={success} />
        <button className="btn btn-blue" disabled={pending || !resellable || value === 0}>
          Enregistrer le retour ({fcfa(value)})
        </button>
      </form>
    </Section>
  );
}

export function FeeForm({ orderId, current }: { orderId: string; current: number | null }) {
  const [fee, setFee] = useState(current === null ? "" : String(current));
  const [unknown, setUnknown] = useState(current === null);
  const [reason, setReason] = useState("");
  const { run, pending, failure, success } = useAction();
  return (
    <Section title="Corriger les frais de livraison" open={current === null}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => deliveryFeeAction(orderId, unknown ? null : Number(fee || 0), reason));
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            aria-label="Frais de livraison"
            inputMode="numeric"
            className="field w-40"
            disabled={unknown}
            value={unknown ? "" : fee}
            onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))}
          />
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} /> À confirmer
          </label>
        </div>
        <input
          aria-label="Motif"
          className="field"
          placeholder="Motif (ex. frais confirmés au client)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <ActionFeedback failure={failure} success={success} />
        <button className="btn btn-outline" disabled={pending}>
          Enregistrer la correction
        </button>
      </form>
    </Section>
  );
}

export function NoteForm({ orderId }: { orderId: string }) {
  const [note, setNote] = useState("");
  const { run, pending, failure } = useAction();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => noteAction(orderId, note), { onSuccess: () => setNote("") });
      }}
    >
      <label className="label" htmlFor="note-int">
        Note interne
      </label>
      <textarea
        id="note-int"
        rows={2}
        className="field"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Visible uniquement par l'équipe"
      />
      <ActionFeedback failure={failure} />
      <button className="btn btn-outline btn-sm justify-self-start" disabled={pending || !note.trim()}>
        Ajouter la note
      </button>
    </form>
  );
}

/** Messages WhatsApp préparés : GPS les envoie elle-même, rien n'est envoyé automatiquement. */
export function WhatsAppMessages({
  phone,
  templates,
}: {
  phone: string;
  templates: { label: string; text: string }[];
}) {
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const t = templates[current];
  const link = whatsappLink(phone, t.text);
  return (
    <Section title="Préparer un message WhatsApp">
      <div className="grid gap-3">
        <label className="label" htmlFor="wa-tpl">
          Modèle
        </label>
        <select
          id="wa-tpl"
          className="field"
          value={current}
          onChange={(e) => {
            setCurrent(Number(e.target.value));
            setCopied(false);
          }}
        >
          {templates.map((x, i) => (
            <option key={x.label} value={i}>
              {x.label}
            </option>
          ))}
        </select>
        <textarea
          readOnly
          aria-label="Message préparé"
          className="field font-mono text-[13px]"
          rows={Math.min(12, t.text.split("\n").length + 1)}
          value={t.text}
        />
        <div className="flex flex-wrap gap-2">
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-sm">
              <IconWhatsApp size={18} /> Ouvrir dans WhatsApp
            </a>
          ) : (
            <p className="text-[13px] text-ink-mute">Numéro du client absent ou incomplet : copiez le message.</p>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(t.text);
                setCopied(true);
              } catch {}
            }}
          >
            <IconCopy size={16} /> {copied ? "Copié" : "Copier"}
          </button>
        </div>
        <p className="hint">
          L&apos;ouverture de WhatsApp prépare le message : il reste à l&apos;envoyer. Vérifiez l&apos;indicatif du
          numéro.
        </p>
      </div>
    </Section>
  );
}
