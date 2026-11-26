import { isAmbiguousOption } from "@/lib/ambiguous-options";
import type { Db } from "../db/client";
import {
  brandIndex,
  brandKey,
  brandLooksLikeModel,
  isGenericName,
  isNotABrand,
  median,
  nameTokens,
  priceLooksWrong,
  similarity,
} from "@/lib/catalog-rules";
import { fcfa } from "@/lib/format";
import { variantsWithoutPhoto } from "@/lib/variant-media";

/**
 * Contrôles éditoriaux du catalogue (espace « À vérifier » du Comptoir).
 * Lecture seule : aucune alerte ne modifie un prix, une marque ou une fiche.
 */
export type AlertKind = "prix" | "marque" | "doublon" | "fiche" | "photo" | "source" | "tache";

export interface AlertProduct {
  id: string;
  name: string;
  status: string;
  category: string;
  price: string;
  photos: number;
  specs: number;
}

export interface CatalogAlert {
  key: string;
  kind: AlertKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  products: AlertProduct[];
  /** Comparaison côte à côte (doublons possibles). */
  compare?: boolean;
}

export const alertKindLabels: Record<AlertKind, string> = {
  prix: "Prix suspects",
  marque: "Marques",
  doublon: "Doublons possibles",
  fiche: "Fiches incomplètes",
  photo: "Photos manquantes",
  source: "Sources contradictoires",
  tache: "À faire en boutique",
};

interface Row {
  id: string;
  name: string;
  brand: string;
  model: string;
  status: string;
  description: string;
  nspecs: number;
  category: string | null;
  pmin: number | null;
  pmax: number | null;
  nimg: number;
  urls: string[] | null;
  internal: { conflicts?: { field: string; gps: string; source: string; ref?: string }[]; tasks?: string[] } | null;
}

/** Mots qui distinguent deux modèles voisins (« Pro » ≠ « Pro Max »). */
const MODIFIERS = new Set([
  "pro",
  "max",
  "plus",
  "ultra",
  "air",
  "mini",
  "lite",
  "neo",
  "fold",
  "flip",
  "se",
  "xr",
  "xs",
]);
const modelTokens = (name: string) =>
  nameTokens(name)
    .filter((t) => /\d/.test(t) || MODIFIERS.has(t))
    .sort()
    .join(" ");

const priceText = (r: Row) =>
  r.pmin == null ? "—" : r.pmin === r.pmax ? fcfa(r.pmin) : `${fcfa(r.pmin)} à ${fcfa(r.pmax ?? r.pmin)}`;

const asProduct = (r: Row): AlertProduct => ({
  id: r.id,
  name: r.name,
  status: r.status === "published" ? "Publié" : "Brouillon",
  category: r.category ?? "—",
  price: priceText(r),
  photos: r.nimg,
  specs: r.nspecs,
});

export async function catalogAlerts(db: Db): Promise<CatalogAlert[]> {
  const rows = await db.query<Row>(
    `select p.id, p.name, p.brand, p.model, p.status, p.description,
            jsonb_array_length(coalesce(p.specs, '[]'::jsonb))::int as nspecs, c.name as category, p.internal,
            (select min(v.price) from variants v where v.product_id = p.id and v.active)::int as pmin,
            (select max(v.price) from variants v where v.product_id = p.id and v.active)::int as pmax,
            (select count(*)::int from product_images i where i.product_id = p.id and i.kind <> 'video') as nimg,
            (select array_agg(i.url order by i.position) from product_images i where i.product_id = p.id and i.kind <> 'video') as urls
       from products p left join categories c on c.id = p.category_id
      where p.status <> 'archived' and p.deleted_at is null and not p.is_demo
      order by p.name`,
  );
  const alerts: CatalogAlert[] = [];

  // ——— Prix : chiffres répétés, démesure, ou très loin des autres prix de la catégorie. Jamais corrigé seul. ———
  const byCategory = new Map<string, number[]>();
  for (const r of rows)
    if (r.pmin != null && r.category) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r.pmin]);
  for (const r of rows) {
    if (r.pmin == null) continue;
    const med = r.category ? median(byCategory.get(r.category) ?? []) : 0;
    const n = r.category ? (byCategory.get(r.category)?.length ?? 0) : 0;
    const wrong = priceLooksWrong(r.pmin) || priceLooksWrong(r.pmax ?? r.pmin);
    const outlier = n >= 5 && med > 0 && ((r.pmax ?? r.pmin) > med * 15 || r.pmin < med / 15);
    if (!wrong && !outlier) continue;
    alerts.push({
      key: `prix-${r.id}`,
      kind: "prix",
      severity: wrong ? "high" : "medium",
      title: `Prix à vérifier : ${priceText(r)}`,
      detail: wrong
        ? "Ce prix paraît faux (chiffres répétés ou démesuré). Il n'est jamais corrigé automatiquement : saisissez le bon prix."
        : `Très éloigné des autres prix de « ${r.category} » (médiane ${fcfa(Math.round(med))}). Confirmez-le ou corrigez-le.`,
      products: [asProduct(r)],
    });
  }

  // ——— Marques : type d'objet, écritures différentes, modèle dans le champ marque. ———
  const index = brandIndex(rows.map((r) => r.brand));
  const spellings = new Map<string, Map<string, Row[]>>();
  for (const r of rows) {
    const k = brandKey(r.brand);
    if (!k) continue;
    const m = spellings.get(k) ?? new Map<string, Row[]>();
    m.set(r.brand.trim(), [...(m.get(r.brand.trim()) ?? []), r]);
    spellings.set(k, m);
  }
  for (const [k, m] of spellings) {
    if (m.size > 1) {
      const all = [...m.values()].flat();
      alerts.push({
        key: `marque-casse-${k}`,
        kind: "marque",
        severity: "low",
        title: `Marque écrite de plusieurs façons : ${[...m.keys()].map((x) => `« ${x} »`).join(", ")}`,
        detail: `Le filtre du site les regroupe sous « ${index.get(k)} ». Uniformisez l'écriture sur ces fiches.`,
        products: all.slice(0, 12).map(asProduct),
      });
    }
  }
  const notBrand = rows.filter((r) => r.brand && isNotABrand(r.brand, r.category ? [r.category] : []));
  for (const group of [...new Set(notBrand.map((r) => r.brand.trim()))]) {
    const list = notBrand.filter((r) => r.brand.trim() === group);
    alerts.push({
      key: `marque-type-${brandKey(group)}`,
      kind: "marque",
      severity: "medium",
      title: `« ${group} » n'est pas une marque (${list.length} fiche${list.length > 1 ? "s" : ""})`,
      detail:
        "C'est un type de produit ou une catégorie. Le site ne l'affiche pas comme marque ; corrigez le champ ou laissez-le vide.",
      products: list.slice(0, 12).map(asProduct),
    });
  }
  for (const r of rows.filter(
    (x) => x.brand && !isNotABrand(x.brand, x.category ? [x.category] : []) && brandLooksLikeModel(x.brand),
  )) {
    alerts.push({
      key: `marque-modele-${r.id}`,
      kind: "marque",
      severity: "medium",
      title: `Le champ marque contient un modèle : « ${r.brand} »`,
      detail: "Mettez seulement la marque dans « Marque » et le modèle dans « Modèle exact ».",
      products: [asProduct(r)],
    });
  }

  // ——— Doublons possibles : même modèle + noms proches, ou même photo. Jamais fusionnés seuls. ———
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => void (parent[find(a)] = find(b));
  const urlOwners = new Map<string, number[]>();
  rows.forEach((r, i) => (r.urls ?? []).forEach((u) => urlOwners.set(u, [...(urlOwners.get(u) ?? []), i])));
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const sim = similarity(rows[a].name, rows[b].name);
      const sameModel = modelTokens(rows[a].name) === modelTokens(rows[b].name);
      const sharePhoto = (rows[a].urls ?? []).some((u) => (urlOwners.get(u) ?? []).includes(b));
      if (
        (sameModel && sim >= 0.6 && modelTokens(rows[a].name) !== "") ||
        (sharePhoto && sim >= 0.5) ||
        (sim === 1 && !isGenericName(rows[a].name))
      )
        union(a, b);
    }
  }
  const groups = new Map<number, Row[]>();
  rows.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r]));
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    alerts.push({
      key: `doublon-${g.map((r) => r.id.slice(0, 8)).join("-")}`,
      kind: "doublon",
      severity: "medium",
      title: `Même produit ? ${g.map((r) => `« ${r.name} »`).join(" / ")}`,
      detail:
        "Même nom ou même photo. Comparez : si c'est le même article, gardez la meilleure fiche et archivez l'autre. Rien n'est fusionné automatiquement.",
      products: g.map(asProduct),
      compare: true,
    });
  }

  // ——— Fiches publiées sans description ou sans caractéristiques ———
  const published = rows.filter((r) => r.status === "published");
  const noDescription = published.filter((r) => r.description.trim().length < 40);
  if (noDescription.length)
    alerts.push({
      key: "fiche-description",
      kind: "fiche",
      severity: "medium",
      title: `${noDescription.length} fiche${noDescription.length > 1 ? "s" : ""} publiée${noDescription.length > 1 ? "s" : ""} sans description`,
      detail: "Une fiche sans description n'est jamais mise en vedette sur l'accueil. Ouvrez-la pour compléter.",
      products: noDescription.slice(0, 40).map(asProduct),
    });
  const noSpecs = published.filter((r) => r.nspecs === 0);
  if (noSpecs.length)
    alerts.push({
      key: "fiche-caracteristiques",
      kind: "fiche",
      severity: "low",
      title: `${noSpecs.length} fiche${noSpecs.length > 1 ? "s" : ""} publiée${noSpecs.length > 1 ? "s" : ""} sans caractéristiques`,
      detail: "Ajoutez les caractéristiques utiles au choix (modèle, capacité, compatibilité…).",
      products: noSpecs.slice(0, 40).map(asProduct),
    });
  const vague = published.filter((r) => isGenericName(r.name));
  if (vague.length)
    alerts.push({
      key: "fiche-nom-vague",
      kind: "fiche",
      severity: "medium",
      title: `${vague.length} nom${vague.length > 1 ? "s" : ""} trop vague${vague.length > 1 ? "s" : ""}`,
      detail: "Le client doit reconnaître ce qu'il achète : précisez le modèle dans le nom.",
      products: vague.map(asProduct),
    });

  // ——— Photos : brouillons sans photo (la publication l'exige), fiche publiée sans photo (anormal). ———
  const noPhoto = rows.filter((r) => r.nimg === 0);
  if (noPhoto.length)
    alerts.push({
      key: "photo-manquante",
      kind: "photo",
      severity: noPhoto.some((r) => r.status === "published") ? "high" : "low",
      title: `${noPhoto.length} fiche${noPhoto.length > 1 ? "s" : ""} sans photo`,
      detail: "Photographiez l'article en boutique : une photo exacte est nécessaire pour publier.",
      products: noPhoto.map(asProduct),
    });

  // ——— Variantes sans photo représentative : seulement pour les fiches dont des photos sont déjà liées à des variantes. ———
  const scoped = await db.query<{
    id: string;
    axes: string[];
    variants: { options: Record<string, string> }[] | null;
    media: { url: string; alt: string; color: string | null; options: Record<string, string> | null }[] | null;
  }>(
    `select p.id, p.axes,
            (select json_agg(json_build_object('options', v.options)) from variants v where v.product_id = p.id and v.active) as variants,
            (select json_agg(json_build_object('url', i.url, 'alt', i.alt, 'color', i.color, 'options', i.options) order by i.position)
               from product_images i where i.product_id = p.id and i.kind <> 'video') as media
       from products p
      where p.status <> 'archived' and p.deleted_at is null and not p.is_demo
        and exists (select 1 from product_images i where i.product_id = p.id and (i.options is not null or i.color is not null))`,
  );
  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const s of scoped) {
    const row = rowById.get(s.id);
    if (!row) continue;
    const visual = (s.axes ?? []).find((a) => ["Couleur", "Monture", "Coloris"].includes(a));
    const missing = variantsWithoutPhoto(s.variants ?? [], s.media ?? [], s.axes ?? [], visual);
    if (!missing.length) continue;
    alerts.push({
      key: `photo-variante-${s.id}`,
      kind: "photo",
      severity: "low",
      title: `${row.name} : ${missing.length} variante${missing.length > 1 ? "s" : ""} sans photo`,
      detail:
        "Le site affiche « photo non disponible » pour : " +
        missing.map((v) => Object.values(v.options).join(" · ")).join(" ; ") +
        ". Ajoutez la photo exacte, ou une photo commune à toutes les variantes.",
      products: [asProduct(row)],
    });
  }

  // ——— Variantes au libellé ambigu (« Version de base »…) : à préciser avec GPS, jamais corrigées automatiquement. ———
  const withVariants = await db.query<{ id: string; options: Record<string, string>[] | null }>(
    `select p.id, (select json_agg(v.options) from variants v where v.product_id = p.id and v.active) as options
       from products p
      where p.status <> 'archived' and p.deleted_at is null and not p.is_demo`,
  );
  for (const s of withVariants) {
    const row = rowById.get(s.id);
    if (!row) continue;
    const labels = [
      ...new Set(
        (s.options ?? []).flatMap((o) => Object.entries(o ?? {}).filter(([, v]) => isAmbiguousOption(String(v)))),
      ),
    ].map(([k, v]) => `${k} : « ${v} »`);
    if (!labels.length) continue;
    alerts.push({
      key: `variante-ambigue-${s.id}`,
      kind: "fiche",
      severity: "medium",
      title: `${row.name} : option à préciser`,
      detail:
        `Libellé peu clair (${[...new Set(labels)].join(" ; ")}). Le site écrit « à préciser avec GPS » à côté de l'option. ` +
        "Renseignez la vraie valeur (capacité, version…) quand GPS la confirme : prix, stock et coût ne sont pas modifiés.",
      products: [asProduct(row)],
    });
  }

  // ——— Sources contradictoires et tâches enregistrées pendant l'enrichissement ———
  for (const r of rows) {
    const conflicts = r.internal?.conflicts ?? [];
    if (conflicts.length)
      alerts.push({
        key: `source-${r.id}`,
        kind: "source",
        severity: "medium",
        title: `Votre saisie diffère de la source : ${r.name}`,
        detail:
          conflicts
            .map((c) => `${c.field} : votre saisie « ${c.gps} », source « ${c.source} »${c.ref ? ` (${c.ref})` : ""}`)
            .join(" ; ") + ". Votre saisie est conservée : vérifiez sur l'article.",
        products: [asProduct(r)],
      });
  }
  const tasks = rows.filter((r) => (r.internal?.tasks ?? []).length);
  for (const r of tasks)
    alerts.push({
      key: `tache-${r.id}`,
      kind: "tache",
      severity: "low",
      title: r.name,
      detail: (r.internal?.tasks ?? []).join(" ; "),
      products: [asProduct(r)],
    });

  const order = { high: 0, medium: 1, low: 2 } as const;
  return alerts.sort((a, b) => order[a.severity] - order[b.severity] || a.kind.localeCompare(b.kind));
}
