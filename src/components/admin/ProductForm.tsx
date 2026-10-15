"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  duplicateProductAction,
  trashProductAction,
  saveProductAction,
  uploadImageAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { publicationIssues } from "@/lib/publication";
import { fcfa, slugify } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";
import { MediaPicker } from "./MediaLibrary";
import { Badge } from "./ui";
import { IconCheck, IconDown, IconPlus, IconTrash, IconUp, IconUpload, IconAlert } from "../ui/icons";

interface VariantState {
  id?: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  costPrice?: number | null;
  initialStock?: number;
  lowStockThreshold?: number | null;
  onHand?: number;
  reserved?: number;
  hasSales?: boolean;
}

export interface ProductState {
  id?: string;
  updatedAt?: string;
  name: string;
  brand: string;
  categoryId: string | null;
  description: string;
  specs: { label: string; value: string }[];
  condition: string | null;
  axes: string[];
  axisValues: Record<string, string>;
  images: { url: string; alt: string; color?: string | null }[];
  variants: VariantState[];
  status: "draft" | "published" | "archived";
  featured: boolean;
  hasSales?: boolean;
  /** Publication programmée (ISO), brouillons uniquement. */
  publishAt?: string | null;
}

const AXIS_PRESETS = ["Couleur", "Capacité", "Pointure", "Taille", "Monture", "Contenu"];
const CONDITIONS = ["Neuf", "Reconditionné — très bon état", "Reconditionné — bon état", "Occasion"];
const steps = ["Présenter", "Configurer", "Publier"] as const;

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
  initial,
  categories,
  canCosts,
}: {
  initial: ProductState;
  categories: { id: string; name: string }[];
  canCosts: boolean;
}) {
  const router = useRouter();
  const draftKey = `gps-produit-${initial.id ?? "nouveau"}`;
  const [state, setState] = useState<ProductState>(initial);
  const [saved, setSaved] = useState(() => snapshot(initial));
  const [step, setStep] = useState(0);
  const [localDraft, setLocalDraft] = useState<ProductState | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(draftKey) : null;
      const d = raw ? (JSON.parse(raw) as ProductState & { savedFor?: string }) : null;
      return d && d.savedFor === (initial.updatedAt ?? "") && snapshot(d) !== snapshot(initial) ? d : null;
    } catch {
      return null;
    }
  });
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
  const issues = useMemo(() => publicationIssues(state), [state]);
  const colorAxis = state.axes.find((a) => ["Couleur", "Monture", "Coloris"].includes(a));
  const colorValues = colorAxis ? [...new Set(state.variants.map((v) => v.options[colorAxis]).filter(Boolean))] : [];

  const save = (status: ProductState["status"]) => {
    const payload = {
      id: state.id,
      expectedUpdatedAt: state.updatedAt,
      name: state.name,
      brand: state.brand,
      categoryId: state.categoryId,
      description: state.description,
      specs: state.specs.filter((s) => s.label.trim() && s.value.trim()),
      condition: state.condition,
      axes: state.axes,
      images: state.images,
      variants: state.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        options: Object.fromEntries(state.axes.map((a) => [a, v.options[a] ?? ""])),
        price: v.price,
        costPrice: canCosts ? (v.costPrice ?? null) : undefined,
        initialStock: v.id ? undefined : (v.initialStock ?? 0),
        lowStockThreshold: v.lowStockThreshold ?? null,
      })),
      status,
      featured: status === "published" ? state.featured : false,
      publishAt: status === "draft" ? (state.publishAt ?? null) : null,
    };
    run(() => saveProductAction(payload), {
      successMessage:
        status === "published"
          ? "Produit enregistré et publié."
          : payload.publishAt
            ? `Publication programmée le ${new Date(payload.publishAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}.`
            : "Brouillon enregistré.",
      onSuccess: (r) => {
        const next = {
          ...state,
          id: r.id,
          updatedAt: r.updatedAt,
          status,
          featured: payload.featured,
        };
        setState(next);
        setSaved(snapshot(next));
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        if (!state.id) router.replace(`/comptoir/catalogue/${r.id}`);
      },
    });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadError(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      const fd = new FormData();
      fd.append("file", file);
      try {
        const r = await uploadImageAction(fd);
        if (r.ok)
          setState((s) => ({
            ...s,
            images: [...s.images, { url: r.data.url, alt: s.name, color: null }],
          }));
        else setUploadError(`${file.name} : ${r.error}`);
      } catch {
        setUploadError(`${file.name} : envoi impossible (connexion ou taille).`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const moveImage = (i: number, d: -1 | 1) => {
    const imgs = [...state.images];
    const j = i + d;
    if (j < 0 || j >= imgs.length) return;
    [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
    set({ images: imgs });
  };

  const generateVariants = (values: Record<string, string>) => {
    const lists = state.axes.map((a) =>
      (values[a] ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    );
    if (lists.some((l) => !l.length)) return;
    let combos: Record<string, string>[] = [{}];
    state.axes.forEach((a, i) => {
      combos = combos.flatMap((c) => lists[i].map((v) => ({ ...c, [a]: v })));
    });
    const base =
      slugify(state.name || "ART")
        .toUpperCase()
        .replace(/-/g, "")
        .slice(0, 8) || "ART";
    const existing = state.variants;
    const key = (o: Record<string, string>) => state.axes.map((a) => o[a]).join("|");
    const price = existing[0]?.price ?? 0;
    const next = combos.map((c) => {
      const found = existing.find((v) => key(v.options) === key(c));
      if (found) return found;
      const suffix = state.axes.map((a) => slugify(c[a]).toUpperCase().replace(/-/g, "").slice(0, 4)).join("-");
      return {
        sku: `${base}-${suffix}`,
        options: c,
        price,
        initialStock: 0,
      } as VariantState;
    });
    // Les variantes déjà vendues ne disparaissent jamais d'elles-mêmes.
    const kept = existing.filter((v) => v.hasSales && !next.includes(v));
    set({ axisValues: values, variants: [...next, ...kept] });
  };

  const updateVariant = (i: number, patch: Partial<VariantState>) =>
    set({
      variants: state.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)),
    });
  const num = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Math.round(Number(s.replace(/\s/g, "")) || 0)));

  return (
    <div className="pb-24">
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

      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Étapes">
        {steps.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={step === i ? "step" : undefined}
              className={`flex min-h-14 w-full items-center gap-2 rounded-[6px] border-[1.5px] px-3 text-left font-bold ${step === i ? "border-gps-blue bg-gps-blue text-white" : "border-line bg-card"}`}
            >
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] tabular ${step === i ? "bg-white text-gps-blue" : "bg-paper-deep"}`}
              >
                {i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <div>
              <label className="label" htmlFor="p-name">
                Nom du produit
              </label>
              <input id="p-name" className="field" value={state.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="p-brand">
                  Marque
                </label>
                <input
                  id="p-brand"
                  className="field"
                  value={state.brand}
                  onChange={(e) => set({ brand: e.target.value })}
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
              </div>
            </div>
            <div>
              <label className="label" htmlFor="p-cond">
                État <span className="font-normal text-ink-mute">(si pertinent)</span>
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
              <label className="label" htmlFor="p-desc">
                Description
              </label>
              <textarea
                id="p-desc"
                rows={6}
                className="field"
                value={state.description}
                onChange={(e) => set({ description: e.target.value })}
              />
              <p className="hint">{state.description.trim().length} caractères · 20 minimum pour publier.</p>
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
                        set({
                          specs: state.specs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        })
                      }
                    />
                    <input
                      aria-label={`Valeur ${i + 1}`}
                      className="field"
                      placeholder="Valeur"
                      value={s.value}
                      onChange={(e) =>
                        set({
                          specs: state.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                        })
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

          <fieldset className="content-start">
            <legend className="label">Photos (la première est la photo principale)</legend>
            <ul className="grid gap-2">
              {state.images.map((img, i) => (
                <li
                  key={img.url + i}
                  className="grid grid-cols-[72px_1fr_auto] items-center gap-3 rounded-[6px] border border-line bg-card p-2"
                >
                  <Image
                    src={img.url}
                    alt=""
                    width={72}
                    height={90}
                    unoptimized={img.url.endsWith(".svg")}
                    className="aspect-[4/5] w-[72px] rounded-[4px] object-cover"
                  />
                  <div className="grid gap-2">
                    <input
                      aria-label={`Texte alternatif de la photo ${i + 1}`}
                      className="field h-10 min-h-10 text-[14px]"
                      placeholder="Description de la photo"
                      value={img.alt}
                      onChange={(e) =>
                        set({
                          images: state.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)),
                        })
                      }
                    />
                    {colorAxis && colorValues.length ? (
                      <select
                        aria-label={`${colorAxis} de la photo ${i + 1}`}
                        className="field h-10 min-h-10 py-0 text-[14px]"
                        value={img.color ?? ""}
                        onChange={(e) =>
                          set({
                            images: state.images.map((x, j) => (j === i ? { ...x, color: e.target.value || null } : x)),
                          })
                        }
                      >
                        <option value="">Toutes les {colorAxis.toLowerCase()}s</option>
                        {colorValues.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm px-2"
                      disabled={i === 0}
                      onClick={() => moveImage(i, -1)}
                      aria-label={`Monter la photo ${i + 1}`}
                    >
                      <IconUp size={18} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm px-2"
                      disabled={i === state.images.length - 1}
                      onClick={() => moveImage(i, 1)}
                      aria-label={`Descendre la photo ${i + 1}`}
                    >
                      <IconDown size={18} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm px-2 text-gps-red-ink"
                      onClick={() => set({ images: state.images.filter((_, j) => j !== i) })}
                      aria-label={`Retirer la photo ${i + 1}`}
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <label className="mt-3 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-line bg-white p-4 text-center focus-within:border-gps-blue hover:border-gps-blue">
              <IconUpload />
              <span className="font-bold">{uploading ? `Envoi en cours (${uploading})…` : "Ajouter des photos"}</span>
              <span className="text-[13px] text-ink-mute">
                JPEG, PNG ou WebP · 3 Mo max par photo · format vertical 4:5 conseillé
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(e) => (upload(e.target.files), (e.target.value = ""))}
              />
            </label>
            <MediaPicker
              onPick={(img) =>
                setState((s) =>
                  s.images.some((x) => x.url === img.url)
                    ? s
                    : { ...s, images: [...s.images, { url: img.url, alt: img.alt || s.name, color: null }] },
                )
              }
            />
            {uploadError ? (
              <p role="alert" className="error-text">
                {uploadError}
              </p>
            ) : null}
          </fieldset>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-6">
          <fieldset className="rounded-[6px] border border-line bg-card p-4">
            <legend className="px-1 font-bold">Options du produit</legend>
            <p className="mb-3 text-[14px] text-ink-soft">
              Exemples : Couleur, Capacité, Pointure. Laissez vide pour un article unique.
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              {AXIS_PRESETS.filter((a) => !state.axes.includes(a)).map((a) => (
                <button
                  key={a}
                  type="button"
                  className="chip"
                  disabled={state.axes.length >= 3}
                  onClick={() => set({ axes: [...state.axes, a] })}
                >
                  <IconPlus size={14} /> {a}
                </button>
              ))}
            </div>
            <ul className="grid gap-3">
              {state.axes.map((a) => (
                <li key={a} className="grid gap-2 sm:grid-cols-[160px_1fr_auto] sm:items-center">
                  <span className="font-bold">{a}</span>
                  <input
                    aria-label={`Valeurs pour ${a}, séparées par des virgules`}
                    className="field"
                    placeholder="Valeurs séparées par des virgules (ex. Noir, Blanc)"
                    value={
                      state.axisValues[a] ??
                      [...new Set(state.variants.map((v) => v.options[a]).filter(Boolean))].join(", ")
                    }
                    onChange={(e) =>
                      set({
                        axisValues: {
                          ...state.axisValues,
                          [a]: e.target.value,
                        },
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => set({ axes: state.axes.filter((x) => x !== a) })}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
            {state.axes.length ? (
              <button
                type="button"
                className="btn btn-blue btn-sm mt-3"
                onClick={() => {
                  const values = Object.fromEntries(
                    state.axes.map((a) => [
                      a,
                      state.axisValues[a] ??
                        [...new Set(state.variants.map((v) => v.options[a]).filter(Boolean))].join(", "),
                    ]),
                  );
                  generateVariants(values);
                }}
              >
                Générer les combinaisons
              </button>
            ) : null}
          </fieldset>

          <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                  {state.axes.map((a) => (
                    <th key={a} className="px-2 py-2 font-bold">
                      {a}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-bold">Référence</th>
                  <th className="px-2 py-2 font-bold">Prix (FCFA)</th>
                  {canCosts ? <th className="px-2 py-2 font-bold">Coût d&apos;achat</th> : null}
                  <th className="px-2 py-2 font-bold">Stock</th>
                  <th className="px-2 py-2 font-bold">Seuil</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {state.variants.map((v, i) => (
                  <tr key={v.id ?? `n${i}`}>
                    {state.axes.map((a) => (
                      <td key={a} className="px-2 py-2">
                        <input
                          aria-label={`${a} variante ${i + 1}`}
                          className="field h-10 min-h-10 w-28 text-[14px]"
                          value={v.options[a] ?? ""}
                          onChange={(e) =>
                            updateVariant(i, {
                              options: { ...v.options, [a]: e.target.value },
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <input
                        aria-label={`Référence variante ${i + 1}`}
                        className="field h-10 min-h-10 w-40 font-mono text-[13px]"
                        value={v.sku}
                        onChange={(e) =>
                          updateVariant(i, {
                            sku: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label={`Prix variante ${i + 1}`}
                        inputMode="numeric"
                        className="field h-10 min-h-10 w-28 text-[14px]"
                        value={v.price || ""}
                        onChange={(e) => updateVariant(i, { price: num(e.target.value) ?? 0 })}
                      />
                    </td>
                    {canCosts ? (
                      <td className="px-2 py-2">
                        <input
                          aria-label={`Coût d'achat variante ${i + 1}`}
                          inputMode="numeric"
                          className="field h-10 min-h-10 w-28 text-[14px]"
                          value={v.costPrice ?? ""}
                          onChange={(e) =>
                            updateVariant(i, {
                              costPrice: num(e.target.value) ?? null,
                            })
                          }
                        />
                      </td>
                    ) : null}
                    <td className="px-2 py-2">
                      {v.id ? (
                        <span className="text-[13px] tabular">
                          {v.onHand} <span className="text-ink-mute">({v.reserved} rés.)</span>
                        </span>
                      ) : (
                        <input
                          aria-label={`Stock initial variante ${i + 1}`}
                          inputMode="numeric"
                          className="field h-10 min-h-10 w-20 text-[14px]"
                          value={v.initialStock ?? ""}
                          placeholder="0"
                          onChange={(e) =>
                            updateVariant(i, {
                              initialStock: num(e.target.value) ?? 0,
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        aria-label={`Seuil d'alerte variante ${i + 1}`}
                        inputMode="numeric"
                        className="field h-10 min-h-10 w-16 text-[14px]"
                        placeholder="—"
                        value={v.lowStockThreshold ?? ""}
                        onChange={(e) =>
                          updateVariant(i, {
                            lowStockThreshold: num(e.target.value) ?? null,
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm px-2"
                        onClick={() =>
                          set({
                            variants: state.variants.filter((_, j) => j !== i),
                          })
                        }
                        aria-label={`Retirer la variante ${i + 1}`}
                        title={v.hasSales ? "Déjà vendue : sera désactivée, pas supprimée" : undefined}
                      >
                        <IconTrash size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-3">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() =>
                  set({
                    variants: [
                      ...state.variants,
                      {
                        sku: "",
                        options: {},
                        price: state.variants[0]?.price ?? 0,
                        initialStock: 0,
                      },
                    ],
                  })
                }
              >
                <IconPlus size={16} /> Ajouter une variante
              </button>
              <p className="text-[13px] text-ink-mute">
                Le stock des variantes existantes se modifie dans Stock (réapprovisionnement, inventaire), avec motif et
                historique.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[6px] border border-line bg-card p-4" aria-labelledby="t-verif">
            <h2 id="t-verif" className="font-bold">
              Vérifications avant publication
            </h2>
            {issues.length === 0 ? (
              <p className="mt-2 flex items-center gap-2 font-semibold text-wa-ink">
                <IconCheck /> Tout est prêt pour la publication.
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
          </section>
          <section className="rounded-[6px] border border-line bg-card p-4" aria-labelledby="t-resume">
            <h2 id="t-resume" className="font-bold">
              Résumé
            </h2>
            <dl className="mt-2 grid gap-1 text-[14px]">
              <div className="flex justify-between">
                <dt>Statut actuel</dt>
                <dd>
                  {state.status === "published" ? (
                    <Badge tone="green">Publié</Badge>
                  ) : state.status === "draft" ? (
                    <Badge tone="warn">Brouillon</Badge>
                  ) : (
                    <Badge>Archivé</Badge>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Variantes</dt>
                <dd>{state.variants.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Prix</dt>
                <dd className="tabular">
                  {state.variants.length
                    ? `${fcfa(Math.min(...state.variants.map((v) => v.price)))} – ${fcfa(Math.max(...state.variants.map((v) => v.price)))}`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Photos</dt>
                <dd>{state.images.length}</dd>
              </div>
            </dl>
            <label className="mt-4 flex min-h-11 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={state.featured}
                onChange={(e) => set({ featured: e.target.checked })}
              />{" "}
              Mettre dans la Sélection GPS (accueil)
            </label>
            {state.status !== "published" ? (
              <div className="mt-4 border-t border-line pt-4">
                <label className="label" htmlFor="p-publish-at">
                  Programmer la publication (facultatif)
                </label>
                <input
                  id="p-publish-at"
                  type="datetime-local"
                  className="field"
                  value={state.publishAt ? toLocalInput(state.publishAt) : ""}
                  onChange={(e) => set({ publishAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
                <p className="hint">
                  Le brouillon sera publié automatiquement à cette heure, si les vérifications sont toujours bonnes.
                  Enregistrez le brouillon pour valider la programmation.
                </p>
              </div>
            ) : null}
          </section>
          {state.id ? <SecondaryActions id={state.id} hasSales={!!state.hasSales} /> : null}
        </div>
      ) : null}

      {/* Barre d'enregistrement */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur lg:left-[256px]">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-2 px-4 py-3 md:px-8">
          <div className="mr-auto min-w-0 text-[14px]" aria-live="polite">
            {failure || success ? (
              <ActionFeedback failure={failure} success={success} />
            ) : dirty ? (
              <span className="font-semibold text-warn">Modifications non enregistrées</span>
            ) : (
              <span className="text-ink-mute">Tout est enregistré</span>
            )}
          </div>
          {step > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(step - 1)}>
              Précédent
            </button>
          ) : null}
          {step < 2 ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setStep(step + 1)}>
              Suivant : {steps[step + 1]}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ink btn-sm"
            disabled={pending || !state.name.trim()}
            onClick={() =>
              save(state.status === "published" ? "draft" : state.status === "archived" ? "archived" : "draft")
            }
          >
            {state.status === "published"
              ? "Retirer du site (brouillon)"
              : state.status === "archived"
                ? "Enregistrer (reste archivé)"
                : "Enregistrer le brouillon"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={pending || issues.length > 0}
            onClick={() => save("published")}
            title={issues.length ? "Complétez les vérifications de l'étape Publier" : undefined}
          >
            {pending ? "Enregistrement…" : state.status === "published" ? "Enregistrer" : "Publier"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SecondaryActions({ id, hasSales }: { id: string; hasSales: boolean }) {
  const router = useRouter();
  const { run, pending, failure, success } = useAction();
  return (
    <section className="rounded-[6px] border border-line bg-card p-4 lg:col-span-2" aria-labelledby="t-autres">
      <h2 id="t-autres" className="font-bold">
        Autres actions
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={pending}
          onClick={() =>
            run(() => duplicateProductAction(id), {
              onSuccess: (r) => router.push(`/comptoir/catalogue/${r.id}`),
            })
          }
        >
          Dupliquer
        </button>
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
      <div className="mt-3">
        <ActionFeedback failure={failure} success={success} />
      </div>
    </section>
  );
}
