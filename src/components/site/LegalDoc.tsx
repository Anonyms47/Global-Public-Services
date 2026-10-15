import type { ReactNode } from "react";
import Link from "next/link";
import { IconInfo } from "../ui/icons";

export type LegalSection = { id: string; title: string; body: ReactNode };

/** Page légale : sommaire collant, sections numérotées sur une feuille. */
export function LegalDoc({
  title,
  intro,
  notice,
  sections,
  other,
}: {
  title: string;
  intro: ReactNode;
  notice: ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <>
      <div className="container-site pt-10 pb-8 md:pt-16">
        <p className="eyebrow text-gps-red-ink">Informations légales</p>
        <h1 className="mt-3 font-display text-[52px] leading-[0.9] font-extrabold uppercase md:text-[88px]">
          {title}
          <span className="text-gps-red">.</span>
        </h1>
        <div className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-soft">{intro}</div>
        <p className="mt-6 flex max-w-2xl gap-3 rounded-[16px] border border-warn/30 bg-warn-soft p-4 text-[15px] text-warn">
          <IconInfo className="mt-0.5 shrink-0" size={18} />
          <span>{notice}</span>
        </p>
      </div>

      <div className="container-site grid gap-10 pb-16 lg:grid-cols-12">
        <nav aria-label="Sommaire" className="lg:col-span-3">
          <div className="lg:sticky lg:top-28">
            <p className="text-[13px] font-bold tracking-[0.12em] text-ink-mute uppercase">Sommaire</p>
            <ol className="mt-3 grid gap-1 text-[15px]">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="legal-toc">
                    <span className="text-ink-mute tabular">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
            <Link
              href={other.href}
              className="mt-6 inline-block text-[14px] font-semibold text-gps-blue hover:underline"
            >
              {other.label} →
            </Link>
          </div>
        </nav>
        <article className="legal-sheet lg:col-span-9">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="legal-section" aria-labelledby={`${s.id}-t`}>
              <h2
                id={`${s.id}-t`}
                className="flex items-baseline gap-3 font-display text-[28px] leading-none font-bold uppercase"
              >
                <span className="text-[18px] text-gps-red tabular">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="mt-3 max-w-[68ch] space-y-3 text-[16.5px] leading-relaxed text-ink-soft [&_strong]:text-ink">
                {s.body}
              </div>
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
