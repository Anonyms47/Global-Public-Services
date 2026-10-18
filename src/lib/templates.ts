/**
 * Modèles de messages WhatsApp du Comptoir. Variables entre accolades ;
 * une variable vide disparaît, et une ligne devenue vide est retirée.
 * Les messages sont préparés par le Comptoir mais toujours envoyés à la main.
 */
export const templateKeys = [
  "requestReceived",
  "requestAvailable",
  "requestPartial",
  "requestUnavailable",
  "confirmation",
  "addressRequest",
  "delay",
  "readyPickup",
  "pickupReminder",
  "readyDelivery",
  "outForDelivery",
  "balance",
  "thanks",
  "cancelled",
  "refund",
] as const;
export type TemplateKey = (typeof templateKeys)[number];

export const templateGroups = [
  {
    label: "Demandes reçues depuis le site",
    keys: ["requestReceived", "requestAvailable", "requestPartial", "requestUnavailable"],
  },
  { label: "Commande en préparation", keys: ["confirmation", "addressRequest", "delay"] },
  { label: "Retrait et livraison", keys: ["readyPickup", "pickupReminder", "readyDelivery", "outForDelivery"] },
  { label: "Paiement, fin de commande", keys: ["balance", "thanks", "cancelled", "refund"] },
] as const satisfies readonly { label: string; keys: readonly TemplateKey[] }[];

export const templateMeta: Record<TemplateKey, { label: string; when: string; vars: string[] }> = {
  requestReceived: {
    label: "Accusé de réception d'une demande",
    when: "Dès qu'une demande arrive, avant de vérifier le stock.",
    vars: ["prenom", "reference"],
  },
  requestAvailable: {
    label: "Demande : tout est disponible",
    when: "Proposé quand chaque article de la demande est en stock.",
    vars: ["prenom", "reference", "articles", "total", "livraison", "total_a_payer", "reception"],
  },
  requestPartial: {
    label: "Demande : une partie seulement est disponible",
    when: "Proposé quand au moins un article manque ou n'est pas en quantité suffisante.",
    vars: ["prenom", "reference", "disponibles", "indisponibles"],
  },
  requestUnavailable: {
    label: "Demande : rien n'est disponible",
    when: "Proposé quand aucun article de la demande n'est en stock.",
    vars: ["prenom", "reference", "indisponibles"],
  },
  confirmation: {
    label: "Confirmation de commande",
    when: "Commande à préparer.",
    vars: ["prenom", "reference", "articles", "total", "livraison", "total_a_payer", "reception", "paiement"],
  },
  addressRequest: {
    label: "Demander l'adresse ou un repère",
    when: "Livraison sans adresse précise ou sans frais confirmés.",
    vars: ["prenom", "reference", "zone"],
  },
  delay: {
    label: "Prévenir d'un retard",
    when: "Commande à préparer qui prend plus de temps que prévu.",
    vars: ["prenom", "reference"],
  },
  readyPickup: {
    label: "Commande prête au retrait",
    when: "Commande prête, retrait en boutique.",
    vars: ["prenom", "reference", "boutique", "horaires", "reste"],
  },
  pickupReminder: {
    label: "Rappel : commande à retirer",
    when: "Commande prête au retrait qui n'a pas encore été retirée.",
    vars: ["prenom", "reference", "boutique", "horaires", "reste"],
  },
  readyDelivery: {
    label: "Commande prête à livrer",
    when: "Commande prête, livraison.",
    vars: ["prenom", "reference", "adresse", "reste"],
  },
  outForDelivery: {
    label: "Commande en route",
    when: "Commande partie en livraison.",
    vars: ["prenom", "reference", "adresse", "reste"],
  },
  balance: {
    label: "Rappel de solde",
    when: "Il reste un montant à régler.",
    vars: ["prenom", "reference", "solde", "deja_regle"],
  },
  thanks: {
    label: "Remerciement après remise",
    when: "Commande remise au client.",
    vars: ["prenom", "reference"],
  },
  cancelled: {
    label: "Annulation de commande",
    when: "Commande annulée.",
    vars: ["prenom", "reference", "remboursement"],
  },
  refund: {
    label: "Remboursement",
    when: "Un montant a été ou doit être remboursé.",
    vars: ["prenom", "reference", "remboursement"],
  },
};

export const defaultTemplates: Record<TemplateKey, string> = {
  requestReceived:
    "Bonjour {prenom}, GPS a bien reçu votre demande {reference}. Nous vérifions la disponibilité et revenons vers vous très vite.",
  requestAvailable:
    "Bonjour {prenom}, bonne nouvelle : tout est disponible pour votre demande {reference}.\n{articles}\nTotal articles : {total}\n{livraison}\n{total_a_payer}\nRéception : {reception}.\nRépondez « OK » pour confirmer et nous préparons votre commande.",
  requestPartial:
    "Bonjour {prenom}, merci pour votre demande {reference}.\n{disponibles}\n{indisponibles}\nSouhaitez-vous que l'on prépare ce qui est disponible ? Nous pouvons aussi vous proposer un article équivalent.",
  requestUnavailable:
    "Bonjour {prenom}, merci pour votre demande {reference}. Désolé, ces articles ne sont pas disponibles pour le moment.\n{indisponibles}\nNous pouvons vous proposer un article équivalent ou vous prévenir dès leur retour en stock.",
  confirmation:
    "Bonjour {prenom}, GPS confirme votre commande {reference} :\n{articles}\nTotal articles : {total}\n{livraison}\n{total_a_payer}\nRéception : {reception}.\n{paiement}\nMerci pour votre confiance — GPS, le service qui rassure.",
  addressRequest:
    "Bonjour {prenom}, pour livrer votre commande {reference} {zone}, pouvez-vous nous envoyer l'adresse exacte et un repère (ou votre position WhatsApp) ? Nous vous confirmons ensuite les frais et l'heure de livraison.",
  delay:
    "Bonjour {prenom}, votre commande {reference} prend un peu plus de temps que prévu. Nous vous prévenons dès qu'elle est prête. Merci pour votre patience — GPS.",
  readyPickup:
    "Bonjour {prenom}, votre commande {reference} est prête. Vous pouvez venir la retirer {boutique} {horaires}.\n{reste}\nPensez à donner la référence {reference} au comptoir.",
  pickupReminder:
    "Bonjour {prenom}, petit rappel : votre commande {reference} vous attend {boutique} {horaires}.\n{reste}\nSi vous avez un empêchement, dites-le-nous simplement.",
  readyDelivery:
    "Bonjour {prenom}, votre commande {reference} est prête et sera bientôt livrée {adresse}.\n{reste}\nNous vous prévenons au départ du livreur.",
  outForDelivery:
    "Bonjour {prenom}, votre commande {reference} est en route {adresse}. Le livreur vous appelle à l'arrivée.\n{reste}",
  balance:
    "Bonjour {prenom}, il reste {solde} à régler pour votre commande {reference}.\n{deja_regle}\nVous pouvez régler au comptoir ou à la livraison. Merci — GPS.",
  thanks:
    "Bonjour {prenom}, merci pour votre achat chez GPS (commande {reference}). Gardez bien votre reçu : il vous sera demandé pour toute question ou garantie. À bientôt !",
  cancelled:
    "Bonjour {prenom}, votre commande {reference} a été annulée.\n{remboursement}\nN'hésitez pas à nous écrire si vous souhaitez passer une nouvelle commande.",
  refund:
    "Bonjour {prenom}, concernant votre commande {reference} :\n{remboursement}\nMerci pour votre compréhension — GPS.",
};

/**
 * Anciens textes par défaut : un modèle resté identique à l'un d'eux est remplacé par
 * le nouveau texte par défaut. Un modèle personnalisé n'est jamais touché.
 */
export const legacyTemplates: Partial<Record<TemplateKey, string[]>> = {
  confirmation: [
    "Bonjour {prenom}, GPS confirme votre commande {reference} :\n{articles}\nTotal articles : {total}\n{livraison}\nRéception : {reception}.\n{reste}\nMerci pour votre confiance — GPS, le service qui rassure.",
  ],
  readyPickup: [
    "Bonjour {prenom}, votre commande {reference} est prête. Vous pouvez venir la retirer en boutique {horaires}.\n{reste}",
  ],
  readyDelivery: ["Bonjour {prenom}, votre commande {reference} est prête et va être livrée {adresse}.\n{reste}"],
  balance: ["Bonjour {prenom}, il reste {solde} à régler pour votre commande {reference}. Merci — GPS."],
  requestReceived: [
    "Bonjour {prenom}, GPS a bien reçu votre demande {reference}. Nous vérifions la disponibilité et revenons vers vous.",
  ],
};

/** Modèles enregistrés, complétés par les modèles par défaut et mis à niveau s'ils n'ont jamais été modifiés. */
export function withDefaultTemplates(saved: Partial<Record<string, string>> | undefined): Record<TemplateKey, string> {
  const out = { ...defaultTemplates };
  for (const k of templateKeys) {
    const v = saved?.[k];
    if (typeof v === "string" && v.trim() && !legacyTemplates[k]?.includes(v)) out[k] = v;
  }
  return out;
}

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
