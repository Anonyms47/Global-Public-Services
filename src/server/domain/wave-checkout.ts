import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/client";
import { AppError } from "./errors";
import { event, getOrder, recordAutomaticPayment } from "./orders";

/**
 * Paiement Wave automatique (API Wave Checkout) : session créée côté serveur pour le reste à payer,
 * confirmation uniquement par webhook signé puis revérifiée auprès de Wave. Un clic ou un retour de
 * page ne marque jamais une commande comme payée. Sans clé configurée, le parcours manuel reste actif.
 */
const API = "https://api.wave.com";

export const waveAutoEnabled = () => !!process.env.WAVE_API_KEY && !!process.env.WAVE_WEBHOOK_SECRET;

interface WaveSession {
  id: string;
  amount: string;
  currency: string;
  checkout_status: "open" | "complete" | "expired";
  payment_status: "processing" | "cancelled" | "succeeded";
  client_reference: string | null;
  transaction_id?: string | null;
  wave_launch_url: string;
  when_expires?: string | null;
}

async function wave<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.WAVE_API_KEY;
  if (!key) throw new AppError("conflict", "Le paiement Wave automatique n'est pas activé.");
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!r.ok) {
    console.error("Wave API", r.status, await r.text().catch(() => ""));
    throw new AppError("conflict", "Wave ne répond pas pour le moment. Réessayez ou utilisez le lien manuel.");
  }
  return (await r.json()) as T;
}

/** Adresse de paiement Wave pour le reste à payer d'une commande (session réutilisée si encore ouverte). */
export async function startWavePayment(db: Db, token: string): Promise<string> {
  if (!waveAutoEnabled()) throw new AppError("conflict", "Le paiement Wave automatique n'est pas activé.");
  const row = await db.one<{ id: string; reference: string }>(
    "select id, reference from orders where pay_token = $1 and status <> 'cancelled'",
    [token],
  );
  if (!row) throw new AppError("not_found", "Lien de paiement introuvable.");
  const o = await getOrder(db, row.id);
  if (!o || o.feeUnknown || o.balance <= 0) throw new AppError("conflict", "Aucun montant à régler pour le moment.");

  const open = await db.one<{ launch_url: string }>(
    "select launch_url from wave_sessions where order_id = $1 and status = 'open' and amount = $2 and (expires_at is null or expires_at > now() + interval '2 minutes') order by created_at desc limit 1",
    [row.id, o.balance],
  );
  if (open) return open.launch_url;

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(site)) throw new AppError("conflict", "Adresse du site non configurée pour le paiement.");
  const s = await wave<WaveSession>("/v1/checkout/sessions", {
    method: "POST",
    body: JSON.stringify({
      amount: String(o.balance),
      currency: "XOF",
      client_reference: row.reference,
      success_url: `${site}/paiement/${token}?retour=succes`,
      error_url: `${site}/paiement/${token}?retour=echec`,
    }),
  });
  await db.query("insert into wave_sessions (id, order_id, amount, launch_url, expires_at) values ($1,$2,$3,$4,$5)", [
    s.id,
    row.id,
    o.balance,
    s.wave_launch_url,
    s.when_expires ?? null,
  ]);
  await event(
    db,
    row.id,
    "payment_wave",
    `Session de paiement Wave créée pour ${o.balance.toLocaleString("fr-FR")} FCFA.`,
    null,
  );
  return s.wave_launch_url;
}

/** Signature Wave : en-tête « t=<secondes>,v1=<hex>[,v1=<hex>] », HMAC-SHA256 de t + corps brut. */
export function verifyWaveSignature(rawBody: string, header: string | null, secret: string, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d{9,12}$/.test(t) || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}${rawBody}`).digest("hex"));
  return sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

type WaveEvent = { id?: string; type?: string; data?: { id?: string } };

/**
 * Traite un événement déjà authentifié. Le paiement n'est enregistré qu'après relecture de la session
 * auprès de Wave (montant, état « succeeded ») et sans jamais dépasser le solde de la commande.
 */
async function processWaveEvent(
  db: Db,
  ev: WaveEvent,
): Promise<"ignored" | "duplicate" | "recorded" | "to_review" | "failed"> {
  if (!ev.id || !ev.type) return "ignored";
  const fresh = await db.one<{ id: string }>(
    "insert into wave_events (id, type) values ($1,$2) on conflict (id) do nothing returning id",
    [ev.id, ev.type],
  );
  if (!fresh) return "duplicate";
  const sessionId = ev.data?.id;
  if (!sessionId || !/^cos-/.test(sessionId)) return "ignored";
  const ours = await db.one<{ order_id: string; amount: number; status: string }>(
    "select order_id, amount, status from wave_sessions where id = $1",
    [sessionId],
  );
  if (!ours) return "ignored";

  if (ev.type === "checkout.session.payment_failed") {
    await event(db, ours.order_id, "payment_wave", "Paiement Wave échoué ou annulé par le client.", null);
    return "failed";
  }
  if (ev.type !== "checkout.session.completed" || ours.status === "paid") return "ignored";

  const s = await wave<WaveSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
  const ok = s.payment_status === "succeeded" && s.currency === "XOF" && Number(s.amount) === ours.amount;
  if (!ok) {
    await db.query("update wave_sessions set status = 'to_review' where id = $1", [sessionId]);
    await event(
      db,
      ours.order_id,
      "payment_wave",
      "Notification Wave reçue mais non concordante : à vérifier dans l'application Wave.",
      null,
    );
    return "to_review";
  }
  const done = await recordAutomaticPayment(db, ours.order_id, {
    method: "wave",
    amount: ours.amount,
    note: `Wave automatique${s.transaction_id ? ` — transaction ${s.transaction_id}` : ""}`,
  });
  await db.query("update wave_sessions set status = $2, transaction_id = $3, completed_at = now() where id = $1", [
    sessionId,
    done ? "paid" : "to_review",
    s.transaction_id ?? null,
  ]);
  if (!done)
    await event(
      db,
      ours.order_id,
      "payment_wave",
      `Paiement Wave de ${ours.amount.toLocaleString("fr-FR")} FCFA reçu mais non enregistré (commande annulée, déjà soldée ou montant supérieur au solde) : à traiter au Comptoir.`,
      null,
    );
  return done ? "recorded" : "to_review";
}

export async function handleWaveEvent(db: Db, ev: WaveEvent) {
  try {
    return await processWaveEvent(db, ev);
  } catch (e) {
    // Échec de traitement : l'événement n'est pas marqué comme reçu, la relance de Wave pourra aboutir.
    if (ev.id) await db.query("delete from wave_events where id = $1", [ev.id]).catch(() => {});
    throw e;
  }
}
