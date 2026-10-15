"use client";

import { useActionState } from "react";
import { installAction } from "./actions";

const fields = [
  {
    name: "code",
    label: "Code d'installation",
    type: "password",
    auto: "off",
    hint: "Défini dans Vercel (COMPTOIR_SETUP_CODE).",
  },
  { name: "name", label: "Votre nom", type: "text", auto: "name" },
  { name: "email", label: "Adresse e-mail", type: "email", auto: "username" },
  { name: "password", label: "Mot de passe", type: "password", auto: "new-password", hint: "12 caractères minimum." },
  { name: "confirm", label: "Confirmer le mot de passe", type: "password", auto: "new-password" },
] as const;

export function InstallForm() {
  const [state, action, pending] = useActionState(installAction, null);
  return (
    <form action={action} className="mt-6 grid gap-5">
      {state?.error ? (
        <p role="alert" className="rounded-[6px] bg-gps-red-soft p-3 text-[15px] font-semibold text-gps-red-ink">
          {state.error}
        </p>
      ) : null}
      {fields.map((f) => {
        const err = state?.fieldErrors?.[f.name];
        const hint = "hint" in f ? f.hint : "";
        return (
          <div key={f.name}>
            <label className="label" htmlFor={`inst-${f.name}`}>
              {f.label}
            </label>
            <input
              id={`inst-${f.name}`}
              name={f.name}
              type={f.type}
              required
              autoComplete={f.auto}
              defaultValue={f.name === "name" ? state?.name : f.name === "email" ? state?.email : undefined}
              aria-invalid={err ? true : undefined}
              aria-describedby={err || hint ? `inst-${f.name}-aide` : undefined}
              className="field"
            />
            {err || hint ? (
              <p
                id={`inst-${f.name}-aide`}
                className={err ? "mt-1 text-[14px] font-semibold text-gps-red-ink" : "hint mt-1"}
              >
                {err || hint}
              </p>
            ) : null}
          </div>
        );
      })}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Création…" : "Créer le compte propriétaire"}
      </button>
    </form>
  );
}
