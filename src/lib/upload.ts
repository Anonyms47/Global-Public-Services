/**
 * Envoi de fichiers depuis le navigateur : réduction des photos avant l'envoi
 * (côté le plus long ≤ 2 000 px, WebP ou JPEG qualité 85 %) puis téléversement
 * avec progression.
 */

export const PHOTO_MAX_SIDE = 2000;
export const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 4 * 1024 * 1024;

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

/** Téléversement avec progression (0 à 1). */
export function uploadFile(file: File, opts: { photosOnly?: boolean; onProgress?: (p: number) => void }) {
  return new Promise<UploadResult>((resolve) => {
    const fd = new FormData();
    fd.append("file", file);
    if (opts.photosOnly) fd.append("photos", "1");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/comptoir/mediatheque/envoi");
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as UploadResult);
      } catch {
        resolve({
          ok: false,
          error:
            xhr.status === 413 ? "Fichier trop lourd pour l'envoi." : `Réponse inattendue du serveur (${xhr.status}).`,
        });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Connexion interrompue. Réessayez." });
    xhr.ontimeout = () => resolve({ ok: false, error: "Envoi trop long. Réessayez." });
    xhr.timeout = 120_000;
    xhr.send(fd);
  });
}

/** Contrôle avant envoi (après réduction des photos). */
export function precheck(file: File, photosOnly: boolean) {
  const video = /^video\/(mp4|webm|quicktime)$/.test(file.type);
  if (photosOnly && !isPhoto(file)) return "Format non pris en charge : JPEG, PNG ou WebP.";
  if (!isPhoto(file) && !video) return "Format non pris en charge : JPEG, PNG, WebP, MP4 ou WebM.";
  if (video && file.size > VIDEO_MAX_BYTES)
    return "Vidéo trop lourde (4 Mo maximum) : raccourcissez-la ou réduisez sa qualité.";
  if (!video && file.size > PHOTO_MAX_BYTES) return "Photo trop lourde, même après réduction (3 Mo maximum).";
  return null;
}
