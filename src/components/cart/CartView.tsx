"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registerRequest, verifyCart } from "@/app/(site)/panier/actions";
import type { CheckedItem } from "@/server/domain/cart";
import type { DeliveryZone } from "@/server/domain/settings";
import { fcfa } from "@/lib/format";
import { TO_CONFIRM, buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import { cart, cartCount, useCart, useCartReady, type CartItem } from "./cart-store";
import {
  IconAlert,
  IconArrowRight,
  IconBag,
  IconCheck,
  IconCopy,
  IconInfo,
  IconMinus,
  IconPlus,
  IconStore,
  IconTrash,
  IconTruck,
  IconWhatsApp,
} from "../ui/icons";

interface Reception {
  pickupEnabled: boolean;
  pickupDetails: string;
  deliveryEnabled: boolean;
  deliveryDetails: string;
  zones: DeliveryZone[];
}

export interface PickupStore {
  id: string;
  name: string;
  place: string;
  hours: string;
  mapsUrl: string;
}

interface Form {
  reception: "pickup" | "delivery" | "";
  store: string;
  zone: string;
  address: string;
  name: string;
  phone: string;
  note: string;
}

const FORM_KEY = "gps-commande-v1";
/** Coordonnées et réception, gardées sur cet appareil pour la commande suivante. */
const CLIENT_KEY = "gps-client-v1";
const CLIENT_FIELDS = ["reception", "store", "zone", "address", "name", "phone"] as const;
const emptyForm: Form = {
  reception: "",
  store: "",
  zone: "",
  address: "",
  name: "",
  phone: "",
  note: "",
};

type Notice = {
  variantId: string;
  name: string;
  text: string;
  tone: "info" | "error";
};

function describeIssues(items: CheckedItem[]): Notice[] {
  const out: Notice[] = [];
  for (const i of items) {
    for (const issue of i.issues) {
      if (issue.kind === "price") {
        out.push({
          variantId: i.variantId,
          name: i.name,
          tone: "info",
          text: `Prix mis à jour : ${fcfa(issue.from)} → ${fcfa(issue.to)}.`,
        });
      } else if (issue.kind === "reduced") {
        out.push({
          variantId: i.variantId,
          name: i.name,
          tone: "info",
          text: `Quantité ramenée de ${issue.requested} à ${issue.available}, la quantité disponible.`,
        });
      } else {
        out.push({
          variantId: i.variantId,
          name: i.name,
          tone: "error",
          text: "N'est plus disponible : retirez-le pour continuer.",
        });
      }
    }
  }
  return out;
}

export function CartView({
  whatsapp,
  reception,
  stores = [],
}: {
  whatsapp: string;
  reception: Reception;
  stores?: PickupStore[];
}) {
  const items = useCart();
  const ready = useCartReady();
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ item: CartItem; index: number } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Saisie conservée le temps de la session, sur cet appareil uniquement.
  // (Le formulaire n'est rendu qu'après lecture du panier côté navigateur.)
  const [form, setForm] = useState<Form>(() => {
    const only = [reception.pickupEnabled && "pickup", reception.deliveryEnabled && "delivery"].filter(Boolean);
    let next: Form = {
      ...emptyForm,
      reception: only.length === 1 ? (only[0] as Form["reception"]) : "",
      store: stores.length === 1 ? stores[0].id : "",
    };
    try {
      const client = typeof window !== "undefined" ? localStorage.getItem(CLIENT_KEY) : null;
      if (client) next = { ...next, ...pickClient(JSON.parse(client)) };
      const saved = typeof window !== "undefined" ? sessionStorage.getItem(FORM_KEY) : null;
      if (saved) next = { ...next, ...JSON.parse(saved) };
    } catch {}
    // Un choix enregistré qui n'existe plus (point de vente, zone, mode fermé) est ignoré.
    if (next.reception && !only.includes(next.reception)) next.reception = "";
    if (next.store && !stores.some((st) => st.id === next.store)) next.store = "";
    if (next.zone && !reception.zones.some((z) => z.name === next.zone)) next.zone = "";
    return next;
  });
  const [remembered, setRemembered] = useState(() => {
    try {
      return typeof window !== "undefined" && !!localStorage.getItem(CLIENT_KEY);
    } catch {
      return false;
    }
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [prepared, setPrepared] = useState<{
    text: string;
    key: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const recapRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const o: ("pickup" | "delivery")[] = [];
    if (reception.pickupEnabled) o.push("pickup");
    if (reception.deliveryEnabled) o.push("delivery");
    return o;
  }, [reception]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch {}
  }, [form]);

  const forget = () => {
    try {
      localStorage.removeItem(CLIENT_KEY);
    } catch {}
    setRemembered(false);
    setForm({ ...form, address: "", name: "", phone: "" });
  };

  /** Revérifie le panier côté serveur et applique les changements (en les expliquant). */
  const verify = useCallback(async (current: CartItem[]) => {
    if (!current.length) return { ok: true, changed: false, blocked: false };
    setChecking(true);
    setCheckError(null);
    const res = await verifyCart(
      current.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        seenPrice: i.unitPrice,
      })),
    );
    setChecking(false);
    if (!res.ok) {
      setCheckError(res.error);
      return { ok: false, changed: false, blocked: true };
    }
    const issues = describeIssues(res.items);
    const out = new Set(
      res.items.filter((i) => i.issues.some((x) => x.kind === "unavailable")).map((i) => i.variantId),
    );
    setUnavailable(out);
    const changed = res.items.some((i) => i.issues.some((x) => x.kind !== "unavailable"));
    if (changed) {
      cart.replace(
        current.map((c) => {
          const v = res.items.find((i) => i.variantId === c.variantId);
          return v && !out.has(c.variantId)
            ? {
                ...c,
                unitPrice: v.unitPrice,
                quantity: v.quantity,
                name: v.name,
                sku: v.sku,
                optionsLabel: v.optionsLabel,
              }
            : c;
        }),
      );
    }
    if (issues.length) setNotices(issues);
    return { ok: true, changed, blocked: out.size > 0 };
  }, []);

  const verifiedOnce = useRef(false);
  /** Dernière demande enregistrée : remplacée si le client modifie puis prépare à nouveau. */
  const lastRequest = useRef<string | null>(null);
  useEffect(() => {
    if (ready && !verifiedOnce.current && items.length) {
      verifiedOnce.current = true;
      void verify(items);
    }
  }, [ready, items, verify]);

  // Le récapitulatif n'est valable que pour le panier et la saisie qui l'ont produit.
  const inputKey = JSON.stringify([items, form]);
  const message = prepared && prepared.key === inputKey ? prepared.text : null;
  const setMessage = (text: string | null) => setPrepared(text === null ? null : { text, key: inputKey });

  const remove = (variantId: string) => {
    const r = cart.remove(variantId);
    if (!r) return;
    setUndo(r);
    setNotices((n) => n.filter((x) => x.variantId !== variantId));
    setUnavailable((s) => {
      const next = new Set(s);
      next.delete(variantId);
      return next;
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };

  const subtotal = items.filter((i) => !unavailable.has(i.variantId)).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const zone = reception.zones.find((z) => z.name === form.zone);
  const deliveryFee: number | null = form.reception === "delivery" ? (zone ? zone.fee : null) : 0;

  const validate = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.reception) e.reception = "Choisissez un mode de réception.";
    if (form.reception === "pickup" && stores.length && !stores.some((st) => st.id === form.store))
      e.store = "Choisissez le point de vente où retirer votre commande.";
    if (!form.name.trim()) e.name = "Indiquez votre nom pour que GPS puisse identifier la commande.";
    if (form.reception === "delivery") {
      if (reception.zones.length && !form.zone) e.zone = "Choisissez votre zone de livraison.";
      if (!form.address.trim()) e.address = "Indiquez l'adresse ou le point de repère de livraison.";
    }
    if (form.phone && form.phone.replace(/\D/g, "").length < 6) e.phone = "Numéro trop court.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const prepare = async () => {
    setMessage(null);
    if (!validate()) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const res = await verify(items);
    if (!res.ok || res.blocked) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (res.changed) {
      // Les changements sont affichés : le client relit puis relance la préparation.
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const req = await registerRequest({
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, seenPrice: i.unitPrice })),
      name: form.name.trim(),
      phone: form.phone.trim(),
      reception: form.reception as "pickup" | "delivery",
      zone: form.zone,
      address: form.address.trim(),
      deliveryFee,
      note: form.note.trim(),
      replacesId: lastRequest.current ?? undefined,
      storeId: form.reception === "pickup" ? form.store || null : null,
    }).catch(() => ({ ok: false as const }));
    if (req.ok) lastRequest.current = req.id;
    const msg = buildOrderMessage({
      reference: req.ok ? req.reference : undefined,
      lines: items.map((i) => ({
        sku: i.sku,
        name: i.name,
        optionsLabel: i.optionsLabel,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      reception: form.reception as "pickup" | "delivery",
      pickupDetails: (() => {
        const st = stores.find((x) => x.id === form.store);
        return st
          ? [`${st.name} — ${st.place}`, st.mapsUrl && `Itinéraire : ${st.mapsUrl}`].filter(Boolean).join(" · ")
          : reception.pickupDetails;
      })(),
      zone: form.zone || undefined,
      deliveryFee,
      address: form.address.trim() || undefined,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      note: form.note.trim() || undefined,
    });
    setMessage(msg);
    setCopied(false);
    try {
      localStorage.setItem(CLIENT_KEY, JSON.stringify(pickClient(form)));
      setRemembered(true);
    } catch {}
    requestAnimationFrame(() => recapRef.current?.focus());
  };

  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      const ta = document.getElementById("recap-message") as HTMLTextAreaElement | null;
      ta?.select();
      setCopied(document.execCommand?.("copy") ?? false);
    }
  };

  const hasItems = items.length > 0;
  const formRef = useRef<HTMLElement>(null);
  const [formVisible, setFormVisible] = useState(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), {
      rootMargin: "0px 0px -35% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, hasItems]);

  // Arrivée par « Commander » depuis une fiche : directement aux informations de réception.
  const jumped = useRef(false);
  useEffect(() => {
    if (!ready || !hasItems || jumped.current || window.location.hash !== "#commande") return;
    jumped.current = true;
    const target = !form.reception
      ? "input[name='reception']"
      : form.reception === "pickup" && stores.length > 1 && !form.store
        ? "input[name='store']"
        : !form.name.trim()
          ? "#c-nom"
          : "button[type='submit']";
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ block: "start" });
      formRef.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
    });
  }, [ready, hasItems, form, stores.length]);

  if (!ready) {
    return (
      <div className="mt-8 grid gap-3" aria-busy="true" aria-label="Chargement du panier">
        <div className="skeleton h-12 w-2/3" />
        <div className="skeleton h-32 rounded-[14px]" />
        <div className="skeleton h-32 rounded-[14px]" />
      </div>
    );
  }

  if (!hasItems) {
    return (
      <div className="mt-6">
        <CartTitle count={0} />
        {undo ? <UndoBar undo={undo} onUndo={() => (cart.restore(undo.item, undo.index), setUndo(null))} /> : null}
        <div className="animate-rise relative mt-6 overflow-hidden rounded-[20px] bg-gps-blue-night px-6 py-14 text-center text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gps-red/25 blur-3xl" />
          <span className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
            <IconBag size={36} />
          </span>
          <p className="relative mt-5 font-display text-4xl font-extrabold uppercase">Votre panier est vide</p>
          <p className="relative mx-auto mt-3 max-w-sm text-white/75">
            Ajoutez des articles depuis la boutique. Le panier reste enregistré sur cet appareil.
          </p>
          <Link href="/boutique" className="btn btn-primary relative mt-7">
            Découvrir la boutique <IconArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  const waUrl = message ? whatsappLink(whatsapp, message) : null;
  const errorList = Object.values(errors).filter(Boolean);
  const count = cartCount(items);
  const step = message ? 3 : form.reception ? 2 : 1;
  const total = deliveryFee !== null ? subtotal + deliveryFee : subtotal;

  return (
    <div className="mt-6 pb-24 lg:pb-0">
      <CartTitle count={count} />
      <Steps current={step} done={!!message} />

      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <section className="lg:col-span-7" aria-labelledby="titre-articles">
          <h2 id="titre-articles" className="sr-only">
            Articles
          </h2>
          {undo ? <UndoBar undo={undo} onUndo={() => (cart.restore(undo.item, undo.index), setUndo(null))} /> : null}

          <div ref={errorRef} tabIndex={-1} className="outline-none">
            {checkError ? (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-gps-red-soft p-4 text-gps-red-ink"
              >
                <p className="flex items-center gap-2 font-semibold">
                  <IconAlert /> {checkError}
                </p>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => verify(items)}>
                  Réessayer
                </button>
              </div>
            ) : null}
            {notices.length ? (
              <div role="status" className="mb-4 rounded-[14px] border-[1.5px] border-warn/40 bg-warn-soft p-4">
                <p className="flex items-center gap-2 font-bold text-warn">
                  <IconInfo /> Votre panier a été mis à jour
                </p>
                <ul className="mt-2 space-y-1 text-[15px]">
                  {notices.map((n, i) => (
                    <li key={i}>
                      <strong>{n.name}</strong> —{" "}
                      <span className={n.tone === "error" ? "font-semibold text-gps-red-ink" : ""}>{n.text}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {unavailable.size ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => [...unavailable].forEach(remove)}
                    >
                      Retirer les articles indisponibles
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotices([])}>
                    J&apos;ai compris
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <ul className="grid gap-3">
            {items.map((i, idx) => {
              const out = unavailable.has(i.variantId);
              return (
                <li
                  key={i.variantId}
                  className={`cart-line grid grid-cols-[84px_1fr] gap-4 rounded-[16px] border border-line-soft bg-card p-3 shadow-[0_1px_0_rgb(18_19_24/0.04)] sm:grid-cols-[110px_1fr] ${out ? "opacity-70" : ""}`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <Link
                    href={`/produits/${i.slug}`}
                    className="block overflow-hidden rounded-[12px] bg-paper-deep"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {i.image ? (
                      <Image
                        src={i.image}
                        alt=""
                        width={224}
                        height={280}
                        unoptimized={i.image.endsWith(".svg")}
                        className="aspect-[4/5] h-full w-full object-cover"
                      />
                    ) : null}
                  </Link>
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/produits/${i.slug}`} className="leading-tight font-bold hover:underline">
                          {i.name}
                        </Link>
                        {i.optionsLabel ? (
                          <p className="mt-1 flex flex-wrap gap-1">
                            {i.optionsLabel.split(" · ").map((o) => (
                              <span
                                key={o}
                                className="rounded-full bg-paper-deep px-2 py-0.5 text-[12px] font-semibold text-ink-soft"
                              >
                                {o.replace(/^[^:]+ : /, "")}
                              </span>
                            ))}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="-mt-1 -mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-mute transition-colors hover:bg-gps-red-soft hover:text-gps-red-ink"
                        onClick={() => remove(i.variantId)}
                        aria-label={`Retirer ${i.name} du panier`}
                      >
                        <IconTrash size={18} />
                      </button>
                    </div>
                    {out ? (
                      <p className="text-[14px] font-bold text-gps-red-ink">
                        Indisponible — non inclus dans la commande.
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-end justify-between gap-3">
                      <div
                        className="flex items-center rounded-full bg-paper-deep p-1"
                        role="group"
                        aria-label={`Quantité pour ${i.name}`}
                      >
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm transition-transform active:scale-90 disabled:opacity-40"
                          disabled={i.quantity <= 1 || out}
                          onClick={() => cart.setQuantity(i.variantId, i.quantity - 1)}
                          aria-label="Diminuer"
                        >
                          <IconMinus size={16} />
                        </button>
                        <output className="w-9 text-center font-extrabold tabular" aria-live="polite">
                          {i.quantity}
                        </output>
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm transition-transform active:scale-90 disabled:opacity-40"
                          disabled={out || i.quantity >= 99}
                          onClick={() => cart.setQuantity(i.variantId, i.quantity + 1)}
                          aria-label="Augmenter"
                        >
                          <IconPlus size={16} />
                        </button>
                      </div>
                      <p className="text-right font-display text-xl leading-none font-extrabold tabular">
                        {fcfa(i.unitPrice * i.quantity)}
                        {i.quantity > 1 ? (
                          <span className="mt-1 block font-sans text-[12px] font-semibold text-ink-mute">
                            {fcfa(i.unitPrice)} l&apos;unité
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <ul className="mt-5 grid grid-cols-3 gap-2 text-center text-[12px] leading-tight font-semibold text-ink-soft sm:text-[13px]">
            <li className="flex flex-col items-center gap-1.5 rounded-[12px] bg-gps-blue-soft/60 px-2 py-3">
              <IconCheck size={18} className="text-gps-blue" /> Aucun paiement en ligne
            </li>
            <li className="flex flex-col items-center gap-1.5 rounded-[12px] bg-gps-blue-soft/60 px-2 py-3">
              <IconWhatsApp className="text-wa" /> Confirmé sur WhatsApp
            </li>
            <li className="flex flex-col items-center gap-1.5 rounded-[12px] bg-gps-blue-soft/60 px-2 py-3">
              <IconStore size={18} className="text-gps-blue" /> Retrait ou livraison
            </li>
          </ul>
          <p className="hint mt-3">
            {count} article{count > 1 ? "s" : ""} · panier conservé sur cet appareil. Les quantités seront vérifiées par
            GPS ; le panier ne réserve rien.
          </p>
        </section>

        <section ref={formRef} id="commande" className="scroll-mt-24 lg:col-span-5" aria-labelledby="titre-preparer">
          <div className="overflow-hidden rounded-[20px] border border-line-soft bg-card shadow-[0_18px_40px_-28px_rgb(20_16_57/0.45)] lg:sticky lg:top-28">
            <div className="bg-gps-blue-night px-5 py-4 text-white md:px-6">
              <h2 id="titre-preparer" className="font-display text-3xl font-extrabold uppercase">
                Préparer la commande
              </h2>
              <p className="text-[14px] text-white/70">Deux minutes, puis vous envoyez tout sur WhatsApp.</p>
            </div>

            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void prepare();
              }}
              className="grid gap-6 p-5 md:p-6"
            >
              {errorList.length ? (
                <div
                  role="alert"
                  className="rounded-[12px] bg-gps-red-soft p-3 text-[14px] font-semibold text-gps-red-ink"
                >
                  {errorList.length === 1
                    ? errorList[0]
                    : `${errorList.length} informations manquent : voir ci-dessous.`}
                </div>
              ) : null}

              <fieldset>
                <legend className="mb-3 flex items-center gap-2 font-bold">
                  <span className="step-dot">1</span> Réception
                </legend>
                {options.length === 0 ? (
                  <p className="text-[15px] text-ink-soft">Modes de réception : {TO_CONFIRM.toLowerCase()}.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {options.map((o) => {
                      const on = form.reception === o;
                      return (
                        <label key={o} className={`reception-tile ${on ? "is-on" : ""}`}>
                          <input
                            type="radio"
                            name="reception"
                            value={o}
                            checked={on}
                            onChange={() => setForm({ ...form, reception: o })}
                            className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded-[14px] opacity-0"
                          />
                          <span className="reception-check" aria-hidden="true">
                            <IconCheck size={14} />
                          </span>
                          {o === "pickup" ? <IconStore size={26} /> : <IconTruck size={26} />}
                          <span className="mt-2 block leading-tight font-bold">
                            {o === "pickup" ? "Retrait en boutique" : "Livraison"}
                          </span>
                          <span className="block text-[12px] text-ink-mute">
                            {o === "pickup" ? "Au comptoir GPS" : "Selon votre zone"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.reception ? <p className="error-text">{errors.reception}</p> : null}
                {form.reception === "pickup" && stores.length ? (
                  <fieldset className="mt-3 grid gap-2" aria-describedby={errors.store ? "err-store" : undefined}>
                    <legend className="label">Point de retrait *</legend>
                    {stores.map((st) => (
                      <label
                        key={st.id}
                        className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-[10px] border-[1.5px] p-3 ${form.store === st.id ? "border-gps-blue bg-gps-blue-soft" : "border-line bg-white"}`}
                      >
                        <input
                          type="radio"
                          name="store"
                          className="mt-1"
                          checked={form.store === st.id}
                          onChange={() => setForm({ ...form, store: st.id })}
                        />
                        <span className="min-w-0">
                          <span className="block font-bold">{st.name}</span>
                          <span className="block text-[14px] text-ink-soft">
                            {st.place} · {st.hours}
                          </span>
                          {st.mapsUrl ? (
                            <a
                              href={st.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[14px] font-semibold text-gps-blue underline"
                            >
                              Itinéraire
                            </a>
                          ) : null}
                        </span>
                      </label>
                    ))}
                    {errors.store ? (
                      <p id="err-store" className="error-text">
                        {errors.store}
                      </p>
                    ) : null}
                  </fieldset>
                ) : form.reception === "pickup" && reception.pickupDetails ? (
                  <p className="hint">{reception.pickupDetails}</p>
                ) : null}
                {form.reception === "delivery" && reception.deliveryDetails ? (
                  <p className="hint">{reception.deliveryDetails}</p>
                ) : null}
              </fieldset>

              {form.reception === "delivery" && reception.zones.length ? (
                <fieldset className="animate-rise">
                  <legend className="label">Zone de livraison</legend>
                  <div className="grid gap-2" aria-invalid={!!errors.zone}>
                    {reception.zones.map((z) => {
                      const on = form.zone === z.name;
                      return (
                        <label key={z.name} className={`zone-row ${on ? "is-on" : ""}`}>
                          <input
                            type="radio"
                            name="zone"
                            value={z.name}
                            checked={on}
                            onChange={() => setForm({ ...form, zone: z.name })}
                            className="h-4 w-4 accent-[#31277f]"
                          />
                          <span className="flex-1 text-[14px] font-semibold">{z.name}</span>
                          <span className="text-[14px] font-extrabold tabular">
                            {z.fee === null ? TO_CONFIRM : fcfa(z.fee)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {errors.zone ? <p className="error-text">{errors.zone}</p> : null}
                </fieldset>
              ) : null}
              {form.reception === "delivery" ? (
                <div className="animate-rise">
                  <label className="label" htmlFor="c-adresse">
                    Adresse ou point de repère
                  </label>
                  <textarea
                    id="c-adresse"
                    className="field"
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    aria-invalid={!!errors.address}
                    autoComplete="street-address"
                    placeholder="Quartier, rue, repère connu…"
                  />
                  {errors.address ? <p className="error-text">{errors.address}</p> : null}
                </div>
              ) : null}

              <fieldset className="grid gap-4">
                <legend className="mb-3 flex items-center gap-2 font-bold">
                  <span className="step-dot">2</span> Vos coordonnées
                </legend>
                {remembered ? (
                  <p className="-mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-mute">
                    Retrouvées de votre dernière commande, sur cet appareil uniquement.
                    <button type="button" className="font-semibold text-gps-blue underline" onClick={forget}>
                      Effacer
                    </button>
                  </p>
                ) : null}
                <div>
                  <label className="label" htmlFor="c-nom">
                    Votre nom
                  </label>
                  <input
                    id="c-nom"
                    className="field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    aria-invalid={!!errors.name}
                    autoComplete="name"
                  />
                  {errors.name ? <p className="error-text">{errors.name}</p> : null}
                </div>
                <div>
                  <label className="label" htmlFor="c-tel">
                    Téléphone <span className="font-normal text-ink-mute">(facultatif)</span>
                  </label>
                  <input
                    id="c-tel"
                    className="field"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    aria-invalid={!!errors.phone}
                    autoComplete="tel"
                  />
                  <p className="hint">Seulement s&apos;il diffère de votre numéro WhatsApp.</p>
                  {errors.phone ? <p className="error-text">{errors.phone}</p> : null}
                </div>
                <div>
                  <label className="label" htmlFor="c-note">
                    Précision <span className="font-normal text-ink-mute">(facultatif)</span>
                  </label>
                  <input
                    id="c-note"
                    className="field"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    maxLength={200}
                  />
                </div>
              </fieldset>

              <dl className="grid gap-2 rounded-[14px] bg-paper p-4 text-[15px]">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Total des produits</dt>
                  <dd className="font-bold tabular">{fcfa(subtotal)}</dd>
                </div>
                {form.reception === "delivery" ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">Frais de livraison</dt>
                    <dd className="text-right font-semibold tabular">
                      {deliveryFee === null ? TO_CONFIRM : fcfa(deliveryFee)}
                    </dd>
                  </div>
                ) : null}
                <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3">
                  <dt className="font-bold">Total</dt>
                  <dd className="font-display text-3xl leading-none font-extrabold tabular">
                    {fcfa(total)}
                    {deliveryFee === null ? (
                      <span className="block text-right font-sans text-[12px] font-semibold text-ink-mute">
                        + livraison à confirmer
                      </span>
                    ) : null}
                  </dd>
                </div>
              </dl>

              <button type="submit" className="btn btn-ink h-14 w-full text-base" disabled={checking}>
                {checking ? "Vérification des prix et du stock…" : "Préparer mon récapitulatif"}
              </button>
            </form>

            {message ? (
              <div
                ref={recapRef}
                tabIndex={-1}
                className="animate-rise border-t border-line p-5 outline-none md:p-6"
                aria-labelledby="titre-recap"
              >
                <h3 id="titre-recap" className="flex items-center gap-2 text-lg font-extrabold">
                  <span className="step-dot" style={{ background: "var(--color-wa)" }}>
                    3
                  </span>{" "}
                  Récapitulatif prêt
                </h3>
                <div className="wa-chat mt-4 overflow-hidden rounded-[16px]">
                  <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-display text-sm font-extrabold text-gps-red">
                      GPS
                    </span>
                    <span>
                      <span className="block text-[15px] leading-tight font-bold">GPS — Global Public Services</span>
                      <span className="block text-[12px] text-white/75">Votre message, prêt à partir</span>
                    </span>
                  </div>
                  <div className="p-3">
                    <label htmlFor="recap-message" className="sr-only">
                      Message de commande
                    </label>
                    <textarea
                      id="recap-message"
                      readOnly
                      value={message}
                      rows={Math.min(26, message.split("\n").length + 1)}
                      className="wa-bubble"
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-wa h-14 w-full text-base"
                    >
                      <IconWhatsApp /> Envoyer ma commande sur WhatsApp
                    </a>
                  ) : (
                    <div className="rounded-[14px] border-[1.5px] border-dashed border-wa/50 bg-wa-soft p-3 text-[14px]">
                      <button type="button" disabled className="btn btn-wa h-14 w-full text-base">
                        <IconWhatsApp /> Envoyer ma commande sur WhatsApp
                      </button>
                      <p className="mt-2 text-wa-ink">
                        <strong>Numéro WhatsApp bientôt disponible :</strong> le numéro de GPS n&apos;est pas encore
                        renseigné. Copiez le récapitulatif pour le garder ; aucun numéro n&apos;est contacté.
                      </p>
                    </div>
                  )}
                  <button type="button" className="btn btn-outline w-full" onClick={copy}>
                    <IconCopy size={18} /> {copied ? "Récapitulatif copié" : "Copier le récapitulatif"}
                  </button>
                </div>
                <div className="mt-4 rounded-[14px] bg-gps-blue-soft p-4 text-[14px] leading-relaxed text-gps-blue-deep">
                  <p className="font-bold">Ce qui se passe ensuite</p>
                  <ol className="mt-2 grid gap-2">
                    {[
                      "WhatsApp s'ouvre avec ce message : envoyez-le vous-même.",
                      `GPS vérifie la disponibilité, confirme le total${form.reception === "delivery" ? " et les frais de livraison" : ""}.`,
                      "La commande n'est confirmée qu'après la réponse de GPS.",
                    ].map((t, n) => (
                      <li key={n} className="flex gap-2">
                        <span className="step-dot h-6 w-6 text-[12px]">{n + 1}</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-[13px]">
                    L&apos;ouverture de WhatsApp ne garantit ni l&apos;envoi du message, ni la confirmation de la
                    commande, ni la réservation des articles.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Barre de total collante sur mobile, masquée quand le formulaire est à l'écran */}
      <div className={`cart-bar lg:hidden ${formVisible || message ? "is-hidden" : ""}`} aria-hidden={formVisible}>
        <div>
          <p className="text-[12px] font-semibold text-ink-mute">
            {count} article{count > 1 ? "s" : ""}
          </p>
          <p className="font-display text-2xl leading-none font-extrabold tabular">{fcfa(subtotal)}</p>
        </div>
        <a href="#commande" className="btn btn-ink" tabIndex={formVisible ? -1 : undefined}>
          Commander <IconArrowRight size={18} />
        </a>
      </div>
    </div>
  );
}

function pickClient(src: Partial<Form>): Partial<Form> {
  const out: Partial<Form> = {};
  for (const k of CLIENT_FIELDS)
    if (typeof src?.[k] === "string") (out as Record<string, string>)[k] = src[k] as string;
  return out;
}

function CartTitle({ count }: { count: number }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-gps-red-ink">Commande WhatsApp</p>
        <h1 className="mt-2 font-display text-[52px] leading-[0.9] font-extrabold uppercase md:text-[80px]">
          Votre panier
        </h1>
      </div>
      {count ? (
        <span className="mb-1 inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-gps-red px-3 font-display text-xl font-extrabold text-white tabular">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function Steps({ current, done }: { current: number; done: boolean }) {
  const steps = ["Panier", "Réception", "WhatsApp"];
  return (
    <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Étapes de la commande">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current || (done && n === current) ? "done" : n === current ? "current" : "todo";
        return (
          <li
            key={label}
            className="steps-item"
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="steps-bar" />
            <span className="mt-2 flex items-center gap-1.5 text-[13px] font-bold">
              <span className="steps-num">{state === "done" ? <IconCheck size={12} /> : n}</span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function UndoBar({ undo, onUndo }: { undo: { item: CartItem }; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="animate-rise mb-4 flex items-center justify-between gap-3 rounded-[14px] bg-ink px-4 py-3 text-white"
    >
      <p className="text-[15px]">
        <strong>{undo.item.name}</strong> retiré du panier.
      </p>
      <button type="button" className="btn btn-sm bg-white text-ink hover:bg-paper" onClick={onUndo}>
        Annuler
      </button>
    </div>
  );
}
