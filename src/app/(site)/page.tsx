import Image from "next/image";
import Link from "next/link";
import { siteContext } from "@/server/context";
import { listCategories, publishedProducts, type PublicProduct } from "@/server/domain/catalog";
import { listServices } from "@/server/domain/services";
import { Ribbon } from "@/components/brand/Ribbon";
import { BrandPanel } from "@/components/brand/BrandPanel";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductImage } from "@/components/shop/ProductImage";
import { Price } from "@/components/shop/Price";
import {
  IconArrowRight,
  IconBag,
  IconCheck,
  IconClock,
  IconPhone,
  IconPin,
  IconStore,
  IconSwap,
  IconWhatsApp,
} from "@/components/ui/icons";
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import { whatsappLink } from "@/lib/whatsapp";

function SectionHead({
  index,
  eyebrow,
  title,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow flex items-center gap-3 text-gps-red-ink">
          <span className="text-ink tabular">{index}</span>
          <span className="h-px w-8 bg-gps-red" aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 className="mt-3 font-display text-[44px] leading-[0.95] font-bold uppercase md:text-[64px]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function optionSummary(p: PublicProduct) {
  return p.axes
    .map((axis) => {
      const values = [...new Set(p.variants.map((v) => v.options[axis]).filter(Boolean))];
      if (axis === "Pointure" && values.length > 2) return `Pointures ${values[0]} à ${values[values.length - 1]}`;
      return values.length > 1 ? `${values.length} ${axis.toLowerCase()}s` : `${axis} : ${values[0]}`;
    })
    .join(" · ");
}

export default async function HomePage() {
  const { db, settings } = await siteContext();
  const [products, categories, services] = await Promise.all([
    publishedProducts(db),
    listCategories(db),
    listServices(db, { publicOnly: true }),
  ]);
  const c = settings.company;

  const hero =
    products.find((p) => p.id === settings.storefront.heroProductId) ?? products.find((p) => p.featured) ?? products[0];
  const selection = products
    .filter((p) => p.featured && p.id !== hero?.id)
    .sort((a, b) => a.featuredPosition - b.featuredPosition)
    .slice(0, 5);
  const focus = products.find((p) => p.id === settings.storefront.focusProductId) ?? selection[selection.length - 1];
  const univers = categories.filter((cat) => cat.product_count > 0);
  const waGeneral = whatsappLink(c.whatsapp, "Bonjour GPS, j'ai une question.");
  const heroImage = hero?.images[0];

  return (
    <>
      {/* ——— Vitrine ——— */}
      <section aria-labelledby="titre-vitrine" className="relative overflow-hidden">
        <div className="container-site grid gap-6 pt-6 pb-12 md:pt-12 lg:grid-cols-12 lg:gap-10 lg:pb-20">
          <div className="order-1 flex flex-col justify-center lg:col-span-5">
            <p className="eyebrow text-gps-blue">GPS — Global Public Services</p>
            <h1
              id="titre-vitrine"
              className="mt-4 font-display text-[56px] leading-[0.88] font-extrabold uppercase sm:text-[72px] xl:text-[96px]"
            >
              <span className="hero-line block" style={{ animationDelay: "60ms" }}>
                La bonne
              </span>
              <span className="hero-line block" style={{ animationDelay: "160ms" }}>
                adresse.
              </span>
              <span className="hero-line block text-gps-red" style={{ animationDelay: "260ms" }}>
                Le bon produit.
              </span>
            </h1>
            <p className="hero-fade mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
              Téléphones, écouteurs, casques, chargeurs, accessoires, lunettes, chaussures et services de transfert
              d&apos;argent. Choisissez en ligne, envoyez votre commande sur WhatsApp, GPS vous confirme.
            </p>
            <div className="hero-fade mt-8 flex flex-wrap gap-3">
              <Link href="/boutique" className="btn btn-primary">
                Voir la boutique <IconArrowRight size={18} />
              </Link>
              <Link href="/services" className="btn btn-outline">
                Transfert d&apos;argent
              </Link>
            </div>
            <ul className="hero-fade mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-semibold text-ink-soft">
              {[
                [IconCheck, "Aucun paiement en ligne"],
                [IconWhatsApp, "Confirmé sur WhatsApp"],
                [IconStore, "Retrait ou livraison"],
              ].map(([Icon, label]) => {
                const I = Icon as typeof IconCheck;
                return (
                  <li key={label as string} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gps-blue-soft text-gps-blue">
                      <I size={15} />
                    </span>
                    {label as string}
                  </li>
                );
              })}
            </ul>
          </div>

          {hero ? (
            <div className="hero-visual relative order-2 lg:col-span-7">
              <Ribbon
                className="pointer-events-none absolute bottom-16 -left-[12%] z-10 h-[40%] w-[124%] md:-bottom-6"
                width={7}
              />
              <Link
                href={`/produits/${hero.slug}`}
                className="group relative block overflow-hidden rounded-[20px] bg-paper-deep shadow-[0_30px_60px_-35px_rgb(20_16_57/0.55)]"
                aria-label={`${hero.name}, ${hero.brand} — voir l'article`}
              >
                {heroImage ? (
                  <Image
                    src={heroImage.url}
                    alt={heroImage.alt}
                    width={1200}
                    height={1500}
                    priority
                    unoptimized={heroImage.url.endsWith(".svg")}
                    sizes="(max-width: 1024px) 100vw, 60vw"
                    className="aspect-[4/3] w-full object-cover object-[50%_40%] transition-transform duration-700 group-hover:scale-[1.04] sm:aspect-[16/11] lg:aspect-[4/4.2]"
                  />
                ) : null}
                <div className="flex flex-wrap items-end justify-between gap-3 bg-card p-4 md:absolute md:bottom-6 md:left-6 md:max-w-sm md:rounded-[16px] md:bg-paper/90 md:shadow-xl md:backdrop-blur">
                  <div>
                    <p className="eyebrow text-gps-red-ink">En vitrine</p>
                    <p className="mt-1 font-display text-[28px] leading-none font-bold uppercase">{hero.name}</p>
                    <Price
                      price={hero.minPrice}
                      basePrice={hero.promo ? hero.minBasePrice : undefined}
                      from={new Set(hero.variants.map((v) => v.price)).size > 1}
                      className="mt-2"
                    />
                  </div>
                  <span className="btn btn-ink btn-sm">
                    Voir <IconArrowRight size={16} />
                  </span>
                </div>
                {hero.isDemo ? (
                  <span className="absolute top-3 right-3 rounded-[4px] bg-ink/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                    Illustration
                  </span>
                ) : null}
              </Link>
            </div>
          ) : (
            <div className="order-2 flex aspect-[4/3] items-center justify-center rounded-[6px] border border-dashed border-line lg:col-span-7">
              <p className="max-w-xs text-center text-ink-mute">
                La vedette apparaîtra ici dès qu&apos;un produit sera publié.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ——— Bandeau défilant ——— */}
      {univers.length ? (
        <div className="marquee border-y border-gps-blue-night bg-gps-blue-night py-4 text-white" aria-hidden="true">
          <div className="marquee-track">
            {[0, 1].map((k) => (
              <span key={k} className="flex shrink-0 items-center">
                {[...univers.map((u) => u.name), "Transfert d'argent", "Le service qui rassure"].map((t) => (
                  <span
                    key={t}
                    className="flex items-center font-display text-2xl font-extrabold uppercase md:text-3xl"
                  >
                    <span className="px-6">{t}</span>
                    <span className="h-2 w-2 rounded-full bg-gps-red" />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ——— 01 Univers ——— */}
      {univers.length ? (
        <section aria-labelledby="titre-univers" className="border-t border-line">
          <div className="container-site grid gap-10 py-16 md:py-24 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <SectionHead index="01" eyebrow="Univers" title="Tout sous un même toit" />
              <p className="mt-4 max-w-sm text-ink-soft">
                Du téléphone à la paire de baskets : choisissez un univers pour voir les articles disponibles.
              </p>
            </div>
            <h2 id="titre-univers" className="sr-only">
              Univers produits
            </h2>
            <ul className="grid grid-cols-2 gap-3 md:gap-4 lg:col-span-8 lg:grid-cols-3" data-reveal>
              {univers.map((cat, i) => {
                const sample = products.find((p) => p.categorySlug === cat.slug);
                const img = sample?.images[0];
                return (
                  <li key={cat.id} className={i === 0 ? "col-span-2 lg:col-span-1 lg:row-span-2" : ""}>
                    <Link
                      href={`/categories/${cat.slug}`}
                      className="univers-tile group relative flex h-full min-h-[170px] flex-col justify-end overflow-hidden rounded-[18px] bg-gps-blue-night p-4 text-white md:min-h-[210px]"
                    >
                      {img ? (
                        <Image
                          src={img.url}
                          alt=""
                          fill
                          sizes="(max-width: 1024px) 50vw, 25vw"
                          unoptimized={img.url.endsWith(".svg")}
                          className="object-cover opacity-80 transition-transform duration-700 group-hover:scale-110"
                        />
                      ) : null}
                      <span className="absolute inset-0 bg-gradient-to-t from-gps-blue-night via-gps-blue-night/40 to-transparent" />
                      <span className="relative flex items-end justify-between gap-2">
                        <span>
                          <span className="block text-[12px] font-bold text-white/70 tabular">
                            {String(i + 1).padStart(2, "0")} · {cat.product_count} article
                            {cat.product_count > 1 ? "s" : ""}
                          </span>
                          <span className="mt-1 block font-display text-[26px] leading-none font-extrabold uppercase md:text-[32px]">
                            {cat.name}
                          </span>
                        </span>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gps-blue-night transition-transform duration-300 group-hover:translate-x-1 group-hover:bg-gps-red group-hover:text-white">
                          <IconArrowRight size={18} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ——— 02 Sélection GPS ——— */}
      {selection.length ? (
        <section aria-labelledby="titre-selection" className="bg-card">
          <div className="container-site py-16 md:py-24">
            <SectionHead index="02" eyebrow="Sélection GPS" title="Choisis au comptoir">
              <Link href="/boutique" className="btn btn-outline btn-sm">
                Toute la boutique <IconArrowRight size={16} />
              </Link>
            </SectionHead>
            <h2 id="titre-selection" className="sr-only">
              Sélection GPS
            </h2>
            <div data-reveal className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:gap-x-6 lg:grid-cols-12">
              <div className="col-span-2 lg:col-span-6 lg:row-span-2">
                <ProductCard
                  product={selection[0]}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  imageClassName="aspect-[4/3] lg:aspect-[4/4.3]"
                />
              </div>
              {selection.slice(1, 5).map((p) => (
                <div key={p.id} className="lg:col-span-3">
                  <ProductCard product={p} sizes="(max-width: 1024px) 50vw, 25vw" />
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ——— 03 Focus ——— */}
      {focus ? (
        <section aria-labelledby="titre-focus" className="border-t border-line">
          <div
            data-reveal
            className="container-site grid gap-8 py-16 md:py-24 lg:grid-cols-12 lg:items-center lg:gap-16"
          >
            <div className="relative lg:order-2 lg:col-span-7">
              <div className="grid grid-cols-5 gap-3">
                <div className="col-span-3 overflow-hidden rounded-[6px]">
                  <ProductImage
                    src={focus.images[0]?.url}
                    alt={focus.images[0]?.alt ?? focus.name}
                    sizes="(max-width: 1024px) 60vw, 35vw"
                  />
                </div>
                <div className="col-span-2 mt-16 overflow-hidden rounded-[6px]">
                  <ProductImage
                    src={(focus.images[1] ?? focus.images[0])?.url}
                    alt={(focus.images[1] ?? focus.images[0])?.alt ?? focus.name}
                    sizes="(max-width: 1024px) 40vw, 25vw"
                  />
                </div>
              </div>
            </div>
            <div className="lg:order-1 lg:col-span-5">
              <SectionHead index="03" eyebrow="Focus" title={focus.name} />
              <h2 id="titre-focus" className="sr-only">
                Focus sur {focus.name}
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
                {settings.storefront.focusText || focus.description}
              </p>
              <dl className="mt-6 divide-y divide-line border-y border-line">
                {focus.specs.slice(0, 3).map((s) => (
                  <div key={s.label} className="flex justify-between gap-4 py-3 text-[15px]">
                    <dt className="text-ink-mute">{s.label}</dt>
                    <dd className="text-right font-semibold">{s.value}</dd>
                  </div>
                ))}
                {optionSummary(focus) ? (
                  <div className="flex justify-between gap-4 py-3 text-[15px]">
                    <dt className="text-ink-mute">Choix</dt>
                    <dd className="text-right font-semibold">{optionSummary(focus)}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Price
                  price={focus.minPrice}
                  basePrice={focus.promo ? focus.minBasePrice : undefined}
                  from={new Set(focus.variants.map((v) => v.price)).size > 1}
                  size="lg"
                />
                <Link href={`/produits/${focus.slug}`} className="btn btn-primary">
                  Choisir {focus.axes.includes("Pointure") ? "ma pointure" : "mon modèle"} <IconArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ——— 04 Comptoir services ——— */}
      <section aria-labelledby="titre-services" className="relative overflow-hidden bg-gps-blue text-white">
        <Ribbon
          tone="white"
          className="pointer-events-none absolute -right-10 bottom-0 h-[70%] w-[80%] opacity-30"
          width={5}
        />
        <div data-reveal className="relative container-site grid gap-10 py-16 md:py-24 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p className="eyebrow flex items-center gap-3 text-white/80">
              <span className="text-white tabular">04</span>
              <span className="h-px w-8 bg-gps-red" aria-hidden="true" />
              Comptoir services
            </p>
            <h2
              id="titre-services"
              className="mt-3 font-display text-[44px] leading-[0.95] font-bold uppercase md:text-[64px]"
            >
              Transfert d&apos;argent,
              <br />
              au comptoir GPS.
            </h2>
            <p className="mt-5 max-w-[48ch] text-[17px] leading-relaxed text-white/85">
              Envoyer ou recevoir de l&apos;argent se fait en personne, au comptoir. Le site présente le service ;
              aucune opération n&apos;est réalisée en ligne.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/services" className="btn btn-light">
                Voir le service <IconArrowRight size={18} />
              </Link>
              {waGeneral ? (
                <a href={waGeneral} className="btn btn-wa" target="_blank" rel="noopener noreferrer">
                  <IconWhatsApp /> Poser une question
                </a>
              ) : null}
            </div>
          </div>
          <ul className="grid gap-3 self-end lg:col-span-5 lg:col-start-8">
            {(services.length ? services : [null]).map((s, i) => (
              <li key={s?.id ?? i} className="rounded-[6px] border border-white/20 bg-white/5 p-5">
                <p className="flex items-center gap-3 font-display text-2xl font-bold uppercase">
                  <IconSwap /> {s?.title ?? "Transfert d'argent"}
                </p>
                <dl className="mt-3 grid gap-2 text-[15px]">
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">Opérateurs</dt>
                    <dd className="text-right font-semibold">{s?.operators || "À confirmer avec GPS"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/70">Horaires</dt>
                    <dd className="text-right font-semibold">{s?.hours || c.hours || "À confirmer avec GPS"}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ——— 05 Boutique physique ——— */}
      <section aria-labelledby="titre-boutique">
        <div data-reveal className="container-site grid gap-10 py-16 md:py-24 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            {c.storePhotoUrl ? (
              <Image
                src={c.storePhotoUrl}
                alt="La boutique GPS"
                width={1400}
                height={1000}
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="aspect-[7/5] w-full rounded-[6px] object-cover"
              />
            ) : (
              <BrandPanel caption="Photo de la boutique à venir" className="aspect-[16/9] w-full lg:aspect-[7/5]" />
            )}
          </div>
          <div className="lg:col-span-5">
            <SectionHead index="05" eyebrow="La boutique" title="Passez au comptoir" />
            <h2 id="titre-boutique" className="sr-only">
              La boutique physique
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-ink-soft">
              {c.storeText ||
                "Un lieu pour voir les produits, poser vos questions, retirer une commande confirmée et utiliser les services de transfert d'argent."}
            </p>
            <Link href="/a-propos" className="btn btn-outline mt-6">
              Découvrir GPS
            </Link>
          </div>
        </div>
      </section>

      {/* ——— 06 Infos pratiques ——— */}
      <section aria-labelledby="titre-infos" className="border-t border-line bg-card">
        <div className="container-site py-16 md:py-20">
          <SectionHead index="06" eyebrow="Pratique" title="Commander chez GPS" />
          <h2 id="titre-infos" className="sr-only">
            Informations pratiques
          </h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-12">
            <ol className="steps-flow grid gap-4 sm:grid-cols-3 lg:col-span-7" data-reveal>
              {[
                [
                  IconBag,
                  "Choisissez",
                  "Variante, quantité : constituez votre panier sur le site. Rien n'est réservé à ce stade.",
                ],
                [IconWhatsApp, "Envoyez", "Le site prépare un récapitulatif. Vous l'envoyez vous-même sur WhatsApp."],
                [
                  IconCheck,
                  "GPS confirme",
                  "GPS vérifie la disponibilité, confirme le total et les modalités de réception.",
                ],
              ].map(([Icon, t, d], i) => {
                const I = Icon as typeof IconBag;
                return (
                  <li
                    key={t as string}
                    className="relative rounded-[18px] border border-line-soft bg-paper p-5"
                    style={{ transitionDelay: `${i * 90}ms` }}
                  >
                    <span className="flex items-center justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gps-blue text-white">
                        <I size={22} />
                      </span>
                      <span className="font-display text-[44px] leading-none font-extrabold text-gps-red/20 tabular">
                        {i + 1}
                      </span>
                    </span>
                    <p className="mt-4 text-lg font-extrabold">{t as string}</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{d as string}</p>
                  </li>
                );
              })}
            </ol>
            <dl className="grid gap-5 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
              {[
                [IconPin, "Adresse", [c.address, c.city].filter(Boolean).join(", ")],
                [IconClock, "Horaires", c.hours],
                [IconPhone, "Téléphone", c.phone],
              ].map(([Icon, label, value]) => {
                const I = Icon as typeof IconPin;
                return (
                  <div key={label as string} className="flex gap-3">
                    <I className="mt-0.5 shrink-0 text-gps-blue" />
                    <div>
                      <dt className="text-[13px] font-bold tracking-wide text-ink-mute uppercase">{label as string}</dt>
                      <dd className="mt-0.5 font-semibold">
                        {(value as string) || (
                          <span className="font-normal text-ink-mute italic">À confirmer avec GPS</span>
                        )}
                      </dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      </section>

      {/* ——— Appel final ——— */}
      <section aria-labelledby="titre-cta" className="container-site py-16 md:py-24">
        <div
          data-reveal
          className="relative overflow-hidden rounded-[28px] bg-gps-red px-6 py-14 text-center text-white md:px-12 md:py-20"
        >
          <Ribbon
            tone="white"
            className="pointer-events-none absolute -bottom-6 left-0 h-[70%] w-full opacity-30"
            width={6}
          />
          <p className="eyebrow relative text-white/80">Le service qui rassure</p>
          <h2
            id="titre-cta"
            className="relative mx-auto mt-3 max-w-3xl font-display text-[48px] leading-[0.9] font-extrabold uppercase md:text-[84px]"
          >
            Votre prochain article est chez GPS.
          </h2>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/boutique" className="btn btn-light">
              Explorer la boutique <IconArrowRight size={18} />
            </Link>
            {waGeneral ? (
              <a href={waGeneral} className="btn btn-wa" target="_blank" rel="noopener noreferrer">
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
