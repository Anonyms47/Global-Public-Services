"use server";

import { getDb } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { declarePayment } from "@/server/domain/payment-link";
import { startWavePayment } from "@/server/domain/wave-checkout";

/** Déclaration du client : aucune écriture de paiement, seulement « à vérifier » pour GPS. */
export async function declarePaymentAction(token: string, method: string): Promise<{ ok: boolean; message: string }> {
  try {
    await declarePayment(await getDb(), String(token), String(method));
    return {
      ok: true,
      message:
        "Merci. Envoyez maintenant la capture d'écran de votre paiement à GPS sur WhatsApp : GPS vérifie puis confirme votre commande.",
    };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Une erreur est survenue. Réessayez ou écrivez-nous sur WhatsApp." };
  }
}

/** Paiement Wave automatique : renvoie l'adresse de paiement Wave pour le reste à payer de la commande. */
export async function startWaveAction(
  token: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    return { ok: true, url: await startWavePayment(await getDb(), String(token)) };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, message: e.message };
    console.error(e);
    return { ok: false, message: "Une erreur est survenue. Réessayez ou utilisez le lien manuel." };
  }
}
