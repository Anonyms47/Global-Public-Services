import { fcfa } from "./format";
import { renderTemplate, type TemplateKey } from "./templates";

/**
 * Choix du message WhatsApp selon la situation réelle de la demande ou de la commande.
 * Le premier message de la liste est celui conseillé ; les autres restent proposés.
 * Rien n'est envoyé automatiquement : la personne relit et envoie elle-même.
 */
export interface PreparedMessage {
  key: TemplateKey;
  label: string;
  text: string;
  recommended: boolean;
}

type Templates = Record<TemplateKey, string>;
type Labels = Record<TemplateKey, { label: string }>;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

function build(keys: TemplateKey[], templates: Templates, labels: Labels, vars: Record<string, string>) {
  const seen = new Set<TemplateKey>();
  return keys
    .filter((k) => (seen.has(k) ? false : (seen.add(k), true)))
    .map<PreparedMessage>((key, i) => ({
      key,
      label: labels[key].label,
      text: renderTemplate(templates[key], vars),
      recommended: i === 0,
    }));
}

// ——— Demandes WhatsApp (panier envoyé depuis le site) ———

export interface RequestForMessage {
  reference: string;
  customer_name: string;
  reception: "pickup" | "delivery";
  delivery_zone: string;
  delivery_fee: number | null;
  lines: { variantId: string; name: string; optionsLabel: string; quantity: number; unitPrice: number }[];
}

export function requestMessages(
  r: RequestForMessage,
  available: Map<string, number>,
  templates: Templates,
  labels: Labels,
) {
  const label = (l: RequestForMessage["lines"][number]) => `${l.name}${l.optionsLabel ? ` (${l.optionsLabel})` : ""}`;
  const ok = r.lines.filter((l) => (available.get(l.variantId) ?? 0) >= l.quantity);
  const missing = r.lines.filter((l) => (available.get(l.variantId) ?? 0) < l.quantity);
  const subtotal = r.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const fee = r.reception === "delivery" ? r.delivery_fee : 0;
  const vars = {
    prenom: firstName(r.customer_name),
    reference: r.reference,
    articles: r.lines.map((l) => `• ${label(l)} × ${l.quantity}`).join("\n"),
    total: fcfa(subtotal),
    livraison:
      r.reception === "delivery"
        ? `Livraison${r.delivery_zone ? ` (${r.delivery_zone})` : ""} : ${fee === null ? "frais confirmés dans un instant" : fcfa(fee)}`
        : "",
    total_a_payer: r.reception === "delivery" && fee !== null ? `Total à payer : ${fcfa(subtotal + fee)}` : "",
    reception: r.reception === "delivery" ? "livraison" : "retrait en boutique",
    disponibles: ok.length ? `Disponible :\n${ok.map((l) => `• ${label(l)} × ${l.quantity}`).join("\n")}` : "",
    indisponibles: missing.length
      ? `Pas disponible pour le moment :\n${missing
          .map((l) => {
            const n = Math.max(0, available.get(l.variantId) ?? 0);
            return `• ${label(l)}${n > 0 ? ` (seulement ${n} en stock sur ${l.quantity} demandés)` : ""}`;
          })
          .join("\n")}`
      : "",
  };
  // Stock inconnu (aucune ligne vérifiée) : seul l'accusé de réception est conseillé.
  const checked = r.lines.some((l) => available.has(l.variantId));
  const main: TemplateKey = !checked
    ? "requestReceived"
    : !missing.length
      ? "requestAvailable"
      : ok.length
        ? "requestPartial"
        : "requestUnavailable";
  return build(
    [main, "requestReceived", ...(checked ? [] : (["requestAvailable"] as TemplateKey[]))],
    templates,
    labels,
    vars,
  );
}

// ——— Commandes ———

export interface OrderForMessage {
  reference: string;
  customer_name: string;
  status: "confirmed" | "completed" | "cancelled";
  fulfillment: "to_prepare" | "ready" | "out_for_delivery" | "handed_over";
  /** « immediate » : vente au comptoir, remise sur-le-champ. */
  reception: "pickup" | "delivery" | "immediate";
  subtotal: number;
  delivery_fee: number | null;
  delivery_address: string;
  delivery_zone: string;
  balance: number;
  /** Montant net déjà réglé (paiements moins remboursements). */
  net: number;
  refunded: number;
  lines: { name: string; options_label: string; quantity: number }[];
}

export interface PickupPlace {
  name: string;
  address: string;
  landmark: string;
}

export function orderMessages(
  o: OrderForMessage,
  ctx: { hours: string; store?: PickupPlace | null },
  templates: Templates,
  labels: Labels,
) {
  const due = o.subtotal + (o.delivery_fee ?? 0);
  const where = o.delivery_address || o.delivery_zone;
  const place = ctx.store
    ? `à ${ctx.store.name}${ctx.store.address ? `, ${ctx.store.address}` : ""}${ctx.store.landmark ? ` (${ctx.store.landmark})` : ""}`
    : "en boutique";
  const toRefund = o.balance < 0 ? -o.balance : 0;
  const vars = {
    prenom: firstName(o.customer_name),
    reference: o.reference,
    articles: o.lines
      .map((l) => `• ${l.name}${l.options_label ? ` (${l.options_label})` : ""} × ${l.quantity}`)
      .join("\n"),
    total: fcfa(o.subtotal),
    livraison:
      o.reception === "delivery"
        ? `Livraison : ${o.delivery_fee === null ? "frais confirmés avant le départ" : fcfa(o.delivery_fee)}`
        : "",
    total_a_payer:
      o.reception === "delivery" && o.delivery_fee !== null && o.delivery_fee > 0 ? `Total à payer : ${fcfa(due)}` : "",
    reception:
      o.reception === "delivery"
        ? "livraison"
        : o.reception === "immediate"
          ? "achat en boutique"
          : "retrait en boutique",
    paiement:
      o.balance <= 0 && o.net > 0
        ? "Paiement reçu, merci."
        : o.net > 0
          ? `Déjà réglé : ${fcfa(o.net)}. Reste à régler : ${fcfa(o.balance)}.`
          : o.balance > 0
            ? `À régler ${o.reception === "delivery" ? "à la livraison" : "au retrait"} : ${fcfa(o.balance)}.`
            : "",
    reste:
      o.balance > 0
        ? o.reception === "delivery"
          ? `Montant à remettre au livreur : ${fcfa(o.balance)}.`
          : `Reste à régler au retrait : ${fcfa(o.balance)}.`
        : o.net > 0
          ? "Votre commande est déjà réglée."
          : "",
    solde: fcfa(Math.max(0, o.balance)),
    deja_regle: o.net > 0 ? `Déjà réglé : ${fcfa(o.net)}.` : "",
    boutique: place,
    horaires: ctx.hours ? `(${ctx.hours})` : "",
    adresse: where ? `à : ${where}` : "",
    zone: o.delivery_zone ? `(${o.delivery_zone})` : "",
    remboursement:
      o.refunded > 0 && toRefund === 0
        ? `Le remboursement de ${fcfa(o.refunded)} a été effectué.`
        : toRefund > 0
          ? `Le montant déjà réglé (${fcfa(toRefund)}) vous sera remboursé : nous vous contactons pour convenir du moyen.`
          : "",
  };

  const keys: TemplateKey[] = [];
  if (o.status === "cancelled") {
    keys.push("cancelled", ...(o.refunded > 0 || toRefund > 0 ? (["refund"] as TemplateKey[]) : []));
  } else if (o.status === "completed" || o.fulfillment === "handed_over") {
    keys.push(
      ...(toRefund > 0 ? (["refund"] as TemplateKey[]) : []),
      ...(o.balance > 0 ? (["balance"] as TemplateKey[]) : []),
      "thanks",
    );
  } else {
    const needsAddress = o.reception === "delivery" && (!o.delivery_address.trim() || o.delivery_fee === null);
    if (o.fulfillment === "to_prepare") {
      keys.push(...(needsAddress ? (["addressRequest"] as TemplateKey[]) : []), "confirmation", "delay");
    } else if (o.fulfillment === "ready") {
      if (o.reception === "pickup") keys.push("readyPickup", "pickupReminder");
      else keys.push(...(needsAddress ? (["addressRequest"] as TemplateKey[]) : []), "readyDelivery");
    } else if (o.fulfillment === "out_for_delivery") {
      keys.push("outForDelivery");
    }
    if (o.balance > 0) keys.push("balance");
    if (toRefund > 0) keys.push("refund");
    keys.push("confirmation");
  }
  return build(keys, templates, labels, vars);
}
