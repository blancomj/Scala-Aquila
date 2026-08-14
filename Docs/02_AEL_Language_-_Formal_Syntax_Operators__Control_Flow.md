# AEL V1 — AEL Language — Formal Syntax, Operators & Control Flow

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

OBJETIVO

AEL debe permitir expresar reglas de negocio de forma:

- legible;
- tipada;
- determinista;
- segura;
- auditable;
- versionable;
- ejecutable;
- independiente de infraestructura.

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

## 2. FILOSOFÍA SINTÁCTICA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FILOSOFÍA SINTÁCTICA

AEL utilizará palabras reservadas en español.

Ejemplo:

```ael
SI area > 100 M2 ENTONCES
    RETORNAR 500000 COP
SINO
    RETORNAR 400000 COP
FIN
```

La intención es que las reglas puedan ser comprendidas por perfiles funcionales y técnicos de AQUILA.

---

## 3. PALABRAS RESERVADAS V1

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

PALABRAS RESERVADAS V1

```text
REGLA
DEFINIR
RETORNAR

SI
ENTONCES
SINO
FIN

MIENTRAS

VERDADERO
FALSO
NULO
```

No pueden utilizarse como identificadores.

---

## 4. IDENTIFICADORES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

IDENTIFICADORES

Un identificador representa:

- variable;
- regla;
- función;
- Contract;
- propiedad.

Forma conceptual:

```text
letra + {letra | dígito | _}
```

Ejemplos válidos:

```text
area
area_privada
tarifa
TARIFA_M2
cantidad01
```

---

## 5. IDENTIFICADORES INVÁLIDOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

IDENTIFICADORES INVÁLIDOS

```text
123area
area-privada
tarifa/m2
```

El carácter `-` es operador y no forma parte del identificador.

---

## 6. SENSIBILIDAD A MAYÚSCULAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

SENSIBILIDAD A MAYÚSCULAS

AEL será case-sensitive.

Por tanto:

```text
area
AREA
Area
```

son identificadores diferentes.

Las palabras reservadas se escribirán oficialmente en mayúsculas.

---

## 7. CONVENCIÓN DE NOMBRES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONVENCIÓN DE NOMBRES

### Variables

```text
area_privada
tarifa_m2
total_cuota
```

### Rules

```text
CUOTA_ADMIN
INTERES_MORA
DISTRIBUCION_COSTO
```

### Contracts

```text
UNIT.AREA_PRIVATE
PARAMETER.TARIFA_M2
```

---

## 8. COMENTARIOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

COMENTARIOS

AEL tendrá comentarios de una línea:

```ael
// Obtener el área privada
DEFINIR area = UNIT.AREA_PRIVATE
```

Los comentarios no forman parte de la semántica ejecutable.

---

## 9. LITERALES NUMÉRICOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LITERALES NUMÉRICOS

Se permiten enteros:

```text
10
100
4500
```

y decimales:

```text
10.5
120.50
0.25
```

No se utilizarán separadores de miles.

Por tanto:

```text
1,000
```

no es un literal numérico válido.

---

## 10. PRECISIÓN DECIMAL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

PRECISIÓN DECIMAL

Los valores numéricos deben procesarse mediante representación decimal controlada.

AEL no debe depender de errores binarios de `float`.

Conceptualmente:

```text
0.1 + 0.2 = 0.3
```

dentro de las reglas de precisión del Value Engine.

---

## 11. BOOLEANOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

BOOLEANOS

Valores permitidos:

```text
VERDADERO
FALSO
```

No existe coerción automática desde NUMBER, STRING, MONEY o QUANTITY hacia BOOLEAN.

---

## 12. TEXTO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

TEXTO

Las cadenas utilizan comillas dobles:

```text
"Activo"
"Copropietario"
"Cuota administrativa"
```

---

## 13. ESCAPES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

ESCAPES

Como mínimo:

```text
\"
\\
\n
\t
```

La semántica exacta debe estar cubierta por la Suite de Conformidad.

---

## 14. FECHAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FECHAS

AEL distingue DATE de STRING.

Conceptualmente:

```text
DATE
```

Una fecha debe tener semántica propia y no representarse internamente simplemente como texto.

La construcción concreta para crear fechas será definida por el catálogo estándar de Functions.

---

## 15. DATETIME

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DATETIME

AEL distingue:

```text
DATE
DATETIME
```

La estrategia de zona horaria será controlada por AQUILA.

---

## 16. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

MONEY

La sintaxis permite valores monetarios:

```ael
4500 COP
1250000 COP
```

Semánticamente:

```text
MONEY<COP>
```

No representa:

```text
NUMBER + STRING
```

---

## 17. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

QUANTITY

Ejemplo:

```ael
120.50 M2
```

Semánticamente:

```text
QUANTITY
Dimension: AREA
Unit: M2
Magnitude: 120.50
```

La semántica detallada pertenece al Documento 03 — Type System y Value Engine.

---

## 18. AMBIGÜEDAD ENTRE MONEY Y QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

AMBIGÜEDAD ENTRE MONEY Y QUANTITY

El catálogo de unidades determina si una unidad corresponde a:

```text
moneda
```

o:

```text
unidad física
```

No se permite que el contexto cambie arbitrariamente su significado.

---

## 19. VARIABLES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

VARIABLES

Declaración:

```ael
DEFINIR area = UNIT.AREA_PRIVATE
```

Uso:

```ael
RETORNAR area
```

Una variable debe declararse antes de utilizarse.

---

## 20. VARIABLE NO DEFINIDA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

VARIABLE NO DEFINIDA

```ael
RETORNAR area
```

sin declaración previa produce un error semántico:

```text
AEL-NAME-001
```

---

## 21. REDECLARACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

REDECLARACIÓN

No se permite declarar dos veces la misma variable dentro del mismo ámbito:

```ael
DEFINIR area = 100
DEFINIR area = 200
```

Debe producir:

```text
AEL-SCOPE-001
```

---

## 22. ÁMBITOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

ÁMBITOS

Los bloques pueden crear ámbitos.

Ejemplo:

```ael
SI activo ENTONCES

    DEFINIR descuento = 10

FIN
```

`descuento` no queda automáticamente disponible fuera del bloque.

---

## 23. EXPRESIONES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

EXPRESIONES

Una expresión produce un valor.

Ejemplos:

```ael
10
```

```ael
area
```

```ael
area * tarifa
```

```ael
UNIT.AREA_PRIVATE
```

```ael
PORCENTAJE(total, 10)
```

---

## 24. OPERADORES ARITMÉTICOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

OPERADORES ARITMÉTICOS

AEL V1:

```text
+
-
*
/
```

---

## 25. PRECEDENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

PRECEDENCIA

Orden conceptual:

```text
1. ()
2. acceso Contract / llamada
3. *
4. /
5. +
6. -
7. comparaciones
8. igualdad
9. NO
10. Y
11. O
```

Ejemplo:

```ael
10 + 5 * 2
```

se interpreta como:

```text
10 + (5 * 2)
```

resultado:

```text
20
```

---

## 26. PARÉNTESIS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

PARÉNTESIS

Los paréntesis modifican la precedencia:

```ael
(10 + 5) * 2
```

resultado:

```text
30
```

---

## 27. COMPARACIONES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

COMPARACIONES

AEL V1:

```text
==
!=
>
>=
<
<=
```

Ejemplo:

```ael
area > 100 M2
```

produce BOOLEAN.

---

## 28. OPERADORES LÓGICOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

OPERADORES LÓGICOS

Se utilizarán palabras:

```text
Y
O
NO
```

Ejemplo:

```ael
SI activo Y area > 100 M2 ENTONCES
    ...
FIN
```

---

## 29. PRECEDENCIA LÓGICA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

PRECEDENCIA LÓGICA

Orden:

```text
NO
comparaciones
Y
O
```

Ejemplo:

```ael
NO activo O area > 100 M2
```

se interpreta como:

```text
(NO activo) O (area > 100 M2)
```

---

## 30. CORTOCIRCUITO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CORTOCIRCUITO

`Y` y `O` utilizan evaluación de cortocircuito.

Ejemplo:

```ael
SI activo Y area > 0 M2 ENTONCES
```

Si `activo` es FALSO, la segunda expresión puede no evaluarse.

Esto favorece seguridad y eficiencia.

---

## 31. ASIGNACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

ASIGNACIÓN

AEL no utiliza asignación mutable general.

`=` se utiliza durante la declaración:

```ael
DEFINIR area = UNIT.AREA_PRIVATE
```

No se permite:

```ael
area = 200
```

como reasignación.

---

## 32. INMUTABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

INMUTABILIDAD

Las variables son inmutables por defecto.

Ejemplo:

```ael
DEFINIR tarifa = PARAMETER.TARIFA_M2
```

La variable `tarifa` no puede ser reasignada posteriormente.

Esto favorece:

- auditoría;
- trazabilidad;
- análisis;
- determinismo.

---

## 33. CONDICIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONDICIONAL

Sintaxis:

```ael
SI condicion ENTONCES
    instrucciones
SINO
    instrucciones
FIN
```

Ejemplo:

```ael
SI area > 100 M2 ENTONCES

    RETORNAR 500000 COP

SINO

    RETORNAR 400000 COP

FIN
```

---

## 34. CONDICIONAL SIN SINO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONDICIONAL SIN SINO

También se permite:

```ael
SI activo ENTONCES
    ...
FIN
```

---

## 35. TIPO DE LA CONDICIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

TIPO DE LA CONDICIÓN

La condición debe producir:

```text
BOOLEAN
```

No se permite coerción automática.

Por ejemplo:

```ael
SI 1 ENTONCES
```

es inválido.

---

## 36. MIENTRAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

MIENTRAS

Sintaxis:

```ael
MIENTRAS condicion
    instrucciones
FIN
```

La estructura forma parte de la gramática V1.

Sin embargo, la semántica de modificación de estado requiere una consideración especial debido a la inmutabilidad de variables.

Por tanto:

> `MIENTRAS` no debe habilitarse para producción hasta cerrar formalmente su modelo de estado.

El Runtime siempre deberá aplicar límites de instrucciones y tiempo.

---

## 37. RETORNAR

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RETORNAR

Ejemplo:

```ael
RETORNAR area * tarifa
```

produce el resultado de la regla.

---

## 38. RETORNO TIPADO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RETORNO TIPADO

El Analyzer debe conocer el tipo de la expresión retornada.

Ejemplo:

```text
AREA × MONEY/AREA
=
MONEY
```

---

## 39. RETORNOS INCONSISTENTES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RETORNOS INCONSISTENTES

Si una ruta produce:

```ael
RETORNAR 100 COP
```

y otra:

```ael
RETORNAR "ERROR"
```

la regla debe ser rechazada si su contrato de salida exige un único tipo compatible.

---

## 40. CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONTRACTS

Sintaxis:

```text
CONTRACT.PROPIEDAD
```

Ejemplos:

```ael
UNIT.AREA_PRIVATE
PARAMETER.TARIFA_M2
```

Una referencia Contract es declarativa.

No representa acceso directo a una tabla.

---

## 41. RESOLUCIÓN DE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RESOLUCIÓN DE CONTRACT

El Analyzer debe resolver:

```text
namespace
member
type
unit
dimension
version
provider
```

Ejemplo:

```text
UNIT.AREA_PRIVATE

Contract:
UNIT

Property:
AREA_PRIVATE

Type:
QUANTITY

Dimension:
AREA

Unit:
M2
```

---

## 42. CONTRACT DESCONOCIDO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONTRACT DESCONOCIDO

```ael
UNIT.AREA_INEXISTENTE
```

produce:

```text
AEL-CONTRACT-001
```

La regla no debe llegar al Runtime con referencias desconocidas.

---

## 43. VERSIONADO DE CONTRACTS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

VERSIONADO DE CONTRACTS

Una dependencia puede especificar:

```text
UNIT@1
```

El Artifact debe conservar la versión utilizada.

Esto permite reproducibilidad.

---

## 44. FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FUNCTIONS

Sintaxis:

```ael
FUNCION(valor)
```

Ejemplos:

```ael
ABS(-10)
```

```ael
ROUND(total, 2)
```

```ael
PORCENTAJE(total, 10)
```

---

## 45. FUNCIONES REGISTRADAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FUNCIONES REGISTRADAS

Las Functions deben existir previamente en el catálogo oficial.

No se permite ejecución dinámica de código.

No existe:

```ael
EJECUTAR("codigo")
```

ni mecanismos equivalentes.

---

## 46. FIRMAS DE FUNCIONES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FIRMAS DE FUNCIONES

Cada Function tiene:

```text
nombre
versión
tipos de entrada
tipo de salida
política de seguridad
```

Ejemplo:

```text
PORCENTAJE(
    MONEY,
    DECIMAL
) -> MONEY
```

---

## 47. LISTAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LISTAS

V1 soporta listas:

```ael
[10, 20, 30]
```

Tipo:

```text
LIST<NUMBER>
```

---

## 48. LISTAS HOMOGÉNEAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LISTAS HOMOGÉNEAS

Se recomienda homogeneidad:

```ael
[10, 20, 30]
```

válido.

```ael
["A", "B", "C"]
```

válido.

```ael
[10, "A", VERDADERO]
```

inválido en V1.

---

## 49. LISTAS DE CANTIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LISTAS DE CANTIDADES

Permitido:

```ael
[10 M2, 20 M2, 30 M2]
```

No:

```ael
[10 M2, 20 KG]
```

salvo que una futura versión introduzca tipos unión.

---

## 50. NULO EN LISTAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

NULO EN LISTAS

Si se permite:

```ael
[10, NULO, 20]
```

la lista debe tener semántica explícita.

Conceptualmente:

```text
LIST<NUMBER?>
```

La política completa de NULO se define en el Documento 03.

---

## 51. FECHAS Y FUNCIONES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FECHAS Y FUNCIONES

Las operaciones de fecha se realizan mediante Functions.

Ejemplo:

```text
DIAS_ENTRE(fecha_inicio, fecha_fin)
```

El resultado es NUMBER.

---

## 52. FECHA ACTUAL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FECHA ACTUAL

AEL no utilizará una función implícita equivalente a:

```text
NOW()
```

que dependa del reloj del servidor.

La fecha actual, cuando sea necesaria, debe provenir del ExecutionContext mediante un Contract autorizado.

Esto preserva determinismo y reproducibilidad.

---

## 53. CONTEXTO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONTEXTO

El ExecutionContext puede contener conceptualmente:

```text
tenant
usuario
periodo
fecha
permisos
providers
limits
```

No todo el contexto se expone automáticamente al lenguaje.

---

## 54. ACCESO AL CONTEXTO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

ACCESO AL CONTEXTO

Sólo Contracts publicados pueden exponer información del contexto.

Esto evita convertir ExecutionContext en una API pública accidental.

---

## 55. DEPENDENCIAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DEPENDENCIAS

El Analyzer debe poder construir el grafo:

```text
CUOTA_ADMIN
│
├── UNIT.AREA_PRIVATE
├── PARAMETER.TARIFA_M2
└── REDONDEAR_DINERO
```

Esto se utilizará para:

- publicación;
- versionado;
- auditoría;
- análisis de impacto;
- validación.

---

## 56. GRAMÁTICA EBNF — PROGRAMA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

GRAMÁTICA EBNF — PROGRAMA

Definición base:

```ebnf
programa =
    regla ;

regla =
    "REGLA" identificador
    declaracion*
    instruccion*
    ;

declaracion =
    "DEFINIR" identificador "=" expresion ;

instruccion =
      declaracion
    | retorno
    | condicional
    | mientras ;

retorno =
    "RETORNAR" expresion ;

condicional =
    "SI" expresion "ENTONCES"
    instruccion*
    [ "SINO" instruccion* ]
    "FIN" ;

mientras =
    "MIENTRAS" expresion
    instruccion*
    "FIN" ;
```

---

## 57. GRAMÁTICA DE EXPRESIONES

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

GRAMÁTICA DE EXPRESIONES

```ebnf
expresion =
    expresion_or ;

expresion_or =
    expresion_and
    { "O" expresion_and } ;

expresion_and =
    expresion_igualdad
    { "Y" expresion_igualdad } ;

expresion_igualdad =
    expresion_relacional
    { ("==" | "!=") expresion_relacional } ;

expresion_relacional =
    expresion_aditiva
    { (">" | ">=" | "<" | "<=") expresion_aditiva } ;

expresion_aditiva =
    expresion_multiplicativa
    { ("+" | "-") expresion_multiplicativa } ;

expresion_multiplicativa =
    expresion_unaria
    { ("*" | "/") expresion_unaria } ;

expresion_unaria =
      "NO" expresion_unaria
    | "-" expresion_unaria
    | expresion_primaria ;

expresion_primaria =
      literal
    | identificador
    | referencia_contract
    | llamada_funcion
    | lista
    | "(" expresion ")" ;
```

---

## 58. LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LITERAL

```ebnf
literal =
      numero
    | texto
    | booleano
    | nulo
    | cantidad
    | dinero ;
```

---

## 59. BOOLEANO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

BOOLEANO

```ebnf
booleano =
      "VERDADERO"
    | "FALSO" ;
```

---

## 60. NULO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

NULO

```ebnf
nulo =
    "NULO" ;
```

---

## 61. LISTA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LISTA

```ebnf
lista =
    "[" [ expresion { "," expresion } ] "]" ;
```

---

## 62. CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONTRACT

Sintaxis conceptual:

```ebnf
referencia_contract =
    identificador "." identificador ;
```

El Parser reconoce la estructura; el Analyzer determina su significado.

---

## 63. FUNCTION CALL

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FUNCTION CALL

```ebnf
llamada_funcion =
    identificador
    "("
    [ expresion { "," expresion } ]
    ")" ;
```

Ejemplo:

```ael
ABS(-10)
```

---

## 64. AMBIGÜEDAD CONTRACT / FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

AMBIGÜEDAD CONTRACT / FUNCTION

El Parser puede distinguir:

```text
IDENTIFIER "("
```

como llamada de función.

Y:

```text
IDENTIFIER "." IDENTIFIER
```

como referencia.

La existencia y validez de ambos elementos corresponde al Analyzer.

---

## 65. LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

LEXER

Tokens mínimos:

```text
IDENTIFIER
NUMBER
STRING
KEYWORD
OPERATOR
LPAREN
RPAREN
LBRACKET
RBRACKET
COMMA
DOT
NEWLINE
COMMENT
EOF
```

La implementación puede agregar tokens internos.

---

## 66. RESPONSABILIDAD DEL LEXER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RESPONSABILIDAD DEL LEXER

El Lexer reconoce estructura léxica.

No debe resolver:

```text
UNIT.AREA_PRIVATE
```

como Contract.

Debe generar tokens equivalentes a:

```text
IDENTIFIER
DOT
IDENTIFIER
```

---

## 67. PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

PARSER

El Parser transforma:

```text
TOKENS
```

en:

```text
AST
```

No debe acceder directamente a:

```text
PostgreSQL
Supabase
Providers
```

---

## 68. ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

ANALYZER

El Analyzer realiza:

- resolución de símbolos;
- verificación de tipos;
- resolución de Contracts;
- resolución de Functions;
- validación dimensional;
- validación de retornos;
- análisis de dependencias;
- análisis de ámbitos.

---

## 69. SEPARACIÓN DE CAPAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

SEPARACIÓN DE CAPAS

Debe mantenerse:

```text
Lexer
 ↓
Parser
 ↓
Analyzer
```

No:

```text
Lexer → Database
```

ni:

```text
Parser → Supabase
```

---

## 70. DIAGNÓSTICOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DIAGNÓSTICOS

Cada diagnóstico debe contener conceptualmente:

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

---

## 71. EJEMPLO DE DIAGNÓSTICO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

EJEMPLO DE DIAGNÓSTICO

```text
AEL-TYPE-001

ERROR

No es posible sumar una cantidad de área
con una cantidad de masa.
```

Debe incluir ubicación exacta en Source.

---

## 72. RECUPERACIÓN DEL PARSER

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RECUPERACIÓN DEL PARSER

El Parser debe intentar recuperarse de errores para mostrar varios diagnósticos en una sola validación.

Por ejemplo:

```text
ERROR línea 5
ERROR línea 8
ERROR línea 13
```

en lugar de detenerse ante el primer error.

Esto es especialmente importante para el Builder.

---

## 73. MODO STRICT

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

MODO STRICT

AEL V1 utiliza análisis estricto.

No se permiten conversiones implícitas peligrosas.

Ejemplo:

```ael
"100" + 50
```

es inválido.

No debe convertirse silenciosamente en:

```text
150
```

---

## 74. CONVERSIONES EXPLÍCITAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CONVERSIONES EXPLÍCITAS

Las conversiones deben utilizar Functions.

Ejemplos conceptuales:

```ael
NUMERO("100")
TEXTO(100)
```

La lista oficial de conversiones formará parte del catálogo estándar.

---

## 75. COERCIÓN DE TIPOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

COERCIÓN DE TIPOS

No se permite automáticamente:

```text
STRING → NUMBER
NUMBER → STRING
BOOLEAN → NUMBER
NUMBER → BOOLEAN
MONEY → NUMBER
QUANTITY → NUMBER
```

---

## 76. OPERACIONES MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

OPERACIONES MONEY

Ejemplos válidos:

```ael
100000 COP + 50000 COP
```

```ael
100000 COP * 0.10
```

```ael
100000 COP / 2
```

La semántica detallada está definida en el Documento 03.

---

## 77. OPERACIONES QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

OPERACIONES QUANTITY

Válido:

```ael
100 M2 + 20 M2
```

Inválido:

```ael
100 M2 + 20 KG
```

Válido:

```ael
100 M2 * 2
```

Válido cuando dimensionalmente corresponda:

```ael
120.50 M2 * 4500 COP/M2
```

---

## 78. DIMENSIONALIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DIMENSIONALIDAD

AEL utiliza dimensiones algebraicas.

Ejemplo:

```text
M2 × COP/M2 = COP
```

Esto permite modelar tarifas sin crear tipos especiales para cada caso.

---

## 79. DIVISIÓN POR CERO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DIVISIÓN POR CERO

Debe generar un error controlado:

```text
AEL-MATH-001
```

Nunca producir silenciosamente:

```text
Infinity
NaN
```

---

## 80. RETORNO DE REGLA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RETORNO DE REGLA

Una regla debe producir un resultado compatible con su semántica.

Ejemplo:

```ael
REGLA CUOTA_ADMIN

DEFINIR area = UNIT.AREA_PRIVATE
DEFINIR tarifa = PARAMETER.TARIFA_M2

RETORNAR area * tarifa
```

---

## 81. CASO CANÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CASO CANÓNICO

Contexto:

```text
area = 120.50 M2
tarifa = 4500 COP/M2
```

Resultado:

```text
542250 COP
```

Este caso es obligatorio en la Suite de Conformidad.

---

## 82. CASOS VÁLIDOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CASOS VÁLIDOS

```ael
REGLA TEST

DEFINIR total = 100 + 20

RETORNAR total
```

```ael
REGLA TEST

DEFINIR area = 100 M2
DEFINIR tarifa = 4500 COP/M2

RETORNAR area * tarifa
```

```ael
REGLA TEST

SI activo ENTONCES
    RETORNAR 100
FIN
```

---

## 83. CASOS INVÁLIDOS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CASOS INVÁLIDOS

```ael
REGLA TEST

DEFINIR total = "100" + 20

RETORNAR total
```

```ael
REGLA TEST

DEFINIR total = 100 M2 + 20 KG

RETORNAR total
```

```ael
REGLA TEST

RETORNAR variable_inexistente
```

---

## 84. REGLA DE IMPLEMENTACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

REGLA DE IMPLEMENTACIÓN

Cada característica del lenguaje debe tener:

```text
especificación
+
implementación
+
test válido
+
test inválido
```

No considerar una característica terminada únicamente porque funciona en un caso manual.

---

## 85. CRITERIO PARA NUEVAS CARACTERÍSTICAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CRITERIO PARA NUEVAS CARACTERÍSTICAS

Antes de incorporar una característica a V1:

1. Debe existir un caso real de AQUILA.
2. Debe justificarse su necesidad.
3. Debe poder definirse formalmente.
4. Debe poder probarse.
5. Debe poder ejecutarse de forma segura.
6. No debe comprometer reproducibilidad.
7. No debe introducir complejidad innecesaria.

---

## 86. MIENTRAS — DECISIÓN EXPLÍCITA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

MIENTRAS — DECISIÓN EXPLÍCITA

`MIENTRAS` forma parte de la gramática.

Sin embargo, debido al modelo de variables inmutables:

> No se habilitará como funcionalidad productiva hasta definir una semántica formal de estado que no introduzca mutabilidad general ni comprometa determinismo.

Esta decisión evita introducir una excepción arquitectónica sólo para resolver loops.

---

## 87. CARACTERÍSTICAS FUERA DE V1

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CARACTERÍSTICAS FUERA DE V1

No forman parte de la especificación actual:

```text
TRY/CATCH
SWITCH
MATCH
ASYNC/AWAIT
FOR
FOREACH
recursión arbitraria
generadores
clases
objetos mutables
metaprogramación
evaluación dinámica
```

Podrán estudiarse en futuras versiones si existe una necesidad real.

---

## 88. NO EVALUACIÓN DINÁMICA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

NO EVALUACIÓN DINÁMICA

AEL no ejecutará Source como JavaScript.

No utilizar:

```text
eval()
Function()
vm.runInNewContext()
```

ni mecanismos equivalentes como motor de ejecución.

El Source siempre debe pasar por:

```text
Lexer
Parser
Analyzer
Artifact Builder
Verifier
Runtime
```

---

## 89. DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DETERMINISMO

La misma combinación:

```text
Source
+
versiones
+
Artifact
+
Context
```

debe producir el mismo resultado, salvo operaciones explícitamente no deterministas.

En V1 no se habilita aleatoriedad implícita.

---

## 90. FECHA Y HORA

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

FECHA Y HORA

No depender directamente del reloj del servidor.

Cuando una regla necesite fecha/hora:

```text
ExecutionContext
```

debe proporcionar el valor mediante un Contract autorizado.

---

## 91. DEPENDENCIAS

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

DEPENDENCIAS

Toda dependencia externa al lenguaje debe quedar identificada:

```text
Contract
Function
Runtime
Language
```

Esto permitirá construir un Artifact reproducible.

---

## 92. RELACIÓN CON DOCUMENTO 03

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RELACIÓN CON DOCUMENTO 03

Este documento define:

```text
cómo se escribe
```

El Documento 03 define:

```text
qué significan los valores
```

Ejemplo:

```ael
120.50 M2 * 4500 COP/M2
```

Documento 02:

```text
gramática
expresión
tokens
AST
```

Documento 03:

```text
QUANTITY
MONEY
DIMENSION
UNIT
operación matemática
```

---

## 93. RELACIÓN CON DOCUMENTO 04

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

RELACIÓN CON DOCUMENTO 04

Este documento define:

```text
Source
AST
semántica sintáctica
```

El Documento 04 define:

```text
AST
Typed AST
IR
Instruction Set
Artifact
```

La secuencia oficial queda:

```text
Documento 02
      ↓
Documento 03
      ↓
Documento 04
```

---

## 94. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Especificacion_Formal_Lenguaje 2.md

CRITERIO DE CIERRE

La especificación formal del lenguaje V1 debe considerarse cerrada cuando:

```text
✓ palabras reservadas
✓ identificadores
✓ literales
✓ variables
✓ ámbitos
✓ expresiones
✓ operadores
✓ precedencia
✓ condiciones
✓ loops
✓ retorno
✓ Functions
✓ Contracts
✓ listas
✓ NULO
✓ EBNF
✓ Lexer
✓ Parser
✓ Analyzer
✓ diagnósticos
✓ coerciones
✓ determinismo
```

estén definidos y cubiertos por pruebas.

---

## 95. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OBJETIVO

Definir:

```text
operadores
precedencia
asociatividad
tipado
evaluación
short-circuit
comparaciones
aritmética
nulabilidad
Money
Quantity
String
errores
```

---

## 96. FUENTE ÚNICA DE SEMÁNTICA

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

FUENTE ÚNICA DE SEMÁNTICA

Las reglas de operadores deben centralizarse en:

```text
OperatorRegistry
```

o un componente equivalente.

Analyzer y Runtime no deben mantener tablas independientes.

---

## 97. OPERADORES V1

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERADORES V1

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
NOT
```

---

## 98. CATEGORÍAS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CATEGORÍAS

```text
Aritméticos
Comparación
Lógicos
Unarios
```

---

## 99. OPERADORES UNARIOS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERADORES UNARIOS

```text
+
-
NOT
```

---

## 100. OPERADORES BINARIOS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERADORES BINARIOS

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

## 101. RESULTADO BOOLEANO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RESULTADO BOOLEANO

Comparaciones producen:

```text
Boolean
```

---

## 102. RESULTADO LÓGICO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RESULTADO LÓGICO

```text
AND → Boolean
OR  → Boolean
NOT → Boolean
```

---

## 103. NO TRUTHINESS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO TRUTHINESS

No permitir:

```text
5 AND VERDADERO
"texto" AND VERDADERO
```

---

## 104. PRECEDENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PRECEDENCIA

La precedencia V1 debe ser explícita y estable.

Orden recomendado, de mayor a menor:

```text
1. Primary / acceso
2. Unarios
3. Multiplicación / división / módulo
4. Suma / resta
5. Comparación
6. Igualdad
7. AND
8. OR
```

---

## 105. ASOCIATIVIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

ASOCIATIVIDAD

Aritméticos binarios:

```text
left-associative
```

---

## 106. COMPARACIONES

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPARACIONES

```text
left-associative
```

---

## 107. LÓGICOS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

LÓGICOS

```text
left-associative
```

---

## 108. PARÉNTESIS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PARÉNTESIS

Los paréntesis tienen precedencia máxima y permiten:

```text
override precedence
```

---

## 109. EXPRESIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

EXPRESIÓN

Conceptualmente:

```text
Expression
→ Unary
→ Binary
→ Primary
```

según la gramática definitiva.

---

## 110. OPERATOR DEFINITION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR DEFINITION

Cada operador debe declarar:

```text
token
arity
precedence
associativity
operand types
result type
evaluation strategy
error policy
```

---

## 111. TYPE RULE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

TYPE RULE

Ejemplo:

```text
Number + Number → Number
```

---

## 112. MONEY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY RULE

```text
Money<C> + Money<C> → Money<C>
```

---

## 113. QUANTITY RULE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY RULE

```text
Quantity<D,U1> + Quantity<D,U2>
```

es válida sólo si:

```text
D1 = D2
```

y las unidades son convertibles.

---

## 114. INVALID ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

INVALID ADDITION

No permitir:

```text
Money<COP> + Quantity<AREA,M2>
```

---

## 115. NUMBER SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NUMBER SUBTRACTION

```text
Number - Number → Number
```

---

## 116. MONEY SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY SUBTRACTION

```text
Money<C> - Money<C> → Money<C>
```

---

## 117. QUANTITY SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY SUBTRACTION

Misma dimensión y unidades compatibles.

---

## 118. MULTIPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MULTIPLICATION

```text
Number * Number → Number
```

---

## 119. NUMBER × MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NUMBER × MONEY

```text
Number * Money<C> → Money<C>
```

---

## 120. MONEY × NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md; Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY × NUMBER

```text
Money<C> * Number → Money<C>
```

---

## 121. NUMBER × QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NUMBER × QUANTITY

```text
Number * Quantity<D,U> → Quantity<D,U>
```

---

## 122. QUANTITY × NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md; Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY × NUMBER

```text
Quantity<D,U> * Number → Quantity<D,U>
```

---

## 123. QUANTITY × QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md; Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY × QUANTITY

Aplicar:

```text
DimensionAlgebra.multiply
```

---

## 124. MONEY × QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY × QUANTITY

Sólo válido si existe una semántica de tipo compuesta explícitamente soportada.

No introducir una conversión implícita.

---

## 125. DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DIVISION

```text
Number / Number → Number
```

---

## 126. MONEY / MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY / MONEY

V1 no debe introducir automáticamente un tipo Ratio.

Si se requiere:

```text
Money<C1> / Money<C2>
```

debe existir una semántica explícita.

---

## 127. MODULO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MODULO

V1:

```text
Number % Number → Number
```

---

## 128. MODULO MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MODULO MONEY

No permitido.

---

## 129. MODULO QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MODULO QUANTITY

No permitido salvo una regla específica futura.

---

## 130. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DIVISION BY ZERO

Debe producir:

```text
AEL-MATH-001
```

---

## 131. OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OVERFLOW

Debe producir:

```text
AEL-MATH-002
```

cuando exceda los límites soportados.

---

## 132. INVALID OPERAND TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

INVALID OPERAND TYPES

```text
AEL-TYPE-001
```

---

## 133. UNARY PLUS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

UNARY PLUS

```text
+Number → Number
+Money<C> → Money<C>
+Quantity<D,U> → Quantity<D,U>
```

---

## 134. UNARY MINUS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

UNARY MINUS

```text
-Number → Number
-Money<C> → Money<C>
-Quantity<D,U> → Quantity<D,U>
```

---

## 135. UNARY NOT

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

UNARY NOT

Sólo:

```text
NOT Boolean → Boolean
```

---

## 136. DOUBLE NEGATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DOUBLE NEGATION

```text
NOT NOT x
```

válido si:

```text
x : Boolean
```

---

## 137. COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPARISON

Operadores:

```text
<
<=
>
>=
```

requieren operandos ordenables compatibles.

---

## 138. NUMBER COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NUMBER COMPARISON

```text
Number < Number → Boolean
```

---

## 139. MONEY COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY COMPARISON

```text
Money<C> < Money<C> → Boolean
```

---

## 140. MONEY DIFFERENT CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY DIFFERENT CURRENCY

No permitir:

```text
Money<COP> < Money<USD>
```

sin conversión explícita.

---

## 141. QUANTITY COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY COMPARISON

Debe requerir:

```text
same dimension
```

---

## 142. UNIT NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

UNIT NORMALIZATION

Antes de comparar Quantity:

```text
normalize units
```

o convertir a una unidad compatible.

---

## 143. STRING ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING ORDER

V1 debe evitar ordenar Strings con reglas implícitas dependientes del servidor.

Si se soporta:

```text
< > <= >=
```

debe existir política explícita de:

```text
locale
collation
```

---

## 144. EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

EQUALITY

```text
==
```

debe ser semánticamente segura.

---

## 145. INEQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

INEQUALITY

```text
!=
```

debe ser consistente con:

```text
NOT (a == b)
```

para tipos donde la igualdad esté definida.

---

## 146. STRING EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING EQUALITY

```text
String == String
```

---

## 147. BOOLEAN EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

BOOLEAN EQUALITY

```text
Boolean == Boolean
```

---

## 148. NUMBER EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NUMBER EQUALITY

```text
Number == Number
```

---

## 149. MONEY EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY EQUALITY

```text
Money<C> == Money<C>
```

---

## 150. QUANTITY EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY EQUALITY

Debe permitir:

```text
Quantity<D,U1> == Quantity<D,U2>
```

si las unidades son convertibles.

---

## 151. RECORD EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RECORD EQUALITY

V1 recomienda no soportar igualdad estructural genérica de Records.

Si se requiere, debe definirse explícitamente.

---

## 152. NULL EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NULL EQUALITY

Debe permitirse una operación explícita:

```text
x == NULO
```

para tipos nullable.

---

## 153. NULL INEQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NULL INEQUALITY

```text
x != NULO
```

---

## 154. NULL ARITHMETIC

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NULL ARITHMETIC

No permitir:

```text
NULO + 5
NULO * 10
```

---

## 155. NULL COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NULL COMPARISON

No utilizar automáticamente semántica SQL de tres valores.

---

## 156. NULL NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NULL NARROWING

Una comprobación:

```text
x != NULO
```

puede permitir al Analyzer hacer narrowing en el bloque correspondiente si el sistema de control de flujo lo soporta.

---

## 157. AND

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

AND

```text
Boolean AND Boolean → Boolean
```

---

## 158. OR

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OR

```text
Boolean OR Boolean → Boolean
```

---

## 159. SHORT-CIRCUIT AND

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SHORT-CIRCUIT AND

Evaluación:

```text
false AND X
```

no evalúa:

```text
X
```

---

## 160. SHORT-CIRCUIT OR

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SHORT-CIRCUIT OR

Evaluación:

```text
true OR X
```

no evalúa:

```text
X
```

---

## 161. SHORT-CIRCUIT IMPORTANCE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SHORT-CIRCUIT IMPORTANCE

Puede evitar:

```text
Provider call
Function call
division by zero
```

en expresiones no evaluadas.

---

## 162. SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SIDE EFFECTS

Aunque una Function tuviera side effect autorizado:

```text
short-circuit
```

debe impedir que se ejecute una rama no evaluada.

---

## 163. EVALUATION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

EVALUATION ORDER

AEL debe evaluar expresiones de izquierda a derecha cuando la semántica lo requiera.

---

## 164. FUNCTION ARGUMENT ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

FUNCTION ARGUMENT ORDER

Argumentos deben evaluarse:

```text
left → right
```

---

## 165. PROVIDER ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PROVIDER ORDER

Los Contract loads generados por el Artifact se ejecutan en el orden establecido por instructions.

---

## 166. NO REORDERING

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO REORDERING

Runtime V1 no debe reordenar expresiones por optimización.

---

## 167. CONSTANT FOLDING

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CONSTANT FOLDING

Compiler puede evaluar expresiones constantes sólo si:

```text
pure
deterministic
```

---

## 168. CONSTANT FOLDING MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CONSTANT FOLDING MONEY

Permitido si:

```text
currency
precision
rounding
```

están completamente determinados.

---

## 169. CONSTANT FOLDING QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CONSTANT FOLDING QUANTITY

Permitido si:

```text
units
dimensions
```

son deterministas.

---

## 170. NO FOLDING EXTERNAL

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO FOLDING EXTERNAL

No evaluar en compile-time:

```text
Contract
external Function
current date
```

---

## 171. OPERATOR REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR REGISTRY

Conceptualmente:

```ts
interface OperatorDefinition {
  token: string
  arity: 1 | 2
  precedence: number
  associativity: 'LEFT' | 'RIGHT'
  rules: readonly OperatorTypeRule[]
}
```

---

## 172. OPERATOR TYPE RULE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR TYPE RULE

```ts
interface OperatorTypeRule {
  leftType?: AELType
  rightType?: AELType
  resultType: AELType
}
```

Para unarios:

```text
rightType
```

o un campo equivalente.

---

## 173. EVALUATION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

EVALUATION POLICY

Cada operator rule puede indicar:

```text
strict
shortCircuit
unitConversion
currencyCheck
```

---

## 174. ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

ANALYZER

Analyzer utiliza OperatorRegistry para:

```text
validate operands
infer result type
produce diagnostics
```

---

## 175. COMPILER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPILER

Compiler usa la misma semántica para generar:

```text
operator opcode
```

---

## 176. RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RUNTIME

Runtime usa la misma definición para ejecutar:

```text
operator opcode
```

---

## 177. NO DUPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO DUPLICATION

No mantener:

```text
AnalyzerRules.ts
RuntimeRules.ts
```

con semánticas potencialmente divergentes.

---

## 178. SHARED SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SHARED SEMANTICS

Debe existir una fuente común de:

```text
operator type rules
```

---

## 179. OPCODE MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPCODE MAPPING

Ejemplo:

```text
+
→ ADD

-
→ SUBTRACT

*
→ MULTIPLY

/
→ DIVIDE
```

---

## 180. COMPARISON OPCODES

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPARISON OPCODES

```text
EQUAL
NOT_EQUAL
LESS_THAN
LESS_EQUAL
GREATER_THAN
GREATER_EQUAL
```

---

## 181. LOGICAL OPCODES

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

LOGICAL OPCODES

```text
AND
OR
NOT
```

---

## 182. SHORT-CIRCUIT COMPILATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SHORT-CIRCUIT COMPILATION

Compiler puede producir:

```text
conditional jumps
```

en lugar de evaluar ambos operandos.

---

## 183. AND COMPILATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

AND COMPILATION

Conceptualmente:

```text
evaluate left
JUMP_IF_FALSE end
evaluate right
end:
```

---

## 184. OR COMPILATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OR COMPILATION

Conceptualmente:

```text
evaluate left
JUMP_IF_TRUE end
evaluate right
end:
```

---

## 185. BOOLEAN RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

BOOLEAN RESULT

Los caminos de `AND/OR` deben producir:

```text
Boolean
```

---

## 186. NO OPERAND RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO OPERAND RETURN

AEL no implementa JavaScript-style:

```text
a || b
```

devolviendo un valor arbitrario.

`OR` devuelve Boolean.

---

## 187. STRING CONCATENATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING CONCATENATION

V1 debe definir explícitamente si:

```text
String + String
```

significa concatenación.

Recomendación:

```text
sí
```

---

## 188. STRING + STRING

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING + STRING

```text
String + String → String
```

---

## 189. STRING + NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING + NUMBER

No permitir implícitamente.

---

## 190. STRING + MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING + MONEY

No permitir implícitamente.

---

## 191. EXPLICIT TEXT CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

EXPLICIT TEXT CONVERSION

Utilizar Function explícita si se requiere:

```text
A_TEXTO
```

---

## 192. STRING COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

STRING COMPARISON

Equality es:

```text
Unicode semantic equality
```

según normalización definida.

---

## 193. UNICODE NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

UNICODE NORMALIZATION

La plataforma debe elegir una política explícita.

Recomendación:

```text
no normalizar silenciosamente
```

salvo que la semántica del lenguaje lo defina.

---

## 194. CASE SENSITIVITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CASE SENSITIVITY

Equality de Strings debe ser:

```text
case-sensitive
```

por defecto.

---

## 195. CASE INSENSITIVE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CASE INSENSITIVE

Usar Function explícita para comparación case-insensitive.

---

## 196. DATE/TIME

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DATE/TIME

Si AEL incorpora tipos temporales, sus operadores deberán registrarse en OperatorRegistry.

No improvisar reglas fuera de este sistema.

---

## 197. TEMPORAL COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

TEMPORAL COMPARISON

Cuando se soporte:

```text
DateTime < DateTime
```

debe ser válido.

---

## 198. DATE + NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DATE + NUMBER

No asumir:

```text
Date + 1 = next day
```

sin una semántica explícita.

---

## 199. TEMPORAL FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

TEMPORAL FUNCTIONS

Preferir Functions para:

```text
sumar días
diferencia de fechas
inicio de mes
```

---

## 200. DIVISION SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DIVISION SEMANTICS

Definir precisión y escala explícitamente.

---

## 201. NUMBER DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NUMBER DIVISION

No depender del comportamiento de JavaScript.

---

## 202. DECIMAL DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DECIMAL DIVISION

Debe existir política de:

```text
precision
scale
rounding
```

---

## 203. MONEY DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY DIVISION

```text
Money<C> / Number
```

debe preservar currency y utilizar decimal exacto.

---

## 204. MODULO SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MODULO SEMANTICS

Definir comportamiento para negativos.

Recomendación:

```text
documented mathematical remainder policy
```

y tests específicos.

---

## 205. NEGATIVE ZERO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NEGATIVE ZERO

El sistema decimal debe normalizar o tratar explícitamente:

```text
-0
```

para evitar resultados inconsistentes.

---

## 206. OPERATOR ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR ERRORS

Errores deben ser estables:

```text
AEL-TYPE-001
AEL-MATH-001
AEL-DIMENSION-001
AEL-CURRENCY-001
AEL-NULL-001
```

---

## 207. DIAGNOSTIC

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

DIAGNOSTIC

Debe indicar:

```text
operator
left type
right type
expected types
source span
```

---

## 208. EXAMPLE DIAGNOSTIC

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

EXAMPLE DIAGNOSTIC

```text
El operador + no admite Money<COP> + Money<USD>.
Utilice una conversión monetaria explícita.
```

---

## 209. ERROR LOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

ERROR LOCATION

Analyzer debe señalar:

```text
operator span
```

no sólo toda la expresión.

---

## 210. RUNTIME DEFENSE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RUNTIME DEFENSE

Aunque Analyzer valide tipos, Runtime debe proteger:

```text
type invariants
dimension invariants
currency invariants
```

---

## 211. CORRUPTED ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CORRUPTED ARTIFACT

Si un Artifact contiene:

```text
ADD
Money<COP>
Quantity<M2>
```

Runtime debe rechazarlo.

---

## 212. NO SILENT CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO SILENT CONVERSION

Runtime nunca debe "arreglar":

```text
invalid operands
```

mediante conversiones improvisadas.

---

## 213. TEST MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

TEST MATRIX

Para cada operator:

```text
valid operands
invalid operands
boundary
null
overflow
precision
runtime consistency
```

---

## 214. GOLDEN OPERATOR TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

GOLDEN OPERATOR TESTS

Mantener fixtures con:

```text
expression
expected type
expected result
```

---

## 215. ANALYZER/RUNTIME PARITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

ANALYZER/RUNTIME PARITY

Cada golden test debe poder verificar:

```text
Analyzer accepted
Compiler generated
Runtime produced expected result
```

---

## 216. PROPERTY TESTING

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PROPERTY TESTING

Aplicar a operaciones matemáticas cuando sea adecuado:

```text
a + b == b + a
```

sólo cuando la semántica matemática lo permita y sin asumir propiedades falsas por redondeo.

---

## 217. MONEY PROPERTY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

MONEY PROPERTY TEST

No asumir asociatividad perfecta si existen:

```text
rounding operations
```

---

## 218. QUANTITY PROPERTY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

QUANTITY PROPERTY TEST

Verificar invariantes dimensionales.

---

## 219. SHORT-CIRCUIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md; Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

SHORT-CIRCUIT TEST

```text
VERDADERO OR function_that_fails()
```

no debe invocar Function.

---

## 220. ORDER TEST

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

ORDER TEST

Si:

```text
f()
g()
```

tienen observabilidad autorizada, verificar orden:

```text
f → g
```

---

## 221. PURE OPTIMIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PURE OPTIMIZATION

Compiler sólo puede reordenar/eliminar operaciones si:

```text
semantics preserved
```

---

## 222. V1 OPTIMIZATION POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

V1 OPTIMIZATION POLICY

No reordenar instrucciones.

Prioridad:

```text
correctness
auditability
determinism
```

---

## 223. OPERATOR DOCUMENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR DOCUMENTATION

Cada operator debe documentar:

```text
syntax
precedence
types
result
errors
examples
```

---

## 224. OPERATOR CATALOG

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR CATALOG

La UI administrativa puede mostrar:

```text
operator
description
supported types
```

---

## 225. NO USER-DEFINED OPERATORS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO USER-DEFINED OPERATORS

V1 no permite crear operadores personalizados.

---

## 226. RESERVED TOKENS

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RESERVED TOKENS

Los operadores son parte estable de la gramática.

---

## 227. COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPATIBILITY

Cambiar la semántica de un operador es:

```text
breaking language change
```

---

## 228. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

LANGUAGE VERSION

Si se cambia:

```text
+ semantics
```

debe aumentar:

```text
AEL language version
```

---

## 229. ARTIFACT VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

ARTIFACT VERSION

Artifact debe identificar:

```text
language version
```

---

## 230. HISTORICAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

HISTORICAL EXECUTION

Runtime debe poder ejecutar Artifacts históricos compatibles con su language version.

---

## 231. NO SEMANTIC DRIFT

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

NO SEMANTIC DRIFT

Una actualización del Runtime no debe cambiar silenciosamente:

```text
meaning of existing Artifact
```

---

## 232. OPERATOR SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

OPERATOR SNAPSHOT

Artifact puede incluir:

```text
operator semantics version
```

o depender del language version.

---

## 233. RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

RECOMMENDATION

V1:

```text
operator semantics tied to language version
```

---

## 234. FUNCTION INTERACTION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

FUNCTION INTERACTION

Functions utilizan el Type System.

Operators también.

No permitir que una Function cree una excepción arbitraria al sistema de tipos.

---

## 235. CONTRACT INTERACTION

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

CONTRACT INTERACTION

Contracts entregan valores tipados.

Operators consumen esos tipos.

---

## 236. COMPLETE EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPLETE EXAMPLE

```text
PROPERTY.AREA_PRIVATE *
PARAMETER.TARIFA_M2
```

Analyzer:

```text
Quantity<AREA,M2>
*
MoneyPerArea<COP>
```

Result:

```text
Money<COP>
```

---

## 237. COMPLETE INVALID EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPLETE INVALID EXAMPLE

```text
PROPERTY.AREA_PRIVATE +
PARAMETER.TARIFA_M2
```

Analyzer:

```text
AEL-TYPE-001
```

Compilation:

```text
blocked
```

Runtime:

```text
never reached
```

---

## 238. COMPLETE SHORT-CIRCUIT EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

COMPLETE SHORT-CIRCUIT EXAMPLE

```text
PROPERTY.IS_ACTIVE
AND
PROPERTY.AREA_PRIVATE > 0
```

Compilation puede producir:

```text
LOAD_CONTRACT IS_ACTIVE
JUMP_IF_FALSE end
LOAD_CONTRACT AREA_PRIVATE
LOAD_LITERAL 0
GREATER_THAN
end:
```

---

## 239. BENEFIT

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

BENEFIT

Si `IS_ACTIVE` es falso:

```text
AREA_PRIVATE
```

no necesita ser consultado.

---

## 240. FINAL OPERATOR ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

FINAL OPERATOR ARCHITECTURE

```text
                    OperatorRegistry
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
         Analyzer       Compiler        Runtime
            │              │              │
            ▼              ▼              ▼
       Type checking   Opcode emit    Opcode execute
            │              │              │
            └──────────────┴──────────────┘
                           │
                           ▼
                    Same semantics
```

---

## 241. PRINCIPIO DE CONSISTENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PRINCIPIO DE CONSISTENCIA

Una expresión debe tener:

```text
un significado
```

independientemente de si está:

```text
analizándose
compilándose
ejecutándose
```

---

## 242. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PRINCIPIO DE SEGURIDAD

No existen:

```text
implicit truthiness
implicit currency conversion
implicit dimension conversion
implicit string coercion
```

---

## 243. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PRINCIPIO FINANCIERO

Las operaciones Money utilizan:

```text
exact decimal
explicit currency
explicit rounding
```

---

## 244. PRINCIPIO DIMENSIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PRINCIPIO DIMENSIONAL

Quantity respeta:

```text
dimension algebra
unit compatibility
```

---

## 245. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Operator_System_Expression_Semantics 33.md

PRINCIPIO DE DETERMINISMO

Short-circuit, orden de evaluación y operaciones deben ser:

```text
deterministic
```

---

## 246. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

OBJETIVO

Definir:

```text
SI
ENTONCES
SINO
branching
blocks
scope
narrowing
return
unreachable code
jump semantics
control-flow validation
```

---

## 247. CONDICIONAL PRINCIPAL

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONDICIONAL PRINCIPAL

La construcción V1 será conceptualmente:

```text
SI condicion ENTONCES
    expresion
SINO
    expresion
```

---

## 248. CONDICIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONDICIÓN

`condicion` debe ser:

```text
Boolean
```

---

## 249. NO TRUTHINESS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO TRUTHINESS

No aceptar:

```text
SI 1 ENTONCES
SI "SI" ENTONCES
SI 100 ENTONCES
```

---

## 250. CONDICIONAL COMO EXPRESIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONDICIONAL COMO EXPRESIÓN

V1 recomienda que `SI` pueda producir un valor:

```text
SI condicion ENTONCES A SINO B
```

resultado:

```text
commonType(A,B)
```

---

## 251. COMMON TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

COMMON TYPE

Las dos ramas deben producir tipos compatibles.

Ejemplo:

```text
SI activo ENTONCES 100 SINO 0
```

→

```text
Number
```

---

## 252. INVALID BRANCH TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

INVALID BRANCH TYPES

Ejemplo:

```text
SI activo ENTONCES Money<COP> SINO Quantity<M2>
```

debe producir:

```text
AEL-TYPE-001
```

---

## 253. ELSE OBLIGATORIO

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ELSE OBLIGATORIO

Para un condicional que produce valor:

```text
SINO
```

es obligatorio.

---

## 254. STATEMENT CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

STATEMENT CONDITIONAL

Si posteriormente AEL incorpora statements, puede existir:

```text
SI condicion ENTONCES
    ...
```

sin valor.

No mezclar esta semántica con el condicional expresión de V1 sin una definición explícita.

---

## 255. NESTED CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NESTED CONDITIONAL

Permitido:

```text
SI a ENTONCES
    SI b ENTONCES x SINO y
SINO
    z
```

---

## 256. ELSE ASSOCIATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ELSE ASSOCIATION

`SINO` debe asociarse siempre al `SI` estructuralmente correspondiente.

La gramática debe eliminar cualquier ambigüedad de dangling else.

---

## 257. PARENTHESES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PARENTHESES

Paréntesis permiten controlar expresiones:

```text
SI (a AND b) ENTONCES x SINO y
```

---

## 258. CONDITION EVALUATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONDITION EVALUATION

La condición se evalúa:

```text
antes
```

de cualquier rama.

---

## 259. LAZY BRANCHING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

LAZY BRANCHING

Sólo se evalúa:

```text
una rama
```

---

## 260. NO EAGER BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO EAGER BRANCH

No evaluar ambas ramas antes de seleccionar resultado.

---

## 261. SIDE EFFECT PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SIDE EFFECT PROTECTION

Una Function de una rama no ejecutada:

```text
NO debe invocarse.
```

---

## 262. PROVIDER PROTECTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PROVIDER PROTECTION

Un Contract de una rama no ejecutada:

```text
NO debe consultarse.
```

---

## 263. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

EXAMPLE

```text
SI PROPERTY.IS_ACTIVE ENTONCES
    PROPERTY.AREA_PRIVATE
SINO
    0 M2
```

Sólo se consulta `AREA_PRIVATE` si:

```text
IS_ACTIVE = VERDADERO
```

---

## 264. TYPE OF CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

TYPE OF CONDITIONAL

Conceptualmente:

```text
type(
    SI c ENTONCES a SINO b
)
=
commonType(type(a), type(b))
```

---

## 265. NULLABLE BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NULLABLE BRANCH

Ejemplo:

```text
SI existe ENTONCES valor SINO NULO
```

resultado:

```text
Nullable<T>
```

---

## 266. NULL PROMOTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NULL PROMOTION

Si:

```text
A : T
B : Null
```

entonces:

```text
commonType(A,B)
=
Nullable<T>
```

---

## 267. NULLABLE BOTH BRANCHES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NULLABLE BOTH BRANCHES

```text
Nullable<T>
Nullable<T>
```

→

```text
Nullable<T>
```

---

## 268. DIFFERENT NULLABLE TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

DIFFERENT NULLABLE TYPES

```text
Nullable<Money<COP>>
Money<COP>
```

→

```text
Nullable<Money<COP>>
```

---

## 269. CONDITION TYPE CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONDITION TYPE CHECK

Analyzer debe rechazar:

```text
SI Money<COP> ENTONCES ...
```

---

## 270. CONTROL FLOW GRAPH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW GRAPH

Analyzer/Compiler debe poder representar:

```text
condition
   │
 ┌─┴─┐
 ▼   ▼
then else
 └─┬─┘
   ▼
 merge
```

---

## 271. CFG

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CFG

Conceptualmente:

```text
BasicBlock
ControlFlowGraph
```

---

## 272. BASIC BLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

BASIC BLOCK

Bloque de instrucciones con:

```text
one entry
one or controlled exits
```

---

## 273. JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

JUMP

Compiler puede generar:

```text
JUMP
JUMP_IF_FALSE
JUMP_IF_TRUE
```

según implementación.

---

## 274. CONDITIONAL COMPILATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONDITIONAL COMPILATION

Ejemplo:

```text
SI c ENTONCES a SINO b
```

puede compilarse como:

```text
evaluate c
JUMP_IF_FALSE elseLabel

evaluate a
JUMP endLabel

elseLabel:
evaluate b

endLabel:
```

---

## 275. STACK CONSISTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

STACK CONSISTENCY

Ambas ramas deben dejar:

```text
same stack shape
```

al llegar al merge.

---

## 276. STACK EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

STACK EXAMPLE

Si `a` produce un valor:

```text
then → push 1 value
else → push 1 value
```

merge válido.

---

## 277. INVALID STACK MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

INVALID STACK MERGE

Si:

```text
then → 1 value
else → 0 values
```

y el resultado requiere un valor:

```text
compile error
```

---

## 278. CONTROL FLOW STACK ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW STACK ANALYSIS

Compiler debe validar:

```text
stack depth
```

en cada basic block.

---

## 279. STACK TYPE ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

STACK TYPE ANALYSIS

No sólo profundidad:

```text
stack types
```

deben ser compatibles.

---

## 280. BRANCH MERGE TYPES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

BRANCH MERGE TYPES

Ejemplo:

```text
then stack: [Money<COP>]
else stack: [Money<COP>]
```

válido.

---

## 281. BRANCH MERGE NULLABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

BRANCH MERGE NULLABILITY

```text
then: Money<COP>
else: Null
```

merge:

```text
Nullable<Money<COP>>
```

---

## 282. SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SCOPE

Cada bloque debe tener un alcance definido.

---

## 283. BLOCK SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

BLOCK SCOPE

Si V1 incorpora variables locales:

```text
block scope
```

debe ser explícito.

---

## 284. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

V1 RECOMMENDATION

Mantener el lenguaje predominantemente expression-oriented y evitar variables mutables innecesarias.

---

## 285. LOCAL VALUES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

LOCAL VALUES

Los valores temporales del Artifact pueden vivir en:

```text
locals
```

sin implicar variables mutables visibles al usuario.

---

## 286. VARIABLE DECLARATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

VARIABLE DECLARATIONS

No introducir declaraciones generales si no forman parte de la gramática V1.

---

## 287. LEXICAL SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

LEXICAL SCOPE

Si existen bindings futuros:

```text
lexical scope
```

debe ser la regla.

---

## 288. SHADOWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SHADOWING

V1 recomienda:

```text
no shadowing
```

para evitar ambigüedad.

---

## 289. NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NARROWING

El Analyzer puede refinar tipos después de una condición.

---

## 290. NULL NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NULL NARROWING

Ejemplo:

```text
SI valor != NULO ENTONCES
    usar(valor)
SINO
    ...
```

Dentro de la rama verdadera:

```text
valor : T
```

en lugar de:

```text
Nullable<T>
```

---

## 291. NARROWING REQUIREMENT

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NARROWING REQUIREMENT

El narrowing sólo puede realizarse si la condición es una forma reconocida y segura.

---

## 292. NO UNSAFE NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO UNSAFE NARROWING

No inferir:

```text
Number → NonZeroNumber
```

sólo porque aparezca en una expresión arbitraria.

---

## 293. BOOLEAN NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

BOOLEAN NARROWING

No existe:

```text
truthy narrowing
```

---

## 294. CONTRACT NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTRACT NARROWING

Una condición puede permitir narrowing sólo si el Contract System lo declara.

---

## 295. TYPE GUARDS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

TYPE GUARDS

V1 puede soportar guards internos como:

```text
x != NULO
```

sin introducir una sintaxis adicional.

---

## 296. NARROWING SCOPE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NARROWING SCOPE

El narrowing aplica únicamente al:

```text
control-flow region
```

validado por Analyzer.

---

## 297. NARROWING AFTER MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NARROWING AFTER MERGE

Después del merge:

```text
original nullable type
```

debe restaurarse salvo que todas las rutas garanticen non-null.

---

## 298. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

EXAMPLE

```text
SI email != NULO ENTONCES
    ...
SINO
    ...
```

Después del `SI` completo:

```text
email : Nullable<String>
```

---

## 299. ALL-PATH NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ALL-PATH NARROWING

Si todas las rutas posteriores garantizan:

```text
email != NULO
```

Analyzer puede conservar el narrowing.

---

## 300. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

V1 RECOMMENDATION

Implementar inicialmente sólo narrowing de:

```text
Nullable<T>
```

---

## 301. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN

Una expresión/Rule puede terminar con:

```text
RETURN value
```

según la sintaxis definitiva del lenguaje.

---

## 302. RETURN TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN TYPE

El resultado debe coincidir con:

```text
Rule return type
```

---

## 303. RETURN IN BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN IN BRANCH

Permitido:

```text
SI c ENTONCES
    RETURN a
SINO
    RETURN b
```

si ambos retornos son compatibles.

---

## 304. RETURN MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN MERGE

Si ambas ramas retornan:

```text
no merge block
```

es necesario para esos caminos.

---

## 305. UNREACHABLE CODE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

UNREACHABLE CODE

Código después de un:

```text
RETURN
```

es:

```text
unreachable
```

---

## 306. UNREACHABLE DIAGNOSTIC

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

UNREACHABLE DIAGNOSTIC

V1 puede emitir:

```text
warning
```

o error según policy.

---

## 307. DEAD BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

DEAD BRANCH

Si la condición es una constante:

```text
SI VERDADERO ENTONCES A SINO B
```

Compiler puede detectar:

```text
dead branch
```

---

## 308. CONSTANT CONDITION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONSTANT CONDITION

Analyzer puede advertir:

```text
unreachable branch
```

---

## 309. DEAD PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

DEAD PROVIDER

Una rama muerta no debe ejecutar Provider.

---

## 310. DEAD FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

DEAD FUNCTION

Una rama muerta no debe ejecutar Function.

---

## 311. JUMP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

JUMP VALIDATION

Compiler debe verificar:

```text
jump target valid
```

---

## 312. RUNTIME JUMP VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RUNTIME JUMP VALIDATION

Runtime también verifica:

```text
target < instructionCount
```

---

## 313. CONTROL FLOW LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW LIMITS

Runtime aplica:

```text
maxInstructions
```

incluso si CFG parece correcto.

---

## 314. NO UNBOUNDED LOOPS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO UNBOUNDED LOOPS

V1 no necesita loops generales.

---

## 315. LOOP POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

LOOP POLICY

No introducir:

```text
MIENTRAS
PARA
REPETIR
```

en V1 salvo decisión posterior.

---

## 316. WHY

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

WHY

Evita inicialmente:

```text
termination complexity
resource exhaustion
complex control-flow analysis
```

---

## 317. RECURSION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RECURSION

V1 no permite:

```text
recursive user functions
```

---

## 318. FUNCTION RECURSION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

FUNCTION RECURSION

Function providers de plataforma deben evitar ciclos no controlados.

---

## 319. CONTROL FLOW AND FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW AND FUNCTIONS

Una Function puede devolver:

```text
AELValue
```

pero no alterar arbitrariamente el CFG del Artifact.

---

## 320. CONTROL FLOW AND PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW AND PROVIDERS

Provider call ocurre únicamente cuando la instruction correspondiente es alcanzada.

---

## 321. SHORT-CIRCUIT VS CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SHORT-CIRCUIT VS CONDITIONAL

Ambos utilizan:

```text
lazy evaluation
```

pero:

```text
AND/OR
```

producen Boolean.

`SI` produce el tipo común de sus ramas.

---

## 322. NESTED CONTROL FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NESTED CONTROL FLOW

Compiler debe soportar:

```text
if inside if
```

mediante labels estructurados.

---

## 323. LABEL GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

LABEL GENERATION

Labels internos no forman parte del lenguaje público.

---

## 324. LABEL DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

LABEL DETERMINISM

Compiler debe generar labels determinísticamente para el mismo AST.

---

## 325. SOURCE MAP

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SOURCE MAP

Jump instructions deben poder mapearse a:

```text
SourceSpan
```

cuando exista debug metadata.

---

## 326. CONTROL FLOW DIAGNOSTICS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW DIAGNOSTICS

Errores deben indicar:

```text
condition span
branch span
expected type
actual type
```

---

## 327. EXAMPLE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

EXAMPLE ERROR

```text
La condición de SI debe ser Boolean.
Se recibió Money<COP>.
```

---

## 328. RETURN ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN ERROR

```text
La rama retorna Quantity<M2>, pero la Rule requiere Money<COP>.
```

---

## 329. MERGE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

MERGE ERROR

```text
Las ramas producen tipos incompatibles:
Money<COP> y Quantity<M2>.
```

---

## 330. CFG VALIDATOR

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CFG VALIDATOR

Debe existir una etapa:

```text
ControlFlowValidator
```

---

## 331. RESPONSIBILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RESPONSIBILITIES

Debe validar:

```text
reachable blocks
jump targets
stack shape
return paths
merge types
```

---

## 332. COMPILER ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

COMPILER ORDER

Recomendación:

```text
AST
 ↓
Semantic Analysis
 ↓
Type Analysis
 ↓
Control Flow Analysis
 ↓
IR
 ↓
Artifact
```

---

## 333. IR BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

IR BRANCH

Semantic IR debe representar:

```text
conditional branch
jump
return
```

---

## 334. ARTIFACT BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ARTIFACT BRANCH

Artifact debe contener instrucciones verificables:

```text
JUMP
JUMP_IF_FALSE
RETURN
```

---

## 335. RUNTIME BRANCH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RUNTIME BRANCH

Runtime ejecuta únicamente:

```text
verified jump targets
```

---

## 336. STACK EFFECT TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

STACK EFFECT TABLE

Cada control-flow opcode debe declarar:

```text
stack inputs
stack outputs
```

---

## 337. JUMP_IF_FALSE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

JUMP_IF_FALSE

Stack effect:

```text
Boolean → empty
```

---

## 338. JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

JUMP

Stack effect:

```text
no stack effect
```

---

## 339. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN

Stack effect:

```text
T → execution complete
```

---

## 340. MERGE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

MERGE

Todos los predecessors deben producir:

```text
compatible stack state
```

---

## 341. EXAMPLE CFG

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

EXAMPLE CFG

```text
          [condition]
             │
        ┌────┴────┐
        ▼         ▼
      [then]    [else]
        │         │
        └────┬────┘
             ▼
           [merge]
             │
           [return]
```

---

## 342. ANALYZER FLOW STATE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ANALYZER FLOW STATE

Conceptualmente:

```ts
FlowState {
  reachable: boolean
  locals: TypeEnvironment
}
```

---

## 343. TYPE ENVIRONMENT

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

TYPE ENVIRONMENT

Debe poder representar:

```text
variable → narrowed type
```

---

## 344. MERGING TYPE ENVIRONMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

MERGING TYPE ENVIRONMENTS

En un merge:

```text
intersection of guaranteed facts
```

---

## 345. NULL FACT EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NULL FACT EXAMPLE

Branch A:

```text
x != NULO
```

Branch B:

```text
x == NULO
```

Después del merge:

```text
x : Nullable<T>
```

---

## 346. FLOW FACTS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

FLOW FACTS

V1 puede limitar flow facts a:

```text
nullability
```

---

## 347. FUTURE FLOW ANALYSIS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

FUTURE FLOW ANALYSIS

Posteriormente podría incorporar:

```text
range analysis
constant propagation
enum narrowing
```

---

## 348. V1 RESTRICTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

V1 RESTRICTION

No realizar análisis complejo que comprometa:

```text
determinism
maintainability
```

---

## 349. CONSTANT PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONSTANT PROPAGATION

Puede implementarse como optimización posterior.

---

## 350. CONTROL FLOW OPTIMIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW OPTIMIZATION

V1 sólo puede hacer optimizaciones seguras:

```text
remove unreachable constant branch
```

siempre que preserve source mapping y semantics.

---

## 351. NO SPECULATIVE EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO SPECULATIVE EXECUTION

Runtime no debe evaluar ramas especulativamente.

---

## 352. NO BRANCH PREDICTION SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO BRANCH PREDICTION SEMANTICS

Optimización de CPU no debe alterar semantics.

---

## 353. SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SECURITY

Control flow no puede saltar fuera del Artifact.

---

## 354. ARTIFACT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ARTIFACT VALIDATION

Verifier debe comprobar:

```text
all targets valid
all blocks reachable/consistent
stack transitions valid
```

---

## 355. CORRUPTED CONTROL FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CORRUPTED CONTROL FLOW

Artifact manipulado con:

```text
JUMP -1
```

debe ser rechazado antes de ejecución.

---

## 356. STACK TYPE CORRUPTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

STACK TYPE CORRUPTION

Artifact:

```text
JUMP_IF_FALSE
```

con:

```text
Money<COP>
```

en stack:

```text
rejected
```

---

## 357. RETURN CORRUPTION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

RETURN CORRUPTION

Artifact que retorna:

```text
Quantity<M2>
```

cuando expected:

```text
Money<COP>
```

debe ser rechazado.

---

## 358. CONTROL FLOW TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

CONTROL FLOW TESTS

Mínimo:

```text
simple if
if/else
nested if
null narrowing
branch merge
return branches
unreachable code
invalid condition
invalid branch type
invalid jump
stack mismatch
```

---

## 359. SHORT-CIRCUIT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

SHORT-CIRCUIT TESTS

```text
false AND failingFunction()
true OR failingFunction()
```

---

## 360. PROVIDER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PROVIDER TESTS

```text
false AND providerContract
```

no debe ejecutar Provider.

---

## 361. DETERMINISM TEST

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

DETERMINISM TEST

Mismo AST:

```text
same labels
same jumps
same Artifact
```

---

## 362. GOLDEN ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

GOLDEN ARTIFACT

Mantener Artifact esperado para:

```text
simple conditional
nested conditional
short-circuit
```

---

## 363. DEBUG MAP TEST

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

DEBUG MAP TEST

Verificar:

```text
branch instruction
→ correct source span
```

---

## 364. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PERFORMANCE

CFG analysis debe ser:

```text
linear o cercano a linear
```

respecto al tamaño del AST/CFG en V1.

---

## 365. NO RECURSIVE CFG ALGORITHM

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

NO RECURSIVE CFG ALGORITHM

Evitar algoritmos que puedan desbordar stack con expresiones profundamente anidadas.

---

## 366. MAX AST DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

MAX AST DEPTH

Compiler/Analyzer debe aplicar límites razonables.

---

## 367. MAX CONTROL FLOW NODES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

MAX CONTROL FLOW NODES

Artifact compilation puede limitar:

```text
maxBasicBlocks
```

como defensa de recursos.

---

## 368. ERROR CATEGORIES

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

ERROR CATEGORIES

```text
AEL-CONTROL-001
AEL-CONTROL-002
AEL-CONTROL-003
```

para errores de control de flujo.

---

## 369. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

EXAMPLE

```text
AEL-CONTROL-001
Invalid conditional type.
```

---

## 370. EXIT CRITERIA — AEL-CONTROL-FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

EXIT CRITERIA — AEL-CONTROL-FLOW

```text
✓ Conditional expression
✓ Boolean condition
✓ Else semantics
✓ Lazy branches
✓ CFG
✓ Basic blocks
✓ Jump generation
✓ Stack merge validation
✓ Type merge
✓ Nullable narrowing
✓ Return flow
✓ Unreachable detection
✓ No general loops in V1
✓ No user recursion
✓ Source mapping
✓ Artifact jump validation
✓ Runtime jump safety
✓ Short-circuit
✓ Deterministic compilation
✓ Control-flow tests
```

---

## 371. FINAL ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

FINAL ARCHITECTURE

```text
                AST
                 │
                 ▼
          Semantic Analysis
                 │
        ┌────────┴────────┐
        ▼                 ▼
   Type Analysis      Flow Analysis
        │                 │
        └────────┬────────┘
                 ▼
             Semantic IR
                 │
                 ▼
              Compiler
                 │
                 ▼
              Artifact
                 │
                 ▼
             Verifier
                 │
                 ▼
              Runtime
                 │
          ┌──────┴──────┐
          ▼             ▼
       THEN            ELSE
          └──────┬──────┘
                 ▼
              RESULT
```

---

## 372. PRINCIPIO DE LAZY EVALUATION

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PRINCIPIO DE LAZY EVALUATION

Una rama no alcanzada:

```text
no existe para efectos de ejecución.
```

---

## 373. PRINCIPIO DE TIPADO

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PRINCIPIO DE TIPADO

Toda condición:

```text
Boolean
```

Toda rama de una expresión condicional:

```text
compatible
```

---

## 374. PRINCIPIO DE FLOW SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PRINCIPIO DE FLOW SAFETY

Narrowing sólo existe donde:

```text
la condición lo garantiza
```

---

## 375. PRINCIPIO DE CONTROL

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PRINCIPIO DE CONTROL

Todos los jumps deben ser:

```text
válidos
verificables
deterministas
```

---

## 376. PRINCIPIO DE LIMITACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Control_Flow_Conditional_Semantics 34.md

PRINCIPIO DE LIMITACIÓN

V1 evita deliberadamente:

```text
loops generales
recursión de usuario
control flow dinámico
```

---
