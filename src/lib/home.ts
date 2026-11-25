/**
 * Choix éditoriaux de la page d'accueil, calculés à partir des données réelles du catalogue.
 * Aucune classification inventée : les entrées « par besoin » renvoient vers des univers qui existent déjà.
 */
import { sameWord, tokens } from "./search";

export interface HomeCategory {
  slug: string;
  name: string;
  position: number;
  product_count: number;
  featured?: boolean;
}

export const PRIORITY_UNIVERS = 6;
/** Sans univers épinglé au Comptoir : au moins ce nombre d'articles pour être mis en avant à l'accueil. */
const MIN_FOR_AUTO = 3;

/**
 * Univers prioritaires : ceux épinglés au Comptoir (dans l'ordre du Comptoir), sinon les premiers de la liste
 * du Comptoir qui ont assez d'articles. Les autres univers restent accessibles par « Tous les univers ».
 */
export function priorityUnivers<T extends HomeCategory>(categories: T[], max = PRIORITY_UNIVERS): T[] {
  const withProducts = categories.filter((c) => c.product_count > 0).sort((a, b) => a.position - b.position);
  const pinned = withProducts.filter((c) => c.featured);
  if (pinned.length) return pinned.slice(0, max);
  const solid = withProducts.filter((c) => c.product_count >= MIN_FOR_AUTO);
  return (solid.length >= 3 ? solid : withProducts).slice(0, max);
}

export interface Need {
  key: string;
  label: string;
  hint: string;
  /** Univers (par adresse) vers lequel mène l'entrée. */
  slug: string;
}

/** Entrées « par besoin » : seulement celles dont l'univers existe et contient des articles. */
export const NEEDS: Need[] = [
  { key: "charger", label: "Charger", hint: "Chargeurs et batteries", slug: "chargeurs" },
  { key: "proteger", label: "Protéger son téléphone", hint: "Coques et protections", slug: "protections-coques" },
  { key: "ecouter", label: "Écouter", hint: "Écouteurs et AirPods", slug: "airpods-ecouteurs" },
  { key: "creer", label: "Créer du contenu", hint: "Lumière, micro, trépied", slug: "creation-de-contenu" },
];

export function availableNeeds<T extends HomeCategory>(categories: T[]): (Need & { count: number })[] {
  return NEEDS.flatMap((n) => {
    const cat = categories.find((c) => c.slug === n.slug);
    return cat && cat.product_count > 0 ? [{ ...n, count: cat.product_count }] : [];
  });
}

/** Une raison sociale identique au nom commercial n'est pas répétée. */
export function distinctLegalName(legalName: string, companyName: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return legalName && norm(legalName) !== norm(companyName) ? legalName : "";
}

/** Numéro lisible : +221 77 176 08 36 pour un numéro sénégalais complet, sinon tel que saisi. */
export function displayPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (/^221\d{9}$/.test(digits)) {
    const n = digits.slice(3);
    return `+221 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7)}`;
  }
  return raw;
}

/** Article candidat à la couverture d'un univers. */
export interface CoverCandidate {
  name: string;
  categorySlug: string | null;
  images: { url: string }[];
  /** Fiche complète (photo, description, nom précis) : à préférer pour une vitrine. */
  ready?: boolean;
}

const COVER_STOPWORDS = new Set(["et", "de", "du", "des", "la", "le", "les", "d", "l", "pour", "en", "aux", "a", "au"]);

/**
 * Photo de couverture d'un univers. Priorité : la couverture choisie au Comptoir ; sinon la photo d'un article
 * qui porte le nom de l'univers (un câble pour « Câbles »), complet et illustré ; sinon le premier article illustré.
 * Aucune photo n'est modifiée ni remplacée : c'est un choix d'affichage recalculé à chaque fois.
 */
export function categoryCover(
  cat: { slug: string; name: string; image_url?: string | null },
  products: CoverCandidate[],
): string | undefined {
  if (cat.image_url) return cat.image_url;
  const nouns = tokens(cat.name).filter((t) => !COVER_STOPWORDS.has(t) && !/^\d+$/.test(t));
  const mine = products.filter((p) => p.categorySlug === cat.slug && p.images.length > 0);
  if (!mine.length) return undefined;
  const score = (p: CoverCandidate) => {
    const words = tokens(p.name);
    const named = nouns.some((n) => words.some((w) => sameWord(n, w)));
    const leading = nouns.some((n) => words[0] && sameWord(n, words[0]));
    return (named ? 10 : 0) + (leading ? 5 : 0) + (p.ready ? 3 : 0) + Math.min(2, p.images.length - 1);
  };
  // Tri stable : à score égal, l'ordre d'origine (le plus récent d'abord) est conservé.
  return [...mine].map((p, i) => ({ p, i, s: score(p) })).sort((a, b) => b.s - a.s || a.i - b.i)[0].p.images[0].url;
}
