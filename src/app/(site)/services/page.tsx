import type { Metadata } from "next";
import Image from "next/image";
import { siteContext } from "@/server/context";
import { listServices } from "@/server/domain/services";
import { ToConfirm } from "@/components/site/PageHeader";
import { BrandPanel } from "@/components/brand/BrandPanel";
import { Ribbon } from "@/components/brand/Ribbon";
import { ContactActions } from "@/components/site/ContactActions";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import { IconInfo, IconStore, IconSwap, IconWhatsApp, IconCheck } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Transfert d'argent",
  description: "Les services de transfert d'argent au comptoir GPS.",
};

/** Ligne façon ticket : libellé, points de conduite, valeur. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="receipt-line">
      <dt>{label}</dt>
      <span aria-hidden="true" className="receipt-dots" />
      <dd>{children}</dd>
    </div>
  );
}

const steps = [
  {
    Icon: IconWhatsApp,
    title: "Renseignez-vous",
    text: "Frais, délais, plafonds et pièces à présenter dépendent de l'opérateur : posez la question à GPS avant de venir.",
  },
  {
    Icon: IconStore,
    title: "Passez au comptoir",
    text: "L'opération se fait en personne, avec un conseiller GPS. Rien ne se paie ni ne s'envoie sur ce site.",
  },
  {
    Icon: IconCheck,
    title: "Gardez le justificatif",
    text: "Conservez le justificatif de l'opération : il sert si une question se pose ensuite.",
  },
];

export default async function ServicesPage() {
  const { db, settings } = await siteContext();
  const services = await listServices(db, { publicOnly: true });
  const c = settings.company;
  return (
    <>
      {/* ——— En-tête ——— */}
      <section className="relative overflow-hidden bg-gps-blue text-white" aria-labelledby="titre-transfert">
        <Ribbon
          tone="white"
          className="pointer-events-none absolute -right-16 bottom-0 h-full w-[85%] opacity-20 md:w-[60%]"
          width={5}
        />
        <div className="relative container-site grid gap-10 pt-12 pb-14 md:pt-20 md:pb-20 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="eyebrow hero-fade text-white/70" style={{ animationDelay: "0ms" }}>
              Au comptoir GPS
            </p>
            <h1
              id="titre-transfert"
              className="mt-3 font-display text-[56px] leading-[0.88] font-extrabold uppercase md:text-[104px]"
            >
              <span className="hero-line block">Transfert</span>
              <span className="hero-line block" style={{ animationDelay: "100ms" }}>
                d&apos;argent<span className="text-gps-red">.</span>
              </span>
            </h1>
            <p
              className="hero-fade mt-6 max-w-xl text-[17px] leading-relaxed text-white/85 md:text-lg"
              style={{ animationDelay: "250ms" }}
            >
              Envoyer ou recevoir de l&apos;argent se fait en personne, au comptoir, avec un conseiller. Ce site
              présente le service : aucun transfert ne peut être réalisé en ligne.
            </p>
          </div>
          <div className="hero-fade lg:col-span-5" style={{ animationDelay: "350ms" }}>
            <div className="rounded-[22px] bg-white p-5 text-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
              <p className="receipt-title flex items-center gap-2">
                <IconSwap size={20} className="text-gps-blue" /> Le guichet
              </p>
              <dl className="mt-3 grid gap-2.5">
                <Line label="Adresse">{[c.address, c.city].filter(Boolean).join(", ") || <ToConfirm />}</Line>
                <Line label="Horaires">{c.hours || <ToConfirm />}</Line>
                <Line label="En ligne">aucune opération</Line>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Services ——— */}
      <section className="container-site py-16 md:py-24" aria-labelledby="titre-liste-services">
        <p className="eyebrow text-gps-red-ink">Ce que propose GPS</p>
        <h2
          id="titre-liste-services"
          className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-6xl"
        >
          Services proposés
        </h2>
        {services.length === 0 ? (
          <p className="mt-6 max-w-xl text-[17px] text-ink-soft">
            Les services seront présentés ici dès leur confirmation par GPS.
          </p>
        ) : (
          <ul className={`mt-10 grid gap-4 ${services.length > 1 ? "md:grid-cols-2" : "max-w-3xl"}`} data-reveal>
            {services.map((s) => (
              <li key={s.id} className="flex flex-col rounded-[24px] border border-line bg-card p-6 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <span className="pdp-icon h-12! w-12!">
                    <IconSwap size={22} />
                  </span>
                  {!s.confirmed ? (
                    <ToConfirm label={s.is_demo ? "Exemple — à confirmer" : "En attente de confirmation"} />
                  ) : null}
                </div>
                <h3 className="mt-5 font-display text-[32px] leading-none font-bold uppercase">{s.title}</h3>
                {s.summary ? <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">{s.summary}</p> : null}
                <dl className="mt-auto grid gap-2.5 border-t-2 border-dashed border-line pt-5">
                  <Line label="Opérateurs">{s.operators || <ToConfirm />}</Line>
                  <Line label="Opérations">{s.operations || <ToConfirm />}</Line>
                  <Line label="Horaires">{s.hours || c.hours || <ToConfirm />}</Line>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ——— Comment ça se passe ——— */}
      <section className="border-y border-line bg-card" aria-labelledby="titre-deroulement">
        <div className="container-site py-16 md:py-24">
          <p className="eyebrow text-gps-red-ink">Sur place</p>
          <h2
            id="titre-deroulement"
            className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-6xl"
          >
            Comment ça se passe
          </h2>
          <ol className="steps-flow mt-10 grid gap-4 sm:grid-cols-3" data-reveal>
            {steps.map(({ Icon, title, text }, i) => (
              <li key={title} className="rounded-[22px] border border-line bg-paper p-6">
                <span className="flex items-center gap-3">
                  <span className="pdp-icon">
                    <Icon size={20} />
                  </span>
                  <span className="text-[13px] font-bold tracking-[0.12em] text-ink-mute uppercase">Étape {i + 1}</span>
                </span>
                <span className="mt-5 block font-display text-[28px] leading-none font-bold uppercase">{title}</span>
                <span className="mt-2 block text-[15.5px] leading-relaxed text-ink-soft">{text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-8 flex max-w-3xl gap-3 rounded-[18px] bg-gps-blue-soft p-4 text-[15px] text-gps-blue-deep">
            <IconInfo className="mt-0.5 shrink-0" />
            <span>Les fonds des transferts sont distincts des ventes de la boutique.</span>
          </p>
        </div>
      </section>

      {/* ——— Point de service ——— */}
      <section className="container-site py-16 md:py-24" aria-labelledby="titre-point">
        <div className="grid overflow-hidden rounded-[28px] border border-line bg-card lg:grid-cols-2" data-reveal>
          <div className="relative min-h-[240px]">
            {c.storePhotoUrl ? (
              <Image
                src={c.storePhotoUrl}
                alt="Le comptoir GPS"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              <BrandPanel caption="Photo du point de service à venir" className="h-full min-h-[240px] w-full" />
            )}
          </div>
          <div className="p-6 md:p-10">
            <p className="eyebrow text-gps-red-ink">Le point de service</p>
            <h2
              id="titre-point"
              className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-5xl"
            >
              Une question avant de venir ?
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-soft">
              Demandez les frais, les délais et les pièces nécessaires : GPS vous répond avant votre passage.
            </p>
            <div className="mt-6">
              <ContactActions company={c} text="Bonjour GPS, j'ai une question sur le transfert d'argent." />
            </div>
          </div>
        </div>
      </section>
      <RevealOnScroll />
    </>
  );
}
