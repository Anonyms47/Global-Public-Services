import type { Db } from "../db/client";
import { newId } from "./errors";
import { audit } from "./audit";
import { listCategories, saveCategory, saveProduct } from "./catalog";
import manifestJson from "../../../data/gps-catalogue-reel-2026-10-16.json";

/**
 * Import du catalogue réel de la boutique, préparé dans un manifeste versionné
 * (data/gps-catalogue-reel-2026-10-16.json, voir docs/PROMPT-IMPORT-CATALOGUE-GPS.md).
 *
 * Règles : tout en brouillon privé, aucun prix, coût, stock ni code-barres inventé,
 * idempotent par clé externe (relancer ne crée aucun doublon), sauvegarde avant
 * écriture, journal par produit, une erreur isolée n'arrête pas le reste.
 */

export interface ManifestSource {
  id: string;
  url: string | null;
  kind: string;
  consulted: string;
  verified: string;
}

export interface ManifestProduct {
  externalKey: string;
  section: string;
  name: string;
  brand: string;
  model: string;
  category: string;
  subtype: string;
  summary: string;
  description: string;
  specs: { label: string; value: string; source: string }[];
  axes: string[];
  variants: { options: Record<string, string> }[];
  compatibility: string[];
  boxContents: string[] | null;
  sources: ManifestSource[];
  keywords: string[];
  seo: { title: string; description: string };
  status: "draft";
  needsHumanReview: boolean;
  humanChecks: string[];
  media: unknown[];
  shopPhotos: string[];
  notes: string | null;
}

export interface Manifest {
  version: string;
  description: string;
  photosExpectedDir: string;
  photosExpected: string[];
  photosAvailable: boolean;
  categories: string[];
  products: ManifestProduct[];
  identificationRequired: string[];
  usedDeviceChecks: string[];
}

export const gpsManifest = manifestJson as Manifest;

export type PlanAction = "create" | "exists" | "conflict";

export interface PlanRow {
  externalKey: string;
  name: string;
  category: string;
  section: string;
  variants: number;
  checks: number;
  action: PlanAction;
  productId: string | null;
  reason: string | null;
}

export interface ImportPlan {
  version: string;
  existingProducts: number;
  rows: PlanRow[];
  categoriesToCreate: string[];
  totals: { create: number; exists: number; conflict: number; variants: number; media: number };
  missingPhotos: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Simulation : rien n'est écrit. */
export async function planGpsImport(db: Db, manifest: Manifest = gpsManifest): Promise<ImportPlan> {
  const [imported, all, categories] = await Promise.all([
    db.query<{ key: string; id: string }>(
      "select internal->>'externalKey' as key, id from products where internal->>'externalKey' is not null",
    ),
    db.query<{ id: string; name: string; key: string | null }>(
      "select id, name, internal->>'externalKey' as key from products where deleted_at is null",
    ),
    listCategories(db, { scope: "all" }),
  ]);
  const byKey = new Map(imported.map((r) => [r.key, r.id]));
  const manual = new Map(all.filter((p) => !p.key).map((p) => [norm(p.name), p.id]));
  const known = new Set(categories.map((c) => norm(c.name)));
  const rows: PlanRow[] = manifest.products.map((p) => {
    const existing = byKey.get(p.externalKey);
    const twin = manual.get(norm(p.name));
    return {
      externalKey: p.externalKey,
      name: p.name,
      category: p.category,
      section: p.section,
      variants: p.variants.length,
      checks: p.humanChecks.length,
      action: existing ? "exists" : twin ? "conflict" : "create",
      productId: existing ?? twin ?? null,
      reason: existing
        ? "Déjà importé : ignoré."
        : twin
          ? "Un produit du même nom a été saisi à la main : ignoré pour éviter un doublon."
          : null,
    };
  });
  const used = [...new Set(manifest.products.map((p) => p.category))];
  const create = rows.filter((r) => r.action === "create");
  return {
    version: manifest.version,
    existingProducts: all.length,
    rows,
    categoriesToCreate: used.filter((c) => !known.has(norm(c))),
    totals: {
      create: create.length,
      exists: rows.filter((r) => r.action === "exists").length,
      conflict: rows.filter((r) => r.action === "conflict").length,
      variants: create.reduce((n, r) => n + r.variants, 0),
      media: 0,
    },
    missingPhotos: manifest.photosAvailable ? 0 : manifest.photosExpected.length,
  };
}

export interface ImportReport {
  backup: string;
  created: { id: string; name: string; externalKey: string; variants: number }[];
  skipped: { name: string; reason: string }[];
  errors: { name: string; error: string }[];
  categoriesCreated: string[];
}

/**
 * Application : sauvegarde datée, catégories manquantes via le module Catégories,
 * puis chaque produit via saveProduct (transaction par produit).
 * `only` : reprise ciblée sur certaines clés externes.
 */
export async function applyGpsImport(
  db: Db,
  actor: { id: string | null },
  opts: { only?: string[]; manifest?: Manifest } = {},
): Promise<ImportReport> {
  const manifest = opts.manifest ?? gpsManifest;
  const plan = await planGpsImport(db, manifest);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backup = `catalogue-avant-import-${stamp}`;
  const [products, categories] = await Promise.all([
    db.query("select id, name, slug, status, category_id, internal->>'externalKey' as external_key from products"),
    db.query("select id, name, slug, visible, archived_at from categories"),
  ]);
  await db.query("insert into data_backups (id, label, payload, counts, created_by) values ($1, $2, $3, $4, $5)", [
    newId(),
    backup,
    JSON.stringify({ manifest: manifest.version, products, categories }),
    JSON.stringify({ products: products.length, categories: categories.length }),
    actor.id,
  ]);

  const categoriesCreated: string[] = [];
  for (const name of plan.categoriesToCreate) {
    await saveCategory(db, { name, description: "" });
    await audit(db, actor.id, "category.create", name, { source: "import", manifest: manifest.version });
    categoriesCreated.push(name);
  }
  const catIds = new Map(
    (await listCategories(db, { scope: "all" })).filter((c) => !c.archived_at).map((c) => [norm(c.name), c.id]),
  );

  const report: ImportReport = { backup, created: [], skipped: [], errors: [], categoriesCreated };
  const wanted = opts.only?.length ? new Set(opts.only) : null;
  for (const row of plan.rows) {
    if (wanted && !wanted.has(row.externalKey)) continue;
    if (row.action !== "create") {
      report.skipped.push({ name: row.name, reason: row.reason ?? "Ignoré." });
      continue;
    }
    const p = manifest.products.find((x) => x.externalKey === row.externalKey)!;
    try {
      const r = await saveProduct(
        db,
        {
          name: p.name,
          brand: p.brand,
          categoryId: catIds.get(norm(p.category)) ?? null,
          description: p.description,
          specs: p.specs.map(({ label, value }) => ({ label, value })),
          condition: null,
          warranty: "",
          axes: p.axes,
          images: [],
          // Variantes confirmées uniquement ; prix à saisir (brouillon jamais publiable à 0), aucun stock inventé.
          variants: p.variants.map((v) => ({ sku: "", barcode: null, options: v.options, price: 0, initialStock: 0 })),
          status: "draft",
          featured: false,
          internal: {
            externalKey: p.externalKey,
            manifest: manifest.version,
            importedAt: new Date().toISOString(),
            section: p.section,
            model: p.model,
            subtype: p.subtype,
            summary: p.summary,
            specSources: p.specs.map(({ label, source }) => ({ label, source })),
            sources: p.sources,
            compatibility: p.compatibility,
            boxContents: p.boxContents,
            keywords: p.keywords,
            seo: p.seo,
            needsHumanReview: p.needsHumanReview,
            humanChecks: p.humanChecks,
            media: p.media,
            shopPhotos: p.shopPhotos,
            notes: p.notes,
          },
        },
        { userId: actor.id, withCosts: false },
      );
      await audit(db, actor.id, "product.import", p.name, {
        id: r.id,
        externalKey: p.externalKey,
        variants: p.variants.length,
        media: 0,
        initialStock: 0,
      });
      report.created.push({ id: r.id, name: p.name, externalKey: p.externalKey, variants: p.variants.length });
    } catch (e) {
      // Course entre deux imports : la contrainte d'unicité de la clé externe empêche le doublon.
      const msg = e instanceof Error ? e.message : String(e);
      if (/products_external_key|duplicate key/i.test(msg))
        report.skipped.push({ name: p.name, reason: "Déjà importé." });
      else report.errors.push({ name: p.name, error: msg });
    }
  }
  await audit(db, actor.id, "catalog.import", manifest.version, {
    backup,
    created: report.created.length,
    skipped: report.skipped.length,
    errors: report.errors.length,
  });
  return report;
}

/** Données internes d'une fiche importée (sources, vérifications restantes), pour le Comptoir. */
export async function importedInfo(db: Db, productId: string) {
  const r = await db.one<{ internal: Record<string, unknown> }>("select internal from products where id = $1", [
    productId,
  ]);
  const i = r?.internal ?? {};
  if (!i.externalKey) return null;
  return i as {
    externalKey: string;
    model: string;
    humanChecks: string[];
    sources: ManifestSource[];
    specSources: { label: string; source: string }[];
    notes: string | null;
    needsHumanReview: boolean;
    compatibility: string[];
    checksDoneAt?: string;
    checksDoneBy?: string;
  };
}
