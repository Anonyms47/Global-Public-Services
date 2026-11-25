import { parseDescription } from "./description";
import { DAYS, type StoreHours } from "./stores";

/** Texte brut d'une fiche pour les moteurs de recherche : sans puces, sans titres de listes, sans promesse de stock. */
export function plainDescription(description: string): string {
  const blocks = parseDescription(description, { dropStockClaims: true });
  const parts = blocks.map((b) => (b.type === "p" ? b.text : b.items.join(", ")));
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/^\s*(points forts|contenu de la boîte)\s*:\s*/i, "")
    .trim();
}

/** Coupe proprement à la fin d'un mot, avec « … » si le texte est raccourci. */
export function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** Description de page produit : le texte de la fiche, ou à défaut une phrase neutre (rien d'inventé). */
export function productMetaDescription(p: { name: string; brand: string; description: string }): string {
  const plain = plainDescription(p.description);
  if (plain.length >= 40) return clip(plain, 155);
  const base = `${p.name}${p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? ` ${p.brand}` : ""}`;
  return clip(plain ? `${base} : ${plain}. À commander chez GPS.` : `${base}, à commander chez GPS.`, 155);
}

/** Titre de page produit : la marque n'est ajoutée que si le nom ne la contient pas déjà. */
export function productTitle(p: { name: string; brand: string }): string {
  const hasBrand = !p.brand || p.name.toLowerCase().includes(p.brand.toLowerCase());
  return hasBrand ? p.name : `${p.name} — ${p.brand}`;
}

const CONDITIONS: Record<string, string> = {
  neuf: "https://schema.org/NewCondition",
  reconditionné: "https://schema.org/RefurbishedCondition",
  occasion: "https://schema.org/UsedCondition",
};
export function schemaCondition(condition: string | null | undefined): string | undefined {
  if (!condition) return undefined;
  const key = condition.split(" —")[0].trim().toLowerCase();
  return CONDITIONS[key];
}

const SCHEMA_DAYS: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Horaires structurés : seulement les jours confirmés ouverts (jamais d'horaire deviné). */
export function openingHoursSpec(h: StoreHours) {
  const specs = DAYS.filter(([k]) => h.days?.[k]?.enabled).map(([k]) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: SCHEMA_DAYS[k],
    opens: h.days[k]?.open || h.open,
    closes: h.days[k]?.close || h.close,
  }));
  return specs.length ? specs : undefined;
}

export interface LocalBusinessInput {
  company: { name: string; phone: string; email: string; address: string; city: string; mapsUrl: string };
  stores: { address: string; district: string; city: string; phone: string; hours: StoreHours; maps_url: string }[];
  url: string;
  logo: string;
}

/** Données « commerce local » pour Google, à partir de la boutique principale ; champs vides omis. */
export function localBusinessJsonLd({ company, stores, url, logo }: LocalBusinessInput) {
  const main = stores[0];
  const street = main?.address || company.address;
  const city = main?.city || company.city;
  const phone = main?.phone || company.phone;
  const address =
    street || city
      ? {
          "@type": "PostalAddress",
          streetAddress: street || undefined,
          addressLocality: city || undefined,
          addressCountry: "SN",
        }
      : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: company.name,
    url,
    logo,
    image: logo,
    telephone: phone || undefined,
    email: company.email || undefined,
    address,
    hasMap: main?.maps_url || company.mapsUrl || undefined,
    openingHoursSpecification: main ? openingHoursSpec(main.hours) : undefined,
    currenciesAccepted: "XOF",
  };
}

export function webSiteJsonLd(name: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    inLanguage: "fr",
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/boutique?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

/** JSON-LD sûr à insérer dans une balise script. */
export function jsonLdString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
