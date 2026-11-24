/**
 * Adresse des images affichées par next/image.
 * - Médiathèque (/media/…) : réduite par notre route avec ?w=<largeur>.
 * - Le reste (logos, photos d'exemple) : adresse d'origine, sans optimisation payante de l'hébergeur.
 */
export default function imageLoader({ src, width }: { src: string; width: number; quality?: number }) {
  if (!src.startsWith("/media/")) return src;
  return `${src}${src.includes("?") ? "&" : "?"}w=${width}`;
}
