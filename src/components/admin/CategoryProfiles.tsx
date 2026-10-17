"use client";

import { useState } from "react";
import { saveCategoryProfileAction } from "@/app/comptoir/(app)/catalogue/actions";
import { defaultProfile, type CategoryProfile } from "@/lib/product-kit";
import { ActionFeedback, useAction } from "./useAction";

/** « Libellé : choix 1, choix 2 » par ligne, dans un sens comme dans l'autre. */
const fieldsToText = (fields: NonNullable<CategoryProfile["fields"]>) =>
  fields.map((f) => (f.options?.length ? `${f.label} : ${f.options.join(", ")}` : f.label)).join("\n");
const textToFields = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf(":");
      const [label, rest] = i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 1)];
      const options = (rest ?? "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      return options.length ? { label: label.trim(), options } : { label: label.trim() };
    });
const lines = (text: string) =>
  text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function ProfileForm({ id, name, profile }: { id: string; name: string; profile: CategoryProfile | null }) {
  const base = defaultProfile(name);
  const [fields, setFields] = useState(fieldsToText(profile?.fields ?? base.fields));
  const [axes, setAxes] = useState((profile?.variantAxes ?? base.variantAxes).join("\n"));
  const { run, pending, failure, success } = useAction();
  const axisList = lines(axes);
  return (
    <details className="rounded-[6px] border border-line bg-card" data-testid={`profil-${name}`}>
      <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 font-bold">
        {name}
        <span className="text-[13px] font-normal text-ink-mute">
          {profile ? "Profil personnalisé" : "Profil par défaut"} · variantes :{" "}
          {axisList.length ? axisList.join(", ") : "aucune (une fiche par version)"}
        </span>
      </summary>
      <form
        className="grid gap-4 border-t border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveCategoryProfileAction(id, { fields: textToFields(fields), variantAxes: axisList }));
        }}
      >
        <div>
          <label className="label" htmlFor={`pf-fields-${id}`}>
            Champs demandés dans la fiche
          </label>
          <textarea
            id={`pf-fields-${id}`}
            className="field min-h-40 font-mono text-[14px]"
            value={fields}
            onChange={(e) => setFields(e.target.value)}
          />
          <p className="hint">
            Un champ par ligne, dans l&apos;ordre de saisie. Choix rapides après « : », séparés par des virgules (ex. «
            Type de coque : Silicone, Cuir »). Marque, modèle et garantie restent toujours proposés.
          </p>
        </div>
        <div>
          <label className="label" htmlFor={`pf-axes-${id}`}>
            Options de variantes proposées
          </label>
          <textarea
            id={`pf-axes-${id}`}
            className="field min-h-20 font-mono text-[14px]"
            value={axes}
            onChange={(e) => setAxes(e.target.value)}
          />
          <p className="hint">
            Une par ligne, seulement ce que le client peut réellement choisir en boutique (ex. Couleur pour les coques,
            Longueur pour les câbles). Vide : chaque version est une fiche séparée (chargeurs, batteries externes).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-blue btn-sm" disabled={pending}>
            Enregistrer le profil
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() =>
              run(() => saveCategoryProfileAction(id, null), {
                onSuccess: () => (setFields(fieldsToText(base.fields)), setAxes(base.variantAxes.join("\n"))),
              })
            }
          >
            Revenir au profil par défaut
          </button>
        </div>
        <ActionFeedback failure={failure} success={success} />
      </form>
    </details>
  );
}

/** Catalogue → Catégories : champs de la fiche produit et options de variantes, par catégorie. */
export function CategoryProfiles({
  categories,
}: {
  categories: { id: string; name: string; profile: CategoryProfile | null }[];
}) {
  return (
    <section className="mt-10" aria-labelledby="t-profils">
      <h2 id="t-profils" className="font-display text-2xl font-bold uppercase">
        Champs de la fiche produit
      </h2>
      <p className="mb-3 max-w-2xl text-[15px] text-ink-soft">
        Ce que la fiche demande pour chaque catégorie, et les options qu&apos;un client peut choisir. Une
        caractéristique technique (puissance, capacité) n&apos;est pas une variante : un chargeur par puissance, une
        batterie par capacité.
      </p>
      <div className="grid gap-2">
        {categories.map((c) => (
          <ProfileForm key={c.id} {...c} />
        ))}
      </div>
    </section>
  );
}
