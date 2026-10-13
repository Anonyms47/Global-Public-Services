import type { Db } from "../db/client";
import { phoneKey } from "@/lib/format";

/** Recherche globale du Comptoir : produits, commandes, clients. */
export async function globalSearch(db: Db, q: string) {
  const term = q.trim();
  if (term.length < 2) return { products: [], orders: [], customers: [] };
  const like = `%${term}%`;
  const digits = phoneKey(term);
  const [products, orders, customers] = await Promise.all([
    db.query<{
      id: string;
      name: string;
      brand: string;
      status: string;
      sku: string | null;
    }>(
      `select p.id, p.name, p.brand, p.status,
              (select v.sku from variants v where v.product_id = p.id and v.sku ilike $1 limit 1) as sku
         from products p
        where p.name ilike $1 or p.brand ilike $1 or exists (select 1 from variants v where v.product_id = p.id and v.sku ilike $1)
        order by p.status = 'archived', p.name limit 6`,
      [like],
    ),
    db.query<{
      id: string;
      reference: string;
      customer_name: string;
      status: string;
    }>(
      `select id, reference, customer_name, status from orders
        where reference ilike $1 or customer_name ilike $1 or ($2 <> '' and regexp_replace(customer_phone, '[^0-9]', '', 'g') like '%' || $2 || '%')
        order by created_at desc limit 6`,
      [like, digits.length >= 3 ? digits : ""],
    ),
    db.query<{ id: string; name: string; phone: string }>(
      `select id, name, phone from customers where name ilike $1 or ($2 <> '' and phone_key like '%' || $2 || '%') order by name limit 6`,
      [like, digits.length >= 3 ? digits : ""],
    ),
  ]);
  return { products, orders, customers };
}
