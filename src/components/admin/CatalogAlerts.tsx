import Link from "next/link";
import { alertKindLabels, type CatalogAlert } from "@/server/domain/catalog-checks";

const dot = { high: "bg-gps-red", medium: "bg-amber-500", low: "bg-ink-mute" } as const;

/** Espace « À vérifier » : chaque alerte dit le problème et mène à la fiche. Rien n'est modifié ici. */
export function CatalogAlerts({ alerts }: { alerts: CatalogAlert[] }) {
  if (!alerts.length)
    return (
      <p className="mb-5 rounded-lg border border-line bg-paper p-3 text-[14px]" data-testid="a-verifier-vide">
        Rien à vérifier dans le catalogue pour le moment.
      </p>
    );
  return (
    <section className="mb-6" aria-labelledby="a-verifier-titre" data-testid="a-verifier">
      <h2 id="a-verifier-titre" className="mb-2 text-lg font-bold">
        À vérifier <span className="text-ink-mute">({alerts.length})</span>
      </h2>
      <ul className="grid gap-2">
        {alerts.map((a) => (
          <li key={a.key} className="rounded-lg border border-line bg-white">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-start gap-2 p-3 text-[14.5px] font-bold">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot[a.severity]}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[12px] font-bold tracking-wide text-ink-mute uppercase">
                    {alertKindLabels[a.kind]}
                  </span>
                  {a.title}
                </span>
              </summary>
              <div className="border-t border-line p-3 text-[14px]">
                <p className="mb-2 text-ink-soft">{a.detail}</p>
                <ul className={a.compare ? "grid gap-2 sm:grid-cols-2" : "grid gap-1"}>
                  {a.products.map((p) => (
                    <li key={p.id} className="rounded-md bg-paper p-2">
                      <Link href={`/comptoir/catalogue/${p.id}`} className="font-bold text-gps-blue hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-[13px] text-ink-mute">
                        {p.status} · {p.category} · {p.price} · {p.photos} photo{p.photos > 1 ? "s" : ""} · {p.specs}{" "}
                        caractéristique{p.specs > 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
