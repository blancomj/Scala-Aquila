# AEL V1 — AEL Developer Experience — Builder, Editor & Rule Workspace

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
10 — Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md
21 — Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

OBJETIVO

AEL V1 debe proporcionar una experiencia que permita:

```text
Crear regla
   ↓
Editar
   ↓
Validar
   ↓
Probar
   ↓
Simular
   ↓
Revisar dependencias
   ↓
Publicar
```

sin que el usuario tenga que conocer:

```text
AST
IR
opcodes
Provider internals
RLS
stack
```

---

## 2. USUARIOS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

USUARIOS

La experiencia debe contemplar al menos:

```text
Administrador
Diseñador de reglas
Desarrollador
Auditor
```

No todos requieren el mismo nivel de acceso.

---

## 3. PRINCIPIO DE SEPARACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PRINCIPIO DE SEPARACIÓN

La interfaz debe separar:

```text
Authoring
Validation
Testing
Debugging
Publishing
```

---

## 4. RULE WORKSPACE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

RULE WORKSPACE

El centro de trabajo será un:

```text
Rule Workspace
```

con áreas conceptuales:

```text
Editor
Diagnostics
Dependencies
Test
Simulation
Versions
Publication
```

---

## 5. EDITOR

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

EDITOR

El editor debe proporcionar:

```text
syntax highlighting
line numbers
indentation
bracket matching
autocomplete
diagnostics
hover information
go to definition
```

---

## 6. SOURCE OF TRUTH

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SOURCE OF TRUTH

El Source AEL es la fuente editable.

El AST, IR y Artifact son derivados.

```text
SOURCE
 ↓
COMPILER
 ↓
DERIVED ARTIFACT
```

Nunca editar directamente el Artifact.

---

## 7. AUTOCOMPLETION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

AUTOCOMPLETION

El editor debe sugerir:

```text
Keywords
Variables
Functions
Contracts
Units
Currencies
```

---

## 8. CONTRACT AUTOCOMPLETE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CONTRACT AUTOCOMPLETE

Al escribir:

```text
PROPERTY.
```

el editor puede mostrar:

```text
AREA_PRIVATE
AREA_COMMON
AREA_TOTAL
```

según los Contracts disponibles y autorizados.

---

## 9. FUNCTION AUTOCOMPLETE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FUNCTION AUTOCOMPLETE

Al escribir:

```text
REDONDEAR_
```

puede sugerir:

```text
REDONDEAR_DINERO
REDONDEAR_CANTIDAD
```

si están registradas.

---

## 10. CONTEXT-AWARE COMPLETION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CONTEXT-AWARE COMPLETION

Las sugerencias deben depender del contexto.

Ejemplo:

Después de:

```ael
DEFINIR area =
```

mostrar expresiones válidas.

No mostrar instrucciones que no puedan aparecer allí.

---

## 11. TYPE-AWARE COMPLETION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TYPE-AWARE COMPLETION

Si el contexto espera:

```text
MONEY
```

priorizar:

```text
Contracts
Functions
```

compatibles con MONEY.

---

## 12. HOVER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

HOVER

Al colocar el cursor sobre:

```ael
PROPERTY.AREA_PRIVATE
```

mostrar:

```text
Contract:
PROPERTY.AREA_PRIVATE

Type:
QUANTITY

Dimension:
AREA

Unit:
M2

Nullable:
No

Version:
1
```

---

## 13. FUNCTION HOVER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FUNCTION HOVER

Mostrar:

```text
Function:
REDONDEAR_DINERO

Input:
MONEY

Output:
MONEY

Version:
1
```

---

## 14. UNIT HOVER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

UNIT HOVER

Sobre:

```text
M2
```

mostrar:

```text
Unit:
square meter

Dimension:
AREA
```

---

## 15. INLINE DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

INLINE DIAGNOSTICS

Los errores deben aparecer junto a la línea.

Ejemplo:

```text
area + peso
     ^

No se pueden sumar AREA y MASS.
AEL-DIMENSION-001
```

---

## 16. DIAGNOSTICS PANEL

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DIAGNOSTICS PANEL

Debe existir una vista:

```text
Problems
```

con:

```text
Errors
Warnings
Info
```

---

## 17. DIAGNOSTIC NAVIGATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DIAGNOSTIC NAVIGATION

Seleccionar un diagnóstico debe llevar directamente a:

```text
line
column
```

correspondiente.

---

## 18. QUICK FIX

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

QUICK FIX

Cuando sea seguro, puede ofrecer:

```text
Quick Fix
```

Ejemplos:

```text
usar Contract disponible
agregar retorno
corregir nombre
```

No debe modificar semántica automáticamente de manera peligrosa.

---

## 19. NO MAGIC FIX

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

NO MAGIC FIX

No convertir automáticamente:

```text
AREA + MASS
```

en una operación válida.

Los Quick Fix deben respetar el Type System.

---

## 20. FORMATTER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FORMATTER

Debe existir un formatter oficial.

Ejemplo:

```ael
DEFINIR area=PROPERTY.AREA_PRIVATE
```

se normaliza a:

```ael
DEFINIR area =
    PROPERTY.AREA_PRIVATE
```

según la sintaxis oficial.

---

## 21. FORMATTER DETERMINISTA

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FORMATTER DETERMINISTA

El mismo Source semánticamente equivalente debe producir el mismo formato.

---

## 22. FORMAT ON SAVE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FORMAT ON SAVE

Puede existir:

```text
formatOnSave
```

como opción del editor.

---

## 23. LINTER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

LINTER

El editor puede incorporar reglas de calidad:

```text
variable no utilizada
código inalcanzable
Contract deprecated
Function deprecated
complejidad elevada
```

---

## 24. LINTER VS COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

LINTER VS COMPILER

El Linter produce:

```text
warnings
```

El Compiler produce errores semánticos obligatorios.

No mezclar ambas responsabilidades.

---

## 25. RULE METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

RULE METADATA

Cada regla debe tener metadata:

```text
ruleId
name
description
version
status
owner
tags
```

---

## 26. RULE STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

RULE STATUS

Estados recomendados:

```text
DRAFT
VALIDATED
TESTING
PUBLISHED
DEPRECATED
ARCHIVED
```

---

## 27. IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

IMMUTABILITY

Una versión publicada no se edita.

Se crea:

```text
nueva RuleVersion
```

---

## 28. VERSION UI

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

VERSION UI

La interfaz debe permitir visualizar:

```text
v1
v2
v3
```

y comparar:

```text
Source
Dependencies
Capabilities
Tests
```

---

## 29. DIFF

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DIFF

Debe existir comparación de versiones.

Idealmente:

```text
Source diff
Dependency diff
Capability diff
```

---

## 30. SEMANTIC DIFF

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SEMANTIC DIFF

Además del texto, puede mostrar:

```text
Contract agregado
Function eliminada
tipo de retorno cambiado
capability nueva
```

Esto es especialmente importante para auditoría.

---

## 31. VALIDATE ACTION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

VALIDATE ACTION

El usuario debe disponer de:

```text
VALIDAR
```

que ejecute:

```text
Compiler
+
Analyzer
+
Artifact Builder
+
Verifier
```

sin publicar.

---

## 32. VALIDATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

VALIDATION RESULT

Debe mostrar:

```text
Valid
```

o:

```text
Invalid
```

y todos los diagnósticos.

---

## 33. TEST RUNNER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST RUNNER

Debe existir un:

```text
Test Runner
```

para ejecutar la regla contra datos de prueba.

---

## 34. TEST CASE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST CASE

Un test debe contener:

```text
testId
description
input
expectedResult
expectedType
```

---

## 35. INPUT BUILDER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

INPUT BUILDER

La interfaz debe permitir construir:

```text
ExecutionContext
```

sin exponer detalles internos innecesarios.

---

## 36. TEST CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST CONTEXT

Conceptualmente:

```text
Tenant
Property
Period
Parameters
Inputs
```

según los Contracts usados.

---

## 37. MOCK DATA

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

MOCK DATA

El diseñador debe poder proporcionar:

```text
mock Contract values
```

para probar una regla.

---

## 38. SNAPSHOT TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SNAPSHOT TESTING

También debe poder ejecutar contra:

```text
Snapshot
```

para reproducibilidad.

---

## 39. TEST RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST RESULT

Mostrar:

```text
Status
Result
Type
Duration
Provider calls
Diagnostics
```

---

## 40. EXPECTED RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

EXPECTED RESULT

El test debe permitir:

```text
Expected:
542250 COP
```

y comparar:

```text
Actual:
542250 COP
```

---

## 41. ASSERTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

ASSERTIONS

V1 puede soportar:

```text
equals
notEquals
greaterThan
greaterOrEqual
lessThan
lessOrEqual
type
```

---

## 42. FLOAT / MONEY ASSERTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FLOAT / MONEY ASSERTIONS

Las comparaciones monetarias deben respetar:

```text
precision
scale
currency
```

No utilizar comparación flotante ingenua.

---

## 43. TEST SUITE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST SUITE

Una regla puede tener:

```text
multiple test cases
```

Ejemplo:

```text
CUOTA-001
CUOTA-002
CUOTA-003
```

---

## 44. TEST SUITE RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST SUITE RESULT

Mostrar:

```text
12 passed
1 failed
0 skipped
```

---

## 45. TEST COVERAGE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEST COVERAGE

Puede mostrarse cobertura de:

```text
branches
conditions
execution paths
```

como indicador de calidad.

No debe confundirse con cobertura de código interno.

---

## 46. SIMULATION MODE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SIMULATION MODE

La simulación permite ejecutar:

```text
regla + snapshot
```

sin modificar datos.

---

## 47. PRODUCTION VS SIMULATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PRODUCTION VS SIMULATION

La interfaz debe indicar claramente:

```text
SIMULATION
```

o:

```text
PRODUCTION
```

para evitar errores operativos.

---

## 48. READ-ONLY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

READ-ONLY

La simulación V1 debe ser:

```text
read-only
```

No ejecutar efectos secundarios.

---

## 49. DEBUGGER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEBUGGER

AEL V1 puede incluir debugger controlado.

Debe permitir:

```text
breakpoint
step
step over
continue
inspect value
```

---

## 50. BREAKPOINT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

BREAKPOINT

Los breakpoints se asocian al:

```text
Source location
```

no directamente al opcode.

---

## 51. SOURCE MAP

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SOURCE MAP

El Runtime utiliza:

```text
Source Map
```

para mapear:

```text
instruction
→
source line
```

---

## 52. VARIABLE INSPECTION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

VARIABLE INSPECTION

En un breakpoint mostrar:

```text
area = 120.50 M2
tarifa = 4500 COP/M2
total = 542250 COP
```

---

## 53. STACK INSPECTION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

STACK INSPECTION

Sólo para usuarios técnicos/autorizados.

Mostrar:

```text
Value Stack
Call Stack
Instruction Pointer
```

---

## 54. DEBUG SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEBUG SECURITY

El debugger no debe permitir:

```text
modificar Context
modificar Capabilities
modificar Contract
```

---

## 55. WATCH EXPRESSIONS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

WATCH EXPRESSIONS

Puede existir:

```text
Watch
```

pero las expresiones de inspección deben evaluarse sin cambiar el estado.

---

## 56. DEBUG TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEBUG TIMEOUT

El modo debug debe tener límites.

No convertir un breakpoint en una ejecución ilimitada.

---

## 57. DEPENDENCY VIEW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEPENDENCY VIEW

Debe mostrar:

```text
Contracts
Functions
Capabilities
Providers
```

utilizados por la regla.

---

## 58. DEPENDENCY GRAPH

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEPENDENCY GRAPH

Ejemplo:

```text
CUOTA_ADMIN
│
├── PROPERTY.AREA_PRIVATE
│
├── PARAMETER.TARIFA_M2
│
└── REDONDEAR_DINERO
```

---

## 59. CAPABILITY VIEW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CAPABILITY VIEW

Mostrar:

```text
READ_PROPERTY
READ_PARAMETER
```

y explicar su origen.

---

## 60. CAPABILITY EXPLANATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CAPABILITY EXPLANATION

Ejemplo:

```text
READ_PARAMETER
Required by:
PARAMETER.TARIFA_M2
```

---

## 61. SECURITY REVIEW VIEW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SECURITY REVIEW VIEW

Antes de publicar:

```text
Security Review
```

debe mostrar:

```text
Capabilities
Contracts
Scopes
Providers
Limits
```

---

## 62. PUBLICATION WORKFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PUBLICATION WORKFLOW

Flujo:

```text
DRAFT
 ↓
VALIDATE
 ↓
TEST
 ↓
SECURITY REVIEW
 ↓
CREATE VERSION
 ↓
PUBLISH
```

---

## 63. PUBLICATION BLOCKERS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PUBLICATION BLOCKERS

No publicar si:

```text
compile errors
failed mandatory tests
missing capability
invalid Contract
invalid Artifact
security violation
```

---

## 64. PUBLISH CONFIRMATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PUBLISH CONFIRMATION

La publicación debe mostrar resumen:

```text
Rule:
CUOTA_ADMIN

Version:
3

Artifact:
hash...

Contracts:
2

Functions:
1

Capabilities:
2

Tests:
12/12 PASS
```

---

## 65. APPROVAL

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

APPROVAL

Para reglas críticas puede requerirse:

```text
Maker
Checker
```

Es decir:

```text
creador
+
aprobador
```

---

## 66. AUDIT TRAIL

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

AUDIT TRAIL

Registrar:

```text
created
edited
validated
tested
approved
published
deprecated
archived
```

---

## 67. AUDIT ACTOR

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

AUDIT ACTOR

Cada evento debe identificar:

```text
actor
timestamp
ruleVersion
action
```

---

## 68. PUBLISH ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PUBLISH ARTIFACT

La publicación debe congelar:

```text
Source
Compiler version
Artifact
Dependencies
Capabilities
Tests
```

---

## 69. REPRODUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

REPRODUCTION

Desde una versión publicada debe poder obtenerse:

```text
Artifact
```

exactamente.

---

## 70. DOWNLOAD / EXPORT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DOWNLOAD / EXPORT

La interfaz administrativa puede permitir exportar:

```text
Source
Artifact
Metadata
Tests
```

según permisos.

---

## 71. IMPORT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

IMPORT

La importación de una regla debe:

```text
parse
validate
verify
```

antes de habilitarla.

---

## 72. IMPORT SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

IMPORT SECURITY

Nunca ejecutar directamente un Artifact importado.

Siempre:

```text
Import
 ↓
Verify
 ↓
Policy
 ↓
Accept
```

---

## 73. TEMPLATE RULES

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TEMPLATE RULES

AQUILA puede proporcionar plantillas:

```text
Cálculo simple
Prorrateo
Interés
Descuento
Recargo
```

Las plantillas son Source AEL normal.

No tienen privilegios especiales.

---

## 74. EXAMPLES

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

EXAMPLES

La instalación puede incluir ejemplos educativos.

Deben marcarse como:

```text
Example
```

y no publicarse automáticamente.

---

## 75. DOCUMENTATION IN EDITOR

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DOCUMENTATION IN EDITOR

El editor puede mostrar documentación contextual de:

```text
Functions
Contracts
Units
```

---

## 76. SEARCH

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SEARCH

Debe existir búsqueda por:

```text
Rule
Contract
Function
Version
Tag
```

---

## 77. GO TO DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

GO TO DEFINITION

Desde:

```text
PROPERTY.AREA_PRIVATE
```

ir a:

```text
Contract definition
```

---

## 78. FIND REFERENCES

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

FIND REFERENCES

Debe permitir:

```text
Find usages
```

para conocer qué reglas utilizan:

```text
Contract
Function
```

---

## 79. IMPACT ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

IMPACT ANALYSIS

Antes de deprecar un Contract:

```text
¿qué reglas dependen de él?
```

La interfaz debe responder.

---

## 80. CHANGE IMPACT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CHANGE IMPACT

Una modificación de:

```text
Contract
Function
```

debe mostrar:

```text
affected Rules
```

---

## 81. DEPRECATION WORKFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEPRECATION WORKFLOW

Al deprecar:

```text
Contract
```

mostrar:

```text
Rules affected
Replacement
Migration guidance
```

si existe.

---

## 82. ERROR UX

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

ERROR UX

No mostrar errores técnicos internos como:

```text
TypeError
undefined property
stack overflow
```

sin contexto.

Mostrar:

```text
qué ocurrió
dónde
por qué
qué puede hacer el usuario
```

---

## 83. EXAMPLE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

EXAMPLE ERROR

```text
No se puede sumar:

AREA (M2)
+
MASS (KG)

Línea 12, columna 18.

AEL-DIMENSION-001
```

---

## 84. PERFORMANCE UX

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

PERFORMANCE UX

Durante una validación larga mostrar:

```text
Compilando...
Analizando...
Generando Artifact...
Verificando...
```

No bloquear silenciosamente la interfaz.

---

## 85. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

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

## 86. EXECUTION SUMMARY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

EXECUTION SUMMARY

Mostrar:

```text
Result
Duration
Instructions
Provider calls
Status
```

---

## 87. ERROR DETAILS

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

ERROR DETAILS

Un error de Provider puede mostrar:

```text
Contract:
PARAMETER.TARIFA_M2

Status:
Provider unavailable

Code:
AEL-PROVIDER-001
```

sin revelar:

```text
database host
credentials
SQL
```

---

## 88. TRACE VIEW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

TRACE VIEW

Cuando autorizado:

```text
1 LOAD_CONTRACT
2 STORE_LOCAL
3 LOAD_CONTRACT
4 STORE_LOCAL
5 MULTIPLY
6 RETURN
```

Puede visualizarse como herramienta técnica.

---

## 89. USER EXPERIENCE PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

USER EXPERIENCE PRINCIPLE

La UI debe presentar:

```text
Business meaning
```

antes que:

```text
Runtime internals
```

---

## 90. ADVANCED MODE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

ADVANCED MODE

Los detalles técnicos pueden estar en:

```text
Advanced
```

para:

```text
developers
auditors
support
```

---

## 91. ROLE-BASED UI

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

ROLE-BASED UI

Ejemplo:

```text
Rule Designer
→ Editor / Tests / Dependencies

Developer
→ Editor / Debugger / IR

Auditor
→ Versions / Dependencies / Audit

Administrator
→ Publication / Security / Policy
```

---

## 92. NO SECURITY THROUGH UI

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

NO SECURITY THROUGH UI

Ocultar un botón no es autorización.

La API backend debe validar permisos.

---

## 93. API

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

API

El Builder debe utilizar APIs controladas:

```text
createRule
updateDraft
validateRule
runTests
simulate
publish
deprecate
```

---

## 94. API VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

API VALIDATION

Cada endpoint debe repetir las validaciones críticas:

```text
authorization
tenant
state
Artifact
capabilities
```

---

## 95. IDE INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

IDE INTEGRATION

El diseño debe permitir futura integración con:

```text
VS Code
Monaco
web editor
```

---

## 96. LANGUAGE SERVER

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

LANGUAGE SERVER

Una futura implementación puede exponer:

```text
AEL Language Server
```

para:

```text
completion
diagnostics
hover
go to definition
formatting
```

---

## 97. MONACO

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

MONACO

La interfaz web de AQUILA puede utilizar Monaco como editor, pero AEL no debe depender de Monaco.

El lenguaje y su servidor son independientes del editor.

---

## 98. CLI

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CLI

Debe considerarse una herramienta:

```text
ael
```

con comandos:

```text
ael validate
ael compile
ael test
ael inspect
```

---

## 99. CLI VALIDATE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CLI VALIDATE

Ejemplo:

```text
ael validate rule.ael
```

Resultado:

```text
VALID
0 errors
2 warnings
```

---

## 100. CLI TEST

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CLI TEST

```text
ael test rule.ael
```

Resultado:

```text
12 passed
0 failed
```

---

## 101. CLI INSPECT

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CLI INSPECT

```text
ael inspect rule.artifact
```

Puede mostrar:

```text
version
dependencies
capabilities
instructions
hash
```

---

## 102. CI INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CI INTEGRATION

La CLI debe permitir:

```text
exit code 0 = success
exit code != 0 = failure
```

---

## 103. AUTOMATION

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

AUTOMATION

Esto permite:

```text
Git
 ↓
CI
 ↓
AEL Validate
 ↓
AEL Test
 ↓
Artifact
```

---

## 104. SOURCE CONTROL

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

SOURCE CONTROL

Las reglas AEL pueden almacenarse en Git cuando el modelo operativo lo permita.

---

## 105. RULE REPOSITORY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

RULE REPOSITORY

Una estructura posible:

```text
rules/
├── cuota/
│   ├── cuota_admin.ael
│   └── tests/
├── intereses/
└── descuentos/
```

---

## 106. CODE REVIEW

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CODE REVIEW

Las reglas críticas deberían poder revisarse mediante:

```text
Pull Request
```

o flujo equivalente.

---

## 107. REVIEW CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

REVIEW CHECKLIST

```text
[ ] regla correcta
[ ] Contracts correctos
[ ] capabilities mínimas
[ ] tests suficientes
[ ] casos límite
[ ] impacto analizado
```

---

## 108. CI POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CI POLICY

No permitir merge si:

```text
compile fails
mandatory tests fail
security checks fail
```

---

## 109. BUILDER ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

BUILDER ARCHITECTURE

Conceptualmente:

```text
                 RULE BUILDER
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
      Editor        Tests       Dependencies
        │             │             │
        └─────────────┼─────────────┘
                      ▼
                  Compiler
                      │
                      ▼
                   Artifact
                      │
                ┌─────┴─────┐
                ▼           ▼
             Verify       Simulate
                │           │
                └─────┬─────┘
                      ▼
                   Publish
```

---

## 110. DEVELOPER EXPERIENCE PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

DEVELOPER EXPERIENCE PRINCIPLE

La experiencia debe seguir:

```text
WRITE
→ VALIDATE
→ TEST
→ UNDERSTAND
→ REVIEW
→ PUBLISH
```

---

## 111. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Developer_Experience_Builder_Tooling 10.md

CRITERIO DE CIERRE

El Tooling V1 se considera completo cuando el usuario autorizado pueda:

```text
✓ crear una regla
✓ editarla
✓ autocompletar
✓ recibir diagnostics
✓ consultar Contracts
✓ consultar Functions
✓ formatear
✓ validar
✓ ejecutar tests
✓ simular
✓ depurar cuando esté autorizado
✓ revisar dependencias
✓ revisar capabilities
✓ comparar versiones
✓ revisar auditoría
✓ publicar
```

---

## 112. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

OBJETIVO

Definir el workspace completo para:

```text
crear Rule
editar Source
validar
mostrar diagnostics
consultar dependencias
consultar capabilities
probar
simular
comparar versiones
publicar
consultar ejecuciones
```

---

## 113. PRINCIPIO DE AUTORIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PRINCIPIO DE AUTORIDAD

La UI puede solicitar:

```text
validate
compile
test
simulate
publish
execute
```

pero el servidor determina:

```text
validity
artifact
capabilities
authorization
publication
execution
```

---

## 114. STACK

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

STACK

La implementación se integrará con:

```text
Nuxt 3
Vue 3
Nuxt UI
TailwindCSS
Pinia
TypeScript
```

según la arquitectura vigente de AQUILA.

---

## 115. WORKSPACE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

WORKSPACE

Pantalla principal:

```text
┌──────────────────────────────────────────────────────────────┐
│ Rule name / status / version              Validate  Publish │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Editor                         Diagnostics / Inspector       │
│  ┌───────────────────────┐      ┌─────────────────────────┐   │
│  │                       │      │ Errors                  │   │
│  │       AEL Source      │      │ Warnings                │   │
│  │                       │      │ Dependencies            │   │
│  │                       │      │ Capabilities             │   │
│  │                       │      │ Type information         │   │
│  └───────────────────────┘      └─────────────────────────┘   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Test Cases │ Simulation │ Result │ Execution History         │
└──────────────────────────────────────────────────────────────┘
```

---

## 116. RULE HEADER

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RULE HEADER

Debe mostrar:

```text
Rule name
Rule code
status
current version
last modified
last validation
```

Acciones:

```text
Save
Validate
Test
Simulate
Publish
```

Sólo mostrar acciones autorizadas.

---

## 117. STATUS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

STATUS

Estados visuales:

```text
Draft
Validated
Published
Active
Archived
Disabled
```

No inferir estado exclusivamente desde el frontend.

---

## 118. VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VERSION

Mostrar claramente:

```text
Version 3
```

y diferenciar:

```text
Draft changes
Published version
```

---

## 119. UNSAVED CHANGES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

UNSAVED CHANGES

Si existen cambios no guardados:

```text
Unsaved changes
```

debe ser visible.

---

## 120. NAVIGATION GUARD

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NAVIGATION GUARD

Al abandonar una Rule con cambios no guardados:

```text
confirm navigation
```

---

## 121. EDITOR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EDITOR

El editor debe proporcionar:

```text
syntax highlighting
line numbers
error markers
warnings
code navigation
search
replace
indentation
undo/redo
```

---

## 122. AEL LANGUAGE SUPPORT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AEL LANGUAGE SUPPORT

Debe soportar:

```text
keywords
identifiers
Contract references
numbers
strings
operators
comments
```

según la gramática V1.

---

## 123. SYNTAX HIGHLIGHTING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SYNTAX HIGHLIGHTING

Distinguir visualmente:

```text
keywords
contracts
functions
local variables
literals
operators
comments
```

---

## 124. CONTRACT AUTOCOMPLETE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CONTRACT AUTOCOMPLETE

Cuando el usuario escribe:

```text
PROPERTY.
```

el editor puede consultar metadata de Contracts disponibles.

---

## 125. FUNCTION AUTOCOMPLETE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

FUNCTION AUTOCOMPLETE

Cuando el usuario escribe:

```text
REDONDEAR_
```

mostrar Functions registradas y autorizadas para el contexto.

---

## 126. AUTOCOMPLETE AUTHORITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AUTOCOMPLETE AUTHORITY

Autocomplete sólo presenta:

```text
metadata disponible
```

No concede capabilities.

---

## 127. CONTRACT DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CONTRACT DOCUMENTATION

Seleccionar:

```text
PROPERTY.AREA_PRIVATE
```

debe permitir consultar:

```text
type
dimension
unit
nullable
description
capability
version
```

---

## 128. INLINE TYPE INFORMATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

INLINE TYPE INFORMATION

El editor puede mostrar:

```text
PROPERTY.AREA_PRIVATE
Quantity<M2>
```

sin alterar Source.

---

## 129. DIAGNOSTICS PANEL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DIAGNOSTICS PANEL

Panel dedicado:

```text
Errors
Warnings
Info
```

---

## 130. DIAGNOSTIC FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DIAGNOSTIC FORMAT

Cada diagnostic debe mostrar:

```text
code
message
line
column
severity
```

---

## 131. CLICK-TO-LOCATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CLICK-TO-LOCATION

Seleccionar un diagnostic debe llevar el cursor a:

```text
line
column
span
```

---

## 132. INLINE DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

INLINE DIAGNOSTICS

Mostrar:

```text
red marker → error
yellow marker → warning
```

según design system.

---

## 133. NO CLIENT COMPILATION AUTHORITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NO CLIENT COMPILATION AUTHORITY

El editor puede hacer parsing local para UX futura, pero:

```text
server validation
```

es la autoridad.

---

## 134. VALIDATE ACTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VALIDATE ACTION

Al pulsar:

```text
Validate
```

hacer:

```text
POST /validate
```

---

## 135. VALIDATION DEBOUNCE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VALIDATION DEBOUNCE

La validación automática, si se implementa:

```text
debounce
cancel previous request
```

para evitar saturación.

---

## 136. VALIDATION STATES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VALIDATION STATES

```text
Idle
Validating
Valid
Invalid
Network Error
```

---

## 137. NETWORK ERROR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NETWORK ERROR

No mostrar como:

```text
AEL syntax error
```

Debe distinguirse:

```text
Validation unavailable
```

---

## 138. DEPENDENCIES PANEL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DEPENDENCIES PANEL

Mostrar:

```text
Contracts
Functions
Capabilities
```

---

## 139. CONTRACT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CONTRACT DEPENDENCY

Ejemplo:

```text
PROPERTY.AREA_PRIVATE@1
PARAMETER.TARIFA_M2@1
```

---

## 140. FUNCTION DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

FUNCTION DEPENDENCY

Ejemplo:

```text
REDONDEAR_DINERO@1
```

---

## 141. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CAPABILITIES

Mostrar:

```text
READ_PROPERTY
READ_PARAMETER
```

---

## 142. CAPABILITY WARNING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CAPABILITY WARNING

Si una Rule requiere una capability que el usuario no puede utilizar:

```text
Capability not available
```

La UI no debe intentar ocultarla.

---

## 143. SECURITY UX

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SECURITY UX

Mostrar claramente:

```text
This rule requires:
READ_PROPERTY
READ_PARAMETER
```

antes de publicar.

---

## 144. TEST PANEL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST PANEL

Permitir crear:

```text
Test Case
```

con:

```text
name
description
expected result
mode
```

---

## 145. TEST DATA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST DATA

Cuando sea seguro, Test Cases pueden utilizar:

```text
fixture/snapshot
```

en lugar de datos reales.

---

## 146. TEST CASE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST CASE

Ejemplo:

```text
Name:
Apartment 120.50 m2

Expected:
542250 COP
```

---

## 147. TEST EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST EXECUTION

Ejecutar en:

```text
TEST
```

mode.

---

## 148. TEST RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST RESULT

Mostrar:

```text
Passed
Failed
```

con:

```text
actual
expected
diagnostics
duration
```

---

## 149. TEST PRECISION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST PRECISION

Money debe mostrarse:

```text
542250 COP
```

no como:

```text
542250.00
```

sin currency.

---

## 150. SIMULATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SIMULATION

Simulation permite:

```text
evaluar una Rule
```

sin publicar cambios.

---

## 151. SIMULATION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SIMULATION BOUNDARY

Simulation no debe modificar:

```text
Rule
RuleVersion
Production data
```

salvo acciones explícitamente diseñadas para ello.

---

## 152. SIMULATION INPUT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SIMULATION INPUT

El usuario puede seleccionar:

```text
entity
snapshot
context
```

según permisos.

---

## 153. SIMULATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SIMULATION RESULT

Mostrar:

```text
result
dependencies used
capabilities
execution time
```

---

## 154. EXECUTION TRACE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXECUTION TRACE

Una vista técnica opcional puede mostrar:

```text
LOAD_CONTRACT
LOAD_CONTRACT
MULTIPLY
RETURN
```

Nunca mostrar secretos.

---

## 155. TRACE AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TRACE AUTHORIZATION

Execution trace puede estar restringido a:

```text
developer
admin
auditor
```

según políticas de AQUILA.

---

## 156. RESULT PANEL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RESULT PANEL

Mostrar claramente:

```text
Result
Type
Unit
Currency
```

---

## 157. MONEY RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

MONEY RESULT

```text
COP 542.250
```

según configuración regional de presentación.

Internamente:

```text
"542250"
```

---

## 158. DECIMAL DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DECIMAL DISPLAY

La presentación regional:

```text
1.234.567,89
```

no debe modificar el valor semántico.

---

## 159. RESULT COPY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RESULT COPY

Permitir copiar:

```text
formatted result
```

y opcionalmente:

```text
raw structured result
```

según permisos.

---

## 160. EXECUTION HISTORY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXECUTION HISTORY

Panel:

```text
Date
Version
Status
Mode
Duration
Result
Actor
```

---

## 161. VERSION HISTORY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VERSION HISTORY

Mostrar:

```text
Version
Created
Author
Status
Artifact hash
```

---

## 162. VERSION COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VERSION COMPARISON

Permitir comparar:

```text
Version 1
vs
Version 2
```

---

## 163. SOURCE DIFF

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SOURCE DIFF

Mostrar diff:

```text
added
removed
changed
```

con soporte de editor.

---

## 164. SEMANTIC DIFF

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SEMANTIC DIFF

Además del Source diff, mostrar:

```text
Contracts changed
Functions changed
Capabilities changed
Output type changed
```

---

## 165. ARTIFACT DIFF

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ARTIFACT DIFF

No comparar bytes como principal UX.

Mostrar:

```text
semantic dependency changes
```

y opcionalmente:

```text
artifact hash changed
```

---

## 166. PUBLICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLICATION

Botón:

```text
Publish
```

sólo disponible cuando:

```text
valid
authorized
dependencies valid
artifact verified
```

---

## 167. PUBLISH PREVIEW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH PREVIEW

Antes de publicar mostrar:

```text
Version
Source changes
Dependencies
Capabilities
Artifact hash
Warnings
```

---

## 168. PUBLISH CONFIRMATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH CONFIRMATION

Confirmar:

```text
You are publishing version X
```

No utilizar confirmación genérica.

---

## 169. PUBLISH COMMENT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH COMMENT

Permitir:

```text
publication comment
```

para auditoría.

---

## 170. PUBLISH SUCCESS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH SUCCESS

Mostrar:

```text
Published
Version
Artifact hash
Published at
```

---

## 171. PUBLISH FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH FAILURE

Mostrar:

```text
publication failed
```

con código y diagnóstico accionable.

---

## 172. CONCURRENT EDITING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CONCURRENT EDITING

Si otro usuario modificó el Draft:

```text
Conflict detected
```

---

## 173. CONFLICT UX

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CONFLICT UX

Ofrecer:

```text
reload
compare
copy local changes
```

sin sobrescribir automáticamente.

---

## 174. AUTOSAVE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AUTOSAVE

Puede existir autosave de Draft.

Pero:

```text
autosave ≠ publish
```

---

## 175. AUTOSAVE STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AUTOSAVE STORAGE

El autosave debe utilizar el mecanismo de Draft de AQUILA.

No crear una segunda persistencia paralela sin necesidad.

---

## 176. OFFLINE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

OFFLINE

No asumir que AEL editing funciona completamente offline.

Si existe soporte offline:

```text
explicit state
sync conflict
```

debe diseñarse.

---

## 177. KEYBOARD SHORTCUTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

KEYBOARD SHORTCUTS

Recomendados:

```text
Ctrl/Cmd + S → Save
Ctrl/Cmd + Enter → Validate
Ctrl/Cmd + Shift + Enter → Test
```

Publicación debe requerir una acción más explícita.

---

## 178. COMMAND PALETTE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COMMAND PALETTE

Opcional:

```text
Validate
Test
Simulate
Publish
Compare versions
View dependencies
```

---

## 179. ACCESSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ACCESSIBILITY

Editor y panels deben soportar:

```text
keyboard navigation
focus states
ARIA labels
screen reader semantics
```

---

## 180. COLOR

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COLOR

No depender exclusivamente de:

```text
red
yellow
green
```

para diagnostics.

Usar:

```text
icon
text
severity
```

además del color.

---

## 181. RESPONSIVE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RESPONSIVE

Desktop-first por naturaleza del editor.

En tablet/mobile:

```text
read
review
execute
```

puede priorizarse sobre edición avanzada.

---

## 182. LAYOUT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

LAYOUT

Recomendación:

```text
Header
 ├─ Rule identity
 ├─ Status
 └─ Actions

Main
 ├─ Editor
 └─ Inspector

Bottom
 ├─ Diagnostics
 ├─ Tests
 ├─ Simulation
 └─ Executions
```

---

## 183. RESIZABLE PANELS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RESIZABLE PANELS

Editor e Inspector deben permitir:

```text
resize
collapse
expand
```

---

## 184. PERSISTED UI STATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PERSISTED UI STATE

Guardar localmente:

```text
panel width
collapsed panels
last tab
```

No guardar:

```text
secrets
authorization
tenant authority
```

---

## 185. STATE MANAGEMENT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

STATE MANAGEMENT

Pinia puede manejar:

```text
rule workspace state
validation state
test state
execution state
UI preferences
```

---

## 186. SERVER STATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SERVER STATE

No duplicar indiscriminadamente en Pinia:

```text
authoritative server data
```

Usar estrategia clara de:

```text
fetch
cache
invalidate
refresh
```

---

## 187. STORES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

STORES

Posibles:

```text
useRuleWorkspaceStore
useRuleValidationStore
useRuleTestStore
useRuleExecutionStore
```

---

## 188. STORE RESPONSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

STORE RESPONSIBILITY

No colocar en Pinia:

```text
compiler
runtime
database logic
authorization logic
```

---

## 189. COMPOSABLES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COMPOSABLES

Ejemplos:

```text
useRule
useRuleValidation
useRulePublication
useRuleExecution
useRuleDependencies
```

---

## 190. API CLIENT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

API CLIENT

Centralizar:

```text
AEL API client
```

---

## 191. API CLIENT ERROR HANDLING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

API CLIENT ERROR HANDLING

Normalizar:

```text
HTTP error
→ application error
```

---

## 192. CANCELLABLE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CANCELLABLE VALIDATION

Si el usuario modifica Source rápidamente:

```text
request A
request B
request C
```

las respuestas antiguas no deben sobrescribir el resultado más reciente.

---

## 193. VALIDATION REQUEST ID

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VALIDATION REQUEST ID

Cada validación puede tener:

```text
local request sequence
```

para ignorar respuestas obsoletas.

---

## 194. LOADING STATES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

LOADING STATES

No bloquear toda la pantalla durante:

```text
validation
test
simulation
```

Preferir feedback localizado.

---

## 195. PUBLISH LOADING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH LOADING

Publication sí debe impedir acciones conflictivas mientras procesa.

---

## 196. EXECUTION LOADING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXECUTION LOADING

Para async:

```text
Queued
Running
Completed
Failed
```

---

## 197. EXECUTION POLLING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXECUTION POLLING

Si no existe WebSocket/SSE:

```text
poll with backoff
```

---

## 198. REAL-TIME FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

REAL-TIME FUTURE

Posteriormente puede utilizarse:

```text
Supabase Realtime
SSE
WebSocket
```

sin modificar el Core.

---

## 199. NOTIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NOTIFICATION

Al terminar una ejecución larga:

```text
in-app notification
```

según sistema general de AQUILA.

---

## 200. RULE LIST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RULE LIST

Vista de listado:

```text
Code
Name
Status
Version
Updated
Owner
```

---

## 201. RULE FILTERS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RULE FILTERS

```text
status
owner
created
updated
```

---

## 202. RULE SEARCH

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RULE SEARCH

Buscar:

```text
code
name
description
```

según API.

---

## 203. BULK ACTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

BULK ACTIONS

No implementar inicialmente:

```text
bulk publish
bulk execute
```

porque incrementan riesgo operativo.

---

## 204. ARCHIVE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ARCHIVE

Archivar requiere:

```text
authorization
confirmation
audit
```

---

## 205. DISABLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DISABLE

Deshabilitar una Rule activa debe:

```text
immediately affect future execution
```

según política.

No modificar históricas.

---

## 206. HISTORICAL VISIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

HISTORICAL VISIBILITY

Una Rule archivada debe seguir permitiendo:

```text
view history
```

según permisos.

---

## 207. ARTIFACT HASH UX

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ARTIFACT HASH UX

Mostrar hash truncado:

```text
sha256: 8f31...c29a
```

con opción de copiar completo.

---

## 208. DEPENDENCY HEALTH

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DEPENDENCY HEALTH

Mostrar:

```text
Available
Deprecated
Missing
Revoked
```

---

## 209. PUBLISH BLOCKERS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH BLOCKERS

Publicación debe mostrar claramente:

```text
BLOCKERS
```

separados de:

```text
WARNINGS
```

---

## 210. WARNING POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

WARNING POLICY

Warnings no bloquean publicación por defecto.

Pero ciertas categorías pueden ser:

```text
blocking warnings
```

según policy.

---

## 211. DEPENDENCY CHANGE WARNING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DEPENDENCY CHANGE WARNING

Si una nueva versión de Rule cambia:

```text
Contract
Function
Capability
```

mostrar impacto.

---

## 212. SECURITY CHANGE WARNING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SECURITY CHANGE WARNING

Si la nueva versión requiere una capability adicional:

```text
Security impact
```

debe mostrarse antes de publicar.

---

## 213. VERSION PUBLISH CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

VERSION PUBLISH CHECKLIST

UI debe presentar:

```text
✓ Valid syntax
✓ Semantic analysis passed
✓ Artifact verified
✓ Dependencies available
✓ Capabilities authorized
✓ Version ready
```

---

## 214. TEST COVERAGE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST COVERAGE

Si existen tests:

```text
passed
failed
not executed
```

mostrar estado.

---

## 215. OPTIONAL PUBLISH POLICY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

OPTIONAL PUBLISH POLICY

AQUILA puede exigir:

```text
all tests pass
```

antes de publicar determinadas Rules.

La UI sólo refleja la policy del servidor.

---

## 216. APPROVAL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

APPROVAL

Para reglas sensibles puede existir:

```text
Draft
→ Review
→ Approved
→ Published
```

La UI debe soportar el estado si AQUILA lo habilita.

---

## 217. REVIEW MODE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

REVIEW MODE

Reviewer puede:

```text
comment
approve
reject
```

sin editar Source si no tiene permiso.

---

## 218. REVIEW COMMENTS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

REVIEW COMMENTS

Comentarios deben estar separados de:

```text
Source
```

y formar parte del workflow de AQUILA.

---

## 219. AUDIT VIEW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AUDIT VIEW

Mostrar:

```text
who
what
when
version
action
```

---

## 220. AUDIT DETAIL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AUDIT DETAIL

No mostrar secretos ni datos restringidos.

---

## 221. USER EXPERIENCE PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

USER EXPERIENCE PRINCIPLE

El usuario debe poder responder:

```text
¿Qué hace esta Rule?
¿Qué datos utiliza?
¿Qué permisos necesita?
¿Qué versión está activa?
¿Qué cambió?
¿Quién la publicó?
¿Qué resultado produjo?
```

sin inspeccionar código interno.

---

## 222. DOCUMENTATION PANEL

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DOCUMENTATION PANEL

Puede mostrar:

```text
Rule description
business purpose
inputs
output
dependencies
examples
```

---

## 223. BUSINESS VS TECHNICAL VIEW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

BUSINESS VS TECHNICAL VIEW

Dos perspectivas:

```text
Business
Technical
```

---

## 224. BUSINESS VIEW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

BUSINESS VIEW

Mostrar:

```text
purpose
inputs
output
status
version
```

---

## 225. TECHNICAL VIEW

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TECHNICAL VIEW

Mostrar:

```text
AST
IR
Artifact hash
dependencies
capabilities
runtime version
```

según permisos.

---

## 226. NO RAW IR BY DEFAULT

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NO RAW IR BY DEFAULT

IR es diagnóstico técnico, no contenido principal del usuario.

---

## 227. ERROR EDUCATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ERROR EDUCATION

Un error como:

```text
AEL-DIMENSION-001
```

debe tener:

```text
qué ocurrió
dónde
por qué
cómo corregirlo
```

cuando sea posible.

---

## 228. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXAMPLE

Para:

```text
area + tarifa
```

mostrar:

```text
No se pueden sumar AREA y MONEY_PER_AREA.
Verifique las unidades de ambas expresiones.
```

---

## 229. CONTRACT DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CONTRACT DOCUMENTATION

La documentación del Contract debe explicar:

```text
qué representa
qué devuelve
qué unidad usa
qué versión
```

---

## 230. FUNCTION DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

FUNCTION DOCUMENTATION

Mostrar:

```text
signature
description
examples
required capabilities
```

---

## 231. SECURITY TRANSPARENCY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SECURITY TRANSPARENCY

Si una Function requiere capability:

```text
mostrarla
```

antes de ejecución/publicación cuando corresponda.

---

## 232. EMPTY STATES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EMPTY STATES

Cada panel debe tener un empty state útil.

Ejemplo:

```text
No diagnostics.
Your rule currently has no validation errors.
```

---

## 233. ERROR STATES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ERROR STATES

Si API falla:

```text
Retry
```

sin borrar Source local.

---

## 234. NETWORK RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NETWORK RECOVERY

Al recuperar conexión:

```text
refresh server state
```

pero detectar conflictos antes de sobrescribir.

---

## 235. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PERFORMANCE

El editor debe permanecer fluido aunque:

```text
Source grande
diagnostics numerosos
history extensa
```

---

## 236. LAZY LOADING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

LAZY LOADING

Cargar bajo demanda:

```text
execution history
artifact inspection
advanced technical views
```

---

## 237. CODE SPLITTING

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CODE SPLITTING

Separar módulos pesados del workspace cuando sea conveniente.

---

## 238. SECURITY FRONTEND

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SECURITY FRONTEND

No guardar en localStorage:

```text
service role
tokens sensibles
```

según mecanismo de autenticación de AQUILA.

---

## 239. XSS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

XSS

Source AEL y diagnostics deben renderizarse de forma segura.

No interpretar Source como HTML.

---

## 240. COPY/PASTE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COPY/PASTE

Copiar Source no debe añadir HTML invisible.

Preferir:

```text
plain text
```

---

## 241. URL STATE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

URL STATE

Puede conservar:

```text
ruleId
version
tab
```

pero no:

```text
authorization
tenant identity
```

---

## 242. DEEP LINKS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

DEEP LINKS

Debe poder abrirse:

```text
/rules/:ruleId
/rules/:ruleId?version=3
```

según routing de AQUILA.

---

## 243. PERMISSION-AWARE UI

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PERMISSION-AWARE UI

Acciones no autorizadas pueden:

```text
ocultarse
```

o:

```text
deshabilitarse con explicación
```

según UX.

La autorización real siempre ocurre en servidor.

---

## 244. PUBLISH BUTTON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PUBLISH BUTTON

Debe desaparecer o quedar disabled si:

```text
user cannot publish
```

---

## 245. EXECUTE BUTTON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXECUTE BUTTON

Igualmente:

```text
canExecuteRule
```

---

## 246. TEST BUTTON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TEST BUTTON

Puede tener permisos más amplios que:

```text
production execute
```

pero sigue sujeto a policy.

---

## 247. SIMULATE BUTTON

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

SIMULATE BUTTON

No implica permiso para:

```text
publish
```

---

## 248. RULE WORKSPACE ROUTES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

RULE WORKSPACE ROUTES

Conceptualmente:

```text
/ael/rules
/ael/rules/new
/ael/rules/:id
/ael/rules/:id/versions/:version
/ael/executions/:id
```

---

## 249. COMPONENT TREE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COMPONENT TREE

Ejemplo:

```text
AelRuleWorkspace
├── AelRuleHeader
├── AelRuleEditor
├── AelDiagnosticsPanel
├── AelDependencyPanel
├── AelCapabilityPanel
├── AelTestPanel
├── AelSimulationPanel
├── AelResultPanel
├── AelExecutionHistory
├── AelVersionHistory
└── AelPublishDialog
```

---

## 250. COMPONENT RESPONSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COMPONENT RESPONSIBILITY

Cada componente debe tener una responsabilidad clara.

Evitar:

```text
AelRuleWorkspace.vue
```

de miles de líneas.

---

## 251. COMPOSABLE BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

COMPOSABLE BOUNDARY

La lógica API debe estar en:

```text
composables/services
```

no dispersa en componentes.

---

## 252. TYPES

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TYPES

DTOs generados o compartidos deben distinguir:

```text
API types
Domain types
UI view models
```

---

## 253. NO DOMAIN LEAK

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

NO DOMAIN LEAK

No importar clases del Runtime directamente en componentes Vue.

---

## 254. ERROR BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

ERROR BOUNDARY

Un fallo de una ejecución no debe destruir todo el workspace.

---

## 255. TELEMETRY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

TELEMETRY

Puede medirse:

```text
validation duration
publish duration
editor errors
execution request duration
```

sin capturar Source sensible por defecto.

---

## 256. PRODUCT ANALYTICS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

PRODUCT ANALYTICS

Si AQUILA utiliza analytics:

```text
event names
```

no deben incluir Source completo.

---

## 257. UX PERFORMANCE TARGETS

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

UX PERFORMANCE TARGETS

Objetivos iniciales:

```text
editor interaction → instantánea
local UI state → <100ms
validation feedback → dependiente de API
```

Los números definitivos deben medirse en implementación real.

---

## 258. AEL-004

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

AEL-004

Nombre:

```text
AEL-004 — Rule Workspace & Developer Experience
```

---

## 259. EXIT CRITERIA

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

EXIT CRITERIA

```text
✓ Rule list
✓ Rule creation
✓ Draft editing
✓ Syntax highlighting
✓ Diagnostics
✓ Contract autocomplete
✓ Function autocomplete
✓ Dependencies
✓ Capabilities
✓ Test cases
✓ Simulation
✓ Result display
✓ Version history
✓ Source diff
✓ Publish flow
✓ Execution history
✓ Permission-aware UI
✓ Accessibility baseline
✓ Error recovery
✓ E2E workspace tests
```

---

## 260. E2E USER JOURNEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

E2E USER JOURNEY

Debe funcionar:

```text
Login
 ↓
Rules
 ↓
New Rule
 ↓
Enter Source
 ↓
Validate
 ↓
Fix diagnostic
 ↓
Test
 ↓
Simulate
 ↓
Publish
 ↓
Execute
 ↓
View result
 ↓
View audit/history
```

---

## 261. CANONICAL USER JOURNEY

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

CANONICAL USER JOURNEY

Source:

```text
DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

Resultado:

```text
542250 COP
```

La UI debe hacer visible:

```text
AREA
M2

RATE
COP/M2

RESULT
COP
```

---

## 262. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_AEL_UI_Rule_Workspace 21.md

FINAL ARCHITECTURE

```text
                         AEL RULE WORKSPACE
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
       Editor                 Inspector               Actions
          │                       │                       │
          ▼                       ▼                       ▼
      Source                Diagnostics              Validate
      Syntax                Dependencies             Test
      Navigation             Capabilities             Simulate
                                                     Publish
                                                         │
                                                         ▼
                                                     AEL API
                                                         │
                     ┌───────────────────────────────────┤
                     ▼                                   ▼
              Application Services                    Runtime
                     │                                   │
                     ▼                                   ▼
               PostgreSQL                           Providers
```

---
