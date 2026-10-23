import { describe, expect, it } from "vitest";
import { PdfDocument, textWidth, wrap } from "@/lib/pdf";

const decode = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("PDF", () => {
  it("produit un fichier PDF valide : en-tête, table des positions exacte, fin", () => {
    const pdf = new PdfDocument();
    pdf.text(48, 60, "Reçu GPS-C-0001 — Téléphone (Été)", { bold: true });
    pdf.addPage();
    pdf.text(48, 60, "Page 2");
    const out = decode(pdf.build("Reçu GPS-C-0001"));
    expect(out.startsWith("%PDF-1.4\n")).toBe(true);
    expect(out.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(out).toContain("/Count 2");
    // Chaque entrée de la table xref pointe exactement sur « n 0 obj ».
    const xref = Number(out.match(/startxref\n(\d+)/)![1]);
    expect(out.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...out.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(out.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // Accents en WinAnsi (ç = 347 en octal), tiret cadratin en 227 : le fichier reste en ASCII.
    expect(out).toContain("Re\\347u");
    expect(out).toContain("\\227");
    expect(/^[\x00-\x7f]*$/.test(out)).toBe(true);
  });

  it("mesure et coupe le texte à la largeur voulue", () => {
    expect(textWidth("Été", 10)).toBeCloseTo(textWidth("Ete", 10));
    expect(textWidth("bonjour", 10, true)).toBeGreaterThan(textWidth("bonjour", 10));
    const lines = wrap("Coque de protection compatible Apple Watch, taille 44 mm", 120, 10);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) => expect(textWidth(l, 10)).toBeLessThanOrEqual(120));
  });
});
