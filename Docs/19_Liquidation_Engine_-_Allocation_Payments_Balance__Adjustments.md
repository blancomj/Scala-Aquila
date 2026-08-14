# AEL V1 — Liquidation Engine — Allocation, Payments, Balance & Adjustments

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
69 — Motor de liquidacion_Allocation & Proration Engine 69.md
70 — Motor de liquidacion_Payment Application & Balance Engine 70.md
71 — Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md
```

## 1. REFERENCIAS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

REFERENCIAS

Consume:

```text
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 64 — Liquidation Execution Context & Data Snapshot
Documento 65 — Liquidation Calculation Pipeline & Execution Lifecycle
Documento 66 — Concept Dependency Graph & Calculation Ordering
Documento 67 — Calculation Context, Variables & Intermediate Results
Documento 68 — Financial Calculation Semantics & Rounding Pipeline
```

---

## 2. OBJETIVO

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

OBJETIVO

Transformar:

```text
Source Amount
+
Allocation Basis
+
Allocation Policy
```

en:

```text
Allocation Entries
+
Residual
+
Reconciliation Result
```

---

## 3. PRINCIPIO

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRINCIPIO

El Allocation Engine distribuye; no decide por sí mismo la regla de negocio que indica por qué debe distribuirse.

---

## 4. INPUT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

INPUT

Conceptualmente:

```ts
interface AllocationRequest {
  sourceAmount: Money
  targets: AllocationTarget[]
  basis: AllocationBasis
  policy: AllocationPolicy
}
```

---

## 5. TARGET

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TARGET

Un target representa la entidad que recibe una parte:

```text
unitId
basisValue
metadata
```

según el dominio.

---

## 6. BASIS TYPES

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

BASIS TYPES

V1 puede soportar:

```text
Coefficient
Percentage
Weight
FixedAmount
EqualShare
```

sólo cuando estén autorizados por la regla financiera.

---

## 7. COEFFICIENT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

COEFFICIENT

Coefficient representa la participación definida por el dominio.

No asumir que todos los coefficients son porcentajes.

---

## 8. PERCENTAGE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PERCENTAGE

Percentage representa una proporción explícita.

Ejemplo:

```text
10%
```

equivale semánticamente a:

```text
0.10
```

sin convertir el tipo a String.

---

## 9. WEIGHT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

WEIGHT

Weight determina proporción relativa:

```text
weight / totalWeight
```

---

## 10. FIXED AMOUNT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

FIXED AMOUNT

FixedAmount asigna importes explícitos.

Debe reconciliar con el source amount según policy.

---

## 11. EQUAL SHARE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EQUAL SHARE

EqualShare divide:

```text
sourceAmount / targetCount
```

respetando rounding y residual policy.

---

## 12. BASIS VALIDATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

BASIS VALIDATION

Antes de distribuir:

```text
targets not empty
basis valid
values valid
policy valid
```

---

## 13. EMPTY TARGETS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EMPTY TARGETS

No se puede distribuir un importe a cero targets.

Error:

```text
AEL_ALLOCATION_NO_TARGETS
```

---

## 14. NEGATIVE BASIS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NEGATIVE BASIS

Rechazar bases negativas salvo que el dominio las autorice explícitamente.

---

## 15. ZERO BASIS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ZERO BASIS

Un basis cero puede ser válido.

Debe recibir:

```text
allocation = 0
```

si la policy lo permite.

---

## 16. TOTAL BASIS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TOTAL BASIS

Para proportional allocation:

```text
totalBasis = Σ basis
```

---

## 17. ZERO TOTAL BASIS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ZERO TOTAL BASIS

Si:

```text
totalBasis = 0
```

no existe distribución proporcional válida.

Error:

```text
AEL_ALLOCATION_ZERO_TOTAL_BASIS
```

---

## 18. PROPORTIONAL FORMULA

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PROPORTIONAL FORMULA

Para target `i`:

```text
exactAllocation(i)
=
sourceAmount × basis(i) / totalBasis
```

La operación debe ejecutarse mediante FinancialOperationService.

---

## 19. NO FLOATING POINT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NO FLOATING POINT

Nunca implementar la fórmula mediante:

```text
number
float
parseFloat
```

---

## 20. EXACT ALLOCATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EXACT ALLOCATION

Primero calcular:

```text
exactAllocation
```

con precisión interna.

---

## 21. ROUNDING

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ROUNDING

Después aplicar la RoundingPolicy correspondiente.

---

## 22. ROUNDING ORDER

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ROUNDING ORDER

Secuencia:

```text
exact allocation
 ↓
round allocation
 ↓
residual calculation
```

---

## 23. RESIDUAL

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL

```text
residual
=
sourceAmount
-
Σ roundedAllocations
```

---

## 24. RESIDUAL SIGN

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL SIGN

El residual puede ser:

```text
positive
negative
zero
```

según la policy y el modo de rounding.

---

## 25. RESIDUAL UNIT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL UNIT

El residual se distribuye en unidades de la mínima denominación monetaria permitida.

---

## 26. RESIDUAL POLICY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL POLICY

Debe definir:

```text
distribution method
tie breaker
maximum residual
```

---

## 27. LARGEST REMAINDER

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

LARGEST REMAINDER

Método recomendado para ciertas distribuciones proporcionales:

```text
calculate exact
→ floor/round base
→ calculate remainder
→ rank remainder
→ distribute residual units
```

La implementación concreta debe respetar la RoundingPolicy autorizada.

---

## 28. REMAINDER

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

REMAINDER

Para cada target puede calcularse:

```text
remainder(i)
=
exactAllocation(i)
-
roundedBaseAllocation(i)
```

---

## 29. REMAINDER ORDER

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

REMAINDER ORDER

Ordenar por:

```text
remainder DESC
```

---

## 30. TIE BREAK

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TIE BREAK

Si remainders coinciden:

```text
canonical targetId ASC
```

---

## 31. DETERMINISM

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

DETERMINISM

Con mismos:

```text
source
targets
basis
policy
```

debe producirse exactamente la misma distribución.

---

## 32. ALLOCATION RESULT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ALLOCATION RESULT

Conceptualmente:

```ts
interface AllocationResult {
  sourceAmount: Money
  entries: AllocationEntry[]
  residual: Money
  reconciled: boolean
}
```

---

## 33. ENTRY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ENTRY

```ts
interface AllocationEntry {
  targetId: string
  exactAmount: Money
  allocatedAmount: Money
  basis: Decimal
}
```

Los campos exactos dependen del modelo de dominio.

---

## 34. EXACT AMOUNT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EXACT AMOUNT

Puede conservarse para:

```text
audit
remainder
debugging
```

No necesariamente debe persistirse en el resultado final.

---

## 35. ALLOCATED AMOUNT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ALLOCATED AMOUNT

Es el importe efectivamente asignado después de rounding/residual policy.

---

## 36. RECONCILIATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RECONCILIATION

Validar:

```text
Σ allocatedAmount = sourceAmount
```

cuando la policy lo exige.

---

## 37. RECONCILIATION FAILURE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md; Motor de liquidacion_Payment Application & Balance Engine 70.md; Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RECONCILIATION FAILURE

```text
AEL_ALLOCATION_RECONCILIATION_FAILED
```

---

## 38. CURRENCY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

CURRENCY

Todos los allocations deben conservar la currency del source.

---

## 39. CURRENCY CONVERSION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

CURRENCY CONVERSION

Allocation Engine no convierte currencies.

Si se requiere:

```text
CurrencyConversion
```

debe ocurrir antes mediante una operación explícita.

---

## 40. SOURCE ZERO

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

SOURCE ZERO

Si:

```text
sourceAmount = 0
```

la distribución puede devolver allocations cero, según policy.

---

## 41. SOURCE NEGATIVE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

SOURCE NEGATIVE

Importes negativos sólo pueden distribuirse si la regla de negocio lo autoriza.

---

## 42. NEGATIVE ALLOCATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NEGATIVE ALLOCATION

No permitir allocations negativas si el allocation policy exige valores no negativos.

---

## 43. TARGET DUPLICATES

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TARGET DUPLICATES

Dos entries para el mismo target deben rechazarse o agregarse mediante una policy explícita.

Default:

```text
reject
```

---

## 44. DUPLICATE TARGET ERROR

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

DUPLICATE TARGET ERROR

```text
AEL_ALLOCATION_DUPLICATE_TARGET
```

---

## 45. TARGET ORDER

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TARGET ORDER

La entrada puede llegar en cualquier orden, pero el resultado debe tener orden canónico.

---

## 46. CANONICAL RESULT ORDER

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

CANONICAL RESULT ORDER

Default:

```text
targetId ASC
```

---

## 47. EQUAL SHARE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EQUAL SHARE

Si hay `N` targets:

```text
exactShare = sourceAmount / N
```

Luego aplicar:

```text
rounding
+
residual
```

---

## 48. EQUAL SHARE RESIDUAL

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EQUAL SHARE RESIDUAL

El residual debe asignarse determinísticamente.

---

## 49. WEIGHTED ALLOCATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

WEIGHTED ALLOCATION

```text
share(i)
=
weight(i) / Σ weights
```

---

## 50. WEIGHT VALIDATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

WEIGHT VALIDATION

Weights deben cumplir:

```text
finite
valid type
non-negative
```

cuando así lo requiera la policy.

---

## 51. FIXED AMOUNT ALLOCATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

FIXED AMOUNT ALLOCATION

Debe comprobar:

```text
Σ fixedAmounts
```

contra sourceAmount.

---

## 52. FIXED AMOUNT EXCESS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

FIXED AMOUNT EXCESS

Si:

```text
sumFixed > source
```

rechazar salvo policy explícita.

---

## 53. FIXED AMOUNT REMAINING

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

FIXED AMOUNT REMAINING

Si:

```text
sumFixed < source
```

el tratamiento del restante debe ser explícito.

No distribuirlo arbitrariamente.

---

## 54. MIXED BASIS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

MIXED BASIS

V1 debe evitar mezclar:

```text
fixed
+
percentage
+
weight
```

en una sola operación salvo que exista una policy explícita.

---

## 55. MIXED BASIS ERROR

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

MIXED BASIS ERROR

```text
AEL_ALLOCATION_MIXED_BASIS_UNSUPPORTED
```

---

## 56. COEFFICIENT TOTAL

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

COEFFICIENT TOTAL

Si la regla requiere:

```text
Σ coefficient = 1
```

debe validarse con la semántica Decimal definida.

---

## 57. COEFFICIENT TOLERANCE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

COEFFICIENT TOLERANCE

No usar tolerancia binaria de floating point.

La comparación debe seguir Decimal/Policy.

---

## 58. NORMALIZATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NORMALIZATION

Bases equivalentes pueden normalizarse antes de calcular.

Ejemplo:

```text
10 / 100
20 / 100
70 / 100
```

produce la misma proporción que:

```text
1 / 10
2 / 10
7 / 10
```

---

## 59. NORMALIZATION SAFETY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NORMALIZATION SAFETY

Normalizar no debe cambiar el resultado exacto esperado.

---

## 60. PRORATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRORATION

Proration es una forma especializada de allocation.

Conceptualmente:

```text
charge
× participation basis
```

---

## 61. PRORATION INPUT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRORATION INPUT

Puede utilizar:

```text
source amount
unit coefficient
area
participation
```

según la regla de negocio.

---

## 62. PRORATION OUTPUT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRORATION OUTPUT

Produce:

```text
target allocations
```

usando el Allocation Engine.

---

## 63. DOMAIN RULE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

DOMAIN RULE

El Allocation Engine no decide:

```text
qué coefficient usar
```

El dominio debe entregarlo.

---

## 64. CONCEPT INTEGRATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

CONCEPT INTEGRATION

Un Concept puede ejecutar:

```text
financial operation
+
allocation
```

pero la dependencia debe ser explícita en el Artifact.

---

## 65. UNIT INTEGRATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

UNIT INTEGRATION

Allocation normalmente opera sobre:

```text
Unit collection
```

del Snapshot.

---

## 66. SNAPSHOT SOURCE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

SNAPSHOT SOURCE

Targets y basis deben provenir de:

```text
Frozen DataSnapshot
```

cuando representen datos de la liquidación.

---

## 67. NO LIVE LOOKUP

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NO LIVE LOOKUP

No consultar Units o coefficients en vivo durante allocation.

---

## 68. ALLOCATION CONTEXT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ALLOCATION CONTEXT

Puede recibir:

```text
unitId
periodId
tenantId
source concept
```

para provenance.

---

## 69. PROVENANCE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PROVENANCE

Registrar cuando corresponda:

```text
executionId
unitId
sourceConceptId
policyId
```

---

## 70. ALLOCATION HASH

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ALLOCATION HASH

Puede calcularse:

```text
allocationHash
```

sobre representación canónica.

---

## 71. REPLAY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

REPLAY

Mismos inputs:

```text
same allocationHash
```

---

## 72. POLICY VERSION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

POLICY VERSION

Cambiar AllocationPolicy debe producir una nueva identidad de policy.

---

## 73. POLICY HASH

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md; Motor de liquidacion_Payment Application & Balance Engine 70.md; Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

POLICY HASH

Puede existir:

```text
allocationPolicyHash
```

---

## 74. ROUNDING POLICY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ROUNDING POLICY

Allocation Engine utiliza la policy del Documento 68.

No implementa una segunda versión de rounding.

---

## 75. MINOR UNIT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

MINOR UNIT

El residual debe distribuirse usando la mínima unidad monetaria autorizada.

Ejemplo conceptual:

```text
COP → 1
```

si esa es la configuración financiera aplicable.

---

## 76. RESIDUAL UNITS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL UNITS

Calcular:

```text
residualUnits
```

como cantidad entera de minor units.

---

## 77. RESIDUAL DISTRIBUTION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL DISTRIBUTION

Distribuir:

```text
+1 minor unit
```

o:

```text
-1 minor unit
```

según residual y policy.

---

## 78. RESIDUAL LIMIT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL LIMIT

No permitir residual superior al límite esperado de la policy.

---

## 79. ALLOCATION FAILURE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ALLOCATION FAILURE

Si no puede reconciliarse:

```text
fail allocation
```

no modificar silenciosamente source amount.

---

## 80. SOURCE IMMUTABILITY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

SOURCE IMMUTABILITY

Allocation Engine nunca modifica sourceAmount.

---

## 81. TARGET IMMUTABILITY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TARGET IMMUTABILITY

No modificar Unit/Snapshot data durante allocation.

---

## 82. RESULT IMMUTABILITY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESULT IMMUTABILITY

AllocationResult debe ser inmutable después de crearse.

---

## 83. PERFORMANCE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PERFORMANCE

Evitar:

```text
N database queries
```

para N targets.

---

## 84. BATCH INPUT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

BATCH INPUT

Targets deben llegar como colección del Snapshot.

---

## 85. COMPLEXITY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

COMPLEXITY

Allocation proporcional debe ser aproximadamente:

```text
O(N log N)
```

si requiere ordenar remainders.

---

## 86. MEMORY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

MEMORY

El engine debe respetar límites de:

```text
maxTargets
maxAllocationEntries
```

---

## 87. TOO MANY TARGETS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

TOO MANY TARGETS

```text
AEL_ALLOCATION_TARGET_LIMIT
```

---

## 88. EMPTY BASIS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EMPTY BASIS

No permitir basis collection vacía.

---

## 89. INVALID BASIS TYPE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

INVALID BASIS TYPE

```text
AEL_ALLOCATION_INVALID_BASIS
```

---

## 90. INVALID POLICY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

INVALID POLICY

```text
AEL_ALLOCATION_INVALID_POLICY
```

---

## 91. UNSUPPORTED POLICY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

UNSUPPORTED POLICY

```text
AEL_ALLOCATION_POLICY_UNSUPPORTED
```

---

## 92. RECONCILIATION POLICY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RECONCILIATION POLICY

Debe especificar si exige:

```text
exact equality
```

o un resultado controlado mediante minor units.

---

## 93. MINOR UNIT RECONCILIATION

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

MINOR UNIT RECONCILIATION

La igualdad final debe evaluarse en la representación financiera exacta.

---

## 94. NO EPSILON

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NO EPSILON

Nunca:

```text
abs(a-b) < 0.000001
```

como sustituto de igualdad financiera.

---

## 95. FINANCIAL OPERATION SERVICE

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

FINANCIAL OPERATION SERVICE

Todas las operaciones deben delegarse en:

```text
FinancialOperationService
```

del Documento 68.

---

## 96. NO DIRECT DECIMAL LIBRARY

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NO DIRECT DECIMAL LIBRARY

Allocation no debe llamar directamente una librería Decimal externa.

---

## 97. ERROR CONTEXT

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ERROR CONTEXT

Errores deben incluir cuando sea posible:

```text
sourceConceptId
targetId
policyId
executionId
```

---

## 98. DIAGNOSTICS

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

DIAGNOSTICS

Ejemplo:

```text
AEL_ALLOCATION_RECONCILIATION_FAILED
source = 100000
allocated = 99999
residual = 1
```

sin exponer información no necesaria.

---

## 99. BASIC PROPORTIONAL TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

BASIC PROPORTIONAL TEST

```text
source = 100
basis = [1, 1]
```

resultado:

```text
50 / 50
```

---

## 100. UNEQUAL PROPORTIONAL TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

UNEQUAL PROPORTIONAL TEST

```text
source = 100
basis = [1, 3]
```

resultado exacto:

```text
25 / 75
```

---

## 101. ROUNDING TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ROUNDING TEST

Usar importes que generen residual.

---

## 102. RESIDUAL TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

RESIDUAL TEST

Verificar:

```text
Σ allocations = source
```

---

## 103. DETERMINISTIC TIE TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

DETERMINISTIC TIE TEST

Remainders iguales:

```text
targetId
```

determina asignación.

---

## 104. EQUAL SHARE TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

EQUAL SHARE TEST

```text
100 / 3
```

debe producir distribución reconciliada según minor units/policy.

---

## 105. ZERO SOURCE TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ZERO SOURCE TEST

Source zero:

```text
all allocations zero
```

si policy lo permite.

---

## 106. ZERO BASIS TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ZERO BASIS TEST

Zero basis:

```text
allocation zero
```

si permitido.

---

## 107. ZERO TOTAL BASIS TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

ZERO TOTAL BASIS TEST

Debe rechazar.

---

## 108. DUPLICATE TARGET TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

DUPLICATE TARGET TEST

Debe rechazar por defecto.

---

## 109. CURRENCY TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

CURRENCY TEST

Source currency se conserva en todas las allocations.

---

## 110. NEGATIVE TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

NEGATIVE TEST

Negative basis/source no autorizado:

```text
rejected
```

---

## 111. FIXED AMOUNT TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

FIXED AMOUNT TEST

Verificar exactitud contra source.

---

## 112. WEIGHT TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

WEIGHT TEST

Weights:

```text
1, 2, 7
```

producen:

```text
10%, 20%, 70%
```

semánticamente.

---

## 113. COEFFICIENT TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

COEFFICIENT TEST

Coefficient inválido:

```text
rejected
```

---

## 114. SNAPSHOT TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

SNAPSHOT TEST

Modificar Snapshot después de construir request:

```text
allocation unchanged
```

porque usa Frozen Snapshot.

---

## 115. REPLAY TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md; Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REPLAY TEST

Mismos inputs:

```text
same allocationHash
```

---

## 116. POLICY CHANGE TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

POLICY CHANGE TEST

Cambiar policy:

```text
different policyHash
```

---

## 117. LIMIT TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

LIMIT TEST

Exceder targets:

```text
AEL_ALLOCATION_TARGET_LIMIT
```

---

## 118. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PERFORMANCE TEST

Distribuir entre gran número de Units sin consultas individuales.

---

## 119. SECURITY TEST

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

SECURITY TEST

No permitir:

```text
database access
provider access
host objects
```

desde Allocation Engine.

---

## 120. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRINCIPIO DE AISLAMIENTO

El engine calcula con los datos entregados.

No consulta ni modifica infraestructura externa.

---

## 121. PRINCIPIO DE EXACTITUD

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRINCIPIO DE EXACTITUD

Primero:

```text
exact allocation
```

después:

```text
rounding
```

y finalmente:

```text
residual reconciliation
```

según policy.

---

## 122. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Allocation & Proration Engine 69.md

PRINCIPIO DE DETERMINISMO

Mismos:

```text
source
basis
targets
policy
```

producen la misma distribución.

---

## 123. REFERENCIAS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md; Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REFERENCIAS

Consume:

```text
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 64 — Liquidation Execution Context & Data Snapshot
Documento 65 — Liquidation Calculation Pipeline & Execution Lifecycle
Documento 67 — Calculation Context, Variables & Intermediate Results
Documento 68 — Financial Calculation Semantics & Rounding Pipeline
Documento 69 — Allocation & Proration Engine
Documento 70 — Payment Application & Balance Engine
```

---

## 124. OBJETIVO

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

OBJETIVO

Transformar:

```text
Prior Balance
+
Current Charges
+
Applicable Payments
+
Adjustments
```

en:

```text
Balance Result
```

según las reglas del dominio.

---

## 125. PRINCIPIO

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRINCIPIO

El Payment Engine determina la aplicación financiera de pagos.

No consulta pagos en vivo durante una liquidación.

---

## 126. INPUTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

INPUTS

Conceptualmente:

```ts
interface BalanceCalculationInput {
  priorBalance: Money
  charges: Money
  payments: Payment[]
  adjustments: Money
  policy: PaymentApplicationPolicy
}
```

Los tipos definitivos deben respetar el dominio existente.

---

## 127. FROZEN PAYMENTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

FROZEN PAYMENTS

Payments deben provenir del:

```text
Frozen DataSnapshot
```

---

## 128. NO LIVE PAYMENT LOOKUP

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO LIVE PAYMENT LOOKUP

Durante ejecución no consultar:

```text
database
payment API
external ledger
```

para descubrir nuevos pagos.

---

## 129. PAYMENT IDENTITY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT IDENTITY

Cada Payment debe tener una identidad estable:

```text
paymentId
```

---

## 130. PAYMENT DATE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT DATE

La fecha del pago debe estar disponible cuando la policy dependa de:

```text
cutoff
period
application order
```

---

## 131. PAYMENT STATUS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT STATUS

Sólo payments con estado permitido por policy pueden ser aplicados.

Ejemplos:

```text
Confirmed
Posted
Settled
```

Los estados exactos pertenecen al dominio.

---

## 132. UNAPPLIED PAYMENTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

UNAPPLIED PAYMENTS

Un pago puede existir en Snapshot pero no ser aplicable a una liquidación.

Debe distinguirse:

```text
present
```

de:

```text
applicable
```

---

## 133. PAYMENT CUTOFF

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT CUTOFF

El Snapshot debe aplicar el cutoff definido para la liquidación.

---

## 134. CUTOFF RULE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CUTOFF RULE

Un pago posterior al cutoff:

```text
no afecta esta liquidación
```

salvo policy explícita.

---

## 135. PERIOD BOUNDARY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PERIOD BOUNDARY

La policy debe definir si un payment se determina por:

```text
payment date
posting date
effective date
application date
```

---

## 136. DATE SEMANTICS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

DATE SEMANTICS

No mezclar fechas de negocio diferentes.

---

## 137. PAYMENT CURRENCY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT CURRENCY

Payment currency debe ser compatible con el balance.

---

## 138. CURRENCY MISMATCH

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CURRENCY MISMATCH

No aplicar:

```text
COP payment
```

contra:

```text
USD balance
```

sin conversión explícita.

---

## 139. PAYMENT CONVERSION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT CONVERSION

Currency conversion, si existe, debe ser una operación financiera explícita y auditable.

---

## 140. PAYMENT AMOUNT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT AMOUNT

El amount debe ser Money.

---

## 141. ZERO PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ZERO PAYMENT

Un payment de cero normalmente no tiene efecto financiero.

La policy puede rechazarlo o ignorarlo.

---

## 142. NEGATIVE PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NEGATIVE PAYMENT

Un payment negativo no debe interpretarse automáticamente como pago.

Puede representar:

```text
reversal
refund
chargeback
```

según el dominio.

---

## 143. REVERSALS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

REVERSALS

Un reversal debe tener una relación explícita con el payment afectado cuando el dominio lo requiera.

---

## 144. DUPLICATE PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

DUPLICATE PAYMENT

El mismo Payment ID no debe aplicarse dos veces dentro de una ejecución.

---

## 145. DUPLICATE ERROR

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

DUPLICATE ERROR

```text
AEL_PAYMENT_DUPLICATE_APPLICATION
```

---

## 146. PAYMENT ORDER

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT ORDER

Si la policy requiere orden:

```text
effectiveDate
+
paymentId
```

pueden formar el orden determinista.

---

## 147. FIFO

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

FIFO

FIFO puede significar:

```text
oldest applicable charge first
```

pero la definición exacta pertenece a PaymentApplicationPolicy.

---

## 148. LIFO

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

LIFO

LIFO puede utilizarse sólo si el dominio lo autoriza.

---

## 149. SPECIFIC ALLOCATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

SPECIFIC ALLOCATION

Un payment puede indicar explícitamente a qué:

```text
charge
concept
period
```

se aplica.

---

## 150. PAYMENT PRIORITY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT PRIORITY

Una policy puede definir prioridad entre:

```text
specific allocation
period allocation
general balance
```

---

## 151. PAYMENT APPLICATION POLICY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT APPLICATION POLICY

Conceptualmente:

```ts
interface PaymentApplicationPolicy {
  cutoffRule: CutoffRule
  ordering: PaymentOrdering
  allocationStrategy: PaymentAllocationStrategy
  allowOverpayment: boolean
}
```

---

## 152. APPLICATION STRATEGIES

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

APPLICATION STRATEGIES

V1 puede contemplar:

```text
Specific
FIFO
LIFO
Proportional
GeneralBalance
```

sólo cuando el dominio lo autorice.

---

## 153. SPECIFIC FIRST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

SPECIFIC FIRST

Si existe una asignación específica válida:

```text
specific allocation
```

debe respetarse según policy.

---

## 154. GENERAL PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

GENERAL PAYMENT

Un payment sin destino específico puede aplicarse según:

```text
ordering
+
allocation strategy
```

---

## 155. PAYMENT TO CONCEPT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT TO CONCEPT

Si se permite aplicar a Concepts:

```text
conceptId
```

debe ser una referencia válida.

---

## 156. PAYMENT TO PERIOD

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT TO PERIOD

Si se permite aplicar a períodos:

```text
periodId
```

debe pertenecer al contexto permitido.

---

## 157. PAYMENT TO UNIT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT TO UNIT

Payment debe estar asociado a una Unit cuando el dominio lo requiera.

---

## 158. CROSS-UNIT PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CROSS-UNIT PAYMENT

No permitir aplicar automáticamente un payment de Unit A a Unit B.

---

## 159. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

TENANT ISOLATION

Payment sólo puede aplicarse dentro del:

```text
tenantId
```

del Snapshot.

---

## 160. PERIOD ISOLATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PERIOD ISOLATION

Payment application debe respetar las reglas del período.

---

## 161. PRIOR BALANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRIOR BALANCE

Prior Balance representa el saldo arrastrado desde períodos anteriores.

---

## 162. PRIOR BALANCE SOURCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRIOR BALANCE SOURCE

Debe provenir de:

```text
Frozen Snapshot
```

o de un resultado histórico validado incorporado al Snapshot.

---

## 163. NO LIVE BALANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO LIVE BALANCE

No consultar saldo actual durante la ejecución.

---

## 164. PRIOR BALANCE COMPONENTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRIOR BALANCE COMPONENTS

Puede estar compuesto por:

```text
prior charges
prior payments
prior adjustments
```

pero el detalle debe venir del dominio.

---

## 165. PRIOR BALANCE IMMUTABILITY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRIOR BALANCE IMMUTABILITY

No modificar el saldo histórico durante la ejecución.

---

## 166. CURRENT CHARGES

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CURRENT CHARGES

Current charges provienen de:

```text
Concept Results
```

del período actual.

---

## 167. CURRENT ADJUSTMENTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CURRENT ADJUSTMENTS

Adjustments deben ser explícitos y tipados.

---

## 168. BALANCE FORMULA

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

BALANCE FORMULA

Conceptualmente:

```text
endingBalance
=
priorBalance
+
currentCharges
+
adjustments
-
appliedPayments
```

---

## 169. POSITIVE BALANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

POSITIVE BALANCE

Representa saldo pendiente si esa es la convención del dominio.

---

## 170. ZERO BALANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ZERO BALANCE

Indica ausencia de saldo según la convención financiera.

---

## 171. NEGATIVE BALANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NEGATIVE BALANCE

Puede representar:

```text
credit
overpayment
balance in favor
```

según policy.

---

## 172. CREDIT POLICY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CREDIT POLICY

El tratamiento de créditos debe estar definido explícitamente.

---

## 173. OVERPAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

OVERPAYMENT

Si:

```text
payments > amount due
```

la policy determina:

```text
credit
refund
carry forward
reject
```

---

## 174. NO SILENT DISCARD

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO SILENT DISCARD

Nunca descartar silenciosamente un excedente de pago.

---

## 175. PAYMENT APPLICATION RESULT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT APPLICATION RESULT

Conceptualmente:

```ts
interface PaymentApplicationResult {
  paymentId: PaymentId
  appliedAmount: Money
  unappliedAmount: Money
  targets: PaymentAllocation[]
}
```

---

## 176. PAYMENT ALLOCATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT ALLOCATION

Cuando un payment se aplica a múltiples conceptos:

```text
Payment
 ↓
Allocation
 ↓
Concept balances
```

---

## 177. ALLOCATION ENGINE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ALLOCATION ENGINE

La distribución proporcional puede reutilizar:

```text
Allocation & Proration Engine
```

cuando la estrategia sea proporcional.

---

## 178. NO DUPLICATE ALLOCATION LOGIC

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO DUPLICATE ALLOCATION LOGIC

Payment Engine no debe implementar una segunda versión de:

```text
rounding
residual
allocation
```

---

## 179. PAYMENT ROUNDING

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT ROUNDING

Utilizar FinancialOperationService y las policies definidas en Documento 68.

---

## 180. PAYMENT RESIDUAL

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT RESIDUAL

Si una aplicación genera residual:

```text
PaymentAllocationPolicy
```

debe resolverlo de forma determinista.

---

## 181. PAYMENT RECONCILIATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT RECONCILIATION

Validar:

```text
applied + unapplied = payment amount
```

---

## 182. CHARGE RECONCILIATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CHARGE RECONCILIATION

Validar que las aplicaciones a cargos no excedan el saldo aplicable, salvo overpayment policy.

---

## 183. APPLICATION LIMIT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

APPLICATION LIMIT

Para cada payment:

```text
appliedAmount <= paymentAmount
```

salvo semántica explícita.

---

## 184. CHARGE LIMIT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CHARGE LIMIT

Para cada charge:

```text
appliedPayments <= applicableCharge
```

salvo créditos/overpayments autorizados.

---

## 185. PAYMENT APPLICATION GRAPH

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT APPLICATION GRAPH

Si existen:

```text
payment → charge
```

las relaciones deben ser explícitas.

---

## 186. PAYMENT PROVENANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT PROVENANCE

Cada aplicación debe poder rastrearse:

```text
paymentId
chargeId/conceptId
unitId
executionId
snapshotHash
policyHash
```

según el nivel de auditoría requerido.

---

## 187. APPLICATION HASH

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

APPLICATION HASH

Puede calcularse:

```text
paymentApplicationHash
```

sobre representación canónica.

---

## 188. REPLAY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

REPLAY

Mismos:

```text
Snapshot
Policy
Charges
```

deben producir las mismas aplicaciones.

---

## 189. PAYMENT STATUS OUTPUT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT STATUS OUTPUT

Cada payment puede terminar como:

```text
Applied
PartiallyApplied
Unapplied
Rejected
Ignored
```

---

## 190. REJECTION REASON

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

REJECTION REASON

Rejected debe incluir una razón:

```text
wrong tenant
wrong period
invalid status
currency mismatch
duplicate
outside cutoff
```

---

## 191. IGNORED

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

IGNORED

Ignored debe utilizarse sólo cuando la policy determine que el payment no participa.

---

## 192. PAYMENT AUDIT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT AUDIT

No registrar sólo el total.

Debe poder reconstruirse:

```text
which payment
how much
where applied
why
```

cuando la política de auditoría lo requiera.

---

## 193. PAYMENT ORDERING

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT ORDERING

El orden debe ser estable.

Default conceptual:

```text
effectiveDate ASC
paymentId ASC
```

cuando FIFO sea aplicable.

---

## 194. CHARGE ORDERING

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CHARGE ORDERING

Si FIFO aplica a cargos:

```text
charge effective date ASC
concept priority ASC
conceptId ASC
```

según domain policy.

---

## 195. DETERMINISTIC TIES

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

DETERMINISTIC TIES

Toda igualdad debe resolverse mediante un identificador canónico.

---

## 196. PARTIAL PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PARTIAL PAYMENT

Si payment < charge:

```text
remaining charge
```

debe permanecer pendiente.

---

## 197. FULL PAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

FULL PAYMENT

Si payment = charge:

```text
remaining charge = 0
```

---

## 198. OVERPAYMENT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

OVERPAYMENT

Si payment > charge:

```text
remaining payment
```

pasa a la siguiente aplicación o a credit policy.

---

## 199. CREDIT CARRY FORWARD

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CREDIT CARRY FORWARD

Si se permite:

```text
unapplied payment
```

puede convertirse en crédito para períodos posteriores.

---

## 200. CREDIT SNAPSHOT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CREDIT SNAPSHOT

El crédito debe formar parte del Snapshot de la siguiente liquidación.

---

## 201. NO READING FUTURE PERIOD

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO READING FUTURE PERIOD

El engine no debe consultar períodos futuros para decidir el resultado actual.

---

## 202. ADJUSTMENTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ADJUSTMENTS

Adjustments pueden representar:

```text
debit
credit
correction
```

y deben tener signo y motivo explícitos.

---

## 203. ADJUSTMENT PROVENANCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ADJUSTMENT PROVENANCE

Debe existir:

```text
adjustmentId
reason
source
```

cuando el dominio lo requiera.

---

## 204. ADJUSTMENT ORDER

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ADJUSTMENT ORDER

Si adjustments dependen de conceptos, el Dependency Planner debe controlar el orden.

---

## 205. BALANCE COMPONENTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

BALANCE COMPONENTS

El resultado puede separar:

```text
priorBalance
currentCharges
adjustments
appliedPayments
endingBalance
```

---

## 206. BALANCE RESULT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

BALANCE RESULT

Conceptualmente:

```ts
interface BalanceResult {
  priorBalance: Money
  currentCharges: Money
  adjustments: Money
  appliedPayments: Money
  endingBalance: Money
}
```

---

## 207. COMPONENT RECONCILIATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

COMPONENT RECONCILIATION

Validar:

```text
prior
+
charges
+
adjustments
-
payments
=
ending
```

---

## 208. CURRENCY CONSISTENCY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CURRENCY CONSISTENCY

Todos los componentes deben compartir currency.

---

## 209. ROUNDING

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ROUNDING

El balance final debe utilizar la rounding policy definida por el dominio.

---

## 210. NO DISPLAY ROUNDING

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO DISPLAY ROUNDING

No calcular balance usando valores formateados para pantalla.

---

## 211. NEGATIVE BALANCE POLICY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NEGATIVE BALANCE POLICY

Si endingBalance < 0:

```text
credit/overpayment policy
```

debe determinar su tratamiento.

---

## 212. ZERO BALANCE POLICY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ZERO BALANCE POLICY

Zero debe permanecer como valor financiero exacto.

---

## 213. SNAPSHOT CONSISTENCY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

SNAPSHOT CONSISTENCY

Todos los payments y balances usados deben pertenecer al mismo:

```text
snapshotHash
```

---

## 214. MIXED SNAPSHOTS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

MIXED SNAPSHOTS

No combinar:

```text
payment snapshot A
+
balance snapshot B
```

---

## 215. SNAPSHOT MISMATCH

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md; Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SNAPSHOT MISMATCH

```text
AEL_ADJUSTMENT_SNAPSHOT_MISMATCH
```

---

## 216. UNIT ISOLATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

UNIT ISOLATION

Payment application de Unit A no puede alterar Unit B.

---

## 217. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

TENANT ISOLATION

Payment de Tenant A no puede aparecer en Tenant B.

---

## 218. PERIOD ISOLATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PERIOD ISOLATION

Payment aplicado al período actual no debe duplicarse en otro período por error.

---

## 219. APPLICATION UNIQUENESS

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

APPLICATION UNIQUENESS

La combinación:

```text
executionId
paymentId
allocationTarget
```

debe ser única cuando represente una aplicación.

---

## 220. CONCURRENCY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CONCURRENCY

Concurrent executions deben respetar la policy del Lifecycle.

---

## 221. NO LIVE LOCK REQUIRED

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

NO LIVE LOCK REQUIRED

Con Snapshot congelado, no es necesario bloquear cada Payment durante todo el cálculo.

---

## 222. PERSISTENCE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PERSISTENCE

Payment applications finales se persisten después de que la liquidación haya superado validaciones.

---

## 223. ATOMIC FINALIZATION

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

ATOMIC FINALIZATION

Cuando una aplicación de pago produzca efectos persistentes:

```text
execution
+
application records
+
result
```

deben finalizar bajo garantías transaccionales apropiadas.

---

## 224. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

IDEMPOTENCY

Reintentar una ejecución no debe duplicar Payment Applications.

---

## 225. APPLICATION IDEMPOTENCY KEY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

APPLICATION IDEMPOTENCY KEY

Puede utilizar:

```text
executionId
paymentId
targetId
```

o una identidad equivalente definida por persistence layer.

---

## 226. RETRY

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

RETRY

Retry debe preservar:

```text
same business request
```

pero evitar duplicar efectos.

---

## 227. FAILURE

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

FAILURE

Si Payment Engine falla:

```text
balance calculation fails
```

salvo policy explícita.

---

## 228. PAYMENT ENGINE OUTPUT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PAYMENT ENGINE OUTPUT

Debe devolver:

```text
applications
payment statuses
unapplied amounts
reconciliation
```

---

## 229. BALANCE ENGINE OUTPUT

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

BALANCE ENGINE OUTPUT

Debe devolver:

```text
component totals
ending balance
reconciliation
```

---

## 230. BASIC PAYMENT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

BASIC PAYMENT TEST

```text
charge = 100
payment = 100
```

resultado:

```text
balance = 0
```

---

## 231. PARTIAL PAYMENT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PARTIAL PAYMENT TEST

```text
charge = 100
payment = 40
```

resultado:

```text
balance = 60
```

---

## 232. OVERPAYMENT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

OVERPAYMENT TEST

```text
charge = 100
payment = 120
```

verificar:

```text
credit/unapplied = 20
```

según policy.

---

## 233. MULTIPLE PAYMENT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

MULTIPLE PAYMENT TEST

```text
payments = 40 + 30 + 30
charge = 100
```

debe terminar:

```text
balance = 0
```

---

## 234. FIFO TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

FIFO TEST

Verificar aplicación al cargo más antiguo según policy.

---

## 235. SPECIFIC ALLOCATION TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

SPECIFIC ALLOCATION TEST

Payment asignado explícitamente a Concept:

```text
honored
```

cuando válido.

---

## 236. CUTOFF TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CUTOFF TEST

Payment posterior al cutoff:

```text
not applied
```

---

## 237. DUPLICATE PAYMENT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

DUPLICATE PAYMENT TEST

Mismo Payment ID dos veces:

```text
rejected/deduplicated
```

según policy.

---

## 238. CURRENCY TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CURRENCY TEST

Currency mismatch:

```text
rejected
```

---

## 239. SNAPSHOT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md; Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SNAPSHOT TEST

Cambiar la fuente después del Snapshot:

```text
result unchanged
```

---

## 240. BALANCE RECONCILIATION TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

BALANCE RECONCILIATION TEST

Verificar fórmula completa.

---

## 241. CREDIT TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CREDIT TEST

Negative ending balance:

```text
credit policy
```

correctamente aplicada.

---

## 242. REPLAY TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

REPLAY TEST

Mismos inputs:

```text
same paymentApplicationHash
same balance result
```

---

## 243. IDEMPOTENCY TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

IDEMPOTENCY TEST

Retry:

```text
no duplicate application
```

---

## 244. TENANT SECURITY TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

TENANT SECURITY TEST

Payment de otro tenant:

```text
rejected
```

---

## 245. PERIOD SECURITY TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PERIOD SECURITY TEST

Payment fuera del contexto:

```text
rejected/ignored
```

según policy.

---

## 246. CONCURRENCY TEST

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

CONCURRENCY TEST

Dos executions conflictivas:

```text
policy respected
```

---

## 247. PRINCIPIO DE CONSISTENCIA

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRINCIPIO DE CONSISTENCIA

Todos los componentes financieros deben provenir del mismo Snapshot y respetar la misma policy de ejecución.

---

## 248. PRINCIPIO DE NO DUPLICACIÓN

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRINCIPIO DE NO DUPLICACIÓN

Un Payment aplicado una vez no debe volver a aplicarse por reintentos o caminos paralelos.

---

## 249. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Payment Application & Balance Engine 70.md

PRINCIPIO DE TRAZABILIDAD

Cada aplicación debe poder responder:

```text
qué pago
qué importe
a qué se aplicó
por qué
con qué policy
en qué ejecución
```

---

## 250. OBJETIVO

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

OBJETIVO

Transformar novedades autorizadas en ajustes financieros tipados:

```text
Novelty
 ↓
Eligibility
 ↓
Validation
 ↓
Normalization
 ↓
Financial Adjustment
 ↓
Calculation Context
 ↓
Balance / Result
```

---

## 251. PRINCIPIO

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PRINCIPIO

Una novedad es un hecho de negocio; un ajuste es su representación financiera dentro de la liquidación.

---

## 252. NOVELTY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NOVELTY

Conceptualmente:

```ts
interface Novelty {
  noveltyId: NoveltyId
  type: NoveltyType
  unitId: UnitId
  effectiveDate: Date
  status: NoveltyStatus
  data: unknown
}
```

Los campos definitivos dependen del dominio.

---

## 253. ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT

Conceptualmente:

```ts
interface Adjustment {
  adjustmentId: AdjustmentId
  unitId: UnitId
  amount: Money
  direction: AdjustmentDirection
  reason: string
}
```

---

## 254. NOVELTY ≠ ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NOVELTY ≠ ADJUSTMENT

Una novedad puede no producir un importe directamente.

Puede producir:

```text
eligibility change
quantity change
rate override
fixed charge
credit
debit
```

---

## 255. SOURCE OF TRUTH

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SOURCE OF TRUTH

Las novedades aplicables deben provenir del:

```text
Frozen DataSnapshot
```

---

## 256. NO LIVE NOVELTY LOOKUP

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO LIVE NOVELTY LOOKUP

Durante la ejecución no consultar novedades en vivo.

---

## 257. NOVELTY STATUS

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NOVELTY STATUS

Sólo novedades con estado autorizado pueden participar.

Ejemplos:

```text
Approved
Active
Confirmed
```

Los estados exactos pertenecen al dominio.

---

## 258. PENDING NOVELTY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PENDING NOVELTY

Una novedad pendiente no debe aplicarse automáticamente salvo policy explícita.

---

## 259. REJECTED NOVELTY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REJECTED NOVELTY

Una novedad rechazada no produce ajuste.

---

## 260. NOVELTY EFFECTIVE DATE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NOVELTY EFFECTIVE DATE

La fecha efectiva determina si la novedad participa en el período.

---

## 261. PERIOD ELIGIBILITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PERIOD ELIGIBILITY

Validar:

```text
effectiveDate
periodStart
periodEnd
```

según la policy.

---

## 262. CUT-OFF

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CUT-OFF

Si existe cutoff específico para novedades:

```text
NoveltySnapshot
```

debe respetarlo.

---

## 263. UNIT SCOPE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

UNIT SCOPE

Una novedad normalmente pertenece a una Unit.

No aplicar una novedad de Unit A a Unit B.

---

## 264. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

TENANT ISOLATION

La novedad debe pertenecer al tenant del Snapshot.

---

## 265. DUPLICATE NOVELTY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DUPLICATE NOVELTY

La misma novedad no debe generar dos ajustes equivalentes en una ejecución.

---

## 266. DUPLICATE DETECTION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DUPLICATE DETECTION

Identity mínima:

```text
noveltyId
executionId
```

---

## 267. DUPLICATE ERROR

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DUPLICATE ERROR

```text
AEL_ADJUSTMENT_DUPLICATE_NOVELTY
```

---

## 268. NOVELTY TYPES

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NOVELTY TYPES

V1 puede contemplar:

```text
ManualCharge
Credit
Debit
QuantityOverride
RateOverride
EligibilityOverride
FixedAdjustment
PercentageAdjustment
```

sólo cuando el dominio los autorice.

---

## 269. MANUAL CHARGE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MANUAL CHARGE

ManualCharge representa un importe adicional introducido mediante una novedad autorizada.

---

## 270. CREDIT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CREDIT

Credit reduce el importe a pagar o genera un saldo a favor según policy.

---

## 271. DEBIT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DEBIT

Debit incrementa el importe exigible.

---

## 272. FIXED ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

FIXED ADJUSTMENT

Importe explícito:

```text
Money
```

---

## 273. PERCENTAGE ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PERCENTAGE ADJUSTMENT

Puede calcularse como:

```text
base × percentage
```

utilizando FinancialOperationService.

---

## 274. RATE OVERRIDE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RATE OVERRIDE

Puede sustituir una tarifa aplicable si la policy permite override.

---

## 275. OVERRIDE AUTHORIZATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

OVERRIDE AUTHORIZATION

Un override no debe ser válido sólo porque exista en datos.

Debe cumplir:

```text
status
effective date
scope
authorization policy
```

---

## 276. QUANTITY OVERRIDE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

QUANTITY OVERRIDE

Puede cambiar una cantidad utilizada por una fórmula.

Debe validarse antes de la evaluación del Concept dependiente.

---

## 277. ELIGIBILITY OVERRIDE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ELIGIBILITY OVERRIDE

Puede modificar si una Unit participa en determinado cargo.

Debe ser explícito y auditable.

---

## 278. NOVELTY NORMALIZATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NOVELTY NORMALIZATION

Antes de entrar al Runtime:

```text
raw novelty
 ↓
validated domain novelty
 ↓
normalized adjustment input
```

---

## 279. NORMALIZATION PURPOSE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NORMALIZATION PURPOSE

Convertir diferentes representaciones de negocio en una forma estable para el motor.

---

## 280. NO RAW OBJECTS

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO RAW OBJECTS

AEL no debe recibir objetos arbitrarios provenientes directamente de persistencia.

---

## 281. TYPED DATA

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

TYPED DATA

Los datos normalizados deben conservar:

```text
type
unit
period
effective date
source
```

---

## 282. SOURCE PROVENANCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SOURCE PROVENANCE

Registrar:

```text
noveltyId
source
createdAt
approvedAt
```

cuando el dominio lo requiera.

---

## 283. APPROVAL

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

APPROVAL

Si una novedad requiere aprobación:

```text
approvedBy
approvedAt
approvalReference
```

pueden formar parte de provenance.

---

## 284. NO APPROVAL BY RUNTIME

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO APPROVAL BY RUNTIME

El Runtime no decide si una novedad fue correctamente aprobada.

---

## 285. POLICY BOUNDARY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

POLICY BOUNDARY

La validación de autorización pertenece a la capa de aplicación/dominio.

---

## 286. ADJUSTMENT CREATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT CREATION

Sólo crear Adjustment después de pasar eligibility y validation.

---

## 287. ADJUSTMENT SIGN

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT SIGN

Preferir una semántica explícita:

```text
Credit
Debit
```

en lugar de depender únicamente del signo.

---

## 288. SIGN CONSISTENCY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SIGN CONSISTENCY

Si existe amount negativo, debe ser coherente con la dirección definida.

No permitir:

```text
Credit + negative amount
```

si la policy prohíbe esa representación.

---

## 289. ZERO ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ZERO ADJUSTMENT

Un ajuste cero normalmente no tiene efecto.

Puede rechazarse o registrarse según policy.

---

## 290. CURRENCY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CURRENCY

Adjustment currency debe coincidir con la liquidación salvo conversión explícita.

---

## 291. CONVERSION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CONVERSION

No convertir currency implícitamente.

---

## 292. ADJUSTMENT ROUNDING

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT ROUNDING

Utilizar las reglas del Documento 68.

No implementar rounding local.

---

## 293. ADJUSTMENT ALLOCATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT ALLOCATION

Si un ajuste debe distribuirse entre varias Units:

```text
Allocation Engine
```

del Documento 69.

---

## 294. NO DUPLICATE ALLOCATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO DUPLICATE ALLOCATION

No crear un segundo algoritmo de prorrateo dentro de Adjustments.

---

## 295. ADJUSTMENT TARGET

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT TARGET

Un ajuste debe indicar:

```text
unit
concept
period
```

cuando sea necesario para determinar su efecto.

---

## 296. GLOBAL ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

GLOBAL ADJUSTMENT

Un ajuste global puede aplicarse al conjunto de Units mediante Allocation Policy.

---

## 297. GLOBAL ADJUSTMENT SOURCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

GLOBAL ADJUSTMENT SOURCE

Debe existir una regla explícita para determinar el target set.

---

## 298. TARGET SET

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

TARGET SET

El conjunto de Units debe provenir del Snapshot y del scope de liquidación.

---

## 299. MANUAL CHARGE BASE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MANUAL CHARGE BASE

Un manual charge puede ser:

```text
fixed
quantity × rate
percentage of base
```

según configuración.

---

## 300. QUANTITY × RATE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

QUANTITY × RATE

La operación debe utilizar:

```text
typed quantity
typed rate
FinancialOperationService
```

---

## 301. PERCENTAGE BASE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PERCENTAGE BASE

La base debe estar declarada:

```text
concept
subtotal
balance component
domain value
```

---

## 302. NO AMBIGUOUS BASE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO AMBIGUOUS BASE

No permitir que el motor "adivine" la base.

---

## 303. BASE DEPENDENCY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

BASE DEPENDENCY

Si un ajuste depende de un Concept:

```text
explicit dependency
```

debe incorporarse al Dependency Graph.

---

## 304. CALCULATION ORDER

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CALCULATION ORDER

El ajuste debe calcularse después de sus dependencias.

---

## 305. ADJUSTMENT CONCEPT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT CONCEPT

Cuando un ajuste se expresa como Concept, debe seguir:

```text
Concept Planner
+
Runtime
```

---

## 306. EXTERNAL ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

EXTERNAL ADJUSTMENT

Cuando proviene de una novedad ya convertida a Money, puede entrar como input tipado.

---

## 307. ADJUSTMENT INPUT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT INPUT

El CalculationContext puede exponer:

```text
getAdjustment(adjustmentId)
```

según access policy.

---

## 308. ACCESS CONTROL

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ACCESS CONTROL

Un Concept sólo puede acceder a ajustes autorizados para su scope.

---

## 309. UNDECLARED ADJUSTMENT ACCESS

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

UNDECLARED ADJUSTMENT ACCESS

```text
AEL_ADJUSTMENT_UNDECLARED_ACCESS
```

---

## 310. ADJUSTMENT RESULT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT RESULT

El resultado debe conservar:

```text
adjustmentId
amount
direction
unitId
conceptId
```

cuando corresponda.

---

## 311. RESULT IMMUTABILITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RESULT IMMUTABILITY

Una vez publicado, AdjustmentResult es inmutable.

---

## 312. ADJUSTMENT HASH

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT HASH

Puede calcularse:

```text
adjustmentHash
```

sobre representación canónica.

---

## 313. REPLAY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REPLAY

Mismo:

```text
Snapshot
Artifact
Parameters
Policy
```

debe producir el mismo adjustmentHash.

---

## 314. PROVENANCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PROVENANCE

Cada ajuste debe poder rastrearse hasta:

```text
noveltyId
source
executionId
snapshotHash
artifactHash
```

según el nivel requerido.

---

## 315. AUDIT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

AUDIT

Para ajustes manuales materialmente relevantes, debe poder explicarse:

```text
qué se ajustó
por qué
quién/origen
cuánto
a quién
en qué período
```

---

## 316. MANUAL CHARGE REASON

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MANUAL CHARGE REASON

ManualCharge debe tener motivo obligatorio cuando la policy lo exija.

---

## 317. REASON CODE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REASON CODE

Preferir:

```text
reasonCode
```

estructurado sobre texto libre cuando exista catálogo.

---

## 318. COMMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

COMMENT

Texto adicional puede existir como:

```text
comment
```

pero no sustituye reasonCode.

---

## 319. ATTACHMENT REFERENCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ATTACHMENT REFERENCE

Una novedad puede tener referencia documental:

```text
documentReference
```

pero el motor no necesita cargar el documento para calcular.

---

## 320. DOCUMENT PROVENANCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DOCUMENT PROVENANCE

Sólo conservar referencia necesaria para auditoría.

---

## 321. MANUAL OVERRIDE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MANUAL OVERRIDE

Overrides manuales deben ser explícitos.

No permitir modificar directamente variables internas del Runtime.

---

## 322. NO RUNTIME PATCH

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO RUNTIME PATCH

Nunca:

```text
patch runtime variable
```

como mecanismo de corrección.

---

## 323. CORRECTION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CORRECTION

Una corrección produce:

```text
new novelty/adjustment
```

o nueva ejecución, según policy.

---

## 324. HISTORICAL IMMUTABILITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

HISTORICAL IMMUTABILITY

No modificar retroactivamente un AdjustmentResult finalizado.

---

## 325. CANCELLATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CANCELLATION

Si una novedad se cancela:

```text
cancellation
```

debe quedar representada mediante el modelo de dominio.

No borrar silenciosamente el historial.

---

## 326. REVERSAL

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REVERSAL

Una corrección financiera puede requerir:

```text
reversal adjustment
```

en lugar de modificar el anterior.

---

## 327. REVERSAL PROVENANCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REVERSAL PROVENANCE

Debe referenciar:

```text
originalAdjustmentId
```

---

## 328. ADJUSTMENT ORDER

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT ORDER

Si existen múltiples ajustes:

```text
effectiveDate
priority
adjustmentId
```

pueden formar el orden determinista.

---

## 329. PRIORITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PRIORITY

Priority no puede violar dependency constraints.

---

## 330. MULTIPLE ADJUSTMENTS

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MULTIPLE ADJUSTMENTS

Ajustes independientes pueden agregarse después de validar cada uno.

---

## 331. AGGREGATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

AGGREGATION

La suma de ajustes debe utilizar FinancialOperationService.

---

## 332. ADJUSTMENT TOTAL

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ADJUSTMENT TOTAL

Puede calcularse:

```text
totalDebits
totalCredits
netAdjustment
```

---

## 333. NET ADJUSTMENT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NET ADJUSTMENT

Conceptualmente:

```text
netAdjustment
=
totalDebits
-
totalCredits
```

según la convención del dominio.

---

## 334. BALANCE INTEGRATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

BALANCE INTEGRATION

El netAdjustment puede alimentar:

```text
Balance Engine
```

del Documento 70.

---

## 335. NO PAYMENT MIX

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NO PAYMENT MIX

Adjustments no deben mezclarse con Payment records.

---

## 336. PAYMENT DISTINCTION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PAYMENT DISTINCTION

```text
Payment
=
money received/applied

Adjustment
=
business correction/charge/credit
```

---

## 337. CREDIT DISTINCTION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CREDIT DISTINCTION

Un Credit adjustment no es automáticamente un Payment.

---

## 338. DEBIT DISTINCTION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DEBIT DISTINCTION

Un Debit adjustment no es automáticamente un charge generado por un Concept.

---

## 339. SOURCE TYPE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SOURCE TYPE

El resultado debe distinguir:

```text
ConceptCharge
ManualCharge
Adjustment
Payment
```

cuando el modelo de resultado lo requiera.

---

## 340. RESULT TRACEABILITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RESULT TRACEABILITY

Esto permite explicar:

```text
total
```

como composición de fuentes distintas.

---

## 341. COMPOSITION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

COMPOSITION

Ejemplo:

```text
Concept charges
+
Manual charges
+
Debits
-
Credits
-
Payments
=
Ending balance
```

---

## 342. RECONCILIATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RECONCILIATION

La composición debe reconciliar con BalanceResult.

---

## 343. SNAPSHOT CONSISTENCY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SNAPSHOT CONSISTENCY

Todas las novedades de una ejecución deben provenir del mismo Snapshot.

---

## 344. MIXED SNAPSHOT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MIXED SNAPSHOT

No combinar novedades de snapshots diferentes.

---

## 345. TENANT SECURITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

TENANT SECURITY

Una novedad de otro tenant debe rechazarse.

---

## 346. PERIOD SECURITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PERIOD SECURITY

Una novedad fuera del período debe evaluarse según effective-date policy.

---

## 347. UNIT SECURITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

UNIT SECURITY

No aplicar novedades de una Unit a otra.

---

## 348. SCOPE SECURITY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SCOPE SECURITY

Global adjustment sólo puede aplicarse al scope autorizado.

---

## 349. RESOURCE LIMIT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RESOURCE LIMIT

Limitar:

```text
maxNovelties
maxAdjustments
maxAdjustmentEntries
```

---

## 350. TOO MANY NOVELTIES

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

TOO MANY NOVELTIES

```text
AEL_ADJUSTMENT_NOVELTY_LIMIT
```

---

## 351. PERFORMANCE

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PERFORMANCE

No consultar una novedad individualmente desde database durante el cálculo.

---

## 352. BATCH INPUT

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

BATCH INPUT

Todas las novedades necesarias deben estar disponibles desde Snapshot/Context.

---

## 353. MEMORY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

MEMORY

Adjustment collections cuentan contra Runtime memory budget.

---

## 354. ERROR HANDLING

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ERROR HANDLING

Errores de una novedad inválida deben impedir su aplicación.

La policy determina si esto:

```text
fails entire liquidation
```

o:

```text
isolates invalid novelty
```

---

## 355. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

V1 RECOMMENDATION

Novedad inválida material para el resultado:

```text
fail liquidation
```

para evitar resultados silenciosamente incompletos.

---

## 356. NON-MATERIAL NOVELTY

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

NON-MATERIAL NOVELTY

Una novedad explícitamente marcada como no aplicable puede producir:

```text
Skipped
```

con reason.

---

## 357. SKIPPED ≠ FAILED

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SKIPPED ≠ FAILED

Skipped significa:

```text
valid but not applicable
```

Failed significa:

```text
processing error
```

---

## 358. BASIC MANUAL CHARGE TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

BASIC MANUAL CHARGE TEST

```text
ManualCharge = 100
```

debe aumentar el importe exigible según policy.

---

## 359. CREDIT TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CREDIT TEST

```text
Credit = 20
```

debe reducir el saldo según policy.

---

## 360. DEBIT TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DEBIT TEST

```text
Debit = 30
```

debe aumentar el saldo.

---

## 361. QUANTITY OVERRIDE TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

QUANTITY OVERRIDE TEST

Override:

```text
quantity
```

debe afectar sólo los Concepts autorizados.

---

## 362. RATE OVERRIDE TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RATE OVERRIDE TEST

Rate override debe producir resultado sólo cuando:

```text
authorization
+
effective date
```

sean válidos.

---

## 363. DUPLICATE TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

DUPLICATE TEST

Misma novelty:

```text
no double application
```

---

## 364. TENANT TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

TENANT TEST

Cross-tenant novelty:

```text
rejected
```

---

## 365. PERIOD TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PERIOD TEST

Fuera de período:

```text
skipped/rejected
```

según policy.

---

## 366. ALLOCATION TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ALLOCATION TEST

Global manual charge:

```text
Allocation Engine
```

produce distribución reconciliada.

---

## 367. ROUNDING TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

ROUNDING TEST

Percentage adjustment respeta:

```text
RoundingPolicy
```

---

## 368. REVERSAL TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

REVERSAL TEST

Reversal referencia correctamente:

```text
originalAdjustmentId
```

---

## 369. CORRECTION TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

CORRECTION TEST

Corrección no modifica AdjustmentResult histórico.

---

## 370. RECONCILIATION TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

RECONCILIATION TEST

Verificar:

```text
charges
+
debits
-
credits
=
net adjustment/charge composition
```

según modelo.

---

## 371. LIMIT TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

LIMIT TEST

Exceder novelty limit:

```text
AEL_ADJUSTMENT_NOVELTY_LIMIT
```

---

## 372. SECURITY TEST

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

SECURITY TEST

No exponer:

```text
database
provider
host objects
```

al engine.

---

## 373. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PRINCIPIO DE TRAZABILIDAD

Toda novedad que modifique dinero debe poder relacionarse con su origen.

---

## 374. PRINCIPIO DE SEPARACIÓN

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PRINCIPIO DE SEPARACIÓN

```text
Payment
≠
Adjustment
≠
Concept Charge
```

aunque los tres puedan afectar el saldo.

---

## 375. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PRINCIPIO DE INMUTABILIDAD

Un ajuste finalizado no se modifica; se corrige mediante una nueva operación.

---

## 376. PRINCIPIO DE EXPLICITUD

> **Origen:** Motor de liquidacion_Adjustments, Novelties & Manual Charges Engine 71.md

PRINCIPIO DE EXPLICITUD

Un override financiero debe declarar:

```text
qué modifica
por qué
desde cuándo
hasta cuándo
quién/origen
```

cuando la policy lo requiera.

---
