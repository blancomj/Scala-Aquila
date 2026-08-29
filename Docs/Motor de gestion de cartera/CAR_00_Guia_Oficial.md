# AQUILA_SAAS — MOTOR DE GESTIÓN DE CARTERA

## Guía oficial de diseño, desarrollo e implementación

| Campo | Valor |
|---|---|
| **Código de bloque** | `CAR` (Cartera / Collections) |
| **Estado del documento** | Guía oficial — normativa para diseño e implementación |
| **Versión** | 2.0 (enriquecida y reconciliada contra el código existente) |
| **Ruta canónica** | `Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md` |
| **Reemplaza a** | `Casos de uso/Gestion de cartera/AQUILA_PROMPT_Motor_Gestion_Cartera.md` (v1.0, prompt conceptual sin reconciliar) |
| **Documentos canónicos que consume** | `Docs/16`, `Docs/17`, `Docs/18`, `Docs/19`, `Docs/20`, `Docs/22`, `Docs/12`, `Docs/21`, `Docs/23`, `Docs/24` |
| **Código existente que NO puede contradecir** | `packages/liquidation-engine/src/cuenta-corriente.ts`, `supabase/migrations/20260816100000_cuenta_corriente_ledger.sql`, `PLAN_MAESTRO_IMPLEMENTACION.md` |
| **Patrón de reconciliación aplicado** | El de `Docs/Motor presupuestal/…E16_Reconciliacion_Bloque_Autonomo…md` |

---

# 0. Cómo usar este documento

## 0.1 Qué es

Este documento es simultáneamente:

1. **Especificación de dominio** — qué es la cartera, cómo se clasifica, cómo escala.
2. **Especificación técnica** — DDL, máquinas de estado, contratos de función, RLS.
3. **Prompt operativo para el agente implementador** — reglas de trabajo, prohibiciones, criterios de terminación.

No es un documento de ideas. Cada sección normativa es ejecutable o verificable.

## 0.2 Jerarquía normativa (orden de precedencia en caso de conflicto)

```text
1. Ley 675 de 2001 y normas que la modifican (Ley 2079 de 2021)
2. Código General del Proceso (Ley 1564 de 2012) — para lo judicial
3. Reglamento de Propiedad Horizontal de la copropiedad
4. Decisiones de Asamblea General debidamente actas
5. Documentos canónicos AQUILA 01–24
6. PLAN_MAESTRO_IMPLEMENTACION.md (decisiones AD-*, GAP-*, REQ-*)
7. Este documento
8. Criterio del implementador
```

Si este documento contradice un nivel superior, **gana el nivel superior y este documento se corrige**. No al revés.

## 0.3 Clasificación obligatoria de cada regla

Toda regla enunciada aquí lleva una de estas etiquetas. El agente implementador debe mantenerlas y debe etiquetar toda regla nueva que introduzca:

| Etiqueta | Significado | Puede cambiarse por |
|---|---|---|
| `[LEGAL]` | Derivada directamente de norma citada y verificable | Solo un cambio normativo |
| `[NEGOCIO]` | Regla de negocio derivada de la norma o de la práctica de PH | Decisión de producto |
| `[ARQ]` | Decisión arquitectónica de AQUILA | Decisión técnica documentada |
| `[CONFIG]` | Parámetro configurable por copropiedad | Configuración, sin código |
| `[PRQ]` | Prerrequisito de otro bloque | Se resuelve en el bloque dueño |
| `[GAP]` | Vacío conocido, no resuelto | Requiere trabajo explícito |
| `[VERIFICAR]` | Afirmación que requiere validación jurídica antes de implementarse | Concepto jurídico externo |

**Regla dura:** nunca presentar una decisión `[ARQ]` o `[NEGOCIO]` como si fuera `[LEGAL]`.

**Regla dura (D-24, DECISIONES.md):** todo bloque `create type ... as enum` dado
en este documento (§9.2, §11.1 y cualquier otro) es una propuesta de catálogo,
no una autorización a implementarlo tal cual. Antes de crear el tipo en una
migración real, evaluar si gatilla lógica/transición de estado (entonces sí es
un enum de Postgres, con su `COMMENT ON TYPE` explicando por qué) o si es
vocabulario descriptivo ampliable (entonces va a `lista_tipos`,
`20260814160000_tipos_lista_tipos.sql`). `tests/governance/enum-lista-tipos-
coverage.test.ts` hace cumplir esto — copiar un `CREATE TYPE` de aquí sin ese
comentario rompe `pnpm test`.

## 0.4 Desambiguación crítica del término "cartera"

`[ARQ]` En este repositorio la palabra "cartera" ya tiene **dos significados distintos**. Este documento usa exclusivamente el segundo:

| Uso | Significado | Alcance | Estado |
|---|---|---|---|
| **Cartera de administrador** | Portafolio de copropiedades que gestiona una misma persona/empresa | **Cross-tenant** | `GAP-17` — fuera de alcance, diferido, no relajar `SEC-03` |
| **Cartera vencida / gestión de cartera** ← **este documento** | Obligaciones vencidas y su cobro dentro de UNA copropiedad | **Intra-tenant** | Este bloque |

Además, el componente `apps/web/app/components/inmuebles/InmuebleCartera.vue` ya usa "Cartera" como nombre de pestaña de la cuenta corriente de un inmueble. **No implementa clasificación, antigüedad ni cobranza.** Este bloque lo extenderá; no lo reemplaza ni lo renombra sin decisión explícita.

## 0.5 Convención de nombres — decisión cerrada

`[ARQ]` **`REC-CAR-001`** — El prompt v1 proponía nombres de tabla en inglés (`portfolio_classification_policy`, `collection_action`, `judicial_case`). **Esto se rechaza.** El esquema físico de AQUILA es uniformemente **snake_case en español** (`cargos`, `pagos`, `pago_aplicaciones`, `politicas_financieras`, `novedades`, `liquidacion_lineas`). Introducir tablas en inglés crearía dos convenciones en la misma base de datos.

**Decisión:** todo objeto físico (tabla, columna, enum, función, vista, política RLS) de este bloque se nombra en **español snake_case**. Los tipos TypeScript del motor puro mantienen el estilo del paquete (`camelCase`, español), igual que `CargoAbierto`, `PlanImputacion`, `PoliticaMora`.

Tabla de equivalencias v1 → v2:

```text
portfolio_classification_policy   →  politicas_clasificacion_cartera
                                     politica_clasificacion_tramos
collection_strategy               →  estrategias_cobranza
collection_action                 →  acciones_cobranza
payment_promise                   →  promesas_pago
payment_agreement                 →  acuerdos_pago
payment_agreement_installment     →  acuerdo_pago_cuotas
judicial_case                     →  casos_juridicos
judicial_case_document            →  caso_juridico_documentos
judicial_cost                     →  costas_judiciales
collection_cost_policy            →  politicas_gastos_cobranza
portfolio_event                   →  eventos_cartera
PortfolioPosition                 →  v_posicion_cartera (vista) +
                                     posiciones_cartera_snapshot (histórico)
```

## 0.6 Ubicación del documento en el corpus

`[ARQ]` El corpus canónico `Docs/01…24` está **cerrado** (`Docs/24` declara explícitamente el cierre). Por tanto este bloque **no toma un número canónico nuevo**. Sigue el precedente del Motor Presupuestal: vive en su propia carpeta y se referencia por código de bloque `CAR`.

```text
Docs/
├── 01..24                       ← corpus canónico CERRADO
├── Motor presupuestal/          ← bloque autónomo (E01..E16)
├── Motor de formulas/           ← bloque autónomo
└── Motor de gestion de cartera/ ← ESTE BLOQUE
    └── CAR_00_Guia_Oficial.md   ← este documento
```

`[ARQ]` Convención de rutas: **sin tildes en nombres de carpeta y archivo**, coherente con `Motor presupuestal/`, `Motor de formulas/` y `Casos de uso/Barra de Busqueda/`.

Los entregables derivados se numeran a partir de aquí:

```text
CAR_00_Guia_Oficial.md              ← este documento (normativo)
CAR_01_Modelo_Datos_DDL.md          ← DDL consolidado y ejecutable
CAR_02_Maquinas_Estado.md           ← diagramas y tablas de transición
CAR_03_Diccionario_Datos.md         ← pendiente (F0)
CAR_04_Matriz_Legal_Extendida.md    ← con conceptos VER-CAR-* resueltos
CAR_05_Plan_Migracion.md            ← pendiente (F0)
CAR_06_Plan_Pruebas.md              ← pendiente (F0)
CAR_07_Enmiendas_Propuestas.md      ← integrado 2026-08-28 (ENM-CAR-01..04)
CAR_08_Roadmap_Pendiente.md         ← inventario de lo que falta (28 bloques)
CAR_09_Revision_Mockups.md          ← los 70 mockups, en tres cajones
CAR_10_Consulta_Juridica.md         ← consulta unica al abogado (CJ-1..CJ-8)
```

---

# 1. Objetivo y ciclo de vida

## 1.1 Objetivo

Diseñar e implementar el **Motor de Gestión de Cartera** de AQUILA_SAAS: el bloque que responde, para cada inmueble de una copropiedad y en cualquier fecha de corte, las preguntas:

```text
¿Cuánto debe?
¿Desde cuándo?
¿En qué clasificación de cartera está?
¿Qué acción de cobro corresponde ahora?
¿Qué se ha hecho ya y con qué resultado?
¿Debe escalar?
¿Puede certificarse la deuda para cobro ejecutivo?
```

## 1.2 Ciclo completo

```text
LIQUIDACIÓN (Docs 17-20, ya existe)
    ↓  materializa
CARGOS  (tabla cargos, ya existe)
    ↓  con fecha de vencimiento
VENCIMIENTO
    ↓
MORA  (calcularInteresMora, ya existe)
    ↓
ANTIGÜEDAD  ← INICIA ESTE BLOQUE
    ↓
CLASIFICACIÓN DE CARTERA
    ↓
ETAPA DE COBRO
    ↓
ACCIONES DE COBRANZA
    ↓
        ¿PAGO?
    ┌─────┴─────┐
   SÍ           NO
    ↓            ↓
IMPUTACIÓN   ESCALAMIENTO
(imputarPago,     ↓
 ya existe)   PREJURÍDICO
    ↓             ↓
 SALDO        JURÍDICO
              (art. 48 L675 → título ejecutivo)
                  ↓
            PROCESO JUDICIAL
                  ↓
          RESULTADO / COSTAS (CGP arts. 365-366)
```

## 1.3 Lo que este bloque NO hace

`[ARQ]` Delimitación negativa explícita. Este bloque **no**:

- No calcula intereses de mora → lo hace `calcularInteresMora()` en `packages/liquidation-engine/src/cuenta-corriente.ts`.
- No imputa pagos → lo hace `imputarPago()` en el mismo archivo.
- No liquida períodos → lo hace el motor de liquidación (`Docs/17-20`).
- No define la política financiera → vive en `politicas_financieras`.
- No emite estados de cuenta → existe `estados_cuenta_generados`.
- No agrega copropiedades entre sí → `GAP-17`, cross-tenant, prohibido.
- No evalúa fórmulas → todo cálculo parametrizable pasa por AEL.

---

# 2. Principio arquitectónico fundamental

`[ARQ]` **La separación de conceptos es la decisión de diseño más importante de este bloque.** Confundirlos es el error clásico en software de propiedad horizontal.

```text
Antigüedad de cartera
        ≠
Tasa de mora
        ≠
Etapa de cobranza
        ≠
Acción de cobranza
        ≠
Proceso jurídico
        ≠
Costas judiciales
```

Formalizado:

| Concepto | Pregunta que responde | Determinado por | Dueño |
|---|---|---|---|
| **Antigüedad** | ¿Cuántos días lleva vencida esta obligación? | `fecha_vencimiento` vs `fecha_corte` | Este bloque |
| **Tasa de mora** | ¿Cuánto interés se causa? | `politicas_financieras.interes_*` + Art. 30 L675 | Motor de mora (existe) |
| **Clasificación** | ¿En qué tramo de riesgo está el inmueble? | Política versionada de tramos | Este bloque |
| **Etapa de cobranza** | ¿En qué fase del proceso de cobro está? | Máquina de estados + eventos | Este bloque |
| **Acción de cobranza** | ¿Qué se hace y cuándo? | Estrategia configurable | Este bloque |
| **Proceso jurídico** | ¿Hay demanda? ¿en qué estado? | Actuación real del abogado/juzgado | Este bloque |
| **Costas** | ¿Cuánto liquidó el juez? | Auto de liquidación de costas (CGP 366) | Este bloque, solo por evidencia |

## 2.1 Los seis anti-patrones prohibidos

`[ARQ]` Cada uno de estos se ha visto en sistemas reales de PH y está **prohibido** en AQUILA:

```text
AP-01  Persistir un booleano "esta_en_mora" en el inmueble.
       → La mora es DERIVADA de obligaciones reales, nunca un flag.

AP-02  Escalar la tasa de mora con la antigüedad (30d=1%, 60d=2%...).
       → Ilegal. Art. 30 L675 fija un único tope; no hay tasa progresiva.

AP-03  Generar costas judiciales por antigüedad (180d=10%, 360d=15%).
       → Ilegal. Las costas las liquida el juez (CGP 366), no un cron.

AP-04  Reescribir o borrar cargos al firmar un acuerdo de pago.
       → El acuerdo es una capa de gestión; la obligación original sobrevive.

AP-05  Recalcular la clasificación histórica con la política vigente hoy.
       → Toda clasificación se congela con la versión de política que la produjo.

AP-06  Que la UI calcule saldos, antigüedad o clasificación.
       → Toda lógica financiera vive en el motor puro o en SQL, nunca en Vue.
```

---

# 3. Marco legal — matriz normativa

`[LEGAL]` Fundamento verificado. Toda regla financiera de este bloque debe trazar a una fila de esta matriz o declararse `[NEGOCIO]`.

## 3.1 Ley 675 de 2001

| Norma | Regla interpretada | Implicación para AQUILA | Etiqueta | Implementación |
|---|---|---|---|---|
| **Art. 29** | Los propietarios están obligados a contribuir a las expensas comunes necesarias según el **coeficiente de copropiedad** fijado en el reglamento. | La obligación nace de la liquidación por coeficiente. Ya implementado: `coeficiente_sets`/`coeficientes` → `liquidacion_lineas` → `cargos`. | `[LEGAL]` | Existe (motor de liquidación) |
| **Art. 30** | El retardo en el pago de expensas causa **interés de mora equivalente a una y media veces el interés bancario corriente** certificado por la Superintendencia (hoy Financiera), **sin perjuicio de que la asamblea establezca uno inferior**. | Tope legal = 1.5 × IBC. La asamblea puede fijar **menos**, nunca más. → `politicas_financieras.interes_tasa_mensual` (lo que decide la asamblea) y `interes_tope_mensual` (el tope legal). | `[LEGAL]` | Existe parcialmente |
| **Art. 30 (par.)** | Mientras subsista el incumplimiento, la situación puede publicarse en el edificio y constar en el acta de asamblea. | Habilita la acción `PUBLICACION_MOROSOS` como acción de cobranza, sujeta a habeas data. | `[LEGAL]` + `[VERIFICAR]` | Este bloque |
| **Art. 48** | La **certificación expedida por el administrador** sobre el valor adeudado, acompañada del certificado de existencia y representación legal, **presta mérito ejecutivo**. Debe señalar valores por expensas ordinarias, extraordinarias, intereses moratorios y sanciones. | Este es el artefacto crítico del bloque jurídico: `fn_certificar_deuda()` debe producir un documento inmutable, fechado, versionado y firmado, discriminado por los cuatro rubros del artículo. | `[LEGAL]` | Este bloque — **§18** |
| **Art. 51** | Funciones del administrador, incluida la de **cobrar y recaudar** cuotas, multas y demás obligaciones. | Legitima que el sistema ejecute acciones de cobro en nombre de la copropiedad y que el rol `admin` sea el responsable por defecto. | `[LEGAL]` | Este bloque (roles) |

## 3.2 Ley 2079 de 2021

| Norma | Regla interpretada | Implicación | Etiqueta |
|---|---|---|---|
| **Art. 44** (modifica art. 29 L675) | Para VIS/VIP de **5 o menos unidades**, la asamblea puede determinar de forma distinta qué expensas asumen los copropietarios. | La política de contribución debe ser configurable por copropiedad; no asumir coeficiente puro universalmente. Ya cubierto por `ApplicabilityPolicy`/coeficientes versionados. | `[LEGAL]` |
| **Art. 45** (modifica art. 35 L675) | Fondo de imprevistos **opcional** para VIS/VIP de 5 o menos unidades. | No es de este bloque (`fondos` ya existe), pero afecta la composición de la deuda certificable. | `[LEGAL]` |

## 3.3 Código General del Proceso (Ley 1564 de 2012)

| Norma | Regla interpretada | Implicación | Etiqueta |
|---|---|---|---|
| **Art. 365** | Condena en costas a la parte vencida, bajo criterio objetivo-valorativo. | Las costas **existen solo si hay condena**. No hay costas sin proceso ni sin sentencia/auto. | `[LEGAL]` |
| **Art. 366** | Las costas y **agencias en derecho** se liquidan de forma concentrada en el juzgado de primera instancia, una vez en firme la providencia. Son impugnables por reposición/apelación. | `costas_judiciales` solo admite registros con `documento_fuente` y `fecha_decision`. Estado `impugnada` obligatorio en la máquina de estados. | `[LEGAL]` |
| **Art. 366** | Las **agencias en derecho** dependen de las **tarifas del Consejo Superior de la Judicatura**, no del contrato privado de honorarios. | Prohibido derivar agencias en derecho de un % del contrato con el abogado. Se registran como valor decidido. | `[LEGAL]` |
| **Art. 422 y ss.** | Proceso ejecutivo: requiere título que preste mérito ejecutivo, obligación clara, expresa y exigible. | La certificación del art. 48 L675 es el título. `fn_certificar_deuda()` debe garantizar claridad, expresividad y exigibilidad (vencida). | `[LEGAL]` |

## 3.4 Tasa de referencia — Interés Bancario Corriente

`[LEGAL]` `[CONFIG]` La Superintendencia Financiera de Colombia **certifica mensualmente** el Interés Bancario Corriente por modalidad de crédito, mediante resolución. El IBC es la base para el máximo de interés remuneratorio y moratorio (C. Co. art. 884) y para la usura (C.P. art. 305).

Consecuencias de diseño:

```text
[ARQ] REC-CAR-002
La tasa NO se quema en código.  ← ya cumplido: politicas_financieras
La tasa es VERSIONADA por vigencia.
La fuente (número de resolución, fecha, modalidad) es TRAZABLE.
Actualizar el valor mensual es TAREA OPERATIVA, no despliegue de código.
```

`[GAP]` **`GAP-CAR-004`** — Hoy `politicas_financieras` tiene `interes_tasa_mensual` / `interes_tope_mensual` como columnas escalares dentro de la política, sin registro de la resolución fuente ni segmentación temporal intra-mora. Ver §14.3.

## 3.5 Lo que NO está resuelto y debe verificarse antes de implementar

`[VERIFICAR]` **No inventar. Bloquear si es crítico.**

| Id | Incertidumbre | Fuente que debe verificarse | ¿Bloqueante? |
|---|---|---|---|
| `VER-CAR-01` | ¿El IBC certificado es EA (efectivo anual)? ¿Cómo se convierte a mensual/diario para 1.5×? ¿1.5 se aplica a la tasa EA o a la mensual equivalente? | Doctrina Superfinanciera + concepto jurídico. Impacta directamente el monto cobrado. | **SÍ** |
| `VER-CAR-02` | ¿Los intereses de mora en PH admiten capitalización (anatocismo)? La doctrina mayoritaria dice **no**. | Concepto jurídico + reglamento de PH. | **SÍ** |
| `VER-CAR-03` | ¿Puede la copropiedad cobrar "gastos de cobranza prejurídica" y bajo qué límite? No hay porcentaje legal universal. | Reglamento de PH + acta de asamblea + concepto. | **SÍ** — ver §19 |
| `VER-CAR-04` | Publicación de morosos vs. Habeas Data (Ley 1581/2012). Qué datos, dónde, por cuánto tiempo. | Concepto de protección de datos. | **SÍ** para esa acción |
| `VER-CAR-05` | Prescripción de la obligación por expensas comunes: término, cómputo y **actos que la interrumpen**. | Régimen civil aplicable. Afecta indicadores, castigo de cartera, la alerta operativa de riesgo de prescripción y la política de retención de evidencia (§34.6). | **SÍ** — recalificado por `ENM-CAR-04`. Era "No (afecta BI)": correcto para un módulo supervisado por un abogado, incorrecto cuando se retira al abogado del seguimiento permanente y nadie vigila la prescripción. |
| `VER-CAR-07` | ¿Las expensas comunes son obligación a plazo con mora automática? ¿Alguna comunicación del administrador es requisito para causar intereses? | Concepto jurídico. Impacta el **texto de las plantillas** de requerimiento, que hoy podrían afirmar ante el deudor algo jurídicamente falso. | No para construir. **Sí** para el texto de las plantillas. Ver §9.2. |
| `VER-CAR-08` | Valor probatorio de WhatsApp como canal de notificación de cobro, y habeas data cuando el número se obtuvo para otra finalidad. | Concepto jurídico + protección de datos. | **SÍ** para usar WhatsApp en `requerimiento_formal` o `aviso_prejuridico`. Ver §34.2. |
| `VER-CAR-06` | Efecto de la transferencia de dominio sobre la deuda anterior (solidaridad del adquirente). | Art. 29 L675 + jurisprudencia. Afecta `PH-C24`/`PH-C25`. | **SÍ** para transferencias |

**Regla:** mientras un `VER-CAR-*` bloqueante esté abierto, la funcionalidad que depende de él queda en estado `BLOCKED` y **no se implementa con un valor por defecto inventado**.

`[ARQ]` **Consulta redactada.** `CAR_10_Consulta_Juridica.md` lleva los ocho puntos abiertos al abogado en un solo envío: `CJ-1..CJ-5` son los cinco de `ENM-CAR-04` (`VER-CAR-01`, `02`, `05`, `07`, `08`) y `CJ-6..CJ-8` suman los tres que ya estaban bloqueantes (`VER-CAR-03`, `04`, `06`). El §5 de ese documento es el registro de respuestas: cerrar un `VER-CAR-*` exige editar esta tabla **y** dejar el rastro allí.

---

# 4. Reconciliación con lo que ya existe

`[ARQ]` Aplicando el patrón de `E16 — Reconciliación de Bloque Autónomo`. El prompt v1 se escribió como si el dominio financiero no existiera. **Sí existe y está en funcionamiento.**

## 4.1 Tabla de reconciliación: necesidad declarada → qué ya la resuelve

| # | Necesidad del prompt v1 | ¿Ya existe en AQUILA? | Objeto real | Veredicto |
|---|---|---|---|---|
| 1 | `FinancialObligation` | **Sí** | Tabla `cargos` (append-only, `categoria` ∈ capital/interes/otro) | **Reutilizar.** No crear entidad nueva. |
| 2 | Saldo de la obligación | **Sí** | Vista `v_cargo_saldo` = `monto_original − Σ pago_aplicaciones.monto` | **Reutilizar.** Nunca persistir saldo. |
| 3 | `Payment` | **Sí** | Tabla `pagos` (inmutable) | **Reutilizar.** |
| 4 | `PaymentAllocation` | **Sí** | Tabla `pago_aplicaciones` + guard `guard_pago_aplicacion_no_excede` | **Reutilizar.** |
| 5 | `PaymentAllocationPolicy` | **Sí** | `politicas_financieras.imputacion_orden` + `imputacion_estrategia` (AD-36) | **Reutilizar.** |
| 6 | Algoritmo de imputación | **Sí** | `imputarPago()` — waterfall greedy, `packages/liquidation-engine/src/cuenta-corriente.ts` | **Reutilizar.** No escribir un segundo imputador. |
| 7 | `InterestRateVersion` | **Parcial** | Columnas `interes_tasa_mensual`, `interes_tope_mensual`, `interes_dias_gracia`, `interes_day_count`, `interes_descuento_orden` en `politicas_financieras` | **Extender** — ver `GAP-CAR-004`. |
| 8 | Cálculo de interés / `InterestSegment` | **Parcial** | `calcularInteresMora()` (day-count configurable, D-23) | **Reutilizar**; falta segmentación por cambio de tasa intra-mora. |
| 9 | Ajustes / novedades | **Sí** | `novedades` + `fn_aprobar_novedad` → materializa `cargos.categoria='otro'` (AD-33) | **Reutilizar.** |
| 10 | `Snapshot` / reproducibilidad | **Sí** | Motor de liquidación: `result_hash`, `policy_hash`, `snapshotHash` (Docs 17/20) | **Reutilizar el patrón**, aplicarlo a cartera. |
| 11 | Auditoría | **Sí** | `audit_log` | **Reutilizar** para actor/acción; añadir `eventos_cartera` para semántica de dominio. |
| 12 | Aislamiento multi-tenant | **Sí** | `tenant_id` + RLS `enable + force` en toda tabla | **Obligatorio replicar.** |
| 13 | Política versionada | **Sí** (patrón) | `politicas_financieras`: `version`, `estado`, `vigente_desde/hasta`, `policy_hash`, unicidad de vigente, `guard_politica_inmutable` | **Obligatorio replicar el patrón.** |
| 14 | Antigüedad / `daysOverdue` | **No** | — | **Nuevo.** |
| 15 | Clasificación de cartera | **No** | — | **Nuevo.** |
| 16 | Estrategias y acciones de cobranza | **No** | — | **Nuevo.** |
| 17 | Promesas y acuerdos de pago | **No** | — | **Nuevo.** |
| 18 | Escalamiento | **No** | — | **Nuevo.** |
| 19 | Gestión jurídica y costas | **No** | — | **Nuevo.** |
| 20 | Notificaciones | **No** | — | **`[PRQ]` externo** — ver `PRQ-CAR-009`. |

**Conclusión:** de 20 necesidades, **13 ya están resueltas**. Lo genuinamente nuevo son los puntos 14–19: el **proceso de gestión**, no el modelo financiero.

## 4.2 Frontera del bloque

`[ARQ]` **`REC-CAR-003`**

```text
        ENTRADA (solo lectura, NO redefinir)
        ┌───────────────────────────────────────────┐
        │ cargos · v_cargo_saldo · pagos            │
        │ pago_aplicaciones · politicas_financieras │
        │ periodos · inmuebles · terceros           │
        │ inmueble_persona_rol · conceptos          │
        └───────────────────┬───────────────────────┘
                            ↓
        ┌───────────────────────────────────────────┐
        │      BLOQUE MOTOR DE GESTIÓN DE CARTERA   │
        │                                           │
        │  antigüedad → clasificación → etapa →     │
        │  acción → promesa/acuerdo → escalamiento  │
        │  → jurídico → costas                      │
        │                                           │
        │  (proceso de negocio; cero cálculo        │
        │   financiero propio)                      │
        └───────────────────┬───────────────────────┘
                            ↓
        SALIDA (materializa donde el consumidor ya lee)
        ┌───────────────────────────────────────────┐
        │ · cargos (categoría 'otro') ← gastos de   │
        │   cobranza aprobados, vía novedades       │
        │ · eventos_cartera ← trazabilidad          │
        │ · certificaciones_deuda ← art. 48 L675    │
        │ · v_posicion_cartera ← lectura para UI/BI │
        └───────────────────────────────────────────┘
```

**Regla de frontera dura:** este bloque **nunca** hace `INSERT` directo en `cargos`. Si un gasto de cobranza debe volverse deuda, entra por `novedades` → `fn_aprobar_novedad` (AD-33), respetando el flujo de aprobación existente.

## 4.3 Decisiones cerradas de reconciliación

```text
REC-CAR-001  Nombres físicos en español snake_case. No inglés.
REC-CAR-002  Ninguna tasa se quema en código. Versionada y trazable a resolución.
REC-CAR-003  El bloque no escribe en cargos directamente. Entra por novedades.
REC-CAR-004  El bloque no implementa un segundo imputador ni un segundo
             calculador de interés. Usa imputarPago() y calcularInteresMora().
REC-CAR-005  La posición de cartera es DERIVADA (vista). El snapshot histórico
             es una materialización fechada, no la fuente de verdad.
REC-CAR-006  Toda política de este bloque replica el patrón de
             politicas_financieras: version + estado + vigencia + hash +
             inmutabilidad una vez vigente.
REC-CAR-007  Toda tabla nueva lleva tenant_id + RLS enable & force. Sin excepción.
REC-CAR-008  Toda función de cálculo recibe fecha_referencia explícita.
             Prohibido now()/Date.now() implícito dentro de la lógica (AD-32).
```

## 4.4 GAPs detectados en la reconciliación

`[GAP]` Vacíos reales encontrados al contrastar el prompt v1 contra el esquema. **Deben resolverse antes o durante la fase indicada.**

| Id | Descripción | Impacto | Fase |
|---|---|---|---|
| **`GAP-CAR-001`** | `cargos` no tiene `fecha_vencimiento`; se deriva de `periodos.fecha_vencimiento`, que **existe pero es `nullable`**. Un período sin fecha de vencimiento produce antigüedad indefinida. | **Bloqueante** — reducido de "total" a "acotado" tras verificación. | F0 |
| **`GAP-CAR-002`** | No existe concepto de "fecha de corte" persistida para reproducir una clasificación histórica. | Impide `PH-C27` (snapshot reproducible). | F3 |
| **`GAP-CAR-003`** | `pagos` no tiene `fecha_pago` vs `fecha_registro` diferenciadas para efectos de mora (hoy solo `fecha_pago`). Un pago registrado tarde con fecha anterior altera la antigüedad retroactivamente. | Afecta idempotencia del job diario. | F3 |
| ~~`GAP-CAR-004`~~ | ✅ **RESUELTO.** `tasas_referencia` + `interes_tipo_tasa`/`interes_multiplicador` + guard de tope legal + `calcularInteresMora(..., segmentos?)` — los tres implementados y aplicados (F2). Solo falta la carga real del IBC vigente (tarea operativa, no de código, §3.4). | Ninguno. `PH-C11`/`PH-C36`/`PH-C37` implementables y verificados. | — |
| ~~`GAP-CAR-005`~~ | ✅ **RESUELTO PARA SMS (2026-08-17), verificado end-to-end.** `plantillas_sms` + `sendSms()` real vía Brevo Transactional SMS (commit `Plantillas sms configurables`), consumido por `supabase/functions/ejecutar-accion-cobranza/index.ts` — desplegado, `BREVO_SMS_SENDER` configurado como secreto del proyecto, SMS real enviado y confirmado recibido en un teléfono real por el usuario. **email/WhatsApp siguen sin resolver para el canal de cobranza**: existe un sistema de plantillas de correo generalizado (`email_templates` + `guardar-plantilla-email`/`sincronizar-plantilla-email`/`probar-plantilla-email` + panel `apps/web/app/pages/configuracion/plantillas-email.vue`, 2026-08-17, ver `PROMPT_PLANTILLAS_EMAIL.md`) que reutiliza los 4 `event_type` de cartera, pero **ningún worker dispara correo real todavía** (el worker de F4 solo dispara SMS) y la sincronización contra Brevo está bloqueada por un problema de verificación de remitente en la cuenta (`Sender is invalid / inactive`), aplazado por el usuario. `invite-user/index.ts` sigue aparte, con HTML inline, sin migrar a este sistema. WhatsApp no tiene proveedor configurado. Tampoco hay infraestructura de tareas/colas más allá de un único `cron.schedule` (purga de `audit_log`) — el worker de F4 se invoca manualmente, una acción a la vez, sin orquestación de lote todavía. | Ya no bloquea F4 para canal SMS. Sigue bloqueando email/WhatsApp y la orquestación por lotes. | F4 — `PRQ-CAR-009/010` |
| ~~`GAP-CAR-006`~~ | ✅ **RESUELTO por verificación.** `inmueble_persona_rol` (antes `inmueble_propietario`, renombrada en `20260820100000`/`20260821100000` junto con `propietarios→terceros`) **sí** es temporal: tiene `vigente_desde date not null`, `vigente_hasta date` (nullable) y `porcentaje numeric(6,3)` con check `> 0 and <= 100`. Cubre historial de propiedad y solidaridad proporcional. | Ninguno. `PH-C24`/`PH-C25` son implementables. | — |
| ~~`GAP-CAR-007`~~ | ✅ **VERIFICADO RESUELTO (2026-08-17) — no bloqueaba.** Ya existía `documentos` (generalizada en `20260822130000`, antes `documentos_inmueble`), el bucket `documentos-inmueble` y la Edge Function `subir-documento` con upload+rollback reales, probados (`tests/tenancy/subir-documento.test.ts`). F7 la generalizó una vez más con `caso_juridico_id` nullable en vez de crear `caso_juridico_documentos` como tabla paralela (REC-CAR-004). `subir-documento` todavía no acepta ese campo — extensión de la Edge Function/frontend pendiente. | Ya no bloquea F7. | — |
| ~~`GAP-CAR-009`~~ | ✅ **RESUELTO parcialmente (2026-08-17).** `tenant_role_t` ahora tiene `('auxiliar','auditor','administrador')` (`agent` renombrado a `auxiliar` en `20260830100000`) — `administrador` hereda los permisos de `auxiliar` vía `has_role()` ampliado, sin reescribir las 88 policies existentes. Rol `residente` sigue sin existir (no bloquea F1-F9). Ver §21.2. | Ya no bloquea la separación proponer/aprobar de F4 ni la certificación del art. 48. | F4 |
| **`GAP-CAR-010`** | No existe vínculo `usuario ↔ inmueble`, y **`AD-26` lo prohíbe explícitamente** (propietario = dato de dominio, sin FK a `auth.users`). | ⤴ **Escalado fuera del bloque.** `PH-C35`/`REQ-CAR-025` quedan diferidos; **no bloquea F1-F9**. Ver §21.4. | — |
| **`GAP-CAR-012`** | (Nuevo, 2026-08-28) **El canal físico no puede producir una guía postal despachable.** `terceros.direccion` **sí existe** (añadida en `20260821100000`, la generalización desde `propietarios`) — el gap se **reduce**, como pasó con `GAP-CAR-001`: no falta la dirección, faltan (a) el **municipio de destino**, sin el cual ningún operador postal admite una guía, y (b) la **constancia de verificación** de esa dirección. Una notificación enviada a una dirección nunca verificada es la primera que ataca la defensa. | **Acotado.** Bloquea el canal físico en `carta`, `requerimiento_formal` y `aviso_prejuridico` — las acciones de mayor peso probatorio (§34.2). Se resuelve con dos columnas aditivas + `PRQ-CAR-020`. | §34 |
| **`GAP-CAR-011`** | (Nuevo, 2026-08-17) El esquema no distingue una cuota extraordinaria (`fuente_financiacion.cuota_extraordinaria` es del presupuesto, no del cargo) ni una sanción (`TIPO_NOVEDAD` en `lista_tipos` existe sembrado pero ningún código lo referencia) a nivel de `cargos`. `fn_certificar_deuda` no puede discriminar esos 2 de los 4 rubros del art. 48 con certeza — decisión explícita del usuario: quedan siempre en 0, documentado, no inventado. | Certificaciones de deuda (F7) tienen `monto_expensas_extraordinarias`/`monto_sanciones` siempre en 0. No bloquea F7 (el total y los otros 3 rubros son exactos). | F7 |

### `GAP-CAR-001` — resolución (verificada contra el esquema)

`[ARQ]` **Verificación realizada.** `periodos` **sí tiene** la columna:

```sql
-- 20260814100100_domain_tables.sql:171-185
create table public.periodos (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  anio              int not null,
  mes               int not null,
  estado            public.periodo_estado_t not null default 'abierto',
  fecha_vencimiento date,                                   -- ⚠ NULLABLE
  cerrado_at        timestamptz,
  cerrado_por       uuid references public.profiles (id),
  ...
);
```

Esto **reduce el gap** de "no existe la fecha de vencimiento" a "la fecha de vencimiento es opcional". El diseño ya contemplaba el concepto; solo no lo hace obligatorio.

```text
Opción A (CONFIRMADA VIABLE): derivar de periodos.
  cargos.periodo_id → periodos.fecha_vencimiento
  + La columna YA EXISTE. Sin migración destructiva.
  + Una sola fuente de verdad para el vencimiento del período.
  ⚠ Es nullable: un período sin fecha produce antigüedad indefinida.

Opción B: cargos.fecha_vencimiento date (nullable) como override.
  + Soporta cuotas extraordinarias con calendario propio.
  + Aditiva y no rompe el append-only.

DECISIÓN: Opción A como base + Opción B como override opcional.
  fecha_vencimiento_efectiva(cargo) =
      coalesce(cargo.fecha_vencimiento, periodo.fecha_vencimiento)
```

**Trabajo real que queda en F0** (mucho menor de lo estimado inicialmente):

```text
1. Guard: un período no puede pasar a estado 'en_liquidacion'
   con fecha_vencimiento NULL.
   → extender guard_periodo_transicion() (ya existe, 20260814100300)
2. Backfill de periodos históricos con fecha_vencimiento NULL.
3. Añadir cargos.fecha_vencimiento nullable (override).
4. Función fn_dias_mora(cargo_id, fecha_corte) con el coalesce.
5. Error explícito PeriodoSinFechaVencimientoError — nunca asumir
   un día del mes por defecto.
```

`[ARQ]` El punto 5 es crítico: **nunca inferir "vence el día 10"** porque sea lo habitual. Un vencimiento inventado produce una mora inventada, que produce un interés inventado que se le cobra a una persona real.

---

# 5. Responsabilidades de dominio

`[ARQ]` Siete responsabilidades. **No son siete módulos de UI ni siete paquetes.** Son fronteras de responsabilidad.

```text
R1  MOTOR DE CARTERA        Antigüedad · clasificación · riesgo · posición
R2  MOTOR DE COBRANZA       Estrategias · acciones · seguimiento · resultado
R3  MOTOR DE ESCALAMIENTO   Preventiva→Administrativa→Prejurídica→Jurídica
R4  GESTIÓN JURÍDICA        Certificación · expediente · proceso · actuaciones
R5  MOTOR DE MORA           Intereses por obligación y período      ← YA EXISTE
R6  MOTOR DE PAGOS          Aplicación · saldo · crédito            ← YA EXISTE
R7  AUDITORÍA Y REPORTES    Trazabilidad · indicadores · evidencia
```

## 5.1 Matriz de responsabilidad por artefacto

| Responsabilidad | Paquete / capa | Artefacto principal | Estado |
|---|---|---|---|
| R1 | `packages/liquidation-engine/src/cartera.ts` (nuevo, puro) | `clasificarCartera()`, `calcularAntiguedad()` | Nuevo |
| R1 | SQL | `v_posicion_cartera`, `v_cargo_antiguedad` | Nuevo |
| R2 | SQL + Edge Function | `estrategias_cobranza`, `fn_evaluar_acciones_pendientes()` | Nuevo |
| R3 | `packages/liquidation-engine/src/cartera-escalamiento.ts` | `evaluarEscalamiento()` (máquina de estados pura) | Nuevo |
| R4 | Edge Function + SQL | `fn_certificar_deuda()`, `casos_juridicos` | Nuevo |
| R5 | `packages/liquidation-engine/src/cuenta-corriente.ts` | `calcularInteresMora()` | **Existe** |
| R6 | `packages/liquidation-engine/src/cuenta-corriente.ts` | `imputarPago()` | **Existe** |
| R7 | SQL | `eventos_cartera`, `audit_log`, vistas de indicadores | Parcial |

## 5.2 Regla de pureza

`[ARQ]` **`REC-CAR-009`** — Toda lógica de decisión (clasificar, escalar, decidir si corresponde una acción) vive en **funciones puras** de `packages/liquidation-engine`, sin dependencia de Supabase, igual que `allocation.ts`, `graph.ts` y `cuenta-corriente.ts`. Los adaptadores I/O van en archivos `*-supabase.ts`, siguiendo el precedente de `cuenta-corriente-supabase.ts`.

Motivo: testabilidad determinista y reutilización desde Edge Functions, jobs y pruebas sin base de datos.

---

# 6. Posición de cartera

## 6.1 Principio

`[ARQ]` `[NEGOCIO]` **La posición de cartera es derivada, nunca declarada.**

```text
Un inmueble tiene cartera vencida
        ⟺
existe al menos un cargo con
    fecha_vencimiento < fecha_corte
    AND saldo > 0
```

No existe un campo `esta_en_mora`. No existe un botón "marcar como moroso". Si el dato no se puede derivar de `cargos` + `pago_aplicaciones`, no es cartera.

## 6.2 Vista `v_posicion_cartera`

Contrato conceptual (equivalente español del `PortfolioPosition` v1):

```text
v_posicion_cartera
------------------
tenant_id                    uuid
inmueble_id                  uuid
fecha_corte                  date        ← parámetro, no columna almacenada
deuda_total                  numeric(18,2)
deuda_capital                numeric(18,2)
deuda_interes                numeric(18,2)
deuda_otros                  numeric(18,2)   ← ajustes, gastos aprobados
saldo_credito                numeric(18,2)   ← excedentes no aplicados
cargo_vencido_mas_antiguo_id uuid
fecha_vencimiento_mas_antigua date
dias_mora_maximo             int             ← el que clasifica
periodo_mas_antiguo_id       uuid
cantidad_cargos_vencidos     int
clasificacion_codigo         text
clasificacion_version        int
nivel_riesgo                 text
etapa_cobranza               text
estado_cobranza              text
fecha_ultimo_pago            date
ultima_accion_id             uuid
proxima_accion_fecha         date
tiene_acuerdo_vigente        boolean
acuerdo_id                   uuid
estado_juridico              text
caso_juridico_id             uuid
```

`[ARQ]` **`REC-CAR-005`** — `fecha_corte` es un **parámetro de función**, no una columna. La vista se expone como función con parámetro:

```sql
create or replace function public.fn_posicion_cartera(
  p_tenant_id   uuid,
  p_fecha_corte date,
  p_inmueble_id uuid default null
) returns table ( /* columnas de arriba */ )
language sql stable
as $$ ... $$;
```

Esto garantiza reproducibilidad: la misma `fecha_corte` produce el mismo resultado siempre, cumpliendo `AD-32`.

## 6.3 Snapshot histórico

`[ARQ]` Para BI, roll-rate y auditoría se necesita la foto de cada día. `fn_posicion_cartera` recalcula; el snapshot congela.

```sql
create table public.posiciones_cartera_snapshot (
  id                            uuid primary key default gen_random_uuid(),
  tenant_id                     uuid not null references public.tenants (id) on delete cascade,
  inmueble_id                   uuid not null references public.inmuebles (id),
  fecha_corte                   date not null,
  deuda_total                   numeric(18,2) not null,
  deuda_capital                 numeric(18,2) not null,
  deuda_interes                 numeric(18,2) not null,
  deuda_otros                   numeric(18,2) not null,
  saldo_credito                 numeric(18,2) not null default 0,
  dias_mora_maximo              int not null,
  fecha_vencimiento_mas_antigua date,
  clasificacion_codigo          text not null,
  politica_clasificacion_id     uuid not null references public.politicas_clasificacion_cartera (id),
  politica_version              int not null,
  nivel_riesgo                  text not null,
  etapa_cobranza                public.etapa_cobranza_t not null,
  posicion_hash                 text not null,
  created_at                    timestamptz not null default now(),
  constraint posiciones_cartera_snapshot_unico
    unique (tenant_id, inmueble_id, fecha_corte)
);

alter table public.posiciones_cartera_snapshot enable row level security;
alter table public.posiciones_cartera_snapshot force row level security;

create trigger posiciones_cartera_snapshot_append_only
  before update or delete on public.posiciones_cartera_snapshot
  for each row execute function public.forbid_mutation();

create index on public.posiciones_cartera_snapshot (tenant_id, fecha_corte);
create index on public.posiciones_cartera_snapshot (tenant_id, inmueble_id, fecha_corte desc);
```

`posicion_hash` = hash determinista de los montos + política, siguiendo el patrón de `result_hash`/`policy_hash`. Permite verificar que un recálculo reproduce la historia (`I-C15`).

---

# 7. Antigüedad

## 7.1 Dato primario y derivado

```text
PRIMARIO   fecha_vencimiento    ← del período o del cargo (GAP-CAR-001)
PRIMARIO   fecha_corte          ← parámetro explícito de la consulta
DERIVADO   dias_mora = fecha_corte − fecha_vencimiento
```

`[ARQ]` Los **meses son representación secundaria**. Nunca se almacenan meses de mora; se derivan para presentación.

## 7.2 Definición exacta de `dias_mora`

`[NEGOCIO]` Reglas de borde, alineadas con `PLAN_MAESTRO_IMPLEMENTACION.md §6.6` (devengo desde el día siguiente al vencimiento):

```text
dias_mora(cargo, fecha_corte) =
    GREATEST(0, fecha_corte − fecha_vencimiento)

Casos:
  fecha_corte  <  fecha_vencimiento  →  dias_mora = 0   (no vencido)
  fecha_corte  =  fecha_vencimiento  →  dias_mora = 0   (último día hábil de pago)
  fecha_corte  =  fecha_vencimiento + 1  →  dias_mora = 1   (primer día de mora)
```

**Importante:** `dias_mora` (antigüedad, este bloque) y **días de causación de interés** (motor de mora) son magnitudes distintas. El interés respeta además `interes_dias_gracia` y el `interes_day_count` configurado. **Un cargo puede tener `dias_mora = 3` y `0` interés causado si la gracia es de 5 días.** Esto es correcto y es la manifestación práctica del principio de §2.

## 7.3 Antigüedad por obligación, no por inmueble

`[ARQ]` La antigüedad se calcula **por cargo** y se conserva. La clasificación del inmueble **usa** el máximo, pero no destruye el detalle.

Ejemplo canónico (`fecha_corte = 2026-08-16`):

```text
Cargo    Período   Vencimiento   Saldo      dias_mora
-------  --------  ------------  ---------  ---------
C-001    2026-03   2026-03-10    500.000    159
C-002    2026-04   2026-04-10    500.000    128
C-003    2026-05   2026-05-10    500.000     98
C-004    2026-06   2026-06-10    500.000     67
C-005    2026-07   2026-07-10          0     —      (pagado, no cuenta)
C-006    2026-09   2026-09-10    500.000      0     (no vencido)

Posición del inmueble:
  deuda_total          = 2.000.000
  dias_mora_maximo     = 159        ← C-001, el más antiguo CON SALDO
  cargos_vencidos      = 4
  clasificación        = MORA_CRITICA (tramo 121–180)
```

`[NEGOCIO]` **`REC-CAR-010`** — El cargo que determina la clasificación es **el más antiguo con saldo > 0**, no el más antiguo en absoluto. Un cargo pagado sale del cálculo de antigüedad inmediatamente (`I-C01`).

## 7.4 Interacción con imputación

`[ARQ]` Consecuencia no obvia y crítica: **la estrategia de imputación configurada cambia la antigüedad resultante.**

```text
politicas_financieras.imputacion_estrategia = 'deuda_mas_antigua'
    → un pago reduce primero el cargo más viejo
    → dias_mora_maximo BAJA con cada pago
    → la clasificación mejora

politicas_financieras.imputacion_estrategia = 'periodo_actual'
    → un pago va al período corriente
    → el cargo más viejo permanece
    → dias_mora_maximo NO baja; el inmueble sigue escalando
```

Esto **debe documentarse en la UI de configuración**, porque una copropiedad puede quedar sorprendida de que sus residentes "pagan y siguen escalando". Es comportamiento correcto y configurado, no un bug. Golden case obligatorio: `PH-C31`.

---

# 8. Clasificación de cartera

## 8.1 Naturaleza de los rangos

`[NEGOCIO]` **Los rangos de antigüedad NO son ley.** La Ley 675 no define tramos de cartera. Son **política de gestión** de cada copropiedad y por eso deben ser configurables y versionados.

Presentar los tramos como obligación legal sería violar la regla `[LEGAL]` vs `[NEGOCIO]` de §0.3.

## 8.2 Política versionada — DDL

Replica el patrón de `politicas_financieras` (`REC-CAR-006`):

```sql
create type public.nivel_riesgo_t as enum (
  'ninguno', 'bajo', 'medio', 'alto', 'critico'
);

create type public.etapa_cobranza_t as enum (
  'preventiva', 'administrativa', 'prejuridica', 'juridica', 'judicial'
);

create table public.politicas_clasificacion_cartera (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  version        int not null,
  estado         public.vigencia_estado_t not null default 'borrador',
  vigente_desde  date,
  vigente_hasta  date,
  nombre         text not null,
  descripcion    text,
  base_antiguedad public.base_antiguedad_t not null default 'cargo_mas_antiguo_con_saldo',
  policy_hash    text not null,
  aprobada_por   uuid references public.profiles (id),
  acta_referencia text,                        -- acta de asamblea que la aprueba
  created_at     timestamptz not null default now(),
  updated_at     timestamptz,
  constraint politicas_clasif_version_unica unique (tenant_id, version)
);

create table public.politica_clasificacion_tramos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  politica_id        uuid not null references public.politicas_clasificacion_cartera (id) on delete cascade,
  codigo             text not null,
  nombre             text not null,
  dias_min           int not null check (dias_min >= 0),
  dias_max           int,                       -- null = sin tope superior
  nivel_riesgo       public.nivel_riesgo_t not null,
  etapa_cobranza     public.etapa_cobranza_t not null,
  prioridad          int not null,
  orden              int not null,
  created_at         timestamptz not null default now(),
  constraint tramo_codigo_unico unique (politica_id, codigo),
  constraint tramo_rango_valido check (dias_max is null or dias_max >= dias_min)
);
```

## 8.3 Invariantes estructurales de la política

`[ARQ]` Una política de clasificación es válida **solo si** sus tramos:

```text
IC-TRAMO-01  Cubren completamente [0, ∞).            (sin huecos)
IC-TRAMO-02  No se solapan entre sí.                 (sin ambigüedad)
IC-TRAMO-03  Exactamente un tramo tiene dias_max = null. (el último)
IC-TRAMO-04  Exactamente un tramo contiene dias_min = 0. (el estado "al día")
IC-TRAMO-05  Los códigos son únicos dentro de la política.
```

Deben validarse en un `constraint trigger` **antes** de permitir `estado = 'vigente'`. Una política inválida no puede activarse.

```sql
create or replace function public.guard_politica_clasificacion_completa()
returns trigger language plpgsql as $$
-- verifica IC-TRAMO-01..05; lanza excepción si falla
$$;
```

## 8.4 Política inicial sugerida `[CONFIG]`

Valores **por defecto sugeridos**, no impuestos. Cada copropiedad los ajusta por acta de asamblea.

| Orden | Código | Nombre | días min | días max | Riesgo | Etapa |
|---|---|---|---|---|---|---|
| 1 | `AL_DIA` | Al día | 0 | 0 | ninguno | preventiva |
| 2 | `MORA_TEMPRANA` | Mora temprana | 1 | 30 | bajo | administrativa |
| 3 | `MORA_INICIAL` | Mora inicial | 31 | 60 | bajo | administrativa |
| 4 | `MORA_MEDIA` | Mora media | 61 | 90 | medio | administrativa |
| 5 | `MORA_AVANZADA` | Mora avanzada | 91 | 120 | medio | prejuridica |
| 6 | `MORA_CRITICA` | Mora crítica | 121 | 180 | alto | prejuridica |
| 7 | `ALTO_RIESGO` | Alto riesgo | 181 | 360 | alto | juridica |
| 8 | `CRITICA` | Crítica | 361 | *null* | critico | juridica |

`[NEGOCIO]` Nota de alineación con la industria: los tramos de 30 días son el estándar de *aging buckets* en gestión de cobranza (`no vencido / 1-30 / 31-60 / 61-90 / >90`), lo que permite comparar los indicadores de AQUILA contra benchmarks del sector. Los tramos por encima de 90 días son extensión propia del dominio PH, donde la deuda no se castiga sino que escala a proceso ejecutivo por título del art. 48.

`[ARQ]` **Siembra (2026-08-29).** `fn_sembrar_configuracion_cartera(tenant)` crea esta política y las estrategias de §9.4 de un clic desde `/cartera/configuracion`. Nace en **borrador**: activarla es una decisión de quien administra, y una vigente ya no se corrige. Falla si la copropiedad ya tiene política — corregir es crear versión nueva, no re-sembrar. Antes de esto, encender el módulo en una copropiedad exigía escribir SQL a mano.

## 8.5 Regla de versionado

`[ARQ]` **`REC-CAR-011`** — Igual que `guard_politica_inmutable` en `politicas_financieras`:

```text
Una política con estado='vigente' es INMUTABLE.
Corregir = crear versión nueva, no UPDATE.
Solo una política vigente por tenant a la vez.
Toda clasificación registrada guarda politica_id + politica_version.
Cambiar la política NO reescribe clasificaciones históricas.  (I-C10, PH-C30)
```

## 8.6 Función de clasificación (pura)

```typescript
// packages/liquidation-engine/src/cartera.ts

export interface TramoClasificacion {
  readonly codigo: string
  readonly diasMin: number
  readonly diasMax: number | null
  readonly nivelRiesgo: NivelRiesgo
  readonly etapaCobranza: EtapaCobranza
  readonly prioridad: number
}

export interface PoliticaClasificacion {
  readonly id: string
  readonly version: number
  readonly tramos: readonly TramoClasificacion[]
}

export interface ResultadoClasificacion {
  readonly codigo: string
  readonly nivelRiesgo: NivelRiesgo
  readonly etapaCobranza: EtapaCobranza
  readonly prioridad: number
  readonly diasMora: number
  readonly politicaId: string
  readonly politicaVersion: number
}

/** Determinista. Lanza TramoClasificacionNoEncontradoError si la política
 *  no cubre diasMora (violación de IC-TRAMO-01). Nunca devuelve un default. */
export function clasificarCartera(
  diasMora: number,
  politica: PoliticaClasificacion,
): ResultadoClasificacion
```

`[ARQ]` **No hay valor por defecto.** Si ningún tramo cubre `diasMora`, es un error de configuración y debe **fallar ruidosamente**, no clasificar como "AL_DIA" silenciosamente. Esto es coherente con el estilo de errores del paquete (`PoliticaMoraNoConfiguradaError`, `OrdenImputacionInvalidoError`).

---

# 9. Motor de cobranza — estrategias

## 9.1 Principio

`[ARQ]` La clasificación **no ejecuta** acciones. La clasificación **habilita** una estrategia, y la estrategia decide qué acción, por qué canal, con qué frecuencia y con qué tope.

```text
clasificación  →  estrategia  →  acción programada  →  acción ejecutada  →  resultado
   (estado)      (política)        (intención)          (hecho)          (evidencia)
```

Separar "acción programada" de "acción ejecutada" es esencial: una acción puede planearse y fallar (email rebotado, teléfono equivocado). El sistema debe distinguirlo.

## 9.2 Catálogo de tipos de acción

```sql
create type public.tipo_accion_cobranza_t as enum (
  'email',                  -- notificación por correo
  'sms',
  'whatsapp',
  'llamada',                -- gestión telefónica, resultado manual
  'carta',                  -- comunicación física
  'requerimiento_formal',   -- [NEGOCIO] comunicación formal con valor
                            -- probatorio reforzado, previa al escalamiento
                            -- prejurídico. NO constituye en mora: en obligación
                            -- a plazo la mora opera por el solo vencimiento
                            -- (ENM-CAR-03, ver VER-CAR-07).
  'aviso_prejuridico',      -- último aviso antes de remisión
  'publicacion_morosos',    -- art. 30 par. L675  [VERIFICAR VER-CAR-04]
  'restriccion_servicios',  -- [VERIFICAR] limitado por ley y reglamento
  'visita',
  'asignacion_abogado',
  'remision_juridica',
  'propuesta_acuerdo',
  'revision_manual'
);
```

`[VERIFICAR]` `restriccion_servicios` y `publicacion_morosos` tienen límites legales estrictos (no puede suspenderse el suministro de servicios públicos domiciliarios ni restringirse el acceso a la vivienda). **No implementar sin concepto jurídico.** Se listan para que el catálogo sea completo, con estado `bloqueado` en el seed inicial.

## 9.3 DDL de estrategias

✅ **Implementado (F4, `20260822270000_cartera_cobranza_estrategias_acciones.sql`)** — con dos cambios sobre el sketch original de abajo, reconciliados contra el esquema real: `rol_responsable` → `rol_minimo` (informativo, no la barrera de seguridad — RLS la impone) y `plantilla_id uuid` → `plantilla_codigo text` sin FK (no existe todavía una tabla de plantillas única; referencia blanda por código, mismo criterio que `event_type` en `packages/shared/src/sms/registry.ts`). Guard nuevo: `guard_estrategia_cobranza_tramo_coherente()` — el `tramo_id` de una estrategia debe pertenecer a su propia `politica_id`, probado en `tests/rls/cartera-cobranza.test.ts`.

```sql
create table public.estrategias_cobranza (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants (id) on delete cascade,
  politica_id              uuid not null references public.politicas_clasificacion_cartera (id) on delete cascade,
  tramo_id                 uuid not null references public.politica_clasificacion_tramos (id) on delete cascade,
  codigo                   text not null,
  nombre                   text not null,
  tipo_accion              public.tipo_accion_cobranza_t not null,
  canal                    public.canal_cobranza_t not null,
  dias_desde_clasificacion int not null default 0,   -- espera tras entrar al tramo
  frecuencia_dias          int,                       -- null = una sola vez
  max_intentos             int not null default 1,
  plantilla_id             uuid,                      -- PRQ-CAR-009
  rol_responsable          public.tenant_role_t not null,   -- ver GAP-CAR-009
  requiere_aprobacion      boolean not null default false,
  monto_minimo_deuda       numeric(18,2),             -- no gestionar deudas triviales
  activa                   boolean not null default true,
  orden                    int not null,
  created_at               timestamptz not null default now(),
  constraint estrategia_codigo_unico unique (tenant_id, politica_id, codigo)
);

alter table public.estrategias_cobranza enable row level security;
alter table public.estrategias_cobranza force row level security;
```

`[NEGOCIO]` `monto_minimo_deuda` implementa una práctica estándar de la industria: **no gastar una llamada de cobranza en una deuda de $2.000**. El costo de la acción no puede exceder el valor recuperado.

## 9.4 Estrategia inicial sugerida `[CONFIG]`

| Tramo | Acción | Canal | Días tras clasificar | Frecuencia | Máx. | Aprobación |
|---|---|---|---|---|---|---|
| `AL_DIA` | — | — | — | — | — | — |
| `MORA_TEMPRANA` | `email` recordatorio | email | 3 | 15 | 2 | no |
| `MORA_INICIAL` | `email` + `sms` formal | email/sms | 0 | 15 | 2 | no |
| `MORA_MEDIA` | `llamada` | teléfono | 0 | 15 | 3 | no |
| `MORA_MEDIA` | `carta` | físico | 10 | — | 1 | no |
| `MORA_AVANZADA` | `requerimiento_formal` | físico + email | 0 | — | 1 | **sí** |
| `MORA_AVANZADA` | `propuesta_acuerdo` | email | 5 | — | 1 | no |
| `MORA_CRITICA` | `aviso_prejuridico` | físico certificado | 0 | — | 1 | **sí** |
| `ALTO_RIESGO` | `asignacion_abogado` | interno | 0 | — | 1 | **sí** |
| `ALTO_RIESGO` | `remision_juridica` | interno | 15 | — | 1 | **sí** |
| `CRITICA` | `revision_manual` | interno | 0 | 30 | — | **sí** |

`[NEGOCIO]` Nótese que las acciones de alto impacto (`requerimiento_formal`, `aviso_prejuridico`, `asignacion_abogado`, `remision_juridica`) **exigen aprobación humana**. El sistema nunca demanda a alguien automáticamente.

---

# 10. Registro de acciones de cobranza

## 10.1 Principio

`[ARQ]` **Nunca depender solo de `ultima_accion`.** Toda acción es un registro inmutable con su propio ciclo de vida y su evidencia.

## 10.2 DDL

✅ **Implementado (F4, `20260822270000_cartera_cobranza_estrategias_acciones.sql`)** — con un cambio de fondo sobre el sketch original de abajo: **el destinatario ya no usa el enum `destinatario_t('propietario'|'arrendatario'|'ambos')`.** Ese enum asumía la tabla `propietarios`, renombrada dos veces desde que se escribió este sketch (`propietarios→personas→terceros`, `20260820100000`/`20260821100000`) y generalizada a un catálogo de rol flexible (`PERSONA_PREDIO` vía `lista_tipos`, tabla `inmueble_persona_rol`). Un enum fijo de 3 valores ya no representa ese modelo. Se usa en su lugar `destinatario_tercero_id uuid not null references terceros(id)` + `destinatario_rol_codigo text not null` (snapshot del código de rol al momento — REC-CAR-012, el rol pudo cambiar desde entonces). `plantilla_id`→`plantilla_codigo text` sin FK, mismo criterio que §9.3. Guard nuevo: `guard_accion_cobranza_contexto_inmutable()` congela exactamente las columnas listadas en §10.3 (más las de identidad: `tenant_id`, `inmueble_id`, `tipo_accion`, `fecha_programada`, `alcance`, `cargo_id`, `destinatario_tercero_id`, `destinatario_rol_codigo`, `creada_por`) — `estado`/`resultado`/campos de ejecución sí se actualizan, CAR §10.1. Probado en `tests/rls/cartera-cobranza.test.ts`.

```sql
create type public.estado_accion_cobranza_t as enum (
  'programada',   -- el job la creó, aún no se ejecuta
  'pendiente_aprobacion',
  'aprobada',
  'rechazada',
  'ejecutando',
  'ejecutada',    -- se envió/realizó
  'fallida',      -- error técnico (email rebotado, teléfono inválido)
  'cancelada'     -- ya no aplica (el inmueble se puso al día)
);

create type public.resultado_accion_cobranza_t as enum (
  'sin_respuesta',
  'contacto_efectivo',
  'contacto_no_efectivo',
  'promesa_de_pago',
  'acuerdo_solicitado',
  'pago_recibido',
  'rechazo_deudor',
  'datos_incorrectos',
  'no_aplica'
);

create table public.acciones_cobranza (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  inmueble_id               uuid not null references public.inmuebles (id),
  estrategia_id             uuid references public.estrategias_cobranza (id),
  tipo_accion               public.tipo_accion_cobranza_t not null,
  canal                     public.canal_cobranza_t not null,

  -- FOTO DEL MOMENTO — congelada, nunca recalculada
  fecha_programada          date not null,
  fecha_ejecucion           timestamptz,
  clasificacion_codigo      text not null,
  politica_clasificacion_id uuid not null references public.politicas_clasificacion_cartera (id),
  politica_version          int not null,
  dias_mora_al_momento      int not null,
  deuda_total_al_momento    numeric(18,2) not null,

  -- ALCANCE
  alcance                   public.alcance_obligacion_t not null default 'inmueble',
  cargo_id                  uuid references public.cargos (id),

  -- DESTINATARIO
  destinatario_tipo         public.destinatario_t not null,   -- propietario|arrendatario|ambos
  destinatario_id           uuid,
  destinatario_contacto     text,                              -- email/teléfono usado

  -- EJECUCIÓN
  estado                    public.estado_accion_cobranza_t not null default 'programada',
  plantilla_id              uuid,
  contenido_hash            text,                              -- hash del mensaje enviado
  referencia_externa        text,                              -- id del proveedor de envío
  intento_numero            int not null default 1,

  -- RESULTADO
  resultado                 public.resultado_accion_cobranza_t,
  resultado_fecha           timestamptz,
  notas                     text,

  -- AUTORÍA
  aprobada_por              uuid references public.profiles (id),
  aprobada_at               timestamptz,
  ejecutada_por             uuid references public.profiles (id),
  creada_por                public.origen_accion_t not null,   -- job|manual
  created_at                timestamptz not null default now()
);

alter table public.acciones_cobranza enable row level security;
alter table public.acciones_cobranza force row level security;

create index on public.acciones_cobranza (tenant_id, inmueble_id, fecha_programada desc);
create index on public.acciones_cobranza (tenant_id, estado) where estado in ('programada','pendiente_aprobacion');
```

## 10.3 Congelamiento del contexto

`[ARQ]` **`REC-CAR-012`** — Los campos `clasificacion_codigo`, `politica_version`, `dias_mora_al_momento`, `deuda_total_al_momento` se **escriben una vez y nunca se actualizan**. Son la respuesta a "¿por qué se envió este requerimiento?" seis meses después, cuando el inmueble ya está al día y la política ya cambió de versión.

Sin esto, es imposible defender una actuación de cobro ante un juez o ante la asamblea. Es el mismo principio de `snapshotHash`/`policy_hash` del motor de liquidación aplicado a la gestión.

`[ARQ]` **`contenido_hash` no es prueba por sí solo** (`ENM-CAR-01`). Un hash acredita integridad únicamente si se conserva el original con el cual compararlo; ante un juez se aporta el texto que se envió, no su huella. El contenido renderizado, la versión de plantilla y el acuse de recibo viven en **§34**, en `acciones_cobranza_envios` / `acciones_cobranza_acuses`. Esta sección responde "por qué se envió"; §34 responde "y acredítelo".

## 10.4 Regla de no duplicación

`[NEGOCIO]` `I-C07` — Una acción no se duplica cuando la política lo prohíbe.

```text
Antes de crear una acción, verificar:

  1. ¿Existe ya una acción del mismo tipo, misma estrategia, mismo inmueble,
     en estado (programada | pendiente_aprobacion | aprobada | ejecutada),
     dentro de la ventana de `frecuencia_dias`?
        → SÍ  : NO crear. Registrar evento COBRANZA_ACCION_OMITIDA.
        → NO  : continuar.

  2. ¿El conteo de intentos ejecutados alcanza `max_intentos`?
        → SÍ  : NO crear. Marcar la estrategia como agotada para ese inmueble.
        → NO  : crear con intento_numero = ejecutadas + 1.

  3. ¿La deuda es menor a `monto_minimo_deuda`?
        → SÍ  : NO crear.

  4. ¿Existe un acuerdo de pago vigente y al día?
        → SÍ  : NO crear acciones del flujo normal.  (ver §12.5)
```

Implementar como constraint parcial + verificación en la función, no solo en la función. La base de datos debe ser la última línea de defensa.

✅ **Capa pura implementada (F4, `packages/liquidation-engine/src/cartera-cobranza.ts`)** — `evaluarAccionesAplicables()` resuelve las reglas 1-4 de arriba más el disparo por `dias_desde_clasificacion` (§9.3), sin Supabase. 12 tests unitarios (`cartera-cobranza.test.ts`). No depende de `GAP-CAR-005` ni `GAP-CAR-009` — recibe estrategias/historial ya resueltos y solo decide qué correspondería, sin ejecutar ni persistir nada. El constraint parcial en base de datos (la última línea de defensa mencionada arriba) queda pendiente para cuando exista la tabla `acciones_cobranza` real.

---

# 11. Escalamiento

## 11.1 Máquina de estados

`[ARQ]` La etapa de cobranza es una **máquina de estados explícita**, no un campo de texto libre.

```text
        ┌──────────────┐
        │  PREVENTIVA  │  al día / sin mora
        └──────┬───────┘
               │ primer cargo vencido
               ↓
        ┌──────────────────┐
        │  ADMINISTRATIVA  │  gestión interna: email, sms, llamada, carta
        └──────┬───────────┘
               │ tramo con etapa=prejuridica  +  aprobación
               ↓
        ┌────────────────┐
        │  PREJURIDICA   │  requerimiento formal, aviso prejurídico
        └──────┬─────────┘
               │ tramo con etapa=juridica  +  aprobación  +  certificación art.48
               ↓
        ┌──────────────┐
        │   JURIDICA   │  abogado asignado, expediente abierto
        └──────┬───────┘
               │ demanda radicada
               ↓
        ┌──────────────┐
        │   JUDICIAL   │  proceso ejecutivo en curso
        └──────────────┘
```

## 11.2 Regreso de etapa (recuperación)

`[NEGOCIO]` El escalamiento **no es de una sola vía**. Ignorar esto es un error frecuente.

```text
Cualquier etapa
      │ pago total  →  saldo = 0
      ↓
  PREVENTIVA        (des-escalamiento total)

PREJURIDICA / JURIDICA
      │ acuerdo de pago firmado y aprobado
      ↓
  ACUERDO_VIGENTE   (etapa congelada, acciones normales suspendidas)
      │
      ├── cumplimiento total  →  PREVENTIVA
      └── incumplimiento      →  reanuda en la etapa congelada, o escala
```

## 11.3 Tabla de transiciones permitidas

`[ARQ]` Matriz explícita. Cualquier transición fuera de esta tabla es un error y debe rechazarse.

| Desde | Hacia | Disparador | ¿Aprobación? |
|---|---|---|---|
| `preventiva` | `administrativa` | Primer cargo vencido con saldo | No (automático) |
| `administrativa` | `preventiva` | Saldo vencido = 0 | No (automático) |
| `administrativa` | `prejuridica` | Clasificación alcanza tramo prejurídico Y agotadas las acciones administrativas | **Sí** |
| `prejuridica` | `administrativa` | Pago parcial que baja la clasificación | No (automático) |
| `prejuridica` | `preventiva` | Saldo vencido = 0 | No (automático) |
| `prejuridica` | `juridica` | Clasificación alcanza tramo jurídico Y aviso prejurídico ejecutado Y certificación emitida | **Sí** |
| `juridica` | `judicial` | Demanda radicada (`casos_juridicos.estado = 'radicado'`) | No (refleja hecho externo) |
| `juridica` | `prejuridica` | Retiro de la remisión con justificación | **Sí** |
| `juridica` | `preventiva` | Saldo = 0 (pago total antes de demandar) | **Sí** (requiere cierre del caso) |
| `judicial` | `preventiva` | Proceso terminado por pago total | **Sí** (requiere cierre del caso) |
| cualquiera | *(congelada)* | Acuerdo de pago vigente | **Sí** |

`[ARQ]` **`REC-CAR-013`** — Un des-escalamiento desde `juridica` o `judicial` **nunca es automático**, porque hay un proceso externo, un abogado contratado y posibles costas. Requiere acto humano y cierre explícito del caso.

## 11.4 Función pura de escalamiento

```typescript
// packages/liquidation-engine/src/cartera-escalamiento.ts

export interface ContextoEscalamiento {
  readonly etapaActual: EtapaCobranza
  readonly clasificacion: ResultadoClasificacion
  readonly saldoVencido: number
  readonly accionesEjecutadasEnEtapa: readonly ResumenAccion[]
  readonly tieneAcuerdoVigente: boolean
  readonly tieneCasoJuridicoAbierto: boolean
  readonly tieneCertificacionVigente: boolean
}

export type DecisionEscalamiento =
  | { readonly tipo: 'permanecer' }
  | { readonly tipo: 'escalar'; readonly hacia: EtapaCobranza; readonly requiereAprobacion: boolean; readonly motivo: string }
  | { readonly tipo: 'desescalar'; readonly hacia: EtapaCobranza; readonly requiereAprobacion: boolean; readonly motivo: string }
  | { readonly tipo: 'congelar'; readonly motivo: string }
  | { readonly tipo: 'bloqueado'; readonly requisitoFaltante: string }

/** Pura y determinista. Nunca ejecuta la transición: la propone. */
export function evaluarEscalamiento(ctx: ContextoEscalamiento): DecisionEscalamiento
```

`[ARQ]` La función **propone**, no ejecuta. La ejecución (con su aprobación, su evento y su auditoría) es responsabilidad de la capa de aplicación. Esto permite simular escalamientos sin efectos secundarios — necesario para `PH-C27`.

---

# 12. Promesas y acuerdos de pago

## 12.1 Distinción

`[NEGOCIO]` Dos figuras distintas, frecuentemente confundidas:

| | Promesa de pago | Acuerdo de pago |
|---|---|---|
| **Naturaleza** | Manifestación informal de intención | Negocio jurídico formal |
| **Origen** | Resultado de una llamada de cobranza | Aprobación de consejo/administración |
| **Formalidad** | Verbal o email | Documento firmado |
| **Efecto en escalamiento** | Ninguno; solo pospone la siguiente acción | Congela la etapa |
| **Cuotas** | Una sola | Múltiples, con calendario |
| **Incumplimiento** | Se registra y se reanuda gestión | Genera evento de default y escalamiento |

## 12.2 Promesa de pago — DDL

```sql
create type public.estado_promesa_t as enum (
  'pendiente', 'cumplida', 'incumplida', 'cancelada'
);

create table public.promesas_pago (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  inmueble_id            uuid not null references public.inmuebles (id),
  accion_cobranza_id     uuid references public.acciones_cobranza (id),
  fecha_promesa          date not null,
  monto_prometido        numeric(18,2) not null check (monto_prometido > 0),
  fecha_pago_prometida   date not null,
  estado                 public.estado_promesa_t not null default 'pendiente',
  cumplida_at            timestamptz,
  pago_id                uuid references public.pagos (id),   -- el pago que la cumplió
  monto_cumplido         numeric(18,2),
  registrada_por         uuid not null references public.profiles (id),
  notas                  text,
  created_at             timestamptz not null default now(),
  constraint promesa_fecha_futura check (fecha_pago_prometida >= fecha_promesa)
);
```

`[NEGOCIO]` Regla de cumplimiento (`PH-C14`/`PH-C15`):

```text
Una promesa se marca CUMPLIDA si:
    existe un pago del inmueble
    con fecha_pago <= fecha_pago_prometida + tolerancia_dias
    y monto >= monto_prometido × (1 − tolerancia_porcentaje)

tolerancia_dias y tolerancia_porcentaje son [CONFIG] de la copropiedad.
Por defecto: 0 días, 0%.  (estricto)

Una promesa se marca INCUMPLIDA por el job diario cuando
    fecha_corte > fecha_pago_prometida + tolerancia_dias
    y sigue en estado 'pendiente'.
```

## 12.3 Acuerdo de pago — DDL

```sql
create type public.estado_acuerdo_t as enum (
  'borrador', 'pendiente_aprobacion', 'vigente',
  'cumplido', 'incumplido', 'cancelado'
);

create table public.acuerdos_pago (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  inmueble_id            uuid not null references public.inmuebles (id),
  consecutivo            text not null,
  fecha_acuerdo          date not null,
  fecha_inicio           date not null,
  fecha_fin              date not null,

  -- COMPOSICIÓN DE LO ACORDADO — discriminada, art. 48 L675
  monto_capital          numeric(18,2) not null default 0,
  monto_interes          numeric(18,2) not null default 0,
  monto_otros            numeric(18,2) not null default 0,
  monto_total            numeric(18,2) not null,

  -- CONDICIONES
  numero_cuotas          int not null check (numero_cuotas > 0),
  cuota_inicial          numeric(18,2) not null default 0,
  condona_interes        boolean not null default false,
  monto_condonado        numeric(18,2) not null default 0,
  interes_durante_acuerdo boolean not null default true,

  -- ESTADO
  estado                 public.estado_acuerdo_t not null default 'borrador',
  etapa_congelada        public.etapa_cobranza_t,   -- a dónde vuelve si incumple
  fecha_incumplimiento   date,
  motivo_incumplimiento  text,

  -- APROBACIÓN
  aprobado_por           uuid references public.profiles (id),
  aprobado_at            timestamptz,
  acta_referencia        text,
  documento_url          text,

  created_at             timestamptz not null default now(),
  constraint acuerdo_consecutivo_unico unique (tenant_id, consecutivo),
  constraint acuerdo_total_coherente
    check (monto_total = monto_capital + monto_interes + monto_otros),
  constraint acuerdo_periodo_valido check (fecha_fin >= fecha_inicio)
);

create table public.acuerdo_pago_cuotas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  acuerdo_id        uuid not null references public.acuerdos_pago (id) on delete cascade,
  numero_cuota      int not null,
  fecha_vencimiento date not null,
  monto             numeric(18,2) not null check (monto > 0),
  monto_pagado      numeric(18,2) not null default 0,
  estado            public.estado_cuota_acuerdo_t not null default 'pendiente',
  fecha_pago        date,
  created_at        timestamptz not null default now(),
  constraint cuota_numero_unico unique (acuerdo_id, numero_cuota),
  constraint cuota_pagado_no_excede check (monto_pagado <= monto)
);

create type public.estado_cuota_acuerdo_t as enum (
  'pendiente', 'parcial', 'pagada', 'vencida', 'incumplida', 'cancelada'
);
```

## 12.4 Regla cardinal del acuerdo

`[ARQ]` `I-C08` — **Un acuerdo NUNCA elimina, reescribe ni reemplaza las obligaciones originales.**

```text
      cargos (append-only, intacto)
            ↑ referencia
      acuerdos_pago  ←  capa de GESTIÓN sobre la deuda
            ↓ genera
      acuerdo_pago_cuotas  ←  calendario de recaudo esperado
            ↓ cuando se paga
      pagos → pago_aplicaciones → cargos
            (el flujo normal, sin excepción)
```

Un pago de cuota de acuerdo entra por `registrar-pago` como cualquier otro pago y se imputa con `imputarPago()` según la política vigente. El acuerdo **no tiene su propio imputador**. La cuota se marca pagada por conciliación posterior, no por escritura directa en el ledger.

`[GAP]` **`GAP-CAR-008`** — Conciliar "pago recibido" con "cuota de acuerdo cubierta" requiere una regla: ¿el pago se asocia explícitamente al acuerdo, o se infiere por monto y fecha? **Decisión pendiente.** Recomendación: asociación explícita opcional (`pagos.acuerdo_cuota_id` nullable) más inferencia como respaldo, para no obligar al usuario a clasificar cada pago.

## 12.5 Efecto sobre la gestión

`[NEGOCIO]`

```text
Acuerdo en estado 'vigente' y sin cuotas vencidas:
    → etapa_cobranza se CONGELA (se guarda en etapa_congelada)
    → las acciones de cobranza del flujo normal se SUSPENDEN
    → se activan acciones específicas de seguimiento de acuerdo
    → el interés de mora sigue causándose salvo interes_durante_acuerdo = false

Cuota vencida (job diario):
    → estado cuota = 'vencida'
    → evento ACUERDO_CUOTA_VENCIDA
    → acción de recordatorio de acuerdo

Incumplimiento (según regla configurable):
    → acuerdo.estado = 'incumplido'
    → evento ACUERDO_INCUMPLIDO
    → la etapa se DESCONGELA en etapa_congelada
    → reevaluación de escalamiento inmediata
```

`[CONFIG]` Regla de incumplimiento por defecto: **2 cuotas vencidas consecutivas** o **1 cuota con más de 30 días de vencida**. Configurable por copropiedad y registrable en el propio acuerdo.

## 12.6 Condonación de intereses

`[VERIFICAR]` `[NEGOCIO]` La condonación de intereses de mora en PH es una figura frecuente en acuerdos, pero su validez depende de quién la autoriza: la doctrina sostiene que corresponde a la **asamblea general** o a quien el reglamento faculte, no al administrador de forma unilateral, porque implica disponer de un recurso de la copropiedad.

```text
Si condona_interes = true:
    monto_condonado > 0 es OBLIGATORIO
    acta_referencia es OBLIGATORIO             ← quién lo autorizó
    aprobado_por es OBLIGATORIO
    Se genera novedad tipo 'DISCOUNT' → fn_aprobar_novedad → cargo 'otro' negativo
    NUNCA se borra ni edita el cargo de interés original.
```

Se implementa como constraint condicional en la tabla y como paso obligatorio del flujo de aprobación.

---

# 13. Integración con el Motor de Mora (existente)

## 13.1 Frontera

`[ARQ]` Este bloque **no calcula intereses**. Ya existe `calcularInteresMora()`.

```text
El Motor de CARTERA responde:      El Motor de MORA responde:
  ¿Cuántos días lleva vencida?       ¿Cuánto interés se causó?
  ¿En qué clasificación está?        ¿Sobre qué base?
  ¿Qué acción corresponde?           ¿Con qué tasa y qué day-count?
  ¿Debe escalar?                     ¿Desde qué fecha?
```

## 13.2 Lo que ya está implementado

```typescript
// packages/liquidation-engine/src/cuenta-corriente.ts  (NO reescribir)
calcularInteresMora(
  cargosAbiertos: readonly CargoAbierto[],
  fechaReferencia: Date,
  politica: PoliticaMora,
  redondeo: ConfigRedondeo,
): readonly CargoInteresGenerado[]
```

Características ya resueltas:

- Interés **solo sobre `categoria = 'capital'`** — no hay anatocismo (`I-C02`, alineado con `VER-CAR-02`).
- Day-count configurable: `mensual_30_dias_reales | actual_365 | actual_360 | treinta_360` (`D-23`).
- Orden descuento-vs-interés configurable (`interes_descuento_orden`).
- Días de gracia (`interes_dias_gracia`).
- Tope de tasa (`interes_tope_mensual`).
- **Fecha de referencia explícita** (`AD-32`) — nunca `Date.now()` implícito.
- Idempotencia entre corridas vía `obtenerUltimaFechaInteresPorCapital`.
- Se ejecuta bajo demanda por Edge Function `calcular-intereses`.

## 13.3 `GAP-CAR-004` — parcialmente resuelto

`[GAP]` Versionamiento y segmentación de la tasa. **Implementado en F2** (migración `20260822220000_cartera_tasas_referencia.sql`, aplicada): puntos 1 y 3 de abajo quedaron resueltos; el punto 2 (segmentos) sigue pendiente.

Situación previa a F2: la tasa era una columna escalar de `politicas_financieras`. Si la Superfinanciera certificaba un IBC distinto el mes siguiente, había que crear una **nueva versión de política financiera completa**, lo cual funcionaba pero:

1. ✅ **Resuelto** — No registraba la **resolución fuente** (número, fecha, modalidad).
2. ⧗ **Sigue pendiente** — No produce **segmentos** cuando la tasa cambia a mitad de un período de mora (`PH-C11`).
3. ✅ **Resuelto** — Obligaba a versionar toda la política financiera por un cambio que solo afecta la tasa (ahora el guard valida el tope sin exigir eso).

Implementado (nombres reales, ligeramente distintos del boceto original de esta guía — el enum se llama `tipo_tasa_referencia_t`, no `tipo_tasa_t`):

```sql
create type public.tipo_tasa_referencia_t as enum ('ibc_consumo_ordinario');

create table public.tasas_referencia (
  id                 uuid primary key default gen_random_uuid(),
  tipo_tasa          public.tipo_tasa_referencia_t not null,
  vigente_desde      date not null,
  vigente_hasta      date,
  valor_ea           numeric(8,6) not null,            -- efectiva anual certificada
  valor_mensual      numeric(8,6) not null,            -- REGISTRADO, no derivado [VER-CAR-01]
  resolucion_numero  text not null,                    -- p.ej. 'Resolución 0965'
  resolucion_fecha   date not null,
  entidad_fuente     text not null default 'Superintendencia Financiera de Colombia',
  url_fuente         text,
  registrada_por     uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  constraint tasas_referencia_vigencia_valida
    check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

-- exclusión de solapamiento por tipo de tasa
create extension if not exists btree_gist;
alter table public.tasas_referencia
  add constraint tasas_referencia_sin_solape
  exclude using gist (
    tipo_tasa with =,
    daterange(vigente_desde, coalesce(vigente_hasta, 'infinity'::date), '[]') with &&
  );
```

`[ARQ]` Esta tabla es **global, no por tenant** — el IBC es el mismo para todo el país. Es la única excepción a `REC-CAR-007`; su RLS es de solo lectura para todo usuario autenticado (`using (true)`) y escritura restringida a `is_platform_admin()`. Es **append-only** (`forbid_mutation()`, mismo trigger que `cargos`/`pagos`): corregir un registro erróneo es uno nuevo con `vigente_desde` correcta, nunca un `UPDATE`.

`politicas_financieras` referencia el tipo de tasa y el multiplicador — **nullable**, retrocompatible con toda política anterior a este cambio:

```text
politicas_financieras.interes_tipo_tasa      = 'ibc_consumo_ordinario'  -- o NULL
politicas_financieras.interes_multiplicador  = 1.5      ← tope legal art. 30, o NULL
politicas_financieras.interes_tasa_mensual   = <lo que decidió la asamblea>
```

`[ARQ]` `guard_politica_financiera_tope_legal()` (trigger `before insert or update`) rechaza activar una política cuando `interes_tasa_mensual` o `interes_tope_mensual` exceden `interes_multiplicador × valor_mensual` de la tasa de referencia vigente — **solo si la política declara ambas columnas**. Sin ellas (NULL), ninguna validación corre: es exactamente el comportamiento de antes de F2. Verificado con 4 tests reales contra Postgres (`tests/rls/politica-financiera-tope-legal.test.ts`): `PH-C36` (rechazo), `PH-C37` (aceptación), rechazo cuando solo el tope excede, y retrocompatibilidad.

**✅ Implementado** (rebanada aparte, como estaba previsto — se pospuso deliberadamente en el commit de trazabilidad de la tasa por ser el cambio de mayor riesgo real de F2). `calcularInteresMora()` acepta un 5º parámetro opcional `segmentos?: readonly SegmentoTasa[]` en `packages/liquidation-engine/src/cuenta-corriente.ts`.

`[ARQ]` Corrección sobre el boceto original de esta guía: `desde`/`hasta` son **ISO date strings**, no `Date`, y `tasaMensual` es **string decimal**, no `number` — mismas convenciones que `PoliticaMora.tasaMensual` y `CargoAbierto.fechaVencimiento` en todo el módulo (`Docs/19 §96`: nunca `number` para dinero/tasas, siempre vía `financial-operation-service.ts`).

```typescript
export interface SegmentoTasa {
  readonly desde: string          // ISO YYYY-MM-DD
  readonly hasta: string          // ISO YYYY-MM-DD
  readonly tasaMensual: string    // decimal, como PoliticaMora.tasaMensual
  readonly fuenteResolucion: string
}
```

`[ARQ]` Esta extensión es **retrocompatible de verdad, no solo declarada**: `sin segmentos (o `[]`) ejecuta exactamente el mismo código de siempre — cero rama nueva evaluada. Con exactamente un segmento que cubre toda la ventana de mora, el resultado es **matemáticamente idéntico** al camino escalar (mismo redondeo único al final, no por tramo) — verificado con `expect(conUnSegmento).toEqual(sinSegmentar)` en `cuenta-corriente.test.ts`, no solo con valores que coinciden por casualidad.

Decisiones de diseño que valen la pena registrar:

```text
- Gracia (diasGracia) se traduce a un desplazamiento de fecha calendario
  (fechaVencimiento + diasGracia días) antes de intersectar segmentos —
  matemáticamente equivalente a "restar gracia del conteo de días" para
  las 3 convenciones de calendario real, lo que permite reutilizar
  diasVencido()/diasCalendario() sin duplicar lógica.

- treinta_360 se RECHAZA explícitamente con segmentos
  (SegmentacionDayCountNoSoportadoError) en vez de aproximarse: esa
  convención no tiene una noción lineal de fecha calendario, así que
  recortar un segmento a una ventana [desde,hasta) no tiene una respuesta
  correcta sin inventar una regla adicional. Sin segmentos, treinta_360
  sigue funcionando exactamente igual que siempre.

- Segmentos solapados (SegmentosTasaSolapadosError) se rechazan — un
  solape cobraría interés dos veces sobre los mismos días. Huecos entre
  segmentos SÍ se permiten: esos días simplemente no generan interés
  (nunca se inventa una tasa para cubrir el hueco).

- El tope legal (interes_tope_mensual) se aplica POR SEGMENTO, no de forma
  global — cada tramo de tasa se topa independientemente contra el mismo
  tope de la política.
```

9 tests nuevos en `cuenta-corriente.test.ts` (29 en total, los 21 originales sin tocar): retrocompatibilidad exacta, `PH-C11` con dos tramos, tope por segmento, gracia con segmentos, arreglo vacío, solape rechazado, `treinta_360` rechazado con segmentos pero funcionando sin ellos.

---

# 14. Integración con Pagos e Imputación (existente)

## 14.1 Flujo existente — no modificar

```text
pagos  →  imputarPago()  →  pago_aplicaciones  →  v_cargo_saldo
```

`imputarPago()` es un waterfall greedy secuencial (no `allocate()`, que es reparto proporcional). Respeta:

- `politicas_financieras.imputacion_orden` — orden de categorías.
- `politicas_financieras.imputacion_estrategia` — `deuda_mas_antigua | periodo_actual` (`AD-36`).
- Base legal del orden por defecto: **Código Civil art. 1653** (el pago se imputa primero a intereses, luego a capital), reflejado en `PLAN_MAESTRO_IMPLEMENTACION.md §6.3`.

## 14.2 Lo que este bloque aporta

Este bloque **consume** el resultado de la imputación para recalcular posición, clasificación y etapa. No lo altera.

```text
Evento PAGO_REGISTRADO
    ↓
recalcular v_posicion_cartera
    ↓
¿cambió la clasificación?  →  evento CARTERA_CLASIFICACION_CAMBIO
    ↓
¿cambió la etapa?          →  evaluarEscalamiento()
    ↓
¿hay acciones programadas que ya no aplican?  →  cancelarlas
    ↓
¿hay promesas pendientes que este pago cumple? →  marcarlas cumplidas
    ↓
¿hay cuotas de acuerdo que este pago cubre?    →  conciliarlas
```

## 14.3 Sobrepago y saldo a favor

`[ARQ]` `I-C06` — **Un sobrepago no desaparece.**

```text
pago > total adeudado
    ↓
el excedente queda SIN APLICAR
    ↓
Σ pago_aplicaciones < pagos.monto
    ↓
saldo_credito = pagos.monto − Σ aplicaciones   ← derivado, no persistido
```

Consecuencia para cartera: `saldo_credito > 0` **no reduce automáticamente** `deuda_total` de períodos futuros. Se aplica cuando el cargo futuro existe, no antes. La posición debe reportar ambos: deuda y crédito, sin netearlos silenciosamente.

`[NEGOCIO]` Un inmueble con `deuda_vencida = 0` y `saldo_credito > 0` está **al día con crédito a favor**, y esto debe ser visible en la posición y en el estado de cuenta.

---

# 15. Gestión jurídica

## 15.1 Principio

`[LEGAL]` `[ARQ]` La remisión jurídica es una **acción de escalamiento con evidencia**, no una generación automática de costas ni de honorarios.

## 15.2 Certificación de deuda — el artefacto del art. 48

`[LEGAL]` Este es el objeto más importante del bloque jurídico. El art. 48 de la Ley 675 exige que el administrador expida una certificación del valor adeudado que, acompañada del certificado de existencia y representación legal, **presta mérito ejecutivo**. Debe discriminar: expensas ordinarias, extraordinarias, intereses moratorios y sanciones.

```sql
create table public.certificaciones_deuda (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  inmueble_id           uuid not null references public.inmuebles (id),
  consecutivo           text not null,
  fecha_expedicion      date not null,
  fecha_corte           date not null,

  -- DISCRIMINACIÓN EXIGIDA POR EL ART. 48
  monto_expensas_ordinarias     numeric(18,2) not null default 0,
  monto_expensas_extraordinarias numeric(18,2) not null default 0,
  monto_intereses_mora          numeric(18,2) not null default 0,
  monto_sanciones               numeric(18,2) not null default 0,
  monto_otros                   numeric(18,2) not null default 0,
  monto_total                   numeric(18,2) not null,

  -- TRAZABILIDAD Y REPRODUCIBILIDAD
  detalle_cargos        jsonb not null,   -- snapshot inmutable de los cargos certificados
  politica_financiera_id uuid not null references public.politicas_financieras (id),
  politica_version      int not null,
  certificacion_hash    text not null,

  -- RESPONSABILIDAD
  expedida_por          uuid not null references public.profiles (id),
  cargo_firmante        text not null,     -- 'Administrador'
  documento_url         text,

  estado                public.estado_certificacion_t not null default 'vigente',
  anulada_at            timestamptz,
  anulada_motivo        text,

  created_at            timestamptz not null default now(),
  constraint certificacion_consecutivo_unico unique (tenant_id, consecutivo),
  constraint certificacion_total_coherente check (
    monto_total = monto_expensas_ordinarias + monto_expensas_extraordinarias
                + monto_intereses_mora + monto_sanciones + monto_otros
  )
);

create trigger certificaciones_deuda_append_only
  before update or delete on public.certificaciones_deuda
  for each row execute function public.forbid_mutation();
```

`[ARQ]` **`REC-CAR-014`** — La certificación es **inmutable**. Si tiene un error, se **anula** (estado, no borrado) y se expide una nueva. Un título ejecutivo modificable no es un título ejecutivo.

`[ARQ]` `detalle_cargos` congela el desglose exacto: id, período, concepto, vencimiento, monto original, saldo a la fecha de corte. Sin esto, la certificación no es reproducible y no resiste una objeción en juicio (`PH-C27`).

## 15.3 Caso judicial — DDL

```sql
create type public.estado_caso_juridico_t as enum (
  'remitido',          -- enviado al abogado
  'documentacion',     -- reuniendo soportes
  'radicado',          -- demanda presentada
  'admitido',          -- auto admisorio
  'en_tramite',
  'medidas_cautelares',
  'conciliacion',
  'sentencia',
  'ejecucion',
  'terminado',
  'desistido',
  'archivado'
);

create table public.casos_juridicos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  inmueble_id           uuid not null references public.inmuebles (id),
  consecutivo           text not null,
  certificacion_id      uuid not null references public.certificaciones_deuda (id),

  fecha_remision        date not null,
  fecha_apertura        date,
  abogado_tercero_id    uuid,               -- FK a tenant_tercero_rol
  numero_radicado       text,
  juzgado               text,
  ciudad                text,

  monto_pretension      numeric(18,2) not null,
  fecha_pretension      date not null,

  estado                public.estado_caso_juridico_t not null default 'remitido',
  fecha_ultima_actuacion date,
  fecha_proxima_actuacion date,

  fecha_cierre          date,
  motivo_cierre         text,
  monto_recuperado      numeric(18,2) not null default 0,

  aprobado_por          uuid not null references public.profiles (id),
  aprobado_at           timestamptz not null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz,
  constraint caso_consecutivo_unico unique (tenant_id, consecutivo)
);
```

`[ARQ]` `certificacion_id` es **`not null`**: no puede existir un caso judicial sin la certificación que le da mérito ejecutivo. Esto convierte el requisito del art. 48 en una restricción de integridad referencial, no en una recomendación.

## 15.4 Actuaciones y expediente

```sql
create table public.caso_juridico_actuaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  caso_id        uuid not null references public.casos_juridicos (id) on delete cascade,
  fecha          date not null,
  tipo           public.tipo_actuacion_juridica_t not null,
  descripcion    text not null,
  estado_desde   public.estado_caso_juridico_t,
  estado_hasta   public.estado_caso_juridico_t,
  registrada_por uuid not null references public.profiles (id),
  created_at     timestamptz not null default now()
);

create table public.caso_juridico_documentos (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  caso_id            uuid not null references public.casos_juridicos (id) on delete cascade,
  tipo_documento     public.tipo_documento_juridico_t not null,
  nombre             text not null,
  fecha_documento    date not null,
  version            int not null default 1,
  storage_path       text not null,     -- PRQ-CAR-013
  documento_hash     text not null,
  cargado_por        uuid not null references public.profiles (id),
  created_at         timestamptz not null default now()
);
```

---

# 16. Costas judiciales

## 16.1 La prohibición central

`[LEGAL]` **NO calcular costas por antigüedad.** Esto **no debe existir** como regla automática:

```text
❌  180 días → 10% del capital
❌  360 días → 15% del capital
❌  cualquier % de costas derivado del tiempo de mora
```

Las costas y agencias en derecho las **liquida el juez** de forma concentrada (CGP art. 366), una vez en firme la providencia, según las **tarifas del Consejo Superior de la Judicatura**. No dependen del contrato privado de honorarios ni de la antigüedad de la deuda.

`[ARQ]` `I-C11` — **Una costa judicial no puede insertarse sin `documento_fuente` y `fecha_decision`.** Se implementa como `not null`, no como validación de aplicación.

## 16.2 DDL

```sql
create type public.tipo_costa_t as enum (
  'gasto_proceso',        -- expensas del proceso
  'agencias_en_derecho',  -- CGP 366, tarifas CSJ
  'honorario_auxiliar',   -- perito, secuestre, curador
  'otro_costo_aprobado'
);

create type public.estado_costa_t as enum (
  'liquidada',    -- el juzgado la liquidó
  'impugnada',    -- reposición/apelación en curso (CGP 366)
  'en_firme',     -- liquidación aprobada y en firme
  'recuperada',
  'no_recuperable'
);

create table public.costas_judiciales (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  caso_id           uuid not null references public.casos_juridicos (id) on delete cascade,
  tipo_costa        public.tipo_costa_t not null,
  monto             numeric(18,2) not null check (monto > 0),

  -- EVIDENCIA OBLIGATORIA — sin esto no existe la costa
  documento_fuente  text not null,
  fecha_decision    date not null,
  autoridad         text not null,     -- juzgado que decidió

  estado            public.estado_costa_t not null default 'liquidada',
  monto_recuperado  numeric(18,2) not null default 0,
  registrada_por    uuid not null references public.profiles (id),
  created_at        timestamptz not null default now()
);
```

## 16.3 Separación de costas y gastos de cobranza

`[LEGAL]` Son cosas distintas y **no pueden mezclarse**:

| | Costas judiciales | Gastos de cobranza extrajudicial |
|---|---|---|
| **Origen** | Decisión judicial en firme | Gestión administrativa de la copropiedad |
| **Norma** | CGP arts. 365-366 | Reglamento de PH + acta de asamblea `[VERIFICAR]` |
| **Quién los fija** | El juez, por tarifas del CSJ | La asamblea, dentro de límites `[VER-CAR-03]` |
| **Cuándo existen** | Solo si hay proceso y condena | Pueden existir sin proceso |
| **Tabla** | `costas_judiciales` | `politicas_gastos_cobranza` → `novedades` → `cargos` |
| **Automatizable** | **NUNCA** | Sí, si la asamblea lo aprobó |

---

# 17. Gastos de cobranza extrajudicial

## 17.1 Advertencia

`[VERIFICAR]` **`VER-CAR-03`** — **No existe un porcentaje legal universal** para gastos de cobranza en propiedad horizontal. Cualquier cobro por este concepto debe estar respaldado por el reglamento de PH o por decisión de asamblea, y su razonabilidad puede ser objetada. **No implementar valores por defecto.** La política debe nacer vacía y requerir configuración explícita con referencia al acta.

## 17.2 DDL

```sql
create table public.politicas_gastos_cobranza (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  version             int not null,
  estado              public.vigencia_estado_t not null default 'borrador',
  vigente_desde       date,
  vigente_hasta       date,
  acta_referencia     text not null,     -- OBLIGATORIO: quién lo autorizó
  fundamento_texto    text not null,     -- cláusula del reglamento o de la asamblea
  aprobada_por        uuid not null references public.profiles (id),
  policy_hash         text not null,
  created_at          timestamptz not null default now(),
  constraint politica_gastos_version_unica unique (tenant_id, version)
);

create table public.politica_gasto_cobranza_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  politica_id         uuid not null references public.politicas_gastos_cobranza (id) on delete cascade,
  etapa               public.etapa_cobranza_t not null,
  tipo_gasto          text not null,
  base_calculo        public.base_gasto_t not null,  -- 'fijo'|'porcentaje_capital'|'porcentaje_total'
  valor               numeric(18,6) not null,
  tope_maximo         numeric(18,2),
  requiere_aprobacion boolean not null default true,
  created_at          timestamptz not null default now()
);
```

`[ARQ]` **`REC-CAR-015`** — Un gasto de cobranza **nunca** se inserta directo en `cargos`. Recorre: política → propuesta → **aprobación** → `novedades` (tipo `CHARGE`) → `fn_aprobar_novedad` → `cargos` (categoría `otro`). Esto garantiza que quede sujeto al flujo de aprobación existente (`AD-33`) y sea auditable y reversible.

---

# 18. Automatización — Job diario de cartera

## 18.1 Contrato

`[ARQ]` **`REC-CAR-008`** — El job recibe **fecha de corte explícita**. Nunca usa la fecha del sistema internamente. Esto lo hace re-ejecutable, testeable y auditable (`AD-32`).

```typescript
interface EntradaJobCartera {
  readonly tenantId: string
  readonly fechaCorte: Date          // explícita, obligatoria
  readonly modo: 'simulacion' | 'ejecucion'
  readonly alcanceInmuebles?: readonly string[]  // subconjunto opcional
}

interface ResultadoJobCartera {
  readonly ejecucionId: string
  readonly fechaCorte: Date
  readonly inmueblesEvaluados: number
  readonly cambiosClasificacion: number
  readonly cambiosEtapa: number
  readonly accionesCreadas: number
  readonly accionesOmitidas: number
  readonly promesasIncumplidas: number
  readonly acuerdosIncumplidos: number
  readonly candidatosEscalamiento: number
  readonly alertas: readonly AlertaCartera[]
  readonly resultadoHash: string
}
```

`modo: 'simulacion'` ejecuta todo el pipeline **sin escribir**, devolviendo lo que habría pasado. Requisito de negocio real: ningún administrador acepta que el sistema empiece a enviar requerimientos sin haber visto antes qué va a enviar.

## 18.2 Secuencia

```text
JOB_CARTERA_DIARIA(tenantId, fechaCorte, modo)

 0. Verificar prerrequisitos bloqueantes.  Si falta uno → ABORTAR con BLOCKED.
 1. Cargar política de clasificación vigente a fechaCorte.
 2. Cargar política de cobranza vigente a fechaCorte.
 3. Obtener cargos con saldo > 0 y fecha_vencimiento < fechaCorte.
 4. Calcular antigüedad por cargo.
 5. Agregar posición por inmueble (deuda, dias_mora_maximo, crédito).
 6. Clasificar cada inmueble  → clasificarCartera().
 7. Comparar contra el snapshot del día anterior.
 8. Detectar cambios de clasificación  → evento CARTERA_CLASIFICACION_CAMBIO.
 9. Evaluar escalamiento               → evaluarEscalamiento().
10. Detectar cambios de etapa          → evento CARTERA_ETAPA_CAMBIO.
11. Detectar promesas vencidas         → evento PROMESA_INCUMPLIDA.
12. Detectar cuotas de acuerdo vencidas→ evento ACUERDO_CUOTA_VENCIDA.
13. Evaluar incumplimiento de acuerdos → evento ACUERDO_INCUMPLIDO + descongelar.
14. Evaluar acciones aplicables por estrategia.
15. Aplicar reglas anti-duplicación (§10.4).
16. Crear acciones en estado 'programada' o 'pendiente_aprobacion'.
17. Cancelar acciones programadas que ya no aplican (inmueble al día).
18. Identificar candidatos a escalamiento que requieren aprobación → alertas.
19. Escribir posiciones_cartera_snapshot con posicion_hash.
20. Registrar eventos_cartera de todo lo anterior.
21. Registrar la ejecución en audit_log.
22. Devolver ResultadoJobCartera.

NOTA: la ejecución material de notificaciones NO ocurre aquí.
El job CREA acciones; un worker separado las EJECUTA (§18.4).
```

## 18.3 Idempotencia

`[ARQ]` **El job debe poder correrse dos veces el mismo día sin efectos duplicados.**

```text
IDEM-01  posiciones_cartera_snapshot tiene unique (tenant, inmueble, fecha_corte).
         Segunda corrida → ON CONFLICT DO NOTHING, o verificación de hash.

IDEM-02  Las acciones se crean con las reglas anti-duplicación de §10.4,
         que ya cubren la re-ejecución.

IDEM-03  Los eventos llevan una clave de deduplicación:
         (tipo, inmueble_id, fecha_corte, entidad_id).

IDEM-04  Si el hash de posición coincide con el del día anterior y no hubo
         cambio de clasificación, no se emite evento de cambio.
```

`[GAP]` **`GAP-CAR-003`** — Un pago registrado con `fecha_pago` retroactiva **cambia el pasado**. El snapshot del día anterior deja de ser reproducible. Decisión requerida:

```text
Opción 1: los snapshots son inmutables; un pago retroactivo no los reescribe.
          El histórico refleja "lo que se sabía entonces".   ← recomendada
Opción 2: recalcular snapshots afectados y versionarlos.
          Más correcto contablemente, mucho más costoso.

RECOMENDACIÓN: Opción 1 + registro del pago retroactivo como evento
que explica la discontinuidad. Es coherente con la inmutabilidad de
resultados del motor de liquidación (Docs 20 §69 RESULT IMMUTABILITY).
```

`[ARQ]` **Agendamiento (2026-08-29, PRQ-CAR-010 cerrado).** `pg_cron` dispara `cron_cartera_recalcular_diario()` a las **11:00 UTC = 6:00 a. m. Colombia**; esa función hace un `net.http_post` a `cartera-cron-diario`, que recorre las copropiedades con política **vigente** e invoca `cartera-recalcular` en modo ejecución. Alcance decidido por el propietario del producto: **la corrida solo calcula**. Crea las acciones en la bandeja y no despacha ningún mensaje; el envío exige una persona en `/cartera/acciones` o agendar `cartera-ejecutar-lote`, que es otra decisión.

`[ARQ]` **Por qué hay un disparador intermedio y no una llamada directa:** `cartera-recalcular` se autentica con `withSupabase({auth:['user','secret']})`. El modo `secret` valida la clave interna del proyecto, que vive en las Edge Functions y no debe copiarse a la base ni a Vault. El primer intento —pg_cron llamando directo con la service key— devolvió **63 respuestas 401**: una service key no es un JWT de usuario. El disparador lee la clave dentro de Supabase y hacia afuera solo expone un token propio en la ruta.

`[ARQ]` `cartera_corridas_diarias` responde «¿corrió hoy esta copropiedad?». `cron.job_run_details` solo dice si el JOB corrió, no a quién alcanzó.

## 18.4 Worker de ejecución de acciones

`[ARQ]` **Estado 2026-08-28 — construido.** El despacho vive en `supabase/functions/_shared/despacho_cobranza.ts`, compartido por `ejecutar-accion-cobranza` (una acción) y `cartera-ejecutar-lote` (la corrida). Pasos 2-7 completos para canal SMS: evidencia §34.3, evento de dominio (paso 6, antes no se emitía) y tope de `max_intentos` contado sobre los ENVÍOS reales, no sobre un contador en la acción (paso 7).

`[NEGOCIO]` **El lote simula por defecto.** Pedir `modo: 'ejecucion'` es explícito, y exige rol administrador; simular basta con auxiliar. Cada acción despachada es un SMS facturado: la diferencia entre una corrida de prueba y una factura inesperada no puede depender de acordarse de un parámetro. La simulación recorre las mismas validaciones y devuelve el mensaje renderizado exacto — que es lo que §17/bloque 17 necesita para la pantalla de simulación previa.

`[ARQ]` El lote es **secuencial**: el proveedor tiene límites de tasa y el orden de los envíos es parte de la evidencia. Cincuenta SMS en paralelo se ganan un 429 y dejan media cartera sin notificar.


`[ARQ]` Separado del job de cálculo, por tres razones: las notificaciones fallan y hay que reintentar; el cálculo debe poder correrse sin enviar nada (`modo: 'simulacion'`); y el volumen de envío tiene límites de proveedor.

```text
WORKER_ACCIONES_COBRANZA

  1. Tomar acciones en estado 'aprobada' o 'programada' (si no requiere aprobación)
     con fecha_programada <= hoy.
  2. Resolver destinatario y contacto vigente.
  3. Renderizar plantilla → contenido_hash.
  4. Enviar por el canal → referencia_externa.
     ↳ §34: registrar acciones_cobranza_envios con el contenido
       RENDERIZADO, la versión de plantilla y el destinatario resuelto.
  5. estado = 'ejecutada' | 'fallida'.
     ↳ 'ejecutada' = DESPACHADA al proveedor, no recibida (REC-CAR-016).
       La entrega llega después, por webhook, a
       acciones_cobranza_acuses. La acreditación se DERIVA (§34.4).
  6. Evento COBRANZA_ACCION_EJECUTADA | COBRANZA_ACCION_FALLIDA.
  7. Reintentos con backoff, hasta max_intentos.
     ↳ Cada reintento es un envío nuevo, con su propio intento_numero.
```

---

# 19. Eventos de dominio

## 19.1 Catálogo

```text
-- OBLIGACIONES
CARGO_VENCIDO
CARGO_SALDADO

-- CARTERA
CARTERA_CLASIFICACION_CAMBIO
CARTERA_ETAPA_CAMBIO
CARTERA_POSICION_CONGELADA

-- COBRANZA
COBRANZA_ACCION_PROGRAMADA
COBRANZA_ACCION_APROBADA
COBRANZA_ACCION_RECHAZADA
COBRANZA_ACCION_EJECUTADA
COBRANZA_ACCION_FALLIDA
COBRANZA_ACCION_OMITIDA
COBRANZA_ACCION_CANCELADA
COBRANZA_RESULTADO_REGISTRADO

-- PROMESAS Y ACUERDOS
PROMESA_REGISTRADA
PROMESA_CUMPLIDA
PROMESA_INCUMPLIDA
ACUERDO_CREADO
ACUERDO_APROBADO
ACUERDO_CUOTA_VENCIDA
ACUERDO_CUOTA_PAGADA
ACUERDO_CUMPLIDO
ACUERDO_INCUMPLIDO

-- JURÍDICO
CERTIFICACION_DEUDA_EXPEDIDA
CERTIFICACION_DEUDA_ANULADA
CASO_JURIDICO_CREADO
CASO_JURIDICO_ACTUACION
CASO_JURIDICO_ESTADO_CAMBIO
CASO_JURIDICO_CERRADO
COSTA_JUDICIAL_REGISTRADA

-- INTEGRACIÓN (consumidos, no producidos por este bloque)
PAGO_REGISTRADO
PAGO_IMPUTADO
INTERES_CALCULADO
NOVEDAD_APROBADA
LIQUIDACION_COMPLETADA
```

## 19.2 Estructura del evento

```sql
create table public.eventos_cartera (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  tipo              public.tipo_evento_cartera_t not null,
  inmueble_id       uuid references public.inmuebles (id),
  entidad_tipo      text,          -- 'accion_cobranza'|'acuerdo_pago'|'caso_juridico'...
  entidad_id        uuid,

  fecha_corte       date not null,
  ocurrido_at       timestamptz not null default now(),

  -- ANTES / DESPUÉS — obligatorio para transiciones
  estado_anterior   jsonb,
  estado_nuevo      jsonb,
  motivo            text not null,

  -- REPRODUCIBILIDAD
  politica_id       uuid,
  politica_version  int,

  -- AUTORÍA
  origen            public.origen_evento_t not null,  -- 'job'|'usuario'|'sistema'|'integracion'
  actor_id          uuid references public.profiles (id),
  ejecucion_id      uuid,          -- correlaciona todos los eventos de una corrida

  dedup_key         text,
  created_at        timestamptz not null default now(),
  constraint evento_dedup unique nulls not distinct (tenant_id, dedup_key)
);

create trigger eventos_cartera_append_only
  before update or delete on public.eventos_cartera
  for each row execute function public.forbid_mutation();

create index on public.eventos_cartera (tenant_id, inmueble_id, ocurrido_at desc);
create index on public.eventos_cartera (tenant_id, tipo, fecha_corte);
create index on public.eventos_cartera (ejecucion_id);
```

## 19.3 Criterio de auditabilidad

`[ARQ]` `I-C13` — **AQUILA debe poder explicar por qué un inmueble cambió de etapa.** Un evento sin `motivo` legible por humanos es un evento incompleto.

Ejemplo de evento completo:

```json
{
  "tipo": "CARTERA_CLASIFICACION_CAMBIO",
  "inmueble_id": "…",
  "fecha_corte": "2026-08-16",
  "estado_anterior": { "codigo": "MORA_INICIAL", "dias_mora": 60 },
  "estado_nuevo":    { "codigo": "MORA_MEDIA",   "dias_mora": 61 },
  "motivo": "El cargo C-001 (período 2026-06, vence 2026-06-10) alcanzó 61 días de mora, superando el límite del tramo MORA_INICIAL (31-60).",
  "politica_id": "…",
  "politica_version": 3,
  "origen": "job",
  "ejecucion_id": "…"
}
```

---

# 20. Parámetros y políticas

## 20.1 Regla anti-monolito

`[ARQ]` **No crear una tabla monolítica de parámetros.** Cada dominio tiene su política, con su propio ciclo de versionado, su propia autoridad de aprobación y su propio hash.

```text
politicas_financieras            ← YA EXISTE (mora, imputación, redondeo)
politicas_clasificacion_cartera  ← nuevo   (tramos de antigüedad)
politica_clasificacion_tramos    ← nuevo
estrategias_cobranza             ← nuevo   (qué acción, cuándo, cuántas)
politicas_gastos_cobranza        ← nuevo   (gastos extrajudiciales)
politica_gasto_cobranza_items    ← nuevo
tasas_referencia                 ← nuevo   (IBC, GLOBAL, no por tenant)
politicas_escalamiento           ← nuevo   (reglas de transición configurables)
```

## 20.2 Contrato común de política versionada

`[ARQ]` **`REC-CAR-006`** — Toda política de este bloque implementa el mismo contrato, copiado de `politicas_financieras`:

```text
version           int not null
estado            vigencia_estado_t   ('borrador'|'vigente'|'historica')
vigente_desde     date
vigente_hasta     date
policy_hash       text not null
aprobada_por      uuid
acta_referencia   text

+ constraint: una sola vigente por tenant
+ trigger:    guard_politica_inmutable  (vigente ⇒ no UPDATE)
+ regla:      corregir = nueva versión
+ regla:      todo registro que la usó guarda politica_id + version
```

## 20.3 Reglas de resolución temporal

```text
Política aplicable a una fecha F =
    la política con estado='vigente'
    y vigente_desde <= F
    y (vigente_hasta is null or vigente_hasta >= F)

Si no existe → ERROR explícito. NUNCA un default.
    PoliticaClasificacionNoConfiguradaError
    EstrategiaCobranzaNoConfiguradaError
```

Coherente con el estilo de errores existente (`PoliticaMoraNoConfiguradaError`).

---

# 21. Seguridad, RLS y aislamiento

## 21.1 Regla no negociable

`[ARQ]` **`REC-CAR-007`** — Toda tabla nueva de este bloque lleva:

```sql
tenant_id uuid not null references public.tenants (id) on delete cascade
alter table … enable row level security;
alter table … force row level security;
```

Sin excepción, salvo `tasas_referencia` (§13.3), que es global y debe documentarse como excepción explícita con su justificación.

## 21.2 Modelo de roles real

✅ **`GAP-CAR-009` resuelto parcialmente (Opción A) — migraciones `20260822250000`/`20260822260000`.** El modelo actual es:

```sql
-- 20260813190000_extensions_and_enums.sql
--   + 20260822250000_rol_administrador_enum.sql
create type public.tenant_role_t as enum ('auxiliar', 'auditor', 'administrador');
-- 'agent' se renombró a 'auxiliar' en 20260830100000. El documento decía
-- 'agent' hasta el 2026-08-28, cuando un test de integración chocó contra
-- el enum real (invalid input value for enum tenant_role_t: "agent").

-- helpers disponibles (20260813190200_helper_functions.sql)
--   + 20260822260000_rol_administrador_permisos.sql (has_role, guard_last_agent)
public.current_tenant_id()
public.is_member(p_tenant uuid)
public.has_role(p_tenant uuid, p_roles public.tenant_role_t[])
public.shares_tenant_with(p_user uuid)
public.is_platform_admin()
```

**Decisión tomada (2026-08-17): Opción A** de las tres evaluadas — extender `tenant_role_t` en vez de una capa de permisos separada (Opción B) o un campo de "cargo" (Opción C). Razón: el proyecto ya tiene un único eje de rol (`tenant_role_t`) consumido por 88 sitios vía `has_role()`; una capa paralela habría sido un segundo mecanismo de permisos sin precedente en el repo.

**Cómo se resolvió sin reescribir las 88 policies existentes:** todas pasan por `has_role()`, así que se amplió esa única función en vez de cada policy — `administrador` satisface cualquier chequeo `array['auxiliar', ...]` (administrador ⊇ auxiliar), y además puede satisfacer chequeos que pidan `'administrador'` explícitamente (los de aprobación de F4, que un `auxiliar` simple NO debe poder satisfacer). `guard_last_agent()` (SEC-07) se amplió en el mismo commit: protegía solo `role = 'auxiliar'` directo (sin pasar por `has_role()`); ahora protege "≥1 `auxiliar` o `administrador` activo", para que una copropiedad nunca quede con un administrador desprotegido y cero auxiliares. Probado en `tests/rls/rol-administrador.test.ts` (4 tests, DB real): herencia de permisos, no-herencia accidental de `auditor`, y el guard ampliado en ambos sentidos.

Esto resuelve las consecuencias (1) y (2) de la versión anterior de esta sección:

```text
1. RESUELTO — ya existe la figura del ADMINISTRADOR como rol de tenant
   identificable, distinto de `agent`. [LEGAL] — el título ejecutivo del
   art. 48 ahora puede emitirse a nombre de un `administrador` real.

2. RESUELTO a nivel de rol — ya es posible distinguir "puede proponer"
   (agent o administrador) de "puede aprobar" (solo administrador,
   vía has_role(tenant, ['administrador']) sin incluir 'auxiliar' en el
   array). La separación de funciones en las tablas de acciones/
   aprobación de F4 todavía no está construida — esto solo desbloquea
   que se pueda construir correctamente.

3. PENDIENTE — sin cambios. El acceso del residente a su propia cartera
   sigue sin mecanismo (no existe rol `residente` ni el vínculo
   usuario↔inmueble, diferido por GAP-CAR-010/AD-26, fuera de F1-F9).
```

## 21.3 Matriz de permisos objetivo

`[NEGOCIO]` Matriz **objetivo**. `administrador` ya existe como rol real (§21.2) — lo marcado `administrador` se implementa con `has_role(tenant, ['administrador'])` (no satisfecho por un `agent` simple). `residente` sigue sin rol propio (`GAP-CAR-010`) y queda **fuera de alcance**.

| Objeto | `administrador` | `agent` | `auditor` | `residente` |
|---|---|---|---|---|
| Posición de cartera (todos los inmuebles) | R | R | R | — |
| Posición de cartera (propio inmueble) | R | R | R | **R** |
| `politicas_clasificacion_cartera` | RW | — | R | — |
| `estrategias_cobranza` | RW | R | R | — |
| `acciones_cobranza` | RW | RW | R | R (propias) |
| Aprobar acción de alto impacto | ✔ | — | — | — |
| `promesas_pago` | RW | RW | R | R (propias) |
| `acuerdos_pago` | RW | R | R | R (propios) |
| Aprobar acuerdo | ✔ | — | — | — |
| Condonar intereses *(requiere acta)* | ✔ | — | — | — |
| `certificaciones_deuda` | **RW** | R | R | — |
| `casos_juridicos` | RW | R | R | — |
| `costas_judiciales` | RW | — | R | — |
| `eventos_cartera` | R | R | R | — |

`[LEGAL]` Solo el **administrador** expide la certificación del art. 48 — es una función prevista en la ley para ese cargo. El campo `cargo_firmante` debe reflejar la persona y su calidad, no solo el `user_id`.

## 21.4 Acceso del residente a su propia cartera

`[NEGOCIO]` `[GAP]` Un residente debería poder ver su propia deuda, antigüedad, acciones recibidas y acuerdo; y **nunca** la cartera de otros ni la política de escalamiento.

`[GAP]` **`GAP-CAR-010`** — **No es un olvido: es una decisión arquitectónica vigente en contra.** La tabla `propietarios` (renombrada a `personas` en `20260820100000` y luego a `terceros` en `20260821100000`) llevaba este comentario en su migración original:

> `'Datos del dominio, no usuarios (AD-26): sin FK a auth.users, sin política RLS propia de identidad — se leen a través del tenant (PLAN §7.5).'`

El comentario actual sobre `terceros` (`20260821100000`) ya no repite ese texto literal, pero la decisión de fondo sigue vigente: `terceros` sigue sin FK a `auth.users` ni política RLS propia de identidad.

Es decir, **`AD-26` establece deliberadamente que un tercero NO es un usuario.** No hay FK a `auth.users` y no la hay por diseño.

Consecuencia: dar acceso al residente **no es implementar una política RLS faltante, es revisar `AD-26`**. Eso excede este bloque y debe escalarse como decisión de arquitectura, no resolverse aquí.

```text
Hasta que AD-26 se revise formalmente:
  · PH-C35 (residente ve solo lo suyo) queda FUERA DE ALCANCE.
  · El bloque de cartera es una herramienta de gestión INTERNA
    (administrador, agente, auditor), no un portal del residente.
  · La comunicación con el residente ocurre por NOTIFICACIÓN saliente
    (email/SMS al contacto de `terceros`), no por acceso a la app.
```

`[ARQ]` Esto en realidad **simplifica las fases F1-F9**: no hay que diseñar una superficie de lectura para residentes. Si más adelante se revisa `AD-26`, se añade como fase F10 sin tocar lo construido.

Forma esperada una vez resuelto, usando los helpers reales del proyecto:

```sql
create policy posicion_cartera_lectura on public.posiciones_cartera_snapshot
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.has_role(tenant_id, array['auxiliar','auditor']::public.tenant_role_t[])
      or inmueble_id in (select public.fn_inmuebles_del_usuario(auth.uid()))
    )
  );
```

`fn_inmuebles_del_usuario` **no existe** y es entregable de `GAP-CAR-010`.

`[VERIFICAR]` **`VER-CAR-04`** — La publicación de morosos autorizada por el art. 30 par. de la L675 debe conciliarse con la Ley 1581 de 2012 (habeas data). **No implementar sin concepto.** Nunca exponer datos de deuda de un tercero a otro residente por vía de API.

## 21.4 Prohibición cross-tenant

`[ARQ]` `SEC-03` — Ninguna consulta, vista, función o índice de este bloque puede agregar datos de más de un `tenant_id`. Esto incluye los indicadores y el dashboard. `GAP-17` sigue cerrado.

---

# 22. Servicios, APIs y funciones

## 22.1 Funciones puras (paquete `liquidation-engine`)

```typescript
// packages/liquidation-engine/src/cartera.ts
calcularAntiguedad(cargos, fechaCorte): readonly CargoConAntiguedad[]
agregarPosicion(cargosConAntiguedad, creditos): PosicionCartera
clasificarCartera(diasMora, politica): ResultadoClasificacion

// packages/liquidation-engine/src/cartera-escalamiento.ts
evaluarEscalamiento(ctx): DecisionEscalamiento
evaluarAccionesAplicables(ctx, estrategias, historial): readonly AccionPropuesta[]
evaluarIncumplimientoAcuerdo(acuerdo, cuotas, fechaCorte, regla): ResultadoIncumplimiento
evaluarCumplimientoPromesa(promesa, pagos, tolerancia): ResultadoPromesa
```

Todas: **puras, deterministas, sin I/O, sin `Date.now()`**. Mismo estándar que `cuenta-corriente.ts`.

## 22.2 Adaptadores I/O

```typescript
// packages/liquidation-engine/src/cartera-supabase.ts
obtenerCargosVencidos(client, tenantId, fechaCorte, inmuebleId?)
obtenerPoliticaClasificacionVigente(client, tenantId, fecha)
obtenerEstrategiasVigentes(client, tenantId, politicaId)
obtenerHistorialAcciones(client, tenantId, inmuebleId, desde)
registrarAccionesCobranza(client, acciones)
registrarSnapshotPosicion(client, snapshots)
registrarEventosCartera(client, eventos)
```

Sigue el precedente de `cuenta-corriente-supabase.ts`.

## 22.3 Edge Functions

| Función | Método | Responsabilidad | Rol mínimo |
|---|---|---|---|
| `cartera-recalcular` ✅ | POST | Ejecuta `JOB_CARTERA_DIARIA` para un tenant y fecha de corte | `admin` |
| `cartera-posicion` ✅ | POST | Devuelve `fn_posicion_cartera` + clasificación por inmueble | `agent`/`auditor` |

`[ARQ]` Corrección sobre la v2.0 de este documento: **todas** las Edge Functions reales del repo usan `POST` con cuerpo JSON, nunca `GET` (`calcular-intereses`, `registrar-pago`, etc. — verificado en `supabase/functions/`). La tabla original de esta sección sugería `GET` para lecturas antes de comprobar la convención real; se corrige aquí siguiendo `REC-CAR-004`: no inventar un estilo nuevo cuando ya existe uno establecido.
| `cobranza-ejecutar-acciones` | POST | Worker de envío (§18.4) | sistema |
| `cobranza-aprobar-accion` | POST | Aprueba acción de alto impacto | `admin` |
| `cobranza-registrar-resultado` | POST | Registra resultado de gestión (llamada, visita) | `agent` |
| `acuerdo-crear` | POST | Crea acuerdo + genera cuotas | `admin` |
| `acuerdo-aprobar` | POST | Aprueba y congela etapa | `admin` |
| `certificar-deuda` | POST | Expide certificación art. 48 | `admin` |
| `caso-juridico-crear` | POST | Abre caso desde certificación | `admin` |

`[ARQ]` Todas las Edge Functions de escritura reciben `fecha_referencia` / `fecha_corte` explícita en el payload, siguiendo el precedente de `calcular-intereses` (`AD-32`).

## 22.4 Contrato de error

Reutiliza el patrón de `packages/liquidation-engine/src/errors.ts`:

```typescript
PoliticaClasificacionNoConfiguradaError
TramoClasificacionNoEncontradoError        // viola IC-TRAMO-01
PoliticaClasificacionInvalidaError         // viola IC-TRAMO-02..05
TransicionEtapaNoPermitidaError            // fuera de la matriz §11.3
AccionCobranzaDuplicadaError
CertificacionSinCargosVencidosError
CasoJuridicoSinCertificacionError
CostaSinDocumentoFuenteError
PrerrequisitoCarteraNoVerificadoError      // → estado BLOCKED
```

---

# 23. Dashboard e indicadores

## 23.1 Tarjetas principales

```text
CARTERA TOTAL              Σ saldo de todos los cargos con saldo > 0
CARTERA VENCIDA            Σ saldo de cargos con vencimiento < fecha_corte
CARTERA CORRIENTE          Σ saldo de cargos no vencidos
INTERESES CAUSADOS         Σ saldo de cargos categoria = 'interes'
CARTERA > 90 DÍAS          Σ saldo con dias_mora > 90
CARTERA > 180 DÍAS         Σ saldo con dias_mora > 180
CARTERA PREJURÍDICA        Σ deuda de inmuebles en etapa 'prejuridica'
CARTERA JURÍDICA           Σ deuda de inmuebles en etapa 'juridica' + 'judicial'
SALDOS A FAVOR             Σ saldo_credito
```

## 23.2 Distribución por antigüedad (aging)

```text
Al día      dias_mora = 0
1–30        MORA_TEMPRANA
31–60       MORA_INICIAL
61–90       MORA_MEDIA
91–120      MORA_AVANZADA
121–180     MORA_CRITICA
181–360     ALTO_RIESGO
>360        CRITICA
```

Por cada tramo: **número de inmuebles**, **monto**, **% del total**, **variación vs. mes anterior**.

## 23.3 Indicadores — fórmulas exactas

`[NEGOCIO]` Alineados con la práctica estándar de la industria de cobranza, para permitir benchmark externo.

| Indicador | Fórmula | Interpretación |
|---|---|---|
| **Overdue Portfolio %** | `cartera_vencida / cartera_total` | Salud general |
| **Recovery Rate** | `Σ pagos aplicados a cargos vencidos en el período / cartera vencida al inicio del período` | Eficacia global de recaudo |
| **Roll Rate (t→t+1)** | `Σ deuda que estaba en tramo T en t−1 y está en tramo T+1 en t / Σ deuda en tramo T en t−1` | **El indicador predictivo clave.** Mide deterioro |
| **Cure Rate** | `Σ deuda que estaba vencida en t−1 y está al día en t / Σ deuda vencida en t−1` | Recuperación a estado sano |
| **Collection Effectiveness** | `acciones con resultado ∈ (pago_recibido, promesa_de_pago, acuerdo_solicitado) / acciones ejecutadas` | Eficacia por canal y por gestor |
| **Promise Fulfillment Rate** | `promesas cumplidas / promesas vencidas` | Confiabilidad de la promesa como señal |
| **Agreement Fulfillment Rate** | `acuerdos cumplidos / acuerdos terminados` | Calidad del diseño de acuerdos |
| **Legal Referral Rate** | `inmuebles remitidos a jurídico / inmuebles que alcanzaron el tramo jurídico` | Disciplina de escalamiento |
| **Legal Recovery Rate** | `Σ monto_recuperado en casos / Σ monto_pretension` | Rentabilidad de la vía judicial |
| **Average Days to Recovery** | `promedio(fecha_pago − fecha_vencimiento)` sobre cargos saldados | Velocidad de recaudo |
| **Cost to Collect** | `Σ costos de acciones + costas / Σ recuperado` | Si > 1, la gestión destruye valor |

## 23.4 Transiciones críticas a vigilar

`[NEGOCIO]` La industria concentra el análisis en los puntos donde la deuda se vuelve estructuralmente más difícil de recuperar:

```text
31–60   →  61–90       ← primera señal de deterioro sostenido
61–90   →  91–120      ← punto de inflexión: entra a prejurídico
91–120  →  121–180     ← la gestión administrativa ya falló
181–360 →  jurídica    ← decisión de invertir en proceso
```

`[ARQ]` Un roll rate alto entre `61-90 → 91-120` indica que la estrategia de cobranza administrativa **no está funcionando**, y es la métrica que debe disparar revisión de la política. Esto es lo que convierte al dashboard en una herramienta de gestión y no en un reporte.

## 23.5 Panel de acciones

```text
Acciones pendientes de aprobación     ← cola de trabajo del administrador
Acciones programadas para hoy
Acciones fallidas (requieren datos)
Llamadas pendientes                   ← cola de trabajo del gestor
Promesas que vencen hoy
Cuotas de acuerdo que vencen esta semana
Casos jurídicos sin actuación en 30 días
Certificaciones por vencer
```

---

# 24. Prerrequisitos

## 24.1 Registro

`[PRQ]` Cada prerrequisito tiene dueño, documento dueño, estado real y razón de dependencia. **Si un prerrequisito bloqueante no está verificado, el bloque pasa de `READY` a `BLOCKED`. No se inventan valores por defecto.**

| Id | Prerrequisito | Dueño | Estado real | ¿Bloqueante? | Razón |
|---|---|---|---|---|---|
| `PRQ-CAR-001` | Obligación financiera (`cargos`) | Motor cuenta corriente | ✅ **Verificado** | Sí | Sin obligación no hay cartera |
| `PRQ-CAR-002` | **Fecha de vencimiento por cargo** | Este bloque + `periodos` | ⚠️ **Parcial** — `periodos.fecha_vencimiento` existe pero es nullable (`GAP-CAR-001`) | **Sí** | Sin vencimiento no hay antigüedad |
| `PRQ-CAR-003` | Versionado de tasa de interés | Política financiera | ✅ **Verificado** — `GAP-CAR-004` resuelto en F2 | Sí | — |
| `PRQ-CAR-004` | Modelo de pagos (`pagos`) | Motor cuenta corriente | ✅ **Verificado** | Sí | — |
| `PRQ-CAR-005` | Política de imputación | `politicas_financieras` | ✅ **Verificado** (`AD-36`) | Sí | Determina la antigüedad resultante |
| `PRQ-CAR-006` | Modelo de saldo (`v_cargo_saldo`) | Motor cuenta corriente | ✅ **Verificado** | Sí | — |
| `PRQ-CAR-007` | Historial de propiedad / responsabilidad | Dominio inmuebles | ✅ **Verificado** — `inmueble_persona_rol(vigente_desde, vigente_hasta, porcentaje)`, antes `inmueble_propietario` | Sí | A quién se le cobra qué período |
| `PRQ-CAR-008` | Snapshot / reproducibilidad | Motor liquidación (patrón) | ✅ **Patrón disponible** | Sí | `I-C15` |
| `PRQ-CAR-009` | Infraestructura de notificaciones | ✅ **Existe para SMS** — `plantillas_sms` + `sendSms()` (Brevo Transactional SMS) | ✅ **`GAP-CAR-005` resuelto para SMS (2026-08-17)** — email/WhatsApp siguen sin generalizar | **Sí** para F4 | Envío SMS real ya integrado en `ejecutar-accion-cobranza` |
| `PRQ-CAR-010` | Infraestructura de tareas/colas | **No existe** | ❌ **`GAP-CAR-005`** — *sigue abierto: `pg_cron` solo tiene un job (`purge-audit-log-24-meses`); el worker de F4 se invoca manualmente, una acción a la vez* | **Sí** para orquestación por lotes (no para invocar el worker una acción a la vez, que ya funciona) | Worker de ejecución existe; falta quién lo llame en lote |
| `PRQ-CAR-011` | Registro de fuente/autoridad | `fundamento_normativo` | ⚠️ **Verificar cobertura** | Sí para costas | `I-C11` |
| `PRQ-CAR-012` | Infraestructura de auditoría | `audit_log` | ✅ **Verificado** | Sí | — |
| `PRQ-CAR-013` | Almacenamiento de documentos | Supabase Storage | ⚠️ **`GAP-CAR-007`** | **Sí** para F7 | Expediente jurídico |
| `PRQ-CAR-014` | Modelo de aprobación / decisión | `novedades` (`AD-33`) | ✅ **Patrón disponible** | Sí | Aprobación de acciones y acuerdos |
| `PRQ-CAR-015` | Terceros (abogados) | `tenant_tercero_rol` | ✅ **Verificado** — `terceros` + `tenant_tercero_rol(rol_id, vigente_desde, vigente_hasta, recibe_notificaciones)` | Sí para F7 | Asignación de abogado |
| `PRQ-CAR-016` | Conceptos jurídicos `VER-CAR-01..06` | **Externo — jurídico** | ❌ **Abierto** | **Sí, varios** | §3.5 |
| `PRQ-CAR-017` | Rol de administrador y separación proponer/aprobar | Dominio tenancy | ✅ **Verificado** — rol resuelto (`~~GAP-CAR-009~~`); separación proponer/aprobar construida sobre `acciones_cobranza` (`20260822280000_cartera_cobranza_aprobacion.sql`) | **Sí** para F4 y F7 | Art. 48 exige firmante identificado |
| `PRQ-CAR-018` | Vínculo usuario ↔ inmueble | **Arquitectura (`AD-26`)** | ⤴ **Diferido** — `GAP-CAR-010` | No para F1-F9 | Solo para acceso del residente |
| `PRQ-CAR-019` | **Webhooks de acuse** del proveedor de envío | Infraestructura | ❌ **No existe.** Brevo los ofrece; no hay endpoint que los reciba | **Sí** para §34, canales con acuse técnico | Sin acuse no hay notificación acreditable |
| `PRQ-CAR-020` | **Operador postal** con guía rastreable | Externo — proveedor | ❌ **No existe.** Ningún código lo contempla, pese a que el canal físico se ofrece en la interfaz | **Sí** para §34, canal físico | El envío físico es el de mayor peso probatorio |
| `PRQ-CAR-021` | **Versionado recuperable de plantillas** | Este bloque + plantillas | ⚠️ **Parcial** — `plantillas_sms` y `email_templates` existen; no se puede recuperar una versión anterior | **Sí** para §34 | Hay que aportar el texto exacto que se envió |
| `PRQ-CAR-022` | `subir-documento` acepta `envio_id` | Este bloque | ⚠️ **Parcial** — la Edge Function existe (`GAP-CAR-007` resuelto), falta el campo | Sí para canal físico | Cargue del acuse escaneado |

## 24.2 Regla de bloqueo

```text
estado_bloque(fase) =
    BLOCKED   si  ∃ prq ∈ prerrequisitos(fase) : prq.bloqueante ∧ ¬prq.verificado
    READY     en otro caso

Un bloque en BLOCKED no se implementa.
No se sustituye un prerrequisito faltante por un valor inventado.
Se escala el bloqueo al dueño del prerrequisito.
```

## 24.3 Ruta crítica de desbloqueo

```text
1. GAP-CAR-001 (fecha de vencimiento no nula)  ← desbloquea TODO el bloque
2. VER-CAR-01  (conversión de tasa IBC→mensual)← desbloquea el cálculo de mora
3. VER-CAR-02  (anatocismo)                    ← confirma el diseño actual
4. VER-CAR-03  (gastos de cobranza)            ← desbloquea la fase 6
5. GAP-CAR-007 (storage documental)            ← desbloquea la fase 7
6. VER-CAR-05  (prescripción)                  ← desbloquea la retención §34.6
                                                 y la alerta de prescripción
7. PRQ-CAR-019 (webhooks de acuse)             ← desbloquea §34 acreditación
8. PRQ-CAR-020 (operador postal)               ← desbloquea §34 canal físico

CONSULTA JURÍDICA ÚNICA (ENM-CAR-04): VER-CAR-01, VER-CAR-02, VER-CAR-05,
VER-CAR-07 y VER-CAR-08 se llevan al abogado EN UNA SOLA CONSULTA. Es lo
único de la ruta que no depende del equipo y con el tiempo de respuesta
más incierto — arrancarla antes que cualquier otra cosa.

RESUELTOS (no requieren más trabajo):
  ✅ GAP-CAR-006  inmueble_persona_rol ya es temporal con porcentaje
  ✅ PRQ-CAR-015  terceros + tenant_tercero_rol ya existen
  ✅ GAP-CAR-009  rol administrador (2026-08-17, 20260822250000/260000)
  ✅ GAP-CAR-005  resuelto para SMS (2026-08-17) — email/WhatsApp abiertos

ESCALADO FUERA DEL BLOQUE (no bloquea F1-F9):
  ⤴ GAP-CAR-010  requiere revisar AD-26 (propietario ≠ usuario)
```

---

# 25. Matriz de requisitos

`[ARQ]` Formato `REQ-CAR-NNN`, coherente con `Docs/22` (`REQ-<DOMAIN>-<NNN>`).

| Id | Requisito | Fuente | Golden Case | Invariante |
|---|---|---|---|---|
| `REQ-CAR-001` | Toda obligación vencida tiene antigüedad calculable y reproducible | `[ARQ]` | `PH-C02` | `I-C01` |
| `REQ-CAR-002` | La antigüedad se calcula por obligación, no solo por inmueble | `[ARQ]` | `PH-C06` | — |
| `REQ-CAR-003` | La clasificación usa el cargo vencido más antiguo **con saldo** | `[NEGOCIO]` | `PH-C05` | `I-C01` |
| `REQ-CAR-004` | Los tramos son configurables y versionados por copropiedad | `[NEGOCIO]` | `PH-C29` | `I-C10` |
| `REQ-CAR-005` | Un cambio de política no altera clasificaciones históricas | `[ARQ]` | `PH-C30` | `I-C10` |
| `REQ-CAR-006` | La antigüedad no modifica la tasa de mora | `[LEGAL]` art. 30 | `PH-C10` | `I-C03` |
| `REQ-CAR-007` | El interés se causa solo sobre capital vencido elegible | `[LEGAL]` + `VER-CAR-02` | `PH-C10` | `I-C02`,`I-C04` |
| `REQ-CAR-008` | Un cambio de tasa durante la mora produce segmentos | `[LEGAL]` | `PH-C11` | — |
| `REQ-CAR-009` | Cada acción de cobranza congela su contexto | `[ARQ]` | `PH-C28` | `I-C13` |
| `REQ-CAR-010` | Las acciones no se duplican cuando la política lo prohíbe | `[NEGOCIO]` | `PH-C13` | `I-C07` |
| `REQ-CAR-011` | Las acciones de alto impacto requieren aprobación humana | `[NEGOCIO]` | `PH-C19`,`PH-C20` | `I-C12` |
| `REQ-CAR-012` | Un acuerdo no elimina ni reescribe obligaciones | `[ARQ]` | `PH-C16` | `I-C08` |
| `REQ-CAR-013` | El incumplimiento de acuerdo descongela la etapa y escala | `[NEGOCIO]` | `PH-C18` | — |
| `REQ-CAR-014` | Un sobrepago genera crédito y no desaparece | `[ARQ]` | `PH-C09` | `I-C06` |
| `REQ-CAR-015` | La certificación de deuda discrimina los rubros del art. 48 | `[LEGAL]` art. 48 | `PH-C32` | — |
| `REQ-CAR-016` | No existe caso judicial sin certificación de deuda | `[LEGAL]` art. 48 | `PH-C21` | `I-C12` |
| `REQ-CAR-017` | Las costas requieren documento fuente y fecha de decisión | `[LEGAL]` CGP 366 | `PH-C22` | `I-C11` |
| `REQ-CAR-018` | No se generan costas por antigüedad | `[LEGAL]` CGP 365-366 | `PH-C23` | `I-C11` |
| `REQ-CAR-019` | Toda transición de cartera es auditable con antes/después/motivo | `[ARQ]` | `PH-C28` | `I-C13` |
| `REQ-CAR-020` | Un prerrequisito bloqueante no verificado produce `BLOCKED` | `[ARQ]` | `PH-C26` | `I-C14` |
| `REQ-CAR-021` | Una posición histórica es reproducible con la política y datos de la fecha | `[ARQ]` | `PH-C27` | `I-C15` |
| `REQ-CAR-022` | El job es idempotente ante re-ejecución con la misma fecha de corte | `[ARQ]` | `PH-C33` | — |
| `REQ-CAR-023` | La estrategia de imputación afecta la antigüedad de forma predecible | `[ARQ]` | `PH-C31` | — |
| `REQ-CAR-024` | Ninguna consulta agrega datos de más de un tenant | `[ARQ]` `SEC-03` | `PH-C34` | — |
| ~~`REQ-CAR-025`~~ | ~~Un residente solo ve su propia cartera~~ ⤴ **Diferido** — bloqueado por `AD-26`, ver §21.4 | `[NEGOCIO]` | `PH-C35` | — |

---

# 26. Golden Cases

`[ARQ]` Casos de prueba obligatorios con **datos concretos**. Un golden case sin números no es un golden case. Todos usan `fecha_corte` explícita.

## 26.1 Antigüedad y clasificación

```text
PH-C01  UNIDAD AL DÍA
  Cargo: período 2026-08, vence 2026-08-10, saldo 500.000
  Corte: 2026-08-05
  → dias_mora = 0 · clasificación = AL_DIA · etapa = preventiva
  → cartera_vencida = 0 · deuda_total = 500.000

PH-C02  MORA DE 1 DÍA
  Cargo: vence 2026-08-10, saldo 500.000
  Corte: 2026-08-11
  → dias_mora = 1 · clasificación = MORA_TEMPRANA · etapa = administrativa
  → evento CARTERA_CLASIFICACION_CAMBIO emitido

PH-C03  MORA DE 30 DÍAS — límite superior del tramo
  Corte: 2026-09-09 (vence 2026-08-10)
  → dias_mora = 30 · clasificación = MORA_TEMPRANA (aún)

PH-C04  FRONTERA 30 → 31
  Corte: 2026-09-10
  → dias_mora = 31 · clasificación = MORA_INICIAL
  → evento con motivo explícito del cruce de tramo
  ⚠ Este caso detecta el clásico error off-by-one de rangos inclusivos.

PH-C05  EL MÁS ANTIGUO CON SALDO CLASIFICA
  C-001 vence 2026-03-10, saldo 0        (pagado)
  C-002 vence 2026-06-10, saldo 500.000
  Corte: 2026-08-16
  → dias_mora_maximo = 67 (de C-002, NO 159 de C-001)
  → clasificación = MORA_MEDIA

PH-C06  VARIAS OBLIGACIONES, DISTINTAS ANTIGÜEDADES
  Los 4 cargos del ejemplo de §7.3
  → detalle por cargo preservado: 159/128/98/67
  → dias_mora_maximo = 159 · clasificación = MORA_CRITICA
  → la consulta por cargo devuelve las 4 antigüedades individuales
```

## 26.2 Pagos

```text
PH-C07  PAGO TOTAL ELIMINA CARTERA VENCIDA
  Deuda vencida 2.000.000 · pago 2.000.000
  → cartera_vencida = 0 · clasificación = AL_DIA
  → etapa des-escala a preventiva automáticamente
  → acciones programadas pendientes se CANCELAN

PH-C08  PAGO PARCIAL MANTIENE CARTERA
  Deuda 2.000.000 (4 cargos de 500.000) · pago 500.000
  estrategia = 'deuda_mas_antigua'
  → C-001 saldado · dias_mora_maximo pasa de 159 a 128
  → clasificación pasa de MORA_CRITICA a MORA_MEDIA
  → evento de cambio con motivo "pago aplicado"

PH-C09  SOBREPAGO GENERA CRÉDITO
  Deuda 2.000.000 · pago 2.500.000
  → Σ pago_aplicaciones = 2.000.000
  → saldo_credito = 500.000
  → deuda_total = 0 · saldo_credito = 500.000 (NO se netean a −500.000)

PH-C31  LA ESTRATEGIA DE IMPUTACIÓN CAMBIA LA ANTIGÜEDAD
  Mismo escenario de PH-C08 con estrategia = 'periodo_actual'
  → el pago va al período corriente
  → C-001 sigue con saldo · dias_mora_maximo SIGUE en 159
  → clasificación NO mejora
  ⚠ Comportamiento correcto y configurado. Documentar en UI.
```

## 26.3 Mora e intereses

```text
PH-C10  INTERÉS SEPARADO DE CLASIFICACIÓN
  Cargo capital vencido, dias_mora = 3, interes_dias_gracia = 5
  → clasificación = MORA_TEMPRANA (hay antigüedad)
  → interés causado = 0 (hay gracia)
  ⚠ Verifica el principio central de §2. Ambas cosas son ciertas a la vez.

PH-C11  CAMBIO DE TASA DURANTE LA MORA  ✅ verificado
  Cargo de 100.000, vencido 2026-06-01, corte 2026-07-16
  Tramo 1 (2026-06-01→2026-07-01, 30 días): tasa 0.03 → interés 3.000
  Tramo 2 (2026-07-01→2026-07-16, 15 días): tasa 0.06 → interés 3.000
  → interés total = 6.000 (dias_mora = 45)
  → sin segmentar, la misma mora a tasa única 0.03 habría dado 4.500 —
    prueba de que segmentar cambia el resultado, no es un envoltorio inerte
  → cada segmento trae su propia fuenteResolucion
  Test real: cuenta-corriente.test.ts "PH-C11: reparte el interés entre
  dos tramos cuando la tasa cambia a mitad de la mora".

PH-C36  TOPE LEGAL RESPETADO
  Asamblea fija tasa por encima de 1.5 × IBC
  → la configuración es RECHAZADA con error explícito
  → [LEGAL] art. 30 L675: el tope es indisponible al alza

PH-C37  ASAMBLEA FIJA TASA INFERIOR
  Asamblea fija tasa por debajo del tope
  → se acepta y se aplica la tasa de la asamblea
  → [LEGAL] art. 30 L675 lo permite expresamente
```

## 26.4 Acciones de cobranza

```text
PH-C12  ACCIÓN AUTOMÁTICA POR CLASIFICACIÓN
  Inmueble entra a MORA_TEMPRANA, estrategia dice email a los 3 días
  Corte: día de entrada + 3
  → se crea acción tipo email, estado 'programada'
  → congela clasificación, política_version, dias_mora, deuda

PH-C13  ACCIÓN DUPLICADA BLOQUEADA
  Ya existe email ejecutado hace 5 días · frecuencia_dias = 15
  → NO se crea acción nueva
  → evento COBRANZA_ACCION_OMITIDA con motivo

PH-C38  MÁXIMO DE INTENTOS AGOTADO
  max_intentos = 2, ya hay 2 ejecutadas
  → NO se crea acción · estrategia agotada para ese inmueble

PH-C39  DEUDA BAJO EL MÍNIMO
  deuda_total = 1.500 · monto_minimo_deuda = 10.000
  → NO se crea acción

PH-C40  ACCIÓN CANCELADA POR PAGO
  Acción programada para mañana · hoy el inmueble paga todo
  → acción pasa a 'cancelada' con motivo
```

## 26.5 Promesas y acuerdos

```text
PH-C14  PROMESA CUMPLIDA
  Promesa: 500.000 para 2026-08-20
  Pago: 500.000 el 2026-08-19
  → promesa = 'cumplida' · pago_id vinculado

PH-C15  PROMESA INCUMPLIDA
  Misma promesa · sin pago al 2026-08-21
  → job marca 'incumplida' · evento PROMESA_INCUMPLIDA
  → se reanuda la gestión normal

PH-C16  ACUERDO CREADO
  Deuda 2.000.000 → acuerdo de 4 cuotas de 500.000
  → 4 registros en acuerdo_pago_cuotas
  → los 4 cargos originales SIGUEN INTACTOS en `cargos`
  → suma de cuotas = monto_total = capital + interés + otros

PH-C17  CUOTA DE ACUERDO VENCIDA
  Cuota 2 vence 2026-09-15 · corte 2026-09-16 sin pago
  → cuota = 'vencida' · evento ACUERDO_CUOTA_VENCIDA
  → acuerdo SIGUE vigente (regla: 2 cuotas o 30 días)

PH-C18  ACUERDO INCUMPLIDO GENERA ESCALAMIENTO
  Cuotas 2 y 3 vencidas
  → acuerdo = 'incumplido' · evento ACUERDO_INCUMPLIDO
  → etapa se descongela a etapa_congelada
  → reevaluación inmediata de escalamiento

PH-C41  CONDONACIÓN CON ACTA
  Acuerdo con condona_interes = true, monto_condonado = 300.000
  → exige acta_referencia y aprobado_por
  → genera novedad DISCOUNT → cargo 'otro' negativo de 300.000
  → el cargo de interés original permanece intacto

PH-C42  CONDONACIÓN SIN ACTA ES RECHAZADA
  Mismo acuerdo sin acta_referencia
  → INSERT rechazado por constraint
```

## 26.6 Escalamiento y jurídico

```text
PH-C19  REMISIÓN PREJURÍDICA
  Inmueble alcanza MORA_AVANZADA, acciones administrativas agotadas
  → evaluarEscalamiento() propone escalar con requiereAprobacion = true
  → NO escala hasta que un admin aprueba
  → al aprobar: evento CARTERA_ETAPA_CAMBIO con antes/después/motivo

PH-C20  REMISIÓN JURÍDICA
  Inmueble en ALTO_RIESGO, aviso prejurídico ejecutado
  → propone escalar a 'juridica' con aprobación
  → exige certificación de deuda vigente
  → sin certificación: DecisionEscalamiento = 'bloqueado'

PH-C32  CERTIFICACIÓN ART. 48 COMPLETA
  Deuda: 1.500.000 ordinarias + 200.000 extraordinarias
       + 180.000 intereses + 50.000 sanciones
  → certificación discrimina los 4 rubros · total = 1.930.000
  → detalle_cargos congela los cargos con id, período, vencimiento, saldo
  → certificacion_hash reproducible
  → firmante = administrador

PH-C21  PROCESO JUDICIAL CREADO
  Caso creado desde certificación PH-C32
  → certificacion_id NOT NULL cumplido
  → estado inicial 'remitido' · monto_pretension = 1.930.000
  → etapa del inmueble pasa a 'juridica'

PH-C43  CASO SIN CERTIFICACIÓN RECHAZADO
  Intento de crear caso sin certificacion_id
  → CasoJuridicoSinCertificacionError · INSERT rechazado por NOT NULL

PH-C22  COSTAS REGISTRADAS POR FUENTE VÁLIDA
  Auto de liquidación de costas del 2026-11-20, Juzgado 5 Civil Municipal
  agencias en derecho 400.000
  → registro aceptado con documento_fuente, fecha_decision, autoridad
  → estado 'liquidada' · puede pasar a 'impugnada' (CGP 366)

PH-C23  ANTIGÜEDAD NO GENERA COSTAS  ⚠ CRÍTICO
  Inmueble con 400 días de mora, sin proceso judicial
  → costas_judiciales = ∅
  → NO existe ninguna regla, job ni trigger que cree una costa
  → el test debe verificar la AUSENCIA del comportamiento

PH-C44  COSTA SIN DOCUMENTO RECHAZADA
  Intento de insertar costa sin documento_fuente
  → rechazado por NOT NULL · CostaSinDocumentoFuenteError
```

## 26.7 Integridad, historia y seguridad

```text
PH-C24  TRANSFERENCIA SIN REESCRIBIR DEUDA
  Inmueble cambia de propietario el 2026-05-01 con deuda previa
  → los cargos anteriores NO se modifican, NO se reasignan, NO se borran
  → la posición del inmueble es continua
  → la responsabilidad se resuelve por inmueble_persona_rol(vigente_desde, vigente_hasta)
  Depende de VER-CAR-06.

PH-C25  SOLIDARIDAD SIN DUPLICACIÓN
  Dos propietarios del mismo inmueble
  → UNA sola obligación · UNA sola posición de cartera
  → dos destinatarios posibles para la acción de cobranza
  → NUNCA dos cargos por el mismo concepto y período

PH-C26  PRERREQUISITO AUSENTE → BLOCKED
  Política de clasificación no configurada
  → PoliticaClasificacionNoConfiguradaError
  → el job ABORTA · NO clasifica con un default inventado
  → no se crea ninguna acción

PH-C27  SNAPSHOT HISTÓRICO REPRODUCIBLE
  Recalcular la posición del 2026-06-30 con la política v2 de entonces
  → el resultado coincide con posiciones_cartera_snapshot
  → posicion_hash idéntico

PH-C28  AUDITORÍA COMPLETA DE ACCIÓN
  Para cualquier acción ejecutada, se puede responder:
  quién, cuándo, por qué clasificación, con qué política y versión,
  con qué deuda, a quién, por qué canal, con qué resultado
  → todos los campos presentes y no nulos

PH-C29  CLASIFICACIÓN VERSIONADA
  Toda clasificación registrada guarda politica_id + politica_version

PH-C30  CAMBIO DE POLÍTICA NO ALTERA HISTORIA
  Política v2 cambia MORA_MEDIA de 61-90 a 61-75
  → las clasificaciones de junio (hechas con v1) NO cambian
  → las de agosto usan v2
  → ambas conviven y son explicables

PH-C33  JOB IDEMPOTENTE
  Ejecutar JOB_CARTERA_DIARIA dos veces con la misma fecha_corte
  → mismo resultadoHash
  → cero acciones duplicadas · cero eventos duplicados
  → cero filas nuevas en posiciones_cartera_snapshot

PH-C34  AISLAMIENTO CROSS-TENANT
  Usuario del tenant A consulta posición
  → cero filas del tenant B, en toda vista, función e indicador
  → SEC-03 respetado

PH-C35  RESIDENTE VE SOLO LO SUYO           ⤴ FUERA DE ALCANCE
  Bloqueado por AD-26 (tercero ≠ usuario, sin FK a auth.users).
  Ver §21.4 / GAP-CAR-010. Se conserva especificado para el día en que
  AD-26 se revise; NO se implementa en F1-F9.
  Mientras tanto, la comunicación al residente es saliente
  (notificación al contacto de `terceros`), no acceso a la app.
```

---

# 27. Invariantes

`[ARQ]` Verdades que **nunca** pueden violarse. Cada una tiene test automatizado y, cuando es posible, refuerzo en la base de datos.

| Id | Invariante | Refuerzo |
|---|---|---|
| `I-C01` | Una obligación pagada no permanece como cartera vencida | Vista derivada de `v_cargo_saldo` |
| `I-C02` | Una obligación no vencida no genera mora | `calcularInteresMora` + test |
| `I-C03` | La antigüedad no modifica por sí sola la tasa de mora | Test de no-acoplamiento |
| `I-C04` | El interés se calcula solo sobre obligaciones elegibles (capital) | `calcularInteresMora` |
| `I-C05` | Un pago no duplica una obligación | `guard_pago_aplicacion_no_excede` |
| `I-C06` | Un sobrepago no desaparece | Derivación de crédito + test |
| `I-C07` | Una acción no se duplica cuando la política lo prohíbe | Constraint parcial + función |
| `I-C08` | Un acuerdo no elimina obligaciones históricas | `cargos` append-only |
| `I-C09` | Una transferencia no reescribe obligaciones históricas | `cargos` append-only |
| `I-C10` | Una clasificación es reproducible con su política y versión | `politica_version` + hash |
| `I-C11` | Una costa judicial no aparece sin fuente y decisión válidas | `NOT NULL` en `documento_fuente`, `fecha_decision` |
| `I-C12` | Una remisión jurídica tiene evidencia y aprobación | `certificacion_id NOT NULL` + `aprobado_por NOT NULL` |
| `I-C13` | Una transición de cartera es auditable (antes/después/motivo) | `eventos_cartera.motivo NOT NULL` |
| `I-C14` | Un prerrequisito bloqueante no puede ignorarse | Error explícito, sin default |
| `I-C15` | Un resultado histórico puede reconstruirse | `posicion_hash` + snapshot |
| `I-C16` | Ninguna consulta cruza el límite del tenant | RLS `force` en toda tabla |
| `I-C17` | Ninguna política vigente puede modificarse | `guard_politica_inmutable` |
| `I-C18` | Ninguna tabla de historia admite `UPDATE` ni `DELETE` | `forbid_mutation()` |
| `I-C19` | Toda función de cálculo recibe fecha explícita | Revisión de código + lint |
| `I-C20` | La UI no calcula saldos, antigüedad ni clasificación | Revisión de código |
| `I-C21` | Un envío conserva el contenido exacto que se despachó | `contenido_renderizado NOT NULL` + `forbid_mutation()` |
| `I-C22` | Un acuse manual no existe sin documento que lo respalde | `check (origen <> 'manual' or documento_id is not null)` |
| `I-C23` | Un escalamiento a prejurídica o jurídica exige al menos una acción acreditada por canal con acuse técnico | Función de escalamiento + test |
| `I-C24` | Un expediente no se compila con certificación anulada o vencida | `fn_compilar_expediente` + test |
| `I-C25` | La evidencia de cobranza no se purga por antigüedad | Exclusión explícita del job de purga |

`[ARQ]` Los invariantes `I-C11`, `I-C12`, `I-C17`, `I-C18` **se refuerzan en el esquema**, no solo en tests. Un invariante que solo vive en un test se viola el día que alguien escribe SQL a mano.

---

# 28. Roadmap de implementación

`[ARQ]` Nueve fases con entregables verificables y criterios de salida. Ninguna fase inicia con un prerrequisito bloqueante abierto.

## F0 — Desbloqueo (prerrequisito de todo)

```text
Alcance      Resolver GAP-CAR-001 y los VER-CAR bloqueantes
Entregables  · ✅ Guard: periodo no pasa a 'en_liquidacion' con
               fecha_vencimiento NULL — migración
               `20260822190000_cartera_guard_periodo_vencimiento.sql`,
               extiende `guard_periodo_transicion()` (no la duplica)
             · ✅ Módulo puro `packages/liquidation-engine/src/cartera.ts`:
               `calcularAntiguedad`, `calcularPosicionCartera`,
               `clasificarCartera`, `validarPoliticaClasificacion`
               (IC-TRAMO-01..05) — reutiliza `CargoAbierto` y
               `diasCalendario()` de `cuenta-corriente.ts` (REC-CAR-004)
             · ✅ Errores tipados `PoliticaClasificacionInvalidaError`,
               `TramoClasificacionNoEncontradoError` en `errors.ts`
             · ✅ 26 tests puros en `cartera.test.ts` — cubren PH-C01..C06,
               PH-C09 y las 5 invariantes de política (IC-TRAMO-01..05)
             · ⧗ Backfill de periodos históricos sin fecha_vencimiento —
               pendiente: requiere decidir con el usuario qué hacer con
               periodos reales ya existentes, no se inventa un valor
             · ⧗ `cargos.fecha_vencimiento` nullable (override por cargo,
               Opción B de §4.4) — pendiente, no bloqueante para F1
             · ⧗ Conceptos jurídicos VER-CAR-01, VER-CAR-02 — externos,
               no resueltos en este documento
             · ⧗ Entregables pendientes: diccionario de datos (CAR-03),
               plan de migración (CAR-05), plan de pruebas (CAR-06)
Verificación `calcularAntiguedad`/`clasificarCartera` devuelven el valor
             correcto para los 6 casos de borde de §7.2, y
             `TramoClasificacionNoEncontradoError` se lanza sin default
             cuando la política no cubre los días — verificado con
             vitest, tsc y eslint, los tres en verde
Salida       PRQ-CAR-002 = Parcialmente verificado (guard + cálculo puro
             listos; falta backfill y override por cargo)
NOTA         PRQ-CAR-007 y PRQ-CAR-015 ya quedaron verificados; no
             requieren trabajo en F0.
             ✅ Migración aplicada al proyecto remoto (hwjmlyzzvpmhadldavbq)
             el 2026-08-16 vía `pnpm db:push`, verificada primero con
             `--dry-run` — el dry-run confirmó que solo las 2 migraciones
             de cartera estaban pendientes (las ~20 de otro trabajo en
             curso ya estaban aplicadas de antes). `pnpm db:types` +
             rebuild de `@aquila/shared` corridos después, siguiendo el
             flujo migración→push→db:types→build shared.
```

## F1 — Antigüedad

```text
Alcance      Cálculo de antigüedad por cargo y agregación por inmueble
Entregables  · ✅ packages/liquidation-engine/src/cartera.ts:
               calcularAntiguedad, calcularPosicionCartera
             · ✅ politicas_clasificacion_cartera + politica_clasificacion_tramos
               (migración `20260822200000_cartera_politica_clasificacion.sql`,
               aplicada) — clasifiCartera/validarPoliticaClasificacion con
               guard SQL espejo de IC-TRAMO-01..05, dos capas de refuerzo
             · ✅ cartera-supabase.ts: obtenerPoliticaClasificacionVigente
               (reutiliza obtenerCargosAbiertos de cuenta-corriente-supabase.ts
               — REC-CAR-004, no se duplica la lectura de cargos)
             · ✅ Tests unitarios puros — 26 tests en cartera.test.ts
             · ✅ `fn_posicion_cartera(tenant_id, fecha_corte, inmueble_id?)`
               (migración `20260822210000_cartera_fn_posicion.sql`, aplicada)
               — agrega deuda/crédito por inmueble en SQL, sin clasificar
               (REC-CAR-004: la clasificación no se duplica en SQL, solo
               se expone `dias_mora_maximo` para que la capa de aplicación
               llame a `clasificarCartera()`)
             · ✅ Edge Function `cartera-posicion` (POST) — compone
               `fn_posicion_cartera` + `obtenerPoliticaClasificacionVigente`
               + `clasificarCartera`; responde 422
               `POLITICA_CLASIFICACION_NO_VIGENTE` si el tenant no ha
               configurado cartera todavía (PH-C26/I-C14, nunca un default)
             · ~~⧗ Edge Function `cartera-recalcular` (§22.3, `JOB_CARTERA_
               DIARIA` completo) — no escrita, pertenece a F8~~ ✅
               escrita y desplegada en F8 (ver más abajo)
             · 9 códigos de error nuevos registrados en `error-codes.ts`
               (`PERIODO_SIN_FECHA_VENCIMIENTO`,
               `POLITICA_CLASIFICACION_*`, `TRAMO_CLASIFICACION_NO_
               ENCONTRADO`) — verificado por
               `tests/governance/error-codes-coverage.test.ts`
Golden Cases PH-C01..PH-C06, PH-C09 — cubiertos en cartera.test.ts
Salida       F1 completo: antigüedad, clasificación y posición agregada
             son reproducibles, versionadas y expuestas por una Edge
             Function real. Falta el job diario completo (F8) y las
             estrategias de cobranza (F4) — siguientes rebanadas.
Verificación `deno check` sobre `cartera-posicion/index.ts` arroja errores,
             pero son EXACTAMENTE los mismos (mismos módulos ael-language/
             ael-runtime/financial-kernel, mismo conteo ±1) que arroja
             `deno check` sobre `calcular-intereses/index.ts` — una función
             ya existente y en producción que nadie tocó en esta sesión.
             Es un gap preexistente del repo (`deno check` no es parte del
             gate de CI: `.github/workflows/ci.yml` corre
             `deno test --no-check`), no algo introducido aquí. Verificado
             en su lugar con `deno lint` (limpio) y revisión estructural
             línea a línea contra `calcular-intereses/index.ts`.
```

## F2 — Mora versionada (extiende lo existente)

`[ARQ]` Dividida en dos rebanadas de riesgo muy distinto: trazabilidad de la tasa
(cambio de esquema, bajo riesgo) y segmentación del cálculo de interés
(cambio a una función financiera ya probada exhaustivamente, riesgo real).
Se implementó la primera; la segunda queda explícitamente para después en
vez de apurarla.

```text
Alcance      Cerrar GAP-CAR-004 completo
Entregables  · ✅ tabla tasas_referencia (migración
               `20260822220000_cartera_tasas_referencia.sql`, aplicada) —
               GLOBAL, append-only, sin solape de vigencias por tipo_tasa
               (exclusion constraint). valor_mensual se REGISTRA, no se
               deriva por fórmula (VER-CAR-01 sigue sin verificar
               jurídicamente — no se inventa la conversión EA→mensual)
             · ✅ politicas_financieras.interes_tipo_tasa / interes_
               multiplicador — nullable, retrocompatible (mismo patrón
               que interes_day_count, D-23)
             · ✅ guard_politica_financiera_tope_legal() — rechaza activar
               una política cuyo interes_tasa_mensual o interes_tope_
               mensual excede multiplicador × tasa de referencia vigente
             · ✅ tests/rls/politica-financiera-tope-legal.test.ts — 4 tests
               contra la BD real: PH-C36, PH-C37, tope-solo-excede,
               retrocompatibilidad. Deja una fila de prueba permanente en
               tasas_referencia (append-only), resolucion_numero
               prefijado `TEST-`, fecha en 1000-1900 — decisión explícita
               del usuario, sin impacto funcional real
             · ✅ calcularInteresMora extendido con `segmentos?: readonly
               SegmentoTasa[]` — 5º parámetro opcional, retrocompatible
               verificado por igualdad exacta (no solo declarado). Gracia
               vía desplazamiento de fecha; treinta_360 + segmentos
               rechazado explícitamente (no tiene fecha calendario lineal);
               segmentos solapados rechazados; tope aplicado por segmento.
               9 tests nuevos en cuenta-corriente.test.ts (29 en total,
               21 originales intactos)
             · ⧗ Carga histórica real de IBC en tasas_referencia — no se
               inventó ningún valor. Poblar la tabla con la resolución
               vigente real de la Superfinanciera es tarea operativa
               (CAR §3.4), pendiente de que alguien con acceso a la
               resolución la registre
Golden Cases PH-C36, PH-C37 — verificados contra Postgres real
             PH-C10 — ya cubierto en cartera.test.ts (F1)
             PH-C11 — verificado con datos concretos en cuenta-corriente.test.ts
Salida       GAP-CAR-004 cerrado por completo. Tasa trazable a resolución
             para políticas que la declaren, con tope legal aplicado y
             segmentación cuando la tasa cambia a mitad de la mora — todo
             retrocompatible con toda política/cálculo existente. Solo
             falta la carga real del IBC (tarea operativa, no de código).
Riesgo       Retrocompatibilidad con intereses ya calculados — NINGÚN
             cargo de interés existente se recalcula ni se ve afectado;
             tanto el guard de tope como la segmentación solo se activan
             cuando la política/llamada los declara explícitamente. Los
             21 tests originales de calcularInteresMora no se tocaron ni
             una línea y siguen pasando.
```

## F3 — Clasificación

`[ARQ]` La mayoría de F3 ya quedó resuelta en F1 (política de tramos,
guard, `clasificarCartera()` puro — ver F1 arriba). Lo que faltaba después
de F1/F2 era el snapshot histórico; eso es lo que cierra esta fase.

```text
Alcance      Política de tramos, clasificación, snapshot
Entregables  · ✅ politicas_clasificacion_cartera + politica_clasificacion_tramos (F1)
             · ✅ guard_politica_clasificacion_completa — IC-TRAMO-01..05 (F1)
             · ✅ clasificarCartera() puro (F1)
             · ✅ posiciones_cartera_snapshot + posicion_hash (migración
               `20260822230000_cartera_posicion_snapshot.sql`, aplicada) —
               append-only, escritura solo por service_role (mismo patrón
               que cargos/pagos: un snapshot no se inserta a mano, siempre
               se calcula), único por (tenant, inmueble, fecha_corte)
             · ✅ calcularPosicionHash() (cartera.ts) — mismo principio que
               calcularResultHash() del motor de liquidación (hash.ts):
               serialización canónica, sha256, sin timestamps ni metadatos
               de ejecución
             · ✅ registrarSnapshotPosicion() (cartera-supabase.ts) — I/O
               de escritura, calcula el hash y lo persiste junto al snapshot
             · ⧗ UI de configuración de tramos — no implementada a propósito
               (ver [[feedback_visual_ui_last]]: la capa visual va al final,
               después del núcleo funcional)
Golden Cases PH-C29, PH-C30, PH-C27 — verificados contra Postgres real en
               tests/rls/posiciones-cartera-snapshot.test.ts (5 tests):
               reproducibilidad exacta del hash, versión de política
               congelada, un cambio de política posterior no altera un
               snapshot ya guardado, append-only, unicidad por fecha
             PH-C26 — ya cubierto conceptualmente por los errores tipados
               sin default de F1 (TramoClasificacionNoEncontradoError,
               "no hay política vigente"); no hay una prueba de integración
               dedicada a BLOCKED todavía
             PH-C31 — cubierto en cartera.test.ts (F1, calcularAntiguedad +
               estrategia de imputación)
Salida       Clasificación versionada, reproducible y explicable — un
             snapshot histórico puede verificarse contra un recálculo
             independiente, y sobrevive intacto a cambios posteriores de
             política. Falta solo la UI, deliberadamente diferida.
```

## F4 — Cobranza

```text
Alcance      Estrategias, acciones, ejecución
Prerreq.     GAP-CAR-005 — ✅ resuelto PARA SMS (2026-08-17, sendSms() real
             vía Brevo Transactional SMS, `Plantillas sms configurables`).
             email/whatsapp siguen sin generalizar, fuera de alcance de F4
             hasta que se construyan sus propios proveedores.
             ~~GAP-CAR-009~~ ✅ resuelto (2026-08-17, rol administrador)
Entregables  · estrategias_cobranza · acciones_cobranza ✅
               (20260822270000_cartera_cobranza_estrategias_acciones.sql,
               reconciliado contra terceros/inmueble_persona_rol reales
               — ver §9.3/§10.2)
             · cartera-cobranza-supabase.ts ✅ (obtenerEstrategias
               CobranzaVigentes, obtenerHistorialAccionesCobranza,
               registrarAccionCobranza — 5 tests, DB real)
             · evaluarAccionesAplicables() puro ✅ (cartera-cobranza.ts,
               12 tests — no dependía de ninguno de los dos gaps)
             · Reglas anti-duplicación ✅ (§10.4/I-C07, mismo módulo)
             · Worker de ejecución ✅ SOLO SMS, SOLO event_type
               'cartera_pago_vencido' (supabase/functions/ejecutar-
               accion-cobranza/index.ts) — resuelve estrategia→
               plantilla_codigo, plantilla activa por (tenant, event_
               type), destinatario vía terceros.telefono, llama
               sendSms() real, persiste contenido_hash/referencia_
               externa/destinatario_contacto. 'cartera_recordatorio_
               pago' NO soportado (necesitaría una fechaVencimiento
               que una acción ya-en-mora no tiene sin ambigüedad — no
               se inventa ese origen). email/whatsapp NO soportados.
               Procesa una acción por invocación, sin orquestación de
               lote todavía (CAR §18.1 sigue sin construirse). ✅
               Verificado end-to-end contra Brevo real (2026-08-17,
               confirmación explícita del usuario) — desplegado,
               BREVO_SMS_SENDER configurado como secreto del proyecto,
               un SMS real recibido y confirmado en un teléfono real
               (referencia_externa de Brevo persistida en la fila).
             · Aprobación maker-checker para el administrador ✅
               (20260822280000_cartera_cobranza_aprobacion.sql —
               propuesta_por/aprobada_por/aprobada_at + guard_accion_
               cobranza_propuesta/transicion(); exige administrador
               explícito, bloquea autoaprobación; 5 tests RLS con DB real
               en tests/rls/cartera-cobranza-aprobacion.test.ts)
Golden Cases PH-C12, PH-C13, PH-C28, PH-C38, PH-C39, PH-C40
Salida       Acciones auditables, no duplicadas, con aprobación donde toca
```

## F5 — Promesas y acuerdos

```text
Alcance      Promesas, acuerdos, cuotas, conciliación
Entregables  · promesas_pago ✅ (20260822300000_cartera_promesas_pago.sql
               — sin maker-checker, CAR §12.1: informal. registrada_por
               estampado desde auth.uid(). 3 tests RLS.)
             · acuerdos_pago + acuerdo_pago_cuotas ✅
               (20260822310000/20260822320000 — maker-checker igual que
               acciones_cobranza: propuesto_por/aprobado_por/aprobado_at,
               exige administrador explícito para pendiente_aprobacion→
               vigente, bloquea autoaprobación, un solo acuerdo vigente
               por inmueble (índice único). 8 tests RLS.)
             · ~~GAP-CAR-008~~ ✅ resuelto (2026-08-17, decisión
               explícita del usuario): pagos.acuerdo_cuota_id nullable
               (asociación explícita) + inferencia de respaldo — la
               función de inferencia por monto+fecha queda para cuando
               exista un caso de uso real que la ejerza, no se inventa
               sin eso.
             · Congelamiento de etapa ✅ parcial: guard_acuerdo_
               transicion() completa etapa_congelada al activar (desde
               el snapshot más reciente si el llamador no la fija
               explícitamente). El DESCONGELAMIENTO real (usar
               etapa_congelada cuando el acuerdo se incumple) y la
               suspensión de acciones de cobranza normales (§12.5) son
               lógica de orquestación — dependen del job diario (§18),
               que sigue sin construirse.
             · Condonación con acta ✅ — constraint
               acuerdo_condonacion_requiere_soporte (condona_interes ⇒
               monto_condonado>0 y acta_referencia obligatorios).
               novedades.acuerdo_pago_id nuevo, para trazabilidad —
               reutiliza el flujo ya existente (tipo DISCOUNT →
               fn_aprobar_novedad → cargo otro negativo, REC-CAR-004),
               no se duplica lógica.
Golden Cases PH-C14..PH-C18, PH-C41, PH-C42 — pendientes de mapear a
             tests concretos (no hechos en esta pieza)
Salida       Acuerdos que no tocan el ledger original (I-C08 verificado:
             ningún UPDATE/DELETE sobre cargos en todo este bloque)
```

## F6 — Escalamiento

```text
Alcance      Máquina de estados de etapa
Entregables  · evaluarEscalamiento() puro ✅
               (packages/liquidation-engine/src/cartera-escalamiento.ts —
               15 tests unitarios cubriendo PH-C19/PH-C20, tope de la
               máquina en judicial, des-escalamiento total por saldo=0
               desde cualquier etapa CAR §11.2, congelamiento por acuerdo
               vigente, y "un escalón a la vez" cuando la clasificación
               salta varios tramos.)
             · Matriz de transiciones §11.3 como tabla configurable ✅
               — TRANSICIONES_ETAPA_COBRANZA (TS) espejada exactamente
               por cartera_etapa_transicion_valida()/cartera_etapa_
               requiere_aprobacion() (SQL, VALUES-based) — misma matriz
               en dos lugares, comentada para mantenerse en sync, mismo
               criterio "primera línea (pura) + última línea (BD)" que
               evaluarAccionesAplicables()/guard_accion_cobranza_
               transicion (F4).
             · politicas_gastos_cobranza — sigue bloqueado por VER-CAR-03,
               no implementado (no se inventan valores por defecto).
             · Flujo de aprobación de escalamiento ✅
               (20260822330000_cartera_escalamiento.sql — tabla
               cartera_etapas: UNA fila "actual" por inmueble, no un log,
               distinta de posiciones_cartera_snapshot.etapa_cobranza
               [la sugerida, recalculable]. Maker-checker vía
               etapa_propuesta/propuesto_por/aprobado_por, mismo criterio
               que acciones_cobranza/acuerdos_pago: rol administrador
               explícito + bloqueo de autoaprobación para las transiciones
               que la matriz marca "Sí"; INSERT solo puede nacer en
               preventiva [mismo bug class de "INSERT bypassa el guard de
               UPDATE" que F4/F5, corregido desde el principio esta vez];
               columnas estampadas por el servidor nunca confían el valor
               del cliente en ningún camino; CARTERA_ETAPA_CONGELADA
               bloquea cualquier cambio mientras hay un acuerdo_pago
               vigente para el inmueble; CARTERA_ETAPA_CONTEXTO_INMUTABLE
               bloquea reasignar la fila a otro inmueble/tenant. 11 tests
               RLS.)
             · Deuda con F7: juridica→judicial no exige "demanda radicada"
               todavía (casos_juridicos no existe, GAP-CAR-007) — el
               rol-gate (administrador + no autoaprobación) sí se aplica
               a juridica/judicial→preventiva, pero el "requiere cierre
               del caso" del CAR §11.3 no se valida en base de datos
               hasta que exista esa tabla. evaluarEscalamiento() ya
               modela tieneCertificacionVigente para PH-C20 (siempre
               false hasta F7 — sin certificaciones_deuda nadie puede
               proveer true todavía, así que prejuridica→juridica queda
               'bloqueado' en la práctica hasta entonces).
             · "Agotadas las acciones administrativas" (CAR §11.3,
               administrativa→prejuridica) — interpretación explícita, no
               literal de la spec: al menos una estrategia CON HISTORIAL
               y TODAS agotadas (reutiliza la semántica de
               ESTRATEGIA_AGOTADA de cartera-cobranza.ts, CAR §10.4); una
               etapa sin ninguna acción configurada/ejecutada NO cuenta
               como agotada.
Golden Cases PH-C19, PH-C20 — cubiertos como tests unitarios de
             evaluarEscalamiento() y como test RLS del guard de
             aprobación (cartera-etapas.test.ts). No hay todavía un
             llamador real que invoque evaluarEscalamiento() y aplique su
             decisión automáticamente (eso es el job diario, F8) — el
             flujo hoy se ejerce a mano vía cartera_etapas, igual que F4/
             F5 antes de que exista el job diario.
Salida       Ninguna transición fuera de la matriz es posible ✅ —
             verificado tanto en la función pura como en el guard de BD.
```

## F7 — Jurídico

```text
Alcance      Certificación, expediente, proceso, costas
Prerreq.     ~~GAP-CAR-007~~ ✅ VERIFICADO RESUELTO (2026-08-17) — no
             bloqueaba: ya existía `documentos` (generalizada en
             20260822130000), el bucket `documentos-inmueble` y
             subir-documento con upload+rollback reales, probados. Se
             generalizó una vez más con `caso_juridico_id` nullable en
             vez de crear caso_juridico_documentos como tabla paralela
             (REC-CAR-004). subir-documento todavía NO acepta ese campo
             — extensión de la Edge Function/frontend pendiente.
             ~~GAP-CAR-009~~ ✅ resuelto — ya existe el rol administrador
             que firma la certificación del art. 48
             PRQ-CAR-015 ya verificado (terceros + tenant_tercero_rol)
Entregables  · certificaciones_deuda + fn_certificar_deuda ✅
               (20260822340000_cartera_juridico.sql +
               packages/liquidation-engine/src/cartera-juridico.ts —
               a diferencia del resto de F4-F6, "fn_certificar_deuda"
               vive en TS [construirCertificacionDeuda +
               calcularCertificacionHash + registrarCertificacionDeuda],
               no en SQL: el hash de reproducibilidad debe ser una
               función pura testeable, mismo criterio que
               calcularPosicionHash/registrarSnapshotPosicion — la BD
               solo gobierna autorización/inmutabilidad. Inmutable salvo
               la única transición vigente→anulada, con motivo
               obligatorio y administrador explícito. 6 tests unitarios
               + 7 tests RLS.)
             · ~~GAP-CAR-011~~ (nuevo, decisión explícita del usuario
               2026-08-17): el esquema no distingue una cuota
               extraordinaria (fuente_financiacion.cuota_extraordinaria
               es del presupuesto, no del cargo) ni una sanción
               (TIPO_NOVEDAD en lista_tipos existe sembrado pero NINGÚN
               código lo referencia — novedades.tipo es el enum
               CHARGE/DISCOUNT/ADJUSTMENT/REFUND/CREDIT/DEBIT, sin
               sub-clasificación) a nivel de cargo. Se certifican con
               exactitud los 3 rubros que sí son cargo-discriminables
               (capital→ordinarias, interés→intereses_mora, todo lo
               demás→otros); monto_expensas_extraordinarias y
               monto_sanciones quedan siempre en 0, documentado, no
               inventado. El total siempre reconcilia con
               fn_posicion_cartera (misma fuente de cargos).
             · casos_juridicos + caso_juridico_actuaciones ✅
               (20260822340000 — certificacion_id NOT NULL, sin
               certificación vigente no hay caso. Remitir a jurídico y
               CERRAR el caso exigen administrador explícito
               [aprobado_por/at estampados al crear, mismo criterio de
               firmante identificado]; el progreso normal del trámite
               [radicado→admitido→...] lo hace cualquier agent.
               Deliberadamente SIN matriz de transiciones rígida para
               estado_caso_juridico_t [12 valores] — a diferencia de
               etapa_cobranza_t (F6 §11.3), el documento nunca definió
               los bordes válidos y el trámite real no sigue un único
               orden lineal; caso_juridico_actuaciones [append-only] es
               el registro histórico verificable, exista o no esa
               matriz. abogado_tercero_id validado contra
               tenant_tercero_rol+PERSONA_COPROPIEDAD.abogado vigente.
               9 tests RLS.)
             · costas_judiciales ✅ (20260822340000 — I-C11: documento_
               fuente/fecha_decision/autoridad NOT NULL, evidencia
               congelada tras el INSERT [solo estado/monto_recuperado
               cambian]. Sin matriz de transiciones para estado_costa_t
               [mismo criterio que casos_juridicos]. 3 tests RLS.)
             · caso_juridico_documentos — NO se construyó como tabla
               aparte (ver Prerreq. arriba): se resolvió generalizando
               `documentos`.
Golden Cases PH-C21..PH-C23, PH-C32, PH-C43, PH-C44 — PH-C32
             (certificación art. 48 completa/discrimina 4 rubros) queda
             parcial por GAP-CAR-011: discrimina 3 con exactitud, 2
             siempre en 0. El resto (PH-C21..C23, C43, C44 — creación de
             proceso desde certificación, costas) no se mapearon a
             tests concretos con golden data en esta pieza.
Salida       Título ejecutivo reproducible ✅ (certificacion_hash,
             detalle_cargos congelado, verificado con tests de
             reproducibilidad) · cero costas automáticas ✅ (I-C11:
             monto/documento_fuente/fecha_decision/autoridad NOT NULL,
             ninguna función calcula costas por antigüedad)
```

## F8 — Automatización

```text
Alcance      Job diario, eventos, alertas
Entregables  · eventos_cartera ✅ (20260822380000_cartera_eventos.sql —
               tipo_evento_cartera_t con el catálogo COMPLETO de §19.1
               [~30 valores, no solo los que esta pieza emite], append-
               only vía forbid_mutation(), solo service_role escribe
               [igual que posiciones_cartera_snapshot], unique nulls not
               distinct (tenant_id, dedup_key) para IDEM-03)
             · evaluarJobCarteraInmueble() ✅ (packages/liquidation-
               engine/src/cartera-job.ts — orquestador PURO que compone
               clasificarCartera()+evaluarEscalamiento() [ya existentes,
               REC-CAR-004: nada se recalcula] con promesas/cuotas de
               acuerdo vencidas. 13 tests unitarios. Alcance
               deliberadamente acotado, documentado en la cabecera del
               archivo — ver "Deferred" abajo.)
             · cargarEntradaJobCarteraInmueble() ✅ (cartera-job-
               supabase.ts — adaptador de solo lectura que arma la
               entrada del orquestador desde acuerdos_pago,
               casos_juridicos, certificaciones_deuda, promesas_pago,
               acuerdo_pago_cuotas y acciones_cobranza)
             · Edge Function `cartera-recalcular` ✅ (§22.3, POST, rol
               mínimo administrador — has_role() ya trata administrador
               ⊇ agent [20260822260000], así que el mismo caller
               satisface tanto el gate de la función como los guards de
               agent que tocan cartera_etapas/promesas_pago/etc. modo
               'simulacion': calcula planes+resultadoHash sin escribir
               nada [§18.1, "ningún administrador acepta que el sistema
               empiece a enviar requerimientos sin haber visto antes qué
               va a enviar"]. modo 'ejecucion': persiste vía
               ctx.supabase [cartera_etapas/promesas_pago/
               acuerdo_pago_cuotas/acuerdos_pago, autorizado por rol de
               quien invoca] y ctx.supabaseAdmin [posiciones_cartera_
               snapshot/eventos_cartera/audit_log, service_role]. 422
               POLITICA_CLASIFICACION_NO_VIGENTE si falta prerrequisito
               [PH-C26/I-C14, reutiliza el código de cartera-posicion].
               6 tests de integración HTTP real.)
             · Idempotencia (PH-C33) ✅ verificada de dos formas: (1) las
               escrituras de estado son idempotentes por construcción —
               evaluarJobCarteraInmueble() relee el estado ya escrito en
               la corrida anterior y decide 'permanecer' cuando ya no
               hay nada pendiente; (2) posiciones_cartera_snapshot y
               eventos_cartera usan upsert+ignoreDuplicates sobre sus
               unique constraints [IDEM-01/IDEM-03] — una segunda
               corrida sobre la misma fecha_corte no duplica filas. El
               test de integración corre el job dos veces y confirma
               ambas cosas contra la base real, no solo en el motor
               puro.
             · Alertas ✅ (candidatos a escalamiento que requieren
               aprobación, bloqueados por requisito faltante) — dentro
               de la respuesta HTTP del job, no una tabla ni una cola
               aparte [no había entregable previo que definiera "cola de
               trabajo" como una pieza de esquema distinta].
Deferred     · Creación automática de acciones_cobranza: evaluarAcciones
               Aplicables() [F4] ya decide QUÉ estrategia corresponde,
               pero crear la fila exige resolver un destinatario real
               [destinatario_tercero_id/rol_codigo] — esa resolución no
               existe en ningún punto del código [ejecutar-accion-
               cobranza.ts asume la fila ya creada]. No se inventa una
               convención de "a quién se le cobra" sin ese diseño.
             · CARTERA_CLASIFICACION_CAMBIO: el catálogo de eventos lo
               contempla, pero emitirlo exige comparar contra el
               snapshot de AYER [lectura extra por inmueble, no
               construida en esta pieza] — cambiosClasificacion queda en
               0 en la respuesta, documentado, no inventado.
             · Umbral cuota vencida→incumplida: el guard de
               acuerdo_pago_cuotas [20260822310000] modela esa
               transición como un paso aparte de vencida, pero el
               documento nunca definió cuántos días de diferencia — el
               job solo marca 'vencida', nunca 'incumplida'.
             · pg_cron: el job se invoca a mano, por un administrador —
               NO está agendado. Mismo criterio de "un humano aprieta el
               botón" aplicado a todo el bloque de cobranza con efecto
               real [ejecutar-accion-cobranza, cobranza-aprobar-accion].
               Agendarlo es una decisión operativa aparte, no una pieza
               de este job.
Golden Cases PH-C33 ✅ (verificado contra la BD real, ver Idempotencia
             arriba). PH-C34/PH-C35 pertenecen a F9.
Salida       Job re-ejecutable sin efectos duplicados ✅
```

## F9 — BI

```text
Alcance      Dashboard e indicadores. Secuenciado en piezas verificables
             (decisión del usuario, 2026-08-17): §23.1/§23.2 primero,
             §23.3 (indicadores roll/cure/recovery rate) y §23.5 (panel
             de acciones) quedan para las próximas piezas de F9.
Entregables  · fn_dashboard_cartera ✅ (20260823100000_cartera_dashboard_
               fn.sql — agrega por inmueble TODOS los cargos abiertos
               [vencidos + corrientes], distinta a propósito de
               fn_posicion_cartera [F1, solo vencidos, para
               clasificación/escalamiento]. security invoker, mismo
               criterio SEC-03/PH-C34 que fn_posicion_cartera.)
             · calcularDashboardCartera() ✅ (packages/liquidation-
               engine/src/cartera-dashboard.ts — puro. Los 8 tramos de
               antigüedad [§23.2] son un catálogo FIJO de la industria
               [para benchmark externo], deliberadamente distinto de los
               tramos configurables de politicas_clasificacion_cartera
               [F1, gobiernan escalamiento]. "monto" de cada tramo es
               deuda VENCIDA atribuida al inmueble completo [mismo
               criterio REC-CAR-010 que la clasificación — coherente con
               "número de inmuebles" de la especificación, no "número de
               cargos"]; AL_DIA tiene monto=0 por definición [esta tabla
               mide distribución de mora, no balance corriente — ese es
               CARTERA_CORRIENTE, una tarjeta aparte]. pctDelTotal se
               calcula sobre carteraVencida para que los 8 tramos sumen
               exactamente 100%. 8 tests unitarios, incluyendo los bordes
               exactos de cada tramo.)
             · Edge Function `cartera-dashboard` ✅ (§23.1/§23.2, POST,
               cualquier miembro del tenant [is_member, mismo criterio
               que cartera-posicion: es lectura, no decisión de negocio].
               4 tests de integración HTTP real, incluyendo PH-C34.)
             · calcularOverduePortfolioPct/calcularCureRate/
               calcularRollRatePorTramo ✅ (packages/liquidation-engine/
               src/cartera-indicadores.ts — puro. Fuente: posiciones_
               cartera_snapshot [F3, ya congelado], NO fn_dashboard_
               cartera [siempre "ahora mismo"] — Roll/Cure Rate comparan
               dos fechas de corte, no tiene sentido recalcular en vivo
               un estado pasado [REC-CAR-011/012]. Roll Rate usa el orden
               de tramos [dias_min] de la política que produjo el
               snapshot de fecha_desde, no la vigente HOY. Un
               denominador en cero es indeterminado [null], nunca se
               informa como 0% — "0% de una base cero" no es "cero
               deterioro". 13 tests unitarios, incluyendo saltos de más
               de un tramo [no cuentan para el tramo de origen] e
               inmuebles sin fila en el snapshot de llegada [cuentan en
               el denominador, no se asume que curaron].)
             · Edge Function `cartera-indicadores` ✅ (§23.3, POST,
               cualquier miembro del tenant. Overdue Portfolio % se
               recalcula en vivo con fn_dashboard_cartera [F9 parte 1] —
               siempre disponible, corrida JOB_CARTERA_DIARIA o no. Roll/
               Cure Rate exigen snapshot en AMBAS fechas [422
               `SNAPSHOT_NO_DISPONIBLE` si falta uno — no se inventa un
               0%/100% en su ausencia]. 3 tests de integración HTTP real,
               con snapshots sintéticos insertados directo [posiciones_
               cartera_snapshot es append-only, no hace falta correr F8
               completo para fijar los bordes exactos del cálculo].)
             · fn_indicadores_gestion ✅ (20260823110000_cartera_
               indicadores_gestion_fn.sql — conteos/sumas crudos de un
               período [fecha_desde, fecha_hasta] para Recovery Rate,
               Collection Effectiveness, Promise/Agreement Fulfillment
               Rate. Interpretaciones explícitas, documentadas en la
               cabecera de la migración: "cargos vencidos" de Recovery
               Rate = vencidos AL INICIO del período [misma cohorte que
               el denominador]; "acuerdos terminados" excluye 'cancelado'
               [una cancelación administrativa no mide calidad de diseño
               del acuerdo] y usa fecha_fin para ambos desenlaces
               [cumplido no tiene columna de fecha propia en el esquema].
               La división en sí [con denominador-cero = indeterminado]
               vive en TS, no en SQL — REC-CAR-004.)
             · calcularIndicadoresGestion() ✅ (cartera-indicadores.ts,
               extendido — 6 tests unitarios nuevos, 19 en total en el
               archivo.)
             · Edge Function `cartera-indicadores` extendida ✅ (mismo
               payload fecha_desde/fecha_hasta de Roll/Cure Rate — los 7
               indicadores de esta pieza salen de una sola llamada. Test
               de integración extendido: lleva acciones_cobranza y
               acuerdos_pago hasta un estado terminal usando el cliente
               ADMIN directo, sin usuario autenticado — los tramos
               programada→ejecutando→ejecutada y vigente→cumplido/
               incumplido no exigen rol dentro del guard [confirmado
               leyendo 20260822280000/20260822310000: el chequeo de
               administrador se salta entero cuando auth.uid() es null].
               3 tests de integración HTTP real, 7 indicadores
               verificados contra la BD real en una sola corrida.)
             · fn_indicadores_legales ✅ (20260823120000_cartera_
               indicadores_legales_fn.sql — conteos/sumas crudos para
               Legal Referral Rate, Legal Recovery Rate, Average Days to
               Recovery, Cost to Collect. Interpretaciones explícitas,
               documentadas en la cabecera de la migración porque la
               guía da la fórmula pero no el detalle: "inmuebles que
               alcanzaron el tramo jurídico" [denominador de Legal
               Referral Rate] se aproxima con posiciones_cartera_
               snapshot.etapa_cobranza en ['juridica','judicial'] dentro
               de un RANGO de fecha_corte — cartera_etapas [F6] no es un
               log de eventos, solo guarda la etapa actual y una
               anterior, no permite reconstruir "quién alcanzó jurídico
               en este período"; Legal Recovery Rate usa la cohorte de
               casos_juridicos con fecha_remision en el período [misma
               cohorte que el numerador de Legal Referral Rate];
               Average Days to Recovery no es exclusivo de jurídico
               [cargos saldados en general, cualquier fuente]; Cost to
               Collect es PARCIAL — solo Σ costas_judiciales.monto,
               SIN costo de acciones_cobranza [decisión explícita del
               usuario, 2026-08-17: acciones_cobranza/estrategias_
               cobranza no tienen ninguna columna de costo, no se
               inventa un modelo de costos nuevo en esta pieza].)
             · calcularIndicadoresLegales() ✅ (cartera-indicadores.ts,
               extendido — 6 tests unitarios nuevos, 25 en total en el
               archivo. averageDaysToRecovery es un promedio simple en
               días [sin ×100]; costToCollect es un ratio, no porcentaje
               ["si > 1, la gestión destruye valor"].)
             · Edge Function `cartera-indicadores` extendida de nuevo ✅
               (los 11 indicadores de §23.3 salen de una sola llamada.
               Cost to Collect reutiliza montoRecuperadoPeriodo de
               fn_indicadores_gestion como denominador — no se relee
               [REC-CAR-004]. A diferencia de Roll/Cure Rate, Legal
               Referral Rate NO devuelve 422 si falta el snapshot del
               período — usa un rango, no dos fechas exactas, así que
               simplemente da null. certificaciones_deuda/casos_
               juridicos rechazan auth.uid() null explícitamente [a
               diferencia de acciones_cobranza/acuerdos_pago] — el test
               de integración necesitó un usuario administrador real
               autenticado para esos dos INSERT, no solo el cliente
               admin. 3 tests de integración HTTP real, 11 indicadores
               verificados contra la BD real en una sola corrida.)
             · §23.4 (transiciones críticas a vigilar) — sin entregable
               propio: es guía de LECTURA de Roll Rate por tramo [ya
               construido, F9 parte 2], no un cálculo nuevo. No se
               inventa un endpoint para algo que ya se responde con
               `rollRatePorTramo`.
             · fn_panel_acciones_cartera ✅ (20260823140000_cartera_
               panel_acciones_fn.sql — 8 conteos de las colas de trabajo
               de §23.5. Decisión de alcance del usuario [2026-08-17]:
               solo conteos [badges de dashboard], no las filas de
               detalle de cada cola — el frontend consulta las tablas
               directamente [RLS ya lo permite] cuando el usuario entra
               a una cola. p_fecha_referencia explícito [nunca now()/
               current_date embebido], mismo criterio de testabilidad
               que fecha_desde/fecha_hasta en el resto de F9.
               Interpretaciones documentadas en la cabecera de la
               migración porque la guía nombra las 8 colas pero no
               precisa el filtro exacto: "llamadas pendientes" =
               tipo_accion='llamada' y estado en [programada,
               ejecutando] [excluye pendiente_aprobacion, ya contada en
               su propia cola]; "cuotas que vencen esta semana" = 7 días
               desde fecha_referencia [inclusive], estado en [pendiente,
               parcial]; "casos sin actuación en 30 días" excluye
               estados terminales y usa fecha_remision cuando nunca hubo
               actuación registrada; "certificaciones por vencer" es un
               GAP real resuelto con decisión de negocio explícita del
               usuario [2026-08-17]: certificaciones_deuda no tiene
               ninguna columna de vigencia/vencimiento ni la guía
               documenta una política — se usa antigüedad de fecha_corte
               ≥ 30 días sobre certificaciones vigentes.)
             · Edge Function `cartera-panel-acciones` ✅ (nueva, no
               extiende `cartera-indicadores` — payload distinto
               [fecha_referencia, no fecha_desde/fecha_hasta], concepto
               distinto [colas de trabajo, no indicadores de período].
               obtenerPanelAccionesCartera() no tiene un paso de cálculo
               puro separado [cartera-panel-acciones-supabase.ts] — los
               8 conteos de la función SQL SON la respuesta final, sin
               ratio ni política de denominador-cero que aplicar encima
               [REC-CAR-004: no se inventa una abstracción sin lógica
               que envolver]. 2 tests de integración HTTP real: cada
               cola lleva al menos una fila que cuenta y una que no
               [control negativo de estado/fecha/vigencia], 8 conteos
               verificados contra la BD real.)
Golden Cases PH-C34 ✅ (verificado contra la BD real — un agent de otro
             tenant recibe 403, nunca ve datos agregados de un tenant que
             no es el suyo). PH-C35 diferido: ver §21.4 / AD-26.
Salida       F9 completo. §23.1/§23.2 completos. Los 11 indicadores de
             §23.3 completos y reproducibles [Overdue Portfolio %, Roll
             Rate, Cure Rate, Recovery Rate, Collection Effectiveness,
             Promise/Agreement Fulfillment Rate, Legal Referral Rate,
             Legal Recovery Rate, Average Days to Recovery, Cost to
             Collect — este último parcial, sin costo de
             acciones_cobranza]. §23.4 cubierto por lectura de Roll Rate
             [sin entregable propio]. §23.5 completo [8 conteos del
             panel de acciones]. F9 — y con él, F1-F9 completo — cierra
             aquí.
```

## 28.1 Grafo de dependencias

```text
F0 ─┬─→ F1 ─┬─→ F3 ─┬─→ F4 ─→ F5 ─→ F6 ─→ F7
    │       │       │
    └─→ F2 ─┘       └────────────────────────→ F8 ─→ F9

F2 puede correr en paralelo con F1 (equipos distintos).
F8 requiere F3 como mínimo; se enriquece con F4-F7.
F9 requiere F8.
```

---

# 29. Entregables previos a código

`[ARQ]` **No comenzar la implementación definitiva hasta producir:**

```text
01. Modelo de dominio                         → §5, §6
02. Máquina de estados de cartera             → §11
03. Máquina de estados de cobranza            → §10
04. Máquina de estados de acuerdos            → §12
05. Máquina de estados jurídicos              → §15
06. Modelo de datos (DDL)                     → §8, §9, §10, §12, §15..§19
07. Diccionario de datos                      → PENDIENTE — entregable CAR-03
08. Parámetros maestros                       → §20
09. Políticas versionadas                     → §20.2
10. Catálogo de eventos                       → §19
11. Jobs                                      → §18
12. Catálogo de acciones                      → §9.2
13. Reglas de negocio                         → transversal, etiquetadas
14. Prerrequisitos                            → §24
15. Matriz legal                              → §3
16. Matriz de trazabilidad                    → §25
17. Golden Cases                              → §26
18. Invariantes                               → §27
19. APIs / servicios                          → §22
20. RLS y seguridad                           → §21
21. Auditoría                                 → §19
22. Dashboard                                 → §23
23. Plan de migración                         → PENDIENTE — entregable CAR-05
24. Plan de pruebas                           → PENDIENTE — entregable CAR-06
25. Definition of Done                        → §30
```

Los tres pendientes se producen en F0.

---

# 30. Definition of Done

## 30.1 Por unidad de trabajo

```text
✓ La regla está etiquetada ([LEGAL]/[NEGOCIO]/[ARQ]/[CONFIG]/[PRQ]/[GAP]/[VERIFICAR])
✓ Existe migración aplicada y tipos regenerados (db:types)
✓ RLS enable + force verificados con test de aislamiento
✓ La lógica de decisión está en función pura, no en SQL ad-hoc ni en la UI
✓ Existe test unitario determinista
✓ Existe el golden case correspondiente y pasa
✓ Los invariantes afectados tienen test y, si aplica, refuerzo en esquema
✓ Los eventos emitidos tienen motivo legible
✓ Ninguna fecha implícita (`now()`/`Date.now()`) en lógica de cálculo
✓ Requisito REQ-CAR-* actualizado en la matriz
```

## 30.2 Por fase

```text
✓ Todos los golden cases de la fase pasan
✓ Todos los prerrequisitos de la fase están verificados
✓ Cero GAPs bloqueantes abiertos para la fase
✓ Cero VER-CAR bloqueantes abiertos para la fase
✓ Test de aislamiento multi-tenant pasa
✓ Test de idempotencia pasa (donde aplica)
✓ La documentación de la fase está actualizada
```

## 30.3 Del bloque completo

```text
✓ Obligaciones identificadas correctamente desde `cargos`
✓ Antigüedad reproducible y verificada en casos de borde
✓ Clasificación versionada; historia inmutable ante cambio de política
✓ Estrategias configurables por copropiedad
✓ Acciones auditables con contexto congelado
✓ Notificaciones integradas y reintentables
✓ Promesas de pago con detección de cumplimiento e incumplimiento
✓ Acuerdos de pago que no tocan el ledger original
✓ Escalamiento por máquina de estados explícita, con aprobación humana
✓ Certificación del art. 48 reproducible y discriminada
✓ Expediente jurídico con documentos versionados
✓ Costas trazables a decisión judicial; cero costas automáticas
✓ Integración con pagos SIN un segundo imputador
✓ Integración con mora SIN un segundo calculador de interés
✓ Snapshot histórico reproducible por hash
✓ Auditoría completa: toda transición explica su porqué
✓ 43 Golden Cases aprobados (PH-C35 diferido con AD-26)
✓ 20 Invariantes verificados
✓ 18 Prerrequisitos verificados o formalmente diferidos
✓ Matriz legal completa, sin regla inventada
✓ Cero redundancia arquitectónica con el motor de liquidación
✓ SEC-03 intacto: cero agregación cross-tenant
```

---

# 31. Plan de pruebas

## 31.1 Niveles

| Nivel | Qué prueba | Dónde | Sin BD |
|---|---|---|---|
| **Unitario puro** | `clasificarCartera`, `evaluarEscalamiento`, `calcularAntiguedad` | `packages/liquidation-engine/src/*.test.ts` | ✅ |
| **Golden case** | Escenarios completos con datos concretos | `tests/cartera/ph-cNN.test.ts` | Parcial |
| **Integración** | Job completo contra BD de prueba | `tests/cartera/job.test.ts` | ❌ |
| **RLS** | Aislamiento por tenant y por rol | `tests/rls/cartera.test.ts` | ❌ |
| **Invariantes** | Refuerzos de esquema (constraints, triggers) | `tests/invariantes/cartera.test.ts` | ❌ |
| **Idempotencia** | Re-ejecución del job | `tests/cartera/idempotencia.test.ts` | ❌ |

Sigue el precedente de `tests/liquidacion/gc001-cuenta-corriente.test.ts`, `tests/rls/cuenta-corriente.test.ts` y `tests/tenancy/calcular-intereses.test.ts`.

## 31.2 Pruebas de ausencia

`[ARQ]` Caso especial: algunos requisitos exigen probar que algo **no** ocurre.

```text
PH-C23  No se generan costas por antigüedad
        → correr el job con un inmueble de 400 días de mora
        → assert: count(costas_judiciales) == 0
        → assert: no existe trigger/función que inserte costas sin caso

I-C20   La UI no calcula lógica financiera
        → lint/grep sobre apps/web: prohibido calcular saldos,
          días de mora o clasificación en componentes Vue
```

Estas pruebas son las que impiden que el anti-patrón vuelva a entrar meses después.

## 31.3 Datos de prueba

Construir un tenant sintético `CAR-FIXTURE` con:

```text
· 10 inmuebles cubriendo los 8 tramos de clasificación
· 1 inmueble al día con saldo a favor
· 1 inmueble con acuerdo vigente
· 1 inmueble con acuerdo incumplido
· 1 inmueble en proceso judicial con costas
· 1 inmueble con cambio de propietario a mitad de deuda
· 1 inmueble con dos propietarios (solidaridad)
· Cargos que cruzan cambio de política de clasificación
· Cargos que cruzan cambio de tasa de referencia
· Un pago retroactivo (para GAP-CAR-003)
```

---

# 32. Plan de migración

## 32.1 Orden de migraciones

`[ARQ]` Siguiendo el workflow del proyecto: **migración → push → `db:types` → build de `shared` → stores/componentes**. Nunca al revés.

```text
F0  2026MMDD_cartera_fecha_vencimiento.sql
F2  2026MMDD_tasas_referencia.sql
    2026MMDD_politica_financiera_tasa_referencia.sql
F3  2026MMDD_cartera_clasificacion_politica.sql
    2026MMDD_cartera_posicion_snapshot.sql
    2026MMDD_cartera_vistas_posicion.sql
F4  2026MMDD_cobranza_estrategias.sql
    2026MMDD_cobranza_acciones.sql
F5  2026MMDD_cartera_promesas_acuerdos.sql
F6  2026MMDD_cartera_escalamiento.sql
    2026MMDD_cartera_gastos_cobranza.sql
F7  2026MMDD_cartera_certificaciones.sql
    2026MMDD_cartera_juridico.sql
    2026MMDD_cartera_costas.sql
F8  2026MMDD_cartera_eventos.sql
F9  2026MMDD_cartera_vistas_bi.sql
```

## 32.2 Regla sobre datos existentes

`[ARQ]` **Ningún dato financiero existente se recalcula.**

```text
· Los cargos de interés ya generados NO se recalculan al versionar la tasa.
· Las liquidaciones cerradas NO se tocan (Docs 20 §69 RESULT IMMUTABILITY).
· La primera corrida del job de cartera produce el snapshot inicial;
  no reconstruye snapshots históricos que no existieron.
· Si se requiere histórico, se genera como carga explícita y marcada
  como reconstruida, nunca como si hubiera sido calculada en su día.
```

## 32.3 Rollback

Cada migración de este bloque es **aditiva** (tablas nuevas, columnas nullable). El rollback es `DROP` de lo nuevo, sin pérdida de datos financieros existentes. La única migración con riesgo es `F0` (fecha de vencimiento); debe diseñarse con columna nullable + backfill verificable, nunca con `NOT NULL` directo sobre una tabla append-only con datos.

---

# 33. Instrucción final al agente implementador

## 33.1 Rol

Actúa como:

> **Arquitecto Senior de Software + Analista Senior de Negocio de Propiedad Horizontal + Especialista en Sistemas Financieros + Auditor de Trazabilidad.**

## 33.2 Prohibiciones absolutas

```text
✗ NO inventes reglas legales.
✗ NO presentes decisiones de diseño como obligaciones legales.
✗ NO dupliques definiciones existentes (cargos, pagos, imputación, interés).
✗ NO escribas un segundo imputador de pagos.
✗ NO escribas un segundo calculador de interés.
✗ NO implementes lógica financiera dentro de la UI.
✗ NO mezcles antigüedad, intereses, cobranza y costas.
✗ NO hardcodees políticas que deben ser configurables.
✗ NO elimines información histórica.
✗ NO sobrescribas obligaciones ni tablas append-only.
✗ NO generes costas judiciales por antigüedad.  ← el error clásico
✗ NO escales la tasa de mora con la antigüedad.  ← ilegal
✗ NO ignores prerrequisitos ni inventes valores por defecto.
✗ NO uses now()/Date.now() implícito en lógica de cálculo.
✗ NO agregues datos de más de un tenant en ninguna consulta.
✗ NO crees tablas ni columnas en inglés.
✗ NO ejecutes acciones de alto impacto sin aprobación humana.
```

## 33.3 Protocolo ante incertidumbre

```text
NO INVENTAR
    ↓
IDENTIFICAR LA INCERTIDUMBRE  (asignarle un id VER-CAR-NN o GAP-CAR-NN)
    ↓
IDENTIFICAR LA FUENTE QUE DEBE VERIFICARSE
    ↓
¿ES CRÍTICA?
    SÍ → BLOQUEAR la funcionalidad. Estado BLOCKED. Escalar.
    NO → Documentar, implementar el resto, dejar el hueco explícito.
```

## 33.4 Para cada regla nueva, declarar

```text
[FUNDAMENTO LEGAL]           ¿de qué norma sale, o de ninguna?
[REGLA DE NEGOCIO DERIVADA]  ¿qué decide el negocio a partir de ahí?
[DECISIÓN ARQUITECTÓNICA]    ¿qué decide AQUILA por diseño?
[PRERREQUISITO]              ¿qué debe existir antes?
[GOLDEN CASE]                ¿cómo se prueba con datos concretos?
```

## 33.5 Principio final

El objetivo es construir el **Motor de Gestión de Cartera de AQUILA_SAAS**:

- **Integrado** con el dominio financiero existente, sin duplicarlo.
- **Jurídicamente trazable**, con cada regla financiera atada a su norma o declarada como decisión de negocio.
- **Configurable** por copropiedad, sin desplegar código para cambiar una política.
- **Auditable**, capaz de explicar por qué cada inmueble llegó a donde llegó.
- **Reproducible**, capaz de reconstruir cualquier posición histórica.
- **Preparado para automatización**, sin que la automatización tome decisiones que exigen criterio humano.

La prueba definitiva del bloque son **dos** preguntas (`ENM-CAR-02`).

La primera la formula la asamblea o un propietario inconforme, y se responde hacia adentro:

> **"¿Por qué le enviaron un requerimiento de cobro a este propietario el 14 de junio, y con base en qué?"**

La segunda la formula un juez, y se responde hacia afuera:

> **"Acredítelo."**

Si AQUILA no puede responder la primera con precisión, fecha, política, versión, monto y firma, el bloque no está terminado. Si no puede responder la segunda con el texto exacto que se envió, el canal, el destinatario y su acuse de recibo, el bloque está terminado como herramienta de gestión pero **no cumple el objetivo del producto** — ver §34.

---

# 34. Expediente probatorio

`[ARQ]` Sección incorporada el 2026-08-28 (`ENM-CAR-01`, `CAR_07_Enmiendas_Propuestas.md`). Cierra la brecha entre la pregunta defensiva de §33.5 y la pregunta ofensiva que formula un juez.

## 34.0 Estado de construcción

`[ARQ]` Corte 2026-08-28. Lo de §34.3 y §34.4 está **construido y verificado contra la base real**; lo de §34.5 en adelante, no.

```text
✅ 34.3  acciones_cobranza_envios + acciones_cobranza_acuses
         (20260906100000) — append-only, RLS enable & force, solo
         service_role escribe. estado_acuse_t y origen_acuse_t con su
         COMMENT ON TYPE (D-24).
✅ 34.4  fn_acreditacion_accion() — derivada, sin columna persistida
✅ I-C23 fn_contar_acciones_acreditadas() (20260906110000) +
         accionesAcreditadas en ContextoEscalamiento: sin una sola
         notificación probada NO se escala a prejurídica ni a jurídica.
         Vive en la función de escalamiento, no en la interfaz.
✅ Tests tests/tenancy/cartera-expediente-probatorio.test.ts (9) cubre
         PH-C40, PH-C41, PH-C43, PH-C45, I-C22, append-only y RLS.
         cartera-escalamiento.test.ts cubre PH-C42.

✅ 34.5  fn_compilar_expediente() (20260906120000) — reúne las siete
         secciones + caso jurídico. Reproducible: mismo corte, mismo
         expediente_hash (PH-C44 verificado con pagos y gestiones
         posteriores ya en la base). Falta SOLO el PDF paginado, que es
         capa de aplicación y no fuente de verdad.
✅ 34.2  CANAL SMS COMPLETO Y PROBADO CONTRA BREVO REAL:
         · ejecutar-accion-cobranza registra el envío + acuse inicial
           'encolado' (aceptar no es entregar, REC-CAR-016)
         · webhook-brevo (PRQ-CAR-019) recibe los acuses y los traduce
           a estado_acuse_t; sirve para SMS y email con el mismo mapa
         · verificado end-to-end con un SMS real: despacho → evidencia
           → acuse → acreditada → I-C23 desbloqueado
⧗ 34.2b Faltan los canales email, whatsapp y postal. El webhook ya
         sirve a email sin cambios; falta el worker que lo despache.
⧗ PDF   Materialización paginada con índice y hash al pie (§34.5).
```

`[ARQ]` **Desviación registrada:** el DDL de §34.3 dice `references public.documentos (id)`; correcto — la tabla nació como `documentos_inmueble` y se generalizó a `documentos` en `20260822130000`.

`[ARQ]` **I-C25 (retención) ya se cumple por construcción:** `forbid_mutation()` solo admite `DELETE` cuando `tg_table_name = 'audit_log'`, así que la purga de 24 meses no puede alcanzar estas tablas. No hacía falta una exclusión explícita; hace falta no escribir nunca una purga que las incluya mientras `VER-CAR-05` siga abierto.

## 34.1 Principio

`[ARQ]` **Una gestión de cobro que no puede acreditarse no ocurrió.**

§9.1 ya separa *acción programada* (intención) de *acción ejecutada* (hecho). Esta sección añade el tercer estado, que es el único que sirve ante un juez:

```text
acción programada   →   acción ejecutada   →   acción acreditada
   (intención)            (despachada)          (recibida, con prueba)
```

`[ARQ]` **`REC-CAR-016`** — El valor `ejecutada` de `estado_accion_cobranza_t` significa **despachada al proveedor**, no recibida. No se renombra (migración costosa sobre datos vivos); se fija su semántica aquí y la acreditación se **deriva** de los acuses, nunca se declara — mismo principio que §6.1 y que la prohibición `AP-01`.

## 34.2 Qué constituye prueba, por canal

`[NEGOCIO]` `[VERIFICAR]` No todos los canales prueban lo mismo:

| Canal | Prueba exigida | Origen del acuse | ¿Acredita por sí solo? |
|---|---|---|---|
| `email` | Constancia del proveedor: id de mensaje, fecha, destinatario, estado | Webhook | Sí, con acuse `entregado` |
| `sms` | Acuse del operador con id y estado | Webhook | Sí, con acuse `entregado` |
| `whatsapp` | Acuse del proveedor | Webhook | Parcial — ver `VER-CAR-08` |
| `carta` / físico | Guía rastreable de operador postal + acuse de recibo | Manual (documento) | Sí, con guía y acuse cargados |
| `llamada` | Registro del gestor: fecha, hora, duración, resultado tipificado | Constancia humana | **No** — es gestión, no notificación |
| `visita` | Acta de visita firmada o constancia del gestor | Constancia humana | **No** — es gestión, no notificación |

`[ARQ]` **`REC-CAR-017`** — Distinción dura entre **canal con acuse técnico** (el proveedor devuelve un estado verificable) y **canal con constancia humana** (solo existe la palabra del gestor). Un escalamiento a `prejuridica` o `juridica` **no puede sustentarse únicamente en constancias humanas**. Es `I-C23`, y se implementa en la función de escalamiento, no como advertencia de interfaz.

## 34.3 DDL

`[ARQ]` Dos tablas nuevas, append-only, con `tenant_id` + RLS `enable & force` (`REC-CAR-007`). No se modifica `acciones_cobranza`: una acción puede tener varios intentos de envío (§18.4 paso 7), así que el envío es entidad propia.

```sql
-- ── Envío material de una acción de cobranza ──────────────────────────
create table public.acciones_cobranza_envios (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  accion_id             uuid not null references public.acciones_cobranza (id),

  intento_numero        int not null,
  canal                 public.canal_cobranza_t not null,

  -- DESTINATARIO RESUELTO EN EL MOMENTO DEL ENVÍO
  destinatario_tercero_id uuid not null references public.terceros (id),
  destinatario_contacto   text not null,     -- correo/teléfono/dirección usados

  -- CONTENIDO — lo que se aporta al proceso, no su huella
  plantilla_codigo      text not null,
  plantilla_version     int not null,
  asunto                text,
  contenido_renderizado text not null,       -- el texto exacto que se envió
  contenido_hash        text not null,       -- integridad, no sustituto

  -- PROVEEDOR
  proveedor             text not null,       -- 'brevo' | 'postal' | 'manual'
  referencia_externa    text,                -- id del proveedor
  enviado_at            timestamptz not null default now(),
  enviado_por           uuid references public.profiles (id),

  created_at            timestamptz not null default now(),
  constraint envio_intento_unico unique (tenant_id, accion_id, intento_numero)
);

alter table public.acciones_cobranza_envios enable row level security;
alter table public.acciones_cobranza_envios force row level security;

create trigger acciones_cobranza_envios_append_only
  before update or delete on public.acciones_cobranza_envios
  for each row execute function public.forbid_mutation();

create index on public.acciones_cobranza_envios (tenant_id, accion_id);
create index on public.acciones_cobranza_envios (tenant_id, referencia_externa);
```

```sql
-- ── Acuses recibidos sobre un envío ───────────────────────────────────
create table public.acciones_cobranza_acuses (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  envio_id          uuid not null references public.acciones_cobranza_envios (id),

  estado            public.estado_acuse_t not null,
  ocurrido_at       timestamptz not null,    -- momento reportado por la fuente
  recibido_at       timestamptz not null default now(),

  origen            public.origen_acuse_t not null,
  payload_crudo     jsonb,                   -- respuesta íntegra del proveedor
  documento_id      uuid references public.documentos (id),  -- acuse escaneado
  motivo            text,
  registrado_por    uuid references public.profiles (id),

  created_at        timestamptz not null default now(),

  -- I-C22: un acuse manual sin documento que lo respalde no prueba nada
  constraint acuse_manual_exige_documento check (
    origen <> 'manual' or documento_id is not null
  ),
  -- IDEM-05: deduplicación de webhooks reenviados
  constraint acuse_unico unique (tenant_id, envio_id, estado, ocurrido_at)
);

alter table public.acciones_cobranza_acuses enable row level security;
alter table public.acciones_cobranza_acuses force row level security;

create trigger acciones_cobranza_acuses_append_only
  before update or delete on public.acciones_cobranza_acuses
  for each row execute function public.forbid_mutation();
```

`[ARQ]` **D-24, obligatorio antes de migrar.** Los dos tipos siguientes son **propuesta de catálogo**, no autorización a crearlos (regla dura de §0.3). Ambos gatillan lógica de transición —el escalamiento consulta el estado de acreditación—, por lo que la evaluación debería resolverse a favor del enum de Postgres **con su `COMMENT ON TYPE`**; pero esa evaluación hay que hacerla explícitamente y `tests/governance/enum-lista-tipos-coverage.test.ts` la exige.

```sql
create type public.estado_acuse_t as enum (
  'encolado',      -- aceptado por el proveedor, sin resolución todavía
  'entregado',     -- el proveedor confirma entrega
  'leido',         -- confirmación de lectura (no todos los canales)
  'rebotado',      -- rechazo permanente del destino
  'fallido',       -- error técnico del envío
  'no_entregable'  -- imposibilidad acreditada (dirección inexistente, etc.)
);

create type public.origen_acuse_t as enum (
  'proveedor',     -- webhook del proveedor de envío
  'manual'         -- constancia cargada por una persona, exige documento_id
);
```

## 34.4 Estado de acreditación — derivado, nunca persistido

`[ARQ]` **`REC-CAR-018`** — No existe columna `esta_acreditada`, igual que no existe `esta_en_mora` (`AP-01`). Se deriva del último acuse de cada envío:

```sql
create or replace function public.fn_acreditacion_accion(
  p_tenant_id uuid,
  p_accion_id uuid
) returns table (
  envios_total        int,
  envios_acreditados  int,
  ultimo_estado       public.estado_acuse_t,
  ultimo_acuse_at     timestamptz,
  acreditada          boolean
)
language sql stable
as $$ ... $$;
```

```text
acreditada(accion) =
    ∃ envio ∈ envios(accion) :
        ultimo_acuse(envio).estado ∈ ('entregado', 'leido')

'leido' implica 'entregado'.
'no_entregable' NO acredita la notificación, pero SÍ acredita la
diligencia — se conserva y se reporta: un intento fallido documentado
vale ante un juez, y su ausencia no.
```

## 34.5 Compilación del expediente

`[ARQ]` **`REC-CAR-019`** — Composición sobre datos existentes. No calcula nada nuevo; reúne. Recibe fecha de corte explícita (`REC-CAR-008`).

```sql
create or replace function public.fn_compilar_expediente(
  p_tenant_id   uuid,
  p_inmueble_id uuid,
  p_fecha_corte date
) returns jsonb
language sql stable
as $$ ... $$;
```

Contenido obligatorio, en este orden:

```text
1. Identificación         inmueble, coeficiente, deudor(es) con su rol y
                          vigencia (inmueble_persona_rol), copropiedad
2. Título ejecutivo       certificación art. 48 vigente + detalle_cargos
                          congelado + certificacion_hash
3. Composición de deuda   cargos vencidos con vencimiento, saldo y antigüedad
                          a la fecha de corte
4. Cronología de gestión  toda acción de cobranza con: qué se envió, a quién,
                          cuándo, por qué canal, con qué plantilla y versión,
                          el texto íntegro, y su acuse con fecha
5. Promesas y acuerdos    con su estado, cumplimiento e incumplimiento
6. Trazabilidad           política de clasificación y versión que sustentó
                          cada escalamiento, y quién aprobó cada acción de
                          alto impacto
7. Intentos fallidos      envíos no entregables con su motivo — acreditan
                          diligencia
```

`[ARQ]` **Criterio de terminación de esta sección:** el abogado debe poder radicar con este expediente **sin pedir nada más**. Si tiene que preguntar algo, la sección no está completa.

`[NEGOCIO]` Salida: PDF paginado, numerado, con índice y con el hash del expediente al pie de cada página. El PDF **no es la fuente de verdad**: es una materialización fechada de `fn_compilar_expediente`, reproducible (`PH-C44`).

`[ARQ]` **Materialización (2026-08-29).** `/cartera/expediente/{inmuebleId}?corte=YYYY-MM-DD` compone las siete secciones y se imprime con `@media print` — sin librería de PDF, igual que el recibo de caja y el comprobante de cuenta. El `expediente_hash` va en el pie de **cada** página, no solo al final: un expediente cuyo hash consta una sola vez admite que le quiten hojas sin que se note. La ausencia de título ejecutivo se imprime explícitamente en la sección 2 en vez de omitirse.

## 34.6 Retención

`[LEGAL]` `[VERIFICAR]` La evidencia se conserva mientras la obligación sea exigible o esté en discusión, **no según una política de purga genérica**.

```text
retencion_minima(evidencia) =
    fecha_extincion_obligacion + termino_prescripcion + margen

Mientras VER-CAR-05 esté abierto, NO se purga ninguna evidencia
de cobranza.
```

`[ARQ]` `I-C25` — Esto choca con la purga existente (`20260814190000_purga_audit_log.sql`, 24 meses). Las tablas de §34.3 quedan **explícitamente excluidas** de ese job.

## 34.7 Golden cases

```text
PH-C40  Email entregado
        Acción ejecutada → webhook 'entregado' → acreditada = true.
        El expediente incluye el texto íntegro y la fecha del acuse.

PH-C41  Email rebotado, reintento entregado
        Intento 1 'rebotado', intento 2 'entregado'. acreditada = true.
        El expediente muestra AMBOS intentos.

PH-C42  Solo constancias humanas
        Tres llamadas registradas, cero envíos con acuse técnico.
        El escalamiento a prejurídica se RECHAZA por I-C23.

PH-C43  No entregable acreditado
        Dirección inexistente con constancia del operador postal.
        acreditada = false, pero el expediente lo reporta como
        diligencia documentada, no como vacío.

PH-C44  Reproducibilidad
        fn_compilar_expediente con la misma fecha_corte produce el mismo
        hash dos veces, con datos posteriores en la base.

PH-C45  Webhook duplicado
        El proveedor reenvía el mismo acuse: acuse_unico lo deduplica
        sin error visible (IDEM-05).
```

---

**FIN DEL DOCUMENTO — CAR-00 GUÍA OFICIAL**
**Motor de Gestión de Cartera · AQUILA_SAAS**
