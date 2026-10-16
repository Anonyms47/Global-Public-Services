"use client";

import { useState } from "react";
import {
  archiveCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  restoreCategoryAction,
  saveCategoryAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { slugify } from "@/lib/format";
import { ActionFeedback, useAction } from "./useAction";
import { MediaPicker } from "./MediaLibrary";
import { Badge } from "./ui";
import { IconDown, IconUp } from "../ui/icons";

export interface Cat {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  visible: boolean;
  featured: boolean;
  archived: boolean;
  /** Produits publiés / tous les produits rattachés. */
  published: number;
  total: number;
}

const empty = { name: "", slug: "", description: "", imageUrl: null as string | null, visible: true, featured: false };

/** Gestion des catégories (structure plate) : création, adresse, couverture, visibilité, ordre, archivage. */
export function CategoryManager({ categories }: { categories: Cat[] }) {
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState(empty);
  const [slugTouched, setSlugTouched] = useState(false);
  const [closing, setClosing] = useState<{ cat: Cat; mode: "archive" | "delete" } | null>(null);
  const [target, setTarget] = useState("");
  const { run, pending, failure, success, fieldErrors } = useAction();
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const start = (c: Cat | null) => {
    setEditing(c);
    setSlugTouched(!!c);
    setForm(c ? { ...c } : empty);
  };
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const row = (c: Cat, i: number, list: Cat[]) => (
    <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
      <span className="w-6 text-ink-mute tabular">{c.archived ? "—" : i + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {c.name}{" "}
          {c.archived ? (
            <Badge tone="neutral">Archivée</Badge>
          ) : !c.visible ? (
            <Badge tone="warn">Masquée</Badge>
          ) : c.published === 0 ? (
            <Badge tone="neutral">Vide : invisible sur le site</Badge>
          ) : (
            <Badge tone="green">En ligne</Badge>
          )}{" "}
          {c.featured ? <Badge tone="blue">Accueil</Badge> : null}
        </p>
        <p className="text-[13px] break-all text-ink-mute">
          /categories/{c.slug} · {c.published} publié(s) sur {c.total}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {c.archived ? (
          <>
            <button
              className="btn btn-outline btn-sm"
              disabled={pending}
              onClick={() => run(() => restoreCategoryAction(c.id))}
            >
              Restaurer
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={() => (c.total ? setClosing({ cat: c, mode: "delete" }) : run(() => deleteCategoryAction(c.id)))}
            >
              Supprimer
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-ghost btn-sm px-2"
              disabled={i === 0 || pending}
              onClick={() => run(() => moveCategoryAction(c.id, -1))}
              aria-label={`Monter ${c.name}`}
            >
              <IconUp size={18} />
            </button>
            <button
              className="btn btn-ghost btn-sm px-2"
              disabled={i === list.length - 1 || pending}
              onClick={() => run(() => moveCategoryAction(c.id, 1))}
              aria-label={`Descendre ${c.name}`}
            >
              <IconDown size={18} />
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => start(c)}>
              Modifier
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                c.total ? setClosing({ cat: c, mode: "archive" }) : run(() => archiveCategoryAction(c.id))
              }
            >
              Archiver
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="grid content-start gap-4">
        <ol className="divide-y divide-line rounded-[6px] border border-line bg-card" aria-label="Catégories actives">
          {active.map((c, i) => row(c, i, active))}
          {active.length === 0 ? <li className="p-4 text-ink-mute">Aucune catégorie.</li> : null}
        </ol>
        {closing ? (
          <div
            className="grid gap-2 rounded-[6px] border border-warn/40 bg-warn-soft p-3 text-[14px]"
            role="dialog"
            aria-label="Déplacer les produits"
          >
            <p>
              « {closing.cat.name} » contient {closing.cat.total} produit(s). Choisissez où les déplacer avant de
              {closing.mode === "archive" ? " l'archiver" : " la supprimer"}.
            </p>
            <label className="label" htmlFor="cat-target">
              Déplacer les produits vers
            </label>
            <select id="cat-target" className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choisir…</option>
              {active
                .filter((c) => c.id !== closing.cat.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setClosing(null)}>
                Annuler
              </button>
              <button
                className="btn btn-blue btn-sm"
                disabled={!target || pending}
                onClick={() =>
                  run(
                    () =>
                      closing.mode === "archive"
                        ? archiveCategoryAction(closing.cat.id, target)
                        : deleteCategoryAction(closing.cat.id, target),
                    { onSuccess: () => (setClosing(null), setTarget("")) },
                  )
                }
              >
                Déplacer et {closing.mode === "archive" ? "archiver" : "supprimer"}
              </button>
            </div>
          </div>
        ) : null}
        {archived.length ? (
          <details className="rounded-[6px] border border-line bg-card">
            <summary className="cursor-pointer p-3 font-bold">Archivées ({archived.length})</summary>
            <ol className="divide-y divide-line border-t border-line">{archived.map((c, i) => row(c, i, archived))}</ol>
          </details>
        ) : null}
        <ActionFeedback failure={failure} success={success} />
      </div>

      <form
        className="grid content-start gap-3 rounded-[6px] border border-line bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveCategoryAction({ id: editing?.id, ...form }), { onSuccess: () => start(null) });
        }}
      >
        <h2 className="font-bold">{editing ? `Modifier « ${editing.name} »` : "Nouvelle catégorie"}</h2>
        <div>
          <label className="label" htmlFor="cat-name">
            Nom *
          </label>
          <input
            id="cat-name"
            className="field"
            value={form.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
            aria-invalid={!!fieldErrors.name}
          />
          {fieldErrors.name ? <p className="error-text">{fieldErrors.name}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="cat-slug">
            Adresse sur le site
          </label>
          <input
            id="cat-slug"
            className="field"
            value={form.slug}
            onChange={(e) => (setSlugTouched(true), set({ slug: e.target.value }))}
            aria-describedby="cat-slug-hint"
            aria-invalid={!!fieldErrors.slug}
          />
          <p id="cat-slug-hint" className="hint">
            /categories/{slugify(form.slug || form.name) || "…"} — créée automatiquement depuis le nom.
          </p>
          {fieldErrors.slug ? <p className="error-text">{fieldErrors.slug}</p> : null}
        </div>
        <div>
          <label className="label" htmlFor="cat-desc">
            Description
          </label>
          <textarea
            id="cat-desc"
            rows={3}
            className="field"
            maxLength={300}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
        <div>
          <span className="label">Photo de couverture</span>
          {form.imageUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.imageUrl} alt="" className="h-16 w-20 rounded-[4px] object-cover" />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ imageUrl: null })}>
                Retirer
              </button>
            </div>
          ) : (
            <p className="hint">Sinon, la photo d&apos;un de ses produits est utilisée.</p>
          )}
          <MediaPicker onPick={(img) => img.kind === "image" && set({ imageUrl: img.url })} />
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={form.visible} onChange={(e) => set({ visible: e.target.checked })} />
          Publiée sur le site (affichée seulement si elle contient un produit publié)
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={form.featured} onChange={(e) => set({ featured: e.target.checked })} />
          Mise en avant sur l&apos;accueil
        </label>
        <div className="flex gap-2">
          {editing ? (
            <button type="button" className="btn btn-ghost" onClick={() => start(null)}>
              Annuler
            </button>
          ) : null}
          <button className="btn btn-blue" disabled={pending || !form.name.trim()}>
            {editing ? "Enregistrer" : "Créer la catégorie"}
          </button>
        </div>
      </form>
    </div>
  );
}
