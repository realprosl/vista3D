/**
 * Visor 3D v0.4.0b: renderiza aperturas (puertas y ventanas) en las
 * paredes exteriores a partir de los alzados del proyecto.
 *
 * - Detecta si la URL apunta a un proyecto (/v/<uuid>) y carga
 *   /api/projects/:id/alzados-meta. Si no, fallback a /api/svg/:id.
 * - Identifica las 4 paredes exteriores (Norte, Sur, Este, Oeste)
 *   del bounding box rectangular del contorno.
 * - Empareja cada alzado con su pared por data-wall + data-wall-width.
 * - Renderiza aperturas subdividiendo la pared en N+1 segmentos
 *   con un hueco entre los rangos X declarados en el alzado.
 *
 * Cambios v0.3.0:
 *  - El contorno principal ya no se extruye como caja solida; se
 *    renderiza como un suelo fino (grosor sueloCm, ~5cm).
 *  - Las paredes exteriores (los 4 lados del contorno) se dibujan
 *    como planos verticales.
 *  - Las paredes interiores (definidas como <line> en el SVG, o como
 *    sub-paths M..L en el <path> principal) tambien se dibujan como
 *    planos verticales.
 *  - El grosor por defecto es grosorCm = 8 (cm). Se puede cambiar
 *    con el query ?grosorCm=12.
 */
import * as THREE from "three";
// Exponemos THREE en window para que modulos hermanos (textures.js)
// que no hacen import puedan acceder via window.THREE.
window.THREE = THREE;
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// textures.js NO importa THREE (lo coge de window) para evitar el bug
// "Identifier 'THREE' has already been declared" en Chrome.
import { getTexture, listTextures } from "./textures.js";

// --- Estado ----------------------------------------------------------------
const id = location.pathname.split("/").pop(); // /v/<id>
const params = new URLSearchParams(location.search);
let alturaCm = 250;
let grosorCm = 8; // grosor por defecto de cada pared
let sueloCm = 5;  // grosor del suelo
if (params.has("alturaCm")) {
  const v = parseFloat(params.get("alturaCm") || "250");
  if (!isNaN(v) && v > 0) alturaCm = v;
}
if (params.has("grosorCm")) {
  const v = parseFloat(params.get("grosorCm") || "8");
  if (!isNaN(v) && v > 0 && v < 200) grosorCm = v;
}

const errorEl = document.getElementById("error");
const errMsg = document.getElementById("err-msg");
const dimsEl = document.getElementById("dims");

function showError(msg) {
  errorEl.style.display = "block";
  errMsg.textContent = msg;
}

// --- 1) Detectar si es un proyecto y cargar SVG + alzados ------------------
// Si la URL apunta a un proyecto, cargamos planta y alzados. Si no, fallback.
let svgText;
let alzadosMeta = []; // Array<{name, meta}> del proyecto
let isProject = false;
let elementsData = null; // Datos completos con metadatos data-* (v0.6.0)
try {
  // Probamos primero como proyecto: GET /api/projects/:id
  const metaRes = await fetch(`/api/projects/${id}`);
  if (metaRes.ok) {
    isProject = true;
    const [plantaRes, alzadosRes, elementsRes] = await Promise.all([
      fetch(`/api/projects/${id}/planta`),
      fetch(`/api/projects/${id}/alzados-meta`),
      // Nuevo endpoint v0.6.0: devuelve todos los elementos con metadatos
      // data-* (nombres, habitaciones, colores del SVG, vinculacion
      // planta <-> alzados). Si el SVG es legacy (sin data-*), el
      // endpoint sigue devolviendo datos con ids autogeneradas.
      fetch(`/api/projects/${id}/elements`),
    ]);
    if (!plantaRes.ok) throw new Error(`No se pudo cargar la planta (HTTP ${plantaRes.status})`);
    svgText = await plantaRes.text();
    if (alzadosRes.ok) {
      const data = await alzadosRes.json();
      alzadosMeta = data.alzados || [];
    }
    if (elementsRes.ok) {
      elementsData = await elementsRes.json();
    }
  } else {
    // Fallback legacy: /api/svg/:id
    const res = await fetch(`/api/svg/${id}`);
    if (!res.ok) throw new Error(`No se pudo cargar el SVG (HTTP ${res.status})`);
    svgText = await res.text();
  }
} catch (err) {
  showError(err.message);
  throw err;
}

// --- 2) Parsear SVG --------------------------------------------------------
//   - Contorno principal: del primer <path> M..L..Z (solo el primer sub-path).
//   - Paredes interiores: de los sub-paths M..L RESTANTES del primer <path>
//     o de cualquier <line> del SVG.
//   - Ademas, las paredes exteriores (los lados del contorno) se generan
//     a partir del contorno mismo.
const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
const svgEl = doc.documentElement;

// Helpers robustos para SVG (los selectores [class~="..."] no son 100%
// fiables en todos los navegadores cuando el documento es SVG).
function hasClass(el, cls) {
  if (!el || !el.getAttribute) return false;
  const c = (el.getAttribute("class") || "").split(/\s+/);
  return c.includes(cls);
}
function findByClass(cls) {
  return Array.from(svgEl.querySelectorAll("*")).filter(el => hasClass(el, cls));
}
function findFirstByClass(cls) {
  return findByClass(cls)[0] || null;
}

// Elementos con clase semantica (v0.5.0). Si el SVG no las usa, fallback
// a la primera forma disponible (compatibilidad con SVGs antiguos).
const sueloEl = findFirstByClass("suelo")
  || svgEl.querySelector("path")
  || svgEl.querySelector("polygon")
  || svgEl.querySelector("rect");
const paredEls = findByClass("pared");

// Si no hay paredes con clase, fallback a <line> como paredes.
const lineEls = paredEls.length > 0 ? [] : Array.from(svgEl.querySelectorAll("line"));
const wallLineEls = paredEls.length > 0 ? [] : lineEls;

let mainContour = [];
let interiorSegments = [];

if (sueloEl) {
  const tag = sueloEl.tagName.toLowerCase();
  if (tag === "path") {
    const allContours = parsePathDAll(sueloEl.getAttribute("d") || "");
    if (allContours.length === 0) {
      showError("El <path> no contiene puntos.");
      throw new Error("empty path");
    }
    mainContour = allContours[0];
    for (let i = 1; i < allContours.length; i++) {
      const c = allContours[i];
      if (c.length === 2) {
        interiorSegments.push(c);
      } else if (c.length > 2) {
        for (let j = 0; j < c.length - 1; j++) {
          interiorSegments.push([c[j], c[j + 1]]);
        }
      }
    }
  } else if (tag === "polygon") {
    mainContour = parsePoints(sueloEl.getAttribute("points") || "");
  } else if (tag === "rect") {
    mainContour = parseRect(sueloEl);
  }
} else {
  showError("El SVG no contiene <path>, <polygon> ni <rect>.");
  throw new Error("no shape");
}

// Paredes interiores adicionales desde <line>.
for (const line of lineEls) {
  const x1 = parseFloat(line.getAttribute("x1") || "0");
  const y1 = parseFloat(line.getAttribute("y1") || "0");
  const x2 = parseFloat(line.getAttribute("x2") || "0");
  const y2 = parseFloat(line.getAttribute("y2") || "0");
  interiorSegments.push([[x1, y1], [x2, y2]]);
}

if (mainContour.length < 3) {
  showError("El contorno del SVG tiene menos de 3 puntos. No se puede construir.");
  throw new Error("too few points");
}

// --- 3) Bounds del contorno ------------------------------------------------
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const [x, y] of mainContour) {
  if (x < minX) minX = x; if (y < minY) minY = y;
  if (x > maxX) maxX = x; if (y > maxY) maxY = y;
}
const widthCm = Math.round(maxX - minX);
const heightCm = Math.round(maxY - minY);
dimsEl.innerHTML = `Plano: <strong>${widthCm}</strong> x <strong>${heightCm}</strong> cm
  (altura: <strong>${alturaCm}</strong> cm, grosor: <strong>${grosorCm}</strong> cm)`;

// --- 4) Three.js setup -----------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef2f7);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 50000);
const maxDim = Math.max(widthCm, heightCm, alturaCm);
camera.position.set(maxDim * 1.4, maxDim * 1.0, maxDim * 1.4);
camera.lookAt(widthCm / 2, alturaCm / 2, heightCm / 2);

// Intentar crear el WebGLRenderer con fallbacks. En algunos navegadores
// (Safari iOS con modo low-power, navegadores sin GPU) el primer intento
// falla. Vamos probando con menos features hasta que funcione.
function createRenderer() {
  const attempts = [
    { antialias: true, powerPreference: "high-performance" },
    { antialias: true },
    { antialias: false },
    {}, // ultimo intento, sin opciones
  ];
  for (const opts of attempts) {
    try {
      const r = new THREE.WebGLRenderer(opts);
      // Comprobar que el contexto es real (no solo el objeto).
      const ctx = r.getContext();
      if (ctx && ctx instanceof WebGLRenderingContext || ctx instanceof WebGL2RenderingContext) {
        return r;
      }
      // Si el contexto no es WebGL, descartar.
      const lose = r.getContext().getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch (e) {
      // Continuar con el siguiente intento.
    }
  }
  return null;
}

let renderer = createRenderer();
if (!renderer) {
  // No se pudo crear WebGL. Mostramos mensaje visible.
  const errorEl = document.getElementById("error");
  const errMsg = document.getElementById("err-msg");
  if (errorEl) errorEl.style.display = "block";
  if (errMsg) {
    errMsg.innerHTML = "Tu navegador no soporta WebGL o esta deshabilitado.<br><br>" +
      "Prueba a:<br>" +
      "- Abrir esta misma URL en Chrome (PC o movil).<br>" +
      "- Activar la aceleracion por hardware en ajustes del navegador.<br>" +
      "- Cerrar otras pestañas para liberar memoria.<br>" +
      "- En iPhone: Ajustes > Safari > Avanzado > asegurate de que WebGL esta activo.";
  }
  throw new Error("WebGL no disponible");
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
// Adjuntar el canvas al contenedor #stage (no a body, para que el sidebar
// pueda taparlo en pantallas pequenas).
const stageEl = document.getElementById("stage") || document.body;
stageEl.appendChild(renderer.domElement);

// Luces
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(maxDim, maxDim * 2, maxDim);
dirLight.castShadow = true;
scene.add(dirLight);

// Suelo exterior (para ver la sombra del plano)
const groundSize = maxDim * 3;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(widthCm / 2, -1, heightCm / 2);
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(groundSize, 40, 0x999, 0xccc);
grid.position.set(widthCm / 2, 0, heightCm / 2);
scene.add(grid);

// Ejes
const axes = new THREE.AxesHelper(maxDim * 0.3);
axes.position.set(0, 1, 0);
scene.add(axes);

// --- 5) Construir suelo (plano fino) ---------------------------------------
// Centramos el contorno en (0,0) y mapeamos SVG y -> z.
const cx = (minX + maxX) / 2;
const cz = (minY + maxY) / 2;
const translate = ([x, y]) => [x - cx, y - cz];
const mainLocal = mainContour.map(translate);

// Bounding box de las paredes en coords LOCALES (post-translate).
let localMinX = Infinity, localMinY = Infinity, localMaxX = -Infinity, localMaxY = -Infinity;
for (const p of mainLocal) {
  if (p[0] < localMinX) localMinX = p[0];
  if (p[0] > localMaxX) localMaxX = p[0];
  if (p[1] < localMinY) localMinY = p[1];
  if (p[1] > localMaxY) localMaxY = p[1];
}

const sueloShape = new THREE.Shape();
sueloShape.moveTo(mainLocal[0][0], mainLocal[0][1]);
for (let i = 1; i < mainLocal.length; i++) {
  sueloShape.lineTo(mainLocal[i][0], mainLocal[i][1]);
}
sueloShape.closePath();

const sueloGeom = new THREE.ExtrudeGeometry(sueloShape, {
  depth: sueloCm,
  bevelEnabled: false,
});
sueloGeom.rotateX(-Math.PI / 2);
// sueloMat / paredMat / cristalMat se declaran con "let" aqui y se
// reasignan mas abajo (seccion 5b). Por eso la creacion del suelo se
// hace DESPUES, una vez que sueloMat ya tiene su material asignado.
let sueloMat, sueloDebajoMat, paredMat, paredExtMat, paredIntMat, cristalMat, puertaMat, huecoMat;

// --- 6) Construir paredes --------------------------------------------------
// Cada pared es un BoxGeometry orientado a lo largo de un segmento 2D.
//   Largo = distancia entre (p1, p2) en cm.
//   Alto  = alturaCm.
//   Ancho = grosorCm (perpendicular al segmento).
// Las paredes exteriores (los 4 lados del contorno) se meten en un Group
// aparte para poder ocultarlas con el toggle del visor.
// --- 5b) Materiales configurables (color + textura) -----------------------
// Cada capa (suelo, pared, cristal) tiene un color base y una textura
// procedural. Los valores por defecto se pueden sobreescribir desde:
//   - Atributos data-color / data-texture en el SVG.
//   - localStorage["vista3d-materials"] = JSON.
//   - Query string ?sueloColor=...&paredTexture=... (cualquier propiedad).
// (getTexture y listTextures se importan arriba del archivo, no aqui.)

const STORAGE_KEY = "vista3d-materials";
const DEFAULTS = {
  suelo:   { color: 0xc4a988, texture: "liso",     roughness: 0.85 },
  pared:   { color: 0xeee2cc, texture: "liso",     roughness: 0.9  },
  cristal: { color: 0xb8d8f0, texture: "liso",     roughness: 0.15, opacity: 0.55 },
};

function readMaterialConfig() {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS));
  // 1) localStorage (preferente)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const key of ["suelo", "pared", "cristal"]) {
        if (parsed[key]) Object.assign(cfg[key], parsed[key]);
      }
    }
  } catch {}
  // 2) Query string (override puntual)
  const q = new URLSearchParams(location.search);
  for (const key of ["suelo", "pared", "cristal"]) {
    const c = q.get(`${key}Color`);
    if (c) cfg[key].color = parseInt(c.replace("#", ""), 16);
    const t = q.get(`${key}Texture`);
    if (t) cfg[key].texture = t;
  }
  return cfg;
}

function makeMaterial(cfg) {
  // Cuando hay textura, el color del material se pone a blanco (#ffffff)
  // para NO tintar la textura. La textura ya esta pintada con el color
  // base que eligio el usuario (paintMadera(color), paintLadrillo(color), ...).
  // Si el material tuviera color, multiplicaria la textura y la oscureceria.
  const hasTexture = cfg.texture && cfg.texture !== "liso";
  const mat = new THREE.MeshStandardMaterial({
    color: hasTexture ? 0xffffff : cfg.color,
    roughness: cfg.roughness ?? 0.8,
  });
  if (hasTexture) {
    mat.map = getTexture(cfg.texture, cfg.color);
    // Importante: marcar el material para que Three.js actualice los
    // uniforms (incluido el map) en la siguiente frame.
    mat.needsUpdate = true;
  }
  if (cfg.opacity != null) {
    mat.transparent = true;
    mat.opacity = cfg.opacity;
  }
  return mat;
}

const matCfg = readMaterialConfig();
// sueloMat, paredMat, cristalMat se reasignan aqui (fueron declarados
// con "let" antes de la creacion del suelo para evitar TDZ).
sueloMat = makeMaterial({ color: hexToInt(matCfg.suelo.color), texture: matCfg.suelo.texture, roughness: 0.85 });
// Cara inferior del suelo: solo se ve al girar la camara por debajo. Por
// defecto usa el mismo material; el panel de materiales la sobreescribe
// luego con applyMPToMesh("suelo-debajo", ...).
sueloDebajoMat = makeMaterial({ color: hexToInt(matCfg.suelo.color), texture: matCfg.suelo.texture, roughness: 0.85 });
// Fachada (exterior) y pintura (interior) de la pared: array de 2 materiales.
paredExtMat = makeMaterial({ color: hexToInt(matCfg.pared.color), texture: matCfg.pared.texture, roughness: 0.9 });
paredIntMat = makeMaterial({ color: hexToInt(matCfg.pared.color), texture: matCfg.pared.texture, roughness: 0.9 });
paredMat = paredExtMat; // alias para compatibilidad con codigo legacy
cristalMat = makeMaterial({ color: hexToInt(matCfg.cristal.color), texture: matCfg.cristal.texture, roughness: 0.15, opacity: 0.55 });
puertaMat = makeMaterial({ color: 0x5a3a20, texture: "madera", roughness: 0.7 });
huecoMat = makeMaterial({ color: 0x1a1a1a, texture: "liso", roughness: 0.95, side: THREE.DoubleSide });

// --- 5c) Construir el suelo (ahora que sueloMat ya tiene valor) ------------
// Materiales por cara: el ExtrudeGeometry genera caras arriba (indice 0)
// y abajo (indice 1) mas caras laterales. Asignamos un array de materiales
// para que cada cara se pueda personalizar. La cara inferior (sueloDebajoMat)
// se puede editar desde el panel de materiales.
const suelo = new THREE.Mesh(sueloGeom, [sueloMat, sueloDebajoMat, sueloDebajoMat]);
tagMesh(suelo, "suelo", "suelo-debajo");
suelo.position.set(widthCm / 2, 0, heightCm / 2);
suelo.castShadow = true;
suelo.receiveShadow = true;
scene.add(suelo);

// Paredes exteriores: cada lado del contorno.
const exteriorWalls = [];
for (let i = 0; i < mainLocal.length - 1; i++) {
  exteriorWalls.push([mainLocal[i], mainLocal[i + 1]]);
}
// Quitar el ultimo si es duplicado del primero (cierre).
if (
  exteriorWalls.length > 1 &&
  exteriorWalls[exteriorWalls.length - 1][0][0] === exteriorWalls[0][0][0] &&
  exteriorWalls[exteriorWalls.length - 1][0][1] === exteriorWalls[0][0][1]
) {
  exteriorWalls.pop();
}

// Paredes interiores.
const interiorWalls = interiorSegments.map(seg => {
  const a = translate(seg[0]);
  const b = translate(seg[1]);
  return [a, b];
});

function buildWallMesh([x1, z1], [x2, z2], apertures = []) {
  // Construye una pared 3D entre (x1,z1) y (x2,z2). Si hay aperturas
  // (huecos rectangulares), la pared se extruye con esos huecos como
  // "holes" del Shape 2D: asi el hueco esta VACIO y se ve desde
  // cualquier lado, no solo desde una cara.
  //
  // Cada apertura es {xCm, widthCm, yCm, heightCm} en coords del alzado
  // (xCm desde el inicio de la pared, yCm desde el suelo).
  //
  // Devuelve un array de meshes. Actualmente siempre es 0 o 1 mesh
  // (la pared con sus huecos), pero devolvemos array para mantener
  // la API consistente con la version previa.
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1) return [];
  const angle = Math.atan2(dz, dx);
  const midX = (x1 + x2) / 2 + widthCm / 2;
  const midZ = (z1 + z2) / 2 + heightCm / 2;

  // Shape 2D: rectangulo de la pared (largo x alto), centrado en el origen
  // sobre el plano XY. El grosor va a ser la profundidad de la extrusión.
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  shape.lineTo(len / 2, 0);
  shape.lineTo(len / 2, alturaCm);
  shape.lineTo(-len / 2, alturaCm);
  shape.closePath();

  // Cada apertura se traduce a un "hole" en el shape (en coords locales
  // del shape: x desde -len/2 hasta +len/2, y desde 0 hasta alturaCm).
  for (const a of apertures) {
    const x0 = a.xCm - len / 2;
    const x1a = a.xCm + a.widthCm - len / 2;
    const y0 = a.yCm;
    const y1a = a.yCm + a.heightCm;
    if (x0 < -len / 2 || x1a > len / 2 || y0 < 0 || y1a > alturaCm) {
      // Apertura fuera de la pared: la ignoramos para no romper la extrusión.
      continue;
    }
    const hole = new THREE.Path();
    hole.moveTo(x0, y0);
    hole.lineTo(x1a, y0);
    hole.lineTo(x1a, y1a);
    hole.lineTo(x0, y1a);
    hole.closePath();
    shape.holes.push(hole);
  }

  // Extruir en el eje Z (grosor).
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: grosorCm,
    bevelEnabled: false,
  });
  // Centrar la extrusión en Z (grosor) para que la mitad quede a cada lado.
  geom.translate(0, 0, -grosorCm / 2);
  // Rotar para que el Shape (originalmente en plano XY) se situe con su
  // eje X a lo largo del segmento de la pared y su normal en el eje Y
  // original del segmento (es decir, perpendicular a la pared).
  geom.rotateY(-angle);
  // Posicionar el centro de la pared en el lugar correcto del mundo.
  geom.translate(midX, 0, midZ);

  const m = new THREE.Mesh(geom, paredMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return [m];
}

// Tag del elemento al que pertenece un mesh (suelo / pared / apertura).
// Lo usa el Raycaster del popup flotante para saber qué elemento se ha clicado.
// Cada mesh lleva un array de claves (puede pertenecer a varios keys si comparte
// material con otros elementos del mismo tipo).
function tagMesh(mesh, ...keys) {
  mesh.userData.elementKeys = (mesh.userData.elementKeys || []).concat(keys);
}

// --- 6a) Emparejar alzados con paredes -------------------------------------
// Funcion de utilidad para calcular la longitud de un segmento.
function wallLength([x1, z1], [x2, z2]) {
  return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
}
//
// Estrategia de paredes (a partir de v0.6.0):
//   - Si elementsData esta disponible (endpoint /elements), usamos las
//     paredes del parser nuevo (parseSvgElements). Cada pared tiene
//     data-id, data-name, contour (2 puntos) y aperturas vinculadas
//     por wallId.
//   - Si no, fallback al sistema legacy: 4 paredes del bounding box
//     clasificadas por orientacion como N/S/E/W.
//
// Con esto el panel de materiales muestra los nombres reales del SVG
// ("Muro sur") en vez de genericos ("PARED SUR"), y las paredes
// interiores (muro entre habitaciones) se renderizan tambien.
const paredesInfo = []; // Array<{ wall, seg, len, apertures, name, room, ... }>

// El modo nuevo (parser con data-id) solo se activa si al menos UNA
// pared tiene data-name o data-room (atributos reales del SVG, no
// autogenerados). Si no, fallback al sistema legacy (bounding box
// + N/S/E/W) aunque el parser detecte paredes sin metadatos.
const useNewParser = elementsData && elementsData.paredes
  && elementsData.paredes.some(p => p.name || p.room);
if (elementsData && elementsData.paredes && elementsData.paredes.length > 0 && useNewParser) {
  // --- MODO NUEVO: usar paredes del parser con data-id ---
  // Para cada pared del parser, calculamos su segmento (2 puntos del
  // contour) y buscamos aperturas en elementsData.alzados o
  // elementsData.aperturasPlanta vinculadas por wallId o parentWallId.
  for (const p of elementsData.paredes) {
    // El contour de una pared de tipo <line> tiene 2-3 puntos (origen,
    // destino, y a veces origen duplicado por la Z del path).
    if (!p.contour || p.contour.length < 2) continue;
    const c0 = p.contour[0];
    const cN = p.contour[p.contour.length - 1];
    // Si el ultimo punto coincide con el primero, usar el penultimo como
    // destino (es el caso tipico de las paredes como <line> que el parser
    // cierra con el primer punto).
    let endPt = cN;
    if (cN.x === c0.x && cN.y === c0.y && p.contour.length >= 2) {
      endPt = p.contour[p.contour.length - 2];
    }
    // IMPORTANTE: aplicar la misma traslacion que el suelo (centrar en
    // el bounding box) para que las paredes se alineen con el suelo.
    const [x1, z1] = translate([c0.x, c0.y]);
    const [x2, z2] = translate([endPt.x, endPt.y]);
    const seg = [[x1, z1], [x2, z2]];
    const len = wallLength(seg[0], seg[1]);
    if (len < 1) continue;

    // Buscar aperturas vinculadas a esta pared.
    // 1) Por parentWallId en aperturasPlanta.
    // 2) Por wallId en alzados.
    // 3) Por "wallId base" quitando sufijos (-a, -b) para paredes
    //    que el parser segmenta por aperturas (ej: wall-mid-a/b
    //    vienen de wall-mid con un hueco).
    const apertures = [];
    const wallId = p.id;
    const wallIdBase = wallId.replace(/-[a-z]$/, "");
    const matchesWallId = (a) => a.wallId === wallId || a.parentWallId === wallId
      || a.wallId === wallIdBase || a.parentWallId === wallIdBase;
    // Aperturas de la planta vinculadas a esta pared.
    // Para paredes segmentadas (sufijo -a, -b), las aperturas con
    // wallId=base (sin sufijo) se asignan SOLO al primer segmento
    // encontrado, asi no se duplican en ambos lados del hueco.
    const isSegmentedSuffix = /-[a-z]$/.test(wallId);
    for (const a of (elementsData.aperturasPlanta || [])) {
      const aMatches = matchesWallId(a);
      if (!aMatches) continue;
      // Si la pared es segmentada y la apertura usa el wallId base
      // (sin sufijo), solo asignar al primer segmento -a.
      if (isSegmentedSuffix && (a.wallId === wallIdBase || a.parentWallId === wallIdBase)) {
        if (!wallId.endsWith("-a")) continue; // Solo el primer segmento recibe la apertura.
      }
      // Convertir el contour (5 puntos tipicamente) en xCm/widthCm.
      // Aplicar translate para que las aperturas se alineen con la
      // pared ya centrada. El xCm que espera buildWallMesh es la
      // DISTANCIA desde el inicio de la pared, no la X absoluta.
      const [tx0, tz0] = translate([a.contour[0].x, a.contour[0].y]);
      const [tx1, tz1] = translate([a.contour[1].x, a.contour[1].y]);
      const minX = Math.min(tx0, tx1);
      const maxX = Math.max(tx0, tx1);
      // Distancia desde el inicio de la pared (x1 del seg, o z1 si vertical).
      const isHorizWall = Math.abs(seg[0][1] - seg[1][1]) < 0.5;
      const segStart = isHorizWall ? seg[0][0] : seg[0][1];
      let xCmFromStart = minX - segStart;
      if (xCmFromStart < 0) {
        const segEnd = isHorizWall ? seg[1][0] : seg[1][1];
        xCmFromStart = minX - segEnd;
        if (xCmFromStart < 0) xCmFromStart = 0;
      }
      // Para una pared horizontal (la fachada sur de Mara), la apertura
      // ocupa una porcion del eje X, y esta justo en y=maxY. La
      // altura de la apertura en el alzado esta en yCm (medido desde
      // el suelo del alzado, no de la planta).
      // Usamos la informacion del alzado si existe, si no, fallback
      // a una estimacion razonable.
      const alzadoDeEsaPared = elementsData.alzados && elementsData.alzados[wallId];
      let yCm = 0, heightCm = 0;
      if (alzadoDeEsaPared) {
        // Buscar la apertura con el mismo id en el alzado.
        const alzadoAp = (alzadoDeEsaPared.apertures || []).find(ap => ap.id === a.id);
        if (alzadoAp) {
          yCm = alzadoAp.yCm;
          heightCm = alzadoAp.heightCm;
        }
      }
      // Tipo (door/window/hole).
      const kind = a.group === "door" ? "door" : a.group === "window" ? "window" : "hole";
      apertures.push({
        kind,
        xCm: xCmFromStart,
        widthCm: maxX - minX,
        yCm,
        heightCm,
        id: a.id,
      });
    }
    // Aperturas de los alzados vinculados a esta pared.
    const alzado = elementsData.alzados && elementsData.alzados[wallId];
    if (alzado) {
      // Para convertir xCm de SVG a mundo, usamos la relacion
      // xCm_mundo = (xCm_svg / viewBoxWidth) * wallWidthCmReal.
      const vbWidth = (alzado.viewBox && alzado.viewBox.width) || alzado.wallWidthCm || len;
      const wallWidthReal = alzado.wallWidthCm || len;
      const scale = wallWidthReal / vbWidth;
      // El alzado empieza en x_svg=0 (izquierda) y termina en x_svg=vbWidth (derecha).
      // En la pared renderizada, el "inicio" es x1 (o z1 si es vertical).
      // El xCm que espera buildWallMesh es la DISTANCIA desde el inicio
      // de la pared hasta el inicio de la apertura, medida a lo largo
      // de la pared.
      const isHoriz = Math.abs(seg[0][1] - seg[1][1]) < 0.5;
      const segStart = isHoriz ? seg[0][0] : seg[0][1];
      for (const a of (alzado.apertures || [])) {
        // Si ya esta en apertures (por estar tambien en la planta), no duplicar.
        if (apertures.find(x => x.id === a.id)) continue;
        const kind = a.group === "door" ? "door" : a.group === "window" ? "window" : "hole";
        // Posicion X de la apertura en coords del mundo.
        const xMundo = a.xCm * scale;
        // Distancia desde el inicio de la pared.
        // Si segStart = -500 y xMundo = 250, entonces dist = 250 - (-500) = 750.
        // Si segStart = 500 y xMundo = 250, entonces dist = 250 - 500 = -250
        //   (la apertura esta ANTES del inicio, lo cual no tiene sentido;
        //    en ese caso, usar la distancia desde el final).
        let xCmFromStart = xMundo - segStart;
        // Si es negativo, la pared va al reves: usar el final como inicio.
        if (xCmFromStart < 0) {
          const segEnd = isHoriz ? seg[1][0] : seg[1][1];
          xCmFromStart = xMundo - segEnd;
          if (xCmFromStart < 0) xCmFromStart = 0; // clamp
        }
        apertures.push({
          kind,
          xCm: xCmFromStart,
          widthCm: a.widthCm * scale,
          yCm: a.yCm,
          heightCm: a.heightCm,
          id: a.id,
        });
      }
    }

    paredesInfo.push({
      wall: p.id, // data-id de la pared (en vez de N/S/E/W)
      seg,
      len,
      apertures,
      name: p.name,
      room: p.room,
      colorCaraA: p.colorCaraA,
      colorCaraB: p.colorCaraB,
      colorCaraC: p.colorCaraC,
    });
  }
} else {
  // --- MODO LEGACY: bounding box clasificado por orientacion ---
  // Las paredes exteriores (en orden de generacion): para una planta con
  // contorno mainContour = [p0, p1, ..., pN-1, p0], los lados son
  // (p0,p1), (p1,p2), ..., (pN-1,p0). Para una planta rectangular
  // axis-aligned en coords SVG (xCm, yCm), los 4 lados son:
  //   (0) lado entre p0 y p1: horizontal, y=minY (NORTE) o y=maxY (SUR)
  //   (1) lado entre p1 y p2: vertical, x=maxX (ESTE) o x=minX (OESTE)
  //   (2) lado entre p2 y p3: horizontal
  //   (3) lado entre p3 y p0: vertical
  // Pero como mainContour no garantiza el orden de los puntos, las
  // paredes se identifican por su orientacion: las horizontales (dz=0)
  // son N o S segun su Y; las verticales (dx=0) son E u O segun su X.
  for (const seg of exteriorWalls) {
    const [[x1, z1], [x2, z2]] = seg;
    const len = wallLength(seg[0], seg[1]);
    const isHoriz = Math.abs(z2 - z1) < 0.5;
    let wall = null;
    if (isHoriz) {
      const y = (z1 + z2) / 2;
      const localMidY = (localMinY + localMaxY) / 2;
      wall = y < localMidY ? "N" : "S";
    } else {
      const x = (x1 + x2) / 2;
      const localMidX = (localMinX + localMaxX) / 2;
      wall = x < localMidX ? "W" : "E";
    }
    // Buscar alzado que coincida con esta pared.
    let apertures = [];
    for (const a of alzadosMeta) {
      const meta = a.meta;
      if (meta.wall === wall && meta.wallWidthCm != null) {
        if (Math.abs(meta.wallWidthCm - len) < 5) {
          apertures = meta.apertures;
          break;
        }
      } else if (meta.wall === wall && Math.abs(meta.widthCm - len) < 5) {
        apertures = meta.apertures;
        break;
      }
    }
    paredesInfo.push({ wall, seg, len, apertures });
  }
}

// --- 6b) Construir meshes de pared (con aperturas) -------------------------
// Las paredes se renderizan con sus aperturas como "holes" del Shape 2D
// (ver buildWallMesh), asi el hueco esta VACIO y se ve desde cualquier
// lado. Para las ventanas (cristal semitransparente) anadimos ademas un
// panel fino en el hueco para que se vea el color del cristal. Las
// puertas no llevan panel: el hueco se ve vacio.
const exteriorGroup = new THREE.Group(); // paredes exteriores (toggle)
const interiorGroup = new THREE.Group(); // paredes interiores
const apertureGroup = new THREE.Group(); // cristales de las ventanas
const doorGroup = new THREE.Group(); // paneles de las puertas (dentro del hueco)
const huecoGroup = new THREE.Group(); // paneles de los huecos (interior del agujero)

// --- Defaults de elementos editables y panel de materiales ----------------
// Cada elemento con presencia visible en 3D tiene 3 valores editables:
//   - exterior  (la cara que da al exterior de la casa o al exterior
//                de la apertura)
//   - interior  (la cara que da al interior de la casa)
//   - extrusion (el cuerpo solido que se ve dentro del hueco: marco de
//                la puerta, panel del cristal, fondo del hueco)
// Los elementos son:
//   - Cada pared detectada (N, S, E, O + nombres para interiores)
//   - Cada puerta individual (puerta-1, puerta-2, ...)
//   - Cada ventana individual (ventana-1, ventana-2, ...)
//   - Cada hueco individual (hueco-1, hueco-2, ...)
// Ademas hay defaults globales para los elementos sin edicion individual.
const MP_STORAGE = "vista3d-materials";
const ELEMENT_DEFAULTS = {
  wall: {
    // Cara A: lado positivo de la normal del Shape (cara "de arriba" de la planta).
    caraA: { color: "#d4c4a0", texture: "liso" },
    // Cara B: lado opuesto a la normal (cara "de abajo" de la planta).
    caraB: { color: "#f5ead2", texture: "liso" },
    // Cara C: perfil lateral (bordes superior/inferior y de huecos).
    caraC: { color: "#8b7355", texture: "liso" },
  },
  door: {
    caraA: { color: "#5a3a20", texture: "madera" },
    caraB: { color: "#5a3a20", texture: "madera" },
    caraC: { color: "#3a2a18", texture: "liso" },
  },
  window: {
    caraA: { color: "#b8d8f0", texture: "liso" },
    caraB: { color: "#b8d8f0", texture: "liso" },
    caraC: { color: "#9fc8e8", texture: "liso" },
  },
  hole: {
    caraA: { color: "#1a1a1a", texture: "liso" },
    caraB: { color: "#1a1a1a", texture: "liso" },
    caraC: { color: "#0a0a0a", texture: "liso" },
  },
};
const MP_GLOBALS = {
  "suelo":        { color: "#c4a988", texture: "liso" },
  "suelo-debajo": { color: "#6a5a48", texture: "liso" },
};

// --- Construir elementList, wallList, aperturaList -------------------------
// Esta lista se construye ANTES del bucle de paredes, porque las aperturas
// se identifican por id global (puerta-1, puerta-2, ventana-1, ...) y el
// bucle de paredes reutiliza esas ids para registrar los meshes.
//
// Si el endpoint /api/projects/:id/elements devolvio datos (elementsData),
// usamos los nombres reales y la vinculacion planta <-> alzados. Si no,
// fallback al sistema actual (N/S/E/O autogenerados).
const elementList = [];
const wallList = [];
const aperturaList = [];
const _wallIdSet = new Set();

// Helper: nombre legible de un wallId. En modo nuevo, el wallId es el
// data-id de la pared (ej: "wall-south"). Buscamos en elementsData
// el data-name correspondiente. En modo legacy, el wallId es N/S/E/W.
// Si no hay data-name, generamos uno a partir del wallId (ej:
// "wall-mid-a" -> "Muro medio (A)").
function niceWallName(wallId) {
  if (elementsData && elementsData.paredes) {
    const elem = elementsData.paredes.find(p => p.id === wallId);
    if (elem && elem.name) return elem.name;
  }
  // Si el wallId tiene sufijo -a/-b, es una pared segmentada.
  const segMatch = /^(.+)-([a-z])$/.exec(wallId);
  if (segMatch) {
    const base = segMatch[1];
    const suffix = segMatch[2].toUpperCase();
    // Buscar el nombre base.
    if (elementsData && elementsData.paredes) {
      // Buscar cualquier pared con id que empieza por el base.
      const basePared = elementsData.paredes.find(p => p.id === base
        || p.id.startsWith(base + "-"));
      if (basePared && basePared.name) return basePared.name + " (parte " + suffix + ")";
    }
    return "Muro interior (parte " + suffix + ")";
  }
  return { N: "Norte", S: "Sur", E: "Este", W: "Oeste" }[wallId] || wallId;
}

// Paredes
for (const info of paredesInfo) {
  if (_wallIdSet.has(info.wall)) continue;
  _wallIdSet.add(info.wall);
  const niceName = niceWallName(info.wall);
  // Inicializar colores desde el SVG si estan disponibles.
  const defaultA = info.colorCaraA || ELEMENT_DEFAULTS.wall.caraA.color;
  const defaultB = info.colorCaraB || ELEMENT_DEFAULTS.wall.caraB.color;
  const defaultC = info.colorCaraC || ELEMENT_DEFAULTS.wall.caraC.color;
  const defaultTexA = info.textureCaraA || ELEMENT_DEFAULTS.wall.caraA.texture;
  const defaultTexB = info.textureCaraB || ELEMENT_DEFAULTS.wall.caraB.texture;
  const defaultTexC = info.textureCaraC || ELEMENT_DEFAULTS.wall.caraC.texture;
  const w = {
    tipo: "wall",
    id: info.wall,
    label: "Pared " + niceName,
    wallLabel: info.room ? "(habitación " + info.room + ")" : "",
    caraA: { color: defaultA, texture: defaultTexA },
    caraB: { color: defaultB, texture: defaultTexB },
    caraC: { color: defaultC, texture: defaultTexC },
  };
  elementList.push(w);
  wallList.push(w);
}

// Aperturas: las IDs se asignan una vez, en este orden (mismo orden que
// recorre el bucle de paredes despues). Si elementsData tiene aperturas
// con data-id, las usamos para vincular con el SVG; si no, autogeneramos.
let _doorCount = 0, _winCount = 0, _holeCount = 0;

// Construir un mapa: wallId -> { doors, windows, holes } con data-id del SVG.
const aperturaById = new Map();
if (elementsData) {
  // Primero las aperturas de la planta.
  for (const a of elementsData.aperturasPlanta || []) {
    aperturaById.set(a.id, a);
  }
  // Luego las de los alzados (pueden sobrescribir si hay colision).
  for (const wallId in (elementsData.alzados || {})) {
    const elev = elementsData.alzados[wallId];
    for (const a of elev.apertures || []) {
      aperturaById.set(a.id, { ...a, wallId });
    }
  }
}

for (const info of paredesInfo) {
  const wallNice = niceWallName(info.wall);
  for (const a of info.apertures) {
    let ap;
    const wallLabel = "Pared " + wallNice;
    // Intentar usar la apertura del endpoint (busca por wallId y posicion).
    // Como fallback, autogenera puerta-N/ventana-N/hueco-N.
    let matchedFromEndpoint = null;
    if (aperturaById.size > 0) {
      // Buscar la primera apertura del tipo y wallId que coincida.
      for (const [id, ea] of aperturaById.entries()) {
        const parent = ea.parentWallId || ea.wallId;
        if (parent === info.wall && ea.group === (a.kind === "door" ? "door" : a.kind === "window" ? "window" : "hole")) {
          matchedFromEndpoint = ea;
          aperturaById.delete(id); // No reutilizar
          break;
        }
      }
    }

    if (a.kind === "door") {
      _doorCount++;
      const id = matchedFromEndpoint ? matchedFromEndpoint.id : "puerta-" + _doorCount;
      ap = { tipo: "door", id, label: matchedFromEndpoint ? (matchedFromEndpoint.name || "Puerta " + _doorCount) : "Puerta " + _doorCount,
        wallId: info.wall, wallLabel,
        caraA: matchedFromEndpoint && matchedFromEndpoint.colorCaraA
          ? { color: matchedFromEndpoint.colorCaraA, texture: matchedFromEndpoint.textureCaraA || "liso" }
          : { ...ELEMENT_DEFAULTS.door.caraA },
        caraB: matchedFromEndpoint && matchedFromEndpoint.colorCaraB
          ? { color: matchedFromEndpoint.colorCaraB, texture: matchedFromEndpoint.textureCaraB || "liso" }
          : { ...ELEMENT_DEFAULTS.door.caraB },
        caraC: matchedFromEndpoint && matchedFromEndpoint.colorCaraC
          ? { color: matchedFromEndpoint.colorCaraC, texture: matchedFromEndpoint.textureCaraC || "liso" }
          : { ...ELEMENT_DEFAULTS.door.caraC },
      };
      a.aperturaId = id;
    } else if (a.kind === "window") {
      _winCount++;
      const id = matchedFromEndpoint ? matchedFromEndpoint.id : "ventana-" + _winCount;
      ap = { tipo: "window", id, label: matchedFromEndpoint ? (matchedFromEndpoint.name || "Ventana " + _winCount) : "Ventana " + _winCount,
        wallId: info.wall, wallLabel,
        caraA: matchedFromEndpoint && matchedFromEndpoint.colorCaraA
          ? { color: matchedFromEndpoint.colorCaraA, texture: matchedFromEndpoint.textureCaraA || "liso" }
          : { ...ELEMENT_DEFAULTS.window.caraA },
        caraB: matchedFromEndpoint && matchedFromEndpoint.colorCaraB
          ? { color: matchedFromEndpoint.colorCaraB, texture: matchedFromEndpoint.textureCaraB || "liso" }
          : { ...ELEMENT_DEFAULTS.window.caraB },
        caraC: matchedFromEndpoint && matchedFromEndpoint.colorCaraC
          ? { color: matchedFromEndpoint.colorCaraC, texture: matchedFromEndpoint.textureCaraC || "liso" }
          : { ...ELEMENT_DEFAULTS.window.caraC },
      };
      a.aperturaId = id;
    } else {
      _holeCount++;
      const id = matchedFromEndpoint ? matchedFromEndpoint.id : "hueco-" + _holeCount;
      ap = { tipo: "hole", id, label: matchedFromEndpoint ? (matchedFromEndpoint.name || "Hueco " + _holeCount) : "Hueco " + _holeCount,
        wallId: info.wall, wallLabel,
        caraA: matchedFromEndpoint && matchedFromEndpoint.colorCaraA
          ? { color: matchedFromEndpoint.colorCaraA, texture: matchedFromEndpoint.textureCaraA || "liso" }
          : { ...ELEMENT_DEFAULTS.hole.caraA },
        caraB: matchedFromEndpoint && matchedFromEndpoint.colorCaraB
          ? { color: matchedFromEndpoint.colorCaraB, texture: matchedFromEndpoint.textureCaraB || "liso" }
          : { ...ELEMENT_DEFAULTS.hole.caraB },
        caraC: matchedFromEndpoint && matchedFromEndpoint.colorCaraC
          ? { color: matchedFromEndpoint.colorCaraC, texture: matchedFromEndpoint.textureCaraC || "liso" }
          : { ...ELEMENT_DEFAULTS.hole.caraC },
      };
      a.aperturaId = id;
    }
    elementList.push(ap);
    aperturaList.push(ap);
  }
}

// Map rapido: id de pared -> sus meshes (para que el panel de materiales
// pueda asignar color/textura por pared individual reasignando el array
// de materiales del mesh).
const wallMeshLookup = new Map(); // id + "_meshes" -> Mesh[]
// Map rapido: id de apertura (puerta-1, ventana-1, ...) -> sus meshes
const aperturaMeshLookup = new Map(); // aperturaId -> Mesh[]

// --- Elementos editables: defaults y construccion de listas ----------------
// Cada elemento con presencia visible en 3D tiene 3 valores editables:
//   - exterior  (la cara que da al exterior de la casa o al exterior
//                de la apertura)
//   - interior  (la cara que da al interior de la casa)
//   - extrusion (el cuerpo solido que se ve dentro del hueco: marco de
//                la puerta, panel del cristal, fondo del hueco)
// Los elementos son:
//   - Cada pared detectada (N, S, E, O + nombres para interiores)
//   - Cada puerta individual (puerta-1, puerta-2, ...)
//   - Cada ventana individual (ventana-1, ventana-2, ...)
//   - Cada hueco individual (hueco-1, hueco-2, ...)
// Ademas hay defaults globales para los elementos sin edicion individual.
// (ELEMENT_DEFAULTS, MP_GLOBALS y MP_STORAGE estan declarados arriba,
//  antes del bucle de paredes, para evitar problemas de TDZ.)

for (const info of paredesInfo) {
  const meshes = buildWallMesh(info.seg[0], info.seg[1], info.apertures);
  // Cada pared tiene un material individual: [fachada, interior].
  // Por defecto ambos son los materiales globales; el panel de materiales
  // los puede personalizar luego.
  // Array de 3 materiales porque ExtrudeGeometry genera 3 grupos de caras:
  //   0 = frente (exterior / fachada)
  //   1 = atras (interior / pintura)
  //   2 = laterales (bordes superior, inferior y de los huecos; se ven
  //       desde arriba o desde el interior de la casa).
  // Fachada e interior son editables desde el panel; los laterales usan
  // Cada mesh de pared tiene 3 materiales INDEPENDIENTES:
  //   [0] = cara frontal (fachada)
  //   [1] = cara trasera (interior / pintura)
  //   [2] = caras laterales (bordes superior/inferior y de huecos;
  //         tambien se ven como fachada desde arriba)
  // Usamos clones para que cambiar uno no afecte a los otros ni a
  // los defaults globales (paredExtMat / paredIntMat).
  const wMat = [paredExtMat.clone(), paredIntMat.clone(), paredExtMat.clone()];
  for (const m of meshes) {
    m.material = wMat;
    // Tag para el Raycaster: cada mesh de esta pared está asociado a
    // las 3 caras de la key del panel (cara-a, cara-b, cara-c).
    tagMesh(m, `wall:${info.wall}:cara-a`, `wall:${info.wall}:cara-b`, `wall:${info.wall}:cara-c`);
    exteriorGroup.add(m);
  }
  wallMeshLookup.set(info.wall + "_meshes", meshes);
  // Renderizar SOLO los cristales de las ventanas (no las puertas).
  // Las puertas dejan el hueco vacio para que se vea el interior/exterior.
  const [[x1, z1], [x2, z2]] = info.seg;
  const angle = Math.atan2(z2 - z1, x2 - z1);
  const len = info.len;
  const midX = (x1 + x2) / 2 + widthCm / 2;
  const midZ = (z1 + z2) / 2 + heightCm / 2;
  // Las IDs de las aperturas se asignan arriba (en la construccion de
  // elementList) para que coincidan entre el panel UI y los meshes.
  // Aqui solo las reutilizamos: `a.aperturaId` ya esta definido.
  for (const a of info.apertures) {
    const aperturaId = a.aperturaId;
    const cx = a.xCm + a.widthCm / 2 - len / 2;
    const cy = a.yCm + a.heightCm / 2;
    // 1) Panel de "hueco" (interior del agujero): un rectangulo fino en el
    //    centro de la pared que da sensacion de profundidad. Visible
    //    siempre para puertas y ventanas; ayuda a ver el "agujero".
    if (a.kind === "door" || a.kind === "window" || a.kind === "hole") {
      const huecoGeom = new THREE.BoxGeometry(a.widthCm, a.heightCm, 0.5);
      huecoGeom.translate(0, cy, 0);
      huecoGeom.rotateY(-angle);
      huecoGeom.translate(midX + cx * Math.cos(angle), 0, midZ + cx * Math.sin(angle));
      const huecoMesh = new THREE.Mesh(huecoGeom, huecoMat);
      // Tag del Raycaster: el "hueco" se asocia a la key global
      // `hueco` del panel (compartido por todas las aperturas).
      tagMesh(huecoMesh, "hueco");
      huecoGroup.add(huecoMesh);
    }
    // 2) Si es ventana: panel fino de cristal semitransparente.
    if (a.kind === "window") {
      const mat = cristalMat.clone();
      // Guardar referencia del mesh de esta ventana por id unica
      // para que el panel pueda cambiar color/textura individualmente.
      const geom = new THREE.BoxGeometry(a.widthCm, a.heightCm, 2);
      geom.translate(0, cy, 0);
      geom.rotateY(-angle);
      geom.translate(midX + cx * Math.cos(angle), 0, midZ + cx * Math.sin(angle));
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      // Tag del Raycaster: las 3 caras de esta ventana concreta.
      tagMesh(m, `window:${aperturaId}:cara-a`, `window:${aperturaId}:cara-b`, `window:${aperturaId}:cara-c`);
      apertureGroup.add(m);
      // Lookup mesh de esta apertura individual
      if (typeof aperturaMeshLookup !== "undefined" && aperturaMeshLookup) {
        if (!aperturaMeshLookup.has(aperturaId)) aperturaMeshLookup.set(aperturaId, []);
        aperturaMeshLookup.get(aperturaId).push(m);
      }
    }
    // 3) Si es puerta: panel de la puerta (dentro del hueco, tapando el
    //    "agujero" para que parezca una puerta cerrada).
    if (a.kind === "door") {
      const mat = puertaMat;
      // Grosor del panel de la puerta: 4cm. Altura: igual a la altura de
      // la apertura. El "panel" es lo que parece la hoja de la puerta.
      const geom = new THREE.BoxGeometry(a.widthCm * 0.92, a.heightCm * 0.98, 4);
      geom.translate(0, cy - 1, 0); // ligero offset hacia abajo para marco
      geom.rotateY(-angle);
      geom.translate(midX + cx * Math.cos(angle), 0, midZ + cx * Math.sin(angle));
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      // Tag del Raycaster: las 3 caras de esta puerta concreta.
      tagMesh(m, `door:${aperturaId}:cara-a`, `door:${aperturaId}:cara-b`, `door:${aperturaId}:cara-c`);
      doorGroup.add(m);
      if (typeof aperturaMeshLookup !== "undefined" && aperturaMeshLookup) {
        if (!aperturaMeshLookup.has(aperturaId)) aperturaMeshLookup.set(aperturaId, []);
        aperturaMeshLookup.get(aperturaId).push(m);
      }
    }
  }
}
scene.add(apertureGroup);
scene.add(doorGroup);
scene.add(huecoGroup);

// --- 6c) Toggle de aperturas (puertas + ventanas + huecos) ----------------
// El boton del sidebar controla la visibilidad de TODOS los elementos que
// estan dentro de los huecos: cristales de ventanas, paneles de puertas y
// fondos de hueco. Cuando esta OFF, las aperturas se ven como simples
// agujeros en la pared (Shape.holes).
const toggleAperturesBtn = document.getElementById("toggle-apertures");
if (toggleAperturesBtn) {
  toggleAperturesBtn.title = "Mostrar u ocultar puertas, ventanas y huecos";
  toggleAperturesBtn.addEventListener("click", () => {
    const isOn = toggleAperturesBtn.classList.toggle("on");
    apertureGroup.visible = isOn;
    doorGroup.visible = isOn;
    huecoGroup.visible = isOn;
  });
}
if (apertureGroup.children.length === 0 && doorGroup.children.length === 0 && huecoGroup.children.length === 0) {
  if (toggleAperturesBtn) {
    toggleAperturesBtn.style.opacity = "0.4";
    toggleAperturesBtn.title = "Este proyecto no tiene aperturas";
    toggleAperturesBtn.disabled = true;
  }
}
for (const seg of interiorWalls) {
  const meshes = buildWallMesh(seg[0], seg[1]);
  for (const m of meshes) interiorGroup.add(m);
}
scene.add(exteriorGroup);
scene.add(interiorGroup);

// --- 6b) Toggle de paredes exteriores --------------------------------------
// El boton #toggle-walls en view.html alterna la visibilidad del grupo
// exterior. Las paredes interiores siempre quedan visibles.
const toggleWallsBtn = document.getElementById("toggle-walls");
if (toggleWallsBtn) {
  toggleWallsBtn.addEventListener("click", () => {
    const isOn = toggleWallsBtn.classList.toggle("on");
    exteriorGroup.visible = isOn;
  });
}

// --- 7) Controles + render loop -------------------------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(widthCm / 2, alturaCm / 2, heightCm / 2);
controls.update();

// --- 7b) Modo recorrido interno (FPS) -------------------------------------
// Camara en primera persona a 1.70m del suelo, dentro de la casa.
// WASD/flechas para mover, raton para mirar, ESC para salir.
let fpsActive = false;
let fpsYaw = 0;     // rotacion horizontal (Y axis)
let fpsPitch = 0;   // rotacion vertical (X axis)
let fpsPos = new THREE.Vector3();
let fpsKeys = { w: false, a: false, s: false, d: false };
const FPS_HEIGHT_CM = 170;   // 1.70 m
const FPS_MOVE_SPEED = 250;  // cm/s (2.5 m/s) - paso humano
const FPS_TURN_SPEED = 1.8;  // rad/s
const FPS_COLL_RADIUS = 25;  // cm: radio de colision con paredes

// Construir una lista de AABBs (bounding boxes) de las paredes para
// detectar colisiones. Cada pared se modela como un rectangulo en el
// plano XZ con grosor en X o Z.
function buildFpsCollider() {
  const colliders = [];
  for (const w of wallList) {
    const meshes = wallMeshLookup.get(w.id + "_meshes") || [];
    if (meshes.length === 0) continue;
    // Usar el bounding box combinado de todos los meshes de la pared
    const box = new THREE.Box3();
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      box.expandByObject(m);
    }
    if (box.isEmpty()) continue;
    // Expandir ligeramente para que la camara no se "pegue" a la pared
    box.expandByScalar(2);
    colliders.push(box);
  }
  return colliders;
}
let fpsColliders = [];

// Funcion que dice si la posicion (x, z) esta dentro de alguna pared.
// Si esta dentro, se considera que hay colision y el movimiento se anula.
function fpsCollideAt(x, z) {
  const p = new THREE.Vector3(x, FPS_HEIGHT_CM, z);
  for (const box of fpsColliders) {
    // Solo comprobar en el plano XZ a la altura de los ojos
    if (x > box.min.x - FPS_COLL_RADIUS && x < box.max.x + FPS_COLL_RADIUS &&
        z > box.min.z - FPS_COLL_RADIUS && z < box.max.z + FPS_COLL_RADIUS) {
      return true;
    }
  }
  return false;
}

function fpsEnter() {
  // Posicion inicial: centro de la casa, a 1.70m del suelo, mirando al sur
  fpsPos.set(widthCm / 2, FPS_HEIGHT_CM, heightCm / 2);
  // Sacar la camara a un sitio valido si estamos dentro de una pared
  // (intentamos offsets en cruz hasta encontrar uno sin colision)
  if (fpsCollideAt(fpsPos.x, fpsPos.z)) {
    for (const off of [[100, 0], [-100, 0], [0, 100], [0, -100], [200, 0]]) {
      const nx = fpsPos.x + off[0], nz = fpsPos.z + off[1];
      if (!fpsCollideAt(nx, nz)) { fpsPos.x = nx; fpsPos.z = nz; break; }
    }
  }
  // Yaw inicial = orientacion actual de la camara
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  fpsYaw = Math.atan2(-dir.x, -dir.z);
  fpsPitch = 0;
  fpsActive = true;
  controls.enabled = false;
  // Mostrar overlay
  const ov = document.getElementById("fps-overlay");
  if (ov) ov.hidden = false;
  // Activar visualmente el boton
  const btn = document.getElementById("toggle-fps");
  if (btn) btn.classList.add("on");
  // Cerrar el sidebar si esta abierto, para que no estorbe
  document.body.classList.remove("sidebar-open");
  // Bloquear el raton (pointer lock) para mirar
  try { renderer.domElement.requestPointerLock(); } catch {}
}

function fpsExit() {
  fpsActive = false;
  controls.enabled = true;
  const ov = document.getElementById("fps-overlay");
  if (ov) ov.hidden = true;
  const btn = document.getElementById("toggle-fps");
  if (btn) btn.classList.remove("on");
  try { document.exitPointerLock(); } catch {}
}

function fpsToggle() {
  if (fpsActive) fpsExit();
  else fpsEnter();
}

// Boton del sidebar
const toggleFpsBtn = document.getElementById("toggle-fps");
if (toggleFpsBtn) {
  toggleFpsBtn.addEventListener("click", () => fpsToggle());
}

// Teclado: WASD/flechas
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && fpsActive) { fpsExit(); return; }
  if (!fpsActive) return;
  const k = e.key.toLowerCase();
  if (k === "w" || k === "arrowup") fpsKeys.w = true;
  if (k === "s" || k === "arrowdown") fpsKeys.s = true;
  if (k === "a" || k === "arrowleft") fpsKeys.a = true;
  if (k === "d" || k === "arrowright") fpsKeys.d = true;
});
window.addEventListener("keyup", (e) => {
  if (!fpsActive) return;
  const k = e.key.toLowerCase();
  if (k === "w" || k === "arrowup") fpsKeys.w = false;
  if (k === "s" || k === "arrowdown") fpsKeys.s = false;
  if (k === "a" || k === "arrowleft") fpsKeys.a = false;
  if (k === "d" || k === "arrowright") fpsKeys.d = false;
});

// Raton: mover la camara (yaw + pitch) cuando el puntero esta bloqueado
document.addEventListener("mousemove", (e) => {
  if (!fpsActive) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  fpsYaw -= e.movementX * 0.0025;
  fpsPitch -= e.movementY * 0.0025;
  // Limitar el pitch para no dar vueltas de campana
  const limit = Math.PI / 2 - 0.05;
  if (fpsPitch > limit) fpsPitch = limit;
  if (fpsPitch < -limit) fpsPitch = -limit;
});

// Construir los colliders tras cargar las paredes
fpsColliders = buildFpsCollider();

// --- 7c) Mandos virtuales (móvil/tablet) -----------------------------------
// Botones tipo cruceta en pantalla que simulan WASD. Se vinculan a
// fpsKeys para que el bucle principal los lea igual que el teclado.
(function setupFpsTouch() {
  const dpadBtns = document.querySelectorAll(".fps-btn[data-key]");
  if (dpadBtns.length === 0) return;

  const setKey = (key, down) => {
    if (down) fpsKeys[key] = true;
    else fpsKeys[key] = false;
  };

  dpadBtns.forEach((btn) => {
    const key = btn.dataset.key;
    // Pointer events cubren touch + mouse, sin duplicar con el teclado
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("active");
      setKey(key, true);
    });
    btn.addEventListener("pointerup", (e) => {
      e.preventDefault();
      btn.classList.remove("active");
      setKey(key, false);
    });
    btn.addEventListener("pointercancel", (e) => {
      btn.classList.remove("active");
      setKey(key, false);
    });
    btn.addEventListener("pointerleave", (e) => {
      // Si el dedo sale del boton sin soltar, soltar la tecla
      if (btn.classList.contains("active")) {
        btn.classList.remove("active");
        setKey(key, false);
      }
    });
    // Evitar el menu contextual al mantener pulsado
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
  });

  // Boton de salir
  const exitBtn = document.getElementById("fps-btn-exit");
  if (exitBtn) {
    exitBtn.addEventListener("click", (e) => {
      e.preventDefault();
      fpsExit();
    });
  }
})();

// Arrastrar el dedo en cualquier parte del lado derecho de la pantalla
// = mirar alrededor (yaw + pitch). Solo cuando NO estamos pulsando un
// boton de la cruceta.
(function setupFpsDragLook() {
  const overlay = document.getElementById("fps-touch");
  if (!overlay) return;
  let dragging = false;
  let lastX = 0, lastY = 0;

  overlay.addEventListener("pointerdown", (e) => {
    // Solo si el target es el overlay o el crosshair, no un boton
    if (e.target.closest(".fps-btn") || e.target.closest(".fps-btn-exit")) return;
    if (e.clientX < innerWidth / 2) return;  // solo lado derecho
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try { overlay.setPointerCapture(e.pointerId); } catch {}
  });
  overlay.addEventListener("pointermove", (e) => {
    if (!dragging || !fpsActive) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    fpsYaw -= dx * 0.005;
    fpsPitch -= dy * 0.005;
    const limit = Math.PI / 2 - 0.05;
    if (fpsPitch > limit) fpsPitch = limit;
    if (fpsPitch < -limit) fpsPitch = -limit;
  });
  const endDrag = () => { dragging = false; };
  overlay.addEventListener("pointerup", endDrag);
  overlay.addEventListener("pointercancel", endDrag);
})();

  // Mueve la camara para enfocar la cara seleccionada de un elemento.
// Desactivado: el muro es un Shape 2D extruido a grosor 0, asi que la
// camara quedaba dentro del muro y veia solo geometria rara.
// El usuario mueve la camara con el raton si quiere ver otra cara.
function focusOnFace(key) {
  // No-op: no movemos la camara.
}

// En el render loop.
let fpsLastT = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.1, (now - fpsLastT) / 1000); // segundos, max 100ms
  fpsLastT = now;

  if (fpsActive) {
    // Movimiento WASD en el plano horizontal
    let moveX = 0, moveZ = 0;
    // W: hacia adelante en la direccion de la camara.
    // En Three.js con yaw=0 mirando al -Z, "delante" = (-sin(yaw), -cos(yaw)).
    if (fpsKeys.w) {
      moveX -= Math.sin(fpsYaw);
      moveZ -= Math.cos(fpsYaw);
    }
    if (fpsKeys.s) {
      moveX += Math.sin(fpsYaw);
      moveZ += Math.cos(fpsYaw);
    }
    // A: girar izquierda (rotacion)
    // D: girar derecha (rotacion)
    if (fpsKeys.a) fpsYaw += FPS_TURN_SPEED * dt;
    if (fpsKeys.d) fpsYaw -= FPS_TURN_SPEED * dt;

    // Normalizar y aplicar velocidad
    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      moveX = (moveX / len) * FPS_MOVE_SPEED * dt;
      moveZ = (moveZ / len) * FPS_MOVE_SPEED * dt;
      // Comprobar colision con la nueva X (manteniendo Z)
      const newX = fpsPos.x + moveX;
      if (!fpsCollideAt(newX, fpsPos.z)) fpsPos.x = newX;
      // Comprobar colision con la nueva Z (manteniendo X)
      const newZ = fpsPos.z + moveZ;
      if (!fpsCollideAt(fpsPos.x, newZ)) fpsPos.z = newZ;
    }

    // Colocar la camara en (x, 1.70m, z) con la orientacion yaw/pitch
    camera.position.set(fpsPos.x, fpsPos.y, fpsPos.z);
    // Construir el cuaternion de orientacion: primero yaw, luego pitch
    const euler = new THREE.Euler(fpsPitch, fpsYaw, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);
  } else {
    controls.update();
  }
  renderer.render(scene, camera);
}
animate();

// Sidebar open/close: el tamano del canvas cambia cuando se abre/cierra.
function resizeCanvas() {
  const w = innerWidth;
  const h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
addEventListener("resize", resizeCanvas);
// Re-resize al abrir/cerrar sidebar (porque la transicion CSS cambia el
// ancho visible del stage via right: 320px).
function syncStageSize() {
  // Forzar un resize en el siguiente frame para que la transicion CSS
  // ya haya recolocado el stage.
  requestAnimationFrame(resizeCanvas);
}

// --- Panel de materiales (UI en el sidebar del visor) ---------------------
// Las listas elementList, wallList, aperturaList y los defaults
// (ELEMENT_DEFAULTS, MP_GLOBALS) se construyen arriba, justo antes del
// bucle de paredes, para que las IDs de las aperturas coincidan con los
// meshes que se registran despues.
// Aqui solo construimos el mapa plano MP_DEFAULTS y la UI.

const MP_DEFAULTS = { ...MP_GLOBALS };
for (const e of elementList) {
  MP_DEFAULTS[e.tipo + ":" + e.id + ":cara-a"] = e.caraA;
  MP_DEFAULTS[e.tipo + ":" + e.id + ":cara-b"] = e.caraB;
  MP_DEFAULTS[e.tipo + ":" + e.id + ":cara-c"] = e.caraC;
}
const MP_KEYS = Object.keys(MP_DEFAULTS);

// --- 6b.5) Aplicar MP a los meshes al inicio --------------------------------
// Hasta ahora los meshes se crearon con los colores por defecto
// (paredExtMat/paredIntMat). Hay que aplicar el MP para que cada pared
// tenga los colores correctos del SVG (data-color-cara-a/b/c).
{
  const mpInit = loadMP();
  for (const key of MP_KEYS) {
    if (mpInit[key]) applyMPToMesh(key, mpInit[key]);
  }
  // Suelo y suelo-debajo: usar la key directa
  if (mpInit["suelo"]) applyMPToMesh("suelo", mpInit["suelo"]);
  if (mpInit["suelo-debajo"]) applyMPToMesh("suelo-debajo", mpInit["suelo-debajo"]);
}

function loadMP() {
  try {
    const stored = localStorage.getItem(MP_STORAGE);
    if (stored) {
      const parsed = JSON.parse(stored);
      const out = JSON.parse(JSON.stringify(MP_DEFAULTS));
      for (const k of MP_KEYS) {
        if (parsed[k]) out[k] = { ...out[k], ...parsed[k] };
      }
      return out;
    }
  } catch {}
  return JSON.parse(JSON.stringify(MP_DEFAULTS));
}
function saveMP(cfg) {
  try { localStorage.setItem(MP_STORAGE, JSON.stringify(cfg)); } catch {}
}
function hexToInt(hex) {
  if (typeof hex === "number") return hex;
  if (typeof hex !== "string") return 0;
  return parseInt(hex.replace("#", ""), 16);
}

// Helper: aplica color/textura/roughness a un material existente.
// Si hay textura, pone el color del material a blanco para no tintar
// la textura (la textura ya esta pintada con el color base).
function applyMatFromCfg(mat, cfg, opts) {
  const hasTexture = cfg.texture && cfg.texture !== "liso";
  if (hasTexture) {
    mat.color.setHex(0xffffff);
    mat.map = getTexture(cfg.texture, cfg.color);
  } else {
    mat.color.setHex(hexToInt(cfg.color));
    mat.map = null;
  }
  if (opts && opts.roughness != null) mat.roughness = opts.roughness;
  if (opts && opts.transparent != null) {
    mat.transparent = opts.transparent;
    if (opts.opacity != null) mat.opacity = opts.opacity;
  }
  mat.needsUpdate = true;
}

// Aplica el material de un key al mesh/grupo correspondiente.
// Las keys pueden ser:
//   - "suelo" o "suelo-debajo" (globales)
//   - "{tipo}:{id}:{face}" donde tipo = wall/door/window/hole, face =
//     exterior/interior/extrusion
function applyMPToMesh(key, cfg) {
  if (key === "suelo") {
    applyMatFromCfg(sueloMat, cfg, { roughness: 0.85 });
    return;
  }
  if (key === "suelo-debajo") {
    applyMatFromCfg(sueloDebajoMat, cfg, { roughness: 0.85 });
    return;
  }
  // Keys con formato {tipo}:{id}:{face}
  const parts = key.split(":");
  if (parts.length !== 3) return;
  const [tipo, id, face] = parts;
  if (tipo === "wall") {
    const meshes = wallMeshLookup.get(id + "_meshes") || [];
    for (const mesh of meshes) {
      // Cada mesh de pared tiene 3 materiales (ExtrudeGeometry):
      //   [0] = cara A (frontal, lado positivo de la normal del Shape)
      //   [1] = cara B (trasera, opuesta a la normal)
      //   [2] = cara C (perfil lateral: bordes superior, inferior y de huecos)
      if (!Array.isArray(mesh.material) || mesh.material.length < 3) {
        mesh.material = [paredExtMat.clone(), paredIntMat.clone(), paredExtMat.clone()];
      }
      if (face === "cara-a") {
        // Cara A = slot 0 (la cara frontal, lado positivo de la normal).
        // NO se aplica a slot 2: la Cara C (bordes) es independiente
        // y se edita con su propio picker.
        applyMatFromCfg(mesh.material[0], cfg, { roughness: 0.9 });
      } else if (face === "cara-b") {
        // Cara B = slot 1 (la cara opuesta a la normal).
        applyMatFromCfg(mesh.material[1], cfg, { roughness: 0.9 });
      } else if (face === "cara-c") {
        // Cara C = slot 2 (perfil lateral: bordes superior/inferior y de huecos).
        applyMatFromCfg(mesh.material[2], cfg, { roughness: 0.9 });
      }
    }
    return;
  }
  if (tipo === "door" || tipo === "window" || tipo === "hole") {
    const meshes = aperturaMeshLookup.get(id) || [];
    for (const mesh of meshes) {
      // Cada apertura tiene UN mesh, no array. Aplicar color/textura directo.
      const hasTexture = cfg.texture && cfg.texture !== "liso";
      if (hasTexture) {
        mesh.material.color.setHex(0xffffff);
        mesh.material.map = getTexture(cfg.texture, cfg.color);
      } else {
        mesh.material.color.setHex(hexToInt(cfg.color));
        mesh.material.map = null;
      }
      if (tipo === "window") {
        mesh.material.roughness = 0.15;
        mesh.material.transparent = true;
        mesh.material.opacity = 0.55;
      } else if (tipo === "door") {
        mesh.material.roughness = 0.7;
        mesh.material.transparent = false;
        mesh.material.opacity = 1;
      } else {
        mesh.material.roughness = 0.95;
        mesh.material.transparent = false;
        mesh.material.opacity = 1;
      }
      mesh.material.needsUpdate = true;
    }
    return;
  }
}

// Reaplica la fachada y el interior a TODAS las paredes (usado al cambiar
// los defaults globales).
function applyWallsDefault() {
  const apply = (group) => group.traverse(o => {
    if (o.isMesh) o.material = [paredExtMat, paredIntMat, paredExtMat];
  });
  apply(exteriorGroup);
  apply(interiorGroup);
}

// Construir la UI del panel en el sidebar del visor.
// Estructura: cada elemento con presencia 3D tiene un bloque con 3 sub-filas:
// exterior / interior / extrusion.
const wallsListEl = document.getElementById("mp-walls-list");
function makeSelect(id, defaultVal) {
  const opts = ["liso", "madera", "baldosa", "ladrillo", "marmol", "piedra"]
    .map(t => `<option value="${t}"${t === defaultVal ? " selected" : ""}>${
      t === "liso" ? "Liso" : t === "madera" ? "Madera" : t === "baldosa" ? "Baldosa"
      : t === "ladrillo" ? "Ladrillo" : t === "marmol" ? "Mármol" : "Piedra"
    }</option>`).join("");
  return `<select class="mp-tex" data-pid="${id}" title="Textura">
    ${opts}
  </select>`;
}
function makeRow(key, label, color, texture) {
  return `
    <div class="mp-row" data-key="${key}">
      <input type="color" class="mp-color" data-pid="${key}" value="${color}" title="Color">
      <div class="mp-name">${label}</div>
      ${makeSelect(key, texture)}
    </div>`;
}
if (wallsListEl) {
  for (const e of elementList) {
    const details = document.createElement("details");
    details.className = "mp-element-block";
    details.style.marginTop = "6px";
    // Cada elemento es colapsable individualmente.
    const sub = e.tipo === "wall"
      ? `<div class="mp-name" style="font-size:10px;color:#7a8190;margin-bottom:4px;">${e.wallLabel || ""}</div>`
      : `<div class="mp-name" style="font-size:10px;color:#7a8190;margin-bottom:4px;">${e.wallLabel || ""}</div>`;
    details.innerHTML = `
      <summary class="mp-element-summary">
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <span class="mp-element-label">${e.label}</span>
      </summary>
      <div class="mp-element-body">
        ${sub}
        ${makeRow(e.tipo + ":" + e.id + ":cara-a", "Cara A", e.caraA.color, e.caraA.texture)}
        ${makeRow(e.tipo + ":" + e.id + ":cara-b", "Cara B", e.caraB.color, e.caraB.texture)}
        ${makeRow(e.tipo + ":" + e.id + ":cara-c", "Cara C", e.caraC.color, e.caraC.texture)}
      </div>`;
    wallsListEl.appendChild(details);
  }
}

// Vincular listeners. Cada fila tiene un color picker y un selector de
// textura. Las keys tienen el formato "{tipo}:{id}:{face}" o "suelo" o
// "suelo-debajo" para los globales.
const mp = loadMP();
function bindRow(key, colorEl, texEl) {
  if (colorEl) {
    colorEl.value = mp[key].color;
    colorEl.addEventListener("input", () => {
      mp[key].color = colorEl.value;
      saveMP(mp);
      applyMPToMesh(key, mp[key]);
    });
  }
  if (texEl) {
    texEl.value = mp[key].texture;
    texEl.addEventListener("change", () => {
      mp[key].texture = texEl.value;
      saveMP(mp);
      applyMPToMesh(key, mp[key]);
    });
  }
}

// --- Raycaster: selección de elementos en el visor 3D ---------------------
// Al hacer click en un mesh del modelo, abre una ventana flotante con
// los atributos de ese elemento (Cara A / Cara B / Cara C).
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pickerOpen = false;
let lastSelectedKey = null; // key de MP_KEYS actualmente mostrada

const popupEl = document.getElementById("picker-popup");
const popupTitleEl = document.getElementById("pp-title");
const popupSubEl = document.getElementById("pp-sub");
const popupBodyEl = document.getElementById("pp-body");
const popupCloseEl = document.getElementById("pp-close");
if (popupCloseEl) popupCloseEl.addEventListener("click", closePickerPopup);

// Lista de meshes "pickable": todos los meshes creados en este viewer
// que tengan userData.elementKeys.
function allPickableMeshes() {
  const out = [];
  scene.traverse((obj) => {
    if (obj.isMesh && obj.userData.elementKeys && obj.userData.elementKeys.length) {
      out.push(obj);
    }
  });
  return out;
}

// Devuelve el nombre legible de un elemento a partir de su key
// (e.g. "wall:wall-south:cara-a" -> "Pared Muro sur").
function labelForKey(key) {
  const [tipo, id, face] = key.split(":");
  if (tipo === "wall") {
    const w = wallList.find((w) => w.id === id);
    return w ? `Pared · ${w.label || id}` : `Pared · ${id}`;
  }
  if (tipo === "door") {
    const a = aperturaList.find((a) => a.id === id);
    return a ? `Puerta · ${a.label || id}` : `Puerta · ${id}`;
  }
  if (tipo === "window") {
    const a = aperturaList.find((a) => a.id === id);
    return a ? `Ventana · ${a.label || id}` : `Ventana · ${id}`;
  }
  if (tipo === "hole") {
    return "Hueco";
  }
  if (tipo === "suelo") return "Suelo · cara superior";
  if (tipo === "suelo-debajo") return "Suelo · cara inferior (forjado)";
  return key;
}

function openPickerPopup(key, clientX, clientY) {
  if (!popupEl) return;
  // Si la key es de un suelo/apertura genérica (no cara-a/b/c), derivamos a cara-a
  let realKey = key;
  if (key === "suelo") realKey = "suelo";
  else if (key === "suelo-debajo") realKey = "suelo-debajo";
  else if (key === "hueco") realKey = "hueco";
  // Aperturas: si la key tiene cara-*, mantenla; si no, mostramos las 3 caras de esa apertura
  const [tipo, id, face] = realKey.split(":");
  const elementBaseKey = `${tipo}:${id}`; // sin cara
  const isSingle = ["suelo", "suelo-debajo", "hueco"].includes(tipo);
  const faces = isSingle ? [null] : ["cara-a", "cara-b", "cara-c"];

  lastSelectedKey = realKey;
  popupTitleEl.textContent = labelForKey(realKey);
  popupSubEl.textContent = isSingle ? "Atributos" : `Atributos (Cara A / Cara B / Cara C)`;

  // Construir el body: 1 fila por cara (o 1 fila si es suelo/hueco).
  const mpNow = loadMP();
  popupBodyEl.innerHTML = "";
  for (const f of faces) {
    const k = f ? `${elementBaseKey}:${f}` : realKey;
    const cfg = mpNow[k] || { color: "#888888", texture: "liso" };
    const row = document.createElement("div");
    row.className = "pp-face";
    const labelText = f ? ({
      "cara-a": "Cara A",
      "cara-b": "Cara B",
      "cara-c": "Cara C",
    }[f] || f) : labelForKey(realKey);
    row.innerHTML = `
      <label>${labelText}</label>
      <input type="color" value="${cfg.color}" data-k="${k}" data-role="color" />
      <select data-k="${k}" data-role="texture">
        <option value="liso"${cfg.texture === "liso" ? " selected" : ""}>Liso</option>
        <option value="madera"${cfg.texture === "madera" ? " selected" : ""}>Madera</option>
        <option value="baldosa"${cfg.texture === "baldosa" ? " selected" : ""}>Baldosa</option>
        <option value="ladrillo"${cfg.texture === "ladrillo" ? " selected" : ""}>Ladrillo</option>
        <option value="marmol"${cfg.texture === "marmol" ? " selected" : ""}>Mármol</option>
        <option value="piedra"${cfg.texture === "piedra" ? " selected" : ""}>Piedra</option>
      </select>
    `;
    popupBodyEl.appendChild(row);
  }
  // Vincular cambios: cualquier cambio actualiza MP, aplica al mesh, y
  // sincroniza el input del panel lateral (si existe).
  popupBodyEl.querySelectorAll("input[data-k], select[data-k]").forEach((inp) => {
    inp.addEventListener("input", (ev) => {
      const k = ev.target.dataset.k;
      const role = ev.target.dataset.role;
      const mpCur = loadMP();
      if (!mpCur[k]) mpCur[k] = { color: "#888888", texture: "liso" };
      if (role === "color") mpCur[k].color = ev.target.value;
      if (role === "texture") mpCur[k].texture = ev.target.value;
      saveMP(mpCur);
      applyMPToMesh(k, mpCur[k]);
      // Sincronizar con el input del sidebar si existe.
      const side = document.querySelector(`.mp-color[data-pid="${k}"]`);
      if (side && role === "color") side.value = ev.target.value;
      const sideTex = document.querySelector(`.mp-tex[data-pid="${k}"]`);
      if (sideTex && role === "texture") sideTex.value = ev.target.value;
    });
  });

  // Vincular los botones de navegación de cámara.
  // (Eliminado: el usuario prefiere la camara libre.)

  // Mini-visor 3D: un cubo con 6 caras que muestra en tiempo real
  // los colores de cada cara del elemento. Asi el usuario ve
  // siempre que Cara A es la fachada, Cara B la cara opuesta
  // (interior de la casa) y Cara C los bordes.
  const elementFor3D = isSingle ? { id: realKey } : { id: elementBaseKey, kind: "wall" };
  const popup3dGetter = () => {
    const mpCur = loadMP();
    if (isSingle) {
      const c = mpCur[realKey] || MP_DEFAULTS[realKey] || { color: "#888888" };
      return { caraA: c.color, caraB: c.color, caraC: c.color };
    }
    return {
      caraA: mpCur[elementBaseKey + ":cara-a"]?.color || "#888888",
      caraB: mpCur[elementBaseKey + ":cara-b"]?.color || "#888888",
      caraC: mpCur[elementBaseKey + ":cara-c"]?.color || "#888888",
    };
  };
  setupPopup3DPreview(popup3dGetter);

  // Posicionar el popup cerca del click pero dentro de la ventana.
  popupEl.hidden = false;
  pickerOpen = true;
  const r = popupEl.getBoundingClientRect();
  let px = clientX + 14;
  let py = clientY + 14;
  if (px + r.width > innerWidth - 8) px = innerWidth - r.width - 8;
  if (py + r.height > innerHeight - 8) py = innerHeight - r.height - 8;
  popupEl.style.left = px + "px";
  popupEl.style.top = py + "px";
}

function closePickerPopup() {
  if (!popupEl) return;
  popupEl.hidden = true;
  pickerOpen = false;
  lastSelectedKey = null;
  // Restaurar opacidad de los muros si los hicimos transparentes
  for (const [id, meshes] of wallMeshLookup.entries()) {
    meshes.forEach((m) => {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => { mat.transparent = false; mat.opacity = 1.0; });
        mat.needsUpdate = true;
      }
    });
  }
  // Limpiar el mini-visor 3D (pause + dispose)
  if (pp3d) {
    pp3d.dispose();
    pp3d = null;
  }
}

// --- Mini-visor 3D dentro del popup ----------------------------------------
// Un cubo de 6 caras (no un ExtrudeGeometry) con 6 materiales:
//   [+X]=Cara B (lateral derecha, fuera del muro)
//   [-X]=Cara B (lateral izquierda)
//   [+Y]=Cara C (borde superior)
//   [-Y]=Cara C (borde inferior)
//   [+Z]=Cara A (fachada frontal)
//   [-Z]=Cara A (fachada trasera)
// El cubo rota lentamente para que se vean TODAS las caras.
let pp3d = null; // { renderer, scene, camera, mesh, animId }

function setupPopup3DPreview(getter) {
  const wrapEl = document.getElementById("pp-3d-wrap");
  if (!wrapEl) return;
  // Limpiar si ya habia uno
  if (pp3d) {
    pp3d.dispose();
    pp3d = null;
  }
  wrapEl.innerHTML = "";
  const w = wrapEl.clientWidth || 280;
  const h = wrapEl.clientHeight || 120;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  wrapEl.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
  camera.position.set(0, 0, 6);
  // Cubo con 6 materiales (uno por cara)
  const cubeGeo = new THREE.BoxGeometry(2, 2, 2);
  const matDefault = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  const cube = new THREE.Mesh(cubeGeo, [
    matDefault.clone(), // +X Cara B (lateral derecha)
    matDefault.clone(), // -X Cara B (lateral izquierda)
    matDefault.clone(), // +Y Cara C (borde superior)
    matDefault.clone(), // -Y Cara C (borde inferior)
    matDefault.clone(), // +Z Cara A (fachada frontal)
    matDefault.clone(), // -Z Cara A (fachada trasera)
  ]);
  scene.add(cube);
  // Luces
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2, 3, 4);
  scene.add(dirLight);
  // Labels pequeños
  const lblA = document.createElement("div");
  lblA.className = "pp-3d-label a";
  lblA.textContent = "Cara A";
  const lblB = document.createElement("div");
  lblB.className = "pp-3d-label b";
  lblB.textContent = "Cara B";
  const lblC = document.createElement("div");
  lblC.className = "pp-3d-label c";
  lblC.textContent = "Cara C";
  wrapEl.appendChild(lblA);
  wrapEl.appendChild(lblB);
  wrapEl.appendChild(lblC);

  // Animacion: rotar el cubo lentamente
  let lastT = performance.now();
  function animate() {
    const now = performance.now();
    const dt = (now - lastT) / 1000;
    lastT = now;
    cube.rotation.y += dt * 0.5;
    // Actualizar materiales segun el getter (lee del localStorage)
    const colors = getter();
    if (colors) {
      const mats = cube.material;
      // Cara A: cara frontal (+Z) y cara trasera (-Z)
      if (mats[4] && colors.caraA) mats[4].color.set(colors.caraA);
      if (mats[5] && colors.caraA) mats[5].color.set(colors.caraA);
      // Cara B: laterales (+X y -X)
      if (mats[0] && colors.caraB) mats[0].color.set(colors.caraB);
      if (mats[1] && colors.caraB) mats[1].color.set(colors.caraB);
      // Cara C: bordes superior (+Y) e inferior (-Y)
      if (mats[2] && colors.caraC) mats[2].color.set(colors.caraC);
      if (mats[3] && colors.caraC) mats[3].color.set(colors.caraC);
    }
    renderer.render(scene, camera);
    if (pp3d) pp3d.animId = requestAnimationFrame(animate);
  }
  pp3d = { renderer, scene, camera, mesh: cube, animId: null, dispose() {
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
    if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh && this.mesh.material)) {
      this.mesh.material.forEach((m) => m.dispose());
    }
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    const labels = wrapEl.querySelectorAll(".pp-3d-label");
    labels.forEach((l) => l.remove());
  } };
  animate();
}

// Click en el canvas: lanzar raycaster y, si hay hit, abrir el popup.
renderer.domElement.addEventListener("click", (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(allPickableMeshes(), false);
  if (hits.length === 0) {
    // Click en el vacio: cerrar el popup.
    if (pickerOpen) closePickerPopup();
    return;
  }
  // Tomamos el primer mesh con userData.elementKeys.
  const m = hits[0].object;
  const keys = m.userData.elementKeys;
  if (!keys || keys.length === 0) return;
  openPickerPopup(keys[0], ev.clientX, ev.clientY);
});

// Hover: cambiar cursor a pointer si hay un elemento bajo el ratón.
renderer.domElement.addEventListener("mousemove", (ev) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(allPickableMeshes(), false);
  if (hits.length > 0) renderer.domElement.classList.add("pickable");
  else renderer.domElement.classList.remove("pickable");
});

// Vincular todas las filas: cada elemento tiene 3 sub-filas.
for (const e of elementList) {
  for (const face of ["cara-a", "cara-b", "cara-c"]) {
    const k = e.tipo + ":" + e.id + ":" + face;
    bindRow(k,
      document.querySelector(`.mp-color[data-pid="${k}"]`),
      document.querySelector(`.mp-tex[data-pid="${k}"]`));
  }
}

// Globales: suelo y suelo-debajo.
for (const key of ["suelo", "suelo-debajo"]) {
  bindRow(key,
    document.getElementById("mp-" + key + "-color"),
    document.getElementById("mp-" + key + "-texture"));
}

// Boton reset: limpia TODAS las configs.
document.getElementById("mp-reset")?.addEventListener("click", () => {
  for (const key of MP_KEYS) {
    mp[key] = { ...MP_DEFAULTS[key] };
  }
  // Actualizar todos los inputs del sidebar si existen
  for (const e of elementList) {
    for (const face of ["cara-a", "cara-b", "cara-c"]) {
      const k = e.tipo + ":" + e.id + ":" + face;
      const c = document.querySelector(`.mp-color[data-pid="${k}"]`);
      const t = document.querySelector(`.mp-tex[data-pid="${k}"]`);
      if (c) c.value = mp[k].color;
      if (t) t.value = mp[k].texture;
      applyMPToMesh(k, mp[k]);
    }
  }
  for (const key of ["suelo", "suelo-debajo"]) {
    const c = document.getElementById("mp-" + key + "-color");
    const t = document.getElementById("mp-" + key + "-texture");
    if (c) c.value = mp[key].color;
    if (t) t.value = mp[key].texture;
    applyMPToMesh(key, mp[key]);
  }
  // Si el popup flotante está abierto, actualizar sus inputs también
  if (pickerOpen && lastSelectedKey) {
    const inputs = popupBodyEl.querySelectorAll("input[data-k], select[data-k]");
    inputs.forEach((inp) => {
      const k = inp.dataset.k;
      if (mp[k]) {
        if (inp.dataset.role === "color") inp.value = mp[k].color;
        if (inp.dataset.role === "texture") inp.value = mp[k].texture;
      }
    });
  }
  saveMP(mp);
});

// --- Debug: seed de materiales via query string ---------------------------
// Sirve para probar texturas sin tener que tocar la UI.
// Uso: ?seed=madera, ?seed=ladrillo, ?seed=baldosa, ?seed=piedra, ?seed=marmol
// Aplica la textura al suelo y a todas las paredes (fachada).
if (params.get("seed")) {
  const t = params.get("seed");
  for (const key of MP_KEYS) {
    if (key.startsWith("wall:") || key.startsWith("door:") || key.startsWith("window:") || key.startsWith("hole:")
        || key === "suelo") {
      // Solo aplicar a la cara A (frontal) de paredes y al suelo.
      if (key.endsWith(":cara-a") || key === "suelo") {
        mp[key].texture = t;
        applyMPToMesh(key, mp[key]);
      }
    }
  }
  // Tambien actualizar el <select> del DOM para que el panel refleje
  // la nueva textura.
  for (const key of ["suelo", ...wallList.map(w => "wall:" + w.id + ":cara-a")]) {
    const inp = document.querySelector(`.mp-color[data-pid="${key}"]`);
    if (inp) {
      // El selector de textura esta en el mismo bloque; lo buscamos.
      const texInp = document.querySelector(`.mp-tex[data-pid="${key}"]`);
      if (texInp) texInp.value = mp[key]?.texture || "liso";
    }
  }
  saveMP(mp);
}
// --- Helpers ---------------------------------------------------------------
/**
 * Parsea un path SVG devolviendo TODOS los sub-paths.
 * Cada sub-path puede tener 2 puntos (linea) o N puntos (poligono).
 */
function parsePathDAll(d) {
  const tokens = [];
  const re = /([MLHVZmlhvz])|(-?\d+(?:\.\d+)?)/g;
  let m, lastCmd = null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      tokens.push(m[1]);
      lastCmd = m[1].toUpperCase();
    } else if (m[2]) {
      const v = parseFloat(m[2]);
      if (lastCmd === "M" || lastCmd === "L") {
        const v2 = parseFloat(re.exec(d)[0]);
        tokens.push(v, v2);
      } else if (lastCmd === "H") {
        tokens.push(v, "H_KEEP_Y");
      } else if (lastCmd === "V") {
        tokens.push("V_KEEP_X", v);
      }
    }
  }
  const subPaths = [];
  let current = [];
  let cx2 = 0, cy2 = 0;
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok === "string" && "MLHVZ".includes(tok)) {
      if (tok === "M" || tok === "L") {
        const x = tokens[++i];
        const y = tokens[++i];
        if (tok === "M") {
          if (current.length > 0) subPaths.push(current);
          current = [[x, y]];
        } else {
          current.push([x, y]);
        }
        cx2 = x; cy2 = y;
      } else if (tok === "H") {
        const x = tokens[++i];
        current.push([x, cy2]);
        cx2 = x;
      } else if (tok === "V") {
        const y = tokens[++i];
        current.push([cx2, y]);
        cy2 = y;
      } else if (tok === "Z") {
        if (current.length > 0) {
          // Solo empujar si es un poligono (>=3 puntos). Si tiene 2 puntos
          // y termina en Z, es una linea que se cierra (redundante).
          if (current.length >= 3) {
            const first = current[0];
            const last = current[current.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
              current.push([first[0], first[1]]);
            }
            subPaths.push(current);
          } else if (current.length === 2) {
            // linea M..L..Z: tratar como pared.
            subPaths.push(current);
          }
        }
        current = [];
      }
    } else if (typeof tok === "string" && (tok === "H_KEEP_Y" || tok === "V_KEEP_X")) {
      // No deberiamos llegar aqui en el flujo simplificado, pero por si acaso.
      i++;
    } else {
      // Numero sin comando: probablemente un parametro suelto. Saltar.
      i++;
    }
    i++;
  }
  if (current.length > 0) subPaths.push(current);
  return subPaths;
}

function parsePoints(s) {
  const nums = s.trim().split(/[\s,]+/).map(parseFloat);
  const out = [];
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function parseRect(r) {
  const x = parseFloat(r.getAttribute("x") || "0");
  const y = parseFloat(r.getAttribute("y") || "0");
  const w = parseFloat(r.getAttribute("width") || "0");
  const h = parseFloat(r.getAttribute("height") || "0");
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
}

// --- Sidebar open/close ----------------------------------------------------
// El sidebar empieza CERRADO. El usuario lo abre con el boton hamburguesa.
// Los colores y materiales se editan desde la ventana flotante (click en 3D).
function isMobile() { return innerWidth <= 720; }
function openSidebar() {
  document.body.classList.add("sidebar-open");
  syncStageSize();
}
function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  syncStageSize();
}
document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
  if (document.body.classList.contains("sidebar-open")) closeSidebar();
  else openSidebar();
});
document.getElementById("sidebar-close")?.addEventListener("click", closeSidebar);

// --- 8) Tema claro/oscuro --------------------------------------------------
// El usuario puede alternar entre el modo claro (sidebar claro, popup claro)
// y el modo oscuro (todo oscuro). Se guarda en localStorage.
const THEME_KEY = "vista3d-theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const iconDark = document.getElementById("theme-icon-dark");
  const iconLight = document.getElementById("theme-icon-light");
  if (iconDark && iconLight) {
    iconDark.style.display = theme === "dark" ? "" : "none";
    iconLight.style.display = theme === "light" ? "" : "none";
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}
function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  // Si no hay preferencia guardada, mirar prefers-color-scheme del sistema
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}
applyTheme(getInitialTheme());
document.getElementById("theme-toggle")?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(cur === "dark" ? "light" : "dark");
});

// Debug: estado del suelo al final (despues de seed)
if (params.get("seed") && suelo && suelo.material) {
  const mat = Array.isArray(suelo.material) ? suelo.material[0] : suelo.material;
  console.log("[post-seed] suelo mat[0].map:", mat && mat.map ? "YES" : "NO",
    "image-w:", mat && mat.map && mat.map.image && mat.map.image.width,
    "version:", mat && mat.map && mat.map.version,
    "needsUpdate:", mat && mat.map && mat.map.needsUpdate,
    "color:", mat && mat.color && mat.color.getHexString(),
    "repeat:", mat && mat.map && mat.map.repeat.x, mat && mat.map && mat.map.repeat.y);
  // Log de las paredes
  for (const [k, meshes] of (wallMeshLookup || new Map()).entries()) {
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      if (!mesh.material || !Array.isArray(mesh.material)) continue;
      const m0 = mesh.material[0];
      console.log("[post-seed wall]", k, "i=" + i,
        "mat0.map:", m0 && m0.map ? "YES" : "NO",
        "tex-repeat:", m0 && m0.map && m0.map.repeat.x, m0 && m0.map && m0.map.repeat.y,
        "color:", m0 && m0.color && m0.color.getHexString());
    }
  }
  // Forzar un re-render adicional después de 1 frame
  setTimeout(() => {
    const m2 = Array.isArray(suelo.material) ? suelo.material[0] : suelo.material;
    console.log("[post-seed+1s] suelo mat[0].map:", m2 && m2.map ? "YES" : "NO", "image:", m2 && m2.map && m2.map.image && m2.map.image.width);
  }, 1000);
}

// Test: ?threeColors=1 pone Cara A=rojo, B=azul, C=verde en la primera pared.
// Util para depurar: se ve la cara A desde el angulo de camara normal.
// Cara B (trasera) y Cara C (bordes) no se ven desde el angulo por defecto.
// Al hacer focus en un input de Cara B o Cara C, la camara se mueve
// automaticamente al angulo optimo para ver esa cara.
if (params.get("threeColors")) {
  setTimeout(() => {
    const firstWall = wallList[0];
    if (firstWall) {
      const mpCur = loadMP();
      mpCur[`wall:${firstWall.id}:cara-a`] = { color: "#ff0000", texture: "liso" };
      mpCur[`wall:${firstWall.id}:cara-b`] = { color: "#0000ff", texture: "liso" };
      mpCur[`wall:${firstWall.id}:cara-c`] = { color: "#00ff00", texture: "liso" };
      saveMP(mpCur);
      applyMPToMesh(`wall:${firstWall.id}:cara-a`, mpCur[`wall:${firstWall.id}:cara-a`]);
      applyMPToMesh(`wall:${firstWall.id}:cara-b`, mpCur[`wall:${firstWall.id}:cara-b`]);
      applyMPToMesh(`wall:${firstWall.id}:cara-c`, mpCur[`wall:${firstWall.id}:cara-c`]);
    }
  }, 1500);
}
