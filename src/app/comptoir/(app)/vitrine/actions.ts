"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { AppError } from "@/server/domain/errors";
import { getSettings, saveSettingsSection } from "@/server/domain/settings";
import { setFeaturedSelection } from "@/server/domain/catalog";
import { deleteService, saveService } from "@/server/domain/services";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("validation", r.error.issues[0]?.message ?? "Données invalides.");
  return r.data;
}

export async function saveStorefrontAction(input: unknown) {
  return guarded(
    "storefront.edit",
    async ({ db }) => {
      const d = parse(
        z.object({
          heroProductId: z.string().nullable(),
          focusProductId: z.string().nullable(),
          focusText: z.string().max(600),
          storeText: z.string().max(1200),
          storePhotoUrl: z.string().regex(/^(\/media\/[\w-]+)?$/, "Photo invalide."),
          selection: z.array(z.string()).max(12),
        }),
        input,
      );
      const s = await getSettings(db);
      await saveSettingsSection(db, "storefront", {
        heroProductId: d.heroProductId,
        focusProductId: d.focusProductId,
        focusText: d.focusText,
      });
      await saveSettingsSection(db, "company", {
        ...s.company,
        storeText: d.storeText,
        storePhotoUrl: d.storePhotoUrl,
      });
      await setFeaturedSelection(db, d.selection);
    },
    { message: "Vitrine mise à jour." },
  );
}

const serviceSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(80),
  summary: z.string().max(400),
  operators: z.string().max(300),
  operations: z.string().max(300),
  hours: z.string().max(200),
  confirmed: z.boolean(),
});

export async function saveServiceAction(input: unknown) {
  return guarded("storefront.edit", ({ db }) => saveService(db, parse(serviceSchema, input)), {
    message: "Service enregistré.",
  });
}

export async function deleteServiceAction(id: string) {
  return guarded("storefront.edit", ({ db }) => deleteService(db, String(id)), {
    message: "Service supprimé.",
  });
}
