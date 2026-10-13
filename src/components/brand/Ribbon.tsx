/**
 * Ruban GPS : la courbe bleue du logo, utilisée comme trait graphique.
 * Décoratif (aria-hidden). `tone` règle la couleur sur fond clair ou bleu.
 */
export function Ribbon({
  className,
  tone = "blue",
  variant = "sweep",
  width = 6,
}: {
  className?: string;
  tone?: "blue" | "white" | "red";
  variant?: "sweep" | "arc";
  width?: number;
}) {
  const color = tone === "white" ? "#ffffff" : tone === "red" ? "#e30713" : "#31277f";
  const id = `rib-${variant}-${tone}`;
  const d = variant === "sweep" ? "M0 330 C 260 420, 640 360, 1000 40" : "M0 200 C 300 330, 700 330, 1000 120";
  return (
    <svg className={className} viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="0.45" stopColor={color} stopOpacity="0.9" />
          <stop offset="1" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={width}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
