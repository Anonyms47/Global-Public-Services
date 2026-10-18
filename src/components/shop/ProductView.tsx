"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicProduct, PublicVariant } from "@/server/domain/catalog";
import { formatDate, optionsLabel } from "@/lib/format";
import { productQuestionMessage, whatsappLink } from "@/lib/whatsapp";
import { cart } from "../cart/cart-store";
import { Sheet } from "../ui/Sheet";
import {
  IconBag,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconInfo,
  IconMinus,
  IconPlus,
  IconStore,
  IconWhatsApp,
  IconZoom,
} from "../ui/icons";
import { Price } from "./Price";

const VISUAL_AXES = ["Couleur", "Monture", "Coloris"];

function matches(v: PublicVariant, sel: Record<string, string | undefined>, except?: string) {
  return Object.entries(sel).every(([k, val]) => k === except || !val || v.options[k] === val);
}

export function ProductView({
  product,
  url,
  whatsapp,
  preview = false,
}: {
  product: PublicProduct;
  url: string;
  whatsapp: string;
  /** Aperçu interne (brouillons) : fichiers privés chargés directement, avec la session. */
  preview?: boolean;
}) {
  const direct = (u: string) => u.endsWith(".svg") || (preview && u.startsWith("/media/"));
  const axes = product.axes;
  const values = useMemo(
    () =>
      Object.fromEntries(axes.map((a) => [a, [...new Set(product.variants.map((v) => v.options[a]).filter(Boolean))]])),
    [axes, product.variants],
  );

  const [sel, setSel] = useState<Record<string, string | undefined>>(() => {
    const init: Record<string, string | undefined> = {};
    for (const a of axes) {
      if (values[a].length === 1) init[a] = values[a][0];
      else if (VISUAL_AXES.includes(a)) {
        init[a] =
          values[a].find((val) => product.variants.some((v) => v.options[a] === val && v.available > 0)) ??
          values[a][0];
      }
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<{
    quantity: number;
    capped: boolean;
  } | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  const missing = axes.filter((a) => !sel[a]);
  const variant =
    missing.length === 0
      ? (product.variants.find((v) => axes.every((a) => v.options[a] === sel[a])) ??
        (axes.length === 0 ? product.variants[0] : undefined))
      : undefined;
  const maxQty = variant ? Math.min(variant.available, 10) : 10;
  const variantKey = `${variant?.id ?? ""}|${maxQty}`;
  const [seenVariant, setSeenVariant] = useState(variantKey);
  if (seenVariant !== variantKey) {
    setSeenVariant(variantKey);
    setQty((q) => Math.max(1, Math.min(q, Math.max(1, maxQty))));
    setAdded(null);
  }

  // Galerie : visuels de la couleur choisie si disponibles.
  const visualAxis = axes.find((a) => VISUAL_AXES.includes(a));
  const images = useMemo(() => {
    const color = visualAxis ? sel[visualAxis] : undefined;
    const own = color ? product.images.filter((i) => i.color === color) : [];
    return own.length ? own : product.images;
  }, [product.images, sel, visualAxis]);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const imagesKey = images.map((i) => i.url).join("|");
  const [seenImages, setSeenImages] = useState(imagesKey);
  if (seenImages !== imagesKey) {
    setSeenImages(imagesKey);
    setActive(0);
  }
  const current = images[Math.min(active, images.length - 1)];
  const track = useRef<HTMLDivElement>(null);
  const goTo = (i: number) => {
    const t = track.current;
    setActive(i);
    if (!t) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollTo({ left: i * t.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
  }, [imagesKey]);

  // Barre d'achat mobile : visible une fois le bouton principal dépassé.
  const buyRow = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [barVisible, setBarVisible] = useState(false);
  useEffect(() => {
    const el = buyRow.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBarVisible(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const priceShown = variant?.price ?? product.minPrice;
  const baseShown = variant?.basePrice ?? product.minBasePrice;

  let status: { tone: "ok" | "low" | "out" | "info"; text: string };
  if (!variant && missing.length)
    status = {
      tone: "info",
      text: `Choisissez : ${missing.join(", ").toLowerCase()}.`,
    };
  else if (!variant) status = { tone: "out", text: "Cette combinaison n'existe pas." };
  else if (variant.available === 0)
    status = {
      tone: "out",
      text: product.stockTracked
        ? "Épuisé — cette option ne peut pas être commandée pour le moment."
        : "Indisponible pour le moment — demandez à GPS une option équivalente.",
    };
  else if (product.stockTracked && variant.available <= 3)
    status = {
      tone: "low",
      text: `Plus que ${variant.available} disponible${variant.available > 1 ? "s" : ""}.`,
    };
  else status = { tone: "ok", text: "Disponible." };

  const canAdd = !!variant && variant.available > 0;
  const add = () => {
    if (!variant) {
      setShowMissing(true);
      return;
    }
    if (variant.available === 0) return;
    const quantity = cart.add(
      {
        variantId: variant.id,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sku: variant.sku,
        optionsLabel: optionsLabel(variant.options, axes),
        image: (images[0] ?? product.images[0])?.url ?? null,
        unitPrice: variant.price,
        quantity: qty,
      },
      variant.available,
    );
    setAdded({ quantity, capped: quantity < qty });
    requestAnimationFrame(() => confirmRef.current?.focus());
  };

  const question = whatsappLink(
    whatsapp,
    productQuestionMessage(product.name, url, variant ? optionsLabel(variant.options, axes) : undefined),
  );

  const optionState = (axis: string, val: string) => {
    const pool = product.variants.filter((v) => v.options[axis] === val && matches(v, sel, axis));
    if (!pool.length) return "none" as const;
    return pool.some((v) => v.available > 0) ? ("ok" as const) : ("out" as const);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
      {/* Galerie */}
      <div className="lg:col-span-7">
        <div className="grid gap-3 md:grid-cols-[84px_1fr] md:gap-4">
          <div className="pdp-media relative order-1 overflow-hidden rounded-[24px] bg-paper-deep md:order-2">
            {images.length ? (
              <div
                ref={track}
                className="pdp-track flex snap-x snap-mandatory overflow-x-auto"
                onScroll={(e) => {
                  const t = e.currentTarget;
                  const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
                  if (i !== active) setActive(i);
                }}
                aria-label="Photos du produit, faire glisser pour changer"
              >
                {images.map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => {
                      setActive(i);
                      setZoom(true);
                    }}
                    className="group block w-full shrink-0 cursor-zoom-in snap-center"
                    aria-label={`Agrandir la photo ${i + 1} : ${img.alt}`}
                  >
                    <Image
                      src={img.url}
                      alt={img.alt}
                      width={1200}
                      height={1500}
                      priority={i === 0}
                      sizes="(max-width: 1024px) 100vw, 55vw"
                      unoptimized={direct(img.url)}
                      className="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out md:group-hover:scale-[1.03]"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-ink-mute">Photo à venir</div>
            )}
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
              <span className="flex flex-wrap gap-1.5">
                {product.promo ? <span className="card-pill card-pill-red">{product.promo.label}</span> : null}
                {product.condition && product.condition !== "Neuf" ? (
                  <span className="card-pill">{product.condition.split(" —")[0]}</span>
                ) : null}
              </span>
              {product.isDemo ? (
                <span className="rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase backdrop-blur-sm">
                  Illustration
                </span>
              ) : null}
            </div>
            {current ? (
              <span
                aria-hidden="true"
                className="card-go pointer-events-none absolute right-3 bottom-3 !h-11 !w-11 !rotate-0"
              >
                <IconZoom size={20} />
              </span>
            ) : null}
            {images.length > 1 ? (
              <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/45 px-2.5 py-1.5 backdrop-blur-sm md:hidden">
                {images.map((img, i) => (
                  <span
                    key={img.url}
                    className={`h-1.5 rounded-full bg-white transition-all duration-300 ${i === active ? "w-5" : "w-1.5 opacity-50"}`}
                  />
                ))}
                <span className="sr-only">
                  Photo {active + 1} sur {images.length}
                </span>
              </div>
            ) : null}
          </div>
          {images.length > 1 ? (
            <ul className="order-2 hidden gap-2 md:order-1 md:flex md:flex-col" aria-label="Miniatures">
              {images.map((img, i) => (
                <li key={img.url} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Photo ${i + 1} : ${img.alt}`}
                    aria-current={i === active}
                    className={`block w-[84px] overflow-hidden rounded-[14px] border-2 transition-[border-color,opacity] ${i === active ? "border-gps-blue" : "border-transparent opacity-70 hover:opacity-100"}`}
                  >
                    <Image
                      src={img.url}
                      alt=""
                      width={120}
                      height={150}
                      unoptimized={direct(img.url)}
                      className="aspect-[4/5] w-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {product.videos?.length ? (
            <div className="order-3 grid gap-3 md:col-span-full">
              {product.videos.map((v) => (
                <video
                  key={v.url}
                  src={v.url}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Vidéo : ${v.alt || product.name}`}
                  className="aspect-[4/5] w-full rounded-[14px] bg-ink object-contain md:aspect-video"
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Achat */}
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">
          <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] font-bold tracking-[0.08em] text-ink-mute uppercase">
            {product.brand}
            {product.categoryName ? (
              <>
                {" · "}
                <Link className="underline-offset-2 hover:underline" href={`/categories/${product.categorySlug}`}>
                  {product.categoryName}
                </Link>
              </>
            ) : null}
          </p>
          <h1 className="hero-line mt-2 font-display text-[44px] leading-[0.92] font-extrabold uppercase md:text-[60px]">
            {product.name}
          </h1>
          {product.condition ? (
            <p className="mt-3 inline-flex rounded-full bg-gps-blue-soft px-3 py-1 text-[13px] font-bold text-gps-blue">
              État : {product.condition}
            </p>
          ) : null}

          <div className="mt-5">
            <Price
              price={priceShown}
              basePrice={product.promo ? baseShown : undefined}
              from={!variant && new Set(product.variants.map((v) => v.price)).size > 1}
              size="xl"
            />
            {product.promo ? (
              <p className="mt-1 text-[14px] font-semibold text-gps-red-ink">
                {product.promo.name} — jusqu&apos;au {formatDate(product.promo.endsAt)}
              </p>
            ) : null}
          </div>

          <div ref={optionsRef} className="scroll-mt-28">
            {axes.map((axis) => (
              <fieldset key={axis} className="mt-6">
                <legend className="mb-2 flex w-full justify-between text-[15px] font-bold">
                  <span>
                    {axis}
                    {sel[axis] ? <span className="font-semibold text-ink-soft"> : {sel[axis]}</span> : null}
                  </span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {values[axis].map((val) => {
                    const st = optionState(axis, val);
                    const on = sel[axis] === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${axis} ${val}${st === "out" ? (product.stockTracked ? ", épuisé" : ", indisponible") : st === "none" ? ", indisponible avec la sélection actuelle" : ""}`}
                        onClick={() => {
                          setSel((s) => ({
                            ...s,
                            [axis]: on && values[axis].length > 1 && !VISUAL_AXES.includes(axis) ? undefined : val,
                          }));
                          setShowMissing(false);
                        }}
                        className={`relative min-h-12 min-w-12 rounded-full border-[1.5px] px-5 text-[15px] font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-95 ${
                          on
                            ? "border-gps-blue bg-gps-blue text-white shadow-[0_6px_14px_-8px_rgb(49_39_127/0.8)]"
                            : "border-line bg-white hover:border-gps-blue hover:text-gps-blue"
                        } ${st !== "ok" ? "text-ink-mute line-through decoration-gps-red decoration-2" : ""} ${on && st !== "ok" ? "text-white/80" : ""}`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <p
            role="status"
            className={`mt-5 flex items-start gap-2 rounded-[14px] px-3.5 py-3 text-[15px] font-semibold ${
              status.tone === "ok"
                ? "bg-wa-soft text-wa-ink"
                : status.tone === "low"
                  ? "bg-warn-soft text-warn"
                  : status.tone === "out"
                    ? "bg-gps-red-soft text-gps-red-ink"
                    : showMissing
                      ? "bg-warn-soft text-warn"
                      : "bg-paper-deep text-ink-soft"
            }`}
          >
            <IconInfo className="mt-0.5 shrink-0" size={18} />
            <span>
              {status.text}
              {variant ? <span className="block text-[13px] font-normal opacity-80">Réf. {variant.sku}</span> : null}
            </span>
          </p>

          <div ref={buyRow} className="mt-5 flex flex-wrap gap-3">
            <div
              className="flex items-center rounded-full border-[1.5px] border-line bg-white"
              role="group"
              aria-label="Quantité"
            >
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Diminuer la quantité"
              >
                <IconMinus />
              </button>
              <output className="w-8 text-center text-lg font-bold tabular" aria-live="polite">
                {qty}
              </output>
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
                onClick={() => setQty((q) => Math.min(Math.max(1, maxQty), q + 1))}
                disabled={!canAdd || qty >= maxQty}
                aria-label="Augmenter la quantité"
              >
                <IconPlus />
              </button>
            </div>
            <button
              type="button"
              onClick={add}
              aria-disabled={!canAdd}
              className={`btn btn-primary flex-1 text-base ${!canAdd ? "opacity-55" : ""}`}
              aria-describedby="aide-ajout"
            >
              <IconBag /> Ajouter au panier
            </button>
          </div>
          <p id="aide-ajout" className="hint">
            {variant && variant.available === 0
              ? product.stockTracked
                ? "Option épuisée : choisissez une autre option ou demandez à GPS."
                : "Option indisponible : choisissez une autre option ou demandez à GPS."
              : missing.length
                ? `Sélection manquante : ${missing.join(", ").toLowerCase()}.`
                : "L'ajout au panier ne réserve pas l'article."}
          </p>

          {added ? (
            <div
              ref={confirmRef}
              tabIndex={-1}
              role="status"
              className="animate-rise mt-4 rounded-[18px] border-[1.5px] border-wa bg-wa-soft p-4 outline-none"
            >
              <p className="flex items-center gap-2 font-bold text-wa-ink">
                <IconCheck /> Ajouté au panier
              </p>
              <p className="mt-1 text-[14px] text-ink-soft">
                {product.name}
                {variant ? ` — ${optionsLabel(variant.options, axes)}` : ""} · {added.quantity} au total dans le panier
                {added.capped ? " (quantité limitée)" : ""}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/panier" className="btn btn-ink btn-sm">
                  Voir le panier
                </Link>
                <Link href="/boutique" className="btn btn-outline btn-sm">
                  Continuer mes achats
                </Link>
              </div>
            </div>
          ) : null}

          <ul className="mt-6 grid grid-cols-3 gap-2 text-center text-[12.5px] leading-tight font-semibold text-ink-soft">
            <li className="pdp-trust">
              <IconCheck size={18} className="text-gps-blue" />
              Aucun paiement en ligne
            </li>
            <li className="pdp-trust">
              <IconWhatsApp size={18} className="text-wa-ink" />
              Confirmé sur WhatsApp
            </li>
            <li className="pdp-trust">
              <IconStore size={18} className="text-gps-blue" />
              Retrait ou livraison
            </li>
          </ul>

          <div className="mt-5">
            {question ? (
              <a
                href={question}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline w-full border-wa text-wa-ink hover:bg-wa-soft"
              >
                <IconWhatsApp /> Poser une question sur WhatsApp
              </a>
            ) : (
              <div className="rounded-[18px] border border-dashed border-line p-3.5 text-[14px] text-ink-soft">
                <p className="flex items-center gap-2 font-bold text-ink">
                  <IconWhatsApp className="text-wa" /> Question sur WhatsApp
                </p>
                <p className="mt-1">Disponible dès que le numéro WhatsApp de GPS sera renseigné.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barre d'achat mobile */}
      <div
        className={`cart-bar lg:hidden ${barVisible ? "" : "is-hidden"}`}
        aria-hidden={!barVisible}
        inert={!barVisible}
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink-soft">{product.name}</p>
          <Price
            price={priceShown}
            basePrice={product.promo ? baseShown : undefined}
            from={!variant && new Set(product.variants.map((v) => v.price)).size > 1}
            size="sm"
          />
        </div>
        <button
          type="button"
          className={`btn btn-primary btn-sm shrink-0 ${variant && variant.available === 0 ? "opacity-55" : ""}`}
          aria-label="Ajout rapide au panier"
          onClick={() => {
            if (canAdd) add();
            else {
              setShowMissing(true);
              optionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
        >
          <IconBag size={18} /> {missing.length ? "Choisir" : "Ajouter"}
        </button>
      </div>

      <Sheet open={zoom} onClose={() => setZoom(false)} title={product.name} side="center" wide>
        {current ? (
          <div
            className="relative"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setActive((a) => (a + 1) % images.length);
              if (e.key === "ArrowLeft") setActive((a) => (a - 1 + images.length) % images.length);
            }}
          >
            <Image
              src={current.url}
              alt={current.alt}
              width={1200}
              height={1500}
              sizes="90vw"
              unoptimized={direct(current.url)}
              className="mx-auto max-h-[72dvh] w-auto object-contain"
            />
            {images.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setActive((a) => (a - 1 + images.length) % images.length)}
                  aria-label="Photo précédente"
                >
                  <IconChevronLeft />
                </button>
                <span className="text-[14px] tabular">
                  {active + 1} / {images.length}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setActive((a) => (a + 1) % images.length)}
                  aria-label="Photo suivante"
                >
                  <IconChevronRight />
                </button>
              </div>
            ) : null}
            <p className="mt-2 text-center text-[14px] text-ink-mute">{current.alt}</p>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

export function BackToResults({ href }: { href: string }) {
  return (
    <Link
      href={href}
      onClick={() => {
        try {
          sessionStorage.setItem("gps-restore", href);
        } catch {}
      }}
      className="inline-flex min-h-11 items-center gap-1 text-[15px] font-bold text-gps-blue hover:underline"
    >
      <IconChevronLeft size={18} /> Retour aux résultats
    </Link>
  );
}
