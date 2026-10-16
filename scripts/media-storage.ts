/**
 * Stockage des médias : état, migration vers Supabase Storage, vérification,
 * retour arrière. La migration est NON destructive : les octets restent en
 * base tant que « release » n'est pas lancé explicitement.
 *
 *   npx tsx scripts/media-storage.ts status
 *   npx tsx scripts/media-storage.ts migrate --dry-run
 *   npx tsx scripts/media-storage.ts migrate
 *   npx tsx scripts/media-storage.ts verify
 *   npx tsx scripts/media-storage.ts rollback
 *   npx tsx scripts/media-storage.ts release --confirm   (après vérification ET sauvegarde de la base)
 *
 * Variables : DATABASE_URL (sinon base locale PGlite), et pour Supabase
 * SUPABASE_URL + SUPABASE_SECRET_KEY (MEDIA_BUCKET, par défaut gps-media).
 * Sans Supabase, le stockage local (MEDIA_LOCAL_DIR) est utilisé.
 * Aucune clé ni adresse de base n'est jamais affichée.
 */
import { openDb } from "../src/server/db/client";
import {
  mediaStorageStatus,
  migrateMediaToStore,
  releaseDatabaseCopies,
  rollbackMediaFromStore,
  verifyMediaStore,
} from "../src/server/domain/media";
import { mediaStorage } from "../src/server/storage";

async function main() {
  const [command, ...flags] = process.argv.slice(2);
  const db = await openDb({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DIR ?? ".data/pglite" });
  const cfg = mediaStorage();
  const store = cfg.store;
  const label = cfg.backend === "supabase" ? `Supabase Storage (${cfg.bucket})` : (cfg.backend ?? "aucun");
  console.log(`Stockage cible : ${label}`);
  const table = async () => console.table(await mediaStorageStatus(db));
  switch (command) {
    case "status":
      await table();
      break;
    case "migrate": {
      if (!store) throw new Error(cfg.problem ?? "Aucun stockage objet configuré.");
      const r = await migrateMediaToStore(db, store, { dryRun: flags.includes("--dry-run") });
      console.log(
        `${r.scanned} fichier(s) en base examiné(s) · ${r.migrated} copié(s) et vérifié(s) · ${r.failed.length} échec(s)` +
          (flags.includes("--dry-run") ? " (essai à blanc : rien n'a été modifié)" : ""),
      );
      for (const f of r.failed) console.log(`  ${f.id} : ${f.error}`);
      await table();
      if (r.failed.length) process.exitCode = 2;
      break;
    }
    case "verify": {
      if (!store) throw new Error(cfg.problem ?? "Aucun stockage objet configuré.");
      const r = await verifyMediaStore(db, store);
      console.log(`${r.checked} fichier(s) vérifié(s) · ${r.problems.length} problème(s)`);
      for (const p of r.problems) console.log(`  ${p.id} : ${p.problem}`);
      if (r.problems.length) process.exitCode = 2;
      break;
    }
    case "rollback": {
      if (!store) throw new Error(cfg.problem ?? "Aucun stockage objet configuré.");
      const r = await rollbackMediaFromStore(db, store);
      console.log(`${r.restored} fichier(s) ramené(s) en base · ${r.failed.length} échec(s)`);
      for (const f of r.failed) console.log(`  ${f.id} : ${f.error}`);
      console.log("Pensez à définir MEDIA_STORAGE=database pour que les nouveaux envois restent en base.");
      await table();
      if (r.failed.length) process.exitCode = 2;
      break;
    }
    case "release": {
      if (!store) throw new Error(cfg.problem ?? "Aucun stockage objet configuré.");
      const n = await releaseDatabaseCopies(db, store, { confirm: flags.includes("--confirm") });
      console.log(`${n} copie(s) en base libérée(s). Les fichiers restent dans le stockage.`);
      break;
    }
    default:
      console.log("Commandes : status | migrate [--dry-run] | verify | rollback | release --confirm");
      process.exitCode = 1;
  }
  process.exit();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
