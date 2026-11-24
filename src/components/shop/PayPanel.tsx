"use client";

import { useState } from "react";
import { externalPayments, externalUrl, type ExternalMethod } from "@/lib/payment-links";
import { fcfa } from "@/lib/format";
import type { PayView } from "@/server/domain/payment-link";
import { declarePaymentAction } from "@/app/(site)/paiement/[token]/actions";

export function PayPanel({ token, view, whatsapp }: { token: string; view: PayView; whatsapp: string }) {
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [method, setMethod] = useState<ExternalMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const declared = !!view.declaredAt || state?.ok;

  async function copy() {
    try {
      await navigator.clipboard.writeText(String(view.balance));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  async function declare() {
    if (!method || busy) return;
    setBusy(true);
    setState(await declarePaymentAction(token, method));
    setBusy(false);
  }

  return (
    <section
      className="mx-auto max-w-xl rounded-2xl border border-line bg-white p-5 md:p-7"
      aria-labelledby="pay-title"
    >
      <p className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">Commande {view.reference}</p>
      <h1 id="pay-title" className="mt-1 text-2xl font-extrabold">
        Paiement de votre commande
      </h1>

      {view.paid ? (
        <p className="mt-4 rounded-lg bg-paper p-3 font-bold" data-testid="pay-done">
          Cette commande est déjà réglée. Merci !
        </p>
      ) : !view.amountKnown ? (
        <p className="mt-4 rounded-lg bg-paper p-3" data-testid="pay-unknown">
          Le montant total sera confirmé par GPS avant tout paiement. Rien à régler pour le moment.
        </p>
      ) : (
        <>
          <p className="mt-4 text-ink-soft">Montant à payer</p>
          <p className="text-4xl font-extrabold" data-testid="pay-amount">
            {fcfa(view.balance)}
          </p>
          <button type="button" onClick={copy} className="btn btn-ghost mt-2 min-h-11" data-testid="pay-copy">
            {copied ? "Montant copié" : "Copier le montant"}
          </button>

          <h2 className="mt-6 text-lg font-bold">1. Ouvrez votre application</h2>
          <p className="text-[14px] text-ink-soft">
            Avec Wave, le montant est déjà rempli. Avec Orange Money, saisissez le montant ci-dessus. Avant de valider,
            vérifiez dans l&apos;application que le bénéficiaire est bien <strong>GPS — Global Public Services</strong>.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(Object.entries(externalPayments) as [ExternalMethod, (typeof externalPayments)[ExternalMethod]][]).map(
              ([key, m]) => (
                <a
                  key={key}
                  href={externalUrl(key, view.balance)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMethod(key)}
                  className="btn btn-primary min-h-12 justify-center"
                  data-testid={`pay-${key}`}
                >
                  Payer avec {m.label}
                </a>
              ),
            )}
          </div>
          <p className="mt-3 rounded-lg bg-paper p-3 text-[13.5px]" role="note">
            GPS ne vous demandera jamais votre code secret, votre code PIN ni un code reçu par SMS.
          </p>

          <h2 className="mt-6 text-lg font-bold">2. Une fois le paiement fait</h2>
          <p className="mt-1 text-[14px] text-ink-soft">
            Faites une <strong>capture d&apos;écran</strong> de la confirmation de paiement et envoyez-la à GPS sur
            WhatsApp : c&apos;est ce qui permet de confirmer votre commande.
          </p>
          {declared ? (
            <div className="mt-2 rounded-lg bg-paper p-3" role="status" data-testid="pay-declared">
              <p className="font-bold">
                {state?.message ?? "Paiement déclaré. GPS vérifie la réception et vous confirme sur WhatsApp."}
              </p>
              <p className="mt-1">
                <strong>Dernière étape :</strong> envoyez à GPS une capture d&apos;écran de votre paiement sur WhatsApp
                pour confirmation de votre commande.
              </p>
              {whatsapp ? (
                <a
                  className="btn btn-primary mt-2 min-h-11 justify-center"
                  data-testid="pay-screenshot"
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Bonjour GPS, voici la capture de mon paiement pour la commande ${view.reference}.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Envoyer la capture sur WhatsApp
                </a>
              ) : null}
            </div>
          ) : (
            <>
              <label className="mt-2 block text-[14px] font-bold" htmlFor="pay-method">
                Moyen utilisé
              </label>
              <select
                id="pay-method"
                className="field mt-1 min-h-11 w-full"
                value={method ?? ""}
                onChange={(e) => setMethod((e.target.value || null) as ExternalMethod | null)}
              >
                <option value="">Choisir…</option>
                {Object.entries(externalPayments).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={declare}
                disabled={!method || busy}
                className="btn btn-primary mt-3 min-h-12 w-full justify-center disabled:opacity-50"
                data-testid="pay-declare"
              >
                J&apos;ai effectué le paiement
              </button>
              {state && !state.ok ? (
                <p className="mt-2 font-bold text-gps-red" role="alert">
                  {state.message}
                </p>
              ) : null}
              <p className="mt-2 text-[13px] text-ink-mute">
                Ce bouton prévient GPS. Votre commande n&apos;est marquée « payée » qu&apos;après réception de votre
                capture d&apos;écran et vérification du paiement.
              </p>
            </>
          )}
        </>
      )}
      {whatsapp ? (
        <p className="mt-6 text-[14px]">
          Une question ?{" "}
          <a
            className="font-bold text-gps-blue underline"
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Écrire à GPS sur WhatsApp
          </a>
        </p>
      ) : null}
    </section>
  );
}
