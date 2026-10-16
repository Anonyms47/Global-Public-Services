/** Points de vente : types et horaires, partagés entre le Comptoir (navigateur) et le serveur. */
export const DAYS = [
  ["mon", "Lundi"],
  ["tue", "Mardi"],
  ["wed", "Mercredi"],
  ["thu", "Jeudi"],
  ["fri", "Vendredi"],
  ["sat", "Samedi"],
  ["sun", "Dimanche"],
] as const;
export type DayKey = (typeof DAYS)[number][0];

export interface StoreHours {
  /** Plage par défaut des jours ouverts. */
  open: string;
  close: string;
  /** Jours ouverts confirmés (vide : jours non encore confirmés, seule la plage s'affiche). */
  days: Partial<Record<DayKey, { enabled: boolean; open?: string; close?: string }>>;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  district: string;
  city: string;
  landmark: string;
  maps_url: string;
  hours: StoreHours;
  closures: { date: string; note: string }[];
  photo_url: string | null;
  phone: string;
  services: string;
  pickup_enabled: boolean;
  counter_enabled: boolean;
  is_main: boolean;
  position: number;
  published: boolean;
}

export const defaultHours: StoreHours = { open: "09:00", close: "22:00", days: {} };

const hm = (t: string) => t.replace(/^0/, "").replace(":00", " h").replace(":", " h ");

/** Horaires à afficher : la plage seule tant que les jours ne sont pas confirmés (jamais « tous les jours » par défaut). */
export function hoursText(h: StoreHours) {
  const range = `${hm(h.open || "09:00")} – ${hm(h.close || "22:00")}`;
  const enabled = DAYS.filter(([k]) => h.days?.[k]?.enabled);
  if (!enabled.length) return range;
  return DAYS.filter(([k]) => h.days?.[k] !== undefined)
    .map(([k, label]) => {
      const d = h.days[k]!;
      return `${label} : ${d.enabled ? `${hm(d.open || h.open)} – ${hm(d.close || h.close)}` : "fermé"}`;
    })
    .join(" · ");
}

/** Fermeture exceptionnelle du jour (date AAAA-MM-JJ, heure de Dakar). */
export function closedToday(s: Pick<Store, "closures">, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  return s.closures?.find((c) => c.date === today) ?? null;
}
