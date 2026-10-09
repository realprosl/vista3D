/**
 * Genera SVGs de prueba para vista3D.
 *
 * - sample-room.svg:  habitacion simple en forma de L (4x3m + 1x1.5m)
 *                     util para pruebas rapidas de carga.
 * - piso-3hab.svg:    piso de 3 habitaciones detallado (~80m² utiles).
 *                     Salon, Cocina, 2 Dormitorios, Bano, Pasillo.
 *                     Paredes interiores visibles como lineas 2D.
 *
 * Las unidades del SVG son centimetros. La altura de extrusion
 * (250cm por defecto) la define el usuario en el formulario web.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "public", "samples");
mkdirSync(outDir, { recursive: true });

// =============================================================================
// PLANO 1: Habitacion en L (simple, util para smoke tests)
// =============================================================================
{
  const path = join(outDir, "sample-room.svg");
  const d = [
    "M 0 0",
    "L 400 0",
    "L 400 150",
    "L 500 150",
    "L 500 300",
    "L 0 300",
    "Z",
  ].join(" ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="500" height="300">
  <path d="${d}" fill="#f0e0c0" stroke="#333" stroke-width="2"/>
  <line x1="0" y1="-15" x2="400" y2="-15" stroke="#666" stroke-width="1"/>
  <text x="200" y="-25" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#666">400 cm</text>
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (habitacion en L, simple)`);
}

// =============================================================================
// PLANO 2: Piso 3 habitaciones DETALLADO
// =============================================================================
// Layout (cm) - orientacion: arriba Salon+Dorm1, abajo Cocina+Pasillo+Bano+Dorm2
//
//  +---------- 1300cm ----------+
//  |                           |
//  |   Salon (500x400)  | Dorm 1 (350x400)        | 400cm
//  |                    |                        |
//  |                    |                        |
//  +--------------------+------+--------+---------+
//  |                    |      |        |         |
//  |  Pasillo (250x400) | Cocina | Bano   | Dorm 2 | 400cm
//  |                    | (300x  | (200x  | (300x  |
//  |                    |  400)  |  400)  |  400)  |
//  +--------------------+--------+--------+-------+
//
//  Totales: 1300 x 800 cm = 13m x 8m = 104m² totales.
//  Utiles: ~80m² (Salon 20, Cocina 12, Dorm1 14, Dorm2 12, Bano 8, Pasillo 10).
const pisoW = 1300;
const pisoH = 800;
const ox = 50;
const oy = 50;

// Contorno principal (silueta del piso, es un rectangulo).
const exterior = [
  [0 + ox, 0 + oy],
  [pisoW + ox, 0 + oy],
  [pisoW + ox, pisoH + oy],
  [0 + ox, pisoH + oy],
];

// Paredes interiores (M..L sin Z, son sub-paths que no son holes, son lineas).
// Cada pared es [x1, y1, x2, y2].
const paredes = [
  // Muro horizontal central (separa zona dia de zona noche)
  [ox, oy + 400, ox + 850, oy + 400],
  // Muro vertical Salon | Dorm 1
  [ox + 500, oy, ox + 500, oy + 400],
  // Muro vertical Cocina | Bano
  [ox + 800, oy + 400, ox + 800, oy + 800],
  // Muro vertical Bano | Dorm 2
  [ox + 1000, oy + 400, ox + 1000, oy + 800],
  // Muro vertical Pasillo | Cocina
  [ox + 250, oy + 400, ox + 250, oy + 800],
];

// Etiquetas de las habitaciones.
const labels = [
  { x: ox + 250, y: oy + 220, text: "Salón" },
  { x: ox + 675, y: oy + 220, text: "Dorm. 1" },
  { x: ox + 125, y: oy + 600, text: "Pasillo" },
  { x: ox + 525, y: oy + 600, text: "Cocina" },
  { x: ox + 900, y: oy + 600, text: "Baño" },
  { x: ox + 1150, y: oy + 600, text: "Dorm. 2" },
];

// Areas calculadas para mostrar.
const areas = [
  { x: ox + 250, y: oy + 250, text: "20 m²" },
  { x: ox + 675, y: oy + 250, text: "14 m²" },
  { x: ox + 125, y: oy + 630, text: "10 m²" },
  { x: ox + 525, y: oy + 630, text: "12 m²" },
  { x: ox + 900, y: oy + 630, text: "8 m²" },
  { x: ox + 1150, y: oy + 630, text: "12 m²" },
];

function buildPisoPath() {
  let d = `M ${exterior[0][0]} ${exterior[0][1]} `;
  for (let i = 1; i < exterior.length; i++) {
    d += `L ${exterior[i][0]} ${exterior[i][1]} `;
  }
  d += "Z";
  // NOTA: las paredes interiores NO se incluyen en el path.
  // Se emiten como <line> aparte. El viewer.js las lee de
  // <line> y las dibuja como planos verticales (v0.3.0).
  return d;
}

function buildParedesLines() {
  return paredes.map(([x1, y1, x2, y2]) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5a3a1a" stroke-width="3" stroke-linecap="square"/>`
  ).join("\n  ");
}

{
  const path = join(outDir, "piso-3hab.svg");
  const pathD = buildPisoPath();
  const labelSvg = labels.map(l =>
    `<text x="${l.x}" y="${l.y}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="600" fill="#333">${l.text}</text>`
  ).join("\n  ");
  const areaSvg = areas.map(a =>
    `<text x="${a.x}" y="${a.y}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#888">${a.text}</text>`
  ).join("\n  ");
  const cotas = `
  <line x1="${ox}" y1="${oy - 30}" x2="${ox + pisoW}" y2="${oy - 30}" stroke="#888" stroke-width="1"/>
  <text x="${ox + pisoW / 2}" y="${oy - 40}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">${pisoW} cm</text>
  <line x1="${ox - 30}" y1="${oy}" x2="${ox - 30}" y2="${oy + pisoH}" stroke="#888" stroke-width="1"/>
  <text x="${ox - 40}" y="${oy + pisoH / 2}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666" transform="rotate(-90 ${ox - 40} ${oy + pisoH / 2})">${pisoH} cm</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pisoW + 100} ${pisoH + 100}" width="${pisoW + 100}" height="${pisoH + 100}">
  <!--
    Piso de 3 habitaciones (~80m² utiles, 104m² totales).
    Coordenadas en centimetros. 13m x 8m.

    Distribucion:
      - Salon:        500x400 cm = 20m²
      - Dorm. 1:      350x400 cm = 14m²
      - Pasillo:      250x400 cm = 10m²
      - Cocina:       300x400 cm = 12m²
      - Bano:         200x400 cm = 8m²
      - Dorm. 2:      300x400 cm = 12m²

    El path principal (M..L..L..L..Z) es la silueta rectangular.
    Las paredes interiores son sub-paths M..L (sin Z) que se
    renderizan como lineas 2D en el visor. v0.2.0 solo extruye
    el contorno, no las paredes interiores (limitacion v1).
  -->
  <path d="${pathD}" fill="#f5e6c8" stroke="#333" stroke-width="3"/>
  ${buildParedesLines()}
  ${labelSvg}
  ${areaSvg}
  ${cotas}
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (piso 3 habitaciones ~80m²)`);
}

console.log("");
console.log("Para descargar:");
console.log("  http://194.163.184.142:8080/public/samples/sample-room.svg");
console.log("  http://194.163.184.142:8080/public/samples/piso-3hab.svg");
