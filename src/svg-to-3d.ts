/**
 * Convierte un SVG (string) en una lista de contornos 2D que
 * Three.js puede usar con ExtrudeGeometry.
 *
 * Soporta:
 *   - <polygon points="x1,y1 x2,y2 ..." />
 *   - <path d="M x y L x y L x y Z" />     (solo M + L + Z, suficiente v1)
 *   - <rect x y width height />             (convertido a 4 puntos)
 *
 * NO soporta (todavia):
 *   - Bezier curves (Q, C, S, T, A)
 *   - Multiples subpaths con holes
 *   - Grupos con transformaciones
 *
 * Si el SVG no es parseable, lanza un Error con mensaje en espanol.
 */

export interface Point2D {
  x: number;
  y: number;
}

export type Contour = Point2D[];

export interface SvgParseResult {
  contours: Contour[]; // El primer contorno es el principal; los demas son holes.
  viewBox: { width: number; height: number };
}

/** Parsea tokens de un path SVG (M, L, H, V, Z, m, l, h, v, z). */
function parsePathData(d: string): Contour[] {
  // Normalizar: comas y espacios, separar comandos de numeros.
  const tokens: (string | number)[] = [];
  const re = /([MLHVZmlhvz])|(-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;
  let lastCmd: string | null = null;
  while ((match = re.exec(d)) !== null) {
    if (match[1]) {
      tokens.push(match[1]);
      lastCmd = match[1];
    } else if (match[2]) {
      tokens.push(parseFloat(match[2]));
      // Para m/l minusculas tras el primero, tratamos como M/L.
      if (lastCmd === "m") lastCmd = "M";
      else if (lastCmd === "l") lastCmd = "L";
    }
  }

  const contours: Contour[] = [];
  let current: Contour = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (typeof tok === "string") {
      const cmd = tok;
      if (cmd === "M" || cmd === "L") {
        const x = tokens[++i] as number;
        const y = tokens[++i] as number;
        if (cmd === "M") {
          if (current.length > 0) contours.push(current);
          current = [{ x, y }];
          startX = x;
          startY = y;
        } else {
          current.push({ x, y });
        }
        cx = x;
        cy = y;
      } else if (cmd === "H") {
        const x = tokens[++i] as number;
        current.push({ x, y: cy });
        cx = x;
      } else if (cmd === "V") {
        const y = tokens[++i] as number;
        current.push({ x: cx, y });
        cy = y;
      } else if (cmd === "Z" || cmd === "z") {
        if (current.length > 0) {
          // Cerrar si el ultimo punto no coincide con el primero.
          const first = current[0];
          const last = current[current.length - 1];
          if (first.x !== last.x || first.y !== last.y) {
            current.push({ x: first.x, y: first.y });
          }
          contours.push(current);
        }
        current = [];
        cx = startX;
        cy = startY;
      }
    }
  }
  if (current.length > 0) contours.push(current);
  return contours;
}

/** Parsea el atributo points de un <polygon>. */
function parsePoints(points: string): Contour {
  const coords = points.trim().split(/[\s,]+/).map(parseFloat);
  const out: Contour = [];
  for (let i = 0; i < coords.length; i += 2) {
    out.push({ x: coords[i], y: coords[i + 1] });
  }
  return out;
}

/** Parsea un <rect> a un poligono de 4 puntos. */
function parseRect(attrs: Record<string, string>): Contour {
  const x = parseFloat(attrs.x || "0");
  const y = parseFloat(attrs.y || "0");
  const w = parseFloat(attrs.width || "0");
  const h = parseFloat(attrs.height || "0");
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y }, // cerrar
  ];
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

/**
 * Parsea un SVG y devuelve los contornos.
 * Estrategia: encuentra el primer <path> o <polygon> y extrae su contorno.
 * Si hay multiples, los adicionales se tratan como holes (no implementado v1).
 */
export function parseSvg(svg: string): SvgParseResult {
  // Extraer viewBox si existe, si no usar width/height.
  const viewBoxMatch = svg.match(/viewBox\s*=\s*"([^"]*)"/);
  let viewBox = { width: 0, height: 0 };
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(parseFloat);
    viewBox = { width: parts[2], height: parts[3] };
  } else {
    const wMatch = svg.match(/<svg[^>]*\swidth\s*=\s*"([^"]*)"/);
    const hMatch = svg.match(/<svg[^>]*\sheight\s*=\s*"([^"]*)"/);
    if (wMatch && hMatch) {
      viewBox.width = parseFloat(wMatch[1]);
      viewBox.height = parseFloat(hMatch[1]);
    }
  }

  // Buscar el primer <path>, <polygon>, o <rect>.
  const pathMatch = svg.match(/<path\b([^>]*)\/?>/);
  const polyMatch = svg.match(/<polygon\b([^>]*)\/?>/);
  const rectMatch = svg.match(/<rect\b([^>]*)\/?>/);

  let contours: Contour[] = [];
  if (pathMatch) {
    const attrs = attrsToObject(pathMatch[1]);
    if (!attrs.d) throw new Error("El <path> del SVG no tiene atributo d");
    contours = parsePathData(attrs.d);
  } else if (polyMatch) {
    const attrs = attrsToObject(polyMatch[1]);
    if (!attrs.points) throw new Error("El <polygon> del SVG no tiene atributo points");
    contours = [parsePoints(attrs.points)];
  } else if (rectMatch) {
    const attrs = attrsToObject(rectMatch[1]);
    contours = [parseRect(attrs)];
  } else {
    throw new Error(
      "El SVG no contiene <path>, <polygon> ni <rect>. v1 solo soporta esos 3 tipos.",
    );
  }

  if (contours.length === 0) {
    throw new Error("No se pudo extraer ningun contorno del SVG");
  }

  return { contours, viewBox };
}

/**
 * Calcula la bounding box 2D de un contorno.
 * Util para mostrar info al usuario.
 */
export function contourBounds(contour: Contour): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of contour) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
