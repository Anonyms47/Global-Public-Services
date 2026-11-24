import { parseDescription } from "@/lib/description";

/** Description d'une fiche : paragraphes et vraies listes (points forts), jamais des puces collées dans un paragraphe. */
export function ProductDescription({ text, dropStockClaims = false }: { text: string; dropStockClaims?: boolean }) {
  const blocks = parseDescription(text, { dropStockClaims });
  if (!blocks.length) return null;
  return (
    <div className="mt-4 max-w-[65ch] space-y-4 text-[17px] leading-relaxed text-ink-soft">
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i} className="whitespace-pre-line">
            {b.text}
          </p>
        ) : (
          <div key={i}>
            {b.title ? <p className="font-bold text-ink">{b.title}</p> : null}
            <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-gps-red">
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
