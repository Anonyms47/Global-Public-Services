import { currentUser } from "@/server/admin";
import { getDb, isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { storeMedia } from "@/server/domain/media";
import { can } from "@/lib/permissions";

/**
 * Téléversement d'un fichier (photo ou vidéo) avec suivi de progression dans le
 * navigateur. Mêmes contrôles que les actions du Comptoir : session, droits,
 * mot de passe provisoire, même origine ; type vérifié sur le contenu.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return Response.json({ ok: false, error: "Origine refusée." }, { status: 403 });
  }
  const user = await currentUser();
  if (!user) return Response.json({ ok: false, error: "Votre session a expiré. Reconnectez-vous." }, { status: 401 });
  if (!can(user, "catalog.edit") || user.must_change_password) {
    return Response.json({ ok: false, error: "Vous n'avez pas les droits nécessaires." }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("validation", "Aucun fichier reçu.");
    const media = await storeMedia(await getDb(), {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      userId: user.id,
      isDemo: isDemoMode(),
      imagesOnly: form.get("photos") === "1",
    });
    return Response.json({ ok: true, data: media });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ ok: false, error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ ok: false, error: "Envoi impossible. Réessayez dans un instant." }, { status: 500 });
  }
}
