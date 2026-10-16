/**
 * Crée le premier compte propriétaire réel (hors démonstration).
 *
 *   DATABASE_URL=postgres://… npx tsx scripts/create-owner.ts "Nom" email@exemple.com
 *
 * Le mot de passe est demandé de façon interactive (10 caractères minimum).
 */
import { createInterface } from "node:readline/promises";
import { openDb } from "../src/server/db/client";
import { ensureBaseSettings } from "../src/server/domain/settings";
import { createUser } from "../src/server/domain/auth";

async function main() {
  const [name, email] = process.argv.slice(2);
  if (!name || !email) {
    console.error('Usage : npx tsx scripts/create-owner.ts "Nom" email@exemple.com');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question("Mot de passe (10 caractères minimum) : ");
  rl.close();
  const db = await openDb({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DIR ?? ".data/pglite" });
  await ensureBaseSettings(db);
  await createUser(db, { name, email, role: "owner", password, temporary: false });
  console.log(`Compte propriétaire créé pour ${email}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
