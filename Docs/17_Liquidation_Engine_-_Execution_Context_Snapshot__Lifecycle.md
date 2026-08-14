# AEL V1 — Liquidation Engine — Execution Context, Snapshot & Lifecycle

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
64 — Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md
65 — Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md
```

## 1. REFERENCIAS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REFERENCIAS

Implementa y consume:

```text
Documento 45 — Registry & Dependency Management
Documento 49 — Performance & Scalability
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 60 — Verifier & Static Safety Validation
Documento 62 — Runtime Architecture & Execution Engine
Documento 63 — Capability System & Provider Execution Contracts
```

---

## 2. OBJETIVO

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

OBJETIVO

Definir el contexto que alimenta una liquidación:

```text
ExecutionContext
        ↓
LiquidationContext
        ↓
DataSnapshot
        ↓
AEL Runtime
```

---

## 3. PROBLEMA QUE RESUELVE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PROBLEMA QUE RESUELVE

Una liquidación no debe depender de consultas que cambien arbitrariamente durante su ejecución.

Ejemplo:

```text
10:00:00 → obtiene saldo
10:00:01 → obtiene pagos
10:00:02 → cambia un pago
10:00:03 → obtiene tarifa
```

Esto puede producir un resultado internamente inconsistente.

---

## 4. PRINCIPIO

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PRINCIPIO

Una liquidación debe calcular contra:

```text
un contexto coherente
+
una versión identificable de los datos
```

---

## 5. LIQUIDATION CONTEXT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

LIQUIDATION CONTEXT

Conceptualmente:

```ts
interface LiquidationContext {
  tenantId: TenantId
  periodId: PeriodId
  snapshot: DataSnapshot
  parameters: LiquidationParameters
  executionMetadata: ExecutionMetadata
}
```

---

## 6. TENANT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

TENANT

El contexto debe identificar explícitamente:

```text
tenantId
```

No inferirlo desde una Unit, Owner o Payment.

---

## 7. PERIOD

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PERIOD

La liquidación debe identificar explícitamente:

```text
periodId
```

y, cuando sea necesario:

```text
period dates
```

---

## 8. SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT

El Snapshot representa el conjunto lógico de datos utilizado por la liquidación.

---

## 9. SNAPSHOT ID

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT ID

Debe existir un identificador estable:

```text
snapshotId
```

---

## 10. SNAPSHOT VERSION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT VERSION

Puede existir:

```text
snapshotVersion
```

cuando los datos se construyan incrementalmente.

---

## 11. SNAPSHOT HASH

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT HASH

Recomendado:

```text
snapshotHash
```

para identificar exactamente el contenido utilizado.

---

## 12. SNAPSHOT CONTENT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT CONTENT

Debe contener sólo datos necesarios para la liquidación.

No copiar toda la base de datos.

---

## 13. SNAPSHOT PRINCIPLE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT PRINCIPLE

Preferir:

```text
minimum required data
```

sobre:

```text
full tenant dump
```

---

## 14. DATA CATEGORIES

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DATA CATEGORIES

Un snapshot puede contener:

```text
Property data
Unit data
Owner data
Concept data
Rate data
Payment data
Novelty data
Parameter data
Prior balance data
```

según el proceso.

---

## 15. UNIT SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

UNIT SNAPSHOT

Debe representar los datos de Unit necesarios para calcular.

Ejemplos:

```text
unitId
coefficient
status
area
```

Sólo si están definidos como insumos de la liquidación.

---

## 16. OWNER SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

OWNER SNAPSHOT

Sólo incluir datos necesarios:

```text
ownerId
ownership relation
participation
```

según el modelo.

---

## 17. CONCEPT SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CONCEPT SNAPSHOT

Debe contener:

```text
conceptId
type
configuration
```

cuando sean inputs del cálculo.

---

## 18. RATE SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

RATE SNAPSHOT

Una Rate debe congelarse para la ejecución.

No consultar nuevamente una tarifa mutable durante el cálculo.

---

## 19. PAYMENT SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAYMENT SNAPSHOT

Los pagos considerados deben estar identificados de manera estable.

---

## 20. PAYMENT STATUS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAYMENT STATUS

El Snapshot debe conservar el estado que determinó la inclusión/exclusión del pago.

---

## 21. NOVELTY SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

NOVELTY SNAPSHOT

Novedades deben congelarse de acuerdo con las reglas del proceso.

---

## 22. PRIOR BALANCE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PRIOR BALANCE

El saldo anterior debe formar parte del snapshot si es input del cálculo.

---

## 23. PARAMETERS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PARAMETERS

Parámetros de liquidación deben estar versionados o incluidos en el snapshot.

---

## 24. PARAMETER SOURCE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PARAMETER SOURCE

Registrar:

```text
parameterId
version
value
source
```

cuando sea necesario para auditoría.

---

## 25. NO LIVE LOOKUP

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

NO LIVE LOOKUP

Una vez iniciado el cálculo:

```text
AEL
```

no debe realizar consultas dinámicas para obtener inputs que deberían pertenecer al snapshot.

---

## 26. CAPABILITY USAGE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CAPABILITY USAGE

Las Capabilities pueden utilizarse para construir el snapshot antes de la ejecución.

Ejemplo:

```text
billing.payment.read
        ↓
Snapshot Builder
        ↓
PaymentSnapshot
```

---

## 27. SNAPSHOT BUILDER

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT BUILDER

Crear:

```text
LiquidationSnapshotBuilder
```

responsable de construir un snapshot coherente.

---

## 28. SNAPSHOT BUILDER RESPONSIBILITIES

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT BUILDER RESPONSIBILITIES

Debe:

```text
collect required data
validate consistency
normalize values
freeze version references
calculate snapshot hash
```

---

## 29. SNAPSHOT BUILDER NON-RESPONSIBILITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT BUILDER NON-RESPONSIBILITY

No debe:

```text
execute AEL
apply financial formulas
persist liquidation result
```

---

## 30. SNAPSHOT TRANSACTION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT TRANSACTION

Cuando sea necesario, la construcción debe ejecutarse contra una estrategia de consistencia:

```text
database transaction
repeatable read
database snapshot
application snapshot
```

según infraestructura.

---

## 31. CONSISTENCY LEVEL

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CONSISTENCY LEVEL

La estrategia elegida debe documentar qué garantiza.

No afirmar:

```text
snapshot
```

si sólo se realizaron consultas independientes sin garantía de consistencia.

---

## 32. SNAPSHOT ATOMICITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT ATOMICITY

Idealmente:

```text
all required inputs
```

deben pertenecer a una misma versión lógica.

---

## 33. CONCURRENT CHANGE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CONCURRENT CHANGE

Si los datos cambian durante snapshot creation:

```text
detect
retry
or fail
```

según policy.

---

## 34. OPTIMISTIC SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

OPTIMISTIC SNAPSHOT

Puede utilizar:

```text
version columns
updatedAt
transaction sequence
```

para detectar cambios concurrentes.

---

## 35. SNAPSHOT RETRY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT RETRY

Retries del Snapshot Builder deben tener límite.

---

## 36. SNAPSHOT FAILURE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT FAILURE

Error:

```text
AEL_SNAPSHOT_CONSISTENCY_ERROR
```

---

## 37. SNAPSHOT INCOMPLETE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT INCOMPLETE

Si faltan datos requeridos:

```text
AEL_SNAPSHOT_INCOMPLETE
```

---

## 38. SNAPSHOT INVALID

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT INVALID

Datos incompatibles con el schema:

```text
AEL_SNAPSHOT_INVALID
```

---

## 39. SNAPSHOT TENANT MISMATCH

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT TENANT MISMATCH

Si un registro pertenece a otro tenant:

```text
AEL_SNAPSHOT_TENANT_MISMATCH
```

---

## 40. SNAPSHOT PERIOD MISMATCH

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT PERIOD MISMATCH

Datos fuera del período requerido deben validarse según las reglas de cada entidad.

---

## 41. SNAPSHOT NORMALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT NORMALIZATION

Antes de calcular:

```text
dates
money
decimal
currency
identifiers
enums
```

deben tener representación canónica.

---

## 42. DECIMAL NORMALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DECIMAL NORMALIZATION

Nunca convertir:

```text
Decimal → float
```

---

## 43. MONEY NORMALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

MONEY NORMALIZATION

Money debe conservar:

```text
amount
currency
```

y semántica definida.

---

## 44. DATE NORMALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DATE NORMALIZATION

Las fechas deben utilizar el tipo temporal definido por el Core Domain.

---

## 45. IDENTIFIER NORMALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

IDENTIFIER NORMALIZATION

IDs deben mantener su representación canónica.

No transformar identificadores sólo por conveniencia del Provider.

---

## 46. ENUM NORMALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

ENUM NORMALIZATION

Estados deben utilizar valores del enum/domain type definido.

---

## 47. SNAPSHOT IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT IMMUTABILITY

Una vez construido:

```text
DataSnapshot
```

debe ser inmutable.

---

## 48. DEFENSIVE COPY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DEFENSIVE COPY

Si el lenguaje anfitrión lo requiere, inputs deben copiarse para impedir mutaciones accidentales.

---

## 49. SNAPSHOT SERIALIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT SERIALIZATION

Puede serializarse para:

```text
audit
replay
debugging
```

pero no debe ser requisito para ejecución normal.

---

## 50. SNAPSHOT HASH

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT HASH

Calcular hash sobre:

```text
canonical snapshot representation
```

---

## 51. SNAPSHOT HASH INPUT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT HASH INPUT

Excluir metadata operacional como:

```text
creation timestamp
execution id
machine information
```

si no afecta la semántica.

---

## 52. SNAPSHOT DETERMINISM

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT DETERMINISM

Mismo contenido lógico:

```text
same canonical snapshot
same snapshotHash
```

---

## 53. SNAPSHOT ORDER

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT ORDER

Collections deben tener orden determinista cuando el orden sea semánticamente relevante.

---

## 54. SET SEMANTICS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SET SEMANTICS

Cuando una colección represente un conjunto:

```text
canonical ordering
```

puede utilizarse para hashing.

---

## 55. DUPLICATES

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DUPLICATES

Detectar duplicados cuando violen invariantes de la entidad.

---

## 56. REFERENTIAL INTEGRITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REFERENTIAL INTEGRITY

Validar referencias:

```text
Payment → Unit
Novelty → Unit
Concept → Period
Rate → Concept
```

según dominio.

---

## 57. ORPHAN DATA

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

ORPHAN DATA

Datos referencialmente inválidos:

```text
snapshot validation error
```

---

## 58. REQUIRED DATA

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REQUIRED DATA

El snapshot debe declarar qué componentes son requeridos por la ejecución.

---

## 59. OPTIONAL DATA

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

OPTIONAL DATA

Datos opcionales no deben representarse ambiguamente.

Diferenciar:

```text
missing
null
empty
zero
```

---

## 60. ZERO VS MISSING

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

ZERO VS MISSING

Especialmente importante para:

```text
amount = 0
```

No debe interpretarse como:

```text
missing amount
```

---

## 61. PERIOD CLOSURE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PERIOD CLOSURE

Si un período está cerrado, el snapshot debe utilizar la versión autorizada de datos para ese período.

---

## 62. CLOSED PERIOD IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CLOSED PERIOD IMMUTABILITY

Cambios posteriores al cierre no deben modificar silenciosamente un snapshot ya generado.

---

## 63. REOPEN POLICY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REOPEN POLICY

Si un período cerrado puede reabrirse, debe producirse una nueva versión/snapshot.

---

## 64. SNAPSHOT REPRODUCTION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT REPRODUCTION

Una liquidación reproducible debe poder indicar:

```text
artifactHash
snapshotHash
input parameters
```

---

## 65. REPLAY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REPLAY

Para repetir una liquidación:

```text
same Artifact
+
same Snapshot
+
same parameters
```

debe producir el mismo resultado cuando las capabilities sean deterministas.

---

## 66. EXTERNAL CAPABILITIES

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

EXTERNAL CAPABILITIES

Capabilities usadas durante snapshot creation deben quedar registradas.

---

## 67. SNAPSHOT PROVENANCE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT PROVENANCE

Registrar:

```text
source capability
source version
source snapshot
```

cuando sea necesario.

---

## 68. PROVIDER CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PROVIDER CONSISTENCY

No mezclar datos provenientes de Providers incompatibles o snapshots incompatibles.

---

## 69. PROVIDER VERSION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PROVIDER VERSION

Si una Capability cambia semántica, el snapshot debe conservar la versión relevante.

---

## 70. READ TIMESTAMP

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

READ TIMESTAMP

Puede registrarse un timestamp operacional de lectura.

No utilizarlo como sustituto de una garantía de consistencia.

---

## 71. DATA FRESHNESS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DATA FRESHNESS

El proceso debe definir cuánto tiempo puede considerarse válido un snapshot.

---

## 72. SNAPSHOT EXPIRATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT EXPIRATION

Si aplica:

```text
expiresAt
```

debe ser metadata/policy, no una inferencia implícita.

---

## 73. STALE SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

STALE SNAPSHOT

Un snapshot expirado debe:

```text
reject
refresh
or explicitly override by policy
```

---

## 74. FINANCIAL SAFETY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

FINANCIAL SAFETY

No ejecutar liquidación con snapshot parcialmente actualizado.

---

## 75. PAYMENT CUT-OFF

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAYMENT CUT-OFF

Cuando el negocio defina una fecha/hora de corte de pagos:

```text
payment cutoff
```

debe formar parte explícita del contexto.

---

## 76. PAYMENT INCLUSION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAYMENT INCLUSION

La inclusión de un Payment debe quedar determinada durante snapshot creation.

---

## 77. PAYMENT AFTER CUT-OFF

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAYMENT AFTER CUT-OFF

Un pago posterior al cutoff no debe entrar accidentalmente por una consulta Runtime posterior.

---

## 78. NOVELTY CUT-OFF

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

NOVELTY CUT-OFF

Aplicar el mismo principio a novedades si el dominio lo requiere.

---

## 79. RATE EFFECTIVE DATE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

RATE EFFECTIVE DATE

Rate debe evaluarse según su vigencia definida.

---

## 80. RATE CONFLICT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

RATE CONFLICT

Si existen múltiples Rates aplicables:

```text
snapshot builder must reject
```

o resolver mediante una policy explícita del dominio.

---

## 81. COEFFICIENT SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

COEFFICIENT SNAPSHOT

Coefficient utilizado debe quedar congelado.

---

## 82. UNIT STATUS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

UNIT STATUS

El estado de Unit utilizado para la liquidación debe quedar registrado.

---

## 83. OWNER RELATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

OWNER RELATION

Si ownership afecta la liquidación:

```text
ownership relation
```

debe quedar en snapshot.

---

## 84. MULTIPLE OWNERS

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

MULTIPLE OWNERS

No asumir un solo Owner si el dominio permite varios.

---

## 85. DATA MASKING

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DATA MASKING

Datos personales no requeridos por la fórmula no deben incluirse.

---

## 86. MINIMIZATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

MINIMIZATION

El snapshot debe seguir:

```text
data minimization
```

---

## 87. SECURITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SECURITY

Snapshot debe tratarse como:

```text
sensitive business data
```

cuando contenga información financiera o personal.

---

## 88. ACCESS CONTROL

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

ACCESS CONTROL

Sólo procesos autorizados pueden crear/leer snapshots.

---

## 89. SNAPSHOT STORAGE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT STORAGE

La persistencia será definida por infraestructura posterior.

El módulo define:

```text
model
hash
validation
lifecycle
```

---

## 90. SNAPSHOT LIFECYCLE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT LIFECYCLE

Estados:

```text
Building
Validated
Frozen
Consumed
Archived
Invalid
```

---

## 91. FROZEN

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

FROZEN

Sólo:

```text
Frozen
```

puede utilizarse para una liquidación final.

---

## 92. INVALID

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

INVALID

Snapshot invalid no puede alimentar Runtime.

---

## 93. CONSUMED

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CONSUMED

Un snapshot puede ser utilizado por múltiples ejecuciones si la policy lo permite.

---

## 94. ARCHIVED

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

ARCHIVED

Archived puede conservarse para auditoría/replay según retention policy.

---

## 95. SNAPSHOT LOCK

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT LOCK

No requiere necesariamente un database lock durante toda la ejecución.

La garantía se obtiene congelando los datos utilizados.

---

## 96. LONG-RUNNING EXECUTION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

LONG-RUNNING EXECUTION

Una ejecución larga no debe mantener una transacción de database abierta indefinidamente sólo para preservar inputs.

---

## 97. PERFORMANCE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PERFORMANCE

Construir snapshot debe minimizar:

```text
round trips
duplicate reads
unnecessary data
```

---

## 98. BATCHING

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

BATCHING

Cuando sea posible:

```text
batch reads
```

para Units, Payments, Concepts, etc.

---

## 99. PAGINATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAGINATION

Si los datos son grandes:

```text
paged/batched snapshot creation
```

debe preservar coherencia global.

---

## 100. MEMORY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

MEMORY

No cargar datos ilimitados sin respetar:

```text
snapshot size limit
```

---

## 101. SNAPSHOT SIZE LIMIT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT SIZE LIMIT

Error:

```text
AEL_SNAPSHOT_SIZE_LIMIT
```

---

## 102. BUILD TIMEOUT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

BUILD TIMEOUT

Construcción demasiado larga:

```text
AEL_SNAPSHOT_TIMEOUT
```

---

## 103. EXECUTION CONTEXT LINK

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

EXECUTION CONTEXT LINK

El `LiquidationContext` debe estar asociado a:

```text
ExecutionContext
```

pero no confundirse con él.

---

## 104. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

EXECUTION CONTEXT

Contiene:

```text
runtime resources
capabilities
limits
clock
cancellation
```

---

## 105. LIQUIDATION CONTEXT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

LIQUIDATION CONTEXT

Contiene:

```text
business inputs
snapshot
period
parameters
```

---

## 106. SEPARATION

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SEPARATION

No mezclar:

```text
business data
```

con:

```text
runtime infrastructure
```

---

## 107. AEL INPUT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

AEL INPUT

AEL debería recibir una representación tipada del:

```text
LiquidationContext
```

o de la parte mínima necesaria.

---

## 108. INPUT IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

INPUT IMMUTABILITY

Durante cálculo:

```text
LiquidationContext
```

debe ser inmutable.

---

## 109. OUTPUT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

OUTPUT

El resultado de AEL debe referenciar:

```text
artifactHash
snapshotHash
```

para trazabilidad.

---

## 110. LIQUIDATION RESULT PROVENANCE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

LIQUIDATION RESULT PROVENANCE

Conceptualmente:

```ts
interface LiquidationExecutionProvenance {
  artifactHash: string
  snapshotHash: string
  tenantId: TenantId
  periodId: PeriodId
}
```

---

## 111. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REPRODUCIBILITY

Con la misma:

```text
Artifact
Snapshot
Parameters
```

el cálculo debe reproducirse.

---

## 112. NON-DETERMINISTIC CAPABILITY

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

NON-DETERMINISTIC CAPABILITY

Si una Capability devuelve datos no deterministas:

```text
must not participate in deterministic liquidation
```

o debe formar parte explícita del snapshot.

---

## 113. CLOCK

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CLOCK

La hora actual no debe cambiar una liquidación histórica salvo que sea un input explícito.

---

## 114. CURRENT DATE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CURRENT DATE

Si una fórmula requiere fecha actual:

```text
date
```

debe congelarse como parámetro/context input para reproducción.

---

## 115. RANDOM

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

RANDOM

Randomness no debe participar en una liquidación determinista.

---

## 116. TEST SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

TEST SNAPSHOT

Tests deben poder crear:

```text
FrozenDataSnapshot
```

sin database.

---

## 117. FIXTURE

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

FIXTURE

Fixtures deben ser:

```text
small
deterministic
versioned
```

---

## 118. SNAPSHOT TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SNAPSHOT TEST

Mismo fixture:

```text
same snapshotHash
```

---

## 119. CONSISTENCY TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

CONSISTENCY TEST

Simular cambio concurrente:

```text
detect conflict
retry/fail
```

---

## 120. TENANT TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

TENANT TEST

Snapshot con registros de otro tenant:

```text
AEL_SNAPSHOT_TENANT_MISMATCH
```

---

## 121. PERIOD TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PERIOD TEST

Datos fuera de vigencia:

```text
rejected or excluded
```

según policy.

---

## 122. PAYMENT CUTOFF TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PAYMENT CUTOFF TEST

Payment posterior al cutoff:

```text
not included
```

---

## 123. RATE TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

RATE TEST

Rate incompatible:

```text
snapshot validation failure
```

---

## 124. DUPLICATE TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

DUPLICATE TEST

Duplicate entity violating uniqueness:

```text
snapshot validation failure
```

---

## 125. REPLAY TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

REPLAY TEST

```text
same artifact
+
same snapshot
+
same parameters
=
same liquidation result
```

---

## 126. SECURITY TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SECURITY TEST

Verificar minimización:

```text
unused PII
```

no aparece en snapshot.

---

## 127. SIZE TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

SIZE TEST

Snapshot excesivamente grande:

```text
AEL_SNAPSHOT_SIZE_LIMIT
```

---

## 128. TIMEOUT TEST

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

TIMEOUT TEST

Builder excede límite:

```text
AEL_SNAPSHOT_TIMEOUT
```

---

## 129. PRINCIPIO DE REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PRINCIPIO DE REPRODUCIBILIDAD

```text
Artifact
+
Snapshot
+
Parameters
=
reproducible calculation
```

---

## 130. PRINCIPIO DE CONSISTENCIA

> **Origen:** Motor de liquidacion_Liquidation Execution Context & Data Snapshot 64.md

PRINCIPIO DE CONSISTENCIA

Una liquidación debe calcularse sobre una fotografía lógica coherente del negocio, no sobre una colección accidental de consultas ejecutadas en momentos diferentes.

---

## 131. REFERENCIAS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

REFERENCIAS

Consume:

```text
Documento 45 — Registry & Dependency Management
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 60 — Verifier & Static Safety Validation
Documento 61 — Artifact Format, Serialization & Integrity
Documento 62 — Runtime Architecture & Execution Engine
Documento 63 — Capability System & Provider Execution Contracts
Documento 64 — Liquidation Execution Context & Data Snapshot
```

---

## 132. OBJETIVO

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

OBJETIVO

Definir el lifecycle:

```text
Liquidation Request
 ↓
Preconditions
 ↓
Artifact Validation
 ↓
Snapshot Construction
 ↓
Context Validation
 ↓
Runtime Execution
 ↓
Result Validation
 ↓
Result Finalization
```

---

## 133. PRINCIPIO

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRINCIPIO

Una liquidación no es solamente:

```text
execute(AEL)
```

Es:

```text
prepare
→ freeze inputs
→ execute
→ validate
→ finalize
```

---

## 134. LIQUIDATION REQUEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

LIQUIDATION REQUEST

Conceptualmente:

```ts
interface LiquidationRequest {
  tenantId: TenantId
  periodId: PeriodId
  scope: LiquidationScope
  artifactId: ArtifactId
  parameters: LiquidationParameters
}
```

---

## 135. SCOPE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

SCOPE

El scope determina qué se liquida:

```text
tenant
period
building
unit
group
```

según el dominio.

---

## 136. ARTIFACT SELECTION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

ARTIFACT SELECTION

Debe existir un Artifact explícitamente seleccionado.

No usar:

```text
latest artifact
```

de forma implícita.

---

## 137. ARTIFACT VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

ARTIFACT VALIDATION

Antes de iniciar:

```text
format
integrity
verification
compatibility
revocation
```

deben validarse.

---

## 138. ARTIFACT NOT EXECUTABLE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

ARTIFACT NOT EXECUTABLE

Si falla alguna validación crítica:

```text
liquidation rejected
```

---

## 139. PRECONDITIONS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRECONDITIONS

Validar:

```text
tenant exists
period exists
scope valid
artifact compatible
parameters valid
```

---

## 140. PERIOD STATE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PERIOD STATE

El período debe estar en un estado compatible con liquidación.

Ejemplos:

```text
Open
InProcess
Closed
```

La policy del dominio determina cuáles permiten cálculo.

---

## 141. CONCURRENT LIQUIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCURRENT LIQUIDATION

Debe existir una política para evitar ejecuciones conflictivas sobre:

```text
same tenant
same period
same scope
```

---

## 142. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

IDEMPOTENCY

La solicitud debe tener una identidad que permita detectar reintentos.

---

## 143. LIQUIDATION REQUEST ID

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

LIQUIDATION REQUEST ID

Debe existir:

```text
liquidationRequestId
```

---

## 144. IDEMPOTENCY KEY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

IDEMPOTENCY KEY

Puede existir:

```text
idempotencyKey
```

especialmente para procesos que produzcan efectos.

---

## 145. REQUEST DEDUPLICATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

REQUEST DEDUPLICATION

Dos solicitudes equivalentes pueden:

```text
reuse existing result
```

si la policy lo permite.

---

## 146. SNAPSHOT CREATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

SNAPSHOT CREATION

Después de preconditions:

```text
LiquidationSnapshotBuilder
```

construye el snapshot.

---

## 147. SNAPSHOT VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

SNAPSHOT VALIDATION

Validar:

```text
tenant
period
referential integrity
required inputs
currency
rates
payments
novelties
```

según el dominio.

---

## 148. SNAPSHOT FREEZE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

SNAPSHOT FREEZE

Sólo continuar cuando:

```text
snapshot.status = Frozen
```

---

## 149. LIQUIDATION CONTEXT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

LIQUIDATION CONTEXT

Construir:

```text
LiquidationContext
```

a partir de:

```text
request
snapshot
parameters
execution metadata
```

---

## 150. CONTEXT VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONTEXT VALIDATION

Comprobar:

```text
tenant matches
period matches
scope matches
artifact compatible
snapshot valid
```

---

## 151. EXECUTION START

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

EXECUTION START

Crear:

```text
executionId
```

y asociar:

```text
artifactHash
snapshotHash
requestId
tenantId
periodId
```

---

## 152. RUNTIME INVOCATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RUNTIME INVOCATION

Ejecutar:

```text
Verified Artifact
+
LiquidationContext
+
ExecutionContext
```

---

## 153. EXECUTION ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

EXECUTION ISOLATION

No compartir:

```text
locals
temporaries
budgets
mutable state
```

entre liquidaciones.

---

## 154. UNIT ITERATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

UNIT ITERATION

Si el scope contiene múltiples Units, la arquitectura debe definir si:

```text
one execution per unit
```

o:

```text
one execution for batch
```

---

## 155. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

V1 RECOMMENDATION

Para aislamiento y trazabilidad:

```text
batch orchestration
+
logical unit calculation
```

manteniendo cada Unit como unidad identificable de cálculo.

---

## 156. UNIT CONTEXT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

UNIT CONTEXT

Cada Unit puede recibir:

```text
UnitLiquidationContext
```

derivado del snapshot general.

---

## 157. NO REBUILD SNAPSHOT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

NO REBUILD SNAPSHOT

No construir un snapshot diferente por Unit si todos provienen del mismo snapshot congelado.

---

## 158. CALCULATION ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CALCULATION ORDER

El orden de cálculo debe ser determinista.

---

## 159. ORDERING

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

ORDERING

Si el resultado depende del orden, el orden debe estar definido explícitamente.

No depender del orden accidental de:

```text
database rows
object keys
hash maps
```

---

## 160. CONCEPT ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCEPT ORDER

Conceptos deben procesarse según:

```text
priority/order
```

definido por el modelo de dominio.

---

## 161. DEPENDENCY ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

DEPENDENCY ORDER

Si un Concept depende de otro:

```text
dependency graph
```

debe determinar el orden.

---

## 162. CYCLIC CONCEPTS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CYCLIC CONCEPTS

Dependencias cíclicas deben detectarse antes de ejecutar el cálculo.

---

## 163. CYCLIC ERROR

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CYCLIC ERROR

```text
AEL_LIQUIDATION_CYCLIC_DEPENDENCY
```

---

## 164. BASE CALCULATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

BASE CALCULATION

El pipeline puede comenzar con:

```text
base values
```

provenientes del Snapshot.

---

## 165. CONCEPT EVALUATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCEPT EVALUATION

Cada concepto produce un resultado tipado.

Conceptualmente:

```text
Concept
 ↓
Inputs
 ↓
AEL
 ↓
Concept Result
```

---

## 166. CONCEPT RESULT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCEPT RESULT

Puede contener:

```text
conceptId
amount
currency
calculation metadata
```

según dominio.

---

## 167. INTERMEDIATE RESULTS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

INTERMEDIATE RESULTS

Resultados intermedios no deben persistirse automáticamente.

---

## 168. PAYMENT APPLICATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PAYMENT APPLICATION

Los pagos aplicables deben utilizar el Payment Snapshot.

No consultar Payments en vivo durante cálculo.

---

## 169. PAYMENT ALLOCATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PAYMENT ALLOCATION

La asignación de pagos debe seguir la regla de dominio definida.

Este documento sólo establece cuándo ocurre dentro del lifecycle.

---

## 170. NOVELTY APPLICATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

NOVELTY APPLICATION

Las novedades congeladas se aplican según su orden/regla de negocio.

---

## 171. PRIOR BALANCE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRIOR BALANCE

Saldo anterior se incorpora desde Snapshot.

---

## 172. TOTALS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

TOTALS

Los totales deben calcularse desde resultados tipados.

No recalcular desde strings o valores formateados.

---

## 173. ROUNDING POINTS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

ROUNDING POINTS

Rounding sólo ocurre en los puntos definidos por:

```text
Financial Rules
```

No al azar en cada etapa.

---

## 174. CURRENCY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CURRENCY

Todos los resultados Money deben mantener currency.

---

## 175. CURRENCY CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CURRENCY CONSISTENCY

Una liquidación con currencies incompatibles debe fallar o convertir mediante una regla explícita.

---

## 176. CONVERSION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONVERSION

Currency conversion, si existe, debe ser una operación explícita y auditable.

---

## 177. EXECUTION ERROR

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

EXECUTION ERROR

Un error Runtime debe producir:

```text
LiquidationExecutionFailure
```

con:

```text
code
source
concept
unit
executionId
```

cuando aplique.

---

## 178. PARTIAL RESULTS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PARTIAL RESULTS

V1 debe definir si una liquidación batch permite resultados parciales.

Recomendación:

```text
no publicar resultado final parcial
```

---

## 179. UNIT FAILURE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

UNIT FAILURE

Si una Unit falla, policy debe determinar:

```text
fail entire batch
```

o:

```text
isolate failed unit
```

---

## 180. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

V1 RECOMMENDATION

Mantener:

```text
calculation isolation per Unit
```

pero:

```text
batch result status = PartialFailure
```

si algunas Units fallan y la policy lo permite.

---

## 181. RESULT AGGREGATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT AGGREGATION

Los resultados Unit se agregan mediante un Aggregator determinista.

---

## 182. RESULT AGGREGATOR

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT AGGREGATOR

```text
Unit Results
 ↓
LiquidationResultAggregator
 ↓
LiquidationResult
```

---

## 183. RESULT ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT ORDER

Resultados deben conservar un orden canónico.

---

## 184. RESULT VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT VALIDATION

Antes de finalizar:

```text
schema
types
currency
totals
invariants
```

deben validarse.

---

## 185. FINANCIAL INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

FINANCIAL INVARIANTS

Ejemplos:

```text
sum(detail amounts) = total
currency consistent
required concepts present
```

Las reglas concretas pertenecen al dominio financiero.

---

## 186. RECONCILIATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RECONCILIATION

El resultado debe permitir reconciliar:

```text
inputs
+
concept results
+
adjustments
=
final amount
```

---

## 187. RESULT PROVENANCE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT PROVENANCE

Debe asociarse:

```text
artifactHash
snapshotHash
executionId
tenantId
periodId
```

---

## 188. RESULT STATUS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT STATUS

Estados conceptuales:

```text
Running
Succeeded
Failed
PartialFailure
Cancelled
```

---

## 189. FINALIZATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

FINALIZATION

Sólo finalizar cuando:

```text
execution completed
result validated
invariants passed
```

---

## 190. RESULT IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT IMMUTABILITY

Un resultado finalizado debe ser inmutable.

Correcciones deben producir una nueva ejecución/version.

---

## 191. NO IN-PLACE RECALCULATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

NO IN-PLACE RECALCULATION

No modificar un resultado histórico en sitio.

---

## 192. RE-RUN

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RE-RUN

Una nueva liquidación debe producir:

```text
new executionId
```

y asociarse a:

```text
same/different snapshot
same/different artifact
```

según inputs.

---

## 193. RE-RUN POLICY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RE-RUN POLICY

Un rerun debe indicar explícitamente por qué se realiza:

```text
manual
correction
new snapshot
new artifact
policy change
```

---

## 194. CANCELLATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CANCELLATION

Una ejecución puede cancelarse si la infraestructura lo permite.

---

## 195. CANCELLED RESULT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CANCELLED RESULT

No debe confundirse con:

```text
Failed
```

---

## 196. TIMEOUT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

TIMEOUT

Timeout produce:

```text
AEL_LIQUIDATION_TIMEOUT
```

y no debe marcarse como Success.

---

## 197. OBSERVABILITY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

OBSERVABILITY

Registrar:

```text
requestId
executionId
artifactHash
snapshotHash
duration
unitsProcessed
unitsFailed
```

---

## 198. AUDIT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

AUDIT

La ejecución financiera debe producir evidencia suficiente para reconstruir:

```text
qué se ejecutó
con qué datos
con qué versión
qué resultado produjo
```

---

## 199. AUDIT MINIMIZATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

AUDIT MINIMIZATION

No almacenar automáticamente todos los datos sensibles si una referencia/hashes son suficientes.

---

## 200. RESULT STORAGE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT STORAGE

La persistencia del resultado será responsabilidad de la capa de aplicación/persistence.

El lifecycle define cuándo puede persistirse.

---

## 201. PERSISTENCE GATE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PERSISTENCE GATE

Sólo persistir como resultado final cuando:

```text
status = Succeeded
```

o el estado parcial esté expresamente permitido.

---

## 202. TRANSACTIONAL FINALIZATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

TRANSACTIONAL FINALIZATION

Cuando se persistan:

```text
execution metadata
+
result
```

deben mantenerse las garantías transaccionales de la infraestructura.

---

## 203. RESULT PUBLICATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT PUBLICATION

Publicar un resultado significa hacerlo disponible para procesos posteriores.

Debe ocurrir después de:

```text
validation
persistence
```

según policy.

---

## 204. PUBLICATION IDEMPOTENCY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PUBLICATION IDEMPOTENCY

No publicar dos veces el mismo resultado lógico por reintentos.

---

## 205. RESULT HASH

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT HASH

Puede calcularse:

```text
resultHash
```

sobre representación canónica del resultado.

---

## 206. RESULT HASH PURPOSE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT HASH PURPOSE

Permite:

```text
integrity
comparison
replay verification
audit
```

---

## 207. RESULT REPLAY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT REPLAY

Comparar:

```text
previous resultHash
new resultHash
```

para detectar diferencias.

---

## 208. DIFFERENCE ANALYSIS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

DIFFERENCE ANALYSIS

Si el resultado cambia, debe poder analizarse si cambió:

```text
artifact
snapshot
parameters
runtime policy
provider responses
```

según provenance.

---

## 209. EXECUTION LIFECYCLE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

EXECUTION LIFECYCLE

Estados:

```text
Requested
Validating
Snapshotting
Ready
Running
ValidatingResult
Finalizing
Succeeded
Failed
Cancelled
```

---

## 210. STATE TRANSITIONS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

STATE TRANSITIONS

Sólo permitir transiciones válidas.

Ejemplo:

```text
Requested → Validating
Validating → Snapshotting
Snapshotting → Ready
Ready → Running
Running → ValidatingResult
ValidatingResult → Finalizing
Finalizing → Succeeded
```

---

## 211. INVALID TRANSITION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

INVALID TRANSITION

```text
AEL_LIQUIDATION_INVALID_STATE_TRANSITION
```

---

## 212. FAILURE TRANSITIONS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

FAILURE TRANSITIONS

Desde estados activos:

```text
→ Failed
```

según policy.

---

## 213. CANCELLATION TRANSITIONS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CANCELLATION TRANSITIONS

```text
Requested → Cancelled
Running → Cancelled
```

si cancellation policy lo permite.

---

## 214. RETRY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RETRY

Retry no debe alterar un execution existente.

Crear nuevo execution o retry attempt explícito.

---

## 215. RETRY ATTEMPT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RETRY ATTEMPT

Registrar:

```text
attempt
```

para distinguir:

```text
same request
different execution attempt
```

---

## 216. CONCURRENCY CONTROL

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCURRENCY CONTROL

Evitar dos ejecuciones finales simultáneas para el mismo:

```text
tenant
period
scope
```

si la policy lo prohíbe.

---

## 217. LOCK STRATEGY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

LOCK STRATEGY

Puede utilizar:

```text
distributed lock
database advisory lock
unique execution constraint
```

según infraestructura.

---

## 218. NO LONG LOCK

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

NO LONG LOCK

No mantener locks innecesarios durante toda una ejecución larga si el Snapshot ya garantiza consistencia.

---

## 219. IDEMPOTENCY STORAGE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

IDEMPOTENCY STORAGE

La capa de aplicación puede mantener:

```text
idempotencyKey → execution/result
```

---

## 220. REQUEST VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

REQUEST VALIDATION

No aceptar:

```text
empty tenant
invalid period
invalid artifact
invalid parameters
```

---

## 221. PARAMETER VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PARAMETER VALIDATION

Parameters deben validarse antes de Snapshot cuando afectan qué datos se seleccionan.

---

## 222. PARAMETER FREEZE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PARAMETER FREEZE

Después de Snapshot:

```text
parameters
```

deben considerarse congelados.

---

## 223. ARTIFACT PARAMETER COMPATIBILITY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

ARTIFACT PARAMETER COMPATIBILITY

Los parameters deben ser compatibles con la firma/configuración del Artifact.

---

## 224. SNAPSHOT PARAMETER CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

SNAPSHOT PARAMETER CONSISTENCY

Si un parameter afecta selección de datos:

```text
snapshot must reflect it
```

---

## 225. UNIT ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

UNIT ORDER

Unit IDs deben ordenarse de manera canónica si el orden afecta:

```text
execution
result
audit
```

---

## 226. CONCEPT ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCEPT ORDER

Concept IDs/priorities deben ser deterministas.

---

## 227. AGGREGATION ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

AGGREGATION ORDER

Aggregation debe ser asociativa/determinista según tipos financieros.

---

## 228. FLOATING POINT

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

FLOATING POINT

No utilizar floating point para aggregation financiera.

---

## 229. DECIMAL AGGREGATION

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

DECIMAL AGGREGATION

Utilizar Decimal/Money según Documento 51.

---

## 230. PERFORMANCE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PERFORMANCE

Optimizar:

```text
snapshot reuse
batch capability calls
unit execution
result aggregation
```

sin sacrificar aislamiento.

---

## 231. PARALLEL UNITS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PARALLEL UNITS

Units independientes pueden ejecutarse en paralelo.

---

## 232. PARALLEL SAFETY

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PARALLEL SAFETY

Paralelismo no debe cambiar:

```text
result
ordering
side effects
```

---

## 233. CAPABILITY WRITE ORDER

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CAPABILITY WRITE ORDER

Si existen Writes, su orden debe estar definido.

No paralelizar ciegamente operaciones con efectos.

---

## 234. READ PARALLELISM

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

READ PARALLELISM

Read capabilities pueden paralelizarse si su contrato lo permite.

---

## 235. RESOURCE BUDGET

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESOURCE BUDGET

El batch debe respetar:

```text
maxUnits
maxTotalInstructions
maxConcurrentUnits
```

---

## 236. BATCH FAILURE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

BATCH FAILURE

Si se excede un límite global:

```text
batch failure/cancellation
```

según policy.

---

## 237. UNIT METRICS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

UNIT METRICS

Registrar:

```text
unitId
duration
status
instructionCount
```

---

## 238. CONCEPT METRICS

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CONCEPT METRICS

Puede registrarse:

```text
conceptId
duration
status
```

sin almacenar valores sensibles por defecto.

---

## 239. DEBUG MODE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

DEBUG MODE

Debug puede conservar más información, pero no modificar semántica.

---

## 240. PRODUCTION MODE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRODUCTION MODE

Production minimiza:

```text
debug traces
raw inputs
sensitive data
```

---

## 241. BASIC LIFECYCLE TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

BASIC LIFECYCLE TEST

```text
Request
→ Snapshot
→ Execute
→ Validate
→ Success
```

---

## 242. INVALID ARTIFACT TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

INVALID ARTIFACT TEST

Debe detenerse antes de Snapshot o ejecución según policy.

---

## 243. SNAPSHOT FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

SNAPSHOT FAILURE TEST

```text
Snapshotting → Failed
```

sin ejecutar AEL.

---

## 244. RUNTIME FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RUNTIME FAILURE TEST

```text
Running → Failed
```

---

## 245. RESULT VALIDATION FAILURE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RESULT VALIDATION FAILURE

```text
ValidatingResult → Failed
```

---

## 246. CANCELLATION TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CANCELLATION TEST

```text
Running → Cancelled
```

---

## 247. IDEMPOTENCY TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

IDEMPOTENCY TEST

Dos requests equivalentes:

```text
same idempotency key
```

no deben crear resultados duplicados cuando la policy indique deduplication.

---

## 248. REPLAY TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

REPLAY TEST

Mismo:

```text
artifact
snapshot
parameters
```

debe producir mismo resultHash cuando no existan dependencies no deterministas.

---

## 249. PARALLEL TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PARALLEL TEST

Ejecutar Units en paralelo y verificar:

```text
same aggregate result
```

que ejecución secuencial.

---

## 250. PAYMENT TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PAYMENT TEST

Payment Snapshot determina exactamente qué pagos entran.

---

## 251. CUTOFF TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

CUTOFF TEST

Payment posterior al cutoff no debe afectar resultado.

---

## 252. RATE TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

RATE TEST

Rate congelada produce resultado reproducible aunque cambie la fuente después.

---

## 253. NOVELTY TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

NOVELTY TEST

Novelty congelada debe producir mismo resultado en replay.

---

## 254. FINANCIAL RECONCILIATION TEST

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

FINANCIAL RECONCILIATION TEST

Verificar:

```text
details
+
adjustments
=
total
```

según reglas del dominio.

---

## 255. PRINCIPIO DE ORQUESTACIÓN

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRINCIPIO DE ORQUESTACIÓN

Este componente coordina; no concentra todas las reglas.

```text
Coordinator
≠
Business Rule Engine
```

---

## 256. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRINCIPIO DE AISLAMIENTO

Cada ejecución debe ser trazable mediante:

```text
requestId
executionId
artifactHash
snapshotHash
```

---

## 257. PRINCIPIO DE REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRINCIPIO DE REPRODUCIBILIDAD

```text
same Artifact
+
same Snapshot
+
same Parameters
=
same calculation
```

cuando las dependencies estén controladas.

---

## 258. PRINCIPIO DE CIERRE

> **Origen:** Motor de liquidacion_Liquidation Calculation Pipeline & Execution Lifecycle 65.md

PRINCIPIO DE CIERRE

Una liquidación sólo es final cuando:

```text
execution completed
+
result validated
+
financial invariants passed
+
finalization succeeded
```

---
