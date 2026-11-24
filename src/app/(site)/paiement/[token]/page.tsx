import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { siteContext } from "@/server/context";
import { payViewByToken } from "@/server/domain/payment-link";
import { PayPanel } from "@/components/shop/PayPanel";

export const metadata: Metadata = { title: "Paiement de la commande", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaiementPage({ params }: PageProps<"/paiement/[token]">) {
  const { token } = await params;
  const { db, settings } = await siteContext();
  const view = await payViewByToken(db, token);
  if (!view) notFound();
  return (
    <div className="container-site pt-6 pb-10 md:pt-12">
      <PayPanel token={token} view={view} whatsapp={settings.company.whatsapp.replace(/\D/g, "")} />
    </div>
  );
}
