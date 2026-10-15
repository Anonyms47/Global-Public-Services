"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { searchAction } from "@/app/comptoir/(app)/actions";
import { Sheet } from "../ui/Sheet";
import {
  IconBolt,
  IconCash,
  IconChart,
  IconPlus,
  IconTeam,
  IconInbox,
  IconRocket,
  IconHeart,
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
  dashboard: IconChart,
  sale: IconCash,
  team: IconTeam,
  inbox: IconInbox,
  launch: IconRocket,
  health: IconHeart,
};

export function AdminNavLink({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  const pathname = usePathname();
  const on = href === "/comptoir" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const I = icons[icon] ?? IconGrid;
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-[6px] px-3 text-[15px] font-semibold transition-colors ${
        on
          ? "bg-white text-gps-blue-deep shadow-[inset_4px_0_0_#e30713]"
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
        className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-[6px] hover:bg-ink/5 lg:hidden"
        aria-label="Ouvrir la navigation"
        onClick={() => setOpen(true)}
      >
        <IconMenu size={24} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Navigation" side="left">
        <div className="-mx-4 -my-4 min-h-full bg-gps-blue-deep md:-mx-6">{children}</div>
      </Sheet>
    </>
  );
}

type Results = Awaited<ReturnType<typeof searchAction>>;

export interface Command {
  href: string;
  label: string;
  group: string;
  keywords: string;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Palette de commandes (Ctrl/⌘ + K) : actions et pages permises à l'utilisateur,
 * puis produits, commandes et clients trouvés côté serveur. Flèches pour
 * parcourir, Entrée pour ouvrir.
 */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const seq = useRef(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

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
    setActive(0);
    const id = ++seq.current;
    if (value.trim().length < 2) {
      setRes(null);
      setLoading(false);
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
  const sections = useMemo(() => {
    const term = fold(q.trim());
    const cmd = commands.filter((c) => !term || fold(`${c.label} ${c.keywords}`).includes(term));
    const byGroup = new Map<string, { href: string; title: string; sub: string }[]>();
    for (const c of term ? cmd : cmd.slice(0, 14)) {
      const rows = byGroup.get(c.group) ?? [];
      rows.push({ href: c.href, title: c.label, sub: "" });
      byGroup.set(c.group, rows);
    }
    const out = [...byGroup.entries()].map(([label, rows]) => ({ label, rows }));
    if (data) {
      out.push(
        {
          label: "Commandes",
          rows: data.orders.map((o) => ({
            href: `/comptoir/commandes/${o.id}`,
            title: o.reference,
            sub: o.customer_name || "Vente au comptoir",
          })),
        },
        {
          label: "Produits",
          rows: data.products.map((p) => ({
            href: `/comptoir/catalogue/${p.id}`,
            title: p.name,
            sub: [p.brand, p.sku, p.status === "archived" ? "archivé" : p.status === "draft" ? "brouillon" : ""]
              .filter(Boolean)
              .join(" · "),
          })),
        },
        {
          label: "Clients",
          rows: data.customers.map((c) => ({ href: `/comptoir/clients/${c.id}`, title: c.name, sub: c.phone })),
        },
      );
    }
    return out.filter((s) => s.rows.length);
  }, [q, commands, data]);
  const flat = sections.flatMap((s) => s.rows);
  const current = Math.min(active, Math.max(0, flat.length - 1));

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    setRes(null);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((current + 1) % Math.max(1, flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current - 1 + flat.length) % Math.max(1, flat.length));
    } else if (e.key === "Enter" && flat[current]) {
      e.preventDefault();
      go(flat[current].href);
    }
  };

  let index = -1;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[6px] border-[1.5px] border-line bg-white px-3 text-left text-[15px] text-ink-mute md:max-w-md"
      >
        <IconSearch size={18} className="shrink-0" />
        <span className="truncate">Rechercher ou agir…</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[12px] md:inline">Ctrl K</kbd>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Palette de commandes" side="center">
        <label htmlFor="admin-search" className="sr-only">
          Rechercher une action, une page, un produit, une commande ou un client
        </label>
        <input
          id="admin-search"
          ref={inputRef}
          className="field"
          value={q}
          onChange={(e) => search(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Action, page, référence (GPS-…), SKU, téléphone…"
          autoComplete="off"
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls={listId}
          aria-activedescendant={flat.length ? `${listId}-${current}` : undefined}
        />
        <div className="mt-4 min-h-24 sm:w-[min(80vw,560px)]">
          <p className="sr-only" aria-live="polite">
            {loading ? "Recherche…" : `${flat.length} résultat${flat.length > 1 ? "s" : ""}`}
          </p>
          {res && !res.ok ? <p className="text-gps-red-ink">{res.error}</p> : null}
          {!loading && q.trim().length >= 2 && flat.length === 0 ? (
            <p className="text-ink-mute">Aucun résultat pour « {q} ».</p>
          ) : null}
          <div id={listId} role="listbox" aria-label="Résultats" className="grid gap-4">
            {sections.map((s) => (
              <div key={s.label} role="group" aria-label={s.label}>
                <p className="eyebrow mb-1 text-ink-mute">{s.label}</p>
                <ul className="divide-y divide-line-soft">
                  {s.rows.map((r) => {
                    index += 1;
                    const i = index;
                    return (
                      <li
                        key={`${s.label}-${r.href}`}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === current}
                        onClick={() => go(r.href)}
                        onMouseMove={() => setActive(i)}
                        className={`flex min-h-12 cursor-pointer flex-col items-start justify-center rounded px-2 ${
                          i === current ? "bg-gps-blue-soft" : ""
                        }`}
                      >
                        <span className="font-semibold">{r.title}</span>
                        {r.sub ? <span className="text-[13px] text-ink-mute">{r.sub}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          {loading ? <p className="mt-3 text-ink-mute">Recherche…</p> : null}
        </div>
      </Sheet>
    </>
  );
}

/** Bouton d'action rapide, sur mobile uniquement. */
export function QuickActionButton({ actions }: { actions: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
  if (!actions.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-fab no-print lg:hidden"
        aria-label="Actions rapides"
        aria-haspopup="dialog"
      >
        <IconPlus size={26} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Actions rapides" side="bottom">
        <ul className="grid gap-2 pb-2">
          {actions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="flex min-h-14 items-center gap-3 rounded-[6px] border-[1.5px] border-line bg-card px-4 text-[16px] font-bold"
              >
                <IconBolt size={18} className="text-gps-red" /> {a.label}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
