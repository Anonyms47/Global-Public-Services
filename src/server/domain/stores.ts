import type { Db } from "../db/client";
import { fail, newId } from "./errors";

/**
 * Points de vente GPS. Informations publiques (adresse, itinéraire, horaires)
 * et rattachement des retraits et ventes. Le stock n'est jamais séparé :
 * toutes les boutiques vendent le même stock commun.
 */
import { closedToday, defaultHours, hoursText, DAYS, type DayKey, type Store, type StoreHours } from "@/lib/stores";
export { closedToday, defaultHours, hoursText, DAYS, type DayKey, type Store, type StoreHours };

export async function listStores(db: Db, opts: { publishedOnly?: boolean } = {}) {
  return db.query<Store>(
    `select * from stores ${opts.publishedOnly ? "where published" : ""} order by is_main desc, position, name`,
  );
}

export async function pickupStores(db: Db) {
  return (await listStores(db, { publishedOnly: true })).filter((s) => s.pickup_enabled);
}

export type StoreInput = Omit<Store, "id" | "position"> & { id?: string; position?: number };

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveStore(db: Db, input: StoreInput) {
  if (!input.name.trim()) fail("validation", "Le nom est obligatoire.", { name: "Obligatoire." });
  if (input.maps_url && !/^https:\/\//.test(input.maps_url))
    fail("validation", "Lien Maps invalide.", { maps_url: "Adresse https:// attendue." });
  for (const t of [input.hours.open, input.hours.close])
    if (!HM.test(t)) fail("validation", "Horaire invalide (HH:MM).", { hours: "Format HH:MM." });
  const values = [
    input.name.trim(),
    input.address.trim(),
    input.district.trim(),
    input.city.trim(),
    input.landmark.trim(),
    input.maps_url.trim(),
    JSON.stringify(input.hours),
    JSON.stringify(input.closures.filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c.date))),
    input.photo_url || null,
    input.phone.trim(),
    input.services.trim(),
    input.pickup_enabled,
    input.counter_enabled,
    input.is_main,
    input.published,
  ];
  return db.tx(async (tx) => {
    // Une seule boutique principale.
    if (input.is_main) await tx.query("update stores set is_main = false where id <> $1", [input.id ?? ""]);
    if (input.id) {
      const r = await tx.one(
        `update stores set name=$2, address=$3, district=$4, city=$5, landmark=$6, maps_url=$7, hours=$8, closures=$9,
                photo_url=$10, phone=$11, services=$12, pickup_enabled=$13, counter_enabled=$14, is_main=$15, published=$16
          where id = $1 returning id`,
        [input.id, ...values],
      );
      if (!r) fail("not_found", "Point de vente introuvable.");
      return input.id;
    }
    const id = newId();
    const pos = await tx.one<{ n: number }>("select coalesce(max(position), 0)::int + 1 as n from stores");
    await tx.query(
      `insert into stores (id, name, address, district, city, landmark, maps_url, hours, closures, photo_url, phone,
                           services, pickup_enabled, counter_enabled, is_main, published, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, ...values, pos!.n],
    );
    return id;
  });
}

export async function moveStore(db: Db, id: string, direction: -1 | 1) {
  await db.tx(async (tx) => {
    const list = await tx.query<{ id: string }>("select id from stores order by position, name");
    const i = list.findIndex((s) => s.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (const [pos, s] of list.entries()) await tx.query("update stores set position = $2 where id = $1", [s.id, pos]);
  });
}

/** Point de vente valide pour un retrait (publié, retrait activé). */
export async function assertPickupStore(db: Db, id: string | null | undefined) {
  if (!id) return null;
  const s = await db.one<{ id: string }>("select id from stores where id = $1 and published and pickup_enabled", [id]);
  if (!s) fail("validation", "Point de retrait invalide.", { store: "Choisissez un point de vente." });
  return s!.id;
}

export async function setDefaultStore(db: Db, userId: string, storeId: string | null) {
  await db.query("update users set default_store_id = $2 where id = $1", [userId, storeId]);
}

/** Libellé court pour les messages et reçus : nom, quartier, localité. */
export function storeLabel(s: Pick<Store, "name" | "district" | "city">) {
  return [s.name, s.district, s.city].filter(Boolean).join(", ");
}
