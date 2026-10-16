"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import {
  checkCodesAction,
  trashProductAction,
  saveCategoryAction,
  saveProductAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { publicationHints, publicationIssues } from "@/lib/publication";
import { fcfa, formatDateTime, slugify } from "@/lib/format";
import { normalizeBarcode, suggestSku } from "@/lib/sku";
import { ActionFeedback, useAction } from "./useAction";
import { MediaPicker } from "./MediaLibrary";
import { UploadList, useUploadQueue } from "./UploadQueue";
import { Badge } from "./ui";
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconDown,
  IconImage,
  IconList,
  IconPlus,
  IconTrash,
  IconUp,
  IconUpload,
} from "../ui/icons";

interface VariantState {
  id?: string;
  sku: string;
  barcode?: string | null;
  options: Record<string, string>;
  price: number;
  costPrice?: number | null;
  initialStock?: number;
  lowStockThreshold?: number | null;
  onHand?: number;
  reserved?: number;
  hasSales?: boolean;
  /** Combinaison non proposée : retirée à l'enregistrement (désactivée si déjà vendue). */
  off?: boolean;
}

export interface ProductState {
  id?: string;
  /** Identifiant réservé à la création : un double envoi ne crée jamais deux produits. */
  createId?: string;
  updatedAt?: string;
  name: string;
  /** Adresse de la fiche (/produits/…) ; vide : tirée du nom. */
  slug?: string;
  brand: string;
  categoryId: string | null;
  description: string;
  specs: { label: string; value: string }[];
  condition: string | null;
  warranty: string;
  axes: string[];
  axisValues: Record<string, string>;
  images: { url: string; alt: string; color?: string | null; kind?: "image" | "video" }[];
  variants: VariantState[];
  status: "draft" | "published" | "archived";
  featured: boolean;
  hasSales?: boolean;
  /** Publication programmée (ISO), brouillons uniquement. */
  publishAt?: string | null;
  /** Retrait programmé du site (ISO). */
  unpublishAt?: string | null;
}

/** Réglages repris d'un produit à l'autre pendant une saisie en série (mémorisés sur l'appareil). */
interface Serie {
  keepMore: boolean;
  categoryId: string | null;
  brand: string;
  condition: string | null;
  warranty: string;
  lowStockThreshold: number | null;
  axes: string[];
  status: "draft" | "published";
}

const SERIE_KEY = "gps-serie";
const AXIS_PRESETS = ["Couleur", "Taille", "Capacité", "Modèle", "Pointure", "Parfum", "Contenance"];
const COLOR_AXES = ["Couleur", "Monture", "Coloris"];
const CONDITIONS = ["Neuf", "Reconditionné — très bon état", "Reconditionné — bon état", "Occasion"];

function snapshot(s: ProductState) {
  const { updatedAt: _u, ...rest } = s;
  void _u;
  return JSON.stringify(rest);
}

const noop = () => () => {};

/** ISO → valeur d'un champ datetime-local (heure locale de l'appareil). */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function readSerie(): Serie | null {
  try {
    const raw = localStorage.getItem(SERIE_KEY);
    return raw ? (JSON.parse(raw) as Serie) : null;
  } catch {
    return null;
  }
}

/** Fiche vierge : la catégorie précédente est reprise ; le reste seulement si « garder » est coché. */
function blankProduct(serie: Serie | null, categories: { id: string }[]): ProductState {
  const keep = serie?.keepMore ? serie : null;
  return {
    createId: crypto.randomUUID(),
    name: "",
    brand: keep?.brand ?? "",
    categoryId: serie?.categoryId && categories.some((c) => c.id === serie.categoryId) ? serie.categoryId : null,
    description: "",
    specs: [],
    condition: keep?.condition ?? null,
    warranty: keep?.warranty ?? "",
    axes: keep?.axes ?? [],
    axisValues: {},
    images: [],
    variants: [
      {
        sku: "",
        barcode: "",
        options: {},
        price: 0,
        initialStock: 0,
        lowStockThreshold: keep?.lowStockThreshold ?? null,
      },
    ],
    status: keep?.status ?? "draft",
    featured: false,
  };
}

const num = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Math.round(Number(s.replace(/\s/g, "")) || 0)));
const label = (axes: string[], v: VariantState, i: number) =>
  axes
    .map((a) => v.options[a])
    .filter(Boolean)
    .join(" · ") || `Variante ${i + 1}`;
const listOf = (s: string | undefined) => [
  ...new Set(
    (s ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

/** Le brouillon local est lu dans le navigateur : rendu après hydratation. */
export function ProductFormClient(props: Parameters<typeof ProductForm>[0]) {
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return ready ? (
    <ProductForm {...props} />
  ) : (
    <div className="skeleton h-96" aria-busy="true" aria-label="Chargement du formulaire" />
  );
}

function ProductForm({
  initial: given,
  categories: initialCategories,
  canCosts,
  videoMaxMb = 4,
}: {
  /** Fiche à modifier, ou modèle d'une duplication ; absent : nouveau produit vierge. */
  initial?: ProductState;
  categories: { id: string; name: string }[];
  canCosts: boolean;
  /** Taille maximale d'une vidéo, selon le stockage des médias. */
  videoMaxMb?: number;
}) {
  const router = useRouter();
  const editing = !!given?.id;
  const [initial] = useState<ProductState>(() => given ?? blankProduct(readSerie(), initialCategories));
  const draftKey = `gps-produit-${initial.id ?? "nouveau"}`;
  const [state, setState] = useState<ProductState>(initial);
  // Catégorie créée sur place : ajoutée à la liste et choisie, la saisie en cours est conservée.
  const [categories, setCategories] = useState(initialCategories);
  const [newCat, setNewCat] = useState<string | null>(null);
  const catAction = useAction();
  const [saved, setSaved] = useState(() => snapshot(initial));
  const [keepMore, setKeepMore] = useState(() => readSerie()?.keepMore ?? false);
  const [series, setSeries] = useState<{
    count: number;
    last: { id: string; name: string; published: boolean } | null;
  }>({ count: 0, last: null });
  const [clashes, setClashes] = useState<{ skus: Record<string, string>; barcodes: Record<string, string> }>({
    skus: {},
    barcodes: {},
  });
  const nameRef = useRef<HTMLInputElement>(null);
  const [localDraft, setLocalDraft] = useState<ProductState | null>(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      const d = raw ? (JSON.parse(raw) as ProductState & { savedFor?: string }) : null;
      return d && d.savedFor === (initial.updatedAt ?? "") && snapshot(d) !== snapshot(initial) ? d : null;
    } catch {
      return null;
    }
  });
  const uploads = useUploadQueue({
    onUploaded: (u) =>
      setState((s) => ({
        ...s,
        images: [
          ...s.images,
          { url: u.url, alt: "", color: null, kind: u.mime.startsWith("video/") ? "video" : "image" },
        ],
      })),
  });
  const { run, pending, failure, success } = useAction();
  const dirty = snapshot(state) !== saved;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Brouillon local + avertissement avant de quitter une saisie non enregistrée.
  useEffect(() => {
    try {
      if (dirty) localStorage.setItem(draftKey, JSON.stringify({ ...state, savedFor: initial.updatedAt ?? "" }));
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [state, dirty, draftKey, initial.updatedAt]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !dirtyRef.current || a.target === "_blank" || a.href.startsWith("blob:")) return;
      if (
        !confirm("Des modifications ne sont pas enregistrées. Quitter quand même ? (Une copie reste sur cet appareil.)")
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, []);

  const set = (patch: Partial<ProductState>) => setState((s) => ({ ...s, ...patch }));
  const active = state.variants.filter((v) => !v.off);
  const single = state.axes.length === 0;
  const v0 = state.variants[0];
  const checkInput = { ...state, variants: active };
  const issues = publicationIssues(checkInput);
  const hints = publicationHints(checkInput);
  const colorAxis = state.axes.find((a) => COLOR_AXES.includes(a));
  const colorValues = colorAxis ? [...new Set(active.map((v) => v.options[colorAxis]).filter(Boolean))] : [];

  // Références et codes-barres déjà pris ailleurs : vérifiés pendant la saisie.
  const codes = JSON.stringify({
    skus: active.map((v) => v.sku.trim().toUpperCase()).filter(Boolean),
    barcodes: active.map((v) => normalizeBarcode(v.barcode)).filter(Boolean),
  });
  useEffect(() => {
    const c = JSON.parse(codes) as { skus: string[]; barcodes: string[] };
    // Sans code saisi, rien à vérifier (les anciens résultats ne correspondent plus à aucun champ).
    if (!c.skus.length && !c.barcodes.length) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await checkCodesAction({ productId: state.id ?? null, ...c }).catch(() => null);
      if (stale || !r?.ok) return;
      setClashes({
        skus: Object.fromEntries(r.data.skus.map((x) => [x.code, x.name])),
        barcodes: Object.fromEntries(r.data.barcodes.map((x) => [x.code, x.name])),
      });
    }, 500);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [codes, state.id]);

  const codeErrors = (v: VariantState) => {
    const sku = v.sku.trim().toUpperCase();
    const bc = normalizeBarcode(v.barcode);
    const sameSku = sku && active.filter((x) => x.sku.trim().toUpperCase() === sku).length > 1;
    const sameBc = bc && active.filter((x) => normalizeBarcode(x.barcode) === bc).length > 1;
    return {
      sku: clashes.skus[sku]
        ? `Déjà utilisée par « ${clashes.skus[sku]} ».`
        : sameSku
          ? "Utilisée deux fois dans cette fiche."
          : null,
      barcode: clashes.barcodes[bc]
        ? `Déjà utilisé par « ${clashes.barcodes[bc]} ».`
        : sameBc
          ? "Utilisé deux fois dans cette fiche."
          : null,
    };
  };
  const codeProblems = active.flatMap((v) => {
    const e = codeErrors(v);
    return [e.sku, e.barcode].filter(Boolean) as string[];
  });

  // Ce qui empêche d'enregistrer (le brouillon reste toujours possible, sauf ces cas).
  const wantsPublish = state.status === "published" || (state.status === "draft" && !!state.publishAt);
  const blocker = !state.name.trim()
    ? "Indiquez au moins le nom du produit."
    : uploads.busy
      ? "Patientez : envoi des médias en cours."
      : codeProblems.length
        ? "Une référence ou un code-barres est déjà utilisé."
        : wantsPublish && issues.length
          ? state.status === "published"
            ? "Il manque des informations pour publier."
            : "Il manque des informations pour programmer la publication."
          : null;

  // Double clic : useAction n'accepte qu'un envoi à la fois, et createId rend la création idempotente.
  const save = (after: "stay" | "next" | "list") => {
    if (pending || blocker) return;
    const status = state.status;
    const payload = {
      id: state.id,
      createId: state.id ? undefined : state.createId,
      expectedUpdatedAt: state.updatedAt,
      name: state.name,
      slug: state.slug?.trim() ? slugify(state.slug) : undefined,
      brand: state.brand,
      categoryId: state.categoryId,
      description: state.description,
      specs: state.specs.filter((s) => s.label.trim() && s.value.trim()),
      condition: state.condition,
      warranty: state.warranty,
      axes: state.axes,
      images: state.images,
      variants: active.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: normalizeBarcode(v.barcode) || null,
        options: Object.fromEntries(state.axes.map((a) => [a, v.options[a] ?? ""])),
        price: v.price,
        costPrice: canCosts ? (v.costPrice ?? null) : undefined,
        initialStock: v.id ? undefined : (v.initialStock ?? 0),
        lowStockThreshold: v.lowStockThreshold ?? null,
      })),
      status,
      featured: status === "published" ? state.featured : false,
      publishAt: status === "draft" ? (state.publishAt ?? null) : null,
      unpublishAt:
        status === "published" || (status === "draft" && state.publishAt) ? (state.unpublishAt ?? null) : null,
    };
    const serie: Serie = {
      keepMore,
      categoryId: state.categoryId,
      brand: state.brand,
      condition: state.condition,
      warranty: state.warranty,
      lowStockThreshold: single ? (v0?.lowStockThreshold ?? null) : null,
      axes: state.axes,
      status: status === "published" ? "published" : "draft",
    };
    run(() => saveProductAction(payload), {
      refresh: after === "stay",
      successMessage:
        status === "published"
          ? "Produit enregistré et publié."
          : payload.publishAt
            ? `Publication programmée le ${formatDateTime(payload.publishAt)}.`
            : "Brouillon enregistré.",
      onSuccess: (r) => {
        try {
          localStorage.removeItem(draftKey);
          localStorage.setItem(SERIE_KEY, JSON.stringify(serie));
        } catch {}
        if (after === "next") {
          setSeries((s) => ({
            count: s.count + 1,
            last: { id: r.id, name: state.name.trim(), published: status === "published" },
          }));
          if (editing) {
            setSaved(snapshot(state));
            router.push("/comptoir/catalogue/nouveau");
            return;
          }
          const next = blankProduct(serie, categories);
          setState(next);
          setSaved(snapshot(next));
          setLocalDraft(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
          setTimeout(() => nameRef.current?.focus(), 50);
          return;
        }
        const next = { ...state, id: r.id, updatedAt: r.updatedAt, featured: payload.featured };
        setState(next);
        setSaved(snapshot(next));
        if (after === "list") router.push("/comptoir/catalogue");
        else if (!state.id) router.replace(`/comptoir/catalogue/${r.id}`);
      },
    });
  };

  // Ordinateur : Ctrl/⌘ + S enregistre, Ctrl/⌘ + Entrée enregistre et ouvre une fiche vierge.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        saveRef.current("stay");
      } else if (e.key === "Enter") {
        e.preventDefault();
        saveRef.current("next");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const updateVariant = (i: number, patch: Partial<VariantState>) =>
    set({ variants: state.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  const prices = active.map((v) => v.price).filter((p) => p > 0);
  const priceText = prices.length
    ? Math.min(...prices) === Math.max(...prices)
      ? fcfa(prices[0])
      : `${fcfa(Math.min(...prices))} – ${fcfa(Math.max(...prices))}`
    : "Prix à saisir";
  const stockTotal = active.reduce(
    (n, v) => n + (v.id ? (v.onHand ?? 0) - (v.reserved ?? 0) : (v.initialStock ?? 0)),
    0,
  );
  const cover = state.images.find((i) => (i.kind ?? "image") === "image");
  const margin = (v: VariantState) =>
    canCosts && v.price > 0 && v.costPrice != null
      ? { value: v.price - v.costPrice, pct: (v.price - v.costPrice) / v.price }
      : null;

  return (
    <div className="pb-28">
      {localDraft ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border-[1.5px] border-warn/40 bg-warn-soft p-3 text-[15px]"
        >
          <p className="font-semibold text-warn">Une saisie non enregistrée a été retrouvée sur cet appareil.</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-ink"
              onClick={() => (setState({ ...localDraft, updatedAt: initial.updatedAt }), setLocalDraft(null))}
            >
              Restaurer
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setLocalDraft(null)}>
              Ignorer
            </button>
          </div>
        </div>
      ) : null}

      {series.last ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[6px] border-[1.5px] border-wa/40 bg-wa-soft p-3 text-[15px]"
        >
          <IconCheck size={18} className="shrink-0 text-wa-ink" />
          <p className="min-w-0 flex-1 font-semibold text-wa-ink">
            « {series.last.name} » enregistré {series.last.published ? "et publié" : "en brouillon"}.{" "}
            <span className="font-normal text-ink-soft">
              {series.count} produit{series.count > 1 ? "s" : ""} saisi{series.count > 1 ? "s" : ""} à la suite.
            </span>
          </p>
          <Link href={`/comptoir/catalogue/${series.last.id}`} className="font-bold text-gps-blue underline">
            Ouvrir la fiche
          </Link>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid content-start gap-4">
          {/* L'essentiel : de quoi créer une fiche en quelques secondes. */}
          <section className="rounded-[6px] border-[1.5px] border-ink bg-card" aria-labelledby="t-essentiel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 md:px-5">
              <h2 id="t-essentiel" className="text-[15px] font-extrabold tracking-wide uppercase">
                L&apos;essentiel
              </h2>
              <span className="text-[13px] text-ink-mute">Seul le nom est obligatoire pour un brouillon.</span>
            </div>
            <div className="grid gap-4 p-4 md:p-5">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <div>
                  <label className="label" htmlFor="p-name">
                    Nom du produit
                  </label>
                  <input
                    id="p-name"
                    ref={nameRef}
                    className="field"
                    autoFocus={!editing}
                    autoComplete="off"
                    enterKeyHint="next"
                    maxLength={120}
                    value={state.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="p-cat">
                    Catégorie
                  </label>
                  <select
                    id="p-cat"
                    className="field"
                    value={state.categoryId ?? ""}
                    onChange={(e) => set({ categoryId: e.target.value || null })}
                  >
                    <option value="">Choisir…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {newCat === null ? (
                    <button
                      type="button"
                      className="mt-1 min-h-8 text-[13px] font-semibold text-gps-blue underline underline-offset-2"
                      onClick={() => setNewCat("")}
                    >
                      + Nouvelle catégorie
                    </button>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <label className="label text-[13px]" htmlFor="p-newcat">
                          Nom de la nouvelle catégorie
                        </label>
                        <input
                          id="p-newcat"
                          className="field h-10 min-h-10"
                          value={newCat}
                          maxLength={60}
                          onChange={(e) => setNewCat(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                        />
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNewCat(null)}>
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="btn btn-blue btn-sm"
                        disabled={!newCat.trim() || catAction.pending}
                        onClick={() =>
                          catAction.run(() => saveCategoryAction({ name: newCat, description: "" }), {
                            refresh: false,
                            onSuccess: (r) => {
                              const id = (r as { id: string }).id;
                              setCategories((list) => [...list, { id, name: newCat.trim() }]);
                              set({ categoryId: id });
                              setNewCat(null);
                            },
                          })
                        }
                      >
                        Créer
                      </button>
                      <div className="w-full">
                        <ActionFeedback failure={catAction.failure} success={null} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {single && v0 ? (
                <div className="grid gap-3">
                  <div className={`grid gap-3 ${canCosts ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2"}`}>
                    <div>
                      <label className="label" htmlFor="p-price">
                        Prix de vente <span className="font-normal text-ink-mute">FCFA</span>
                      </label>
                      <input
                        id="p-price"
                        className="field tabular"
                        inputMode="numeric"
                        pattern="[0-9 ]*"
                        enterKeyHint="next"
                        autoComplete="off"
                        value={v0.price || ""}
                        onChange={(e) => updateVariant(0, { price: num(e.target.value) ?? 0 })}
                      />
                    </div>
                    {canCosts ? (
                      <div>
                        <label className="label" htmlFor="p-cost">
                          Coût d&apos;achat <span className="font-normal text-ink-mute">FCFA</span>
                        </label>
                        <input
                          id="p-cost"
                          className="field tabular"
                          inputMode="numeric"
                          pattern="[0-9 ]*"
                          enterKeyHint="next"
                          autoComplete="off"
                          value={v0.costPrice ?? ""}
                          onChange={(e) => updateVariant(0, { costPrice: num(e.target.value) ?? null })}
                        />
                      </div>
                    ) : null}
                    <div className={canCosts ? "col-span-2 md:col-span-1" : ""}>
                      {v0.id ? (
                        <>
                          <span className="label">Stock</span>
                          <p className="flex min-h-12 items-center gap-2 tabular">
                            <strong>{(v0.onHand ?? 0) - (v0.reserved ?? 0)}</strong> disponible
                            {(v0.onHand ?? 0) - (v0.reserved ?? 0) > 1 ? "s" : ""}
                            <Link
                              href={`/comptoir/stock?q=${encodeURIComponent(v0.sku)}`}
                              className="text-[13px] font-semibold text-gps-blue underline"
                            >
                              Ajuster
                            </Link>
                          </p>
                        </>
                      ) : (
                        <>
                          <label className="label" htmlFor="p-stock">
                            Stock initial
                          </label>
                          <input
                            id="p-stock"
                            className="field tabular"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            enterKeyHint="done"
                            autoComplete="off"
                            placeholder="0"
                            value={v0.initialStock || ""}
                            onChange={(e) => updateVariant(0, { initialStock: num(e.target.value) ?? 0 })}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <MarginLine m={margin(v0)} />
                </div>
              ) : (
                <p className="rounded-[6px] bg-paper-deep px-3 py-2 text-[14px]">
                  <strong>
                    {active.length} variante{active.length > 1 ? "s" : ""}
                  </strong>{" "}
                  · {priceText} · prix, stock et références de chaque variante dans la section « Variantes » ci-dessous.
                </p>
              )}

              <MediaEditor
                images={state.images}
                setImages={(images) => set({ images })}
                uploads={uploads}
                colorAxis={colorAxis}
                colorValues={colorValues}
                videoMaxMb={videoMaxMb}
              />

              <fieldset>
                <legend className="label">Publication</legend>
                <div className={`grid gap-2 ${state.status === "archived" ? "grid-cols-3" : "grid-cols-2"}`}>
                  {(
                    [
                      ["draft", "Brouillon", "Invisible sur le site"],
                      ["published", "En ligne", "Visible dès l'enregistrement"],
                      ...(state.status === "archived" ? [["archived", "Archivé", "Retiré de la vente"]] : []),
                    ] as [ProductState["status"], string, string][]
                  ).map(([value, title, text]) => (
                    <label
                      key={value}
                      className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-[6px] border-[1.5px] px-3 py-2 focus-within:outline-3 focus-within:outline-gps-blue ${
                        state.status === value
                          ? value === "published"
                            ? "border-wa bg-wa-soft"
                            : "border-ink bg-paper-deep"
                          : "border-line bg-card"
                      }`}
                    >
                      <input
                        type="radio"
                        name="p-status"
                        className="sr-only"
                        value={value}
                        checked={state.status === value}
                        onChange={() => set({ status: value })}
                      />
                      <span className="font-bold">{title}</span>
                      <span className="text-[12.5px] text-ink-mute">{text}</span>
                    </label>
                  ))}
                </div>
                {state.status === "published" && issues.length ? (
                  <div className="mt-2 rounded-[6px] border border-gps-red/30 bg-gps-red-soft p-3 text-[14px]">
                    <p className="font-bold text-gps-red-ink">Pour publier, il manque :</p>
                    <ul className="mt-1 grid gap-0.5 text-gps-red-ink">
                      {issues.map((i) => (
                        <li key={i}>· {i}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="mt-2 min-h-9 font-semibold text-gps-blue underline"
                      onClick={() => set({ status: "draft" })}
                    >
                      Garder en brouillon pour l&apos;instant
                    </button>
                  </div>
                ) : null}
                {initial.status === "published" && state.status === "draft" && editing ? (
                  <p className="hint">Le produit sera retiré du site à l&apos;enregistrement.</p>
                ) : null}
              </fieldset>
            </div>
          </section>

          <Section
            title="Variantes"
            summary={single ? "Couleur, taille, capacité…" : `${active.length} proposée${active.length > 1 ? "s" : ""}`}
            defaultOpen={!single}
          >
            <VariantEditor state={state} set={set} canCosts={canCosts} codeErrors={codeErrors} margin={margin} />
          </Section>

          <Section title="Description" summary={state.description.trim() ? "Rédigée" : "Facultative"}>
            <div className="grid gap-4">
              <div>
                <label className="label" htmlFor="p-brand">
                  Marque
                </label>
                <input
                  id="p-brand"
                  className="field"
                  value={state.brand}
                  maxLength={60}
                  onChange={(e) => set({ brand: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor="p-desc">
                  Description
                </label>
                <textarea
                  id="p-desc"
                  rows={5}
                  className="field"
                  value={state.description}
                  onChange={(e) => set({ description: e.target.value })}
                />
                <p className="hint">Quelques lignes suffisent : usage, points forts, contenu de la boîte.</p>
              </div>
              <fieldset>
                <legend className="label">Caractéristiques</legend>
                <ul className="grid gap-2">
                  {state.specs.map((s, i) => (
                    <li key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                      <input
                        aria-label={`Libellé ${i + 1}`}
                        className="field"
                        placeholder="Libellé"
                        value={s.label}
                        onChange={(e) =>
                          set({ specs: state.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                        }
                      />
                      <input
                        aria-label={`Valeur ${i + 1}`}
                        className="field"
                        placeholder="Valeur"
                        value={s.value}
                        onChange={(e) =>
                          set({ specs: state.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost px-3"
                        aria-label={`Supprimer la caractéristique ${i + 1}`}
                        onClick={() => set({ specs: state.specs.filter((_, j) => j !== i) })}
                      >
                        <IconTrash size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-outline btn-sm mt-2"
                  onClick={() => set({ specs: [...state.specs, { label: "", value: "" }] })}
                >
                  <IconPlus size={16} /> Ajouter une caractéristique
                </button>
              </fieldset>
            </div>
          </Section>

          {single && v0 ? (
            <Section
              title="Référence et code-barres"
              summary={v0.sku || (v0.barcode ? normalizeBarcode(v0.barcode) : "Générée automatiquement")}
            >
              <CodeFields
                v={v0}
                i={0}
                suggestion={suggestSku(state.name, state.axes, v0.options)}
                errors={codeErrors(v0)}
                onChange={(p) => updateVariant(0, p)}
              />
            </Section>
          ) : null}

          <Section title="État et garantie" summary={[state.condition, state.warranty].filter(Boolean).join(" · ")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="p-cond">
                  État du produit
                </label>
                <select
                  id="p-cond"
                  className="field"
                  value={state.condition ?? ""}
                  onChange={(e) => set({ condition: e.target.value || null })}
                >
                  <option value="">Non affiché</option>
                  {CONDITIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="p-warranty">
                  Garantie de ce produit
                </label>
                <input
                  id="p-warranty"
                  className="field"
                  maxLength={200}
                  placeholder="Ex. 6 mois, pièces et main-d'œuvre"
                  value={state.warranty}
                  onChange={(e) => set({ warranty: e.target.value })}
                />
                <p className="hint">Vide : la garantie générale de GPS (Paramètres) s&apos;affiche.</p>
              </div>
            </div>
          </Section>

          <Section
            title="Stock"
            summary={single && v0?.lowStockThreshold != null ? `Alerte à ${v0.lowStockThreshold}` : "Stock commun"}
          >
            {single && v0 ? (
              <div className="max-w-xs">
                <label className="label" htmlFor="p-threshold">
                  Seuil de stock faible
                </label>
                <input
                  id="p-threshold"
                  className="field tabular"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Réglage général"
                  value={v0.lowStockThreshold ?? ""}
                  onChange={(e) => updateVariant(0, { lowStockThreshold: num(e.target.value) ?? null })}
                />
              </div>
            ) : null}
            <p className="hint mt-2">
              Un seul stock pour toute l&apos;entreprise, partagé par les deux points de vente. Après la création, les
              entrées et corrections se font dans Stock, avec motif et historique.
            </p>
          </Section>

          <Section title="Promotion" summary="Prix réduit sur une période">
            {state.id ? (
              <Link href={`/comptoir/catalogue/promotions?produit=${state.id}`} className="btn btn-outline btn-sm">
                Créer une promotion pour ce produit
              </Link>
            ) : (
              <p className="text-[14px] text-ink-soft">
                Disponible après le premier enregistrement : le prix revient seul à la normale à la fin de la période.
              </p>
            )}
          </Section>

          <Section
            title="Référencement et mise en avant"
            summary={`/produits/${state.slug || slugify(state.name) || "…"}`}
          >
            <div className="grid gap-4">
              <div>
                <label className="label" htmlFor="p-slug">
                  Adresse de la fiche
                </label>
                <div className="flex min-w-0 items-center gap-1">
                  <span className="shrink-0 text-[14px] text-ink-mute">/produits/</span>
                  <input
                    id="p-slug"
                    className="field min-w-0 flex-1 font-mono text-[14px]"
                    placeholder={slugify(state.name) || "tiree-du-nom"}
                    value={state.slug ?? ""}
                    onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                  />
                </div>
                <p className="hint">
                  Vide : tirée du nom, sans accents. Changer l&apos;adresse casse les liens déjà partagés.
                </p>
              </div>
              <label className="flex min-h-11 items-center gap-2 font-semibold">
                <input type="checkbox" checked={state.featured} onChange={(e) => set({ featured: e.target.checked })} />
                Mettre dans la Sélection GPS (accueil)
              </label>
            </div>
          </Section>

          <Section
            title="Programmation"
            summary={
              state.publishAt
                ? `Publication le ${formatDateTime(state.publishAt)}`
                : state.unpublishAt
                  ? `Retrait le ${formatDateTime(state.unpublishAt)}`
                  : "Aucune"
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {state.status !== "published" ? (
                <div>
                  <label className="label" htmlFor="p-publish-at">
                    Programmer la publication
                  </label>
                  <input
                    id="p-publish-at"
                    type="datetime-local"
                    className="field"
                    value={state.publishAt ? toLocalInput(state.publishAt) : ""}
                    onChange={(e) => set({ publishAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                  <p className="hint">Le brouillon sera publié seul à cette heure, si les vérifications sont bonnes.</p>
                </div>
              ) : null}
              <div>
                <label className="label" htmlFor="p-unpublish-at">
                  Retirer du site le
                </label>
                <input
                  id="p-unpublish-at"
                  type="datetime-local"
                  className="field"
                  value={state.unpublishAt ? toLocalInput(state.unpublishAt) : ""}
                  onChange={(e) => set({ unpublishAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
                <p className="hint">
                  Fin d&apos;une offre : le produit repasse en brouillon, rien n&apos;est supprimé.
                </p>
              </div>
            </div>
          </Section>

          <Section title="Médias de la médiathèque" summary="Photos déjà envoyées">
            <MediaPicker
              onPick={(img) =>
                setState((s) =>
                  s.images.some((x) => x.url === img.url)
                    ? s
                    : { ...s, images: [...s.images, { url: img.url, alt: img.alt, color: null, kind: img.kind }] },
                )
              }
            />
          </Section>

          {state.id ? (
            <Section title="Autres actions" summary="Dupliquer, corbeille">
              <SecondaryActions id={state.id} hasSales={!!state.hasSales} />
            </Section>
          ) : null}
        </div>

        {/* Résumé : aperçu de la carte produit, vérifications, saisie en série. */}
        <aside className="grid content-start gap-4 lg:sticky lg:top-4 lg:self-start" aria-label="Résumé du produit">
          <div className="overflow-hidden rounded-[6px] border-[1.5px] border-line bg-card">
            <div className="relative aspect-[16/9] bg-paper-deep lg:aspect-[4/3]">
              {cover ? (
                <Image
                  src={cover.url}
                  alt=""
                  fill
                  sizes="360px"
                  unoptimized={cover.url.endsWith(".svg") || cover.url.startsWith("/media/")}
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-mute">
                  <IconImage size={28} />
                  <span className="text-[13px]">Photo principale</span>
                </span>
              )}
              <span className="absolute top-2 left-2">
                {state.status === "published" ? (
                  <Badge tone="green">En ligne</Badge>
                ) : state.status === "archived" ? (
                  <Badge>Archivé</Badge>
                ) : (
                  <Badge tone="warn">Brouillon</Badge>
                )}
              </span>
            </div>
            <div className="grid gap-1 p-4">
              <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">
                {categories.find((c) => c.id === state.categoryId)?.name ?? "Sans catégorie"}
              </p>
              <p className="font-display text-2xl leading-tight font-bold [overflow-wrap:anywhere] uppercase">
                {state.name || "Nouveau produit"}
              </p>
              <p className="font-bold tabular">{priceText}</p>
              <p className={`text-[14px] ${stockTotal > 0 ? "text-wa-ink" : "text-ink-mute"}`}>
                {stockTotal > 0
                  ? `${stockTotal} disponible${stockTotal > 1 ? "s" : ""} à la vente`
                  : "Sans stock : affiché « Épuisé » sur le site"}
              </p>
              <p className="text-[13px] text-ink-mute">
                {active.length} variante{active.length > 1 ? "s" : ""} · {state.images.length} média
                {state.images.length > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <section className="rounded-[6px] border border-line bg-card p-4" aria-labelledby="t-verif">
            <h2 id="t-verif" className="text-[15px] font-extrabold tracking-wide uppercase">
              Avant publication
            </h2>
            {issues.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 font-semibold text-wa-ink">
                <IconCheck /> Prêt à publier.
              </p>
            ) : (
              <ul className="mt-2 grid gap-1 text-[14px]">
                {issues.map((i) => (
                  <li key={i} className="flex gap-2 text-gps-red-ink">
                    <IconAlert size={16} className="mt-0.5 shrink-0" /> {i}
                  </li>
                ))}
              </ul>
            )}
            {hints.length || codeProblems.length ? (
              <ul className="mt-2 grid gap-1 border-t border-line pt-2 text-[13.5px]">
                {[...codeProblems, ...hints].map((h) => (
                  <li key={h} className="flex gap-2 text-warn">
                    <IconAlert size={15} className="mt-0.5 shrink-0" /> {h}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="hint mt-2">Un brouillon s&apos;enregistre à tout moment, même incomplet.</p>
          </section>

          {!editing || series.count ? (
            <section className="rounded-[6px] border border-line bg-card p-4" aria-labelledby="t-serie">
              <h2 id="t-serie" className="text-[15px] font-extrabold tracking-wide uppercase">
                Saisie en série
              </h2>
              <p className="mt-1 text-[14px] text-ink-soft">
                « Enregistrer et ajouter un autre » ouvre une fiche vierge et garde la catégorie. Nom, références,
                code-barres, photos, prix et stock repartent toujours à zéro.
              </p>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-[14px] font-semibold">
                <input type="checkbox" checked={keepMore} onChange={(e) => setKeepMore(e.target.checked)} />
                Garder aussi marque, état, garantie, options, seuil et publication
              </label>
              <p className="mt-2 hidden text-[12.5px] text-ink-mute [@media(pointer:fine)]:block">
                Clavier : Ctrl + S enregistre · Ctrl + Entrée enregistre et ouvre une fiche vierge.
              </p>
            </section>
          ) : null}
        </aside>
      </div>

      {/* Barre d'enregistrement : toujours visible, au-dessus du pouce. */}
      <div
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:left-[256px]"
      >
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2 px-4 py-2.5 md:px-8">
          <div className="mr-auto min-w-0 basis-full text-[14px] sm:basis-auto" aria-live="polite">
            {failure ? (
              <ActionFeedback failure={failure} success={null} />
            ) : blocker && (dirty || uploads.busy) ? (
              <span className="font-semibold text-warn">{blocker}</span>
            ) : success && !dirty ? (
              <span className="flex items-center gap-1.5 font-semibold text-wa-ink">
                <IconCheck size={16} /> {success}
              </span>
            ) : dirty ? (
              <span className="font-semibold text-warn">Modifications non enregistrées</span>
            ) : !state.id ? (
              <span className="text-ink-mute">Fiche vierge : commencez par le nom.</span>
            ) : (
              <span className="text-ink-mute">Tout est enregistré</span>
            )}
          </div>
          <button
            type="button"
            className={`btn btn-sm flex-1 sm:flex-none ${editing ? "btn-outline" : "btn-primary"}`}
            aria-label="Enregistrer et ajouter un autre produit"
            title="Ctrl + Entrée"
            disabled={pending || !!blocker}
            onClick={() => save("next")}
          >
            <IconPlus size={16} />
            <span className="sm:hidden">Enregistrer + nouveau</span>
            <span className="hidden sm:inline">Enregistrer et ajouter un autre</span>
          </button>
          <button
            type="button"
            className={`btn btn-sm flex-1 sm:flex-none ${editing ? "btn-primary" : "btn-ink"}`}
            aria-label="Enregistrer et rester sur la fiche"
            title={blocker ?? "Ctrl + S"}
            disabled={pending || !!blocker}
            onClick={() => save("stay")}
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm px-3"
            aria-label="Enregistrer et voir dans le catalogue"
            title="Enregistrer et voir dans le catalogue"
            disabled={pending || !!blocker}
            onClick={() => save("list")}
          >
            <IconList size={18} />
            <span className="hidden xl:inline">Catalogue</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function MarginLine({ m }: { m: { value: number; pct: number } | null }) {
  if (!m) return null;
  return m.value < 0 ? (
    <p className="flex items-center gap-1.5 text-[14px] font-semibold text-gps-red-ink" role="status">
      <IconAlert size={16} /> Prix inférieur au coût : perte de {fcfa(-m.value)} par article.
    </p>
  ) : (
    <p className="text-[14px] text-ink-soft" data-testid="marge">
      Bénéfice estimé : <strong className="text-ink tabular">{fcfa(m.value)}</strong> par article (
      {Math.round(m.pct * 100)} %)
    </p>
  );
}

function Section({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="group rounded-[6px] border border-line bg-card open:border-ink/40"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[6px] px-4 py-2 focus-visible:outline-3 focus-visible:outline-gps-blue md:px-5 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 text-[14.5px] font-extrabold tracking-wide uppercase">{title}</span>
        {summary ? <span className="min-w-0 flex-1 truncate text-[13px] text-ink-mute">{summary}</span> : null}
        <IconChevronDown size={18} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-4 md:p-5">{children}</div>
    </details>
  );
}

function CodeFields({
  v,
  i,
  suggestion,
  errors,
  onChange,
  compact,
}: {
  v: VariantState;
  i: number;
  suggestion: string;
  errors: { sku: string | null; barcode: string | null };
  onChange: (p: Partial<VariantState>) => void;
  compact?: boolean;
}) {
  const h = compact ? "h-10 min-h-10 text-[13px]" : "";
  return (
    <>
      <div className="min-w-0">
        <label className={compact ? "text-[12px] font-bold text-ink-mute" : "label"} htmlFor={`p-sku-${i}`}>
          Référence
        </label>
        <input
          id={`p-sku-${i}`}
          className={`field font-mono ${h}`}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={40}
          placeholder={suggestion}
          value={v.sku}
          aria-invalid={!!errors.sku}
          onChange={(e) => onChange({ sku: e.target.value.toUpperCase() })}
        />
        {errors.sku ? <p className="error-text">{errors.sku}</p> : null}
        {!compact ? <p className="hint">Vide : « {suggestion} » sera attribuée à l&apos;enregistrement.</p> : null}
      </div>
      <div className="min-w-0">
        <label className={compact ? "text-[12px] font-bold text-ink-mute" : "label"} htmlFor={`p-barcode-${i}`}>
          Code-barres
        </label>
        <input
          id={`p-barcode-${i}`}
          className={`field font-mono ${h}`}
          autoComplete="off"
          inputMode="numeric"
          maxLength={40}
          placeholder={compact ? "—" : "EAN, UPC ou code interne"}
          value={v.barcode ?? ""}
          aria-invalid={!!errors.barcode}
          onChange={(e) => onChange({ barcode: e.target.value })}
        />
        {errors.barcode ? <p className="error-text">{errors.barcode}</p> : null}
      </div>
    </>
  );
}

/** Variantes : options en étiquettes, combinaisons générées, réglages groupés, fiches compactes. */
function VariantEditor({
  state,
  set,
  canCosts,
  codeErrors,
  margin,
}: {
  state: ProductState;
  set: (p: Partial<ProductState>) => void;
  canCosts: boolean;
  codeErrors: (v: VariantState) => { sku: string | null; barcode: string | null };
  margin: (v: VariantState) => { value: number; pct: number } | null;
}) {
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [bulk, setBulk] = useState({ price: "", cost: "", stock: "", threshold: "" });
  const values = (a: string) =>
    state.axisValues[a] !== undefined
      ? listOf(state.axisValues[a])
      : [...new Set(state.variants.map((v) => v.options[a]).filter(Boolean))];
  const setValues = (a: string, list: string[]) =>
    set({
      axisValues: { ...Object.fromEntries(state.axes.map((x) => [x, values(x).join(", ")])), [a]: list.join(", ") },
    });
  const addValues = (a: string, raw: string) => {
    const add = listOf(raw);
    if (add.length) setValues(a, [...new Set([...values(a), ...add])]);
    setTyping((t) => ({ ...t, [a]: "" }));
  };
  const addAxis = (name: string) => {
    const n = name.trim().slice(0, 30);
    if (!n || state.axes.length >= 3 || state.axes.some((a) => a.toLowerCase() === n.toLowerCase())) return;
    set({ axes: [...state.axes, n] });
    setCustom("");
  };
  const removeAxis = (a: string) => {
    const axes = state.axes.filter((x) => x !== a);
    const seen = new Set<string>();
    const variants = state.variants
      .map((v) => {
        const options = { ...v.options };
        delete options[a];
        return { ...v, options };
      })
      .filter((v) => {
        const k = axes.map((x) => v.options[x]).join("|");
        if (v.hasSales) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const axisValues = { ...state.axisValues };
    delete axisValues[a];
    set({ axes, axisValues, variants });
    setSelected([]);
  };
  const lists = state.axes.map(values);
  const combos = lists.length && lists.every((l) => l.length) ? lists.reduce((n, l) => n * l.length, 1) : 0;
  const generate = () => {
    if (!combos) return;
    let all: Record<string, string>[] = [{}];
    state.axes.forEach((a, i) => {
      all = all.flatMap((c) => lists[i].map((v) => ({ ...c, [a]: v })));
    });
    const key = (o: Record<string, string>) => state.axes.map((a) => o[a]).join("|");
    const base = state.variants[0];
    const next = all.map(
      (c) =>
        state.variants.find((v) => key(v.options) === key(c)) ??
        ({
          sku: "",
          barcode: "",
          options: c,
          price: base?.price ?? 0,
          costPrice: base?.costPrice ?? null,
          lowStockThreshold: base?.lowStockThreshold ?? null,
          initialStock: 0,
        } as VariantState),
    );
    // Les variantes déjà vendues ne disparaissent jamais d'elles-mêmes.
    const kept = state.variants.filter((v) => v.hasSales && !next.includes(v));
    set({
      axisValues: Object.fromEntries(state.axes.map((a, i) => [a, lists[i].join(", ")])),
      variants: [...next, ...kept],
    });
    setSelected([]);
  };
  const patch = (i: number, p: Partial<VariantState>) =>
    set({ variants: state.variants.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  const targets = selected.length ? selected : state.variants.map((_, i) => i).filter((i) => !state.variants[i].off);
  const applyBulk = () => {
    const p: Partial<VariantState> = {};
    if (bulk.price.trim()) p.price = num(bulk.price) ?? 0;
    if (canCosts && bulk.cost.trim()) p.costPrice = num(bulk.cost) ?? null;
    if (bulk.threshold.trim()) p.lowStockThreshold = num(bulk.threshold) ?? null;
    const stock = bulk.stock.trim() ? (num(bulk.stock) ?? 0) : undefined;
    set({
      variants: state.variants.map((v, i) =>
        targets.includes(i) ? { ...v, ...p, ...(stock !== undefined && !v.id ? { initialStock: stock } : {}) } : v,
      ),
    });
    setBulk({ price: "", cost: "", stock: "", threshold: "" });
  };
  const proposed = state.variants.filter((v) => !v.off).length;
  const small = "field h-10 min-h-10 text-[14px] tabular";

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[14px] text-ink-soft">Jusqu&apos;à trois options. Laissez vide pour un article unique.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {AXIS_PRESETS.filter((a) => !state.axes.includes(a)).map((a) => (
            <button key={a} type="button" className="chip" disabled={state.axes.length >= 3} onClick={() => addAxis(a)}>
              <IconPlus size={14} /> {a}
            </button>
          ))}
        </div>
        <div className="mt-2 flex max-w-md gap-2">
          <input
            aria-label="Autre option (ex. Matière)"
            className="field h-10 min-h-10 min-w-0 flex-1"
            placeholder="Autre option (ex. Matière)"
            maxLength={30}
            value={custom}
            disabled={state.axes.length >= 3}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAxis(custom);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!custom.trim() || state.axes.length >= 3}
            onClick={() => addAxis(custom)}
          >
            Ajouter l&apos;option
          </button>
        </div>
      </div>

      {state.axes.length ? (
        <ul className="grid gap-3">
          {state.axes.map((a) => (
            <li key={a} className="rounded-[6px] border border-line bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{a}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAxis(a)}>
                  Retirer
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`Valeurs de ${a}`} role="list">
                {values(a).map((val) => (
                  <span
                    key={val}
                    role="listitem"
                    className="inline-flex items-center gap-1 rounded-full border border-ink/20 bg-card py-1 pr-1 pl-3 text-[14px] font-semibold"
                  >
                    {val}
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-paper-deep"
                      aria-label={`Retirer ${val}`}
                      onClick={() =>
                        setValues(
                          a,
                          values(a).filter((x) => x !== val),
                        )
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  aria-label={`Ajouter des valeurs pour ${a}`}
                  className="field h-10 min-h-10 min-w-0 flex-1"
                  placeholder="Tapez une valeur puis Entrée (ou plusieurs, séparées par des virgules)"
                  enterKeyHint="done"
                  value={typing[a] ?? ""}
                  onChange={(e) => {
                    const t = e.target.value;
                    if (t.endsWith(",")) addValues(a, t);
                    else setTyping((x) => ({ ...x, [a]: t }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addValues(a, typing[a] ?? "");
                    }
                  }}
                  onBlur={() => typing[a]?.trim() && addValues(a, typing[a])}
                />
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={!typing[a]?.trim()}
                  onClick={() => addValues(a, typing[a] ?? "")}
                >
                  Ajouter
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {state.axes.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-blue btn-sm" disabled={!combos} onClick={generate}>
            Générer {combos ? `les ${combos} combinaison${combos > 1 ? "s" : ""}` : "les combinaisons"}
          </button>
          <span className="text-[14px] text-ink-soft" aria-live="polite">
            {combos
              ? `${lists.map((l) => l.length).join(" × ")} = ${combos} combinaison${combos > 1 ? "s" : ""}`
              : "Ajoutez au moins une valeur à chaque option."}
          </span>
        </div>
      ) : null}

      {state.axes.length && state.variants.length ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <p className="font-bold" data-testid="variant-count">
              {state.variants.length} variante{state.variants.length > 1 ? "s" : ""} · {proposed} proposée
              {proposed > 1 ? "s" : ""}
            </p>
            <label className="flex min-h-10 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={selected.length > 0 && selected.length === state.variants.length}
                onChange={(e) => setSelected(e.target.checked ? state.variants.map((_, i) => i) : [])}
              />
              Tout sélectionner
            </label>
          </div>
          <fieldset className="rounded-[6px] border border-gps-blue/30 bg-gps-blue-soft/40 p-3">
            <legend className="px-1 text-[13px] font-bold">
              Modifier {selected.length ? `les ${selected.length} variantes sélectionnées` : "toutes les variantes"}
            </legend>
            <div className={`grid grid-cols-2 gap-2 ${canCosts ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <input
                aria-label="Prix pour la sélection"
                className={small}
                inputMode="numeric"
                placeholder="Prix"
                value={bulk.price}
                onChange={(e) => setBulk({ ...bulk, price: e.target.value })}
              />
              {canCosts ? (
                <input
                  aria-label="Coût pour la sélection"
                  className={small}
                  inputMode="numeric"
                  placeholder="Coût"
                  value={bulk.cost}
                  onChange={(e) => setBulk({ ...bulk, cost: e.target.value })}
                />
              ) : null}
              <input
                aria-label="Stock initial pour la sélection"
                className={small}
                inputMode="numeric"
                placeholder="Stock initial"
                value={bulk.stock}
                onChange={(e) => setBulk({ ...bulk, stock: e.target.value })}
              />
              <input
                aria-label="Seuil pour la sélection"
                className={small}
                inputMode="numeric"
                placeholder="Seuil d'alerte"
                value={bulk.threshold}
                onChange={(e) => setBulk({ ...bulk, threshold: e.target.value })}
              />
            </div>
            <button
              type="button"
              className="btn btn-blue btn-sm mt-2"
              disabled={!Object.values(bulk).some((x) => x.trim())}
              onClick={applyBulk}
            >
              {selected.length ? "Appliquer à la sélection" : "Appliquer à toutes"}
            </button>
          </fieldset>

          <ul className="grid gap-2" aria-label="Variantes">
            {state.variants.map((v, i) => {
              const name = label(state.axes, v, i);
              const errs = codeErrors(v);
              const incomplete = state.axes.some((a) => !v.options[a]?.trim());
              return (
                <li
                  key={v.id ?? `n${i}`}
                  className={`rounded-[6px] border p-3 ${v.off ? "border-dashed border-line bg-paper opacity-70" : "border-line bg-card"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${name}`}
                      checked={selected.includes(i)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))}
                    />
                    <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">{name}</span>
                    {v.hasSales ? <Badge>Déjà vendue</Badge> : null}
                    <label className="flex min-h-10 items-center gap-2 text-[13px] font-semibold">
                      <input
                        type="checkbox"
                        aria-label={`Proposer ${name}`}
                        checked={!v.off}
                        onChange={(e) => patch(i, { off: !e.target.checked })}
                      />
                      Proposée
                    </label>
                  </div>
                  {v.off ? (
                    <p className="mt-1 text-[13px] text-ink-mute">
                      Combinaison non proposée : {v.hasSales ? "désactivée" : "retirée"} à l&apos;enregistrement.
                    </p>
                  ) : (
                    <>
                      {incomplete ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {state.axes.map((a) => (
                            <input
                              key={a}
                              aria-label={`${a} de la variante ${i + 1}`}
                              placeholder={a}
                              className="field h-10 min-h-10 text-[14px]"
                              value={v.options[a] ?? ""}
                              onChange={(e) => patch(i, { options: { ...v.options, [a]: e.target.value } })}
                            />
                          ))}
                        </div>
                      ) : null}
                      <div className={`mt-2 grid grid-cols-2 gap-2 ${canCosts ? "md:grid-cols-6" : "md:grid-cols-5"}`}>
                        <div className="min-w-0">
                          <label className="text-[12px] font-bold text-ink-mute" htmlFor={`p-vprice-${i}`}>
                            Prix
                          </label>
                          <input
                            id={`p-vprice-${i}`}
                            aria-label={`Prix ${name}`}
                            className={small}
                            inputMode="numeric"
                            pattern="[0-9 ]*"
                            value={v.price || ""}
                            onChange={(e) => patch(i, { price: num(e.target.value) ?? 0 })}
                          />
                        </div>
                        {canCosts ? (
                          <div className="min-w-0">
                            <label className="text-[12px] font-bold text-ink-mute" htmlFor={`p-vcost-${i}`}>
                              Coût
                            </label>
                            <input
                              id={`p-vcost-${i}`}
                              aria-label={`Coût ${name}`}
                              className={small}
                              inputMode="numeric"
                              pattern="[0-9 ]*"
                              value={v.costPrice ?? ""}
                              onChange={(e) => patch(i, { costPrice: num(e.target.value) ?? null })}
                            />
                          </div>
                        ) : null}
                        <div className="min-w-0">
                          <label className="text-[12px] font-bold text-ink-mute" htmlFor={`p-vstock-${i}`}>
                            {v.id ? "Stock" : "Stock initial"}
                          </label>
                          {v.id ? (
                            <p className="flex h-10 items-center text-[14px] tabular">
                              {(v.onHand ?? 0) - (v.reserved ?? 0)} dispo.
                            </p>
                          ) : (
                            <input
                              id={`p-vstock-${i}`}
                              aria-label={`Stock initial ${name}`}
                              className={small}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="0"
                              value={v.initialStock || ""}
                              onChange={(e) => patch(i, { initialStock: num(e.target.value) ?? 0 })}
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <label className="text-[12px] font-bold text-ink-mute" htmlFor={`p-vthr-${i}`}>
                            Seuil
                          </label>
                          <input
                            id={`p-vthr-${i}`}
                            aria-label={`Seuil ${name}`}
                            className={small}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="—"
                            value={v.lowStockThreshold ?? ""}
                            onChange={(e) => patch(i, { lowStockThreshold: num(e.target.value) ?? null })}
                          />
                        </div>
                        <CodeFields
                          v={v}
                          i={i}
                          compact
                          suggestion={suggestSku(state.name, state.axes, v.options)}
                          errors={errs}
                          onChange={(p) => patch(i, p)}
                        />
                      </div>
                      <MarginLine m={margin(v)} />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="btn btn-outline btn-sm justify-self-start"
            onClick={() =>
              set({
                variants: [
                  ...state.variants,
                  { sku: "", barcode: "", options: {}, price: state.variants[0]?.price ?? 0, initialStock: 0 },
                ],
              })
            }
          >
            <IconPlus size={16} /> Ajouter une variante à la main
          </button>
        </>
      ) : null}
    </div>
  );
}

/** Photos et vidéos : appareil photo, plusieurs fichiers, progression, principale, ordre, texte alternatif. */
function MediaEditor({
  images,
  setImages,
  uploads,
  colorAxis,
  colorValues,
  videoMaxMb,
}: {
  images: ProductState["images"];
  setImages: (images: ProductState["images"]) => void;
  uploads: ReturnType<typeof useUploadQueue>;
  colorAxis?: string;
  colorValues: string[];
  videoMaxMb: number;
}) {
  // Glisser-déposer (ordinateur, souris) : complément des boutons Monter / Descendre, qui restent la voie principale.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const list = [...images];
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    setImages(list);
  };
  const edit = (i: number, p: Partial<ProductState["images"][number]>) =>
    setImages(images.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    uploads.add(e.target.files);
    e.target.value = "";
  };
  const tile = "btn btn-outline btn-sm cursor-pointer focus-within:outline-3 focus-within:outline-gps-blue";

  return (
    <fieldset className="min-w-0">
      <legend className="label">Photos et vidéos</legend>
      <div className="flex flex-wrap gap-2">
        <label className={`${tile} [@media(pointer:fine)]:hidden`}>
          <IconImage size={16} /> Prendre une photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
        </label>
        <label className={tile}>
          <IconUpload size={16} /> Choisir des photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            onChange={pick}
            data-testid="media-input"
          />
        </label>
        <label className={`${tile} [@media(pointer:fine)]:hidden`}>
          Filmer une vidéo
          <input type="file" accept="video/*" capture="environment" className="sr-only" onChange={pick} />
        </label>
      </div>
      <p className="hint">
        Plusieurs fichiers à la fois · photos réduites automatiquement · vidéo MP4, MOV ou WebM jusqu&apos;à{" "}
        {videoMaxMb} Mo. La saisie continue pendant l&apos;envoi.
      </p>
      <UploadList items={uploads.items} retry={uploads.retry} dismiss={uploads.dismiss} />

      {images.length ? (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {images.map((img, i) => (
            <li
              key={img.url + i}
              data-testid="media-item"
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== i) setDragOver(i);
              }}
              onDragLeave={() => setDragOver((x) => (x === i ? null : x))}
              onDrop={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                move(dragFrom, i);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={`grid content-start gap-2 rounded-[6px] border bg-card p-2 ${
                dragOver === i && dragFrom !== i ? "border-gps-blue ring-2 ring-gps-blue/30" : "border-line"
              } ${dragFrom === i ? "opacity-50" : ""}`}
            >
              <div className="relative">
                {img.kind === "video" ? (
                  <video
                    src={img.url}
                    muted
                    playsInline
                    controls
                    preload="metadata"
                    className="aspect-[4/5] w-full rounded-[4px] bg-ink object-cover"
                  />
                ) : (
                  <Image
                    src={img.url}
                    alt=""
                    width={240}
                    height={300}
                    unoptimized={img.url.endsWith(".svg") || img.url.startsWith("/media/")}
                    className="aspect-[4/5] w-full rounded-[4px] object-cover"
                  />
                )}
                <span className="absolute top-1 left-1 rounded-[3px] bg-ink/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {img.kind === "video" ? "Vidéo" : i === 0 ? "Principale" : `Photo ${i + 1}`}
                </span>
                <span
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(i));
                    setDragFrom(i);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  title="Glisser pour déplacer"
                  aria-hidden="true"
                  data-testid="media-grip"
                  className="absolute top-1 right-1 hidden h-8 w-8 cursor-grab items-center justify-center rounded-[4px] bg-card/90 text-ink-mute active:cursor-grabbing [@media(pointer:fine)]:flex"
                >
                  <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
                    {[3, 10, 17].map((y) => (
                      <g key={y}>
                        <circle cx="3" cy={y} r="1.6" />
                        <circle cx="9" cy={y} r="1.6" />
                      </g>
                    ))}
                  </svg>
                </span>
              </div>
              <input
                aria-label={`Texte alternatif de la photo ${i + 1}`}
                className="field h-10 min-h-10 text-[13px]"
                placeholder="Texte alternatif (facultatif)"
                value={img.alt}
                onChange={(e) => edit(i, { alt: e.target.value })}
              />
              {colorAxis && colorValues.length ? (
                <select
                  aria-label={`${colorAxis} de la photo ${i + 1}`}
                  className="field h-10 min-h-10 py-0 text-[13px]"
                  value={img.color ?? ""}
                  onChange={(e) => edit(i, { color: e.target.value || null })}
                >
                  <option value="">Toutes les {colorAxis.toLowerCase()}s</option>
                  {colorValues.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              ) : null}
              {i > 0 && img.kind !== "video" ? (
                <button
                  type="button"
                  className="min-h-9 justify-self-start text-[13px] font-semibold text-gps-blue underline underline-offset-2"
                  onClick={() => move(i, 0)}
                >
                  Définir comme photo principale
                </button>
              ) : null}
              <div className="flex justify-between gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-2"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`Monter la photo ${i + 1}`}
                >
                  <IconUp size={18} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-2"
                  disabled={i === images.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Descendre la photo ${i + 1}`}
                >
                  <IconDown size={18} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-2 text-gps-red-ink"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  aria-label={`Retirer la photo ${i + 1}`}
                >
                  <IconTrash size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            uploads.add(e.dataTransfer.files);
          }}
          className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-line bg-white p-4 text-center focus-within:border-gps-blue hover:border-gps-blue"
        >
          <IconUpload />
          <span className="font-bold">{uploads.busy ? "Envoi en cours…" : "Déposez ou choisissez vos photos"}</span>
          <span className="text-[13px] text-ink-mute">
            Format vertical 4:5 conseillé · la première photo devient la photo principale
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            onChange={pick}
          />
        </label>
      )}
    </fieldset>
  );
}

function SecondaryActions({ id, hasSales }: { id: string; hasSales: boolean }) {
  const router = useRouter();
  const { run, pending, failure, success } = useAction();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/comptoir/catalogue/nouveau?modele=${id}`} className="btn btn-outline btn-sm">
          Dupliquer
        </Link>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={pending}
          onClick={() => {
            const msg = hasSales
              ? "Mettre ce produit à la corbeille ? Il sera retiré du site et de la vente ; déjà vendu, il ne pourra pas être supprimé définitivement."
              : "Mettre ce produit à la corbeille ? Il sera retiré du site et de la vente, et restera restaurable.";
            if (confirm(msg))
              run(() => trashProductAction(id), {
                refresh: false,
                onSuccess: () => router.push("/comptoir/catalogue?statut=corbeille"),
              });
          }}
        >
          Mettre à la corbeille
        </button>
      </div>
      <p className="hint mt-2">
        Dupliquer ouvre une nouvelle fiche avec les mêmes réglages, sans nom, références, code-barres, photos ni stock.
      </p>
      <div className="mt-3">
        <ActionFeedback failure={failure} success={success} />
      </div>
    </div>
  );
}
