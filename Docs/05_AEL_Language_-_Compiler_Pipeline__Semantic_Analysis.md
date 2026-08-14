# AEL V1 — AEL Language — Compiler Pipeline & Semantic Analysis

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
07 — Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md
25 — Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md
26 — Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md
38 — Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md
58 — Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

OBJETIVO

El Compiler Pipeline convierte:

```text
SOURCE
```

en:

```text
VERIFIED ARTIFACT
```

mediante etapas independientes:

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
ARTIFACT BUILDER
  ↓
ARTIFACT
  ↓
ARTIFACT VERIFIER
  ↓
VERIFIED ARTIFACT
```

---

## 2. PRINCIPIO FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

PRINCIPIO FUNDAMENTAL

Una regla que contiene errores conocidos no debe llegar al Runtime.

Por ejemplo:

```ael
DEFINIR area = 100 M2
DEFINIR peso = 50 KG

RETORNAR area + peso
```

debe ser rechazada durante análisis.

No debe producir:

```text
Artifact válido
```

para posteriormente descubrir el problema durante ejecución.

---

## 3. RESPONSABILIDADES DEL COMPILADOR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

RESPONSABILIDADES DEL COMPILADOR

El Compiler Pipeline debe:

- analizar sintaxis;
- construir AST;
- resolver nombres;
- construir scopes;
- resolver Contracts;
- resolver Functions;
- inferir tipos;
- verificar operaciones;
- verificar dimensiones;
- validar retornos;
- detectar dependencias;
- derivar capabilities;
- generar Typed AST;
- generar IR;
- generar Artifact;
- producir diagnósticos;
- garantizar que el Artifact generado sea verificable.

---

## 4. ETAPAS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ETAPAS

## Etapa 1 — Lexing

```text
SOURCE → TOKENS
```

## Etapa 2 — Parsing

```text
TOKENS → AST
```

## Etapa 3 — Semantic Analysis

```text
AST → TYPED AST
```

## Etapa 4 — IR Generation

```text
TYPED AST → IR
```

## Etapa 5 — Artifact Build

```text
IR → ARTIFACT
```

## Etapa 6 — Verification

```text
ARTIFACT → VERIFIED ARTIFACT
```

---

## 5. COMPILATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

COMPILATION RESULT

Conceptualmente:

```text
CompilationResult
├── success
├── diagnostics
├── ast
├── typedAst
├── ir
├── artifact
└── dependencies
```

Si existen errores bloqueantes:

```text
success = false
artifact = null
```

---

## 6. DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

DIAGNOSTICS

Cada diagnóstico debe contener como mínimo:

```text
code
severity
message
line
column
startOffset
endOffset
sourceSpan
```

Opcionalmente:

```text
details
suggestion
relatedLocations
```

---

## 7. SEVERITIES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SEVERITIES

```text
ERROR
WARNING
INFO
```

Sólo `ERROR` bloquea la generación de Artifact.

---

## 8. DIAGNÓSTICOS DETERMINISTAS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

DIAGNÓSTICOS DETERMINISTAS

El mismo Source debe producir:

```text
mismos errores
mismos códigos
mismas ubicaciones
```

independientemente del entorno de ejecución.

---

## 9. LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

LEXER

El Lexer transforma:

```text
texto
```

en:

```text
tokens
```

Ejemplo:

```ael
DEFINIR total = 100 + 20
```

produce conceptualmente:

```text
KEYWORD(DEFINIR)
IDENTIFIER(total)
EQUAL
NUMBER(100)
PLUS
NUMBER(20)
EOF
```

---

## 10. LEXER NO RESUELVE SEMÁNTICA

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

LEXER NO RESUELVE SEMÁNTICA

El Lexer no debe decidir:

```text
total = variable
```

ni:

```text
UNIT = namespace
```

Su responsabilidad es únicamente reconocer tokens.

---

## 11. TOKEN SOURCE LOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TOKEN SOURCE LOCATION

Cada token debe conservar:

```text
startOffset
endOffset
line
column
```

Esto permite generar diagnósticos precisos.

---

## 12. TOKENIZACIÓN DE UNIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TOKENIZACIÓN DE UNIDADES

Ejemplo:

```ael
120.50 M2
```

Puede tokenizarse como:

```text
NUMBER(120.50)
IDENTIFIER(M2)
```

El Analyzer determinará que:

```text
M2
```

es una unidad registrada.

---

## 13. TOKENIZACIÓN DE MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TOKENIZACIÓN DE MONEY

Ejemplo:

```ael
4500 COP
```

puede producir:

```text
NUMBER(4500)
IDENTIFIER(COP)
```

El Analyzer determina que `COP` corresponde a una moneda registrada.

---

## 14. PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

PARSER

El Parser transforma:

```text
TOKENS
```

en:

```text
AST
```

No debe consultar Providers.

---

## 15. PARSER ERROR RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

PARSER ERROR RECOVERY

El Parser debe intentar continuar después de errores recuperables.

Objetivo:

```text
1 compilación
→ múltiples diagnósticos
```

en lugar de:

```text
1 error
→ detenerse
```

---

## 16. AST VALIDITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

AST VALIDITY

El Analyzer sólo debe recibir un AST estructuralmente consistente.

Si el Parser no puede construir un árbol mínimo válido:

```text
AEL-PARSE-xxx
```

bloquea las etapas posteriores.

---

## 17. SYMBOL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SYMBOL TABLE

El Analyzer construye una tabla de símbolos.

Ejemplo:

```text
SymbolTable
│
├── area
│   ├── kind = VARIABLE
│   ├── type = QUANTITY
│   ├── unit = M2
│   └── dimension = AREA
│
└── tarifa
    ├── kind = VARIABLE
    ├── type = QUANTITY
    ├── unit = COP/M2
    └── dimension = MONEY/AREA
```

---

## 18. SYMBOL KINDS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SYMBOL KINDS

Mínimos:

```text
VARIABLE
FUNCTION
CONTRACT
RULE
```

---

## 19. SYMBOL ID

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SYMBOL ID

Cada símbolo interno puede recibir:

```text
symbolId
```

Esto evita depender de strings durante fases posteriores.

Ejemplo:

```text
area → symbolId 0
tarifa → symbolId 1
```

---

## 20. SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SCOPE

El Analyzer mantiene un árbol de scopes:

```text
RuleScope
│
├── area
├── tarifa
│
└── ConditionalScope
    └── descuento
```

---

## 21. SCOPE RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SCOPE RESOLUTION

Cuando aparece:

```ael
area
```

el Analyzer busca:

```text
scope actual
↓
scope padre
↓
scope superior
```

hasta encontrar el símbolo.

---

## 22. VARIABLE NO DEFINIDA

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

VARIABLE NO DEFINIDA

```ael
RETORNAR area
```

sin declaración:

```text
AEL-NAME-001
```

---

## 23. VARIABLE DUPLICADA

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

VARIABLE DUPLICADA

```ael
DEFINIR area = 100
DEFINIR area = 200
```

en el mismo scope:

```text
AEL-SCOPE-001
```

---

## 24. SHADOWING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SHADOWING

V1 recomienda no permitir shadowing innecesario.

Ejemplo:

```ael
DEFINIR area = 100

SI VERDADERO ENTONCES
    DEFINIR area = 200
FIN
```

Debe producir warning o error según la política definitiva.

Recomendación V1:

```text
ERROR
```

para mantener claridad y auditabilidad.

---

## 25. TYPE ENVIRONMENT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPE ENVIRONMENT

El Analyzer mantiene información:

```text
TypeEnvironment
```

que asocia cada expresión con:

```text
type
unit
dimension
nullability
```

---

## 26. LITERAL ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

LITERAL ANALYSIS

Ejemplo:

```ael
100
```

se analiza como:

```text
NUMBER
```

Ejemplo:

```ael
100 M2
```

como:

```text
QUANTITY
dimension = AREA
unit = M2
```

---

## 27. CONTRACT ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CONTRACT ANALYSIS

Ejemplo:

```ael
PROPERTY.AREA_PRIVATE
```

El Analyzer:

1. identifica namespace;
2. busca Contract;
3. obtiene versión;
4. obtiene schema;
5. obtiene tipo;
6. obtiene unidad;
7. obtiene dimensión;
8. obtiene nullability;
9. obtiene capabilities;
10. registra dependencia.

---

## 28. FUNCTION ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

FUNCTION ANALYSIS

Ejemplo:

```ael
REDONDEAR_DINERO(total)
```

El Analyzer:

1. busca Function;
2. verifica versión;
3. obtiene firma;
4. analiza argumentos;
5. verifica tipos;
6. registra dependencia;
7. deriva capabilities;
8. asigna functionId.

---

## 29. FUNCTION OVERLOADS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

FUNCTION OVERLOADS

V1 debe evitar overloads excesivos.

Si una Function necesita variantes:

```text
FUNCTION_A
FUNCTION_B
```

puede ser preferible a resolver múltiples firmas ambiguas.

Esto simplifica el Analyzer y el Artifact.

---

## 30. TYPE INFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPE INFERENCE

El Analyzer puede inferir tipos.

Ejemplo:

```ael
DEFINIR area = 120 M2
```

infiere:

```text
area:
QUANTITY<AREA,M2>
```

No es necesario escribir:

```ael
DEFINIR area: QUANTITY<AREA,M2>
```

en V1.

---

## 31. EXPRESIONES TIPADAS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EXPRESIONES TIPADAS

Ejemplo:

```ael
area * tarifa
```

si:

```text
area = AREA
tarifa = MONEY/AREA
```

entonces:

```text
resultado = MONEY
```

---

## 32. TYPE CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPE CHECK

El Analyzer utiliza las reglas del Documento 03.

Ejemplo:

```ael
100 M2 + 20 KG
```

produce:

```text
AEL-DIMENSION-001
```

---

## 33. OPERATION MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

OPERATION MATRIX

El Analyzer debe utilizar una matriz formal para:

```text
+
-
*
/
comparaciones
Y
O
NO
```

No implementar reglas dispersas mediante múltiples `if`.

---

## 34. TYPE CHECKING DE SUMA

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPE CHECKING DE SUMA

```text
NUMBER + NUMBER
```

válido.

```text
MONEY<COP> + MONEY<COP>
```

válido.

```text
AREA + AREA
```

válido si unidades compatibles.

```text
AREA + MASS
```

inválido.

---

## 35. TYPE CHECKING DE MULTIPLICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPE CHECKING DE MULTIPLICACIÓN

```text
MONEY × NUMBER
```

produce:

```text
MONEY
```

```text
AREA × RATE
```

produce:

```text
MONEY
```

cuando las dimensiones se cancelan correctamente.

---

## 36. TYPE CHECKING DE COMPARACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPE CHECKING DE COMPARACIÓN

```ael
100 M2 > 50 M2
```

produce:

```text
BOOLEAN
```

```ael
100 M2 > 50 KG
```

produce error.

---

## 37. NULLABILITY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

NULLABILITY ANALYSIS

Si un Contract es:

```text
nullable = true
```

el Analyzer debe conocerlo.

Ejemplo:

```text
PROPERTY.PARKING_COUNT
```

puede ser:

```text
NUMBER | NULO
```

---

## 38. NULO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

NULO

La semántica completa pertenece al Value Engine.

El Analyzer debe impedir operaciones que no tengan semántica definida.

---

## 39. RETURN ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

RETURN ANALYSIS

El Analyzer debe recorrer todas las rutas.

Ejemplo:

```ael
SI activo ENTONCES
    RETORNAR 100
FIN
```

Si la regla requiere retorno obligatorio, existe una ruta sin retorno.

Debe producir:

```text
AEL-RETURN-001
```

si la política de la regla exige resultado en todas las rutas.

---

## 40. RETURN TYPE UNIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

RETURN TYPE UNIFICATION

Ejemplo:

```ael
SI activo ENTONCES
    RETORNAR 100 COP
SINO
    RETORNAR 200 COP
FIN
```

válido.

Ejemplo:

```ael
SI activo ENTONCES
    RETORNAR 100 COP
SINO
    RETORNAR "ERROR"
FIN
```

inválido para una regla cuyo resultado debe ser homogéneo.

---

## 41. CONTROL FLOW ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CONTROL FLOW ANALYSIS

El Analyzer construye conceptualmente un:

```text
Control Flow Graph
```

para determinar:

- rutas alcanzables;
- rutas sin retorno;
- código muerto;
- saltos;
- loops.

---

## 42. DEAD CODE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

DEAD CODE

Ejemplo:

```ael
RETORNAR 100

DEFINIR x = 50
```

Debe producir:

```text
WARNING
```

porque la segunda instrucción no es alcanzable.

---

## 43. UNREACHABLE BLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

UNREACHABLE BLOCK

Ejemplo:

```ael
SI FALSO ENTONCES
    ...
FIN
```

Puede marcarse como código potencialmente inalcanzable.

No debe cambiar la semántica.

---

## 44. LOOP ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

LOOP ANALYSIS

El Analyzer debe detectar estructuras de control.

No necesita demostrar que todo loop termina.

El Runtime aplica:

```text
maxInstructions
maxExecutionTime
```

---

## 45. CONTRACT DEPENDENCY GRAPH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CONTRACT DEPENDENCY GRAPH

El Analyzer construye:

```text
DependencyGraph
```

Ejemplo:

```text
CUOTA_ADMIN
│
├── PROPERTY.AREA_PRIVATE
│
└── PARAMETER.TARIFA_M2
```

---

## 46. FUNCTION DEPENDENCY GRAPH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

FUNCTION DEPENDENCY GRAPH

También:

```text
CUOTA_ADMIN
│
└── REDONDEAR_DINERO
```

---

## 47. CAPABILITY DERIVATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CAPABILITY DERIVATION

A partir de:

```text
Contracts
+
Functions
```

se obtiene:

```text
requiredCapabilities
```

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

## 48. DEPENDENCY NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

DEPENDENCY NORMALIZATION

Las dependencias deben ordenarse de forma determinista.

Ejemplo:

```text
[
  PARAMETER.TARIFA_M2,
  PROPERTY.AREA_PRIVATE
]
```

siempre con el mismo criterio.

Esto favorece hashing reproducible.

---

## 49. VERSION PINNING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

VERSION PINNING

Cada dependencia debe fijar:

```text
id
version
```

No generar:

```text
PARAMETER.TARIFA_M2@latest
```

en un Artifact.

---

## 50. LATEST

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

LATEST

`latest` puede existir en interfaces administrativas para facilitar selección.

Pero antes de generar Artifact debe resolverse a una versión concreta.

---

## 51. CONTRACT AVAILABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CONTRACT AVAILABILITY

Si el Contract no está:

```text
PUBLISHED
```

no puede utilizarse para un Artifact de producción.

---

## 52. FUNCTION AVAILABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

FUNCTION AVAILABILITY

Igual para Functions.

Una Function:

```text
DRAFT
```

no puede formar parte de un Artifact de producción.

---

## 53. SEMANTIC ENVIRONMENT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SEMANTIC ENVIRONMENT

El Analyzer utiliza:

```text
SemanticEnvironment
├── symbols
├── contracts
├── functions
├── units
├── currencies
├── types
└── policies
```

---

## 54. COMPILATION OPTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

COMPILATION OPTIONS

Puede existir:

```text
CompilationOptions
```

con:

```text
targetLanguageVersion
targetArtifactVersion
environment
strictMode
warningsAsErrors
```

---

## 55. STRICT MODE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

STRICT MODE

AEL V1 utiliza:

```text
strictMode = true
```

por defecto.

No se permiten conversiones implícitas peligrosas.

---

## 56. WARNINGS AS ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

WARNINGS AS ERRORS

El Builder puede recibir:

```text
warningsAsErrors = true
```

para entornos de publicación estrictos.

---

## 57. AST ANNOTATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

AST ANNOTATIONS

El Typed AST puede anotar nodos con:

```text
type
unit
dimension
symbolId
contractId
functionId
sourceSpan
```

---

## 58. EXAMPLE TYPED AST

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EXAMPLE TYPED AST

Source:

```ael
area * tarifa
```

Typed AST:

```text
Multiply
├── left
│   ├── symbolId: 0
│   ├── type: QUANTITY
│   ├── dimension: AREA
│   └── unit: M2
│
└── right
    ├── symbolId: 1
    ├── type: QUANTITY
    ├── dimension: MONEY/AREA
    └── unit: COP/M2

result:
    type = MONEY
    currency = COP
```

---

## 59. IR GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

IR GENERATION

El IR Generator transforma Typed AST en instrucciones.

Ejemplo:

```ael
area * tarifa
```

produce:

```text
LOAD_LOCAL area
LOAD_LOCAL tarifa
MULTIPLY
```

---

## 60. TEMPORARY VALUES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEMPORARY VALUES

Las expresiones complejas pueden requerir temporales.

Ejemplo:

```ael
(a + b) * (c + d)
```

IR conceptual:

```text
LOAD a
LOAD b
ADD
STORE_TEMP 0

LOAD c
LOAD d
ADD
STORE_TEMP 1

LOAD_TEMP 0
LOAD_TEMP 1
MULTIPLY
```

La implementación puede optimizar temporales.

---

## 61. LOCAL ALLOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

LOCAL ALLOCATION

El Builder asigna índices:

```text
area → 0
tarifa → 1
total → 2
```

El Runtime utiliza índices.

---

## 62. FUNCTION ID ALLOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

FUNCTION ID ALLOCATION

El Builder resuelve:

```text
REDONDEAR_DINERO
```

a un identificador estable del catálogo.

---

## 63. CONTRACT ID ALLOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CONTRACT ID ALLOCATION

Igualmente:

```text
PARAMETER.TARIFA_M2
```

se convierte en una referencia compacta al Contract registrado.

---

## 64. CONSTANT POOL GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CONSTANT POOL GENERATION

Constantes repetidas pueden deduplicarse.

Ejemplo:

```ael
100
100
100
```

puede utilizar:

```text
constant[0] = 100
```

tres veces.

---

## 65. CANONICAL BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CANONICAL BUILD

El Artifact Builder debe producir siempre el mismo Artifact para:

```text
mismo Source
mismo entorno semántico
mismas versiones
mismas opciones
```

salvo metadata no determinista explícitamente excluida del hash.

---

## 66. SOURCE HASH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SOURCE HASH

Debe calcularse:

```text
sourceHash
```

sobre una representación definida.

Recomendación:

```text
UTF-8 exacto del Source registrado
```

No modificar silenciosamente whitespace antes del hash salvo que exista una política canónica explícita.

---

## 67. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ARTIFACT HASH

Debe calcularse sobre la representación canónica del Artifact.

Esto permite detectar modificaciones.

---

## 68. BUILD METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

BUILD METADATA

Puede contener:

```text
compilerVersion
builtAt
buildId
```

Pero los campos variables no deben contaminar un hash que pretenda representar la semántica del Artifact.

---

## 69. SEMANTIC HASH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SEMANTIC HASH

Si se requiere, puede existir:

```text
semanticHash
```

que excluya metadata operacional.

Esto facilita comparar Artifacts semánticamente equivalentes.

---

## 70. ARTIFACT BUILDER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ARTIFACT BUILDER

Responsabilidades:

```text
Typed AST
 ↓
IR
 ↓
constant pool
 ↓
locals
 ↓
dependencies
 ↓
capabilities
 ↓
instructions
 ↓
metadata
 ↓
hash
```

---

## 71. ARTIFACT VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ARTIFACT VERIFIER

Aunque el Builder haya producido el Artifact:

```text
Artifact
 ↓
Verifier
```

es obligatorio.

---

## 72. VERIFIER RESPONSIBILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

VERIFIER RESPONSIBILITIES

Debe validar:

```text
formatVersion
languageVersion
runtimeVersion
entryPoint
instructions
operands
constants
locals
jumps
contracts
functions
capabilities
hash
```

---

## 73. COMPILER + VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

COMPILER + VERIFIER

El pipeline final:

```text
Compiler
 ↓
Artifact
 ↓
Verifier
 ↓
VerifiedArtifact
```

No:

```text
Compiler
 ↓
Runtime
```

directamente.

---

## 74. COMPILATION CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

COMPILATION CACHE

Puede existir caché de compilación.

Clave conceptual:

```text
sourceHash
+
languageVersion
+
compilerVersion
+
environmentHash
```

---

## 75. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CACHE INVALIDATION

Cambios en:

```text
Contract version
Function version
Language version
Compiler version
```

deben invalidar el Artifact si afectan la semántica.

---

## 76. ENVIRONMENT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ENVIRONMENT HASH

Puede existir:

```text
semanticEnvironmentHash
```

que represente:

```text
Contract registry
Function registry
Unit registry
Currency registry
policies
```

relevantes.

---

## 77. BENEFICIO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

BENEFICIO

Permite saber:

```text
este Artifact fue construido contra este entorno semántico
```

---

## 78. PUBLICATION GATE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

PUBLICATION GATE

Antes de publicar una regla:

```text
Source
 ↓
Compile
 ↓
Diagnostics
 ↓
Artifact
 ↓
Verify
 ↓
Security/Capability Review
 ↓
Publish
```

---

## 79. PUBLISH BLOCKERS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

PUBLISH BLOCKERS

Bloquean publicación:

```text
ERROR
unknown Contract
unknown Function
type mismatch
dimension mismatch
missing return
invalid capability
invalid Artifact
```

---

## 80. WARNINGS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

WARNINGS

No necesariamente bloquean:

```text
dead code
redundant parentheses
optimization opportunity
deprecated Contract
```

La política puede convertirlos en errores.

---

## 81. COMPILER API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

COMPILER API

Conceptualmente:

```text
compile(
    source,
    options
) -> CompilationResult
```

No debe ejecutar la regla.

---

## 82. ANALYZER API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ANALYZER API

Conceptualmente:

```text
analyze(
    ast,
    environment
) -> AnalysisResult
```

---

## 83. IR GENERATOR API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

IR GENERATOR API

```text
generateIR(
    typedAst
) -> IR
```

---

## 84. ARTIFACT BUILDER API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ARTIFACT BUILDER API

```text
buildArtifact(
    ir,
    metadata
) -> Artifact
```

---

## 85. VERIFIER API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

VERIFIER API

```text
verifyArtifact(
    artifact
) -> VerificationResult
```

---

## 86. ERROR CATALOG

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ERROR CATALOG

Categorías:

```text
AEL-LEX
AEL-PARSE
AEL-NAME
AEL-SCOPE
AEL-TYPE
AEL-DIMENSION
AEL-CONTRACT
AEL-FUNCTION
AEL-RETURN
AEL-DEPENDENCY
AEL-CAPABILITY
AEL-ARTIFACT
```

---

## 87. ERROR CODES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ERROR CODES

Ejemplos:

```text
AEL-NAME-001
AEL-SCOPE-001
AEL-TYPE-001
AEL-DIMENSION-001
AEL-CONTRACT-001
AEL-FUNCTION-001
AEL-RETURN-001
AEL-DEPENDENCY-001
AEL-CAPABILITY-001
```

El catálogo oficial debe evitar códigos ambiguos.

---

## 88. ERROR MESSAGE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ERROR MESSAGE

Los mensajes para usuarios deben ser claros.

Ejemplo malo:

```text
TypeError 17
```

Ejemplo correcto:

```text
AEL-DIMENSION-001

No es posible sumar una cantidad de área (M2)
con una cantidad de masa (KG).
```

---

## 89. SUGGESTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SUGGESTIONS

Cuando sea posible:

```text
Sugerencia:
verifique que ambas cantidades utilicen unidades de la misma dimensión.
```

Las sugerencias no deben alterar la semántica.

---

## 90. RELATED DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

RELATED DIAGNOSTICS

Un error puede relacionarse con otro.

Ejemplo:

```text
Contract desconocido
```

puede generar:

```text
ERROR principal
```

y referencias secundarias donde se utiliza.

---

## 91. EJEMPLO COMPLETO DE COMPILACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EJEMPLO COMPLETO DE COMPILACIÓN

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

---

## 92. TOKENS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TOKENS

Conceptualmente:

```text
REGLA
CUOTA_ADMIN

DEFINIR
area
=
PROPERTY
.
AREA_PRIVATE

DEFINIR
tarifa
=
PARAMETER
.
TARIFA_M2

RETORNAR
area
*
tarifa
```

---

## 93. AST

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

AST

```text
Rule
├── Declaration(area)
│   └── ContractReference(PROPERTY.AREA_PRIVATE)
│
├── Declaration(tarifa)
│   └── ContractReference(PARAMETER.TARIFA_M2)
│
└── Return
    └── Multiply
        ├── Identifier(area)
        └── Identifier(tarifa)
```

---

## 94. SYMBOL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

SYMBOL TABLE

```text
area
→ symbol 0
→ QUANTITY<AREA,M2>

tarifa
→ symbol 1
→ QUANTITY<MONEY/AREA,COP/M2>
```

---

## 95. DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

DEPENDENCIES

```text
Contracts:
    PROPERTY.AREA_PRIVATE@1
    PARAMETER.TARIFA_M2@1

Capabilities:
    READ_PROPERTY
    READ_PARAMETER
```

---

## 96. TYPED AST

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TYPED AST

```text
area:
    QUANTITY<AREA,M2>

tarifa:
    QUANTITY<MONEY/AREA,COP/M2>

area * tarifa:
    MONEY<COP>
```

---

## 97. IR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

IR

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

## 98. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

ARTIFACT

El Builder genera:

```text
Artifact formatVersion = 1
languageVersion = 1.0
runtimeVersion = 1.0

locals:
    0 area
    1 tarifa

contracts:
    0 PROPERTY.AREA_PRIVATE@1
    1 PARAMETER.TARIFA_M2@1

capabilities:
    READ_PROPERTY
    READ_PARAMETER

instructions:
    ...
```

---

## 99. VERIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

VERIFICATION

El Verifier comprueba:

```text
✓ entryPoint
✓ local indexes
✓ contract indexes
✓ opcodes
✓ jump targets
✓ capabilities
✓ versions
✓ hash
```

---

## 100. RESULTADO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

RESULTADO

Si todo es correcto:

```text
VerifiedArtifact
```

El Artifact ya puede entregarse al Runtime.

---

## 101. EJEMPLO DE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EJEMPLO DE ERROR

Source:

```ael
REGLA ERROR

DEFINIR area =
    PROPERTY.AREA_PRIVATE

DEFINIR peso =
    PROPERTY.WEIGHT

RETORNAR
    area + peso
```

Analyzer:

```text
area:
AREA

peso:
MASS
```

Operación:

```text
AREA + MASS
```

Resultado:

```text
AEL-DIMENSION-001
```

No se genera Artifact.

---

## 102. EJEMPLO DE CONTRACT DESCONOCIDO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EJEMPLO DE CONTRACT DESCONOCIDO

```ael
DEFINIR area =
    PROPERTY.AREA_PRIVATE_X
```

Si el Contract no existe:

```text
AEL-CONTRACT-001
```

No se genera Artifact.

---

## 103. EJEMPLO FUNCTION DESCONOCIDA

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EJEMPLO FUNCTION DESCONOCIDA

```ael
RETORNAR FUNCION_INEXISTENTE(100)
```

Resultado:

```text
AEL-FUNCTION-001
```

---

## 104. EJEMPLO RETORNO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

EJEMPLO RETORNO

```ael
SI VERDADERO ENTONCES
    RETORNAR 100 COP
SINO
    RETORNAR 200 COP
FIN
```

Analyzer:

```text
then = MONEY<COP>
else = MONEY<COP>
result = MONEY<COP>
```

Válido.

---

## 105. TEST DE DETERMINISMO DEL COMPILADOR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE DETERMINISMO DEL COMPILADOR

Compilar dos veces:

```text
Source X
Environment Y
Compiler Z
```

debe producir Artifacts semánticamente equivalentes.

---

## 106. TEST DE INVALIDACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE INVALIDACIÓN

Modificar:

```text
PARAMETER.TARIFA_M2@1
```

a:

```text
PARAMETER.TARIFA_M2@2
```

debe producir un nuevo Artifact si la dependencia cambia.

---

## 107. TEST DE CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE CAPABILITY

Si:

```text
PROPERTY.AREA_PRIVATE
```

requiere:

```text
READ_PROPERTY
```

el Artifact debe contener:

```text
READ_PROPERTY
```

No depender de configuración manual.

---

## 108. TEST DE SOURCE MAP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE SOURCE MAP

Una instrucción:

```text
MULTIPLY
```

debe poder mapearse a:

```text
línea X
columna Y
```

del Source cuando el modo de debugging lo requiera.

---

## 109. TEST DE ARTIFACT CORRUPTO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE ARTIFACT CORRUPTO

Modificar una instrucción después de compilar.

Resultado:

```text
hash mismatch
```

y:

```text
AEL-ARTIFACT-INTEGRITY
```

---

## 110. TEST DE UNKNOWN OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE UNKNOWN OPCODE

Modificar:

```text
ADD
```

a:

```text
999
```

Resultado:

```text
Artifact inválido.
```

---

## 111. TEST DE INVALID JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

TEST DE INVALID JUMP

Modificar:

```text
JUMP 5
```

a:

```text
JUMP 999999
```

cuando no existe ese offset.

Resultado:

```text
Artifact inválido.
```

---

## 112. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Pipeline_Analyzer 7.md

CRITERIO DE CIERRE

El Compiler Pipeline V1 se considera completo cuando pueda:

```text
✓ tokenizar
✓ parsear
✓ construir AST
✓ construir Symbol Table
✓ construir Scope Tree
✓ resolver Contracts
✓ resolver Functions
✓ inferir tipos
✓ verificar tipos
✓ verificar dimensiones
✓ analizar NULO
✓ analizar retornos
✓ analizar flujo
✓ detectar dependencias
✓ derivar capabilities
✓ generar Typed AST
✓ generar IR
✓ generar Artifact
✓ generar hashes
✓ ejecutar Verifier
```

---

## 113. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

OBJETIVO

Implementar:

```text
Source
 ↓
Lexer
 ↓
Tokens
 ↓
Parser
 ↓
AST
```

Esta capa debe ser:

```text
determinista
pura
testeable
independiente de infraestructura
```

---

## 114. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

RESPONSABILIDADES

## Lexer

Reconoce:

```text
keywords
identifiers
literals
operators
punctuation
comments
```

## Parser

Reconoce:

```text
statements
expressions
precedence
blocks
function calls
references
```

## AST

Representa:

```text
estructura sintáctica
```

No representa todavía:

```text
tipos resueltos
Contracts reales
Functions reales
Capabilities autorizadas
```

---

## 115. NO RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NO RESPONSABILIDADES

Lexer/Parser NO deben:

```text
consultar PostgreSQL
consultar Supabase
ejecutar Functions
resolver permisos
ejecutar Providers
compilar Artifact
```

---

## 116. ESTRUCTURA

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ESTRUCTURA

```text
packages/ael-compiler/

src/
├── lexer/
│   ├── token-kind.ts
│   ├── token.ts
│   ├── lexer.ts
│   └── lexer-error.ts
│
├── parser/
│   ├── parser.ts
│   ├── parser-error.ts
│   ├── precedence.ts
│   └── grammar.ts
│
└── ast/
    ├── nodes.ts
    ├── expressions.ts
    ├── statements.ts
    └── visitors.ts
```

---

## 117. SOURCE INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

SOURCE INPUT

El Lexer recibe:

```ts
string
```

y opcionalmente:

```text
source metadata
```

---

## 118. TOKEN

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

TOKEN

Cada token debe conservar:

```text
kind
lexeme/value
span
```

---

## 119. TOKEN STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

TOKEN STRUCTURE

Conceptualmente:

```ts
interface Token {
  readonly kind: TokenKind
  readonly lexeme: string
  readonly span: SourceSpan
}
```

Los literales pueden almacenar además un valor ya normalizado cuando sea seguro.

---

## 120. TOKEN KINDS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

TOKEN KINDS

Mínimo:

```text
EOF

IDENTIFIER

NUMBER_LITERAL
STRING_LITERAL
BOOLEAN_LITERAL
NULL_LITERAL

DEFINE
RETURN

IF
THEN
ELSE

LPAREN
RPAREN
LBRACKET
RBRACKET
LBRACE
RBRACE

COMMA
DOT
COLON
SEMICOLON

PLUS
MINUS
STAR
SLASH
PERCENT

EQUAL_EQUAL
NOT_EQUAL
LESS
LESS_EQUAL
GREATER
GREATER_EQUAL

AND
OR
NOT

ASSIGN
```

Los nombres exactos pueden adaptarse al enum definitivo.

---

## 121. KEYWORDS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

KEYWORDS

AEL V1 debe mantener keywords en español.

Ejemplos:

```text
DEFINIR
RETORNAR
SI
ENTONCES
SINO
```

No introducir keywords equivalentes en inglés.

---

## 122. IDENTIFIERS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

IDENTIFIERS

Ejemplo:

```text
area
tarifa
total
```

---

## 123. IDENTIFIER RULE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

IDENTIFIER RULE

Recomendación:

```text
[A-Za-z_][A-Za-z0-9_]*
```

La política exacta para Unicode identifiers debe congelarse antes de habilitarla.

---

## 124. CASE SENSITIVITY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CASE SENSITIVITY

Recomendación V1:

```text
identifiers → case-sensitive
keywords → canonical uppercase
```

Ejemplo:

```text
area
AREA
```

son identifiers diferentes si aparecen como identifiers.

---

## 125. KEYWORD MATCHING

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

KEYWORD MATCHING

El Lexer debe reconocer:

```text
DEFINIR
RETORNAR
```

como keywords.

No convertir arbitrariamente:

```text
definir
```

en keyword si la política de lenguaje es uppercase.

---

## 126. NUMBER LITERALS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NUMBER LITERALS

Soportar como mínimo:

```text
0
1
10
10.5
0.25
```

---

## 127. NUMBER PRECISION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NUMBER PRECISION

El Lexer no debe convertir directamente:

```text
0.1
```

a JavaScript `number`.

Debe conservar la representación textual o un decimal seguro.

---

## 128. NUMBER FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NUMBER FORMAT

V1 debe definir:

```text
digits
optional decimal point
digits
```

Ejemplo válido:

```text
120.50
```

---

## 129. INVALID NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INVALID NUMBER

Ejemplos que deben diagnosticarse:

```text
1.2.3
1abc
```

según el contexto léxico.

---

## 130. STRING LITERALS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STRING LITERALS

Ejemplo:

```text
"Administración"
```

---

## 131. STRING ESCAPES

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STRING ESCAPES

Soportar explícitamente:

```text
\"
\\
\n
\r
\t
```

si forman parte de V1.

---

## 132. UNKNOWN ESCAPES

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

UNKNOWN ESCAPES

No interpretar silenciosamente escapes desconocidos.

Generar error léxico o aplicar una política explícita.

---

## 133. BOOLEAN

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

BOOLEAN

Tokens:

```text
VERDADERO
FALSO
```

si estas son las keywords definitivas de AEL.

---

## 134. NULL

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NULL

Token:

```text
NULO
```

si esta es la keyword definitiva.

---

## 135. COMMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

COMMENTS

Soportar:

```text
// comentario
```

y, si se requiere:

```text
/* comentario */
```

---

## 136. COMMENT SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

COMMENT SEMANTICS

Los comentarios no forman parte del AST semántico.

Pueden conservarse posteriormente para tooling si se decide implementar AST trivia.

---

## 137. WHITESPACE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

WHITESPACE

Ignorar:

```text
space
tab
newline
```

excepto para:

```text
source position
```

---

## 138. SOURCE POSITIONS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

SOURCE POSITIONS

El Lexer debe actualizar:

```text
offset
line
column
```

de forma determinista.

---

## 139. UTF-16

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

UTF-16

Si el runtime es TypeScript/JavaScript, documentar offsets según:

```text
UTF-16 code units
```

para facilitar integración con editores.

---

## 140. LEXER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LEXER ERROR

Ejemplos:

```text
Unexpected character
Unterminated string
Invalid number
Invalid escape
```

---

## 141. LEXER RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LEXER RECOVERY

El Lexer debe intentar continuar cuando sea seguro para producir múltiples diagnostics.

---

## 142. ERROR RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ERROR RECOVERY

No entrar en:

```text
infinite loop
```

después de un carácter inválido.

---

## 143. EOF

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

EOF

Siempre producir:

```text
EOF
```

con posición válida.

---

## 144. TOKEN STREAM

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

TOKEN STREAM

Parser consume:

```text
Token[]
```

o un cursor sobre tokens.

---

## 145. PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER

El Parser debe ser:

```text
deterministic
```

para un mismo:

```text
Token stream
```

---

## 146. PARSER OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER OUTPUT

Resultado:

```ts
Program
```

más diagnostics si corresponde.

---

## 147. PROGRAM

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PROGRAM

Conceptualmente:

```ts
interface Program {
  type: 'Program'
  statements: Statement[]
  span: SourceSpan
}
```

---

## 148. STATEMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STATEMENTS

Mínimo:

```text
DefinitionStatement
ReturnStatement
ExpressionStatement
```

---

## 149. DEFINITION STATEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

DEFINITION STATEMENT

Sintaxis canónica:

```text
DEFINIR area = expression
```

---

## 150. DEFINITION AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

DEFINITION AST

```text
DefinitionStatement
├── name
└── initializer
```

---

## 151. RETURN STATEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

RETURN STATEMENT

Sintaxis:

```text
RETORNAR expression
```

---

## 152. RETURN AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

RETURN AST

```text
ReturnStatement
└── expression
```

---

## 153. EXPRESSION STATEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

EXPRESSION STATEMENT

Opcional en V1.

Si no tiene utilidad de negocio, puede omitirse inicialmente.

---

## 154. EXPRESSIONS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

EXPRESSIONS

Mínimo:

```text
LiteralExpression
IdentifierExpression
ContractReferenceExpression
FunctionCallExpression
UnaryExpression
BinaryExpression
ConditionalExpression
```

---

## 155. LITERAL EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LITERAL EXPRESSION

Ejemplos:

```text
120.5
"texto"
VERDADERO
NULO
```

---

## 156. IDENTIFIER EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

IDENTIFIER EXPRESSION

Ejemplo:

```text
area
```

---

## 157. CONTRACT REFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONTRACT REFERENCE

Sintaxis conceptual:

```text
PROPERTY.AREA_PRIVATE
```

---

## 158. CONTRACT REFERENCE AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONTRACT REFERENCE AST

```text
ContractReferenceExpression
├── namespace
└── member
```

Puede ampliarse a:

```text
namespace
path[]
```

para soportar estructuras futuras.

---

## 159. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

EXAMPLE

```text
PROPERTY.AREA_PRIVATE
```

AST:

```text
ContractReference
namespace = PROPERTY
path = [AREA_PRIVATE]
```

---

## 160. FUNCTION CALL

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUNCTION CALL

Ejemplo:

```text
REDONDEAR_DINERO(total, 2)
```

---

## 161. FUNCTION CALL AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUNCTION CALL AST

```text
FunctionCallExpression
├── name
└── arguments[]
```

---

## 162. FUNCTION NAMES

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUNCTION NAMES

Funciones AEL V1 deben utilizar nombres en español.

Ejemplos:

```text
REDONDEAR_DINERO
ABSOLUTO
MAXIMO
MINIMO
```

según catálogo definitivo.

---

## 163. PARSER NO RESUELVE FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER NO RESUELVE FUNCTION

El Parser sólo reconoce:

```text
REDONDEAR_DINERO(...)
```

No verifica todavía que la Function exista.

---

## 164. UNARY EXPRESSIONS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

UNARY EXPRESSIONS

Mínimo:

```text
-N
+N
NOT condition
```

---

## 165. UNARY AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

UNARY AST

```text
UnaryExpression
├── operator
└── operand
```

---

## 166. BINARY EXPRESSIONS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

BINARY EXPRESSIONS

Mínimo:

```text
+
-
*
/
%
==
!=
<
<=
>
>=
AND
OR
```

---

## 167. BINARY AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

BINARY AST

```text
BinaryExpression
├── left
├── operator
└── right
```

---

## 168. CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONDITIONAL

Sintaxis inicial recomendada:

```text
SI condition ENTONCES
    expression
SINO
    expression
```

Si la gramática definitiva adopta otra forma, deberá congelarse antes del parser final.

---

## 169. CONDITIONAL AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONDITIONAL AST

```text
ConditionalExpression
├── condition
├── whenTrue
└── whenFalse
```

---

## 170. PARENTHESIS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARENTHESIS

Ejemplo:

```text
(area * tarifa)
```

Los paréntesis controlan precedencia.

No necesariamente deben conservarse como nodos AST.

---

## 171. PRECEDENCE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PRECEDENCE

Orden recomendado:

```text
OR
AND
equality
comparison
addition
multiplication
unary
primary
```

---

## 172. PRECEDENCE TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PRECEDENCE TABLE

```text
OR              lowest
AND
== !=
< <= > >=
+ -
* / %
UNARY
PRIMARY         highest
```

---

## 173. ASSOCIATIVITY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ASSOCIATIVITY

Recomendación:

```text
binary arithmetic → left associative
```

Ejemplo:

```text
a - b - c
```

se interpreta como:

```text
(a - b) - c
```

---

## 174. UNARY PRECEDENCE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

UNARY PRECEDENCE

Unary debe tener mayor precedencia que:

```text
* / +
```

Ejemplo:

```text
-a * b
```

equivale a:

```text
(-a) * b
```

---

## 175. FUNCTION CALL PRECEDENCE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUNCTION CALL PRECEDENCE

Function call debe tener alta precedencia:

```text
FUNC(a) + b
```

---

## 176. MEMBER ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

MEMBER ACCESS

Si se soporta:

```text
object.member
```

debe tener precedencia primaria.

---

## 177. ARRAY/LIST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ARRAY/LIST

Si V1 soporta listas:

```text
[1, 2, 3]
```

debe agregarse:

```text
ListLiteralExpression
```

Si no es necesario para V1, dejar fuera.

---

## 178. RECORDS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

RECORDS

Si V1 soporta records:

```text
{ ... }
```

deben definirse explícitamente.

No agregarlos sólo por comodidad.

---

## 179. PARSER STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER STRATEGY

Recomendación:

```text
recursive descent
```

para statements y:

```text
Pratt parser
```

o precedence climbing para expressions.

---

## 180. WHY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

WHY

Esta estrategia permite manejar:

```text
precedence
associativity
unary
function calls
future operators
```

con claridad.

---

## 181. PARSER STATE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER STATE

Debe mantener:

```text
tokens
current index
diagnostics
```

---

## 182. LOOKAHEAD

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LOOKAHEAD

Soportar al menos:

```text
peek
advance
match
expect
```

---

## 183. EXPECT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

EXPECT

Si falta un token esperado:

```text
diagnostic
```

con posición precisa.

---

## 184. PARSER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER ERROR

Ejemplo:

```text
Expected expression after '='.
```

con código:

```text
AEL-SYNTAX-001
```

---

## 185. ERROR RECOVERY STRATEGY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ERROR RECOVERY STRATEGY

Para statements:

```text
synchronize at:
SEMICOLON
RETURN
DEFINIR
EOF
```

según gramática.

---

## 186. RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

RECOVERY

No producir AST inválido silenciosamente.

Puede producir:

```text
ErrorExpression
```

interno si ayuda a continuar.

---

## 187. ERROR NODE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ERROR NODE

Si se utiliza:

```text
ErrorExpression
```

no debe llegar a:

```text
Artifact
```

---

## 188. AST IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST IMMUTABILITY

AST debe ser:

```text
readonly
immutable
```

---

## 189. AST SPANS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST SPANS

Todos los nodos deben conservar:

```text
SourceSpan
```

---

## 190. AST NODE BASE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST NODE BASE

Conceptualmente:

```ts
interface ASTNode {
  readonly type: ASTNodeKind
  readonly span: SourceSpan
}
```

---

## 191. AST NODE KINDS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST NODE KINDS

```text
Program

DefinitionStatement
ReturnStatement

LiteralExpression
IdentifierExpression
ContractReferenceExpression
FunctionCallExpression
UnaryExpression
BinaryExpression
ConditionalExpression
```

---

## 192. LITERAL AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LITERAL AST

Debe conservar:

```text
literal kind
raw text
```

cuando sea necesario para diagnósticos.

---

## 193. NUMBER AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NUMBER AST

Ejemplo:

```text
LiteralExpression
kind = NUMBER
raw = "120.50"
```

El Analyzer/Compiler construirá el valor semántico exacto.

---

## 194. STRING AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STRING AST

Debe conservar:

```text
decoded value
```

y opcionalmente:

```text
raw
```

---

## 195. IDENTIFIER AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

IDENTIFIER AST

Debe conservar:

```text
name
```

---

## 196. CONTRACT AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONTRACT AST

Debe conservar:

```text
namespace
path
```

---

## 197. FUNCTION AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUNCTION AST

Debe conservar:

```text
name
arguments
```

---

## 198. OPERATOR AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

OPERATOR AST

Operator debe ser enum/string controlado:

```text
PLUS
MINUS
MULTIPLY
```

No usar operadores arbitrarios como strings sin validación.

---

## 199. AST VISITOR

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST VISITOR

Definir:

```ts
ASTVisitor
```

para:

```text
Analyzer
Compiler
Formatter
Diagnostics
```

---

## 200. VISITOR

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

VISITOR

Conceptualmente:

```text
visitProgram
visitDefinition
visitReturn
visitLiteral
visitIdentifier
visitContract
visitFunctionCall
visitUnary
visitBinary
visitConditional
```

---

## 201. AST TRAVERSAL

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST TRAVERSAL

No duplicar traversal manualmente en cada módulo si puede centralizarse.

---

## 202. FORMATTER

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FORMATTER

Puede existir posteriormente:

```text
AEL Formatter
```

usando AST.

No es requisito del Parser MVP.

---

## 203. SOURCE PRESERVATION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

SOURCE PRESERVATION

Para editor avanzado puede ser útil conservar:

```text
raw source
AST spans
```

---

## 204. PARSER OUTPUT CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER OUTPUT CONTRACT

```ts
interface ParseResult {
  readonly program: Program | null
  readonly diagnostics: Diagnostic[]
}
```

---

## 205. LEX RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LEX RESULT

```ts
interface LexResult {
  readonly tokens: Token[]
  readonly diagnostics: Diagnostic[]
}
```

---

## 206. COMPILER FRONT-END

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

COMPILER FRONT-END

Pipeline:

```text
source
 ↓
lexer
 ↓
tokens
 ↓
parser
 ↓
AST
 ↓
analyzer
```

---

## 207. NO ANALYZER IN PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NO ANALYZER IN PARSER

No resolver:

```text
PROPERTY
PARAMETER
REDONDEAR_DINERO
```

en Parser.

---

## 208. AST EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST EXAMPLE

Source:

```text
DEFINIR total =
    PROPERTY.AREA_PRIVATE *
    PARAMETER.TARIFA_M2

RETORNAR total
```

---

## 209. AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST

```text
Program
├── DefinitionStatement
│   ├── name = total
│   └── BinaryExpression
│       ├── ContractReference(PROPERTY.AREA_PRIVATE)
│       ├── *
│       └── ContractReference(PARAMETER.TARIFA_M2)
│
└── ReturnStatement
    └── IdentifierExpression(total)
```

---

## 210. SECOND EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

SECOND EXAMPLE

```text
DEFINIR total =
    REDONDEAR_DINERO(
        PROPERTY.AREA_PRIVATE *
        PARAMETER.TARIFA_M2,
        0
    )

RETORNAR total
```

---

## 211. THIRD EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

THIRD EXAMPLE

```text
DEFINIR base =
    PROPERTY.AREA_PRIVATE

SI base > 100 ENTONCES
    RETORNAR base
SINO
    RETORNAR 0
```

Si esta sintaxis de bloque se mantiene, debe incorporarse formalmente al grammar.

---

## 212. GRAMMAR

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

GRAMMAR

Gramática conceptual:

```ebnf
program         ::= statement* EOF ;

statement       ::= definition
                  | returnStatement
                  | expressionStatement ;

definition      ::= DEFINIR identifier ASSIGN expression ;

returnStatement ::= RETORNAR expression ;

expression      ::= conditional ;

conditional     ::= logicalOr
                  | SI expression ENTONCES expression SINO expression ;

logicalOr       ::= logicalAnd (OR logicalAnd)* ;

logicalAnd      ::= equality (AND equality)* ;

equality        ::= comparison ((EQUAL_EQUAL | NOT_EQUAL) comparison)* ;

comparison      ::= addition ((LESS | LESS_EQUAL | GREATER | GREATER_EQUAL) addition)* ;

addition        ::= multiplication ((PLUS | MINUS) multiplication)* ;

multiplication  ::= unary ((STAR | SLASH | PERCENT) unary)* ;

unary           ::= (PLUS | MINUS | NOT) unary
                  | primary ;

primary         ::= literal
                  | identifier
                  | contractReference
                  | functionCall
                  | LPAREN expression RPAREN ;
```

La gramática definitiva debe ajustarse al conjunto exacto de constructs aprobado para V1.

---

## 213. STATEMENT TERMINATION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STATEMENT TERMINATION

Decidir explícitamente si AEL requiere:

```text
semicolon
```

o permite:

```text
newline termination
```

Recomendación:

```text
semicolon optional
```

sólo si la gramática puede resolver ambigüedades de forma determinista.

---

## 214. NEWLINE SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NEWLINE SEMANTICS

No utilizar newline como operador oculto.

---

## 215. BLOCKS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

BLOCKS

Si AEL requiere bloques:

```text
SI ... ENTONCES
    ...
SINO
    ...
```

deben tener nodos:

```text
BlockStatement
```

---

## 216. BLOCK STATEMENT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

BLOCK STATEMENT

Conceptualmente:

```ts
interface BlockStatement {
  type: 'BlockStatement'
  statements: Statement[]
  span: SourceSpan
}
```

---

## 217. CONDITIONAL BLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONDITIONAL BLOCK

Entonces:

```text
ConditionalStatement
```

o:

```text
ConditionalExpression
```

debe decidirse según semántica definitiva.

No mantener dos modelos accidentalmente.

---

## 218. AEL V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AEL V1 RECOMMENDATION

Para mantener el lenguaje compacto:

```text
SI ... ENTONCES ... SINO ...
```

puede comenzar como expression.

Los bloques completos pueden incorporarse posteriormente.

---

## 219. COMMENTS AND AST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

COMMENTS AND AST

Comentarios no deben alterar precedencia ni estructura.

---

## 220. LEXER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LEXER TESTS

Probar:

```text
keywords
identifiers
numbers
strings
operators
comments
positions
errors
```

---

## 221. PARSER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER TESTS

Probar:

```text
simple definitions
returns
precedence
parentheses
function calls
contract references
conditionals
errors
```

---

## 222. GOLDEN AST TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

GOLDEN AST TESTS

Cada Source canónico debe tener:

```text
expected AST
```

---

## 223. PRECEDENCE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PRECEDENCE TEST

Source:

```text
1 + 2 * 3
```

AST:

```text
1 + (2 * 3)
```

---

## 224. PARENTHESIS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARENTHESIS TEST

```text
(1 + 2) * 3
```

debe producir:

```text
(1 + 2) * 3
```

---

## 225. ASSOCIATIVITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ASSOCIATIVITY TEST

```text
10 - 5 - 2
```

debe producir:

```text
(10 - 5) - 2
```

---

## 226. UNARY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

UNARY TEST

```text
-10 * 2
```

debe producir:

```text
(-10) * 2
```

---

## 227. FUNCTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUNCTION TEST

```text
ABSOLUTO(-10)
```

AST:

```text
FunctionCall
name = ABSOLUTO
argument = Unary(-,10)
```

---

## 228. CONTRACT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CONTRACT TEST

```text
PROPERTY.AREA_PRIVATE
```

debe producir exactamente un ContractReference.

---

## 229. INVALID CONTRACT SYNTAX

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INVALID CONTRACT SYNTAX

```text
PROPERTY.
```

debe producir diagnostic.

---

## 230. INVALID FUNCTION SYNTAX

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INVALID FUNCTION SYNTAX

```text
FUNC(
```

debe producir diagnostic sin colgar el Parser.

---

## 231. INVALID EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INVALID EXPRESSION

```text
DEFINIR x =
```

debe producir:

```text
AEL-SYNTAX-001
```

---

## 232. STRING TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STRING TEST

```text
"hola\nmundo"
```

debe producir un string correctamente decodificado.

---

## 233. NUMBER TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NUMBER TEST

```text
120.50
```

debe conservar:

```text
"120.50"
```

hasta la conversión decimal.

---

## 234. KEYWORD TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

KEYWORD TEST

```text
DEFINIR
```

no debe ser:

```text
IDENTIFIER
```

---

## 235. IDENTIFIER TEST

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

IDENTIFIER TEST

```text
DEFINIR_TOTAL
```

puede ser identifier si no está reservado.

---

## 236. RESERVED WORDS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

RESERVED WORDS

Mantener una tabla única:

```text
KeywordRegistry
```

---

## 237. FUTURE EXTENSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUTURE EXTENSIBILITY

El Lexer debe permitir agregar keywords sin reescribir toda la lógica.

---

## 238. TOKEN FACTORY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

TOKEN FACTORY

Centralizar creación de Tokens para garantizar:

```text
span consistency
```

---

## 239. PARSER HELPERS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER HELPERS

Implementar:

```text
peek()
previous()
advance()
check()
match()
expect()
isAtEnd()
```

---

## 240. DIAGNOSTIC HELPERS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

DIAGNOSTIC HELPERS

Implementar:

```text
errorAtCurrent()
errorAtPrevious()
errorAtSpan()
```

---

## 241. NO THROW FOR NORMAL SYNTAX ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NO THROW FOR NORMAL SYNTAX ERRORS

Errores esperados de usuario deben convertirse en:

```text
diagnostics
```

no en exceptions no controladas.

---

## 242. INTERNAL EXCEPTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INTERNAL EXCEPTIONS

Sólo para:

```text
programmer invariant violation
```

si se considera necesario.

---

## 243. DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

DETERMINISM

Mismo source:

```text
same tokens
same AST
same diagnostics
```

---

## 244. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PERFORMANCE

Lexer y Parser deben ser aproximadamente:

```text
O(n)
```

respecto al tamaño del source para constructs normales.

---

## 245. STACK DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

STACK DEPTH

Parser debe considerar nesting profundo.

Puede establecerse:

```text
maximum parser depth
```

para evitar stack exhaustion.

---

## 246. INPUT LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INPUT LIMIT

API debe imponer límites de Source size.

El Parser por sí solo no debe depender de red.

---

## 247. SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

SECURITY

Parser debe resistir:

```text
huge input
deep nesting
malformed strings
pathological expressions
```

---

## 248. FUZZ TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FUZZ TESTING

El Parser debe recibir posteriormente:

```text
random strings
malformed token streams
```

y nunca:

```text
crash
hang
infinite loop
```

---

## 249. AST SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST SERIALIZATION

Puede serializarse para:

```text
debugging
golden tests
diagnostics
```

pero el Artifact final no debe depender de AST serializado salvo diseño explícito.

---

## 250. AST VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST VERSIONING

AST interno no necesita ser un formato público estable.

Artifact sí.

---

## 251. PARSER API

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PARSER API

API pública:

```ts
lex(source): LexResult
parse(source): ParseResult
parseTokens(tokens): ParseResult
```

---

## 252. COMPILER API

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

COMPILER API

El Compiler puede hacer:

```text
lex
→ parse
→ analyze
→ compile
```

sin exponer detalles internos al consumidor común.

---

## 253. TEST FIXTURES

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

TEST FIXTURES

Crear:

```text
fixtures/
├── valid/
├── invalid/
├── precedence/
├── functions/
├── contracts/
└── conditionals/
```

---

## 254. VALID FIXTURE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

VALID FIXTURE

Ejemplo:

```text
DEFINIR total =
    PROPERTY.AREA_PRIVATE *
    PARAMETER.TARIFA_M2

RETORNAR total
```

---

## 255. INVALID FIXTURE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INVALID FIXTURE

Ejemplo:

```text
DEFINIR total =
    PROPERTY.
```

---

## 256. AST SNAPSHOT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

AST SNAPSHOT POLICY

Snapshots sirven para:

```text
shape verification
```

pero no deben reemplazar tests semánticos.

---

## 257. FORMATTER FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

FORMATTER FUTURE

Un Formatter basado en AST permitirá:

```text
canonical formatting
```

sin modificar semántica.

---

## 258. LANGUAGE SERVER FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

LANGUAGE SERVER FUTURE

El Parser debe permitir reutilización por:

```text
LSP
editor
autocomplete
diagnostics
```

---

## 259. INCREMENTAL PARSING

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

INCREMENTAL PARSING

No es requisito V1.

La arquitectura debe evitar impedirlo posteriormente.

---

## 260. ERROR TOLERANCE FOR EDITOR

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

ERROR TOLERANCE FOR EDITOR

El parser debe intentar producir un AST parcial razonable cuando el Source está incompleto.

Esto es especialmente útil para:

```text
autocomplete
editor diagnostics
```

---

## 261. PRODUCTION PARSING

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

PRODUCTION PARSING

Para compilation/publication:

```text
AST completo
sin ErrorExpression
```

es requisito.

---

## 262. DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

DOCUMENTATION

Documentar:

```text
grammar
tokens
precedence
AST
error codes
recovery strategy
```

---

## 263. EXIT CRITERIA — AEL-COMPILER-FRONTEND

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

EXIT CRITERIA — AEL-COMPILER-FRONTEND

```text
✓ Lexer implemented
✓ Token model implemented
✓ Keywords implemented
✓ Literals implemented
✓ Operators implemented
✓ Source positions implemented
✓ Lexer diagnostics implemented
✓ Parser implemented
✓ Precedence implemented
✓ AST implemented
✓ AST spans implemented
✓ Error recovery implemented
✓ Canonical grammar implemented
✓ Golden AST tests pass
✓ Fuzz baseline passes
✓ Parser deterministic
✓ No infrastructure dependencies
```

---

## 264. NEXT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

NEXT DEPENDENCY

Después de este documento:

```text
Lexer
+
Parser
+
AST
```

alimentan:

```text
AEL Analyzer
```

---

## 265. SIGUIENTE ETAPA

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

SIGUIENTE ETAPA

El siguiente documento debe definir:

```text
Name Resolution
Type Checking
Dimension Checking
Contract Resolution
Function Resolution
Capability Analysis
```

es decir:

```text
AST
 ↓
Semantic Analyzer
 ↓
Typed AST / Semantic IR
```

---

## 266. CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Lexer_Parser_AST 25.md

CIERRE

Con este documento queda definido el front-end sintáctico de AEL:

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
```

La siguiente capa será la que determine si aquello que el usuario escribió **tiene sentido en AEL**.

> **El Lexer reconoce palabras. El Parser reconoce estructuras. El Analyzer reconocerá significado.**

---

# FIN DEL DOCUMENTO 25

## AEL V1 — Lexer, Parser y AST

## 267. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

OBJETIVO

Implementar:

```text
AST
 ↓
Name Resolution
 ↓
Type Checking
 ↓
Dimension Checking
 ↓
Contract Resolution
 ↓
Function Resolution
 ↓
Capability Analysis
 ↓
Semantic IR
```

---

## 268. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

RESPONSABILIDADES

El Analyzer debe determinar:

```text
qué nombres existen
qué tipo tiene cada expresión
qué dimensiones son compatibles
qué Contract representa una referencia
qué Function representa una llamada
qué capabilities requiere la Rule
qué resultado produce la expresión
```

---

## 269. NO RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NO RESPONSABILIDADES

El Analyzer no debe:

```text
ejecutar Providers
consultar datos de negocio reales
modificar PostgreSQL
publicar Rules
ejecutar Runtime
autorizar acciones de usuario
```

---

## 270. INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

INPUT

```text
Program AST
+
AnalyzerContext
```

---

## 271. OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

OUTPUT

```ts
AnalyzeResult
```

Conceptualmente:

```text
semanticModel
diagnostics
dependencies
requiredCapabilities
outputType
```

---

## 272. ANALYZER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ANALYZER CONTEXT

Debe contener abstracciones:

```text
ContractRegistry
FunctionRegistry
SymbolTable
TypeEnvironment
CapabilityResolver
```

---

## 273. CONTEXT INDEPENDENCE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTEXT INDEPENDENCE

El Analyzer no debe recibir directamente:

```text
PostgresClient
SupabaseClient
HTTP request
Vue state
```

Debe recibir interfaces.

---

## 274. SYMBOL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SYMBOL TABLE

La tabla de símbolos representa:

```text
variables locales
```

---

## 275. SYMBOL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SYMBOL

Conceptualmente:

```ts
interface SymbolInfo {
  name: string
  type: AELType
  declarationSpan: SourceSpan
}
```

---

## 276. SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SCOPE

V1 puede comenzar con:

```text
program scope
```

y scopes adicionales para:

```text
conditional blocks
```

cuando la gramática los soporte.

---

## 277. SYMBOL DECLARATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SYMBOL DECLARATION

Para:

```text
DEFINIR area = expression
```

el Analyzer debe:

```text
analyze expression
infer type
register area
```

---

## 278. USE BEFORE DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

USE BEFORE DEFINITION

Debe generar error:

```text
DEFINIR total = area * tarifa

DEFINIR area = ...
```

---

## 279. DIAGNOSTIC

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIAGNOSTIC

Código sugerido:

```text
AEL-NAME-001
```

---

## 280. DUPLICATE DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DUPLICATE DEFINITION

Ejemplo:

```text
DEFINIR area = ...
DEFINIR area = ...
```

Debe rechazarse en V1 salvo que exista una semántica explícita de shadowing.

---

## 281. SHADOWING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SHADOWING

Recomendación V1:

```text
no shadowing
```

para mantener reglas deterministas y fáciles de auditar.

---

## 282. IDENTIFIER RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

IDENTIFIER RESOLUTION

Para:

```text
RETORNAR area
```

buscar:

```text
area
```

en el scope válido.

---

## 283. UNRESOLVED IDENTIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNRESOLVED IDENTIFIER

Código:

```text
AEL-NAME-002
```

---

## 284. TYPE INFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPE INFERENCE

El Analyzer debe inferir:

```text
DEFINIR area = PROPERTY.AREA_PRIVATE
```

como:

```text
Quantity<M2>
```

si Contract metadata lo declara así.

---

## 285. EXPLICIT TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

EXPLICIT TYPES

Si la sintaxis V1 no soporta anotaciones explícitas, no agregarlas sólo para el Analyzer.

El tipo se obtiene de:

```text
literals
symbols
Contracts
Functions
operators
```

---

## 286. LITERAL TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

LITERAL TYPES

```text
120       → Number
"texto"   → String
VERDADERO → Boolean
NULO      → Null
```

---

## 287. CONTRACT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT TYPE

El Analyzer consulta:

```text
ContractRegistry
```

para:

```text
PROPERTY.AREA_PRIVATE
```

---

## 288. CONTRACT DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT DEFINITION

Debe contener al menos:

```text
namespace
code
version
type
description
requiredCapability
```

---

## 289. CONTRACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT VERSION

Una Rule debe resolver una versión concreta o una política de versionamiento explícita.

No dejar:

```text
latest
```

implícito en Artifact.

---

## 290. UNKNOWN CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNKNOWN CONTRACT

Ejemplo:

```text
PROPERTY.AREA_NOT_EXIST
```

produce:

```text
AEL-CONTRACT-001
```

---

## 291. CONTRACT DEPRECATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT DEPRECATION

Si Contract existe pero está deprecated:

```text
warning
```

o:

```text
blocking diagnostic
```

según policy.

---

## 292. CONTRACT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT TYPE

Ejemplo:

```text
PROPERTY.AREA_PRIVATE
→ Quantity<M2>
```

---

## 293. FUNCTION RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION RESOLUTION

Para:

```text
REDONDEAR_DINERO(total, 0)
```

resolver:

```text
FunctionRegistry
```

---

## 294. FUNCTION DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION DEFINITION

Debe incluir:

```text
name
version
parameters
returnType
capabilities
implementation reference
```

---

## 295. FUNCTION SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION SIGNATURE

Ejemplo:

```text
REDONDEAR_DINERO(
    Money<C>,
    Number
) → Money<C>
```

si la Function es genérica por currency.

---

## 296. ARGUMENT COUNT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ARGUMENT COUNT

Si requiere:

```text
2
```

y recibe:

```text
1
```

diagnostic:

```text
AEL-FUNCTION-001
```

---

## 297. ARGUMENT TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ARGUMENT TYPES

Validar:

```text
actual argument type
vs
expected parameter type
```

---

## 298. FUNCTION RETURN TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION RETURN TYPE

El Analyzer asigna al Call Expression:

```text
returnType
```

---

## 299. FUNCTION OVERLOADS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION OVERLOADS

Si V1 no requiere overloads:

```text
no implementarlos
```

Si se implementan, la resolución debe ser determinista.

---

## 300. AMBIGUOUS OVERLOAD

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

AMBIGUOUS OVERLOAD

Debe producir error:

```text
AEL-FUNCTION-002
```

Nunca elegir arbitrariamente.

---

## 301. CAPABILITY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CAPABILITY ANALYSIS

Cada Contract/Function puede requerir:

```text
capability
```

El Analyzer acumula:

```text
requiredCapabilities
```

---

## 302. CAPABILITY SET

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CAPABILITY SET

Ejemplo:

```text
READ_PROPERTY
READ_PARAMETER
```

---

## 303. CAPABILITY DEDUPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CAPABILITY DEDUPLICATION

Si una Rule utiliza varias veces:

```text
PROPERTY.AREA_PRIVATE
```

la capability aparece una sola vez.

---

## 304. CAPABILITY ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CAPABILITY ORDER

Para Artifact determinista:

```text
sort canonical
```

las capabilities.

---

## 305. CAPABILITY RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CAPABILITY RESOLUTION

Analyzer determina:

```text
required capability
```

pero no decide:

```text
si el usuario tiene permiso
```

---

## 306. AUTHORIZATION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

AUTHORIZATION BOUNDARY

La autorización ocurre posteriormente en:

```text
Application/Security layer
```

---

## 307. TYPE CHECKING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPE CHECKING

Cada expression recibe:

```text
inferred type
```

---

## 308. TYPED AST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPED AST

Opcionalmente:

```text
AST
+
semantic annotations
```

puede producir:

```text
Typed AST
```

---

## 309. SEMANTIC IR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SEMANTIC IR

Recomendación:

```text
Typed AST
 ↓
Semantic IR
```

para separar syntax de ejecución.

---

## 310. TYPE ENVIRONMENT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPE ENVIRONMENT

Debe permitir:

```text
lookup symbol
register symbol
```

---

## 311. OPERATOR RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

OPERATOR RESOLUTION

Para:

```text
left operator right
```

consultar:

```text
OperatorSignatureRegistry
```

---

## 312. ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ADDITION

Casos:

```text
Number + Number
Money<C> + Money<C>
Quantity<D,U> + Quantity<D,U>
```

según conversion policy.

---

## 313. INVALID ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

INVALID ADDITION

Ejemplo:

```text
Money<COP> + Money<USD>
```

diagnostic:

```text
AEL-CURRENCY-001
```

---

## 314. INVALID QUANTITY ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

INVALID QUANTITY ADDITION

```text
M2 + KG
```

diagnostic:

```text
AEL-DIMENSION-001
```

---

## 315. MULTIPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

MULTIPLICATION

Ejemplo:

```text
Quantity<M2> * MoneyPerM2
```

debe producir:

```text
Money
```

si los tipos están definidos.

---

## 316. DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIVISION

Ejemplo:

```text
Money / Quantity<M2>
```

puede producir:

```text
MoneyPerArea
```

o una Quantity dimensional equivalente.

---

## 317. NUMBER MULTIPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NUMBER MULTIPLICATION

```text
Number * Number → Number
```

---

## 318. NUMBER DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NUMBER DIVISION

```text
Number / Number → Number
```

pero el Analyzer no puede asumir que el divisor es distinto de cero si no es constante.

Runtime debe validar.

---

## 319. COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

COMPARISON

Comparar:

```text
Number with Number
Money with compatible Money
Quantity with compatible Quantity
```

Resultado:

```text
Boolean
```

---

## 320. BOOLEAN OPERATORS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

BOOLEAN OPERATORS

```text
Boolean AND Boolean → Boolean
Boolean OR Boolean → Boolean
NOT Boolean → Boolean
```

---

## 321. NO TRUTHINESS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NO TRUTHINESS

No aceptar:

```text
IF Number
```

si la gramática usa boolean conditions.

---

## 322. CONDITIONAL TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONDITIONAL TYPE

Para:

```text
SI condition ENTONCES A SINO B
```

validar:

```text
condition → Boolean
```

---

## 323. CONDITIONAL RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONDITIONAL RESULT

Los branches deben producir tipos compatibles.

Ejemplo válido:

```text
Money<COP>
Money<COP>
```

Resultado:

```text
Money<COP>
```

---

## 324. INVALID CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

INVALID CONDITIONAL

```text
Money<COP>
String
```

debe producir:

```text
AEL-TYPE-002
```

---

## 325. NULL COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NULL COMPATIBILITY

Debe aplicarse la política definida en Core.

Ejemplo:

```text
Nullable<Money<COP>>
```

---

## 326. NULL LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NULL LITERAL

Analyzer reconoce:

```text
NULO
```

como:

```text
Null
```

---

## 327. NULL ASSIGNMENT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NULL ASSIGNMENT

Si se soportan nullable types:

```text
Nullable<T>
```

permite:

```text
NULO
```

---

## 328. NON-NULLABLE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NON-NULLABLE

Si un contexto exige:

```text
Money<COP>
```

no aceptar automáticamente:

```text
NULO
```

sin política explícita.

---

## 329. TYPE NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPE NARROWING

Si V1 soporta:

```text
SI value != NULO
```

puede introducir narrowing.

No implementarlo parcialmente.

---

## 330. TYPE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPE ERROR

Cada incompatibilidad debe indicar:

```text
expected
actual
span
```

---

## 331. DIAGNOSTIC EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIAGNOSTIC EXAMPLE

```text
Expected Money<COP> but received Quantity<M2>.
```

Código:

```text
AEL-TYPE-001
```

---

## 332. DIMENSION ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIMENSION ANALYSIS

El Analyzer utiliza:

```text
DimensionAlgebra
```

del Core.

---

## 333. DIMENSION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIMENSION RESULT

Para:

```text
M2 * COP/M2
```

resultado:

```text
COP
```

---

## 334. DIMENSION MISMATCH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIMENSION MISMATCH

Para:

```text
M2 + KG
```

error semántico.

---

## 335. UNIT CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNIT CONVERSION

Si dos cantidades tienen misma dimensión pero distintas unidades:

```text
canConvert?
```

debe resolverse mediante:

```text
UnitRegistry
```

---

## 336. CONVERSION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONVERSION POLICY

No convertir automáticamente salvo que:

```text
AEL language policy
```

lo permita.

---

## 337. CURRENCY POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CURRENCY POLICY

No convertir automáticamente:

```text
USD → COP
```

sin operación explícita.

---

## 338. TYPE OF CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TYPE OF CONTRACT

Contracts pueden devolver:

```text
primitive
money
quantity
record
nullable
```

según catálogo.

---

## 339. RECORD CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

RECORD CONTRACTS

Si un Contract devuelve un Record:

```text
PROPERTY.OWNER
```

el Analyzer puede resolver:

```text
field access
```

si esa feature está en V1.

---

## 340. FEATURE CONTROL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FEATURE CONTROL

Si record/member access no está definido en V1:

```text
no implementarlo
```

---

## 341. FUNCTION CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION CAPABILITIES

Una Function puede requerir:

```text
READ_PARAMETER
READ_DATE
EXTERNAL_SERVICE
```

Analyzer debe incluirlas.

---

## 342. CONTRACT CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT CAPABILITIES

Contract también puede requerir capability.

---

## 343. TRANSITIVE CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TRANSITIVE CAPABILITIES

Si Function A internamente depende de B, el Analyzer debe recibir del Registry la capability efectiva.

No ejecutar la implementación para descubrirla.

---

## 344. DEPENDENCY COLLECTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DEPENDENCY COLLECTION

Semantic model debe registrar:

```text
contracts[]
functions[]
capabilities[]
```

---

## 345. DEPENDENCY VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DEPENDENCY VERSION

Cada dependency debe conservar:

```text
code
version
```

---

## 346. DETERMINISTIC DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DETERMINISTIC DEPENDENCIES

Ordenar dependencies canónicamente:

```text
type
code
version
```

---

## 347. SEMANTIC MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SEMANTIC MODEL

Conceptualmente:

```ts
interface SemanticModel {
  readonly symbols: SymbolInfo[]
  readonly dependencies: Dependency[]
  readonly requiredCapabilities: Capability[]
  readonly outputType: AELType
}
```

---

## 348. NODE ANNOTATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NODE ANNOTATIONS

Puede existir:

```ts
Map<ASTNode, SemanticInfo>
```

con:

```text
type
resolved symbol
resolved Contract
resolved Function
```

---

## 349. AST IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

AST IMMUTABILITY

No modificar el AST original.

---

## 350. SEMANTIC IR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SEMANTIC IR

IR puede contener:

```text
LoadLocal
LoadContract
CallFunction
BinaryOp
UnaryOp
Return
```

---

## 351. EXAMPLE IR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

EXAMPLE IR

Source:

```text
PROPERTY.AREA_PRIVATE * PARAMETER.TARIFA_M2
```

IR conceptual:

```text
LOAD_CONTRACT PROPERTY.AREA_PRIVATE
LOAD_CONTRACT PARAMETER.TARIFA_M2
MULTIPLY
RETURN
```

---

## 352. IR TYPE ANNOTATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

IR TYPE ANNOTATION

Cada instruction puede tener:

```text
input type
output type
```

cuando sea útil.

---

## 353. IR VALIDITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

IR VALIDITY

Compiler debe poder asumir:

```text
semantic validation passed
```

---

## 354. ANALYZER PASSES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ANALYZER PASSES

Recomendación:

```text
Pass 1 — declarations
Pass 2 — name resolution
Pass 3 — type inference
Pass 4 — dimension/currency checking
Pass 5 — Contract/Function resolution
Pass 6 — capabilities
Pass 7 — semantic IR
```

---

## 355. DECLARATION PASS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DECLARATION PASS

Registrar:

```text
DEFINIR names
```

antes de resolver referencias si se desea forward-reference policy.

Pero V1 recomienda:

```text
use before definition = error
```

por lo que puede hacerse resolución secuencial.

---

## 356. SEQUENTIAL SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SEQUENTIAL SEMANTICS

Recomendación V1:

```text
definitions become available after declaration
```

---

## 357. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

EXAMPLE

```text
DEFINIR a = 10
DEFINIR b = a * 2
```

válido.

---

## 358. INVALID FORWARD REFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

INVALID FORWARD REFERENCE

```text
DEFINIR b = a * 2
DEFINIR a = 10
```

inválido.

---

## 359. RETURN ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

RETURN ANALYSIS

Debe existir:

```text
ReturnStatement
```

válido al final o según grammar.

---

## 360. MULTIPLE RETURNS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

MULTIPLE RETURNS

Si V1 permite múltiples returns:

```text
all reachable returns
```

deben tener tipos compatibles.

---

## 361. MISSING RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

MISSING RETURN

Si una Rule exige result:

```text
AEL-RETURN-001
```

---

## 362. RETURN TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

RETURN TYPE

SemanticModel debe registrar:

```text
outputType
```

---

## 363. CANONICAL RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CANONICAL RETURN

```text
RETORNAR total
```

si:

```text
total : Money<COP>
```

entonces:

```text
outputType = Money<COP>
```

---

## 364. TOP-LEVEL RULE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TOP-LEVEL RULE

El Analyzer debe validar:

```text
Rule produces a valid output
```

---

## 365. EMPTY PROGRAM

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

EMPTY PROGRAM

Debe producir error:

```text
AEL-SYNTAX/SEMANTIC appropriate code
```

según etapa.

---

## 366. UNUSED VARIABLES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNUSED VARIABLES

Puede generar:

```text
warning
```

si policy lo requiere.

---

## 367. UNREACHABLE CODE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNREACHABLE CODE

Puede generar:

```text
warning
```

si Analyzer soporta control-flow analysis.

No es requisito mínimo si no aporta V1.

---

## 368. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONSTANT FOLDING

El Analyzer puede identificar:

```text
1 + 2
```

pero el folding debe ser una decisión posterior del Compiler.

No mezclar responsabilidades.

---

## 369. CONSTANT ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONSTANT ERROR

Si:

```text
1 / 0
```

es detectable en compile time:

```text
error
```

---

## 370. RUNTIME ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

RUNTIME ERROR

Si:

```text
1 / variable
```

y variable puede ser cero:

```text
runtime validation
```

---

## 371. SECURITY ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SECURITY ANALYSIS

Analyzer puede detectar:

```text
required capabilities
```

pero no sustituye:

```text
security policy
```

---

## 372. FORBIDDEN CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FORBIDDEN CAPABILITY

Si una policy está disponible en compile context y una capability está prohibida:

```text
blocking diagnostic
```

si así lo define Application policy.

---

## 373. TENANT CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TENANT CONTEXT

Analyzer no debe asumir:

```text
tenant_id
```

como parte de la semántica AEL.

Tenant pertenece a execution/security context.

---

## 374. CONTRACT VISIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CONTRACT VISIBILITY

Registry puede filtrar Contracts disponibles por:

```text
language version
tenant
environment
```

pero Analyzer sólo ve la interfaz ya autorizada para análisis.

---

## 375. FUNCTION VISIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FUNCTION VISIBILITY

Misma regla para Functions.

---

## 376. REGISTRY VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

REGISTRY VERSIONING

ContractRegistry y FunctionRegistry deben ser versionables.

---

## 377. ANALYZER DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ANALYZER DETERMINISM

Mismo:

```text
AST
registry snapshot
language version
```

debe producir:

```text
same semantic model
same diagnostics
```

---

## 378. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

REGISTRY SNAPSHOT

El Analyzer debe recibir un snapshot consistente:

```text
contracts
functions
units
currencies
```

No consultar registries dinámicamente a mitad del análisis.

---

## 379. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

REPRODUCIBILITY

La información necesaria para recompilar debe quedar asociada al Artifact/RuleVersion.

---

## 380. COMPILER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

COMPILER CONTEXT

Conceptualmente:

```ts
interface AnalyzerContext {
  contracts: ContractRegistry
  functions: FunctionRegistry
  units: UnitRegistry
  currencies: CurrencyRegistry
  capabilities: CapabilityRegistry
}
```

---

## 381. ANALYZER API

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ANALYZER API

```ts
analyze(
  program: Program,
  context: AnalyzerContext
): AnalyzeResult
```

---

## 382. ANALYZE RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ANALYZE RESULT

```ts
interface AnalyzeResult {
  semanticModel: SemanticModel | null
  ir: SemanticIR | null
  diagnostics: Diagnostic[]
}
```

---

## 383. SUCCESS CONDITION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SUCCESS CONDITION

Analyzer succeeds sólo si:

```text
no ERROR diagnostics
```

---

## 384. WARNINGS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

WARNINGS

Warnings no impiden necesariamente:

```text
IR generation
```

pero pueden bloquear publication según policy.

---

## 385. ERROR SORTING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ERROR SORTING

Diagnostics deben ordenarse:

```text
source position
severity
code
```

de forma determinista.

---

## 386. DUPLICATE DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DUPLICATE DIAGNOSTICS

Evitar reportar el mismo error múltiples veces si puede identificarse claramente.

---

## 387. CASCADING ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CASCADING ERRORS

Si una referencia es desconocida:

```text
PROPERTY.UNKNOWN
```

no generar diez errores derivados falsos.

---

## 388. ERROR SUPPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ERROR SUPPRESSION

El Analyzer puede detener análisis de una subexpresión cuando su tipo es desconocido.

---

## 389. UNKNOWN TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNKNOWN TYPE

Puede utilizar internamente:

```text
UnknownType
```

para continuar análisis.

Nunca debe llegar a Artifact válido.

---

## 390. UNKNOWN SYMBOL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UNKNOWN SYMBOL

Puede representarse internamente:

```text
UnresolvedSymbol
```

para recuperación.

---

## 391. SEMANTIC ERROR RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SEMANTIC ERROR RECOVERY

Debe maximizar:

```text
useful diagnostics
```

sin inventar semántica.

---

## 392. TESTS — NAME RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — NAME RESOLUTION

```text
valid variable
undefined variable
duplicate variable
forward reference
```

---

## 393. TESTS — TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — TYPE

```text
valid arithmetic
invalid arithmetic
boolean operators
comparison
conditional
```

---

## 394. TESTS — MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — MONEY

```text
COP + COP
COP + USD
COP * Number
COP / Number
```

---

## 395. TESTS — QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — QUANTITY

```text
M2 + M2
M2 + KG
M2 * COP/M2
```

---

## 396. TESTS — CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — CONTRACT

```text
known Contract
unknown Contract
deprecated Contract
version mismatch
```

---

## 397. TESTS — FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — FUNCTION

```text
known Function
unknown Function
wrong arity
wrong type
return type
```

---

## 398. TESTS — CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — CAPABILITY

```text
one capability
multiple capabilities
duplicate capability
deterministic ordering
```

---

## 399. TESTS — IR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

TESTS — IR

Source:

```text
DEFINIR total =
    PROPERTY.AREA_PRIVATE *
    PARAMETER.TARIFA_M2

RETORNAR total
```

Expected:

```text
LOAD_CONTRACT
LOAD_CONTRACT
MULTIPLY
STORE_LOCAL
LOAD_LOCAL
RETURN
```

según IR definitivo.

---

## 400. CANONICAL SEMANTIC MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CANONICAL SEMANTIC MODEL

Debe producir:

```text
Symbols:
  area? / total

Dependencies:
  PROPERTY.AREA_PRIVATE
  PARAMETER.TARIFA_M2

Capabilities:
  READ_PROPERTY
  READ_PARAMETER

Output:
  Money<COP>
```

si metadata define:

```text
AREA = M2
RATE = COP/M2
```

---

## 401. SEMANTIC HASH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SEMANTIC HASH

Puede calcularse posteriormente sobre:

```text
semantic model
dependencies
capabilities
```

para detectar cambios semánticos.

---

## 402. NO SOURCE HASH SUBSTITUTE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NO SOURCE HASH SUBSTITUTE

Semantic hash no sustituye:

```text
source hash
artifact hash
```

---

## 403. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CACHE

Analyzer results pueden cachearse por:

```text
source hash
language version
registry snapshot hash
compiler version
```

---

## 404. CACHE SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CACHE SAFETY

No reutilizar análisis cuando cambió:

```text
Contract metadata
Function signature
Unit definitions
```

---

## 405. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

PERFORMANCE

Objetivo aproximado:

```text
O(AST nodes + registry lookup cost)
```

---

## 406. REGISTRY LOOKUP

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

REGISTRY LOOKUP

Usar índices:

```text
Map<code, definition>
```

cuando sea posible.

---

## 407. NO N+1

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NO N+1

Analyzer no debe hacer:

```text
database query per Contract
```

El Registry debe estar preconstruido.

---

## 408. MEMORY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

MEMORY

Evitar conservar referencias innecesarias al AST completo si sólo se requiere Semantic IR.

---

## 409. API BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

API BOUNDARY

El Analyzer puede ser usado por:

```text
Compiler
Language Server
Validation API
Test tools
```

---

## 410. LANGUAGE SERVER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

LANGUAGE SERVER

Debe poder reutilizar:

```text
name resolution
type inference
diagnostics
```

para editor.

---

## 411. UI INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

UI INTEGRATION

La UI recibirá:

```text
diagnostics
dependencies
capabilities
output type
```

desde API.

---

## 412. SECURITY INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

SECURITY INTEGRATION

Application layer recibe:

```text
requiredCapabilities
```

y decide:

```text
authorized?
```

---

## 413. PUBLICATION INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

PUBLICATION INTEGRATION

PublicationService exige:

```text
analysis success
artifact generated
dependencies resolved
policy satisfied
```

---

## 414. ARTIFACT INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

ARTIFACT INPUT

Compiler sólo debe recibir:

```text
Semantically valid representation
```

---

## 415. RUNTIME ASSUMPTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

RUNTIME ASSUMPTION

Runtime puede confiar parcialmente en Artifact pero debe validar invariants críticos.

---

## 416. NO DATABASE IN ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NO DATABASE IN ANALYZER

Esta regla es absoluta:

```text
Analyzer ≠ database access
```

---

## 417. NO SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

NO SIDE EFFECTS

Analyzer debe ser:

```text
pure / side-effect free
```

excepto caches explícitamente controladas.

---

## 418. CORE LANGUAGE NAMES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

CORE LANGUAGE NAMES

El Analyzer no debe introducir nombres de Functions en inglés.

Todo catálogo público AEL V1 debe respetar la convención:

```text
nombres en español
```

---

## 419. EXAMPLES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

EXAMPLES

Valid:

```text
DEFINIR total =
    PROPERTY.AREA_PRIVATE *
    PARAMETER.TARIFA_M2

RETORNAR total
```

Invalid:

```text
DEFINIR total =
    PROPERTY.AREA_PRIVATE +
    PARAMETER.TARIFA_M2
```

si ambos tipos no son compatibles para suma.

---

## 420. DIAGNOSTIC QUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

DIAGNOSTIC QUALITY

Cada error debe responder:

```text
qué ocurrió
dónde
tipo esperado
tipo recibido
cómo corregirlo
```

cuando sea posible.

---

## 421. EXIT CRITERIA — AEL-SEMANTIC-ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

EXIT CRITERIA — AEL-SEMANTIC-ANALYZER

```text
✓ Symbol table
✓ Name resolution
✓ Scope rules
✓ Type inference
✓ Type checking
✓ Operator checking
✓ Money compatibility
✓ Quantity compatibility
✓ Dimension algebra integration
✓ Contract resolution
✓ Function resolution
✓ Capability collection
✓ Dependency collection
✓ Return type analysis
✓ Semantic IR
✓ Deterministic diagnostics
✓ Error recovery
✓ Registry snapshot support
✓ Unit tests
✓ Integration tests
✓ No infrastructure dependency
```

---

## 422. FINAL PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_Analyzer 26.md

FINAL PIPELINE

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
  ├── Names
  ├── Types
  ├── Dimensions
  ├── Contracts
  ├── Functions
  └── Capabilities
  ↓
SEMANTIC IR
```

---

## 423. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

OBJETIVO

Definir:

```text
Compiler
Pipeline
AST
Semantic IR
Typed IR
Control Flow
Optimization
Bytecode Generation
Artifact Generation
Diagnostics
Determinism
Compiler invariants
```

---

## 424. PIPELINE DEFINITIVO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PIPELINE DEFINITIVO

```text
Source
 ↓
Lexer
 ↓
Parser
 ↓
AST
 ↓
Semantic Analysis
 ↓
Typed AST / Semantic Model
 ↓
Semantic IR
 ↓
Typed IR
 ↓
Control Flow Analysis
 ↓
Safe Optimization
 ↓
Bytecode Generation
 ↓
Artifact Assembly
 ↓
Artifact Verification
```

---

## 425. COMPILER RESPONSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER RESPONSIBILITY

Compiler debe:

```text
parse
resolve
type-check
analyze
lower
optimize safely
generate
serialize
```

---

## 426. COMPILER NO RESPONSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER NO RESPONSIBILITY

Compiler no debe:

```text
ejecutar Contract
consultar PostgreSQL
ejecutar Function externa
resolver datos de negocio
inventar conversiones
```

---

## 427. INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

INPUT

Compiler recibe:

```text
AEL Source
CompilerContext
RegistrySnapshots
CompilerOptions
```

---

## 428. OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

OUTPUT

Produce:

```text
Artifact
```

o:

```text
CompilationResult.errors
```

---

## 429. COMPILATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILATION RESULT

Conceptualmente:

```ts
type CompilationResult =
  | {
      ok: true
      artifact: Artifact
    }
  | {
      ok: false
      diagnostics: Diagnostic[]
    }
```

---

## 430. COMPILER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER CONTEXT

Debe incluir:

```text
languageVersion
artifactFormatVersion
compilerVersion
ContractRegistrySnapshot
FunctionRegistrySnapshot
TypeRegistrySnapshot
OperatorRegistrySnapshot
CompilerOptions
```

---

## 431. IMMUTABLE SNAPSHOTS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

IMMUTABLE SNAPSHOTS

Compiler debe trabajar sobre:

```text
immutable registry snapshots
```

para evitar semantic drift durante una compilación.

---

## 432. SOURCE SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SOURCE SNAPSHOT

Source debe tratarse como:

```text
immutable input
```

durante la compilación.

---

## 433. PHASE 1 — LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 1 — LEXER

Lexer convierte:

```text
characters
→ tokens
```

---

## 434. LEXER RESPONSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

LEXER RESPONSIBILITY

Detectar:

```text
identifiers
literals
operators
keywords
punctuation
```

---

## 435. LEXER NO SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

LEXER NO SEMANTICS

Lexer no determina:

```text
Money
Quantity
Contract types
```

---

## 436. PHASE 2 — PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 2 — PARSER

Parser convierte:

```text
tokens
→ AST
```

---

## 437. AST

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

AST

AST representa:

```text
syntactic structure
```

no todavía toda la semántica.

---

## 438. AST SOURCE SPANS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

AST SOURCE SPANS

Cada nodo debe conservar:

```text
SourceSpan
```

cuando sea posible.

---

## 439. AST IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

AST IMMUTABILITY

AST no debe mutarse de forma arbitraria entre fases.

---

## 440. AST NODE TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

AST NODE TYPES

Conceptualmente:

```text
Literal
Identifier
BinaryExpression
UnaryExpression
ConditionalExpression
FunctionCall
ContractReference
ReturnExpression
```

según la gramática V1.

---

## 441. PHASE 3 — NAME RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 3 — NAME RESOLUTION

Resolver:

```text
Contract references
Function references
Inputs
Symbols
```

---

## 442. NAME RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NAME RESOLUTION

Un identifier debe mapear a una entidad conocida.

---

## 443. UNKNOWN IDENTIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

UNKNOWN IDENTIFIER

Produce:

```text
AEL-SEMANTIC-001
```

---

## 444. NO DYNAMIC NAME RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO DYNAMIC NAME RESOLUTION

Compiler no debe permitir:

```text
runtime arbitrary identifier lookup
```

---

## 445. CONTRACT RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CONTRACT RESOLUTION

Contract reference se transforma en:

```text
ContractDependency
```

---

## 446. FUNCTION RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FUNCTION RESOLUTION

Function reference se transforma en:

```text
FunctionDependency
```

---

## 447. DEPENDENCY PINNING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DEPENDENCY PINNING

Compiler debe registrar:

```text
version
definitionHash
```

de la dependency.

---

## 448. PHASE 4 — TYPE ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 4 — TYPE ANALYSIS

Aplicar:

```text
Type System
Operator System
Function System
Contract System
```

---

## 449. TYPED AST

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

TYPED AST

Cada expresión debe tener:

```text
inferred AELType
```

---

## 450. TYPE ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

TYPE ERRORS

Detener compilation si existen:

```text
fatal type errors
```

---

## 451. PHASE 5 — SEMANTIC ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 5 — SEMANTIC ANALYSIS

Validar:

```text
capability requirements
dependency validity
nullability
control flow
return type
```

---

## 452. SEMANTIC MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SEMANTIC MODEL

Conceptualmente:

```ts
SemanticModel {
  symbols
  dependencies
  types
  flowFacts
}
```

---

## 453. FLOW ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FLOW ANALYSIS

Integrar:

```text
ControlFlowAnalysis
```

---

## 454. NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NULLABILITY

Aplicar:

```text
Nullable narrowing
```

definido en Documento 34.

---

## 455. OPERATOR SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

OPERATOR SEMANTICS

Usar:

```text
OperatorRegistry
```

único.

---

## 456. FUNCTION SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FUNCTION SEMANTICS

Usar:

```text
FunctionRegistry
```

único.

---

## 457. CONTRACT SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CONTRACT SEMANTICS

Usar:

```text
ContractRegistry
```

único.

---

## 458. PHASE 6 — SEMANTIC IR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 6 — SEMANTIC IR

Lower AST a:

```text
Semantic IR
```

---

## 459. PURPOSE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PURPOSE

Semantic IR elimina detalles sintácticos innecesarios y representa:

```text
meaning
```

---

## 460. SEMANTIC IR EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SEMANTIC IR EXAMPLE

Source:

```text
PROPERTY.AREA_PRIVATE *
PARAMETER.TARIFA_M2
```

Semantic IR:

```text
LoadContract AREA_PRIVATE
LoadContract TARIFA_M2
Multiply
Return
```

---

## 461. TYPED SEMANTIC IR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

TYPED SEMANTIC IR

Cada instruction debe conocer:

```text
input types
output type
```

---

## 462. PHASE 7 — CONTROL FLOW IR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 7 — CONTROL FLOW IR

Conditional:

```text
SI c ENTONCES a SINO b
```

se representa como:

```text
Branch
ThenBlock
ElseBlock
Merge
```

---

## 463. BASIC BLOCKS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

BASIC BLOCKS

IR utiliza:

```text
BasicBlock
```

para control flow.

---

## 464. PHASE 8 — TYPED IR

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 8 — TYPED IR

Typed IR es la representación inmediatamente anterior a bytecode.

---

## 465. TYPED IR INVARIANT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

TYPED IR INVARIANT

Toda instruction tiene:

```text
known input types
known output types
```

---

## 466. NO UNKNOWN TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO UNKNOWN TYPES

No debe existir:

```text
Any
Unknown
Dynamic
```

en Typed IR V1.

---

## 467. NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NULLABILITY

Debe estar representada explícitamente:

```text
Nullable<T>
```

---

## 468. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

MONEY

Debe preservar:

```text
currency
```

---

## 469. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

QUANTITY

Debe preservar:

```text
dimension
unit
```

---

## 470. PHASE 9 — IR VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 9 — IR VALIDATION

Antes de optimizar:

```text
IRVerifier
```

debe validar:

```text
types
stack effects
control flow
dependencies
```

---

## 471. OPTIMIZATION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

OPTIMIZATION POLICY

V1 prioriza:

```text
correctness
determinism
auditability
```

sobre micro-optimizaciones.

---

## 472. SAFE OPTIMIZATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SAFE OPTIMIZATIONS

Permitidas:

```text
constant folding
dead constant branch removal
constant propagation
```

si no alteran semantics.

---

## 473. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CONSTANT FOLDING

Ejemplo:

```text
2 + 3
```

→

```text
5
```

---

## 474. MONEY FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

MONEY FOLDING

Sólo cuando:

```text
currency
precision
rounding
```

sean deterministas.

---

## 475. QUANTITY FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

QUANTITY FOLDING

Sólo cuando:

```text
dimension
unit
```

sean conocidos.

---

## 476. NO EXTERNAL FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO EXTERNAL FOLDING

No evaluar en compile-time:

```text
Contract
external Function
current time
```

---

## 477. DEAD BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DEAD BRANCH

Si:

```text
SI VERDADERO ENTONCES A SINO B
```

puede eliminarse B si:

```text
B no tiene efectos observables
```

---

## 478. EFFECT SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

EFFECT SAFETY

Antes de eliminar una expresión, Compiler debe conocer si:

```text
pure
or effectful
```

---

## 479. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

V1 RECOMMENDATION

No eliminar llamadas externas aunque parezcan constantes.

---

## 480. NO REORDERING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO REORDERING

V1 no reordena instrucciones externas.

---

## 481. NO COMMON SUBEXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO COMMON SUBEXPRESSION

No introducir CSE en V1 para expresiones que puedan:

```text
consultar Provider
```

---

## 482. PURE EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PURE EXPRESSION

Puede optimizarse una expresión sólo si su semántica declara:

```text
pure
deterministic
```

---

## 483. FUNCTION PURITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FUNCTION PURITY

La Function Registry debe declarar:

```text
purity
```

cuando aplique.

---

## 484. PROVIDER EFFECT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PROVIDER EFFECT

Contract reads se consideran potencialmente:

```text
external effect
```

aunque sean read-only.

---

## 485. PHASE 10 — BYTECODE GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE 10 — BYTECODE GENERATION

Typed IR se convierte en:

```text
Artifact instructions
```

---

## 486. OPCODE SELECTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

OPCODE SELECTION

Compiler utiliza:

```text
OpcodeRegistry
```

o catálogo equivalente.

---

## 487. STACK LOWERING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

STACK LOWERING

Expression tree se transforma a:

```text
operand stack instructions
```

---

## 488. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

EXAMPLE

```text
A + B
```

→

```text
LOAD A
LOAD B
ADD
```

---

## 489. CONDITIONAL LOWERING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CONDITIONAL LOWERING

```text
condition
JUMP_IF_FALSE else
then
JUMP end
else
end
```

---

## 490. LABEL RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

LABEL RESOLUTION

Compiler transforma labels simbólicos en:

```text
instruction targets
```

---

## 491. JUMP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

JUMP VALIDATION

Después de lowering:

```text
all targets must resolve
```

---

## 492. STACK MAP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

STACK MAP

Compiler puede producir metadata interna:

```text
instruction → abstract stack state
```

---

## 493. ARTIFACT ASSEMBLY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

ARTIFACT ASSEMBLY

Combina:

```text
Header
Metadata
Constants
Types
Dependencies
Instructions
SourceMap
Integrity
```

---

## 494. CANONICAL ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CANONICAL ORDER

Las secciones deben ensamblarse siempre en el mismo orden.

---

## 495. CONSTANT ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CONSTANT ORDER

Constants deben tener orden determinista.

---

## 496. DEPENDENCY ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DEPENDENCY ORDER

Dependencies deben tener orden determinista.

---

## 497. SYMBOL ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SYMBOL ORDER

No depender de:

```text
JavaScript object insertion order
```

para semantics críticas.

---

## 498. SORTING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SORTING

Cuando sea necesario:

```text
canonical comparator
```

---

## 499. SOURCE MAP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SOURCE MAP

Compiler puede emitir:

```text
instruction → source span
```

---

## 500. PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PROVENANCE

Compiler genera:

```text
sourceHash
compilerVersion
languageVersion
```

---

## 501. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

ARTIFACT HASH

Serializer canónico genera:

```text
artifactHash
```

---

## 502. NO RANDOMNESS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO RANDOMNESS

Compilation no debe depender de:

```text
random UUID
current time
machine hostname
```

para el contenido semántico del Artifact.

---

## 503. BUILD TIMESTAMP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

BUILD TIMESTAMP

Puede existir en provenance, pero:

```text
no debe alterar semantic artifact hash
```

si se requiere reproducible build.

---

## 504. COMPILER OPTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER OPTIONS

Options que alteren semantics deben formar parte de:

```text
build fingerprint
```

---

## 505. BUILD FINGERPRINT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

BUILD FINGERPRINT

Conceptualmente:

```text
languageVersion
compilerVersion
compilerOptions
registry hashes
```

---

## 506. COMPILATION CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILATION CACHE

Puede cachearse por:

```text
sourceHash
buildFingerprint
```

---

## 507. CACHE SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CACHE SAFETY

Nunca reutilizar Artifact si cambia:

```text
OperatorRegistry
TypeRegistry
ContractRegistry
FunctionRegistry
```

en forma semánticamente relevante.

---

## 508. DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DIAGNOSTICS

Compiler debe producir diagnostics estructurados.

---

## 509. DIAGNOSTIC STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DIAGNOSTIC STRUCTURE

```ts
interface Diagnostic {
  code: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  message: string
  sourceSpan?: SourceSpan
}
```

---

## 510. DIAGNOSTIC ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DIAGNOSTIC ORDER

Orden determinista:

```text
source position
severity
code
```

---

## 511. MULTIPLE ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

MULTIPLE ERRORS

Compiler puede reportar múltiples errores independientes.

---

## 512. CASCADING ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

CASCADING ERRORS

Debe limitar diagnostics derivados de un error raíz.

---

## 513. ERROR RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

ERROR RECOVERY

Parser puede recuperarse para continuar diagnostics.

---

## 514. SEMANTIC RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SEMANTIC RECOVERY

Semantic Analyzer debe evitar producir falsos errores en cascada.

---

## 515. COMPILER FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER FAILURE

No generar Artifact ejecutable si existe:

```text
ERROR
```

---

## 516. WARNINGS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

WARNINGS

Warnings no deben invalidar Artifact salvo policy explícita.

---

## 517. STRICT MODE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

STRICT MODE

Producción puede usar:

```text
warningsAsErrors
```

---

## 518. COMPILER API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER API

Conceptualmente:

```ts
interface AELCompiler {
  compile(source: string, context: CompilerContext): CompilationResult
}
```

---

## 519. PHASE API

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE API

Internamente:

```text
Lexer
Parser
SemanticAnalyzer
TypeAnalyzer
FlowAnalyzer
IRBuilder
IROptimizer
BytecodeGenerator
ArtifactAssembler
```

---

## 520. PHASE ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PHASE ISOLATION

Cada fase debe tener:

```text
clear input
clear output
clear invariants
```

---

## 521. NO GLOBAL MUTABLE STATE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO GLOBAL MUTABLE STATE

Compiler no debe depender de:

```text
global mutable registry
```

---

## 522. THREAD SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

THREAD SAFETY

Compiler instances pueden ejecutarse concurrentemente si utilizan:

```text
immutable context
```

---

## 523. COMPILATION ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILATION ISOLATION

Una compilación no puede modificar:

```text
otra compilación
```

---

## 524. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

REGISTRY SNAPSHOT

Snapshots garantizan:

```text
semantic consistency
```

---

## 525. SOURCE SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SOURCE SECURITY

Source AEL se considera:

```text
untrusted input
```

---

## 526. SOURCE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SOURCE LIMITS

Aplicar:

```text
maxSourceLength
maxASTNodes
maxNestingDepth
```

---

## 527. PARSER LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PARSER LIMITS

Evitar:

```text
stack overflow
memory exhaustion
```

por Source malicioso.

---

## 528. AST NODE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

AST NODE LIMIT

Si supera:

```text
maxASTNodes
```

rechazar.

---

## 529. NESTING LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NESTING LIMIT

Si supera:

```text
maxNestingDepth
```

rechazar.

---

## 530. COMPILER RESOURCE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER RESOURCE LIMITS

También pueden existir:

```text
maxDependencies
maxConstants
maxInstructions
```

---

## 531. COMPILER DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER DETERMINISM

Mismo:

```text
Source
CompilerContext
```

debe producir:

```text
equivalent Artifact
```

---

## 532. EQUIVALENCE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

EQUIVALENCE

Equivalent Artifact significa:

```text
same semantics
same canonical representation
```

cuando reproducible build está habilitado.

---

## 533. GOLDEN COMPILATION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

GOLDEN COMPILATION

Mantener fixtures:

```text
source
expected Artifact
expected diagnostics
```

---

## 534. ROUND TRIP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

ROUND TRIP

Test:

```text
Source
→ compile
→ verify
→ execute
```

---

## 535. COMPILER/VERIFIER PARITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER/VERIFIER PARITY

Todo Artifact producido por Compiler debe:

```text
pass Verifier
```

---

## 536. NEGATIVE PARITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NEGATIVE PARITY

Artifacts rechazados por Verifier deben tener:

```text
tests
```

independientes del Compiler.

---

## 537. COMPILER BUG

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER BUG

Si Compiler produce Artifact inválido:

```text
critical defect
```

---

## 538. NO RUNTIME PATCH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO RUNTIME PATCH

Runtime no debe "corregir" Artifact inválido.

---

## 539. ARTIFACT GENERATION CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

ARTIFACT GENERATION CONTRACT

Compiler garantiza:

```text
well-formed Artifact
```

---

## 540. VERIFIER CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

VERIFIER CONTRACT

Verifier garantiza:

```text
safe structural invariants
```

---

## 541. RUNTIME CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

RUNTIME CONTRACT

Runtime garantiza:

```text
safe execution under ExecutionContext
```

---

## 542. RESPONSIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

RESPONSIBILITY MATRIX

```text
Lexer             Syntax tokens
Parser            AST
SemanticAnalyzer  Meaning
TypeAnalyzer      Types
FlowAnalyzer      Control flow
IRBuilder         Semantic representation
Optimizer         Safe transformations
BytecodeGenerator Instructions
Assembler         Artifact
Verifier          Safety
Runtime           Execution
```

---

## 543. NO RESPONSIBILITY OVERLAP

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO RESPONSIBILITY OVERLAP

Ninguna fase debe convertirse en:

```text
"catch-all"
```

---

## 544. EXTENSIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

EXTENSIBILITY

Nuevos operadores deben modificar:

```text
OperatorRegistry
Compiler lowering
Runtime opcode support
Verifier opcode support
```

de forma coordinada.

---

## 545. EXTENSIBILITY — FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

EXTENSIBILITY — FUNCTIONS

Nueva Function:

```text
FunctionRegistry
dependency resolution
compiler type checking
runtime adapter
```

---

## 546. EXTENSIBILITY — CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

EXTENSIBILITY — CONTRACTS

Nuevo Contract:

```text
ContractRegistry
dependency resolution
runtime Provider
```

---

## 547. VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

VERSIONING

Cambios semánticos deben actualizar:

```text
languageVersion
```

---

## 548. FORMAT CHANGES

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FORMAT CHANGES

Cambios de Artifact layout deben actualizar:

```text
artifactFormatVersion
```

---

## 549. BREAKING CHANGE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

BREAKING CHANGE

Compiler debe rechazar generar un Artifact incompatible con el target declarado.

---

## 550. TEST MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

TEST MATRIX

Mínimo:

```text
lexer tests
parser tests
semantic tests
type tests
flow tests
IR tests
optimizer tests
bytecode tests
artifact tests
verifier tests
runtime integration tests
```

---

## 551. PROPERTY TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PROPERTY TESTING

Aplicar cuando corresponda a:

```text
parser
type rules
IR lowering
serialization
```

---

## 552. FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FUZZING

Fuzz Source:

```text
parser
compiler
```

---

## 553. ARTIFACT FUZZING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

ARTIFACT FUZZING

Fuzz Artifact:

```text
verifier
deserializer
```

---

## 554. SECURITY REGRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SECURITY REGRESSION

Cada bug de Compiler/Security debe convertirse en:

```text
regression fixture
```

---

## 555. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PERFORMANCE

Medir:

```text
parse time
semantic analysis time
IR time
optimization time
bytecode time
serialization time
```

---

## 556. COMPILER OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER OBSERVABILITY

Métricas:

```text
compile_total
compile_success_total
compile_error_total
compile_duration
artifact_size
instruction_count
```

---

## 557. NO SOURCE LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO SOURCE LOGGING

No registrar Source completo en producción por defecto.

---

## 558. SOURCE HASH

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

SOURCE HASH

Usar:

```text
sourceHash
```

para correlación.

---

## 559. DIAGNOSTIC SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

DIAGNOSTIC SECURITY

Diagnostics no deben incluir:

```text
secrets
database credentials
internal tokens
```

---

## 560. COMPILER PLUGINS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

COMPILER PLUGINS

V1 no permite plugins arbitrarios dentro del Compiler execution path.

---

## 561. TRUSTED EXTENSIONS

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

TRUSTED EXTENSIONS

Extensions futuras deben pertenecer al deployment controlado.

---

## 562. NO EVAL

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO EVAL

Compiler no debe utilizar:

```text
eval()
new Function()
```

para interpretar Source.

---

## 563. NO RUNTIME SOURCE EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

NO RUNTIME SOURCE EXECUTION

Compiler transforma Source a Artifact.

Runtime no recibe Source para ejecución.

---

## 564. FINAL COMPILER FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

FINAL COMPILER FLOW

```text
             AEL Source
                 │
                 ▼
               Lexer
                 │
                 ▼
               Parser
                 │
                 ▼
                AST
                 │
                 ▼
        Semantic + Type Analysis
                 │
                 ▼
           Control Flow
                 │
                 ▼
          Semantic / Typed IR
                 │
                 ▼
        Safe Optimization
                 │
                 ▼
        Bytecode Generation
                 │
                 ▼
         Artifact Assembly
                 │
                 ▼
              Verifier
                 │
                 ▼
              Runtime
```

---

## 565. PRINCIPIO DE COMPILACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PRINCIPIO DE COMPILACIÓN

Compiler debe tomar decisiones semánticas:

```text
antes
```

de Runtime.

---

## 566. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PRINCIPIO DE SEGURIDAD

Compiler nunca genera:

```text
arbitrary code
```

---

## 567. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PRINCIPIO DE DETERMINISMO

La compilación debe ser:

```text
reproducible
```

cuando se utiliza el mismo toolchain y snapshots.

---

## 568. PRINCIPIO DE RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PRINCIPIO DE RESPONSABILIDAD

Cada fase tiene una responsabilidad única y verificable.

---

## 569. PRINCIPIO DE NO REINTERPRETACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Compiler_Architecture 38.md

PRINCIPIO DE NO REINTERPRETACIÓN

Runtime ejecuta:

```text
Artifact
```

no:

```text
Source
```

---

## 570. REFERENCIAS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

REFERENCIAS

Implementa:

```text
Documento 18 — Type System
Documento 43 — Error Model & Diagnostics
Documento 54 — Reference Architecture
Documento 55 — Core Domain & Foundational Types
Documento 57 — Parser & Abstract Syntax Tree
```

Relacionados:

```text
Documento 45 — Registry & Dependency Management
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
```

---

## 571. OBJETIVO

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

OBJETIVO

Transformar:

```text
AST
```

en:

```text
Semantic Model
```

y producir:

```text
semantic diagnostics
```

---

## 572. PIPELINE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PIPELINE

```text
Source
 ↓
Tokenizer
 ↓
Parser
 ↓
AST
 ↓
Semantic Analyzer
 ↓
Typed Semantic Model
 ↓
IR
```

---

## 573. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RESPONSABILIDADES

El Semantic Analyzer debe:

```text
crear scopes
resolver símbolos
validar declaraciones
resolver referencias
validar tipos
validar operadores
validar llamadas
validar accesos
validar retornos
validar anotaciones
producir semantic model
```

---

## 574. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NO RESPONSABILIDAD

No debe:

```text
ejecutar expressions
calcular liquidaciones
acceder a PostgreSQL
resolver datos de tenant
hacer HTTP
persistir resultados
```

---

## 575. PACKAGE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PACKAGE

Ruta:

```text
packages/ael-semantic/
```

---

## 576. DEPENDENCIES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DEPENDENCIES

Permitidas:

```text
ael-core
ael-ast
ael-types
```

y Contracts/Registry sólo mediante interfaces apropiadas cuando la resolución de símbolos externos lo requiera.

---

## 577. SYMBOL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SYMBOL

Un símbolo representa una declaración identificable.

Conceptualmente:

```ts
interface Symbol {
  name: string
  kind: SymbolKind
  type?: Type
  declaration: AstNode
}
```

---

## 578. SYMBOL KINDS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SYMBOL KINDS

Inicialmente:

```text
Variable
Constant
Parameter
Function
Type
Contract
Rule
Import
```

---

## 579. SCOPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SCOPE

Un Scope contiene símbolos visibles en un contexto.

```ts
interface Scope {
  parent?: Scope
  symbols: SymbolTable
}
```

---

## 580. SCOPE TYPES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SCOPE TYPES

```text
Global
Module
Function
Block
Loop
```

---

## 581. SYMBOL TABLE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SYMBOL TABLE

Debe soportar:

```text
define
lookup
lookupLocal
has
```

---

## 582. DUPLICATE SYMBOL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DUPLICATE SYMBOL

Declarar dos veces un símbolo en el mismo scope debe producir:

```text
AEL_SEM_DUPLICATE_SYMBOL
```

salvo una regla explícita de redeclaración.

---

## 583. SHADOWING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SHADOWING

V1 debe definir explícitamente el shadowing.

Recomendación:

```text
shadowing permitido en nested scopes
```

pero:

```text
duplicate en mismo scope = error
```

---

## 584. GLOBAL SCOPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

GLOBAL SCOPE

Contiene únicamente símbolos autorizados por el compiler:

```text
built-in types
built-in functions
authorized contracts
authorized declarations
```

No debe incorporar automáticamente todos los recursos del sistema.

---

## 585. BUILTIN SYMBOLS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

BUILTIN SYMBOLS

Deben ser registrados mediante un catálogo controlado.

---

## 586. TYPE SYMBOLS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE SYMBOLS

Tipos como:

```text
Money
Decimal
Currency
Rate
Quantity
```

deben resolverse mediante el Type Registry, no como strings arbitrarios.

---

## 587. TYPE REPRESENTATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE REPRESENTATION

El Semantic Analyzer utiliza los tipos definidos en Documento 18 y materializados en Documento 55.

---

## 588. TYPE CATEGORIES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE CATEGORIES

```text
PrimitiveType
NumericType
FinancialType
CollectionType
FunctionType
ObjectType
NullableType
UnknownType
ErrorType
```

Sólo implementar las categorías realmente necesarias para V1.

---

## 589. TYPE IDENTITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE IDENTITY

Dos tipos sólo son equivalentes si cumplen las reglas de identidad definidas por el Type System.

---

## 590. TYPE ASSIGNABILITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE ASSIGNABILITY

Debe existir una operación:

```text
isAssignable(source, target)
```

---

## 591. TYPE EQUALITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE EQUALITY

Debe existir:

```text
isSameType(a, b)
```

---

## 592. TYPE COMPATIBILITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE COMPATIBILITY

Debe existir:

```text
isCompatible(a, b)
```

sin confundirla con igualdad.

---

## 593. ERROR TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ERROR TYPE

Cuando una expresión ya tiene error semántico puede utilizar:

```text
ErrorType
```

para evitar cascadas.

---

## 594. UNKNOWN TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNKNOWN TYPE

`UnknownType` sólo debe utilizarse cuando la información todavía no puede determinarse.

No debe convertirse silenciosamente en:

```text
any
```

---

## 595. ANY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ANY

V1 debe evitar `any` como escape semántico general.

---

## 596. NULL TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NULL TYPE

`null` debe tener el tipo definido por Documento 18.

No convertir automáticamente:

```text
null → 0
```

---

## 597. NULLABILITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NULLABILITY

Si un tipo puede contener null:

```text
Nullable<T>
```

debe ser explícito.

---

## 598. VARIABLE INFERENCE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

VARIABLE INFERENCE

Ejemplo:

```ael
let amount = 100;
```

El Analyzer puede inferir:

```text
Integer
```

---

## 599. EXPLICIT TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

EXPLICIT TYPE

Ejemplo:

```ael
let amount: Decimal = 100;
```

Debe validar:

```text
initializer assignable to Decimal
```

---

## 600. INFERENCE PRINCIPLE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

INFERENCE PRINCIPLE

La inferencia no debe cambiar silenciosamente el significado financiero de un literal.

---

## 601. DECIMAL LITERAL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DECIMAL LITERAL

El Analyzer puede convertir el literal léxico a:

```text
Decimal
```

mediante la abstracción del Documento 55.

---

## 602. MONEY CONSTRUCTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY CONSTRUCTION

Si el programa utiliza:

```ael
money("500000", "COP")
```

el Analyzer valida la firma conocida de la Function, pero la ejecución corresponde al Runtime.

---

## 603. FUNCTION SYMBOL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

FUNCTION SYMBOL

Una Function debe tener:

```text
name
parameters
returnType
capabilities
```

según contratos posteriores.

---

## 604. CALL VALIDATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CALL VALIDATION

Para:

```ael
calculate(base, rate)
```

validar:

```text
function exists
argument count
argument types
```

---

## 605. UNKNOWN FUNCTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNKNOWN FUNCTION

Error:

```text
AEL_SEM_UNKNOWN_FUNCTION
```

---

## 606. ARGUMENT COUNT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ARGUMENT COUNT

Error:

```text
AEL_SEM_ARGUMENT_COUNT
```

---

## 607. ARGUMENT TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ARGUMENT TYPE

Error:

```text
AEL_SEM_ARGUMENT_TYPE
```

---

## 608. RETURN TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RETURN TYPE

Una Function debe tener un tipo de retorno conocido.

---

## 609. RETURN VALIDATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RETURN VALIDATION

Dentro de una Function:

```text
return expression
```

debe ser compatible con:

```text
declared return type
```

---

## 610. RETURN OUTSIDE FUNCTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RETURN OUTSIDE FUNCTION

Debe producir:

```text
AEL_SEM_RETURN_OUTSIDE_FUNCTION
```

salvo que el programa raíz permita explícitamente return.

---

## 611. PROGRAM RETURN

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PROGRAM RETURN

Si AEL utiliza un programa como expresión ejecutable, el tipo de `return` del programa debe ser parte del Semantic Model.

---

## 612. VARIABLE INITIALIZATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

VARIABLE INITIALIZATION

Una variable con initializer debe tener:

```text
initializer type
```

compatible con su tipo declarado.

---

## 613. UNINITIALIZED VARIABLE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNINITIALIZED VARIABLE

Si `let x;` está permitido, su tipo/estado debe quedar explícitamente definido.

No inferir silenciosamente:

```text
null
```

---

## 614. CONSTANT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CONSTANT

`const` requiere initializer si así lo define la gramática/semántica V1.

---

## 615. ASSIGNMENT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ASSIGNMENT

Si V1 soporta:

```ael
x = value;
```

debe validar:

```text
x exists
x mutable
value assignable
```

---

## 616. IMMUTABLE ASSIGNMENT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

IMMUTABLE ASSIGNMENT

Asignar a `const` debe producir:

```text
AEL_SEM_ASSIGN_TO_CONST
```

---

## 617. BINARY OPERATOR TYPING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

BINARY OPERATOR TYPING

Cada operador debe tener una tabla de tipos.

Ejemplo conceptual:

```text
Decimal + Decimal → Decimal
Integer + Integer → Integer
Money + Money → Money
```

---

## 618. MONEY ADDITION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY ADDITION

Sólo permitir:

```text
Money(Currency A) + Money(Currency A)
```

---

## 619. MONEY CURRENCY MISMATCH

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY CURRENCY MISMATCH

Debe producir:

```text
AEL_SEM_CURRENCY_MISMATCH
```

cuando pueda determinarse estáticamente.

---

## 620. MONEY × RATE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY × RATE

Si permitido por el Type System:

```text
Money × Rate → Money
```

---

## 621. MONEY × QUANTITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY × QUANTITY

No asumir automáticamente que:

```text
Money × Quantity
```

es válido.

Debe existir una regla explícita.

---

## 622. RATE × RATE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RATE × RATE

Debe seguir la semántica del Type System y no inferirse por conveniencia.

---

## 623. INVALID OPERATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

INVALID OPERATION

Ejemplo:

```ael
Money + Boolean
```

produce:

```text
AEL_SEM_INVALID_BINARY_OPERATION
```

---

## 624. UNARY TYPING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNARY TYPING

Ejemplo:

```ael
-amount
```

requiere que el tipo soporte negación.

---

## 625. LOGICAL OPERATORS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

LOGICAL OPERATORS

```text
&&
||
!
```

requieren operandos booleanos salvo conversiones explícitamente definidas.

---

## 626. COMPARISON

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

COMPARISON

Comparaciones deben utilizar reglas explícitas:

```text
<
<=
>
>=
==
!=
```

---

## 627. MONEY COMPARISON

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY COMPARISON

Sólo comparar Money con:

```text
same currency
```

o mediante una operación explícita de conversión si el lenguaje la soporta.

---

## 628. EQUALITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

EQUALITY

`==` no debe implementar coerciones financieras implícitas.

---

## 629. MEMBER ACCESS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MEMBER ACCESS

Para:

```ael
object.property
```

validar:

```text
object type
property existence
property visibility
```

si esa información está disponible estáticamente.

---

## 630. INDEX ACCESS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

INDEX ACCESS

Para:

```ael
items[index]
```

validar:

```text
indexable type
index type
result type
```

---

## 631. ARRAY TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ARRAY TYPE

```text
Array<T>
```

---

## 632. ARRAY ELEMENTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ARRAY ELEMENTS

Una colección homogénea debe validar:

```text
each element assignable to T
```

si el tipo está declarado/inferido como homogéneo.

---

## 633. OBJECT TYPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

OBJECT TYPE

Object properties deben tener:

```text
property name
property type
optionality
```

según el modelo.

---

## 634. OBJECT LITERAL INFERENCE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

OBJECT LITERAL INFERENCE

El Analyzer puede construir un tipo estructural para:

```ael
{
  amount: 100,
  currency: "COP"
}
```

---

## 635. CONDITIONAL EXPRESSION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CONDITIONAL EXPRESSION

Para:

```ael
condition ? a : b
```

validar:

```text
condition → Boolean
```

y calcular tipo común de:

```text
a
b
```

---

## 636. IF CONDITION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

IF CONDITION

Debe ser:

```text
Boolean
```

salvo reglas explícitas.

---

## 637. LOOP ITERABLE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

LOOP ITERABLE

Para:

```ael
for (item in items)
```

validar que:

```text
items
```

sea iterable.

---

## 638. LOOP VARIABLE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

LOOP VARIABLE

Debe crearse en el scope del loop según semántica definida.

---

## 639. LOOP SAFETY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

LOOP SAFETY

El Analyzer no determina el número máximo de iteraciones.

Eso pertenece a:

```text
Verifier / Runtime
```

según arquitectura posterior.

---

## 640. FUNCTION SCOPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

FUNCTION SCOPE

Cada Function crea:

```text
FunctionScope
```

con:

```text
parameters
local declarations
```

---

## 641. BLOCK SCOPE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

BLOCK SCOPE

Cada block debe crear scope si así lo define la semántica de `let`/`const`.

---

## 642. SCOPE EXIT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SCOPE EXIT

Los símbolos locales dejan de ser visibles al salir del scope.

---

## 643. SYMBOL RESOLUTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SYMBOL RESOLUTION

Resolver:

```text
local
→ parent
→ module
→ global
```

según precedencia definida.

---

## 644. UNRESOLVED SYMBOL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNRESOLVED SYMBOL

Error:

```text
AEL_SEM_UNKNOWN_SYMBOL
```

---

## 645. IMPORT RESOLUTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

IMPORT RESOLUTION

Imports deben resolverse mediante una abstracción de module/registry.

No acceder directamente al filesystem desde Semantic Analyzer.

---

## 646. CONTRACT RESOLUTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CONTRACT RESOLUTION

Contracts deben resolverse mediante el Registry/Contract abstraction.

---

## 647. RULE RESOLUTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RULE RESOLUTION

Rules externas deben resolverse mediante mecanismos definidos en Documentos 45 y 50.

---

## 648. TYPE RESOLUTION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE RESOLUTION

Para:

```ael
Money
```

resolver:

```text
TypeSymbol
```

---

## 649. TYPE NAME UNKNOWN

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE NAME UNKNOWN

Error:

```text
AEL_SEM_UNKNOWN_TYPE
```

---

## 650. GENERICS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

GENERICS

Si V1 no requiere generics, no implementarlos por anticipación.

---

## 651. OVERLOADING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

OVERLOADING

Si Functions pueden sobrecargarse, la resolución debe ser determinista.

Si V1 no necesita overloading:

```text
one signature per function name
```

simplifica el sistema.

---

## 652. FUNCTION SIGNATURE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

FUNCTION SIGNATURE

Debe ser comparable estructuralmente:

```text
name
parameter types
return type
```

---

## 653. TYPE CHECK ORDER

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE CHECK ORDER

Orden recomendado:

```text
resolve declarations
↓
resolve types
↓
validate expressions
↓
validate statements
↓
validate function contracts
```

---

## 654. MULTI-PASS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MULTI-PASS

El Analyzer puede utilizar varias pasadas para permitir referencias hacia adelante.

---

## 655. PASS 1 — DECLARATIONS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PASS 1 — DECLARATIONS

Registrar:

```text
functions
types
contracts
rules
imports
```

según alcance.

---

## 656. PASS 2 — LOCAL DECLARATIONS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PASS 2 — LOCAL DECLARATIONS

Registrar:

```text
variables
parameters
```

según scopes.

---

## 657. PASS 3 — EXPRESSIONS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PASS 3 — EXPRESSIONS

Resolver tipos y referencias.

---

## 658. PASS 4 — VALIDATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PASS 4 — VALIDATION

Verificar invariantes semánticos finales.

---

## 659. FORWARD REFERENCES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

FORWARD REFERENCES

Su soporte debe ser explícito.

No depender del orden de recorrido accidental.

---

## 660. RECURSIVE FUNCTIONS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RECURSIVE FUNCTIONS

Si están permitidas, deben registrarse antes de analizar sus cuerpos.

---

## 661. CYCLIC TYPES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CYCLIC TYPES

Si V1 soporta tipos recursivos, deben tener detección de ciclos.

---

## 662. CYCLIC SYMBOLS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CYCLIC SYMBOLS

Imports/Contracts/Rules con ciclos deben detectarse antes de compilar.

---

## 663. SEMANTIC MODEL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SEMANTIC MODEL

El resultado debe contener suficiente información para que IR no tenga que repetir resolución.

Conceptualmente:

```ts
interface SemanticModel {
  program: ProgramNode
  symbols: SymbolTable
  expressionTypes: Map<AstNode, Type>
  references: Map<AstNode, Symbol>
  diagnostics: Diagnostic[]
}
```

---

## 664. NODE TYPE MAP

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NODE TYPE MAP

Debe permitir consultar:

```text
typeOf(expression)
```

---

## 665. REFERENCE MAP

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

REFERENCE MAP

Debe permitir consultar:

```text
symbolOf(identifier)
```

---

## 666. CONSTANT INFORMATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CONSTANT INFORMATION

Puede registrar:

```text
constant value
```

cuando sea seguro y útil para optimizaciones posteriores.

---

## 667. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CONSTANT FOLDING

V1 puede limitar constant folding a operaciones puras y seguras.

No ejecutar:

```text
Providers
```

durante semantic analysis.

---

## 668. FINANCIAL CONSTANT FOLDING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

FINANCIAL CONSTANT FOLDING

No alterar semántica de:

```text
rounding
Money
Rate
```

por una optimización prematura.

---

## 669. DIAGNOSTICS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DIAGNOSTICS

Usar la infraestructura de Documento 55.

---

## 670. SEMANTIC ERROR CATALOG

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SEMANTIC ERROR CATALOG

Inicial:

```text
AEL_SEM_UNKNOWN_SYMBOL
AEL_SEM_DUPLICATE_SYMBOL
AEL_SEM_UNKNOWN_TYPE
AEL_SEM_TYPE_MISMATCH
AEL_SEM_INVALID_BINARY_OPERATION
AEL_SEM_INVALID_UNARY_OPERATION
AEL_SEM_UNKNOWN_FUNCTION
AEL_SEM_ARGUMENT_COUNT
AEL_SEM_ARGUMENT_TYPE
AEL_SEM_RETURN_OUTSIDE_FUNCTION
AEL_SEM_RETURN_TYPE
AEL_SEM_ASSIGN_TO_CONST
AEL_SEM_CURRENCY_MISMATCH
AEL_SEM_INVALID_MEMBER
AEL_SEM_INVALID_INDEX
AEL_SEM_NOT_ITERABLE
```

---

## 671. ERROR CASCADE CONTROL

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ERROR CASCADE CONTROL

Cuando una expresión tiene:

```text
ErrorType
```

las validaciones derivadas deben evitar diagnostics redundantes.

---

## 672. DIAGNOSTIC LOCATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DIAGNOSTIC LOCATION

Siempre que sea posible:

```text
identifier span
operator span
expression span
```

---

## 673. TYPE ERROR MESSAGE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE ERROR MESSAGE

Debe indicar:

```text
expected
actual
location
```

---

## 674. NO STRINGLY-TYPED TYPES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NO STRINGLY-TYPED TYPES

No comparar tipos mediante:

```text
type.name === "Money"
```

disperso por todo el código.

Utilizar:

```text
TypeId / TypeKind / type APIs
```

---

## 675. TYPE FACTORIES

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE FACTORIES

Centralizar creación de:

```text
PrimitiveType
MoneyType
ArrayType
FunctionType
```

---

## 676. TYPE INTERNING

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE INTERNING

Puede utilizarse internamiento para tipos estructuralmente iguales.

---

## 677. TYPE IMMUTABILITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE IMMUTABILITY

Type objects deben ser:

```text
immutable
```

---

## 678. SYMBOL IMMUTABILITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SYMBOL IMMUTABILITY

Symbols registrados deben ser:

```text
immutable
```

---

## 679. SCOPE MUTATION

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SCOPE MUTATION

Scope puede construirse durante análisis, pero el Semantic Model final debe ser estable.

---

## 680. THREAD SAFETY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

THREAD SAFETY

No utilizar global mutable state.

---

## 681. DETERMINISM

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DETERMINISM

Mismo AST + mismo environment:

```text
same Semantic Model
same diagnostics
```

---

## 682. ENVIRONMENT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ENVIRONMENT

El Analyzer puede recibir un:

```text
SemanticEnvironment
```

con:

```text
builtins
types
functions
contracts
rules
```

---

## 683. ENVIRONMENT IMMUTABILITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ENVIRONMENT IMMUTABILITY

Una compilación debe utilizar un snapshot estable del environment.

---

## 684. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

REGISTRY SNAPSHOT

Si utiliza Registry:

```text
registry snapshot/version/hash
```

debe quedar asociado al Semantic Model/Artifact.

---

## 685. NO LIVE LOOKUPS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NO LIVE LOOKUPS

No realizar lookups dinámicos que cambien durante una compilación.

---

## 686. SECURITY

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SECURITY

El Semantic Analyzer sólo debe recibir símbolos/capabilities autorizados por el compiler environment.

---

## 687. TENANT DATA

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TENANT DATA

No consultar datos financieros reales durante semantic analysis.

---

## 688. DOMAIN DATA

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DOMAIN DATA

La compilación debe ser independiente de:

```text
specific unit balance
specific tenant amount
specific payment
```

---

## 689. SYMBOL TESTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SYMBOL TESTS

Probar:

```text
define
lookup
shadowing
duplicate
scope exit
```

---

## 690. TYPE TESTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE TESTS

Probar:

```text
same type
assignability
compatibility
nullability
```

---

## 691. EXPRESSION TYPE TESTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

EXPRESSION TYPE TESTS

Probar:

```text
arithmetic
comparison
logical
calls
members
indexes
conditional
```

---

## 692. MONEY TYPE TESTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

MONEY TYPE TESTS

Probar:

```text
Money + Money
Money(COP) + Money(USD)
Money × Rate
Money + Decimal
```

según reglas definidas.

---

## 693. FUNCTION TESTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

FUNCTION TESTS

Probar:

```text
known function
unknown function
wrong argument count
wrong argument type
return type
```

---

## 694. SCOPE TESTS

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SCOPE TESTS

Ejemplo:

```ael
let x = 1;
{
    let y = 2;
    return x + y;
}
```

---

## 695. SHADOWING TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

SHADOWING TEST

```ael
let x = 1;
{
    let x = 2;
    return x;
}
```

Debe seguir la política V1 de shadowing.

---

## 696. DUPLICATE TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DUPLICATE TEST

```ael
let x = 1;
let x = 2;
```

Debe producir:

```text
AEL_SEM_DUPLICATE_SYMBOL
```

---

## 697. UNKNOWN SYMBOL TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNKNOWN SYMBOL TEST

```ael
return unknown;
```

---

## 698. TYPE MISMATCH TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

TYPE MISMATCH TEST

```ael
let amount: Money = true;
```

---

## 699. INVALID OPERATION TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

INVALID OPERATION TEST

```ael
let x = moneyValue + true;
```

---

## 700. RETURN TYPE TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

RETURN TYPE TEST

```ael
function f(): Money {
    return true;
}
```

---

## 701. UNKNOWN TYPE TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

UNKNOWN TYPE TEST

```ael
let x: UnknownType = 1;
```

---

## 702. CURRENCY TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

CURRENCY TEST

```ael
let a = money("100", "COP");
let b = money("10", "USD");
let c = a + b;
```

Debe detectarse incompatibilidad si la información de tipos/currency está disponible estáticamente.

---

## 703. ERROR RECOVERY TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

ERROR RECOVERY TEST

Un error semántico no debe impedir analizar completamente nodos independientes.

---

## 704. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DETERMINISM TEST

Ejecutar análisis repetido sobre el mismo AST.

Esperado:

```text
same diagnostics
same type assignments
same symbol resolution
```

---

## 705. PERFORMANCE

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PERFORMANCE

El Analyzer debe aspirar a:

```text
O(n)
```

para programas normales, exceptuando estructuras que requieran resolución compleja.

---

## 706. DEPTH LIMIT

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

DEPTH LIMIT

Limitar:

```text
nested scopes
nested types
nested expressions
```

para proteger recursos.

---

## 707. NO EXECUTION TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NO EXECUTION TEST

Functions/Providers nunca deben ejecutarse durante semantic analysis.

---

## 708. NO DATABASE TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NO DATABASE TEST

La suite debe garantizar que Semantic Analyzer no requiere:

```text
database connection
```

---

## 709. NO HTTP TEST

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

NO HTTP TEST

No requiere:

```text
network
```

---

## 710. PRINCIPIO DE SEPARACIÓN

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PRINCIPIO DE SEPARACIÓN

```text
AST
  = structure

Semantic Model
  = validated meaning

IR
  = executable representation
```

---

## 711. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PRINCIPIO DE SEGURIDAD

Semantic analysis puede determinar:

```text
what the program references
```

pero no debe conceder:

```text
runtime capabilities
```

---

## 712. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PRINCIPIO FINANCIERO

El Type System debe impedir errores como:

```text
Money + Boolean
Money + Currency
Money(COP) + Money(USD)
```

cuando puedan detectarse estáticamente.

---

## 713. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Semantic Analyzer & Type System Implementation 58.md

PRINCIPIO DE DETERMINISMO

```text
same AST
+
same environment snapshot
=
same Semantic Model
```

---
