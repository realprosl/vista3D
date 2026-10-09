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
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

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
try {
  // Probamos primero como proyecto: GET /api/projects/:id
  const metaRes = await fetch(`/api/projects/${id}`);
  if (metaRes.ok) {
    isProject = true;
    const [plantaRes, alzadosRes] = await Promise.all([
      fetch(`/api/projects/${id}/planta`),
      fetch(`/api/projects/${id}/alzados-meta`),
    ]);
    if (!plantaRes.ok) throw new Error(`No se pudo cargar la planta (HTTP ${plantaRes.status})`);
    svgText = await plantaRes.text();
    if (alzadosRes.ok) {
      const data = await alzadosRes.json();
      alzadosMeta = data.alzados || [];
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

// Elementos con clase semantica (v0.5.0). Si el SVG no las usa, fallback
// a la primera forma disponible (compatibilidad con SVGs antiguos).
const sueloEl = svgEl.querySelector('[class~="suelo"]')
  || svgEl.querySelector('[class*="suelo"]')
  || svgEl.querySelector("path")
  || svgEl.querySelector("polygon")
  || svgEl.querySelector("rect");
const paredEls = Array.from(svgEl.querySelectorAll('[class~="pared"], [class*="pared"]'));
const lineEls = paredEls.length > 0
  ? [] // si hay paredes con clase, no usamos <line> sueltos
  : Array.from(svgEl.querySelectorAll("line"));

// Si no hay paredes con clase pero hay <line>, los tratamos como paredes.
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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

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
const suelo = new THREE.Mesh(sueloGeom, sueloMat);
suelo.position.set(widthCm / 2, 0, heightCm / 2);
suelo.castShadow = true;
suelo.receiveShadow = true;
scene.add(suelo);

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
import { getTexture, listTextures } from "./textures.js";

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
  const mat = new THREE.MeshStandardMaterial({
    color: cfg.color,
    roughness: cfg.roughness ?? 0.8,
  });
  if (cfg.texture && cfg.texture !== "liso") {
    mat.map = getTexture(cfg.texture, cfg.color);
  }
  if (cfg.opacity != null) {
    mat.transparent = true;
    mat.opacity = cfg.opacity;
  }
  return mat;
}

const matCfg = readMaterialConfig();
const sueloMat = makeMaterial(matCfg.suelo);
const paredMat = makeMaterial(matCfg.pared);
const cristalMat = makeMaterial(matCfg.cristal);

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

// --- 6a) Emparejar alzados con paredes -------------------------------------
// Calculamos las 4 paredes exteriores del bounding box rectangular del
// contorno, y buscamos el alzado que coincida con cada una por
// (data-wall, data-wall-width) y por la longitud real de la pared.
function wallLength([x1, z1], [x2, z2]) {
  return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
}
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
const paredesInfo = []; // Array<{ wall: 'N'|'S'|'E'|'W', seg: [[x1,z1],[x2,z2]], len, apertures }>
for (const seg of exteriorWalls) {
  const [[x1, z1], [x2, z2]] = seg;
  const len = wallLength(seg[0], seg[1]);
  const isHoriz = Math.abs(z2 - z1) < 0.5;
  let wall = null;
  if (isHoriz) {
    // Horizontal: el lado con y mas baja es N (en SVG, y crece hacia abajo,
    // asi que y=minY es el norte visual, y=maxY es el sur visual).
    const y = (z1 + z2) / 2;
    wall = y < (minY + maxY) / 2 ? "N" : "S";
  } else {
    const x = (x1 + x2) / 2;
    wall = x < (minX + maxX) / 2 ? "W" : "E";
  }
  // Buscar alzado que coincida con esta pared.
  let apertures = [];
  for (const a of alzadosMeta) {
    const meta = a.meta;
    if (meta.wall === wall && meta.wallWidthCm != null) {
      // Coincidencia por wall y wallWidthCm.
      if (Math.abs(meta.wallWidthCm - len) < 5) {
        apertures = meta.apertures;
        break;
      }
    } else if (meta.wall === wall && Math.abs(meta.widthCm - len) < 5) {
      // Fallback: wall coincide y width del viewBox coincide.
      apertures = meta.apertures;
      break;
    }
  }
  paredesInfo.push({ wall, seg, len, apertures });
}

// --- 6b) Construir meshes de pared (con aperturas) -------------------------
// Las paredes se renderizan con sus aperturas como "holes" del Shape 2D
// (ver buildWallMesh), asi el hueco esta VACIO y se ve desde cualquier
// lado. Para las ventanas (cristal semitransparente) anadimos ademas un
// panel fino en el hueco para que se vea el color del cristal. Las
// puertas no llevan panel: el hueco se ve vacio.
const apertureGroup = new THREE.Group(); // solo los cristales de las ventanas
for (const info of paredesInfo) {
  const meshes = buildWallMesh(info.seg[0], info.seg[1], info.apertures);
  for (const m of meshes) exteriorGroup.add(m);
  // Renderizar SOLO los cristales de las ventanas (no las puertas).
  // Las puertas dejan el hueco vacio para que se vea el interior/exterior.
  const [[x1, z1], [x2, z2]] = info.seg;
  const angle = Math.atan2(z2 - z1, x2 - x1);
  const len = info.len;
  const midX = (x1 + x2) / 2 + widthCm / 2;
  const midZ = (z1 + z2) / 2 + heightCm / 2;
  for (const a of info.apertures) {
    if (a.kind !== "window") continue; // puertas: hueco vacio, sin panel
    // Usamos el material configurado (incluye color + textura procedural).
    const mat = cristalMat.clone();
    const cx = a.xCm + a.widthCm / 2 - len / 2;
    const cy = a.yCm + a.heightCm / 2;
    // Panel fino (2cm) centrado en el plano de la pared.
    const geom = new THREE.BoxGeometry(a.widthCm, a.heightCm, 2);
    geom.translate(0, cy, 0);
    geom.rotateY(-angle);
    geom.translate(midX + cx * Math.cos(angle), 0, midZ + cx * Math.sin(angle));
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    apertureGroup.add(m);
  }
}
scene.add(apertureGroup);

// --- 6c) Toggle de cristales de ventanas ----------------------------------
// Las puertas siempre se ven (hueco vacio en la pared). El toggle solo
// afecta a los cristales de las ventanas: si esta OFF, las ventanas se
// ven como huecos vacios igual que las puertas; si esta ON, los
// cristales aparecen.
const toggleAperturesBtn = document.getElementById("toggle-apertures");
if (toggleAperturesBtn) {
  // El titulo refleja lo que hace realmente.
  toggleAperturesBtn.title = "Mostrar u ocultar el cristal de las ventanas";
  toggleAperturesBtn.querySelector("span").textContent = "Cristales ventanas";
  toggleAperturesBtn.addEventListener("click", () => {
    const isOn = toggleAperturesBtn.classList.toggle("on");
    apertureGroup.visible = isOn;
  });
}
if (apertureGroup.children.length === 0) {
  if (toggleAperturesBtn) {
    toggleAperturesBtn.style.opacity = "0.4";
    toggleAperturesBtn.title = "Este proyecto no tiene ventanas con cristal";
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

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

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
