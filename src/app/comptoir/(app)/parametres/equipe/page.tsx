import type { Metadata } from "next";
import { requirePage } from "@/server/admin";
import { listLoginLocks, listUsers } from "@/server/domain/auth";
import { Forbidden, PageTitle, Tabs } from "@/components/admin/ui";
import { LoginLocks, TeamManager } from "@/components/admin/SettingsForms";

export const metadata: Metadata = { title: "Équipe" };

export default async function TeamPage() {
  const { db, user, allowed } = await requirePage("team.manage");
  if (!allowed) return <Forbidden what="la gestion de l'équipe" />;
  const [users, locks] = await Promise.all([listUsers(db), listLoginLocks(db)]);
  return (
    <>
      <PageTitle eyebrow="Configuration" title="Paramètres & équipe" />
      <Tabs
        current="equipe"
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
      <TeamManager
        me={user.id}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          isDemo: u.is_demo,
          temporary: !!u.must_change_password,
        }))}
      />
      <LoginLocks locks={locks} />
    </>
  );
}
