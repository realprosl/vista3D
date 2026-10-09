/**
 * Server: Express + endpoints.
 *
 * Modelo v0.4.0: PROYECTOS. Un proyecto es 1 planta + N alzados.
 *
 * Estructura en disco:
 *   uploads/projects/<projectId>/
 *     meta.json         { name, createdAt, alturaCm }
 *     planta.svg        SVG de la planta
 *     alzados/
 *       <name>.svg      SVG de cada alzado
 *
 * Endpoints:
 *   POST /api/projects                 Crea un proyecto (multipart)
 *   GET  /api/projects                 Lista proyectos
 *   GET  /api/projects/:id             Detalle de un proyecto
 *   DELETE /api/projects/:id           Borra un proyecto
 *   GET  /api/projects/:id/planta      SVG raw de la planta
 *   GET  /api/projects/:id/alzados/:n  SVG raw de un alzado
 *   GET  /v/:id                        Visor 3D del proyecto
 *
 * Endpoints legacy (v0.1-v0.3, planos sueltos). Deprecated: se mantienen
 * funcionando para no romper enlaces viejos, pero la UI v0.4.0 ya no los usa.
 *   GET  /api/list                     Lista planos sueltos
 *   POST /upload                       Sube un plano suelto
 *   GET  /api/svg/:id                  SVG raw de plano suelto
 *   DELETE /api/svg/:id                Borra plano suelto
 *   GET  /v/:id                        Sirve view.html (id de proyecto O plano suelto)
 */
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve, extname } from "node:path";
import { parseSvg, parseSvgElements, contourBounds } from "./svg-to-3d";
import { parseElevation, parseElevationElements, type ElevationMeta } from "./svg-elevations";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = resolve(__dirname, "..");
const UPLOADS = join(ROOT, "uploads");
const PROJECTS = join(UPLOADS, "projects");
const PUBLIC = join(ROOT, "public");

mkdirSync(UPLOADS, { recursive: true });
mkdirSync(PROJECTS, { recursive: true });

const app = express();

// Multer: SVGs en memoria (5 MB max). Acepta multiples archivos.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (ext === ".svg" || file.mimetype === "image/svg+xml") {
      cb(null, true);
    } else {
      cb(new Error("Solo se aceptan archivos .svg"));
    }
  },
});

/** Index. */
app.get("/", (_req, res) => {
  res.sendFile(join(PUBLIC, "index.html"));
});

/** Visor 3D. Acepta tanto id de proyecto como id de plano suelto (legacy). */
app.get("/v/:id", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).send("Identificador invalido");
    return;
  }
  // Detectar si es proyecto o plano suelto.
  const projectPath = join(PROJECTS, id, "planta.svg");
  const legacyPath = join(UPLOADS, id, "svg.svg");
  const exists = existsSync(projectPath) || existsSync(legacyPath);
  if (!exists) {
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

// =============================================================================
// PROYECTOS (v0.4.0)
// =============================================================================

/** Sanitiza el nombre de un alzado (sin extension, solo [a-z0-9-_]). */
function sanitizeName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  return base.replace(/[^a-z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "alzado";
}

/** POST /api/projects
 *  multipart/form-data:
 *    - planta: 1 archivo SVG (la planta)
 *    - alzados: 0..N archivos SVG (los alzados)
 *    - name (campo texto): nombre del proyecto
 *    - alturaCm (campo texto): altura de extrusion en cm
 */
app.post("/api/projects", upload.fields([
  { name: "planta", maxCount: 1 },
  { name: "alzados", maxCount: 20 },
]), (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (!files || !files.planta || !files.planta[0]) {
    res.status(400).json({ error: "Falta el archivo 'planta' (SVG de la planta)" });
    return;
  }
  const plantaFile = files.planta[0];
  const alzadosFiles = files.alzados || [];
  if (alzadosFiles.length === 0) {
    res.status(400).json({ error: "Sube al menos un alzado (campo 'alzados')" });
    return;
  }

  // Validar la planta.
  const plantaContent = plantaFile.buffer.toString("utf-8");
  let plantaBounds;
  try {
    const result = parseSvg(plantaContent);
    const main = result.contours[0];
    const b = contourBounds(main);
    plantaBounds = {
      widthCm: Math.round(b.maxX - b.minX),
      heightCm: Math.round(b.maxY - b.minY),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: `Planta invalida: ${msg}` });
    return;
  }

  // Validar cada alzado.
  const alzadosMeta: { name: string; originalName: string; bytes: number }[] = [];
  for (const f of alzadosFiles) {
    const content = f.buffer.toString("utf-8");
    try {
      parseSvg(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: `Alzado '${f.originalname}' invalido: ${msg}` });
      return;
    }
    const name = sanitizeName(f.originalname);
    alzadosMeta.push({ name, originalName: f.originalname, bytes: f.size });
  }

  // Altura (default 250 cm).
  let alturaCm = 250;
  if (req.body && req.body.alturaCm) {
    const parsed = parseFloat(req.body.alturaCm);
    if (!isNaN(parsed) && parsed > 0 && parsed < 10000) {
      alturaCm = parsed;
    }
  }
  // Nombre del proyecto.
  const projectName = (req.body?.name || "").trim() || `Proyecto ${new Date().toLocaleDateString("es-ES")}`;

  // Generar id y guardar todo.
  const projectId = randomUUID();
  const projectDir = join(PROJECTS, projectId);
  const alzadosDir = join(projectDir, "alzados");
  mkdirSync(alzadosDir, { recursive: true });

  writeFileSync(join(projectDir, "planta.svg"), plantaContent, "utf-8");
  for (let i = 0; i < alzadosFiles.length; i++) {
    const f = alzadosFiles[i];
    const meta = alzadosMeta[i];
    writeFileSync(join(alzadosDir, `${meta.name}.svg`), f.buffer.toString("utf-8"), "utf-8");
  }

  const meta = {
    id: projectId,
    name: projectName,
    createdAt: new Date().toISOString(),
    alturaCm,
    planta: { ...plantaBounds, originalName: plantaFile.originalname, bytes: plantaFile.size },
    alzados: alzadosMeta,
  };
  writeFileSync(join(projectDir, "meta.json"), JSON.stringify(meta, null, 2), "utf-8");

  res.json({
    id: projectId,
    name: projectName,
    viewUrl: `/v/${projectId}`,
    planta: meta.planta,
    alturaCm,
    alzados: alzadosMeta,
  });
});

/** GET /api/projects — lista todos los proyectos. */
app.get("/api/projects", (_req, res) => {
  if (!existsSync(PROJECTS)) {
    res.json({ projects: [] });
    return;
  }
  const entries = readdirSync(PROJECTS);
  const projects = [];
  for (const entry of entries) {
    const metaPath = join(PROJECTS, entry, "meta.json");
    if (!existsSync(metaPath)) continue;
    try {
      const stat = statSync(join(PROJECTS, entry));
      const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
      projects.push({
        id: meta.id,
        name: meta.name,
        viewUrl: `/v/${meta.id}`,
        createdAt: meta.createdAt,
        alturaCm: meta.alturaCm,
        planta: meta.planta,
        alzadosCount: (meta.alzados || []).length,
      });
    } catch {
      // Si meta.json no parsea, lo saltamos.
    }
  }
  // El statSync sobreescribe createdAt con mtime si fue modificado.
  projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ projects });
});

/** GET /api/projects/:id — detalle completo de un proyecto. */
app.get("/api/projects/:id", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const metaPath = join(PROJECTS, id, "meta.json");
  if (!existsSync(metaPath)) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    res.json(meta);
  } catch {
    res.status(500).json({ error: "meta.json corrupto" });
  }
});

/** GET /api/projects/:id/planta — SVG raw de la planta. */
app.get("/api/projects/:id/planta", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const path = join(PROJECTS, id, "planta.svg");
  if (!existsSync(path)) {
    res.status(404).json({ error: "Planta no encontrada" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(readFileSync(path));
});

/**
 * GET /api/projects/:id/elements — devuelve TODOS los elementos del
 * proyecto (planta + alzados) con sus metadatos data-*. El visor 3D
 * lo consume para construir el panel de materiales con nombres reales
 * y agrupar por habitación.
 *
 * Salida:
 *   {
 *     viewBox: { width, height },
 *     suelo: ElementSvg | null,
 *     paredes: ElementSvg[],
 *     aperturasPlanta: ElementSvg[],   // aperturas definidas en la planta
 *     extras: ElementSvg[],            // muebles, etiquetas, cotas de la planta
 *     alzados: {                       // mapa wallId -> datos del alzado
 *       "wall-north": { widthCm, heightCm, wallWidthCm, apertures: [...] },
 *       ...
 *     }
 *   }
 *
 * Vinculacion planta <-> alzado: el data-id de cada pared en la planta
 * debe coincidir con el data-wall-id del <svg> raiz del alzado.
 */
app.get("/api/projects/:id/elements", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const plantaPath = join(PROJECTS, id, "planta.svg");
  if (!existsSync(plantaPath)) {
    res.status(404).json({ error: "Planta no encontrada" });
    return;
  }
  let plantaElements;
  try {
    plantaElements = parseSvgElements(readFileSync(plantaPath, "utf-8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Error parseando planta: ${msg}` });
    return;
  }

  // Parsear todos los alzados.
  const alzadosDir = join(PROJECTS, id, "alzados");
  const alzados: Record<string, {
    widthCm: number;
    heightCm: number;
    wallWidthCm: number | null;
    viewBox: { x: number; y: number; width: number; height: number } | null;
    apertures: Array<{
      id: string;
      name: string | null;
      group: string;
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
    }>;
  }> = {};
  if (existsSync(alzadosDir)) {
    const files = readdirSync(alzadosDir).filter((f: string) => f.endsWith(".svg"));
    for (const f of files) {
      try {
        const elev = parseElevationElements(readFileSync(join(alzadosDir, f), "utf-8"));
        // La clave del mapa es el wallId del alzado (preferente) o el nombre
        // del archivo sin extension si no tiene wallId.
        const key = elev.wallId || f.replace(/\.svg$/, "");
        alzados[key] = {
          widthCm: elev.widthCm,
          heightCm: elev.heightCm,
          wallWidthCm: elev.wallWidthCm,
          viewBox: elev.viewBox,
          apertures: elev.apertures,
        };
      } catch {
        // Alzado malformado: lo saltamos.
      }
    }
  }

  res.json({
    viewBox: plantaElements.viewBox,
    suelo: plantaElements.suelo,
    paredes: plantaElements.paredes,
    aperturasPlanta: plantaElements.aperturas,
    extras: plantaElements.extras,
    alzados,
  });
});

/**
 * GET /api/projects/:id/alzados-meta — lista los alzados parseados
 * con sus aperturas (puertas/ventanas). El visor 3D lo consume para
 * renderizar las aperturas en las paredes correspondientes.
 */
app.get("/api/projects/:id/alzados-meta", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const dir = join(PROJECTS, id, "alzados");
  if (!existsSync(dir)) {
    res.json({ alzados: [] });
    return;
  }
  const files: string[] = readdirSync(dir).filter((f: string) => f.endsWith(".svg"));
  const out: Array<{ name: string; meta: ElevationMeta }> = [];
  for (const f of files) {
    const name = f.replace(/\.svg$/, "");
    try {
      const meta = parseElevation(readFileSync(join(dir, f), "utf-8"));
      out.push({ name, meta });
    } catch {
      // Alzado malformado: lo saltamos pero seguimos con los demas.
      out.push({ name, meta: { wall: null, wallWidthCm: null, widthCm: 0, heightCm: 0, apertures: [] } });
    }
  }
  res.json({ alzados: out });
});

/** GET /api/projects/:id/alzados/:name — SVG raw de un alzado. */
app.get("/api/projects/:id/alzados/:name", (req, res) => {
  const { id, name } = req.params;
  if (!/^[a-zA-Z0-9-]+$/.test(id) || !/^[a-zA-Z0-9-_]+$/.test(name)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const path = join(PROJECTS, id, "alzados", `${name}.svg`);
  if (!existsSync(path)) {
    res.status(404).json({ error: "Alzado no encontrado" });
    return;
  }
  res.setHeader("Content-Type", "image/svg+xml");
  res.send(readFileSync(path));
});

/** DELETE /api/projects/:id — borra un proyecto. */
app.delete("/api/projects/:id", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const dir = join(PROJECTS, id);
  if (!existsSync(dir)) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }
  rmSync(dir, { recursive: true, force: true });
  res.json({ status: "deleted", id });
});

// =============================================================================
// LEGACY: PLANOS SUELTOS (v0.1-v0.3)
// Deprecated, se mantienen para no romper enlaces viejos. La UI v0.4.0 ya
// no los usa.
// =============================================================================

/** POST /upload (legacy). Sube un SVG como plano suelto. */
app.post("/upload", upload.single("svg"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No se recibio ningun archivo" });
    return;
  }
  const content = req.file.buffer.toString("utf-8");
  let parseResult;
  try {
    parseResult = parseSvg(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: `SVG invalido: ${msg}` });
    return;
  }
  let alturaCm = 250;
  if (req.body && req.body.alturaCm) {
    const parsed = parseFloat(req.body.alturaCm);
    if (!isNaN(parsed) && parsed > 0 && parsed < 10000) alturaCm = parsed;
  }
  const id = randomUUID();
  const dir = join(UPLOADS, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "svg.svg"), content, "utf-8");
  const mainContour = parseResult.contours[0];
  const bounds = contourBounds(mainContour);
  res.json({
    id,
    viewUrl: `/v/${id}`,
    apiUrl: `/api/svg/${id}`,
    heightCm: alturaCm,
    bounds: { widthCm: Math.round(bounds.maxX - bounds.minX), heightCm: Math.round(bounds.maxY - bounds.minY) },
    contourCount: parseResult.contours.length,
    deprecated: "v0.4.0: usa POST /api/projects para subir planta + alzados",
  });
});

/** GET /api/svg/:id (legacy). SVG raw de plano suelto. */
app.get("/api/svg/:id", (req, res) => {
  const id = req.params.id;
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

/** GET /api/list (legacy). Lista planos sueltos. */
app.get("/api/list", (_req, res) => {
  if (!existsSync(UPLOADS)) {
    res.json({ planos: [] });
    return;
  }
  const entries = readdirSync(UPLOADS);
  const planos = [];
  for (const entry of entries) {
    if (entry === "projects" || entry === ".gitkeep") continue;
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
        deprecated: "v0.4.0: usa /api/projects",
      });
    } catch {
      // Skip
    }
  }
  planos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ planos });
});

/** DELETE /api/svg/:id (legacy). Borra plano suelto. */
app.delete("/api/svg/:id", (req, res) => {
  const id = req.params.id;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    res.status(400).json({ error: "Identificador invalido" });
    return;
  }
  const dir = join(UPLOADS, id);
  if (!existsSync(dir)) {
    res.status(404).json({ error: "Plano no encontrado o id invalido" });
    return;
  }
  rmSync(dir, { recursive: true, force: true });
  res.json({ status: "deleted", id, deprecated: "v0.4.0: usa DELETE /api/projects/:id" });
});

// =============================================================================
// STATIC + ERROR HANDLER
// =============================================================================
app.use("/public", express.static(PUBLIC));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`vista3D server en http://${HOST}:${PORT}`);
  console.log(`  - Proyectos:  POST /api/projects (multipart, campos: planta, alzados[], name, alturaCm)`);
  console.log(`  - Lista:      GET  /api/projects`);
  console.log(`  - Ver:        GET  /v/<projectId>`);
});
