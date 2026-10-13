"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { verifyCart } from "@/app/(site)/panier/actions";
import type { CheckedItem } from "@/server/domain/cart";
import type { DeliveryZone } from "@/server/domain/settings";
import { fcfa } from "@/lib/format";
import { TO_CONFIRM, buildOrderMessage, whatsappLink } from "@/lib/whatsapp";
import { cart, cartCount, useCart, useCartReady, type CartItem } from "./cart-store";
import {
  IconAlert,
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

interface Form {
  reception: "pickup" | "delivery" | "";
  zone: string;
  address: string;
  name: string;
  phone: string;
  note: string;
}

const FORM_KEY = "gps-commande-v1";
const emptyForm: Form = {
  reception: "",
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
          text: `Quantité ramenée de ${issue.requested} à ${issue.available}, le stock disponible.`,
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

export function CartView({ whatsapp, reception }: { whatsapp: string; reception: Reception }) {
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
    try {
      const saved = typeof window !== "undefined" ? sessionStorage.getItem(FORM_KEY) : null;
      if (saved) return { ...emptyForm, ...JSON.parse(saved) };
    } catch {}
    const only = [reception.pickupEnabled && "pickup", reception.deliveryEnabled && "delivery"].filter(Boolean);
    return {
      ...emptyForm,
      reception: only.length === 1 ? (only[0] as Form["reception"]) : "",
    };
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
    const msg = buildOrderMessage({
      lines: items.map((i) => ({
        sku: i.sku,
        name: i.name,
        optionsLabel: i.optionsLabel,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      reception: form.reception as "pickup" | "delivery",
      pickupDetails: reception.pickupDetails,
      zone: form.zone || undefined,
      deliveryFee,
      address: form.address.trim() || undefined,
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      note: form.note.trim() || undefined,
    });
    setMessage(msg);
    setCopied(false);
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

  if (!ready) {
    return (
      <div className="mt-8 grid gap-4" aria-busy="true" aria-label="Chargement du panier">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mt-8">
        {undo ? <UndoBar undo={undo} onUndo={() => (cart.restore(undo.item, undo.index), setUndo(null))} /> : null}
        <div className="rounded-[6px] border border-line bg-card px-6 py-14 text-center">
          <p className="font-display text-4xl font-bold uppercase">Votre panier est vide</p>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">
            Ajoutez des articles depuis la boutique. Le panier reste enregistré sur cet appareil.
          </p>
          <Link href="/boutique" className="btn btn-primary mt-6">
            Découvrir la boutique
          </Link>
        </div>
      </div>
    );
  }

  const waUrl = message ? whatsappLink(whatsapp, message) : null;
  const errorList = Object.values(errors).filter(Boolean);

  return (
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
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] bg-gps-red-soft p-4 text-gps-red-ink"
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
            <div role="status" className="mb-4 rounded-[6px] border-[1.5px] border-warn/40 bg-warn-soft p-4">
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

        <ul className="divide-y divide-line border-y border-line">
          {items.map((i) => {
            const out = unavailable.has(i.variantId);
            return (
              <li
                key={i.variantId}
                className={`grid grid-cols-[88px_1fr] gap-4 py-4 sm:grid-cols-[112px_1fr] ${out ? "opacity-70" : ""}`}
              >
                <Link
                  href={`/produits/${i.slug}`}
                  className="block overflow-hidden rounded-[4px] bg-paper-deep"
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
                      className="aspect-[4/5] w-full object-cover"
                    />
                  ) : null}
                </Link>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                    <div>
                      <Link href={`/produits/${i.slug}`} className="font-bold hover:underline">
                        {i.name}
                      </Link>
                      {i.optionsLabel ? <p className="text-[14px] text-ink-soft">{i.optionsLabel}</p> : null}
                      <p className="text-[13px] text-ink-mute">Réf. {i.sku}</p>
                    </div>
                    <p className="text-right font-extrabold tabular">
                      {fcfa(i.unitPrice * i.quantity)}
                      {i.quantity > 1 ? (
                        <span className="block text-[13px] font-semibold text-ink-mute">
                          {fcfa(i.unitPrice)} l&apos;unité
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {out ? (
                    <p className="text-[14px] font-bold text-gps-red-ink">
                      Indisponible — non inclus dans la commande.
                    </p>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <div
                      className="flex items-center rounded-[6px] border-[1.5px] border-line bg-white"
                      role="group"
                      aria-label={`Quantité pour ${i.name}`}
                    >
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                        disabled={i.quantity <= 1 || out}
                        onClick={() => cart.setQuantity(i.variantId, i.quantity - 1)}
                        aria-label="Diminuer"
                      >
                        <IconMinus size={18} />
                      </button>
                      <output className="w-8 text-center font-bold tabular" aria-live="polite">
                        {i.quantity}
                      </output>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center disabled:opacity-40"
                        disabled={out || i.quantity >= 99}
                        onClick={() => cart.setQuantity(i.variantId, i.quantity + 1)}
                        aria-label="Augmenter"
                      >
                        <IconPlus size={18} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-ink-soft"
                      onClick={() => remove(i.variantId)}
                      aria-label={`Retirer ${i.name} du panier`}
                    >
                      <IconTrash size={18} /> Retirer
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="hint mt-3">
          {cartCount(items)} article{cartCount(items) > 1 ? "s" : ""} · panier conservé sur cet appareil. Les quantités
          seront vérifiées par GPS ; le panier ne réserve rien.
        </p>
      </section>

      <section className="lg:col-span-5" aria-labelledby="titre-preparer">
        <div className="rounded-[6px] border border-line bg-card p-5 md:p-6 lg:sticky lg:top-28">
          <h2 id="titre-preparer" className="font-display text-3xl font-bold uppercase">
            Préparer la commande
          </h2>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void prepare();
            }}
            className="mt-5 grid gap-5"
          >
            {errorList.length ? (
              <div
                role="alert"
                className="rounded-[6px] bg-gps-red-soft p-3 text-[14px] font-semibold text-gps-red-ink"
              >
                {errorList.length === 1 ? errorList[0] : `${errorList.length} informations manquent : voir ci-dessous.`}
              </div>
            ) : null}

            <fieldset>
              <legend className="label">Réception</legend>
              {options.length === 0 ? (
                <p className="text-[15px] text-ink-soft">Modes de réception : {TO_CONFIRM.toLowerCase()}.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {options.map((o) => (
                    <label
                      key={o}
                      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[6px] border-[1.5px] px-3 ${form.reception === o ? "border-gps-blue bg-gps-blue-soft" : "border-line bg-white"}`}
                    >
                      <input
                        type="radio"
                        name="reception"
                        value={o}
                        checked={form.reception === o}
                        onChange={() => setForm({ ...form, reception: o })}
                        className="h-5 w-5 accent-[#31277f]"
                      />
                      {o === "pickup" ? <IconStore size={18} /> : <IconTruck size={18} />}
                      <span className="font-semibold">{o === "pickup" ? "Retrait en boutique" : "Livraison"}</span>
                    </label>
                  ))}
                </div>
              )}
              {errors.reception ? <p className="error-text">{errors.reception}</p> : null}
              {form.reception === "pickup" ? (
                <p className="hint">
                  {reception.pickupDetails || `Lieu et horaires de retrait : ${TO_CONFIRM.toLowerCase()}.`}
                </p>
              ) : null}
              {form.reception === "delivery" && reception.deliveryDetails ? (
                <p className="hint">{reception.deliveryDetails}</p>
              ) : null}
            </fieldset>

            {form.reception === "delivery" && reception.zones.length ? (
              <div>
                <label className="label" htmlFor="c-zone">
                  Zone de livraison
                </label>
                <select
                  id="c-zone"
                  className="field"
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  aria-invalid={!!errors.zone}
                >
                  <option value="">Choisir…</option>
                  {reception.zones.map((z) => (
                    <option key={z.name} value={z.name}>
                      {z.name} — {z.fee === null ? TO_CONFIRM : fcfa(z.fee)}
                    </option>
                  ))}
                </select>
                {errors.zone ? <p className="error-text">{errors.zone}</p> : null}
              </div>
            ) : null}
            {form.reception === "delivery" ? (
              <div>
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
                />
                {errors.address ? <p className="error-text">{errors.address}</p> : null}
              </div>
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

            <dl className="grid gap-2 border-t border-line pt-4 text-[15px]">
              <div className="flex justify-between">
                <dt>Total des produits</dt>
                <dd className="font-extrabold tabular">{fcfa(subtotal)}</dd>
              </div>
              {form.reception === "delivery" ? (
                <div className="flex justify-between gap-4">
                  <dt>Frais de livraison</dt>
                  <dd className="text-right font-semibold tabular">
                    {deliveryFee === null ? TO_CONFIRM : fcfa(deliveryFee)}
                  </dd>
                </div>
              ) : null}
              {form.reception === "delivery" && deliveryFee !== null ? (
                <div className="flex justify-between text-lg">
                  <dt className="font-bold">Total</dt>
                  <dd className="font-extrabold tabular">{fcfa(subtotal + deliveryFee)}</dd>
                </div>
              ) : null}
            </dl>

            <button type="submit" className="btn btn-ink w-full" disabled={checking}>
              {checking ? "Vérification des prix et du stock…" : "Préparer mon récapitulatif"}
            </button>
          </form>

          {message ? (
            <div
              ref={recapRef}
              tabIndex={-1}
              className="animate-rise mt-6 border-t border-line pt-6 outline-none"
              aria-labelledby="titre-recap"
            >
              <h3 id="titre-recap" className="flex items-center gap-2 text-lg font-extrabold">
                <IconCheck className="text-wa" /> Récapitulatif prêt
              </h3>
              <label htmlFor="recap-message" className="sr-only">
                Message de commande
              </label>
              <textarea
                id="recap-message"
                readOnly
                value={message}
                rows={Math.min(26, message.split("\n").length + 3)}
                className="field mt-3 font-mono text-[13px] leading-relaxed"
              />
              <div className="mt-3 grid gap-2">
                {waUrl ? (
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa w-full text-base">
                    <IconWhatsApp /> Envoyer ma commande sur WhatsApp
                  </a>
                ) : (
                  <div className="rounded-[6px] border-[1.5px] border-dashed border-wa/50 bg-wa-soft p-3 text-[14px]">
                    <button type="button" disabled className="btn btn-wa w-full text-base">
                      <IconWhatsApp /> Envoyer ma commande sur WhatsApp
                    </button>
                    <p className="mt-2 text-wa-ink">
                      <strong>Mode démonstration :</strong> le numéro WhatsApp de GPS n&apos;est pas encore renseigné.
                      Le message peut être prévisualisé et copié, mais aucun numéro n&apos;est contacté.
                    </p>
                  </div>
                )}
                <button type="button" className="btn btn-outline w-full" onClick={copy}>
                  <IconCopy size={18} /> {copied ? "Récapitulatif copié" : "Copier le récapitulatif"}
                </button>
              </div>
              <div className="mt-4 rounded-[6px] bg-gps-blue-soft p-3 text-[14px] leading-relaxed text-gps-blue-deep">
                <p className="font-bold">Ce qui se passe ensuite</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  <li>WhatsApp s&apos;ouvre avec ce message : envoyez-le vous-même.</li>
                  <li>
                    GPS vérifie la disponibilité, confirme le total
                    {form.reception === "delivery" ? " et les frais de livraison" : ""}.
                  </li>
                  <li>La commande n&apos;est confirmée qu&apos;après la réponse de GPS.</li>
                </ol>
                <p className="mt-2">
                  L&apos;ouverture de WhatsApp ne garantit ni l&apos;envoi du message, ni la confirmation de la
                  commande, ni la réservation des articles.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function UndoBar({ undo, onUndo }: { undo: { item: CartItem }; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="animate-rise mb-4 flex items-center justify-between gap-3 rounded-[6px] bg-ink px-4 py-3 text-white"
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
