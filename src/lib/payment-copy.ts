/**
 * Phrases de paiement communes à la fiche produit, la FAQ et les conditions de vente.
 * Une seule formulation : le paiement est proposé, puis déclaré par le client, puis vérifié par GPS.
 * Un clic, une redirection, une déclaration ou une capture d'écran ne marquent jamais une commande payée.
 * Le texte « Moyens de paiement » du Comptoir s'ajoute comme complément : il ne remplace pas ce socle.
 */
export interface PaymentOptions {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
}

const VERIFIED =
  "Un paiement n'est pris en compte qu'une fois sa réception vérifiée par GPS : la commande n'est marquée payée qu'après cette vérification, jamais sur la seule foi d'un clic, d'une redirection, d'une déclaration ou d'une capture d'écran.";

function onSite(r: PaymentOptions) {
  const parts: string[] = [];
  if (r.pickupEnabled) parts.push("au comptoir, lors du retrait");
  if (r.deliveryEnabled) parts.push("à la livraison");
  return parts.length ? `Vous pouvez aussi payer ${parts.join(" ou ")}.` : "";
}

/** Version courte (fiche produit). */
export function paymentShort(r: PaymentOptions) {
  const where = ["Wave ou Orange Money (applications externes)"];
  if (r.pickupEnabled) where.push("au comptoir");
  if (r.deliveryEnabled) where.push("à la livraison");
  return `Paiement possible : ${where.join(", ")}. ${VERIFIED}`;
}

/** Version détaillée (FAQ, conditions de vente) : où, quand, et comment c'est vérifié. */
export function paymentSteps(r: PaymentOptions) {
  return [
    "Le paiement ne se fait pas sur le site lui-même. Il est facultatif au moment de la commande : une fois votre récapitulatif prêt, vous pouvez payer par Wave ou Orange Money (applications externes, non intégrées au site) puis envoyer votre message WhatsApp en joignant la capture d'écran du paiement.",
    onSite(r),
    VERIFIED,
  ]
    .filter(Boolean)
    .join(" ");
}

const plain = (s: string) => s.toLowerCase().replace(/[’`´]/g, "'").replace(/\s+/g, " ").trim();

/** Anciens textes par défaut du réglage « Moyens de paiement » : ils contredisent ou répètent le socle commun. */
const LEGACY_PREFIXES = [
  "rien n'est à régler sur le site",
  "le paiement ne se fait pas sur le site lui-même",
  "paiement par wave, orange money, au comptoir ou à la livraison",
];

/**
 * Complément saisi par GPS dans le Comptoir. Un ancien texte par défaut identifiable est ignoré
 * (sans rien effacer dans les réglages) ; une condition personnalisée est conservée telle quelle.
 */
export function customPaymentNote(raw: string | undefined | null) {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const p = plain(text);
  return LEGACY_PREFIXES.some((l) => p.startsWith(l)) ? "" : text;
}
