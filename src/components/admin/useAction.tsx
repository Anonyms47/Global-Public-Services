"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { IconAlert, IconCheck } from "../ui/icons";

type Failure = Extract<ActionResult<unknown>, { ok: false }>;

/**
 * Exécute une action serveur : un seul envoi à la fois (anti double clic),
 * erreurs conservées pour affichage, saisie jamais effacée en cas d'échec.
 */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const busy = useRef(false);

  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    opts: {
      onSuccess?: (data: T) => void;
      successMessage?: string;
      refresh?: boolean;
    } = {},
  ) {
    if (busy.current) return;
    busy.current = true;
    setFailure(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          setSuccess(opts.successMessage ?? res.message ?? null);
          opts.onSuccess?.(res.data);
          if (opts.refresh !== false) router.refresh();
        } else setFailure(res);
      } catch {
        setFailure({
          ok: false,
          code: "internal",
          error: "Connexion au serveur impossible. Votre saisie est conservée : réessayez.",
        });
      } finally {
        busy.current = false;
      }
    });
  }

  return {
    run,
    pending,
    failure,
    success,
    setFailure,
    setSuccess,
    fieldErrors: failure?.fieldErrors ?? {},
  };
}

export function ActionFeedback({
  failure,
  success,
  onRetry,
}: {
  failure: Failure | null;
  success?: string | null;
  onRetry?: () => void;
}) {
  if (failure) {
    const expired = failure.code === "session_expired";
    return (
      <div
        role="alert"
        className="flex flex-wrap items-start justify-between gap-3 rounded-[6px] border-[1.5px] border-gps-red/30 bg-gps-red-soft p-3 text-[15px] text-gps-red-ink"
      >
        <p className="flex items-start gap-2 font-semibold">
          <IconAlert className="mt-0.5 shrink-0" size={18} />
          <span>
            {failure.error}
            {failure.code === "forbidden" ? " Demandez à un propriétaire si besoin." : null}
          </span>
        </p>
        {expired ? (
          <Link href="/comptoir/connexion?expiree=1" target="_blank" className="btn btn-danger btn-sm">
            Se reconnecter (nouvel onglet)
          </Link>
        ) : onRetry && failure.code === "internal" ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={onRetry}>
            Réessayer
          </button>
        ) : null}
      </div>
    );
  }
  if (success) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 rounded-[6px] bg-wa-soft p-3 text-[15px] font-semibold text-wa-ink"
      >
        <IconCheck size={18} /> {success}
      </p>
    );
  }
  return null;
}
