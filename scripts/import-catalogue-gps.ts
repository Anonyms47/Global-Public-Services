/**
 * Import du catalogue réel de la boutique depuis data/gps-catalogue-reel-2026-10-16.json.
 *
 *   npm run catalogue:import:gps -- --dry-run
 *   npm run catalogue:import:gps -- --apply --confirm=IMPORTER [--only=cle1,cle2]
 *
 * Base visée : DATABASE_URL (PostgreSQL) ou PGLITE_DIR (par défaut .data/pglite).
 * Tout est créé en brouillon ; relancer ne crée aucun doublon. En production, la page
 * Comptoir → Catalogue → Import → Catalogue de la boutique fait la même chose (propriétaire).
 */
import { openDb } from "../src/server/db/client";
import { applyGpsImport, planGpsImport } from "../src/server/domain/catalog-import-gps";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirm = args.find((a) => a.startsWith("--confirm="))?.split("=")[1];
  const only = args
    .find((a) => a.startsWith("--only="))
    ?.split("=")[1]
    ?.split(",")
    .filter(Boolean);
  const db = await openDb({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DIR ?? ".data/pglite" });
  const plan = await planGpsImport(db);
  console.log(`Manifeste ${plan.version} — produits existants en base : ${plan.existingProducts}`);
  console.log(
    `À créer : ${plan.totals.create} (${plan.totals.variants} variantes) · déjà importés : ${plan.totals.exists} · ignorés : ${plan.totals.conflict}`,
  );
  console.log(`Catégories à créer : ${plan.categoriesToCreate.join(", ") || "aucune"}`);
  console.log(`Photos de boutique manquantes : ${plan.missingPhotos} · médias importés : 0`);
  for (const r of plan.rows.filter((x) => x.action !== "create")) console.log(`  ignoré — ${r.name} : ${r.reason}`);
  if (!apply) {
    console.log("Simulation terminée : rien n'a été écrit.");
    process.exit(0);
  }
  if (confirm !== "IMPORTER") {
    console.error("Ajoutez --confirm=IMPORTER pour écrire en base.");
    process.exit(1);
  }
  const owner = await db.one<{ id: string }>(
    "select id from users where role = 'owner' and active and not is_demo order by created_at limit 1",
  );
  const report = await applyGpsImport(db, { id: owner?.id ?? null }, { only });
  console.log(`Sauvegarde : ${report.backup}`);
  console.log(
    `Créés : ${report.created.length} · ignorés : ${report.skipped.length} · erreurs : ${report.errors.length}`,
  );
  for (const e of report.errors) console.log(`  erreur — ${e.name} : ${e.error}`);
  process.exit(report.errors.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
