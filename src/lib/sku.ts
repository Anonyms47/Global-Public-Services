import { slugify } from "./format";

const code = (s: string, n: number) => slugify(s).toUpperCase().replace(/-/g, "").slice(0, n);

/** Début de référence tiré du nom (« Galaxy A15 Noir » → « GALAXYA1 »). */
export function skuBase(name: string) {
  return code(name, 8) || "ART";
}

/**
 * Référence proposée quand le champ est vide : nom + options de la variante.
 * L'unicité est garantie au moment de l'enregistrement (suffixe -2, -3…).
 */
export function suggestSku(name: string, axes: string[], options: Record<string, string>) {
  const suffix = axes
    .map((a) => code(options[a] ?? "", 4))
    .filter(Boolean)
    .join("-");
  return suffix ? `${skuBase(name)}-${suffix}` : skuBase(name);
}

/** Code-barres : chiffres seuls (EAN, UPC) ou code interne, sans espaces. */
export function normalizeBarcode(s: string | null | undefined) {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}
