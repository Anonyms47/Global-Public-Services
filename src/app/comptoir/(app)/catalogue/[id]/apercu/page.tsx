import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/server/admin";
import { productForEdit } from "@/server/domain/catalog";
import { Badge, Forbidden, PageTitle } from "@/components/admin/ui";
import { DevicePreview } from "@/components/admin/DevicePreview";
import { IconArrowLeft } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Aperçu du produit" };

export default async function ProductPreviewPage({ params }: PageProps<"/comptoir/catalogue/[id]/apercu">) {
  const { db, allowed } = await requirePage("catalog.view");
  if (!allowed) return <Forbidden />;
  const p = await productForEdit(db, (await params).id, { withCosts: false });
  if (!p || p.deletedAt) notFound();
  return (
    <>
      <Link
        href={`/comptoir/catalogue/${p.id}`}
        className="mb-3 inline-flex min-h-11 items-center gap-1 font-bold text-gps-blue hover:underline"
      >
        <IconArrowLeft size={18} /> Retour à la fiche
      </Link>
      <PageTitle eyebrow="Aperçu" title={p.name || "Produit sans nom"}>
        {p.status === "published" ? (
          <Badge tone="green">Publié</Badge>
        ) : p.status === "draft" ? (
          <Badge tone="warn">Brouillon : invisible des clients</Badge>
        ) : (
          <Badge>Archivé</Badge>
        )}{" "}
        La page telle que les clients la verront, d&apos;après la dernière version enregistrée.
      </PageTitle>
      <DevicePreview src={`/apercu/${p.id}`} />
    </>
  );
}
