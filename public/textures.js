/**
 * Generador de texturas procedurales para el visor 3D.
 *
 * Crea THREE.Texture a partir de un canvas 2D pintado con un patrón
 * configurable. Cada textura se construye on-the-fly (no se descarga
 * nada de internet) y se cachea para no regenerarla si se llama dos
 * veces con los mismos parámetros.
 *
 * Texturas disponibles:
 *   - "liso":     color uniforme.
 *   - "madera":   vetas verticales con nudos.
 *   - "baldosa":  cuadrícula con lechada.
 *   - "ladrillo": pattern ladrillo visto.
 *   - "marmol":   veteado suave claro/oscuro.
 *   - "piedra":   pattern aleatorio gris.
 *
 * Uso:
 *   import { getTexture } from "./textures";
 *   const tex = getTexture("madera", 0xb88a5e, 256, 256);
 *   const mat = new THREE.MeshStandardMaterial({ map: tex, ... });
 */

import * as THREE from "three";

const cache = new Map<string, THREE.Texture>();

function cacheKey(kind: string, color: number, w: number, h: number) {
  return `${kind}:${color.toString(16)}:${w}x${h}`;
}

export function getTexture(
  kind: string,
  baseColor: number = 0xc4a988,
  w: number = 256,
  h: number = 256,
): THREE.Texture {
  const key = cacheKey(kind, baseColor, w, h);
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const baseHex = "#" + baseColor.toString(16).padStart(6, "0");
  const lightHex = lighten(baseColor, 0.15);
  const darkHex = darken(baseColor, 0.20);

  switch (kind) {
    case "liso":
      paintSolid(ctx, w, h, baseHex);
      break;
    case "madera":
      paintMadera(ctx, w, h, baseHex, lightHex, darkHex);
      break;
    case "baldosa":
      paintBaldosa(ctx, w, h, baseHex, lightHex, darkHex);
      break;
    case "ladrillo":
      paintLadrillo(ctx, w, h, baseHex, darkHex);
      break;
    case "marmol":
      paintMarmol(ctx, w, h, baseHex, lightHex);
      break;
    case "piedra":
      paintPiedra(ctx, w, h, baseHex, lightHex, darkHex);
      break;
    default:
      paintSolid(ctx, w, h, baseHex);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Repetimos para que las texturas se vean a una escala razonable
  // cuando se aplican a superficies grandes (suelo, paredes).
  tex.repeat.set(4, 2);
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

export function listTextures(): string[] {
  return ["liso", "madera", "baldosa", "ladrillo", "marmol", "piedra"];
}

// --- Helpers de color ------------------------------------------------------
function clamp(n: number) { return Math.max(0, Math.min(255, n)); }
function hex(n: number) { return "#" + n.toString(16).padStart(6, "0"); }
function lighten(c: number, t: number) {
  const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return ((clamp(r + (255 - r) * t) << 16) | (clamp(g + (255 - g) * t) << 8) | clamp(b + (255 - b) * t)) >>> 0;
}
function darken(c: number, t: number) {
  const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return ((clamp(r * (1 - t)) << 16) | (clamp(g * (1 - t)) << 8) | clamp(b * (1 - t))) >>> 0;
}

// --- Pintores --------------------------------------------------------------
function paintSolid(ctx: CanvasRenderingContext2D, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, w, h);
}

function paintMadera(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, light: string, dark: string) {
  // Fondo base
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Vetas verticales
  for (let x = 0; x < w; x += 2) {
    const noise = Math.sin(x * 0.05) * 0.5 + Math.sin(x * 0.13) * 0.3;
    const c = noise > 0 ? light : dark;
    ctx.fillStyle = c;
    ctx.globalAlpha = Math.abs(noise) * 0.4;
    ctx.fillRect(x, 0, 1, h);
  }
  ctx.globalAlpha = 1;
  // Nudos
  const nudos = 4;
  for (let i = 0; i < nudos; i++) {
    const x = (i + 0.5) * (w / nudos) + (Math.random() - 0.5) * 20;
    const y = Math.random() * h;
    const r = 4 + Math.random() * 4;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, dark);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintBaldosa(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, _light: string, dark: string) {
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);
  const tileSize = 32;
  for (let y = 0; y < h; y += tileSize) {
    for (let x = 0; x < w; x += tileSize) {
      const offset = (Math.floor(y / tileSize) % 2) * (tileSize / 2);
      const xa = x + offset;
      // Variacion aleatoria sutil de color
      const variacion = 0.95 + Math.random() * 0.1;
      ctx.fillStyle = withAlpha(base, variacion);
      ctx.fillRect(xa + 1, y + 1, tileSize - 2, tileSize - 2);
    }
  }
}

function paintLadrillo(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, dark: string) {
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, w, h);
  const bh = 14; // alto de cada ladrillo
  const bw = 30; // ancho de cada ladrillo
  for (let y = 0; y < h; y += bh + 2) {
    const offset = (Math.floor(y / (bh + 2)) % 2) * (bw / 2);
    for (let x = -bw; x < w + bw; x += bw + 2) {
      const xa = x + offset;
      const variacion = 0.9 + Math.random() * 0.15;
      ctx.fillStyle = withAlpha(base, variacion);
      ctx.fillRect(xa, y, bw, bh);
    }
  }
}

function paintMarmol(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, light: string) {
  // Fondo base
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Veteado
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = light;
    ctx.globalAlpha = 0.2 + Math.random() * 0.3;
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    let x = Math.random() * w;
    let y = Math.random() * h;
    ctx.moveTo(x, y);
    for (let j = 0; j < 20; j++) {
      x += (Math.random() - 0.5) * 30;
      y += (Math.random() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintPiedra(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, _light: string, dark: string) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const stones = 50;
  for (let i = 0; i < stones; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 6 + Math.random() * 16;
    const c = Math.random() < 0.5 ? base : dark;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function withAlpha(hexColor: string, factor: number): string {
  // Multiplica el brillo de un color hex por un factor.
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return hex(((clamp(r * factor) << 16) | (clamp(g * factor) << 8) | clamp(b * factor)) >>> 0);
}
