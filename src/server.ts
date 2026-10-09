/**
 * Server: Express + endpoints.
 *
 * Endpoints:
 *   GET  /                  -> index.html (formulario de upload)
 *   GET  /v/:id             -> view.html (visor 3D del SVG con id)
 *   POST /upload            -> recibe un SVG, devuelve un id de comparticion
 *   GET  /api/svg/:id       -> devuelve el SVG raw para que el viewer lo parsee
 *   GET  /public/*          -> archivos estaticos
 *
 * Comparir: cada upload genera un id (uuid v4) y se guarda en
 * uploads/<id>/svg.svg. La URL para compartir es /v/<id>.
 */
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { parseSvg, contourBounds } from "./svg-to-3d";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = resolve(__dirname, "..");
const UPLOADS = join(ROOT, "uploads");
const PUBLIC = join(ROOT, "public");

mkdirSync(UPLOADS, { recursive: true });

const app = express();

// Multer: guardar el SVG en memoria (es pequeno), validamos tipo y tamanyo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (ext === ".svg" || file.mimetype === "image/svg+xml") {
      cb(null, true);
    } else {
      cb(new Error("Solo se aceptan archivos .svg"));
    }
  },
});

/** Sirve index.html en /. */
app.get("/", (_req, res) => {
  res.sendFile(join(PUBLIC, "index.html"));
});

/** Sirve el viewer 3D. */
app.get("/v/:id", (req, res) => {
  const id = req.params.id;
  const svgPath = join(UPLOADS, id, "svg.svg");
  if (!existsSync(svgPath)) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>No encontrado</title></head>
      <body style="font-family: sans-serif; padding: 40px; max-width: 600px; margin: 0 auto;">
        <h1>Plano no encontrado</h1>
        <p>El identificador <code>${id}</code> no existe o fue borrado.</p>
        <p><a href="/">Volver al inicio</a></p>
      </body></html>
    `);
    return;
  }
  res.sendFile(join(PUBLIC, "view.html"));
});

/** Devuelve el SVG raw para que el viewer lo parsee en el cliente. */
app.get("/api/svg/:id", (req, res) => {
  const id = req.params.id;
  // Evitar path traversal: solo [a-zA-Z0-9-] permitidos.
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const svgPath = join(UPLOADS, id, "svg.svg");
  if (!existsSync(svgPath)) {
    res.status(404).json({ error: "Plano no encontrado" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(readFileSync(svgPath));
});

/** Endpoint principal: subir un SVG, devuelve id + metadatos. */
app.post("/upload", upload.single("svg"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No se recibio ningun archivo" });
    return;
  }
  const content = req.file.buffer.toString("utf-8");

  // Validar que se puede parsear.
  let parseResult;
  try {
    parseResult = parseSvg(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: `SVG invalido: ${msg}` });
    return;
  }

  // Validar altura: si el body tiene un campo "alturaCm" parsearlo.
  let alturaCm = 250; // default 2.5m
  if (req.body && req.body.alturaCm) {
    const parsed = parseFloat(req.body.alturaCm);
    if (!isNaN(parsed) && parsed > 0 && parsed < 10000) {
      alturaCm = parsed;
    }
  }

  // Generar id y guardar.
  const id = randomUUID();
  const dir = join(UPLOADS, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "svg.svg"), content, "utf-8");

  // Bounds en cm (asumimos viewBox en cm; si no, en px = cm para v1).
  const mainContour = parseResult.contours[0];
  const bounds = contourBounds(mainContour);
  const widthCm = Math.round(bounds.maxX - bounds.minX);
  const heightCm = Math.round(bounds.maxY - bounds.minY);

  res.json({
    id,
    viewUrl: `/v/${id}`,
    apiUrl: `/api/svg/${id}`,
    heightCm: alturaCm,
    bounds: { widthCm, heightCm },
    contourCount: parseResult.contours.length,
  });
});

/** Borra un plano por id. */
function deleteSvg(id: string): boolean {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return false;
  const dir = join(UPLOADS, id);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

/** Devuelve la lista de planos subidos. */
app.get("/api/list", (_req, res) => {
  if (!existsSync(UPLOADS)) {
    res.json({ planos: [] });
    return;
  }
  const entries = readdirSync(UPLOADS);
  const planos = [];
  for (const entry of entries) {
    if (entry === ".gitkeep") continue;
    const svgPath = join(UPLOADS, entry, "svg.svg");
    if (!existsSync(svgPath)) continue;
    try {
      const stat = statSync(join(UPLOADS, entry));
      const content = readFileSync(svgPath, "utf-8");
      const parseResult = parseSvg(content);
      const main = parseResult.contours[0];
      const bounds = contourBounds(main);
      planos.push({
        id: entry,
        viewUrl: `/v/${entry}`,
        createdAt: stat.mtime.toISOString(),
        widthCm: Math.round(bounds.maxX - bounds.minX),
        heightCm: Math.round(bounds.maxY - bounds.minY),
      });
    } catch {
      // Si el SVG no parsea, lo saltamos.
    }
  }
  // Mas recientes primero.
  planos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ planos });
});

/** Borra un plano por id. */
app.delete("/api/svg/:id", (req, res) => {
  const ok = deleteSvg(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "Plano no encontrado o id invalido" });
    return;
  }
  res.json({ status: "deleted", id: req.params.id });
});

/** Archivos estaticos (CSS, JS, three.js local si lo hubiera). */
app.use("/public", express.static(PUBLIC));

/** Multer / errores genericos. */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`vista3D server en http://${HOST}:${PORT}`);
  console.log(`  - Subir:  POST /upload (multipart/form-data, campo "svg")`);
  console.log(`  - Ver:    GET  /v/<id>`);
});
