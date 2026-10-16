import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { can } from "@/lib/permissions";
import { importColumns } from "@/server/domain/import";
import { Forbidden, PageTitle, Panel } from "@/components/admin/ui";
import { ImportForm } from "@/components/admin/ImportForm";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage() {
  const { user, allowed } = await requirePage("catalog.bulk");
  if (!allowed) return <Forbidden what="l'import du catalogue" />;
  return (
    <>
      <Link
        href="/comptoir/catalogue"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Catalogue
      </Link>
      <PageTitle eyebrow="Catalogue" title="Import CSV">
        Créez de nombreux produits d&apos;un coup depuis un tableur. Une ligne par variante ; les lignes de même nom
        forment un produit. Rien n&apos;est enregistré avant votre confirmation, et tout arrive en brouillon.
      </PageTitle>
      {can(user, "catalog.import") ? (
        <Link
          href="/comptoir/catalogue/import/boutique"
          className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border-[1.5px] border-gps-blue bg-gps-blue-soft p-4 font-bold text-gps-blue"
        >
          Catalogue relevé en boutique : simulation puis import en brouillons
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
          <ImportForm />
        </Panel>
        <Panel title="Colonnes" id="t-colonnes">
          <dl className="grid gap-2 text-[14px]">
            {importColumns.map(([k, label]) => (
              <div key={k}>
                <dt className="font-mono font-bold">{k}</dt>
                <dd className="text-ink-soft">{label}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
