import { getDb } from "@/server/db";
import { handleWaveEvent, verifyWaveSignature } from "@/server/domain/wave-checkout";

export const dynamic = "force-dynamic";

/** Webhook Wave : corps brut vérifié avant tout traitement ; réponse 2xx rapide, doublons ignorés. */
export async function POST(req: Request) {
  const secret = process.env.WAVE_WEBHOOK_SECRET;
  if (!secret) return new Response("not configured", { status: 404 });
  const raw = await req.text();
  if (!verifyWaveSignature(raw, req.headers.get("wave-signature"), secret)) {
    return new Response("invalid signature", { status: 401 });
  }
  let ev: unknown;
  try {
    ev = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    const result = await handleWaveEvent(await getDb(), ev as Parameters<typeof handleWaveEvent>[1]);
    return Response.json({ ok: true, result });
  } catch (e) {
    console.error("webhook Wave", e);
    // Non-2xx : Wave réessaie (jusqu'à 3 jours), le traitement est idempotent.
    return new Response("error", { status: 500 });
  }
}
