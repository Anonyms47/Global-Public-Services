"use server";

import { getDb } from "@/server/db";
import { checkCart, type CartItemInput } from "@/server/domain/cart";
import { createRequest, type RequestInput } from "@/server/domain/requests";
import { AppError } from "@/server/domain/errors";

/** Revérifie prix et disponibilités (aucune réservation). */
export async function verifyCart(items: CartItemInput[]) {
  try {
    const db = await getDb();
    const safe = (Array.isArray(items) ? items : []).slice(0, 50).map((i) => ({
      variantId: String(i.variantId),
      quantity: Math.max(1, Math.min(99, Math.floor(Number(i.quantity) || 1))),
      seenPrice: Math.max(0, Math.floor(Number(i.seenPrice) || 0)),
    }));
    return { ok: true as const, items: await checkCart(db, safe) };
  } catch (error) {
    console.error(error);
    return {
      ok: false as const,
      error: "La vérification du panier a échoué. Vérifiez votre connexion puis réessayez.",
    };
  }
}

/**
 * Enregistre la demande avant l'ouverture de WhatsApp et renvoie sa référence.
 * En cas d'échec, le client peut quand même envoyer son message (sans référence).
 */
export async function registerRequest(input: RequestInput & { replacesId?: string }) {
  try {
    const db = await getDb();
    const items = (Array.isArray(input?.items) ? input.items : []).slice(0, 50).map((i) => ({
      variantId: String(i.variantId),
      quantity: Math.max(1, Math.min(99, Math.floor(Number(i.quantity) || 1))),
      seenPrice: Math.max(0, Math.floor(Number(i.seenPrice) || 0)),
    }));
    const fee = input?.deliveryFee;
    const r = await createRequest(db, {
      items,
      name: String(input?.name ?? ""),
      phone: String(input?.phone ?? ""),
      reception: input?.reception === "delivery" ? "delivery" : "pickup",
      zone: String(input?.zone ?? ""),
      address: String(input?.address ?? ""),
      deliveryFee: typeof fee === "number" && Number.isFinite(fee) && fee >= 0 ? Math.floor(fee) : null,
      note: String(input?.note ?? ""),
      replacesId: input?.replacesId ? String(input.replacesId).slice(0, 64) : undefined,
    });
    return { ok: true as const, reference: r.reference, id: r.id };
  } catch (error) {
    if (!(error instanceof AppError)) console.error(error);
    return { ok: false as const };
  }
}
