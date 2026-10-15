import type { Db } from "../db/client";
import { bestPromo, discounted, type Promotion } from "./catalog";
import { optionsLabel } from "@/lib/format";

export interface CartItemInput {
  variantId: string;
  quantity: number;
  /** Prix affiché au client lors de l'ajout. */
  seenPrice: number;
}

export type CartIssue =
  | { kind: "price"; from: number; to: number }
  | { kind: "reduced"; requested: number; available: number }
  | { kind: "unavailable" };

export interface CheckedItem {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  optionsLabel: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
  available: number;
  isDemo: boolean;
  issues: CartIssue[];
}

/**
 * Revérifie prix et disponibilités côté serveur avant la préparation du message.
 * Aucune réservation : le panier n'engage pas le stock.
 */
export async function checkCart(db: Db, items: CartItemInput[], now = new Date()): Promise<CheckedItem[]> {
  const clean = items
    .filter((i) => typeof i.variantId === "string" && Number.isInteger(i.quantity) && i.quantity > 0)
    .slice(0, 50);
  if (!clean.length) return [];
  const rows = await db.query<{
    id: string;
    product_id: string;
    slug: string;
    name: string;
    sku: string;
    options: Record<string, string>;
    axes: string[];
    price: number;
    on_hand: number;
    reserved: number;
    unsellable: number;
    active: boolean;
    status: string;
    is_demo: boolean;
    image: string | null;
  }>(
    `select v.id, v.product_id, p.slug, p.name, v.sku, v.options, p.axes, v.price, v.on_hand, v.reserved, v.unsellable, v.active, p.status, p.is_demo,
            (select url from product_images i where i.product_id = p.id order by position limit 1) as image
       from variants v join products p on p.id = v.product_id where v.id = any($1)`,
    [clean.map((i) => i.variantId)],
  );
  const promos = await db.query<Promotion>("select * from promotions where product_id = any($1) and active", [
    rows.map((r) => r.product_id),
  ]);
  return clean.map((item) => {
    const r = rows.find((x) => x.id === item.variantId);
    if (!r || !r.active || r.status !== "published") {
      return {
        variantId: item.variantId,
        productId: r?.product_id ?? "",
        slug: r?.slug ?? "",
        name: r?.name ?? "Article retiré du catalogue",
        sku: r?.sku ?? "",
        optionsLabel: r ? optionsLabel(r.options, r.axes) : "",
        image: r?.image ?? null,
        unitPrice: item.seenPrice,
        quantity: item.quantity,
        available: 0,
        isDemo: !!r?.is_demo,
        issues: [{ kind: "unavailable" }],
      };
    }
    const promo = bestPromo(
      promos.filter((p) => p.product_id === r.product_id),
      r.price,
      now,
    );
    const unitPrice = promo ? discounted(r.price, promo) : r.price;
    const available = Math.max(0, r.on_hand - r.reserved - r.unsellable);
    const issues: CartIssue[] = [];
    if (unitPrice !== item.seenPrice) issues.push({ kind: "price", from: item.seenPrice, to: unitPrice });
    if (available === 0) issues.push({ kind: "unavailable" });
    else if (item.quantity > available) issues.push({ kind: "reduced", requested: item.quantity, available });
    return {
      variantId: r.id,
      productId: r.product_id,
      slug: r.slug,
      name: r.name,
      sku: r.sku,
      optionsLabel: optionsLabel(r.options, r.axes),
      image: r.image,
      unitPrice,
      quantity: available === 0 ? item.quantity : Math.min(item.quantity, available),
      available,
      isDemo: r.is_demo,
      issues,
    };
  });
}
