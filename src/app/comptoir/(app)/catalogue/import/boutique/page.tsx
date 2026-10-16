import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { gpsManifest, planGpsImport } from "@/server/domain/catalog-import-gps";
import { Badge, Forbidden, PageTitle, Panel } from "@/components/admin/ui";
import { GpsImportForm } from "@/components/admin/GpsImportForm";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Catalogue de la boutique" };

export default async function GpsImportPage() {
  const { db, allowed } = await requirePage("catalog.import");
  if (!allowed) return <Forbidden what="l'import du catalogue de la boutique" />;
  const plan = await planGpsImport(db);
  const kpis: [string, number][] = [
    ["À créer en brouillon", plan.totals.create],
    ["Variantes", plan.totals.variants],
    ["Déjà importés", plan.totals.exists],
    ["Ignorés (doublon)", plan.totals.conflict],
  ];
  return (
    <>
      <Link
        href="/comptoir/catalogue/import"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Import
      </Link>
      <PageTitle eyebrow="Catalogue" title="Catalogue de la boutique">
        Produits relevés en boutique (manifeste du {plan.version.split("-").reverse().join("/")}). Simulation ci-dessous
        : rien n&apos;est écrit avant votre confirmation. Tout arrive en brouillon privé, sans prix, coût, stock ni
        code-barres : à compléter et vérifier en boutique avant toute publication.
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([label, n]) => (
          <div key={label} className="kpi-card">
            <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">{label}</span>
            <span className="kpi-value">{n}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title={`Produits (${plan.rows.length})`} id="t-produits">
          <ul className="divide-y divide-line-soft text-[14px]" aria-label="Produits du manifeste">
            {plan.rows.map((r) => (
              <li key={r.externalKey} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere]">
                  {r.productId && r.action === "exists" ? (
                    <Link href={`/comptoir/catalogue/${r.productId}`} className="text-gps-blue underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </span>
                <span className="text-ink-mute">{r.category}</span>
                {r.variants > 1 ? <span className="text-ink-mute">{r.variants} variantes</span> : null}
                <Badge tone={r.action === "create" ? "blue" : r.action === "exists" ? "green" : "warn"}>
                  {r.action === "create" ? "À créer" : r.action === "exists" ? "Déjà importé" : "Ignoré"}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="grid content-start gap-6">
          <Panel title="Importer" id="t-importer">
            <GpsImportForm pending={plan.totals.create} />
          </Panel>
          {plan.categoriesToCreate.length ? (
            <Panel title="Catégories à créer" id="t-categories">
              <p className="text-[14px] text-ink-soft">
                Créées par le module Catégories ; masquées du site tant qu&apos;aucun produit n&apos;y est publié.
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {plan.categoriesToCreate.map((c) => (
                  <li key={c}>
                    <Badge>{c}</Badge>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title="Photos de la boutique" id="t-photos">
            <p className="text-[14px] text-ink-soft">
              {plan.missingPhotos
                ? `${plan.missingPhotos} photos attendues (${gpsManifest.photosExpected[0]} à ${gpsManifest.photosExpected.at(-1)}, sans IMG_3680) : absentes du dépôt. Les fiches sont créées sans média ; ajoutez les photos depuis chaque fiche.`
                : "Photos disponibles."}
            </p>
          </Panel>
          <Panel title="Identification requise (non importés)" id="t-identifier">
            <ul className="grid gap-1 text-[14px]">
              {gpsManifest.identificationRequired.map((x) => (
                <li key={x}>· {x}</li>
              ))}
            </ul>
            <p className="hint mt-2">
              Téléphones et tablettes d&apos;occasion : relever {gpsManifest.usedDeviceChecks.join(", ").toLowerCase()}.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
