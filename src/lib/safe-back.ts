/**
 * Adresse de retour vers la liste d'où l'on vient (« Retour aux résultats »).
 * Acceptée seulement si elle mène à la boutique ou à un univers du site, avec des paramètres connus :
 * jamais une adresse externe, un chemin détourné (« ../ ») ni une autre route du site.
 */
const ALLOWED_KEYS = new Set([
  "q",
  "categorie",
  "marque",
  "prix_min",
  "prix_max",
  "dispo",
  "promo",
  "etat",
  "tri",
  "n",
  "a",
]);
const PATH = /^\/(boutique|categories\/[a-z0-9-]+)$/;

export function safeBackUrl(raw: string | string[] | undefined | null): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 600 || !v.startsWith("/") || v.startsWith("//") || /[\\\s\u0000-\u001f]/.test(v)) return null;
  const q = v.indexOf("?");
  const path = q === -1 ? v : v.slice(0, q);
  if (!PATH.test(path)) return null;
  if (q === -1) return v;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(v.slice(q + 1));
  } catch {
    return null;
  }
  for (const key of params.keys()) if (!ALLOWED_KEYS.has(key)) return null;
  return v;
}
