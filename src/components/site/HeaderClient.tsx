"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { cartCount, useCart } from "../cart/cart-store";
import { IconBag, IconSearch } from "../ui/icons";
import { Sheet } from "../ui/Sheet";

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

function SearchForm({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const current = pathname === "/boutique" ? (params.get("q") ?? "") : "";
  const [q, setQ] = useState(current);
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setQ(current);
  }
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const next = new URLSearchParams(pathname === "/boutique" ? params.toString() : "");
        if (q.trim()) next.set("q", q.trim());
        else next.delete("q");
        router.push(`/boutique${next.size ? `?${next}` : ""}`);
        onDone?.();
      }}
      className="relative w-full"
    >
      <label htmlFor={autoFocus ? "recherche-mobile" : "recherche"} className="sr-only">
        Rechercher un produit, une marque ou une référence
      </label>
      <input
        id={autoFocus ? "recherche-mobile" : "recherche"}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Produit, marque, référence…"
        className="field h-11 min-h-11 rounded-[6px] border-line bg-white pr-12 text-[15px]"
        enterKeyHint="search"
      />
      <button
        type="submit"
        className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center text-ink-soft hover:text-gps-blue"
        aria-label="Lancer la recherche"
      >
        <IconSearch />
      </button>
    </form>
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

export function HeaderActions() {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="ml-auto flex items-center gap-1 md:gap-3">
      <div className="hidden w-[min(28vw,340px)] md:block">
        <Suspense fallback={<div className="h-11 w-full rounded-[6px] border border-line bg-white" />}>
          <SearchForm />
        </Suspense>
      </div>
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] hover:bg-ink/5 md:hidden"
        aria-label="Rechercher"
        onClick={() => setSearchOpen(true)}
      >
        <IconSearch size={22} />
      </button>
      <CartButton />
      <Sheet open={searchOpen} onClose={() => setSearchOpen(false)} title="Rechercher" side="bottom">
        <Suspense>
          <SearchForm autoFocus onDone={() => setSearchOpen(false)} />
        </Suspense>
        <p className="hint">Exemples : téléphone, écouteurs, une marque ou une référence.</p>
      </Sheet>
    </div>
  );
}
