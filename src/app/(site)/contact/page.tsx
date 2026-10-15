import type { Metadata } from "next";
import Link from "next/link";
import { siteContext } from "@/server/context";
import { ToConfirm } from "@/components/site/PageHeader";
import { Logo } from "@/components/brand/Logo";
import { IconArrowRight, IconPhone, IconPin, IconWhatsApp } from "@/components/ui/icons";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contacter GPS — Global Public Services.",
};

const quickQuestions = [
  "Bonjour GPS, cet article est-il disponible ?",
  "Bonjour GPS, quels sont vos horaires aujourd'hui ?",
  "Bonjour GPS, j'ai une question sur une commande.",
  "Bonjour GPS, j'ai une question sur le transfert d'argent.",
];

export default async function ContactPage() {
  const { settings } = await siteContext();
  const c = settings.company;
  const wa = whatsappLink(c.whatsapp, "Bonjour GPS, j'ai une question.");
  const waNumber = c.whatsapp.replace(/\D/g, "");
  const tel = c.phone.replace(/[^\d+]/g, "");
  const address = [c.address, c.city].filter(Boolean).join(", ");
  const maps =
    c.mapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "");

  const ways = [
    {
      Icon: IconWhatsApp,
      title: "Écrire sur WhatsApp",
      text: "Le plus simple pour une question sur un article, une commande ou un transfert.",
      value: waNumber ? `+${waNumber}` : "",
      href: wa,
      external: true,
      tone: "wa",
    },
    {
      Icon: IconPhone,
      title: "Appeler",
      text: "Pour une réponse de vive voix pendant les heures d'ouverture.",
      value: c.phone,
      href: tel ? `tel:${tel}` : "",
      external: false,
      tone: "blue",
    },
    {
      Icon: IconPin,
      title: "Passer au comptoir",
      text: "Voir les produits, retirer une commande confirmée, faire un transfert.",
      value: address,
      href: maps,
      external: true,
      tone: "red",
    },
  ] as const;

  return (
    <>
      <div className="container-site grid gap-10 pt-10 pb-12 md:pt-16 md:pb-16 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <p className="eyebrow hero-fade text-gps-red-ink" style={{ animationDelay: "0ms" }}>
            Contact
          </p>
          <h1 className="mt-3 font-display text-[64px] leading-[0.88] font-extrabold uppercase md:text-[120px]">
            <span className="hero-line block">
              Parlons-en<span className="text-gps-red">.</span>
            </span>
          </h1>
          <p
            className="hero-fade mt-6 max-w-xl text-[17px] leading-relaxed text-ink-soft md:text-lg"
            style={{ animationDelay: "250ms" }}
          >
            Une question sur un produit, une commande ou le transfert d&apos;argent ? Écrivez, appelez ou passez nous
            voir.
          </p>
        </div>

        {/* Carte de visite */}
        <div className="hero-fade lg:col-span-5" style={{ animationDelay: "300ms" }}>
          <div className="contact-card">
            <div className="flex items-start justify-between gap-4">
              <Logo className="h-14 w-auto" />
              <span className="text-right text-[12px] leading-tight font-semibold text-ink-mute">
                Le service
                <br />
                qui rassure
              </span>
            </div>
            <dl className="mt-6 grid gap-2.5">
              {(
                [
                  ["Adresse", address],
                  ["Horaires", c.hours],
                  ["Téléphone", c.phone],
                  ["WhatsApp", waNumber ? `+${waNumber}` : ""],
                  ["E-mail", c.email],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="receipt-line">
                  <dt>{label}</dt>
                  <span aria-hidden="true" className="receipt-dots" />
                  <dd>
                    {value ? (
                      label === "E-mail" ? (
                        <a href={`mailto:${value}`} className="underline-offset-2 hover:underline">
                          {value}
                        </a>
                      ) : (
                        value
                      )
                    ) : (
                      <ToConfirm />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Trois façons de joindre GPS */}
      <section className="container-site pb-12 md:pb-16" aria-labelledby="titre-joindre">
        <h2 id="titre-joindre" className="sr-only">
          Joindre GPS
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {ways.map(({ Icon, title, text, value, href, external, tone }) => {
            const body = (
              <>
                <span className={`contact-way-icon contact-way-${tone}`}>
                  <Icon size={22} />
                </span>
                <span className="mt-5 block font-display text-[28px] leading-none font-bold uppercase">{title}</span>
                <span className="mt-2 block text-[15.5px] leading-relaxed text-ink-soft">{text}</span>
                <span className="mt-auto flex items-center justify-between gap-3 pt-6 text-[15px] font-bold">
                  {href ? (
                    <>
                      <span className="truncate">{value || "Y aller"}</span>
                      <IconArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
                    </>
                  ) : (
                    <span className="font-semibold text-ink-mute">Bientôt disponible</span>
                  )}
                </span>
              </>
            );
            return (
              <li key={title}>
                {href ? (
                  <a
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="about-offer group"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="about-offer pointer-events-none border-dashed opacity-80" aria-disabled="true">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Questions toutes prêtes */}
      <section className="border-t border-line bg-card" aria-labelledby="titre-questions">
        <div className="container-site grid gap-8 py-12 md:py-16 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 id="titre-questions" className="font-display text-[34px] leading-none font-bold uppercase">
              Une question toute prête
            </h2>
            <p className="mt-3 text-[15.5px] text-ink-soft">
              {wa
                ? "Touchez une phrase : WhatsApp s'ouvre avec le message déjà écrit."
                : "Ces messages s'enverront sur WhatsApp dès que le numéro de GPS sera renseigné."}
            </p>
          </div>
          <ul className="flex flex-wrap content-start gap-2 lg:col-span-8">
            {quickQuestions.map((q) => {
              const link = whatsappLink(c.whatsapp, q);
              const label = q.replace("Bonjour GPS, ", "");
              return (
                <li key={q}>
                  {link ? (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="rail-pill pl-4!">
                      <IconWhatsApp size={18} className="text-wa-ink" />
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </a>
                  ) : (
                    <span className="rail-pill pl-4! text-ink-mute">
                      <IconWhatsApp size={18} />
                      {label.charAt(0).toUpperCase() + label.slice(1)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[14px] text-ink-mute lg:col-span-8 lg:col-start-5">
            Vous cherchez une réponse rapide ?{" "}
            <Link href="/faq" className="font-semibold text-gps-blue underline-offset-2 hover:underline">
              Consultez les questions fréquentes
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
