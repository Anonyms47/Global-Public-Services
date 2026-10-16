"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  createOrderAction,
  customerSearchAction,
  phoneMatchesAction,
  quickSaleAction,
  sellableAction,
} from "@/app/comptoir/(app)/commandes/actions";
import type { DeliveryZone } from "@/server/domain/settings";
import { paymentMethods, type PaymentMethodKey } from "@/lib/payment-methods";
import { fcfa } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";
import {
  IconCheck,
  IconMinus,
  IconPlus,
  IconPrint,
  IconSearch,
  IconTrash,
  IconAlert,
  IconArrowLeft,
} from "../ui/icons";

type Catalog = Extract<Awaited<ReturnType<typeof sellableAction>>, { ok: true }>["data"];
type Product = Catalog[number];

interface Line {
  variantId: string;
  productId: string;
  name: string;
  label: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  catalogPrice: number;
  available: number;
}

interface Draft {
  key: string;
  lines: Line[];
  customerId: string | null;
  customerLabel: string;
  newCustomer: { name: string; phone: string; address: string };
  allowDuplicate: boolean;
  withCustomer: boolean;
  channel: "whatsapp" | "telephone" | "autre";
  reception: "pickup" | "delivery";
  address: string;
  zone: string;
  fee: string;
  feeUnknown: boolean;
  notes: string;
  payMethod: PaymentMethodKey;
  amount: string;
  /** Moyens supplémentaires (paiement mixte). */
  extraPays: { method: PaymentMethodKey; amount: string }[];
}

const newDraft = (): Draft => ({
  key: crypto.randomUUID(),
  lines: [],
  customerId: null,
  customerLabel: "",
  newCustomer: { name: "", phone: "", address: "" },
  allowDuplicate: false,
  withCustomer: false,
  channel: "whatsapp",
  reception: "pickup",
  address: "",
  zone: "",
  fee: "",
  feeUnknown: true,
  notes: "",
  payMethod: "cash",
  amount: "",
  extraPays: [],
});

const methods = paymentMethods;

const noop = () => () => {};

/** Le brouillon vit dans le navigateur : rendu après hydratation uniquement. */
export function OrderComposerClient(props: {
  mode: "order" | "sale";
  canEditPrice: boolean;
  zones: DeliveryZone[];
  /** Moyens de paiement activés dans la configuration. */
  enabledMethods?: PaymentMethodKey[];
}) {
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!ready) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]" aria-busy="true" aria-label="Chargement">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
    );
  }
  return <OrderComposer {...props} />;
}

function OrderComposer({
  mode,
  canEditPrice,
  zones,
  enabledMethods,
}: {
  mode: "order" | "sale";
  canEditPrice: boolean;
  zones: DeliveryZone[];
  enabledMethods?: PaymentMethodKey[];
}) {
  const storageKey = `gps-brouillon-${mode}`;
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
      if (saved) return { ...newDraft(), ...JSON.parse(saved) };
    } catch {}
    return newDraft();
  });
  const [restored] = useState(() => draft.lines.length > 0);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Product | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [tab, setTab] = useState<"articles" | "vente">("articles");
  const [review, setReview] = useState(false);
  const [done, setDone] = useState<{
    id: string;
    reference: string;
    change: number;
  } | null>(null);
  const [custQ, setCustQ] = useState("");
  const [custResults, setCustResults] = useState<{ id: string; name: string; phone: string; address: string }[]>([]);
  const [matches, setMatches] = useState<{ id: string; name: string; phone: string }[]>([]);
  const { run, pending, failure, fieldErrors, setFailure } = useAction();
  const searchRef = useRef<HTMLInputElement>(null);

  const load = () => {
    sellableAction()
      .then((r) => (r.ok ? setCatalog(r.data) : setCatalogError(r.error)))
      .catch(() => setCatalogError("Catalogue indisponible. Vérifiez la connexion."));
  };
  useEffect(load, []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {}
  }, [draft, storageKey]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setReview(false);
  };

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const norm = (x: string) =>
      x
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return catalog;
    return catalog.filter((p) => {
      const hay = norm([p.name, p.brand, p.category ?? "", ...p.variants.map((v) => `${v.sku} ${v.label}`)].join(" "));
      return terms.every((t) => hay.includes(t));
    });
  }, [catalog, q]);

  const inDraft = (variantId: string) => draft.lines.find((l) => l.variantId === variantId)?.quantity ?? 0;

  const addVariant = (p: Product, v: Product["variants"][number], qty: number) => {
    const room = v.available - inDraft(v.id);
    if (room <= 0) return;
    const n = Math.min(qty, room);
    setDraft((d) => {
      const exists = d.lines.find((l) => l.variantId === v.id);
      const lines = exists
        ? d.lines.map((l) => (l.variantId === v.id ? { ...l, quantity: l.quantity + n } : l))
        : [
            ...d.lines,
            {
              variantId: v.id,
              productId: p.id,
              name: p.name,
              label: v.label,
              sku: v.sku,
              quantity: n,
              unitPrice: v.price,
              catalogPrice: v.price,
              available: v.available,
            },
          ];
      return { ...d, lines };
    });
    setReview(false);
    setPicked(null);
    setPickQty(1);
    setQ("");
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const subtotal = draft.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const fee =
    mode === "order" && draft.reception === "delivery" && !draft.feeUnknown
      ? Math.max(0, Math.round(Number(draft.fee) || 0))
      : 0;
  const total = subtotal + fee;
  const extras = (draft.extraPays ?? []).map((p) => ({
    method: p.method,
    amount: Math.max(0, Math.round(Number(p.amount) || 0)),
  }));
  const extraTotal = extras.reduce((s, p) => s + p.amount, 0);
  const received =
    draft.amount === ""
      ? mode === "sale"
        ? Math.max(0, total - extraTotal)
        : 0
      : Math.max(0, Math.round(Number(draft.amount) || 0));
  // La monnaie ne se rend que sur les espèces (premier moyen).
  const change = mode === "sale" && draft.payMethod === "cash" ? Math.max(0, received + extraTotal - total) : 0;
  const firstPaid = Math.min(received, Math.max(0, total - extraTotal));
  const paid = Math.min(total, firstPaid + extraTotal);
  const needsCustomer = mode === "order" || draft.withCustomer;

  const checkPhone = async (phone: string) => {
    if (phone.replace(/\D/g, "").length < 6) return setMatches([]);
    const r = await phoneMatchesAction(phone).catch(() => null);
    setMatches(r?.ok ? r.data : []);
  };
  const searchCustomer = async (value: string) => {
    setCustQ(value);
    if (value.trim().length < 2) return setCustResults([]);
    const r = await customerSearchAction(value).catch(() => null);
    setCustResults(r?.ok ? r.data : []);
  };

  const problems: string[] = [];
  if (!draft.lines.length) problems.push("Ajoutez au moins un article.");
  if (needsCustomer && !draft.customerId && !draft.newCustomer.name.trim()) problems.push("Indiquez le client.");
  if (needsCustomer && !draft.customerId && matches.length && !draft.allowDuplicate)
    problems.push("Ce numéro correspond à un client existant : choisissez-le ou confirmez la création.");
  if (mode === "order" && draft.reception === "delivery" && !draft.address.trim())
    problems.push("Indiquez l'adresse de livraison.");

  const submit = () => {
    const payload = {
      idempotencyKey: draft.key,
      channel: mode === "sale" ? "boutique" : draft.channel,
      reception: mode === "sale" ? "immediate" : draft.reception,
      customerId: needsCustomer ? draft.customerId : null,
      newCustomer:
        needsCustomer && !draft.customerId && draft.newCustomer.name.trim()
          ? { ...draft.newCustomer, allowDuplicate: draft.allowDuplicate }
          : null,
      deliveryAddress: draft.address,
      deliveryZone: draft.zone,
      deliveryFee: mode === "order" && draft.reception === "delivery" ? (draft.feeUnknown ? null : fee) : null,
      notes: draft.notes,
      lines: draft.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        unitPrice: canEditPrice && l.unitPrice !== l.catalogPrice ? l.unitPrice : undefined,
      })),
      payment:
        firstPaid > 0
          ? {
              method: draft.payMethod,
              amount: firstPaid,
              note: change ? `Reçu ${fcfa(received)}, rendu ${fcfa(change)}` : extras.length ? "Paiement mixte" : "",
            }
          : null,
      payments: extras.filter((p) => p.amount > 0).map((p) => ({ ...p, note: "Paiement mixte" })),
    };
    run(() => (mode === "sale" ? quickSaleAction(payload) : createOrderAction(payload)), {
      refresh: false,
      onSuccess: (res) => {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
        if (mode === "order") {
          router.push(`/comptoir/commandes/${res.id}`);
          return;
        }
        setDone({ id: res.id, reference: res.reference, change });
        setDraft(newDraft());
        setReview(false);
        load();
      },
    });
  };

  if (done) {
    return (
      <div
        className="mx-auto max-w-xl rounded-[6px] border-[1.5px] border-wa bg-card p-6 text-center md:p-10"
        role="status"
      >
        <IconCheck className="mx-auto text-wa" size={40} />
        <h2 className="mt-3 font-display text-4xl font-bold uppercase">Vente enregistrée</h2>
        <p className="mt-2 text-ink-soft">
          {done.reference} · stock mis à jour.
          {done.change > 0 ? (
            <>
              {" "}
              Monnaie à rendre : <strong>{fcfa(done.change)}</strong>.
            </>
          ) : null}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/comptoir/recus/${done.id}`} className="btn btn-ink">
            <IconPrint size={18} /> Reçu (imprimer ou télécharger)
          </Link>
          <button type="button" className="btn btn-primary" onClick={() => setDone(null)} autoFocus>
            <IconPlus size={18} /> Nouvelle vente
          </button>
        </div>
        <Link
          href={`/comptoir/commandes/${done.id}`}
          className="mt-4 inline-block text-[14px] font-semibold text-gps-blue hover:underline"
        >
          Ouvrir la fiche de la vente
        </Link>
      </div>
    );
  }

  const catalogPane = (
    <section aria-labelledby="titre-articles" className={`${tab === "articles" ? "" : "hidden"} lg:block`}>
      <h2 id="titre-articles" className="mb-3 text-[15px] font-extrabold tracking-wide uppercase">
        1. Articles
      </h2>
      <div className="relative">
        <label htmlFor="pos-search" className="sr-only">
          Rechercher un article
        </label>
        <IconSearch className="pointer-events-none absolute top-3.5 left-3 text-ink-mute" size={20} />
        <input
          ref={searchRef}
          id="pos-search"
          className="field pl-10"
          placeholder="Nom, marque ou référence…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPicked(null);
          }}
          autoComplete="off"
        />
      </div>
      {catalogError ? (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-2 rounded-[6px] bg-gps-red-soft p-3 text-gps-red-ink"
        >
          {catalogError}
          <button type="button" className="btn btn-danger btn-sm" onClick={load}>
            Réessayer
          </button>
        </div>
      ) : null}
      {!catalog && !catalogError ? (
        <div className="mt-3 grid gap-2" aria-busy="true" aria-label="Chargement du catalogue">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : null}

      {picked ? (
        <div className="mt-3 rounded-[6px] border-[1.5px] border-gps-blue bg-card p-4">
          <button
            type="button"
            className="mb-2 inline-flex min-h-9 items-center gap-1 text-[14px] font-bold text-gps-blue"
            onClick={() => setPicked(null)}
          >
            <IconArrowLeft size={16} /> Autres articles
          </button>
          <p className="font-bold">{picked.name}</p>
          <p className="mb-3 text-[13px] text-ink-mute">2. Choisissez la variante</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {picked.variants.map((v) => {
              const room = v.available - inDraft(v.id);
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    disabled={room <= 0}
                    onClick={() => addVariant(picked, v, pickQty)}
                    className="flex min-h-14 w-full items-center justify-between gap-2 rounded-[6px] border-[1.5px] border-line bg-white px-3 py-2 text-left hover:border-gps-blue disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-semibold">{v.label || "Article unique"}</span>
                      <span className="text-[12px] text-ink-mute">
                        {v.sku} ·{" "}
                        {room <= 0
                          ? v.available === 0
                            ? "épuisé"
                            : "tout est déjà dans la vente"
                          : `${room} disponible${room > 1 ? "s" : ""}`}
                      </span>
                    </span>
                    <span className="font-bold tabular">{fcfa(v.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-2 text-[14px]">
            <span className="font-semibold">Quantité à ajouter</span>
            <button
              type="button"
              className="btn btn-outline btn-sm px-2"
              onClick={() => setPickQty((n) => Math.max(1, n - 1))}
              aria-label="Diminuer"
            >
              <IconMinus size={16} />
            </button>
            <output className="w-6 text-center font-bold tabular">{pickQty}</output>
            <button
              type="button"
              className="btn btn-outline btn-sm px-2"
              onClick={() => setPickQty((n) => Math.min(99, n + 1))}
              aria-label="Augmenter"
            >
              <IconPlus size={16} />
            </button>
          </div>
        </div>
      ) : catalog ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.slice(0, 60).map((p) => {
            const avail = p.variants.reduce((s, v) => s + v.available, 0);
            const prices = p.variants.map((v) => v.price);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => (p.variants.length === 1 ? addVariant(p, p.variants[0], 1) : setPicked(p))}
                  disabled={avail === 0}
                  className="flex w-full items-center gap-3 rounded-[6px] border-[1.5px] border-line bg-card p-2 text-left hover:border-gps-blue disabled:opacity-50"
                >
                  {p.image ? (
                    <Image
                      src={p.image}
                      alt=""
                      width={48}
                      height={60}
                      unoptimized={p.image.endsWith(".svg")}
                      className="h-[60px] w-12 shrink-0 rounded-[4px] object-cover"
                    />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-[13px] text-ink-mute">
                      {fcfa(Math.min(...prices))}
                      {new Set(prices).size > 1 ? "+" : ""} · {avail === 0 ? "épuisé" : `${avail} dispo.`}
                      {p.variants.length > 1 ? ` · ${p.variants.length} variantes` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? <li className="text-ink-mute">Aucun article pour « {q} ».</li> : null}
        </ul>
      ) : null}
    </section>
  );

  const salePane = (
    <section aria-labelledby="titre-vente" className={`${tab === "vente" ? "" : "hidden"} lg:block`}>
      <div className="rounded-[6px] border border-line bg-card lg:sticky lg:top-24">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="titre-vente" className="text-[15px] font-extrabold tracking-wide uppercase">
            {mode === "sale" ? "Vente en cours" : "Commande"}
          </h2>
          {draft.lines.length ? (
            <button
              type="button"
              className="text-[13px] font-semibold text-ink-mute hover:text-gps-red-ink"
              onClick={() => (confirm("Vider la saisie en cours ?") ? setDraft(newDraft()) : null)}
            >
              Tout vider
            </button>
          ) : null}
        </div>
        <div className="grid gap-5 p-4">
          {restored ? (
            <p className="rounded-[6px] bg-gps-blue-soft p-2 text-[13px] text-gps-blue">
              Saisie précédente restaurée sur cet appareil.
            </p>
          ) : null}
          {draft.lines.length === 0 ? (
            <p className="text-[15px] text-ink-mute">
              Aucun article. Recherchez un article puis choisissez sa variante.
            </p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {draft.lines.map((l) => (
                <li key={l.variantId} className="py-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{l.name}</p>
                      <p className="text-[13px] text-ink-mute">
                        {l.label ? `${l.label} · ` : ""}
                        {l.sku}
                      </p>
                    </div>
                    <p className="font-bold tabular">{fcfa(l.unitPrice * l.quantity)}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-[6px] border-[1.5px] border-line bg-white">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center disabled:opacity-40"
                        disabled={l.quantity <= 1}
                        onClick={() =>
                          update({
                            lines: draft.lines.map((x) =>
                              x.variantId === l.variantId ? { ...x, quantity: x.quantity - 1 } : x,
                            ),
                          })
                        }
                        aria-label={`Diminuer ${l.name}`}
                      >
                        <IconMinus size={16} />
                      </button>
                      <output className="w-7 text-center font-bold tabular">{l.quantity}</output>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center disabled:opacity-40"
                        disabled={l.quantity >= l.available}
                        onClick={() =>
                          update({
                            lines: draft.lines.map((x) =>
                              x.variantId === l.variantId ? { ...x, quantity: x.quantity + 1 } : x,
                            ),
                          })
                        }
                        aria-label={`Augmenter ${l.name}`}
                      >
                        <IconPlus size={16} />
                      </button>
                    </div>
                    {canEditPrice ? (
                      <label className="flex items-center gap-1 text-[13px]">
                        <span className="text-ink-mute">PU</span>
                        <input
                          inputMode="numeric"
                          className="field h-10 min-h-10 w-28 px-2 text-[14px]"
                          value={l.unitPrice}
                          onChange={(e) =>
                            update({
                              lines: draft.lines.map((x) =>
                                x.variantId === l.variantId
                                  ? {
                                      ...x,
                                      unitPrice: Math.max(
                                        0,
                                        Math.round(Number(e.target.value.replace(/\D/g, "")) || 0),
                                      ),
                                    }
                                  : x,
                              ),
                            })
                          }
                          aria-label={`Prix unitaire de ${l.name}`}
                        />
                      </label>
                    ) : (
                      <span className="text-[13px] text-ink-mute">{fcfa(l.unitPrice)} l&apos;unité</span>
                    )}
                    <button
                      type="button"
                      className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[6px] text-ink-mute hover:bg-gps-red-soft hover:text-gps-red-ink"
                      onClick={() =>
                        update({
                          lines: draft.lines.filter((x) => x.variantId !== l.variantId),
                        })
                      }
                      aria-label={`Retirer ${l.name}`}
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                  {l.unitPrice !== l.catalogPrice ? (
                    <p className="mt-1 text-[12px] text-warn">
                      Prix catalogue : {fcfa(l.catalogPrice)} — prix convenu enregistré.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {/* Client */}
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-[13px] font-extrabold tracking-wide uppercase">
              Client {needsCustomer ? "" : "(facultatif)"}
            </legend>
            {mode === "sale" ? (
              <label className="flex min-h-11 items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={draft.withCustomer}
                  onChange={(e) => update({ withCustomer: e.target.checked })}
                />
                Associer un client (garantie, suivi, contact)
              </label>
            ) : null}
            {needsCustomer ? (
              draft.customerId ? (
                <div className="flex items-center justify-between rounded-[6px] bg-gps-blue-soft px-3 py-2">
                  <span className="font-semibold text-gps-blue-deep">{draft.customerLabel}</span>
                  <button
                    type="button"
                    className="text-[13px] font-bold text-gps-blue underline"
                    onClick={() => update({ customerId: null, customerLabel: "" })}
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="label" htmlFor="cust-search">
                      Client existant
                    </label>
                    <input
                      id="cust-search"
                      className="field"
                      placeholder="Nom ou téléphone…"
                      value={custQ}
                      onChange={(e) => searchCustomer(e.target.value)}
                      autoComplete="off"
                    />
                    {custResults.length ? (
                      <ul className="mt-1 divide-y divide-line-soft rounded-[6px] border border-line bg-white">
                        {custResults.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="flex min-h-11 w-full justify-between gap-2 px-3 py-2 text-left hover:bg-paper"
                              onClick={() => {
                                update({
                                  customerId: c.id,
                                  customerLabel: `${c.name}${c.phone ? ` · ${c.phone}` : ""}`,
                                  address: draft.address || c.address,
                                });
                                setCustResults([]);
                                setCustQ("");
                              }}
                            >
                              <span className="font-semibold">{c.name}</span>
                              <span className="text-[13px] text-ink-mute">{c.phone}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <p className="text-[13px] text-ink-mute">ou nouveau client :</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="nc-name">
                        Nom
                      </label>
                      <input
                        id="nc-name"
                        className="field"
                        value={draft.newCustomer.name}
                        onChange={(e) =>
                          update({
                            newCustomer: {
                              ...draft.newCustomer,
                              name: e.target.value,
                            },
                          })
                        }
                        aria-invalid={!!fieldErrors.name}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="nc-phone">
                        Téléphone
                      </label>
                      <input
                        id="nc-phone"
                        className="field"
                        inputMode="tel"
                        value={draft.newCustomer.phone}
                        onChange={(e) =>
                          update({
                            newCustomer: {
                              ...draft.newCustomer,
                              phone: e.target.value,
                            },
                            allowDuplicate: false,
                          })
                        }
                        onBlur={(e) => checkPhone(e.target.value)}
                        aria-invalid={!!fieldErrors.phone}
                      />
                    </div>
                  </div>
                  {matches.length ? (
                    <div
                      role="alert"
                      className="rounded-[6px] border-[1.5px] border-warn/40 bg-warn-soft p-3 text-[14px]"
                    >
                      <p className="flex items-center gap-2 font-bold text-warn">
                        <IconAlert size={18} /> Numéro déjà connu
                      </p>
                      <ul className="mt-2 grid gap-1">
                        {matches.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              className="font-semibold text-gps-blue underline"
                              onClick={() => {
                                update({
                                  customerId: m.id,
                                  customerLabel: `${m.name} · ${m.phone}`,
                                });
                                setMatches([]);
                              }}
                            >
                              Utiliser {m.name} ({m.phone})
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.allowDuplicate}
                          onChange={(e) => update({ allowDuplicate: e.target.checked })}
                        />{" "}
                        Créer quand même un nouveau client
                      </label>
                    </div>
                  ) : null}
                </>
              )
            ) : null}
          </fieldset>

          {mode === "order" ? (
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-[13px] font-extrabold tracking-wide uppercase">Canal & réception</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="o-canal">
                    Canal
                  </label>
                  <select
                    id="o-canal"
                    className="field"
                    value={draft.channel}
                    onChange={(e) => update({ channel: e.target.value as Draft["channel"] })}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="telephone">Téléphone</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="o-reception">
                    Réception
                  </label>
                  <select
                    id="o-reception"
                    className="field"
                    value={draft.reception}
                    onChange={(e) =>
                      update({
                        reception: e.target.value as Draft["reception"],
                      })
                    }
                  >
                    <option value="pickup">Retrait en boutique</option>
                    <option value="delivery">Livraison</option>
                  </select>
                </div>
              </div>
              {draft.reception === "delivery" ? (
                <>
                  <div>
                    <label className="label" htmlFor="o-adresse">
                      Adresse de livraison
                    </label>
                    <textarea
                      id="o-adresse"
                      rows={2}
                      className="field"
                      value={draft.address}
                      onChange={(e) => update({ address: e.target.value })}
                      aria-invalid={!!fieldErrors.deliveryAddress}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="o-zone">
                        Zone
                      </label>
                      {zones.length ? (
                        <select
                          id="o-zone"
                          className="field"
                          value={draft.zone}
                          onChange={(e) => {
                            const z = zones.find((x) => x.name === e.target.value);
                            update({
                              zone: e.target.value,
                              ...(z
                                ? {
                                    feeUnknown: z.fee === null,
                                    fee: z.fee === null ? "" : String(z.fee),
                                  }
                                : {}),
                            });
                          }}
                        >
                          <option value="">—</option>
                          {zones.map((z) => (
                            <option key={z.name}>{z.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id="o-zone"
                          className="field"
                          value={draft.zone}
                          onChange={(e) => update({ zone: e.target.value })}
                        />
                      )}
                    </div>
                    <div>
                      <label className="label" htmlFor="o-frais">
                        Frais de livraison
                      </label>
                      <input
                        id="o-frais"
                        inputMode="numeric"
                        className="field"
                        disabled={draft.feeUnknown}
                        value={draft.feeUnknown ? "" : draft.fee}
                        onChange={(e) => update({ fee: e.target.value.replace(/\D/g, "") })}
                        placeholder={draft.feeUnknown ? "À confirmer" : "0"}
                      />
                      <label className="mt-1 flex items-center gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          checked={draft.feeUnknown}
                          onChange={(e) => update({ feeUnknown: e.target.checked })}
                        />{" "}
                        À confirmer
                      </label>
                    </div>
                  </div>
                </>
              ) : null}
              <div>
                <label className="label" htmlFor="o-notes">
                  Note interne
                </label>
                <input
                  id="o-notes"
                  className="field"
                  value={draft.notes}
                  onChange={(e) => update({ notes: e.target.value })}
                />
              </div>
            </fieldset>
          ) : null}

          {/* Paiement */}
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-[13px] font-extrabold tracking-wide uppercase">
              {mode === "sale" ? "Paiement" : "Acompte reçu (facultatif)"}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="p-method">
                  Moyen
                </label>
                <select
                  id="p-method"
                  className="field"
                  value={draft.payMethod}
                  onChange={(e) => update({ payMethod: e.target.value as Draft["payMethod"] })}
                >
                  {methods
                    .filter(([k]) => !enabledMethods || enabledMethods.includes(k) || k === draft.payMethod)
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="p-amount">
                  Montant reçu
                </label>
                <input
                  id="p-amount"
                  inputMode="numeric"
                  className="field"
                  value={draft.amount}
                  placeholder={mode === "sale" ? String(Math.max(0, total - extraTotal)) : "0"}
                  onChange={(e) => update({ amount: e.target.value.replace(/\D/g, "") })}
                />
              </div>
            </div>
            {(draft.extraPays ?? []).map((p, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label className="label" htmlFor={`p-method-${i}`}>
                    Autre moyen
                  </label>
                  <select
                    id={`p-method-${i}`}
                    className="field"
                    value={p.method}
                    onChange={(e) =>
                      update({
                        extraPays: draft.extraPays.map((x, j) =>
                          j === i ? { ...x, method: e.target.value as PaymentMethodKey } : x,
                        ),
                      })
                    }
                  >
                    {methods
                      .filter(([k]) => !enabledMethods || enabledMethods.includes(k) || k === p.method)
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor={`p-amount-${i}`}>
                    Montant
                  </label>
                  <input
                    id={`p-amount-${i}`}
                    inputMode="numeric"
                    className="field"
                    value={p.amount}
                    onChange={(e) =>
                      update({
                        extraPays: draft.extraPays.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value.replace(/\D/g, "") } : x,
                        ),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => update({ extraPays: draft.extraPays.filter((_, j) => j !== i) })}
                >
                  Retirer
                </button>
              </div>
            ))}
            {(draft.extraPays ?? []).length < 3 ? (
              <button
                type="button"
                className="justify-self-start text-[14px] font-semibold text-gps-blue hover:underline"
                onClick={() => update({ extraPays: [...(draft.extraPays ?? []), { method: "wave", amount: "" }] })}
              >
                + Paiement mixte : ajouter un moyen
              </button>
            ) : null}
          </fieldset>

          <dl className="grid gap-1 border-t border-line pt-3 text-[15px]">
            <div className="flex justify-between">
              <dt>Total des articles</dt>
              <dd className="font-bold tabular">{fcfa(subtotal)}</dd>
            </div>
            {mode === "order" && draft.reception === "delivery" ? (
              <div className="flex justify-between">
                <dt>Livraison</dt>
                <dd className="font-semibold tabular">{draft.feeUnknown ? "À confirmer" : fcfa(fee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt>Encaissé maintenant</dt>
              <dd className="font-semibold text-wa-ink tabular">{fcfa(paid)}</dd>
            </div>
            {change > 0 ? (
              <div className="flex justify-between">
                <dt>Monnaie à rendre</dt>
                <dd className="font-semibold tabular">{fcfa(change)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-lg">
              <dt className="font-bold">Solde restant</dt>
              <dd className={`font-extrabold tabular ${total - paid > 0 ? "text-gps-red-ink" : ""}`}>
                {fcfa(total - paid)}
              </dd>
            </div>
          </dl>

          <ActionFeedback failure={failure} onRetry={submit} />

          {!review ? (
            <button
              type="button"
              className="btn btn-ink w-full"
              onClick={() => {
                setFailure(null);
                setReview(true);
              }}
              disabled={problems.length > 0}
            >
              Vérifier {mode === "sale" ? "la vente" : "la commande"}
            </button>
          ) : (
            <div className="rounded-[6px] border-[1.5px] border-gps-blue bg-gps-blue-soft p-3">
              <p className="font-bold text-gps-blue-deep">Vérification</p>
              <ul className="mt-1 text-[14px] text-gps-blue-deep">
                <li>
                  {draft.lines.reduce((s, l) => s + l.quantity, 0)} article(s) · {fcfa(subtotal)}
                </li>
                <li>{mode === "sale" ? "Sortie de stock immédiate" : "Les articles seront réservés"}</li>
                <li>
                  Encaissement : {fcfa(paid)} (
                  {[
                    methods.find((m) => m[0] === draft.payMethod)?.[1],
                    ...extras.filter((p) => p.amount > 0).map((p) => methods.find((m) => m[0] === p.method)?.[1]),
                  ].join(" + ")}
                  ) · solde {fcfa(total - paid)}
                </li>
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setReview(false)}>
                  Modifier
                </button>
                <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={pending}>
                  {pending ? "Enregistrement…" : mode === "sale" ? "Confirmer la vente" : "Confirmer et réserver"}
                </button>
              </div>
            </div>
          )}
          {problems.length && draft.lines.length ? <p className="hint">{problems.join(" ")}</p> : null}
        </div>
      </div>
    </section>
  );

  return (
    <div className="pb-20 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {catalogPane}
        {salePane}
      </div>
      {/* Barre mobile : bascule articles / récapitulatif */}
      <div
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-line bg-paper p-2 lg:hidden"
      >
        <button
          type="button"
          className={`btn ${tab === "articles" ? "btn-ink" : "btn-outline"}`}
          onClick={() => setTab("articles")}
          aria-pressed={tab === "articles"}
        >
          Articles
        </button>
        <button
          type="button"
          className={`btn ${tab === "vente" ? "btn-ink" : "btn-outline"}`}
          onClick={() => setTab("vente")}
          aria-pressed={tab === "vente"}
        >
          {mode === "sale" ? "Vente" : "Commande"} · {draft.lines.reduce((s, l) => s + l.quantity, 0)} ·{" "}
          {fcfa(subtotal)}
        </button>
      </div>
    </div>
  );
}
