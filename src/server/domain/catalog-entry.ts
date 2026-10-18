import type { Db } from "../db/client";
import { AppError, fail } from "./errors";
import { audit } from "./audit";
import { storeMedia } from "./media";
import { applyInventory, stockTracking } from "./stock";
import { publicationIssues, type MediaSource, type Spec } from "./catalog";
import { nameSimilarity, nameTokens } from "@/lib/product-kit";

/**
 * Saisie et complétion des fiches : produits peut-être en double, photo importée
 * depuis une adresse (avec sa provenance), liste des produits à compléter,
 * modifications et comptage rapides. Aucune donnée n'est inventée ni publiée.
 */

// ——— Produits peut-être en double ———

export interface SimilarProduct {
  id: string;
  name: string;
  brand: string;
  model: string;
  status: string;
  category: string | null;
  variants: number;
  minPrice: number;
  score: number;
}

export async function similarProducts(db: Db, name: string, excludeId: string | null): Promise<SimilarProduct[]> {
  const words = nameTokens(name).filter((w) => w.length >= 3);
  if (nameTokens(name).length < 2 || !words.length) return [];
  const rows = await db.query<Omit<SimilarProduct, "score">>(
    `select p.id, p.name, p.brand, p.model, p.status, c.name as category,
            (select count(*)::int from variants v where v.product_id = p.id and v.active) as variants,
            coalesce((select min(v.price)::int from variants v where v.product_id = p.id and v.active), 0) as "minPrice"
       from products p left join categories c on c.id = p.category_id
      where p.deleted_at is null and p.id <> $1
        and (${words.map((_, i) => `lower(p.name || ' ' || p.brand || ' ' || p.model) like $${i + 2}`).join(" or ")})
      limit 50`,
    [excludeId ?? "", ...words.map((w) => `%${w}%`)],
  );
  return rows
    .map((r) => ({ ...r, score: nameSimilarity(name, `${r.name} ${r.brand} ${r.model}`) }))
    .filter((r) => r.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ——— Photo importée depuis une adresse ———

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;

/**
 * Télécharge une image (https seulement, adresses internes refusées), contrôle son
 * contenu réel, la range dans le stockage GPS et renvoie sa provenance. Le lien
 * externe n'est jamais utilisé tel quel sur le site.
 */
export async function importMediaFromUrl(
  db: Db,
  input: { url: string; userId: string | null; isDemo: boolean; matches?: string; license?: string },
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; url: string; mime: string; source: MediaSource }> {
  let u: URL;
  try {
    u = new URL(input.url.trim());
  } catch {
    return fail("validation", "Adresse invalide.", { url: "Adresse invalide." });
  }
  if (u.protocol !== "https:") fail("validation", "Seules les adresses https:// sont acceptées.", { url: "https://…" });
  if (PRIVATE_HOST.test(u.hostname)) fail("validation", "Adresse refusée.", { url: "Adresse refusée." });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let bytes: Uint8Array;
  let finalUrl = u;
  try {
    const res = await fetcher(u, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { accept: "image/jpeg,image/png,image/webp" },
    });
    finalUrl = new URL(res.url || u.href);
    if (finalUrl.protocol !== "https:" || PRIVATE_HOST.test(finalUrl.hostname)) fail("validation", "Adresse refusée.");
    if (!res.ok) fail("validation", `Image introuvable à cette adresse (erreur ${res.status}).`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 8 * 1024 * 1024) fail("validation", "Image trop lourde.");
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    if (e instanceof AppError) throw e;
    return fail("validation", "Téléchargement impossible : vérifiez l'adresse de l'image.");
  } finally {
    clearTimeout(timer);
  }
  const name = decodeURIComponent(finalUrl.pathname.split("/").pop() || "image").slice(0, 120);
  // storeMedia vérifie le type réel (JPEG, PNG, WebP) et la taille.
  const stored = await storeMedia(db, { bytes, name, userId: input.userId, isDemo: input.isDemo, imagesOnly: true });
  const source: MediaSource = {
    url: u.href,
    domain: u.hostname.replace(/^www\./, ""),
    fetchedAt: new Date().toISOString(),
    status: "Photo trouvée sur Internet",
    ...(input.matches?.trim() ? { matches: input.matches.trim().slice(0, 160) } : {}),
    ...(input.license?.trim() ? { license: input.license.trim().slice(0, 200) } : {}),
  };
  return { ...stored, source };
}

// ——— Produits à compléter ———

export type ToCompleteFilter =
  "sans-photo" | "sans-prix" | "sans-cout" | "sans-stock" | "sans-garantie" | "a-verifier" | "variantes" | "pret";

export const toCompleteFilters: [ToCompleteFilter, string][] = [
  ["sans-photo", "Sans photo"],
  ["sans-prix", "Sans prix"],
  ["sans-cout", "Sans coût"],
  ["sans-stock", "Sans stock"],
  ["sans-garantie", "Sans garantie"],
  ["a-verifier", "Caractéristiques à vérifier"],
  ["variantes", "Variantes incomplètes"],
  ["pret", "Prêt à publier"],
];

export interface ToCompleteRow {
  id: string;
  name: string;
  brand: string;
  model: string;
  category: string | null;
  photo: string | null;
  internetPhotos: number;
  variants: number;
  flags: ToCompleteFilter[];
  checks: string[];
  checksDone: boolean;
  notes: string | null;
}

/** Brouillons à compléter, avec ce qui manque à chacun (le coût n'est compté que pour le propriétaire). */
export async function listToComplete(db: Db, opts: { canCosts: boolean }) {
  const products = await db.query<{
    id: string;
    name: string;
    brand: string;
    model: string;
    category_id: string | null;
    category: string | null;
    warranty: string;
    description: string;
    axes: string[];
    internal: Record<string, unknown>;
  }>(
    `select p.id, p.name, p.brand, p.model, p.category_id, c.name as category, p.warranty, p.description, p.axes, p.internal
       from products p left join categories c on c.id = p.category_id
      where p.deleted_at is null and p.status = 'draft'
      order by c.position nulls last, p.name`,
  );
  if (!products.length) return { rows: [] as ToCompleteRow[], total: 0, complete: 0 };
  const ids = products.map((p) => p.id);
  const tracking = await stockTracking(db);
  const [variants, images] = await Promise.all([
    db.query<{
      product_id: string;
      sku: string;
      price: number;
      cost_price: number | null;
      on_hand: number;
      options: Record<string, string>;
    }>(
      "select product_id, sku, price, cost_price, on_hand, options from variants where product_id = any($1) and active",
      [ids],
    ),
    db.query<{ product_id: string; url: string; kind: string; source: { rightsConfirmed?: boolean } | null }>(
      "select product_id, url, kind, source from product_images where product_id = any($1) order by position",
      [ids],
    ),
  ]);
  const rows: ToCompleteRow[] = products.map((p) => {
    const vs = variants.filter((v) => v.product_id === p.id);
    const imgs = images.filter((i) => i.product_id === p.id);
    const photos = imgs.filter((i) => i.kind !== "video");
    const checks = Array.isArray(p.internal?.humanChecks) ? (p.internal.humanChecks as string[]) : [];
    const checksDone = !!p.internal?.checksDoneAt;
    const flags: ToCompleteFilter[] = [];
    if (!photos.length) flags.push("sans-photo");
    if (!vs.length || vs.some((v) => !(v.price > 0))) flags.push("sans-prix");
    if (opts.canCosts && vs.some((v) => v.cost_price == null)) flags.push("sans-cout");
    if (tracking && !vs.some((v) => v.on_hand > 0)) flags.push("sans-stock");
    if (!p.warranty?.trim()) flags.push("sans-garantie");
    if (p.internal?.needsHumanReview && !checksDone) flags.push("a-verifier");
    if ((p.axes ?? []).length && vs.some((v) => (p.axes ?? []).some((a) => !v.options?.[a]?.trim())))
      flags.push("variantes");
    const blocking = publicationIssues({
      name: p.name,
      categoryId: p.category_id,
      description: p.description,
      axes: p.axes ?? [],
      images: photos.map((i) => ({ kind: "image" as const, source: i.source ?? null })),
      variants: vs.map((v) => ({ sku: v.sku, price: v.price, options: v.options })),
    });
    if (!blocking.length) flags.push("pret");
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      model: p.model || String(p.internal?.model ?? ""),
      category: p.category,
      photo: photos[0]?.url ?? null,
      internetPhotos: imgs.filter((i) => i.source).length,
      variants: vs.length,
      flags,
      checks,
      checksDone,
      notes: (p.internal?.notes as string) ?? null,
    };
  });
  return { rows, total: rows.length, complete: rows.filter((r) => r.flags.includes("pret")).length };
}

/** Vérifications de la fiche importée marquées comme faites (journalisé, rien n'est supprimé). */
export async function markChecksDone(db: Db, productId: string, user: { id: string | null; name: string }) {
  const r = await db.one<{ name: string }>(
    `update products set internal = internal || jsonb_build_object('checksDoneAt', now()::text, 'checksDoneBy', $2::text)
      where id = $1 and internal->>'externalKey' is not null returning name`,
    [productId, user.name],
  );
  if (!r) fail("not_found", "Fiche importée introuvable.");
  await audit(db, user.id, "product.checks_done", r!.name, { id: productId });
}

// ——— Caractéristiques déjà utilisées (réutilisables pour la catégorie) ———

export async function specLabelsByCategory(db: Db) {
  const rows = await db.query<{ category_id: string; specs: Spec[] }>(
    "select category_id, specs from products where category_id is not null and deleted_at is null",
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    for (const s of r.specs ?? []) {
      if (!s.label?.trim()) continue;
      const list = (map[r.category_id] ??= []);
      if (!list.includes(s.label.trim())) list.push(s.label.trim());
    }
  }
  return map;
}

// ——— Modifications et comptage rapides ———

/** Prix ou seuil d'une variante modifié depuis le catalogue : journalisé avec l'ancienne valeur. */
export async function quickUpdateVariant(
  db: Db,
  input: { variantId: string; price?: number; lowStockThreshold?: number | null },
  userId: string | null,
) {
  const v = await db.one<{
    price: number;
    low_stock_threshold: number | null;
    sku: string;
    name: string;
    status: string;
  }>(
    `select v.price, v.low_stock_threshold, v.sku, p.name, p.status from variants v join products p on p.id = v.product_id
      where v.id = $1 and v.active`,
    [input.variantId],
  );
  if (!v) return fail("not_found", "Variante introuvable.");
  if (input.price !== undefined) {
    if (!Number.isInteger(input.price) || input.price < 0) fail("validation", "Prix invalide.");
    if (v.status === "published" && input.price === 0) fail("validation", "Un produit en ligne doit garder un prix.");
  }
  if (input.lowStockThreshold != null && (!Number.isInteger(input.lowStockThreshold) || input.lowStockThreshold < 0))
    fail("validation", "Seuil invalide.");
  await db.query(
    `update variants set price = coalesce($2, price),
            low_stock_threshold = case when $3::boolean then $4 else low_stock_threshold end where id = $1`,
    [input.variantId, input.price ?? null, input.lowStockThreshold !== undefined, input.lowStockThreshold ?? null],
  );
  await db.query("update products set updated_at = now() where id = (select product_id from variants where id = $1)", [
    input.variantId,
  ]);
  await audit(db, userId, "variant.quick_update", `${v.name} (${v.sku})`, {
    variantId: input.variantId,
    ...(input.price !== undefined ? { price: { from: v.price, to: input.price } } : {}),
    ...(input.lowStockThreshold !== undefined
      ? { lowStockThreshold: { from: v.low_stock_threshold, to: input.lowStockThreshold } }
      : {}),
  });
}

/**
 * Comptage rapide : nouvelle quantité d'une variante. Passe par l'inventaire, qui
 * enregistre un mouvement (ancienne → nouvelle quantité, écart, utilisateur, date, motif)
 * sur le stock unique de l'entreprise.
 */
export async function quickCount(
  db: Db,
  input: { variantId: string; counted: number; reason: string; userId: string },
) {
  if (!input.reason.trim()) fail("validation", "Indiquez le motif du comptage.", { reason: "Obligatoire." });
  const before = await db.one<{ on_hand: number }>("select on_hand from variants where id = $1", [input.variantId]);
  if (!before) return fail("not_found", "Variante introuvable.");
  const r = await applyInventory(db, {
    counts: [{ variantId: input.variantId, counted: input.counted }],
    note: input.reason.trim(),
    userId: input.userId,
  });
  return { before: before.on_hand, after: input.counted, delta: input.counted - before.on_hand, changed: r.changed };
}

// ——— Saisie en grille : prix, coût et stock de plusieurs variantes d'un coup ———

export interface GridRow {
  variantId: string;
  productId: string;
  product: string;
  status: string;
  category: string | null;
  label: string;
  sku: string;
  photo: string | null;
  price: number;
  /** Coût d'achat : absent pour qui n'a pas le droit de le voir. */
  cost?: number | null;
  onHand: number;
  /** Quantité en dessous de laquelle un comptage est refusé (réservé + non vendable). */
  locked: number;
}

/** Variantes des brouillons (ou de tout le catalogue) dans l'ordre du catalogue. */
export async function listEntryGrid(db: Db, opts: { canCosts: boolean; includePublished?: boolean }) {
  const rows = await db.query<{
    variant_id: string;
    product_id: string;
    product: string;
    status: string;
    category: string | null;
    options: Record<string, string>;
    sku: string;
    photo: string | null;
    price: number;
    cost_price: number | null;
    on_hand: number;
    reserved: number;
    unsellable: number;
  }>(
    `select v.id as variant_id, p.id as product_id, p.name as product, p.status, c.name as category, v.options, v.sku,
            (select i.url from product_images i where i.product_id = p.id and i.kind <> 'video' order by i.position limit 1) as photo,
            v.price, v.cost_price, v.on_hand, v.reserved, v.unsellable
       from variants v join products p on p.id = v.product_id left join categories c on c.id = p.category_id
      where v.active and p.deleted_at is null
        and (p.status = 'draft' or ($1::boolean and p.status = 'published'))
      order by c.position nulls last, p.name, v.position`,
    [!!opts.includePublished],
  );
  return rows.map<GridRow>((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    product: r.product,
    status: r.status,
    category: r.category,
    label: Object.values(r.options ?? {})
      .filter(Boolean)
      .join(" · "),
    sku: r.sku,
    photo: r.photo,
    price: r.price,
    ...(opts.canCosts ? { cost: r.cost_price } : {}),
    onHand: r.on_hand,
    locked: r.reserved + r.unsellable,
  }));
}

export interface GridChange {
  variantId: string;
  price?: number;
  cost?: number | null;
  counted?: number;
}

/**
 * Enregistre en une fois les valeurs tapées dans la grille. Chaque valeur vient d'une
 * saisie humaine ; les prix et coûts sont journalisés avec l'ancienne valeur, le stock
 * passe par l'inventaire (un mouvement tracé par variante). Rien n'est publié.
 */
export async function saveEntryGrid(
  db: Db,
  input: { changes: GridChange[]; canCosts: boolean; canCount: boolean; userId: string },
) {
  const changes = input.changes.filter(
    (c) => c.price !== undefined || (input.canCosts && c.cost !== undefined) || c.counted !== undefined,
  );
  if (!changes.length) fail("validation", "Aucune modification à enregistrer.");
  if (!input.canCount && changes.some((c) => c.counted !== undefined))
    fail("forbidden", "Le comptage du stock n'est pas autorisé pour ce compte.");
  const ids = changes.map((c) => c.variantId);
  const current = await db.query<{
    id: string;
    price: number;
    cost_price: number | null;
    sku: string;
    name: string;
    status: string;
  }>(
    `select v.id, v.price, v.cost_price, v.sku, p.name, p.status from variants v join products p on p.id = v.product_id
      where v.id = any($1) and v.active and p.deleted_at is null`,
    [ids],
  );
  const byId = new Map(current.map((v) => [v.id, v]));
  const int = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100_000_000;
  for (const c of changes) {
    const v = byId.get(c.variantId);
    if (!v) fail("not_found", "Une des variantes n'existe plus : rechargez la page.");
    if (c.price !== undefined && !int(c.price)) fail("validation", `Réf. ${v!.sku} : prix invalide.`);
    if (c.price === 0 && v!.status === "published")
      fail("validation", `${v!.name} est en ligne : il doit garder un prix.`);
    if (input.canCosts && c.cost != null && !int(c.cost)) fail("validation", `Réf. ${v!.sku} : coût invalide.`);
    if (c.counted !== undefined && !int(c.counted)) fail("validation", `Réf. ${v!.sku} : quantité invalide.`);
  }
  let prices = 0;
  let costs = 0;
  await db.tx(async (tx) => {
    for (const c of changes) {
      const v = byId.get(c.variantId)!;
      const price = c.price !== undefined && c.price !== v.price ? c.price : undefined;
      const cost = input.canCosts && c.cost !== undefined && c.cost !== v.cost_price ? c.cost : undefined;
      if (price === undefined && cost === undefined) continue;
      await tx.query(
        `update variants set price = coalesce($2, price),
                cost_price = case when $3::boolean then $4 else cost_price end where id = $1`,
        [c.variantId, price ?? null, cost !== undefined, cost ?? null],
      );
      await tx.query(
        "update products set updated_at = now() where id = (select product_id from variants where id = $1)",
        [c.variantId],
      );
      if (price !== undefined) prices++;
      if (cost !== undefined) costs++;
      await audit(tx, input.userId, "variant.grid_update", `${v.name} (${v.sku})`, {
        variantId: c.variantId,
        ...(price !== undefined ? { price: { from: v.price, to: price } } : {}),
        // Le coût n'est jamais recopié dans le journal : seul le fait qu'il a changé est noté.
        ...(cost !== undefined ? { cost: "modifié" } : {}),
      });
    }
  });
  const counts = changes
    .filter((c) => c.counted !== undefined)
    .map((c) => ({ variantId: c.variantId, counted: c.counted! }));
  const stock = counts.length
    ? (await applyInventory(db, { counts, note: "Saisie en grille", userId: input.userId })).changed
    : 0;
  return { prices, costs, stock };
}
