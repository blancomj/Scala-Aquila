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

### Fase 1 — Prueba en vivo (MVP visible, sin backend nuevo)

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

### Fase 2 — Editor DX básico (cliente, sin backend nuevo)

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

### Fase 3 — Versionado de reglas (backend nuevo — aquí sí se toca AD-23)

- Tabla de versiones (`RuleVersion`-equivalente) con estado
  `DRAFT/VALIDATED/PUBLISHED`, fuente congelada, y un hash del AST/fuente
  como "Artifact" mínimo (no implica VM ni bytecode todavía).
- Comparación de versiones (diff de fuente, Doc 10 §29/§163).

### Fase 4 — Publicación con seguridad (capabilities + maker-checker)

- Modelo de capabilities real (qué Contracts/Functions puede usar una regla,
  quién lo autoriza) — cambio de arquitectura genuino, no cosmético.
- Flujo `Draft→Review→Approved→Published` con checklist de bloqueo
  (§209-213).

### Fase 5 — Dependencias e impacto

- Exponer el grafo de dependencias por regla en UI, reutilizando
  `construirGrafo` de `liquidation-engine` donde aplique; impact analysis
  ("¿qué reglas usan este Contract?").

### Fase 6 — Test runner formal + snapshot testing

- Casos de prueba persistidos por concepto, ejecutables contra un
  snapshot fijo en vez de un inmueble real ad-hoc (que es lo que da la
  Fase 1).

### Fase 7 — Constructor visual (bloques arrastrables)

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

## 6. Backlog explícito — no planeado salvo necesidad real confirmada

Mismo criterio AD-23, aplicado literalmente a estos ítems del propio Doc 10:

- **Debugger** (breakpoints/step/watch, §49-56) — alto costo, bajo valor para
  un administrador de PH; el documento mismo lo trata como "puede incluir".
- **CLI + integración Git/CI** (§98-108) — solo tiene sentido si las reglas
  se versionan fuera de la base de datos; no es el modelo operativo actual.
- **Vista técnica de IR/AST crudo** — el propio Doc 10 §226 dice
  "NO RAW IR BY DEFAULT".
- **Bulk actions** (§203) — el propio Doc 10 dice "no implementar
  inicialmente, incrementan riesgo operativo".

## 7. Decisión a registrar en `PLAN_MAESTRO_IMPLEMENTACION.md`

Actualizar la fila `AD-23` en `§1.1` para reflejar la reversión parcial:

> **AD-23** — El pipeline completo (Artifact, verificador, VM) sigue
> diferido tal cual — construir solo si un caso de negocio real lo exige.
> **Revisado 2026-08-15**: la parte de experiencia de autoría de fórmulas
> (editor, prueba en vivo) sí tiene caso de negocio confirmado — ver
> `PLAN_AEL004_RULE_WORKSPACE.md`. El pipeline Artifact/VM/capabilities en
> sí (Fases 3-4 de ese plan) sigue condicionado a necesidad real, igual que
> antes.

## 8. Próxima acción

Ninguna todavía — este documento es el roadmap, no una entrega aprobada.
Cuando el usuario confirme arrancar, la Fase 1 se planifica en detalle
(entregas E1..En, mismo formato que el plan del motor de cuenta corriente)
antes de escribir código.
