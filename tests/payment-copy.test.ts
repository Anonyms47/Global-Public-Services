import { describe, expect, it } from "vitest";
import { customPaymentNote, paymentShort, paymentSteps } from "@/lib/payment-copy";

describe("textes de paiement communs", () => {
  const both = { pickupEnabled: true, deliveryEnabled: true };

  it("ignore les anciens textes par défaut, garde les conditions personnalisées", () => {
    expect(
      customPaymentNote(
        "Rien n'est à régler sur le site. Le règlement se fait au comptoir ou à la livraison. Les moyens acceptés vous sont confirmés par GPS avec votre commande.",
      ),
    ).toBe("");
    expect(customPaymentNote("Le paiement ne se fait pas sur le site lui-même. Depuis votre panier…")).toBe("");
    expect(customPaymentNote("")).toBe("");
    expect(customPaymentNote("Acompte de 30 % pour les commandes spéciales.")).toBe(
      "Acompte de 30 % pour les commandes spéciales.",
    );
  });

  it("décrit seulement les options actives et ne contredit jamais le paiement par application", () => {
    expect(paymentSteps(both)).toMatch(/au comptoir, lors du retrait ou à la livraison/);
    expect(paymentSteps({ pickupEnabled: false, deliveryEnabled: true })).not.toMatch(/comptoir/);
    expect(paymentSteps({ pickupEnabled: true, deliveryEnabled: false })).not.toMatch(/livraison\./);
    expect(paymentShort({ pickupEnabled: false, deliveryEnabled: false })).not.toMatch(/comptoir|livraison/i);
    for (const t of [paymentSteps(both), paymentShort(both)]) {
      expect(t).not.toMatch(/Rien n'est à régler/);
      expect(t).toMatch(/Wave ou Orange Money/);
      expect(t).toMatch(/vérifi/);
      expect(t).toMatch(/jamais|n'est pris en compte qu'une fois/);
    }
  });
});
