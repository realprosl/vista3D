/**
 * Genera un SVG de prueba: una habitacion rectangular 4x3 metros
 * con un saliente en forma de "L" para que se vea interesante en 3D.
 *
 * Coordenadas en centimetros:
 *   - Rectangulo principal: (0,0) a (400,300)
 *   - Saliente:            (400,0) a (500,150)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "public", "samples", "sample-room.svg");
mkdirSync(join(process.cwd(), "public", "samples"), { recursive: true });

// Path con M (move) + L (line) + Z (close). Es el formato que
// ExtrudeGeometry de Three.js entiende via Shape.
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
  <!--
    SVG de prueba: habitacion en forma de "L" (4x3 + 1x1.5 metros).
    Las unidades son centimetros. La altura de extrusion se define
    en el formulario web (por defecto 2.5m = 250cm).

    Path 1: contorno exterior de la habitacion.
    Lineas adicionales: cotas (medidas).
  -->
  <path d="${d}" fill="#f0e0c0" stroke="#333" stroke-width="2"/>
  <line x1="0" y1="-15" x2="400" y2="-15" stroke="#666" stroke-width="1"/>
  <text x="200" y="-25" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#666">400 cm</text>
  <line x1="425" y1="0" x2="425" y2="150" stroke="#666" stroke-width="1"/>
  <text x="435" y="80" font-family="sans-serif" font-size="14" fill="#666">150 cm</text>
</svg>
`;

writeFileSync(path, svg, "utf-8");
console.log(`SVG de prueba generado en: ${path}`);
console.log(`  - Habitacion rectangular 4x3m + saliente 1x1.5m (forma de L)`);
console.log(`  - Subir este archivo al formulario web y probar.`);
