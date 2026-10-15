"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { ShopQuery } from "@/server/domain/catalog";
import { fcfa } from "@/lib/format";
import { Sheet } from "../ui/Sheet";
import { IconClose, IconFilter } from "../ui/icons";
import { shopQueryToParams } from "./query";

const sortLabels = {
  nouveautes: "Nouveautés",
  "prix-asc": "Prix croissant",
  "prix-desc": "Prix décroissant",
} as const;

interface Facets {
  brands: string[];
  conditions: string[];
  hasPromo: boolean;
  priceMin: number;
  priceMax: number;
}

const SCROLL_PREFIX = "gps-scroll:";
export const RESTORE_KEY = "gps-restore";

/** Mémorise la position dans la liste avant d'ouvrir une fiche, et la rétablit au retour. */
export function ScrollMemory({ listingKey }: { listingKey: string }) {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(RESTORE_KEY) === listingKey) {
        sessionStorage.removeItem(RESTORE_KEY);
        const y = Number(sessionStorage.getItem(SCROLL_PREFIX + listingKey) ?? 0);
        requestAnimationFrame(() => window.scrollTo({ top: y }));
      }
    } catch {}
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href*='depuis=']");
      if (!a) return;
      try {
        sessionStorage.setItem(SCROLL_PREFIX + listingKey, String(window.scrollY));
      } catch {}
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [listingKey]);
  return null;
}

export function ShopControls({
  basePath,
  query,
  facets,
  categories,
  count,
}: {
  basePath: string;
  query: ShopQuery;
  facets: Facets;
  categories: { slug: string; name: string }[];
  count: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [priceMin, setPriceMin] = useState(query.prixMin?.toString() ?? "");
  const [priceMax, setPriceMax] = useState(query.prixMax?.toString() ?? "");
  const priceKey = `${query.prixMin ?? ""}|${query.prixMax ?? ""}`;
  const [seenPrice, setSeenPrice] = useState(priceKey);
  if (seenPrice !== priceKey) {
    setSeenPrice(priceKey);
    setPriceMin(query.prixMin?.toString() ?? "");
    setPriceMax(query.prixMax?.toString() ?? "");
  }

  const go = (next: ShopQuery) => {
    const p = shopQueryToParams(next, {
      omitCategory: basePath !== "/boutique",
    });
    startTransition(() => router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false }));
  };
  const set = (patch: Partial<ShopQuery>) => go({ ...query, ...patch });

  const active: { label: string; clear: Partial<ShopQuery> }[] = [];
  if (query.q) active.push({ label: `« ${query.q} »`, clear: { q: undefined } });
  if (query.categorie && basePath === "/boutique") {
    active.push({
      label: categories.find((c) => c.slug === query.categorie)?.name ?? query.categorie,
      clear: { categorie: undefined },
    });
  }
  query.marque?.forEach((m) =>
    active.push({
      label: m,
      clear: { marque: query.marque!.filter((x) => x !== m) },
    }),
  );
  if (query.prixMin != null)
    active.push({
      label: `Dès ${fcfa(query.prixMin)}`,
      clear: { prixMin: undefined },
    });
  if (query.prixMax != null)
    active.push({
      label: `Jusqu'à ${fcfa(query.prixMax)}`,
      clear: { prixMax: undefined },
    });
  if (query.dispo) active.push({ label: "Disponibles", clear: { dispo: undefined } });
  if (query.promo) active.push({ label: "En promotion", clear: { promo: undefined } });
  if (query.etat) active.push({ label: query.etat, clear: { etat: undefined } });

  const applyPrice = () => {
    const toNum = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Math.round(Number(s.replace(/\s/g, "")))));
    const min = toNum(priceMin);
    const max = toNum(priceMax);
    set({
      prixMin: Number.isFinite(min) ? min : undefined,
      prixMax: Number.isFinite(max) ? max : undefined,
    });
  };

  const filters = (
    <div className="grid gap-6 lg:flex lg:flex-wrap lg:items-end lg:gap-4">
      {facets.brands.length > 1 ? (
        <fieldset>
          <legend className="label">Marque</legend>
          <div className="flex flex-wrap gap-2">
            {facets.brands.map((b) => {
              const on = query.marque?.includes(b) ?? false;
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set({
                      marque: on ? query.marque!.filter((x) => x !== b) : [...(query.marque ?? []), b],
                    })
                  }
                  className={`chip min-h-12 lg:min-h-11 ${on ? "border-gps-blue bg-gps-blue text-white" : ""}`}
                >
                  {b}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applyPrice();
          setOpen(false);
        }}
      >
        <div className="w-32">
          <label className="label" htmlFor="f-min">
            Prix min.
          </label>
          <input
            id="f-min"
            inputMode="numeric"
            className="field"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            placeholder={String(facets.priceMin)}
          />
        </div>
        <div className="w-32">
          <label className="label" htmlFor="f-max">
            Prix max.
          </label>
          <input
            id="f-max"
            inputMode="numeric"
            className="field"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            placeholder={String(facets.priceMax)}
          />
        </div>
        <button type="submit" className="btn btn-outline btn-sm min-h-12">
          OK
        </button>
      </form>
      {facets.conditions.length > 1 ? (
        <div className="lg:w-44">
          <label className="label" htmlFor="f-etat">
            État
          </label>
          <select
            id="f-etat"
            className="field"
            value={query.etat ?? ""}
            onChange={(e) => set({ etat: e.target.value || undefined })}
          >
            <option value="">Tous</option>
            {facets.conditions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!!query.dispo}
          onClick={() => set({ dispo: query.dispo ? undefined : true })}
          className={`chip min-h-12 ${query.dispo ? "border-gps-blue bg-gps-blue text-white" : ""}`}
        >
          Disponibles uniquement
        </button>
        {facets.hasPromo || query.promo ? (
          <button
            type="button"
            aria-pressed={!!query.promo}
            onClick={() => set({ promo: query.promo ? undefined : true })}
            className={`chip min-h-12 ${query.promo ? "border-gps-red bg-gps-red text-white" : ""}`}
          >
            En promotion
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="contents">
      <div className="hidden rounded-[22px] border border-line bg-card p-5 shadow-[0_12px_32px_-24px_rgb(20_16_57/0.35)] lg:block">
        {filters}
      </div>

      <div className="shop-toolbar sticky top-16 z-30 -mx-4 mt-3 flex flex-nowrap items-center justify-between gap-2 px-4 py-2.5 md:top-[84px] md:-mx-8 md:px-8">
        <p className="shrink-0 text-[14px] font-semibold whitespace-nowrap md:text-[15px]" aria-live="polite">
          <span className="tabular">{count}</span> article{count > 1 ? "s" : ""}
          {pending ? <span className="ml-2 text-ink-mute">· mise à jour…</span> : null}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ink btn-sm lg:hidden" onClick={() => setOpen(true)}>
            <IconFilter size={17} /> Filtres
            {active.length ? <span className="filter-count tabular">{active.length}</span> : null}
          </button>
          <label htmlFor="f-tri" className="sr-only">
            Trier par
          </label>
          <select
            id="f-tri"
            className="field h-10 min-h-10 w-auto rounded-full py-0 pr-8 pl-4 text-[14px] md:text-[15px]"
            value={query.tri ?? "nouveautes"}
            onChange={(e) => set({ tri: e.target.value as ShopQuery["tri"] })}
          >
            {Object.entries(sortLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {active.length ? (
        <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Filtres sélectionnés">
          {active.map((a) => (
            <li key={a.label}>
              <button
                type="button"
                className="chip border-gps-blue/40 bg-gps-blue-soft"
                onClick={() => set(a.clear)}
                aria-label={`Retirer le filtre ${a.label}`}
              >
                {a.label} <IconClose size={14} />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="min-h-9 px-2 text-sm font-bold text-gps-blue underline underline-offset-2"
              onClick={() => go({ tri: query.tri })}
            >
              Tout effacer
            </button>
          </li>
        </ul>
      ) : null}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filtres"
        side="bottom"
        footer={
          <button type="button" className="btn btn-ink w-full" onClick={() => setOpen(false)}>
            Voir {count} article{count > 1 ? "s" : ""}
          </button>
        }
      >
        {filters}
      </Sheet>
    </div>
  );
}
