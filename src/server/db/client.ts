import { createHash } from "node:crypto";
import { schemaSql } from "./schema";
import { SUPABASE_ROOT_CA } from "./supabase-ca";

/**
 * Accès base de données minimal, commun à PGlite (démonstration locale)
 * et à PostgreSQL (production, via DATABASE_URL).
 *
 * Toutes les données d'exemple portent `is_demo = true` : elles peuvent être
 * purgées sans toucher à la configuration validée (table `settings`).
 */
export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Exécute `fn` dans une transaction. Imbriqué, réutilise la transaction en cours. */
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

type RawQuery = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

function wrap(raw: RawQuery, tx: Db["tx"]): Db {
  const db: Db = {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await raw(sql, params)).rows as T[];
    },
    async one<T>(sql: string, params: unknown[] = []) {
      return ((await raw(sql, params)).rows[0] as T) ?? null;
    },
    tx,
  };
  return db;
}

async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) (await import("node:fs")).mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  await pg.exec(schemaSql);
  const raw: RawQuery = (sql, params) => pg.query(sql, params);
  const root: Db = wrap(raw, (fn) =>
    pg.transaction(async (t) => {
      const inner: Db = wrap(
        (sql, params) => t.query(sql, params),
        (f) => f(inner),
      );
      return fn(inner);
    }),
  );
  return root;
}

/**
 * Connexion chiffrée : pour Supabase, certificat vérifié avec l'autorité racine
 * de Supabase. DATABASE_SSL=no-verify chiffre sans vérifier (dernier recours),
 * DATABASE_SSL=off désactive le chiffrement (base locale). Un sslmode présent
 * dans l'URL reste prioritaire.
 */
function sslOptions(url: string) {
  const mode = process.env.DATABASE_SSL;
  if (/[?&]sslmode=/.test(url) || mode === "off") return undefined;
  if (mode === "no-verify") return { rejectUnauthorized: false };
  const host = new URL(url).hostname;
  if (/\.supabase\.(co|com)$/.test(host)) return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true };
  return undefined;
}

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5, ssl: sslOptions(url) });
  // Les « alter table » du schéma verrouillent chaque table en exclusif, même
  // sans rien changer : rejoués à chaque démarrage d'instance, ils bloquaient
  // les lectures en cours (interblocages). On ne les rejoue que si le schéma
  // a changé depuis la dernière application, sous verrou car plusieurs
  // instances peuvent démarrer en même temps.
  const version = createHash("sha256").update(schemaSql).digest("hex");
  const applied = (q: { query: typeof pool.query }) =>
    q
      .query<{ value: string }>("select value from schema_meta where key = 'version'")
      .then((r) => r.rows[0]?.value === version)
      .catch(() => false);
  if (!(await applied(pool))) {
    const init = await pool.connect();
    try {
      await init.query("begin");
      await init.query("select pg_advisory_xact_lock(4747000)");
      // Créée d'abord : une requête en échec annulerait toute la transaction.
      await init.query("create table if not exists schema_meta (key text primary key, value text not null)");
      if (!(await applied(init))) {
        await init.query(schemaSql);
        await init.query(
          `insert into schema_meta (key, value) values ('version', $1)
           on conflict (key) do update set value = excluded.value`,
          [version],
        );
      }
      await init.query("commit");
    } catch (error) {
      await init.query("rollback");
      throw error;
    } finally {
      init.release();
    }
  }
  const raw: RawQuery = (sql, params) => pool.query(sql, params as unknown[]);
  return wrap(raw, async (fn) => {
    const client = await pool.connect();
    // Une connexion n'exécute qu'une requête à la fois : on sérialise celles
    // lancées en parallèle (Promise.all) à l'intérieur d'une transaction.
    let queue: Promise<unknown> = Promise.resolve();
    const serial: RawQuery = (sql, params) => {
      const run = queue.then(() => client.query(sql, params as unknown[]));
      queue = run.catch(() => undefined);
      return run;
    };
    try {
      await client.query("begin");
      const inner: Db = wrap(serial, (f) => f(inner));
      const result = await fn(inner);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function openDb(options: { url?: string; dataDir?: string; memory?: boolean } = {}) {
  return options.url ? createPostgres(options.url) : createPglite(options.memory ? undefined : options.dataDir);
}
