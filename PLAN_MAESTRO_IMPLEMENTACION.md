# AQUILA — PLAN MAESTRO DE IMPLEMENTACIÓN

## Contrato de ejecución unificado · Fase I + Núcleo de Liquidación + AEL

> **Proyecto:** Plataforma SaaS de administración de propiedad horizontal
> **Estado:** Decisiones cerradas · ejecutable
> **Articula:** `PROMPT_MAESTRO_FASE1.md` + corpus canónico `Docs/01–24`
> **Deriva de:** `ANALISIS_DOCUMENTACION_AEL.md`
> **Fecha:** 2026-08-13

---

# 0. Cómo usar este documento

Este documento es la **capa de decisión** que faltaba. El corpus `Docs/01–24` define
restricciones e invariantes exhaustivamente pero difiere 339 definiciones concretas
(`ANALISIS §3.1`). Un agente que respete la prohibición de invención (`0AEL §6`, `21 §7`)
se detiene en la primera de ellas.

Este documento cierra esas decisiones. No reescribe el corpus.

## 0.1 Precedencia de fuentes — sustituye a `21 §3` y `0AEL §3`

```text
1. Este documento (decisiones cerradas)
2. PROMPT_MAESTRO_FASE1.md
3. Documentos canónicos 01–20  (referencia normativa: invariantes y restricciones)
4. Documentos 21, 22, 24        (gobierno, trazabilidad, aceptación)
5. Código existente
6. Tests existentes
7. Inferencia del agente
```

**El documento 23 (roadmap M0–M19) queda derogado** y sustituido por §5 de este documento.
**Los roadmaps embebidos `01 §57` (FASE 0–8) y `01 §62` (Hitos 1–7) quedan derogados.**
Esto resuelve la contradicción de `ANALISIS §3.2`: existía más de un roadmap canónico y
la precedencia hacía ganar al que el propio corpus decía que no mandaba.

## 0.2 Lo que se conserva íntegro del corpus

```text
21 §5    regla de propietario único
21 §6    regla anti-redundancia
21 §7    prohibición de invención  ← sigue vigente para lo NO decidido aquí
0AEL §27 protocolo STOP
0AEL §28 prohibición de falsa terminación
24       criterios de aceptación y Definition of Done
22       mecánica de trazabilidad
```

---

# 1. Decisiones cerradas

## 1.1 Arquitectura y alcance

| ID        | Decisión                                                                                                                                                                                                                                                                                                                                                                             | Origen                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **AD-20** | Arquitectura en **tres capas**: kernel financiero y lenguaje son **independientes entre sí**; la orquestación de liquidación consume ambos                                                                                                                                                                                                                                           | §3                              |
| **AD-21** | **AEL v0 = evaluador de expresiones**. Sin `MIENTRAS`, sin compilador, sin IR, sin bytecode, sin VM. Evaluación sobre el DAG de conceptos (`18`)                                                                                                                                                                                                                                     | D-01                            |
| **AD-22** | Se conservan de AEL v0: tipado fuerte, dimensionalidad, determinismo, diagnósticos, trazabilidad y auditoría                                                                                                                                                                                                                                                                         | D-01                            |
| **AD-23** | El pipeline completo (Artifact, verificador, VM) se construye **solo si** un caso de negocio real lo exige. No es alcance inicial. **Revisado 2026-08-15**: la experiencia de autoría de fórmulas (editor, prueba en vivo) sí tiene caso de negocio confirmado — ver `PLAN_AEL004_RULE_WORKSPACE.md`; el pipeline Artifact/VM/capabilities en sí sigue condicionado a necesidad real | D-01                            |
| **AD-24** | **`tenant` = copropiedad.** No existe entidad "administradora" en el modelo. La frontera de aislamiento RLS es la copropiedad                                                                                                                                                                                                                                                        | D-02                            |
| **AD-25** | La **unidad de liquidación es tenant + periodo**. `20 §39 TENANT TOTAL` es correcto tal como está escrito                                                                                                                                                                                                                                                                            | AD-24                           |
| **AD-26** | Propietarios y residentes son **datos del dominio, no principales de autenticación**. Sin cuenta, sin login, sin RLS propia                                                                                                                                                                                                                                                          | D-07                            |
| **AD-27** | La **suscripción se factura por copropiedad**, coincidiendo exactamente con la frontera del tenant                                                                                                                                                                                                                                                                                   | D-02                            |
| **AD-28** | Quien administra varias copropiedades tiene **una membresía por cada una** y conmuta con el selector de tenant (Fase I §9.4)                                                                                                                                                                                                                                                         | AD-24                           |
| **AD-29** | `novedades.tipo` es **enum nativo** `novedad_tipo_t`, no `lista_tipos` — el motor lee este valor para lógica de control (mismo criterio que `20260814160000_tipos_lista_tipos.sql`)                                                                                                                                                                                                  | Doc16 §28                       |
| **AD-30** | `novedades.monto` se almacena **firmado**: CHARGE/DEBIT positivo, DISCOUNT/CREDIT/REFUND negativo, ADJUSTMENT cualquier signo no-cero — validado en Edge Function + `check` en BD                                                                                                                                                                                                    | Doc19 §254/289                  |
| **AD-31** | El ledger de cuenta corriente (`cargos`/`pagos`/`pago_aplicaciones`) queda **separado** de `liquidaciones`/`liquidacion_lineas`. El saldo de §6.4 es una consulta derivada sobre el ledger, nunca un campo persistido en `liquidaciones` — un pago futuro no puede alterar una liquidación pasada (`20 §69`)                                                                         | §6.4                            |
| **AD-32** | El interés de mora se calcula **bajo demanda** (`calcular-intereses`), anclado a una `fecha_referencia` explícita del payload — nunca `Date.now()` implícito                                                                                                                                                                                                                         | §6.6                            |
| **AD-33** | Una novedad se materializa como `cargos` (categoría `otro`) **en el momento de aprobación**, no durante `liquidar-periodo` — refuerza `Doc19 §284 NO APPROVAL BY RUNTIME`                                                                                                                                                                                                            | Doc19 §284                      |
| **AD-34** | El crédito por sobrepago no requiere fila especial: es consecuencia aritmética de que el saldo derivado quede negativo; se aplica solo al siguiente cobro                                                                                                                                                                                                                            | Decisión de negocio, 2026-08-15 |
| **AD-35** | **Sin versionado de API en v0** (Doc 14): un único cliente propietario (`apps/web`); se adopta cuando exista un segundo consumidor externo real                                                                                                                                                                                                                                      | AD-23                           |
| **AD-36** | **Estrategia de imputación de pago configurable** por política: `imputacion_estrategia` ∈ {`deuda_mas_antigua`, `periodo_actual`}. En ambas, el orden de categoría (`imputacion_orden`, interés→capital→otro) se mantiene igual — lo que cambia es qué periodo se sirve primero                                                                                                      | Decisión de negocio, 2026-08-15 |

## 1.2 Mapeo con el corpus

`16 §6` (Tenant) y `16 §7` (Property/Copropiedad) los trata como entidades distintas.
Bajo AD-24 **son la misma entidad**. El agente implementa **una** tabla, no dos.

```text
16 §6  TENANT      ─┐
                    ├──→  public.tenants   (una sola tabla)
16 §7  COPROPIEDAD ─┘
```

## 1.3 Limitación conocida y aceptada

Con AD-24, una vista consolidada de varias copropiedades (la "cartera" de quien gestiona
5 edificios) es **agregación cross-tenant**, que RLS prohíbe por diseño. No forma parte
del alcance. Si se requiere en el futuro exige diseño explícito y controlado — nunca
relajar SEC-03. Registrado como **GAP-17** (§7).

---

# 2. Relación con `PROMPT_MAESTRO_FASE1.md`

La Fase I asumía `tenant = copropiedad`. **AD-24 la confirma**: el documento es correcto
y permanece vigente en su totalidad — AD-01…AD-11, los dos planos de autorización
(AD-09), los invariantes SEC-01…SEC-10 y las decisiones GAP-01…GAP-09.

Única corrección, derivada de AD-26:

| Punto                | Fase I decía                      | Corrección                                                                                      |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| Rol `guest`          | "copropietario con acceso mínimo" | **Se elimina.** Los copropietarios no son usuarios. `tenant_role_t` queda `('agent','auditor')` |
| GAP-10 (Fase I §7.5) | `guest` con `dashboard:view`      | **Anulado** — el rol desaparece                                                                 |

`agent` conserva su significado original de la Fase I: **administrador de la copropiedad**,
rol máximo del tenant.

**Flujo de alta confirmado:** el usuario se registra → declara los datos de su primera
copropiedad → queda como `agent` de ella → puede crear más copropiedades (cada una es un
tenant nuevo donde también es `agent`) → puede invitar usuarios de menor jerarquía a una
copropiedad concreta.

---

# 3. Arquitectura en tres capas

```text
┌──────────────────────────────┐   ┌──────────────────────────────┐
│  CAPA A · KERNEL FINANCIERO  │   │  CAPA B · LENGUAJE (AEL v0)  │
│                              │   │                              │
│  Money · Decimal · Currency  │   │  léxico · gramática · AST    │
│  RoundingPolicy              │   │  tipos · dimensiones         │
│  Allocation + residual       │   │  evaluador sobre DAG         │
│  Invariantes reconciliación  │   │  diagnósticos                │
│                              │   │                              │
│  docs 16, 19                 │   │  docs 01, 02, 03, 07         │
│  A NO depende de B           │   │  B SÍ depende de A (dinero)  │
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │                                   │
               └─────────────┬─────────────────────┘
                             ▼
            ┌────────────────────────────────────┐
            │  CAPA C · ORQUESTACIÓN             │
            │  Snapshot · grafo de dependencias  │
            │  plan de cálculo · resultado       │
            │  trace · validación · finalización │
            │  docs 17, 18, 20                   │
            └────────────────────────────────────┘
```

**Justificación del desacoplamiento A↔B:** `19 §18` define allocation como
`sourceAmount × basis(i) / totalBasis` sobre un vector de bases — aritmética pura.
`19 §95` exige que pase por `FinancialOperationService`, un servicio, no una regla.
El redondeo, el residual por mayor resto y la reconciliación son idénticos exista AEL o
no. `23 §26` autoriza trabajo paralelo cuando los contratos son independientes. "Paralelo"
significa que **F3 no espera a F4** ni viceversa durante la construcción — la interfaz
pública de A (Money, FinancialOperationService) queda fija al cerrar F3, y F4 la consume
sin tocar sus internos.

**Regla de frontera (vinculante, corregida tras iniciar F4):** la Capa B **nunca**
implementa aritmética monetaria — ni decimal ni Money. Toda operación sobre `Money` la
delega en la Capa A. Duplicar redondeo en el evaluador es una violación de `21 §6`.

Esto es una **dependencia real y unidireccional B→A**, no independencia mutua — la
redacción anterior ("SIN dependencia de A" en B) era imprecisa y quedó corregida arriba.
Dentro de la Capa B, la dependencia se aísla al borde de ejecución:

```text
ael-core       → SIN dependencia de financial-kernel (tipos estáticos: Tipo, Dimension, Unit)
ael-language   → depende de ael-core (AST tipado, análisis estático) — SIN financial-kernel
ael-runtime    → depende de ael-core + ael-language + financial-kernel (valores en tiempo
                  de ejecución: TypedValue con Money/Decimal reales)
```

`ael-core` y `ael-language` siguen sin saber que `financial-kernel` existe — solo
`ael-runtime`, el borde donde el AST se convierte en valores reales, lo importa.

---

# 4. Modelo de dominio

Este es el hueco crítico de `ANALISIS §3.3`: el corpus define la semántica (`16 §6-30`)
pero **ninguna tabla**. Aquí se cierra.

## 4.1 Jerarquía

```text
usuario ──< memberships >── TENANT (copropiedad)   ← frontera de aislamiento RLS
                                │
                                ├──< inmuebles        ← DESTINO DE COBRO
                                │       └──< inmueble_propietario >── propietarios
                                │                                     (datos, no usuarios)
                                ├──< zonas_comunes    ← INVENTARIO, fuera del cálculo
                                │
                                ├──< periodos
                                ├──< conceptos        ← ítems de cobro (incl. CUOTA_ADMIN)
                                ├──< coeficiente_sets ──< coeficientes
                                ├──< novedades
                                ├──< pagos
                                └──< liquidaciones ──< liquidacion_lineas
```

## 4.1.1 Regla estructural — inmueble vs zona común

```text
INMUEBLE       propiedad privada · tiene dueño · tiene coeficiente
               ES destino de cobro y de prorrateo

ZONA COMÚN     sin dueño individual · sin coeficiente propio
               NO es destino de cobro · NO genera línea de liquidación
               Su sostenimiento se cubre vía el concepto CUOTA_ADMIN
```

**Invariante SEC/R nuevo:**

```text
R6   Ninguna zona común aparece como target de una allocation
     ni como sujeto de una línea de liquidación.
```

Los gastos de sostenimiento de las zonas comunes **no se modelan como cargos
individuales prorrateados uno a uno**. Se cubren mediante el concepto de cobro
`CUOTA_ADMIN`, que es un `concepto` como cualquier otro (§4.3) y cuya fórmula AEL
determina cómo se reparte — por coeficiente, por área o por la regla que la copropiedad
haya aprobado.

Consecuencia: `zonas_comunes` es una tabla **descriptiva**. Sirve para inventariar y
documentar la copropiedad, no participa en la cadena de cálculo del motor. Un cambio en
ella no puede alterar una liquidación.

## 4.1.2 Mapeo con los contratos AEL

El corpus expone el contrato `UNIT` (`01 §22`, `01 §39`). `01 §38` pide español en la
terminología funcional. Se resuelve así:

```text
tabla  inmuebles          ←→  contrato AEL  UNIT
       area_privada       ←→  UNIT.AREA_PRIVATE
       area_comun         ←→  UNIT.AREA_COMMON
       codigo             ←→  UNIT.CODE
```

Una sola entidad, dos nombres según la capa. No se crean dos tablas.

## 4.2 Ampliación de `tenants`

`tenants` ya existe en Fase I §5.3 con `name`, `slug`, `status`, `settings`, `created_by`.
F2 le añade los atributos de copropiedad:

| Columna        | Tipo                                       | Reglas                                      |
| -------------- | ------------------------------------------ | ------------------------------------------- |
| `nit`          | `text`                                     | identificación tributaria de la copropiedad |
| `direccion`    | `text`                                     |                                             |
| `moneda`       | `char(3)` NOT NULL default `'COP'`         | `16 §40`                                    |
| `zona_horaria` | `text` NOT NULL default `'America/Bogota'` | `16 §92`                                    |

## 4.3 Tablas nuevas de F2

Convenciones heredadas de Fase I §5.4: `id uuid PK`, `created_at`, `updated_at`,
`tenant_id` en toda tabla, RLS `ENABLE` + `FORCE` en la misma migración que la crea.

### `inmuebles` — destino de cobro

| Columna                  | Tipo                                                                   | Reglas                                    |
| ------------------------ | ---------------------------------------------------------------------- | ----------------------------------------- |
| `tenant_id`              | `uuid` FK → `tenants`                                                  |                                           |
| `codigo`                 | `text` NOT NULL                                                        | `UNIQUE(tenant_id, codigo)` → `UNIT.CODE` |
| `tipo`                   | `enum(apartamento, casa, local, oficina, parqueadero, deposito, otro)` |                                           |
| `matricula_inmobiliaria` | `text`                                                                 | folio de matrícula, cuando exista         |
| `area_privada`           | `numeric(14,4)`                                                        | → `UNIT.AREA_PRIVATE` (`01 §22`)          |
| `area_comun`             | `numeric(14,4)`                                                        | área común imputada a este inmueble       |
| `estado`                 | `enum(activo, inactivo)`                                               |                                           |

### `zonas_comunes` — inventario, fuera de la cadena de cálculo

| Columna                     | Tipo                                                                         | Reglas                                    |
| --------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `tenant_id`                 | `uuid` FK → `tenants`                                                        |                                           |
| `codigo`                    | `text` NOT NULL                                                              | `UNIQUE(tenant_id, codigo)`               |
| `nombre`                    | `text` NOT NULL                                                              | piscina, salón comunal, ascensor torre A… |
| `tipo`                      | `enum(recreativa, tecnica, transito, servicio, parqueadero, deposito, otra)` |                                           |
| `area`                      | `numeric(14,4)`                                                              |                                           |
| `uso_exclusivo_inmueble_id` | `uuid` FK → `inmuebles` **nullable**                                         | ver §4.3.1                                |

**Restricción (R6):** ninguna FK desde `liquidacion_lineas` ni desde ninguna estructura de
allocation puede apuntar a `zonas_comunes`. Verificado por test, no solo por convención.

## 4.3.1 Parqueaderos y depósitos — las dos formas

Decisión: **depende de cada copropiedad**, y el esquema soporta ambas.

```text
FORMA A · propiedad privada independiente
   → fila en `inmuebles` con tipo = parqueadero | deposito
   → tiene coeficiente propio en el coeficiente_set
   → recibe sus propias líneas de liquidación

FORMA B · bien común de uso exclusivo
   → fila en `zonas_comunes` con tipo = parqueadero | deposito
   → `uso_exclusivo_inmueble_id` apunta al inmueble que lo usa
   → SIN coeficiente propio · SIN línea de liquidación propia
   → el cobro recae en el inmueble asignado
```

El administrador elige la forma al dar de alta el bien, según el reglamento de propiedad
horizontal de esa copropiedad. **Un mismo bien nunca existe en las dos tablas** — validar
por constraint, no por convención.

### `coeficiente_sets` y `coeficientes`

El coeficiente **es versionado**: cambia por reforma del reglamento y las liquidaciones
históricas deben conservar el vigente en su momento (`16 §111`).

```text
coeficiente_sets(tenant_id, version, vigente_desde, vigente_hasta, estado, suma_total)
coeficientes(set_id, inmueble_id, valor numeric(12,10))
   UNIQUE(set_id, inmueble_id)
```

`16 §82` advierte con acierto: **no asumir** `suma_total = 1.0`. Se persiste el valor real
y se valida contra la policy de la copropiedad (ver GAP-12, §7).

### `propietarios` — datos, no usuarios (AD-26)

```text
propietarios(tenant_id, tipo_documento, numero_documento, nombre, email, telefono)
   UNIQUE(tenant_id, tipo_documento, numero_documento)
inmueble_propietario(inmueble_id, propietario_id, porcentaje, desde, hasta)
```

Sin FK a `auth.users`. Sin política RLS propia. Se leen a través del tenant.

### `periodos`

| Columna                      | Tipo                                                | Reglas                                    |
| ---------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `tenant_id`                  | `uuid` FK                                           |                                           |
| `anio` / `mes`               | `int`                                               | `UNIQUE(tenant_id, anio, mes)` (`16 §13`) |
| `estado`                     | `enum(abierto, en_liquidacion, cerrado, bloqueado)` | `16 §14-16`                               |
| `fecha_vencimiento`          | `date`                                              | `16 §58`                                  |
| `cerrado_at` / `cerrado_por` |                                                     | `16 §93`                                  |

Transiciones válidas (`24 §24`) — cualquier otra se rechaza:

```text
abierto → en_liquidacion → cerrado → bloqueado
cerrado → abierto   solo vía reapertura autorizada y auditada (16 §94)
```

### `conceptos` — el ítem de cobro facturable

Es el punto donde el lenguaje se conecta con el dominio.

| Columna        | Tipo                                                   | Reglas                                                              |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `tenant_id`    | `uuid` FK                                              |                                                                     |
| `codigo`       | `text` NOT NULL                                        | `UNIQUE(tenant_id, codigo)` (`16 §18`)                              |
| `nombre`       | `text` NOT NULL                                        |                                                                     |
| `tipo_base`    | `enum(fijo, coeficiente, cantidad, porcentaje, saldo)` | `16 §20-25`                                                         |
| `modo_calculo` | `enum(directo, distribucion)` NOT NULL                 | **ver §4.3.2** — resuelve la incompatibilidad entre `16 §22` y `19` |
| `formula_ael`  | `text`                                                 | fuente AEL — nullable mientras `tipo_base` la resuelva              |
| `prioridad`    | `int` NOT NULL                                         | desempate del orden topológico (`18 §59`)                           |
| `estado`       | `enum(borrador, activo, archivado)`                    |                                                                     |
| `version`      | `int` NOT NULL                                         | `16 §19`, inmutable una vez usado en liquidación                    |

### `politicas_financieras` — parámetros configurables y versionados

Implementa `16 §95-96` (POLICY / POLICY VERSION) y `19 §72-73` (POLICY VERSION / POLICY
HASH). El corpus ya previó este mecanismo; aquí se materializa.

**Principio:** ningún parámetro normativo se codifica como constante en el motor. Todos
viven aquí, versionados, y entran en el Snapshot (`17`) — si cambian, las liquidaciones
pasadas conservan la política vigente en su momento.

| Columna                           | Tipo                                            | Reglas                                          |
| --------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `tenant_id`                       | `uuid` FK                                       |                                                 |
| `version`                         | `int` NOT NULL                                  | `UNIQUE(tenant_id, version)`                    |
| `estado`                          | `enum(borrador, vigente, historica)`            | una sola `vigente` por tenant                   |
| `vigente_desde` / `vigente_hasta` | `date`                                          |                                                 |
| `redondeo_modo`                   | `enum(half_up, half_even, down, up)`            | default `half_up`                               |
| `redondeo_escala`                 | `int`                                           | default `0` (pesos enteros)                     |
| `residual_metodo`                 | `enum(mayor_resto)`                             | default `mayor_resto`                           |
| `imputacion_orden`                | `jsonb`                                         | orden de aplicación de pagos (§6.3)             |
| `interes_tasa_mensual`            | `numeric(8,6)`                                  |                                                 |
| `interes_tope_mensual`            | `numeric(8,6)`                                  | tope legal aplicable                            |
| `interes_dias_gracia`             | `int`                                           | default `0`                                     |
| `fondo_imprevistos_porcentaje`    | `numeric(6,4)`                                  |                                                 |
| `fondo_imprevistos_base`          | `enum(presupuesto_anual, cuota_administracion)` |                                                 |
| `coeficientes_suma_esperada`      | `numeric(12,10)`                                | default `1.0`                                   |
| `policy_hash`                     | `text` NOT NULL                                 | `19 §73`, calculado sobre el contenido canónico |

Una política en estado `vigente` o `historica` es **inmutable**. Cambiar = versión nueva.
`policy_hash` forma parte de la provenance del resultado (`20 §54`).

> **Etapa de gestión.** En **F3** los valores se cargan por _seed_ con los defaults de §6.
> La **UI de administración de políticas llega en F6**; hasta entonces se ajustan por
> migración o seed. El motor los lee de esta tabla desde el primer día — nunca de
> constantes.

### `presupuestos` — **anual**, entidad de dominio

El presupuesto es **input de cálculo**: entra en el Snapshot (`17`) y queda sujeto a
inmutabilidad histórica (`16 §111`). Si la asamblea lo modifica a mitad de año, las
liquidaciones ya emitidas conservan la versión vigente en su momento.

| Columna                           | Tipo                                         | Reglas                                                   |
| --------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `tenant_id`                       | `uuid` FK                                    |                                                          |
| `anio`                            | `int` NOT NULL                               | ejercicio anual                                          |
| `version`                         | `int` NOT NULL                               | una revisión de asamblea crea versión nueva, no modifica |
| `estado`                          | `enum(borrador, aprobado, vigente, cerrado)` |                                                          |
| `monto_total`                     | `numeric(18,2)` NOT NULL                     | = Σ rubros, validado                                     |
| `acta_asamblea`                   | `text`                                       | referencia del acta que lo aprueba                       |
| `fecha_aprobacion`                | `date`                                       |                                                          |
| `vigente_desde` / `vigente_hasta` | `date`                                       |                                                          |

```sql
UNIQUE (tenant_id, anio, version)
-- Un solo presupuesto vigente por (tenant, anio) simultáneamente
CREATE UNIQUE INDEX ON presupuestos (tenant_id, anio) WHERE estado = 'vigente';
```

Un presupuesto en estado `vigente` o `cerrado` es **inmutable**. Corregir = versión nueva.

### `presupuesto_rubros`

| Columna          | Tipo                                                                                        | Reglas                           |
| ---------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| `presupuesto_id` | `uuid` FK ON DELETE CASCADE                                                                 |                                  |
| `codigo`         | `text` NOT NULL                                                                             | `UNIQUE(presupuesto_id, codigo)` |
| `nombre`         | `text` NOT NULL                                                                             |                                  |
| `categoria`      | `enum(administracion, vigilancia, aseo, mantenimiento, servicios_publicos, seguros, otros)` |                                  |
| `monto_anual`    | `numeric(18,2)` NOT NULL                                                                    |                                  |

**Los rubros construyen el presupuesto; no llegan a la factura.** Todo agrega en un único
concepto `CUOTA_ADMIN` (decisión cerrada). El propietario ve una sola línea de cuota de
administración con el total.

> **Ejecución presupuestal — diseñada y pospuesta.** Los rubros son entidades estables con
> identidad propia precisamente para poder recibir después una tabla `gastos`
> (`rubro_id`, proveedor, factura, monto, fecha). **Esa tabla NO se crea en esta fase.**
> No implementar comparativo presupuestado vs ejecutado, proveedores ni causación.

### Dominio Fondos (GAP-22 — supera el corte de GAP-15)

> **El corte original de GAP-15** (`fondos(tipo enum(imprevistos,otro), nombre, saldo_actual)` +
> `fondo_movimientos(tipo enum(aporte,uso), …)`) **queda superado por GAP-22**. Se conserva aquí
> como historia: era correcto para lo que F2 necesitaba —un contenedor con saldo derivado— pero
> no representa un fondo con destinación específica. Diagnóstico que motiva la reapertura:
> `ANALISIS_FONDOS_BLOQUE_A.md`. Decisiones estructurales: **D-36** y **D-37**.

Un **Fondo** es una estructura de control y destinación de recursos de la copropiedad, definida
por una finalidad, reglas de alimentación, autorización, vigencia y trazabilidad. **No** es una
cuenta bancaria, ni una cuenta contable, ni una cuota, ni un rubro presupuestal, ni una reserva
patrimonial.

**Naturaleza contable — cerrada y no reabierta por GAP-22:** el fondo no es pasivo ni
patrimonio, es **efectivo restringido** (CTCP Concepto 0146/2025; ver
`Casos de uso/Contabilidad/PC_01_Plantilla_PUC_Propiedad_Horizontal.md` §3.2). Los grupos
PUC `27` y `32` están retirados (`contable_codigo_retirado`). La trazabilidad la da la
**dimensión `fondo_id`**, no una cuenta por fondo.

```text
fondos(tenant_id, codigo, nombre, naturaleza, tipo_id, estado, objetivo, destinacion,
       permanente, meta, fecha_inicio, fecha_fin, saldo_actual, contable_cuenta_id,
       documento_principal_id)
   UNIQUE(tenant_id, codigo)
   UNIQUE(tenant_id) WHERE naturaleza = 'imprevistos'

fondo_autorizaciones(fondo_id, organo_id, tipo_decision, numero_acta, fecha_acta,
                     decision, alcance, vigencia_desde, vigencia_hasta, documento_id)

fondo_fuentes(fondo_id, tipo_fuente_id, base_calculo, porcentaje, valor, periodicidad,
              vigencia_desde, vigencia_hasta, autorizacion_id, documento_id)

fondo_compromisos(fondo_id, concepto, monto, monto_ejecutado, fecha, fecha_limite,
                  estado, beneficiario_tercero_id, solicitud_id, documento_id)

fondo_solicitudes_uso(fondo_id, solicitante_id, fecha, objetivo, monto_solicitado,
                      justificacion, estado, aprobador_id, fecha_aprobacion, documento_id)

fondo_movimientos(fondo_id, tipo, monto, fecha, periodo_id, liquidacion_id, pago_id,
                  solicitud_id, compromiso_id, extracto_linea_id, documento_id,
                  autorizacion_id, reversion_de_id, origen, descripcion,
                  autorizado_por, created_at)
   append-only — sin UPDATE ni DELETE (se mantiene tal cual de F2)
```

**`naturaleza` vs `tipo_id` — la distinción que exige el Modelo Maestro §2.1/§4.**
`naturaleza` es un enum de dos valores (`imprevistos`, `destinacion_especifica`) porque
**gatilla lógica real**: unicidad por copropiedad, reglas de la Ley 675 art. 35 (porcentaje
mínimo sobre el presupuesto anual, suspensión de cobro al 50 %, excepción VIS/VIP ≤5 unidades
de la Ley 2079/2021) y la competencia de la Asamblea del art. 38.11. Pasa la carga de la prueba
de **D-24**. `tipo_id` es el vocabulario descriptivo —proyecto, obra, mantenimiento, renovación,
especial— y vive en `lista_tipos` (familia `TIPO_FONDO`), parametrizable por copropiedad.
**Un fondo de destinación específica nunca hereda las reglas del de imprevistos.**

**Tres saldos, no uno** (Modelo §15/§49):

```text
saldo       = Σ fondo_movimientos (con signo según tipo)
comprometido = Σ fondo_compromisos vigentes − ejecutado
disponible   = saldo − comprometido
```

`fondos.saldo_actual` es **caché materializado, no fuente de verdad** (`20 §18`). La fuente es
`fn_fondo_saldos(fondo_id)`. Existe función de reconciliación y el campo deja de ser escribible
fuera del trigger (D-36). **R8** pasa a exigir además que la reconciliación no encuentre
divergencia.

**Alimentación.** El porcentaje y la base viven en `politicas_financieras`
(`fondo_imprevistos_porcentaje`, `fondo_imprevistos_base`) y, para los demás fondos, en
`fondo_fuentes`. Configurables por copropiedad. La Ley 675 exige constituir el fondo de
imprevistos y fija un mínimo referido al presupuesto anual; el valor concreto lo define cada
copropiedad según su reglamento y lo aprobado en asamblea. **Ningún parámetro legal se codifica
como constante.**

**Fuera de alcance de GAP-22**, por depender de dominios que AQUILA no tiene todavía —se
modelan como referencias nullables, nunca se simulan:

- **Uso → CxP → pago saliente → banco.** No existen cuentas por pagar ni pagos salientes
  (`pagos` es entrante por construcción: `monto > 0` + `inmueble_id NOT NULL`). Un uso ejecutado
  registra el movimiento y su soporte documental, y deja `pago_id` nulo.
- **Instrumentos financieros / CDT** y, por tanto, **rendimientos** con conciliación propia.
  El tipo de movimiento `rendimiento` existe; su origen bancario queda pendiente.
- **Proyectos.** `meta` y `% avance financiero` sí se calculan; no hay entidad proyecto.

## 4.3.2 `modo_calculo` — corrección derivada del Paso 0

`16 §22` (`amount = base × coefficient`, por inmueble) y `19 §4-7` (allocation con
residual, `Σ = sourceAmount`) **producen resultados distintos**. Demostrado numéricamente
en `paso0/INFORME_PASO_0.md §2.2`: la fórmula por inmueble sobre-asigna 1 peso sobre una
fuente de 8.333.333 COP entre 6 inmuebles.

Ambos modos son legítimos, pero el concepto debe declarar cuál usa:

```text
directo        el importe del inmueble es independiente; no hay total que conservar
               ej. cuota = área × tarifa_m2  (01 §52)
               la fórmula AEL devuelve el importe DEL INMUEBLE

distribucion   existe un total que debe conservarse exactamente
               ej. presupuesto mensual repartido por coeficiente
               la fórmula AEL devuelve el TOTAL A REPARTIR
               el reparto lo hace el motor de allocation de 19
```

**Regla vinculante:**

```text
modo_calculo = 'distribucion'  ⇒  el importe por inmueble SOLO puede provenir del
                                   motor de allocation. Prohibido calcularlo en la
                                   fórmula AEL. Verificado por test.
```

`CUOTA_ADMIN` es `distribucion`. Por eso su regla piloto devuelve el monto anual a
recuperar, no la cuota de un inmueble.

### `novedades`, `pagos`, `liquidaciones`, `liquidacion_lineas`, `saldos`

Se especifican en detalle durante F2 siguiendo `16 §26-30` (novedad), `16 §69-71` (pago),
`20 §5-18` (resultado y líneas). Restricciones ya fijadas:

```text
liquidaciones      UNIQUE(tenant_id, periodo_id, intento)   ← idempotencia 16 §84-85
liquidacion_lineas append-only; sin UPDATE ni DELETE        ← 20 §9
saldos             derivados, nunca fuente de verdad        ← 20 §18
pagos              inmutables; la corrección es un ajuste nuevo ← 16 §68
```

## 4.4 RLS

Aislamiento en `tenant_id`, reutilizando los helpers de Fase I §6.1 (`is_member`,
`has_role`, `current_tenant_id`), todos `SECURITY DEFINER STABLE SET search_path`.

```text
SEC-11  Un usuario del tenant A obtiene 0 filas de toda tabla de dominio del tenant B.
SEC-12  Ninguna tabla de dominio sin tenant_id.
SEC-13  Ninguna tabla de dominio sin RLS ENABLE + FORCE.
SEC-14  liquidacion_lineas y audit_log rechazan UPDATE y DELETE para todo rol.
```

Ventaja de AD-24: al coincidir la frontera de aislamiento con la unidad de liquidación,
**ninguna consulta de liquidación cruza tenants**. No existe agregación cross-tenant
legítima en el motor.

---

# 5. Plan de implementación

## 5.1 Estructura de pistas

```text
PASO 0 ─── validación del diseño, sin código
   │
   ▼
F0 Fundación   (bloqueante para todo)
   │
   ▼
F1 Identidad   (Fase I)
   │
   ▼
F2 Dominio PH  (esquema §4)
   │
   ├───────────────────────┬───────────────────────┐
   ▼                       ▼                       │
PISTA A                 PISTA B                    │  ← en paralelo
F3 Kernel financiero    F4 AEL v0                  │
   │                       │                       │
   └───────────┬───────────┘                       │
               ▼                                   │
        F5 Orquestación  ←────────────────────────┘
               │
               ▼
        F6 Superficie de aplicación
               │
               ▼
        F7 Hardening y producción
```

## 5.2 Paso 0 — antes de escribir código

Barato (días), y ataca directamente el hueco de `ANALISIS §3.7`.

```text
□ Escribir a mano, como texto AEL, las tres reglas piloto que el corpus ya nombra
  en 01 §57 FASE 8:   CUOTA_BASICA · CUOTA_CON_DESCUENTO · INTERES_MORA
□ Verificar que la gramática de 02 las expresa sin ampliarla
□ Construir el golden case GC-001: una copropiedad de 6-10 inmuebles, un periodo completo,
  partiendo de un PRESUPUESTO ANUAL aprobado, con coeficientes, CUOTA_ADMIN prorrateada,
  aporte al fondo de imprevistos, una novedad a mitad de periodo, un pago parcial
  e interés de mora
□ Verificar a mano el doble redondeo de §6.5: Σ 12 cuotas mensuales = presupuesto anual
□ Incluir al menos una zona común en el inventario y verificar que NO produce línea (R6)
□ Calcularlo a mano y hacerlo firmar por el responsable funcional
□ Registrar los importes esperados inmueble por inmueble
```

**GC-001 es el contrato ejecutable del motor.** Sin él, `23 §33` y `24 §20` son
inaplicables porque exigen golden cases reproducibles que nunca se escribieron.

Salida del Paso 0: validación del diseño del lenguaje **y** vectores de prueba del kernel.

## 5.3 Fases

| Fase       | Alcance                                                                                                | Entregable demostrable                                          | Docs             |
| ---------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------- |
| **F0**     | Monorepo, TS strict, lint, Supabase local, CI, generación de tipos                                     | build verde reproducible                                        | `15`, Fase I E0  |
| **F1**     | Auth, tenants, membresías, RBAC, RLS, invitaciones, dashboard base                                     | login + aislamiento probado                                     | **Fase I** E1–E6 |
| **F2**     | Esquema de dominio PH (§4) + RLS + seeds de GC-001                                                     | GC-001 cargado en BD                                            | §4, `16 §6-30`   |
| **F3** ⟨A⟩ | Money, Decimal, RoundingPolicy, allocation con residual, invariantes                                   | golden cases numéricos verdes, sin BD ni lenguaje               | `16`, `19`       |
| **F4** ⟨B⟩ | AEL v0: léxico, gramática, tipos, dimensiones, evaluador, diagnósticos                                 | las 3 reglas piloto evalúan correctamente                       | `01-03`, `07`    |
| **F5**     | Snapshot, grafo, plan de cálculo, resultado, trace, validación, finalización                           | **primera liquidación real reconciliada**                       | `17`, `18`, `20` |
| **F6**     | API, UI de conceptos y fórmulas, presupuesto, **políticas financieras**, liquidación, estado de cuenta | administrador liquida un periodo y ajusta políticas desde la UI | `11`, `10`       |
| **F7**     | Rate limiting, observabilidad, concurrencia, E2E, recuperación                                         | gates de `24`                                                   | `13`, `09`, `24` |

## 5.4 Puertas de salida

```text
F1 → F2   tests RLS SEC-03/04/10 en verde                (la seguridad no se retrofitea)
F2 → F3   GC-001 persistido y consultable
F3 → F5   GC-001 reconcilia con importes firmados, sin epsilon
F4 → F5   las 3 reglas piloto evalúan y producen diagnósticos deterministas
F5 → F6   liquidación completa reproducible: mismo snapshot ⇒ mismo resultHash
F6 → F7   flujo E2E completo desde la UI
```

**F3 y F4 pueden desarrollarse simultáneamente.** Su única frontera es que F4 delega toda
aritmética monetaria en F3 (§3, regla de frontera). Si F3 aún no existe, F4 trabaja contra
la interfaz de `FinancialOperationService`, no contra una implementación propia.

---

# 6. Parámetros financieros — valores iniciales

Cierran D-03 a D-06. **No son constantes del motor**: son los valores con que se siembra
`politicas_financieras` v1 (§4.3). El motor siempre los lee de esa tabla.

```text
F3        seed con estos valores          → el motor arranca sin bloqueo
F6        UI de administración de políticas → el administrador los ajusta
siempre   versionados y en el Snapshot     → las liquidaciones pasadas no cambian
```

Cambiar un valor altera golden cases y exige `24 §20` (análisis de impacto, revisión de
regla, aprobación, actualización de tests) — pero **ya no bloquea la construcción**.

## 6.1 Redondeo — cierra `16 §44-45`

```text
Modo            HALF_UP
Escala COP      0 decimales (pesos enteros)
Ubicación       POR LÍNEA  (concepto × inmueble)
Totales         suma exacta de líneas ya redondeadas
```

**Justificación de la ubicación** — no es arbitraria. `16 §80` exige como invariante
`sum(lines) = subtotal`. Si se redondea en el total, las líneas no suman al total y el
invariante se rompe por construcción. Redondear por línea es la **única** ubicación
compatible con `16 §80`.

**Justificación del modo:** `HALF_UP` es la convención comercial y contable esperada en
Colombia y es explicable a un copropietario. `HALF_EVEN` reduce el sesgo sistemático pero
sorprende a contabilidad y es difícil de justificar en una reclamación.

## 6.2 Residual — cierra `19 §26-30`

```text
Método              mayor resto (largest remainder)
Orden               remainder DESC
Desempate           targetId canónico ASC
Unidad de reparto   1 peso (mínima denominación)
Residual máximo     |residual| ≤ nTargets × 1 peso
Si se excede        ERROR de reconciliación — nunca corrección silenciosa
```

Es exactamente lo que `19 §27-30` recomienda, elevado de _recomendado_ a **obligatorio**.

## 6.3 Imputación de pagos — cierra `16 §71`

```text
1. Intereses de mora        (periodo más antiguo primero)
2. Capital / cuotas         (periodo más antiguo primero)
3. Otros conceptos          (periodo corriente, por prioridad de concepto)
4. Excedente → saldo a favor (crédito, 16 §74)
```

**Base:** el Código Civil colombiano (art. 1653) establece que el pago se imputa primero
a intereses y después a capital, salvo consentimiento del acreedor.

Valor inicial de `politicas_financieras.imputacion_orden`. **Configurable por copropiedad**
—el reglamento de PH puede establecer otro orden— y ajustable desde la UI en F6.

## 6.4 Invariante financiero — cierra `16 §79`

Convención de signo interna (`20 §30`): cargos positivos, créditos y pagos negativos.

```text
totalInmueble(periodo) =
      saldoAnterior
    + cargosConcepto        (ordinarias, extraordinarias, prorrateos)
    + cargosManuales        (débitos y ajustes positivos)
    + interesesMora
    − descuentos            (pronto pago)
    − creditos              (notas crédito, ajustes negativos)
    − pagosAplicados
```

Reconciliaciones obligatorias, **sin tolerancia epsilon** (`19 §94`):

```text
R1  Σ allocationEntries        = sourceAmount
R2  pago.monto                 = aplicado + noAplicado
R3  totalInmueble              = Σ líneas de ese inmueble
R4  tenantTotal(periodo)       = Σ totalInmueble          ← 20 §39, correcto bajo AD-24
R5  Σ coeficientes del set     = suma_total registrada
R6  ninguna zona común es target de allocation ni sujeto de línea   ← §4.1.1
R7  Σ 12 cuotas mensuales      = presupuesto.monto_total            ← §6.5
R8  fondo.saldo_actual         = Σ fondo_movimientos                ← §4.3
R9  fondo.disponible           = saldo − comprometido, y nunca negativo   ← §4.3, GAP-22
```

Cualquier fallo de R1–R9 → `detect → report → block` (`0AEL §20`). Prohibido ajustar el
resultado para que cuadre.

## 6.5 Del presupuesto anual a la cuota mensual — doble redondeo

El presupuesto es **anual** y la cuota es **mensual**. Eso introduce **dos** puntos de
redondeo encadenados, y el orden importa:

```text
presupuesto_anual
      │
      ├─ (1) reparto en 12 periodos     ← primer redondeo
      │
      ▼
 cuota_mensual
      │
      ├─ (2) prorrateo entre inmuebles por coeficiente   ← segundo redondeo
      │
      ▼
 línea de liquidación por inmueble
```

**Riesgo si se hace ingenuamente:** `monto_anual / 12` redondeado y multiplicado por 12
**no** devuelve el monto anual. Se pierden o sobran pesos y el presupuesto no cuadra
contra lo recaudado.

**Decisión:** ambos pasos usan el **mismo motor de allocation con mayor resto** de §6.2.

```text
Paso 1   allocation(monto_anual, targets = 12 periodos, basis = equal share)
Paso 2   allocation(cuota_mensual, targets = inmuebles, basis = coeficiente)
```

Invariante nuevo:

```text
R7   Σ de las 12 cuotas mensuales = presupuesto.monto_total   (exacto, sin epsilon)
```

Así el residual del reparto anual se distribuye de forma determinista entre los meses en
lugar de perderse, y el presupuesto cuadra por construcción.

## 6.6 Interés de mora

```text
Base            saldo vencido de capital (no compone sobre intereses)
Día de conteo   días calendario
Devengo         diario, desde el día siguiente al vencimiento
Gracia          parametrizable por copropiedad, default 0 días
```

La tasa y su tope viven en `politicas_financieras` (`interes_tasa_mensual`,
`interes_tope_mensual`, `interes_dias_gracia`). **Configurables por copropiedad**,
ajustables desde la UI en F6.

En Colombia el interés moratorio está limitado por la tasa de usura certificada por la
Superintendencia Financiera, que cambia periódicamente. El motor aplica el tope que
encuentre en la política vigente y **registra en el trace cuándo lo aplicó** — de modo que
un cobro topado sea auditable. La actualización del valor es tarea operativa, no de
código.

---

# 7. Gaps abiertos

| ID         | Gap                                                                                                                                                                                                                                                                                    | Bloquea            | Propuesta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~GAP-12~~ | ~~Suma de coeficientes~~                                                                                                                                                                                                                                                               | —                  | **CERRADO**: `politicas_financieras.coeficientes_suma_esperada`, default `1.0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ~~GAP-14~~ | ~~Tope de interés moratorio~~                                                                                                                                                                                                                                                          | —                  | **CERRADO**: `interes_tope_mensual` en políticas, configurable (§6.6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ~~GAP-15~~ | ~~Fondo de imprevistos~~                                                                                                                                                                                                                                                               | —                  | **CERRADO**: concepto separado con saldo acumulado propio (§4.3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ~~GAP-18~~ | ~~% del fondo de imprevistos~~                                                                                                                                                                                                                                                         | —                  | **CERRADO**: `fondo_imprevistos_porcentaje` en políticas, configurable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **GAP-16** | Impuestos: ¿aplican a cuotas de administración en el alcance inicial?                                                                                                                                                                                                                  | F3                 | Modelar `tipo_base` pero no implementar cálculo tributario en v0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **GAP-17** | Vista consolidada de varias copropiedades (cartera de un administrador) — es cross-tenant                                                                                                                                                                                              | Post-F6            | Fuera de alcance. Si se requiere, diseño explícito; nunca relajar SEC-03                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **GAP-19** | Reapertura de "todo agrega en un único concepto `CUOTA_ADMIN`" (línea 424) — motivada por `Docs/Motor presupuestal/AQUILA_SAAS_E16_...md`: arts. 25/31 Ley 675 exigen destinación sectorial y fuentes de financiación distintas de la cuota, algo irrepresentable con un solo concepto | Motor Presupuestal | **Adoptado, físico**: `fuente_financiacion`/`fundamento_normativo` (20260814200000_motor_presupuestal_financiacion.sql, tests/rls/motor-presupuestal-financiacion.test.ts); capa de exposición RPC+Edge Function+UI (`fn_registrar_fuente_financiacion`, `presupuesto-financiacion`, `apps/web/app/pages/presupuesto`); previsualización de distribución reutilizando `allocate()` (`presupuesto-previsualizar`, tests/tenancy/presupuesto-previsualizar.test.ts); neteo contra `CUOTA_ADMIN` vía `PARAMETER.OTROS_INGRESOS_ANUAL` resuelto en `construirSnapshotDesdeSupabase` desde Σ `fuente_financiacion` (20260815000000_seed_gc001_otros_ingresos.sql, tests/liquidacion/gc001-snapshot.test.ts); UI de `fundamento_normativo` (`apps/web/app/pages/fundamentos`). **GAP-19 cerrado por completo** |
| **GAP-20** | Estados intermedios de aprobación presupuestal (`en_preparacion`/`propuesto`/`presentado`, arts. 35/38 Ley 675)                                                                                                                                                                        | —                  | **Diferido** (E-16 §12.2): GC-001 no ejercita ciclo de asamblea real; se retoma cuando exista esa necesidad concreta. `presupuesto_estado_t` se mantiene en 4 valores por ahora                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **GAP-21** | Sectorización y módulos de contribución (copropiedades comerciales/mixtas, art. 31 Ley 675)                                                                                                                                                                                            | —                  | **Diferido** (E-16 §12.3): GC-001 es puramente residencial; se retoma cuando exista un caso real de copropiedad mixta/comercial en el roadmap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **GAP-22** | Reapertura de §4.3 `fondos`/`fondo_movimientos`: el modelo cerrado con GAP-15 (dos tipos, dos clases de movimiento, un saldo) es irrepresentable para recursos con destinación específica — no tiene estado, ni destinación, ni autorización, ni compromiso, ni disponible. Motivada por `Casos de uso/Fondos/Modelo_Maestro_Fondos_AQUILA.md` (Ley 675 arts. 34/35/38, Ley 2079/2021, CTCP 0146/2025 y unificado 01(445)/2018) | Módulo de Fondos | **Adoptado, con alcance recortado** (D-36). Diagnóstico completo en `ANALISIS_FONDOS_BLOQUE_A.md`. Se evolucionan las tablas existentes (no se reemplazan) y se añaden `fondo_autorizaciones`, `fondo_fuentes`, `fondo_compromisos`, `fondo_solicitudes_uso`. Quedan **fuera** por depender de dominios inexistentes: uso→CxP/pago saliente, instrumentos financieros/CDT, rendimientos, proyectos. Ver §4.3 |
| **GAP-23** | Módulo de Gobierno (`Casos de uso/Gobierno/AQUILA_SAAS_Prompt_Gobierno_Decisiones_Atencion_Workflow.md`): asamblea/consejo, decisiones, compromisos, atención al propietario, workflow transversal e "Inteligencia Gerencial". Diagnóstico completo en `Casos de uso/Gobierno/INFORME_INVENTARIO_REPORTES_MODULOS_EXISTENTES.md` | Módulo de Gobierno | **Adoptado por fases, Fase 1 cerrada** (D-44): "Resumen general" en `pages/dashboard/index.vue` consolida lecturas ya existentes de Cartera/Presupuesto/Fondos/Auditoría, sin esquema nuevo. **Fases 2-5 explícitamente diferidas** hasta resolver 2 prerrequisitos reales: (a) el prompt asume Mantenimiento ya construido (Activos/OT/Proveedores/Contratos) — no existe en el repo; (b) el "portal del propietario/residente" (§38-39 del prompt) choca con AD-26 (propietarios/residentes sin login) — requiere decisión explícita del usuario antes de modelar `decision`/`commitment`/`meeting`/`quorum`. `fondo_compromisos` (GAP-22) NO es el mismo concepto que el `commitment` de Gobierno pese al nombre compartido — ver informe §5 |

**Ningún gap abierto bloquea F0–F5.** Los parámetros normativos dejaron de ser bloqueantes
al convertirse en política versionada y configurable (§4.3). GAP-16, GAP-17, GAP-20, GAP-21 y
las Fases 2-5 de GAP-23 son alcance diferido, no ambigüedad. GAP-19 queda adoptado (decisión
tomada) y con implementación física completa.

Protocolo ante gap nuevo (`0AEL §27`, sin cambios):

```text
STOP → registrar → impacto → alternativas → proponer → solicitar decisión → NO implementar
```

---

# 8. Correcciones al corpus documental

No se reescriben los docs 01–24. Se registran estas derogaciones y correcciones:

| Ref                            | Acción                                                                                     | Motivo                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `23` completo                  | **Derogado**, sustituido por §5                                                            | Contradicción de roadmaps (`ANALISIS §3.2`)      |
| `01 §57`, `01 §62`             | **Derogados**                                                                              | Roadmaps embebidos que competían con el 23       |
| `16 §6` y `16 §7`              | **Unificados** en una sola tabla `tenants`                                                 | AD-24: Tenant y Copropiedad son la misma entidad |
| `16 §44-45`                    | **Cerrado** por §6.1                                                                       | Aplazamiento bloqueante                          |
| `16 §79`                       | **Cerrado** por §6.4                                                                       | Aplazamiento bloqueante                          |
| `16 §71`                       | **Cerrado** por §6.3, sujeto a confirmación legal                                          | Aplazamiento bloqueante                          |
| `19 §26-30`                    | **Cerrado** por §6.2                                                                       | Recomendación elevada a obligatoria              |
| `12 §313-319`                  | **Cerrado** por Fase I §7 + §4.4                                                           | Modelo de roles nunca enumerado                  |
| `12` (esquema)                 | **Ampliado** por §4                                                                        | No existía esquema de dominio PH                 |
| `20 §39`                       | **Vigente sin cambios**                                                                    | Correcto bajo AD-24                              |
| `01 §43` permisos `AEL_RULE_*` | **Absorbidos** en la matriz de Fase I §7.3 como permisos del rol `agent`                   | Evitar segundo modelo de roles                   |
| `04`, `05`, `06`, `08`         | **Diferidos** — no son alcance de AEL v0                                                   | AD-21/AD-23                                      |
| `22`                           | Vigente como mecánica; **el catálogo de requisitos debe crearse** — hoy tiene 0 IDs reales | `ANALISIS §3.10`                                 |

---

# 9. Workflow y Definition of Done

Se mantiene el ciclo de `0AEL §7`, sin cambios:

```text
READ → ANALYZE → PLAN → IMPACT → IMPLEMENT → TEST → VERIFY → DOCUMENT → REPORT → COMMIT
```

## 9.1 Definition of Done por unidad de trabajo

```text
□ Alcance aprobado exacto, sin extras (21 §15)
□ Regla de autorización en UI **y** en RLS (Fase I §3.5)
□ Migración con ENABLE + FORCE RLS en la misma migración que crea la tabla
□ Tipos regenerados desde el esquema, no escritos a mano
□ Tests unit + RLS + integración en verde
□ Invariantes SEC-* y R1-R9 afectados con test que prueba la violación
□ Sin punto flotante en ninguna ruta monetaria (19 §19)
□ Sin comparación por epsilon en reconciliación (19 §94)
□ Eventos auditables emitidos
□ Sin secretos en bundle cliente ni en logs
□ tsc --noEmit · eslint · supabase db lint  → 0 errores
□ Cobertura ≥80% global · 100% en kernel financiero y evaluador AEL
□ Contrato público documentado (entrada, salida, errores)
□ Commit atómico trazable
```

## 9.2 Prohibiciones que no admiten excepción

```text
✗ float / number / parseFloat en cualquier ruta monetaria
✗ epsilon en reconciliación
✗ ajustar un resultado para que un test pase
✗ modificar un golden case para acomodar la implementación
✗ aritmética monetaria fuera del kernel financiero
✗ declarar DONE sin evidencia (0AEL §28)
✗ inventar tablas, roles, permisos, fórmulas o políticas no cerradas aquí
✗ crear un `CREATE TYPE ... AS ENUM` sin `COMMENT ON TYPE` que justifique por
  qué gatilla lógica/transición de estado (si es vocabulario descriptivo,
  usar `lista_tipos` en vez de un enum nuevo) — D-24, DECISIONES.md. Un
  bloque de DDL con `enum` dado como ejemplo en un documento de diseño
  (`CAR_00_Guia_Oficial.md` u otro) no exime de esta evaluación.
```

---

# 10. Primera respuesta esperada del agente

Antes de implementar, diagnóstico breve (`0AEL §42`):

```text
Repositorio detectado
Stack detectado
Estado actual
Documentos detectados
Fase actual y puerta de entrada
Bloqueos
Primera acción recomendada
```

**Primera acción esperada:** Paso 0 (§5.2) — escribir las tres reglas piloto y GC-001.
No comenzar F0 sin haber verificado que la gramática de `02` expresa los tres casos.

---

# 11. Resumen para el agente

```text
Construyes un SaaS multi-tenant de administración de propiedad horizontal.

tenant = COPROPIEDAD. Es la frontera de aislamiento, la unidad de liquidación
y la unidad de facturación del SaaS. No existe entidad "administradora":
quien gestiona varias copropiedades tiene una membresía por cada una y conmuta.

Dentro de la copropiedad hay INMUEBLES y ZONAS COMUNES, y no son lo mismo:
el inmueble es destino de cobro y tiene coeficiente; la zona común es
inventario descriptivo y NUNCA produce una línea de liquidación (R6).
Su sostenimiento se cubre vía el concepto CUOTA_ADMIN, que es un ítem de
cobro más, con su propia fórmula.

Tres capas: kernel financiero y lenguaje son independientes y van en
paralelo; la orquestación consume ambos y va después.

AEL v0 es un EVALUADOR DE EXPRESIONES. Sin MIENTRAS, sin compilador,
sin bytecode, sin VM. Conserva tipos, dimensiones, determinismo y auditoría.

Los propietarios son datos, no usuarios. No tienen cuenta ni login.

La seguridad vive en la base de datos. El frontend es experiencia de usuario;
RLS es la barrera real.

Ningún parámetro normativo se codifica como constante: redondeo, residual,
imputación de pagos, tasas de interés y fondo de imprevistos viven en
`politicas_financieras`, versionadas y dentro del Snapshot. En F3 se siembran
con defaults; en F6 el administrador las ajusta desde la UI.

El dinero nunca toca un float. La reconciliación nunca usa epsilon.
Si algo no cuadra: detectar, reportar, bloquear. Jamás ajustar.

Empiezas por el Paso 0: tres reglas piloto y un golden case firmado.
Sin eso no hay contra qué verificar nada.

Terminado = Definition of Done completa con evidencia, no "compila".
```

---

# 12. Trazabilidad de requisitos

Cierra el gap de gobierno detectado en la auditoría de `Docs/01–24` contra el
código real (2026-08-15): Doc 22 pide una matriz `Requisito → Documento →
Componente → Implementación → Test → Evidencia` con IDs estables
`REQ-<DOMAIN>-NNN`. Este proyecto ya tiene un esquema de decisión vivo
(`AD-xx`/`GAP-xx`, §1 y §7) que cumple gran parte del mismo propósito — este
apartado no lo sustituye, le añade el namespace de requisito y el mapeo a
test que Doc 22 exige y que `AD-xx`/`GAP-xx` no traían por sí solos.

## 12.1 Convención

```text
REQ-<DOMAIN>-NNN
```

Dominios en uso: `LIQ` (motor de liquidación de conceptos), `PAGO`
(imputación de pagos), `MORA` (interés de mora), `NOVEDAD` (ajustes/novedades
con aprobación), `SEC` (seguridad/aislamiento). Un requisito no cambia de
dominio ni se reutiliza su número — si su alcance cambia sustancialmente, se
marca `Deprecated` y se abre uno nuevo (`21 §31`/`22 §76`).

## 12.2 Matriz

| REQ             | Descripción                                                                                                                         | Documento propietario | AD/GAP | Implementación                                                                               | Test                                                                                                   | Estado   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| REQ-LIQ-001     | R1: Σ allocationEntries = sourceAmount, sin epsilon                                                                                 | `19`                  | —      | `packages/financial-kernel/src/allocation.ts::verificarSumaReconciliada`                     | `packages/financial-kernel/src/allocation.test.ts`                                                     | Accepted |
| REQ-LIQ-002     | R3/R4: totalInmueble y tenantTotal reconcilian por suma                                                                             | `20 §39`, §6.4        | AD-25  | `packages/liquidation-engine/src/result.ts::ensamblarResultado`                              | `packages/liquidation-engine/src/golden-case-gc001.test.ts`                                            | Accepted |
| REQ-LIQ-003     | R6: una zona común nunca produce línea de liquidación                                                                               | §4.1.1                | —      | `construirSnapshotDesdeSupabase` (solo `inmuebles`, nunca `zonas_comunes`)                   | `tests/rls/schema-forced-rls.test.ts`                                                                  | Accepted |
| REQ-LIQ-004     | R7: Σ 12 cuotas mensuales = presupuesto.monto_total                                                                                 | §6.5                  | —      | `packages/liquidation-engine/src/executor.ts` (doble reparto anual→periodo)                  | `tests/liquidacion/gc001-snapshot.test.ts`                                                             | Accepted |
| REQ-LIQ-005     | R8: fondo.saldo_actual = Σ fondo_movimientos                                                                                        | §4.3                  | GAP-15 | trigger `recalcular_saldo_fondo`                                                             | `tests/rls/domain-isolation.test.ts`                                                                   | Accepted |
| REQ-PAGO-001    | R2: pago.monto = aplicado + noAplicado, sin épsilon                                                                                 | Docs/19 Payment       | AD-34  | `packages/liquidation-engine/src/cuenta-corriente.ts::imputarPago`                           | `packages/liquidation-engine/src/cuenta-corriente.test.ts`                                             | Accepted |
| REQ-PAGO-002    | Estrategia de imputación configurable por política                                                                                  | —                     | AD-36  | `imputarPago` (parámetro `estrategia`) + `politicas_financieras.imputacion_estrategia`       | `tests/tenancy/registrar-pago.test.ts`                                                                 | Accepted |
| REQ-PAGO-003    | Ledger de cuenta corriente separado del motor de conceptos                                                                          | `20 §69`              | AD-31  | `supabase/migrations/20260816100000_cuenta_corriente_ledger.sql`                             | `tests/rls/cuenta-corriente.test.ts`, `tests/liquidacion/gc001-cuenta-corriente.test.ts`               | Accepted |
| REQ-MORA-001    | Interés de mora: base capital, día-cuenta calendario, gracia, tope                                                                  | §6.6                  | GAP-14 | `packages/liquidation-engine/src/cuenta-corriente.ts::calcularInteresMora`                   | `packages/liquidation-engine/src/cuenta-corriente.test.ts`                                             | Accepted |
| REQ-MORA-002    | Idempotencia entre corridas de cálculo de interés                                                                                   | —                     | —      | `obtenerUltimaFechaInteresPorCapital` (packages/liquidation-engine)                          | `tests/tenancy/calcular-intereses.test.ts`                                                             | Accepted |
| REQ-NOVEDAD-001 | Novedad con aprobación separada del motor de cálculo                                                                                | Docs/19 §284          | AD-33  | `supabase/migrations/20260816110100_fn_novedades.sql::fn_aprobar_novedad`                    | `tests/tenancy/novedades.test.ts`                                                                      | Accepted |
| REQ-NOVEDAD-002 | Signo de `novedades.monto` validado por tipo                                                                                        | Docs/19 §254          | AD-30  | `supabase/functions/crear-novedad/index.ts`                                                  | `tests/tenancy/novedades.test.ts`                                                                      | Accepted |
| REQ-MORA-003    | Day-count exacto de interés — configurable por política, en vez de fijo en código                                                   | Docs/16 §55-56        | D-23   | `politicas_financieras.interes_day_count` + `cuenta-corriente.ts::calcularInteresMora`       | `packages/liquidation-engine/src/cuenta-corriente.test.ts`                                             | Accepted |
| REQ-NOVEDAD-003 | Orden descuento-vs-interés cuando coinciden en el mismo ciclo de vida de un cargo — configurable por política                       | Docs/16 §51           | D-23   | `politicas_financieras.interes_descuento_orden` + `cuenta-corriente.ts::calcularInteresMora` | `packages/liquidation-engine/src/cuenta-corriente.test.ts`, `tests/tenancy/calcular-intereses.test.ts` | Accepted |
| REQ-SEC-001     | Escritura del ledger exclusiva de service_role (sin política INSERT/UPDATE para `authenticated` donde hay efecto colateral atómico) | `21 §30`              | —      | RLS de `pagos`/`pago_aplicaciones`/`novedades`                                               | `tests/rls/cuenta-corriente.test.ts`, `tests/rls/novedades.test.ts`                                    | Accepted |

## 12.3 Gaps sin decisión (Doc 16/19, no bloqueantes)

Identificados durante el diseño del motor de cuenta corriente, sin
implementación porque el corpus los deja explícitamente abiertos y ningún
caso de negocio real los ha exigido todavía (AD-23). Ninguno pendiente por
ahora — REQ-MORA-003 y REQ-NOVEDAD-003 (los dos únicos que había aquí) se
resolvieron y se movieron a §12.2 (D-23).

| REQ | Descripción | Origen | Estado |
| --- | ----------- | ------ | ------ |
| —   | (ninguno)   | —      | —      |

## 12.4 Mantenimiento

La matriz se actualiza junto con el cambio que introduce o modifica un
requisito (`22 §52`) — no es un ejercicio de fin de proyecto. Un cambio que
toque un `REQ` existente debe indicar en su commit/PR qué fila de §12.2
afecta; uno que introduzca un requisito nuevo le asigna el siguiente `NNN`
libre de su dominio.
