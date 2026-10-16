import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { CartView } from "@/components/cart/CartView";
import { getDb } from "@/server/db";
import { hoursText, pickupStores } from "@/server/domain/stores";

export const metadata: Metadata = { title: "Panier", robots: { index: false } };

export default async function PanierPage() {
  const { settings } = await siteContext();
  const r = settings.reception;
  const stores = await pickupStores(await getDb());
  return (
    <div className="container-site pt-6 pb-8 md:pt-12">
      <CartView
        whatsapp={settings.company.whatsapp.replace(/\D/g, "")}
        reception={{
          pickupEnabled: r.pickupEnabled,
          pickupDetails: r.pickupDetails,
          deliveryEnabled: r.deliveryEnabled,
          deliveryDetails: r.deliveryDetails,
          zones: r.zones,
        }}
        stores={stores.map((st) => ({
          id: st.id,
          name: st.name,
          place: [st.district && `Quartier ${st.district}`, st.city].filter(Boolean).join(", "),
          hours: hoursText(st.hours),
          mapsUrl: st.maps_url,
        }))}
      />
    </div>
  );
}
