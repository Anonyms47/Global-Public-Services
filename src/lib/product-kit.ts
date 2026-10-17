/**
 * Outils de saisie des fiches produits, partagés entre le Comptoir et le serveur.
 * Tout est déterministe : aucune IA, aucune donnée inventée.
 */

// ——— Valeurs rapides (modifiables par le propriétaire dans Paramètres) ———

export const quickListLabels = {
  ram: "RAM",
  storage: "Stockage",
  power: "Puissance",
  capacity: "Capacité (batterie externe)",
  volume: "Contenance",
  warranty: "Garantie",
  condition: "État",
} as const;
export type QuickListKey = keyof typeof quickListLabels;
export type QuickValues = Record<QuickListKey, string[]>;

export const defaultQuickValues: QuickValues = {
  ram: ["2 Go", "3 Go", "4 Go", "6 Go", "8 Go", "12 Go"],
  storage: ["32 Go", "64 Go", "128 Go", "256 Go", "512 Go", "1 To"],
  power: ["5 W", "10 W", "18 W", "20 W", "25 W", "33 W", "45 W", "65 W"],
  capacity: ["5 000 mAh", "10 000 mAh", "20 000 mAh", "30 000 mAh", "50 000 mAh", "60 000 mAh"],
  volume: ["10 ml", "30 ml", "50 ml", "100 ml"],
  warranty: ["Sans garantie", "7 jours", "1 mois", "3 mois", "6 mois", "12 mois"],
  condition: ["Neuf", "Occasion", "Reconditionné"],
};

// ——— Caractéristiques par catégorie ———

/**
 * Un champ de fiche : `brand`, `model`, `condition` et `warranty` alimentent les
 * champs du produit ; les autres deviennent des caractéristiques (libellé : valeur).
 */
export interface FieldDef {
  label: string;
  target?: "brand" | "model" | "condition" | "warranty";
  quick?: QuickListKey;
  options?: string[];
  placeholder?: string;
}

export interface CategoryTemplate {
  key: string;
  /** Mots qui reconnaissent la catégorie dans son nom. */
  match: string[];
  /** Nom de type utilisé dans le nom suggéré (« Batterie externe »), vide pour les téléphones. */
  typeName: string;
  fields: FieldDef[];
  /** Ordre des éléments du nom suggéré. */
  nameParts: ("type" | "brand" | "model" | string)[];
}

const brand: FieldDef = { label: "Marque", target: "brand" };
const model: FieldDef = { label: "Modèle", target: "model" };
const warranty: FieldDef = { label: "Garantie", target: "warranty", quick: "warranty" };
const condition: FieldDef = { label: "État", target: "condition", quick: "condition" };
const color: FieldDef = { label: "Couleur" };
const yesNo = ["Oui", "Non"];

export const categoryTemplates: CategoryTemplate[] = [
  {
    key: "telephones",
    match: ["telephone", "smartphone", "mobile"],
    typeName: "",
    nameParts: ["brand", "model", "Stockage"],
    fields: [
      brand,
      model,
      color,
      { label: "RAM", quick: "ram" },
      { label: "Stockage", quick: "storage" },
      { label: "Taille d'écran", placeholder: "6,7 pouces" },
      { label: "SIM", options: ["Simple SIM", "Double SIM", "eSIM"] },
      { label: "Réseau", options: ["2G", "3G", "4G", "5G"] },
      { label: "Système", placeholder: "Android 14" },
      { label: "Batterie", placeholder: "5 000 mAh" },
      { label: "Appareil photo", placeholder: "50 Mpx" },
      condition,
      { label: "Accessoires inclus" },
      warranty,
    ],
  },
  {
    key: "ecouteurs",
    match: ["ecouteur", "airpod"],
    typeName: "Écouteurs",
    nameParts: ["type", "Connexion", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Connexion", options: ["Bluetooth", "Filaire"] },
      { label: "Bluetooth", placeholder: "5.3" },
      { label: "Autonomie", placeholder: "jusqu'à 7 h" },
      { label: "Autonomie avec boîtier", placeholder: "jusqu'à 30 h" },
      { label: "Réduction de bruit", options: ["Active (ANC)", "Appels (ENC)", "Non"] },
      { label: "Microphone", options: yesNo },
      { label: "Résistance à l'eau", placeholder: "IPX4" },
      { label: "Type de charge", options: ["USB-C", "Lightning", "Micro-USB", "Sans fil"] },
      color,
      warranty,
    ],
  },
  {
    key: "casques",
    match: ["casque"],
    typeName: "Casque",
    nameParts: ["type", "Connexion", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", options: ["Sur l'oreille", "Autour de l'oreille", "Gaming"] },
      { label: "Connexion", options: ["Bluetooth", "Filaire", "Bluetooth et filaire"] },
      { label: "Bluetooth", placeholder: "5.3" },
      { label: "Autonomie", placeholder: "jusqu'à 60 h" },
      { label: "Microphone", options: yesNo },
      { label: "Réduction de bruit", options: ["Active (ANC)", "Appels (ENC)", "Non"] },
      color,
      warranty,
    ],
  },
  {
    key: "chargeurs",
    match: ["chargeur"],
    typeName: "Chargeur",
    nameParts: ["type", "brand", "Compatibilités", "Puissance"],
    fields: [
      brand,
      model,
      { label: "Type", options: ["Secteur", "Voiture", "Sans fil", "Ordinateur"] },
      { label: "Puissance", quick: "power" },
      { label: "Nombre de ports" },
      { label: "Types de ports", placeholder: "USB-C + USB-A" },
      { label: "Charge rapide", options: ["PD", "QC", "PD et QC", "Non"] },
      { label: "Compatibilités", placeholder: "iPhone, Samsung…" },
      { label: "Câble inclus", options: yesNo },
      { label: "Longueur du câble", placeholder: "1 m" },
      color,
      warranty,
    ],
  },
  {
    key: "cables",
    match: ["cable"],
    typeName: "Câble",
    nameParts: ["type", "Connecteurs", "Longueur"],
    fields: [
      brand,
      { label: "Connecteurs", placeholder: "USB-C vers Lightning" },
      { label: "Longueur", placeholder: "1 m" },
      { label: "Puissance maximale", quick: "power" },
      { label: "Transfert de données", options: yesNo },
      { label: "Matière", placeholder: "Tressé, silicone…" },
      color,
      warranty,
    ],
  },
  {
    key: "batteries",
    match: ["batterie", "powerbank"],
    typeName: "Batterie externe",
    nameParts: ["type", "brand", "Capacité"],
    fields: [
      brand,
      model,
      { label: "Capacité", quick: "capacity" },
      { label: "Puissance maximale", quick: "power" },
      { label: "Nombre de sorties" },
      { label: "Types de ports", placeholder: "USB-C, USB-A" },
      { label: "Charge rapide", options: ["PD", "QC", "PD et QC", "Non"] },
      { label: "Affichage du niveau", options: yesNo },
      { label: "Lampe intégrée", options: yesNo },
      color,
      warranty,
    ],
  },
  {
    key: "montres",
    match: ["montre"],
    typeName: "Montre",
    nameParts: ["type", "Type", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", options: ["connectée", "classique"] },
      { label: "Taille", placeholder: "44 mm" },
      { label: "Bracelet", placeholder: "Silicone" },
      color,
      { label: "Bluetooth", placeholder: "5.3" },
      { label: "Autonomie", placeholder: "jusqu'à 7 jours" },
      { label: "Appels", options: yesNo },
      { label: "Notifications", options: yesNo },
      { label: "Fonctions sport et santé" },
      { label: "Résistance à l'eau", placeholder: "IP68" },
      { label: "Compatibilité", placeholder: "Android et iPhone" },
      warranty,
    ],
  },
  {
    key: "enceintes",
    match: ["enceinte", "audio", "radio"],
    typeName: "Enceinte",
    nameParts: ["type", "Connexion", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Puissance", quick: "power" },
      { label: "Connexion", options: ["Bluetooth", "Filaire"] },
      { label: "Bluetooth", placeholder: "5.3" },
      { label: "Autonomie", placeholder: "jusqu'à 10 h" },
      { label: "Entrées disponibles", placeholder: "AUX, USB, carte SD" },
      { label: "Microphone", options: yesNo },
      { label: "Résistance à l'eau", placeholder: "IPX5" },
      color,
      warranty,
    ],
  },
  {
    key: "informatique",
    match: ["informatique", "ordinateur"],
    typeName: "",
    nameParts: ["Type", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", placeholder: "Souris, clavier, clé USB…" },
      { label: "Compatibilité" },
      { label: "Connectique", placeholder: "USB, sans fil 2,4 GHz…" },
      { label: "Alimentation" },
      { label: "Dimensions" },
      color,
      warranty,
    ],
  },
  {
    key: "lunettes",
    match: ["lunette"],
    typeName: "Lunettes",
    nameParts: ["type", "Type", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", options: ["de soleil", "de vue", "anti-lumière bleue"] },
      { label: "Forme" },
      { label: "Couleur de la monture" },
      { label: "Couleur des verres" },
      { label: "Matière" },
      { label: "Protection UV", placeholder: "UV400" },
      { label: "Public", options: ["Homme", "Femme", "Mixte", "Enfant"] },
      { label: "Étui inclus", options: yesNo },
    ],
  },
  {
    key: "chaussures",
    match: ["chaussure", "basket", "sandale"],
    typeName: "",
    nameParts: ["Type", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", placeholder: "Baskets, sandales…" },
      { label: "Public", options: ["Homme", "Femme", "Mixte", "Enfant"] },
      { label: "Pointures", placeholder: "39 à 45" },
      { label: "Couleurs" },
      { label: "Matière" },
      condition,
    ],
  },
  {
    key: "parfums",
    match: ["parfum"],
    typeName: "Parfum",
    nameParts: ["brand", "model", "Contenance"],
    fields: [
      brand,
      { label: "Nom du parfum", target: "model" },
      { label: "Type", options: ["Eau de parfum", "Eau de toilette", "Extrait", "Huile parfumée"] },
      { label: "Contenance", quick: "volume" },
      { label: "Public", options: ["Homme", "Femme", "Mixte"] },
      { label: "Famille olfactive" },
      { label: "Notes principales" },
      { label: "Format", options: ["Vaporisateur", "Flacon", "Roll-on"] },
      { label: "Conditions de retour" },
    ],
  },
  {
    key: "coques",
    match: ["coque", "protection"],
    typeName: "Coque",
    nameParts: ["type", "Appareil compatible"],
    fields: [
      brand,
      { label: "Appareil compatible", placeholder: "iPhone 15 Pro Max" },
      { label: "Modèles compatibles" },
      { label: "Type de protection", options: ["Coque", "Verre trempé", "Film", "Étui"] },
      { label: "Matière" },
      color,
      { label: "Style" },
      { label: "Protection caméra", options: yesNo },
      { label: "Compatibilité MagSafe", options: yesNo },
    ],
  },
  {
    key: "creation",
    match: ["creation", "contenu", "video"],
    typeName: "",
    nameParts: ["Type", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", placeholder: "Micro, trépied, lampe…" },
      { label: "Compatibilité" },
      { label: "Connexion" },
      { label: "Alimentation" },
      { label: "Dimensions" },
      { label: "Accessoires inclus" },
      color,
      warranty,
    ],
  },
  {
    key: "jeux",
    match: ["jeu", "gaming", "console"],
    typeName: "",
    nameParts: ["Type", "brand", "model"],
    fields: [
      brand,
      model,
      { label: "Type", placeholder: "Manette, console…" },
      { label: "Plateforme" },
      { label: "Connexion", options: ["Sans fil", "Filaire", "Bluetooth"] },
      { label: "Alimentation" },
      { label: "Accessoires inclus" },
      color,
      warranty,
    ],
  },
];

const genericTemplate: CategoryTemplate = {
  key: "general",
  match: [],
  typeName: "",
  nameParts: ["brand", "model"],
  fields: [brand, model, color, condition, warranty],
};

export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Gabarit de la catégorie, reconnu par son nom ; gabarit général sinon. */
export function templateFor(categoryName: string | null | undefined): CategoryTemplate {
  const n = normalize(categoryName ?? "");
  if (!n) return genericTemplate;
  return categoryTemplates.find((t) => t.match.some((m) => n.includes(m))) ?? genericTemplate;
}

// ——— Nom simple suggéré ———

/** Une valeur incertaine n'entre jamais dans un nom. */
export function isUncertain(v: string | null | undefined) {
  const s = normalize(v ?? "");
  return !s || /\?|a confirmer|a relever|non lisible|illisible|a verifier|inconnu|famille/.test(s);
}

export interface NameInput {
  categoryName: string | null;
  brand: string;
  model: string;
  specs: { label: string; value: string }[];
}

export const NAME_ADVICE_LENGTH = 65;

/** « Type + Marque + Modèle + caractéristique utile », sans IA ni donnée incertaine. */
export function suggestName(input: NameInput) {
  const t = templateFor(input.categoryName);
  const spec = (label: string) => input.specs.find((s) => normalize(s.label) === normalize(label))?.value ?? "";
  const words: string[] = [];
  for (const part of t.nameParts) {
    const v =
      part === "type"
        ? t.typeName
        : part === "brand"
          ? input.brand
          : part === "model"
            ? input.model
            : part === "Connexion"
              ? spec(part) === "Bluetooth" || spec(part) === "Filaire"
                ? spec(part)
                : ""
              : spec(part);
    if (!v || isUncertain(v)) continue;
    // Pas de répétition (« Nokia Nokia 105 ») ni de mot déjà présent.
    const already = normalize(words.join(" "));
    const clean = v.trim();
    if (already.includes(normalize(clean))) continue;
    words.push(clean);
  }
  // « Montre connectée », « Lunettes de soleil » : le type précise le nom de base.
  const joined = words.join(" ").replace(/\s+/g, " ").trim();
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// ——— Description composée ———

export interface ProductDetails {
  short?: string;
  highlights?: string[];
  box?: string;
  extra?: string;
}

export function composeDescription(d: ProductDetails) {
  const parts: string[] = [];
  if (d.short?.trim()) parts.push(d.short.trim());
  const hl = (d.highlights ?? []).map((h) => h.trim()).filter(Boolean);
  if (hl.length) parts.push(["Points forts :", ...hl.map((h) => `• ${h}`)].join("\n"));
  if (d.box?.trim()) parts.push(`Contenu de la boîte : ${d.box.trim()}`);
  if (d.extra?.trim()) parts.push(d.extra.trim());
  return parts.join("\n\n");
}

export const hasDetails = (d: ProductDetails | null | undefined) =>
  !!d && !!(d.short?.trim() || d.box?.trim() || d.extra?.trim() || (d.highlights ?? []).some((h) => h.trim()));

// ——— Avancement de la fiche ———

export type SectionStatus = "todo" | "progress" | "done" | "optional" | "error";
export const sectionStatusLabels: Record<SectionStatus, string> = {
  todo: "À compléter",
  progress: "En cours",
  done: "Terminé",
  optional: "Facultatif",
  error: "Erreur à corriger",
};

export interface CompletenessInput {
  name: string;
  categoryId: string | null;
  brand: string;
  model: string;
  description: string;
  warranty: string;
  axes: string[];
  images: { kind?: "image" | "video"; alt?: string }[];
  specs: { label: string; value: string }[];
  variants: {
    price: number;
    costPrice?: number | null;
    initialStock?: number;
    onHand?: number;
    id?: string;
    options: Record<string, string>;
    sku?: string;
    barcode?: string | null;
  }[];
  uploading?: boolean;
  codeErrors?: number;
}

export interface Completeness {
  percent: number;
  sections: Record<"photos" | "identity" | "pricing" | "details" | "review", SectionStatus>;
  missing: string[];
}

export function completeness(p: CompletenessInput, opts: { canCosts: boolean; blocking: number }): Completeness {
  const photos = p.images.filter((i) => (i.kind ?? "image") === "image").length;
  const priced = p.variants.filter((v) => v.price > 0).length;
  const stocked = p.variants.filter((v) => (v.id ? (v.onHand ?? 0) : (v.initialStock ?? 0)) > 0).length;
  const costed = p.variants.filter((v) => v.costPrice != null).length;
  const filledSpecs = p.specs.filter((s) => s.label.trim() && s.value.trim()).length;
  const items: [string, boolean][] = [
    ["Photo principale", photos > 0],
    ["Nom", !!p.name.trim()],
    ["Catégorie", !!p.categoryId],
    ["Marque", !!p.brand.trim()],
    ["Prix de vente", p.variants.length > 0 && priced === p.variants.length],
    ["Stock", stocked > 0],
    ["Caractéristiques", filledSpecs >= 2],
    ["Description", !!p.description.trim()],
    ["Garantie", !!p.warranty.trim()],
    ...(opts.canCosts
      ? ([["Coût d'achat", p.variants.length > 0 && costed === p.variants.length]] as [string, boolean][])
      : []),
  ];
  const done = items.filter(([, ok]) => ok).length;
  const variantsIncomplete = p.axes.length > 0 && p.variants.some((v) => p.axes.some((a) => !v.options[a]?.trim()));
  return {
    percent: Math.round((done / items.length) * 100),
    missing: items.filter(([, ok]) => !ok).map(([l]) => l),
    sections: {
      photos: p.uploading ? "progress" : photos ? "done" : "todo",
      identity: !p.name.trim() ? "todo" : p.categoryId ? (p.brand.trim() ? "done" : "progress") : "progress",
      pricing: priced === 0 ? "todo" : priced < p.variants.length ? "progress" : stocked ? "done" : "progress",
      details:
        (p.codeErrors ?? 0) > 0 || variantsIncomplete ? "error" : filledSpecs || p.axes.length ? "done" : "optional",
      review: opts.blocking ? "todo" : "done",
    },
  };
}

/** Conseils non bloquants de la vérification finale (en plus de publicationHints). */
export function entryHints(p: CompletenessInput, opts: { canCosts: boolean }) {
  const hints: string[] = [];
  if (!p.brand.trim()) hints.push("Aucune marque indiquée.");
  if (opts.canCosts && p.variants.some((v) => v.costPrice == null)) hints.push("Coût d'achat non renseigné.");
  if (opts.canCosts && p.variants.some((v) => v.costPrice != null && v.price > 0 && v.price === v.costPrice))
    hints.push("Prix de vente égal au coût : aucune marge.");
  if (!p.variants.some((v) => v.barcode)) hints.push("Aucun code-barres.");
  if (!p.warranty.trim()) hints.push("Aucune garantie indiquée.");
  if (p.specs.filter((s) => s.value.trim()).length < 3) hints.push("Peu de caractéristiques.");
  if (p.images.some((i) => (i.kind ?? "image") === "image" && !i.alt?.trim())) hints.push("Texte alternatif absent.");
  return hints;
}

// ——— Similarité de noms (produits peut-être en double) ———

const STOP = new Set(["de", "du", "des", "la", "le", "les", "et", "pour", "avec", "en", "a"]);
export function nameTokens(s: string) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Part des mots du nom saisi présents dans l'autre nom (0 à 1). */
export function nameSimilarity(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  if (ta.length < 2) return 0;
  return ta.filter((w) => tb.has(w)).length / ta.length;
}
