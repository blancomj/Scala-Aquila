# AEL V1 — TRACEABILITY & REQUIREMENTS MATRIX

## Documento Canónico 22 — Matriz de trazabilidad de requisitos

> **Proyecto:** AQUILA_SAAS  
> **Fase:** Gobierno y ejecución de la construcción  
> **Documento:** 22 de 24  
> **Estado:** Especificación operativa canónica V1

---

# 1. Propósito

Establecer una relación verificable entre:

```text
Requisito
  ↓
Regla de negocio
  ↓
Documento canónico
  ↓
Componente
  ↓
Implementación
  ↓
Test
  ↓
Criterio de aceptación
  ↓
Evidencia
```

La matriz permite demostrar que cada requisito tiene:

```text
owner
implementation
verification
evidence
```

---

# 2. Objetivo

Evitar dos fallos:

```text
"Está documentado pero no implementado"
```

y:

```text
"Está implementado pero nadie puede demostrar qué requisito satisface"
```

---

# 3. Fuente de verdad

La matriz no inventa requisitos.

Los requisitos provienen de:

```text
especificación funcional aprobada
decisiones arquitectónicas
documentos canónicos 01–20
cambios aprobados
```

---

# 4. Identificador

Todo requisito trazable debe disponer de un identificador estable:

```text
REQ-<DOMAIN>-<NNN>
```

Ejemplos:

```text
REQ-AEL-001
REQ-COMP-001
REQ-RUNTIME-001
REQ-SEC-001
REQ-LIQ-001
REQ-PAY-001
REQ-AUDIT-001
```

---

# 5. Requirement Record

Conceptualmente:

```ts
interface RequirementRecord {
  id: string
  title: string
  description: string

  source: RequirementSource
  priority: RequirementPriority

  ownerDocument: string
  components: string[]

  implementationRefs: string[]
  testRefs: string[]
  acceptanceRefs: string[]

  status: RequirementStatus
  evidenceRefs: string[]
}
```

---

# 6. Requirement Status

V1:

```text
Proposed
Approved
InProgress
Implemented
Verified
Accepted
Rejected
Deprecated
Blocked
```

---

# 7. Status Semantics

### Proposed

Identificado pero aún no aprobado.

### Approved

Forma parte del alcance aprobado.

### InProgress

Tiene implementación activa.

### Implemented

Existe implementación.

### Verified

La implementación pasó las verificaciones requeridas.

### Accepted

Cumple los criterios de aceptación correspondientes.

### Rejected

No forma parte del alcance aprobado.

### Deprecated

Fue sustituido por una definición posterior.

### Blocked

No puede completarse por una dependencia o decisión pendiente.

---

# 8. Priority

```text
Critical
High
Medium
Low
```

La prioridad no sustituye a la obligatoriedad.

Un requisito obligatorio Low sigue siendo obligatorio.

---

# 9. Traceability Direction

La trazabilidad debe funcionar en ambos sentidos:

```text
Requirement
    ↓
Implementation
```

y:

```text
Implementation
    ↓
Requirements
```

---

# 10. Forward Traceability

Permite responder:

```text
¿Qué código implementa este requisito?
```

---

# 11. Backward Traceability

Permite responder:

```text
¿Por qué existe este código?
```

---

# 12. Document Ownership

Cada requisito debe tener un documento canónico propietario.

Ejemplo:

```text
REQ-AEL-001
→ Documento 02
```

No asignar el mismo requisito a múltiples propietarios.

---

# 13. Component Mapping

Un requisito puede afectar varios componentes:

```text
Requirement
   ├→ Compiler
   ├→ Runtime
   └→ Test
```

pero debe conservar un owner principal.

---

# 14. Implementation Reference

Una referencia de implementación debe identificar:

```text
repository
module
file
symbol
```

cuando sea posible.

Ejemplo conceptual:

```text
packages/runtime/src/execution/ExecutionEngine.ts
```

---

# 15. Test Reference

Debe identificar:

```text
test suite
test case
```

cuando sea posible.

Ejemplo:

```text
tests/runtime/execution-determinism.spec.ts
```

---

# 16. Acceptance Reference

Debe apuntar a:

```text
acceptance criterion
```

del alcance correspondiente.

---

# 17. Evidence

La evidencia puede ser:

```text
test result
build result
migration result
security scan
benchmark
audit report
manual verification
```

---

# 18. Evidence Requirement

Un requisito Verified/Accepted debe tener evidencia suficiente.

No aceptar:

```text
"se probó"
```

sin evidencia identificable.

---

# 19. Coverage

La cobertura se mide como:

```text
requirements with implementation
---------------------------------
approved requirements
```

y:

```text
requirements with verification
------------------------------
implemented requirements
```

---

# 20. Implementation Coverage

Un requisito está cubierto por implementación cuando existe una referencia
concreta al componente responsable.

---

# 21. Verification Coverage

Está cubierto por verificación cuando existe al menos una prueba o mecanismo de
verificación adecuado.

---

# 22. Acceptance Coverage

Está cubierto por aceptación cuando satisface el criterio de aceptación
correspondiente.

---

# 23. Coverage States

```text
0  Uncovered
1  Documented
2  Implemented
3  Tested
4  Verified
5  Accepted
```

---

# 24. Gap Detection

La matriz debe detectar:

```text
approved requirement
        ↓
no implementation
```

```text
implementation
        ↓
no requirement
```

```text
implementation
        ↓
no test
```

```text
test
        ↓
no requirement
```

---

# 25. Orphan Implementation

Código funcional sin requisito conocido:

```text
ORPHAN_IMPLEMENTATION
```

No necesariamente es incorrecto, pero debe investigarse.

---

# 26. Orphan Requirement

Requisito aprobado sin implementación:

```text
ORPHAN_REQUIREMENT
```

Es un gap de cobertura.

---

# 27. Orphan Test

Test sin requisito o contrato identificable:

```text
ORPHAN_TEST
```

Debe revisarse.

---

# 28. Requirement Conflict

Dos requisitos incompatibles:

```text
REQUIREMENT_CONFLICT
```

Debe activar el protocolo de contradicciones del Documento 21.

---

# 29. Duplicate Requirement

Dos IDs describen esencialmente el mismo requisito:

```text
DUPLICATE_REQUIREMENT
```

Debe consolidarse mediante decisión explícita.

---

# 30. Requirement Change

Un cambio de requisito debe conservar:

```text
old requirement
new requirement
reason
approval
impact
```

---

# 31. Requirement History

Los requisitos no deben borrarse cuando hayan sido implementados.

Los cambios deben conservar historial.

---

# 32. Versioning

Puede utilizarse:

```text
requirementVersion
```

para requisitos cuyo significado evoluciona.

---

# 33. Traceability Graph

La matriz puede representarse como un grafo:

```text
REQ
 ↓
RULE
 ↓
DOC
 ↓
COMPONENT
 ↓
CODE
 ↓
TEST
 ↓
EVIDENCE
```

---

# 34. Requirement-to-Document Matrix

Ejemplo:

| Requirement      | Document |
| ---------------- | -------- |
| REQ-AEL-001      | 01       |
| REQ-AEL-002      | 02       |
| REQ-TYPE-001     | 03       |
| REQ-COMP-001     | 04/05    |
| REQ-RUNTIME-001  | 06       |
| REQ-CONTRACT-001 | 07       |
| REQ-SEC-001      | 08       |
| REQ-TEST-001     | 09       |
| REQ-UX-001       | 10       |
| REQ-API-001      | 11       |
| REQ-DATA-001     | 12       |
| REQ-OPS-001      | 13       |
| REQ-COMPAT-001   | 14       |
| REQ-ARCH-001     | 15       |
| REQ-FIN-001      | 16       |
| REQ-EXEC-001     | 17       |
| REQ-DEP-001      | 18       |
| REQ-LIQ-001      | 19       |
| REQ-AUDIT-001    | 20       |

La tabla anterior es un modelo; los IDs definitivos deben derivarse del
catálogo aprobado.

---

# 35. AEL Requirements

Como mínimo deben cubrir:

```text
syntax
types
AST
IR
artifact
compiler
verification
runtime
contracts
capabilities
security
testing
developer tooling
```

---

# 36. AQUILA Requirements

Deben cubrir:

```text
integration
APIs
persistence
tenant isolation
RLS
configuration
deployment
observability
compatibility
```

---

# 37. Financial Requirements

Deben cubrir:

```text
money
decimal semantics
rounding
concepts
interest
allocation
payments
adjustments
balances
```

---

# 38. Liquidation Requirements

Deben cubrir:

```text
execution context
snapshot
dependency ordering
calculation context
result
trace
validation
finalization
```

---

# 39. Security Requirements

Deben cubrir:

```text
authentication
authorization
tenant isolation
sandbox
artifact verification
secrets
audit
input validation
```

---

# 40. Non-Functional Requirements

También deben trazarse:

```text
performance
availability
observability
maintainability
security
scalability
reproducibility
auditability
```

---

# 41. Database Traceability

Todo requisito que cambie persistencia debe apuntar a:

```text
migration
table
column
index
constraint
RLS policy
RPC/view
```

---

# 42. API Traceability

Todo requisito de API debe apuntar a:

```text
endpoint/RPC
request contract
response contract
authorization
tests
```

---

# 43. Financial Traceability

Todo requisito financiero debe apuntar a:

```text
domain rule
calculation component
golden case
financial test
acceptance criterion
```

---

# 44. Security Traceability

Todo requisito de seguridad debe apuntar a:

```text
control
implementation
test
security evidence
```

---

# 45. Performance Traceability

Todo requisito de performance debe indicar:

```text
metric
baseline
target
measurement
environment
result
```

No declarar "rápido" como evidencia.

---

# 46. Acceptance Traceability

Cada requisito crítico debe terminar en:

```text
Accepted
```

antes de cerrar su milestone.

---

# 47. Critical Requirements

Los requisitos Critical requieren:

```text
implementation
automated verification
acceptance evidence
```

salvo excepción aprobada.

---

# 48. Financial Criticality

Los requisitos que afecten importes financieros, balances, pagos, intereses o
cierre deben tratarse como Critical.

---

# 49. Security Criticality

Los requisitos que puedan provocar:

```text
cross-tenant access
privilege escalation
secret exposure
artifact execution bypass
```

son Critical.

---

# 50. Traceability Review

En cada milestone debe revisarse:

```text
requirements
implementation
tests
evidence
gaps
```

---

# 51. Review Frequency

Mínimo:

```text
antes del inicio del milestone
durante cambios relevantes
antes del cierre del milestone
antes de release
```

---

# 52. Matrix Maintenance

La matriz se actualiza junto con el cambio que modifica el requisito.

No dejar la trazabilidad para el final del proyecto.

---

# 53. Pull Request / Change Review

Un cambio relevante debe indicar:

```text
requirements affected
documents affected
components affected
tests affected
```

---

# 54. Commit Traceability

Cuando sea útil, un commit puede referenciar:

```text
REQ-AEL-001
```

o el conjunto de requisitos afectados.

---

# 55. Release Traceability

Cada release debe poder determinar:

```text
requirements included
requirements verified
known gaps
```

---

# 56. Audit Traceability

Para requisitos auditables:

```text
requirement
→ implementation
→ test
→ evidence
→ release
```

debe ser reconstruible.

---

# 57. Traceability Completeness

Antes de release:

```text
No critical approved requirement uncovered
No critical implementation without verification
No accepted requirement without evidence
```

---

# 58. Gap Classification

```text
Critical
High
Medium
Low
```

---

# 59. Blocking Gaps

Bloquean el cierre:

```text
Critical uncovered requirement
Critical unverified implementation
Critical security gap
Critical financial gap
```

---

# 60. Waiver

Una excepción requiere:

```text
requirement
reason
risk
mitigation
approver
expiration/review
```

No convertir el waiver en mecanismo permanente para ignorar requisitos.

---

# 61. Metrics

La matriz debe poder producir:

```text
total requirements
approved
implemented
tested
verified
accepted
blocked
uncovered
orphan implementations
orphan tests
```

---

# 62. Coverage Dashboard

Mínimo:

```text
Requirement Coverage
Implementation Coverage
Verification Coverage
Acceptance Coverage
Critical Coverage
Security Coverage
Financial Coverage
```

---

# 63. Traceability Gates

### Gate A — Design

Todo requisito aprobado tiene owner documental.

### Gate B — Implementation

Todo requisito en implementación tiene componente.

### Gate C — Verification

Todo requisito implementado tiene prueba/evidencia.

### Gate D — Acceptance

Todo requisito crítico está aceptado.

### Gate E — Release

No existen gaps críticos abiertos.

---

# 64. Requirement Lifecycle

```text
Proposed
 ↓
Approved
 ↓
InProgress
 ↓
Implemented
 ↓
Verified
 ↓
Accepted
```

Con rutas controladas:

```text
Approved → Rejected
Approved → Blocked
Accepted → Deprecated
```

---

# 65. Traceability Tooling

La implementación puede utilizar:

```text
Markdown
YAML
JSON
database
issue tracker
```

La tecnología concreta es secundaria.

Lo obligatorio es preservar las relaciones.

---

# 66. Machine Readable Form

Cuando sea automatizado, preferir una representación estructurada:

```json
{
  "id": "REQ-LIQ-001",
  "ownerDocument": "19",
  "components": ["LiquidationEngine"],
  "tests": ["TEST-LIQ-001"],
  "status": "Verified"
}
```

---

# 67. No Manual-Only Traceability

Para requisitos críticos no depender exclusivamente de memoria o listas
manuales.

Debe existir una fuente estructurada o verificable.

---

# 68. Requirement Naming

Usar IDs estables, cortos y únicos.

No reutilizar un ID para un requisito diferente.

---

# 69. Test Naming

Cuando sea posible:

```text
TEST-<DOMAIN>-<NNN>
```

Ejemplo:

```text
TEST-LIQ-001
TEST-PAY-001
TEST-SEC-001
```

---

# 70. Evidence Naming

Cuando exista almacenamiento de evidencia:

```text
EVD-<DOMAIN>-<NNN>
```

---

# 71. Acceptance Naming

```text
AC-<DOMAIN>-<NNN>
```

---

# 72. Relationship Types

V1:

```text
implements
specifies
verifies
accepts
evidences
dependsOn
supersedes
conflictsWith
```

---

# 73. Bidirectional Query

Debe ser posible consultar:

```text
Requirement → Code
```

```text
Code → Requirement
```

```text
Requirement → Test
```

```text
Test → Requirement
```

```text
Requirement → Evidence
```

---

# 74. Audit Export

La matriz debe poder exportarse para auditoría:

```text
Requirement
Owner
Implementation
Test
Evidence
Status
Version
```

---

# 75. Change Impact

Antes de modificar un contrato, consultar:

```text
requirements affected
tests affected
components affected
downstream dependencies
```

---

# 76. Requirement Deletion

Un requisito Accepted no se elimina físicamente sin preservar su historial.

Debe marcarse:

```text
Deprecated
```

o estado equivalente.

---

# 77. Conflict Resolution

Los conflictos deben seguir el Documento 21:

```text
detect
→ classify
→ impact
→ propose
→ approve
→ update
→ verify
```

---

# 78. Matrix as Control Plane

La matriz no es sólo documentación.

Debe actuar como control para:

```text
planning
implementation
testing
release
audit
```

---

# 79. Definition of Done

El Documento 22 está correctamente implementado cuando:

```text
✓ every approved requirement has an owner
✓ every requirement has a stable ID
✓ requirements map to documents
✓ requirements map to components
✓ implementation references are supported
✓ tests are traceable
✓ evidence is traceable
✓ critical requirements are identified
✓ gaps are detectable
✓ orphan implementations are detectable
✓ orphan tests are detectable
✓ conflicts are detectable
✓ history is preserved
✓ release coverage is measurable
✓ audit export is possible
```

---

# 80. Principio final

> **Si no podemos recorrer el camino Requisito → Regla → Documento → Código → Test → Evidencia → Aceptación, todavía no tenemos control suficiente sobre la construcción del sistema.**

La trazabilidad no debe convertirse en burocracia.

Debe ser el mecanismo que permita saber, en cualquier momento:

```text
qué debemos construir
qué construimos
cómo lo probamos
qué evidencia tenemos
qué falta
y qué podemos afirmar que está terminado
```

---

# FIN DEL DOCUMENTO 22

## AEL V1 — Traceability & Requirements Matrix
