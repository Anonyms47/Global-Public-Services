/** Moyens de paiement proposés au Comptoir (ordre d'affichage). */
export const paymentMethods = [
  ["cash", "Espèces"],
  ["wave", "Wave"],
  ["orange_money", "Orange Money"],
  ["mobile_money", "Autre mobile money"],
  ["bank_transfer", "Virement"],
  ["card", "Carte"],
  ["other", "Autre"],
] as const;

export type PaymentMethodKey = (typeof paymentMethods)[number][0];
