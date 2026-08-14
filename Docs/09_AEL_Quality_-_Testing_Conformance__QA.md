# AEL V1 — AEL Quality — Testing, Conformance & QA

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
09 — Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md
44 — Motor de liquidacion_Testing Strategy 44.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

OBJETIVO

La estrategia de QA de AEL debe validar:

```text
Lenguaje
Type System
Compiler
Analyzer
IR
Artifact
Verifier
Runtime
Contracts
Providers
Capabilities
Security
Determinism
Multitenancy
Performance
```

---

## 2. PRINCIPIO DE CONFORMIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PRINCIPIO DE CONFORMIDAD

La implementación debe comportarse conforme a:

```text
Documentos AEL V1
```

No al revés.

Si el código actual contradice la especificación:

```text
especificación
+
test
```

determinan el comportamiento esperado.

---

## 3. NIVELES DE PRUEBA

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

NIVELES DE PRUEBA

AEL utilizará varios niveles:

```text
1. Unit Tests
2. Lexer Tests
3. Parser Tests
4. Analyzer Tests
5. Type System Tests
6. Compiler Tests
7. IR Tests
8. Artifact Tests
9. Verifier Tests
10. Runtime Tests
11. Contract Tests
12. Provider Tests
13. Security Tests
14. Integration Tests
15. Conformance Tests
16. Property Tests
17. Fuzz Tests
18. Performance Tests
19. End-to-End Tests
```

---

## 4. PIRÁMIDE DE PRUEBAS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PIRÁMIDE DE PRUEBAS

La mayor cantidad de pruebas debe estar en capas rápidas:

```text
                 E2E
                /   \
          Integration
             /       \
        Conformance
          /       \
      Runtime   Compiler
       /             \
     Unit Tests / Property Tests
```

No depender exclusivamente de E2E.

---

## 5. TEST UNITARIO

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST UNITARIO

Debe probar una unidad aislada.

Ejemplo:

```text
Money + Money
```

o:

```text
Lexer(NUMBER)
```

---

## 6. TEST DE LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST DE LEXER

Debe verificar:

```text
keywords
identifiers
numbers
strings
operators
comments
units
currency symbols
locations
```

---

## 7. LEXER VALID CASE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

LEXER VALID CASE

Input:

```ael
DEFINIR area = 120.50 M2
```

Debe reconocer correctamente:

```text
DEFINIR
area
=
120.50
M2
```

---

## 8. LEXER INVALID CASE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

LEXER INVALID CASE

Input:

```text
120..50
```

Debe producir diagnóstico léxico.

---

## 9. SOURCE LOCATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SOURCE LOCATION TEST

Cada token debe conservar:

```text
line
column
startOffset
endOffset
```

El test debe comprobar ubicaciones exactas.

---

## 10. PARSER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PARSER TESTS

Cada producción EBNF debe tener:

```text
caso válido
caso inválido
caso límite
```

---

## 11. PARSER GOLDEN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PARSER GOLDEN TEST

Source:

```ael
REGLA TEST

DEFINIR area = 100 M2

RETORNAR area
```

El AST esperado se conserva como:

```text
golden AST
```

---

## 12. AST GOLDEN

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

AST GOLDEN

El golden test permite detectar cambios accidentales en:

```text
estructura
nombres de nodos
orden
metadata
```

---

## 13. ANALYZER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ANALYZER TESTS

Deben cubrir:

```text
name resolution
scope
shadowing
types
dimensions
nullability
returns
contracts
functions
dependencies
capabilities
control flow
```

---

## 14. NAME RESOLUTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

NAME RESOLUTION TEST

Válido:

```ael
DEFINIR area = 100 M2
RETORNAR area
```

Inválido:

```ael
RETORNAR area
```

sin declaración.

---

## 15. SCOPE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SCOPE TEST

Debe verificarse:

```ael
SI VERDADERO ENTONCES
    DEFINIR descuento = 10
FIN
```

que `descuento` no esté disponible fuera del scope según las reglas V1.

---

## 16. DUPLICATE SYMBOL TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DUPLICATE SYMBOL TEST

```ael
DEFINIR area = 100
DEFINIR area = 200
```

Debe producir:

```text
AEL-SCOPE-001
```

---

## 17. TYPE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TYPE TEST

```ael
100 + 50
```

válido.

```ael
"100" + 50
```

inválido.

---

## 18. DIMENSION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DIMENSION TEST

```ael
100 M2 + 20 M2
```

válido.

```ael
100 M2 + 20 KG
```

inválido.

---

## 19. MONEY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MONEY TEST

```ael
100000 COP + 50000 COP
```

resultado:

```text
150000 COP
```

---

## 20. MONEY CURRENCY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MONEY CURRENCY TEST

Si V1 no permite mezclar monedas implícitamente:

```ael
100 COP + 50 USD
```

debe producir error.

No realizar conversión silenciosa.

---

## 21. QUANTITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

QUANTITY TEST

```ael
100 M2 * 2
```

resultado:

```text
200 M2
```

---

## 22. DIMENSIONAL ALGEBRA TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DIMENSIONAL ALGEBRA TEST

```text
120.50 M2
×
4500 COP/M2
=
542250 COP
```

Este es un test canónico obligatorio.

---

## 23. DIVISION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DIVISION TEST

```ael
100 / 0
```

debe producir:

```text
AEL-MATH-001
```

---

## 24. BOOLEAN TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BOOLEAN TESTS

```ael
VERDADERO Y VERDADERO
```

resultado:

```text
VERDADERO
```

---

## 25. SHORT-CIRCUIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SHORT-CIRCUIT TEST

Debe comprobarse:

```text
FALSO Y expresión_costosa
```

no evalúa la segunda expresión.

Igualmente:

```text
VERDADERO O expresión_costosa
```

no evalúa la segunda expresión.

---

## 26. CONDITIONAL TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONDITIONAL TEST

```ael
SI VERDADERO ENTONCES
    RETORNAR 100
SINO
    RETORNAR 200
FIN
```

resultado:

```text
100
```

---

## 27. LOOP LIMIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

LOOP LIMIT TEST

```ael
MIENTRAS VERDADERO
FIN
```

o equivalente compilable debe terminar por:

```text
instruction limit
```

o:

```text
time limit
```

según la primera barrera alcanzada.

---

## 28. RETURN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RETURN TEST

Todas las rutas requeridas deben producir resultado.

Debe existir test de:

```text
return en ambas ramas
return ausente
return incompatible
```

---

## 29. CONTRACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONTRACT TESTS

Cada Contract publicado debe tener:

```text
happy path
missing context
wrong tenant
wrong type
wrong unit
wrong dimension
null
provider error
timeout
```

---

## 30. FUNCTION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FUNCTION TESTS

Cada Function debe tener:

```text
valid inputs
invalid inputs
boundary inputs
null inputs
type mismatch
overflow
determinism
```

según corresponda.

---

## 31. PROVIDER CONTRACT TEST SUITE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PROVIDER CONTRACT TEST SUITE

Todos los Providers deben ejecutar una suite común.

Ejemplo:

```text
resolve()
wrong tenant
missing context
timeout
error
type validation
null validation
```

---

## 32. CAPABILITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CAPABILITY TESTS

Debe verificarse:

```text
capability concedida → acceso permitido
capability ausente → acceso denegado
```

---

## 33. CAPABILITY BYPASS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CAPABILITY BYPASS TEST

Intentar obtener un Contract sin la capability correspondiente.

Debe fallar:

```text
AEL-SECURITY-CAPABILITY-001
```

---

## 34. TENANT ISOLATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TENANT ISOLATION TEST

Contexto:

```text
tenant = A
```

Intentar acceder a datos:

```text
tenant = B
```

Resultado:

```text
DENIED
```

Debe probarse tanto en Provider como en integración con base de datos/RLS.

---

## 35. RLS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RLS TEST

No confiar únicamente en Runtime.

Debe existir prueba que demuestre que:

```text
Provider bug
```

no permite:

```text
cross-tenant data access
```

gracias a RLS.

---

## 36. ARTIFACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ARTIFACT TESTS

Validar:

```text
formatVersion
languageVersion
runtimeVersion
constants
locals
contracts
functions
capabilities
instructions
entryPoint
hash
```

---

## 37. ARTIFACT TAMPERING TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ARTIFACT TAMPERING TEST

Modificar un Artifact válido.

Ejemplo:

```text
ADD
```

por:

```text
SUBTRACT
```

Debe fallar integridad.

---

## 38. OPCODE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

OPCODE TEST

Opcode desconocido:

```text
999
```

debe ser rechazado.

---

## 39. OPERAND TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

OPERAND TEST

Ejemplo:

```text
LOAD_LOCAL 9999
```

cuando no existe ese local.

Debe ser rechazado por Verifier.

---

## 40. JUMP TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

JUMP TEST

Debe comprobar:

```text
target válido
target inválido
target fuera de rango
```

---

## 41. CONSTANT POOL TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONSTANT POOL TEST

Debe comprobar:

```text
índice válido
índice inválido
tipo esperado
```

---

## 42. RUNTIME TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RUNTIME TESTS

El Runtime debe probar:

```text
stack
locals
instruction pointer
functions
contracts
jumps
return
limits
errors
cancellation
```

---

## 43. STACK UNDERFLOW TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

STACK UNDERFLOW TEST

Ejecutar:

```text
MULTIPLY
```

sin dos valores.

Debe producir:

```text
AEL-RUNTIME-STACK-001
```

---

## 44. STACK DEPTH TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

STACK DEPTH TEST

Crear ejecución que supere:

```text
maxStackDepth
```

Debe detenerse.

---

## 45. LOCAL ACCESS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

LOCAL ACCESS TEST

```text
LOAD_LOCAL valid
```

funciona.

```text
LOAD_LOCAL invalid
```

debe fallar.

---

## 46. FUNCTION CALL TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FUNCTION CALL TEST

Ejecutar una Function registrada con:

```text
argumentos válidos
```

y verificar:

```text
resultado
```

---

## 47. UNKNOWN FUNCTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

UNKNOWN FUNCTION TEST

Artifact con Function inexistente:

```text
AEL-RUNTIME-FUNCTION-001
```

---

## 48. CONTRACT RESOLUTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONTRACT RESOLUTION TEST

Artifact con Contract válido:

```text
LOAD_CONTRACT
```

debe producir el AELValue correcto.

---

## 49. UNKNOWN CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

UNKNOWN CONTRACT TEST

Contract inexistente:

```text
AEL-RUNTIME-CONTRACT-001
```

---

## 50. RETURN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RETURN TEST

```text
PUSH_CONSTANT
RETURN
```

debe producir el valor.

---

## 51. EXECUTION LIMIT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

EXECUTION LIMIT TESTS

Probar por separado:

```text
maxInstructions
maxExecutionTime
maxStackDepth
maxListSize
maxStringLength
maxProviderCalls
```

---

## 52. CANCELLATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CANCELLATION TEST

Una ejecución recibe:

```text
AbortSignal
```

Resultado:

```text
CANCELLED
```

No resultado parcial válido.

---

## 53. TRACE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TRACE TEST

Con trace habilitado:

```text
trace entries > 0
```

Con trace deshabilitado:

```text
trace = null
```

o equivalente.

---

## 54. TRACE LIMIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TRACE LIMIT TEST

Superar:

```text
maxTraceEntries
```

debe limitar la traza sin alterar el resultado de la regla.

---

## 55. DETERMINISM TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DETERMINISM TEST

Ejecutar:

```text
Artifact X
Context Y
```

100 veces.

Esperar:

```text
mismo resultado
```

---

## 56. DETERMINISM HASH TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DETERMINISM HASH TEST

Para una ejecución reproducible:

```text
execution fingerprint
```

debe permanecer estable si:

```text
Artifact
Context
Versions
Snapshot
```

son iguales.

---

## 57. SIMULATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SIMULATION TEST

Ejecutar:

```text
SnapshotProvider
```

y comparar con:

```text
ProductionProvider
```

cuando ambos contienen los mismos valores.

Resultado esperado:

```text
mismo valor
```

---

## 58. COMPILER GOLDEN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

COMPILER GOLDEN TEST

Source:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

Debe generar un Artifact esperado.

---

## 59. ARTIFACT GOLDEN

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ARTIFACT GOLDEN

Conservar una representación canónica:

```text
artifact.json
```

o formato binario canónico.

El test compara:

```text
generatedArtifact
vs
expectedArtifact
```

---

## 60. IR GOLDEN

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

IR GOLDEN

El mismo Source debe generar IR esperado.

Ejemplo:

```text
LOAD_CONTRACT 0
STORE_LOCAL 0
LOAD_CONTRACT 1
STORE_LOCAL 1
LOAD_LOCAL 0
LOAD_LOCAL 1
MULTIPLY
RETURN
```

---

## 61. SOURCE MAP TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SOURCE MAP TEST

Cada instrucción relevante debe poder mapearse al Source.

Ejemplo:

```text
MULTIPLY
→ línea 9
```

---

## 62. ERROR GOLDEN TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ERROR GOLDEN TEST

Para errores conocidos se puede almacenar:

```text
source
expected error code
expected location
```

Ejemplo:

```text
AEL-DIMENSION-001
line 5
column 12
```

---

## 63. ERROR MESSAGE STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ERROR MESSAGE STABILITY

Los códigos deben ser estables.

Los textos pueden mejorar sin romper tests si se valida principalmente:

```text
code
location
severity
```

---

## 64. CONFORMANCE SUITE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONFORMANCE SUITE

Debe existir una suite oficial:

```text
AEL V1 Conformance Suite
```

que contenga casos normativos.

---

## 65. ESTRUCTURA

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ESTRUCTURA

Conceptualmente:

```text
conformance/
├── lexer/
├── parser/
├── types/
├── dimensions/
├── contracts/
├── functions/
├── compiler/
├── artifact/
├── runtime/
├── security/
└── determinism/
```

---

## 66. TEST CASE FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST CASE FORMAT

Cada caso puede contener:

```text
id
description
source
expectedStatus
expectedValue
expectedType
expectedDiagnostics
```

---

## 67. EJEMPLO

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

EJEMPLO

```json
{
  "id": "AEL-TYPES-001",
  "description": "Suma de cantidades de la misma dimensión",
  "source": "RETORNAR 100 M2 + 20 M2",
  "expectedStatus": "VALID",
  "expectedValue": "120 M2"
}
```

---

## 68. INVALID TEST FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

INVALID TEST FORMAT

```json
{
  "id": "AEL-DIM-001",
  "description": "No sumar área y masa",
  "source": "RETORNAR 100 M2 + 20 KG",
  "expectedStatus": "INVALID",
  "expectedDiagnostic": "AEL-DIMENSION-001"
}
```

---

## 69. CONFORMANCE LEVELS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONFORMANCE LEVELS

Puede definirse:

```text
LEVEL 1 — Syntax
LEVEL 2 — Types
LEVEL 3 — Compilation
LEVEL 4 — Runtime
LEVEL 5 — Security
LEVEL 6 — Determinism
```

Una implementación compatible con V1 debe superar todos los niveles obligatorios.

---

## 70. IMPLEMENTATION CERTIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

IMPLEMENTATION CERTIFICATION

Una implementación puede declararse:

```text
AEL V1 CONFORMANT
```

sólo si supera:

```text
mandatory conformance suite
```

---

## 71. NO CERTIFICAR POR COBERTURA

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

NO CERTIFICAR POR COBERTURA

No basta con:

```text
90% code coverage
```

La conformidad se basa en comportamiento.

---

## 72. CODE COVERAGE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CODE COVERAGE

La cobertura sigue siendo útil.

Objetivos recomendados:

```text
Core Runtime: ≥ 90%
Compiler: ≥ 90%
Type System: ≥ 95%
Security: ≥ 95%
```

Los porcentajes son objetivos de ingeniería, no sustituyen conformidad.

---

## 73. BRANCH COVERAGE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BRANCH COVERAGE

Las rutas críticas deben tener alta cobertura:

```text
capability allowed/denied
tenant allowed/denied
provider success/error
runtime success/limit
artifact valid/invalid
```

---

## 74. PROPERTY-BASED TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PROPERTY-BASED TESTING

Probar propiedades generales.

Ejemplo:

```text
x + 0 = x
```

para tipos donde la identidad sea válida.

---

## 75. DIMENSION PROPERTY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DIMENSION PROPERTY

Para unidades compatibles:

```text
A + B
```

debe preservar dimensión.

---

## 76. COMMUTATIVITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

COMMUTATIVITY

Cuando semánticamente corresponda:

```text
A + B = B + A
```

Debe comprobarse sin asumirlo para operaciones donde no corresponda.

---

## 77. ASSOCIATIVITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ASSOCIATIVITY

Para operaciones donde la representación decimal y política de precisión lo permitan:

```text
(A + B) + C
```

debe compararse con:

```text
A + (B + C)
```

La precisión monetaria debe seguir reglas explícitas.

---

## 78. ROUNDING TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ROUNDING TESTS

Las reglas de redondeo deben tener casos:

```text
.004
.005
.006
```

y distintos signos:

```text
-1.005
1.005
```

según la política oficial.

---

## 79. MONEY PRECISION

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MONEY PRECISION

Nunca utilizar tests basados únicamente en `float`.

Validar:

```text
decimal representation
scale
rounding mode
currency
```

---

## 80. FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FUZZING

El Parser debe recibir entradas aleatorias.

Objetivos:

```text
no crash
no infinite loop
no memory explosion
```

---

## 81. ARTIFACT FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

ARTIFACT FUZZING

El Verifier debe recibir Artifacts corruptos.

Resultado esperado:

```text
rechazar
```

no:

```text
crash
```

---

## 82. RUNTIME FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RUNTIME FUZZING

El Runtime puede recibir:

```text
invalid Artifact
```

pero nunca debe ejecutar opcodes no permitidos.

---

## 83. SECURITY FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SECURITY FUZZING

Casos:

```text
malformed Contract IDs
huge operands
invalid jumps
deep stacks
huge constants
invalid strings
```

---

## 84. PERFORMANCE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PERFORMANCE TESTS

Medir:

```text
compile latency
analysis latency
artifact build latency
execution latency
provider latency
memory usage
```

---

## 85. BENCHMARK CANÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BENCHMARK CANÓNICO

Regla:

```ael
DEFINIR area = 120.50 M2
DEFINIR tarifa = 4500 COP/M2

RETORNAR area * tarifa
```

Debe utilizarse como benchmark base.

---

## 86. BENCHMARK COMPLEJO

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BENCHMARK COMPLEJO

Debe existir una regla que incluya:

```text
condiciones
listas
Functions
Contracts
múltiples operaciones
```

para medir crecimiento de coste.

---

## 87. PERFORMANCE REGRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

PERFORMANCE REGRESSION

Una nueva versión no debe empeorar significativamente:

```text
p50
p95
p99
```

sin justificación.

---

## 88. MEMORY REGRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MEMORY REGRESSION

Controlar:

```text
heap
stack
constant pool
trace
provider results
```

---

## 89. LOAD TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

LOAD TEST

Ejecutar múltiples reglas simultáneamente.

Validar:

```text
isolation
throughput
latency
memory
```

---

## 90. CONCURRENCY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CONCURRENCY TEST

Ejecutar:

```text
100+
```

ejecuciones simultáneas según infraestructura objetivo.

Verificar que no exista:

```text
shared mutable state
```

---

## 91. CROSS-TENANT CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CROSS-TENANT CONCURRENCY

Ejecutar simultáneamente:

```text
Tenant A
Tenant B
Tenant C
```

y comprobar que ningún resultado cruza datos.

---

## 92. REGRESSION SUITE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

REGRESSION SUITE

Cada bug corregido debe convertirse en:

```text
regression test
```

---

## 93. BUG ID

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BUG ID

El test puede asociarse a:

```text
issueId
```

Ejemplo:

```text
AEL-REG-001
```

---

## 94. NO DELETE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

NO DELETE TESTS

Los tests de regresión no deben eliminarse porque "el bug ya está solucionado".

La corrección debe permanecer protegida.

---

## 95. RELEASE GATE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RELEASE GATE

Una versión de AEL sólo puede liberarse si:

```text
unit tests PASS
integration tests PASS
conformance PASS
security PASS
artifact verification PASS
regression PASS
```

---

## 96. RELEASE CANDIDATE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RELEASE CANDIDATE

Antes de una versión final:

```text
RC
```

debe ejecutar la suite completa.

---

## 97. COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

COMPATIBILITY MATRIX

Debe mantenerse una matriz:

```text
Language Version
Compiler Version
Runtime Version
Artifact Version
```

Ejemplo:

```text
AEL 1.0
Compiler 1.0
Runtime 1.0
Artifact 1
```

---

## 98. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BACKWARD COMPATIBILITY

Debe comprobarse que:

```text
Runtime 1.1
```

pueda ejecutar Artifacts de:

```text
Runtime target 1.0
```

si la política lo permite.

---

## 99. FORWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FORWARD COMPATIBILITY

No ejecutar:

```text
Artifact 2
```

en Runtime 1 si no está soportado.

---

## 100. MIGRATION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MIGRATION TESTS

Cuando cambie una versión del lenguaje:

```text
old Source
```

debe poder validarse contra la nueva especificación.

---

## 101. CANONICAL BUSINESS CASE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CANONICAL BUSINESS CASE

AQUILA debe tener casos reales representativos.

Ejemplo:

```text
CUOTA_ADMIN
```

con:

```text
AREA = 120.50 M2
TARIFA = 4500 COP/M2
```

resultado:

```text
542250 COP
```

---

## 102. BUSINESS RULE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

BUSINESS RULE TESTS

Además del lenguaje, deben probarse reglas reales:

```text
cuota administrativa
intereses
descuentos
recargos
distribuciones
prorrateos
```

según el dominio funcional.

---

## 103. GOLDEN BUSINESS RESULTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

GOLDEN BUSINESS RESULTS

Para reglas críticas se pueden conservar resultados históricos esperados.

Ejemplo:

```text
RuleVersion
Input Snapshot
Expected Result
```

---

## 104. HISTORICAL REPLAY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

HISTORICAL REPLAY

Una regla publicada debe poder ejecutarse con:

```text
historical snapshot
```

para verificar resultados históricos cuando la política de datos lo permita.

---

## 105. AUDIT REPLAY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

AUDIT REPLAY

La reproducción debe identificar:

```text
Artifact
Contract versions
Function versions
Provider/snapshot
Runtime
```

---

## 106. TEST DATA

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST DATA

Los datos de prueba deben evitar información personal real cuando no sea necesario.

Preferir:

```text
synthetic data
```

---

## 107. MULTITENANT TEST FIXTURES

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MULTITENANT TEST FIXTURES

Los fixtures deben incluir:

```text
Tenant A
Tenant B
Tenant C
```

con datos deliberadamente diferentes.

---

## 108. SECURITY FIXTURES

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

SECURITY FIXTURES

Crear escenarios:

```text
user without capability
tenant mismatch
revoked Artifact
invalid signature
expired policy
```

---

## 109. TEST ENVIRONMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST ENVIRONMENTS

Mínimos:

```text
local
CI
staging
production validation
```

---

## 110. CI PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CI PIPELINE

Cada cambio debe ejecutar:

```text
lint
typecheck
unit
compiler
runtime
conformance
security
```

---

## 111. NIGHTLY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

NIGHTLY TESTS

Pruebas costosas pueden ejecutarse periódicamente:

```text
fuzzing
load tests
long-running tests
full conformance
```

---

## 112. TEST REPORT

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST REPORT

Cada ejecución debe producir:

```text
passed
failed
skipped
duration
coverage
version
commit
```

---

## 113. FAILURE ARTIFACTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FAILURE ARTIFACTS

Cuando falla una prueba deben conservarse:

```text
source
artifact
diagnostics
trace
context fixture
```

cuando sea seguro hacerlo.

---

## 114. TEST REPRODUCIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST REPRODUCIBILITY

Un fallo debe poder reproducirse con:

```text
testId
source
versions
fixture
seed
```

si utiliza generación aleatoria.

---

## 115. RANDOM SEEDS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

RANDOM SEEDS

Fuzz/property tests deben registrar:

```text
seed
```

para poder reproducir un caso.

---

## 116. TEST TIMEOUTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST TIMEOUTS

Ningún test debe quedar ejecutándose indefinidamente.

Debe existir timeout por suite.

---

## 117. FLAKY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FLAKY TESTS

Los tests inestables no deben ocultarse mediante retries infinitos.

Deben:

```text
identificarse
aislarse
corregirse
```

---

## 118. TEST OWNERSHIP

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST OWNERSHIP

Cada área crítica debe tener responsable:

```text
Lexer
Parser
Analyzer
Types
Runtime
Security
Providers
```

---

## 119. QUALITY CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

QUALITY CHECKLIST

Antes de cerrar una feature:

```text
[ ] especificación
[ ] implementación
[ ] test válido
[ ] test inválido
[ ] test límite
[ ] regression test
[ ] documentación
```

---

## 120. FEATURE ACCEPTANCE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FEATURE ACCEPTANCE

Una feature no está terminada si:

```text
funciona manualmente
```

pero:

```text
no tiene test
```

---

## 121. DEFINITION OF DONE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DEFINITION OF DONE

Para AEL V1:

```text
Specification
+
Implementation
+
Tests
+
Conformance
+
Security
+
Documentation
```

---

## 122. TEST SUITE MÍNIMA V1

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

TEST SUITE MÍNIMA V1

Debe existir al menos:

```text
Lexer
Parser
AST
Types
Dimensions
Money
Quantity
Null
Functions
Contracts
Capabilities
Compiler
IR
Artifact
Verifier
Runtime
Limits
Cancellation
Determinism
Security
Tenant Isolation
RLS
Conformance
Regression
```

---

## 123. CERTIFICACIÓN V1

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CERTIFICACIÓN V1

Una versión puede etiquetarse:

```text
AEL V1 CONFORMANT
```

cuando:

```text
mandatory conformance = PASS
security suite = PASS
regression suite = PASS
```

y no existan defectos críticos abiertos.

---

## 124. DEFECT SEVERITY

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

DEFECT SEVERITY

Clasificación:

```text
CRITICAL
HIGH
MEDIUM
LOW
```

---

## 125. CRITICAL

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

CRITICAL

Ejemplos:

```text
cross-tenant data leak
arbitrary code execution
capability bypass
artifact integrity bypass
```

Bloquea release.

---

## 126. HIGH

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

HIGH

Ejemplos:

```text
incorrect money calculation
incorrect dimension validation
runtime crash
major determinism violation
```

Normalmente bloquea release.

---

## 127. MEDIUM

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

MEDIUM

Problemas que afectan:

```text
usability
diagnostics
performance
non-critical behavior
```

Se evalúan según impacto.

---

## 128. LOW

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

LOW

Problemas menores:

```text
message formatting
minor optimization
documentation
```

---

## 129. FINAL QUALITY GATE

> **Origen:** Motor de liquidacion_AEL_V1_Testing_Conformance_QA 9.md

FINAL QUALITY GATE

Antes de considerar AEL V1 terminado:

```text
✓ especificación cerrada
✓ conformance suite PASS
✓ security suite PASS
✓ regression suite PASS
✓ canonical business cases PASS
✓ deterministic execution PASS
✓ tenant isolation PASS
✓ artifact verification PASS
✓ performance baseline established
```

---

## 130. OBJETIVO

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

OBJETIVO

Definir una estrategia de pruebas para:

```text
Language
Lexer
Parser
Semantic Analysis
Type System
Control Flow
Compiler
IR
Artifact
Verifier
Runtime
Providers
Functions
PostgreSQL
RLS
Security
Observability
API
End-to-End
```

---

## 131. PIRÁMIDE DE PRUEBAS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PIRÁMIDE DE PRUEBAS

```text
                 E2E
              Security
          Integration
        Component Tests
      Property / Fuzzing
     Unit / Golden Tests
```

La mayor cantidad de pruebas debe estar en niveles rápidos.

---

## 132. TEST CATEGORIES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST CATEGORIES

```text
Unit
Golden
Snapshot
Property-Based
Fuzz
Mutation
Component
Integration
Security
Performance
Concurrency
End-to-End
Regression
```

---

## 133. TEST INVARIANT

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST INVARIANT

Cada componente debe definir:

```text
input
expected behavior
invariants
failure behavior
```

---

## 134. UNIT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

UNIT TESTS

Probar componentes aislados:

```text
Lexer
Parser
Type Checker
Operator Engine
Verifier
Runtime Instructions
Error Mapper
```

---

## 135. LEXER TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

LEXER TESTS

Mínimo:

```text
identifiers
numbers
strings
operators
keywords
whitespace
comments
invalid characters
unterminated literals
```

---

## 136. LEXER EDGE CASES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

LEXER EDGE CASES

Probar:

```text
empty source
very long token
unicode
escaped characters
numeric boundaries
```

---

## 137. PARSER TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PARSER TESTS

Cada grammar production debe tener:

```text
valid example
invalid example
boundary example
```

---

## 138. PARSER PRECEDENCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PARSER PRECEDENCE

Crear pruebas explícitas para:

```text
arithmetic
comparison
logical
unary
parentheses
```

---

## 139. PARSER ASSOCIATIVITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PARSER ASSOCIATIVITY

Validar operadores:

```text
left associative
right associative
non-associative
```

según especificación.

---

## 140. AST TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

AST TESTS

Verificar:

```text
node kind
children
source spans
immutability
```

---

## 141. SOURCE SPAN TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SOURCE SPAN TESTS

Cada AST node relevante debe conservar:

```text
start
end
```

---

## 142. SEMANTIC TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SEMANTIC TESTS

Probar:

```text
identifier resolution
Contract resolution
Function resolution
scope
duplicate definitions
unknown references
```

---

## 143. TYPE TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TYPE TESTS

Matriz:

```text
valid type combinations
invalid type combinations
nullable
Money
Quantity
Boolean
String
DateTime
Record
List
```

si esos tipos forman parte de V1.

---

## 144. OPERATOR TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

OPERATOR TESTS

Para cada operador:

```text
valid operands
invalid operands
result type
edge cases
error behavior
```

---

## 145. NUMERIC TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

NUMERIC TESTS

Incluir:

```text
zero
negative
large
small
precision
rounding
division
overflow
```

---

## 146. MONEY TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

MONEY TESTS

Probar:

```text
same currency
different currency
zero
negative
precision
rounding
```

---

## 147. QUANTITY TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

QUANTITY TESTS

Probar:

```text
same dimension
compatible units
incompatible dimensions
conversion
precision
```

---

## 148. NULL TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

NULL TESTS

Validar explícitamente:

```text
null comparison
null propagation
nullable contract
non-null contract
```

según la semántica oficial.

---

## 149. FUNCTION TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUNCTION TESTS

Para cada Function:

```text
arguments
types
return
capability
errors
determinism
purity
```

---

## 150. CONTRACT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONTRACT TESTS

Para cada Contract:

```text
resolution
version
return type
provider
capabilities
nullable
```

---

## 151. CONTROL FLOW TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONTROL FLOW TESTS

Probar:

```text
if
else
nested conditions
short-circuit
return
loops
```

si loops forman parte de V1.

---

## 152. SHORT-CIRCUIT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SHORT-CIRCUIT TESTS

Validar que:

```text
A AND B
```

no evalúe B cuando la semántica indique que no corresponde.

Igualmente:

```text
A OR B
```

---

## 153. RETURN TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RETURN TESTS

Probar:

```text
single return
nested return
invalid return type
missing return
```

---

## 154. IR TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

IR TESTS

Verificar:

```text
valid IR
invalid IR
type invariants
control flow
block structure
```

---

## 155. IR GOLDEN TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

IR GOLDEN TESTS

Source:

```text
AEL
```

Expected:

```text
IR snapshot
```

---

## 156. BYTECODE GOLDEN TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

BYTECODE GOLDEN TESTS

Source:

```text
AEL
```

Expected:

```text
canonical Artifact
```

---

## 157. GOLDEN TEST STABILITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

GOLDEN TEST STABILITY

Golden fixtures deben actualizarse sólo cuando:

```text
semantic change
intentional compiler change
```

haya sido aprobado.

---

## 158. ARTIFACT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ARTIFACT TESTS

Probar:

```text
header
version
constant pool
instructions
dependencies
source map
hash
```

---

## 159. ARTIFACT CORRUPTION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ARTIFACT CORRUPTION

Modificar deliberadamente:

```text
opcode
operand
index
jump
constant
length
hash
```

y verificar rechazo.

---

## 160. VERIFIER TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

VERIFIER TESTS

Probar:

```text
unknown opcode
invalid operand
invalid constant
invalid jump
stack underflow
stack merge mismatch
invalid dependency
unsupported version
```

---

## 161. VERIFIER FUZZING

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

VERIFIER FUZZING

Generar Artifacts aleatorios y verificar:

```text
never crash
never hang
never execute invalid Artifact
```

---

## 162. VERIFIER SECURITY INVARIANT

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

VERIFIER SECURITY INVARIANT

Nunca debe existir:

```text
invalid Artifact
→ Runtime execution
```

---

## 163. RUNTIME UNIT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RUNTIME UNIT TESTS

Cada opcode debe tener:

```text
happy path
invalid state
boundary
error
```

---

## 164. STACK TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

STACK TESTS

Probar:

```text
push
pop
underflow
depth
merge
```

---

## 165. EXECUTION LIMIT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

EXECUTION LIMIT TESTS

Probar:

```text
maxSteps
maxStackDepth
maxFunctionCalls
maxContractCalls
```

---

## 166. TIMEOUT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TIMEOUT TESTS

Execution que excede:

```text
deadline
```

debe producir:

```text
AEL-EXECUTION-001
```

---

## 167. CANCELLATION TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CANCELLATION TESTS

AbortSignal debe producir:

```text
AEL-EXECUTION-002
```

---

## 168. CONTEXT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONTEXT TESTS

Validar:

```text
tenantId
actorId
capabilities
clock
timezone
requestId
```

---

## 169. CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONTEXT IMMUTABILITY

Provider/Function no puede modificar:

```text
tenantId
capabilities
```

---

## 170. PROVIDER UNIT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PROVIDER UNIT TESTS

Cada Provider debe probar:

```text
valid result
invalid result
timeout
not found
database failure
authorization
```

---

## 171. FUNCTION ADAPTER TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUNCTION ADAPTER TESTS

Cada Adapter:

```text
arguments
result
errors
capability
timeout
cancellation
```

---

## 172. PROVIDER CONTRACT TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PROVIDER CONTRACT TEST

Cada Provider debe cumplir:

```text
Contract return type
Contract nullability
Contract semantics
```

---

## 173. DATABASE TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

DATABASE TESTS

Probar:

```text
CRUD
constraints
transactions
timeouts
mapping
```

---

## 174. RLS TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RLS TESTS

Para cada tenant-scoped table:

```text
SELECT isolation
INSERT isolation
UPDATE isolation
DELETE isolation
```

---

## 175. CROSS-TENANT TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CROSS-TENANT TEST

Escenario:

```text
Tenant A context
Tenant B record
```

resultado esperado:

```text
DENY / invisible
```

---

## 176. TENANT OVERRIDE TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TENANT OVERRIDE TEST

Intentar cambiar:

```text
tenantId
```

desde input/Rule.

Resultado:

```text
rejected
```

---

## 177. CLAIM TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CLAIM TESTS

Probar:

```text
valid claim
missing claim
forged claim
expired session
wrong tenant
```

---

## 178. CAPABILITY TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CAPABILITY TESTS

Probar:

```text
allowed
denied
missing
expired/revoked
```

---

## 179. SERVICE ROLE TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SERVICE ROLE TESTS

Verificar que:

```text
service_role
```

no esté presente en:

```text
frontend
Artifact
Source
logs
```

---

## 180. SQL INJECTION TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SQL INJECTION TESTS

Inputs maliciosos deben permanecer:

```text
data
```

no convertirse en:

```text
SQL
```

---

## 181. SSRF TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SSRF TESTS

Intentar:

```text
localhost
127.0.0.1
private IP
metadata service
redirect bypass
DNS rebinding
```

---

## 182. SECRET LEAK TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SECRET LEAK TESTS

Buscar accidentalmente:

```text
API keys
passwords
tokens
connection strings
```

en:

```text
Source
Artifact
logs
errors
responses
```

---

## 183. ERROR TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ERROR TESTS

Cada error code crítico debe tener:

```text
trigger
expected code
expected severity
expected safe message
```

---

## 184. ERROR GOLDEN TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ERROR GOLDEN TESTS

Verificar:

```text
code
span
message structure
```

---

## 185. ERROR REDACTION TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ERROR REDACTION TESTS

Sensitive values deben resultar:

```text
redacted
```

---

## 186. PROPERTY-BASED TESTING

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PROPERTY-BASED TESTING

Usar propiedades generales:

```text
compiler never crashes
verifier never accepts invalid stack
runtime never exceeds configured limits
```

---

## 187. LEXER PROPERTY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

LEXER PROPERTY

Para cualquier Source válido:

```text
lexing is deterministic
```

---

## 188. PARSER PROPERTY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PARSER PROPERTY

Para AST serializable:

```text
parse(print(AST))
```

debe conservar semantics cuando exista pretty-printer oficial.

---

## 189. COMPILER PROPERTY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

COMPILER PROPERTY

Mismo:

```text
Source
Registry snapshot
Compiler version
```

debe producir Artifact determinista cuando la build sea determinista.

---

## 190. VERIFIER PROPERTY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

VERIFIER PROPERTY

```text
verify(valid artifact)
=
accept
```

y:

```text
verify(invalid artifact)
=
reject
```

---

## 191. RUNTIME PROPERTY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RUNTIME PROPERTY

Para un Artifact verificado:

```text
runtime
```

no debe violar:

```text
resource policy
type invariants
capability policy
```

---

## 192. FUZZING

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUZZING

Fuzz targets:

```text
Lexer
Parser
Compiler
Artifact Decoder
Verifier
Runtime
Provider inputs
```

---

## 193. FUZZING PRINCIPLE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUZZING PRINCIPLE

Fuzz input nunca debe:

```text
crash process
hang indefinitely
bypass security
```

---

## 194. FUZZ TIMEOUT

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUZZ TIMEOUT

Cada fuzz case debe tener:

```text
hard timeout
```

---

## 195. FUZZ CORPUS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUZZ CORPUS

Conservar:

```text
interesting cases
regressions
security cases
```

---

## 196. MUTATION TESTING

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

MUTATION TESTING

Aplicar mutaciones para comprobar que tests detectan:

```text
removed condition
wrong operator
wrong comparison
tenant filter removal
capability removal
```

---

## 197. SECURITY MUTATION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SECURITY MUTATION

Especialmente importante:

```text
remove RLS condition
remove capability check
change tenant context
skip verifier
```

Los tests deben fallar.

---

## 198. CONFORMANCE SUITE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONFORMANCE SUITE

Crear suite oficial:

```text
AEL Conformance Suite
```

---

## 199. CONFORMANCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONFORMANCE

Cada implementación de:

```text
Compiler
Verifier
Runtime
```

debe pasar la suite.

---

## 200. LANGUAGE CONFORMANCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

LANGUAGE CONFORMANCE

Validar:

```text
syntax
semantics
types
operators
control flow
errors
```

---

## 201. RUNTIME CONFORMANCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RUNTIME CONFORMANCE

Mismo Artifact debe producir:

```text
same result
same error class
```

en runtimes compatibles.

---

## 202. COMPILER/VERIFIER CONFORMANCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

COMPILER/VERIFIER CONFORMANCE

Compiler sólo debe producir:

```text
Artifacts accepted by Verifier
```

---

## 203. VERIFIER/RUNTIME CONFORMANCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

VERIFIER/RUNTIME CONFORMANCE

Runtime sólo ejecuta:

```text
verified artifacts
```

---

## 204. END-TO-END TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

END-TO-END TEST

Flujo:

```text
Source
→ Compiler
→ Artifact
→ Verifier
→ Runtime
→ Provider
→ PostgreSQL
→ Result
```

---

## 205. E2E TENANT TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

E2E TENANT TEST

Ejecutar:

```text
same Artifact
Tenant A
Tenant B
```

y verificar aislamiento.

---

## 206. E2E SECURITY TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

E2E SECURITY TEST

Intentar:

```text
capability escalation
tenant override
artifact tampering
provider bypass
```

---

## 207. E2E FAILURE TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

E2E FAILURE TEST

Simular:

```text
database down
provider timeout
invalid dependency
```

---

## 208. PERFORMANCE TESTING

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PERFORMANCE TESTING

Medir:

```text
compile latency
verification latency
execution latency
provider latency
database latency
```

---

## 209. BENCHMARKS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

BENCHMARKS

Benchmarks separados para:

```text
small rule
medium rule
large rule
```

---

## 210. HOT PATH BENCHMARK

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

HOT PATH BENCHMARK

Medir:

```text
instruction dispatch
stack operations
operators
function calls
```

---

## 211. PROVIDER BENCHMARK

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PROVIDER BENCHMARK

Medir:

```text
provider resolution
database query
mapping
```

---

## 212. LOAD TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

LOAD TEST

Simular:

```text
many tenants
many concurrent executions
```

---

## 213. STRESS TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

STRESS TEST

Superar carga normal hasta identificar:

```text
resource saturation
```

---

## 214. SOAK TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SOAK TEST

Ejecutar durante períodos prolongados para detectar:

```text
memory leaks
connection leaks
state leaks
```

---

## 215. CONCURRENCY TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONCURRENCY TEST

Mismo Artifact:

```text
many executions
```

simultáneamente.

---

## 216. ISOLATION TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ISOLATION TEST

Verificar que:

```text
stack
locals
context
counters
```

no se compartan.

---

## 217. CACHE TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CACHE TEST

Verificar:

```text
tenant-safe
version-safe
context-safe
```

---

## 218. DATABASE CONCURRENCY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

DATABASE CONCURRENCY

Probar:

```text
simultaneous updates
```

con las políticas de transacción correspondientes.

---

## 219. RACE TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RACE TEST

Detectar:

```text
TOCTOU
duplicate write
lost update
```

---

## 220. REPRODUCIBILITY TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

REPRODUCIBILITY TEST

Con:

```text
FixedClock
mock providers
same artifact
same input
```

esperar:

```text
same output
```

---

## 221. BUILD REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

BUILD REPRODUCIBILITY

Mismo Source + dependencies pinned:

```text
same Artifact hash
```

cuando la build sea declarada reproducible.

---

## 222. SNAPSHOT TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SNAPSHOT TESTS

Snapshots para:

```text
AST
IR
Artifact
Diagnostics
```

---

## 223. SNAPSHOT GOVERNANCE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SNAPSHOT GOVERNANCE

No aceptar automáticamente cambios masivos.

---

## 224. REGRESSION TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

REGRESSION TESTS

Cada bug corregido debe agregar:

```text
regression test
```

---

## 225. BUG ID

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

BUG ID

Cuando exista issue tracker:

```text
test ↔ issue
```

debe quedar trazable.

---

## 226. TEST DATA

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST DATA

Datos de prueba deben ser:

```text
synthetic
```

cuando sea posible.

---

## 227. PRODUCTION DATA

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PRODUCTION DATA

No usar datos reales en tests salvo proceso formal de anonimización.

---

## 228. TENANT FIXTURES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TENANT FIXTURES

Crear fixtures:

```text
Tenant A
Tenant B
Tenant Admin
Tenant User
```

---

## 229. DATABASE FIXTURES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

DATABASE FIXTURES

Fixtures deben incluir:

```text
normal
empty
boundary
invalid
cross-tenant
```

---

## 230. TIME FIXTURES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TIME FIXTURES

Probar:

```text
month boundary
year boundary
leap year
timezone boundary
DST
```

cuando aplique.

---

## 231. FINANCIAL FIXTURES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FINANCIAL FIXTURES

Probar:

```text
rounding
decimal precision
tax
discount
zero
negative where permitted
```

---

## 232. SECURITY FIXTURES

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SECURITY FIXTURES

Probar:

```text
missing capability
wrong tenant
expired auth
tampered artifact
```

---

## 233. TEST ENVIRONMENTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST ENVIRONMENTS

Separar:

```text
unit
integration
staging
production-like
```

---

## 234. EPHEMERAL DATABASE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

EPHEMERAL DATABASE

Integration tests pueden utilizar:

```text
ephemeral PostgreSQL
```

cuando sea viable.

---

## 235. RLS IN TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RLS IN TEST

RLS debe estar:

```text
enabled
```

durante integration/security tests.

---

## 236. MIGRATION TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

MIGRATION TEST

Cada migration debe probar:

```text
apply
rollback
compatibility
data integrity
```

según estrategia de migración.

---

## 237. CONTRACT MIGRATION TEST

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONTRACT MIGRATION TEST

DB migration debe validar:

```text
existing Contract
new Contract
existing Artifact
```

cuando corresponda.

---

## 238. PROVIDER CONTRACT TEST SUITE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PROVIDER CONTRACT TEST SUITE

Cada Provider nuevo debe ejecutar:

```text
standard Contract Provider tests
```

---

## 239. FUNCTION CONTRACT TEST SUITE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUNCTION CONTRACT TEST SUITE

Cada Function Adapter nuevo debe ejecutar:

```text
standard Function Adapter tests
```

---

## 240. CI PIPELINE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CI PIPELINE

Orden recomendado:

```text
Lint
 ↓
Typecheck
 ↓
Unit
 ↓
Golden
 ↓
Integration
 ↓
Security
 ↓
Fuzz smoke
 ↓
Build
 ↓
Artifact verification
```

---

## 241. PULL REQUEST GATE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PULL REQUEST GATE

No merge si fallan:

```text
unit
typecheck
security
conformance
```

críticos.

---

## 242. NIGHTLY TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

NIGHTLY TESTS

Reservar para:

```text
extended fuzzing
stress
soak
full integration
```

---

## 243. RELEASE GATE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

RELEASE GATE

Antes de producción:

```text
all critical tests pass
```

---

## 244. SECURITY RELEASE GATE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SECURITY RELEASE GATE

Debe pasar:

```text
dependency scan
security suite
RLS suite
artifact verification
```

---

## 245. PERFORMANCE GATE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PERFORMANCE GATE

No aceptar regresiones significativas sin aprobación.

---

## 246. COVERAGE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

COVERAGE

Coverage debe medirse por:

```text
line
branch
function
critical path
```

---

## 247. COVERAGE LIMITATION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

COVERAGE LIMITATION

No utilizar coverage como única métrica de calidad.

---

## 248. CRITICAL CODE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CRITICAL CODE

Cobertura especialmente alta para:

```text
Verifier
Runtime
Auth
RLS integration
Artifact decoder
```

---

## 249. BRANCH COVERAGE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

BRANCH COVERAGE

Especialmente importante para:

```text
security branches
error handling
authorization
```

---

## 250. TEST OWNERSHIP

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST OWNERSHIP

Cada módulo debe tener:

```text
owner
test suite
quality criteria
```

---

## 251. TEST DOCUMENTATION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST DOCUMENTATION

Cada suite crítica debe documentar:

```text
purpose
scope
fixtures
execution
failure interpretation
```

---

## 252. FLAKY TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FLAKY TESTS

Flaky test:

```text
bug de infraestructura/calidad
```

no debe ignorarse indefinidamente.

---

## 253. NO RETRY MASKING

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

NO RETRY MASKING

No usar retries automáticos para ocultar:

```text
flaky tests
```

---

## 254. TEST PARALLELIZATION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST PARALLELIZATION

Tests independientes pueden ejecutarse en paralelo.

---

## 255. TEST ISOLATION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST ISOLATION

Tests no deben compartir:

```text
mutable global state
database state
cache
```

sin aislamiento explícito.

---

## 256. TEST ARTIFACT STORE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST ARTIFACT STORE

Los Artifacts de prueba deben ser:

```text
versioned
isolated
cleaned
```

---

## 257. TEST SECURITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST SECURITY

Nunca almacenar:

```text
production secrets
```

en fixtures.

---

## 258. TEST SECRETS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST SECRETS

Usar:

```text
test credentials
ephemeral secrets
```

---

## 259. OBSERVABILITY TESTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

OBSERVABILITY TESTS

Verificar:

```text
metrics
logs
trace
audit
```

en flujos críticos.

---

## 260. ERROR OBSERVABILITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

ERROR OBSERVABILITY

Cada error crítico debe generar:

```text
appropriate telemetry
```

sin filtrar datos sensibles.

---

## 261. TEST REPORT

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST REPORT

CI debe producir:

```text
pass/fail
coverage
security findings
performance summary
```

---

## 262. TEST ARTIFACTS

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST ARTIFACTS

Conservar:

```text
failed input
failing Artifact
diagnostic
trace
```

cuando sea seguro.

---

## 263. FUZZ REGRESSION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FUZZ REGRESSION

Cada fuzz crash corregido:

```text
→ permanent corpus case
```

---

## 264. SECURITY REGRESSION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

SECURITY REGRESSION

Cada security issue:

```text
→ regression test
```

---

## 265. CONFORMANCE VERSION

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CONFORMANCE VERSION

Suite debe declarar:

```text
AEL language version
artifact format version
runtime semantics version
```

---

## 266. VERSION MATRIX

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

VERSION MATRIX

Probar compatibilidad:

```text
Compiler V1
Verifier V1
Runtime V1
```

y matrices soportadas explícitamente.

---

## 267. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

BACKWARD COMPATIBILITY

Si se soporta ejecución de Artifacts antiguos:

```text
compatibility test
```

obligatorio.

---

## 268. FORWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FORWARD COMPATIBILITY

Runtime no debe aceptar silenciosamente:

```text
future Artifact format
```

---

## 269. UNKNOWN FEATURE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

UNKNOWN FEATURE

Debe producir:

```text
unsupported version/feature
```

---

## 270. TEST EXIT CRITERIA

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

TEST EXIT CRITERIA

```text
✓ Unit tests
✓ Golden tests
✓ Property tests
✓ Fuzzing
✓ Mutation testing
✓ Component tests
✓ Integration tests
✓ RLS tests
✓ Security tests
✓ Performance tests
✓ Concurrency tests
✓ E2E
✓ Regression
✓ Conformance
✓ CI gates
✓ Release gates
✓ Observability tests
```

---

## 271. FINAL TEST PIPELINE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

FINAL TEST PIPELINE

```text
Developer
   ↓
Lint / Typecheck
   ↓
Unit
   ↓
Golden
   ↓
Property
   ↓
Integration
   ↓
RLS / Security
   ↓
Fuzz
   ↓
Performance
   ↓
E2E
   ↓
Build
   ↓
Verifier
   ↓
Release
```

---

## 272. CALIDAD NO NEGOCIABLE

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

CALIDAD NO NEGOCIABLE

Un cambio no se considera terminado si:

```text
tests no cubren el comportamiento
```

o:

```text
security invariant no está probado
```

---

## 273. PRINCIPIO DE REGRESIÓN

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PRINCIPIO DE REGRESIÓN

Cada defecto corregido debe reducir la probabilidad de que reaparezca.

```text
Bug
 ↓
Fix
 ↓
Regression Test
 ↓
Permanent Protection
```

---

## 274. PRINCIPIO DE CONFORMIDAD

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PRINCIPIO DE CONFORMIDAD

Compiler, Verifier y Runtime deben probarse como un sistema:

```text
Compiler
 ↕
Verifier
 ↕
Runtime
```

---

## 275. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Testing Strategy 44.md

PRINCIPIO DE SEGURIDAD

La prueba más importante no es:

```text
"¿funciona?"
```

sino:

```text
"¿puede violar una invariant?"
```

---
