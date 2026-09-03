# PLAN AEL-004 — Rule Workspace & Developer Experience

## 1. Contexto

`AD-23` (`PLAN_MAESTRO_IMPLEMENTACION.md §1.1`) diferío el pipeline completo de AEL
("Artifact, verificador, VM") mientras no hubiera un caso de negocio real que lo
exigiera. Hoy `apps/web/app/pages/conceptos/index.vue` es, por diseño, un
`<textarea>` con validación estática al vuelo — suficiente para probar el flujo
completo de liquidación, no una experiencia de autoría real.

El 2026-08-15 se presentó un mockup del constructor visual de fórmulas
("Editar fórmula — Cuota ordinaria de administración") que corresponde,
punto por punto, a **[`Docs/10_AEL_Developer_Experience_-_Builder_Editor__Rule_Workspace.md`](Docs/10_AEL_Developer_Experience_-_Builder_Editor__Rule_Workspace.md)**
— el documento canónico "AEL-004 — Rule Workspace & Developer Experience"
(261 requisitos numerados, fusión de los antiguos Docs 10 y 21). Este
documento **revisa AD-23 parcialmente**: ya no es "sin caso de negocio", el
caso de negocio es que las fórmulas de cobro son el núcleo del sistema y
merecen mejor herramienta que un textarea — pero la reversión es gradual,
por fases, con la misma disciplina de AD-23 (construir solo lo que tiene
valor confirmado, no todo el documento de una vez).

Este archivo es el plan de ejecución de AEL-004, en el mismo nivel que
`PLAN_MAESTRO_IMPLEMENTACION.md` lo es para el resto del proyecto — se
referencia desde ahí, no lo reemplaza.

## 2. Qué ya existe (base reutilizable, confirmado por código)

| Pieza                  | Dónde                                                                                    | Qué hace                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lexer/parser           | `packages/ael-language/src/{lexer,parser}.ts`                                            | texto AEL → tokens → AST (`Regla`). Nunca lanza — errores de sintaxis son `Diagnostico`s.                                                                      |
| Analizador estático    | `packages/ael-language/src/analyzer.ts`                                                  | chequeo de tipos sobre el AST contra un catálogo de Contracts/Functions.                                                                                       |
| Evaluador (intérprete) | `packages/ael-runtime/src/evaluator.ts::evaluar(regla, contexto)`                        | camina el AST directamente — **sin IR ni bytecode intermedio**. Devuelve `TypedValue` (NUMBER\|BOOLEAN\|MONEY\|NULO).                                          |
| Cadena completa        | `packages/liquidation-engine/src/executor.ts::evaluarConcepto()` (privada, no exportada) | `parsear → analizar → crearContexto → evaluar → dinero()` — el contrato "Docs/06 §428". Ya corre por inmueble individual dentro de una liquidación de periodo. |
| CRUD de conceptos      | `apps/web/app/stores/concepto.ts` + `pages/conceptos/index.vue`                          | crear/editar/archivar; validación estática client-side vía `utils/ael-validate.ts`.                                                                            |

**Confirmado por exploración de código:** Artifact/IR/bytecode/VM/opcodes/sandbox
**no existen en ninguna parte del repo** — la ejecución hoy es 100% un intérprete
que camina el AST. AD-23 sigue vigente en ese sentido estricto: nada de esto se
toca hasta Fase 3.

**Confirmado también:** `crearContexto()` no necesita el snapshot completo del
tenant — solo los datos del inmueble puntual, los `PARAMETER.*` que la fórmula
referencia, y (si la fórmula referencia otro `CONCEPTO.*`) su valor ya resuelto.
Evaluar una fórmula contra **un** inmueble real es barato y no requiere ninguna
de las piezas "pesadas" (`construirSnapshotDesdeSupabase`, `construirGrafo`,
`allocate()`) que sí hacen falta para liquidar un periodo completo.

## 3. Qué NO existe (el gap real detrás del mockup)

- **Versionado de reglas** — `conceptos` es una fila mutable con `estado`
  (borrador/activo/archivado), no `RuleVersion` con historial ni diff.
- **Artifact + hash** — nada se compila a una forma serializada/verificable;
  publicar hoy es solo `UPDATE conceptos SET estado='activo'`.
- **Modelo de capabilities** — el runtime no tiene noción de "esta regla
  requiere leer PROPERTY.X"; `ExecutionContext.resolverContract` resuelve
  cualquier contrato sin restricción declarada.
- **Flujo de publicación / maker-checker** — no existe estado
  `Draft→Review→Approved→Published`, ni bloqueo de publicación por checklist.
- **Test cases persistidos / test runner** — no hay tabla de casos de prueba
  por concepto, solo lo que el usuario prueba a mano.
- **Grafo de dependencias por regla, expuesto en UI** — existe
  `construirGrafo`/`ordenTopologico` en `liquidation-engine` pero es interno
  al motor de liquidación, no una vista de "qué usa esta regla".
- **Debugger, CLI, integración Git/CI** — no existen, ni falta que existan
  todavía.

## 4. Principio rector

Mismo criterio que AD-23, aplicado fase por fase: **cada fase debe entregar
valor usable por sí sola**, y no se empieza la siguiente sin confirmar que la
anterior demostró necesidad real. Ninguna fase después de la 2 se agenda
automáticamente — se decide cuándo llega el momento.

**Orden explícito confirmado por el usuario (2026-08-15): la parte visual
(bloques arrastrables, Fase 7) va al final.** Primero se construye la base
de texto — editor, prueba en vivo, versionado, publicación — y el
constructor visual se sincroniza contra eso al final, no al revés.

## 5. Fases

**Las 7 fases están completas (2026-08-15).** Lo que sigue describe el plan
tal como se aprobó antes de ejecutarlo — cada fase quedó marcada con el
commit que la entregó; el detalle de "qué construir" ya no es prospectivo,
es el registro de lo que se construyó.

### Fase 1 — Prueba en vivo (MVP visible, sin backend nuevo) ✅ `0f8ebd4`

Cubre Doc 10 §31-42 (`VALIDATE ACTION`/`VALIDATION RESULT`), §144-159
(`TEST PANEL`/`TEST RESULT`/`SIMULATION`), y el `CANONICAL USER JOURNEY` §261
(`DEFINIR area = PROPERTY.AREA_PRIVATE ... → 542250 COP`).

- Nueva función exportada (`packages/liquidation-engine/src/index.ts`) que
  envuelva el mismo patrón de `evaluarConcepto()` pero aceptando texto crudo
  y un solo inmueble: `probarFormula(formulaAelText, contexto) → {resultado,
tipo, diagnosticos}`.
- Edge Function `probar-formula` (agent-only) — server-side por
  §133 `NO CLIENT COMPILATION AUTHORITY`: el cliente puede parsear localmente
  para UX inmediata, pero la validación/ejecución con autoridad es del
  servidor. Recibe `{tenant_id, inmueble_id, formula_ael, tipo_base,
modo_calculo}`, arma un contexto mínimo desde Supabase (sin snapshot
  completo) y devuelve el resultado.
- UI: en `conceptos/index.vue`, agregar selector de inmueble + botón "Probar
  fórmula" + panel de resultado (variables usadas, resultado, tipo) — es la
  franja "Prueba de fórmula" del mockup, sin los bloques arrastrables (esos
  quedan para la Fase 7, ver §5).
- Sin tablas nuevas, sin tocar `AD-23` (no hay Artifact/IR de por medio).

### Fase 2 — Editor DX básico (cliente, sin backend nuevo) ✅ `2ff9e09`

Cubre Doc 10 §5-30 y su duplicado en §112-137 (Editor/Autocomplete/Hover).

- Reemplazar el `<textarea>` por un editor con resaltado de sintaxis,
  autocompletado de `PROPERTY.`/`PARAMETER.`/`CONCEPTO.` y funciones
  (reutilizando el catálogo que ya usa `analizar()`), y hover con
  documentación de cada contrato.
- Panel de diagnósticos dedicado (hoy es una lista plana bajo el textarea).
- Decisión técnica pendiente para cuando se planifique esta fase: editor
  ligero a medida vs. Monaco (el propio Doc 10 §97 aclara que AEL no debe
  _depender_ de Monaco — es una opción de la UI web, no un requisito del
  lenguaje).

### Fase 3 — Versionado de reglas (backend nuevo — aquí sí se toca AD-23) ✅ `2ff9e09`

- Tabla de versiones (`RuleVersion`-equivalente) con estado
  `DRAFT/VALIDATED/PUBLISHED`, fuente congelada, y un hash del AST/fuente
  como "Artifact" mínimo (no implica VM ni bytecode todavía).
- Comparación de versiones (diff de fuente, Doc 10 §29/§163).

### Fase 4 — Publicación con seguridad (capabilities + maker-checker) ✅ `203179c`

- Modelo de capabilities real (qué Contracts/Functions puede usar una regla,
  quién lo autoriza) — cambio de arquitectura genuino, no cosmético.
- Flujo `Draft→Review→Approved→Published` con checklist de bloqueo
  (§209-213).

### Fase 5 — Dependencias e impacto ✅ `203179c`

- Exponer el grafo de dependencias por regla en UI, reutilizando
  `construirGrafo` de `liquidation-engine` donde aplique; impact analysis
  ("¿qué reglas usan este Contract?").

### Fase 6 — Test runner formal + snapshot testing ✅ `203179c`

- Casos de prueba persistidos por concepto, ejecutables contra un
  snapshot fijo en vez de un inmueble real ad-hoc (que es lo que da la
  Fase 1).

### Fase 7 — Constructor visual (bloques arrastrables) ✅ `2c6acfd`, `e2d256c`, `d9cc331`

**Deliberadamente última**, por decisión explícita del usuario (2026-08-15):
la parte visual del mockup (paleta de variables + bloques SI/ENTONCES
arrastrables que se traducen a AEL) se construye **al final**, después de
que el editor de texto, la prueba en vivo, el versionado y la publicación ya
funcionen sobre la fórmula como texto. Razón: el constructor visual es una
capa de UI _sobre_ el mismo AEL de siempre (bidireccional: bloques ↔ texto)
— no aporta nada mientras no exista una base sólida de autoría/prueba/
publicación a la que sincronizarse, y es la pieza más costosa de construir
bien (edición bidireccional texto↔bloques sin perder información, layout de
canvas, drag-and-drop). Nótese que el propio Doc 10 no exige un builder
visual en ningún punto de sus 261 requisitos — el "Editor" que especifica es
siempre un editor de código con autocompletado/hover (Fase 2), nunca bloques
arrastrables. El constructor visual es, con todo, un valor añadido real del
mockup — por eso queda en el roadmap, solo que al final.

### Fase 8 — Rediseño del constructor visual (en curso, abierta 2026-09-02)

**Reabre el roadmap por necesidad real confirmada**, en los términos de AD-23:
el usuario reportó que el constructor de bloques «no es intuitivo, claro,
legible ni natural, y tiende a confundir». Una revisión de los cinco
componentes (más el diff de versiones, el tema de sintaxis del modo texto y la
página de dependencias) encontró 17 hallazgos en el lienzo y 9 adyacentes.

El alcance es **estrictamente la capa de presentación e interacción**: no se
toca la gramática de AEL, ni el modelo `BloqueRegla`, ni las conversiones
`astABloques`/`bloquesAAst`, ni el printer, ni el evaluador, ni la invariante
del lexema crudo. El texto sigue siendo la fuente de verdad y los bloques una
vista sobre él.

Diagnóstico de fondo: el modo Bloques **transcribía** el texto AEL token por
token en vez de **representarlo** — sin paréntesis y con 16 controles de
estructura alrededor de 6 de contenido (medido en vivo sobre
`RETORNAR (100 - 40) / 12`).

Cinco tandas, cada una entregable por separado:

| Tanda | Contenido | Estado |
| --- | --- | --- |
| **F0** — red de seguridad | Infraestructura de tests de componente (D-33) y fijación del render actual | ✅ |
| **F1** — legibilidad | 01 agrupamiento visible (D-34) · 02 chrome contextual · 03 etiquetas en español (`ael-etiquetas.ts`) · 10 sistema de diseño (D-35) | ✅ |
| **F2** — seguridad de edición | 04 deshacer/rehacer · 09 destinos de arrastre visibles y acotados a hojas | ✅ |
| **F3** — continuidad | 05 no perder el árbol al cambiar de modo, semilla para fórmula vacía, huecos explícitos · 08 diagnósticos anclados al nodo | ✅ |
| **F4** — un solo catálogo | 06 fusionar paleta y «Variables disponibles» (`AelBlockPaleta.vue` eliminado) · 07 valores en vivo sobre los bloques · 11 resumen en lenguaje llano (`ael-resumen.ts`) | ✅ |

**Restricción de orden:** 02 no puede entregarse sin 01. Hoy la posición de
los pares `↩ ⊕` es la única pista —accidental— del agrupamiento en el lienzo
editable; quitar el chrome antes de introducir las cajas dejaría el editor tan
ciego como estaba el diff.

**Higiene del módulo ✅** (aparte, sin dependencias con las tandas):

- `ConceptosEditor.vue` importa `concepto-labels.ts` en vez de redeclarar su
  propio mapa de color —`en_revision` era *warning* aquí y *primary* en el
  catálogo, el mismo estado con dos colores— y ya no muestra enums crudos en
  el badge, en la pestaña Auditoría, en la tabla de versiones ni en el aviso
  de solo lectura.
- Fuera de la interfaz la jerga de implementación: «AEL-004 Fase 1/6», «sin
  tocar Supabase», `passed`/`failed`, «Capabilities» con `READ_PARAMETER` /
  `USES_FUNCTION` (ahora «De qué depende esta fórmula» → «Parámetro — lee
  Presupuesto anual»), «Impacto por Contract/Function» y «Doc 10 §79-80» en
  la página de dependencias. Las descripciones del catálogo se reescribieron
  para quien administra una copropiedad —decían «Σ
  fuente_financiacion.valor_aplicado (tipo=otros_ingresos) — neteo GAP-19»—
  con la procedencia técnica movida al comentario de cada entrada.
- **Un texto que además mentía**: el hover de `UNIT` en el editor decía «sin
  datos cableados en liquidar-periodo todavía (D-13)». D-13 se revirtió y
  `snapshot-supabase.ts` sí puebla área y coeficiente; el hover afirmaba lo
  contrario de la realidad.
- Las cinco transiciones de estado piden confirmación en `UModal`, con el
  motivo de rechazo en un `UFormField` con etiqueta, ayuda y validación —era
  un `UInput` suelto de 160 px junto al botón que lo consumía. Las acciones
  en lote del catálogo ya confirmaban: la incoherencia estaba al revés de lo
  esperable.
- Los seis `<select>` crudos del formulario pasaron a `USelect`. Los de
  DENTRO de una expresión siguen siendo nativos a propósito (D-35).

## 6. Backlog explícito — no planeado salvo necesidad real confirmada

Mismo criterio AD-23, aplicado literalmente a estos ítems del propio Doc 10:

- **Debugger** (breakpoints/step/watch, §49-56) — alto costo, bajo valor para
  un administrador de PH; el documento mismo lo trata como "puede incluir".
- **CLI + integración Git/CI** (§98-108) — solo tiene sentido si las reglas
  se versionan fuera de la base de datos; no es el modelo operativo actual.

Dos ítems que estaban aquí (2026-08-15) se construyeron a pedido explícito del
usuario, con alcance acotado precisamente para respetar la reserva que el
propio Doc 10 hace sobre cada uno — no es que la reserva se haya descartado,
es que se implementó de forma consistente con ella:

- **Vista técnica de IR/AST crudo** — Doc 10 §226 dice "NO RAW IR BY DEFAULT",
  no "nunca". Implementada como panel colapsable oculto por defecto ("Ver IR"
  junto a Texto/Bloques en `pages/conceptos/index.vue`) — sigue sin ser
  visible de entrada.
- **Bulk actions** (§203, "no implementar inicialmente, incrementan riesgo
  operativo") — implementadas con alcance reducido a propósito: solo cambios
  de estado (nunca edición de contenido en lote), siempre con un modal de
  confirmación explícito que lista los códigos afectados antes de ejecutar.

## 7. Decisión a registrar en `PLAN_MAESTRO_IMPLEMENTACION.md`

Actualizar la fila `AD-23` en `§1.1` para reflejar la reversión parcial:

> **AD-23** — El pipeline completo (Artifact, verificador, VM) sigue
> diferido tal cual — construir solo si un caso de negocio real lo exige.
> **Revisado 2026-08-15**: la parte de experiencia de autoría de fórmulas
> (editor, prueba en vivo) sí tiene caso de negocio confirmado — ver
> `PLAN_AEL004_RULE_WORKSPACE.md`. El pipeline Artifact/VM/capabilities en
> sí (Fases 3-4 de ese plan) sigue condicionado a necesidad real, igual que
> antes.

## 8. Estado (actualizado 2026-09-02)

Las 7 fases de §5 están completas y verificadas (typecheck/lint/tests +
navegador). **La Fase 8 está abierta y en curso** — reabrió el roadmap una
necesidad real confirmada por el usuario (el constructor visual confunde), en
los términos que AD-23 exige. De §6, quedan diferidos **Debugger** y **CLI + integración
Git/CI** — sin caso de negocio confirmado. **GAP-20** (estados intermedios
de aprobación presupuestal) y **GAP-21** (sectorización comercial/mixta),
mencionados en `PLAN_MAESTRO_IMPLEMENTACION.md` §12.2, también siguen
diferidos por el mismo criterio — no son parte de este documento (son gaps
del motor de liquidación, no de AEL-004), se listan aquí solo para que no
se confundan con backlog pendiente de este plan.

**La Fase 8 está completa**: las cinco tandas, los once movimientos y la
higiene del módulo, verificados en navegador contra la app corriendo.

**Corrección posterior (2026-09-02).** Al repasar la lista de hallazgos
contra el código se encontró que tres cosas prometidas en el movimiento 10 no
se habían hecho, pese a que la tanda estaba marcada como cerrada:

1. **A2 seguía abierto** — el peor de los tres: los campos aún confirmaban con
   `@change` y descartaban en silencio lo inválido, con el DOM mostrando algo
   distinto de lo que se iba a guardar. Peor, el test escrito en F0 con un
   `TODO(F1)` afirmaba el defecto como comportamiento correcto y nadie volvió
   a él. Ahora se valida al escribir, la coma decimal colombiana se acepta y
   se normaliza a punto **sobre la cadena** (nunca `Number(x)`), el nodo
   explica por qué rechazó, y al salir del campo se restaura el último valor
   válido.
2. **X3 seguía abierto, y el documento afirmaba lo contrario.**
   `DESIGN_SYSTEM.md` decía que la paleta se declaraba una sola vez para los
   dos modos; `ael-codemirror.ts` no se había tocado desde la Fase 2/3. La
   afirmación además era conceptualmente confusa: CodeMirror colorea por tipo
   de token y los bloques por origen del dato, que son ejes distintos. Se
   resolvió declarando la paleta en `tokens.css` y haciendo que el resaltado
   del modo texto mire el contexto del token para colorear por origen —
   verificado en la app: mismo `rgb()` computado en los dos modos.
3. **Los blancos de pulsación** eran de 24 px con un mínimo de 32 en el
   sistema de diseño. Se ampliaron con un pseudo-elemento en vez de agrandar
   el botón, que habría ensanchado cada nodo y agravado el A7 recién
   corregido.

La lección para futuras tandas: marcar un movimiento como cerrado exige
repasar los hallazgos que decía cerrar, no solo el titular del movimiento.

Con eso,
este roadmap vuelve a modo AD-23: la siguiente fase (si la hay) se planifica
solo cuando exista una necesidad real confirmada, misma disciplina que abrió
este documento.

**Deuda conocida al abrir la Fase 8** (preexistente, verificada con `git
stash` — no la introdujo esta fase): `pnpm verify` está en rojo. Cuatro
fallos de gobernanza (ocho archivos `.vue` que derivaron del design system
desde que se congeló el allowlist de D-26, más deriva del registro de
`ERROR_CODES`) y 85 errores de `tsc`, todos en `tests/tenancy/*`. La
Definition of Done de cada tanda de la Fase 8 es, por tanto, **no añadir
fallos nuevos** y retirar los cinco archivos `AelBlock*`/`Ael*` del allowlist
`ARCHIVOS_LEGADO_GRAY` al completar el movimiento 10 — no «dejar verify en
verde», que no depende de esta fase.

Además, un servidor de desarrollo **recién arrancado** devuelve 500 en SSR en
toda ruta (`getActivePinia() was called but there was no active Pinia`); solo
funciona una instancia que lleve rato encendida. Reproducido en arranques
limpios y tras borrar `.nuxt` y la caché de Nuxt. No es de esta fase, pero
bloquea la verificación en navegador cada vez que hay que reiniciar el
servidor —por ejemplo tras instalar dependencias, que además re-enlaza
`node_modules` e invalida el grafo de módulos de cualquier servidor en
marcha.
