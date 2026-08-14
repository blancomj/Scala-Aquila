# AEL V1 — Liquidation Engine — Result, Explanation, Audit & Validation

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
72 — Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md
73 — Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md
74 — Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md
```

## 1. REFERENCIAS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md; Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md; Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

REFERENCIAS

Consume:

```text
Documento 61 — Artifact Format, Serialization & Integrity
Documento 64 — Liquidation Execution Context & Data Snapshot
Documento 65 — Liquidation Calculation Pipeline & Execution Lifecycle
Documento 66 — Concept Dependency Graph & Calculation Ordering
Documento 67 — Calculation Context, Variables & Intermediate Results
Documento 68 — Financial Calculation Semantics & Rounding Pipeline
Documento 69 — Allocation & Proration Engine
Documento 70 — Payment Application & Balance Engine
Documento 71 — Adjustments, Novelties & Manual Charges Engine
Documento 72 — Charge Composition & Liquidation Result Engine
```

---

## 2. OBJETIVO

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

OBJETIVO

Construir:

```text
Concept Results
+
Manual Charges
+
Adjustments
+
Payments
+
Prior Balance
        ↓
Liquidation Result
```

---

## 3. PRINCIPIO

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRINCIPIO

El Result Engine compone resultados; no recalcula las fuentes.

---

## 4. SOURCE CATEGORIES

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE CATEGORIES

El resultado debe distinguir:

```text
ConceptCharge
ManualCharge
DebitAdjustment
CreditAdjustment
Payment
PriorBalance
```

---

## 5. RESULT IDENTITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT IDENTITY

Conceptualmente:

```ts
interface LiquidationResult {
  executionId: ExecutionId
  tenantId: TenantId
  periodId: PeriodId
  snapshotHash: string
  artifactHash: string
  totals: LiquidationTotals
  units: UnitLiquidationResult[]
}
```

---

## 6. UNIT RESULT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

UNIT RESULT

Cada Unit puede tener:

```text
conceptCharges
manualCharges
debits
credits
payments
priorBalance
endingBalance
```

---

## 7. SOURCE TRACEABILITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE TRACEABILITY

Cada línea debe poder identificar su origen:

```text
sourceType
sourceId
conceptId
unitId
```

cuando corresponda.

---

## 8. LINE ITEM

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

LINE ITEM

Conceptualmente:

```ts
interface LiquidationLineItem {
  lineId: string
  sourceType: SourceType
  sourceId: string
  description: string
  amount: Money
}
```

Los campos definitivos pertenecen al resultado del dominio.

---

## 9. LINE IMMUTABILITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

LINE IMMUTABILITY

Una vez construido el resultado validado:

```text
LineItem
```

es inmutable.

---

## 10. CONCEPT CHARGES

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CONCEPT CHARGES

Provienen del:

```text
ConceptResultStore
```

No volver a ejecutar conceptos durante composición.

---

## 11. MANUAL CHARGES

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

MANUAL CHARGES

Provienen de:

```text
Adjustment Engine
```

cuando el tipo sea:

```text
ManualCharge
```

---

## 12. CREDITS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CREDITS

Credits reducen el importe exigible según la convención del dominio.

---

## 13. DEBITS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DEBITS

Debits incrementan el importe exigible.

---

## 14. PAYMENTS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PAYMENTS

Payments representan dinero aplicado y no deben confundirse con Credits.

---

## 15. PRIOR BALANCE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRIOR BALANCE

Prior balance proviene del Balance Engine/Snapshot según arquitectura definida.

---

## 16. COMPOSITION MODEL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

COMPOSITION MODEL

Conceptualmente:

```text
Gross Charges
=
Concept Charges
+
Manual Charges
+
Debit Adjustments
```

---

## 17. CREDITS MODEL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CREDITS MODEL

```text
Net Charges
=
Gross Charges
-
Credit Adjustments
```

---

## 18. BALANCE MODEL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

BALANCE MODEL

```text
Ending Balance
=
Prior Balance
+
Net Charges
-
Applied Payments
```

La convención exacta de signo debe seguir el dominio financiero.

---

## 19. NO DUPLICATE SOURCES

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NO DUPLICATE SOURCES

Una misma fuente no debe aparecer dos veces en el resultado.

---

## 20. DUPLICATE SOURCE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DUPLICATE SOURCE

```text
AEL_RESULT_DUPLICATE_SOURCE
```

---

## 21. SOURCE OWNERSHIP

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE OWNERSHIP

Cada motor es responsable de producir su fuente:

```text
Concept Engine → Concept Results
Adjustment Engine → Adjustments
Payment Engine → Payment Applications
Balance Engine → Balance
```

---

## 22. RESULT ENGINE RESPONSIBILITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT ENGINE RESPONSIBILITY

Result Engine:

```text
collect
normalize
compose
aggregate
reconcile
finalize
```

---

## 23. NO BUSINESS RULE REIMPLEMENTATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NO BUSINESS RULE REIMPLEMENTATION

No recalcular:

```text
payment allocation
rounding
proration
concept formula
```

---

## 24. NORMALIZATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NORMALIZATION

Las fuentes deben convertirse a una representación común:

```text
LiquidationLineItem
```

sin perder provenance.

---

## 25. SOURCE ADAPTERS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE ADAPTERS

Puede existir:

```text
ConceptResultAdapter
AdjustmentResultAdapter
PaymentResultAdapter
BalanceResultAdapter
```

---

## 26. AMOUNT SIGN

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

AMOUNT SIGN

El signo final debe seguir la convención única del resultado.

---

## 27. POSITIVE CHARGE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

POSITIVE CHARGE

Representa importe exigible.

---

## 28. CREDIT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CREDIT

Puede representarse como:

```text
negative contribution
```

o mediante:

```text
direction = Credit
```

pero debe existir una única convención interna.

---

## 29. PAYMENT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PAYMENT

Payment puede representarse como:

```text
negative contribution
```

en el balance.

---

## 30. INTERNAL SIGN CONVENTION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

INTERNAL SIGN CONVENTION

V1 recomienda:

```text
charges/debits  → positive
credits         → negative
payments        → negative
```

---

## 31. DISPLAY SIGN

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DISPLAY SIGN

La UI puede mostrar:

```text
Pago: -100
```

pero el cálculo no debe depender del formato visual.

---

## 32. CURRENCY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CURRENCY

Todas las líneas monetarias de una Unit deben ser compatibles.

---

## 33. CURRENCY MISMATCH

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CURRENCY MISMATCH

```text
AEL_RESULT_CURRENCY_MISMATCH
```

---

## 34. RESULT CURRENCY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT CURRENCY

La currency del resultado puede derivarse de:

```text
tenant/domain configuration
```

o del Snapshot.

Debe ser explícita.

---

## 35. EMPTY RESULT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

EMPTY RESULT

Una Unit sin cargos puede tener resultado:

```text
0
```

no necesariamente ausencia.

---

## 36. ZERO RESULT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

ZERO RESULT

Zero es un resultado financiero válido.

---

## 37. NULL RESULT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NULL RESULT

No usar null para representar:

```text
zero
```

---

## 38. UNIT TOTAL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

UNIT TOTAL

Conceptualmente:

```text
unitTotal
=
priorBalance
+
conceptCharges
+
manualCharges
+
debits
-
credits
-
payments
```

---

## 39. TENANT TOTAL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

TENANT TOTAL

```text
tenantTotal
=
Σ unitTotal
```

si el scope corresponde al tenant completo.

---

## 40. PERIOD TOTAL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PERIOD TOTAL

El resultado debe identificar el:

```text
periodId
```

al que corresponde.

---

## 41. UNIT RESULT ORDER

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

UNIT RESULT ORDER

Orden canónico:

```text
unitId ASC
```

---

## 42. LINE ORDER

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

LINE ORDER

Orden sugerido:

```text
sourceType priority
+
sourceId
+
lineId
```

Debe ser estable.

---

## 43. CONCEPT ORDER

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CONCEPT ORDER

Cuando se requiera explicar conceptos:

```text
CalculationPlan
```

determina el orden semántico.

---

## 44. PAYMENT ORDER

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PAYMENT ORDER

Payment applications conservan el orden/provenance definido por Payment Engine.

---

## 45. RESULT SORTING

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT SORTING

Sorting sólo afecta representación.

No debe alterar cálculos.

---

## 46. AGGREGATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

AGGREGATION

Aggregation debe utilizar:

```text
FinancialOperationService
```

---

## 47. NO FLOATING POINT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NO FLOATING POINT

Nunca agregar Money con floating point.

---

## 48. RECONCILIATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RECONCILIATION

El Result Engine debe validar:

```text
sum(lines)
=
unitTotal
```

según composición.

---

## 49. BALANCE RECONCILIATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

BALANCE RECONCILIATION

También:

```text
sum(unitTotals)
=
tenant/period total
```

cuando corresponda.

---

## 50. SOURCE RECONCILIATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE RECONCILIATION

Debe poder comprobarse:

```text
Concept Results
+
Adjustments
+
Prior Balance
-
Payments
=
Final
```

---

## 51. RECONCILIATION FAILURE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RECONCILIATION FAILURE

```text
AEL_RESULT_RECONCILIATION_FAILED
```

---

## 52. SOURCE COUNT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE COUNT

Puede registrarse:

```text
conceptCount
adjustmentCount
paymentCount
unitCount
```

para observability.

---

## 53. RESULT PROVENANCE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT PROVENANCE

Debe conservar:

```text
executionId
artifactHash
snapshotHash
policy hashes
```

cuando corresponda.

---

## 54. POLICY HASHES

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

POLICY HASHES

Puede incluir:

```text
financialPolicyHash
allocationPolicyHash
paymentPolicyHash
adjustmentPolicyHash
```

---

## 55. RESULT HASH

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT HASH

Calcular:

```text
resultHash
```

sobre representación canónica del resultado.

---

## 56. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CANONICAL SERIALIZATION

El hash requiere:

```text
stable field order
stable line order
normalized numeric representation
```

---

## 57. HASH EXCLUSIONS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

HASH EXCLUSIONS

Campos puramente operacionales como:

```text
execution timestamp
processing duration
```

no deben alterar resultHash si no forman parte de la semántica financiera.

---

## 58. REPLAY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

REPLAY

Mismos inputs y policies deben producir:

```text
same resultHash
```

---

## 59. RESULT VERSION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT VERSION

Puede existir:

```text
resultSchemaVersion
```

para evolución del formato.

---

## 60. SCHEMA COMPATIBILITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SCHEMA COMPATIBILITY

Cambios incompatibles deben incrementar versión.

---

## 61. RESULT STATUS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT STATUS

Estados:

```text
Draft
Validated
Finalized
Published
Failed
```

---

## 62. DRAFT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DRAFT

Puede utilizarse internamente antes de validación final.

---

## 63. VALIDATED

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

VALIDATED

Significa:

```text
schema valid
financial invariants valid
reconciliation valid
```

---

## 64. FINALIZED

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

FINALIZED

Resultado inmutable y listo para persistencia final.

---

## 65. PUBLISHED

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PUBLISHED

Disponible para consumidores posteriores.

---

## 66. FAILED

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

FAILED

No puede publicarse.

---

## 67. FINALIZATION GATE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

FINALIZATION GATE

Sólo:

```text
Validated
```

puede pasar a:

```text
Finalized
```

---

## 68. PUBLICATION GATE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PUBLICATION GATE

Sólo:

```text
Finalized
```

puede pasar a:

```text
Published
```

---

## 69. RESULT IMMUTABILITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT IMMUTABILITY

Después de Finalized:

```text
no mutation
```

---

## 70. CORRECTION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md; Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CORRECTION

Una corrección crea:

```text
new execution
new result
new trace
```

---

## 71. VERSION RELATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

VERSION RELATION

Puede existir:

```text
supersedesResultId
```

para relacionar resultados corregidos.

---

## 72. NO DELETE HISTORY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NO DELETE HISTORY

No borrar resultados financieros históricos por corrección.

---

## 73. EXPLANATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

EXPLANATION

El resultado debe poder explicar:

```text
why this amount exists
```

mediante provenance.

---

## 74. DETAIL LEVELS

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DETAIL LEVELS

Puede existir:

```text
Summary
Detailed
Audit
```

---

## 75. SUMMARY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SUMMARY

Contiene:

```text
totals
balance
```

---

## 76. DETAILED

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DETAILED

Incluye:

```text
line items
source references
```

---

## 77. AUDIT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

AUDIT

Puede incluir:

```text
calculation references
policy hashes
snapshot references
```

sin almacenar indiscriminadamente datos sensibles.

---

## 78. SENSITIVE DATA

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SENSITIVE DATA

Result Engine debe respetar masking y minimización.

---

## 79. PII

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PII

No duplicar PII innecesariamente en cada line item.

---

## 80. DISPLAY DESCRIPTION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DISPLAY DESCRIPTION

Description no debe ser la fuente de verdad financiera.

---

## 81. SOURCE ID

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE ID

Debe ser el identificador técnico estable.

---

## 82. HUMAN LABEL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

HUMAN LABEL

Puede cambiar sin modificar la identidad financiera.

---

## 83. RESULT QUERY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT QUERY

Consumers deben poder solicitar:

```text
summary
details
audit
```

según permisos.

---

## 84. AUTHORIZATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

AUTHORIZATION

Result Engine no decide permisos de usuario.

La capa de aplicación los controla.

---

## 85. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

TENANT ISOLATION

Result sólo puede pertenecer al tenant de la ejecución.

---

## 86. EXECUTION ISOLATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

EXECUTION ISOLATION

No mezclar resultados de executions diferentes.

---

## 87. PERIOD ISOLATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PERIOD ISOLATION

No mezclar períodos.

---

## 88. UNIT ISOLATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

UNIT ISOLATION

No mezclar Units entre scopes incompatibles.

---

## 89. RESULT MERGE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT MERGE

Merging de resultados de distintas executions sólo mediante proceso explícito.

---

## 90. BATCH RESULT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

BATCH RESULT

Un batch puede contener:

```text
multiple UnitResults
```

pero debe conservar identidad de ejecución.

---

## 91. PARTIAL RESULT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PARTIAL RESULT

Si una policy permite partial failure:

```text
status = PartialFailure
```

debe ser explícito.

---

## 92. NO SILENT PARTIAL

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

NO SILENT PARTIAL

No presentar resultado parcial como:

```text
Succeeded
```

---

## 93. PARTIAL RECONCILIATION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PARTIAL RECONCILIATION

Un resultado parcial no puede declararse financieramente completo.

---

## 94. ERROR COLLECTION

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

ERROR COLLECTION

Puede registrar:

```text
unit failures
blocked concepts
invalid adjustments
```

---

## 95. RESULT ERROR

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT ERROR

```ts
interface LiquidationResultError {
  code: string
  message: string
  unitId?: string
  sourceId?: string
}
```

---

## 96. ERROR SAFETY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

ERROR SAFETY

No exponer secretos ni detalles internos de infraestructura.

---

## 97. OBSERVABILITY

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

OBSERVABILITY

Registrar:

```text
executionId
resultHash
unitCount
lineCount
duration
status
```

---

## 98. PERFORMANCE

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PERFORMANCE

Composición debe evitar:

```text
N×M recalculations
```

---

## 99. STREAMING

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

STREAMING

Para grandes batches puede utilizarse agregación streaming siempre que:

```text
determinism
reconciliation
```

se mantengan.

---

## 100. MEMORY LIMIT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

MEMORY LIMIT

Aplicar:

```text
maxResultLines
maxUnits
maxResultSize
```

---

## 101. TOO MANY LINES

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

TOO MANY LINES

```text
AEL_RESULT_LINE_LIMIT
```

---

## 102. RESULT SIZE LIMIT

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

RESULT SIZE LIMIT

```text
AEL_RESULT_SIZE_LIMIT
```

---

## 103. BASIC COMPOSITION TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

BASIC COMPOSITION TEST

```text
charge 100
credit 20
payment 30
```

resultado:

```text
50
```

sin prior balance.

---

## 104. PRIOR BALANCE TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRIOR BALANCE TEST

```text
prior = 40
charge = 100
payment = 30
```

resultado:

```text
110
```

---

## 105. MULTI-UNIT TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

MULTI-UNIT TEST

Dos Units deben producir:

```text
unit totals
+
tenant total
```

reconciliados.

---

## 106. SOURCE TRACE TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SOURCE TRACE TEST

Cada line item debe apuntar a su source.

---

## 107. DUPLICATE SOURCE TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

DUPLICATE SOURCE TEST

Mismo source dos veces:

```text
rejected
```

---

## 108. CURRENCY TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CURRENCY TEST

Currencies incompatibles:

```text
rejected
```

---

## 109. ZERO TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

ZERO TEST

Unit total zero:

```text
valid
```

---

## 110. HASH TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

HASH TEST

Mismo resultado canónico:

```text
same resultHash
```

---

## 111. HASH ORDER TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

HASH ORDER TEST

Cambiar orden de entrada pero no semántica:

```text
same resultHash
```

porque canonicalization estabiliza el resultado.

---

## 112. REPLAY TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

REPLAY TEST

Mismos Artifact/Snapshot/Policies:

```text
same resultHash
```

---

## 113. CORRECTION TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

CORRECTION TEST

Corrección:

```text
new execution
new result
```

---

## 114. IMMUTABILITY TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

IMMUTABILITY TEST

Finalized result no puede modificarse.

---

## 115. PARTIAL TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PARTIAL TEST

Partial failure no puede aparecer como Succeeded.

---

## 116. TENANT SECURITY TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

TENANT SECURITY TEST

Cross-tenant source:

```text
rejected
```

---

## 117. SIZE LIMIT TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

SIZE LIMIT TEST

Exceder line limit:

```text
AEL_RESULT_LINE_LIMIT
```

---

## 118. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PERFORMANCE TEST

Large result composes dentro del budget.

---

## 119. PRINCIPIO DE COMPOSICIÓN

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRINCIPIO DE COMPOSICIÓN

Cada motor calcula su propia responsabilidad.

El Result Engine sólo compone y valida la coherencia global.

---

## 120. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRINCIPIO DE TRAZABILIDAD

Cada importe debe poder responder:

```text
¿De dónde salió?
¿A qué Unit pertenece?
¿A qué período?
¿Con qué ejecución?
¿Con qué Artifact?
¿Con qué Snapshot?
```

---

## 121. PRINCIPIO DE RECONCILIACIÓN

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRINCIPIO DE RECONCILIACIÓN

Un resultado financiero no se considera válido sólo porque tenga un total.

Debe demostrar que:

```text
componentes
=
total
```

---

## 122. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_Charge Composition & Liquidation Result Engine 72.md

PRINCIPIO DE INMUTABILIDAD

Una vez finalizado:

```text
LiquidationResult
```

representa una evidencia histórica.

---

## 123. OBJETIVO

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OBJETIVO

Permitir responder de forma determinista:

```text
¿Qué valor se obtuvo?
¿De dónde salió?
¿Qué inputs utilizó?
¿Qué fórmula/intermediate result intervino?
¿Qué policy se aplicó?
¿Qué rounding ocurrió?
¿Qué dependencia lo produjo?
¿A qué resultado contribuyó?
```

---

## 124. PRINCIPIO

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PRINCIPIO

La explicación es una representación derivada de la ejecución; no es una segunda ejecución.

---

## 125. TRACE IDENTITY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE IDENTITY

Cada trace pertenece a:

```text
executionId
artifactHash
snapshotHash
resultHash
```

según disponibilidad.

---

## 126. TRACE NODE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE NODE

Conceptualmente:

```ts
interface TraceNode {
  nodeId: string
  type: TraceNodeType
  label: string
  value?: TraceValue
  sourceRef?: SourceReference
}
```

---

## 127. TRACE TYPES

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE TYPES

V1 puede utilizar:

```text
Input
Parameter
SnapshotValue
Variable
Concept
Operation
IntermediateResult
Rounding
Allocation
PaymentApplication
Adjustment
Aggregation
Output
```

---

## 128. TRACE EDGE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE EDGE

Relaciona:

```text
source
→
operation
→
result
```

---

## 129. TRACE GRAPH

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE GRAPH

Conceptualmente:

```text
Input A ─────┐
             ├→ Operation → Intermediate Result
Input B ─────┘                    ↓
                            Rounding
                                ↓
                         Concept Result
                                ↓
                           Allocation
                                ↓
                          Unit Charge
                                ↓
                          Final Balance
```

---

## 130. NO LOG-ONLY MODEL

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO LOG-ONLY MODEL

Un log textual:

```text
"calculated amount = 123"
```

no es suficiente para auditoría.

---

## 131. STRUCTURED TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

STRUCTURED TRACE

La trazabilidad debe ser estructurada y navegable.

---

## 132. SOURCE REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SOURCE REFERENCE

Cada nodo puede referenciar:

```text
sourceType
sourceId
field
path
```

---

## 133. SNAPSHOT REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SNAPSHOT REFERENCE

Para valores provenientes del Snapshot:

```text
snapshotHash
entityId
field
```

---

## 134. ARTIFACT REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ARTIFACT REFERENCE

Para lógica:

```text
artifactHash
conceptId
instructionId
```

---

## 135. PARAMETER REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PARAMETER REFERENCE

Para parámetros:

```text
parameterId
version
effectiveDate
```

---

## 136. VALUE CAPTURE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

VALUE CAPTURE

El trace debe conservar el valor necesario para reproducir la explicación.

---

## 137. VALUE SECURITY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

VALUE SECURITY

No almacenar valores sensibles si no son necesarios para explicar el cálculo.

---

## 138. MASKING

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

MASKING

Campos sensibles pueden aparecer como:

```text
masked
redacted
reference-only
```

---

## 139. PII MINIMIZATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PII MINIMIZATION

Preferir:

```text
unitId
```

sobre:

```text
nombre completo
documento
```

cuando ambos permitan explicar el cálculo.

---

## 140. OPERATION TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OPERATION TRACE

Registrar:

```text
operationId
operationType
inputs
output
```

---

## 141. OPERATION INPUTS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OPERATION INPUTS

Inputs deben referenciar nodos existentes.

---

## 142. OPERATION OUTPUT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OPERATION OUTPUT

Output debe apuntar al nodo producido.

---

## 143. OPERATION ORDER

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OPERATION ORDER

Conservar:

```text
sequence
```

para reconstruir ejecución.

---

## 144. DETERMINISM

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DETERMINISM

Misma ejecución semántica:

```text
same trace graph
```

salvo metadatos operacionales excluidos.

---

## 145. ROUNDING TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ROUNDING TRACE

Cuando rounding afecte materialmente un resultado:

```text
input
policy
scale
mode
output
```

---

## 146. ROUNDING POLICY REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ROUNDING POLICY REFERENCE

Registrar:

```text
roundingPolicyId
version
```

cuando exista.

---

## 147. ALLOCATION TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ALLOCATION TRACE

Debe poder explicar:

```text
source amount
basis
exact allocation
rounded allocation
residual
target
```

según el nivel requerido.

---

## 148. RESIDUAL TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

RESIDUAL TRACE

Cuando exista residual:

```text
residual amount
distribution rule
recipient
```

debe ser reconstruible.

---

## 149. PAYMENT TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PAYMENT TRACE

Debe explicar:

```text
paymentId
payment amount
applied amount
target obligation
remaining amount
```

---

## 150. ADJUSTMENT TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ADJUSTMENT TRACE

Debe explicar:

```text
noveltyId
adjustmentId
reasonCode
amount
direction
target
```

cuando corresponda.

---

## 151. CONCEPT TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CONCEPT TRACE

Debe identificar:

```text
conceptId
conceptVersion
executionOrder
```

---

## 152. FORMULA REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

FORMULA REFERENCE

Si el Artifact contiene fórmula o IR equivalente:

```text
artifactHash
conceptId
instructionId
```

debe bastar para localizarla.

---

## 153. NO FORMULA DUPLICATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO FORMULA DUPLICATION

No copiar la fórmula completa en cada line item si ya existe una referencia al Artifact.

---

## 154. INTERMEDIATE RESULT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

INTERMEDIATE RESULT

Los resultados intermedios relevantes pueden exponerse como:

```text
value
type
producer
dependencies
```

---

## 155. VARIABLE TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

VARIABLE TRACE

Variables locales pueden aparecer sólo cuando:

```text
audit level
```

lo permita.

---

## 156. SCOPE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SCOPE

Cada variable debe indicar su scope:

```text
execution
liquidation
unit
concept
instruction
```

---

## 157. DEPENDENCY TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DEPENDENCY TRACE

Debe permitir navegar:

```text
Concept B
← depends on
Concept A
```

---

## 158. DEPENDENCY ORDER

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DEPENDENCY ORDER

Conservar el orden calculado por Dependency Graph.

---

## 159. OUTPUT TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OUTPUT TRACE

Cada importe final debe poder apuntar hacia:

```text
source nodes
```

que lo produjeron.

---

## 160. TRACE ROOT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE ROOT

La raíz puede ser:

```text
LiquidationResult
```

o:

```text
UnitLiquidationResult
```

---

## 161. TRACE PATH

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE PATH

Un usuario puede navegar:

```text
Final Balance
 ↓
Payment
 ↓
Payment Application
 ↓
Charge
 ↓
Concept Result
 ↓
Formula Inputs
```

---

## 162. EXPLANATION VIEW

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXPLANATION VIEW

La UI puede transformar el trace en una explicación humana.

---

## 163. MACHINE TRACE ≠ HUMAN EXPLANATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

MACHINE TRACE ≠ HUMAN EXPLANATION

El graph estructurado es la fuente.

La explicación textual es una vista derivada.

---

## 164. HUMAN EXPLANATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

HUMAN EXPLANATION

Ejemplo conceptual:

```text
Cargo administración:
Base = 1,500,000
Coeficiente = 0.025
Resultado = 37,500
```

---

## 165. EXPLANATION SOURCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXPLANATION SOURCE

Cada dato mostrado debe tener referencia al TraceNode.

---

## 166. NO UNSOURCED TEXT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO UNSOURCED TEXT

La UI no debe inventar explicaciones que no existan en trace/provenance.

---

## 167. TRACE VERSION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE VERSION

Puede existir:

```text
traceSchemaVersion
```

---

## 168. RESULT VERSION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

RESULT VERSION

Debe ser compatible con:

```text
resultSchemaVersion
```

---

## 169. TRACE HASH

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE HASH

Puede calcularse:

```text
traceHash
```

sobre representación canónica.

---

## 170. HASH INPUT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

HASH INPUT

Debe incluir:

```text
node identities
edges
values
references
```

según política.

---

## 171. OPERATIONAL EXCLUSIONS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

OPERATIONAL EXCLUSIONS

No incluir en traceHash:

```text
wall clock duration
host process id
temporary memory address
```

si no son semánticos.

---

## 172. REPLAY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

REPLAY

Mismos Artifact/Snapshot/Policies:

```text
same traceHash
```

cuando el trace capture el mismo nivel de detalle.

---

## 173. TRACE LEVELS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE LEVELS

V1:

```text
None
Summary
Detailed
Audit
```

---

## 174. NONE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NONE

No generar trace persistente.

---

## 175. SUMMARY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SUMMARY

Conservar:

```text
source references
major operations
final values
```

---

## 176. DETAILED

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DETAILED

Agregar:

```text
intermediate results
allocation
rounding
payment applications
```

según disponibilidad.

---

## 177. AUDIT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

AUDIT

Agregar:

```text
dependency paths
parameter references
instruction references
policy references
```

y demás datos autorizados.

---

## 178. TRACE STORAGE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE STORAGE

El trace puede almacenarse separado del resultado:

```text
LiquidationResult
+
TraceArtifact
```

---

## 179. RESULT SIZE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

RESULT SIZE

No inflar el resultado principal con todo el trace.

---

## 180. TRACE RETENTION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE RETENTION

La retención debe seguir la policy de auditoría y normativa aplicable.

---

## 181. TRACE ACCESS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE ACCESS

El acceso debe estar protegido por permisos de auditoría/aplicación.

---

## 182. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TENANT ISOLATION

Trace pertenece al mismo tenant que la ejecución.

---

## 183. EXECUTION ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXECUTION ISOLATION

No mezclar trace nodes entre executions.

---

## 184. SNAPSHOT ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SNAPSHOT ISOLATION

Trace debe referenciar el Snapshot usado.

---

## 185. ARTIFACT ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ARTIFACT ISOLATION

Trace debe referenciar el Artifact ejecutado.

---

## 186. RESULT ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

RESULT ISOLATION

Trace debe referenciar el resultHash correspondiente cuando exista.

---

## 187. TRACE IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE IMMUTABILITY

Una vez finalizado el resultado:

```text
trace immutable
```

---

## 188. SUPERSEDES

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SUPERSEDES

Puede conservarse:

```text
supersedesExecutionId
supersedesResultId
```

---

## 189. TRACE SEARCH

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE SEARCH

Debe poder localizarse por:

```text
executionId
resultHash
unitId
conceptId
sourceId
```

según permisos.

---

## 190. TRACE QUERY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE QUERY

Una consulta puede solicitar:

```text
root
children
parents
path
```

---

## 191. PARENT QUERY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PARENT QUERY

Permite preguntar:

```text
¿De dónde salió este valor?
```

---

## 192. CHILD QUERY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CHILD QUERY

Permite preguntar:

```text
¿En qué valores contribuyó este resultado?
```

---

## 193. PATH QUERY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PATH QUERY

Permite obtener:

```text
Input → Output
```

o:

```text
Output → Inputs
```

---

## 194. DEPTH LIMIT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DEPTH LIMIT

Evitar recorridos ilimitados:

```text
maxTraceDepth
```

---

## 195. NODE LIMIT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NODE LIMIT

Limitar:

```text
maxTraceNodes
```

---

## 196. TRACE SIZE LIMIT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE SIZE LIMIT

Limitar:

```text
maxTraceBytes
```

---

## 197. LIMIT ERRORS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

LIMIT ERRORS

```text
AEL_TRACE_NODE_LIMIT
AEL_TRACE_SIZE_LIMIT
AEL_TRACE_DEPTH_LIMIT
```

---

## 198. CYCLE DETECTION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CYCLE DETECTION

El Trace Graph no debe contener ciclos de ejecución.

---

## 199. CYCLE ERROR

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CYCLE ERROR

```text
AEL_TRACE_CYCLE_DETECTED
```

---

## 200. NODE ID

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NODE ID

Debe ser estable dentro de una ejecución.

---

## 201. EDGE ID

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EDGE ID

Puede utilizar:

```text
sourceNodeId
targetNodeId
relationType
```

como identidad lógica.

---

## 202. RELATION TYPES

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

RELATION TYPES

V1:

```text
dependsOn
derivedFrom
uses
roundedFrom
allocatedFrom
appliedTo
contributesTo
aggregatedInto
```

---

## 203. TRACE SEMANTICS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE SEMANTICS

`dependsOn` no significa necesariamente:

```text
numeric operation
```

sino dependencia de cálculo.

---

## 204. DERIVED FROM

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DERIVED FROM

Indica transformación directa de un valor.

---

## 205. USES

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

USES

Indica consumo de input o policy.

---

## 206. ROUNDED FROM

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ROUNDED FROM

Relaciona valor antes y después de rounding.

---

## 207. ALLOCATED FROM

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ALLOCATED FROM

Relaciona allocation con source amount.

---

## 208. APPLIED TO

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

APPLIED TO

Relaciona payment con obligación.

---

## 209. AGGREGATED INTO

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

AGGREGATED INTO

Relaciona line items con subtotal/total.

---

## 210. EXPLANATION TEMPLATE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXPLANATION TEMPLATE

Puede existir un catálogo de templates:

```text
ConceptCharge
ManualCharge
Payment
Credit
Debit
Balance
```

---

## 211. TEMPLATE VERSION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TEMPLATE VERSION

Los templates deben versionarse si afectan explicaciones legales/auditables.

---

## 212. NO CALCULATION IN TEMPLATE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO CALCULATION IN TEMPLATE

Templates sólo presentan datos.

No calculan.

---

## 213. LANGUAGE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

LANGUAGE

La explicación puede localizarse sin cambiar el trace.

---

## 214. LOCALIZATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

LOCALIZATION

Cambiar idioma:

```text
does not change resultHash
does not change traceHash
```

---

## 215. ROUNDING DISPLAY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ROUNDING DISPLAY

La explicación debe mostrar el valor financiero correcto.

No reemplazarlo por un valor recalculado en frontend.

---

## 216. UI RESPONSIBILITY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

UI RESPONSIBILITY

UI:

```text
format
translate
navigate
```

Motor:

```text
calculate
trace
```

---

## 217. EXPORT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXPORT

Trace puede exportarse a:

```text
JSON
```

o formato de auditoría autorizado.

---

## 218. CANONICAL EXPORT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CANONICAL EXPORT

El export debe conservar:

```text
stable node order
stable edge order
```

---

## 219. AUDIT PACKAGE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

AUDIT PACKAGE

Puede generarse un paquete:

```text
Result
+
Trace
+
Artifact reference
+
Snapshot reference
+
Policy references
```

según permisos.

---

## 220. NO RAW SNAPSHOT EXPORT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO RAW SNAPSHOT EXPORT

No incluir Snapshot completo si sólo se necesita una referencia.

---

## 221. SENSITIVE EXPORT

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SENSITIVE EXPORT

Exports deben aplicar:

```text
masking
redaction
access policy
```

---

## 222. AUDIT PACKAGE HASH

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

AUDIT PACKAGE HASH

Puede calcularse:

```text
auditPackageHash
```

---

## 223. SIGNATURE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SIGNATURE

La firma digital, si se requiere, pertenece a una capa de integrity/signing posterior.

---

## 224. TRACE VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE VALIDATION

Antes de publicar:

```text
all references valid
no cycles
all roots reachable
all outputs traceable
```

---

## 225. ORPHAN NODE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ORPHAN NODE

Un nodo sin relación válida puede indicar:

```text
AEL_TRACE_ORPHAN_NODE
```

según el nivel de trace.

---

## 226. MISSING SOURCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

MISSING SOURCE

Si un nodo requiere source y no existe:

```text
AEL_TRACE_MISSING_SOURCE
```

---

## 227. INVALID REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

INVALID REFERENCE

```text
AEL_TRACE_INVALID_REFERENCE
```

---

## 228. TRACE COMPLETENESS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE COMPLETENESS

La completitud depende de:

```text
traceLevel
```

No todos los niveles requieren todos los nodos.

---

## 229. AUDIT COMPLETENESS

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

AUDIT COMPLETENESS

Audit level debe cubrir todos los valores materialmente relevantes.

---

## 230. MATERIAL VALUE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

MATERIAL VALUE

Un valor es material si puede cambiar o explicar el resultado financiero.

---

## 231. NON-MATERIAL VALUES

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NON-MATERIAL VALUES

Metadatos operacionales pueden excluirse del audit trace.

---

## 232. SECURITY

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SECURITY

Trace debe tratarse como información potencialmente sensible.

---

## 233. NO SECRET VALUES

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO SECRET VALUES

Nunca almacenar:

```text
API keys
passwords
tokens
credentials
```

---

## 234. HOST DATA

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

HOST DATA

No incluir:

```text
filesystem paths
environment secrets
internal process details
```

salvo referencias técnicas estrictamente necesarias.

---

## 235. PROVIDER TRACE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PROVIDER TRACE

Si un Provider participa mediante Capability:

```text
capabilityId
providerRef
```

pueden registrarse.

---

## 236. EXTERNAL VALUE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXTERNAL VALUE

Un valor externo debe identificar:

```text
provider
request reference
snapshot/input reference
```

según contrato.

---

## 237. NO LIVE PROVIDER

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

NO LIVE PROVIDER

La explicación no vuelve a consultar Providers.

---

## 238. TRACE PERFORMANCE

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE PERFORMANCE

Generar trace no debe modificar la semántica del cálculo.

---

## 239. TRACE DISABLED

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE DISABLED

Si trace level = None:

```text
calculation result remains identical
```

---

## 240. TRACE ENABLED

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE ENABLED

Cambiar trace level:

```text
must not change financial result
```

---

## 241. TRACE TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

TRACE TEST

Comparar:

```text
trace None
vs
trace Audit
```

y comprobar:

```text
same resultHash
```

---

## 242. EXPLANATION TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

EXPLANATION TEST

Cada valor mostrado debe mapear a un TraceNode.

---

## 243. PATH TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PATH TEST

Final Balance debe poder navegar hasta sus fuentes.

---

## 244. ROUNDING TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ROUNDING TEST

Un rounding relevante debe aparecer en Detailed/Audit.

---

## 245. ALLOCATION TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ALLOCATION TEST

Una distribución debe explicar:

```text
source
basis
allocation
residual
```

según level.

---

## 246. PAYMENT TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PAYMENT TEST

Debe explicar:

```text
payment
application
remaining
```

---

## 247. ADJUSTMENT TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

ADJUSTMENT TEST

Debe explicar:

```text
novelty
adjustment
reason
amount
```

---

## 248. DEPENDENCY TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

DEPENDENCY TEST

Debe navegar:

```text
Concept Result
→ dependencies
```

---

## 249. HASH TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

HASH TEST

Mismo trace canónico:

```text
same traceHash
```

---

## 250. LOCALIZATION TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

LOCALIZATION TEST

Cambiar idioma:

```text
same resultHash
same traceHash
```

---

## 251. SECURITY TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

SECURITY TEST

Sensitive fields:

```text
masked/redacted
```

---

## 252. LIMIT TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

LIMIT TEST

Exceder limits:

```text
appropriate trace error
```

---

## 253. CYCLE TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

CYCLE TEST

Ciclo artificial:

```text
AEL_TRACE_CYCLE_DETECTED
```

---

## 254. REPLAY TEST

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

REPLAY TEST

Misma ejecución semántica:

```text
same traceHash
```

cuando el nivel y política de trace sean equivalentes.

---

## 255. PRINCIPIO DE INDEPENDENCIA

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PRINCIPIO DE INDEPENDENCIA

Activar o desactivar trazabilidad no puede alterar el resultado financiero.

---

## 256. PRINCIPIO DE REFERENCIA

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PRINCIPIO DE REFERENCIA

La trazabilidad debe apuntar a la fuente existente en lugar de duplicarla innecesariamente.

---

## 257. PRINCIPIO DE EXPLICABILIDAD

> **Origen:** Motor de liquidacion_Liquidation Explanation & Audit Trace Engine 73.md

PRINCIPIO DE EXPLICABILIDAD

La explicación humana debe derivarse del trace estructurado.

---

## 258. OBJETIVO

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

OBJETIVO

Validar:

```text
Structure
+
Types
+
Dependencies
+
Financial Invariants
+
Reconciliation
+
Provenance
+
Security Scope
        ↓
Validation Result
```

---

## 259. PRINCIPIO

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PRINCIPIO

Calcular correctamente y validar correctamente son responsabilidades diferentes.

---

## 260. VALIDATION RESULT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION RESULT

Conceptualmente:

```ts
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  invariants: InvariantResult[]
}
```

---

## 261. VALIDATION PHASES

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION PHASES

V1:

```text
Schema
Type
Reference
Dependency
Financial
Reconciliation
Security
Completeness
Finalization
```

---

## 262. SCHEMA VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

SCHEMA VALIDATION

Validar estructura del:

```text
LiquidationResult
```

---

## 263. REQUIRED FIELDS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

REQUIRED FIELDS

Campos obligatorios:

```text
executionId
tenantId
periodId
snapshotHash
artifactHash
result status
currency
```

según contrato.

---

## 264. TYPE VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

TYPE VALIDATION

Money, Decimal y demás tipos deben ser compatibles con sus contratos.

---

## 265. CURRENCY VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CURRENCY VALIDATION

Todos los importes de una misma liquidación deben respetar la currency autorizada.

---

## 266. REFERENCE VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

REFERENCE VALIDATION

Cada:

```text
sourceId
conceptId
unitId
paymentId
adjustmentId
```

debe existir en el scope correspondiente cuando sea requerido.

---

## 267. SNAPSHOT REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

SNAPSHOT REFERENCE

Todas las fuentes deben pertenecer al Snapshot indicado.

---

## 268. ARTIFACT REFERENCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ARTIFACT REFERENCE

La ejecución debe corresponder al Artifact identificado.

---

## 269. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

TENANT ISOLATION

Ninguna fuente puede pertenecer a otro tenant.

---

## 270. PERIOD ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PERIOD ISOLATION

Ninguna fuente incompatible con el período puede incorporarse sin policy explícita.

---

## 271. UNIT ISOLATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

UNIT ISOLATION

Las líneas deben corresponder a Units válidas del scope.

---

## 272. DEPENDENCY VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

DEPENDENCY VALIDATION

El resultado debe ser compatible con el Dependency Graph ejecutado.

---

## 273. MISSING DEPENDENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

MISSING DEPENDENCY

```text
AEL_VALIDATION_MISSING_DEPENDENCY
```

---

## 274. CYCLE VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CYCLE VALIDATION

El Dependency Graph no puede contener ciclos ejecutables.

---

## 275. DUPLICATE RESULT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

DUPLICATE RESULT

No debe existir el mismo ConceptResult más de una vez para:

```text
executionId
unitId
conceptId
```

cuando esa combinación sea única.

---

## 276. DUPLICATE SOURCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

DUPLICATE SOURCE

No duplicar fuentes financieras dentro del resultado.

---

## 277. FINANCIAL INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

FINANCIAL INVARIANTS

Las invariantes son reglas que siempre deben cumplirse para declarar válido el resultado.

---

## 278. INVARIANT I01 — MONEY VALID

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I01 — MONEY VALID

Todo importe debe ser un Money válido.

```text
I01 = all monetary values valid
```

---

## 279. INVARIANT I02 — CURRENCY CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I02 — CURRENCY CONSISTENCY

```text
all monetary values
→ same authorized currency
```

---

## 280. INVARIANT I03 — NO NAN

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I03 — NO NAN

No permitir:

```text
NaN
```

---

## 281. INVARIANT I04 — NO INFINITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I04 — NO INFINITY

No permitir:

```text
Infinity
-Infinity
```

---

## 282. INVARIANT I05 — DECIMAL REPRESENTATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I05 — DECIMAL REPRESENTATION

Los valores financieros deben respetar Decimal semantics.

---

## 283. INVARIANT I06 — UNIT TOTAL

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I06 — UNIT TOTAL

Para cada Unit:

```text
unitTotal
=
priorBalance
+
charges
+
adjustments
-
payments
```

según la convención del Documento 72.

---

## 284. INVARIANT I07 — TENANT TOTAL

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I07 — TENANT TOTAL

```text
tenantTotal
=
Σ unitTotals
```

cuando el scope sea tenant completo.

---

## 285. INVARIANT I08 — LINE TOTAL

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I08 — LINE TOTAL

```text
sum(lineItems)
=
declared unit total
```

---

## 286. INVARIANT I09 — PAYMENT RECONCILIATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I09 — PAYMENT RECONCILIATION

Para cada Payment:

```text
applied
+
unapplied
=
payment amount
```

---

## 287. INVARIANT I10 — PAYMENT APPLICATION LIMIT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I10 — PAYMENT APPLICATION LIMIT

No aplicar más que el payment disponible salvo overpayment policy explícita.

---

## 288. INVARIANT I11 — CHARGE APPLICATION LIMIT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I11 — CHARGE APPLICATION LIMIT

No aplicar más de lo permitido por la obligación.

---

## 289. INVARIANT I12 — ALLOCATION RECONCILIATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I12 — ALLOCATION RECONCILIATION

Cuando una distribución exige reconciliación:

```text
sum(allocations)
=
source amount
```

---

## 290. INVARIANT I13 — ALLOCATION BASIS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I13 — ALLOCATION BASIS

La base debe cumplir la policy:

```text
valid
non-negative
non-zero total
```

cuando corresponda.

---

## 291. INVARIANT I14 — COEFFICIENT CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I14 — COEFFICIENT CONSISTENCY

Si el dominio exige suma determinada:

```text
Σ coefficients = expected total
```

---

## 292. INVARIANT I15 — ADJUSTMENT RECONCILIATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I15 — ADJUSTMENT RECONCILIATION

```text
debits
-
credits
=
net adjustment
```

según convención.

---

## 293. INVARIANT I16 — RESULT RECONCILIATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I16 — RESULT RECONCILIATION

```text
sources
=
final result
```

---

## 294. INVARIANT I17 — SNAPSHOT CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I17 — SNAPSHOT CONSISTENCY

```text
all source snapshot hashes
=
execution snapshot hash
```

---

## 295. INVARIANT I18 — ARTIFACT CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I18 — ARTIFACT CONSISTENCY

```text
all calculation provenance
=
execution artifact
```

---

## 296. INVARIANT I19 — RESULT HASH

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I19 — RESULT HASH

El `resultHash` debe corresponder a la representación canónica del resultado.

---

## 297. INVARIANT I20 — TRACE CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I20 — TRACE CONSISTENCY

Cuando existe trace:

```text
trace.resultHash
=
result.resultHash
```

según contrato.

---

## 298. INVARIANT I21 — TRACE REFERENCES

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I21 — TRACE REFERENCES

Todos los TraceNodes referenciados deben existir.

---

## 299. INVARIANT I22 — NO ORPHAN MATERIAL NODE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I22 — NO ORPHAN MATERIAL NODE

Todo valor material debe tener provenance suficiente.

---

## 300. INVARIANT I23 — NO CYCLES

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I23 — NO CYCLES

Trace y dependency graphs deben estar libres de ciclos ejecutables.

---

## 301. INVARIANT I24 — DETERMINISTIC ORDER

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I24 — DETERMINISTIC ORDER

Resultados deben respetar orden canónico.

---

## 302. INVARIANT I25 — IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I25 — IMMUTABILITY

Un resultado Finalized no puede ser modificado.

---

## 303. INVARIANT I26 — IDEMPOTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I26 — IDEMPOTENCY

Una misma ejecución no puede producir efectos financieros duplicados.

---

## 304. INVARIANT I27 — TENANT SECURITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I27 — TENANT SECURITY

No existen fuentes cross-tenant.

---

## 305. INVARIANT I28 — PERIOD SECURITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I28 — PERIOD SECURITY

No existen fuentes incompatibles con el período.

---

## 306. INVARIANT I29 — UNIT SECURITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I29 — UNIT SECURITY

No existen aplicaciones cross-unit no autorizadas.

---

## 307. INVARIANT I30 — RESOURCE LIMIT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I30 — RESOURCE LIMIT

El resultado debe estar dentro de:

```text
maxUnits
maxLines
maxTraceNodes
maxResultSize
```

---

## 308. INVARIANT I31 — VALID STATUS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I31 — VALID STATUS

Sólo resultados en estado permitido pueden pasar a Finalized.

---

## 309. INVARIANT I32 — REQUIRED PROVENANCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I32 — REQUIRED PROVENANCE

Todos los campos de provenance requeridos deben estar presentes.

---

## 310. INVARIANT I33 — POLICY CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I33 — POLICY CONSISTENCY

Las policy hashes usadas deben corresponder a la ejecución.

---

## 311. INVARIANT I34 — ROUNDING CONSISTENCY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I34 — ROUNDING CONSISTENCY

Valores redondeados deben ser producidos por la policy autorizada.

---

## 312. INVARIANT I35 — NO DISPLAY VALUE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I35 — NO DISPLAY VALUE

El resultado financiero no puede depender de valores formateados para UI.

---

## 313. INVARIANT I36 — SOURCE IMMUTABILITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I36 — SOURCE IMMUTABILITY

Las fuentes congeladas no deben ser modificadas durante validación.

---

## 314. INVARIANT I37 — RESULT COMPLETENESS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I37 — RESULT COMPLETENESS

Todos los componentes obligatorios del resultado deben estar presentes.

---

## 315. INVARIANT I38 — ERROR FREE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I38 — ERROR FREE

No puede finalizarse un resultado con errores bloqueantes.

---

## 316. INVARIANT I39 — WARNING POLICY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I39 — WARNING POLICY

Warnings no bloqueantes deben cumplir la policy de finalización.

---

## 317. INVARIANT I40 — REPLAY COMPATIBILITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT I40 — REPLAY COMPATIBILITY

Los datos necesarios para replay deben estar disponibles.

---

## 318. VALIDATION ERROR

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION ERROR

Conceptualmente:

```ts
interface ValidationError {
  code: string
  invariant: string
  message: string
  sourceRef?: string
}
```

---

## 319. VALIDATION WARNING

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION WARNING

Un warning no invalida por sí solo, salvo policy.

---

## 320. ERROR SEVERITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ERROR SEVERITY

```text
Info
Warning
Error
Fatal
```

---

## 321. BLOCKING ERROR

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

BLOCKING ERROR

```text
Error
+
Fatal
```

bloquean Finalization cuando la policy así lo establece.

---

## 322. VALIDATION CODES

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION CODES

Ejemplos:

```text
AEL_VALIDATION_SCHEMA
AEL_VALIDATION_TYPE
AEL_VALIDATION_REFERENCE
AEL_VALIDATION_CURRENCY
AEL_VALIDATION_RECONCILIATION
AEL_VALIDATION_PROVENANCE
AEL_VALIDATION_SECURITY
AEL_VALIDATION_COMPLETENESS
```

---

## 323. VALIDATION REPORT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION REPORT

Debe contener:

```text
status
errors
warnings
invariants
summary
```

---

## 324. VALIDATION STATUS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION STATUS

```text
Valid
Invalid
Warning
Blocked
```

---

## 325. VALID

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALID

Todas las invariantes obligatorias satisfechas.

---

## 326. WARNING

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

WARNING

Sin errores bloqueantes, pero con warnings permitidos.

---

## 327. INVALID

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVALID

Existe al menos una regla obligatoria incumplida.

---

## 328. BLOCKED

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

BLOCKED

No se puede continuar por dependencia o condición externa requerida.

---

## 329. VALIDATION ORDER

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION ORDER

Recomendado:

```text
1 schema
2 types
3 references
4 security scope
5 dependencies
6 financial invariants
7 reconciliation
8 provenance
9 completeness
10 finalization gate
```

---

## 330. FAIL FAST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

FAIL FAST

Errores estructurales graves pueden detener validaciones posteriores.

---

## 331. COLLECT ERRORS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

COLLECT ERRORS

Errores independientes deben poder recolectarse en una sola ejecución de validación.

---

## 332. NO SILENT FIX

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

NO SILENT FIX

Validation no corrige valores.

---

## 333. CORRECTION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CORRECTION

La corrección debe producir:

```text
new calculation
```

o proceso explícito de corrección.

---

## 334. NO AUTO-ROUND

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

NO AUTO-ROUND

Validation no redondea para hacer pasar una reconciliación.

---

## 335. NO AUTO-BALANCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

NO AUTO-BALANCE

Validation no modifica el saldo para reconciliar.

---

## 336. NO AUTO-ALLOCATE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

NO AUTO-ALLOCATE

Validation no redistribuye residuales.

---

## 337. VALIDATION VS CALCULATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION VS CALCULATION

```text
Calculation
=
produce result

Validation
=
prove result consistency
```

---

## 338. VALIDATION VS AUDIT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION VS AUDIT

```text
Validation
=
is it valid?

Audit Trace
=
why is it this value?
```

---

## 339. VALIDATION VS EXPLANATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION VS EXPLANATION

No generar explicaciones como sustituto de una validación financiera.

---

## 340. FINALIZATION GATE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

FINALIZATION GATE

Conceptualmente:

```text
if validation.valid
    → Finalized
else
    → Blocked
```

---

## 341. WARNING GATE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

WARNING GATE

Si warnings requieren autorización:

```text
warningPolicy
```

determina si Finalized es posible.

---

## 342. FINALIZATION POLICY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

FINALIZATION POLICY

Debe declarar:

```text
allowed warnings
required invariants
required provenance
```

---

## 343. RESULT STATUS TRANSITION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RESULT STATUS TRANSITION

```text
Validated
   ↓
Finalized
```

sólo después del gate.

---

## 344. PUBLICATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PUBLICATION

Publication requiere:

```text
Finalized
```

---

## 345. POST-FINALIZATION VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

POST-FINALIZATION VALIDATION

No modificar el resultado.

Una validación posterior debe generar un nuevo report.

---

## 346. VALIDATION HASH

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION HASH

Puede calcularse:

```text
validationHash
```

sobre:

```text
resultHash
+
validation rules version
+
validation outcomes
```

---

## 347. RULESET VERSION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RULESET VERSION

Registrar:

```text
validationRulesVersion
```

---

## 348. REPLAY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

REPLAY

Mismo:

```text
result
+
ruleset
```

debe producir mismo:

```text
validationHash
```

---

## 349. INVARIANT CATALOG

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INVARIANT CATALOG

Las invariantes deben tener IDs estables:

```text
I01
I02
...
```

---

## 350. RULE EVOLUTION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RULE EVOLUTION

Cambiar la semántica de una invariant requiere versionado.

---

## 351. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

BACKWARD COMPATIBILITY

Resultados históricos pueden haber sido validados con una versión anterior.

---

## 352. HISTORICAL VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

HISTORICAL VALIDATION

No reinterpretar automáticamente un resultado histórico con reglas nuevas.

---

## 353. VALIDATION CONTEXT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION CONTEXT

Debe contener:

```text
result
snapshot reference
artifact reference
policy references
ruleset version
```

---

## 354. NO LIVE DATA

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

NO LIVE DATA

Validation debe utilizar el contexto congelado correspondiente.

---

## 355. VALIDATION DETERMINISM

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION DETERMINISM

Mismos inputs y ruleset:

```text
same validationHash
```

---

## 356. VALIDATION PERFORMANCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION PERFORMANCE

Validation debe evitar recalcular toda la liquidación.

---

## 357. INCREMENTAL VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

INCREMENTAL VALIDATION

Puede validar sólo componentes modificados durante una etapa interna, pero Finalization requiere la validación completa definida por policy.

---

## 358. UNIT VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

UNIT VALIDATION

Validar cada Unit independientemente antes de la agregación global cuando sea posible.

---

## 359. GLOBAL VALIDATION

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

GLOBAL VALIDATION

Después:

```text
Σ Units
```

debe reconciliar con total global.

---

## 360. CROSS-UNIT INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CROSS-UNIT INVARIANTS

Validar:

```text
coefficient totals
allocation totals
tenant totals
```

cuando corresponda.

---

## 361. CROSS-CONCEPT INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CROSS-CONCEPT INVARIANTS

Validar dependencias y resultados compartidos.

---

## 362. PAYMENT INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PAYMENT INVARIANTS

Validar:

```text
payment applications
```

contra Payment Engine result.

---

## 363. ADJUSTMENT INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ADJUSTMENT INVARIANTS

Validar:

```text
debits
credits
net adjustments
```

---

## 364. ALLOCATION INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ALLOCATION INVARIANTS

Validar:

```text
source
basis
allocations
residual
```

---

## 365. ROUNDING INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ROUNDING INVARIANTS

Validar que el resultado siga la policy de rounding.

---

## 366. RESULT INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RESULT INVARIANTS

Validar composición global.

---

## 367. TRACE INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

TRACE INVARIANTS

Validar trazabilidad suficiente cuando el level lo requiera.

---

## 368. SECURITY INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

SECURITY INVARIANTS

Validar aislamiento.

---

## 369. COMPLETENESS INVARIANTS

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

COMPLETENESS INVARIANTS

Validar que no falten fuentes requeridas.

---

## 370. MISSING SOURCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

MISSING SOURCE

Una fuente requerida ausente bloquea Finalization.

---

## 371. UNEXPECTED SOURCE

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

UNEXPECTED SOURCE

Una fuente no declarada debe ser rechazada o marcada según policy.

---

## 372. SOURCE SET HASH

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

SOURCE SET HASH

Puede utilizarse:

```text
sourceSetHash
```

para comprobar que las fuentes esperadas coinciden con las usadas.

---

## 373. RESULT SET HASH

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RESULT SET HASH

Puede derivarse del resultado canónico.

---

## 374. CONSISTENCY MATRIX

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CONSISTENCY MATRIX

Validar relaciones:

```text
Artifact ↔ Execution
Snapshot ↔ Sources
Policies ↔ Operations
Results ↔ Trace
Units ↔ Tenant
Payments ↔ Applications
Adjustments ↔ Novelties
```

---

## 375. VALIDATION MATRIX OUTPUT

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

VALIDATION MATRIX OUTPUT

Cada relación puede producir:

```text
Pass
Fail
Warning
NotApplicable
```

---

## 376. BASIC INVARIANT TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

BASIC INVARIANT TEST

Construir resultado válido y verificar:

```text
valid = true
```

---

## 377. CURRENCY FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

CURRENCY FAILURE TEST

Introducir currency incompatible:

```text
AEL_VALIDATION_CURRENCY
```

---

## 378. RECONCILIATION FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RECONCILIATION FAILURE TEST

Alterar total:

```text
AEL_VALIDATION_RECONCILIATION
```

---

## 379. PAYMENT FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PAYMENT FAILURE TEST

Alterar payment application:

```text
payment invariant fails
```

---

## 380. ALLOCATION FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ALLOCATION FAILURE TEST

Alterar allocation:

```text
allocation invariant fails
```

---

## 381. ADJUSTMENT FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

ADJUSTMENT FAILURE TEST

Alterar net adjustment:

```text
adjustment invariant fails
```

---

## 382. PROVENANCE FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PROVENANCE FAILURE TEST

Eliminar source reference:

```text
AEL_VALIDATION_PROVENANCE
```

---

## 383. SECURITY FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

SECURITY FAILURE TEST

Introducir cross-tenant source:

```text
AEL_VALIDATION_SECURITY
```

---

## 384. TRACE FAILURE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

TRACE FAILURE TEST

Romper referencia TraceNode:

```text
trace invariant fails
```

---

## 385. HASH TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

HASH TEST

Alterar resultado:

```text
resultHash mismatch
```

---

## 386. RULESET TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

RULESET TEST

Cambiar validationRulesVersion:

```text
different validationHash
```

---

## 387. REPLAY TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

REPLAY TEST

Mismo result/ruleset:

```text
same validationHash
```

---

## 388. FINALIZATION TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

FINALIZATION TEST

Invalid result:

```text
cannot finalize
```

---

## 389. WARNING TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

WARNING TEST

Warning permitido:

```text
can finalize
```

según policy.

---

## 390. HISTORICAL TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

HISTORICAL TEST

Resultado histórico no se reinterpreta automáticamente.

---

## 391. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PERFORMANCE TEST

Validation completa dentro del budget sin recalcular Concepts.

---

## 392. PRINCIPIO DE NO CORRECCIÓN

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PRINCIPIO DE NO CORRECCIÓN

Validation detecta; no corrige.

---

## 393. PRINCIPIO DE INTEGRIDAD

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PRINCIPIO DE INTEGRIDAD

Un resultado válido debe poder demostrar consistencia entre sus componentes.

---

## 394. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Liquidation Validation & Financial Invariants Engine 74.md

PRINCIPIO DE DETERMINISMO

Mismo resultado y mismo ruleset producen la misma validación.

---
