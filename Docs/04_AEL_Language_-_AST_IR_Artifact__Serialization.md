# AEL V1 — AEL Language — AST, IR, Artifact & Serialization

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
04 — Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md
27 — Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md
36 — Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md
59 — Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md
61 — Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

OBJETIVO

AEL no ejecutará directamente el texto fuente.

El flujo oficial será:

```text
SOURCE
   │
   ▼
LEXER
   │
   ▼
TOKENS
   │
   ▼
PARSER
   │
   ▼
AST
   │
   ▼
ANALYZER
   │
   ▼
TYPED AST
   │
   ▼
IR
   │
   ▼
ARTIFACT BUILDER
   │
   ▼
ARTIFACT
   │
   ▼
ARTIFACT VERIFIER
   │
   ▼
RUNTIME
```

La separación es deliberada.

Cada etapa tiene una responsabilidad concreta.

---

## 2. PRINCIPIO FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

PRINCIPIO FUNDAMENTAL

El Runtime nunca debe necesitar comprender la sintaxis textual completa de AEL.

Por ejemplo, el Runtime no debe recibir:

```ael
RETORNAR area * tarifa
```

y tratar de interpretarlo directamente.

Debe recibir instrucciones ejecutables equivalentes a:

```text
LOAD_LOCAL area
LOAD_LOCAL tarifa
MULTIPLY
RETURN
```

Esto reduce complejidad y superficie de ataque.

---

## 3. AST

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

AST

AST significa:

```text
Abstract Syntax Tree
```

Representa la estructura sintáctica del programa.

Ejemplo:

```ael
DEFINIR total = area * tarifa
```

puede representarse como:

```text
VariableDeclaration
├── name: total
└── initializer
    └── BinaryExpression
        ├── operator: MULTIPLY
        ├── left
        │   └── Identifier(area)
        └── right
            └── Identifier(tarifa)
```

---

## 4. AST NO ES EL RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

AST NO ES EL RUNTIME

El AST debe conservar información útil para:

- diagnósticos;
- editor;
- análisis;
- documentación;
- navegación;
- source mapping.

Pero no debe utilizarse como estructura principal de ejecución.

---

## 5. AST BASE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

AST BASE

El nodo raíz será:

```text
Program
```

que contiene una:

```text
Rule
```

V1 tendrá una regla por Source.

---

## 6. NODO RULE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

NODO RULE

Conceptualmente:

```text
RuleNode
├── kind
├── name
├── declarations[]
├── statements[]
├── sourceSpan
└── metadata
```

Ejemplo:

```ael
REGLA CUOTA_ADMIN
```

produce:

```text
Rule
name = CUOTA_ADMIN
```

---

## 7. SOURCE SPAN

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SOURCE SPAN

Todo nodo AST relevante debe conservar:

```text
startOffset
endOffset
line
column
```

Esto permite que el Builder pueda marcar exactamente el código correspondiente a un diagnóstico.

---

## 8. IDENTIFIER NODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

IDENTIFIER NODE

Ejemplo:

```ael
area
```

AST:

```text
Identifier
└── name: area
```

El Parser no determina todavía si `area` es:

- variable;
- Contract;
- Function;
- referencia válida.

Eso pertenece al Analyzer.

---

## 9. LITERAL NODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LITERAL NODE

Ejemplo:

```ael
100
```

AST:

```text
NumericLiteral
└── rawValue: "100"
```

No convertir prematuramente a `number` de JavaScript.

El Analyzer/Value Engine debe producir el valor semántico correcto.

---

## 10. STRING LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

STRING LITERAL

```ael
"ACTIVO"
```

AST:

```text
StringLiteral
└── value: "ACTIVO"
```

---

## 11. BOOLEAN LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

BOOLEAN LITERAL

```ael
VERDADERO
```

AST:

```text
BooleanLiteral
└── value: true
```

---

## 12. NULL LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

NULL LITERAL

```ael
NULO
```

AST:

```text
NullLiteral
```

---

## 13. MONEY LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

MONEY LITERAL

```ael
4500 COP
```

AST:

```text
MoneyLiteral
├── amount: "4500"
└── currency: "COP"
```

El Analyzer deberá verificar que `COP` esté registrado.

---

## 14. QUANTITY LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

QUANTITY LITERAL

```ael
120.50 M2
```

AST:

```text
QuantityLiteral
├── magnitude: "120.50"
└── unit: "M2"
```

La dimensión será determinada por el UnitRegistry.

---

## 15. BINARY EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

BINARY EXPRESSION

Ejemplo:

```ael
area * tarifa
```

AST:

```text
BinaryExpression
├── operator: MULTIPLY
├── left: Identifier(area)
└── right: Identifier(tarifa)
```

---

## 16. UNARY EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

UNARY EXPRESSION

Ejemplo:

```ael
-10
```

AST:

```text
UnaryExpression
├── operator: NEGATE
└── operand: NumericLiteral(10)
```

---

## 17. LOGICAL EXPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LOGICAL EXPRESSION

Ejemplo:

```ael
activo Y habilitado
```

AST:

```text
LogicalExpression
├── operator: AND
├── left: Identifier(activo)
└── right: Identifier(habilitado)
```

---

## 18. COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

COMPARISON

Ejemplo:

```ael
area > 100 M2
```

AST:

```text
ComparisonExpression
├── operator: GREATER_THAN
├── left: Identifier(area)
└── right: QuantityLiteral(100 M2)
```

---

## 19. VARIABLE DECLARATION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

VARIABLE DECLARATION

Ejemplo:

```ael
DEFINIR area = UNIT.AREA_PRIVATE
```

AST:

```text
VariableDeclaration
├── name: area
└── initializer
    └── ContractReference
        ├── namespace: UNIT
        └── member: AREA_PRIVATE
```

---

## 20. CONTRACT REFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CONTRACT REFERENCE

Una referencia:

```ael
PARAMETER.TARIFA_M2
```

se representa como:

```text
ContractReference
├── namespace: PARAMETER
└── member: TARIFA_M2
```

El Analyzer resolverá:

```text
Contract
Property
Type
Unit
Dimension
Version
Provider
```

---

## 21. FUNCTION CALL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

FUNCTION CALL

Ejemplo:

```ael
REDONDEAR_DINERO(total)
```

AST:

```text
FunctionCall
├── name: REDONDEAR_DINERO
└── arguments
    └── Identifier(total)
```

El Parser no ejecuta la función.

---

## 22. IF NODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

IF NODE

Ejemplo:

```ael
SI activo ENTONCES
    RETORNAR 100
SINO
    RETORNAR 0
FIN
```

AST:

```text
IfStatement
├── condition
│   └── Identifier(activo)
├── thenBody
│   └── ReturnStatement
│       └── NumericLiteral(100)
└── elseBody
    └── ReturnStatement
        └── NumericLiteral(0)
```

---

## 23. WHILE NODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

WHILE NODE

La estructura AST:

```text
WhileStatement
├── condition
└── body[]
```

La semántica operacional queda sometida a los límites del Runtime.

La ejecución nunca puede superar:

```text
maxInstructions
maxExecutionTime
maxCallDepth
```

---

## 24. RETURN NODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

RETURN NODE

```ael
RETORNAR area * tarifa
```

AST:

```text
ReturnStatement
└── BinaryExpression
    ├── Identifier(area)
    └── Identifier(tarifa)
```

---

## 25. LIST NODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LIST NODE

```ael
[10, 20, 30]
```

AST:

```text
ListExpression
├── NumericLiteral(10)
├── NumericLiteral(20)
└── NumericLiteral(30)
```

---

## 26. AST TIPADO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

AST TIPADO

Después del Analyzer, los nodos deberán enriquecerse con información semántica.

Ejemplo:

```text
Identifier(area)

name:
    area

type:
    QUANTITY

dimension:
    AREA

unit:
    M2
```

---

## 27. TYPED AST

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TYPED AST

El Typed AST no reemplaza necesariamente al AST original.

Puede implementarse mediante:

```text
AST + Semantic Metadata
```

o mediante una estructura tipada independiente.

La decisión de implementación puede variar mientras se conserve la semántica.

---

## 28. INFORMACIÓN SEMÁNTICA

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

INFORMACIÓN SEMÁNTICA

Cada expresión relevante puede tener:

```text
type
unit
dimension
nullability
sourceSpan
symbolId
contractId
functionId
```

según corresponda.

---

## 29. SYMBOL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SYMBOL TABLE

El Analyzer utilizará una tabla de símbolos.

Ejemplo:

```text
SymbolTable
│
├── area
│   ├── kind: VARIABLE
│   ├── type: QUANTITY
│   ├── dimension: AREA
│   └── unit: M2
│
└── tarifa
    ├── kind: VARIABLE
    ├── type: QUANTITY
    ├── dimension: MONEY/AREA
    └── unit: COP/M2
```

---

## 30. SCOPE TREE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SCOPE TREE

El Analyzer debe poder representar:

```text
Global Scope
│
└── Rule Scope
    │
    ├── area
    ├── tarifa
    │
    └── If Scope
        └── descuento
```

Esto permite validar variables correctamente.

---

## 31. SEMANTIC BINDING

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SEMANTIC BINDING

Después del análisis:

```text
UNIT.AREA_PRIVATE
```

no debe permanecer como un simple texto.

Debe quedar asociado a:

```text
contractId
contractVersion
providerId
type
unit
dimension
```

---

## 32. FUNCTION BINDING

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

FUNCTION BINDING

Igualmente:

```ael
REDONDEAR_DINERO(total)
```

debe resolverse a algo como:

```text
functionId:
    money.round

version:
    2

signature:
    MONEY -> MONEY
```

Esto es fundamental para reproducibilidad.

---

## 33. IR

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

IR

IR significa:

```text
Intermediate Representation
```

Es una representación intermedia entre Typed AST y Artifact.

Su objetivo es:

- simplificar generación de instrucciones;
- facilitar optimizaciones seguras;
- hacer explícitos los bindings;
- eliminar detalles sintácticos innecesarios.

---

## 34. AST VS IR

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

AST VS IR

AST:

```text
DEFINIR total = area * tarifa
```

IR:

```text
DECLARE_LOCAL total
LOAD_LOCAL area
LOAD_LOCAL tarifa
MULTIPLY
STORE_LOCAL total
```

El IR está mucho más cerca de la ejecución.

---

## 35. IR NO ES AÚN ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

IR NO ES AÚN ARTIFACT

El IR puede contener referencias simbólicas.

El Artifact debe contener referencias verificadas y serializables.

Flujo:

```text
Typed AST
   ↓
IR
   ↓
Artifact Builder
   ↓
Artifact
```

---

## 36. INSTRUCTION SET V1

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

INSTRUCTION SET V1

El Instruction Set debe ser pequeño.

Instrucciones iniciales:

```text
PUSH_CONSTANT
LOAD_LOCAL
STORE_LOCAL

LOAD_CONTRACT
CALL_FUNCTION

ADD
SUBTRACT
MULTIPLY
DIVIDE
NEGATE

EQUAL
NOT_EQUAL
GREATER_THAN
GREATER_EQUAL
LESS_THAN
LESS_EQUAL

AND
OR
NOT

JUMP
JUMP_IF_FALSE

MAKE_LIST

RETURN
```

---

## 37. PRINCIPIO DE INSTRUCCIONES

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

PRINCIPIO DE INSTRUCCIONES

Cada instrucción debe tener semántica determinista.

No crear instrucciones como:

```text
EXECUTE_JAVASCRIPT
EXECUTE_SQL
HTTP_REQUEST
RUN_PROCESS
```

Estas no forman parte de AEL V1.

---

## 38. CONSTANT POOL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CONSTANT POOL

El Artifact tendrá un pool de constantes.

Ejemplo:

```text
constants:
0 → 100
1 → 4500 COP
2 → "ACTIVO"
```

Las instrucciones pueden referenciar índices.

Ejemplo:

```text
PUSH_CONSTANT 0
```

---

## 39. LOCAL VARIABLES

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LOCAL VARIABLES

El Artifact tendrá un espacio de variables locales.

Ejemplo:

```text
local 0 → area
local 1 → tarifa
local 2 → total
```

No depender de nombres de strings durante la ejecución.

---

## 40. LOAD_LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LOAD_LOCAL

Ejemplo:

```text
LOAD_LOCAL 0
```

significa:

```text
cargar variable local 0
```

El Runtime no necesita buscar:

```text
"area"
```

en cada operación.

---

## 41. STORE_LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

STORE_LOCAL

Ejemplo:

```text
STORE_LOCAL 2
```

guarda el valor calculado en la variable local correspondiente.

La semántica de variables seguirá siendo inmutable a nivel de Source.

El Runtime puede utilizar almacenamiento interno para implementar esa semántica.

---

## 42. LOAD_CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LOAD_CONTRACT

Ejemplo:

```ael
UNIT.AREA_PRIVATE
```

puede compilarse a:

```text
LOAD_CONTRACT contractId
```

El `contractId` ya debe estar resuelto.

---

## 43. CALL_FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CALL_FUNCTION

Ejemplo:

```ael
REDONDEAR_DINERO(total)
```

puede compilarse a:

```text
LOAD_LOCAL total
CALL_FUNCTION functionId, argc=1
```

El Runtime no debe resolver funciones por texto durante cada llamada.

---

## 44. ARITMÉTICA

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARITMÉTICA

Ejemplo:

```ael
area * tarifa
```

IR:

```text
LOAD_LOCAL area
LOAD_LOCAL tarifa
MULTIPLY
```

---

## 45. STACK MODEL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

STACK MODEL

El Runtime utilizará una pila de valores.

Ejemplo:

```text
LOAD_LOCAL area
```

produce:

```text
Stack:
[area]
```

Después:

```text
LOAD_LOCAL tarifa
```

produce:

```text
Stack:
[area, tarifa]
```

Después:

```text
MULTIPLY
```

produce:

```text
Stack:
[resultado]
```

---

## 46. STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

STACK UNDERFLOW

Si un Artifact manipulado intenta ejecutar:

```text
MULTIPLY
```

sin dos operandos:

```text
AEL-RUNTIME-STACK-001
```

El Runtime debe abortar de forma segura.

---

## 47. TYPE SAFETY EN RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TYPE SAFETY EN RUNTIME

Aunque el Analyzer valide:

```text
M2 * COP/M2
```

el Runtime debe asumir que un Artifact puede haber sido:

- corrupto;
- manipulado;
- generado por una versión incompatible.

Por eso debe verificar invariantes durante la ejecución.

---

## 48. CONTROL DE FLUJO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CONTROL DE FLUJO

Un `SI` puede compilarse conceptualmente:

```ael
SI activo ENTONCES
    RETORNAR 100
SINO
    RETORNAR 0
FIN
```

a:

```text
LOAD_LOCAL activo
JUMP_IF_FALSE L1

PUSH_CONSTANT 100
RETURN

L1:
PUSH_CONSTANT 0
RETURN
```

---

## 49. LABELS

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LABELS

Los labels son conceptos del IR.

El Artifact puede resolverlos a offsets numéricos.

Ejemplo:

```text
JUMP_IF_FALSE 8
```

en lugar de:

```text
JUMP_IF_FALSE ELSE_BLOCK
```

---

## 50. JUMP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

JUMP VALIDATION

El ArtifactVerifier debe verificar:

```text
jump target >= 0
jump target < instructionCount
```

No permitir saltos fuera del Artifact.

---

## 51. LOOP

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LOOP

Un `MIENTRAS` puede compilarse:

```text
L0:
    evaluar condición
    JUMP_IF_FALSE L1
    cuerpo
    JUMP L0
L1:
```

El Runtime debe contabilizar las instrucciones.

Esto permite detener loops infinitos.

---

## 52. MAX INSTRUCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

MAX INSTRUCTIONS

Cada instrucción ejecutada incrementa:

```text
instructionsExecuted
```

Si:

```text
instructionsExecuted > maxInstructions
```

el Runtime genera:

```text
AEL-RUNTIME-INSTRUCTION_LIMIT
```

---

## 53. MAX EXECUTION TIME

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

MAX EXECUTION TIME

El Runtime debe controlar tiempo de ejecución.

Si excede:

```text
maxExecutionTime
```

se genera:

```text
AEL-RUNTIME-TIME_LIMIT
```

El mecanismo concreto debe evitar depender únicamente de timers poco fiables.

---

## 54. FUNCTION CALL DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

FUNCTION CALL DEPTH

Las Functions V1 deberían ser preferentemente operaciones registradas y no permitir recursión arbitraria.

Si en el futuro existe recursión:

```text
maxCallDepth
```

será obligatorio.

---

## 55. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT

El Artifact es el producto final compilado.

Conceptualmente:

```text
Artifact
├── formatVersion
├── languageVersion
├── runtimeVersion
├── ruleId
├── ruleVersion
├── entryPoint
├── constants
├── locals
├── contracts
├── functions
├── instructions
├── dependencies
├── metadata
└── integrity
```

---

## 56. ARTIFACT FORMAT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT FORMAT VERSION

Ejemplo:

```text
artifactFormatVersion = 1
```

No confundir con:

```text
ruleVersion = 7
```

ni:

```text
runtimeVersion = 1.2
```

---

## 57. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

LANGUAGE VERSION

El Artifact debe declarar con qué versión de lenguaje fue construido.

Ejemplo:

```text
languageVersion = 1.0
```

---

## 58. RUNTIME VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

RUNTIME VERSION

Debe declarar la versión mínima o compatible del Runtime.

Ejemplo:

```text
runtimeVersion = 1.0
```

El Verifier debe comprobar compatibilidad.

---

## 59. RULE ID

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

RULE ID

Debe existir un identificador estable de la regla.

Ejemplo:

```text
ruleId = UUID
```

La versión cambia.

El `ruleId` no.

---

## 60. RULE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

RULE VERSION

Ejemplo:

```text
ruleId:
abc

version:
9
```

La versión publicada es inmutable.

---

## 61. DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

DEPENDENCIES

El Artifact debe declarar:

```text
contracts
functions
runtime
language
```

de los que depende.

Ejemplo:

```json
{
  "contracts": [
    {
      "id": "UNIT.AREA_PRIVATE",
      "version": "1"
    }
  ],
  "functions": [
    {
      "id": "REDONDEAR_DINERO",
      "version": "2"
    }
  ]
}
```

---

## 62. SOURCE HASH

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SOURCE HASH

El Artifact debe incluir un hash del Source.

Ejemplo conceptual:

```text
sourceHash = SHA-256(...)
```

Esto permite comprobar que el Artifact corresponde al Source registrado.

---

## 63. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT HASH

También debe existir un hash del Artifact.

Conceptualmente:

```text
artifactHash =
    SHA-256(canonicalArtifact)
```

La serialización debe ser canónica.

---

## 64. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CANONICAL SERIALIZATION

No calcular el hash sobre JSON arbitrario cuya ordenación pueda variar.

Debe existir una representación canónica.

Por ejemplo:

```text
orden fijo de propiedades
normalización de strings
normalización de números
```

El mecanismo concreto puede definirse durante implementación, pero la propiedad debe mantenerse.

---

## 65. INTEGRIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

INTEGRIDAD

El Verifier debe poder comprobar:

```text
SourceHash
ArtifactHash
FormatVersion
RuntimeCompatibility
Dependencies
Instructions
```

---

## 66. ARTIFACT MUTATION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT MUTATION

Si alguien modifica:

```text
instructions
```

sin reconstruir el Artifact:

```text
artifactHash
```

dejará de coincidir.

Resultado:

```text
AEL-ARTIFACT-INTEGRITY
```

---

## 67. ARTIFACT VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT VERIFIER

El Verifier debe ejecutarse antes del Runtime.

Debe comprobar como mínimo:

```text
✓ formato
✓ versión
✓ hash
✓ instruction opcodes
✓ operandos
✓ constantes
✓ locals
✓ jump targets
✓ function references
✓ contract references
✓ limits
✓ entry point
```

---

## 68. OPCODES DESCONOCIDOS

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

OPCODES DESCONOCIDOS

Un opcode no reconocido debe provocar:

```text
AEL-ARTIFACT-OPCODE-001
```

Nunca ignorarlo.

---

## 69. OPERANDOS INVÁLIDOS

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

OPERANDOS INVÁLIDOS

Ejemplo:

```text
LOAD_LOCAL 999
```

cuando sólo existen 3 locals.

Debe rechazarse durante verificación.

---

## 70. CONSTANT INDEX INVÁLIDO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CONSTANT INDEX INVÁLIDO

Ejemplo:

```text
PUSH_CONSTANT 500
```

cuando existen 10 constantes.

Debe rechazarse.

---

## 71. FUNCTION ID INVÁLIDO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

FUNCTION ID INVÁLIDO

Si:

```text
CALL_FUNCTION functionId
```

no corresponde a una dependencia declarada:

```text
Artifact inválido
```

---

## 72. CONTRACT ID INVÁLIDO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CONTRACT ID INVÁLIDO

Igualmente:

```text
LOAD_CONTRACT unknownContract
```

no debe ejecutarse.

---

## 73. ENTRY POINT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ENTRY POINT

El Artifact tendrá un entry point.

Ejemplo:

```text
entryPoint = 0
```

El Verifier debe comprobar:

```text
0 <= entryPoint < instructionCount
```

---

## 74. TERMINACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TERMINACIÓN

Una regla ejecutable debe terminar mediante:

```text
RETURN
```

o una terminación controlada definida por el Runtime.

El Analyzer debe detectar rutas que no producen el retorno requerido.

---

## 75. TYPED INSTRUCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TYPED INSTRUCTIONS

Las instrucciones pueden incluir información de tipos para mejorar verificación.

Ejemplo conceptual:

```text
MULTIPLY
input:
    QUANTITY
    RATE

output:
    MONEY
```

La implementación puede inferirlo mediante el Artifact Type Table.

---

## 76. TYPE TABLE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TYPE TABLE

El Artifact puede incluir una tabla de tipos:

```text
typeTable
```

Ejemplo:

```text
0 → NUMBER
1 → MONEY<COP>
2 → QUANTITY<AREA,M2>
3 → RATE<COP/M2>
```

Esto facilita:

- verificación;
- debugging;
- trazabilidad.

---

## 77. DEBUG MAP

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

DEBUG MAP

El Artifact puede contener opcionalmente:

```text
instructionOffset
    ↓
sourceSpan
```

Ejemplo:

```text
instruction 8
→ línea 9, columna 14
```

Esto permitirá mostrar errores del Runtime directamente sobre el Source.

---

## 78. SOURCE MAP

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SOURCE MAP

El Builder podrá utilizar:

```text
sourceMap
```

para relacionar:

```text
Artifact
```

con:

```text
Source
```

Esto será especialmente útil para:

- debugging;
- ejecución paso a paso;
- trazas;
- diagnósticos.

---

## 79. TRACE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TRACE

El Runtime podrá producir una traza opcional:

```text
instruction
stack before
stack after
duration
sourceSpan
```

No debe habilitarse necesariamente en producción normal.

---

## 80. MODOS DEL RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

MODOS DEL RUNTIME

Se recomiendan:

```text
NORMAL
TRACE
DEBUG
```

V1 puede implementar:

```text
NORMAL
TRACE
```

y dejar DEBUG avanzado para una versión posterior.

---

## 81. TRACE EN PRODUCCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TRACE EN PRODUCCIÓN

No almacenar trazas completas de todas las ejecuciones por defecto.

El volumen podría ser enorme.

Debe existir una política explícita:

```text
trace = OFF
```

por defecto.

---

## 82. SERIALIZACIÓN DEL ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

SERIALIZACIÓN DEL ARTIFACT

El Artifact debe poder persistirse.

Una representación JSON puede utilizarse inicialmente.

Ejemplo simplificado:

```json
{
  "formatVersion": 1,
  "languageVersion": "1.0",
  "runtimeVersion": "1.0",
  "ruleId": "abc",
  "ruleVersion": 1,
  "entryPoint": 0,
  "instructions": [],
  "constants": [],
  "contracts": [],
  "functions": [],
  "dependencies": [],
  "integrity": {}
}
```

---

## 83. JSON VS BINARIO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

JSON VS BINARIO

V1 puede utilizar JSON como formato persistente inicial.

Ventajas:

- inspeccionable;
- depurable;
- fácil de auditar;
- fácil de versionar;
- sencillo de probar.

No optimizar prematuramente hacia binario.

---

## 84. COMPRESIÓN

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

COMPRESIÓN

No forma parte de V1.

Si los Artifacts crecen considerablemente, podrá incorporarse posteriormente.

---

## 85. ARTIFACT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT IMMUTABILITY

Una vez publicado:

```text
Artifact
```

es inmutable.

Si cambia el Source:

```text
nuevo Source
↓
nuevo Artifact
```

---

## 86. COMPATIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

COMPATIBILIDAD

El Runtime debe declarar qué versiones de Artifact soporta.

Ejemplo:

```text
Runtime 1.2
supports:
Artifact format 1
Language 1.x
```

---

## 87. BREAKING CHANGE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

BREAKING CHANGE

Si cambia la semántica de una instrucción:

```text
MULTIPLY
```

de forma incompatible, no reutilizar silenciosamente la misma versión.

Debe incrementarse la versión correspondiente.

---

## 88. VERSIONAMIENTO SEMÁNTICO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

VERSIONAMIENTO SEMÁNTICO

Se recomienda Semantic Versioning para componentes técnicos:

```text
MAJOR.MINOR.PATCH
```

Ejemplo:

```text
1.0.0
1.1.0
1.1.1
```

Las reglas de negocio mantienen su propio versionado.

---

## 89. REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

REPRODUCIBILIDAD

Para reproducir una ejecución:

```text
RuleVersion
+
SourceHash
+
ArtifactHash
+
Artifact
+
RuntimeVersion
+
ContractVersions
+
FunctionVersions
+
ExecutionContext/Snapshot
```

debe ser suficiente dentro de las políticas de persistencia de AQUILA.

---

## 90. NO DEPENDER DEL ESTADO GLOBAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

NO DEPENDER DEL ESTADO GLOBAL

El Artifact no debe depender de:

```text
variables globales
estado global mutable
locale del servidor
hora del servidor
random implícito
```

Si necesita fecha:

```text
Context/Contract
```

Si necesita datos:

```text
Provider
```

Si necesita aleatoriedad:

```text
no disponible en V1
```

---

## 91. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CONSTANT FOLDING

El compilador puede optimizar:

```ael
10 + 20
```

a:

```text
30
```

siempre que la operación sea determinista.

Esto es una optimización opcional.

---

## 92. OPTIMIZACIONES

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

OPTIMIZACIONES

V1 debe priorizar corrección.

Permitidas:

```text
constant folding
dead code detection
reducción de temporales
```

si no cambian la semántica.

No implementar optimizaciones agresivas sin benchmarks.

---

## 93. DEAD CODE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

DEAD CODE

El Analyzer puede detectar:

```ael
RETORNAR 100

DEFINIR x = 50
```

como código inalcanzable.

Debe generar:

```text
WARNING
```

no necesariamente ERROR.

---

## 94. ARTIFACT MINIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT MINIFICATION

No es necesaria en V1.

Debe conservarse suficiente información para:

- debugging;
- auditoría;
- diagnóstico;
- trazabilidad.

---

## 95. ERROR MODEL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ERROR MODEL

Errores del pipeline:

```text
AEL-LEX-xxx
AEL-PARSE-xxx
AEL-TYPE-xxx
AEL-DIMENSION-xxx
AEL-CONTRACT-xxx
AEL-FUNCTION-xxx
AEL-ARTIFACT-xxx
AEL-RUNTIME-xxx
AEL-MATH-xxx
```

El catálogo definitivo debe mantenerse centralizado.

---

## 96. COMPILATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

COMPILATION RESULT

El compilador debe devolver conceptualmente:

```text
CompilationResult
├── success
├── diagnostics[]
├── ast
├── typedAst
├── ir
└── artifact
```

No devolver Artifact si existen errores bloqueantes.

---

## 97. VALIDATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

VALIDATION RESULT

La validación de una regla puede devolver:

```text
ValidationResult
├── valid
├── diagnostics[]
├── dependencies[]
└── inferredType
```

---

## 98. ARTIFACT BUILD RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT BUILD RESULT

Conceptualmente:

```text
ArtifactBuildResult
├── artifact
├── sourceHash
├── artifactHash
├── dependencies
└── diagnostics
```

---

## 99. EXECUTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

EXECUTION RESULT

Conceptualmente:

```text
ExecutionResult
├── status
├── value
├── type
├── duration
├── instructionsExecuted
├── diagnostics
└── trace?
```

---

## 100. FLUJO COMPLETO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

FLUJO COMPLETO

La arquitectura completa queda:

```text
                 SOURCE
                   │
                   ▼
                 LEXER
                   │
                   ▼
                 TOKENS
                   │
                   ▼
                 PARSER
                   │
                   ▼
                  AST
                   │
                   ▼
               ANALYZER
                   │
          ┌────────┴────────┐
          │                 │
        ERROR              OK
          │                 │
          ▼                 ▼
      DIAGNOSTICS        TYPED AST
                              │
                              ▼
                              IR
                              │
                              ▼
                       ARTIFACT BUILDER
                              │
                              ▼
                           ARTIFACT
                              │
                              ▼
                       ARTIFACT VERIFIER
                              │
                       ┌──────┴──────┐
                       │             │
                    INVALID        VALID
                       │             │
                       ▼             ▼
                    ERROR         RUNTIME
                                     │
                                     ▼
                              EXECUTION RESULT
```

---

## 101. EJEMPLO COMPLETO

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

EJEMPLO COMPLETO

Source:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    UNIT.AREA_PRIVATE

DEFINIR tarifa =
    PARAMETER.TARIFA_M2

RETORNAR
    area * tarifa
```

AST:

```text
Rule(CUOTA_ADMIN)
│
├── VariableDeclaration(area)
│   └── ContractReference(UNIT.AREA_PRIVATE)
│
├── VariableDeclaration(tarifa)
│   └── ContractReference(PARAMETER.TARIFA_M2)
│
└── Return
    └── Multiply
        ├── Identifier(area)
        └── Identifier(tarifa)
```

---

## 102. TYPED AST

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TYPED AST

```text
area:
    QUANTITY
    dimension = AREA
    unit = M2

tarifa:
    QUANTITY
    dimension = MONEY / AREA
    unit = COP/M2

area * tarifa:
    MONEY
    currency = COP
```

---

## 103. IR

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

IR

```text
LOAD_CONTRACT UNIT.AREA_PRIVATE
STORE_LOCAL 0

LOAD_CONTRACT PARAMETER.TARIFA_M2
STORE_LOCAL 1

LOAD_LOCAL 0
LOAD_LOCAL 1

MULTIPLY

RETURN
```

---

## 104. ARTIFACT CONCEPTUAL

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

ARTIFACT CONCEPTUAL

```json
{
  "formatVersion": 1,
  "languageVersion": "1.0",
  "runtimeVersion": "1.0",
  "ruleId": "CUOTA_ADMIN",
  "ruleVersion": 1,
  "entryPoint": 0,
  "locals": [
    {
      "name": "area",
      "type": "QUANTITY"
    },
    {
      "name": "tarifa",
      "type": "QUANTITY"
    }
  ],
  "contracts": [
    {
      "id": "UNIT.AREA_PRIVATE",
      "version": "1"
    },
    {
      "id": "PARAMETER.TARIFA_M2",
      "version": "1"
    }
  ],
  "instructions": [
    ["LOAD_CONTRACT", 0],
    ["STORE_LOCAL", 0],
    ["LOAD_CONTRACT", 1],
    ["STORE_LOCAL", 1],
    ["LOAD_LOCAL", 0],
    ["LOAD_LOCAL", 1],
    ["MULTIPLY"],
    ["RETURN"]
  ]
}
```

Este JSON es únicamente ilustrativo. El formato definitivo deberá normalizarse antes de producción.

---

## 105. EJECUCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

EJECUCIÓN

Contexto:

```text
UNIT.AREA_PRIVATE
=
120.50 M2
```

```text
PARAMETER.TARIFA_M2
=
4500 COP/M2
```

Runtime:

```text
LOAD_CONTRACT
→ 120.50 M2

STORE_LOCAL 0

LOAD_CONTRACT
→ 4500 COP/M2

STORE_LOCAL 1

LOAD_LOCAL 0

LOAD_LOCAL 1

MULTIPLY
→ 542250 COP

RETURN
```

Resultado:

```text
542250 COP
```

---

## 106. CRITERIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CRITERIO DE SEGURIDAD

El Runtime nunca debe aceptar un Artifact solamente porque tenga JSON válido.

Debe ser:

```text
JSON válido
+
estructura válida
+
versiones compatibles
+
hash válido
+
opcodes válidos
+
operandos válidos
+
referencias válidas
+
límites válidos
```

---

## 107. TESTS OBLIGATORIOS

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

TESTS OBLIGATORIOS

El Artifact/IR debe probar:

```text
✓ compilación básica
✓ variables
✓ Contracts
✓ Functions
✓ aritmética
✓ comparaciones
✓ condiciones
✓ loops
✓ listas
✓ retorno
✓ source maps
✓ hashes
✓ integridad
✓ opcode inválido
✓ operand inválido
✓ jump inválido
✓ function inválida
✓ contract inválido
✓ Artifact incompatible
```

---

## 108. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_AST_IR_Artifact 4.md

CRITERIO DE CIERRE

Este documento se considera implementable cuando:

```text
✓ AST definido
✓ Typed AST definido
✓ Symbol Table definida
✓ Scope definido
✓ IR definido
✓ Instruction Set definido
✓ Stack Model definido
✓ Artifact Model definido
✓ Hashing definido
✓ Verifier definido
✓ Versioning definido
✓ Source Mapping definido
✓ Execution Result definido
✓ errores definidos
```

---

## 109. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OBJETIVO

Definir:

```text
Semantic IR
 ↓
Compiler
 ↓
Artifact
 ↓
Canonical serialization
 ↓
Hash
 ↓
Verification
 ↓
Runtime
```

---

## 110. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

RESPONSABILIDADES

El Artifact Compiler debe:

```text
validar invariantes del IR
normalizar representación
generar Artifact
calcular hash
registrar dependencias
registrar capabilities
registrar metadata de compatibilidad
```

---

## 111. NO RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO RESPONSABILIDADES

No debe:

```text
consultar datos de negocio
ejecutar Providers
ejecutar la Rule
publicar automáticamente
modificar PostgreSQL
```

---

## 112. INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

INPUT

```text
SemanticIR
CompilerContext
```

---

## 113. OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OUTPUT

```ts
CompileArtifactResult
```

con:

```text
artifact
diagnostics
```

---

## 114. ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT

Conceptualmente:

```ts
interface AELArtifact {
  formatVersion: string
  languageVersion: string
  compilerVersion: string
  ruleVersion: string
  sourceHash: string
  artifactHash: string
  dependencies: ArtifactDependency[]
  capabilities: string[]
  instructions: Instruction[]
  metadata: ArtifactMetadata
}
```

Los nombres definitivos pueden adaptarse al código real.

---

## 115. ARTIFACT NO ES SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT NO ES SOURCE

El Artifact no debe depender de:

```text
source text
```

para ejecutar.

Puede conservar:

```text
sourceHash
```

como trazabilidad.

---

## 116. ARTIFACT NO ES AST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT NO ES AST

El Runtime no debe interpretar directamente:

```text
AST
```

salvo que una decisión explícita del diseño lo establezca.

La unidad ejecutable es:

```text
Artifact / bytecode / IR ejecutable
```

---

## 117. VERSIONES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

VERSIONES

Separar:

```text
languageVersion
compilerVersion
artifactFormatVersion
runtimeCompatibility
ruleVersion
```

No mezclar todos en un único número.

---

## 118. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LANGUAGE VERSION

Representa:

```text
semántica del lenguaje AEL
```

Ejemplo:

```text
1.0
```

---

## 119. COMPILER VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPILER VERSION

Representa:

```text
implementación del Compiler
```

Ejemplo:

```text
1.0.3
```

---

## 120. ARTIFACT FORMAT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT FORMAT VERSION

Representa:

```text
estructura binaria/serializada del Artifact
```

Ejemplo:

```text
1
```

---

## 121. RUNTIME COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

RUNTIME COMPATIBILITY

El Artifact debe declarar la versión mínima compatible:

```text
runtimeMinVersion
```

y opcionalmente:

```text
runtimeMaxVersion
```

si la política lo requiere.

---

## 122. RULE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

RULE VERSION

El Artifact debe estar asociado a:

```text
RuleVersion
```

inmutable después de publicación.

---

## 123. SOURCE HASH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

SOURCE HASH

Calcular sobre una representación canónica del Source.

Ejemplo:

```text
SHA-256
```

---

## 124. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT HASH

Calcular sobre:

```text
canonical artifact payload
```

excluyendo el propio campo:

```text
artifactHash
```

para evitar circularidad.

---

## 125. HASH ALGORITHM

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

HASH ALGORITHM

Recomendación:

```text
SHA-256
```

salvo política criptográfica posterior.

---

## 126. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CANONICAL SERIALIZATION

El Artifact debe tener una serialización determinista.

Mismo Artifact lógico:

```text
same bytes
```

---

## 127. JSON CANÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

JSON CANÓNICO

Si se usa JSON, definir:

```text
property ordering
number representation
string encoding
array ordering
omitted/default fields
```

No depender simplemente de:

```text
JSON.stringify(object)
```

sin una política de canonicalización.

---

## 128. UTF-8

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

UTF-8

La serialización debe utilizar:

```text
UTF-8
```

de forma documentada.

---

## 129. NUMBERS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NUMBERS

No usar números binarios ambiguos para valores financieros.

Artifact debe conservar:

```text
decimal strings
```

cuando corresponda.

---

## 130. DEPENDENCIES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEPENDENCIES

Cada dependency debe conservar:

```text
type
code
version
hash
```

si el modelo lo requiere.

---

## 131. CONTRACT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CONTRACT DEPENDENCY

Ejemplo:

```text
CONTRACT
PROPERTY.AREA_PRIVATE
version 1
```

---

## 132. FUNCTION DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

FUNCTION DEPENDENCY

Ejemplo:

```text
FUNCTION
REDONDEAR_DINERO
version 1
```

---

## 133. DEPENDENCY SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEPENDENCY SNAPSHOT

El Artifact debe representar la versión exacta utilizada durante compilación.

No almacenar:

```text
latest
```

como dependencia ejecutable.

---

## 134. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CAPABILITIES

El Artifact contiene:

```text
requiredCapabilities
```

ordenadas de forma canónica.

---

## 135. CAPABILITY IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CAPABILITY IMMUTABILITY

Una capability requerida forma parte de la identidad semántica del Artifact.

---

## 136. INSTRUCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

INSTRUCTIONS

El Artifact debe contener instrucciones ejecutables.

Ejemplos:

```text
LOAD_LITERAL
LOAD_LOCAL
STORE_LOCAL
LOAD_CONTRACT
CALL_FUNCTION
UNARY_OP
BINARY_OP
JUMP_IF_FALSE
JUMP
RETURN
```

---

## 137. INSTRUCTION MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

INSTRUCTION MODEL

Conceptualmente:

```ts
interface Instruction {
  opcode: Opcode
  operands: readonly Operand[]
}
```

---

## 138. OPCODE REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OPCODE REGISTRY

Mantener lista cerrada:

```text
Opcode
```

No permitir opcodes arbitrarios desde Source.

---

## 139. OPCODE VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OPCODE VERSIONING

Agregar un opcode nuevo puede requerir:

```text
artifact format revision
runtime compatibility update
```

---

## 140. OPERANDS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OPERANDS

Los operands deben ser:

```text
typed
validated
bounded
```

---

## 141. CONSTANT POOL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CONSTANT POOL

Para optimizar Artifact:

```text
constants[]
```

puede almacenar:

```text
strings
numbers
money metadata
quantity metadata
```

---

## 142. CONSTANT DEDUPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CONSTANT DEDUPLICATION

Duplicados idénticos pueden deduplicarse.

La deduplicación debe ser determinista.

---

## 143. LOCAL TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LOCAL TABLE

Artifact puede contener:

```text
locals[]
```

para variables de Rule.

---

## 144. LOCAL INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LOCAL INDEX

Cada local debe tener índice estable:

```text
0
1
2
...
```

---

## 145. NO RUNTIME NAME LOOKUP

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO RUNTIME NAME LOOKUP

Runtime no debe resolver:

```text
"total"
```

por string en cada ejecución.

Debe utilizar índices compilados.

---

## 146. CONTRACT REFERENCES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CONTRACT REFERENCES

Las referencias a Contracts deben estar compiladas a:

```text
dependency index
```

---

## 147. FUNCTION REFERENCES

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

FUNCTION REFERENCES

Las Functions deben estar compiladas a:

```text
dependency index
```

---

## 148. RUNTIME LOOKUP

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

RUNTIME LOOKUP

Runtime resolverá:

```text
dependency index
→ provider contract/function
```

según registry snapshot compatible.

---

## 149. NO DYNAMIC SOURCE INTERPRETATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO DYNAMIC SOURCE INTERPRETATION

Runtime no debe hacer:

```text
eval()
new Function()
```

ni equivalentes.

---

## 150. SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

SECURITY

Artifact debe ser:

```text
data
```

no:

```text
executable JavaScript
```

---

## 151. NO USER CODE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO USER CODE

AEL V1 no debe generar:

```text
arbitrary JavaScript
```

desde Source.

---

## 152. JUMPS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

JUMPS

Para condicionales:

```text
JUMP_IF_FALSE
JUMP
```

deben utilizar destinos numéricos validados.

---

## 153. JUMP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

JUMP VALIDATION

Compiler debe verificar:

```text
target exists
target in range
no malformed control flow
```

---

## 154. STACK MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

STACK MODEL

Si Runtime utiliza stack machine:

```text
operand stack
```

debe existir una política clara de tipos y profundidad.

---

## 155. STACK DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

STACK DEPTH

Compiler puede calcular:

```text
maxStackDepth
```

cuando sea posible.

---

## 156. MAX STACK

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

MAX STACK

Artifact puede declarar:

```text
maxStackDepth
```

para runtime enforcement.

---

## 157. LOCAL COUNT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LOCAL COUNT

Artifact puede declarar:

```text
localCount
```

---

## 158. INSTRUCTION COUNT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

INSTRUCTION COUNT

Artifact puede declarar:

```text
instructionCount
```

---

## 159. RESOURCE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

RESOURCE LIMITS

Artifact puede declarar límites derivados:

```text
maxInstructions
maxStackDepth
maxLocals
maxProviderCalls
```

según política.

---

## 160. LIMIT SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LIMIT SOURCE

No permitir que Source pueda aumentar arbitrariamente límites de seguridad.

Los límites máximos pertenecen a:

```text
platform policy
```

---

## 161. COMPILER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPILER VALIDATION

Antes de producir Artifact:

```text
IR valid
opcodes valid
operands valid
dependencies valid
capabilities valid
limits valid
```

---

## 162. IR → ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

IR → ARTIFACT

El compilador transforma:

```text
LoadContract
```

en:

```text
LOAD_CONTRACT dependencyIndex
```

---

## 163. IR → LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

IR → LOCAL

```text
LoadLocal(name)
```

se convierte en:

```text
LOAD_LOCAL index
```

---

## 164. IR → FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

IR → FUNCTION

```text
CallFunction(code,args)
```

se convierte en:

```text
CALL_FUNCTION dependencyIndex argumentCount
```

---

## 165. IR → RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

IR → RETURN

```text
Return(value)
```

se convierte en:

```text
RETURN
```

---

## 166. TYPE METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

TYPE METADATA

Cada instruction puede incorporar metadata de tipo sólo si aporta:

```text
runtime validation
debugging
optimization
```

No duplicar información innecesariamente.

---

## 167. DEBUG MAP

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEBUG MAP

Opcionalmente Artifact puede contener:

```text
instruction → SourceSpan
```

para diagnostics de Runtime.

---

## 168. DEBUG MAP

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEBUG MAP

Ejemplo:

```text
instruction 12
→ line 4 column 8
```

---

## 169. PRODUCTION DEBUG

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PRODUCTION DEBUG

El debug map puede ser:

```text
retained
compressed
externalized
```

según necesidades de almacenamiento.

---

## 170. ERROR LOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ERROR LOCATION

Si Runtime detecta:

```text
division by zero
```

puede informar:

```text
source span
```

si el debug map está disponible.

---

## 171. ARTIFACT METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT METADATA

Metadata mínima:

```text
ruleId
ruleVersionId
languageVersion
compilerVersion
createdAt
```

---

## 172. CREATED_AT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CREATED_AT

`createdAt` no debe entrar en el hash si se pretende que dos compilaciones semánticamente idénticas produzcan el mismo Artifact hash.

---

## 173. BUILD METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

BUILD METADATA

Información como:

```text
build machine
CI run id
compiler invocation
```

debe mantenerse separada de la identidad semántica.

---

## 174. REPRODUCIBLE BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

REPRODUCIBLE BUILD

Mismo:

```text
source
compiler version
language version
dependency snapshots
compiler configuration
```

debe producir:

```text
same artifact payload
same artifact hash
```

---

## 175. NON-DETERMINISTIC METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NON-DETERMINISTIC METADATA

No incluir en payload hashable:

```text
timestamps
random IDs
machine hostname
process ID
```

---

## 176. ARTIFACT ID

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT ID

Diferenciar:

```text
artifactId
```

de:

```text
artifactHash
```

---

## 177. ARTIFACT ID

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT ID

Puede ser UUID técnico para persistencia.

---

## 178. ARTIFACT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT HASH

Representa integridad del contenido canónico.

---

## 179. ARTIFACT VERIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT VERIFICATION

Runtime debe verificar como mínimo:

```text
format supported
language supported
hash valid
opcode valid
limits valid
dependencies compatible
```

---

## 180. TAMPER DETECTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

TAMPER DETECTION

Si Artifact bytes fueron modificados:

```text
hash mismatch
```

debe impedir ejecución.

---

## 181. SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

SIGNATURE

Firma criptográfica puede añadirse posteriormente.

No es requisito mínimo si hash integrity + trusted storage son suficientes para V1.

---

## 182. SIGNED ARTIFACT FUTURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

SIGNED ARTIFACT FUTURE

Arquitectura preparada para:

```text
signature
signingKeyId
signatureAlgorithm
```

sin hacerlos obligatorios en MVP.

---

## 183. ARTIFACT STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT STORAGE

El Artifact puede almacenarse:

```text
object storage
```

y metadata en:

```text
PostgreSQL
```

---

## 184. DATABASE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DATABASE

PostgreSQL debe almacenar:

```text
artifact metadata
hash
storage location
version
```

No necesariamente todo el payload binario.

---

## 185. ARTIFACT BLOB

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT BLOB

El payload puede almacenarse:

```text
Supabase Storage
```

o equivalente.

---

## 186. STORAGE IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

STORAGE IMMUTABILITY

Una vez publicado:

```text
artifact blob
```

no debe sobrescribirse.

---

## 187. NEW ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NEW ARTIFACT

Un cambio genera:

```text
new RuleVersion
new Artifact
new hash
```

---

## 188. ARTIFACT REUSE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT REUSE

El mismo Artifact puede ejecutarse muchas veces.

---

## 189. EXECUTION INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

EXECUTION INPUT

Runtime recibe:

```text
artifact
execution context
```

---

## 190. NO RECOMPILE ON EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO RECOMPILE ON EXECUTION

Execution path:

```text
load artifact
verify
execute
```

No:

```text
load source
compile
execute
```

---

## 191. PUBLISHING

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PUBLISHING

PublicationService puede hacer:

```text
compile
verify
persist artifact
publish rule version
```

en una transacción lógica segura.

---

## 192. PUBLICATION ATOMICITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PUBLICATION ATOMICITY

Nunca marcar:

```text
PUBLISHED
```

si Artifact no está disponible y verificable.

---

## 193. ARTIFACT AVAILABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT AVAILABILITY

Debe existir una garantía:

```text
published version
→ retrievable artifact
```

---

## 194. ROLLBACK

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ROLLBACK

Rollback no modifica Artifact.

Selecciona una:

```text
previous published RuleVersion
```

---

## 195. ARTIFACT RETENTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT RETENTION

Artifacts publicados deben conservarse mientras sean necesarios para:

```text
historical executions
audit
reproducibility
```

---

## 196. GARBAGE COLLECTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

GARBAGE COLLECTION

No eliminar automáticamente Artifacts históricos sin policy explícita.

---

## 197. EXECUTION REPRODUCIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

EXECUTION REPRODUCIBILITY

Una ejecución histórica debe poder identificar:

```text
artifactHash
runtimeVersion
dependency versions
```

---

## 198. DEPENDENCY DRIFT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEPENDENCY DRIFT

Si Contract actual cambió:

```text
old Artifact
```

debe seguir resolviendo la versión compatible/snapshot requerida.

---

## 199. SNAPSHOT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

SNAPSHOT POLICY

Definir si Runtime utiliza:

```text
immutable registry snapshot
```

o:

```text
version-pinned provider
```

Recomendación:

```text
version-pinned
```

---

## 200. FUNCTION IMPLEMENTATION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

FUNCTION IMPLEMENTATION VERSION

No basta:

```text
Function name
```

Debe conocerse:

```text
function version
implementation compatibility
```

---

## 201. CONTRACT IMPLEMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CONTRACT IMPLEMENTATION

Misma regla:

```text
Contract code
Contract version
provider compatibility
```

---

## 202. ARTIFACT COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT COMPATIBILITY MATRIX

Debe existir una matriz conceptual:

```text
Artifact Format
Language Version
Runtime Version
Provider Contract Version
Function Version
```

---

## 203. COMPATIBILITY FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPATIBILITY FAILURE

Ejemplo:

```text
AEL-ARTIFACT-001
Artifact format is not supported by this Runtime.
```

---

## 204. HASH FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

HASH FAILURE

```text
AEL-ARTIFACT-002
Artifact integrity verification failed.
```

---

## 205. DEPENDENCY FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEPENDENCY FAILURE

```text
AEL-ARTIFACT-003
Required dependency version is unavailable.
```

---

## 206. INVALID OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

INVALID OPCODE

```text
AEL-ARTIFACT-004
Artifact contains an unsupported opcode.
```

---

## 207. LIMIT FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LIMIT FAILURE

```text
AEL-ARTIFACT-005
Artifact exceeds Runtime limits.
```

---

## 208. ARTIFACT SCHEMA

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT SCHEMA

Si se usa JSON, ejemplo conceptual:

```json
{
  "formatVersion": "1",
  "languageVersion": "1.0",
  "compilerVersion": "1.0.0",
  "ruleVersion": "1",
  "sourceHash": "sha256:...",
  "dependencies": [],
  "capabilities": [],
  "constants": [],
  "locals": [],
  "instructions": [],
  "limits": {},
  "metadata": {}
}
```

---

## 209. HASHABLE PAYLOAD

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

HASHABLE PAYLOAD

El hash debe calcularse sobre:

```text
formatVersion
languageVersion
compilerVersion
ruleVersion
sourceHash
dependencies
capabilities
constants
locals
instructions
limits
semantic metadata
```

excluyendo:

```text
artifactHash
volatile metadata
```

según canonicalization policy.

---

## 210. ARTIFACT FORMAT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT FORMAT

El formato inicial puede ser:

```text
canonical JSON
```

para facilidad de debugging.

Posteriormente puede existir:

```text
binary format
```

si performance/size lo justifican.

---

## 211. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

V1 RECOMMENDATION

Comenzar con:

```text
canonical JSON Artifact
```

pero mantener:

```text
ArtifactCodec
```

como abstracción.

---

## 212. ARTIFACT CODEC

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT CODEC

```ts
interface ArtifactCodec {
  encode(artifact: AELArtifact): Uint8Array
  decode(bytes: Uint8Array): AELArtifact
}
```

---

## 213. CODEC VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CODEC VALIDATION

`decode()` debe validar:

```text
schema
types
required fields
bounds
```

---

## 214. TRUST BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

TRUST BOUNDARY

Un Artifact cargado desde Storage es:

```text
untrusted input
```

hasta verificarlo.

---

## 215. VALIDATION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

VALIDATION ORDER

Recomendación:

```text
decode
 ↓
schema validation
 ↓
format validation
 ↓
hash verification
 ↓
dependency compatibility
 ↓
opcode validation
 ↓
limit validation
 ↓
execute
```

---

## 216. NO PARTIAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO PARTIAL EXECUTION

Nunca comenzar ejecución antes de terminar:

```text
artifact validation
```

---

## 217. COMPILER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPILER TESTS

Probar:

```text
same source → same hash
changed source → changed hash
changed dependency → changed hash
changed instruction → changed hash
```

---

## 218. HASH TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

HASH TEST

```text
artifact
→ encode
→ hash
```

debe ser estable.

---

## 219. ROUND TRIP TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ROUND TRIP TEST

```text
artifact
→ encode
→ decode
→ encode
```

debe producir:

```text
same canonical bytes
```

---

## 220. TAMPER TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

TAMPER TEST

Modificar un byte:

```text
decode/verify
```

debe fallar.

---

## 221. COMPATIBILITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPATIBILITY TEST

Artifact generado por Compiler compatible:

```text
Runtime accepts
```

---

## 222. INCOMPATIBILITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

INCOMPATIBILITY TEST

Artifact con formato futuro:

```text
Runtime rejects cleanly
```

---

## 223. OPCODE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OPCODE TEST

Unknown opcode:

```text
rejected
```

---

## 224. LIMIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

LIMIT TEST

Artifact con:

```text
instructionCount > max
```

debe rechazarse.

---

## 225. DEPENDENCY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEPENDENCY TEST

Dependency inexistente:

```text
execution blocked
```

---

## 226. GOLDEN ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

GOLDEN ARTIFACT

Crear fixture:

```text
fixtures/artifacts/
```

con Artifact canónico.

---

## 227. GOLDEN HASH

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

GOLDEN HASH

Guardar:

```text
expected artifact hash
```

para detectar cambios accidentales.

---

## 228. GOLDEN UPDATE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

GOLDEN UPDATE

Actualizar golden hashes sólo cuando exista:

```text
intentional format/semantic change
```

---

## 229. REPRODUCIBLE BUILD TEST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

REPRODUCIBLE BUILD TEST

Ejecutar dos compilaciones independientes:

```text
compile A
compile B
```

y comparar:

```text
artifact bytes
artifact hash
```

---

## 230. COMPILER CONFIGURATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPILER CONFIGURATION

Toda configuración que cambie semántica debe entrar en:

```text
artifact identity
```

---

## 231. NON-SEMANTIC COMPILER CONFIG

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NON-SEMANTIC COMPILER CONFIG

Configuraciones de logging/debug no deben alterar:

```text
artifact hash
```

si no cambian el Artifact.

---

## 232. DEBUG ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DEBUG ARTIFACT

Puede existir una variante:

```text
debug map
```

pero debe definirse si forma parte o no del hash.

Recomendación:

```text
debug map included only if runtime diagnostics require it
```

y documentar la política.

---

## 233. ARTIFACT INSPECTION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT INSPECTION

Crear herramienta:

```text
ael artifact inspect
```

o equivalente.

Debe mostrar:

```text
version
hash
dependencies
capabilities
limits
instructions
```

sin ejecutar el Artifact.

---

## 234. ARTIFACT DISASSEMBLER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT DISASSEMBLER

Herramienta futura:

```text
ael artifact disassemble
```

para debugging.

---

## 235. NO SOURCE LEAK

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

NO SOURCE LEAK

La inspección del Artifact no debe exponer secretos porque AEL no debe contenerlos.

---

## 236. ARTIFACT VALIDATOR

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT VALIDATOR

Crear utilidad:

```text
validateArtifact(bytes)
```

reutilizable por:

```text
API
Worker
Runtime
CI
```

---

## 237. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT CACHE

Runtime puede cachear Artifacts verificados por:

```text
artifactHash
```

---

## 238. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

CACHE INVALIDATION

No requiere TTL semántico si la clave es:

```text
immutable artifactHash
```

---

## 239. MEMORY CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

MEMORY CACHE

Puede mantener:

```text
verified artifact
```

en memoria.

---

## 240. DISTRIBUTED CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

DISTRIBUTED CACHE

No es requisito V1.

---

## 241. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

OBSERVABILITY

Compilación debe registrar:

```text
compile duration
artifact size
instruction count
dependency count
```

sin incluir Source sensible en logs.

---

## 242. COMPILER METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

COMPILER METRICS

Métricas:

```text
ael_compile_total
ael_compile_errors_total
ael_compile_duration
ael_artifact_size
```

---

## 243. RUNTIME METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

RUNTIME METRICS

Runtime posteriormente:

```text
artifact_load_total
artifact_verification_failures
```

---

## 244. SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

SECURITY

Nunca ejecutar:

```text
eval
Function constructor
dynamic import from user source
```

como consecuencia del Artifact.

---

## 245. ARTIFACT AS DATA

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ARTIFACT AS DATA

La arquitectura debe permitir auditar:

```text
exact instructions
```

sin ejecutar código arbitrario.

---

## 246. PUBLICATION CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PUBLICATION CHECKLIST

Antes de publicar:

```text
[ ] AST valid
[ ] Semantic analysis passed
[ ] IR valid
[ ] Artifact generated
[ ] Artifact encoded
[ ] Hash calculated
[ ] Artifact verified
[ ] Dependencies pinned
[ ] Capabilities recorded
[ ] Limits valid
[ ] Storage persisted
[ ] Metadata persisted
[ ] Publication transaction complete
```

---

## 247. ROLLBACK CHECKLIST

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

ROLLBACK CHECKLIST

```text
[ ] previous RuleVersion exists
[ ] previous Artifact exists
[ ] previous Artifact verifies
[ ] dependencies compatible
[ ] publication pointer updated
```

---

## 248. EXIT CRITERIA — AEL-ARTIFACT-COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

EXIT CRITERIA — AEL-ARTIFACT-COMPILER

```text
✓ Semantic IR accepted
✓ Artifact model implemented
✓ Opcode model implemented
✓ Constant pool implemented
✓ Local table implemented
✓ Dependency table implemented
✓ Capability table implemented
✓ Limits represented
✓ Canonical serialization implemented
✓ SHA-256 integrity implemented
✓ Decode validation implemented
✓ Artifact verification implemented
✓ Compatibility checks implemented
✓ Reproducible compilation verified
✓ Tamper detection verified
✓ Golden Artifact tests pass
✓ No arbitrary code execution
✓ No infrastructure dependency
```

---

## 249. FINAL PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

FINAL PIPELINE

```text
SOURCE
  ↓
LEXER
  ↓
PARSER
  ↓
AST
  ↓
ANALYZER
  ↓
SEMANTIC IR
  ↓
ARTIFACT COMPILER
  ↓
CANONICAL ARTIFACT
  ↓
SHA-256
  ↓
VERIFIED ARTIFACT
  ↓
PUBLISH
  ↓
RUNTIME
```

---

## 250. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PRINCIPIO DE INMUTABILIDAD

Una vez publicado:

```text
Artifact A
```

no se modifica.

Un cambio produce:

```text
Artifact B
```

---

## 251. PRINCIPIO DE REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PRINCIPIO DE REPRODUCIBILIDAD

Debe ser posible demostrar:

```text
Source
+
Compiler
+
Language
+
Dependencies
→
Artifact
```

de manera determinista.

---

## 252. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Semantic_IR_Artifact_Compiler 27.md

PRINCIPIO DE SEGURIDAD

El Runtime ejecuta:

```text
instrucciones controladas
```

no:

```text
código generado arbitrariamente
```

---

## 253. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

OBJETIVO

Definir:

```text
Artifact
Header
Version
Instructions
Opcodes
Constant Pool
Dependency Tables
Type Metadata
Entry Point
Source Mapping
Provenance
Integrity
Verification
Compatibility
Serialization
```

---

## 254. PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PIPELINE

```text
Source
 ↓
Lexer / Parser
 ↓
AST
 ↓
Semantic Analysis
 ↓
Type Analysis
 ↓
Control Flow Analysis
 ↓
Semantic IR
 ↓
Compiler
 ↓
Artifact
 ↓
Verifier
 ↓
Runtime
```

---

## 255. QUÉ ES ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

QUÉ ES ARTIFACT

Artifact es el resultado compilado y verificable de una Rule AEL.

Contiene suficiente información para:

```text
identificar
validar
resolver dependencias
ejecutar
auditar
```

la Rule.

---

## 256. QUÉ NO ES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

QUÉ NO ES

Artifact no es:

```text
Source AEL
JavaScript
SQL
AST editable
bytecode arbitrario del sistema operativo
```

---

## 257. PROPIEDADES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PROPIEDADES

Debe ser:

```text
determinista
versionado
portable
verificable
inmutable
serializable
```

---

## 258. IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

IMMUTABILITY

Una vez publicado:

```text
Artifact
```

es inmutable.

Una nueva compilación produce:

```text
nuevo Artifact
```

---

## 259. ARTIFACT ID

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT ID

Cada Artifact publicado debe tener:

```text
artifactId
```

estable.

---

## 260. ARTIFACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT VERSION

Debe existir:

```text
artifactFormatVersion
```

para la estructura del Artifact.

---

## 261. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

LANGUAGE VERSION

Debe existir:

```text
languageVersion
```

para la semántica AEL utilizada.

---

## 262. COMPILER VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

COMPILER VERSION

Debe conservarse:

```text
compilerVersion
```

para provenance.

---

## 263. RUNTIME COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

RUNTIME COMPATIBILITY

Artifact debe declarar o permitir determinar:

```text
minimumRuntimeVersion
```

---

## 264. HEADER

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

HEADER

El Artifact debe comenzar con un header identificable.

Conceptualmente:

```text
magic
artifactFormatVersion
languageVersion
flags
metadataOffset
instructionOffset
```

---

## 265. MAGIC

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

MAGIC

Debe existir una firma constante para identificar:

```text
AEL Artifact
```

Ejemplo conceptual:

```text
AELA
```

El valor definitivo puede cambiar durante implementación.

---

## 266. FLAGS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

FLAGS

Flags pueden indicar:

```text
debug
sourceMap
deterministic
compressed
```

según soporte.

---

## 267. HEADER VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

HEADER VALIDATION

Verifier debe comprobar:

```text
magic
format version
offsets
lengths
flags
```

---

## 268. SECTION MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SECTION MODEL

Artifact puede organizarse lógicamente en:

```text
Header
Metadata
Constants
Types
Contracts
Functions
Instructions
SourceMap
Integrity
```

---

## 269. SECTION LENGTHS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SECTION LENGTHS

Cada sección debe tener longitud verificable.

---

## 270. NO OUT-OF-BOUNDS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO OUT-OF-BOUNDS

Offsets y lengths nunca pueden apuntar fuera del Artifact.

---

## 271. CONSTANT POOL

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT POOL

Valores estáticos deben almacenarse en:

```text
constantPool
```

---

## 272. CONSTANT TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT TYPES

Puede contener:

```text
Number
String
Boolean
Null
Money
Quantity
```

cuando estén completamente determinados en compile-time.

---

## 273. CONSTANT DEDUPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT DEDUPLICATION

Constants idénticas pueden compartir índice.

---

## 274. CONSTANT INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT INDEX

Instructions referencian:

```text
constantIndex
```

en lugar de repetir valores.

---

## 275. STRING CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

STRING CONSTANT

Debe almacenarse con:

```text
length
UTF-8 bytes
```

o representación equivalente definida por serializer.

---

## 276. NUMBER CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NUMBER CONSTANT

Debe preservar:

```text
exact decimal value
```

---

## 277. MONEY CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

MONEY CONSTANT

Debe preservar:

```text
amount
currency
```

---

## 278. QUANTITY CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

QUANTITY CONSTANT

Debe preservar:

```text
amount
dimension
unit
```

---

## 279. DEPENDENCY TABLES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEPENDENCY TABLES

Artifact debe separar:

```text
contractDependencies
functionDependencies
```

---

## 280. CONTRACT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONTRACT DEPENDENCY

Conceptualmente:

```json
{
  "code": "PROPERTY.AREA_PRIVATE",
  "version": "1.0.0",
  "definitionHash": "..."
}
```

---

## 281. FUNCTION DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

FUNCTION DEPENDENCY

Conceptualmente:

```json
{
  "name": "REDONDEAR_DINERO",
  "version": "1.0.0",
  "definitionHash": "..."
}
```

---

## 282. DEPENDENCY INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEPENDENCY INDEX

Instructions utilizan:

```text
dependencyIndex
```

para resolver dependencias eficientemente.

---

## 283. NO NAME LOOKUP

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO NAME LOOKUP

Runtime no debe resolver cada instruction mediante búsqueda textual.

---

## 284. TYPE TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

TYPE TABLE

Artifact puede contener referencias a:

```text
typeId
```

para verificaciones.

---

## 285. TYPE REFERENCES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

TYPE REFERENCES

Cada dependency puede asociarse con:

```text
declared result type
```

---

## 286. INSTRUCTION STREAM

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INSTRUCTION STREAM

El Artifact contiene:

```text
instruction stream
```

---

## 287. OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

OPCODE

Cada instruction comienza con:

```text
opcode
```

---

## 288. OPCODE DESIGN

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

OPCODE DESIGN

Opcodes deben ser:

```text
compact
stable
versioned
```

---

## 289. CORE OPCODES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CORE OPCODES

V1 mínimo:

```text
LOAD_LITERAL
LOAD_CONTRACT
LOAD_FUNCTION_ARGUMENT
CALL_FUNCTION
ADD
SUBTRACT
MULTIPLY
DIVIDE
MODULO
NEGATE
POSITIVE
EQUAL
NOT_EQUAL
LESS_THAN
LESS_EQUAL
GREATER_THAN
GREATER_EQUAL
NOT
JUMP
JUMP_IF_FALSE
JUMP_IF_TRUE
RETURN
```

---

## 290. OPTIONAL OPCODES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

OPTIONAL OPCODES

Pueden existir:

```text
LOAD_NULL
DUP
POP
```

si simplifican el Compiler/Runtime.

---

## 291. NO DYNAMIC OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO DYNAMIC OPCODE

No permitir:

```text
EXECUTE_CODE
EVAL
CALL_DYNAMIC
```

en V1.

---

## 292. LOAD_LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

LOAD_LITERAL

Operación:

```text
constantIndex → stack
```

---

## 293. LOAD_CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

LOAD_CONTRACT

Operación:

```text
contractDependencyIndex → stack
```

---

## 294. CALL_FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CALL_FUNCTION

Operación:

```text
functionDependencyIndex
argumentCount
→ result
```

---

## 295. CALL_FUNCTION STACK EFFECT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CALL_FUNCTION STACK EFFECT

Antes:

```text
[arg1, arg2, ..., argN]
```

Después:

```text
[result]
```

---

## 296. BINARY OPERATOR

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

BINARY OPERATOR

Antes:

```text
[left, right]
```

Después:

```text
[result]
```

---

## 297. UNARY OPERATOR

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

UNARY OPERATOR

Antes:

```text
[value]
```

Después:

```text
[result]
```

---

## 298. JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

JUMP

No altera stack.

---

## 299. JUMP_IF_FALSE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

JUMP_IF_FALSE

Consume:

```text
Boolean
```

---

## 300. JUMP_IF_TRUE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

JUMP_IF_TRUE

Consume:

```text
Boolean
```

---

## 301. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

RETURN

Consume:

```text
declared result
```

y termina ejecución.

---

## 302. ENTRY POINT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ENTRY POINT

Artifact debe declarar:

```text
entryPoint
```

---

## 303. ENTRY POINT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ENTRY POINT

V1 normalmente:

```text
instruction 0
```

pero debe existir metadata explícita.

---

## 304. CODE LENGTH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CODE LENGTH

Verifier debe validar:

```text
entryPoint < instructionCount
```

---

## 305. JUMP TARGET

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

JUMP TARGET

Todos los jumps deben apuntar a:

```text
valid instruction boundary
```

---

## 306. INSTRUCTION BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INSTRUCTION BOUNDARY

No permitir jump a:

```text
middle of operand
```

---

## 307. INSTRUCTION DECODING

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INSTRUCTION DECODING

Cada opcode debe conocer exactamente:

```text
operand width
operand type
```

---

## 308. UNKNOWN OPCODE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

UNKNOWN OPCODE

Debe producir:

```text
AEL-ARTIFACT-002
```

---

## 309. MALFORMED OPERAND

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

MALFORMED OPERAND

Debe producir:

```text
AEL-ARTIFACT-003
```

---

## 310. STACK VERIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

STACK VERIFICATION

Verifier calcula:

```text
stack depth
stack types
```

para cada instruction.

---

## 311. STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

STACK UNDERFLOW

Artifact inválido si:

```text
instruction consumes more values
```

que los disponibles.

---

## 312. STACK TYPE MISMATCH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

STACK TYPE MISMATCH

Artifact inválido si:

```text
ADD
```

recibe:

```text
Money<COP>
Quantity<M2>
```

---

## 313. BRANCH MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

BRANCH MERGE

Todos los predecessors deben producir:

```text
compatible stack shape
```

---

## 314. BRANCH TYPE MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

BRANCH TYPE MERGE

Tipos deben coincidir o utilizar:

```text
commonType
```

según semantic analysis.

---

## 315. TERMINATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

TERMINATION

Cada execution path debe terminar en:

```text
RETURN
```

o una terminación válida definida por Artifact semantics.

---

## 316. FALL-THROUGH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

FALL-THROUGH

No permitir ejecutar bytes/instructions fuera del stream.

---

## 317. CONTROL FLOW VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONTROL FLOW VALIDATION

Verifier debe detectar:

```text
invalid jump
unreachable malformed block
stack mismatch
missing return
```

según policy.

---

## 318. CONSTANT INDEX VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT INDEX VALIDATION

Todo:

```text
constantIndex
```

debe existir.

---

## 319. DEPENDENCY INDEX VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEPENDENCY INDEX VALIDATION

Todo:

```text
dependencyIndex
```

debe existir.

---

## 320. TYPE INDEX VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

TYPE INDEX VALIDATION

Todo:

```text
typeId
```

referenciado debe existir.

---

## 321. SOURCE MAP

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SOURCE MAP

Artifact puede incluir:

```text
instruction → SourceSpan
```

---

## 322. SOURCEMAP ENTRY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SOURCEMAP ENTRY

Conceptualmente:

```json
{
  "instruction": 14,
  "line": 3,
  "column": 8,
  "length": 18
}
```

---

## 323. DEBUG METADATA

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEBUG METADATA

Puede incluir:

```text
rule name
source hash
source version
```

---

## 324. NO SOURCE REQUIRED

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO SOURCE REQUIRED

Artifact no necesita contener Source AEL completo.

---

## 325. SOURCE HASH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SOURCE HASH

Debe conservar:

```text
sourceHash
```

para provenance.

---

## 326. SOURCE PRIVACY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SOURCE PRIVACY

El Source puede mantenerse fuera del Artifact cuando existan requisitos de confidencialidad.

---

## 327. PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PROVENANCE

Metadata recomendada:

```text
artifactId
ruleId
ruleVersion
sourceHash
compilerVersion
languageVersion
artifactFormatVersion
createdAt
```

---

## 328. CONTRACT PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONTRACT PROVENANCE

Registrar:

```text
contract code
version
definitionHash
```

---

## 329. FUNCTION PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

FUNCTION PROVENANCE

Registrar:

```text
function name
version
definitionHash
```

---

## 330. REGISTRY HASH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

REGISTRY HASH

Puede incluir:

```text
contractRegistryHash
functionRegistryHash
typeRegistryHash
```

---

## 331. OPERATOR SEMANTICS VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

OPERATOR SEMANTICS VERSION

Debe poder determinarse desde:

```text
languageVersion
```

---

## 332. INTEGRITY HASH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INTEGRITY HASH

Artifact debe incluir una integridad criptográfica.

---

## 333. HASH ALGORITHM

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

HASH ALGORITHM

Recomendación:

```text
SHA-256
```

o algoritmo equivalente aprobado por plataforma.

---

## 334. HASH SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

HASH SCOPE

Hash debe cubrir todas las secciones relevantes excepto el propio campo de hash.

---

## 335. SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SIGNATURE

Firma digital puede añadirse posteriormente.

---

## 336. V1 SIGNATURE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

V1 SIGNATURE

No es requisito obligatorio de V1 si el Artifact se transporta dentro de infraestructura confiable.

---

## 337. TRUST MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

TRUST MODEL

Antes de ejecutar:

```text
Artifact source must be trusted
```

y:

```text
Artifact must pass verification
```

---

## 338. ARTIFACT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT IMMUTABILITY

Una vez hash generado:

```text
no modificar bytes
```

---

## 339. SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SERIALIZATION

Debe existir un serializer canónico.

---

## 340. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CANONICAL SERIALIZATION

El mismo Artifact lógico debe producir:

```text
same serialized representation
```

---

## 341. DETERMINISTIC SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DETERMINISTIC SERIALIZATION

Orden de:

```text
metadata
constants
dependencies
```

debe ser determinista.

---

## 342. NO RANDOM IDS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO RANDOM IDS

Compilation no debe insertar valores aleatorios dentro del Artifact que afecten reproducibilidad, salvo campos de identidad separados.

---

## 343. ARTIFACT ID

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT ID

Puede generarse a partir de:

```text
content hash
```

o estrategia equivalente.

---

## 344. REPRODUCIBLE BUILD

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

REPRODUCIBLE BUILD

Mismo:

```text
Source
registries
compiler
configuration
```

debe producir Artifact equivalente.

---

## 345. BUILD CONFIG

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

BUILD CONFIG

Si afecta semantics:

```text
debe formar parte de provenance
```

---

## 346. COMPRESSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

COMPRESSION

Opcional.

Si se comprime:

```text
hash semantics
```

debe estar claramente definido.

---

## 347. ENCODING

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ENCODING

Metadata textual debe utilizar:

```text
UTF-8
```

---

## 348. INTEGER ENCODING

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INTEGER ENCODING

Offsets y counts deben utilizar una codificación canónica.

---

## 349. ENDIANNESS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ENDIANNESS

Si se usa formato binario:

```text
endianness
```

debe ser fija.

---

## 350. FORMAT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

FORMAT VERSION

Cambiar layout incompatible requiere:

```text
new artifactFormatVersion
```

---

## 351. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

BACKWARD COMPATIBILITY

Runtime puede soportar varios Artifact formats:

```text
V1
V2
```

si la plataforma lo requiere.

---

## 352. LANGUAGE COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

LANGUAGE COMPATIBILITY

Artifact sólo puede ejecutarse con Runtime compatible con:

```text
languageVersion
```

---

## 353. MINIMUM RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

MINIMUM RUNTIME

Si:

```text
runtime < minimumRuntimeVersion
```

rechazar.

---

## 354. MAXIMUM RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

MAXIMUM RUNTIME

Si se define:

```text
maximumRuntimeVersion
```

también debe validarse.

---

## 355. DEPENDENCY COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEPENDENCY COMPATIBILITY

Cada Contract/Function dependency debe resolverse a:

```text
exact pinned version
```

o una implementación compatible explícitamente aprobada.

---

## 356. NO LATEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO LATEST

Artifact nunca debe depender de:

```text
latest
```

---

## 357. PROVIDER VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PROVIDER VERSION

Provider implementation puede evolucionar sin cambiar Artifact si mantiene:

```text
semantic compatibility
```

---

## 358. PROVIDER MISMATCH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PROVIDER MISMATCH

Si no existe implementación compatible:

```text
execution unavailable
```

---

## 359. PRELOAD VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PRELOAD VALIDATION

Runtime puede verificar dependencies antes de comenzar.

---

## 360. ARTIFACT VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT VERIFIER

Conceptualmente:

```ts
interface ArtifactVerifier {
  verify(artifact: Artifact): VerificationResult
}
```

---

## 361. VERIFICATION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

VERIFICATION RESULT

```ts
type VerificationResult = { valid: true } | { valid: false; errors: ArtifactVerificationError[] }
```

---

## 362. VERIFIER RESPONSIBILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

VERIFIER RESPONSIBILITIES

Debe validar:

```text
format
header
sections
indices
opcodes
stack
types
control flow
dependencies
integrity
```

---

## 363. VERIFIER NO SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

VERIFIER NO SIDE EFFECTS

Verifier no debe:

```text
consultar datos de negocio
```

---

## 364. VERIFIER NO PROVIDER EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

VERIFIER NO PROVIDER EXECUTION

No ejecutar:

```text
Contract Provider
Function Provider
```

durante verification.

---

## 365. VERIFIER DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

VERIFIER DETERMINISM

Mismo Artifact:

```text
same verification result
```

---

## 366. RUNTIME TRUST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

RUNTIME TRUST

Runtime puede asumir:

```text
verified structural invariants
```

pero mantener defensas críticas.

---

## 367. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEFENSE IN DEPTH

Runtime debe verificar nuevamente:

```text
dangerous invariants
```

cuando el coste sea bajo.

---

## 368. ARTIFACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT CACHE

Artifacts verificados pueden cachearse por:

```text
artifactHash
```

---

## 369. NO CROSS-TENANT SEMANTIC ISSUE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO CROSS-TENANT SEMANTIC ISSUE

Artifact puede ser global si sus dependencies y authorization se evalúan por ExecutionContext.

---

## 370. TENANT-SPECIFIC ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

TENANT-SPECIFIC ARTIFACT

Si posteriormente existen Artifacts tenant-specific:

```text
tenantId
```

debe formar parte de metadata y cache key.

---

## 371. EXECUTION INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

EXECUTION INPUT

Artifact debe declarar:

```text
input schema
```

si la Rule recibe inputs.

---

## 372. INPUT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INPUT TYPE

Cada input debe tener:

```text
name
type
required
```

---

## 373. INPUT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INPUT VALIDATION

Runtime debe validar inputs antes de ejecutar.

---

## 374. INPUT SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INPUT SOURCE

Inputs vienen de:

```text
trusted application layer
```

no de modificaciones internas del Artifact.

---

## 375. NO ARBITRARY INPUT ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO ARBITRARY INPUT ACCESS

Artifact sólo puede acceder a:

```text
declared inputs
```

---

## 376. INPUT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INPUT DEPENDENCY

Compiler registra:

```text
input references
```

---

## 377. CONSTANT POOL SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT POOL SECURITY

Strings/values del Artifact no deben interpretarse como:

```text
code
SQL
JavaScript
```

---

## 378. NO SQL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO SQL EXECUTION

Artifact no contiene SQL ejecutable.

---

## 379. NO NETWORK

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO NETWORK

Artifact no contiene instrucciones directas de red.

---

## 380. NO FILESYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO FILESYSTEM

Artifact no contiene instrucciones directas de filesystem.

---

## 381. CAPABILITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CAPABILITY BOUNDARY

Toda operación externa pasa por:

```text
Provider / Function Provider
```

---

## 382. ARTIFACT SIZE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT SIZE LIMIT

Runtime debe imponer:

```text
maxArtifactSize
```

---

## 383. INSTRUCTION LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INSTRUCTION LIMIT

Debe existir:

```text
maxInstructions
```

según RuntimePolicy.

---

## 384. CONSTANT LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CONSTANT LIMIT

Puede existir:

```text
maxConstants
```

---

## 385. DEPENDENCY LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEPENDENCY LIMIT

Puede existir:

```text
maxDependencies
```

---

## 386. SOURCE MAP LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SOURCE MAP LIMIT

Debug metadata no debe permitir:

```text
unbounded memory allocation
```

---

## 387. ERROR CODES

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ERROR CODES

```text
AEL-ARTIFACT-001 Invalid artifact
AEL-ARTIFACT-002 Unknown opcode
AEL-ARTIFACT-003 Invalid operand
AEL-ARTIFACT-004 Invalid index
AEL-ARTIFACT-005 Stack mismatch
AEL-ARTIFACT-006 Invalid jump
AEL-ARTIFACT-007 Integrity failure
AEL-ARTIFACT-008 Version incompatibility
```

---

## 388. GOLDEN ARTIFACTS

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

GOLDEN ARTIFACTS

Mantener fixtures:

```text
minimal artifact
literal artifact
contract artifact
function artifact
conditional artifact
nested conditional artifact
```

---

## 389. ROUND-TRIP TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ROUND-TRIP TEST

```text
Artifact
→ serialize
→ deserialize
→ verify
```

debe preservar semantics.

---

## 390. HASH TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

HASH TEST

Serialización canónica debe producir:

```text
same hash
```

para Artifact equivalente.

---

## 391. CORRUPTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

CORRUPTION TEST

Modificar:

```text
byte
```

debe provocar:

```text
integrity failure
```

si el hash cubre esa sección.

---

## 392. INVALID OPCODE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INVALID OPCODE TEST

Artifact con opcode desconocido:

```text
rejected
```

---

## 393. INVALID JUMP TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INVALID JUMP TEST

Jump fuera del stream:

```text
rejected
```

---

## 394. STACK TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

STACK TEST

Artifact con underflow:

```text
rejected
```

---

## 395. DEPENDENCY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

DEPENDENCY TEST

Dependency index inexistente:

```text
rejected
```

---

## 396. VERSION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

VERSION TEST

Artifact incompatible:

```text
rejected before execution
```

---

## 397. SECURITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

SECURITY TEST

Artifact intentando:

```text
dynamic eval
```

debe ser imposible por formato.

---

## 398. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PERFORMANCE TEST

Verifier debe escalar aproximadamente:

```text
O(n)
```

con tamaño del Artifact.

---

## 399. NO RECURSIVE VERIFIER

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

NO RECURSIVE VERIFIER

Verifier debe evitar recursion profunda sobre input controlado.

---

## 400. MAXIMUM DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

MAXIMUM DEPTH

Debe existir límite para estructuras metadata anidadas.

---

## 401. ARTIFACT API

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT API

Conceptualmente:

```ts
interface Artifact {
  header: ArtifactHeader
  constants: ConstantPool
  types: TypeTable
  contracts: ContractDependency[]
  functions: FunctionDependency[]
  instructions: Instruction[]
  sourceMap?: SourceMap
  provenance: ArtifactProvenance
  integrity: ArtifactIntegrity
}
```

---

## 402. INSTRUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

INSTRUCTION

Conceptualmente:

```ts
interface Instruction {
  opcode: Opcode
  operands: readonly number[]
}
```

---

## 403. ARTIFACT PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT PROVENANCE

```ts
interface ArtifactProvenance {
  artifactId: string
  ruleId: string
  ruleVersion: string
  sourceHash: string
  compilerVersion: string
  languageVersion: string
}
```

---

## 404. ARTIFACT INTEGRITY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT INTEGRITY

```ts
interface ArtifactIntegrity {
  algorithm: string
  hash: string
}
```

---

## 405. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

FINAL ARCHITECTURE

```text
                 AEL Source
                     │
                     ▼
                  Compiler
                     │
                     ▼
                  Artifact
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    Constants   Dependencies   Instructions
                                  │
                                  ▼
                               Verifier
                                  │
                           ┌──────┴──────┐
                           │             │
                         VALID         INVALID
                           │             │
                           ▼             ▼
                        Runtime       Reject
                           │
                           ▼
                       AELValue
```

---

## 406. ARTIFACT AS SECURITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT AS SECURITY BOUNDARY

Artifact no sólo es formato de ejecución.

Es también:

```text
security boundary
```

porque limita qué operaciones puede representar una Rule.

---

## 407. ARTIFACT AS PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT AS PROVENANCE

Permite demostrar:

```text
qué Rule
qué versión
qué Source
qué Contracts
qué Functions
qué Compiler
```

produjeron la ejecución.

---

## 408. ARTIFACT AS COMPATIBILITY BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

ARTIFACT AS COMPATIBILITY BOUNDARY

Permite controlar:

```text
Language
Compiler
Runtime
Provider
```

compatibility.

---

## 409. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PRINCIPIO DE INMUTABILIDAD

Una vez publicado:

```text
Artifact
```

no cambia.

---

## 410. PRINCIPIO DE VERIFICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PRINCIPIO DE VERIFICACIÓN

Nunca ejecutar:

```text
unverified Artifact
```

---

## 411. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PRINCIPIO DE DETERMINISMO

El mismo input lógico debe generar:

```text
equivalent Artifact
```

bajo el mismo toolchain.

---

## 412. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PRINCIPIO DE SEGURIDAD

Artifact no puede representar:

```text
arbitrary code execution
```

---

## 413. PRINCIPIO DE PORTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Artifact_Format_Bytecode_Specification 36.md

PRINCIPIO DE PORTABILIDAD

Artifact representa:

```text
semántica AEL
```

no:

```text
CPU
OS
JavaScript engine
```

---

## 414. REFERENCIAS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

REFERENCIAS

Implementa y consume:

```text
Documento 18 — Type System
Documento 43 — Error Model & Diagnostics
Documento 45 — Registry & Dependency Management
Documento 51 — Financial Types & Numeric Semantics
Documento 54 — Reference Architecture & Repository Structure
Documento 55 — Core Domain & Foundational Types
Documento 57 — Parser & Abstract Syntax Tree
Documento 58 — Semantic Analyzer & Type System Implementation
```

La ejecución será definida posteriormente; este documento no implementa Runtime.

---

## 415. OBJETIVO

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

OBJETIVO

Transformar:

```text
Typed Semantic Model
```

en:

```text
Verified-oriented IR
```

mediante:

```text
Semantic Model
    ↓
Lowering
    ↓
IR Module
```

---

## 416. PROPÓSITO DE IR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PROPÓSITO DE IR

La IR debe eliminar detalles sintácticos innecesarios y conservar únicamente información necesaria para:

```text
verification
optimization
serialization
execution
debugging
```

---

## 417. FRONTERA

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

FRONTERA

```text
AST
 ↓
Semantic Analysis
 ↓
Semantic Model
 ↓
IR Lowering
 ↓
IR
 ↓
Verifier
 ↓
Artifact
 ↓
Runtime
```

---

## 418. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

NO RESPONSABILIDAD

IR no debe:

```text
consultar database
ejecutar providers
resolver datos de tenant
hacer HTTP
persistir resultados
realizar una liquidación real
```

---

## 419. PACKAGE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PACKAGE

Ruta:

```text
packages/ael-ir/
```

Compiler lowering:

```text
packages/ael-compiler/
```

---

## 420. DEPENDENCIES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DEPENDENCIES

`ael-ir` puede depender de:

```text
ael-core
ael-types
```

El lowering puede consumir:

```text
ael-ast
ael-semantic
ael-ir
```

No debe depender de:

```text
ael-runtime
ael-persistence
API
Supabase
PostgreSQL
```

---

## 421. IR PRINCIPLE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR PRINCIPLE

La IR debe ser:

```text
explicit
typed
deterministic
serializable
verifiable
```

---

## 422. IR MODULE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR MODULE

Raíz conceptual:

```ts
interface IrModule {
  version: string
  functions: IrFunction[]
  constants: IrConstant[]
  metadata: IrMetadata
}
```

---

## 423. IR FUNCTION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR FUNCTION

```ts
interface IrFunction {
  id: string
  name: string
  parameters: IrParameter[]
  returnType: Type
  blocks: IrBlock[]
  entryBlock: string
}
```

---

## 424. IR BLOCK

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR BLOCK

Un block representa una secuencia lineal de instrucciones:

```ts
interface IrBlock {
  id: string
  instructions: IrInstruction[]
  terminator: IrTerminator
}
```

---

## 425. TERMINATOR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TERMINATOR

Un block siempre debe terminar mediante una instrucción de control:

```text
return
jump
branch
```

según la IR V1.

---

## 426. SSA

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SSA

V1 puede utilizar una representación temporal estilo SSA para simplificar:

```text
data flow
type checking
verification
```

Si se adopta SSA, cada temporal debe tener una única definición.

---

## 427. TEMPORALS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TEMPORALS

Conceptualmente:

```text
%0
%1
%2
```

representan valores producidos por instrucciones.

---

## 428. TEMPORAL TYPES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TEMPORAL TYPES

Cada temporal debe tener un tipo conocido:

```text
%0 : Integer
%1 : Decimal
%2 : Money
```

---

## 429. IR VALUE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR VALUE

Valores posibles:

```text
Constant
Temporary
Parameter
```

---

## 430. CONSTANTS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CONSTANTS

Los literales ya validados pueden convertirse a constantes IR.

Ejemplo:

```text
Decimal("0.19")
```

debe conservar exactitud.

---

## 431. NO FLOAT LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

NO FLOAT LOWERING

Un Decimal financiero nunca debe bajar automáticamente a:

```text
JavaScript number
```

---

## 432. IR INSTRUCTION CATEGORIES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR INSTRUCTION CATEGORIES

Inicialmente:

```text
Constant
Move
BinaryOp
UnaryOp
Call
Load
Store
MemberGet
IndexGet
CreateArray
CreateObject
```

Sólo incluir las instrucciones necesarias para V1.

---

## 433. BINARY OP

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BINARY OP

```text
BinaryOp {
  operator
  left
  right
  result
}
```

---

## 434. UNARY OP

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

UNARY OP

```text
UnaryOp {
  operator
  operand
  result
}
```

---

## 435. CALL

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CALL

```text
Call {
  target
  arguments[]
  result?
}
```

El target debe haber sido resuelto semánticamente.

---

## 436. EXTERNAL CALL

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

EXTERNAL CALL

Las llamadas a capabilities/contracts/providers deben distinguirse de llamadas puramente internas.

No se deben ejecutar durante lowering.

---

## 437. CAPABILITY REFERENCE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CAPABILITY REFERENCE

Una llamada externa puede representar:

```text
capabilityId
contractId
functionId
```

según el modelo definido anteriormente.

---

## 438. RETURN

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

RETURN

```text
Return {
  value?
}
```

---

## 439. JUMP

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

JUMP

```text
Jump {
  targetBlock
}
```

---

## 440. BRANCH

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BRANCH

```text
Branch {
  condition
  trueBlock
  falseBlock
}
```

---

## 441. BLOCK TERMINATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BLOCK TERMINATION

Un block sin terminator válido es:

```text
IR construction error
```

---

## 442. VARIABLE LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

VARIABLE LOWERING

Una declaración semántica:

```ael
let x = expression;
```

se transforma en:

```text
evaluate expression
assign temporary/storage
```

La IR no necesita conservar `let` como concepto sintáctico.

---

## 443. CONST LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CONST LOWERING

`const` puede convertirse en una definición que el verifier marque como inmutable.

No debe depender exclusivamente del frontend para garantizarlo.

---

## 444. EXPRESSION LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

EXPRESSION LOWERING

Cada expresión debe producir:

```text
value
```

o una secuencia de instrucciones cuyo resultado sea un value.

---

## 445. BINARY LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BINARY LOWERING

Ejemplo:

```ael
a + b
```

produce conceptualmente:

```text
%r = BinaryOp ADD %a, %b
```

---

## 446. PRECEDENCE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PRECEDENCE

La precedencia ya fue resuelta por Parser y Semantic Analyzer.

IR recibe la estructura final y no vuelve a interpretarla.

---

## 447. FUNCTION CALL LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

FUNCTION CALL LOWERING

```ael
calculate(base, rate)
```

se convierte en:

```text
%r = Call calculate(%base, %rate)
```

---

## 448. MEMBER LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

MEMBER LOWERING

```ael
unit.owner
```

puede convertirse en:

```text
%r = MemberGet %unit, "owner"
```

si el acceso no fue resuelto estáticamente.

---

## 449. INDEX LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INDEX LOWERING

```ael
items[index]
```

puede convertirse en:

```text
%r = IndexGet %items, %index
```

---

## 450. ARRAY LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

ARRAY LOWERING

```ael
[1, 2, 3]
```

produce una instrucción de construcción o una constante estructural según optimización.

---

## 451. OBJECT LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

OBJECT LOWERING

Object literals deben conservar:

```text
property names
property values
property order
```

cuando el orden sea semánticamente relevante.

---

## 452. IF LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IF LOWERING

```ael
if (condition) {
    A
} else {
    B
}
```

se transforma conceptualmente en:

```text
Branch condition, block_A, block_B
```

---

## 453. LOOP LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

LOOP LOWERING

```ael
for (item in items) {
    ...
}
```

debe convertirse a control flow explícito.

El límite de iteraciones será validado por etapas posteriores.

---

## 454. RETURN LOWERING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

RETURN LOWERING

```ael
return amount;
```

produce:

```text
Return %amount
```

---

## 455. TYPE ANNOTATIONS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TYPE ANNOTATIONS

Las anotaciones de tipo no necesitan permanecer como sintaxis en IR.

Su información relevante queda incorporada en:

```text
types
instructions
symbols
```

---

## 456. SYMBOL REFERENCES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SYMBOL REFERENCES

Después de semantic analysis, IR no debe depender de nombres ambiguos.

Preferir:

```text
SymbolId
FunctionId
TypeId
```

---

## 457. NAME RESOLUTION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

NAME RESOLUTION

No realizar resolución de nombres durante Runtime.

---

## 458. FUNCTION IDS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

FUNCTION IDS

Las Functions deben tener identificadores estables dentro del Artifact.

---

## 459. CONSTANT IDS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CONSTANT IDS

Las constantes compartidas pueden internarse y recibir:

```text
ConstantId
```

si aporta determinismo o compresión.

---

## 460. SOURCE MAP

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SOURCE MAP

Cada instrucción IR debe poder conservar referencia al source cuando sea útil:

```ts
sourceSpan?: SourceSpan
```

---

## 461. DEBUG INFORMATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DEBUG INFORMATION

El Artifact puede incluir:

```text
IR instruction → source span
```

para diagnostics Runtime.

---

## 462. IR METADATA

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR METADATA

Debe contener como mínimo:

```text
languageVersion
compilerVersion
irVersion
sourceHash
```

según el modelo de versionamiento existente.

---

## 463. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

REGISTRY SNAPSHOT

Cuando la compilación dependa de Registry, el Artifact debe asociar la versión/snapshot utilizada.

El mecanismo concreto se hereda de Documento 45.

---

## 464. DETERMINISM

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DETERMINISM

El mismo:

```text
Semantic Model
+
compiler configuration
+
registry snapshot
```

debe producir la misma IR canónica.

---

## 465. INSTRUCTION ORDER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INSTRUCTION ORDER

Las instrucciones deben tener orden determinista.

---

## 466. BLOCK ORDER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BLOCK ORDER

Los blocks deben recibir IDs deterministas.

No usar:

```text
random UUID
```

para IDs que formen parte del hash canónico.

---

## 467. TEMPORAL ORDER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TEMPORAL ORDER

Temporals deben generarse determinísticamente durante lowering.

---

## 468. CANONICAL IR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CANONICAL IR

La IR debe poder serializarse de forma canónica.

---

## 469. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CANONICAL SERIALIZATION

Debe eliminar:

```text
memory addresses
runtime timestamps
random IDs
environment-specific paths
```

---

## 470. IR HASH

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR HASH

El hash del Artifact podrá calcularse sobre la representación canónica.

No incluir información no determinista.

---

## 471. TYPE INFORMATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TYPE INFORMATION

La IR debe conservar suficiente información para que Verifier no necesite rehacer todo el Semantic Analysis.

---

## 472. TYPE SAFETY

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TYPE SAFETY

Cada instruction debe tener una firma tipada.

Ejemplo:

```text
ADD(Integer, Integer) → Integer
ADD(Decimal, Decimal) → Decimal
```

y las combinaciones permitidas por el Type System.

---

## 473. FINANCIAL OPERATIONS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

FINANCIAL OPERATIONS

Si:

```text
Money × Rate
```

es una operación válida, la IR debe representar la operación con su semántica tipada, no como:

```text
generic number multiplication
```

---

## 474. MONEY PRESERVATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

MONEY PRESERVATION

La información de Currency debe permanecer disponible donde sea requerida para verificación.

---

## 475. ROUNDING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

ROUNDING

La IR no debe introducir rounding implícito.

Si existe una operación de rounding:

```text
Round
```

debe ser explícita y tipada.

---

## 476. OVERFLOW

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

OVERFLOW

La IR debe conservar operaciones de forma que Runtime/Verifier pueda aplicar límites numéricos.

---

## 477. DIVISION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DIVISION

La división debe representar suficientemente:

```text
operand types
precision policy
```

si la semántica requiere una policy explícita.

---

## 478. SIDE EFFECTS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SIDE EFFECTS

Cada instruction/call debe poder clasificarse como:

```text
Pure
Read
Write
External
```

según el modelo de capabilities.

---

## 479. EFFECT METADATA

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

EFFECT METADATA

El Verifier puede utilizar esta información para impedir:

```text
unexpected side effects
```

---

## 480. PURE FUNCTIONS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PURE FUNCTIONS

Una Function marcada como pure no debe contener llamadas incompatibles con pureza.

---

## 481. EXTERNAL CALLS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

EXTERNAL CALLS

Las llamadas externas deben quedar claramente identificadas.

---

## 482. CAPABILITY BOUNDARY

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CAPABILITY BOUNDARY

IR debe representar la capability requerida, pero no concederla.

La autorización ocurre en las etapas correspondientes.

---

## 483. UNREACHABLE BLOCK

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

UNREACHABLE BLOCK

Puede existir:

```text
Unreachable
```

si el lowering o una optimización lo genera.

---

## 484. DEAD CODE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DEAD CODE

V1 no requiere optimización agresiva.

El compiler puede conservar código no ejecutable si el Verifier puede identificarlo.

---

## 485. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CONSTANT FOLDING

Puede implementarse posteriormente sobre IR.

Sólo debe aplicarse a operaciones:

```text
pure
deterministic
safe
```

---

## 486. NO PROVIDER EXECUTION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

NO PROVIDER EXECUTION

Nunca ejecutar Providers para evaluar una constante durante lowering.

---

## 487. NO DATABASE ACCESS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

NO DATABASE ACCESS

Lowering debe ser completamente offline respecto a datos de negocio.

---

## 488. IR VALIDATOR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR VALIDATOR

Crear:

```text
IrValidator
```

que valide invariantes estructurales.

---

## 489. IR VALIDATOR RULES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR VALIDATOR RULES

Como mínimo:

```text
all blocks have terminators
all block references exist
all temporals are defined before use
all instruction operands exist
all types are valid
all function references exist
```

---

## 490. SSA VALIDATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SSA VALIDATION

Si se adopta SSA:

```text
one definition per temporary
```

---

## 491. USE-BEFORE-DEF

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

USE-BEFORE-DEF

Debe ser error:

```text
AEL_IR_USE_BEFORE_DEF
```

---

## 492. INVALID BLOCK

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INVALID BLOCK

```text
AEL_IR_INVALID_BLOCK
```

---

## 493. INVALID TYPE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INVALID TYPE

```text
AEL_IR_INVALID_TYPE
```

---

## 494. INVALID REFERENCE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INVALID REFERENCE

```text
AEL_IR_INVALID_REFERENCE
```

---

## 495. INVALID TERMINATOR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INVALID TERMINATOR

```text
AEL_IR_INVALID_TERMINATOR
```

---

## 496. LOWERING ERROR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

LOWERING ERROR

Errores inesperados durante lowering:

```text
AEL_LOWERING_ERROR
```

No deben ocultar el nodo source que originó el problema.

---

## 497. LOWERING API

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

LOWERING API

Conceptualmente:

```ts
interface IrLowerer {
  lower(model: SemanticModel): LoweringResult
}
```

---

## 498. LOWERING RESULT

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

LOWERING RESULT

```ts
interface LoweringResult {
  module?: IrModule
  diagnostics: Diagnostic[]
}
```

---

## 499. IR BUILDER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR BUILDER

Puede existir un builder interno:

```text
IrBuilder
```

responsable de:

```text
blocks
temporals
instructions
terminators
```

---

## 500. BUILDER STATE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BUILDER STATE

El builder debe estar limitado a una compilación.

No compartir estado entre compilaciones.

---

## 501. FUNCTION LOWERER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

FUNCTION LOWERER

Puede existir:

```text
FunctionLowerer
```

para transformar cada Function.

---

## 502. EXPRESSION LOWERER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

EXPRESSION LOWERER

Debe transformar expresiones semánticamente tipadas a IR.

---

## 503. STATEMENT LOWERER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

STATEMENT LOWERER

Debe transformar statements a:

```text
instructions
control flow
```

---

## 504. BLOCK LOWERER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BLOCK LOWERER

Debe administrar:

```text
current block
successor blocks
```

---

## 505. PHI NODES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PHI NODES

Si se utiliza SSA, los valores provenientes de ramas deben reconciliarse mediante:

```text
Phi
```

o mecanismo equivalente.

---

## 506. PHI EXAMPLE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PHI EXAMPLE

Para:

```ael
if (condition) {
    x = 1;
} else {
    x = 2;
}
return x;
```

SSA conceptual:

```text
x1 = 1
x2 = 2
x3 = phi(x1, x2)
return x3
```

---

## 507. VARIABLE STORAGE

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

VARIABLE STORAGE

El diseño V1 debe preferir temporals/SSA para valores locales cuando sea posible.

---

## 508. MUTABLE VARIABLES

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

MUTABLE VARIABLES

Si el lenguaje soporta mutation, puede requerir:

```text
Store
Load
```

o lowering equivalente.

---

## 509. CONST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CONST

Las constantes pueden permanecer como valores inmutables.

---

## 510. CALL ABI

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CALL ABI

El formato exacto de llamadas Runtime se definirá posteriormente.

IR sólo necesita:

```text
target
arguments
return type
effect metadata
```

---

## 511. EXTERNAL CONTRACT CALL

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

EXTERNAL CONTRACT CALL

Debe identificar:

```text
contract/function
arguments
expected result type
required capability
```

sin realizar la llamada.

---

## 512. IR VERSION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR VERSION

Debe existir:

```text
IR_VERSION
```

independiente de:

```text
languageVersion
runtimeVersion
```

---

## 513. COMPATIBILITY

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

COMPATIBILITY

Runtime debe aceptar sólo IR versions compatibles.

---

## 514. IR MIGRATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR MIGRATION

Cambios incompatibles de IR requieren:

```text
version increment
```

y estrategia de migración o recompilación.

---

## 515. SERIALIZATION FORMAT

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SERIALIZATION FORMAT

V1 puede utilizar:

```text
JSON canonical
```

para debugging/intercambio inicial, siempre que los tipos complejos tengan representación explícita.

La representación binaria puede agregarse posteriormente.

---

## 516. JSON SAFETY

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

JSON SAFETY

No serializar:

```text
class instances
functions
closures
database handles
```

---

## 517. DECIMAL SERIALIZATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DECIMAL SERIALIZATION

Mantener:

```text
string exacta
```

---

## 518. MONEY SERIALIZATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md; Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

MONEY SERIALIZATION

Utilizar la representación definida en Documento 55.

---

## 519. TYPE SERIALIZATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

TYPE SERIALIZATION

Debe utilizar identificadores estables.

---

## 520. CANONICAL ORDER

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CANONICAL ORDER

Cuando se serialicen maps/objects:

```text
property order
```

debe ser determinista.

---

## 521. SOURCE PATHS

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

SOURCE PATHS

No incluir paths absolutos dependientes de máquina en el hash.

---

## 522. COMPILER CONFIGURATION

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

COMPILER CONFIGURATION

Sólo incluir en el Artifact las configuraciones que afecten semántica.

---

## 523. BUILD REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BUILD REPRODUCIBILITY

Dos máquinas con:

```text
same source
same compiler
same configuration
same registry snapshot
```

deben producir IR equivalente.

---

## 524. IR BASIC TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR BASIC TEST

Input:

```ael
let x = 10;
return x;
```

Expected conceptual IR:

```text
%0 = Const Integer(10)
Return %0
```

---

## 525. ARITHMETIC TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

ARITHMETIC TEST

```ael
let x = 10;
let y = 20;
return x + y;
```

Expected:

```text
%0 = Const 10
%1 = Const 20
%2 = Add %0, %1
Return %2
```

---

## 526. PRECEDENCE TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PRECEDENCE TEST

```ael
return a + b * c;
```

Expected IR preserves AST meaning:

```text
%0 = Mul b, c
%1 = Add a, %0
Return %1
```

---

## 527. BRANCH TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

BRANCH TEST

```ael
if (x > 0) {
    return x;
} else {
    return 0;
}
```

Expected control flow:

```text
entry
 └── Branch
      ├── then
      └── else
```

---

## 528. CALL TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CALL TEST

```ael
return calculate(x);
```

Expected:

```text
%0 = Call calculate(x)
Return %0
```

---

## 529. MONEY TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

MONEY TEST

```ael
let total = amount * rate;
```

If semantically typed as:

```text
Money × Rate → Money
```

the IR must retain that operation type.

---

## 530. CURRENCY TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

CURRENCY TEST

A semantically valid Money operation must preserve currency information needed by the verifier.

---

## 531. INVALID SEMANTIC MODEL

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

INVALID SEMANTIC MODEL

Lowering should not be invoked on a model containing blocking semantic errors.

---

## 532. ERROR POLICY

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

ERROR POLICY

If semantic diagnostics contain errors:

```text
lowering fails
```

unless compiler mode explicitly supports partial tooling output.

---

## 533. PARTIAL IR

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PARTIAL IR

Partial IR may be generated for IDE tooling, but it must never be accepted as an executable Artifact.

---

## 534. IR VALIDATION TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

IR VALIDATION TEST

Construct malformed IR manually and verify:

```text
IrValidator
```

rejects it.

---

## 535. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DETERMINISM TEST

Compile same Semantic Model multiple times.

Expected:

```text
canonical IR identical
```

---

## 536. HASH TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

HASH TEST

Canonical serialization must produce stable hash input.

---

## 537. RESOURCE TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

RESOURCE TEST

Large but valid programs must respect:

```text
maximum functions
maximum blocks
maximum instructions
```

according to compiler configuration.

---

## 538. DEEP CONTROL FLOW TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

DEEP CONTROL FLOW TEST

Test nested:

```text
if
for
if
```

without uncontrolled resource growth.

---

## 539. NO EXTERNAL SIDE EFFECT TEST

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

NO EXTERNAL SIDE EFFECT TEST

Lowering must succeed without:

```text
database
network
provider execution
```

---

## 540. PRINCIPIO DE VERIFICABILIDAD

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PRINCIPIO DE VERIFICABILIDAD

La IR debe ser suficientemente explícita para que el Verifier pueda responder:

```text
¿qué operaciones existen?
¿qué valores producen?
¿qué tipos utilizan?
¿qué capabilities requieren?
¿qué control flow existe?
¿qué límites deben aplicarse?
```

sin reconstruir el AST.

---

## 541. PRINCIPIO DE EJECUCIÓN

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PRINCIPIO DE EJECUCIÓN

Runtime recibirá posteriormente:

```text
Verified Artifact
```

no AST.

---

## 542. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Intermediate Representation & Compiler Lowering 59.md

PRINCIPIO DE DETERMINISMO

```text
Semantic Model
+
Compiler Config
+
Registry Snapshot
=
Canonical IR
```

---

## 543. REFERENCIAS

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

REFERENCIAS

Implementa y consume:

```text
Documento 43 — Error Model & Diagnostics
Documento 45 — Registry & Dependency Management
Documento 46 — Versioning & Compatibility
Documento 51 — Financial Types & Numeric Semantics
Documento 54 — Reference Architecture
Documento 55 — Core Domain & Foundational Types
Documento 59 — Intermediate Representation & Compiler Lowering
Documento 60 — Verifier & Static Safety Validation
```

---

## 544. OBJETIVO

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

OBJETIVO

Representar:

```text
Verified IR
+
metadata
+
integrity information
+
compatibility information
```

como:

```text
Verified Artifact
```

---

## 545. FRONTERA

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

FRONTERA

```text
Source
 ↓
Compiler
 ↓
IR
 ↓
Verifier
 ↓
Artifact
 ↓
Storage / Distribution
 ↓
Runtime
```

---

## 546. TRUST BOUNDARY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

TRUST BOUNDARY

El Runtime sólo debe aceptar:

```text
Artifact
```

que haya superado:

```text
verification
integrity validation
compatibility validation
```

---

## 547. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

NO RESPONSABILIDAD

Artifact no debe:

```text
ejecutar código
consultar database
resolver tenant
hacer HTTP
modificar IR
recalcular semantic analysis
```

---

## 548. PACKAGE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PACKAGE

```text
packages/ael-artifact/
```

---

## 549. ARTIFACT ROOT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT ROOT

Modelo conceptual:

```ts
interface Artifact {
  formatVersion: string
  languageVersion: string
  irVersion: string
  compilerVersion: string
  metadata: ArtifactMetadata
  dependencies: ArtifactDependency[]
  capabilities: CapabilityDeclaration[]
  verification: VerificationSnapshot
  payload: ArtifactPayload
  integrity: IntegrityMetadata
}
```

---

## 550. FORMAT VERSION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

FORMAT VERSION

`formatVersion` identifica la estructura del contenedor.

No debe confundirse con:

```text
languageVersion
irVersion
compilerVersion
```

---

## 551. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

LANGUAGE VERSION

Identifica la versión de AEL que produjo el Artifact.

---

## 552. IR VERSION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

IR VERSION

Identifica la versión de la representación intermedia incluida.

---

## 553. COMPILER VERSION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

COMPILER VERSION

Identifica el compiler que produjo el Artifact.

Debe ser informativo y no sustituye compatibility checks.

---

## 554. ARTIFACT METADATA

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT METADATA

Puede incluir:

```text
artifactId
name
description
createdAt
sourceHash
compilerBuild
```

Los campos que afecten determinismo deben distinguirse de metadata operacional.

---

## 555. ARTIFACT ID

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT ID

El identificador lógico no debe depender de:

```text
random UUID
```

si forma parte de la identidad canónica.

---

## 556. SOURCE HASH

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SOURCE HASH

Debe identificar exactamente el source compilado.

Formato recomendado:

```text
SHA-256
```

o el algoritmo aprobado por la plataforma.

---

## 557. SOURCE NORMALIZATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SOURCE NORMALIZATION

El source hash debe calcularse sobre una representación cuya normalización esté definida explícitamente.

No normalizar silenciosamente contenido semánticamente relevante.

---

## 558. PAYLOAD

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PAYLOAD

El payload contiene:

```text
canonical IR
```

o una representación equivalente definida por la versión del formato.

---

## 559. PAYLOAD SEPARATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PAYLOAD SEPARATION

Separar conceptualmente:

```text
metadata
verification
payload
integrity
```

para facilitar validación y evolución del formato.

---

## 560. VERIFICATION SNAPSHOT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VERIFICATION SNAPSHOT

Debe conservar suficiente evidencia de que el Artifact pasó el Verifier:

```text
verifierVersion
policyVersion
checks
resourceBudget
capabilities
registrySnapshot
```

según Documento 60.

---

## 561. VERIFICATION STATUS

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VERIFICATION STATUS

Un Artifact ejecutable debe indicar:

```text
verified
```

No debe existir una ruta normal que permita marcarlo manualmente como verified.

---

## 562. VERIFICATION PROVENANCE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VERIFICATION PROVENANCE

Registrar:

```text
who/what verified
when
with which policy
against which IR version
```

El timestamp de verification no debe formar parte del hash canónico si sólo es metadata operacional.

---

## 563. DEPENDENCIES

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEPENDENCIES

Un Artifact puede depender de:

```text
functions
contracts
rules
types
registry entries
```

según el modelo.

---

## 564. DEPENDENCY IDENTITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEPENDENCY IDENTITY

Cada dependency debe tener identidad estable:

```text
id
version
integrity
```

cuando aplique.

---

## 565. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

REGISTRY SNAPSHOT

Si el Artifact depende del Registry:

```text
registrySnapshotId
registrySnapshotHash
```

deben quedar asociados al Artifact.

---

## 566. NO LIVE DEPENDENCY RESOLUTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

NO LIVE DEPENDENCY RESOLUTION

Runtime no debe sustituir silenciosamente una dependencia por otra versión.

---

## 567. DEPENDENCY COMPATIBILITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEPENDENCY COMPATIBILITY

Antes de ejecutar debe verificarse:

```text
dependency exists
version compatible
integrity compatible
capability compatible
```

---

## 568. CAPABILITIES

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CAPABILITIES

Artifact debe declarar capabilities requeridas.

La lista debe derivarse de la IR/verificación.

---

## 569. CAPABILITY MINIMIZATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CAPABILITY MINIMIZATION

No incluir capabilities no utilizadas.

---

## 570. CAPABILITY ORDER

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CAPABILITY ORDER

Las capabilities deben serializarse en orden canónico.

---

## 571. CANONICAL SERIALIZATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CANONICAL SERIALIZATION

El Artifact debe tener una representación canónica:

```text
same logical artifact
=
same canonical bytes
```

---

## 572. JSON V1

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

JSON V1

Para V1 se recomienda:

```text
canonical JSON
```

como formato de interoperabilidad inicial.

La implementación binaria puede agregarse posteriormente sin cambiar la semántica del Artifact.

---

## 573. CANONICAL JSON RULES

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CANONICAL JSON RULES

Definir:

```text
UTF-8
no insignificant whitespace
stable property ordering
stable array ordering
normalized numeric representation
```

---

## 574. PROPERTY ORDER

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PROPERTY ORDER

El serializer debe controlar explícitamente el orden.

No depender del comportamiento accidental de una librería.

---

## 575. ARRAY ORDER

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARRAY ORDER

Arrays semánticos deben conservar orden.

Arrays declarativos sin orden semántico pueden ordenarse canónicamente si la especificación lo permite.

---

## 576. NUMERIC SERIALIZATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

NUMERIC SERIALIZATION

No utilizar floating point para valores financieros.

---

## 577. DECIMAL SERIALIZATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DECIMAL SERIALIZATION

Representar Decimal como:

```text
exact string
```

---

## 578. DATE/TIME SERIALIZATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DATE/TIME SERIALIZATION

Usar formato único definido por los tipos fundamentales.

No permitir formatos ambiguos.

---

## 579. NULL

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

NULL

Representar null de manera inequívoca.

---

## 580. BINARY DATA

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

BINARY DATA

Si V1 necesita bytes binarios:

```text
base64 canonical
```

o formato equivalente explícitamente definido.

---

## 581. SOURCE MAP

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SOURCE MAP

Los source spans pueden incluirse para debugging.

No deben introducir información no determinista.

---

## 582. DEBUG METADATA

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEBUG METADATA

Puede ser opcional:

```text
debugInfo
sourceMap
symbolNames
```

Debe diferenciarse de payload ejecutable.

---

## 583. HASH SCOPE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

HASH SCOPE

La integridad debe definirse sobre:

```text
canonical artifact content
```

excluyendo campos que explícitamente sean metadata operacional.

---

## 584. INTEGRITY METADATA

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

INTEGRITY METADATA

Conceptualmente:

```ts
interface IntegrityMetadata {
  algorithm: string
  contentHash: string
}
```

---

## 585. HASH ALGORITHM

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

HASH ALGORITHM

V1:

```text
SHA-256
```

salvo política criptográfica superior definida por plataforma.

---

## 586. HASH ENCODING

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

HASH ENCODING

Utilizar una representación estable:

```text
lowercase hexadecimal
```

o el encoding definido por la plataforma.

---

## 587. SELF-HASHING PROBLEM

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SELF-HASHING PROBLEM

El campo `contentHash` no debe incluirse a sí mismo en el contenido que hashea.

---

## 588. HASH INPUT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

HASH INPUT

Construir:

```text
artifactWithoutIntegrityHash
```

y calcular:

```text
SHA-256(canonicalBytes)
```

---

## 589. SIGNATURE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SIGNATURE

La firma digital puede agregarse como capa posterior:

```text
signature
keyId
algorithm
```

No es requisito mínimo del formato V1.

---

## 590. SIGNATURE SCOPE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SIGNATURE SCOPE

Si se agrega firma, debe cubrir la representación canónica completa definida por la política de firma.

---

## 591. TAMPER DETECTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

TAMPER DETECTION

Cualquier modificación del payload o campos cubiertos por integridad debe provocar:

```text
hash mismatch
```

---

## 592. ARTIFACT VALIDATOR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT VALIDATOR

Crear:

```text
ArtifactValidator
```

responsable de validar el contenedor antes del Runtime.

---

## 593. VALIDATION ORDER

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VALIDATION ORDER

Orden recomendado:

```text
1. format version
2. required fields
3. schema
4. canonical representation
5. integrity hash
6. dependency metadata
7. verification snapshot
8. compatibility
9. capability declarations
10. payload IR
```

---

## 594. FORMAT ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

FORMAT ERROR

```text
AEL_ARTIFACT_INVALID_FORMAT
```

---

## 595. SCHEMA ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SCHEMA ERROR

```text
AEL_ARTIFACT_SCHEMA_ERROR
```

---

## 596. HASH ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

HASH ERROR

```text
AEL_ARTIFACT_INTEGRITY_MISMATCH
```

---

## 597. UNVERIFIED ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

UNVERIFIED ERROR

```text
AEL_ARTIFACT_NOT_VERIFIED
```

---

## 598. VERSION ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VERSION ERROR

```text
AEL_ARTIFACT_INCOMPATIBLE_VERSION
```

---

## 599. DEPENDENCY ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEPENDENCY ERROR

```text
AEL_ARTIFACT_DEPENDENCY_MISMATCH
```

---

## 600. CAPABILITY ERROR

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CAPABILITY ERROR

```text
AEL_ARTIFACT_CAPABILITY_MISMATCH
```

---

## 601. ARTIFACT STATE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT STATE

Estados conceptuales:

```text
Compiled
Verified
Published
Revoked
```

Sólo:

```text
Verified
Published
```

pueden ser candidatos a ejecución según Runtime policy.

---

## 602. REVOCATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

REVOCATION

Un Artifact revocado no debe ejecutarse aunque su hash sea correcto.

---

## 603. REVOCATION SOURCE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

REVOCATION SOURCE

La revocación debe provenir de una policy/registry de confianza.

No almacenarla únicamente dentro del Artifact.

---

## 604. ARTIFACT IMMUTABILITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT IMMUTABILITY

Un Artifact publicado debe ser inmutable.

Cambiar:

```text
payload
dependencies
capabilities
language version
IR
```

produce un Artifact diferente.

---

## 605. ARTIFACT VERSION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT VERSION

Cambios incompatibles en formato:

```text
major version
```

según Documento 46.

---

## 606. COMPATIBILITY MATRIX

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

COMPATIBILITY MATRIX

Debe existir una matriz que indique:

```text
Artifact format
IR version
Runtime version
language version
```

compatibles.

---

## 607. RUNTIME COMPATIBILITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

RUNTIME COMPATIBILITY

Runtime debe rechazar Artifacts incompatibles.

---

## 608. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

BACKWARD COMPATIBILITY

No asumir backward compatibility automáticamente.

Cada versión debe declarar:

```text
supported range
```

---

## 609. FORWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

FORWARD COMPATIBILITY

Runtime V1 no debe ejecutar Artifact de una IR desconocida.

---

## 610. ARTIFACT STORE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT STORE

La persistencia de Artifacts será responsabilidad de infraestructura posterior.

El package sólo define el modelo y validación.

---

## 611. STORAGE KEY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

STORAGE KEY

Si se almacena por hash:

```text
contentHash
```

es un candidato adecuado como identidad física.

---

## 612. DEDUPLICATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEDUPLICATION

Artifacts idénticos pueden deduplicarse por hash.

---

## 613. CONTENT ADDRESSING

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CONTENT ADDRESSING

Opcionalmente:

```text
artifact/<hash>
```

puede utilizarse como esquema de almacenamiento.

---

## 614. DISTRIBUTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DISTRIBUTION

El Artifact debe poder transportarse como:

```text
UTF-8 JSON
```

sin depender de entorno de ejecución.

---

## 615. COMPRESSION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

COMPRESSION

Compresión puede aplicarse externamente:

```text
gzip
zstd
```

sin alterar el contenido lógico.

---

## 616. COMPRESSION HASH

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

COMPRESSION HASH

El hash debe calcularse sobre el contenido canónico sin compresión, salvo que la política indique lo contrario.

---

## 617. ARTIFACT LOADER

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT LOADER

Crear:

```text
ArtifactLoader
```

para:

```text
parse
validate
integrity-check
compatibility-check
```

---

## 618. LOADER RESULT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

LOADER RESULT

```ts
interface ArtifactLoadResult {
  artifact?: Artifact
  diagnostics: Diagnostic[]
}
```

---

## 619. LOADER TRUST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

LOADER TRUST

Un objeto deserializado no es automáticamente un Artifact confiable.

Debe pasar `ArtifactValidator`.

---

## 620. UNTRUSTED INPUT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

UNTRUSTED INPUT

Todo Artifact recibido desde:

```text
network
storage
upload
API
```

debe tratarse como:

```text
untrusted input
```

---

## 621. PARSING SAFETY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PARSING SAFETY

El loader debe tener límites para:

```text
payload size
nesting
string size
array size
```

---

## 622. RESOURCE EXHAUSTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

RESOURCE EXHAUSTION

No aceptar JSON diseñado para consumir recursos excesivos.

---

## 623. DEPTH LIMIT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEPTH LIMIT

Aplicar límite de nesting durante deserialización.

---

## 624. FIELD LIMIT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

FIELD LIMIT

Rechazar estructuras con campos inesperadamente grandes cuando la schema lo permita.

---

## 625. UNKNOWN FIELDS

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

UNKNOWN FIELDS

V1 debe definir política:

```text
reject unknown fields
```

para payload ejecutable, o permitirlos sólo en metadata extensible.

Recomendación:

```text
strict executable schema
extensible metadata
```

---

## 626. EXTENSIONS

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

EXTENSIONS

Agregar:

```text
extensions
```

sólo en una zona explícitamente no semántica.

---

## 627. EXTENSION NAMESPACE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

EXTENSION NAMESPACE

Usar nombres namespaced para evitar colisiones.

---

## 628. SOURCE RETENTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SOURCE RETENTION

El Artifact no necesita almacenar source completo para ejecutar.

Puede conservar:

```text
sourceHash
sourceMap
```

---

## 629. SOURCE CONFIDENTIALITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SOURCE CONFIDENTIALITY

Evitar incluir source completo cuando pueda revelar lógica propietaria.

---

## 630. DEBUG BUILD

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEBUG BUILD

Un Artifact de debugging puede incluir más información, pero debe mantener integridad y compatibilidad.

---

## 631. PRODUCTION BUILD

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PRODUCTION BUILD

Debe minimizar:

```text
debug metadata
source details
```

sin eliminar información necesaria para diagnostics.

---

## 632. ARTIFACT METADATA CLASSIFICATION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT METADATA CLASSIFICATION

Separar:

```text
semantic metadata
operational metadata
debug metadata
```

---

## 633. CANONICAL SEMANTIC CONTENT

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CANONICAL SEMANTIC CONTENT

Debe incluir todo lo que afecte:

```text
execution semantics
verification
compatibility
dependencies
capabilities
```

---

## 634. OPERATIONAL METADATA

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

OPERATIONAL METADATA

Ejemplos:

```text
createdAt
publishedAt
publisher
```

pueden quedar fuera del hash semántico si la política lo permite.

---

## 635. PUBLISHING

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PUBLISHING

Publicación debe requerir:

```text
Verified Artifact
```

---

## 636. PUBLISHING GATE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PUBLISHING GATE

No publicar:

```text
unverified
invalid
incompatible
revoked
```

Artifacts.

---

## 637. ARTIFACT IDENTITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT IDENTITY

Una modificación semántica debe producir:

```text
different contentHash
```

---

## 638. SAME SOURCE

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SAME SOURCE

Mismo source no garantiza mismo Artifact si cambian:

```text
compiler
language
registry snapshot
policy
dependencies
```

si éstos forman parte de la semántica del Artifact.

---

## 639. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

REPRODUCIBILITY

Para reproducibilidad completa registrar:

```text
sourceHash
compilerVersion
compilerConfigHash
languageVersion
registrySnapshot
dependency versions
```

---

## 640. BUILD MANIFEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

BUILD MANIFEST

Puede existir:

```text
BuildManifest
```

para documentar inputs de compilación.

---

## 641. BUILD MANIFEST HASH

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

BUILD MANIFEST HASH

Si forma parte de la identidad semántica:

```text
manifestHash
```

debe incluirse en canonical content.

---

## 642. ARTIFACT INSPECTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT INSPECTION

Debe existir tooling para:

```text
inspect artifact
show metadata
show dependencies
show capabilities
show verification status
show integrity
```

sin ejecutarlo.

---

## 643. ARTIFACT DIFF

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

ARTIFACT DIFF

V1 puede soportar comparación estructural:

```text
Artifact A vs Artifact B
```

para debugging/versioning.

---

## 644. NO EXECUTION DURING INSPECTION

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

NO EXECUTION DURING INSPECTION

Inspection nunca debe ejecutar IR.

---

## 645. SERIALIZATION TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SERIALIZATION TEST

Serializar un Artifact y volver a cargarlo debe conservar:

```text
semantic content
```

---

## 646. CANONICAL TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CANONICAL TEST

Dos serializaciones equivalentes deben producir:

```text
same canonical bytes
```

---

## 647. HASH TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

HASH TEST

Mismo canonical content:

```text
same hash
```

---

## 648. TAMPER TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

TAMPER TEST

Modificar un byte cubierto por hash:

```text
integrity failure
```

---

## 649. VERSION TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VERSION TEST

Artifact incompatible:

```text
rejected
```

---

## 650. SCHEMA TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

SCHEMA TEST

Eliminar required field:

```text
schema failure
```

---

## 651. DEPENDENCY TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DEPENDENCY TEST

Modificar dependency version:

```text
dependency mismatch
```

---

## 652. CAPABILITY TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

CAPABILITY TEST

Modificar capability set:

```text
integrity/verification mismatch
```

según qué parte cubra el hash.

---

## 653. VERIFICATION TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

VERIFICATION TEST

Artifact marcado como no verificado:

```text
rejected for execution
```

---

## 654. REVOCATION TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

REVOCATION TEST

Artifact revocado:

```text
rejected
```

---

## 655. RESOURCE TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

RESOURCE TEST

Artifact excesivamente grande:

```text
loader rejects before full materialization
```

cuando sea posible.

---

## 656. UNKNOWN FIELD TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

UNKNOWN FIELD TEST

Campo desconocido en payload ejecutable:

```text
rejected
```

según schema strict.

---

## 657. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

DETERMINISM TEST

Compilar el mismo input bajo el mismo environment:

```text
same canonical artifact
same hash
```

---

## 658. TRUST CHAIN

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

TRUST CHAIN

```text
Source Hash
    ↓
Compilation Inputs
    ↓
IR
    ↓
Verification
    ↓
Canonical Artifact
    ↓
Integrity Hash
    ↓
Runtime Validation
    ↓
Execution
```

---

## 659. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PRINCIPIO DE INMUTABILIDAD

Un Artifact publicado debe considerarse:

```text
immutable
content-addressable
verifiable
versioned
```

---

## 660. PRINCIPIO DE INTEGRIDAD

> **Origen:** Motor de liquidacion_Artifact Format, Serialization & Integrity 61.md

PRINCIPIO DE INTEGRIDAD

```text
hash correcto
≠
Artifact seguro
```

La integridad sólo demuestra que el contenido no cambió; la seguridad proviene de la verificación y de las políticas de compatibilidad.

---
