/**
 * Photos réduites par le site lui-même (route /media/[id]?w=…), sans passer par
 * l'optimisation d'images de l'hébergeur : son quota gratuit s'épuise vite
 * (réponse 402 « paiement requis » : les photos ne s'affichaient plus).
 * `sharp` est fourni avec Next.js ; s'il manque, l'original est servi.
 */

/** Largeurs servies : peu de variantes, donc peu de calculs et un cache efficace. */
export const IMAGE_WIDTHS = [128, 256, 384, 640, 828, 1200, 1920] as const;

/** Au-delà, l'original est servi tel quel (mémoire du serveur). */
export const MAX_RESIZE_BYTES = 12 * 1024 * 1024;

/** Largeur demandée (?w=) ramenée à la plus proche largeur autorisée au-dessus ; null si absente ou invalide. */
export function snapWidth(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const w = Number(value);
  if (w < 1) return null;
  return IMAGE_WIDTHS.find((x) => x >= w) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

/** Photo réduite en WebP, sans agrandissement. null si le traitement échoue : l'original est alors servi. */
export async function resizeToWebp(bytes: Uint8Array, width: number): Promise<Uint8Array | null> {
  try {
    const { default: sharp } = await import("sharp");
    const out = await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
  } catch (error) {
    console.error("Redimensionnement impossible, original servi :", error);
    return null;
  }
}
