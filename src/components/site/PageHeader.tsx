import type { ReactNode } from "react";
import { Ribbon } from "../brand/Ribbon";

export function PageHeader({
  eyebrow,
  title,
  children,
  tone = "paper",
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  tone?: "paper" | "blue";
}) {
  const blue = tone === "blue";
  return (
    <div className={`relative overflow-hidden ${blue ? "bg-gps-blue text-white" : ""}`}>
      {blue ? (
        <Ribbon
          tone="white"
          className="pointer-events-none absolute -right-10 bottom-0 h-full w-[70%] opacity-25"
          width={5}
        />
      ) : null}
      <div className="relative container-site pt-8 pb-10 md:pt-14 md:pb-14">
        <p className={`eyebrow ${blue ? "text-white/80" : "text-gps-red-ink"}`}>{eyebrow}</p>
        <h1 className="mt-2 max-w-4xl font-display text-[52px] leading-[0.9] font-extrabold uppercase md:text-[80px]">
          {title}
        </h1>
        {children ? (
          <div className={`mt-5 max-w-2xl text-[17px] leading-relaxed ${blue ? "text-white/85" : "text-ink-soft"}`}>
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Valeur métier non encore fournie par GPS : rien n'est affiché publiquement (champ masqué). */
export function ToConfirm(_props: { label?: string }) {
  return null;
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[70ch] space-y-4 text-[17px] leading-relaxed text-ink-soft [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:uppercase [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">
      {children}
    </div>
  );
}
