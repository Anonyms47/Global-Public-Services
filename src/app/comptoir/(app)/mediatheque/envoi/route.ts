import { z } from "zod";
import { currentUser } from "@/server/admin";
import { getDb, isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { abortUpload, finishUpload, receiveUpload, startUpload } from "@/server/domain/media";
import { can } from "@/lib/permissions";

/**
 * Envoi d'un fichier (photo ou vidéo) en trois temps, avec suivi de progression
 * dans le navigateur : « start » prépare l'envoi (adresse directe vers le
 * stockage), le navigateur envoie le fichier, « finish » vérifie le contenu réel.
 * « abort » nettoie un envoi interrompu. PUT reçoit le fichier quand le stockage
 * ne permet pas l'envoi direct (disque local, mode en base).
 * Mêmes contrôles que les actions du Comptoir : session, droits, mot de passe
 * provisoire, même origine.
 */
async function guard(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return { error: Response.json({ ok: false, error: "Origine refusée." }, { status: 403 }) };
  }
  const user = await currentUser();
  if (!user) {
    return { error: Response.json({ ok: false, error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 }) };
  }
  if (!can(user, "catalog.edit") || user.must_change_password) {
    return { error: Response.json({ ok: false, error: "Vous n'avez pas les droits nécessaires." }, { status: 403 }) };
  }
  return { user };
}

function failure(error: unknown) {
  if (error instanceof AppError) {
    return Response.json({ ok: false, error: error.message }, { status: error.code === "not_found" ? 404 : 400 });
  }
  console.error(error);
  return Response.json({ ok: false, error: "Envoi impossible. Réessayez dans un instant." }, { status: 500 });
}

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    name: z.string().max(300),
    size: z.number().int().positive(),
    type: z.string().max(100),
    photos: z.boolean().optional(),
  }),
  z.object({ action: z.literal("finish"), id: z.string().uuid(), photos: z.boolean().optional() }),
  z.object({ action: z.literal("abort"), id: z.string().uuid() }),
]);

export async function POST(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  try {
    const parsed = body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("validation", "Demande d'envoi invalide.");
    const d = parsed.data;
    const db = await getDb();
    if (d.action === "start") {
      const r = await startUpload(db, {
        name: d.name,
        size: d.size,
        type: d.type,
        userId: g.user.id,
        isDemo: isDemoMode(),
        imagesOnly: d.photos,
      });
      return Response.json({ ok: true, data: r });
    }
    if (d.action === "finish") {
      return Response.json({ ok: true, data: await finishUpload(db, d.id, g.user.id, { imagesOnly: d.photos }) });
    }
    await abortUpload(db, d.id, g.user.id);
    return Response.json({ ok: true, data: null });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(req: Request) {
  const g = await guard(req);
  if (g.error) return g.error;
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError("validation", "Envoi inconnu.");
    await receiveUpload(await getDb(), id, g.user.id, new Uint8Array(await req.arrayBuffer()));
    return Response.json({ ok: true, data: null });
  } catch (error) {
    return failure(error);
  }
}
