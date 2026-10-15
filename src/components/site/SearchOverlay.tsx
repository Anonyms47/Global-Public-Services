"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { searchProducts, type SearchHit } from "@/app/(site)/actions/recherche";
import { fcfa } from "@/lib/format";
import { IconArrowRight, IconClose, IconSearch } from "../ui/icons";

const RECENT_KEY = "gps-recherches-v1";
const SUGGESTIONS = ["Téléphone", "Écouteurs", "Chargeur", "Casque", "Lunettes", "Baskets"];

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Met en évidence les mots recherchés (sans tenir compte des accents). */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = fold(query)
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!terms.length) return <>{text}</>;
  const folded = fold(text);
  const marks = new Array(text.length).fill(false);
  for (const t of terms) {
    let i = folded.indexOf(t);
    while (i !== -1) {
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = folded.indexOf(t, i + t.length);
    }
  }
  const out: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marks[i] !== marks[start]) {
      const part = text.slice(start, i);
      out.push(
        marks[start] ? (
          <mark key={start} className="rounded-[3px] bg-gps-red/15 text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      );
      start = i;
    }
  }
  return <>{out}</>;
}

/**
 * Recherche plein écran : résultats instantanés pendant la saisie, recherches
 * récentes, univers et suggestions. Ouverture au clic, avec « / » ou Ctrl/⌘ K.
 */
export function SearchOverlay({ categories }: { categories: { slug: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Ordinateur : faux champ qui ouvre la recherche */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group hidden h-11 w-[min(28vw,340px)] items-center gap-3 rounded-full border border-line bg-white pr-2 pl-4 text-left text-[15px] text-ink-mute transition-colors hover:border-gps-blue md:flex"
        aria-haspopup="dialog"
      >
        <IconSearch size={18} className="text-ink-soft group-hover:text-gps-blue" />
        <span className="flex-1">Rechercher un article…</span>
        <kbd className="rounded-[6px] border border-line bg-paper px-1.5 py-0.5 font-sans text-[12px] font-bold text-ink-soft">
          /
        </kbd>
      </button>
      {/* Mobile : icône */}
      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-ink/5 md:hidden"
        aria-label="Rechercher"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <IconSearch size={22} />
      </button>

      <dialog
        ref={ref}
        aria-label="Rechercher"
        className="search-overlay"
        onClose={() => {
          document.documentElement.style.overflow = "";
          setOpen(false);
          opener.current?.focus?.();
        }}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        {open ? <SearchPanel categories={categories} onClose={() => setOpen(false)} /> : null}
      </dialog>
    </>
  );
}

function SearchPanel({ categories, onClose }: { categories: { slug: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ q: string; hits: SearchHit[]; total: number } | null>(null);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [pending, startTransition] = useTransition();
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    const t = window.setTimeout(() => {
      startTransition(async () => {
        const r = await searchProducts(term);
        setResult({ q: term, ...r });
        setActive(-1);
      });
    }, 180);
    return () => window.clearTimeout(t);
  }, [term]);

  const shown = term.length >= 2 && result ? result : null;
  const hits = shown?.hits ?? [];

  const go = (query: string) => {
    const v = query.trim();
    if (!v) return;
    saveRecent(v);
    router.push(`/boutique?q=${encodeURIComponent(v)}`);
    onClose();
  };
  const openHit = (h: SearchHit) => {
    saveRecent(term);
    router.push(`/produits/${h.slug}`);
    onClose();
  };

  return (
    <div className="search-panel">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && hits[active]) openHit(hits[active]);
          else go(q);
        }}
        className="flex items-center gap-2 border-b border-line px-4 py-3 md:px-6 md:py-4"
      >
        <IconSearch size={22} className={`shrink-0 ${pending ? "animate-pulse text-gps-red" : "text-gps-blue"}`} />
        <label htmlFor="recherche-globale" className="sr-only">
          Rechercher un produit, une marque ou une référence
        </label>
        <input
          id="recherche-globale"
          type="search"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % hits.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
            }
          }}
          placeholder="Téléphone, écouteurs, une marque…"
          className="h-12 min-w-0 flex-1 bg-transparent text-[19px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-mute md:text-[22px]"
        />
        {q ? (
          <button
            type="button"
            className="inline-flex h-9 shrink-0 items-center rounded-full bg-paper-deep px-3 text-[13px] font-bold text-ink-soft hover:bg-line"
            onClick={() => setQ("")}
          >
            Effacer
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-ink/5"
          aria-label="Fermer la recherche"
        >
          <IconClose size={22} />
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        {term.length < 2 ? (
          <div className="grid gap-7">
            {recent.length ? (
              <section aria-labelledby="titre-recentes">
                <div className="flex items-center justify-between">
                  <h2 id="titre-recentes" className="eyebrow text-ink-mute">
                    Recherches récentes
                  </h2>
                  <button
                    type="button"
                    className="text-[13px] font-semibold text-ink-soft underline-offset-2 hover:underline"
                    onClick={() => {
                      try {
                        localStorage.removeItem(RECENT_KEY);
                      } catch {}
                      setRecent([]);
                    }}
                  >
                    Effacer
                  </button>
                </div>
                <ul className="mt-2">
                  {recent.map((r) => (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => go(r)}
                        className="flex min-h-12 w-full items-center gap-3 border-b border-line-soft text-left font-semibold hover:text-gps-blue"
                      >
                        <IconSearch size={16} className="text-ink-mute" /> {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section aria-labelledby="titre-suggestions">
              <h2 id="titre-suggestions" className="eyebrow text-ink-mute">
                On cherche souvent
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button type="button" className="search-chip" onClick={() => setQ(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {categories.length ? (
              <section aria-labelledby="titre-univers-recherche">
                <h2 id="titre-univers-recherche" className="eyebrow text-ink-mute">
                  Parcourir les univers
                </h2>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {categories.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`/categories/${c.slug}`}
                        onClick={onClose}
                        className="flex min-h-14 items-center justify-between gap-2 rounded-[12px] bg-paper-deep px-4 font-display text-lg leading-none font-bold uppercase transition-colors hover:bg-gps-blue hover:text-white"
                      >
                        {c.name}
                        <IconArrowRight size={16} className="shrink-0 opacity-50" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : !shown ? (
          <ul className="grid gap-2" aria-busy="true" aria-label="Recherche en cours">
            {[0, 1, 2].map((i) => (
              <li key={i} className="skeleton h-[76px] rounded-[14px]" />
            ))}
          </ul>
        ) : hits.length ? (
          <>
            <p className="mb-3 text-[14px] text-ink-soft" aria-live="polite">
              {shown.total} article{shown.total > 1 ? "s" : ""} pour « {shown.q} »
            </p>
            <ul id={listId} role="listbox" aria-label="Articles trouvés" className="grid gap-2">
              {hits.map((h, i) => (
                <li
                  key={h.slug}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className="search-hit"
                  style={{ animationDelay: `${i * 40}ms` }}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openHit(h)}
                >
                  <span className="block h-16 w-14 shrink-0 overflow-hidden rounded-[10px] bg-paper-deep">
                    {h.image ? (
                      <Image
                        src={h.image}
                        alt=""
                        width={112}
                        height={128}
                        unoptimized={h.image.endsWith(".svg")}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      <Highlight text={h.name} query={shown.q} />
                    </span>
                    <span className="block truncate text-[13px] text-ink-mute">
                      {[h.brand, h.category].filter(Boolean).join(" · ")}
                      {h.available ? "" : " · épuisé"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-lg leading-none font-extrabold tabular">
                      {fcfa(h.price)}
                    </span>
                    {h.basePrice > h.price ? (
                      <span className="block text-[12px] text-ink-mute tabular line-through">{fcfa(h.basePrice)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => go(shown.q)} className="btn btn-ink mt-4 w-full">
              Voir {shown.total > hits.length ? `les ${shown.total} résultats` : "dans la boutique"}{" "}
              <IconArrowRight size={18} />
            </button>
          </>
        ) : (
          <div className="py-10 text-center" aria-live="polite">
            <p className="font-display text-3xl font-extrabold uppercase">Aucun article trouvé</p>
            <p className="mx-auto mt-2 max-w-sm text-ink-soft">
              Rien pour « {shown.q} ». Essayez un autre mot, ou demandez directement à GPS : on vous trouve
              l&apos;article.
            </p>
            <ul className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.slice(0, 4).map((s) => (
                <li key={s}>
                  <button type="button" className="search-chip" onClick={() => setQ(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="hidden border-t border-line px-6 py-2.5 text-[12px] text-ink-mute md:block">
        <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> pour choisir · <kbd className="kbd">Entrée</kbd> pour
        ouvrir · <kbd className="kbd">Échap</kbd> pour fermer
      </p>
    </div>
  );
}
