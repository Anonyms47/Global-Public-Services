"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { audit } from "@/server/domain/audit";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import {
  applyPriceChange,
  codeClashes,
  archiveCategory,
  deleteCategory,
  restoreCategory,
  deleteOrArchiveProduct,
  purgeProduct,
  restoreProduct,
  restoreVersion,
  trashProduct,
  moveCategory,
  previewPriceChange,
  saveCategory,
  saveCategoryProfile,
  savePromotion,
  saveProduct,
  setCategoryForProducts,
  setProductsStatus,
  stopPromotion,
} from "@/server/domain/catalog";
import { can } from "@/lib/permissions";

const ids = z.array(z.string().min(1)).min(1, "Sélectionnez au moins un produit.").max(500);

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    throw new AppError("validation", r.error.issues[0]?.message ?? "Données invalides.", fieldErrors);
  }
  return r.data;
}

const productSchema = z.object({
  id: z.string().optional(),
  createId: z.string().uuid().optional(),
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9-]*$/, "Adresse : lettres minuscules, chiffres et tirets.")
    .optional(),
  warranty: z.string().max(200).optional(),
  expectedUpdatedAt: z.string().optional(),
  name: z.string().max(120),
  brand: z.string().max(60),
  model: z.string().max(80).optional(),
  details: z
    .object({
      short: z.string().max(300).optional(),
      highlights: z.array(z.string().max(160)).max(8).optional(),
      box: z.string().max(300).optional(),
      extra: z.string().max(1000).optional(),
    })
    .optional(),
  categoryId: z.string().nullable(),
  description: z.string().max(4000),
  specs: z
    .array(
      z.object({
        label: z.string().max(60),
        value: z.string().max(200),
        unit: z.string().max(20).optional(),
        private: z.boolean().optional(),
      }),
    )
    .max(40),
  condition: z.string().max(80).nullable(),
  axes: z.array(z.string().min(1).max(30)).max(3),
  images: z
    .array(
      z.object({
        url: z.string().regex(/^\/(demo|media)\/[\w./-]+$/, "Image invalide."),
        alt: z.string().max(200),
        color: z.string().max(40).nullable().optional(),
        kind: z.enum(["image", "video"]).optional(),
        source: z
          .object({
            url: z.string().max(2000),
            domain: z.string().max(200),
            fetchedAt: z.string().max(40),
            status: z.string().max(80),
            matches: z.string().max(160).optional(),
            license: z.string().max(200).optional(),
            rightsConfirmed: z.boolean().optional(),
          })
          .nullable()
          .optional(),
      }),
    )
    .max(12),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        sku: z.string().max(40),
        options: z.record(z.string(), z.string().max(40)),
        price: z.coerce.number().int().min(0),
        costPrice: z.coerce.number().int().min(0).nullable().optional(),
        initialStock: z.coerce.number().int().min(0).max(100000).optional(),
        lowStockThreshold: z.coerce.number().int().min(0).nullable().optional(),
        barcode: z
          .string()
          .max(40)
          .regex(/^[\w\s.-]*$/, "Code-barres : chiffres, lettres et tirets seulement.")
          .nullable()
          .optional(),
      }),
    )
    .max(120),
  status: z.enum(["draft", "published", "archived"]),
  featured: z.boolean(),
  publishAt: z.string().max(40).nullable().optional(),
  unpublishAt: z.string().max(40).nullable().optional(),
});

export async function saveProductAction(input: unknown) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const { expectedUpdatedAt, slug, ...data } = parse(productSchema, input);
    const withCosts = can(user, "catalog.costs");
    const before = data.id
      ? await db.one<{ status: string }>("select status from products where id = $1", [data.id])
      : null;
    const r = await saveProduct(
      db,
      { ...data, slug: slug || undefined, isDemo: data.id ? undefined : isDemoMode() },
      { userId: user.id, withCosts, expectedUpdatedAt },
    );
    // Journal : création, publication et retrait (le détail des prix et coûts est dans l'historique des versions).
    const action = !data.id
      ? "product.create"
      : before?.status !== data.status && data.status === "published"
        ? "product.publish"
        : before?.status === "published" && data.status !== "published"
          ? "product.unpublish"
          : "product.update";
    await audit(db, user.is_demo ? null : user.id, action, data.name, { id: r.id, status: data.status });
    return r;
  });
}

/** Références et codes-barres déjà utilisés par un autre produit (contrôle pendant la saisie). */
export async function checkCodesAction(input: unknown) {
  return guarded("catalog.edit", ({ db }) => {
    const d = parse(
      z.object({
        productId: z.string().nullable(),
        skus: z.array(z.string().max(40)).max(200),
        barcodes: z.array(z.string().max(40)).max(200),
      }),
      input,
    );
    return codeClashes(db, d, d.productId);
  });
}

export async function removeProductAction(id: string) {
  return guarded("catalog.edit", ({ db }) => deleteOrArchiveProduct(db, String(id)));
}

export async function bulkStatusAction(productIds: string[], status: "draft" | "published" | "archived") {
  return guarded("catalog.bulk", ({ db }) =>
    setProductsStatus(db, parse(ids, productIds), parse(z.enum(["draft", "published", "archived"]), status)),
  );
}

export async function bulkCategoryAction(productIds: string[], categoryId: string) {
  return guarded("catalog.bulk", ({ db }) => setCategoryForProducts(db, parse(ids, productIds), String(categoryId)), {
    message: "Catégorie mise à jour.",
  });
}

export async function pricePreviewAction(productIds: string[], percent: number) {
  return guarded("catalog.bulk", ({ db }) =>
    previewPriceChange(db, parse(ids, productIds), parse(z.coerce.number().min(-90).max(200), percent)),
  );
}

export async function priceApplyAction(productIds: string[], percent: number) {
  return guarded("catalog.bulk", ({ db }) =>
    applyPriceChange(db, parse(ids, productIds), parse(z.coerce.number(), percent)),
  );
}

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().max(60),
  description: z.string().max(300),
  slug: z.string().max(80).optional(),
  imageUrl: z
    .string()
    .max(300)
    .regex(/^(\/media\/[0-9a-f-]{36}|\/demo\/[\w./-]+)?$/, "Image de la médiathèque attendue.")
    .nullable()
    .optional(),
  visible: z.boolean().optional(),
  featured: z.boolean().optional(),
});

export async function saveCategoryAction(input: unknown) {
  return guarded(
    "catalog.edit",
    async ({ db, user }) => {
      const d = parse(categorySchema, input);
      const id = await saveCategory(db, d);
      await audit(db, user.is_demo ? null : user.id, d.id ? "category.update" : "category.create", d.name);
      return { id };
    },
    { message: "Catégorie enregistrée." },
  );
}

const profileSchema = z
  .object({
    fields: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(40),
          options: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
        }),
      )
      .max(30),
    variantAxes: z.array(z.string().trim().min(1).max(30)).max(6),
  })
  .nullable();

/** Profil de saisie d'une catégorie : réservé au propriétaire. */
export async function saveCategoryProfileAction(id: string, input: unknown) {
  return guarded(
    "settings.edit",
    async ({ db, user }) => {
      const profile = parse(profileSchema, input);
      const name = await saveCategoryProfile(db, String(id), profile);
      await audit(db, user.is_demo ? null : user.id, "category.profile", name, { profile });
      return { ok: true };
    },
    { message: "Profil de la catégorie enregistré." },
  );
}

export async function moveCategoryAction(id: string, direction: -1 | 1) {
  return guarded("catalog.edit", ({ db }) => moveCategory(db, String(id), direction === -1 ? -1 : 1));
}

const moveTo = (v: unknown) => (typeof v === "string" && v ? v : undefined);

export async function archiveCategoryAction(id: string, target?: string) {
  return guarded(
    "catalog.edit",
    async ({ db, user }) => {
      await archiveCategory(db, String(id), { moveTo: moveTo(target) });
      await audit(db, user.is_demo ? null : user.id, "category.archive", String(id), {
        moveTo: moveTo(target) ?? null,
      });
    },
    { message: "Catégorie archivée : elle n'apparaît plus sur le site." },
  );
}

export async function restoreCategoryAction(id: string) {
  return guarded("catalog.edit", ({ db }) => restoreCategory(db, String(id)), { message: "Catégorie restaurée." });
}

export async function deleteCategoryAction(id: string, target?: string) {
  return guarded(
    "catalog.bulk",
    async ({ db, user }) => {
      await deleteCategory(db, String(id), { moveTo: moveTo(target) });
      await audit(db, user.is_demo ? null : user.id, "category.delete", String(id));
    },
    { message: "Catégorie supprimée définitivement." },
  );
}

export async function savePromotionAction(input: unknown) {
  return guarded(
    "catalog.edit",
    ({ db }) => {
      const d = parse(
        z.object({
          id: z.string().optional(),
          name: z.string().max(80),
          productId: z.string(),
          kind: z.enum(["percent", "amount"]),
          value: z.coerce.number().int(),
          startsAt: z.string(),
          endsAt: z.string(),
        }),
        input,
      );
      const startsAt = new Date(d.startsAt);
      const endsAt = new Date(d.endsAt);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()))
        throw new AppError("validation", "Dates invalides.");
      return savePromotion(db, { ...d, startsAt, endsAt });
    },
    { message: "Promotion enregistrée." },
  );
}

export async function stopPromotionAction(id: string) {
  return guarded("catalog.edit", ({ db }) => stopPromotion(db, String(id)), {
    message: "Promotion arrêtée.",
  });
}

export async function trashProductAction(id: string) {
  return guarded("catalog.edit", ({ db }) => trashProduct(db, String(id)), {
    message: "Produit mis à la corbeille. Il reste restaurable.",
  });
}

/** Corbeille groupée : chaque produit reste restaurable individuellement. */
export async function bulkTrashAction(productIds: string[]) {
  return guarded(
    "catalog.bulk",
    async ({ db }) => {
      const list = parse(ids, productIds);
      for (const id of list) await trashProduct(db, id);
      return list.length;
    },
    { message: "Produits mis à la corbeille. Ils restent restaurables." },
  );
}

export async function restoreProductAction(id: string) {
  return guarded("catalog.edit", ({ db }) => restoreProduct(db, String(id)), {
    message: "Produit restauré en brouillon.",
  });
}

export async function purgeProductAction(id: string) {
  return guarded("catalog.bulk", ({ db }) => purgeProduct(db, String(id)), {
    message: "Produit supprimé définitivement.",
  });
}

export async function restoreVersionAction(versionId: string) {
  return guarded(
    "catalog.edit",
    ({ db, user }) => restoreVersion(db, String(versionId), { userId: user.id, withCosts: can(user, "catalog.costs") }),
    { message: "Version restaurée. La version remplacée reste dans l'historique." },
  );
}

/** Produits peut-être en double pendant la saisie du nom (aucune fusion automatique). */
export async function similarProductsAction(name: string, excludeId: string | null) {
  return guarded("catalog.edit", async ({ db }) => {
    const { similarProducts } = await import("@/server/domain/catalog-entry");
    return similarProducts(db, String(name ?? "").slice(0, 120), excludeId ? String(excludeId) : null);
  });
}

/** Photo téléchargée depuis une adresse https, rangée dans le stockage GPS avec sa provenance. */
export async function importMediaUrlAction(input: unknown) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const d = parse(
      z.object({
        url: z.string().max(2000),
        matches: z.string().max(160).optional(),
        license: z.string().max(200).optional(),
      }),
      input,
    );
    const { importMediaFromUrl } = await import("@/server/domain/catalog-entry");
    const r = await importMediaFromUrl(db, { ...d, userId: user.is_demo ? null : user.id, isDemo: user.is_demo });
    await audit(db, user.is_demo ? null : user.id, "media.import_url", r.source.domain, {
      url: r.source.url,
      media: r.id,
    });
    return r;
  });
}

/** Vérifications d'une fiche importée marquées comme faites. */
export async function markChecksDoneAction(productId: string) {
  return guarded(
    "catalog.edit",
    async ({ db, user }) => {
      const { markChecksDone } = await import("@/server/domain/catalog-entry");
      await markChecksDone(db, String(productId), { id: user.is_demo ? null : user.id, name: user.name });
    },
    { message: "Vérifications notées comme faites." },
  );
}

/** Modification rapide d'un prix ou d'un seuil depuis le catalogue. */
export async function quickVariantAction(input: unknown) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const d = parse(
      z.object({
        variantId: z.string().min(1),
        price: z.coerce.number().int().min(0).optional(),
        lowStockThreshold: z.coerce.number().int().min(0).nullable().optional(),
      }),
      input,
    );
    const { quickUpdateVariant } = await import("@/server/domain/catalog-entry");
    await quickUpdateVariant(db, d, user.is_demo ? null : user.id);
  });
}

/** Variantes d'un produit pour la modification rapide depuis le catalogue. */
export async function quickVariantsAction(productId: string) {
  return guarded("catalog.edit", async ({ db }) => {
    const rows = await db.query<{
      id: string;
      sku: string;
      options: Record<string, string>;
      price: number;
      low_stock_threshold: number | null;
      on_hand: number;
      reserved: number;
      disabled: boolean;
    }>(
      `select id, sku, options, price, low_stock_threshold, on_hand, reserved, disabled from variants
        where product_id = $1 and active order by position`,
      [String(productId)],
    );
    return rows.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: Object.values(v.options ?? {}).join(" · "),
      price: v.price,
      threshold: v.low_stock_threshold,
      onHand: v.on_hand,
      reserved: v.reserved,
      disabled: v.disabled,
    }));
  });
}

/** Saisie en grille : prix, coût (propriétaire) et stock compté de plusieurs variantes d'un coup. */
export async function entryGridSaveAction(input: unknown) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const n = z.coerce.number().int().min(0).max(100_000_000);
    const d = parse(
      z.object({
        changes: z
          .array(
            z.object({
              variantId: z.string().min(1),
              price: n.optional(),
              cost: n.nullable().optional(),
              counted: n.optional(),
            }),
          )
          .min(1, "Aucune modification à enregistrer.")
          .max(1000),
      }),
      input,
    );
    const { saveEntryGrid } = await import("@/server/domain/catalog-entry");
    const r = await saveEntryGrid(db, {
      changes: d.changes,
      canCosts: can(user, "catalog.costs"),
      canCount: can(user, "stock.inventory"),
      userId: user.id,
    });
    const parts = [
      r.prices ? `${r.prices} prix` : "",
      r.costs ? `${r.costs} coût${r.costs > 1 ? "s" : ""}` : "",
      r.stock ? `${r.stock} stock${r.stock > 1 ? "s" : ""}` : "",
    ].filter(Boolean);
    return { ...r, message: parts.length ? `Enregistré : ${parts.join(", ")}.` : "Rien n'a changé." };
  });
}

/** Produit manquant : désactivé (masqué du site et de la caisse) ou réactivé. Journalisé. */
export async function setProductDisabledAction(productId: string, disabled: boolean) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const { setProductDisabled } = await import("@/server/domain/catalog");
    const name = await setProductDisabled(db, String(productId), !!disabled);
    await audit(db, user.is_demo ? null : user.id, disabled ? "product.disable" : "product.enable", name);
    return { disabled: !!disabled, message: disabled ? `${name} : désactivé.` : `${name} : réactivé.` };
  });
}

/** Version manquante : proposée comme indisponible, ou de nouveau disponible. Journalisé. */
export async function setVariantDisabledAction(variantId: string, disabled: boolean) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const { setVariantDisabled } = await import("@/server/domain/catalog");
    const label = await setVariantDisabled(db, String(variantId), !!disabled);
    await audit(db, user.is_demo ? null : user.id, disabled ? "variant.disable" : "variant.enable", label);
    return { disabled: !!disabled };
  });
}
