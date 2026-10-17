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
  /**
   * Options de variantes proposées : seulement ce qu'un client peut réellement
   * choisir pour ce type de produit (jamais la couleur d'un chargeur, par exemple).
   */
  variantAxes: string[];
}

/** Profil d'une catégorie, modifiable par le propriétaire (Catalogue → Catégories). */
export interface CategoryProfile {
  /** Champs demandés, dans l'ordre ; « options » = choix rapides. */
  fields?: { label: string; options?: string[] }[];
  /** Options de variantes proposées. */
  variantAxes?: string[];
}

const brand: FieldDef = { label: "Marque", target: "brand" };
const model: FieldDef = { label: "Modèle", target: "model" };
const warranty: FieldDef = { label: "Garantie", target: "warranty", quick: "warranty" };
const condition: FieldDef = { label: "État", target: "condition", quick: "condition" };
const color: FieldDef = { label: "Couleur" };
const yesNo = ["Oui", "Non"];

/** Types de coques proposés (seulement ceux réellement présents en boutique sont à choisir). */
export const COQUE_TYPES = [
  "Silicone",
  "Cuir",
  "Transparente",
  "Rigide",
  "Souple",
  "Antichoc",
  "MagSafe",
  "Portefeuille",
  "Avec protection caméra",
  "Avec support",
] as const;
/** Place du type dans le nom : « Coque en silicone iPhone 15 », « Coque iPhone 15 avec support ». */
const COQUE_WORDING: Record<string, { before?: string; after?: string }> = {
  silicone: { before: "en silicone" },
  cuir: { before: "en cuir" },
  transparente: { before: "transparente" },
  rigide: { before: "rigide" },
  souple: { before: "souple" },
  antichoc: { before: "antichoc" },
  magsafe: { before: "MagSafe" },
  portefeuille: { before: "portefeuille" },
  "avec protection camera": { after: "avec protection caméra" },
  "avec support": { after: "avec support" },
};

export const categoryTemplates: CategoryTemplate[] = [
  {
    key: "telephones",
    match: ["telephone", "smartphone", "mobile"],
    typeName: "",
    nameParts: ["brand", "model", "Stockage"],
    variantAxes: ["Couleur", "Stockage", "RAM"],
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
    variantAxes: ["Couleur"],
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
    variantAxes: ["Couleur"],
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
    // Un chargeur par puissance et configuration de ports : pas de variante Couleur.
    key: "chargeurs",
    match: ["chargeur"],
    typeName: "Chargeur",
    nameParts: ["type", "Type de chargeur", "Compatible avec", "Types de ports", "Puissance maximale"],
    variantAxes: [],
    fields: [
      { label: "Type de chargeur", options: ["Secteur", "Voiture", "Sans fil", "Ordinateur"] },
      { label: "Puissance maximale", quick: "power" },
      { label: "Nombre de ports", options: ["1", "2", "3", "4"] },
      { label: "Types de ports", options: ["USB-C", "USB-A", "USB-C + USB-A", "2 × USB-C", "MagSafe 2"] },
      { label: "Technologies de charge", options: ["PD", "QC", "PD et QC", "GaN"] },
      { label: "Compatible avec", placeholder: "MacBook, iPhone, Apple Watch…" },
      { label: "Câble inclus", options: ["Non", "USB-C vers USB-C", "USB-C vers Lightning"] },
      brand,
      model,
      warranty,
    ],
  },
  {
    // Un câble par connecteurs et puissance ; la longueur peut être une variante.
    key: "cables",
    match: ["cable"],
    typeName: "Câble",
    nameParts: ["type", "Connecteur d'entrée", "Connecteur de sortie", "Puissance maximale"],
    variantAxes: ["Longueur"],
    fields: [
      { label: "Connecteur d'entrée", options: ["USB-A", "USB-C"] },
      { label: "Connecteur de sortie", options: ["USB-C", "Lightning", "Micro-USB", "Apple Watch"] },
      { label: "Puissance maximale", quick: "power", placeholder: "Vérifiée sur l'emballage" },
      { label: "Longueur", options: ["1 m", "2 m", "3 m"] },
      { label: "Fonction particulière", options: ["Coudé", "Magnétique", "Tressé", "Données"] },
      brand,
      model,
      warranty,
    ],
  },
  {
    // Une batterie par capacité, puissance ou modèle : pas de variante Couleur.
    key: "batteries",
    match: ["batterie", "powerbank"],
    typeName: "Batterie externe",
    nameParts: ["type", "brand", "Capacité"],
    variantAxes: [],
    fields: [
      brand,
      model,
      { label: "Capacité", quick: "capacity" },
      { label: "Puissance maximale", quick: "power" },
      { label: "Nombre de sorties", options: ["1", "2", "3", "4", "5"] },
      { label: "Types de ports", placeholder: "USB-C, USB-A" },
      { label: "Affichage numérique", options: yesNo },
      { label: "Lampe intégrée", options: yesNo },
      { label: "Charge rapide", options: ["PD", "QC", "PD et QC", "Non"] },
      { label: "Câble fourni", options: yesNo },
      warranty,
    ],
  },
  {
    key: "montres",
    match: ["montre"],
    typeName: "Montre",
    nameParts: ["type", "Type", "brand", "model"],
    variantAxes: ["Taille", "Couleur"],
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
    variantAxes: ["Couleur"],
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
    variantAxes: ["Couleur", "Capacité"],
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
    variantAxes: ["Monture", "Couleur des verres"],
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
    variantAxes: ["Pointure", "Couleur"],
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
    variantAxes: ["Contenance"],
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
    // Une fiche par téléphone compatible et type de coque ; la couleur est la variante.
    key: "coques",
    match: ["coque", "protection"],
    typeName: "Coque",
    nameParts: ["type", "Type de coque", "Téléphone compatible"],
    variantAxes: ["Couleur"],
    fields: [
      { label: "Téléphone compatible", placeholder: "iPhone 15 Pro" },
      { label: "Type de coque", options: [...COQUE_TYPES] },
      brand,
      warranty,
    ],
  },
  {
    key: "creation",
    match: ["creation", "contenu", "video"],
    typeName: "",
    nameParts: ["Type", "brand", "model"],
    variantAxes: ["Couleur"],
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
    variantAxes: ["Couleur"],
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
  variantAxes: ["Couleur", "Taille", "Modèle compatible"],
  fields: [brand, model, color, condition, warranty],
};

export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Gabarit de la catégorie, reconnu par son nom (gabarit général sinon), complété
 * par le profil que le propriétaire a réglé pour cette catégorie.
 */
export function templateFor(
  categoryName: string | null | undefined,
  profile?: CategoryProfile | null,
): CategoryTemplate {
  const n = normalize(categoryName ?? "");
  const base = (n && categoryTemplates.find((t) => t.match.some((m) => n.includes(m)))) || genericTemplate;
  if (!profile) return base;
  const known = new Map(base.fields.map((f) => [normalize(f.label), f]));
  const fields = profile.fields?.length
    ? [
        // Marque, modèle et garantie restent proposés : ce sont des champs de la fiche.
        ...base.fields.filter((f) => f.target === "brand" || f.target === "model"),
        ...profile.fields
          .filter((f) => f.label.trim())
          .map((f): FieldDef => {
            const k = known.get(normalize(f.label));
            return { ...(k ?? {}), label: f.label.trim(), ...(f.options?.length ? { options: f.options } : {}) };
          })
          .filter((f) => f.target !== "brand" && f.target !== "model"),
        ...base.fields.filter((f) => f.target === "warranty" || f.target === "condition"),
      ].filter((f, i, all) => all.findIndex((x) => normalize(x.label) === normalize(f.label)) === i)
    : base.fields;
  return { ...base, fields, variantAxes: profile.variantAxes ?? base.variantAxes };
}

/** Profil par défaut d'une catégorie (point de départ modifiable dans Catalogue → Catégories). */
export function defaultProfile(categoryName: string): Required<CategoryProfile> {
  const t = templateFor(categoryName);
  return {
    fields: t.fields
      .filter((f) => !f.target)
      .map((f) => ({ label: f.label, ...(f.options ? { options: f.options } : {}) })),
    variantAxes: t.variantAxes,
  };
}

// ——— Nom simple suggéré ———

/** Une valeur incertaine n'entre jamais dans un nom. */
export function isUncertain(v: string | null | undefined) {
  const s = normalize(v ?? "");
  return !s || /\?|a confirmer|a relever|non lisible|illisible|a verifier|inconnu|famille/.test(s);
}

export interface NameInput {
  categoryName: string | null;
  profile?: CategoryProfile | null;
  brand: string;
  model: string;
  specs: { label: string; value: string }[];
}

export const NAME_ADVICE_LENGTH = 65;

/** Fautes et mentions à éviter dans un nom public (sans rien corriger tout seul). */
export function nameWarnings(name: string) {
  const n = normalize(name);
  const out: string[] = [];
  if (/\bcuire\b/.test(n)) out.push("« cuire » : écrire « cuir » (coque en cuir).");
  if (/\b(original|originale|premium|authentique)\b/.test(n))
    out.push("« Original », « Premium », « Authentique » : seulement avec une preuve.");
  return out;
}

/** « Type + Marque + Modèle + caractéristique utile », sans IA ni donnée incertaine. */
export function suggestName(input: NameInput) {
  const t = templateFor(input.categoryName, input.profile);
  const raw = (label: string) => input.specs.find((s) => normalize(s.label) === normalize(label))?.value ?? "";
  const spec = (label: string) => (isUncertain(raw(label)) ? "" : raw(label).trim());
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

  // Câbles : « Câble USB-C vers Lightning — 35 W » ; la marque générique reste dans son champ.
  if (t.key === "cables") {
    const from = spec("Connecteur d'entrée");
    const to = spec("Connecteur de sortie");
    if (!from || !to) return "";
    const extra = [spec("Fonction particulière").toLowerCase(), spec("Puissance maximale")].filter(Boolean);
    return `Câble ${from} vers ${to}${extra.length ? ` — ${extra.join(", ")}` : ""}`;
  }
  // Coques : « Coque en silicone iPhone 15 » ; jamais deux téléphones dans une même fiche.
  if (t.key === "coques") {
    const phone = spec("Téléphone compatible");
    if (!phone) return "";
    const w = COQUE_WORDING[normalize(spec("Type de coque"))] ?? {};
    return ["Coque", w.before, phone, w.after].filter(Boolean).join(" ");
  }
  // Chargeurs : la puissance et les ports se lisent dans le nom ; pas de marque générique.
  if (t.key === "chargeurs") {
    const kind = normalize(spec("Type de chargeur"));
    const words = [
      "Chargeur",
      kind === "voiture" ? "voiture" : kind === "sans fil" ? "sans fil" : "",
      spec("Compatible avec")
        ? kind === "sans fil"
          ? `pour ${spec("Compatible avec")}`
          : spec("Compatible avec")
        : "",
      spec("Types de ports").replace(/\s*\+\s*/g, " + "),
      spec("Puissance maximale"),
    ].filter(Boolean);
    return words.length > 1 ? cap(words.join(" ")) : "";
  }
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

// ——— Photos officielles repérées ———

/** Image officielle repérée pour un modèle exact : importée seulement après comparaison. */
export interface PhotoCandidate {
  url: string;
  /** Page officielle où l'image apparaît. */
  page: string;
  source: string;
  matches: string;
  note?: string;
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
