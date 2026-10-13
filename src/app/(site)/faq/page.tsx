import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { PageHeader } from "@/components/site/PageHeader";
import { TO_CONFIRM } from "@/lib/whatsapp";

export const metadata: Metadata = { title: "Questions fréquentes" };

export default async function FaqPage() {
  const { settings } = await siteContext();
  const p = settings.policies;
  const faq: [string, string][] = [
    [
      "Comment passer commande ?",
      "Ajoutez vos articles au panier, choisissez retrait ou livraison, puis préparez le récapitulatif. Envoyez-le à GPS sur WhatsApp : GPS confirme la disponibilité, le total et les modalités.",
    ],
    [
      "Ma commande est-elle confirmée quand WhatsApp s'ouvre ?",
      "Non. Il faut envoyer le message, puis attendre la confirmation de GPS. Tant que GPS n'a pas confirmé, rien n'est réservé.",
    ],
    [
      "Le panier réserve-t-il les articles ?",
      "Non. Le panier est conservé sur votre appareil, mais le stock n'est réservé qu'après confirmation de la commande par GPS.",
    ],
    [
      "Puis-je payer en ligne ?",
      `Non, aucun paiement n'est demandé sur le site. ${p.payment || `Modalités de paiement : ${TO_CONFIRM.toLowerCase()}.`}`,
    ],
    [
      "Combien coûte la livraison ?",
      settings.reception.zones.some((z) => z.fee !== null)
        ? "Les frais dépendent de la zone ; ils sont indiqués lors de la préparation de la commande."
        : `Les frais de livraison sont ${TO_CONFIRM.toLowerCase()} au moment de la commande.`,
    ],
    ["Les produits sont-ils garantis ?", p.warranty || `${TO_CONFIRM}.`],
    ["Puis-je retourner un article ?", p.returns || `${TO_CONFIRM}.`],
    [
      "Puis-je faire un transfert d'argent en ligne ?",
      "Non. Les transferts se font en personne au comptoir GPS. Le site présente le service et permet de poser vos questions.",
    ],
  ];
  return (
    <>
      <PageHeader eyebrow="Aide" title="Questions fréquentes" />
      <div className="container-site pb-8">
        <div className="divide-line border-line max-w-3xl divide-y border-y">
          {faq.map(([q, a]) => (
            <details key={q} className="group py-2">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold [&::-webkit-details-marker]:hidden">
                {q}
                <span
                  aria-hidden="true"
                  className="text-gps-red text-2xl transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-ink-soft pb-4">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </>
  );
}
