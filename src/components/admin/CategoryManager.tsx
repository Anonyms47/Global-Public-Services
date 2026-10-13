"use client";

import { useState } from "react";
import {
  deleteCategoryAction,
  moveCategoryAction,
  saveCategoryAction,
} from "@/app/comptoir/(app)/catalogue/actions";
import { ActionFeedback, useAction } from "./useAction";
import { IconDown, IconUp } from "../ui/icons";

interface Cat {
  id: string;
  name: string;
  description: string;
  count: number;
}

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const [editing, setEditing] = useState<Cat | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { run, pending, failure, success, fieldErrors } = useAction();
  const start = (c: Cat | null) => {
    setEditing(c);
    setName(c?.name ?? "");
    setDescription(c?.description ?? "");
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <ol className="divide-line border-line bg-card divide-y rounded-[6px] border">
        {categories.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="tabular text-ink-mute w-6">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{c.name}</p>
              <p className="text-ink-mute text-[13px]">
                {c.count} produit(s) publié(s)
                {c.description ? ` · ${c.description}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
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
                disabled={i === categories.length - 1 || pending}
                onClick={() => run(() => moveCategoryAction(c.id, 1))}
                aria-label={`Descendre ${c.name}`}
              >
                <IconDown size={18} />
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => start(c)}
              >
                Modifier
              </button>
              <button
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={() =>
                  confirm(`Supprimer la catégorie « ${c.name} » ?`) &&
                  run(() => deleteCategoryAction(c.id))
                }
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
        {categories.length === 0 ? (
          <li className="text-ink-mute p-4">Aucune catégorie.</li>
        ) : null}
      </ol>
      <form
        className="border-line bg-card grid content-start gap-3 rounded-[6px] border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveCategoryAction({ id: editing?.id, name, description }),
            { onSuccess: () => start(null) },
          );
        }}
      >
        <h2 className="font-bold">
          {editing ? `Modifier « ${editing.name} »` : "Nouvelle catégorie"}
        </h2>
        <div>
          <label className="label" htmlFor="cat-name">
            Nom
          </label>
          <input
            id="cat-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!fieldErrors.name}
          />
          {fieldErrors.name ? (
            <p className="error-text">{fieldErrors.name}</p>
          ) : null}
        </div>
        <div>
          <label className="label" htmlFor="cat-desc">
            Description
          </label>
          <textarea
            id="cat-desc"
            rows={3}
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <ActionFeedback failure={failure} success={success} />
        <div className="flex gap-2">
          {editing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => start(null)}
            >
              Annuler
            </button>
          ) : null}
          <button className="btn btn-blue" disabled={pending || !name.trim()}>
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
