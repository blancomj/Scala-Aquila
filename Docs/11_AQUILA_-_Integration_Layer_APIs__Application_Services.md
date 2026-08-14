# AEL V1 — AQUILA — Integration Layer, APIs & Application Services

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
11 — Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md
13 — Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md
20 — Motor de liquidacion_AEL_V1_API_Application_Services 20.md
29 — Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md
40 — Motor de liquidacion_Integration Layer & Provider Architecture 40.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

OBJETIVO

Definir cómo AEL se integra con:

```text
Nuxt 3 / Vue 3
Nuxt UI
Pinia
Supabase
PostgreSQL
RLS
Edge Functions
Storage
Authentication
```

sin romper las fronteras arquitectónicas establecidas en los documentos anteriores.

---

## 2. PRINCIPIO DE RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PRINCIPIO DE RESPONSABILIDAD

AQUILA controla:

```text
usuarios
tenants
autenticación
autorización
datos
persistencia
UI
workflow
auditoría
```

AEL controla:

```text
lenguaje
compilación
análisis
Artifact
ejecución
tipos
operaciones
Contracts
Functions
Capabilities
```

---

## 3. ARQUITECTURA GENERAL

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ARQUITECTURA GENERAL

```text
                    AQUILA UI
                 Nuxt / Vue / UI
                        │
                        ▼
                AQUILA APPLICATION
                        │
              ┌─────────┴─────────┐
              ▼                   ▼
        Rule Management       Business Services
              │                   │
              ▼                   ▼
          AEL Compiler       Domain Services
              │                   │
              ▼                   │
           Artifact               │
              │                   │
              └─────────┬─────────┘
                        ▼
                   AEL Runtime
                        │
                        ▼
                    Providers
                        │
                        ▼
                 Supabase / DB
                        │
                        ▼
                    PostgreSQL
                        │
                        ▼
                       RLS
```

---

## 4. REGLA FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

REGLA FUNDAMENTAL

La UI nunca debe ejecutar AEL directamente.

Flujo:

```text
Browser
 ↓
AQUILA API / Edge Function
 ↓
AEL Service
 ↓
Runtime
```

---

## 5. NO EJECUTAR EN EL CLIENTE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

NO EJECUTAR EN EL CLIENTE

No utilizar:

```text
Browser → AEL Runtime
```

para reglas de producción.

El cliente podría manipular:

```text
Source
Context
Capabilities
```

y por tanto no puede considerarse una frontera de seguridad.

---

## 6. FRONTEND

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

FRONTEND

Nuxt/Vue es responsable de:

```text
editor
builder
validation UI
test UI
simulation UI
version UI
publication UI
```

No es responsable de:

```text
authorization final
tenant isolation
Artifact verification
production execution
```

---

## 7. PINIA

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PINIA

Pinia puede gestionar:

```text
draft state
editor state
test state
UI state
```

No debe convertirse en fuente de verdad para:

```text
tenant authorization
capabilities
production Artifact
```

---

## 8. SUPABASE AUTH

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SUPABASE AUTH

Authentication proporciona la identidad.

Conceptualmente:

```text
User
 ↓
Session
 ↓
Authenticated request
 ↓
AQUILA backend
```

---

## 9. TENANT CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TENANT CONTEXT

El tenant efectivo debe derivarse de la sesión/autorización del usuario.

No confiar en:

```text
tenantId enviado por el navegador
```

sin validación.

---

## 10. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RLS

PostgreSQL RLS constituye una defensa de última línea.

Arquitectura:

```text
AEL
 ↓
Provider
 ↓
Repository
 ↓
PostgreSQL
 ↓
RLS
```

---

## 11. EDGE FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EDGE FUNCTIONS

Las Edge Functions pueden actuar como:

```text
API boundary
orchestration
authorization boundary
AEL service entry point
```

según la operación.

---

## 12. COMPILACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

COMPILACIÓN

Flujo:

```text
Nuxt Editor
   ↓
Save Draft
   ↓
AQUILA API
   ↓
AEL Compiler
   ↓
Diagnostics
   ↓
Artifact
```

---

## 13. COMPILACIÓN NO ES EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

COMPILACIÓN NO ES EJECUCIÓN

Validar una regla no implica ejecutarla.

```text
Compile
≠
Execute
```

---

## 14. DRAFT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DRAFT STORAGE

El Source de una regla en estado:

```text
DRAFT
```

puede almacenarse en PostgreSQL.

Ejemplo conceptual:

```text
rules
rule_versions
```

La estructura definitiva de tablas se definirá en el documento de persistencia.

---

## 15. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ARTIFACT STORAGE

El Artifact puede almacenarse:

```text
PostgreSQL
```

si su tamaño y consultas lo justifican, o:

```text
Supabase Storage
```

cuando corresponda.

La metadata debe permanecer accesible desde PostgreSQL.

---

## 16. SOURCE VS ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SOURCE VS ARTIFACT

Separar:

```text
Source
Artifact
Metadata
```

No mezclar todo en un único campo sin necesidad.

---

## 17. RULE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RULE VERSION

Conceptualmente:

```text
Rule
 └── RuleVersion
       ├── Source
       ├── Artifact
       ├── Dependencies
       ├── Capabilities
       ├── Tests
       └── PublicationMetadata
```

---

## 18. INMUTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

INMUTABILIDAD

Una:

```text
Published RuleVersion
```

es inmutable.

Cambios producen:

```text
nuevo RuleVersion
```

---

## 19. RULE LIFECYCLE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RULE LIFECYCLE

```text
DRAFT
 ↓
VALIDATED
 ↓
TESTING
 ↓
APPROVED
 ↓
PUBLISHED
 ↓
DEPRECATED
 ↓
ARCHIVED
```

No todos los estados necesitan ser obligatorios para reglas simples.

---

## 20. AEL SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

AEL SERVICE

AQUILA debe tener un servicio lógico:

```text
AEL Service
```

responsable de:

```text
compile
validate
test
simulate
execute
inspect
verify
```

---

## 21. AEL SERVICE NO ES UNA TABLA

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

AEL SERVICE NO ES UNA TABLA

Es una frontera de aplicación.

Puede implementarse mediante:

```text
Edge Function
backend service
worker
```

según la infraestructura final.

---

## 22. RULE MANAGEMENT SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RULE MANAGEMENT SERVICE

Separar:

```text
Rule Management
```

de:

```text
AEL Runtime
```

Rule Management controla:

```text
CRUD de drafts
versionado
workflow
publication
audit
```

---

## 23. RUNTIME SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RUNTIME SERVICE

El Runtime controla:

```text
execution
limits
context
contracts
providers
functions
```

---

## 24. FLUJO DE PUBLICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

FLUJO DE PUBLICACIÓN

```text
Draft
 ↓
Compile
 ↓
Analyze
 ↓
Generate Artifact
 ↓
Verify
 ↓
Run Mandatory Tests
 ↓
Security Review
 ↓
Approval
 ↓
Publish
```

---

## 25. PUBLICATION TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PUBLICATION TRANSACTION

La publicación debe ser atómica desde el punto de vista lógico.

No permitir:

```text
RuleVersion = PUBLISHED
```

sin Artifact válido.

---

## 26. PUBLISHED RULE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PUBLISHED RULE

Debe existir relación inequívoca:

```text
RuleVersion
→ Artifact
```

---

## 27. EXECUTION REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXECUTION REQUEST

Conceptualmente:

```json
{
  "ruleVersionId": "...",
  "context": {
    "propertyId": "...",
    "periodId": "..."
  }
}
```

Pero el backend debe derivar:

```text
tenantId
actor
capabilities
```

de la sesión y política.

---

## 28. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXECUTION CONTEXT

El Runtime recibe:

```text
tenantId
actorId
ruleId
ruleVersionId
propertyId
periodId
executionId
clock
capabilities
limits
```

según el caso.

---

## 29. CONTEXT CONSTRUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

CONTEXT CONSTRUCTION

No permitir que el Source construya el contexto.

El backend construye:

```text
Authenticated Context
```

y lo entrega al Runtime.

---

## 30. PROPERTY CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PROPERTY CONTEXT

Cuando una regla necesita una propiedad:

```text
propertyId
```

debe ser validado contra:

```text
tenant
authorization
existence
status
```

antes de ejecutar.

---

## 31. PERIOD CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PERIOD CONTEXT

Igual para:

```text
periodId
```

Debe pertenecer al ámbito autorizado.

---

## 32. PROVIDER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PROVIDER CONTEXT

Los Providers reciben sólo el contexto necesario.

No entregar el objeto completo de sesión.

---

## 33. CONTRACT RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

CONTRACT RESOLUTION

Ejemplo:

```ael
PROPERTY.AREA_PRIVATE
```

flujo:

```text
AEL Runtime
 ↓
Contract Resolver
 ↓
PROPERTY.AREA_PRIVATE@1
 ↓
Provider
 ↓
Repository
 ↓
PostgreSQL
 ↓
RLS
```

---

## 34. PARAMETER RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PARAMETER RESOLUTION

```ael
PARAMETER.TARIFA_M2
```

flujo:

```text
Contract
 ↓
Parameter Provider
 ↓
Parameter Repository
 ↓
Tenant-scoped query
 ↓
PostgreSQL
```

---

## 35. NO DIRECT SQL

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

NO DIRECT SQL

AEL nunca produce:

```sql
SELECT ...
```

Los Providers son responsables de acceso a datos.

---

## 36. NO DIRECT SUPABASE CLIENT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

NO DIRECT SUPABASE CLIENT

El Runtime no debe ejecutar:

```text
supabase.from(...)
```

directamente.

Debe pasar por:

```text
Provider Interface
```

---

## 37. REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

REPOSITORY

Puede existir una capa:

```text
Provider
 ↓
Repository
 ↓
Database
```

para separar:

```text
semántica de Contract
```

de:

```text
persistencia
```

---

## 38. PROVIDER REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PROVIDER REGISTRY

El deployment registra:

```text
Contract
→ Provider
```

No el usuario.

---

## 39. FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

FUNCTIONS

Las Functions de AEL pueden implementarse como:

```text
pure functions
```

preferentemente.

---

## 40. PURE FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PURE FUNCTION

Una Function ideal:

```text
input
 ↓
deterministic computation
 ↓
output
```

sin:

```text
database
network
filesystem
```

---

## 41. DOMAIN FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DOMAIN FUNCTIONS

Cuando una Function necesita conocimiento del dominio, debe declararlo mediante Contracts o interfaces controladas.

No acceder directamente a la base.

---

## 42. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXAMPLE

No:

```text
CALCULAR_DEUDA()
→ consulta tablas
```

Preferir:

```text
deuda =
    PARAMETER.X
    +
    PARAMETER.Y
```

o un Contract explícito:

```text
OWNER.OUTSTANDING_BALANCE
```

---

## 43. EDGE FUNCTION ROLE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EDGE FUNCTION ROLE

Una Edge Function puede:

```text
authenticate
authorize
load RuleVersion
build Context
invoke AEL
return result
```

---

## 44. EDGE FUNCTION NO DEBE CONTENER EL LENGUAJE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EDGE FUNCTION NO DEBE CONTENER EL LENGUAJE

El lenguaje debe estar encapsulado en un módulo/servicio:

```text
AEL Engine
```

para permitir reutilización.

---

## 45. WORKER

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

WORKER

Para ejecuciones costosas puede existir:

```text
AEL Worker
```

separado del request HTTP.

---

## 46. SYNCHRONOUS EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SYNCHRONOUS EXECUTION

Para reglas rápidas:

```text
HTTP
 ↓
AEL
 ↓
Result
```

---

## 47. ASYNCHRONOUS EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ASYNCHRONOUS EXECUTION

Para reglas costosas:

```text
Request
 ↓
Execution Job
 ↓
Queue
 ↓
AEL Worker
 ↓
Execution Result
```

---

## 48. EXECUTION JOB

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXECUTION JOB

Conceptualmente:

```text
executionId
ruleVersionId
tenantId
status
createdAt
startedAt
finishedAt
result
error
```

---

## 49. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

IDEMPOTENCY

Si una misma solicitud puede repetirse:

```text
idempotencyKey
```

puede evitar ejecuciones duplicadas cuando el caso de uso lo requiera.

---

## 50. EXECUTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXECUTION RESULT

Debe separar:

```text
business result
```

de:

```text
execution metadata
```

Ejemplo:

```text
result:
542250 COP

metadata:
executionId
duration
ruleVersion
artifactHash
```

---

## 51. RESULT PERSISTENCE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RESULT PERSISTENCE

No todas las ejecuciones necesitan persistirse.

La política puede definir:

```text
transient
audited
historical
```

---

## 52. AUDIT EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

AUDIT EXECUTION

Las reglas críticas pueden conservar:

```text
executionId
ruleVersion
artifactHash
inputs reference
result
status
```

sin necesariamente almacenar todos los datos de negocio.

---

## 53. SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SNAPSHOT

Para reproducción histórica:

```text
Execution
 ↓
Snapshot
 ↓
Artifact
 ↓
Runtime
```

---

## 54. SNAPSHOT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SNAPSHOT STORAGE

Los snapshots deben ser:

```text
versioned
immutable
tenant-scoped
auditable
```

---

## 55. PRODUCTION PROVIDER VS SNAPSHOT PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PRODUCTION PROVIDER VS SNAPSHOT PROVIDER

```text
AEL Runtime
      │
      ▼
Contract
      │
 ┌────┴────┐
 ▼         ▼
Production Snapshot
Provider   Provider
```

El Artifact permanece igual.

---

## 56. TEST PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TEST PROVIDER

Para pruebas:

```text
FakeProvider
```

permite:

```text
deterministic test values
```

---

## 57. DEPENDENCY INJECTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DEPENDENCY INJECTION

El Runtime debe recibir:

```text
ProviderRegistry
FunctionRegistry
ContractRegistry
SecurityPolicy
```

desde infraestructura.

No construirlos dinámicamente desde Source.

---

## 58. SECURITY POLICY INJECTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SECURITY POLICY INJECTION

La política puede determinar:

```text
maxInstructions
maxExecutionTime
maxProviderCalls
allowedCapabilities
```

---

## 59. TENANT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TENANT POLICY

Las reglas de tenant deben ejecutarse con:

```text
tenant-scoped providers
```

y no con Providers globales sin aislamiento.

---

## 60. GLOBAL CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

GLOBAL CONTRACTS

Puede haber Contracts:

```text
GLOBAL
```

como:

```text
UNIT.M2
CURRENCY.COP
```

pero deben diferenciarse de:

```text
TENANT
```

datos de negocio.

---

## 61. GLOBAL VS TENANT DATA

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

GLOBAL VS TENANT DATA

Ejemplo:

```text
UNIT.M2
→ GLOBAL

PARAMETER.TARIFA_M2
→ TENANT
```

---

## 62. SYSTEM PARAMETERS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SYSTEM PARAMETERS

Algunos parámetros pueden ser:

```text
GLOBAL
```

pero su acceso debe continuar controlado mediante Contracts y capabilities.

---

## 63. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

CACHE

Puede existir:

```text
Contract Result Cache
```

pero el key debe considerar:

```text
tenant
context
contract
version
```

cuando corresponda.

---

## 64. TENANT CACHE ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TENANT CACHE ISOLATION

Nunca compartir:

```text
tenant A cache
```

con:

```text
tenant B
```

sin una clave explícita y segura.

---

## 65. INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

INVALIDATION

Los cambios en parámetros deben invalidar los caches correspondientes.

La estrategia depende del tipo de Contract.

---

## 66. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

OBSERVABILITY

AQUILA debe poder observar:

```text
compile duration
execution duration
provider duration
provider errors
rule failures
```

---

## 67. CORRELATION ID

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

CORRELATION ID

Las operaciones deben utilizar:

```text
correlationId
```

para relacionar:

```text
HTTP
Edge Function
AEL
Provider
Database
```

---

## 68. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXECUTION ID

Cada ejecución de regla debe tener:

```text
executionId
```

único.

---

## 69. LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

LOGGING

No registrar automáticamente:

```text
Source completo
datos sensibles
secrets
```

---

## 70. METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

METRICS

Métricas recomendadas:

```text
ael_compile_total
ael_execution_total
ael_execution_duration
ael_provider_calls
ael_provider_errors
ael_capability_denied
ael_artifact_verification_failed
```

---

## 71. ERROR MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ERROR MAPPING

Los errores internos de AEL deben mapearse a errores de API.

Ejemplo:

```text
AEL-CAPABILITY-001
```

puede convertirse en:

```text
403 Forbidden
```

según el contexto.

---

## 72. NO LEAKING

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

NO LEAKING

No devolver al frontend:

```text
SQL
stack traces
database host
provider internals
```

---

## 73. API CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

API CONTRACT

La API debe devolver una estructura consistente:

```text
success
data
error
metadata
```

---

## 74. VALIDATION API

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

VALIDATION API

Ejemplo conceptual:

```text
POST /rules/{id}/validate
```

Resultado:

```text
diagnostics
artifact metadata
dependencies
capabilities
```

La ruta exacta queda sujeta al diseño final de API de AQUILA.

---

## 75. TEST API

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TEST API

Conceptualmente:

```text
POST /rules/{id}/test
```

Debe ejecutar:

```text
sandboxed test
```

no producción.

---

## 76. SIMULATION API

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SIMULATION API

Conceptualmente:

```text
POST /rules/{id}/simulate
```

Debe utilizar:

```text
snapshot/mock context
```

---

## 77. EXECUTION API

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EXECUTION API

Conceptualmente:

```text
POST /rules/{id}/execute
```

Debe:

```text
authorize
load published version
verify
build context
execute
return result
```

---

## 78. PUBLISH API

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PUBLISH API

Conceptualmente:

```text
POST /rules/{id}/publish
```

Debe verificar nuevamente el estado y las políticas.

---

## 79. NO TRUST CLIENT ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

NO TRUST CLIENT ARTIFACT

Si el frontend envía un Artifact:

```text
no ejecutarlo directamente
```

Debe verificarse y compararse con la versión autorizada.

---

## 80. SERVER-SIDE SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SERVER-SIDE SOURCE

La compilación oficial debe ejecutarse en infraestructura controlada.

El frontend puede ofrecer validación rápida local como UX futura, pero no sustituye la validación del servidor.

---

## 81. CLIENT-SIDE COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

CLIENT-SIDE COMPILER

Podría existir:

```text
AEL Compiler WASM
```

en el futuro para diagnostics inmediatos.

Pero:

```text
server compiler
```

sigue siendo autoridad.

---

## 82. SERVER AUTHORITY

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SERVER AUTHORITY

La regla válida para publicación es la que fue:

```text
compiled
verified
approved
```

por el backend.

---

## 83. RULE EXECUTION AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RULE EXECUTION AUTHORIZATION

Antes de ejecutar:

```text
¿usuario puede ejecutar esta RuleVersion?
```

Debe comprobarse.

No basta con:

```text
RuleVersion = PUBLISHED
```

---

## 84. TENANT RULE OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TENANT RULE OWNERSHIP

Una regla tenant-scoped debe pertenecer al tenant correspondiente.

---

## 85. GLOBAL RULES

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

GLOBAL RULES

Las reglas globales pueden existir si AQUILA las necesita.

Su ejecución debe continuar siendo autorizada.

---

## 86. RULE SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RULE SCOPE

Metadata:

```text
GLOBAL
TENANT
```

según modelo definitivo.

---

## 87. MULTITENANT INVARIANT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

MULTITENANT INVARIANT

Nunca debe existir:

```text
Rule A
→ Tenant B data
```

por el simple hecho de que el usuario conoce un ID.

---

## 88. RLS INTEGRATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

RLS INTEGRATION TEST

Obligatorio:

```text
Tenant A session
 ↓
AEL Rule
 ↓
Provider
 ↓
Postgres
```

debe demostrar que sólo se obtienen datos A.

---

## 89. BACKEND SERVICE ACCOUNT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

BACKEND SERVICE ACCOUNT

Si una Edge Function utiliza credenciales privilegiadas, debe existir una capa explícita que mantenga:

```text
tenant authorization
```

antes de ejecutar Providers.

No usar privilegios elevados como sustituto de autorización.

---

## 90. SERVICE ROLE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SERVICE ROLE

El uso de credenciales de alto privilegio debe quedar encapsulado.

Nunca exponerlas al:

```text
Browser
AEL Source
Artifact
```

---

## 91. STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

STORAGE

Si Artifacts se almacenan en Storage:

```text
bucket
```

debe tener políticas apropiadas.

El cliente no debe poder reemplazar arbitrariamente un Artifact publicado.

---

## 92. ARTIFACT DOWNLOAD

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ARTIFACT DOWNLOAD

Descargar un Artifact debe ser una operación autorizada.

---

## 93. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ARTIFACT CACHE

Si existe CDN/cache, la clave debe incorporar:

```text
artifactHash
```

para evitar servir versiones incorrectas.

---

## 94. DEPLOYMENT

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DEPLOYMENT

La implementación puede separar:

```text
AQUILA Web
AQUILA API
AEL Compiler
AEL Runtime
AEL Worker
PostgreSQL
```

aunque inicialmente algunos componentes puedan vivir en el mismo deployment.

---

## 95. EVOLUTION PATH

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EVOLUTION PATH

Arquitectura inicial:

```text
AQUILA API
   │
   ├── Rule Management
   └── AEL Runtime
```

Evolución:

```text
AQUILA API
   │
   └── AEL Service
          │
          ├── Compiler
          ├── Runtime
          └── Worker
```

---

## 96. NO MICROSERVICES PREMATUROS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

NO MICROSERVICES PREMATUROS

No separar AEL en múltiples microservicios sólo por razones estéticas.

Separar cuando exista:

```text
escala
aislamiento
deployment
seguridad
```

que lo justifique.

---

## 97. MODULAR MONOLITH

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

MODULAR MONOLITH

La recomendación inicial es:

```text
AQUILA modular monolith
```

con:

```text
AEL module
```

bien aislado.

---

## 98. INTERNAL MODULES

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

INTERNAL MODULES

Conceptualmente:

```text
modules/
├── rules/
├── ael/
│   ├── lexer/
│   ├── parser/
│   ├── analyzer/
│   ├── compiler/
│   ├── runtime/
│   ├── contracts/
│   ├── functions/
│   └── security/
├── billing/
├── properties/
└── owners/
```

La estructura final de repositorio puede variar.

---

## 99. DEPENDENCY DIRECTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DEPENDENCY DIRECTION

AEL no debe depender de:

```text
UI
billing implementation
database tables
Supabase client
```

La dirección recomendada:

```text
UI
 ↓
Application
 ↓
AEL
 ↓
Interfaces
 ↑
Infrastructure
```

---

## 100. HEXAGONAL PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

HEXAGONAL PRINCIPLE

AEL debe aproximarse a una arquitectura:

```text
Core
 ├── Compiler
 ├── Runtime
 ├── Types
 └── Semantics

Ports
 ├── ContractProvider
 ├── FunctionRegistry
 └── SecurityPolicy

Adapters
 ├── PostgreSQL
 ├── Snapshot
 ├── Fake
 └── AQUILA infrastructure
```

---

## 101. BENEFICIO

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

BENEFICIO

Esto permite probar AEL sin depender de:

```text
Supabase
PostgreSQL
HTTP
```

para cada test.

---

## 102. TESTING INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

TESTING INTEGRATION

La suite debe tener:

```text
AEL unit
AEL integration
AQUILA integration
AQUILA E2E
```

---

## 103. E2E CANÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

E2E CANÓNICO

Flujo:

```text
Login
 ↓
Tenant
 ↓
Create Rule
 ↓
Edit Source
 ↓
Validate
 ↓
Create Tests
 ↓
Run Tests
 ↓
Approve
 ↓
Publish
 ↓
Execute
 ↓
Verify Result
```

---

## 104. BUSINESS E2E

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

BUSINESS E2E

Caso:

```text
Cuota administrativa
```

Datos:

```text
Area privada = 120.50 M2
Tarifa = 4500 COP/M2
```

Resultado:

```text
542250 COP
```

Debe recorrerse desde UI hasta PostgreSQL.

---

## 105. AUDIT E2E

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

AUDIT E2E

Verificar que la publicación genere:

```text
audit event
```

y que la ejecución crítica genere:

```text
execution audit
```

según política.

---

## 106. FAILURE E2E

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

FAILURE E2E

Simular:

```text
Provider timeout
```

La UI debe mostrar:

```text
ejecución fallida
```

sin revelar infraestructura.

---

## 107. SECURITY E2E

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SECURITY E2E

Intentar:

```text
Tenant A user
→ Rule A
→ Property B
```

Debe ser rechazado.

---

## 108. ARCHITECTURAL INVARIANTS

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

ARCHITECTURAL INVARIANTS

AQUILA + AEL debe mantener:

```text
I1 — Browser nunca es autoridad.
I2 — Source nunca es ejecutable directamente.
I3 — Artifact siempre se verifica.
I4 — Tenant siempre se valida.
I5 — RLS permanece activo.
I6 — Capabilities son server-side.
I7 — Published versions son inmutables.
I8 — Providers son infraestructura controlada.
I9 — AEL no accede directamente a DB.
I10 — AEL no tiene acceso arbitrario a filesystem/network/process.
```

---

## 109. DECISIÓN TECNOLÓGICA V1

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DECISIÓN TECNOLÓGICA V1

La implementación V1 debe favorecer:

```text
TypeScript
```

para Compiler/Runtime cuando resulte coherente con el stack de AQUILA.

La arquitectura no debe depender de que el Runtime sea TypeScript; el contrato semántico es lo importante.

---

## 110. EDGE VS NODE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EDGE VS NODE

Si las limitaciones del entorno Edge dificultan:

```text
runtime pesado
debugger
worker
```

se puede mover la ejecución a:

```text
Node worker/service
```

manteniendo:

```text
API boundary
```

estable.

---

## 111. SUPABASE COMO INFRAESTRUCTURA

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

SUPABASE COMO INFRAESTRUCTURA

AEL no debe convertirse en:

```text
Supabase Expression Language
```

AEL es propiedad conceptual de AQUILA y debe poder sobrevivir a cambios de infraestructura.

---

## 112. POSTGRES COMO PROVIDER IMPLEMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

POSTGRES COMO PROVIDER IMPLEMENTATION

PostgreSQL es una implementación de Providers.

No una característica del lenguaje.

---

## 113. DOMAIN LANGUAGE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

DOMAIN LANGUAGE

El vocabulario AEL debe reflejar:

```text
dominio AQUILA
```

no:

```text
tablas PostgreSQL
```

---

## 114. EJEMPLO CORRECTO

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EJEMPLO CORRECTO

```ael
PROPERTY.AREA_PRIVATE
```

---

## 115. EJEMPLO INCORRECTO

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

EJEMPLO INCORRECTO

```ael
DOCUMENTOS.AREA_FIELD_17
```

---

## 116. BUSINESS ABSTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

BUSINESS ABSTRACTION

El objetivo es que una migración:

```text
PostgreSQL
→ otro storage
```

no obligue a reescribir las reglas.

---

## 117. VERSIONADO DE INFRAESTRUCTURA

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

VERSIONADO DE INFRAESTRUCTURA

Cambiar Provider:

```text
PostgresProvider v1
→ v2
```

no debe cambiar la semántica del Contract.

Si la cambia:

```text
nuevo Contract version
```

o política explícita de compatibilidad.

---

## 118. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

FINAL ARCHITECTURE

```text
                    ┌─────────────────────┐
                    │      Nuxt / Vue     │
                    │ Rule Builder / UI   │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   AQUILA API /      │
                    │   Edge Functions    │
                    └──────────┬──────────┘
                               │
                  ┌────────────┴────────────┐
                  ▼                         ▼
        ┌──────────────────┐      ┌──────────────────┐
        │ Rule Management  │      │    AEL Engine    │
        │                  │      │                  │
        │ Drafts           │      │ Compiler         │
        │ Versions         │      │ Analyzer         │
        │ Approval         │      │ Verifier         │
        │ Publication      │      │ Runtime          │
        └────────┬─────────┘      └────────┬─────────┘
                 │                         │
                 │                         ▼
                 │                ┌──────────────────┐
                 │                │ Contracts        │
                 │                │ Functions        │
                 │                │ Capabilities     │
                 │                │ Providers        │
                 │                └────────┬─────────┘
                 │                         │
                 └────────────┬────────────┘
                              ▼
                    ┌─────────────────────┐
                    │ Supabase / Repos    │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │ PostgreSQL + RLS    │
                    └─────────────────────┘
```

---

## 119. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

CRITERIO DE CIERRE

La integración AEL + AQUILA V1 se considera definida cuando:

```text
✓ UI separada del Runtime
✓ Rule Management separado de Execution
✓ Source separado de Artifact
✓ Compiler server-side
✓ Artifact verification
✓ ExecutionContext seguro
✓ Tenant isolation
✓ RLS
✓ Providers
✓ Contracts
✓ Capabilities
✓ Snapshot execution
✓ Test execution
✓ Production execution
✓ Audit
✓ Observability
✓ Error mapping
✓ Modular architecture
```

---

## 120. PRINCIPIO ARQUITECTÓNICO DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_Integracion_AQUILA_SAAS 11.md

PRINCIPIO ARQUITECTÓNICO DEFINITIVO

AQUILA es el sistema.

AEL es su motor de reglas.

```text
AQUILA
 ├── Identity
 ├── Tenancy
 ├── Data
 ├── Workflow
 ├── UI
 ├── Audit
 │
 └── AEL
      ├── Language
      ├── Compiler
      ├── Analyzer
      ├── Artifact
      ├── Runtime
      ├── Contracts
      ├── Providers
      └── Capabilities
```

AEL no debe convertirse en una dependencia invasiva que obligue a AQUILA a adoptar su arquitectura.

Debe funcionar al contrario:

> **AEL se integra dentro de AQUILA mediante interfaces claras, mientras AQUILA conserva el control de identidad, tenancy, datos, autorización e infraestructura.**

---

# FIN DEL DOCUMENTO 11

## AEL V1 — Integración con AQUILA_SAAS

## 121. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

OBJETIVO

Definir contratos para:

```text
Rule Management
Validation
Compilation
Testing
Simulation
Execution
Publication
Inspection
Dependencies
Diagnostics
Audit
```

---

## 122. CAPAS DE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CAPAS DE API

La arquitectura debe distinguir:

```text
Browser API
Application API
AEL Engine API
Provider API
```

No deben confundirse.

---

## 123. BROWSER API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

BROWSER API

Es la interfaz utilizada por:

```text
Nuxt / Vue
```

Debe estar orientada a:

```text
casos de uso
```

no a:

```text
opcodes
stack
IR internals
```

---

## 124. APPLICATION API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

APPLICATION API

La Application API coordina:

```text
authorization
tenant
rule management
AEL Engine
audit
```

---

## 125. AEL ENGINE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

AEL ENGINE API

API interna para:

```text
compile
analyze
verify
execute
simulate
test
inspect
```

---

## 126. PROVIDER API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER API

API interna mediante la cual Runtime solicita:

```text
Contract resolution
```

No es una API pública para el navegador.

---

## 127. PRINCIPIO API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PRINCIPIO API

Nunca:

```text
Browser → Provider
```

Siempre:

```text
Browser
 ↓
Application
 ↓
AEL
 ↓
Provider
```

---

## 128. AUTENTICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

AUTENTICACIÓN

Las APIs de AQUILA deben utilizar la autenticación establecida por:

```text
Supabase Auth
```

---

## 129. AUTORIZACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

AUTORIZACIÓN

La autenticación responde:

```text
¿Quién eres?
```

La autorización:

```text
¿Qué puedes hacer?
```

AEL no reemplaza ninguna de las dos.

---

## 130. TENANT RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

TENANT RESOLUTION

El backend determina el tenant efectivo.

No confiar exclusivamente en:

```json
{
  "tenantId": "..."
}
```

enviado por el cliente.

---

## 131. REQUEST CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

REQUEST CONTEXT

Internamente:

```text
AuthenticatedRequestContext
```

puede contener:

```text
userId
tenantId
roles
permissions
correlationId
```

---

## 132. CORRELATION ID

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CORRELATION ID

Toda solicitud importante debe poder correlacionarse mediante:

```text
correlationId
```

---

## 133. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXECUTION ID

Toda ejecución AEL debe generar:

```text
executionId
```

---

## 134. API RESPONSE STANDARD

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API RESPONSE STANDARD

Formato conceptual:

```json
{
  "success": true,
  "data": {},
  "error": null,
  "metadata": {}
}
```

---

## 135. ERROR RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

ERROR RESPONSE

Formato:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AEL-DIMENSION-001",
    "message": "Las dimensiones no son compatibles.",
    "details": []
  },
  "metadata": {
    "correlationId": "..."
  }
}
```

---

## 136. ERROR CODE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

ERROR CODE

Los códigos son parte del contrato.

Ejemplo:

```text
AEL-PARSE-001
AEL-TYPE-001
AEL-DIMENSION-001
AEL-SECURITY-001
AEL-RUNTIME-001
```

---

## 137. HTTP STATUS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

HTTP STATUS

Mapeo recomendado:

```text
400 → request inválido
401 → no autenticado
403 → no autorizado
404 → recurso inexistente
409 → conflicto
422 → regla inválida
429 → límite
500 → error interno
503 → servicio no disponible
```

---

## 138. VALIDATION VS SYSTEM ERROR

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

VALIDATION VS SYSTEM ERROR

Una regla inválida:

```text
422
```

Un fallo inesperado del servidor:

```text
500
```

No mezclar ambos.

---

## 139. RULE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

RULE API

Operaciones principales:

```text
Create
Get
Update Draft
List
Archive
```

---

## 140. CREATE RULE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CREATE RULE

Request conceptual:

```json
{
  "code": "CUOTA_ADMIN",
  "name": "Cuota administrativa",
  "description": "Calcula la cuota mensual"
}
```

El tenant lo determina el backend.

---

## 141. UPDATE DRAFT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

UPDATE DRAFT

```json
{
  "source": "REGLA CUOTA_ADMIN\n..."
}
```

Debe existir control de concurrencia.

---

## 142. OPTIMISTIC CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

OPTIMISTIC CONCURRENCY

Request puede incluir:

```text
revision
```

o:

```text
updatedAt
```

Si cambió desde la última lectura:

```text
409 Conflict
```

---

## 143. GET RULE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

GET RULE

Debe devolver metadata sin necesidad de cargar siempre:

```text
Artifact completo
```

---

## 144. GET VERSION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

GET VERSION

Debe devolver:

```text
version
status
compiler
runtime
hash
dependencies
capabilities
```

según permisos.

---

## 145. VALIDATE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

VALIDATE API

Conceptualmente:

```text
POST /rules/{ruleId}/validate
```

---

## 146. VALIDATE REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

VALIDATE REQUEST

```json
{
  "source": "..."
}
```

Puede validar un Draft sin persistirlo.

---

## 147. VALIDATE RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

VALIDATE RESPONSE

```json
{
  "valid": true,
  "diagnostics": [],
  "artifact": {
    "hash": "...",
    "size": 1234
  },
  "dependencies": [],
  "capabilities": []
}
```

---

## 148. DIAGNOSTIC CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

DIAGNOSTIC CONTRACT

Cada diagnóstico debe contener:

```text
code
severity
message
line
column
start
end
```

---

## 149. DIAGNOSTIC SEVERITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

DIAGNOSTIC SEVERITY

```text
ERROR
WARNING
INFO
HINT
```

---

## 150. COMPILE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

COMPILE API

Conceptualmente:

```text
POST /rules/{ruleId}/compile
```

Debe producir un Artifact candidato.

No implica publicación.

---

## 151. COMPILE RESULT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

COMPILE RESULT

```text
artifact
artifactHash
compilerVersion
languageVersion
dependencies
capabilities
diagnostics
```

---

## 152. VERIFY API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

VERIFY API

La verificación puede ser una operación interna.

No necesita exponerse al usuario final como endpoint independiente.

---

## 153. TEST API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

TEST API

Conceptualmente:

```text
POST /rules/{ruleId}/test
```

---

## 154. TEST REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

TEST REQUEST

```json
{
  "versionId": "...",
  "tests": [
    {
      "id": "...",
      "input": {},
      "expected": {}
    }
  ]
}
```

---

## 155. TEST RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

TEST RESPONSE

```json
{
  "passed": 12,
  "failed": 0,
  "results": []
}
```

---

## 156. SIMULATION API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SIMULATION API

Conceptualmente:

```text
POST /rules/{ruleId}/simulate
```

---

## 157. SIMULATION REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SIMULATION REQUEST

```json
{
  "versionId": "...",
  "snapshotId": "...",
  "overrides": {}
}
```

---

## 158. SIMULATION GUARANTEE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SIMULATION GUARANTEE

Simulation V1:

```text
read-only
```

No modificar datos de producción.

---

## 159. EXECUTE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXECUTE API

Conceptualmente:

```text
POST /rules/{ruleId}/execute
```

Sólo puede utilizar:

```text
published RuleVersion
```

---

## 160. EXECUTE REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXECUTE REQUEST

Ejemplo:

```json
{
  "versionId": "...",
  "context": {
    "propertyId": "...",
    "periodId": "..."
  }
}
```

El backend agrega:

```text
tenant
actor
capabilities
```

---

## 161. EXECUTION RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXECUTION RESPONSE

```json
{
  "executionId": "...",
  "status": "COMPLETED",
  "result": {
    "value": 542250,
    "type": "MONEY",
    "currency": "COP"
  },
  "metadata": {
    "durationMs": 12,
    "artifactHash": "..."
  }
}
```

---

## 162. ASYNC EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

ASYNC EXECUTION

Cuando la regla exceda el perfil síncrono:

```text
POST
→ 202 Accepted
```

Respuesta:

```json
{
  "executionId": "...",
  "status": "QUEUED"
}
```

---

## 163. GET EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

GET EXECUTION

Conceptualmente:

```text
GET /executions/{executionId}
```

Debe validar:

```text
tenant
authorization
```

---

## 164. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXECUTION STATUS

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
TIMEOUT
```

---

## 165. CANCEL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CANCEL EXECUTION

Conceptualmente:

```text
POST /executions/{executionId}/cancel
```

Sólo si la ejecución admite cancelación.

---

## 166. PUBLISH API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PUBLISH API

Conceptualmente:

```text
POST /rules/{ruleId}/publish
```

---

## 167. PUBLISH REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PUBLISH REQUEST

```json
{
  "versionId": "...",
  "approvalId": "..."
}
```

La implementación exacta depende del workflow de aprobación.

---

## 168. PUBLISH VALIDATIONS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PUBLISH VALIDATIONS

Debe comprobar:

```text
version exists
source unchanged
compile valid
artifact valid
artifact verified
tests passed
security policy passed
approval valid
```

---

## 169. PUBLISH RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PUBLISH RESPONSE

```json
{
  "published": true,
  "ruleVersionId": "...",
  "artifactHash": "...",
  "publishedAt": "..."
}
```

---

## 170. DEPRECATE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

DEPRECATE API

Conceptualmente:

```text
POST /rules/{ruleId}/versions/{versionId}/deprecate
```

---

## 171. REVOKE API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

REVOKE API

Operación administrativa:

```text
POST /rules/{ruleId}/versions/{versionId}/revoke
```

Debe quedar auditada.

---

## 172. DEPENDENCY API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

DEPENDENCY API

Permitir consultar:

```text
Contracts
Functions
Capabilities
```

de una RuleVersion.

---

## 173. IMPACT API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

IMPACT API

Una operación importante:

```text
GET /contracts/{contractId}/impact
```

puede informar:

```text
Rules affected
```

---

## 174. FIND REFERENCES

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FIND REFERENCES

Similarmente:

```text
GET /functions/{functionId}/references
```

---

## 175. CONTRACT API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CONTRACT API

Contracts pueden tener endpoints administrativos:

```text
GET
CREATE
UPDATE
DEPRECATE
REVOKE
```

según permisos.

---

## 176. CONTRACT PUBLISHING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CONTRACT PUBLISHING

Un Contract no debe cambiar silenciosamente su semántica después de ser utilizado por Artifacts publicados.

---

## 177. CONTRACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CONTRACT VERSION

Cambios semánticos producen:

```text
new Contract version
```

---

## 178. FUNCTION API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FUNCTION API

Functions registradas pueden exponerse para tooling:

```text
name
signature
version
status
documentation
```

No exponer:

```text
implementation internals
```

---

## 179. BUILDER API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

BUILDER API

La UI necesita endpoints orientados a:

```text
autocomplete
hover
diagnostics
dependencies
```

---

## 180. COMPLETION API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

COMPLETION API

Puede recibir:

```json
{
  "source": "...",
  "position": {
    "line": 10,
    "column": 8
  }
}
```

y devolver:

```json
{
  "items": []
}
```

---

## 181. HOVER API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

HOVER API

Recibe:

```text
source
position
```

Devuelve:

```text
symbol
type
documentation
version
```

---

## 182. FORMAT API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FORMAT API

Conceptualmente:

```text
POST /ael/format
```

Input:

```json
{
  "source": "..."
}
```

Output:

```json
{
  "source": "formatted..."
}
```

---

## 183. LINT API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

LINT API

Puede integrarse con:

```text
validate
```

o mantenerse como operación separada.

---

## 184. INSPECT ARTIFACT API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

INSPECT ARTIFACT API

Para usuarios técnicos:

```text
POST /ael/artifacts/inspect
```

Debe devolver metadata segura.

---

## 185. NO RAW INTERNALS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

NO RAW INTERNALS

No exponer:

```text
database credentials
provider internals
security keys
runtime memory
```

---

## 186. API VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API VERSIONING

Las APIs públicas de AQUILA deben versionarse.

Ejemplo:

```text
/api/v1/...
```

---

## 187. AEL LANGUAGE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

AEL LANGUAGE VERSION

No confundir:

```text
API version
```

con:

```text
AEL language version
```

---

## 188. ARTIFACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

ARTIFACT VERSION

Tampoco confundir:

```text
Artifact format version
```

con:

```text
Rule version
```

---

## 189. VERSION MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

VERSION MATRIX

Debe ser posible conocer:

```text
API 1
AEL 1
Artifact 1
Compiler 1
Runtime 1
RuleVersion 7
```

---

## 190. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

BACKWARD COMPATIBILITY

Cambios no destructivos en API deben conservar clientes existentes cuando la política lo requiera.

---

## 191. BREAKING CHANGE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

BREAKING CHANGE

Una ruptura de contrato debe producir:

```text
new API version
```

cuando corresponda.

---

## 192. PAGINATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PAGINATION

Listados de:

```text
Rules
Executions
Audit
Tests
```

deben soportar paginación.

Preferiblemente:

```text
cursor pagination
```

para grandes volúmenes.

---

## 193. FILTERING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FILTERING

Permitir filtros:

```text
status
tenant
rule
date
version
```

según autorización.

---

## 194. SORTING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SORTING

El backend debe controlar los campos permitidos para ordenar.

No aceptar SQL arbitrario.

---

## 195. RATE LIMITING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

RATE LIMITING

Endpoints sensibles deben tener límites:

```text
compile
test
simulate
execute
```

---

## 196. EXECUTION RATE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXECUTION RATE LIMIT

Especialmente:

```text
execute
```

debe estar limitado por:

```text
user
tenant
rule
```

cuando sea necesario.

---

## 197. API IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API IDEMPOTENCY

Operaciones que puedan reintentarse deben soportar:

```text
Idempotency-Key
```

cuando el caso lo justifique.

---

## 198. TIMEOUTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

TIMEOUTS

Cada operación debe tener timeout.

Ejemplo:

```text
validate
test
simulate
execute
```

---

## 199. REQUEST SIZE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

REQUEST SIZE

Limitar:

```text
source length
test input
snapshot size
```

para evitar abuso.

---

## 200. SOURCE SIZE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SOURCE SIZE

Una regla AEL no debe tener tamaño ilimitado.

El límite debe formar parte de:

```text
SecurityPolicy
```

---

## 201. TEST SUITE SIZE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

TEST SUITE SIZE

Limitar:

```text
number of tests
input size
execution count
```

en operaciones de usuario.

---

## 202. BATCH EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

BATCH EXECUTION

Puede existir ejecución por lote:

```text
executeMany
```

pero debe utilizar:

```text
batch limits
```

y no convertirse en bypass de quotas.

---

## 203. PROVIDER API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER API

Interfaz conceptual:

```ts
resolve(contract, context): Promise<AELValue>
```

---

## 204. PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER RESULT

Debe devolver un:

```text
AELValue
```

válido.

No devolver directamente:

```text
database row
```

si no corresponde al Contract.

---

## 205. PROVIDER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER ERROR

Debe normalizarse:

```text
ProviderError
```

con:

```text
code
category
retryable
message
```

---

## 206. RETRY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

RETRY POLICY

No reintentar automáticamente todas las operaciones.

Sólo errores definidos como:

```text
retryable
```

---

## 207. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER TIMEOUT

Debe producir:

```text
AEL-PROVIDER-TIMEOUT
```

o código equivalente.

---

## 208. PROVIDER CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER CANCELLATION

El cancellation signal debe propagarse cuando sea posible.

---

## 209. PROVIDER DATA LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PROVIDER DATA LIMIT

Provider debe limitar:

```text
result size
rows
duration
```

según Contract.

---

## 210. FUNCTION API INTERNA

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FUNCTION API INTERNA

Conceptualmente:

```ts
call(functionId, args, context): AELValue
```

---

## 211. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FUNCTION REGISTRY

La Function debe resolverse mediante:

```text
FunctionId
```

no:

```text
string arbitrary code
```

---

## 212. CONTRACT RESOLUTION CACHE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CONTRACT RESOLUTION CACHE

Puede existir cache interno, siempre que respete:

```text
tenant
version
context
```

---

## 213. SECURITY ENFORCEMENT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SECURITY ENFORCEMENT

Antes de Provider:

```text
capability check
```

Antes de Function:

```text
function allowlist
```

---

## 214. APPLICATION AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

APPLICATION AUTHORIZATION

Antes de AEL:

```text
user authorization
rule authorization
```

---

## 215. DEFENSE LAYERS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

DEFENSE LAYERS

```text
Browser authorization
 ↓
API authorization
 ↓
Rule authorization
 ↓
AEL capability
 ↓
Provider authorization
 ↓
RLS
```

---

## 216. NO CLIENT CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

NO CLIENT CAPABILITIES

El cliente puede mostrar capabilities para UX.

Pero nunca puede decidir:

```text
capabilities granted
```

---

## 217. AUDIT API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

AUDIT API

Puede existir:

```text
GET /audit
```

pero sólo para usuarios autorizados.

---

## 218. AUDIT FILTER

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

AUDIT FILTER

Debe permitir:

```text
entity
actor
action
date
```

---

## 219. OBSERVABILITY API

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

OBSERVABILITY API

No exponer métricas internas sensibles directamente a usuarios normales.

---

## 220. WEBHOOKS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

WEBHOOKS

AEL V1 no requiere que una regla invoque webhooks directamente.

Si AQUILA necesita notificaciones:

```text
AEL result
 ↓
AQUILA workflow
 ↓
Notification service
```

---

## 221. NO SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

NO SIDE EFFECTS

El Runtime AEL V1 no debe ejecutar:

```text
email
SMS
HTTP
database writes
```

directamente.

---

## 222. RESULT-DRIVEN WORKFLOW

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

RESULT-DRIVEN WORKFLOW

Una regla puede devolver:

```text
decision
amount
status
```

y AQUILA decide qué hacer.

---

## 223. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EXAMPLE

```text
AEL
 ↓
542250 COP
 ↓
AQUILA Billing
 ↓
Create invoice
```

AEL no crea directamente la factura.

---

## 224. EVENT INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EVENT INTEGRATION

AQUILA puede emitir:

```text
RuleExecuted
```

después de una ejecución exitosa.

---

## 225. EVENT PAYLOAD

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EVENT PAYLOAD

Debe evitar datos excesivos.

Puede contener:

```text
executionId
ruleId
ruleVersionId
tenantId
status
```

---

## 226. EVENT IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

EVENT IDEMPOTENCY

Consumers deben poder identificar:

```text
executionId
```

para evitar procesamiento duplicado.

---

## 227. API SECURITY CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API SECURITY CHECKLIST

```text
[ ] Authentication
[ ] Authorization
[ ] Tenant resolution
[ ] Input validation
[ ] Rate limit
[ ] Timeout
[ ] Request size limit
[ ] Error sanitization
[ ] Audit
[ ] Correlation ID
```

---

## 228. API TESTING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API TESTING

Cada endpoint debe tener:

```text
happy path
unauthorized
wrong tenant
invalid input
missing resource
concurrency conflict
rate limit
timeout
```

---

## 229. CONTRACT TESTING

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CONTRACT TESTING

Los contratos API deben validarse automáticamente.

Puede utilizarse:

```text
OpenAPI
JSON Schema
```

como artefactos de contrato.

---

## 230. OPENAPI

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

OPENAPI

La Application API debe disponer de una especificación OpenAPI versionada.

---

## 231. SCHEMA FIRST

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SCHEMA FIRST

Los request/response importantes deben tener schemas explícitos.

---

## 232. NO ANY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

NO ANY

En TypeScript evitar contratos públicos basados en:

```ts
any
```

---

## 233. ERROR ENUMERATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

ERROR ENUMERATION

Los códigos conocidos deben tener tipos o catálogos compartidos.

---

## 234. FRONTEND TYPES

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FRONTEND TYPES

El frontend debe consumir tipos generados desde:

```text
OpenAPI / schemas
```

cuando sea viable.

---

## 235. INTERNAL API TYPES

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

INTERNAL API TYPES

El AEL Engine debe tener tipos internos fuertes para:

```text
AELValue
ExecutionContext
Artifact
Diagnostic
ProviderResult
```

---

## 236. API OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API OBSERVABILITY

Cada request importante debe poder relacionarse:

```text
request
→ correlationId
→ executionId
→ ruleVersion
→ artifactHash
```

---

## 237. SECURITY INCIDENT

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

SECURITY INCIDENT

Ante:

```text
artifact tampering
capability bypass
tenant violation
```

registrar un Security Event y bloquear la operación.

---

## 238. API RESILIENCE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

API RESILIENCE

El sistema debe manejar:

```text
Provider unavailable
Database unavailable
AEL worker unavailable
```

sin producir respuestas ambiguas.

---

## 239. DEGRADED MODE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

DEGRADED MODE

No ejecutar una regla con datos parciales si el Contract requerido no pudo resolverse.

Preferir:

```text
FAIL CLOSED
```

---

## 240. FAIL CLOSED

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

FAIL CLOSED

Si no puede demostrarse que:

```text
authorization
capability
tenant
artifact
```

son válidos:

```text
DENY
```

---

## 241. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

CRITERIO DE CIERRE

La integración API V1 se considera definida cuando existen contratos claros para:

```text
✓ Rule CRUD
✓ Draft update
✓ Validation
✓ Compilation
✓ Testing
✓ Simulation
✓ Execution
✓ Async execution
✓ Cancellation
✓ Publication
✓ Deprecation
✓ Revocation
✓ Dependencies
✓ Impact analysis
✓ Contracts
✓ Functions
✓ Diagnostics
✓ Audit
✓ Provider resolution
✓ Error handling
✓ Versioning
✓ Rate limits
✓ Observability
```

---

## 242. PRINCIPIO ARQUITECTÓNICO DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_API_Protocolos_Integracion 13.md

PRINCIPIO ARQUITECTÓNICO DEFINITIVO

La API no debe convertirse en una ventana directa hacia el Runtime.

Debe ser una:

```text
Business/Application Boundary
```

que protege:

```text
Identity
Tenancy
Authorization
AEL Engine
Infrastructure
```

El flujo definitivo es:

```text
                 ┌───────────────┐
                 │   Nuxt / Vue  │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │ AQUILA API    │
                 │ Auth + Tenant │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │   AEL Engine  │
                 │ Compile/Test  │
                 │ Simulate/Run  │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │   Providers   │
                 └───────┬───────┘
                         │
                         ▼
                 ┌───────────────┐
                 │ PostgreSQL    │
                 │     + RLS     │
                 └───────────────┘
```

> **AEL proporciona el motor; AQUILA proporciona el contexto, la autoridad y la infraestructura.**

---

# FIN DEL DOCUMENTO 13

## AEL V1 — API, Protocolos y Contratos de Integración

## 243. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

OBJETIVO

Definir:

```text
Application Services
Use Cases
HTTP API
DTOs
Validation
Authorization
Error mapping
Idempotency
Execution
Publication
```

---

## 244. ARQUITECTURA

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ARQUITECTURA

```text
Nuxt / Clients
      ↓
HTTP API
      ↓
Controllers
      ↓
Application Services
      ↓
Domain Ports
      ↓
AEL Core / Runtime
      ↓
Repositories / Providers
      ↓
PostgreSQL
```

---

## 245. REGLA DE DEPENDENCIAS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

REGLA DE DEPENDENCIAS

Los Controllers no deben conocer:

```text
SQL
Supabase queries
Runtime internals
Artifact byte format
```

---

## 246. APPLICATION LAYER

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

APPLICATION LAYER

Responsabilidades:

```text
orchestration
authorization
transaction boundaries
use-case validation
mapping
```

---

## 247. APPLICATION SERVICES

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

APPLICATION SERVICES

Servicios mínimos:

```text
RuleService
ValidationService
CompilationService
PublicationService
ExecutionService
TestService
ArtifactService
AuditService
```

---

## 248. RULE SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RULE SERVICE

Casos:

```text
createRule
getRule
updateDraft
listRules
archiveRule
```

---

## 249. VALIDATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATION SERVICE

Responsable de:

```text
parse
analyze
diagnostics
dependencies
capabilities
```

No publica.

---

## 250. COMPILATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

COMPILATION SERVICE

Responsable de:

```text
Source
→ Compiler
→ Artifact
→ Verify
```

Puede reutilizar el pipeline del Core.

---

## 251. PUBLICATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLICATION SERVICE

Responsable de:

```text
validate
compile
verify
persist
publish
audit
```

---

## 252. EXECUTION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION SERVICE

Responsable de:

```text
authorize
resolve version
load artifact
verify artifact
build context
execute
persist result
audit
```

---

## 253. TEST SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TEST SERVICE

Responsable de ejecutar:

```text
Rule test cases
```

sin publicar cambios.

---

## 254. ARTIFACT SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ARTIFACT SERVICE

Responsable de:

```text
retrieve
verify
inspect
```

No debe permitir modificación arbitraria de Artifacts publicados.

---

## 255. AUDIT SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

AUDIT SERVICE

Centraliza:

```text
audit event creation
```

pero no debe convertirse en una dependencia semántica del Compiler.

---

## 256. API VERSION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API VERSION

Recomendación:

```text
/api/v1/ael
```

---

## 257. RULE ENDPOINTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RULE ENDPOINTS

```text
POST   /api/v1/ael/rules
GET    /api/v1/ael/rules
GET    /api/v1/ael/rules/:ruleId
PATCH  /api/v1/ael/rules/:ruleId
```

---

## 258. RULE VERSION ENDPOINTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RULE VERSION ENDPOINTS

```text
GET  /api/v1/ael/rules/:ruleId/versions
GET  /api/v1/ael/rules/:ruleId/versions/:version
```

---

## 259. VALIDATION ENDPOINT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATION ENDPOINT

```text
POST /api/v1/ael/rules/:ruleId/validate
```

o, para Draft sin persistir:

```text
POST /api/v1/ael/validate
```

---

## 260. COMPILE ENDPOINT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

COMPILE ENDPOINT

Para herramientas autorizadas:

```text
POST /api/v1/ael/compile
```

Debe devolver Artifact metadata, no necesariamente bytes completos.

---

## 261. PUBLISH ENDPOINT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLISH ENDPOINT

```text
POST /api/v1/ael/rules/:ruleId/versions/:version/publish
```

---

## 262. EXECUTE ENDPOINT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTE ENDPOINT

```text
POST /api/v1/ael/rules/:ruleId/execute
```

El servidor resuelve la versión activa.

---

## 263. EXECUTE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTE VERSION

Para ejecución explícita:

```text
POST /api/v1/ael/rules/:ruleId/versions/:version/execute
```

Debe requerir permisos apropiados.

---

## 264. SIMULATE ENDPOINT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SIMULATE ENDPOINT

```text
POST /api/v1/ael/rules/:ruleId/simulate
```

Debe dejar claro que:

```text
simulation ≠ publication
```

---

## 265. TEST ENDPOINT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TEST ENDPOINT

```text
POST /api/v1/ael/rules/:ruleId/test
```

---

## 266. EXECUTION HISTORY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION HISTORY

```text
GET /api/v1/ael/rules/:ruleId/executions
GET /api/v1/ael/executions/:executionId
```

---

## 267. ARTIFACT INSPECTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ARTIFACT INSPECTION

```text
GET /api/v1/ael/artifacts/:hash
```

Debe devolver metadata autorizada.

---

## 268. DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

DEPENDENCIES

```text
GET /api/v1/ael/rules/:ruleId/versions/:version/dependencies
```

---

## 269. DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

DIAGNOSTICS

Los endpoints de validación deben devolver:

```text
code
severity
message
span
```

---

## 270. VALIDATE REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATE REQUEST

```ts
interface ValidateRuleRequest {
  source: string
  languageVersion?: string
}
```

---

## 271. VALIDATE RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATE RESPONSE

```ts
interface ValidateRuleResponse {
  valid: boolean
  diagnostics: DiagnosticDto[]
  dependencies: DependencyDto[]
  capabilities: string[]
}
```

---

## 272. CREATE RULE REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CREATE RULE REQUEST

```ts
interface CreateRuleRequest {
  code: string
  name: string
  description?: string
}
```

---

## 273. UPDATE DRAFT REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

UPDATE DRAFT REQUEST

```ts
interface UpdateRuleDraftRequest {
  source: string
  expectedVersion?: number
}
```

---

## 274. OPTIMISTIC CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

OPTIMISTIC CONCURRENCY

Si se edita un Draft:

```text
expectedVersion
```

puede evitar que un usuario sobrescriba cambios ajenos.

---

## 275. CONFLICT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CONFLICT

Si la versión esperada no coincide:

```text
409 Conflict
```

---

## 276. PUBLISH REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLISH REQUEST

```ts
interface PublishRuleRequest {
  expectedDraftVersion?: number
  comment?: string
}
```

---

## 277. EXECUTE REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTE REQUEST

```ts
interface ExecuteRuleRequest {
  mode?: 'LIVE' | 'SNAPSHOT' | 'TEST' | 'SIMULATION'
  idempotencyKey?: string
}
```

---

## 278. EXECUTION RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION RESPONSE

```ts
interface ExecuteRuleResponse {
  executionId: string
  status: string
  result?: AELValueDto
  diagnostics: DiagnosticDto[]
  ruleVersion: number
  artifactHash: string
}
```

---

## 279. MONEY DTO

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

MONEY DTO

```ts
interface MoneyDto {
  type: 'MONEY'
  amount: string
  currency: string
}
```

---

## 280. QUANTITY DTO

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

QUANTITY DTO

```ts
interface QuantityDto {
  type: 'QUANTITY'
  value: string
  unit: string
  dimension: string
}
```

---

## 281. RESULT DTO

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RESULT DTO

Nunca representar Money como:

```json
{
  "amount": 542250.0
}
```

sin currency.

Preferir:

```json
{
  "type": "MONEY",
  "amount": "542250",
  "currency": "COP"
}
```

---

## 282. API DOES NOT EXPOSE INTERNAL TYPES

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API DOES NOT EXPOSE INTERNAL TYPES

No devolver directamente:

```text
AELValue
AST
IR
ExecutionState
```

como objetos internos.

---

## 283. MAPPERS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

MAPPERS

Crear:

```text
AELValueMapper
DiagnosticMapper
RuleMapper
ExecutionMapper
ArtifactMapper
```

---

## 284. HTTP STATUS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

HTTP STATUS

Convención mínima:

```text
200 OK
201 Created
202 Accepted
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

---

## 285. VALIDATION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATION ERROR

Source inválido:

```text
422 Unprocessable Entity
```

con diagnostics.

---

## 286. AUTHENTICATION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

AUTHENTICATION ERROR

Sin autenticación:

```text
401
```

---

## 287. AUTHORIZATION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

AUTHORIZATION ERROR

Autenticado pero no autorizado:

```text
403
```

---

## 288. NOT FOUND

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

NOT FOUND

No revelar información innecesaria sobre recursos de otros tenants.

Puede responder:

```text
404
```

cuando la política de seguridad lo requiera.

---

## 289. RATE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RATE LIMIT

Exceso de llamadas:

```text
429
```

---

## 290. INTERNAL ERROR

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

INTERNAL ERROR

Nunca devolver:

```text
stack trace
SQL
secret
provider credentials
```

al cliente.

---

## 291. ERROR RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ERROR RESPONSE

Formato:

```json
{
  "error": {
    "code": "AEL-EXECUTION-001",
    "message": "Execution failed",
    "details": []
  }
}
```

---

## 292. CORRELATION ID

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CORRELATION ID

Toda respuesta debe poder correlacionarse con:

```text
correlationId
```

---

## 293. REQUEST ID

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

REQUEST ID

Puede utilizarse:

```text
requestId
```

independientemente de:

```text
executionId
```

---

## 294. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

IDEMPOTENCY

Operaciones como:

```text
publish
execute
```

pueden requerir:

```text
Idempotency-Key
```

---

## 295. IDEMPOTENCY STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

IDEMPOTENCY STORAGE

Guardar:

```text
tenant
key
operation
request hash
result
```

según necesidad.

---

## 296. IDEMPOTENCY CONFLICT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

IDEMPOTENCY CONFLICT

Misma key con diferente request:

```text
409 Conflict
```

---

## 297. EXECUTION SYNC

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION SYNC

Si la ejecución es corta:

```text
POST
→
result
```

puede ser síncrona.

---

## 298. EXECUTION ASYNC

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION ASYNC

Para procesos largos:

```text
POST
→
202
→
executionId
```

---

## 299. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION STATUS

```text
GET /api/v1/ael/executions/:executionId
```

---

## 300. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CANCELLATION

Si se soporta:

```text
POST /api/v1/ael/executions/:executionId/cancel
```

---

## 301. CANCEL AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CANCEL AUTHORIZATION

Sólo el propietario o rol autorizado puede cancelar una ejecución.

---

## 302. SIMULATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SIMULATION

Simulation debe:

```text
not publish
not mutate rule
```

y sus efectos externos deben estar bloqueados o controlados.

---

## 303. TEST EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TEST EXECUTION

Los tests deben ejecutarse con:

```text
TEST mode
```

y Providers controlados.

---

## 304. SNAPSHOT EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SNAPSHOT EXECUTION

Debe utilizar:

```text
SnapshotContractProvider
```

cuando exista snapshot.

---

## 305. LIVE EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

LIVE EXECUTION

Utiliza:

```text
AquilaContractProvider
```

y datos autorizados actuales.

---

## 306. APPLICATION AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

APPLICATION AUTHORIZATION

Antes de ejecutar:

```text
canExecuteRule
```

Debe verificarse.

---

## 307. PUBLICATION AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLICATION AUTHORIZATION

Antes de publicar:

```text
canPublishRule
```

---

## 308. EDIT AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EDIT AUTHORIZATION

Antes de modificar Draft:

```text
canEditRule
```

---

## 309. AUDIT AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

AUDIT AUTHORIZATION

Acceso a historial/audit:

```text
canViewAudit
```

---

## 310. AUTHORIZATION VS CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

AUTHORIZATION VS CAPABILITY

Separar:

```text
AQUILA permission
```

de:

```text
AEL capability
```

---

## 311. PUBLISH FLOW

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLISH FLOW

```text
Request
 ↓
Authentication
 ↓
Authorization
 ↓
Load Draft
 ↓
Validate
 ↓
Compile
 ↓
Verify Artifact
 ↓
Resolve dependencies
 ↓
Transaction
 ↓
Persist
 ↓
Publish
 ↓
Audit
 ↓
Response
```

---

## 312. EXECUTION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION FLOW

```text
Request
 ↓
Authentication
 ↓
Authorization
 ↓
Resolve RuleVersion
 ↓
Load Artifact
 ↓
Verify
 ↓
Build ExecutionContext
 ↓
Resolve capabilities
 ↓
Create execution
 ↓
Runtime
 ↓
Persist result
 ↓
Audit
 ↓
Response
```

---

## 313. VALIDATION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATION FLOW

```text
Source
 ↓
Lexer
 ↓
Parser
 ↓
Analyzer
 ↓
Diagnostics
```

No persistence necesaria para validar un Source temporal.

---

## 314. COMPILATION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

COMPILATION FLOW

```text
Source
 ↓
Validate
 ↓
Compiler
 ↓
Artifact
 ↓
Verifier
```

---

## 315. SERVICE BOUNDARIES

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SERVICE BOUNDARIES

`PublicationService` puede utilizar:

```text
ValidationService
CompilationService
ArtifactService
```

pero el Runtime no debe llamar Application Services.

---

## 316. APPLICATION SERVICE INTERFACES

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

APPLICATION SERVICE INTERFACES

Ejemplo:

```ts
interface ValidationService {
  validate(command: ValidateCommand): Promise<ValidationResult>
}
```

---

## 317. RULE SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RULE SERVICE

```ts
interface RuleService {
  create(command: CreateRuleCommand): Promise<RuleDto>
  updateDraft(command: UpdateDraftCommand): Promise<RuleDto>
  get(query: GetRuleQuery): Promise<RuleDto>
}
```

---

## 318. PUBLICATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLICATION SERVICE

```ts
interface PublicationService {
  publish(command: PublishRuleCommand): Promise<PublicationResult>
}
```

---

## 319. EXECUTION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION SERVICE

```ts
interface ExecutionService {
  execute(command: ExecuteRuleCommand): Promise<ExecutionResultDto>
}
```

---

## 320. TEST SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TEST SERVICE

```ts
interface TestService {
  run(command: RunRuleTestsCommand): Promise<TestRunResult>
}
```

---

## 321. COMMANDS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

COMMANDS

Commands deben contener sólo información necesaria.

Ejemplo:

```ts
interface ExecuteRuleCommand {
  tenantId: string
  actorId: string
  ruleId: string
  version?: number
  mode: ExecutionMode
  idempotencyKey?: string
}
```

---

## 322. TENANT SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TENANT SOURCE

`tenantId` debe provenir de:

```text
authenticated server context
```

No confiar en:

```text
request body.tenantId
```

---

## 323. ACTOR SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ACTOR SOURCE

Igualmente:

```text
authenticated principal
```

---

## 324. RULE OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RULE OWNERSHIP

Antes de operar sobre Rule:

```text
tenant ownership
```

debe validarse.

---

## 325. DTO VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

DTO VERSIONING

Cambios incompatibles de API deben producir:

```text
new API version
```

---

## 326. OPENAPI

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

OPENAPI

La API debe documentarse con:

```text
OpenAPI
```

---

## 327. SCHEMA GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SCHEMA GENERATION

Los schemas deben representar:

```text
requests
responses
errors
```

---

## 328. NO LEAK INTERNAL SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

NO LEAK INTERNAL SCHEMA

No exponer automáticamente el schema de PostgreSQL como OpenAPI.

---

## 329. PAGINATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PAGINATION

List endpoints deben soportar:

```text
limit
cursor
```

o estrategia equivalente.

---

## 330. PAGINATION STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PAGINATION STABILITY

La paginación debe utilizar un orden estable:

```text
created_at + id
```

u otro criterio determinista.

---

## 331. FILTERING

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

FILTERING

Filtros mínimos pueden incluir:

```text
status
code
createdBy
createdAt
```

según permisos.

---

## 332. SEARCH

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SEARCH

La búsqueda de reglas no debe utilizar:

```text
LIKE '%...%'
```

sin considerar índices y volumen.

La implementación exacta depende de PostgreSQL.

---

## 333. API RATE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API RATE LIMITS

Separar:

```text
read
write
compile
execute
publish
```

si la carga lo requiere.

---

## 334. EXECUTION QUOTAS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION QUOTAS

ExecutionService debe consultar quotas de AQUILA antes de lanzar una ejecución costosa.

---

## 335. QUOTA VS SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

QUOTA VS SECURITY

Una quota excedida:

```text
business limitation
```

no es:

```text
security denial
```

---

## 336. TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TIMEOUT

API timeout no significa necesariamente que Runtime haya detenido la ejecución.

En async:

```text
202 + executionId
```

es preferible.

---

## 337. ASYNC API

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ASYNC API

```text
POST /execute
→ 202
```

y:

```text
GET /executions/:id
```

---

## 338. WEBHOOK FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

WEBHOOK FUTURE

Notificación externa de completion puede incorporarse posteriormente mediante:

```text
event/outbox
```

No hacer depender AEL Core de webhooks.

---

## 339. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

OBSERVABILITY

Application Services deben registrar:

```text
operation
tenant
actor
rule
version
execution
duration
status
```

sin datos sensibles.

---

## 340. METRICS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

METRICS

Métricas:

```text
ael_api_validate_total
ael_api_compile_total
ael_api_publish_total
ael_api_execute_total
ael_api_errors_total
```

---

## 341. SERVICE ERROR TAXONOMY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SERVICE ERROR TAXONOMY

Separar:

```text
ValidationError
AuthorizationError
NotFoundError
ConflictError
DependencyError
ExecutionError
InfrastructureError
```

---

## 342. ERROR MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ERROR MAPPING

Ejemplo:

```text
ValidationError → 422
AuthorizationError → 403
NotFoundError → 404
ConflictError → 409
DependencyError → 422/424
ExecutionError → 422/500 según causa
InfrastructureError → 500
```

---

## 343. NO RAW EXCEPTIONS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

NO RAW EXCEPTIONS

Controllers nunca deben:

```text
catch Error → return error.message
```

sin clasificación.

---

## 344. TRANSACTION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TRANSACTION BOUNDARY

La transaction pertenece al Application Service.

No al Controller.

---

## 345. REPOSITORY TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

REPOSITORY TRANSACTION

Repositories reciben:

```text
TransactionContext
```

cuando corresponda.

---

## 346. PUBLICATION ATOMICITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLICATION ATOMICITY

El Service debe garantizar:

```text
version
artifact
dependencies
publication
audit
```

coherentes.

---

## 347. EXECUTION PERSISTENCE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION PERSISTENCE

No mantener una transacción DB abierta durante toda la ejecución Runtime.

---

## 348. EXECUTION START

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION START

Crear registro:

```text
QUEUED/RUNNING
```

antes de ejecutar.

---

## 349. EXECUTION COMPLETION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION COMPLETION

Actualizar:

```text
COMPLETED
```

o:

```text
FAILED
TIMEOUT
DENIED
```

---

## 350. EXECUTION FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION FAILURE

Guardar:

```text
error_code
```

y metadata mínima.

---

## 351. RESULT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RESULT VALIDATION

Antes de persistir:

```text
result type
currency
unit
```

deben coincidir con el contrato de salida de la Rule.

---

## 352. RULE OUTPUT CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

RULE OUTPUT CONTRACT

Una Rule puede declarar:

```text
expected output type
```

cuando el modelo de lenguaje lo soporte.

---

## 353. OUTPUT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

OUTPUT TYPE

Ejemplo:

```text
MONEY
COP
```

Debe validarse antes de presentar resultado financiero como válido.

---

## 354. API SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API SECURITY

Aplicar:

```text
authentication
authorization
rate limiting
input validation
audit
```

---

## 355. SOURCE SIZE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SOURCE SIZE LIMIT

Validación debe rechazar Source excesivamente grande.

Límite configurable:

```text
maxSourceBytes
```

---

## 356. ARTIFACT SIZE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ARTIFACT SIZE LIMIT

También:

```text
maxArtifactBytes
```

---

## 357. REQUEST SIZE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

REQUEST SIZE

API gateway debe limitar:

```text
request body
```

---

## 358. DOS PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

DOS PROTECTION

Compilación y ejecución deben estar protegidas contra:

```text
resource exhaustion
```

---

## 359. SECURITY HEADERS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SECURITY HEADERS

La API debe utilizar las políticas generales de seguridad de AQUILA.

---

## 360. CORS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CORS

CORS debe permitir únicamente origins configurados.

No:

```text
*
```

en producción para endpoints sensibles.

---

## 361. CSRF

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CSRF

Si la autenticación utiliza cookies:

```text
CSRF protection
```

debe aplicarse según arquitectura.

---

## 362. API LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API LOGGING

Nunca registrar automáticamente:

```text
Authorization header
cookies
secrets
full Source
```

---

## 363. TRACEABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

TRACEABILITY

Cada operación debe poder relacionarse:

```text
requestId
correlationId
executionId
ruleVersionId
artifactHash
```

---

## 364. API TESTING

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API TESTING

Crear:

```text
unit tests
integration tests
contract tests
security tests
E2E tests
```

---

## 365. CONTROLLER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CONTROLLER TESTS

Probar:

```text
status codes
DTOs
validation
authorization
error mapping
```

---

## 366. APPLICATION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

APPLICATION TESTS

Probar:

```text
publish
execute
validate
```

con fake repositories/providers.

---

## 367. INTEGRATION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

INTEGRATION TESTS

Probar:

```text
API
+
PostgreSQL
+
AEL Runtime
```

sin depender de producción.

---

## 368. SECURITY E2E

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SECURITY E2E

Probar:

```text
Tenant A
→
Tenant B Rule
```

Resultado:

```text
denied/not found
```

según política.

---

## 369. PUBLISH E2E

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLISH E2E

Debe recorrer:

```text
create
edit
validate
publish
execute
```

---

## 370. VERSION E2E

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VERSION E2E

Crear:

```text
v1
publish
execute
v2
publish
execute
```

y comprobar que ambas ejecuciones mantienen referencias correctas.

---

## 371. IDEMPOTENCY E2E

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

IDEMPOTENCY E2E

Enviar dos veces:

```text
same operation
same idempotency key
```

No crear duplicados.

---

## 372. API DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API DOCUMENTATION

Cada endpoint debe documentar:

```text
request
response
errors
authorization
idempotency
```

---

## 373. CLIENT SDK

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CLIENT SDK

Posteriormente puede generarse un SDK TypeScript desde OpenAPI.

No escribir manualmente dos contratos divergentes.

---

## 374. UI CONSUMPTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

UI CONSUMPTION

Nuxt debe consumir:

```text
API DTOs
```

no repositories.

---

## 375. UI ERROR DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

UI ERROR DISPLAY

Diagnostics deben ser suficientemente ricos para:

```text
line
column
message
code
```

---

## 376. EDITOR INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EDITOR INTEGRATION

El editor puede llamar:

```text
POST /validate
```

para feedback.

Debe aplicarse debounce/cancelación para evitar solicitudes excesivas.

---

## 377. COMPILATION UI

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

COMPILATION UI

Publicación no debe depender de:

```text
frontend compiling Artifact
```

El servidor es autoridad.

---

## 378. SERVER AUTHORITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

SERVER AUTHORITY

El backend determina:

```text
Artifact
hash
dependencies
capabilities
publication
```

---

## 379. CLIENT TRUST

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CLIENT TRUST

Nunca confiar en:

```text
client-supplied artifact
client-supplied hash
client-supplied capabilities
client-supplied tenant
```

---

## 380. API CACHE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API CACHE

Sólo cachear respuestas seguras y apropiadas.

No cachear indiscriminadamente:

```text
execution results
tenant-specific data
```

---

## 381. API DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API DEPRECATION

Versiones antiguas deben tener:

```text
deprecation policy
```

---

## 382. API OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API OBSERVABILITY

Dashboard mínimo:

```text
requests
latency
errors
429
5xx
publication failures
execution failures
```

---

## 383. API AVAILABILITY

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API AVAILABILITY

Separar:

```text
read availability
write availability
execution availability
```

cuando sea necesario.

---

## 384. GRACEFUL DEGRADATION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

GRACEFUL DEGRADATION

Si Provider está caído:

```text
validation
```

puede seguir funcionando si sólo necesita metadata.

Mientras:

```text
execution
```

puede fallar.

---

## 385. VALIDATION WITHOUT LIVE DATA

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

VALIDATION WITHOUT LIVE DATA

El Analyzer debe poder validar Contracts mediante metadata:

```text
type
dimension
capability
```

sin consultar valores reales.

---

## 386. EXECUTION REQUIRES VALUES

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXECUTION REQUIRES VALUES

Runtime necesita:

```text
actual Contract values
```

---

## 387. API CONTRACT PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API CONTRACT PRINCIPLE

```text
Validate
→ static/semantic

Execute
→ dynamic/contextual
```

---

## 388. PUBLICATION REQUIREMENT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PUBLICATION REQUIREMENT

Publication debe requerir:

```text
successful validation
successful compilation
successful artifact verification
dependency availability
```

---

## 389. NO EXECUTE DRAFT

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

NO EXECUTE DRAFT

Por defecto no ejecutar Draft no publicado en producción.

Simulation/Test puede hacerlo bajo políticas explícitas.

---

## 390. PRODUCTION EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

PRODUCTION EXECUTION

Sólo:

```text
PUBLISHED/ACTIVE RuleVersion
```

según workflow.

---

## 391. ADMIN OVERRIDE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

ADMIN OVERRIDE

Cualquier override administrativo debe:

```text
require explicit permission
audit
```

---

## 392. API PRINCIPAL

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

API PRINCIPAL

El diseño completo queda:

```text
                    AQUILA UI
                        │
                        ▼
                  AEL REST API
                        │
                ┌───────┴────────┐
                ▼                ▼
          Rule Services     Execution Service
                │                │
                ▼                ▼
          Publication        AEL Runtime
                │                │
                ▼                ▼
          Repositories      Providers
                │                │
                └───────┬────────┘
                        ▼
                   PostgreSQL
```

---

## 393. MILESTONE AEL-003

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

MILESTONE AEL-003

Nombre:

```text
AEL-003 — Application & API Integration
```

Debe lograr:

```text
Create Rule
Edit Draft
Validate
Compile
Publish
Execute
Inspect Execution
```

---

## 394. EXIT CRITERIA

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

EXIT CRITERIA

```text
✓ API versioned
✓ DTOs defined
✓ Application Services implemented
✓ Authorization integrated
✓ Tenant context secure
✓ Validation endpoint works
✓ Publication endpoint works
✓ Execution endpoint works
✓ Async execution path defined
✓ Error model consistent
✓ Idempotency implemented where required
✓ OpenAPI generated
✓ API tests pass
✓ E2E publish/execute passes
```

---

## 395. CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_API_Application_Services 20.md

CIERRE

Con AEL-003, AQUILA tendrá por primera vez un flujo completo:

```text
Usuario
 ↓
crear regla
 ↓
editar Source
 ↓
validar
 ↓
compilar
 ↓
publicar
 ↓
ejecutar
 ↓
obtener resultado
 ↓
auditar
```

sin que la interfaz gráfica tenga que conocer cómo funciona internamente el compilador.

> **La API convierte el motor AEL en una capacidad consumible por AQUILA. El Core continúa independiente; Application Services hacen la orquestación; PostgreSQL conserva el estado; y la UI consume contratos HTTP estables.**

---

# FIN DEL DOCUMENTO 20

## AEL V1 — API y Application Services

## 396. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

OBJETIVO

Integrar:

```text
AEL Runtime
      ↓
AQUILA Integration Layer
      ├── Contract Providers
      ├── Function Providers
      ├── Execution Context
      ├── Authorization
      └── Infrastructure adapters
              ↓
        PostgreSQL / Supabase
```

---

## 397. RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RESPONSABILIDAD

La Integration Layer debe adaptar:

```text
AQUILA
```

a:

```text
AEL
```

sin contaminar:

```text
AEL Core
AEL Parser
AEL Analyzer
AEL Runtime
```

con infraestructura específica.

---

## 398. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NO RESPONSABILIDAD

El Core AEL no debe importar:

```text
supabase-js
postgres client
PostgREST
Vue
Nuxt
Pinia
HTTP controllers
```

---

## 399. DEPENDENCY DIRECTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DEPENDENCY DIRECTION

La dirección debe ser:

```text
AQUILA Infrastructure
        ↓
AQUILA Integration
        ↓
AEL Interfaces
```

Nunca:

```text
AEL Core
   ↓
Supabase
```

---

## 400. ARQUITECTURA

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

ARQUITECTURA

```text
┌──────────────────────────────┐
│        AQUILA APP            │
├──────────────────────────────┤
│ Application / Services       │
├──────────────────────────────┤
│ AEL Integration Layer        │
│                              │
│ Contract Adapters            │
│ Function Adapters            │
│ Authorization Adapter        │
│ Context Builder              │
├──────────────────────────────┤
│ AEL Runtime                  │
├──────────────────────────────┤
│ AEL Core                     │
└──────────────────────────────┘
              │
              ▼
       PostgreSQL/Supabase
```

---

## 401. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXECUTION CONTEXT

AQUILA debe construir:

```text
ExecutionContext
```

antes de ejecutar una Rule.

---

## 402. CONTEXT DATA

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTEXT DATA

Mínimo:

```text
tenantId
actorId
ruleId
ruleVersionId
artifactHash
correlationId
locale
timezone
```

---

## 403. TENANT ID

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TENANT ID

`tenantId` debe provenir del contexto autenticado/controlado por Application.

Nunca:

```text
AEL Source
```

---

## 404. ACTOR

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

ACTOR

El Runtime puede recibir:

```text
actorId
role
permissions
```

pero AEL no debe poder modificarlos.

---

## 405. AUTHENTICATION VS AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

AUTHENTICATION VS AUTHORIZATION

Separar:

```text
Authentication
→ quién ejecuta

Authorization
→ qué puede ejecutar
```

---

## 406. AEL CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

AEL CAPABILITIES

AEL utiliza:

```text
requiredCapabilities
```

como declaración de necesidades.

---

## 407. APPLICATION AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

APPLICATION AUTHORIZATION

Application determina:

```text
grantedCapabilities
```

para el contexto.

---

## 408. CAPABILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CAPABILITY CHECK

Antes de ejecución:

```text
required ⊆ granted
```

debe cumplirse.

---

## 409. DENIED CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DENIED CAPABILITY

Si no se cumple:

```text
execution blocked
```

antes de acceder al Provider.

---

## 410. POSTGRESQL

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

POSTGRESQL

PostgreSQL continúa siendo la fuente de verdad para:

```text
datos
integridad
relaciones
versiones
tenancy
auditoría
```

---

## 411. DB-FIRST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DB-FIRST

La integración no debe trasladar reglas de integridad de PostgreSQL al Runtime.

PostgreSQL mantiene:

```text
constraints
FK
CHECK
UNIQUE
RLS
transactions
```

---

## 412. RLS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RLS

Supabase/PostgreSQL RLS es una barrera primaria para:

```text
tenant isolation
```

---

## 413. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DEFENSE IN DEPTH

La seguridad debe existir en capas:

```text
Application authorization
        +
AEL capability validation
        +
Provider validation
        +
PostgreSQL RLS
```

---

## 414. PROVIDER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PROVIDER CONTEXT

El Contract Provider recibe:

```text
tenantId
actor context
correlationId
capability
```

---

## 415. DATABASE SESSION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DATABASE SESSION CONTEXT

Cuando aplique, el adapter puede establecer:

```text
transaction-local context
```

para que PostgreSQL/RLS pueda conocer:

```text
tenant
actor
```

---

## 416. NO GLOBAL TENANT STATE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NO GLOBAL TENANT STATE

Nunca utilizar:

```text
global currentTenant
```

---

## 417. REQUEST ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

REQUEST ISOLATION

Cada execution debe transportar su propio:

```text
tenant context
```

---

## 418. SUPABASE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SUPABASE

Supabase puede actuar como infraestructura:

```text
Auth
PostgreSQL
Storage
Edge Functions
```

pero AEL no debe conocer sus APIs directamente.

---

## 419. SUPABASE ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SUPABASE ADAPTER

Puede existir:

```text
SupabaseContractProvider
```

pero implementando:

```text
ContractProvider
```

de AEL.

---

## 420. POSTGRES ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

POSTGRES ADAPTER

Puede existir:

```text
PostgresContractProvider
```

si el backend accede directamente a PostgreSQL.

---

## 421. PROVIDER SELECTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PROVIDER SELECTION

La Application Layer decide:

```text
which provider implementation
```

según entorno.

---

## 422. CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT

Un Contract AEL representa:

```text
dato autorizado y tipado
```

no una tabla.

---

## 423. CONTRACT EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT EXAMPLE

```text
PROPERTY.AREA_PRIVATE
```

puede internamente obtener:

```text
copropiedad.inmuebles.area_privada
```

pero AEL nunca debe saberlo.

---

## 424. CONTRACT MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT MAPPING

Debe existir metadata:

```text
AEL Contract
→ provider adapter
```

---

## 425. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT REGISTRY

Debe contener:

```text
code
version
type
dimensions
capabilities
providerKey
```

---

## 426. PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PROVIDER KEY

Ejemplo:

```text
property.area_private
```

Es un identificador interno del adapter.

No debe convertirse en API pública AEL.

---

## 427. QUERY ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

QUERY ISOLATION

Provider debe obtener únicamente los datos necesarios.

---

## 428. NO SELECT *

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NO SELECT *

Evitar:

```sql
SELECT *
```

en Providers.

---

## 429. EXPLICIT COLUMNS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXPLICIT COLUMNS

Provider debe consultar:

```text
columnas explícitas
```

---

## 430. PARAMETERIZED QUERIES

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PARAMETERIZED QUERIES

Nunca construir SQL mediante concatenación de valores.

---

## 431. SQL INJECTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SQL INJECTION

AEL Source nunca debe poder convertirse directamente en SQL.

---

## 432. CONTRACT INPUT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT INPUT

Si Contract requiere:

```text
propertyId
```

debe venir de:

```text
ExecutionContext
```

o input controlado.

No de SQL generado por Source.

---

## 433. EXECUTION INPUT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXECUTION INPUT

Conceptualmente:

```ts
interface ExecutionInput {
  readonly values: Readonly<Record<string, AELValue>>
}
```

---

## 434. INPUT CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INPUT CONTRACTS

Si existen Inputs públicos de Rule:

```text
INPUT.*
```

deben estar definidos y tipados.

---

## 435. INPUT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INPUT VALIDATION

Antes de Runtime:

```text
validate type
validate dimensions
validate required
validate tenant ownership
```

---

## 436. INPUT TENANCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INPUT TENANCY

Un input como:

```text
propertyId
```

no debe permitir seleccionar un inmueble de otro tenant.

---

## 437. RLS PRIMARY CONTROL

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RLS PRIMARY CONTROL

Aunque Application valide ownership:

```text
RLS
```

debe actuar como barrera final.

---

## 438. CONTRACT RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT RESULT

Provider debe devolver:

```text
AELValue
```

compatible con Contract metadata.

---

## 439. RESULT ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RESULT ADAPTER

No permitir retornar directamente:

```text
database row
```

---

## 440. RECORD MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RECORD MAPPING

Si Contract es Record:

```text
DB row
→ explicit mapping
→ AEL Record
```

---

## 441. NULL MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NULL MAPPING

SQL:

```text
NULL
```

debe mapearse explícitamente a:

```text
AEL Null
```

o:

```text
Nullable<T>
```

según Contract.

---

## 442. NUMERIC MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NUMERIC MAPPING

PostgreSQL:

```text
numeric
```

debe convertirse a:

```text
exact decimal representation
```

no a JavaScript floating point si el valor tiene semántica financiera.

---

## 443. MONEY MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

MONEY MAPPING

PostgreSQL `numeric` + metadata:

```text
currency = COP
```

puede mapearse a:

```text
Money<COP>
```

---

## 444. QUANTITY MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

QUANTITY MAPPING

Ejemplo:

```text
area_privada numeric
unit = M2
```

mapear a:

```text
Quantity<M2>
```

---

## 445. UNIT SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

UNIT SOURCE

La unidad no debe inferirse arbitrariamente por nombre de columna.

Debe venir de:

```text
Contract definition
```

---

## 446. CURRENCY SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CURRENCY SOURCE

Currency debe venir de:

```text
Contract metadata
```

o de un valor explícitamente modelado.

---

## 447. FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTIONS

Functions AEL son operaciones controladas:

```text
REDONDEAR_DINERO
ABSOLUTO
MAXIMO
MINIMO
```

según catálogo.

---

## 448. FUNCTION ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTION ADAPTER

Application puede implementar:

```text
FunctionProvider
```

o registrar implementaciones concretas.

---

## 449. PURE FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PURE FUNCTIONS

Preferencia V1:

```text
pure
deterministic
```

Functions.

---

## 450. IMPURE FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

IMPURE FUNCTIONS

Si una Function necesita:

```text
external I/O
```

debe declarar capability.

---

## 451. EXTERNAL SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXTERNAL SERVICE

Ejemplo:

```text
CONSULTAR_TASA_CAMBIO
```

requeriría explícitamente una capability si se incorpora.

---

## 452. FUNCTION TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTION TIMEOUT

External Function debe respetar:

```text
execution deadline
```

---

## 453. FUNCTION RETRIES

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTION RETRIES

Retry no pertenece al Runtime genérico.

Application/Worker decide:

```text
retry policy
```

---

## 454. FUNCTION IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTION IDEMPOTENCY

Las Functions con side effects deben declarar:

```text
idempotency policy
```

---

## 455. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

V1 RECOMMENDATION

AEL V1 debe priorizar Functions de:

```text
matemática
fechas
texto
validación
```

y minimizar side effects.

---

## 456. TRANSACTION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TRANSACTION BOUNDARY

Una ejecución que sólo lee Contracts puede utilizar:

```text
read transaction
```

cuando sea necesario.

---

## 457. CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONSISTENCY

Si una Rule requiere varios Contracts relacionados:

```text
same logical snapshot
```

debe ser posible cuando el caso de negocio lo exija.

---

## 458. PROVIDER TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PROVIDER TRANSACTION

La integración puede proporcionar un:

```text
ExecutionTransactionContext
```

a múltiples Contract reads.

---

## 459. NO LONG TRANSACTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NO LONG TRANSACTIONS

No mantener transacciones DB abiertas durante:

```text
external HTTP calls
```

---

## 460. READ CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

READ CONSISTENCY

Preferir:

```text
short-lived database transaction
```

para capturar datos consistentes.

---

## 461. WRITE OPERATIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

WRITE OPERATIONS

AEL V1 debe evitar escribir directamente mediante Contracts.

---

## 462. WRITE CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

WRITE CAPABILITY

Si posteriormente existen writes:

```text
WRITE_*
```

deben ser capabilities distintas.

---

## 463. WRITE SEPARATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

WRITE SEPARATION

Recomendación:

```text
calculation Rule
≠
command/action
```

---

## 464. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

AUDIT

Toda ejecución de Rule publicada debe poder asociarse a:

```text
tenantId
ruleVersionId
artifactHash
actorId
correlationId
executedAt
status
```

---

## 465. EXECUTION RECORD

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXECUTION RECORD

Application puede persistir:

```text
rule_execution
```

---

## 466. ARTIFACT REFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

ARTIFACT REFERENCE

Execution debe guardar:

```text
artifactHash
```

no sólo:

```text
ruleId
```

---

## 467. HISTORICAL REPRODUCIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

HISTORICAL REPRODUCIBILITY

Una ejecución histórica debe poder identificar exactamente:

```text
qué Artifact
```

fue ejecutado.

---

## 468. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

OBSERVABILITY

Integración debe propagar:

```text
correlationId
```

a:

```text
DB
logs
Providers
Functions
```

cuando sea seguro.

---

## 469. LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

LOGGING

No registrar:

```text
tokens
passwords
access tokens
secrets
```

---

## 470. DATA REDACTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DATA REDACTION

Provider puede marcar fields:

```text
sensitive
```

para redacción.

---

## 471. RLS CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RLS CONTEXT

El mecanismo exacto para transportar tenant a PostgreSQL debe implementarse mediante:

```text
transaction-scoped context
```

o mecanismo equivalente.

---

## 472. RLS POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RLS POLICY

Las policies deben seguir principio:

```text
tenant_id = trusted execution tenant
```

según arquitectura PostgreSQL definitiva.

---

## 473. SERVICE ROLE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SERVICE ROLE

No utilizar una credencial privilegiada para saltarse RLS como mecanismo normal de Provider.

---

## 474. SERVICE ROLE EXCEPTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SERVICE ROLE EXCEPTION

Si existe una operación administrativa:

```text
explicit admin path
```

fuera del flujo normal AEL.

---

## 475. RLS BYPASS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RLS BYPASS

AEL Runtime no debe tener una opción:

```text
bypassRLS = true
```

---

## 476. DATABASE ROLE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DATABASE ROLE

La conexión utilizada por Providers debe tener:

```text
least privilege
```

---

## 477. DB FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DB FUNCTIONS

PostgreSQL functions pueden utilizarse para:

```text
atomic DB logic
```

pero no deben convertirse en un segundo lenguaje AEL accidental.

---

## 478. CONTRACT PROVIDER OPTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT PROVIDER OPTIONS

Provider puede usar:

```text
SQL query
PostgreSQL function
Supabase RPC
```

según necesidad.

---

## 479. SOURCE ABSTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SOURCE ABSTRACTION

AEL sólo conoce:

```text
Contract
```

---

## 480. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXAMPLE

AEL:

```text
PROPERTY.AREA_PRIVATE
```

Integration:

```text
ContractDefinition
        ↓
PropertyAreaPrivateProvider
        ↓
PostgreSQL
```

---

## 481. CONTRACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT VERSION

Si cambia la fuente:

```text
PropertyAreaPrivateProvider v2
```

no debe romper:

```text
Artifact que exige Contract v1
```

---

## 482. COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

COMPATIBILITY

Provider debe declarar compatibilidad con:

```text
Contract version
```

---

## 483. CONTRACT DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT DEPRECATION

Puede existir:

```text
deprecatedAt
replacement
```

en metadata.

---

## 484. FUNCTION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTION VERSION

Misma regla:

```text
Function v1
Function v2
```

no deben confundirse.

---

## 485. INTEGRATION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INTEGRATION REGISTRY

AQUILA puede tener:

```text
ContractAdapterRegistry
FunctionAdapterRegistry
```

---

## 486. ADAPTER REGISTRATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

ADAPTER REGISTRATION

Registration debe ser explícita:

```text
code
version
provider
```

---

## 487. STARTUP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

STARTUP VALIDATION

Al iniciar backend debe validarse:

```text
registry consistency
```

---

## 488. MISSING ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

MISSING ADAPTER

Si Contract existe pero no tiene adapter:

```text
startup diagnostic
```

o publicación bloqueada.

---

## 489. PUBLICATION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PUBLICATION VALIDATION

Antes de publicar:

```text
all dependencies resolvable
all adapters registered
all capabilities known
```

---

## 490. RUNTIME FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

RUNTIME FAILURE

Nunca descubrir una dependency faltante por primera vez después de publicar.

---

## 491. DEPENDENCY HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DEPENDENCY HEALTH

Application puede ofrecer:

```text
AEL dependency health check
```

---

## 492. CONTRACT HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONTRACT HEALTH

Verificar:

```text
database mapping
type mapping
RLS compatibility
```

---

## 493. FUNCTION HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FUNCTION HEALTH

Verificar:

```text
signature
implementation
capabilities
```

---

## 494. TEST ENVIRONMENT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST ENVIRONMENT

Providers deben poder sustituirse por:

```text
fake adapters
```

---

## 495. TEST TENANT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST TENANT

Tests deben utilizar:

```text
tenant A
tenant B
```

para demostrar aislamiento.

---

## 496. TEST RLS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST RLS

Integración debe incluir pruebas reales de:

```text
RLS deny
RLS allow
cross-tenant deny
```

---

## 497. TEST CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST CONTRACT

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

tenant A:

```text
120.5 M2
```

tenant B:

```text
80.0 M2
```

Cada ejecución debe obtener exclusivamente su tenant.

---

## 498. TEST CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST CAPABILITY

Sin:

```text
READ_PROPERTY
```

Provider no debe ejecutarse.

---

## 499. TEST PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST PROVIDER

Con capability válida:

```text
Provider called
```

---

## 500. TEST FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST FUNCTION

Function adapter debe recibir:

```text
typed AELValues
```

---

## 501. TEST NUMERIC

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST NUMERIC

PostgreSQL:

```text
numeric(18,2)
```

debe conservar precisión necesaria.

---

## 502. TEST MONEY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST MONEY

Ejemplo:

```text
542250.00 COP
```

debe conservar:

```text
Money<COP>
```

---

## 503. TEST QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST QUANTITY

Ejemplo:

```text
120.50 M2
```

debe conservar:

```text
Quantity<M2>
```

---

## 504. NO FLOAT TEST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NO FLOAT TEST

Los tests deben demostrar que valores monetarios no sufren:

```text
floating point drift
```

---

## 505. TRANSACTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TRANSACTION TEST

Si varios Contracts requieren snapshot:

```text
same transaction context
```

debe entregar una vista consistente.

---

## 506. TIMEOUT TEST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TIMEOUT TEST

Provider lento:

```text
execution timeout
```

debe terminar correctamente.

---

## 507. CANCELLATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CANCELLATION TEST

Cancelación durante Provider:

```text
execution cancelled
```

---

## 508. CORRELATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CORRELATION TEST

El mismo:

```text
correlationId
```

debe poder rastrearse entre capas.

---

## 509. SECURITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SECURITY TEST

Intentar:

```text
tenant A → data tenant B
```

debe fallar aunque el Source sea perfectamente válido.

---

## 510. SECURITY PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SECURITY PRINCIPLE

Que una Rule compile correctamente:

```text
NO significa
```

que pueda acceder a cualquier dato.

---

## 511. PUBLICATION VS EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PUBLICATION VS EXECUTION

Publication verifica:

```text
technical validity
```

Execution verifica:

```text
current authorization
current tenant context
```

---

## 512. AUTHORIZATION RECHECK

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

AUTHORIZATION RECHECK

Las capabilities deben comprobarse nuevamente en ejecución.

No confiar exclusivamente en el momento de publicación.

---

## 513. WHY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

WHY

Porque pueden cambiar:

```text
roles
permissions
tenant policy
```

entre publicación y ejecución.

---

## 514. TENANT CONTEXT RECHECK

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TENANT CONTEXT RECHECK

El Provider debe validar:

```text
execution tenant
```

y PostgreSQL debe reforzarlo con:

```text
RLS
```

---

## 515. FAILURE MODE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FAILURE MODE

Si Authorization falla:

```text
fail closed
```

Nunca:

```text
fail open
```

---

## 516. FAIL CLOSED

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FAIL CLOSED

Ante incertidumbre:

```text
no access
```

---

## 517. ERROR MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

ERROR MAPPING

Integration Layer traduce:

```text
database errors
provider errors
authorization errors
```

a:

```text
AEL RuntimeError
```

sin exponer infraestructura.

---

## 518. DATABASE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DATABASE ERROR

No devolver al usuario:

```text
SQL statement
database host
schema internals
```

---

## 519. INTERNAL DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INTERNAL DIAGNOSTICS

Logs internos pueden conservar:

```text
technical cause
```

según política.

---

## 520. API RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

API RESPONSE

Application puede exponer:

```text
stable error code
safe message
correlationId
```

---

## 521. PACKAGE STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PACKAGE STRUCTURE

Recomendación:

```text
packages/
├── ael-core/
├── ael-parser/
├── ael-analyzer/
├── ael-compiler/
├── ael-runtime/
└── aquila-ael-integration/
```

---

## 522. INTEGRATION PACKAGE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INTEGRATION PACKAGE

Dentro:

```text
src/
├── contracts/
├── functions/
├── authorization/
├── context/
├── postgres/
├── supabase/
└── registries/
```

---

## 523. DEPENDENCY RULE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DEPENDENCY RULE

```text
aquila-ael-integration
→ depends on ael interfaces
```

pero:

```text
ael-core
→ no depende de aquila integration
```

---

## 524. INTERFACE OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INTERFACE OWNERSHIP

Las interfaces genéricas:

```text
ContractProvider
FunctionProvider
```

pertenecen a:

```text
AEL Runtime
```

Los adapters concretos pertenecen a:

```text
AQUILA Integration
```

---

## 525. APPLICATION SERVICE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

APPLICATION SERVICE

Puede existir:

```text
AELExecutionService
```

que coordine:

```text
load RuleVersion
load Artifact
verify
authorize
build context
execute
persist result
```

---

## 526. SERVICE FLOW

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SERVICE FLOW

```text
Request
 ↓
Authentication
 ↓
Load RuleVersion
 ↓
Load Artifact
 ↓
Verify Artifact
 ↓
Resolve Authorization
 ↓
Build ExecutionContext
 ↓
Execute Runtime
 ↓
Persist Execution
 ↓
Response
```

---

## 527. NO CONTROLLER LOGIC

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

NO CONTROLLER LOGIC

HTTP controller no debe conocer:

```text
opcode
stack
Semantic IR
```

---

## 528. APPLICATION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

APPLICATION BOUNDARY

Controller llama:

```text
AELExecutionService
```

---

## 529. TRANSACTION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TRANSACTION BOUNDARY

No mantener una única transacción PostgreSQL durante toda la ejecución si hay:

```text
external Providers
```

---

## 530. EXECUTION SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EXECUTION SNAPSHOT

Cuando sea necesario:

```text
load relevant data
```

en una transacción corta y ejecutar con snapshot.

---

## 531. CONSISTENCY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CONSISTENCY POLICY

Cada Rule debe declarar o heredar:

```text
consistency policy
```

si necesita datos de múltiples fuentes.

---

## 532. CROSS-SERVICE CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

CROSS-SERVICE CONSISTENCY

No asumir:

```text
distributed transaction
```

---

## 533. EVENTUAL CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

EVENTUAL CONSISTENCY

Si una fuente externa es eventual:

```text
Rule result
```

debe reflejar esa realidad explícitamente.

---

## 534. AUDITABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

AUDITABILITY

Execution record debe poder responder:

```text
qué Rule
qué versión
qué Artifact
qué tenant
qué actor
qué resultado
qué error
```

---

## 535. SENSITIVE RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

SENSITIVE RESULT

No almacenar automáticamente resultados sensibles completos.

Puede almacenarse:

```text
hash
summary
selected audit fields
```

según policy.

---

## 536. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

OBSERVABILITY

Métricas mínimas:

```text
ael_execution_total
ael_execution_success_total
ael_execution_failure_total
ael_provider_calls_total
ael_provider_errors_total
ael_execution_duration
```

---

## 537. LOG CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

LOG CORRELATION

Todos los logs deben soportar:

```text
correlationId
tenantId
ruleVersionId
artifactHash
```

siempre que no expongan información sensible.

---

## 538. HEALTH CHECK

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

HEALTH CHECK

Backend debe poder comprobar:

```text
AEL registries
Provider adapters
Function adapters
Artifact storage
```

---

## 539. STARTUP FAIL POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

STARTUP FAIL POLICY

Si falta una dependency crítica:

```text
startup failure
```

o servicio degradado explícitamente.

Nunca ocultar inconsistencia.

---

## 540. DEPLOYMENT

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

DEPLOYMENT

El despliegue debe garantizar compatibilidad:

```text
Runtime
+
Adapters
+
Contract versions
+
Function versions
```

---

## 541. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

BACKWARD COMPATIBILITY

Nuevo Runtime debe poder ejecutar Artifacts compatibles históricos.

---

## 542. BREAKING CHANGE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

BREAKING CHANGE

Si cambia:

```text
Artifact format
Contract semantics
Function signature
```

incrementar la versión correspondiente.

---

## 543. MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

MIGRATION

No modificar Artifacts históricos.

Crear:

```text
new compiled Artifact
```

si se requiere migración.

---

## 544. TEST MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

TEST MATRIX

Debe existir una matriz:

```text
AEL version
Artifact format
Runtime version
Contract version
Function version
```

---

## 545. INTEGRATION EXIT CRITERIA

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

INTEGRATION EXIT CRITERIA

```text
✓ ContractProvider adapter
✓ FunctionProvider adapter
✓ ExecutionContext builder
✓ Capability authorization
✓ Tenant propagation
✓ PostgreSQL integration
✓ RLS enforcement
✓ Supabase adapter where required
✓ Exact numeric mapping
✓ Money mapping
✓ Quantity mapping
✓ Dependency registry
✓ Version compatibility
✓ Error mapping
✓ Audit metadata
✓ Correlation propagation
✓ Timeout propagation
✓ Cancellation propagation
✓ Cross-tenant tests
✓ No AEL → infrastructure dependency
✓ DB-first integrity preserved
```

---

## 546. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

FINAL ARCHITECTURE

```text
┌──────────────────────────────────────────────┐
│                  AQUILA                      │
│                                              │
│  Application / Authorization / Audit         │
│                    │                         │
│                    ▼                         │
│          AEL Integration Layer               │
│                    │                         │
│        ┌───────────┴───────────┐             │
│        ▼                       ▼             │
│ Contract Adapters       Function Adapters   │
│        │                       │             │
│        └───────────┬───────────┘             │
│                    ▼                         │
│               AEL Runtime                   │
│                    │                         │
│               Verified Artifact              │
└────────────────────┼─────────────────────────┘
                     │
                     ▼
              PostgreSQL / Supabase
                     │
                     ▼
                    RLS
```

---

## 547. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PRINCIPIO DE AISLAMIENTO

AEL debe poder probarse completamente sin:

```text
PostgreSQL
Supabase
HTTP
Nuxt
```

---

## 548. PRINCIPIO DB-FIRST

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PRINCIPIO DB-FIRST

La integración nunca debe duplicar en TypeScript reglas que pertenecen a:

```text
PostgreSQL constraints
RLS
transactions
FK
```

---

## 549. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PRINCIPIO DE SEGURIDAD

La autorización debe ser:

```text
defense in depth
+
fail closed
```

---

## 550. PRINCIPIO DE TENANCY

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PRINCIPIO DE TENANCY

El tenant debe viajar explícitamente:

```text
Application
→ ExecutionContext
→ Provider
→ PostgreSQL
→ RLS
```

---

## 551. PRINCIPIO DE ABSTRACCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_AQUILA_Integration_Layer 29.md

PRINCIPIO DE ABSTRACCIÓN

AEL conoce:

```text
Contract
Function
Capability
Value
```

AQUILA conoce:

```text
PostgreSQL
Supabase
tables
queries
RLS
providers
```

---

## 552. OBJETIVO

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

OBJETIVO

Definir:

```text
Integration Layer
Contract Provider
Function Adapter
Registry
Execution Context
Tenant Isolation
PostgreSQL Boundary
External APIs
Error Mapping
Timeouts
Cancellation
Transactions
Caching
Observability
```

---

## 553. PRINCIPIO DE SEPARACIÓN

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PRINCIPIO DE SEPARACIÓN

AEL trabaja con:

```text
Contract
Function
AELValue
ExecutionContext
```

La infraestructura trabaja con:

```text
Provider
Adapter
Repository
Database
API Client
```

---

## 554. ARQUITECTURA

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

ARQUITECTURA

```text
                    AEL Runtime
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
   Contract Resolver           Function Resolver
          │                           │
          ▼                           ▼
   Contract Provider           Function Adapter
          │                           │
          └─────────────┬─────────────┘
                        ▼
                Integration Layer
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      PostgreSQL      APIs          Services
          │
          ▼
         RLS
```

---

## 555. AEL NO CONOCE IMPLEMENTACIONES

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

AEL NO CONOCE IMPLEMENTACIONES

Una Rule nunca debe saber:

```text
PostgreSQL
Supabase
REST
HTTP
Redis
Node.js
```

---

## 556. CONTRACT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONTRACT

Contract representa:

```text
dato o capability de negocio consultable
```

---

## 557. FUNCTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION

Function representa:

```text
operación semántica
```

que puede ser:

```text
pure
deterministic
contextual
external
```

según Registry.

---

## 558. PROVIDER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER

Provider implementa:

```text
Contract
```

fuera del lenguaje.

---

## 559. FUNCTION ADAPTER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION ADAPTER

Adapter implementa:

```text
Function
```

fuera del lenguaje.

---

## 560. INTERFACE CONTRACT PROVIDER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

INTERFACE CONTRACT PROVIDER

Conceptualmente:

```ts
interface ContractProvider {
  read(dependency: ContractDependency, context: ExecutionContext): Promise<AELValue>
}
```

---

## 561. PROVIDER RESULT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER RESULT

Debe devolver:

```text
AELValue
```

o un resultado que un adapter controlado pueda convertir.

---

## 562. PROVIDER NO DEVUELVE ANY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER NO DEVUELVE ANY

Evitar:

```ts
Promise<any>
```

como frontera pública.

---

## 563. FUNCTION ADAPTER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION ADAPTER

Conceptualmente:

```ts
interface FunctionAdapter {
  invoke(
    dependency: FunctionDependency,
    args: readonly AELValue[],
    context: ExecutionContext,
  ): Promise<AELValue>
}
```

---

## 564. READ-ONLY PROVIDERS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

READ-ONLY PROVIDERS

V1 prioriza Providers:

```text
read-only
```

---

## 565. WRITE PROVIDERS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

WRITE PROVIDERS

Si se habilitan:

```text
explicit capability
audit
transaction policy
idempotency
```

---

## 566. PROVIDER REGISTRY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER REGISTRY

Conceptualmente:

```ts
interface ContractProviderRegistry {
  resolve(dependency: ContractDependency): ContractProvider
}
```

---

## 567. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION REGISTRY

```ts
interface FunctionAdapterRegistry {
  resolve(dependency: FunctionDependency): FunctionAdapter
}
```

---

## 568. REGISTRY IMMUTABILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

REGISTRY IMMUTABILITY

Durante una execution:

```text
registry snapshot
```

debe ser estable.

---

## 569. PROVIDER IDENTITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER IDENTITY

Provider debe identificarse por:

```text
contractCode
providerVersion
implementationId
```

cuando corresponda.

---

## 570. PROVIDER VERSION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER VERSION

La implementación debe ser compatible con:

```text
Contract version
```

---

## 571. SEMANTIC COMPATIBILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SEMANTIC COMPATIBILITY

Actualizar Provider no debe alterar semántica declarada de un Contract sin:

```text
version change
```

cuando el cambio sea incompatible.

---

## 572. CONTRACT CONTRACT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONTRACT CONTRACT

Un Contract debe declarar:

```text
code
version
returnType
capabilities
```

---

## 573. PROVIDER VALIDATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER VALIDATION

Resolver debe verificar:

```text
dependency exists
version compatible
return type compatible
capabilities declared
```

---

## 574. CAPABILITY BOUNDARY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CAPABILITY BOUNDARY

Antes de Provider:

```text
ExecutionContext.capabilities
```

debe ser evaluado.

---

## 575. NO CAPABILITY ESCALATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO CAPABILITY ESCALATION

Provider no puede:

```text
grant capability
```

---

## 576. TENANT CONTEXT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TENANT CONTEXT

Provider siempre recibe:

```text
context.tenantId
```

---

## 577. TENANT SOURCE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TENANT SOURCE

El tenant proviene de:

```text
trusted application authentication/session
```

no del Artifact.

---

## 578. TENANT OVERRIDE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TENANT OVERRIDE

Provider debe rechazar cualquier intento de sustituir:

```text
tenantId
```

por un valor proveniente de AEL.

---

## 579. POSTGRESQL PROVIDER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

POSTGRESQL PROVIDER

Para datos AQUILA:

```text
Contract Provider
→ repository/data access
→ PostgreSQL/Supabase
```

---

## 580. RLS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

RLS

La consulta debe ejecutarse bajo:

```text
PostgreSQL RLS
```

cuando corresponda.

---

## 581. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DEFENSE IN DEPTH

```text
AEL Capability
+
ExecutionContext
+
Provider
+
RLS
```

---

## 582. NO SQL IN AEL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO SQL IN AEL

AEL nunca genera:

```text
SQL
```

directamente.

---

## 583. NO SQL FROM SOURCE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO SQL FROM SOURCE

Una Rule no puede contener:

```text
SELECT
INSERT
UPDATE
DELETE
```

como mecanismo de acceso.

---

## 584. QUERY OWNERSHIP

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

QUERY OWNERSHIP

La consulta pertenece al:

```text
Contract Provider
```

---

## 585. SQL PARAMETERIZATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SQL PARAMETERIZATION

Provider debe usar:

```text
parameterized queries
```

o APIs seguras equivalentes.

---

## 586. NO STRING SQL CONCATENATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO STRING SQL CONCATENATION

Evitar:

```text
"SELECT ... " + input
```

---

## 587. SUPABASE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SUPABASE

Si la implementación usa Supabase:

```text
Supabase client
```

queda detrás del Provider/Repository boundary.

---

## 588. AEL INDEPENDENCE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

AEL INDEPENDENCE

AEL no depende de:

```text
Supabase SDK
```

---

## 589. DATABASE REPOSITORY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DATABASE REPOSITORY

Provider puede delegar:

```text
Contract Provider
→ Repository
→ Database Adapter
```

---

## 590. REPOSITORY RESPONSIBILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

REPOSITORY RESPONSIBILITY

Repository conoce:

```text
tables
queries
joins
database types
```

pero no conoce:

```text
AEL syntax
```

---

## 591. PROVIDER RESPONSIBILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER RESPONSIBILITY

Provider traduce:

```text
database/domain result
→ AELValue
```

---

## 592. TYPE MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TYPE MAPPING

Ejemplo:

```text
numeric
→ AEL Number
```

---

## 593. MONEY MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

MONEY MAPPING

```text
amount + currency
→ Money
```

---

## 594. QUANTITY MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

QUANTITY MAPPING

```text
amount + unit + dimension
→ Quantity
```

---

## 595. NULL MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NULL MAPPING

Database NULL:

```text
→ AEL Null
```

cuando el Contract sea nullable.

---

## 596. NULLABILITY CONTRACT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NULLABILITY CONTRACT

Si Contract declara:

```text
T
```

Provider no debe devolver:

```text
Nullable<T>
```

sin que esté declarado.

---

## 597. RECORD MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

RECORD MAPPING

Database record:

```text
→ AEL Record
```

con schema conocido.

---

## 598. NO RAW DATABASE OBJECT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO RAW DATABASE OBJECT

No devolver:

```text
database row object
```

directamente.

---

## 599. DATA MINIMIZATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DATA MINIMIZATION

Provider sólo debe obtener:

```text
fields required by Contract
```

cuando sea posible.

---

## 600. SECURITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SECURITY

Evitar traer:

```text
password
tokens
secrets
internal credentials
```

a AEL.

---

## 601. SENSITIVE FIELD

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SENSITIVE FIELD

Fields sensibles deben quedar fuera del Contract salvo necesidad explícita.

---

## 602. EXTERNAL API PROVIDER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

EXTERNAL API PROVIDER

Un Provider puede acceder a:

```text
REST
GraphQL
SOAP
```

si está autorizado.

---

## 603. HTTP CLIENT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

HTTP CLIENT

HTTP queda dentro del:

```text
Provider Adapter
```

---

## 604. URL CONTROL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

URL CONTROL

AEL no puede suministrar libremente:

```text
arbitrary URL
```

para ejecutar requests.

---

## 605. ALLOWLIST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

ALLOWLIST

Endpoints externos deben pertenecer a:

```text
trusted configuration
```

---

## 606. SSRF PROTECTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SSRF PROTECTION

Provider HTTP debe impedir:

```text
internal network access
metadata endpoints
localhost
private ranges
```

cuando la arquitectura lo requiera.

---

## 607. TIMEOUT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TIMEOUT

External calls deben respetar:

```text
execution deadline
```

---

## 608. CANCELLATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CANCELLATION

Propagar:

```text
AbortSignal
```

---

## 609. RETRIES

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

RETRIES

Retries sólo cuando:

```text
operation safe
idempotent
policy permits
```

---

## 610. NO GLOBAL RETRY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO GLOBAL RETRY

AEL Runtime no define retry universal.

---

## 611. ERROR MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

ERROR MAPPING

Provider traduce:

```text
database/API error
→ AEL Provider Error
```

---

## 612. ERROR CODES

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

ERROR CODES

Ejemplos:

```text
AEL-PROVIDER-001 Provider unavailable
AEL-PROVIDER-002 Invalid result
AEL-PROVIDER-003 Timeout
AEL-PROVIDER-004 Dependency unavailable
AEL-PROVIDER-005 External service error
```

---

## 613. SAFE ERROR MESSAGE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SAFE ERROR MESSAGE

No exponer:

```text
connection string
SQL
tokens
internal host
```

---

## 614. INTERNAL CAUSE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

INTERNAL CAUSE

Mantener cause interno para observabilidad.

---

## 615. TRANSACTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TRANSACTION

Provider puede utilizar transacción:

```text
local operation
```

cuando sea necesario.

---

## 616. TRANSACTION OWNER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TRANSACTION OWNER

La transacción pertenece a:

```text
Integration Layer
```

no al AEL expression.

---

## 617. AEL TRANSACTION CONTROL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

AEL TRANSACTION CONTROL

AEL no controla:

```text
BEGIN
COMMIT
ROLLBACK
```

---

## 618. DISTRIBUTED TRANSACTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DISTRIBUTED TRANSACTION

No asumir:

```text
distributed transaction
```

entre Providers.

---

## 619. WRITE OPERATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

WRITE OPERATION

Write Provider requiere:

```text
capability
audit
idempotency
transaction policy
```

---

## 620. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

IDEMPOTENCY

Para writes:

```text
requestId
idempotencyKey
```

pueden utilizarse.

---

## 621. READ CONSISTENCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

READ CONSISTENCY

Contract debe documentar si necesita:

```text
strong consistency
eventual consistency
```

cuando sea relevante.

---

## 622. CACHE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CACHE

Integration Layer puede implementar:

```text
Provider cache
```

---

## 623. CACHE SAFETY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CACHE SAFETY

Cache key debe incluir:

```text
tenantId
contract identity
relevant context
parameters
```

---

## 624. NO CROSS-TENANT CACHE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO CROSS-TENANT CACHE

Nunca reutilizar datos de otro tenant.

---

## 625. CACHE TTL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CACHE TTL

TTL pertenece a:

```text
Provider policy
```

---

## 626. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CACHE INVALIDATION

Cuando los datos sean mutables:

```text
invalidation strategy
```

debe estar definida.

---

## 627. FUNCTION CACHE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION CACHE

Functions pure/deterministic pueden cachearse.

---

## 628. EXTERNAL FUNCTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

EXTERNAL FUNCTION

No cachear externals por defecto.

---

## 629. OBSERVABILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

OBSERVABILITY

Cada Provider call debe poder producir:

```text
executionId
tenantId
contract
provider
duration
status
```

según privacy policy.

---

## 630. CORRELATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CORRELATION

Propagar:

```text
requestId
correlationId
executionId
```

---

## 631. METRICS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

METRICS

```text
provider_call_total
provider_call_duration
provider_call_error_total
provider_timeout_total
```

---

## 632. DATABASE METRICS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DATABASE METRICS

Registrar métricas de:

```text
query duration
error
connection pool
```

en infraestructura, no como datos AEL.

---

## 633. SENSITIVE LOGGING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SENSITIVE LOGGING

No registrar automáticamente:

```text
arguments
results
credentials
```

sensibles.

---

## 634. REDACTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

REDACTION

Integration Layer debe soportar:

```text
redaction policy
```

---

## 635. PROVIDER HEALTH

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER HEALTH

Providers externos pueden tener:

```text
health status
```

---

## 636. CIRCUIT BREAKER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CIRCUIT BREAKER

Puede utilizarse fuera de Runtime para:

```text
external unstable services
```

---

## 637. CIRCUIT BREAKER

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CIRCUIT BREAKER

No debe cambiar la semántica de un Contract silenciosamente.

---

## 638. FALLBACK

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FALLBACK

Fallback sólo si:

```text
Contract semantics
```

permiten una fuente alternativa.

---

## 639. NO SILENT FALLBACK

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO SILENT FALLBACK

No sustituir datos por otra fuente sin política explícita.

---

## 640. PROVIDER FACTORY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER FACTORY

Puede utilizarse:

```text
ProviderFactory
```

para construir adapters.

---

## 641. DEPENDENCY INJECTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DEPENDENCY INJECTION

Integration Layer puede utilizar:

```text
Dependency Injection
```

---

## 642. TEST PROVIDERS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TEST PROVIDERS

Debe existir:

```text
MockContractProvider
FakeContractProvider
```

para pruebas.

---

## 643. TEST FUNCTIONS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TEST FUNCTIONS

```text
MockFunctionAdapter
FakeFunctionAdapter
```

---

## 644. CONTRACT CONTRACT TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONTRACT CONTRACT TEST

Cada Provider debe demostrar:

```text
return type compatibility
tenant isolation
error mapping
```

---

## 645. PROVIDER CONTRACT TESTS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER CONTRACT TESTS

Fixture:

```text
ContractDependency
ExecutionContext
Expected AELValue
```

---

## 646. DATABASE TESTS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DATABASE TESTS

Probar:

```text
RLS
tenant isolation
NULL
numeric
money
quantity
```

---

## 647. CROSS-TENANT TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CROSS-TENANT TEST

Tenant A no puede recibir:

```text
Tenant B data
```

---

## 648. CAPABILITY TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CAPABILITY TEST

Sin capability:

```text
Provider invocation denied
```

---

## 649. TIMEOUT TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TIMEOUT TEST

Provider lento:

```text
execution timeout
```

---

## 650. CANCELLATION TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CANCELLATION TEST

AbortSignal:

```text
provider cancelled
```

---

## 651. ERROR TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

ERROR TEST

Database/API failure:

```text
AEL-PROVIDER-xxx
```

---

## 652. SERIALIZATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SERIALIZATION

Provider result debe convertirse a:

```text
canonical AELValue
```

---

## 653. NO JS OBJECT LEAK

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO JS OBJECT LEAK

No exponer internamente:

```text
Date
Buffer
Response
Request
DatabaseRow
```

como AELValue.

---

## 654. DATE/TIME

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DATE/TIME

Si se soporta DateTime:

```text
AEL DateTime
```

debe tener semántica propia.

---

## 655. TIMEZONE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TIMEZONE

DateTime debe conservar:

```text
timezone/offset
```

según Type System.

---

## 656. CURRENCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CURRENCY

Money debe conservar:

```text
currency
```

---

## 657. UNIT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

UNIT

Quantity debe conservar:

```text
unit
dimension
```

---

## 658. DECIMAL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DECIMAL

No convertir automáticamente:

```text
Decimal
→ JavaScript Number
```

si se pierde precisión.

---

## 659. PROVIDER SECURITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER SECURITY

Provider no puede ejecutar:

```text
arbitrary AEL
```

---

## 660. REENTRANCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

REENTRANCY

Provider no debe invocar el Runtime recursivamente salvo mecanismo explícitamente diseñado.

---

## 661. NO RECURSIVE AEL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO RECURSIVE AEL

V1 no permite:

```text
Contract → AEL → Contract → AEL
```

como mecanismo de ejecución recursiva.

---

## 662. PROVIDER DEPENDENCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER DEPENDENCY

Provider puede depender de:

```text
Repository
API Client
Cache
```

pero no del:

```text
Compiler
```

---

## 663. FUNCTION ADAPTER DEPENDENCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION ADAPTER DEPENDENCY

Adapter puede utilizar:

```text
domain service
```

sin conocer internals del Compiler.

---

## 664. LAYERING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

LAYERING

```text
AEL
 ↓
Runtime
 ↓
Integration Layer
 ↓
Domain / Infrastructure
```

---

## 665. NO INVERSE DEPENDENCY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO INVERSE DEPENDENCY

Infrastructure no debe importar:

```text
AEL Parser
```

para realizar una operación normal.

---

## 666. DOMAIN MAPPING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DOMAIN MAPPING

Provider puede utilizar:

```text
Domain Model
```

antes de producir AELValue.

---

## 667. MULTI-TENANT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

MULTI-TENANT

Cada Provider debe definir:

```text
tenant-aware behavior
```

---

## 668. GLOBAL CONTRACT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

GLOBAL CONTRACT

Un Contract global puede existir si:

```text
data is explicitly global
```

---

## 669. GLOBAL DATA

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

GLOBAL DATA

Global no significa:

```text
tenant override
```

Debe estar explícitamente definido.

---

## 670. TENANT-SCOPED CONTRACT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TENANT-SCOPED CONTRACT

Default recomendado:

```text
tenant scoped
```

---

## 671. CONTEXT PROPAGATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONTEXT PROPAGATION

Context debe propagarse:

```text
Runtime
→ Provider
→ Repository/API
```

---

## 672. REQUEST CONTEXT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

REQUEST CONTEXT

No reconstruir:

```text
tenantId
actorId
```

desde inputs de AEL.

---

## 673. SECURITY CONTEXT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SECURITY CONTEXT

Authentication context debe ser independiente del Artifact.

---

## 674. AUDIT CONTEXT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

AUDIT CONTEXT

Write Providers deben registrar:

```text
actor
tenant
request
execution
```

---

## 675. PROVIDER LIFECYCLE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER LIFECYCLE

```text
Registered
→ Resolved
→ Invoked
→ Completed
```

---

## 676. PROVIDER FAILURE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER FAILURE

Puede terminar en:

```text
Failed
```

sin corromper ExecutionState.

---

## 677. RESOURCE CLEANUP

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

RESOURCE CLEANUP

Provider debe liberar:

```text
connections
sockets
streams
```

cuando corresponda.

---

## 678. CONNECTION POOL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONNECTION POOL

Database connections deben administrarse:

```text
outside AEL
```

---

## 679. API CLIENT POOL

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

API CLIENT POOL

HTTP clients pueden compartirse si son:

```text
thread-safe
```

---

## 680. CONFIGURATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONFIGURATION

Provider configuration debe residir:

```text
application configuration / secret manager
```

---

## 681. NO SECRETS IN ARTIFACT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO SECRETS IN ARTIFACT

Artifact nunca debe contener:

```text
API keys
passwords
database credentials
```

---

## 682. SECRET RESOLUTION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SECRET RESOLUTION

Provider obtiene secrets desde:

```text
trusted configuration
```

---

## 683. TENANT SECRETS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

TENANT SECRETS

Si existen secrets por tenant:

```text
trusted secret store
```

debe resolverlos mediante contexto controlado.

---

## 684. NO SECRET INPUT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO SECRET INPUT

AEL input no debe ser mecanismo para entregar:

```text
provider credentials
```

---

## 685. EXTERNAL SERVICE ALLOWLIST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

EXTERNAL SERVICE ALLOWLIST

Endpoints deben estar definidos:

```text
configuration
```

no por Source.

---

## 686. SSRF

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SSRF

Provider HTTP debe bloquear:

```text
127.0.0.1
localhost
169.254.169.254
private IP ranges
```

cuando corresponda a la infraestructura.

---

## 687. DNS REBINDING

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DNS REBINDING

Si existe acceso HTTP configurable:

```text
resolve and validate destination
```

debe impedir bypass de allowlist.

---

## 688. RESPONSE LIMIT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

RESPONSE LIMIT

External Provider debe limitar:

```text
response size
```

---

## 689. DATABASE RESULT LIMIT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DATABASE RESULT LIMIT

Provider debe limitar:

```text
rows
payload
```

cuando Contract no requiera colección completa.

---

## 690. PAGINATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PAGINATION

Para grandes datasets:

```text
Provider
```

debe aplicar estrategia de paginación fuera de AEL.

---

## 691. NO UNBOUNDED RESULT

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO UNBOUNDED RESULT

Contract no debe devolver estructuras ilimitadas sin policy.

---

## 692. PROVIDER PERFORMANCE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER PERFORMANCE

Provider debe medir:

```text
latency
error rate
payload size
```

---

## 693. PROVIDER SLO

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER SLO

Los Providers críticos pueden tener:

```text
SLO
timeout
availability target
```

---

## 694. DEGRADED MODE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

DEGRADED MODE

Si un Provider no está disponible:

```text
fail explicitly
```

salvo fallback definido.

---

## 695. NO FAKE DATA

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

NO FAKE DATA

Nunca devolver:

```text
0
NULL
empty
```

como sustituto silencioso de un servicio fallido.

---

## 696. CONTRACT SEMANTICS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

CONTRACT SEMANTICS

El Contract define:

```text
what
```

Provider define:

```text
how
```

---

## 697. FUNCTION SEMANTICS

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FUNCTION SEMANTICS

Function Registry define:

```text
meaning
```

Adapter define:

```text
implementation
```

---

## 698. REPLACEABILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

REPLACEABILITY

Un Provider puede reemplazarse sin modificar:

```text
AEL Source
```

si conserva:

```text
Contract semantics
```

---

## 699. PROVIDER VERSION MIGRATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PROVIDER VERSION MIGRATION

Cambio incompatible:

```text
new provider version
```

y posiblemente:

```text
new Contract version
```

---

## 700. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

BACKWARD COMPATIBILITY

Provider nuevo puede soportar Artifacts existentes si:

```text
semantic contract preserved
```

---

## 701. INTEGRATION TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

INTEGRATION TEST

End-to-end:

```text
AEL
→ Artifact
→ Runtime
→ Provider
→ PostgreSQL
→ RLS
→ AELValue
```

---

## 702. SECURITY TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

SECURITY TEST

Debe comprobar:

```text
tenant isolation
capability enforcement
secret isolation
SSRF protection
SQL injection protection
```

---

## 703. FAILURE TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FAILURE TEST

Debe comprobar:

```text
timeout
cancellation
database error
API error
invalid result
```

---

## 704. OBSERVABILITY TEST

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

OBSERVABILITY TEST

Verificar:

```text
executionId
requestId
correlationId
provider metrics
```

---

## 705. EXIT CRITERIA — AEL-INTEGRATION

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

EXIT CRITERIA — AEL-INTEGRATION

```text
✓ Contract Provider
✓ Function Adapter
✓ Registry
✓ Dependency Resolution
✓ Capability Boundary
✓ Tenant Context
✓ PostgreSQL Boundary
✓ RLS
✓ Repository Layer
✓ API Provider
✓ SSRF protection
✓ Timeouts
✓ Cancellation
✓ Error Mapping
✓ Transactions
✓ Idempotency
✓ Cache
✓ Observability
✓ Audit
✓ Secret isolation
✓ Data minimization
✓ Multi-tenant isolation
✓ Provider testing
✓ Integration testing
```

---

## 706. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

FINAL ARCHITECTURE

```text
                         AEL
                          │
                          ▼
                       Runtime
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
       Contract Resolver        Function Resolver
             │                         │
             ▼                         ▼
       Contract Provider        Function Adapter
             │                         │
             └────────────┬────────────┘
                          ▼
                   Integration Layer
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
        PostgreSQL       HTTP        Services
             │
             ▼
            RLS
```

---

## 707. PRINCIPIO DE ABSTRACCIÓN

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PRINCIPIO DE ABSTRACCIÓN

AEL conoce:

```text
Contract
Function
```

no:

```text
PostgreSQL
HTTP
Supabase
```

---

## 708. PRINCIPIO DE AUTORIDAD

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PRINCIPIO DE AUTORIDAD

Integration Layer no puede elevar:

```text
capabilities
tenant
actor
```

---

## 709. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PRINCIPIO DE AISLAMIENTO

Cada external operation debe conservar:

```text
tenant
actor
request
execution
```

cuando corresponda.

---

## 710. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PRINCIPIO DE SEGURIDAD

Secrets viven:

```text
fuera del Artifact
```

---

## 711. PRINCIPIO DE REEMPLAZABILIDAD

> **Origen:** Motor de liquidacion_Integration Layer & Provider Architecture 40.md

PRINCIPIO DE REEMPLAZABILIDAD

Provider puede cambiar sin cambiar AEL cuando:

```text
Contract semantics remain compatible
```

---
