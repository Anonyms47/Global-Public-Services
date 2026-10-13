import type { Db } from "../db/client";
import { fail, newId } from "./errors";
import { phoneKey } from "@/lib/format";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_demo: boolean;
  created_at: Date;
}

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export async function searchCustomers(db: Db, q: string, limit = 50) {
  const term = q.trim();
  const key = phoneKey(term);
  return db.query<Customer & { order_count: number; last_order_at: Date | null }>(
    `select c.*, (select count(*)::int from orders o where o.customer_id = c.id) as order_count,
            (select max(created_at) from orders o where o.customer_id = c.id) as last_order_at
       from customers c
      where $1 = '' or c.name ilike '%' || $1 || '%' or ($2 <> '' and c.phone_key like '%' || $2 || '%') or c.email ilike '%' || $1 || '%'
      order by c.updated_at desc limit $3`,
    [term, key.length >= 3 ? key : "", limit],
  );
}

/** Clients dont le numéro correspond (pour signaler un doublon avant création). */
export async function phoneMatches(db: Db, phone: string, excludeId?: string) {
  const key = phoneKey(phone);
  if (key.length < 6) return [];
  // Comparaison des derniers chiffres (8 au plus) pour tolérer la présence ou l'absence d'indicatif.
  return db.query<Customer>(
    `select * from customers
      where length(phone_key) >= 6 and id <> $2
        and right(phone_key, least(8, length(phone_key), length($1))) = right($1, least(8, length(phone_key), length($1)))
      order by created_at`,
    [key, excludeId ?? ""],
  );
}

function validate(input: CustomerInput) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Indiquez le nom du client.";
  if (input.phone && phoneKey(input.phone).length < 6) errors.phone = "Numéro trop court.";
  if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) errors.email = "Adresse e-mail invalide.";
  if (Object.keys(errors).length) fail("validation", "Vérifiez les champs signalés.", errors);
}

export async function createCustomer(
  db: Db,
  input: CustomerInput,
  opts: { allowDuplicate?: boolean; isDemo?: boolean } = {},
) {
  validate(input);
  if (!opts.allowDuplicate) {
    const matches = await phoneMatches(db, input.phone);
    if (matches.length) {
      fail(
        "conflict",
        `Ce numéro correspond déjà à : ${matches.map((m) => m.name).join(", ")}. Utilisez la fiche existante ou confirmez la création d'un nouveau client.`,
        { phone: "Numéro déjà connu." },
      );
    }
  }
  const id = newId();
  await db.query(
    `insert into customers (id, name, phone, phone_key, email, address, notes, is_demo)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      input.name.trim(),
      input.phone.trim(),
      phoneKey(input.phone),
      input.email?.trim() ?? "",
      input.address?.trim() ?? "",
      input.notes ?? "",
      !!opts.isDemo,
    ],
  );
  return id;
}

export async function updateCustomer(db: Db, id: string, input: CustomerInput) {
  validate(input);
  await db.query(
    `update customers set name=$2, phone=$3, phone_key=$4, email=$5, address=$6, notes=$7, updated_at=now() where id=$1`,
    [
      id,
      input.name.trim(),
      input.phone.trim(),
      phoneKey(input.phone),
      input.email?.trim() ?? "",
      input.address?.trim() ?? "",
      input.notes ?? "",
    ],
  );
}

export async function getCustomer(db: Db, id: string) {
  return db.one<Customer>("select * from customers where id = $1", [id]);
}

export async function allCustomersForExport(db: Db) {
  return db.query<Customer & { order_count: number }>(
    `select c.*, (select count(*)::int from orders o where o.customer_id = c.id and o.status <> 'cancelled') as order_count
       from customers c order by c.name`,
  );
}
