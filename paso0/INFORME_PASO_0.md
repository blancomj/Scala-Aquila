# PASO 0 — Validación del diseño antes de implementar

## Reglas piloto · verificación de gramática · Golden Case GC-001

> **Ejecutado por:** agente de implementación
> **Referencia:** `PLAN_MAESTRO_IMPLEMENTACION.md` §5.2
> **Estado:** completado con **1 hallazgo bloqueante** y 4 gaps de contrato
> **Fecha:** 2026-08-13

---

# 1. Verificación de gramática

Las tres reglas piloto de `01 §57 FASE 8` se escribieron como texto AEL y se contrastaron
contra la gramática EBNF de `02 §56-64`.

| Regla               | Archivo                          | Gramática | Catálogo de funciones             |
| ------------------- | -------------------------------- | --------- | --------------------------------- |
| CUOTA_BASICA        | `reglas/CUOTA_BASICA.ael`        | ✅        | —                                 |
| CUOTA_CON_DESCUENTO | `reglas/CUOTA_CON_DESCUENTO.ael` | ✅        | `PORCENTAJE` ✅                   |
| INTERES_MORA        | `reglas/INTERES_MORA.ael`        | ✅        | `MIN` `MAX` `REDONDEAR_DINERO` ✅ |

**Conclusión: la gramática de `02` expresa los tres casos sin ampliarla.**
No se requiere `MIENTRAS` en ninguno — consistente con AD-21 (AEL v0 sin bucles).

Construcciones usadas y su respaldo:

```text
REGLA / DEFINIR / RETORNAR       02 §56
SI ... ENTONCES ... SINO ... FIN 02 §56, §33
referencia_contract IDENT.IDENT  02 §62
llamada_funcion IDENT( args )    02 §63
operadores + - * / == >          02 §24, §27
VERDADERO                        02 §59
```

Verificación dimensional (`03`, `01 §16`):

```text
MONEY − MONEY            → MONEY    ✅  CUOTA_BASICA
MONEY × NUMBER           → MONEY    ✅  INTERES_MORA
MONEY / NUMBER           → MONEY    ✅  INTERES_MORA
PORCENTAJE(MONEY, NUM)   → MONEY    ✅  CUOTA_CON_DESCUENTO
```

---

# 2. 🔴 HALLAZGO BLOQUEANTE — `16 §22` y `19` son incompatibles

Este es el motivo por el que el Paso 0 existe. Se detectó **antes** de escribir código.

## 2.1 La contradicción

```text
16 §22  COEFFICIENT CHARGE
        amount = base × coefficient        ← fórmula por inmueble, independiente

19 §4-7 ALLOCATION
        allocation(sourceAmount, targets, basis)
        Σ allocations = sourceAmount       ← reparto conjunto con residual (19 §36)
```

**Producen resultados distintos.** Si cada inmueble calcula `base × coeficiente` por su
cuenta y redondea, la suma no devuelve el monto original. El residual se pierde o se
duplica, y **R1 falla**.

## 2.2 Demostración numérica

Presupuesto mensual a distribuir: **8.333.333 COP**
Seis inmuebles, coeficientes que suman exactamente 1,0.

| Inmueble |  Coef. |        Exacto | `16 §22` HALF_UP | `19` mayor resto |
| -------- | -----: | ------------: | ---------------: | ---------------: |
| INM-101  | 0,1500 |  1.249.999,95 |        1.250.000 |        1.250.000 |
| INM-102  | 0,1500 |  1.249.999,95 |        1.250.000 |        1.250.000 |
| INM-201  | 0,1650 | 1.374.999,945 |        1.375.000 |        1.375.000 |
| INM-202  | 0,1650 | 1.374.999,945 |        1.375.000 |        1.375.000 |
| INM-301  | 0,1850 | 1.541.666,605 |        1.541.667 |        1.541.667 |
| INM-302  | 0,1850 | 1.541.666,605 |        1.541.667 |    **1.541.666** |
| **Σ**    | 1,0000 |  8.333.333,00 | **8.333.334** ❌ | **8.333.333** ✅ |

`16 §22` **sobre-asigna 1 peso**. Repetido 12 meses × N copropiedades, es descuadre
sistemático contra el presupuesto.

## 2.3 Resolución propuesta

No se elimina ninguno de los dos: **son modos distintos y el concepto debe declarar cuál usa.**

```text
MODO DIRECTO        el importe del inmueble es independiente; no hay total que conservar
                    ej. cuota = área × tarifa_m2   (01 §52)
                    la fórmula AEL devuelve el importe DEL INMUEBLE

MODO DISTRIBUCIÓN   existe un total que debe conservarse exactamente
                    ej. presupuesto mensual repartido por coeficiente
                    la fórmula AEL devuelve el TOTAL A REPARTIR
                    el motor de allocation (19) hace el reparto
```

**Cambio de esquema requerido** en `PLAN_MAESTRO_IMPLEMENTACION.md` §4.3, tabla `conceptos`:

```sql
ALTER TABLE conceptos
  ADD COLUMN modo_calculo enum('directo','distribucion') NOT NULL;
```

Regla vinculante:

```text
modo_calculo = 'distribucion'  ⇒  el importe por inmueble SOLO puede provenir
                                   del motor de allocation de 19.
                                   Prohibido calcularlo en la fórmula.
```

`CUOTA_BASICA` es **modo distribución**: por eso su fórmula devuelve el monto anual a
recuperar, no la cuota de un inmueble.

---

# 3. Golden Case GC-001

Copropiedad de 6 inmuebles, ejercicio 2026, periodo enero.
Calculado a mano con las políticas de `PLAN_MAESTRO §6`.

## 3.1 Datos de entrada

```text
Presupuesto anual aprobado (acta 001-2026)   120.000.000 COP
Otros ingresos anuales                        20.000.000 COP
A recuperar vía cuotas                       100.000.000 COP
Política: HALF_UP · escala 0 · mayor resto · desempate id ASC
```

| Inmueble |    Área m² |      Coeficiente |
| -------- | ---------: | ---------------: |
| INM-101  |      75,50 |     0,1500000000 |
| INM-102  |      75,50 |     0,1500000000 |
| INM-201  |      82,30 |     0,1650000000 |
| INM-202  |      82,30 |     0,1650000000 |
| INM-301  |      95,00 |     0,1850000000 |
| INM-302  |      95,00 |     0,1850000000 |
| **Σ**    | **505,60** | **1,0000000000** |

Zona común presente: `ZC-001 Piscina`. **No produce línea** (R6).

## 3.2 Paso 1 — reparto anual en 12 periodos (R7)

```text
100.000.000 / 12 = 8.333.333,3333…
floor por mes    = 8.333.333        Σ = 99.999.996
residual         = 4 pesos
remainders       = 0,3333 en los 12 → empate total
desempate        = periodo ASC → enero, febrero, marzo, abril
```

| Periodo            | Cuota mensual |
| ------------------ | ------------: |
| Ene, Feb, Mar, Abr |     8.333.334 |
| May … Dic          |     8.333.333 |

**R7:** 4 × 8.333.334 + 8 × 8.333.333 = **100.000.000** ✅

## 3.3 Paso 2 — enero repartido entre inmuebles (R1)

Fuente: **8.333.334 COP**

| Inmueble |       Exacto |     Floor | Resto | +1  | **CUOTA_ADMIN** |
| -------- | -----------: | --------: | ----: | :-: | --------------: |
| INM-101  | 1.250.000,10 | 1.250.000 |  0,10 |     |       1.250.000 |
| INM-102  | 1.250.000,10 | 1.250.000 |  0,10 |     |       1.250.000 |
| INM-201  | 1.375.000,11 | 1.375.000 |  0,11 |     |       1.375.000 |
| INM-202  | 1.375.000,11 | 1.375.000 |  0,11 |     |       1.375.000 |
| INM-301  | 1.541.666,79 | 1.541.666 |  0,79 |  ✓  |       1.541.667 |
| INM-302  | 1.541.666,79 | 1.541.666 |  0,79 |  ✓  |       1.541.667 |
| **Σ**    | 8.333.334,00 | 8.333.332 |       |  2  |   **8.333.334** |

**R1:** Σ asignaciones = fuente ✅ · residual 2 pesos distribuido, no perdido.

## 3.4 Resultado esperado del periodo

`tenantTotal(2026-01)` = **8.333.334 COP** (solo CUOTA_ADMIN; el resto de conceptos se
añade al extender GC-001 con novedad, pago parcial e interés).

**R4:** Σ totalInmueble = tenantTotal ✅
**R6:** ZC-001 sin línea ✅

## 3.5 Estado

```text
⬜ PENDIENTE DE FIRMA del responsable funcional
```

El plan (§5.2) exige firma humana. Los importes están calculados y son verificables a
mano, pero **GC-001 no es contrato ejecutable hasta que alguien con autoridad funcional lo
firme**. No procedo a F3 sin esa firma.

---

# 4. Gaps de contrato detectados

Al escribir las reglas aparecieron referencias que el corpus **no define**. Ninguna
bloquea F0–F2; todas bloquean F4.

| ID         | Referencia usada                       | Problema                                                                                                                                                                                                                  |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GAP-19** | `CONCEPTO.CUOTA_BASICA`                | `18 §43-44` permite referenciar el resultado de otro concepto, pero **no existe un Contract `CONCEPTO`** definido en `07`. Hay que declararlo.                                                                            |
| **GAP-20** | `UNIT.SALDO_VENCIDO`, `UNIT.DIAS_MORA` | Son valores **derivados del snapshot** (`17 §22` prior balance), no atributos estáticos del inmueble. El Contract `UNIT` de `01 §22` solo expone área/código/estado. Hay que ampliarlo y marcar qué campos son derivados. |
| **GAP-21** | `UNIT.PAGO_OPORTUNO`                   | Depende de la fecha de pago **frente a la fecha de vencimiento del periodo**. Es un derivado temporal: hay que definir en qué momento del ciclo se evalúa.                                                                |
| **GAP-22** | `PARAMETER.*`                          | `01 §22` define Contracts con `tipo/unidad/versión/estado`, pero **no existe el catálogo de parámetros**. Los 8 usados en las reglas piloto deben registrarse con tipo y unidad.                                          |

---

# 5. Diagnóstico del repositorio (`0AEL §42`)

```text
Repositorio detectado    E:\proyectos\Scala  —  NO es repositorio git
Stack detectado          Node v24.14.0 · npm 11.11.0
                         ✗ pnpm      (01 §6 asume pnpm-workspace.yaml)
                         ✗ supabase CLI
                         ✗ docker    (requerido por supabase local)
Estado actual            Solo documentación. Cero código, cero package.json,
                         cero migraciones.
Documentos detectados    Docs/01-24 · PLAN_MAESTRO · PROMPT_MAESTRO_FASE1 · ANALISIS
Fase actual              PASO 0 — completado, pendiente de firma
Bloqueos                 1 bloqueante (§2) · 4 gaps de contrato (§4)
                         3 herramientas ausentes
Primera acción           Ver §6
```

---

# 6. Qué necesito para continuar

## 6.1 Decisión (bloquea el esquema de `conceptos`)

**Ratificar `modo_calculo`** (§2.3). Sin esto, `conceptos` queda mal diseñado y el error
se propaga a F3 y F5.

## 6.2 Firma

**GC-001** (§3.5) por el responsable funcional.

## 6.3 Herramientas

```text
pnpm            01 §6 especifica pnpm-workspace.yaml
supabase CLI    F0/F1 requieren Supabase local
docker          requerido por supabase start
```

Alternativa si no se quieren instalar: usar **npm workspaces** en lugar de pnpm (desviación
menor de `01 §6`, requiere aprobación) y un proyecto Supabase remoto de desarrollo en lugar
del entorno local (afecta a la reproducibilidad que exige `24 §17`).

## 6.4 Lo que NO he hecho, deliberadamente

```text
✗ No he creado el repositorio ni package.json
✗ No he escrito una sola línea de código de producción
✗ No he inventado los Contracts faltantes de §4
✗ No he elegido entre pnpm y npm
```

`21 §7` y `0AEL §6` prohíben inventar Contracts, parámetros y estructuras no definidas.
`PLAN_MAESTRO §5.2` sitúa el Paso 0 antes de F0. Ambas cosas se han respetado.
