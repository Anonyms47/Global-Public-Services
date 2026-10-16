import type { Db } from "../db/client";
import { fail } from "./errors";
import { listCategories, saveProduct } from "./catalog";
import { parseCsv, toCsv } from "@/lib/csv";
import { slugify } from "@/lib/format";

/**
 * Import du catalogue par fichier CSV. Une ligne = une variante ; les lignes
 * de même « nom » (et même marque) forment un produit. Tout est importé en
 * brouillon : les photos s'ajoutent ensuite depuis la fiche ou la médiathèque.
 */
export const importColumns = [
  ["nom", "Nom du produit (obligatoire)"],
  ["marque", "Marque"],
  ["categorie", "Catégorie existante (nom ou identifiant d'adresse)"],
  ["description", "Description"],
  ["reference", "Référence de la variante, unique (obligatoire)"],
  ["prix", "Prix de vente en FCFA, entier (obligatoire)"],
  ["cout", "Coût d'achat en FCFA (facultatif)"],
  ["stock", "Stock initial (facultatif, 0 par défaut)"],
  ["options", "Options de la variante : Couleur=Noir|Capacité=128 Go"],
] as const;

export function importTemplate() {
  return toCsv([
    importColumns.map(([k]) => k),
    [
      "Exemple Écouteurs",
      "Marque",
      "",
      "Description du produit, au moins vingt caractères.",
      "EX-ECO-NO",
      15000,
      "",
      5,
      "Couleur=Noir",
    ],
    ["Exemple Écouteurs", "Marque", "", "", "EX-ECO-BL", 15000, "", 3, "Couleur=Blanc"],
  ]);
}

export interface ImportPreview {
  products: {
    name: string;
    brand: string;
    category: string | null;
    variants: {
      line: number;
      sku: string;
      price: number;
      cost: number | null;
      stock: number;
      options: Record<string, string>;
    }[];
  }[];
  errors: { line: number; message: string }[];
  lines: number;
}

const MAX_LINES = 1000;

export async function previewImport(db: Db, text: string): Promise<ImportPreview> {
  const rows = parseCsv(text);
  if (!rows.length) fail("validation", "Le fichier est vide.");
  const header = rows[0].map((h) => slugify(h).replace(/-/g, ""));
  const idx = (k: string) => header.indexOf(k);
  const missing = ["nom", "reference", "prix"].filter((k) => idx(k) < 0);
  if (missing.length) fail("validation", `Colonnes manquantes : ${missing.join(", ")}. Téléchargez le modèle.`);
  if (rows.length - 1 > MAX_LINES) fail("validation", `${MAX_LINES} lignes au maximum par import.`);

  const categories = await listCategories(db);
  const catBy = (v: string) => {
    const k = slugify(v);
    return categories.find((c) => c.slug === k || slugify(c.name) === k) ?? null;
  };
  const existing = new Set(
    (await db.query<{ sku: string }>("select upper(sku) as sku from variants")).map((r) => r.sku),
  );
  const errors: ImportPreview["errors"] = [];
  const seen = new Set<string>();
  const products = new Map<string, ImportPreview["products"][number] & { description: string }>();

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? "").trim() : "");
    const name = get("nom");
    const sku = get("reference").toUpperCase();
    const priceRaw = get("prix").replace(/[\s  ]/g, "");
    const costRaw = get("cout").replace(/[\s  ]/g, "");
    const stockRaw = get("stock").replace(/\s/g, "");
    const lineErrors: string[] = [];
    if (!name) lineErrors.push("nom manquant");
    if (!sku) lineErrors.push("référence manquante");
    else if (existing.has(sku)) lineErrors.push(`référence ${sku} déjà utilisée dans le catalogue`);
    else if (seen.has(sku)) lineErrors.push(`référence ${sku} en double dans le fichier`);
    const price = Number(priceRaw);
    if (!/^\d+$/.test(priceRaw) || price <= 0) lineErrors.push("prix invalide (entier en FCFA, supérieur à 0)");
    const cost = costRaw ? Number(costRaw) : null;
    if (costRaw && !/^\d+$/.test(costRaw)) lineErrors.push("coût invalide");
    const stock = stockRaw ? Number(stockRaw) : 0;
    if (stockRaw && (!/^\d+$/.test(stockRaw) || stock > 100000)) lineErrors.push("stock invalide");
    const catRaw = get("categorie");
    const cat = catRaw ? catBy(catRaw) : null;
    if (catRaw && !cat) lineErrors.push(`catégorie « ${catRaw} » inconnue (créez-la d'abord)`);
    const options: Record<string, string> = {};
    for (const part of get("options")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const [k, ...v] = part.split("=");
      if (!k?.trim() || !v.join("=").trim()) lineErrors.push(`option « ${part} » invalide (forme Axe=Valeur)`);
      else options[k.trim()] = v.join("=").trim();
    }
    if (lineErrors.length) {
      errors.push({ line, message: lineErrors.join(" ; ") });
      return;
    }
    seen.add(sku);
    const key = `${name.toLowerCase()}|${get("marque").toLowerCase()}`;
    const p = products.get(key) ?? {
      name,
      brand: get("marque"),
      category: cat?.id ?? null,
      description: get("description"),
      variants: [],
    };
    if (!p.description && get("description")) p.description = get("description");
    const axes = Object.keys(p.variants[0]?.options ?? options)
      .sort()
      .join("|");
    if (p.variants.length && axes !== Object.keys(options).sort().join("|")) {
      errors.push({ line, message: `les options doivent avoir les mêmes axes que les autres lignes de « ${name} »` });
      return;
    }
    p.variants.push({ line, sku, price, cost, stock, options });
    products.set(key, p);
  });
  return { products: [...products.values()], errors, lines: rows.length - 1 };
}

/** Applique l'import : tout ou rien, uniquement si l'aperçu est sans erreur. */
export async function applyImport(db: Db, text: string, ctx: { userId: string; withCosts: boolean; isDemo: boolean }) {
  return db.tx(async (tx) => {
    const preview = await previewImport(tx, text);
    if (preview.errors.length)
      fail("validation", `${preview.errors.length} ligne(s) en erreur : corrigez le fichier puis relancez l'aperçu.`);
    if (!preview.products.length) fail("validation", "Aucun produit à importer.");
    const ids: string[] = [];
    for (const p of preview.products as (ImportPreview["products"][number] & { description: string })[]) {
      const axes = Object.keys(p.variants[0].options);
      const r = await saveProduct(
        tx,
        {
          name: p.name,
          brand: p.brand,
          categoryId: p.category,
          description: p.description ?? "",
          specs: [],
          condition: null,
          axes,
          images: [],
          variants: p.variants.map((v) => ({
            sku: v.sku,
            options: v.options,
            price: v.price,
            costPrice: ctx.withCosts ? v.cost : null,
            initialStock: v.stock,
          })),
          status: "draft",
          featured: false,
          isDemo: ctx.isDemo,
        },
        { userId: ctx.userId, withCosts: ctx.withCosts },
      );
      ids.push(r.id);
    }
    return { products: ids.length, variants: preview.products.reduce((s, p) => s + p.variants.length, 0) };
  });
}
