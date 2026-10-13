/**
 * Génère les visuels d'illustration du catalogue de démonstration (SVG).
 * Ce ne sont pas des photos : ils sont signalés comme « Illustration » sur le site
 * et doivent être remplacés par les vraies photos produits de GPS.
 *
 *   npx tsx scripts/generate-demo-images.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public", "demo");
mkdirSync(OUT, { recursive: true });

const W = 1200;
const H = 1500;

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => {
    const c = (n >> s) & 255;
    const v = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

function frame(
  bg: string,
  body: string,
  opts: { floor?: number; ribbon?: boolean } = {},
) {
  const floor = opts.floor ?? 1240;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(bg, 0.25)}"/><stop offset="1" stop-color="${bg}"/></linearGradient>
  <radialGradient id="floor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="rib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#31277F" stop-opacity="0"/><stop offset="1" stop-color="#31277F" stop-opacity="0.22"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
${opts.ribbon === false ? "" : `<path d="M-40 ${H - 260} C 300 ${H - 120}, 760 ${H - 220}, ${W + 40} ${H - 620}" fill="none" stroke="url(#rib)" stroke-width="22" stroke-linecap="round"/>`}
<ellipse cx="${W / 2}" cy="${floor}" rx="430" ry="46" fill="url(#floor)"/>
${body}
</svg>`;
}

// ——— Téléphone ———
function phone(color: string, view: "front" | "back" | "angle", bg: string) {
  const dark = shade(color, -0.35);
  const light = shade(color, 0.35);
  if (view === "front") {
    return frame(
      bg,
      `
<g transform="translate(330 170)">
  <rect width="540" height="1080" rx="86" fill="${dark}"/>
  <rect x="6" y="6" width="528" height="1068" rx="80" fill="${color}"/>
  <rect x="24" y="24" width="492" height="1032" rx="66" fill="#0B0D12"/>
  <defs><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A2470"/><stop offset="0.55" stop-color="#31277F"/><stop offset="1" stop-color="#E30713"/></linearGradient></defs>
  <rect x="36" y="36" width="468" height="1008" rx="56" fill="url(#scr)"/>
  <path d="M36 820 C 200 900, 380 760, 504 520 L504 1044 L36 1044 Z" fill="#fff" opacity="0.10"/>
  <path d="M36 900 C 220 960, 400 820, 504 640" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="10"/>
  <rect x="200" y="58" width="140" height="40" rx="20" fill="#05060A"/>
  <text x="270" y="300" text-anchor="middle" font-family="Arial, sans-serif" font-size="120" font-weight="700" fill="#fff" opacity="0.92">10:24</text>
  <rect x="190" y="1010" width="160" height="10" rx="5" fill="#fff" opacity="0.6"/>
  <rect x="-8" y="250" width="8" height="90" rx="4" fill="${dark}"/>
  <rect x="540" y="300" width="8" height="150" rx="4" fill="${dark}"/>
</g>`,
    );
  }
  if (view === "back") {
    return frame(
      bg,
      `
<g transform="translate(330 170)">
  <defs><linearGradient id="bk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.6" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs>
  <rect width="540" height="1080" rx="86" fill="${dark}"/>
  <rect x="6" y="6" width="528" height="1068" rx="80" fill="url(#bk)"/>
  <rect x="44" y="44" width="250" height="250" rx="60" fill="${shade(color, -0.15)}" stroke="${light}" stroke-opacity="0.5" stroke-width="4"/>
  ${[
    [110, 110],
    [228, 110],
    [110, 228],
  ]
    .map(
      ([x, y]) =>
        `<circle cx="${x}" cy="${y}" r="50" fill="#14161B"/><circle cx="${x}" cy="${y}" r="34" fill="#1F2330"/><circle cx="${x}" cy="${y}" r="14" fill="#31277F" opacity="0.8"/><circle cx="${x - 10}" cy="${y - 12}" r="6" fill="#fff" opacity="0.6"/>`,
    )
    .join("")}
  <circle cx="228" cy="228" r="16" fill="#F5E9C8"/>
  <path d="M60 1040 C 220 980, 400 880, 520 640" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="40"/>
</g>`,
    );
  }
  return frame(
    bg,
    `
<g transform="translate(250 220) rotate(-14 350 520)">
  <rect x="140" width="500" height="1000" rx="80" fill="${shade(color, -0.2)}"/>
  <rect x="146" y="6" width="488" height="988" rx="74" fill="#0B0D12"/>
  <defs><linearGradient id="scr2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#31277F"/><stop offset="1" stop-color="#E30713"/></linearGradient></defs>
  <rect x="158" y="18" width="464" height="964" rx="62" fill="url(#scr2)"/>
  <path d="M158 820 C 300 880, 500 760, 622 520" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="10"/>
  <rect x="100" y="20" width="44" height="960" rx="22" fill="${light}"/>
  <rect x="96" y="260" width="10" height="80" rx="5" fill="${dark}"/>
</g>`,
  );
}

// ——— Écouteurs ———
function earbuds(color: string, view: "case" | "buds", bg: string) {
  const dark = shade(color, -0.25);
  const lite = shade(color, 0.3);
  const bud = (x: number, y: number, flip = 1) => `
<g transform="translate(${x} ${y}) scale(${flip} 1)">
  <ellipse cx="0" cy="0" rx="86" ry="96" fill="${color}" stroke="${dark}" stroke-width="4"/>
  <ellipse cx="-18" cy="-24" rx="40" ry="34" fill="${lite}" opacity="0.7"/>
  <ellipse cx="44" cy="10" rx="38" ry="44" fill="#1C1E24"/>
  <rect x="-40" y="60" width="64" height="300" rx="32" fill="${color}" stroke="${dark}" stroke-width="4"/>
  <rect x="-30" y="300" width="44" height="46" rx="20" fill="${dark}" opacity="0.5"/>
</g>`;
  if (view === "buds") return frame(bg, `${bud(470, 560, -1)}${bud(740, 520)}`);
  return frame(
    bg,
    `
<g transform="translate(330 470)">
  <rect x="0" y="230" width="540" height="420" rx="150" fill="${color}" stroke="${dark}" stroke-width="5"/>
  <rect x="20" y="250" width="500" height="160" rx="80" fill="${lite}" opacity="0.5"/>
  <path d="M0 330 L540 330" stroke="${dark}" stroke-width="5"/>
  <rect x="0" y="0" width="540" height="330" rx="150" fill="${shade(color, 0.12)}" stroke="${dark}" stroke-width="5" transform="rotate(-24 0 330)"/>
  <circle cx="270" cy="560" r="10" fill="#1F8A4C"/>
  <ellipse cx="170" cy="300" rx="70" ry="44" fill="${dark}" opacity="0.6"/>
  <ellipse cx="370" cy="300" rx="70" ry="44" fill="${dark}" opacity="0.6"/>
  <ellipse cx="170" cy="282" rx="60" ry="40" fill="${color}" stroke="${dark}" stroke-width="3"/>
  <ellipse cx="370" cy="282" rx="60" ry="40" fill="${color}" stroke="${dark}" stroke-width="3"/>
</g>`,
  );
}

// ——— Casque ———
function headphones(color: string, bg: string) {
  const dark = shade(color, -0.3);
  const lite = shade(color, 0.3);
  return frame(
    bg,
    `
<g transform="translate(240 260)">
  <path d="M120 600 C 100 180, 620 180, 600 600" fill="none" stroke="${dark}" stroke-width="70" stroke-linecap="round"/>
  <path d="M120 600 C 100 180, 620 180, 600 600" fill="none" stroke="${color}" stroke-width="54" stroke-linecap="round"/>
  <path d="M190 360 C 260 260, 460 260, 530 360" fill="none" stroke="${lite}" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <rect x="40" y="520" width="190" height="330" rx="90" fill="${dark}"/>
  <rect x="60" y="540" width="160" height="290" rx="80" fill="${color}"/>
  <rect x="490" y="520" width="190" height="330" rx="90" fill="${dark}"/>
  <rect x="500" y="540" width="160" height="290" rx="80" fill="${color}"/>
  <ellipse cx="150" cy="640" rx="40" ry="60" fill="${lite}" opacity="0.4"/>
  <ellipse cx="590" cy="640" rx="40" ry="60" fill="${lite}" opacity="0.4"/>
</g>`,
  );
}

// ——— Chargeur ———
function charger(withCable: boolean, bg: string) {
  return frame(
    bg,
    `
<g transform="translate(380 330)">
  <rect width="440" height="440" rx="70" fill="#E9E9EC" stroke="#C9CAD0" stroke-width="5"/>
  <rect x="20" y="20" width="400" height="140" rx="50" fill="#fff" opacity="0.7"/>
  <rect x="165" y="290" width="110" height="34" rx="17" fill="#2A2C33"/>
  <rect x="180" y="300" width="80" height="14" rx="7" fill="#5A5D66"/>
  <text x="220" y="230" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#8C8F98">25W</text>
  <rect x="120" y="-90" width="34" height="100" rx="8" fill="#B9BBC2"/>
  <rect x="286" y="-90" width="34" height="100" rx="8" fill="#B9BBC2"/>
</g>
${
  withCable
    ? `<path d="M600 770 C 600 900, 300 900, 320 1040 C 340 1180, 820 1120, 860 1000 C 900 880, 700 860, 720 1180" fill="none" stroke="#EDEDF0" stroke-width="30" stroke-linecap="round"/>
<path d="M600 770 C 600 900, 300 900, 320 1040 C 340 1180, 820 1120, 860 1000 C 900 880, 700 860, 720 1180" fill="none" stroke="#C9CAD0" stroke-width="30" stroke-linecap="round" stroke-dasharray="1 40" opacity="0.6"/>
<rect x="690" y="1160" width="60" height="110" rx="16" fill="#D9DADF"/>`
    : ""
}`,
  );
}

// ——— Batterie externe ———
function powerbank(color: string, bg: string) {
  const dark = shade(color, -0.3);
  return frame(
    bg,
    `
<g transform="translate(360 300) rotate(-8 240 450)">
  <rect width="480" height="860" rx="70" fill="${dark}"/>
  <rect x="8" y="8" width="464" height="844" rx="64" fill="${color}"/>
  <rect x="40" y="40" width="400" height="300" rx="40" fill="#fff" opacity="0.08"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="${170 + i * 40}" y="700" width="24" height="24" rx="12" fill="${i < 3 ? "#1F8A4C" : "#555"}"/>`).join("")}
  <text x="240" y="480" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#fff" opacity="0.5">20 000</text>
</g>`,
  );
}

// ——— Étui ———
function phoneCase(color: string, bg: string) {
  const dark = shade(color, -0.25);
  return frame(
    bg,
    `
<g transform="translate(330 170)">
  <rect width="540" height="1080" rx="90" fill="${dark}"/>
  <rect x="10" y="10" width="520" height="1060" rx="82" fill="${color}"/>
  <rect x="34" y="34" width="270" height="270" rx="66" fill="${dark}"/>
  <rect x="48" y="48" width="242" height="242" rx="56" fill="${shade(bg, -0.1)}"/>
  <path d="M60 1020 C 220 960, 400 860, 510 640" fill="none" stroke="#fff" stroke-opacity="0.15" stroke-width="40"/>
</g>`,
  );
}

// ——— Lunettes ———
function sunglasses(frameColor: string, view: "front" | "angle", bg: string) {
  const lens = "#1E2430";
  const t =
    view === "front"
      ? "translate(140 500)"
      : "translate(170 470) rotate(-10 450 200) scale(0.95)";
  return frame(
    bg,
    `
<g transform="${t}">
  <defs><linearGradient id="lens" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A4256"/><stop offset="1" stop-color="${lens}"/></linearGradient></defs>
  <path d="M40 120 C 40 40, 120 20, 230 24 C 360 28, 400 60, 400 150 C 400 300, 320 360, 220 360 C 110 360, 40 280, 40 120 Z" fill="url(#lens)" stroke="${frameColor}" stroke-width="30"/>
  <path d="M880 120 C 880 40, 800 20, 690 24 C 560 28, 520 60, 520 150 C 520 300, 600 360, 700 360 C 810 360, 880 280, 880 120 Z" fill="url(#lens)" stroke="${frameColor}" stroke-width="30"/>
  <path d="M400 110 C 430 80, 490 80, 520 110" fill="none" stroke="${frameColor}" stroke-width="26"/>
  <path d="M90 90 C 160 60, 230 60, 300 90" stroke="#fff" stroke-opacity="0.3" stroke-width="14" fill="none"/>
  <path d="M570 90 C 640 60, 710 60, 780 90" stroke="#fff" stroke-opacity="0.3" stroke-width="14" fill="none"/>
  <path d="M28 90 L-60 70" stroke="${frameColor}" stroke-width="22" stroke-linecap="round"/>
  <path d="M892 90 L980 70" stroke="${frameColor}" stroke-width="22" stroke-linecap="round"/>
</g>`,
    { floor: 1000 },
  );
}

// ——— Chaussures ———
function sneaker(color: string, view: "side" | "pair", bg: string) {
  const dark = shade(color, -0.35);
  const accent = color === "#F4F2EC" ? "#E30713" : "#F4F2EC";
  const shoe = (tx: number, ty: number, s: number) => `
<g transform="translate(${tx} ${ty}) scale(${s})">
  <path d="M40 420 L40 330 C 40 260, 120 220, 200 210 L360 100 C 400 80, 460 90, 480 130 L520 220 C 620 250, 760 270, 860 330 C 920 360, 940 400, 930 440 L40 440 Z" fill="${color}" stroke="${dark}" stroke-width="8"/>
  <path d="M30 430 L940 430 C 950 470, 930 500, 880 500 L80 500 C 40 500, 20 470, 30 430 Z" fill="#F7F5EF" stroke="#C9C4B8" stroke-width="6"/>
  <path d="M30 470 L940 470" stroke="#C9C4B8" stroke-width="5"/>
  <path d="M260 330 C 420 250, 600 300, 760 330" fill="none" stroke="${accent}" stroke-width="30" stroke-linecap="round"/>
  ${[0, 1, 2, 3].map((i) => `<path d="M${330 + i * 40} ${180 + i * 18} L${400 + i * 40} ${200 + i * 18}" stroke="${dark}" stroke-width="10" stroke-linecap="round"/>`).join("")}
  <path d="M370 100 C 340 60, 420 40, 470 90" fill="none" stroke="${dark}" stroke-width="10"/>
</g>`;
  if (view === "side") return frame(bg, shoe(110, 520, 1.05), { floor: 1050 });
  return frame(bg, `${shoe(260, 380, 0.82)}${shoe(110, 640, 0.9)}`, {
    floor: 1130,
  });
}

// ——— Montre ———
function watch(color: string, bg: string) {
  const dark = shade(color, -0.35);
  return frame(
    bg,
    `
<g transform="translate(400 160)">
  <rect x="110" y="0" width="180" height="1160" rx="70" fill="${color}" stroke="${dark}" stroke-width="5"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<circle cx="200" cy="${830 + i * 50}" r="10" fill="${dark}" opacity="0.5"/>`).join("")}
  <rect x="0" y="380" width="400" height="460" rx="110" fill="${dark}"/>
  <rect x="22" y="402" width="356" height="416" rx="92" fill="#0B0D12"/>
  <defs><linearGradient id="wf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#31277F"/><stop offset="1" stop-color="#E30713"/></linearGradient></defs>
  <circle cx="200" cy="610" r="130" fill="none" stroke="url(#wf)" stroke-width="22"/>
  <text x="200" y="630" text-anchor="middle" font-family="Arial, sans-serif" font-size="70" font-weight="700" fill="#fff">10:24</text>
  <rect x="400" y="520" width="24" height="90" rx="10" fill="${dark}"/>
</g>`,
  );
}

const files: Record<string, string> = {};
const C = {
  graphite: "#3A3D44",
  sable: "#D9C7A8",
  bleuNuit: "#22305C",
  blanc: "#F4F2EC",
  noir: "#24262B",
  creme: "#E8DCC6",
  ecaille: "#7A4A26",
  rouge: "#C8202A",
  gris: "#9EA3AD",
  vert: "#3E6B52",
};

for (const [name, hex] of [
  ["graphite", C.graphite],
  ["sable", C.sable],
] as const) {
  files[`nova12-face-${name}.svg`] = phone(hex, "front", "#E4DED2");
  files[`nova12-dos-${name}.svg`] = phone(hex, "back", "#E4DED2");
  files[`nova12-profil-${name}.svg`] = phone(hex, "angle", "#DDE2EC");
}
for (const [name, hex] of [
  ["bleu-nuit", C.bleuNuit],
  ["blanc", C.blanc],
] as const) {
  files[`lite8-face-${name}.svg`] = phone(hex, "front", "#E9E2D8");
  files[`lite8-dos-${name}.svg`] = phone(hex, "back", "#E9E2D8");
}
for (const [name, hex] of [
  ["blanc", C.blanc],
  ["noir", C.noir],
  ["bleu-nuit", C.bleuNuit],
] as const) {
  files[`buds-boitier-${name}.svg`] = earbuds(hex, "case", "#DCE3EF");
  files[`buds-ecouteurs-${name}.svg`] = earbuds(hex, "buds", "#E6E1D7");
}
for (const [name, hex] of [
  ["noir", C.noir],
  ["creme", C.creme],
] as const) {
  files[`studio2-${name}.svg`] = headphones(
    hex,
    name === "noir" ? "#E7E1D5" : "#DDE3EE",
  );
}
files["volta25-avec-cable.svg"] = charger(true, "#E6E0D4");
files["volta25-seul.svg"] = charger(false, "#DFE4EC");
files["powerbank-noir.svg"] = powerbank(C.noir, "#E4DED3");
for (const [name, hex] of [
  ["rouge", C.rouge],
  ["noir", C.noir],
  ["sable", C.sable],
] as const) {
  files[`etui-nova12-${name}.svg`] = phoneCase(hex, "#E8E2D7");
}
for (const [name, hex] of [
  ["ecaille", C.ecaille],
  ["noir", C.noir],
] as const) {
  files[`rive-face-${name}.svg`] = sunglasses(hex, "front", "#EDE4D3");
  files[`rive-profil-${name}.svg`] = sunglasses(hex, "angle", "#DCE2EC");
}
for (const [name, hex] of [
  ["blanc", C.blanc],
  ["noir", C.noir],
] as const) {
  files[`urbain-profil-${name}.svg`] = sneaker(hex, "side", "#E5DFD3");
  files[`urbain-paire-${name}.svg`] = sneaker(hex, "pair", "#DDE3EE");
}
files["course-profil-gris.svg"] = sneaker(C.gris, "side", "#E3E7EE");
files["course-paire-gris.svg"] = sneaker(C.gris, "pair", "#ECE5D8");
for (const [name, hex] of [
  ["noir", C.noir],
  ["vert", C.vert],
] as const) {
  files[`fit-${name}.svg`] = watch(hex, "#E6E0D5");
}

for (const [file, svg] of Object.entries(files))
  writeFileSync(join(OUT, file), svg.replace(/\n\s*/g, "\n"));
console.log(`${Object.keys(files).length} visuels générés dans public/demo/`);
