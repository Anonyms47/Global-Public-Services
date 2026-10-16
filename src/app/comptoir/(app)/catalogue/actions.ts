"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { MEDIA_MAX_BYTES, storeMedia } from "@/server/domain/media";
import {
  applyPriceChange,
  deleteCategory,
  deleteOrArchiveProduct,
  duplicateProduct,
  purgeProduct,
  restoreProduct,
  restoreVersion,
  trashProduct,
  moveCategory,
  previewPriceChange,
  saveCategory,
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
  expectedUpdatedAt: z.string().optional(),
  name: z.string().max(120),
  brand: z.string().max(60),
  categoryId: z.string().nullable(),
  description: z.string().max(4000),
  specs: z.array(z.object({ label: z.string().max(60), value: z.string().max(200) })).max(30),
  condition: z.string().max(80).nullable(),
  axes: z.array(z.string().min(1).max(30)).max(3),
  images: z
    .array(
      z.object({
        url: z.string().regex(/^\/(demo|media)\/[\w./-]+$/, "Image invalide."),
        alt: z.string().max(200),
        color: z.string().max(40).nullable().optional(),
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
    const { expectedUpdatedAt, ...data } = parse(productSchema, input);
    const withCosts = can(user, "catalog.costs");
    return saveProduct(
      db,
      { ...data, isDemo: data.id ? undefined : isDemoMode() },
      { userId: user.id, withCosts, expectedUpdatedAt },
    );
  });
}

export async function duplicateProductAction(id: string) {
  return guarded("catalog.edit", ({ db, user }) => duplicateProduct(db, String(id), user.id), {
    message: "Copie créée en brouillon.",
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

/** Téléversement de photo : JPEG, PNG ou WebP, 3 Mo au plus, type vérifié sur le contenu. */
export async function uploadImageAction(formData: FormData) {
  return guarded("catalog.edit", async ({ db, user }) => {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("validation", "Aucun fichier reçu.");
    if (file.size > MEDIA_MAX_BYTES) throw new AppError("validation", "Photo trop lourde (3 Mo maximum).");
    const r = await storeMedia(db, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      userId: user.id,
      isDemo: isDemoMode(),
      imagesOnly: true,
    });
    return { url: r.url };
  });
}

export async function saveCategoryAction(input: unknown) {
  return guarded(
    "catalog.edit",
    ({ db }) =>
      saveCategory(
        db,
        parse(
          z.object({
            id: z.string().optional(),
            name: z.string().max(60),
            description: z.string().max(300),
          }),
          input,
        ),
      ),
    {
      message: "Catégorie enregistrée.",
    },
  );
}

export async function moveCategoryAction(id: string, direction: -1 | 1) {
  return guarded("catalog.edit", ({ db }) => moveCategory(db, String(id), direction === -1 ? -1 : 1));
}

export async function deleteCategoryAction(id: string) {
  return guarded("catalog.edit", ({ db }) => deleteCategory(db, String(id)), {
    message: "Catégorie supprimée.",
  });
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
