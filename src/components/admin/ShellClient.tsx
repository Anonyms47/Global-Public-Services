"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { searchAction } from "@/app/comptoir/(app)/actions";
import { Sheet } from "../ui/Sheet";
import {
  IconMenu,
  IconSearch,
  IconGrid,
  IconBag,
  IconUser,
  IconList,
  IconStore,
  IconSwap,
  IconEdit,
  IconPrint,
  IconClock,
} from "../ui/icons";

const icons: Record<string, typeof IconMenu> = {
  today: IconClock,
  orders: IconBag,
  catalog: IconGrid,
  stock: IconList,
  customers: IconUser,
  storefront: IconStore,
  reports: IconPrint,
  settings: IconEdit,
  swap: IconSwap,
};

export function AdminNavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const on =
    href === "/comptoir"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);
  const I = icons[icon] ?? IconGrid;
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[6px] px-3 text-[15px] font-semibold transition-colors ${
        on
          ? "text-gps-blue-deep bg-white shadow-[inset_4px_0_0_#e30713]"
          : "text-white/85 hover:bg-white/10 hover:text-white"
      }`}
    >
      <I size={18} /> {children}
    </Link>
  );
}

export function MobileAdminNav({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        className="hover:bg-ink/5 -ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] lg:hidden"
        aria-label="Ouvrir la navigation"
        onClick={() => setOpen(true)}
      >
        <IconMenu size={24} />
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Navigation"
        side="left"
      >
        <div className="bg-gps-blue-deep -mx-4 -my-4 min-h-full md:-mx-6">
          {children}
        </div>
      </Sheet>
    </>
  );
}

type Results = Awaited<ReturnType<typeof searchAction>>;

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const search = (value: string) => {
    setQ(value);
    const id = ++seq.current;
    if (value.trim().length < 2) {
      setRes(null);
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      if (id !== seq.current) return;
      const r = await searchAction(value).catch(() => null);
      if (id === seq.current) {
        setRes(r);
        setLoading(false);
      }
    }, 180);
  };

  const data = res?.ok ? res.data : null;
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const total = data
    ? data.products.length + data.orders.length + data.customers.length
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line text-ink-mute flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[6px] border-[1.5px] bg-white px-3 text-left text-[15px] md:max-w-md"
      >
        <IconSearch size={18} className="shrink-0" />
        <span className="truncate">Produit, commande, client…</span>
        <kbd className="border-line ml-auto hidden rounded border px-1.5 text-[12px] md:inline">
          Ctrl K
        </kbd>
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Recherche"
        side="center"
      >
        <label htmlFor="admin-search" className="sr-only">
          Rechercher un produit, une référence de commande ou un client
        </label>
        <input
          id="admin-search"
          autoFocus
          className="field"
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="Nom, référence (GPS-…), SKU, téléphone…"
          autoComplete="off"
        />
        <div className="mt-4 min-h-24" aria-live="polite">
          {res && !res.ok ? (
            <p className="text-gps-red-ink">{res.error}</p>
          ) : null}
          {loading ? <p className="text-ink-mute">Recherche…</p> : null}
          {!loading && data && total === 0 ? (
            <p className="text-ink-mute">Aucun résultat pour « {q} ».</p>
          ) : null}
          {data && total > 0 ? (
            <div className="grid gap-5">
              {[
                [
                  "Commandes",
                  data.orders.map((o) => ({
                    href: `/comptoir/commandes/${o.id}`,
                    title: o.reference,
                    sub: o.customer_name || "Vente au comptoir",
                  })),
                ],
                [
                  "Produits",
                  data.products.map((p) => ({
                    href: `/comptoir/catalogue/${p.id}`,
                    title: p.name,
                    sub: [
                      p.brand,
                      p.sku,
                      p.status === "archived"
                        ? "archivé"
                        : p.status === "draft"
                          ? "brouillon"
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  })),
                ],
                [
                  "Clients",
                  data.customers.map((c) => ({
                    href: `/comptoir/clients/${c.id}`,
                    title: c.name,
                    sub: c.phone,
                  })),
                ],
              ].map(([label, rows]) =>
                (rows as { href: string; title: string; sub: string }[])
                  .length ? (
                  <div key={label as string}>
                    <p className="eyebrow text-ink-mute mb-1">
                      {label as string}
                    </p>
                    <ul className="divide-line-soft divide-y">
                      {(
                        rows as { href: string; title: string; sub: string }[]
                      ).map((r) => (
                        <li key={r.href}>
                          <button
                            type="button"
                            onClick={() => go(r.href)}
                            className="hover:bg-paper-deep focus-visible:bg-paper-deep flex min-h-12 w-full flex-col items-start justify-center rounded px-2 text-left"
                          >
                            <span className="font-semibold">{r.title}</span>
                            {r.sub ? (
                              <span className="text-ink-mute text-[13px]">
                                {r.sub}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </div>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
