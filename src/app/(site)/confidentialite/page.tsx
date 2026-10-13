import type { Metadata } from "next";
import { PageHeader, Prose, ToConfirm } from "@/components/site/PageHeader";

export const metadata: Metadata = { title: "Confidentialité" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="Informations légales" title="Confidentialité">
        <ToConfirm label="Projet à faire valider par GPS" />
      </PageHeader>
      <div className="container-site pb-8">
        <Prose>
          <h2>Données collectées sur le site</h2>
          <p>
            Le site ne crée pas de compte client et ne demande aucun paiement. Le panier et le formulaire de commande
            sont conservés <strong>uniquement dans votre navigateur</strong> (stockage local) : ils ne sont pas envoyés
            à GPS tant que vous n&apos;envoyez pas vous-même le message WhatsApp.
          </p>
          <h2>Données transmises par WhatsApp</h2>
          <p>
            Le récapitulatif contient les articles choisis, le mode de réception, votre nom et, si vous les indiquez, un
            téléphone, une adresse de livraison et une précision. Ces informations sont utilisées par GPS pour traiter
            votre commande. L&apos;utilisation de WhatsApp est soumise aux conditions de ce service.
          </p>
          <h2>Données conservées par GPS</h2>
          <p>
            Lorsqu&apos;une commande est confirmée, GPS enregistre les informations nécessaires à son suivi (articles,
            prix, coordonnées, réception, paiements). Durée de conservation et contact pour exercer vos droits :{" "}
            <ToConfirm />
          </p>
          <h2>Mesure d&apos;audience</h2>
          <p>Aucun outil de mesure d&apos;audience ni cookie publicitaire n&apos;est utilisé.</p>
        </Prose>
      </div>
    </>
  );
}
