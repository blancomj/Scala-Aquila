# AEL V1 — AEL Contracts — Functions, Providers & Capabilities

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
06 — Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md
18 — Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md
30 — Motor de liquidacion_AEL_V1_Contract_System. 30md.md
31 — Motor de liquidacion_AEL_V1_Function_System 31.md
63 — Motor de liquidacion_Capability System & Provider Execution Contracts 63.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

OBJETIVO

AEL debe poder expresar:

```ael
PARAMETER.TARIFA_M2
```

sin saber si el dato proviene de:

```text
PostgreSQL
Supabase
API interna
caché
snapshot
mock
```

La separación será:

```text
AEL
 ↓
CONTRACT
 ↓
CONTRACT RESOLVER
 ↓
PROVIDER
 ↓
INFRAESTRUCTURA
```

---

## 2. PROBLEMA QUE RESUELVE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROBLEMA QUE RESUELVE

Una regla de negocio no debe contener:

```sql
SELECT tarifa
FROM parametros
WHERE ...
```

ni:

```typescript
supabase.from(...)
```

ni:

```text
HTTP request
```

AEL debe expresar intención de negocio, no detalles de infraestructura.

---

## 3. PRINCIPIO DE ABSTRACCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PRINCIPIO DE ABSTRACCIÓN

La regla declara:

```ael
PARAMETER.TARIFA_M2
```

El sistema determina:

```text
qué significa
qué tipo tiene
qué unidad tiene
qué versión tiene
quién puede leerlo
qué Provider lo resuelve
```

---

## 4. CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT

Un Contract es una interfaz semántica estable entre AEL y el dominio.

Ejemplo:

```text
PARAMETER.TARIFA_M2
```

Puede representar:

```text
Tipo:
QUANTITY

Dimensión:
MONEY / AREA

Unidad:
COP/M2
```

---

## 5. CONTRACT NO ES UNA TABLA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT NO ES UNA TABLA

Un Contract no debe mapear obligatoriamente 1:1 con una tabla.

Puede representar:

```text
una columna
una vista
una función
un cálculo
un agregado
un valor compuesto
un snapshot
```

---

## 6. CONTRACT IDENTIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT IDENTIFIER

Formato recomendado:

```text
NAMESPACE.MEMBER
```

Ejemplos:

```text
PARAMETER.TARIFA_M2
UNIT.AREA_PRIVATE
PERIOD.CURRENT
PROPERTY.AREA_TOTAL
PROPERTY.AREA_PRIVATE
OWNER.COUNT
```

---

## 7. NAMESPACE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

NAMESPACE

Los namespaces agrupan Contracts por dominio.

Ejemplos:

```text
PARAMETER
UNIT
PERIOD
PROPERTY
OWNER
TENANT
```

No utilizar namespaces arbitrarios.

Los namespaces deben pertenecer al catálogo oficial.

---

## 8. CONTRACT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT METADATA

Cada Contract debe definir como mínimo:

```text
id
version
description
type
unit
dimension
nullability
provider
capabilities
scope
```

---

## 9. EJEMPLO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

EJEMPLO

```text
PARAMETER.TARIFA_M2@1
```

Metadata conceptual:

```json
{
  "id": "PARAMETER.TARIFA_M2",
  "version": 1,
  "type": "QUANTITY",
  "unit": "COP/M2",
  "dimension": "MONEY/AREA",
  "nullable": false,
  "scope": "TENANT"
}
```

---

## 10. CONTRACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT VERSION

Las versiones son inmutables.

Si cambia la semántica:

```text
PARAMETER.TARIFA_M2@1
```

no se modifica.

Se publica:

```text
PARAMETER.TARIFA_M2@2
```

---

## 11. COMPATIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

COMPATIBILIDAD

Una versión nueva puede ser compatible o incompatible.

El catálogo debe indicar:

```text
backwardCompatible
```

cuando corresponda.

El Artifact debe conservar la versión exacta utilizada.

---

## 12. CONTRACT SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT SCHEMA

Un Contract debe definir su resultado.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

produce:

```text
QUANTITY<AREA,M2>
```

No puede devolver a veces:

```text
NUMBER
```

y otras:

```text
STRING
```

sin una definición explícita.

---

## 13. NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

NULLABILITY

Cada Contract declara si puede producir:

```text
NULO
```

Ejemplo:

```text
PROPERTY.PARKING_COUNT
nullable = true
```

El Analyzer puede utilizar esta información para validar expresiones.

---

## 14. CONTRACT SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT SCOPE

Un Contract debe declarar su ámbito.

Valores conceptuales:

```text
GLOBAL
TENANT
PERIOD
PROPERTY
OWNER
EXECUTION
```

---

## 15. TENANT SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TENANT SCOPE

Un Contract tenant-scoped sólo puede devolver información del tenant de ejecución.

Ejemplo:

```text
PARAMETER.TARIFA_M2
scope = TENANT
```

---

## 16. PROPERTY SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROPERTY SCOPE

Un Contract property-scoped necesita una propiedad identificada en el contexto.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

requiere:

```text
propertyId
```

El Runtime no debe permitir que la regla sustituya arbitrariamente ese identificador.

---

## 17. PERIOD SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PERIOD SCOPE

Un Contract puede depender de:

```text
periodId
```

o de un periodo proporcionado por el contexto.

Ejemplo:

```text
PERIOD.CURRENT
```

---

## 18. EXECUTION SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

EXECUTION SCOPE

Algunos Contracts pertenecen exclusivamente a la ejecución.

Ejemplo:

```text
EXECUTION.DATE
```

El valor proviene del ExecutionContext.

---

## 19. CONTRACT CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT CONTEXT

Un Contract puede declarar requisitos de contexto.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
requires:
    propertyId
    tenantId
```

Si faltan:

```text
AEL-CONTRACT-CONTEXT-001
```

---

## 20. PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER

El Provider implementa la obtención del valor.

Conceptualmente:

```text
Provider
├── id
├── version
├── capabilities
└── resolve()
```

---

## 21. PROVIDER NO CONOCE AEL SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER NO CONOCE AEL SOURCE

El Provider no recibe:

```ael
PARAMETER.TARIFA_M2
```

como texto necesariamente.

Recibe una solicitud estructurada:

```text
ContractRequest
```

---

## 22. CONTRACT REQUEST

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT REQUEST

Conceptualmente:

```text
ContractRequest
├── contractId
├── contractVersion
├── context
├── parameters
└── executionId
```

---

## 23. PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER RESULT

Debe devolver:

```text
ProviderResult
```

que contenga un:

```text
AELValue
```

o un error controlado.

No devolver objetos arbitrarios.

---

## 24. PROVIDER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER ERROR

Modelo:

```text
ProviderError
├── code
├── message
├── retryable
└── metadata
```

No exponer detalles internos.

---

## 25. PROVIDER IMPLEMENTATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER IMPLEMENTATIONS

Ejemplos:

```text
PostgresParameterProvider
PostgresPropertyProvider
SnapshotParameterProvider
MemoryUnitProvider
FakeParameterProvider
```

El Runtime no depende de nombres concretos.

---

## 26. PROVIDER REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER REGISTRY

Debe existir:

```text
ProviderRegistry
```

que resuelva:

```text
providerId
```

a una implementación autorizada.

---

## 27. REGISTRO INMUTABLE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

REGISTRO INMUTABLE

El Runtime no debe permitir que una regla registre un Provider.

Los Providers son infraestructura controlada por AQUILA.

---

## 28. CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY

Una Capability representa una autorización concreta.

Ejemplos:

```text
READ_PARAMETER
READ_PROPERTY
READ_PERIOD
READ_OWNER
```

---

## 29. CAPABILITIES NO SON ROLES

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITIES NO SON ROLES

No confundir:

```text
rol de usuario
```

con:

```text
capability del Runtime
```

Ejemplo:

```text
ADMIN
```

es un rol.

```text
READ_PARAMETER
```

es una capability.

---

## 30. PRINCIPIO DE MENOR PRIVILEGIO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PRINCIPIO DE MENOR PRIVILEGIO

Una regla sólo recibe las capabilities que necesita.

Ejemplo:

```text
Regla CUOTA_ADMIN

Capabilities:
READ_PROPERTY
READ_PARAMETER
```

No:

```text
READ_DATABASE
```

---

## 31. CAPABILITY BINDING

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY BINDING

El Artifact declara:

```text
requiredCapabilities
```

Ejemplo:

```json
{
  "requiredCapabilities": ["READ_PROPERTY", "READ_PARAMETER"]
}
```

---

## 32. VALIDACIÓN PREVIA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

VALIDACIÓN PREVIA

Antes de ejecutar:

```text
Artifact
 ↓
RequiredCapabilities
 ↓
ExecutionContext capabilities
```

Debe cumplirse:

```text
required ⊆ granted
```

---

## 33. CAPABILITY DENIED

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY DENIED

Si falta una capability:

```text
AEL-SECURITY-CAPABILITY-001
```

La ejecución no debe continuar.

---

## 34. CAPABILITY GRANULAR

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY GRANULAR

Evitar:

```text
READ_ALL
```

como capability general.

Preferir:

```text
READ_PARAMETER
READ_PROPERTY
READ_PERIOD
```

y, cuando sea necesario:

```text
READ_PROPERTY_AREA
READ_PROPERTY_OWNER_COUNT
```

---

## 35. CONTRACT + CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT + CAPABILITY

Un Contract debe declarar qué capability requiere.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
requires:
    READ_PROPERTY
```

---

## 36. CONTRACT + PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT + PROVIDER

Ejemplo:

```text
PARAMETER.TARIFA_M2
```

puede estar asociado a:

```text
provider = parameter-provider
```

y:

```text
capability = READ_PARAMETER
```

---

## 37. RESOLUTION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

RESOLUTION FLOW

Flujo:

```text
LOAD_CONTRACT
      ↓
Contract ID
      ↓
Contract Registry
      ↓
Contract Metadata
      ↓
Capability Check
      ↓
Context Validation
      ↓
Provider Registry
      ↓
Provider
      ↓
AELValue
      ↓
Value Stack
```

---

## 38. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT REGISTRY

Debe existir:

```text
ContractRegistry
```

responsable de:

- registrar Contracts;
- obtener metadata;
- resolver versiones;
- verificar compatibilidad;
- declarar capabilities;
- declarar Provider.

---

## 39. REGISTRO DE CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

REGISTRO DE CONTRACTS

El Source AEL no registra Contracts.

La administración ocurre fuera del lenguaje.

---

## 40. PUBLICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PUBLICACIÓN

Un Contract debe pasar por:

```text
DRAFT
 ↓
VALIDATED
 ↓
PUBLISHED
 ↓
DEPRECATED
```

Una versión publicada no se modifica.

---

## 41. DRAFT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

DRAFT

Un Contract en `DRAFT` no puede ser utilizado por Artifacts de producción.

---

## 42. VALIDATED

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

VALIDATED

Se ha verificado:

```text
schema
type
provider
capabilities
scope
version
```

---

## 43. PUBLISHED

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PUBLISHED

Puede ser utilizado por nuevos Artifacts.

---

## 44. DEPRECATED

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

DEPRECATED

Un Contract deprecated puede continuar soportando Artifacts existentes si la política de compatibilidad lo permite.

No debe utilizarse para nuevas publicaciones.

---

## 45. ELIMINACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

ELIMINACIÓN

No eliminar físicamente un Contract utilizado por Artifacts históricos.

Debe conservarse metadata suficiente para auditoría y reproducción.

---

## 46. CONTRACT CATALOG

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT CATALOG

Ejemplo inicial AQUILA:

```text
PROPERTY.AREA_PRIVATE
PROPERTY.AREA_COMMON
PROPERTY.AREA_TOTAL

PARAMETER.TARIFA_M2
PARAMETER.PORCENTAJE_MORA

PERIOD.CURRENT
PERIOD.PREVIOUS

OWNER.COUNT
```

Este catálogo es ilustrativo; los nombres definitivos se establecerán durante el diseño funcional.

---

## 47. CONTRACT DE ÁREA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT DE ÁREA

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

Resultado:

```text
QUANTITY<AREA,M2>
```

---

## 48. CONTRACT DE TARIFA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT DE TARIFA

Ejemplo:

```text
PARAMETER.TARIFA_M2
```

Resultado:

```text
QUANTITY<MONEY/AREA,COP/M2>
```

---

## 49. CONTRACT DE PERIODO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT DE PERIODO

Ejemplo:

```text
PERIOD.CURRENT
```

Puede producir:

```text
PERIOD
```

si el Type System incorpora dicho tipo, o un objeto semántico controlado mediante Functions.

La representación final debe ser coherente con el Type System V1.

---

## 50. CONTRACTS COMPUESTOS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACTS COMPUESTOS

Un Contract puede depender internamente de otros Contracts.

Ejemplo conceptual:

```text
PROPERTY.AREA_BILLABLE
```

puede depender de:

```text
PROPERTY.AREA_PRIVATE
PROPERTY.AREA_COMMON
```

La dependencia debe quedar registrada.

---

## 51. GRAFO DE DEPENDENCIAS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

GRAFO DE DEPENDENCIAS

Debe ser posible representar:

```text
REGLA CUOTA
   │
   ├── PROPERTY.AREA_PRIVATE
   │
   └── PARAMETER.TARIFA_M2
          │
          └── PARAMETER.MONEDA
```

Esto permite análisis de impacto.

---

## 52. CICLOS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CICLOS

Los Contracts no deben generar ciclos no controlados.

Ejemplo:

```text
A → B
B → C
C → A
```

debe ser rechazado durante validación/publicación.

---

## 53. CONTRACT RESOLUTION CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT RESOLUTION CACHE

El Runtime puede cachear resultados por ejecución:

```text
contractId + contextKey
```

No utilizar caché global sin una política de invalidación perfectamente definida.

---

## 54. SNAPSHOT PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

SNAPSHOT PROVIDER

Para simulación y auditoría puede existir:

```text
SnapshotProvider
```

que devuelve valores previamente capturados.

Ejemplo:

```text
PARAMETER.TARIFA_M2
→ 4500 COP/M2
```

---

## 55. SNAPSHOT Y PRODUCCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

SNAPSHOT Y PRODUCCIÓN

La misma regla puede ejecutarse contra:

```text
ProductionProvider
```

o:

```text
SnapshotProvider
```

sin cambiar el Artifact.

---

## 56. BENEFICIO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

BENEFICIO

Esto permite:

```text
SIMULAR
AUDITAR
REPRODUCIR
PROBAR
```

sin duplicar la lógica de AEL.

---

## 57. FAKE PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

FAKE PROVIDER

Para pruebas:

```text
FakeParameterProvider
```

puede devolver valores controlados.

Ejemplo:

```text
TARIFA_M2 = 5000 COP/M2
```

Esto permite tests deterministas.

---

## 58. PROVIDER CONTRACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER CONTRACT TESTS

Cada Provider debe cumplir una suite común:

```text
resolve known contract
unknown contract
missing context
wrong tenant
wrong type
null result
provider error
timeout
```

---

## 59. RESULT TYPE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

RESULT TYPE VALIDATION

El Runtime debe comprobar que el Provider devuelve el tipo declarado.

Si Contract dice:

```text
MONEY<COP>
```

y Provider devuelve:

```text
STRING
```

debe producir:

```text
AEL-PROVIDER-TYPE-001
```

---

## 60. UNIT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

UNIT VALIDATION

Si Contract declara:

```text
M2
```

el Provider no puede devolver:

```text
CM
```

sin una conversión explícita autorizada.

---

## 61. DIMENSION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

DIMENSION VALIDATION

Si Contract declara:

```text
AREA
```

el Provider no puede devolver:

```text
MASS
```

---

## 62. NULL VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

NULL VALIDATION

Si:

```text
nullable = false
```

y Provider devuelve:

```text
NULO
```

debe producir:

```text
AEL-PROVIDER-NULL-001
```

---

## 63. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER TIMEOUT

Cada llamada externa debe tener límite.

Conceptualmente:

```text
providerTimeout
```

Si se excede:

```text
AEL-PROVIDER-TIMEOUT
```

---

## 64. PROVIDER RETRY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER RETRY

Los retries no pertenecen a AEL.

Son responsabilidad de infraestructura.

La regla no debe poder solicitar:

```text
retry 1000 times
```

---

## 65. IDEMPOTENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

IDEMPOTENCIA

Los Providers de lectura son naturalmente idempotentes.

Los Providers futuros de escritura deberán declarar:

```text
idempotent
```

y:

```text
sideEffects
```

---

## 66. ESCRITURAS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

ESCRITURAS

AEL V1 no habilita escritura arbitraria.

No existirán Contracts estándar como:

```text
DATABASE.UPDATE
```

---

## 67. FUTURAS OPERACIONES DE ESCRITURA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

FUTURAS OPERACIONES DE ESCRITURA

Si alguna versión futura las requiere, deberán pasar por:

```text
Capability
Transaction
Audit
Authorization
Idempotency
```

y no serán equivalentes a una lectura.

---

## 68. DATOS SENSIBLES

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

DATOS SENSIBLES

Un Provider no debe devolver datos que la regla no necesita.

Ejemplo:

Una regla que necesita:

```text
AREA_PRIVATE
```

no debe recibir:

```text
nombre_propietario
correo
teléfono
documentos
```

---

## 69. DATA MINIMIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

DATA MINIMIZATION

El Contract debe definir el mínimo dato necesario para la regla.

Esto mejora:

- seguridad;
- rendimiento;
- privacidad;
- auditoría.

---

## 70. CONTRACT RESPONSE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT RESPONSE

Idealmente:

```text
PROPERTY.AREA_PRIVATE
→ 120.50 M2
```

y no:

```json
{
  "id": 123,
  "name": "...",
  "owner": "...",
  "area": 120.5,
  "email": "...",
  "phone": "..."
}
```

---

## 71. DOMAIN OBJECTS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

DOMAIN OBJECTS

Si una regla necesita un conjunto estructurado de datos, debe existir un Contract explícito con un esquema controlado.

No entregar objetos arbitrarios.

---

## 72. SCHEMA VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

SCHEMA VERSION

Los Contracts complejos deben versionar su schema.

Ejemplo:

```text
PROPERTY.SUMMARY@1
```

---

## 73. PROVIDER VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER VERSION

El Provider también puede versionarse:

```text
property-provider@2
```

La implementación del Provider puede evolucionar mientras preserve el Contract.

---

## 74. CONTRACT COMO CONTRATO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT COMO CONTRATO

El principio:

```text
Contract
=
interfaz estable
```

El Provider:

```text
=
implementación
```

AEL:

```text
=
consumidor
```

---

## 75. NO ACOPLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

NO ACOPLAMIENTO

AEL no debe saber:

```text
PostgreSQL
Supabase
Prisma
REST
GraphQL
```

Los Providers pueden utilizar cualquiera de estas tecnologías.

---

## 76. TEST DE PORTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE PORTABILIDAD

Un Contract:

```text
PARAMETER.TARIFA_M2
```

debe poder ser resuelto por:

```text
PostgresProvider
```

y:

```text
SnapshotProvider
```

produciendo el mismo `AELValue`.

---

## 77. TENANT ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TENANT ISOLATION

Cada Provider debe recibir el contexto suficiente para aplicar:

```text
tenantId
```

y cualquier otro scope.

Nunca confiar exclusivamente en un `tenantId` enviado por el Source.

---

## 78. CONTEXTO DERIVADO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTEXTO DERIVADO

El tenant efectivo debe derivarse del contexto autenticado de ejecución.

Conceptualmente:

```text
AuthenticatedExecution
        ↓
ExecutionContext
        ↓
Provider
```

---

## 79. RLS DEFENSE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

RLS DEFENSE

En PostgreSQL/Supabase:

```text
Provider
 ↓
Repository
 ↓
RLS
```

debe impedir acceso cruzado incluso si existe un bug en capas superiores.

---

## 80. AUDITORÍA DE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

AUDITORÍA DE CONTRACT

Una ejecución puede registrar:

```text
contractId
contractVersion
providerId
providerVersion
resolvedAt
```

cuando la política de auditoría lo requiera.

---

## 81. AUDITORÍA DE VALOR

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

AUDITORÍA DE VALOR

Para reglas críticas puede registrarse:

```text
contract
valor obtenido
unidad
versión
```

Debe aplicarse una política de privacidad y retención.

---

## 82. PROVIDER OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER OBSERVABILITY

Métricas:

```text
providerCalls
providerDuration
providerErrors
providerTimeouts
cacheHits
cacheMisses
```

---

## 83. CONTRACT DEPENDENCY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT DEPENDENCY ANALYSIS

A partir de un Artifact debe poder conocerse:

```text
qué Contracts utiliza
qué Functions utiliza
qué capabilities requiere
```

Esto permite revisar una regla antes de publicarla.

---

## 84. CAPABILITY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY ANALYSIS

El Builder puede producir:

```text
RequiredCapabilities
```

automáticamente a partir de las dependencias.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
→ READ_PROPERTY

PARAMETER.TARIFA_M2
→ READ_PARAMETER
```

Resultado:

```text
READ_PROPERTY
READ_PARAMETER
```

---

## 85. EXPLICIT VS DERIVED CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

EXPLICIT VS DERIVED CAPABILITIES

La regla no debería declarar manualmente todas sus capabilities.

El sistema debe derivarlas de los Contracts y Functions utilizados.

Esto evita:

```text
Contract requires A
Artifact declares B
```

por error humano.

---

## 86. CAPABILITY CLOSURE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY CLOSURE

El Artifact debe contener el conjunto final:

```text
capabilityClosure
```

que incluya:

```text
direct capabilities
+
dependencies capabilities
```

---

## 87. FUNCTION CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

FUNCTION CAPABILITIES

Una Function también puede requerir capabilities.

Ejemplo futuro:

```text
CONVERTIR_MONEDA
```

podría requerir:

```text
READ_EXCHANGE_RATE
```

El Artifact debe incorporar esa dependencia.

---

## 88. CAPABILITY TRANSITIVA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CAPABILITY TRANSITIVA

Si:

```text
Rule
 ↓
Function A
 ↓
Contract B
 ↓
Capability C
```

la capability C debe quedar contemplada en la validación.

---

## 89. SECURITY REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

SECURITY REVIEW

Antes de publicar un Artifact se debe poder responder:

```text
¿Qué puede leer esta regla?
```

mediante:

```text
Contracts
+
Capabilities
+
Providers
```

---

## 90. PRINCIPIO DE VISIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PRINCIPIO DE VISIBILIDAD

No existe:

```text
"la regla puede acceder a todo porque el usuario tiene permiso"
```

La autorización debe producirse en capas.

```text
Usuario
 ↓
Regla
 ↓
Capability
 ↓
Contract
 ↓
Provider
 ↓
RLS
```

---

## 91. CONTRACT NAMING

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRACT NAMING

Los nombres deben ser semánticos.

Preferir:

```text
PROPERTY.AREA_PRIVATE
```

sobre:

```text
PROPERTY.FIELD_17
```

---

## 92. ESTABILIDAD DEL NOMBRE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

ESTABILIDAD DEL NOMBRE

Una vez publicado:

```text
PROPERTY.AREA_PRIVATE
```

no debe cambiar de significado.

Si cambia significativamente:

```text
nuevo Contract
```

o:

```text
nueva versión incompatible
```

---

## 93. CONTRATOS DE DOMINIO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRATOS DE DOMINIO

El catálogo inicial debe cubrir únicamente necesidades reales de AQUILA.

No crear cientos de Contracts "por si acaso".

---

## 94. EVOLUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

EVOLUCIÓN

Los Contracts deben crecer de manera controlada:

```text
necesidad de negocio
 ↓
diseño
 ↓
schema
 ↓
capability
 ↓
provider
 ↓
tests
 ↓
publication
```

---

## 95. TEST CANÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST CANÓNICO

Regla:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

Contracts:

```text
PROPERTY.AREA_PRIVATE
→ 120.50 M2

PARAMETER.TARIFA_M2
→ 4500 COP/M2
```

Capabilities:

```text
READ_PROPERTY
READ_PARAMETER
```

Resultado:

```text
542250 COP
```

---

## 96. TEST DE CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE CAPABILITY

Si el contexto sólo contiene:

```text
READ_PROPERTY
```

y falta:

```text
READ_PARAMETER
```

la ejecución debe ser rechazada antes de resolver la tarifa.

---

## 97. TEST DE TENANT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE TENANT

Contexto:

```text
tenant = A
```

Contract:

```text
PROPERTY.AREA_PRIVATE
```

Provider debe obtener sólo información de:

```text
tenant A
```

Nunca:

```text
tenant B
```

---

## 98. TEST DE TIPO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE TIPO

Contract:

```text
PARAMETER.TARIFA_M2
```

declara:

```text
COP/M2
```

Provider devuelve:

```text
5000 KG
```

Resultado:

```text
AEL-PROVIDER-TYPE-001
```

---

## 99. TEST DE SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE SNAPSHOT

Production:

```text
4500 COP/M2
```

Snapshot:

```text
4500 COP/M2
```

Mismo Artifact.

Resultado:

```text
542250 COP
```

---

## 100. TEST DE VERSIONADO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE VERSIONADO

Artifact:

```text
PARAMETER.TARIFA_M2@1
```

debe continuar siendo reproducible aunque exista:

```text
PARAMETER.TARIFA_M2@2
```

---

## 101. TEST DE CONTRACT DESACTIVADO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE CONTRACT DESACTIVADO

Si un Contract está:

```text
DEPRECATED
```

debe existir una política clara:

```text
Artifact histórico → puede ejecutarse
Nuevo Artifact → no puede utilizarlo
```

cuando sea compatible con la estrategia de migración.

---

## 102. TEST DE PROVIDER FALLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

TEST DE PROVIDER FALLBACK

No debe existir fallback silencioso:

```text
Provider A falla
↓
usar Provider B
```

salvo que esté definido explícitamente.

Los cambios de fuente pueden modificar resultados y romper reproducibilidad.

---

## 103. REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

REPRODUCIBILIDAD

Para reconstruir una ejecución se debe conocer:

```text
Artifact
Contract versions
Provider versions
ExecutionContext
Snapshot cuando corresponda
Runtime version
```

---

## 104. CONTRATOS Y ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CONTRATOS Y ARTIFACT

El Artifact debe almacenar referencias a:

```text
contractId
contractVersion
```

Nunca únicamente:

```text
contractName
```

---

## 105. PROVIDER Y ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PROVIDER Y ARTIFACT

El Artifact puede declarar el Provider requerido o, preferiblemente, el Contract y su política de resolución.

La elección de implementación puede quedar en infraestructura si mantiene la semántica y compatibilidad.

---

## 106. PORTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PORTABILIDAD

Un Artifact no debería depender de:

```text
PostgresProvider v1
```

si puede depender de:

```text
PARAMETER.TARIFA_M2@1
```

y permitir que infraestructura elija un Provider compatible.

Esto mejora portabilidad.

---

## 107. PRINCIPIO FINAL DE DEPENDENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PRINCIPIO FINAL DE DEPENDENCIA

La dependencia debe apuntar:

```text
AEL
 ↓
Contract
```

no:

```text
AEL
 ↓
PostgreSQL
```

---

## 108. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

CRITERIO DE CIERRE

El sistema de Contracts, Providers y Capabilities V1 estará completo cuando pueda:

```text
✓ definir Contract
✓ versionarlo
✓ publicarlo
✓ declararlo en Artifact
✓ resolverlo
✓ validar contexto
✓ validar tipo
✓ validar unidad
✓ validar dimensión
✓ validar nullability
✓ validar capability
✓ aplicar tenant isolation
✓ utilizar Provider
✓ utilizar Snapshot
✓ utilizar Fake Provider
✓ auditar dependencia
✓ medir ejecución
✓ detectar ciclos
✓ preservar reproducibilidad
```

---

## 109. ARQUITECTURA FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

ARQUITECTURA FINAL

```text
                    AEL RULE
                       │
                       ▼
                    ARTIFACT
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        CAPABILITIES          CONTRACTS
             │                   │
             └─────────┬─────────┘
                       ▼
                CONTRACT RESOLVER
                       │
                       ▼
                 PROVIDER REGISTRY
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
           Postgres  Snapshot   Fake
              │        │        │
              └────────┼────────┘
                       ▼
                    AELValue
                       │
                       ▼
                  VALUE STACK
                       │
                       ▼
                    RUNTIME
```

---

## 110. PRINCIPIO ARQUITECTÓNICO DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_Contracts_Providers_Capabilities 6.md

PRINCIPIO ARQUITECTÓNICO DEFINITIVO

AEL debe permanecer deliberadamente ignorante de la infraestructura.

La regla sólo debe saber:

```text
qué dato necesita
```

El Contract define:

```text
qué significa
```

El Capability define:

```text
si puede accederse
```

El Provider define:

```text
cómo obtenerlo
```

La infraestructura define:

```text
dónde vive
```

Y RLS define:

```text
qué datos pueden atravesar realmente la última frontera de seguridad
```

---

# FIN DEL DOCUMENTO 06

## AEL V1 — Contracts, Providers y Capabilities

## 111. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

OBJETIVO

Evolucionar AEL-001 desde:

```text
InMemoryContractProvider
```

hacia:

```text
AEL Runtime
    ↓
ContractProvider
    ↓
AQUILA Adapter
    ↓
Domain Services / PostgreSQL
```

incorporando además:

```text
FunctionRegistry
CapabilityPolicy
Contract Registry
Provider validation
Tenant context
Audit context
```

---

## 112. ALCANCE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

ALCANCE

AEL-002 cubre:

```text
Contracts
Providers
Functions
Capabilities
Execution Context
Tenant Isolation
Provider Validation
Function Validation
Security Enforcement
Caching boundaries
Testing
```

No cubre todavía:

```text
Rule persistence
Publication workflow
HTTP API final
Nuxt UI
Production deployment
```

---

## 113. ARQUITECTURA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

ARQUITECTURA

```text
                 AEL Runtime
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Contracts   Functions  Security
          │          │          │
          ▼          ▼          ▼
       Provider    Registry    Policy
          │
          ▼
     AQUILA Adapter
          │
          ▼
     AQUILA Services
          │
          ▼
     PostgreSQL / RLS
```

---

## 114. REGLA FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

REGLA FUNDAMENTAL

El Runtime no debe importar:

```text
supabase-js
pg
Prisma
Drizzle
Nuxt
HTTP client
```

---

## 115. CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT

Un Contract es el acuerdo semántico que permite a AEL solicitar un dato.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE@1
```

---

## 116. CONTRACT IDENTITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT IDENTITY

La identidad mínima:

```text
namespace
name
version
```

Ejemplo:

```text
PROPERTY
AREA_PRIVATE
1
```

---

## 117. CONTRACT DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT DEFINITION

```ts
interface ContractDefinition {
  readonly ref: ContractRef
  readonly type: AELType
  readonly nullable: boolean
  readonly capability: Capability
}
```

Puede incluir:

```text
dimension
unit
currency
documentation
```

---

## 118. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT REGISTRY

Responsable exclusivamente de:

```text
metadata
resolution
compatibility
```

No debe ejecutar consultas.

---

## 119. CONTRACT REGISTRY PORT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT REGISTRY PORT

```ts
interface ContractRegistry {
  resolve(ref: ContractRef): ContractDefinition | undefined
}
```

---

## 120. CONTRACT PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT PROVIDER

Responsable de obtener el valor.

```ts
interface ContractProvider {
  resolve(ref: ContractRef, context: ExecutionContext): Promise<AELValue>
}
```

---

## 121. REGISTRY VS PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

REGISTRY VS PROVIDER

Separación obligatoria:

```text
Registry
→ ¿Qué significa este Contract?

Provider
→ ¿Cuál es su valor en este contexto?
```

---

## 122. PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER RESULT

El Provider devuelve:

```text
AELValue
```

Nunca:

```text
database row
```

como resultado directo del Runtime.

---

## 123. PROVIDER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER VALIDATION

Después de recibir el valor:

```text
validate type
validate dimension
validate unit
validate currency
validate nullability
```

contra el ContractDefinition.

---

## 124. INVALID PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

INVALID PROVIDER RESULT

Si el Provider devuelve un valor incompatible:

```text
AEL-PROVIDER-INVALID-VALUE
```

y la ejecución debe detenerse.

---

## 125. CONTRACT EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT EXAMPLE

```text
PROPERTY.AREA_PRIVATE@1
```

Definition:

```text
type       = QUANTITY
dimension  = AREA
unit       = M2
nullable   = false
capability = READ_PROPERTY
```

---

## 126. RATE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

RATE CONTRACT

```text
PARAMETER.TARIFA_M2@1
```

Definition conceptual:

```text
type       = RATE
dimension  = MONEY_PER_AREA
currency   = COP
nullable   = false
capability = READ_PARAMETER
```

---

## 127. RATE TYPE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

RATE TYPE

Si `RATE` se modela como una especialización de Quantity, la representación interna debe conservar suficiente información para comprobar:

```text
AREA × MONEY_PER_AREA = MONEY
```

---

## 128. CONTRACT VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT VERSIONING

Un cambio semántico debe crear:

```text
new version
```

No modificar silenciosamente:

```text
@1
```

---

## 129. CONTRACT COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT COMPATIBILITY

Una versión nueva puede ser:

```text
compatible
```

pero no debe asumirse compatibilidad automáticamente.

Debe existir una política explícita.

---

## 130. PROVIDER ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER ADAPTER

AQUILA implementará:

```ts
class AquilaContractProvider
  implements ContractProvider
```

---

## 131. PROVIDER DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER DEPENDENCIES

El adapter puede depender de:

```text
PropertyService
ParameterService
Repository
Supabase
PostgreSQL
```

pero sólo fuera del Runtime.

---

## 132. PROVIDER ROUTING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER ROUTING

El Provider puede utilizar:

```text
ContractDefinition.providerKey
```

para seleccionar el adapter apropiado.

---

## 133. PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER KEY

Ejemplos:

```text
property
parameter
owner
billing
```

---

## 134. NO DYNAMIC PROVIDER CODE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NO DYNAMIC PROVIDER CODE

Nunca permitir:

```text
providerKey = "javascript expression"
```

El Provider debe estar registrado.

---

## 135. PROVIDER REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER REGISTRY

Puede existir:

```ts
interface ProviderRegistry {
  resolve(providerKey: string): ContractProvider
}
```

---

## 136. PROVIDER RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER RESOLUTION

El Runtime puede utilizar:

```text
Contract
 ↓
Contract Registry
 ↓
ProviderKey
 ↓
Provider Registry
 ↓
Provider
```

---

## 137. CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CAPABILITY

Una Capability representa una autorización técnica de AEL.

Ejemplo:

```text
READ_PROPERTY
```

---

## 138. CAPABILITY DERIVATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CAPABILITY DERIVATION

El Analyzer deriva capabilities desde los Contracts/Functions utilizados.

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

produce:

```text
READ_PROPERTY
```

---

## 139. CAPABILITY MANIFEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CAPABILITY MANIFEST

El Artifact debe conservar:

```json
{
  "capabilities": ["READ_PROPERTY", "READ_PARAMETER"]
}
```

---

## 140. RUNTIME CAPABILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

RUNTIME CAPABILITY CHECK

Antes de ejecutar:

```text
LOAD_CONTRACT
```

el Runtime debe verificar:

```text
required capability
```

---

## 141. CAPABILITY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CAPABILITY POLICY

```ts
interface CapabilityPolicy {
  isAllowed(capability: Capability, context: ExecutionContext): boolean
}
```

---

## 142. DENIED CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DENIED CAPABILITY

Si no está permitida:

```text
AEL-SECURITY-CAPABILITY-DENIED
```

La ejecución debe terminar.

---

## 143. NO CLIENT-SUPPLIED CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NO CLIENT-SUPPLIED CAPABILITIES

El cliente no puede enviar:

```json
{
  "capabilities": ["READ_PROPERTY", "ADMIN_DATABASE"]
}
```

para otorgarse permisos.

---

## 144. EFFECTIVE CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

EFFECTIVE CAPABILITIES

Las capabilities efectivas son la intersección entre:

```text
Artifact requirements
```

y:

```text
SecurityPolicy authorization
```

---

## 145. TENANT CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

TENANT CONTEXT

ExecutionContext debe contener:

```ts
tenantId
```

---

## 146. TENANT ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

TENANT ISOLATION

El Provider debe recibir:

```text
tenantId
```

y utilizarlo para resolver datos.

---

## 147. TENANT NO OVERRIDE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

TENANT NO OVERRIDE

El Source AEL no puede seleccionar arbitrariamente otro tenant.

---

## 148. PROVIDER TENANT CHECK

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER TENANT CHECK

El adapter debe verificar:

```text
requested tenant
authenticated tenant
```

según el contexto autorizado.

---

## 149. RLS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

RLS

Aunque el Provider aplique tenant filtering:

```text
PostgreSQL RLS
```

continúa siendo defensa adicional.

---

## 150. CROSS-TENANT TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CROSS-TENANT TEST

Debe existir un test:

```text
Tenant A executes Rule
Provider contains Tenant B data
```

Resultado:

```text
Tenant B data inaccessible
```

---

## 151. ACTOR CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

ACTOR CONTEXT

Puede incluir:

```text
actorId
roles
permissions
```

según necesidades de AQUILA.

---

## 152. EXECUTION CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

EXECUTION CONTEXT IMMUTABILITY

Una vez iniciada la ejecución:

```text
tenantId
ruleId
ruleVersionId
executionId
capabilities
```

no deben modificarse.

---

## 153. EXECUTION CONTEXT FACTORY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

EXECUTION CONTEXT FACTORY

Crear:

```ts
ExecutionContextFactory
```

responsable de construir contexto válido.

---

## 154. CONTEXT SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTEXT SOURCE

El contexto debe construirse desde:

```text
authenticated request
rule version
security policy
```

no desde Source AEL.

---

## 155. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION REGISTRY

El Runtime necesita un registry controlado:

```ts
interface RuntimeFunctionRegistry {
  resolve(ref: FunctionRef): AELFunction | undefined
}
```

---

## 156. FUNCTION DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION DEFINITION

Debe contener:

```text
name
version
signature
documentation
```

---

## 157. FUNCTION IMPLEMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION IMPLEMENTATION

Implementación interna:

```ts
interface AELFunction {
  readonly definition: FunctionDefinition

  execute(args: readonly AELValue[], context: ExecutionContext): AELValue
}
```

---

## 158. FUNCTION REGISTRATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION REGISTRATION

Las Functions se registran explícitamente.

No existe:

```text
dynamic function loading
```

desde Source.

---

## 159. ALLOWLIST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

ALLOWLIST

Sólo Functions registradas pueden ejecutarse.

---

## 160. FUNCTION EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION EXAMPLE

```text
REDONDEAR_DINERO@1
```

Puede recibir:

```text
MONEY
NUMBER
```

y devolver:

```text
MONEY
```

según su signature.

---

## 161. FUNCTION TYPE CHECK

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION TYPE CHECK

El Analyzer debe validar:

```text
argument count
argument types
return type
```

---

## 162. FUNCTION RUNTIME CHECK

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION RUNTIME CHECK

El Runtime debe realizar validación defensiva.

---

## 163. FUNCTION CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION CAPABILITY

Una Function puede declarar:

```text
requiredCapabilities
```

si realiza operaciones sensibles.

---

## 164. PURE FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PURE FUNCTIONS

Preferir Functions puras para operaciones matemáticas:

```text
REDONDEAR
ABS
MIN
MAX
```

---

## 165. IMPURE FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

IMPURE FUNCTIONS

Si una Function requiere acceso externo:

```text
capability
timeout
resource limits
```

debe ser explícita.

---

## 166. NO SIDE EFFECTS BY DEFAULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NO SIDE EFFECTS BY DEFAULT

Las Functions AEL-002 no deben modificar:

```text
database
files
network
```

salvo que exista una capacidad específicamente aprobada.

---

## 167. FUNCTION TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION TIMEOUT

Una Function externa debe respetar:

```text
ExecutionLimits
```

---

## 168. FUNCTION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION ERROR

Errores deben normalizarse:

```text
AEL-FUNCTION-ERROR
```

con categoría interna.

---

## 169. FUNCTION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION VERSION

Una RuleVersion publicada debe conservar:

```text
function@version
```

para reproducibilidad.

---

## 170. DEPENDENCY MANIFEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DEPENDENCY MANIFEST

Artifact debe contener:

```text
Contracts
Functions
Capabilities
```

con versiones.

---

## 171. EXAMPLE MANIFEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

EXAMPLE MANIFEST

```json
{
  "contracts": ["PROPERTY.AREA_PRIVATE@1", "PARAMETER.TARIFA_M2@1"],
  "functions": [],
  "capabilities": ["READ_PROPERTY", "READ_PARAMETER"]
}
```

---

## 172. MANIFEST VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

MANIFEST VALIDATION

Antes de ejecutar:

```text
all dependencies resolvable
all versions compatible
all capabilities allowed
```

---

## 173. MISSING CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

MISSING CONTRACT

Si falta:

```text
AEL-CONTRACT-NOT-FOUND
```

---

## 174. INCOMPATIBLE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

INCOMPATIBLE CONTRACT

Si la versión no es compatible:

```text
AEL-CONTRACT-INCOMPATIBLE
```

---

## 175. MISSING FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

MISSING FUNCTION

```text
AEL-FUNCTION-NOT-FOUND
```

---

## 176. INCOMPATIBLE FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

INCOMPATIBLE FUNCTION

```text
AEL-FUNCTION-INCOMPATIBLE
```

---

## 177. DEPENDENCY RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DEPENDENCY RESOLUTION

No resolver dependencias de manera implícitamente diferente entre:

```text
test
simulation
production
```

La política debe ser consistente.

---

## 178. SNAPSHOT MODE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

SNAPSHOT MODE

Para reproducción:

```text
SnapshotContractProvider
```

puede sustituir al Provider real.

---

## 179. LIVE MODE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

LIVE MODE

Producción:

```text
AquilaContractProvider
```

---

## 180. PROVIDER MODES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER MODES

```text
LIVE
SNAPSHOT
TEST
```

---

## 181. MODE RESTRICTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

MODE RESTRICTION

Una ejecución de auditoría histórica debe poder forzar:

```text
SNAPSHOT
```

cuando exista snapshot válido.

---

## 182. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CACHE

Puede existir cache de Contract values.

Pero el cache key debe incluir:

```text
tenant
contract
version
context
```

cuando el contexto afecte el valor.

---

## 183. NO GLOBAL VALUE CACHE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NO GLOBAL VALUE CACHE

No utilizar:

```text
contractCode → value
```

sin tenant/context.

---

## 184. CACHE TTL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CACHE TTL

Debe ser explícito.

No cachear indefinidamente datos de negocio por defecto.

---

## 185. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CACHE INVALIDATION

Si un Contract representa datos dinámicos:

```text
TTL
event
explicit invalidation
```

según arquitectura.

---

## 186. PROVIDER OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER OBSERVABILITY

Cada llamada debe poder registrar:

```text
providerKey
contract
duration
status
```

sin registrar datos sensibles innecesarios.

---

## 187. PROVIDER CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER CORRELATION

Usar:

```text
correlationId
executionId
```

para tracing.

---

## 188. PROVIDER AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER AUDIT

El acceso a datos críticos puede requerir audit adicional.

No todo read necesita convertirse automáticamente en un audit pesado.

---

## 189. PROVIDER DATA CLASSIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER DATA CLASSIFICATION

El adapter debe respetar la clasificación del Contract.

---

## 190. PROVIDER OUTPUT SANITIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER OUTPUT SANITIZATION

Nunca devolver:

```text
database entity
```

completa si el Contract sólo requiere:

```text
area
```

---

## 191. DATA MINIMIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DATA MINIMIZATION

Provider debe obtener sólo los datos necesarios.

---

## 192. PROPERTY PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROPERTY PROVIDER

Ejemplo conceptual:

```text
PropertyAreaProvider
```

resuelve:

```text
PROPERTY.AREA_PRIVATE
```

---

## 193. PARAMETER PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PARAMETER PROVIDER

Ejemplo:

```text
ParameterValueProvider
```

resuelve:

```text
PARAMETER.TARIFA_M2
```

---

## 194. ADAPTER COMPOSITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

ADAPTER COMPOSITION

Puede existir un:

```text
CompositeContractProvider
```

que delegue:

```text
property → PropertyProvider
parameter → ParameterProvider
```

---

## 195. COMPOSITE PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

COMPOSITE PROVIDER

```ts
class CompositeContractProvider
  implements ContractProvider
```

debe resolver según `providerKey`.

---

## 196. UNKNOWN PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

UNKNOWN PROVIDER

Si el `providerKey` no existe:

```text
AEL-PROVIDER-NOT-FOUND
```

---

## 197. PROVIDER REGISTRY SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER REGISTRY SECURITY

El registry debe ser configuración del sistema.

No editable por el Source AEL.

---

## 198. SECURITY POLICY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

SECURITY POLICY MATRIX

Ejemplo:

```text
Capability          Allowed
READ_PROPERTY       yes
READ_PARAMETER      yes
WRITE_DATABASE      no
HTTP_REQUEST        no
FILESYSTEM          no
```

---

## 199. DEFAULT DENY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DEFAULT DENY

Toda capability no declarada:

```text
DENY
```

---

## 200. CAPABILITY NAMESPACE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CAPABILITY NAMESPACE

Recomendación:

```text
READ_PROPERTY
READ_PARAMETER
READ_OWNER
```

y posteriormente:

```text
WRITE_*
HTTP_*
FILE_*
```

si alguna vez son necesarias.

---

## 201. SECURITY SEPARATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

SECURITY SEPARATION

Separar:

```text
AEL capability
```

de:

```text
AQUILA application permission
```

---

## 202. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

EXAMPLE

Usuario puede tener:

```text
RULE_EXECUTE
```

pero la Rule puede requerir:

```text
READ_PROPERTY
```

Ambas autorizaciones deben cumplirse.

---

## 203. AUTHORIZATION FLOW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

AUTHORIZATION FLOW

```text
User
 ↓
AQUILA authorization
 ↓
Rule permission
 ↓
Artifact capabilities
 ↓
SecurityPolicy
 ↓
Provider
```

---

## 204. FAIL CLOSED

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FAIL CLOSED

Si cualquier capa no puede demostrar autorización:

```text
DENY
```

---

## 205. PROVIDER FAILURE POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER FAILURE POLICY

No devolver:

```text
0
null
empty
```

como fallback silencioso.

---

## 206. DATA UNAVAILABLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DATA UNAVAILABLE

Si un Contract requerido no puede resolverse:

```text
execution FAILED
```

---

## 207. DEFAULT VALUE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DEFAULT VALUE

No permitir defaults implícitos salvo que el Contract los declare explícitamente.

---

## 208. NULL SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NULL SEMANTICS

Un Contract nullable puede devolver:

```text
null
```

si la semántica AEL lo soporta.

La propagación debe ser consistente.

---

## 209. AEL-002 TEST MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

AEL-002 TEST MATRIX

Debe cubrir:

```text
Contract exists
Contract missing
Contract incompatible
Provider missing
Provider timeout
Provider invalid value
Function exists
Function missing
Function wrong arguments
Capability allowed
Capability denied
Tenant A
Tenant B
Snapshot
Live
```

---

## 210. CANONICAL INTEGRATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CANONICAL INTEGRATION TEST

```text
Rule
 ↓
Artifact
 ↓
ExecutionContext
 ↓
CompositeProvider
 ├── PropertyProvider
 └── ParameterProvider
 ↓
Runtime
 ↓
542250 COP
```

---

## 211. TENANT TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

TENANT TEST

```text
Tenant A
AREA = 120.50 M2

Tenant B
AREA = 200.00 M2
```

Ejecutar la misma RuleVersion separadamente.

Resultados:

```text
Tenant A → 542250 COP
Tenant B → según tarifa/contexto B
```

Nunca mezclar datos.

---

## 212. SNAPSHOT TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

SNAPSHOT TEST

Crear snapshot:

```text
AREA = 120.50 M2
TARIFA = 4500 COP/M2
```

Modificar datos reales.

Ejecutar en:

```text
SNAPSHOT
```

Resultado debe permanecer:

```text
542250 COP
```

---

## 213. LIVE TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

LIVE TEST

Ejecutar:

```text
LIVE
```

debe utilizar datos actuales autorizados.

---

## 214. CAPABILITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CAPABILITY TEST

Eliminar:

```text
READ_PROPERTY
```

del effective capability set.

Resultado:

```text
DENIED
```

---

## 215. PROVIDER TYPE TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PROVIDER TYPE TEST

Hacer que PropertyProvider devuelva:

```text
STRING
```

para un Contract:

```text
QUANTITY
```

Resultado:

```text
INVALID VALUE
```

---

## 216. FUNCTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION TEST

Registrar:

```text
REDONDEAR_DINERO@1
```

y verificar:

```text
Analyzer
Runtime
```

contra la misma signature.

---

## 217. FUNCTION DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION DETERMINISM

Una Function declarada como pura debe producir:

```text
same input
→
same output
```

---

## 218. FUNCTION REGISTRY VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION REGISTRY VERSION

Una Function eliminada no debe romper históricamente un Artifact si su versión necesaria sigue disponible.

---

## 219. FUNCTION DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

FUNCTION DEPRECATION

Puede marcarse:

```text
DEPRECATED
```

pero no eliminarse mientras existan Artifacts activos que la requieran.

---

## 220. CONTRACT DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

CONTRACT DEPRECATION

Misma regla:

```text
DEPRECATED
```

no significa:

```text
immediately unavailable
```

---

## 221. REVOCATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

REVOCATION

Si un Contract/Function es revocado por seguridad:

```text
execution denied
```

para Artifacts afectados.

---

## 222. IMPACT ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

IMPACT ANALYSIS

Debe poder consultarse:

```text
Contract
 ↓
Rules
 ↓
RuleVersions
```

---

## 223. DEPENDENCY GRAPH

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DEPENDENCY GRAPH

Conceptualmente:

```text
RuleVersion
 ├── Contract
 ├── Contract
 └── Function
```

---

## 224. SECURITY REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

SECURITY REVIEW

Antes de marcar AEL-002 completo:

```text
capability bypass tests
tenant isolation tests
provider spoofing tests
function injection tests
```

deben pasar.

---

## 225. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PERFORMANCE

Medir:

```text
registry lookup
provider lookup
provider latency
function lookup
```

---

## 226. NO PREMATURE CACHE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NO PREMATURE CACHE

Primero medir.

Después optimizar.

---

## 227. INTERFACE STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

INTERFACE STABILITY

Los Ports:

```text
ContractProvider
ContractRegistry
FunctionRegistry
CapabilityPolicy
```

son contratos internos fundamentales.

---

## 228. DEPENDENCY INJECTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

DEPENDENCY INJECTION

El Runtime debe construirse así conceptualmente:

```ts
new Runtime({
  contractProvider,
  functionRegistry,
  capabilityPolicy,
  clock,
})
```

---

## 229. TEST COMPOSITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

TEST COMPOSITION

Test:

```ts
Runtime + FakeProvider + FakeFunctions + TestPolicy
```

sin infraestructura real.

---

## 230. PRODUCTION COMPOSITION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

PRODUCTION COMPOSITION

Producción:

```ts
Runtime + AquilaProvider + ProductionFunctions + ProductionPolicy
```

---

## 231. COMPOSITION ROOT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

COMPOSITION ROOT

La composición debe ocurrir fuera del Runtime:

```text
API
Worker
CLI
```

son candidatos para el composition root.

---

## 232. NO SERVICE LOCATOR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

NO SERVICE LOCATOR

No permitir que Runtime busque globalmente:

```text
ProviderRegistry.get(...)
```

mediante singleton oculto.

---

## 233. EXPLICIT DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

EXPLICIT DEPENDENCIES

Las dependencias deben ser explícitas por constructor/factory.

---

## 234. TESTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

TESTABILITY

Si una dependencia es difícil de fakear:

```text
revisar boundary
```

antes de introducir mocks complejos.

---

## 235. LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

LOGGING

El Runtime puede emitir eventos técnicos:

```text
contract_resolved
function_called
capability_denied
execution_failed
```

pero la infraestructura decide cómo se almacenan.

---

## 236. OBSERVABILITY PORT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

OBSERVABILITY PORT

Puede existir:

```ts
interface RuntimeObserver {
  onContractResolved(...)
  onFunctionCalled(...)
  onExecutionCompleted(...)
}
```

---

## 237. OBSERVER MUST NOT CHANGE SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

OBSERVER MUST NOT CHANGE SEMANTICS

Un observer nunca debe:

```text
modify value
change authorization
alter execution
```

---

## 238. AUDIT VS OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

AUDIT VS OBSERVABILITY

Separar:

```text
Audit
```

de:

```text
Metrics/Logs/Tracing
```

---

## 239. AEL-002 EXIT CRITERIA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

AEL-002 EXIT CRITERIA

```text
✓ ContractRegistry implemented
✓ ContractProvider implemented
✓ CompositeProvider implemented
✓ FunctionRegistry implemented
✓ CapabilityPolicy implemented
✓ ExecutionContext secure
✓ Tenant isolation tested
✓ Provider output validated
✓ Dependency manifest validated
✓ Snapshot mode supported
✓ Live mode supported
✓ Function versioning supported
✓ Security tests pass
✓ Canonical integration works
```

---

## 240. MILESTONE RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

MILESTONE RESULT

La arquitectura pasa de:

```text
AEL Runtime
+
Fake Provider
```

a:

```text
AEL Runtime
+
stable Ports
+
AQUILA adapters
```

sin contaminar el Core.

---

## 241. ARQUITECTURA FINAL AEL-002

> **Origen:** Motor de liquidacion_AEL_V1_AEL_002_Contracts_Providers_Functions_Capabilities 18.md

ARQUITECTURA FINAL AEL-002

```text
                        AQUILA
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        Authorization              Composition Root
                                         │
                                         ▼
                                  ┌─────────────┐
                                  │ AEL Runtime │
                                  └──────┬──────┘
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  ▼                      ▼                      ▼
           ContractProvider       FunctionRegistry      CapabilityPolicy
                  │                      │                      │
                  ▼                      ▼                      ▼
          AQUILA Adapters         Registered funcs       Security rules
                  │
                  ▼
             PostgreSQL
                  │
                 RLS
```

---

## 242. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

OBJETIVO

Definir:

```text
Contract
Contract Definition
Contract Registry
Contract Version
Contract Type
Dimensions
Capabilities
Provider Mapping
Validation
Publication
Deprecation
Compatibility
```

---

## 243. QUÉ ES UN CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

QUÉ ES UN CONTRACT

Un Contract es una referencia AEL que representa:

```text
un dato
o
una capacidad de lectura
```

con:

```text
nombre estable
tipo
semántica
versión
capabilities
provider
```

---

## 244. QUÉ NO ES UN CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

QUÉ NO ES UN CONTRACT

Un Contract no es:

```text
tabla
columna
SQL query
endpoint HTTP
PostgreSQL function
Supabase RPC
DTO interno
```

---

## 245. EJEMPLO

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

EJEMPLO

AEL:

```text
PROPERTY.AREA_PRIVATE
```

Puede estar implementado internamente mediante:

```text
copropiedades
→ inmuebles
→ area_privada
```

pero esa estructura no forma parte del Contract.

---

## 246. PROPÓSITO

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROPÓSITO

El Contract permite que:

```text
AEL
```

dependa de:

```text
semántica de negocio
```

en lugar de:

```text
estructura física de datos
```

---

## 247. NAMESPACE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NAMESPACE

V1 debe utilizar namespaces claros.

Ejemplos:

```text
PROPERTY
PARAMETER
OWNER
ACCOUNTING
SYSTEM
```

---

## 248. NOMBRES

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NOMBRES

Los nombres públicos de Contracts deben ser:

```text
estables
descriptivos
semánticos
```

---

## 249. CONVENCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONVENCIÓN

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

La convención recomendada es:

```text
NAMESPACE.MEMBER
```

---

## 250. IDIOMA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

IDIOMA

Los identificadores públicos del lenguaje y catálogo deben respetar la convención definida para AEL.

Los nombres de dominio expuestos por AEL deben ser consistentes y controlados.

---

## 251. IDENTIDAD DEL CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

IDENTIDAD DEL CONTRACT

La identidad lógica está formada por:

```text
namespace
code
version
```

---

## 252. CONTRACT CODE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT CODE

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
```

debe ser único dentro del catálogo AEL.

---

## 253. VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

VERSION

Cada cambio incompatible genera:

```text
new Contract version
```

---

## 254. SEMVER

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SEMVER

Recomendación:

```text
MAJOR.MINOR.PATCH
```

pero la política exacta debe diferenciar:

```text
semantic compatibility
implementation changes
```

---

## 255. PATCH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PATCH

Un PATCH puede corregir:

```text
metadata
documentation
implementation bug
```

si no cambia la semántica observable.

---

## 256. MINOR

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

MINOR

MINOR puede incorporar:

```text
optional metadata
compatible capabilities
non-breaking extension
```

---

## 257. MAJOR

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

MAJOR

MAJOR cuando cambia:

```text
type
dimension
currency semantics
nullability
meaning
required input
capability contract
```

de forma incompatible.

---

## 258. CONTRACT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT IMMUTABILITY

Una versión publicada de Contract es:

```text
immutable
```

---

## 259. NEW VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NEW VERSION

Un cambio produce:

```text
Contract v2
```

no modifica:

```text
Contract v1
```

---

## 260. CONTRACT STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT STATUS

Mínimo:

```text
DRAFT
ACTIVE
DEPRECATED
RETIRED
```

---

## 261. DRAFT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DRAFT

Puede:

```text
editarse
validarse
probarse
```

pero no utilizarse por Artifacts publicados.

---

## 262. ACTIVE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md; Motor de liquidacion_AEL_V1_Function_System 31.md

ACTIVE

Puede utilizarse por:

```text
Analyzer
Compiler
Runtime
```

según compatibility.

---

## 263. DEPRECATED

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DEPRECATED

Continúa disponible para:

```text
historical Artifacts
```

pero nuevas Rules deberían recibir warning o ser bloqueadas según policy.

---

## 264. RETIRED

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RETIRED

No puede utilizarse para nuevas compilaciones.

Artifacts históricos que dependan de él deben tener una política explícita de soporte.

---

## 265. CONTRACT DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT DEFINITION

Conceptualmente:

```ts
interface ContractDefinition {
  code: string
  version: string
  status: ContractStatus
  type: AELType
  capabilities: readonly Capability[]
  providerKey: string
  description: string
}
```

---

## 266. METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

METADATA

Puede incluir:

```text
displayName
description
category
documentation
examples
deprecatedAt
replacement
```

---

## 267. SEMANTIC TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SEMANTIC TYPE

Contract debe declarar exactamente:

```text
AELType
```

---

## 268. PRIMITIVE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PRIMITIVE CONTRACT

Ejemplo:

```text
SYSTEM.CURRENT_YEAR
→ Number
```

---

## 269. BOOLEAN CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

BOOLEAN CONTRACT

```text
PROPERTY.IS_ACTIVE
→ Boolean
```

---

## 270. STRING CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

STRING CONTRACT

```text
OWNER.NAME
→ String
```

---

## 271. MONEY CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

MONEY CONTRACT

```text
ACCOUNTING.BALANCE
→ Money<COP>
```

---

## 272. QUANTITY CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

QUANTITY CONTRACT

```text
PROPERTY.AREA_PRIVATE
→ Quantity<M2>
```

---

## 273. NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NULLABILITY

Contract debe declarar explícitamente:

```text
nullable
```

---

## 274. NULLABLE EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NULLABLE EXAMPLE

```text
OWNER.SECONDARY_EMAIL
→ Nullable<String>
```

---

## 275. NO IMPLICIT NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NO IMPLICIT NULLABILITY

No asumir:

```text
all Contracts are nullable
```

---

## 276. DIMENSION METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DIMENSION METADATA

Quantity debe declarar:

```text
dimension
unit policy
```

---

## 277. UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

UNIT

Ejemplo:

```text
M2
```

---

## 278. DIMENSION VS UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DIMENSION VS UNIT

Diferenciar:

```text
dimension = AREA
unit = M2
```

---

## 279. CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CURRENCY

Money debe declarar:

```text
currency
```

si es fija.

---

## 280. CURRENCY-DYNAMIC

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CURRENCY-DYNAMIC

Si currency puede variar:

```text
Money<C>
```

debe existir metadata suficiente para resolverla de forma segura.

---

## 281. NO IMPLICIT FX

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NO IMPLICIT FX

Contract no debe convertir automáticamente:

```text
USD → COP
```

---

## 282. RECORD CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RECORD CONTRACT

Puede existir:

```text
PROPERTY.ADDRESS
```

que devuelva un Record.

---

## 283. RECORD SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RECORD SCHEMA

Debe definir:

```text
fields
types
nullability
```

---

## 284. RECORD VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RECORD VERSIONING

Cambiar field obligatorio de forma incompatible requiere:

```text
new major version
```

---

## 285. LIST CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

LIST CONTRACT

Si V1 soporta listas:

```text
LIST<T>
```

debe declarar:

```text
element type
```

---

## 286. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

V1 RECOMMENDATION

Mantener Contracts principalmente como:

```text
scalar
Money
Quantity
Record
```

y añadir listas sólo cuando exista una necesidad real.

---

## 287. INPUT REQUIREMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

INPUT REQUIREMENTS

Un Contract puede requerir contexto:

```text
propertyId
ownerId
periodId
```

---

## 288. INPUT SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

INPUT SCHEMA

Si requiere inputs, definir:

```ts
interface ContractInputDefinition {
  name: string
  type: AELType
  required: boolean
}
```

---

## 289. INPUT SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

INPUT SOURCE

El input debe provenir de:

```text
ExecutionInput
```

o contexto explícitamente definido.

---

## 290. TENANT CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

TENANT CONTEXT

Nunca permitir que un input sobreescriba:

```text
tenantId
```

del ExecutionContext.

---

## 291. TENANT ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

TENANT ISOLATION

Contract Provider debe ejecutar dentro del tenant del contexto.

---

## 292. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md; Motor de liquidacion_AEL_V1_Function_System 31.md

CAPABILITIES

Contract declara:

```text
requiredCapabilities
```

---

## 293. CAPABILITY EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CAPABILITY EXAMPLE

```text
PROPERTY.AREA_PRIVATE
→ READ_PROPERTY
```

---

## 294. MULTIPLE CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

MULTIPLE CAPABILITIES

Un Contract puede requerir:

```text
READ_PROPERTY
READ_COPROPERATION
```

---

## 295. CAPABILITY SET

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CAPABILITY SET

Debe deduplicarse y ordenarse canónicamente.

---

## 296. PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER KEY

Contract apunta a:

```text
providerKey
```

---

## 297. PROVIDER KEY PURPOSE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER KEY PURPOSE

Es un identificador de infraestructura:

```text
property.area_private
```

No es visible en Source AEL.

---

## 298. PROVIDER IMPLEMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER IMPLEMENTATION

Puede existir:

```text
PostgresPropertyAreaProvider
```

---

## 299. PROVIDER VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER VERSION

Si la implementación cambia sin cambiar la semántica:

```text
Contract version
```

puede permanecer igual si la compatibilidad está garantizada.

---

## 300. PROVIDER COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER COMPATIBILITY

Debe existir una comprobación:

```text
provider supports Contract version
```

---

## 301. REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

REGISTRY

Todos los Contracts disponibles deben estar registrados.

---

## 302. CONTRACT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT REGISTRY

Conceptualmente:

```ts
interface ContractRegistry {
  get(code: string, version: string): ContractDefinition | undefined
  list(): readonly ContractDefinition[]
}
```

---

## 303. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

REGISTRY SNAPSHOT

Analyzer y Compiler deben utilizar:

```text
immutable registry snapshot
```

---

## 304. SNAPSHOT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SNAPSHOT HASH

El snapshot puede tener:

```text
registryHash
```

para reproducibilidad.

---

## 305. COMPILATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

COMPILATION

Cuando una Rule usa:

```text
PROPERTY.AREA_PRIVATE
```

el Compiler registra:

```text
Contract
code
version
hash
```

---

## 306. ARTIFACT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

ARTIFACT DEPENDENCY

Artifact debe almacenar:

```text
contract dependency
```

con versión exacta.

---

## 307. LATEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

LATEST

No compilar una dependencia como:

```text
latest
```

---

## 308. VERSION RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

VERSION RESOLUTION

Durante análisis:

```text
requested version
→ compatible concrete version
```

---

## 309. PINNING

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PINNING

Después de compilar:

```text
resolved version
```

queda fijada en Artifact.

---

## 310. CONTRACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT HASH

Opcionalmente:

```text
definitionHash
```

permite detectar cambios de metadata semántica.

---

## 311. IMPLEMENTATION HASH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

IMPLEMENTATION HASH

No necesariamente forma parte de Artifact si Runtime resuelve por versión compatible.

La política debe separar:

```text
semantic definition
```

de:

```text
implementation build
```

---

## 312. PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PUBLICATION

Un Contract debe pasar:

```text
schema validation
semantic validation
provider validation
capability validation
```

antes de ACTIVE.

---

## 313. CONTRACT VALIDATOR

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT VALIDATOR

Debe validar:

```text
code
version
type
provider
capabilities
metadata
```

---

## 314. CODE FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CODE FORMAT

Recomendación:

```text
[A-Z][A-Z0-9_]*
```

para namespace/member.

---

## 315. RESERVED NAMES

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RESERVED NAMES

Evitar códigos que colisionen con:

```text
keywords
built-in functions
system tokens
```

---

## 316. DUPLICATE CODE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DUPLICATE CODE

No permitir:

```text
same code + same version
```

dos veces.

---

## 317. TYPE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

TYPE VALIDATION

Un Contract `Money` debe tener:

```text
valid currency metadata
```

---

## 318. QUANTITY VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

QUANTITY VALIDATION

Un Contract `Quantity` debe tener:

```text
valid dimension
valid unit
```

---

## 319. RECORD VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RECORD VALIDATION

Record debe tener:

```text
unique field names
valid field types
```

---

## 320. CAPABILITY VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md; Motor de liquidacion_AEL_V1_Function_System 31.md

CAPABILITY VALIDATION

Todas las capabilities deben existir en:

```text
CapabilityRegistry
```

---

## 321. PROVIDER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER VALIDATION

`providerKey` debe corresponder a un adapter registrado.

---

## 322. PROVIDER SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER SIGNATURE

Adapter debe aceptar:

```text
Contract code
version
ExecutionContext
inputs
```

según interfaz.

---

## 323. PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER RESULT

Debe pasar:

```text
AELValue validator
```

---

## 324. PROVIDER CONTRACT VIOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER CONTRACT VIOLATION

Si devuelve tipo incompatible:

```text
blocking runtime error
```

y debe investigarse como bug de infraestructura.

---

## 325. DATA TRANSFORMATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DATA TRANSFORMATION

Provider puede transformar:

```text
DB row
→ AELValue
```

pero no alterar semántica.

---

## 326. SEMANTIC SOURCE OF TRUTH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SEMANTIC SOURCE OF TRUTH

El Contract definition es la fuente de verdad para:

```text
type
dimension
currency
nullability
```

---

## 327. DATABASE SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DATABASE SCHEMA

La tabla PostgreSQL puede cambiar internamente:

```text
column rename
normalization
join
materialized view
```

sin modificar el Contract si la semántica se conserva.

---

## 328. BREAKING DATABASE CHANGE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

BREAKING DATABASE CHANGE

Si cambia el significado del dato:

```text
new Contract version
```

---

## 329. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

EXAMPLE

Antes:

```text
PROPERTY.AREA_PRIVATE
→ Quantity<M2>
```

Después cambia a:

```text
PROPERTY.AREA_PRIVATE
→ Quantity<FT2>
```

Eso es un cambio semántico incompatible.

Debe utilizar:

```text
new major version
```

---

## 330. CONTRACT DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT DOCUMENTATION

Cada Contract debe documentar:

```text
qué representa
unidad
currency
nullability
fuente conceptual
capabilities
restricciones
```

---

## 331. EXAMPLE DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

EXAMPLE DOCUMENTATION

```text
PROPERTY.AREA_PRIVATE

Representa el área privada del inmueble.
Tipo: Quantity<M2>
Nullable: false
Capability: READ_PROPERTY
```

---

## 332. EXAMPLES

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

EXAMPLES

Debe incluir ejemplos válidos cuando aporten claridad.

---

## 333. DISPLAY NAME

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DISPLAY NAME

`displayName` es para UI.

No debe utilizarse para resolución AEL.

---

## 334. DESCRIPTION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DESCRIPTION

Descripción es documentación, no semántica ejecutable.

---

## 335. CATEGORY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CATEGORY

Puede organizar:

```text
PROPERTY
ACCOUNTING
OWNER
SYSTEM
```

---

## 336. SEARCH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SEARCH

Registry puede soportar búsqueda por:

```text
code
category
status
```

para UI administrativa.

---

## 337. UI

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

UI

La UI debe poder mostrar:

```text
Contract
type
description
version
status
capabilities
```

sin mostrar detalles internos innecesarios.

---

## 338. CONTRACT CATALOG

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT CATALOG

AQUILA debe disponer de un catálogo administrable de Contracts.

---

## 339. CATALOG PERSISTENCE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CATALOG PERSISTENCE

Recomendación DB-first:

```text
PostgreSQL
```

como fuente de verdad del catálogo publicado.

---

## 340. DRAFT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DRAFT STORAGE

Drafts pueden almacenarse en PostgreSQL con:

```text
status = DRAFT
```

---

## 341. VERSION TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

VERSION TABLE

La persistencia debe separar conceptualmente:

```text
contract
contract_version
```

---

## 342. CONTRACT ID

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT ID

`contract_id` identifica la entidad lógica.

---

## 343. CONTRACT VERSION ID

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT VERSION ID

`contract_version_id` identifica la versión inmutable.

---

## 344. UNIQUE CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

UNIQUE CONSTRAINT

Debe existir una restricción equivalente a:

```text
UNIQUE(contract_id, version)
```

---

## 345. STATUS CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

STATUS CONSTRAINT

Estados permitidos mediante:

```text
CHECK
```

o catálogo controlado.

---

## 346. FK

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

FK

Provider, capability y otras referencias deben mantener:

```text
foreign keys
```

cuando correspondan.

---

## 347. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

AUDIT

Cambios administrativos deben registrar:

```text
created_by
created_at
published_by
published_at
deprecated_by
deprecated_at
```

según modelo.

---

## 348. NO UPDATE PUBLISHED

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NO UPDATE PUBLISHED

Una versión publicada no debe permitir:

```text
semantic update
```

---

## 349. CORRECTION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CORRECTION

Si se detecta un error:

```text
create new version
```

---

## 350. RETIRE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RETIRE

Retiring un Contract no borra:

```text
historical versions
```

---

## 351. DEPENDENCY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DEPENDENCY ANALYSIS

Antes de retirar:

```text
find Artifacts / Rules using Contract
```

---

## 352. DEPRECATION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DEPRECATION POLICY

Al marcar deprecated:

```text
new compilation warning
```

puede incluir:

```text
replacement
```

---

## 353. RETIRE POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RETIRE POLICY

No permitir nuevas compilaciones.

Historical execution debe depender de política de compatibilidad.

---

## 354. CONTRACT MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT MIGRATION

Una herramienta futura puede ayudar:

```text
v1 → v2
```

pero no debe modificar silenciosamente Rules publicadas.

---

## 355. COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

COMPATIBILITY MATRIX

Cada Contract version debe indicar:

```text
language version
runtime compatibility
provider compatibility
```

---

## 356. CONTRACT TEST SUITE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT TEST SUITE

Cada Contract debe tener tests de:

```text
type
provider
tenant
RLS
nullability
result mapping
capability
```

---

## 357. CONTRACT CONTRACT-TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT CONTRACT-TEST

El término Contract Test aquí significa:

```text
verificar que adapter cumple ContractDefinition
```

---

## 358. PROVIDER CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER CONTRACT TEST

Para:

```text
PROPERTY.AREA_PRIVATE
```

test debe comprobar:

```text
returns Quantity<M2>
```

---

## 359. RLS CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RLS CONTRACT TEST

Con tenant A:

```text
returns tenant A data
```

Con tenant B:

```text
returns tenant B data
```

Cross-tenant:

```text
denied
```

---

## 360. NULL CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NULL CONTRACT TEST

Si nullable=false:

```text
provider returning NULL
```

debe fallar.

---

## 361. TYPE CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

TYPE CONTRACT TEST

Si expected:

```text
Money<COP>
```

provider returning:

```text
String
```

debe fallar.

---

## 362. DIMENSION CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DIMENSION CONTRACT TEST

Si expected:

```text
Quantity<M2>
```

provider returning:

```text
Quantity<KG>
```

debe fallar.

---

## 363. CAPABILITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CAPABILITY TEST

Provider no debe ejecutarse si capability falta.

---

## 364. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PERFORMANCE

Registry lookups deben ser:

```text
O(1)
```

idealmente mediante mapas indexados.

---

## 365. REGISTRY LOAD

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

REGISTRY LOAD

Al iniciar backend:

```text
load active contracts
validate
build immutable snapshot
```

---

## 366. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CACHE

El Registry puede cachear:

```text
active snapshot
```

---

## 367. INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

INVALIDATION

Cuando se publica una nueva versión:

```text
new snapshot
```

---

## 368. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONCURRENCY

Registry snapshots deben ser:

```text
immutable
```

para ejecuciones concurrentes.

---

## 369. HOT RELOAD

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

HOT RELOAD

No es requisito V1.

Si se implementa, debe reemplazar snapshots completos.

Nunca mutar uno en uso.

---

## 370. MULTITENANCY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

MULTITENANCY

Debe distinguirse:

```text
global Contract definition
```

de:

```text
tenant configuration
```

---

## 371. GLOBAL CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

GLOBAL CONTRACT

El significado de:

```text
PROPERTY.AREA_PRIVATE
```

debe ser global y estable.

---

## 372. TENANT CONFIGURATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

TENANT CONFIGURATION

El tenant puede configurar:

```text
values
providers
parameters
```

sin redefinir el significado del Contract.

---

## 373. TENANT-SPECIFIC CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

TENANT-SPECIFIC CONTRACTS

Sólo deben permitirse si existe una necesidad real.

No duplicar Contracts globales por tenant sin razón.

---

## 374. PARAMETER VS CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PARAMETER VS CONTRACT

Diferenciar:

```text
Contract
→ dato/capacidad expuesta

Parameter
→ valor configurable
```

---

## 375. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

EXAMPLE

```text
PROPERTY.AREA_PRIVATE
```

es Contract.

```text
PARAMETER.TARIFA_M2
```

puede ser otro Contract cuyo origen sea configuración.

---

## 376. CONTRACT NAMING

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT NAMING

No utilizar nombres que revelen:

```text
tbl_
column_
sql_
rpc_
```

---

## 377. BAD EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

BAD EXAMPLE

```text
PROPERTY.TBL_INMUEBLES_AREA_PRIVADA
```

---

## 378. GOOD EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

GOOD EXAMPLE

```text
PROPERTY.AREA_PRIVATE
```

---

## 379. CONTRACT STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT STABILITY

La estabilidad semántica es más importante que la estabilidad de implementación.

---

## 380. DOCUMENTATION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

DOCUMENTATION VERSION

La documentación puede evolucionar sin modificar semántica.

---

## 381. REGISTRY EXPORT

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

REGISTRY EXPORT

El Registry puede exportar snapshot:

```text
JSON
```

para:

```text
compiler
CI
testing
```

---

## 382. SNAPSHOT SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SNAPSHOT SECURITY

Un snapshot usado en producción debe ser:

```text
trusted
versioned
integrity checked
```

---

## 383. SNAPSHOT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SNAPSHOT HASH

Puede incluirse en:

```text
Compiler metadata
Artifact provenance
```

---

## 384. PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVENANCE

Artifact debe poder demostrar:

```text
qué Contract version
```

fue utilizada.

---

## 385. CONTRACT PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT PROVENANCE

Execution audit puede registrar:

```text
contractVersion
providerVersion
```

cuando sea necesario.

---

## 386. PROVIDER ROTATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PROVIDER ROTATION

Cambiar implementación del Provider debe ser posible sin recompilar si:

```text
semantic compatibility
```

está garantizada.

---

## 387. SAFE PROVIDER ROTATION

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SAFE PROVIDER ROTATION

Requiere:

```text
compatibility tests
```

antes de activar la nueva implementación.

---

## 388. BREAKING PROVIDER CHANGE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

BREAKING PROVIDER CHANGE

Si cambia comportamiento semántico:

```text
new Contract version
```

---

## 389. CONTRACT SLA

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

CONTRACT SLA

Para Contracts críticos puede existir metadata:

```text
latency expectation
availability
```

pero no forma parte de la semántica AEL.

---

## 390. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

OBSERVABILITY

Registrar métricas:

```text
contract_resolution_total
contract_provider_calls
contract_provider_errors
contract_provider_duration
```

---

## 391. SECURITY METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

SECURITY METRICS

Registrar:

```text
contract_capability_denied
cross_tenant_denied
```

sin información sensible.

---

## 392. ADMIN WORKFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

ADMIN WORKFLOW

Recomendación:

```text
Create Draft
 ↓
Validate
 ↓
Test Provider
 ↓
Review
 ↓
Publish
 ↓
Active
```

---

## 393. REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

REVIEW

Para Contracts críticos debe existir aprobación administrativa.

---

## 394. PUBLISH

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PUBLISH

Publish debe ser transaccional:

```text
version persisted
provider compatibility verified
registry snapshot updated
```

---

## 395. FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

FAILURE

Si cualquier paso crítico falla:

```text
no ACTIVE state
```

---

## 396. RETIRE WORKFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

RETIRE WORKFLOW

```text
Mark Deprecated
 ↓
Analyze dependencies
 ↓
Migrate Rules
 ↓
Retire
```

---

## 397. NO SILENT BREAK

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

NO SILENT BREAK

Nunca retirar un Contract utilizado por Artifact activo sin política explícita.

---

## 398. EXIT CRITERIA — AEL-CONTRACT-SYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

EXIT CRITERIA — AEL-CONTRACT-SYSTEM

```text
✓ Contract definition
✓ Contract identity
✓ Versioning
✓ Status lifecycle
✓ Type metadata
✓ Money metadata
✓ Quantity metadata
✓ Nullability
✓ Record schema
✓ Input definitions
✓ Capability declaration
✓ Provider mapping
✓ Contract Registry
✓ Immutable snapshots
✓ Dependency pinning
✓ Provider compatibility
✓ PostgreSQL persistence model
✓ Publication workflow
✓ Deprecation workflow
✓ Retirement workflow
✓ Contract tests
✓ RLS tests
✓ Tenant isolation
✓ Provenance
✓ Observability
```

---

## 399. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

FINAL ARCHITECTURE

```text
                 AEL SOURCE
                     │
                     ▼
              PROPERTY.AREA_PRIVATE
                     │
                     ▼
              Contract Registry
                     │
                     ▼
          Contract Version 1.0.0
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       Type                  Capability
    Quantity<M2>            READ_PROPERTY
          │
          ▼
     Provider Key
          │
          ▼
 PropertyAreaPrivateProvider
          │
          ▼
 PostgreSQL / Supabase
          │
          ▼
         RLS
```

---

## 400. PRINCIPIO DE ABSTRACCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PRINCIPIO DE ABSTRACCIÓN

AEL debe poder cambiar:

```text
PostgreSQL
→ otra implementación
```

sin cambiar:

```text
PROPERTY.AREA_PRIVATE
```

si la semántica permanece compatible.

---

## 401. PRINCIPIO DE VERSIONAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PRINCIPIO DE VERSIONAMIENTO

Nunca mutar silenciosamente:

```text
Contract publicado
```

---

## 402. PRINCIPIO DE TENANCY

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PRINCIPIO DE TENANCY

El Contract define:

```text
qué dato
```

pero el ExecutionContext define:

```text
para qué tenant
```

---

## 403. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PRINCIPIO DE SEGURIDAD

Un Contract válido no implica:

```text
acceso universal
```

Siempre requiere:

```text
capability
+
tenant context
+
RLS
```

---

## 404. PRINCIPIO DB-FIRST

> **Origen:** Motor de liquidacion_AEL_V1_Contract_System. 30md.md

PRINCIPIO DB-FIRST

PostgreSQL mantiene:

```text
integridad
constraints
RLS
transactions
```

El Contract no reemplaza la base de datos.

---

## 405. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

OBJETIVO

Definir:

```text
Function
Function Signature
Parameters
Return Type
Capabilities
Function Registry
Versioning
Validation
Provider Binding
Purity
Determinism
Error Handling
Publication
```

---

## 406. QUÉ ES UNA FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

QUÉ ES UNA FUNCTION

Una Function es una operación semántica invocable desde AEL:

```text
REDONDEAR_DINERO(total, 0)
```

La Function define:

```text
qué argumentos acepta
qué resultado produce
qué capabilities requiere
qué versión representa
```

---

## 407. QUÉ NO ES UNA FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

QUÉ NO ES UNA FUNCTION

No es:

```text
SQL query
PostgreSQL function
HTTP endpoint
arbitrary JavaScript
database procedure exposed directly
```

---

## 408. CONTRACT VS FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CONTRACT VS FUNCTION

```text
Contract
→ obtiene/representa un dato

Function
→ transforma/calcula/ejecuta una operación
```

---

## 409. PROVIDER VS FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER VS FUNCTION

```text
Function
→ interfaz semántica

Provider
→ implementación concreta
```

---

## 410. EJEMPLO

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

EJEMPLO

AEL:

```text
REDONDEAR_DINERO(total, 0)
```

Internamente podría ejecutarse mediante:

```text
TypeScript
PostgreSQL
servicio especializado
```

pero AEL sólo conoce:

```text
REDONDEAR_DINERO
```

---

## 411. NOMBRES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NOMBRES

Los nombres públicos de Functions AEL deben estar en español.

Ejemplos:

```text
REDONDEAR
REDONDEAR_DINERO
ABSOLUTO
MAXIMO
MINIMO
```

---

## 412. CONVENCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CONVENCIÓN

Recomendación:

```text
VERBO_O_OPERACION
```

en mayúsculas para el catálogo público.

---

## 413. NAMESPACE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NAMESPACE

Si el catálogo requiere agrupación:

```text
MATEMATICA.REDONDEAR
FECHAS.DIAS_ENTRE
TEXTO.MAYUSCULAS
```

La sintaxis definitiva debe seguir la gramática aprobada en documentos anteriores.

---

## 414. IDENTIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

IDENTIDAD

La identidad lógica:

```text
namespace
name
version
```

---

## 415. FUNCTION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION VERSION

Una versión publicada es:

```text
immutable
```

---

## 416. VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

VERSIONING

Recomendación:

```text
MAJOR.MINOR.PATCH
```

---

## 417. PATCH

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PATCH

No cambia:

```text
signature
return type
observable semantic behavior
```

---

## 418. MINOR

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

MINOR

Puede agregar:

```text
compatible metadata
optional behavior/configuration
```

sin romper llamadas existentes.

---

## 419. MAJOR

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

MAJOR

Cuando cambia:

```text
parameter type
parameter order
required parameter
return type
nullability
semantic behavior incompatible
capabilities required
```

de forma incompatible.

---

## 420. FUNCTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION STATUS

```text
DRAFT
ACTIVE
DEPRECATED
RETIRED
```

---

## 421. DRAFT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DRAFT

Puede ser:

```text
created
validated
tested
reviewed
```

pero no debe estar disponible para producción.

---

## 422. DEPRECATED

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DEPRECATED

Puede continuar disponible para Artifacts históricos.

Nuevas compilaciones deben generar:

```text
warning
```

o ser bloqueadas según policy.

---

## 423. RETIRED

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

RETIRED

No disponible para nuevas compilaciones.

---

## 424. FUNCTION DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION DEFINITION

Conceptualmente:

```ts
interface FunctionDefinition {
  name: string
  version: string
  status: FunctionStatus
  parameters: readonly FunctionParameter[]
  returnType: AELType
  capabilities: readonly Capability[]
  providerKey: string
}
```

---

## 425. FUNCTION PARAMETER

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION PARAMETER

```ts
interface FunctionParameter {
  name: string
  type: AELType
  required: boolean
}
```

---

## 426. OPTIONAL PARAMETERS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

OPTIONAL PARAMETERS

Si V1 soporta opcionales:

```text
required = false
```

debe estar definido explícitamente.

---

## 427. DEFAULT VALUES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DEFAULT VALUES

Los defaults deben formar parte de metadata semántica.

Ejemplo:

```text
REDONDEAR(valor, decimales = 2)
```

---

## 428. DEFAULT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DEFAULT VALIDATION

El default debe ser compatible con:

```text
parameter type
```

---

## 429. ARGUMENT COUNT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ARGUMENT COUNT

Analyzer debe validar:

```text
minimum arguments
maximum arguments
```

---

## 430. NAMED ARGUMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NAMED ARGUMENTS

Si V1 no los soporta:

```text
no implementar
```

No introducirlos únicamente en Function System.

---

## 431. POSITIONAL ARGUMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

POSITIONAL ARGUMENTS

V1 debe utilizar argumentos posicionales salvo decisión explícita posterior.

---

## 432. ARGUMENT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ARGUMENT TYPE

Cada argumento debe ser compatible con:

```text
expected parameter type
```

---

## 433. RETURN TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

RETURN TYPE

Function declara exactamente:

```text
returnType
```

---

## 434. NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NULLABILITY

Debe declararse:

```text
nullable
```

explícitamente.

---

## 435. NULL INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NULL INPUT

Function debe indicar si acepta:

```text
Null
```

o requiere:

```text
Non-null T
```

---

## 436. NULL OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NULL OUTPUT

Function puede retornar:

```text
Nullable<T>
```

si su semántica lo requiere.

---

## 437. MONEY FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

MONEY FUNCTION

Ejemplo:

```text
REDONDEAR_DINERO(
    Money<C>,
    Number
)
→ Money<C>
```

---

## 438. QUANTITY FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

QUANTITY FUNCTION

Ejemplo:

```text
VALOR_ABSOLUTO(
    Quantity<D,U>
)
→ Quantity<D,U>
```

si la semántica lo permite.

---

## 439. DIMENSION PRESERVATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DIMENSION PRESERVATION

Una Function debe declarar claramente si:

```text
preserva dimensión
```

o:

```text
transforma dimensión
```

---

## 440. CURRENCY PRESERVATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CURRENCY PRESERVATION

Una Function monetaria debe indicar si:

```text
preserva currency
```

---

## 441. NO IMPLICIT CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO IMPLICIT CONVERSION

No asumir:

```text
COP → USD
```

---

## 442. GENERIC TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

GENERIC TYPES

Si se requiere:

```text
T
Money<C>
Quantity<D,U>
```

la política debe estar definida por el Type System.

No implementar genéricos parcialmente.

---

## 443. FUNCTION SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION SIGNATURE

Signature completa:

```text
name
version
parameters
returnType
nullability
semantic constraints
```

---

## 444. SIGNATURE IDENTITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SIGNATURE IDENTITY

Un cambio en signature que rompa compatibilidad requiere:

```text
new major version
```

---

## 445. OVERLOADS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

OVERLOADS

V1 recomienda:

```text
no overloads
```

salvo necesidad real.

---

## 446. POR QUÉ NO OVERLOADS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

POR QUÉ NO OVERLOADS

Evita:

```text
ambiguous resolution
complex diagnostics
non-deterministic selection
```

---

## 447. FUNCTION RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION RESOLUTION

Analyzer busca:

```text
exact function name
compatible version
matching arity
matching argument types
```

---

## 448. AMBIGUITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

AMBIGUITY

Si existe más de una coincidencia:

```text
error
```

Nunca seleccionar arbitrariamente.

---

## 449. PURE FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PURE FUNCTION

Una Function pura:

```text
same inputs
→ same result
```

bajo las mismas condiciones explícitas.

---

## 450. PURE EXAMPLES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PURE EXAMPLES

```text
ABSOLUTO
MAXIMO
MINIMO
REDONDEAR
```

---

## 451. CONTEXT-DEPENDENT FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CONTEXT-DEPENDENT FUNCTION

Una Function puede depender de:

```text
Clock
Locale
Timezone
```

y debe declararlo.

---

## 452. CURRENT DATE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CURRENT DATE

Una Function como:

```text
FECHA_ACTUAL()
```

no es estrictamente pura.

Debe depender de:

```text
Clock
```

---

## 453. CAPABILITY FOR CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CAPABILITY FOR CLOCK

No necesariamente requiere una capability de datos si el Clock es parte controlada del Runtime.

---

## 454. EXTERNAL FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

EXTERNAL FUNCTION

Una Function que consulta:

```text
external service
```

debe requerir capability.

---

## 455. SIDE EFFECT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SIDE EFFECT

Una Function que modifica estado:

```text
WRITE
```

debe requerir capability explícita.

---

## 456. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

V1 RECOMMENDATION

AEL V1 debe priorizar:

```text
pure functions
```

---

## 457. SIDE EFFECT FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SIDE EFFECT FUNCTIONS

No introducir como comportamiento implícito.

---

## 458. FUNCTION PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION PROVIDER

Conceptualmente:

```ts
interface FunctionProvider {
  call(
    reference: FunctionReference,
    args: readonly AELValue[],
    context: FunctionContext,
  ): Promise<AELValue>
}
```

---

## 459. PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER KEY

Function definition contiene:

```text
providerKey
```

---

## 460. PROVIDER KEY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER KEY

No debe aparecer en Source.

---

## 461. IMPLEMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

IMPLEMENTATION

Puede existir:

```text
RedondearDineroFunction
```

implementada en TypeScript.

---

## 462. PROVIDER REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER REGISTRY

AQUILA Integration mantiene:

```text
FunctionAdapterRegistry
```

---

## 463. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION REGISTRY

AEL mantiene:

```text
FunctionRegistry
```

para metadata semántica.

---

## 464. SEPARATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SEPARATION

```text
FunctionRegistry
→ qué es la Function

FunctionAdapterRegistry
→ cómo se implementa
```

---

## 465. FUNCTION SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION SNAPSHOT

Analyzer/Compiler debe utilizar:

```text
immutable Function Registry snapshot
```

---

## 466. FUNCTION VERSION PINNING

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION VERSION PINNING

Artifact debe registrar:

```text
function code
function version
definition hash
```

según modelo.

---

## 467. NO LATEST

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO LATEST

Artifact no debe contener:

```text
latest
```

---

## 468. PROVIDER COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER COMPATIBILITY

Provider debe declarar soporte para:

```text
Function version
```

---

## 469. RETURN VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

RETURN VALIDATION

Runtime debe validar:

```text
actual result
vs
declared return type
```

---

## 470. PROVIDER BUG

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER BUG

Si Function retorna tipo incorrecto:

```text
runtime failure
```

No convertir silenciosamente.

---

## 471. EXCEPTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

EXCEPTIONS

Function adapter puede producir errores técnicos.

Integration debe mapearlos a:

```text
AEL FunctionError
```

---

## 472. ERROR CODE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ERROR CODE

Ejemplo:

```text
AEL-FUNCTION-003
```

---

## 473. FUNCTION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION ERROR

Debe contener:

```text
function
version
code
safe message
```

---

## 474. SECRET PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SECRET PROTECTION

No exponer:

```text
API keys
tokens
database credentials
```

---

## 475. TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TIMEOUT

Function execution debe respetar:

```text
execution deadline
```

---

## 476. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CANCELLATION

Debe propagarse:

```text
AbortSignal
```

o mecanismo equivalente.

---

## 477. RETRIES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

RETRIES

No implementar retries genéricos dentro del Runtime.

---

## 478. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

IDEMPOTENCY

Functions con side effects deben declarar:

```text
idempotency
```

---

## 479. FUNCTION LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION LIMITS

Runtime puede limitar:

```text
maxFunctionCalls
```

---

## 480. FUNCTION COST

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION COST

Metadata futura puede declarar:

```text
estimatedCost
```

para planificación.

No es requisito semántico V1.

---

## 481. FUNCTION DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION DOCUMENTATION

Cada Function debe documentar:

```text
description
parameters
return
examples
errors
nullability
side effects
capabilities
```

---

## 482. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

EXAMPLE

```text
REDONDEAR_DINERO

Descripción:
Redondea un importe monetario al número de decimales indicado.

Entrada:
Money<C>
Number

Salida:
Money<C>

Capabilities:
ninguna

Side effects:
ninguno
```

---

## 483. FUNCTION CATALOG

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION CATALOG

AQUILA debe disponer de catálogo administrable.

---

## 484. PERSISTENCE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PERSISTENCE

Separar:

```text
function
function_version
```

---

## 485. FUNCTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION ID

Identifica la operación lógica.

---

## 486. FUNCTION VERSION ID

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION VERSION ID

Identifica la versión inmutable.

---

## 487. UNIQUE CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

UNIQUE CONSTRAINT

Debe existir:

```text
UNIQUE(function_id, version)
```

---

## 488. STATUS CONSTRAINT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

STATUS CONSTRAINT

Estados controlados por:

```text
CHECK
```

o catálogo.

---

## 489. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

AUDIT

Registrar:

```text
created_by
created_at
published_by
published_at
deprecated_at
```

según modelo.

---

## 490. PUBLISHED IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PUBLISHED IMMUTABILITY

No actualizar semántica de una versión publicada.

---

## 491. CORRECTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CORRECTION

Crear:

```text
new version
```

---

## 492. FUNCTION VALIDATOR

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION VALIDATOR

Debe validar:

```text
name
version
parameters
returnType
capabilities
provider
defaults
```

---

## 493. PARAMETER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PARAMETER VALIDATION

Debe comprobar:

```text
unique parameter names
valid types
required ordering policy
valid defaults
```

---

## 494. DEFAULT ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DEFAULT ORDER

Si existen opcionales posicionales:

```text
required parameters
```

deben preceder a:

```text
optional parameters
```

salvo una regla explícita distinta.

---

## 495. PROVIDER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROVIDER VALIDATION

Provider debe existir y declarar:

```text
compatible Function version
```

---

## 496. PUBLICATION WORKFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PUBLICATION WORKFLOW

```text
Create Draft
 ↓
Validate
 ↓
Run Function Tests
 ↓
Review
 ↓
Publish
 ↓
ACTIVE
```

---

## 497. TEST FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TEST FUNCTION

Cada Function debe tener pruebas:

```text
happy path
boundary
invalid types
null
errors
determinism
```

---

## 498. MONEY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

MONEY TESTS

Probar:

```text
0 COP
100.00 COP
negative values
large values
decimal precision
```

---

## 499. ROUNDING TEST

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ROUNDING TEST

Definir explícitamente:

```text
rounding mode
```

Ejemplo:

```text
HALF_UP
```

o la política definida por AQUILA.

Nunca depender del default accidental de una librería.

---

## 500. DECIMAL PRECISION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DECIMAL PRECISION

Money debe usar:

```text
exact decimal
```

---

## 501. FLOATING POINT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FLOATING POINT

No implementar Functions financieras con:

```text
JavaScript Number
```

cuando pueda producir errores de precisión.

---

## 502. QUANTITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

QUANTITY TESTS

Validar:

```text
same dimension
different dimensions
same unit
convertible unit
non-convertible unit
```

---

## 503. DATE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DATE TESTS

Functions de fechas deben probar:

```text
timezone
leap year
month boundaries
DST
```

si aplica.

---

## 504. TEXT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TEXT TESTS

Functions de texto deben definir:

```text
Unicode
case
locale
normalization
```

cuando sea relevante.

---

## 505. LOCALE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

LOCALE

No depender implícitamente del locale del servidor.

---

## 506. TIMEZONE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TIMEZONE

No depender implícitamente de timezone del servidor.

---

## 507. CLOCK TEST

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CLOCK TEST

Functions dependientes de fecha deben utilizar:

```text
FixedClock
```

en tests.

---

## 508. DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DETERMINISM

Pure Function:

```text
same args
→ same result
```

---

## 509. CONTEXT DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CONTEXT DETERMINISM

Context-dependent Function:

```text
same args
+
same Clock
+
same locale/timezone
→ same result
```

---

## 510. FUNCTION SIDE EFFECT AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION SIDE EFFECT AUDIT

Cada Function debe declarar:

```text
sideEffect = NONE
```

en V1 salvo excepciones aprobadas.

---

## 511. WRITE FUNCTION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

WRITE FUNCTION POLICY

Si se incorpora:

```text
sideEffect = WRITE
```

requiere:

```text
capability
audit
idempotency policy
transaction policy
```

---

## 512. FUNCTION SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION SECURITY

No permitir que una Function acceda libremente a:

```text
filesystem
network
database
```

sin una capability y adapter explícitos.

---

## 513. SANDBOX

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SANDBOX

Function implementation debe ejecutarse dentro de las capacidades asignadas por Application.

---

## 514. NO USER FUNCTION CODE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO USER FUNCTION CODE

V1 no permite que usuarios creen:

```text
Function en JavaScript
```

desde UI.

---

## 515. FUNCTION CATALOG OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION CATALOG OWNERSHIP

Functions de plataforma son:

```text
controlled by AQUILA
```

---

## 516. TENANT FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TENANT FUNCTIONS

Si posteriormente se permiten Functions tenant-specific:

```text
isolated namespace
```

y policy independiente.

No incluir en V1 sin necesidad.

---

## 517. FUNCTION VISIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION VISIBILITY

Puede existir:

```text
PUBLIC
INTERNAL
ADMIN
```

pero sólo Functions `PUBLIC` deben ser utilizables por Rules normales.

---

## 518. INTERNAL FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

INTERNAL FUNCTIONS

Pueden existir para:

```text
system rules
```

pero deben estar protegidas.

---

## 519. ADMIN FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ADMIN FUNCTIONS

Nunca disponibles para Source de usuario por defecto.

---

## 520. FUNCTION REGISTRY SNAPSHOT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION REGISTRY SNAPSHOT HASH

Puede utilizarse para:

```text
artifact provenance
```

---

## 521. COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

COMPILER

Compiler registra:

```text
Function dependency
```

en Artifact.

---

## 522. RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

RUNTIME

Runtime resuelve:

```text
dependency index
→ Function adapter
```

---

## 523. NO NAME LOOKUP AT RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO NAME LOOKUP AT RUNTIME

No buscar:

```text
"REDONDEAR_DINERO"
```

en cada instruction.

Utilizar:

```text
dependency index
```

---

## 524. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PERFORMANCE

Function registry lookup debe ser:

```text
O(1)
```

---

## 525. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CACHE

Adapters inmutables pueden cachearse.

Execution state no.

---

## 526. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

OBSERVABILITY

Métricas:

```text
function_calls_total
function_errors_total
function_duration
function_timeout_total
```

---

## 527. CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CORRELATION

Propagar:

```text
correlationId
```

---

## 528. FUNCTION LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION LOGGING

No registrar argumentos sensibles por defecto.

---

## 529. REDACTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

REDACTION

Function metadata puede indicar:

```text
sensitiveParameter
```

---

## 530. ERROR MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ERROR MAPPING

Application recibe:

```text
stable AEL error
```

no detalles internos.

---

## 531. FUNCTION DEPENDENCY GRAPH

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION DEPENDENCY GRAPH

Una Function puede depender internamente de otros servicios.

El Artifact debe registrar sólo las dependencies semánticas relevantes al Runtime.

---

## 532. TRANSITIVE CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TRANSITIVE CAPABILITIES

Si la Function requiere internamente:

```text
READ_PARAMETER
```

su metadata debe declarar la capability efectiva.

---

## 533. NO HIDDEN CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO HIDDEN CAPABILITIES

No permitir que una Function use una capability que no esté declarada.

---

## 534. CAPABILITY AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CAPABILITY AUDIT

Publication debe verificar:

```text
declared capabilities
vs
implementation requirements
```

cuando sea posible.

---

## 535. FUNCTION REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION REVIEW

Functions con:

```text
external I/O
write side effects
security implications
```

requieren revisión reforzada.

---

## 536. FUNCTION MIGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION MIGRATION

No cambiar silenciosamente:

```text
v1 behavior
```

---

## 537. DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

DEPRECATION

Al crear replacement:

```text
replacementFunction
```

puede documentarse.

---

## 538. RETIREMENT

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

RETIREMENT

Antes de retirar:

```text
find active Artifacts
```

que la utilizan.

---

## 539. HISTORICAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

HISTORICAL EXECUTION

Artifacts históricos deben seguir ejecutables mientras la plataforma garantice su compatibility.

---

## 540. FUNCTION COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION COMPATIBILITY MATRIX

Mantener:

```text
Function version
Runtime version
Provider version
```

---

## 541. STARTUP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

STARTUP VALIDATION

Al iniciar backend:

```text
load Function Registry
validate definitions
validate adapters
build immutable snapshot
```

---

## 542. MISSING PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

MISSING PROVIDER

Si Function ACTIVE no tiene adapter compatible:

```text
deployment/startup error
```

---

## 543. NO FIRST-EXECUTION DISCOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO FIRST-EXECUTION DISCOVERY

Nunca descubrir una Function rota sólo cuando una Rule llega a producción.

---

## 544. CI VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CI VALIDATION

CI debe ejecutar:

```text
catalog validation
signature validation
adapter contract tests
```

---

## 545. GOLDEN TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

GOLDEN TESTS

Mantener fixtures:

```text
function definitions
expected signatures
expected results
```

---

## 546. PROPERTY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PROPERTY TESTS

Para Functions matemáticas:

```text
property-based testing
```

puede ser utilizado.

---

## 547. SECURITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SECURITY TESTS

Intentar invocar Function sin capability:

```text
must fail
```

---

## 548. TENANT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

TENANT TESTS

Function que usa datos debe respetar:

```text
tenant context
RLS
```

---

## 549. SIDE EFFECT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SIDE EFFECT TESTS

Una Function declarada pura:

```text
must not perform writes
```

según arquitectura y tests disponibles.

---

## 550. CONTRACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CONTRACT TESTS

Function adapter debe cumplir:

```text
FunctionDefinition
```

de forma equivalente a Contract Tests.

---

## 551. FUNCTION API

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION API

API administrativa puede exponer:

```text
listFunctions
getFunction
validateFunction
publishFunction
deprecateFunction
retireFunction
```

---

## 552. NO DIRECT RUNTIME ADMIN API

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

NO DIRECT RUNTIME ADMIN API

No permitir modificar Function metadata desde Runtime.

---

## 553. VERSION PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

VERSION PUBLICATION

Publicar:

```text
FunctionVersion
```

y actualizar Registry snapshot.

---

## 554. ATOMIC PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ATOMIC PUBLICATION

La publicación debe garantizar:

```text
DB metadata
+
adapter availability
+
registry snapshot
```

consistentes.

---

## 555. FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FAILURE

Si falla:

```text
no ACTIVE version
```

---

## 556. ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

ROLLBACK

Rollback selecciona:

```text
previous FunctionVersion
```

No modifica la versión histórica.

---

## 557. FUNCTION PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION PROVENANCE

Artifact debe permitir saber:

```text
qué Function version
```

fue compilada.

---

## 558. FUNCTION HASH

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

FUNCTION HASH

Puede conservarse:

```text
definitionHash
```

para detectar cambios semánticos.

---

## 559. IMPLEMENTATION HASH

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

IMPLEMENTATION HASH

Puede registrarse separadamente para:

```text
deployment audit
```

---

## 560. SECURITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

SECURITY BOUNDARY

La Function es un:

```text
trusted platform capability
```

No un mecanismo para ejecutar código del usuario.

---

## 561. EXIT CRITERIA — AEL-FUNCTION-SYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

EXIT CRITERIA — AEL-FUNCTION-SYSTEM

```text
✓ Function definition
✓ Function identity
✓ Signature
✓ Parameters
✓ Optional/default policy
✓ Return type
✓ Nullability
✓ Money semantics
✓ Quantity semantics
✓ Versioning
✓ Lifecycle
✓ Capability declaration
✓ Purity model
✓ Side-effect policy
✓ Provider binding
✓ Function Registry
✓ Immutable snapshots
✓ Version pinning
✓ Adapter compatibility
✓ Error mapping
✓ Timeout/cancellation
✓ Exact decimal handling
✓ Date/time determinism
✓ Tenant/RLS integration
✓ Publication workflow
✓ Deprecation workflow
✓ Retirement workflow
✓ Contract tests
✓ Security tests
✓ Provenance
✓ Observability
```

---

## 562. CONTRACT / FUNCTION / PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

CONTRACT / FUNCTION / PROVIDER

La separación definitiva:

```text
┌─────────────────────────────────────────────┐
│ CONTRACT                                    │
│                                             │
│ Representa un dato/capacidad                │
│ "PROPERTY.AREA_PRIVATE"                     │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
                 Contract Provider
                       │
                       ▼
                PostgreSQL/RLS


┌─────────────────────────────────────────────┐
│ FUNCTION                                    │
│                                             │
│ Representa una operación                   │
│ "REDONDEAR_DINERO(total, 0)"                │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
                 Function Provider
                       │
                       ▼
               Implementación controlada
```

---

## 563. PRINCIPIO DE NO CONFUSIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PRINCIPIO DE NO CONFUSIÓN

Un Contract no debe utilizarse para esconder una operación compleja.

Una Function no debe convertirse en un acceso arbitrario a datos.

---

## 564. PRINCIPIO DE CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PRINCIPIO DE CAPABILITIES

```text
Contract → capability de acceso
Function → capability de operación
```

---

## 565. PRINCIPIO DE VERSIONAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PRINCIPIO DE VERSIONAMIENTO

```text
Contract v1
Function v1
```

son dependencias independientes.

---

## 566. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PRINCIPIO DE DETERMINISMO

Las Functions deben declarar sus dependencias de:

```text
Clock
Locale
Timezone
External services
```

---

## 567. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PRINCIPIO DE SEGURIDAD

No existen:

```text
Functions dinámicas del usuario
```

ni:

```text
arbitrary code execution
```

---

## 568. PRINCIPIO DB-FIRST

> **Origen:** Motor de liquidacion_AEL_V1_Function_System 31.md

PRINCIPIO DB-FIRST

Si una operación requiere integridad transaccional del dominio:

```text
PostgreSQL
```

continúa siendo autoridad.

Function no sustituye:

```text
constraint
trigger
RLS
transaction
```

---

## 569. REFERENCIAS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

REFERENCIAS

Implementa y consume:

```text
Documento 42 — Security Model & Threat Model
Documento 45 — Registry & Dependency Management
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 60 — Verifier & Static Safety Validation
Documento 61 — Artifact Format, Serialization & Integrity
Documento 62 — Runtime Architecture & Execution Engine
```

---

## 570. OBJETIVO

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

OBJETIVO

Definir cómo AEL solicita servicios externos mediante:

```text
Capability
    ↓
Provider Contract
    ↓
Authorized Provider
```

sin exponer infraestructura directamente al lenguaje.

---

## 571. PRINCIPIO

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PRINCIPIO

AEL conoce:

```text
what it may request
```

pero no conoce:

```text
how infrastructure implements it
```

---

## 572. FRONTERA

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

FRONTERA

```text
AEL IR
 ↓
Runtime
 ↓
Capability Broker
 ↓
Capability Contract
 ↓
Provider Adapter
 ↓
External System
```

---

## 573. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO RESPONSABILIDAD

Este módulo no debe:

```text
ejecutar SQL arbitrario
exponer HTTP arbitrario
resolver secretos para AEL
conocer detalles internos de PostgreSQL
implementar reglas financieras
modificar Artifact
```

---

## 574. PACKAGES

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PACKAGES

```text
packages/ael-capabilities/
packages/ael-providers/
```

---

## 575. CAPABILITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY

Una Capability representa una capacidad autorizable del Runtime.

Conceptualmente:

```ts
interface Capability {
  id: string
  version: string
  effect: CapabilityEffect
  inputType: Type
  outputType: Type
}
```

---

## 576. CAPABILITY ID

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY ID

Debe ser:

```text
estable
namespaced
semánticamente claro
```

Ejemplos:

```text
data.unit.read
data.owner.read
billing.payment.read
billing.concept.read
```

---

## 577. CAPABILITY VERSION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY VERSION

Cada Capability debe tener versión independiente del Provider concreto.

---

## 578. EFFECT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

EFFECT

Una Capability debe declarar su efecto:

```text
Pure
Read
Write
External
```

---

## 579. READ

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

READ

Read puede obtener información externa sin modificarla.

Ejemplo:

```text
data.unit.read
```

---

## 580. WRITE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

WRITE

Write puede producir modificaciones externas.

Ejemplo:

```text
billing.payment.register
```

Debe tener políticas adicionales de idempotencia y autorización.

---

## 581. EXTERNAL

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

EXTERNAL

Una Capability External puede comunicarse con infraestructura externa.

No implica automáticamente Write.

---

## 582. CAPABILITY CONTRACT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY CONTRACT

Debe definir:

```text
id
version
input schema
output schema
effects
authorization requirements
timeout policy
idempotency policy
```

---

## 583. INPUT SCHEMA

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

INPUT SCHEMA

Los inputs deben validarse antes de llegar al Provider.

---

## 584. OUTPUT SCHEMA

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

OUTPUT SCHEMA

El resultado del Provider debe validarse antes de regresar al Runtime.

---

## 585. NO RAW OBJECTS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO RAW OBJECTS

No pasar objetos arbitrarios del host al programa.

Utilizar:

```text
AEL Runtime Values
```

---

## 586. PROVIDER

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER

Un Provider es una implementación concreta de una Capability.

Conceptualmente:

```ts
interface Provider {
  capabilityId: string
  capabilityVersion: string
  execute(input: RuntimeValue, context: ProviderContext): Promise<RuntimeValue>
}
```

---

## 587. PROVIDER IDENTITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER IDENTITY

Un Provider debe tener:

```text
providerId
version
implementationHash
```

cuando la plataforma lo requiera.

---

## 588. PROVIDER REGISTRATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER REGISTRATION

Providers deben registrarse mediante Registry/Provider Registry.

No deben auto-registrarse al ejecutarse.

---

## 589. PROVIDER DISCOVERY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER DISCOVERY

Runtime debe resolver:

```text
CapabilityId
→ authorized Provider
```

mediante snapshot controlado.

---

## 590. MULTIPLE PROVIDERS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

MULTIPLE PROVIDERS

Puede existir más de un Provider para una Capability.

La selección debe ser:

```text
deterministic
policy-driven
auditable
```

---

## 591. NO RANDOM PROVIDER

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO RANDOM PROVIDER

No seleccionar Provider aleatoriamente.

---

## 592. PROVIDER PRIORITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER PRIORITY

Si existe prioridad:

```text
explicit priority
```

debe formar parte de la configuración verificable.

---

## 593. PROVIDER FALLBACK

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER FALLBACK

Fallback sólo debe ocurrir mediante policy explícita.

No hacer fallback automático para operaciones financieras sensibles.

---

## 594. PAYMENT WRITE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT WRITE

Para una operación como:

```text
billing.payment.register
```

un fallback puede duplicar efectos.

Por eso debe requerirse:

```text
idempotency policy
```

---

## 595. PROVIDER CONTEXT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER CONTEXT

El Provider recibe un contexto controlado:

```text
tenantContext
request metadata
authorization
deadline
cancellation
execution identity
```

---

## 596. NO AEL ACCESS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO AEL ACCESS

El Provider Context no se expone directamente a AEL.

---

## 597. TENANT CONTEXT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

TENANT CONTEXT

Capabilities tenant-scoped deben recibir tenant context autorizado.

---

## 598. TENANT VALIDATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

TENANT VALIDATION

Antes de ejecutar:

```text
requested tenant
authorized tenant
provider tenant
```

deben ser compatibles.

---

## 599. CROSS-TENANT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CROSS-TENANT

Cross-tenant requiere:

```text
explicit capability
explicit authorization
explicit policy
```

---

## 600. AUTHORIZATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

AUTHORIZATION

Capability authorization debe comprobar:

```text
Artifact requirement
Runtime policy
ExecutionContext
tenant policy
```

---

## 601. DENIAL

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

DENIAL

Si falla autorización:

```text
AEL_RUNTIME_CAPABILITY_DENIED
```

---

## 602. INPUT VALIDATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

INPUT VALIDATION

Orden:

```text
IR value
 ↓
contract validation
 ↓
provider input
```

---

## 603. OUTPUT VALIDATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

OUTPUT VALIDATION

Orden:

```text
provider output
 ↓
contract validation
 ↓
AEL value
```

---

## 604. PROVIDER ERROR

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER ERROR

Provider errors deben mapearse:

```text
internal provider error
→ controlled runtime diagnostic
```

---

## 605. ERROR CLASSIFICATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

ERROR CLASSIFICATION

Separar:

```text
ValidationError
AuthorizationError
NotFoundError
ConflictError
TimeoutError
UnavailableError
ProviderInternalError
```

---

## 606. ERROR EXPOSURE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

ERROR EXPOSURE

AEL recibe sólo:

```text
safe error code
safe message
```

Nunca:

```text
SQL
stack trace
credentials
connection strings
internal URLs
```

---

## 607. TIMEOUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

TIMEOUT

Cada Provider debe tener:

```text
maximum execution time
```

---

## 608. CANCELLATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CANCELLATION

Providers deben soportar cancellation cuando sea técnicamente posible.

---

## 609. RETRIES

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

RETRIES

Retry policy debe estar definida por capability/provider.

No retry genérico.

---

## 610. FINANCIAL WRITE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

FINANCIAL WRITE

Retries de writes financieros requieren:

```text
idempotency key
```

---

## 611. IDEMPOTENCY KEY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

IDEMPOTENCY KEY

Debe derivarse de información estable de la operación y del contexto cuando corresponda.

No usar exclusivamente:

```text
random UUID
```

si la operación necesita replay/deduplication determinista.

---

## 612. PAYMENT EXAMPLE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT EXAMPLE

Una operación:

```text
billing.payment.register
```

puede requerir:

```text
paymentId
tenantId
periodId
unitId
amount
currency
```

El modelo exacto pertenece al dominio de pagos.

---

## 613. PROVIDER TRANSACTION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER TRANSACTION

Un Provider puede utilizar una transacción interna, pero no debe asumir que controla toda la ejecución AEL.

---

## 614. ATOMICITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

ATOMICITY

La atomicidad debe definirse en el contrato de la Capability.

---

## 615. READ CONSISTENCY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

READ CONSISTENCY

Una Capability de lectura debe documentar su nivel de consistencia cuando afecte liquidaciones.

---

## 616. SNAPSHOT READ

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

SNAPSHOT READ

Para procesos sensibles puede existir:

```text
read snapshot
```

que garantice coherencia entre múltiples consultas.

---

## 617. LIQUIDATION CONTEXT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

LIQUIDATION CONTEXT

Una liquidación puede necesitar:

```text
period
unit
owner
concepts
rates
payments
novelties
```

Estas dependencias deben llegar mediante capabilities tipadas.

---

## 618. NO DOMAIN LEAK

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO DOMAIN LEAK

AEL no debe conocer:

```text
Supabase
PostgreSQL
Prisma
REST endpoint
table names
```

---

## 619. DOMAIN CAPABILITIES

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

DOMAIN CAPABILITIES

Ejemplos conceptuales:

```text
property.unit.read
property.owner.read
billing.concept.read
billing.rate.read
billing.payment.read
billing.novelty.read
```

---

## 620. PAYMENT CAPABILITIES

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT CAPABILITIES

Separar lectura de escritura:

```text
billing.payment.read
billing.payment.register
billing.payment.reverse
```

según necesidades reales.

---

## 621. WRITE AUTHORIZATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

WRITE AUTHORIZATION

Writes deben requerir autorización adicional respecto a reads.

---

## 622. REVERSAL

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

REVERSAL

Una operación de reversión debe ser una Capability explícita.

No permitir:

```text
payment.write
```

genérico.

---

## 623. PRINCIPLE OF LEAST PRIVILEGE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PRINCIPLE OF LEAST PRIVILEGE

Preferir:

```text
billing.payment.read
```

sobre:

```text
billing.*
```

---

## 624. CAPABILITY GROUPS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY GROUPS

Se pueden agrupar capabilities para administración, pero el Artifact debe conservar la lista efectiva.

---

## 625. CAPABILITY MANIFEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY MANIFEST

Artifact debe declarar:

```text
required capabilities
```

derivadas del análisis/verificación.

---

## 626. PROVIDER MANIFEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER MANIFEST

Provider registration debe declarar:

```text
supported capabilities
versions
effects
```

---

## 627. VERSION COMPATIBILITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

VERSION COMPATIBILITY

Runtime debe comprobar:

```text
Artifact capability version
compatible Provider version
```

---

## 628. NO SILENT DOWNGRADE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO SILENT DOWNGRADE

No sustituir una Capability por una versión incompatible silenciosamente.

---

## 629. CONTRACT HASH

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CONTRACT HASH

Una Capability Contract puede tener:

```text
contractHash
```

para detectar cambios incompatibles.

---

## 630. PROVIDER HASH

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER HASH

Un Provider puede identificarse mediante:

```text
implementationHash
```

para auditoría/reproducibilidad.

---

## 631. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

REGISTRY SNAPSHOT

La selección Provider/Capability debe resolverse contra:

```text
Registry Snapshot
```

y no contra estado mutable desconocido.

---

## 632. PROVIDER SELECTION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER SELECTION

Algoritmo conceptual:

```text
requested capability
 ↓
registry snapshot
 ↓
compatible providers
 ↓
authorization filter
 ↓
policy selection
 ↓
selected provider
```

---

## 633. PROVIDER ABSENCE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER ABSENCE

Si no existe Provider compatible:

```text
AEL_RUNTIME_PROVIDER_NOT_FOUND
```

---

## 634. PROVIDER INCOMPATIBILITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER INCOMPATIBILITY

```text
AEL_RUNTIME_PROVIDER_INCOMPATIBLE
```

---

## 635. PROVIDER HEALTH

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER HEALTH

Health checks pueden existir fuera de AEL.

Un Provider unhealthy debe poder ser excluido por infraestructura/policy.

---

## 636. HEALTH IS NOT AUTHORIZATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

HEALTH IS NOT AUTHORIZATION

Un Provider healthy no significa que esté autorizado.

---

## 637. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER TIMEOUT

Timeout produce:

```text
AEL_RUNTIME_PROVIDER_TIMEOUT
```

---

## 638. PROVIDER UNAVAILABLE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER UNAVAILABLE

```text
AEL_RUNTIME_PROVIDER_UNAVAILABLE
```

---

## 639. PROVIDER CONFLICT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER CONFLICT

Para writes:

```text
AEL_RUNTIME_PROVIDER_CONFLICT
```

---

## 640. NOT FOUND

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NOT FOUND

```text
AEL_RUNTIME_PROVIDER_NOT_FOUND_DATA
```

Debe distinguirse de:

```text
Provider not registered
```

---

## 641. CONTRACT VALIDATION ERROR

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CONTRACT VALIDATION ERROR

```text
AEL_RUNTIME_CONTRACT_VIOLATION
```

---

## 642. PROVIDER OUTPUT TRUST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER OUTPUT TRUST

El Runtime no debe confiar ciegamente en Provider output aunque el Provider esté registrado.

---

## 643. PROVIDER OUTPUT SANITIZATION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER OUTPUT SANITIZATION

Output debe transformarse a tipos AEL permitidos.

---

## 644. HOST OBJECT CONVERSION

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

HOST OBJECT CONVERSION

No devolver directamente:

```text
Date
Buffer
class instance
database row object
```

sin conversión explícita.

---

## 645. COLLECTION OUTPUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

COLLECTION OUTPUT

Collection size debe respetar runtime limits.

---

## 646. STRING OUTPUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

STRING OUTPUT

String length debe respetar runtime limits.

---

## 647. NUMERIC OUTPUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NUMERIC OUTPUT

Numeric output debe respetar:

```text
type
precision
scale
range
```

---

## 648. MONEY OUTPUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

MONEY OUTPUT

Money output debe validar:

```text
amount
currency
```

---

## 649. PAYMENT OUTPUT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT OUTPUT

Si una Capability devuelve payment:

```text
payment schema
```

debe estar versionado.

---

## 650. PAYMENT AMOUNT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT AMOUNT

Nunca convertir:

```text
payment.amount
```

a binary floating point.

---

## 651. PAYMENT CURRENCY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT CURRENCY

Currency debe ser explícita y validada.

---

## 652. PAYMENT STATUS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT STATUS

Statuses deben provenir de un enum/domain type estable.

No depender de strings libres.

---

## 653. PAYMENT IDENTITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT IDENTITY

Payment identity debe ser estable y no depender del display name.

---

## 654. READ PROVIDER EXAMPLE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

READ PROVIDER EXAMPLE

Conceptual:

```text
billing.payment.read
      ↓
PaymentProvider
      ↓
PaymentRepository
      ↓
PostgreSQL/Supabase
```

AEL sólo observa el contract.

---

## 655. WRITE PROVIDER EXAMPLE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

WRITE PROVIDER EXAMPLE

```text
billing.payment.register
      ↓
PaymentWriteProvider
      ↓
transactional service
      ↓
database
```

---

## 656. NO DIRECT REPOSITORY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO DIRECT REPOSITORY

AEL nunca recibe:

```text
repository
```

como objeto.

---

## 657. NO SQL PARAMETERS FROM AEL

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO SQL PARAMETERS FROM AEL

AEL no construye SQL.

Los Providers controlan consultas y parámetros.

---

## 658. NO URL FROM AEL

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

NO URL FROM AEL

AEL no construye URLs externas arbitrarias.

---

## 659. PROVIDER ADAPTER

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER ADAPTER

Un adapter traduce:

```text
Capability Contract
↔
Infrastructure API
```

---

## 660. ADAPTER RESPONSIBILITIES

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

ADAPTER RESPONSIBILITIES

Debe:

```text
validate external inputs
map domain values
execute external call
map external response
map errors
```

---

## 661. ADAPTER NON-RESPONSIBILITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

ADAPTER NON-RESPONSIBILITY

No debe decidir:

```text
business formula
liquidation rule
AEL control flow
```

---

## 662. DOMAIN SERVICE

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

DOMAIN SERVICE

Business domain services pueden existir debajo de Providers.

---

## 663. PROVIDER STACK

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER STACK

Ejemplo:

```text
AEL
 ↓
Capability
 ↓
Provider
 ↓
Domain Service
 ↓
Repository/Adapter
 ↓
Database
```

---

## 664. AUDIT

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

AUDIT

Sensitive capabilities pueden emitir audit events.

---

## 665. AUDIT CAPABILITY

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

AUDIT CAPABILITY

Audit no debe convertirse automáticamente en una Capability visible a AEL.

---

## 666. METRICS

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

METRICS

Registrar:

```text
capability calls
provider latency
errors
timeouts
```

sin almacenar payload sensible por defecto.

---

## 667. TRACING

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

TRACING

Trace IDs pueden propagarse mediante ProviderContext.

No exponerlos a AEL salvo necesidad explícita.

---

## 668. CONTRACT TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CONTRACT TEST

Verificar:

```text
input schema
output schema
effects
errors
timeout
```

---

## 669. PROVIDER CONTRACT TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER CONTRACT TEST

Cada Provider debe pasar los tests de su Capability.

---

## 670. AUTHORIZATION TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

AUTHORIZATION TEST

Provider autorizado:

```text
success
```

No autorizado:

```text
denied
```

---

## 671. TENANT TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

TENANT TEST

Validar aislamiento:

```text
tenant A cannot read tenant B
```

---

## 672. PAYMENT IDEMPOTENCY TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT IDEMPOTENCY TEST

Repetir la misma operación con la misma idempotency key no debe crear un efecto duplicado si el contrato garantiza idempotencia.

---

## 673. PAYMENT CONFLICT TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PAYMENT CONFLICT TEST

Estado incompatible:

```text
conflict
```

y no duplicar operación.

---

## 674. PROVIDER FAILURE TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER FAILURE TEST

Provider down:

```text
controlled error
```

sin stack trace al programa.

---

## 675. OUTPUT VALIDATION TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

OUTPUT VALIDATION TEST

Provider devuelve tipo incorrecto:

```text
AEL_RUNTIME_CONTRACT_VIOLATION
```

---

## 676. TIMEOUT TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

TIMEOUT TEST

Provider excede deadline:

```text
AEL_RUNTIME_PROVIDER_TIMEOUT
```

---

## 677. CANCELLATION TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CANCELLATION TEST

Cancelación propagada correctamente.

---

## 678. SECURITY TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

SECURITY TEST

Provider no debe permitir que AEL acceda a:

```text
database connection
credentials
filesystem
network client
```

---

## 679. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

DETERMINISM TEST

Mismo Registry Snapshot + misma policy:

```text
same provider selection
```

---

## 680. PROVIDER SELECTION TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PROVIDER SELECTION TEST

Con dos Providers compatibles:

```text
selection = policy-defined
```

---

## 681. VERSION TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

VERSION TEST

Provider incompatible:

```text
rejected
```

---

## 682. CAPABILITY MINIMIZATION TEST

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

CAPABILITY MINIMIZATION TEST

Artifact debe requerir sólo capabilities realmente utilizadas.

---

## 683. PRINCIPIO DE MÍNIMO PRIVILEGIO

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PRINCIPIO DE MÍNIMO PRIVILEGIO

Una Capability debe hacer una cosa concreta y autorizable.

Preferir:

```text
billing.payment.read
```

a:

```text
database.access
```

---

## 684. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PRINCIPIO DE AISLAMIENTO

Los detalles de infraestructura permanecen detrás del Provider.

---

## 685. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PRINCIPIO DE DETERMINISMO

La misma:

```text
Capability
+
Registry Snapshot
+
Policy
```

debe seleccionar el mismo Provider.

---

## 686. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Capability System & Provider Execution Contracts 63.md

PRINCIPIO FINANCIERO

Las operaciones de pagos y valores monetarios deben conservar:

```text
exactness
currency
idempotency
auditability
```

---
