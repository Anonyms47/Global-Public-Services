"use client";

import Image from "next/image";
import { useState, type ChangeEvent, type ReactNode } from "react";
import { importMediaUrlAction } from "@/app/comptoir/(app)/catalogue/actions";
import { fcfa } from "@/lib/format";
import { suggestSku } from "@/lib/sku";
import type { MediaSource } from "@/server/domain/catalog";
import { ActionFeedback, useAction } from "./useAction";
import { MediaPicker } from "./MediaLibrary";
import { UploadList, type useUploadQueue } from "./UploadQueue";
import { Badge } from "./ui";
import { IconAlert, IconDown, IconImage, IconPlus, IconTrash, IconUp, IconUpload } from "../ui/icons";

export interface VariantState {
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

export interface ImageState {
  url: string;
  alt: string;
  color?: string | null;
  kind?: "image" | "video";
  source?: MediaSource | null;
}

export const AXIS_PRESETS = [
  "Couleur",
  "Taille",
  "Pointure",
  "Stockage",
  "RAM",
  "Contenance",
  "Puissance",
  "Modèle compatible",
];
export const COLOR_AXES = ["Couleur", "Monture", "Coloris"];

export const num = (s: string) =>
  s.trim() === "" ? undefined : Math.max(0, Math.round(Number(s.replace(/\s/g, "")) || 0));
export const variantLabel = (axes: string[], v: VariantState, i: number) =>
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

export type Margin = { value: number; pct: number } | null;

export function MarginLine({ m }: { m: Margin }) {
  if (!m) return null;
  return m.value < 0 ? (
    <p className="flex items-center gap-1.5 text-[14px] font-semibold text-gps-red-ink" role="status">
      <IconAlert size={16} /> Prix inférieur au coût : perte de {fcfa(-m.value)} par article.
    </p>
  ) : m.value === 0 ? (
    <p className="flex items-center gap-1.5 text-[14px] font-semibold text-warn" role="status">
      <IconAlert size={16} /> Prix égal au coût : aucune marge.
    </p>
  ) : (
    <p className="text-[14px] text-ink-soft" data-testid="marge">
      Bénéfice estimé : <strong className="text-ink tabular">{fcfa(m.value)}</strong> par article (
      {Math.round(m.pct * 100)} %)
    </p>
  );
}

/** Valeurs proposées en un geste (modifiables par le propriétaire). */
export function QuickChips({
  values,
  current,
  onPick,
  label,
}: {
  values: string[];
  current: string;
  onPick: (v: string) => void;
  label: string;
}) {
  if (!values.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label={`Choix rapides : ${label}`}>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={current === v}
          className={`min-h-9 rounded-full border px-3 text-[13px] font-semibold ${
            current === v ? "border-gps-blue bg-gps-blue text-white" : "border-line bg-card hover:border-gps-blue"
          }`}
          onClick={() => onPick(current === v ? "" : v)}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function CodeFields({
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
          Référence interne
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
export function VariantEditor({
  name,
  axes,
  axisValues,
  variants,
  images,
  set,
  canCosts,
  full,
  codeErrors,
  margin,
}: {
  name: string;
  axes: string[];
  axisValues: Record<string, string>;
  variants: VariantState[];
  images: ImageState[];
  set: (p: {
    axes?: string[];
    axisValues?: Record<string, string>;
    variants?: VariantState[];
    images?: ImageState[];
  }) => void;
  canCosts: boolean;
  /** Mode complet : références, codes-barres et coûts par variante. */
  full: boolean;
  codeErrors: (v: VariantState) => { sku: string | null; barcode: string | null };
  margin: (v: VariantState) => Margin;
}) {
  const [custom, setCustom] = useState("");
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<number[]>([]);
  const [bulk, setBulk] = useState({ price: "", cost: "", stock: "", threshold: "" });
  const values = (a: string) =>
    axisValues[a] !== undefined
      ? listOf(axisValues[a])
      : [...new Set(variants.map((v) => v.options[a]).filter(Boolean))];
  const setValues = (a: string, list: string[]) =>
    set({ axisValues: { ...Object.fromEntries(axes.map((x) => [x, values(x).join(", ")])), [a]: list.join(", ") } });
  const addValues = (a: string, raw: string) => {
    const add = listOf(raw);
    if (add.length) setValues(a, [...new Set([...values(a), ...add])]);
    setTyping((t) => ({ ...t, [a]: "" }));
  };
  const addAxis = (n0: string) => {
    const n = n0.trim().slice(0, 30);
    if (!n || axes.length >= 3 || axes.some((a) => a.toLowerCase() === n.toLowerCase())) return;
    set({ axes: [...axes, n] });
    setCustom("");
  };
  const removeAxis = (a: string) => {
    const nextAxes = axes.filter((x) => x !== a);
    const seen = new Set<string>();
    const next = variants
      .map((v) => {
        const options = { ...v.options };
        delete options[a];
        return { ...v, options };
      })
      .filter((v) => {
        const k = nextAxes.map((x) => v.options[x]).join("|");
        if (v.hasSales) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    const nextValues = { ...axisValues };
    delete nextValues[a];
    set({ axes: nextAxes, axisValues: nextValues, variants: next });
    setSelected([]);
  };
  const lists = axes.map(values);
  const combos = lists.length && lists.every((l) => l.length) ? lists.reduce((n, l) => n * l.length, 1) : 0;
  const generate = () => {
    if (!combos) return;
    let all: Record<string, string>[] = [{}];
    axes.forEach((a, i) => {
      all = all.flatMap((c) => lists[i].map((v) => ({ ...c, [a]: v })));
    });
    const key = (o: Record<string, string>) => axes.map((a) => o[a]).join("|");
    const base = variants[0];
    const next = all.map(
      (c) =>
        variants.find((v) => key(v.options) === key(c)) ??
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
    const kept = variants.filter((v) => v.hasSales && !next.includes(v));
    set({ axisValues: Object.fromEntries(axes.map((a, i) => [a, lists[i].join(", ")])), variants: [...next, ...kept] });
    setSelected([]);
  };
  const patch = (i: number, p: Partial<VariantState>) =>
    set({ variants: variants.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  const targets = selected.length ? selected : variants.map((_, i) => i).filter((i) => !variants[i].off);
  const applyBulk = () => {
    const p: Partial<VariantState> = {};
    if (bulk.price.trim()) p.price = num(bulk.price) ?? 0;
    if (canCosts && bulk.cost.trim()) p.costPrice = num(bulk.cost) ?? null;
    if (bulk.threshold.trim()) p.lowStockThreshold = num(bulk.threshold) ?? null;
    const stock = bulk.stock.trim() ? (num(bulk.stock) ?? 0) : undefined;
    set({
      variants: variants.map((v, i) =>
        targets.includes(i) ? { ...v, ...p, ...(stock !== undefined && !v.id ? { initialStock: stock } : {}) } : v,
      ),
    });
    setBulk({ price: "", cost: "", stock: "", threshold: "" });
  };
  /** Références vides remplies d'après le nom et les options, sans doublon dans la fiche. */
  const generateRefs = () => {
    const used = new Set(variants.map((v) => v.sku.trim().toUpperCase()).filter(Boolean));
    set({
      variants: variants.map((v, i) => {
        if (!targets.includes(i) || v.sku.trim()) return v;
        const base = suggestSku(name, axes, v.options);
        let sku = base;
        for (let n = 2; used.has(sku); n++) sku = `${base}-${n}`;
        used.add(sku);
        return { ...v, sku };
      }),
    });
  };
  const colorAxis = axes.find((a) => COLOR_AXES.includes(a));
  const photos = images.map((img, i) => ({ img, i })).filter(({ img }) => (img.kind ?? "image") === "image");
  const proposed = variants.filter((v) => !v.off).length;
  const small = "field h-10 min-h-10 text-[14px] tabular";

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-[14px] font-semibold">
          Choisissez ce qui change d&apos;une version à l&apos;autre (3 au plus) :
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {AXIS_PRESETS.filter((a) => !axes.includes(a)).map((a) => (
            <button key={a} type="button" className="chip" disabled={axes.length >= 3} onClick={() => addAxis(a)}>
              <IconPlus size={14} /> {a}
            </button>
          ))}
        </div>
        <div className="mt-2 flex max-w-md gap-2">
          <input
            aria-label="Autre option (ex. Matière)"
            className="field h-10 min-h-10 min-w-0 flex-1"
            placeholder="Option personnalisée (ex. Matière)"
            maxLength={30}
            value={custom}
            disabled={axes.length >= 3}
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
            disabled={!custom.trim() || axes.length >= 3}
            onClick={() => addAxis(custom)}
          >
            Ajouter l&apos;option
          </button>
        </div>
      </div>

      {axes.length ? (
        <ul className="grid gap-3">
          {axes.map((a) => (
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
                  placeholder="Une valeur puis Entrée (ou plusieurs, séparées par des virgules)"
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

      {axes.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-blue btn-sm" disabled={!combos} onClick={generate}>
            Générer {combos ? `les ${combos} combinaison${combos > 1 ? "s" : ""}` : "les combinaisons"}
          </button>
          <span className="text-[14px] text-ink-soft" aria-live="polite" data-testid="combos-preview">
            {combos
              ? `${lists.map((l) => l.length).join(" × ")} = ${combos} combinaison${combos > 1 ? "s" : ""} · ${combos} variante${combos > 1 ? "s" : ""} seront créées`
              : "Ajoutez au moins une valeur à chaque option."}
          </span>
        </div>
      ) : null}

      {axes.length && variants.length ? (
        <>
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <p className="font-bold" data-testid="variant-count">
              {variants.length} variante{variants.length > 1 ? "s" : ""} · {proposed} proposée{proposed > 1 ? "s" : ""}
            </p>
            <label className="flex min-h-10 items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={selected.length > 0 && selected.length === variants.length}
                onChange={(e) => setSelected(e.target.checked ? variants.map((_, i) => i) : [])}
              />
              Tout sélectionner
            </label>
          </div>
          <fieldset className="rounded-[6px] border border-gps-blue/30 bg-gps-blue-soft/40 p-3">
            <legend className="px-1 text-[13px] font-bold">
              Modifier {selected.length ? `les ${selected.length} variantes sélectionnées` : "toutes les variantes"}
            </legend>
            <div className={`grid grid-cols-2 gap-2 ${canCosts && full ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
              <input
                aria-label="Prix pour la sélection"
                className={small}
                inputMode="numeric"
                placeholder="Prix"
                value={bulk.price}
                onChange={(e) => setBulk({ ...bulk, price: e.target.value })}
              />
              {canCosts && full ? (
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
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-blue btn-sm"
                disabled={!Object.values(bulk).some((x) => x.trim())}
                onClick={applyBulk}
              >
                {selected.length ? "Appliquer à la sélection" : "Appliquer à toutes"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={generateRefs}>
                Générer les références
              </button>
              {selected.length ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-gps-red-ink"
                  onClick={() => {
                    set({ variants: variants.map((v, i) => (selected.includes(i) ? { ...v, off: true } : v)) });
                    setSelected([]);
                  }}
                >
                  Retirer la sélection
                </button>
              ) : null}
            </div>
          </fieldset>

          <ul className="grid gap-2" aria-label="Variantes">
            {variants.map((v, i) => {
              const label = variantLabel(axes, v, i);
              const errs = codeErrors(v);
              const incomplete = axes.some((a) => !v.options[a]?.trim());
              const color = colorAxis ? v.options[colorAxis] : "";
              const linked = color ? images.findIndex((img) => img.color === color) : -1;
              return (
                <li
                  key={v.id ?? `n${i}`}
                  className={`rounded-[6px] border p-3 ${v.off ? "border-dashed border-line bg-paper opacity-70" : "border-line bg-card"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Sélectionner ${label}`}
                      checked={selected.includes(i)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, i] : s.filter((x) => x !== i)))}
                    />
                    <span className="min-w-0 flex-1 font-bold [overflow-wrap:anywhere]">{label}</span>
                    {v.hasSales ? <Badge>Déjà vendue</Badge> : null}
                    <label className="flex min-h-10 items-center gap-2 text-[13px] font-semibold">
                      <input
                        type="checkbox"
                        aria-label={`Proposer ${label}`}
                        checked={!v.off}
                        onChange={(e) => patch(i, { off: !e.target.checked })}
                      />
                      Disponible
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
                          {axes.map((a) => (
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
                      <div
                        className={`mt-2 grid grid-cols-2 gap-2 ${full ? (canCosts ? "md:grid-cols-6" : "md:grid-cols-5") : "md:grid-cols-3"}`}
                      >
                        <div className="min-w-0">
                          <label className="text-[12px] font-bold text-ink-mute" htmlFor={`p-vprice-${i}`}>
                            Prix
                          </label>
                          <input
                            id={`p-vprice-${i}`}
                            aria-label={`Prix ${label}`}
                            className={small}
                            inputMode="numeric"
                            pattern="[0-9 ]*"
                            value={v.price || ""}
                            onChange={(e) => patch(i, { price: num(e.target.value) ?? 0 })}
                          />
                        </div>
                        {canCosts && full ? (
                          <div className="min-w-0">
                            <label className="text-[12px] font-bold text-ink-mute" htmlFor={`p-vcost-${i}`}>
                              Coût
                            </label>
                            <input
                              id={`p-vcost-${i}`}
                              aria-label={`Coût ${label}`}
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
                              aria-label={`Stock initial ${label}`}
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
                            aria-label={`Seuil ${label}`}
                            className={small}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="—"
                            value={v.lowStockThreshold ?? ""}
                            onChange={(e) => patch(i, { lowStockThreshold: num(e.target.value) ?? null })}
                          />
                        </div>
                        {full ? (
                          <CodeFields
                            v={v}
                            i={i}
                            compact
                            suggestion={suggestSku(name, axes, v.options)}
                            errors={errs}
                            onChange={(p) => patch(i, p)}
                          />
                        ) : null}
                      </div>
                      {colorAxis && color && photos.length ? (
                        <label className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="font-bold text-ink-mute">Photo de la couleur {color}</span>
                          <select
                            aria-label={`Photo de ${label}`}
                            className="field h-9 min-h-9 w-auto py-0 text-[13px]"
                            value={linked >= 0 ? String(linked) : ""}
                            onChange={(e) =>
                              set({
                                images: images.map((img, j) =>
                                  j === Number(e.target.value)
                                    ? { ...img, color }
                                    : img.color === color
                                      ? { ...img, color: null }
                                      : img,
                                ),
                              })
                            }
                          >
                            <option value="">Aucune</option>
                            {photos.map(({ i: j }) => (
                              <option key={j} value={j}>
                                Photo {j + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      {full ? <MarginLine m={margin(v)} /> : null}
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
                  ...variants,
                  { sku: "", barcode: "", options: {}, price: variants[0]?.price ?? 0, initialStock: 0 },
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

/** Photos et vidéos : appareil photo, galerie, vidéo, médiathèque, adresse Internet (avec sa source). */
export function MediaEditor({
  images,
  setImages,
  uploads,
  colorAxis,
  colorValues,
  videoMaxMb,
  productLabel,
}: {
  images: ImageState[];
  setImages: (images: ImageState[]) => void;
  uploads: ReturnType<typeof useUploadQueue>;
  colorAxis?: string;
  colorValues: string[];
  videoMaxMb: number;
  /** Marque et modèle, rappelés pour l'import d'une photo trouvée sur Internet. */
  productLabel: string;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [matches, setMatches] = useState("");
  const [license, setLicense] = useState("");
  const urlAction = useAction();
  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const list = [...images];
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    setImages(list);
  };
  const edit = (i: number, p: Partial<ImageState>) => setImages(images.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    uploads.add(e.target.files);
    e.target.value = "";
  };
  const tile =
    "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-[1.5px] border-line bg-card px-2 py-2 text-center text-[13px] font-bold focus-within:outline-3 focus-within:outline-gps-blue hover:border-gps-blue";

  return (
    <div className="grid min-w-0 gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <label className={`${tile} [@media(pointer:fine)]:hidden`}>
          <IconImage size={20} /> Prendre des photos
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
        </label>
        <label className={tile}>
          <IconUpload size={20} /> Choisir dans la galerie
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            onChange={pick}
            data-testid="media-input"
          />
        </label>
        <label className={tile}>
          <IconPlus size={20} /> Ajouter une vidéo
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" onChange={pick} />
        </label>
        <div className={`${tile} [&_button]:mt-0`}>
          <MediaPicker
            onPick={(img) =>
              images.some((x) => x.url === img.url)
                ? undefined
                : setImages([...images, { url: img.url, alt: img.alt, color: null, kind: img.kind }])
            }
          />
        </div>
        <button type="button" className={tile} aria-expanded={urlOpen} onClick={() => setUrlOpen((o) => !o)}>
          Importer depuis une URL
        </button>
      </div>
      <p className="hint">
        Prenez la face avant, l&apos;arrière, les côtés, les caractéristiques et le code-barres. Plusieurs fichiers à la
        fois ; vidéo jusqu&apos;à {videoMaxMb} Mo.
      </p>

      {urlOpen ? (
        <form
          className="grid gap-2 rounded-[6px] border border-gps-blue/30 bg-gps-blue-soft/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            urlAction.run(() => importMediaUrlAction({ url, matches: matches || productLabel, license }), {
              refresh: false,
              onSuccess: (r) => {
                setImages([...images, { url: r.url, alt: "", color: null, kind: "image", source: r.source }]);
                setUrl("");
                setLicense("");
                setUrlOpen(false);
              },
            });
          }}
        >
          <p className="text-[13px] text-ink-soft">
            Uniquement une photo du <strong>même modèle exact</strong> (génération, capacité, couleur), de préférence
            sur le site du fabricant. Jamais une image ressemblante, avec filigrane ou logo d&apos;un autre vendeur.
          </p>
          <label className="label" htmlFor="p-media-url">
            Adresse de l&apos;image (https://…)
          </label>
          <input
            id="p-media-url"
            className="field"
            type="url"
            inputMode="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <label className="label" htmlFor="p-media-matches">
            Produit exact représenté
          </label>
          <input
            id="p-media-matches"
            className="field"
            placeholder={productLabel || "Marque et modèle"}
            value={matches}
            onChange={(e) => setMatches(e.target.value)}
          />
          <label className="label" htmlFor="p-media-license">
            Licence ou mention de la source (facultatif)
          </label>
          <input id="p-media-license" className="field" value={license} onChange={(e) => setLicense(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-blue btn-sm" disabled={urlAction.pending || !url.trim()}>
              {urlAction.pending ? "Téléchargement…" : "Importer la photo"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUrlOpen(false)}>
              Annuler
            </button>
          </div>
          <ActionFeedback failure={urlAction.failure} />
        </form>
      ) : null}

      <UploadList items={uploads.items} retry={uploads.retry} dismiss={uploads.dismiss} />

      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
              {img.source ? (
                <p className="text-[12px] leading-tight text-ink-soft" data-testid="media-source">
                  <Badge tone="blue">{img.source.status}</Badge>{" "}
                  <a
                    href={img.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="[overflow-wrap:anywhere] underline"
                  >
                    {img.source.domain}
                  </a>
                  <span className="block text-ink-mute">
                    À remplacer par une photo de la boutique dès que possible.
                  </span>
                </p>
              ) : null}
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
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border-2 border-dashed border-line bg-white p-4 text-center focus-within:border-gps-blue hover:border-gps-blue"
        >
          <IconUpload />
          <span className="font-bold">{uploads.busy ? "Envoi en cours…" : "Déposez ou choisissez vos photos"}</span>
          <span className="text-[13px] text-ink-mute">La première photo devient la photo principale.</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
            multiple
            className="sr-only"
            onChange={pick}
          />
        </label>
      )}
    </div>
  );
}

/** Bloc numéroté du parcours, avec son état (À compléter, En cours, Terminé…). */
export function Step({
  id,
  n,
  title,
  status,
  statusLabel,
  open,
  onOpen,
  children,
  footer,
}: {
  id: string;
  n: number;
  title: string;
  status: "todo" | "progress" | "done" | "optional" | "error";
  statusLabel: string;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const tone =
    status === "done"
      ? "bg-wa-soft text-wa-ink"
      : status === "error"
        ? "bg-gps-red-soft text-gps-red-ink"
        : status === "progress"
          ? "bg-gps-blue-soft text-gps-blue"
          : status === "optional"
            ? "bg-paper-deep text-ink-soft"
            : "bg-warn-soft text-warn";
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-[6px] border-[1.5px] bg-card ${open ? "border-ink" : "border-line"}`}
      aria-labelledby={`${id}-t`}
    >
      <h2 className="m-0">
        <button
          type="button"
          id={`${id}-t`}
          aria-expanded={open}
          aria-controls={`${id}-c`}
          onClick={onOpen}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-3 focus-visible:outline-gps-blue md:px-5"
        >
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-extrabold ${status === "done" ? "bg-wa text-white" : "bg-ink text-white"}`}
          >
            {status === "done" ? "✓" : n}
          </span>
          <span className="min-w-0 flex-1 text-[15.5px] font-extrabold tracking-wide uppercase">{title}</span>
          <span className={`rounded-[4px] px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ${tone}`}>
            {statusLabel}
          </span>
        </button>
      </h2>
      {open ? (
        <div id={`${id}-c`} className="grid gap-4 border-t border-line p-4 md:p-5">
          {children}
          {footer}
        </div>
      ) : null}
    </section>
  );
}
