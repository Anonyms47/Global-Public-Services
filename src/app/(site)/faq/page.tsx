import type { Metadata } from "next";
import Link from "next/link";
import { siteContext } from "@/server/context";
import { FaqList, type FaqGroup } from "@/components/site/FaqList";
import { ContactActions } from "@/components/site/ContactActions";
import { TO_CONFIRM } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Questions fréquentes" };

export default async function FaqPage() {
  const { settings } = await siteContext();
  const p = settings.policies;
  const toConfirm = TO_CONFIRM.charAt(0).toLowerCase() + TO_CONFIRM.slice(1);
  const groups: FaqGroup[] = [
    {
      title: "Commander",
      items: [
        {
          q: "Comment passer commande ?",
          a: "Ajoutez vos articles au panier, choisissez retrait ou livraison, puis préparez le récapitulatif. Envoyez-le à GPS sur WhatsApp : GPS confirme la disponibilité, le total et les modalités.",
        },
        {
          q: "Ma commande est-elle confirmée quand WhatsApp s'ouvre ?",
          a: "Non. Il faut envoyer le message, puis attendre la confirmation de GPS. Tant que GPS n'a pas confirmé, rien n'est réservé.",
        },
        {
          q: "Le panier réserve-t-il les articles ?",
          a: "Non. Le panier est conservé sur votre appareil, mais rien n'est réservé avant que GPS confirme la commande.",
        },
      ],
    },
    {
      title: "Paiement et livraison",
      items: [
        {
          q: "Puis-je payer en ligne ?",
          a: `Non, aucun paiement n'est demandé sur le site. ${p.payment || `Modalités de paiement : ${toConfirm}.`}`,
        },
        {
          q: "Combien coûte la livraison ?",
          a: settings.reception.zones.some((z) => z.fee !== null)
            ? "Les frais dépendent de la zone ; ils sont indiqués lors de la préparation de la commande."
            : "Les frais de livraison sont précisés par GPS au moment de la commande.",
        },
      ],
    },
    {
      title: "Garantie et retours",
      items: [
        { q: "Les produits sont-ils garantis ?", a: p.warranty || `${TO_CONFIRM}.` },
        { q: "Puis-je retourner un article ?", a: p.returns || `${TO_CONFIRM}.` },
      ],
    },
    {
      title: "Transfert d'argent",
      items: [
        {
          q: "Puis-je faire un transfert d'argent en ligne ?",
          a: "Non. Les transferts se font en personne au comptoir GPS. Le site présente le service et permet de poser vos questions.",
        },
      ],
    },
  ];

  return (
    <>
      <div className="container-site pt-10 pb-8 md:pt-16">
        <p className="eyebrow hero-fade text-gps-red-ink" style={{ animationDelay: "0ms" }}>
          Aide
        </p>
        <h1 className="mt-3 font-display text-[56px] leading-[0.88] font-extrabold uppercase md:text-[104px]">
          <span className="hero-line block">Vos questions</span>
          <span className="hero-line block" style={{ animationDelay: "100ms" }}>
            nos réponses<span className="text-gps-red">.</span>
          </span>
        </h1>
        <p
          className="hero-fade mt-5 max-w-xl text-[17px] leading-relaxed text-ink-soft"
          style={{ animationDelay: "250ms" }}
        >
          Commande, paiement, livraison, garantie, transfert d&apos;argent : tapez un mot pour trouver la réponse.
        </p>
      </div>

      <div className="container-site grid gap-12 pb-16 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <FaqList groups={groups} />
        </div>
        <aside className="lg:col-span-4">
          <div className="rounded-[24px] bg-gps-blue-night p-6 text-white lg:sticky lg:top-28">
            <p className="font-display text-[30px] leading-none font-bold uppercase">Pas trouvé ?</p>
            <p className="mt-3 text-[15.5px] leading-relaxed text-white/75">
              Posez votre question directement à GPS. Vous pouvez aussi consulter les{" "}
              <Link href="/conditions-de-vente" className="font-semibold text-white underline underline-offset-2">
                conditions de vente
              </Link>
              .
            </p>
            <div className="mt-5">
              <ContactActions company={settings.company} text="Bonjour GPS, j'ai une question." dark />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
