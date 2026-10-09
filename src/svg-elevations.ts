/**
 * Parser de SVGs de alzado (vista frontal de una fachada).
 *
 * Convencion: el SVG representa la fachada vista de frente, con origen
 * abajo-izquierda, X derecha, Y arriba. Esto es coherente con el mundo
 * real (arriba = techo, abajo = suelo).
 *
 * Salida:
 *   {
 *     widthCm: number,   // ancho del alzado
 *     heightCm: number,  // alto del alzado
 *     apertures: [
 *       { kind: "door" | "window", xCm, widthCm, yCm, heightCm }
 *     ]
 *   }
 *
 * Deteccion de aperturas por convencion de colores/rellenos:
 *   - Puertas:   <rect fill="#ffffff"> (rectangulo blanco)
 *   - Ventanas:  <rect fill="#cce4ff"> (azul claro, color de cristal)
 *
 * Deteccion explicita (preferida si esta presente):
 *   - Atributo data-kind="door" | "window" en el <rect>.
 *
 * Atributos del <svg> raiz:
 *   - data-wall: nombre de la pared asociada (N, S, E, O, o un id libre).
 *   - data-wall-width: ancho real de la pared en cm (puede coincidir con
 *     viewBox/width si el alzado esta a escala 1:1).
 */

import { promises as fs } from "node:fs";

export interface ElevationAperture {
  kind: "door" | "window";
  /** X del borde izquierdo en cm (relativa al alzado). */
  xCm: number;
  /** Ancho en cm. */
  widthCm: number;
  /** Y del borde inferior en cm (0 = suelo). */
  yCm: number;
  /** Alto en cm. */
  heightCm: number;
}

export interface ElevationMeta {
  /** ID de la pared a la que se asocia (libre: N/S/E/O, "fachada-principal", etc.). */
  wall: string | null;
  /** Ancho real de la pared en cm. Si esta, se usa para escalar el alzado. */
  wallWidthCm: number | null;
  /** Ancho del viewBox/width del SVG. */
  widthCm: number;
  /** Alto del viewBox/height del SVG. */
  heightCm: number;
  apertures: ElevationAperture[];
}

/** Convierte un numero SVG (puede tener unidad "px", "cm", etc.) a numero puro. */
function parseNumber(s: string): number {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Numero invalido: ${s}`);
  return parseFloat(m[1]);
}

export function parseElevation(svg: string): ElevationMeta {
  // Extraer atributos del <svg> raiz (solo el primer match, en la primera linea).
  const svgTagMatch = svg.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) throw new Error("SVG invalido: falta <svg>");
  const svgAttrs = svgTagMatch[1];

  function getAttr(name: string): string | null {
    const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
    const m = svgAttrs.match(re);
    return m ? m[1] : null;
  }

  const wall = getAttr("data-wall");
  const wallWidthStr = getAttr("data-wall-width");
  const viewBoxStr = getAttr("viewBox");
  const widthStr = getAttr("width");
  const heightStr = getAttr("height");

  let widthCm: number;
  let heightCm: number;
  if (viewBoxStr) {
    const parts = viewBoxStr.trim().split(/[\s,]+/).map(parseNumber);
    if (parts.length !== 4) throw new Error("viewBox invalido");
    widthCm = parts[2];
    heightCm = parts[3];
  } else if (widthStr && heightStr) {
    widthCm = parseNumber(widthStr);
    heightCm = parseNumber(heightStr);
  } else {
    throw new Error("SVG sin dimensiones (viewBox o width/height)");
  }

  const wallWidthCm = wallWidthStr ? parseNumber(wallWidthStr) : null;

  // Extraer todos los <rect> con sus atributos.
  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  const apertures: ElevationAperture[] = [];
  let m: RegExpExecArray | null;
  while ((m = rectRegex.exec(svg)) !== null) {
    const attrs = m[1];
    function attr(name: string): string | null {
      const r = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
      const a = attrs.match(r);
      return a ? a[1] : null;
    }
    const x = parseNumber(attr("x") ?? "0");
    const y = parseNumber(attr("y") ?? "0");
    const w = parseNumber(attr("width") ?? "0");
    const h = parseNumber(attr("height") ?? "0");
    if (w === 0 || h === 0) continue;
    // Filtro de exclusion: lineas de suelo/techo son <line>, no <rect>,
    // asi que no aparecen aqui. Pero el rect del cristal de la ventana
    // es valido y las dimensiones pueden ser pequenas (puerta 90x210,
    // ventana 120x120); cualquier rect con w,h razonables se considera.
    // Para excluir la "huella" del suelo o el techo (que nunca dibujariamos
    // como rect, sino como line), no hace falta mas filtro.

    const fill = (attr("fill") ?? "").toLowerCase();
    const dataKind = attr("data-kind")?.toLowerCase();

    let kind: "door" | "window" | null = null;
    if (dataKind === "door" || dataKind === "puerta") kind = "door";
    else if (dataKind === "window" || dataKind === "ventana") kind = "window";
    else if (fill === "#ffffff" || fill === "#fff" || fill === "white") kind = "door";
    else if (fill === "#cce4ff") kind = "window";
    else if (fill === "none") {
      // <rect> con fill="none" y stroke grueso: lo tratamos como puerta
      // si tiene proporciones verticales (h/w > 1.5). En caso contrario,
      // ventana.
      if (h / w > 1.5) kind = "door";
      else if (h / w < 1.2) kind = "window";
    }

    if (kind) {
      apertures.push({
        kind,
        xCm: x,
        widthCm: w,
        yCm: y,
        heightCm: h,
      });
    }
  }

  return {
    wall,
    wallWidthCm,
    widthCm,
    heightCm,
    apertures,
  };
}

/** Lee un archivo y devuelve la meta del alzado. */
export async function parseElevationFile(path: string): Promise<ElevationMeta> {
  const svg = await fs.readFile(path, "utf-8");
  return parseElevation(svg);
}
