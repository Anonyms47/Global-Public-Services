import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { PageHeader, Prose, ToConfirm } from "@/components/site/PageHeader";

export const metadata: Metadata = { title: "Conditions de vente" };

export default async function CgvPage() {
  const { settings } = await siteContext();
  const p = settings.policies;
  return (
    <>
      <PageHeader eyebrow="Informations légales" title="Conditions de vente">
        <ToConfirm label="Projet à faire valider par GPS et, si besoin, par un conseil juridique" />
      </PageHeader>
      <div className="container-site pb-8">
        <Prose>
          <h2>1. Vendeur</h2>
          <p>
            GPS — Global Public Services. Raison sociale, immatriculation et adresse : <ToConfirm />
          </p>
          <h2>2. Commande</h2>
          <p>
            Le site permet de préparer une commande et d&apos;en envoyer le récapitulatif à GPS via WhatsApp.
            L&apos;envoi du message ne vaut pas acceptation : la vente est conclue lorsque GPS confirme la commande
            (disponibilité, prix et modalités de réception). Les articles ne sont réservés qu&apos;à partir de cette
            confirmation.
          </p>
          <h2>3. Prix</h2>
          <p>
            Les prix sont indiqués en francs CFA (FCFA). Le prix retenu est celui confirmé par GPS. Les frais de
            livraison sont indiqués séparément ; lorsqu&apos;ils ne sont pas connus, ils sont confirmés par GPS avant
            validation.
          </p>
          <h2>4. Paiement</h2>
          <p>
            Aucun paiement n&apos;est effectué sur le site.{" "}
            {p.payment || <ToConfirm label="Moyens et moment du paiement à confirmer" />}
          </p>
          <h2>5. Réception</h2>
          <p>
            Retrait en boutique ou livraison, selon les options proposées. Délais et zones : <ToConfirm />
          </p>
          <h2>6. Garantie</h2>
          <p>{p.warranty || <ToConfirm label="Conditions de garantie à confirmer" />}</p>
          <h2>7. Retours</h2>
          <p>{p.returns || <ToConfirm label="Conditions de retour à confirmer" />}</p>
        </Prose>
      </div>
    </>
  );
}
