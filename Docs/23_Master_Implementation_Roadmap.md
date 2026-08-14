# AEL V1 — MASTER IMPLEMENTATION ROADMAP

## Documento Canónico 23 — Hoja de ruta maestra de implementación

> **Proyecto:** AQUILA_SAAS  
> **Fase:** Gobierno y ejecución de la construcción  
> **Documento:** 23 de 24  
> **Estado:** Especificación operativa canónica V1

---

# 1. Propósito

Definir el orden oficial de construcción de AEL y su integración con AQUILA,
estableciendo:

```text
milestones
dependencies
deliverables
verification
acceptance
exit criteria
```

El roadmap convierte los documentos 01–20 en un plan ejecutable.

---

# 2. Principio rector

La construcción debe avanzar:

```text
fundamentos
→ compilación
→ ejecución
→ plataforma
→ integración
→ dominio financiero
→ motor de liquidación
→ integración end-to-end
→ hardening
→ producción
```

No se debe construir una capa superior sobre contratos inferiores inestables.

---

# 3. Estado Inicial

Antes de iniciar M0:

```text
repository identified
architecture baseline approved
documents 01–24 available
development environment available
branch strategy defined
CI baseline available
```

Si falta alguno de estos elementos, el proyecto comienza en:

```text
BLOCKED — M0
```

---

# 4. Milestones

El roadmap oficial está compuesto por:

```text
M0   Foundation & Repository
M1   Language Core
M2   Compiler & Semantic Pipeline
M3   Artifact & Verification
M4   Runtime
M5   Contracts & Capabilities
M6   Security & Sandbox
M7   Quality & Conformance
M8   Developer Experience
M9   AQUILA Integration
M10  Persistence & RLS
M11  Platform Operations
M12  Financial Domain
M13  Liquidation Context
M14  Calculation & Dependency Engine
M15  Financial Application Engine
M16  Result, Audit & Validation
M17  End-to-End Integration
M18  Hardening
M19  Production Readiness
```

---

# 5. M0 — Foundation & Repository

## Scope

Preparar el entorno de construcción.

## Inputs

```text
Documents 01–24
repository
technology baseline
environment configuration
```

## Deliverables

```text
repository structure
branch strategy
CI baseline
local development environment
test runner
lint/type tooling
documentation structure
```

## Verification

```text
clean checkout
install succeeds
build baseline succeeds
test runner executes
CI executes
```

## Exit Criteria

```text
✓ reproducible development environment
✓ repository builds
✓ CI green
✓ baseline commit created
```

---

# 6. M1 — Language Core

## Documents

```text
01
02
03
```

## Scope

Implement:

```text
language definition
lexer/token model
syntax
operators
control flow
types
values
```

## Deliverables

```text
lexer
parser foundation
type/value model
syntax diagnostics
```

## Verification

```text
lexical tests
syntax tests
type tests
negative tests
```

## Exit Criteria

```text
✓ valid syntax accepted
✓ invalid syntax rejected
✓ types represented correctly
✓ diagnostics deterministic
```

---

# 7. M2 — Compiler & Semantic Pipeline

## Documents

```text
04
05
```

## Scope

Implement:

```text
AST
IR
semantic analysis
compiler pipeline
lowering
```

## Deliverables

```text
AST
IR
semantic analyzer
compiler
```

## Verification

```text
AST tests
semantic tests
IR tests
compiler tests
golden compiler cases
```

## Exit Criteria

```text
✓ source compiles to valid Artifact input
✓ invalid programs rejected
✓ semantic errors deterministic
✓ compiler tests green
```

---

# 8. M3 — Artifact & Verification

## Documents

```text
04
08
```

## Scope

Implement:

```text
Artifact serialization
canonical representation
integrity
verification
```

## Deliverables

```text
Artifact format
serializer
deserializer
hashing
verifier
```

## Verification

```text
round-trip tests
tamper tests
invalid artifact tests
hash determinism tests
```

## Exit Criteria

```text
✓ valid artifacts verify
✓ corrupted artifacts reject
✓ serialization deterministic
✓ integrity checks enforced
```

---

# 9. M4 — Runtime

## Documents

```text
06
```

## Scope

Implement execution semantics.

```text
instruction execution
evaluation
state
errors
resource boundaries
```

## Deliverables

```text
runtime
execution context
instruction dispatcher
runtime diagnostics
```

## Verification

```text
execution tests
determinism tests
resource limit tests
error tests
```

## Exit Criteria

```text
✓ verified Artifact executes
✓ invalid execution rejected
✓ deterministic behavior demonstrated
✓ resource limits enforced
```

---

# 10. M5 — Contracts & Capabilities

## Documents

```text
07
```

## Scope

Implement:

```text
function contracts
providers
capabilities
execution boundaries
```

## Exit Criteria

```text
✓ contracts validated
✓ capabilities enforced
✓ unauthorized provider access rejected
✓ contract tests green
```

---

# 11. M6 — Security & Sandbox

## Documents

```text
08
```

## Scope

Implement:

```text
artifact verification
sandbox
authorization
secret isolation
tenant boundaries
input validation
```

## Verification

```text
security tests
negative tests
sandbox escape tests
authorization tests
tenant isolation tests
```

## Exit Criteria

```text
✓ security controls enforced
✓ sandbox boundaries verified
✓ no secret leakage
✓ critical security tests green
```

---

# 12. M7 — Quality & Conformance

## Documents

```text
09
```

## Scope

Establish:

```text
test architecture
conformance suite
regression suite
golden cases
coverage reporting
```

## Exit Criteria

```text
✓ test framework operational
✓ conformance baseline established
✓ regression suite operational
✓ critical paths covered
```

---

# 13. M8 — Developer Experience

## Documents

```text
10
```

## Scope

Implement only the tooling required for the approved scope:

```text
editor
builder
rule workspace
diagnostics
developer workflows
```

## Exit Criteria

```text
✓ developer can create/edit valid rules
✓ diagnostics usable
✓ workspace integrates with compiler pipeline
```

---

# 14. M9 — AQUILA Integration

## Documents

```text
11
```

## Scope

Integrate AEL with AQUILA application services.

```text
application API
execution requests
execution responses
authentication context
tenant context
```

## Exit Criteria

```text
✓ authenticated request reaches AEL
✓ tenant context preserved
✓ contract boundaries tested
✓ errors propagated correctly
```

---

# 15. M10 — Persistence & RLS

## Documents

```text
12
```

## Scope

Implement:

```text
database schema
migrations
repositories
RLS
transactions
RPC/views
persistence contracts
```

## Exit Criteria

```text
✓ migrations reproducible
✓ persistence tests green
✓ RLS verified
✓ cross-tenant access rejected
✓ transaction boundaries verified
```

---

# 16. M11 — Platform Operations

## Documents

```text
13
14
15
```

## Scope

Implement:

```text
deployment
configuration
observability
logging
performance controls
registry
versioning
compatibility
repository conventions
```

## Exit Criteria

```text
✓ deploy reproducible
✓ rollback documented
✓ observability available
✓ versioning operational
✓ compatibility policy enforced
```

---

# 17. M12 — Financial Domain

## Documents

```text
16
```

## Scope

Implement:

```text
Money
Decimal
Currency
rounding
financial types
domain semantics
settlement foundations
```

## Verification

```text
numeric tests
currency tests
rounding tests
boundary tests
golden financial cases
```

## Exit Criteria

```text
✓ monetary calculations deterministic
✓ rounding deterministic
✓ currency consistency enforced
✓ financial golden cases green
```

---

# 18. M13 — Liquidation Context

## Documents

```text
17
```

## Scope

Implement:

```text
execution context
snapshot
tenant scope
period scope
lifecycle
idempotency
replay context
```

## Exit Criteria

```text
✓ snapshot isolation verified
✓ execution context reproducible
✓ lifecycle transitions enforced
✓ idempotency verified
```

---

# 19. M14 — Calculation & Dependency Engine

## Documents

```text
18
```

## Scope

Implement:

```text
dependency graph
ordering
calculation context
intermediate values
dependency validation
```

## Exit Criteria

```text
✓ dependencies resolved deterministically
✓ cycles detected
✓ calculation order stable
✓ context references valid
```

---

# 20. M15 — Financial Application Engine

## Documents

```text
19
```

## Scope

Implement:

```text
allocation
proration
payments
balance
adjustments
novelties
interest application
```

## Important Boundary

The engine must consume the financial semantics of Document 16 and the context
of Documents 17–18.

It must not redefine them.

## Verification

```text
allocation tests
payment tests
balance tests
adjustment tests
interest tests
financial reconciliation
golden liquidation cases
```

## Exit Criteria

```text
✓ allocations reconcile
✓ payments reconcile
✓ balances reconcile
✓ adjustments reconcile
✓ financial golden cases pass
```

---

# 21. M16 — Result, Audit & Validation

## Documents

```text
20
```

## Scope

Implement:

```text
result composition
trace
explanation
validation
reconciliation
finalization gate
```

## Exit Criteria

```text
✓ result reproducible
✓ trace valid
✓ explanation derived from trace
✓ invariants validated
✓ result hash deterministic
✓ finalization gate enforced
✓ finalized result immutable
```

---

# 22. M17 — End-to-End Integration

## Scope

Execute the complete path:

```text
AEL Source
 ↓
Compiler
 ↓
Artifact
 ↓
Verification
 ↓
Runtime
 ↓
AQUILA
 ↓
Snapshot
 ↓
Calculation
 ↓
Allocation
 ↓
Payments
 ↓
Adjustments
 ↓
Result
 ↓
Trace
 ↓
Validation
 ↓
Finalization
```

## Required Tests

```text
E2E-LANGUAGE
E2E-COMPILER
E2E-RUNTIME
E2E-AQUILA
E2E-FINANCIAL
E2E-LIQUIDATION
E2E-AUDIT
```

## Exit Criteria

```text
✓ complete workflow executes
✓ no contract bypasses
✓ financial result reconciles
✓ audit path reconstructible
✓ critical E2E tests green
```

---

# 23. M18 — Hardening

## Scope

Consolidate:

```text
security
performance
concurrency
resilience
failure recovery
data integrity
observability
regression
```

## Required Activities

```text
load tests
stress tests
security tests
concurrency tests
failure injection
migration rehearsal
rollback rehearsal
backup/recovery verification
```

## Exit Criteria

```text
✓ critical security findings resolved
✓ performance targets met
✓ concurrency behavior verified
✓ recovery tested
✓ rollback tested
✓ regression suite green
```

---

# 24. M19 — Production Readiness

## Scope

Final operational preparation.

## Checklist

```text
configuration
secrets
database migrations
backup
monitoring
alerts
logging
deployment
rollback
documentation
support procedures
incident procedures
```

## Acceptance

```text
functional acceptance
security acceptance
financial acceptance
operational acceptance
performance acceptance
```

---

# 25. Dependency Graph

```text
M0
 ↓
M1
 ↓
M2
 ↓
M3
 ↓
M4
 ↓
M5
 ↓
M6
 ↓
M7
 ↓
M8
 ↓
M9
 ↓
M10
 ↓
M11
 ↓
M12
 ↓
M13
 ↓
M14
 ↓
M15
 ↓
M16
 ↓
M17
 ↓
M18
 ↓
M19
```

La secuencia representa dependencias conceptuales. Trabajo paralelo sólo está
permitido cuando el Documento 21 lo autoriza.

---

# 26. Parallel Work

Puede ejecutarse en paralelo cuando no exista dependencia:

```text
M7 testing infrastructure
+
M8 developer tooling
```

o:

```text
M11 platform tooling
+
preparación de documentación de M12
```

Pero ningún trabajo paralelo puede introducir contratos incompatibles.

---

# 27. Milestone Status

Cada milestone debe tener:

```text
NOT_STARTED
IN_PROGRESS
BLOCKED
READY_FOR_REVIEW
VERIFIED
DONE
```

---

# 28. Milestone Evidence

Para pasar a DONE:

```text
implementation
tests
verification
traceability
documentation
commit
```

deben existir.

---

# 29. Milestone Gate

Cada milestone tiene:

```text
Entry Criteria
Work
Verification
Exit Criteria
```

No pasar al siguiente milestone si existe un bloqueo crítico.

---

# 30. Blocking Conditions

Un milestone queda BLOCKED por:

```text
critical requirement gap
critical security defect
financial ambiguity
broken dependency
failed critical test
migration risk
unresolved architectural contradiction
```

---

# 31. Change Control

Un cambio que afecte milestones futuros debe actualizar:

```text
Document 22
Document 23
affected canonical document
tests
acceptance
```

---

# 32. Traceability

Cada milestone debe poder responder:

```text
qué requisitos implementa
qué documentos utiliza
qué componentes produce
qué tests lo verifican
qué evidencia demuestra su cierre
```

---

# 33. Financial Gate

Antes de M17:

```text
financial golden cases
allocation reconciliation
payment reconciliation
balance reconciliation
interest verification
rounding verification
```

deben estar verdes.

---

# 34. Security Gate

Antes de M17:

```text
tenant isolation
authorization
artifact verification
sandbox
secret protection
input validation
```

deben estar verificadas.

---

# 35. E2E Gate

M17 no puede cerrarse con tests aislados únicamente.

Debe existir al menos un flujo completo reproducible.

---

# 36. Production Gate

M19 no puede cerrarse si:

```text
critical security issue
critical financial issue
critical data integrity issue
critical rollback issue
```

permanece abierto.

---

# 37. Recommended Commit Strategy

Cada milestone importante debe terminar con un commit/tag identificable.

Ejemplo:

```text
ael-m1-language-core
ael-m2-compiler
ael-m3-artifact
ael-m4-runtime
...
ael-m19-production-ready
```

La estrategia concreta de tags debe ajustarse al repositorio real.

---

# 38. Release Candidates

Antes de producción:

```text
RC1
→ functional validation

RC2
→ security/performance validation

RC-final
→ production acceptance
```

El esquema puede simplificarse si el tamaño real del proyecto lo permite.

---

# 39. Rollback Strategy

Cada release debe identificar:

```text
application rollback
database rollback/forward-fix
configuration rollback
artifact compatibility
```

No asumir que un rollback de código implica automáticamente rollback seguro de
base de datos.

---

# 40. Documentation Gate

Antes de cerrar M19:

```text
architecture current
API current
database current
deployment current
operations current
security current
financial rules current
traceability current
```

---

# 41. Handoff

La entrega a operación debe incluir:

```text
source
artifacts
database migrations
configuration specification
deployment instructions
rollback instructions
monitoring
alerts
support/runbook
known limitations
```

---

# 42. Final Project Gate

El proyecto se considera técnicamente listo cuando:

```text
M0–M19 DONE
+
Document 22 coverage complete
+
Document 24 acceptance complete
```

---

# 43. Definition of Done del Roadmap

El Documento 23 está correctamente implementado cuando:

```text
✓ every milestone has scope
✓ dependencies defined
✓ deliverables defined
✓ verification defined
✓ exit criteria defined
✓ blocking conditions defined
✓ end-to-end gate defined
✓ security gate defined
✓ financial gate defined
✓ production gate defined
✓ rollback considered
✓ traceability integrated
```

---

# 44. Principio final

> **El roadmap no mide cuánto código se escribió. Mide cuánto alcance verificable quedó terminado.**

Un milestone no está terminado porque el agente diga que terminó.

Está terminado cuando existe evidencia suficiente para demostrar:

```text
implementado
+
probado
+
verificado
+
trazable
+
aceptado
```

---

# FIN DEL DOCUMENTO 23

## AEL V1 — Master Implementation Roadmap
