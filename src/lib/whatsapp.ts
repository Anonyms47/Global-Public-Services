import { fcfa } from "./format";

/** Lien wa.me, ou null si le numéro n'est pas configuré (mode démonstration). */
export function whatsappLink(number: string, text: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export interface MessageLine {
  sku: string;
  name: string;
  optionsLabel: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderMessageInput {
  lines: MessageLine[];
  reception: "pickup" | "delivery";
  pickupDetails?: string;
  zone?: string;
  /** null = frais inconnus, à confirmer */
  deliveryFee: number | null;
  address?: string;
  name: string;
  phone?: string;
  note?: string;
  /** Référence de la demande enregistrée (GPS-R-…), si l'enregistrement a réussi. */
  reference?: string;
}

/** Information précisée par GPS au cas par cas (jamais « à confirmer » affiché publiquement). */
export const TO_CONFIRM = "Précisé par GPS sur WhatsApp";

export function orderSubtotal(lines: MessageLine[]) {
  return lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

/** Message de commande envoyé par le client à GPS via WhatsApp. */
export function buildOrderMessage(input: OrderMessageInput) {
  const out: string[] = [
    "Bonjour GPS, je souhaite passer cette commande :",
    ...(input.reference ? [`Demande ${input.reference}`] : []),
    "",
  ];
  input.lines.forEach((l, i) => {
    out.push(`${i + 1}. ${l.name}${l.optionsLabel ? ` — ${l.optionsLabel}` : ""}`);
    out.push(`   Réf. ${l.sku} · Qté ${l.quantity} × ${fcfa(l.unitPrice)} = ${fcfa(l.unitPrice * l.quantity)}`);
  });
  const subtotal = orderSubtotal(input.lines);
  out.push("", `Total des produits : ${fcfa(subtotal)}`);
  if (input.reception === "pickup") {
    out.push(`Réception : retrait en boutique${input.pickupDetails ? ` (${input.pickupDetails})` : ""}`);
  } else {
    out.push(`Réception : livraison${input.zone ? ` — zone : ${input.zone}` : ""}`);
    if (input.address) out.push(`Adresse de livraison : ${input.address}`);
    out.push(`Frais de livraison : ${input.deliveryFee === null ? TO_CONFIRM : fcfa(input.deliveryFee)}`);
    if (input.deliveryFee !== null) out.push(`Total avec livraison : ${fcfa(subtotal + input.deliveryFee)}`);
  }
  out.push("", `Nom : ${input.name}`);
  if (input.phone) out.push(`Téléphone : ${input.phone}`);
  if (input.note) out.push(`Précision : ${input.note}`);
  out.push("", "Merci de me confirmer la disponibilité et le montant final.");
  return out.join("\n");
}

export function productQuestionMessage(name: string, url: string, optionsLabel?: string) {
  return [
    `Bonjour GPS, j'ai une question sur ce produit :`,
    `${name}${optionsLabel ? ` — ${optionsLabel}` : ""}`,
    url,
  ].join("\n");
}
