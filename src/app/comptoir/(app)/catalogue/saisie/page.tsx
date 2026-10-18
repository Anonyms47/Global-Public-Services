import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { listEntryGrid } from "@/server/domain/catalog-entry";
import { can } from "@/lib/permissions";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { EntryGrid } from "@/components/admin/EntryGrid";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Saisie rapide prix et stock" };

export default async function EntryGridPage({ searchParams }: PageProps<"/comptoir/catalogue/saisie">) {
  const { db, user, allowed } = await requirePage("catalog.edit");
  if (!allowed) return <Forbidden what="la saisie rapide" />;
  const canCosts = can(user, "catalog.costs");
  const canCount = can(user, "stock.inventory");
  const tous = (await searchParams).tous === "1";
  const rows = await listEntryGrid(db, { canCosts, includePublished: tous });
  return (
    <>
      <Link
        href="/comptoir/catalogue/a-completer"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Produits à compléter
      </Link>
      <PageTitle eyebrow="Catalogue" title={canCosts ? "Prix, coût et stock" : "Prix et stock"}>
        Toutes les versions {tous ? "du catalogue" : "des brouillons"} sur une seule page : tapez les valeurs, Entrée
        passe au champ suivant, puis « Tout enregistrer ». Chaque changement est noté dans le journal ; rien n&apos;est
        publié.{" "}
        <Link
          href={tous ? "/comptoir/catalogue/saisie" : "/comptoir/catalogue/saisie?tous=1"}
          className="font-semibold text-gps-blue underline"
        >
          {tous ? "Brouillons seulement" : "Inclure les produits en ligne"}
        </Link>
      </PageTitle>
      <EntryGrid rows={rows} canCosts={canCosts} canCount={canCount} />
    </>
  );
}
