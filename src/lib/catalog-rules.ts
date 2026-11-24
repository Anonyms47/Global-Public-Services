/**
 * Règles du catalogue partagées par le site, le Comptoir et les contrôles.
 * Fonctions pures : aucune donnée n'est modifiée ici, on signale ou on normalise un texte.
 */

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ——— Marques ———

/** Clé de comparaison d'une marque : « TDKC313 » et « Tdkc313 » sont la même marque. */
export const brandKey = (b: string) => norm(b).replace(/[^a-z0-9]/g, "");

/** Mots qui désignent un type d'objet ou une famille, pas une marque. */
const NOT_BRANDS = new Set([
  "chaussures",
  "chaussure",
  "tablette",
  "tablettes",
  "telephone",
  "telephones",
  "portable",
  "portables",
  "iphone",
  "earphone",
  "earphones",
  "ecouteurs",
  "casque",
  "chargeur",
  "cable",
  "coque",
  "montre",
  "montres",
  "accessoires",
  "informatique",
  "produit",
  "divers",
  "autre",
  "autres",
]);

/** La valeur n'est pas une marque : un type d'objet, ou le nom d'une catégorie. */
export function isNotABrand(brand: string, categoryNames: string[] = []) {
  const k = brandKey(brand);
  if (!k) return false;
  return NOT_BRANDS.has(k) || categoryNames.some((c) => brandKey(c) === k);
}

/** Le « champ marque » contient un modèle (ex. « Samsung galaxie A06 ») plutôt qu'une marque. */
export function brandLooksLikeModel(brand: string) {
  const words = brand.trim().split(/\s+/).filter(Boolean);
  return words.length >= 3 || /\b(galaxy|galaxie|iphone)\b/i.test(brand);
}

/** Écriture retenue pour chaque marque : la plus fréquente (puis l'ordre alphabétique). */
export function brandIndex(brands: string[]) {
  const counts = new Map<string, Map<string, number>>();
  for (const raw of brands) {
    const b = raw.trim().replace(/\s+/g, " ");
    const k = brandKey(b);
    if (!k) continue;
    const m = counts.get(k) ?? new Map<string, number>();
    m.set(b, (m.get(b) ?? 0) + 1);
    counts.set(k, m);
  }
  return new Map(
    [...counts].map(
      ([k, m]) =>
        [
          k,
          // Le plus fréquent ; à égalité, celui qui commence par une majuscule.
          [...m].sort(
            (a, b) =>
              b[1] - a[1] ||
              Number(/^[A-Z0-9]/.test(b[0])) - Number(/^[A-Z0-9]/.test(a[0])) ||
              a[0].localeCompare(b[0]),
          )[0][0],
        ] as const,
    ),
  );
}

// ——— Noms ———

const ACRONYMS = /\b(rgb|led|usb|gan|tws|sim|hdmi|nfc|pd|ssd|hdd)\b/gi;

/**
 * Nom public propre : espaces, ponctuation, casse, unités (Go, To, W, mAh) et
 * orthographe « Galaxy » quand il s'agit manifestement d'un modèle Samsung.
 * Ne change jamais le sens du nom ni la marque.
 */
export function normalizeProductName(name: string) {
  let s = name.replace(/\s+/g, " ").trim();
  s = s.replace(/\s+([.,;:!?])/g, "$1").replace(/([,;:])(?=\S)(?!\d)/g, "$1 ");
  // Point final ou point isolé après un mot (« Fast. 27w ») : sans effet sur 2.5 ou 6.7.
  s = s
    .replace(/\.(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\bgalaxie(?=\s+(?:tab|note|flip|fold|buds|watch|[a-z]\s?\d|\d))/gi, (m) =>
    m[0] === "G" ? "Galaxy" : "galaxy",
  );
  s = s.replace(/(\d)\s*(?:go|gb)\b/gi, "$1 Go").replace(/(\d)\s*to\b/gi, "$1 To");
  s = s.replace(/(\d)\s*w\b/gi, "$1 W").replace(/(\d)\s*mah\b/gi, "$1 mAh");
  s = s.replace(/\b(usb)-?c\b/gi, "USB-C");
  s = s.replace(ACRONYMS, (m) => m.toUpperCase());
  if (/^[a-zà-ÿ]/.test(s)) s = s[0].toUpperCase() + s.slice(1);
  return s;
}

/** Noms qui ne disent pas ce que l'on achète. */
const GENERIC_NAMES = new Set([
  "samsung",
  "tablette",
  "chaussures",
  "chaussure",
  "iphone",
  "airpod",
  "airpods",
  "telephone",
  "portable",
  "montre",
  "montres",
  "casque",
  "chargeur",
  "cable",
  "coque",
  "ecouteurs",
]);

export function isGenericName(name: string) {
  return GENERIC_NAMES.has(
    norm(name)
      .replace(/[^a-z0-9 ]/g, "")
      .trim(),
  );
}

// ——— Prix ———

/** Prix manifestement faux : chiffres répétés (11 111 111), démesuré ou presque nul. On ne le corrige jamais seul. */
export function priceLooksWrong(price: number) {
  if (!Number.isFinite(price)) return true;
  if (price > 5_000_000) return true;
  if (price >= 1_000_000 && /^(\d)\1{4,}$/.test(String(price))) return true;
  return price > 0 && price < 100;
}

/** Valeur médiane (prix d'une catégorie) pour repérer un prix hors norme. */
export function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ——— Fiche complète / vitrine ———

export interface ShowcaseFacts {
  name: string;
  description: string;
  imageCount: number;
  minPrice: number;
}

/** Ce qui empêche une fiche d'être mise en avant automatiquement (vedette, grande photo de l'accueil). */
export function showcaseIssues(p: ShowcaseFacts) {
  const out: string[] = [];
  if (p.imageCount < 1) out.push("sans photo");
  if (p.description.trim().length < 40) out.push("sans description");
  if (isGenericName(p.name)) out.push("nom trop vague");
  if (p.minPrice <= 0 || priceLooksWrong(p.minPrice)) out.push("prix à vérifier");
  return out;
}

export const showcaseReady = (p: ShowcaseFacts) => showcaseIssues(p).length === 0;

// ——— Ressemblance (produits proches, doublons possibles) ———

const STOP = new Set(["de", "du", "des", "la", "le", "les", "pour", "avec", "et", "en", "a", "au", "aux", "sans"]);

/** Mots significatifs d'un nom : sans accents, sans mots vides, « galaxie » = « galaxy ». */
export function nameTokens(name: string) {
  return norm(name)
    .replace(/galaxie/g, "galaxy")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

export function similarity(a: string, b: string) {
  const A = new Set(nameTokens(a));
  const B = new Set(nameTokens(b));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / (A.size + B.size - common);
}
