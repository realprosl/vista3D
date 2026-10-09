/**
 * Convierte un SVG (string) en una lista de elementos 2D con metadatos.
 *
 * Cada elemento tiene:
 *   - Geometria (contorno 2D con sus puntos)
 *   - Metadata: id, name, group, room, colors, textures, wallId
 *
 * Los atributos del SVG se leen en kebab-case (data-id, data-name,
 * data-group, data-room, data-color-exterior, data-color-interior,
 * data-color-extrusion, data-texture-exterior, data-texture-interior,
 * data-texture-extrusion, data-wall-id).
 *
 * Soporta elementos con clase:
 *   - .pared / .wall / .muro  (muros/paredes)         -> "wall"
 *   - .suelo / .floor         (el suelo, una sola)     -> "floor"
 *   - .puerta / .door         (apertura tipo puerta)   -> "door"
 *   - .ventana / .window      (apertura tipo ventana)  -> "window"
 *   - .hueco / .hole          (apertura generica)      -> "hole"
 *   - .mueble / .furniture /
 *     .silla / .mesa / .sofa /
 *     .cama / .armario        (mobiliario)             -> "furniture"
 *   - .etiqueta / .label /
 *     .texto                  (etiquetas de texto)     -> "label"
 *   - .cota / .dimension /
 *     .medida                 (cotas con medidas)      -> "dimension"
 *
 * Los elementos con clase .cota, .etiqueta, .mueble, etc. NO se
 * renderizan en 3D (las cotas y etiquetas son medidas; los muebles
 * simples no tienen extrusion 3D por ahora). Se devuelven en `extras`
 * para que el viewer los pueda usar como overlay o referencia.
 *
 * Formas geometricas soportadas:
 *   - <polygon points="x1,y1 x2,y2 ..." />
 *   - <path d="M x y L x y L x y Z" />     (solo M + L + H + V + Z)
 *   - <rect x y width height />
 *   - <line x1 y1 x2 y2 />                 (convertido a 2 puntos)
 *
 * Si el SVG no es parseable, lanza un Error con mensaje en espanol.
 *
 * Salida:
 *   {
 *     viewBox: { width, height },
 *     suelo: ElementSvg | null,
 *     paredes: ElementSvg[],
 *     aperturas: ElementSvg[]
 *   }
 */

export interface Point2D {
  x: number;
  y: number;
}

export type Contour = Point2D[];

export type GroupKind = "wall" | "floor" | "door" | "window" | "hole" | "furniture" | "label" | "dimension" | "other";

export interface ElementSvg {
  /** Identificador unico del elemento. Si el SVG tiene data-id, ese; si no, autogenerado. */
  id: string;
  /** Nombre legible del elemento (opcional, del data-name). */
  name: string | null;
  /** Tipo de elemento: pared, suelo, puerta, ventana, hueco, mueble, etiqueta, cota, etc. */
  group: GroupKind;
  /** Habitacion a la que pertenece (opcional, del data-room). */
  room: string | null;
  /** ID de la pared padre (para aperturas: la pared en la que estan). */
  wallId: string | null;
  /** Contorno geometrico (lista de puntos 2D). */
  contour: Contour;
  /** Color exterior (#rrggbb o #rgb). Null si no esta definido. */
  colorExterior: string | null;
  colorInterior: string | null;
  colorExtrusion: string | null;
  /** Textura (liso, madera, baldosa, ladrillo, marmol, piedra). Null si no esta. */
  textureExterior: string | null;
  textureInterior: string | null;
  textureExtrusion: string | null;
  /** Texto de la cota/etiqueta (solo si group = dimension o label). */
  text: string | null;
}

export interface SvgElementsResult {
  viewBox: { width: number; height: number };
  suelo: ElementSvg | null;
  paredes: ElementSvg[];
  aperturas: ElementSvg[];
  /** Elementos auxiliares que no se renderizan en 3D pero pueden
   *  mostrar informacion: cotas, etiquetas, muebles sin textura 3D, etc. */
  extras: ElementSvg[];
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

/** Parsea tokens de un path SVG (M, L, H, V, Z, m, l, h, v, z). */
function parsePathData(d: string): Contour[] {
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

function parsePoints(points: string): Contour {
  const coords = points.trim().split(/[\s,]+/).map(parseFloat);
  const out: Contour = [];
  for (let i = 0; i < coords.length; i += 2) {
    out.push({ x: coords[i], y: coords[i + 1] });
  }
  return out;
}

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
    { x, y },
  ];
}

function parseLine(attrs: Record<string, string>): Contour {
  const x1 = parseFloat(attrs.x1 || "0");
  const y1 = parseFloat(attrs.y1 || "0");
  const x2 = parseFloat(attrs.x2 || "0");
  const y2 = parseFloat(attrs.y2 || "0");
  return [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y1 }];
}

/** Genera un id unico para elementos sin data-id. */
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

/** Determina el group por la clase CSS del elemento.
 *  Clases reconocidas:
 *    .pared / .wall / .muro            -> wall
 *    .suelo / .floor                   -> floor
 *    .puerta / .door                   -> door
 *    .ventana / .window                -> window
 *    .hueco / .hole                    -> hole
 *    .mueble / .furniture / .silla /
 *      .mesa / .sofa / .cama / .armario -> furniture
 *    .etiqueta / .label / .texto      -> label
 *    .cota / .dimension / .medida     -> dimension
 *  Tambien funciona con data-group="..." en kebab-case.
 */
function groupFromClass(cls: string): GroupKind {
  const tokens = cls.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.some(t => t === "pared" || t === "wall" || t === "muro")) return "wall";
  if (tokens.some(t => t === "suelo" || t === "floor")) return "floor";
  if (tokens.some(t => t === "puerta" || t === "door")) return "door";
  if (tokens.some(t => t === "ventana" || t === "window")) return "window";
  if (tokens.some(t => t === "hueco" || t === "hole")) return "hole";
  if (tokens.some(t =>
    t === "mueble" || t === "furniture" || t === "silla" || t === "mesa" ||
    t === "sofa" || t === "sofa" || t === "cama" || t === "armario")) return "furniture";
  if (tokens.some(t => t === "etiqueta" || t === "label" || t === "texto")) return "label";
  if (tokens.some(t => t === "cota" || t === "dimension" || t === "medida")) return "dimension";
  return "other";
}

/**
 * Parsea un SVG y devuelve TODOS los elementos con sus metadatos.
 */
export function parseSvgElements(svg: string): SvgElementsResult {
  // viewBox
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

  const result: SvgElementsResult = {
    viewBox,
    suelo: null,
    paredes: [],
    aperturas: [],
    extras: [],
  };

  const usedIds = new Set<string>();
  let wallIdx = 0, doorIdx = 0, winIdx = 0, holeIdx = 0, floorIdx = 0, furnitureIdx = 0, labelIdx = 0, dimIdx = 0, otherIdx = 0;

  // Recorrer todos los elementos geometricos del SVG (y los <text>).
  // Estrategia: encontrar cada apertura de tag <line/rect/polygon/path/text
  // y leer hasta su cierre. Para self-closing, el cierre es />. Para
  // <text>, el cierre es </text>. Usamos un loop con lastIndex.
  const tagPattern = /<(line|rect|polygon|path|text)\b([^>]*?)(\/?)>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagPattern.exec(svg)) !== null) {
    const tag = tagMatch[1].toLowerCase();
    const rawAttrs = tagMatch[2];
    const isSelfClosing = tagMatch[3] === "/";
    const tagStart = tagMatch.index;
    const contentStart = tagPattern.lastIndex;

    let rawInner = "";
    if (!isSelfClosing && tag === "text") {
      // Leer hasta </text>
      const closeIdx = svg.indexOf("</text>", contentStart);
      if (closeIdx === -1) continue;
      rawInner = svg.slice(contentStart, closeIdx);
      tagPattern.lastIndex = closeIdx + "</text>".length;
    } else {
      // Self-closing: no hay contenido. Para tags como <line ... /> o
      // <line ...> sin cerrar, el lastIndex ya esta al final del tag.
    }

    const attrs = attrsToObject(rawAttrs);

    if (rawAttrs.includes('display="none"') || rawAttrs.includes("display:none")) continue;

    const cls = (attrs["class"] || "").toLowerCase();
    const group = groupFromClass(cls);
    // "other" son elementos sin clase reconocida: se ignoran completamente
    // (puede ser fondo, decoracion SVG, etc.)
    if (group === "other") continue;

    let contour: Contour;
    if (tag === "line") {
      contour = parseLine(attrs);
    } else if (tag === "rect") {
      contour = parseRect(attrs);
    } else if (tag === "polygon") {
      if (!attrs.points) continue;
      contour = parsePoints(attrs.points);
    } else if (tag === "path") {
      if (!attrs.d) continue;
      const conts = parsePathData(attrs.d);
      if (conts.length === 0) continue;
      contour = conts[0];
    } else {
      continue;
    }
    if (contour.length < 2) continue;

    const dataId = dataAttr(attrs, "data-id");
    const dataName = dataAttr(attrs, "data-name");
    const dataGroup = dataAttr(attrs, "data-group");
    const dataRoom = dataAttr(attrs, "data-room");
    const dataWallId = dataAttr(attrs, "data-wall-id");

    let id: string;
    if (dataId) {
      id = dataId;
      usedIds.add(id);
    } else {
      const prefix = (dataGroup || group).toLowerCase();
      const idx =
        group === "wall" ? ++wallIdx :
        group === "floor" ? ++floorIdx :
        group === "door" ? ++doorIdx :
        group === "window" ? ++winIdx :
        group === "hole" ? ++holeIdx :
        group === "furniture" ? ++furnitureIdx :
        group === "label" ? ++labelIdx :
        group === "dimension" ? ++dimIdx :
        ++otherIdx;
      id = genId(prefix, usedIds, idx);
    }

    const finalGroup: GroupKind = dataGroup
      ? (dataGroup.toLowerCase() as GroupKind)
      : group;

    // Para etiquetas y cotas, leer el texto si lo tienen (como atributo
    // data-text o como texto dentro del elemento <text> en una version
    // futura). Por ahora, cualquier data-* tipo text-*.
    let text: string | null = null;
    if (finalGroup === "label" || finalGroup === "dimension") {
      text = dataAttr(attrs, "data-text") || dataAttr(attrs, "data-value");
    }

    const elem: ElementSvg = {
      id,
      name: dataName,
      group: finalGroup,
      room: dataRoom,
      wallId: dataWallId,
      contour,
      colorExterior: dataAttr(attrs, "data-color-exterior") || attrs["fill"] || null,
      colorInterior: dataAttr(attrs, "data-color-interior") || null,
      colorExtrusion: dataAttr(attrs, "data-color-extrusion") || null,
      textureExterior: dataAttr(attrs, "data-texture-exterior"),
      textureInterior: dataAttr(attrs, "data-texture-interior"),
      textureExtrusion: dataAttr(attrs, "data-texture-extrusion"),
      text,
    };

    if (finalGroup === "floor") {
      result.suelo = elem;
    } else if (finalGroup === "wall") {
      result.paredes.push(elem);
    } else if (finalGroup === "door" || finalGroup === "window" || finalGroup === "hole") {
      result.aperturas.push(elem);
    } else {
      // furniture / label / dimension (y any other en un futuro) van a extras
      result.extras.push(elem);
    }
  }

  return result;
}

// =============================================================================
// API LEGACY (mantener compatibilidad con el visor v0.5.0)
// =============================================================================

export interface SvgParseResult {
  contours: Contour[];
  viewBox: { width: number; height: number };
}

/** API legacy: devuelve el primer contorno y el viewBox. Usada por el
 *  server actual para validar la planta. La firma se mantiene para no
 *  romper el codigo existente. */
export function parseSvg(svg: string): SvgParseResult {
  const elements = parseSvgElements(svg);
  const contours: Contour[] = [];
  if (elements.suelo) contours.push(elements.suelo.contour);
  for (const p of elements.paredes) contours.push(p.contour);
  return { contours, viewBox: elements.viewBox };
}

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
