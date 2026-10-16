import Link from "next/link";
import { IconInfo } from "../ui/icons";

/**
 * Filtre « Inclure la démonstration » (désactivé par défaut) et mention du
 * périmètre des chiffres affichés. Partageable dans l'adresse (?demo=1).
 */
export function ScopeFilter({
  includeDemo,
  demoCount,
  toggleHref,
  what = "commande",
  demoMode = true,
}: {
  includeDemo: boolean;
  /** Commandes d'exemple de la période (incluses ou exclues). */
  demoCount: number;
  toggleHref: string;
  what?: string;
  /** Hors démonstration et sans donnée d'exemple, le filtre n'a pas lieu d'être : rien n'est affiché. */
  demoMode?: boolean;
}) {
  if (!demoMode && !includeDemo && demoCount === 0) return null;
  const plural = demoCount > 1 ? "s" : "";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border border-line bg-card px-3 py-2 text-[14px]">
      <Link
        href={toggleHref}
        role="switch"
        aria-checked={includeDemo}
        className="inline-flex min-h-10 items-center gap-2 font-semibold"
        scroll={false}
      >
        <span
          aria-hidden="true"
          className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors ${includeDemo ? "bg-gps-blue" : "bg-line"}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${includeDemo ? "left-[18px]" : "left-0.5"}`}
          />
        </span>
        Inclure la démonstration
      </Link>
      <p className="flex w-full min-w-0 items-start gap-1.5 text-ink-soft sm:w-auto sm:flex-1" data-testid="scope">
        <IconInfo size={16} className="mt-0.5 shrink-0" />
        <span>
          <strong>Périmètre :</strong>{" "}
          {includeDemo ? "données réelles et données de démonstration" : "données réelles uniquement"}
          {demoCount
            ? ` — ${demoCount} ${what}${plural} d'exemple ${includeDemo ? "incluse" : "exclue"}${plural} sur la période.`
            : "."}
        </span>
      </p>
    </div>
  );
}
