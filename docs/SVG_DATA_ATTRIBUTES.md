# Atributos `data-*` del SVG — vista3D v0.5.1+

> **Nomenclatura actual (renombrada):** **Cara A / Cara B / Cara C** en vez de "exterior / interior / extrusión".
> Los nombres son **geométricos** y se corresponden 1:1 con los slots del `ExtrudeGeometry` de Three.js.

---

## Objetivo

Que cada elemento del SVG (paredes, suelo, puertas, ventanas, huecos,
muebles, etiquetas, cotas) tenga metadatos legibles y editables desde
el visor 3D. La fuente de verdad es el SVG; el panel de la app solo
lee y edita esos atributos (en localStorage durante la edición, y
opcionalmente reescribiendo el SVG al guardar).

---

## Resumen rápido

| Atributo              | Tipo      | Aplica a                         | Slot del mesh (`mesh.material[]`) | Descripción |
| --------------------- | --------- | -------------------------------- | --------------------------------- | ----------- |
| `data-id`             | string    | todos                            | —                                 | Identificador único del elemento |
| `data-name`           | string    | todos                            | —                                 | Nombre legible (ej. "Muro sur") |
| `data-group`          | string    | todos                            | —                                 | Categoría: `floor` / `wall` / `door` / `window` / `hole` / `furniture` / `label` / `dimension` |
| `data-room`           | string    | todos                            | —                                 | Habitación a la que pertenece |
| `data-wall-id`        | string    | aperturas (alzado + planta)      | —                                 | ID de la pared padre |
| `data-color-cara-a`   | `#rrggbb` | pared, mueble, apertura, suelo   | `mesh.material[0]`                | Color de la **Cara A** (frontal / lado positivo de la normal) |
| `data-color-cara-b`   | `#rrggbb` | pared, mueble, apertura, suelo   | `mesh.material[1]`                | Color de la **Cara B** (trasera / opuesta a la normal) |
| `data-color-cara-c`   | `#rrggbb` | pared, apertura                  | `mesh.material[2]`                | Color de la **Cara C** (perfil lateral / bordes) |
| `data-color-top`      | `#rrggbb` | suelo                            | `mesh.material[0]`                | Alias de `data-color-cara-a` para el suelo |
| `data-color-bottom`   | `#rrggbb` | suelo                            | `mesh.material[1]`                | Alias de `data-color-cara-b` para el suelo |
| `data-texture-cara-a` | ver abajo | igual que color-                 | `mesh.material[0]`                | Textura de la **Cara A** |
| `data-texture-cara-b` | idem      | idem                             | `mesh.material[1]`                | Textura de la **Cara B** |
| `data-texture-cara-c` | idem      | idem                             | `mesh.material[2]`                | Textura de la **Cara C** |

### Texturas válidas (v0.5.1+)

`liso` · `madera` · `baldosa` · `ladrillo` · `marmol` · `piedra`

---

## Correspondencia atributo ↔ slot del mesh

`THREE.ExtrudeGeometry` genera una malla con **3 grupos de materiales** en `mesh.material[]`:

```
mesh.material[0]  ←→  data-color-cara-a   (Cara A: frontal, normal +Z del Shape)
mesh.material[1]  ←→  data-color-cara-b   (Cara B: trasera, normal -Z del Shape)
mesh.material[2]  ←→  data-color-cara-c   (Cara C: perfil, bordes superior/inferior y de huecos)
```

**Para paredes** (las que se ven en el visor 3D):
- **Cara A** = la cara que ves **desde fuera** de la casa si miras la pared de frente
- **Cara B** = la cara que ves **desde dentro** de la casa (el lado de la pintura)
- **Cara C** = el canto del muro (la franja fina que se ve desde arriba)

> ⚠️ Si el muro se ve al revés, es porque la pared SVG está en sentido horario.
> En ese caso "Cara A" y "Cara B" se intercambian visualmente.
> Esto es por la normal del Shape de Three.js, no es un bug.

---

## Ejemplo: planta con paredes y aperturas

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 800" width="1000" height="800">

  <!-- Suelo -->
  <rect class="suelo" data-id="suelo-1" data-name="Suelo principal"
        data-group="floor" data-room="salon"
        data-color-cara-a="#c4a988" data-color-cara-b="#6a5a48"
        data-texture-cara-a="madera"
        x="0" y="0" width="1000" height="800" fill="#c4a988"/>

  <!-- Pared sur (fachada) — segmento sin aperturas -->
  <line class="pared" data-id="wall-south" data-name="Muro sur" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="ladrillo" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="0" y1="800" x2="1000" y2="800" stroke="#5a3a1a" stroke-width="3"/>

  <!-- Puerta de entrada (apertura en planta) -->
  <rect class="puerta" data-id="door-entrada" data-name="Puerta entrada" data-group="door"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#5a3a20" data-color-cara-b="#5a3a20" data-color-cara-c="#3a2a18"
        data-texture-cara-a="madera" data-texture-cara-b="madera" data-texture-cara-c="liso"
        x="100" y="795" width="100" height="5" fill="#5a3a20"/>

  <!-- Mueble (ej. mesa) -->
  <rect class="mueble" data-id="mesa-comedor" data-name="Mesa comedor" data-group="furniture"
        data-room="salon" data-color-cara-a="#8b6f4a" data-texture-cara-a="madera"
        x="300" y="300" width="200" height="100" fill="#8b6f4a"/>
</svg>
```

---

## Ejemplo: alzado (vista frontal de una pared)

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 270" width="1000" height="270"
     data-wall-id="wall-south" data-wall-width="1000">

  <!-- Pared -->
  <line class="pared" data-id="wall-south" data-name="Muro sur" data-group="wall" data-room="salon"
        data-color-cara-a="#d4c4a0" data-color-cara-b="#f5ead2" data-color-cara-c="#8b7355"
        data-texture-cara-a="ladrillo" data-texture-cara-b="liso" data-texture-cara-c="liso"
        x1="0" y1="0" x2="1000" y2="0" stroke="#333" stroke-width="4"/>

  <!-- Puerta -->
  <rect class="puerta" data-id="door-entrada" data-name="Puerta entrada" data-group="door"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#5a3a20" data-color-cara-b="#5a3a20" data-color-cara-c="#3a2a18"
        data-texture-cara-a="madera" data-texture-cara-b="madera" data-texture-cara-c="liso"
        x="100" y="0" width="100" height="210" fill="#f5d99a" stroke="#5a3a1a" stroke-width="3"/>

  <!-- Ventana -->
  <rect class="ventana" data-id="window-salon" data-name="Ventana salón" data-group="window"
        data-room="salon" data-wall-id="wall-south"
        data-color-cara-a="#b8d8f0" data-color-cara-b="#b8d8f0" data-color-cara-c="#9fc8e8"
        data-texture-cara-a="liso"
        x="500" y="60" width="120" height="120" fill="#b8d8f0" stroke="#5a3a1a" stroke-width="3"/>
</svg>
```

---

## Suelo: alias top/bottom

El suelo es un `BoxGeometry`, no un `ExtrudeGeometry`, así que sus 2 caras principales se llaman:

- `data-color-top` o `data-color-cara-a` → cara superior (la que pisas)
- `data-color-bottom` o `data-color-cara-b` → cara inferior (la que da al forjado)

Ambos son intercambiables; el parser los acepta.

---

## Clases CSS reconocidas

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

## Cómo se construye un SVG correctamente

1. Dibujar la planta en cualquier editor SVG (Inkscape, Illustrator, o a mano).
2. Asegurarse de que el viewBox está en cm (1 unidad = 1 cm).
3. Para cada elemento geométrico:
   - Añadir la clase correcta (`.pared`, `.puerta`, etc.).
   - Añadir `data-id` único.
   - Añadir `data-name` legible.
   - Añadir `data-group` (opcional, se detecta por la clase).
   - Añadir `data-room` si el elemento pertenece a una habitación.
   - Añadir `data-color-cara-a` / `data-color-cara-b` / `data-color-cara-c`
     (o `data-color-top` / `bottom` para suelo).
   - Añadir `data-texture-cara-a` / `data-texture-cara-b` / `data-texture-cara-c` si se quiere textura.
   - Para aperturas: `data-wall-id` apuntando al id de la pared donde está.
4. Si hay alzados:
   - Crear un archivo `alzado-<wall-id>.svg` por pared.
   - El `<svg>` raíz lleva `data-wall-id="<id de la pared>"`.
   - Dentro, las aperturas con sus mismos `data-id` y atributos que en la planta.
5. Subir planta + alzados al servidor.

---

## Migración desde la nomenclatura anterior (v0.5.0 → v0.5.1+)

Los nombres anteriores **dejan de funcionar**. Si tenías SVGs con la nomenclatura vieja,
regenera el proyecto con `scripts/make-sample-svg.ts` o edita los `.svg` a mano:

| Antes (v0.5.0)         | Ahora (v0.5.1+)         |
| ---------------------- | ----------------------- |
| `data-color-exterior`  | `data-color-cara-a`     |
| `data-color-interior`  | `data-color-cara-b`     |
| `data-color-extrusion` | `data-color-cara-c`     |
| `data-texture-exterior`| `data-texture-cara-a`   |
| `data-texture-interior`| `data-texture-cara-b`   |
| `data-texture-extrusion`| `data-texture-cara-c`  |
| `data-color-top`       | `data-color-cara-a` *(alias, sigue funcionando)* |
| `data-color-bottom`    | `data-color-cara-b` *(alias, sigue funcionando)* |

El **localStorage** también cambia: las keys `wall:<id>:exterior` se ignoran;
las nuevas son `wall:<id>:cara-a`, `wall:<id>:cara-b`, `wall:<id>:cara-c`.

Usa el botón **"Restablecer"** del panel de Materiales para limpiar el localStorage viejo.

---

## Fases de implementación

- ✅ **Fase 1** — Atributos `data-color-cara-{a,b,c}` y `data-texture-cara-{a,b,c}` en planta.
- ✅ **Fase 2** — Mismos atributos en alzados + `data-wall-id` para vincular planta↔alzado.
- ✅ **Fase 3** — Panel UI con selectores de Cara A / Cara B / Cara C por elemento.
- ⏳ **Fase 4** — Guardar SVG editado (PUT `/api/projects/:id/svg`).
- ⏳ **Fase 5** — Editor visual de colores directamente sobre el SVG (drag&drop).
