"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "../ui/icons";

export type FaqGroup = { title: string; items: { q: string; a: string }[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Questions groupées par thème, avec filtre instantané. */
export function FaqList({ groups }: { groups: FaqGroup[] }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => norm(i.q + " " + i.a).includes(t)) }))
      .filter((g) => g.items.length);
  }, [groups, q]);
  const count = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <div>
      <div className="relative max-w-xl">
        <label htmlFor="faq-filtre" className="sr-only">
          Filtrer les questions
        </label>
        <IconSearch size={20} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-mute" />
        <input
          id="faq-filtre"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Livraison, garantie, paiement…"
          className="field h-14 rounded-full pl-12 text-[16px]"
          autoComplete="off"
        />
      </div>
      <p className="mt-3 text-[14px] text-ink-mute" aria-live="polite">
        {q.trim() ? `${count} réponse${count > 1 ? "s" : ""}` : " "}
      </p>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-[18px] border border-dashed border-line p-6 text-ink-soft">
          Aucune question ne correspond. Posez-la directement à GPS : le bloc ci-dessous vous y mène.
        </p>
      ) : (
        <div className="mt-6 grid gap-10">
          {shown.map((g) => (
            <section key={g.title} aria-label={g.title}>
              <h2 className="font-display text-[26px] leading-none font-bold uppercase">{g.title}</h2>
              <div className="mt-4 grid gap-2">
                {g.items.map((item) => (
                  <details key={item.q} className="faq-item group" open={!!q.trim()}>
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-[16.5px] font-bold [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span aria-hidden="true" className="faq-plus">
                        <span />
                        <span />
                      </span>
                    </summary>
                    <p className="px-5 pb-5 text-[15.5px] leading-relaxed text-ink-soft">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
