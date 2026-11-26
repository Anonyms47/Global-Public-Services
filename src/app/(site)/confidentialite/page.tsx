import type { Metadata } from "next";
import { LegalDoc } from "@/components/site/LegalDoc";
import { siteContext } from "@/server/context";

export const metadata: Metadata = {
  title: "Confidentialité",
  alternates: { canonical: "/confidentialite" },
};

export default async function PrivacyPage() {
  const c = (await siteContext()).settings.company;
  return (
    <LegalDoc
      title="Confidentialité"
      intro="Ce que le site garde, ce qui part vers GPS et quand : en clair, sans jargon."
      other={{ href: "/conditions-de-vente", label: "Conditions de vente" }}
      sections={[
        {
          id: "site",
          title: "Sur le site",
          body: (
            <p>
              Le site ne crée pas de compte client et ne demande aucun paiement. Tant que vous remplissez le panier et
              le formulaire, ils restent <strong>uniquement dans votre navigateur</strong> (stockage local) : rien
              n&apos;est transmis à GPS pendant que vous tapez.
            </p>
          ),
        },
        {
          id: "recap",
          title: "Quand vous préparez votre récapitulatif",
          body: (
            <>
              <p>
                En touchant <strong>« Préparer mon récapitulatif »</strong>, votre demande est{" "}
                <strong>transmise à GPS</strong> : articles, quantités, mode de réception, nom et, si vous les indiquez,
                téléphone, adresse de livraison et précision. GPS en garde une trace sous une référence, pour retrouver
                votre demande quand vous le contactez.{" "}
                <strong>
                  Si elle ne devient pas une commande, elle est supprimée automatiquement au bout de 48 heures.
                </strong>
              </p>
              <p>
                Cette demande <strong>n&apos;est pas une commande confirmée</strong> : rien n&apos;est réservé ni payé à
                ce stade. Le message WhatsApp est une étape séparée : c&apos;est vous qui l&apos;envoyez, et GPS ne vous
                écrit pas à votre place.
              </p>
            </>
          ),
        },
        {
          id: "whatsapp",
          title: "Par WhatsApp",
          body: (
            <p>
              Le message contient les mêmes informations que le récapitulatif, avec la référence de la demande.
              L&apos;utilisation de WhatsApp est soumise aux conditions de ce service.
            </p>
          ),
        },
        {
          id: "gps",
          title: "Chez GPS",
          body: (
            <p>
              Une demande qui ne devient pas une commande est supprimée au bout de 48 heures. Lorsqu&apos;une commande
              est confirmée, GPS enregistre les informations nécessaires à son suivi (articles, prix, coordonnées,
              réception, paiements). Pour exercer vos droits, écrivez à GPS sur WhatsApp
              {c.email ? ` ou à ${c.email}` : ""}.
            </p>
          ),
        },
        {
          id: "audience",
          title: "Mesure d'audience",
          body: <p>Aucun outil de mesure d&apos;audience ni cookie publicitaire n&apos;est utilisé.</p>,
        },
      ]}
    />
  );
}
