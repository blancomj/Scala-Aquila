# AEL V1 — AEL Language — Master, Scope & Governing Rules

## 1. CONTEXTO DEL PROYECTO

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CONTEXTO DEL PROYECTO

AQUILA es una plataforma SaaS multitenant para la administración de copropiedades, incluyendo procesos como liquidación de cuotas, novedades, parámetros, notificaciones, métricas y automatización de reglas de negocio.

AEL es el lenguaje especializado de reglas de negocio de AQUILA.

AEL **no pretende reemplazar** TypeScript, JavaScript, Python o SQL. Su objetivo es proporcionar una capa controlada, tipada, segura, versionable, auditable y reproducible para expresar reglas de negocio.

La premisa fundamental es:

> **AEL expresa qué debe calcularse; AQUILA controla de dónde provienen los datos, quién puede utilizarlos y cómo se ejecuta de forma segura.**

---

## 2. OBJETIVO DE AEL

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

OBJETIVO DE AEL

AEL debe permitir expresar reglas como:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    UNIT.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

El sistema debe ser capaz de:

1. escribir reglas;
2. analizar sintaxis;
3. analizar semántica;
4. verificar tipos;
5. verificar dimensiones y unidades;
6. resolver Contracts;
7. resolver Functions;
8. determinar dependencias;
9. construir un Artifact ejecutable;
10. verificar la integridad del Artifact;
11. ejecutar el Artifact;
12. simular reglas;
13. versionar reglas;
14. publicar versiones;
15. auditar cambios y ejecuciones;
16. garantizar aislamiento multitenant;
17. reproducir ejecuciones cuando la política lo requiera.

---

## 3. PRINCIPIOS FUNDAMENTALES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

PRINCIPIOS FUNDAMENTALES

AEL V1 debe cumplir estos principios:

## 3.1 Seguridad por diseño

Una regla AEL no debe poder ejecutar arbitrariamente:

- JavaScript;
- SQL;
- comandos del sistema;
- procesos;
- acceso al filesystem;
- HTTP arbitrario;
- lectura de secretos;
- código nativo.

No utilizar `eval()` ni mecanismos equivalentes para ejecutar Source AEL.

## 3.2 Tipado fuerte

AEL debe diferenciar:

```text
100
100 M2
100 COP
"100"
```

## 3.3 Dimensionalidad

Debe detectar errores como:

```text
10 M2 + 20 KG
```

antes de la ejecución.

## 3.4 Determinismo

Mismo Artifact + mismo Runtime + mismas versiones + mismo contexto = mismo resultado, salvo operaciones explícitamente definidas como no deterministas.

## 3.5 Reproducibilidad

Cuando sea necesario, una ejecución histórica debe poder reconstruirse utilizando:

```text
RuleVersion
Artifact
RuntimeVersion
ContractVersions
FunctionVersions
ExecutionSnapshot
```

## 3.6 Inmutabilidad

Una versión publicada es inmutable.

Si se necesita modificar una regla publicada se crea una nueva versión.

## 3.7 Auditabilidad

Debe poder responderse:

- qué regla produjo un resultado;
- qué versión;
- qué Artifact;
- qué Contracts;
- qué Functions;
- qué Runtime;
- quién publicó;
- cuándo;
- qué contexto fue utilizado, cuando corresponda.

---

## 4. ARQUITECTURA GENERAL

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ARQUITECTURA GENERAL

AEL forma parte de AQUILA y **no será un microservicio independiente en V1**.

La arquitectura inicial será modular dentro del monorepo de AQUILA.

```text
AQUILA
│
├── Frontend
│   └── AEL Builder
│
├── Backend
│   └── AEL Module
│
├── AEL Core
├── AEL Language
├── AEL Runtime
├── AEL SDK
│
└── PostgreSQL
    └── RLS
```

La separación conceptual será:

```text
AEL LANGUAGE
    ↓
AEL RUNTIME
    ↓
AQUILA DOMAIN
    ↓
INFRASTRUCTURE
```

---

## 5. SEPARACIÓN DE RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

SEPARACIÓN DE RESPONSABILIDADES

## AEL Language

Responsable de:

- Lexer;
- Parser;
- AST;
- Analyzer;
- IR;
- Artifact Builder.

## AEL Runtime

Responsable de:

- verificar Artifact;
- ejecutar instrucciones;
- gestionar stack;
- gestionar call stack;
- aplicar límites;
- resolver Functions;
- solicitar datos mediante Providers;
- producir resultados.

## AQUILA Domain

Responsable de:

- Rules;
- RuleVersions;
- Contracts;
- Parameters;
- Units;
- Functions;
- Providers;
- publicación;
- permisos;
- auditoría.

## Infrastructure

Responsable de:

- PostgreSQL;
- Supabase;
- persistencia;
- almacenamiento;
- autenticación;
- infraestructura externa.

---

## 6. ESTRUCTURA DEL MONOREPO

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ESTRUCTURA DEL MONOREPO

Utilizar una estructura equivalente a:

```text
AQUILA/
│
├── apps/
│   ├── web/
│   │   └── modules/
│   │       └── ael/
│   │
│   └── api/
│
├── packages/
│   ├── ael-core/
│   ├── ael-language/
│   ├── ael-runtime/
│   ├── ael-sdk/
│   └── shared/
│
├── modules/
│   └── ael/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       └── interfaces/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── tests/
│
├── tests/
│   ├── conformance/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   └── ael/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

No crear un package independiente para cada pequeña clase o subsistema.

La granularidad inicial recomendada es:

```text
ael-core
ael-language
ael-runtime
ael-sdk
```

---

## 7. REGLAS DE DEPENDENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

REGLAS DE DEPENDENCIA

La dependencia debe fluir hacia el núcleo:

```text
AQUILA
   │
   ├── AEL Language
   └── AEL Runtime
           │
           ▼
        AEL Core
```

`ael-core` NO debe depender de:

- PostgreSQL;
- Supabase;
- Vue;
- Nuxt;
- HTTP;
- AQUILA UI.

`ael-runtime` no debe depender directamente de Supabase ni del cliente de PostgreSQL.

---

## 8. AEL CORE

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

AEL CORE

`ael-core` debe contener conceptos independientes de infraestructura:

```text
TypedValue
Decimal
Money
Quantity
DimensionVector
Unit
Errors
Artifact Model
Instruction Definitions
```

Debe poder probarse sin HTTP ni PostgreSQL.

---

## 9. AEL LANGUAGE

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

AEL LANGUAGE

Debe contener:

```text
lexer/
parser/
ast/
analyzer/
ir/
artifact/
```

Flujo:

```text
SOURCE
  ↓
LEXER
  ↓
TOKENS
  ↓
PARSER
  ↓
AST
  ↓
ANALYZER
  ↓
TYPED AST
  ↓
IR
  ↓
ARTIFACT
```

---

## 10. AEL RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

AEL RUNTIME

Debe contener conceptualmente:

```text
runtime/
├── engine
├── execution-frame
├── value-stack
├── call-stack
├── instruction-pointer
├── artifact-verifier
├── limits
├── capabilities
└── function-registry
```

El Runtime recibe:

```text
Artifact
+
ExecutionContext
```

y produce:

```text
ExecutionResult
```

---

## 11. TYPE SYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

TYPE SYSTEM

Tipos iniciales de V1:

```text
NUMBER
DECIMAL
BOOLEAN
STRING
DATE
DATETIME
MONEY
QUANTITY
LIST
NULO
```

No agregar tipos complejos adicionales sin una necesidad funcional real.

---

## 12. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

MONEY

Un valor monetario conceptualmente contiene:

```text
amount
currency
```

Ejemplo:

```text
4500 COP
```

No utilizar `float` como representación semántica del dinero.

Debe existir una representación decimal apropiada.

Ejemplo:

```text
100 COP + 50 COP
```

es válido.

```text
100 COP + 50 USD
```

es inválido salvo una operación explícita y autorizada de conversión monetaria.

---

## 13. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

QUANTITY

Una cantidad contiene:

```text
magnitude
unit
dimension
```

Ejemplo:

```text
120.50 M2
```

---

## 14. DIMENSIONES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

DIMENSIONES

El Value Engine debe manejar dimensionalidad.

Ejemplos:

```text
LONGITUD
AREA
VOLUMEN
MASA
TIEMPO
```

Las dimensiones derivadas deben poder calcularse algebraicamente.

Ejemplo:

```text
M2 × COP/M2 = COP
```

---

## 15. UNIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

UNIDADES

Ejemplos:

```text
M
CM
KM

M2
CM2
HA

KG
G
```

Conversión:

```text
1 M = 100 CM
1 M2 = 10000 CM2
1 HA = 10000 M2
1 KG = 1000 G
```

Las conversiones válidas deben estar definidas por el catálogo de unidades.

---

## 16. OPERACIONES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

OPERACIONES

Debe definirse formalmente la semántica de:

```text
+
-
*
/
==
!=
>
>=
<
<=
```

Ejemplos:

```text
M2 + M2
```

válido.

```text
M2 + KG
```

inválido.

```text
M2 / M2
```

produce NUMBER.

```text
M2 * COP/M2
```

produce MONEY.

---

## 17. NULL

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

NULL

AEL debe tener `NULO` como concepto explícito.

No heredar accidentalmente la semántica de JavaScript.

Debe documentarse cómo se propaga NULO en:

- operaciones;
- comparaciones;
- condiciones;
- funciones;
- retornos.

---

## 18. LENGUAJE AEL

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

LENGUAJE AEL

La V1 debe incluir inicialmente:

```text
REGLA
DEFINIR
RETORNAR
SI
ENTONCES
SINO
FIN
MIENTRAS
```

Ejemplo:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    UNIT.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

---

## 19. CONTROL DE FLUJO

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CONTROL DE FLUJO

Debe soportarse:

```ael
SI condicion ENTONCES
    ...
SINO
    ...
FIN
```

y:

```ael
MIENTRAS condicion
    ...
FIN
```

Además:

```ael
RETORNAR expresion
```

No incorporar en V1 características innecesarias como:

```text
TRY/CATCH
SWITCH
MATCH
ASYNC/AWAIT
FOR
FOREACH
```

salvo que un caso de negocio real lo justifique.

---

## 20. VARIABLES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

VARIABLES

Ejemplo:

```ael
DEFINIR area =
    UNIT.AREA_PRIVATE
```

El Analyzer debe conocer:

```text
nombre
tipo
unidad
dimensión
origen
```

Ejemplo:

```text
area
Tipo: Cantidad
Dimensión: Área
Unidad: M2
```

---

## 21. FUNCIONES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

FUNCIONES

Las Functions son operaciones explícitamente registradas.

Catálogo inicial reducido:

```text
ABS
MIN
MAX
SUM
ROUND
REDONDEAR_DINERO
PORCENTAJE
```

Agregar funciones solamente cuando exista una necesidad real.

Cada función debe tener:

```text
nombre
versión
firma
tipos de entrada
tipo de salida
implementación
política de seguridad
```

---

## 22. CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CONTRACTS

AEL no debe consultar directamente tablas de AQUILA.

Utiliza Contracts.

Ejemplo:

```text
UNIT.AREA_PRIVATE
```

El Contract define:

```text
tipo
unidad
versión
estado
```

Ejemplo:

```text
UNIT@1
AREA_PRIVATE
Cantidad<Área>
M2
```

---

## 23. PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

PROVIDERS

Los Providers son el puente controlado hacia los datos externos.

Ejemplo:

```text
UnitProvider
ParameterProvider
PeriodProvider
CopropiedadProvider
PropietarioProvider
```

El Runtime conoce una interfaz.

El Provider concreto conoce PostgreSQL u otra fuente.

Ejemplo:

```text
Runtime
  ↓
UnitProvider
  ↓
Repository
  ↓
PostgreSQL
```

---

## 24. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CAPABILITIES

Los Providers deben declarar capacidades explícitas.

Ejemplo:

```text
UnitProvider
    READ_UNIT

ParameterProvider
    READ_PARAMETER
```

Una regla no debe obtener una capacidad genérica como:

```text
READ_ANY_DATABASE
```

---

## 25. AST

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

AST

Ejemplo:

```text
DEFINIR area = UNIT.AREA_PRIVATE
```

debe generar conceptualmente:

```text
VariableDeclaration
├── name: area
└── expression
    └── ContractReference
        ├── contract: UNIT
        └── field: AREA_PRIVATE
```

---

## 26. ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ANALYZER

Debe validar:

- sintaxis;
- nombres;
- tipos;
- unidades;
- dimensiones;
- Contracts;
- Functions;
- dependencias;
- retornos;
- control de flujo.

Ejemplo:

```text
RETORNAR area
```

si `area` no existe:

```text
AEL-ANALYZER-UNDEFINED
```

---

## 27. DIAGNÓSTICOS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

DIAGNÓSTICOS

Un diagnóstico debe contener conceptualmente:

```text
code
severity
message
line
column
span
source
details
suggestions
```

Severidades:

```text
ERROR
WARNING
INFO
```

Ejemplo:

```text
AEL-TYPE-001

ERROR

No es posible sumar una cantidad de área
con una cantidad de masa.
```

---

## 28. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ARTIFACT

El Artifact es la representación ejecutable de una regla validada.

Debe contener conceptualmente:

```text
formatVersion
runtimeVersion
ruleId
ruleVersion
instructions
constants
functions
contracts
dependencies
metadata
integrityHash
```

El Artifact no se edita manualmente.

---

## 29. ARTIFACT VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ARTIFACT VERIFIER

Antes de ejecutar:

```text
Artifact
  ↓
Verifier
```

Debe verificarse:

- estructura;
- versión;
- integridad;
- instrucciones;
- referencias;
- dependencias;
- límites;
- compatibilidad.

Un Artifact manipulado debe ser rechazado.

---

## 30. RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

RUNTIME

El Runtime ejecuta únicamente Artifacts verificados.

Nunca debe ejecutar Source directamente mediante `eval()` o mecanismos equivalentes.

Flujo:

```text
Source
 ↓
Analyze
 ↓
Build Artifact
 ↓
Verify Artifact
 ↓
Execute Artifact
```

---

## 31. LIMITES DE EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

LIMITES DE EJECUCIÓN

Toda ejecución debe estar limitada.

Como mínimo definir:

```text
maxInstructions
maxExecutionTime
maxCallDepth
maxListSize
maxStringLength
maxMemory
```

Un loop infinito debe terminar de forma controlada.

Ejemplo:

```text
AEL-RUNTIME-INSTRUCTION_LIMIT
```

---

## 32. VERSIONADO

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

VERSIONADO

Diferenciar:

```text
AEL Language Version
Runtime Version
Artifact Version
Rule Version
Contract Version
Function Version
```

Ejemplo:

```text
Regla:
CUOTA_ADMIN v9

Artifact:
1.0

Runtime:
1.2

Contract:
UNIT@1

Function:
REDONDEAR_DINERO@2
```

---

## 33. RULE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

RULE VERSION

Una versión publicada es inmutable.

Conceptualmente:

```text
RuleVersion
├── ruleId
├── version
├── sourceCode
├── artifactId
├── artifactHash
├── runtimeVersion
├── estado
├── dependencies
├── createdBy
└── createdAt
```

---

## 34. ESTADOS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ESTADOS

Estados iniciales:

```text
BORRADOR
VALIDADA
PUBLICADA
REVOCADA
ARCHIVADA
```

La regla y sus versiones deben poder tener estados diferentes.

Ejemplo:

```text
Regla: PUBLICADA

v8: PUBLICADA
v9: BORRADOR
```

---

## 35. SIMULACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

SIMULACIÓN

La simulación debe utilizar el mismo Runtime de producción.

No crear un motor alternativo.

La diferencia será el contexto:

```text
Simulación:
contexto proporcionado/controlado

Producción:
contexto real autorizado
```

Ejemplo:

```text
Área: 120.50 M2
Tarifa: 4500 COP/M2
Resultado: 542250 COP
```

---

## 36. BUILDER

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

BUILDER

El Builder será un editor inteligente de lenguaje, no un editor visual por bloques.

Debe contener:

```text
Editor
Explorer
Inspector
Diagnostics
Simulation
Dependencies
Publication
Version History
```

---

## 37. BUILDER — ESTRUCTURA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

BUILDER — ESTRUCTURA

```text
┌────────────────────────────────────────────────────────────┐
│ AQUILA / Reglas / CUOTA_ADMIN                 ● Borrador    │
├────────────────────────────────────────────────────────────┤
│ Archivo  Editar  Validar  Simular  Publicar                │
├─────────────┬──────────────────────────────────┬────────────┤
│ Explorador  │ Editor                           │ Inspector  │
│             │                                  │            │
│ Contracts   │ Código AEL                       │ Selección  │
│ Functions   │                                  │ Tipo       │
│ Variables   │                                  │ Unidad     │
│ Units       │                                  │ Contract   │
│ Parameters  │                                  │ Dependencias│
├─────────────┴──────────────────────────────────┴────────────┤
│ Problemas │ Diagnóstico │ Simulación │ Dependencias │ Salida│
└────────────────────────────────────────────────────────────┘
```

---

## 38. IDIOMA DE LA INTERFAZ

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

IDIOMA DE LA INTERFAZ

Preferir español en toda la terminología funcional:

```text
Regla
Variable
Tipo
Unidad
Dimensión
Contrato
Función
Dependencia
Advertencia
Error
Simulación
Resultado
Versión
Publicar
Validar
Diagnóstico
```

Los nombres oficiales de tecnologías externas pueden mantenerse según su terminología original.

---

## 39. AUTOCOMPLETADO

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

AUTOCOMPLETADO

Al escribir:

```text
UNIT.
```

mostrar:

```text
AREA_PRIVATE
AREA_COMMON
CODE
ID
STATUS
```

con información contextual:

```text
AREA_PRIVATE
Cantidad · M2
```

---

## 40. INSPECTOR

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

INSPECTOR

Seleccionando:

```text
UNIT.AREA_PRIVATE
```

mostrar:

```text
Área privada

Tipo:
Cantidad

Dimensión:
Área

Unidad:
M2

Contrato:
UNIT@1

Origen:
UnitProvider
```

---

## 41. VERSIONES

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

VERSIONES

Mostrar:

```text
v9  Publicada
v8  Archivada
v7  Archivada
```

Debe existir comparación de versiones.

El futuro diff semántico puede mostrar cambios como:

```text
Antes:
PARAMETER.TARIFA_M2

Después:
PARAMETER.TARIFA_M2_ACTUAL
```

---

## 42. PUBLICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

PUBLICACIÓN

Publicar requiere:

```text
✓ Sintaxis
✓ Tipos
✓ Contracts
✓ Functions
✓ Dependencias
✓ Artifact
✓ Integridad
✓ Permisos
```

La publicación crea una versión inmutable.

---

## 43. PERMISOS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

PERMISOS

Definir como mínimo:

```text
AEL_RULE_VIEW
AEL_RULE_CREATE
AEL_RULE_EDIT
AEL_RULE_VALIDATE
AEL_RULE_SIMULATE
AEL_RULE_EXECUTE
AEL_RULE_PUBLISH
AEL_RULE_REVOKE
AEL_AUDIT_VIEW
```

La UI puede ocultar acciones, pero la seguridad real debe existir en backend y RLS.

---

## 44. API

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

API

La API debe expresarse en términos de casos de uso:

```text
GET    /ael/reglas
POST   /ael/reglas
GET    /ael/reglas/:id
PUT    /ael/reglas/:id
POST   /ael/reglas/:id/validar
POST   /ael/reglas/:id/simular
POST   /ael/reglas/:id/publicar
POST   /ael/reglas/:id/ejecutar
GET    /ael/reglas/:id/versiones
GET    /ael/reglas/:id/dependencias
```

No exponer detalles internos como endpoints de negocio.

---

## 45. PERSISTENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

PERSISTENCIA

Tablas iniciales:

```text
ael_reglas
ael_regla_versiones
ael_artifacts
ael_dependencias
ael_ejecuciones
ael_execution_snapshots
ael_auditoria
```

---

## 46. REGLAS DE PERSISTENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

REGLAS DE PERSISTENCIA

Una versión publicada es inmutable.

Los Artifacts deben poder verificarse por hash.

Debe existir soporte para relaciones de dependencia.

Las ejecuciones deben registrar información operacional suficiente para auditoría y diagnóstico, evitando almacenar indiscriminadamente información sensible.

---

## 47. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

RLS

Las entidades tenant-owned deben tener:

```text
tenant_id
```

y políticas RLS.

Nunca confiar en el `tenant_id` enviado por el frontend.

El contexto autenticado determina el tenant permitido.

Debe probarse explícitamente:

```text
Tenant A ≠ Tenant B
```

y evitar acceso cruzado.

---

## 48. AUDITORÍA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

AUDITORÍA

Eventos relevantes:

```text
RULE_CREATED
RULE_EDITED
RULE_VALIDATED
RULE_SIMULATED
RULE_PUBLISHED
RULE_REVOKED
RULE_EXECUTED
```

La auditoría debe ser protegida contra modificación indebida.

---

## 49. TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

TESTING

AEL debe tener pruebas por capas:

```text
Lexer
Parser
AST
Type System
Value Engine
Analyzer
Artifact
Artifact Verifier
Runtime
Functions
Providers
Application
PostgreSQL/RLS
API
Builder
E2E
```

---

## 50. SUITE DE CONFORMIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

SUITE DE CONFORMIDAD

Crear una Suite Oficial:

```text
AEL-C-001
AEL-C-002
...
```

Cada caso debe definir:

```text
id
nombre
source
context
expectedResult
expectedType
expectedDiagnostics
expectedStatus
```

Ejemplo:

```text
AEL-C-001

RETORNAR 10 + 20

Esperado:
30
NUMBER
SUCCESS
```

---

## 51. CASOS CANÓNICOS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CASOS CANÓNICOS

Debe existir como mínimo una prueba para:

```text
suma
resta
multiplicación
división
precedencia
unidades
conversiones
dimensiones incompatibles
money
currency mismatch
condicional
loop
loop infinito
función inexistente
Contract inexistente
Provider inexistente
división por cero
límites de ejecución
integridad de Artifact
aislamiento multitenant
```

---

## 52. CASO REAL DE AQUILA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CASO REAL DE AQUILA

Caso canónico:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    UNIT.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

Contexto:

```text
area = 120.50 M2
tarifa = 4500 COP/M2
```

Resultado:

```text
542250 COP
```

Este caso debe formar parte de la Suite de Conformidad.

---

## 53. PROPERTY TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

PROPERTY TESTING

Cuando sea apropiado utilizar pruebas basadas en propiedades.

Ejemplo:

```text
convert(
    convert(x, M, CM),
    CM, M
) = x
```

dentro de la precisión definida.

---

## 54. FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

FUZZING

Especialmente:

```text
Lexer
Parser
ArtifactVerifier
Runtime
```

Regla:

> Una entrada inválida nunca debe provocar un crash del proceso.

Debe producir un diagnóstico o error controlado.

---

## 55. REGRESSION TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

REGRESSION TESTING

Cada bug corregido debe convertirse en un test.

Regla:

> **Un bug corregido debe quedar convertido en una prueba automatizada.**

---

## 56. CI

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CI

Cada Pull Request debe ejecutar como mínimo:

```text
lint
typecheck
unit tests
conformance tests
integration tests
security tests
build
```

E2E puede dividirse entre:

```text
PR → smoke E2E
main → full E2E
```

según el tiempo de ejecución.

---

## 57. ROADMAP V1

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

ROADMAP V1

## FASE 0 — Especificación

Consolidar:

```text
AEL-MASTER-SPEC
```

y cerrar la gramática y semántica V1.

## FASE 1 — Core

Implementar:

```text
TypedValue
Decimal
Money
Quantity
DimensionVector
Unit
Errors
```

## FASE 2 — Language

Implementar:

```text
Lexer
Parser
AST
Analyzer
IR
Artifact
```

## FASE 3 — Runtime

Implementar:

```text
ArtifactVerifier
ExecutionFrame
Stack
Instruction Loop
ValueEngine
FunctionRegistry
Limits
```

## FASE 4 — AQUILA Integration

Implementar:

```text
Contracts
Providers
Parameters
Units
PostgreSQL
RLS
```

## FASE 5 — API

Implementar:

```text
CRUD
Validation
Simulation
Execution
Publication
Versions
Dependencies
```

## FASE 6 — Builder

Implementar:

```text
Editor
Syntax Highlighting
Autocomplete
Diagnostics
Explorer
Inspector
Validation
Simulation
Dependencies
Publication
Version History
```

## FASE 7 — Security + Conformance

Implementar:

```text
RLS
Permissions
Artifact Integrity
Execution Limits
Fuzzing
Conformance
Regression
```

## FASE 8 — Pilot

Comenzar con pocas reglas reales.

Recomendación inicial:

```text
CUOTA_BASICA
CUOTA_CON_DESCUENTO
INTERES_MORA
```

---

## 58. IMPRESCINDIBLE V1

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

IMPRESCINDIBLE V1

Debe incluir:

```text
Lexer
Parser
AST
Type System
Units
Value Engine
Analyzer
Artifact
Artifact Verification
Runtime
Functions básicas
Contracts
Providers
Rule Versioning
Simulation
Publication
Audit
RLS
Conformance Suite
Builder
```

---

## 59. DESEABLE V1.X

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

DESEABLE V1.X

Posteriormente:

```text
Debugging visual
Execution Trace avanzado
Diff semántico
Snippets
Documentación contextual avanzada
Profiler
Más funciones
Más tipos
```

---

## 60. POST-V1

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

POST-V1

Posibles extensiones:

```text
event triggers
scheduled rules
rule composition
advanced collections
parallel execution
rule packages
custom functions
extensiones externas
```

No forman parte de V1.

---

## 61. NO HACER TODAVÍA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

NO HACER TODAVÍA

No implementar en V1:

```text
microservicio AEL
lenguaje visual completo
compilación nativa
plugins arbitrarios
JavaScript embebido
Python embebido
SQL desde AEL
HTTP libre desde AEL
filesystem desde AEL
Marketplace de reglas
```

---

## 62. HITOS TÉCNICOS

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

HITOS TÉCNICOS

## Hito 1

Debe funcionar sin AQUILA:

```text
SOURCE
 ↓
LEXER
 ↓
PARSER
 ↓
ANALYZER
 ↓
ARTIFACT
 ↓
RUNTIME
 ↓
RESULT
```

Con:

```ael
RETORNAR 10 + 20
```

Resultado:

```text
30
```

## Hito 2

Ejecutar:

```ael
RETORNAR 100 M2 * 4500 COP/M2
```

Resultado:

```text
450000 COP
```

## Hito 3

Utilizar:

```text
FakeUnitProvider
FakeParameterProvider
```

para ejecutar una regla real.

## Hito 4

Persistir y publicar una versión.

## Hito 5

Exponer API.

## Hito 6

Construir Builder.

## Hito 7

Ejecutar piloto.

---

## 63. REGLAS DE DISEÑO PARA EL AGENTE DE IA

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

REGLAS DE DISEÑO PARA EL AGENTE DE IA

El agente que implemente AEL debe:

1. respetar las decisiones de este documento;
2. evitar reinventar arquitectura sin justificación;
3. no introducir microservicios innecesarios;
4. mantener separación entre Language, Runtime, Domain e Infrastructure;
5. utilizar español en las definiciones funcionales visibles;
6. evitar sobreingeniería;
7. priorizar casos de uso reales de AQUILA;
8. crear tests junto con la implementación;
9. convertir cada bug corregido en una prueba;
10. no romper compatibilidad semántica silenciosamente;
11. documentar cualquier cambio de la especificación;
12. no ejecutar código arbitrario generado por usuarios;
13. mantener RLS como segunda línea de defensa;
14. mantener versiones publicadas inmutables;
15. garantizar Artifact verificable;
16. mantener simulación y producción sobre el mismo Runtime;
17. priorizar claridad y mantenibilidad.

---

## 64. CRITERIO DE TERMINACIÓN DE AEL V1

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

CRITERIO DE TERMINACIÓN DE AEL V1

AEL V1 sólo puede considerarse terminada cuando exista:

```text
✓ Lenguaje definido
✓ Gramática definida
✓ Type System
✓ Value Engine
✓ Units
✓ Dimensions
✓ Contracts
✓ Functions
✓ AST
✓ Analyzer
✓ IR
✓ Artifact
✓ Artifact Verifier
✓ Runtime
✓ Execution Limits
✓ Providers
✓ Versioning
✓ PostgreSQL
✓ RLS
✓ API
✓ Builder
✓ Simulation
✓ Publication
✓ Audit
✓ Conformance
✓ Integration Tests
✓ E2E
✓ Security Tests
✓ Documentation
```

---

## 65. REGLA FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Documento_Maestro_Prompt 1.md

REGLA FINAL

AEL debe mantenerse como:

> **Un lenguaje especializado, seguro, tipado, auditable, versionable y reproducible para automatizar reglas de negocio de AQUILA.**

No debe convertirse en un lenguaje generalista.

No debe convertirse en un mecanismo para ejecutar código arbitrario.

No debe convertirse prematuramente en una plataforma distribuida.

La prioridad de V1 es:

```text
CORRECCIÓN
+
SEGURIDAD
+
TRAZABILIDAD
+
MANTENIBILIDAD
+
EXPERIENCIA DEL USUARIO
```

antes que cantidad de funcionalidades.

---

# FIN DEL DOCUMENTO MAESTRO — VERSIÓN CONSOLIDADA INICIAL

Este documento constituye la base consolidada para continuar con la **especificación formal de la gramática y semántica de AEL V1**, que será el siguiente documento definitivo antes de iniciar la implementación.
