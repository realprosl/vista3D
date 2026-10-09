/**
 * Genera SVGs de prueba para vista3D con la convencion v0.5.0:
 *
 * Cada elemento se marca con una clase semantica para que el parser
 * y el visor 3D lo reconozcan:
 *   - .suelo     suelo del piso (planta)
 *   - .pared     pared de la planta (interior o exterior) o linea
 *                de fachada en el alzado
 *   - .puerta    puerta (planta: como gap en la pared; alzado: rect)
 *   - .ventana   ventana (planta: como gap en la pared; alzado: rect)
 *   - .hueco     apertura generica (fallback)
 *   - .cota      linea de cota (decorativa, ignorada en 3D)
 *   - .etiqueta  texto de etiqueta (decorativo, ignorado en 3D)
 *
 * Colores por defecto (se pueden sobreescribir en el proyecto):
 *   - .suelo:     #c4a988 (arena)
 *   - .pared:     #eee2cc (crema)
 *   - .puerta:    #f5d99a (crema oscuro)
 *   - .ventana:   #b8d8f0 (azul claro / cristal)
 *   - .cota:      #888
 *   - .etiqueta:  #333
 *
 * Atributos data-:
 *   - data-color:    color hex para sobreescribir el default
 *   - data-texture:  nombre de textura procedural (liso/madera/baldosa/...)
 *   - data-grosor:   grosor en cm (default 8)
 *   - data-wall:     (solo alzados) "N" | "S" | "E" | "W"
 *   - data-wall-width: (solo alzados) ancho real de la pared en cm
 *   - data-ancho, data-alto: (puertas/ventanas) dimensiones en cm
 *   - data-x, data-y: (puertas/ventanas) posicion del borde inf-izq en cm
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
  <path class="suelo" d="${d}" fill="#c4a988" stroke="#8a6a48" stroke-width="2"/>
  <line class="cota" x1="0" y1="-15" x2="400" y2="-15" stroke="#666" stroke-width="1"/>
  <text class="etiqueta" x="200" y="-25" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#666">400 cm</text>
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (habitacion en L, simple)`);
}

// =============================================================================
// PLANO 2: Piso 3 habitaciones DETALLADO
// =============================================================================
{
  const path = join(outDir, "piso-3hab.svg");
  const ox = 50, oy = 50;
  const pisoW = 1300, pisoH = 800;

  // Distribucion (en cm, relativa al ox,oy).
  // Layout: 1 sola fila con varias habitaciones. Sin paredes interiores
  // marcadas: lo importante es el contorno y las cotas.
  const exterior = [
    [ox, oy],
    [ox + pisoW, oy],
    [ox + pisoW, oy + pisoH],
    [ox, oy + pisoH],
  ];

  // Paredes interiores.
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

  const labels = [
    { x: ox + 250, y: oy + 220, text: "Salón" },
    { x: ox + 675, y: oy + 220, text: "Dorm. 1" },
    { x: ox + 125, y: oy + 600, text: "Pasillo" },
    { x: ox + 525, y: oy + 600, text: "Cocina" },
    { x: ox + 900, y: oy + 600, text: "Baño" },
    { x: ox + 1150, y: oy + 600, text: "Dorm. 2" },
  ];
  const areas = [
    { x: ox + 250, y: oy + 250, text: "20 m²" },
    { x: ox + 675, y: oy + 250, text: "14 m²" },
    { x: ox + 125, y: oy + 630, text: "10 m²" },
    { x: ox + 525, y: oy + 630, text: "12 m²" },
    { x: ox + 900, y: oy + 630, text: "8 m²" },
    { x: ox + 1150, y: oy + 630, text: "12 m²" },
  ];

  let pathD = `M ${exterior[0][0]} ${exterior[0][1]} `;
  for (let i = 1; i < exterior.length; i++) pathD += `L ${exterior[i][0]} ${exterior[i][1]} `;
  pathD += "Z";

  const paredesSvg = paredes.map(([x1, y1, x2, y2]) =>
    `<line class="pared" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#5a3a1a" stroke-width="3" stroke-linecap="square"/>`
  ).join("\n  ");

  const labelSvg = labels.map(l =>
    `<text class="etiqueta" x="${l.x}" y="${l.y}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="600" fill="#333">${l.text}</text>`
  ).join("\n  ");

  const areaSvg = areas.map(a =>
    `<text class="etiqueta" x="${a.x}" y="${a.y}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#888">${a.text}</text>`
  ).join("\n  ");

  const cotas = `
  <line class="cota" x1="${ox}" y1="${oy - 30}" x2="${ox + pisoW}" y2="${oy - 30}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" x="${ox + pisoW / 2}" y="${oy - 40}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">${pisoW} cm</text>
  <line class="cota" x1="${ox - 30}" y1="${oy}" x2="${ox - 30}" y2="${oy + pisoH}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" x="${ox - 40}" y="${oy + pisoH / 2}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666" transform="rotate(-90 ${ox - 40} ${oy + pisoH / 2})">${pisoH} cm</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pisoW + 100} ${pisoH + 100}" width="${pisoW + 100}" height="${pisoH + 100}">
  <path class="suelo" d="${pathD}" fill="#c4a988" stroke="#8a6a48" stroke-width="3"/>
  ${paredesSvg}
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

// =============================================================================
// PROYECTO DEMO: casa unifamiliar 10m x 8m con puerta + 2 ventanas
// =============================================================================
const DEMO_DIR = join(outDir, "proyecto-demo");
mkdirSync(DEMO_DIR, { recursive: true });

const demoOx = 50, demoOy = 50;
const W = 1000, H = 800;
const ALTO = 250;
const puertaAnchoCm = 90;
const puertaAltoCm = 210;
const ventanaAnchoCm = 120;
const ventanaAltoCm = 120;
const ventanaAntepechoCm = 90;

// PLANTA
{
  const path = join(DEMO_DIR, "planta.svg");
  const exterior = [
    [demoOx, demoOy],
    [demoOx + W, demoOy],
    [demoOx + W, demoOy + H],
    [demoOx, demoOy + H],
  ];
  const puerta = { x1: demoOx + 555, x2: demoOx + 645 };
  const ventana1 = { y1: demoOy + 790, y2: demoOy + 910 };
  const ventana2 = { x1: demoOx + 790, x2: demoOx + 910 };

  function segmentarH(x, y1, y2, hueco) {
    const out = [];
    if (hueco) {
      out.push(`<line class="pared" x1="${x}" y1="${y1}" x2="${x}" y2="${hueco.y1}" stroke="#5a3a1a" stroke-width="3"/>`);
      out.push(`<line class="pared" x1="${x}" y1="${hueco.y2}" x2="${x}" y2="${y2}" stroke="#5a3a1a" stroke-width="3"/>`);
    } else {
      out.push(`<line class="pared" x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#5a3a1a" stroke-width="3"/>`);
    }
    return out.join("\n  ");
  }
  function segmentarV(y, x1, x2, hueco) {
    const out = [];
    if (hueco) {
      out.push(`<line class="pared" x1="${x1}" y1="${y}" x2="${hueco.x1}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
      out.push(`<line class="pared" x1="${hueco.x2}" y1="${y}" x2="${x2}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
    } else {
      out.push(`<line class="pared" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
    }
    return out.join("\n  ");
  }

  const labels = [
    { x: demoOx + 150, y: demoOy + 200, text: "Salón-Cocina" },
    { x: demoOx + 500, y: demoOy + 600, text: "Dormitorio" },
  ];
  const labelSvg = labels.map(l =>
    `<text class="etiqueta" x="${l.x}" y="${l.y}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="600" fill="#333">${l.text}</text>`
  ).join("\n  ");

  const aperturas = [
    { x: demoOx + 600, y: demoOy + 400, text: "Puerta 90cm" },
    { x: demoOx + 850, y: demoOy + 400, text: "V2 120cm" },
    { x: demoOx + W, y: demoOy + 850, text: "V1 120cm" },
  ];
  const aperturaSvg = aperturas.map(a =>
    `<circle class="etiqueta" cx="${a.x}" cy="${a.y}" r="4" fill="#c44"/>\n  <text class="etiqueta" x="${a.x + 8}" y="${a.y - 6}" font-family="sans-serif" font-size="11" fill="#c44">${a.text}</text>`
  ).join("\n  ");

  const cotas = `
  <line class="cota" x1="${demoOx}" y1="${demoOy - 30}" x2="${demoOx + W}" y2="${demoOy - 30}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" x="${demoOx + W / 2}" y="${demoOy - 40}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666">${W} cm</text>
  <line class="cota" x1="${demoOx - 30}" y1="${demoOy}" x2="${demoOx - 30}" y2="${demoOy + H}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" x="${demoOx - 40}" y="${demoOy + H / 2}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#666" transform="rotate(-90 ${demoOx - 40} ${demoOy + H / 2})">${H} cm</text>
  `;

  const pathD = `M ${exterior[0][0]} ${exterior[0][1]} L ${exterior[1][0]} ${exterior[1][1]} L ${exterior[2][0]} ${exterior[2][1]} L ${exterior[3][0]} ${exterior[3][1]} Z`;

  // Metadata de aperturas (invisible, para el parser).
  const aperturasMeta = `
  <rect class="puerta" data-x="${puerta.x1 - demoOx}" data-y="0" data-ancho="${puerta.x2 - puerta.x1}" data-alto="${puertaAltoCm}" style="display:none"/>
  <rect class="ventana" data-x="${ventana2.x1 - demoOx}" data-y="0" data-ancho="${ventana2.x2 - ventana2.x1}" data-alto="${ventanaAltoCm}" style="display:none"/>
  <rect class="ventana" data-x="${W - ventanaAnchoCm}" data-y="${H - ventanaAltoCm}" data-ancho="${ventanaAnchoCm}" data-alto="${ventanaAltoCm}" style="display:none"/>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 100} ${H + 100}" width="${W + 100}" height="${H + 100}">
  <path class="suelo" d="${pathD}" fill="#c4a988" stroke="#8a6a48" stroke-width="3"/>
  ${segmentarH(demoOx + 250, demoOy, demoOy + 400, null)}
  ${segmentarV(demoOy + 400, demoOx + 250, demoOx + W, puerta)}
  ${segmentarH(demoOx + 850, demoOy + 400, demoOy + H, ventana1)}
  ${segmentarH(demoOx + 850, demoOy, demoOy + 400, ventana2)}
  ${aperturasMeta}
  ${labelSvg}
  ${aperturaSvg}
  ${cotas}
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (planta 10x8m)`);
}

// ALZADO NORTE
{
  const path = join(DEMO_DIR, "alzado-norte.svg");
  const W2 = 1000, H2 = ALTO;
  const puertaX = (W2 - puertaAnchoCm) / 2;
  const puertaY = 0;
  const ventana1X = 100;
  const ventana1Y = ventanaAntepechoCm;
  const ventana2X = W2 - ventanaAnchoCm - 100;
  const ventana2Y = ventanaAntepechoCm;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}" data-wall="N" data-wall-width="1000">
  <line class="pared" x1="0" y1="0" x2="${W2}" y2="0" stroke="#333" stroke-width="4"/>
  <line class="pared" x1="0" y1="${H2 - 2}" x2="${W2}" y2="${H2 - 2}" stroke="#333" stroke-width="2"/>
  <rect class="puerta" x="${puertaX}" y="${puertaY}" width="${puertaAnchoCm}" height="${puertaAltoCm}" fill="#f5d99a" stroke="#5a3a1a" stroke-width="3"/>
  <path class="puerta" d="M ${puertaX + puertaAnchoCm} ${puertaY} A ${puertaAnchoCm} ${puertaAltoCm} 0 0 1 ${puertaX + puertaAnchoCm} ${puertaY + puertaAltoCm}" fill="none" stroke="#5a3a1a" stroke-width="2" stroke-dasharray="4 3"/>
  <rect class="ventana" x="${ventana1X}" y="${ventana1Y}" width="${ventanaAnchoCm}" height="${ventanaAltoCm}" fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
  <line class="ventana" x1="${ventana1X + ventanaAnchoCm / 2}" y1="${ventana1Y}" x2="${ventana1X + ventanaAnchoCm / 2}" y2="${ventana1Y + ventanaAltoCm}" stroke="#5a3a1a" stroke-width="1.5"/>
  <line class="ventana" x1="${ventana1X}" y1="${ventana1Y + ventanaAltoCm / 2}" x2="${ventana1X + ventanaAnchoCm}" y2="${ventana1Y + ventanaAltoCm / 2}" stroke="#5a3a1a" stroke-width="1.5"/>
  <rect class="ventana" x="${ventana2X}" y="${ventana2Y}" width="${ventanaAnchoCm}" height="${ventanaAltoCm}" fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
  <line class="ventana" x1="${ventana2X + ventanaAnchoCm / 2}" y1="${ventana2Y}" x2="${ventana2X + ventanaAnchoCm / 2}" y2="${ventana2Y + ventanaAltoCm}" stroke="#5a3a1a" stroke-width="1.5"/>
  <line class="ventana" x1="${ventana2X}" y1="${ventana2Y + ventanaAltoCm / 2}" x2="${ventana2X + ventanaAnchoCm}" y2="${ventana2Y + ventanaAltoCm / 2}" stroke="#5a3a1a" stroke-width="1.5"/>
  <text class="etiqueta" x="${puertaX + puertaAnchoCm / 2}" y="${puertaY + puertaAltoCm + 20}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#666">Puerta ${puertaAnchoCm}×${puertaAltoCm}cm</text>
  <text class="etiqueta" x="${ventana1X + ventanaAnchoCm / 2}" y="${ventana1Y - 8}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#666">V ${ventanaAnchoCm}×${ventanaAltoCm}cm</text>
  <text class="etiqueta" x="${ventana2X + ventanaAnchoCm / 2}" y="${ventana2Y - 8}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#666">V ${ventanaAnchoCm}×${ventanaAltoCm}cm</text>
  <line class="cota" x1="${W2 + 10}" y1="0" x2="${W2 + 10}" y2="${H2}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" x="${W2 + 18}" y="${H2 / 2}" font-family="sans-serif" font-size="14" fill="#666">${H2} cm</text>
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (fachada norte)`);
}

// ALZADO SUR
{
  const path = join(DEMO_DIR, "alzado-sur.svg");
  const W2 = 1000, H2 = ALTO;
  const ventana1X = 200;
  const ventana1Y = ventanaAntepechoCm;
  const ventana2X = W2 - ventanaAnchoCm - 200;
  const ventana2Y = ventanaAntepechoCm;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}" data-wall="S" data-wall-width="1000">
  <line class="pared" x1="0" y1="0" x2="${W2}" y2="0" stroke="#333" stroke-width="4"/>
  <line class="pared" x1="0" y1="${H2 - 2}" x2="${W2}" y2="${H2 - 2}" stroke="#333" stroke-width="2"/>
  <rect class="ventana" x="${ventana1X}" y="${ventana1Y}" width="${ventanaAnchoCm}" height="${ventanaAltoCm}" fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
  <line class="ventana" x1="${ventana1X + ventanaAnchoCm / 2}" y1="${ventana1Y}" x2="${ventana1X + ventanaAnchoCm / 2}" y2="${ventana1Y + ventanaAltoCm}" stroke="#5a3a1a" stroke-width="1.5"/>
  <line class="ventana" x1="${ventana1X}" y1="${ventana1Y + ventanaAltoCm / 2}" x2="${ventana1X + ventanaAnchoCm}" y2="${ventana1Y + ventanaAltoCm / 2}" stroke="#5a3a1a" stroke-width="1.5"/>
  <rect class="ventana" x="${ventana2X}" y="${ventana2Y}" width="${ventanaAnchoCm}" height="${ventanaAltoCm}" fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
  <line class="ventana" x1="${ventana2X + ventanaAnchoCm / 2}" y1="${ventana2Y}" x2="${ventana2X + ventanaAnchoCm / 2}" y2="${ventana2Y + ventanaAltoCm}" stroke="#5a3a1a" stroke-width="1.5"/>
  <line class="ventana" x1="${ventana2X}" y1="${ventana2Y + ventanaAltoCm / 2}" x2="${ventana2X + ventanaAnchoCm}" y2="${ventana2Y + ventanaAltoCm / 2}" stroke="#5a3a1a" stroke-width="1.5"/>
  <text class="etiqueta" x="${ventana1X + ventanaAnchoCm / 2}" y="${ventana1Y - 8}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#666">V1 ${ventanaAnchoCm}×${ventanaAltoCm}cm</text>
  <text class="etiqueta" x="${ventana2X + ventanaAnchoCm / 2}" y="${ventana2Y - 8}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#666">V2 ${ventanaAnchoCm}×${ventanaAltoCm}cm</text>
  <line class="cota" x1="${W2 + 10}" y1="0" x2="${W2 + 10}" y2="${H2}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" x="${W2 + 18}" y="${H2 / 2}" font-family="sans-serif" font-size="14" fill="#666">${H2} cm</text>
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (fachada sur)`);
}

console.log("");
console.log("Proyecto demo en public/samples/proyecto-demo/");
console.log("  - planta.svg          (1000x800 cm)");
console.log("  - alzado-norte.svg    (1000x250 cm, puerta + 2 ventanas)");
console.log("  - alzado-sur.svg      (1000x250 cm, 2 ventanas)");
