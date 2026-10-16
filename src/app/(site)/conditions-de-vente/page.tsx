import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { legalIds } from "@/server/domain/settings";
import { LegalDoc } from "@/components/site/LegalDoc";

export const metadata: Metadata = { title: "Conditions de vente" };

export default async function CgvPage() {
  const { settings } = await siteContext();
  const p = settings.policies;
  const c = settings.company;
  const ids = legalIds(c);
  return (
    <LegalDoc
      title="Conditions de vente"
      intro="Comment se passe une commande chez GPS : de la préparation sur le site à la confirmation, au paiement et à la réception."
      other={{ href: "/confidentialite", label: "Confidentialité" }}
      sections={[
        {
          id: "vendeur",
          title: "Vendeur",
          body: (
            <p>
              GPS — Global Public Services. {c.legalName ? `${c.legalName}. ` : null}
              {ids ? `Immatriculation : ${ids}. ` : null}
              {[c.address, c.city].filter(Boolean).join(", ") || null}
            </p>
          ),
        },
        {
          id: "commande",
          title: "Commande",
          body: (
            <p>
              Le site permet de préparer une commande et d&apos;en envoyer le récapitulatif à GPS via WhatsApp.
              L&apos;envoi du message ne vaut pas acceptation : la vente est conclue lorsque GPS confirme la commande
              (disponibilité, prix et modalités de réception). Les articles ne sont réservés qu&apos;à partir de cette
              confirmation.
            </p>
          ),
        },
        {
          id: "prix",
          title: "Prix",
          body: (
            <p>
              Les prix sont indiqués en francs CFA (FCFA). Le prix retenu est celui confirmé par GPS. Les frais de
              livraison sont indiqués séparément ; lorsqu&apos;ils ne sont pas connus, ils sont confirmés par GPS avant
              validation.
            </p>
          ),
        },
        {
          id: "paiement",
          title: "Paiement",
          body: (
            <p>
              Aucun paiement n&apos;est effectué sur le site.{" "}
              {p.payment || "Moyens et moment du paiement précisés par GPS à la confirmation de la commande."}
            </p>
          ),
        },
        {
          id: "reception",
          title: "Réception",
          body: (
            <p>
              Retrait dans l&apos;un de nos points de vente à Petit Mbao, ou livraison selon les options proposées.
              Délais et frais de livraison précisés par GPS au moment de la confirmation.
            </p>
          ),
        },
        {
          id: "garantie",
          title: "Garantie",
          body: <p>{p.warranty || "Conditions de garantie précisées par GPS pour chaque article, avant l'achat."}</p>,
        },
        {
          id: "retours",
          title: "Retours",
          body: <p>{p.returns || "Pour un retour, contactez GPS sur WhatsApp avec la référence de votre commande."}</p>,
        },
      ]}
    />
  );
}
