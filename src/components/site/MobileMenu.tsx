"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Settings } from "@/server/domain/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { cartCount, useCart } from "../cart/cart-store";
import { IconArrowRight, IconBag, IconClock, IconPhone, IconSearch, IconWhatsApp } from "../ui/icons";

type NavItem = { href: string; label: string; hint: string };
type Category = { slug: string; name: string; product_count: number };

/**
 * Menu mobile plein écran : grands titres numérotés qui entrent en cascade,
 * ruban GPS qui se dessine, recherche, univers et contact à portée de pouce.
 * Basé sur <dialog> (focus piégé, Échap, retour du focus au bouton).
 */
export function MobileMenu({
  nav,
  categories,
  company,
}: {
  nav: NavItem[];
  categories: Category[];
  company: Pick<Settings["company"], "whatsapp" | "phone" | "hours" | "slogan">;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  const ref = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="burger -ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] hover:bg-ink/5 lg:hidden"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-open={open || undefined}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true" className="burger-lines">
          <span />
          <span />
          <span />
        </span>
      </button>

      <dialog
        ref={ref}
        aria-label="Menu"
        className="menu-epic"
        onClose={() => {
          document.documentElement.style.overflow = "";
          setOpen(false);
          toggle.current?.focus();
        }}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        {open ? (
          <MenuContent
            nav={nav}
            categories={categories}
            company={company}
            pathname={pathname}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </dialog>
    </>
  );
}

function MenuContent({
  nav,
  categories,
  company,
  pathname,
  onClose,
}: {
  nav: NavItem[];
  categories: Category[];
  company: Pick<Settings["company"], "whatsapp" | "phone" | "hours" | "slogan">;
  pathname: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const count = cartCount(useCart());
  const wa = whatsappLink(company.whatsapp, "Bonjour GPS, j'ai une question.");
  const tel = company.phone.replace(/[^\d+]/g, "");
  const step = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <div className="relative flex min-h-full flex-col">
      {/* Ruban GPS qui se dessine à l'ouverture */}
      <svg
        className="menu-ribbon pointer-events-none absolute inset-x-0 top-24 h-[70%] w-full"
        viewBox="0 0 400 600"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M-20 560 C 120 600, 300 420, 420 40" pathLength={1} />
      </svg>

      <div className="relative flex h-16 items-center justify-between px-4">
        <p className="font-display text-[34px] leading-none font-extrabold tracking-wide">
          <span className="text-gps-red">GPS</span>
          <span className="sr-only"> — Global Public Services</span>
        </p>
        <button type="button" onClick={onClose} className="menu-close" aria-label="Fermer le menu">
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>

      <form
        role="search"
        className="menu-in relative mx-4 mt-2"
        style={step(0)}
        onSubmit={(e) => {
          e.preventDefault();
          router.push(q.trim() ? `/boutique?q=${encodeURIComponent(q.trim())}` : "/boutique");
          onClose();
        }}
      >
        <label htmlFor="menu-recherche" className="sr-only">
          Rechercher un produit
        </label>
        <input
          id="menu-recherche"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Que cherchez-vous ?"
          enterKeyHint="search"
          className="h-12 w-full rounded-full border border-white/20 bg-white/10 pr-12 pl-5 text-[16px] text-white placeholder:text-white/60 focus:border-white focus:bg-white/15 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Lancer la recherche"
          className="absolute top-0 right-1 inline-flex h-12 w-11 items-center justify-center text-white/80 hover:text-white"
        >
          <IconSearch size={20} />
        </button>
      </form>

      <nav aria-label="Menu mobile" className="relative mt-6 px-4">
        <ul>
          {nav.map((item, i) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="menu-in" style={step(i + 1)}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="menu-link group flex items-center gap-4 border-b border-white/10 py-3"
                >
                  <span className="w-7 shrink-0 font-display text-sm font-bold text-gps-red tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="menu-label block font-display text-[38px] leading-[0.95] font-extrabold uppercase">
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[13px] text-white/60">{item.hint}</span>
                  </span>
                  <IconArrowRight className="shrink-0 text-white/40 transition-transform group-hover:translate-x-1 group-hover:text-white" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {categories.length ? (
        <section aria-labelledby="menu-univers" className="menu-in relative mt-8" style={step(nav.length + 1)}>
          <h2 id="menu-univers" className="eyebrow px-4 text-white/60">
            Univers
          </h2>
          <ul className="mt-3 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-2">
            {categories.map((c) => (
              <li key={c.slug} className="snap-start">
                <Link
                  href={`/categories/${c.slug}`}
                  className="flex h-20 w-36 flex-col justify-between rounded-[10px] border border-white/15 bg-white/[0.06] p-3 transition-colors hover:border-white/40 hover:bg-white/10"
                >
                  <span className="font-display text-lg leading-none font-bold uppercase">{c.name}</span>
                  <span className="text-xs text-white/60 tabular">
                    {c.product_count} article{c.product_count > 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="menu-in relative mt-auto px-4 pt-8 pb-6" style={step(nav.length + 2)}>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/panier" className="menu-action">
            <IconBag size={20} />
            Panier{count ? <span className="menu-badge tabular">{count}</span> : null}
          </Link>
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="menu-action menu-action-wa">
              <IconWhatsApp /> WhatsApp
            </a>
          ) : tel ? (
            <a href={`tel:${tel}`} className="menu-action">
              <IconPhone size={20} /> Appeler
            </a>
          ) : (
            <Link href="/contact" className="menu-action">
              <IconPhone size={20} /> Contact
            </Link>
          )}
        </div>
        {company.hours ? (
          <p className="mt-4 flex items-start gap-2 text-[13px] text-white/70">
            <IconClock size={16} className="mt-0.5 shrink-0" />
            {company.hours}
          </p>
        ) : null}
        <p className="mt-5 font-display text-xl font-bold text-white/90 uppercase">
          {company.slogan || "Le service qui rassure"}
          <span className="text-gps-red">.</span>
        </p>
      </div>
    </div>
  );
}
