"use server";

import { getDb } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { declarePayment } from "@/server/domain/payment-link";

/** Déclaration du client : aucune écriture de paiement, seulement « à vérifier » pour GPS. */
export async function declarePaymentAction(token: string, method: string): Promise<{ ok: boolean; message: string }> {
  try {
    await declarePayment(await getDb(), String(token), String(method));
    return { ok: true, message: "Merci. GPS vérifie la réception du paiement et vous confirme sur WhatsApp." };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Une erreur est survenue. Réessayez ou écrivez-nous sur WhatsApp." };
  }
}
