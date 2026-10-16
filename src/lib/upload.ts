/**
 * Envoi de fichiers depuis le navigateur : réduction des photos avant l'envoi
 * (côté le plus long ≤ 2 000 px, WebP ou JPEG qualité 85 %) puis téléversement
 * en trois temps (préparation, envoi direct au stockage avec progression,
 * validation du contenu par le serveur). Les limites exactes dépendent du
 * stockage et sont contrôlées par le serveur.
 */

export const PHOTO_MAX_SIDE = 2000;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const isPhoto = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type);

function encode(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Photo réduite et recompressée ; l'original est gardé s'il est déjà plus léger. */
export async function optimizePhoto(file: File): Promise<File> {
  if (!isPhoto(file) || typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    return file;
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 600 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // WebP si le navigateur sait l'encoder (garde la transparence), sinon JPEG.
  let blob = await encode(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", 0.85);
  if (!blob || blob.size >= file.size) return file;
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + `.${ext}`, { type: blob.type });
}

export type UploadResult = { ok: true; data: { id: string; url: string; mime: string } } | { ok: false; error: string };

const ENDPOINT = "/comptoir/mediatheque/envoi";

async function call<T>(payload: object): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as { ok: true; data: T } | { ok: false; error: string };
  } catch {
    return { ok: false, error: "Connexion interrompue. Réessayez." };
  }
}

/** Envoi du fichier lui-même, avec progression (0 à 1). */
function put(target: { url: string; headers: Record<string, string> }, file: File, onProgress?: (p: number) => void) {
  return new Promise<{ ok: true } | { ok: false; error: string }>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ ok: true });
      let error = `Envoi refusé par le stockage (${xhr.status}).`;
      try {
        // Réponse du Comptoir (envoi local) : message déjà rédigé pour l'utilisateur.
        const j = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string };
        if (j.ok === false && typeof j.error === "string") error = j.error;
      } catch {}
      if (xhr.status === 413) error = "Fichier trop lourd pour l'envoi.";
      resolve({ ok: false, error });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Connexion interrompue. Réessayez." });
    xhr.ontimeout = () => resolve({ ok: false, error: "Envoi trop long. Réessayez." });
    xhr.timeout = 10 * 60_000;
    xhr.send(file);
  });
}

/**
 * Téléversement complet. En cas d'échec, l'envoi partiel est nettoyé côté
 * serveur et le fichier peut être renvoyé tel quel (« Réessayer »).
 */
export async function uploadFile(
  file: File,
  opts: { photosOnly?: boolean; onProgress?: (p: number) => void },
): Promise<UploadResult> {
  const start = await call<{ id: string; target: { url: string; headers: Record<string, string> } }>({
    action: "start",
    name: file.name,
    size: file.size,
    type: file.type,
    photos: !!opts.photosOnly,
  });
  if (!start.ok) return start;
  const sent = await put(start.data.target, file, opts.onProgress);
  if (!sent.ok) {
    await call({ action: "abort", id: start.data.id });
    return sent;
  }
  return call<{ id: string; url: string; mime: string }>({
    action: "finish",
    id: start.data.id,
    photos: !!opts.photosOnly,
  });
}

/** Contrôle avant envoi (après réduction des photos). */
export function precheck(file: File, photosOnly: boolean) {
  const video = /^video\/(mp4|webm|quicktime)$/.test(file.type) || /\.(mp4|m4v|mov|webm)$/i.test(file.name);
  if (photosOnly && !isPhoto(file)) return "Format non pris en charge : JPEG, PNG ou WebP.";
  if (!isPhoto(file) && !video) return "Format non pris en charge : JPEG, PNG, WebP, MP4, MOV ou WebM.";
  if (video && file.size > VIDEO_MAX_BYTES)
    return "Vidéo trop lourde (50 Mo maximum) : raccourcissez-la ou réduisez sa qualité.";
  if (!video && file.size > PHOTO_MAX_BYTES) return "Photo trop lourde, même après réduction (4 Mo maximum).";
  return null;
}
