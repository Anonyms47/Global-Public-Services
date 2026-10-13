import { getDb } from "@/server/db";

/** Photos téléversées depuis le Comptoir (stockées en base ; voir README pour un stockage objet en production). */
export async function GET(_req: Request, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const db = await getDb();
  const row = await db.one<{ mime: string; data: Uint8Array }>("select mime, data from media where id = $1", [id]);
  if (!row) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
