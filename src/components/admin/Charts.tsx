import { fcfa } from "@/lib/format";

/**
 * Graphiques du tableau de bord, rendus côté serveur en SVG : un seul axe
 * (FCFA), deux séries au plus, légende, infobulle au survol et au clavier
 * (title), et tableau des données pour les lecteurs d'écran ou l'impression.
 * Couleurs validées (contraste, daltonisme) : série 1 #5b4fc4, série 2 #e8590c.
 */
const SERIES = [
  { key: "ca", label: "Chiffre d'affaires", color: "#5b4fc4" },
  { key: "encaissements", label: "Encaissements", color: "#e8590c" },
] as const;

type Point = { label: string; ca: number; encaissements: number };

/** Graduation lisible : 0, puis 1/2/2,5/5 × 10^n. */
function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
const short = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`
    : Math.abs(v) >= 1000
      ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
      : String(v);

export function SeriesChart({ points, title }: { points: Point[]; title: string }) {
  const n = points.length;
  const W = Math.max(560, n * 26);
  const H = 220;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const max = niceMax(Math.max(0, ...points.flatMap((p) => [p.ca, p.encaissements])));
  const min = Math.min(0, ...points.map((p) => p.encaissements));
  const range = max - min || 1;
  const y = (v: number) => pad.t + ((max - v) / range) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / n;
  const bar = Math.max(2, Math.min(18, (slot - 6) / 2));
  const every = Math.ceil(n / Math.floor((W - pad.l) / 44));
  const totals = {
    ca: points.reduce((s, p) => s + p.ca, 0),
    encaissements: points.reduce((s, p) => s + p.encaissements, 0),
  };
  const empty = points.every((p) => p.ca === 0 && p.encaissements === 0);
  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-[3px]" style={{ background: s.color }} />
            {s.label} <strong className="tabular">{fcfa(totals[s.key])}</strong>
          </span>
        ))}
      </figcaption>
      {empty ? (
        <p className="rounded-[6px] bg-paper p-4 text-[14px] text-ink-mute">Aucune opération sur la période.</p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", minWidth: Math.min(W, n * 14 + pad.l) }}
            role="img"
            aria-label={`${title} : ${SERIES.map((s) => `${s.label} ${fcfa(totals[s.key])}`).join(", ")}. Données détaillées dans le tableau qui suit.`}
          >
            {[0, 0.5, 1].map((f) => {
              const v = min + range * f;
              return (
                <g key={f}>
                  <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e6e0d3" strokeWidth={1} />
                  <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b6e76">
                    {short(Math.round(v))}
                  </text>
                </g>
              );
            })}
            {min < 0 ? <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#6b6e76" strokeWidth={1} /> : null}
            {points.map((p, i) => {
              const x0 = pad.l + i * slot + (slot - (bar * 2 + 2)) / 2;
              return (
                <g
                  key={i}
                  tabIndex={0}
                  aria-label={`${p.label} : CA ${fcfa(p.ca)}, encaissements ${fcfa(p.encaissements)}`}
                >
                  <title>{`${p.label}\nChiffre d'affaires : ${fcfa(p.ca)}\nEncaissements : ${fcfa(p.encaissements)}`}</title>
                  {/* Zone de survol plus large que les barres. */}
                  <rect x={pad.l + i * slot} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
                  {SERIES.map((s, k) => {
                    const v = p[s.key];
                    if (!v) return null;
                    const top = Math.min(y(v), y(0));
                    return (
                      <rect
                        key={s.key}
                        x={x0 + k * (bar + 2)}
                        y={top}
                        width={bar}
                        height={Math.max(1, Math.abs(y(v) - y(0)))}
                        rx={Math.min(3, bar / 2)}
                        fill={s.color}
                      />
                    );
                  })}
                  {i % every === 0 ? (
                    <text x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#6b6e76">
                      {p.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <details className="mt-3 text-[14px]">
        <summary className="cursor-pointer font-semibold text-gps-blue">Voir les données en tableau</summary>
        <div className="mt-2 max-h-72 overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-ink-mute">
                <th className="py-1 font-bold">Tranche</th>
                <th className="py-1 text-right font-bold">Chiffre d&apos;affaires</th>
                <th className="py-1 text-right font-bold">Encaissements</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {points.map((p, i) => (
                <tr key={i}>
                  <td className="py-1">{p.label}</td>
                  <td className="py-1 text-right tabular">{fcfa(p.ca)}</td>
                  <td className="py-1 text-right tabular">{fcfa(p.encaissements)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Répartition sur une seule série (barres horizontales, valeurs écrites). */
export function BreakdownBars({ rows }: { rows: { label: string; amount: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!rows.length) return <p className="text-[14px] text-ink-mute">Aucun encaissement sur la période.</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-3 text-[14px]">
            <span className="font-semibold">{r.label}</span>
            <span className="tabular">
              {fcfa(r.amount)}
              <span className="text-ink-mute"> · {total ? Math.round((r.amount / total) * 100) : 0} %</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-paper-deep" aria-hidden="true">
            <div
              className="h-2.5 rounded-full"
              style={{ width: `${Math.max(1, (Math.max(0, r.amount) / max) * 100)}%`, background: "#5b4fc4" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
