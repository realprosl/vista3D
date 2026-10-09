# vista3D

Sube un plano en SVG, obtén una vista 3D compartible por enlace.

## Requisitos

- Node.js 18+ (probado con 26)
- npm

## Instalación

```bash
cd /root/vista3D
npm install
```

## Uso

```bash
# 1. Compilar TypeScript
npm run build

# 2. (Opcional) Regenerar el SVG de prueba
npm run sample

# 3. Arrancar el server
npm start
```

Abre http://localhost:3000 en el navegador, sube un SVG, te devuelve una URL
compartible del tipo `http://localhost:3000/v/<uuid>`.

## Compartir con clientes (futuro)

Para exponer el server en internet, las opciones son:

- **ngrok** o **cloudflared** (rápido, no requiere DNS)
- **nginx + dominio propio** (producción, con HTTPS)

Cuando vayamos a esa parte, abrimos otro PR con la config.

## Formato del SVG

v1 soporta estos elementos en el SVG:

- `<path d="M x y L x y L x y Z">` (rectas, suficiente para plantas)
- `<polygon points="x1,y1 x2,y2 ..." />`
- `<rect x y width height />`

Las unidades del SVG se interpretan como **centímetros** (el `viewBox` y los
atributos numéricos). La altura de extrusión se pide en el formulario
web en cm (por defecto 250 cm = 2.5 m).

**No soporta todavía**: curvas (Bezier), subpaths con holes (agujeros),
transformaciones, gradientes.

## Estructura

```
/root/vista3D/
├── package.json
├── tsconfig.json
├── src/
│   ├── server.ts        # Express + endpoints
│   └── svg-to-3d.ts     # Parser SVG -> contornos 2D
├── public/
│   ├── index.html       # Formulario de upload
│   ├── view.html        # Visor 3D
│   ├── viewer.js        # Three.js client
│   └── samples/
│       └── sample-room.svg  # SVG de prueba generado
├── uploads/<uuid>/
│   └── svg.svg          # SVGs subidos (no en git)
└── scripts/
    └── make-sample-svg.ts   # Regenera el SVG de prueba
```

## Endpoints

| Método | Ruta              | Descripción                                     |
|--------|-------------------|-------------------------------------------------|
| GET    | `/`               | Formulario de upload                            |
| POST   | `/upload`         | multipart/form-data, campo `svg` + `alturaCm`   |
| GET    | `/v/:id`          | Visor 3D                                       |
| GET    | `/api/svg/:id`    | Devuelve el SVG raw                             |
| GET    | `/public/*`       | Estáticos                                       |

## Limitaciones v1

- Solo extrusión simple (altura uniforme).
- Sin detección de paredes/puertas/ventanas.
- Sin exportación a STL/OBJ/GLTF.
- Sin autenticación (app interna por red local).
- Comparte el SVG completo; un usuario técnico puede descargarlo.
