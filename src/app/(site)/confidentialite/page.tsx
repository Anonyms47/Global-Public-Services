import type { Metadata } from "next";
import { ToConfirm } from "@/components/site/PageHeader";
import { LegalDoc } from "@/components/site/LegalDoc";

export const metadata: Metadata = { title: "Confidentialité" };

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Confidentialité"
      intro="Ce que le site garde, ce qui part vers GPS et quand : en clair, sans jargon."
      notice="Projet à faire valider par GPS."
      other={{ href: "/conditions-de-vente", label: "Conditions de vente" }}
      sections={[
        {
          id: "site",
          title: "Sur le site",
          body: (
            <p>
              Le site ne crée pas de compte client et ne demande aucun paiement. Le panier et le formulaire de commande
              sont conservés <strong>uniquement dans votre navigateur</strong> (stockage local) : ils ne sont pas
              envoyés à GPS tant que vous n&apos;envoyez pas vous-même le message WhatsApp.
            </p>
          ),
        },
        {
          id: "whatsapp",
          title: "Par WhatsApp",
          body: (
            <p>
              Le récapitulatif contient les articles choisis, le mode de réception, votre nom et, si vous les indiquez,
              un téléphone, une adresse de livraison et une précision. Ces informations sont utilisées par GPS pour
              traiter votre commande. L&apos;utilisation de WhatsApp est soumise aux conditions de ce service.
            </p>
          ),
        },
        {
          id: "gps",
          title: "Chez GPS",
          body: (
            <p>
              Lorsqu&apos;une commande est confirmée, GPS enregistre les informations nécessaires à son suivi (articles,
              prix, coordonnées, réception, paiements). Durée de conservation et contact pour exercer vos droits :{" "}
              <ToConfirm />
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
