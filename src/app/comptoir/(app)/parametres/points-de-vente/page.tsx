import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { listStores } from "@/server/domain/stores";
import { Forbidden, PageTitle, Tabs } from "@/components/admin/ui";
import { StoreManager } from "@/components/admin/StoreManager";

export const metadata: Metadata = { title: "Points de vente" };

export default async function StoresPage() {
  const { db, allowed } = await requirePage("settings.edit");
  if (!allowed) return <Forbidden what="les points de vente" />;
  const stores = await listStores(db);
  return (
    <>
      <PageTitle eyebrow="Configuration" title="Points de vente">
        Informations et horaires de chaque boutique. Le stock est commun : toutes les boutiques vendent le même stock.
      </PageTitle>
      <Tabs
        current="points-de-vente"
        items={[
          { key: "parametres", label: "Paramètres", href: "/comptoir/parametres" },
          { key: "equipe", label: "Équipe", href: "/comptoir/parametres/equipe" },
          { key: "points-de-vente", label: "Points de vente", href: "/comptoir/parametres/points-de-vente" },
        ]}
      />
      <StoreManager stores={stores} />
    </>
  );
}
