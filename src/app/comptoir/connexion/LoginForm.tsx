"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export function LoginForm({ suite }: { suite: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 grid gap-5">
      <input type="hidden" name="suite" value={suite} />
      {state?.error ? (
        <p role="alert" className="rounded-[6px] bg-gps-red-soft p-3 text-[15px] font-semibold text-gps-red-ink">
          {state.error}
        </p>
      ) : null}
      <div>
        <label className="label" htmlFor="email">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          defaultValue={state?.email}
          className="field"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
        />
      </div>
      <button type="submit" className="btn btn-blue w-full" disabled={pending}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
