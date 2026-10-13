import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { OrderComposerClient } from "@/components/admin/OrderComposer";

export const metadata: Metadata = { title: "Nouvelle vente" };

export default async function QuickSalePage() {
  const { user, allowed } = await requirePage("sales.quick");
  if (!allowed) return <Forbidden />;
  return (
    <>
      <PageTitle eyebrow="Comptoir" title="Nouvelle vente">
        Rechercher, choisir la variante, ajouter, encaisser, vérifier, confirmer. Le stock sort immédiatement.
      </PageTitle>
      <OrderComposerClient mode="sale" canEditPrice={can(user.role, "orders.correct")} zones={[]} />
    </>
  );
}
