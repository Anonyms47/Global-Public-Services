export function DemoBanner() {
  return (
    <div className="bg-gps-blue-night text-white">
      <p className="container-site flex min-h-9 items-center gap-2 py-1.5 text-[13px] leading-snug">
        <span className="rounded-[4px] bg-white px-1.5 py-0.5 text-[11px] font-extrabold tracking-wider text-gps-blue-deep uppercase">
          Démo
        </span>
        <span>
          Présentation : produits, prix, stocks et visuels sont des <strong>exemples fictifs</strong>, à remplacer par
          les données de GPS.
        </span>
      </p>
    </div>
  );
}
