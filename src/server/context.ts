import { cache } from "react";
import { connection } from "next/server";
import { getDb, isDemoMode } from "./db";
import { getSettings } from "./domain/settings";
import { hasDemoData } from "./demo/seed";
import { closedToday, hoursText, listStores } from "./domain/stores";

/** Base de données pour un rendu à la requête (jamais figé au build). */
export async function pageDb() {
  await connection();
  return getDb();
}

/** Contexte partagé par les pages publiques, calculé une fois par requête. */
export const siteContext = cache(async () => {
  const db = await pageDb();
  const [settings, demoData, storeRows] = await Promise.all([
    getSettings(db),
    hasDemoData(db),
    listStores(db, { publishedOnly: true }),
  ]);
  // Points de vente publics : libellé neutre (les noms du Comptoir sont des identifiants internes).
  const stores = storeRows.map((st, i) => ({
    id: st.id,
    label: storeRows.length > 1 ? `Point de vente ${i + 1}` : "Notre boutique",
    place: [st.district && `Quartier ${st.district}`, st.city].filter(Boolean).join(", "),
    address: st.address,
    landmark: st.landmark,
    hours: hoursText(st.hours),
    closed: closedToday(st)?.note ?? null,
    mapsUrl: st.maps_url,
    phone: st.phone,
    services: st.services,
    photoUrl: st.photo_url,
  }));
  const demo = isDemoMode() || demoData;
  return {
    db,
    settings,
    stores,
    /** Catalogue ou données d'exemple visibles : bandeau, pas d'indexation. */
    demo,
    /** Indexation autorisée seulement sans données d'exemple et sur décision explicite. */
    indexable: !demo && process.env.SITE_INDEXABLE === "true",
    whatsappReady: settings.company.whatsapp.replace(/\D/g, "").length >= 8,
  };
});

export function siteUrl(path = "") {
  return `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}
