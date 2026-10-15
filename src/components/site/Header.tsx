import Link from "next/link";
import { Logo } from "../brand/Logo";
import type { Settings } from "@/server/domain/settings";
import { HeaderActions, NavLink } from "./HeaderClient";
import { MobileMenu } from "./MobileMenu";

export const mainNav = [
  { href: "/boutique", label: "Boutique" },
  { href: "/categories", label: "Univers" },
  { href: "/services", label: "Transfert d'argent" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
];

export function Header({
  company,
  categories,
}: {
  company: Settings["company"];
  categories: { slug: string; name: string }[];
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-3 focus:text-white"
      >
        Aller au contenu
      </a>
      <div className="container-site flex h-16 items-center gap-3 md:h-[84px] md:gap-6">
        <MobileMenu nav={mainNav} company={company} />
        <Link href="/" className="shrink-0" aria-label="GPS — accueil">
          <Logo variant="mark" className="h-8 w-auto md:hidden" priority />
          <Logo variant="full" className="hidden h-[60px] w-auto md:block" priority />
        </Link>
        <nav aria-label="Navigation principale" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {mainNav.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href}>{item.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <HeaderActions categories={categories} />
      </div>
    </header>
  );
}
