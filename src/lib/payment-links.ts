/**
 * Liens de paiement externes de GPS. Adresses fixes, sans montant ni paramètre ajouté :
 * le client saisit le montant dans l'application après l'avoir copié.
 */
export const externalPayments = {
  wave: { label: "Wave", url: "https://pay.wave.com/m/M_sn_FYzmkydjF1K-/c/sn/" },
  orange_money: {
    label: "Orange Money / MAXIT",
    url: "https://sugu.orange-sonatel.com/mp/dmeNogywEehFTqIm7Com",
  },
} as const;

/**
 * Lien Wave avec le montant de la commande ajouté (demande de GPS) : le client n'a rien à saisir.
 * Le montant est un entier en FCFA ; sans montant valable, le lien de base est renvoyé.
 */
export function externalUrl(method: ExternalMethod, amount?: number) {
  const base = externalPayments[method].url;
  return method === "wave" && Number.isInteger(amount) && (amount as number) > 0 ? `${base}?amount=${amount}` : base;
}

export type ExternalMethod = keyof typeof externalPayments;
export const isExternalMethod = (m: unknown): m is ExternalMethod =>
  typeof m === "string" && Object.hasOwn(externalPayments, m);
