/**
 * Genera SVGs de prueba para vista3D con la convencion v0.6.0:
 *
 * Cada elemento se marca con una clase semantica + atributos data-*
 * en kebab-case y en ingles:
 *   - data-id               identificador unico
 *   - data-name             nombre legible (panel)
 *   - data-group            wall/floor/door/window/hole/furniture/label/dimension
 *   - data-room             habitacion a la que pertenece
 *   - data-wall-id          id de la pared padre (para aperturas)
 *   - data-color-cara-a   color cara exterior/fachada
 *   - data-color-cara-b   color cara interior/pintura
 *   - data-color-cara-c  color del cuerpo extruido
 *   - data-color-top        color cara superior (suelo)
 *   - data-color-bottom     color cara inferior (suelo)
 *   - data-texture-*        liso/madera/baldosa/ladrillo/marmol/piedra
 *
 * Clases CSS:
 *   - .pared / .wall / .muro       -> wall
 *   - .suelo / .floor              -> floor
 *   - .puerta / .door              -> door
 *   - .ventana / .window           -> window
 *   - .hueco / .hole               -> hole
 *   - .mueble / .furniture /
 *     .silla / .mesa / .sofa /
 *     .cama / .armario             -> furniture (no se renderiza en 3D)
 *   - .etiqueta / .label / .texto  -> label (no se renderiza en 3D)
 *   - .cota / .dimension / .medida -> dimension (no se renderiza en 3D)
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
  <path class="suelo" data-id="floor-1" data-name="Suelo" data-group="floor"
        data-color-top="#c4a988" data-color-bottom="#6a5a48"
        d="${d}" fill="#c4a988" stroke="#8a6a48" stroke-width="2"/>
  <line class="cota" data-id="dim-width" data-group="dimension" data-text="400 cm"
        x1="0" y1="-15" x2="400" y2="-15" stroke="#666" stroke-width="1"/>
  <text class="etiqueta" data-id="label-1" data-group="label" data-text="400 cm"
        x="200" y="-25" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#666">400 cm</text>
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (habitacion en L, simple)`);
}

// =============================================================================
// PLANO 2: Piso 3 habitaciones (con atributos data-* completos)
// =============================================================================
{
  const path = join(outDir, "piso-3hab.svg");
  const ox = 50, oy = 50;
  const pisoW = 1300, pisoH = 800;

  const exterior = [
    [ox, oy],
    [ox + pisoW, oy],
    [ox + pisoW, oy + pisoH],
    [ox, oy + pisoH],
  ];

  // Cada pared interior tiene id, nombre, room, y colores.
  const paredes = [
    { x1: ox,        y1: oy + 400, x2: ox + 850,  y2: oy + 400,
      id: "wall-living-dorm1", name: "Muro salon-dorm1", room: "living",
      colorExt: "#eee2cc", colorInt: "#f5ead2", colorExt2: "#8b7355" },
    { x1: ox + 500,  y1: oy,       x2: ox + 500,  y2: oy + 400,
      id: "wall-living-dorm1-v", name: "Muro vertical salon-dorm1", room: "dorm1",
      colorExt: "#eee2cc", colorInt: "#f5ead2", colorExt2: "#8b7355" },
    { x1: ox + 800,  y1: oy + 400, x2: ox + 800,  y2: oy + 800,
      id: "wall-kitchen-bath", name: "Muro cocina-bano", room: "kitchen",
      colorExt: "#d4c4a0", colorInt: "#c0e8d0", colorExt2: "#8b7355" },
    { x1: ox + 1000, y1: oy + 400, x2: ox + 1000, y2: oy + 800,
      id: "wall-bath-dorm2", name: "Muro bano-dorm2", room: "bath",
      colorExt: "#b8d8e8", colorInt: "#e0f0f0", colorExt2: "#8b7355" },
    { x1: ox + 250,  y1: oy + 400, x2: ox + 250,  y2: oy + 800,
      id: "wall-hall-kitchen", name: "Muro pasillo-cocina", room: "hall",
      colorExt: "#eee2cc", colorInt: "#f5ead2", colorExt2: "#8b7355" },
  ];

  const labels = [
    { x: ox + 250,  y: oy + 220, text: "Living",      room: "living" },
    { x: ox + 675,  y: oy + 220, text: "Dorm. 1",     room: "dorm1" },
    { x: ox + 125,  y: oy + 600, text: "Pasillo",     room: "hall" },
    { x: ox + 525,  y: oy + 600, text: "Cocina",      room: "kitchen" },
    { x: ox + 900,  y: oy + 600, text: "Baño",        room: "bath" },
    { x: ox + 1150, y: oy + 600, text: "Dorm. 2",     room: "dorm2" },
  ];
  const areas = [
    { x: ox + 250,  y: oy + 250, text: "20 m²" },
    { x: ox + 675,  y: oy + 250, text: "14 m²" },
    { x: ox + 125,  y: oy + 630, text: "10 m²" },
    { x: ox + 525,  y: oy + 630, text: "12 m²" },
    { x: ox + 900,  y: oy + 630, text: "8 m²" },
    { x: ox + 1150, y: oy + 630, text: "12 m²" },
  ];

  let pathD = `M ${exterior[0][0]} ${exterior[0][1]} `;
  for (let i = 1; i < exterior.length; i++) pathD += `L ${exterior[i][0]} ${exterior[i][1]} `;
  pathD += "Z";

  const paredesSvg = paredes.map(p =>
    `<line class="pared"
      data-id="${p.id}" data-name="${p.name}" data-group="wall" data-room="${p.room}"
      data-color-cara-a="${p.colorExt}" data-color-cara-b="${p.colorInt}"
      data-color-cara-c="${p.colorExt2}" data-texture-cara-a="liso"
      data-texture-cara-b="liso" data-texture-cara-c="liso"
      x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}"
      stroke="#5a3a1a" stroke-width="3" stroke-linecap="square"/>`
  ).join("\n  ");

  const labelSvg = labels.map((l, i) =>
    `<text class="etiqueta" data-id="label-${i+1}" data-group="label" data-room="${l.room}"
      x="${l.x}" y="${l.y}" text-anchor="middle" font-family="sans-serif"
      font-size="22" font-weight="600" fill="#333">${l.text}</text>`
  ).join("\n  ");

  const areaSvg = areas.map((a, i) =>
    `<text class="etiqueta" data-id="area-${i+1}" data-group="label"
      x="${a.x}" y="${a.y}" text-anchor="middle" font-family="sans-serif"
      font-size="14" fill="#888">${a.text}</text>`
  ).join("\n  ");

  const cotas = `
  <line class="cota" data-id="dim-width" data-group="dimension" data-text="${pisoW} cm"
        x1="${ox}" y1="${oy - 30}" x2="${ox + pisoW}" y2="${oy - 30}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" data-id="label-dim-w" data-group="label"
        x="${ox + pisoW / 2}" y="${oy - 40}" text-anchor="middle"
        font-family="sans-serif" font-size="16" fill="#666">${pisoW} cm</text>
  <line class="cota" data-id="dim-height" data-group="dimension" data-text="${pisoH} cm"
        x1="${ox - 30}" y1="${oy}" x2="${ox - 30}" y2="${oy + pisoH}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" data-id="label-dim-h" data-group="label"
        x="${ox - 40}" y="${oy + pisoH / 2}" text-anchor="middle"
        font-family="sans-serif" font-size="16" fill="#666"
        transform="rotate(-90 ${ox - 40} ${oy + pisoH / 2})">${pisoH} cm</text>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pisoW + 100} ${pisoH + 100}" width="${pisoW + 100}" height="${pisoH + 100}">
  <path class="suelo" data-id="floor-main" data-name="Suelo" data-group="floor"
        data-color-top="#c4a988" data-color-bottom="#6a5a48"
        d="${pathD}" fill="#c4a988" stroke="#8a6a48" stroke-width="3"/>
  ${paredesSvg}
  ${labelSvg}
  ${areaSvg}
  ${cotas}
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (piso 3 habitaciones ~80m², con data-*)`);
}

console.log("");
console.log("Para descargar:");
console.log("  http://194.163.184.142:8080/public/samples/sample-room.svg");
console.log("  http://194.163.184.142:8080/public/samples/piso-3hab.svg");

// =============================================================================
// PROYECTO DEMO: casa unifamiliar 10m x 8m (legacy - sin data-* en paredes)
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
      out.push(`<line class="pared" data-id="wall-h-${x}-a" data-name="Muro" data-group="wall" data-room=""
        x1="${x}" y1="${y1}" x2="${x}" y2="${hueco.y1}" stroke="#5a3a1a" stroke-width="3"/>`);
      out.push(`<line class="pared" data-id="wall-h-${x}-b" data-name="Muro" data-group="wall" data-room=""
        x1="${x}" y1="${hueco.y2}" x2="${x}" y2="${y2}" stroke="#5a3a1a" stroke-width="3"/>`);
    } else {
      out.push(`<line class="pared" data-id="wall-h-${x}" data-name="Muro" data-group="wall" data-room=""
        x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#5a3a1a" stroke-width="3"/>`);
    }
    return out.join("\n  ");
  }
  function segmentarV(y, x1, x2, hueco) {
    const out = [];
    if (hueco) {
      out.push(`<line class="pared" data-id="wall-v-${y}-a" data-name="Muro" data-group="wall" data-room=""
        x1="${x1}" y1="${y}" x2="${hueco.x1}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
      out.push(`<line class="pared" data-id="wall-v-${y}-b" data-name="Muro" data-group="wall" data-room=""
        x1="${hueco.x2}" y1="${y}" x2="${x2}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
    } else {
      out.push(`<line class="pared" data-id="wall-v-${y}" data-name="Muro" data-group="wall" data-room=""
        x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
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
  console.log(`OK: ${path} (planta 10x8m, legacy)`);
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
  console.log(`OK: ${path} (fachada norte, legacy)`);
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
  console.log(`OK: ${path} (fachada sur, legacy)`);
}

// =============================================================================
// PROYECTO MARA: casa con atributos data-* completos
// =============================================================================
const MARA_DIR = join(outDir, "proyecto-mara");
mkdirSync(MARA_DIR, { recursive: true });

const maraOx = 50, maraOy = 50;
const MW = 1000, MH = 800;
const MALTO = 270;

{
  // PLANTA MARA: 2 habitaciones (salon + dormitorio), con 1 puerta interior
  // y 3 aperturas en fachada (puerta entrada, ventana salon, ventana dorm).
  const path = join(MARA_DIR, "planta.svg");
  const exterior = [
    [maraOx, maraOy],
    [maraOx + MW, maraOy],
    [maraOx + MW, maraOy + MH],
    [maraOx, maraOy + MH],
  ];

  // Muro interior: vertical a 550cm (separa salon de dormitorio).
  const muroInteriorX = maraOx + 550;
  // Puerta interior (entre salon y dormitorio) a y=400cm.
  const puertaInteriorY1 = maraOy + 400;
  const puertaInteriorY2 = maraOy + 500;

  // Paredes exteriores (4 lados del rectangulo).
  const exteriorParedes = [
    { id: "wall-south", name: "Muro sur",  // fachada (puerta entrada)
      x1: maraOx, y1: maraOy + MH, x2: maraOx + MW, y2: maraOy + MH },
    { id: "wall-north", name: "Muro norte",
      x1: maraOx, y1: maraOy,     x2: maraOx + MW, y2: maraOy },
    { id: "wall-west",  name: "Muro oeste",
      x1: maraOx, y1: maraOy,     x2: maraOx,     y2: maraOy + MH },
    { id: "wall-east",  name: "Muro este",
      x1: maraOx + MW, y1: maraOy, x2: maraOx + MW, y2: maraOy + MH },
  ];
  const exteriorParedesSvg = exteriorParedes.map(p =>
    `<line class="pared" data-id="${p.id}" data-name="${p.name}" data-group="wall" data-room=""
      data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
      data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
      x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" stroke="#5a3a1a" stroke-width="3"/>`
  ).join("\n  ");

  // Aperturas en fachada (deben coincidir con los alzados).
  // Puerta de entrada (fachada sur) en x=300.
  const fachadaSurPuertaX1 = maraOx + 300;
  const fachadaSurPuertaX2 = maraOx + 400;
  // Ventanas fachada sur: salon (x=600) y dormitorio (x=800).
  const fachadaSurVentana1 = { x1: maraOx + 600, x2: maraOx + 720 };
  const fachadaSurVentana2 = { x1: maraOx + 800, x2: maraOx + 920 };

  function segmentarV(y, x1, x2, hueco, id) {
    const out = [];
    if (hueco) {
      out.push(`<line class="pared" data-id="${id}-a" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="${x1}" y1="${y}" x2="${hueco.x1}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
      out.push(`<line class="pared" data-id="${id}-b" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="${hueco.x2}" y1="${y}" x2="${x2}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
    } else {
      out.push(`<line class="pared" data-id="${id}" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#5a3a1a" stroke-width="3"/>`);
    }
    return out.join("\n  ");
  }
  function segmentarH(x, y1, y2, hueco, id, name) {
    const out = [];
    if (hueco) {
      out.push(`<line class="pared" data-id="${id}-a" data-name="${name || ""}" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="${x}" y1="${y1}" x2="${x}" y2="${hueco.y1}" stroke="#5a3a1a" stroke-width="3"/>`);
      out.push(`<line class="pared" data-id="${id}-b" data-name="${name || ""}" data-group="wall" data-room="dormitorio"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="${x}" y1="${hueco.y2}" x2="${x}" y2="${y2}" stroke="#5a3a1a" stroke-width="3"/>`);
    } else {
      out.push(`<line class="pared" data-id="${id}" data-name="${name || ""}" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="liso" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#5a3a1a" stroke-width="3"/>`);
    }
    return out.join("\n  ");
  }

  const labels = [
    { x: maraOx + 275, y: maraOy + 380, text: "Salón",     room: "salon" },
    { x: maraOx + 775, y: maraOy + 380, text: "Dormitorio", room: "dormitorio" },
  ];
  const labelSvg = labels.map((l, i) =>
    `<text class="etiqueta" data-id="label-${i+1}" data-group="label" data-room="${l.room}"
      x="${l.x}" y="${l.y}" text-anchor="middle" font-family="sans-serif"
      font-size="22" font-weight="600" fill="#333">${l.text}</text>`
  ).join("\n  ");

  // Muebles: 1 sofa en salon, 1 cama en dormitorio.
  const muebles = [
    { id: "sofa-1", name: "Sofá",  room: "salon",
      x: maraOx + 50,  y: maraOy + 50,  w: 250, h: 90,  fill: "#8b6f4a" },
    { id: "cama-1", name: "Cama",  room: "dormitorio",
      x: maraOx + 600, y: maraOy + 50,  w: 200, h: 160, fill: "#a89070" },
    { id: "mesa-1", name: "Mesa salón", room: "salon",
      x: maraOx + 350, y: maraOy + 50,  w: 120, h: 80,  fill: "#9c7a55" },
  ];
  const mueblesSvg = muebles.map(m =>
    `<rect class="mueble" data-id="${m.id}" data-name="${m.name}" data-group="furniture" data-room="${m.room}"
      data-color-cara-a="${m.fill}" data-texture-cara-a="madera"
      x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}"
      fill="${m.fill}" stroke="#333" stroke-width="1" opacity="0.7"/>`
  ).join("\n  ");

  const cotas = `
  <line class="cota" data-id="dim-width" data-group="dimension" data-text="${MW} cm"
        x1="${maraOx}" y1="${maraOy - 30}" x2="${maraOx + MW}" y2="${maraOy - 30}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" data-id="label-dim-w" data-group="label"
        x="${maraOx + MW / 2}" y="${maraOy - 40}" text-anchor="middle"
        font-family="sans-serif" font-size="16" fill="#666">${MW} cm</text>
  <line class="cota" data-id="dim-height" data-group="dimension" data-text="${MH} cm"
        x1="${maraOx - 30}" y1="${maraOy}" x2="${maraOx - 30}" y2="${maraOy + MH}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" data-id="label-dim-h" data-group="label"
        x="${maraOx - 40}" y="${maraOy + MH / 2}" text-anchor="middle"
        font-family="sans-serif" font-size="16" fill="#666"
        transform="rotate(-90 ${maraOx - 40} ${maraOy + MH / 2})">${MH} cm</text>
  `;

  const pathD = `M ${exterior[0][0]} ${exterior[0][1]} L ${exterior[1][0]} ${exterior[1][1]} L ${exterior[2][0]} ${exterior[2][1]} L ${exterior[3][0]} ${exterior[3][1]} Z`;

  // Metadata de aperturas con coordenadas REALES en la planta
  // (las lee el parser para identificar cada apertura).
  // Las aperturas que estan en fachada (sur) iran centradas en la pared sur.
  const aperturasMeta = `
  <rect class="puerta" data-id="door-entrada" data-name="Puerta entrada" data-group="door"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#5a3a20" data-color-cara-b="#5a3a20" data-color-cara-c="#3a2a18"
        data-texture-cara-a="madera" data-texture-cara-b="madera" data-texture-cara-c="liso"
        x="${fachadaSurPuertaX1 - maraOx}" y="${MH - 5}" width="${fachadaSurPuertaX2 - fachadaSurPuertaX1}" height="5"/>
  <rect class="ventana" data-id="window-salon" data-name="Ventana salón" data-group="window"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#b8d8f0" data-color-cara-b="#b8d8f0" data-color-cara-c="#9fc8e8"
        data-texture-cara-a="liso"
        x="${fachadaSurVentana1.x1 - maraOx}" y="${MH - 5}" width="${fachadaSurVentana1.x2 - fachadaSurVentana1.x1}" height="5"/>
  <rect class="ventana" data-id="window-dorm" data-name="Ventana dormitorio" data-group="window"
        data-room="dormitorio" data-wall-id="wall-south"
        data-color-cara-a="#b8d8f0" data-color-cara-b="#b8d8f0" data-color-cara-c="#9fc8e8"
        data-texture-cara-a="liso"
        x="${fachadaSurVentana2.x1 - maraOx}" y="${MH - 5}" width="${fachadaSurVentana2.x2 - fachadaSurVentana2.x1}" height="5"/>
  <rect class="puerta" data-id="door-interior" data-name="Puerta interior" data-group="door"
        data-room="salon" data-wall-id="wall-mid"
        data-color-cara-a="#8b6f4a" data-color-cara-b="#8b6f4a" data-color-cara-c="#5a4023"
        data-texture-cara-a="madera" data-texture-cara-b="madera" data-texture-cara-c="liso"
        x="${muroInteriorX - maraOx - 3}" y="${puertaInteriorY1 - maraOy}" width="6" height="${puertaInteriorY2 - puertaInteriorY1}"/>
  `;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MW + 100} ${MH + 100}" width="${MW + 100}" height="${MH + 100}">
  <path class="suelo" data-id="floor-main" data-name="Suelo" data-group="floor"
        data-color-top="#c4a988" data-color-bottom="#6a5a48"
        data-texture-top="liso" data-texture-bottom="liso"
        d="${pathD}" fill="#c4a988" stroke="#8a6a48" stroke-width="3"/>
  ${segmentarH(muroInteriorX, maraOy, maraOy + MH,
    { y1: puertaInteriorY1, y2: puertaInteriorY2 }, "wall-mid",
    "Muro medio salón-dormitorio")}
  ${exteriorParedesSvg}
  ${mueblesSvg}
  ${aperturasMeta}
  ${labelSvg}
  ${cotas}
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (planta Mara, 2 habitaciones + muebles)`);
}

// ALZADO SUR (fachada principal, con puerta entrada + 2 ventanas)
{
  const path = join(MARA_DIR, "alzado-sur.svg");
  const W2 = MW, H2 = MALTO;
  const puertaX = 250;  // 300-50
  const puertaY = 0;
  const ventana1X = 550;  // 600-50
  const ventana1Y = 90;
  const ventana2X = 750;  // 800-50
  const ventana2Y = 90;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W2} ${H2}" width="${W2}" height="${H2}"
     data-wall-id="wall-south" data-wall-width="${MW}">
  <line class="pared" data-id="wall-south" data-name="Muro sur" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="ladrillo" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="0" y1="0" x2="${W2}" y2="0" stroke="#333" stroke-width="4"/>
  <line class="pared" data-id="wall-south-base" data-group="wall" data-room="salon"
        x1="0" y1="${H2 - 2}" x2="${W2}" y2="${H2 - 2}" stroke="#333" stroke-width="2"/>

  <rect class="puerta" data-id="door-entrada" data-name="Puerta entrada" data-group="door"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#5a3a20" data-color-cara-b="#5a3a20" data-color-cara-c="#3a2a18"
        data-texture-cara-a="madera" data-texture-cara-b="madera" data-texture-cara-c="liso"
        x="${puertaX}" y="${puertaY}" width="100" height="210"
        fill="#f5d99a" stroke="#5a3a1a" stroke-width="3"/>
  <path class="puerta" d="M ${puertaX + 100} ${puertaY} A 100 210 0 0 1 ${puertaX + 100} ${puertaY + 210}"
        fill="none" stroke="#5a3a1a" stroke-width="2" stroke-dasharray="4 3"/>

  <rect class="ventana" data-id="window-salon" data-name="Ventana salón" data-group="window"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#b8d8f0" data-color-cara-b="#b8d8f0" data-color-cara-c="#9fc8e8"
        data-texture-cara-a="liso"
        x="${ventana1X}" y="${ventana1Y}" width="120" height="120"
        fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
  <line class="ventana" x1="${ventana1X + 60}" y1="${ventana1Y}" x2="${ventana1X + 60}" y2="${ventana1Y + 120}" stroke="#5a3a1a" stroke-width="1.5"/>
  <line class="ventana" x1="${ventana1X}" y1="${ventana1Y + 60}" x2="${ventana1X + 120}" y2="${ventana1Y + 60}" stroke="#5a3a1a" stroke-width="1.5"/>

  <rect class="ventana" data-id="window-dorm" data-name="Ventana dormitorio" data-group="window"
        data-room="dormitorio" data-wall-id="wall-south"
        data-color-cara-a="#b8d8f0" data-color-cara-b="#b8d8f0" data-color-cara-c="#9fc8e8"
        data-texture-cara-a="liso"
        x="${ventana2X}" y="${ventana2Y}" width="120" height="120"
        fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
  <line class="ventana" x1="${ventana2X + 60}" y1="${ventana2Y}" x2="${ventana2X + 60}" y2="${ventana2Y + 120}" stroke="#5a3a1a" stroke-width="1.5"/>
  <line class="ventana" x1="${ventana2X}" y1="${ventana2Y + 60}" x2="${ventana2X + 120}" y2="${ventana2Y + 60}" stroke="#5a3a1a" stroke-width="1.5"/>

  <text class="etiqueta" data-id="label-door" data-group="label" data-room="salon"
        x="${puertaX + 50}" y="${puertaY + 230}" text-anchor="middle"
        font-family="sans-serif" font-size="14" fill="#666">Puerta entrada 100×210cm</text>
  <text class="etiqueta" data-id="label-win1" data-group="label" data-room="salon"
        x="${ventana1X + 60}" y="${ventana1Y - 8}" text-anchor="middle"
        font-family="sans-serif" font-size="12" fill="#666">V salón 120×120cm</text>
  <text class="etiqueta" data-id="label-win2" data-group="label" data-room="dormitorio"
        x="${ventana2X + 60}" y="${ventana2Y - 8}" text-anchor="middle"
        font-family="sans-serif" font-size="12" fill="#666">V dorm 120×120cm</text>

  <line class="cota" data-id="dim-h" data-group="dimension" data-text="${H2} cm"
        x1="${W2 + 10}" y1="0" x2="${W2 + 10}" y2="${H2}" stroke="#888" stroke-width="1"/>
  <text class="etiqueta" data-id="label-dim-h" data-group="label"
        x="${W2 + 18}" y="${H2 / 2}" font-family="sans-serif" font-size="14" fill="#666">${H2} cm</text>
</svg>
`;
  writeFileSync(path, svg, "utf-8");
  console.log(`OK: ${path} (fachada sur Mara, con data-*)`);
}

console.log("");
console.log("Proyecto Mara en public/samples/proyecto-mara/");
console.log("  - planta.svg          (1000x800 cm, 2 habitaciones + muebles + cotas)");
console.log("  - alzado-sur.svg      (1000x270 cm, 1 puerta + 2 ventanas, todos con data-*)");
console.log("");
console.log("Proyecto demo legacy en public/samples/proyecto-demo/");
console.log("  - planta.svg          (1000x800 cm)");
console.log("  - alzado-norte.svg    (1000x250 cm)");
console.log("  - alzado-sur.svg      (1000x250 cm)");
