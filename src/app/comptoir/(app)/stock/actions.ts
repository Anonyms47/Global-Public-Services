"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { adjustStock, applyInventory, inventoryPreview, restock } from "@/server/domain/stock";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("validation", r.error.issues[0]?.message ?? "Données invalides.");
  return r.data;
}

const lines = z
  .array(
    z.object({
      variantId: z.string(),
      quantity: z.coerce.number().int().min(1, "Quantités entières positives."),
    }),
  )
  .min(1, "Ajoutez au moins un article.")
  .max(300);
const counts = z
  .array(
    z.object({
      variantId: z.string(),
      counted: z.coerce.number().int().min(0, "Quantités positives ou nulles."),
    }),
  )
  .min(1, "Saisissez au moins un comptage.")
  .max(2000);

export async function restockAction(input: unknown) {
  return guarded(
    "stock.restock",
    ({ db, user }) => {
      const d = parse(
        z.object({
          lines,
          reference: z.string().max(60),
          supplier: z.string().max(80),
          note: z.string().max(300),
        }),
        input,
      );
      return restock(db, { ...d, userId: user.id, isDemo: isDemoMode() });
    },
    { message: "Réapprovisionnement enregistré." },
  );
}

export async function inventoryPreviewAction(input: unknown) {
  return guarded("stock.inventory", ({ db }) => inventoryPreview(db, parse(counts, input)));
}

export async function inventoryApplyAction(input: unknown, note: string) {
  return guarded("stock.inventory", ({ db, user }) =>
    applyInventory(db, {
      counts: parse(counts, input),
      note: String(note ?? "").slice(0, 300),
      userId: user.id,
    }),
  );
}

export async function adjustAction(variantId: string, delta: number, reason: string) {
  return guarded(
    "stock.inventory",
    ({ db, user }) =>
      adjustStock(db, {
        variantId: String(variantId),
        delta: parse(z.coerce.number().int(), delta),
        reason: String(reason ?? "").slice(0, 200),
        userId: user.id,
      }),
    {
      message: "Ajustement enregistré.",
    },
  );
}
