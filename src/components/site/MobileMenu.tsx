"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Settings } from "@/server/domain/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { cartCount, useCart } from "../cart/cart-store";
import { IconArrowRight, IconBag, IconPhone, IconWhatsApp } from "../ui/icons";

type NavItem = { href: string; label: string };

/** Durée de l'animation de fermeture (doit suivre `menu-hide` dans globals.css). */
const CLOSE_MS = 260;

/**
 * Menu mobile plein écran, simple : ouverture en cercle depuis le bouton,
 * liens qui glissent en place, fermeture inverse. Basé sur <dialog>
 * (focus piégé, Échap, retour du focus au bouton).
 */
export function MobileMenu({
  nav,
  company,
}: {
  nav: NavItem[];
  company: Pick<Settings["company"], "whatsapp" | "phone">;
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
    if (open) {
      delete d.dataset.closing;
      if (!d.open) {
        d.showModal();
        document.documentElement.style.overflow = "hidden";
      }
      return;
    }
    if (d.open) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return d.close();
      d.dataset.closing = "";
      const t = window.setTimeout(() => d.close(), CLOSE_MS);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  const count = cartCount(useCart());
  const wa = whatsappLink(company.whatsapp, "Bonjour GPS, j'ai une question.");
  const tel = company.phone.replace(/[^\d+]/g, "");
  const step = (i: number) => ({ "--i": i }) as CSSProperties;
  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="burger -ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] hover:bg-ink/5 lg:hidden"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        aria-haspopup="dialog"
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
          close();
        }}
      >
        <div className="flex min-h-full flex-col px-5">
          <div className="flex h-16 items-center justify-between">
            <p className="font-display text-[30px] leading-none font-extrabold text-gps-red">
              GPS<span className="sr-only"> — Global Public Services</span>
            </p>
            <button type="button" onClick={close} className="menu-close" aria-label="Fermer le menu">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
          </div>

          <nav aria-label="Menu mobile" className="mt-6">
            <ul>
              {nav.map((item, i) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href} className="menu-in" style={step(i)}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className="menu-link flex items-center justify-between gap-4 py-3"
                    >
                      <span className="menu-label font-display text-[40px] leading-none font-extrabold uppercase">
                        {item.label}
                      </span>
                      <IconArrowRight className="shrink-0 text-white/40" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="menu-in mt-auto grid grid-cols-2 gap-2 pt-10 pb-8" style={step(nav.length)}>
            <Link href="/panier" onClick={close} className="menu-action">
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
              <Link href="/contact" onClick={close} className="menu-action">
                <IconPhone size={20} /> Contact
              </Link>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
