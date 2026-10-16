"use client";

import Image from "next/image";
import { useState } from "react";
import { deleteServiceAction, saveServiceAction, saveStorefrontAction } from "@/app/comptoir/(app)/vitrine/actions";
import { optimizePhoto, precheck, uploadFile } from "@/lib/upload";
import type { Service } from "@/server/domain/services";
import { ActionFeedback, useAction } from "./useAction";
import { proposals } from "@/lib/content-proposals";
import { Badge } from "./ui";
import { IconDown, IconPlus, IconTrash, IconUp, IconUpload } from "../ui/icons";

interface P {
  id: string;
  name: string;
  image: string | null;
}

interface State {
  heroProductId: string | null;
  focusProductId: string | null;
  focusText: string;
  storeText: string;
  storePhotoUrl: string;
  selection: string[];
}

export function StorefrontEditor({ products, initial }: { products: P[]; initial: State }) {
  const [s, setS] = useState(initial);
  const [add, setAdd] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { run, pending, failure, success } = useAction();
  const byId = (id: string | null) => products.find((p) => p.id === id);
  const move = (i: number, d: -1 | 1) => {
    const sel = [...s.selection];
    const j = i + d;
    if (j < 0 || j >= sel.length) return;
    [sel[i], sel[j]] = [sel[j], sel[i]];
    setS({ ...s, selection: sel });
  };
  const select = (id: string, label: string, value: string | null, on: (v: string | null) => void) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="field" value={value ?? ""} onChange={(e) => on(e.target.value || null)}>
        <option value="">Automatique</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form
      className="grid gap-6 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveStorefrontAction(s));
      }}
    >
      <section
        className="grid content-start gap-4 rounded-[6px] border border-line bg-card p-4"
        aria-labelledby="t-vedette"
      >
        <h2 id="t-vedette" className="text-[15px] font-extrabold tracking-wide uppercase">
          Première vitrine & focus
        </h2>
        {select("sf-hero", "Vedette de l'accueil (une seule, sans carrousel)", s.heroProductId, (v) =>
          setS({ ...s, heroProductId: v }),
        )}
        {byId(s.heroProductId)?.image ? (
          <Image
            src={byId(s.heroProductId)!.image!}
            alt=""
            width={120}
            height={150}
            unoptimized={
              byId(s.heroProductId)!.image!.endsWith(".svg") || byId(s.heroProductId)!.image!.startsWith("/media/")
            }
            className="aspect-[4/5] w-24 rounded-[4px] object-cover"
          />
        ) : null}
        {select("sf-focus", "Article en focus", s.focusProductId, (v) => setS({ ...s, focusProductId: v }))}
        <div>
          <label className="label" htmlFor="sf-focus-text">
            Texte du focus <span className="font-normal text-ink-mute">(sinon la description du produit)</span>
          </label>
          <textarea
            id="sf-focus-text"
            rows={3}
            className="field"
            value={s.focusText}
            onChange={(e) => setS({ ...s, focusText: e.target.value })}
          />
          <UseProposal value={s.focusText} proposal={proposals.focusText} onUse={(v) => setS({ ...s, focusText: v })} />
        </div>
        <p className="hint">Le prix affiché vient toujours du catalogue (promotion comprise).</p>
      </section>

      <section
        className="grid content-start gap-3 rounded-[6px] border border-line bg-card p-4"
        aria-labelledby="t-selection"
      >
        <h2 id="t-selection" className="text-[15px] font-extrabold tracking-wide uppercase">
          Sélection GPS ({s.selection.length})
        </h2>
        <ol className="divide-y divide-line-soft">
          {s.selection.map((id, i) => (
            <li key={id} className="flex items-center gap-2 py-2">
              <span className="w-5 text-ink-mute tabular">{i + 1}</span>
              <span className="flex-1 font-semibold">{byId(id)?.name ?? "Produit retiré"}</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm px-2"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label="Monter"
              >
                <IconUp size={18} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm px-2"
                disabled={i === s.selection.length - 1}
                onClick={() => move(i, 1)}
                aria-label="Descendre"
              >
                <IconDown size={18} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm px-2"
                onClick={() => setS({ ...s, selection: s.selection.filter((x) => x !== id) })}
                aria-label={`Retirer ${byId(id)?.name ?? ""}`}
              >
                <IconTrash size={18} />
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <label htmlFor="sf-add" className="sr-only">
            Ajouter à la sélection
          </label>
          <select id="sf-add" className="field" value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Ajouter un produit publié…</option>
            {products
              .filter((p) => !s.selection.includes(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!add}
            onClick={() => (setS({ ...s, selection: [...s.selection, add] }), setAdd(""))}
          >
            <IconPlus size={18} />
          </button>
        </div>
        <p className="hint">
          L&apos;accueil affiche les 4 premiers après la vedette ; le premier occupe la grande case.
        </p>
      </section>

      <section
        className="grid content-start gap-4 rounded-[6px] border border-line bg-card p-4 lg:col-span-2"
        aria-labelledby="t-boutique"
      >
        <h2 id="t-boutique" className="text-[15px] font-extrabold tracking-wide uppercase">
          Boutique physique
        </h2>
        <div className="grid gap-4 md:grid-cols-[240px_1fr]">
          <div>
            {s.storePhotoUrl ? (
              <Image
                src={s.storePhotoUrl}
                alt="Photo de la boutique"
                width={480}
                height={340}
                unoptimized={s.storePhotoUrl.startsWith("/media/")}
                className="aspect-[7/5] w-full rounded-[4px] object-cover"
              />
            ) : (
              <div className="flex aspect-[7/5] items-center justify-center rounded-[4px] border-2 border-dashed border-line text-[13px] text-ink-mute">
                Aucune photo
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <label className="btn btn-outline btn-sm cursor-pointer">
                <IconUpload size={16} /> Photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setUploadError(null);
                    // Photo réduite dans le navigateur puis envoyée (type vérifié côté serveur).
                    const photo = await optimizePhoto(file);
                    const problem = precheck(photo, true);
                    if (problem) return setUploadError(problem);
                    const r = await uploadFile(photo, { photosOnly: true });
                    if (r.ok) setS((x) => ({ ...x, storePhotoUrl: r.data.url }));
                    else setUploadError(r.error);
                  }}
                />
              </label>
              {s.storePhotoUrl ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setS({ ...s, storePhotoUrl: "" })}
                >
                  Retirer
                </button>
              ) : null}
            </div>
            {uploadError ? <p className="error-text">{uploadError}</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="sf-store">
              Présentation de la boutique
            </label>
            <textarea
              id="sf-store"
              rows={5}
              className="field"
              value={s.storeText}
              onChange={(e) => setS({ ...s, storeText: e.target.value })}
              placeholder="Texte validé par GPS (histoire, équipe, ce qu'on trouve au comptoir…)"
            />
            <UseProposal
              value={s.storeText}
              proposal={proposals.storeText}
              onUse={(v) => setS({ ...s, storeText: v })}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button className="btn btn-blue" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer la vitrine"}
        </button>
        <ActionFeedback failure={failure} success={success} />
      </div>
    </form>
  );
}

const emptyService = {
  title: "",
  summary: "",
  operators: "",
  operations: "",
  hours: "",
  confirmed: false,
};

export function ServicesEditor({ services }: { services: Service[] }) {
  const [editing, setEditing] = useState<(typeof emptyService & { id?: string }) | null>(null);
  const { run, pending, failure, success } = useAction();
  return (
    <section className="mt-10" aria-labelledby="t-services">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="t-services" className="font-display text-3xl font-bold uppercase">
          Services de transfert d&apos;argent
        </h2>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing({ ...emptyService })}>
          <IconPlus size={16} /> Ajouter un service
        </button>
      </div>
      <p className="mb-3 max-w-2xl text-[14px] text-ink-soft">
        Seuls les services marqués « confirmé » sont présentés comme tels sur le site. N&apos;indiquez un opérateur
        qu&apos;après accord effectif. Aucun transfert n&apos;est réalisé ni enregistré en ligne.
      </p>
      <ActionFeedback failure={failure} success={success} />
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {services.map((sv) => (
          <li key={sv.id} className="rounded-[6px] border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">{sv.title}</p>
              <div className="flex gap-1">
                {sv.confirmed ? <Badge tone="green">Confirmé</Badge> : <Badge tone="warn">À confirmer</Badge>}
                {sv.is_demo ? <Badge>Exemple</Badge> : null}
              </div>
            </div>
            <p className="mt-1 text-[14px] text-ink-soft">{sv.summary}</p>
            <p className="mt-1 text-[13px] text-ink-mute">Opérateurs : {sv.operators || "à confirmer"}</p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing({ ...sv })}>
                Modifier
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={() => confirm(`Supprimer « ${sv.title} » ?`) && run(() => deleteServiceAction(sv.id))}
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <form
          className="mt-4 grid gap-3 rounded-[6px] border-[1.5px] border-gps-blue bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveServiceAction(editing), {
              onSuccess: () => setEditing(null),
            });
          }}
        >
          <h3 className="font-bold">{editing.id ? "Modifier le service" : "Nouveau service"}</h3>
          {(
            [
              ["title", "Titre"],
              ["summary", "Résumé"],
              ["operators", "Opérateurs (seulement si confirmés)"],
              ["operations", "Opérations proposées (envoi, retrait…)"],
              ["hours", "Horaires du service"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label className="label" htmlFor={`sv-${k}`}>
                {label}
              </label>
              <input
                id={`sv-${k}`}
                className="field"
                value={editing[k]}
                onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}
              />
              {k === "summary" || k === "operations" ? (
                <UseProposal
                  value={editing[k]}
                  proposal={k === "summary" ? proposals.serviceSummary : proposals.serviceOperations}
                  onUse={(v) => setEditing({ ...editing, [k]: v })}
                />
              ) : null}
            </div>
          ))}
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={editing.confirmed}
              onChange={(e) => setEditing({ ...editing, confirmed: e.target.checked })}
            />{" "}
            Service confirmé par GPS (affiché comme tel)
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button className="btn btn-blue" disabled={pending || !editing.title.trim()}>
              Enregistrer
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function UseProposal({ value, proposal, onUse }: { value: string; proposal: string; onUse: (v: string) => void }) {
  if (value.trim() === proposal) return null;
  return (
    <button
      type="button"
      className="mt-1 inline-flex min-h-10 items-center text-[13px] font-bold text-gps-blue underline underline-offset-2"
      onClick={() => {
        if (!value.trim() || confirm("Remplacer le texte actuel par la proposition GPS ?")) onUse(proposal);
      }}
    >
      Utiliser la proposition GPS
    </button>
  );
}
