import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { can } from "@/lib/permissions";
import { getSettings } from "@/server/domain/settings";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { OrderComposerClient } from "@/components/admin/OrderComposer";
import { listStores } from "@/server/domain/stores";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function QuickSalePage() {
  const { db, user, allowed } = await requirePage("sales.quick");
  if (!allowed) return <Forbidden />;
  const [stores, me] = await Promise.all([
    listStores(db),
    db.one<{ default_store_id: string | null }>("select default_store_id from users where id = $1", [user.id]),
  ]);
  return (
    <>
      <PageTitle eyebrow="Comptoir" title="Nouvelle vente">
        Rechercher, choisir la variante, ajouter, encaisser, vérifier, confirmer. Le stock sort immédiatement.
      </PageTitle>
      <OrderComposerClient
        mode="sale"
        canEditPrice={can(user, "orders.correct")}
        zones={[]}
        enabledMethods={(await getSettings(db)).payments.methods}
        stores={stores.map((st) => ({
          id: st.id,
          name: st.name,
          counter: st.counter_enabled,
          pickup: st.pickup_enabled,
        }))}
        defaultStoreId={me?.default_store_id ?? null}
      />
    </>
  );
}
