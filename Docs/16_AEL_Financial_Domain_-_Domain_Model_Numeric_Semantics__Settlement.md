# AEL V1 — AEL Financial Domain — Domain Model, Numeric Semantics & Settlement

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
50 — Motor de liquidacion_Business & Financial Domain Model 50.md
51 — Motor de liquidacion_Financial Types & Numeric Semantics 51.md
52 — Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md
53 — Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md
68 — Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

OBJETIVO

Definir el modelo conceptual para:

```text
Tenant
Property
Owner
Unit
Period
Charge Concept
Coefficient
Novelty
Balance
Interest
Discount
Tax
Proration
Adjustment
Payment
Settlement
```

---

## 2. SEPARACIÓN DE RESPONSABILIDADES

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SEPARACIÓN DE RESPONSABILIDADES

Separar:

```text
AEL Language
AEL Runtime
Financial Domain
Application
Database
```

---

## 3. AEL LANGUAGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

AEL LANGUAGE

Define:

```text
syntax
types
operators
functions
execution semantics
```

No debe conocer:

```text
"cuota de administración"
```

como concepto hard-coded.

---

## 4. FINANCIAL DOMAIN

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINANCIAL DOMAIN

Define:

```text
business concepts
financial semantics
calculation policies
```

---

## 5. DOMAIN PROVIDERS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN PROVIDERS

El Runtime accede al dominio mediante:

```text
Contracts
Providers
Functions
```

---

## 6. TENANT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TENANT

Tenant representa:

```text
independent business context
```

---

## 7. PROPERTY / COPROPIEDAD

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PROPERTY / COPROPIEDAD

Representa una entidad administrada por el tenant.

---

## 8. UNIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

UNIT

Unidad inmobiliaria:

```text
apartamento
local
oficina
parqueadero
depósito
```

según configuración del negocio.

---

## 9. OWNER

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

OWNER

Titular asociado a una Unit.

Puede existir:

```text
co-owner
multiple owners
```

si el modelo lo permite.

---

## 10. UNIT COEFFICIENT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

UNIT COEFFICIENT

Coefficient representa participación porcentual o proporcional.

Ejemplo conceptual:

```text
0.0125
```

---

## 11. COEFFICIENT SEMANTICS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

COEFFICIENT SEMANTICS

Debe existir una definición explícita de:

```text
scale
precision
rounding
```

---

## 12. PERIOD

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERIOD

Period identifica el intervalo de liquidación.

Conceptualmente:

```text
year
month
startDate
endDate
```

---

## 13. PERIOD IDENTITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERIOD IDENTITY

Preferido:

```text
tenantId
periodCode
```

---

## 14. PERIOD STATUS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERIOD STATUS

Puede incluir:

```text
OPEN
CALCULATING
CLOSED
LOCKED
```

---

## 15. CLOSED PERIOD

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CLOSED PERIOD

No debe modificarse sin:

```text
controlled adjustment process
```

---

## 16. LOCKED PERIOD

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

LOCKED PERIOD

No debe recibir nuevas liquidaciones ordinarias.

---

## 17. CHARGE CONCEPT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CHARGE CONCEPT

Representa un concepto cobrable.

Ejemplos:

```text
ADMINISTRATION
EXTRAORDINARY
PARKING
STORAGE
UTILITY
PENALTY
INTEREST
OTHER
```

---

## 18. CONCEPT CODE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CONCEPT CODE

Cada concepto debe tener:

```text
stable code
```

---

## 19. CONCEPT VERSION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CONCEPT VERSION

Si cambia su semántica:

```text
new version
```

---

## 20. CHARGE BASE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CHARGE BASE

Un concepto puede calcularse sobre:

```text
fixed amount
coefficient
quantity
usage
percentage
previous balance
```

---

## 21. FIXED CHARGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FIXED CHARGE

Conceptualmente:

```text
amount = configured value
```

---

## 22. COEFFICIENT CHARGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

COEFFICIENT CHARGE

Conceptualmente:

```text
amount = base * coefficient
```

---

## 23. QUANTITY CHARGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

QUANTITY CHARGE

Conceptualmente:

```text
amount = quantity * unitPrice
```

---

## 24. PERCENTAGE CHARGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERCENTAGE CHARGE

Conceptualmente:

```text
amount = base * rate
```

---

## 25. BALANCE-BASED CHARGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

BALANCE-BASED CHARGE

Puede calcularse sobre:

```text
eligible balance
```

según Contract.

---

## 26. NOVELTY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NOVELTY

Novelty representa una modificación o elemento extraordinario de una liquidación.

Ejemplos:

```text
cargo manual
descuento
ajuste
consumo
reembolso
```

---

## 27. NOVELTY IDENTITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NOVELTY IDENTITY

Debe tener:

```text
noveltyId
tenantId
unitId
period
```

---

## 28. NOVELTY TYPE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NOVELTY TYPE

Ejemplos:

```text
CHARGE
DISCOUNT
ADJUSTMENT
REFUND
CREDIT
DEBIT
```

---

## 29. NOVELTY APPROVAL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NOVELTY APPROVAL

Novedades sensibles pueden requerir:

```text
approval
```

antes de afectar una liquidación.

---

## 30. NOVELTY AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NOVELTY AUDIT

Registrar:

```text
createdBy
createdAt
approvedBy
approvedAt
```

cuando aplique.

---

## 31. SETTLEMENT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SETTLEMENT

Settlement representa el resultado calculado para una entidad y período.

---

## 32. SETTLEMENT INPUT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SETTLEMENT INPUT

Debe poder identificar:

```text
tenant
unit
period
concepts
coefficients
novelties
balances
policies
```

---

## 33. SETTLEMENT OUTPUT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SETTLEMENT OUTPUT

Puede contener:

```text
grossCharges
discounts
taxes
interest
credits
debits
netAmount
```

---

## 34. LINE ITEMS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

LINE ITEMS

La liquidación debe componerse de:

```text
SettlementLine[]
```

---

## 35. SETTLEMENT LINE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SETTLEMENT LINE

Conceptualmente:

```ts
interface SettlementLine {
  conceptCode: string
  quantity?: number
  unitPrice?: Money
  base?: Money
  rate?: Rate
  amount: Money
}
```

---

## 36. LINE TRACEABILITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

LINE TRACEABILITY

Cada línea debe poder relacionarse con:

```text
source
concept
rule
```

cuando sea necesario.

---

## 37. MONEY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

MONEY

Money debe representar:

```text
amount
currency
```

---

## 38. MONEY PRECISION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

MONEY PRECISION

La precisión debe ser explícita.

No depender de:

```text
floating-point coincidence
```

---

## 39. DECIMAL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DECIMAL

Para cálculos monetarios utilizar representación decimal apropiada.

---

## 40. CURRENCY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CURRENCY

Currency debe estar definida explícitamente.

Ejemplo:

```text
COP
```

---

## 41. CURRENCY CONSISTENCY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CURRENCY CONSISTENCY

No mezclar currencies sin:

```text
explicit conversion policy
```

---

## 42. EXCHANGE RATE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

EXCHANGE RATE

Si se soporta conversión:

```text
ExchangeRate Contract
```

debe definir:

```text
source
date
rate
rounding
```

---

## 43. RATE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

RATE

Rate representa porcentaje/tasa.

Debe distinguirse de:

```text
Money
Quantity
Coefficient
```

---

## 44. ROUNDING

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ROUNDING

Rounding debe ser una política explícita.

Ejemplos:

```text
HALF_UP
HALF_EVEN
DOWN
UP
```

según soporte.

---

## 45. ROUNDING LOCATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ROUNDING LOCATION

Debe definirse si el redondeo ocurre:

```text
per line
per concept
per subtotal
per final total
```

---

## 46. ROUNDING CONSISTENCY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ROUNDING CONSISTENCY

Una Rule no debe producir resultados distintos simplemente por cambiar:

```text
execution order
```

cuando semantics exija determinismo.

---

## 47. TAX

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TAX

Tax representa impuesto aplicable.

Puede requerir:

```text
taxCode
rate
base
```

---

## 48. TAX BASE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TAX BASE

Base tributaria debe ser:

```text
explicitly defined
```

---

## 49. TAX EXEMPTION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TAX EXEMPTION

Debe existir:

```text
exemption policy
```

si aplica.

---

## 50. DISCOUNT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DISCOUNT

Discount reduce un importe elegible.

Debe indicar:

```text
base
rate or amount
eligibility
```

---

## 51. DISCOUNT ORDER

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DISCOUNT ORDER

Debe definirse si descuentos ocurren:

```text
before tax
after tax
before interest
```

según política.

---

## 52. INTEREST

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

INTEREST

Interest representa cargo financiero sobre una base elegible.

---

## 53. INTEREST BASE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

INTEREST BASE

Debe especificar:

```text
principal
eligible balance
overdue amount
```

---

## 54. INTEREST RATE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

INTEREST RATE

Puede ser:

```text
daily
monthly
annual
effective
nominal
```

pero debe estar explícitamente definido.

---

## 55. INTEREST PERIOD

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

INTEREST PERIOD

Debe definir:

```text
start
end
day-count convention
```

---

## 56. DAY COUNT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DAY COUNT

Si aplica, definir:

```text
ACTUAL_365
ACTUAL_360
THIRTY_360
```

u otra convención soportada.

---

## 57. GRACE PERIOD

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

GRACE PERIOD

Puede existir:

```text
graceDays
```

---

## 58. DUE DATE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DUE DATE

Cada charge puede tener:

```text
dueDate
```

---

## 59. OVERDUE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

OVERDUE

Una obligación está vencida cuando:

```text
currentDate > dueDate
```

según timezone y política.

---

## 60. BUSINESS DAYS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

BUSINESS DAYS

Si una policy lo requiere:

```text
BusinessCalendar Contract
```

debe proporcionar días hábiles.

---

## 61. PRORATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRORATION

Proration distribuye un valor proporcionalmente.

---

## 62. PRORATION BASIS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRORATION BASIS

Puede basarse en:

```text
days
calendar days
business days
coefficient
quantity
```

---

## 63. PRORATION INTERVAL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRORATION INTERVAL

Debe definir:

```text
effectiveFrom
effectiveTo
```

---

## 64. MID-PERIOD CHANGE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

MID-PERIOD CHANGE

Cambios de:

```text
owner
unit
coefficient
rate
```

durante un período pueden requerir proration.

---

## 65. ADJUSTMENT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ADJUSTMENT

Adjustment modifica un resultado anterior.

---

## 66. ADJUSTMENT TYPES

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ADJUSTMENT TYPES

```text
DEBIT
CREDIT
CORRECTION
REVERSAL
```

---

## 67. REVERSAL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

REVERSAL

Reversal debe conservar referencia:

```text
original transaction
```

---

## 68. NO DESTRUCTIVE HISTORY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NO DESTRUCTIVE HISTORY

No sobrescribir una liquidación histórica para corregirla.

Preferir:

```text
adjustment
```

o:

```text
reversal
```

---

## 69. PAYMENT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PAYMENT

Payment representa un pago recibido.

---

## 70. PAYMENT ALLOCATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PAYMENT ALLOCATION

Un pago puede asignarse a:

```text
principal
interest
penalty
tax
other
```

según policy.

---

## 71. ALLOCATION ORDER

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ALLOCATION ORDER

Debe ser explícito.

Ejemplo conceptual:

```text
interest
→ penalties
→ current charges
→ principal
```

La secuencia exacta pertenece a la policy del dominio.

---

## 72. BALANCE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

BALANCE

Balance representa obligación pendiente.

---

## 73. BALANCE COMPONENTS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

BALANCE COMPONENTS

Puede separarse:

```text
principal
interest
penalties
tax
credits
```

---

## 74. CREDIT BALANCE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CREDIT BALANCE

Un saldo a favor debe diferenciarse de:

```text
zero balance
```

---

## 75. ZERO BALANCE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ZERO BALANCE

Debe representar:

```text
exactly zero
```

no:

```text
negative
```

---

## 76. NEGATIVE BALANCE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NEGATIVE BALANCE

Sólo permitido si el modelo explícitamente lo soporta.

---

## 77. ACCOUNTING SIGN

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ACCOUNTING SIGN

Definir consistentemente:

```text
debit
credit
charge
payment
```

---

## 78. SIGN CONVENTION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SIGN CONVENTION

Toda API y Function financiera debe documentar:

```text
positive
negative
```

semantics.

---

## 79. FINANCIAL INVARIANTS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINANCIAL INVARIANTS

Ejemplo:

```text
netAmount
=
grossCharges
-
discounts
+
taxes
+
interest
+
debits
-
credits
```

La fórmula exacta depende del modelo final, pero debe existir como invariant.

---

## 80. SUM OF LINES

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SUM OF LINES

Debe cumplirse:

```text
sum(lines)
=
reported subtotal
```

salvo ajustes explícitos.

---

## 81. TOTAL RECONCILIATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TOTAL RECONCILIATION

Debe poder demostrarse:

```text
lines
→ subtotals
→ total
```

---

## 82. COEFFICIENT RECONCILIATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

COEFFICIENT RECONCILIATION

Si corresponde:

```text
sum(coefficients)
```

debe cumplir policy definida.

No asumir automáticamente que debe ser exactamente:

```text
1.0
```

si existen unidades excluidas o reglas especiales.

---

## 83. PERIOD RECONCILIATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERIOD RECONCILIATION

Cada settlement debe pertenecer a:

```text
exact period
```

---

## 84. DUPLICATE SETTLEMENT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DUPLICATE SETTLEMENT

Debe existir constraint o policy para impedir:

```text
duplicate active settlement
```

para la misma identidad de negocio.

---

## 85. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

IDEMPOTENCY

Liquidation requests deben soportar:

```text
idempotency
```

cuando puedan repetirse.

---

## 86. CALCULATION SNAPSHOT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CALCULATION SNAPSHOT

Una liquidación cerrada debe conservar referencia a:

```text
Artifact
dependencies
input snapshot
policy versions
```

según requisitos.

---

## 87. CALCULATION EXPLAINABILITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CALCULATION EXPLAINABILITY

Debe poder producirse un:

```text
calculation explanation
```

para auditoría.

---

## 88. EXPLANATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

EXPLANATION

Puede incluir:

```text
input
rule
line calculation
rounding
subtotal
final result
```

---

## 89. EXPLANATION SECURITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

EXPLANATION SECURITY

No exponer:

```text
internal secrets
provider credentials
```

---

## 90. BUSINESS CALENDAR

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

BUSINESS CALENDAR

Contract:

```text
BusinessCalendar
```

puede proporcionar:

```text
isBusinessDay
nextBusinessDay
previousBusinessDay
```

---

## 91. DATE/TIME

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DATE/TIME

Las Rules deben usar:

```text
trusted clock
```

del ExecutionContext.

---

## 92. TIMEZONE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TIMEZONE

Cada cálculo dependiente de fecha debe definir:

```text
timezone
```

---

## 93. PERIOD CLOSE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERIOD CLOSE

Cerrar período debe ser:

```text
audited
authorized
```

---

## 94. PERIOD REOPEN

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PERIOD REOPEN

Reabrir período debe requerir:

```text
explicit authorization
reason
audit
```

---

## 95. POLICY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

POLICY

Financial policy debe ser versionable.

Ejemplos:

```text
roundingPolicy
interestPolicy
taxPolicy
allocationPolicy
```

---

## 96. POLICY VERSION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

POLICY VERSION

Una liquidación debe poder identificar:

```text
policyVersion
```

---

## 97. RULE VS POLICY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

RULE VS POLICY

Rule expresa:

```text
calculation logic
```

Policy expresa:

```text
governed business decision
```

---

## 98. DOMAIN CONTRACTS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN CONTRACTS

Ejemplos:

```text
Unit Contract
Owner Contract
Coefficient Contract
Balance Contract
Charge Contract
Interest Contract
Payment Contract
Period Contract
```

---

## 99. DOMAIN FUNCTIONS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN FUNCTIONS

Ejemplos:

```text
calculateProration()
calculateInterest()
calculateDiscount()
calculateTax()
allocatePayment()
roundMoney()
```

---

## 100. FUNCTION PURITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FUNCTION PURITY

Functions financieras puras deberían ser:

```text
deterministic
side-effect free
```

cuando sea posible.

---

## 101. SIDE EFFECTS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SIDE EFFECTS

Persistencia debe estar detrás de:

```text
Provider
```

o mecanismo explícito.

---

## 102. FINANCIAL SIDE EFFECTS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINANCIAL SIDE EFFECTS

Writes financieros deben ser:

```text
transactional
audited
idempotent
```

cuando corresponda.

---

## 103. CALCULATION VS POSTING

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CALCULATION VS POSTING

Separar:

```text
calculate
```

de:

```text
post / persist
```

---

## 104. DRY RUN

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DRY RUN

Toda liquidación crítica debería poder calcularse:

```text
without posting
```

cuando el negocio lo permita.

---

## 105. PREVIEW

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PREVIEW

UI puede mostrar:

```text
preview result
```

antes de activar/postear.

---

## 106. APPROVAL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

APPROVAL

Posting puede requerir:

```text
approval
```

según monto o policy.

---

## 107. THRESHOLD APPROVAL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

THRESHOLD APPROVAL

Puede existir:

```text
amount threshold
```

para aprobación adicional.

---

## 108. FINANCIAL AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINANCIAL AUDIT

Registrar:

```text
rule
artifact
input
result
actor
timestamp
```

según retention y privacidad.

---

## 109. CORRECTION MODEL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CORRECTION MODEL

Corrección preferida:

```text
new adjustment
```

en vez de:

```text
UPDATE historical calculation
```

---

## 110. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

REPRODUCIBILITY

Una liquidación histórica debe poder reconstruirse mediante:

```text
Artifact
+
Dependencies
+
Policy versions
+
Input snapshot
```

---

## 111. HISTORICAL IMMUTABILITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

HISTORICAL IMMUTABILITY

Una liquidación cerrada debe ser:

```text
immutable
```

excepto mediante:

```text
controlled correction
```

---

## 112. ROUNDING AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ROUNDING AUDIT

Registrar la policy de redondeo usada cuando sea necesario.

---

## 113. CURRENCY AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CURRENCY AUDIT

Registrar currency utilizada.

---

## 114. TAX AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TAX AUDIT

Registrar:

```text
taxCode
rate
base
```

cuando aplique.

---

## 115. INTEREST AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

INTEREST AUDIT

Registrar:

```text
rate
period
base
day-count
```

cuando aplique.

---

## 116. PRORATION AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRORATION AUDIT

Registrar:

```text
basis
start
end
factor
```

cuando aplique.

---

## 117. NOVELTY AUDIT

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

NOVELTY AUDIT

Registrar:

```text
novelty
reason
creator
approver
```

cuando corresponda.

---

## 118. DOMAIN VALIDATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN VALIDATION

Antes de calcular:

```text
validate input
```

---

## 119. INVALID DOMAIN STATE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

INVALID DOMAIN STATE

Ejemplos:

```text
negative coefficient when forbidden
invalid period
unknown concept
wrong currency
duplicate active settlement
```

---

## 120. DOMAIN ERROR

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN ERROR

Debe producir:

```text
structured diagnostic
```

no:

```text
generic exception
```

---

## 121. FINANCIAL ERROR CATEGORIES

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINANCIAL ERROR CATEGORIES

```text
DOMAIN
VALIDATION
POLICY
DATA
AUTHORIZATION
CONCURRENCY
SYSTEM
```

---

## 122. CONCURRENCY CONTROL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

CONCURRENCY CONTROL

Liquidation posting debe proteger contra:

```text
double posting
lost update
```

---

## 123. OPTIMISTIC LOCKING

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

OPTIMISTIC LOCKING

Puede utilizar:

```text
version column
```

---

## 124. TRANSACTION BOUNDARY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TRANSACTION BOUNDARY

Definir explícitamente qué operaciones deben ser atómicas.

---

## 125. SETTLEMENT TRANSACTION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SETTLEMENT TRANSACTION

Conceptualmente:

```text
validate
→ calculate
→ persist
→ audit
```

dentro de límites transaccionales apropiados.

---

## 126. OUTBOX

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md; Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

OUTBOX

Para eventos posteriores a commit puede utilizarse:

```text
transactional outbox
```

---

## 127. DOMAIN EVENTS

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN EVENTS

Ejemplos:

```text
SettlementCalculated
SettlementPosted
PaymentApplied
PeriodClosed
```

---

## 128. EVENT IDEMPOTENCY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

EVENT IDEMPOTENCY

Consumers deben soportar:

```text
duplicate event
```

sin duplicar efectos.

---

## 129. FINANCIAL SECURITY

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINANCIAL SECURITY

No permitir que una Rule cambie:

```text
tenant
currency
authorization
```

fuera de Contracts/Policies autorizados.

---

## 130. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

TENANT ISOLATION

Todas las entidades financieras deben respetar:

```text
tenant scope
```

---

## 131. ACCESS CONTROL

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

ACCESS CONTROL

Separar:

```text
calculate
approve
post
reverse
close period
```

si el negocio lo requiere.

---

## 132. SEGREGATION OF DUTIES

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

SEGREGATION OF DUTIES

Para operaciones críticas:

```text
author
approver
operator
```

pueden ser distintos.

---

## 133. DOMAIN MODEL EXIT CRITERIA

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

DOMAIN MODEL EXIT CRITERIA

```text
✓ Tenant
✓ Property
✓ Unit
✓ Owner
✓ Coefficient
✓ Period
✓ Charge Concept
✓ Novelty
✓ Settlement
✓ Settlement Lines
✓ Money
✓ Currency
✓ Rate
✓ Tax
✓ Discount
✓ Interest
✓ Proration
✓ Adjustment
✓ Payment
✓ Balance
✓ Financial invariants
✓ Reconciliation
✓ Idempotency
✓ Calculation snapshot
✓ Explainability
✓ Policies
✓ Domain Contracts
✓ Domain Functions
✓ Dry Run
✓ Approval
✓ Audit
✓ Correction model
✓ Concurrency control
✓ Transaction boundaries
✓ Domain events
✓ Tenant isolation
```

---

## 134. FINAL DOMAIN ARCHITECTURE

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

FINAL DOMAIN ARCHITECTURE

```text
                    Financial Domain
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
      Master             Period             Policy
      Data                 │                  │
        │                  ▼                  │
        │             Charge Concepts         │
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                        Novelties
                           │
                           ▼
                       AEL Rule
                           │
                           ▼
                      Calculation
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           Charges      Interest      Taxes
              │            │            │
              └────────────┼────────────┘
                           ▼
                       Settlement
                           │
                           ▼
                      Reconciliation
                           │
                           ▼
                       Approval
                           │
                           ▼
                         Posting
                           │
                           ▼
                         Audit
```

---

## 135. PRINCIPIO DE SEPARACIÓN

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRINCIPIO DE SEPARACIÓN

```text
AEL
≠
Financial Domain
```

AEL proporciona la capacidad de expresar:

```text
reglas
```

El dominio proporciona:

```text
meaning
```

---

## 136. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRINCIPIO FINANCIERO

Todo cálculo monetario debe ser:

```text
precise
deterministic
traceable
reproducible
```

---

## 137. PRINCIPIO DE HISTORIA

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRINCIPIO DE HISTORIA

```text
Historical result
```

no debe ser sobrescrito para "corregirlo".

Debe existir:

```text
adjustment
or
reversal
```

---

## 138. PRINCIPIO DE AUDITORÍA

> **Origen:** Motor de liquidacion_Business & Financial Domain Model 50.md

PRINCIPIO DE AUDITORÍA

Una liquidación debe poder explicar:

```text
qué
por qué
cómo
con qué versión
con qué datos
```

se calculó.

---

## 139. OBJETIVO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

OBJETIVO

Definir formalmente:

```text
Integer
Decimal
Money
Currency
Rate
Percentage
Quantity
Coefficient
Precision
Scale
Rounding
Comparison
Division
Overflow
Aggregation
Serialization
```

---

## 140. PRINCIPIO NUMÉRICO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRINCIPIO NUMÉRICO

AEL debe distinguir:

```text
Integer
Decimal
Money
Rate
Quantity
Coefficient
```

No tratarlos como un único:

```text
number
```

---

## 141. INTEGER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

INTEGER

Representa números enteros.

Ejemplos:

```text
0
1
10
-5
```

---

## 142. INTEGER SEMANTICS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

INTEGER SEMANTICS

Debe definirse:

```text
range
overflow behavior
division behavior
```

---

## 143. DECIMAL

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DECIMAL

Representa un número decimal exacto.

Ejemplos:

```text
10.25
0.01
123456.789
```

---

## 144. DECIMAL REPRESENTATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DECIMAL REPRESENTATION

Preferido:

```text
sign
coefficient
scale
```

Conceptualmente:

```text
123.45
=
12345 × 10^-2
```

---

## 145. NO BINARY FLOAT FOR MONEY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NO BINARY FLOAT FOR MONEY

No utilizar directamente:

```text
float
double
```

para representar Money.

---

## 146. MONEY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY

Money representa:

```text
amount
currency
```

Conceptualmente:

```ts
interface Money {
  amount: Decimal
  currency: Currency
}
```

---

## 147. MONEY IDENTITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY IDENTITY

Dos Money son comparables directamente sólo si:

```text
currency equal
```

salvo conversión explícita.

---

## 148. CURRENCY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CURRENCY

Currency debe ser un tipo explícito.

Ejemplo:

```text
COP
```

---

## 149. CURRENCY CODE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CURRENCY CODE

Preferido:

```text
ISO 4217
```

cuando corresponda.

---

## 150. CURRENCY SCALE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CURRENCY SCALE

Cada Currency puede definir:

```text
default minor-unit scale
```

pero el motor debe distinguir:

```text
currency scale
```

de:

```text
calculation precision
```

---

## 151. CALCULATION PRECISION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CALCULATION PRECISION

Una operación puede necesitar más precisión interna que la escala final de presentación.

---

## 152. SCALE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SCALE

Scale indica:

```text
cantidad de dígitos decimales
```

---

## 153. PRECISION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRECISION

Precision indica:

```text
cantidad total de dígitos significativos representables
```

según la implementación decimal.

---

## 154. INTERNAL PRECISION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

INTERNAL PRECISION

Las operaciones financieras deben utilizar precisión interna suficiente para evitar pérdida prematura.

---

## 155. FINAL ROUNDING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FINAL ROUNDING

El resultado debe redondearse según:

```text
explicit policy
```

---

## 156. ROUNDING POLICY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ROUNDING POLICY

Debe ser versionable.

Ejemplo:

```text
HALF_UP
HALF_EVEN
DOWN
UP
```

---

## 157. HALF_UP

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

HALF_UP

Ejemplo conceptual:

```text
1.235 → 1.24
```

para scale 2.

---

## 158. HALF_EVEN

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

HALF_EVEN

Ejemplo conceptual:

```text
1.235 → 1.24
1.245 → 1.24
```

para scale 2.

---

## 159. DOWN

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DOWN

Redondea hacia cero.

---

## 160. UP

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

UP

Redondea alejándose de cero.

---

## 161. NEGATIVE ROUNDING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NEGATIVE ROUNDING

Debe especificarse explícitamente para valores negativos.

No asumir comportamiento de:

```text
floor
```

cuando se requiere:

```text
toward zero
```

---

## 162. ROUNDING LOCATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ROUNDING LOCATION

Debe definirse dónde ocurre:

```text
per operation
per line
per concept
per subtotal
final result
```

---

## 163. ROUNDING ORDER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ROUNDING ORDER

El orden de:

```text
calculate
round
aggregate
```

puede cambiar el resultado.

Por ello debe ser parte de la semántica.

---

## 164. MONEY ADDITION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY ADDITION

Sólo permitir:

```text
Money(COP) + Money(COP)
```

---

## 165. MONEY DIFFERENT CURRENCY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY DIFFERENT CURRENCY

Debe fallar:

```text
Money(COP) + Money(USD)
```

sin conversión explícita.

---

## 166. MONEY SUBTRACTION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY SUBTRACTION

Misma regla:

```text
same currency
```

---

## 167. MONEY × INTEGER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY × INTEGER

Permitido:

```text
Money * Integer
```

resultado:

```text
Money
```

---

## 168. MONEY × DECIMAL

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY × DECIMAL

Puede permitirse:

```text
Money * Decimal
```

resultado:

```text
Money
```

con rounding policy definida.

---

## 169. MONEY × RATE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY × RATE

Permitido si Rate es compatible con:

```text
Money
```

resultado:

```text
Money
```

---

## 170. MONEY ÷ INTEGER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY ÷ INTEGER

Permitido.

Debe aplicar:

```text
precision
rounding
```

según policy.

---

## 171. MONEY ÷ MONEY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY ÷ MONEY

No debe producir Money.

Puede producir:

```text
Decimal
```

sólo si la semántica define explícitamente el ratio.

---

## 172. RATE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RATE

Rate representa una tasa.

Ejemplo:

```text
0.05
```

para:

```text
5%
```

---

## 173. RATE REPRESENTATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RATE REPRESENTATION

Preferido:

```text
5% = 0.05
```

---

## 174. PERCENTAGE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PERCENTAGE

Percentage puede ser una representación semántica de Rate.

Ejemplo:

```text
5%
```

---

## 175. RATE VS PERCENTAGE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RATE VS PERCENTAGE

AEL debe evitar confundir:

```text
5
```

con:

```text
0.05
```

---

## 176. QUANTITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

QUANTITY

Quantity representa una magnitud:

```text
value
unit
```

---

## 177. UNIT

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

UNIT

Ejemplos:

```text
m2
kWh
hour
unit
```

según dominio.

---

## 178. QUANTITY COMPATIBILITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

QUANTITY COMPATIBILITY

Sólo sumar:

```text
same dimension
compatible unit
```

---

## 179. QUANTITY CONVERSION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

QUANTITY CONVERSION

Debe existir Function/Contract explícito para convertir.

---

## 180. COEFFICIENT

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

COEFFICIENT

Coefficient representa participación o factor de distribución.

Ejemplo:

```text
0.0125
```

---

## 181. COEFFICIENT ≠ RATE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

COEFFICIENT ≠ RATE

Aunque ambos puedan ser decimals:

```text
semantic types differ
```

---

## 182. TYPE SAFETY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TYPE SAFETY

No permitir implícitamente:

```text
Coefficient + Money
Rate + Currency
Money + Quantity
```

---

## 183. IMPLICIT CONVERSION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

IMPLICIT CONVERSION

Reducir conversiones implícitas en tipos financieros.

---

## 184. EXPLICIT CONVERSION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

EXPLICIT CONVERSION

Preferir:

```text
toDecimal()
toMoney()
toRate()
convertCurrency()
convertQuantity()
```

cuando sea necesario.

---

## 185. DECIMAL COMPARISON

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DECIMAL COMPARISON

Comparar valores matemáticos, no representación binaria.

---

## 186. EQUALITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

EQUALITY

Ejemplo:

```text
1.0 == 1.00
```

debe ser:

```text
true
```

si ambos representan el mismo Decimal.

---

## 187. SCALE-PRESERVING EQUALITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SCALE-PRESERVING EQUALITY

Scale distinta no implica:

```text
different value
```

---

## 188. ORDERING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ORDERING

Debe cumplir:

```text
a < b
a == b
a > b
```

de forma consistente.

---

## 189. ZERO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ZERO

Zero debe representar exactamente:

```text
0
```

---

## 190. NEGATIVE ZERO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NEGATIVE ZERO

Normalizar:

```text
-0
```

a:

```text
0
```

salvo necesidad técnica explícita.

---

## 191. SIGN

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SIGN

Decimal debe soportar:

```text
positive
negative
zero
```

---

## 192. ABS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ABS

`abs()` debe devolver:

```text
non-negative
```

---

## 193. NEGATE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NEGATE

Negación debe preservar magnitud.

---

## 194. ADDITION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ADDITION

Debe ser exacta dentro de los límites representables.

---

## 195. SUBTRACTION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SUBTRACTION

Igualmente exacta dentro de límites.

---

## 196. MULTIPLICATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MULTIPLICATION

Resultado puede incrementar:

```text
precision
scale
```

y debe normalizarse según policy.

---

## 197. DIVISION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DIVISION

División puede producir decimal no terminante.

Debe existir:

```text
division precision
rounding policy
```

---

## 198. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DIVISION BY ZERO

Debe producir:

```text
structured error
```

nunca:

```text
Infinity
NaN
```

---

## 199. MODULO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MODULO

Si se soporta `%`, debe definir:

```text
integer semantics
decimal semantics
negative behavior
```

---

## 200. POWER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

POWER

Si se soporta exponentiation:

```text
domain
precision
rounding
overflow
```

deben estar definidos.

---

## 201. SQRT / LOG / EXP

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SQRT / LOG / EXP

Funciones trascendentales no deberían formar parte del núcleo financiero V1 salvo necesidad explícita.

---

## 202. OVERFLOW

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

OVERFLOW

Overflow debe detectarse.

---

## 203. NO SILENT OVERFLOW

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NO SILENT OVERFLOW

No convertir silenciosamente:

```text
overflow
→ Infinity
```

---

## 204. UNDERFLOW

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

UNDERFLOW

Si existe pérdida significativa de precisión:

```text
policy-defined behavior
```

---

## 205. MAX PRECISION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MAX PRECISION

Implementación debe definir:

```text
maximum precision
maximum scale
maximum magnitude
```

---

## 206. RESOURCE LIMITS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RESOURCE LIMITS

Valores numéricos excesivamente grandes no deben permitir:

```text
memory exhaustion
CPU exhaustion
```

---

## 207. DECIMAL NORMALIZATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DECIMAL NORMALIZATION

Puede normalizar:

```text
trailing zeros
```

sin cambiar valor matemático.

---

## 208. CANONICAL DECIMAL

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CANONICAL DECIMAL

Para hashing/serialization utilizar representación:

```text
canonical
deterministic
```

---

## 209. DECIMAL SERIALIZATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DECIMAL SERIALIZATION

No serializar Money como:

```text
binary float
```

---

## 210. API SERIALIZATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

API SERIALIZATION

Preferido para Money:

```json
{
  "amount": "123456.78",
  "currency": "COP"
}
```

---

## 211. NUMBER JSON

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NUMBER JSON

No depender de:

```text
JSON number
```

para importes financieros si puede perder precisión.

---

## 212. DATABASE MAPPING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DATABASE MAPPING

PostgreSQL:

```text
numeric
```

es preferido para Decimal/Money.

---

## 213. MONEY DATABASE TYPE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY DATABASE TYPE

Puede utilizarse:

```text
numeric(p,s)
```

con precisión definida por dominio.

---

## 214. FLOAT DATABASE TYPES

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FLOAT DATABASE TYPES

No utilizar:

```text
real
double precision
```

para importes financieros críticos.

---

## 215. DATABASE SCALE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DATABASE SCALE

Debe alinearse con:

```text
domain policy
```

no simplemente con:

```text
currency default scale
```

---

## 216. ROUNDING AT DATABASE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ROUNDING AT DATABASE

No depender accidentalmente del rounding implícito de PostgreSQL.

---

## 217. APPLICATION VS DATABASE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

APPLICATION VS DATABASE

Debe existir una decisión explícita sobre:

```text
where rounding occurs
```

---

## 218. SINGLE SOURCE OF TRUTH

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SINGLE SOURCE OF TRUTH

La semántica de rounding debe ser:

```text
defined once
```

---

## 219. AGGREGATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

AGGREGATION

Sumar Money:

```text
same currency
```

---

## 220. SUM PRECISION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SUM PRECISION

La agregación debe conservar suficiente precisión antes del rounding final.

---

## 221. ORDER INDEPENDENCE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ORDER INDEPENDENCE

Para operaciones matemáticamente asociativas exactas:

```text
sum order
```

no debe cambiar resultado.

Si el rounding se aplica entre pasos:

```text
order may matter
```

y debe quedar definido.

---

## 222. DISTRIBUTION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DISTRIBUTION

Distribuir Money entre unidades requiere:

```text
allocation policy
```

---

## 223. REMAINDER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

REMAINDER

Cuando el resultado no puede dividirse exactamente:

```text
remainder allocation
```

debe ser explícita.

---

## 224. REMAINDER EXAMPLE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

REMAINDER EXAMPLE

Un importe de:

```text
100
```

distribuido entre tres unidades puede producir:

```text
33.33
33.33
33.34
```

La unidad que recibe el centavo adicional debe definirse mediante policy.

---

## 225. DETERMINISTIC DISTRIBUTION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DETERMINISTIC DISTRIBUTION

No depender de:

```text
database row order
```

para decidir quién recibe remainder.

---

## 226. STABLE ORDER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

STABLE ORDER

Utilizar:

```text
stable business key
```

si se necesita orden determinista.

---

## 227. COEFFICIENT DISTRIBUTION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

COEFFICIENT DISTRIBUTION

Debe especificar:

```text
normalization
rounding
remainder
```

---

## 228. TOTAL RECONCILIATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TOTAL RECONCILIATION

Después de distribuir:

```text
sum(allocated)
=
source amount
```

cuando la policy lo requiera.

---

## 229. RATE APPLICATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RATE APPLICATION

Aplicar Rate:

```text
amount × rate
```

debe definir:

```text
intermediate precision
rounding
```

---

## 230. TAX CALCULATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TAX CALCULATION

Tax debe definir:

```text
base
rate
rounding
```

---

## 231. INTEREST CALCULATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

INTEREST CALCULATION

Interest debe definir:

```text
principal
rate
period
day count
rounding
```

---

## 232. PRORATION CALCULATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRORATION CALCULATION

Proration debe definir:

```text
source amount
eligible fraction
rounding
```

---

## 233. COMPOUND INTEREST

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

COMPOUND INTEREST

Si se soporta:

```text
compounding frequency
```

debe ser explícita.

---

## 234. SIMPLE INTEREST

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SIMPLE INTEREST

Debe definir:

```text
rate
time fraction
base
```

---

## 235. TAX + DISCOUNT ORDER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TAX + DISCOUNT ORDER

Debe pertenecer a:

```text
financial policy
```

---

## 236. FINANCIAL PIPELINE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FINANCIAL PIPELINE

Ejemplo conceptual:

```text
Base
 ↓
Discount
 ↓
Tax
 ↓
Interest
 ↓
Adjustment
 ↓
Rounding
 ↓
Total
```

La secuencia real debe estar definida por la Policy correspondiente.

---

## 237. TYPE ERRORS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TYPE ERRORS

Ejemplo:

```text
Money + Rate
```

debe producir:

```text
type error
```

---

## 238. CURRENCY ERRORS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CURRENCY ERRORS

```text
COP + USD
```

debe producir:

```text
currency mismatch
```

---

## 239. PRECISION ERRORS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRECISION ERRORS

Si una operación supera límites:

```text
numeric overflow
```

---

## 240. DIVISION ERROR

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DIVISION ERROR

```text
division by zero
```

---

## 241. ROUNDING ERROR

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ROUNDING ERROR

Una policy inválida debe rechazarse durante:

```text
validation
```

---

## 242. TYPE INFERENCE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TYPE INFERENCE

El compilador debe inferir tipos financieros de forma segura.

---

## 243. NO NUMERIC COLLAPSING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NO NUMERIC COLLAPSING

No convertir todos los tipos a:

```text
Decimal
```

sólo para simplificar el compiler.

---

## 244. STATIC SAFETY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

STATIC SAFETY

Debe detectar en compile time:

```text
Money + Quantity
Money(COP) + Money(USD)
Rate + Currency
```

cuando los tipos sean conocidos.

---

## 245. RUNTIME SAFETY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RUNTIME SAFETY

Inputs dinámicos deben validarse en runtime.

---

## 246. TYPE NARROWING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

TYPE NARROWING

Conversions explícitas pueden producir:

```text
typed value
```

después de validación.

---

## 247. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CONSTANT FOLDING

Compiler puede optimizar:

```text
Money("10.00") + Money("5.00")
```

sólo si semantics y currency son conocidas.

---

## 248. CONSTANT FOLDING SAFETY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CONSTANT FOLDING SAFETY

No hacer folding cuando:

```text
runtime policy
current date
external data
```

puedan afectar el resultado.

---

## 249. DETERMINISM

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DETERMINISM

Mismo input:

```text
same types
same policy
same context
```

debe producir:

```text
same numeric result
```

---

## 250. CONTEXT

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CONTEXT

Numeric semantics no deben depender implícitamente de:

```text
machine locale
```

---

## 251. LOCALE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

LOCALE

Separar:

```text
calculation representation
```

de:

```text
display formatting
```

---

## 252. DISPLAY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DISPLAY

`1234.50` puede mostrarse:

```text
1.234,50
```

pero internamente sigue siendo:

```text
Decimal 1234.50
```

---

## 253. FORMAT VS VALUE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FORMAT VS VALUE

Formatting nunca debe modificar:

```text
numeric value
```

---

## 254. CURRENCY DISPLAY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CURRENCY DISPLAY

Currency symbol es:

```text
presentation
```

no identidad suficiente del Money.

---

## 255. INPUT PARSING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

INPUT PARSING

String financiero debe convertirse mediante:

```text
explicit parser
```

---

## 256. INVALID NUMBER

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

INVALID NUMBER

Strings ambiguos deben rechazarse.

Ejemplo:

```text
1,234
```

sin locale explícito.

---

## 257. SCALE VALIDATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SCALE VALIDATION

Policy puede requerir:

```text
maximum decimal places
```

---

## 258. MONEY CONSTRUCTION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY CONSTRUCTION

Crear Money debe validar:

```text
amount
currency
scale
```

---

## 259. CURRENCY CONVERSION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

CURRENCY CONVERSION

Debe ser explícita:

```text
convert(money, targetCurrency, rate)
```

---

## 260. FX RATE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FX RATE

FX rate debe ser:

```text
versioned
dated
auditable
```

---

## 261. FX SOURCE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FX SOURCE

Registrar:

```text
provider/source
```

cuando aplique.

---

## 262. FX ROUNDING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FX ROUNDING

Debe definirse:

```text
conversion rounding
```

---

## 263. NUMERIC POLICY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NUMERIC POLICY

Una Policy financiera puede definir:

```text
calculationScale
displayScale
roundingMode
roundingStage
```

---

## 264. POLICY VERSION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

POLICY VERSION

Debe quedar versionada.

---

## 265. HISTORICAL CALCULATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

HISTORICAL CALCULATION

Una liquidación histórica debe conservar referencia a:

```text
numeric policy version
```

---

## 266. MIGRATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MIGRATION

Cambiar rounding policy no debe alterar automáticamente:

```text
historical settlements
```

---

## 267. RECOMPUTATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RECOMPUTATION

Recalcular histórico requiere:

```text
explicit operation
```

---

## 268. RECONCILIATION TEST

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RECONCILIATION TEST

Debe verificarse:

```text
line totals
subtotal
tax
interest
discount
final total
```

---

## 269. GOLDEN NUMERIC TESTS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

GOLDEN NUMERIC TESTS

Crear fixtures para:

```text
rounding
division
large numbers
negative
zero
currency
distribution
```

---

## 270. PROPERTY TESTS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PROPERTY TESTS

Propiedades:

```text
a + 0 = a
a - a = 0
a * 1 = a
```

cuando tipos y policies permitan estas identidades.

---

## 271. MONEY PROPERTY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MONEY PROPERTY

Para misma currency:

```text
a + b = b + a
```

si no existe rounding intermedio que rompa la propiedad.

---

## 272. ROUNDING PROPERTY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

ROUNDING PROPERTY

Rounding debe ser:

```text
deterministic
```

---

## 273. DISTRIBUTION PROPERTY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DISTRIBUTION PROPERTY

Cuando corresponda:

```text
sum(distribution) = source
```

---

## 274. SERIALIZATION PROPERTY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SERIALIZATION PROPERTY

```text
deserialize(serialize(value))
=
value
```

---

## 275. HASH PROPERTY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

HASH PROPERTY

Canonical equivalent values deben producir representación estable según la política de identidad.

---

## 276. DATABASE ROUND TRIP

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

DATABASE ROUND TRIP

Probar:

```text
AEL Decimal
→ PostgreSQL numeric
→ AEL Decimal
```

sin pérdida no autorizada.

---

## 277. API ROUND TRIP

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

API ROUND TRIP

Probar:

```text
AEL Money
→ JSON
→ AEL Money
```

---

## 278. NUMERIC PERFORMANCE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NUMERIC PERFORMANCE

Benchmarks para:

```text
decimal addition
multiplication
division
large aggregation
```

---

## 279. LARGE AGGREGATION

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

LARGE AGGREGATION

Probar millones de líneas de forma controlada si el workload lo requiere.

---

## 280. MEMORY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

MEMORY

Large decimal values no deben provocar:

```text
unbounded memory growth
```

---

## 281. SECURITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

SECURITY

Numeric parser debe rechazar entradas diseñadas para:

```text
resource exhaustion
```

---

## 282. RESOURCE LIMIT

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

RESOURCE LIMIT

Definir límites para:

```text
digits
scale
exponent
```

si aplica.

---

## 283. NUMERIC VERSIONING

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NUMERIC VERSIONING

Cambiar semantics numérica requiere:

```text
runtime/language version
```

si rompe resultados.

---

## 284. COMPATIBILITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

COMPATIBILITY

Una versión nueva no debe reinterpretar silenciosamente:

```text
old numeric Artifact
```

---

## 285. AUDIT

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

AUDIT

Execution importante debe identificar:

```text
numericPolicyVersion
```

cuando aplique.

---

## 286. FINANCIAL EXPLAINABILITY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FINANCIAL EXPLAINABILITY

Explanation puede mostrar:

```text
base
rate
intermediate
rounding
result
```

sin exponer secretos.

---

## 287. NUMERIC EXIT CRITERIA

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

NUMERIC EXIT CRITERIA

```text
✓ Integer
✓ Decimal
✓ Money
✓ Currency
✓ Rate
✓ Percentage
✓ Quantity
✓ Coefficient
✓ Precision
✓ Scale
✓ Rounding
✓ Currency safety
✓ Decimal arithmetic
✓ Overflow
✓ Division by zero
✓ Aggregation
✓ Distribution
✓ Remainder
✓ Serialization
✓ PostgreSQL mapping
✓ API mapping
✓ Numeric policies
✓ Determinism
✓ Golden tests
✓ Property tests
✓ Performance tests
✓ Resource limits
✓ Versioning
✓ Auditability
```

---

## 288. FINAL NUMERIC ARCHITECTURE

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

FINAL NUMERIC ARCHITECTURE

```text
                 Financial Value
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     Decimal          Money          Quantity
        │              │              │
        │              ▼              ▼
        │           Currency          Unit
        │
        ├──────────────┐
        ▼              ▼
       Rate        Coefficient
        │
        └───────┬──────┘
                ▼
          Numeric Policy
                │
        ┌───────┼────────┐
        ▼       ▼        ▼
    Precision  Scale   Rounding
                │
                ▼
          Deterministic
            Result
```

---

## 289. PRINCIPIO DE EXACTITUD

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRINCIPIO DE EXACTITUD

```text
Money
→ Decimal
→ Explicit rounding
→ Deterministic result
```

---

## 290. PRINCIPIO DE TIPOS

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRINCIPIO DE TIPOS

```text
Money ≠ Decimal ≠ Rate ≠ Quantity ≠ Coefficient
```

aunque internamente compartan representación decimal.

---

## 291. PRINCIPIO DE CURRENCY

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRINCIPIO DE CURRENCY

```text
Money(COP)
+
Money(USD)
```

no es válido sin conversión explícita.

---

## 292. PRINCIPIO DE REDONDEO

> **Origen:** Motor de liquidacion_Financial Types & Numeric Semantics 51.md

PRINCIPIO DE REDONDEO

```text
Rounding
```

es parte de la semántica financiera, no un detalle visual.

---

## 293. OBJETIVO

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

OBJETIVO

Definir el flujo:

```text
Input
→ Validation
→ Context
→ Base
→ Concepts
→ Novelties
→ Coefficients
→ Proration
→ Discounts
→ Taxes
→ Interest
→ Adjustments
→ Rounding
→ Reconciliation
→ Explanation
→ Approval
→ Posting
→ Audit
```

---

## 294. PIPELINE PRINCIPAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PIPELINE PRINCIPAL

```text
Settlement Request
        ↓
Input Validation
        ↓
Domain Context
        ↓
Eligibility
        ↓
Charge Concepts
        ↓
Base Calculation
        ↓
Coefficient / Quantity
        ↓
Proration
        ↓
Discounts
        ↓
Taxes
        ↓
Interest
        ↓
Adjustments
        ↓
Rounding
        ↓
Reconciliation
        ↓
Calculation Result
        ↓
Explanation
        ↓
Approval
        ↓
Posting
        ↓
Audit
```

---

## 295. SETTLEMENT REQUEST

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SETTLEMENT REQUEST

Representa la solicitud de cálculo.

Conceptualmente:

```ts
interface SettlementRequest {
  tenantId: string
  unitId: string
  periodId: string
  mode: 'PREVIEW' | 'CALCULATE' | 'POST'
}
```

---

## 296. INPUT VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

INPUT VALIDATION

Antes de ejecutar AEL:

```text
validate request
validate tenant
validate unit
validate period
```

---

## 297. TENANT VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TENANT VALIDATION

El Runtime debe verificar que:

```text
tenant context
```

es confiable y autorizado.

---

## 298. UNIT VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

UNIT VALIDATION

Verificar:

```text
unit exists
unit belongs to tenant
unit is eligible
```

---

## 299. PERIOD VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PERIOD VALIDATION

Verificar:

```text
period exists
period is compatible
period status allows operation
```

---

## 300. PERIOD STATE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PERIOD STATE

Estados:

```text
OPEN
CALCULATING
CLOSED
LOCKED
```

---

## 301. EXECUTION MODE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXECUTION MODE

Tres modos conceptuales:

```text
PREVIEW
CALCULATE
POST
```

---

## 302. PREVIEW

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PREVIEW

Calcula:

```text
without persistent financial posting
```

---

## 303. CALCULATE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CALCULATE

Produce resultado formal:

```text
SettlementResult
```

sin necesariamente registrar efectos financieros definitivos.

---

## 304. POST

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POST

Calcula y registra efectos autorizados.

---

## 305. DOMAIN CONTEXT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DOMAIN CONTEXT

El Runtime construye:

```text
ExecutionContext
```

con acceso controlado a:

```text
tenant
period
unit
policies
contracts
```

---

## 306. ELIGIBILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ELIGIBILITY

Determina qué conceptos aplican.

Ejemplos:

```text
unit type
period
ownership
status
policy
```

---

## 307. CONCEPT SELECTION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CONCEPT SELECTION

El motor obtiene:

```text
applicable charge concepts
```

---

## 308. CONCEPT ORDER

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CONCEPT ORDER

El orden debe ser explícito cuando afecte:

```text
base
tax
discount
interest
```

---

## 309. BASE CALCULATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BASE CALCULATION

Cada concepto obtiene una base.

Ejemplos:

```text
fixed
coefficient
quantity
usage
balance
percentage
```

---

## 310. BASE PROVIDER

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BASE PROVIDER

Los datos externos deben obtenerse mediante:

```text
Contract / Provider
```

---

## 311. BASE VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BASE VALIDATION

Verificar:

```text
currency
sign
scale
range
```

según policy.

---

## 312. COEFFICIENT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

COEFFICIENT

Cuando aplique:

```text
base × coefficient
```

---

## 313. COEFFICIENT VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

COEFFICIENT VALIDATION

Verificar:

```text
valid range
effective period
unit applicability
```

---

## 314. QUANTITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

QUANTITY

Cuando aplique:

```text
quantity × unitPrice
```

---

## 315. QUANTITY VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

QUANTITY VALIDATION

Verificar:

```text
unit
dimension
range
```

---

## 316. PRORATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRORATION

Aplicar cuando el cargo no corresponde al período completo.

---

## 317. PRORATION INPUT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRORATION INPUT

Debe incluir:

```text
effectiveFrom
effectiveTo
periodFrom
periodTo
basis
```

---

## 318. PRORATION FACTOR

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRORATION FACTOR

Conceptualmente:

```text
eligible fraction
```

---

## 319. PRORATION ORDER

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRORATION ORDER

Debe definirse si se aplica:

```text
before coefficient
after coefficient
before tax
```

según policy.

---

## 320. DISCOUNTS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DISCOUNTS

Aplicar descuentos elegibles.

---

## 321. DISCOUNT ELIGIBILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DISCOUNT ELIGIBILITY

Puede depender de:

```text
payment status
unit
period
owner
policy
```

---

## 322. DISCOUNT BASE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DISCOUNT BASE

Debe definirse:

```text
which lines are discountable
```

---

## 323. DISCOUNT ORDER

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DISCOUNT ORDER

Debe ser parte de:

```text
financial policy
```

---

## 324. TAXES

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TAXES

Aplicar impuestos según:

```text
tax policy
```

---

## 325. TAX BASE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TAX BASE

La base tributaria debe derivarse explícitamente.

---

## 326. TAX RATE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TAX RATE

Debe ser versionado cuando corresponda.

---

## 327. TAX EXEMPTIONS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TAX EXEMPTIONS

Aplicar sólo mediante:

```text
authorized policy
```

---

## 328. INTEREST

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

INTEREST

Aplicar sobre obligaciones elegibles.

---

## 329. INTEREST ELIGIBILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

INTEREST ELIGIBILITY

Debe determinar:

```text
overdue
grace period
eligible balance
```

---

## 330. INTEREST BASE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

INTEREST BASE

Debe identificarse explícitamente.

---

## 331. INTEREST CALCULATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

INTEREST CALCULATION

Puede utilizar:

```text
simple
compound
```

si el dominio lo soporta.

---

## 332. DAY COUNT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DAY COUNT

Debe obtenerse de:

```text
interest policy
```

---

## 333. ADJUSTMENTS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ADJUSTMENTS

Aplicar:

```text
credit
debit
correction
reversal
```

según autorización.

---

## 334. ADJUSTMENT SOURCE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ADJUSTMENT SOURCE

Debe conservar referencia:

```text
source
reason
actor
```

cuando corresponda.

---

## 335. ROUNDING

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ROUNDING

Aplicar:

```text
numeric policy
```

en las etapas definidas.

---

## 336. ROUNDING TRACE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ROUNDING TRACE

Debe ser posible identificar:

```text
value before rounding
rounding mode
scale
value after rounding
```

cuando sea necesario para explicación.

---

## 337. LINE RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

LINE RESULT

Cada concepto produce:

```text
SettlementLine
```

---

## 338. SETTLEMENT LINE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SETTLEMENT LINE

Conceptualmente:

```ts
interface SettlementLine {
  lineId: string
  conceptCode: string
  description?: string
  base?: Money
  quantity?: Quantity
  rate?: Rate
  amount: Money
  source?: string
}
```

---

## 339. LINE STATUS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

LINE STATUS

Puede utilizar:

```text
CALCULATED
EXCLUDED
ADJUSTED
```

---

## 340. EXCLUSION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXCLUSION

Un concepto no aplicable debe poder explicarse:

```text
why excluded
```

---

## 341. SUBTOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SUBTOTAL

Agrupar líneas según:

```text
concept group
```

---

## 342. GROSS TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

GROSS TOTAL

Representa cargos antes de reducciones según policy.

---

## 343. DISCOUNT TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DISCOUNT TOTAL

Suma descuentos aplicables.

---

## 344. TAX TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TAX TOTAL

Suma impuestos.

---

## 345. INTEREST TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

INTEREST TOTAL

Suma intereses.

---

## 346. ADJUSTMENT TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ADJUSTMENT TOTAL

Suma créditos/débitos según sign convention.

---

## 347. NET TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

NET TOTAL

Debe calcularse mediante una fórmula de dominio explícita.

---

## 348. RESULT OBJECT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RESULT OBJECT

Conceptualmente:

```ts
interface SettlementResult {
  settlementId?: string
  tenantId: string
  unitId: string
  periodId: string
  lines: SettlementLine[]
  totals: SettlementTotals
  currency: Currency
  artifactHash: string
  policyVersion: string
}
```

---

## 349. RECONCILIATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RECONCILIATION

Validar:

```text
sum(lines)
=
subtotals
=
totals
```

según estructura.

---

## 350. RECONCILIATION RULE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RECONCILIATION RULE

No permitir:

```text
silent difference
```

---

## 351. RECONCILIATION FAILURE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RECONCILIATION FAILURE

Debe producir:

```text
structured domain error
```

---

## 352. FINANCIAL INVARIANTS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FINANCIAL INVARIANTS

Ejemplos:

```text
line currency == settlement currency
```

```text
net total == recomputed total
```

```text
distribution reconciles to source
```

---

## 353. CURRENCY INVARIANT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CURRENCY INVARIANT

Todas las líneas de una liquidación deben utilizar la misma Currency salvo soporte explícito de multi-currency.

---

## 354. MULTI-CURRENCY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

MULTI-CURRENCY

No soportar implícitamente.

Debe existir:

```text
explicit FX policy
```

---

## 355. EXPLANATION TREE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXPLANATION TREE

El resultado debe poder representarse como:

```text
Settlement
 ├── Concept
 │    ├── Base
 │    ├── Rate
 │    ├── Coefficient
 │    ├── Proration
 │    └── Rounding
 ├── Discount
 ├── Tax
 ├── Interest
 └── Adjustment
```

---

## 356. EXPLANATION NODE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXPLANATION NODE

Conceptualmente:

```ts
interface ExplanationNode {
  type: string
  label: string
  value?: string
  children?: ExplanationNode[]
}
```

---

## 357. EXPLANATION SOURCE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXPLANATION SOURCE

Cuando corresponda:

```text
rule
artifact
contract
provider
```

---

## 358. EXPLANATION SECURITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXPLANATION SECURITY

No incluir:

```text
credentials
secrets
internal tokens
```

---

## 359. CALCULATION SNAPSHOT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CALCULATION SNAPSHOT

Una ejecución importante puede conservar:

```text
input snapshot
artifact
dependencies
policies
result
```

---

## 360. SNAPSHOT ID

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SNAPSHOT ID

Identificador estable:

```text
calculationSnapshotId
```

---

## 361. SNAPSHOT IMMUTABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SNAPSHOT IMMUTABILITY

Una snapshot histórica debe ser:

```text
immutable
```

---

## 362. PREVIEW RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PREVIEW RESULT

Preview debe indicar:

```text
not posted
```

---

## 363. POSTING ELIGIBILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POSTING ELIGIBILITY

Antes de POST:

```text
result valid
period open
authorization valid
artifact active
```

---

## 364. APPROVAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

APPROVAL

Puede requerirse:

```text
approval
```

por policy.

---

## 365. APPROVAL DATA

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

APPROVAL DATA

Registrar:

```text
approver
timestamp
artifactHash
resultHash
decision
```

---

## 366. RESULT HASH

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RESULT HASH

Puede generarse un hash canónico del resultado para:

```text
integrity
audit
comparison
```

---

## 367. POSTING

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POSTING

Posting transforma:

```text
calculated result
```

en:

```text
persistent financial state
```

---

## 368. POSTING TRANSACTION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POSTING TRANSACTION

Debe ejecutarse dentro de límites transaccionales definidos.

---

## 369. POSTING IDEMPOTENCY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POSTING IDEMPOTENCY

Repetir el mismo request no debe crear:

```text
duplicate financial posting
```

---

## 370. IDEMPOTENCY KEY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

IDEMPOTENCY KEY

Puede utilizarse:

```text
tenant
unit
period
request key
```

según modelo.

---

## 371. CONCURRENCY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CONCURRENCY

Proteger contra:

```text
two simultaneous postings
```

---

## 372. OPTIMISTIC LOCK

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

OPTIMISTIC LOCK

Puede utilizarse:

```text
version
```

para detectar concurrencia.

---

## 373. PERIOD LOCK

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PERIOD LOCK

Durante posting puede existir protección de:

```text
period state
```

---

## 374. POSTING FAILURE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POSTING FAILURE

Si falla:

```text
transaction rollback
```

cuando el proceso sea transaccional.

---

## 375. PARTIAL FAILURE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PARTIAL FAILURE

No permitir estado:

```text
half posted
```

sin mecanismo explícito de recuperación.

---

## 376. POSTING EVENTS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POSTING EVENTS

Ejemplos:

```text
SettlementPosted
SettlementAdjusted
SettlementReversed
```

---

## 377. EVENT DELIVERY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EVENT DELIVERY

Debe ser:

```text
at least once
```

si el sistema utiliza cola, con consumers idempotentes.

---

## 378. CALCULATION VS POSTING

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CALCULATION VS POSTING

Separación estricta:

```text
calculate()
```

no implica:

```text
post()
```

---

## 379. PREVIEW VS POST

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PREVIEW VS POST

Preview y Post deben utilizar:

```text
same calculation semantics
```

cuando el contexto sea equivalente.

---

## 380. POST REVALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POST REVALIDATION

No confiar ciegamente en un resultado calculado mucho tiempo atrás.

Antes de posting puede requerirse:

```text
revalidation
```

---

## 381. STALE RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

STALE RESULT

Un resultado puede considerarse stale si cambió:

```text
period state
artifact
policy
inputs
dependencies
```

según policy.

---

## 382. RESULT VERSION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RESULT VERSION

Resultado puede identificar:

```text
calculationVersion
```

---

## 383. RECOMPUTATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RECOMPUTATION

Si resultado stale:

```text
recalculate
```

antes de posting.

---

## 384. MASS LIQUIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

MASS LIQUIDATION

Para múltiples units:

```text
batch settlement
```

---

## 385. BATCH PIPELINE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH PIPELINE

```text
Batch Request
 ↓
Load Units
 ↓
Validate
 ↓
Queue
 ↓
Calculate
 ↓
Reconcile
 ↓
Review
 ↓
Post
```

---

## 386. BATCH ISOLATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH ISOLATION

Un fallo de una unit no debe corromper silenciosamente las demás.

---

## 387. BATCH RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH RESULT

Debe registrar:

```text
success count
failure count
skipped count
```

---

## 388. BATCH RETRY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH RETRY

Retry sólo executions fallidas y elegibles.

---

## 389. BATCH IDEMPOTENCY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH IDEMPOTENCY

No duplicar postings exitosos al repetir batch.

---

## 390. BATCH CONCURRENCY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH CONCURRENCY

Controlar:

```text
worker concurrency
database capacity
provider limits
```

---

## 391. BATCH RECONCILIATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH RECONCILIATION

Al finalizar:

```text
expected units
processed units
posted units
```

deben reconciliar.

---

## 392. BATCH FAILURE POLICY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

BATCH FAILURE POLICY

Definir si:

```text
FAIL_FAST
CONTINUE
PARTIAL_SUCCESS
```

---

## 393. RECOMMENDATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RECOMMENDATION

Para liquidaciones masivas:

```text
CONTINUE
+
explicit failed-items report
```

cuando el negocio lo permita.

---

## 394. EXCEPTION HANDLING

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXCEPTION HANDLING

Errores deben clasificarse:

```text
INPUT
DOMAIN
POLICY
AUTHORIZATION
PROVIDER
DATABASE
RUNTIME
SYSTEM
```

---

## 395. RETRYABLE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RETRYABLE

Sólo errores transitorios:

```text
provider timeout
temporary network
transient DB failure
```

---

## 396. NON-RETRYABLE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

NON-RETRYABLE

Ejemplos:

```text
invalid input
unknown concept
currency mismatch
authorization denied
```

---

## 397. ERROR EXPLANATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ERROR EXPLANATION

Debe identificar:

```text
phase
code
message
correlationId
```

---

## 398. SECURITY ERRORS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SECURITY ERRORS

No revelar:

```text
internal implementation details
```

al usuario final.

---

## 399. AUDIT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

AUDIT

Registrar eventos críticos:

```text
calculation
approval
posting
adjustment
reversal
```

según policy.

---

## 400. ARTIFACT TRACEABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ARTIFACT TRACEABILITY

Resultado debe conservar:

```text
artifactHash
```

---

## 401. POLICY TRACEABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POLICY TRACEABILITY

Resultado debe conservar:

```text
policyVersion
```

---

## 402. DEPENDENCY TRACEABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DEPENDENCY TRACEABILITY

Debe ser posible identificar:

```text
dependency snapshot
```

---

## 403. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

REPRODUCIBILITY

Una liquidación histórica debe poder reconstruirse:

```text
input snapshot
+
artifact
+
dependencies
+
policies
```

---

## 404. CALCULATION DIFF

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CALCULATION DIFF

Puede compararse:

```text
old result
new result
```

para cambios de Rule.

---

## 405. DUAL RUN

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DUAL RUN

Antes de activar una Rule crítica:

```text
old Artifact
+
new Artifact
```

pueden calcular simultáneamente.

---

## 406. SIDE-EFFECT SAFETY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SIDE-EFFECT SAFETY

Durante dual run:

```text
new calculation
```

no debe postear.

---

## 407. RESULT COMPARISON

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RESULT COMPARISON

Comparar:

```text
line amounts
tax
interest
discount
total
```

---

## 408. DIFFERENCE REPORT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

DIFFERENCE REPORT

Debe identificar:

```text
line
old value
new value
difference
reason
```

cuando sea posible.

---

## 409. ACCEPTANCE POLICY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ACCEPTANCE POLICY

La diferencia puede ser:

```text
zero
allowed
requires approval
```

según negocio.

---

## 410. FINANCIAL SAFETY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FINANCIAL SAFETY

Para Rules de liquidación crítica:

```text
unexpected difference
→ no automatic activation
```

---

## 411. FINALIZATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FINALIZATION

Una liquidación puede pasar por:

```text
CALCULATED
REVIEWED
APPROVED
POSTED
REVERSED
```

---

## 412. IMMUTABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

IMMUTABILITY

Después de:

```text
POSTED
```

no modificar destructivamente el resultado histórico.

---

## 413. REVERSAL

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

REVERSAL

Para corregir:

```text
POSTED
```

utilizar:

```text
REVERSAL
```

cuando aplique.

---

## 414. ADJUSTMENT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

ADJUSTMENT

Correcciones posteriores pueden utilizar:

```text
ADJUSTMENT
```

---

## 415. CORRECTION TRACE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CORRECTION TRACE

Debe relacionarse:

```text
original
→ correction
```

---

## 416. SETTLEMENT HISTORY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SETTLEMENT HISTORY

Debe poder reconstruirse:

```text
original calculation
+
adjustments
+
reversals
```

---

## 417. FINANCIAL LEDGER PRINCIPLE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FINANCIAL LEDGER PRINCIPLE

Si el modelo utiliza ledger:

```text
append-only financial events
```

son preferibles a sobrescritura histórica.

---

## 418. RESULT INTEGRITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

RESULT INTEGRITY

Puede calcularse:

```text
resultHash
```

sobre representación canónica.

---

## 419. CANONICAL RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CANONICAL RESULT

Debe tener orden determinista de:

```text
lines
fields
metadata
```

cuando forme parte del hash.

---

## 420. TIME

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TIME

Toda ejecución debe utilizar:

```text
trusted clock
```

---

## 421. TIMEZONE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TIMEZONE

Context debe identificar:

```text
business timezone
```

cuando date-sensitive.

---

## 422. CUTOFF

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

CUTOFF

Period cutoff debe ser explícito.

---

## 423. EFFECTIVE DATE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EFFECTIVE DATE

Rules y policies deben respetar:

```text
effectiveFrom
effectiveTo
```

---

## 424. FUTURE RULE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FUTURE RULE

Una Rule futura no debe aplicarse antes de:

```text
effectiveFrom
```

---

## 425. EXPIRED RULE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

EXPIRED RULE

Una Rule vencida no debe utilizarse si policy impide su uso.

---

## 426. POLICY CONFLICT

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

POLICY CONFLICT

Si existen dos policies aplicables:

```text
deterministic precedence
```

debe resolver el conflicto.

---

## 427. NO AMBIGUITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

NO AMBIGUITY

Una liquidación no debe depender de:

```text
implicit precedence
```

---

## 428. PIPELINE CONFIGURATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PIPELINE CONFIGURATION

El orden del pipeline puede ser:

```text
configured by domain policy
```

pero debe quedar:

```text
versioned
audited
```

---

## 429. PIPELINE VERSION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PIPELINE VERSION

Identificar:

```text
pipelineVersion
```

cuando cambie la semántica.

---

## 430. PIPELINE TESTING

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PIPELINE TESTING

Cada stage debe tener:

```text
unit tests
integration tests
golden tests
```

---

## 431. END-TO-END TEST

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

END-TO-END TEST

Debe validar:

```text
input
→ calculation
→ reconciliation
→ posting
→ audit
```

---

## 432. GOLDEN SETTLEMENTS

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

GOLDEN SETTLEMENTS

Conservar casos conocidos:

```text
expected result
```

---

## 433. REGRESSION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

REGRESSION

Cada nueva versión debe comparar:

```text
golden settlements
```

---

## 434. PROPERTY TESTING

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PROPERTY TESTING

Validar invariants:

```text
sum lines = total
distribution reconciles
same input = same output
```

---

## 435. PERFORMANCE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PERFORMANCE

Medir:

```text
single settlement
batch settlement
```

---

## 436. OBSERVABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

OBSERVABILITY

Cada execution debe poder correlacionarse con:

```text
executionId
artifactHash
requestId
```

---

## 437. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

TENANT ISOLATION

No permitir:

```text
cross-tenant settlement
```

---

## 438. SECURITY

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

SECURITY

No permitir que una Rule:

```text
bypass authorization
```

para acceder a datos.

---

## 439. FINANCIAL ENGINE EXIT CRITERIA

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FINANCIAL ENGINE EXIT CRITERIA

```text
✓ Settlement Request
✓ Input validation
✓ Domain context
✓ Eligibility
✓ Concepts
✓ Base calculation
✓ Coefficients
✓ Quantity
✓ Proration
✓ Discounts
✓ Taxes
✓ Interest
✓ Adjustments
✓ Rounding
✓ Line results
✓ Subtotals
✓ Reconciliation
✓ Explanation
✓ Calculation snapshot
✓ Preview
✓ Approval
✓ Posting
✓ Idempotency
✓ Concurrency control
✓ Batch processing
✓ Retry policy
✓ Audit
✓ Artifact traceability
✓ Policy traceability
✓ Reproducibility
✓ Dual run
✓ Result comparison
✓ Historical immutability
✓ Reversal
✓ Effective dates
✓ Pipeline versioning
✓ End-to-end testing
```

---

## 440. FINAL SETTLEMENT PIPELINE

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

FINAL SETTLEMENT PIPELINE

```text
                   SETTLEMENT REQUEST
                           │
                           ▼
                    INPUT VALIDATION
                           │
                           ▼
                    DOMAIN CONTEXT
                           │
                           ▼
                       ELIGIBILITY
                           │
                           ▼
                    CHARGE CONCEPTS
                           │
                           ▼
                     BASE CALCULATION
                           │
                  ┌────────┼────────┐
                  ▼        ▼        ▼
             Coefficient Quantity  Usage
                  │        │        │
                  └────────┼────────┘
                           ▼
                       PRORATION
                           │
                           ▼
                       DISCOUNTS
                           │
                           ▼
                         TAXES
                           │
                           ▼
                       INTEREST
                           │
                           ▼
                      ADJUSTMENTS
                           │
                           ▼
                       ROUNDING
                           │
                           ▼
                    RECONCILIATION
                           │
                           ▼
                    CALCULATION RESULT
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
              EXPLANATION        SNAPSHOT
                  │
                  ▼
                REVIEW
                  │
                  ▼
               APPROVAL
                  │
                  ▼
                POSTING
                  │
                  ▼
                 AUDIT
```

---

## 441. PRINCIPIO DE SEPARACIÓN

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRINCIPIO DE SEPARACIÓN

```text
Calculate
≠
Approve
≠
Post
```

---

## 442. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRINCIPIO DE TRAZABILIDAD

Toda liquidación importante debe poder responder:

```text
¿Qué se calculó?
¿Con qué datos?
¿Con qué Rule?
¿Con qué Artifact?
¿Con qué Policies?
¿Por qué produjo ese resultado?
¿Quién la aprobó?
¿Quién la registró?
```

---

## 443. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRINCIPIO DE SEGURIDAD

```text
No implicit posting
No implicit currency conversion
No silent rounding
No silent reconciliation difference
No destructive historical update
```

---

## 444. PRINCIPIO DE IDEMPOTENCIA

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRINCIPIO DE IDEMPOTENCIA

```text
Same request
+
Same valid state
=
No duplicate posting
```

---

## 445. PRINCIPIO DE REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_Financial Calculation Engine & Settlement Pipeline 52.md

PRINCIPIO DE REPRODUCIBILIDAD

```text
Input Snapshot
+
Artifact
+
Dependencies
+
Policies
+
Pipeline Version
=
Reproducible Calculation
```

---

## 446. OBJETIVO

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

OBJETIVO

Definir:

```text
Golden Cases
Reference Inputs
Expected Results
Financial Invariants
Boundary Cases
Regression Cases
Negative Cases
Concurrency Cases
```

---

## 447. GOLDEN CASE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN CASE

Un Golden Case contiene:

```text
Case ID
Description
Input
Context
Rule
Policy
Expected Lines
Expected Totals
Expected Diagnostics
```

---

## 448. GOLDEN CASE ID

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN CASE ID

Formato recomendado:

```text
SET-XXX
```

Ejemplo:

```text
SET-001
```

---

## 449. CASE IMMUTABILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE IMMUTABILITY

Una vez aprobado un Golden Case:

```text
expected result
```

no debe cambiar sin:

```text
explicit review
```

---

## 450. CASE VERSION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE VERSION

Puede utilizar:

```text
caseVersion
```

cuando evolucione el escenario.

---

## 451. BASELINE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

BASELINE

Cada release debe ejecutar:

```text
all mandatory Golden Cases
```

---

## 452. CASE CATEGORIES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE CATEGORIES

```text
BASIC
COEFFICIENT
QUANTITY
PRORATION
DISCOUNT
TAX
INTEREST
NOVELTY
BALANCE
PAYMENT
ADJUSTMENT
ROUNDING
CONCURRENCY
SECURITY
BOUNDARY
ERROR
REGRESSION
```

---

## 453. SET-001 — BASIC FIXED CHARGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-001 — BASIC FIXED CHARGE

Input:

```text
monthly administration = 500000 COP
```

Expected:

```text
gross = 500000 COP
net = 500000 COP
```

---

## 454. SET-002 — COEFFICIENT CHARGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-002 — COEFFICIENT CHARGE

Input:

```text
base = 100000000 COP
coefficient = 0.0125
```

Expected:

```text
charge = 1250000 COP
```

---

## 455. SET-003 — QUANTITY × PRICE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-003 — QUANTITY × PRICE

Input:

```text
quantity = 12
unitPrice = 25000 COP
```

Expected:

```text
amount = 300000 COP
```

---

## 456. SET-004 — PERCENTAGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-004 — PERCENTAGE

Input:

```text
base = 1000000 COP
rate = 0.05
```

Expected:

```text
amount = 50000 COP
```

---

## 457. SET-005 — DISCOUNT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-005 — DISCOUNT

Input:

```text
base = 500000 COP
discount = 0.10
```

Expected:

```text
discount = 50000 COP
net before other policies = 450000 COP
```

---

## 458. SET-006 — TAX

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-006 — TAX

Input:

```text
taxable base = 1000000 COP
tax rate = 0.19
```

Expected:

```text
tax = 190000 COP
```

---

## 459. SET-007 — DISCOUNT + TAX

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-007 — DISCOUNT + TAX

Input:

```text
base = 1000000
discount = 10%
tax = 19%
```

Expected result depends on policy:

```text
tax base = base - discount
```

If so:

```text
tax = 171000
net = 1071000
```

The case must explicitly declare:

```text
taxBasePolicy
```

---

## 460. SET-008 — SIMPLE INTEREST

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-008 — SIMPLE INTEREST

Input:

```text
principal = 1000000 COP
annualRate = 12%
time = 30/365
```

Expected before rounding:

```text
9863.013698...
```

Expected final value depends on:

```text
rounding policy
```

---

## 461. SET-009 — GRACE PERIOD

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-009 — GRACE PERIOD

Input:

```text
dueDate = D
currentDate = D + 5
graceDays = 5
```

Expected:

```text
interest = 0
```

---

## 462. SET-010 — OVERDUE INTEREST

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-010 — OVERDUE INTEREST

Input:

```text
dueDate = D
currentDate = D + 6
graceDays = 5
```

Expected:

```text
interest applicable
```

---

## 463. SET-011 — PRORATION BY DAYS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-011 — PRORATION BY DAYS

Input:

```text
monthlyCharge = 300000
eligibleDays = 15
periodDays = 30
```

Expected:

```text
150000
```

---

## 464. SET-012 — PRORATION WITH COEFFICIENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-012 — PRORATION WITH COEFFICIENT

Input:

```text
base = 100000000
coefficient = 0.01
days = 15
periodDays = 30
```

Expected:

```text
500000
```

---

## 465. SET-013 — MID-PERIOD UNIT CHANGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-013 — MID-PERIOD UNIT CHANGE

Scenario:

```text
old unit state
→ new unit state
```

Expected:

```text
split calculation
```

according to effective dates.

---

## 466. SET-014 — NOVELTY CHARGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-014 — NOVELTY CHARGE

Input:

```text
novelty = +100000 COP
```

Expected:

```text
net increases by 100000
```

---

## 467. SET-015 — NOVELTY CREDIT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-015 — NOVELTY CREDIT

Input:

```text
novelty = -50000 COP
```

Expected:

```text
net decreases by 50000
```

---

## 468. SET-016 — MULTIPLE CONCEPTS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-016 — MULTIPLE CONCEPTS

Input:

```text
administration = 500000
parking = 100000
storage = 50000
```

Expected:

```text
gross = 650000
```

---

## 469. SET-017 — MULTIPLE LINES RECONCILIATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-017 — MULTIPLE LINES RECONCILIATION

Validate:

```text
sum(lines)
=
subtotal
```

---

## 470. SET-018 — ROUNDING HALF UP

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-018 — ROUNDING HALF UP

Input:

```text
1.235
```

Scale:

```text
2
```

Expected:

```text
1.24
```

---

## 471. SET-019 — ROUNDING HALF EVEN

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-019 — ROUNDING HALF EVEN

Input:

```text
1.245
```

Scale:

```text
2
```

Expected:

```text
1.24
```

---

## 472. SET-020 — NEGATIVE ROUNDING

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-020 — NEGATIVE ROUNDING

Input:

```text
-1.235
```

Expected must follow:

```text
explicit rounding policy
```

---

## 473. SET-021 — DIVISION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-021 — DIVISION

Input:

```text
100 / 3
```

Expected:

```text
33.333...
```

followed by:

```text
configured precision
```

---

## 474. SET-022 — DIVISION BY ZERO

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-022 — DIVISION BY ZERO

Input:

```text
100 / 0
```

Expected:

```text
structured error
```

---

## 475. SET-023 — ZERO VALUE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-023 — ZERO VALUE

Input:

```text
base = 0
```

Expected:

```text
zero result
```

---

## 476. SET-024 — NEGATIVE INPUT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-024 — NEGATIVE INPUT

Input:

```text
negative charge
```

Expected:

```text
accepted or rejected
```

according to domain policy.

---

## 477. SET-025 — CURRENCY MISMATCH

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-025 — CURRENCY MISMATCH

Input:

```text
100 COP + 10 USD
```

Expected:

```text
CURRENCY_MISMATCH
```

---

## 478. SET-026 — CURRENCY CONVERSION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-026 — CURRENCY CONVERSION

Input:

```text
100 USD
FX rate = configured
target = COP
```

Expected:

```text
converted value
```

using explicit:

```text
FX policy
```

---

## 479. SET-027 — COEFFICIENT DISTRIBUTION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-027 — COEFFICIENT DISTRIBUTION

Input:

```text
total = 100000
coefficients:
A = 0.3333
B = 0.3333
C = 0.3334
```

Expected:

```text
A + B + C = 100000
```

---

## 480. SET-028 — REMAINDER ALLOCATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-028 — REMAINDER ALLOCATION

Input:

```text
100 / 3
```

Expected allocation:

```text
33.33
33.33
33.34
```

The recipient of the remainder must follow:

```text
stable business ordering
```

---

## 481. SET-029 — REMAINDER DETERMINISM

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-029 — REMAINDER DETERMINISM

Repeat same input many times.

Expected:

```text
same unit receives remainder
```

---

## 482. SET-030 — FULL SETTLEMENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-030 — FULL SETTLEMENT

Input:

```text
administration
parking
discount
tax
interest
novelty
```

Expected:

```text
all pipeline stages
```

are represented and reconciled.

---

## 483. SET-031 — CLOSED PERIOD

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-031 — CLOSED PERIOD

Attempt calculation/posting on:

```text
CLOSED
```

Expected:

```text
DENIED
```

according to operation policy.

---

## 484. SET-032 — LOCKED PERIOD

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-032 — LOCKED PERIOD

Expected:

```text
POST denied
```

---

## 485. SET-033 — UNAUTHORIZED POSTING

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-033 — UNAUTHORIZED POSTING

User without:

```text
POST_SETTLEMENT
```

Expected:

```text
AUTHORIZATION_DENIED
```

---

## 486. SET-034 — APPROVAL REQUIRED

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-034 — APPROVAL REQUIRED

Result above configured threshold.

Expected:

```text
PENDING_APPROVAL
```

---

## 487. SET-035 — APPROVED POSTING

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-035 — APPROVED POSTING

Expected:

```text
CALCULATED
→ APPROVED
→ POSTED
```

---

## 488. SET-036 — REJECTED APPROVAL

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-036 — REJECTED APPROVAL

Expected:

```text
REJECTED
```

and:

```text
not posted
```

---

## 489. SET-037 — IDEMPOTENT POST

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-037 — IDEMPOTENT POST

Repeat same:

```text
idempotencyKey
```

Expected:

```text
single posting
```

---

## 490. SET-038 — CONCURRENT POST

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-038 — CONCURRENT POST

Two simultaneous requests.

Expected:

```text
one successful posting
```

and:

```text
second request safely rejected or recognized as duplicate
```

---

## 491. SET-039 — STALE RESULT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-039 — STALE RESULT

Calculate result.

Change:

```text
policy
```

before posting.

Expected:

```text
STALE_RESULT
```

or mandatory recalculation.

---

## 492. SET-040 — ARTIFACT REVOCATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-040 — ARTIFACT REVOCATION

Calculate using Artifact A.

Revoke Artifact A.

Attempt posting.

Expected:

```text
POST denied
```

according to policy.

---

## 493. SET-041 — DEPENDENCY CHANGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-041 — DEPENDENCY CHANGE

Dependency snapshot changes.

Expected:

```text
result invalidated
```

when policy requires it.

---

## 494. SET-042 — CROSS-TENANT UNIT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-042 — CROSS-TENANT UNIT

Tenant A attempts:

```text
unit belonging to Tenant B
```

Expected:

```text
DENIED
```

---

## 495. SET-043 — CROSS-TENANT NOVELTY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-043 — CROSS-TENANT NOVELTY

Expected:

```text
DENIED
```

---

## 496. SET-044 — CROSS-TENANT BALANCE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-044 — CROSS-TENANT BALANCE

Expected:

```text
DENIED
```

---

## 497. SET-045 — UNKNOWN CONCEPT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-045 — UNKNOWN CONCEPT

Rule references:

```text
UNKNOWN_CONCEPT
```

Expected:

```text
DOMAIN_VALIDATION_ERROR
```

---

## 498. SET-046 — INVALID COEFFICIENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-046 — INVALID COEFFICIENT

Coefficient outside allowed range.

Expected:

```text
VALIDATION_ERROR
```

---

## 499. SET-047 — INVALID RATE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-047 — INVALID RATE

Rate outside policy.

Expected:

```text
VALIDATION_ERROR
```

---

## 500. SET-048 — INVALID CURRENCY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-048 — INVALID CURRENCY

Unknown currency code.

Expected:

```text
CURRENCY_ERROR
```

---

## 501. SET-049 — INVALID PERIOD

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-049 — INVALID PERIOD

Period does not exist.

Expected:

```text
PERIOD_NOT_FOUND
```

---

## 502. SET-050 — INVALID UNIT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-050 — INVALID UNIT

Unit does not exist.

Expected:

```text
UNIT_NOT_FOUND
```

---

## 503. SET-051 — LARGE VALUE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-051 — LARGE VALUE

Use very large valid Decimal.

Expected:

```text
correct result
```

without overflow.

---

## 504. SET-052 — NUMERIC OVERFLOW

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-052 — NUMERIC OVERFLOW

Value exceeds configured numeric limits.

Expected:

```text
NUMERIC_OVERFLOW
```

---

## 505. SET-053 — MAX SCALE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-053 — MAX SCALE

Value at maximum supported scale.

Expected:

```text
accepted
```

if valid.

---

## 506. SET-054 — EXCESS SCALE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-054 — EXCESS SCALE

Value exceeds maximum allowed scale.

Expected:

```text
PRECISION_ERROR
```

or explicit normalization policy.

---

## 507. SET-055 — NEGATIVE ZERO

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-055 — NEGATIVE ZERO

Input:

```text
-0
```

Expected canonical representation:

```text
0
```

---

## 508. SET-056 — EQUALITY SCALE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-056 — EQUALITY SCALE

Compare:

```text
1.0
1.00
```

Expected:

```text
equal
```

---

## 509. SET-057 — FLOATING-POINT TRAP

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-057 — FLOATING-POINT TRAP

Input designed to expose binary floating-point error.

Expected:

```text
exact decimal semantics
```

---

## 510. SET-058 — ROUNDING AFTER AGGREGATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-058 — ROUNDING AFTER AGGREGATION

Compare:

```text
sum
→ round
```

against:

```text
round each
→ sum
```

Expected result determined by:

```text
rounding policy
```

---

## 511. SET-059 — TAX AFTER DISCOUNT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-059 — TAX AFTER DISCOUNT

Verify policy-defined ordering.

---

## 512. SET-060 — DISCOUNT AFTER TAX

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-060 — DISCOUNT AFTER TAX

Verify alternate policy if supported.

---

## 513. SET-061 — INTEREST AFTER DISCOUNT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-061 — INTEREST AFTER DISCOUNT

Verify:

```text
interest base
```

---

## 514. SET-062 — INTEREST BEFORE DISCOUNT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-062 — INTEREST BEFORE DISCOUNT

Verify alternate policy.

---

## 515. SET-063 — PAYMENT ALLOCATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-063 — PAYMENT ALLOCATION

Payment applied according to:

```text
allocation policy
```

---

## 516. SET-064 — PAYMENT EXCEEDS BALANCE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-064 — PAYMENT EXCEEDS BALANCE

Expected:

```text
credit balance
```

or rejection according to policy.

---

## 517. SET-065 — PARTIAL PAYMENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-065 — PARTIAL PAYMENT

Expected:

```text
remaining balance
```

---

## 518. SET-066 — FULL PAYMENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-066 — FULL PAYMENT

Expected:

```text
balance = 0
```

---

## 519. SET-067 — PAYMENT DUPLICATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-067 — PAYMENT DUPLICATION

Same payment identifier twice.

Expected:

```text
single financial effect
```

---

## 520. SET-068 — REVERSAL

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-068 — REVERSAL

Reverse posted settlement.

Expected:

```text
original preserved
reversal linked
net state reconciles
```

---

## 521. SET-069 — ADJUSTMENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-069 — ADJUSTMENT

Create controlled adjustment.

Expected:

```text
original unchanged
adjustment recorded
new balance reconciles
```

---

## 522. SET-070 — HISTORICAL IMMUTABILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-070 — HISTORICAL IMMUTABILITY

Attempt destructive update.

Expected:

```text
DENIED
```

---

## 523. SET-071 — EXPLANATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-071 — EXPLANATION

Expected explanation contains:

```text
base
rate
calculation
rounding
result
```

---

## 524. SET-072 — ARTIFACT TRACEABILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-072 — ARTIFACT TRACEABILITY

Expected:

```text
artifactHash
```

present.

---

## 525. SET-073 — POLICY TRACEABILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-073 — POLICY TRACEABILITY

Expected:

```text
policyVersion
```

present.

---

## 526. SET-074 — REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-074 — REPRODUCIBILITY

Repeat historical calculation using snapshot.

Expected:

```text
same result
```

---

## 527. SET-075 — DUAL RUN EQUALITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-075 — DUAL RUN EQUALITY

Old/new Artifact.

Expected:

```text
same result
```

for compatible change.

---

## 528. SET-076 — DUAL RUN DIFFERENCE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-076 — DUAL RUN DIFFERENCE

Expected:

```text
difference report
```

and:

```text
no automatic activation
```

for critical Rule.

---

## 529. SET-077 — PREVIEW VS CALCULATE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-077 — PREVIEW VS CALCULATE

Equivalent context.

Expected:

```text
same calculation result
```

---

## 530. SET-078 — CALCULATE VS POST

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-078 — CALCULATE VS POST

Before posting:

```text
calculation result
```

must match posting result unless revalidation detects a stale state.

---

## 531. SET-079 — POST FAILURE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-079 — POST FAILURE

Simulate database failure.

Expected:

```text
no partial financial posting
```

when transaction boundary requires atomicity.

---

## 532. SET-080 — PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-080 — PROVIDER TIMEOUT

Expected:

```text
structured provider error
```

and retry only if transient.

---

## 533. SET-081 — PROVIDER RETRY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-081 — PROVIDER RETRY

Transient failure followed by success.

Expected:

```text
single final financial effect
```

---

## 534. SET-082 — PROVIDER DUPLICATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-082 — PROVIDER DUPLICATION

Repeated external response.

Expected:

```text
idempotent handling
```

where applicable.

---

## 535. SET-083 — DATABASE DEADLOCK

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-083 — DATABASE DEADLOCK

Simulated transient deadlock.

Expected:

```text
controlled retry
```

when safe.

---

## 536. SET-084 — DATABASE TIMEOUT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-084 — DATABASE TIMEOUT

Expected:

```text
controlled failure
```

and:

```text
no partial result
```

where atomicity applies.

---

## 537. SET-085 — BATCH SUCCESS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-085 — BATCH SUCCESS

Process:

```text
100 units
```

Expected:

```text
100 successful
```

---

## 538. SET-086 — BATCH PARTIAL FAILURE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-086 — BATCH PARTIAL FAILURE

Example:

```text
97 success
3 failure
```

Expected:

```text
97 posted
3 explicit failures
```

if policy is:

```text
PARTIAL_SUCCESS
```

---

## 539. SET-087 — BATCH RETRY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-087 — BATCH RETRY

Retry failed items.

Expected:

```text
previous successful items not duplicated
```

---

## 540. SET-088 — BATCH RECONCILIATION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-088 — BATCH RECONCILIATION

Expected:

```text
requested = processed + skipped + failed
```

---

## 541. SET-089 — LOAD TEST

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-089 — LOAD TEST

Execute many independent settlements concurrently.

Expected:

```text
no cross-tenant leakage
no duplicate posting
correct results
```

---

## 542. SET-090 — NOISY TENANT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-090 — NOISY TENANT

Tenant A submits excessive workload.

Expected:

```text
quota/rate limiting
```

without starving other tenants.

---

## 543. SET-091 — SECURITY LOGGING

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-091 — SECURITY LOGGING

Authorization denial occurs.

Expected:

```text
audit event
```

without sensitive credentials.

---

## 544. SET-092 — SECRET REDACTION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-092 — SECRET REDACTION

Input contains fake:

```text
token
password
API key
```

Expected:

```text
not present in logs
```

---

## 545. SET-093 — AUDIT IMMUTABILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-093 — AUDIT IMMUTABILITY

Attempt audit update.

Expected:

```text
DENIED
```

---

## 546. SET-094 — RESULT HASH

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-094 — RESULT HASH

Same canonical result.

Expected:

```text
same hash
```

---

## 547. SET-095 — RESULT HASH DIFFERENCE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-095 — RESULT HASH DIFFERENCE

Change one monetary line.

Expected:

```text
different hash
```

---

## 548. SET-096 — EFFECTIVE DATE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-096 — EFFECTIVE DATE

Rule starts:

```text
2026-02-01
```

Calculation:

```text
2026-01
```

Expected:

```text
old applicable rule
```

according to policy.

---

## 549. SET-097 — EXPIRED POLICY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-097 — EXPIRED POLICY

Policy ends before calculation.

Expected:

```text
policy not applicable
```

---

## 550. SET-098 — POLICY CONFLICT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-098 — POLICY CONFLICT

Two applicable policies.

Expected:

```text
deterministic precedence
```

---

## 551. SET-099 — CLOSED PERIOD ADJUSTMENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-099 — CLOSED PERIOD ADJUSTMENT

Attempt ordinary adjustment against closed period.

Expected:

```text
DENIED
```

unless explicit correction workflow exists.

---

## 552. SET-100 — COMPLETE GOLDEN SETTLEMENT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SET-100 — COMPLETE GOLDEN SETTLEMENT

Scenario combines:

```text
coefficient
fixed charge
quantity
proration
discount
tax
interest
novelty
rounding
adjustment
```

Expected:

```text
all stages reconcile
```

---

## 553. GOLDEN CASE FORMAT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN CASE FORMAT

Recommended machine-readable representation:

```json
{
  "caseId": "SET-001",
  "description": "Basic fixed charge",
  "input": {},
  "context": {},
  "expected": {
    "lines": [],
    "totals": {}
  }
}
```

---

## 554. CASE STORAGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE STORAGE

Golden cases should live outside production runtime state.

Recommended:

```text
tests/golden/settlements/
```

---

## 555. CASE NAMING

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE NAMING

Example:

```text
SET-001-basic-fixed-charge.json
SET-002-coefficient.json
SET-003-quantity-price.json
```

---

## 556. CASE GROUPING

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE GROUPING

Directory structure:

```text
golden/
 ├── basic/
 ├── financial/
 ├── rounding/
 ├── interest/
 ├── payment/
 ├── concurrency/
 ├── security/
 └── regression/
```

---

## 557. GOLDEN RUNNER

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN RUNNER

Debe existir un runner capaz de:

```text
load case
execute
compare
report
```

---

## 558. COMPARISON

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

COMPARISON

Comparar:

```text
status
lines
amounts
currency
totals
diagnostics
```

---

## 559. MONEY COMPARISON

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

MONEY COMPARISON

Comparar valores como:

```text
Decimal
```

no como:

```text
float
```

---

## 560. EXPLANATION COMPARISON

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

EXPLANATION COMPARISON

Puede requerir comparación:

```text
semantic
```

en lugar de exactitud textual.

---

## 561. DIAGNOSTIC COMPARISON

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

DIAGNOSTIC COMPARISON

Comparar:

```text
errorCode
phase
severity
```

---

## 562. GOLDEN FAILURE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN FAILURE

Un Golden Case fallido debe bloquear:

```text
release
```

cuando sea obligatorio.

---

## 563. APPROVED EXCEPTION

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

APPROVED EXCEPTION

Una excepción a Golden Case requiere:

```text
review
reason
new expected result
approval
```

---

## 564. REGRESSION BASELINE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

REGRESSION BASELINE

Cada release debe guardar:

```text
runtime version
compiler version
case suite version
```

---

## 565. PERFORMANCE GOLDENS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

PERFORMANCE GOLDENS

Algunos casos pueden tener:

```text
performance baseline
```

sin convertirla en exactitud funcional.

---

## 566. PROPERTY CASES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

PROPERTY CASES

Además de ejemplos concretos:

```text
property-based generation
```

puede probar invariants.

---

## 567. FUZZ CASES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

FUZZ CASES

Inputs aleatorios controlados pueden descubrir:

```text
edge cases
```

---

## 568. FUZZ SAFETY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

FUZZ SAFETY

Fuzzing debe respetar:

```text
resource limits
```

---

## 569. BOUNDARY MATRIX

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

BOUNDARY MATRIX

Probar:

```text
zero
one
minimum
maximum
negative
fraction
large
empty
missing
```

según tipo.

---

## 570. DATE BOUNDARIES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

DATE BOUNDARIES

Probar:

```text
month start
month end
year end
leap year
```

---

## 571. PRORATION BOUNDARIES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

PRORATION BOUNDARIES

Probar:

```text
1 day
full period
period boundary
```

---

## 572. INTEREST BOUNDARIES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

INTEREST BOUNDARIES

Probar:

```text
due date
grace end
first overdue day
```

---

## 573. ROUNDING BOUNDARIES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

ROUNDING BOUNDARIES

Probar valores alrededor de:

```text
x.x5
```

---

## 574. CURRENCY BOUNDARIES

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CURRENCY BOUNDARIES

Probar:

```text
same currency
different currency
unsupported currency
```

---

## 575. CONCURRENCY MATRIX

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CONCURRENCY MATRIX

Probar:

```text
1 request
2 simultaneous
N simultaneous
retry after success
retry after failure
```

---

## 576. SECURITY MATRIX

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SECURITY MATRIX

Probar:

```text
authorized
unauthorized
wrong tenant
expired role
revoked artifact
```

---

## 577. GOLDEN CASE GOVERNANCE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN CASE GOVERNANCE

Cada case crítico debe tener:

```text
owner
description
source
approval
```

---

## 578. SOURCE OF EXPECTED RESULT

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

SOURCE OF EXPECTED RESULT

Expected result debe derivarse de:

```text
approved business specification
```

no de:

```text
current implementation
```

---

## 579. AVOID SELF-VALIDATING TESTS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

AVOID SELF-VALIDATING TESTS

No generar expected values automáticamente desde el mismo código que se pretende validar.

---

## 580. INDEPENDENT REFERENCE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

INDEPENDENT REFERENCE

Para casos críticos utilizar:

```text
manual calculation
independent spreadsheet
independent reference implementation
```

cuando sea apropiado.

---

## 581. GOLDEN CASE REVIEW

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN CASE REVIEW

Revisar especialmente:

```text
money
rounding
interest
tax
allocation
```

---

## 582. CASE TRACEABILITY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE TRACEABILITY

Cada Golden Case debe relacionarse con:

```text
requirement
policy
Rule
```

cuando sea posible.

---

## 583. RELEASE GATE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

RELEASE GATE

Production release requiere:

```text
mandatory golden suite PASS
```

---

## 584. FAILED CASE POLICY

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

FAILED CASE POLICY

Ante failure:

```text
stop release
investigate
fix
rerun
```

---

## 585. HISTORICAL GOLDENS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

HISTORICAL GOLDENS

Los casos que protegen semántica histórica deben conservarse aunque:

```text
business configuration
```

cambie.

---

## 586. VERSIONED EXPECTATIONS

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

VERSIONED EXPECTATIONS

Si cambia una Policy intencionalmente:

```text
new case version
```

debe conservar el caso anterior como histórico cuando sea relevante.

---

## 587. CASE COVERAGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

CASE COVERAGE

Medir cobertura por:

```text
business concept
pipeline stage
error category
```

---

## 588. NOT ONLY CODE COVERAGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

NOT ONLY CODE COVERAGE

No considerar:

```text
80% code coverage
```

equivalente a:

```text
financial correctness
```

---

## 589. FINANCIAL COVERAGE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

FINANCIAL COVERAGE

Debe existir cobertura de:

```text
rounding
tax
interest
discount
proration
allocation
reconciliation
```

---

## 590. GOLDEN EXIT CRITERIA

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

GOLDEN EXIT CRITERIA

```text
✓ 100 canonical cases
✓ Basic calculations
✓ Coefficients
✓ Quantities
✓ Discounts
✓ Taxes
✓ Interest
✓ Proration
✓ Novelties
✓ Payments
✓ Adjustments
✓ Reversals
✓ Rounding
✓ Currency
✓ Precision
✓ Concurrency
✓ Idempotency
✓ Security
✓ Tenant isolation
✓ Batch processing
✓ Provider failures
✓ Database failures
✓ Audit
✓ Reproducibility
✓ Dual run
✓ Effective dates
✓ Boundary cases
✓ Golden runner
✓ Regression suite
✓ Independent expected results
✓ Release gate
```

---

## 591. FINAL GOLDEN ARCHITECTURE

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

FINAL GOLDEN ARCHITECTURE

```text
                 Business Specification
                          │
                          ▼
                  Reference Calculation
                          │
                          ▼
                     Golden Case
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
           Input        Rule         Policy
             │            │            │
             └────────────┼────────────┘
                          ▼
                     AEL Runtime
                          │
                          ▼
                    Actual Result
                          │
                          ▼
                     Comparator
                          │
                  ┌───────┴───────┐
                  ▼               ▼
                 PASS            FAIL
                  │               │
                  ▼               ▼
               Release         Block
```

---

## 592. PRINCIPIO DE REFERENCIA

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

PRINCIPIO DE REFERENCIA

```text
Expected Result
≠
Implementation Result
```

El expected result debe existir independientemente.

---

## 593. PRINCIPIO DE REGRESIÓN

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

PRINCIPIO DE REGRESIÓN

Una versión nueva de AEL debe demostrar:

```text
new implementation
=
approved semantics
```

mediante los Golden Cases.

---

## 594. PRINCIPIO DE CONFIANZA

> **Origen:** Motor de liquidacion_Settlement Scenarios & Golden Reference Cases 53.md

PRINCIPIO DE CONFIANZA

```text
Specification
+
Independent Reference
+
Golden Cases
+
Automated Regression
=
Evidence of Correctness
```

---

## 595. REFERENCIAS

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

REFERENCIAS

Consume:

```text
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 58 — Semantic Analyzer & Type System Implementation
Documento 62 — Runtime Architecture & Execution Engine
Documento 64 — Liquidation Execution Context & Data Snapshot
Documento 65 — Liquidation Calculation Pipeline & Execution Lifecycle
Documento 66 — Concept Dependency Graph & Calculation Ordering
Documento 67 — Calculation Context, Variables & Intermediate Results
```

---

## 596. OBJETIVO

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

OBJETIVO

Definir el pipeline:

```text
Input
 ↓
Typed Financial Operation
 ↓
Intermediate Result
 ↓
Rounding Policy
 ↓
Accumulation
 ↓
Final Result
```

---

## 597. PRINCIPIO

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRINCIPIO

El motor debe separar:

```text
calculation precision
```

de:

```text
display precision
```

---

## 598. NO FLOATING POINT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO FLOATING POINT

Las operaciones financieras no deben utilizar:

```text
binary floating point
```

para representar importes monetarios.

---

## 599. DECIMAL

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DECIMAL

Las operaciones de precisión financiera utilizan:

```text
Decimal
```

según Documento 51.

---

## 600. MONEY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MONEY

Los importes monetarios utilizan:

```text
Money
```

con:

```text
amount
currency
```

según Documento 51.

---

## 601. OPERATION TYPES

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

OPERATION TYPES

Operaciones relevantes:

```text
addition
subtraction
multiplication
division
percentage
allocation
rounding
aggregation
```

---

## 602. ADDITION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ADDITION

Sólo sumar valores compatibles.

Para Money:

```text
same currency
```

---

## 603. CURRENCY MISMATCH

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

CURRENCY MISMATCH

No permitir:

```text
COP + USD
```

sin una conversión explícita.

Error conceptual:

```text
AEL_FINANCIAL_CURRENCY_MISMATCH
```

---

## 604. SUBTRACTION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SUBTRACTION

Mismas reglas de compatibilidad que Addition.

---

## 605. MULTIPLICATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MULTIPLICATION

Money puede multiplicarse por:

```text
Decimal
Percentage
Coefficient
```

según tipos definidos.

---

## 606. MONEY × MONEY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MONEY × MONEY

No permitir implícitamente:

```text
Money × Money
```

si el Type System no define una operación específica.

---

## 607. DIVISION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DIVISION

Debe verificar:

```text
divisor != 0
```

---

## 608. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DIVISION BY ZERO

```text
AEL_FINANCIAL_DIVISION_BY_ZERO
```

---

## 609. PERCENTAGE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PERCENTAGE

Percentage debe utilizar el tipo semántico correspondiente.

No representar una tasa financiera sólo como String.

---

## 610. PERCENTAGE SEMANTICS

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PERCENTAGE SEMANTICS

Si:

```text
rate = 10%
```

y:

```text
base = 100000
```

el resultado conceptual es:

```text
100000 × 0.10
```

pero la representación exacta debe seguir el tipo Percentage definido en el sistema.

---

## 611. PERCENTAGE CONVERSION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PERCENTAGE CONVERSION

La conversión:

```text
Percentage → Decimal factor
```

debe realizarse mediante operación tipada.

---

## 612. COEFFICIENT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

COEFFICIENT

Coefficient debe conservar la semántica definida por el dominio.

No asumir que todo coefficient es un Percentage.

---

## 613. PRORATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRORATION

Proration es una operación de dominio que puede involucrar:

```text
base amount
coefficient
participation
```

---

## 614. PRORATION RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRORATION RESULT

El resultado debe conservar:

```text
Money
currency
```

---

## 615. ALLOCATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION

Allocation distribuye un importe según una regla.

Ejemplo conceptual:

```text
Total
 ↓
distribution basis
 ↓
allocated amounts
```

---

## 616. ALLOCATION SUM

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION SUM

Una distribución debe validar:

```text
sum(allocations)
```

contra:

```text
source amount
```

según rounding policy.

---

## 617. ROUNDING

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING

Rounding debe ser explícito.

No aplicar rounding oculto en cada operación.

---

## 618. ROUNDING POLICY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING POLICY

Conceptualmente:

```ts
interface RoundingPolicy {
  scale: number
  mode: RoundingMode
}
```

---

## 619. ROUNDING MODE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING MODE

El modo debe ser uno de los soportados por Financial Types.

Ejemplos habituales:

```text
HALF_UP
HALF_EVEN
DOWN
UP
```

La implementación definitiva debe utilizar el conjunto autorizado por Documento 51.

---

## 620. ROUNDING POINT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING POINT

Cada concepto debe definir, mediante su configuración/regla financiera, dónde se redondea.

---

## 621. NO IMPLICIT ROUNDING

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO IMPLICIT ROUNDING

No redondear:

```text
after every multiplication
```

salvo que la regla financiera lo exija.

---

## 622. CALCULATION SCALE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

CALCULATION SCALE

Durante el cálculo puede mantenerse mayor precisión que la utilizada para el resultado publicado.

---

## 623. INTERNAL PRECISION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

INTERNAL PRECISION

La precisión interna debe ser suficiente para evitar pérdida de información antes del punto de redondeo definido.

---

## 624. FINAL PRECISION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

FINAL PRECISION

La precisión final debe provenir de:

```text
financial rule
```

y no de la interfaz de usuario.

---

## 625. DISPLAY PRECISION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DISPLAY PRECISION

Formato mostrado al usuario no altera:

```text
stored calculation value
```

---

## 626. ROUNDING VS FORMATTING

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING VS FORMATTING

```text
Rounding
```

cambia el valor.

```text
Formatting
```

cambia sólo su representación.

---

## 627. ROUNDING IMMUTABILITY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING IMMUTABILITY

Una operación de rounding produce un nuevo valor.

No muta el original.

---

## 628. ROUNDING AUDIT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING AUDIT

Cuando sea relevante, registrar:

```text
input
scale
mode
output
```

sin duplicar datos sensibles innecesariamente.

---

## 629. AGGREGATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

AGGREGATION

Aggregation debe realizarse sobre valores exactos o sobre valores ya redondeados según la regla de dominio.

---

## 630. SUM-THEN-ROUND

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SUM-THEN-ROUND

Una policy puede definir:

```text
sum exact values
→ round total
```

---

## 631. ROUND-THEN-SUM

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUND-THEN-SUM

Otra policy puede definir:

```text
round each allocation
→ sum rounded values
```

---

## 632. SEMANTIC DIFFERENCE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SEMANTIC DIFFERENCE

Estas estrategias pueden producir resultados diferentes.

Por eso deben ser una decisión explícita.

---

## 633. ALLOCATION ROUNDING

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION ROUNDING

Cuando se distribuye un importe entre Units, el sistema debe definir:

```text
round each unit
```

o:

```text
preserve residual
```

---

## 634. RESIDUAL

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESIDUAL

Si existe diferencia por redondeo:

```text
residual = source amount - sum(rounded allocations)
```

---

## 635. RESIDUAL POLICY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESIDUAL POLICY

El residual debe resolverse mediante una regla explícita.

No asignarlo arbitrariamente.

---

## 636. RESIDUAL TARGET

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESIDUAL TARGET

Puede existir una regla como:

```text
largest remainder
highest coefficient
deterministic first unit
```

La regla exacta pertenece a la política financiera.

---

## 637. DETERMINISM

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DETERMINISM

El residual debe asignarse siempre al mismo destino con los mismos inputs.

---

## 638. TIE BREAKER

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

TIE BREAKER

Si dos Units tienen igual criterio:

```text
canonical unitId
```

puede actuar como desempate.

---

## 639. COEFFICIENT SUM

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

COEFFICIENT SUM

Si el dominio requiere que coefficients sumen:

```text
100%
```

debe validarse antes de distribuir.

---

## 640. INVALID COEFFICIENT TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

INVALID COEFFICIENT TOTAL

Error conceptual:

```text
AEL_FINANCIAL_INVALID_COEFFICIENT_TOTAL
```

---

## 641. ZERO COEFFICIENT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ZERO COEFFICIENT

Un coefficient cero puede ser válido.

No debe interpretarse como dato ausente.

---

## 642. NEGATIVE AMOUNTS

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NEGATIVE AMOUNTS

Los valores negativos sólo deben permitirse cuando el tipo/regla de negocio lo permita.

---

## 643. NEGATIVE PAYMENT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NEGATIVE PAYMENT

No asumir que un payment negativo es válido.

---

## 644. ADJUSTMENTS

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ADJUSTMENTS

Ajustes negativos/positivos deben tener semántica explícita.

---

## 645. BALANCE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

BALANCE

El saldo puede calcularse como combinación tipada:

```text
previous balance
+
charges
-
payments
+
adjustments
```

según reglas del dominio.

---

## 646. BALANCE CURRENCY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

BALANCE CURRENCY

Todos los componentes deben ser compatibles en currency.

---

## 647. PAYMENT APPLICATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PAYMENT APPLICATION

La aplicación de pagos debe respetar el modelo de dominio.

No definir aquí el algoritmo de asignación de pagos.

---

## 648. CONCEPT CHARGES

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

CONCEPT CHARGES

Concept results monetarios pueden acumularse en un subtotal.

---

## 649. SUBTOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SUBTOTAL

Un subtotal debe conservar:

```text
Money
```

y currency.

---

## 650. TOTAL

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

TOTAL

Total se deriva de componentes definidos.

No calcular desde valores formateados.

---

## 651. RECONCILIATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RECONCILIATION

Validar:

```text
sum(details)
=
expected total
```

según tolerancia/regla exacta.

---

## 652. NO EPSILON FLOAT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO EPSILON FLOAT

No utilizar:

```text
epsilon
```

de floating point para corregir errores financieros.

---

## 653. DECIMAL EQUALITY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DECIMAL EQUALITY

La comparación financiera debe utilizar la semántica Decimal/Money definida.

---

## 654. SCALE NORMALIZATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SCALE NORMALIZATION

Valores equivalentes pueden tener escalas diferentes:

```text
10.0
10.00
```

La comparación debe seguir la semántica del tipo.

---

## 655. SIGN

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SIGN

La operación debe preservar correctamente:

```text
positive
negative
zero
```

---

## 656. ABSOLUTE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ABSOLUTE

Si existe `abs`, debe conservar:

```text
type
currency
precision
```

---

## 657. MIN/MAX

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MIN/MAX

Comparar sólo valores compatibles.

---

## 658. MIN/MAX MONEY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MIN/MAX MONEY

Money con distinta currency no puede compararse como si fueran equivalentes.

---

## 659. PERCENTAGE OF

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PERCENTAGE OF

Una operación:

```text
percentageOf(base, rate)
```

debe ser explícita en el runtime/type system cuando corresponda.

---

## 660. RATE APPLICATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RATE APPLICATION

No permitir interpretar:

```text
10
```

como:

```text
10%
```

sin contexto tipado.

---

## 661. COEFFICIENT APPLICATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

COEFFICIENT APPLICATION

No confundir:

```text
coefficient
percentage
multiplier
```

aunque numéricamente puedan parecer similares.

---

## 662. MULTIPLIER

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MULTIPLIER

Un multiplier puede ser:

```text
1.10
```

mientras Percentage:

```text
10%
```

La semántica debe permanecer distinta.

---

## 663. FINANCIAL FUNCTION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

FINANCIAL FUNCTION

Las funciones financieras deben tener:

```text
typed inputs
typed outputs
defined rounding behavior
```

---

## 664. FUNCTION COMPOSITION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

FUNCTION COMPOSITION

Al combinar funciones:

```text
output type
```

debe ser compatible con el siguiente input.

---

## 665. INTERMEDIATE PRECISION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

INTERMEDIATE PRECISION

No reducir precisión sólo porque el valor será mostrado posteriormente.

---

## 666. ROUNDING BOUNDARY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING BOUNDARY

El rounding boundary debe quedar asociado al Concept/operation donde la regla lo exige.

---

## 667. ROUNDING METADATA

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING METADATA

Cuando la auditoría lo requiera:

```text
roundingPolicyId
```

puede formar parte de provenance.

---

## 668. POLICY VERSION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

POLICY VERSION

Si cambia una rounding policy:

```text
policyVersion
```

debe cambiar la identidad reproducible de la ejecución.

---

## 669. REPLAY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

REPLAY

Mismo:

```text
Artifact
Snapshot
Parameters
Calculation Plan
Financial Policy
```

debe producir el mismo resultado.

---

## 670. POLICY HASH

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

POLICY HASH

Puede existir:

```text
financialPolicyHash
```

para replay/auditoría.

---

## 671. ROUNDING POLICY RESOLUTION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING POLICY RESOLUTION

La policy debe resolverse antes de ejecutar el Concept.

---

## 672. NO HOST ROUND

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO HOST ROUND

No delegar rounding financiero a:

```text
JavaScript Math.round
```

u otra operación host cuya semántica no coincida con Financial Types.

---

## 673. DECIMAL LIBRARY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DECIMAL LIBRARY

La implementación debe centralizar Decimal operations en el módulo financiero autorizado.

---

## 674. NO DIRECT DECIMAL LIBRARY

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO DIRECT DECIMAL LIBRARY

El código de negocio no debe llamar directamente a una librería externa de Decimal en múltiples lugares.

---

## 675. FINANCIAL OPERATION SERVICE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

FINANCIAL OPERATION SERVICE

Crear una frontera:

```text
FinancialOperationService
```

o equivalente.

---

## 676. OPERATION API

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

OPERATION API

Conceptualmente:

```ts
addMoney(a, b)
subtractMoney(a, b)
multiplyMoney(a, factor)
divideDecimal(a, b)
roundMoney(value, policy)
allocateMoney(amount, basis, policy)
```

---

## 677. OPERATION VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

OPERATION VALIDATION

Cada operación debe validar inputs antes de ejecutar.

---

## 678. OPERATION RESULT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

OPERATION RESULT

Debe devolver tipo financiero, no primitive genérico.

---

## 679. ERROR HANDLING

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ERROR HANDLING

Errores financieros deben ser tipados:

```text
CurrencyMismatch
DivisionByZero
InvalidScale
InvalidRange
InvalidRoundingPolicy
AllocationMismatch
```

---

## 680. ERROR PROPAGATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ERROR PROPAGATION

Un error financiero debe detener el Concept salvo policy explícita.

---

## 681. NO SILENT CORRECTION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO SILENT CORRECTION

No corregir automáticamente:

```text
invalid currency
invalid scale
invalid coefficient
```

---

## 682. ALLOCATION ALGORITHM

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION ALGORITHM

El algoritmo de allocation debe ser determinista.

---

## 683. ALLOCATION INPUT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION INPUT

Debe recibir:

```text
source amount
allocation basis
rounding policy
```

---

## 684. ALLOCATION OUTPUT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION OUTPUT

Debe devolver:

```text
allocation entries
residual
reconciliation status
```

según contrato.

---

## 685. ALLOCATION BASIS

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION BASIS

Basis puede ser:

```text
coefficient
percentage
fixed amount
weight
```

según dominio.

---

## 686. BASIS VALIDATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

BASIS VALIDATION

La suma de bases debe validarse según el tipo de distribución.

---

## 687. FIXED ALLOCATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

FIXED ALLOCATION

Si se distribuyen valores fijos:

```text
sum(fixed amounts)
```

debe reconciliar con source amount según policy.

---

## 688. WEIGHTED ALLOCATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

WEIGHTED ALLOCATION

Weights deben ser no negativas cuando la policy así lo requiera.

---

## 689. ZERO TOTAL WEIGHT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ZERO TOTAL WEIGHT

```text
AEL_FINANCIAL_ZERO_ALLOCATION_WEIGHT
```

---

## 690. NEGATIVE WEIGHT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NEGATIVE WEIGHT

Rechazar si el modelo no permite weights negativos.

---

## 691. LARGEST REMAINDER

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

LARGEST REMAINDER

Si se usa largest remainder:

```text
1. calculate exact allocations
2. round allocations
3. calculate residual
4. rank remainders deterministically
5. distribute residual
6. reconcile
```

---

## 692. RESIDUAL QUANTUM

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESIDUAL QUANTUM

El residual debe distribuirse en unidades de la mínima escala monetaria permitida.

---

## 693. RESIDUAL LIMIT

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESIDUAL LIMIT

Residual debe estar dentro del rango permitido por la policy.

---

## 694. ALLOCATION RECONCILIATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION RECONCILIATION

Al finalizar:

```text
sum(allocations) == source
```

cuando la policy lo exige.

---

## 695. RESULT ORDER

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESULT ORDER

Allocation entries deben ordenarse canónicamente.

---

## 696. UNIT ID TIE BREAK

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

UNIT ID TIE BREAK

Usar Unit ID canónico cuando sea necesario.

---

## 697. AUDIT TRAIL

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

AUDIT TRAIL

Cuando allocation sea material para el resultado:

```text
source
basis
exact allocation
rounded allocation
residual
distribution rule
```

deben poder reconstruirse.

---

## 698. PERFORMANCE

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PERFORMANCE

Financial operations deben evitar:

```text
repeated conversions
unnecessary rounding
string arithmetic
```

---

## 699. STRING ARITHMETIC

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

STRING ARITHMETIC

Nunca realizar:

```text
parseFloat
toFixed
string concatenation
```

como mecanismo financiero.

---

## 700. FORMATTING

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

FORMATTING

Formatting pertenece a UI/output adapters, no al cálculo.

---

## 701. SERIALIZATION

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SERIALIZATION

Financial values deben serializarse mediante representación canónica definida por Core/Financial Types.

---

## 702. ADDITION TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ADDITION TEST

```text
100.10 + 20.20 = 120.30
```

con Decimal exacto.

---

## 703. CURRENCY TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

CURRENCY TEST

COP + USD:

```text
rejected
```

---

## 704. DIVISION TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

DIVISION TEST

Divisor zero:

```text
rejected
```

---

## 705. ROUNDING TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUNDING TEST

Probar todos los rounding modes autorizados.

---

## 706. ROUND-THEN-SUM TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ROUND-THEN-SUM TEST

Verificar diferencia respecto a:

```text
SUM-THEN-ROUND
```

---

## 707. ALLOCATION TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ALLOCATION TEST

Distribuir importe entre varias Units y reconciliar.

---

## 708. RESIDUAL TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

RESIDUAL TEST

Verificar que residual sea asignado de manera determinista.

---

## 709. TIE TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

TIE TEST

Dos Units con igual remainder:

```text
canonical UnitId
```

determina ganador.

---

## 710. COEFFICIENT TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

COEFFICIENT TEST

Coeficients inválidos:

```text
rejected
```

---

## 711. ZERO COEFFICIENT TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

ZERO COEFFICIENT TEST

Zero coefficient se conserva como válido cuando la regla lo permite.

---

## 712. MONEY TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

MONEY TEST

Currency se conserva después de:

```text
add
subtract
multiply
round
```

---

## 713. PRECISION TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRECISION TEST

Verificar que cálculos intermedios no pierdan precisión antes del rounding boundary.

---

## 714. REPLAY TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

REPLAY TEST

Mismos inputs y policy:

```text
same resultHash
```

---

## 715. POLICY CHANGE TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

POLICY CHANGE TEST

Cambiar rounding policy:

```text
different policyHash
```

y potencialmente diferente resultHash.

---

## 716. NO FLOAT TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

NO FLOAT TEST

Detectar uso de floating point en financial module.

---

## 717. SERIALIZATION TEST

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

SERIALIZATION TEST

Round-trip:

```text
Money
→ serialize
→ deserialize
```

conserva semántica.

---

## 718. PRINCIPIO DE PRECISIÓN

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRINCIPIO DE PRECISIÓN

La precisión interna no debe reducirse antes de que una regla financiera indique que corresponde hacerlo.

---

## 719. PRINCIPIO DE EXPLICITUD

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRINCIPIO DE EXPLICITUD

Rounding, allocation y conversiones financieras deben ser operaciones explícitas y verificables.

---

## 720. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Financial Calculation Semantics & Rounding Pipeline 68.md

PRINCIPIO DE DETERMINISMO

Con los mismos inputs y la misma policy:

```text
same operations
=
same result
```

---
