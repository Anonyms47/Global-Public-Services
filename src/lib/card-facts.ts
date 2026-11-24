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

export function cardFacts(specs: CardSpec[], max = 3): string[] {
  const usable = specs.filter((s) => !s.private && s.value.trim() && s.label.trim());
  const out: string[] = [];
  for (const key of PRIORITY) {
    const hit = usable.find((s) => norm(s.label) === norm(key));
    if (!hit) continue;
    const v = shorten(`${hit.value}${hit.unit ? ` ${hit.unit}` : ""}`);
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
export function isNew(createdAt: Date | string, days = 21, now = Date.now()) {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && now - t >= 0 && now - t < days * 86_400_000;
}
