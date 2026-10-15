import type { Db } from "../db/client";
import { fail, newId } from "./errors";

/**
 * Médiathèque. Les fichiers sont stockés en base (table media) et servis par
 * /media/[id]. Limites : 3 Mo par fichier ; photos JPEG, PNG, WebP ; vidéos
 * courtes MP4 ou WebM. Le type est vérifié sur le contenu, pas sur le nom.
 */
export const MEDIA_MAX_BYTES = 3 * 1024 * 1024;

export function sniffMime(bytes: Uint8Array) {
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") return "video/mp4";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return null;
}

export async function storeMedia(
  db: Db,
  input: { bytes: Uint8Array; name: string; userId: string | null; isDemo: boolean; imagesOnly?: boolean },
) {
  if (!input.bytes.length) fail("validation", "Fichier vide.");
  if (input.bytes.length > MEDIA_MAX_BYTES) fail("validation", "Fichier trop lourd (3 Mo maximum).");
  const mime = sniffMime(input.bytes);
  if (!mime || (input.imagesOnly && !mime.startsWith("image/"))) {
    fail(
      "validation",
      input.imagesOnly
        ? "Format non pris en charge : utilisez JPEG, PNG ou WebP."
        : "Format non pris en charge : JPEG, PNG, WebP, MP4 ou WebM.",
    );
  }
  const id = newId();
  await db.query(
    "insert into media (id, mime, data, name, size, uploaded_by, is_demo) values ($1, $2, $3, $4, $5, $6, $7)",
    [id, mime, input.bytes, input.name.slice(0, 160), input.bytes.length, input.userId, input.isDemo],
  );
  return { id, url: `/media/${id}`, mime: mime! };
}

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
}

export async function listMedia(db: Db, opts: { view: "all" | "unused" | "trash" }) {
  const rows = await db.query<MediaRow>(
    `select m.id, m.mime, m.name, m.size, m.alt, m.created_at, m.deleted_at, u.name as uploader,
            (select count(distinct i.product_id)::int from product_images i where i.url = '/media/' || m.id) as used_by,
            coalesce((select array_agg(distinct p.name) from product_images i join products p on p.id = i.product_id
                       where i.url = '/media/' || m.id), '{}') as products
       from media m left join users u on u.id = m.uploaded_by
      where ${opts.view === "trash" ? "m.deleted_at is not null" : "m.deleted_at is null"}
      order by m.created_at desc limit 500`,
  );
  return opts.view === "unused" ? rows.filter((r) => r.used_by === 0) : rows;
}

async function usage(db: Db, id: string) {
  const r = await db.one<{ n: number }>("select count(*)::int as n from product_images where url = $1", [
    `/media/${id}`,
  ]);
  return r?.n ?? 0;
}

export async function trashMedia(db: Db, id: string) {
  if (await usage(db, id))
    fail("conflict", "Ce fichier est utilisé par une fiche produit : retirez-le d'abord de la fiche.");
  const r = await db.one("update media set deleted_at = now() where id = $1 and deleted_at is null returning id", [id]);
  if (!r) fail("not_found", "Fichier introuvable.");
}

export async function restoreMedia(db: Db, id: string) {
  const r = await db.one("update media set deleted_at = null where id = $1 and deleted_at is not null returning id", [
    id,
  ]);
  if (!r) fail("not_found", "Ce fichier n'est pas à la corbeille.");
}

export async function purgeMedia(db: Db, id: string) {
  const r = await db.one<{ deleted_at: Date | null }>("select deleted_at from media where id = $1", [id]);
  if (!r) return fail("not_found", "Fichier introuvable.");
  if (!r.deleted_at) fail("conflict", "Mettez d'abord le fichier à la corbeille.");
  if (await usage(db, id)) fail("conflict", "Ce fichier est utilisé par une fiche produit.");
  await db.query("delete from media where id = $1", [id]);
}

export async function setMediaAlt(db: Db, id: string, alt: string) {
  await db.query("update media set alt = $2 where id = $1", [id, alt.trim().slice(0, 200)]);
}
