"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  checkCodesAction,
  saveCategoryAction,
  saveProductAction,
  similarProductsAction,
  trashProductAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { publicationHints, publicationIssues } from "@/lib/publication";
import { fcfa, formatDateTime, slugify } from "@/lib/format";
import { normalizeBarcode, suggestSku } from "@/lib/sku";
import {
  NAME_ADVICE_LENGTH,
  nameWarnings,
  completeness,
  composeDescription,
  entryHints,
  hasDetails,
  sectionStatusLabels,
  suggestName,
  templateFor,
  type CategoryProfile,
  type PhotoCandidate,
  type ProductDetails,
  type QuickValues,
} from "@/lib/product-kit";
import type { SimilarProduct } from "@/server/domain/catalog-entry";
import { ActionFeedback, useAction } from "./useAction";
import { useUploadQueue } from "./UploadQueue";
import {
  COLOR_AXES,
  CodeFields,
  MarginLine,
  MediaEditor,
  QuickChips,
  Step,
  VariantEditor,
  num,
  type ImageState,
  type Margin,
  type VariantState,
} from "./ProductFormParts";
import { Badge } from "./ui";
import { IconAlert, IconCheck, IconImage, IconList, IconPlus, IconTrash } from "../ui/icons";

export interface SpecState {
  label: string;
  value: string;
  unit?: string;
  private?: boolean;
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
  /** Modèle exact, séparé du nom public. */
  model: string;
  categoryId: string | null;
  description: string;
  details: ProductDetails;
  specs: SpecState[];
  condition: string | null;
  warranty: string;
  axes: string[];
  axisValues: Record<string, string>;
  images: ImageState[];
  variants: VariantState[];
  status: "draft" | "published" | "archived";
  featured: boolean;
  hasSales?: boolean;
  publishAt?: string | null;
  unpublishAt?: string | null;
}

/** Ce que l'on garde d'un produit au suivant (choisi par la personne, mémorisé sur l'appareil). */
interface Serie {
  keep: Record<"category" | "brand" | "warranty" | "condition" | "threshold" | "specs" | "status", boolean>;
  values: Pick<ProductState, "categoryId" | "brand" | "warranty" | "condition" | "status"> & {
    threshold: number | null;
    specs: SpecState[];
  };
}
const keepLabels: [keyof Serie["keep"], string][] = [
  ["category", "Catégorie"],
  ["brand", "Marque"],
  ["warranty", "Garantie"],
  ["condition", "État"],
  ["threshold", "Seuil de stock faible"],
  ["specs", "Caractéristiques communes"],
  ["status", "Mode de publication"],
];
const defaultKeep: Serie["keep"] = {
  category: true,
  brand: false,
  warranty: false,
  condition: false,
  threshold: false,
  specs: false,
  status: false,
};

const SERIE_KEY = "gps-serie-v2";
const RECENT_KEY = "gps-categories-recentes";
const CONDITIONS = ["Neuf", "Reconditionné — très bon état", "Reconditionné — bon état", "Occasion"];

function snapshot(s: ProductState) {
  const { updatedAt: _u, ...rest } = s;
  void _u;
  return JSON.stringify(rest);
}
const noop = () => () => {};
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

function blankProduct(serie: Serie | null, categories: { id: string }[]): ProductState {
  const k = serie?.keep ?? defaultKeep;
  const v = serie?.values;
  return {
    createId: crypto.randomUUID(),
    name: "",
    brand: k.brand ? (v?.brand ?? "") : "",
    model: "",
    categoryId: k.category && v?.categoryId && categories.some((c) => c.id === v.categoryId) ? v.categoryId : null,
    description: "",
    details: {},
    specs: k.specs ? (v?.specs ?? []) : [],
    condition: k.condition ? (v?.condition ?? null) : null,
    warranty: k.warranty ? (v?.warranty ?? "") : "",
    axes: [],
    axisValues: {},
    images: [],
    variants: [
      {
        sku: "",
        barcode: "",
        options: {},
        price: 0,
        initialStock: 0,
        lowStockThreshold: k.threshold ? (v?.threshold ?? null) : null,
      },
    ],
    status: k.status && v?.status === "published" ? "published" : "draft",
    featured: false,
  };
}

const desktopQuery = "(min-width: 1024px)";
function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(desktopQuery);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(desktopQuery).matches,
    () => true,
  );
}

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

const STEPS = [
  ["photos", "Photos"],
  ["identity", "Identité"],
  ["pricing", "Prix et stock"],
  ["details", "Caractéristiques et variantes"],
  ["review", "Vérification"],
] as const;

function ProductForm({
  initial: given,
  categories: initialCategories,
  canCosts,
  videoMaxMb = 4,
  userId,
  quickValues,
  specLabels = {},
  modelHint,
  photoCandidates = [],
  completion,
}: {
  initial?: ProductState;
  categories: { id: string; name: string; profile?: CategoryProfile | null }[];
  canCosts: boolean;
  videoMaxMb?: number;
  /** Mode d'affichage mémorisé pour chaque utilisateur. */
  userId: string;
  quickValues: QuickValues;
  /** Caractéristiques déjà utilisées par catégorie, proposées pour les fiches suivantes. */
  specLabels?: Record<string, string[]>;
  /** Modèle relevé lors de l'import, à confirmer. */
  modelHint?: string;
  photoCandidates?: PhotoCandidate[];
  /** Parcours « Produits à compléter » : produit suivant. */
  completion?: { nextHref: string | null; position: string; listHref: string } | null;
}) {
  const router = useRouter();
  const desktop = useDesktop();
  const editing = !!given?.id;
  const [initial] = useState<ProductState>(() => given ?? blankProduct(readJson<Serie>(SERIE_KEY), initialCategories));
  const draftKey = `gps-produit-${initial.id ?? "nouveau"}`;
  const modeKey = `gps-mode-produit-${userId}`;
  const [state, setState] = useState<ProductState>(initial);
  const [categories, setCategories] = useState(initialCategories);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [catQuery, setCatQuery] = useState("");
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY) ?? []);
  const catAction = useAction();
  const [saved, setSaved] = useState(() => snapshot(initial));
  const [mode, setModeState] = useState<"rapide" | "complet">(() =>
    readJson<string>(modeKey) === "complet" ? "complet" : "rapide",
  );
  const full = mode === "complet";
  const setMode = (m: "rapide" | "complet") => {
    setModeState(m);
    writeJson(modeKey, m);
  };
  const [keep, setKeep] = useState<Serie["keep"]>(() => readJson<Serie>(SERIE_KEY)?.keep ?? defaultKeep);
  const [series, setSeries] = useState<{
    count: number;
    last: { id: string; name: string; published: boolean } | null;
  }>({ count: 0, last: null });
  const [open, setOpen] = useState(0);
  const [multi, setMulti] = useState(() => initial.axes.length > 0);
  const [clashes, setClashes] = useState<{ skus: Record<string, string>; barcodes: Record<string, string> }>({
    skus: {},
    barcodes: {},
  });
  const [similar, setSimilar] = useState<{ name: string; items: SimilarProduct[] }>({ name: "", items: [] });
  const [dismissed, setDismissed] = useState("");
  const [compare, setCompare] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [localDraft, setLocalDraft] = useState<ProductState | null>(() => {
    const d = readJson<ProductState & { savedFor?: string }>(draftKey);
    return d && d.savedFor === (initial.updatedAt ?? "") && snapshot(d) !== snapshot(initial)
      ? { ...initial, ...d }
      : null;
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
  const category = categories.find((c) => c.id === state.categoryId) ?? null;
  const template = templateFor(category?.name, category?.profile);
  const description = hasDetails(state.details) ? composeDescription(state.details) : state.description;
  const checkInput = { ...state, description, variants: active };
  const issues = publicationIssues(checkInput);
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

  // Produit peut-être déjà saisi : recherche pendant la saisie du nom (jamais de fusion automatique).
  const nameForSimilar = state.name.trim();
  useEffect(() => {
    if (nameForSimilar.split(/\s+/).length < 2) return;
    let stale = false;
    const t = setTimeout(async () => {
      const r = await similarProductsAction(nameForSimilar, state.id ?? null).catch(() => null);
      if (!stale && r?.ok) setSimilar({ name: nameForSimilar, items: r.data });
    }, 700);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [nameForSimilar, state.id]);
  const similarItems =
    similar.name === nameForSimilar && dismissed !== nameForSimilar && nameForSimilar.split(/\s+/).length >= 2
      ? similar.items
      : [];

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
  const publishBlockers = [...issues, ...(uploads.busy ? ["Un média est en cours d'envoi."] : []), ...codeProblems];
  const kit = {
    ...checkInput,
    model: state.model,
    warranty: state.warranty,
    uploading: uploads.busy,
    codeErrors: codeProblems.length,
  };
  const comp = completeness(kit, { canCosts, blocking: publishBlockers.length });
  const hints = [...publicationHints(checkInput), ...entryHints(kit, { canCosts })];

  const suggestion = suggestName({
    categoryName: category?.name ?? null,
    profile: category?.profile,
    brand: state.brand,
    model: state.model,
    specs: state.specs,
  });

  const save = (after: "stay" | "next" | "list" | "following") => {
    if (pending || blocker) return;
    const status = state.status;
    const payload = {
      id: state.id,
      createId: state.id ? undefined : state.createId,
      expectedUpdatedAt: state.updatedAt,
      name: state.name,
      slug: state.slug?.trim() ? slugify(state.slug) : undefined,
      brand: state.brand,
      model: state.model,
      details: state.details,
      categoryId: state.categoryId,
      description,
      specs: state.specs
        .filter((s) => s.label.trim() && s.value.trim())
        .map((s) => ({
          label: s.label.trim(),
          value: s.value.trim(),
          ...(s.unit?.trim() ? { unit: s.unit.trim() } : {}),
          ...(s.private ? { private: true } : {}),
        })),
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
      keep,
      values: {
        categoryId: state.categoryId,
        brand: state.brand,
        warranty: state.warranty,
        condition: state.condition,
        status: status === "published" ? "published" : "draft",
        threshold: single ? (v0?.lowStockThreshold ?? null) : null,
        specs: state.specs.filter((s) => s.value.trim()),
      },
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
        } catch {}
        writeJson(SERIE_KEY, serie);
        if (state.categoryId) {
          const nextRecent = [state.categoryId, ...recent.filter((x) => x !== state.categoryId)].slice(0, 4);
          setRecent(nextRecent);
          writeJson(RECENT_KEY, nextRecent);
        }
        if (after === "following" && completion) {
          setSaved(snapshot(state));
          router.push(completion.nextHref ?? completion.listHref);
          return;
        }
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
          setMulti(false);
          setOpen(0);
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
  const specValue = (label: string) => state.specs.find((s) => s.label === label)?.value ?? "";
  const setSpec = (label: string, value: string) =>
    setState((s) => {
      const exists = s.specs.some((x) => x.label === label);
      return {
        ...s,
        specs: exists
          ? s.specs.map((x) => (x.label === label ? { ...x, value } : x)).filter((x) => x.label !== label || x.value)
          : value
            ? [...s.specs, { label, value }]
            : s.specs,
      };
    });
  const templateLabels = new Set(template.fields.filter((f) => !f.target).map((f) => f.label));
  const customSpecs = state.specs.map((s, i) => ({ s, i })).filter(({ s }) => !templateLabels.has(s.label));
  const reusable = (state.categoryId ? (specLabels[state.categoryId] ?? []) : []).filter(
    (l) => !templateLabels.has(l) && !state.specs.some((s) => s.label === l),
  );

  const prices = active.map((v) => v.price).filter((p) => p > 0);
  const priceText = prices.length
    ? Math.min(...prices) === Math.max(...prices)
      ? fcfa(prices[0])
      : `${fcfa(Math.min(...prices))} – ${fcfa(Math.max(...prices))}`
    : "Prix à saisir";
  const units = (v: VariantState) => (v.id ? (v.onHand ?? 0) - (v.reserved ?? 0) : (v.initialStock ?? 0));
  const stockTotal = active.reduce((n, v) => n + units(v), 0);
  const cover = state.images.find((i) => (i.kind ?? "image") === "image");
  const margin = (v: VariantState): Margin =>
    canCosts && v.price > 0 && v.costPrice != null
      ? { value: v.price - v.costPrice, pct: (v.price - v.costPrice) / v.price }
      : null;
  const stockAtCost = canCosts ? active.reduce((n, v) => n + units(v) * (v.costPrice ?? 0), 0) : 0;
  const stockAtPrice = active.reduce((n, v) => n + units(v) * v.price, 0);
  const thresholdAlert = active.some(
    (v) => v.lowStockThreshold != null && v.lowStockThreshold > 0 && v.lowStockThreshold > units(v),
  );

  const expanded = (i: number) => desktop || open === i;
  const goNext = (i: number) => {
    setOpen(i + 1);
    setTimeout(() => document.getElementById(`etape-${STEPS[i + 1][0]}`)?.scrollIntoView({ block: "start" }), 30);
  };
  const nextButton = (i: number) =>
    !desktop && i < STEPS.length - 1 ? (
      <button type="button" className="btn btn-outline justify-self-end" onClick={() => goNext(i)}>
        Suivant : {STEPS[i + 1][1]}
      </button>
    ) : null;
  const status = (k: (typeof STEPS)[number][0]) => comp.sections[k];
  const label = (k: (typeof STEPS)[number][0]) =>
    k === "review" && !publishBlockers.length ? "Prêt à publier" : sectionStatusLabels[comp.sections[k]];

  const visibleCategories = catQuery.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(catQuery.trim().toLowerCase()))
    : categories;

  return (
    <div
      className="pb-32"
      onFocusCapture={(e) => {
        // Téléphone : le champ actif reste visible au-dessus du clavier et de la barre d'enregistrement.
        const t = e.target as HTMLElement;
        // Sauf les champs masqués (fichiers, choix) : les recentrer ferait sauter la page hors du cadre d'envoi.
        const hidden = t instanceof HTMLInputElement && ["file", "radio", "checkbox"].includes(t.type);
        if (!desktop && !hidden && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
          setTimeout(() => t.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
        }
      }}
    >
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
            Produit enregistré. La fiche suivante est prête.{" "}
            <span className="font-normal text-ink-soft">
              « {series.last.name} » enregistré {series.last.published ? "et publié" : "en brouillon"}. {series.count}{" "}
              produit{series.count > 1 ? "s" : ""} saisi{series.count > 1 ? "s" : ""} à la suite.
            </span>
          </p>
          <Link href={`/comptoir/catalogue/${series.last.id}`} className="font-bold text-gps-blue underline">
            Ouvrir la fiche
          </Link>
        </div>
      ) : null}

      {completion ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[6px] border-[1.5px] border-gps-blue/40 bg-gps-blue-soft p-3 text-[14px]">
          <span className="font-bold text-gps-blue">Produits à compléter · {completion.position}</span>
          <Link href={completion.listHref} className="font-semibold underline">
            Revenir à la liste
          </Link>
        </div>
      ) : null}

      {/* Mode d'affichage et avancement */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border-[1.5px] border-ink p-0.5" role="radiogroup" aria-label="Mode">
          {(
            [
              ["rapide", "Mode rapide"],
              ["complet", "Mode complet"],
            ] as const
          ).map(([m, l]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-10 rounded-full px-4 text-[14px] font-bold ${mode === m ? "bg-ink text-white" : "text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-[14px] font-bold" data-testid="progression">
            Fiche complétée à {comp.percent} %
          </p>
          <span className="mt-1 block h-2 max-w-sm overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
            <span className="block h-full bg-wa transition-[width]" style={{ width: `${comp.percent}%` }} />
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid content-start gap-3">
          {/* 1. Photos */}
          <Step
            id="etape-photos"
            n={1}
            title="Photos du produit"
            status={status("photos")}
            statusLabel={label("photos")}
            open={expanded(0)}
            onOpen={() => setOpen(0)}
            footer={nextButton(0)}
          >
            <MediaEditor
              images={state.images}
              setImages={(images) => set({ images })}
              uploads={uploads}
              colorAxis={colorAxis}
              colorValues={colorValues}
              videoMaxMb={videoMaxMb}
              productLabel={[state.brand, state.model].filter(Boolean).join(" ")}
              candidates={photoCandidates}
            />
          </Step>

          {/* 2. Identité */}
          <Step
            id="etape-identity"
            n={2}
            title="Identité"
            status={status("identity")}
            statusLabel={label("identity")}
            open={expanded(1)}
            onOpen={() => setOpen(1)}
            footer={nextButton(1)}
          >
            <div>
              <label className="label" htmlFor="p-name">
                Nom public
              </label>
              <input
                id="p-name"
                ref={nameRef}
                className="field"
                autoFocus={!editing && desktop}
                autoComplete="off"
                enterKeyHint="next"
                maxLength={120}
                placeholder="Ex. Batterie externe Oraimo 60 000 mAh"
                value={state.name}
                onChange={(e) => set({ name: e.target.value })}
              />
              <p className={`hint ${state.name.length > NAME_ADVICE_LENGTH ? "!text-warn" : ""}`}>
                {state.name.length > NAME_ADVICE_LENGTH
                  ? `${state.name.length} caractères : un nom plus court se lit mieux (≈ ${NAME_ADVICE_LENGTH} conseillés).`
                  : "Type + marque + modèle + une caractéristique utile. Pas de slogan, pas de « Original » sans preuve."}
              </p>
              {nameWarnings(state.name).map((w) => (
                <p key={w} className="hint !text-warn" data-testid="name-warning">
                  {w}
                </p>
              ))}
              {suggestion && suggestion !== state.name.trim() ? (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="text-ink-mute">Suggestion :</span>
                  <strong data-testid="name-suggestion">{suggestion}</strong>
                  <button
                    type="button"
                    className="min-h-9 font-semibold text-gps-blue underline"
                    onClick={() => set({ name: suggestion })}
                  >
                    Utiliser
                  </button>
                </p>
              ) : null}
              {similarItems.length ? (
                <div
                  className="mt-2 rounded-[6px] border-[1.5px] border-warn/40 bg-warn-soft p-3 text-[14px]"
                  role="status"
                >
                  <p className="font-bold text-warn">Un produit similaire existe peut-être.</p>
                  <ul className="mt-1 grid gap-2">
                    {similarItems.map((p) => (
                      <li key={p.id} className="grid gap-1">
                        <span className="font-semibold">
                          {p.name}{" "}
                          <Badge>
                            {p.status === "published" ? "En ligne" : p.status === "draft" ? "Brouillon" : "Archivé"}
                          </Badge>
                        </span>
                        <span className="flex flex-wrap gap-x-3 gap-y-1">
                          <a
                            href={`/comptoir/catalogue/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="underline"
                          >
                            Voir le produit
                          </a>
                          <Link href={`/comptoir/catalogue/${p.id}`} className="underline">
                            Modifier l&apos;existant
                          </Link>
                          <button
                            type="button"
                            className="underline"
                            onClick={() => setCompare(compare === p.id ? null : p.id)}
                          >
                            Comparer
                          </button>
                        </span>
                        {compare === p.id ? (
                          <dl className="grid grid-cols-2 gap-x-3 rounded-[4px] bg-card p-2 text-[13px]">
                            <dt className="text-ink-mute">Catégorie</dt>
                            <dd>{p.category ?? "—"}</dd>
                            <dt className="text-ink-mute">Marque · modèle</dt>
                            <dd>{[p.brand, p.model].filter(Boolean).join(" · ") || "—"}</dd>
                            <dt className="text-ink-mute">Variantes</dt>
                            <dd>{p.variants}</dd>
                            <dt className="text-ink-mute">Prix</dt>
                            <dd>{p.minPrice ? fcfa(p.minPrice) : "non saisi"}</dd>
                          </dl>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-2 min-h-9 font-semibold text-gps-blue underline"
                    onClick={() => setDismissed(nameForSimilar)}
                  >
                    Continuer quand même
                  </button>
                </div>
              ) : null}
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
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {state.categoryId && !visibleCategories.some((c) => c.id === state.categoryId) && category ? (
                  <option value={category.id}>{category.name}</option>
                ) : null}
              </select>
              {categories.length > 6 ? (
                <input
                  aria-label="Rechercher une catégorie"
                  className="field mt-2 h-10 min-h-10 text-[14px]"
                  placeholder="Rechercher une catégorie…"
                  value={catQuery}
                  onChange={(e) => {
                    setCatQuery(e.target.value);
                    const hits = categories.filter((c) =>
                      c.name.toLowerCase().includes(e.target.value.trim().toLowerCase()),
                    );
                    if (e.target.value.trim() && hits.length === 1) set({ categoryId: hits[0].id });
                  }}
                />
              ) : null}
              {recent.some((id) => categories.some((c) => c.id === id)) ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="text-ink-mute">Récentes :</span>
                  {recent
                    .map((id) => categories.find((c) => c.id === id))
                    .filter((c): c is { id: string; name: string } => !!c)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`min-h-9 rounded-full border px-3 font-semibold ${state.categoryId === c.id ? "border-gps-blue bg-gps-blue text-white" : "border-line bg-card"}`}
                        onClick={() => set({ categoryId: c.id })}
                      >
                        {c.name}
                      </button>
                    ))}
                </div>
              ) : null}
              {newCat === null ? (
                <button
                  type="button"
                  className="mt-1 min-h-9 text-[13px] font-semibold text-gps-blue underline underline-offset-2"
                  onClick={() => setNewCat("")}
                >
                  + Créer une catégorie
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

            {full ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="p-brand">
                    Marque
                  </label>
                  <input
                    id="p-brand"
                    className="field"
                    maxLength={60}
                    value={state.brand}
                    onChange={(e) => set({ brand: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="p-model">
                    Modèle exact
                  </label>
                  <input
                    id="p-model"
                    className="field font-mono"
                    maxLength={80}
                    placeholder="Tel qu'écrit sur la boîte"
                    value={state.model}
                    onChange={(e) => set({ model: e.target.value })}
                  />
                  {modelHint && !state.model ? (
                    <p className="hint">
                      Relevé en boutique : « {modelHint} » —{" "}
                      <button
                        type="button"
                        className="font-semibold text-gps-blue underline"
                        onClick={() => set({ model: modelHint })}
                      >
                        utiliser après vérification sur la boîte
                      </button>
                    </p>
                  ) : (
                    <p className="hint">Jamais traduit ni modifié : il sert à identifier le produit exact.</p>
                  )}
                </div>
              </div>
            ) : null}

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
              {state.status === "published" && publishBlockers.length ? (
                <div className="mt-2 rounded-[6px] border border-gps-red/30 bg-gps-red-soft p-3 text-[14px]">
                  <p className="font-bold text-gps-red-ink">Pour publier, il manque :</p>
                  <ul className="mt-1 grid gap-0.5 text-gps-red-ink">
                    {publishBlockers.map((i) => (
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
          </Step>

          {/* 3. Prix et stock */}
          <Step
            id="etape-pricing"
            n={3}
            title="Prix et stock"
            status={status("pricing")}
            statusLabel={label("pricing")}
            open={expanded(2)}
            onOpen={() => setOpen(2)}
            footer={nextButton(2)}
          >
            {single && v0 ? (
              <>
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
                          <strong>{units(v0)}</strong> disponible{units(v0) > 1 ? "s" : ""}
                          <Link
                            href={`/comptoir/stock/comptage?q=${encodeURIComponent(v0.sku)}`}
                            className="text-[13px] font-semibold text-gps-blue underline"
                          >
                            Compter
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
                {full ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
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
                  </div>
                ) : null}
                {full ? <MarginLine m={margin(v0)} /> : null}
              </>
            ) : (
              <p className="rounded-[6px] bg-paper-deep px-3 py-2 text-[14px]">
                <strong>
                  {active.length} variante{active.length > 1 ? "s" : ""}
                </strong>{" "}
                · {priceText} · prix et stock de chaque version dans « Caractéristiques et variantes ».
              </p>
            )}
            {full && canCosts && (stockAtCost || stockAtPrice) ? (
              <dl className="grid grid-cols-2 gap-2 text-[14px]" data-testid="valeurs-stock">
                <div className="rounded-[6px] bg-paper-deep p-2">
                  <dt className="text-ink-mute">Valeur du stock au coût</dt>
                  <dd className="font-bold tabular">{fcfa(stockAtCost)}</dd>
                </div>
                <div className="rounded-[6px] bg-paper-deep p-2">
                  <dt className="text-ink-mute">Valeur potentielle à la vente</dt>
                  <dd className="font-bold tabular">{fcfa(stockAtPrice)}</dd>
                </div>
              </dl>
            ) : null}
            {thresholdAlert ? (
              <p className="flex items-center gap-1.5 text-[14px] font-semibold text-warn">
                <IconAlert size={16} /> Seuil d&apos;alerte supérieur au stock : l&apos;alerte de stock faible sera
                active.
              </p>
            ) : null}
            <p className="hint">
              Un seul stock pour toute l&apos;entreprise, partagé par les deux points de vente. Aucun prix n&apos;est
              proposé automatiquement.
            </p>
          </Step>

          {/* 4. Caractéristiques et variantes */}
          <Step
            id="etape-details"
            n={4}
            title="Caractéristiques et variantes"
            status={status("details")}
            statusLabel={label("details")}
            open={expanded(3)}
            onOpen={() => setOpen(3)}
            footer={nextButton(3)}
          >
            <fieldset>
              <legend className="label">Ce produit existe-t-il en plusieurs versions ?</legend>
              <div className="grid max-w-sm grid-cols-2 gap-2">
                {(
                  [
                    [false, "Non"],
                    [true, "Oui"],
                  ] as const
                ).map(([v, l]) => (
                  <label
                    key={l}
                    className={`flex min-h-12 cursor-pointer items-center justify-center rounded-[6px] border-[1.5px] font-bold focus-within:outline-3 focus-within:outline-gps-blue ${
                      multi === v ? "border-ink bg-paper-deep" : "border-line bg-card"
                    }`}
                  >
                    <input
                      type="radio"
                      name="p-multi"
                      className="sr-only"
                      checked={multi === v}
                      disabled={!v && state.axes.length > 0}
                      onChange={() => setMulti(v)}
                    />
                    {l}
                  </label>
                ))}
              </div>
              {!multi ? null : state.axes.length === 0 ? (
                <p className="hint">Couleur, stockage, taille… : chaque combinaison aura son prix et son stock.</p>
              ) : null}
            </fieldset>
            {multi ? (
              <VariantEditor
                name={state.name}
                presets={template.variantAxes}
                axes={state.axes}
                axisValues={state.axisValues}
                variants={state.variants}
                images={state.images}
                set={(p) => set(p)}
                canCosts={canCosts}
                full={full}
                codeErrors={codeErrors}
                margin={margin}
              />
            ) : null}

            {full ? (
              <>
                <fieldset className="border-t border-line pt-4">
                  <legend className="text-[14.5px] font-extrabold tracking-wide uppercase">
                    Caractéristiques{category ? ` · ${category.name}` : ""}
                  </legend>
                  {!category ? (
                    <p className="hint">Choisissez une catégorie pour afficher les caractéristiques utiles.</p>
                  ) : null}
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {template.fields
                      .filter((f) => f.target !== "brand" && f.target !== "model")
                      .map((f) => {
                        const id = `p-spec-${slugify(f.label)}`;
                        const value =
                          f.target === "condition"
                            ? (state.condition ?? "")
                            : f.target === "warranty"
                              ? state.warranty
                              : specValue(f.label);
                        const change = (v: string) =>
                          f.target === "condition"
                            ? set({ condition: v || null })
                            : f.target === "warranty"
                              ? set({ warranty: v })
                              : setSpec(f.label, v);
                        const choices = f.quick ? quickValues[f.quick] : (f.options ?? []);
                        return (
                          <div key={f.label} className="min-w-0">
                            <label className="label" htmlFor={id}>
                              {f.label}
                            </label>
                            <input
                              id={id}
                              className="field"
                              maxLength={200}
                              placeholder={f.placeholder}
                              value={value}
                              list={f.target === "condition" ? "p-conditions" : undefined}
                              onChange={(e) => change(e.target.value)}
                            />
                            <QuickChips values={choices} current={value} onPick={change} label={f.label} />
                          </div>
                        );
                      })}
                    <datalist id="p-conditions">
                      {CONDITIONS.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  {customSpecs.length ? (
                    <ul className="mt-3 grid gap-2" aria-label="Caractéristiques personnalisées">
                      {customSpecs.map(({ s, i }) => (
                        <li
                          key={i}
                          className="grid grid-cols-2 gap-2 rounded-[6px] border border-line p-2 sm:grid-cols-[1fr_1.3fr_90px_auto_auto]"
                        >
                          <input
                            aria-label={`Nom de la caractéristique ${i + 1}`}
                            className="field h-10 min-h-10 text-[14px]"
                            placeholder="Nom"
                            value={s.label}
                            onChange={(e) =>
                              set({ specs: state.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })
                            }
                          />
                          <input
                            aria-label={`Valeur de la caractéristique ${i + 1}`}
                            className="field h-10 min-h-10 text-[14px]"
                            placeholder="Valeur"
                            value={s.value}
                            onChange={(e) =>
                              set({ specs: state.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })
                            }
                          />
                          <input
                            aria-label={`Unité de la caractéristique ${i + 1}`}
                            className="field h-10 min-h-10 text-[14px]"
                            placeholder="Unité"
                            maxLength={20}
                            value={s.unit ?? ""}
                            onChange={(e) =>
                              set({ specs: state.specs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })
                            }
                          />
                          <label className="flex min-h-10 items-center gap-2 text-[13px]">
                            <input
                              type="checkbox"
                              checked={!!s.private}
                              onChange={(e) =>
                                set({
                                  specs: state.specs.map((x, j) => (j === i ? { ...x, private: e.target.checked } : x)),
                                })
                              }
                            />
                            Privée
                          </label>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm px-2"
                            aria-label={`Supprimer la caractéristique ${i + 1}`}
                            onClick={() => set({ specs: state.specs.filter((_, j) => j !== i) })}
                          >
                            <IconTrash size={18} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => set({ specs: [...state.specs, { label: "", value: "" }] })}
                    >
                      <IconPlus size={16} /> Ajouter une caractéristique
                    </button>
                    {reusable.map((l) => (
                      <button
                        key={l}
                        type="button"
                        className="chip"
                        onClick={() => set({ specs: [...state.specs, { label: l, value: "" }] })}
                      >
                        <IconPlus size={14} /> {l}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="grid gap-3 border-t border-line pt-4">
                  <legend className="text-[14.5px] font-extrabold tracking-wide uppercase">Description</legend>
                  <div>
                    <label className="label" htmlFor="p-short">
                      Phrase courte
                    </label>
                    <input
                      id="p-short"
                      className="field"
                      maxLength={300}
                      value={state.details.short ?? ""}
                      onChange={(e) => set({ details: { ...state.details, short: e.target.value } })}
                    />
                  </div>
                  <div>
                    <span className="label">Points forts</span>
                    <ul className="grid gap-2">
                      {[...(state.details.highlights ?? []), ""].slice(0, 8).map((h, i) => (
                        <li key={i}>
                          <input
                            aria-label={`Point fort ${i + 1}`}
                            className="field h-10 min-h-10 text-[14px]"
                            maxLength={160}
                            placeholder={i === 0 ? "Ex. Recharge un téléphone plusieurs fois" : "Autre point fort"}
                            value={h}
                            onChange={(e) => {
                              const list = [...(state.details.highlights ?? [])];
                              list[i] = e.target.value;
                              set({
                                details: {
                                  ...state.details,
                                  highlights: list.filter((x, j) => x || j < list.length - 1),
                                },
                              });
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <label className="label" htmlFor="p-box">
                      Contenu de la boîte
                    </label>
                    <input
                      id="p-box"
                      className="field"
                      maxLength={300}
                      value={state.details.box ?? ""}
                      onChange={(e) => set({ details: { ...state.details, box: e.target.value } })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="p-extra">
                      Informations complémentaires
                    </label>
                    <textarea
                      id="p-extra"
                      rows={3}
                      className="field"
                      maxLength={1000}
                      value={state.details.extra ?? ""}
                      onChange={(e) => set({ details: { ...state.details, extra: e.target.value } })}
                    />
                  </div>
                  {hasDetails(state.details) ? (
                    <div className="rounded-[6px] bg-paper-deep p-3 text-[14px]">
                      <p className="text-[12px] font-bold tracking-wide text-ink-mute uppercase">
                        Affichage sur le site (composé automatiquement)
                      </p>
                      <p className="mt-1 whitespace-pre-line">{description}</p>
                    </div>
                  ) : (
                    <details>
                      <summary className="cursor-pointer text-[14px] font-semibold text-gps-blue">
                        Texte libre {state.description.trim() ? "(description actuelle)" : ""}
                      </summary>
                      <textarea
                        aria-label="Description libre"
                        rows={5}
                        className="field mt-2"
                        value={state.description}
                        onChange={(e) => set({ description: e.target.value })}
                      />
                    </details>
                  )}
                </fieldset>

                {single && v0 ? (
                  <fieldset className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                    <legend className="text-[14.5px] font-extrabold tracking-wide uppercase">
                      Référence et code-barres
                    </legend>
                    <CodeFields
                      v={v0}
                      i={0}
                      suggestion={suggestSku(state.name, state.axes, v0.options)}
                      errors={codeErrors(v0)}
                      onChange={(p) => updateVariant(0, p)}
                    />
                  </fieldset>
                ) : null}

                <AdvancedBlock state={state} set={set} />
              </>
            ) : (
              <p className="text-[14px] text-ink-soft">
                Marque, modèle, caractéristiques, description, coût et réglages avancés :{" "}
                <button
                  type="button"
                  className="font-semibold text-gps-blue underline"
                  onClick={() => setMode("complet")}
                >
                  passer au mode complet
                </button>{" "}
                (la saisie est conservée).
              </p>
            )}
          </Step>

          {/* 5. Vérification */}
          <Step
            id="etape-review"
            n={5}
            title="Vérification"
            status={status("review")}
            statusLabel={label("review")}
            open={expanded(4)}
            onOpen={() => setOpen(4)}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <dl className="grid content-start gap-1 text-[14px]" data-testid="verification">
                {(
                  [
                    ["Nom public", state.name || "—"],
                    ["Catégorie", category?.name ?? "—"],
                    ["Marque", state.brand || "—"],
                    ["Modèle", state.model || "—"],
                    ["Prix", priceText],
                    ["Stock", `${stockTotal}`],
                    ["Variantes", `${active.length}`],
                    ["Garantie", state.warranty || "—"],
                    [
                      "Publication",
                      state.status === "published" ? "En ligne" : state.status === "archived" ? "Archivé" : "Brouillon",
                    ],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line-soft py-1">
                    <dt className="text-ink-mute">{k}</dt>
                    <dd className="text-right font-semibold [overflow-wrap:anywhere]">{v}</dd>
                  </div>
                ))}
                {state.specs
                  .filter((s) => !s.private && s.value.trim())
                  .slice(0, 5)
                  .map((s) => (
                    <div key={s.label} className="flex justify-between gap-3 border-b border-line-soft py-1">
                      <dt className="text-ink-mute">{s.label}</dt>
                      <dd className="text-right">
                        {s.value} {s.unit}
                      </dd>
                    </div>
                  ))}
              </dl>
              <div className="grid content-start gap-3">
                <section aria-labelledby="t-bloquants">
                  <h3 id="t-bloquants" className="font-bold">
                    Pour publier
                  </h3>
                  {publishBlockers.length === 0 ? (
                    <p className="mt-1 flex items-center gap-2 font-semibold text-wa-ink">
                      <IconCheck /> Prêt à publier.
                    </p>
                  ) : (
                    <ul className="mt-1 grid gap-1 text-[14px]">
                      {publishBlockers.map((i) => (
                        <li key={i} className="flex gap-2 text-gps-red-ink">
                          <IconAlert size={16} className="mt-0.5 shrink-0" /> {i}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {hints.length ? (
                  <section aria-labelledby="t-conseils">
                    <h3 id="t-conseils" className="font-bold">
                      Conseils
                    </h3>
                    <ul className="mt-1 grid gap-1 text-[13.5px]">
                      {hints.map((h) => (
                        <li key={h} className="flex gap-2 text-warn">
                          <IconAlert size={15} className="mt-0.5 shrink-0" /> {h}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <p className="hint">Un brouillon s&apos;enregistre toujours, même incomplet.</p>
              </div>
            </div>
            {!editing || series.count ? (
              <fieldset className="rounded-[6px] border border-line p-3">
                <legend className="px-1 text-[13px] font-bold">Pour le produit suivant, garder :</legend>
                <div className="grid gap-1 sm:grid-cols-2">
                  {keepLabels.map(([k, l]) => (
                    <label key={k} className="flex min-h-10 items-center gap-2 text-[14px]">
                      <input
                        type="checkbox"
                        checked={keep[k]}
                        onChange={(e) => setKeep((x) => ({ ...x, [k]: e.target.checked }))}
                      />
                      {l}
                    </label>
                  ))}
                </div>
                <p className="hint">
                  Nom, photos, prix, coût, stock, référence, code-barres et variantes repartent à zéro.
                </p>
              </fieldset>
            ) : null}
            {state.id ? <SecondaryActions id={state.id} hasSales={!!state.hasSales} /> : null}
          </Step>
        </div>

        {/* Aperçu permanent (ordinateur) et navigation rapide */}
        <aside
          className="hidden content-start gap-4 lg:sticky lg:top-4 lg:grid lg:self-start"
          aria-label="Aperçu du produit"
        >
          <nav aria-label="Parties de la fiche" className="rounded-[6px] border border-line bg-card p-2">
            <ul className="grid gap-0.5">
              {STEPS.map(([k, l], i) => (
                <li key={k}>
                  <a
                    href={`#etape-${k}`}
                    className="flex min-h-10 items-center justify-between gap-2 rounded-[4px] px-2 text-[14px] font-semibold hover:bg-paper-deep"
                  >
                    <span>
                      {i + 1}. {l}
                    </span>
                    <span className="text-[12px] font-bold text-ink-mute">{label(k)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="overflow-hidden rounded-[6px] border-[1.5px] border-line bg-card">
            <div className="relative aspect-[4/3] bg-paper-deep">
              {cover ? (
                <Image
                  src={cover.url}
                  alt=""
                  fill
                  sizes="380px"
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
                {category?.name ?? "Sans catégorie"}
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
              {comp.missing.length ? (
                <p className="mt-1 text-[13px] text-ink-soft">À compléter : {comp.missing.join(", ").toLowerCase()}.</p>
              ) : null}
            </div>
          </div>
          <p className="text-[12.5px] text-ink-mute">
            Clavier : Ctrl + S enregistre · Ctrl + Entrée enregistre et ouvre une fiche vierge.
          </p>
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
              <span className="text-ink-mute">Fiche vierge : commencez par les photos ou le nom.</span>
            ) : (
              <span className="text-ink-mute">Tout est enregistré</span>
            )}
          </div>
          {completion ? (
            <button
              type="button"
              className="btn btn-primary btn-sm flex-1 sm:flex-none"
              aria-label={
                completion.nextHref ? "Enregistrer et passer au produit suivant" : "Enregistrer et revenir à la liste"
              }
              disabled={pending || !!blocker}
              onClick={() => save("following")}
            >
              {completion.nextHref ? "Enregistrer et suivant" : "Enregistrer et revenir à la liste"}
            </button>
          ) : (
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
          )}
          <button
            type="button"
            className={`btn btn-sm flex-1 sm:flex-none ${editing && !completion ? "btn-primary" : "btn-ink"}`}
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

/** Mode complet : référencement, mise en avant, promotion, programmation. */
function AdvancedBlock({ state, set }: { state: ProductState; set: (p: Partial<ProductState>) => void }) {
  return (
    <details className="rounded-[6px] border border-line">
      <summary className="flex min-h-12 cursor-pointer items-center px-3 font-bold">
        Paramètres avancés (référencement, promotion, programmation)
      </summary>
      <div className="grid gap-4 border-t border-line p-3">
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
          <p className="hint">Vide : tirée du nom. Changer l&apos;adresse casse les liens déjà partagés.</p>
        </div>
        <label className="flex min-h-11 items-center gap-2 font-semibold">
          <input type="checkbox" checked={state.featured} onChange={(e) => set({ featured: e.target.checked })} />
          Mettre dans la Sélection GPS (accueil)
        </label>
        <div>
          {state.id ? (
            <Link href={`/comptoir/catalogue/promotions?produit=${state.id}`} className="btn btn-outline btn-sm">
              Créer une promotion pour ce produit
            </Link>
          ) : (
            <p className="text-[14px] text-ink-soft">Promotion : disponible après le premier enregistrement.</p>
          )}
        </div>
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
          </div>
        </div>
        {state.id ? (
          <a href="#t-versions" className="text-[14px] font-semibold text-gps-blue underline">
            Historique des versions
          </a>
        ) : null}
      </div>
    </details>
  );
}

function SecondaryActions({ id, hasSales }: { id: string; hasSales: boolean }) {
  const router = useRouter();
  const { run, pending, failure, success } = useAction();
  return (
    <details className="rounded-[6px] border border-line">
      <summary className="flex min-h-12 cursor-pointer items-center px-3 font-bold">Autres actions</summary>
      <div className="border-t border-line p-3">
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
          Dupliquer ouvre une nouvelle fiche avec les mêmes réglages, sans nom, références, code-barres, photos ni
          stock.
        </p>
        <div className="mt-3">
          <ActionFeedback failure={failure} success={success} />
        </div>
      </div>
    </details>
  );
}
