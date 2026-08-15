# AQUILA_SAAS — E-16
## Reconciliación: el Motor Presupuestal como bloque autónomo del proceso presupuestal

**Proyecto:** AQUILA_SAAS
**Ámbito:** Administración de propiedad horizontal en Colombia
**Etapa:** Reconciliación arquitectónica (precede a cualquier implementación física)
**Versión:** 1.0
**Fecha:** 14 de agosto de 2026

---

# 1. Objetivo

E-05 a E-15 diseñaron el Motor Presupuestal como si AQUILA_SAAS no tuviera todavía
un motor financiero. No es el caso: para cuando se escribió esta serie de
entregables, F2 (dominio PH) ya tenía implementado, probado y en producción de
pruebas (GC-001) un motor de liquidación con lenguaje de fórmulas propio (AEL),
ejecución por grafo de dependencias, políticas financieras versionadas y fondo de
imprevistos con libro mayor propio.

Este documento **no vuelve a diseñar el motor**. Reconcilia E-05 a E-15 contra lo
que ya existe, separa lo que es **proceso de negocio genuinamente nuevo** de lo que
es **modelo de datos redundante**, y fija la frontera de un bloque autónomo que:

1. Añade el proceso de construcción presupuestal que hoy no existe.
2. Reutiliza cada mecanismo que AQUILA ya resolvió (AEL, grafo, políticas,
   fondo, coeficientes, catálogo de tipos).
3. No introduce una segunda fuente de verdad para lo que el motor de
   liquidación ya consume.

E-16 sustituye a E-10 a E-15 como referencia de implementación. E-05 a E-09
permanecen vigentes como **fundamento matemático y jurídico** — su álgebra no
cambia, solo su encaje físico.

---

# 2. Por qué esto no es un ajuste menor

`PLAN_MAESTRO_IMPLEMENTACION.md` registra como decisión cerrada (línea 424):

> *"Todo agrega en un único concepto `CUOTA_ADMIN`. El propietario ve una sola
> línea de cuota de administración con el total."*

E-05 a E-09 proponen exactamente lo contrario: presupuesto construido por
componentes independientes, cada uno con su propio ámbito, fuente de
financiación y regla de distribución. Esto **no es un detalle de
implementación** — reabre una decisión arquitectónica ya cerrada del plan
maestro de F2.

**Regla de este documento:** cualquier implementación derivada de E-16 requiere
registrar formalmente la reapertura de esa decisión como gap en
`PLAN_MAESTRO_IMPLEMENTACION.md §7` (mismo formato ya usado para GAP-15/16/17/18,
que viven en el mismo territorio presupuestal) antes de tocar
`presupuesto_rubros` o `conceptos`. **Ya registrado: GAP-19** — ver §12.1.

---

# 3. Lo que ya existe y resuelve lo que E-05 a E-15 daban por pendiente

| Necesidad del Motor Presupuestal | Ya resuelto en AQUILA por |
|---|---|
| Motor de fórmulas seguro (E-06 §11, E-13 §3: *"será objeto de implementación específica y segura posterior"*) | **AEL** (`packages/ael-language`, `ael-runtime`, `ael-core`) — lexer, parser, analizador, evaluador, con modelo de seguridad propio (`Docs/08_AEL_Security`) |
| Grafo de dependencias entre componentes, ejecución transaccional, reproducibilidad por hash | `packages/liquidation-engine/src/graph.ts` + `executor.ts` + `hash.ts` |
| Fondo de Imprevistos como fuente restringida, con base y porcentaje configurables (E-05 §10, E-07 §7, E-09 §12) | `fondos` / `fondo_movimientos` (saldo derivado por trigger) + `politicas_financieras.fondo_imprevistos_porcentaje` / `.fondo_imprevistos_base` — **GAP-15 cerrado** en el plan maestro |
| Coeficiente versionado, no solo el vigente (E-10 §14, DT-11.05) | `coeficiente_sets` / `coeficientes`, con RLS |
| `Σ coeficientes = 100 %` (RI-003, DI-003, T-UNI-001) | `politicas_financieras.coeficientes_suma_esperada` — **GAP-12 cerrado** |
| Redondeo y residual controlados (E-06 §22-23, E-08 §14, E-12 §15) | `politicas_financieras.redondeo_modo`, `.redondeo_escala`, `.residual_metodo` |
| Clasificación de rubros extensible, no un enum fijo (E-05 §6) | Ya migrado: `presupuesto_rubros.categoria_id` → `lista_tipos` (familia `CATEGORIA_RUBRO_PRESUPUESTAL`) — más flexible que el enum que proponía E-11 §5 |
| Inmutabilidad de presupuesto aprobado + nueva versión (E-10 §23, DT-008/009) | `guard_presupuesto_inmutable` (trigger, ya activo) |
| Conservación como compuerta antes de aprobar (MP-008, DI-004, V-002) | `guard_presupuesto_reconciliado`: `monto_total = Σ presupuesto_rubros.monto_anual`, exigido en la transición a `aprobado`/`vigente` |
| Separación "el motor produce insumo de cálculo, no obligación de cobro" (E-09 §3, DA-008) | Ya es la frontera real: `presupuestos` es planeación; `liquidaciones`/`liquidacion_lineas` (F5) son las obligaciones |

Ningún punto de esta tabla necesita tabla nueva. Necesitan, cuando mucho,
columnas adicionales sobre lo que ya existe.

---

# 4. El proceso presupuestal como fenómeno propio

Esto es lo que E-05 a E-15 sí identifican correctamente y que **no existe hoy
de ninguna forma**, ni como tabla ni como mecanismo:

> **Presupuestar es un proceso de negocio con fases, actores y compuertas de
> validación — no un formulario que un administrador llena de una vez.**

Hoy `presupuestos`/`presupuesto_rubros` son un contenedor estático: alguien
escribe `monto_total` y unos rubros, y el único control es que la suma
cuadre al aprobar. No existe:

- construcción incremental por componente, cada uno con su propio método de
  cálculo y su propia procedencia (contrato, histórico + proyección,
  cotización, parámetro);
- una etapa de preparación/propuesta distinta de la aprobación final —hoy el
  estado salta directo de `borrador` a `aprobado` (`presupuesto_estado_t`
  tiene 4 valores: `borrador, aprobado, vigente, cerrado`);
- fuentes de financiación distintas de "todo lo no cubierto se cobra";
- una vista previa de cómo quedaría distribuido el presupuesto **antes** de
  comprometerse ante la asamblea.

Esa es la parte que vale la pena rescatar como bloque autónomo: **el proceso
de ensamblar, calcular, financiar, previsualizar y aprobar** — no las 14
tablas paralelas de E-10/E-11.

---

# 5. Fases del proceso (especificación del bloque autónomo)

```text
1. PREPARAR
   → crear vigencia + presupuesto borrador

2. CONSTRUIR COMPONENTES
   → cada componente: naturaleza, ámbito, método de cálculo,
     fuente de financiación propuesta, regla de distribución propuesta

3. CALCULAR CADA COMPONENTE
   → vía AEL (formula_ael), no un evaluador nuevo
   → resultado + procedencia quedan registrados

4. DETERMINAR FINANCIACIÓN
   → por componente: cuota ordinaria / otros ingresos /
     cuota extraordinaria / fondo de imprevistos (validado contra
     politicas_financieras) / saldo aplicable
   → detectar déficit o superávit por componente

5. PREVISUALIZAR DISTRIBUCIÓN
   → vía graph.ts/executor.ts existente, en modo "simulación"
     (sin producir liquidación real)
   → por unidad, por componente, con coeficiente o módulo aplicado

6. VALIDAR EQUILIBRIO
   → extiende guard_presupuesto_reconciliado:
     Σ fuentes = Σ necesidad, por componente y por ámbito
   → bloquea el paso a "aprobado" si hay déficit no resuelto

7. PRESENTAR (diferido — GAP-20)
   → snapshot congelado para la asamblea (art. 38 Ley 675)
   → deja de aceptar cambios de componentes sin nueva versión
   → en este corte, el paso 6 valida directamente sobre "borrador"
     y se salta a 8; no hay estado "presentado" separado todavía

8. APROBAR
   → registra acta/decisión de asamblea (art. 35 Ley 675)
   → materializa el resultado en presupuesto_rubros / conceptos
   → dispara guard_presupuesto_inmutable en adelante

9. ACTIVAR (VIGENTE)
   → el liquidation-engine empieza a leerlo tal cual lo hace hoy
     (presupuestoVigente.montoTotal + conceptos) — sin cambios en
     snapshot.ts (el DataSnapshot y el algoritmo puro). El único cambio
     real (GAP-19, neteo) fue en snapshot-supabase.ts — el adaptador de
     I/O que ya tenía licencia exclusiva para hablar con Supabase —
     resolviendo PARAMETER.OTROS_INGRESOS_ANUAL desde
     Σ fuente_financiacion. Ver REC-008.

10. CERRAR
    → fin de vigencia; disponible como histórico para versión siguiente
```

Los pasos 1, 6 (parcial), 8 y 9 **ya existen** con el mecanismo actual. Los
pasos 2, 3, 4, 5 y el enriquecimiento de 6/7 son la parte nueva.

---

# 6. Frontera del bloque

```text
ENTRADA (reutilizada, no se duplica)
  tenants
  inmuebles, coeficiente_sets / coeficientes
  zonas_comunes
  politicas_financieras   (redondeo, residual, % fondo, Σcoeficientes)
  fondos / fondo_movimientos
  conceptos               (AEL — para el paso 3)
  lista_tipos             (clasificación de componentes/rubros)
        │
        ▼
┌───────────────────────────────────────┐
│      MOTOR PRESUPUESTAL (bloque nuevo)  │
│                                         │
│  Fases 2-7 de §5                       │
│  Máquina de estados actual (GAP-20)    │
│  Compuerta de equilibrio antes de      │
│    aprobar                             │
└─────────────────────┬───────────────────┘
                      ▼
SALIDA (materializa en tablas que ya existen)
  presupuestos.monto_total
  presupuesto_rubros      (uno o varios rubros, ya no un solo total)
  conceptos                (uno o varios, ya no solo CUOTA_ADMIN)
        │
        ▼
  liquidation-engine — SIN CAMBIOS. Sigue leyendo
  presupuestoVigente + conceptos, ajeno a cómo se construyeron.
```

Esta frontera es la garantía de que el bloque es autónomo sin ser paralelo:
todo lo que el motor de liquidación consume hoy sigue existiendo exactamente
igual; lo nuevo vive **antes** de ese punto de consumo, no al lado.

---

# 7. Qué es genuinamente nuevo (sin equivalente que reciclar)

| Elemento | Por qué no tiene equivalente hoy | En este corte |
|---|---|---|
| **Sector** | No existe sectorización en el modelo de dominio; indispensable para copropiedades comerciales/mixtas (art. 31 Ley 675) | **Diferido — GAP-21** |
| **Módulo de contribución** | Depende de `sector`; tampoco existe | **Diferido — GAP-21** |
| **Fuente de financiación** (otros ingresos, cuota extraordinaria, saldo aplicable) con regla de destinación | Hoy el único "ingreso" presupuestal es la cuota misma; no hay modelado de ingresos que reduzcan la necesidad a cobrar | Sí — no depende de `sector` |
| **Fundamento normativo** como tabla ligera reutilizable | No existe una tabla de referencias legales asociable a reglas; hoy el fundamento vive solo en comentarios SQL | Sí |
| **Estados intermedios** `en_preparacion` / `propuesto` / `presentado` en `presupuesto_estado_t` | El enum actual tiene 4 valores; el proceso real de la Ley 675 (preparar → presentar a asamblea → aprobar) tiene al menos uno más que hoy no se distingue | **Diferido — GAP-20** |
| **Vista previa de distribución** antes de comprometerse | Hoy la distribución solo ocurre en liquidación mensual, ya sobre un presupuesto vigente — no hay "borrador de cómo quedaría" | Sí |

---

# 8. Cambios mínimos propuestos (no tablas nuevas — extensión de lo existente)

Sin llegar todavía a DDL, la forma de estos cambios sería:

## 8.1 `presupuesto_rubros` → absorbe lo que E-10 llamaba `componente_presupuestal`

Columnas nuevas candidatas: `naturaleza` (gasto/ingreso), `ambito`
(general/sector/unidad — reutilizando el patrón ya usado por `lista_tipos`
para clasificación jurídica-libre), `metodo_calculo`,
`fuente_financiacion_tipo`, `fundamento_normativo_id` (nullable, FK a tabla
nueva y pequeña). `sector_id` **no** entra en este corte (GAP-21) — `ambito`
puede aceptar el valor `sector` desde ya sin que exista todavía la tabla
`sector`; simplemente no habrá filas que lo usen hasta que se implemente.

## 8.2 `conceptos` → deja de asumir un único concepto por presupuesto

`modo_calculo` y `formula_ael` ya soportan múltiples conceptos por tenant; lo
que falta es la relación explícita `concepto ↔ componente presupuestal` que
hoy no se necesita porque solo existe `CUOTA_ADMIN`.

## 8.3 `presupuesto_estado_t` — sin cambio en este corte (GAP-20)

Se mantiene `borrador, aprobado, vigente, cerrado`. Los estados intermedios
quedan diferidos; cuando se retomen, `guard_presupuesto_inmutable` y
`guard_presupuesto_reconciliado` se ajustan, no se reescriben.

## 8.4 Nuevas en este corte

`fuente_financiacion`, `fundamento_normativo`. Solo estas dos — `sector` y
`modulo_contribucion` quedan diferidas (GAP-21), así que el primer corte son
2 tablas nuevas, no 4 y mucho menos 14.

---

# 9. Relación explícita con AEL y liquidation-engine

El paso 3 (calcular cada componente) **no** debe implementarse como los nueve
`fn_calc_*` de E-12 §5. Cada método de cálculo (`CONTRATO`,
`CANTIDAD_X_TARIFA`, `HISTORICO`, `PROYECCION`, `PARAMETRIZADO`) es
expresable como una fórmula AEL sobre un `concepto`, reutilizando el mismo
evaluador ya certificado por `Docs/08_AEL_Security` y ya cubierto por
`ael-runtime`/`ael-language` tests.

El paso 5 (previsualizar distribución) **no** debe implementarse como
`fn_distribuir_coeficiente`/`fn_distribuir_modulo` en PL/pgSQL nuevos. Debe
invocar `graph.ts`/`executor.ts` en un modo que produzca un resultado sin
persistir una liquidación real — el mismo motor, una salida distinta.

Esto evita el riesgo señalado en E-13 §32 (el propio documento original lo
admite): una segunda implementación de fórmulas y distribución, con su propio
conjunto de bugs, corriendo en paralelo a la ya probada.

---

# 10. Validaciones que sí se preservan de E-05 a E-09 sin cambio

El álgebra de E-05 a E-09 no se toca — solo su implementación física:

```text
NF_k = G_k + FI_k - I_k
Σ C_{u,k} = NF_k
Σ P_{u,k} = 1
NF_total = ΣNF_k
Σ Fuentes = Σ Necesidades  (por componente y por ámbito)
```

Estas siguen siendo las reglas de integridad del bloque. Lo que cambia es
dónde se evalúan: hoy `guard_presupuesto_reconciliado` ya evalúa una versión
simplificada (`monto_total = Σrubros`); el bloque nuevo la generaliza a
multi-componente y multi-fuente sin sustituir el mecanismo de trigger que ya
funciona.

---

# 11. Decisiones cerradas de E-16

### REC-001
El Motor Presupuestal es un proceso, no un esquema paralelo. Su salida
materializa en `presupuestos` / `presupuesto_rubros` / `conceptos`.

### REC-002
Ningún componente calcula su valor fuera de AEL. No se construye un segundo
evaluador de fórmulas.

### REC-003
Ninguna distribución se calcula fuera de `graph.ts`/`executor.ts`. No se
construye un segundo motor de distribución.

### REC-004
`politicas_financieras`, `fondos`, `coeficiente_sets`/`coeficientes` no se
duplican bajo otro nombre. El bloque los consume tal como están.

### REC-005
`sector`, `modulo_contribucion`, `fuente_financiacion`,
`fundamento_normativo` son las únicas tablas genuinamente nuevas.

### REC-006
Reabrir "un único concepto `CUOTA_ADMIN`" requiere GAP formal en
`PLAN_MAESTRO_IMPLEMENTACION.md §7` antes de cualquier migración. **Cumplido:
GAP-19**, adoptado.

### REC-007
`presupuesto_estado_t` se enriquece con estados intermedios; los triggers de
inmutabilidad y reconciliación existentes se extienden, no se reescriben.

### REC-008
El `liquidation-engine` (`packages/liquidation-engine`, `snapshot.ts` y el
algoritmo puro incluidos) no requiere ningún cambio para que este bloque
funcione. **Excepción explícita, ya implementada**: `snapshot-supabase.ts`
—el único adaptador con licencia para hablar con Supabase, D-14— se
extendió para resolver `PARAMETER.OTROS_INGRESOS_ANUAL` desde
`Σ fuente_financiacion.valor_aplicado` (GAP-19, neteo). No es un segundo
motor ni un cambio al algoritmo: es la misma responsabilidad de
"construir el snapshot desde datos reales" que ya tenía, con una fuente
de datos nueva para un PARAMETER que antes no tenía ninguna.

---

# 12. Prerrequisitos

### PRERREQUISITO 16.1 — RESUELTO
Registrado como **GAP-19** en `PLAN_MAESTRO_IMPLEMENTACION.md §7`: reapertura
adoptada, presupuesto multi-componente vía E-16, sin bifurcar esquema.
**Físico completo**: esquema (`fuente_financiacion`/`fundamento_normativo`),
capa de exposición (RPC + Edge Functions `presupuesto-financiacion` /
`presupuesto-previsualizar`), UI (`apps/web/app/pages/presupuesto`,
`apps/web/app/pages/fundamentos`) y neteo contra `CUOTA_ADMIN` vía
`PARAMETER.OTROS_INGRESOS_ANUAL` (ver REC-006/REC-008).

### PRERREQUISITO 16.2 — RESUELTO
**Diferido**, registrado como **GAP-20**. GC-001 no ejercita ciclo de asamblea
real; `presupuesto_estado_t` se mantiene en sus 4 valores actuales
(`borrador, aprobado, vigente, cerrado`) hasta que exista esa necesidad
concreta.

### PRERREQUISITO 16.3 — RESUELTO
**Diferido**, registrado como **GAP-21**. `sector`/`modulo_contribucion`
quedan fuera del primer corte — GC-001 es puramente residencial. Se retoman
cuando exista un caso real de copropiedad mixta/comercial en el roadmap.
`fuente_financiacion` y `fundamento_normativo` **sí** entran en el primer
corte (§7, §8.4) porque no dependen de que exista `sector`.

---

# 13. Resultado

E-16 cierra la reconciliación: el Motor Presupuestal queda definido como un
**proceso de cinco fases nuevas** (construir, calcular, financiar,
previsualizar, validar-para-presentar) que se apoya íntegramente en lo que
AQUILA ya construyó (AEL, grafo, políticas, fondo, coeficientes, catálogo de
tipos) y que materializa su resultado en las mismas tablas que el motor de
liquidación ya consume, sin bifurcar la fuente de verdad.

El siguiente paso, si se continúa, es el diseño físico mínimo de las 4 tablas
nuevas de §8.4 y las columnas de extensión de §8.1/§8.3 — no un nuevo
documento conceptual.
