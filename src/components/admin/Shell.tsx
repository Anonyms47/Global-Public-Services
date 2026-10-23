import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/server/domain/auth";
import { can, roleLabels } from "@/lib/permissions";
import { adminNavGroups, quickActions } from "@/lib/admin-nav";
import { Logo } from "../brand/Logo";
import { Ribbon } from "../brand/Ribbon";
import { AdminNavLink, CommandPalette, MobileAdminNav, QuickActionButton, SidebarToggle } from "./ShellClient";
import { logoutAction } from "@/app/comptoir/connexion/actions";
import { IconLogout, IconPlus } from "../ui/icons";

export function Shell({
  user,
  demo,
  badges = {},
  stock = true,
  collapsed = false,
  children,
}: {
  user: User;
  demo: boolean;
  badges?: Record<string, number>;
  /** Suivi des quantités coupé : les écrans de stock disparaissent du menu. */
  stock?: boolean;
  /** Barre latérale repliée en colonne d'icônes (ordinateur), choix mémorisé par cookie. */
  collapsed?: boolean;
  children: ReactNode;
}) {
  const shown = (href: string) => stock || !href.startsWith("/comptoir/stock");
  const groups = adminNavGroups
    .map((g) => ({ ...g, items: g.items.filter((n) => can(user, n.perm) && shown(n.href)) }))
    .filter((g) => g.items.length);
  const actions = quickActions.filter((a) => can(user, a.perm) && shown(a.href));
  const commands = [
    ...actions.map((a) => ({ href: a.href, label: a.label, group: "Actions", keywords: a.keywords ?? "" })),
    ...groups.flatMap((g) =>
      g.items.map((n) => ({ href: n.href, label: n.label, group: `Aller à · ${g.label}`, keywords: n.keywords ?? "" })),
    ),
  ];
  const sidebar = (toggle?: ReactNode) => (
    <div className="flex h-full flex-col">
      <Link href="/comptoir" className="admin-brand flex items-center gap-3 px-5 pt-5 pb-5">
        <span className="shrink-0 rounded-[6px] bg-white p-1.5">
          <Logo variant="mark" className="h-7 w-auto" />
        </span>
        <span className="nav-label font-display text-[26px] leading-none font-extrabold text-white uppercase">
          Le Comptoir
        </span>
      </Link>
      <nav aria-label="Comptoir" className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.key} className="mt-3 first:mt-0">
            <p id={`nav-${g.key}`} className="admin-nav-group">
              {g.label}
            </p>
            <ul className="grid gap-0.5" aria-labelledby={`nav-${g.key}`}>
              {g.items.map((n) => (
                <li key={n.href}>
                  <AdminNavLink href={n.href} icon={n.icon} count={badges[n.href]}>
                    {n.label}
                  </AdminNavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {toggle ? <div className="border-t border-white/10 px-3 py-2">{toggle}</div> : null}
      <div className="admin-account relative overflow-hidden border-t border-white/10 px-5 py-4 text-white">
        <Ribbon tone="white" className="pointer-events-none absolute -bottom-6 left-0 h-20 w-full opacity-20" />
        <p className="nav-hide text-[14px] font-bold">{user.name}</p>
        <p className="nav-hide text-[13px] text-white/70">
          {roleLabels[user.role]}
          {user.is_demo ? " · exemple" : ""}
        </p>
        <div className="account-links mt-3 flex flex-wrap gap-2">
          <Link
            href="/comptoir/mon-compte"
            className="nav-hide inline-flex min-h-9 items-center rounded-[6px] px-2 text-[13px] text-white/80 underline-offset-2 hover:underline"
          >
            Mon compte
          </Link>
          <Link
            href="/"
            target="_blank"
            className="nav-hide inline-flex min-h-9 items-center rounded-[6px] px-2 text-[13px] text-white/80 underline-offset-2 hover:underline"
          >
            Voir le site
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              title="Déconnexion"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[6px] px-2 text-[13px] text-white/80 hover:bg-white/10"
            >
              <IconLogout size={16} className="shrink-0" /> <span className="nav-label">Déconnexion</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
  return (
    <div className="admin-app min-h-dvh lg:grid" data-nav={collapsed ? "replie" : "ouvert"}>
      <aside className="admin-sidebar no-print sticky top-0 hidden h-dvh bg-gps-blue-deep lg:block">
        {sidebar(<SidebarToggle collapsed={collapsed} />)}
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
          {demo ? (
            <p className="truncate bg-gps-blue-night px-4 py-0.5 text-center text-[11px] font-semibold text-white">
              {user.restricted ? "Démonstration protégée (compte d'exemple)" : "Mode démonstration"}
            </p>
          ) : null}
          <div className="flex h-16 items-center gap-2 px-4 md:px-8">
            <MobileAdminNav>{sidebar()}</MobileAdminNav>
            <CommandPalette commands={commands} />
            {can(user, "sales.quick") ? (
              <Link href="/comptoir/vente" className="btn btn-primary btn-sm ml-auto hidden shrink-0 sm:inline-flex">
                <IconPlus size={18} /> Nouvelle vente
              </Link>
            ) : null}
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1320px] px-4 py-6 pb-28 md:px-8 md:py-8 lg:pb-8">
          {children}
        </main>
      </div>
      <QuickActionButton actions={actions.slice(0, 5).map((a) => ({ href: a.href, label: a.label }))} />
    </div>
  );
}
