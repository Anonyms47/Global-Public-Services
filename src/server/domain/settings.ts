import type { Db } from "../db/client";
import { defaultTemplates, type TemplateKey } from "@/lib/templates";
import { paymentMethods, type PaymentMethodKey } from "@/lib/payment-methods";
import { defaultQuickValues, type QuickValues } from "@/lib/product-kit";

export interface DeliveryZone {
  name: string;
  /** null = frais à confirmer avec GPS */
  fee: number | null;
}

export interface Settings {
  company: {
    name: string;
    slogan: string;
    /** Numéro WhatsApp au format international, chiffres uniquement (ex. 22500000000). Vide = mode démonstration. */
    whatsapp: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    hours: string;
    mapsUrl: string;
    storePhotoUrl: string;
    storeText: string;
    /** Texte « Notre histoire » de la page À propos. */
    aboutText: string;
    /** Raison sociale et immatriculation (reçus, conditions de vente). */
    legalName: string;
    /** Autre immatriculation (texte libre, conservé pour compatibilité). */
    legalId: string;
    ninea: string;
    rccm: string;
    /** Fuseau horaire de la boutique (affichages et reçus). */
    timezone: string;
  };
  reception: {
    pickupEnabled: boolean;
    pickupDetails: string;
    deliveryEnabled: boolean;
    deliveryDetails: string;
    zones: DeliveryZone[];
  };
  policies: {
    warranty: string;
    returns: string;
    payment: string;
  };
  stock: { defaultLowThreshold: number };
  receipt: { header: string; footer: string };
  storefront: {
    heroProductId: string | null;
    focusProductId: string | null;
    focusText: string;
  };
  /** Modèles des messages WhatsApp envoyés aux clients depuis le Comptoir. */
  messages: Record<TemplateKey, string>;
  /** Moyens de paiement proposés à l'encaissement. */
  payments: { methods: PaymentMethodKey[] };
  /** Saisie des produits : valeurs proposées en un geste (RAM, stockage, puissance…), modifiables par le propriétaire. */
  catalog: { quickValues: QuickValues };
  /** Mode de boutique visé, préparé par le propriétaire (le basculement réel se fait dans l'hébergeur). */
  launch: {
    targetMode: ShopMode;
    updatedAt: string | null;
    updatedBy: string | null;
  };
}

export type ShopMode = "demo" | "test" | "open";

export const defaultSettings: Settings = {
  company: {
    name: "GPS — Global Public Services",
    slogan: "Le service qui rassure",
    whatsapp: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    hours: "",
    mapsUrl: "",
    storePhotoUrl: "",
    storeText: "",
    aboutText: "",
    legalName: "",
    legalId: "",
    ninea: "",
    rccm: "",
    timezone: "Africa/Dakar",
  },
  reception: {
    pickupEnabled: true,
    pickupDetails: "",
    deliveryEnabled: true,
    deliveryDetails: "",
    zones: [],
  },
  policies: { warranty: "", returns: "", payment: "" },
  stock: { defaultLowThreshold: 1 },
  receipt: { header: "", footer: "Merci pour votre confiance." },
  storefront: { heroProductId: null, focusProductId: null, focusText: "" },
  launch: { targetMode: "demo", updatedAt: null, updatedBy: null },
  catalog: { quickValues: defaultQuickValues },
  messages: { ...defaultTemplates },
  payments: { methods: paymentMethods.map(([k]) => k) },
};

/** NINEA, RCCM et autre immatriculation, prêts à afficher. */
export function legalIds(c: Settings["company"]) {
  return [c.ninea && `NINEA ${c.ninea}`, c.rccm && `RCCM ${c.rccm}`, c.legalId].filter(Boolean).join(" · ");
}

export { TO_CONFIRM } from "@/lib/whatsapp";

type Section = keyof Settings;

export async function ensureBaseSettings(db: Db) {
  for (const key of Object.keys(defaultSettings) as Section[]) {
    await db.query("insert into settings (key, value) values ($1, $2) on conflict (key) do nothing", [
      key,
      JSON.stringify(defaultSettings[key]),
    ]);
  }
}

export async function getSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ key: Section; value: unknown }>("select key, value from settings");
  const s = structuredClone(defaultSettings) as unknown as Record<string, unknown>;
  for (const row of rows) {
    if (row.key in s) {
      s[row.key] = { ...(s[row.key] as object), ...(row.value as object) };
    }
  }
  return s as unknown as Settings;
}

export async function saveSettingsSection<K extends Section>(db: Db, key: K, value: Settings[K]) {
  await db.query(
    `insert into settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
