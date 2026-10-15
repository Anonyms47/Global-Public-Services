import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { getSettings } from "@/server/domain/settings";
import { hasDemoData } from "@/server/demo/seed";
import { Forbidden, PageTitle, Tabs } from "@/components/admin/ui";
import { DemoPurge, SettingsForm } from "@/components/admin/SettingsForms";

export const metadata: Metadata = { title: "Paramètres" };

export default async function SettingsPage() {
  const { db, allowed } = await requirePage("settings.edit");
  if (!allowed) return <Forbidden what="les paramètres" />;
  const [s, demoData] = await Promise.all([getSettings(db), hasDemoData(db)]);
  return (
    <>
      <PageTitle eyebrow="Développer" title="Configuration">
        Entreprise, coordonnées, réception, paiements, messages WhatsApp et conditions. Rien n&apos;est inventé : un
        champ vide reste « à confirmer » sur le site.
      </PageTitle>
      <Tabs
        current="parametres"
        items={[
          {
            key: "parametres",
            label: "Paramètres",
            href: "/comptoir/parametres",
          },
          {
            key: "equipe",
            label: "Équipe",
            href: "/comptoir/parametres/equipe",
          },
        ]}
      />
      <SettingsForm
        initial={{
          company: s.company,
          reception: s.reception,
          policies: s.policies,
          stock: s.stock,
          receipt: s.receipt,
          messages: s.messages,
          payments: s.payments,
        }}
      />
      <DemoPurge demoMode={isDemoMode()} hasDemo={demoData} />
    </>
  );
}
