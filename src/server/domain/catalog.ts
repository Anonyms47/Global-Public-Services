import type { Db } from "../db/client";
import { fail, newId } from "./errors";
import { slugify } from "@/lib/format";
import { normalizeBarcode, suggestSku } from "@/lib/sku";
import { availableUnits, stockTracking } from "./stock";
import type { CategoryProfile } from "@/lib/product-kit";

// ——— Types ———

export type ProductStatus = "draft" | "published" | "archived";

export interface Spec {
  label: string;
  value: string;
  /** Unité facultative, accolée à la valeur à l'affichage. */
  unit?: string;
  /** Caractéristique interne : jamais affichée sur le site. */
  private?: boolean;
}

/** Provenance d'un média (photo trouvée sur Internet, importée depuis une adresse). */
export interface MediaSource {
  url: string;
  domain: string;
  fetchedAt: string;
  status: string;
  matches?: string;
  license?: string;
  /** GPS a validé le droit de publier cette image (sinon elle reste privée). */
  rightsConfirmed?: boolean;
}

/** Caractéristiques publiques : sans les privées, unité accolée. */
export function publicSpecs(specs: Spec[]) {
  return (specs ?? [])
    .filter((s) => !s.private && s.label?.trim() && s.value?.trim())
    .map((s) => ({ label: s.label, value: s.unit?.trim() ? `${s.value} ${s.unit.trim()}` : s.value }));
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
  /** Garantie propre au produit, vide sinon. */
  warranty: string;
  axes: string[];
  featured: boolean;
  featuredPosition: number;
  createdAt: Date;
  isDemo: boolean;
  images: { url: string; alt: string; color: string | null }[];
  /** Vidéos courtes de la fiche (MP4/WebM), affichées après les photos. */
  videos: { url: string; alt: string }[];
  variants: PublicVariant[];
  promo: { name: string; endsAt: Date; label: string } | null;
  minPrice: number;
  minBasePrice: number;
  available: number;
  /** Quantités suivies (Paramètres → Stock) ; sinon le site ne parle pas de stock. */
  stockTracked: boolean;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  position: number;
  is_demo: boolean;
  image_url: string | null;
  visible: boolean;
  featured: boolean;
  archived_at: Date | null;
  profile: CategoryProfile | null;
}

// ——— Prix ———

export function isPromoRunning(p: Pick<Promotion, "active" | "starts_at" | "ends_at">, now: Date) {
  return p.active && new Date(p.starts_at) <= now && now < new Date(p.ends_at);
}

export function discounted(price: number, promo: Pick<Promotion, "kind" | "value">) {
  const off = promo.kind === "percent" ? Math.round((price * promo.value) / 100) : promo.value;
  return Math.max(0, price - off);
}

export function promoLabel(p: Pick<Promotion, "kind" | "value">) {
  return p.kind === "percent" ? `−${p.value} %` : `−${new Intl.NumberFormat("fr-FR").format(p.value)} FCFA`;
}

/** Meilleure promotion en cours pour un produit. */
export function bestPromo(promos: Promotion[], basePrice: number, now: Date) {
  let best: Promotion | null = null;
  for (const p of promos) {
    if (!isPromoRunning(p, now)) continue;
    if (!best || discounted(basePrice, p) < discounted(basePrice, best)) best = p;
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
  warranty: string | null;
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
  unsellable: number;
  disabled: boolean;
}

async function hydrate(db: Db, rows: ProductRow[], now: Date): Promise<PublicProduct[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [variants, images, promos] = await Promise.all([
    db.query<VariantRow>(
      `select id, product_id, sku, options, price, on_hand, reserved, unsellable, disabled from variants
        where product_id = any($1) and active order by position, price`,
      [ids],
    ),
    db.query<{
      product_id: string;
      url: string;
      alt: string;
      color: string | null;
      kind: string;
    }>("select product_id, url, alt, color, kind from product_images where product_id = any($1) order by position", [
      ids,
    ]),
    db.query<Promotion>("select * from promotions where product_id = any($1) and active", [ids]),
  ]);
  const tracking = await stockTracking(db);
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
        // Version désactivée : affichée comme indisponible ; quantités non suivies : toujours disponible.
        available: availableUnits(v, tracking),
      }));
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        brand: r.brand,
        categorySlug: r.category_slug,
        categoryName: r.category_name,
        description: r.description,
        specs: publicSpecs(r.specs ?? []),
        condition: r.condition,
        warranty: r.warranty ?? "",
        axes: r.axes ?? [],
        featured: r.featured,
        featuredPosition: r.featured_position,
        createdAt: new Date(r.created_at),
        isDemo: r.is_demo,
        images: images
          .filter((i) => i.product_id === r.id && i.kind !== "video")
          .map(({ url, alt, color }) => ({ url, alt, color })),
        videos: images.filter((i) => i.product_id === r.id && i.kind === "video").map(({ url, alt }) => ({ url, alt })),
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
        stockTracked: tracking,
      } satisfies PublicProduct;
    })
    .filter((p) => p.variants.length > 0);
}

const productSelect = `
  select p.id, p.slug, p.name, p.brand, c.slug as category_slug, c.name as category_name,
         p.description, p.specs, p.condition, p.warranty, p.axes, p.featured, p.featured_position,
         p.created_at, p.is_demo
    from products p left join categories c on c.id = p.category_id`;

/**
 * Publie les brouillons programmés dont l'heure est passée. Appelée à la
 * lecture du catalogue : aucune tâche planifiée n'est nécessaire.
 */
export async function applySchedules(db: Db, now = new Date()) {
  await db.query(
    `update products set status = 'published', published_at = coalesce(published_at, publish_at), publish_at = null, updated_at = now()
      where status = 'draft' and publish_at is not null and publish_at <= $1 and deleted_at is null`,
    [now],
  );
  // Retrait programmé : le produit repasse en brouillon (hors du site), sans rien perdre.
  await db.query(
    `update products set status = 'draft', featured = false, unpublish_at = null, updated_at = now()
      where status = 'published' and unpublish_at is not null and unpublish_at <= $1`,
    [now],
  );
}

export async function publishedProducts(db: Db, now = new Date()) {
  await applySchedules(db, now);
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status = 'published' and not p.disabled order by p.created_at desc`,
  );
  return hydrate(db, rows, now);
}

/** Articles vendables au comptoir : publiés ou en brouillon (hors archives). */
export async function sellableProducts(db: Db, now = new Date()) {
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status <> 'archived' and not p.disabled order by p.name`,
  );
  return hydrate(db, rows, now);
}

export async function publishedProductBySlug(db: Db, slug: string, now = new Date()) {
  await applySchedules(db, now);
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status = 'published' and not p.disabled and p.slug = $1`,
    [slug],
  );
  return (await hydrate(db, rows, now))[0] ?? null;
}

export async function publishedProductById(db: Db, id: string, now = new Date()) {
  await applySchedules(db, now);
  const rows = await db.query<ProductRow>(
    `${productSelect} where p.status = 'published' and not p.disabled and p.id = $1`,
    [id],
  );
  return (await hydrate(db, rows, now))[0] ?? null;
}

/** Aperçu interne (Comptoir) : le produit tel qu'il apparaîtra, quel que soit son statut (hors corbeille). */
export async function previewProductById(db: Db, id: string, now = new Date()) {
  const rows = await db.query<ProductRow>(`${productSelect} where p.id = $1 and p.deleted_at is null`, [id]);
  return (await hydrate(db, rows, now))[0] ?? null;
}

/**
 * Catégories. Par défaut (site public) : visibles et non archivées ; les pages
 * publiques n'affichent en plus que celles qui ont au moins un produit publié.
 * Comptoir : `scope: "active"` (non archivées, masquées comprises) pour les
 * formulaires et l'import, `scope: "all"` pour la gestion des catégories.
 */
export async function listCategories(db: Db, opts: { scope?: "public" | "active" | "all" } = {}) {
  await applySchedules(db);
  const where =
    opts.scope === "all"
      ? "true"
      : opts.scope === "active"
        ? "c.archived_at is null"
        : "c.visible and c.archived_at is null";
  return db.query<Category & { product_count: number; total_count: number }>(
    `select c.*, (select count(*)::int from products p where p.category_id = c.id and p.status = 'published' and p.deleted_at is null) as product_count,
            (select count(*)::int from products p where p.category_id = c.id) as total_count
       from categories c where ${where} order by c.archived_at is not null, c.position, c.name`,
  );
}

/** Catégorie publique (visible, non archivée). */
export async function categoryBySlug(db: Db, slug: string) {
  return db.one<Category>("select * from categories where slug = $1 and visible and archived_at is null", [slug]);
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

export const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function filterProducts(all: PublicProduct[], q: ShopQuery) {
  let list = all;
  if (q.q) {
    const terms = normalize(q.q).split(/\s+/).filter(Boolean);
    list = list.filter((p) => {
      const hay = normalize([p.name, p.brand, p.categoryName ?? "", ...p.variants.map((v) => v.sku)].join(" "));
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
  else if (q.tri === "prix-desc") sorted.sort((a, b) => b.minPrice - a.minPrice);
  else sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return sorted;
}

/** Facettes calculées sur les données disponibles. */
export function facets(all: PublicProduct[]) {
  const brands = [...new Set(all.map((p) => p.brand).filter(Boolean))].sort();
  const conditions = [...new Set(all.map((p) => p.condition).filter(Boolean) as string[])].sort();
  const prices = all.map((p) => p.minPrice);
  return {
    brands,
    conditions,
    hasPromo: all.some((p) => p.promo),
    priceMin: prices.length ? Math.min(...prices) : 0,
    priceMax: prices.length ? Math.max(...prices) : 0,
  };
}

export function relatedProducts(all: PublicProduct[], product: PublicProduct, limit = 4) {
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
  publish_at: Date | null;
  unpublish_at: Date | null;
  deleted_at: Date | null;
  image: string | null;
  variant_count: number;
  min_price: number | null;
  max_price: number | null;
  on_hand: number;
  available: number;
  has_sales: boolean;
  disabled: boolean;
  disabled_variants: number;
}

export async function adminProducts(db: Db, opts: { q?: string; status?: string; category?: string } = {}) {
  const params: unknown[] = [];
  const where: string[] = [];
  await applySchedules(db);
  if (opts.status === "trash") where.push("p.deleted_at is not null");
  else {
    where.push("p.deleted_at is null");
    if (opts.status && opts.status !== "all") {
      params.push(opts.status);
      where.push(`p.status = $${params.length}`);
    } else if (opts.status !== "all") where.push("p.status <> 'archived'");
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`p.category_id = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.trim()}%`);
    where.push(
      `(p.name ilike $${params.length} or p.brand ilike $${params.length} or exists (select 1 from variants v where v.product_id = p.id and (v.sku ilike $${params.length} or v.barcode ilike $${params.length})))`,
    );
  }
  return db.query<AdminProductRow>(
    `select p.id, p.slug, p.name, p.brand, p.category_id, c.name as category_name, p.status, p.featured,
            p.updated_at, p.is_demo, p.publish_at, p.unpublish_at, p.deleted_at, p.disabled,
            (select count(*)::int from variants v where v.product_id = p.id and v.active and v.disabled) as disabled_variants,
            (select url from product_images i where i.product_id = p.id and i.kind = 'image' order by position limit 1) as image,
            (select count(*)::int from variants v where v.product_id = p.id and v.active) as variant_count,
            (select min(price) from variants v where v.product_id = p.id and v.active) as min_price,
            (select max(price) from variants v where v.product_id = p.id and v.active) as max_price,
            (select coalesce(sum(on_hand), 0)::int from variants v where v.product_id = p.id and v.active) as on_hand,
            (select coalesce(sum(on_hand - reserved - unsellable), 0)::int from variants v where v.product_id = p.id and v.active) as available,
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
  /** Code-barres (EAN, UPC ou code interne), unique s'il est renseigné. */
  barcode?: string | null;
}

export interface ProductInput {
  id?: string;
  /**
   * Identifiant choisi par le formulaire pour une création : un second envoi
   * (double clic, réseau lent) renvoie le produit déjà créé au lieu d'un doublon.
   */
  createId?: string;
  name: string;
  slug?: string;
  brand: string;
  /** Modèle exact (fabricant), séparé du nom public simple. */
  model?: string;
  /** Description structurée (phrase courte, points forts, contenu de la boîte…). */
  details?: import("@/lib/product-kit").ProductDetails;
  categoryId: string | null;
  description: string;
  specs: Spec[];
  condition: string | null;
  /** Garantie propre au produit (sinon, la garantie générale de GPS s'applique). */
  warranty?: string;
  axes: string[];
  images: {
    url: string;
    alt: string;
    color?: string | null;
    kind?: "image" | "video";
    source?: MediaSource | null;
  }[];
  variants: VariantInput[];
  status: ProductStatus;
  featured: boolean;
  isDemo?: boolean;
  /** Publication programmée (brouillon publié automatiquement à cette date). */
  publishAt?: string | null;
  /** Retrait programmé du site (le produit repasse en brouillon à cette date). */
  unpublishAt?: string | null;
  /** Données internes (import : clé stable, sources, vérifications). Écrites à la création seulement. */
  internal?: Record<string, unknown>;
}

export interface EditableProduct extends ProductInput {
  id: string;
  slug: string;
  updatedAt: string;
  deletedAt: string | null;
  hasSales: boolean;
  variants: (VariantInput & {
    id: string;
    onHand: number;
    reserved: number;
    unsellable: number;
    hasSales: boolean;
  })[];
}

export async function productForEdit(
  db: Db,
  id: string,
  opts: { withCosts: boolean },
): Promise<EditableProduct | null> {
  const p = await db.one<Record<string, unknown>>("select * from products where id = $1", [id]);
  if (!p) return null;
  const [images, variants, sales] = await Promise.all([
    db.query<{ url: string; alt: string; color: string | null; kind: "image" | "video"; source: MediaSource | null }>(
      "select url, alt, color, kind, source from product_images where product_id = $1 order by position",
      [id],
    ),
    db.query<Record<string, unknown>>(
      `select v.*, exists (select 1 from order_lines l where l.variant_id = v.id) as has_sales
         from variants v where product_id = $1 and active order by position`,
      [id],
    ),
    db.one<{ n: number }>("select count(*)::int as n from order_lines where product_id = $1", [id]),
  ]);
  return {
    id,
    slug: p.slug as string,
    name: p.name as string,
    brand: p.brand as string,
    model: (p.model as string) ?? "",
    details: (p.details as import("@/lib/product-kit").ProductDetails) ?? {},
    categoryId: (p.category_id as string) ?? null,
    description: p.description as string,
    specs: (p.specs as Spec[]) ?? [],
    condition: (p.condition as string) ?? null,
    warranty: (p.warranty as string) ?? "",
    axes: (p.axes as string[]) ?? [],
    images,
    status: p.status as ProductStatus,
    featured: p.featured as boolean,
    isDemo: p.is_demo as boolean,
    updatedAt: new Date(p.updated_at as Date).toISOString(),
    publishAt: p.publish_at ? new Date(p.publish_at as Date).toISOString() : null,
    unpublishAt: p.unpublish_at ? new Date(p.unpublish_at as Date).toISOString() : null,
    deletedAt: p.deleted_at ? new Date(p.deleted_at as Date).toISOString() : null,
    hasSales: (sales?.n ?? 0) > 0,
    variants: variants.map((v) => ({
      id: v.id as string,
      sku: v.sku as string,
      options: v.options as Record<string, string>,
      price: v.price as number,
      costPrice: opts.withCosts ? ((v.cost_price as number) ?? null) : undefined,
      lowStockThreshold: (v.low_stock_threshold as number) ?? null,
      barcode: (v.barcode as string) ?? null,
      onHand: v.on_hand as number,
      reserved: v.reserved as number,
      unsellable: (v.unsellable as number) ?? 0,
      hasSales: v.has_sales as boolean,
    })),
  };
}

export { publicationIssues } from "@/lib/publication";

/**
 * Références et codes-barres déjà pris par un autre produit : vérifiés pendant
 * la saisie, avant l'enregistrement (qui les refuse de toute façon).
 */
export async function codeClashes(db: Db, codes: { skus: string[]; barcodes: string[] }, productId: string | null) {
  const skus = [...new Set(codes.skus.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 200);
  const barcodes = [...new Set(codes.barcodes.map(normalizeBarcode).filter(Boolean))].slice(0, 200);
  const [s, b] = await Promise.all([
    skus.length
      ? db.query<{ code: string; name: string }>(
          `select upper(v.sku) as code, p.name from variants v join products p on p.id = v.product_id
            where upper(v.sku) = any($1) and v.product_id <> $2`,
          [skus, productId ?? ""],
        )
      : [],
    barcodes.length
      ? db.query<{ code: string; name: string }>(
          `select v.barcode as code, p.name from variants v join products p on p.id = v.product_id
            where v.barcode = any($1) and v.product_id <> $2`,
          [barcodes, productId ?? ""],
        )
      : [],
  ]);
  return { skus: s, barcodes: b };
}
import { publicationIssues } from "@/lib/publication";

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
  if (input.status === "published" || (input.status === "draft" && input.publishAt)) {
    const issues = publicationIssues(input);
    if (issues.length) {
      fail(
        "validation",
        `${input.status === "published" ? "Publication" : "Programmation"} impossible : ${issues.join(" ")}`,
      );
    }
  }
  const publishAt = input.status === "draft" && input.publishAt ? new Date(input.publishAt) : null;
  if (publishAt && Number.isNaN(publishAt.getTime())) fail("validation", "Date de publication invalide.");
  const unpublishAt =
    (input.status === "published" || publishAt) && input.unpublishAt ? new Date(input.unpublishAt) : null;
  if (unpublishAt && Number.isNaN(unpublishAt.getTime())) fail("validation", "Date de retrait invalide.");
  if (unpublishAt && unpublishAt.getTime() <= Math.max(Date.now(), publishAt?.getTime() ?? 0)) {
    fail("validation", "La date de retrait doit être postérieure à maintenant et à la date de publication.", {
      unpublishAt: "Date trop proche.",
    });
  }
  for (const v of input.variants) {
    if (!Number.isInteger(v.price) || v.price < 0) fail("validation", `Prix invalide pour ${v.sku || "une variante"}.`);
  }
  return db.tx(async (tx) => {
    if (!input.id && input.createId) {
      // Second envoi d'une même création : on renvoie le produit déjà créé.
      const done = await tx.one<{ slug: string; updated_at: Date }>(
        "select slug, updated_at from products where id = $1",
        [input.createId],
      );
      if (done) return { id: input.createId, slug: done.slug, updatedAt: new Date(done.updated_at).toISOString() };
    }
    const id = input.id ?? input.createId ?? newId();
    const existing = input.id
      ? await tx.one<{
          updated_at: Date;
          slug: string;
          published_at: Date | null;
          is_demo: boolean;
        }>("select updated_at, slug, published_at, is_demo from products where id = $1 for update", [input.id])
      : null;
    if (input.id && !existing) fail("not_found", "Ce produit n'existe plus.");
    if (existing) {
      // Version précédente conservée avant toute modification.
      const before = await productForEdit(tx, id, { withCosts: true });
      if (before) {
        await tx.query("insert into product_versions (id, product_id, snapshot, user_id) values ($1,$2,$3,$4)", [
          newId(),
          id,
          JSON.stringify(before),
          ctx.userId,
        ]);
        await tx.query(
          `delete from product_versions where product_id = $1 and id not in
             (select id from product_versions where product_id = $1 order by created_at desc limit 30)`,
          [id],
        );
      }
    }
    if (existing && ctx.expectedUpdatedAt && new Date(existing.updated_at).toISOString() !== ctx.expectedUpdatedAt) {
      fail(
        "conflict",
        "Ce produit a été modifié par ailleurs entre-temps. Rechargez la page pour récupérer la dernière version ; votre saisie reste affichée.",
      );
    }
    let slug = slugify(input.slug?.trim() || input.name) || id.slice(0, 8);
    if (existing && !input.slug) slug = existing.slug;
    const clash = await tx.one("select 1 from products where slug = $1 and id <> $2", [slug, id]);
    if (clash) slug = `${slug}-${id.slice(0, 4)}`;

    const publishedAt =
      input.status === "published" ? (existing?.published_at ?? new Date()) : (existing?.published_at ?? null);
    if (existing) {
      await tx.query(
        `update products set name=$2, slug=$3, brand=$4, category_id=$5, description=$6, specs=$7, condition=$8,
                axes=$9, status=$10, featured=$11, published_at=$12, publish_at=$13, unpublish_at=$14, warranty=$15,
                model=$16, details=$17, updated_at=now() where id=$1`,
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
          publishAt,
          unpublishAt,
          (input.warranty ?? "").trim(),
          (input.model ?? "").trim(),
          JSON.stringify(input.details ?? {}),
        ],
      );
    } else {
      await tx.query(
        `insert into products (id, name, slug, brand, category_id, description, specs, condition, axes, status, featured, published_at, is_demo, publish_at, unpublish_at, warranty, internal, model, details)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
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
          publishAt,
          unpublishAt,
          (input.warranty ?? "").trim(),
          JSON.stringify(input.internal ?? {}),
          (input.model ?? "").trim(),
          JSON.stringify(input.details ?? {}),
        ],
      );
    }

    await tx.query("delete from product_images where product_id = $1", [id]);
    for (const [i, img] of input.images.entries()) {
      await tx.query(
        "insert into product_images (id, product_id, url, alt, color, position, kind, source) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          newId(),
          id,
          img.url,
          img.alt || input.name,
          img.color ?? null,
          i,
          img.kind === "video" ? "video" : "image",
          img.source ? JSON.stringify(img.source) : null,
        ],
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
      if (v.has_sales) await tx.query("update variants set active = false where id = $1", [v.id]);
      else await tx.query("delete from variants where id = $1", [v.id]);
    }
    const taken = new Set(input.variants.map((v) => v.sku.trim().toUpperCase()).filter(Boolean));
    for (const [i, v] of input.variants.entries()) {
      let sku = v.sku.trim().toUpperCase();
      if (!sku) {
        // Référence vide : proposée à partir du nom et des options, rendue unique.
        const base = suggestSku(input.name, input.axes, v.options);
        sku = base;
        for (let n = 2; taken.has(sku) || (await tx.one("select 1 from variants where upper(sku) = $1", [sku])); n++) {
          sku = `${base}-${n}`;
        }
        taken.add(sku);
      }
      const skuClash = await tx.one("select 1 from variants where upper(sku) = $1 and id <> $2", [sku, v.id ?? ""]);
      if (skuClash) fail("conflict", `La référence ${sku} est déjà utilisée par un autre article.`);
      const barcode = normalizeBarcode(v.barcode) || null;
      if (barcode) {
        const clash = await tx.one("select 1 from variants where barcode = $1 and id <> $2", [barcode, v.id ?? ""]);
        if (clash) fail("conflict", `Le code-barres ${barcode} est déjà utilisé par un autre article.`);
      }
      if (v.id && current.some((c) => c.id === v.id)) {
        await tx.query(
          `update variants set sku=$2, options=$3, price=$4, low_stock_threshold=$5, position=$6, barcode=$7
             ${ctx.withCosts ? ", cost_price=$8" : ""} where id=$1`,
          [
            v.id,
            sku,
            JSON.stringify(v.options),
            v.price,
            v.lowStockThreshold ?? null,
            i,
            barcode,
            ...(ctx.withCosts ? [v.costPrice ?? null] : []),
          ],
        );
      } else {
        const vid = newId();
        const initial = Math.max(0, Math.floor(v.initialStock ?? 0));
        await tx.query(
          `insert into variants (id, product_id, sku, options, price, cost_price, on_hand, low_stock_threshold, position, barcode)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
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
            barcode,
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

export async function duplicateProduct(db: Db, id: string, userId: string | null) {
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
        barcode: null,
        initialStock: 0,
      })),
    },
    { userId, withCosts: true },
  );
}

/** Met le produit à la corbeille : retiré du site et du comptoir, restaurable. */
export async function trashProduct(db: Db, id: string) {
  const r = await db.one(
    `update products set status = 'archived', featured = false, publish_at = null, deleted_at = now(), updated_at = now()
      where id = $1 and deleted_at is null returning id`,
    [id],
  );
  if (!r) fail("not_found", "Produit introuvable ou déjà à la corbeille.");
}

/** Sort le produit de la corbeille, en brouillon : à relire avant de republier. */
export async function restoreProduct(db: Db, id: string) {
  const r = await db.one(
    "update products set deleted_at = null, status = 'draft', updated_at = now() where id = $1 and deleted_at is not null returning id",
    [id],
  );
  if (!r) fail("not_found", "Ce produit n'est pas à la corbeille.");
}

/** Suppression définitive : seulement depuis la corbeille et jamais pour un produit déjà vendu. */
export async function purgeProduct(db: Db, id: string) {
  const p = await db.one<{ deleted_at: Date | null }>("select deleted_at from products where id = $1", [id]);
  if (!p) return fail("not_found", "Produit introuvable.");
  if (!p.deleted_at) fail("conflict", "Mettez d'abord le produit à la corbeille.");
  const sales = await db.one<{ n: number }>("select count(*)::int as n from order_lines where product_id = $1", [id]);
  if (sales?.n) fail("conflict", "Ce produit figure dans des commandes : il reste archivé pour l'historique.");
  await db.query("delete from products where id = $1", [id]);
}

export async function listVersions(db: Db, productId: string) {
  return db.query<{ id: string; created_at: Date; user_name: string | null; name: string; status: string }>(
    `select v.id, v.created_at, u.name as user_name, v.snapshot->>'name' as name, v.snapshot->>'status' as status
       from product_versions v left join users u on u.id = v.user_id
      where v.product_id = $1 order by v.created_at desc limit 30`,
    [productId],
  );
}

/**
 * Restaure le contenu d'une version (textes, photos, caractéristiques, prix et
 * options des variantes encore actives). Le stock, le statut et les variantes
 * ajoutées depuis ne sont pas touchés. La version actuelle est elle-même conservée.
 */
export async function restoreVersion(db: Db, versionId: string, ctx: { userId: string | null; withCosts: boolean }) {
  const v = await db.one<{ product_id: string; snapshot: EditableProduct }>(
    "select product_id, snapshot from product_versions where id = $1",
    [versionId],
  );
  if (!v) return fail("not_found", "Version introuvable.");
  const current = await productForEdit(db, v.product_id, { withCosts: ctx.withCosts });
  if (!current) return fail("not_found", "Ce produit n'existe plus.");
  const old = v.snapshot;
  return saveProduct(
    db,
    {
      ...current,
      name: old.name,
      brand: old.brand,
      categoryId: old.categoryId,
      description: old.description,
      specs: old.specs,
      condition: old.condition,
      warranty: old.warranty ?? current.warranty,
      axes: old.axes,
      images: old.images,
      variants: current.variants.map((cv) => {
        const ov = old.variants.find((x) => x.id === cv.id);
        return ov
          ? {
              ...cv,
              sku: ov.sku,
              options: ov.options,
              price: ov.price,
              ...(ctx.withCosts ? { costPrice: ov.costPrice } : {}),
            }
          : cv;
      }),
    },
    { ...ctx, expectedUpdatedAt: current.updatedAt },
  );
}

/** Supprime un brouillon jamais vendu ; sinon impose l'archivage. */
export async function deleteOrArchiveProduct(db: Db, id: string) {
  const sales = await db.one<{ n: number }>("select count(*)::int as n from order_lines where product_id = $1", [id]);
  if (sales?.n) {
    await db.query("update products set status = 'archived', featured = false, updated_at = now() where id = $1", [id]);
    return "archived" as const;
  }
  await db.query("delete from products where id = $1", [id]);
  return "deleted" as const;
}

export async function setProductsStatus(db: Db, ids: string[], status: ProductStatus) {
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
export async function previewPriceChange(db: Db, productIds: string[], percent: number) {
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
    newPrice: Math.max(0, Math.round((r.price * (100 + percent)) / 100 / 50) * 50),
  }));
}

export async function applyPriceChange(db: Db, productIds: string[], percent: number) {
  if (!Number.isFinite(percent) || percent < -90 || percent > 200 || percent === 0) {
    fail("validation", "Indiquez une variation entre −90 % et +200 %.");
  }
  const preview = await previewPriceChange(db, productIds, percent);
  await db.tx(async (tx) => {
    for (const r of preview) await tx.query("update variants set price = $2 where id = $1", [r.id, r.newPrice]);
    await tx.query("update products set updated_at = now() where id = any($1)", [productIds]);
  });
  return preview.length;
}

export async function setCategoryForProducts(db: Db, ids: string[], categoryId: string) {
  await db.query("update products set category_id = $2, updated_at = now() where id = any($1)", [ids, categoryId]);
}

// ——— Catégories ———

export interface CategoryInput {
  id?: string;
  name: string;
  description: string;
  slug?: string;
  imageUrl?: string | null;
  visible?: boolean;
  featured?: boolean;
}

/** Profil de saisie d'une catégorie ; `null` revient au profil par défaut. */
export async function saveCategoryProfile(db: Db, id: string, profile: CategoryProfile | null) {
  const r = await db.one<{ name: string }>("update categories set profile = $2 where id = $1 returning name", [
    id,
    profile ? JSON.stringify(profile) : null,
  ]);
  if (!r) fail("not_found", "Catégorie introuvable.");
  return r!.name;
}

export async function saveCategory(db: Db, input: CategoryInput) {
  if (!input.name.trim()) fail("validation", "Le nom est obligatoire.", { name: "Obligatoire." });
  const slug = slugify(input.slug?.trim() || input.name);
  if (!slug) fail("validation", "Adresse invalide.", { slug: "Lettres ou chiffres requis." });
  const clash = await db.one("select 1 from categories where slug = $1 and id <> $2", [slug, input.id ?? ""]);
  if (clash)
    fail("conflict", "Une catégorie utilise déjà cette adresse.", { slug: "Déjà utilisée.", name: "Déjà utilisé." });
  const values = [
    input.name.trim(),
    input.description.trim(),
    slug,
    input.imageUrl || null,
    input.visible ?? true,
    input.featured ?? false,
  ];
  if (input.id) {
    const r = await db.one(
      `update categories set name = $2, description = $3, slug = $4, image_url = $5, visible = $6, featured = $7
        where id = $1 returning id`,
      [input.id, ...values],
    );
    if (!r) fail("not_found", "Catégorie introuvable.");
    return input.id;
  }
  const id = newId();
  const pos = await db.one<{ n: number }>("select coalesce(max(position), 0)::int + 1 as n from categories");
  await db.query(
    `insert into categories (id, name, description, slug, image_url, visible, featured, position)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, ...values, pos!.n],
  );
  return id;
}

/** Déplace tous les produits d'une catégorie vers une autre (catégorie de destination non archivée). */
export async function moveCategoryProducts(db: Db, fromId: string, toId: string) {
  if (fromId === toId) fail("validation", "Choisissez une autre catégorie.");
  const to = await db.one("select 1 from categories where id = $1 and archived_at is null", [toId]);
  if (!to) fail("validation", "Catégorie de destination introuvable ou archivée.");
  const r = await db.query(
    "update products set category_id = $2, updated_at = now() where category_id = $1 returning id",
    [fromId, toId],
  );
  return r.length;
}

const categoryCount = async (db: Db, id: string) =>
  (await db.one<{ n: number }>("select count(*)::int as n from products where category_id = $1", [id]))?.n ?? 0;

/**
 * Archivage : la catégorie disparaît du site et des formulaires, sans rien
 * supprimer. Ses produits doivent d'abord être déplacés (moveTo).
 */
export async function archiveCategory(db: Db, id: string, opts: { moveTo?: string } = {}) {
  return db.tx(async (tx) => {
    if (opts.moveTo) await moveCategoryProducts(tx, id, opts.moveTo);
    const n = await categoryCount(tx, id);
    if (n)
      fail("conflict", `Cette catégorie contient ${n} produit(s) : choisissez où les déplacer avant de l'archiver.`);
    const r = await tx.one("update categories set archived_at = now(), featured = false where id = $1 returning id", [
      id,
    ]);
    if (!r) fail("not_found", "Catégorie introuvable.");
  });
}

export async function restoreCategory(db: Db, id: string) {
  const r = await db.one(
    "update categories set archived_at = null where id = $1 and archived_at is not null returning id",
    [id],
  );
  if (!r) fail("not_found", "Cette catégorie n'est pas archivée.");
}

export async function moveCategory(db: Db, id: string, direction: -1 | 1) {
  await db.tx(async (tx) => {
    const cats = await tx.query<{ id: string }>(
      "select id from categories where archived_at is null order by position, name",
    );
    const i = cats.findIndex((c) => c.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= cats.length) return;
    [cats[i], cats[j]] = [cats[j], cats[i]];
    for (const [pos, c] of cats.entries())
      await tx.query("update categories set position = $2 where id = $1", [c.id, pos]);
  });
}

/**
 * Suppression définitive : seulement une catégorie archivée et vide (produits
 * archivés et corbeille compris). L'historique des commandes n'en dépend pas
 * (désignations figées sur chaque ligne).
 */
export async function deleteCategory(db: Db, id: string, opts: { moveTo?: string } = {}) {
  return db.tx(async (tx) => {
    if (opts.moveTo) await moveCategoryProducts(tx, id, opts.moveTo);
    const n = await categoryCount(tx, id);
    if (n) fail("conflict", `Cette catégorie contient ${n} produit(s) : déplacez-les avant de la supprimer.`);
    const r = await tx.one<{ archived_at: Date | null }>("select archived_at from categories where id = $1", [id]);
    if (!r) return fail("not_found", "Catégorie introuvable.");
    if (!r.archived_at) fail("conflict", "Archivez d'abord la catégorie ; la suppression définitive se fait ensuite.");
    await tx.query("delete from categories where id = $1", [id]);
  });
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
  if (input.kind === "percent" && input.value >= 100) errors.value = "Moins de 100 %.";
  if (!(input.endsAt > input.startsAt)) errors.endsAt = "La fin doit suivre le début.";
  if (Object.keys(errors).length) fail("validation", "Vérifiez les champs signalés.", errors);
  if (input.id) {
    await db.query(
      "update promotions set name=$2, product_id=$3, kind=$4, value=$5, starts_at=$6, ends_at=$7 where id=$1",
      [input.id, input.name.trim(), input.productId, input.kind, input.value, input.startsAt, input.endsAt],
    );
    return input.id;
  }
  const id = newId();
  await db.query(
    "insert into promotions (id, name, product_id, kind, value, starts_at, ends_at) values ($1,$2,$3,$4,$5,$6,$7)",
    [id, input.name.trim(), input.productId, input.kind, input.value, input.startsAt, input.endsAt],
  );
  return id;
}

export async function stopPromotion(db: Db, id: string) {
  await db.query("update promotions set active = false where id = $1", [id]);
}

/** Sélection GPS : produits mis en avant, dans l'ordre donné. */
export async function setFeaturedSelection(db: Db, ids: string[]) {
  await db.tx(async (tx) => {
    await tx.query("update products set featured = false where featured and not (id = any($1))", [ids]);
    for (const [i, id] of ids.entries()) {
      await tx.query(
        "update products set featured = true, featured_position = $2 where id = $1 and status = 'published'",
        [id, i],
      );
    }
  });
}

/**
 * Désactivation en un geste (article manquant) : un produit désactivé disparaît du site et
 * de la caisse ; une version désactivée reste visible comme indisponible. Rien n'est supprimé.
 */
export async function setProductDisabled(db: Db, id: string, disabled: boolean) {
  const r = await db.one<{ name: string }>(
    "update products set disabled = $2, updated_at = now() where id = $1 and deleted_at is null returning name",
    [id, disabled],
  );
  if (!r) fail("not_found", "Produit introuvable.");
  return r!.name;
}

export async function setVariantDisabled(db: Db, variantId: string, disabled: boolean) {
  const r = await db.one<{ name: string; sku: string; product_id: string }>(
    `update variants v set disabled = $2 from products p
      where v.id = $1 and p.id = v.product_id and v.active returning p.name, v.sku, v.product_id`,
    [variantId, disabled],
  );
  if (!r) fail("not_found", "Version introuvable.");
  await db.query("update products set updated_at = now() where id = $1", [r!.product_id]);
  return `${r!.name} (${r!.sku})`;
}
