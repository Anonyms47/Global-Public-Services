import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { siteContext } from "@/server/context";
import { listCategories, publishedProducts } from "@/server/domain/catalog";
import { ToConfirm } from "@/components/site/PageHeader";
import { Ribbon } from "@/components/brand/Ribbon";
import { BrandPanel } from "@/components/brand/BrandPanel";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import {
  IconArrowRight,
  IconBag,
  IconCheck,
  IconClock,
  IconPin,
  IconStore,
  IconSwap,
  IconWhatsApp,
} from "@/components/ui/icons";
import { whatsappLink } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "À propos de GPS",
  description:
    "GPS — Global Public Services, le service qui rassure : produits du quotidien et transfert d'argent sous un même toit.",
};

export default async function AboutPage() {
  const { db, settings } = await siteContext();
  const c = settings.company;
  const [products, categories] = await Promise.all([publishedProducts(db), listCategories(db)]);
  const univers = categories.filter((cat) => cat.product_count > 0);
  const wa = whatsappLink(c.whatsapp, "Bonjour GPS, j'ai une question.");
  const story = c.aboutText ? c.aboutText.split(/\n{2,}/) : [];

  const offers = [
    {
      Icon: IconBag,
      title: "Des produits du quotidien",
      text: `${univers.length || "Plusieurs"} univers : téléphones, écouteurs, casques, chargeurs, accessoires, montres, parfums, lunettes, chaussures et plus.`,
      href: "/boutique",
      cta: "Voir la boutique",
    },
    {
      Icon: IconSwap,
      title: "Le transfert d'argent",
      text: "Envoyer ou recevoir de l'argent directement au comptoir GPS.",
      href: "/services",
      cta: "Découvrir le service",
    },
    {
      Icon: IconStore,
      title: "Un comptoir pour vous accueillir",
      text: "Voir les produits, poser vos questions, retirer une commande confirmée.",
      href: "/contact",
      cta: "Nous trouver",
    },
  ];

  const steps = [
    { Icon: IconBag, title: "Vous composez", text: "Ajoutez vos articles au panier sur le site, à votre rythme." },
    {
      Icon: IconWhatsApp,
      title: "GPS confirme",
      text: "Envoyez le récapitulatif sur WhatsApp : GPS vérifie la disponibilité et le total.",
    },
    {
      Icon: IconCheck,
      title: "Vous recevez",
      text: "Retrait au comptoir ou livraison. Aucun paiement n'est demandé en ligne.",
    },
  ];

  return (
    <>
      {/* ——— En-tête ——— */}
      <section className="relative overflow-hidden bg-gps-blue-night text-white" aria-labelledby="titre-apropos">
        <Ribbon
          tone="white"
          className="pointer-events-none absolute -right-16 bottom-0 h-full w-[85%] opacity-20 md:w-[60%]"
          width={5}
        />
        <div className="relative container-site pt-12 pb-14 md:pt-20 md:pb-24">
          <p className="eyebrow hero-fade text-white/70" style={{ animationDelay: "0ms" }}>
            À propos
          </p>
          <h1
            id="titre-apropos"
            className="mt-3 font-display text-[56px] leading-[0.88] font-extrabold uppercase md:text-[112px]"
          >
            <span className="hero-line block">Le service</span>
            <span className="hero-line block" style={{ animationDelay: "100ms" }}>
              qui rassure<span className="text-gps-red">.</span>
            </span>
          </h1>
          <p
            className="hero-fade mt-6 max-w-2xl text-[17px] leading-relaxed text-white/80 md:text-xl"
            style={{ animationDelay: "250ms" }}
          >
            GPS — Global Public Services réunit sous un même toit la vente de produits du quotidien et des services de
            transfert d&apos;argent.
          </p>
          <ul className="hero-fade mt-8 flex flex-wrap gap-2" style={{ animationDelay: "350ms" }}>
            {["Aucun paiement en ligne", "Confirmé sur WhatsApp", "Retrait ou livraison"].map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[14px] font-semibold backdrop-blur-sm"
              >
                <IconCheck size={16} className="text-gps-red" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— Ce que vous trouvez ——— */}
      <section className="container-site py-16 md:py-24" aria-labelledby="titre-offre">
        <p className="eyebrow text-gps-red-ink">Chez GPS</p>
        <h2
          id="titre-offre"
          className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-6xl"
        >
          Tout sous un même toit
        </h2>
        <ul className="mt-10 grid gap-4 md:grid-cols-3" data-reveal>
          {offers.map(({ Icon, title, text, href, cta }, i) => (
            <li key={title}>
              <Link href={href} className="about-offer group">
                <span className="flex items-center justify-between">
                  <span className="pdp-icon h-12! w-12!">
                    <Icon size={22} />
                  </span>
                  <span className="font-display text-[44px] leading-none font-extrabold text-ink/10 tabular">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </span>
                <span className="mt-6 block font-display text-[28px] leading-none font-bold uppercase">{title}</span>
                <span className="mt-3 block text-[15.5px] leading-relaxed text-ink-soft">{text}</span>
                <span className="mt-6 inline-flex items-center gap-2 text-[15px] font-bold text-gps-blue">
                  {cta}
                  <IconArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {univers.length ? (
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Univers produits" data-reveal>
            {univers.map((cat) => {
              const img = products.find((p) => p.categorySlug === cat.slug)?.images[0];
              return (
                <li key={cat.id}>
                  <Link href={`/categories/${cat.slug}`} className="rail-pill">
                    <span className="rail-thumb" aria-hidden="true">
                      {img ? (
                        <Image
                          src={img.url}
                          alt=""
                          width={64}
                          height={64}
                          unoptimized={img.url.endsWith(".svg")}
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    {cat.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      {/* ——— Notre histoire ——— */}
      <section className="border-y border-line bg-card" aria-labelledby="titre-histoire">
        <div className="container-site grid gap-10 py-16 md:py-24 lg:grid-cols-12" data-reveal>
          <div className="lg:col-span-4">
            <p className="eyebrow text-gps-red-ink">Notre histoire</p>
            <h2
              id="titre-histoire"
              className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-6xl"
            >
              D&apos;où vient GPS
            </h2>
          </div>
          <div className="lg:col-span-8">
            {story.length ? (
              <div className="about-story space-y-5">
                {story.map((para, i) => (
                  <p key={i} className={i === 0 ? "about-lead" : "text-[17px] leading-relaxed text-ink-soft"}>
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[17px]">
                <ToConfirm label="Texte de présentation à fournir par GPS" />
              </p>
            )}
            {c.storeText ? (
              <p className="mt-8 border-l-4 border-gps-red pl-4 text-[17px] leading-relaxed text-ink-soft">
                {c.storeText}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ——— Comment ça marche ——— */}
      <section className="container-site py-16 md:py-24" aria-labelledby="titre-commande">
        <p className="eyebrow text-gps-red-ink">Commander</p>
        <h2
          id="titre-commande"
          className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-6xl"
        >
          Simple, en trois temps
        </h2>
        <ol className="steps-flow mt-10 grid gap-4 sm:grid-cols-3" data-reveal>
          {steps.map(({ Icon, title, text }, i) => (
            <li key={title} className="rounded-[22px] border border-line bg-card p-6">
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
      </section>

      {/* ——— Le comptoir ——— */}
      <section className="container-site pb-16 md:pb-24" aria-labelledby="titre-comptoir">
        <div className="grid overflow-hidden rounded-[28px] border border-line bg-card lg:grid-cols-2" data-reveal>
          <div className="relative min-h-[260px]">
            {c.storePhotoUrl ? (
              <Image
                src={c.storePhotoUrl}
                alt="La boutique GPS"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              <BrandPanel caption="Photo de la boutique à venir" className="h-full min-h-[260px] w-full" />
            )}
          </div>
          <div className="p-6 md:p-10">
            <p className="eyebrow text-gps-red-ink">Le comptoir</p>
            <h2
              id="titre-comptoir"
              className="mt-2 font-display text-[40px] leading-[0.95] font-extrabold uppercase md:text-5xl"
            >
              Passez nous voir
            </h2>
            <dl className="mt-6 grid gap-4">
              <div className="flex gap-3">
                <span className="pdp-icon">
                  <IconPin size={20} />
                </span>
                <div>
                  <dt className="text-[13px] font-bold tracking-[0.08em] text-ink-mute uppercase">Adresse</dt>
                  <dd className="mt-0.5 font-semibold">
                    {c.address ? (
                      <>
                        {c.address}
                        {c.city ? `, ${c.city}` : ""}
                      </>
                    ) : (
                      <ToConfirm />
                    )}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="pdp-icon">
                  <IconClock size={20} />
                </span>
                <div>
                  <dt className="text-[13px] font-bold tracking-[0.08em] text-ink-mute uppercase">Horaires</dt>
                  <dd className="mt-0.5 font-semibold">{c.hours || <ToConfirm />}</dd>
                </div>
              </div>
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contact" className="btn btn-ink">
                Contact & accès <IconArrowRight size={18} />
              </Link>
              {c.mapsUrl ? (
                <a href={c.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                  <IconPin size={18} /> Itinéraire
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* ——— Appel final ——— */}
      <section aria-labelledby="titre-cta-apropos" className="container-site pb-16 md:pb-24">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[28px] bg-gps-red px-6 py-14 text-center text-white md:px-12 md:py-20"
        >
          <Ribbon
            tone="white"
            className="pointer-events-none absolute -bottom-6 left-0 h-[70%] w-full opacity-30"
            width={6}
          />
          <p className="eyebrow relative text-white/80">GPS — Global Public Services</p>
          <h2
            id="titre-cta-apropos"
            className="relative mx-auto mt-3 max-w-3xl font-display text-[44px] leading-[0.9] font-extrabold uppercase md:text-[76px]"
          >
            On s&apos;occupe du reste.
          </h2>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/boutique" className="btn btn-light">
              Explorer la boutique <IconArrowRight size={18} />
            </Link>
            {wa ? (
              <a href={wa} className="btn btn-wa" target="_blank" rel="noopener noreferrer">
                <IconWhatsApp /> Écrire à GPS
              </a>
            ) : (
              <Link href="/contact" className="btn btn-ink">
                Nous contacter
              </Link>
            )}
          </div>
        </div>
      </section>
      <RevealOnScroll />
    </>
  );
}
