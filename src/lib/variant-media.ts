/**
 * Photos et vidéos d'une fiche selon la variante choisie.
 *
 * Une photo peut être liée à une combinaison d'options (`options`, ex. type + couleur) ou, pour les
 * fiches plus anciennes, à une seule couleur (`color`). Sans lien, c'est une photo commune au produit.
 * Règle : on ne présente jamais la photo d'une autre variante comme celle qui est sélectionnée.
 */
export interface VariantMedia {
  url: string;
  alt: string;
  color?: string | null;
  options?: Record<string, string> | null;
}

export type Selection = Record<string, string | undefined>;

/** Options auxquelles une photo est liée ; null = photo commune. */
export function mediaScope(m: VariantMedia, visualAxis?: string): Record<string, string> | null {
  const opts = m.options && Object.keys(m.options).length ? m.options : null;
  if (opts) return opts;
  if (m.color && visualAxis) return { [visualAxis]: m.color };
  return null;
}

export type MediaScopeKind =
  /** Aucune photo liée à une variante : toute la galerie s'affiche. */
  | "all"
  /** Photos de la variante choisie (puis photos communes). */
  | "exact"
  /** Pas de photo exacte : photos communes au produit, à présenter comme telles. */
  | "common"
  /** Pas de photo exacte ni commune : l'état doit être annoncé, sans image d'une autre variante. */
  | "missing"
  /** Sélection incomplète : photos compatibles avec ce qui est déjà choisi. */
  | "partial";

export function mediaForSelection<T extends VariantMedia>(
  media: T[],
  sel: Selection,
  axes: string[],
  visualAxis?: string,
): { items: T[]; scope: MediaScopeKind } {
  const scoped = media.map((m) => ({ m, scope: mediaScope(m, visualAxis) }));
  if (!scoped.some((x) => x.scope)) return { items: media, scope: "all" };

  const common = scoped.filter((x) => !x.scope).map((x) => x.m);
  const complete = axes.length > 0 && axes.every((a) => sel[a]);

  if (!complete) {
    // Rien d'exact à annoncer : on garde les photos qui ne contredisent aucun choix déjà fait.
    const ok = scoped.filter((x) => !x.scope || Object.entries(x.scope).every(([k, v]) => !sel[k] || sel[k] === v));
    return { items: ok.length ? ok.map((x) => x.m) : media, scope: "partial" };
  }
  const exact = scoped.filter((x) => x.scope && Object.entries(x.scope).every(([k, v]) => sel[k] === v));
  if (exact.length) return { items: [...exact.map((x) => x.m), ...common], scope: "exact" };
  if (common.length) return { items: common, scope: "common" };
  return { items: [], scope: "missing" };
}

/** Variantes d'une fiche qui n'ont aucune photo représentative (exacte ou commune). */
export function variantsWithoutPhoto<V extends { options: Record<string, string> }>(
  variants: V[],
  media: VariantMedia[],
  axes: string[],
  visualAxis?: string,
): V[] {
  return variants.filter((v) => mediaForSelection(media, v.options, axes, visualAxis).scope === "missing");
}
