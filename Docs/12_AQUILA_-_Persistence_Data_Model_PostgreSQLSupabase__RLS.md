# AEL V1 — AQUILA — Persistence, Data Model, PostgreSQL/Supabase & RLS

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
12 — Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md
19 — Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md
41 — Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

OBJETIVO

Definir el modelo persistente para:

```text
Rules
Rule Versions
Sources
Artifacts
Dependencies
Tests
Test Results
Executions
Snapshots
Contracts
Functions
Publication
Approvals
Audit
```

manteniendo:

```text
tenant isolation
RLS
immutability
versioning
auditability
```

---

## 2. PRINCIPIO DE MODELADO

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PRINCIPIO DE MODELADO

Separar claramente:

```text
Definition
Version
Execution
Audit
Infrastructure
```

No mezclar estas responsabilidades en una sola tabla.

---

## 3. ENTIDADES PRINCIPALES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ENTIDADES PRINCIPALES

Modelo conceptual:

```text
rules
   │
   └── rule_versions
          │
          ├── rule_sources
          ├── rule_artifacts
          ├── rule_dependencies
          ├── rule_capabilities
          └── rule_tests
                    │
                    └── test_results

rule_versions
       │
       └── executions
               │
               └── snapshots

contracts
functions
providers
security_policies
```

---

## 4. RULE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE

Representa la identidad lógica de una regla.

No representa una versión concreta.

Campos conceptuales:

```text
id
tenant_id
code
name
description
scope
status
created_by
created_at
updated_at
```

---

## 5. RULE ID

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE ID

Debe utilizarse UUID o equivalente no predecible.

No utilizar:

```text
1
2
3
```

como identificador público.

---

## 6. TENANT_ID

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TENANT_ID

Toda regla tenant-scoped debe tener:

```text
tenant_id
```

Las reglas globales pueden utilizar:

```text
tenant_id = NULL
```

si la arquitectura de AQUILA mantiene ese patrón.

---

## 7. GLOBAL VS TENANT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

GLOBAL VS TENANT

No interpretar `NULL` automáticamente como acceso global.

El acceso global debe depender de:

```text
scope
+
authorization
```

---

## 8. RULE CODE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE CODE

Ejemplo:

```text
CUOTA_ADMIN
INTERES_MORA
DESCUENTO_PRONTO_PAGO
```

Debe ser único dentro de su scope.

---

## 9. UNIQUE CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

UNIQUE CONSTRAINT

Conceptualmente:

```text
UNIQUE(scope, tenant_id, code)
```

La implementación PostgreSQL puede requerir índices parciales para manejar correctamente:

```text
tenant_id IS NULL
```

---

## 10. RULE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE VERSION

Representa una versión inmutable de una regla.

Campos conceptuales:

```text
id
rule_id
version_number
status
compiler_version
language_version
runtime_version
created_by
created_at
published_at
```

---

## 11. VERSION NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

VERSION NUMBER

Debe ser monotónico:

```text
1
2
3
4
```

No reutilizar números eliminados.

---

## 12. VERSION IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

VERSION IMMUTABILITY

Después de:

```text
PUBLISHED
```

no modificar:

```text
source
artifact
dependencies
capabilities
```

---

## 13. DRAFT MUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DRAFT MUTABILITY

Un Draft puede modificarse.

Pero al crear una nueva versión publicada:

```text
Draft
 ↓
RuleVersion
```

se congela la evidencia de compilación.

---

## 14. SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SOURCE

Puede almacenarse como:

```text
TEXT
```

porque el Source AEL es texto.

Debe conservarse exactamente para:

```text
audit
reproduction
debugging
```

---

## 15. SOURCE HASH

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SOURCE HASH

Cada Source puede tener:

```text
source_hash
```

para detectar modificaciones y facilitar identificación.

---

## 16. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARTIFACT

El Artifact debe almacenarse como:

```text
BYTEA
```

o un formato textual/binario equivalente.

La elección final depende de la implementación del Artifact.

---

## 17. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARTIFACT HASH

Obligatorio:

```text
artifact_hash
```

El hash debe calcularse sobre la representación canónica del Artifact.

---

## 18. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARTIFACT STORAGE

Dos estrategias válidas:

```text
PostgreSQL BYTEA
```

o:

```text
Supabase Storage
```

Recomendación V1:

```text
metadata → PostgreSQL
artifact → PostgreSQL o Storage según tamaño
```

No introducir Storage sólo por anticipación.

---

## 19. ARTIFACT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARTIFACT METADATA

Debe poder consultarse sin cargar el Artifact completo:

```text
artifact_hash
format_version
compiler_version
runtime_version
size_bytes
```

---

## 20. DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DEPENDENCIES

No almacenar únicamente una lista textual.

Debe existir información estructurada:

```text
dependency_type
dependency_id
dependency_version
```

---

## 21. DEPENDENCY TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DEPENDENCY TYPES

Ejemplos:

```text
CONTRACT
FUNCTION
```

Futuras categorías pueden agregarse.

---

## 22. CONTRACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONTRACT VERSION

Una dependencia debe apuntar a una versión concreta cuando la semántica lo requiera.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE@1
```

---

## 23. FUNCTION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

FUNCTION VERSION

Igualmente:

```text
REDONDEAR_DINERO@1
```

---

## 24. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CAPABILITIES

Las capabilities derivadas del Artifact deben conservarse como evidencia.

Ejemplo:

```text
READ_PROPERTY
READ_PARAMETER
```

---

## 25. NO TRUST DERIVED TABLES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

NO TRUST DERIVED TABLES

Aunque se almacenen:

```text
dependencies
capabilities
```

el Runtime debe utilizar el Artifact verificado como autoridad operacional.

La base contiene:

```text
metadata / evidence
```

---

## 26. TEST CASE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TEST CASE

Cada regla puede tener múltiples tests.

Campos conceptuales:

```text
id
rule_version_id
code
name
description
input
expected_result
expected_type
enabled
created_at
```

---

## 27. TEST INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TEST INPUT

Debe utilizar un formato estructurado, preferiblemente:

```text
JSONB
```

para facilitar evolución.

---

## 28. EXPECTED RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXPECTED RESULT

También puede utilizar:

```text
JSONB
```

porque el resultado AEL puede ser:

```text
scalar
money
quantity
boolean
list
record
```

según el modelo V1 definitivo.

---

## 29. TEST RESULTS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TEST RESULTS

No necesariamente persistir cada ejecución de test.

Se recomienda distinguir:

```text
Test Definition
```

de:

```text
Test Run
```

---

## 30. TEST RUN

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TEST RUN

Cuando se necesite conservar evidencia:

```text
test_run
test_id
execution_id
status
actual_result
diagnostics
duration
created_at
```

---

## 31. EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION

Representa una ejecución de una RuleVersion.

Campos conceptuales:

```text
id
tenant_id
rule_id
rule_version_id
status
trigger
actor_id
started_at
finished_at
duration_ms
artifact_hash
result
error_code
```

---

## 32. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION ID

Debe ser UUID.

Es el identificador principal de correlación.

---

## 33. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION STATUS

Estados:

```text
QUEUED
RUNNING
COMPLETED
FAILED
CANCELLED
TIMEOUT
```

---

## 34. EXECUTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION RESULT

El resultado debe poder almacenarse estructuradamente.

Preferencia V1:

```text
JSONB
```

acompañado de:

```text
result_type
```

---

## 35. ERROR DATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ERROR DATA

Guardar:

```text
error_code
error_message
```

pero evitar almacenar automáticamente:

```text
stack trace
secrets
SQL
credentials
```

---

## 36. EXECUTION INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION INPUT

No necesariamente guardar todo el contexto.

Debe existir política:

```text
NO_RETENTION
METADATA_ONLY
SNAPSHOT
```

según criticidad y privacidad.

---

## 37. SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SNAPSHOT

Representa un conjunto inmutable de datos utilizado para reproducir una ejecución.

Campos conceptuales:

```text
id
tenant_id
snapshot_hash
source_type
payload
created_at
```

---

## 38. SNAPSHOT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SNAPSHOT IMMUTABILITY

Un Snapshot utilizado para auditoría debe ser inmutable.

---

## 39. SNAPSHOT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SNAPSHOT HASH

Debe tener:

```text
snapshot_hash
```

para verificar integridad.

---

## 40. SNAPSHOT SENSITIVITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SNAPSHOT SENSITIVITY

Los snapshots pueden contener datos de negocio sensibles.

Por tanto:

```text
access controlled
encrypted where appropriate
retention controlled
```

---

## 41. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONTRACT REGISTRY

Debe existir un catálogo persistente de Contracts.

Conceptualmente:

```text
contracts
```

con:

```text
id
code
version
scope
type
dimension
nullable
status
provider_key
```

---

## 42. CONTRACT CODE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONTRACT CODE

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
PARAMETER.TARIFA_M2
OWNER.OUTSTANDING_BALANCE
```

---

## 43. CONTRACT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONTRACT TYPE

Debe poder persistir información semántica suficiente para tooling:

```text
MONEY
QUANTITY
BOOLEAN
STRING
DATE
DATETIME
```

---

## 44. CONTRACT DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONTRACT DIMENSION

Cuando aplique:

```text
AREA
MASS
TIME
RATE
```

---

## 45. CONTRACT STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONTRACT STATUS

```text
ACTIVE
DEPRECATED
REVOKED
```

---

## 46. PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PROVIDER KEY

El Contract puede declarar:

```text
provider_key
```

pero el Source no controla ese valor.

---

## 47. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

FUNCTION REGISTRY

Catálogo de Functions:

```text
functions
```

con:

```text
id
code
version
input_signature
output_type
status
implementation_key
```

---

## 48. IMPLEMENTATION KEY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

IMPLEMENTATION KEY

Nunca almacenar:

```text
javascript code
```

arbitrario como implementación de Function.

Usar:

```text
registered implementation key
```

resuelta por infraestructura.

---

## 49. PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PROVIDERS

El registro de Providers puede ser principalmente de infraestructura.

No necesariamente necesita exponerse completamente al usuario.

Puede persistirse:

```text
provider_key
version
status
```

si el sistema de deployment lo requiere.

---

## 50. SECURITY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SECURITY POLICY

La política puede persistirse como configuración versionada:

```text
security_policies
```

pero el Runtime debe cargar una versión válida y autorizada.

---

## 51. PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PUBLICATION

Debe existir evidencia de publicación.

Conceptualmente:

```text
publication
```

con:

```text
rule_version_id
published_by
approved_by
published_at
artifact_hash
```

---

## 52. APPROVAL

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

APPROVAL

Si el workflow requiere aprobación:

```text
rule_approvals
```

puede registrar:

```text
rule_version_id
actor_id
decision
comment
created_at
```

---

## 53. MAKER-CHECKER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

MAKER-CHECKER

Para reglas críticas:

```text
created_by != approved_by
```

si la política lo exige.

---

## 54. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AUDIT

No mezclar auditoría con estado actual.

El audit debe ser append-only desde el punto de vista lógico.

---

## 55. AUDIT EVENT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AUDIT EVENT

Campos:

```text
id
tenant_id
actor_id
entity_type
entity_id
action
metadata
created_at
```

---

## 56. AUDIT ACTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AUDIT ACTIONS

Ejemplos:

```text
RULE_CREATED
RULE_UPDATED
VERSION_CREATED
VERSION_VALIDATED
VERSION_APPROVED
VERSION_PUBLISHED
VERSION_DEPRECATED
EXECUTION_STARTED
EXECUTION_COMPLETED
EXECUTION_FAILED
```

---

## 57. AUDIT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AUDIT METADATA

Puede utilizar:

```text
JSONB
```

para información adicional.

No guardar secretos.

---

## 58. TENANT ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TENANT ISOLATION

Toda tabla con datos tenant-scoped debe tener:

```text
tenant_id
```

cuando sea necesario para RLS eficiente y explícito.

---

## 59. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RLS

Las tablas tenant-scoped deben tener RLS habilitado.

Ejemplo conceptual:

```text
tenant_id = authenticated user's tenant
```

La implementación concreta debe respetar el modelo de claims de AQUILA.

---

## 60. RLS PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RLS PRINCIPLE

RLS es:

```text
defense in depth
```

No reemplaza:

```text
application authorization
```

---

## 61. SERVICE ROLE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SERVICE ROLE

Si el backend utiliza una credencial privilegiada:

```text
service role
```

la capa de aplicación debe realizar autorización explícita antes de acceder.

---

## 62. NO CLIENT WRITE TO ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

NO CLIENT WRITE TO ARTIFACT

El navegador no debe poder modificar directamente:

```text
published artifact
```

aunque conozca:

```text
storage path
```

---

## 63. STORAGE POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

STORAGE POLICY

Si se utiliza Supabase Storage:

```text
published artifacts
```

deben tener políticas que impidan escritura arbitraria por usuarios.

---

## 64. INDEXES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

INDEXES

Índices recomendados:

```text
rules(tenant_id, code)
rule_versions(rule_id, version_number)
rule_dependencies(rule_version_id)
rule_capabilities(rule_version_id)
rule_tests(rule_version_id)
executions(tenant_id, created_at)
executions(rule_version_id, created_at)
audit_events(tenant_id, created_at)
```

---

## 65. PARTIAL INDEXES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PARTIAL INDEXES

Para estados como:

```text
PUBLISHED
```

pueden utilizarse índices parciales cuando mejoren las consultas.

---

## 66. UNIQUE PUBLISHED VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

UNIQUE PUBLISHED VERSION

La plataforma debe garantizar que una Rule no tenga dos versiones simultáneamente consideradas:

```text
ACTIVE PUBLISHED
```

si el modelo funcional establece una única versión activa.

---

## 67. ACTIVE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ACTIVE VERSION

No asumir que:

```text
MAX(version_number)
```

es la versión activa.

Debe existir estado explícito.

---

## 68. RULE RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE RESOLUTION

Para ejecutar:

```text
Rule code
```

el backend debe resolver:

```text
Rule
→ active published RuleVersion
```

según tenant y política.

---

## 69. EXECUTION REFERENCES VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION REFERENCES VERSION

Una ejecución debe apuntar siempre a:

```text
rule_version_id
```

Nunca sólo a:

```text
rule_id
```

---

## 70. HISTORICAL REPRODUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

HISTORICAL REPRODUCTION

Una ejecución histórica debe poder identificar:

```text
rule_version
artifact
contracts
functions
runtime
snapshot
```

según la política de retención.

---

## 71. DEPENDENCY SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DEPENDENCY SNAPSHOT

Para máxima reproducibilidad puede almacenarse:

```text
dependency_manifest
```

en la RuleVersion.

---

## 72. MANIFEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

MANIFEST

Ejemplo conceptual:

```json
{
  "contracts": ["PROPERTY.AREA_PRIVATE@1", "PARAMETER.TARIFA_M2@1"],
  "functions": ["REDONDEAR_DINERO@1"]
}
```

---

## 73. CANONICAL MANIFEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CANONICAL MANIFEST

El manifest debe tener una representación canónica para permitir:

```text
hash
comparison
audit
```

---

## 74. RULE VERSION FINGERPRINT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE VERSION FINGERPRINT

Puede existir un fingerprint derivado de:

```text
source_hash
artifact_hash
dependency_manifest
compiler_version
```

---

## 75. NO REBUILD FOR HISTORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

NO REBUILD FOR HISTORY

No reconstruir un Artifact histórico únicamente desde Source si:

```text
compiler version
```

pudo cambiar.

Conservar el Artifact publicado.

---

## 76. COMPILER ARTIFACT RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

COMPILER ARTIFACT RETENTION

El Artifact publicado debe mantenerse mientras la RuleVersion sea necesaria para:

```text
execution
audit
history
```

---

## 77. DRAFT CLEANUP

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DRAFT CLEANUP

Los drafts abandonados pueden tener política de:

```text
retention
archive
purge
```

---

## 78. TEST RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TEST RETENTION

Los tests asociados a una RuleVersion publicada deben conservarse mientras sean necesarios para demostrar conformidad de esa versión.

---

## 79. EXECUTION RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXECUTION RETENTION

Debe definirse por política de negocio.

No conservar indefinidamente por defecto.

---

## 80. AUDIT RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AUDIT RETENTION

Debe cumplir las necesidades:

```text
operativas
legales
regulatorias
```

cuando apliquen.

---

## 81. SOFT DELETE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SOFT DELETE

Para entidades de configuración puede utilizarse:

```text
archived_at
```

en lugar de eliminación física.

---

## 82. NO DELETE PUBLISHED VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

NO DELETE PUBLISHED VERSION

Una RuleVersion publicada no debe eliminarse físicamente mediante operación normal.

---

## 83. ARCHIVING

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARCHIVING

Archivar no significa:

```text
ejecutable
```

El estado debe impedir ejecución.

---

## 84. REVOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

REVOCATION

Una RuleVersion puede ser:

```text
REVOKED
```

por razones de seguridad.

Debe bloquearse ejecución futura.

---

## 85. DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DEPRECATION

Una versión:

```text
DEPRECATED
```

puede seguir siendo ejecutable si la política lo permite.

Deprecation no equivale automáticamente a revocation.

---

## 86. CASCADE DELETE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CASCADE DELETE

Evitar cascadas destructivas sobre:

```text
published versions
executions
audit
snapshots
```

---

## 87. FOREIGN KEYS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

FOREIGN KEYS

Las relaciones críticas deben usar foreign keys.

Ejemplo:

```text
rule_versions.rule_id → rules.id
executions.rule_version_id → rule_versions.id
```

---

## 88. TRANSACTIONAL PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TRANSACTIONAL PUBLICATION

La publicación debe ejecutarse dentro de una transacción cuando sea posible:

```text
validate state
create publication evidence
set published state
commit
```

---

## 89. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONCURRENCY

Dos usuarios no deben poder publicar simultáneamente versiones inconsistentes.

Utilizar:

```text
row locking
optimistic concurrency
```

según el caso.

---

## 90. OPTIMISTIC LOCK

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

OPTIMISTIC LOCK

Drafts pueden utilizar:

```text
updated_at
version
revision
```

para detectar edición concurrente.

---

## 91. CONCURRENT EDITING

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CONCURRENT EDITING

Si dos usuarios modifican el mismo Draft:

```text
conflict
```

debe detectarse.

No sobrescribir silenciosamente.

---

## 92. RULE VERSION CREATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RULE VERSION CREATION

La creación de una versión debe garantizar:

```text
unique rule_id + version_number
```

---

## 93. PUBLICATION RACE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PUBLICATION RACE

Debe impedirse:

```text
User A publishes v3
User B publishes v4
```

si la política exige aprobación o secuencia específica.

---

## 94. DATA CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DATA CONSISTENCY

La base debe garantizar:

```text
published version → valid artifact
```

como invariación lógica.

---

## 95. DATABASE CHECKS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DATABASE CHECKS

Cuando sea práctico, utilizar:

```text
CHECK constraints
```

para:

```text
status
scope
version_number
```

---

## 96. ENUM VS TEXT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ENUM VS TEXT

Para estados críticos puede utilizarse:

```text
CHECK
```

o:

```text
PostgreSQL ENUM
```

La decisión debe priorizar evolución y migraciones controladas.

---

## 97. JSONB

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

JSONB

Usar JSONB para datos naturalmente variables:

```text
test input
expected result
audit metadata
execution metadata
```

No utilizar JSONB para todo.

---

## 98. NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

NORMALIZATION

Normalizar entidades que necesitan:

```text
queries
constraints
relationships
```

Mantener JSONB para payloads que realmente son documentos.

---

## 99. EXAMPLE DATA MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

EXAMPLE DATA MODEL

```text
rules
 ├── id
 ├── tenant_id
 ├── code
 └── ...

rule_versions
 ├── id
 ├── rule_id
 ├── version_number
 ├── source
 ├── source_hash
 ├── artifact
 ├── artifact_hash
 └── ...

rule_dependencies
 ├── rule_version_id
 ├── type
 ├── code
 └── version

rule_capabilities
 ├── rule_version_id
 └── capability

rule_tests
 ├── id
 ├── rule_version_id
 ├── input
 └── expected_result

executions
 ├── id
 ├── tenant_id
 ├── rule_version_id
 ├── status
 └── result
```

---

## 100. DATABASE IS NOT RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DATABASE IS NOT RUNTIME

No almacenar lógica ejecutable como:

```text
SQL procedure
```

para sustituir al Runtime AEL.

---

## 101. DATABASE IS NOT COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DATABASE IS NOT COMPILER

PostgreSQL almacena:

```text
Source
Artifact
metadata
```

pero no define:

```text
grammar
type system
execution semantics
```

---

## 102. SUPABASE INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SUPABASE INTEGRATION

Supabase proporciona:

```text
Auth
PostgreSQL
RLS
Storage
```

AEL utiliza estos servicios como infraestructura.

---

## 103. AEL INDEPENDENCE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AEL INDEPENDENCE

AEL debe mantener interfaces que permitan sustituir:

```text
Supabase
```

sin cambiar el lenguaje.

---

## 104. MIGRATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

MIGRATIONS

Todas las tablas AEL deben crearse mediante:

```text
versioned database migrations
```

---

## 105. MIGRATION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

MIGRATION ORDER

Ejemplo:

```text
001_rules
002_rule_versions
003_artifacts
004_dependencies
005_tests
006_executions
007_audit
```

La secuencia real queda para la implementación.

---

## 106. SEED DATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SEED DATA

Los Contracts y Functions globales iniciales pueden crearse mediante:

```text
seed
```

pero los seeds deben ser:

```text
idempotent
versioned
```

---

## 107. SYSTEM RECORDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SYSTEM RECORDS

Los registros globales del sistema deben distinguirse de datos tenant.

Ejemplo:

```text
GLOBAL CONTRACT
vs
TENANT CONTRACT
```

---

## 108. SECURITY MIGRATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SECURITY MIGRATIONS

Toda migración debe contemplar:

```text
RLS
policies
indexes
grants
```

---

## 109. TEST DATABASE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

TEST DATABASE

La suite de integración debe utilizar una base aislada.

No ejecutar tests destructivos contra producción.

---

## 110. FIXTURES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

FIXTURES

Los fixtures deben crear:

```text
Tenant A
Tenant B
Users
Rules
Versions
Contracts
```

de forma reproducible.

---

## 111. RESET

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

RESET

El entorno de test debe poder:

```text
reset
seed
run
```

sin intervención manual.

---

## 112. BACKUP

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

BACKUP

Los datos críticos de producción deben seguir las políticas generales de backup de AQUILA.

AEL no necesita un sistema paralelo de backups.

---

## 113. DISASTER RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

DISASTER RECOVERY

Para recuperar AEL deben existir:

```text
database backup
artifact backup
storage backup
configuration backup
```

según dónde se almacenen los componentes.

---

## 114. ARTIFACT RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARTIFACT RECOVERY

La recuperación debe conservar:

```text
artifact_hash
rule_version
```

---

## 115. INTEGRITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

INTEGRITY CHECK

Después de restaurar:

```text
artifact_hash
```

debe verificarse.

---

## 116. AUDIT RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

AUDIT RECOVERY

La restauración debe conservar la continuidad del audit trail cuando la política de backup lo permita.

---

## 117. DATA CLASSIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md; Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DATA CLASSIFICATION

Clasificar al menos:

```text
public
internal
confidential
restricted
```

según las políticas de AQUILA.

---

## 118. SOURCE CLASSIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SOURCE CLASSIFICATION

El Source puede contener lógica de negocio confidencial.

Debe protegerse como:

```text
Internal / Confidential
```

según el caso.

---

## 119. ARTIFACT CLASSIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

ARTIFACT CLASSIFICATION

El Artifact puede considerarse:

```text
Internal
```

pero su acceso debe seguir controlado.

---

## 120. SNAPSHOT CLASSIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

SNAPSHOT CLASSIFICATION

Los Snapshots pueden contener datos de negocio y deben recibir una clasificación igual o superior a sus datos.

---

## 121. FINAL MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

FINAL MODEL

```text
                    ┌───────────────┐
                    │     RULE      │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ RULE VERSION  │
                    └───────┬───────┘
                            │
        ┌───────────┬───────┼───────────┬───────────┐
        ▼           ▼       ▼           ▼           ▼
     SOURCE      ARTIFACT DEPENDENCIES CAPABILITIES TESTS
        │           │
        └───────────┴────────────┐
                                 ▼
                           PUBLICATION
                                 │
                                 ▼
                            EXECUTION
                                 │
                         ┌───────┴───────┐
                         ▼               ▼
                     SNAPSHOT         RESULT
                         │
                         ▼
                       AUDIT
```

---

## 122. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

CRITERIO DE CIERRE

La persistencia AEL V1 queda definida cuando:

```text
✓ Rule identity
✓ Rule versions
✓ Source
✓ Artifact
✓ Hashes
✓ Dependencies
✓ Capabilities
✓ Tests
✓ Executions
✓ Snapshots
✓ Contracts
✓ Functions
✓ Publication
✓ Approval
✓ Audit
✓ Tenant isolation
✓ RLS
✓ Retention
✓ Immutability
✓ Recovery
```

están cubiertos.

---

## 123. PRINCIPIO ARQUITECTÓNICO DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_Modelo_Datos_Versionado 12.md

PRINCIPIO ARQUITECTÓNICO DEFINITIVO

La base de datos debe conservar:

```text
qué es una regla
qué versión fue publicada
qué Artifact fue ejecutado
qué dependencias tenía
qué resultado produjo
quién la publicó
```

pero no debe convertirse en el lugar donde:

```text
se ejecuta AEL
```

La semántica permanece en el:

```text
Compiler
Analyzer
Verifier
Runtime
```

y la persistencia permanece en:

```text
PostgreSQL / Supabase
```

---

# FIN DEL DOCUMENTO 12

## AEL V1 — Persistencia, Modelo de Datos y Versionado

## 124. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

OBJETIVO

Definir la persistencia de:

```text
Rules
Rule Versions
Artifacts
Dependencies
Contracts metadata
Executions
Execution results
Tests
Audit events
Publications
```

utilizando:

```text
PostgreSQL
Supabase
RLS
Repository Ports
Transactions
```

---

## 125. PRINCIPIO ARQUITECTÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PRINCIPIO ARQUITECTÓNICO

La dirección de dependencias será:

```text
AEL Core
   ↑
Application
   ↑
Repository Ports
   ↑
PostgreSQL Adapters
```

Nunca:

```text
AEL Core
   ↓
PostgreSQL
```

---

## 126. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RESPONSABILIDADES

### AEL Core

```text
semántica
tipos
compiler
runtime
artifact
```

### Application

```text
casos de uso
orquestación
authorization
transactions
```

### Infrastructure

```text
PostgreSQL
Supabase
Storage
```

---

## 127. PERSISTENCIA NO ES RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PERSISTENCIA NO ES RUNTIME

El Runtime recibe:

```text
Artifact
ExecutionContext
Providers
```

No consulta directamente:

```text
rules
rule_versions
artifacts
```

---

## 128. MODELO DE DATOS PRINCIPAL

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

MODELO DE DATOS PRINCIPAL

Entidades:

```text
rules
rule_versions
rule_artifacts
rule_dependencies
rule_tests
rule_publications
ael_executions
ael_execution_results
ael_audit_events
```

El esquema definitivo debe adaptarse a las convenciones generales de AQUILA.

---

## 129. TENANT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TENANT

Toda entidad que pertenezca a un tenant debe contener:

```text
tenant_id
```

cuando el modelo de AQUILA lo requiera.

---

## 130. GLOBAL VS TENANT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

GLOBAL VS TENANT

Distinguir:

```text
global metadata
```

de:

```text
tenant-owned data
```

Ejemplo:

```text
Contract definition
```

puede ser global.

Mientras:

```text
Rule
RuleVersion
Execution
```

normalmente pertenece a un tenant.

---

## 131. RULE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE

Conceptualmente:

```text
rules
```

representa la identidad lógica de una regla.

Campos mínimos:

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

## 132. RULE CODE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE CODE

Debe ser estable.

Ejemplo:

```text
LIQ_ADMIN_M2
```

No utilizar el nombre visible como identidad.

---

## 133. RULE STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE STATUS

Catálogo inicial:

```text
DRAFT
ACTIVE
ARCHIVED
DISABLED
```

La semántica exacta debe coordinarse con el workflow de publicación.

---

## 134. RULE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE VERSION

Separar:

```text
rule
```

de:

```text
rule_version
```

---

## 135. RULE VERSION FIELDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE VERSION FIELDS

Conceptualmente:

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

## 136. VERSION UNIQUENESS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

VERSION UNIQUENESS

Debe existir una restricción:

```text
(rule_id, version)
```

única.

---

## 137. VERSION IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

VERSION IMMUTABILITY

Una RuleVersion publicada no debe modificarse.

Corrección:

```text
new RuleVersion
```

---

## 138. DRAFT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DRAFT

Un Draft puede editarse.

Al publicar:

```text
Draft
 ↓
Validate
 ↓
Compile
 ↓
Artifact
 ↓
Publish
```

---

## 139. SOURCE STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SOURCE STORAGE

El Source AEL debe conservarse para:

```text
editing
audit
debugging
recompilation
```

No debe ser la fuente de ejecución en producción.

---

## 140. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT STORAGE

El Artifact debe almacenarse de forma binaria o codificación canónica apropiada.

Campos conceptuales:

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

## 141. ARTIFACT IDENTITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT IDENTITY

El hash permite identificar:

```text
integridad
deduplicación
reproducibilidad
```

---

## 142. ARTIFACT UNIQUENESS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT UNIQUENESS

Recomendación:

```text
artifact_hash
```

único dentro del registry lógico.

---

## 143. STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

STORAGE

Para Artifacts pequeños:

```text
BYTEA
```

puede ser suficiente.

Para Artifacts grandes:

```text
Supabase Storage
```

puede ser preferible.

La decisión debe basarse en tamaño real.

---

## 144. ARTIFACT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT METADATA

Mantener en PostgreSQL:

```text
hash
format_version
language_version
compiler_version
size
storage reference
```

---

## 145. ARTIFACT CONTENT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT CONTENT

No duplicar innecesariamente el mismo Artifact en múltiples RuleVersions.

---

## 146. DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DEPENDENCIES

Persistir:

```text
Contracts
Functions
Capabilities
```

utilizados por cada RuleVersion.

---

## 147. RULE DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE DEPENDENCY

Tabla conceptual:

```text
rule_dependencies
```

Campos:

```text
rule_version_id
dependency_type
dependency_code
dependency_version
```

---

## 148. DEPENDENCY TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DEPENDENCY TYPE

```text
CONTRACT
FUNCTION
```

---

## 149. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CAPABILITIES

Pueden persistirse como manifest del Artifact y/o estructura normalizada.

Debe existir una única fuente normativa durante ejecución.

Recomendación:

```text
Artifact manifest
```

como requisito compilado.

---

## 150. CONTRACT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONTRACT METADATA

Persistir metadata global si AQUILA necesita administrar Contracts.

Tabla conceptual:

```text
ael_contracts
```

---

## 151. CONTRACT FIELDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONTRACT FIELDS

```text
id
namespace
code
version
type
nullable
dimension
unit
currency
provider_key
capability
status
```

---

## 152. CONTRACT UNIQUE KEY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONTRACT UNIQUE KEY

```text
(namespace, code, version)
```

---

## 153. CONTRACT PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONTRACT PROVIDER KEY

Ejemplo:

```text
property
parameter
billing
```

Debe apuntar a un Provider registrado.

No almacenar código ejecutable.

---

## 154. FUNCTION METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

FUNCTION METADATA

Si Functions deben administrarse desde BD:

```text
ael_functions
```

Pero la implementación ejecutable debe permanecer en código controlado.

---

## 155. FUNCTION RECORD

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

FUNCTION RECORD

Puede contener:

```text
name
version
signature
status
capabilities
```

No:

```text
javascript_source
```

ejecutable por Runtime.

---

## 156. EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION

Toda ejecución relevante debe poder identificarse.

Tabla:

```text
ael_executions
```

---

## 157. EXECUTION FIELDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION FIELDS

```text
id
tenant_id
rule_id
rule_version_id
artifact_hash
status
started_at
completed_at
duration_ms
actor_id
mode
error_code
```

---

## 158. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION STATUS

```text
QUEUED
RUNNING
COMPLETED
FAILED
TIMEOUT
CANCELLED
DENIED
```

---

## 159. EXECUTION MODE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION MODE

```text
LIVE
SNAPSHOT
TEST
SIMULATION
```

---

## 160. EXECUTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION RESULT

No almacenar necesariamente todos los resultados completos en la tabla principal.

Separar:

```text
execution metadata
```

de:

```text
execution result
```

---

## 161. RESULT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RESULT STORAGE

Tabla conceptual:

```text
ael_execution_results
```

Campos:

```text
execution_id
result_type
result_payload
currency
unit
created_at
```

La estrategia exacta de JSON/BYTEA/columnas estructuradas debe definirse según consultas reales.

---

## 162. RESULT PRECISION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RESULT PRECISION

Nunca convertir un resultado monetario a:

```text
float
```

para persistirlo.

---

## 163. RESULT REPRESENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RESULT REPRESENTATION

Para Money conservar:

```text
amount
currency
```

con precisión exacta.

---

## 164. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT

Tabla:

```text
ael_audit_events
```

---

## 165. AUDIT FIELDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT FIELDS

```text
id
tenant_id
actor_id
event_type
entity_type
entity_id
metadata
created_at
correlation_id
```

---

## 166. AUDIT EVENTS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT EVENTS

Ejemplos:

```text
RULE_CREATED
RULE_UPDATED
RULE_VERSION_CREATED
RULE_PUBLISHED
RULE_DISABLED
ARTIFACT_CREATED
ARTIFACT_REVOKED
EXECUTION_STARTED
EXECUTION_COMPLETED
EXECUTION_FAILED
```

---

## 167. AUDIT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT IMMUTABILITY

Los eventos de auditoría deben ser append-only.

No permitir:

```text
UPDATE
DELETE
```

mediante la aplicación normal.

---

## 168. AUDIT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT METADATA

No guardar:

```text
secrets
tokens
passwords
```

---

## 169. SOURCE SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SOURCE SECURITY

El Source AEL puede contener:

```text
business logic
```

pero no debe contener:

```text
credentials
secrets
tokens
```

---

## 170. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RLS

Las tablas tenant-owned deben utilizar:

```text
Row Level Security
```

---

## 171. RLS PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RLS PRINCIPLE

La regla base:

```text
tenant_id = authenticated tenant
```

debe estar aplicada en DB.

---

## 172. APPLICATION FILTER VS RLS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

APPLICATION FILTER VS RLS

Ambos deben existir:

```text
Application authorization
+
Database RLS
```

No considerar uno sustituto del otro.

---

## 173. SERVICE ROLE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SERVICE ROLE

El uso de privilegios elevados debe estar restringido a backend confiable.

Nunca exponer:

```text
service role key
```

al navegador.

---

## 174. PROVIDER AND RLS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PROVIDER AND RLS

Un Provider que consulte PostgreSQL debe operar bajo un contexto de tenant correcto.

---

## 175. TENANT CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TENANT CONTEXT

El backend debe establecer:

```text
tenant identity
```

antes de acceder a datos tenant-owned.

---

## 176. RLS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RLS TEST

Crear tests:

```text
Tenant A cannot SELECT Tenant B Rule
Tenant A cannot SELECT Tenant B Execution
Tenant A cannot SELECT Tenant B Artifact
```

cuando estas entidades sean tenant-owned.

---

## 177. INSERT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

INSERT TEST

Tenant A no debe poder crear:

```text
tenant_id = Tenant B
```

mediante API.

---

## 178. UPDATE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

UPDATE TEST

Tenant A no debe poder modificar:

```text
Tenant B Rule
```

---

## 179. DELETE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DELETE TEST

Tenant A no debe poder eliminar:

```text
Tenant B Rule
```

---

## 180. GLOBAL RECORDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

GLOBAL RECORDS

Para metadata global:

```text
tenant_id IS NULL
```

puede utilizarse si coincide con el modelo general de AQUILA.

Pero las políticas deben evitar que un tenant convierta un registro global en uno propio.

---

## 181. REPOSITORY PORTS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

REPOSITORY PORTS

AEL Application debe definir:

```ts
interface RuleRepository
interface RuleVersionRepository
interface ArtifactRepository
interface ExecutionRepository
interface AuditRepository
```

---

## 182. RULE REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE REPOSITORY

```ts
interface RuleRepository {
  findById(tenantId: string, ruleId: string): Promise<Rule | null>

  save(rule: Rule): Promise<void>
}
```

---

## 183. RULE VERSION REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE VERSION REPOSITORY

```ts
interface RuleVersionRepository {
  find(tenantId: string, ruleId: string, version: number): Promise<RuleVersion | null>

  save(version: RuleVersion): Promise<void>
}
```

---

## 184. ARTIFACT REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT REPOSITORY

```ts
interface ArtifactRepository {
  findByHash(hash: string): Promise<ArtifactRecord | null>

  save(artifact: ArtifactRecord): Promise<void>
}
```

---

## 185. EXECUTION REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION REPOSITORY

```ts
interface ExecutionRepository {
  create(execution: ExecutionRecord): Promise<void>

  complete(executionId: string, result: ExecutionResult): Promise<void>
}
```

---

## 186. AUDIT REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT REPOSITORY

```ts
interface AuditRepository {
  append(event: AuditEvent): Promise<void>
}
```

---

## 187. TRANSACTION MANAGER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TRANSACTION MANAGER

```ts
interface TransactionManager {
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>
}
```

---

## 188. TRANSACTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TRANSACTION CONTEXT

Repositories deben poder operar dentro de:

```text
same transaction
```

cuando el caso de uso lo requiera.

---

## 189. PUBLICATION TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PUBLICATION TRANSACTION

Publicación debe ser atómica:

```text
validate
compile
store version
store artifact
store dependencies
create publication
audit
commit
```

---

## 190. NO PARTIAL PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

NO PARTIAL PUBLICATION

No debe quedar:

```text
RuleVersion ACTIVE
```

sin Artifact verificable.

---

## 191. PUBLICATION STATE MACHINE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PUBLICATION STATE MACHINE

Conceptualmente:

```text
DRAFT
  ↓
VALIDATED
  ↓
COMPILED
  ↓
VERIFIED
  ↓
PUBLISHED
  ↓
ACTIVE
```

Los estados exactos deben alinearse con el workflow general de AQUILA.

---

## 192. PUBLICATION INVARIANT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PUBLICATION INVARIANT

Una versión `PUBLISHED` debe tener:

```text
valid Source
valid Artifact
valid hash
valid dependencies
valid capabilities
```

---

## 193. ARTIFACT VERIFICATION AT READ

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT VERIFICATION AT READ

Un Artifact recuperado desde storage debe poder verificarse antes de ejecutar.

---

## 194. STORAGE INTEGRITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

STORAGE INTEGRITY

Si:

```text
stored hash != computed hash
```

resultado:

```text
DO NOT EXECUTE
```

---

## 195. EXECUTION LOADING

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION LOADING

El Application Service debe:

```text
load RuleVersion
load Artifact
verify Artifact
create ExecutionContext
resolve Providers
execute
persist result
audit
```

---

## 196. EXECUTION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION FLOW

```text
API/Worker
   ↓
Authorization
   ↓
RuleVersionRepository
   ↓
ArtifactRepository
   ↓
ArtifactVerifier
   ↓
ExecutionContextFactory
   ↓
Runtime
   ↓
ExecutionRepository
   ↓
AuditRepository
```

---

## 197. RULE VERSION SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE VERSION SNAPSHOT

Una ejecución debe identificar exactamente:

```text
rule_version_id
artifact_hash
```

para reproducibilidad.

---

## 198. NEVER EXECUTE "LATEST"

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

NEVER EXECUTE "LATEST"

No utilizar:

```text
rule.code → latest
```

como única identidad de ejecución histórica.

Siempre resolver:

```text
specific RuleVersion
```

---

## 199. ACTIVE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ACTIVE VERSION

La aplicación puede resolver:

```text
current active version
```

pero debe convertirla a una referencia inmutable antes de ejecutar.

---

## 200. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONCURRENCY

Dos publicaciones simultáneas deben evitar producir:

```text
duplicate active versions
```

---

## 201. UNIQUE CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

UNIQUE CONSTRAINT

La DB debe reforzar invariantes críticas.

Ejemplo:

```text
unique(rule_id, version)
```

---

## 202. ACTIVE VERSION CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ACTIVE VERSION CONSTRAINT

Si el negocio exige una única versión activa:

```text
partial unique index
```

puede utilizarse.

---

## 203. SOFT DELETE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SOFT DELETE

Para entidades auditables preferir:

```text
status
archived_at
disabled_at
```

sobre eliminación física.

---

## 204. RULE ARCHIVE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE ARCHIVE

Archivar no debe eliminar:

```text
RuleVersions
Artifacts
Executions
Audit
```

necesarios para historial.

---

## 205. ARTIFACT RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT RETENTION

Definir política de retención.

No eliminar un Artifact todavía referenciado por:

```text
published RuleVersion
execution history
audit
```

---

## 206. EXECUTION RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION RETENTION

Puede existir retención configurable.

Pero las ejecuciones necesarias para:

```text
financial audit
```

pueden requerir mayor permanencia.

---

## 207. SOURCE RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SOURCE RETENTION

No eliminar Source de una RuleVersion publicada mientras se necesite:

```text
audit
recompile
debugging
```

---

## 208. DATABASE MIGRATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DATABASE MIGRATIONS

Cada cambio de esquema debe ser una migration versionada.

Ejemplo:

```text
001_create_ael_rules
002_create_ael_rule_versions
003_create_ael_artifacts
...
```

---

## 209. MIGRATION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

MIGRATION ORDER

Orden:

```text
rules
 ↓
rule_versions
 ↓
artifacts
 ↓
dependencies
 ↓
executions
 ↓
results
 ↓
audit
```

---

## 210. FOREIGN KEYS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

FOREIGN KEYS

Usar FK para integridad cuando la arquitectura lo permita.

Ejemplo:

```text
rule_versions.rule_id → rules.id
```

---

## 211. DELETE POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DELETE POLICY

No usar:

```text
CASCADE
```

indiscriminadamente en datos auditables.

---

## 212. INDEXES

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

INDEXES

Crear índices para:

```text
tenant_id
rule_id
rule_version_id
artifact_hash
execution_id
created_at
status
```

según patrones reales de consulta.

---

## 213. COMPOSITE INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

COMPOSITE INDEX

Ejemplos:

```text
(tenant_id, code)
(tenant_id, rule_id)
(rule_id, version)
(tenant_id, created_at)
```

---

## 214. JSONB

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

JSONB

Puede utilizarse para:

```text
audit metadata
execution metadata
provider-specific metadata
```

pero no para esconder todo el modelo relacional.

---

## 215. RESULT JSON

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RESULT JSON

Un resultado estructurado puede usar JSONB cuando la forma de salida sea variable.

Pero Money/Quantity críticos deben conservar estructura semántica.

---

## 216. DATA MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DATA MIGRATION

Cuando cambie el Artifact format:

```text
new format
```

no actualizar silenciosamente Artifacts históricos.

---

## 217. ARTIFACT MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT MIGRATION

Preferir:

```text
recompile Source
```

siempre que sea seguro y determinista.

---

## 218. HISTORICAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

HISTORICAL EXECUTION

Una ejecución histórica debe conservar suficiente información para saber:

```text
qué RuleVersion
qué Artifact
qué Runtime
qué modo
```

se utilizó.

---

## 219. RUNTIME VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RUNTIME VERSION

Persistir:

```text
runtime_version
```

en execution metadata.

---

## 220. COMPILER VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

COMPILER VERSION

Persistir:

```text
compiler_version
```

en Artifact y/o execution metadata.

---

## 221. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

LANGUAGE VERSION

Persistir:

```text
language_version
```

en RuleVersion y Artifact.

---

## 222. CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CORRELATION

Toda ejecución debe poder correlacionarse con:

```text
request
rule
artifact
provider calls
audit
```

mediante IDs.

---

## 223. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION ID

Generar un ID único antes de ejecutar.

---

## 224. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

IDEMPOTENCY

Para operaciones que creen ejecuciones desde API:

```text
idempotency key
```

puede ser necesaria.

No duplicar ejecuciones por reintentos HTTP.

---

## 225. ASYNC EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ASYNC EXECUTION

Para Worker:

```text
create QUEUED execution
 ↓
enqueue
 ↓
worker claims
 ↓
RUNNING
 ↓
execute
 ↓
COMPLETED/FAILED
```

---

## 226. WORKER CLAIM

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

WORKER CLAIM

El Worker debe evitar que dos workers ejecuten el mismo job simultáneamente.

---

## 227. EXECUTION LEASE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION LEASE

Puede utilizarse:

```text
locked_at
locked_by
lease_until
```

según estrategia de cola.

---

## 228. FAILED EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

FAILED EXECUTION

Persistir:

```text
error_code
status
duration
```

sin guardar secretos.

---

## 229. RETRY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RETRY

Sólo errores transitorios deben reintentarse.

No reintentar:

```text
capability denied
invalid Artifact
invalid Contract
```

---

## 230. AUDIT TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT TRANSACTION

Cuando una operación crítica requiera audit:

```text
business change
+
audit event
```

deben confirmarse en la misma transacción cuando sea apropiado.

---

## 231. AUDIT OUTBOX

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT OUTBOX

Para eventos que necesiten publicación externa puede utilizarse posteriormente:

```text
Outbox Pattern
```

No es obligatorio para AEL-001/AEL-002.

---

## 232. SECURITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SECURITY BOUNDARY

Supabase/PostgreSQL es una frontera de datos.

Nunca aceptar directamente desde cliente:

```text
tenant_id
created_by
artifact_hash trusted
published status
```

como valores de autoridad.

---

## 233. SERVER-OWNED FIELDS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SERVER-OWNED FIELDS

Campos como:

```text
created_at
updated_at
created_by
published_at
artifact_hash
```

deben ser controlados por backend o DB según arquitectura.

---

## 234. RLS POLICY DESIGN

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RLS POLICY DESIGN

Las policies deben ser pequeñas y explícitas.

Evitar una policy gigantesca con toda la lógica de autorización de AQUILA.

---

## 235. APPLICATION AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

APPLICATION AUTHORIZATION

La aplicación decide:

```text
¿Puede este usuario publicar esta regla?
```

RLS decide:

```text
¿Puede este contexto acceder a esta fila?
```

---

## 236. SERVICE OPERATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SERVICE OPERATIONS

Operaciones administrativas pueden utilizar un backend privilegiado.

Deben registrar:

```text
actor
reason
scope
```

en audit.

---

## 237. BACKUP

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

BACKUP

Incluir en backup:

```text
rules
rule_versions
artifact metadata
artifacts
executions
audit
```

según política de retención.

---

## 238. RESTORE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RESTORE

Después de restore comprobar:

```text
Artifact hashes
RuleVersion relations
Execution references
RLS
```

---

## 239. DATA INTEGRITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DATA INTEGRITY CHECK

Crear rutina de diagnóstico que detecte:

```text
RuleVersion sin Artifact
Artifact sin metadata
Dependency sin definition
Execution sin RuleVersion
Hash incorrecto
```

---

## 240. ORPHAN DETECTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ORPHAN DETECTION

Los registros huérfanos no deben eliminarse automáticamente durante diagnóstico.

Primero:

```text
detect
report
repair
```

---

## 241. REPOSITORY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

REPOSITORY TESTS

Cada adapter debe probar:

```text
CRUD
tenant isolation
transactions
constraints
not found
concurrency
```

---

## 242. RLS INTEGRATION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RLS INTEGRATION TESTS

No confiar únicamente en mocks.

Ejecutar tests contra PostgreSQL/Supabase de prueba.

---

## 243. TRANSACTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TRANSACTION TEST

Simular:

```text
Artifact insert succeeds
Dependency insert fails
```

Resultado esperado:

```text
entire transaction rollback
```

---

## 244. PUBLICATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PUBLICATION TEST

Verificar:

```text
Draft
→ compile
→ artifact
→ dependencies
→ publication
```

todo atómicamente.

---

## 245. CORRUPTED ARTIFACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CORRUPTED ARTIFACT TEST

Persistir bytes modificados.

La ejecución debe producir:

```text
verification failure
```

---

## 246. HISTORICAL EXECUTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

HISTORICAL EXECUTION TEST

Publicar:

```text
RuleVersion 1
```

crear ejecución.

Después publicar:

```text
RuleVersion 2
```

La ejecución histórica sigue apuntando a:

```text
Version 1
```

---

## 247. NO MUTATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

NO MUTATION TEST

Modificar Draft no debe cambiar:

```text
published RuleVersion
Artifact
historical Execution
```

---

## 248. TENANT EXECUTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TENANT EXECUTION TEST

Tenant A no debe poder ejecutar directamente:

```text
Tenant B RuleVersion
```

---

## 249. STORAGE FAILURE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

STORAGE FAILURE TEST

Si Artifact storage falla:

```text
publication fails
```

y no queda versión activa sin Artifact.

---

## 250. DATABASE FAILURE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DATABASE FAILURE TEST

Si PostgreSQL falla durante publication:

```text
no partial state
```

dentro de los límites de la transacción.

---

## 251. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

OBSERVABILITY

Persistencia debe exponer métricas:

```text
repository latency
query errors
publication failures
execution persistence failures
```

---

## 252. NO SENSITIVE LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

NO SENSITIVE LOGGING

No registrar:

```text
source completo
resultados financieros completos
tokens
credentials
```

por defecto en logs técnicos.

---

## 253. SOURCE ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SOURCE ACCESS

El Source de una regla debe estar protegido por:

```text
tenant authorization
role/permission
```

---

## 254. ARTIFACT ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT ACCESS

Un Artifact puede tener restricciones diferentes a Source.

El acceso a ejecución no implica automáticamente acceso al Source.

---

## 255. EXECUTION ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION ACCESS

Un usuario puede tener:

```text
execute rule
```

sin necesariamente tener:

```text
edit rule
```

---

## 256. AUDIT ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDIT ACCESS

Sólo roles autorizados deben consultar:

```text
audit
```

---

## 257. DATABASE SCHEMA OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DATABASE SCHEMA OWNERSHIP

El esquema AEL debe pertenecer al modelo de datos de AQUILA.

No crear una base paralela para AEL salvo una decisión futura explícita.

---

## 258. NAMING

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

NAMING

Mantener la convención general de AQUILA.

Ejemplos:

```text
ael_rules
ael_rule_versions
ael_artifacts
ael_executions
```

si el proyecto utiliza prefijos por módulo.

---

## 259. UUID

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

UUID

Preferir IDs UUID para entidades distribuidas.

---

## 260. TIMESTAMPS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TIMESTAMPS

Utilizar timestamps con timezone:

```text
timestamptz
```

cuando PostgreSQL sea la base.

---

## 261. CREATED/UPDATED

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CREATED/UPDATED

Mantener:

```text
created_at
updated_at
```

donde corresponda.

---

## 262. SOFT STATE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SOFT STATE

Preferir estados explícitos:

```text
status
```

sobre inferir estado por:

```text
NULL
```

---

## 263. SCHEMA EVOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SCHEMA EVOLUTION

Cambios de columnas deben ser:

```text
migration
tested
backward-aware
```

---

## 264. API REPOSITORY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

API REPOSITORY BOUNDARY

HTTP no debe conocer SQL.

```text
Controller
 ↓
Application Service
 ↓
Repository Port
 ↓
Postgres Adapter
```

---

## 265. PROVIDER VS REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PROVIDER VS REPOSITORY

No confundir:

```text
Repository
```

con:

```text
ContractProvider
```

Repository obtiene entidades persistidas.

Provider expone valores semánticos a AEL.

---

## 266. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXAMPLE

```text
ParameterRepository
```

puede obtener:

```text
parameter row
```

Mientras:

```text
ParameterContractProvider
```

convierte:

```text
row
→
AELValue
```

---

## 267. DOMAIN MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DOMAIN MAPPING

Nunca pasar:

```text
Supabase row
```

directamente al Runtime.

---

## 268. MAPPER

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

MAPPER

Crear:

```text
Database Row
 ↓
Domain Entity
 ↓
AELValue
```

---

## 269. VALIDATION LAYERS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

VALIDATION LAYERS

Validar:

```text
DB schema
→ repository mapping
→ domain
→ Contract
→ Runtime
```

---

## 270. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

DEFENSE IN DEPTH

La seguridad de tenant debe existir en:

```text
Application
Provider
Database RLS
```

cuando sea aplicable.

---

## 271. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PERFORMANCE

No cargar:

```text
entire rule
entire tenant
```

para una ejecución.

Cargar sólo:

```text
RuleVersion
Artifact
required dependencies
```

---

## 272. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARTIFACT CACHE

Puede existir cache por:

```text
artifact_hash
```

porque el Artifact es inmutable.

Esto es un buen candidato para cache seguro.

---

## 273. RULE CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

RULE CACHE

Un cache de Rule debe invalidarse cuando cambie:

```text
version
status
authorization
```

---

## 274. PROVIDER CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PROVIDER CACHE

Los valores de Provider sólo deben cachearse si la semántica permite hacerlo.

---

## 275. CONNECTION POOL

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONNECTION POOL

El adapter PostgreSQL debe utilizar pool controlado.

No abrir una conexión por cada Contract.

---

## 276. N+1 PROVIDER CALLS

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

N+1 PROVIDER CALLS

Detectar si una Rule hace repetidamente:

```text
same Contract
```

sin necesidad.

Optimización posterior:

```text
per-execution memoization
```

---

## 277. EXECUTION MEMOIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION MEMOIZATION

Dentro de una ejecución puede cachearse:

```text
ContractRef → AELValue
```

si el Contract es estable durante la ejecución.

---

## 278. MEMOIZATION KEY

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

MEMOIZATION KEY

Debe incluir suficiente contexto para no mezclar:

```text
different version
different tenant
different execution context
```

---

## 279. TRANSACTION SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

TRANSACTION SCOPE

No mantener una transacción PostgreSQL abierta durante toda una ejecución AEL larga.

Preferir:

```text
load snapshot
close transaction
execute
persist result
```

cuando sea semánticamente correcto.

---

## 280. CONSISTENCY MODE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CONSISTENCY MODE

Una futura ejecución financiera puede requerir:

```text
consistent snapshot
```

La política debe definirse por caso de uso.

---

## 281. SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

SNAPSHOT

Cuando la ejecución necesita reproducibilidad:

```text
resolve values
freeze snapshot
execute
```

---

## 282. FINANCIAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

FINANCIAL EXECUTION

Para procesos financieros, conservar:

```text
rule_version
artifact_hash
input snapshot/reference
runtime_version
result
```

según requisitos de auditoría.

---

## 283. INPUT SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

INPUT SNAPSHOT

No necesariamente almacenar todos los datos crudos si existen restricciones de privacidad.

Puede almacenarse:

```text
snapshot reference
hash
version
```

siempre que permita reconstrucción autorizada.

---

## 284. AUDITABLE RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AUDITABLE RESULT

El resultado financiero debe poder relacionarse con:

```text
execution
rule
version
artifact
inputs
```

---

## 285. PUBLISH CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

PUBLISH CHECKLIST

```text
[ ] Rule belongs to tenant
[ ] Source valid
[ ] Analyzer passed
[ ] Artifact created
[ ] Artifact verified
[ ] Hash generated
[ ] Dependencies resolved
[ ] Capabilities approved
[ ] Version unique
[ ] Audit event ready
[ ] Transaction committed
```

---

## 286. EXECUTION CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

EXECUTION CHECKLIST

```text
[ ] Authorized
[ ] RuleVersion resolved
[ ] Artifact loaded
[ ] Artifact verified
[ ] Dependencies available
[ ] Capabilities allowed
[ ] Tenant context valid
[ ] Provider context created
[ ] Runtime executed
[ ] Result validated
[ ] Execution persisted
[ ] Audit completed
```

---

## 287. AEL-003 PREPARATION

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

AEL-003 PREPARATION

Esta persistencia deja preparado el siguiente milestone:

```text
API
Publication
Execution Service
Worker
UI
```

sin modificar el Core.

---

## 288. MILESTONE AEL-004 FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

MILESTONE AEL-004 FUTURE

Posteriormente:

```text
advanced persistence
version migration
artifact registry
large-scale execution
```

pueden evolucionar sin cambiar las interfaces semánticas.

---

## 289. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

CRITERIO DE CIERRE

Persistencia AEL queda correctamente integrada cuando:

```text
✓ Rule persists
✓ RuleVersion persists
✓ Artifact persists
✓ Dependencies persist
✓ Contracts metadata persists
✓ Executions persist
✓ Results persist
✓ Audit persists
✓ RLS protects tenant data
✓ Publication is transactional
✓ Historical versions remain immutable
✓ Artifact integrity is verified
✓ Repositories are isolated from Core
✓ Provider maps DB data to AELValue
```

---

## 290. ARQUITECTURA FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Persistencia_AQUILA_PostgreSQL_Supabase_RLS 19.md

ARQUITECTURA FINAL

```text
                         AQUILA UI
                             │
                             ▼
                        Application
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
          Rule Service  Execution Service  Audit
              │              │
              ▼              ▼
        Repository Ports   AEL Runtime
              │              │
              ▼              ▼
       PostgreSQL/Supabase  ContractProvider
              │              │
              │              ▼
              │        AQUILA Services
              │              │
              └──────────────┴──────► RLS
```

---

## 291. OBJETIVO

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

OBJETIVO

Definir:

```text
PostgreSQL
Supabase
Multi-tenancy
RLS
Tenant Context
Actor Context
Claims
Repository
Contract Provider
Transactions
Connection Security
Data Mapping
Security Boundaries
Testing
```

---

## 292. ARQUITECTURA

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ARQUITECTURA

```text
AEL Source
    ↓
Artifact
    ↓
Verifier
    ↓
Runtime
    ↓
Contract Provider
    ↓
Repository / Data Access
    ↓
PostgreSQL
    ↓
RLS
```

---

## 293. PRINCIPIO DB-FIRST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PRINCIPIO DB-FIRST

PostgreSQL es la autoridad final para:

```text
persistencia
integridad
constraints
tenant isolation
relaciones
```

---

## 294. AEL NO ES DATABASE ENGINE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

AEL NO ES DATABASE ENGINE

AEL no debe conocer:

```text
tables
indexes
SQL
connection strings
```

---

## 295. CONTRACT ABSTRACTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONTRACT ABSTRACTION

AEL consulta:

```text
Contract
```

y no:

```text
table
```

---

## 296. TENANT MODEL

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TENANT MODEL

Toda entidad tenant-scoped debe relacionarse con:

```text
tenant_id
```

---

## 297. TENANT IDENTITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TENANT IDENTITY

El `tenant_id` debe originarse en:

```text
trusted authentication/application context
```

---

## 298. NO TENANT FROM SOURCE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO TENANT FROM SOURCE

AEL Source no puede decidir:

```text
tenant_id
```

---

## 299. NO TENANT FROM INPUT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO TENANT FROM INPUT

Un input de una Rule no debe sustituir:

```text
trusted tenant context
```

---

## 300. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

EXECUTION CONTEXT

Conceptualmente:

```ts
interface ExecutionContext {
  tenantId: string
  actorId?: string
  requestId: string
  correlationId?: string
  capabilities: ReadonlySet<string>
}
```

---

## 301. CONTEXT PROPAGATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONTEXT PROPAGATION

```text
Authentication
 ↓
Application Context
 ↓
ExecutionContext
 ↓
Contract Provider
 ↓
Repository
 ↓
PostgreSQL
```

---

## 302. RLS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS

PostgreSQL Row Level Security debe ser la segunda barrera después de la autorización de aplicación.

---

## 303. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DEFENSE IN DEPTH

```text
Authentication
+
Application Authorization
+
AEL Capability
+
Provider
+
RLS
```

---

## 304. RLS NO SE OMITE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS NO SE OMITE

No se debe desactivar RLS simplemente porque:

```text
Provider already filtered tenant
```

---

## 305. PROVIDER FILTER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PROVIDER FILTER

Provider puede aplicar:

```text
WHERE tenant_id = context.tenantId
```

como defensa adicional.

---

## 306. RLS FILTER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS FILTER

PostgreSQL debe volver a comprobar:

```text
tenant_id
```

mediante policy.

---

## 307. JWT CLAIMS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

JWT CLAIMS

Si Supabase Auth se utiliza, el contexto autenticado puede transportar claims controlados.

---

## 308. TENANT CLAIM

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TENANT CLAIM

Puede existir:

```text
tenant_id
```

como claim derivado de la pertenencia del usuario.

---

## 309. TRUST MODEL

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TRUST MODEL

No confiar en:

```text
arbitrary client-provided tenant_id
```

---

## 310. CLAIM SOURCE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CLAIM SOURCE

Claims de seguridad deben originarse en:

```text
trusted authentication/session
```

---

## 311. APP METADATA

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

APP METADATA

Información de autorización puede almacenarse en:

```text
app_metadata
```

cuando la plataforma lo permita.

---

## 312. USER METADATA

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

USER METADATA

No utilizar metadata editable por el usuario como autoridad de seguridad.

---

## 313. ROLE MODEL

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ROLE MODEL

Los roles deben pertenecer a un modelo de autorización explícito.

---

## 314. ROLE VS CAPABILITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ROLE VS CAPABILITY

No confundir:

```text
Role
```

con:

```text
AEL Capability
```

---

## 315. ROLE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ROLE

Role representa:

```text
grupo de permisos de aplicación
```

---

## 316. CAPABILITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CAPABILITY

Capability representa:

```text
operación que una Rule/Function/Provider puede realizar
```

---

## 317. AUTHORIZATION FLOW

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

AUTHORIZATION FLOW

```text
User
 ↓
Authentication
 ↓
Role / Permissions
 ↓
Effective Capabilities
 ↓
ExecutionContext
 ↓
AEL
```

---

## 318. RLS AUTHORIZATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS AUTHORIZATION

RLS debe basarse en:

```text
trusted identity/context
```

y no en valores manipulables por AEL.

---

## 319. TENANT MEMBERSHIP

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TENANT MEMBERSHIP

Debe existir una relación explícita:

```text
user
→ tenant
→ role
```

---

## 320. MULTI-TENANT ISOLATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

MULTI-TENANT ISOLATION

Tenant A nunca debe poder leer:

```text
Tenant B data
```

---

## 321. CROSS-TENANT WRITE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CROSS-TENANT WRITE

Debe ser imposible mediante:

```text
AEL
Provider
Repository
RLS
```

---

## 322. GLOBAL RECORDS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

GLOBAL RECORDS

Records globales pueden existir sólo cuando el modelo los defina explícitamente.

---

## 323. NULL TENANT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NULL TENANT

Un `tenant_id NULL` no debe interpretarse automáticamente como:

```text
accessible by everyone
```

---

## 324. GLOBAL ACCESS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

GLOBAL ACCESS

Debe existir una policy explícita para:

```text
global record
```

---

## 325. RLS POLICY DESIGN

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS POLICY DESIGN

Preferir policies pequeñas y explícitas:

```text
SELECT
INSERT
UPDATE
DELETE
```

---

## 326. SEPARATE POLICIES

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SEPARATE POLICIES

No usar una única policy gigantesca para todas las operaciones.

---

## 327. SELECT POLICY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SELECT POLICY

Debe validar:

```text
record tenant
=
trusted tenant context
```

---

## 328. INSERT POLICY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

INSERT POLICY

Debe garantizar:

```text
new.tenant_id
=
trusted tenant context
```

---

## 329. UPDATE POLICY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

UPDATE POLICY

Debe validar:

```text
old tenant
+
new tenant
```

---

## 330. DELETE POLICY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DELETE POLICY

Debe validar:

```text
record tenant
=
trusted tenant
```

---

## 331. TENANT IMMUTABILITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TENANT IMMUTABILITY

En entidades tenant-scoped, `tenant_id` debe considerarse inmutable salvo operación administrativa explícita.

---

## 332. FOREIGN KEYS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

FOREIGN KEYS

Las relaciones tenant-scoped deben evitar asociaciones accidentales entre tenants.

---

## 333. COMPOSITE INTEGRITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

COMPOSITE INTEGRITY

Cuando sea necesario:

```text
UNIQUE(tenant_id, business_key)
```

---

## 334. BUSINESS IDENTIFIERS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

BUSINESS IDENTIFIERS

IDs de negocio deben definirse según scope:

```text
global
tenant-scoped
```

---

## 335. UUID

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

UUID

UUID puede utilizarse como:

```text
technical identifier
```

pero no sustituye:

```text
tenant isolation
```

---

## 336. DATABASE CONSTRAINTS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATABASE CONSTRAINTS

La base debe reforzar:

```text
NOT NULL
CHECK
UNIQUE
FOREIGN KEY
```

---

## 337. CHECK CONSTRAINT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CHECK CONSTRAINT

Las invariants de dominio críticas no deben depender exclusivamente de AEL.

---

## 338. CONTRACT PROVIDER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONTRACT PROVIDER

Provider traduce:

```text
PostgreSQL result
→ AELValue
```

---

## 339. REPOSITORY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

REPOSITORY

Repository encapsula:

```text
SQL
queries
joins
database mapping
```

---

## 340. SQL OWNERSHIP

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SQL OWNERSHIP

SQL pertenece a:

```text
Repository / Data Access Layer
```

---

## 341. PARAMETERIZATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PARAMETERIZATION

Toda consulta debe usar:

```text
parameterized values
```

---

## 342. SQL INJECTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SQL INJECTION

Nunca concatenar inputs de AEL en SQL.

---

## 343. QUERY BUILDER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

QUERY BUILDER

Query builder seguro puede utilizarse.

---

## 344. ORM

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ORM

ORM puede utilizarse si:

```text
tenant isolation
RLS
performance
query correctness
```

se mantienen.

---

## 345. SUPABASE CLIENT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SUPABASE CLIENT

Si se usa Supabase JS:

```text
AEL → Provider → Supabase client
```

Nunca:

```text
AEL → Supabase client
```

---

## 346. SERVICE ROLE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SERVICE ROLE

Supabase service role debe considerarse:

```text
high privilege
```

---

## 347. SERVICE ROLE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SERVICE ROLE

Nunca exponer:

```text
service_role key
```

al cliente ni al Artifact.

---

## 348. SERVICE ROLE PROVIDER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SERVICE ROLE PROVIDER

Si se utiliza server-side, debe existir:

```text
explicit authorization boundary
```

y RLS bypass debe justificarse.

---

## 349. RLS BYPASS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS BYPASS

Evitar bypass de RLS para operaciones normales de AEL.

---

## 350. ADMIN OPERATIONS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ADMIN OPERATIONS

Operaciones administrativas que requieran privilegios elevados deben estar:

```text
outside ordinary AEL evaluation
```

o estrictamente controladas.

---

## 351. CONNECTION SECURITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONNECTION SECURITY

Database credentials deben vivir:

```text
server-side secret management
```

---

## 352. NO CREDENTIALS IN ARTIFACT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO CREDENTIALS IN ARTIFACT

Nunca incluir:

```text
password
connection string
API key
service role key
```

---

## 353. CONNECTION POOL

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONNECTION POOL

Pool de conexiones debe administrarse fuera del Runtime.

---

## 354. CONNECTION LIMIT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONNECTION LIMIT

Infraestructura debe imponer:

```text
max connections
pool size
timeout
```

---

## 355. QUERY TIMEOUT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

QUERY TIMEOUT

Queries deben respetar:

```text
execution deadline
```

cuando sea técnicamente posible.

---

## 356. CANCELLATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CANCELLATION

Database operations deben recibir:

```text
AbortSignal
```

o mecanismo equivalente.

---

## 357. TRANSACTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TRANSACTION

Transaction boundary pertenece a:

```text
Integration Layer
```

---

## 358. READ TRANSACTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

READ TRANSACTION

Reads pueden utilizar:

```text
read-only transaction
```

cuando sea útil.

---

## 359. WRITE TRANSACTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

WRITE TRANSACTION

Writes deben definir:

```text
atomicity
isolation
rollback
```

---

## 360. AEL TRANSACTION CONTROL

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

AEL TRANSACTION CONTROL

AEL no ejecuta:

```text
BEGIN
COMMIT
ROLLBACK
```

---

## 361. ISOLATION LEVEL

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ISOLATION LEVEL

Elegir según operación:

```text
READ COMMITTED
REPEATABLE READ
SERIALIZABLE
```

sin convertirlo en responsabilidad del lenguaje.

---

## 362. LONG TRANSACTIONS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

LONG TRANSACTIONS

Evitar mantener una transacción abierta durante toda una Rule si no es necesario.

---

## 363. EXTERNAL CALL INSIDE TRANSACTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

EXTERNAL CALL INSIDE TRANSACTION

Evitar:

```text
DB transaction
→ HTTP call
→ DB commit
```

sin una política transaccional explícita.

---

## 364. DISTRIBUTED CONSISTENCY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DISTRIBUTED CONSISTENCY

No asumir:

```text
two-phase commit
```

entre PostgreSQL y servicios externos.

---

## 365. DATABASE ERRORS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATABASE ERRORS

Mapear a:

```text
AEL-PROVIDER-xxx
```

---

## 366. CONSTRAINT ERROR

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONSTRAINT ERROR

No exponer detalles internos innecesarios.

---

## 367. NOT FOUND

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NOT FOUND

Debe distinguirse:

```text
not found
```

de:

```text
provider failure
```

---

## 368. NULL RESULT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NULL RESULT

Un Contract nullable puede producir:

```text
AEL Null
```

---

## 369. NOT NULL CONTRACT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NOT NULL CONTRACT

Contract non-nullable nunca debe devolver:

```text
Null
```

---

## 370. RECORD MAPPING

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RECORD MAPPING

Mapear explícitamente:

```text
database columns
→ AEL fields
```

---

## 371. FIELD ALLOWLIST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

FIELD ALLOWLIST

Preferir lista explícita de fields.

---

## 372. NO SELECT *

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO SELECT *

Providers críticos no deberían depender de:

```text
SELECT *
```

---

## 373. DATA MINIMIZATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATA MINIMIZATION

Obtener sólo los campos necesarios.

---

## 374. NUMERIC

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NUMERIC

PostgreSQL:

```text
numeric
```

debe mapear a:

```text
AEL Decimal/Number
```

sin pérdida de precisión.

---

## 375. MONEY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

MONEY

No depender de:

```text
PostgreSQL money
```

como semántica AEL.

Preferir:

```text
numeric + currency
```

---

## 376. DATE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATE

Date debe mapearse a un tipo AEL explícito si está soportado.

---

## 377. TIMESTAMP

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TIMESTAMP

Timestamp debe conservar:

```text
timezone semantics
```

---

## 378. JSON

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

JSON

PostgreSQL JSON/JSONB no debe convertirse automáticamente en:

```text
Any
```

---

## 379. JSON MAPPING

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

JSON MAPPING

Debe existir:

```text
schema
```

para convertir JSON a AEL Record cuando corresponda.

---

## 380. ENUM

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ENUM

Database enums pueden mapearse a:

```text
AEL Enum
```

o String restringido.

---

## 381. ARRAY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ARRAY

Arrays deben tener:

```text
element type
```

si se exponen a AEL.

---

## 382. RESULT SIZE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RESULT SIZE

Provider debe limitar:

```text
maximum rows
maximum payload
```

---

## 383. PAGINATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PAGINATION

Large collections deben manejarse mediante:

```text
controlled pagination
```

fuera de una evaluación ilimitada.

---

## 384. QUERY PERFORMANCE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

QUERY PERFORMANCE

Contracts críticos deben tener:

```text
appropriate indexes
```

---

## 385. TENANT INDEXING

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

TENANT INDEXING

Frecuentemente:

```text
tenant_id
```

debe participar en índices de tablas tenant-scoped.

---

## 386. COMPOSITE INDEX

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

COMPOSITE INDEX

Ejemplo conceptual:

```text
(tenant_id, business_key)
```

---

## 387. QUERY PLAN

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

QUERY PLAN

Los Providers críticos deben validar:

```text
query plan
```

y evitar full scans innecesarios.

---

## 388. RLS PERFORMANCE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS PERFORMANCE

RLS policies deben ser simples y soportables por índices.

---

## 389. SECURITY DEFINER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SECURITY DEFINER

Funciones PostgreSQL `SECURITY DEFINER` deben evitarse salvo necesidad clara y revisión de seguridad.

---

## 390. SEARCH_PATH

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SEARCH_PATH

Funciones privilegiadas deben fijar explícitamente:

```text
search_path
```

cuando corresponda.

---

## 391. FUNCTION PRIVILEGE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

FUNCTION PRIVILEGE

No conceder:

```text
EXECUTE
```

indiscriminadamente.

---

## 392. DATABASE ROLES

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATABASE ROLES

Separar:

```text
application role
migration role
administrative role
```

cuando corresponda.

---

## 393. MIGRATIONS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

MIGRATIONS

Schema changes deben gestionarse mediante:

```text
versioned migrations
```

---

## 394. RLS MIGRATIONS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS MIGRATIONS

Cambios en policies deben ser:

```text
versioned
reviewed
tested
```

---

## 395. CONTRACT MIGRATIONS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONTRACT MIGRATIONS

Cambios de DB que afectan Contract deben revisar:

```text
Contract compatibility
```

---

## 396. SCHEMA DRIFT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SCHEMA DRIFT

El Registry debe detectar cuando:

```text
Contract
```

ya no coincide con:

```text
Provider / database schema
```

---

## 397. CONTRACT VERSIONING

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CONTRACT VERSIONING

Breaking database change:

```text
new Contract version
```

cuando cambie la semántica.

---

## 398. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

BACKWARD COMPATIBILITY

Una migración compatible puede mantener:

```text
same Contract
```

si semantics permanece.

---

## 399. BLUE/GREEN

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

BLUE/GREEN

Para cambios sensibles:

```text
old Contract
+
new Contract
```

pueden coexistir durante transición.

---

## 400. DEPLOYMENT ORDER

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DEPLOYMENT ORDER

Preferir:

```text
DB migration
→ Provider
→ Contract registry
→ Artifact publication
```

según compatibilidad.

---

## 401. NO BREAKING FIRST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO BREAKING FIRST

No publicar Artifact que dependa de schema aún inexistente.

---

## 402. ROLLBACK

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ROLLBACK

Debe existir estrategia para:

```text
Provider
Artifact
DB migration
```

---

## 403. AUDIT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

AUDIT

Cambios de:

```text
RLS
Contracts
Providers
```

deben quedar auditados.

---

## 404. SECURITY TEST MATRIX

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SECURITY TEST MATRIX

```text
tenant A → tenant A
tenant A → tenant B
anonymous
expired session
wrong role
missing capability
service role misuse
```

---

## 405. RLS TEST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RLS TEST

Cada tabla tenant-scoped debe tener pruebas:

```text
SELECT isolation
INSERT isolation
UPDATE isolation
DELETE isolation
```

---

## 406. CROSS-TENANT TEST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CROSS-TENANT TEST

Debe probar:

```text
read
write
update tenant_id
delete
```

---

## 407. PROVIDER TEST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PROVIDER TEST

Debe comprobar:

```text
context propagation
result mapping
error mapping
```

---

## 408. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PERFORMANCE TEST

Medir:

```text
query latency
RLS overhead
provider latency
connection pool
```

---

## 409. OBSERVABILITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

OBSERVABILITY

Registrar:

```text
query duration
provider duration
error
tenant-scoped metrics
```

sin exponer datos sensibles.

---

## 410. AUDIT CONTEXT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

AUDIT CONTEXT

Database operations auditables deben conservar:

```text
tenant
actor
request
execution
```

cuando corresponda.

---

## 411. CORRELATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CORRELATION

Propagar:

```text
executionId
requestId
correlationId
```

hasta infraestructura cuando sea seguro.

---

## 412. NO PII LOGGING

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO PII LOGGING

No registrar:

```text
full records
personal data
credentials
```

por defecto.

---

## 413. DATA RETENTION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATA RETENTION

Logs y audit deben respetar:

```text
retention policy
```

---

## 414. BACKUPS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

BACKUPS

Database backups pertenecen a:

```text
infrastructure
```

y deben considerar:

```text
encryption
access control
retention
```

---

## 415. DISASTER RECOVERY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DISASTER RECOVERY

Debe existir estrategia para:

```text
restore
verification
RPO
RTO
```

según criticidad.

---

## 416. ENVIRONMENT ISOLATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ENVIRONMENT ISOLATION

Separar:

```text
development
staging
production
```

---

## 417. DATABASE CREDENTIALS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

DATABASE CREDENTIALS

Nunca compartir:

```text
production credentials
```

con development.

---

## 418. SERVICE ROLE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SERVICE ROLE

Nunca utilizar service role key en:

```text
browser
AEL Artifact
Source
```

---

## 419. CLIENT SECURITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

CLIENT SECURITY

El frontend sólo recibe:

```text
public / anon credentials
```

cuando aplique.

---

## 420. SERVER SECURITY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

SERVER SECURITY

Server-side Provider utiliza:

```text
trusted credentials
```

protegidas.

---

## 421. AEL DEPLOYMENT

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

AEL DEPLOYMENT

Artifact puede almacenarse en:

```text
database
object storage
artifact registry
```

pero debe mantener:

```text
integrity hash
version
provenance
```

---

## 422. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ARTIFACT STORAGE

Storage debe impedir:

```text
unauthorized mutation
```

---

## 423. ARTIFACT FETCH

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ARTIFACT FETCH

Runtime debe obtener:

```text
exact artifact version
```

---

## 424. NO LATEST

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

NO LATEST

Nunca ejecutar:

```text
latest Artifact
```

sin pinning.

---

## 425. REGISTRY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

REGISTRY

Artifact Registry debe soportar:

```text
artifactId
version
hash
status
```

---

## 426. PUBLICATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PUBLICATION

Artifact debe publicarse sólo después de:

```text
Compiler
Verifier
Tests
```

---

## 427. ACTIVATION

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

ACTIVATION

Un Artifact puede tener:

```text
DRAFT
VERIFIED
ACTIVE
RETIRED
```

según lifecycle.

---

## 428. RETIRED

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

RETIRED

Retired no debe utilizarse para nuevas executions salvo:

```text
audit/replay
```

controlado.

---

## 429. REPLAY

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

REPLAY

Replay requiere:

```text
same artifact
same deterministic context
same fixtures
```

---

## 430. FINAL INTEGRATION FLOW

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

FINAL INTEGRATION FLOW

```text
User
 ↓
Authentication
 ↓
Tenant / Role
 ↓
ExecutionContext
 ↓
AEL Runtime
 ↓
Contract Provider
 ↓
Repository
 ↓
PostgreSQL
 ↓
RLS
 ↓
Typed Result
 ↓
AELValue
```

---

## 431. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PRINCIPIO DE SEGURIDAD

```text
tenantId
```

es una autoridad de contexto, no un parámetro de negocio manipulable por AEL.

---

## 432. PRINCIPIO DE RLS

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PRINCIPIO DE RLS

Provider filtering ayuda.

RLS garantiza.

---

## 433. PRINCIPIO DE ABSTRACCIÓN

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PRINCIPIO DE ABSTRACCIÓN

AEL conoce:

```text
Contract
```

PostgreSQL conoce:

```text
tables
policies
indexes
```

La Integration Layer conecta ambos.

---

## 434. PRINCIPIO DE CONSISTENCIA

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

PRINCIPIO DE CONSISTENCIA

Database constraints y RLS deben reforzar las invariants críticas independientemente del Runtime.

---

## 435. EXIT CRITERIA — AEL POSTGRESQL/SUPABASE

> **Origen:** Motor de liquidacion_PostgreSQL Supabase Integration & RLS 41.md

EXIT CRITERIA — AEL POSTGRESQL/SUPABASE

```text
✓ Tenant model
✓ ExecutionContext propagation
✓ RLS
✓ Claims
✓ Roles
✓ Capabilities
✓ Repository boundary
✓ SQL parameterization
✓ Supabase isolation
✓ Service role protection
✓ Transactions
✓ Connection security
✓ Data mapping
✓ Nullability
✓ Numeric precision
✓ JSON schema
✓ Result limits
✓ Indexing
✓ RLS performance
✓ Schema migrations
✓ Contract compatibility
✓ Audit
✓ Observability
✓ Backup/DR
✓ Environment isolation
✓ Artifact lifecycle
✓ Cross-tenant security tests
```

---

# FIN DEL DOCUMENTO 41

## AEL V1 — PostgreSQL / Supabase Integration & RLS
