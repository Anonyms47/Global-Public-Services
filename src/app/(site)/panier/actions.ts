"use server";

import { getDb } from "@/server/db";
import { checkCart, type CartItemInput } from "@/server/domain/cart";

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
