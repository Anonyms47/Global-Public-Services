/**
 * Choix des options sur la fiche produit : garde une sélection cohérente
 * (aucune combinaison inexistante) et complète ce qui n'a plus qu'une réponse.
 */
export interface SelectableVariant {
  options: Record<string, string>;
  price: number;
  available: number;
}

export type Selection = Record<string, string | undefined>;

function fits(v: SelectableVariant, sel: Selection, except?: string) {
  return Object.entries(sel).every(([k, val]) => k === except || !val || v.options[k] === val);
}

/** Valeurs d'un axe encore possibles avec le reste de la sélection. */
export function compatibleValues(variants: SelectableVariant[], sel: Selection, axis: string) {
  return [...new Set(variants.filter((v) => fits(v, sel, axis)).map((v) => v.options[axis]))].filter(Boolean);
}

/**
 * Applique un choix : les autres options devenues impossibles sont retirées
 * (ou remplacées pour les axes visuels), et un axe qui n'a plus qu'une valeur
 * possible est rempli automatiquement.
 */
export function selectOption(
  variants: SelectableVariant[],
  axes: string[],
  sel: Selection,
  axis: string,
  value: string | undefined,
  visualAxes: string[] = [],
): Selection {
  const next: Selection = { ...sel, [axis]: value };
  if (!value) return next;
  for (const a of axes) {
    if (a === axis || !next[a]) continue;
    if (!variants.some((v) => v.options[axis] === value && v.options[a] === next[a])) next[a] = undefined;
  }
  for (const a of axes) {
    if (next[a]) continue;
    const pool = variants.filter((v) => fits(v, next, a));
    const vals = [...new Set(pool.map((v) => v.options[a]))].filter(Boolean);
    if (vals.length === 1) next[a] = vals[0];
    else if (vals.length > 1 && visualAxes.includes(a))
      next[a] = pool.find((v) => v.available > 0)?.options[a] ?? vals[0];
  }
  return next;
}

/**
 * Prix à afficher sur chaque valeur d'un axe, quand cet axe fixe à lui seul le
 * prix (ex. type de coque) et que les prix diffèrent d'une valeur à l'autre.
 */
export function optionPrices(variants: SelectableVariant[], axis: string): Record<string, number> | null {
  const byValue: Record<string, number> = {};
  for (const v of variants) {
    const val = v.options[axis];
    if (!val) continue;
    if (val in byValue && byValue[val] !== v.price) return null;
    byValue[val] = v.price;
  }
  return new Set(Object.values(byValue)).size > 1 ? byValue : null;
}

export interface OptionChoice {
  value: string;
  /** « ok » : on peut la commander ; « out » : rupture réelle de toutes les versions compatibles. */
  state: "ok" | "out";
}

/**
 * Valeurs proposées pour un axe. Le premier axe (ex. type) montre toutes ses valeurs ; chaque axe suivant
 * (ex. couleur) ne montre que les valeurs qui existent avec les choix des axes précédents — une combinaison
 * inexistante n'est donc jamais présentée comme « indisponible ». Seule une vraie rupture est signalée.
 */
export function optionChoices(
  variants: SelectableVariant[],
  axes: string[],
  sel: Selection,
  axis: string,
): OptionChoice[] {
  const earlier = axes.slice(0, axes.indexOf(axis));
  const pool = variants.filter((v) => earlier.every((a) => !sel[a] || v.options[a] === sel[a]));
  const values = [...new Set(pool.map((v) => v.options[axis]))].filter(Boolean);
  return values.map((value) => ({
    value,
    state: pool.some((v) => v.options[axis] === value && v.available > 0) ? "ok" : "out",
  }));
}

export interface Adaptation {
  axis: string;
  from: string;
  /** Nouvelle valeur ; undefined si l'option a dû être retirée. */
  to: string | undefined;
}

/** Options modifiées automatiquement après un choix (pour l'annoncer clairement au client). */
export function adaptations(before: Selection, after: Selection, chosen: string): Adaptation[] {
  return Object.keys(before)
    .filter((a) => a !== chosen && before[a] && before[a] !== after[a])
    .map((a) => ({ axis: a, from: before[a] as string, to: after[a] }));
}
