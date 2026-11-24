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

export type ExternalMethod = keyof typeof externalPayments;
export const isExternalMethod = (m: unknown): m is ExternalMethod =>
  typeof m === "string" && Object.hasOwn(externalPayments, m);
