import type { Metadata } from "next";
import Link from "next/link";
import { siteContext } from "@/server/context";
import { PageHeader, Prose, ToConfirm } from "@/components/site/PageHeader";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "La boutique GPS",
  description: "GPS — Global Public Services, le service qui rassure.",
};

export default async function AboutPage() {
  const { settings } = await siteContext();
  const c = settings.company;
  return (
    <>
      <PageHeader eyebrow="À propos" title="Le service qui rassure">
        GPS — Global Public Services réunit sous un même toit la vente de produits du quotidien et des services de
        transfert d&apos;argent.
      </PageHeader>
      <div className="container-site grid gap-12 pb-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Prose>
            {c.storeText ? <p>{c.storeText}</p> : null}
            <h2>Ce que vous trouvez chez GPS</h2>
            <ul>
              <li>Téléphones, AirPods et écouteurs, casques, chargeurs et accessoires.</li>
              <li>Lunettes, chaussures et autres articles.</li>
              <li>Des services de transfert d&apos;argent au comptoir.</li>
            </ul>
            <h2>Comment commander</h2>
            <p>
              Composez votre panier sur le site, puis envoyez le récapitulatif sur WhatsApp. GPS vérifie la
              disponibilité et vous confirme le total et la réception. Aucun paiement n&apos;est demandé en ligne.
            </p>
            <h2>Notre histoire</h2>
            <p>
              <ToConfirm label="Texte de présentation à fournir par GPS" />
            </p>
          </Prose>
          <Link href="/boutique" className="btn btn-primary mt-8">
            Voir la boutique
          </Link>
        </div>
        <div className="lg:col-span-4 lg:col-start-9">
          <div className="rounded-[6px] bg-white p-6">
            <Logo className="h-auto w-full" />
          </div>
        </div>
      </div>
    </>
  );
}
