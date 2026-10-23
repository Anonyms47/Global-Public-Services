import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/admin";
import { getDb, isDemoMode } from "@/server/db";
import { Shell } from "@/components/admin/Shell";
import { NAV_COOKIE } from "@/lib/admin-nav";
import { stockTracking } from "@/server/domain/stock";

/** Pastilles du menu : ce qui attend une action, recalculé à chaque page. */
async function navBadges(): Promise<Record<string, number>> {
  try {
    const db = await getDb();
    const r = await db.one<{ requests: number; prepare: number; drafts: number }>(
      `select (select count(*)::int from order_requests where status = 'new') as requests,
              (select count(*)::int from orders where status = 'confirmed' and fulfillment = 'to_prepare') as prepare,
              (select count(*)::int from products where status = 'draft' and deleted_at is null) as drafts`,
    );
    return {
      "/comptoir/demandes": r?.requests ?? 0,
      "/comptoir/commandes": r?.prepare ?? 0,
      "/comptoir/catalogue/a-completer": r?.drafts ?? 0,
    };
  } catch {
    return {};
  }
}

export default async function AdminLayout({ children }: LayoutProps<"/comptoir">) {
  const user = await currentUser();
  if (!user) redirect("/comptoir/connexion?expiree=1");
  const stock = await stockTracking(await getDb()).catch(() => true);
  const collapsed = (await cookies()).get(NAV_COOKIE)?.value === "replie";
  return (
    <Shell user={user} demo={isDemoMode()} badges={await navBadges()} stock={stock} collapsed={collapsed}>
      {children}
    </Shell>
  );
}
