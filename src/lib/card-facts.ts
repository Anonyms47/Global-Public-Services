import { isUncertain } from "./product-kit";
/**
 * Faits clés affichés sur une carte produit : 2 ou 3 caractéristiques courtes tirées de la fiche.
 * Fonction pure, sans invention : on ne reprend que des valeurs déjà saisies ou sourcées.
 */
export interface CardSpec {
  label: string;
  value: string;
  unit?: string;
  private?: boolean;
}

const PRIORITY = [
  "écran",
  "stockage",
  "mémoire",
  "capacité",
  "batterie",
  "autonomie",
  "puissance maximale",
  "puissance",
  "tailles disponibles",
  "compatibilité",
  "processeur",
  "photo arrière",
  "type",
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function shorten(value: string) {
  const first = value
    .split(/,\s|\s\(|;/)[0]
    .replace(/\s+/g, " ")
    .trim();
  return first.length > 24 ? `${first.slice(0, 23).trimEnd()}…` : first;
}

const SPACE = /[\s\u00a0\u202f]+/g;
const tidy = (s: string) => s.replace(SPACE, " ").trim();

/**
 * Valeur courte d'une caractéristique pour une carte : seulement ce qui est écrit dans la valeur saisie
 * (taille d'écran et fréquence, capacité, puissance), jamais une donnée ajoutée.
 */
export function shortFact(label: string, value: string): string {
  const v = tidy(value);
  const key = norm(label);
  if (key === "ecran") {
    const size = v.match(/(\d+(?:[.,]\d+)?)\s*(?:pouces?|po\b|"|″|inch)/i);
    const hz = v.match(/(\d{2,3})\s*Hz/i);
    if (size) return `${size[1].replace(".", ",")} pouces${hz ? ` · ${hz[1]} Hz` : ""}`;
  }
  if (key === "batterie" || key === "capacite") {
    const mah = v.match(/\d[\d .,]*\s*mAh/i);
    if (mah) return tidy(mah[0]).replace(/\s*mah$/i, " mAh");
  }
  if (key === "puissance maximale" || key === "puissance") {
    const w = v.match(/(\d+(?:[.,]\d+)?)\s*W\b/i);
    if (w) return `${w[1].replace(".", ",")} W`;
  }
  if (key === "stockage" || key === "memoire") {
    const g = v.match(/\d+\s*(?:Go|To|Mo)\b/i);
    if (g) return tidy(g[0]);
  }
  return shorten(v);
}

export function cardFacts(specs: CardSpec[], max = 3): string[] {
  // Une valeur « à relever », « à confirmer »… n'est jamais montrée sur une carte.
  const usable = specs.filter((s) => !s.private && s.value.trim() && s.label.trim() && !isUncertain(s.value));
  const out: string[] = [];
  for (const key of PRIORITY) {
    const hit = usable.find((s) => norm(s.label) === norm(key));
    if (!hit) continue;
    const v = shortFact(hit.label, `${hit.value}${hit.unit ? ` ${hit.unit}` : ""}`);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  // Un « Type » seul n'apprend rien de plus que le nom : on le garde seulement avec d'autres faits.
  return out.length === 1 &&
    norm(usable.find((s) => shorten(`${s.value}${s.unit ? ` ${s.unit}` : ""}`) === out[0])?.label ?? "") === "type"
    ? []
    : out;
}

/** Fiche publiée depuis moins de `days` jours : pastille « Nouveau ». */
export function isNew(createdAt: Date | string, days = 14, now = Date.now()) {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && now - t >= 0 && now - t < days * 86_400_000;
}
