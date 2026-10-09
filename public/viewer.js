/**
 * Visor 3D: toma un SVG, extrae el contorno principal, lo extruye y lo
 * muestra con OrbitControls. Sin React, sin Vite, sin npm install en
 * el cliente: Three.js viene de unpkg via importmap.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// --- Estado ----------------------------------------------------------------
const id = location.pathname.split("/").pop(); // /v/<id>
let alturaCm = 250; // default, se actualiza desde query si existe
const params = new URLSearchParams(location.search);
if (params.has("alturaCm")) {
  const v = parseFloat(params.get("alturaCm") || "250");
  if (!isNaN(v) && v > 0) alturaCm = v;
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
const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
const svgEl = doc.documentElement;

const pathEl = svgEl.querySelector("path");
const polyEl = svgEl.querySelector("polygon");
const rectEl = svgEl.querySelector("rect");

let points = [];
if (pathEl) {
  // Parsear d= con regex simple (M, L, H, V, Z). Suficiente para v1.
  points = parsePathD(pathEl.getAttribute("d") || "");
} else if (polyEl) {
  points = parsePoints(polyEl.getAttribute("points") || "");
} else if (rectEl) {
  points = parseRect(rectEl);
} else {
  showError("El SVG no contiene <path>, <polygon> ni <rect>.");
  throw new Error("no shape");
}

if (points.length < 3) {
  showError("El contorno del SVG tiene menos de 3 puntos. No se puede extruir.");
  throw new Error("too few points");
}

// --- 3) Bounds (info) ------------------------------------------------------
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const [x, y] of points) {
  if (x < minX) minX = x; if (y < minY) minY = y;
  if (x > maxX) maxX = x; if (y > maxY) maxY = y;
}
const widthCm = Math.round(maxX - minX);
const heightCm = Math.round(maxY - minY);
dimsEl.innerHTML = `Plano: <strong>${widthCm}</strong> x <strong>${heightCm}</strong> cm (extrusion: <strong>${alturaCm}</strong> cm)`;

// --- 4) Three.js setup -----------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef2f7);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 50000);
const maxDim = Math.max(widthCm, heightCm, alturaCm);
camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.5);
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

// Suelo (plano) con grid
const groundSize = maxDim * 3;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(widthCm / 2, 0, heightCm / 2);
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(groundSize, 40, 0x999, 0xccc);
grid.position.set(widthCm / 2, 0.5, heightCm / 2);
scene.add(grid);

// Ejes
const axes = new THREE.AxesHelper(maxDim * 0.3);
axes.position.set(0, 1, 0);
scene.add(axes);

// --- 5) Construir el contorno 2D (THREE.Shape) -----------------------------
// Centramos el contorno en (0,0) y mapeamos SVG y -> z (porque Three es XZ-suelo, Y-arriba).
const shape = new THREE.Shape();
const cx = (minX + maxX) / 2;
const cz = (minY + maxY) / 2;
shape.moveTo(points[0][0] - cx, points[0][1] - cz);
for (let i = 1; i < points.length; i++) {
  shape.lineTo(points[i][0] - cx, points[i][1] - cz);
}
shape.closePath();

const extrudeSettings = {
  depth: alturaCm,
  bevelEnabled: true,
  bevelThickness: 2,
  bevelSize: 2,
  bevelSegments: 2,
};
const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

// ExtrudeGeometry extruye en Z. Rotamos para que la extrusion sea en Y (arriba).
geometry.rotateX(-Math.PI / 2);

const material = new THREE.MeshStandardMaterial({
  color: 0xd4a574,
  roughness: 0.7,
  metalness: 0.1,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.castShadow = true;
mesh.receiveShadow = true;
// Posicionar para que la base toque el suelo.
mesh.position.set(widthCm / 2, 0, heightCm / 2);
scene.add(mesh);

// Borde (edges) para que se vean las aristas
const edges = new THREE.EdgesGeometry(geometry);
const lineMaterial = new THREE.LineBasicMaterial({ color: 0x222 });
const lines = new THREE.LineSegments(edges, lineMaterial);
lines.position.copy(mesh.position);
scene.add(lines);

// --- 6) Controles + render loop -------------------------------------------
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
function parsePathD(d) {
  const out = [];
  const re = /([MLHVZmlhvz])|(-?\d+(?:\.\d+)?)/g;
  let m, lastCmd = null;
  let cx2 = 0, cy2 = 0;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) {
      lastCmd = m[1].toUpperCase();
      if (lastCmd === "Z") {
        if (out.length) out.push([out[0][0], out[0][1]]);
      }
    } else if (m[2]) {
      const v = parseFloat(m[2]);
      if (lastCmd === "M" || lastCmd === "L") {
        if (lastCmd === "L" || out.length) {
          const v2 = parseFloat(re.exec(d)[0]);
          out.push([v, v2]);
          cx2 = v; cy2 = v2;
        } else {
          out.push([v, 0]); // M, se ignora el Y del match
          cx2 = v; cy2 = 0;
        }
      } else if (lastCmd === "H") {
        cx2 = v;
        out.push([cx2, cy2]);
      } else if (lastCmd === "V") {
        cy2 = v;
        out.push([cx2, cy2]);
      }
    }
  }
  return out;
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
