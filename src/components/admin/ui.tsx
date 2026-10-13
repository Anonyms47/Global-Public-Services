import Link from "next/link";
import type { ReactNode } from "react";
import { fcfa } from "@/lib/format";
import { IconAlert } from "../ui/icons";

export function PageTitle({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
      <div>
        {eyebrow ? <p className="eyebrow text-gps-red-ink">{eyebrow}</p> : null}
        <h1 className="mt-1 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-[52px]">
          {title}
        </h1>
        {children ? <div className="mt-2 max-w-2xl text-[15px] text-ink-soft">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = "",
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`rounded-[6px] border border-line bg-card ${className}`} aria-labelledby={id}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 md:px-5">
          <h2 id={id} className="text-[15px] font-extrabold tracking-wide uppercase">
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

const tones = {
  neutral: "bg-paper-deep text-ink-soft",
  blue: "bg-gps-blue-soft text-gps-blue",
  green: "bg-wa-soft text-wa-ink",
  red: "bg-gps-red-soft text-gps-red-ink",
  warn: "bg-warn-soft text-warn",
  ink: "bg-ink text-white",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-[4px] px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Money({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`whitespace-nowrap tabular ${className}`}>{fcfa(value)}</span>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[6px] border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-2xl font-bold uppercase">{title}</p>
      {children ? <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-soft">{children}</p> : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Forbidden({ what = "cette page" }: { what?: string }) {
  return (
    <div className="mx-auto max-w-xl rounded-[6px] border border-line bg-card p-8 text-center">
      <IconAlert className="mx-auto text-gps-red-ink" size={32} />
      <h1 className="mt-3 font-display text-3xl font-bold uppercase">Droits insuffisants</h1>
      <p className="mt-2 text-ink-soft">
        Votre rôle ne permet pas d&apos;accéder à {what}. Demandez à un propriétaire de l&apos;équipe si vous en avez
        besoin.
      </p>
      <Link href="/comptoir" className="btn btn-blue mt-6">
        Retour à Aujourd&apos;hui
      </Link>
    </div>
  );
}

export function Tabs({
  items,
  current,
}: {
  items: { href: string; label: string; count?: number; key: string }[];
  current: string;
}) {
  return (
    <nav aria-label="Vues" className="-mx-4 mb-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {items.map((t) => {
          const on = t.key === current;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 border-b-[3px] px-3 text-[15px] font-semibold ${on ? "border-gps-red text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}
              >
                {t.label}
                {t.count != null ? (
                  <span
                    className={`rounded-full px-1.5 text-[12px] tabular ${on ? "bg-ink text-white" : "bg-paper-deep"}`}
                  >
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
