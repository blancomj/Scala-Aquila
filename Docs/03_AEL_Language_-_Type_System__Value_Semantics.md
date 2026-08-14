# AEL V1 — AEL Language — Type System & Value Semantics

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
03 — Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md
32 — Motor de liquidacion_AEL_V1_Type_System 32.md
55 — Motor de liquidacion_Core Domain & Foundational Types 55.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

OBJETIVO

El Type System y el Value Engine constituyen el núcleo semántico de AEL.

Su responsabilidad es garantizar que expresiones como:

```ael
100 M2 + 20 M2
```

sean válidas, mientras:

```ael
100 M2 + 20 KG
```

sean rechazadas.

También deben permitir operaciones como:

```ael
120.50 M2 * 4500 COP/M2
```

produciendo:

```text
542250 COP
```

sin perder:

- precisión;
- unidad;
- dimensión;
- moneda;
- trazabilidad;
- determinismo.

---

## 2. PRINCIPIO FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

PRINCIPIO FUNDAMENTAL

AEL no tratará todos los valores como números.

El sistema distingue entre:

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

Además, algunos tipos poseen información semántica adicional.

Por ejemplo:

```text
MONEY<COP>
QUANTITY<AREA,M2>
QUANTITY<MASS,KG>
```

Por tanto:

```text
100
100 COP
100 M2
"100"
```

son valores diferentes.

---

## 3. OBJETIVOS DEL VALUE ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

OBJETIVOS DEL VALUE ENGINE

El Value Engine debe:

1. representar valores AEL;
2. preservar tipos;
3. preservar precisión;
4. representar unidades;
5. representar dimensiones;
6. ejecutar operaciones aritméticas;
7. ejecutar comparaciones;
8. realizar conversiones autorizadas;
9. detectar incompatibilidades;
10. detectar división por cero;
11. controlar overflow;
12. manejar NULO;
13. producir errores deterministas;
14. ser independiente de PostgreSQL;
15. ser independiente del frontend.

---

## 4. MODELO DE VALOR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MODELO DE VALOR

Conceptualmente:

```text
AELValue
│
├── type
├── value
└── metadata
```

No todas las variantes necesitan almacenar metadata adicional.

Ejemplo:

```text
NUMBER
value = 100
```

Mientras:

```text
MONEY
value = 4500
currency = COP
```

y:

```text
QUANTITY
value = 120.50
unit = M2
dimension = AREA
```

---

## 5. TYPE ID

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TYPE ID

Cada tipo debe tener un identificador estable.

Ejemplo:

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

La representación interna puede utilizar enums, strings constantes o discriminated unions, pero la semántica debe ser estable.

---

## 6. NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NUMBER

`NUMBER` representa valores numéricos sin información de unidad o moneda.

Ejemplos:

```ael
10
100
-25
0
```

Se utilizará principalmente para:

- conteos;
- índices;
- factores;
- resultados adimensionales.

---

## 7. DECIMAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DECIMAL

`DECIMAL` representa un número decimal con precisión controlada.

Ejemplos:

```ael
10.5
0.25
120.50
```

La distinción entre `NUMBER` y `DECIMAL` debe ser cuidadosamente implementada.

Recomendación normativa:

> `NUMBER` representa el tipo numérico general del lenguaje, mientras la implementación utiliza internamente una representación decimal exacta o controlada.

No crear dos semánticas numéricas incompatibles sin necesidad.

---

## 8. DECISIÓN DE IMPLEMENTACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DECISIÓN DE IMPLEMENTACIÓN

Para V1 se recomienda:

```text
NUMBER
   ↓
representación decimal exacta
```

en lugar de:

```text
NUMBER → IEEE-754 float
```

El usuario no debe sufrir efectos como:

```text
0.1 + 0.2 = 0.30000000000000004
```

---

## 9. BOOLEAN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

BOOLEAN

Valores permitidos:

```ael
VERDADERO
FALSO
```

No existe coerción automática desde:

```text
NUMBER
STRING
MONEY
QUANTITY
```

hacia BOOLEAN.

Por ejemplo:

```ael
SI 1 ENTONCES
```

es inválido.

---

## 10. STRING

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

STRING

Representa texto.

Ejemplos:

```ael
"Activo"
"Copropiedad"
"Cuota administrativa"
```

No tiene unidad ni dimensión.

---

## 11. DATE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DATE

Representa una fecha calendario.

Conceptualmente:

```text
DATE
year
month
day
```

No debe contener una hora.

---

## 12. DATETIME

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DATETIME

Representa fecha y hora.

Conceptualmente:

```text
DATETIME
date
time
timezone/context
```

La estrategia de zona horaria debe ser definida por AQUILA y aplicada de forma consistente.

---

## 13. DATE VS DATETIME

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DATE VS DATETIME

No se debe asumir:

```text
DATE == DATETIME
```

Ejemplo:

```text
2026-08-13
```

no es automáticamente:

```text
2026-08-13 00:00:00
```

sin una conversión explícita.

---

## 14. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MONEY

`MONEY` representa una cantidad monetaria.

Conceptualmente:

```text
Money
├── amount: Decimal
└── currency: CurrencyCode
```

Ejemplo:

```text
4500 COP
```

---

## 15. CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CURRENCY

La moneda se representa mediante un código normalizado.

Ejemplos:

```text
COP
USD
EUR
```

La lista oficial debe provenir de un catálogo controlado.

No permitir monedas arbitrarias como:

```text
XYZ
ABC
```

salvo que estén registradas.

---

## 16. MONEY NO ES NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MONEY NO ES NUMBER

No debe permitirse:

```ael
100 + 500 COP
```

sin una regla explícita de promoción.

La recomendación para V1 es:

> No realizar promoción implícita entre NUMBER y MONEY.

---

## 17. OPERACIONES MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

OPERACIONES MONEY

Permitidas:

```text
MONEY + MONEY
MONEY - MONEY
MONEY * NUMBER
MONEY / NUMBER
```

cuando las reglas de compatibilidad se cumplan.

Ejemplos:

```ael
100000 COP + 50000 COP
```

```ael
100000 COP * 0.10
```

```ael
100000 COP / 2
```

---

## 18. MONEY + MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MONEY + MONEY

Sólo se permite cuando las monedas sean iguales.

Válido:

```ael
100000 COP + 50000 COP
```

Inválido:

```ael
100000 COP + 50 USD
```

El segundo caso requiere conversión monetaria explícita.

---

## 19. MONEY * MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MONEY * MONEY

No se permitirá en V1:

```ael
100 COP * 50 COP
```

porque produciría una dimensión monetaria compuesta que no representa una operación empresarial estándar.

Debe producir:

```text
AEL-TYPE-MONEY-001
```

o código equivalente definido por el catálogo de errores.

---

## 20. MONEY / MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MONEY / MONEY

Puede producir una razón adimensional si la semántica del lenguaje lo requiere.

Sin embargo, para V1 se recomienda restringir esta operación a escenarios explícitamente válidos.

Ejemplo potencial:

```text
100 COP / 50 COP = 2
```

Si se habilita, deberá estar definido en la matriz formal de operaciones.

---

## 21. REDONDEO MONETARIO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

REDONDEO MONETARIO

El redondeo monetario debe ser explícito.

Función recomendada:

```ael
REDONDEAR_DINERO(valor)
```

o:

```ael
REDONDEAR_DINERO(valor, escala)
```

La política de redondeo debe ser determinista.

---

## 22. POLÍTICA DE REDONDEO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

POLÍTICA DE REDONDEO

La implementación debe definir una política oficial, por ejemplo:

```text
ROUND_HALF_UP
```

o la política contable/financiera que AQUILA adopte.

No utilizar el comportamiento accidental de una librería como especificación.

---

## 23. PRECISIÓN MONETARIA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

PRECISIÓN MONETARIA

La moneda puede tener una escala estándar.

Sin embargo, no asumir que todas las monedas tienen necesariamente dos decimales.

La configuración debe provenir del catálogo de monedas.

Ejemplo conceptual:

```text
COP → escala definida por AQUILA
USD → escala definida por catálogo
```

---

## 24. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

QUANTITY

`QUANTITY` representa una magnitud asociada a una unidad.

Modelo:

```text
Quantity
├── magnitude
├── unit
└── dimension
```

Ejemplo:

```text
120.50 M2
```

---

## 25. UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

UNIT

Una unidad debe contener conceptualmente:

```text
Unit
├── code
├── name
├── dimension
├── conversion
└── metadata
```

Ejemplo:

```text
M2
Nombre: metro cuadrado
Dimensión: AREA
```

---

## 26. DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIMENSION

La dimensión representa la naturaleza matemática de una cantidad.

Ejemplos:

```text
LENGTH
AREA
VOLUME
MASS
TIME
```

En la interfaz funcional se recomienda español:

```text
LONGITUD
AREA
VOLUMEN
MASA
TIEMPO
```

La representación interna puede utilizar identificadores técnicos estables.

---

## 27. DIMENSION VECTOR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIMENSION VECTOR

Las dimensiones pueden representarse mediante exponentes.

Ejemplo:

```text
LONGITUD = L¹
AREA = L²
VOLUMEN = L³
```

Una representación conceptual:

```text
DimensionVector
├── length
├── mass
├── time
└── currency
```

La implementación puede extender este vector si AQUILA incorpora otras magnitudes.

---

## 28. DIMENSION DERIVADA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIMENSION DERIVADA

Ejemplo:

```text
M2 * M2
```

produce:

```text
L² * L² = L⁴
```

La dimensión matemática resultante es válida aunque no necesariamente exista una unidad comercial registrada para ella.

---

## 29. UNIDAD VS DIMENSIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

UNIDAD VS DIMENSIÓN

No confundir:

```text
M2
```

con:

```text
AREA
```

`AREA` es una dimensión.

`M2` es una unidad de esa dimensión.

Por tanto:

```text
100 M2
```

significa:

```text
magnitud = 100
unidad = M2
dimensión = AREA
```

---

## 30. CONVERSIÓN DE UNIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CONVERSIÓN DE UNIDADES

Sólo se permite convertir entre unidades de una misma dimensión cuando exista una relación conocida.

Ejemplo:

```text
1 M = 100 CM
```

```text
1 M2 = 10000 CM2
```

```text
1 HA = 10000 M2
```

---

## 31. CONVERSIÓN NO VÁLIDA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CONVERSIÓN NO VÁLIDA

No se permite:

```text
1 M → KG
```

porque:

```text
LONGITUD ≠ MASA
```

El Analyzer debe rechazarlo.

---

## 32. NORMALIZACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NORMALIZACIÓN

Para operaciones entre unidades compatibles, el Value Engine puede normalizar internamente a una unidad base.

Ejemplo:

```text
1 M + 50 CM
```

se puede normalizar:

```text
1 M
+
0.5 M
=
1.5 M
```

El resultado debe respetar una política de unidad de salida.

---

## 33. UNIDAD DEL RESULTADO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

UNIDAD DEL RESULTADO

Debe definirse una política.

Recomendación:

> Cuando una operación suma o resta valores compatibles, conservar la unidad del operando de referencia definido por la expresión o normalizar a la unidad canónica.

La elección concreta debe ser consistente y quedar cubierta por tests.

---

## 34. SUMA DE CANTIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

SUMA DE CANTIDADES

Permitido:

```ael
100 M2 + 20 M2
```

Resultado:

```text
120 M2
```

También:

```ael
1 M + 50 CM
```

debe ser válido después de conversión.

---

## 35. RESTA DE CANTIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

RESTA DE CANTIDADES

Permitido:

```ael
100 M2 - 20 M2
```

Resultado:

```text
80 M2
```

---

## 36. SUMA DE DIMENSIONES DISTINTAS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

SUMA DE DIMENSIONES DISTINTAS

Inválido:

```ael
100 M2 + 20 KG
```

Resultado:

```text
ERROR
```

No realizar conversión implícita.

---

## 37. MULTIPLICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MULTIPLICACIÓN

Una Quantity multiplicada por NUMBER conserva dimensión:

```ael
100 M2 * 2
```

Resultado:

```text
200 M2
```

---

## 38. MULTIPLICACIÓN DE CANTIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MULTIPLICACIÓN DE CANTIDADES

Dos Quantity pueden multiplicarse si la operación dimensional resultante es válida.

Ejemplo:

```text
10 M * 5 M = 50 M2
```

---

## 39. CANTIDAD × TARIFA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CANTIDAD × TARIFA

Este será un caso fundamental de AQUILA.

```ael
120.50 M2 * 4500 COP/M2
```

Dimensionalmente:

```text
L² × MONEDA/L²
=
MONEDA
```

Resultado:

```text
542250 COP
```

---

## 40. TARIFA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TARIFA

Una tarifa como:

```text
4500 COP/M2
```

se representa como un valor monetario con dimensión compuesta:

```text
MONEDA × AREA⁻¹
```

No crear un tipo especial de tarifa únicamente para resolver este caso.

Debe ser una consecuencia del sistema dimensional.

---

## 41. DIVISIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIVISIÓN

Ejemplo:

```text
100 M2 / 2
```

Resultado:

```text
50 M2
```

---

## 42. DIVISIÓN DE CANTIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIVISIÓN DE CANTIDADES

Ejemplo:

```text
100 M2 / 20 M2
```

Resultado:

```text
5
```

porque:

```text
AREA / AREA = 1
```

---

## 43. DIVISIÓN POR CERO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIVISIÓN POR CERO

Nunca devolver:

```text
Infinity
NaN
```

Debe producir un error AEL.

Código conceptual:

```text
AEL-MATH-001
DIVISION_BY_ZERO
```

---

## 44. COMPARACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

COMPARACIÓN

Los valores comparables deben pertenecer a tipos compatibles.

Válido:

```ael
100 M2 > 50 M2
```

Válido:

```ael
100 COP > 50 COP
```

Inválido:

```ael
100 M2 > 50 KG
```

---

## 45. IGUALDAD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

IGUALDAD

La igualdad debe respetar tipo y semántica.

Ejemplo:

```ael
1 M == 100 CM
```

debe poder evaluarse como verdadero porque representan la misma cantidad física.

Mientras:

```ael
1 M == 1 KG
```

es inválido o falso según la política definida.

Recomendación normativa:

> Comparar valores dimensionalmente incompatibles debe producir error, no `FALSO`.

Esto evita ocultar errores de lógica.

---

## 46. MONEY E IGUALDAD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MONEY E IGUALDAD

```ael
100 COP == 100 COP
```

es verdadero.

```ael
100 COP == 100 USD
```

no debe asumirse verdadero/falso sin una conversión explícita.

---

## 47. NULO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NULO

`NULO` representa ausencia de valor.

No representa:

```text
0
""
FALSO
```

---

## 48. OPERACIONES CON NULO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

OPERACIONES CON NULO

AEL debe utilizar una política explícita.

Recomendación para V1:

```text
NULO + valor
```

produce:

```text
NULO
```

salvo funciones que definan otro comportamiento.

Sin embargo:

```text
NULO > 10
```

no debe convertirse automáticamente en:

```text
FALSO
```

Debe generar un resultado definido por la semántica de comparación con NULO.

La decisión final deberá quedar en la matriz normativa de NULO.

---

## 49. NULO Y FUNCIONES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NULO Y FUNCIONES

Cada Function debe declarar si acepta NULO.

Ejemplo:

```text
SUM
```

puede definir:

```text
ignorar NULO
```

o:

```text
rechazar NULO
```

La decisión debe ser explícita.

---

## 50. LIST

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

LIST

Modelo:

```text
List
├── elementType
└── values[]
```

Ejemplo:

```ael
[10, 20, 30]
```

tipo:

```text
LIST<NUMBER>
```

---

## 51. LISTAS HOMOGÉNEAS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

LISTAS HOMOGÉNEAS

Recomendación V1:

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

inválido.

Esto simplifica el Type System y el Runtime.

---

## 52. LISTAS DE CANTIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

LISTAS DE CANTIDADES

Permitido:

```ael
[10 M2, 20 M2, 30 M2]
```

tipo:

```text
LIST<QUANTITY<AREA>>
```

No:

```ael
[10 M2, 20 KG]
```

salvo que V1 defina explícitamente un tipo unión, lo cual no se recomienda inicialmente.

---

## 53. NULO EN LISTAS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NULO EN LISTAS

Si se habilita:

```ael
[10, NULO, 20]
```

la lista deberá tener semántica explícita.

Recomendación:

```text
LIST<NUMBER?>
```

La notación interna puede ser distinta, pero la idea es:

> El elemento puede ser NUMBER o NULO.

---

## 54. TYPE COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TYPE COMPATIBILITY

El Analyzer debe poder responder:

```text
¿A es compatible con B?
```

Ejemplos:

```text
NUMBER ↔ NUMBER
```

compatible.

```text
MONEY<COP> ↔ MONEY<COP>
```

compatible.

```text
MONEY<COP> ↔ MONEY<USD>
```

no compatible directamente.

```text
QUANTITY<AREA> ↔ QUANTITY<MASS>
```

incompatible.

---

## 55. PROMOCIÓN NUMÉRICA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

PROMOCIÓN NUMÉRICA

AEL puede permitir:

```text
NUMBER
```

y:

```text
DECIMAL
```

dentro de una jerarquía numérica controlada.

Recomendación:

```text
NUMBER
   ↓
DECIMAL
```

La implementación debe evitar conversiones que pierdan precisión.

---

## 56. CONVERSIONES IMPLÍCITAS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CONVERSIONES IMPLÍCITAS

V1 será conservadora.

No permitir implícitamente:

```text
STRING → NUMBER
NUMBER → STRING
STRING → BOOLEAN
NUMBER → BOOLEAN
MONEY → NUMBER
QUANTITY → NUMBER
```

---

## 57. CONVERSIONES EXPLÍCITAS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CONVERSIONES EXPLÍCITAS

Las conversiones deben utilizar Functions.

Ejemplos conceptuales:

```ael
NUMERO("100")
TEXTO(100)
```

La lista definitiva de Functions de conversión deberá formar parte del catálogo estándar.

---

## 58. VALUE ENGINE API

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

VALUE ENGINE API

Conceptualmente el núcleo deberá ofrecer operaciones equivalentes a:

```text
add(a, b)
subtract(a, b)
multiply(a, b)
divide(a, b)

equals(a, b)
compare(a, b)

convert(value, targetUnit)

round(value, scale)
```

Estas operaciones deben ser semánticas, no simples operaciones JavaScript.

---

## 59. ADD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

ADD

Reglas:

```text
NUMBER + NUMBER
DECIMAL + DECIMAL
MONEY + MONEY compatible
QUANTITY + QUANTITY compatible
```

El resto:

```text
ERROR
```

---

## 60. SUBTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

SUBTRACT

Misma lógica que `ADD`.

---

## 61. MULTIPLY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MULTIPLY

Casos principales:

```text
NUMBER × NUMBER
MONEY × NUMBER
QUANTITY × NUMBER
QUANTITY × QUANTITY
QUANTITY × RATE
```

El resultado se determina mediante reglas dimensionales.

---

## 62. DIVIDE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DIVIDE

Casos principales:

```text
NUMBER / NUMBER
MONEY / NUMBER
QUANTITY / NUMBER
QUANTITY / QUANTITY
```

Siempre controlar:

```text
divisor = 0
```

---

## 63. RESULTADO DIMENSIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

RESULTADO DIMENSIONAL

El algoritmo conceptual:

```text
dim_resultado =
    dim_a × dim_b
```

donde la multiplicación suma exponentes.

Para división:

```text
dim_resultado =
    dim_a ÷ dim_b
```

restando exponentes.

---

## 64. EJEMPLO DIMENSIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

EJEMPLO DIMENSIONAL

```text
AREA = L²

RATE = MONEY × L⁻²
```

Entonces:

```text
AREA × RATE
=
L² × MONEY × L⁻²
=
MONEY
```

---

## 65. NORMALIZACIÓN DIMENSIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NORMALIZACIÓN DIMENSIONAL

Antes de comparar o sumar:

1. verificar dimensión;
2. verificar compatibilidad;
3. convertir unidad si corresponde;
4. ejecutar operación;
5. seleccionar unidad de resultado.

---

## 66. UNIT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

UNIT REGISTRY

Debe existir un catálogo central:

```text
UnitRegistry
```

responsable de:

- registrar unidades;
- identificar dimensión;
- convertir;
- validar compatibilidad;
- devolver metadata.

El Runtime no debe mantener listas codificadas manualmente como:

```text
if unit === "M2"
```

en múltiples lugares.

---

## 67. CURRENCY REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CURRENCY REGISTRY

Igualmente:

```text
CurrencyRegistry
```

debe centralizar:

- códigos;
- nombres;
- escala;
- metadata;
- estado.

---

## 68. DECIMAL ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DECIMAL ENGINE

El Value Engine debe utilizar un componente decimal estable.

Debe definir:

```text
precision
scale
roundingMode
overflowPolicy
```

No dejar estas decisiones a valores predeterminados de una librería externa.

---

## 69. PRECISIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

PRECISIÓN

La precisión interna debe ser suficiente para evitar pérdida durante cálculos intermedios.

No redondear cada operación.

Ejemplo:

```text
A * B * C
```

no debe hacer:

```text
round(A*B)
round(resultado*C)
```

salvo que la regla lo solicite.

---

## 70. REDONDEO AL FINAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

REDONDEO AL FINAL

La recomendación general:

```text
cálculo
   ↓
resultado exacto
   ↓
redondeo explícito
```

Esto es especialmente importante para dinero.

---

## 71. COMPARACIÓN DECIMAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

COMPARACIÓN DECIMAL

No utilizar igualdad binaria de `float`.

Debe existir:

```text
decimalEquals(a, b)
```

basado en la representación decimal y las reglas de precisión de AEL.

---

## 72. OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

OVERFLOW

Si el valor excede los límites definidos:

```text
AEL-MATH-002
OVERFLOW
```

Debe detenerse la operación.

No producir:

```text
Infinity
```

silenciosamente.

---

## 73. UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

UNDERFLOW

Si la implementación lo requiere, deberá existir una política para valores demasiado pequeños.

La decisión puede ser:

```text
error
```

o:

```text
normalización a cero
```

pero debe ser explícita.

---

## 74. SERIALIZACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

SERIALIZACIÓN

Los valores AEL deben poder serializarse para:

- Artifact;
- API;
- auditoría;
- snapshots;
- debugging.

Ejemplo conceptual:

```json
{
  "type": "MONEY",
  "amount": "542250.00",
  "currency": "COP"
}
```

Para Quantity:

```json
{
  "type": "QUANTITY",
  "magnitude": "120.50",
  "unit": "M2",
  "dimension": "AREA"
}
```

La serialización no debe perder información semántica.

---

## 75. NO SERIALIZAR COMO STRING SIMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

NO SERIALIZAR COMO STRING SIMPLE

Evitar:

```json
"542250 COP"
```

como representación interna principal.

Aunque pueda utilizarse como formato de presentación, no es suficiente para transporte semántico.

---

## 76. PRESENTACIÓN VS VALOR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

PRESENTACIÓN VS VALOR

Separar:

```text
Value
```

de:

```text
FormattedValue
```

Por ejemplo:

```text
valor interno:
542250 COP
```

presentación:

```text
$542.250
```

La moneda y formato visual pertenecen a la capa de presentación.

---

## 77. LOCALE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

LOCALE

AEL Runtime no debe depender del locale del servidor para realizar cálculos.

No debe cambiar el resultado porque el servidor utilice:

```text
en-US
```

en lugar de:

```text
es-CO
```

El locale pertenece principalmente a presentación.

---

## 78. FORMATO DE NÚMEROS EN SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

FORMATO DE NÚMEROS EN SOURCE

Para evitar ambigüedad:

```ael
120.50
```

es válido.

No utilizar:

```ael
120,50
```

como decimal en V1.

La coma se reservará para separación de argumentos/listas.

---

## 79. MATRIZ DE OPERACIONES V1

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

MATRIZ DE OPERACIONES V1

La implementación debe construir una matriz formal similar a:

| Operación | Tipo A       | Tipo B       | Resultado       |
| --------- | ------------ | ------------ | --------------- |
| `+`       | NUMBER       | NUMBER       | NUMBER          |
| `+`       | MONEY<C>     | MONEY<C>     | MONEY<C>        |
| `+`       | QUANTITY<D>  | QUANTITY<D>  | QUANTITY<D>     |
| `-`       | NUMBER       | NUMBER       | NUMBER          |
| `-`       | MONEY<C>     | MONEY<C>     | MONEY<C>        |
| `*`       | NUMBER       | NUMBER       | NUMBER          |
| `*`       | MONEY<C>     | NUMBER       | MONEY<C>        |
| `*`       | QUANTITY<D>  | NUMBER       | QUANTITY<D>     |
| `*`       | QUANTITY<D1> | QUANTITY<D2> | QUANTITY<D1×D2> |
| `/`       | NUMBER       | NUMBER       | NUMBER          |
| `/`       | MONEY<C>     | NUMBER       | MONEY<C>        |
| `/`       | QUANTITY<D>  | NUMBER       | QUANTITY<D>     |
| `/`       | QUANTITY<D1> | QUANTITY<D2> | QUANTITY<D1/D2> |

La matriz completa debe ser parte de las pruebas de conformidad.

---

## 80. REGLA DE ORO DEL VALUE ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

REGLA DE ORO DEL VALUE ENGINE

El Value Engine nunca debe "adivinar".

Ante:

```text
100 M2 + 50 KG
```

no debe intentar:

```text
convertir
coaccionar
aproximar
```

Debe rechazar la operación.

---

## 81. RESPONSABILIDAD DEL ANALYZER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

RESPONSABILIDAD DEL ANALYZER

Cuando sea posible, el Analyzer debe detectar el problema antes del Runtime.

Ejemplo:

```ael
DEFINIR total =
    100 M2 + 50 KG
```

debe generar error de compilación/análisis.

El Runtime no debería ser el primer lugar donde se descubre.

---

## 82. RESPONSABILIDAD DEL RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

RESPONSABILIDAD DEL RUNTIME

Aun así, el Runtime debe volver a protegerse.

Un Artifact inválido o manipulado no puede ejecutarse simplemente porque el Analyzer original lo había validado.

Por eso:

```text
Analyzer
+
ArtifactVerifier
```

son dos líneas diferentes de protección.

---

## 83. TESTING DEL VALUE ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TESTING DEL VALUE ENGINE

Debe existir una matriz exhaustiva para:

```text
NUMBER
DECIMAL
MONEY
QUANTITY
DATE
DATETIME
LIST
NULO
```

y todas sus operaciones permitidas.

---

## 84. PROPERTY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

PROPERTY TESTS

Ejemplos:

### Conversión reversible

```text
convert(
    convert(x, A, B),
    B, A
)
≈ x
```

dentro de la precisión establecida.

### Identidad

```text
x + 0 = x
```

para tipos donde aplique.

### Multiplicación

```text
x * 1 = x
```

para tipos compatibles.

### División

```text
x / 1 = x
```

para tipos compatibles.

---

## 85. TESTS DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TESTS DE SEGURIDAD

Debe probarse:

```text
división por cero
overflow
valores extremos
listas gigantes
decimales extremos
dimensiones inválidas
unidades desconocidas
monedas desconocidas
conversiones imposibles
NULO
```

---

## 86. TEST CANÓNICO AQUILA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TEST CANÓNICO AQUILA

Entrada:

```ael
REGLA CUOTA_ADMIN

DEFINIR area =
    120.50 M2

DEFINIR tarifa =
    4500 COP/M2

RETORNAR
    area * tarifa
```

Resultado esperado:

```text
542250 COP
```

Tipo:

```text
MONEY<COP>
```

---

## 87. TEST DE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TEST DE ERROR

```ael
REGLA ERROR

DEFINIR area =
    120 M2

DEFINIR peso =
    50 KG

RETORNAR
    area + peso
```

Debe fallar durante análisis.

Código conceptual:

```text
AEL-DIMENSION-001
```

---

## 88. TEST DE CONVERSIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TEST DE CONVERSIÓN

```ael
REGLA CONVERSION

DEFINIR a =
    1 M

DEFINIR b =
    50 CM

RETORNAR
    a + b
```

Resultado:

```text
1.5 M
```

o la unidad de resultado que establezca la política normativa.

---

## 89. TEST MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TEST MONEY

```ael
REGLA MONEY

DEFINIR a =
    100000 COP

DEFINIR b =
    50000 COP

RETORNAR
    a + b
```

Resultado:

```text
150000 COP
```

---

## 90. TEST MONEY INCORRECTO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TEST MONEY INCORRECTO

```ael
REGLA MONEY_ERROR

DEFINIR a =
    100000 COP

DEFINIR b =
    50 USD

RETORNAR
    a + b
```

Debe fallar.

---

## 91. TEST DE TARIFA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

TEST DE TARIFA

```ael
REGLA TARIFA

DEFINIR area =
    120.50 M2

DEFINIR tarifa =
    4500 COP/M2

RETORNAR
    area * tarifa
```

Resultado:

```text
542250 COP
```

Este test será obligatorio para la integración de AEL con AQUILA.

---

## 92. DECISIONES FUERA DEL ALCANCE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DECISIONES FUERA DEL ALCANCE

Este documento no define todavía:

```text
AST completo
IR completo
Instruction Set
Artifact Binary Format
Runtime Stack
Providers
API
RLS
Builder
```

Esos elementos utilizarán el Type System aquí definido.

---

## 93. DECISIONES QUE NO DEBEN REABRIRSE SIN JUSTIFICACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

DECISIONES QUE NO DEBEN REABRIRSE SIN JUSTIFICACIÓN

Una vez aprobado este documento, no modificar arbitrariamente:

```text
MONEY como tipo semántico
QUANTITY como tipo semántico
dimensiones explícitas
unidades explícitas
decimal como base numérica
ausencia de coerción implícita peligrosa
división por cero como error
compatibilidad dimensional obligatoria
```

Cualquier modificación debe producir una nueva revisión de la especificación.

---

## 94. RESULTADO DEL DOCUMENTO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

RESULTADO DEL DOCUMENTO

Con este documento queda definido el núcleo conceptual:

```text
             AEL VALUE SYSTEM
                    │
       ┌────────────┼────────────┐
       │            │            │
     TYPES        VALUES      DIMENSIONS
       │            │            │
       │            │         UNITS
       │            │            │
       └────────────┼────────────┘
                    │
              VALUE ENGINE
                    │
          ┌─────────┼─────────┐
          │         │         │
       ANALYZER   RUNTIME   SERIALIZER
```

---

## 95. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System_Value_Engine 3.md

CRITERIO DE CIERRE

Este documento puede considerarse cerrado para V1 cuando exista una matriz formal y automatizada que cubra:

```text
✓ tipos
✓ operaciones
✓ unidades
✓ conversiones
✓ dimensiones
✓ money
✓ precisión
✓ redondeo
✓ NULO
✓ listas
✓ comparaciones
✓ errores matemáticos
```

La implementación no debe inventar semántica adicional fuera de esta especificación.

---

# FIN DEL DOCUMENTO 03

## AEL V1 — Type System y Value Engine

## 96. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

OBJETIVO

Definir formalmente:

```text
AELType
Primitive Types
Money
Quantity
Nullable
Record
Type Compatibility
Operator Typing
Function Typing
Contract Typing
Coercions
Type Errors
Runtime Validation
```

---

## 97. PRINCIPIOS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

PRINCIPIOS

El Type System debe ser:

```text
determinista
predecible
seguro
extensible
compatible con dominio financiero
compatible con dimensiones físicas
```

---

## 98. TIPOS PRIMITIVOS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TIPOS PRIMITIVOS

V1 define como mínimo:

```text
Number
Boolean
String
Null
```

---

## 99. NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER

Representa valores numéricos no monetarios.

Ejemplos:

```text
10
3.14
0
-25
```

---

## 100. NUMBER PRECISION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER PRECISION

Para cálculos financieros no utilizar:

```text
binary floating point
```

como representación interna de Money.

---

## 101. BOOLEAN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

BOOLEAN

Valores:

```text
VERDADERO
FALSO
```

No existe truthiness implícito.

---

## 102. STRING

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

STRING

Representa texto Unicode.

---

## 103. STRING SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

STRING SEMANTICS

AEL debe tratar strings como:

```text
Unicode text
```

sin depender del encoding del sistema operativo.

---

## 104. NULL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL

Representa ausencia explícita de valor.

Literal:

```text
NULO
```

---

## 105. NULL NO ES FALSE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL NO ES FALSE

No convertir:

```text
NULO → FALSO
```

automáticamente.

---

## 106. NULL NO ES ZERO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL NO ES ZERO

No convertir:

```text
NULO → 0
```

automáticamente.

---

## 107. MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY

Tipo semántico:

```text
Money<C>
```

donde:

```text
C = Currency
```

---

## 108. MONEY VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY VALUE

Money contiene conceptualmente:

```text
amount
currency
```

---

## 109. MONEY EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY EXAMPLE

```text
125000 COP
```

---

## 110. MONEY INTERNAL REPRESENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY INTERNAL REPRESENTATION

Usar:

```text
exact decimal
```

para amount.

---

## 111. MONEY CURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY CURRENCY

Currency debe ser:

```text
explicit
```

---

## 112. MONEY ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY ADDITION

Permitido:

```text
Money<COP> + Money<COP>
```

---

## 113. MONEY ADDITION INVALID

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY ADDITION INVALID

No permitir:

```text
Money<COP> + Money<USD>
```

sin una operación explícita de conversión.

---

## 114. MONEY SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY SUBTRACTION

Permitido:

```text
Money<COP> - Money<COP>
```

---

## 115. MONEY NEGATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY NEGATION

Permitido:

```text
-Money<COP>
```

resultado:

```text
Money<COP>
```

---

## 116. MONEY × NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md; Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY × NUMBER

Permitido:

```text
Money<COP> * Number
```

resultado:

```text
Money<COP>
```

---

## 117. NUMBER × MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER × MONEY

Permitido:

```text
Number * Money<COP>
```

resultado:

```text
Money<COP>
```

---

## 118. MONEY ÷ MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY ÷ MONEY

No producir automáticamente Number en V1 salvo que una operación explícita lo defina.

---

## 119. QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY

Tipo:

```text
Quantity<D,U>
```

donde:

```text
D = Dimension
U = Unit
```

---

## 120. EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EXAMPLE

```text
120.5 M2
```

---

## 121. DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSION

Representa la naturaleza física/semántica:

```text
AREA
LENGTH
MASS
TIME
VOLUME
```

según catálogo.

---

## 122. UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

UNIT

Representa una unidad concreta:

```text
M2
CM2
KG
G
M
CM
```

---

## 123. DIMENSION VS UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSION VS UNIT

No son equivalentes:

```text
AREA ≠ M2
```

`AREA` es dimensión.

`M2` es unidad.

---

## 124. QUANTITY ADDITION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY ADDITION

Sólo compatible si:

```text
same dimension
```

y existe una política válida de conversión de unidades.

---

## 125. QUANTITY SAME UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY SAME UNIT

```text
M2 + M2
```

produce:

```text
Quantity<AREA,M2>
```

---

## 126. QUANTITY DIFFERENT UNIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY DIFFERENT UNIT

Ejemplo:

```text
M2 + CM2
```

puede ser válido si:

```text
same dimension
conversion available
```

---

## 127. CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CONVERSION

La conversión debe utilizar:

```text
UnitRegistry
```

---

## 128. IMPLICIT UNIT CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

IMPLICIT UNIT CONVERSION

V1 puede permitir conversión automática sólo entre unidades:

```text
same dimension
deterministically convertible
```

---

## 129. NO CROSS-DIMENSION CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO CROSS-DIMENSION CONVERSION

No convertir:

```text
M2 → KG
```

---

## 130. QUANTITY SUBTRACTION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY SUBTRACTION

Mismas reglas de compatibilidad que addition.

---

## 131. QUANTITY × NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md; Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY × NUMBER

```text
Quantity<D,U> * Number
```

→

```text
Quantity<D,U>
```

---

## 132. NUMBER × QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER × QUANTITY

```text
Number * Quantity<D,U>
```

→

```text
Quantity<D,U>
```

---

## 133. QUANTITY × QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY × QUANTITY

Debe utilizar álgebra dimensional.

Ejemplo:

```text
M2 * M2
```

→

```text
AREA²
```

si el Type System representa dimensiones compuestas.

---

## 134. MONEY × QUANTITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY × QUANTITY

Debe producir una dimensión compuesta:

```text
Money / Area
```

según operandos.

---

## 135. MONEY × RATE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY × RATE

Ejemplo:

```text
Quantity<M2> * MoneyPerM2
```

→

```text
Money<COP>
```

---

## 136. DIMENSIONAL ALGEBRA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSIONAL ALGEBRA

El Core debe disponer de:

```text
DimensionAlgebra
```

para:

```text
multiply
divide
compare
normalize
```

---

## 137. DIMENSION EXPONENTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSION EXPONENTS

Internamente una dimensión puede representarse como:

```text
AREA = L^2
VOLUME = L^3
```

o mediante identificadores canónicos equivalentes.

---

## 138. COMPOSITE DIMENSIONS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

COMPOSITE DIMENSIONS

Permitir conceptualmente:

```text
Money / Area
Money * Area
Area / Time
```

---

## 139. NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NORMALIZATION

Equivalent dimensions deben normalizarse a una representación canónica.

---

## 140. DIMENSION COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSION COMPARISON

Comparar quantities requiere:

```text
same normalized dimension
```

---

## 141. MONEY DIMENSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY DIMENSION

Money puede modelarse como:

```text
currency + monetary dimension
```

para evitar mezclas inválidas.

---

## 142. RECORD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD

Tipo estructurado:

```text
Record<Schema>
```

---

## 143. RECORD FIELD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD FIELD

Cada field tiene:

```text
name
type
nullable
```

---

## 144. RECORD ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD ACCESS

Si V1 soporta acceso:

```text
record.campo
```

el Analyzer debe resolver field desde schema.

---

## 145. UNKNOWN FIELD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

UNKNOWN FIELD

Debe producir:

```text
AEL-TYPE-004
```

---

## 146. RECORD COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD COMPATIBILITY

Dos Records son compatibles sólo según una política explícita:

```text
structural
nominal
```

Recomendación:

```text
nominal Contract schema
```

para Records provenientes de Contracts.

---

## 147. LIST

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

LIST

Si V1 soporta:

```text
List<T>
```

debe ser un tipo parametrizado.

---

## 148. LIST ELEMENT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

LIST ELEMENT TYPE

Ejemplo:

```text
List<Money<COP>>
```

---

## 149. V1 LIST POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

V1 LIST POLICY

No implementar operaciones complejas sobre listas hasta que estén definidas:

```text
map
filter
reduce
```

---

## 150. NULLABLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULLABLE

Tipo:

```text
Nullable<T>
```

---

## 151. NULLABLE EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULLABLE EXAMPLE

```text
Nullable<Money<COP>>
```

---

## 152. NULLABLE COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULLABLE COMPATIBILITY

```text
T → Nullable<T>
```

puede ser una promoción segura.

---

## 153. NULL TO NON-NULL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL TO NON-NULL

```text
Null → T
```

no es válido sin narrowing explícito.

---

## 154. NULLABLE RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULLABLE RETURN

Function puede devolver:

```text
Nullable<T>
```

---

## 155. NULLABLE CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULLABLE CONTRACT

Contract puede declarar:

```text
Nullable<T>
```

---

## 156. NULL PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL PROPAGATION

No asumir automáticamente:

```text
null + value = null
```

sin una política definida por operador.

---

## 157. V1 NULL OPERATOR POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

V1 NULL OPERATOR POLICY

Para operadores aritméticos, una operación con Null debe ser:

```text
compile-time error
```

si el tipo no fue narrowed.

Esto evita errores silenciosos.

---

## 158. NULL COMPARISON

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL COMPARISON

Debe definirse explícitamente:

```text
value == NULO
value != NULO
```

---

## 159. BOOLEAN RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

BOOLEAN RESULT

Las comparaciones con Null producen:

```text
Boolean
```

según semántica definida.

---

## 160. NO THREE-VALUED LOGIC

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO THREE-VALUED LOGIC

V1 recomienda evitar una lógica SQL-style de tres valores salvo que se diseñe explícitamente.

---

## 161. OPTIONAL VALUES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

OPTIONAL VALUES

La nulabilidad debe expresarse mediante:

```text
Nullable<T>
```

no mediante:

```text
magic values
```

---

## 162. TYPE IDENTITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE IDENTITY

Cada tipo debe tener una representación canónica.

---

## 163. TYPE EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE EQUALITY

Debe existir:

```text
isSameType(A,B)
```

---

## 164. TYPE ASSIGNABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE ASSIGNABILITY

Debe existir:

```text
isAssignable(source,target)
```

---

## 165. TYPE COMPATIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE COMPATIBILITY

Debe existir:

```text
isCompatible(A,B)
```

---

## 166. TYPE JOIN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE JOIN

Para expressions como conditional:

```text
SI c ENTONCES A SINO B
```

se necesita:

```text
commonType(A,B)
```

---

## 167. COMMON TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

COMMON TYPE

Ejemplo:

```text
Money<COP>
Money<COP>
```

→

```text
Money<COP>
```

---

## 168. INVALID COMMON TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

INVALID COMMON TYPE

```text
Money<COP>
Quantity<M2>
```

→

```text
no common type
```

---

## 169. TYPE COERCION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE COERCION

AEL debe minimizar coerciones implícitas.

---

## 170. SAFE COERCION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

SAFE COERCION

Permitida sólo cuando:

```text
lossless
deterministic
unambiguous
```

---

## 171. NUMBER COERCION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER COERCION

Si Number tiene representación decimal exacta, no convertir implícitamente a Money.

---

## 172. STRING TO NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

STRING TO NUMBER

No permitir implícitamente:

```text
"100" + 5
```

---

## 173. NUMBER TO STRING

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER TO STRING

No convertir implícitamente:

```text
100 + "5"
```

---

## 174. BOOLEAN TO NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

BOOLEAN TO NUMBER

No permitir:

```text
VERDADERO → 1
```

---

## 175. NUMBER TO BOOLEAN

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER TO BOOLEAN

No permitir truthiness:

```text
0 → FALSO
```

---

## 176. MONEY TO NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY TO NUMBER

No eliminar currency implícitamente.

---

## 177. QUANTITY TO NUMBER

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY TO NUMBER

No eliminar unidad/dimensión implícitamente.

---

## 178. EXPLICIT CONVERSION FUNCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EXPLICIT CONVERSION FUNCTIONS

Las conversiones deben utilizar Functions explícitas cuando sean necesarias.

Ejemplos conceptuales:

```text
CONVERTIR_UNIDAD
CONVERTIR_MONEDA
A_NUMERO
A_TEXTO
```

Sólo implementar Functions realmente aprobadas en el catálogo.

---

## 179. CURRENCY CONVERSION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CURRENCY CONVERSION

Debe ser explícita.

Ejemplo:

```text
CONVERTIR_MONEDA(valor, "USD")
```

si esta Function existe.

---

## 180. FX SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

FX SOURCE

La conversión monetaria debe declarar:

```text
exchange rate source
date
policy
```

cuando se implemente.

---

## 181. NO HIDDEN FX

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO HIDDEN FX

Nunca convertir:

```text
COP + USD
```

automáticamente.

---

## 182. OPERATOR TYPE TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

OPERATOR TYPE TABLE

Mínimo:

```text
+:
Number + Number → Number
Money<C> + Money<C> → Money<C>
Quantity<D,U> + Quantity<D,U'> → Quantity<D,U>

-:
Number - Number → Number
Money<C> - Money<C> → Money<C>
Quantity<D,U> - Quantity<D,U'> → Quantity<D,U>

*:
Number * T → T
T * Number → T
Quantity × Quantity → Quantity<combined>
Quantity × MoneyRate → Money

/:
T / Number → T
Quantity / Quantity → dimensional result
Money / Quantity → rate
```

---

## 183. COMPARISON TABLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

COMPARISON TABLE

```text
Number < Number → Boolean
Money<C> < Money<C> → Boolean
Quantity<D> < Quantity<D> → Boolean
String == String → Boolean
Boolean == Boolean → Boolean
```

---

## 184. EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EQUALITY

Equality requiere:

```text
same type
```

o compatibilidad explícitamente definida.

---

## 185. STRING EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

STRING EQUALITY

```text
String == String
```

---

## 186. MONEY EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY EQUALITY

```text
Money<COP> == Money<COP>
```

---

## 187. QUANTITY EQUALITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY EQUALITY

```text
Quantity<M2> == Quantity<CM2>
```

puede ser válida mediante normalización/conversión.

---

## 188. BOOLEAN OPERATORS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

BOOLEAN OPERATORS

```text
AND
OR
NOT
```

sólo sobre Boolean.

---

## 189. SHORT-CIRCUIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

SHORT-CIRCUIT

`AND` y `OR` deben definir evaluación short-circuit si la gramática los soporta.

---

## 190. SHORT-CIRCUIT SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

SHORT-CIRCUIT SECURITY

Short-circuit puede evitar:

```text
Provider calls
```

en ramas no evaluadas.

---

## 191. FUNCTION ARGUMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

FUNCTION ARGUMENTS

Function arguments se validan contra:

```text
parameter type
```

---

## 192. CONTRACT TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CONTRACT TYPE

Contract devuelve exactamente:

```text
declared AELType
```

---

## 193. RUNTIME TYPE TAG

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RUNTIME TYPE TAG

AELValue debe conservar información suficiente para runtime validation.

---

## 194. AEL VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

AEL VALUE

Conceptualmente:

```ts
type AELValue =
  NumberValue | BooleanValue | StringValue | MoneyValue | QuantityValue | RecordValue | NullValue
```

---

## 195. NUMBER VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER VALUE

Debe conservar precisión requerida por el lenguaje.

---

## 196. MONEY VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY VALUE

Conceptualmente:

```text
amount: Decimal
currency: CurrencyCode
```

---

## 197. QUANTITY VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY VALUE

Conceptualmente:

```text
amount: Decimal
unit: UnitCode
dimension: DimensionCode
```

---

## 198. RECORD VALUE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD VALUE

Debe asociarse a:

```text
schema identifier
```

---

## 199. VALUE VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

VALUE VALIDATION

Runtime debe poder comprobar:

```text
value conforms to AELType
```

---

## 200. SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

SERIALIZATION

AELValue puede serializarse sólo mediante:

```text
typed serialization
```

---

## 201. NO AMBIGUOUS JSON

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO AMBIGUOUS JSON

No depender de JSON para distinguir:

```text
Money
Quantity
Number
```

si se pierde metadata.

---

## 202. JSON REPRESENTATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

JSON REPRESENTATION

Si se expone por API:

```json
{
  "type": "money",
  "amount": "125000.00",
  "currency": "COP"
}
```

---

## 203. QUANTITY JSON

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY JSON

```json
{
  "type": "quantity",
  "amount": "120.50",
  "unit": "M2",
  "dimension": "AREA"
}
```

---

## 204. NUMBER JSON

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NUMBER JSON

```json
{
  "type": "number",
  "value": "120.5"
}
```

cuando la precisión lo requiera.

---

## 205. TYPE ERRORS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE ERRORS

Cada incompatibilidad debe producir:

```text
code
expected
actual
span
```

---

## 206. TYPE ERROR CODE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE ERROR CODE

Base:

```text
AEL-TYPE-001
```

---

## 207. DIMENSION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSION ERROR

```text
AEL-DIMENSION-001
```

---

## 208. CURRENCY ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CURRENCY ERROR

```text
AEL-CURRENCY-001
```

---

## 209. NULL ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL ERROR

```text
AEL-NULL-001
```

---

## 210. DIAGNOSTIC MESSAGE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIAGNOSTIC MESSAGE

Debe indicar:

```text
Expected Money<COP>
but received Quantity<M2>.
```

---

## 211. TYPE DISPLAY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE DISPLAY

El formatter de tipos debe producir:

```text
Money<COP>
Quantity<AREA,M2>
Nullable<String>
Record<Property>
```

de forma estable.

---

## 212. TYPE NORMALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE NORMALIZATION

Internamente:

```text
Quantity<AREA,M2>
```

y aliases equivalentes deben normalizarse.

---

## 213. TYPE REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE REGISTRY

Debe existir catálogo para:

```text
Currency
Unit
Dimension
Record Schema
```

---

## 214. CURRENCY REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CURRENCY REGISTRY

Debe definir:

```text
code
name
minor unit
status
```

---

## 215. UNIT REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

UNIT REGISTRY

Debe definir:

```text
code
dimension
conversion rule
status
```

---

## 216. DIMENSION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DIMENSION REGISTRY

Debe definir:

```text
code
base dimensions
```

---

## 217. REGISTRY SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

REGISTRY SNAPSHOT

Analyzer debe utilizar snapshot consistente de:

```text
types
units
currencies
dimensions
```

---

## 218. TYPE SNAPSHOT HASH

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE SNAPSHOT HASH

Puede formar parte del provenance del Artifact.

---

## 219. TYPE VERSIONING

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE VERSIONING

Cambios incompatibles en semántica de:

```text
Unit
Currency
Dimension
```

requieren política de versionamiento.

---

## 220. CURRENCY CODE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CURRENCY CODE

Utilizar códigos canónicos:

```text
COP
USD
EUR
```

---

## 221. UNIT CODE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

UNIT CODE

Utilizar códigos canónicos:

```text
M2
KG
M
```

---

## 222. CASE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

CASE

Los códigos de unidades/currency deben tener:

```text
canonical case
```

y no depender de casing arbitrario.

---

## 223. MONEY ROUNDING

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY ROUNDING

El Type System define el tipo.

La política de redondeo pertenece a:

```text
Function
Compiler/Runtime policy
```

según operación.

---

## 224. NO AUTO ROUND

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO AUTO ROUND

No redondear automáticamente cada operación Money.

---

## 225. DECIMAL SCALE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DECIMAL SCALE

Money debe preservar escala suficiente hasta el punto donde una operación de negocio indique redondeo.

---

## 226. OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

OVERFLOW

Runtime debe detectar:

```text
numeric overflow
```

---

## 227. UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

UNDERFLOW

Para decimal exacto, definir comportamiento cuando la precisión excede los límites soportados.

---

## 228. TYPE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE LIMITS

El Runtime debe imponer límites para evitar:

```text
extremely large numbers
```

---

## 229. SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

SECURITY

No permitir valores numéricos que causen:

```text
resource exhaustion
```

---

## 230. STRING LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

STRING LIMIT

Runtime puede imponer:

```text
maxStringLength
```

---

## 231. RECORD LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD LIMIT

Si Records pueden ser grandes:

```text
maxFields
```

---

## 232. LIST LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

LIST LIMIT

Si Lists se habilitan:

```text
maxElements
```

---

## 233. TYPE SYSTEM AND ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE SYSTEM AND ARTIFACT

Artifact debe contener suficientes referencias para ejecutar:

```text
typed operations
```

sin repetir todo el Type Registry.

---

## 234. TYPE REFERENCES

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE REFERENCES

Puede utilizar:

```text
typeId
```

en Artifact.

---

## 235. TYPE ID STABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE ID STABILITY

Type IDs deben ser estables dentro del Artifact format.

---

## 236. NO RUNTIME TYPE INFERENCE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO RUNTIME TYPE INFERENCE

Runtime no debe inferir tipos complejos desde strings.

Debe recibir metadata compilada.

---

## 237. ANALYZER INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

ANALYZER INTEGRATION

Analyzer consulta:

```text
TypeSystem
ContractRegistry
FunctionRegistry
OperatorRegistry
```

---

## 238. COMPILER INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

COMPILER INTEGRATION

Compiler transforma tipos semánticos en:

```text
validated Artifact metadata
```

---

## 239. RUNTIME INTEGRATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RUNTIME INTEGRATION

Runtime utiliza:

```text
type validation
operator semantics
```

para proteger invariants.

---

## 240. OPERATOR REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

OPERATOR REGISTRY

Debe existir una definición centralizada:

```text
operator
operand types
result type
evaluation policy
```

---

## 241. NO DUPLICATION

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO DUPLICATION

No definir reglas de `+`, `*`, `/` independientemente en:

```text
Analyzer
Compiler
Runtime
```

sin una fuente común.

---

## 242. TYPE RULE SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE RULE SOURCE

La semántica de operadores debe estar centralizada en:

```text
OperatorRegistry / TypeRuleRegistry
```

---

## 243. TYPE TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE TESTS

Mínimo:

```text
primitive compatibility
Money compatibility
Quantity compatibility
Nullable
Record
operators
functions
contracts
coercions
```

---

## 244. MONEY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

MONEY TESTS

```text
COP + COP
COP + USD
COP * Number
COP / Number
```

---

## 245. QUANTITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

QUANTITY TESTS

```text
M2 + M2
M2 + CM2
M2 + KG
M2 * Number
M2 * M2
```

---

## 246. NULL TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NULL TESTS

```text
Nullable<T>
Null
T + Null
Null comparisons
```

---

## 247. RECORD TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

RECORD TESTS

```text
valid field
unknown field
wrong schema
```

---

## 248. COERCION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

COERCION TESTS

Confirm rejection de:

```text
String → Number
Number → Boolean
Money → Number
Quantity → Number
```

cuando sean implícitas.

---

## 249. DETERMINISM TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

DETERMINISM TESTS

Mismo:

```text
type definitions
operator registry
```

debe producir:

```text
same type result
```

---

## 250. PROPERTY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

PROPERTY TESTS

Para álgebra dimensional pueden utilizarse:

```text
property-based tests
```

---

## 251. ROUND-TRIP TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

ROUND-TRIP TESTS

Para typed serialization:

```text
value
→ serialize
→ deserialize
```

debe conservar:

```text
type
value
dimension
currency
unit
```

---

## 252. NO LOSS TEST

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

NO LOSS TEST

Money serialization no debe perder:

```text
precision
currency
```

---

## 253. TYPE SYSTEM EXIT CRITERIA

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

TYPE SYSTEM EXIT CRITERIA

```text
✓ Primitive types
✓ Number
✓ Boolean
✓ String
✓ Null
✓ Money
✓ Currency
✓ Quantity
✓ Dimension
✓ Unit
✓ Composite dimensions
✓ Nullable
✓ Record
✓ Optional List foundation
✓ Type equality
✓ Assignability
✓ Compatibility
✓ Common type
✓ Coercion policy
✓ Operator typing
✓ Runtime value model
✓ Typed serialization
✓ Numeric precision
✓ Overflow policy
✓ Type registries
✓ Registry snapshots
✓ Determinism
✓ Diagnostics
✓ Tests
```

---

## 254. FINAL TYPE FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

FINAL TYPE FLOW

```text
Contract
   ↓
AELType
   ↓
Expression
   ↓
Operator / Function
   ↓
Result AELType
   ↓
Semantic IR
   ↓
Artifact
   ↓
Runtime AELValue
```

---

## 255. EJEMPLO COMPLETO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EJEMPLO COMPLETO

```text
PROPERTY.AREA_PRIVATE *
PARAMETER.TARIFA_M2
```

Tipos:

```text
PROPERTY.AREA_PRIVATE
→ Quantity<AREA,M2>

PARAMETER.TARIFA_M2
→ MoneyPerArea<COP>

*
→ Money<COP>
```

---

## 256. EJEMPLO INVÁLIDO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EJEMPLO INVÁLIDO

```text
PROPERTY.AREA_PRIVATE +
PARAMETER.TARIFA_M2
```

Tipos:

```text
Quantity<AREA,M2>
+
MoneyPerArea<COP>
```

Resultado:

```text
AEL-TYPE-001
```

---

## 257. EJEMPLO NULLABLE

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EJEMPLO NULLABLE

```text
OWNER.SECONDARY_EMAIL
```

tipo:

```text
Nullable<String>
```

No puede utilizarse automáticamente como:

```text
String
```

sin una operación de narrowing/validación compatible.

---

## 258. EJEMPLO MONEY

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

EJEMPLO MONEY

```text
REDONDEAR_DINERO(
    ACCOUNTING.BALANCE,
    0
)
```

si:

```text
ACCOUNTING.BALANCE
→ Money<COP>
```

y:

```text
REDONDEAR_DINERO(Money<C>, Number)
→ Money<C>
```

resultado:

```text
Money<COP>
```

---

## 259. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

PRINCIPIO DE SEGURIDAD

Nunca ocultar:

```text
currency
dimension
unit
nullability
```

mediante conversiones implícitas.

---

## 260. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

PRINCIPIO FINANCIERO

Todo cálculo monetario debe conservar:

```text
currency
precision
rounding policy
```

---

## 261. PRINCIPIO DIMENSIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

PRINCIPIO DIMENSIONAL

Una operación válida debe respetar:

```text
dimension algebra
```

---

## 262. PRINCIPIO DE NULABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Type_System 32.md

PRINCIPIO DE NULABILIDAD

`Null` debe ser explícito y nunca convertirse silenciosamente en:

```text
0
false
""
```

---

## 263. REFERENCIAS DE FASE 1

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

REFERENCIAS DE FASE 1

Este documento implementa principalmente decisiones establecidas en:

```text
Documento 18 — Type System
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 54 — Reference Architecture & Repository Structure
```

No se redefine aquí la semántica completa de esos documentos.

---

## 264. OBJETIVO

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

OBJETIVO

Implementar las primitivas compartidas de AEL:

```text
Identifiers
Source Locations
Version Types
Errors
Primitive Types
Decimal
Money
Currency
Rate
Percentage
Quantity
Coefficient
Date
DateTime
Duration
Collections
Execution Metadata
```

---

## 265. PRINCIPIO DE DEPENDENCIAS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE DEPENDENCIAS

`ael-core` debe permanecer independiente de:

```text
PostgreSQL
Supabase
HTTP
ORM
Frameworks
Filesystem
Cloud providers
UI
```

---

## 266. ESTRUCTURA FÍSICA

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ESTRUCTURA FÍSICA

```text
packages/
├── ael-core/
│   └── src/
│       ├── identifiers/
│       ├── source/
│       ├── version/
│       ├── errors/
│       ├── result/
│       └── metadata/
│
└── ael-types/
    └── src/
        ├── primitives/
        ├── numeric/
        ├── financial/
        ├── temporal/
        ├── collections/
        └── index.ts
```

---

## 267. IMPLEMENTATION LANGUAGE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

IMPLEMENTATION LANGUAGE

La implementación V1 utilizará:

```text
TypeScript
```

por integración natural con el ecosistema previsto de AQUILA y por disponibilidad de:

```text
static typing
interfaces
discriminated unions
runtime validation
```

---

## 268. PACKAGE: AEL CORE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PACKAGE: AEL CORE

Responsabilidad:

```text
conceptos transversales
```

No debe convertirse en:

```text
"god package"
```

---

## 269. PACKAGE: AEL TYPES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PACKAGE: AEL TYPES

Responsabilidad:

```text
representación semántica de valores
```

Debe contener tipos reutilizables por:

```text
compiler
semantic analyzer
runtime
financial engine
settlement engine
```

---

## 270. IDENTIFIERS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

IDENTIFIERS

Todos los identificadores internos deben ser tipos explícitos cuando aporten seguridad.

Ejemplos:

```text
ArtifactId
RuleId
TenantId
UnitId
PeriodId
SettlementId
ExecutionId
FunctionId
ContractId
```

---

## 271. IDENTIFIER PRINCIPLE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

IDENTIFIER PRINCIPLE

Evitar utilizar indiscriminadamente:

```ts
string
```

para representar entidades conceptualmente diferentes.

---

## 272. BRANDED IDENTIFIERS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

BRANDED IDENTIFIERS

En TypeScript se recomienda utilizar branded types o wrappers.

Conceptualmente:

```ts
type TenantId = string & { readonly __brand: 'TenantId' }
```

---

## 273. ID VALIDATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ID VALIDATION

Los IDs deben validar:

```text
non-empty
maximum length
allowed format
```

según el tipo.

---

## 274. UUID

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

UUID

Si se utiliza UUID:

```text
UUID validation
```

debe ser centralizada.

---

## 275. SOURCE LOCATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SOURCE LOCATION

Todo elemento sintáctico que pueda generar diagnostics debe poder conservar:

```text
source
start
end
```

---

## 276. SOURCE POSITION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SOURCE POSITION

Conceptualmente:

```ts
interface SourcePosition {
  offset: number
  line: number
  column: number
}
```

---

## 277. SOURCE SPAN

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SOURCE SPAN

```ts
interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}
```

---

## 278. SOURCE FILE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SOURCE FILE

```ts
interface SourceFile {
  id: string
  name?: string
  content: string
}
```

---

## 279. DIAGNOSTIC

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DIAGNOSTIC

Un diagnostic debe ser estructurado.

```ts
interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  message: string
  span?: SourceSpan
}
```

---

## 280. DIAGNOSTIC SEVERITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DIAGNOSTIC SEVERITY

Valores V1:

```text
INFO
WARNING
ERROR
FATAL
```

---

## 281. ERROR CODE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ERROR CODE

Nunca depender exclusivamente del texto del error.

Preferir:

```text
AEL001
AEL002
...
```

o códigos semánticos estables.

---

## 282. DOMAIN ERROR

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DOMAIN ERROR

Los errores de dominio deben distinguirse de:

```text
syntax errors
runtime errors
infrastructure errors
```

---

## 283. ERROR HIERARCHY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ERROR HIERARCHY

Conceptualmente:

```text
AelError
├── SyntaxError
├── SemanticError
├── TypeError
├── VerificationError
├── RuntimeError
├── DomainError
├── FinancialError
└── InfrastructureError
```

---

## 284. ERROR SERIALIZATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ERROR SERIALIZATION

Los errores deben poder serializarse sin incluir:

```text
secrets
credentials
internal stack traces
```

---

## 285. RESULT TYPE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RESULT TYPE

Para operaciones que puedan fallar de forma esperable se recomienda:

```ts
Result<T, E>
```

en lugar de utilizar excepciones como flujo normal.

---

## 286. RESULT SUCCESS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RESULT SUCCESS

Conceptualmente:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
```

---

## 287. OPTION TYPE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

OPTION TYPE

Para valores opcionales utilizar explícitamente:

```text
T | null
```

o una abstracción `Option` si el proyecto la adopta.

No utilizar:

```text
undefined
```

como semántica financiera accidental.

---

## 288. BOOLEAN

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

BOOLEAN

Boolean debe representar exclusivamente:

```text
true
false
```

---

## 289. STRING

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

STRING

String debe tener semántica clara según contexto:

```text
identifier
label
code
expression
```

---

## 290. INTEGER

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

INTEGER

Integer debe representar enteros exactos.

No utilizar:

```text
JavaScript Number
```

sin validar límites cuando el valor tenga importancia financiera o de recursos.

---

## 291. INTEGER RANGE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

INTEGER RANGE

El runtime debe establecer límites explícitos para:

```text
array indexes
loop counters
resource counters
integer values
```

---

## 292. DECIMAL

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL

Decimal debe utilizar una implementación decimal exacta.

Para V1:

```text
Decimal abstraction
```

debe aislar la biblioteca concreta utilizada.

---

## 293. DECIMAL ABSTRACTION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL ABSTRACTION

No permitir que el resto del dominio dependa directamente de una biblioteca decimal externa.

---

## 294. DECIMAL API

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL API

Debe soportar como mínimo:

```text
add
subtract
multiply
divide
compare
equals
abs
negate
isZero
isNegative
isPositive
round
```

---

## 295. DECIMAL CONSTRUCTION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL CONSTRUCTION

Construcción recomendada:

```ts
Decimal.fromString('123.45')
```

No:

```ts
Decimal.fromNumber(123.45)
```

para valores financieros críticos.

---

## 296. DECIMAL STRING

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL STRING

La representación canónica debe ser determinista.

---

## 297. DECIMAL EQUALITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL EQUALITY

```text
1.0 == 1.00
```

debe producir:

```text
true
```

---

## 298. DECIMAL IMMUTABILITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL IMMUTABILITY

Decimal debe ser:

```text
immutable
```

---

## 299. MONEY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY

Money debe encapsular:

```text
Decimal amount
Currency currency
```

---

## 300. MONEY CONSTRUCTOR

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY CONSTRUCTOR

Conceptualmente:

```ts
Money.of('500000', Currency.COP)
```

---

## 301. MONEY IMMUTABILITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY IMMUTABILITY

Money debe ser:

```text
immutable
```

---

## 302. MONEY ADD

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY ADD

Sólo permitir misma currency.

---

## 303. MONEY SUBTRACT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY SUBTRACT

Sólo permitir misma currency.

---

## 304. MONEY MULTIPLY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY MULTIPLY

Permitir:

```text
Money × Decimal
Money × Rate
Money × Integer
```

según API definida.

---

## 305. MONEY DIVIDE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY DIVIDE

Permitir:

```text
Money ÷ Integer
Money ÷ Decimal
```

con policy de precisión/rounding.

---

## 306. MONEY COMPARISON

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY COMPARISON

Comparar únicamente:

```text
same currency
```

---

## 307. MONEY ZERO

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY ZERO

Debe existir:

```ts
Money.zero(currency)
```

---

## 308. CURRENCY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CURRENCY

Currency debe ser un value object o enum controlado.

---

## 309. CURRENCY CODE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CURRENCY CODE

Formato recomendado:

```text
ISO 4217
```

---

## 310. CURRENCY IMMUTABILITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CURRENCY IMMUTABILITY

Currency debe ser:

```text
immutable
```

---

## 311. RATE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RATE

Rate representa:

```text
factor decimal
```

Ejemplo:

```text
0.19
```

para:

```text
19%
```

---

## 312. RATE CONSTRUCTION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RATE CONSTRUCTION

Evitar ambigüedad:

```ts
Rate.fromPercentage('19')
```

debe producir:

```text
0.19
```

---

## 313. PERCENTAGE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PERCENTAGE

Percentage puede representar una tasa expresada semánticamente como:

```text
19%
```

---

## 314. RATE VS PERCENTAGE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RATE VS PERCENTAGE

No deben ser intercambiables implícitamente.

---

## 315. COEFFICIENT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

COEFFICIENT

Coefficient representa:

```text
participation / allocation factor
```

---

## 316. COEFFICIENT VALIDATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

COEFFICIENT VALIDATION

Validar rango según policy de negocio.

---

## 317. QUANTITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

QUANTITY

Quantity debe encapsular:

```text
Decimal value
Unit
```

---

## 318. UNIT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

UNIT

Unit debe ser explícita.

Ejemplos:

```text
m2
hour
unit
kWh
```

---

## 319. QUANTITY COMPATIBILITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

QUANTITY COMPATIBILITY

Sólo operaciones compatibles entre unidades/dimensiones.

---

## 320. UNIT CONVERSION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

UNIT CONVERSION

Debe utilizar una abstracción explícita:

```text
UnitConverter
```

---

## 321. DATE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DATE

Date debe representar una fecha sin hora.

No utilizar:

```text
JavaScript Date
```

como representación semántica única de una fecha de negocio.

---

## 322. DATETIME

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DATETIME

DateTime debe distinguir:

```text
instant
timezone
```

cuando sea necesario.

---

## 323. CLOCK

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CLOCK

Definir:

```ts
interface Clock {
  now(): DateTime
}
```

para permitir:

```text
deterministic tests
```

---

## 324. DURATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DURATION

Duration representa:

```text
elapsed time
```

y no debe confundirse con:

```text
calendar period
```

---

## 325. PERIOD

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PERIOD

Un Period de negocio debe ser una abstracción propia cuando represente:

```text
billing period
```

---

## 326. COLLECTIONS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

COLLECTIONS

AEL debe soportar colecciones controladas:

```text
Array<T>
```

y estructuras de mapa cuando el lenguaje las permita.

---

## 327. COLLECTION LIMITS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

COLLECTION LIMITS

El Runtime debe imponer límites sobre:

```text
array size
object properties
nesting depth
```

---

## 328. OBJECT VALUES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

OBJECT VALUES

Objects deben tener:

```text
explicit property semantics
```

cuando sean utilizados dentro del lenguaje.

---

## 329. NULL

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

NULL

Null debe tener semántica explícita.

No debe producir conversiones financieras implícitas como:

```text
null → 0
```

---

## 330. MONEY NULL

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY NULL

Una ausencia de Money no equivale a:

```text
Money.zero()
```

---

## 331. DECIMAL NULL

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL NULL

Una ausencia de Decimal no equivale a:

```text
Decimal.zero()
```

---

## 332. TYPE TAG

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPE TAG

Los tipos Runtime deben poder identificarse de forma segura.

Ejemplo:

```text
typeTag = "Money"
```

---

## 333. TYPE IDENTITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPE IDENTITY

Dos valores con igual representación interna pero diferente semántica:

```text
Rate
Coefficient
```

siguen siendo tipos diferentes.

---

## 334. VALUE OBJECTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

VALUE OBJECTS

Los siguientes deben preferiblemente ser value objects:

```text
Money
Currency
Rate
Percentage
Coefficient
Quantity
Unit
Decimal
SourceSpan
Version
```

---

## 335. VALUE OBJECT EQUALITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

VALUE OBJECT EQUALITY

Equality debe ser basada en valor, no identidad de memoria.

---

## 336. VERSION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

VERSION

Definir un tipo para:

```text
LanguageVersion
ArtifactVersion
CompilerVersion
RuntimeVersion
PolicyVersion
```

---

## 337. VERSION PARSING

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

VERSION PARSING

Version debe validarse antes de utilizarse.

---

## 338. SEMANTIC VERSION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SEMANTIC VERSION

Cuando aplique:

```text
MAJOR.MINOR.PATCH
```

---

## 339. LANGUAGE VERSION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

LANGUAGE VERSION

Debe ser independiente de Runtime.

---

## 340. ARTIFACT VERSION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ARTIFACT VERSION

Debe indicar el formato del Artifact.

---

## 341. EXECUTION METADATA

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

EXECUTION METADATA

Definir:

```ts
interface ExecutionMetadata {
  executionId: ExecutionId
  artifactId?: ArtifactId
  artifactHash?: string
  languageVersion: string
  runtimeVersion: string
}
```

---

## 342. CORRELATION ID

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CORRELATION ID

Debe existir soporte para:

```text
correlationId
```

para trazabilidad.

---

## 343. TENANT CONTEXT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TENANT CONTEXT

Definir una estructura mínima:

```ts
interface TenantContext {
  tenantId: TenantId
}
```

---

## 344. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

EXECUTION CONTEXT

No debe almacenar directamente conexiones a infraestructura.

---

## 345. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

EXECUTION CONTEXT

Conceptualmente:

```ts
interface ExecutionContext {
  execution: ExecutionMetadata
  tenant: TenantContext
  clock: Clock
}
```

Las capacidades/Contracts se agregarán en módulos posteriores.

---

## 346. IMMUTABILITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

IMMUTABILITY

Los contextos que representan estado de ejecución deben ser:

```text
immutable
```

o tratados como immutable por contrato.

---

## 347. CAPABILITIES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CAPABILITIES

Las capabilities no deben ser booleanos arbitrarios.

Preferir tipos:

```text
Capability
CapabilitySet
```

---

## 348. CAPABILITY EXAMPLE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CAPABILITY EXAMPLE

```text
READ_UNIT
READ_BALANCE
CALCULATE_SETTLEMENT
POST_SETTLEMENT
```

---

## 349. NO INFRASTRUCTURE IN CORE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

NO INFRASTRUCTURE IN CORE

No colocar:

```text
SupabaseClient
PrismaClient
Pool
HttpClient
```

en `ael-core`.

---

## 350. NO LOGGING FRAMEWORK IN CORE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

NO LOGGING FRAMEWORK IN CORE

Core no debe importar directamente:

```text
Pino
Winston
OpenTelemetry
```

---

## 351. CORE EVENTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CORE EVENTS

Si necesita comunicar eventos:

```text
interfaces
callbacks
domain events
```

sin acoplarse a un logger concreto.

---

## 352. ERROR FACTORY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ERROR FACTORY

Los errores importantes deben construirse mediante factories o constructors consistentes.

---

## 353. ERROR CODES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ERROR CODES

Catálogo inicial:

```text
AEL_INVALID_ARGUMENT
AEL_INVALID_IDENTIFIER
AEL_INVALID_VERSION
AEL_TYPE_MISMATCH
AEL_NULL_VALUE
AEL_DECIMAL_ERROR
AEL_CURRENCY_MISMATCH
AEL_DIVISION_BY_ZERO
AEL_NUMERIC_OVERFLOW
AEL_INVALID_QUANTITY
AEL_INVALID_RATE
AEL_INVALID_COEFFICIENT
```

---

## 354. FINANCIAL ERROR CODES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FINANCIAL ERROR CODES

Se amplían posteriormente en:

```text
ael-financial
```

---

## 355. TYPE ERROR

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPE ERROR

Debe incluir:

```text
expectedType
actualType
span
```

cuando sea posible.

---

## 356. ASSERTIONS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ASSERTIONS

Assertions internas no deben reemplazar validación de inputs externos.

---

## 357. INPUT VALIDATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

INPUT VALIDATION

Valores provenientes de:

```text
API
database
Provider
JSON
user input
```

deben validarse antes de convertirse a tipos confiables.

---

## 358. FACTORIES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FACTORIES

Usar factories para parsing:

```text
Currency.parse()
Decimal.fromString()
Version.parse()
```

---

## 359. PARSING FAILURE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PARSING FAILURE

Debe devolver:

```text
Result<T, Error>
```

cuando la entrada sea externa.

---

## 360. SERIALIZATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SERIALIZATION

Cada value object serializable debe tener representación canónica.

---

## 361. JSON

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

JSON

Money:

```json
{
  "amount": "500000.00",
  "currency": "COP"
}
```

---

## 362. DECIMAL JSON

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL JSON

Preferido:

```json
"123.45"
```

para preservar precisión.

---

## 363. DATE JSON

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DATE JSON

Debe utilizar formato definido por el sistema.

---

## 364. VERSION JSON

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

VERSION JSON

Preferir string:

```json
"1.0.0"
```

---

## 365. HASH INPUT

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

HASH INPUT

Canonical serialization debe ser:

```text
deterministic
```

---

## 366. HASH

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

HASH

El hashing se implementará en una capa apropiada, pero los tipos deben poder proporcionar representación canónica.

---

## 367. TYPE REGISTRY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPE REGISTRY

El Type System posterior deberá registrar:

```text
type name
type id
runtime representation
```

---

## 368. BUILTIN TYPES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

BUILTIN TYPES

Registrar inicialmente:

```text
Integer
Decimal
Boolean
String
Date
DateTime
Duration
Money
Currency
Rate
Percentage
Quantity
Coefficient
```

---

## 369. TYPE CATEGORIES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPE CATEGORIES

Separar:

```text
primitive
value object
collection
domain
```

---

## 370. NUMERIC TYPES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

NUMERIC TYPES

No agrupar semánticamente todos los tipos bajo:

```text
Number
```

---

## 371. FINANCIAL TYPE SAFETY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FINANCIAL TYPE SAFETY

Debe impedir:

```text
Money + Rate
Money + Quantity
Rate + Currency
Coefficient + Money
```

---

## 372. CURRENCY SAFETY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CURRENCY SAFETY

Debe impedir:

```text
Money(COP) + Money(USD)
```

sin conversión.

---

## 373. QUANTITY SAFETY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

QUANTITY SAFETY

Debe impedir:

```text
m2 + kWh
```

---

## 374. RATE SAFETY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RATE SAFETY

Rate no debe interpretarse automáticamente como:

```text
Percentage
```

si la conversión no es explícita.

---

## 375. IMMUTABLE API

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

IMMUTABLE API

Los métodos de value objects deben devolver nuevos valores:

```text
a.add(b)
```

y no mutar:

```text
a
```

---

## 376. THREAD SAFETY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

THREAD SAFETY

La inmutabilidad facilita:

```text
parallel execution
```

---

## 377. CACHE SAFETY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CACHE SAFETY

Value objects inmutables pueden utilizarse como:

```text
cache keys
```

cuando su representación sea estable.

---

## 378. MEMORY LIMITS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MEMORY LIMITS

El Runtime posterior impondrá límites, pero Core Types deben evitar estructuras innecesariamente expansivas.

---

## 379. TYPE SERIALIZATION VERSION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPE SERIALIZATION VERSION

Cambios incompatibles en serialización deben versionarse.

---

## 380. BACKWARD COMPATIBILITY

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

BACKWARD COMPATIBILITY

No cambiar silenciosamente la representación de:

```text
Money
Decimal
Currency
```

en una versión compatible.

---

## 381. CORE TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CORE TESTS

Mínimos:

```text
identifier tests
version tests
error tests
source span tests
result tests
```

---

## 382. FINANCIAL TYPE TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FINANCIAL TYPE TESTS

Mínimos:

```text
Decimal
Money
Currency
Rate
Percentage
Coefficient
Quantity
```

---

## 383. MONEY TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

MONEY TESTS

Probar:

```text
add
subtract
multiply
divide
compare
zero
currency mismatch
immutability
serialization
```

---

## 384. DECIMAL TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DECIMAL TESTS

Probar:

```text
exactness
scale
rounding
division
negative
zero
large values
overflow
```

---

## 385. QUANTITY TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

QUANTITY TESTS

Probar:

```text
compatible units
incompatible units
conversion
zero
negative
```

---

## 386. CLOCK TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CLOCK TESTS

Probar:

```text
fixed clock
changing clock
timezone behavior
```

---

## 387. PROPERTY TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PROPERTY TESTS

Para tipos matemáticos:

```text
a + 0 = a
a × 1 = a
a - a = 0
```

cuando aplique.

---

## 388. SERIALIZATION TEST

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SERIALIZATION TEST

Debe cumplirse:

```text
deserialize(serialize(x)) = x
```

---

## 389. CANONICALIZATION TEST

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

CANONICALIZATION TEST

Equivalent values deben producir representación canónica equivalente.

---

## 390. NO FLOAT TEST

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

NO FLOAT TEST

Los tests deben detectar conversiones accidentales de:

```text
Decimal
→ number
```

---

## 391. TYPEBOUNDARY TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

TYPEBOUNDARY TESTS

Probar límites máximos definidos.

---

## 392. ERROR TESTS

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

ERROR TESTS

Cada error debe verificar:

```text
code
message
metadata
```

---

## 393. API SURFACE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

API SURFACE

Los packages deben exponer únicamente:

```text
public API
```

desde:

```text
src/index.ts
```

---

## 394. INTERNAL FILES

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

INTERNAL FILES

No deben considerarse API pública.

---

## 395. DOCUMENTATION

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

DOCUMENTATION

Cada public type debe documentar:

```text
purpose
invariants
construction
operations
serialization
errors
```

---

## 396. IMPLEMENTATION CHECKLIST

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

IMPLEMENTATION CHECKLIST

```text
✓ ael-core package
✓ ael-types package
✓ branded identifiers
✓ source locations
✓ diagnostics
✓ typed errors
✓ Result
✓ Version
✓ Decimal abstraction
✓ Money
✓ Currency
✓ Rate
✓ Percentage
✓ Coefficient
✓ Quantity
✓ Unit
✓ Date
✓ DateTime
✓ Duration
✓ Clock
✓ Execution metadata
✓ Tenant context
✓ Execution context
✓ capabilities abstraction
✓ canonical serialization
✓ immutability
✓ type safety
✓ unit tests
✓ property tests
```

---

## 397. FIRST IMPLEMENTATION MILESTONE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FIRST IMPLEMENTATION MILESTONE

La primera entrega de código debe permitir:

```text
create Decimal
create Currency
create Money
add Money
subtract Money
multiply Money
compare Money
serialize Money
```

sin ninguna dependencia de infraestructura.

---

## 398. SECOND MILESTONE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

SECOND MILESTONE

Agregar:

```text
Rate
Percentage
Coefficient
Quantity
```

y validar incompatibilidades.

---

## 399. THIRD MILESTONE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

THIRD MILESTONE

Agregar:

```text
ExecutionContext
Result
Diagnostics
Versions
```

---

## 400. FOURTH MILESTONE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FOURTH MILESTONE

Integrar los tipos con:

```text
AEL Type System
```

del Documento 58 cuando corresponda.

---

## 401. FIFTH MILESTONE

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

FIFTH MILESTONE

Integrar con:

```text
Financial Engine
Settlement Engine
```

sin modificar los contratos fundamentales.

---

## 402. PRINCIPIO DE ESTABILIDAD

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE ESTABILIDAD

Estos tipos serán utilizados por múltiples módulos.

Por ello:

```text
breaking changes
```

deben requerir una decisión arquitectónica explícita.

---

## 403. PRINCIPIO DE PEQUEÑEZ

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE PEQUEÑEZ

Un tipo fundamental debe hacer:

```text
una cosa
```

y hacerla bien.

---

## 404. PRINCIPIO DE EXPLICITUD

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE EXPLICITUD

Preferir:

```text
Money
Rate
Coefficient
Quantity
```

sobre:

```text
number
```

cuando el significado sea financiero.

---

## 405. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE INMUTABILIDAD

Los valores financieros no deben cambiar después de su creación.

---

## 406. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE DETERMINISMO

La misma entrada debe producir el mismo valor.

---

## 407. PRINCIPIO DE INFRAESTRUCTURA

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

PRINCIPIO DE INFRAESTRUCTURA

```text
Core
→
Types
→
Domain
```

no debe conocer:

```text
Database
HTTP
Cloud
Framework
```

---

## 408. RESULTADO ESPERADO

> **Origen:** Motor de liquidacion_Core Domain & Foundational Types 55.md

RESULTADO ESPERADO

Al terminar este documento tendremos una base:

```text
estable
tipada
inmutable
determinista
testeable
```

sobre la que se podrá construir el compilador y Runtime.

---
