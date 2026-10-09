# Plan de implementación: atributos `data-*` en SVG

## Objetivo

Que cada elemento del SVG (paredes, suelo, puertas, ventanas, huecos,
muebles, etiquetas, cotas) tenga metadatos legibles y editables desde
el visor 3D. La fuente de verdad es el SVG; el panel de la app solo
lee y edita esos atributos (en localStorage durante la edición, y
opcionalmente reescribiendo el SVG al guardar).

Esto desbloquea:
- Nombres legibles en el panel (en lugar de "Pared W").
- Agrupación por habitación (`data-room`).
- Vinculación automática planta ↔ alzados (`data-wall-id`).
- Cada elemento con id única (`data-id`).
- Muebles y decoración como elementos del modelo, no como decoración suelta.

---

## Convenciones de atributos (kebab-case, todos en inglés)

### En la planta (`planta.svg`)

#### Suelo (una sola instancia)
```xml
<rect class="suelo"
      data-id="floor-main"
      data-name="Suelo principal"
      data-group="floor"
      data-color-top="#c4a988"
      data-color-bottom="#6a5a48"
      data-texture-top="liso"
      data-texture-bottom="liso"
      x="0" y="0" width="1000" height="800" />
```

#### Paredes (una por cada lado del polígono principal + interiores)
```xml
<line class="pared"
      data-id="wall-north"
      data-name="Muro norte"
      data-group="wall"
      data-room="salon"
      data-color-exterior="#d4c4a0"
      data-color-interior="#f5ead2"
      data-color-extrusion="#8b7355"
      data-texture-exterior="liso"
      data-texture-interior="liso"
      data-texture-extrusion="liso"
      x1="0" y1="0" x2="1000" y2="0" />
```

#### Puertas / ventanas / huecos
```xml
<rect class="puerta"
      data-id="door-main"
      data-name="Puerta entrada"
      data-group="door"
      data-room="recibidor"
      data-wall-id="wall-north"
      data-color-exterior="#5a3a20"
      data-color-interior="#5a3a20"
      data-color-extrusion="#3a2a18"
      data-texture-exterior="madera"
      data-texture-interior="madera"
      data-texture-extrusion="liso"
      x="400" y="0" width="100" height="220" />
```

#### Muebles (no se renderizan en 3D todavía, pero se listan en el panel)
```xml
<rect class="mueble"
      data-id="sofa-1"
      data-name="Sofá"
      data-group="furniture"
      data-room="salon"
      data-color-exterior="#8b6f4a"
      x="200" y="300" width="200" height="80" />
```

#### Etiquetas y cotas (informativas, no se renderizan en 3D)
```xml
<text class="etiqueta"
      data-id="label-salon"
      data-group="label"
      data-room="salon"
      x="400" y="500">Salón</text>

<line class="cota"
      data-id="dim-width"
      data-group="dimension"
      data-text="10.00 m"
      x1="0" y1="850" x2="1000" y2="850" />
```

### En los alzados (`alzado-<wall-id>.svg`)

Mismos atributos que en la planta para puertas/ventanas, más:

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     data-wall-id="wall-north"
     viewBox="0 0 1000 280">
  ...
  <rect class="puerta" data-id="door-main" ... />
  <rect class="ventana" data-id="window-salon" ... />
</svg>
```

El `data-wall-id` del `<svg>` raíz vincula el alzado con la pared de
la planta. El parser del servidor usa ese id para cruzar los datos.

### Atributos válidos (resumen)

| Atributo | Tipo | Aplica a | Descripción |
|----------|------|----------|-------------|
| `data-id` | string (kebab) | todos | Identificador único. Si falta, se autogenera. |
| `data-name` | string | todos | Nombre legible en el panel. |
| `data-group` | `wall`/`floor`/`door`/`window`/`hole`/`furniture`/`label`/`dimension` | todos | Tipo de elemento. |
| `data-room` | string (kebab) | todos | Habitación a la que pertenece. |
| `data-wall-id` | id de pared | aperturas, alzados | Vincula con la pared padre. |
| `data-color-exterior` | `#rrggbb` | pared, mueble, apertura | Color de la cara exterior/fachada. |
| `data-color-interior` | `#rrggbb` | pared, apertura | Color de la cara interior/pintura. |
| `data-color-extrusion` | `#rrggbb` | pared, apertura | Color del cuerpo extruido. |
| `data-color-top` | `#rrggbb` | suelo | Color de la cara superior del suelo. |
| `data-color-bottom` | `#rrggbb` | suelo | Color de la cara inferior del suelo. |
| `data-texture-exterior` | `liso`/`madera`/`baldosa`/`ladrillo`/`marmol`/`piedra` | igual que color- | Textura de la cara exterior. |
| `data-texture-interior` | idem | idem | Textura interior. |
| `data-texture-extrusion` | idem | idem | Textura extrusión. |
| `data-texture-top` | idem | suelo | Textura cara superior del suelo. |
| `data-texture-bottom` | idem | suelo | Textura cara inferior del suelo. |
| `data-text` | string | label, dimension | Texto mostrado en la cota/etiqueta. |

### Clases CSS reconocidas

| Clase | Alias | Group | ¿Se renderiza en 3D? |
|-------|-------|-------|---------------------|
| `.pared` | `.wall`, `.muro` | `wall` | sí |
| `.suelo` | `.floor` | `floor` | sí |
| `.puerta` | `.door` | `door` | sí |
| `.ventana` | `.window` | `window` | sí |
| `.hueco` | `.hole` | `hole` | sí |
| `.mueble` | `.furniture`, `.silla`, `.mesa`, `.sofa`, `.cama`, `.armario` | `furniture` | no (lista en panel) |
| `.etiqueta` | `.label`, `.texto` | `label` | no |
| `.cota` | `.dimension`, `.medida` | `dimension` | no |

Elementos con clase desconocida → ignorados completamente.

---

## Fases de implementación

### Fase 1 — Parser y modelo de datos (EN PROGRESO)

**Hecho**:
- `src/svg-to-3d.ts` reescrito con `parseSvgElements(svg)` que devuelve
  `{ viewBox, suelo, paredes, aperturas, extras }` con todos los
  metadatos leídos de los atributos `data-*`.
- `parseSvg(svg)` legacy se mantiene como wrapper para no romper el
  servidor actual.

**Pendiente Fase 1**:
- `src/svg-elevations.ts`: añadir `parseElevationElements(svg)` que
  devuelve metadatos completos del alzado, incluyendo el `wall-id`
  del `<svg>` raíz.
- `src/server.ts`: nuevo endpoint `GET /api/projects/:id/elements` que
  devuelve:
  ```json
  {
    "suelo": { ... },
    "paredes": [ ... ],
    "aperturas": [ ... ],
    "extras": [ ... ],
    "alzados": {
      "wall-north": { "widthCm": 1000, "aperturas": [ ... ] },
      "wall-south": { ... }
    }
  }
  ```
  La asociación planta ↔ alzado se hace por `data-wall-id` (de la pared
  en la planta = `id` del alzado sin extensión).
- `public/viewer.js`: usa `/api/projects/:id/elements` para construir
  el panel con nombres reales y agrupar por habitación. Si el endpoint
  no está disponible (SVGs legacy), usa el comportamiento actual
  (autogenera `puerta-1`, `muro-N`, etc.).
- `scripts/make-sample-svg.ts`: actualizar el generador de SVG demo
  para incluir todos los atributos `data-*` en cada elemento.
- Crear un SVG "Mara" de ejemplo con datos realistas (2+ habitaciones,
  varias paredes con nombres, 1 puerta, 2 ventanas, 1 mueble, 1 cota).

### Fase 2 — Renderizado condicional

- Las paredes con `data-id` propio se renderizan con sus colores
  (en lugar de los globales).
- Las aperturas con `data-id` propio se renderizan individualmente.
- Muebles, etiquetas, cotas: NO se renderizan en 3D pero aparecen en
  la lista de elementos del panel (con un checkbox para activar/
  desactivar visibilidad si en el futuro se renderizan).

### Fase 3 — Guardar SVG (FUTURO, NO EN ESTA SESIÓN)

- Botón "Guardar" en el visor.
- Endpoint `PUT /api/projects/:id/svg` que reescribe `planta.svg` y los
  alzados con los nuevos colores/texturas en sus atributos `data-*`.
- Confirmación explícita del usuario antes de reescribir.

### Fase 4 — Subida de SVGs con atributos (FUTURO)

- Actualizar el formulario de subida para que valide que el SVG tiene
  los atributos esperados.
- Si falta algún atributo importante (id, group), autogenerar al subir.

---

## Compatibilidad hacia atrás

- El endpoint `GET /v/:id` sigue funcionando con SVGs legacy.
- El parser `parseSvg` legacy sigue dando el primer contorno (compat).
- Si el SVG no tiene `data-*`, el parser genera IDs del estilo
  `muro-1`, `puerta-1`, etc. y rellena los colores con el fill del
  elemento o con los defaults.
- El panel sigue funcionando aunque no haya metadatos: muestra
  "Pared Norte" / "Puerta 1" etc.

---

## Cómo se construye un SVG correctamente

1. Dibujar la planta en cualquier editor SVG (Inkscape, Illustrator, o a mano).
2. Asegurarse de que el viewBox está en cm (1 unidad = 1 cm).
3. Para cada elemento geométrico:
   - Añadir la clase correcta (`.pared`, `.puerta`, etc.).
   - Añadir `data-id` único.
   - Añadir `data-name` legible.
   - Añadir `data-group` (opcional, se detecta por la clase).
   - Añadir `data-room` si el elemento pertenece a una habitación.
   - Añadir `data-color-exterior` / `data-color-interior` /
     `data-color-extrusion` (o `data-color-top`/`bottom` para suelo).
   - Añadir `data-texture-*` si se quiere textura.
   - Para aperturas: `data-wall-id` apuntando al id de la pared donde
     está.
4. Si hay alzados:
   - Crear un archivo `alzado-<wall-id>.svg` por pared.
   - El `<svg>` raíz lleva `data-wall-id="<id de la pared>"`.
   - Dentro, las aperturas con sus mismos `data-id` y atributos que
     en la planta.
5. Subir planta + alzados al servidor.

---

## Cómo se prueba

1. Crear el SVG "Mara" con el formato de arriba.
2. Subirlo al servidor.
3. Abrir el visor.
4. Verificar que el panel muestra los nombres correctos
   (no "Pared W" sino "Muro norte (Salón)").
5. Verificar que las paredes tienen los colores del SVG.
6. Cambiar un color desde el panel → ver que el cambio se aplica
   al 3D (en memoria, en localStorage).
7. (Fase 3) Hacer clic en "Guardar" → el SVG del servidor se reescribe.
8. Recargar la página → los cambios se mantienen.

---

## Estado actual

- ✅ `src/svg-to-3d.ts` con `parseSvgElements`.
- ⏳ `src/svg-elevations.ts` (pendiente).
- ⏳ `src/server.ts` endpoint `/elements` (pendiente).
- ⏳ `public/viewer.js` consumir el endpoint (pendiente).
- ⏳ `scripts/make-sample-svg.ts` actualizado (pendiente).
- ⏳ SVG "Mara" de ejemplo (pendiente).

---

## Riesgos y mitigación

- **Riesgo**: el parser nuevo ignora elementos con clase desconocida.
  - **Mitigación**: el usuario debe usar las clases documentadas. Si
    usa `.muro` en lugar de `.pared`, lo detectamos como `wall`
    (alias).
- **Riesgo**: la lógica actual del viewer depende de IDs autogenerados
  (`puerta-1`, etc.). Si el SVG tiene `data-id="puerta-principal"`,
  las IDs no coinciden.
  - **Mitigación**: el viewer debe usar las IDs del SVG si existen.
- **Riesgo**: SVGs legacy en el servidor (`uploads/projects/d4d.../`)
  no tienen `data-*`.
  - **Mitigación**: el parser rellena con defaults. El viewer sigue
    funcionando con el sistema actual.
