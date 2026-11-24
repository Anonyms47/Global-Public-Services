/**
 * Description d'une fiche produit → blocs à afficher : paragraphes et vraies listes à puces
 * (« Points forts : • A • B » collés sur une ligne, ou une puce par ligne).
 */
export type DescriptionBlock = { type: "p"; text: string } | { type: "list"; title?: string; items: string[] };

const BULLET = /^\s*(?:[•▪◦·*]|[-–—]\s)\s*/;
// Phrases qui annoncent une disponibilité : retirées si le suivi des quantités est désactivé.
const STOCK_CLAIM = /^\s*(?:produit\s+)?(?:disponible\s+)?(?:en\s+stock|immédiatement)\b|^\s*disponible\s+en\s+stock/i;

export function parseDescription(text: string, opts: { dropStockClaims?: boolean } = {}): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  let paragraph: string[] = [];
  let list: { title?: string; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push({ type: "list", ...list });
    else if (list?.title) blocks.push({ type: "p", text: list.title });
    list = null;
  };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (opts.dropStockClaims && STOCK_CLAIM.test(line)) continue;
    // « Points forts : • A • B » : un titre et des puces sur la même ligne.
    const inline = line.split(/\s+[•▪◦]\s*/);
    if (inline.length >= 3 || (inline.length === 2 && /[•▪◦]/.test(line))) {
      const head = inline[0].replace(/^[•▪◦]\s*/, "").trim();
      flushParagraph();
      flushList();
      const first = /^[•▪◦]/.test(line) ? [head] : [];
      const items = [...first, ...inline.slice(1)].map((i) => i.trim()).filter(Boolean);
      list = { title: first.length ? undefined : head || undefined, items };
      flushList();
      continue;
    }
    if (BULLET.test(line)) {
      flushParagraph();
      if (!list) list = { items: [] };
      list.items.push(line.replace(BULLET, "").trim());
      continue;
    }
    // Un titre se terminant par « : » devant des puces ouvre une liste.
    const next = lines[i + 1]?.trim() ?? "";
    if (/:$/.test(line) && BULLET.test(next)) {
      flushParagraph();
      flushList();
      list = { title: line, items: [] };
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}
