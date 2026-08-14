# AEL V1 — AEL Platform — Errors, Registry, Versioning & Compatibility

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
43 — Motor de liquidacion_Error Model & Diagnostics 43.md
45 — Motor de liquidacion_Registry & Dependency Management 45.md
46 — Motor de liquidacion_Versioning & Compatibility 46.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

OBJETIVO

Definir:

```text
Diagnostic
Error Codes
Severity
SourceSpan
Compiler Errors
Verifier Errors
Runtime Errors
Provider Errors
Authentication Errors
Authorization Errors
Database Errors
Error Propagation
Logging
Redaction
Correlation
```

---

## 2. MODELO UNIFICADO

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

MODELO UNIFICADO

Todo error AEL debe poder clasificarse mediante:

```text
domain
code
severity
message
source location
cause
context
```

---

## 3. DIAGNOSTIC

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DIAGNOSTIC

Conceptualmente:

```ts
interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  message: string
  sourceSpan?: SourceSpan
  phase?: DiagnosticPhase
  details?: Record<string, unknown>
}
```

---

## 4. SEVERITY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SEVERITY

V1:

```text
INFO
WARNING
ERROR
FATAL
```

---

## 5. INFO

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

INFO

Información no bloqueante.

---

## 6. WARNING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

WARNING

Situación potencialmente problemática que no impide compilation.

---

## 7. ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR

Impide generar un Artifact válido.

---

## 8. FATAL

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

FATAL

Error que impide continuar de forma segura.

---

## 9. PHASE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PHASE

```text
LEXER
PARSER
SEMANTIC
TYPE
FLOW
IR
COMPILER
VERIFIER
RUNTIME
PROVIDER
DATABASE
AUTH
```

---

## 10. ERROR CODE FORMAT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CODE FORMAT

Formato recomendado:

```text
AEL-<DOMAIN>-<NNN>
```

Ejemplos:

```text
AEL-PARSE-001
AEL-TYPE-001
AEL-ARTIFACT-001
AEL-EXECUTION-001
AEL-PROVIDER-001
```

---

## 11. CODE STABILITY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CODE STABILITY

Una vez publicado:

```text
error code
```

no debe reutilizarse para otro significado.

---

## 12. MESSAGE STABILITY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

MESSAGE STABILITY

Los códigos son estables.

Los mensajes pueden evolucionar.

---

## 13. SOURCE SPAN

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SOURCE SPAN

```ts
interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}
```

---

## 14. SOURCE POSITION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SOURCE POSITION

```ts
interface SourcePosition {
  offset: number
  line: number
  column: number
}
```

---

## 15. SOURCE OFFSET

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SOURCE OFFSET

Offset debe representar:

```text
UTF-16 code units
```

o la unidad definida oficialmente por el parser, pero debe ser consistente en todo el toolchain.

---

## 16. MULTILINE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

MULTILINE

SourceSpan debe soportar:

```text
multiple lines
```

---

## 17. ARTIFACT SOURCE MAP

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ARTIFACT SOURCE MAP

Runtime puede convertir:

```text
instruction index
→ SourceSpan
```

---

## 18. RUNTIME LOCATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RUNTIME LOCATION

Runtime errors deben incluir:

```text
instruction
```

cuando exista.

---

## 19. ERROR CORRELATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CORRELATION

Execution errors deben asociarse con:

```text
executionId
requestId
correlationId
artifactHash
```

según disponibilidad.

---

## 20. ERROR CONTEXT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CONTEXT

Contexto útil:

```text
tenant
rule
artifact
version
phase
```

debe registrarse de forma segura.

---

## 21. NO SECRET CONTEXT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO SECRET CONTEXT

Nunca incluir:

```text
password
API key
token
connection string
```

---

## 22. SOURCE DISCLOSURE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SOURCE DISCLOSURE

Error response no debe devolver Source completo.

---

## 23. SAFE MESSAGE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SAFE MESSAGE

Mensaje externo debe ser:

```text
human-readable
non-sensitive
actionable
```

---

## 24. INTERNAL DETAILS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

INTERNAL DETAILS

Detalles técnicos pueden permanecer:

```text
internal logs
```

con acceso controlado.

---

## 25. ERROR DOMAIN — LEXER

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — LEXER

Prefijo:

```text
AEL-LEXER
```

---

## 26. LEXER EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

LEXER EXAMPLES

```text
AEL-LEXER-001 Invalid character
AEL-LEXER-002 Unterminated literal
AEL-LEXER-003 Invalid numeric literal
AEL-LEXER-004 Invalid escape
```

---

## 27. ERROR DOMAIN — PARSER

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — PARSER

```text
AEL-PARSE
```

---

## 28. PARSER EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PARSER EXAMPLES

```text
AEL-PARSE-001 Unexpected token
AEL-PARSE-002 Expected expression
AEL-PARSE-003 Invalid statement
AEL-PARSE-004 Unexpected end of input
```

---

## 29. ERROR DOMAIN — SEMANTIC

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — SEMANTIC

```text
AEL-SEMANTIC
```

---

## 30. SEMANTIC EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SEMANTIC EXAMPLES

```text
AEL-SEMANTIC-001 Unknown identifier
AEL-SEMANTIC-002 Unknown Contract
AEL-SEMANTIC-003 Unknown Function
AEL-SEMANTIC-004 Invalid dependency
```

---

## 31. ERROR DOMAIN — TYPE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — TYPE

```text
AEL-TYPE
```

---

## 32. TYPE EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

TYPE EXAMPLES

```text
AEL-TYPE-001 Type mismatch
AEL-TYPE-002 Invalid operator types
AEL-TYPE-003 Invalid function arguments
AEL-TYPE-004 Invalid return type
AEL-TYPE-005 Currency mismatch
AEL-TYPE-006 Dimension mismatch
```

---

## 33. ERROR DOMAIN — FLOW

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — FLOW

```text
AEL-FLOW
```

---

## 34. FLOW EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

FLOW EXAMPLES

```text
AEL-FLOW-001 Invalid control flow
AEL-FLOW-002 Unreachable return
AEL-FLOW-003 Missing return
AEL-FLOW-004 Unsupported cycle
```

---

## 35. ERROR DOMAIN — IR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — IR

```text
AEL-IR
```

---

## 36. IR EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

IR EXAMPLES

```text
AEL-IR-001 Invalid IR node
AEL-IR-002 Type invariant violation
AEL-IR-003 Invalid block
AEL-IR-004 Invalid lowering
```

---

## 37. ERROR DOMAIN — COMPILER

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — COMPILER

```text
AEL-COMPILER
```

---

## 38. COMPILER EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

COMPILER EXAMPLES

```text
AEL-COMPILER-001 Compilation failed
AEL-COMPILER-002 Unsupported feature
AEL-COMPILER-003 Resource limit exceeded
```

---

## 39. ERROR DOMAIN — ARTIFACT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — ARTIFACT

```text
AEL-ARTIFACT
```

---

## 40. ARTIFACT EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ARTIFACT EXAMPLES

```text
AEL-ARTIFACT-001 Invalid header
AEL-ARTIFACT-002 Unknown opcode
AEL-ARTIFACT-003 Invalid operand
AEL-ARTIFACT-004 Invalid index
AEL-ARTIFACT-005 Stack verification failure
AEL-ARTIFACT-006 Control-flow verification failure
AEL-ARTIFACT-007 Integrity mismatch
AEL-ARTIFACT-008 Unsupported format version
AEL-ARTIFACT-009 Invalid dependency
AEL-ARTIFACT-010 Resource limit exceeded
```

---

## 41. ERROR DOMAIN — AUTH

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — AUTH

```text
AEL-AUTH
```

---

## 42. AUTH EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

AUTH EXAMPLES

```text
AEL-AUTH-001 Capability denied
AEL-AUTH-002 Tenant context invalid
AEL-AUTH-003 Actor not authorized
AEL-AUTH-004 Authentication context missing
```

---

## 43. ERROR DOMAIN — EXECUTION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — EXECUTION

```text
AEL-EXECUTION
```

---

## 44. EXECUTION EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

EXECUTION EXAMPLES

```text
AEL-EXECUTION-001 Timeout
AEL-EXECUTION-002 Cancelled
AEL-EXECUTION-003 Step limit exceeded
AEL-EXECUTION-004 Stack limit exceeded
AEL-EXECUTION-005 Invalid runtime state
AEL-EXECUTION-006 Invalid return value
```

---

## 45. ERROR DOMAIN — PROVIDER

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — PROVIDER

```text
AEL-PROVIDER
```

---

## 46. PROVIDER EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PROVIDER EXAMPLES

```text
AEL-PROVIDER-001 Provider unavailable
AEL-PROVIDER-002 Invalid provider result
AEL-PROVIDER-003 Provider timeout
AEL-PROVIDER-004 Dependency unavailable
AEL-PROVIDER-005 External service error
AEL-PROVIDER-006 Result limit exceeded
```

---

## 47. ERROR DOMAIN — FUNCTION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — FUNCTION

```text
AEL-FUNCTION
```

---

## 48. FUNCTION EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

FUNCTION EXAMPLES

```text
AEL-FUNCTION-001 Function unavailable
AEL-FUNCTION-002 Invalid function result
AEL-FUNCTION-003 Function timeout
AEL-FUNCTION-004 Function execution error
```

---

## 49. ERROR DOMAIN — DATABASE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — DATABASE

```text
AEL-DATABASE
```

---

## 50. DATABASE EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DATABASE EXAMPLES

```text
AEL-DATABASE-001 Query failed
AEL-DATABASE-002 Constraint violation
AEL-DATABASE-003 Connection unavailable
AEL-DATABASE-004 Query timeout
AEL-DATABASE-005 Transaction failure
```

---

## 51. ERROR DOMAIN — SECURITY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — SECURITY

```text
AEL-SECURITY
```

---

## 52. SECURITY EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SECURITY EXAMPLES

```text
AEL-SECURITY-001 Integrity violation
AEL-SECURITY-002 Security policy violation
AEL-SECURITY-003 Unsafe dependency
AEL-SECURITY-004 Suspicious artifact
```

---

## 53. ERROR DOMAIN — CONFIGURATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — CONFIGURATION

```text
AEL-CONFIG
```

---

## 54. CONFIG EXAMPLES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CONFIG EXAMPLES

```text
AEL-CONFIG-001 Invalid configuration
AEL-CONFIG-002 Missing provider
AEL-CONFIG-003 Incompatible version
```

---

## 55. ERROR DOMAIN — INTERNAL

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOMAIN — INTERNAL

```text
AEL-INTERNAL
```

---

## 56. INTERNAL EXAMPLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

INTERNAL EXAMPLE

```text
AEL-INTERNAL-001 Unexpected invariant violation
```

Este error debe activar observabilidad interna.

---

## 57. ERROR ORIGIN

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR ORIGIN

Cada error debe identificar:

```text
origin phase
```

---

## 58. ERROR CAUSE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CAUSE

Puede conservar:

```ts
cause?: unknown
```

internamente.

---

## 59. ERROR CHAIN

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CHAIN

Errors pueden encadenarse:

```text
Execution
 → Provider
   → Database
```

---

## 60. ERROR CHAIN EXTERNAL

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CHAIN EXTERNAL

Al cliente se expone sólo:

```text
top-level safe error
```

---

## 61. ERROR CHAIN INTERNAL

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CHAIN INTERNAL

Logs pueden conservar:

```text
cause chain
```

según policy.

---

## 62. RECOVERABLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RECOVERABLE

Un error puede ser:

```text
recoverable
```

por la capa superior.

---

## 63. NON-RECOVERABLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NON-RECOVERABLE

Errores de:

```text
invalid Artifact
security violation
```

son no recuperables.

---

## 64. RETRYABLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RETRYABLE

Error puede declarar:

```text
retryable
```

pero sólo Integration Layer/Application decide si reintenta.

---

## 65. RETRYABLE EXAMPLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RETRYABLE EXAMPLE

```text
temporary provider unavailable
```

puede ser retryable.

---

## 66. NON-RETRYABLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NON-RETRYABLE

```text
invalid capability
type mismatch
invalid Artifact
```

no deben reintentarse.

---

## 67. ERROR CLASSIFICATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR CLASSIFICATION

Conceptualmente:

```ts
interface ErrorMetadata {
  retryable: boolean
  recoverable: boolean
  securityRelevant: boolean
}
```

---

## 68. DATABASE ERROR MAPPING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DATABASE ERROR MAPPING

No exponer directamente:

```text
PostgreSQL raw error
```

---

## 69. CONSTRAINT ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CONSTRAINT ERROR

Mapear a:

```text
AEL-DATABASE-002
```

y preservar detalle interno.

---

## 70. RLS DENIAL

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RLS DENIAL

Puede mapearse a:

```text
AEL-AUTH-001
```

o error específico según política.

---

## 71. NOT FOUND

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NOT FOUND

No necesariamente es un error.

Puede ser:

```text
AEL Null
```

si Contract es nullable.

---

## 72. BUSINESS ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

BUSINESS ERROR

Una regla de negocio puede producir:

```text
domain validation result
```

pero no debe confundirse automáticamente con:

```text
runtime failure
```

---

## 73. ERROR VS BUSINESS RESULT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR VS BUSINESS RESULT

Ejemplo:

```text
Resultado = NO_CUMPLE
```

es un valor de negocio.

Mientras:

```text
Provider unavailable
```

es un error técnico.

---

## 74. NO SILENT FAILURE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO SILENT FAILURE

Nunca convertir:

```text
provider failure
```

en:

```text
0
NULL
false
```

---

## 75. COMPILER DIAGNOSTICS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

COMPILER DIAGNOSTICS

Compiler puede devolver:

```text
multiple diagnostics
```

---

## 76. RUNTIME ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RUNTIME ERROR

Runtime normalmente termina:

```text
current execution
```

---

## 77. VERIFIER ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

VERIFIER ERROR

Verifier rechaza:

```text
Artifact
```

---

## 78. PROVIDER ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PROVIDER ERROR

Provider failure termina la operación actual.

---

## 79. DATABASE ERROR

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DATABASE ERROR

Database error debe mapearse antes de alcanzar la API externa.

---

## 80. ERROR PRESENTATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR PRESENTATION

UI puede mostrar:

```text
friendly message
```

basado en code.

---

## 81. LOCALIZATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

LOCALIZATION

Messages pueden localizarse.

Los codes:

```text
never localized
```

---

## 82. MESSAGE CATALOG

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

MESSAGE CATALOG

Puede existir:

```text
ErrorMessageCatalog
```

---

## 83. CLIENT MESSAGE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CLIENT MESSAGE

Ejemplo:

```text
No fue posible obtener la información requerida.
```

---

## 84. INTERNAL MESSAGE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

INTERNAL MESSAGE

Puede conservar:

```text
provider
database error
query identifier
```

si está protegido.

---

## 85. SOURCE HIGHLIGHTING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SOURCE HIGHLIGHTING

IDE/UI puede usar:

```text
SourceSpan
```

para señalar error.

---

## 86. DIAGNOSTIC SORTING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DIAGNOSTIC SORTING

Orden:

```text
source offset
severity
code
```

---

## 87. CASCADING ERRORS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CASCADING ERRORS

Analyzer debe reducir:

```text
duplicate downstream errors
```

---

## 88. ROOT CAUSE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ROOT CAUSE

Preferir mostrar:

```text
root cause
```

antes que cascada.

---

## 89. DIAGNOSTIC LIMIT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DIAGNOSTIC LIMIT

Compiler debe limitar:

```text
maxDiagnostics
```

---

## 90. ERROR FLOOD

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR FLOOD

Evitar producir millones de diagnostics por un Source pequeño.

---

## 91. LOGGING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

LOGGING

Structured logging obligatorio.

---

## 92. LOG FIELDS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

LOG FIELDS

Conceptualmente:

```text
timestamp
level
code
phase
executionId
requestId
tenantId
artifactHash
duration
```

según sensibilidad.

---

## 93. NO RAW SOURCE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO RAW SOURCE

No registrar Source completo por defecto.

---

## 94. NO RAW AEL VALUES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO RAW AEL VALUES

No registrar valores completos si contienen:

```text
financial
personal
sensitive
```

---

## 95. REDACTION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

REDACTION

Soportar:

```text
redaction
masking
hashing
```

según dato.

---

## 96. AUDIT VS LOG

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

AUDIT VS LOG

Separar:

```text
operational logs
audit events
```

---

## 97. AUDIT EVENT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

AUDIT EVENT

Debe representar:

```text
who
what
when
tenant
artifact
result
```

---

## 98. AUDIT IMMUTABILITY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

AUDIT IMMUTABILITY

Audit debe ser:

```text
append-only
```

cuando sea posible.

---

## 99. ERROR METRICS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR METRICS

```text
ael_error_total
ael_error_by_code
ael_error_by_phase
```

---

## 100. SECURITY ERROR METRICS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SECURITY ERROR METRICS

```text
ael_security_error_total
ael_auth_denied_total
ael_artifact_integrity_failure_total
```

---

## 101. PROVIDER ERROR METRICS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PROVIDER ERROR METRICS

```text
ael_provider_error_total
ael_provider_timeout_total
```

---

## 102. ERROR RATE ALERTING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR RATE ALERTING

Alertar ante:

```text
sudden error spikes
```

---

## 103. CORRELATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CORRELATION

Error debe poder rastrearse:

```text
request
→ execution
→ artifact
→ provider
→ database
```

---

## 104. TRACE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

TRACE

Distributed tracing puede utilizar:

```text
executionId
correlationId
```

---

## 105. SPANS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SPANS

Provider call puede representar:

```text
trace span
```

---

## 106. SECURITY REDACTION IN TRACE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SECURITY REDACTION IN TRACE

No incluir secrets ni sensitive payloads.

---

## 107. ERROR SERIALIZATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR SERIALIZATION

API response debe ser estable:

```ts
interface ErrorResponse {
  code: string
  message: string
  requestId?: string
}
```

---

## 108. NO INTERNAL STACK TRACE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO INTERNAL STACK TRACE

No devolver stack trace al cliente.

---

## 109. DEBUG MODE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DEBUG MODE

Sólo entornos autorizados.

---

## 110. ERROR DOCUMENTATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR DOCUMENTATION

Cada código público debe tener:

```text
meaning
cause
action
retryability
security relevance
```

---

## 111. ERROR REGISTRY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR REGISTRY

Mantener catálogo central:

```text
ErrorCodeRegistry
```

---

## 112. UNIQUE CODES

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

UNIQUE CODES

No duplicar códigos.

---

## 113. DEPRECATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DEPRECATION

Un código puede marcarse:

```text
deprecated
```

pero no reutilizarse.

---

## 114. VERSIONING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

VERSIONING

Si cambia la semántica de un error:

```text
new code
```

cuando sea necesario.

---

## 115. TESTING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

TESTING

Cada error crítico debe tener:

```text
unit test
integration test
```

cuando corresponda.

---

## 116. GOLDEN DIAGNOSTICS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

GOLDEN DIAGNOSTICS

Compiler fixtures deben verificar:

```text
expected codes
expected spans
```

---

## 117. SECURITY REGRESSION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

SECURITY REGRESSION

Security errors deben convertirse en:

```text
regression test
```

---

## 118. PROVIDER TESTS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PROVIDER TESTS

Provider debe probar:

```text
timeout
not found
invalid result
database failure
auth denial
```

---

## 119. RUNTIME TESTS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RUNTIME TESTS

Runtime debe probar:

```text
step limit
stack limit
timeout
cancellation
invalid state
```

---

## 120. VERIFIER TESTS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

VERIFIER TESTS

Verifier debe probar:

```text
invalid header
opcode
operand
stack
control flow
integrity
```

---

## 121. ERROR PRIORITY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR PRIORITY

Security errors deben tener prioridad sobre errores secundarios.

---

## 122. FAIL CLOSED

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

FAIL CLOSED

Errores de seguridad:

```text
deny
stop
audit
```

---

## 123. NO EXCEPTION SWALLOWING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO EXCEPTION SWALLOWING

No usar:

```text
catch { return null }
```

para ocultar errores.

---

## 124. NO ERROR MASKING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO ERROR MASKING

No reemplazar un error real por:

```text
generic success
```

---

## 125. ERROR BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR BOUNDARY

Cada capa debe traducir sólo errores que:

```text
le pertenecen
```

---

## 126. COMPILER BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

COMPILER BOUNDARY

Compiler traduce:

```text
parser/type/semantic
```

a diagnostics.

---

## 127. VERIFIER BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

VERIFIER BOUNDARY

Verifier produce:

```text
artifact verification errors
```

---

## 128. RUNTIME BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

RUNTIME BOUNDARY

Runtime produce:

```text
execution errors
```

---

## 129. PROVIDER BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PROVIDER BOUNDARY

Provider traduce:

```text
external failure
```

a:

```text
AEL-PROVIDER
```

---

## 130. DATABASE BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

DATABASE BOUNDARY

Database adapter traduce:

```text
database failure
```

a:

```text
AEL-DATABASE
```

---

## 131. API BOUNDARY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

API BOUNDARY

Application traduce AEL error a:

```text
HTTP status
safe ErrorResponse
```

---

## 132. HTTP MAPPING

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

HTTP MAPPING

Conceptualmente:

```text
AEL-AUTH
→ 403

AEL-ARTIFACT
→ 422

AEL-EXECUTION
→ 422/500 según caso

AEL-PROVIDER
→ 502/503

AEL-DATABASE
→ 500/503
```

La aplicación puede ajustar estos mappings según API policy.

---

## 133. NO DIRECT ERROR EXPOSURE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO DIRECT ERROR EXPOSURE

Nunca devolver:

```text
database exception
```

directamente.

---

## 134. CLIENT RETRY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

CLIENT RETRY

Sólo si:

```text
error.retryable
```

y API policy lo permite.

---

## 135. IDE ACTIONS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

IDE ACTIONS

Diagnostic puede sugerir:

```text
fix
documentation
dependency update
permission request
```

---

## 136. AUTOFIX

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

AUTOFIX

Sólo para transformaciones:

```text
safe
deterministic
```

---

## 137. NO AUTOFIX SEMANTIC

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

NO AUTOFIX SEMANTIC

No modificar automáticamente:

```text
business logic
```

---

## 138. ERROR UX

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR UX

Mensajes deben responder:

```text
What happened?
Where?
Why?
What can I do?
```

cuando sea posible.

---

## 139. EXAMPLE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

EXAMPLE

```text
AEL-TYPE-005
Moneda incompatible.

Source:
Línea 12, columna 18.

Se intentó combinar:
Money<COP>
con:
Money<USD>
```

---

## 140. INTERNAL CORRELATION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

INTERNAL CORRELATION

```text
requestId
executionId
artifactHash
```

permiten investigar sin revelar internals al usuario.

---

## 141. ERROR BUDGET

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR BUDGET

Monitoring puede definir:

```text
acceptable error rate
```

para Providers críticos.

---

## 142. ERROR SPIKE

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR SPIKE

Spike puede activar:

```text
alert
circuit breaker
investigation
```

---

## 143. ERROR RETENTION

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR RETENTION

Logs deben tener:

```text
retention policy
```

---

## 144. ERROR PRIVACY

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR PRIVACY

Error data debe respetar:

```text
data minimization
```

---

## 145. ERROR EXPORT

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR EXPORT

Exports de logs requieren:

```text
authorization
```

---

## 146. ERROR ACCESS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ERROR ACCESS

Tenant debe acceder sólo a:

```text
own operational errors
```

cuando corresponda.

---

## 147. ADMIN ACCESS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

ADMIN ACCESS

Administradores pueden tener acceso ampliado sujeto a:

```text
audit
```

---

## 148. EXIT CRITERIA — AEL-ERRORS

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

EXIT CRITERIA — AEL-ERRORS

```text
✓ Unified Diagnostic model
✓ Error domains
✓ Stable error codes
✓ Severity
✓ SourceSpan
✓ Compiler diagnostics
✓ Artifact errors
✓ Runtime errors
✓ Provider errors
✓ Database errors
✓ Auth errors
✓ Security errors
✓ Retryability
✓ Recoverability
✓ Error chains
✓ Safe external messages
✓ Structured logging
✓ Redaction
✓ Audit separation
✓ Metrics
✓ Tracing
✓ API mapping
✓ Error catalog
✓ Regression tests
✓ Fail-closed
```

---

## 149. FINAL ERROR FLOW

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

FINAL ERROR FLOW

```text
Source
 ↓
Lexer / Parser
 ↓
Diagnostic
 ↓
Semantic / Type
 ↓
Diagnostic
 ↓
Compiler
 ↓
Artifact
 ↓
Verifier
 ↓
Verification Error
 ↓
Runtime
 ↓
Provider
 ↓
Database / External API
 ↓
Mapped AEL Error
 ↓
Application
 ↓
Safe API Error
```

---

## 150. PRINCIPIO DE NO SILENCIO

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PRINCIPIO DE NO SILENCIO

```text
Error
≠
NULL
≠
0
≠
FALSE
≠
empty
```

salvo que la semántica del Contract lo defina explícitamente.

---

## 151. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PRINCIPIO DE TRAZABILIDAD

Cada error importante debe permitir recorrer:

```text
API Request
→ Execution
→ Artifact
→ Instruction
→ SourceSpan
→ Provider
→ Database
```

---

## 152. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Error Model & Diagnostics 43.md

PRINCIPIO DE SEGURIDAD

El diagnóstico debe ayudar al desarrollador:

```text
sin ayudar al atacante
```

---

## 153. OBJETIVO

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

OBJETIVO

Definir:

```text
Registry
Registry Snapshot
Contract Registry
Function Registry
Type Registry
Operator Registry
Provider Registry
Dependency Descriptor
Versioning
Compatibility
Definition Hash
Resolution
Locking
Publication
Activation
Retirement
Security
Tenant Scope
```

---

## 154. REGISTRIES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRIES

AEL utiliza registros especializados:

```text
ContractRegistry
FunctionRegistry
TypeRegistry
OperatorRegistry
ProviderRegistry
```

---

## 155. REGISTRY PRINCIPLE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY PRINCIPLE

Registry responde:

```text
¿Qué definición exacta representa este código/version?
```

No responde:

```text
¿Cuál parece ser la mejor definición?
```

---

## 156. IMMUTABILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

IMMUTABILITY

Una versión publicada debe ser:

```text
immutable
```

---

## 157. MUTATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

MUTATION

Modificar una definición publicada requiere:

```text
new version
```

---

## 158. SNAPSHOT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT

Compiler debe trabajar sobre:

```text
RegistrySnapshot
```

---

## 159. SNAPSHOT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT

Conceptualmente:

```ts
interface RegistrySnapshot {
  contracts: ContractRegistrySnapshot
  functions: FunctionRegistrySnapshot
  types: TypeRegistrySnapshot
  operators: OperatorRegistrySnapshot
  providers: ProviderRegistrySnapshot
  snapshotId: string
}
```

---

## 160. SNAPSHOT IMMUTABILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT IMMUTABILITY

Durante compilation:

```text
snapshot
```

no cambia.

---

## 161. SNAPSHOT ID

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT ID

Snapshot debe poder identificarse mediante:

```text
snapshotId
```

---

## 162. SNAPSHOT HASH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT HASH

Recomendado:

```text
registrySnapshotHash
```

para reproducibilidad.

---

## 163. COMPILER INPUT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

COMPILER INPUT

Compilation depende de:

```text
Source
CompilerVersion
RegistrySnapshot
CompilerOptions
```

---

## 164. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REPRODUCIBILITY

Mismo conjunto:

```text
Source
+
CompilerVersion
+
RegistrySnapshot
+
CompilerOptions
```

debe producir el mismo Artifact cuando el compiler sea determinista.

---

## 165. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CONTRACT REGISTRY

Registra:

```text
ContractCode
ContractVersion
Definition
ProviderReference
```

---

## 166. CONTRACT IDENTITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CONTRACT IDENTITY

Identity:

```text
code + version
```

---

## 167. CONTRACT DEFINITION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CONTRACT DEFINITION

Debe incluir como mínimo:

```text
code
version
returnType
nullable
capabilities
scope
provider
```

---

## 168. CONTRACT HASH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CONTRACT HASH

Definition debe tener:

```text
definitionHash
```

---

## 169. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FUNCTION REGISTRY

Registra:

```text
FunctionCode
FunctionVersion
Definition
AdapterReference
```

---

## 170. FUNCTION DEFINITION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FUNCTION DEFINITION

Debe declarar:

```text
name
version
arguments
returnType
purity
effects
capabilities
```

---

## 171. FUNCTION HASH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FUNCTION HASH

Definition debe tener:

```text
definitionHash
```

---

## 172. TYPE REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TYPE REGISTRY

Registra tipos extensibles si V1 los permite:

```text
TypeCode
TypeVersion
Definition
```

---

## 173. BUILT-IN TYPES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

BUILT-IN TYPES

Tipos core pueden formar parte del:

```text
Language Specification
```

y no requerir registry dinámico.

---

## 174. OPERATOR REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

OPERATOR REGISTRY

Registra operadores extensibles sólo si el diseño V1 los permite.

---

## 175. CORE OPERATORS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CORE OPERATORS

Operadores core deben pertenecer a:

```text
Language Semantics
```

---

## 176. PROVIDER REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PROVIDER REGISTRY

Relaciona:

```text
Contract
→ Provider
```

---

## 177. PROVIDER IDENTITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PROVIDER IDENTITY

Puede incluir:

```text
providerId
providerVersion
implementationHash
```

---

## 178. DEPENDENCY DESCRIPTOR

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY DESCRIPTOR

Artifact debe identificar sus dependencias explícitamente.

---

## 179. DEPENDENCY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY

Conceptualmente:

```ts
interface DependencyDescriptor {
  kind: DependencyKind
  code: string
  version: string
  definitionHash?: string
}
```

---

## 180. DEPENDENCY KIND

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY KIND

```text
CONTRACT
FUNCTION
TYPE
OPERATOR
PROVIDER
```

---

## 181. NO IMPLICIT DEPENDENCIES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

NO IMPLICIT DEPENDENCIES

Artifact no debe depender de:

```text
latest
current
default
```

sin version pinning.

---

## 182. EXACT VERSION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

EXACT VERSION

Preferido:

```text
exact version
```

---

## 183. VERSION RANGE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

VERSION RANGE

Compiler puede aceptar ranges internamente:

```text
^1.2
```

pero el Artifact publicado debe resolverlos a:

```text
exact version
```

---

## 184. LOCKING

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

LOCKING

Dependency resolution debe producir:

```text
lock set
```

---

## 185. LOCK SET

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

LOCK SET

Conceptualmente:

```text
dependency
→ exact version
→ definition hash
```

---

## 186. LOCK IMMUTABILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

LOCK IMMUTABILITY

Una vez compilado:

```text
lock set
```

forma parte de la identidad del Artifact.

---

## 187. DEPENDENCY HASH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY HASH

Definition hash protege contra:

```text
same version
different definition
```

---

## 188. HASH ALGORITHM

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

HASH ALGORITHM

Debe utilizarse un algoritmo criptográfico moderno:

```text
SHA-256
```

o equivalente aprobado.

---

## 189. CANONICAL DEFINITION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CANONICAL DEFINITION

Hash debe calcularse sobre una representación:

```text
canonical
deterministic
```

---

## 190. CANONICALIZATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CANONICALIZATION

No depender de:

```text
object property insertion order
```

---

## 191. JSON CANONICALIZATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

JSON CANONICALIZATION

Si se utiliza JSON:

```text
canonical JSON
```

debe estar definido.

---

## 192. REGISTRY SNAPSHOT HASH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY SNAPSHOT HASH

Hash de:

```text
canonical registry snapshot
```

---

## 193. RESOLUTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RESOLUTION

Compiler:

```text
Source reference
→ Registry
→ Definition
→ Compatibility
→ Exact dependency
```

---

## 194. RESOLUTION FAILURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RESOLUTION FAILURE

Si no existe:

```text
AEL-SEMANTIC-002
```

o código específico de dependency resolution.

---

## 195. VERSION FAILURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

VERSION FAILURE

Si version incompatible:

```text
AEL-CONFIG-003
```

o código específico de compatibility.

---

## 196. AMBIGUOUS RESOLUTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

AMBIGUOUS RESOLUTION

Si dos definiciones pueden resolver el mismo reference:

```text
fail
```

---

## 197. NO HEURISTIC RESOLUTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

NO HEURISTIC RESOLUTION

No resolver mediante:

```text
closest match
similar name
latest version
```

---

## 198. CASE SENSITIVITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CASE SENSITIVITY

Registry debe definir explícitamente:

```text
case sensitivity
```

para códigos.

---

## 199. RECOMMENDATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RECOMMENDATION

Preferir:

```text
case-sensitive identifiers
```

para evitar colisiones ambiguas.

---

## 200. NAMESPACE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

NAMESPACE

Registry puede soportar:

```text
namespace.code
```

---

## 201. TENANT NAMESPACE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TENANT NAMESPACE

Si existen definiciones tenant-specific:

```text
tenantId + namespace + code + version
```

---

## 202. GLOBAL DEFINITIONS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

GLOBAL DEFINITIONS

Global definitions deben tener:

```text
global scope
```

explícito.

---

## 203. TENANT DEFINITIONS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TENANT DEFINITIONS

Tenant-specific definitions deben ser:

```text
tenant scoped
```

---

## 204. CROSS-TENANT RESOLUTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CROSS-TENANT RESOLUTION

Un tenant no debe resolver:

```text
private dependency
```

de otro tenant.

---

## 205. PUBLIC DEFINITIONS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PUBLIC DEFINITIONS

Una definición puede ser:

```text
PUBLIC
```

si el modelo de negocio lo permite.

---

## 206. PRIVATE DEFINITIONS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRIVATE DEFINITIONS

Puede existir:

```text
PRIVATE
```

scope.

---

## 207. VISIBILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

VISIBILITY

Registry debe soportar:

```text
visibility
```

---

## 208. ACCESS CONTROL

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

ACCESS CONTROL

Resolver debe verificar:

```text
tenant
visibility
authorization
```

---

## 209. REGISTRY AUTHORITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY AUTHORITY

Registry no puede conceder:

```text
runtime capability
```

---

## 210. CAPABILITY SEPARATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CAPABILITY SEPARATION

Registry describe:

```text
required capabilities
```

pero ExecutionContext decide:

```text
granted capabilities
```

---

## 211. PROVIDER COMPATIBILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PROVIDER COMPATIBILITY

Provider debe ser compatible con:

```text
Contract version
```

---

## 212. FUNCTION ADAPTER COMPATIBILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FUNCTION ADAPTER COMPATIBILITY

Adapter debe ser compatible con:

```text
Function definition
```

---

## 213. SEMANTIC VERSIONING

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SEMANTIC VERSIONING

Recomendado:

```text
MAJOR.MINOR.PATCH
```

---

## 214. PATCH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PATCH

Patch:

```text
bug fix
```

sin cambio semántico.

---

## 215. MINOR

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

MINOR

Minor:

```text
backward-compatible addition
```

---

## 216. MAJOR

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

MAJOR

Major:

```text
breaking semantic change
```

---

## 217. VERSION RULE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

VERSION RULE

Compiler debe impedir:

```text
incompatible dependency
```

---

## 218. ARTIFACT COMPATIBILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

ARTIFACT COMPATIBILITY

Artifact debe declarar:

```text
languageVersion
artifactFormatVersion
runtimeSemanticsVersion
```

---

## 219. REGISTRY COMPATIBILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY COMPATIBILITY

Runtime debe comprobar:

```text
artifact dependencies
registry versions
```

---

## 220. NO LATEST AT RUNTIME

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

NO LATEST AT RUNTIME

Runtime no debe reinterpretar:

```text
latest
```

---

## 221. RESOLUTION AT COMPILE TIME

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RESOLUTION AT COMPILE TIME

Preferido:

```text
resolve
→ lock
→ compile
```

---

## 222. RUNTIME RESOLUTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RUNTIME RESOLUTION

Runtime sólo valida y carga:

```text
exact dependency
```

---

## 223. DEPENDENCY AVAILABILITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY AVAILABILITY

Si falta una dependency:

```text
execution fails safely
```

---

## 224. REGISTRY SNAPSHOT FOR RUNTIME

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY SNAPSHOT FOR RUNTIME

Runtime puede utilizar:

```text
runtime registry snapshot
```

compatible con Artifact.

---

## 225. PROVIDER IMPLEMENTATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PROVIDER IMPLEMENTATION

Provider puede actualizarse sin recompilar sólo si:

```text
semantic compatibility
definition hash policy
```

lo permiten.

---

## 226. SAFE PROVIDER UPDATE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SAFE PROVIDER UPDATE

Provider implementation update debe pasar:

```text
compatibility tests
```

---

## 227. BREAKING PROVIDER UPDATE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

BREAKING PROVIDER UPDATE

Requiere:

```text
new provider version
```

y posiblemente:

```text
new Contract version
```

---

## 228. REGISTRY PUBLICATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY PUBLICATION

Publication workflow:

```text
Draft
 ↓
Validate
 ↓
Test
 ↓
Approve
 ↓
Publish
```

---

## 229. ACTIVE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

ACTIVE

Published definition puede pasar:

```text
ACTIVE
```

---

## 230. RETIRED

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RETIRED

Definition puede pasar:

```text
RETIRED
```

---

## 231. REVOKED

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REVOKED

Security issue:

```text
REVOKED
```

---

## 232. STATUS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

STATUS

Conceptualmente:

```ts
type RegistryStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED' | 'REVOKED'
```

---

## 233. RETIRED DEPENDENCY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RETIRED DEPENDENCY

No utilizar para nuevos Artifacts salvo policy explícita.

---

## 234. REVOKED DEPENDENCY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REVOKED DEPENDENCY

No puede utilizarse para nuevas executions.

---

## 235. EXISTING ARTIFACT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

EXISTING ARTIFACT

Si una dependency es revoked:

```text
existing Artifact
```

debe quedar sujeto a:

```text
security policy
```

---

## 236. EMERGENCY REVOCATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

EMERGENCY REVOCATION

Debe existir mecanismo:

```text
dependency revoke
```

sin recompilar todo el sistema.

---

## 237. REVOCATION CHECK

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REVOCATION CHECK

Runtime puede consultar:

```text
revocation state
```

antes de ejecutar.

---

## 238. PERFORMANCE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PERFORMANCE

Revocation state puede utilizar:

```text
cache
```

con TTL corto y política segura.

---

## 239. FAIL CLOSED REVOCATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FAIL CLOSED REVOCATION

Si la policy exige verificación online y no puede confirmarse:

```text
deny
```

para dependencies críticas.

---

## 240. REGISTRY AUDIT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY AUDIT

Registrar:

```text
created
updated
published
activated
retired
revoked
```

---

## 241. AUDIT ACTOR

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

AUDIT ACTOR

Cada cambio debe identificar:

```text
actor
```

---

## 242. AUDIT REASON

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

AUDIT REASON

Cambios sensibles deben tener:

```text
reason
```

---

## 243. APPROVAL

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

APPROVAL

Production publication puede requerir:

```text
reviewer
```

diferente del author.

---

## 244. SEPARATION OF DUTIES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SEPARATION OF DUTIES

Para cambios críticos:

```text
author != approver
```

cuando el proceso lo requiera.

---

## 245. REGISTRY STORAGE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY STORAGE

Registry puede almacenarse en:

```text
PostgreSQL
```

siempre que:

```text
immutability
audit
versioning
```

sean garantizados.

---

## 246. REGISTRY TABLES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY TABLES

Conceptualmente:

```text
contracts
functions
types
operators
providers
registry_versions
registry_dependencies
```

---

## 247. DATABASE CONSTRAINTS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DATABASE CONSTRAINTS

Registry DB debe aplicar:

```text
UNIQUE
NOT NULL
FOREIGN KEY
CHECK
```

---

## 248. TENANT SCOPING

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TENANT SCOPING

Registry records tenant-scoped deben tener:

```text
tenant_id
```

---

## 249. RLS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RLS

Registry tenant data debe protegerse mediante:

```text
RLS
```

---

## 250. GLOBAL REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

GLOBAL REGISTRY

Core definitions pueden residir en:

```text
global scope
```

---

## 251. GLOBAL + TENANT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

GLOBAL + TENANT

Resolver puede combinar:

```text
global definitions
+
tenant definitions
```

sólo mediante reglas explícitas.

---

## 252. OVERRIDE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

OVERRIDE

Tenant override debe ser:

```text
explicitly supported
```

no una colisión accidental.

---

## 253. OVERRIDE POLICY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

OVERRIDE POLICY

Debe definir:

```text
which global definitions can be overridden
```

---

## 254. SECURITY-SENSITIVE DEFINITIONS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SECURITY-SENSITIVE DEFINITIONS

Definitions de:

```text
auth
security
financial calculations
```

pueden requerir:

```text
global-only
```

o aprobación especial.

---

## 255. REGISTRY SNAPSHOT CREATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY SNAPSHOT CREATION

Snapshot debe:

```text
resolve dependencies
canonicalize definitions
calculate hash
freeze
```

---

## 256. SNAPSHOT CONTENT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT CONTENT

Debe contener suficiente información para reproducir:

```text
semantic compilation
```

---

## 257. SNAPSHOT NOT NECESSARILY FULL REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT NOT NECESSARILY FULL REGISTRY

Puede contener sólo:

```text
resolved dependencies
```

si la especificación lo define así.

---

## 258. LOCKFILE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

LOCKFILE

AEL puede utilizar un lock representation:

```text
ael.lock
```

durante development.

---

## 259. PRODUCTION ARTIFACT

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRODUCTION ARTIFACT

Production Artifact debe incorporar:

```text
resolved dependency set
```

---

## 260. LOCK DIFF

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

LOCK DIFF

Cambios de dependency deben poder revisarse.

---

## 261. DEPENDENCY UPDATE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY UPDATE

Updating dependency requiere:

```text
recompile
reverify
retest
```

---

## 262. AUTOMATIC UPDATE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

AUTOMATIC UPDATE

No realizar automáticamente en production.

---

## 263. DEPENDENCY CONFUSION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY CONFUSION

Registry namespace debe evitar:

```text
same name
different authority
```

---

## 264. TRUSTED REGISTRIES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TRUSTED REGISTRIES

Sólo registries autorizados pueden publicar:

```text
production dependencies
```

---

## 265. REGISTRY SOURCE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY SOURCE

Artifact debe declarar:

```text
registry identity
```

cuando corresponda.

---

## 266. SIGNATURES

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SIGNATURES

Futuro recomendado:

```text
registry definition signatures
```

---

## 267. ARTIFACT SIGNATURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

ARTIFACT SIGNATURE

Production puede exigir:

```text
signed Artifact
```

---

## 268. DEFINITION SIGNATURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEFINITION SIGNATURE

Security-sensitive definitions pueden requerir:

```text
signed definition
```

---

## 269. INTEGRITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

INTEGRITY

Hash garantiza:

```text
content identity
```

No garantiza por sí solo:

```text
authority
```

---

## 270. AUTHORITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

AUTHORITY

Authority debe venir de:

```text
trusted registry
signature
access control
```

---

## 271. RESOLUTION CACHE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RESOLUTION CACHE

Resolver puede cachear:

```text
code + version
→ definition
```

---

## 272. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

CACHE INVALIDATION

Invalidar al cambiar:

```text
definition version
status
revocation
```

---

## 273. TENANT CACHE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TENANT CACHE

Cache debe incluir:

```text
tenant scope
```

cuando corresponda.

---

## 274. REGISTRY CONCURRENCY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY CONCURRENCY

Publication debe ser:

```text
atomic
```

---

## 275. VERSION COLLISION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

VERSION COLLISION

No permitir publicar:

```text
same code + version
different hash
```

---

## 276. IMMUTABLE VERSION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

IMMUTABLE VERSION

Una vez ACTIVE:

```text
code + version + hash
```

queda fijado.

---

## 277. REGISTRY RACE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY RACE

Dos publicaciones simultáneas deben resolverse mediante:

```text
transaction / optimistic locking
```

---

## 278. PROVIDER HEALTH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PROVIDER HEALTH

Registry puede almacenar:

```text
health metadata
```

pero no debe modificar semántica del Contract.

---

## 279. DEPENDENCY HEALTH

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY HEALTH

Provider unavailable no significa automáticamente:

```text
dependency invalid
```

---

## 280. AVAILABILITY VS VALIDITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

AVAILABILITY VS VALIDITY

Separar:

```text
valid dependency
```

de:

```text
currently available provider
```

---

## 281. REGISTRY FAILURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY FAILURE

Si Registry no está disponible durante compilation:

```text
compilation fails
```

---

## 282. RUNTIME REGISTRY FAILURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RUNTIME REGISTRY FAILURE

Si runtime necesita registry state crítico y no puede validarlo:

```text
policy-dependent fail closed
```

---

## 283. OFFLINE EXECUTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

OFFLINE EXECUTION

Artifact puede ejecutarse offline sólo si:

```text
all dependencies
and revocation policy
```

permiten hacerlo.

---

## 284. DEPENDENCY MATERIALIZATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY MATERIALIZATION

VerifiedArtifact puede contener metadata necesaria para evitar resolution dinámica.

---

## 285. NO CODE INJECTION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

NO CODE INJECTION

Registry definition no debe introducir:

```text
arbitrary executable code
```

en Artifact.

---

## 286. PROVIDER CODE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PROVIDER CODE

Executable implementation pertenece al deployment de:

```text
trusted Provider
```

---

## 287. FUNCTION CODE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FUNCTION CODE

Executable Function Adapter pertenece al deployment controlado.

---

## 288. REGISTRY DATA

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY DATA

Registry almacena:

```text
metadata
definitions
contracts
references
```

no necesariamente:

```text
executable implementation
```

---

## 289. REGISTRY SECURITY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY SECURITY

Registry debe aplicar:

```text
authentication
authorization
audit
RLS
```

cuando sea tenant-scoped.

---

## 290. REGISTRY BACKUP

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY BACKUP

Debe existir:

```text
backup
restore
integrity verification
```

---

## 291. REGISTRY DISASTER RECOVERY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY DISASTER RECOVERY

Production debe poder reconstruir:

```text
active registry state
```

---

## 292. REGISTRY MIGRATION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY MIGRATION

Schema changes deben usar:

```text
versioned migrations
```

---

## 293. COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

COMPATIBILITY MATRIX

Mantener matriz:

```text
Language Version
Artifact Format
Compiler
Verifier
Runtime
Registry Schema
```

---

## 294. COMPATIBILITY CHECK

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

COMPATIBILITY CHECK

Antes de execution:

```text
Artifact
↔ Runtime
↔ Dependencies
```

---

## 295. UNSUPPORTED VERSION

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

UNSUPPORTED VERSION

Debe fallar con error explícito.

---

## 296. NO SILENT DOWNGRADE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

NO SILENT DOWNGRADE

No ejecutar un Artifact con:

```text
older semantics
```

sin compatibility contract explícito.

---

## 297. TESTING

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

TESTING

Registry debe tener:

```text
unit
integration
security
concurrency
migration
```

tests.

---

## 298. REGISTRY TESTS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

REGISTRY TESTS

Probar:

```text
publish
activate
retire
revoke
resolve
snapshot
hash
collision
tenant isolation
```

---

## 299. DEPENDENCY TESTS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

DEPENDENCY TESTS

Probar:

```text
exact version
wrong version
missing dependency
hash mismatch
revoked dependency
```

---

## 300. SNAPSHOT TESTS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SNAPSHOT TESTS

Mismo registry state:

```text
same snapshot hash
```

---

## 301. RESOLUTION DETERMINISM

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

RESOLUTION DETERMINISM

Mismo snapshot:

```text
same reference
→ same dependency
```

---

## 302. SECURITY TESTS

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

SECURITY TESTS

Intentar:

```text
cross-tenant dependency
unauthorized publish
version collision
hash substitution
revoked dependency
```

---

## 303. EXIT CRITERIA — AEL-REGISTRY

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

EXIT CRITERIA — AEL-REGISTRY

```text
✓ Contract Registry
✓ Function Registry
✓ Type Registry
✓ Operator Registry
✓ Provider Registry
✓ Registry Snapshot
✓ Dependency Descriptor
✓ Exact versioning
✓ Locking
✓ Definition hashes
✓ Canonicalization
✓ Resolution determinism
✓ Tenant scope
✓ Visibility
✓ Publication lifecycle
✓ Revocation
✓ Audit
✓ Approval
✓ Dependency compatibility
✓ Registry security
✓ Cache policy
✓ Concurrency
✓ Migration
✓ Disaster recovery
✓ Conformance tests
```

---

## 304. FINAL REGISTRY ARCHITECTURE

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

FINAL REGISTRY ARCHITECTURE

```text
                 Registry
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   Contracts      Functions      Types
       │             │             │
       └─────────────┼─────────────┘
                     ▼
               Dependencies
                     │
                     ▼
              Registry Snapshot
                     │
                     ▼
                  Compiler
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
              Exact Providers
```

---

## 305. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRINCIPIO DE DETERMINISMO

```text
same snapshot
+
same reference
=
same dependency
```

---

## 306. PRINCIPIO DE INTEGRIDAD

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRINCIPIO DE INTEGRIDAD

```text
version
+
definition hash
```

identifican exactamente una definición.

---

## 307. PRINCIPIO DE AUTORIDAD

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRINCIPIO DE AUTORIDAD

```text
hash
```

prueba integridad.

```text
registry/signature/ACL
```

prueba autoridad.

---

## 308. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRINCIPIO DE AISLAMIENTO

Tenant-specific definitions deben permanecer:

```text
tenant-scoped
```

---

## 309. PRINCIPIO DE NO "LATEST"

> **Origen:** Motor de liquidacion_Registry & Dependency Management 45.md

PRINCIPIO DE NO "LATEST"

En producción:

```text
latest
```

no es una dependencia válida.

---

## 310. OBJETIVO

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

OBJETIVO

Definir versionamiento para:

```text
Language
Compiler
Artifact Format
Runtime Semantics
Contracts
Functions
Types
Operators
Providers
Registry
Rules
```

---

## 311. VERSION DIMENSIONS

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION DIMENSIONS

AEL no utiliza una única versión para todo.

Debe distinguir:

```text
languageVersion
compilerVersion
artifactFormatVersion
runtimeSemanticsVersion
registrySchemaVersion
contractVersion
functionVersion
providerVersion
```

---

## 312. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

LANGUAGE VERSION

Representa:

```text
syntax
grammar
language semantics
type semantics
operator semantics
control-flow semantics
```

---

## 313. COMPILER VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPILER VERSION

Identifica:

```text
compiler implementation
```

No significa automáticamente:

```text
language version
```

---

## 314. ARTIFACT FORMAT VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT FORMAT VERSION

Representa:

```text
binary/serialized Artifact structure
```

---

## 315. RUNTIME SEMANTICS VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RUNTIME SEMANTICS VERSION

Representa:

```text
execution behavior
```

---

## 316. REGISTRY SCHEMA VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REGISTRY SCHEMA VERSION

Representa:

```text
storage structure of Registry
```

---

## 317. CONTRACT VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CONTRACT VERSION

Representa:

```text
Contract semantics
return type
nullability
capabilities
```

---

## 318. FUNCTION VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FUNCTION VERSION

Representa:

```text
Function semantics
arguments
return type
effects
```

---

## 319. PROVIDER VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PROVIDER VERSION

Representa:

```text
implementation compatibility
```

---

## 320. VERSION IDENTITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION IDENTITY

Un Artifact debe declarar:

```text
languageVersion
artifactFormatVersion
runtimeSemanticsVersion
```

y sus dependencies exactas.

---

## 321. ARTIFACT IDENTITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT IDENTITY

Conceptualmente:

```text
artifactId
artifactVersion
artifactHash
```

---

## 322. ARTIFACT HASH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT HASH

Hash identifica:

```text
exact Artifact bytes/content
```

---

## 323. IMMUTABILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

IMMUTABILITY

Published Artifact:

```text
immutable
```

---

## 324. RULE VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RULE VERSION

Una Rule publicada debe asociarse a:

```text
exact Artifact
```

---

## 325. NO RECOMPILE SILENT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

NO RECOMPILE SILENT

Actualizar Compiler no debe recompilar automáticamente Rules existentes.

---

## 326. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REPRODUCIBILITY

Debe ser posible determinar:

```text
qué Compiler
qué Registry
qué dependencies
qué options
```

produjeron el Artifact.

---

## 327. COMPILER METADATA

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPILER METADATA

Artifact puede almacenar:

```text
compilerVersion
compilerBuildId
```

---

## 328. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REGISTRY SNAPSHOT

Artifact debe asociarse a:

```text
registrySnapshotHash
```

---

## 329. DEPENDENCY LOCK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DEPENDENCY LOCK

Artifact debe contener:

```text
exact dependency versions
definition hashes
```

---

## 330. SEMANTIC VERSIONING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SEMANTIC VERSIONING

Para componentes versionables:

```text
MAJOR.MINOR.PATCH
```

---

## 331. MAJOR

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MAJOR

Breaking change.

---

## 332. MINOR

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MINOR

Backward-compatible functionality.

---

## 333. PATCH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PATCH

Backward-compatible correction.

---

## 334. BREAKING LANGUAGE CHANGE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

BREAKING LANGUAGE CHANGE

Ejemplos:

```text
operator changes meaning
type compatibility changes
syntax becomes invalid
null semantics changes
evaluation order changes
```

requieren:

```text
new language version
```

---

## 335. NON-BREAKING LANGUAGE CHANGE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

NON-BREAKING LANGUAGE CHANGE

Puede incluir:

```text
new syntax
new function
new optional feature
```

si no altera semantics existentes.

---

## 336. COMPILER PATCH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPILER PATCH

Compiler patch debe preservar:

```text
language semantics
```

---

## 337. COMPILER MINOR

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPILER MINOR

Puede incluir:

```text
optimization
diagnostics
new compatible features
```

---

## 338. COMPILER MAJOR

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPILER MAJOR

Puede modificar:

```text
compilation behavior
supported language version
```

---

## 339. ARTIFACT FORMAT BREAK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT FORMAT BREAK

Si cambia:

```text
binary structure
opcode encoding
constant pool format
```

se requiere:

```text
new artifactFormatVersion
```

---

## 340. RUNTIME COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RUNTIME COMPATIBILITY

Runtime debe declarar qué:

```text
artifactFormatVersions
runtimeSemanticsVersions
```

soporta.

---

## 341. NO FUTURE ARTIFACT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

NO FUTURE ARTIFACT

Runtime no debe aceptar silenciosamente:

```text
future Artifact format
```

---

## 342. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

BACKWARD COMPATIBILITY

Runtime puede soportar:

```text
older Artifact versions
```

si existe compatibility contract explícito.

---

## 343. FORWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FORWARD COMPATIBILITY

No asumir.

---

## 344. COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPATIBILITY MATRIX

Mantener matriz:

```text
Artifact Format
Runtime
Language
Compiler
Registry
```

---

## 345. EXAMPLE MATRIX

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

EXAMPLE MATRIX

```text
Artifact V1 + Runtime V1       ✓
Artifact V1 + Runtime V2       ✓ si compatible
Artifact V2 + Runtime V1       ✗
```

---

## 346. RUNTIME ADAPTER

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RUNTIME ADAPTER

Si se soporta un Artifact antiguo:

```text
Artifact
→ Compatibility Adapter
→ Current Runtime
```

---

## 347. ADAPTER SAFETY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ADAPTER SAFETY

Adapter no debe alterar:

```text
business semantics
```

---

## 348. DEPRECATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DEPRECATION

Feature puede marcarse:

```text
DEPRECATED
```

antes de eliminarse.

---

## 349. DEPRECATION PERIOD

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DEPRECATION PERIOD

Debe existir periodo suficiente para:

```text
migration
testing
```

---

## 350. REMOVAL

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REMOVAL

Eliminar feature requiere:

```text
new language version
```

si es breaking.

---

## 351. CONTRACT COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CONTRACT COMPATIBILITY

Un Contract nuevo puede ser compatible si mantiene:

```text
same semantic meaning
compatible return type
compatible nullability
compatible capabilities
```

---

## 352. CONTRACT BREAKING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CONTRACT BREAKING

Breaking examples:

```text
return type changed
field removed
meaning changed
nullability changed
required capability added
```

---

## 353. FUNCTION COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FUNCTION COMPATIBILITY

Function compatible si mantiene:

```text
arguments
return type
semantic behavior
effects
```

---

## 354. FUNCTION BREAKING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FUNCTION BREAKING

Ejemplos:

```text
argument removed
argument meaning changed
return type changed
side effect introduced
```

---

## 355. PROVIDER COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PROVIDER COMPATIBILITY

Provider puede cambiar implementation si mantiene:

```text
Contract semantics
```

---

## 356. PROVIDER BREAKING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PROVIDER BREAKING

Provider version debe cambiar si altera:

```text
observable behavior
availability guarantees
security assumptions
data semantics
```

---

## 357. SECURITY BREAK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SECURITY BREAK

Security change debe tratarse como:

```text
potentially breaking
```

aunque API parezca compatible.

---

## 358. REQUIRED CAPABILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REQUIRED CAPABILITY

Agregar una nueva capability requerida por Contract puede romper existing executions.

---

## 359. CAPABILITY VERSIONING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CAPABILITY VERSIONING

Capability identifiers deben ser:

```text
stable
explicit
```

---

## 360. ARTIFACT MIGRATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT MIGRATION

No modificar bytes de un Artifact publicado.

---

## 361. MIGRATION MODEL

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION MODEL

Crear:

```text
old Artifact
→ migration tool
→ new Source/Artifact
```

---

## 362. SOURCE-BASED MIGRATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SOURCE-BASED MIGRATION

Preferida cuando:

```text
Source available
```

---

## 363. ARTIFACT-BASED MIGRATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT-BASED MIGRATION

Sólo cuando exista:

```text
safe deterministic migration
```

---

## 364. MIGRATION REVIEW

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION REVIEW

Breaking migrations requieren:

```text
review
tests
approval
```

---

## 365. MIGRATION DRY RUN

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION DRY RUN

Debe poder ejecutarse:

```text
dry-run
```

antes de activar nueva versión.

---

## 366. MIGRATION DIFF

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION DIFF

Mostrar:

```text
old dependency
new dependency
semantic changes
```

---

## 367. RULE MIGRATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RULE MIGRATION

Una Rule puede tener:

```text
current Artifact
candidate Artifact
```

---

## 368. DUAL RUN

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DUAL RUN

Para Rules críticas:

```text
old Artifact
new Artifact
```

pueden ejecutarse en paralelo controlado.

---

## 369. RESULT COMPARISON

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RESULT COMPARISON

Comparar:

```text
value
error
provider calls
```

según política.

---

## 370. FINANCIAL RULES

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FINANCIAL RULES

Para liquidaciones financieras:

```text
difference detection
```

debe ser especialmente estricta.

---

## 371. MIGRATION APPROVAL

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION APPROVAL

Una diferencia puede requerir:

```text
manual approval
```

---

## 372. ROLLBACK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ROLLBACK

Debe ser posible volver a:

```text
previous Artifact
```

si sigue siendo válido y no está revoked.

---

## 373. NO IN-PLACE ROLLBACK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

NO IN-PLACE ROLLBACK

Rollback cambia:

```text
active version
```

no modifica Artifact.

---

## 374. ARTIFACT LIFECYCLE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

ARTIFACT LIFECYCLE

```text
DRAFT
 ↓
COMPILED
 ↓
VERIFIED
 ↓
APPROVED
 ↓
ACTIVE
 ↓
RETIRED
```

Puede existir:

```text
REVOKED
```

por seguridad.

---

## 375. VERSION STATUS

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION STATUS

Status pertenece a:

```text
Artifact Registry
```

---

## 376. IMMUTABLE PUBLISHED VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

IMMUTABLE PUBLISHED VERSION

Una vez ACTIVE:

```text
content cannot change
```

---

## 377. REPRODUCIBLE BUILD

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REPRODUCIBLE BUILD

Debe conservar:

```text
Source hash
Compiler version
Compiler build
Registry snapshot
Dependency lock
Compiler options
```

---

## 378. BUILD MANIFEST

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

BUILD MANIFEST

Artifact puede incluir:

```text
BuildManifest
```

---

## 379. BUILD MANIFEST

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

BUILD MANIFEST

Conceptualmente:

```ts
interface BuildManifest {
  sourceHash: string
  compilerVersion: string
  compilerBuildId: string
  registrySnapshotHash: string
  dependencies: DependencyDescriptor[]
  compilerOptionsHash: string
}
```

---

## 380. SOURCE HASH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SOURCE HASH

Source hash permite identificar:

```text
exact source input
```

sin almacenar Source dentro del Artifact.

---

## 381. OPTIONS HASH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

OPTIONS HASH

Compiler options deben formar parte de reproducibility identity.

---

## 382. RUNTIME POLICY VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RUNTIME POLICY VERSION

Runtime limits/security policy pueden versionarse:

```text
runtimePolicyVersion
```

---

## 383. POLICY COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

POLICY COMPATIBILITY

Policy más restrictiva puede rechazar execution sin alterar semantics.

---

## 384. POLICY BREAK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

POLICY BREAK

Cambiar policy para permitir algo antes prohibido requiere:

```text
security review
```

---

## 385. REGISTRY EVOLUTION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REGISTRY EVOLUTION

Registry schema puede cambiar sin cambiar:

```text
AEL language
```

si migration mantiene semantic model.

---

## 386. REGISTRY API VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REGISTRY API VERSION

Si existe API pública:

```text
registryApiVersion
```

puede versionarse separadamente.

---

## 387. DATABASE MIGRATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DATABASE MIGRATION

Registry schema migrations deben mantener:

```text
active Artifacts resolvable
```

durante transición.

---

## 388. COMPATIBILITY WINDOW

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPATIBILITY WINDOW

Durante deployment puede existir:

```text
old + new
```

compatibility window.

---

## 389. EXPAND-CONTRACT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

EXPAND-CONTRACT

Database evolution preferida:

```text
Expand
 ↓
Migrate
 ↓
Switch
 ↓
Contract
```

---

## 390. EXPAND

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

EXPAND

Agregar estructura compatible.

---

## 391. MIGRATE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATE

Mover datos/definitions.

---

## 392. SWITCH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SWITCH

Cambiar Provider/Registry.

---

## 393. CONTRACT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CONTRACT

Eliminar estructura antigua después de verificar.

---

## 394. PROVIDER DEPLOYMENT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PROVIDER DEPLOYMENT

Provider nuevo puede desplegarse:

```text
side-by-side
```

con versión anterior.

---

## 395. PROVIDER CUTOVER

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PROVIDER CUTOVER

Cambiar Registry reference:

```text
old
→ new
```

sin mutar Artifact existente.

---

## 396. EXISTING ARTIFACT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

EXISTING ARTIFACT

Debe seguir ejecutándose con:

```text
compatible Provider
```

o policy explícita de migration.

---

## 397. COMPATIBILITY CHECK AT ACTIVATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPATIBILITY CHECK AT ACTIVATION

Antes de activar Artifact:

```text
Compiler
Verifier
Runtime
Registry
Providers
```

compatibility debe validarse.

---

## 398. COMPATIBILITY CHECK AT EXECUTION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPATIBILITY CHECK AT EXECUTION

Runtime puede repetir checks críticos:

```text
artifact format
dependency availability
revocation
```

---

## 399. NO SILENT SEMANTIC UPGRADE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

NO SILENT SEMANTIC UPGRADE

Runtime no debe cambiar:

```text
semantics
```

porque apareció una nueva versión.

---

## 400. LANGUAGE VERSION PINNING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

LANGUAGE VERSION PINNING

Artifact debe fijar:

```text
languageVersion
```

---

## 401. RUNTIME SEMANTICS PINNING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RUNTIME SEMANTICS PINNING

Artifact debe fijar:

```text
runtimeSemanticsVersion
```

---

## 402. CONTRACT PINNING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CONTRACT PINNING

Dependency descriptor debe fijar:

```text
contractVersion
definitionHash
```

---

## 403. FUNCTION PINNING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FUNCTION PINNING

Debe fijar:

```text
functionVersion
definitionHash
```

---

## 404. PROVIDER PINNING

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PROVIDER PINNING

Debe fijar:

```text
providerVersion
```

cuando la policy lo requiera.

---

## 405. VERSION DRIFT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION DRIFT

Detectar:

```text
Artifact expects V1
Registry exposes incompatible V2
```

---

## 406. DRIFT RESPONSE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DRIFT RESPONSE

Resultado:

```text
execution denied
```

o compatibility adapter explícito.

---

## 407. SECURITY PATCH

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SECURITY PATCH

Security patch puede desplegarse sin cambiar:

```text
languageVersion
```

si no altera semantics.

---

## 408. SECURITY PATCH PROVIDER

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SECURITY PATCH PROVIDER

Provider security fix:

```text
same Contract
new Provider patch version
```

si semantics remains compatible.

---

## 409. SECURITY REVOCATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

SECURITY REVOCATION

Si no es posible mantener compatibility segura:

```text
revoke old dependency
```

---

## 410. BREAKING CHANGE POLICY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

BREAKING CHANGE POLICY

Cada breaking change debe documentar:

```text
what changed
why
affected versions
migration
rollback
```

---

## 411. CHANGELOG

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CHANGELOG

Mantener:

```text
AEL CHANGELOG
```

---

## 412. MIGRATION GUIDE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION GUIDE

Cada major version debe incluir:

```text
migration guide
```

---

## 413. COMPATIBILITY NOTES

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPATIBILITY NOTES

Cada release debe indicar:

```text
supported versions
deprecated features
breaking changes
security changes
```

---

## 414. TEST MATRIX PER RELEASE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TEST MATRIX PER RELEASE

Ejecutar:

```text
language conformance
artifact conformance
runtime conformance
registry compatibility
provider compatibility
RLS tests
```

---

## 415. GOLDEN COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

GOLDEN COMPATIBILITY

Artifacts históricos seleccionados deben continuar:

```text
validating/executing
```

si la policy promete backward compatibility.

---

## 416. LEGACY ARTIFACT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

LEGACY ARTIFACT

Legacy Artifact puede estar:

```text
SUPPORTED
DEPRECATED
RETIRED
REVOKED
```

---

## 417. RETIREMENT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

RETIREMENT

Retirement debe tener:

```text
date
reason
migration path
```

---

## 418. REVOKED

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

REVOKED

Revoked significa:

```text
security/critical invalidation
```

---

## 419. EXECUTION OF RETIRED

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

EXECUTION OF RETIRED

Puede permitirse sólo si:

```text
policy
```

lo autoriza.

---

## 420. EXECUTION OF REVOKED

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

EXECUTION OF REVOKED

Default:

```text
DENY
```

---

## 421. VERSION AUDIT

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION AUDIT

Cada execution importante debe poder identificar:

```text
languageVersion
artifactFormatVersion
runtimeSemanticsVersion
artifactHash
```

---

## 422. COMPATIBILITY OBSERVABILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

COMPATIBILITY OBSERVABILITY

Metrics:

```text
compatibility_failure_total
deprecated_artifact_execution_total
revoked_artifact_attempt_total
```

---

## 423. MIGRATION METRICS

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MIGRATION METRICS

Medir:

```text
rules pending migration
rules migrated
rules failed migration
```

---

## 424. VERSION SECURITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION SECURITY

No permitir:

```text
downgrade attack
```

sin autorización.

---

## 425. DOWNGRADE ATTACK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

DOWNGRADE ATTACK

Artifact antiguo vulnerable intenta volver a ACTIVE.

---

## 426. CONTROL

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

CONTROL

Revocation + minimum supported version policy.

---

## 427. MINIMUM SUPPORTED VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MINIMUM SUPPORTED VERSION

Runtime puede definir:

```text
minimumArtifactFormatVersion
```

---

## 428. MINIMUM SECURITY VERSION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

MINIMUM SECURITY VERSION

Puede existir:

```text
minimumSecurityVersion
```

---

## 429. VERSION POLICY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSION POLICY

Debe ser:

```text
explicit
auditable
versioned
```

---

## 430. TESTING VERSION NEGOTIATION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TESTING VERSION NEGOTIATION

Probar:

```text
equal
older compatible
older incompatible
future
revoked
```

---

## 431. TEST PROVIDER COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TEST PROVIDER COMPATIBILITY

Probar:

```text
same contract
old provider
new provider
breaking provider
```

---

## 432. TEST CONTRACT COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TEST CONTRACT COMPATIBILITY

Probar:

```text
same
minor
major
hash mismatch
```

---

## 433. TEST ARTIFACT COMPATIBILITY

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TEST ARTIFACT COMPATIBILITY

Probar:

```text
V1 artifact
V2 runtime
V2 artifact
V1 runtime
```

---

## 434. TEST ROLLBACK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TEST ROLLBACK

Activar:

```text
V2
```

y regresar:

```text
V1
```

sin alterar Artifacts.

---

## 435. TEST REPRODUCTION

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

TEST REPRODUCTION

Rebuild con mismo:

```text
manifest
```

debe producir:

```text
same hash
```

cuando la build sea reproducible.

---

## 436. VERSIONING EXIT CRITERIA

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

VERSIONING EXIT CRITERIA

```text
✓ Language version
✓ Compiler version
✓ Artifact format version
✓ Runtime semantics version
✓ Registry schema version
✓ Contract version
✓ Function version
✓ Provider version
✓ Exact dependency pinning
✓ Hash identity
✓ Compatibility matrix
✓ Backward compatibility
✓ Deprecation
✓ Migration
✓ Dual-run
✓ Rollback
✓ Revocation
✓ Security versioning
✓ Reproducible builds
✓ Version audit
✓ Compatibility tests
```

---

## 437. FINAL VERSION ARCHITECTURE

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

FINAL VERSION ARCHITECTURE

```text
                    AEL V1
                      │
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
   Language        Artifact        Runtime
    Version         Format        Semantics
       │              │              │
       └──────────────┼──────────────┘
                      ▼
                Dependencies
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       Contract     Function    Provider
        Version      Version     Version
          │           │           │
          └───────────┼───────────┘
                      ▼
                Compatibility
                      │
                      ▼
                  Execution
```

---

## 438. PRINCIPIO DE IDENTIDAD

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PRINCIPIO DE IDENTIDAD

Una ejecución de producción debe poder responder:

```text
¿Qué versión del lenguaje?
¿Qué Artifact?
¿Qué hash?
¿Qué dependencies?
¿Qué Provider?
¿Qué Runtime?
```

---

## 439. PRINCIPIO DE NO SORPRESA

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PRINCIPIO DE NO SORPRESA

Actualizar:

```text
Compiler
Registry
Provider
Runtime
```

no debe cambiar silenciosamente el significado de una Rule publicada.

---

## 440. PRINCIPIO DE MIGRACIÓN

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PRINCIPIO DE MIGRACIÓN

```text
Old
 ↓
Analyze
 ↓
Migrate
 ↓
Test
 ↓
Approve
 ↓
Activate
```

---

## 441. PRINCIPIO DE ROLLBACK

> **Origen:** Motor de liquidacion_Versioning & Compatibility 46.md

PRINCIPIO DE ROLLBACK

Rollback significa:

```text
change active pointer
```

no:

```text
modify old Artifact
```

---
