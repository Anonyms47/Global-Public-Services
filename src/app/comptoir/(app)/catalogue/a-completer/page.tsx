import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { listToComplete, toCompleteFilters, type ToCompleteFilter } from "@/server/domain/catalog-entry";
import { can } from "@/lib/permissions";
import { Badge, Forbidden, PageTitle } from "@/components/admin/ui";
import { PublishReady } from "@/components/admin/PublishReady";
import { IconArrowLeft, IconImage } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Produits à compléter" };

const flagTone: Record<ToCompleteFilter, "red" | "warn" | "blue" | "green" | "neutral"> = {
  "sans-photo": "red",
  "sans-prix": "red",
  "sans-cout": "warn",
  "sans-stock": "warn",
  "sans-garantie": "neutral",
  "a-verifier": "blue",
  variantes: "red",
  pret: "green",
};

export default async function ToCompletePage({ searchParams }: PageProps<"/comptoir/catalogue/a-completer">) {
  const { db, user, allowed } = await requirePage("catalog.edit");
  if (!allowed) return <Forbidden what="la complétion du catalogue" />;
  const canCosts = can(user, "catalog.costs");
  const canPublish = can(user, "catalog.bulk");
  const raw = (await searchParams).filtre;
  const filters = toCompleteFilters.filter(([k]) => canCosts || k !== "sans-cout");
  const filtre = filters.some(([k]) => k === raw) ? (raw as ToCompleteFilter) : null;
  const { rows, total, complete } = await listToComplete(db, { canCosts });
  const shown = filtre ? rows.filter((r) => r.flags.includes(filtre)) : rows.filter((r) => !r.flags.includes("pret"));
  const labels = Object.fromEntries(toCompleteFilters);
  const pct = total ? Math.round((complete / total) * 100) : 0;
  const q = `completer=${filtre ?? "tous"}`;
  return (
    <>
      <Link
        href="/comptoir/catalogue"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Catalogue
      </Link>
      <PageTitle eyebrow="Catalogue" title="Produits à compléter">
        Les brouillons, un par un : seules les informations manquantes sont demandées. Rien n&apos;est publié
        automatiquement.
      </PageTitle>

      <div className="kpi-card mb-5 max-w-xl">
        <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">Avancement</span>
        <span className="kpi-value" data-testid="progression-catalogue">
          {complete} produit{complete > 1 ? "s" : ""} complété{complete > 1 ? "s" : ""} sur {total}
        </span>
        <span className="mt-3 h-2 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
          <span className="block h-full bg-wa" style={{ width: `${pct}%` }} />
        </span>
        <span className="mt-2 text-[13px] text-ink-mute">
          « Complété » = prêt à publier (nom, catégorie, prix, photo). La publication reste une décision humaine.
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/comptoir/catalogue/saisie" className="btn btn-primary" data-testid="lien-saisie-grille">
          {canCosts ? "Saisir prix et coûts" : "Saisir les prix"} sur une seule page
        </Link>
      </div>

      {canPublish && filtre === "pret" ? (
        <PublishReady
          products={rows.filter((r) => r.flags.includes("pret")).map((r) => ({ id: r.id, name: r.name }))}
        />
      ) : null}

      <nav aria-label="Filtres" className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/comptoir/catalogue/a-completer"
          className={`chip ${!filtre ? "!border-ink !bg-ink !text-white" : ""}`}
          aria-current={!filtre ? "page" : undefined}
        >
          À compléter ({rows.filter((r) => !r.flags.includes("pret")).length})
        </Link>
        {filters.map(([k, l]) => (
          <Link
            key={k}
            href={`/comptoir/catalogue/a-completer?filtre=${k}`}
            className={`chip ${filtre === k ? "!border-ink !bg-ink !text-white" : ""}`}
            aria-current={filtre === k ? "page" : undefined}
          >
            {l} ({rows.filter((r) => r.flags.includes(k)).length})
          </Link>
        ))}
      </nav>

      {shown.length ? (
        <>
          <Link href={`/comptoir/catalogue/${shown[0].id}?${q}`} className="btn btn-primary mb-4">
            Commencer par « {shown[0].name} »
          </Link>
          <ul className="grid gap-3 lg:grid-cols-2" aria-label="Produits à compléter">
            {shown.map((r) => (
              <li key={r.id} className="grid grid-cols-[72px_1fr] gap-3 rounded-[6px] border border-line bg-card p-3">
                <div className="relative aspect-[4/5] w-[72px] overflow-hidden rounded-[4px] bg-paper-deep">
                  {r.photo ? (
                    <Image src={r.photo} alt="" fill sizes="72px" unoptimized className="object-cover" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-ink-mute">
                      <IconImage size={22} />
                    </span>
                  )}
                </div>
                <div className="grid min-w-0 content-start gap-1">
                  <p className="font-bold [overflow-wrap:anywhere]">{r.name}</p>
                  <p className="text-[13px] text-ink-mute">
                    {[r.category, r.brand, r.model].filter(Boolean).join(" · ")}
                    {r.variants > 1 ? ` · ${r.variants} variantes` : ""}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {r.flags.map((f) => (
                      <Badge key={f} tone={flagTone[f]}>
                        {labels[f]}
                      </Badge>
                    ))}
                    {!r.photo ? <Badge tone="warn">Photo exacte à prendre en boutique</Badge> : null}
                    {r.internetPhotos ? <Badge tone="blue">{r.internetPhotos} photo(s) Internet</Badge> : null}
                  </div>
                  {r.notes ? <p className="text-[13px] text-ink-soft">Note : {r.notes}</p> : null}
                  {r.checks.length && !r.checksDone ? (
                    <details className="text-[13px]">
                      <summary className="cursor-pointer font-semibold">Vérifications ({r.checks.length})</summary>
                      <ul className="mt-1 grid gap-0.5">
                        {r.checks.map((c) => (
                          <li key={c}>☐ {c}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Link href={`/comptoir/catalogue/${r.id}?${q}`} className="btn btn-blue btn-sm">
                      Compléter
                    </Link>
                    {!r.photo ? (
                      <Link href={`/comptoir/catalogue/${r.id}?${q}#etape-photos`} className="btn btn-outline btn-sm">
                        Prendre les photos
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-[6px] border border-line bg-card p-5 text-ink-soft">
          {filtre ? "Aucun produit dans ce filtre." : "Tous les brouillons sont prêts à publier."}
        </p>
      )}
    </>
  );
}
