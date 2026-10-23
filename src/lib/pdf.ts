/**
 * Générateur PDF minimal, sans dépendance : texte (Helvetica et Helvetica gras,
 * polices standard de tout lecteur PDF), traits et aplats, pages A4.
 * Suffisant pour un reçu ; le texte est encodé en WinAnsi (accents français).
 */

export const A4 = { width: 595.28, height: 841.89 };

type Rgb = [number, number, number];
interface TextOptions {
  size?: number;
  bold?: boolean;
  color?: Rgb;
  align?: "left" | "right" | "center";
}

// Chasses Adobe (1/1000 em) des caractères ASCII 32 à 126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611,
  556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389,
  280, 389, 584,
];

// Caractères hors Latin-1 présents dans la page de code WinAnsi (cp1252).
const CP1252: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "…": 0x85,
  Œ: 0x8c,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "™": 0x99,
  œ: 0x9c,
};
const WIDE: Record<number, number> = { 0x80: 556, 0x85: 1000, 0x8c: 1000, 0x95: 350, 0x96: 556, 0x97: 1000, 0x9c: 944 };

/** Texte → octets WinAnsi (espaces insécables en espaces, inconnus en « ? »). */
function encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.replace(/[   ]/g, " ").replace(/−/g, "-")) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) out.push(code);
    else if (code >= 0xa0 && code <= 0xff) out.push(code);
    else if (CP1252[ch]) out.push(CP1252[ch]);
    else out.push(63);
  }
  return out;
}

function charWidth(byte: number, bold: boolean) {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (byte >= 32 && byte <= 126) return table[byte - 32];
  if (WIDE[byte]) return WIDE[byte];
  if (byte >= 0xc0) {
    // Lettre accentuée : même chasse que la lettre de base.
    const base = String.fromCharCode(byte).normalize("NFD").charCodeAt(0);
    if (base >= 32 && base <= 126) return table[base - 32];
  }
  return 556;
}

export function textWidth(text: string, size: number, bold = false) {
  return (encode(text).reduce((s, b) => s + charWidth(b, bold), 0) * size) / 1000;
}

/** Coupe un texte en lignes tenant dans `width` points. */
export function wrap(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

const literal = (bytes: number[]) =>
  "(" +
  bytes
    .map((b) =>
      b === 40 || b === 41 || b === 92
        ? `\\${String.fromCharCode(b)}`
        : b < 32 || b > 126
          ? `\\${b.toString(8).padStart(3, "0")}`
          : String.fromCharCode(b),
    )
    .join("") +
  ")";

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rgb = ([r, g, b]: Rgb) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`;

export class PdfDocument {
  private pages: string[][] = [[]];
  private get ops() {
    return this.pages[this.pages.length - 1];
  }

  addPage() {
    this.pages.push([]);
  }

  /** Texte posé sur sa ligne de base ; y compté depuis le haut de la page. */
  text(x: number, y: number, value: string, o: TextOptions = {}) {
    const size = o.size ?? 10;
    const bytes = encode(value);
    const w = textWidth(value, size, o.bold);
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.ops.push(
      `BT /${o.bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(o.color ?? [18, 19, 24])} rg ${num(left)} ${num(A4.height - y)} Td ${literal(bytes)} Tj ET`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, color: Rgb = [200, 200, 205]) {
    this.ops.push(
      `${num(width)} w ${rgb(color)} RG ${num(x1)} ${num(A4.height - y1)} m ${num(x2)} ${num(A4.height - y2)} l S`,
    );
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.ops.push(`${rgb(color)} rg ${num(x)} ${num(A4.height - y - h)} ${num(w)} ${num(h)} re f`);
  }

  /** Fichier PDF complet (ASCII uniquement : longueurs en caractères = octets). */
  build(title = ""): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body) - 1;
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add(""); // Pages, rempli plus bas
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const info = add(`<< /Title ${literal(encode(title))} /Producer (GPS Comptoir) >>`);
    const kids: number[] = [];
    for (const ops of this.pages) {
      const stream = ops.join("\n");
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(
        add(
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content + 1} 0 R >>`,
        ),
      );
    }
    objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k + 1} 0 R`).join(" ")}] /Count ${kids.length} >>`;

    let out = "%PDF-1.4\n";
    const offsets = objects.map((body, i) => {
      const at = out.length;
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
      return at;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info + 1} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out);
  }
}
