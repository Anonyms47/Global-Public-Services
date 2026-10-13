"use client";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-site py-20">
      <p className="eyebrow text-gps-red-ink">Erreur</p>
      <h1 className="mt-2 font-display text-[48px] leading-none font-extrabold uppercase md:text-[72px]">
        Un souci de chargement
      </h1>
      <p className="mt-4 max-w-lg text-ink-soft">
        La page n&apos;a pas pu être chargée. Votre panier est conservé sur cet appareil.
      </p>
      {error.digest ? <p className="hint">Code : {error.digest}</p> : null}
      <button type="button" onClick={reset} className="btn btn-primary mt-6">
        Réessayer
      </button>
    </div>
  );
}
