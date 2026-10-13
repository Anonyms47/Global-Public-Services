"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { getSettings, saveSettingsSection } from "@/server/domain/settings";
import { createUser, updateUser } from "@/server/domain/auth";
import { purgeDemo } from "@/server/demo/seed";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[i.path.join(".")] ??= i.message;
    throw new AppError("validation", r.error.issues[0]?.message ?? "Données invalides.", fieldErrors);
  }
  return r.data;
}

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim());

const settingsSchema = z.object({
  company: z.object({
    name: text(120),
    whatsapp: z
      .string()
      .transform((s) => s.replace(/\D/g, ""))
      .refine(
        (s) => s === "" || (s.length >= 8 && s.length <= 15),
        "Numéro WhatsApp : format international, indicatif compris (8 à 15 chiffres).",
      ),
    phone: text(40),
    email: z
      .string()
      .trim()
      .max(120)
      .refine((s) => s === "" || /^\S+@\S+\.\S+$/.test(s), "Adresse e-mail invalide."),
    address: text(200),
    city: text(80),
    hours: text(200),
    mapsUrl: z
      .string()
      .trim()
      .max(500)
      .refine((s) => s === "" || /^https:\/\//.test(s), "Le lien d'itinéraire doit commencer par https://"),
  }),
  reception: z.object({
    pickupEnabled: z.boolean(),
    pickupDetails: text(300),
    deliveryEnabled: z.boolean(),
    deliveryDetails: text(300),
    zones: z
      .array(
        z.object({
          name: text(60).refine((s) => s.length > 0, "Nom de zone requis."),
          fee: z.number().int().min(0).nullable(),
        }),
      )
      .max(40),
  }),
  policies: z.object({
    warranty: text(1000),
    returns: text(1000),
    payment: text(600),
  }),
  stock: z.object({
    defaultLowThreshold: z.coerce.number().int().min(0).max(1000),
  }),
  receipt: z.object({ header: text(200), footer: text(200) }),
});

export async function saveSettingsAction(input: unknown) {
  return guarded(
    "settings.edit",
    async ({ db }) => {
      const d = parse(settingsSchema, input);
      const s = await getSettings(db);
      await db.tx(async (tx) => {
        await saveSettingsSection(tx, "company", {
          ...s.company,
          ...d.company,
          slogan: s.company.slogan,
        });
        await saveSettingsSection(tx, "reception", d.reception);
        await saveSettingsSection(tx, "policies", d.policies);
        await saveSettingsSection(tx, "stock", d.stock);
        await saveSettingsSection(tx, "receipt", d.receipt);
      });
    },
    { message: "Paramètres enregistrés." },
  );
}

export async function createUserAction(input: unknown) {
  return guarded(
    "team.manage",
    ({ db }) => {
      const d = parse(
        z.object({
          name: z.string(),
          email: z.string(),
          role: z.enum(["owner", "manager", "seller"]),
          password: z.string(),
        }),
        input,
      );
      return createUser(db, { ...d, isDemo: isDemoMode() });
    },
    { message: "Compte créé." },
  );
}

export async function updateUserAction(id: string, input: unknown) {
  return guarded(
    "team.manage",
    ({ db, user }) => {
      const d = parse(
        z.object({
          role: z.enum(["owner", "manager", "seller"]).optional(),
          active: z.boolean().optional(),
          password: z.string().optional(),
        }),
        input,
      );
      if (id === user.id && (d.active === false || (d.role && d.role !== "owner")))
        throw new AppError("conflict", "Vous ne pouvez pas retirer vos propres droits de propriétaire.");
      return updateUser(db, user, String(id), d);
    },
    { message: "Compte mis à jour." },
  );
}

export async function purgeDemoAction(confirmText: string) {
  return guarded(
    "demo.purge",
    async ({ db }) => {
      if (confirmText !== "PURGER") throw new AppError("validation", "Tapez PURGER pour confirmer.");
      try {
        await purgeDemo(db);
      } catch (e) {
        throw new AppError("conflict", e instanceof Error ? e.message : "Purge impossible.");
      }
    },
    {
      message: "Données d'exemple supprimées. La configuration est conservée.",
    },
  );
}
