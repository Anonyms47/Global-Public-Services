import { getDb } from "@/server/db";
import { purgeExpiredRequests } from "@/server/domain/requests";

export const dynamic = "force-dynamic";

/** Appelé chaque jour par Vercel : supprime les demandes non transformées en commande après 48 h. */
export async function GET() {
  try {
    const count = await purgeExpiredRequests(await getDb());
    return Response.json({ purged: count });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "purge impossible" }, { status: 500 });
  }
}
