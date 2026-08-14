# AEL V1 — VERIFICATION, ACCEPTANCE & DEFINITION OF DONE

## Documento Canónico 24 — Criterios finales de verificación y aceptación

> **Proyecto:** AQUILA_SAAS  
> **Fase:** Gobierno y cierre de la construcción  
> **Documento:** 24 de 24  
> **Estado:** Especificación operativa canónica V1

---

# 1. Propósito

Definir las condiciones objetivas que deben cumplirse para considerar terminado,
verificado, aceptado y listo para producción el sistema AEL/AQUILA.

Este documento es el **gate final** de la documentación canónica.

No sustituye los tests, criterios funcionales ni controles de seguridad específicos.
Los consolida en una condición verificable de cierre.

---

# 2. Principio de aceptación

El sistema no se considera terminado porque:

```text
compile
```

sea exitoso.

Debe demostrarse:

```text
correctness
+
security
+
financial integrity
+
traceability
+
operability
+
reproducibility
+
maintainability
```

---

# 3. Estados finales

Cada componente puede estar en:

```text
NOT_STARTED
IN_PROGRESS
IMPLEMENTED
TESTED
VERIFIED
ACCEPTED
DONE
BLOCKED
REJECTED
```

`DONE` requiere evidencia.

---

# 4. Definition of Done

Una unidad de trabajo está DONE cuando:

```text
✓ implementación completa
✓ contratos respetados
✓ tests ejecutados
✓ tests relevantes exitosos
✓ análisis de impacto realizado
✓ documentación actualizada
✓ trazabilidad actualizada
✓ seguridad revisada
✓ diff revisado
✓ commit identificable
```

---

# 5. Definition of Done — Documento

Cada documento 01–24 está DONE cuando:

```text
✓ alcance implementado
✓ dependencias satisfechas
✓ contratos implementados
✓ tests asociados verdes
✓ gaps críticos cerrados
✓ evidencia registrada
```

---

# 6. Definition of Done — Milestone

Un milestone está DONE cuando:

```text
✓ entry criteria satisfechos
✓ alcance implementado
✓ tests ejecutados
✓ exit criteria satisfechos
✓ requisitos trazables
✓ evidencia disponible
✓ ningún bloqueo crítico abierto
```

---

# 7. Definition of Done — Release

Una release está ACCEPTED cuando:

```text
✓ functional acceptance
✓ technical verification
✓ security acceptance
✓ financial acceptance
✓ database acceptance
✓ operational acceptance
✓ rollback readiness
```

están satisfechos.

---

# 8. Functional Acceptance

Debe demostrarse:

```text
requirements implemented
business rules respected
state transitions correct
API behavior correct
expected errors correct
```

---

# 9. Language Acceptance

AEL debe demostrar:

```text
syntax correctness
lexical correctness
type correctness
semantic correctness
deterministic diagnostics
```

---

# 10. Compiler Acceptance

Debe verificarse:

```text
source
→ AST
→ semantic analysis
→ IR
→ Artifact
```

sin pérdida no autorizada de significado.

---

# 11. Artifact Acceptance

Debe verificarse:

```text
serialization
deserialization
canonical representation
integrity
tamper detection
version compatibility
```

---

# 12. Runtime Acceptance

Debe verificarse:

```text
verified Artifact
→ deterministic execution
→ expected result
```

Además:

```text
invalid instruction
resource limit
runtime error
unauthorized operation
```

deben comportarse según contrato.

---

# 13. Contract Acceptance

Debe verificarse:

```text
functions
providers
capabilities
interfaces
authorization
```

y sus límites.

---

# 14. Security Acceptance

Como mínimo:

```text
authentication
authorization
tenant isolation
least privilege
sandbox
artifact verification
input validation
secret protection
auditability
```

---

# 15. Tenant Isolation Acceptance

Debe demostrarse que:

```text
tenant A
≠
tenant B
```

en:

```text
reads
writes
calculations
snapshots
artifacts
results
traces
```

cuando el contexto sea tenant-scoped.

---

# 16. Database Acceptance

Debe verificarse:

```text
migrations
schema
constraints
indexes
transactions
RLS
RPC/views
```

según el alcance.

---

# 17. Migration Acceptance

Una instalación limpia debe poder:

```text
create database
→ apply migrations
→ reach expected schema
```

de forma reproducible.

---

# 18. Financial Acceptance

Toda funcionalidad financiera debe demostrar:

```text
Money semantics
Decimal precision
Currency consistency
Rounding
Allocation
Payments
Balances
Adjustments
Interest
Settlement
```

---

# 19. Financial Reconciliation

Debe verificarse:

```text
allocation source
=
allocation sum
```

```text
payment amount
=
applied + unapplied
```

```text
unit total
=
sum of applicable components
```

```text
tenant total
=
sum of applicable unit totals
```

según el scope de la ejecución.

---

# 20. Financial Golden Cases

Los casos financieros de referencia deben ser reproducibles.

Un cambio que altere un Golden Case requiere:

```text
impact analysis
rule review
approval
test update
traceability update
```

No modificar un Golden Case simplemente para hacer pasar una implementación.

---

# 21. Liquidation Acceptance

Debe demostrarse el flujo:

```text
execution context
→ snapshot
→ dependency resolution
→ calculation
→ allocation
→ payments
→ adjustments
→ result
→ validation
→ finalization
```

---

# 22. Snapshot Acceptance

Debe demostrarse:

```text
same snapshot
+
same artifact
+
same policies
+
same inputs
=
same result
```

cuando el contrato de reproducibilidad aplique.

---

# 23. Idempotency Acceptance

Una operación idempotente repetida no debe producir:

```text
duplicate charges
duplicate payments
duplicate adjustments
duplicate side effects
```

---

# 24. Lifecycle Acceptance

Las transiciones de estado deben respetar el lifecycle definido.

No se permite:

```text
invalid transition
```

sin rechazo explícito.

---

# 25. Result Acceptance

Un resultado válido debe tener:

```text
result
resultHash
required provenance
validation
execution reference
```

según su nivel de persistencia y auditoría.

---

# 26. Trace Acceptance

Debe ser posible explicar resultados dentro del nivel de trazabilidad solicitado:

```text
output
→ source
```

y, cuando corresponda:

```text
source
→ output
```

---

# 27. Explanation Acceptance

La explicación:

```text
must derive from Trace
must not recalculate
must not mutate
```

Cambiar idioma o presentación no debe cambiar el resultado financiero.

---

# 28. Validation Acceptance

Debe existir validación de:

```text
schema
types
references
security scope
dependencies
financial invariants
reconciliation
provenance
completeness
finalization
```

según el contexto.

---

# 29. Finalization Acceptance

Un resultado sólo puede finalizar cuando:

```text
required validations pass
+
required reconciliations pass
+
required provenance exists
+
blocking warnings/errors absent
```

---

# 30. Immutability Acceptance

Después de Finalized:

```text
result cannot be silently mutated
```

Una corrección debe generar una nueva ejecución o mecanismo autorizado.

---

# 31. Replay Acceptance

Cuando el contrato lo exija:

```text
replay
→ same execution semantics
→ same financial result
→ same relevant hashes
```

---

# 32. Historical Compatibility

Los resultados históricos deben conservar su contexto de producción.

Una nueva versión no debe reinterpretarlos automáticamente.

---

# 33. API Acceptance

Debe verificarse:

```text
request validation
authentication
authorization
response contract
error contract
versioning
```

---

# 34. Error Acceptance

Los errores críticos deben:

```text
be typed
be observable
be traceable
not leak secrets
not silently degrade
```

---

# 35. Performance Acceptance

Cada requisito cuantitativo debe tener:

```text
metric
target
test
environment
result
```

No aceptar afirmaciones subjetivas de rendimiento.

---

# 36. Concurrency Acceptance

Debe verificarse, cuando corresponda:

```text
parallel executions
same-unit contention
same-period contention
duplicate requests
transaction races
```

y demostrar que no generan corrupción financiera.

---

# 37. Resilience Acceptance

Debe probarse el comportamiento ante:

```text
database failure
provider failure
timeout
network failure
process interruption
retry
partial failure
```

según el componente.

---

# 38. Recovery Acceptance

Debe existir evidencia de:

```text
backup
restore
migration recovery
application recovery
rollback or forward-fix
```

según el entorno.

---

# 39. Observability Acceptance

Los componentes críticos deben permitir reconstruir:

```text
execution
request
error
deployment version
artifact version
```

sin exponer secretos.

---

# 40. Deployment Acceptance

Una instalación de referencia debe poder:

```text
deploy
configure
migrate
start
health-check
execute smoke test
```

de manera reproducible.

---

# 41. Rollback Acceptance

Debe existir un procedimiento probado para:

```text
application rollback
configuration rollback
database recovery strategy
```

No asumir que todos los cambios de base de datos son reversibles.

---

# 42. Security Scanning

Antes de producción:

```text
dependency vulnerabilities
secret scanning
static analysis
container/image scanning
configuration review
```

deben ser ejecutados según el stack.

---

# 43. Regression Acceptance

Todos los cambios deben ejecutar la suite de regresión aplicable.

Un cambio no puede declararse seguro sólo porque sus tests nuevos pasen.

---

# 44. End-to-End Acceptance

Debe existir al menos un flujo E2E completo que atraviese:

```text
AEL source
→ compiler
→ artifact
→ verifier
→ runtime
→ AQUILA
→ persistence
→ financial engine
→ liquidation result
→ trace
→ validation
→ finalization
```

---

# 45. Traceability Acceptance

El Documento 22 debe demostrar:

```text
requirements
→ documents
→ components
→ implementation
→ tests
→ evidence
→ acceptance
```

para requisitos críticos.

---

# 46. Roadmap Acceptance

El Documento 23 debe reflejar el estado real:

```text
milestones
dependencies
done criteria
blocking items
```

No declarar milestones DONE por estimación.

---

# 47. Evidence Package

Cada release aceptada debe conservar:

```text
build evidence
test evidence
security evidence
financial evidence
migration evidence
deployment evidence
acceptance evidence
```

---

# 48. Evidence Integrity

La evidencia debe ser:

```text
identifiable
dated
related to version
reproducible where possible
```

---

# 49. Known Limitations

Antes de release deben registrarse:

```text
known limitations
non-blocking risks
deferred requirements
technical debt
```

No ocultarlos para conseguir aceptación.

---

# 50. Blocking Defects

Bloquean aceptación:

```text
critical security defect
critical financial defect
data corruption
cross-tenant exposure
non-deterministic financial result
failed critical requirement
broken migration
unrecoverable production path
```

---

# 51. Severity

```text
Critical
High
Medium
Low
```

La organización puede adaptar los nombres, pero debe existir una clasificación
objetiva.

---

# 52. Waivers

Un waiver requiere:

```text
defect/requirement
reason
risk
mitigation
owner
approval
expiration/review
```

Un waiver no convierte un defecto crítico en DONE.

---

# 53. Production Readiness

El sistema puede declararse Production Ready sólo cuando:

```text
all critical requirements accepted
all critical tests green
critical security findings closed
critical financial cases green
database deployment verified
rollback strategy tested
observability active
operational documentation complete
```

---

# 54. Release Candidate

Antes de producción:

```text
RC
→ functional verification
→ security verification
→ financial verification
→ operational verification
→ acceptance
```

---

# 55. Final Acceptance Board

La aceptación final debe considerar:

```text
Product / Functional
Architecture
Engineering
Database
Security
QA
Operations
```

según la estructura organizacional real.

---

# 56. Final Project Checklist

```text
□ Documents 01–20 implemented
□ Document 21 followed
□ Document 22 complete
□ Document 23 complete
□ Document 24 complete

□ Language tests green
□ Compiler tests green
□ Artifact tests green
□ Runtime tests green
□ Security tests green
□ Integration tests green
□ Database tests green
□ Financial tests green
□ Liquidation tests green
□ Trace tests green
□ Validation tests green
□ E2E tests green
□ Regression tests green

□ Security acceptance
□ Financial acceptance
□ Operational acceptance
□ Performance acceptance
□ Deployment acceptance
□ Recovery acceptance
```

---

# 57. Final Gate

El sistema sólo puede declararse:

```text
DONE
```

cuando:

```text
Document 22
    ↓
coverage complete

Document 23
    ↓
milestones complete

Document 24
    ↓
verification complete
    ↓
acceptance complete
```

---

# 58. No False Completion

Está prohibido declarar:

```text
DONE
PRODUCTION READY
ACCEPTED
VERIFIED
```

sin evidencia suficiente.

El estado debe reflejar la realidad.

---

# 59. Final Definition of Done

El proyecto completo está DONE cuando:

```text
✓ functional scope accepted
✓ architecture implemented
✓ compiler verified
✓ runtime verified
✓ security accepted
✓ persistence accepted
✓ AQUILA integration accepted
✓ financial engine accepted
✓ liquidation engine accepted
✓ results validated
✓ traceability complete
✓ regression suite green
✓ E2E green
✓ deployment verified
✓ rollback/recovery verified
✓ operational documentation complete
✓ critical risks closed or formally waived
✓ release accepted
```

---

# 60. Principio final

> **Terminado no significa que el código exista. Terminado significa que podemos demostrar, con evidencia, que el sistema cumple el requisito, respeta la arquitectura, produce resultados correctos, es seguro, es trazable, puede operar y puede recuperarse.**

La palabra `DONE` sólo debe aparecer después de esa demostración.

---

# FIN DEL DOCUMENTO 24

## AEL V1 — Verification, Acceptance & Definition of Done

# CIERRE DE LA DOCUMENTACIÓN CANÓNICA

## Documentos 01–24
