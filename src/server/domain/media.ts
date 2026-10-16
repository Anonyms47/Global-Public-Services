import { createHash } from "node:crypto";
import type { Db } from "../db/client";
import { fail, newId } from "./errors";
import { mediaStorage, sliceRead, type Backend, type ObjectStore, type StorageConfig } from "../storage";

/**
 * Médiathèque. Les fichiers sont dans le stockage objet (Supabase Storage en
 * production, disque en démonstration locale) ; la table media ne garde que les
 * métadonnées : type, taille, nom, chemin, état de traitement, empreinte.
 * Les anciens fichiers enregistrés en base restent lisibles tant qu'ils ne sont
 * pas migrés (voir scripts/media-storage.ts et docs/medias.md).
 *
 * Envoi en trois temps : préparation (ligne « pending »), envoi du fichier par
 * le navigateur avec progression, validation (type vérifié sur le contenu réel,
 * taille contrôlée). Un envoi abandonné est nettoyé au bout de 24 h.
 *
 * Diffusion (/media/[id]) : public si le fichier sert une fiche publiée ou la
 * vitrine ; sinon réservé à l'équipe connectée.
 */

/** Limites : en base, une requête de l'hébergeur plafonne à ~4,5 Mo ; en stockage objet, plus large. */
export function mediaLimits(backend: Backend | null) {
  return backend === "database" || backend === null
    ? { photo: 3 * 1024 * 1024, video: 4 * 1024 * 1024 }
    : { photo: 4 * 1024 * 1024, video: 50 * 1024 * 1024 };
}
/** Taille maximale d'une vidéo (Mo) avec le stockage en place, pour les textes d'aide. */
export const videoMaxMb = () => Math.round(mediaLimits(mediaStorage().backend).video / 1024 / 1024);

/** Limites du mode historique (en base), conservées pour compatibilité. */
export const MEDIA_MAX_BYTES = mediaLimits("database").photo;
export const VIDEO_MAX_BYTES = mediaLimits("database").video;

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} Mo`;
const extOf: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export function sniffMime(bytes: Uint8Array) {
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // Vidéos de téléphone : MP4, ou MOV (iPhone) reconnu à sa marque « qt ».
  if (ascii(4, 8) === "ftyp") return ascii(8, 12) === "qt  " ? "video/quicktime" : "video/mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return null;
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function storagePath(id: string, mime: string, isDemo: boolean, at = new Date()) {
  const month = `${at.getUTCFullYear()}/${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${isDemo ? "demo" : "catalogue"}/${month}/${id}.${extOf[mime] ?? "bin"}`;
}

function assertConfigured(cfg: StorageConfig): asserts cfg is StorageConfig & { backend: Backend } {
  if (!cfg.backend) fail("conflict", cfg.problem ?? "Stockage des médias non configuré.");
}

/** Contrôle du contenu réel : type autorisé, limite de taille selon le type et le stockage. */
function checkContent(mime: string | null, size: number, backend: Backend, imagesOnly?: boolean) {
  if (!size) fail("validation", "Fichier vide.");
  if (!mime || (imagesOnly && !mime.startsWith("image/"))) {
    fail(
      "validation",
      imagesOnly
        ? "Format non pris en charge : utilisez JPEG, PNG ou WebP."
        : "Format non pris en charge : JPEG, PNG, WebP, MP4, MOV ou WebM.",
    );
  }
  const limits = mediaLimits(backend);
  const video = mime!.startsWith("video/");
  const max = video ? limits.video : limits.photo;
  if (size > max) fail("validation", `Fichier trop lourd (${video ? "vidéo" : "photo"} : ${mb(max)} maximum).`);
  return mime!;
}

/**
 * Enregistrement direct côté serveur (migration, tests, outils) : contrôle du
 * contenu, écriture dans le stockage, puis la ligne de métadonnées.
 */
export async function storeMedia(
  db: Db,
  input: { bytes: Uint8Array; name: string; userId: string | null; isDemo: boolean; imagesOnly?: boolean },
  cfg: StorageConfig = mediaStorage(),
) {
  assertConfigured(cfg);
  if (!input.bytes.length) fail("validation", "Fichier vide.");
  const mime = checkContent(sniffMime(input.bytes), input.bytes.length, cfg.backend, input.imagesOnly);
  const id = newId();
  const path = cfg.store ? storagePath(id, mime, input.isDemo) : null;
  if (cfg.store) await cfg.store.put(path!, input.bytes, mime);
  await db.query(
    `insert into media (id, mime, data, name, size, uploaded_by, is_demo, storage_backend, storage_path, status, checksum)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', $10)`,
    [
      id,
      mime,
      cfg.store ? null : input.bytes,
      input.name.slice(0, 160),
      input.bytes.length,
      input.userId,
      input.isDemo,
      cfg.backend,
      path,
      sha256(input.bytes),
    ],
  );
  return { id, url: `/media/${id}`, mime };
}

// ——— Envoi depuis le navigateur ———

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

/** 1. Préparation : ligne « pending » et adresse d'envoi (directe vers le stockage si possible). */
export async function startUpload(
  db: Db,
  input: { name: string; size: number; type: string; userId: string; isDemo: boolean; imagesOnly?: boolean },
  cfg: StorageConfig = mediaStorage(),
): Promise<{ id: string; target: UploadTarget }> {
  assertConfigured(cfg);
  // Type annoncé par le navigateur : premier tri, le contenu réel est vérifié à la validation.
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  const declared = extOf[input.type]
    ? input.type
    : (byExt[(/\.([a-z0-9]+)$/i.exec(input.name)?.[1] ?? "").toLowerCase()] ?? null);
  checkContent(declared, Number(input.size) || 0, cfg.backend, input.imagesOnly);
  const id = newId();
  const path = cfg.store ? storagePath(id, declared!, input.isDemo) : null;
  await db.query(
    `insert into media (id, mime, data, name, size, uploaded_by, is_demo, storage_backend, storage_path, status)
     values ($1, $2, null, $3, $4, $5, $6, $7, $8, 'pending')`,
    [id, declared, input.name.slice(0, 160), input.size, input.userId, input.isDemo, cfg.backend, path],
  );
  if (cfg.store?.uploadTarget) {
    await cfg.store.ensureReady?.();
    const t = await cfg.store.uploadTarget(path!, declared!);
    return { id, target: { url: t.url, method: "PUT", headers: t.headers } };
  }
  return {
    id,
    target: { url: `/comptoir/mediatheque/envoi?id=${id}`, method: "PUT", headers: { "Content-Type": declared! } },
  };
}

async function pendingRow(db: Db, id: string, userId: string) {
  const row = await db.one<{
    id: string;
    storage_backend: Backend;
    storage_path: string | null;
    is_demo: boolean;
    name: string;
  }>(
    "select id, storage_backend, storage_path, is_demo, name from media where id = $1 and status = 'pending' and uploaded_by = $2",
    [id, userId],
  );
  if (!row) fail("not_found", "Envoi introuvable ou expiré : relancez-le.");
  return row!;
}

/** 2 bis. Réception du fichier par le serveur (disque local ou mode en base). */
export async function receiveUpload(
  db: Db,
  id: string,
  userId: string,
  bytes: Uint8Array,
  cfg: StorageConfig = mediaStorage(),
) {
  const row = await pendingRow(db, id, userId);
  const mime = sniffMime(bytes);
  checkContent(mime, bytes.length, row.storage_backend);
  if (row.storage_backend === "database") {
    await db.query("update media set data = $2 where id = $1", [id, bytes]);
  } else if (row.storage_backend === "local" && cfg.store?.backend === "local") {
    await cfg.store.put(row.storage_path!, bytes, mime!);
  } else {
    fail("conflict", "Ce fichier doit être envoyé directement au stockage.");
  }
}

/** 3. Validation : contenu réel contrôlé dans le stockage, puis fichier prêt. */
export async function finishUpload(
  db: Db,
  id: string,
  userId: string,
  opts: { imagesOnly?: boolean } = {},
  cfg: StorageConfig = mediaStorage(),
) {
  const row = await pendingRow(db, id, userId);
  let size = 0;
  let start: Uint8Array | null = null;
  let checksum: string | null = null;
  if (row.storage_backend === "database") {
    const r = await db.one<{ data: Uint8Array | null }>("select data from media where id = $1", [id]);
    if (r?.data) {
      size = r.data.length;
      start = r.data.slice(0, 64);
      checksum = sha256(r.data);
    }
  } else {
    if (!cfg.store || cfg.store.backend !== row.storage_backend) fail("conflict", "Stockage des médias indisponible.");
    const h = await cfg.store!.head(row.storage_path!);
    if (h) ({ size, start } = h);
  }
  if (!start) fail("validation", "Le fichier n'est pas arrivé : relancez l'envoi.");
  const mime = sniffMime(start!);
  try {
    checkContent(mime, size, row.storage_backend, opts.imagesOnly);
  } catch (e) {
    await abortUpload(db, id, userId, cfg);
    throw e;
  }
  await db.query("update media set status = 'ready', mime = $2, size = $3, checksum = $4 where id = $1", [
    id,
    mime,
    size,
    checksum,
  ]);
  return { id, url: `/media/${id}`, mime: mime! };
}

/** Abandon (erreur ou annulation) : fichier partiel supprimé, ligne retirée. */
export async function abortUpload(db: Db, id: string, userId: string, cfg: StorageConfig = mediaStorage()) {
  const row = await db.one<{ storage_path: string | null; storage_backend: Backend }>(
    "delete from media where id = $1 and status = 'pending' and uploaded_by = $2 returning storage_path, storage_backend",
    [id, userId],
  );
  if (row?.storage_path && cfg.store?.backend === row.storage_backend) {
    await cfg.store.remove([row.storage_path]).catch(() => undefined);
  }
}

/** Envois jamais terminés depuis plus de 24 h : nettoyés (fichier partiel compris). */
export async function cleanupStaleUploads(db: Db, cfg: StorageConfig = mediaStorage()) {
  const rows = await db.query<{ storage_path: string | null; storage_backend: Backend }>(
    "delete from media where status = 'pending' and created_at < now() - interval '24 hours' returning storage_path, storage_backend",
  );
  const paths = rows.filter((r) => r.storage_path && r.storage_backend === cfg.store?.backend);
  if (paths.length) await cfg.store!.remove(paths.map((r) => r.storage_path!)).catch(() => undefined);
  return rows.length;
}

// ——— Diffusion ———

export interface MediaFile {
  id: string;
  mime: string;
  size: number;
  storage_backend: Backend;
  storage_path: string | null;
  deleted_at: Date | null;
  public: boolean;
}

/**
 * Fichier prêt et sa visibilité : public s'il sert une fiche publiée (hors
 * corbeille) ou la vitrine (réglages) ; sinon privé (équipe seulement).
 */
export async function mediaFile(db: Db, id: string): Promise<MediaFile | null> {
  return db.one<MediaFile>(
    `select m.id, m.mime, m.size, m.storage_backend, m.storage_path, m.deleted_at,
            (m.deleted_at is null and (
              exists (select 1 from product_images i join products p on p.id = i.product_id
                       where i.url = '/media/' || m.id and p.status = 'published' and p.deleted_at is null)
              or exists (select 1 from settings s where strpos(s.value::text, '/media/' || m.id) > 0)
              or exists (select 1 from categories c where c.image_url = '/media/' || m.id and c.visible and c.archived_at is null)
            )) as public
       from media m where m.id = $1 and m.status = 'ready'`,
    [id],
  );
}

/** Lecture (partielle si Range) depuis la base ou le stockage. */
export async function readMediaBytes(db: Db, file: MediaFile, range: string | null, cfg = mediaStorage()) {
  // Fichier encore en base (non migré, ou mode de retour arrière) : il reste lisible.
  if (file.storage_backend === "database" || !file.storage_path) {
    const r = await db.one<{ data: Uint8Array | null }>("select data from media where id = $1", [file.id]);
    return r?.data ? sliceRead(new Uint8Array(r.data), range) : null;
  }
  if (cfg.store?.backend === file.storage_backend) {
    const read = await cfg.store.read(file.storage_path, range);
    if (read) return read;
  }
  // Stockage indisponible : copie en base conservée pendant la migration.
  const r = await db.one<{ data: Uint8Array | null }>("select data from media where id = $1", [file.id]);
  return r?.data ? sliceRead(new Uint8Array(r.data), range) : null;
}

// ——— Médiathèque ———

export interface MediaRow {
  id: string;
  mime: string;
  name: string;
  size: number;
  alt: string;
  created_at: Date;
  deleted_at: Date | null;
  uploader: string | null;
  used_by: number;
  products: string[];
  storage_backend: Backend;
}

export async function listMedia(db: Db, opts: { view: "all" | "unused" | "trash" }) {
  const rows = await db.query<MediaRow>(
    `select m.id, m.mime, m.name, m.size, m.alt, m.created_at, m.deleted_at, m.storage_backend, u.name as uploader,
            (select count(distinct i.product_id)::int from product_images i where i.url = '/media/' || m.id)
              + (select count(*)::int from settings s where strpos(s.value::text, '/media/' || m.id) > 0)
              + (select count(*)::int from categories c where c.image_url = '/media/' || m.id) as used_by,
            coalesce((select array_agg(distinct p.name) from product_images i join products p on p.id = i.product_id
                       where i.url = '/media/' || m.id), '{}') as products
       from media m left join users u on u.id = m.uploaded_by
      where m.status = 'ready' and ${opts.view === "trash" ? "m.deleted_at is not null" : "m.deleted_at is null"}
      order by m.created_at desc limit 500`,
  );
  return opts.view === "unused" ? rows.filter((r) => r.used_by === 0) : rows;
}

/** Utilisations d'un fichier : fiches produits et réglages (photo de la boutique, vitrine). */
async function usage(db: Db, id: string) {
  const url = `/media/${id}`;
  const r = await db.one<{ products: number; settings: number }>(
    `select (select count(*)::int from product_images where url = $1) as products,
            (select count(*)::int from settings where strpos(value::text, $1) > 0)
              + (select count(*)::int from categories where image_url = $1) as settings`,
    [url],
  );
  return { products: r?.products ?? 0, settings: r?.settings ?? 0, total: (r?.products ?? 0) + (r?.settings ?? 0) };
}

const usageMessage = (u: { products: number; settings: number }) =>
  u.products
    ? "Ce fichier est utilisé par une fiche produit : retirez-le d'abord de la fiche."
    : "Ce fichier est utilisé par la vitrine, une catégorie ou la configuration : remplacez-le d'abord.";

export async function trashMedia(db: Db, id: string) {
  const u = await usage(db, id);
  if (u.total) fail("conflict", usageMessage(u));
  const r = await db.one("update media set deleted_at = now() where id = $1 and deleted_at is null returning id", [id]);
  if (!r) fail("not_found", "Fichier introuvable.");
}

export async function restoreMedia(db: Db, id: string) {
  const r = await db.one("update media set deleted_at = null where id = $1 and deleted_at is not null returning id", [
    id,
  ]);
  if (!r) fail("not_found", "Ce fichier n'est pas à la corbeille.");
}

/**
 * Suppression définitive : seulement depuis la corbeille et si le fichier
 * n'est plus utilisé. La ligne est retirée d'abord (le fichier n'est plus
 * servi), puis l'objet stocké.
 */
export async function purgeMedia(db: Db, id: string, cfg: StorageConfig = mediaStorage()) {
  const r = await db.one<{ deleted_at: Date | null }>("select deleted_at from media where id = $1", [id]);
  if (!r) return fail("not_found", "Fichier introuvable.");
  if (!r.deleted_at) fail("conflict", "Mettez d'abord le fichier à la corbeille.");
  const u = await usage(db, id);
  if (u.total) fail("conflict", usageMessage(u));
  const row = await db.one<{ storage_path: string | null; storage_backend: Backend }>(
    "delete from media where id = $1 returning storage_path, storage_backend",
    [id],
  );
  if (row?.storage_path && cfg.store?.backend === row.storage_backend) await cfg.store.remove([row.storage_path]);
}

export async function setMediaAlt(db: Db, id: string, alt: string) {
  await db.query("update media set alt = $2 where id = $1", [id, alt.trim().slice(0, 200)]);
}

// ——— Migration vers le stockage objet (non destructive) et retour arrière ———

export interface MigrationReport {
  scanned: number;
  migrated: number;
  skipped: number;
  failed: { id: string; error: string }[];
}

/**
 * Copie les fichiers encore en base vers le stockage objet. Chaque copie est
 * relue et comparée (empreinte SHA-256) avant de basculer la ligne. Les octets
 * en base sont CONSERVÉS (retour arrière possible) : seul releaseDatabaseCopies
 * les libère, sur demande explicite. Reprend là où elle s'est arrêtée.
 */
export async function migrateMediaToStore(db: Db, store: ObjectStore, opts: { dryRun?: boolean; limit?: number } = {}) {
  const rows = await db.query<{ id: string; mime: string; is_demo: boolean; created_at: Date }>(
    `select id, mime, is_demo, created_at from media
      where storage_backend = 'database' and data is not null and status = 'ready'
      order by created_at limit $1`,
    [opts.limit ?? 10000],
  );
  const report: MigrationReport = { scanned: rows.length, migrated: 0, skipped: 0, failed: [] };
  if (opts.dryRun) return { ...report, skipped: rows.length };
  await store.ensureReady?.();
  for (const r of rows) {
    try {
      const d = await db.one<{ data: Uint8Array }>("select data from media where id = $1", [r.id]);
      const bytes = new Uint8Array(d!.data);
      const sum = sha256(bytes);
      const path = storagePath(r.id, r.mime, r.is_demo, new Date(r.created_at));
      await store.put(path, bytes, r.mime);
      const back = await store.read(path);
      const copy =
        back?.body instanceof Uint8Array ? back.body : new Uint8Array(await new Response(back?.body).arrayBuffer());
      if (sha256(copy) !== sum) throw new Error("copie différente de l'original");
      await db.query(
        `update media set storage_backend = $2, storage_path = $3, checksum = $4, size = $5, migrated_at = now()
          where id = $1 and storage_backend = 'database'`,
        [r.id, store.backend, path, sum, bytes.length],
      );
      report.migrated++;
    } catch (e) {
      report.failed.push({ id: r.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}

/** Vérifie chaque fichier du stockage objet : présent, même taille, même empreinte. */
export async function verifyMediaStore(db: Db, store: ObjectStore) {
  const rows = await db.query<{ id: string; storage_path: string; size: number; checksum: string | null }>(
    "select id, storage_path, size, checksum from media where storage_backend = $1 and status = 'ready'",
    [store.backend],
  );
  const problems: { id: string; problem: string }[] = [];
  for (const r of rows) {
    const read = await store.read(r.storage_path);
    if (!read?.body) {
      problems.push({ id: r.id, problem: "absent du stockage" });
      continue;
    }
    const bytes =
      read.body instanceof Uint8Array ? read.body : new Uint8Array(await new Response(read.body).arrayBuffer());
    if (bytes.length !== r.size) problems.push({ id: r.id, problem: `taille ${bytes.length} au lieu de ${r.size}` });
    else if (r.checksum && sha256(bytes) !== r.checksum) problems.push({ id: r.id, problem: "empreinte différente" });
  }
  return { checked: rows.length, problems };
}

/**
 * Retour arrière : ramène en base chaque fichier du stockage objet (si la copie
 * en base a été libérée, elle est retéléchargée) et le sert de nouveau depuis
 * la base. Les objets stockés ne sont pas supprimés.
 */
export async function rollbackMediaFromStore(db: Db, store: ObjectStore) {
  const rows = await db.query<{ id: string; storage_path: string; has_data: boolean; checksum: string | null }>(
    `select id, storage_path, data is not null as has_data, checksum from media
      where storage_backend = $1 and status = 'ready'`,
    [store.backend],
  );
  const failed: { id: string; error: string }[] = [];
  let restored = 0;
  for (const r of rows) {
    try {
      if (!r.has_data) {
        const read = await store.read(r.storage_path);
        if (!read?.body) throw new Error("absent du stockage");
        const bytes =
          read.body instanceof Uint8Array ? read.body : new Uint8Array(await new Response(read.body).arrayBuffer());
        if (r.checksum && sha256(bytes) !== r.checksum) throw new Error("empreinte différente");
        await db.query("update media set data = $2 where id = $1", [r.id, bytes]);
      }
      await db.query("update media set storage_backend = 'database' where id = $1", [r.id]);
      restored++;
    } catch (e) {
      failed.push({ id: r.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { restored, failed };
}

/**
 * Libère les copies en base des fichiers migrés ET vérifiés. Irréversible
 * côté base (les fichiers restent dans le stockage) : à lancer seulement après
 * vérification, avec une sauvegarde de la base.
 */
export async function releaseDatabaseCopies(db: Db, store: ObjectStore, opts: { confirm: boolean }) {
  if (!opts.confirm) fail("validation", "Confirmation explicite requise.");
  const { problems } = await verifyMediaStore(db, store);
  if (problems.length) fail("conflict", `${problems.length} fichier(s) non vérifié(s) : libération annulée.`);
  const r = await db.query<{ id: string }>(
    "update media set data = null where storage_backend = $1 and data is not null and checksum is not null returning id",
    [store.backend],
  );
  return r.length;
}

/** État du stockage des médias (santé, migration). */
export async function mediaStorageStatus(db: Db) {
  const rows = await db.query<{ backend: Backend; status: string; n: number; bytes: number; in_db: number }>(
    `select storage_backend as backend, status, count(*)::int as n, coalesce(sum(size), 0)::bigint as bytes,
            count(*) filter (where data is not null)::int as in_db
       from media group by storage_backend, status order by storage_backend, status`,
  );
  return rows.map((r) => ({ ...r, bytes: Number(r.bytes) }));
}
