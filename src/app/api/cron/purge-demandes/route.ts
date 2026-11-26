import { isAuthorizedCron } from "@/lib/cron-auth";
import { getDb } from "@/server/db";
import { purgeExpiredRequests } from "@/server/domain/requests";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" };

/**
 * Nettoyage quotidien (tâche planifiée Vercel) : supprime les demandes non transformées en commande
 * après 48 h. Le secret est vérifié avant toute ouverture de la base ; sans secret valide, rien n'est lu ni supprimé.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401, headers: HEADERS });
  }
  try {
    const purged = await purgeExpiredRequests(await getDb());
    return Response.json({ purged }, { headers: HEADERS });
  } catch (error) {
    console.error("purge des demandes", error instanceof Error ? error.message : "erreur");
    return Response.json({ error: "purge impossible" }, { status: 500, headers: HEADERS });
  }
}
