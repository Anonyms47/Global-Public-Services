/** Mention de réalisation du site, affichée dans le pied de page, le Comptoir et sa page de connexion. */
export function DriftyCredit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[12.5px] text-ink-mute ${className}`}>
      Site réalisé par{" "}
      <a
        href="https://driftysn.com/fr"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-6 items-center font-semibold underline underline-offset-2 hover:text-ink"
      >
        Drifty
      </a>
    </p>
  );
}
