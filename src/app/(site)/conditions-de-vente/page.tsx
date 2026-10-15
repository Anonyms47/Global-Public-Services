import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { legalIds } from "@/server/domain/settings";
import { ToConfirm } from "@/components/site/PageHeader";
import { LegalDoc } from "@/components/site/LegalDoc";

export const metadata: Metadata = { title: "Conditions de vente" };

export default async function CgvPage() {
  const { settings } = await siteContext();
  const p = settings.policies;
  const c = settings.company;
  const ids = legalIds(c);
  const missing = !c.legalName || !ids || !c.address;
  return (
    <LegalDoc
      title="Conditions de vente"
      intro="Comment se passe une commande chez GPS : de la préparation sur le site à la confirmation, au paiement et à la réception."
      notice="Projet à faire valider par GPS et, si besoin, par un conseil juridique."
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
              {missing ? (
                <>
                  {" "}
                  Informations manquantes : <ToConfirm />
                </>
              ) : null}
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
              {p.payment || <ToConfirm label="Moyens et moment du paiement à confirmer" />}
            </p>
          ),
        },
        {
          id: "reception",
          title: "Réception",
          body: (
            <p>
              Retrait en boutique ou livraison, selon les options proposées. Délais et zones : <ToConfirm />
            </p>
          ),
        },
        {
          id: "garantie",
          title: "Garantie",
          body: <p>{p.warranty || <ToConfirm label="Conditions de garantie à confirmer" />}</p>,
        },
        {
          id: "retours",
          title: "Retours",
          body: <p>{p.returns || <ToConfirm label="Conditions de retour à confirmer" />}</p>,
        },
      ]}
    />
  );
}
