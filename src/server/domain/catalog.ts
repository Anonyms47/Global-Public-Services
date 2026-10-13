import type { Db } from "../db/client";
import { fail, newId } from "./errors";
import { slugify } from "@/lib/format";

// ——— Types ———

export type ProductStatus = "draft" | "published" | "archived";

export interface Spec {
  label: string;
  value: string;
}

export interface Promotion {
  id: string;
  name: string;
  product_id: string;
  kind: "percent" | "amount";
  value: number;
  starts_at: Date;
  ends_at: Date;
  active: boolean;
  is_demo: boolean;
}

export interface PublicVariant {
  id: string;
  sku: string;
  options: Record<string, string>;
  basePrice: number;
  price: number;
  available: number;
}

export interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categorySlug: string | null;
  categoryName: string | null;
  description: string;
  specs: Spec[];
  condition: string | null;
  axes: string[];
  featured: boolean;
  featuredPosition: number;
  createdAt: Date;
  isDemo: boolean;
  images: { url: string; alt: string; color: string | null }[];
  variants: PublicVariant[];
  promo: { name: string; endsAt: Date; label: string } | null;
  minPrice: number;
  minBasePrice: number;
  available: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  position: number;
  is_demo: boolean;
}

// ——— Prix ———

export function isPromoRunning(
  p: Pick<Promotion, "active" | "starts_at" | "ends_at">,
  now: Date,
) {
  return p.active && new Date(p.starts_at) <= now && now < new Date(p.ends_at);
}

export function discounted(
  price: number,
  promo: Pick<Promotion, "kind" | "value">,
) {
  const off =
    promo.kind === "percent"
      ? Math.round((price * promo.value) / 100)
      : promo.value;
  return Math.max(0, price - off);
}

export function promoLabel(p: Pick<Promotion, "kind" | "value">) {
  return p.kind === "percent"
    ? `−${p.value} %`
    : `−${new Intl.NumberFormat("fr-FR").format(p.value)} FCFA`;
}

/** Meilleure promotion en cours pour un produit. */
export function bestPromo(promos: Promotion[], basePrice: number, now: Date) {
  let best: Promotion | null = null;
  for (const p of promos) {
    if (!isPromoRunning(p, now)) continue;
    if (!best || discounted(basePrice, p) < discounted(basePrice, best))
      best = p;
  }
  return best;
}

// ——— Lecture publique ———

interface ProductRow {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category_slug: string | null;
  category_name: string | null;
  description: string;
  specs: Spec[];
  condition: string | null;
  axes: string[];
  featured: boolean;
  featured_position: number;
  created_at: Date;
  is_demo: boolean;
}

interface VariantRow {
  id: string;
  product_id: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  on_hand: number;
  reserved: number;
}

async function hydrate(
  db: Db,
  rows: ProductRow[],
  now: Date,
): Promise<PublicProduct[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [variants, images, promos] = await Promise.all([
    db.query<VariantRow>(
      `select id, product_id, sku, options, price, on_hand, reserved from variants
        where product_id = any($1) and active order by position, price`,
      [ids],
    ),
    db.query<{
      product_id: string;
      url: string;
      alt: string;
      color: string | null;
    }>(
      "select product_id, url, alt, color from product_images where product_id = any($1) order by position",
      [ids],
    ),
    db.query<Promotion>(
      "select * from promotions where product_id = any($1) and active",
      [ids],
    ),
  ]);
  return rows
    .map((r) => {
      const vs = variants.filter((v) => v.product_id === r.id);
      const ps = promos.filter((p) => p.product_id === r.id);
      const ref = vs.length ? Math.min(...vs.map((v) => v.price)) : 0;
      const promo = bestPromo(ps, ref, now);
      const pv: PublicVariant[] = vs.map((v) => ({
        id: v.id,
        sku: v.sku,
        options: v.options,
        basePrice: v.price,
        price: promo ? discounted(v.price, promo) : v.price,
        available: Math.max(0, v.on_hand - v.reserved),
      }));
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        brand: r.brand,
        categorySlug: r.category_slug,
        categoryName: r.category_name,
        description: r.description,
        specs: r.specs ?? [],
        condition: r.condition,
        axes: r.axes ?? [],
        featured: r.featured,
        featuredPosition: r.featured_position,
        createdAt: new Date(r.created_at),
        isDemo: r.is_demo,
        images: images
          .filter((i) => i.product_id === r.id)
          .map(({ url, alt, color }) => ({ url, alt, color })),
        variants: pv,
        promo: promo
          ? {
              name: promo.name,
              endsAt: new Date(promo.ends_at),
              label: promoLabel(promo),
            }
          : null,
        minPrice: pv.length ? Math.min(...pv.map((v) => v.price)) : 0,
        minBasePrice: ref,
        available: pv.reduce((s, v) => s + v.available, 0),
      } satisfies PublicProduct;
    })
    .filter((p) => p.variants.length > 0);
}

const productSelect = `
  select p.id, p.slug, p.name, p.brand, c.slug as category_slug, c.name as category_name,
         p.description, p.specs, p.condition, p.axes, p.featured, p.featured_position,
         p.created_at, p.is_demo
    from products p left join categories c on c.id = p.category_id`;

export async function publishedProducts(db: Db, now = new Date()) {
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status = 'published' order by p.created_at desc`,
  );
  return hydrate(db, rows, now);
}

export async function publishedProductBySlug(
  db: Db,
  slug: string,
  now = new Date(),
) {
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status = 'published' and p.slug = $1`,
    [slug],
  );
  return (await hydrate(db, rows, now))[0] ?? null;
}

export async function publishedProductById(
  db: Db,
  id: string,
  now = new Date(),
) {
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status = 'published' and p.id = $1`,
    [id],
  );
  return (await hydrate(db, rows, now))[0] ?? null;
}

export async function listCategories(db: Db) {
  return db.query<Category & { product_count: number }>(
    `select c.*, (select count(*)::int from products p where p.category_id = c.id and p.status = 'published') as product_count
       from categories c order by c.position, c.name`,
  );
}

export async function categoryBySlug(db: Db, slug: string) {
  return db.one<Category>("select * from categories where slug = $1", [slug]);
}

// ——— Recherche et filtres (boutique) ———

export type SortKey = "nouveautes" | "prix-asc" | "prix-desc";

export interface ShopQuery {
  q?: string;
  categorie?: string;
  marque?: string[];
  prixMin?: number;
  prixMax?: number;
  dispo?: boolean;
  promo?: boolean;
  etat?: string;
  tri?: SortKey;
}

export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterProducts(all: PublicProduct[], q: ShopQuery) {
  let list = all;
  if (q.q) {
    const terms = normalize(q.q).split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = normalize(
        [
          p.name,
          p.brand,
          p.categoryName ?? "",
          ...p.variants.map((v) => v.sku),
        ].join(" "),
      );
      return terms.every((t) => hay.includes(t));
    });
  }
  if (q.categorie) list = list.filter((p) => p.categorySlug === q.categorie);
  if (q.marque?.length) list = list.filter((p) => q.marque!.includes(p.brand));
  if (q.etat) list = list.filter((p) => p.condition === q.etat);
  if (q.prixMin != null) list = list.filter((p) => p.minPrice >= q.prixMin!);
  if (q.prixMax != null) list = list.filter((p) => p.minPrice <= q.prixMax!);
  if (q.dispo) list = list.filter((p) => p.available > 0);
  if (q.promo) list = list.filter((p) => p.promo);
  const sorted = [...list];
  if (q.tri === "prix-asc") sorted.sort((a, b) => a.minPrice - b.minPrice);
  else if (q.tri === "prix-desc")
    sorted.sort((a, b) => b.minPrice - a.minPrice);
  else sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return sorted;
}

/** Facettes calculées sur les données disponibles. */
export function facets(all: PublicProduct[]) {
  const brands = [...new Set(all.map((p) => p.brand).filter(Boolean))].sort();
  const conditions = [
    ...new Set(all.map((p) => p.condition).filter(Boolean) as string[]),
  ].sort();
  const prices = all.map((p) => p.minPrice);
  return {
    brands,
    conditions,
    hasPromo: all.some((p) => p.promo),
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
  };
}

export function relatedProducts(
  all: PublicProduct[],
  product: PublicProduct,
  limit = 4,
) {
  const others = all.filter((p) => p.id !== product.id);
  const score = (p: PublicProduct) =>
    (p.categorySlug === product.categorySlug ? 2 : 0) +
    (p.brand && p.brand === product.brand ? 1 : 0) +
    (p.available > 0 ? 0.5 : 0);
  return others
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}

// ——— Administration ———

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category_id: string | null;
  category_name: string | null;
  status: ProductStatus;
  featured: boolean;
  updated_at: Date;
  is_demo: boolean;
  image: string | null;
  variant_count: number;
  min_price: number | null;
  max_price: number | null;
  on_hand: number;
  available: number;
  has_sales: boolean;
}

export async function adminProducts(
  db: Db,
  opts: { q?: string; status?: string; category?: string } = {},
) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status && opts.status !== "all") {
    params.push(opts.status);
    where.push(`p.status = $${params.length}`);
  } else where.push("p.status <> 'archived'");
  if (opts.status === "all") where.pop();
  if (opts.category) {
    params.push(opts.category);
    where.push(`p.category_id = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.trim()}%`);
    where.push(
      `(p.name ilike $${params.length} or p.brand ilike $${params.length} or exists (select 1 from variants v where v.product_id = p.id and v.sku ilike $${params.length}))`,
    );
  }
  return db.query<AdminProductRow>(
    `select p.id, p.slug, p.name, p.brand, p.category_id, c.name as category_name, p.status, p.featured,
            p.updated_at, p.is_demo,
            (select url from product_images i where i.product_id = p.id order by position limit 1) as image,
            (select count(*)::int from variants v where v.product_id = p.id and v.active) as variant_count,
            (select min(price) from variants v where v.product_id = p.id and v.active) as min_price,
            (select max(price) from variants v where v.product_id = p.id and v.active) as max_price,
            (select coalesce(sum(on_hand), 0)::int from variants v where v.product_id = p.id and v.active) as on_hand,
            (select coalesce(sum(on_hand - reserved), 0)::int from variants v where v.product_id = p.id and v.active) as available,
            exists (select 1 from order_lines l where l.product_id = p.id) as has_sales
       from products p left join categories c on c.id = p.category_id
      ${where.length ? `where ${where.join(" and ")}` : ""}
      order by p.updated_at desc`,
    params,
  );
}

export interface VariantInput {
  id?: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  costPrice?: number | null;
  initialStock?: number;
  lowStockThreshold?: number | null;
}

export interface ProductInput {
  id?: string;
  name: string;
  slug?: string;
  brand: string;
  categoryId: string | null;
  description: string;
  specs: Spec[];
  condition: string | null;
  axes: string[];
  images: { url: string; alt: string; color?: string | null }[];
  variants: VariantInput[];
  status: ProductStatus;
  featured: boolean;
  isDemo?: boolean;
}

export interface EditableProduct extends ProductInput {
  id: string;
  slug: string;
  updatedAt: string;
  hasSales: boolean;
  variants: (VariantInput & {
    id: string;
    onHand: number;
    reserved: number;
    hasSales: boolean;
  })[];
}

export async function productForEdit(
  db: Db,
  id: string,
  opts: { withCosts: boolean },
): Promise<EditableProduct | null> {
  const p = await db.one<Record<string, unknown>>(
    "select * from products where id = $1",
    [id],
  );
  if (!p) return null;
  const [images, variants, sales] = await Promise.all([
    db.query<{ url: string; alt: string; color: string | null }>(
      "select url, alt, color from product_images where product_id = $1 order by position",
      [id],
    ),
    db.query<Record<string, unknown>>(
      `select v.*, exists (select 1 from order_lines l where l.variant_id = v.id) as has_sales
         from variants v where product_id = $1 and active order by position`,
      [id],
    ),
    db.one<{ n: number }>(
      "select count(*)::int as n from order_lines where product_id = $1",
      [id],
    ),
  ]);
  return {
    id,
    slug: p.slug as string,
    name: p.name as string,
    brand: p.brand as string,
    categoryId: (p.category_id as string) ?? null,
    description: p.description as string,
    specs: (p.specs as Spec[]) ?? [],
    condition: (p.condition as string) ?? null,
    axes: (p.axes as string[]) ?? [],
    images,
    status: p.status as ProductStatus,
    featured: p.featured as boolean,
    isDemo: p.is_demo as boolean,
    updatedAt: new Date(p.updated_at as Date).toISOString(),
    hasSales: (sales?.n ?? 0) > 0,
    variants: variants.map((v) => ({
      id: v.id as string,
      sku: v.sku as string,
      options: v.options as Record<string, string>,
      price: v.price as number,
      costPrice: opts.withCosts
        ? ((v.cost_price as number) ?? null)
        : undefined,
      lowStockThreshold: (v.low_stock_threshold as number) ?? null,
      onHand: v.on_hand as number,
      reserved: v.reserved as number,
      hasSales: v.has_sales as boolean,
    })),
  };
}

/** Contrôles avant publication. Retourne la liste des manques, vide si publiable. */
export function publicationIssues(input: ProductInput) {
  const issues: string[] = [];
  if (!input.name.trim()) issues.push("Le nom du produit est obligatoire.");
  if (!input.categoryId) issues.push("Choisissez une catégorie.");
  if (input.description.trim().length < 20)
    issues.push("Rédigez une description d'au moins 20 caractères.");
  if (!input.images.length) issues.push("Ajoutez au moins une photo.");
  if (!input.variants.length)
    issues.push("Ajoutez au moins une variante avec un prix.");
  input.variants.forEach((v, i) => {
    const n = `Variante ${i + 1}`;
    if (!v.sku.trim()) issues.push(`${n} : la référence est obligatoire.`);
    if (!(v.price > 0)) issues.push(`${n} : le prix doit être supérieur à 0.`);
    for (const axis of input.axes) {
      if (!v.options[axis]?.trim()) issues.push(`${n} : précisez « ${axis} ».`);
    }
  });
  const skus = input.variants.map((v) => v.sku.trim().toUpperCase());
  if (new Set(skus).size !== skus.length)
    issues.push("Chaque variante doit avoir une référence unique.");
  const combos = input.variants.map((v) =>
    input.axes.map((a) => v.options[a]).join("|"),
  );
  if (input.axes.length && new Set(combos).size !== combos.length) {
    issues.push("Deux variantes ont exactement les mêmes options.");
  }
  return issues;
}

export async function saveProduct(
  db: Db,
  input: ProductInput,
  ctx: {
    userId: string | null;
    withCosts: boolean;
    expectedUpdatedAt?: string;
  },
) {
  if (!input.name.trim())
    fail("validation", "Le nom du produit est obligatoire.", {
      name: "Obligatoire.",
    });
  if (input.status === "published") {
    const issues = publicationIssues(input);
    if (issues.length)
      fail("validation", `Publication impossible : ${issues.join(" ")}`);
  }
  for (const v of input.variants) {
    if (!v.sku.trim())
      fail("validation", "Chaque variante doit avoir une référence.");
    if (!Number.isInteger(v.price) || v.price < 0)
      fail("validation", `Prix invalide pour ${v.sku}.`);
  }
  return db.tx(async (tx) => {
    const id = input.id ?? newId();
    const existing = input.id
      ? await tx.one<{
          updated_at: Date;
          slug: string;
          published_at: Date | null;
          is_demo: boolean;
        }>(
          "select updated_at, slug, published_at, is_demo from products where id = $1 for update",
          [input.id],
        )
      : null;
    if (input.id && !existing) fail("not_found", "Ce produit n'existe plus.");
    if (
      existing &&
      ctx.expectedUpdatedAt &&
      new Date(existing.updated_at).toISOString() !== ctx.expectedUpdatedAt
    ) {
      fail(
        "conflict",
        "Ce produit a été modifié par ailleurs entre-temps. Rechargez la page pour récupérer la dernière version ; votre saisie reste affichée.",
      );
    }
    let slug = slugify(input.slug?.trim() || input.name) || id.slice(0, 8);
    if (existing && !input.slug) slug = existing.slug;
    const clash = await tx.one(
      "select 1 from products where slug = $1 and id <> $2",
      [slug, id],
    );
    if (clash) slug = `${slug}-${id.slice(0, 4)}`;

    const publishedAt =
      input.status === "published"
        ? (existing?.published_at ?? new Date())
        : (existing?.published_at ?? null);
    if (existing) {
      await tx.query(
        `update products set name=$2, slug=$3, brand=$4, category_id=$5, description=$6, specs=$7, condition=$8,
                axes=$9, status=$10, featured=$11, published_at=$12, updated_at=now() where id=$1`,
        [
          id,
          input.name.trim(),
          slug,
          input.brand.trim(),
          input.categoryId,
          input.description,
          JSON.stringify(input.specs),
          input.condition || null,
          JSON.stringify(input.axes),
          input.status,
          input.featured,
          publishedAt,
        ],
      );
    } else {
      await tx.query(
        `insert into products (id, name, slug, brand, category_id, description, specs, condition, axes, status, featured, published_at, is_demo)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          id,
          input.name.trim(),
          slug,
          input.brand.trim(),
          input.categoryId,
          input.description,
          JSON.stringify(input.specs),
          input.condition || null,
          JSON.stringify(input.axes),
          input.status,
          input.featured,
          publishedAt,
          !!input.isDemo,
        ],
      );
    }

    await tx.query("delete from product_images where product_id = $1", [id]);
    for (const [i, img] of input.images.entries()) {
      await tx.query(
        "insert into product_images (id, product_id, url, alt, color, position) values ($1,$2,$3,$4,$5,$6)",
        [newId(), id, img.url, img.alt || input.name, img.color ?? null, i],
      );
    }

    const current = await tx.query<{ id: string; has_sales: boolean }>(
      `select v.id, exists (select 1 from order_lines l where l.variant_id = v.id) as has_sales
         from variants v where product_id = $1 and active`,
      [id],
    );
    const keep = new Set(input.variants.map((v) => v.id).filter(Boolean));
    for (const v of current) {
      if (keep.has(v.id)) continue;
      // Une variante déjà vendue est désactivée, jamais supprimée : l'historique reste intact.
      if (v.has_sales)
        await tx.query("update variants set active = false where id = $1", [
          v.id,
        ]);
      else await tx.query("delete from variants where id = $1", [v.id]);
    }
    for (const [i, v] of input.variants.entries()) {
      const sku = v.sku.trim().toUpperCase();
      const skuClash = await tx.one(
        "select 1 from variants where upper(sku) = $1 and id <> $2",
        [sku, v.id ?? ""],
      );
      if (skuClash)
        fail(
          "conflict",
          `La référence ${sku} est déjà utilisée par un autre article.`,
        );
      if (v.id && current.some((c) => c.id === v.id)) {
        await tx.query(
          `update variants set sku=$2, options=$3, price=$4, low_stock_threshold=$5, position=$6
             ${ctx.withCosts ? ", cost_price=$7" : ""} where id=$1`,
          [
            v.id,
            sku,
            JSON.stringify(v.options),
            v.price,
            v.lowStockThreshold ?? null,
            i,
            ...(ctx.withCosts ? [v.costPrice ?? null] : []),
          ],
        );
      } else {
        const vid = newId();
        const initial = Math.max(0, Math.floor(v.initialStock ?? 0));
        await tx.query(
          `insert into variants (id, product_id, sku, options, price, cost_price, on_hand, low_stock_threshold, position)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            vid,
            id,
            sku,
            JSON.stringify(v.options),
            v.price,
            ctx.withCosts ? (v.costPrice ?? null) : null,
            initial,
            v.lowStockThreshold ?? null,
            i,
          ],
        );
        if (initial > 0) {
          await tx.query(
            `insert into stock_movements (id, variant_id, kind, on_hand_delta, on_hand_after, reserved_after, reason, user_id)
             values ($1,$2,'initial',$3,$3,0,'Stock initial à la création',$4)`,
            [newId(), vid, initial, ctx.userId],
          );
        }
      }
    }
    const saved = await tx.one<{ slug: string; updated_at: Date }>(
      "select slug, updated_at from products where id = $1",
      [id],
    );
    return {
      id,
      slug: saved!.slug,
      updatedAt: new Date(saved!.updated_at).toISOString(),
    };
  });
}

export async function duplicateProduct(
  db: Db,
  id: string,
  userId: string | null,
) {
  const src = await productForEdit(db, id, { withCosts: true });
  if (!src) return fail("not_found", "Produit introuvable.");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return saveProduct(
    db,
    {
      ...src,
      id: undefined,
      slug: undefined,
      name: `${src.name} (copie)`,
      status: "draft",
      featured: false,
      isDemo: src.isDemo,
      variants: src.variants.map((v) => ({
        ...v,
        id: undefined,
        sku: `${v.sku}-${suffix}`,
        initialStock: 0,
      })),
    },
    { userId, withCosts: true },
  );
}

/** Supprime un brouillon jamais vendu ; sinon impose l'archivage. */
export async function deleteOrArchiveProduct(db: Db, id: string) {
  const sales = await db.one<{ n: number }>(
    "select count(*)::int as n from order_lines where product_id = $1",
    [id],
  );
  if (sales?.n) {
    await db.query(
      "update products set status = 'archived', featured = false, updated_at = now() where id = $1",
      [id],
    );
    return "archived" as const;
  }
  await db.query("delete from products where id = $1", [id]);
  return "deleted" as const;
}

export async function setProductsStatus(
  db: Db,
  ids: string[],
  status: ProductStatus,
) {
  const blocked: string[] = [];
  for (const id of ids) {
    if (status === "published") {
      const p = await productForEdit(db, id, { withCosts: false });
      if (!p) continue;
      const issues = publicationIssues(p);
      if (issues.length) {
        blocked.push(`${p.name} : ${issues[0]}`);
        continue;
      }
    }
    await db.query(
      `update products set status = $2, updated_at = now(),
              published_at = case when $2 = 'published' then coalesce(published_at, now()) else published_at end,
              featured = case when $2 = 'published' then featured else false end
        where id = $1`,
      [id, status],
    );
  }
  return { blocked };
}

/** Aperçu d'un changement de prix groupé (pourcentage), avant application. */
export async function previewPriceChange(
  db: Db,
  productIds: string[],
  percent: number,
) {
  const rows = await db.query<{
    id: string;
    sku: string;
    name: string;
    price: number;
  }>(
    `select v.id, v.sku, p.name, v.price from variants v join products p on p.id = v.product_id
      where v.product_id = any($1) and v.active order by p.name, v.position`,
    [productIds],
  );
  return rows.map((r) => ({
    ...r,
    newPrice: Math.max(
      0,
      Math.round((r.price * (100 + percent)) / 100 / 50) * 50,
    ),
  }));
}

export async function applyPriceChange(
  db: Db,
  productIds: string[],
  percent: number,
) {
  if (
    !Number.isFinite(percent) ||
    percent < -90 ||
    percent > 200 ||
    percent === 0
  ) {
    fail("validation", "Indiquez une variation entre −90 % et +200 %.");
  }
  const preview = await previewPriceChange(db, productIds, percent);
  await db.tx(async (tx) => {
    for (const r of preview)
      await tx.query("update variants set price = $2 where id = $1", [
        r.id,
        r.newPrice,
      ]);
    await tx.query(
      "update products set updated_at = now() where id = any($1)",
      [productIds],
    );
  });
  return preview.length;
}

export async function setCategoryForProducts(
  db: Db,
  ids: string[],
  categoryId: string,
) {
  await db.query(
    "update products set category_id = $2, updated_at = now() where id = any($1)",
    [ids, categoryId],
  );
}

// ——— Catégories ———

export async function saveCategory(
  db: Db,
  input: { id?: string; name: string; description: string; slug?: string },
) {
  if (!input.name.trim())
    fail("validation", "Le nom est obligatoire.", { name: "Obligatoire." });
  const slug = slugify(input.slug || input.name);
  const clash = await db.one(
    "select 1 from categories where slug = $1 and id <> $2",
    [slug, input.id ?? ""],
  );
  if (clash)
    fail("conflict", "Une catégorie porte déjà ce nom.", {
      name: "Déjà utilisé.",
    });
  if (input.id) {
    await db.query(
      "update categories set name = $2, description = $3, slug = $4 where id = $1",
      [input.id, input.name.trim(), input.description, slug],
    );
    return input.id;
  }
  const id = newId();
  const pos = await db.one<{ n: number }>(
    "select coalesce(max(position), 0)::int + 1 as n from categories",
  );
  await db.query(
    "insert into categories (id, slug, name, description, position) values ($1,$2,$3,$4,$5)",
    [id, slug, input.name.trim(), input.description, pos!.n],
  );
  return id;
}

export async function moveCategory(db: Db, id: string, direction: -1 | 1) {
  await db.tx(async (tx) => {
    const cats = await tx.query<{ id: string }>(
      "select id from categories order by position, name",
    );
    const i = cats.findIndex((c) => c.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    for (const [pos, c] of cats.entries())
      await tx.query("update categories set position = $2 where id = $1", [
        c.id,
        pos,
      ]);
  });
}

export async function deleteCategory(db: Db, id: string) {
  const used = await db.one<{ n: number }>(
    "select count(*)::int as n from products where category_id = $1 and status <> 'archived'",
    [id],
  );
  if (used?.n)
    fail(
      "conflict",
      `Cette catégorie contient ${used.n} produit(s). Déplacez-les avant de la supprimer.`,
    );
  await db.query("delete from categories where id = $1", [id]);
}

// ——— Promotions ———

export async function listPromotions(db: Db) {
  return db.query<Promotion & { product_name: string }>(
    `select pr.*, p.name as product_name from promotions pr join products p on p.id = pr.product_id
      order by pr.ends_at desc`,
  );
}

export async function savePromotion(
  db: Db,
  input: {
    id?: string;
    name: string;
    productId: string;
    kind: "percent" | "amount";
    value: number;
    startsAt: Date;
    endsAt: Date;
  },
) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Obligatoire.";
  if (!input.productId) errors.productId = "Choisissez un produit.";
  if (!(input.value > 0)) errors.value = "Valeur positive requise.";
  if (input.kind === "percent" && input.value >= 100)
    errors.value = "Moins de 100 %.";
  if (!(input.endsAt > input.startsAt))
    errors.endsAt = "La fin doit suivre le début.";
  if (Object.keys(errors).length)
    fail("validation", "Vérifiez les champs signalés.", errors);
  if (input.id) {
    await db.query(
      "update promotions set name=$2, product_id=$3, kind=$4, value=$5, starts_at=$6, ends_at=$7 where id=$1",
      [
        input.id,
        input.name.trim(),
        input.productId,
        input.kind,
        input.value,
        input.startsAt,
        input.endsAt,
      ],
    );
    return input.id;
  }
  const id = newId();
  await db.query(
    "insert into promotions (id, name, product_id, kind, value, starts_at, ends_at) values ($1,$2,$3,$4,$5,$6,$7)",
    [
      id,
      input.name.trim(),
      input.productId,
      input.kind,
      input.value,
      input.startsAt,
      input.endsAt,
    ],
  );
  return id;
}

export async function stopPromotion(db: Db, id: string) {
  await db.query("update promotions set active = false where id = $1", [id]);
}
