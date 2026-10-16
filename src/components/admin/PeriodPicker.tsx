import Link from "next/link";
import type { Period } from "@/server/domain/reports";

const periods = [
  ["jour", "Aujourd'hui"],
  ["7j", "7 jours"],
  ["30j", "30 jours"],
  ["mois", "Ce mois"],
] as const;

/** Sélecteur de période partageable dans l'URL (?periode=…&du=…&au=…). */
export function PeriodPicker({
  base,
  period,
  extra = {},
}: {
  base: string;
  period: Period & { key: string };
  /** Paramètres conservés d'un choix à l'autre (ex. filtre de démonstration). */
  extra?: Record<string, string>;
}) {
  const toDay = new Date(period.to.getTime() - 86400000);
  const keep = new URLSearchParams(extra).toString();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <nav aria-label="Période" className="flex flex-wrap gap-1">
        {periods.map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?periode=${k}${keep ? `&${keep}` : ""}`}
            aria-current={period.key === k ? "page" : undefined}
            className={`chip ${period.key === k ? "border-ink bg-ink text-white" : ""}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form className="flex flex-wrap items-end gap-2" action={base}>
        <input type="hidden" name="periode" value="perso" />
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div>
          <label className="label text-[13px]" htmlFor="periode-du">
            Du
          </label>
          <input
            id="periode-du"
            name="du"
            type="date"
            className="field h-10 min-h-10 py-0"
            defaultValue={period.key === "perso" ? period.from.toISOString().slice(0, 10) : undefined}
          />
        </div>
        <div>
          <label className="label text-[13px]" htmlFor="periode-au">
            Au
          </label>
          <input
            id="periode-au"
            name="au"
            type="date"
            className="field h-10 min-h-10 py-0"
            defaultValue={period.key === "perso" ? toDay.toISOString().slice(0, 10) : undefined}
          />
        </div>
        <button className="btn btn-outline btn-sm">Appliquer</button>
      </form>
    </div>
  );
}
