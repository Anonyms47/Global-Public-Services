import { getDb } from "@/server/db";
import { currentUser } from "@/server/admin";
import { mediaFile, readMediaBytes } from "@/server/domain/media";
import { mediaStorage } from "@/server/storage";

/**
 * Diffusion des fichiers de la médiathèque.
 * - Public : fichiers d'une fiche publiée, de la vitrine ou d'une catégorie
 *   visible. Cache court (5 min) : un fichier dépublié, remplacé (nouvelle
 *   adresse) ou mis à la corbeille cesse d'être servi au plus tard 5 min après.
 * - Privé : brouillons, fichiers non utilisés, corbeille : équipe connectée
 *   seulement ; ailleurs la réponse est « introuvable » (rien n'est révélé).
 * Vidéos en stockage objet : redirection vers une adresse de lecture signée
 * de courte durée ; le navigateur les charge progressivement par plages.
 * Photos : relayées avec prise en charge des requêtes partielles (Range).
 */
export async function GET(req: Request, ctx: RouteContext<"/media/[id]">) {
  const { id } = await ctx.params;
  const notFound = () => new Response("Introuvable", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!/^[0-9a-f-]{36}$/.test(id)) return notFound();
  const db = await getDb();
  const file = await mediaFile(db, id);
  if (!file) return notFound();
  if (!file.public && !(await currentUser())) return notFound();
  // Jamais de cache partagé pour un fichier non publié (brouillon, corbeille, non utilisé).
  const cache = file.public ? "public, max-age=60, s-maxage=300" : "private, no-store";

  const cfg = mediaStorage();
  if (file.mime.startsWith("video/") && file.storage_path && cfg.store?.backend === file.storage_backend) {
    const signed = await cfg.store.signedUrl?.(file.storage_path, 3600);
    if (signed) {
      return new Response(null, {
        status: 302,
        headers: { Location: signed, "Cache-Control": "private, max-age=600" },
      });
    }
  }

  const read = await readMediaBytes(db, file, req.headers.get("range"), cfg);
  if (!read) return notFound();
  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  if (read.status === 416) {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": read.contentRange! } });
  }
  if (read.length) headers["Content-Length"] = String(read.length);
  if (read.contentRange) headers["Content-Range"] = read.contentRange;
  return new Response(read.body as BodyInit, { status: read.status, headers });
}
