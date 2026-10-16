import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { getSettings } from "@/server/domain/settings";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { OrderComposerClient } from "@/components/admin/OrderComposer";
import { listStores } from "@/server/domain/stores";

export const metadata: Metadata = { title: "Enregistrer une commande" };

export default async function NewOrderPage() {
  const { db, user, allowed } = await requirePage("orders.create");
  if (!allowed) return <Forbidden />;
  const [settings, stores] = await Promise.all([getSettings(db), listStores(db)]);
  return (
    <>
      <PageTitle eyebrow="Commandes" title="Enregistrer une commande">
        Pour une commande confirmée avec le client (WhatsApp, téléphone). Les articles sont réservés à
        l&apos;enregistrement.
      </PageTitle>
      <OrderComposerClient
        mode="order"
        canEditPrice={can(user, "orders.correct")}
        zones={settings.reception.zones}
        enabledMethods={settings.payments.methods}
        stores={stores.map((st) => ({
          id: st.id,
          name: st.name,
          counter: st.counter_enabled,
          pickup: st.pickup_enabled,
        }))}
      />
    </>
  );
}
