"use client";

import { useState } from "react";
import { payLinkAction } from "@/app/comptoir/(app)/commandes/actions";
import { externalPayments, isExternalMethod } from "@/lib/payment-links";
import { formatDateTime } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";
import { IconCopy } from "../ui/icons";

/**
 * Paiement à distance : lien privé à donner au client une fois la commande et la disponibilité confirmées.
 * Une déclaration du client reste « à vérifier » jusqu'à l'enregistrement d'un encaissement ci-dessous.
 */
export function PayLink({
  orderId,
  token,
  siteUrl,
  declaredAt,
  declaredMethod,
  balance,
  feeUnknown,
}: {
  orderId: string;
  token: string | null;
  siteUrl: string;
  declaredAt: string | null;
  declaredMethod: string | null;
  balance: number;
  feeUnknown: boolean;
}) {
  const [current, setCurrent] = useState(token);
  const [copied, setCopied] = useState(false);
  const { run, pending, failure } = useAction();
  const link = current ? `${siteUrl.replace(/\/$/, "")}/paiement/${current}` : "";
  const label = isExternalMethod(declaredMethod) ? externalPayments[declaredMethod].label : "";

  return (
    <section className="rounded-xl border border-line bg-white p-4" aria-labelledby="paylink-title">
      <h2 id="paylink-title" className="text-lg font-bold">
        Paiement à distance
      </h2>
      {declaredAt && balance > 0 ? (
        <p className="mt-2 rounded-lg bg-amber-50 p-3 font-bold text-amber-900" data-testid="paiement-declare">
          Paiement déclaré{label ? ` (${label})` : ""} — à vérifier · {formatDateTime(declaredAt)}
          <span className="mt-1 block font-normal">
            Le client doit envoyer une capture d&apos;écran du paiement sur WhatsApp. Vérifiez la réception dans
            l&apos;application Wave ou Orange Money, puis enregistrez l&apos;encaissement ci-dessous. Une déclaration
            n&apos;est pas un paiement.
          </span>
        </p>
      ) : null}
      {feeUnknown ? (
        <p className="mt-2 text-[14px] text-ink-soft">
          Le montant total n&apos;est pas chiffré (livraison). Le lien n&apos;affichera aucun montant à payer tant que
          la livraison n&apos;est pas fixée.
        </p>
      ) : (
        <p className="mt-2 text-[14px] text-ink-soft">
          À donner au client seulement après confirmation de la commande et de la disponibilité.
        </p>
      )}
      {link ? (
        <div className="mt-3 grid gap-2">
          <input
            className="field"
            readOnly
            value={link}
            aria-label="Lien de paiement"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="btn btn-ghost min-h-11"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <IconCopy size={18} /> {copied ? "Lien copié" : "Copier le lien"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary mt-3 min-h-11"
          disabled={pending}
          onClick={() =>
            run(() => payLinkAction(orderId), { onSuccess: (r) => setCurrent((r as { token: string }).token) })
          }
        >
          Créer le lien de paiement
        </button>
      )}
      <ActionFeedback failure={failure} />
    </section>
  );
}
