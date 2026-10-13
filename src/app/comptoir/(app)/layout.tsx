import { redirect } from "next/navigation";
import { currentUser } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { Shell } from "@/components/admin/Shell";

export default async function AdminLayout({ children }: LayoutProps<"/comptoir">) {
  const user = await currentUser();
  if (!user) redirect("/comptoir/connexion?expiree=1");
  return (
    <Shell user={user} demo={isDemoMode()}>
      {children}
    </Shell>
  );
}
