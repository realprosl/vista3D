/**
 * Parser de SVGs de alzado (vista frontal de una fachada).
 *
 * Convencion: el SVG representa la fachada vista de frente, con origen
 * abajo-izquierda, X derecha, Y arriba. Esto es coherente con el mundo
 * real (arriba = techo, abajo = suelo).
 *
 * Atributos del <svg> raiz (kebab-case, en ingles):
 *   - data-wall-id     ID de la pared asociada (N, S, E, O, o un id libre
 *                      como "wall-north"). Se usa para vincular con la
 *                      pared de la planta.
 *   - data-wall-width  Ancho real de la pared en cm (puede coincidir con
 *                      viewBox/width si el alzado esta a escala 1:1).
 *
 * Atributos de los elementos (kebab-case):
 *   - data-id, data-name, data-group, data-room (mismos que en la planta)
 *   - data-color-cara-a, data-color-cara-b, data-color-cara-c
 *   - data-texture-cara-a, data-texture-cara-b, data-texture-cara-c
 *
 * Salida (parseElevationElements):
 *   {
 *     wallId, wallWidthCm, widthCm, heightCm, viewBox,
 *     apertures: [
 *       { id, name, group, room, parentWallId, xCm, widthCm, yCm, heightCm,
 *         colorCaraA, colorCaraB, colorCaraC,
 *         textureCaraA, textureCaraB, textureCaraC }
 *     ]
 *   }
 *
 * Salida legacy (parseElevation): misma forma que v0.5.0 para no romper
 * el servidor actual.
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

/** Apertura con metadatos completos (Fase 1: data-* attributes). */
export interface ElevationApertureElement {
  id: string;
  name: string | null;
  group: "door" | "window" | "hole";
  room: string | null;
  parentWallId: string | null;
  xCm: number;
  widthCm: number;
  yCm: number;
  heightCm: number;
  colorCaraA: string | null;
  colorCaraB: string | null;
  colorCaraC: string | null;
  textureCaraA: string | null;
  textureCaraB: string | null;
  textureCaraC: string | null;
}

export interface ElevationElements {
  wallId: string | null;
  wallWidthCm: number | null;
  widthCm: number;
  heightCm: number;
  viewBox: { x: number; y: number; width: number; height: number } | null;
  apertures: ElevationApertureElement[];
}

/** Convierte un numero SVG (puede tener unidad "px", "cm", etc.) a numero puro. */
function parseNumber(s: string): number {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`Numero invalido: ${s}`);
  return parseFloat(m[1]);
}

/** Parsea atributos XML como un objeto plano. */
function attrsToObject(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

/** Lee un atributo data- (kebab-case) o su alias camelCase. */
function dataAttr(attrs: Record<string, string>, kebab: string): string | null {
  if (attrs[kebab] != null && attrs[kebab] !== "") return attrs[kebab];
  const camel = kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (attrs[camel] != null && attrs[camel] !== "") return attrs[camel];
  return null;
}

/** Determina el group de una apertura por la clase. */
function apertureGroupFromClass(cls: string): "door" | "window" | "hole" | null {
  const tokens = cls.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.some(t => t === "puerta" || t === "door")) return "door";
  if (tokens.some(t => t === "ventana" || t === "window")) return "window";
  if (tokens.some(t => t === "hueco" || t === "hole")) return "hole";
  return null;
}

/** Genera un id unico si el elemento no tiene data-id. */
function genId(prefix: string, used: Set<string>, idx: number): string {
  let candidate = `${prefix}-${idx}`;
  let n = idx;
  while (used.has(candidate)) {
    n++;
    candidate = `${prefix}-${n}`;
  }
  used.add(candidate);
  return candidate;
}

// =============================================================================
// API NUEVA: parseElevationElements
// =============================================================================

/**
 * Parsea un SVG de alzado y devuelve TODOS los metadatos.
 * Si el SVG no tiene los nuevos atributos data-*, autogenera ids y
 * rellena con defaults (compatible con SVGs legacy).
 */
export function parseElevationElements(svg: string): ElevationElements {
  const svgTagMatch = svg.match(/<svg\b([^>]*)>/i);
  if (!svgTagMatch) throw new Error("SVG invalido: falta <svg>");
  const svgAttrs = attrsToObject(svgTagMatch[1]);

  // wallId: leer tanto data-wall-id (nuevo, kebab) como data-wall (legacy)
  const wallId = dataAttr(svgAttrs, "data-wall-id") || svgAttrs["data-wall"] || null;
  const wallWidthStr = dataAttr(svgAttrs, "data-wall-width");
  const viewBoxStr = svgAttrs["viewBox"];
  const widthStr = svgAttrs["width"];
  const heightStr = svgAttrs["height"];

  let widthCm: number;
  let heightCm: number;
  let viewBox: { x: number; y: number; width: number; height: number } | null = null;
  if (viewBoxStr) {
    const parts = viewBoxStr.trim().split(/[\s,]+/).map(parseNumber);
    if (parts.length !== 4) throw new Error("viewBox invalido");
    widthCm = parts[2];
    heightCm = parts[3];
    viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  } else if (widthStr && heightStr) {
    widthCm = parseNumber(widthStr);
    heightCm = parseNumber(heightStr);
  } else {
    throw new Error("SVG sin dimensiones (viewBox o width/height)");
  }

  const wallWidthCm = wallWidthStr ? parseNumber(wallWidthStr) : null;

  // Iterar todos los <rect> y <line> con clase .puerta/.ventana/.hueco
  const apertures: ElevationApertureElement[] = [];
  const usedIds = new Set<string>();
  let doorIdx = 0, winIdx = 0, holeIdx = 0;

  const elementRegex = /<(rect|line)\b([^>]*?)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = elementRegex.exec(svg)) !== null) {
    const tag = m[1].toLowerCase();
    const rawAttrs = m[2];
    const attrs = attrsToObject(rawAttrs);

    if (rawAttrs.includes('display="none"') || rawAttrs.includes("display:none")) continue;

    const cls = (attrs["class"] || "").toLowerCase();
    let group = apertureGroupFromClass(cls);

    // Si no tiene clase, intentar fallback legacy (data-kind o fill)
    if (!group) {
      const dataKind = dataAttr(attrs, "data-kind")?.toLowerCase();
      const fill = (attrs["fill"] || "").toLowerCase();
      if (dataKind === "door" || dataKind === "puerta") group = "door";
      else if (dataKind === "window" || dataKind === "ventana") group = "window";
      else if (fill === "#ffffff" || fill === "#fff" || fill === "white") group = "door";
      else if (fill === "#cce4ff" || fill === "#b8d8f0") group = "window";
      else continue; // No es una apertura, ignorar
    }

    // Extraer coordenadas
    let x: number, y: number, w: number, h: number;
    if (tag === "rect") {
      x = parseNumber(attrs["x"] || "0");
      y = parseNumber(attrs["y"] || "0");
      w = parseNumber(attrs["width"] || "0");
      h = parseNumber(attrs["height"] || "0");
    } else {
      // <line>: x1,y1 a x2,y2
      const x1 = parseNumber(attrs["x1"] || "0");
      const y1 = parseNumber(attrs["y1"] || "0");
      const x2 = parseNumber(attrs["x2"] || "0");
      const y2 = parseNumber(attrs["y2"] || "0");
      x = Math.min(x1, x2);
      y = Math.min(y1, y2);
      w = Math.abs(x2 - x1);
      h = Math.abs(y2 - y1);
    }
    if (w === 0 || h === 0) continue;

    // Para huecos genericos, decidir por aspect ratio (legacy)
    if (group === "hole" && cls.includes("hueco")) {
      group = h / w > 1.5 ? "door" : "window";
    }

    // Generar id si no hay
    const dataId = dataAttr(attrs, "data-id");
    let id: string;
    if (dataId) {
      id = dataId;
      usedIds.add(id);
    } else {
      const prefix = group;
      const idx = group === "door" ? ++doorIdx : group === "window" ? ++winIdx : ++holeIdx;
      id = genId(prefix, usedIds, idx);
    }

    apertures.push({
      id,
      name: dataAttr(attrs, "data-name"),
      group,
      room: dataAttr(attrs, "data-room"),
      parentWallId: dataAttr(attrs, "data-wall-id") || wallId,
      xCm: x,
      widthCm: w,
      yCm: y,
      heightCm: h,
      colorCaraA: dataAttr(attrs, "data-color-cara-a") || attrs["fill"] || null,
      colorCaraB: dataAttr(attrs, "data-color-cara-b"),
      colorCaraC: dataAttr(attrs, "data-color-cara-c"),
      textureCaraA: dataAttr(attrs, "data-texture-cara-a"),
      textureCaraB: dataAttr(attrs, "data-texture-cara-b"),
      textureCaraC: dataAttr(attrs, "data-texture-cara-c"),
    });
  }

  return { wallId, wallWidthCm, widthCm, heightCm, viewBox, apertures };
}

// =============================================================================
// API LEGACY: parseElevation (mantener para no romper el servidor v0.5.0)
// =============================================================================

export function parseElevation(svg: string): ElevationMeta {
  const elements = parseElevationElements(svg);
  return {
    wall: elements.wallId,
    wallWidthCm: elements.wallWidthCm,
    widthCm: elements.widthCm,
    heightCm: elements.heightCm,
    apertures: elements.apertures.map(a => ({
      kind: a.group === "window" ? "window" : "door",
      xCm: a.xCm,
      widthCm: a.widthCm,
      yCm: a.yCm,
      heightCm: a.heightCm,
    })),
  };
}

/** Lee un archivo y devuelve la meta del alzado (legacy). */
export async function parseElevationFile(path: string): Promise<ElevationMeta> {
  const svg = await fs.readFile(path, "utf-8");
  return parseElevation(svg);
}
