import { shortFact } from "./card-facts";
import { isUncertain } from "./product-kit";

/**
 * Filtres propres à un rayon, tirés des caractéristiques saisies. Un critère n'est proposé que si les
 * données sont assez fiables : renseigné sur la plupart des articles du rayon et avec au moins deux valeurs.
 */
export interface AttrDef {
  key: string;
  title: string;
  /** Libellés de caractéristiques lus, dans l'ordre. */
  labels: string[];
  /** Valeur gardée telle que saisie (ex. modèle compatible) au lieu d'être raccourcie. */
  verbatim?: boolean;
}

export const ATTRIBUTES: AttrDef[] = [
  {
    key: "compat",
    title: "Modèle compatible",
    labels: ["Téléphone compatible", "Appareil compatible"],
    verbatim: true,
  },
  { key: "stockage", title: "Stockage", labels: ["Stockage"] },
  { key: "ram", title: "Mémoire", labels: ["Mémoire"] },
  { key: "reseau", title: "Réseau", labels: ["Réseau"], verbatim: true },
  { key: "puissance", title: "Puissance", labels: ["Puissance maximale", "Puissance"] },
  { key: "capacite", title: "Capacité", labels: ["Capacité"] },
  { key: "ports", title: "Ports", labels: ["Types de ports"], verbatim: true },
  { key: "longueur", title: "Longueur", labels: ["Longueur"], verbatim: true },
];

export interface AttrSpec {
  label: string;
  value: string;
  unit?: string;
  private?: boolean;
}
export interface WithSpecs {
  specs: AttrSpec[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Valeur d'un critère pour un article ; undefined si elle n'est pas renseignée ou pas certaine. */
export function productAttr(def: AttrDef, p: WithSpecs): string | undefined {
  for (const label of def.labels) {
    const hit = p.specs.find((s) => !s.private && norm(s.label) === norm(label));
    if (!hit) continue;
    const raw = `${hit.value}${hit.unit ? ` ${hit.unit}` : ""}`.replace(/\s+/g, " ").trim();
    if (!raw || isUncertain(raw)) continue;
    return def.verbatim ? raw : shortFact(hit.label, raw);
  }
  return undefined;
}

export interface AttrFacet {
  key: string;
  title: string;
  values: { value: string; count: number }[];
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

export const MIN_COVERAGE = 0.7;
export const MAX_VALUES = 40;

/** Critères fiables pour un ensemble d'articles (en général un rayon). */
export function attributeFacets(products: WithSpecs[], opts: { minCoverage?: number } = {}): AttrFacet[] {
  if (products.length < 4) return [];
  const minCoverage = opts.minCoverage ?? MIN_COVERAGE;
  const out: AttrFacet[] = [];
  for (const def of ATTRIBUTES) {
    const counts = new Map<string, number>();
    let known = 0;
    for (const p of products) {
      const v = productAttr(def, p);
      if (!v) continue;
      known++;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    if (known / products.length < minCoverage) continue;
    if (counts.size < 2 || counts.size > MAX_VALUES) continue;
    out.push({
      key: def.key,
      title: def.title,
      values: [...counts]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => collator.compare(a.value, b.value)),
    });
  }
  return out;
}

export interface AttrFilter {
  key: string;
  value: string;
}

/** Plusieurs valeurs d'un même critère : l'une ou l'autre ; critères différents : tous. */
export function matchesAttrs(p: WithSpecs, filters: AttrFilter[] | undefined): boolean {
  if (!filters?.length) return true;
  const byKey = new Map<string, string[]>();
  for (const f of filters) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f.value]);
  for (const [key, wanted] of byKey) {
    const def = ATTRIBUTES.find((d) => d.key === key);
    if (!def) return false;
    const v = productAttr(def, p);
    if (!v || !wanted.includes(v)) return false;
  }
  return true;
}

export const attrTitle = (key: string) => ATTRIBUTES.find((d) => d.key === key)?.title ?? key;

/** « compat:iPhone 13 » ⇄ { key, value } (le premier « : » sépare la clé). */
export function parseAttr(raw: string): AttrFilter | null {
  const i = raw.indexOf(":");
  if (i <= 0) return null;
  const key = raw.slice(0, i);
  const value = raw.slice(i + 1).trim();
  return ATTRIBUTES.some((d) => d.key === key) && value ? { key, value: value.slice(0, 120) } : null;
}
export const serializeAttr = (f: AttrFilter) => `${f.key}:${f.value}`;
