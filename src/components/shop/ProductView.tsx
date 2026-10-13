"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { PublicProduct, PublicVariant } from "@/server/domain/catalog";
import { optionsLabel } from "@/lib/format";
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
  IconWhatsApp,
  IconZoom,
} from "../ui/icons";
import { Price } from "./Price";

const VISUAL_AXES = ["Couleur", "Monture", "Coloris"];

function matches(
  v: PublicVariant,
  sel: Record<string, string | undefined>,
  except?: string,
) {
  return Object.entries(sel).every(
    ([k, val]) => k === except || !val || v.options[k] === val,
  );
}

export function ProductView({
  product,
  url,
  whatsapp,
}: {
  product: PublicProduct;
  url: string;
  whatsapp: string;
}) {
  const axes = product.axes;
  const values = useMemo(
    () =>
      Object.fromEntries(
        axes.map((a) => [
          a,
          [
            ...new Set(
              product.variants.map((v) => v.options[a]).filter(Boolean),
            ),
          ],
        ]),
      ),
    [axes, product.variants],
  );

  const [sel, setSel] = useState<Record<string, string | undefined>>(() => {
    const init: Record<string, string | undefined> = {};
    for (const a of axes) {
      if (values[a].length === 1) init[a] = values[a][0];
      else if (VISUAL_AXES.includes(a)) {
        init[a] =
          values[a].find((val) =>
            product.variants.some(
              (v) => v.options[a] === val && v.available > 0,
            ),
          ) ?? values[a][0];
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
      ? (product.variants.find((v) =>
          axes.every((a) => v.options[a] === sel[a]),
        ) ?? (axes.length === 0 ? product.variants[0] : undefined))
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

  const priceShown = variant?.price ?? product.minPrice;
  const baseShown = variant?.basePrice ?? product.minBasePrice;

  let status: { tone: "ok" | "low" | "out" | "info"; text: string };
  if (!variant && missing.length)
    status = {
      tone: "info",
      text: `Choisissez : ${missing.join(", ").toLowerCase()}.`,
    };
  else if (!variant)
    status = { tone: "out", text: "Cette combinaison n'existe pas." };
  else if (variant.available === 0)
    status = {
      tone: "out",
      text: "Épuisé — cette option ne peut pas être commandée pour le moment.",
    };
  else if (variant.available <= 3)
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
    productQuestionMessage(
      product.name,
      url,
      variant ? optionsLabel(variant.options, axes) : undefined,
    ),
  );

  const optionState = (axis: string, val: string) => {
    const pool = product.variants.filter(
      (v) => v.options[axis] === val && matches(v, sel, axis),
    );
    if (!pool.length) return "none" as const;
    return pool.some((v) => v.available > 0)
      ? ("ok" as const)
      : ("out" as const);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
      {/* Galerie */}
      <div className="lg:col-span-7">
        <div className="grid gap-3 md:grid-cols-[88px_1fr] md:gap-4">
          <div className="bg-paper-deep relative order-1 overflow-hidden rounded-[6px] md:order-2">
            {current ? (
              <button
                type="button"
                onClick={() => setZoom(true)}
                className="group block w-full cursor-zoom-in"
                aria-label={`Agrandir la photo : ${current.alt}`}
              >
                <Image
                  key={current.url}
                  src={current.url}
                  alt={current.alt}
                  width={1200}
                  height={1500}
                  priority
                  sizes="(max-width: 1024px) 100vw, 55vw"
                  unoptimized={current.url.endsWith(".svg")}
                  className="animate-rise aspect-[4/5] w-full object-cover"
                />
                <span className="bg-paper/90 text-ink absolute right-3 bottom-3 inline-flex h-11 w-11 items-center justify-center rounded-[6px]">
                  <IconZoom />
                </span>
              </button>
            ) : (
              <div className="text-ink-mute flex aspect-[4/5] items-center justify-center">
                Photo à venir
              </div>
            )}
            {product.isDemo ? (
              <span className="bg-ink/70 absolute top-3 right-3 rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                Illustration
              </span>
            ) : null}
            {product.promo ? (
              <span className="bg-gps-red absolute top-3 left-3 rounded-[4px] px-2 py-1 text-[13px] font-extrabold text-white">
                {product.promo.label}
              </span>
            ) : null}
          </div>
          {images.length > 1 ? (
            <ul
              className="order-2 flex gap-2 overflow-x-auto md:order-1 md:flex-col"
              aria-label="Photos du produit"
            >
              {images.map((img, i) => (
                <li key={img.url} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Photo ${i + 1} : ${img.alt}`}
                    aria-current={i === active}
                    className={`block w-[72px] overflow-hidden rounded-[4px] border-2 md:w-[88px] ${i === active ? "border-gps-blue" : "border-transparent"}`}
                  >
                    <Image
                      src={img.url}
                      alt=""
                      width={120}
                      height={150}
                      unoptimized={img.url.endsWith(".svg")}
                      className="aspect-[4/5] w-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {/* Achat */}
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28">
          <p className="text-ink-mute text-[14px] font-semibold">
            {product.brand}
            {product.categoryName ? (
              <>
                {" · "}
                <Link
                  className="underline-offset-2 hover:underline"
                  href={`/categories/${product.categorySlug}`}
                >
                  {product.categoryName}
                </Link>
              </>
            ) : null}
          </p>
          <h1 className="font-display mt-2 text-[44px] leading-[0.92] font-extrabold uppercase md:text-[56px]">
            {product.name}
          </h1>
          {product.condition ? (
            <p className="bg-gps-blue-soft text-gps-blue mt-3 inline-flex rounded-[4px] px-2 py-1 text-[13px] font-bold">
              État : {product.condition}
            </p>
          ) : null}

          <div className="mt-5">
            <Price
              price={priceShown}
              basePrice={product.promo ? baseShown : undefined}
              from={
                !variant &&
                new Set(product.variants.map((v) => v.price)).size > 1
              }
              size="xl"
            />
            {product.promo ? (
              <p className="text-gps-red-ink mt-1 text-[14px] font-semibold">
                {product.promo.name} — jusqu&apos;au{" "}
                {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
                  new Date(product.promo.endsAt),
                )}
              </p>
            ) : null}
          </div>

          {axes.map((axis) => (
            <fieldset key={axis} className="mt-6">
              <legend className="mb-2 flex w-full justify-between text-[15px] font-bold">
                <span>
                  {axis}
                  {sel[axis] ? (
                    <span className="text-ink-soft font-semibold">
                      {" "}
                      : {sel[axis]}
                    </span>
                  ) : null}
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
                      aria-label={`${axis} ${val}${st === "out" ? ", épuisé" : st === "none" ? ", indisponible avec la sélection actuelle" : ""}`}
                      onClick={() => {
                        setSel((s) => ({
                          ...s,
                          [axis]:
                            on &&
                            values[axis].length > 1 &&
                            !VISUAL_AXES.includes(axis)
                              ? undefined
                              : val,
                        }));
                        setShowMissing(false);
                      }}
                      className={`relative min-h-12 min-w-12 rounded-[6px] border-[1.5px] px-4 text-[15px] font-semibold transition-colors ${
                        on
                          ? "border-gps-blue bg-gps-blue text-white"
                          : "border-line hover:border-ink bg-white"
                      } ${st !== "ok" ? "text-ink-mute decoration-gps-red line-through decoration-2" : ""} ${on && st !== "ok" ? "text-white/80" : ""}`}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <p
            role="status"
            className={`mt-5 flex items-start gap-2 rounded-[6px] px-3 py-2.5 text-[15px] font-semibold ${
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
              {variant ? (
                <span className="block text-[13px] font-normal opacity-80">
                  Réf. {variant.sku}
                </span>
              ) : null}
            </span>
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <div
              className="border-line flex items-center rounded-[6px] border-[1.5px] bg-white"
              role="group"
              aria-label="Quantité"
            >
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center disabled:opacity-40"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Diminuer la quantité"
              >
                <IconMinus />
              </button>
              <output
                className="tabular w-8 text-center text-lg font-bold"
                aria-live="polite"
              >
                {qty}
              </output>
              <button
                type="button"
                className="inline-flex h-12 w-12 items-center justify-center disabled:opacity-40"
                onClick={() =>
                  setQty((q) => Math.min(Math.max(1, maxQty), q + 1))
                }
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
              ? "Option épuisée : choisissez une autre option ou demandez à GPS."
              : missing.length
                ? `Sélection manquante : ${missing.join(", ").toLowerCase()}.`
                : "L'ajout au panier ne réserve pas l'article."}
          </p>

          {added ? (
            <div
              ref={confirmRef}
              tabIndex={-1}
              role="status"
              className="animate-rise border-wa bg-wa-soft mt-4 rounded-[6px] border-[1.5px] p-4 outline-none"
            >
              <p className="text-wa-ink flex items-center gap-2 font-bold">
                <IconCheck /> Ajouté au panier
              </p>
              <p className="text-ink-soft mt-1 text-[14px]">
                {product.name}
                {variant
                  ? ` — ${optionsLabel(variant.options, axes)}`
                  : ""} · {added.quantity} au total dans le panier
                {added.capped ? " (limité au stock disponible)" : ""}.
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

          <div className="border-line mt-6 border-t pt-5">
            {question ? (
              <a
                href={question}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline border-wa text-wa-ink hover:bg-wa-soft w-full"
              >
                <IconWhatsApp /> Poser une question sur WhatsApp
              </a>
            ) : (
              <div className="border-line text-ink-soft rounded-[6px] border border-dashed p-3 text-[14px]">
                <p className="text-ink flex items-center gap-2 font-bold">
                  <IconWhatsApp className="text-wa" /> Question sur WhatsApp
                </p>
                <p className="mt-1">
                  Disponible dès que le numéro WhatsApp de GPS sera renseigné
                  (mode démonstration).
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Sheet
        open={zoom}
        onClose={() => setZoom(false)}
        title={product.name}
        side="center"
        wide
      >
        {current ? (
          <div
            className="relative"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight")
                setActive((a) => (a + 1) % images.length);
              if (e.key === "ArrowLeft")
                setActive((a) => (a - 1 + images.length) % images.length);
            }}
          >
            <Image
              src={current.url}
              alt={current.alt}
              width={1200}
              height={1500}
              sizes="90vw"
              unoptimized={current.url.endsWith(".svg")}
              className="mx-auto max-h-[72dvh] w-auto object-contain"
            />
            {images.length > 1 ? (
              <div className="mt-3 flex items-center justify-center gap-3">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() =>
                    setActive((a) => (a - 1 + images.length) % images.length)
                  }
                  aria-label="Photo précédente"
                >
                  <IconChevronLeft />
                </button>
                <span className="tabular text-[14px]">
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
            <p className="text-ink-mute mt-2 text-center text-[14px]">
              {current.alt}
            </p>
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
      className="text-gps-blue inline-flex min-h-11 items-center gap-1 text-[15px] font-bold hover:underline"
    >
      <IconChevronLeft size={18} /> Retour aux résultats
    </Link>
  );
}
