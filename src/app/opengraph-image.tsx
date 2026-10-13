import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "GPS — Global Public Services · Le service qui rassure";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Image de partage (WhatsApp, réseaux sociaux) aux couleurs de GPS. */
export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/logo-gps.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f3ec", position: "relative" }}>
      <div
        style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 72px", width: "62%" }}
      >
        <div style={{ fontSize: 34, color: "#31277f", fontWeight: 800, letterSpacing: 4 }}>GLOBAL PUBLIC SERVICES</div>
        <div style={{ fontSize: 86, fontWeight: 900, lineHeight: 0.95, color: "#121318", marginTop: 20 }}>
          La bonne adresse.
        </div>
        <div style={{ fontSize: 86, fontWeight: 900, lineHeight: 0.95, color: "#e30713" }}>Le bon produit.</div>
        <div style={{ fontSize: 30, color: "#4a4d55", marginTop: 28 }}>
          Téléphones, audio, accessoires, chaussures · transfert d&apos;argent
        </div>
      </div>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "38%", background: "#ffffff" }}
      >
        <img src={src} width={380} height={237} alt="" />
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 14,
          background: "#31277f",
          display: "flex",
        }}
      />
    </div>,
    size,
  );
}
