"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCustomerAction, updateCustomerAction } from "@/app/comptoir/(app)/clients/actions";
import { phoneMatchesAction } from "@/app/comptoir/(app)/commandes/actions";
import { ActionFeedback, useAction } from "./useAction";
import { Sheet } from "../ui/Sheet";
import { IconAlert, IconPlus } from "../ui/icons";

interface Fields {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

function CustomerFields({
  f,
  set,
  errors,
  disabled,
}: {
  f: Fields;
  set: (p: Partial<Fields>) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="grid gap-3">
      {(
        [
          ["name", "Nom", "name"],
          ["phone", "Téléphone", "tel"],
          ["email", "E-mail (facultatif)", "email"],
        ] as const
      ).map(([k, label, ac]) => (
        <div key={k}>
          <label className="label" htmlFor={`cf-${k}`}>
            {label}
          </label>
          <input
            id={`cf-${k}`}
            className="field"
            autoComplete={ac}
            value={f[k]}
            onChange={(e) => set({ [k]: e.target.value })}
            aria-invalid={!!errors[k]}
          />
          {errors[k] ? <p className="error-text">{errors[k]}</p> : null}
        </div>
      ))}
      <div>
        <label className="label" htmlFor="cf-address">
          Adresse (facultatif)
        </label>
        <textarea
          id="cf-address"
          rows={2}
          className="field"
          value={f.address}
          onChange={(e) => set({ address: e.target.value })}
        />
      </div>
      <div>
        <label className="label" htmlFor="cf-notes">
          Notes professionnelles
        </label>
        <textarea
          id="cf-notes"
          rows={3}
          className="field"
          value={f.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Préférences de contact, pointure habituelle… (pas d'information sensible)"
        />
      </div>
    </fieldset>
  );
}

export function NewCustomerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Fields>({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [matches, setMatches] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [allow, setAllow] = useState(false);
  const { run, pending, failure, fieldErrors } = useAction();
  const set = (p: Partial<Fields>) => {
    setF({ ...f, ...p });
    if (p.phone !== undefined) setAllow(false);
  };
  return (
    <>
      <button type="button" className="btn btn-blue" onClick={() => setOpen(true)}>
        <IconPlus size={18} /> Nouveau client
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nouveau client" side="right">
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const m = await phoneMatchesAction(f.phone).catch(() => null);
            const found = m?.ok ? m.data : [];
            setMatches(found);
            if (found.length && !allow) return;
            run(() => createCustomerAction(f, allow), {
              onSuccess: (id) => router.push(`/comptoir/clients/${id}`),
            });
          }}
        >
          <CustomerFields f={f} set={set} errors={fieldErrors} />
          {matches.length ? (
            <div role="alert" className="rounded-[6px] border-[1.5px] border-warn/40 bg-warn-soft p-3 text-[14px]">
              <p className="flex items-center gap-2 font-bold text-warn">
                <IconAlert size={18} /> Ce numéro correspond déjà à :
              </p>
              <ul className="mt-1">
                {matches.map((m) => (
                  <li key={m.id}>
                    <a className="font-semibold text-gps-blue underline" href={`/comptoir/clients/${m.id}`}>
                      {m.name} ({m.phone})
                    </a>
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} /> Il s&apos;agit
                d&apos;une autre personne : créer quand même
              </label>
            </div>
          ) : null}
          <ActionFeedback failure={failure} />
          <button className="btn btn-blue" disabled={pending || !f.name.trim()}>
            Créer la fiche
          </button>
        </form>
      </Sheet>
    </>
  );
}

export function CustomerEditForm({ id, initial, canEdit }: { id: string; initial: Fields; canEdit: boolean }) {
  const [f, setF] = useState<Fields>(initial);
  const { run, pending, failure, success, fieldErrors } = useAction();
  return (
    <form
      className="grid gap-4 rounded-[6px] border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateCustomerAction(id, f));
      }}
    >
      <h2 className="text-[15px] font-extrabold tracking-wide uppercase">Fiche</h2>
      <CustomerFields f={f} set={(p) => setF({ ...f, ...p })} errors={fieldErrors} disabled={!canEdit} />
      <ActionFeedback failure={failure} success={success} />
      {canEdit ? (
        <button className="btn btn-blue" disabled={pending}>
          Enregistrer
        </button>
      ) : null}
    </form>
  );
}
