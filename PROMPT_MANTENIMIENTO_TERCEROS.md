# AQUILA PH — MANTENIMIENTO DE TERCEROS · IMPLEMENTATION PROMPT

## Contrato operativo del Agente de IA — Extensión de alcance sobre `PROMPT_MAESTRO_FASE1.md`

> **Proyecto:** Administración de Propiedad Horizontal
> **Alcance:** Pantalla de creación y mantenimiento de terceros (persona natural o jurídica)
> **Estado:** Especificación operativa V1 · esquema y store ya construidos · pendiente de frontend
> **Extiende a:** `PROMPT_MAESTRO_FASE1.md` (gobierno §2–§9) y complementa a
> `PROMPT_FICHA_INMUEBLE.md` (esa ficha consume `terceros.ts`, ver §7.2 allá — esta pantalla
> es donde un tercero se crea/mantiene de forma independiente, sin estar asociado todavía a
> ningún inmueble)
> **Fuente visual vinculante:** `docs/mockups/terceros.html`

---

# 0. Cómo usar este documento

Igual criterio que `PROMPT_FICHA_INMUEBLE.md` §0. Diferencia importante con ese documento:
aquí el **esquema y el store ya están completos** — `terceros.ts` cubre el 100% de lo que
esta pantalla necesita (§6.2). No hay stores por crear ni por extender. La unidad de trabajo
es, de principio a fin, frontend.

---

# 1. Misión y Alcance

## 1.1 Dentro de alcance

| #  | Capacidad | Entregable observable |
| -- | --- | --- |
| T1 | Ruta `/terceros` — listado | `pages/terceros/index.vue`, filtro por tipo (Todos/Natural/Jurídica) |
| T2 | Modal "Nuevo tercero" | Formulario con switch Natural/Jurídica y campos condicionales |
| T3 | Modal "Editar tercero" | Mismo componente que T2, prellenado — no un formulario aparte |
| T4 | Dígito de verificación automático (NIT) | Se calcula al escribir el documento, algoritmo DIAN, no editable a mano |
| T5 | Representante legal / Pagador (solo jurídica) | `<select>` poblado solo con terceros naturales, excluye el tercero en edición |
| T6 | Inactivar un tercero | Cambiar `estado_id` a `inactivo` — **no** hay borrado físico desde la UI (§8.3) |

## 1.2 Fuera de alcance (NO implementar aquí)

```text
tenant_tercero_rol (roles de tercero a nivel de copropiedad: administrador, contador,
  abogado, revisor fiscal) — el store ya lo soporta (cargarPersonasTenant,
  asociarTerceroTenant, finalizarRelacionTenant), pero no hay mockup ni se pidió
  pantalla. No inventar UI para esto aquí — gap §8.2.
inmueble_tercero_rol (asociar un tercero a un inmueble específico, con rol/porcentaje/
  pagador) — eso vive en la ficha de inmueble, PROMPT_FICHA_INMUEBLE.md §7.1-7.3, no
  se duplica aquí.
Búsqueda por texto, paginación server-side — igual criterio que
  PROMPT_FICHA_INMUEBLE.md §6.4, se deja para una mejora futura.
Borrado físico de un tercero.
```

---

# 2. Fuentes de Verdad y Precedencia

```text
1. Decisiones ratificadas en este documento
2. docs/mockups/terceros.html               — contrato visual/interacción
3. Migraciones ya aplicadas (§4)            — contrato de esquema, nombres exactos
4. apps/web/app/stores/terceros.ts          — contrato de datos, ya completo
5. PROMPT_MAESTRO_FASE1.md §2–§9            — gobierno, RLS, capas, convenciones
6. PROMPT_FICHA_INMUEBLE.md                 — para no duplicar lo que esa ficha ya cubre
7. Inferencias del agente
```

---

# 3. Reglas de Gobierno

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §3. La más relevante aquí es
**Anti-Redundancia**: el store existe completo, no se crea ningún store nuevo ni se
reimplementa ninguna de sus funciones dentro del componente.

---

# 4. Modelo de Datos — ya migrado

## 4.1 Migraciones relevantes (orden de aplicación)

```text
20260814160000_tipos_lista_tipos.sql          tipos / lista_tipos — catálogo extensible
20260814180000_seed_catalogo_referencia.sql   TIPO_IDENTIFICACION (semilla inicial)
20260817110000_personas_roles_flexibles.sql   propietarios → personas (histórico)
20260817160000_terceros_generalizacion.sql    personas → terceros — natural | jurídica,
                                               representante_legal_id, pagador_id
20260817190000_correcciones_db_first.sql      ESTADO_TERCERO (catálogo dedicado),
                                               terceros.nombre_completo (columna generada)
```

`pnpm db:push:dry` → `db:push` → `db:types` antes de escribir Vue, igual que en
`PROMPT_FICHA_INMUEBLE.md` §4.1 — si ya se aplicaron para esa ficha, están cubiertas aquí
también (mismo esquema).

## 4.2 Columnas de `terceros` que esta pantalla expone

| Columna | Notas |
| --- | --- |
| `tipo_persona` | `'natural'` \| `'juridica'` — ramifica el formulario (§7) |
| `tipo_identificacion_id` | FK `lista_tipos`, familia `TIPO_IDENTIFICACION` |
| `numero_documento` / `digito_verificacion` | el segundo solo aplica a NIT, calculado (§7.3) |
| `primer_nombre` / `segundo_nombre` / `primer_apellido` / `segundo_apellido` | solo natural |
| `razon_social` | solo jurídica |
| `representante_legal_id` / `pagador_id` | solo jurídica — autorreferencia, solo tercero natural (§7.2) |
| `email` / `telefono` / `direccion` | comunes, opcionales |
| `estado_id` | FK `lista_tipos`, familia `ESTADO_TERCERO` — cargar completo, sin filtrar (§4 de `PROMPT_FICHA_INMUEBLE.md` ya documenta por qué) |
| `nombre_completo` | **generada** — usar directo en la tabla del listado, nunca recalcular en el componente |

Todos los `CHECK` (campos obligatorios por `tipo_persona`, autorreferencia inválida) y el
guard `guard_tercero_invariantes` (familia de catálogo correcta, representante/pagador
natural y del mismo tenant) ya están en la base — el formulario los **espeja** para buena
UX (Doble Barrera, `PROMPT_MAESTRO_FASE1.md` §3.5), no los reemplaza: un intento inválido
que se cuele en la UI de todas formas lo rechaza la base.

---

# 5. Diseño Visual Vinculante

Abrir `docs/mockups/terceros.html`. Mismo sistema visual que la ficha de inmueble (Source
Serif 4 / IBM Plex Sans / IBM Plex Mono, paleta sello/oro/ladrillo). Reproducir tal cual:

```text
Masthead: "Terceros" + botón "Nuevo tercero"
Chips de filtro: Todos | Persona natural | Persona jurídica
Tabla: Tercero (nombre_completo + subtítulo con tipo/rep. legal) · Documento · Email ·
       Teléfono · Estado · acciones
Modal "Nuevo/Editar tercero":
  Segmented Natural | Jurídica
  Tipo identificación · Documento · Dígito de verificación (condicional a NIT)
  Natural: Primer/Segundo nombre · Primer/Segundo apellido
  Jurídica: Razón social · Representante legal · Pagador
  Email · Teléfono · Dirección · Estado
  Cancelar / Guardar
```

El JS del mockup (`calcularDVNit`, el toggle de segmented, el show/hide condicional) es
código de referencia real, no solo un boceto — copiarlo a la lógica del componente Vue tal
cual, adaptado a Composition API. No reinventar el algoritmo del dígito de verificación.

---

# 6. Estructura Frontend

## 6.1 Ruta

```text
apps/web/app/pages/terceros/index.vue
```

Una sola ruta — a diferencia de la ficha de inmueble, aquí no hace falta separar
creación/edición en rutas distintas: ambas son el mismo modal sobre la misma página
(igual que el mockup).

## 6.2 Componentes

```text
apps/web/app/components/terceros/
├─ TerceroModal.vue      # el formulario de §5 — recibe terceroId? (undefined = crear)
└─ TerceroTabla.vue      # opcional: puede vivir inline en index.vue si no gana complejidad
```

`TerceroModal.vue` recibe `terceroId?: string`. Igual criterio que `InmuebleFicha.vue`
(`PROMPT_FICHA_INMUEBLE.md` §6.2): el modo no es un prop aparte, es
`computed(() => !!props.terceroId)`.

## 6.3 Store — ya existe, solo se consume

| Función de `terceros.ts` | Uso en esta pantalla |
| --- | --- |
| `cargarTerceros(tenantId)` | listado de `/terceros` |
| `cargarCatalogos(tenantId)` | pobla `tiposIdentificacion` y `estadosGenerales` (nombre del ref, contenido ya es `ESTADO_TERCERO`) al abrir el modal |
| `cargarTercerosNaturales(tenantId)` | pobla los `<select>` de representante legal / pagador cuando `tipo_persona === 'juridica'` |
| `crearTercero(params)` | submit del modal en modo creación |
| `actualizarTercero(id, tenantId, cambios)` | submit del modal en modo edición |

Ninguna otra función del store aplica aquí — `cargarPersonasInmueble`,
`asociarTerceroInmueble`, `marcarPagador`, etc. son de `PROMPT_FICHA_INMUEBLE.md`, no de
esta pantalla.

---

# 7. Flujos Críticos

## 7.1 Crear tercero natural

```text
1. Segmented en "Natural" (default)
2. Completar tipo_identificacion, documento, primer_nombre, primer_apellido (obligatorios),
   resto opcional
3. terceros.crearTercero({ tipoPersona: 'natural', ... })
4. Cerrar modal, refrescar tabla (crearTercero ya llama cargarTerceros internamente)
```

## 7.2 Crear tercero jurídico

```text
1. Segmented en "Jurídica"
2. Al entrar a este modo → terceros.cargarTercerosNaturales(tenantId) si no se cargó antes
   (cachear en el componente, no repetir la consulta en cada toggle)
3. Completar tipo_identificacion, documento, razón social (obligatoria)
4. Representante legal / Pagador: <select> opcionales, poblados solo con naturales.
   Si terceroId (modo edición) coincide con alguna opción, excluirla de la lista — un
   tercero no puede ser su propio representante/pagador (el CHECK de BD ya lo impide,
   pero no dejar que la UI lo ofrezca como opción es mejor UX)
5. terceros.crearTercero({ tipoPersona: 'juridica', razonSocial, representanteLegalId?,
   pagadorId?, ... })
```

## 7.3 Dígito de verificación

```text
onChange(tipoIdentificacion) o onInput(documento):
  si tipoIdentificacion.codigo === 'nit' → mostrar campo, calcularDVNit(documento)
  si no → ocultar campo, limpiar valor
```

Función `calcularDVNit` — copiar tal cual de `docs/mockups/terceros.html` (algoritmo DIAN,
pesos `[71,67,59,53,47,43,41,37,29,23,19,17,13,7,3]`, right-aligned).

## 7.4 Editar tercero existente

```text
1. Click en fila de la tabla → abrir TerceroModal con terceroId
2. Prellenar todos los campos desde el tercero ya cargado en tercerosStore.terceros
   (no hace falta una consulta nueva si ya está en el store)
3. submit → terceros.actualizarTercero(id, tenantId, cambios)
```

`tipo_persona` **no se debe poder cambiar** en modo edición — deshabilitar el segmented
cuando `terceroId` está presente (§8.1, es una decisión de UI, la base no lo impide todavía).

## 7.5 Inactivar un tercero

```text
Desde el modal de edición: cambiar Estado a "Inactivo" → terceros.actualizarTercero(...)
```

No hay botón "Eliminar" en ningún estado del mockup — es intencional, ver §8.3.

---

# 8. Gaps Abiertos

## 8.1 `tipo_persona` inmutable tras creación — bloqueado solo en UI, no en BD

Se decidió (§7.4) deshabilitar el cambio de `tipo_persona` en el formulario de edición,
pero la base de datos no tiene un guard que lo impida — un `update` directo (o un bug futuro
en el componente) podría convertir un tercero natural en jurídico. Si se quiere una segunda
barrera real, es una migración nueva (trigger que rechace el cambio de `tipo_persona` en
`UPDATE`) — no se agrega en esta unidad de trabajo sin decisión explícita.

## 8.2 `tenant_tercero_rol` sin pantalla

El store ya tiene `cargarPersonasTenant`/`asociarTerceroTenant`/`finalizarRelacionTenant`.
No se construye ninguna UI para esto aquí — si se necesita una pantalla de "Terceros de la
copropiedad" (administrador, contador, abogado, revisor fiscal), es una unidad de trabajo
aparte con su propio mockup.

## 8.3 Borrado físico — la RLS lo permite, la UI no lo ofrece

`terceros_delete_agent` existe (heredada de `personas_delete_agent`, `propietarios_delete_agent`)
— un agente técnicamente puede hacer `delete` por API directa. La pantalla nunca expone esa
acción; "inactivar" (§7.5) es el único camino desde la UI. Si se quiere cerrar también esa
puerta a nivel de base (revocar la política de `DELETE`), es una decisión aparte — no
asumir que debe hacerse solo porque la UI no la usa.

---

# 9. Testing y Definition of Done

Se añade a `PROMPT_MAESTRO_FASE1.md` §12:

```text
□ Alcance exacto de §1.1, sin extras
□ Cero cambios de esquema — el modelo de §4 ya existe
□ Crear un tercero natural y uno jurídico manualmente — ambos pasan validación de UI y
  quedan guardados con los campos correctos (el otro conjunto de campos queda null)
□ Intentar guardar un jurídico sin razón social → bloqueado en UI (CHECK de BD como red
  de seguridad, no como única barrera)
□ NIT de prueba → dígito de verificación coincide con una fuente externa (DIAN o similar)
□ Representante legal / Pagador: el propio tercero en edición no aparece como opción
□ Cambiar tipo_persona en modo edición → deshabilitado (§8.1)
□ Inactivar un tercero → desaparece de cualquier filtro que asuma "activo" en otras
  pantallas (ej. si `PROMPT_FICHA_INMUEBLE.md` ya filtra por estado al listar terceros
  disponibles para asociar a un inmueble — verificar coherencia entre ambas pantallas)
□ tsc --noEmit, eslint, build → gates de `PROMPT_MAESTRO_FASE1.md` §12.3
```

---

# 10. Orden de Implementación

```text
U1 · TerceroModal.vue — el formulario completo, con datos de prueba en el propio
     componente (sin conectar al store todavía) — validar que el switch y los
     condicionales funcionan igual que el mockup
        ↓
U2 · Conectar TerceroModal.vue al store — crearTercero / actualizarTercero /
     cargarTercerosNaturales / cargarCatalogos
        ↓
U3 · pages/terceros/index.vue — tabla + chips de filtro + abrir modal en modo creación
        ↓
U4 · Editar desde la tabla — abrir modal en modo edición, prellenado, tipo_persona
     deshabilitado
```

---

# 11. Workflow y Formato de Reporte

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §14 y §16.

---

# 12. Resumen Ejecutivo para el Agente

```text
Construyes la pantalla de mantenimiento de terceros: listado + un modal que sirve para
crear y editar.

El esquema y el store YA EXISTEN — terceros.ts cubre el 100% de esta pantalla. No creas
ni extiendes ningún store.

El mockup (docs/mockups/terceros.html) trae el algoritmo del dígito de verificación
funcionando — cópialo, no lo reinventes.

Un tercero es natural o jurídico — el formulario se ramifica (dos conjuntos de campos
obligatorios distintos, ya validados por CHECK en la base). tipo_persona no se cambia
después de creado (bloqueo de UI, no de base — ver gap §8.1).

No hay borrado físico desde esta pantalla — inactivar es la única baja.

No construyes aquí: la relación de un tercero con un inmueble (eso es
PROMPT_FICHA_INMUEBLE.md) ni con la copropiedad (tenant_tercero_rol, sin mockup, gap §8.2).

Terminado = Definition of Done de §9 completa, no "compila".
```
