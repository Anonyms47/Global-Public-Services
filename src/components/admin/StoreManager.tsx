"use client";

import { useState } from "react";
import { moveStoreAction, saveStoreAction } from "@/app/comptoir/(app)/parametres/actions";
import { DAYS, defaultHours, hoursText, type Store } from "@/lib/stores";

type StoreInput = Omit<Store, "id" | "position"> & { id?: string; position?: number };
import { ActionFeedback, useAction } from "./useAction";
import { MediaPicker } from "./MediaLibrary";
import { Badge } from "./ui";
import { IconDown, IconUp } from "../ui/icons";

const blank: StoreInput = {
  name: "",
  address: "",
  district: "",
  city: "",
  landmark: "",
  maps_url: "",
  hours: defaultHours,
  closures: [],
  photo_url: null,
  phone: "",
  services: "",
  pickup_enabled: true,
  counter_enabled: true,
  is_main: false,
  published: true,
};

/** Points de vente : liste ordonnée et fiche complète (le stock reste commun). */
export function StoreManager({ stores }: { stores: Store[] }) {
  const [form, setForm] = useState<StoreInput | null>(null);
  const { run, pending, failure, success, fieldErrors } = useAction();
  const set = (p: Partial<StoreInput>) => setForm((f) => (f ? { ...f, ...p } : f));
  const text = (key: keyof StoreInput, label: string, opts: { type?: string; inputMode?: "tel" | "url" } = {}) => (
    <div>
      <label className="label" htmlFor={`st-${key}`}>
        {label}
      </label>
      <input
        id={`st-${key}`}
        className="field"
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        value={String(form?.[key] ?? "")}
        onChange={(e) => set({ [key]: e.target.value } as Partial<StoreInput>)}
        aria-invalid={!!fieldErrors[key]}
      />
      {fieldErrors[key] ? <p className="error-text">{fieldErrors[key]}</p> : null}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_440px]">
      <div className="grid content-start gap-3">
        <ol className="divide-y divide-line rounded-[6px] border border-line bg-card" aria-label="Points de vente">
          {stores.map((st, i) => (
            <li key={st.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {st.name} {st.is_main ? <Badge tone="blue">Principale</Badge> : null}{" "}
                  <Badge tone={st.published ? "green" : "neutral"}>{st.published ? "En ligne" : "Masquée"}</Badge>
                </p>
                <p className="text-[13px] text-ink-mute">
                  {[st.district, st.city].filter(Boolean).join(", ")} · {hoursText(st.hours)}
                  {st.pickup_enabled ? " · retrait" : ""}
                  {st.counter_enabled ? " · comptoir" : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  className="btn btn-ghost btn-sm px-2"
                  disabled={i === 0 || pending}
                  onClick={() => run(() => moveStoreAction(st.id, -1))}
                  aria-label={`Monter ${st.name}`}
                >
                  <IconUp size={18} />
                </button>
                <button
                  className="btn btn-ghost btn-sm px-2"
                  disabled={i === stores.length - 1 || pending}
                  onClick={() => run(() => moveStoreAction(st.id, 1))}
                  aria-label={`Descendre ${st.name}`}
                >
                  <IconDown size={18} />
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setForm({ ...blank, ...st })}>
                  Modifier
                </button>
              </div>
            </li>
          ))}
          {stores.length === 0 ? <li className="p-4 text-ink-mute">Aucun point de vente.</li> : null}
        </ol>
        <button className="btn btn-blue justify-self-start" onClick={() => setForm({ ...blank })}>
          Ajouter un point de vente
        </button>
        <ActionFeedback failure={failure} success={success} />
      </div>

      {form ? (
        <form
          className="grid content-start gap-3 rounded-[6px] border border-line bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveStoreAction(form), { onSuccess: () => setForm(null) });
          }}
        >
          <h2 className="font-bold">{form.id ? `Modifier « ${form.name} »` : "Nouveau point de vente"}</h2>
          {text("name", "Nom (identifiant interne) *")}
          {text("address", "Adresse")}
          <div className="grid grid-cols-2 gap-2">
            {text("district", "Quartier")}
            {text("city", "Localité")}
          </div>
          {text("landmark", "Repère")}
          {text("maps_url", "Lien Google Maps", { type: "url", inputMode: "url" })}
          {text("phone", "Téléphone de la boutique", { type: "tel", inputMode: "tel" })}
          {text("services", "Services proposés")}
          <fieldset className="grid gap-2">
            <legend className="label">Horaires</legend>
            <div className="flex flex-wrap items-center gap-2 text-[14px]">
              Plage par défaut
              <input
                type="time"
                className="field h-10 min-h-10 w-28"
                aria-label="Ouverture"
                value={form.hours.open}
                onChange={(e) => set({ hours: { ...form.hours, open: e.target.value } })}
              />
              –
              <input
                type="time"
                className="field h-10 min-h-10 w-28"
                aria-label="Fermeture"
                value={form.hours.close}
                onChange={(e) => set({ hours: { ...form.hours, close: e.target.value } })}
              />
            </div>
            <p className="hint">
              Cochez les jours d&apos;ouverture confirmés. Sans jour coché, le site affiche seulement la plage horaire.
            </p>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {DAYS.map(([k, label]) => (
                <label key={k} className="flex min-h-10 items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={!!form.hours.days[k]?.enabled}
                    onChange={(e) =>
                      set({
                        hours: { ...form.hours, days: { ...form.hours.days, [k]: { enabled: e.target.checked } } },
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-2">
            <legend className="label">Fermetures exceptionnelles</legend>
            {form.closures.map((c, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  type="date"
                  className="field h-10 min-h-10 w-40"
                  aria-label={`Date de fermeture ${i + 1}`}
                  value={c.date}
                  onChange={(e) =>
                    set({ closures: form.closures.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })
                  }
                />
                <input
                  className="field h-10 min-h-10 min-w-0 flex-1"
                  aria-label={`Motif ${i + 1}`}
                  placeholder="Motif (facultatif)"
                  value={c.note}
                  onChange={(e) =>
                    set({ closures: form.closures.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => set({ closures: form.closures.filter((_, j) => j !== i) })}
                >
                  Retirer
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outline btn-sm justify-self-start"
              onClick={() => set({ closures: [...form.closures, { date: "", note: "" }] })}
            >
              Ajouter une fermeture
            </button>
          </fieldset>
          <div>
            <span className="label">Photo</span>
            {form.photo_url ? (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.photo_url} alt="" className="h-16 w-20 rounded-[4px] object-cover" />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ photo_url: null })}>
                  Retirer
                </button>
              </div>
            ) : null}
            <MediaPicker onPick={(img) => img.kind === "image" && set({ photo_url: img.url })} />
          </div>
          {(
            [
              ["pickup_enabled", "Retrait des commandes"],
              ["counter_enabled", "Vente au comptoir"],
              ["is_main", "Boutique principale"],
              ["published", "Publiée sur le site"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={form[k]} onChange={(e) => set({ [k]: e.target.checked })} />
              {label}
            </label>
          ))}
          <div className="sticky bottom-0 flex gap-2 bg-card py-2">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Annuler
            </button>
            <button className="btn btn-blue" disabled={pending || !form.name.trim()}>
              Enregistrer
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
