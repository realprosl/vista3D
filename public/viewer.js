/**
 * Visor 3D v0.3.0: extruye el contorno como SUELO fino, y dibuja cada
 * pared (exterior + interior) como un PLANO VERTICAL separado. Asi
 * se ven "las paredes" en lugar de "un cubo".
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

// --- 1) Cargar SVG ---------------------------------------------------------
let svgText;
try {
  const res = await fetch(`/api/svg/${id}`);
  if (!res.ok) throw new Error(`No se pudo cargar el SVG (HTTP ${res.status})`);
  svgText = await res.text();
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

const pathEl = svgEl.querySelector("path");
const polyEl = svgEl.querySelector("polygon");
const rectEl = svgEl.querySelector("rect");
const lineEls = Array.from(svgEl.querySelectorAll("line"));

let mainContour = [];
let interiorSegments = [];

if (pathEl) {
  const allContours = parsePathDAll(pathEl.getAttribute("d") || "");
  // El primer sub-path es el contorno principal.
  if (allContours.length === 0) {
    showError("El <path> no contiene puntos.");
    throw new Error("empty path");
  }
  mainContour = allContours[0];
  // Los sub-paths M..L (sin Z) son paredes interiores.
  for (let i = 1; i < allContours.length; i++) {
    const c = allContours[i];
    if (c.length === 2) {
      interiorSegments.push(c);
    } else if (c.length > 2) {
      // Path con varios segmentos M..L: cada par consecutivo es una pared.
      for (let j = 0; j < c.length - 1; j++) {
        interiorSegments.push([c[j], c[j + 1]]);
      }
    }
  }
} else if (polyEl) {
  mainContour = parsePoints(polyEl.getAttribute("points") || "");
} else if (rectEl) {
  mainContour = parseRect(rectEl);
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
const sueloMat = new THREE.MeshStandardMaterial({ color: 0xc4a988, roughness: 0.85 });
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
const exteriorGroup = new THREE.Group();
const interiorGroup = new THREE.Group();
const paredMat = new THREE.MeshStandardMaterial({
  color: 0xeee2cc,
  roughness: 0.9,
});

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

function buildWallMesh([x1, z1], [x2, z2]) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 1) return null;
  const geom = new THREE.BoxGeometry(len, alturaCm, grosorCm);
  // Centrar en Y (altura) para que la base toque el suelo.
  geom.translate(0, alturaCm / 2, 0);
  // Rotar para que X (largo) apunte a lo largo del segmento.
  const angle = Math.atan2(dz, dx);
  geom.rotateY(-angle);
  // Mover a la posicion final (punto medio del segmento en coords mundo).
  const midX = (x1 + x2) / 2 + widthCm / 2;
  const midZ = (z1 + z2) / 2 + heightCm / 2;
  geom.translate(midX, 0, midZ);
  const mesh = new THREE.Mesh(geom, paredMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

for (const seg of exteriorWalls) {
  const m = buildWallMesh(seg[0], seg[1]);
  if (m) exteriorGroup.add(m);
}
for (const seg of interiorWalls) {
  const m = buildWallMesh(seg[0], seg[1]);
  if (m) interiorGroup.add(m);
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
