/**
 * Modèles de messages WhatsApp du Comptoir. Variables entre accolades ;
 * une variable vide disparaît, et une ligne devenue vide est retirée.
 */
export const templateKeys = ["confirmation", "readyPickup", "readyDelivery", "balance", "requestReceived"] as const;
export type TemplateKey = (typeof templateKeys)[number];

export const templateMeta: Record<TemplateKey, { label: string; vars: string[] }> = {
  confirmation: {
    label: "Confirmation de commande",
    vars: ["prenom", "reference", "articles", "total", "livraison", "reception", "reste"],
  },
  readyPickup: { label: "Commande prête au retrait", vars: ["prenom", "reference", "horaires", "reste"] },
  readyDelivery: { label: "Commande prête à livrer", vars: ["prenom", "reference", "adresse", "reste"] },
  balance: { label: "Rappel de solde", vars: ["prenom", "reference", "solde"] },
  requestReceived: { label: "Accusé de réception d'une demande", vars: ["prenom", "reference"] },
};

export const defaultTemplates: Record<TemplateKey, string> = {
  confirmation:
    "Bonjour {prenom}, GPS confirme votre commande {reference} :\n{articles}\nTotal articles : {total}\n{livraison}\nRéception : {reception}.\n{reste}\nMerci pour votre confiance — GPS, le service qui rassure.",
  readyPickup:
    "Bonjour {prenom}, votre commande {reference} est prête. Vous pouvez venir la retirer en boutique {horaires}.\n{reste}",
  readyDelivery: "Bonjour {prenom}, votre commande {reference} est prête et va être livrée {adresse}.\n{reste}",
  balance: "Bonjour {prenom}, il reste {solde} à régler pour votre commande {reference}. Merci — GPS.",
  requestReceived:
    "Bonjour {prenom}, GPS a bien reçu votre demande {reference}. Nous vérifions la disponibilité et revenons vers vous.",
};

export function renderTemplate(template: string, vars: Record<string, string>) {
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .split("\n")
    .map((l) =>
      l
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([.,])/g, "$1")
        .trimEnd(),
    )
    .filter((l) => l.trim() && !/^[.,:;\s]+$/.test(l))
    .join("\n");
}
