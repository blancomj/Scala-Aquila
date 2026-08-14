# AEL V1 — AEL Platform — Deployment, Operations, Observability & Performance

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
14 — Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md
22 — Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md
47 — Motor de liquidacion_Observability Audit & Governance 47.md
48 — Motor de liquidacion_Deployment & Infrastructure Architecture 48.md
49 — Motor de liquidacion_Performance & Scalability Architecture 49.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

OBJETIVO

Definir el ciclo operativo completo:

```text
Código
 ↓
Commit
 ↓
CI
 ↓
Tests
 ↓
Build
 ↓
Artifact
 ↓
Staging
 ↓
Validation
 ↓
Production
 ↓
Observability
 ↓
Rollback
```

---

## 2. ENTORNOS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ENTORNOS

Mínimos:

```text
LOCAL
CI
STAGING
PRODUCTION
```

---

## 3. LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

LOCAL

Utilizado para:

```text
desarrollo
debugging
unit tests
compiler tests
runtime tests
```

No utilizar datos reales de producción.

---

## 4. CI

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CI

Debe ejecutar automáticamente:

```text
lint
typecheck
unit tests
compiler tests
runtime tests
security tests
conformance tests
```

---

## 5. STAGING

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

STAGING

Debe reproducir lo más fielmente posible:

```text
Runtime
Database
Providers
Security Policy
API
Workers
```

de producción.

---

## 6. PRODUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PRODUCTION

Debe ejecutar únicamente componentes:

```text
versionados
verificados
aprobados
```

---

## 7. CONFIGURATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CONFIGURATION

Separar:

```text
code
configuration
secrets
data
```

Nunca incluir secretos en Git.

---

## 8. SOURCE CONTROL

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SOURCE CONTROL

El código de AEL debe estar versionado.

Ejemplo conceptual:

```text
repo/
├── ael/
├── aquila/
├── migrations/
├── tests/
└── docs/
```

La estructura definitiva depende del repositorio real.

---

## 9. BRANCHING

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BRANCHING

La estrategia de Git debe ser simple.

Recomendación V1:

```text
main
feature/*
fix/*
release/*
```

Evitar complejidad innecesaria.

---

## 10. PULL REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PULL REQUEST

Todo cambio crítico de AEL debe pasar por revisión.

Especialmente:

```text
Compiler
Runtime
Verifier
Security
Providers
```

---

## 11. CI GATE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CI GATE

Un PR no debe fusionarse si falla:

```text
typecheck
unit
integration
conformance
security
```

---

## 12. BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BUILD

El build debe producir:

```text
Compiler package
Runtime package
CLI
```

según la arquitectura de deployment.

---

## 13. VERSIONADO

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

VERSIONADO

Separar:

```text
AEL Language Version
Compiler Version
Runtime Version
Artifact Format Version
API Version
Application Version
```

---

## 14. RELEASE MANIFEST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RELEASE MANIFEST

Cada release debe identificar:

```text
commit
compiler version
runtime version
artifact format
dependencies
migration version
build timestamp
```

---

## 15. REPRODUCIBLE BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

REPRODUCIBLE BUILD

El mismo commit y configuración compatible deben producir resultados equivalentes.

---

## 16. LOCKFILES

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

LOCKFILES

Utilizar:

```text
package-lock
pnpm-lock
yarn.lock
```

según el gestor elegido.

No actualizar dependencias accidentalmente durante un release.

---

## 17. DEPENDENCY AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DEPENDENCY AUDIT

CI debe revisar:

```text
known vulnerabilities
license policy
dependency drift
```

---

## 18. SUPPLY CHAIN

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SUPPLY CHAIN

Las dependencias críticas deben estar:

```text
versionadas
auditadas
```

y, cuando la infraestructura lo permita:

```text
signed
```

---

## 19. CONTAINERIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CONTAINERIZATION

Si AEL Runtime requiere aislamiento adicional:

```text
container
```

puede utilizarse.

No es obligatorio separar todo en contenedores desde V1.

---

## 20. MODULAR DEPLOYMENT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

MODULAR DEPLOYMENT

Arquitectura inicial recomendada:

```text
AQUILA Web
AQUILA API
AEL Engine
PostgreSQL
```

y agregar:

```text
AEL Worker
```

cuando la carga lo justifique.

---

## 21. EDGE FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

EDGE FUNCTIONS

Las Edge Functions son adecuadas para:

```text
API
authorization
orchestration
lightweight execution
```

cuando las restricciones del entorno sean compatibles.

---

## 22. NODE WORKER

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

NODE WORKER

Un Worker Node puede utilizarse para:

```text
long executions
debugging
heavy tests
large batches
```

---

## 23. DECISIÓN DE EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DECISIÓN DE EJECUCIÓN

No toda regla necesita Worker.

Clasificar:

```text
SYNC
ASYNC
```

según:

```text
duration
provider calls
batch size
resource profile
```

---

## 24. EXECUTION PROFILE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

EXECUTION PROFILE

Cada ejecución puede tener:

```text
maxExecutionTime
maxInstructions
maxProviderCalls
maxMemory
```

---

## 25. SECURITY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SECURITY POLICY

Los límites deben venir de:

```text
SecurityPolicy
```

y no del Source.

---

## 26. ARTIFACT DEPLOYMENT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ARTIFACT DEPLOYMENT

Un Artifact publicado debe pasar:

```text
verify
hash
signature policy
compatibility
```

antes de estar disponible.

---

## 27. ARTIFACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ARTIFACT REGISTRY

Puede existir un repositorio lógico de Artifacts.

Debe permitir:

```text
lookup by hash
lookup by rule version
```

---

## 28. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ARTIFACT HASH

El hash es la identidad de integridad.

Ejemplo:

```text
sha256(...)
```

El algoritmo concreto puede evolucionar mediante metadata de formato.

---

## 29. SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SIGNATURE

En deployments de alta seguridad:

```text
Artifact
 ↓
Hash
 ↓
Signature
 ↓
Registry
```

---

## 30. KEY MANAGEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

KEY MANAGEMENT

Las claves privadas deben residir en:

```text
KMS
Secret Manager
secure CI/CD
```

Nunca:

```text
Git
Artifact
AEL Source
```

---

## 31. DEPLOYMENT PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DEPLOYMENT PIPELINE

```text
Developer
 ↓
Pull Request
 ↓
CI
 ↓
Tests
 ↓
Build
 ↓
Security Scan
 ↓
Artifact
 ↓
Staging
 ↓
Acceptance
 ↓
Approval
 ↓
Production
```

---

## 32. STAGING VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

STAGING VALIDATION

Debe ejecutar:

```text
Conformance
E2E
Security
Performance smoke tests
```

---

## 33. PRODUCTION GATE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PRODUCTION GATE

Antes de producción:

```text
all mandatory tests PASS
```

y:

```text
no critical security issue
```

---

## 34. DATABASE MIGRATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DATABASE MIGRATIONS

Las migraciones AEL deben viajar con el release.

Ejemplo:

```text
migration 014
```

debe ser conocida por el deployment.

---

## 35. MIGRATION SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

MIGRATION SAFETY

Preferir migraciones:

```text
backward compatible
```

cuando sea posible.

---

## 36. EXPAND / CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

EXPAND / CONTRACT

Para cambios complejos:

```text
EXPAND
 ↓
DEPLOY
 ↓
MIGRATE
 ↓
CONTRACT
```

---

## 37. NO DESTRUCTIVE FIRST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

NO DESTRUCTIVE FIRST

No eliminar inmediatamente una columna utilizada por una versión anterior.

---

## 38. ROLLBACK APPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ROLLBACK APPLICATION

Debe existir estrategia para volver a:

```text
previous application version
```

---

## 39. ROLLBACK DATABASE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ROLLBACK DATABASE

Las migraciones destructivas son difíciles de revertir.

Por eso:

```text
backup
expand/contract
```

son preferibles a rollback destructivo.

---

## 40. ARTIFACT ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ARTIFACT ROLLBACK

Para una regla:

```text
v3
```

puede seleccionarse:

```text
v2
```

sin reconstruir v2.

---

## 41. APPLICATION VS RULE ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

APPLICATION VS RULE ROLLBACK

Separar:

```text
Application rollback
```

de:

```text
RuleVersion rollback
```

Una nueva versión de AQUILA no implica automáticamente cambiar las reglas publicadas.

---

## 42. RUNTIME ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RUNTIME ROLLBACK

Si Runtime 1.2 presenta un problema:

```text
Runtime 1.1
```

puede restaurarse si los Artifacts son compatibles.

---

## 43. COMPATIBILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

COMPATIBILITY CHECK

Antes de downgrade:

```text
Artifact compatibility
```

debe verificarse.

---

## 44. BLUE/GREEN

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BLUE/GREEN

Puede utilizarse:

```text
Blue
Green
```

para cambios de Runtime/API cuando la infraestructura lo permita.

---

## 45. CANARY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CANARY

Para cambios de Runtime:

```text
small percentage
 ↓
observe
 ↓
expand
```

puede utilizarse.

---

## 46. RULE RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RULE RELEASE

Las reglas de negocio pueden utilizar:

```text
version publication
```

independientemente del deployment de código.

---

## 47. FEATURE FLAGS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

FEATURE FLAGS

Las features nuevas pueden controlarse mediante:

```text
feature flags
```

pero una flag no debe convertirse en bypass de seguridad.

---

## 48. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

OBSERVABILITY

AEL debe proporcionar:

```text
Logs
Metrics
Traces
Audit
```

---

## 49. LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

LOGGING

Logs técnicos deben incluir:

```text
timestamp
level
service
correlationId
executionId
ruleVersionId
status
```

cuando aplique.

---

## 50. STRUCTURED LOGS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

STRUCTURED LOGS

Preferir:

```json
{
  "level": "info",
  "event": "ael_execution_completed",
  "executionId": "...",
  "ruleVersionId": "...",
  "durationMs": 12
}
```

sobre texto libre.

---

## 51. LOG LEVELS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md; Motor de liquidacion_Observability Audit & Governance 47.md

LOG LEVELS

```text
DEBUG
INFO
WARN
ERROR
FATAL
```

---

## 52. PRODUCTION DEBUG

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PRODUCTION DEBUG

Por defecto:

```text
DEBUG disabled
```

---

## 53. PII

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PII

No registrar innecesariamente:

```text
names
emails
identification
financial details
```

---

## 54. SECRET REDACTION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SECRET REDACTION

Si un error contiene accidentalmente un secreto:

```text
redaction
```

debe aplicarse antes de almacenamiento.

---

## 55. METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

METRICS

Métricas principales:

```text
ael_compile_total
ael_compile_errors_total
ael_execution_total
ael_execution_failed_total
ael_execution_duration_ms
ael_provider_calls_total
ael_provider_errors_total
ael_timeout_total
ael_capability_denied_total
ael_artifact_verification_failed_total
```

---

## 56. LATENCY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

LATENCY

Medir:

```text
p50
p95
p99
```

para:

```text
compile
execute
provider
```

---

## 57. ERROR RATE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ERROR RATE

Monitorear:

```text
execution error rate
provider error rate
compile error rate
```

---

## 58. RESOURCE METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RESOURCE METRICS

Medir:

```text
CPU
memory
event loop
worker utilization
queue depth
```

según infraestructura.

---

## 59. PROVIDER METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PROVIDER METRICS

Por Provider:

```text
calls
duration
timeouts
errors
```

---

## 60. DATABASE METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DATABASE METRICS

AQUILA debe observar:

```text
query latency
connections
locks
errors
```

sin que AEL acceda directamente a estas métricas.

---

## 61. DISTRIBUTED TRACING

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DISTRIBUTED TRACING

Cuando exista infraestructura compatible:

```text
API
 ↓
AEL
 ↓
Provider
 ↓
Database
```

debe poder correlacionarse mediante tracing.

---

## 62. TRACE SAMPLING

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

TRACE SAMPLING

No almacenar trazas completas de todas las ejecuciones si el volumen lo hace costoso.

Utilizar:

```text
sampling
```

según política.

---

## 63. EXECUTION TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

EXECUTION TRACE

El trace de AEL:

```text
instruction trace
```

es diferente de:

```text
distributed trace
```

No confundir ambos.

---

## 64. ALERTS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ALERTS

Alertas recomendadas:

```text
execution failures elevated
provider timeout elevated
tenant isolation violation
artifact verification failure
runtime crash
queue backlog
```

---

## 65. SECURITY ALERTS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SECURITY ALERTS

Alta prioridad:

```text
capability bypass
cross-tenant access
artifact tampering
invalid signature
```

---

## 66. SLO

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SLO

Para operaciones críticas pueden definirse:

```text
availability
latency
error budget
```

según volumen real.

No fijar cifras arbitrarias antes de medir producción.

---

## 67. HEALTH CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

HEALTH CHECK

El servicio AEL debe exponer health checks internos:

```text
liveness
readiness
```

---

## 68. LIVENESS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

LIVENESS

Indica:

```text
process alive
```

No garantiza acceso a todos los Providers.

---

## 69. READINESS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

READINESS

Debe verificar dependencias necesarias para aceptar trabajo.

---

## 70. PROVIDER HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PROVIDER HEALTH

No bloquear todo AEL porque un Provider opcional esté temporalmente caído.

La política depende de:

```text
criticality
```

---

## 71. CIRCUIT BREAKER

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CIRCUIT BREAKER

Puede utilizarse para Providers inestables.

Estados conceptuales:

```text
CLOSED
OPEN
HALF_OPEN
```

---

## 72. RETRY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RETRY

Reintentar sólo errores:

```text
transient
retryable
```

No reintentar:

```text
authorization denied
invalid Contract
invalid Artifact
```

---

## 73. BACKPRESSURE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BACKPRESSURE

Si aumenta la carga:

```text
queue
limits
rate limiting
```

deben proteger el Runtime.

---

## 74. QUEUE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

QUEUE

Para ejecución asíncrona:

```text
Queue
 ↓
Worker
```

---

## 75. DEAD LETTER

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DEAD LETTER

Jobs que fallan repetidamente pueden ir a:

```text
dead-letter queue
```

para diagnóstico.

---

## 76. JOB RETRIES

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

JOB RETRIES

El número de retries debe ser limitado.

Nunca:

```text
infinite retry
```

---

## 77. WORKER ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

WORKER ISOLATION

Un Worker que ejecuta una regla problemática no debe bloquear toda la plataforma.

---

## 78. RESOURCE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RESOURCE LIMITS

Aplicar:

```text
CPU
memory
time
instructions
provider calls
```

según nivel.

---

## 79. CONCURRENCY LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CONCURRENCY LIMIT

Limitar ejecuciones concurrentes por:

```text
tenant
user
rule
worker pool
```

según necesidad.

---

## 80. FAIRNESS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

FAIRNESS

Un tenant no debe poder consumir todos los recursos compartidos.

---

## 81. TENANT QUOTAS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

TENANT QUOTAS

Puede existir:

```text
max executions
max concurrent executions
max monthly compute
```

según modelo comercial.

---

## 82. QUOTAS VS SECURITY LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

QUOTAS VS SECURITY LIMITS

Separar:

```text
Security limits
```

de:

```text
Business quotas
```

---

## 83. SECURITY LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SECURITY LIMIT

Protege infraestructura.

Ejemplo:

```text
maxInstructions
```

---

## 84. BUSINESS QUOTA

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BUSINESS QUOTA

Controla consumo:

```text
10000 executions/month
```

---

## 85. INCIDENT RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

INCIDENT RESPONSE

Ante incidente crítico:

```text
detect
 ↓
contain
 ↓
investigate
 ↓
recover
 ↓
review
```

---

## 86. CONTAINMENT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CONTAINMENT

Puede incluir:

```text
revoke Artifact
disable Function
disable Provider
pause execution
```

---

## 87. EMERGENCY KILL SWITCH

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

EMERGENCY KILL SWITCH

Debe existir capacidad administrativa para:

```text
disable AEL execution
```

si existe una amenaza crítica.

---

## 88. GRANULAR KILL SWITCH

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

GRANULAR KILL SWITCH

Preferible bloquear primero:

```text
RuleVersion
ArtifactHash
Provider
Function
```

antes de apagar todo AEL.

---

## 89. INCIDENT AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

INCIDENT AUDIT

Registrar:

```text
who
when
what
why
scope
```

para acciones de emergencia.

---

## 90. DISASTER RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DISASTER RECOVERY

Definir:

```text
RPO
RTO
```

según los requisitos generales de AQUILA.

No inventar objetivos hasta conocer las necesidades operativas.

---

## 91. BACKUPS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BACKUPS

Asegurar:

```text
PostgreSQL
Artifacts
Configuration
Audit
```

según arquitectura de almacenamiento.

---

## 92. RESTORE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RESTORE TEST

Un backup no se considera confiable hasta probar:

```text
restore
integrity
application startup
Artifact verification
```

---

## 93. DR TEST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DR TEST

Periódicamente:

```text
restore environment
 ↓
run conformance
 ↓
execute canonical rules
```

---

## 94. RELEASE CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RELEASE CHECKLIST

```text
[ ] PR approved
[ ] CI green
[ ] Security scan
[ ] Dependencies audited
[ ] Build reproducible
[ ] Artifact verified
[ ] Migration reviewed
[ ] Staging tests passed
[ ] E2E passed
[ ] Release approved
```

---

## 95. PRODUCTION CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PRODUCTION CHECKLIST

```text
[ ] Backup verified
[ ] Migration ready
[ ] Runtime ready
[ ] Worker ready
[ ] Observability active
[ ] Alerts active
[ ] Rollback plan
[ ] Health checks
```

---

## 96. POST-DEPLOYMENT CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

POST-DEPLOYMENT CHECK

Después del deployment:

```text
health
error rate
latency
provider failures
database
queue
```

---

## 97. SMOKE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SMOKE TEST

Ejecutar una regla canónica:

```text
120.50 M2 × 4500 COP/M2
```

esperando:

```text
542250 COP
```

---

## 98. RELEASE OBSERVATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RELEASE OBSERVATION

Durante el período inicial:

```text
monitor closely
```

sin modificar reglas automáticamente.

---

## 99. ROLLBACK TRIGGER

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ROLLBACK TRIGGER

Puede activarse rollback si existe:

```text
critical security issue
major correctness issue
system instability
```

---

## 100. CORRECTNESS > AVAILABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CORRECTNESS > AVAILABILITY

Para reglas financieras:

```text
resultado incorrecto
```

puede ser peor que:

```text
ejecución temporalmente no disponible
```

Por tanto, ante incertidumbre:

```text
FAIL CLOSED
```

---

## 101. FINANCIAL RULE PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

FINANCIAL RULE PROTECTION

Una regla que produce resultados monetarios debe tener:

```text
version
artifact
test suite
audit
```

y preferiblemente:

```text
approval
```

---

## 102. CHANGE MANAGEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CHANGE MANAGEMENT

Cambios en:

```text
Compiler
Runtime
Contract
Function
Provider
```

deben evaluar impacto sobre:

```text
published rules
```

---

## 103. RELEASE IMPACT ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RELEASE IMPACT ANALYSIS

Antes de release:

```text
affected artifacts
affected contracts
affected functions
```

deben poder identificarse.

---

## 104. RUNTIME CHANGE POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

RUNTIME CHANGE POLICY

Un cambio semántico en Runtime no debe desplegarse como si fuera un cambio puramente técnico.

Debe:

```text
versionarse
testearse
documentarse
```

---

## 105. OBSERVABILITY OF VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

OBSERVABILITY OF VERSION

Métricas deben permitir distinguir:

```text
runtimeVersion
compilerVersion
artifactVersion
```

---

## 106. DASHBOARD

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DASHBOARD

Dashboard operativo mínimo:

```text
Executions
Success rate
Failure rate
Latency
Timeouts
Provider errors
Queue depth
Active workers
```

---

## 107. BUSINESS DASHBOARD

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

BUSINESS DASHBOARD

Separado del técnico:

```text
Rules published
Rules executed
Rule failures
Top rules
```

No mezclar métricas de negocio con infraestructura.

---

## 108. SECURITY DASHBOARD

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SECURITY DASHBOARD

Mostrar:

```text
Capability denials
Artifact failures
Revocations
Tenant security events
```

---

## 109. ALERT FATIGUE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ALERT FATIGUE

No crear alertas para cada error menor.

Priorizar:

```text
actionable
high impact
```

---

## 110. DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DOCUMENTATION

Cada release debe generar:

```text
release notes
migration notes
compatibility notes
```

---

## 111. CHANGELOG

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CHANGELOG

El changelog debe separar:

```text
Added
Changed
Fixed
Security
Breaking
```

---

## 112. SECURITY RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

SECURITY RELEASE

Una vulnerabilidad crítica debe tener:

```text
security advisory
patched version
upgrade guidance
```

según proceso de AQUILA.

---

## 113. DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

DEPRECATION

Antes de retirar:

```text
Runtime API
Contract
Function
```

comunicar:

```text
replacement
timeline
affected rules
```

---

## 114. END-OF-LIFE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

END-OF-LIFE

Un componente fuera de soporte no debe seguir aceptándose para:

```text
new production deployments
```

---

## 115. ARCHITECTURE EVOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

ARCHITECTURE EVOLUTION

V1 debe poder evolucionar hacia:

```text
AEL Compiler Service
AEL Runtime Service
AEL Workers
Artifact Registry
```

sin romper el modelo semántico.

---

## 116. NO PREMATURE DISTRIBUTION

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

NO PREMATURE DISTRIBUTION

No crear microservicios sólo porque la arquitectura futura los contempla.

La separación debe responder a:

```text
load
security
deployment
ownership
```

---

## 117. OPERATING MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

OPERATING MODEL

Inicialmente:

```text
AQUILA
 ├── Web
 ├── API
 └── AEL module
```

Evolución:

```text
AQUILA
 ├── Web
 ├── API
 └── AEL Service
       ├── Compiler
       ├── Runtime
       └── Workers
```

---

## 118. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

CRITERIO DE CIERRE

Deployment y operación V1 quedan definidos cuando existe:

```text
✓ Local
✓ CI
✓ Staging
✓ Production
✓ CI/CD
✓ Build reproducible
✓ Artifact verification
✓ Migrations
✓ Rollback
✓ Observability
✓ Metrics
✓ Logs
✓ Tracing
✓ Alerts
✓ Workers
✓ Queues
✓ Limits
✓ Quotas
✓ Incident response
✓ Backup
✓ Restore
✓ Release management
```

---

## 119. PRINCIPIO ARQUITECTÓNICO DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_Deployment_DevOps_CICD_Observabilidad 14.md

PRINCIPIO ARQUITECTÓNICO DEFINITIVO

AEL debe poder evolucionar y operar como una pieza de infraestructura confiable de AQUILA.

El objetivo no es:

```text
"desplegar el compilador"
```

sino garantizar:

```text
Rule
 ↓
Version
 ↓
Artifact
 ↓
Verified Deployment
 ↓
Controlled Execution
 ↓
Observable Result
```

con capacidad de:

```text
audit
rollback
recovery
```

---

# FIN DEL DOCUMENTO 14

## AEL V1 — Deployment, DevOps, CI/CD y Observabilidad

## 120. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

OBJETIVO

Definir:

```text
environments
build
CI/CD
deployment
workers
queues
runtime isolation
configuration
secrets
observability
logging
metrics
tracing
health checks
scaling
backup
restore
rollback
incident response
```

---

## 121. AMBIENTES

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

AMBIENTES

Ambientes mínimos:

```text
LOCAL
DEVELOPMENT
STAGING
PRODUCTION
```

---

## 122. LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LOCAL

Objetivo:

```text
developer productivity
```

Debe permitir:

```text
run compiler
run runtime
run tests
run API
run PostgreSQL local/test
```

---

## 123. DEVELOPMENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEVELOPMENT

Ambiente compartido para:

```text
integration
feature validation
frontend/backend integration
```

---

## 124. STAGING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

STAGING

Debe aproximarse a:

```text
production architecture
```

sin utilizar datos productivos no autorizados.

---

## 125. PRODUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRODUCTION

Debe ejecutar:

```text
published RuleVersions
```

con infraestructura y políticas reales.

---

## 126. ENVIRONMENT PARITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ENVIRONMENT PARITY

Mantener lo más posible:

```text
same runtime version
same Artifact format
same database engine family
same build process
```

entre:

```text
staging
production
```

---

## 127. CONFIGURATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONFIGURATION

Separar:

```text
code
configuration
secrets
```

---

## 128. CONFIGURATION SOURCES

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONFIGURATION SOURCES

Puede utilizarse:

```text
environment variables
secret manager
deployment configuration
```

según infraestructura AQUILA.

---

## 129. NO SECRETS IN SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NO SECRETS IN SOURCE

Nunca almacenar en Git:

```text
database password
Supabase service key
API secrets
private keys
JWT signing secrets
```

---

## 130. SERVER-ONLY SECRETS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SERVER-ONLY SECRETS

Secrets de backend jamás deben llegar al:

```text
Nuxt client bundle
```

---

## 131. CONFIGURATION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONFIGURATION VALIDATION

Al iniciar un servicio:

```text
validate required configuration
```

Si falta una configuración crítica:

```text
fail fast
```

---

## 132. CONFIGURATION SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONFIGURATION SCHEMA

Validar:

```text
DATABASE_URL
SUPABASE_URL
SERVICE_ROLE
AEL_RUNTIME_VERSION
AEL_MAX_INSTRUCTIONS
AEL_MAX_EXECUTION_MS
```

según las necesidades reales del deployment.

---

## 133. BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BUILD

Build reproducible:

```text
install dependencies
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
integration tests
 ↓
build
 ↓
artifact/package
```

---

## 134. LOCKFILE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LOCKFILE

Debe utilizarse:

```text
package-lock.json
pnpm-lock.yaml
yarn.lock
```

según package manager elegido.

No mezclar package managers.

---

## 135. NODE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NODE VERSION

Fijar versión soportada:

```text
Node.js LTS
```

mediante:

```text
.nvmrc
```

o mecanismo equivalente.

---

## 136. TYPESCRIPT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TYPESCRIPT

CI debe ejecutar:

```text
tsc --noEmit
```

o equivalente.

---

## 137. LINT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LINT

CI debe ejecutar:

```text
lint
```

y fallar ante errores.

---

## 138. FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

FORMAT

Usar formatter consistente:

```text
Prettier
```

o equivalente.

---

## 139. TEST PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TEST PIPELINE

Mínimo:

```text
unit
integration
security
conformance
E2E
```

---

## 140. TEST ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TEST ORDER

Recomendación:

```text
lint
 ↓
typecheck
 ↓
unit
 ↓
integration
 ↓
security
 ↓
build
 ↓
E2E
```

---

## 141. CI

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CI

Pipeline:

```text
Pull Request
 ↓
CI
 ↓
Quality Gates
 ↓
Merge
```

---

## 142. BRANCH PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BRANCH PROTECTION

La rama principal debe requerir:

```text
CI green
review
```

según política del proyecto.

---

## 143. REQUIRED CHECKS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

REQUIRED CHECKS

Como mínimo:

```text
typecheck
lint
unit-tests
integration-tests
security-tests
build
```

---

## 144. ARTIFACT BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT BUILD

El CI debe producir:

```text
AEL packages
API
worker
frontend
```

según el monorepo.

---

## 145. VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

VERSIONING

Versionar:

```text
AEL language
compiler
runtime
artifact format
API
```

por separado cuando sea necesario.

---

## 146. COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

COMPATIBILITY MATRIX

Debe existir una matriz:

```text
Language Version
Compiler Version
Artifact Format
Runtime Version
```

---

## 147. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

EXAMPLE

```text
Language 1.0
Compiler 1.3
Artifact 1
Runtime 1.4
```

debe declarar compatibilidad explícita.

---

## 148. ARTIFACT COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT COMPATIBILITY

Runtime debe rechazar:

```text
unsupported Artifact format
```

en lugar de intentar interpretarlo parcialmente.

---

## 149. DEPLOYMENT UNITS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEPLOYMENT UNITS

Separar conceptualmente:

```text
web/API
worker
frontend
```

---

## 150. API SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

API SERVICE

Responsable de:

```text
HTTP
application services
synchronous execution
job submission
```

---

## 151. WORKER SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORKER SERVICE

Responsable de:

```text
async execution
long-running jobs
scheduled execution
retries
```

---

## 152. FRONTEND

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

FRONTEND

Responsable de:

```text
Rule Workspace
dashboard
execution history
```

No ejecuta AEL Runtime.

---

## 153. WORK QUEUE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORK QUEUE

Para ejecuciones largas:

```text
ExecutionService
 ↓
Queue
 ↓
Worker
 ↓
Runtime
```

---

## 154. QUEUE TECHNOLOGY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

QUEUE TECHNOLOGY

La tecnología concreta puede ser:

```text
Supabase/PostgreSQL queue
Redis/BullMQ
managed queue
```

según infraestructura final.

AEL Core no debe depender de ninguna.

---

## 155. JOB PAYLOAD

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

JOB PAYLOAD

Debe contener referencias:

```text
executionId
ruleVersionId
artifactHash
tenantId
```

No enviar innecesariamente:

```text
entire Artifact
entire Source
large database objects
```

---

## 156. WORKER AUTHORITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORKER AUTHORITY

Worker debe reconstruir contexto autorizado.

No confiar ciegamente en:

```text
tenantId
capabilities
```

recibidos en un job.

---

## 157. JOB VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

JOB VALIDATION

Antes de ejecutar:

```text
execution exists
tenant valid
rule version valid
artifact valid
status valid
```

---

## 158. JOB CLAIM

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

JOB CLAIM

Debe garantizar:

```text
one active worker
```

por ejecución.

---

## 159. RETRIES

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RETRIES

Definir:

```text
maxAttempts
backoff
dead-letter
```

---

## 160. RETRYABLE ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RETRYABLE ERRORS

Ejemplos:

```text
temporary database outage
temporary provider timeout
queue infrastructure error
```

---

## 161. NON-RETRYABLE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NON-RETRYABLE

Ejemplos:

```text
invalid Artifact
capability denied
invalid Contract
invalid input
security violation
```

---

## 162. DEAD LETTER

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEAD LETTER

Jobs que agotan retries:

```text
dead-letter queue
```

para diagnóstico.

---

## 163. WORKER TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORKER TIMEOUT

Cada job debe tener:

```text
execution deadline
```

---

## 164. HEARTBEAT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

HEARTBEAT

Para ejecuciones largas:

```text
heartbeat
lease renewal
```

puede utilizarse.

---

## 165. STALE JOB

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

STALE JOB

Si un Worker desaparece:

```text
lease expires
```

otro Worker puede recuperar el job si la política lo permite.

---

## 166. IDEMPOTENT WORKER

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

IDEMPOTENT WORKER

Reprocesar el mismo job no debe producir:

```text
duplicate financial side effects
```

---

## 167. AEL SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

AEL SIDE EFFECTS

AEL V1 debe preferir:

```text
read-only Providers
pure Functions
```

para minimizar problemas de retry.

---

## 168. EXECUTION RESULT IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

EXECUTION RESULT IDEMPOTENCY

`executionId` es la identidad de la ejecución.

No crear otra ejecución por retry del Worker.

---

## 169. WORKER FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORKER FLOW

```text
claim
 ↓
load execution
 ↓
verify state
 ↓
load RuleVersion
 ↓
load Artifact
 ↓
verify Artifact
 ↓
build context
 ↓
execute Runtime
 ↓
persist result
 ↓
audit
 ↓
complete job
```

---

## 170. API ASYNC FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

API ASYNC FLOW

```text
POST /execute
 ↓
authorize
 ↓
create execution QUEUED
 ↓
enqueue
 ↓
202 Accepted
```

---

## 171. STATUS FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

STATUS FLOW

```text
QUEUED
 ↓
RUNNING
 ↓
COMPLETED
```

o:

```text
RUNNING
 ↓
FAILED
```

---

## 172. TIMEOUT FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TIMEOUT FLOW

```text
RUNNING
 ↓
TIMEOUT
```

y detener la ejecución según capacidad del Worker/Runtime.

---

## 173. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CANCELLATION

```text
CANCEL REQUEST
 ↓
mark cancellation requested
 ↓
worker observes
 ↓
runtime stops safely
 ↓
CANCELLED
```

---

## 174. RUNTIME LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RUNTIME LIMITS

Production debe configurar:

```text
maxInstructions
maxProviderCalls
maxExecutionTimeMs
maxMemory
```

cuando la infraestructura permita controlar memoria.

---

## 175. PROVIDER LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PROVIDER LIMITS

Cada Provider puede tener:

```text
timeout
maxCalls
concurrency limit
```

---

## 176. FUNCTION LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

FUNCTION LIMITS

Cada Function externa debe respetar:

```text
timeout
resource budget
```

---

## 177. GLOBAL EXECUTION BUDGET

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

GLOBAL EXECUTION BUDGET

La suma de:

```text
Provider
Function
Runtime
```

no debe exceder el presupuesto global.

---

## 178. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

OBSERVABILITY

Tres pilares:

```text
Logs
Metrics
Traces
```

---

## 179. LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LOGGING

Logs estructurados:

```json
{
  "level": "info",
  "event": "ael.execution.completed",
  "executionId": "...",
  "ruleVersionId": "...",
  "durationMs": 84
}
```

---

## 180. NO SOURCE LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NO SOURCE LOGGING

No registrar Source completo por defecto.

---

## 181. NO RESULT SENSITIVE LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NO RESULT SENSITIVE LOGGING

No registrar datos sensibles completos.

---

## 182. LOG LEVELS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LOG LEVELS

```text
DEBUG
INFO
WARN
ERROR
```

Production normalmente:

```text
INFO
```

con DEBUG controlado.

---

## 183. CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CORRELATION

Cada request debe propagar:

```text
correlationId
```

a:

```text
Application
Runtime
Provider
Repository
Worker
```

---

## 184. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

EXECUTION ID

Debe acompañar toda telemetría relacionada con una ejecución.

---

## 185. METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

METRICS

Mínimas:

```text
ael_execution_total
ael_execution_success_total
ael_execution_failed_total
ael_execution_timeout_total
ael_execution_duration_ms
ael_provider_calls_total
ael_provider_duration_ms
ael_compile_duration_ms
ael_publish_total
```

---

## 186. METRIC LABELS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

METRIC LABELS

No utilizar como labels de alta cardinalidad:

```text
source
tenant names
user IDs
artifact full hash
```

sin una razón clara.

---

## 187. HISTOGRAMS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

HISTOGRAMS

Usar histogramas para:

```text
compile duration
execution duration
provider latency
API latency
```

---

## 188. ALERTS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ALERTS

Alertas iniciales:

```text
execution error rate high
timeout rate high
queue backlog high
provider latency high
API 5xx high
database errors high
```

---

## 189. TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TRACE

Una ejecución puede producir:

```text
API span
Application span
Runtime span
Provider spans
DB spans
```

---

## 190. TRACE PRIVACY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TRACE PRIVACY

No incluir en spans:

```text
secrets
full Source
sensitive values
```

---

## 191. HEALTH CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

HEALTH CHECK

API:

```text
/health
```

debe indicar:

```text
process alive
```

---

## 192. READINESS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

READINESS

```text
/ready
```

debe comprobar dependencias necesarias para aceptar tráfico.

---

## 193. LIVENESS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LIVENESS

Liveness no debe depender excesivamente de:

```text
PostgreSQL
```

o una dependencia externa, para evitar restart loops.

---

## 194. WORKER HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORKER HEALTH

Worker debe exponer:

```text
alive
ready
queue connectivity
```

según infraestructura.

---

## 195. DATABASE HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DATABASE HEALTH

Monitorizar:

```text
connections
latency
errors
locks
storage
```

---

## 196. QUEUE HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

QUEUE HEALTH

Monitorizar:

```text
queue depth
oldest job age
failed jobs
retry count
```

---

## 197. STORAGE HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

STORAGE HEALTH

Monitorizar:

```text
Artifact retrieval failures
hash verification failures
storage latency
```

---

## 198. SECURITY MONITORING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SECURITY MONITORING

Detectar:

```text
capability denied spikes
tenant access violations
invalid Artifact attempts
suspicious execution patterns
```

---

## 199. DEPLOYMENT STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEPLOYMENT STRATEGY

Preferir:

```text
build once
deploy same artifact
```

entre ambientes.

---

## 200. CONTAINERIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONTAINERIZATION

Si AQUILA utiliza containers:

```text
API image
Worker image
```

pueden compartir base runtime.

---

## 201. IMAGE SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

IMAGE SECURITY

Images deben:

```text
minimal
patched
non-root
```

cuando sea posible.

---

## 202. DEPENDENCY SCANNING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEPENDENCY SCANNING

CI debe analizar:

```text
npm dependencies
container vulnerabilities
```

---

## 203. SBOM

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SBOM

Generar:

```text
Software Bill of Materials
```

para releases relevantes.

---

## 204. SIGNING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SIGNING

Artefactos de deployment pueden firmarse si la infraestructura lo permite.

---

## 205. RELEASE TAG

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RELEASE TAG

Ejemplo:

```text
ael-v1.0.0
```

o release general de AQUILA que incluya AEL.

---

## 206. RELEASE NOTES

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RELEASE NOTES

Cada release debe documentar:

```text
language changes
compiler changes
runtime changes
artifact changes
API changes
migration requirements
```

---

## 207. DATABASE MIGRATION DEPLOYMENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DATABASE MIGRATION DEPLOYMENT

Orden:

```text
backup/check
 ↓
migration
 ↓
application deploy
```

cuando exista compatibilidad.

---

## 208. EXPAND/CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

EXPAND/CONTRACT

Para cambios de esquema complejos:

```text
expand
 ↓
deploy compatible code
 ↓
migrate data
 ↓
contract
```

---

## 209. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BACKWARD COMPATIBILITY

Durante deployment progresivo:

```text
old API
new API
```

pueden coexistir temporalmente.

---

## 210. ARTIFACT COMPATIBILITY DURING ROLLOUT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT COMPATIBILITY DURING ROLLOUT

Antes de desplegar Runtime nuevo:

```text
verify supported Artifact versions
```

---

## 211. ROLLING DEPLOYMENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ROLLING DEPLOYMENT

Durante rollout:

```text
Worker old
Worker new
```

deben coexistir sólo si comparten compatibilidad de Artifact/queue.

---

## 212. BLUE/GREEN

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BLUE/GREEN

Puede utilizarse:

```text
Blue
Green
```

si la infraestructura lo soporta.

---

## 213. CANARY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CANARY

Para cambios críticos de Runtime:

```text
small percentage
 ↓
observe
 ↓
expand
```

---

## 214. ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ROLLBACK

Debe poder revertirse:

```text
API
Worker
Frontend
```

independientemente cuando sea posible.

---

## 215. DATABASE ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DATABASE ROLLBACK

No asumir que toda migration puede revertirse automáticamente.

Diseñar:

```text
forward-compatible migrations
```

cuando sea necesario.

---

## 216. ARTIFACT ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT ROLLBACK

Un Runtime anterior debe poder ejecutar los Artifacts compatibles que continúen en uso.

---

## 217. RULE ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RULE ROLLBACK

Rollback de negocio:

```text
activate previous RuleVersion
```

No recompilar innecesariamente.

---

## 218. RULE VERSION ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RULE VERSION ROLLBACK

Debe ser:

```text
explicit
audited
authorized
```

---

## 219. INCIDENT MODE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

INCIDENT MODE

Si se detecta problema grave:

```text
disable affected Rule
```

sin modificar históricas.

---

## 220. EMERGENCY REVOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

EMERGENCY REVOCATION

Puede revocarse:

```text
Contract
Function
Artifact
RuleVersion
```

según política.

---

## 221. REVOCATION EFFECT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

REVOCATION EFFECT

Future executions:

```text
DENIED
```

Historical executions:

```text
remain historical
```

---

## 222. AUDIT INCIDENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

AUDIT INCIDENT

Toda acción de emergencia debe registrar:

```text
actor
reason
timestamp
scope
```

---

## 223. BACKUP

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BACKUP

Backups deben incluir:

```text
PostgreSQL
Artifact storage
configuration references
```

---

## 224. BACKUP CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BACKUP CONSISTENCY

Artifact metadata y Artifact content deben poder reconciliarse.

---

## 225. RESTORE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RESTORE TEST

No considerar backup válido sólo porque:

```text
backup completed
```

Debe probarse:

```text
restore
integrity check
execution test
```

---

## 226. DISASTER RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DISASTER RECOVERY

Definir:

```text
RPO
RTO
```

para AQUILA.

Los valores concretos dependen del negocio.

---

## 227. RPO

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RPO

Definir cuánto dato se puede perder:

```text
rules
versions
executions
audit
```

por categoría.

---

## 228. RTO

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RTO

Definir cuánto tiempo puede tardar:

```text
AEL service
```

en recuperarse.

---

## 229. DISASTER RECOVERY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DISASTER RECOVERY TEST

Realizar simulaciones periódicas:

```text
database restore
artifact restore
worker recovery
queue recovery
```

---

## 230. MULTI-TENANT SCALING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

MULTI-TENANT SCALING

La carga de un tenant no debe monopolizar:

```text
worker pool
database connections
runtime resources
```

---

## 231. TENANT QUOTAS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

TENANT QUOTAS

Puede existir:

```text
max concurrent executions
max executions/day
max compile operations
```

---

## 232. FAIRNESS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

FAIRNESS

Worker scheduling debe considerar:

```text
tenant fairness
priority
quota
```

si la escala lo requiere.

---

## 233. PRIORITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRIORITY

Jobs pueden tener:

```text
normal
high
```

pero evitar prioridades que permitan starvation.

---

## 234. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONCURRENCY

Configurar:

```text
worker concurrency
provider concurrency
database pool size
```

con base en pruebas.

---

## 235. DATABASE POOL

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DATABASE POOL

No permitir que:

```text
worker concurrency × provider calls
```

exceda capacidad DB.

---

## 236. BACKPRESSURE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BACKPRESSURE

Si la infraestructura está saturada:

```text
queue
rate limit
429
```

antes de colapsar.

---

## 237. AUTOSCALING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

AUTOSCALING

Workers pueden escalar según:

```text
queue depth
CPU
execution latency
```

---

## 238. API AUTOSCALING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

API AUTOSCALING

API puede escalar según:

```text
request rate
CPU
latency
```

---

## 239. STATELESS API

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

STATELESS API

API debe ser preferiblemente stateless.

Estado de negocio:

```text
PostgreSQL
queue
storage
```

---

## 240. WORKER STATE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

WORKER STATE

Worker debe mantener estado mínimo y recuperable.

---

## 241. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CACHE

Caches deben considerarse:

```text
ephemeral
```

No fuente primaria de verdad.

---

## 242. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT CACHE

Seguro candidato:

```text
artifact_hash → immutable artifact
```

---

## 243. CONTRACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONTRACT CACHE

Debe respetar:

```text
tenant/context/version
```

cuando corresponda.

---

## 244. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CACHE INVALIDATION

Definir explícitamente:

```text
TTL
version
event
manual invalidation
```

---

## 245. OBSERVABILITY DASHBOARD

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

OBSERVABILITY DASHBOARD

Dashboard mínimo:

```text
Executions
Success rate
Failure rate
Timeout rate
Latency
Queue backlog
Provider latency
API latency
```

---

## 246. BUSINESS DASHBOARD

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BUSINESS DASHBOARD

Separado de technical dashboard:

```text
Rules active
Rules published
Executions
Financial calculation failures
```

---

## 247. ALERT OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ALERT OWNERSHIP

Cada alerta debe tener:

```text
owner
severity
runbook
```

---

## 248. RUNBOOK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RUNBOOK

Crear procedimientos para:

```text
API down
Worker down
DB unavailable
Queue stuck
Artifact corruption
High execution failures
Tenant isolation incident
```

---

## 249. INCIDENT SEVERITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

INCIDENT SEVERITY

Ejemplo:

```text
SEV1
SEV2
SEV3
```

según política AQUILA.

---

## 250. SECURITY INCIDENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SECURITY INCIDENT

Si existe posibilidad de:

```text
cross-tenant access
```

prioridad máxima.

---

## 251. SECURITY RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SECURITY RESPONSE

Acciones posibles:

```text
disable affected Rule
revoke capability
disable Provider
stop Worker
```

---

## 252. NO MASS DELETE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NO MASS DELETE

Ante incidente no eliminar datos históricos como primera respuesta.

Preferir:

```text
disable
revoke
isolate
```

---

## 253. LOG RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LOG RETENTION

Definir:

```text
application logs
security logs
audit events
execution records
```

por separado.

---

## 254. AUDIT RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

AUDIT RETENTION

Audit de negocio debe tener política más estricta que logs técnicos cuando corresponda.

---

## 255. PRIVACY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRIVACY

No conservar más datos de ejecución que los necesarios.

---

## 256. DATA MASKING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DATA MASKING

En observability:

```text
tenant IDs
actor IDs
```

pueden requerir masking dependiendo de entorno.

---

## 257. DEVELOPMENT DATA

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEVELOPMENT DATA

Nunca copiar producción completa a Development.

---

## 258. STAGING DATA

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

STAGING DATA

Preferir:

```text
synthetic
masked
anonymized
```

datos.

---

## 259. PRODUCTION ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRODUCTION ACCESS

Acceso humano directo a producción debe ser:

```text
restricted
audited
```

---

## 260. DATABASE ADMIN

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DATABASE ADMIN

Cambios manuales deben evitarse.

Preferir:

```text
migration
script versionado
```

---

## 261. PRODUCTION RULE EDITING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRODUCTION RULE EDITING

Nunca editar directamente PostgreSQL:

```text
rules.source
rule_versions
```

para corregir negocio.

Utilizar Application Services.

---

## 262. PRODUCTION ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRODUCTION ARTIFACT

Nunca modificar bytes de un Artifact publicado.

---

## 263. ARTIFACT CORRUPTION RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT CORRUPTION RESPONSE

```text
mark unavailable
investigate
restore/rebuild
```

No sobrescribir silenciosamente.

---

## 264. BUILD REPRODUCIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

BUILD REPRODUCIBILITY

Idealmente:

```text
same source
same compiler
same dependencies
```

produce:

```text
same Artifact hash
```

---

## 265. DEPENDENCY LOCK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEPENDENCY LOCK

Compiler build debe usar:

```text
locked dependencies
```

---

## 266. SUPPLY CHAIN

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SUPPLY CHAIN

CI debe controlar:

```text
dependency changes
unexpected packages
postinstall scripts
```

cuando sea posible.

---

## 267. NODE SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NODE SECURITY

Evitar ejecutar paquetes no confiables con privilegios excesivos.

---

## 268. RUNTIME PROCESS

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RUNTIME PROCESS

AEL Worker debe ejecutarse con:

```text
least privilege
```

---

## 269. FILESYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

FILESYSTEM

Runtime no necesita:

```text
write access
```

por defecto.

---

## 270. NETWORK

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

NETWORK

AEL Runtime no necesita:

```text
arbitrary outbound network
```

por defecto.

---

## 271. CONTAINER SANDBOX

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CONTAINER SANDBOX

Si se requiere aislamiento adicional:

```text
container
sandbox
worker process
```

pueden utilizarse.

---

## 272. PROCESS ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PROCESS ISOLATION

Para reglas no confiables de mayor riesgo puede considerarse:

```text
isolated worker
```

sin modificar la semántica AEL.

---

## 273. PRODUCTION DEFAULT DENY

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRODUCTION DEFAULT DENY

Por defecto:

```text
filesystem = denied
network = denied
process spawn = denied
dynamic code = denied
```

---

## 274. SECURITY REGRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SECURITY REGRESSION

Cada release debe ejecutar:

```text
sandbox tests
capability tests
tenant isolation tests
```

---

## 275. DEPLOYMENT CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DEPLOYMENT CHECKLIST

```text
[ ] CI green
[ ] Security scan green
[ ] migrations reviewed
[ ] Artifact compatibility verified
[ ] configuration validated
[ ] secrets available
[ ] backup confirmed
[ ] health checks ready
[ ] rollback plan ready
[ ] monitoring ready
```

---

## 276. PRODUCTION RELEASE CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

PRODUCTION RELEASE CHECKLIST

```text
[ ] API deployed
[ ] Worker deployed
[ ] Frontend deployed
[ ] migrations applied
[ ] smoke tests passed
[ ] queue operational
[ ] database operational
[ ] Artifact retrieval operational
[ ] sample Rule execution passed
```

---

## 277. SMOKE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

SMOKE TEST

Después del deployment:

```text
validate canonical Rule
execute canonical Rule
verify result
```

Esperado:

```text
542250 COP
```

---

## 278. POST-DEPLOY MONITORING

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

POST-DEPLOY MONITORING

Durante el período inicial:

```text
API errors
worker errors
execution failures
queue
database
```

deben observarse.

---

## 279. ROLLBACK TRIGGER

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ROLLBACK TRIGGER

Definir criterios objetivos:

```text
error rate > threshold
timeout rate > threshold
security regression
data corruption
```

---

## 280. ROLLBACK PROCEDURE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ROLLBACK PROCEDURE

```text
stop rollout
 ↓
protect data
 ↓
rollback application
 ↓
verify Artifact compatibility
 ↓
smoke test
 ↓
monitor
```

---

## 281. POST-INCIDENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

POST-INCIDENT

Después de incidente:

```text
root cause
timeline
impact
corrective actions
preventive actions
```

---

## 282. CHANGE MANAGEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CHANGE MANAGEMENT

Cambios críticos:

```text
Runtime
Compiler
Artifact format
Security policy
Provider
```

requieren revisión.

---

## 283. RUNTIME RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

RUNTIME RELEASE

Un cambio de Runtime puede afectar:

```text
historical reproducibility
```

Por eso debe documentarse.

---

## 284. COMPILER RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

COMPILER RELEASE

Un cambio de Compiler debe probar:

```text
golden artifacts
determinism
conformance
```

---

## 285. LANGUAGE RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

LANGUAGE RELEASE

Cambios semánticos deben incrementar:

```text
language version
```

según semantic versioning policy.

---

## 286. ARTIFACT FORMAT RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARTIFACT FORMAT RELEASE

Cambios incompatibles requieren:

```text
new artifact format
```

y matriz de compatibilidad.

---

## 287. API RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

API RELEASE

Breaking API changes:

```text
new API version
```

---

## 288. DOCUMENTATION RELEASE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

DOCUMENTATION RELEASE

Mantener sincronizados:

```text
language spec
API docs
runtime docs
deployment docs
```

---

## 289. AEL-005

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

AEL-005

Nombre:

```text
AEL-005 — Production Operations & Reliability
```

---

## 290. EXIT CRITERIA

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

EXIT CRITERIA

```text
✓ Environments defined
✓ CI pipeline defined
✓ Build reproducible
✓ API deployment defined
✓ Worker deployment defined
✓ Queue strategy defined
✓ Retry policy defined
✓ Runtime limits configured
✓ Observability implemented
✓ Health checks implemented
✓ Backup/restore tested
✓ Rollback defined
✓ Security hardening defined
✓ Multi-tenant scaling strategy defined
✓ Incident response defined
✓ Production smoke test defined
```

---

## 291. ARQUITECTURA OPERATIVA FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

ARQUITECTURA OPERATIVA FINAL

```text
                         AQUILA
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
       Frontend             API              Worker
          │                 │                 │
          │                 ▼                 ▼
          │          Application       Execution Queue
          │                 │                 │
          │                 ▼                 ▼
          │             AEL Core          AEL Runtime
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                     Providers / Repos
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
             PostgreSQL             Storage
                 │
                RLS
```

---

## 292. CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Operacion_Deployment_Workers_CICD_Produccion 22.md

CIERRE

Con AEL-005 queda definido el camino desde:

```text
commit
```

hasta:

```text
production execution
```

incluyendo:

```text
build
test
deploy
execute
observe
recover
rollback
```

El sistema ya no se define solamente por sus componentes de software, sino también por su capacidad de operar de manera segura y reproducible.

> **AEL está listo para entrar en la etapa de implementación real: el siguiente trabajo ya no consiste en seguir agregando arquitectura indefinidamente, sino en convertir estos contratos en código, migrations, tests, servicios y componentes dentro del repositorio AQUILA.**

---

# FIN DEL DOCUMENTO 22

## AEL V1 — Operación, Deployment, Workers, CI/CD y Producción

## 293. OBJETIVO

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBJETIVO

Definir:

```text
Metrics
Logs
Tracing
Audit
Execution History
Rule Governance
Publication
Approval
Activation
Revocation
Access Control
Retention
Alerting
Operational Dashboards
```

---

## 294. OBSERVABILITY MODEL

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY MODEL

AEL utiliza:

```text
Metrics
+
Logs
+
Traces
+
Audit Events
```

Cada mecanismo tiene una finalidad distinta.

---

## 295. METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

METRICS

Metrics responden:

```text
¿Cuánto?
¿Con qué frecuencia?
¿Cuánto tarda?
```

---

## 296. LOGS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

LOGS

Logs responden:

```text
¿Qué ocurrió?
```

---

## 297. TRACES

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TRACES

Traces responden:

```text
¿Dónde pasó?
¿Qué componentes participaron?
```

---

## 298. AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT

Audit responde:

```text
¿Quién hizo qué, cuándo y sobre qué recurso?
```

---

## 299. EXECUTION HISTORY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION HISTORY

Execution History responde:

```text
¿Qué Rule se ejecutó?
¿Qué Artifact?
¿Qué tenant?
¿Qué resultado?
```

---

## 300. OBSERVABILITY CORRELATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY CORRELATION

Usar identificadores:

```text
requestId
correlationId
executionId
artifactHash
```

cuando corresponda.

---

## 301. REQUEST ID

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REQUEST ID

Identifica una solicitud externa.

---

## 302. CORRELATION ID

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

CORRELATION ID

Permite agrupar operaciones relacionadas.

---

## 303. EXECUTION ID

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION ID

Identifica una ejecución concreta de AEL.

---

## 304. ARTIFACT HASH

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ARTIFACT HASH

Permite identificar exactamente el Artifact ejecutado.

---

## 305. TENANT ID

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TENANT ID

Debe asociarse internamente a la ejecución cuando sea necesario.

Nunca debe derivarse de:

```text
user-editable input
```

---

## 306. ACTOR ID

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ACTOR ID

Registrar actor cuando exista contexto autenticado.

---

## 307. METRIC NAMING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

METRIC NAMING

Convención:

```text
ael_<domain>_<metric>
```

---

## 308. CORE METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

CORE METRICS

```text
ael_execution_total
ael_execution_success_total
ael_execution_failure_total
ael_execution_duration_seconds
```

---

## 309. COMPILATION METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

COMPILATION METRICS

```text
ael_compile_total
ael_compile_failure_total
ael_compile_duration_seconds
```

---

## 310. VERIFIER METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

VERIFIER METRICS

```text
ael_verification_total
ael_verification_failure_total
ael_verification_duration_seconds
```

---

## 311. PROVIDER METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PROVIDER METRICS

```text
ael_provider_call_total
ael_provider_error_total
ael_provider_timeout_total
ael_provider_duration_seconds
```

---

## 312. FUNCTION METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

FUNCTION METRICS

```text
ael_function_call_total
ael_function_error_total
ael_function_duration_seconds
```

---

## 313. DATABASE METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DATABASE METRICS

```text
ael_database_query_total
ael_database_error_total
ael_database_timeout_total
ael_database_duration_seconds
```

---

## 314. SECURITY METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SECURITY METRICS

```text
ael_auth_denied_total
ael_security_error_total
ael_artifact_integrity_failure_total
ael_tenant_isolation_failure_total
```

---

## 315. GOVERNANCE METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

GOVERNANCE METRICS

```text
ael_rule_publish_total
ael_rule_activation_total
ael_rule_revocation_total
```

---

## 316. METRIC LABELS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

METRIC LABELS

Labels pueden incluir:

```text
environment
result
error_code
provider
```

---

## 317. HIGH CARDINALITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

HIGH CARDINALITY

No utilizar como metric labels:

```text
executionId
requestId
userId
raw tenantId
```

si producen cardinalidad excesiva.

---

## 318. TENANT METRICS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TENANT METRICS

Tenant-level metrics pueden almacenarse separadamente cuando sean necesarios.

---

## 319. LOG FORMAT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

LOG FORMAT

Structured JSON recomendado.

---

## 320. LOG FIELDS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

LOG FIELDS

Conceptualmente:

```text
timestamp
level
service
component
code
requestId
correlationId
executionId
artifactHash
tenantId
duration
```

según sensibilidad.

---

## 321. DEBUG

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DEBUG

Sólo para:

```text
development
controlled troubleshooting
```

---

## 322. PRODUCTION DEBUG

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PRODUCTION DEBUG

No habilitar globalmente en producción.

---

## 323. ERROR LOGGING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ERROR LOGGING

Cada error crítico debe registrar:

```text
errorCode
phase
correlation
```

---

## 324. NO RAW SOURCE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

NO RAW SOURCE

No registrar Source completo por defecto.

---

## 325. NO RAW INPUT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

NO RAW INPUT

No registrar inputs sensibles completos.

---

## 326. REDACTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REDACTION

Implementar:

```text
mask
redact
hash
```

según dato.

---

## 327. SECRET REDACTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SECRET REDACTION

Nunca registrar:

```text
password
API key
token
connection string
secret
```

---

## 328. FINANCIAL DATA

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

FINANCIAL DATA

Valores financieros sensibles deben minimizarse en logs.

---

## 329. PERSONAL DATA

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PERSONAL DATA

Datos personales deben:

```text
minimize
redact
```

según necesidad operacional y normativa aplicable.

---

## 330. TRACE MODEL

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TRACE MODEL

Trace:

```text
Request
 └─ Execution
     ├─ Function
     ├─ Contract
     ├─ Provider
     └─ Database
```

---

## 331. EXECUTION SPAN

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION SPAN

Execution puede tener:

```text
execution span
```

---

## 332. PROVIDER SPAN

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PROVIDER SPAN

Cada Provider call puede representar:

```text
child span
```

---

## 333. DATABASE SPAN

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DATABASE SPAN

Database call puede representar:

```text
child span
```

---

## 334. TRACE ATTRIBUTES

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TRACE ATTRIBUTES

Evitar:

```text
raw secrets
full sensitive payloads
```

---

## 335. TRACE SAMPLING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TRACE SAMPLING

Producción puede utilizar:

```text
sampling
```

---

## 336. ERROR SAMPLING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ERROR SAMPLING

Errores críticos deben tener mayor probabilidad de conservar trace.

---

## 337. AUDIT MODEL

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT MODEL

Audit Event:

```ts
interface AuditEvent {
  eventId: string
  timestamp: string
  actorId?: string
  tenantId?: string
  action: string
  resourceType: string
  resourceId: string
  result: string
  correlationId?: string
  metadata?: Record<string, unknown>
}
```

---

## 338. AUDIT ACTIONS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT ACTIONS

Ejemplos:

```text
RULE_CREATED
RULE_UPDATED
RULE_COMPILED
RULE_VERIFIED
RULE_APPROVED
RULE_PUBLISHED
RULE_ACTIVATED
RULE_RETIRED
RULE_REVOKED
```

---

## 339. DEPENDENCY ACTIONS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DEPENDENCY ACTIONS

```text
DEPENDENCY_PUBLISHED
DEPENDENCY_ACTIVATED
DEPENDENCY_RETIRED
DEPENDENCY_REVOKED
```

---

## 340. ACCESS ACTIONS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ACCESS ACTIONS

```text
RULE_VIEWED
RULE_EXPORTED
ARTIFACT_DOWNLOADED
```

cuando aplique.

---

## 341. EXECUTION ACTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION ACTION

```text
RULE_EXECUTED
```

---

## 342. AUDIT RESULT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT RESULT

```text
SUCCESS
DENIED
FAILED
```

---

## 343. AUDIT IMMUTABILITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT IMMUTABILITY

Audit records deben ser:

```text
append-only
```

cuando sea posible.

---

## 344. AUDIT ACCESS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT ACCESS

Sólo roles autorizados pueden consultar:

```text
audit history
```

---

## 345. TENANT AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TENANT AUDIT

Tenant users sólo deben acceder a:

```text
own tenant audit
```

según policy.

---

## 346. ADMIN AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ADMIN AUDIT

Privileged access debe quedar auditado.

---

## 347. BREAK-GLASS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

BREAK-GLASS

Acceso administrativo excepcional debe registrar:

```text
actor
reason
timestamp
scope
```

---

## 348. RULE GOVERNANCE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

RULE GOVERNANCE

Rule lifecycle:

```text
DRAFT
 ↓
COMPILED
 ↓
VERIFIED
 ↓
APPROVED
 ↓
PUBLISHED
 ↓
ACTIVE
 ↓
RETIRED
```

Puede existir:

```text
REVOKED
```

---

## 349. DRAFT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DRAFT

Editable.

No ejecutable en producción.

---

## 350. COMPILED

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

COMPILED

Artifact generado.

No implica:

```text
approved
```

---

## 351. VERIFIED

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

VERIFIED

Artifact pasó:

```text
Verifier
```

---

## 352. APPROVED

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

APPROVED

Un actor autorizado aprobó el Artifact.

---

## 353. PUBLISHED

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PUBLISHED

Artifact disponible para activación.

---

## 354. ACTIVE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ACTIVE

Artifact utilizado por la ejecución de producción.

---

## 355. RETIRED

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

RETIRED

No debe utilizarse para nuevas activaciones.

---

## 356. REVOKED

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REVOKED

No debe ejecutarse cuando policy de seguridad lo prohíba.

---

## 357. SEPARATION OF DUTIES

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SEPARATION OF DUTIES

Para Rules críticas:

```text
Author
Reviewer
Publisher
```

pueden ser actores distintos.

---

## 358. APPROVAL POLICY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

APPROVAL POLICY

Production activation puede requerir:

```text
explicit approval
```

---

## 359. APPROVAL RECORD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

APPROVAL RECORD

Registrar:

```text
approver
timestamp
artifactHash
decision
reason
```

---

## 360. REJECTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REJECTION

Approval puede producir:

```text
APPROVED
REJECTED
```

---

## 361. REJECTION REASON

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REJECTION REASON

Debe registrarse para:

```text
governance
audit
```

---

## 362. ACTIVATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ACTIVATION

Activar significa cambiar:

```text
active Artifact reference
```

---

## 363. NO ARTIFACT MUTATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

NO ARTIFACT MUTATION

Activation nunca modifica el Artifact.

---

## 364. ROLLBACK

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ROLLBACK

Rollback significa:

```text
active pointer
→ previous valid Artifact
```

---

## 365. ROLLBACK AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ROLLBACK AUDIT

Registrar:

```text
previousArtifact
newActiveArtifact
actor
reason
```

---

## 366. EMERGENCY REVOCATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EMERGENCY REVOCATION

Debe permitir:

```text
immediate disable
```

de Artifact o dependency vulnerable.

---

## 367. REVOCATION AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REVOCATION AUDIT

Registrar:

```text
revokedArtifact
actor
reason
timestamp
```

---

## 368. GOVERNANCE ROLES

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

GOVERNANCE ROLES

Ejemplos:

```text
RULE_AUTHOR
RULE_REVIEWER
RULE_PUBLISHER
RULE_OPERATOR
RULE_AUDITOR
RULE_ADMIN
```

---

## 369. ROLE ≠ CAPABILITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ROLE ≠ CAPABILITY

Role es agrupación.

Capability es autorización efectiva.

---

## 370. EXECUTION AUTHORIZATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION AUTHORIZATION

Runtime utiliza:

```text
ExecutionContext.capabilities
```

---

## 371. OBSERVABILITY AUTHORIZATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY AUTHORIZATION

Ver logs/audits requiere:

```text
observability permissions
```

---

## 372. TENANT FILTERING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TENANT FILTERING

Todas las consultas tenant-scoped deben respetar:

```text
tenant context
```

---

## 373. RLS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

RLS

Audit/observability data tenant-scoped puede protegerse mediante:

```text
RLS
```

cuando sea adecuado.

---

## 374. OPERATIONAL DASHBOARD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OPERATIONAL DASHBOARD

Dashboard mínimo:

```text
Executions
Success Rate
Failure Rate
Latency
Provider Errors
Database Errors
Security Errors
```

---

## 375. GOVERNANCE DASHBOARD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

GOVERNANCE DASHBOARD

Mostrar:

```text
Draft Rules
Pending Approval
Active Rules
Retired Rules
Revoked Rules
```

---

## 376. VERSION DASHBOARD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

VERSION DASHBOARD

Mostrar:

```text
Artifacts by version
Deprecated versions
Migration pending
```

---

## 377. PROVIDER DASHBOARD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PROVIDER DASHBOARD

Mostrar:

```text
availability
latency
error rate
timeout rate
```

---

## 378. SECURITY DASHBOARD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SECURITY DASHBOARD

Mostrar:

```text
auth denials
capability denials
artifact integrity failures
tenant isolation alerts
```

---

## 379. ALERTING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ALERTING

Alertas para:

```text
high error rate
latency spike
provider outage
database outage
security failures
```

---

## 380. SECURITY ALERTS

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SECURITY ALERTS

Prioridad alta:

```text
artifact integrity failure
tenant isolation violation
credential compromise indicator
```

---

## 381. ALERT ROUTING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ALERT ROUTING

Alertas deben dirigirse según:

```text
severity
component
environment
```

---

## 382. ALERT FATIGUE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ALERT FATIGUE

No crear alertas para eventos normales.

---

## 383. SLO

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SLO

Definir SLO para:

```text
execution availability
latency
provider availability
```

según importancia del servicio.

---

## 384. ERROR BUDGET

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ERROR BUDGET

Utilizar:

```text
error budget
```

para gobernar cambios de plataforma.

---

## 385. RETENTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

RETENTION

Definir políticas separadas para:

```text
logs
metrics
traces
audit
execution history
```

---

## 386. DATA RETENTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DATA RETENTION

Retention debe considerar:

```text
security
operations
business
legal requirements
```

---

## 387. PURGING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PURGING

Purge debe ser:

```text
controlled
audited
```

---

## 388. LEGAL HOLD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

LEGAL HOLD

Cuando aplique:

```text
retention lock
```

debe impedir eliminación de registros sujetos a conservación.

---

## 389. AUDIT EXPORT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT EXPORT

Exportación debe requerir:

```text
authorization
```

y quedar auditada.

---

## 390. OBSERVABILITY COST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY COST

Monitoring debe controlar:

```text
storage
cardinality
trace volume
log volume
```

---

## 391. TENANT OBSERVABILITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

TENANT OBSERVABILITY

Tenant-facing dashboards deben mostrar sólo:

```text
tenant-scoped information
```

---

## 392. CROSS-TENANT TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

CROSS-TENANT TEST

Intentar consultar:

```text
Tenant B audit
```

desde Tenant A.

Resultado:

```text
DENY
```

---

## 393. GOVERNANCE TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

GOVERNANCE TEST

Intentar:

```text
activate without approval
```

Resultado:

```text
DENY
```

---

## 394. ROLE TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ROLE TEST

Role sin:

```text
RULE_PUBLISH
```

no puede publicar.

---

## 395. BREAK-GLASS TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

BREAK-GLASS TEST

Break-glass debe:

```text
require authorization
create audit event
```

---

## 396. OBSERVABILITY TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY TEST

Validar:

```text
requestId propagation
executionId propagation
trace correlation
audit correlation
```

---

## 397. ERROR CORRELATION TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ERROR CORRELATION TEST

Un error debe poder localizarse mediante:

```text
requestId
```

y llegar a:

```text
execution
artifact
provider
database
```

cuando esos componentes participaron.

---

## 398. METRIC CARDINALITY TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

METRIC CARDINALITY TEST

Evitar crecimiento no controlado por:

```text
tenant
execution
request
```

como labels.

---

## 399. LOG REDACTION TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

LOG REDACTION TEST

Injectar:

```text
fake secret
fake token
fake password
```

y verificar:

```text
not present in logs
```

---

## 400. AUDIT INTEGRITY TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

AUDIT INTEGRITY TEST

Intentar:

```text
update audit event
```

Resultado:

```text
DENY
```

---

## 401. RETENTION TEST

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

RETENTION TEST

Verificar:

```text
retention policy
purge
audit
```

---

## 402. INCIDENT WORKFLOW

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

INCIDENT WORKFLOW

Ante incidente:

```text
Detect
 ↓
Correlate
 ↓
Contain
 ↓
Revoke
 ↓
Investigate
 ↓
Recover
 ↓
Review
```

---

## 403. INCIDENT EVIDENCE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

INCIDENT EVIDENCE

Conservar:

```text
audit
logs
traces
artifact hash
dependency set
```

según policy.

---

## 404. POST-INCIDENT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

POST-INCIDENT

Crear:

```text
root cause
corrective action
regression test
```

---

## 405. GOVERNANCE CHANGE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

GOVERNANCE CHANGE

Toda modificación de:

```text
security policy
runtime policy
publication policy
```

debe auditarse.

---

## 406. CONFIGURATION AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

CONFIGURATION AUDIT

Cambios de configuración crítica:

```text
old value
new value
actor
reason
timestamp
```

sin registrar secrets.

---

## 407. POLICY VERSION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

POLICY VERSION

Policies deben poder identificarse mediante:

```text
policyVersion
```

---

## 408. EXECUTION RECORD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION RECORD

Una ejecución crítica puede conservar:

```text
executionId
tenantId
actorId
ruleId
artifactHash
startedAt
completedAt
status
errorCode
```

---

## 409. EXECUTION RESULT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EXECUTION RESULT

No almacenar automáticamente:

```text
full sensitive result
```

si no es necesario.

---

## 410. FINANCIAL EXECUTION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

FINANCIAL EXECUTION

Para liquidaciones puede ser necesario conservar:

```text
input reference
artifact hash
calculation result
rounding policy
```

según requirements del negocio.

---

## 411. REPLAYABILITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REPLAYABILITY

Cuando sea necesario investigar una liquidación:

```text
execution metadata
+
artifact
+
versioned dependencies
+
controlled input snapshot
```

deben permitir reconstrucción.

---

## 412. REPLAY SECURITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

REPLAY SECURITY

Replay debe:

```text
not repeat destructive writes
```

sin modo explícito.

---

## 413. DRY-RUN

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DRY-RUN

Soportar:

```text
dry-run
```

para validaciones y migraciones cuando corresponda.

---

## 414. DRY-RUN AUDIT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DRY-RUN AUDIT

Debe registrarse:

```text
DRY_RUN_EXECUTION
```

si afecta governance.

---

## 415. OBSERVABILITY PRIVACY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY PRIVACY

Observability no debe convertirse en:

```text
secondary database of sensitive data
```

---

## 416. DATA MINIMIZATION

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DATA MINIMIZATION

Registrar:

```text
minimum necessary information
```

---

## 417. ACCESS LOGGING

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ACCESS LOGGING

Acceso a:

```text
audit
logs
execution history
```

puede ser auditado.

---

## 418. ADMIN VISIBILITY

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

ADMIN VISIBILITY

Admin access debe respetar:

```text
least privilege
```

---

## 419. GOVERNANCE REVIEW

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

GOVERNANCE REVIEW

Periódicamente revisar:

```text
active Rules
deprecated Rules
revoked dependencies
pending migrations
```

---

## 420. RULE OWNERSHIP

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

RULE OWNERSHIP

Cada Rule crítica debería tener:

```text
owner
```

---

## 421. DEPENDENCY OWNERSHIP

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

DEPENDENCY OWNERSHIP

Dependencies críticas deberían tener:

```text
owner
```

---

## 422. PROVIDER OWNERSHIP

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PROVIDER OWNERSHIP

Providers críticos deberían tener:

```text
owner
```

---

## 423. SECURITY OWNERSHIP

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

SECURITY OWNERSHIP

Security-sensitive components deben tener:

```text
security owner
```

---

## 424. CHANGE MANAGEMENT

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

CHANGE MANAGEMENT

Cambios críticos deben seguir:

```text
proposal
review
test
approval
deployment
audit
```

---

## 425. EMERGENCY CHANGE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

EMERGENCY CHANGE

Emergency changes deben:

```text
be authorized
be audited
receive retrospective review
```

---

## 426. OBSERVABILITY EXIT CRITERIA

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

OBSERVABILITY EXIT CRITERIA

```text
✓ Metrics
✓ Structured logs
✓ Distributed tracing
✓ Audit events
✓ Execution history
✓ Correlation IDs
✓ Redaction
✓ Tenant isolation
✓ Rule governance
✓ Approval workflow
✓ Publication lifecycle
✓ Activation
✓ Rollback
✓ Revocation
✓ Break-glass
✓ Dashboards
✓ Alerts
✓ SLO
✓ Error budgets
✓ Retention
✓ Incident response
✓ Replay controls
✓ Governance review
```

---

## 427. FINAL OBSERVABILITY ARCHITECTURE

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

FINAL OBSERVABILITY ARCHITECTURE

```text
                    AEL Execution
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Metrics          Logs          Traces
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Observability
                         │
                         ▼
                     Audit
                         │
                         ▼
                    Governance
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Approval       Activation      Revocation
```

---

## 428. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PRINCIPIO DE TRAZABILIDAD

Debe ser posible recorrer:

```text
Actor
 ↓
Request
 ↓
Execution
 ↓
Rule
 ↓
Artifact
 ↓
Dependencies
 ↓
Provider
 ↓
Database
 ↓
Result
```

---

## 429. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PRINCIPIO DE SEGURIDAD

```text
Observe everything necessary
Expose only what is authorized
Store only what is necessary
```

---

## 430. PRINCIPIO DE GOBIERNO

> **Origen:** Motor de liquidacion_Observability Audit & Governance 47.md

PRINCIPIO DE GOBIERNO

Una Rule de producción debe tener:

```text
Owner
Artifact
Version
Approval
Activation state
Audit trail
```

---

## 431. OBJETIVO

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

OBJETIVO

Definir:

```text
Deployment Architecture
Environments
Services
Networking
CI/CD
Secrets
Storage
Database
Workers
Queues
Scaling
Health Checks
Backups
Disaster Recovery
Release Strategy
```

---

## 432. ARQUITECTURA GENERAL

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ARQUITECTURA GENERAL

```text
                         Internet
                            │
                            ▼
                     CDN / WAF / TLS
                            │
                            ▼
                     AQUILA API Layer
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Auth/API        Compiler        Runtime
             │              │              │
             │              ▼              ▼
             │          Registry        Providers
             │              │              │
             └──────────────┼──────────────┘
                            ▼
                       PostgreSQL
                            │
                       RLS / Storage
```

---

## 433. COMPONENTES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPONENTES

Mínimo:

```text
Web Application
API
Authentication
Compiler
Registry
Runtime
Provider Layer
PostgreSQL
Storage
Worker
Queue
Observability
```

---

## 434. WEB APPLICATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

WEB APPLICATION

Responsable de:

```text
Rule authoring
Rule management
Governance UI
Execution monitoring
Reports
```

No debe ejecutar:

```text
trusted Compiler
privileged Runtime
service credentials
```

en el navegador.

---

## 435. API

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

API

Responsable de:

```text
authentication context
authorization
tenant resolution
Rule lifecycle
execution requests
governance
```

---

## 436. COMPILER SERVICE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPILER SERVICE

Puede ejecutarse como:

```text
stateless service
```

---

## 437. COMPILER SECURITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPILER SECURITY

Compiler debe tratar Source como:

```text
untrusted input
```

---

## 438. COMPILER SCALING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPILER SCALING

Compiler instances pueden escalar horizontalmente.

---

## 439. COMPILER STATE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPILER STATE

No mantener estado mutable de usuario entre requests.

---

## 440. REGISTRY SERVICE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

REGISTRY SERVICE

Responsable de:

```text
definitions
versions
dependencies
snapshots
publication
revocation
```

---

## 441. REGISTRY STORAGE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

REGISTRY STORAGE

Puede utilizar:

```text
PostgreSQL
```

con transacciones y constraints.

---

## 442. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ARTIFACT STORAGE

Artifacts pueden almacenarse en:

```text
object storage
```

---

## 443. ARTIFACT DATABASE METADATA

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ARTIFACT DATABASE METADATA

PostgreSQL conserva:

```text
artifactId
version
hash
status
tenant
metadata
```

---

## 444. OBJECT STORAGE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

OBJECT STORAGE

Puede almacenar:

```text
Artifact bytes
source packages
migration packages
```

según policy.

---

## 445. SOURCE STORAGE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SOURCE STORAGE

Source puede almacenarse separado del Artifact.

---

## 446. SOURCE SECURITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SOURCE SECURITY

Source debe tener:

```text
tenant ACL
encryption
audit
```

---

## 447. RUNTIME SERVICE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RUNTIME SERVICE

Runtime puede ejecutarse como:

```text
stateless execution service
```

---

## 448. RUNTIME ISOLATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RUNTIME ISOLATION

Cada execution debe tener:

```text
ExecutionState
```

aislado.

---

## 449. RUNTIME WORKERS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RUNTIME WORKERS

Para ejecuciones largas:

```text
queue
→ worker
→ runtime
```

---

## 450. SYNCHRONOUS EXECUTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SYNCHRONOUS EXECUTION

Para Rules rápidas:

```text
API
→ Runtime
→ Result
```

---

## 451. ASYNCHRONOUS EXECUTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ASYNCHRONOUS EXECUTION

Para ejecuciones largas:

```text
API
→ Queue
→ Worker
→ Runtime
→ Result
```

---

## 452. QUEUE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

QUEUE

Queue debe soportar:

```text
retry
visibility timeout
dead-letter
idempotency
```

---

## 453. DEAD LETTER QUEUE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEAD LETTER QUEUE

Mensajes que exceden retries:

```text
DLQ
```

para investigación.

---

## 454. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

IDEMPOTENCY

Execution request puede utilizar:

```text
idempotencyKey
```

para evitar duplicación.

---

## 455. WORKER SECURITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

WORKER SECURITY

Worker recibe sólo:

```text
required credentials
required capabilities
```

---

## 456. PROVIDER SERVICES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PROVIDER SERVICES

Providers pueden estar:

```text
inside application
separate service
external service
```

según necesidad.

---

## 457. PROVIDER ISOLATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PROVIDER ISOLATION

Providers sensibles deben poder aislarse.

---

## 458. NETWORK SEGMENTATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

NETWORK SEGMENTATION

Separar:

```text
Public
Application
Data
Management
```

networks cuando la infraestructura lo permita.

---

## 459. DATABASE NETWORK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASE NETWORK

PostgreSQL no debe exponerse directamente a Internet.

---

## 460. STORAGE NETWORK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

STORAGE NETWORK

Object Storage debe utilizar:

```text
authenticated access
```

---

## 461. TLS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

TLS

Toda comunicación externa debe utilizar:

```text
TLS
```

---

## 462. INTERNAL TLS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

INTERNAL TLS

Para servicios críticos puede utilizarse:

```text
mTLS
```

cuando el entorno lo requiera.

---

## 463. AUTHENTICATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

AUTHENTICATION

Authentication pertenece a:

```text
trusted identity provider
```

---

## 464. AUTHORIZATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

AUTHORIZATION

API construye:

```text
ExecutionContext
```

---

## 465. TENANT CONTEXT

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

TENANT CONTEXT

Tenant debe derivarse de:

```text
trusted auth/session context
```

---

## 466. SECRETS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SECRETS

Secrets deben almacenarse en:

```text
Secret Manager
```

o mecanismo equivalente.

---

## 467. NO SECRETS IN CODE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

NO SECRETS IN CODE

Nunca:

```text
Git
Source
Artifact
Frontend bundle
```

---

## 468. SECRET ROTATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SECRET ROTATION

Secrets deben poder rotarse:

```text
without recompiling Rules
```

---

## 469. ENVIRONMENT VARIABLES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ENVIRONMENT VARIABLES

Pueden utilizarse para configuración no sensible y referencias a secrets.

---

## 470. ENVIRONMENTS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ENVIRONMENTS

Separar:

```text
DEV
STAGING
PRODUCTION
```

---

## 471. DEV

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEV

Propósito:

```text
development
experimentation
unit/integration
```

---

## 472. STAGING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

STAGING

Debe aproximarse a:

```text
production architecture
```

---

## 473. PRODUCTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRODUCTION

Debe utilizar:

```text
hardened configuration
restricted access
monitoring
backup
```

---

## 474. ENVIRONMENT ISOLATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ENVIRONMENT ISOLATION

No compartir:

```text
production database
production secrets
```

con DEV.

---

## 475. DATABASES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASES

Preferido:

```text
DEV DB
STAGING DB
PRODUCTION DB
```

separadas.

---

## 476. ARTIFACT REGISTRIES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ARTIFACT REGISTRIES

Separar:

```text
DEV Registry
STAGING Registry
PRODUCTION Registry
```

cuando sea viable.

---

## 477. DEPLOYMENT PIPELINE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPLOYMENT PIPELINE

```text
Commit
 ↓
CI
 ↓
Tests
 ↓
Security Scan
 ↓
Build
 ↓
Artifact
 ↓
Staging
 ↓
Verification
 ↓
Approval
 ↓
Production
```

---

## 478. CI

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CI

CI debe ejecutar:

```text
lint
typecheck
unit
integration
security
conformance
```

---

## 479. BUILD

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

BUILD

Build debe ser:

```text
reproducible
```

cuando sea posible.

---

## 480. DEPENDENCIES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPENDENCIES

Utilizar:

```text
lockfiles
pinned versions
```

---

## 481. SUPPLY CHAIN

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SUPPLY CHAIN

CI debe ejecutar:

```text
dependency scanning
SBOM generation
```

---

## 482. CONTAINER IMAGE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CONTAINER IMAGE

Si se utiliza containerización:

```text
immutable image tag
digest pinning
```

preferidos.

---

## 483. IMAGE SECURITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

IMAGE SECURITY

Scan:

```text
OS packages
application dependencies
```

---

## 484. IMAGE REGISTRY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

IMAGE REGISTRY

Sólo imágenes aprobadas deben llegar a:

```text
production
```

---

## 485. DEPLOYMENT STRATEGY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPLOYMENT STRATEGY

Opciones:

```text
rolling
blue-green
canary
```

---

## 486. RECOMMENDATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RECOMMENDATION

Para cambios críticos:

```text
canary
```

o:

```text
blue-green
```

---

## 487. ROLLBACK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ROLLBACK

Debe poder revertirse:

```text
application
runtime
provider
```

sin modificar datos históricos.

---

## 488. DATABASE DEPLOYMENT

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASE DEPLOYMENT

Usar:

```text
versioned migrations
```

---

## 489. EXPAND-CONTRACT

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

EXPAND-CONTRACT

Preferido:

```text
Expand
→ Migrate
→ Switch
→ Contract
```

---

## 490. MIGRATION SAFETY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

MIGRATION SAFETY

Migration debe probarse primero en:

```text
DEV
STAGING
```

---

## 491. DATABASE BACKUP

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASE BACKUP

Production debe tener:

```text
automated backups
```

---

## 492. POINT-IN-TIME RECOVERY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

POINT-IN-TIME RECOVERY

Preferido para PostgreSQL:

```text
PITR
```

si el servicio lo soporta.

---

## 493. BACKUP ENCRYPTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

BACKUP ENCRYPTION

Backups deben estar:

```text
encrypted
```

---

## 494. BACKUP ACCESS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

BACKUP ACCESS

Sólo roles autorizados.

---

## 495. RESTORE TEST

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RESTORE TEST

Backup no se considera confiable hasta probar:

```text
restore
```

periódicamente.

---

## 496. DISASTER RECOVERY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DISASTER RECOVERY

Definir:

```text
RPO
RTO
```

---

## 497. RPO

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RPO

Cuánta información se puede perder:

```text
Recovery Point Objective
```

---

## 498. RTO

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RTO

Tiempo máximo objetivo para recuperación:

```text
Recovery Time Objective
```

---

## 499. FAILOVER

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

FAILOVER

Critical services deben tener estrategia:

```text
failover
```

---

## 500. HEALTH CHECKS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

HEALTH CHECKS

Cada service debe exponer:

```text
liveness
readiness
```

---

## 501. LIVENESS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

LIVENESS

Indica:

```text
process alive
```

---

## 502. READINESS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

READINESS

Indica:

```text
ready to receive traffic
```

---

## 503. DEEP HEALTH

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEEP HEALTH

Puede verificar:

```text
database
registry
provider dependencies
```

pero no debe convertir health checks en una carga excesiva.

---

## 504. STARTUP

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

STARTUP

Services deben tener:

```text
startup timeout
```

---

## 505. SHUTDOWN

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SHUTDOWN

Graceful shutdown:

```text
stop accepting work
finish safe work
close connections
```

---

## 506. RUNTIME SHUTDOWN

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RUNTIME SHUTDOWN

Execution cancellation debe ser segura.

---

## 507. QUEUE SHUTDOWN

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

QUEUE SHUTDOWN

Worker debe:

```text
ack only completed jobs
```

---

## 508. DATABASE POOL

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASE POOL

Configurar:

```text
max connections
timeouts
idle timeout
```

---

## 509. CONNECTION EXHAUSTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CONNECTION EXHAUSTION

Debe producir:

```text
controlled failure
```

no crash cascade.

---

## 510. RATE LIMITING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RATE LIMITING

Aplicar a:

```text
API
Compiler
Execution
Publication
```

---

## 511. RESOURCE LIMITS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RESOURCE LIMITS

Runtime mantiene:

```text
maxSteps
maxStack
maxCalls
timeout
```

---

## 512. API LIMITS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

API LIMITS

API debe limitar:

```text
request size
Source size
payload size
```

---

## 513. STORAGE LIMITS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

STORAGE LIMITS

Limitar:

```text
artifact size
source size
tenant quota
```

---

## 514. TENANT QUOTAS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

TENANT QUOTAS

Puede existir:

```text
execution quota
storage quota
compile quota
```

---

## 515. MULTI-TENANT SCALING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

MULTI-TENANT SCALING

Scaling debe evitar:

```text
noisy neighbor
```

---

## 516. NOISY NEIGHBOR

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

NOISY NEIGHBOR

Un tenant no debe consumir todos los recursos compartidos.

---

## 517. CONTROL

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CONTROL

```text
rate limits
quotas
queues
resource policies
```

---

## 518. CACHE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CACHE

Caches pueden utilizar:

```text
Redis
in-memory
```

según necesidad.

---

## 519. CACHE SECURITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CACHE SECURITY

Keys deben incluir:

```text
tenant
version
dependency
```

cuando corresponda.

---

## 520. CACHE FAILURE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CACHE FAILURE

Cache unavailable no debe comprometer:

```text
data correctness
```

---

## 521. OBSERVABILITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

OBSERVABILITY

Production debe tener:

```text
metrics
logs
traces
alerts
```

---

## 522. CENTRALIZED LOGGING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CENTRALIZED LOGGING

Logs de services deben centralizarse.

---

## 523. LOG RETENTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

LOG RETENTION

Seguir policy definida en Documento 47.

---

## 524. ALERTING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ALERTING

Alertas críticas:

```text
database unavailable
runtime failures
provider outage
security violations
queue backlog
```

---

## 525. QUEUE MONITORING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

QUEUE MONITORING

Monitorear:

```text
depth
age
failure rate
DLQ
```

---

## 526. AUTOSCALING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

AUTOSCALING

Puede utilizar:

```text
CPU
memory
request rate
queue depth
```

---

## 527. RUNTIME AUTOSCALING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RUNTIME AUTOSCALING

Especialmente útil para:

```text
async executions
```

---

## 528. COMPILER AUTOSCALING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPILER AUTOSCALING

Puede escalar según:

```text
compile queue
CPU
```

---

## 529. DATABASE SCALING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASE SCALING

Prioridad:

```text
indexes
query optimization
connection pooling
read scaling
```

antes de aumentar infraestructura indiscriminadamente.

---

## 530. READ REPLICAS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

READ REPLICAS

Sólo para operaciones compatibles con:

```text
eventual consistency
```

---

## 531. FINANCIAL WRITES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

FINANCIAL WRITES

Liquidation writes deben permanecer en:

```text
authoritative primary database
```

---

## 532. TRANSACTIONS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

TRANSACTIONS

Financial mutations deben utilizar:

```text
database transactions
```

cuando corresponda.

---

## 533. IDEMPOTENT WRITES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

IDEMPOTENT WRITES

Writes importantes deben tener:

```text
idempotency strategy
```

---

## 534. DEPLOYMENT ORDER

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPLOYMENT ORDER

Orden recomendado:

```text
Database compatible migration
 ↓
Registry
 ↓
Providers
 ↓
Runtime
 ↓
API
 ↓
Web
```

según change.

---

## 535. RUNTIME FIRST

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RUNTIME FIRST

No desplegar Runtime que requiera:

```text
Artifact format
```

aún no soportado por producción.

---

## 536. COMPATIBILITY GATE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COMPATIBILITY GATE

Antes de deployment:

```text
old artifacts
new runtime
```

deben probarse.

---

## 537. PROVIDER DEPLOYMENT

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PROVIDER DEPLOYMENT

Provider debe pasar:

```text
contract tests
security tests
integration tests
```

---

## 538. ARTIFACT DEPLOYMENT

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ARTIFACT DEPLOYMENT

Artifact debe pasar:

```text
compile
verify
approval
```

---

## 539. PRODUCTION ACTIVATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRODUCTION ACTIVATION

Activation separada de:

```text
deployment
```

---

## 540. FEATURE FLAGS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

FEATURE FLAGS

Puede utilizarse para:

```text
controlled activation
```

pero no para ocultar incompatibilidades de seguridad.

---

## 541. CANARY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CANARY

Canary puede ejecutar:

```text
small traffic percentage
```

antes de full rollout.

---

## 542. FINANCIAL CANARY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

FINANCIAL CANARY

Para liquidaciones críticas:

```text
shadow execution
```

o:

```text
dual run
```

preferido antes de activar nueva versión.

---

## 543. SHADOW EXECUTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SHADOW EXECUTION

New Artifact calcula:

```text
without committing side effects
```

---

## 544. RESULT COMPARISON

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RESULT COMPARISON

Comparar:

```text
old result
new result
```

y reglas de tolerancia.

---

## 545. DIFFERENCE POLICY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DIFFERENCE POLICY

Para dinero:

```text
exact equality
```

puede ser requerida según dominio.

---

## 546. DEPLOYMENT AUDIT

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPLOYMENT AUDIT

Registrar:

```text
who
what
version
environment
timestamp
result
```

---

## 547. PRODUCTION ACCESS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRODUCTION ACCESS

Production access debe ser:

```text
least privilege
audited
restricted
```

---

## 548. SSH / ADMIN ACCESS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SSH / ADMIN ACCESS

Preferir:

```text
temporary
audited
```

access.

---

## 549. NO DIRECT DATABASE EDITS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

NO DIRECT DATABASE EDITS

Production data no debe modificarse manualmente fuera de procesos controlados.

---

## 550. BREAK-GLASS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

BREAK-GLASS

Exceptional access debe:

```text
require reason
be audited
```

---

## 551. INFRASTRUCTURE AS CODE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

INFRASTRUCTURE AS CODE

Infraestructura debería definirse mediante:

```text
IaC
```

cuando sea viable.

---

## 552. CONFIGURATION AS CODE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CONFIGURATION AS CODE

Configuración no secreta debe estar:

```text
version controlled
```

---

## 553. SECRET REFERENCES

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

SECRET REFERENCES

Code debe almacenar:

```text
secret reference
```

no secret value.

---

## 554. ENVIRONMENT CONFIG

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

ENVIRONMENT CONFIG

Separar:

```text
common config
environment config
secret config
```

---

## 555. DRIFT DETECTION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DRIFT DETECTION

Detectar:

```text
infrastructure drift
configuration drift
```

---

## 556. DEPLOYMENT MANIFEST

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPLOYMENT MANIFEST

Cada release debe identificar:

```text
API image
Compiler version
Runtime version
Provider versions
Registry version
DB migration version
```

---

## 557. RELEASE ID

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RELEASE ID

Cada deployment debe tener:

```text
releaseId
```

---

## 558. RELEASE TRACEABILITY

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

RELEASE TRACEABILITY

Debe poder relacionarse:

```text
release
→ deployment
→ Artifact
→ execution
```

---

## 559. INCIDENT ROLLBACK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

INCIDENT ROLLBACK

Ante fallo:

```text
detect
→ stop rollout
→ rollback
→ investigate
```

---

## 560. DATABASE ROLLBACK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DATABASE ROLLBACK

No asumir que todas las migrations son reversibles.

Usar:

```text
forward-compatible migration
```

y restore/PITR cuando sea necesario.

---

## 561. DISASTER RECOVERY TEST

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DISASTER RECOVERY TEST

Al menos periódicamente:

```text
restore database
restore artifacts
restore configuration
```

---

## 562. DR RUNBOOK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DR RUNBOOK

Debe documentar:

```text
who
what
where
commands/procedures
verification
```

---

## 563. DEPLOYMENT RUNBOOK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

DEPLOYMENT RUNBOOK

Cada deployment crítico debe tener:

```text
prechecks
deployment
verification
rollback
```

---

## 564. OPERATIONS RUNBOOK

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

OPERATIONS RUNBOOK

Debe incluir:

```text
DB outage
queue outage
provider outage
artifact corruption
security incident
```

---

## 565. CAPACITY PLANNING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CAPACITY PLANNING

Monitorear:

```text
CPU
memory
DB connections
storage
queue depth
execution latency
```

---

## 566. CAPACITY THRESHOLDS

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

CAPACITY THRESHOLDS

Definir:

```text
warning
critical
```

thresholds.

---

## 567. COST GOVERNANCE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

COST GOVERNANCE

Monitorear:

```text
compute
database
storage
egress
provider costs
```

---

## 568. TENANT COST CONTROL

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

TENANT COST CONTROL

Puede existir:

```text
quota
rate limit
usage meter
```

por tenant.

---

## 569. USAGE METERING

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

USAGE METERING

Registrar:

```text
executions
compile count
storage
provider calls
```

según modelo comercial.

---

## 570. BILLING ISOLATION

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

BILLING ISOLATION

Billing/usage no debe alterar:

```text
AEL semantics
```

---

## 571. INFRASTRUCTURE EXIT CRITERIA

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

INFRASTRUCTURE EXIT CRITERIA

```text
✓ Service architecture
✓ Web/API separation
✓ Compiler service
✓ Registry
✓ Runtime
✓ Providers
✓ PostgreSQL
✓ Artifact storage
✓ Queue
✓ Workers
✓ Networking
✓ TLS
✓ Secrets
✓ DEV/STAGING/PROD
✓ CI/CD
✓ Supply-chain security
✓ Deployment strategy
✓ Health checks
✓ Scaling
✓ Rate limits
✓ Quotas
✓ Backups
✓ PITR
✓ RPO/RTO
✓ Disaster recovery
✓ Observability
✓ Runbooks
✓ Release traceability
✓ Infrastructure governance
```

---

## 572. FINAL DEPLOYMENT ARCHITECTURE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

FINAL DEPLOYMENT ARCHITECTURE

```text
                          INTERNET
                             │
                       CDN / WAF / TLS
                             │
                             ▼
                         WEB / API
                             │
                 ┌───────────┼───────────┐
                 ▼           ▼           ▼
             Compiler     Registry     Runtime
                 │           │           │
                 │           │      ┌────┴────┐
                 │           │      ▼         ▼
                 │           │  Functions  Providers
                 │           │      │         │
                 └───────────┼──────┴─────────┘
                             ▼
                         PostgreSQL
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
                   RLS             Storage
                             │
                       Observability
                             │
                 Metrics / Logs / Traces
```

---

## 573. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRINCIPIO DE AISLAMIENTO

```text
Web
≠
Compiler
≠
Runtime
≠
Registry
≠
Database
```

deben tener responsabilidades y privilegios diferenciados.

---

## 574. PRINCIPIO DE REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRINCIPIO DE REPRODUCIBILIDAD

```text
Source
+
Compiler
+
Registry Snapshot
+
Dependencies
+
Options
```

deben poder reconstruir el Artifact.

---

## 575. PRINCIPIO DE DESPLIEGUE

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRINCIPIO DE DESPLIEGUE

```text
Build
→ Test
→ Verify
→ Stage
→ Approve
→ Deploy
→ Activate
```

---

## 576. PRINCIPIO DE RECUPERACIÓN

> **Origen:** Motor de liquidacion_Deployment & Infrastructure Architecture 48.md

PRINCIPIO DE RECUPERACIÓN

```text
Backup
+
Restore
+
Verification
=
Recoverability
```

---

## 577. OBJETIVO

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

OBJETIVO

Definir:

```text
Latency
Throughput
Concurrency
Benchmarking
Caching
Pooling
Horizontal Scaling
Vertical Scaling
Database Performance
Compiler Performance
Runtime Performance
Multi-Tenant Scaling
Capacity Planning
Performance Budgets
```

---

## 578. PERFORMANCE MODEL

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE MODEL

Separar:

```text
Compile Performance
Verification Performance
Execution Performance
Provider Performance
Database Performance
End-to-End Performance
```

---

## 579. LATENCY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

LATENCY

Medir al menos:

```text
p50
p95
p99
```

No utilizar únicamente:

```text
average
```

---

## 580. THROUGHPUT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

THROUGHPUT

Medir:

```text
executions / second
compilations / second
provider calls / second
database operations / second
```

---

## 581. CONCURRENCY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CONCURRENCY

Definir:

```text
concurrent compilations
concurrent executions
concurrent tenants
```

---

## 582. PERFORMANCE BUDGET

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE BUDGET

Cada servicio debe tener:

```text
latency budget
CPU budget
memory budget
```

---

## 583. COMPILER PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COMPILER PERFORMANCE

Separar:

```text
lexing
parsing
semantic analysis
type checking
IR generation
artifact generation
```

---

## 584. COMPILER BENCHMARK

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COMPILER BENCHMARK

Crear fixtures:

```text
small Rule
medium Rule
large Rule
```

---

## 585. SMALL RULE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SMALL RULE

Representa:

```text
simple calculation
few dependencies
```

---

## 586. MEDIUM RULE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

MEDIUM RULE

Incluye:

```text
multiple Contracts
Functions
conditions
```

---

## 587. LARGE RULE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

LARGE RULE

Incluye:

```text
large AST
many dependencies
complex control flow
```

---

## 588. COMPILER BASELINE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COMPILER BASELINE

Registrar:

```text
compile time
memory
Artifact size
```

---

## 589. REGRESSION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

REGRESSION

Cada cambio de compiler debe compararse contra:

```text
baseline
```

---

## 590. PARSER OPTIMIZATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PARSER OPTIMIZATION

No optimizar parser hasta identificar:

```text
actual bottleneck
```

---

## 591. AST MEMORY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

AST MEMORY

Controlar:

```text
node count
node size
source retention
```

---

## 592. SOURCE RETENTION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SOURCE RETENTION

No conservar Source completo durante runtime si no es necesario.

---

## 593. IR PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

IR PERFORMANCE

Medir:

```text
IR generation time
IR size
```

---

## 594. ARTIFACT SIZE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

ARTIFACT SIZE

Artifact debe permanecer compacto para:

```text
storage
network
startup
cache
```

---

## 595. VERIFIER PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

VERIFIER PERFORMANCE

Medir:

```text
verification latency
memory
```

---

## 596. VERIFIER COMPLEXITY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

VERIFIER COMPLEXITY

Verifier debe ser:

```text
bounded
predictable
```

---

## 597. RUNTIME PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RUNTIME PERFORMANCE

Separar:

```text
instruction dispatch
stack operations
operators
function calls
provider calls
```

---

## 598. HOT PATH

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

HOT PATH

Identificar mediante profiling:

```text
hot instructions
hot functions
hot providers
```

---

## 599. NO PREMATURE OPTIMIZATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

NO PREMATURE OPTIMIZATION

No optimizar sin:

```text
profile
benchmark
regression measurement
```

---

## 600. RUNTIME ALLOCATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RUNTIME ALLOCATION

Reducir allocations innecesarias en:

```text
execution loop
stack
temporary values
```

---

## 601. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

EXECUTION CONTEXT

Context debe ser:

```text
cheap to access
immutable where possible
```

---

## 602. STACK IMPLEMENTATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

STACK IMPLEMENTATION

Preferir estructuras:

```text
predictable
bounded
cache-friendly
```

cuando sea viable.

---

## 603. OBJECT ALLOCATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

OBJECT ALLOCATION

Evitar crear objetos temporales por cada:

```text
instruction
```

si profiling demuestra impacto.

---

## 604. JIT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

JIT

JIT no es requisito de V1.

---

## 605. PRECOMPILATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PRECOMPILATION

La compilación debe realizarse fuera del hot path de ejecución cuando sea posible.

---

## 606. EXECUTION MODEL

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

EXECUTION MODEL

Preferido:

```text
Compile once
Verify once
Execute many
```

---

## 607. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

ARTIFACT CACHE

Cachear Artifacts verificados:

```text
artifactHash
→ verified artifact
```

---

## 608. CACHE SAFETY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CACHE SAFETY

Cache key debe incluir identidad suficiente:

```text
artifactHash
runtimeCompatibility
```

---

## 609. NO SOURCE-ONLY CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

NO SOURCE-ONLY CACHE

No ejecutar desde cache basado únicamente en:

```text
sourceHash
```

si dependencies pueden cambiar.

---

## 610. REGISTRY SNAPSHOT CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

REGISTRY SNAPSHOT CACHE

Cachear:

```text
registrySnapshotHash
```

---

## 611. PROVIDER CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROVIDER CACHE

Provider results sólo pueden cachearse cuando Contract permita:

```text
cacheability
```

---

## 612. FINANCIAL CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

FINANCIAL CACHE

No cachear resultados de liquidación si:

```text
data freshness
```

puede cambiar el resultado.

---

## 613. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CACHE INVALIDATION

Invalidar por:

```text
version
hash
revocation
tenant
```

cuando corresponda.

---

## 614. CACHE TTL

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CACHE TTL

TTL debe ser definido por:

```text
semantic policy
```

no por conveniencia técnica.

---

## 615. DISTRIBUTED CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DISTRIBUTED CACHE

Redis u otro cache puede utilizarse.

---

## 616. CACHE FAILURE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CACHE FAILURE

Si cache falla:

```text
fallback
```

no debe alterar correctness.

---

## 617. CONNECTION POOLING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CONNECTION POOLING

Database connections deben utilizar:

```text
pool
```

---

## 618. POOL SIZE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

POOL SIZE

No elegir pool size arbitrariamente.

Debe considerar:

```text
DB capacity
worker count
request concurrency
```

---

## 619. CONNECTION LIMIT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CONNECTION LIMIT

Aplicar límites para evitar:

```text
connection exhaustion
```

---

## 620. PROVIDER POOLING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROVIDER POOLING

External clients pueden reutilizar:

```text
HTTP connections
DB connections
SDK clients
```

cuando sea seguro.

---

## 621. DATABASE PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DATABASE PERFORMANCE

Prioridad:

```text
query plan
indexes
statistics
connection pool
```

---

## 622. INDEXING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

INDEXING

Crear índices según:

```text
actual query patterns
```

---

## 623. NO INDEX EVERYTHING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

NO INDEX EVERYTHING

Cada índice agrega:

```text
storage
write cost
maintenance
```

---

## 624. TENANT INDEXING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

TENANT INDEXING

Queries tenant-scoped deben considerar:

```text
tenant_id
```

en índices adecuados.

---

## 625. COMPOSITE INDEXES

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COMPOSITE INDEXES

Diseñar según:

```text
tenant_id
+
frequent filter
+
sort
```

cuando corresponda.

---

## 626. RLS PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RLS PERFORMANCE

RLS policies deben evaluarse por:

```text
query plan
index usage
```

---

## 627. RLS INDEX

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RLS INDEX

Columns utilizadas por RLS deben estar adecuadamente indexadas cuando sea necesario.

---

## 628. QUERY PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

QUERY PERFORMANCE

Evitar:

```text
N+1
unbounded SELECT
large unnecessary payloads
```

---

## 629. PAGINATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PAGINATION

API debe utilizar:

```text
bounded pagination
```

---

## 630. CURSOR PAGINATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CURSOR PAGINATION

Para grandes datasets:

```text
cursor/keyset pagination
```

preferida.

---

## 631. BULK OPERATIONS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

BULK OPERATIONS

Para procesos masivos:

```text
batching
bulk insert/update
```

cuando sea seguro.

---

## 632. FINANCIAL TRANSACTIONS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

FINANCIAL TRANSACTIONS

Bulk operations no deben sacrificar:

```text
transaction integrity
```

---

## 633. TRANSACTION SIZE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

TRANSACTION SIZE

Transacciones excesivamente grandes pueden producir:

```text
locks
memory pressure
long waits
```

---

## 634. LOCK CONTENTION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

LOCK CONTENTION

Medir:

```text
lock wait
deadlock
transaction duration
```

---

## 635. DEADLOCK HANDLING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DEADLOCK HANDLING

Aplicar:

```text
consistent access order
retry policy
```

cuando corresponda.

---

## 636. RETRY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RETRY

Retry sólo para errores:

```text
transient
```

---

## 637. NO RETRY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

NO RETRY

No reintentar automáticamente:

```text
authorization failure
validation failure
semantic failure
```

---

## 638. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

IDEMPOTENCY

Retries de writes deben tener:

```text
idempotency protection
```

---

## 639. ASYNC EXECUTION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

ASYNC EXECUTION

Use queue cuando execution:

```text
exceeds synchronous latency budget
```

---

## 640. QUEUE THROUGHPUT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

QUEUE THROUGHPUT

Medir:

```text
jobs/sec
queue depth
job age
```

---

## 641. QUEUE BACKPRESSURE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

QUEUE BACKPRESSURE

Cuando queue crece:

```text
rate limit
autoscale
reject
```

según policy.

---

## 642. WORKER CONCURRENCY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

WORKER CONCURRENCY

Definir:

```text
max jobs / worker
```

---

## 643. PROVIDER CONCURRENCY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROVIDER CONCURRENCY

Cada Provider puede tener:

```text
concurrency limit
```

---

## 644. EXTERNAL RATE LIMIT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

EXTERNAL RATE LIMIT

Respetar:

```text
provider quotas
```

---

## 645. PROVIDER CIRCUIT BREAKER

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROVIDER CIRCUIT BREAKER

Para servicios externos:

```text
circuit breaker
```

puede evitar cascadas.

---

## 646. CIRCUIT STATES

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CIRCUIT STATES

```text
CLOSED
OPEN
HALF_OPEN
```

---

## 647. CIRCUIT BREAKER

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CIRCUIT BREAKER

No cambiar:

```text
business semantics
```

---

## 648. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROVIDER TIMEOUT

Cada external call debe tener:

```text
explicit timeout
```

---

## 649. DATABASE TIMEOUT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DATABASE TIMEOUT

Queries críticas deben tener:

```text
statement timeout
```

cuando sea apropiado.

---

## 650. RUNTIME TIMEOUT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RUNTIME TIMEOUT

Execution debe tener:

```text
deadline
```

---

## 651. TIMEOUT PROPAGATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

TIMEOUT PROPAGATION

Request deadline debe propagarse:

```text
API
→ Runtime
→ Provider
→ Database
```

cuando sea compatible.

---

## 652. CANCELLATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CANCELLATION

Cancellation debe propagarse para evitar:

```text
orphan work
```

---

## 653. ORPHAN WORK

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

ORPHAN WORK

No continuar consumiendo recursos después de:

```text
request cancelled
```

salvo operaciones que deban completar por integridad.

---

## 654. HORIZONTAL SCALING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

HORIZONTAL SCALING

Compiler:

```text
scale horizontally
```

---

## 655. RUNTIME SCALING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RUNTIME SCALING

Runtime:

```text
scale horizontally
```

---

## 656. API SCALING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

API SCALING

API:

```text
scale horizontally
```

---

## 657. STATELESSNESS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

STATELESSNESS

Services escalables deben minimizar:

```text
local mutable state
```

---

## 658. SESSION STATE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SESSION STATE

Sessions deben almacenarse en:

```text
trusted shared system
```

si requieren persistencia.

---

## 659. DATABASE BOTTLENECK

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DATABASE BOTTLENECK

Database normalmente será un componente de:

```text
shared capacity
```

y debe monitorearse.

---

## 660. READ SCALING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

READ SCALING

Read replicas pueden utilizarse para:

```text
non-critical reads
```

si consistencia lo permite.

---

## 661. WRITE SCALING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

WRITE SCALING

Financial writes deben permanecer en:

```text
authoritative writer
```

---

## 662. PARTITIONING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PARTITIONING

Partitioning puede considerarse para:

```text
large execution history
audit data
events
```

---

## 663. PARTITION KEY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PARTITION KEY

Tenant + time puede ser candidato según workload.

---

## 664. PARTITIONING DECISION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PARTITIONING DECISION

No introducir partitioning sin:

```text
measured need
```

---

## 665. MULTI-TENANT PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

MULTI-TENANT PERFORMANCE

Medir por:

```text
tenant
workload
```

sin exponer información entre tenants.

---

## 666. NOISY NEIGHBOR

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

NOISY NEIGHBOR

Mitigaciones:

```text
quota
rate limit
queue isolation
worker pools
```

---

## 667. TENANT PRIORITY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

TENANT PRIORITY

Si el negocio lo requiere:

```text
priority classes
```

pueden utilizarse.

---

## 668. FAIRNESS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

FAIRNESS

Scheduler debe evitar:

```text
starvation
```

---

## 669. BACKPRESSURE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

BACKPRESSURE

Sistema debe rechazar o retrasar trabajo antes de entrar en:

```text
resource exhaustion
```

---

## 670. LOAD SHEDDING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

LOAD SHEDDING

En saturación:

```text
non-critical work
```

puede rechazarse primero.

---

## 671. CRITICAL WORK

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CRITICAL WORK

Liquidation-critical executions deben tener:

```text
priority
```

definida por negocio.

---

## 672. MEMORY MANAGEMENT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

MEMORY MANAGEMENT

Monitorear:

```text
heap
RSS
GC
allocation rate
```

---

## 673. MEMORY LIMITS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

MEMORY LIMITS

Runtime debe tener:

```text
execution memory policy
```

cuando sea necesario.

---

## 674. MEMORY LEAK TEST

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

MEMORY LEAK TEST

Soak tests deben detectar:

```text
growth over time
```

---

## 675. CPU PROFILING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CPU PROFILING

Utilizar profiling para encontrar:

```text
hotspots
```

---

## 676. DATABASE PROFILING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DATABASE PROFILING

Utilizar:

```text
EXPLAIN
EXPLAIN ANALYZE
query statistics
```

con cuidado en producción.

---

## 677. SLOW QUERY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SLOW QUERY

Definir threshold:

```text
slow query
```

---

## 678. SLOW PROVIDER

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SLOW PROVIDER

Definir threshold:

```text
slow provider
```

---

## 679. SLOW EXECUTION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SLOW EXECUTION

Definir threshold:

```text
slow AEL execution
```

---

## 680. PERFORMANCE OBSERVABILITY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE OBSERVABILITY

Metrics mínimas:

```text
latency
throughput
error rate
CPU
memory
DB connections
queue depth
```

---

## 681. PERCENTILES

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERCENTILES

Dashboards deben mostrar:

```text
p50
p95
p99
```

---

## 682. PERFORMANCE REGRESSION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE REGRESSION

CI debe detectar cambios relevantes en:

```text
compile
verify
runtime
```

---

## 683. BENCHMARK CI

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

BENCHMARK CI

Benchmarks críticos pueden ejecutarse:

```text
per PR
nightly
release
```

según coste.

---

## 684. BASELINE STORAGE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

BASELINE STORAGE

Conservar:

```text
benchmark baseline
```

por versión.

---

## 685. PERFORMANCE BUDGET FAILURE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE BUDGET FAILURE

Si regresión supera threshold:

```text
review required
```

---

## 686. PROFILE BEFORE OPTIMIZE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROFILE BEFORE OPTIMIZE

Proceso:

```text
Measure
→ Profile
→ Optimize
→ Benchmark
→ Verify semantics
```

---

## 687. OPTIMIZATION SAFETY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

OPTIMIZATION SAFETY

Toda optimización debe pasar:

```text
conformance tests
security tests
regression tests
```

---

## 688. COMPILER CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COMPILER CACHE

Puede cachearse:

```text
SourceHash
+
CompilerVersion
+
RegistrySnapshotHash
+
CompilerOptionsHash
```

→ Artifact.

---

## 689. COMPILER CACHE INVALIDATION

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COMPILER CACHE INVALIDATION

Invalidar cuando cambie cualquiera de:

```text
Source
Compiler
Registry Snapshot
Options
```

---

## 690. VERIFIER CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

VERIFIER CACHE

Puede cachear:

```text
artifactHash
→ verification result
```

---

## 691. VERIFIER CACHE SECURITY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

VERIFIER CACHE SECURITY

Revocation/policy changes pueden invalidar el resultado.

---

## 692. PROVIDER RESULT CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PROVIDER RESULT CACHE

Sólo cuando Contract defina:

```text
deterministic/cacheable
```

---

## 693. DISTRIBUTED LOCK

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DISTRIBUTED LOCK

Evitar locks distribuidos innecesarios.

---

## 694. LOCK SERVICE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

LOCK SERVICE

Si se requiere coordinación:

```text
dedicated coordination mechanism
```

---

## 695. SINGLEFLIGHT

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SINGLEFLIGHT

Para requests idénticos simultáneos puede utilizarse:

```text
singleflight
```

cuando sea seguro.

---

## 696. THUNDERING HERD

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

THUNDERING HERD

Evitar mediante:

```text
cache
jitter
singleflight
backoff
```

---

## 697. RETRY BACKOFF

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RETRY BACKOFF

Usar:

```text
exponential backoff
jitter
```

para errores transient.

---

## 698. RETRY BUDGET

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

RETRY BUDGET

Limitar retries para evitar:

```text
retry storm
```

---

## 699. CIRCUIT + RETRY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CIRCUIT + RETRY

No combinar indiscriminadamente:

```text
aggressive retry
+
circuit breaker
```

sin pruebas.

---

## 700. STARTUP PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

STARTUP PERFORMANCE

Runtime debe cargar:

```text
minimum required state
```

---

## 701. ARTIFACT WARMING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

ARTIFACT WARMING

Preload puede utilizarse para:

```text
high-frequency Artifacts
```

---

## 702. WARM CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

WARM CACHE

Debe invalidarse ante:

```text
revocation
```

---

## 703. COLD START

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COLD START

Medir:

```text
cold start
warm start
```

---

## 704. SERVERLESS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SERVERLESS

Serverless puede utilizarse para componentes adecuados, pero debe evaluarse:

```text
cold start
timeouts
connection management
```

---

## 705. WORKER MODEL

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

WORKER MODEL

Para executions largas:

```text
persistent workers
```

pueden reducir cold starts.

---

## 706. CAPACITY MODEL

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CAPACITY MODEL

Capacidad debe estimarse:

```text
expected load
peak load
failure load
```

---

## 707. PEAK LOAD

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PEAK LOAD

Considerar:

```text
month-end
billing cycles
mass liquidation
```

---

## 708. FAILURE LOAD

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

FAILURE LOAD

Considerar:

```text
provider degraded
database slow
worker loss
```

---

## 709. HEADROOM

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

HEADROOM

Production debe mantener:

```text
capacity headroom
```

---

## 710. AUTOSCALING TARGET

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

AUTOSCALING TARGET

Autoscaling no debe esperar:

```text
full saturation
```

---

## 711. SCALE DOWN

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SCALE DOWN

Scale down debe evitar:

```text
oscillation
```

---

## 712. COOL DOWN

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

COOL DOWN

Configurar:

```text
scale-up
scale-down cooldown
```

---

## 713. PERFORMANCE SLO

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE SLO

Ejemplos:

```text
p95 execution latency
p99 API latency
compile latency
```

Los valores exactos deben definirse mediante benchmark real de V1.

---

## 714. NO INVENTED TARGETS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

NO INVENTED TARGETS

No establecer números arbitrarios como requisitos finales sin:

```text
workload baseline
```

---

## 715. FINANCIAL CORRECTNESS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

FINANCIAL CORRECTNESS

Optimización nunca debe cambiar:

```text
amount
rounding
tax
discount
```

---

## 716. CONCURRENCY CORRECTNESS

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CONCURRENCY CORRECTNESS

Concurrent executions deben producir resultados correctos e independientes.

---

## 717. DETERMINISTIC PERFORMANCE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

DETERMINISTIC PERFORMANCE

Mismo workload bajo condiciones controladas debe producir resultados equivalentes aunque:

```text
execution order
```

cambie, cuando semantics lo permitan.

---

## 718. LOAD TESTING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

LOAD TESTING

Escenarios:

```text
normal
peak
burst
degraded dependency
```

---

## 719. STRESS TESTING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

STRESS TESTING

Incrementar carga hasta encontrar:

```text
breaking point
```

---

## 720. SOAK TESTING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

SOAK TESTING

Ejecutar durante tiempo prolongado.

---

## 721. CHAOS TESTING

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CHAOS TESTING

Puede simular:

```text
worker loss
provider timeout
database latency
network failure
```

---

## 722. CHAOS SAFETY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

CHAOS SAFETY

Nunca realizar chaos tests destructivos directamente sobre production sin proceso formal.

---

## 723. PERFORMANCE SECURITY

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE SECURITY

Rate limits y quotas deben probarse bajo carga.

---

## 724. TENANT ISOLATION UNDER LOAD

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

TENANT ISOLATION UNDER LOAD

Probar RLS e isolation:

```text
normal load
high load
concurrent load
```

---

## 725. PERFORMANCE EXIT CRITERIA

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PERFORMANCE EXIT CRITERIA

```text
✓ Latency model
✓ Throughput model
✓ Concurrency
✓ Compiler benchmarks
✓ Verifier benchmarks
✓ Runtime benchmarks
✓ Profiling
✓ Artifact cache
✓ Registry cache
✓ Provider cache policy
✓ DB pooling
✓ Query optimization
✓ RLS performance
✓ Queue backpressure
✓ Provider limits
✓ Circuit breaker
✓ Retry policy
✓ Horizontal scaling
✓ Noisy-neighbor controls
✓ Memory limits
✓ Performance regression
✓ Load tests
✓ Stress tests
✓ Soak tests
✓ Capacity planning
✓ Peak-load model
✓ Financial correctness
✓ Performance observability
```

---

## 726. FINAL PERFORMANCE ARCHITECTURE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

FINAL PERFORMANCE ARCHITECTURE

```text
                     Incoming Work
                           │
                    Rate Limit / Quota
                           │
                           ▼
                       Scheduler
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
         Compiler       Runtime       Async Queue
             │             │              │
             ▼             ▼              ▼
        Artifact Cache   Execution      Workers
                           │              │
                           └──────┬───────┘
                                  ▼
                              Providers
                                  │
                                  ▼
                              PostgreSQL
                                  │
                                  ▼
                           Observability
```

---

## 727. PRINCIPIO DE ESCALABILIDAD

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PRINCIPIO DE ESCALABILIDAD

```text
Scale horizontally
before increasing complexity vertically
```

cuando el workload lo permita.

---

## 728. PRINCIPIO DE BACKPRESSURE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PRINCIPIO DE BACKPRESSURE

```text
Protect the system
before saturation becomes failure
```

---

## 729. PRINCIPIO DE CACHE

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PRINCIPIO DE CACHE

```text
Cache only what is semantically safe to cache.
```

---

## 730. PRINCIPIO DE MEDICIÓN

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PRINCIPIO DE MEDICIÓN

```text
No benchmark
→ no performance claim
```

---

## 731. PRINCIPIO DE CORRECCIÓN

> **Origen:** Motor de liquidacion_Performance & Scalability Architecture 49.md

PRINCIPIO DE CORRECCIÓN

```text
Performance
≠
Correctness
```

y:

```text
Correctness
always wins
```

---
