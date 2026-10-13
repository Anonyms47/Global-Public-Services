import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { stockList } from "@/server/domain/stock";
import { getSettings } from "@/server/domain/settings";
import { optionsLabel } from "@/lib/format";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { RestockForm } from "@/components/admin/StockForms";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Réapprovisionner" };

export default async function RestockPage({ searchParams }: PageProps<"/comptoir/stock/reapprovisionner">) {
  const { db, allowed } = await requirePage("stock.restock");
  if (!allowed) return <Forbidden />;
  const s = await getSettings(db);
  const rows = await stockList(db, {
    defaultThreshold: s.stock.defaultLowThreshold,
  });
  const pre = (await searchParams).variante;
  return (
    <>
      <Link
        href="/comptoir/stock"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Stock
      </Link>
      <PageTitle eyebrow="Stock" title="Réapprovisionner">
        Un lot = une livraison reçue. Ajoutez les articles reçus, vérifiez, confirmez : le stock physique augmente et
        chaque mouvement garde le lot, le motif et l&apos;auteur.
      </PageTitle>
      <RestockForm
        preselect={typeof pre === "string" ? pre : undefined}
        variants={rows.map((r) => ({
          id: r.variant_id,
          label: `${r.product_name}${optionsLabel(r.options) ? ` — ${optionsLabel(r.options)}` : ""}`,
          sku: r.sku,
          available: r.available,
          onHand: r.on_hand,
          low: r.low,
        }))}
      />
    </>
  );
}
