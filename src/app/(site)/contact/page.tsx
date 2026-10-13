import type { Metadata } from "next";
import { siteContext } from "@/server/context";
import { PageHeader, ToConfirm } from "@/components/site/PageHeader";
import { ContactActions } from "@/components/site/ContactActions";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contacter GPS — Global Public Services.",
};

export default async function ContactPage() {
  const { settings } = await siteContext();
  const c = settings.company;
  const rows: [string, string][] = [
    ["Adresse", [c.address, c.city].filter(Boolean).join(", ")],
    ["Horaires", c.hours],
    ["Téléphone", c.phone],
    ["WhatsApp", c.whatsapp ? `+${c.whatsapp.replace(/\D/g, "")}` : ""],
    ["E-mail", c.email],
  ];
  return (
    <>
      <PageHeader eyebrow="Contact" title="Parlons-en">
        Une question sur un produit, une commande ou le transfert d&apos;argent
        ? Le plus simple est d&apos;écrire à GPS sur WhatsApp.
      </PageHeader>
      <div className="container-site grid gap-10 pb-8 lg:grid-cols-12">
        <dl className="divide-line border-line divide-y border-y lg:col-span-7">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr]">
              <dt className="font-bold">{k}</dt>
              <dd className="text-ink-soft">{v || <ToConfirm />}</dd>
            </div>
          ))}
        </dl>
        <div className="lg:col-span-4 lg:col-start-9">
          <p className="mb-3 font-bold">Nous joindre</p>
          <ContactActions company={c} text="Bonjour GPS, j'ai une question." />
          <p className="hint mt-3">
            Les boutons s&apos;activent dès que les coordonnées sont renseignées
            dans le Comptoir.
          </p>
        </div>
      </div>
    </>
  );
}
