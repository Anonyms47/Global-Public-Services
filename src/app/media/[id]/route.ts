import { getDb } from "@/server/db";

/**
 * Fichiers téléversés depuis le Comptoir (stockés en base). Les requêtes
 * partielles (Range) sont prises en charge : Safari les exige pour lire une
 * vidéo, et elles permettent d'avancer dans la lecture.
 */
export async function GET(req: Request, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Introuvable", { status: 404 });
  const db = await getDb();
  const row = await db.one<{ mime: string; data: Uint8Array }>(
    "select mime, data from media where id = $1 and deleted_at is null",
    [id],
  );
  if (!row) return new Response("Introuvable", { status: 404 });
  const body = Buffer.from(row.data);
  const headers: Record<string, string> = {
    "Content-Type": row.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = body.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
    }
    return new Response(body.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(body, { headers: { ...headers, "Content-Length": String(body.length) } });
}
