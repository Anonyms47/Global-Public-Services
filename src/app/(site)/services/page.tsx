import type { Metadata } from "next";
import Image from "next/image";
import { siteContext } from "@/server/context";
import { listServices } from "@/server/domain/services";
import { PageHeader, ToConfirm } from "@/components/site/PageHeader";
import { ContactActions } from "@/components/site/ContactActions";
import { IconInfo, IconStore, IconSwap } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Transfert d'argent",
  description: "Les services de transfert d'argent au comptoir GPS.",
};

export default async function ServicesPage() {
  const { db, settings } = await siteContext();
  const services = await listServices(db, { publicOnly: true });
  const c = settings.company;
  return (
    <>
      <PageHeader eyebrow="Comptoir services" title="Transfert d'argent" tone="blue">
        Les opérations se font en personne, au comptoir GPS, avec un conseiller. Ce site présente le service : aucun
        transfert ne peut être réalisé en ligne.
      </PageHeader>
      <div className="container-site grid gap-12 py-12 md:py-16 lg:grid-cols-12">
        <section className="lg:col-span-7" aria-labelledby="titre-liste-services">
          <h2 id="titre-liste-services" className="font-display text-4xl font-bold uppercase">
            Services proposés
          </h2>
          {services.length === 0 ? (
            <p className="mt-4 text-ink-soft">Les services seront présentés ici dès leur confirmation par GPS.</p>
          ) : (
            <ul className="mt-6 grid gap-4">
              {services.map((s) => (
                <li key={s.id} className="rounded-[6px] border border-line bg-card p-5 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-3 font-display text-3xl font-bold uppercase">
                      <IconSwap className="text-gps-blue" /> {s.title}
                    </h3>
                    {!s.confirmed ? (
                      <ToConfirm label={s.is_demo ? "Exemple — à confirmer" : "En attente de confirmation"} />
                    ) : null}
                  </div>
                  {s.summary ? <p className="mt-2 text-ink-soft">{s.summary}</p> : null}
                  <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-3">
                    <div>
                      <dt className="text-[13px] font-bold tracking-wide text-ink-mute uppercase">Opérateurs</dt>
                      <dd className="mt-1 font-semibold">{s.operators || <ToConfirm />}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] font-bold tracking-wide text-ink-mute uppercase">Opérations</dt>
                      <dd className="mt-1 font-semibold">{s.operations || <ToConfirm />}</dd>
                    </div>
                    <div>
                      <dt className="text-[13px] font-bold tracking-wide text-ink-mute uppercase">Horaires</dt>
                      <dd className="mt-1 font-semibold">{s.hours || c.hours || <ToConfirm />}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-8 flex gap-3 rounded-[6px] bg-gps-blue-soft p-4 text-[15px] text-gps-blue-deep">
            <IconInfo className="mt-0.5 shrink-0" />
            <p>
              Pièces à présenter, plafonds, frais et délais dépendent de l&apos;opérateur : renseignez-vous auprès de
              GPS avant de vous déplacer. Les fonds des transferts sont distincts des ventes de la boutique.
            </p>
          </div>
        </section>
        <aside className="lg:col-span-5" aria-labelledby="titre-point">
          <h2 id="titre-point" className="font-display text-4xl font-bold uppercase">
            Le point de service
          </h2>
          <div className="mt-4 overflow-hidden rounded-[6px] border border-line bg-card">
            {c.storePhotoUrl ? (
              <Image
                src={c.storePhotoUrl}
                alt="Le comptoir GPS"
                width={900}
                height={600}
                className="aspect-[3/2] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[3/1] items-center justify-center gap-2 bg-paper-deep text-ink-mute">
                <IconStore /> Photo du point de service à fournir
              </div>
            )}
            <dl className="grid gap-3 p-5 text-[15px]">
              <div>
                <dt className="text-[13px] font-bold tracking-wide text-ink-mute uppercase">Adresse</dt>
                <dd className="mt-1 font-semibold">
                  {[c.address, c.city].filter(Boolean).join(", ") || <ToConfirm />}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] font-bold tracking-wide text-ink-mute uppercase">Horaires</dt>
                <dd className="mt-1 font-semibold">{c.hours || <ToConfirm />}</dd>
              </div>
            </dl>
            <div className="border-t border-line p-5">
              <ContactActions company={c} text="Bonjour GPS, j'ai une question sur le transfert d'argent." />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
