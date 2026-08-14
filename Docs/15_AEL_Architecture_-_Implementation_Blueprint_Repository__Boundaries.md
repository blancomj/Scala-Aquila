# AEL V1 — AEL Architecture — Implementation Blueprint, Repository & Boundaries

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
15 — Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md
16 — Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md
17 — Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md
23 — Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md
24 — Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md
54 — Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

OBJETIVO

Definir:

```text
estructura de repositorio
módulos
interfaces
dependencias
responsabilidades
orden de implementación
criterios de aceptación
```

para comenzar el desarrollo real de AEL V1.

---

## 2. PRINCIPIO FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PRINCIPIO FUNDAMENTAL

La implementación debe seguir:

```text
Core
 ↓
Compiler
 ↓
Artifact
 ↓
Runtime
 ↓
Ports
 ↓
Adapters
 ↓
AQUILA
```

No comenzar por:

```text
UI
Supabase
PostgreSQL
```

porque eso invertiría las dependencias.

---

## 3. STACK V1

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

STACK V1

Implementación recomendada:

```text
TypeScript
Node.js
Vitest
ESLint
TypeScript compiler
OpenAPI
PostgreSQL/Supabase
Nuxt/Vue
```

La selección concreta de versiones debe fijarse en el release inicial.

---

## 4. REPOSITORIO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

REPOSITORIO

Estructura conceptual:

```text
aquila/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── ael-core/
│   ├── ael-lexer/
│   ├── ael-parser/
│   ├── ael-ast/
│   ├── ael-analyzer/
│   ├── ael-compiler/
│   ├── ael-artifact/
│   ├── ael-runtime/
│   ├── ael-contracts/
│   ├── ael-functions/
│   ├── ael-security/
│   ├── ael-testing/
│   ├── ael-api/
│   └── ael-cli/
│
├── database/
│   ├── migrations/
│   └── seeds/
│
├── tests/
│   ├── conformance/
│   ├── integration/
│   └── e2e/
│
└── docs/
```

---

## 5. MONOREPO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

MONOREPO

La recomendación V1 es utilizar:

```text
monorepo
```

para mantener sincronizados:

```text
Compiler
Runtime
CLI
API
Tests
```

---

## 6. PACKAGE MANAGER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PACKAGE MANAGER

Utilizar un único gestor de paquetes para todo el repositorio.

La decisión entre:

```text
pnpm
npm
yarn
```

debe fijarse al crear el repositorio.

No mezclar gestores.

---

## 7. CORE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CORE

`ael-core` contiene tipos fundamentales:

```text
AELValue
AELType
Dimension
Unit
Currency
ExecutionContext
Diagnostic
ErrorCode
```

No debe depender de:

```text
Supabase
PostgreSQL
Nuxt
HTTP
```

---

## 8. AEL VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

AEL VALUE

Representa un valor semántico.

Conceptualmente:

```ts
type AELValue =
  | NumberValue
  | MoneyValue
  | QuantityValue
  | BooleanValue
  | StringValue
  | DateValue
  | DateTimeValue
  | ...
```

Cada variante debe conservar su información semántica.

---

## 9. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

MONEY

Debe conservar:

```text
amount
currency
```

y utilizar representación exacta apropiada.

No utilizar `number` como representación financiera sin una estrategia explícita de precisión.

---

## 10. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

QUANTITY

Debe conservar:

```text
value
unit
dimension
```

Ejemplo:

```text
120.50 M2
```

---

## 11. DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DIMENSION

Representa:

```text
AREA
MASS
TIME
LENGTH
VOLUME
RATE
```

según el catálogo V1.

---

## 12. UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

UNIT

Representa:

```text
M2
KG
M
```

y contiene su dimensión.

---

## 13. TYPE SYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TYPE SYSTEM

Debe implementar operaciones:

```text
isAssignable
isCompatible
equals
infer
```

sin depender del Runtime.

---

## 14. DIAGNOSTIC

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DIAGNOSTIC

Debe representar:

```ts
interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  message: string
  span: SourceSpan
}
```

---

## 15. SOURCE SPAN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SOURCE SPAN

Debe permitir:

```text
line
column
start
end
```

para diagnostics y debugger.

---

## 16. ERROR MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ERROR MODEL

Definir errores de dominio:

```text
AELParseError
AELTypeError
AELDimensionError
AELSecurityError
AELRuntimeError
AELProviderError
```

No filtrar excepciones internas directamente hacia API.

---

## 17. LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

LEXER

`ael-lexer` convierte:

```text
Source
 ↓
Tokens
```

Debe ser:

```text
deterministic
side-effect free
```

---

## 18. TOKEN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TOKEN

Cada token debe conservar:

```text
kind
lexeme
span
```

---

## 19. KEYWORDS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

KEYWORDS

Los keywords pertenecen a la gramática oficial.

No hardcodearlos dispersos por el sistema.

---

## 20. PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PARSER

`ael-parser` convierte:

```text
Tokens
 ↓
AST
```

---

## 21. AST

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

AST

`ael-ast` contiene las estructuras semánticas del árbol.

Ejemplos:

```text
Program
Definition
Expression
BinaryExpression
Literal
Identifier
ContractReference
FunctionCall
Return
```

---

## 22. AST IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

AST IMMUTABILITY

Preferir AST inmutable después del parse.

Los transformadores deben producir estructuras nuevas o utilizar una estrategia claramente controlada.

---

## 23. PARSER ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PARSER ERRORS

El parser debe producir diagnostics con:

```text
expected token
actual token
source span
```

---

## 24. ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ANALYZER

`ael-analyzer` implementa:

```text
name resolution
type checking
dimension checking
Contract resolution
Function resolution
capability analysis
control-flow analysis
```

---

## 25. SYMBOL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SYMBOL TABLE

Debe existir una estructura para:

```text
variables
functions
contracts
```

---

## 26. NAME RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

NAME RESOLUTION

Debe resolver:

```text
local variables
Contract references
Functions
```

sin acceder a PostgreSQL.

---

## 27. TYPE CHECKING

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TYPE CHECKING

Debe detectar:

```text
invalid assignment
invalid operator
invalid function argument
invalid return
```

---

## 28. DIMENSION CHECKING

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DIMENSION CHECKING

Debe detectar:

```text
AREA + MASS
```

antes de runtime.

---

## 29. CONTRACT RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CONTRACT RESOLUTION

El Analyzer consulta un:

```text
ContractRegistry
```

---

## 30. FUNCTION RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FUNCTION RESOLUTION

Consulta:

```text
FunctionRegistry
```

---

## 31. CAPABILITY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CAPABILITY ANALYSIS

El Analyzer deriva:

```text
requiredCapabilities
```

a partir del AST.

---

## 32. CONTROL FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CONTROL FLOW

Analizar:

```text
unreachable code
missing return
```

cuando corresponda.

---

## 33. COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

COMPILER

`ael-compiler` transforma:

```text
AST
 ↓
IR
 ↓
Artifact
```

---

## 34. IR

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

IR

El IR debe ser:

```text
deterministic
serializable
independent of UI
```

---

## 35. IR INSTRUCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

IR INSTRUCTIONS

Ejemplos conceptuales:

```text
LOAD_CONSTANT
LOAD_LOCAL
STORE_LOCAL
LOAD_CONTRACT
CALL_FUNCTION
ADD
SUBTRACT
MULTIPLY
DIVIDE
RETURN
```

---

## 36. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ARTIFACT

El Artifact contiene:

```text
formatVersion
languageVersion
compilerVersion
instructions
constants
metadata
```

---

## 37. ARTIFACT SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ARTIFACT SERIALIZATION

Debe existir una representación canónica:

```text
serialize
deserialize
```

---

## 38. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ARTIFACT HASH

El hash se calcula sobre la representación canónica.

```text
canonicalArtifact
 ↓
SHA-256
```

según política de integridad V1.

---

## 39. ARTIFACT VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ARTIFACT VERIFIER

`ael-artifact` debe verificar:

```text
format
instruction validity
metadata
hash
limits
```

antes de ejecución.

---

## 40. RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RUNTIME

`ael-runtime` ejecuta exclusivamente Artifacts válidos.

No debe parsear Source en producción como camino normal.

---

## 41. EXECUTION ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

EXECUTION ENGINE

Responsabilidades:

```text
instruction dispatch
stack
locals
return
limits
provider calls
function calls
```

---

## 42. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

EXECUTION CONTEXT

Interfaz conceptual:

```ts
interface ExecutionContext {
  tenantId: string
  actorId?: string
  ruleId: string
  ruleVersionId: string
  executionId: string
  capabilities: ReadonlySet<string>
  limits: ExecutionLimits
}
```

---

## 43. EXECUTION LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

EXECUTION LIMITS

```ts
interface ExecutionLimits {
  maxInstructions: number
  maxProviderCalls: number
  maxExecutionTimeMs: number
}
```

Pueden existir límites adicionales.

---

## 44. PROVIDER PORT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PROVIDER PORT

```ts
interface ContractProvider {
  resolve(contract: ContractRef, context: ExecutionContext): Promise<AELValue>
}
```

---

## 45. FUNCTION PORT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FUNCTION PORT

```ts
interface FunctionRegistry {
  resolve(functionRef: FunctionRef): AELFunction
}
```

---

## 46. AEL FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

AEL FUNCTION

Una Function debe definir:

```text
id
version
signature
implementation
```

---

## 47. SECURITY PORT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SECURITY PORT

El Runtime debe depender de una política:

```ts
interface SecurityPolicy {
  isCapabilityAllowed(capability: string, context: ExecutionContext): boolean
}
```

---

## 48. RUNTIME INJECTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RUNTIME INJECTION

El Runtime recibe:

```text
ProviderRegistry
FunctionRegistry
SecurityPolicy
Clock
```

por dependency injection.

---

## 49. CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLOCK

Para determinismo:

```ts
interface Clock {
  now(): Date
}
```

No usar directamente:

```ts
new Date()
```

en lógica que requiera reproducibilidad.

---

## 50. RANDOMNESS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RANDOMNESS

No permitir aleatoriedad implícita.

Si alguna Function necesita randomness:

```text
explicit capability
```

y política específica.

---

## 51. NETWORK

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

NETWORK

El Runtime V1 no debe tener acceso directo a:

```text
HTTP
fetch
sockets
```

---

## 52. FILESYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FILESYSTEM

No permitir acceso directo a:

```text
filesystem
```

desde AEL.

---

## 53. PROCESS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PROCESS

No permitir:

```text
child_process
spawn
exec
```

---

## 54. DATABASE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DATABASE

No permitir:

```text
SQL
database client
```

desde Source o Runtime.

---

## 55. CONTRACT ADAPTERS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CONTRACT ADAPTERS

Los Providers reales viven fuera del Core.

Ejemplo:

```text
ael-contracts
      ↓
aquila-property-provider
      ↓
PostgreSQL
```

---

## 56. SUPABASE ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SUPABASE ADAPTER

El adaptador Supabase debe estar en infraestructura:

```text
infrastructure/supabase
```

No dentro de `ael-core`.

---

## 57. POSTGRES ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

POSTGRES ADAPTER

Igualmente:

```text
infrastructure/postgres
```

---

## 58. TEST PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TEST PROVIDER

Para tests:

```text
InMemoryContractProvider
```

---

## 59. SNAPSHOT PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SNAPSHOT PROVIDER

Para reproducción:

```text
SnapshotContractProvider
```

---

## 60. API PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

API PACKAGE

`ael-api` contiene DTOs y contratos de aplicación.

Debe definir:

```text
ValidateRequest
ValidateResponse
ExecuteRequest
ExecuteResponse
TestRequest
TestResponse
```

---

## 61. DTO VS DOMAIN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DTO VS DOMAIN

No exponer directamente entidades internas del Runtime como DTOs HTTP.

---

## 62. MAPPERS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

MAPPERS

Utilizar mappers:

```text
HTTP DTO
 ↓
Application Command
 ↓
Domain
```

y:

```text
Domain Result
 ↓
HTTP DTO
```

---

## 63. RULE APPLICATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RULE APPLICATION SERVICE

Responsable de:

```text
createRule
updateDraft
validate
publish
```

---

## 64. EXECUTION APPLICATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

EXECUTION APPLICATION SERVICE

Responsable de:

```text
execute
simulate
test
```

---

## 65. REPOSITORY PORTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

REPOSITORY PORTS

Ejemplos:

```ts
interface RuleRepository
interface RuleVersionRepository
interface ExecutionRepository
interface AuditRepository
```

---

## 66. DATABASE ADAPTERS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DATABASE ADAPTERS

Implementan:

```text
RuleRepository
RuleVersionRepository
ExecutionRepository
```

contra PostgreSQL.

---

## 67. TRANSACTION PORT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TRANSACTION PORT

Publicación requiere transacción.

Definir una abstracción:

```ts
interface TransactionManager {
  run<T>(work: () => Promise<T>): Promise<T>
}
```

---

## 68. AUDIT PORT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

AUDIT PORT

```ts
interface AuditWriter {
  append(event: AuditEvent): Promise<void>
}
```

---

## 69. CLOCK / ID PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLOCK / ID PROVIDER

Para tests:

```text
Clock
IdGenerator
```

deben ser inyectables.

---

## 70. ID GENERATOR

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ID GENERATOR

Producción puede utilizar:

```text
UUID
```

Tests pueden utilizar IDs deterministas.

---

## 71. CONFIGURATION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CONFIGURATION

No leer variables de entorno desde el Core.

La configuración debe entrar mediante:

```text
Application configuration
```

---

## 72. ENVIRONMENT CONFIG

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ENVIRONMENT CONFIG

Separar:

```text
development
staging
production
```

---

## 73. SECRETS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SECRETS

Los secretos sólo deben estar disponibles para infraestructura que los necesite.

Nunca:

```text
AEL Source
Artifact
logs
```

---

## 74. CLI

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLI

`ael-cli` debe proporcionar:

```text
validate
compile
test
inspect
format
```

---

## 75. CLI VALIDATE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLI VALIDATE

```bash
ael validate rule.ael
```

Debe devolver:

```text
exit 0
```

si es válido.

---

## 76. CLI TEST

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLI TEST

```bash
ael test rule.ael
```

Debe permitir ejecutar la suite local.

---

## 77. CLI INSPECT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLI INSPECT

```bash
ael inspect rule.artifact
```

Mostrar:

```text
version
hash
dependencies
capabilities
```

---

## 78. CLI FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CLI FORMAT

```bash
ael format rule.ael
```

Debe aplicar el formatter oficial.

---

## 79. TESTING PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TESTING PACKAGE

`ael-testing` debe proporcionar:

```text
test runner
fixtures
fake providers
assertions
snapshots
```

---

## 80. CONFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CONFORMANCE

Los casos normativos deben ser independientes del framework de tests cuando sea posible.

---

## 81. GOLDEN TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

GOLDEN TESTS

Utilizar:

```text
source
expected diagnostics
expected artifact
expected result
```

para detectar regresiones.

---

## 82. COMPILER GOLDEN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

COMPILER GOLDEN TEST

```text
input.ael
→
expected.artifact
```

---

## 83. RUNTIME GOLDEN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RUNTIME GOLDEN TEST

```text
artifact
+
context
→
expected result
```

---

## 84. ERROR GOLDEN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ERROR GOLDEN TEST

```text
invalid source
→
expected diagnostic code
```

---

## 85. PACKAGE DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PACKAGE DEPENDENCIES

Dirección recomendada:

```text
ael-core
   ↑
lexer / ast / parser / analyzer
   ↑
compiler
   ↑
artifact
   ↑
runtime
```

La dirección exacta puede separar `artifact` antes del compiler para evitar ciclos.

---

## 86. NO CIRCULAR DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

NO CIRCULAR DEPENDENCIES

Debe existir CI que detecte:

```text
package cycles
```

---

## 87. CORE DEPENDENCY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CORE DEPENDENCY RULE

`ael-core` no depende de ningún package de infraestructura.

---

## 88. RUNTIME DEPENDENCY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RUNTIME DEPENDENCY RULE

Runtime depende de:

```text
core
artifact
contracts
security
```

pero no de:

```text
Nuxt
Supabase client
PostgreSQL driver
```

---

## 89. COMPILER DEPENDENCY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

COMPILER DEPENDENCY RULE

Compiler depende de:

```text
lexer
parser
ast
analyzer
artifact
core
```

---

## 90. API DEPENDENCY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

API DEPENDENCY RULE

API depende de:

```text
application services
DTOs
domain ports
```

No de detalles concretos de PostgreSQL.

---

## 91. INFRASTRUCTURE DEPENDENCY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

INFRASTRUCTURE DEPENDENCY RULE

Infrastructure implementa ports.

Ejemplo:

```text
PostgresRuleRepository
implements RuleRepository
```

---

## 92. PACKAGE BOUNDARIES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PACKAGE BOUNDARIES

Cada package debe tener:

```text
public API
internal modules
tests
```

No importar archivos internos de otro package.

---

## 93. BARREL EXPORTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

BARREL EXPORTS

Utilizar exports públicos controlados.

Evitar:

```text
import from src/internal/...
```

---

## 94. API STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

API STABILITY

Todo export público debe considerarse contrato.

---

## 95. FASE 1 — CORE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 1 — CORE

Construir:

```text
AELValue
AELType
Dimension
Unit
Money
Quantity
Diagnostic
SourceSpan
Errors
```

---

## 96. CRITERIO FASE 1

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 1

Debe ser posible:

```text
crear valores
comparar tipos
validar dimensiones
```

sin infraestructura.

---

## 97. FASE 2 — LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 2 — LEXER

Implementar:

```text
tokens
keywords
literals
operators
comments
source spans
```

---

## 98. CRITERIO FASE 2

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 2

Todos los tokens definidos en la gramática deben tener tests.

---

## 99. FASE 3 — AST/PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 3 — AST/PARSER

Implementar:

```text
grammar
AST
syntax diagnostics
```

---

## 100. CRITERIO FASE 3

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 3

Todo ejemplo válido de la especificación debe producir AST válido.

---

## 101. FASE 4 — ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 4 — ANALYZER

Implementar:

```text
symbol resolution
types
dimensions
contracts
functions
capabilities
```

---

## 102. CRITERIO FASE 4

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 4

Los errores semánticos deben detectarse antes del Runtime.

---

## 103. FASE 5 — IR

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 5 — IR

Definir:

```text
instructions
operands
constants
metadata
```

---

## 104. CRITERIO FASE 5

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 5

AST válido debe producir IR determinista.

---

## 105. FASE 6 — ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 6 — ARTIFACT

Implementar:

```text
serialization
deserialization
canonical form
hash
verification
```

---

## 106. CRITERIO FASE 6

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 6

```text
compile
→ serialize
→ deserialize
→ verify
```

debe conservar semántica.

---

## 107. FASE 7 — COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 7 — COMPILER

Conectar:

```text
Source
→ Lexer
→ Parser
→ Analyzer
→ IR
→ Artifact
```

---

## 108. CRITERIO FASE 7

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 7

Una regla válida debe generar un Artifact ejecutable.

---

## 109. FASE 8 — RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 8 — RUNTIME

Implementar:

```text
stack
locals
instruction dispatch
return
limits
```

---

## 110. CRITERIO FASE 8

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 8

Debe ejecutar Artifacts sin acceder directamente a infraestructura.

---

## 111. FASE 9 — CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 9 — CONTRACTS

Implementar:

```text
ContractRegistry
ContractProvider
Contract metadata
```

---

## 112. CRITERIO FASE 9

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 9

Una regla puede leer un Contract mediante un Provider falso.

---

## 113. FASE 10 — SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 10 — SECURITY

Implementar:

```text
CapabilityPolicy
ExecutionLimits
Artifact verification
```

---

## 114. CRITERIO FASE 10

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FASE 10

Una capability no autorizada debe producir:

```text
DENY
```

---

## 115. FASE 11 — TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 11 — TESTING

Crear:

```text
unit
integration
conformance
golden
property-based
```

según utilidad.

---

## 116. FASE 12 — CLI

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 12 — CLI

Permitir desarrollo sin depender de AQUILA UI.

---

## 117. FASE 13 — PERSISTENCE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 13 — PERSISTENCE

Implementar:

```text
repositories
migrations
RLS
audit
```

---

## 118. FASE 14 — API

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 14 — API

Conectar:

```text
Application Services
→ HTTP
```

---

## 119. FASE 15 — UI

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 15 — UI

Construir:

```text
Rule Workspace
Editor
Diagnostics
Tests
Simulation
Publication
```

---

## 120. FASE 16 — WORKER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FASE 16 — WORKER

Agregar cuando existan casos:

```text
async execution
batch
heavy simulation
```

---

## 121. CANONICAL RULE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CANONICAL RULE

Ejemplo conceptual:

```ael
DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

---

## 122. CANONICAL RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CANONICAL RESULT

Input:

```text
120.50 M2
4500 COP/M2
```

Output:

```text
542250 COP
```

---

## 123. WHY FIRST SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

WHY FIRST SLICE

Este caso demuestra:

```text
lexer
parser
AST
types
dimensions
contracts
compiler
artifact
runtime
provider
money
quantity
```

sin implementar todavía toda la plataforma.

---

## 124. IMPLEMENTATION CHECKPOINTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

IMPLEMENTATION CHECKPOINTS

Después de cada fase:

```text
tests
conformance
review
```

No avanzar acumulando errores.

---

## 125. COMMIT STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

COMMIT STRATEGY

Commits pequeños y semánticos:

```text
feat(ael-core)
feat(ael-parser)
feat(ael-analyzer)
feat(ael-runtime)
```

---

## 126. CODE REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CODE REVIEW

Cada PR debe declarar:

```text
what changed
why
tests
risk
```

---

## 127. DEFINITION OF DONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DEFINITION OF DONE

Una feature AEL está terminada cuando:

```text
✓ implementation
✓ unit tests
✓ diagnostics
✓ conformance
✓ documentation
✓ no security regression
```

---

## 128. TEST COVERAGE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TEST COVERAGE

No fijar un único porcentaje como objetivo absoluto.

Priorizar cobertura de:

```text
semantics
security
compiler
runtime
```

---

## 129. PROPERTY TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PROPERTY TESTING

Especialmente útil para:

```text
parser
formatter
serializer
numeric operations
```

---

## 130. FUZZ TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FUZZ TESTING

Aplicar fuzzing a:

```text
lexer
parser
artifact deserializer
```

---

## 131. MALFORMED ARTIFACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

MALFORMED ARTIFACT TESTS

Obligatorio probar:

```text
truncated artifact
invalid opcode
invalid operand
invalid metadata
hash mismatch
```

---

## 132. SECURITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SECURITY TESTS

Intentar:

```text
capability bypass
tenant escape
resource exhaustion
artifact tampering
```

---

## 133. PERFORMANCE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PERFORMANCE TESTS

Medir:

```text
compile latency
runtime latency
provider latency
artifact load
```

---

## 134. BENCHMARKS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

BENCHMARKS

Mantener benchmarks para:

```text
small rule
medium rule
large rule
```

---

## 135. NO PREMATURE OPTIMIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

NO PREMATURE OPTIMIZATION

Primero:

```text
correctness
```

después:

```text
performance
```

---

## 136. IMPLEMENTATION RISKS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

IMPLEMENTATION RISKS

Riesgos principales:

```text
semantic ambiguity
numeric precision
compiler/runtime divergence
tenant leakage
artifact incompatibility
Provider coupling
```

---

## 137. RISK CONTROL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RISK CONTROL

Cada riesgo debe tener:

```text
test
invariant
review
```

---

## 138. COMPILER/RUNTIME CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

COMPILER/RUNTIME CONTRACT

El Compiler y Runtime deben compartir una especificación explícita de:

```text
Artifact format
instruction semantics
value encoding
```

---

## 139. ARTIFACT COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ARTIFACT COMPATIBILITY MATRIX

Debe mantenerse:

```text
Artifact Format
Compiler
Runtime
Compatibility
```

---

## 140. RUNTIME SHOULD NOT GUESS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

RUNTIME SHOULD NOT GUESS

Si un Artifact tiene formato incompatible:

```text
reject
```

No intentar interpretar ambiguamente.

---

## 141. LANGUAGE EVOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

LANGUAGE EVOLUTION

Cambios sintácticos deben pasar por:

```text
grammar version
```

---

## 142. SEMANTIC EVOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SEMANTIC EVOLUTION

Cambios semánticos deben pasar por:

```text
language version
```

y posiblemente:

```text
new RuleVersion
```

---

## 143. API EVOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

API EVOLUTION

Cambios de API deben seguir:

```text
API version
```

---

## 144. PACKAGE VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PACKAGE VERSIONING

Packages internos pueden versionarse conjuntamente mediante:

```text
AEL release
```

en V1.

---

## 145. DOCUMENTATION SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

DOCUMENTATION SOURCE

La documentación normativa debe mantenerse junto al proyecto.

Pero los documentos maestros de arquitectura siguen siendo la referencia conceptual.

---

## 146. CODE GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CODE GENERATION

No generar automáticamente Source AEL sin validarlo.

Si AQUILA Builder genera AEL:

```text
generated source
 ↓
validate
 ↓
compile
```

---

## 147. BUILDER AST

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

BUILDER AST

Una futura UI visual puede generar:

```text
AST
```

pero debe terminar pasando por el mismo pipeline oficial.

---

## 148. SINGLE COMPILATION PATH

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SINGLE COMPILATION PATH

Debe existir un único pipeline semántico:

```text
Source
→ AST
→ Analyzer
→ IR
→ Artifact
```

aunque existan múltiples interfaces de authoring.

---

## 149. FINAL IMPLEMENTATION ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

FINAL IMPLEMENTATION ARCHITECTURE

```text
                     ┌──────────────┐
                     │   Nuxt/Vue   │
                     └──────┬───────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ AQUILA API   │
                     └──────┬───────┘
                            │
                    ┌───────┴────────┐
                    ▼                ▼
             Rule Management     AEL Engine
                                      │
                         ┌────────────┼────────────┐
                         ▼            ▼            ▼
                      Compiler      Artifact      Runtime
                         │                         │
                         ▼                         ▼
                       Core                    Providers
                                                   │
                                                   ▼
                                              PostgreSQL
```

---

## 150. ORDEN DEFINITIVO DE CONSTRUCCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

ORDEN DEFINITIVO DE CONSTRUCCIÓN

```text
01 Core
02 Lexer
03 AST
04 Parser
05 Type System
06 Analyzer
07 IR
08 Artifact
09 Compiler
10 Runtime
11 Contracts
12 Functions
13 Security
14 Testing
15 CLI
16 Persistence
17 API
18 Worker
19 UI
20 E2E
21 Production hardening
```

---

## 151. PRIMER MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

PRIMER MILESTONE

Milestone:

```text
AEL-001 — Core Language Executable
```

Debe lograr:

```text
Source
 ↓
Compiler
 ↓
Artifact
 ↓
Runtime
 ↓
Result
```

sin Supabase.

---

## 152. SEGUNDO MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SEGUNDO MILESTONE

```text
AEL-002 — Contract Integration
```

Debe lograr:

```text
Runtime
 ↓
ContractProvider
 ↓
Fake Provider
```

---

## 153. TERCER MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

TERCER MILESTONE

```text
AEL-003 — Security
```

Debe lograr:

```text
Capability
+
Limits
+
Artifact Verification
```

---

## 154. CUARTO MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CUARTO MILESTONE

```text
AEL-004 — Persistence
```

Debe lograr:

```text
Rule
Version
Artifact
Test
Execution
Audit
```

---

## 155. QUINTO MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

QUINTO MILESTONE

```text
AEL-005 — AQUILA Integration
```

Debe lograr:

```text
Nuxt
→ API
→ AEL
→ PostgreSQL
```

---

## 156. SEXTO MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

SEXTO MILESTONE

```text
AEL-006 — Production Readiness
```

Debe lograr:

```text
CI/CD
Observability
Rollback
Security
Performance
```

---

## 157. CRITERIO FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Implementacion 15.md

CRITERIO FINAL

AEL V1 está implementado cuando:

```text
✓ Core semántico
✓ Lexer
✓ Parser
✓ AST
✓ Analyzer
✓ Compiler
✓ Artifact
✓ Verifier
✓ Runtime
✓ Contracts
✓ Functions
✓ Capabilities
✓ Tests
✓ CLI
✓ Persistence
✓ API
✓ UI
✓ Worker donde sea necesario
✓ CI/CD
✓ Observability
✓ Security
```

funcionan conjuntamente sin romper las fronteras definidas en los documentos 01–14.

---

## 158. OBJETIVO

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

OBJETIVO

Convertir las decisiones arquitectónicas anteriores en contratos técnicos concretos:

```text
types
interfaces
enums
value objects
AST
diagnostics
registries
ports
execution context
```

---

## 159. ALCANCE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ALCANCE

Este documento cubre principalmente:

```text
ael-core
ael-ast
ael-lexer
ael-parser
ael-analyzer
ael-artifact
ael-compiler
```

No implementa todavía:

```text
PostgreSQL
Supabase
Nuxt
HTTP
UI
```

---

## 160. REGLA DE DEPENDENCIAS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

REGLA DE DEPENDENCIAS

Dependencia conceptual:

```text
ael-core
   ↑
ael-ast
   ↑
ael-parser
   ↑
ael-analyzer
   ↑
ael-compiler
   ↑
ael-artifact
```

La implementación puede reorganizar paquetes para evitar ciclos, pero nunca debe introducir dependencias de infraestructura hacia el Core.

---

## 161. CORE DOMAIN

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CORE DOMAIN

El Core debe definir:

```text
AELValue
AELType
Money
Quantity
Unit
Dimension
Currency
SourceSpan
Diagnostic
```

---

## 162. PRIMITIVE TYPES

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PRIMITIVE TYPES

Catálogo inicial:

```text
NUMBER
MONEY
QUANTITY
BOOLEAN
STRING
DATE
DATETIME
```

Los tipos adicionales requieren decisión explícita.

---

## 163. TYPE REPRESENTATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TYPE REPRESENTATION

Interfaz conceptual:

```ts
export interface AELType {
  readonly kind: AELTypeKind
}
```

No utilizar strings libres como representación interna principal.

---

## 164. TYPE KIND

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TYPE KIND

```ts
export type AELTypeKind =
  'NUMBER' | 'MONEY' | 'QUANTITY' | 'BOOLEAN' | 'STRING' | 'DATE' | 'DATETIME' | 'VOID'
```

---

## 165. NUMBER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

NUMBER

El significado exacto de `NUMBER` debe quedar definido por el modelo numérico V1.

No asumir automáticamente:

```text
IEEE-754 double
```

para operaciones financieras.

---

## 166. MONEY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

MONEY

Modelo conceptual:

```ts
export interface MoneyValue {
  readonly kind: 'MONEY'
  readonly amount: DecimalLike
  readonly currency: CurrencyCode
}
```

`DecimalLike` debe resolverse mediante una representación exacta.

---

## 167. CURRENCY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CURRENCY

```ts
export type CurrencyCode = string
```

pero el runtime debe validar contra el catálogo permitido cuando aplique.

Ejemplo:

```text
COP
USD
EUR
```

---

## 168. QUANTITY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

QUANTITY

```ts
export interface QuantityValue {
  readonly kind: 'QUANTITY'
  readonly value: DecimalLike
  readonly unit: UnitCode
  readonly dimension: DimensionCode
}
```

---

## 169. DIMENSION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIMENSION

```ts
export type DimensionCode = 'LENGTH' | 'AREA' | 'VOLUME' | 'MASS' | 'TIME' | 'RATE' | 'NONE'
```

El catálogo definitivo debe coincidir con la especificación semántica oficial.

---

## 170. UNIT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

UNIT

```ts
export interface UnitDefinition {
  readonly code: UnitCode
  readonly dimension: DimensionCode
  readonly scale?: DecimalLike
}
```

---

## 171. UNIT CODE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

UNIT CODE

```ts
export type UnitCode = string
```

Ejemplos:

```text
M
M2
KG
H
```

---

## 172. AEL VALUE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

AEL VALUE

```ts
export type AELValue =
  NumberValue | MoneyValue | QuantityValue | BooleanValue | StringValue | DateValue | DateTimeValue
```

El tipo debe ser discriminable por `kind`.

---

## 173. VALUE FACTORIES

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

VALUE FACTORIES

No construir valores complejos directamente en todas partes.

Preferir:

```ts
Money.of(...)
Quantity.of(...)
```

o factories equivalentes.

---

## 174. VALUE INVARIANTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

VALUE INVARIANTS

Un `MoneyValue` inválido no debe existir.

Un `QuantityValue` debe tener:

```text
value
unit
dimension
```

coherentes.

---

## 175. SOURCE SPAN

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md; Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SOURCE SPAN

```ts
export interface SourceSpan {
  readonly start: SourcePosition
  readonly end: SourcePosition
}
```

---

## 176. SOURCE POSITION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SOURCE POSITION

```ts
export interface SourcePosition {
  readonly offset: number
  readonly line: number
  readonly column: number
}
```

---

## 177. DIAGNOSTIC

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIAGNOSTIC

```ts
export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly severity: DiagnosticSeverity
  readonly message: string
  readonly span?: SourceSpan
}
```

---

## 178. DIAGNOSTIC SEVERITY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIAGNOSTIC SEVERITY

```ts
export type DiagnosticSeverity = 'ERROR' | 'WARNING' | 'INFO' | 'HINT'
```

---

## 179. DIAGNOSTIC CODE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIAGNOSTIC CODE

Los códigos deben estar centralizados.

Ejemplos:

```text
AEL-PARSE-001
AEL-TYPE-001
AEL-DIMENSION-001
AEL-NAME-001
AEL-CONTRACT-001
AEL-FUNCTION-001
AEL-SECURITY-001
AEL-ARTIFACT-001
AEL-RUNTIME-001
```

---

## 180. DIAGNOSTIC COLLECTION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIAGNOSTIC COLLECTION

```ts
export interface DiagnosticBag {
  add(diagnostic: Diagnostic): void
  hasErrors(): boolean
  all(): readonly Diagnostic[]
}
```

---

## 181. TOKEN

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TOKEN

```ts
export interface Token {
  readonly kind: TokenKind
  readonly lexeme: string
  readonly span: SourceSpan
}
```

---

## 182. TOKEN KIND

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TOKEN KIND

El catálogo debe derivarse de la gramática.

Ejemplos:

```text
IDENTIFIER
NUMBER_LITERAL
STRING_LITERAL
KEYWORD
OPERATOR
PUNCTUATION
EOF
```

---

## 183. LEXER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

LEXER

```ts
export interface Lexer {
  tokenize(source: string): readonly Token[]
}
```

No debe tener dependencias de infraestructura.

---

## 184. AST ROOT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

AST ROOT

```ts
export interface ProgramNode {
  readonly kind: 'Program'
  readonly statements: readonly StatementNode[]
}
```

---

## 185. STATEMENT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

STATEMENT

```ts
export type StatementNode = DefinitionNode | ReturnNode | ExpressionStatementNode
```

El catálogo definitivo depende de la gramática V1.

---

## 186. EXPRESSION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXPRESSION

```ts
export type ExpressionNode =
  | LiteralNode
  | IdentifierNode
  | ContractReferenceNode
  | FunctionCallNode
  | BinaryExpressionNode
  | UnaryExpressionNode
```

---

## 187. LITERAL

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

LITERAL

```ts
export interface LiteralNode {
  readonly kind: 'Literal'
  readonly value: LiteralValue
  readonly span: SourceSpan
}
```

---

## 188. IDENTIFIER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

IDENTIFIER

```ts
export interface IdentifierNode {
  readonly kind: 'Identifier'
  readonly name: string
  readonly span: SourceSpan
}
```

---

## 189. CONTRACT REFERENCE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CONTRACT REFERENCE

```ts
export interface ContractReferenceNode {
  readonly kind: 'ContractReference'
  readonly namespace: string
  readonly name: string
  readonly version?: number
  readonly span: SourceSpan
}
```

---

## 190. FUNCTION CALL

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION CALL

```ts
export interface FunctionCallNode {
  readonly kind: 'FunctionCall'
  readonly name: string
  readonly args: readonly ExpressionNode[]
  readonly span: SourceSpan
}
```

---

## 191. BINARY EXPRESSION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

BINARY EXPRESSION

```ts
export interface BinaryExpressionNode {
  readonly kind: 'BinaryExpression'
  readonly operator: BinaryOperator
  readonly left: ExpressionNode
  readonly right: ExpressionNode
  readonly span: SourceSpan
}
```

---

## 192. UNARY EXPRESSION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

UNARY EXPRESSION

```ts
export interface UnaryExpressionNode {
  readonly kind: 'UnaryExpression'
  readonly operator: UnaryOperator
  readonly operand: ExpressionNode
  readonly span: SourceSpan
}
```

---

## 193. DEFINITION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DEFINITION

```ts
export interface DefinitionNode {
  readonly kind: 'Definition'
  readonly name: string
  readonly expression: ExpressionNode
  readonly span: SourceSpan
}
```

---

## 194. RETURN

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RETURN

```ts
export interface ReturnNode {
  readonly kind: 'Return'
  readonly expression: ExpressionNode
  readonly span: SourceSpan
}
```

---

## 195. PARSER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PARSER

```ts
export interface Parser {
  parse(tokens: readonly Token[]): ParseResult
}
```

---

## 196. PARSE RESULT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PARSE RESULT

```ts
export interface ParseResult {
  readonly program?: ProgramNode
  readonly diagnostics: readonly Diagnostic[]
}
```

Un AST inválido no debe avanzar como si fuera válido.

---

## 197. SYMBOL

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SYMBOL

```ts
export interface Symbol {
  readonly name: string
  readonly kind: SymbolKind
  readonly type: AELType
}
```

---

## 198. SYMBOL KIND

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SYMBOL KIND

```text
LOCAL
CONTRACT
FUNCTION
```

---

## 199. SYMBOL TABLE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SYMBOL TABLE

```ts
export interface SymbolTable {
  define(symbol: Symbol): void
  resolve(name: string): Symbol | undefined
}
```

---

## 200. CONTRACT REF

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CONTRACT REF

```ts
export interface ContractRef {
  readonly namespace: string
  readonly name: string
  readonly version: number
}
```

---

## 201. CONTRACT DEFINITION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CONTRACT DEFINITION

```ts
export interface ContractDefinition {
  readonly ref: ContractRef
  readonly type: AELType
  readonly dimension?: DimensionCode
  readonly nullable: boolean
  readonly capability: string
}
```

---

## 202. CONTRACT REGISTRY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CONTRACT REGISTRY

```ts
export interface ContractRegistry {
  resolve(ref: ContractRef): ContractDefinition | undefined
}
```

---

## 203. FUNCTION REF

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION REF

```ts
export interface FunctionRef {
  readonly name: string
  readonly version: number
}
```

---

## 204. FUNCTION SIGNATURE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION SIGNATURE

```ts
export interface FunctionSignature {
  readonly parameters: readonly AELType[]
  readonly returnType: AELType
}
```

---

## 205. FUNCTION DEFINITION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION DEFINITION

```ts
export interface FunctionDefinition {
  readonly ref: FunctionRef
  readonly signature: FunctionSignature
}
```

---

## 206. FUNCTION REGISTRY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION REGISTRY

```ts
export interface FunctionRegistry {
  resolve(ref: FunctionRef): FunctionDefinition | undefined
}
```

---

## 207. TYPE CHECKER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TYPE CHECKER

```ts
export interface TypeChecker {
  infer(expression: ExpressionNode, context: AnalysisContext): AELType
}
```

---

## 208. ANALYSIS CONTEXT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ANALYSIS CONTEXT

```ts
export interface AnalysisContext {
  readonly symbols: SymbolTable
  readonly contracts: ContractRegistry
  readonly functions: FunctionRegistry
}
```

---

## 209. ANALYZER RESULT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ANALYZER RESULT

```ts
export interface AnalysisResult {
  readonly diagnostics: readonly Diagnostic[]
  readonly inferredTypes: ReadonlyMap<string, AELType>
  readonly dependencies: readonly DependencyRef[]
  readonly capabilities: readonly string[]
}
```

---

## 210. DEPENDENCY REF

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DEPENDENCY REF

```ts
export interface DependencyRef {
  readonly type: 'CONTRACT' | 'FUNCTION'
  readonly code: string
  readonly version: number
}
```

---

## 211. ANALYZER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ANALYZER

```ts
export interface Analyzer {
  analyze(program: ProgramNode, context: AnalysisContext): AnalysisResult
}
```

---

## 212. OPERATOR SEMANTICS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

OPERATOR SEMANTICS

El Type System debe centralizar reglas como:

```text
NUMBER + NUMBER
MONEY + MONEY
QUANTITY + compatible QUANTITY
AREA * MONEY_PER_AREA
```

No distribuir estas reglas entre Parser y Runtime.

---

## 213. DIMENSION RULE ENGINE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIMENSION RULE ENGINE

```ts
export interface DimensionRules {
  canAdd(left: AELType, right: AELType): boolean
  canSubtract(left: AELType, right: AELType): boolean
  multiply(left: AELType, right: AELType): AELType
  divide(left: AELType, right: AELType): AELType
}
```

---

## 214. COMPILER INPUT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER INPUT

```ts
export interface CompileInput {
  readonly source: string
  readonly languageVersion: string
}
```

---

## 215. COMPILER RESULT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER RESULT

```ts
export interface CompileResult {
  readonly artifact?: Artifact
  readonly diagnostics: readonly Diagnostic[]
}
```

---

## 216. COMPILER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER

```ts
export interface Compiler {
  compile(input: CompileInput): CompileResult
}
```

---

## 217. IR INSTRUCTION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

IR INSTRUCTION

```ts
export interface Instruction {
  readonly opcode: Opcode
  readonly operand?: number
  readonly sourceSpan?: SourceSpan
}
```

---

## 218. OPCODE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

OPCODE

Ejemplo inicial:

```text
LOAD_CONSTANT
LOAD_LOCAL
STORE_LOCAL
LOAD_CONTRACT
CALL_FUNCTION
ADD
SUBTRACT
MULTIPLY
DIVIDE
RETURN
```

El catálogo oficial debe ser único y centralizado.

---

## 219. CONSTANT POOL

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CONSTANT POOL

```ts
export interface ConstantPool {
  readonly values: readonly AELValue[]
}
```

---

## 220. IR PROGRAM

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

IR PROGRAM

```ts
export interface IRProgram {
  readonly instructions: readonly Instruction[]
  readonly constants: ConstantPool
}
```

---

## 221. ARTIFACT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ARTIFACT

```ts
export interface Artifact {
  readonly formatVersion: number
  readonly languageVersion: string
  readonly compilerVersion: string
  readonly instructions: readonly Instruction[]
  readonly constants: ConstantPool
  readonly dependencies: readonly DependencyRef[]
  readonly capabilities: readonly string[]
}
```

---

## 222. ARTIFACT SERIALIZER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ARTIFACT SERIALIZER

```ts
export interface ArtifactSerializer {
  serialize(artifact: Artifact): Uint8Array
  deserialize(data: Uint8Array): Artifact
}
```

---

## 223. CANONICALIZATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CANONICALIZATION

```ts
export interface ArtifactCanonicalizer {
  canonicalize(artifact: Artifact): Uint8Array
}
```

---

## 224. HASHER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

HASHER

```ts
export interface ArtifactHasher {
  hash(artifact: Artifact): string
}
```

---

## 225. ARTIFACT VERIFIER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ARTIFACT VERIFIER

```ts
export interface ArtifactVerifier {
  verify(artifact: Artifact): VerificationResult
}
```

---

## 226. VERIFICATION RESULT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

VERIFICATION RESULT

```ts
export interface VerificationResult {
  readonly valid: boolean
  readonly diagnostics: readonly Diagnostic[]
}
```

---

## 227. RUNTIME

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RUNTIME

```ts
export interface Runtime {
  execute(artifact: Artifact, context: ExecutionContext): Promise<ExecutionResult>
}
```

---

## 228. EXECUTION CONTEXT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXECUTION CONTEXT

```ts
export interface ExecutionContext {
  readonly tenantId: string
  readonly actorId?: string
  readonly ruleId: string
  readonly ruleVersionId: string
  readonly executionId: string
  readonly capabilities: ReadonlySet<string>
  readonly limits: ExecutionLimits
}
```

---

## 229. EXECUTION LIMITS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXECUTION LIMITS

```ts
export interface ExecutionLimits {
  readonly maxInstructions: number
  readonly maxExecutionTimeMs: number
  readonly maxProviderCalls: number
}
```

---

## 230. EXECUTION RESULT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXECUTION RESULT

```ts
export interface ExecutionResult {
  readonly status: 'COMPLETED' | 'FAILED' | 'TIMEOUT'
  readonly value?: AELValue
  readonly diagnostics: readonly Diagnostic[]
  readonly durationMs: number
}
```

---

## 231. PROVIDER

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PROVIDER

```ts
export interface ContractProvider {
  resolve(contract: ContractRef, context: ExecutionContext): Promise<AELValue>
}
```

---

## 232. CAPABILITY POLICY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CAPABILITY POLICY

```ts
export interface CapabilityPolicy {
  isAllowed(capability: string, context: ExecutionContext): boolean
}
```

---

## 233. FUNCTION EXECUTION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION EXECUTION

```ts
export interface AELFunction {
  readonly definition: FunctionDefinition

  execute(args: readonly AELValue[], context: ExecutionContext): AELValue
}
```

---

## 234. FUNCTION REGISTRY RUNTIME

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FUNCTION REGISTRY RUNTIME

El Runtime debe resolver Functions mediante un registro controlado.

Nunca ejecutar:

```text
eval()
new Function()
```

---

## 235. CLOCK

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CLOCK

```ts
export interface Clock {
  now(): Date
}
```

---

## 236. ID GENERATOR

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ID GENERATOR

```ts
export interface IdGenerator {
  generate(): string
}
```

---

## 237. RUNTIME DEPENDENCIES

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RUNTIME DEPENDENCIES

```ts
export interface RuntimeDependencies {
  readonly contractProvider: ContractProvider
  readonly functionRegistry: RuntimeFunctionRegistry
  readonly capabilityPolicy: CapabilityPolicy
  readonly clock: Clock
}
```

---

## 238. RUNTIME FUNCTION REGISTRY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RUNTIME FUNCTION REGISTRY

```ts
export interface RuntimeFunctionRegistry {
  resolve(ref: FunctionRef): AELFunction | undefined
}
```

---

## 239. EXECUTION STATE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXECUTION STATE

Internamente el Runtime puede utilizar:

```ts
interface ExecutionState {
  instructionPointer: number
  stack: AELValue[]
  locals: Map<string, AELValue>
  providerCalls: number
  startedAt: number
}
```

Esta estructura es interna.

No exponerla como API pública.

---

## 240. STACK

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

STACK

La Stack debe ser:

```text
bounded
validated
```

para evitar corrupción del estado.

---

## 241. OPCODE DISPATCH

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

OPCODE DISPATCH

Preferir una tabla de handlers:

```ts
type OpcodeHandler = (state: ExecutionState, instruction: Instruction) => void
```

en lugar de lógica dispersa.

---

## 242. UNKNOWN OPCODE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

UNKNOWN OPCODE

Un opcode desconocido produce:

```text
AEL-ARTIFACT-UNKNOWN-OPCODE
```

y detiene la ejecución.

---

## 243. INVALID OPERAND

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

INVALID OPERAND

Un operand inválido produce:

```text
artifact verification failure
```

preferentemente antes de ejecutar.

---

## 244. EXECUTION LIMIT CHECK

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXECUTION LIMIT CHECK

El Runtime debe comprobar límites:

```text
before execution
during execution
```

---

## 245. PROVIDER CALL LIMIT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PROVIDER CALL LIMIT

Cada:

```text
LOAD_CONTRACT
```

que invoque infraestructura debe contabilizarse.

---

## 246. TIME LIMIT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TIME LIMIT

El Runtime debe comprobar:

```text
elapsed time
```

según el mecanismo apropiado al entorno.

---

## 247. CANCELLATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CANCELLATION

El Runtime puede recibir:

```ts
AbortSignal
```

o abstracción equivalente.

---

## 248. EXECUTION REQUEST

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXECUTION REQUEST

Internamente:

```ts
export interface ExecutionRequest {
  readonly artifact: Artifact
  readonly context: ExecutionContext
  readonly signal?: AbortSignal
}
```

---

## 249. COMPILER PIPELINE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER PIPELINE

Pipeline oficial:

```text
Source
 ↓
Lexer
 ↓
Parser
 ↓
AST
 ↓
Analyzer
 ↓
IR
 ↓
Artifact
 ↓
Verifier
```

---

## 250. COMPILER ORCHESTRATOR

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER ORCHESTRATOR

```ts
export interface CompilerPipeline {
  compile(input: CompileInput): CompileResult
}
```

---

## 251. FAIL FAST

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FAIL FAST

Si Parser produce errores:

```text
no Analyzer
```

Si Analyzer produce errores:

```text
no Artifact
```

---

## 252. WARNINGS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

WARNINGS

Warnings no necesariamente bloquean compilation.

Errors sí.

---

## 253. ARTIFACT CREATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ARTIFACT CREATION

Sólo crear Artifact cuando:

```text
diagnostics.hasErrors() === false
```

---

## 254. SOURCE MAP

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SOURCE MAP

Cada instruction debe poder conservar:

```text
sourceSpan
```

cuando sea necesario para debugging.

---

## 255. SOURCE MAP PRIVACY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SOURCE MAP PRIVACY

La información de source map no debe exponerse a usuarios no autorizados.

---

## 256. DETERMINISM

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DETERMINISM

El Compiler debe ser determinista para:

```text
same source
same language version
same compiler version
```

---

## 257. DETERMINISTIC ARTIFACT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DETERMINISTIC ARTIFACT

Debe producir:

```text
same Artifact
same canonical bytes
same hash
```

bajo las mismas condiciones.

---

## 258. NON-DETERMINISTIC DATA

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

NON-DETERMINISTIC DATA

No introducir en Artifact:

```text
timestamp de compilación
random ID
machine-specific path
```

salvo metadata explícitamente separada del hash.

---

## 259. COMPILER METADATA

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER METADATA

Si se requiere:

```text
build timestamp
machine
```

debe estar fuera de la representación canónica usada para hash, o definirse explícitamente.

---

## 260. TEST STRATEGY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TEST STRATEGY

Cada package debe tener:

```text
unit tests
```

y los límites entre packages:

```text
integration tests
```

---

## 261. CORE TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CORE TESTS

Probar:

```text
Money
Quantity
Dimension
Type
```

---

## 262. LEXER TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

LEXER TESTS

Probar:

```text
valid tokens
invalid characters
source positions
```

---

## 263. PARSER TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PARSER TESTS

Probar:

```text
valid programs
syntax errors
precedence
parentheses
```

---

## 264. ANALYZER TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ANALYZER TESTS

Probar:

```text
type mismatch
dimension mismatch
unknown symbol
unknown Contract
unknown Function
```

---

## 265. COMPILER TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPILER TESTS

Probar:

```text
AST → IR
IR → Artifact
determinism
```

---

## 266. ARTIFACT TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ARTIFACT TESTS

Probar:

```text
serialize
deserialize
hash
tampering
invalid opcode
```

---

## 267. RUNTIME TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RUNTIME TESTS

Probar:

```text
arithmetic
locals
Contract calls
Function calls
return
limits
```

---

## 268. CANONICAL END-TO-END

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CANONICAL END-TO-END

La primera prueba completa debe ser:

```text
DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

---

## 269. TEST CONTEXT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TEST CONTEXT

```text
PROPERTY.AREA_PRIVATE
= 120.50 M2

PARAMETER.TARIFA_M2
= 4500 COP/M2
```

---

## 270. EXPECTED RESULT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EXPECTED RESULT

```text
542250 COP
```

---

## 271. SEMANTIC ASSERTIONS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SEMANTIC ASSERTIONS

Además del valor:

```text
result.kind === MONEY
result.currency === COP
```

deben verificarse.

---

## 272. DIMENSION ASSERTIONS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DIMENSION ASSERTIONS

La multiplicación debe producir la dimensión monetaria correcta.

El modelo de `RATE` debe estar definido consistentemente en la implementación.

---

## 273. FIRST IMPLEMENTATION RULE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FIRST IMPLEMENTATION RULE

No agregar características nuevas al lenguaje para completar el primer ejemplo.

El primer ejemplo debe utilizar únicamente características ya definidas.

---

## 274. FEATURE GATES

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FEATURE GATES

Si una característica aún no está implementada:

```text
reject explicitly
```

No implementar una aproximación silenciosa.

---

## 275. PLACEHOLDERS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PLACEHOLDERS

No dejar:

```ts
throw new Error('TODO')
```

en caminos que puedan alcanzarse en producción.

---

## 276. TODO POLICY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TODO POLICY

Un TODO puede existir sólo si:

```text
documented
tracked
unreachable in current release
```

---

## 277. PUBLIC API REVIEW

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PUBLIC API REVIEW

Antes de publicar cada package:

```text
review exports
remove accidental internals
```

---

## 278. STRICT TYPESCRIPT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

STRICT TYPESCRIPT

Usar:

```json
{
  "strict": true
}
```

y mantenerlo como requisito.

---

## 279. NO IMPLICIT ANY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

NO IMPLICIT ANY

Prohibir:

```text
implicit any
```

---

## 280. ERROR HANDLING

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ERROR HANDLING

Preferir errores de dominio explícitos frente a:

```text
generic Error
```

cuando el caller necesite reaccionar semánticamente.

---

## 281. RESULT VS EXCEPTION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RESULT VS EXCEPTION

Operations como:

```text
compile
analyze
validate
```

pueden devolver resultados con diagnostics.

Excepciones deben reservarse para:

```text
unexpected infrastructure failures
```

---

## 282. RUNTIME FAILURE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

RUNTIME FAILURE

Una ejecución puede producir:

```text
ExecutionResult
```

con:

```text
FAILED
```

sin lanzar una excepción hasta la capa HTTP.

---

## 283. SECURITY FAILURE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SECURITY FAILURE

Debe ser distinguible:

```text
capability denied
```

de:

```text
provider unavailable
```

---

## 284. PROVIDER FAILURE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PROVIDER FAILURE

Debe distinguir:

```text
not found
timeout
unavailable
invalid data
unauthorized
```

---

## 285. DATA VALIDATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

DATA VALIDATION

El Provider debe validar que el resultado corresponda al Contract.

No aceptar:

```text
MONEY
```

cuando el Contract exige:

```text
QUANTITY
```

---

## 286. TYPE BOUNDARY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

TYPE BOUNDARY

El Runtime debe considerar el Provider una frontera no confiable.

Aunque sea código propio.

---

## 287. CONTRACT VALUE VALIDATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CONTRACT VALUE VALIDATION

Después de resolver un Contract:

```text
validate type
validate dimension
validate nullability
```

---

## 288. NULL

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

NULL

Si un Contract es:

```text
nullable = false
```

un null debe producir error.

---

## 289. OPTIONAL VALUES

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

OPTIONAL VALUES

La semántica de null/optional debe quedar centralizada.

No permitir comportamiento diferente entre:

```text
Compiler
Runtime
Provider
```

---

## 290. NUMERIC PRECISION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

NUMERIC PRECISION

La estrategia numérica debe ser única.

No mezclar:

```text
Decimal
float
integer
```

sin conversiones explícitas.

---

## 291. MONEY OPERATIONS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

MONEY OPERATIONS

Definir explícitamente:

```text
Money + Money
Money - Money
Money * Number
Quantity * MoneyRate
```

---

## 292. CURRENCY OPERATIONS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CURRENCY OPERATIONS

No permitir:

```text
COP + USD
```

sin una operación de conversión explícita autorizada.

---

## 293. QUANTITY OPERATIONS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

QUANTITY OPERATIONS

No permitir:

```text
M2 + KG
```

---

## 294. COMPARISONS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMPARISONS

Las comparaciones deben respetar:

```text
type
dimension
currency
```

---

## 295. EQUALITY

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

EQUALITY

La igualdad debe estar definida semánticamente.

No comparar objetos JavaScript por referencia.

---

## 296. SERIALIZATION

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

SERIALIZATION

La serialización de valores debe conservar:

```text
kind
precision
unit
dimension
currency
```

---

## 297. CODE STYLE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

CODE STYLE

El código debe priorizar:

```text
clarity
explicitness
small functions
strong types
```

---

## 298. COMMENTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

COMMENTS

Comentar:

```text
why
```

más que:

```text
what
```

cuando el código sea evidente.

---

## 299. ARCHITECTURE TESTS

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

ARCHITECTURE TESTS

CI puede comprobar:

```text
core imports no infrastructure
runtime imports no database
```

---

## 300. PACKAGE GRAPH TEST

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PACKAGE GRAPH TEST

Automatizar validación del grafo de dependencias.

---

## 301. PERFORMANCE BASELINE

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

PERFORMANCE BASELINE

Crear benchmarks desde el primer milestone para evitar regresiones silenciosas.

---

## 302. FIRST PERFORMANCE TARGET

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FIRST PERFORMANCE TARGET

No fijar todavía una cifra rígida de producción.

Registrar:

```text
baseline
```

para:

```text
compile
execute
```

---

## 303. FIRST SECURITY TARGET

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FIRST SECURITY TARGET

Debe ser imposible para un Artifact:

```text
ejecutar opcode desconocido
acceder filesystem
acceder network
bypassear capability
```

---

## 304. FIRST CORRECTNESS TARGET

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FIRST CORRECTNESS TARGET

La regla canónica debe producir:

```text
542250 COP
```

de manera determinista.

---

## 305. FIRST ARCHITECTURAL TARGET

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FIRST ARCHITECTURAL TARGET

El test del Core debe ejecutarse sin:

```text
Supabase
PostgreSQL
Nuxt
HTTP
```

---

## 306. IMPLEMENTATION CHECKPOINT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

IMPLEMENTATION CHECKPOINT

Antes de continuar con Persistence:

```text
AEL Core
Compiler
Artifact
Runtime
```

deben funcionar independientemente.

---

## 307. MILESTONE AEL-001

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

MILESTONE AEL-001

Nombre:

```text
AEL-001 — Core Language Executable
```

Entrega:

```text
Source
→
Lexer
→
Parser
→
Analyzer
→
Compiler
→
Artifact
→
Verifier
→
Runtime
→
Result
```

---

## 308. MILESTONE EXIT CRITERIA

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

MILESTONE EXIT CRITERIA

```text
✓ canonical rule compiles
✓ artifact verifies
✓ runtime executes
✓ result is MONEY
✓ result is COP
✓ result = 542250
✓ deterministic
✓ no infrastructure dependency
✓ tests pass
```

---

## 309. FINAL BLUEPRINT

> **Origen:** Motor de liquidacionAEL_V1_Blueprint_Tecnico_AEL_Core 16.md

FINAL BLUEPRINT

```text
                    SOURCE
                       │
                       ▼
                    LEXER
                       │
                       ▼
                    PARSER
                       │
                       ▼
                      AST
                       │
                       ▼
                   ANALYZER
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
        TYPES       CONTRACTS    FUNCTIONS
          │            │            │
          └────────────┼────────────┘
                       ▼
                      IR
                       │
                       ▼
                    ARTIFACT
                       │
                       ▼
                   VERIFIER
                       │
                       ▼
                    RUNTIME
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
          PROVIDER            FUNCTION
             │                   │
             └─────────┬─────────┘
                       ▼
                    RESULT
```

---

## 310. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

OBJETIVO

Construir el primer vertical slice completo:

```text
Source
 ↓
Lexer
 ↓
Parser
 ↓
AST
 ↓
Analyzer
 ↓
IR
 ↓
Artifact
 ↓
Verifier
 ↓
Runtime
 ↓
Result
```

Caso canónico:

```text
PROPERTY.AREA_PRIVATE
×
PARAMETER.TARIFA_M2
=
542250 COP
```

---

## 311. ALCANCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ALCANCE

AEL-001 implementará únicamente las características necesarias para demostrar:

```text
identificadores
definiciones
Contract references
literales numéricos
aritmética
multiplicación
retorno
tipado
dimensiones
Money
Quantity
Artifact
Runtime
```

No incluir todavía:

```text
loops
HTTP
database
async providers
UI
workflow
publication
multi-tenant persistence
```

---

## 312. REGLA DE ALCANCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

REGLA DE ALCANCE

No agregar funcionalidad al lenguaje sólo porque técnicamente sea posible.

Cada característica nueva debe responder a:

```text
¿Es necesaria para AEL-001?
```

Si la respuesta es no:

```text
postponer
```

---

## 313. REPOSITORIO AEL-001

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

REPOSITORIO AEL-001

Estructura inicial:

```text
packages/
├── ael-core/
├── ael-lexer/
├── ael-ast/
├── ael-parser/
├── ael-analyzer/
├── ael-artifact/
├── ael-compiler/
├── ael-runtime/
└── ael-testing/

tests/
└── conformance/
```

---

## 314. AEL-CORE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

AEL-CORE

Archivos:

```text
ael-core/
├── src/
│   ├── types/
│   ├── values/
│   ├── diagnostics/
│   ├── source/
│   ├── errors/
│   └── index.ts
└── tests/
```

---

## 315. CORE — TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CORE — TYPES

Crear:

```text
types/AELType.ts
types/AELTypeKind.ts
types/Dimension.ts
types/Unit.ts
types/Currency.ts
```

---

## 316. AELTYPE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

AELTYPE

Debe representar la identidad semántica de un tipo.

Ejemplo conceptual:

```ts
export interface AELType {
  readonly kind: AELTypeKind
}
```

---

## 317. AELTYPEKIND

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

AELTYPEKIND

Catálogo mínimo:

```text
NUMBER
MONEY
QUANTITY
BOOLEAN
STRING
VOID
```

DATE/DATETIME pueden quedar preparados pero no son obligatorios para AEL-001.

---

## 318. DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DIMENSION

Definir:

```text
DimensionCode
```

con al menos:

```text
NONE
LENGTH
AREA
RATE
MASS
TIME
MONEY
```

---

## 319. UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

UNIT

Implementar catálogo mínimo:

```text
M
M2
```

El catálogo puede crecer después.

---

## 320. CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CURRENCY

Implementar:

```text
COP
```

como currency válida del primer caso.

La arquitectura debe permitir:

```text
USD
EUR
```

posteriormente.

---

## 321. CORE — VALUES

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CORE — VALUES

Crear:

```text
values/NumberValue.ts
values/MoneyValue.ts
values/QuantityValue.ts
values/BooleanValue.ts
values/StringValue.ts
values/AELValue.ts
```

---

## 322. DECIMAL

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DECIMAL

No utilizar `number` directamente para Money.

Seleccionar una implementación decimal exacta compatible con TypeScript/Node.

La decisión concreta de librería debe fijarse en el repositorio inicial.

---

## 323. MONEY VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

MONEY VALUE

Debe garantizar:

```text
amount
currency
```

Ejemplo conceptual:

```ts
Money.of('542250', 'COP')
```

---

## 324. QUANTITY VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

QUANTITY VALUE

Debe garantizar:

```text
value
unit
dimension
```

Ejemplo:

```ts
Quantity.of('120.50', 'M2', 'AREA')
```

---

## 325. MONEY RATE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

MONEY RATE

Para AEL-001 debe existir una representación coherente para:

```text
COP/M2
```

La semántica de `RATE` debe definirse de forma que:

```text
AREA × MONEY_PER_AREA = MONEY
```

---

## 326. VALUE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

VALUE VALIDATION

Factories deben rechazar:

```text
Money sin currency
Quantity sin unit
Quantity con unit/dimension incompatibles
```

---

## 327. CORE — SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CORE — SOURCE

Crear:

```text
source/SourcePosition.ts
source/SourceSpan.ts
```

---

## 328. SOURCE POSITION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md; Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SOURCE POSITION

Conceptualmente:

```ts
interface SourcePosition {
  offset: number
  line: number
  column: number
}
```

---

## 329. DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DIAGNOSTICS

Crear:

```text
diagnostics/Diagnostic.ts
diagnostics/DiagnosticSeverity.ts
diagnostics/DiagnosticBag.ts
diagnostics/DiagnosticCodes.ts
```

---

## 330. ERROR CODES

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ERROR CODES

Primer catálogo:

```text
AEL-LEX-001
AEL-PARSE-001
AEL-NAME-001
AEL-TYPE-001
AEL-DIMENSION-001
AEL-CONTRACT-001
AEL-COMPILER-001
AEL-ARTIFACT-001
AEL-RUNTIME-001
```

---

## 331. CORE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CORE TESTS

Primero implementar tests para:

```text
Money
Quantity
Dimension
Currency
SourceSpan
Diagnostics
```

Antes del Lexer.

---

## 332. LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LEXER

Estructura:

```text
ael-lexer/
├── src/
│   ├── Token.ts
│   ├── TokenKind.ts
│   ├── Lexer.ts
│   ├── LexerImpl.ts
│   └── index.ts
└── tests/
```

---

## 333. TOKEN KIND

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

TOKEN KIND

AEL-001 necesita como mínimo:

```text
IDENTIFIER
NUMBER
STRING
DEFINIR
RETORNAR
EQUAL
PLUS
MINUS
MULTIPLY
DIVIDE
DOT
NEWLINE
EOF
```

La nomenclatura definitiva debe coincidir con la gramática oficial.

---

## 334. CONTRACT TOKENIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CONTRACT TOKENIZATION

La secuencia:

```text
PROPERTY.AREA_PRIVATE
```

debe poder reconocerse como:

```text
IDENTIFIER
DOT
IDENTIFIER
```

o como un token compuesto, según la decisión del Parser.

Recomendación:

```text
tokens simples
```

y composición en AST.

---

## 335. NUMBER LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

NUMBER LITERAL

Debe soportar:

```text
120
120.5
120.50
4500
```

No aceptar formatos ambiguos.

---

## 336. LEXER SPANS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LEXER SPANS

Cada token debe conservar:

```text
line
column
offset
```

---

## 337. LEXER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LEXER ERROR

Un carácter inválido debe producir:

```text
AEL-LEX-001
```

y continuar cuando sea seguro para reportar más diagnostics.

---

## 338. LEXER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LEXER TESTS

Crear casos:

```text
keywords
identifiers
numbers
operators
dot
newline
EOF
invalid character
positions
```

---

## 339. AST PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

AST PACKAGE

Estructura:

```text
ael-ast/
├── src/
│   ├── ProgramNode.ts
│   ├── StatementNode.ts
│   ├── ExpressionNode.ts
│   ├── DefinitionNode.ts
│   ├── ReturnNode.ts
│   ├── LiteralNode.ts
│   ├── IdentifierNode.ts
│   ├── ContractReferenceNode.ts
│   ├── BinaryExpressionNode.ts
│   └── index.ts
└── tests/
```

---

## 340. AST CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

AST CONTRACT

Todos los nodes deben tener:

```text
kind
span
```

---

## 341. PROGRAM

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PROGRAM

```ts
interface ProgramNode {
  kind: 'Program'
  statements: readonly StatementNode[]
}
```

---

## 342. DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DEFINITION

Representa:

```text
DEFINIR area = expression
```

---

## 343. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RETURN

Representa:

```text
RETORNAR expression
```

---

## 344. CONTRACT REFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CONTRACT REFERENCE

Representa:

```text
PROPERTY.AREA_PRIVATE
```

---

## 345. BINARY EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

BINARY EXPRESSION

Debe soportar inicialmente:

```text
+
-
*
/
```

---

## 346. PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PARSER

Estructura:

```text
ael-parser/
├── src/
│   ├── Parser.ts
│   ├── ParserImpl.ts
│   ├── ParserContext.ts
│   └── index.ts
└── tests/
```

---

## 347. PARSER STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PARSER STRATEGY

Para AEL-001 puede utilizarse:

```text
recursive descent
```

por su claridad y facilidad de mantenimiento.

---

## 348. OPERATOR PRECEDENCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

OPERATOR PRECEDENCE

Debe implementarse:

```text
*
/
```

antes de:

```text
+
-
```

---

## 349. PARENTHESES

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PARENTHESES

Aunque no sean necesarias para el caso canónico, deben soportarse si ya forman parte de la gramática V1.

No alterar la semántica establecida.

---

## 350. PARSER ERROR RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PARSER ERROR RECOVERY

Debe poder producir diagnostics razonables sin entrar en loops infinitos.

---

## 351. PARSER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PARSER TESTS

Casos:

```text
single definition
multiple definitions
return
contract reference
multiplication
addition
precedence
invalid syntax
```

---

## 352. ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ANALYZER

Estructura:

```text
ael-analyzer/
├── src/
│   ├── Analyzer.ts
│   ├── AnalyzerImpl.ts
│   ├── SymbolTable.ts
│   ├── TypeChecker.ts
│   ├── DimensionChecker.ts
│   ├── ContractRegistry.ts
│   ├── FunctionRegistry.ts
│   └── index.ts
└── tests/
```

---

## 353. SYMBOL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

SYMBOL TABLE

Debe registrar:

```text
area
tarifa
```

cuando aparecen las definiciones.

---

## 354. DEFINITION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DEFINITION ORDER

AEL-001 debe resolver definiciones en orden.

Ejemplo:

```text
DEFINIR a = 10
DEFINIR b = a * 2
```

válido.

Referencia antes de definición:

```text
DEFINIR b = a * 2
DEFINIR a = 10
```

debe producir error si la semántica V1 establece resolución secuencial.

---

## 355. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CONTRACT REGISTRY

Crear un registry en memoria para AEL-001:

```text
PROPERTY.AREA_PRIVATE
PARAMETER.TARIFA_M2
```

---

## 356. CONTRACT DEFINITIONS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CONTRACT DEFINITIONS

Ejemplo conceptual:

```text
PROPERTY.AREA_PRIVATE
type = QUANTITY
dimension = AREA
unit = M2
capability = READ_PROPERTY

PARAMETER.TARIFA_M2
type = RATE
dimension = MONEY_PER_AREA
currency = COP
unit = COP/M2
capability = READ_PARAMETER
```

---

## 357. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CAPABILITIES

Analyzer debe producir:

```text
READ_PROPERTY
READ_PARAMETER
```

como dependencias de la regla.

---

## 358. TYPE INFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

TYPE INFERENCE

Para:

```text
area * tarifa
```

debe inferir:

```text
MONEY
```

---

## 359. DIMENSION INFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DIMENSION INFERENCE

Debe comprobar:

```text
AREA × MONEY_PER_AREA = MONEY
```

---

## 360. INVALID EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

INVALID EXAMPLE

```text
area + tarifa
```

debe fallar semánticamente.

---

## 361. INVALID DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

INVALID DIMENSION

```text
area * area
```

debe producir un tipo/dimensión que no pueda convertirse implícitamente a MONEY.

---

## 362. ANALYZER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ANALYZER RESULT

Debe devolver:

```text
diagnostics
dependencies
capabilities
inferred types
```

---

## 363. IR

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

IR

Estructura:

```text
ael-compiler/
└── src/
    └── ir/
        ├── Opcode.ts
        ├── Instruction.ts
        ├── IRProgram.ts
        └── IRBuilder.ts
```

---

## 364. IR FOR CANONICAL RULE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

IR FOR CANONICAL RULE

Conceptualmente:

```text
LOAD_CONTRACT 0
STORE_LOCAL 0

LOAD_CONTRACT 1
STORE_LOCAL 1

LOAD_LOCAL 0
LOAD_LOCAL 1
MULTIPLY
RETURN
```

---

## 365. CONSTANT/CONTRACT POOL

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CONSTANT/CONTRACT POOL

Puede existir una tabla de referencias:

```text
0 → PROPERTY.AREA_PRIVATE
1 → PARAMETER.TARIFA_M2
```

No hardcodear Contract IDs dentro del opcode.

---

## 366. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ARTIFACT

Estructura:

```text
ael-artifact/
├── src/
│   ├── Artifact.ts
│   ├── ArtifactSerializer.ts
│   ├── ArtifactDeserializer.ts
│   ├── ArtifactHasher.ts
│   ├── ArtifactVerifier.ts
│   └── index.ts
└── tests/
```

---

## 367. ARTIFACT FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ARTIFACT FORMAT

Debe tener:

```text
magic
formatVersion
languageVersion
compilerVersion
dependencies
capabilities
constants
instructions
```

---

## 368. MAGIC

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

MAGIC

Un identificador fijo permite detectar rápidamente:

```text
not an AEL artifact
```

---

## 369. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CANONICAL SERIALIZATION

El serializer debe producir bytes deterministas.

No incluir:

```text
timestamps
random identifiers
```

en la parte hasheada.

---

## 370. HASH

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

HASH

Implementar:

```text
SHA-256
```

para AEL-001.

---

## 371. VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

VERIFIER

Debe comprobar:

```text
magic
format version
opcode validity
operand validity
stack safety
metadata
```

---

## 372. ARTIFACT TAMPERING TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ARTIFACT TAMPERING TEST

Modificar un byte del Artifact y comprobar:

```text
verification fails
```

---

## 373. RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RUNTIME

Estructura:

```text
ael-runtime/
├── src/
│   ├── Runtime.ts
│   ├── RuntimeImpl.ts
│   ├── ExecutionContext.ts
│   ├── ExecutionState.ts
│   ├── ExecutionLimits.ts
│   ├── OpcodeDispatcher.ts
│   ├── ContractProvider.ts
│   ├── FunctionRegistry.ts
│   └── index.ts
└── tests/
```

---

## 374. IN-MEMORY PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

IN-MEMORY PROVIDER

AEL-001 utilizará:

```text
InMemoryContractProvider
```

---

## 375. PROVIDER DATA

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PROVIDER DATA

```text
PROPERTY.AREA_PRIVATE → 120.50 M2
PARAMETER.TARIFA_M2 → 4500 COP/M2
```

---

## 376. RUNTIME FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RUNTIME FLOW

```text
verify artifact
 ↓
create execution state
 ↓
dispatch instruction
 ↓
resolve contracts
 ↓
perform arithmetic
 ↓
return value
```

---

## 377. STACK SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

STACK SAFETY

Antes de cada opcode:

```text
validate required operands
```

---

## 378. MULTIPLY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

MULTIPLY

Debe implementar las combinaciones permitidas por el Type System.

Para AEL-001:

```text
AREA × MONEY_PER_AREA
```

produce:

```text
MONEY
```

---

## 379. RUNTIME TYPE SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RUNTIME TYPE SAFETY

El Runtime no debe asumir que el Compiler siempre produjo un Artifact válido.

Debe mantener validaciones defensivas.

---

## 380. LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LIMITS

AEL-001 debe tener:

```text
maxInstructions
maxProviderCalls
maxExecutionTimeMs
```

---

## 381. LIMIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LIMIT TEST

Crear un Artifact que exceda:

```text
maxInstructions
```

y comprobar:

```text
TIMEOUT/LIMIT EXCEEDED
```

según el error definido.

---

## 382. COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

COMPILER

Estructura:

```text
ael-compiler/
├── src/
│   ├── Compiler.ts
│   ├── CompilerImpl.ts
│   ├── Lowering.ts
│   ├── ir/
│   └── index.ts
└── tests/
```

---

## 383. COMPILER FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

COMPILER FLOW

```text
Parser
 ↓
Analyzer
 ↓
Lowering
 ↓
IR
 ↓
Artifact
```

---

## 384. LOWERING

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LOWERING

Transformar:

```text
ContractReferenceNode
```

en:

```text
LOAD_CONTRACT
```

---

## 385. LOCAL LOWERING

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

LOCAL LOWERING

Transformar:

```text
IdentifierNode
```

en:

```text
LOAD_LOCAL
```

---

## 386. DEFINITION LOWERING

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DEFINITION LOWERING

Transformar:

```text
DEFINIR area = expression
```

en:

```text
evaluate expression
STORE_LOCAL area
```

---

## 387. RETURN LOWERING

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RETURN LOWERING

Transformar:

```text
RETORNAR expression
```

en:

```text
evaluate expression
RETURN
```

---

## 388. ARTIFACT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ARTIFACT METADATA

Incluir:

```text
dependencies
capabilities
compilerVersion
languageVersion
```

---

## 389. TESTING PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

TESTING PACKAGE

Estructura:

```text
ael-testing/
├── src/
│   ├── TestRunner.ts
│   ├── Assertions.ts
│   ├── Fixtures.ts
│   └── index.ts
└── tests/
```

---

## 390. CANONICAL FIXTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CANONICAL FIXTURE

Crear fixture:

```text
canonical-rule.ael
```

con:

```text
DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

---

## 391. EXPECTED OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

EXPECTED OUTPUT

```text
542250 COP
```

---

## 392. FULL PIPELINE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

FULL PIPELINE TEST

Test obligatorio:

```text
source
→ tokens
→ AST
→ analysis
→ artifact
→ verification
→ runtime
→ result
```

---

## 393. NO MOCKING CORE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

NO MOCKING CORE

El test end-to-end de AEL-001 no debe mockear:

```text
Lexer
Parser
Analyzer
Compiler
Artifact
Runtime
```

Sólo el Provider externo debe ser in-memory.

---

## 394. CONFORMANCE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

CONFORMANCE TEST

El resultado debe verificar:

```text
value
type
currency
diagnostics
dependencies
capabilities
```

---

## 395. DETERMINISM TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DETERMINISM TEST

Compilar dos veces el mismo Source:

```text
artifactHash1 === artifactHash2
```

---

## 396. SERIALIZATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

SERIALIZATION TEST

```text
artifact
→ bytes
→ artifact
```

debe conservar equivalencia semántica.

---

## 397. RUNTIME REPEATABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RUNTIME REPEATABILITY

Ejecutar el mismo Artifact con el mismo contexto debe producir:

```text
same result
```

---

## 398. ERROR TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ERROR TESTS

Casos mínimos:

```text
unknown identifier
unknown Contract
invalid dimension
invalid operator
invalid syntax
invalid Artifact
unknown opcode
```

---

## 399. SECURITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

SECURITY TESTS

Intentar:

```text
capability missing
filesystem access
network access
dynamic code execution
```

El diseño debe impedir estas capacidades.

---

## 400. FORBIDDEN APIs

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

FORBIDDEN APIs

En paquetes Core/Runtime:

```text
eval
new Function
child_process
fs
net
http
https
fetch
```

no deben utilizarse como mecanismo de ejecución AEL.

---

## 401. STATIC ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

STATIC ANALYSIS

CI debe detectar imports prohibidos.

---

## 402. PACKAGE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PACKAGE TEST

Verificar que:

```text
ael-core
```

no importe:

```text
node infrastructure
```

innecesaria.

---

## 403. FIRST BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

FIRST BUILD

El primer build exitoso debe generar:

```text
packages/*/dist
```

sin warnings críticos.

---

## 404. FIRST CLI

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

FIRST CLI

Aunque el CLI completo pertenece a otro milestone, AEL-001 puede tener un runner técnico:

```text
compile canonical-rule.ael
execute canonical artifact
```

---

## 405. DEBUG MODE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

DEBUG MODE

Puede existir una salida técnica:

```text
tokens
AST
IR
Artifact hash
Result
```

pero sólo para desarrollo.

---

## 406. GOLDEN OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

GOLDEN OUTPUT

Guardar fixtures esperados:

```text
canonical.ast.json
canonical.ir.json
canonical.artifact
canonical.result.json
```

según formato definitivo.

---

## 407. SNAPSHOT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

SNAPSHOT POLICY

Los snapshots deben utilizarse con cuidado.

No aprobar automáticamente cambios de snapshot sin revisión semántica.

---

## 408. REVIEW CHECKPOINT

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

REVIEW CHECKPOINT

Antes de marcar AEL-001 como terminado:

```text
Core review
Lexer review
Parser review
Analyzer review
Compiler review
Artifact review
Runtime review
Security review
```

---

## 409. PERFORMANCE BASELINE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PERFORMANCE BASELINE

Registrar:

```text
compile time
artifact size
execution time
provider calls
```

para la regla canónica.

---

## 410. MEMORY BASELINE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

MEMORY BASELINE

Registrar:

```text
compiler memory
runtime memory
```

cuando sea práctico.

---

## 411. FIRST RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

FIRST RELEASE

El primer release interno puede identificarse:

```text
AEL-0.1.0
```

si el esquema de versionado del proyecto lo permite.

---

## 412. NO PUBLIC API PROMISE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

NO PUBLIC API PROMISE

AEL-001 todavía no implica estabilidad externa del lenguaje.

Las APIs pueden evolucionar hasta completar V1.

---

## 413. COMPLETION GATE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

COMPLETION GATE

AEL-001 sólo está completo cuando:

```text
✓ source parses
✓ AST is valid
✓ types resolve
✓ dimensions resolve
✓ contracts resolve
✓ capabilities derive
✓ IR is deterministic
✓ Artifact serializes
✓ Artifact verifies
✓ Artifact hash is deterministic
✓ Runtime executes
✓ result is correct
✓ security tests pass
```

---

## 414. RESULTADO FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

RESULTADO FINAL

El sistema debe demostrar:

```text
INPUT
120.50 M2
4500 COP/M2

AEL
area * tarifa

OUTPUT
542250 COP
```

---

## 415. ARQUITECTURA RESULTANTE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

ARQUITECTURA RESULTANTE

```text
                 canonical-rule.ael
                         │
                         ▼
                       Lexer
                         │
                         ▼
                       Parser
                         │
                         ▼
                         AST
                         │
                         ▼
                      Analyzer
                    ┌────┼────┐
                    ▼    ▼    ▼
                  Types Contracts Functions
                    │    │    │
                    └────┼────┘
                         ▼
                         IR
                         │
                         ▼
                      Artifact
                         │
                         ▼
                      Verifier
                         │
                         ▼
                       Runtime
                         │
                         ▼
               InMemoryContractProvider
                         │
                         ▼
                       Result
```

---

## 416. PRINCIPIO DE IMPLEMENTACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PRINCIPIO DE IMPLEMENTACIÓN

No avanzar hacia:

```text
Persistence
API
UI
Production
```

hasta que AEL-001 pueda ejecutar correctamente su vertical slice.

---

## 417. EXCEPCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

EXCEPCIÓN

Puede desarrollarse infraestructura paralelamente si no introduce dependencias hacia el Core.

---

## 418. PRÓXIMO MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementacion_Milestone_AEL_001 17.md

PRÓXIMO MILESTONE

Después de AEL-001:

```text
AEL-002 — Contract Integration
```

que incorporará:

```text
Contract Registry real
Provider ports
Function registry
capability enforcement
```

sin modificar la semántica fundamental del Core.

---

## 419. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

OBJETIVO

Definir:

```text
repository structure
packages
modules
source folders
database migrations
API modules
UI modules
test suites
implementation order
definition of done
```

---

## 420. REGLA PRINCIPAL

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

REGLA PRINCIPAL

No comenzar implementando:

```text
UI completa
```

ni:

```text
API completa
```

antes de tener estable:

```text
Value Model
AST
Analyzer
Artifact
Runtime
Contracts
```

---

## 421. IMPLEMENTATION STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION STRATEGY

La implementación será incremental:

```text
Foundation
 ↓
Compiler
 ↓
Runtime
 ↓
Persistence
 ↓
Application
 ↓
API
 ↓
UI
 ↓
Worker
 ↓
Production
```

---

## 422. MONOREPO

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

MONOREPO

Si AQUILA utiliza monorepo, la estructura recomendada:

```text
apps/
packages/
supabase/
tests/
docs/
```

---

## 423. APPS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

APPS

Conceptualmente:

```text
apps/
├── web/
├── api/
└── worker/
```

Si API y Worker viven en una misma aplicación Node/Nuxt server, mantener separación lógica aunque compartan deployment.

---

## 424. PACKAGES

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PACKAGES

```text
packages/
├── ael-core/
├── ael-compiler/
├── ael-runtime/
├── ael-contracts/
├── ael-application/
├── ael-infrastructure/
├── ael-api/
├── ael-ui/
└── ael-testkit/
```

Los nombres exactos pueden adaptarse a la estructura existente de AQUILA.

---

## 425. AEL CORE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

AEL CORE

Responsabilidad:

```text
types
values
AST
IR
diagnostics
source spans
semantic primitives
```

No depende de:

```text
Nuxt
Vue
Supabase
PostgreSQL
HTTP
Pinia
```

---

## 426. CORE STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CORE STRUCTURE

```text
ael-core/
├── src/
│   ├── values/
│   ├── types/
│   ├── ast/
│   ├── ir/
│   ├── diagnostics/
│   ├── source/
│   └── index.ts
└── tests/
```

---

## 427. VALUE MODULE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

VALUE MODULE

Debe contener:

```text
AELValue
NullValue
BooleanValue
NumberValue
StringValue
MoneyValue
QuantityValue
DateValue
DateTimeValue
DurationValue
```

según alcance V1.

---

## 428. TYPE MODULE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

TYPE MODULE

Debe contener:

```text
AELType
PrimitiveType
MoneyType
QuantityType
NullableType
ListType
RecordType
```

si forman parte de V1.

---

## 429. AST MODULE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

AST MODULE

Debe contener:

```text
Program
Expression
Literal
Identifier
ContractRef
FunctionCall
BinaryExpression
UnaryExpression
ConditionalExpression
ReturnStatement
DefinitionStatement
```

según gramática definitiva.

---

## 430. DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DIAGNOSTICS

```text
Diagnostic
DiagnosticSeverity
DiagnosticCode
SourceSpan
```

---

## 431. COMPILER PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

COMPILER PACKAGE

Responsabilidad:

```text
lexing
parsing
semantic analysis
IR generation
artifact compilation
```

---

## 432. COMPILER STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

COMPILER STRUCTURE

```text
ael-compiler/
├── src/
│   ├── lexer/
│   ├── parser/
│   ├── analyzer/
│   ├── ir/
│   ├── compiler/
│   └── index.ts
└── tests/
```

---

## 433. LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

LEXER

Debe convertir:

```text
source
```

en:

```text
tokens
```

---

## 434. PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PARSER

Debe convertir:

```text
tokens
```

en:

```text
AST
```

---

## 435. ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

ANALYZER

Debe validar:

```text
names
types
dimensions
contracts
functions
capabilities
```

---

## 436. COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

COMPILER

Debe producir:

```text
Artifact
```

a partir de AST/IR validado.

---

## 437. RUNTIME PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RUNTIME PACKAGE

Responsabilidad:

```text
execution
evaluation
limits
context
errors
```

---

## 438. RUNTIME STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RUNTIME STRUCTURE

```text
ael-runtime/
├── src/
│   ├── engine/
│   ├── context/
│   ├── providers/
│   ├── limits/
│   ├── errors/
│   └── index.ts
└── tests/
```

---

## 439. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

EXECUTION CONTEXT

Debe contener:

```text
tenant
actor
rule
version
artifact
capabilities
providers
limits
correlation
```

---

## 440. PROVIDER PORT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PROVIDER PORT

Runtime depende de interfaces:

```ts
ContractProvider
FunctionProvider
```

o equivalentes definidos previamente.

---

## 441. NO DATABASE IMPORT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

NO DATABASE IMPORT

Runtime no debe importar:

```text
Supabase client
Postgres client
Prisma
Drizzle
SQL
```

---

## 442. CONTRACTS PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CONTRACTS PACKAGE

Responsabilidad:

```text
Contract definitions
schemas
registry
provider interfaces
```

---

## 443. CONTRACT STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CONTRACT STRUCTURE

```text
ael-contracts/
├── src/
│   ├── definitions/
│   ├── registry/
│   ├── providers/
│   └── index.ts
└── tests/
```

---

## 444. APPLICATION PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

APPLICATION PACKAGE

Responsabilidad:

```text
commands
queries
services
authorization ports
repository ports
transaction ports
```

---

## 445. APPLICATION STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

APPLICATION STRUCTURE

```text
ael-application/
├── src/
│   ├── rules/
│   ├── validation/
│   ├── compilation/
│   ├── publication/
│   ├── execution/
│   ├── tests/
│   ├── artifacts/
│   ├── audit/
│   ├── ports/
│   └── index.ts
└── tests/
```

---

## 446. INFRASTRUCTURE PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

INFRASTRUCTURE PACKAGE

Responsabilidad:

```text
PostgreSQL
Supabase
Storage
Queue
repositories
providers
```

---

## 447. INFRASTRUCTURE STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

INFRASTRUCTURE STRUCTURE

```text
ael-infrastructure/
├── src/
│   ├── postgres/
│   ├── repositories/
│   ├── providers/
│   ├── storage/
│   ├── queue/
│   ├── transactions/
│   └── index.ts
└── tests/
```

---

## 448. API PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

API PACKAGE

Responsabilidad:

```text
HTTP
DTOs
controllers
route handlers
error mapping
OpenAPI
```

---

## 449. API STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

API STRUCTURE

```text
ael-api/
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── dto/
│   ├── mappers/
│   ├── errors/
│   ├── middleware/
│   └── index.ts
└── tests/
```

---

## 450. UI PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

UI PACKAGE

Responsabilidad:

```text
Vue components
workspace
stores
composables
API client
```

---

## 451. UI STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

UI STRUCTURE

```text
ael-ui/
├── components/
├── composables/
├── stores/
├── services/
├── types/
└── index.ts
```

---

## 452. TESTKIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

TESTKIT

Crear fixtures reutilizables:

```text
AEL source fixtures
Contract fixtures
Provider fakes
Artifact fixtures
Execution contexts
```

---

## 453. TESTKIT STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

TESTKIT STRUCTURE

```text
ael-testkit/
├── src/
│   ├── fixtures/
│   ├── fakes/
│   ├── builders/
│   └── assertions/
└── tests/
```

---

## 454. DATABASE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DATABASE

Si AQUILA utiliza Supabase:

```text
supabase/
├── migrations/
├── seed.sql
└── functions/
```

según estructura vigente.

---

## 455. MIGRATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

MIGRATIONS

Orden:

```text
001_ael_rules
002_ael_rule_versions
003_ael_artifacts
004_ael_dependencies
005_ael_contracts
006_ael_functions
007_ael_executions
008_ael_execution_results
009_ael_audit
010_ael_indexes_rls
```

Los nombres definitivos deben seguir la numeración real del proyecto.

---

## 456. RULE MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RULE MIGRATION

Crear:

```text
ael_rules
```

con:

```text
id
tenant_id
code
name
description
status
created_at
created_by
updated_at
updated_by
```

---

## 457. RULE VERSION MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RULE VERSION MIGRATION

Crear:

```text
ael_rule_versions
```

con:

```text
id
rule_id
version
source
language_version
compiler_version
status
created_at
created_by
```

---

## 458. ARTIFACT MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

ARTIFACT MIGRATION

Crear metadata:

```text
ael_artifacts
```

con:

```text
id
rule_version_id
format_version
hash
storage_location
size_bytes
created_at
```

---

## 459. DEPENDENCY MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DEPENDENCY MIGRATION

Crear:

```text
ael_rule_dependencies
```

con:

```text
rule_version_id
dependency_type
dependency_code
dependency_version
```

---

## 460. CONTRACT MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CONTRACT MIGRATION

Crear:

```text
ael_contracts
```

para metadata global si AQUILA requiere persistirla.

---

## 461. FUNCTION MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FUNCTION MIGRATION

Crear:

```text
ael_functions
```

sólo si la administración dinámica de metadata lo requiere.

---

## 462. EXECUTION MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

EXECUTION MIGRATION

Crear:

```text
ael_executions
```

con:

```text
id
tenant_id
rule_id
rule_version_id
artifact_hash
status
mode
actor_id
started_at
completed_at
duration_ms
error_code
runtime_version
correlation_id
```

---

## 463. RESULT MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RESULT MIGRATION

Crear:

```text
ael_execution_results
```

con estructura compatible con resultados tipados.

---

## 464. AUDIT MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

AUDIT MIGRATION

Crear:

```text
ael_audit_events
```

append-only.

---

## 465. RLS MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RLS MIGRATION

Activar:

```sql
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
```

para tablas tenant-owned.

---

## 466. RLS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RLS TEST

Crear tests automatizados de:

```text
SELECT
INSERT
UPDATE
DELETE
```

cross-tenant.

---

## 467. SEEDS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SEEDS

Seeds sólo para:

```text
global Contracts
global Functions metadata
test fixtures
```

Nunca datos productivos.

---

## 468. APPLICATION PORTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

APPLICATION PORTS

Definir interfaces:

```text
RuleRepository
RuleVersionRepository
ArtifactRepository
ExecutionRepository
AuditRepository
TransactionManager
AuthorizationService
```

---

## 469. INFRASTRUCTURE ADAPTERS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

INFRASTRUCTURE ADAPTERS

Implementar:

```text
PostgresRuleRepository
PostgresRuleVersionRepository
PostgresArtifactRepository
PostgresExecutionRepository
PostgresAuditRepository
```

---

## 470. PROVIDER ADAPTERS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PROVIDER ADAPTERS

Implementar:

```text
AquilaContractProvider
AquilaFunctionProvider
SnapshotContractProvider
```

según alcance.

---

## 471. COMPOSITION ROOT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

COMPOSITION ROOT

Crear un único lugar donde se conecten:

```text
repositories
providers
services
runtime
compiler
queue
```

---

## 472. NO SERVICE LOCATOR

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

NO SERVICE LOCATOR

Evitar:

```text
globalContainer.get(...)
```

como patrón indiscriminado.

Preferir dependency injection explícita.

---

## 473. API COMPOSITION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

API COMPOSITION

La API debe construir:

```text
Application Services
```

con dependencias reales.

---

## 474. WORKER COMPOSITION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

WORKER COMPOSITION

El Worker debe construir:

```text
ExecutionService
Runtime
Repositories
Providers
Queue adapter
```

---

## 475. FRONTEND COMPOSITION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FRONTEND COMPOSITION

Nuxt debe consumir:

```text
AEL API
```

mediante cliente HTTP tipado.

---

## 476. IMPLEMENTATION PHASE 1

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 1

Nombre:

```text
AEL-CORE-FOUNDATION
```

Implementar:

```text
Value model
Type model
Diagnostics
Source spans
```

---

## 477. PHASE 1 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 1 EXIT

```text
✓ Money exact
✓ Quantity dimensional
✓ Null semantics
✓ Diagnostics
✓ tests
```

---

## 478. IMPLEMENTATION PHASE 2

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 2

Nombre:

```text
AEL-COMPILER
```

Implementar:

```text
Lexer
Parser
AST
Analyzer
IR
```

---

## 479. PHASE 2 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 2 EXIT

Debe compilar:

```text
canonical examples
```

y producir diagnostics determinísticos.

---

## 480. IMPLEMENTATION PHASE 3

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 3

Nombre:

```text
AEL-ARTIFACT
```

Implementar:

```text
Artifact format
serialization
hash
verification
```

---

## 481. PHASE 3 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 3 EXIT

Debe cumplirse:

```text
source
→ compile
→ artifact
→ deserialize
→ verify
```

---

## 482. IMPLEMENTATION PHASE 4

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 4

Nombre:

```text
AEL-RUNTIME
```

Implementar:

```text
ExecutionContext
Runtime
ContractProvider
FunctionProvider
limits
```

---

## 483. PHASE 4 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 4 EXIT

Debe ejecutarse:

```text
canonical Artifact
```

contra:

```text
fake Providers
```

sin PostgreSQL.

---

## 484. IMPLEMENTATION PHASE 5

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 5

Nombre:

```text
AEL-CONTRACTS
```

Implementar:

```text
ContractRegistry
FunctionRegistry
CapabilityPolicy
```

---

## 485. PHASE 5 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 5 EXIT

Debe validar:

```text
unknown Contract
unknown Function
missing capability
```

---

## 486. IMPLEMENTATION PHASE 6

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 6

Nombre:

```text
AEL-PERSISTENCE
```

Implementar:

```text
migrations
repositories
RLS
storage adapter
transactions
```

---

## 487. PHASE 6 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 6 EXIT

Debe pasar:

```text
repository integration tests
RLS tests
transaction tests
```

---

## 488. IMPLEMENTATION PHASE 7

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 7

Nombre:

```text
AEL-APPLICATION
```

Implementar:

```text
RuleService
ValidationService
CompilationService
PublicationService
ExecutionService
TestService
```

---

## 489. PHASE 7 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 7 EXIT

Flujo:

```text
create
→ edit
→ validate
→ compile
→ publish
→ execute
```

funcionando sin UI.

---

## 490. IMPLEMENTATION PHASE 8

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 8

Nombre:

```text
AEL-API
```

Implementar:

```text
routes
controllers
DTOs
OpenAPI
authorization
idempotency
```

---

## 491. PHASE 8 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 8 EXIT

API E2E:

```text
create rule
validate
publish
execute
```

---

## 492. IMPLEMENTATION PHASE 9

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 9

Nombre:

```text
AEL-WORKER
```

Implementar:

```text
queue
job
claim
retry
timeout
dead letter
```

---

## 493. PHASE 9 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 9 EXIT

Una ejecución async debe recorrer:

```text
QUEUED
→ RUNNING
→ COMPLETED
```

---

## 494. IMPLEMENTATION PHASE 10

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 10

Nombre:

```text
AEL-UI
```

Implementar:

```text
Rule list
Workspace
Editor
Diagnostics
Tests
Simulation
Publication
Execution history
```

---

## 495. PHASE 10 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 10 EXIT

Completar canonical user journey.

---

## 496. IMPLEMENTATION PHASE 11

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION PHASE 11

Nombre:

```text
AEL-PRODUCTION
```

Implementar:

```text
CI/CD
monitoring
health checks
alerts
backup
restore
rollback
```

---

## 497. PHASE 11 EXIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PHASE 11 EXIT

Production smoke test:

```text
validate
publish
execute
verify
audit
```

---

## 498. TEST PYRAMID

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

TEST PYRAMID

```text
             E2E
            /   \
       Integration
          /     \
        Unit     Security
```

La mayoría de tests deben ser:

```text
unit
```

---

## 499. CORE UNIT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CORE UNIT TESTS

Cobertura de:

```text
values
operators
types
dimensions
null
AST
diagnostics
```

---

## 500. COMPILER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

COMPILER TESTS

Golden tests:

```text
source
→ expected AST
→ expected diagnostics
→ expected IR
```

---

## 501. ARTIFACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

ARTIFACT TESTS

Probar:

```text
serialize
deserialize
hash
tampering
compatibility
```

---

## 502. RUNTIME TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RUNTIME TESTS

Probar:

```text
arithmetic
money
quantity
null
conditions
functions
limits
errors
```

---

## 503. PROPERTY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PROPERTY TESTS

Para operaciones matemáticas críticas considerar:

```text
property-based testing
```

---

## 504. SNAPSHOT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SNAPSHOT TESTS

Útiles para:

```text
diagnostics
AST
IR
API DTO
```

pero evitar depender exclusivamente de snapshots.

---

## 505. INTEGRATION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

INTEGRATION TESTS

Usar PostgreSQL real/test.

No simular RLS con mocks.

---

## 506. API TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

API TESTS

Validar:

```text
status
payload
auth
tenant
errors
idempotency
```

---

## 507. UI TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

UI TESTS

Probar:

```text
editor
diagnostics
publish
execution
```

---

## 508. E2E

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

E2E

Canonical journey:

```text
create
→ validate
→ test
→ publish
→ execute
→ history
```

---

## 509. SECURITY TEST MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SECURITY TEST MATRIX

```text
Tenant isolation
Capability enforcement
Artifact integrity
Sandbox limits
API authorization
RLS
Secrets exposure
```

---

## 510. GOLDEN RULES

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

GOLDEN RULES

Mantener un conjunto pequeño de reglas canónicas:

```text
basic arithmetic
money
quantity
conditional
nullable
function
contract
```

---

## 511. CANONICAL FINANCIAL RULE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CANONICAL FINANCIAL RULE

```text
DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

---

## 512. GOLDEN RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

GOLDEN RESULT

Con fixtures determinados:

```text
542250 COP
```

---

## 513. DETERMINISM TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DETERMINISM TEST

Mismo:

```text
Artifact
context
providers
runtime
```

debe producir:

```text
same result
```

---

## 514. NON-DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

NON-DETERMINISM

Si una Function es deliberadamente no determinista:

```text
must be explicitly modeled
```

No introducirlo accidentalmente.

---

## 515. CONTRACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CONTRACT TESTS

Cada Provider debe demostrar:

```text
signature compatibility
type compatibility
error behavior
capability behavior
```

---

## 516. FUNCTION CONTRACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FUNCTION CONTRACT TESTS

Cada Function debe probar:

```text
valid input
invalid input
null input
boundary values
error behavior
```

---

## 517. MIGRATION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

MIGRATION TESTS

CI debe ejecutar migrations desde:

```text
empty DB
```

hasta:

```text
latest schema
```

---

## 518. MIGRATION REPEATABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

MIGRATION REPEATABILITY

No ejecutar una migration dos veces si el framework no lo soporta.

---

## 519. SEED TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SEED TEST

Seeds deben producir un entorno consistente.

---

## 520. API CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

API CONTRACT TEST

OpenAPI debe permanecer sincronizado con implementation.

---

## 521. FRONTEND CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FRONTEND CONTRACT TEST

El frontend debe detectar breaking API changes antes de producción.

---

## 522. PARALLEL WORK

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PARALLEL WORK

Una vez estabilizado Core:

```text
Compiler
Runtime
Persistence
```

pueden avanzar parcialmente en paralelo.

Pero sus contratos deben permanecer congelados.

---

## 523. BRANCH STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

BRANCH STRATEGY

Preferir branches pequeños:

```text
feature/ael-values
feature/ael-parser
feature/ael-runtime
feature/ael-persistence
feature/ael-api
feature/ael-ui
```

---

## 524. COMMIT STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

COMMIT STRATEGY

Commits pequeños y semánticos:

```text
feat(ael): add money value
feat(ael): add quantity type
feat(ael): add parser
fix(ael): reject incompatible dimensions
```

---

## 525. PULL REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PULL REQUEST

Cada PR debe indicar:

```text
problem
solution
tests
architecture impact
migration impact
security impact
```

---

## 526. CODE REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CODE REVIEW

Reviewers deben verificar:

```text
core independence
tenant safety
immutability
precision
error handling
tests
```

---

## 527. DEFINITION OF DONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DEFINITION OF DONE

Una funcionalidad AEL no está terminada hasta tener:

```text
implementation
tests
documentation
security review
observability
```

cuando corresponda.

---

## 528. NO BIG BANG

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

NO BIG BANG

No implementar:

```text
todo AEL
```

en una única rama gigantesca.

---

## 529. VERTICAL SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

VERTICAL SLICE

Primer vertical slice:

```text
Rule
 ↓
Source
 ↓
Compile
 ↓
Artifact
 ↓
Fake Provider
 ↓
Runtime
 ↓
Result
```

---

## 530. FIRST DEMO

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FIRST DEMO

La primera demo técnica debe ejecutar:

```text
area × tarifa
```

y retornar:

```text
Money<COP>
```

---

## 531. SECOND SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SECOND SLICE

Agregar:

```text
PostgreSQL
```

para cargar:

```text
Property Area
Parameter Rate
```

---

## 532. THIRD SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

THIRD SLICE

Agregar:

```text
API
```

para ejecutar la Rule.

---

## 533. FOURTH SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FOURTH SLICE

Agregar:

```text
UI
```

para editar y ejecutar.

---

## 534. FIFTH SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FIFTH SLICE

Agregar:

```text
Publication
Versioning
Audit
```

---

## 535. SIXTH SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SIXTH SLICE

Agregar:

```text
Async Worker
```

---

## 536. SEVENTH SLICE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SEVENTH SLICE

Agregar:

```text
Production hardening
```

---

## 537. FIRST PRODUCTION CANDIDATE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FIRST PRODUCTION CANDIDATE

Debe incluir:

```text
Core
Compiler
Artifact
Runtime
Contracts
Persistence
Application
API
UI
Worker
Security
Observability
```

---

## 538. EXCLUSIONES V1

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

EXCLUSIONES V1

No implementar inicialmente salvo requerimiento explícito:

```text
distributed execution
arbitrary user code
plugin marketplace
dynamic compiler extensions
cross-tenant rules
uncontrolled network access
automatic mass publication
```

---

## 539. TECHNICAL DEBT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

TECHNICAL DEBT POLICY

Todo shortcut debe registrarse como:

```text
technical debt
```

con:

```text
reason
impact
owner
future action
```

---

## 540. ARCHITECTURE DECISION RECORDS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

ARCHITECTURE DECISION RECORDS

Decisiones críticas deben registrarse:

```text
ADR
```

Ejemplos:

```text
ADR-001 Artifact format
ADR-002 Decimal representation
ADR-003 RLS strategy
ADR-004 Worker queue
ADR-005 Versioning
```

---

## 541. DOCUMENTATION STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DOCUMENTATION STRUCTURE

```text
docs/
└── ael/
    ├── architecture/
    ├── language/
    ├── runtime/
    ├── api/
    ├── operations/
    └── implementation/
```

---

## 542. DOCUMENT SOURCE OF TRUTH

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

DOCUMENT SOURCE OF TRUTH

La especificación oficial debe estar versionada junto al código.

---

## 543. GENERATED DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

GENERATED DOCUMENTATION

OpenAPI y documentación generada no deben reemplazar:

```text
architectural documentation
```

---

## 544. REPOSITORY OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

REPOSITORY OWNERSHIP

Definir owners para:

```text
Core
Compiler
Runtime
Persistence
API
UI
Operations
```

---

## 545. CODEOWNERS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CODEOWNERS

Si GitHub se utiliza:

```text
CODEOWNERS
```

puede proteger módulos críticos.

---

## 546. RELEASE GATES

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

RELEASE GATES

No liberar si falla:

```text
typecheck
unit
integration
security
build
smoke
```

---

## 547. QUALITY GATE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

QUALITY GATE

Para Rules financieras críticas:

```text
golden tests
determinism
precision
audit
```

son obligatorios.

---

## 548. PERFORMANCE BASELINE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PERFORMANCE BASELINE

Medir:

```text
parse time
compile time
execution time
provider latency
DB latency
API latency
```

---

## 549. BENCHMARKS

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

BENCHMARKS

Crear benchmark para:

```text
simple rule
medium rule
large rule
many provider calls
```

---

## 550. REGRESSION BASELINE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

REGRESSION BASELINE

Guardar baseline:

```text
execution p50
execution p95
compile p50
compile p95
```

---

## 551. PERFORMANCE REGRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

PERFORMANCE REGRESSION

CI puede alertar cuando una modificación supere umbrales definidos.

---

## 552. MEMORY

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

MEMORY

Medir:

```text
heap
artifact size
AST size
IR size
execution memory
```

---

## 553. LIMITS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

LIMITS TEST

Probar límites:

```text
max source
max AST depth
max instructions
max execution time
max provider calls
```

---

## 554. FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FUZZING

Parser y lexer son candidatos a:

```text
fuzz testing
```

---

## 555. SECURITY FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SECURITY FUZZING

Probar entradas malformadas:

```text
deep nesting
huge literals
invalid UTF-8
unexpected tokens
```

según parser/runtime.

---

## 556. FINAL REPOSITORY SHAPE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FINAL REPOSITORY SHAPE

```text
AQUILA/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
│
├── packages/
│   ├── ael-core/
│   ├── ael-compiler/
│   ├── ael-runtime/
│   ├── ael-contracts/
│   ├── ael-application/
│   ├── ael-infrastructure/
│   ├── ael-api/
│   ├── ael-ui/
│   └── ael-testkit/
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── functions/
│
├── tests/
│   ├── e2e/
│   ├── integration/
│   └── security/
│
└── docs/
    └── ael/
```

---

## 557. FIRST IMPLEMENTATION COMMIT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FIRST IMPLEMENTATION COMMIT

El primer commit funcional debe ser pequeño:

```text
feat(ael): establish core value model
```

No comenzar con:

```text
feat(ael): implement complete language
```

---

## 558. FIRST MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FIRST MILESTONE

```text
AEL-CORE-FOUNDATION
```

Definition of Done:

```text
Money
Quantity
Null
Primitive types
Diagnostics
tests
```

---

## 559. SECOND MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SECOND MILESTONE

```text
AEL-COMPILER-MVP
```

Definition of Done:

```text
lexer
parser
AST
analyzer
IR
canonical examples
```

---

## 560. THIRD MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

THIRD MILESTONE

```text
AEL-RUNTIME-MVP
```

Definition of Done:

```text
Artifact
Runtime
Fake Provider
canonical execution
```

---

## 561. FOURTH MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FOURTH MILESTONE

```text
AEL-AQUILA-MVP
```

Definition of Done:

```text
PostgreSQL
RLS
Provider
API
Rule
Execution
```

---

## 562. FIFTH MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

FIFTH MILESTONE

```text
AEL-WORKSPACE-MVP
```

Definition of Done:

```text
UI
Editor
Diagnostics
Test
Publish
Execute
```

---

## 563. SIXTH MILESTONE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

SIXTH MILESTONE

```text
AEL-PRODUCTION-READY
```

Definition of Done:

```text
Worker
CI/CD
Observability
Security
Backup
Restore
Rollback
```

---

## 564. MASTER IMPLEMENTATION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

MASTER IMPLEMENTATION FLOW

```text
                         AEL V1
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
          CORE                        AQUILA
             │                           │
      ┌──────┼──────┐             ┌──────┼──────┐
      ▼      ▼      ▼             ▼      ▼      ▼
    Types   AST   Diagnostics   DB     API      UI
             │                     │      │       │
             ▼                     └──────┼───────┘
         Compiler                         ▼
             │                         Worker
             ▼                           │
          Artifact                       ▼
             │                         Runtime
             └──────────────┬────────────┘
                            ▼
                         Production
```

---

## 565. CRITICAL ARCHITECTURAL RULES

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CRITICAL ARCHITECTURAL RULES

Nunca romper:

```text
1. Core no depende de infrastructure.
2. Runtime no depende de database.
3. UI no es autoridad.
4. Client no controla tenant.
5. Artifact publicado es inmutable.
6. RuleVersion publicada es inmutable.
7. Money usa precisión exacta.
8. Quantity respeta dimensiones.
9. Capabilities son explícitas.
10. RLS protege tenant data.
11. Historical execution permanece reproducible.
12. Production no ejecuta Draft arbitrariamente.
13. Retry no duplica ejecución.
14. Secrets nunca llegan al frontend.
15. Infrastructure es reemplazable.
```

---

## 566. IMPLEMENTATION CHECKPOINT

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

IMPLEMENTATION CHECKPOINT

Antes de pasar a producción verificar:

```text
[ ] Core independent
[ ] Compiler deterministic
[ ] Artifact immutable
[ ] Runtime deterministic
[ ] Providers authorized
[ ] RLS verified
[ ] Application services tested
[ ] API secured
[ ] UI integrated
[ ] Worker idempotent
[ ] Observability active
[ ] Backup tested
[ ] Rollback tested
```

---

## 567. CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Implementation_Blueprint_Repositorio 23.md

CIERRE

Este documento convierte los documentos anteriores en una ruta ejecutable.

La arquitectura ya no debe seguir creciendo sin una necesidad concreta.

La prioridad pasa a ser:

```text
IMPLEMENTAR
↓
PROBAR
↓
INTEGRAR
↓
MEDIR
↓
CORREGIR
↓
LIBERAR
```

El siguiente paso ya puede ser práctico: comenzar por el **AEL-CORE-FOUNDATION**, crear los paquetes reales y producir el primer código compilable del lenguaje.

> **A partir del Documento 23, AEL deja de ser principalmente una especificación arquitectónica y pasa a una fase de construcción controlada.**

---

# FIN DEL DOCUMENTO 23

## AEL V1 — Implementation Blueprint del Repositorio

## 568. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

OBJETIVO

Implementar el fundamento del lenguaje:

```text
AELValue
AELType
Money
Quantity
Null
Primitive values
Diagnostics
Source spans
```

Esta capa será utilizada posteriormente por:

```text
AST
Analyzer
IR
Artifact
Runtime
API
Tests
```

---

## 569. DEPENDENCIAS PERMITIDAS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DEPENDENCIAS PERMITIDAS

AEL Core no debe depender de:

```text
Vue
Nuxt
Supabase
PostgreSQL
Prisma
Drizzle
HTTP
Pinia
filesystem
network
environment variables
```

Puede depender únicamente de librerías pequeñas y deterministas estrictamente necesarias.

---

## 570. ESTRUCTURA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ESTRUCTURA

```text
packages/ael-core/

src/
├── values/
├── types/
├── diagnostics/
├── source/
├── errors/
└── index.ts

tests/
├── values/
├── types/
├── diagnostics/
└── invariants/
```

---

## 571. VALUE MODEL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

VALUE MODEL

Todo valor ejecutable debe implementar una representación semántica:

```ts
AELValue
```

---

## 572. AEL VALUE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

AEL VALUE

Conceptualmente:

```ts
interface AELValue {
  readonly type: AELType
}
```

La representación concreta puede utilizar discriminated unions.

---

## 573. DISCRIMINATED UNION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DISCRIMINATED UNION

Preferir:

```ts
type: 'NULL'
type: 'BOOLEAN'
type: 'NUMBER'
type: 'STRING'
type: 'MONEY'
type: 'QUANTITY'
```

sobre comprobar tipos mediante:

```text
instanceof
```

cuando sea posible.

---

## 574. PRIMITIVE VALUES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

PRIMITIVE VALUES

V1 debe soportar como mínimo:

```text
Null
Boolean
Number
String
Money
Quantity
```

Date/DateTime pueden incorporarse si forman parte de la gramática V1 definitiva.

---

## 575. NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NUMBER

El significado de Number debe definirse explícitamente.

No utilizar JavaScript `number` sin una política de precisión.

---

## 576. EXACT DECIMAL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

EXACT DECIMAL

Para operaciones financieras:

```text
Money
```

debe utilizar representación decimal exacta.

Opciones:

```text
decimal library
BigInt scaled integer
canonical decimal
```

La decisión de implementación debe quedar encapsulada.

---

## 577. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY

Money siempre contiene:

```text
amount
currency
```

---

## 578. MONEY TYPE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY TYPE

Conceptualmente:

```ts
interface MoneyValue {
  readonly type: 'MONEY'
  readonly amount: Decimal
  readonly currency: CurrencyCode
}
```

---

## 579. CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CURRENCY

Currency debe utilizar un código explícito:

```text
COP
USD
EUR
```

Preferir códigos ISO 4217 cuando sean aplicables.

---

## 580. MONEY WITHOUT CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY WITHOUT CURRENCY

Prohibido:

```text
Money(1000)
```

Debe ser:

```text
Money(1000, "COP")
```

---

## 581. MONEY ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY ADDITION

Permitido:

```text
COP + COP
```

No permitido:

```text
COP + USD
```

sin una operación explícita de conversión.

---

## 582. MONEY SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY SUBTRACTION

Misma regla:

```text
COP - COP
```

válido.

```text
COP - USD
```

inválido.

---

## 583. MONEY × NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md; Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY × NUMBER

Permitido:

```text
Money × Number
```

Resultado:

```text
Money
```

---

## 584. NUMBER × MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NUMBER × MONEY

Debe producir el mismo resultado semántico:

```text
Number × Money
```

---

## 585. MONEY × MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY × MONEY

No permitido en V1.

---

## 586. MONEY ÷ MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY ÷ MONEY

No permitido como operación genérica.

Si se necesita un ratio financiero, debe modelarse explícitamente.

---

## 587. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY

Quantity representa:

```text
valor + unidad + dimensión
```

---

## 588. QUANTITY TYPE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY TYPE

Conceptualmente:

```ts
interface QuantityValue {
  readonly type: 'QUANTITY'
  readonly value: Decimal
  readonly unit: UnitCode
  readonly dimension: Dimension
}
```

---

## 589. DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION

Ejemplos:

```text
AREA
LENGTH
MASS
TIME
VOLUME
RATE
```

La lista definitiva dependerá del dominio de AQUILA.

---

## 590. UNIT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT

Ejemplos:

```text
M2
M
KG
H
```

---

## 591. UNIT ≠ DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT ≠ DIMENSION

No confundir:

```text
M2
```

con:

```text
AREA
```

La unidad representa la medida concreta.

La dimensión representa la categoría física/semántica.

---

## 592. QUANTITY ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY ADDITION

Permitido cuando:

```text
same dimension
compatible units
```

Ejemplo:

```text
10 M2 + 5 M2
```

---

## 593. QUANTITY SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY SUBTRACTION

Misma regla de compatibilidad.

---

## 594. QUANTITY MULTIPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY MULTIPLICATION

Ejemplo:

```text
M2 × COP/M2
```

puede producir:

```text
COP
```

La dimensión resultante debe calcularse mediante algebra dimensional.

---

## 595. DIMENSION ALGEBRA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION ALGEBRA

Conceptualmente:

```text
AREA × MONEY/AREA = MONEY
```

---

## 596. DIMENSION CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION CANCELLATION

Ejemplo:

```text
M2 / M2 = dimensionless
```

---

## 597. UNIT CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT CONVERSION

No asumir que:

```text
M2
```

es intercambiable con otra unidad sólo por tener la misma dimensión.

Debe existir conversión explícita si aplica.

---

## 598. CONVERSION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CONVERSION SERVICE

El Core puede definir una abstracción:

```ts
interface UnitConverter {
  canConvert(from: UnitCode, to: UnitCode): boolean
  convert(value: Decimal, from: UnitCode, to: UnitCode): Decimal
}
```

pero la implementación concreta debe quedar fuera del Core si requiere configuración externa.

---

## 599. NULL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULL

Null es un valor semántico.

No utilizar:

```text
undefined
```

como Null de AEL.

---

## 600. NULL TYPE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULL TYPE

```ts
type: 'NULL'
```

---

## 601. NULL PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULL PROPAGATION

Debe definirse explícitamente por operador.

No permitir comportamiento accidental de JavaScript.

---

## 602. EQUALITY WITH NULL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

EQUALITY WITH NULL

La semántica exacta debe ser definida por el lenguaje.

Recomendación V1:

```text
NULL == NULL → true
NULL == value → false
```

si se decide por igualdad total.

Si se adopta lógica ternaria, debe formalizarse antes de implementar.

---

## 603. BOOLEAN

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

BOOLEAN

```ts
type: 'BOOLEAN'
value: boolean
```

---

## 604. STRING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

STRING

```ts
type: 'STRING'
value: string
```

---

## 605. BOOLEAN OPERATORS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

BOOLEAN OPERATORS

```text
AND
OR
NOT
```

Sólo aceptan operandos booleanos salvo reglas explícitas de coerción.

---

## 606. NO IMPLICIT TRUTHINESS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NO IMPLICIT TRUTHINESS

No convertir automáticamente:

```text
0
""
NULL
```

a:

```text
false
```

---

## 607. NUMBER COERCION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NUMBER COERCION

No convertir automáticamente:

```text
STRING → NUMBER
```

en operaciones matemáticas.

---

## 608. STRING COERCION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

STRING COERCION

No convertir automáticamente:

```text
NUMBER → STRING
```

en concatenaciones si el lenguaje no lo declara explícitamente.

---

## 609. TYPE SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE SAFETY

El sistema debe preferir:

```text
error explícito
```

sobre:

```text
coerción silenciosa
```

---

## 610. TYPE DESCRIPTOR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE DESCRIPTOR

Cada tipo debe poder describirse:

```ts
interface AELType {
  readonly kind: AELTypeKind
}
```

---

## 611. TYPE KINDS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE KINDS

Mínimo:

```text
NULL
BOOLEAN
NUMBER
STRING
MONEY
QUANTITY
```

---

## 612. MONEY TYPE IDENTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY TYPE IDENTITY

Money no es simplemente:

```text
NUMBER
```

Debe conservar:

```text
currency
```

---

## 613. QUANTITY TYPE IDENTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY TYPE IDENTITY

Quantity no es simplemente:

```text
NUMBER
```

Debe conservar:

```text
unit
dimension
```

---

## 614. TYPE EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE EQUALITY

Dos Money Types son iguales si:

```text
currency equal
```

Dos Quantity Types son compatibles si:

```text
dimension compatible
unit conversion available
```

según la operación.

---

## 615. NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULLABILITY

Un valor nullable puede modelarse como:

```text
Nullable<T>
```

si el type system lo requiere.

---

## 616. NULLABLE TYPE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULLABLE TYPE

Ejemplo:

```text
Nullable<Money<COP>>
```

---

## 617. NULLABLE QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULLABLE QUANTITY

Ejemplo:

```text
Nullable<Quantity<M2>>
```

---

## 618. TYPE COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE COMPATIBILITY

Distinguir:

```text
type equality
```

de:

```text
type compatibility
```

---

## 619. OPERATOR TABLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

OPERATOR TABLE

El Core debe tener una tabla explícita de compatibilidad.

Ejemplo:

```text
NUMBER + NUMBER → NUMBER
MONEY + MONEY → MONEY
QUANTITY + QUANTITY → QUANTITY
```

---

## 620. INVALID OPERATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

INVALID OPERATION

Una operación inválida debe producir:

```text
Diagnostic
```

en compile/analyze time cuando sea posible.

---

## 621. RUNTIME DEFENSE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

RUNTIME DEFENSE

El Runtime también debe verificar invariantes.

Nunca confiar exclusivamente en el Analyzer.

---

## 622. VALUE CONSTRUCTORS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

VALUE CONSTRUCTORS

Preferir constructores/factories validados:

```ts
MoneyValue.create(...)
QuantityValue.create(...)
```

---

## 623. IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

IMMUTABILITY

Los Values deben ser:

```text
immutable
```

---

## 624. NO MUTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NO MUTATION

No permitir:

```ts
money.amount = ...
```

---

## 625. OPERATIONS RETURN NEW VALUES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

OPERATIONS RETURN NEW VALUES

Ejemplo:

```text
a + b
```

produce:

```text
new MoneyValue
```

no modifica:

```text
a
b
```

---

## 626. DECIMAL NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DECIMAL NORMALIZATION

Definir representación canónica para:

```text
1
1.0
1.00
```

según comparación y serialización.

---

## 627. MONEY SCALE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY SCALE

No fijar una escala artificial demasiado pronto.

La semántica debe permitir:

```text
decimal exact
```

y la política de redondeo debe pertenecer a operaciones explícitas.

---

## 628. ROUNDING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ROUNDING

No redondear automáticamente cada operación.

Ejemplo:

```text
Money × Number
```

mantiene precisión interna.

La Function:

```text
ROUND_MONEY
```

puede aplicar una política explícita.

---

## 629. ROUNDING MODE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ROUNDING MODE

Debe poder representar modos:

```text
HALF_UP
HALF_EVEN
DOWN
UP
```

si el dominio los requiere.

---

## 630. CURRENCY CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CURRENCY CONVERSION

Debe ser explícita:

```text
CONVERT_MONEY(amount, "USD", "COP", rate)
```

o equivalente.

Nunca utilizar una tasa global implícita.

---

## 631. EXCHANGE RATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

EXCHANGE RATE

Una tasa debe tener semántica explícita:

```text
COP / USD
```

y no simplemente:

```text
1.0
```

---

## 632. DIMENSION REPRESENTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION REPRESENTATION

Una dimensión puede representarse como:

```text
map<baseDimension, exponent>
```

Ejemplo:

```text
AREA = { LENGTH: 2 }
```

---

## 633. DIMENSION MULTIPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION MULTIPLICATION

Sumar exponentes:

```text
L × L = L²
```

---

## 634. DIMENSION DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION DIVISION

Restar exponentes:

```text
L² / L = L
```

---

## 635. DIMENSION POWER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION POWER

Para potencias permitidas:

```text
L² ^ 2 = L⁴
```

---

## 636. DIMENSION SIMPLIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION SIMPLIFICATION

La representación debe normalizar:

```text
L² / L²
```

a:

```text
dimensionless
```

---

## 637. DIMENSIONLESS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSIONLESS

Representar explícitamente:

```text
DIMENSIONLESS
```

si se utiliza en V1.

---

## 638. UNIT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT REGISTRY

El Core puede consumir un:

```ts
UnitRegistry
```

abstracto.

---

## 639. UNIT REGISTRY PORT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT REGISTRY PORT

```ts
interface UnitRegistry {
  get(unit: UnitCode): UnitDefinition | null
}
```

---

## 640. UNIT DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT DEFINITION

Debe describir:

```text
code
dimension
conversion
```

sin contener datos de negocio de AQUILA.

---

## 641. MONEY CURRENCY REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY CURRENCY REGISTRY

Puede existir:

```ts
CurrencyRegistry
```

para validar códigos.

---

## 642. REGISTRY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

REGISTRY BOUNDARY

La definición física de:

```text
units
currencies
```

puede evolucionar sin modificar el Runtime.

---

## 643. DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIAGNOSTICS

Todo error de compilación debe utilizar:

```text
Diagnostic
```

---

## 644. DIAGNOSTIC STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIAGNOSTIC STRUCTURE

```ts
interface Diagnostic {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  message: string
  span?: SourceSpan
}
```

---

## 645. SEVERITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SEVERITY

```text
ERROR
WARNING
INFO
```

---

## 646. ERROR CODES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ERROR CODES

Códigos estables:

```text
AEL-TYPE-001
AEL-DIMENSION-001
AEL-CURRENCY-001
AEL-NULL-001
AEL-SYNTAX-001
```

---

## 647. CODE STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CODE STABILITY

No cambiar códigos arbitrariamente porque:

```text
UI
tests
documentation
```

pueden depender de ellos.

---

## 648. SOURCE SPAN

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SOURCE SPAN

Debe representar:

```text
start
end
```

---

## 649. OFFSET

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

OFFSET

Preferir offset basado en:

```text
UTF-16 code units
```

si el editor TypeScript/JavaScript trabaja directamente con strings JS.

Debe documentarse.

---

## 650. LINE/COLUMN

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

LINE/COLUMN

Las posiciones deben ser deterministas.

---

## 651. DIAGNOSTIC LOCATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIAGNOSTIC LOCATION

Debe señalar el fragmento mínimo razonable.

No marcar todo el archivo para un error local.

---

## 652. DIAGNOSTIC MESSAGE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIAGNOSTIC MESSAGE

Mensaje:

```text
human readable
```

pero el código es la identidad estable.

---

## 653. DIAGNOSTIC DATA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIAGNOSTIC DATA

Puede existir:

```ts
details
```

para información estructurada.

No depender exclusivamente del texto.

---

## 654. ERROR OBJECT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ERROR OBJECT

Runtime errors pueden compartir:

```text
DiagnosticCode
```

pero deben distinguirse de compile diagnostics.

---

## 655. CORE ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CORE ERRORS

Ejemplos:

```text
InvalidMoney
InvalidQuantity
InvalidUnit
InvalidCurrency
InvalidDimension
```

---

## 656. CONSTRUCTION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CONSTRUCTION VALIDATION

Factories deben rechazar:

```text
invalid currency
negative scale where invalid
invalid unit
NaN
Infinity
```

según semántica.

---

## 657. NUMBER SPECIAL VALUES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NUMBER SPECIAL VALUES

No permitir accidentalmente:

```text
NaN
Infinity
-Infinity
```

como valores AEL normales.

---

## 658. DECIMAL PARSING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DECIMAL PARSING

El parser del lenguaje debe producir decimal exacto cuando la literal sea decimal.

---

## 659. LITERAL PRESERVATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

LITERAL PRESERVATION

Evitar:

```text
"0.1" → JS number → 0.100000000000...
```

antes de construir Decimal.

---

## 660. STRING VALUE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

STRING VALUE

String debe ser Unicode-safe.

---

## 661. STRING COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

STRING COMPARISON

Definir si:

```text
case-sensitive
```

por defecto.

Recomendación:

```text
case-sensitive
```

para igualdad.

---

## 662. BOOLEAN EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

BOOLEAN EQUALITY

```text
true == true
```

válido.

```text
true == 1
```

inválido.

---

## 663. NUMBER EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NUMBER EQUALITY

Comparar semánticamente los valores exactos.

---

## 664. MONEY EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY EQUALITY

Debe requerir:

```text
same currency
same amount
```

---

## 665. QUANTITY EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY EQUALITY

Puede requerir conversión explícita o automática entre unidades compatibles.

La política debe ser consistente con el operador.

---

## 666. HASHING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

HASHING

Values pueden requerir hashing para:

```text
memoization
snapshot
tests
```

Debe ser estable.

---

## 667. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CANONICAL SERIALIZATION

Definir representación:

```text
type
value
metadata
```

para serialización.

---

## 668. MONEY SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY SERIALIZATION

Ejemplo:

```json
{
  "type": "MONEY",
  "amount": "542250",
  "currency": "COP"
}
```

---

## 669. QUANTITY SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY SERIALIZATION

Ejemplo:

```json
{
  "type": "QUANTITY",
  "value": "120.5",
  "unit": "M2",
  "dimension": "AREA"
}
```

---

## 670. NULL SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULL SERIALIZATION

```json
{
  "type": "NULL"
}
```

---

## 671. BOOLEAN SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

BOOLEAN SERIALIZATION

```json
{
  "type": "BOOLEAN",
  "value": true
}
```

---

## 672. NUMBER SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NUMBER SERIALIZATION

Representar según decimal canónico:

```json
{
  "type": "NUMBER",
  "value": "10.25"
}
```

---

## 673. STRING SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

STRING SERIALIZATION

```json
{
  "type": "STRING",
  "value": "AQUILA"
}
```

---

## 674. NO AMBIGUOUS JSON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NO AMBIGUOUS JSON

No serializar Money como:

```json
542250
```

porque pierde semántica.

---

## 675. TYPE DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE DISPLAY

Cada Value debe poder producir una descripción humana:

```text
Money<COP>
Quantity<M2>
Number
Boolean
```

---

## 676. DEBUG DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DEBUG DISPLAY

Debe existir una representación técnica:

```text
Money(amount=542250,currency=COP)
```

---

## 677. USER DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

USER DISPLAY

La UI puede transformar:

```text
Money<COP>
```

a:

```text
$542.250
```

según locale.

Core no debe depender de locale de UI.

---

## 678. LOCALE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

LOCALE

No almacenar:

```text
"$542.250"
```

como valor semántico.

---

## 679. PARSING USER DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

PARSING USER DISPLAY

No asumir que:

```text
$542.250
```

es un literal AEL válido.

---

## 680. VALUE COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

VALUE COMPARISON

Crear funciones internas:

```text
equals
compare
```

cuando sean semánticamente válidas.

---

## 681. ORDERING MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ORDERING MONEY

Sólo comparar Money con:

```text
same currency
```

o mediante conversión explícita.

---

## 682. ORDERING QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ORDERING QUANTITY

Comparar sólo si:

```text
compatible dimensions
```

y conversión válida.

---

## 683. ORDERING NULL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ORDERING NULL

Debe definirse explícitamente.

No utilizar:

```text
JavaScript null comparison
```

como semántica.

---

## 684. ARITHMETIC SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ARITHMETIC SERVICE

Puede existir un componente:

```ts
ValueOperations
```

para centralizar:

```text
add
subtract
multiply
divide
compare
```

---

## 685. OPERATOR CENTRALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

OPERATOR CENTRALIZATION

No duplicar reglas matemáticas entre:

```text
Analyzer
Runtime
UI
```

El Analyzer valida; Runtime ejecuta.

---

## 686. ANALYZER TABLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ANALYZER TABLE

El Analyzer consulta:

```text
OperatorSignatureRegistry
```

---

## 687. OPERATOR SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

OPERATOR SIGNATURE

Ejemplo:

```text
ADD:
Number × Number → Number
Money<C> × Money<C> → invalid
```

---

## 688. GENERIC CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

GENERIC CURRENCY

Puede modelarse conceptualmente:

```text
Money<C>
```

donde C es currency.

---

## 689. GENERIC QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

GENERIC QUANTITY

Conceptualmente:

```text
Quantity<D,U>
```

donde:

```text
D = dimension
U = unit
```

---

## 690. TYPE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE ERROR

Ejemplo:

```text
Money<COP> + Money<USD>
```

diagnostic:

```text
AEL-CURRENCY-001
Money values must use the same currency.
```

---

## 691. DIMENSION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION ERROR

Ejemplo:

```text
Quantity<M2> + Quantity<KG>
```

diagnostic:

```text
AEL-DIMENSION-001
Quantities have incompatible dimensions.
```

---

## 692. INVALID MULTIPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

INVALID MULTIPLICATION

Si el resultado dimensional no está soportado:

```text
AEL-DIMENSION-002
```

---

## 693. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIVISION BY ZERO

Runtime:

```text
AEL-MATH-001
```

---

## 694. INVALID ROUNDING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

INVALID ROUNDING

Si una Function recibe parámetros inválidos:

```text
AEL-FUNCTION-001
```

aunque Functions pertenecen a capas posteriores.

---

## 695. VALUE FACTORY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

VALUE FACTORY TESTS

Cada factory debe probar:

```text
valid input
invalid input
boundary
serialization
equality
```

---

## 696. MONEY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY TESTS

Casos:

```text
0 COP
1 COP
542250 COP
0.01 COP
negative Money
```

si negativos son permitidos.

---

## 697. NEGATIVE MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NEGATIVE MONEY

No prohibir automáticamente valores negativos.

El dominio puede requerir:

```text
refund
credit
adjustment
```

---

## 698. QUANTITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

QUANTITY TESTS

Casos:

```text
0 M2
120.5 M2
negative quantity
```

según dominio.

---

## 699. NEGATIVE QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NEGATIVE QUANTITY

No prohibir por defecto.

Una cantidad matemática puede ser negativa.

El dominio decide restricciones específicas.

---

## 700. NULL TESTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NULL TESTS

Probar:

```text
NULL
NULL comparisons
NULL arithmetic
NULL serialization
```

---

## 701. TYPE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

TYPE TESTS

Probar:

```text
equality
compatibility
nullable
display
serialization
```

---

## 702. DIMENSION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DIMENSION TESTS

```text
L × L = L²
L² / L = L
L² / L² = dimensionless
```

---

## 703. MONEY DIMENSION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY DIMENSION TEST

Conceptualmente:

```text
MONEY/COP
```

debe mantener semántica financiera.

---

## 704. MONEY × RATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

MONEY × RATE

Si:

```text
RATE = COP/M2
AREA = M2
```

entonces:

```text
AREA × RATE = COP
```

---

## 705. CANONICAL AQUILA TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CANONICAL AQUILA TEST

```text
area = 120.5 M2
tarifa = 4500 COP/M2
```

Resultado:

```text
542250 COP
```

---

## 706. PRECISION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

PRECISION TEST

Verificar que:

```text
120.5 × 4500
```

produzca exactamente:

```text
542250
```

sin floating point error.

---

## 707. ROUNDING TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ROUNDING TEST

Verificar que el redondeo sea aplicado sólo cuando se solicite.

---

## 708. DETERMINISM TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DETERMINISM TEST

Misma entrada:

```text
same Value
```

debe producir:

```text
same result
```

---

## 709. IMMUTABILITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

IMMUTABILITY TEST

Después de:

```text
a + b
```

verificar:

```text
a unchanged
b unchanged
```

---

## 710. SERIALIZATION ROUND TRIP

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SERIALIZATION ROUND TRIP

Debe cumplirse:

```text
value
→ serialize
→ deserialize
→ semantically equal
```

---

## 711. HASH ROUND TRIP

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

HASH ROUND TRIP

Si se utiliza hashing:

```text
value
→ canonical representation
→ hash
```

debe ser estable.

---

## 712. API BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

API BOUNDARY

El Core puede exportar:

```text
constructors
types
diagnostics
serialization
```

pero no:

```text
database DTOs
HTTP DTOs
Vue types
```

---

## 713. PUBLIC EXPORTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

PUBLIC EXPORTS

`index.ts` debe exportar sólo API pública.

---

## 714. INTERNAL MODULES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

INTERNAL MODULES

Detalles como:

```text
decimal implementation
dimension normalization algorithm
```

pueden permanecer internos.

---

## 715. SEMVER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SEMVER

Cambios incompatibles del Core requieren revisión de:

```text
language version
artifact compatibility
runtime compatibility
```

---

## 716. DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

DOCUMENTATION

Cada Value debe documentar:

```text
meaning
construction
operations
serialization
edge cases
```

---

## 717. CODE STYLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CODE STYLE

Preferir:

```text
readonly
pure functions
explicit return types
small modules
```

---

## 718. NO MAGIC STRINGS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NO MAGIC STRINGS

Códigos como:

```text
"MONEY"
"QUANTITY"
```

deben centralizarse mediante tipos/constants.

---

## 719. NO MAGIC NUMBERS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NO MAGIC NUMBERS

Escalas, límites y códigos matemáticos deben tener nombres explícitos.

---

## 720. ERROR MESSAGES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

ERROR MESSAGES

Mensajes deben ser:

```text
stable enough for users
```

pero tests deben preferir:

```text
error code
```

sobre texto completo.

---

## 721. UNIT TEST ORGANIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

UNIT TEST ORGANIZATION

```text
tests/values/money.test.ts
tests/values/quantity.test.ts
tests/values/null.test.ts
tests/types/types.test.ts
tests/diagnostics/diagnostic.test.ts
```

---

## 722. PROPERTY TEST ORGANIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

PROPERTY TEST ORGANIZATION

```text
tests/invariants/value-invariants.test.ts
tests/invariants/dimension-invariants.test.ts
```

---

## 723. FIRST IMPLEMENTATION FILES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

FIRST IMPLEMENTATION FILES

Orden recomendado:

```text
src/types/kinds.ts
src/types/ael-type.ts
src/values/ael-value.ts
src/values/number-value.ts
src/values/boolean-value.ts
src/values/string-value.ts
src/values/null-value.ts
src/values/money-value.ts
src/values/quantity-value.ts
src/diagnostics/diagnostic.ts
src/source/source-position.ts
src/source/source-span.ts
```

---

## 724. SECOND IMPLEMENTATION FILES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SECOND IMPLEMENTATION FILES

Después:

```text
src/types/money-type.ts
src/types/quantity-type.ts
src/types/nullable-type.ts
src/types/dimension.ts
src/types/unit.ts
src/types/currency.ts
```

---

## 725. THIRD IMPLEMENTATION FILES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

THIRD IMPLEMENTATION FILES

Después:

```text
src/values/value-operations.ts
src/types/operator-signatures.ts
src/diagnostics/codes.ts
src/errors/core-errors.ts
```

---

## 726. FIRST CODE QUALITY GATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

FIRST CODE QUALITY GATE

No continuar al Parser hasta que:

```text
all Core tests pass
typecheck passes
lint passes
serialization passes
precision tests pass
```

---

## 727. SECOND QUALITY GATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

SECOND QUALITY GATE

Antes del Runtime:

```text
operator semantics stable
type compatibility stable
dimension algebra stable
diagnostic codes stable
```

---

## 728. THIRD QUALITY GATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

THIRD QUALITY GATE

Antes de integrar AQUILA:

```text
Core package independent
no infrastructure imports
deterministic
immutable
tested
```

---

## 729. NON-GOALS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

NON-GOALS

Este documento NO implementa:

```text
lexer
parser
AST
compiler
runtime
database
API
UI
```

Sólo define la fundación del Core.

---

## 730. RISKS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

RISKS

Principales riesgos:

```text
floating point leakage
implicit coercion
ambiguous null semantics
dimension bugs
currency mixing
mutable values
unstable diagnostics
```

---

## 731. RISK MITIGATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

RISK MITIGATION

Mitigación:

```text
Decimal exact
strict typing
explicit null policy
dimension algebra
currency validation
immutable values
stable diagnostic codes
```

---

## 732. FINAL CORE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

FINAL CORE CONTRACT

El resto de AEL debe poder asumir:

```text
Money is exact.
Quantity is dimensional.
Null is explicit.
Values are immutable.
Types are explicit.
Diagnostics are structured.
Source locations are deterministic.
```

---

## 733. EXIT CRITERIA — AEL-CORE-FOUNDATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

EXIT CRITERIA — AEL-CORE-FOUNDATION

```text
✓ AELValue implemented
✓ Primitive values implemented
✓ Money implemented
✓ Quantity implemented
✓ Currency represented explicitly
✓ Dimensions represented explicitly
✓ Null represented explicitly
✓ Type compatibility defined
✓ Operator signatures defined
✓ Diagnostics implemented
✓ SourceSpan implemented
✓ Canonical serialization implemented
✓ Exact decimal verified
✓ Values immutable
✓ Core has no infrastructure dependency
✓ Unit tests pass
✓ Invariant tests pass
✓ Canonical AQUILA calculation passes
```

---

## 734. CANONICAL RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

CANONICAL RESULT

Input:

```text
120.5 M2
4500 COP/M2
```

Operation:

```text
AREA × RATE
```

Output:

```text
542250 COP
```

---

## 735. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_CORE_FOUNDATION 24.md

FINAL ARCHITECTURE

```text
                 AEL CORE FOUNDATION
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
      Types            Values        Diagnostics
        │                │                │
        │       ┌────────┼────────┐       │
        │       ▼        ▼        ▼       │
        │    Money    Quantity   Null      │
        │       │        │        │       │
        └───────┴────────┴────────┴───────┘
                         │
                         ▼
                    Compiler
                         │
                         ▼
                      Runtime
```

---

## 736. OBJETIVO

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

OBJETIVO

Definir:

```text
Repository Structure
Applications
Packages
Modules
Dependencies
Boundaries
Interfaces
Build
Testing
Configuration
Versioning
Deployment Artifacts
```

---

## 737. OBJETIVO ARQUITECTÓNICO

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

OBJETIVO ARQUITECTÓNICO

La implementación debe permitir evolucionar independientemente:

```text
Compiler
Parser
Semantic Analyzer
Verifier
Runtime
Financial Domain
Registry
API
Workers
Persistence
```

sin crear acoplamiento innecesario.

---

## 738. REPOSITORY STRATEGY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

REPOSITORY STRATEGY

Para V1 se recomienda:

```text
MONOREPO
```

---

## 739. JUSTIFICACIÓN DEL MONOREPO

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

JUSTIFICACIÓN DEL MONOREPO

Permite:

```text
atomic changes
shared contracts
single CI pipeline
cross-module testing
consistent versioning
```

---

## 740. REPOSITORY ROOT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

REPOSITORY ROOT

Estructura propuesta:

```text
aquila-ael/
├── apps/
├── packages/
├── tests/
├── docs/
├── infrastructure/
├── scripts/
└── .github/
```

---

## 741. APPS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

APPS

`apps/` contiene componentes ejecutables:

```text
api
compiler
worker
runtime-service
```

---

## 742. PACKAGES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGES

`packages/` contiene componentes reutilizables.

---

## 743. TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TESTS

Tests transversales:

```text
unit
integration
golden
security
performance
e2e
```

---

## 744. DOCS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DOCS

Documentación:

```text
architecture
language
contracts
operations
decisions
```

---

## 745. INFRASTRUCTURE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

INFRASTRUCTURE

Contendrá:

```text
docker
deployment
database
IaC
environment configuration
```

---

## 746. SCRIPTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SCRIPTS

Scripts para:

```text
build
test
benchmark
migration
release
golden tests
```

---

## 747. GITHUB

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

GITHUB

CI/CD y automatización:

```text
.github/
├── workflows/
└── CODEOWNERS
```

---

## 748. APPLICATION: API

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

APPLICATION: API

Responsabilidad:

```text
HTTP/API boundary
authentication
authorization
request validation
orchestration
```

No debe contener:

```text
compiler internals
financial calculation logic
database-specific business logic
```

---

## 749. APPLICATION: COMPILER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

APPLICATION: COMPILER

Responsabilidad:

```text
source
→ tokens
→ AST
→ semantic model
→ IR
→ Artifact
```

---

## 750. APPLICATION: WORKER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

APPLICATION: WORKER

Responsabilidad:

```text
queue consumption
async settlement execution
retry
job lifecycle
```

---

## 751. APPLICATION: RUNTIME SERVICE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

APPLICATION: RUNTIME SERVICE

Puede exponer:

```text
Artifact execution
```

como servicio independiente cuando la arquitectura de despliegue lo requiera.

---

## 752. PACKAGE: AEL CORE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL CORE

Ruta:

```text
packages/ael-core/
```

Responsabilidad:

```text
shared language primitives
errors
identifiers
source locations
common interfaces
```

---

## 753. CORE RULE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CORE RULE

`ael-core` no debe depender de:

```text
PostgreSQL
Supabase
HTTP
Fastify/Express
Vue
React
financial database schemas
```

---

## 754. PACKAGE: AEL TOKENIZER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL TOKENIZER

Ruta:

```text
packages/ael-tokenizer/
```

Responsabilidad:

```text
source
→ tokens
```

---

## 755. TOKENIZER DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TOKENIZER DEPENDENCIES

Puede depender de:

```text
ael-core
```

No debe depender de:

```text
runtime
database
financial domain
API
```

---

## 756. PACKAGE: AEL AST

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL AST

Ruta:

```text
packages/ael-ast/
```

Contiene:

```text
AST nodes
source locations
AST utilities
```

---

## 757. AST DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

AST DEPENDENCIES

Puede depender de:

```text
ael-core
```

---

## 758. PACKAGE: AEL PARSER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL PARSER

Ruta:

```text
packages/ael-parser/
```

Responsabilidad:

```text
tokens
→ AST
```

---

## 759. PARSER DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PARSER DEPENDENCIES

Puede depender de:

```text
ael-core
ael-tokenizer
ael-ast
```

---

## 760. PACKAGE: AEL SEMANTIC

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL SEMANTIC

Ruta:

```text
packages/ael-semantic/
```

Responsabilidad:

```text
AST
→ semantic model
→ type validation
→ symbol resolution
```

---

## 761. SEMANTIC DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SEMANTIC DEPENDENCIES

Puede depender de:

```text
ael-core
ael-ast
```

No debe depender de:

```text
database
HTTP
UI
```

---

## 762. PACKAGE: AEL TYPES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL TYPES

Ruta:

```text
packages/ael-types/
```

Contiene:

```text
primitive types
financial types
function types
contract types
```

---

## 763. TYPE SYSTEM

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TYPE SYSTEM

Debe representar:

```text
Integer
Decimal
Boolean
String
Date
DateTime
Money
Currency
Rate
Percentage
Quantity
Coefficient
Array
Object
```

según alcance V1.

---

## 764. TYPE SYSTEM DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TYPE SYSTEM DEPENDENCIES

Debe permanecer independiente del almacenamiento.

---

## 765. PACKAGE: AEL IR

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL IR

Ruta:

```text
packages/ael-ir/
```

Responsabilidad:

```text
semantic model
→ intermediate representation
```

---

## 766. IR PRINCIPLE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

IR PRINCIPLE

IR debe ser:

```text
explicit
serializable
versionable
deterministic
```

---

## 767. PACKAGE: AEL COMPILER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL COMPILER

Ruta:

```text
packages/ael-compiler/
```

Orquesta:

```text
tokenizer
parser
semantic analyzer
IR
artifact builder
```

---

## 768. COMPILER PIPELINE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

COMPILER PIPELINE

```text
Source
 ↓
Tokenizer
 ↓
Parser
 ↓
AST
 ↓
Semantic Analysis
 ↓
IR
 ↓
Verifier
 ↓
Artifact
```

---

## 769. PACKAGE: AEL ARTIFACT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL ARTIFACT

Ruta:

```text
packages/ael-artifact/
```

Responsabilidad:

```text
artifact model
serialization
hashing
metadata
compatibility
```

---

## 770. ARTIFACT CONTENT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ARTIFACT CONTENT

Debe contener conceptualmente:

```text
artifactVersion
languageVersion
compilerVersion
program/IR
dependencies
metadata
hash
```

---

## 771. PACKAGE: AEL VERIFIER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL VERIFIER

Ruta:

```text
packages/ael-verifier/
```

Responsabilidad:

```text
validate Artifact
security checks
resource limits
dependency checks
```

---

## 772. VERIFIER BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

VERIFIER BOUNDARY

Verifier no debe ejecutar efectos financieros.

---

## 773. PACKAGE: AEL RUNTIME

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL RUNTIME

Ruta:

```text
packages/ael-runtime/
```

Responsabilidad:

```text
execute verified Artifact
```

---

## 774. RUNTIME DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

RUNTIME DEPENDENCIES

Puede depender de:

```text
ael-core
ael-types
ael-ir
ael-artifact
```

y abstractions de:

```text
contracts
providers
```

---

## 775. RUNTIME MUST NOT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

RUNTIME MUST NOT

Runtime no debe acceder directamente a:

```text
PostgreSQL tables
Supabase client
HTTP endpoints
filesystem secrets
```

---

## 776. PROVIDER BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PROVIDER BOUNDARY

Runtime utiliza:

```text
Provider interfaces
```

---

## 777. PACKAGE: AEL CONTRACTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL CONTRACTS

Ruta:

```text
packages/ael-contracts/
```

Define interfaces para:

```text
domain access
providers
functions
clock
randomness
logging
```

---

## 778. CONTRACT PRINCIPLE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CONTRACT PRINCIPLE

Los Contracts describen:

```text
what is available
```

no:

```text
how it is stored
```

---

## 779. PACKAGE: AEL FUNCTIONS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL FUNCTIONS

Ruta:

```text
packages/ael-functions/
```

Contiene funciones permitidas por AEL.

---

## 780. FUNCTION CATEGORIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FUNCTION CATEGORIES

```text
core
numeric
date
financial
domain
```

---

## 781. PURE FUNCTIONS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PURE FUNCTIONS

Preferir funciones puras para:

```text
financial calculations
numeric operations
date calculations
```

cuando sea posible.

---

## 782. SIDE-EFFECT FUNCTIONS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SIDE-EFFECT FUNCTIONS

Deben estar explícitamente marcadas y controladas.

---

## 783. PACKAGE: AEL REGISTRY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL REGISTRY

Ruta:

```text
packages/ael-registry/
```

Responsabilidad:

```text
resolve Functions
resolve Contracts
resolve Providers
resolve Artifacts
```

---

## 784. REGISTRY VERSIONING

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

REGISTRY VERSIONING

Registry debe identificar:

```text
snapshot
version
hash
```

---

## 785. PACKAGE: AEL FINANCIAL

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL FINANCIAL

Ruta:

```text
packages/ael-financial/
```

Contiene:

```text
Money
Decimal policies
Rates
Currency
Rounding
Proration
Interest
Tax
Discount
Allocation
```

---

## 786. FINANCIAL BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FINANCIAL BOUNDARY

Financial package no debe depender de:

```text
HTTP
UI
database client
```

---

## 787. PACKAGE: AEL SETTLEMENT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL SETTLEMENT

Ruta:

```text
packages/ael-settlement/
```

Responsabilidad:

```text
Settlement pipeline
SettlementResult
SettlementLine
Reconciliation
Calculation Snapshot
```

---

## 788. SETTLEMENT DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SETTLEMENT DEPENDENCIES

Puede depender de:

```text
ael-core
ael-types
ael-financial
ael-runtime
ael-contracts
```

---

## 789. PACKAGE: AEL PERSISTENCE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL PERSISTENCE

Ruta:

```text
packages/ael-persistence/
```

Responsabilidad:

```text
database repositories
artifact storage
settlement persistence
audit persistence
```

---

## 790. PERSISTENCE BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PERSISTENCE BOUNDARY

Persistence no debe decidir:

```text
financial business rules
```

---

## 791. PACKAGE: AEL QUEUE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL QUEUE

Ruta:

```text
packages/ael-queue/
```

Abstrae:

```text
enqueue
dequeue
ack
retry
dead-letter
```

---

## 792. PACKAGE: AEL OBSERVABILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL OBSERVABILITY

Ruta:

```text
packages/ael-observability/
```

Abstrae:

```text
logs
metrics
traces
audit events
```

---

## 793. PACKAGE: AEL CONFIG

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL CONFIG

Ruta:

```text
packages/ael-config/
```

Gestiona:

```text
environment
runtime settings
feature flags
limits
```

Secrets no deben quedar hard-coded.

---

## 794. PACKAGE: AEL TESTING

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE: AEL TESTING

Ruta:

```text
packages/ael-testing/
```

Contiene utilidades:

```text
fixtures
assertions
golden runner
test builders
```

---

## 795. GOLDEN TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

GOLDEN TESTS

Ruta:

```text
tests/golden/
```

---

## 796. GOLDEN TEST RUNNER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

GOLDEN TEST RUNNER

Debe ejecutar:

```text
case
→ compile
→ verify
→ execute
→ compare
```

---

## 797. TEST LAYERS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TEST LAYERS

```text
tests/
├── unit/
├── integration/
├── golden/
├── security/
├── performance/
└── e2e/
```

---

## 798. UNIT TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

UNIT TESTS

Prueban módulos aislados.

---

## 799. INTEGRATION TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

INTEGRATION TESTS

Prueban interacción entre:

```text
compiler
runtime
registry
database
providers
```

---

## 800. SECURITY TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SECURITY TESTS

Prueban:

```text
tenant isolation
authorization
artifact verification
resource limits
```

---

## 801. PERFORMANCE TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PERFORMANCE TESTS

Prueban:

```text
compile
verify
execute
settlement
batch
```

---

## 802. E2E TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

E2E TESTS

Prueban:

```text
API
→ settlement
→ persistence
→ audit
```

---

## 803. DEPENDENCY DIRECTION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DEPENDENCY DIRECTION

Regla principal:

```text
apps
 ↓
application services
 ↓
domain / engine
 ↓
core abstractions
```

---

## 804. DOMAIN DEPENDENCY RULE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DOMAIN DEPENDENCY RULE

Domain no debe depender de:

```text
delivery layer
database implementation
framework
```

---

## 805. INFRASTRUCTURE DEPENDENCY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

INFRASTRUCTURE DEPENDENCY

Infrastructure puede depender de:

```text
domain interfaces
contracts
application interfaces
```

---

## 806. API DEPENDENCY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

API DEPENDENCY

API puede depender de:

```text
application services
DTOs
authentication
authorization
```

---

## 807. API MUST NOT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

API MUST NOT

API no debe implementar:

```text
financial formulas
```

---

## 808. DATABASE MUST NOT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DATABASE MUST NOT

Database triggers/procedures no deben convertirse en:

```text
hidden AEL semantics
```

salvo responsabilidades explícitamente transaccionales.

---

## 809. FRAMEWORK ISOLATION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FRAMEWORK ISOLATION

Framework-specific code debe permanecer en:

```text
apps
infrastructure
adapters
```

---

## 810. ADAPTER PATTERN

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ADAPTER PATTERN

External technologies se integran mediante:

```text
adapters
```

---

## 811. POSTGRES ADAPTER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

POSTGRES ADAPTER

Implementa:

```text
repositories
```

contra PostgreSQL/Supabase.

---

## 812. QUEUE ADAPTER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

QUEUE ADAPTER

Implementa:

```text
queue interface
```

para la tecnología seleccionada.

---

## 813. STORAGE ADAPTER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

STORAGE ADAPTER

Implementa:

```text
artifact storage
```

sin contaminar el Runtime.

---

## 814. HTTP ADAPTER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

HTTP ADAPTER

Providers externos deben utilizar:

```text
HTTP adapter
```

cuando corresponda.

---

## 815. CLOCK ADAPTER

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CLOCK ADAPTER

Runtime debe recibir:

```text
Clock
```

para evitar dependencia directa de:

```text
system time
```

---

## 816. RANDOMNESS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

RANDOMNESS

Si AEL requiere randomness, debe ser:

```text
explicit dependency
```

y no implícita.

---

## 817. FILESYSTEM

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FILESYSTEM

Runtime no debe acceder libremente al filesystem.

---

## 818. NETWORK

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

NETWORK

Runtime no debe tener acceso arbitrario a Internet.

Toda comunicación externa debe pasar por:

```text
authorized Provider
```

---

## 819. SECRET ACCESS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SECRET ACCESS

Secrets sólo mediante:

```text
authorized infrastructure adapter
```

Nunca desde source AEL.

---

## 820. CONFIGURATION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CONFIGURATION

Separar:

```text
code configuration
environment configuration
tenant configuration
financial policy
```

---

## 821. TENANT CONFIGURATION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TENANT CONFIGURATION

Debe residir en dominio/persistence, no en:

```text
hard-coded environment variables
```

---

## 822. FINANCIAL POLICY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FINANCIAL POLICY

Debe ser:

```text
versioned
tenant-aware
auditable
```

---

## 823. BUILD SYSTEM

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

BUILD SYSTEM

El monorepo debe tener:

```text
single reproducible build
```

---

## 824. PACKAGE VERSIONING

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PACKAGE VERSIONING

V1 puede utilizar:

```text
workspace versioning
```

y release coordinado.

---

## 825. SEMANTIC VERSIONING

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SEMANTIC VERSIONING

Paquetes públicos deberían seguir:

```text
MAJOR.MINOR.PATCH
```

cuando aplique.

---

## 826. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

LANGUAGE VERSION

AEL debe tener:

```text
languageVersion
```

independiente de:

```text
compilerVersion
runtimeVersion
```

---

## 827. RUNTIME COMPATIBILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

RUNTIME COMPATIBILITY

Runtime debe validar:

```text
Artifact compatibility
```

antes de ejecutar.

---

## 828. COMPILER COMPATIBILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

COMPILER COMPATIBILITY

Compiler debe generar:

```text
Artifact compatible
```

con runtime soportado.

---

## 829. ARTIFACT COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ARTIFACT COMPATIBILITY MATRIX

Debe existir una matriz:

```text
Artifact Version
Language Version
Compiler Version
Runtime Version
```

---

## 830. BUILD REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

BUILD REPRODUCIBILITY

Build debe fijar:

```text
dependencies
toolchain
configuration
```

---

## 831. LOCKFILES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

LOCKFILES

Utilizar lockfile correspondiente al package manager.

---

## 832. CI PIPELINE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CI PIPELINE

Pipeline mínimo:

```text
Install
 ↓
Lint
 ↓
Typecheck
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
Golden Tests
 ↓
Security Tests
 ↓
Build
 ↓
Performance Smoke
```

---

## 833. RELEASE PIPELINE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

RELEASE PIPELINE

```text
CI
 ↓
Artifact Build
 ↓
Verification
 ↓
Release Candidate
 ↓
Staging
 ↓
Golden Suite
 ↓
Approval
 ↓
Production
```

---

## 834. CODEOWNERS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CODEOWNERS

Ownership debe separar:

```text
compiler
runtime
financial
infrastructure
security
```

---

## 835. ARCHITECTURE TESTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ARCHITECTURE TESTS

Automatizar reglas como:

```text
runtime cannot import persistence
financial cannot import API
core cannot import infrastructure
```

---

## 836. DEPENDENCY LINT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DEPENDENCY LINT

CI debe detectar:

```text
forbidden imports
circular dependencies
```

---

## 837. CIRCULAR DEPENDENCY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CIRCULAR DEPENDENCY

No permitir ciclos entre packages.

---

## 838. INTERNAL MODULES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

INTERNAL MODULES

No importar directamente:

```text
internal files
```

desde otros packages.

---

## 839. DTO BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DTO BOUNDARY

API DTOs no deben convertirse en:

```text
domain entities
```

sin transformación explícita.

---

## 840. DOMAIN OBJECTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DOMAIN OBJECTS

Domain objects deben permanecer independientes de:

```text
HTTP JSON
database row
ORM model
```

---

## 841. ORM

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ORM

Si se utiliza ORM:

```text
ORM models
```

deben estar en persistence.

---

## 842. DATABASE MIGRATIONS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DATABASE MIGRATIONS

Ruta:

```text
infrastructure/database/migrations/
```

---

## 843. MIGRATION RULE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

MIGRATION RULE

Cada cambio de schema debe tener:

```text
migration
```

versionada.

---

## 844. ROLLBACK

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ROLLBACK

Migrations deben documentar:

```text
rollback strategy
```

cuando sea viable.

---

## 845. SEED DATA

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SEED DATA

Seed separado de:

```text
production financial data
```

---

## 846. TEST DATABASE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TEST DATABASE

Tests de integración deben usar:

```text
isolated database
```

---

## 847. GOLDEN DATABASE FIXTURES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

GOLDEN DATABASE FIXTURES

Fixtures financieros deben ser:

```text
versioned
repeatable
```

---

## 848. TEST TENANTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

TEST TENANTS

Crear tenants controlados:

```text
TENANT_TEST_A
TENANT_TEST_B
```

para isolation testing.

---

## 849. OBSERVABILITY BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

OBSERVABILITY BOUNDARY

Logging no debe filtrarse dentro del core.

Core puede emitir:

```text
events/interfaces
```

y infrastructure decide cómo registrarlos.

---

## 850. ERROR BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ERROR BOUNDARY

Core errors deben ser:

```text
typed
structured
serializable
```

---

## 851. API ERROR MAPPING

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

API ERROR MAPPING

API transforma:

```text
domain error
```

en:

```text
HTTP response
```

---

## 852. NO ERROR LEAKAGE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

NO ERROR LEAKAGE

No exponer internals innecesarios.

---

## 853. SECURITY BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SECURITY BOUNDARY

Security policy debe estar distribuida correctamente:

```text
API authorization
Runtime capability control
RLS
Provider permissions
```

---

## 854. CAPABILITY MODEL

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CAPABILITY MODEL

Runtime puede recibir capabilities explícitas:

```text
readUnit
readBalance
calculate
writeSettlement
```

según necesidad.

---

## 855. LEAST PRIVILEGE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

LEAST PRIVILEGE

Cada component debe tener:

```text
minimum required permissions
```

---

## 856. SERVICE ACCOUNT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SERVICE ACCOUNT

Cada service debe utilizar identidad separada cuando sea posible.

---

## 857. DATABASE ROLE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DATABASE ROLE

API, worker y migration process pueden utilizar roles diferentes.

---

## 858. PRODUCTION ACCESS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PRODUCTION ACCESS

Developers no deben requerir acceso directo permanente a:

```text
production database
```

---

## 859. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ARTIFACT STORAGE

Separar:

```text
source storage
artifact storage
logs
audit
```

---

## 860. ARTIFACT IMMUTABILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ARTIFACT IMMUTABILITY

Published Artifact debe ser:

```text
immutable
```

---

## 861. SOURCE IMMUTABILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SOURCE IMMUTABILITY

Published source version debe poder recuperarse.

---

## 862. RELEASE MANIFEST

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

RELEASE MANIFEST

Cada release debe identificar:

```text
compiler
runtime
packages
artifacts
migrations
```

---

## 863. DEPLOYMENT MANIFEST

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DEPLOYMENT MANIFEST

Debe identificar:

```text
image/version
configuration version
artifact registry snapshot
```

---

## 864. FEATURE FLAGS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FEATURE FLAGS

Feature flags no deben alterar silenciosamente:

```text
financial semantics
```

sin versioning/audit.

---

## 865. EXPERIMENTAL FEATURES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

EXPERIMENTAL FEATURES

Deben estar claramente marcadas:

```text
experimental
```

---

## 866. V1 STABILITY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

V1 STABILITY

V1 debe priorizar:

```text
correctness
traceability
security
maintainability
```

sobre:

```text
maximum abstraction
```

---

## 867. CODE GENERATION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CODE GENERATION

Code generation puede utilizarse para:

```text
boilerplate
DTO
contracts
```

pero generated code debe ser reproducible.

---

## 868. GENERATED ARTIFACTS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

GENERATED ARTIFACTS

No editar manualmente generated files si el proceso puede regenerarlos.

---

## 869. DOCUMENTATION GENERATION

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DOCUMENTATION GENERATION

Contracts públicos deben poder generar:

```text
reference documentation
```

---

## 870. CHANGE MANAGEMENT

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

CHANGE MANAGEMENT

Cambios arquitectónicos importantes deben registrarse como:

```text
ADR
```

---

## 871. ADR DIRECTORY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ADR DIRECTORY

```text
docs/adr/
```

---

## 872. INITIAL ADRS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

INITIAL ADRS

Crear al menos:

```text
ADR-001 Monorepo
ADR-002 Runtime Isolation
ADR-003 Decimal Financial Semantics
ADR-004 Artifact Immutability
ADR-005 Settlement Calculate-vs-Post
```

---

## 873. VERTICAL SLICE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

VERTICAL SLICE

Después de los componentes base, construir un vertical slice mínimo:

```text
AEL source
→ compile
→ verify
→ execute
→ Money result
→ Golden test
```

---

## 874. IMPLEMENTATION RULE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

IMPLEMENTATION RULE

No implementar todo el sistema antes de ejecutar:

```text
first end-to-end slice
```

---

## 875. QUALITY GATE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

QUALITY GATE

Cada package debe cumplir:

```text
typecheck
lint
unit tests
dependency rules
```

---

## 876. SECURITY GATE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

SECURITY GATE

Critical components:

```text
Verifier
Runtime
Registry
Persistence
API
```

deben tener security tests.

---

## 877. FINANCIAL GATE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FINANCIAL GATE

Financial components deben ejecutar:

```text
Golden Cases
```

antes de release.

---

## 878. ARCHITECTURE GATE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ARCHITECTURE GATE

No aceptar PR que introduzca:

```text
forbidden dependency
circular dependency
database leakage into domain
financial logic into API
```

---

## 879. REPOSITORY TREE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

REPOSITORY TREE

Arquitectura de referencia:

```text
aquila-ael/
│
├── apps/
│   ├── api/
│   ├── compiler/
│   ├── runtime-service/
│   └── worker/
│
├── packages/
│   ├── ael-core/
│   ├── ael-tokenizer/
│   ├── ael-ast/
│   ├── ael-parser/
│   ├── ael-types/
│   ├── ael-semantic/
│   ├── ael-ir/
│   ├── ael-artifact/
│   ├── ael-compiler/
│   ├── ael-verifier/
│   ├── ael-contracts/
│   ├── ael-functions/
│   ├── ael-runtime/
│   ├── ael-registry/
│   ├── ael-financial/
│   ├── ael-settlement/
│   ├── ael-persistence/
│   ├── ael-queue/
│   ├── ael-observability/
│   ├── ael-config/
│   └── ael-testing/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── golden/
│   ├── security/
│   ├── performance/
│   └── e2e/
│
├── docs/
│   ├── architecture/
│   ├── language/
│   ├── contracts/
│   ├── operations/
│   └── adr/
│
├── infrastructure/
│   ├── docker/
│   ├── database/
│   │   └── migrations/
│   ├── deployment/
│   └── iac/
│
├── scripts/
│
├── package.json
├── lockfile
└── README.md
```

---

## 880. DEPENDENCY GRAPH

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

DEPENDENCY GRAPH

```text
                         apps
                          │
                 application services
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
    settlement          API              worker
        │
        ▼
     runtime
        │
 ┌──────┼─────────┐
 ▼      ▼         ▼
types  contracts  artifact
 │
 ▼
 financial

compiler:
tokenizer
   ↓
parser
   ↓
AST
   ↓
semantic
   ↓
IR
   ↓
artifact
   ↓
verifier
```

---

## 881. FORBIDDEN DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FORBIDDEN DEPENDENCIES

```text
ael-core → database       ❌
ael-core → HTTP           ❌
ael-financial → API       ❌
ael-runtime → PostgreSQL  ❌
ael-runtime → Supabase    ❌
ael-parser → runtime      ❌
ael-verifier → database   ❌
API → financial formulas  ❌
```

---

## 882. ALLOWED DEPENDENCIES

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

ALLOWED DEPENDENCIES

```text
parser → tokenizer
parser → AST
semantic → AST
compiler → parser
compiler → semantic
compiler → IR
runtime → IR
runtime → types
runtime → contracts
settlement → financial
settlement → runtime
persistence → contracts
API → application services
worker → application services
```

---

## 883. IMPLEMENTATION BOUNDARY

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

IMPLEMENTATION BOUNDARY

La regla general:

```text
Domain defines meaning.
Engine performs computation.
Infrastructure provides resources.
Application orchestrates.
API exposes capabilities.
```

---

## 884. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

FINAL ARCHITECTURE

```text
                         AQUILA_SAAS
                              │
                              ▼
                         AEL Platform
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
       Compiler            Runtime            Services
          │                   │                   │
          ▼                   ▼                   ▼
       Artifact           Contracts            API/Worker
          │                   │                   │
          ▼                   ▼                   ▼
      Verifier           Providers          Settlement
                              │                   │
                              └─────────┬─────────┘
                                        ▼
                                  Infrastructure
                                        │
                         ┌──────────────┼──────────────┐
                         ▼              ▼              ▼
                     PostgreSQL      Storage         Queue
```

---

## 885. PRINCIPIO DE ARQUITECTURA

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PRINCIPIO DE ARQUITECTURA

```text
High-level policy
        ↓
Stable interfaces
        ↓
Replaceable infrastructure
```

---

## 886. PRINCIPIO DE DEPENDENCIAS

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PRINCIPIO DE DEPENDENCIAS

```text
Dependencies point inward.
```

---

## 887. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PRINCIPIO DE AISLAMIENTO

```text
Compiler
Runtime
Financial Domain
Persistence
API
```

deben poder probarse independientemente.

---

## 888. PRINCIPIO DE IMPLEMENTACIÓN

> **Origen:** Motor de liquidacion_Reference Architecture, Repository Structure & Implementation Boundaries 54.md

PRINCIPIO DE IMPLEMENTACIÓN

Primero:

```text
minimal vertical slice
```

después:

```text
expand capability
```

y no:

```text
build everything
→ integrate at the end
```

---
