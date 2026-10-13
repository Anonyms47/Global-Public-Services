import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = { title: "Panier", robots: { index: false } };

export default async function PanierPage() {
  const { settings } = await siteContext();
  const r = settings.reception;
  return (
    <div className="container-site pt-8 pb-8 md:pt-12">
      <p className="eyebrow text-gps-red-ink">Commande WhatsApp</p>
      <h1 className="font-display mt-2 text-[56px] leading-[0.9] font-extrabold uppercase md:text-[80px]">
        Votre panier
      </h1>
      <CartView
        whatsapp={settings.company.whatsapp.replace(/\D/g, "")}
        reception={{
          pickupEnabled: r.pickupEnabled,
          pickupDetails: r.pickupDetails,
          deliveryEnabled: r.deliveryEnabled,
          deliveryDetails: r.deliveryDetails,
          zones: r.zones,
        }}
      />
    </div>
  );
}
