import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/server/domain/auth";
import { can, roleLabels, type Permission } from "@/lib/permissions";
import { Logo } from "../brand/Logo";
import { Ribbon } from "../brand/Ribbon";
import { AdminNavLink, GlobalSearch, MobileAdminNav } from "./ShellClient";
import { logoutAction } from "@/app/comptoir/connexion/actions";
import { IconLogout, IconPlus } from "../ui/icons";

export const adminNav: {
  href: string;
  label: string;
  perm: Permission;
  icon: string;
}[] = [
  {
    href: "/comptoir",
    label: "Aujourd'hui",
    perm: "orders.view",
    icon: "today",
  },
  {
    href: "/comptoir/commandes",
    label: "Commandes",
    perm: "orders.view",
    icon: "orders",
  },
  {
    href: "/comptoir/catalogue",
    label: "Catalogue",
    perm: "catalog.view",
    icon: "catalog",
  },
  {
    href: "/comptoir/stock",
    label: "Stock",
    perm: "stock.view",
    icon: "stock",
  },
  {
    href: "/comptoir/clients",
    label: "Clients",
    perm: "customers.view",
    icon: "customers",
  },
  {
    href: "/comptoir/vitrine",
    label: "Vitrine & services",
    perm: "storefront.edit",
    icon: "storefront",
  },
  {
    href: "/comptoir/rapports",
    label: "Rapports",
    perm: "reports.view",
    icon: "reports",
  },
  {
    href: "/comptoir/parametres",
    label: "Paramètres & équipe",
    perm: "settings.edit",
    icon: "settings",
  },
];

export function Shell({ user, demo, children }: { user: User; demo: boolean; children: ReactNode }) {
  const nav = adminNav.filter((n) => can(user, n.perm));
  const sidebar = (
    <div className="flex h-full flex-col">
      <Link href="/comptoir" className="flex items-center gap-3 px-5 pt-5 pb-6">
        <span className="rounded-[6px] bg-white p-1.5">
          <Logo variant="mark" className="h-7 w-auto" />
        </span>
        <span className="font-display text-[26px] leading-none font-extrabold text-white uppercase">Le Comptoir</span>
      </Link>
      <nav aria-label="Comptoir" className="flex-1 px-3">
        <ul className="grid gap-0.5">
          {nav.map((n) => (
            <li key={n.href}>
              <AdminNavLink href={n.href} icon={n.icon}>
                {n.label}
              </AdminNavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="relative overflow-hidden border-t border-white/10 px-5 py-4 text-white">
        <Ribbon tone="white" className="pointer-events-none absolute -bottom-6 left-0 h-20 w-full opacity-20" />
        <p className="text-[14px] font-bold">{user.name}</p>
        <p className="text-[13px] text-white/70">{roleLabels[user.role]}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/"
            target="_blank"
            className="inline-flex min-h-9 items-center rounded-[6px] px-2 text-[13px] text-white/80 underline-offset-2 hover:underline"
          >
            Voir le site
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[6px] px-2 text-[13px] text-white/80 hover:bg-white/10"
            >
              <IconLogout size={16} /> Déconnexion
            </button>
          </form>
        </div>
      </div>
    </div>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="no-print sticky top-0 hidden h-dvh bg-gps-blue-deep lg:block">{sidebar}</aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
          {demo ? (
            <p className="bg-gps-blue-night px-4 py-1 text-center text-[12px] font-semibold text-white">
              {user.restricted
                ? "Démonstration protégée — compte d'exemple sans accès aux paramètres, à l'équipe, aux exports ni à la purge."
                : "Démonstration — données d'exemple isolées, purge possible avant lancement (Paramètres)."}
            </p>
          ) : null}
          <div className="flex h-16 items-center gap-2 px-4 md:px-8">
            <MobileAdminNav>{sidebar}</MobileAdminNav>
            <GlobalSearch />
            <Link href="/comptoir/vente" className="btn btn-primary btn-sm ml-auto shrink-0">
              <IconPlus size={18} /> <span className="hidden sm:inline">Nouvelle vente</span>
              <span className="sm:hidden">Vente</span>
            </Link>
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
