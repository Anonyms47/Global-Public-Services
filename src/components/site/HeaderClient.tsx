"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cartCount, useCart } from "../cart/cart-store";
import { IconBag } from "../ui/icons";
import { SearchOverlay } from "./SearchOverlay";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex min-h-11 items-center rounded-[6px] px-3 text-[15px] font-semibold transition-colors hover:bg-ink/5 ${
        active
          ? "text-gps-blue after:absolute after:inset-x-3 after:bottom-1 after:h-[3px] after:rounded-full after:bg-gps-red"
          : ""
      }`}
    >
      {children}
    </Link>
  );
}

function CartButton() {
  const items = useCart();
  const count = cartCount(items);
  return (
    <Link
      href="/panier"
      className="relative inline-flex h-11 items-center gap-2 rounded-[6px] px-3 font-bold hover:bg-ink/5"
      aria-label={count ? `Panier, ${count} article${count > 1 ? "s" : ""}` : "Panier, vide"}
    >
      <IconBag size={22} />
      <span className="hidden sm:inline">Panier</span>
      {count > 0 ? (
        <span className="absolute -top-0.5 left-6 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gps-red px-1 text-[11px] font-extrabold text-white tabular sm:static sm:h-6 sm:min-w-6 sm:text-xs">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export function HeaderActions({ categories }: { categories: { slug: string; name: string }[] }) {
  return (
    <div className="ml-auto flex items-center gap-1 md:gap-3">
      <SearchOverlay categories={categories} />
      <CartButton />
    </div>
  );
}
