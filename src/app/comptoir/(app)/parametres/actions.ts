"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { getSettings, saveSettingsSection } from "@/server/domain/settings";
import { clearLoginLock, createUser, updateUser } from "@/server/domain/auth";
import { purgeDemo } from "@/server/demo/seed";
import { audit } from "@/server/domain/audit";
import { mediaStorage } from "@/server/storage";
import { templateKeys, type TemplateKey } from "@/lib/templates";
import { paymentMethods, type PaymentMethodKey } from "@/lib/payment-methods";

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
    aboutText: text(3000),
    legalName: text(160),
    legalId: text(120),
    ninea: text(40),
    rccm: text(60),
    timezone: z
      .string()
      .trim()
      .refine((tz) => {
        try {
          new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      }, "Fuseau horaire inconnu (ex. Africa/Dakar)."),
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
  messages: z.object(
    Object.fromEntries(templateKeys.map((k) => [k, text(1200)])) as Record<TemplateKey, ReturnType<typeof text>>,
  ),
  payments: z.object({
    methods: z
      .array(z.enum(paymentMethods.map(([k]) => k) as [PaymentMethodKey, ...PaymentMethodKey[]]))
      .min(1, "Gardez au moins un moyen de paiement."),
  }),
});

export async function saveSettingsAction(input: unknown) {
  return guarded(
    "settings.edit",
    async ({ db, user }) => {
      const d = parse(settingsSchema, input);
      const s = await getSettings(db);
      const changed = (
        ["company", "reception", "policies", "stock", "receipt", "messages", "payments"] as const
      ).filter(
        (k) =>
          JSON.stringify(s[k]) !==
          JSON.stringify(k === "company" ? { ...s.company, ...d.company, slogan: s.company.slogan } : d[k]),
      );
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
        await saveSettingsSection(tx, "messages", d.messages);
        await saveSettingsSection(tx, "payments", d.payments);
        if (changed.length) await audit(tx, user.id, "settings.update", changed.join(", "));
      });
    },
    { message: "Paramètres enregistrés." },
  );
}

export async function createUserAction(input: unknown) {
  return guarded(
    "team.manage",
    async ({ db, user }) => {
      const d = parse(
        z.object({
          name: z.string(),
          email: z.string(),
          role: z.enum(["owner", "manager", "seller"]),
          password: z.string(),
        }),
        input,
      );
      // Un compte créé par un compte réel est réel, même en mode démonstration.
      const id = await createUser(db, { ...d, isDemo: user.is_demo && isDemoMode(), temporary: true });
      await audit(db, user.id, "team.create", d.email.trim().toLowerCase(), { role: d.role });
      return id;
    },
    { message: "Compte créé." },
  );
}

export async function updateUserAction(id: string, input: unknown) {
  return guarded(
    "team.manage",
    async ({ db, user }) => {
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
      await updateUser(db, user, String(id), d);
      await audit(db, user.id, "team.update", String(id), {
        ...(d.role ? { role: d.role } : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
        ...(d.password ? { password: "modifié" } : {}),
      });
    },
    { message: "Compte mis à jour." },
  );
}

/** Lève un blocage de connexion (identifiant ou adresse). Les échecs restent au journal. */
export async function unlockLoginAction(kind: string, value: string) {
  return guarded(
    "team.manage",
    async ({ db, user }) => {
      const d = parse(z.object({ kind: z.enum(["identifier", "ip"]), value: z.string().min(1).max(120) }), {
        kind,
        value,
      });
      const n = await clearLoginLock(db, d.kind, d.value);
      await audit(db, user.id, "auth.unlock", d.value, { kind: d.kind, failures: n });
    },
    { message: "Blocage levé : la connexion est de nouveau possible." },
  );
}

/**
 * Purge des données d'exemple (propriétaire). « dryRun » : essai à blanc, rien
 * n'est modifié. Sinon : sauvegarde datée, suppression transactionnelle, puis
 * retrait des fichiers d'exemple du stockage ; compte rendu avant/après journalisé.
 */
export async function purgeDemoAction(confirmText: string, opts: { dryRun?: boolean } = {}) {
  return guarded(
    "demo.purge",
    async ({ db, user }) => {
      if (!opts.dryRun && confirmText !== "PURGER") throw new AppError("validation", "Tapez PURGER pour confirmer.");
      try {
        const r = await purgeDemo(db, { dryRun: !!opts.dryRun, userId: user.is_demo ? null : user.id });
        if (!r.dryRun) {
          const store = mediaStorage().store;
          if (store && r.mediaPaths.length) await store.remove(r.mediaPaths).catch(() => undefined);
          await audit(db, user.is_demo ? null : user.id, "demo.purge", r.backup?.label ?? "", {
            before: r.before.demo,
            after: r.after.demo,
            media: r.mediaPaths.length,
          });
        }
        return { before: r.before, after: r.after, backup: r.backup, dryRun: r.dryRun };
      } catch (e) {
        throw new AppError("conflict", e instanceof Error ? e.message : "Purge impossible.");
      }
    },
    {
      message: opts.dryRun
        ? "Essai à blanc terminé : rien n'a été modifié."
        : "Données d'exemple supprimées après sauvegarde.",
    },
  );
}
