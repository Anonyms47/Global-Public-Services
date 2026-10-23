import { A4, PdfDocument, wrap } from "@/lib/pdf";
import { fcfa, formatDateTime } from "@/lib/format";
import { methodLabels, receptionLabels, type OrderDetail } from "@/server/domain/orders";
import { legalIds, type Settings } from "@/server/domain/settings";

const RED: [number, number, number] = [227, 6, 19];
const BLUE: [number, number, number] = [49, 39, 127];
const MUTE: [number, number, number] = [110, 112, 122];
const INK: [number, number, number] = [18, 19, 24];

/** Paiements encore valables (ni annulation, ni paiement annulé). */
export function receiptPayments(o: OrderDetail) {
  return o.payments.filter((p) => p.kind !== "reversal" && !o.payments.some((r) => r.reverses_id === p.id));
}

/** Reçu de commande au format PDF (A4), même contenu que la page Reçu. */
export function receiptPdf(o: OrderDetail, s: Settings): Uint8Array {
  const c = s.company;
  const pdf = new PdfDocument();
  const M = 48;
  const R = A4.width - M;
  let y = M;
  const room = (h: number) => {
    if (y + h > A4.height - M) {
      pdf.addPage();
      y = M;
    }
  };

  if (o.is_demo) {
    pdf.rect(M, y - 4, R - M, 18, [231, 229, 247]);
    pdf.text(A4.width / 2, y + 9, "EXEMPLE — DÉMONSTRATION, SANS VALEUR", {
      size: 9,
      bold: true,
      color: BLUE,
      align: "center",
    });
    y += 28;
  }

  // En-tête : marque à gauche, coordonnées à droite.
  pdf.text(M, y + 26, "GPS", { size: 34, bold: true, color: RED });
  pdf.text(M, y + 42, "Global Public Services", { size: 10, bold: true, color: BLUE });
  const contact = [
    [c.address, c.city].filter(Boolean).join(", "),
    c.phone && `Tél. ${c.phone}`,
    c.whatsapp && `WhatsApp +${c.whatsapp}`,
    c.email,
    [c.legalName, legalIds(c)].filter(Boolean).join(" · "),
    s.receipt.header,
  ].filter((x): x is string => !!x);
  let cy = y + 6;
  for (const line of contact.flatMap((l) => wrap(l, 260, 9))) {
    pdf.text(R, cy, line, { size: 9, color: MUTE, align: "right" });
    cy += 12;
  }
  y = Math.max(y + 52, cy) + 8;
  pdf.line(M, y, R, y, 0.8, INK);
  y += 30;

  // Référence et client.
  pdf.text(M, y, "REÇU", { size: 22, bold: true });
  pdf.text(M, y + 16, o.reference, { size: 11, bold: true });
  const who = [
    formatDateTime(o.created_at),
    o.customer_name && `Client : ${o.customer_name}`,
    `${receptionLabels[o.reception]}${o.store_name ? ` · ${o.store_name}` : ""}`,
  ].filter((x): x is string => !!x);
  who.forEach((line, i) => pdf.text(R, y - 8 + i * 13, line, { size: 10, align: "right" }));
  y += Math.max(30, who.length * 13) + 14;

  // Articles.
  const colQty = R - 190;
  const colUnit = R - 95;
  const nameWidth = colQty - M - 40;
  const header = () => {
    pdf.text(M, y, "ARTICLE", { size: 8, bold: true, color: MUTE });
    pdf.text(colQty, y, "QTÉ", { size: 8, bold: true, color: MUTE, align: "right" });
    pdf.text(colUnit, y, "P.U.", { size: 8, bold: true, color: MUTE, align: "right" });
    pdf.text(R, y, "TOTAL", { size: 8, bold: true, color: MUTE, align: "right" });
    y += 6;
    pdf.line(M, y, R, y, 0.8, INK);
    y += 14;
  };
  header();
  for (const l of o.lines) {
    const name = wrap(l.name, nameWidth, 10);
    const detail = wrap(
      [l.options_label, l.sku, l.returned_quantity ? `retour : ${l.returned_quantity}` : ""]
        .filter(Boolean)
        .join(" · "),
      nameWidth,
      8,
    );
    const h = name.length * 13 + detail.length * 10 + 8;
    if (y + h > A4.height - M) {
      pdf.addPage();
      y = M;
      header();
    }
    pdf.text(colQty, y, String(l.quantity), { size: 10, align: "right" });
    pdf.text(colUnit, y, fcfa(l.unit_price), { size: 10, align: "right" });
    pdf.text(R, y, fcfa(l.unit_price * l.quantity), { size: 10, align: "right" });
    for (const line of name) {
      pdf.text(M, y, line, { size: 10 });
      y += 13;
    }
    for (const line of detail) {
      pdf.text(M, y - 2, line, { size: 8, color: MUTE });
      y += 10;
    }
    y += 2;
    pdf.line(M, y, R, y);
    y += 14;
  }

  // Totaux, alignés à droite.
  const L = R - 220;
  const row = (label: string, value: string, bold = false, color: [number, number, number] = INK, size = 10) => {
    room(16);
    pdf.text(L, y, label, { size, bold, color });
    pdf.text(R, y, value, { size, bold, color, align: "right" });
    y += size + 6;
  };
  y += 4;
  row("Total articles", fcfa(o.subtotal));
  if (o.returned_value) row("Retours", `- ${fcfa(o.returned_value)}`);
  if (o.reception === "delivery") row("Livraison", o.delivery_fee === null ? "précisée par GPS" : fcfa(o.delivery_fee));
  pdf.line(L, y - 9, R, y - 9, 0.8, INK);
  y += 2;
  row("Montant dû", fcfa(o.due), true, INK, 11);
  for (const p of receiptPayments(o)) {
    row(
      `${p.kind === "refund" ? "Remboursement" : "Payé"} · ${methodLabels[p.method]}`,
      `${p.kind === "refund" ? "- " : ""}${fcfa(p.amount)}`,
      false,
      INK,
      9,
    );
    if (p.tendered !== null && p.change_given > 0)
      row(`Espèces reçues ${fcfa(p.tendered)}`, `Rendu ${fcfa(p.change_given)}`, false, MUTE, 8);
  }
  row("Solde", fcfa(o.balance), true, INK, 11);

  // Pied.
  y += 24;
  if (s.receipt.footer) {
    for (const line of wrap(s.receipt.footer, R - M, 9)) {
      room(14);
      pdf.text(A4.width / 2, y, line, { size: 9, color: MUTE, align: "center" });
      y += 13;
    }
  }
  room(20);
  pdf.text(A4.width / 2, y + 8, "LE SERVICE QUI RASSURE", { size: 12, bold: true, color: BLUE, align: "center" });

  return pdf.build(`Reçu ${o.reference}`);
}
