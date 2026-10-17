import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { stockList } from "@/server/domain/stock";
import { getSettings } from "@/server/domain/settings";
import { optionsLabel } from "@/lib/format";
import { Forbidden, PageTitle } from "@/components/admin/ui";
import { QuickCount } from "@/components/admin/QuickCount";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Comptage rapide" };

export default async function QuickCountPage({ searchParams }: PageProps<"/comptoir/stock/comptage">) {
  const { db, allowed } = await requirePage("stock.inventory");
  if (!allowed) return <Forbidden />;
  const q = (await searchParams).q;
  const s = await getSettings(db);
  const rows = await stockList(db, {
    q: typeof q === "string" ? q : undefined,
    defaultThreshold: s.stock.defaultLowThreshold,
  });
  const photos = rows.length
    ? await db.query<{ product_id: string; url: string }>(
        `select distinct on (product_id) product_id, url from product_images
          where product_id = any($1) and kind <> 'video' order by product_id, position`,
        [[...new Set(rows.map((r) => r.product_id))]],
      )
    : [];
  const photo = new Map(photos.map((p) => [p.product_id, p.url]));
  return (
    <>
      <Link
        href="/comptoir/stock"
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Stock
      </Link>
      <PageTitle eyebrow="Stock" title="Comptage rapide">
        Un article à la fois : comptez, saisissez la quantité, passez au suivant. Chaque correction est tracée (ancienne
        et nouvelle quantité, écart, personne, date, motif) sur le stock unique de l&apos;entreprise.
      </PageTitle>
      <QuickCount
        query={typeof q === "string" ? q : ""}
        rows={rows.map((r) => ({
          variantId: r.variant_id,
          productId: r.product_id,
          name: r.product_name,
          variant: optionsLabel(r.options),
          sku: r.sku,
          onHand: r.on_hand,
          reserved: r.reserved + r.unsellable,
          photo: photo.get(r.product_id) ?? null,
        }))}
      />
    </>
  );
}
