# AQUILA PH — FICHA DE INMUEBLE · IMPLEMENTATION PROMPT

## Contrato operativo del Agente de IA — Extensión de alcance sobre `PROMPT_MAESTRO_FASE1.md`

> **Proyecto:** Administración de Propiedad Horizontal
> **Alcance:** Página de creación y mantenimiento de un inmueble (primera entidad operativa
> de PH construida sobre la Fase I)
> **Estado:** Especificación operativa V1 · esquema ya migrado · pendiente de frontend
> **Extiende a:** `PROMPT_MAESTRO_FASE1.md` — su §1.3 excluía "unidades/apartamentos" de
> Fase I; este documento las declara **en alcance** y **hereda su gobierno (§2–§9) sin
> reescribirlo**. Ante cualquier punto no cubierto aquí, rige `PROMPT_MAESTRO_FASE1.md`.
> **Fuente visual vinculante:** `docs/mockups/ficha-inmueble.html` (entregado con este
> documento — ábrelo en un navegador antes de leer §5)

---

# 0. Cómo usar este documento

Igual que `PROMPT_MAESTRO_FASE1.md` §0: **no es documentación narrativa**, es el contrato
de ejecución de esta unidad de trabajo.

```text
El mockup HTML   → define la interacción y el diseño visual, pixel a pixel
Este documento   → define qué tabla/columna alimenta cada pieza del mockup,
                    qué store la sirve, en qué orden se construye y con qué
                    criterio de "terminado"
```

El esquema de datos de §4 **ya está migrado** — no es una propuesta, es un hecho del
repositorio. El agente no vuelve a crear estas tablas ni discute su forma; genera tipos
(`pnpm db:types`) y las consume. Todo lo marcado **[Ratificado]** es vinculante.
Cualquier ambigüedad no cubierta aquí bloquea el componente hasta decisión humana
(protocolo de gaps, `PROMPT_MAESTRO_FASE1.md` §15.3).

---

# 1. Misión y Alcance

## 1.1 Dentro de alcance

| #  | Capacidad                                                             | Entregable observable                                          |
| -- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| I1 | Ruta de creación de inmueble                                          | `pages/inmuebles/nuevo.vue` — formulario, guarda y navega a la ficha |
| I2 | Ruta de ficha/mantenimiento de inmueble                                | `pages/inmuebles/[id].vue` — carga real por `id`                |
| I3 | Listado mínimo de navegación                                          | `pages/inmuebles/index.vue` — tabla simple, enlaza a cada ficha (§8.2) |
| I4 | Tab **Datos base**: ficha técnica, coeficiente (solo lectura + enlace), zonas comunes de uso exclusivo, personas asociadas | CRUD real contra `inmuebles`, `personas`, `inmueble_persona_rol` |
| I5 | Tab **Cartera**: saldo, cargos pendientes, pagos recientes            | Lectura real vía `cuentaCorriente.ts` (ya existe, reutilizar)   |
| I6 | Tab **Novedades activas**: filtro por estado, aprobar/rechazar        | Lectura + acciones reales vía `cuentaCorriente.ts` (extender)  |
| I7 | Tab **Liquidaciones**: historial por periodo de este inmueble          | Lectura real vía `liquidacion.ts` (extender)                    |
| I8 | Tab **Históricos**: línea de tiempo unificada                          | Vista compuesta de varias fuentes, solo lectura (§7.5)          |
| I9 | Tab **Documentos**: listado + metadatos de versión/vencimiento         | Lectura real vía `documentos_inmueble`; **subida bloqueada**, ver §8.1 |
| I10| Estado legal y habitabilidad del inmueble                              | Selects contra `ESTADO_LEGAL_PREDIO` / `HABITABILIDAD_PREDIO`  |

## 1.2 Fuera de alcance (NO implementar aquí)

```text
Edge Function subir-documento + bucket de Storage      → §8.1, gap abierto, STOP
motor de liquidación (cálculo de liquidar-periodo)     → ya existe, esta ficha solo lo consume
gestión de coeficiente_sets (crear/versionar)           → módulo aparte (Configuración → Coeficientes)
gestión del catálogo lista_tipos (crear roles/tipos)    → módulo aparte (Configuración → Catálogos)
reportes de cartera multi-inmueble, dashboard agregado  → fuera de esta unidad de trabajo
```

Si una tarea parece requerir algo de esta lista → **STOP** → registrar gap.

---

# 2. Fuentes de Verdad y Precedencia (para esta unidad de trabajo)

```text
1. Decisiones ratificadas en este documento
2. docs/mockups/ficha-inmueble.html          — contrato visual/interacción
3. Migraciones ya aplicadas (§4)             — contrato de esquema, nombres exactos
4. PROMPT_MAESTRO_FASE1.md §2–§9             — gobierno, RLS, capas, convenciones
5. Código existente (stores/pages actuales)  — patrón a replicar, no a reinventar
6. Inferencias del agente
```

Ante contradicción entre el mockup y el esquema real (p. ej. el mockup usa un valor de
catálogo que ya no existe), **gana el esquema** — el mockup es contrato de forma, no de
datos. Reportar la discrepancia igual (§12).

---

# 3. Reglas de Gobierno

Aplican sin cambios las cinco reglas de `PROMPT_MAESTRO_FASE1.md` §3: **No Invención**,
**Propiedad Única**, **Anti-Redundancia**, **Alcance Cerrado**, **Doble Barrera**. No se
repiten aquí. La que más pesa en esta unidad de trabajo es **Anti-Redundancia**:
`cuentaCorriente.ts` y `liquidacion.ts` ya existen y ya cubren cargos, pagos, novedades y
liquidaciones — se **extienden**, nunca se duplican en un store nuevo.

---

# 4. Modelo de Datos — ya migrado, no se recrea

## 4.1 Migraciones que esta ficha consume (orden de aplicación)

```text
20260814100100_domain_tables.sql              inmuebles, propietarios* (ver 110000)
20260814160000_tipos_lista_tipos.sql          tipos / lista_tipos — catálogo extensible
20260814180000_seed_catalogo_referencia.sql   PERSONA_PREDIO, HABITABILIDAD_PREDIO,
                                               TIPO_DOCUMENTO_PREDIO (semilla inicial)
20260816100000_cuenta_corriente_ledger.sql    cargos, pagos, pago_aplicaciones
20260816110000_novedades.sql                  novedades
20260817110000_personas_roles_flexibles.sql   personas*, inmueble_persona_rol*
20260817120000_fn_marcar_pagador.sql          fn_marcar_pagador (RPC)
20260817130000_inmueble_estado_legal_habitabilidad.sql
                                               inmuebles.estado_legal_id / habitabilidad_id
20260817140000_documentos_inmueble.sql        documentos_inmueble, v_documento_vigente,
                                               TIPO_DOCUMENTO_PREDIO (amplía)
20260817150000_v_inmuebles_sin_titular.sql    v_inmuebles_sin_titular
```

`*` = renombrada en 20260817110000 (`propietarios`→`personas`,
`inmueble_propietario`→`inmueble_persona_rol`). Si el agente encuentra referencias a los
nombres viejos en código o tipos sin regenerar, es drift — regenerar tipos, no reintroducir
el nombre viejo.

**Antes de tocar una sola línea de Vue:** `pnpm db:push:dry` → revisar diff → `pnpm db:push`
→ `pnpm db:types`. Sin esto, `Database['public']['Tables']['personas']` no existe y nada
compila.

## 4.2 Tablas y columnas relevantes para esta ficha

### `inmuebles` (existente + columnas nuevas de 20260817130000)

| Columna | Tipo | Notas |
| --- | --- | --- |
| `codigo`, `tipo_id`, `matricula_inmobiliaria`, `area_privada`, `area_comun`, `estado` | — | ya existían, sin cambios |
| `estado_legal_id` | `bigint` FK `lista_tipos` | familia `ESTADO_LEGAL_PREDIO` — situación **jurídica** (litigio, embargo, sucesión ilíquida...) |
| `estado_legal_observaciones` | `text` nullable | detalle libre (radicado, juzgado, fecha) |
| `habitabilidad_id` | `bigint` FK `lista_tipos` | familia `HABITABILIDAD_PREDIO` — condición **física/funcional** (habitado, en mantenimiento, inhabitable...) |

**No confundir los dos ejes** — son independientes, un inmueble puede estar perfectamente
habitable y embargado a la vez. `HABITABILIDAD_PREDIO` tiene dos códigos desactivados
(`activo=false`): `litigio_disputa_legal` e `inactivo_sin_titular` — no se ofrecen en el
`<select>` de habitabilidad (filtrar por `activo = true`), esa información vive en
`estado_legal_id` y en `v_inmuebles_sin_titular` respectivamente.

### `personas` / `inmueble_persona_rol` — personas asociadas, rol flexible

`personas`: datos de la persona (`tipo_documento`, `numero_documento`, `nombre`, `email`,
`telefono`), sin relación con ningún inmueble todavía.

`inmueble_persona_rol`: la relación.

| Columna | Notas |
| --- | --- |
| `rol_id` | FK `lista_tipos`, familia `PERSONA_PREDIO` (copropietario, arrendatario, inquilino, visitante, apoderado, codeudor, tercero_pagador) — **extensible por tenant sin migración** |
| `porcentaje` | nullable — solo tiene valor cuando el rol es `copropietario`; la suma ≤100% se valida en cliente al guardar, no en la tabla |
| `es_pagador` | boolean — quién recibe la factura, independiente del rol. **Un solo pagador vigente por inmueble** (índice único parcial) — cambiarlo va por `fn_marcar_pagador`, nunca por `update` directo |
| `recibe_notificaciones` | boolean, independiente de `es_pagador` |
| `vigente_desde` / `vigente_hasta` | `vigente_hasta is null` = relación activa; "terminar" una relación es poner `vigente_hasta`, nunca un `delete` |

### `documentos_inmueble` / `v_documento_vigente` — solo lectura en esta unidad de trabajo

Append-only, versionado por `grupo_id` + `version`. `fecha_vencimiento` nullable.
`tipo_documento_id` FK `lista_tipos`, familia `TIPO_DOCUMENTO_PREDIO`.
`v_documento_vigente` = última versión de cada `grupo_id` (derivado, no persistido).
**La escritura (subir/versionar) no tiene RLS de INSERT todavía** — ver gap §8.1.

### `v_inmuebles_sin_titular`

Inmuebles sin ninguna fila vigente con `rol_id` → código `copropietario`. Se consulta, no
se marca a mano — no existe columna ni catálogo para "sin titular".

### Reutilizadas de solo lectura (no se tocan)

```text
cargos, pagos, pago_aplicaciones, v_cargo_saldo    → tab Cartera
novedades (tipo: CHARGE/DISCOUNT/ADJUSTMENT/        → tab Novedades activas
           REFUND/CREDIT/DEBIT — enum nativo,
           NO lista_tipos; estado: pendiente/
           aprobada/rechazada — solo 3 valores)
liquidaciones, liquidacion_lineas                   → tab Liquidaciones
```

---

# 5. Diseño Visual Vinculante

Abrir `docs/mockups/ficha-inmueble.html` en un navegador. Es el contrato de forma:
tipografía (Source Serif 4 / IBM Plex Sans / IBM Plex Mono), paleta (verde sello / oro /
ladrillo, uso semántico — ladrillo **solo** para mora/rechazo), masthead con doble regla,
franja de indicadores, 6 tabs con iconos de línea, tablas con numerales tabulares.
Reproducir la maquetación y el sistema de color **tal cual**; lo que cambia es que cada
elemento pasa de dato de muestra a dato real.

## 5.1 El switch "Inmueble existente / Nuevo inmueble" es solo demostrativo

**No se implementa como componente.** Existe en el mockup para revisar los dos estados en
un solo archivo. En la app real el modo lo decide la ruta:

```text
/inmuebles/nuevo      → pages/inmuebles/nuevo.vue    → modo creación
/inmuebles/[id]        → pages/inmuebles/[id].vue      → modo ficha completa
```

Ambas rutas renderizan el **mismo** componente compartido (§6.2); el modo se deriva de si
hay un `id` real en la ruta, no de un botón. En modo creación, de los 6 tabs solo **Datos
base** está disponible (mismo criterio visual del mockup: los demás deshabilitados con
mensaje "disponible después de guardar" — eso sí es UI real, no demo).

## 5.2 Mapa mockup → dato real

| Sección del mockup | Fuente de datos | Store / acción |
| --- | --- | --- |
| Masthead (código, tipo, estado) | `inmuebles` | `inmuebles.ts` (nuevo, §6.3) |
| Franja de indicadores → coeficiente vigente | `coeficientes` + `coeficiente_sets` | solo lectura, store existente si lo hay; si no, query directa — **no crear CRUD de coeficientes aquí** (fuera de alcance §1.2) |
| Franja de indicadores → saldo cartera | `v_cargo_saldo` | `cuentaCorriente.cargarCargosAbiertos(tenantId, inmuebleId)` — ya existe |
| Tab Datos base → Personas asociadas | `inmueble_persona_rol` + `personas` + `lista_tipos` | `personas.ts` — ya existe (§6.3) |
| Tab Datos base → campo de participación condicional al rol | — | lógica de UI: mostrar solo si `rol.codigo === 'copropietario'` |
| Tab Cartera | `cargos`, `pagos` | `cuentaCorriente.ts` — ya existe |
| Tab Novedades activas | `novedades` | `cuentaCorriente.ts` — **extender** `cargarNovedades` con `inmuebleId?` opcional (mismo patrón que `cargarCargosAbiertos`) |
| Tab Liquidaciones | `liquidaciones` + `liquidacion_lineas` | `liquidacion.ts` — **agregar** `cargarLineasPorInmueble(tenantId, inmuebleId)` |
| Tab Históricos | compuesta (§7.5) | `inmuebles.ts` — función `cargarHistorico`, solo lectura |
| Tab Documentos | `v_documento_vigente` | `documentos.ts` (nuevo) — **solo `cargarDocumentos`**, sin subida (§8.1) |
| Nota "requiere infraestructura nueva" del mockup (tab Documentos) | — | ya no aplica a la tabla (existe); sigue aplicando al bucket de Storage (§8.1) |

---

# 6. Estructura Frontend

## 6.1 Rutas nuevas

```text
apps/web/app/pages/inmuebles/
├─ index.vue      # listado mínimo (§8.2) — primera vez que existe esta carpeta
├─ nuevo.vue       # modo creación
└─ [id].vue        # modo ficha completa
```

## 6.2 Componentes (feature-based, plano salvo que la complejidad lo justifique —
convención ya establecida en el repo, `01 §…`)

```text
apps/web/app/components/inmuebles/
├─ InmuebleFicha.vue           # masthead + franja + tabs — el compartido entre nuevo.vue y [id].vue
├─ InmuebleDatosBase.vue       # ficha técnica + coeficiente (lectura) + zonas comunes + personas
├─ InmueblePersonaForm.vue     # modal/drawer: agregar/editar persona asociada (rol condicional)
├─ InmuebleCartera.vue
├─ InmuebleNovedades.vue
├─ InmuebleLiquidaciones.vue
├─ InmuebleHistoricos.vue
└─ InmuebleDocumentos.vue      # lista + metadatos; botón "Subir" deshabilitado, tooltip → §8.1
```

`InmuebleFicha.vue` recibe `inmuebleId?: string` — `undefined` = modo creación. No recibe
un prop de "modo": el modo es un `computed(() => !!props.inmuebleId)`.

## 6.3 Stores

| Store | Estado | Acción sobre este store |
| --- | --- | --- |
| `personas.ts` | catálogo de personas, roles, personas×inmueble | **ya existe** (esta sesión) — usar tal cual |
| `cuentaCorriente.ts` | cargos, pagos, novedades | **extender**: `cargarNovedades` acepta `inmuebleId?` |
| `liquidacion.ts` | periodos, liquidaciones | **extender**: agregar `cargarLineasPorInmueble` |
| `inmuebles.ts` | el inmueble activo de la ficha, histórico | **crear** — `cargarInmueble(tenantId, id)`, `crearInmueble(...)`, `actualizarInmueble(...)`, `cargarHistorico(tenantId, inmuebleId)` |
| `documentos.ts` | documentos del inmueble | **crear**, solo `cargarDocumentos(tenantId, inmuebleId)` — sin mutaciones (§8.1) |

Todos siguen el patrón ya fijado por `personas.ts`/`fundamentoNormativo.ts`: `defineStore`
con `setup syntax`, `useSupabaseClient<Database>()` por función (no en el nivel superior del
store), `shallowRef` para colecciones, un `error` propagado por `throw`, no capturado en
silencio.

## 6.4 `pages/inmuebles/index.vue` — mínimo, no rediseñar

Tabla simple: código, tipo, estado, saldo cartera (opcional si el join es barato), enlace a
`/inmuebles/[id]`. Sin filtros avanzados, sin paginación server-side todavía — eso es una
mejora futura, no bloquea esta unidad de trabajo. Botón "Nuevo inmueble" → `/inmuebles/nuevo`.

---

# 7. Flujos Críticos

## 7.1 Crear inmueble

```text
1. Usuario completa Datos base en modo creación (Datos generales + al menos 1 persona)
2. inmuebles.crearInmueble(...) → inserta en `inmuebles` (RLS agent, directo)
3. Si hay persona(s) en el formulario → personas.crearPersona + personas.asociarPersonaInmueble
   por cada una, usando el id recién creado
4. Navegar a /inmuebles/{id} recién creado — el modo cambia solo (por ruta, §5.1)
```

## 7.2 Agregar persona con rol condicional

```text
InmueblePersonaForm.vue:
  onChange(rol) → si rol.codigo === 'copropietario' → mostrar campo participación
                → si no → ocultarlo y enviar porcentaje = null
  submit → personas.asociarPersonaInmueble({ ..., esPagador })
           (el store ya resuelve el swap atómico vía fn_marcar_pagador si esPagador=true —
            no reimplementar esa lógica en el componente)
```

## 7.3 Marcar pagador desde una fila existente

Botón en la tabla de personas → `personas.marcarPagador(id, tenantId, inmuebleId)` — no
hacer `update` directo sobre `es_pagador` desde el componente, viola el índice único parcial
si ya hay otro pagador vigente.

## 7.4 Aprobar / rechazar novedad

Reutilizar `cuentaCorriente.aprobarNovedad` / `rechazarNovedad` tal cual existen — no
duplicar la llamada a la Edge Function correspondiente.

## 7.5 Tab Históricos — cómo se compone

No existe una tabla `historico`. Es una **unión en cliente** (o una vista, a discreción del
agente si el volumen lo justifica — proponerlo como gap si se decide crear vista) de:

```text
inmueble_persona_rol   (altas de personas, por created_at)
novedades               (aprobada/rechazada, por approved_at/created_at)
pagos                   (por created_at)
liquidaciones           (cerradas que incluyen liquidacion_lineas de este inmueble)
inmuebles               (si se decide auditar cambios de estado_legal/habitabilidad —
                          NO hay tabla de auditoría de columna todavía; si se necesita,
                          es un gap nuevo, no se infiere)
```

Ordenar por fecha descendente, paginar client-side es aceptable para V1.

---

# 8. Gaps Abiertos — no implementar mientras tanto

## 8.1 Subida y versionado real de documentos — **STOP**

`documentos_inmueble` no tiene política de `INSERT` para `authenticated` (decisión
deliberada, ver comentario en `20260817140000_documentos_inmueble.sql`): calcular la
siguiente versión bajo concurrencia y coordinar con Storage necesita una Edge Function
(`subir-documento`) que todavía no existe, y el bucket de Storage (con su propio RLS por
tenant) tampoco. El tab Documentos se implementa **de solo lectura** en esta unidad de
trabajo; el botón "Subir" queda visible pero `disabled`, con tooltip "Próximamente". No
improvisar un `insert` directo para destrabar esto — es exactamente la condición de carrera
que la decisión original evitó.

## 8.2 `pages/inmuebles/index.vue` no tenía dueño previo

Es la primera carpeta de rutas dinámicas del proyecto — no hay nada que extender. Default
aplicado: construir la versión mínima de §6.4 como parte de esta unidad de trabajo (de lo
contrario la ficha es inalcanzable desde la UI). Revertible sin costo si luego se decide un
diseño de listado más elaborado — no bloquea I1–I10.

---

# 9. Testing y Definition of Done

Se añade a la pirámide y a los gates de `PROMPT_MAESTRO_FASE1.md` §12, sin reemplazarlos:

```text
□ Alcance exacto de §1.1, sin extras (Regla de Alcance Cerrado)
□ Cero tablas nuevas creadas — el esquema de §4 ya existe, solo se consume
□ personas.marcarPagador probado con dos llamadas concurrentes → nunca dos pagadores
  vigentes a la vez (test de integración contra fn_marcar_pagador)
□ Campo de participación no se envía cuando el rol no es copropietario (test unit del form)
□ Tab Documentos: botón "Subir" deshabilitado, ningún código intenta insert directo
□ Modo creación: tabs no-Datos-base inaccesibles (deshabilitados en UI Y sin ruta que los
  exponga — doble barrera, aunque aquí no hay riesgo de seguridad real, es de integridad de
  flujo)
□ /inmuebles/nuevo y /inmuebles/[id] renderizan el mismo componente compartido —
  sin lógica de tabs duplicada entre los dos
□ tsc --noEmit, eslint, build → gates §12.3 de PROMPT_MAESTRO_FASE1.md
```

---

# 10. Orden de Implementación

```text
T1 · db:push + db:types
     aplicar las 6 migraciones de §4.1 si no están aplicadas, regenerar tipos
        ↓
T2 · Stores
     inmuebles.ts, documentos.ts (nuevos) · extender cuentaCorriente.ts y liquidacion.ts
        ↓
T3 · InmuebleFicha.vue + rutas
     masthead, franja, tabs vacíos, /inmuebles/nuevo y /inmuebles/[id] funcionando
        ↓
T4 · InmuebleDatosBase.vue + InmueblePersonaForm.vue
     el tab más grande — datos generales, personas asociadas, rol condicional, pagador
        ↓
T5 · InmuebleCartera.vue + InmuebleNovedades.vue
     reutilizan cuentaCorriente.ts casi sin lógica nueva
        ↓
T6 · InmuebleLiquidaciones.vue + InmuebleHistoricos.vue
        ↓
T7 · InmuebleDocumentos.vue (solo lectura, botón subir deshabilitado)
        ↓
T8 · pages/inmuebles/index.vue (mínimo, §6.4)
```

No saltar T4 para llegar antes a T7 — Personas asociadas es la pieza con más lógica de
negocio (rol condicional, pagador atómico) y es donde más vale detectar un gap temprano.

---

# 11. Workflow y Formato de Reporte

Aplican sin cambios `PROMPT_MAESTRO_FASE1.md` §14 (workflow de 10 pasos, prohibido empezar
por "implementar") y §16 (formato de reporte al cerrar cada `T<n>`). No se repiten aquí.

---

# 12. Resumen Ejecutivo para el Agente

```text
Construyes la ficha de un inmueble: crear + mantener en una sola página, 6 tabs.

El esquema YA EXISTE — db:push + db:types antes de escribir una sola línea de Vue.
El diseño visual YA EXISTE — docs/mockups/ficha-inmueble.html es el contrato de forma.

El switch del mockup es demo. En la app real el modo lo decide la ruta:
  /inmuebles/nuevo vs /inmuebles/[id], mismo componente compartido.

Reutiliza cuentaCorriente.ts y liquidacion.ts — extiéndelos, no los dupliques.
personas.ts ya está completo, úsalo tal cual, incluido fn_marcar_pagador para el pagador.

El tab Documentos es de solo lectura en esta unidad de trabajo — la subida real está
bloqueada por un gap abierto (§8.1), no lo destrabes con un insert directo.

No inventas tablas, catálogos ni reglas de negocio nuevas. Ante ambigüedad: STOP, gap,
propuesta, esperas decisión.

Terminado = Definition of Done de §9 completa, no "compila".
```
