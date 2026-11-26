/**
 * Libellés d'option qui ne disent pas ce que l'on achète (« Version de base », « Standard »…).
 * Ils sont conservés tels quels ; le site signale simplement qu'il faut préciser avec GPS.
 */
const AMBIGUOUS = new Set([
  "version de base",
  "base",
  "standard",
  "autre",
  "autres",
  "normal",
  "classique",
  "par defaut",
  "defaut",
  "modele de base",
]);

const plain = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const isAmbiguousOption = (value: string) => AMBIGUOUS.has(plain(value));
