"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { changePasswordAction, revokeOtherSessionsAction } from "@/app/comptoir/(app)/mon-compte/actions";
import { ActionFeedback, useAction } from "./useAction";

export function PasswordForm({ min, redirectTo }: { min: number; redirectTo?: string }) {
  const router = useRouter();
  const a = useAction();
  const [f, setF] = useState({ current: "", password: "", confirm: "" });
  const field = (id: keyof typeof f, label: string, autoComplete: string, hint?: string) => (
    <div>
      <label className="label" htmlFor={`acc-${id}`}>
        {label}
      </label>
      <input
        id={`acc-${id}`}
        type="password"
        className="field"
        autoComplete={autoComplete}
        value={f[id]}
        onChange={(e) => setF({ ...f, [id]: e.target.value })}
        aria-invalid={!!a.failure?.fieldErrors?.[id]}
        aria-describedby={hint ? `acc-${id}-aide` : undefined}
      />
      {a.failure?.fieldErrors?.[id] ? (
        <p className="mt-1 text-[13px] font-semibold text-gps-red-ink">{a.failure.fieldErrors[id]}</p>
      ) : hint ? (
        <p id={`acc-${id}-aide`} className="hint mt-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(() => changePasswordAction(f), {
          onSuccess: () => {
            setF({ current: "", password: "", confirm: "" });
            if (redirectTo) router.push(redirectTo);
          },
        });
      }}
    >
      {field("current", "Mot de passe actuel", "current-password")}
      {field("password", "Nouveau mot de passe", "new-password", `${min} caractères minimum, différent de l'actuel.`)}
      {field("confirm", "Confirmer le nouveau mot de passe", "new-password")}
      <ActionFeedback failure={a.failure} success={a.success} />
      <button className="btn btn-blue" disabled={a.pending || f.password.length < min || !f.current}>
        {a.pending ? "Enregistrement…" : "Changer le mot de passe"}
      </button>
    </form>
  );
}

export function RevokeSessionsButton() {
  const a = useAction();
  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={a.pending}
        onClick={() => a.run(() => revokeOtherSessionsAction(), { successMessage: "Autres appareils déconnectés." })}
      >
        Déconnecter mes autres appareils
      </button>
      <ActionFeedback failure={a.failure} success={a.success} />
    </div>
  );
}
