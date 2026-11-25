/**
 * Recherche du catalogue : pertinence par champ, sans fausse équivalence entre modèles.
 *
 * - un chiffre doit correspondre exactement (13 ≠ 16, 13 ≠ 130) ;
 * - « iphone 13 » ne retient pas un article réservé à l'iPhone 13 Pro ou 13 Pro Max ;
 * - le nom et les caractéristiques comptent plus que la catégorie et les options ;
 * - une référence interne ne sert qu'à retrouver cette référence (saisie entière ou début d'une référence).
 */
export interface SearchableProduct {
  name: string;
  brand: string;
  categoryName: string | null;
  specs: { label: string; value: string }[];
  variants: { sku: string; options: Record<string, string> }[];
}

/** Minuscules, sans accents, lettres et chiffres séparés (« iphone13 » → « iphone 13 »). */
export function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export const normalizeText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Mots qui font d'un modèle un autre modèle (13 → 13 Pro) : jamais équivalents. */
const MODEL_QUALIFIERS = new Set([
  "pro",
  "max",
  "plus",
  "mini",
  "ultra",
  "lite",
  "fe",
  "air",
  "flip",
  "fold",
  "se",
  "neo",
  "edge",
  "note",
]);

/** Équivalences courantes (même objet, autre mot). */
const SYNONYMS: string[][] = [
  ["telephone", "smartphone", "portable", "mobile", "gsm"],
  ["ecouteur", "oreillette", "earbud", "earphone", "intra"],
  ["chargeur", "charger", "adaptateur", "secteur"],
  ["coque", "case", "housse", "protection"],
  ["casque", "headphone", "headset"],
  ["montre", "watch"],
  ["cable", "cordon", "fil"],
  ["batterie", "powerbank", "power"],
  ["enceinte", "haut", "speaker"],
  ["chaussure", "basket", "sneaker", "tong", "sandale"],
  ["lunette", "sunglass"],
];

/** Singulier approximatif : « coques » → « coque », « cables » → « cable ». */
function stem(t: string) {
  return t.length > 3 && /[sx]$/.test(t) ? t.slice(0, -1) : t;
}

const isNumber = (t: string) => /^\d+$/.test(t);

function sameWord(q: string, f: string) {
  if (q === f) return true;
  if (isNumber(q) || isNumber(f)) return false;
  const qs = stem(q);
  const fs = stem(f);
  if (qs === fs) return true;
  // Début de mot (« samsu » → « samsung ») : à partir de 4 lettres, jamais pour un qualificatif de modèle (« pro »).
  if (qs.length >= 4 && !MODEL_QUALIFIERS.has(qs) && fs.startsWith(qs)) return true;
  return SYNONYMS.some((g) => g.includes(qs) && g.includes(fs));
}

const hasWord = (field: string[], q: string) => field.some((f) => sameWord(q, f));

/**
 * Le modèle cherché est-il, dans ce champ, suivi d'un qualificatif absent de la recherche ?
 * (« iphone 13 » dans « iPhone 13 Pro Max » → oui : c'est un autre modèle.)
 */
function qualifiedElsewhere(field: string[], qTokens: string[]): boolean {
  const nums = qTokens.filter(isNumber);
  if (!nums.length) return false;
  for (const n of nums) {
    for (let i = 0; i < field.length - 1; i++) {
      if (field[i] === n && MODEL_QUALIFIERS.has(field[i + 1]) && !qTokens.includes(field[i + 1])) return true;
    }
  }
  return false;
}

export interface SearchScore {
  /** 0 = pas de résultat. */
  score: number;
}

const W = { name: 10, specs: 6, brand: 5, category: 3, options: 2, reference: 20 } as const;

/** Note de pertinence d'un article pour une recherche ; 0 si l'article ne correspond pas. */
export function searchScore(rawQuery: string, p: SearchableProduct): number {
  const q = tokens(rawQuery);
  if (!q.length) return 0;
  const rawNorm = normalizeText(rawQuery).replace(/\s+/g, "");

  // Référence : saisie entière (ou début d'une référence d'au moins 6 signes) — jamais un mot isolé.
  if (rawNorm.length >= 6) {
    for (const v of p.variants) {
      const sku = normalizeText(v.sku).replace(/\s+/g, "");
      if (sku === rawNorm) return 1000 + W.reference;
      if (sku.startsWith(rawNorm) && /[a-z]/.test(rawNorm) && /\d|-/.test(rawNorm)) return 100 + W.reference;
    }
  }

  const name = tokens(p.name);
  const brand = tokens(p.brand);
  const category = tokens(p.categoryName ?? "");
  const specs = p.specs.flatMap((s) => tokens(`${s.label} ${s.value}`));
  const compat = p.specs.filter((s) => /compatib/i.test(s.label)).map((s) => tokens(s.value));
  const options = p.variants.flatMap((v) => Object.values(v.options).flatMap((o) => tokens(o)));

  let total = 0;
  for (const t of q) {
    let best = 0;
    if (hasWord(name, t)) best = W.name;
    else if (hasWord(specs, t)) best = W.specs;
    else if (hasWord(brand, t)) best = W.brand;
    else if (hasWord(category, t)) best = W.category;
    else if (hasWord(options, t)) best = W.options;
    if (!best) return 0;
    total += best;
  }

  // Modèle exact : les mots de la recherche se suivent dans le nom (ou la compatibilité déclarée).
  const fields = [name, ...compat];
  // La suite ne doit pas continuer par un qualificatif absent de la recherche (13 → 13 Pro : autre modèle).
  const exactModel = fields.some((f) => {
    for (let i = 0; i + q.length <= f.length; i++) {
      if (!q.every((t, k) => sameWord(t, f[i + k]))) continue;
      const next = f[i + q.length];
      if (!next || !MODEL_QUALIFIERS.has(next) || q.includes(next)) return true;
    }
    return false;
  });
  if (exactModel) total += 15;
  // Autre modèle de la même famille (13 Pro pour « iphone 13 ») : pas équivalent, écarté.
  else if (fields.some((f) => qualifiedElsewhere(f, q))) return 0;
  return Math.max(1, total);
}

/** Classe les articles par pertinence décroissante ; les articles sans lien avec la recherche sont écartés. */
export function rankBySearch<T extends SearchableProduct>(rawQuery: string, list: T[]): T[] {
  return list
    .map((p) => ({ p, s: searchScore(rawQuery, p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}
