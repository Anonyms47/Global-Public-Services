"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="border-line bg-card rounded-[6px] border p-8">
      <h1 className="font-display text-3xl font-bold uppercase">
        Chargement impossible
      </h1>
      <p className="text-ink-soft mt-2">
        Les données n&apos;ont pas pu être chargées. Aucune saisie n&apos;a été
        envoyée.
      </p>
      {error.digest ? <p className="hint">Code : {error.digest}</p> : null}
      <button type="button" onClick={reset} className="btn btn-blue mt-4">
        Réessayer
      </button>
    </div>
  );
}
