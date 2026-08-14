# AEL V1 — AEL Runtime — Execution Semantics & Runtime Architecture

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
05 — Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md
28 — Motor de liquidacion_AEL_V1_Runtime_Engine 28.md
35 — Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md
39 — Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md
62 — Motor de liquidacion_Runtime Architecture & Execution Engine 62.md
```

## 1. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

OBJETIVO

El Runtime debe transformar:

```text
Artifact + ExecutionContext
```

en:

```text
ExecutionResult
```

mediante una ejecución:

- segura;
- determinista;
- limitada;
- trazable;
- reproducible;
- independiente del frontend;
- independiente de PostgreSQL;
- independiente de Supabase.

Flujo:

```text
SOURCE
  ↓
COMPILER
  ↓
ARTIFACT
  ↓
VERIFIER
  ↓
RUNTIME
  ↓
RESULT
```

---

## 2. PRINCIPIO FUNDAMENTAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PRINCIPIO FUNDAMENTAL

El Runtime **no es un compilador**.

No debe recibir Source como entrada de ejecución normal.

Entrada válida:

```text
VerifiedArtifact
+
ExecutionContext
```

Entrada inválida:

```text
Source AEL
```

La compilación y ejecución son responsabilidades diferentes.

---

## 3. RESPONSABILIDADES DEL RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

RESPONSABILIDADES DEL RUNTIME

El Runtime es responsable de:

- cargar Artifact;
- verificar invariantes;
- inicializar ejecución;
- administrar Instruction Pointer;
- administrar Value Stack;
- administrar Local Variables;
- resolver Contracts;
- invocar Functions registradas;
- aplicar límites;
- controlar errores;
- producir resultado;
- producir métricas;
- producir traza cuando esté habilitada.

---

## 4. RESPONSABILIDADES QUE NO TIENE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

RESPONSABILIDADES QUE NO TIENE

El Runtime no debe:

- consultar SQL directamente;
- acceder directamente a PostgreSQL;
- acceder directamente al filesystem;
- ejecutar JavaScript arbitrario;
- realizar HTTP arbitrario;
- ejecutar procesos;
- cargar módulos dinámicos;
- leer secretos;
- modificar reglas;
- publicar versiones.

---

## 5. ARQUITECTURA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ARQUITECTURA

```text
                 VERIFIED ARTIFACT
                        │
                        ▼
                ┌───────────────┐
                │ ExecutionEngine│
                └───────┬───────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      ValueStack    LocalFrame    InstructionPointer
          │             │             │
          └─────────────┼─────────────┘
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
       FunctionRegistry      ContractResolver
             │                     │
             ▼                     ▼
        Functions             Providers
```

---

## 6. EXECUTION ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION ENGINE

El componente principal será conceptualmente:

```text
ExecutionEngine
```

API conceptual:

```text
execute(
    artifact,
    context,
    options
) -> ExecutionResult
```

No debe exponer una API que permita ejecutar código fuente arbitrario.

---

## 7. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION CONTEXT

El contexto representa los datos y capacidades disponibles durante una ejecución.

Conceptualmente:

```text
ExecutionContext
├── tenant
├── actor
├── period
├── clock
├── capabilities
├── providers
├── limits
└── metadata
```

---

## 8. TENANT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TENANT

Toda ejecución AQUILA debe estar asociada a un tenant cuando la regla sea tenant-owned.

Ejemplo conceptual:

```text
tenantId
```

El Runtime no debe aceptar un tenant arbitrario suministrado por una regla.

---

## 9. ACTOR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ACTOR

Puede existir información sobre el actor que inicia la operación:

```text
userId
role
permissions
```

El Source AEL no debe poder modificar estos datos.

---

## 10. CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CLOCK

La fecha y hora deben provenir del contexto.

Conceptualmente:

```text
Clock
├── currentDate
└── currentDateTime
```

Esto evita depender directamente del reloj del sistema operativo.

---

## 11. DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

DETERMINISMO

Una ejecución debe ser determinista respecto de:

```text
Artifact
RuntimeVersion
ContractVersions
FunctionVersions
ExecutionContext
```

No utilizar:

```text
Math.random()
Date.now()
new Date()
```

directamente dentro del Runtime semántico.

---

## 12. PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDERS

Los Providers son las únicas puertas controladas hacia información externa.

Ejemplos:

```text
UnitProvider
ParameterProvider
PeriodProvider
PropertyProvider
OwnerProvider
```

El Runtime conoce interfaces, no implementaciones concretas.

---

## 13. PROVIDER INTERFACE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER INTERFACE

Conceptualmente:

```text
Provider
├── id
├── version
├── capabilities
└── resolve(request, context)
```

La implementación concreta puede utilizar:

```text
PostgreSQL
Supabase
API interna
memoria
mock
```

sin que el Runtime lo sepa.

---

## 14. CONTRACT RESOLVER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CONTRACT RESOLVER

El Runtime necesita resolver:

```text
LOAD_CONTRACT contractId
```

mediante:

```text
ContractResolver
```

El resolver:

1. recibe Contract ID;
2. verifica que esté declarado;
3. verifica versión;
4. verifica capacidad;
5. consulta Provider;
6. devuelve AELValue.

---

## 15. CONTRACT NO DECLARADO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CONTRACT NO DECLARADO

Si el Artifact solicita:

```text
LOAD_CONTRACT X
```

pero `X` no está declarado en sus dependencias:

```text
AEL-RUNTIME-CONTRACT-001
```

La ejecución debe detenerse.

---

## 16. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CAPABILITIES

Cada acceso externo requiere una capacidad explícita.

Ejemplo:

```text
READ_UNIT
READ_PARAMETER
READ_PERIOD
READ_PROPERTY
```

No debe existir una capacidad genérica:

```text
READ_DATABASE
```

para una regla normal.

---

## 17. CAPABILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CAPABILITY CHECK

Antes de solicitar datos:

```text
Runtime
 ↓
Capability Check
 ↓
Contract Resolver
 ↓
Provider
```

Si la capacidad no está autorizada:

```text
AEL-SECURITY-CAPABILITY-001
```

---

## 18. AISLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

AISLAMIENTO

Una regla AEL no puede acceder a:

```text
tenant B
```

si se está ejecutando en:

```text
tenant A
```

La separación debe existir en varias capas:

```text
AEL
 ↓
Runtime
 ↓
Provider
 ↓
Repository
 ↓
RLS
```

---

## 19. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

RLS

El Runtime no sustituye RLS.

Incluso si el Runtime valida:

```text
tenantId
```

PostgreSQL debe mantener:

```text
RLS
```

como segunda línea de defensa.

---

## 20. VALUE STACK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

VALUE STACK

El Runtime utiliza una pila de valores:

```text
ValueStack
```

Ejemplo:

```text
[]
```

Después:

```text
LOAD_LOCAL 0
```

si `local0 = 120 M2`:

```text
[120 M2]
```

Después:

```text
LOAD_LOCAL 1
```

:

```text
[120 M2, 4500 COP/M2]
```

Después:

```text
MULTIPLY
```

:

```text
[542250 COP]
```

---

## 21. STACK OPERATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

STACK OPERATIONS

Como mínimo:

```text
push(value)
pop()
peek()
size()
clear()
```

El Runtime debe verificar bajo flujo.

---

## 22. STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

STACK UNDERFLOW

Si una instrucción necesita dos valores y sólo existe uno:

```text
AEL-RUNTIME-STACK-001
```

La ejecución termina.

Nunca continuar con valores inventados.

---

## 23. STACK OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

STACK OVERFLOW

El Runtime debe aplicar:

```text
maxStackDepth
```

Si se excede:

```text
AEL-RUNTIME-STACK-002
```

---

## 24. LOCAL FRAME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LOCAL FRAME

Cada ejecución tiene un espacio para variables locales:

```text
LocalFrame
```

Ejemplo:

```text
local 0 → area
local 1 → tarifa
local 2 → total
```

---

## 25. LOCAL ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LOCAL ACCESS

```text
LOAD_LOCAL index
```

carga una variable.

```text
STORE_LOCAL index
```

almacena un valor.

Los índices son resueltos durante compilación.

---

## 26. LOCAL INDEX INVÁLIDO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LOCAL INDEX INVÁLIDO

Si:

```text
LOAD_LOCAL 99
```

y sólo existen 3 locals:

```text
AEL-RUNTIME-LOCAL-001
```

El Artifact debería haber sido rechazado previamente por el Verifier.

El Runtime mantiene la protección como defensa adicional.

---

## 27. INSTRUCTION POINTER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

INSTRUCTION POINTER

El Runtime mantiene:

```text
instructionPointer
```

que identifica la siguiente instrucción.

Inicialmente:

```text
instructionPointer = entryPoint
```

---

## 28. CICLO PRINCIPAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CICLO PRINCIPAL

Conceptualmente:

```text
while running:

    instruction =
        artifact.instructions[instructionPointer]

    execute(instruction)

    update instructionPointer
```

El código real no debe ser literalmente este fragmento; es el modelo semántico.

---

## 29. EXECUTION LOOP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION LOOP

Cada iteración debe:

1. comprobar límites;
2. obtener instrucción;
3. validar estado;
4. ejecutar;
5. actualizar IP;
6. contabilizar métricas;
7. continuar.

---

## 30. MAX INSTRUCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAX INSTRUCTIONS

Cada instrucción ejecutada incrementa:

```text
instructionsExecuted
```

Si:

```text
instructionsExecuted >= maxInstructions
```

se produce:

```text
AEL-RUNTIME-INSTRUCTION_LIMIT
```

---

## 31. MAX EXECUTION TIME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAX EXECUTION TIME

La ejecución debe tener:

```text
maxExecutionTime
```

configurable.

Si se supera:

```text
AEL-RUNTIME-TIME_LIMIT
```

---

## 32. MAX STACK DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAX STACK DEPTH

Debe existir:

```text
maxStackDepth
```

para impedir crecimiento ilimitado.

---

## 33. MAX LIST SIZE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAX LIST SIZE

Debe existir:

```text
maxListSize
```

para impedir que una regla genere una lista gigantesca.

---

## 34. MAX STRING LENGTH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAX STRING LENGTH

Debe existir:

```text
maxStringLength
```

para controlar consumo de memoria.

---

## 35. MAX MEMORY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAX MEMORY

Cuando sea viable según el entorno de ejecución, definir:

```text
maxMemory
```

La implementación concreta dependerá del runtime de TypeScript/Node.

La política debe evitar que una regla consuma recursos sin límite.

---

## 36. LIMITS OBJECT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LIMITS OBJECT

Conceptualmente:

```text
ExecutionLimits
├── maxInstructions
├── maxExecutionTime
├── maxStackDepth
├── maxListSize
├── maxStringLength
└── maxMemory
```

---

## 37. LIMITS POR CONTEXTO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LIMITS POR CONTEXTO

Puede existir una configuración global:

```text
RuntimeDefaults
```

y límites específicos:

```text
ExecutionOptions
```

Nunca debe permitirse que una regla aumente sus propios límites.

---

## 38. INSTRUCTION SET

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

INSTRUCTION SET

V1 utiliza:

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

## 39. PUSH_CONSTANT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PUSH_CONSTANT

Ejemplo:

```text
PUSH_CONSTANT 0
```

Carga la constante indicada.

Debe validar el índice.

---

## 40. LOAD_LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LOAD_LOCAL

```text
LOAD_LOCAL 0
```

Obtiene el valor del local 0 y lo coloca en la pila.

---

## 41. STORE_LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

STORE_LOCAL

```text
STORE_LOCAL 0
```

Extrae un valor de la pila y lo almacena.

Debe respetar el tipo definido por el Artifact.

---

## 42. LOAD_CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

LOAD_CONTRACT

```text
LOAD_CONTRACT 0
```

El índice corresponde a un Contract previamente declarado.

El Runtime solicita su valor mediante `ContractResolver`.

---

## 43. CALL_FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CALL_FUNCTION

Conceptualmente:

```text
CALL_FUNCTION functionId, argc
```

El Runtime:

1. obtiene Function;
2. valida capacidad;
3. extrae argumentos;
4. ejecuta Function;
5. valida resultado;
6. coloca resultado en stack.

---

## 44. FUNCTION REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

FUNCTION REGISTRY

Debe existir:

```text
FunctionRegistry
```

con:

```text
functionId
version
signature
implementation
capabilities
determinism
```

---

## 45. FUNCTION VERSION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

FUNCTION VERSION

Una Function publicada debe tener versión.

Ejemplo:

```text
REDONDEAR_DINERO@2
```

El Artifact debe registrar esa versión.

---

## 46. FUNCTION DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

FUNCTION DETERMINISM

Cada Function debe declarar si es determinista.

V1 debe permitir únicamente Functions compatibles con la política de determinismo.

Funciones no deterministas deben estar explícitamente identificadas y no pueden aparecer en reglas que requieran reproducibilidad estricta.

---

## 47. FUNCTION SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

FUNCTION SECURITY

Una Function no debe ejecutar código proporcionado por el usuario.

Su implementación pertenece al sistema.

Ejemplo:

```text
PORCENTAJE
REDONDEAR_DINERO
ABS
SUM
```

son código controlado por AQUILA.

---

## 48. ADD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ADD

La instrucción:

```text
ADD
```

extrae dos valores y utiliza el Value Engine.

Ejemplo:

```text
100 M2 + 20 M2
```

Resultado:

```text
120 M2
```

---

## 49. MULTIPLY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MULTIPLY

```text
MULTIPLY
```

delega la semántica al Value Engine.

Ejemplo:

```text
120.50 M2 × 4500 COP/M2
=
542250 COP
```

---

## 50. DIVIDE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

DIVIDE

```text
DIVIDE
```

delega en Value Engine.

Si el divisor es cero:

```text
AEL-MATH-001
```

---

## 51. COMPARACIONES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

COMPARACIONES

Las instrucciones:

```text
EQUAL
NOT_EQUAL
GREATER_THAN
GREATER_EQUAL
LESS_THAN
LESS_EQUAL
```

utilizan las reglas de compatibilidad del Type System.

No deben implementar comparaciones JavaScript directamente.

---

## 52. AND / OR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

AND / OR

Deben respetar la semántica de cortocircuito.

La generación del Artifact debe utilizar saltos cuando sea necesario.

Por ejemplo:

```text
A Y B
```

no debe evaluar `B` si `A` es FALSO.

---

## 53. NOT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NOT

```text
NOT
```

requiere BOOLEAN.

No debe aceptar automáticamente NUMBER o STRING.

---

## 54. NEGATE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NEGATE

```text
NEGATE
```

permite:

```text
-10
```

y valores numéricos compatibles.

Debe rechazar tipos sin semántica de negación.

---

## 55. JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

JUMP

```text
JUMP target
```

actualiza:

```text
instructionPointer
```

El target debe haber sido validado por el ArtifactVerifier.

---

## 56. JUMP_IF_FALSE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

JUMP_IF_FALSE

```text
JUMP_IF_FALSE target
```

consume una condición BOOLEAN.

Si es FALSO:

```text
IP = target
```

Si es VERDADERO:

```text
IP = siguiente instrucción
```

---

## 57. MAKE_LIST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MAKE_LIST

Conceptualmente:

```text
MAKE_LIST count
```

extrae `count` valores y crea una lista.

Debe verificar:

```text
count <= maxListSize
```

y compatibilidad de tipos.

---

## 58. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

RETURN

```text
RETURN
```

finaliza la ejecución y produce:

```text
ExecutionResult.value
```

Debe existir un único resultado de retorno compatible con el contrato.

---

## 59. RETURN SIN VALOR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

RETURN SIN VALOR

Si una regla requiere resultado y ejecuta:

```text
RETURN
```

sin valor:

```text
AEL-RUNTIME-RETURN-001
```

---

## 60. EXECUTION FRAME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION FRAME

Aunque V1 no requiera recursión general, el Runtime debe encapsular el estado en:

```text
ExecutionFrame
```

Conceptualmente:

```text
ExecutionFrame
├── artifact
├── instructionPointer
├── stack
├── locals
├── context
├── limits
└── metrics
```

---

## 61. CALL STACK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CALL STACK

El Call Stack será necesario si las Functions futuras utilizan frames internos.

V1 debe mantenerlo controlado.

```text
CallStack
├── Frame 0
├── Frame 1
└── ...
```

Debe existir:

```text
maxCallDepth
```

---

## 62. PROVIDER CALLS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER CALLS

Una llamada a Provider puede ser potencialmente costosa.

Por tanto debe contabilizarse:

```text
providerCalls
```

y, si corresponde:

```text
maxProviderCalls
```

---

## 63. PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER RESULT

El Provider debe devolver valores AEL válidos.

No debe devolver directamente:

```text
row de PostgreSQL
```

ni objetos arbitrarios.

Debe devolver:

```text
AELValue
```

o una estructura semánticamente equivalente.

---

## 64. PROVIDER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER ERROR

Un error de Provider debe transformarse a un error AEL controlado.

Ejemplo:

```text
AEL-PROVIDER-001
```

Nunca filtrar:

```text
SQL stack trace
database credentials
internal filesystem path
```

al usuario final.

---

## 65. ERROR CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ERROR CONTEXT

Un error puede contener internamente:

```text
code
message
instructionPointer
sourceSpan
functionId
contractId
```

pero la presentación pública debe filtrar información sensible.

---

## 66. ERROR CATEGORIES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ERROR CATEGORIES

Categorías mínimas:

```text
AEL-RUNTIME
AEL-MATH
AEL-PROVIDER
AEL-FUNCTION
AEL-CONTRACT
AEL-SECURITY
AEL-LIMIT
AEL-ARTIFACT
```

---

## 67. ERROR STACK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ERROR STACK

El Runtime puede conservar un stack técnico para diagnóstico.

Pero no debe exponerlo automáticamente al usuario.

---

## 68. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION STATUS

Estados mínimos:

```text
SUCCESS
ERROR
TIMEOUT
CANCELLED
LIMIT_EXCEEDED
```

---

## 69. EXECUTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION RESULT

Modelo conceptual:

```text
ExecutionResult
├── status
├── value
├── type
├── duration
├── instructionsExecuted
├── providerCalls
├── diagnostics
└── trace?
```

---

## 70. CANCELACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CANCELACIÓN

La ejecución debe poder cancelarse desde fuera del Runtime.

Conceptualmente:

```text
AbortSignal
```

o mecanismo equivalente.

La regla no puede cancelar sus propios límites para evadirlos.

---

## 71. CANCELACIÓN CONTROLADA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CANCELACIÓN CONTROLADA

Si la ejecución es cancelada:

```text
status = CANCELLED
```

No debe retornar un resultado parcial como si fuera válido.

---

## 72. SIMULACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

SIMULACIÓN

El modo:

```text
SIMULACION
```

utiliza el mismo Runtime.

La diferencia está en:

```text
ExecutionContext
Providers
Persistence policy
```

---

## 73. PRODUCCIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PRODUCCIÓN

El modo:

```text
PRODUCCION
```

utiliza:

```text
Providers autorizados
tenant real
contexto real
auditoría
```

---

## 74. REGLA FUNDAMENTAL DE SIMULACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

REGLA FUNDAMENTAL DE SIMULACIÓN

No crear:

```text
SimulationEngine
```

separado.

Debe utilizarse:

```text
ExecutionEngine
```

con un contexto controlado.

Esto evita que simulación y producción produzcan resultados diferentes por utilizar motores distintos.

---

## 75. FAKE PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

FAKE PROVIDERS

La simulación puede utilizar:

```text
FakeUnitProvider
FakeParameterProvider
FakePeriodProvider
```

Ejemplo:

```text
UNIT.AREA_PRIVATE
→ 120.50 M2
```

---

## 76. EXECUTION SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

EXECUTION SNAPSHOT

Para reproducibilidad puede existir:

```text
ExecutionSnapshot
```

que capture los valores relevantes usados durante la ejecución.

Ejemplo:

```text
UNIT.AREA_PRIVATE
→ 120.50 M2
```

```text
PARAMETER.TARIFA_M2
→ 4500 COP/M2
```

---

## 77. SNAPSHOT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

SNAPSHOT POLICY

No todas las ejecuciones necesitan almacenar todos los valores.

La política dependerá de:

```text
auditability
privacy
storage cost
regulatory requirements
```

---

## 78. TRAZA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TRAZA

Cuando se habilita:

```text
TRACE
```

el Runtime puede registrar:

```text
instructionPointer
opcode
stackBefore
stackAfter
sourceSpan
duration
```

---

## 79. TRACE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TRACE LIMIT

La traza también debe tener límites.

Ejemplo:

```text
maxTraceEntries
```

Evitar que una ejecución con loop produzca millones de registros.

---

## 80. TRACE NO ES AUDITORÍA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TRACE NO ES AUDITORÍA

La traza técnica y la auditoría de negocio son diferentes.

```text
TRACE
```

explica cómo ejecutó el Runtime.

```text
AUDIT
```

explica quién ejecutó, qué versión y con qué resultado.

---

## 81. AUDITORÍA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

AUDITORÍA

Una ejecución de producción puede registrar:

```text
executionId
tenantId
ruleId
ruleVersion
artifactHash
runtimeVersion
status
startedAt
finishedAt
```

No almacenar automáticamente todos los valores sensibles.

---

## 82. REPRODUCIBILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

REPRODUCIBILIDAD

Una ejecución debe poder relacionarse con:

```text
ruleVersion
artifactHash
runtimeVersion
contractVersions
functionVersions
snapshot
```

---

## 83. PROVIDER CACHING

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER CACHING

El Runtime puede utilizar caché controlada para Providers.

Ejemplo:

```text
UNIT.AREA_PRIVATE
```

solicitado varias veces dentro de una ejecución.

Puede resolverse una vez.

Pero la caché debe ser:

```text
por ejecución
```

y no global sin una política explícita.

---

## 84. CACHÉ Y DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CACHÉ Y DETERMINISMO

La caché no debe modificar el resultado.

Debe ser una optimización transparente.

---

## 85. PROVIDER SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER SIDE EFFECTS

Providers utilizados por reglas normales deben ser de lectura.

V1 no habilita operaciones arbitrarias de escritura desde AEL.

Por ejemplo:

```text
WRITE_DATABASE
```

no es una capability estándar de AEL V1.

---

## 86. FUNCIONES PURAS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

FUNCIONES PURAS

Las Functions estándar deben ser preferentemente puras:

```text
entrada
 ↓
resultado
```

sin modificar estado externo.

Esto simplifica:

- testing;
- caching;
- determinismo;
- reproducibilidad.

---

## 87. SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

SIDE EFFECTS

Si en una versión futura existen Functions con side effects, deberán tener:

```text
capability
transaction policy
audit policy
idempotency policy
```

No forman parte de la ejecución normal V1.

---

## 88. SEGURIDAD DEL RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

SEGURIDAD DEL RUNTIME

El Runtime debe considerar el Artifact como input no confiable.

Incluso si proviene del propio sistema.

Por tanto:

```text
Artifact
 ↓
Verifier
 ↓
Runtime
```

No:

```text
Artifact
 ↓
Runtime
```

directamente.

---

## 89. DEFENSA EN PROFUNDIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

DEFENSA EN PROFUNDIDAD

Capas:

```text
Parser
 ↓
Analyzer
 ↓
Artifact Builder
 ↓
Artifact Verifier
 ↓
Runtime checks
 ↓
Provider authorization
 ↓
RLS
```

---

## 90. NO EVAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NO EVAL

El Runtime no debe utilizar:

```text
eval()
Function()
vm.runInNewContext()
```

como mecanismo de ejecución.

El Instruction Set es el lenguaje ejecutable.

---

## 91. NO SQL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NO SQL

Una regla no puede contener:

```text
SELECT ...
UPDATE ...
DELETE ...
```

ni enviar SQL dinámico.

---

## 92. NO HTTP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NO HTTP

Una regla no puede realizar:

```text
HTTP GET
HTTP POST
fetch()
axios()
```

arbitrariamente.

Si alguna integración futura necesita HTTP, deberá existir un Contract/Function/capability explícitamente diseñada para ello.

---

## 93. NO FILESYSTEM

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NO FILESYSTEM

AEL no puede leer:

```text
D:\...
/etc/...
```

ni utilizar APIs de filesystem.

---

## 94. NO PROCESS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

NO PROCESS

AEL no puede ejecutar:

```text
child_process
spawn
exec
shell
```

---

## 95. RESOURCE EXHAUSTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

RESOURCE EXHAUSTION

Debe protegerse contra:

```text
loop infinito
listas gigantes
strings gigantes
stack overflow
function recursion
provider explosion
```

---

## 96. PROVIDER EXPLOSION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER EXPLOSION

Una regla no debe poder generar miles de consultas indirectas sin límite.

Debe existir:

```text
maxProviderCalls
```

cuando el caso de uso lo requiera.

---

## 97. CONTEXTO INMUTABLE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CONTEXTO INMUTABLE

Durante una ejecución:

```text
ExecutionContext
```

se considera inmutable.

Una regla no puede modificar:

```text
tenantId
userId
permissions
clock
limits
```

---

## 98. THREAD SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

THREAD SAFETY

El Runtime debe evitar estado global mutable.

La arquitectura recomendada es:

```text
Execution #1
    Frame A

Execution #2
    Frame B
```

sin compartir estado mutable accidentalmente.

---

## 99. CONCURRENCIA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CONCURRENCIA

Varias ejecuciones pueden ocurrir simultáneamente.

Cada ejecución debe tener:

```text
own stack
own locals
own instruction pointer
own context
own metrics
```

---

## 100. SINGLETONS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

SINGLETONS

Puede existir un:

```text
FunctionRegistry
UnitRegistry
```

compartido si son inmutables.

No compartir:

```text
ValueStack
LocalFrame
ExecutionContext
```

entre ejecuciones.

---

## 101. THREAD / EVENT LOOP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

THREAD / EVENT LOOP

En Node.js el Runtime puede utilizar el event loop para operaciones externas controladas.

Pero la semántica de AEL debe seguir siendo determinista.

Los Providers asíncronos deben resolver de forma explícita mediante la infraestructura del Runtime.

---

## 102. ASINCRONÍA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ASINCRONÍA

AEL V1 no expone:

```text
AWAIT
ASYNC
PROMISE
```

al usuario.

La implementación interna puede ser asíncrona para acceder a Providers, sin que el lenguaje tenga semántica asíncrona visible.

---

## 103. PROVIDER ASÍNCRONO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER ASÍNCRONO

Conceptualmente:

```text
Runtime
 ↓
await Provider.resolve()
 ↓
AELValue
```

El Source AEL sigue siendo sincrónico desde el punto de vista semántico.

---

## 104. TIMEOUT DE PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TIMEOUT DE PROVIDER

Los Providers deben tener timeout.

Ejemplo:

```text
maxProviderTime
```

Si se excede:

```text
AEL-PROVIDER-TIMEOUT
```

---

## 105. PROVIDER RETRY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

PROVIDER RETRY

No hacer retries automáticos indiscriminados.

Si se habilitan, deben estar controlados por Infrastructure y no por la regla AEL.

---

## 106. ERROR PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

ERROR PROPAGATION

Un error de Provider debe terminar la ejecución salvo que una Function o mecanismo explícito de manejo futuro permita otra política.

V1 no incluye `TRY/CATCH`.

---

## 107. OBSERVABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

OBSERVABILIDAD

El Runtime debe producir métricas como:

```text
executionCount
executionDuration
instructionCount
providerCalls
functionCalls
errors
timeouts
```

---

## 108. MÉTRICAS POR REGLA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MÉTRICAS POR REGLA

Debe ser posible obtener:

```text
ruleId
ruleVersion
executionCount
averageDuration
errorRate
```

sin almacenar necesariamente cada ejecución completa.

---

## 109. MÉTRICAS NO FORMAN PARTE DEL RESULTADO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

MÉTRICAS NO FORMAN PARTE DEL RESULTADO

Las métricas operacionales no deben alterar:

```text
ExecutionResult.value
```

ni la semántica de la regla.

---

## 110. TEST CANÓNICO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST CANÓNICO

Artifact equivalente a:

```text
LOAD_CONTRACT AREA
STORE_LOCAL 0

LOAD_CONTRACT RATE
STORE_LOCAL 1

LOAD_LOCAL 0
LOAD_LOCAL 1

MULTIPLY
RETURN
```

Contexto:

```text
AREA = 120.50 M2
RATE = 4500 COP/M2
```

Resultado:

```text
542250 COP
```

---

## 111. TEST DE LÍMITE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST DE LÍMITE

Artifact:

```text
JUMP 0
```

Debe terminar mediante:

```text
AEL-RUNTIME-INSTRUCTION_LIMIT
```

o:

```text
AEL-RUNTIME-TIME_LIMIT
```

dependiendo de cuál se alcance primero.

---

## 112. TEST STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST STACK UNDERFLOW

Artifact:

```text
MULTIPLY
RETURN
```

sin operandos.

Resultado:

```text
AEL-RUNTIME-STACK-001
```

---

## 113. TEST CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST CONTRACT

Artifact:

```text
LOAD_CONTRACT unknown
RETURN
```

Resultado:

```text
AEL-RUNTIME-CONTRACT-001
```

---

## 114. TEST CAPABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST CAPABILITY

Una regla solicita un Contract que requiere:

```text
READ_PROPERTY
```

pero el contexto no tiene dicha capability.

Resultado:

```text
AEL-SECURITY-CAPABILITY-001
```

---

## 115. TEST MULTITENANT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST MULTITENANT

Ejecutar una regla del tenant A intentando resolver información del tenant B.

Debe producir:

```text
denegación
```

y no devolver datos.

La protección definitiva debe estar respaldada por RLS.

---

## 116. TEST DE CANCELACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST DE CANCELACIÓN

Una ejecución larga recibe señal de cancelación.

Resultado:

```text
status = CANCELLED
```

No devolver resultado parcial como válido.

---

## 117. TEST DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST DE DETERMINISMO

Con:

```text
Artifact X
Context Y
Runtime Z
```

ejecutar varias veces.

Debe producir:

```text
mismo resultado
```

---

## 118. TEST DE VERSIONADO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST DE VERSIONADO

Ejecutar:

```text
Artifact v1
```

y:

```text
Artifact v2
```

debe permitir determinar cuál produjo cada resultado.

---

## 119. TEST DE SIMULACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

TEST DE SIMULACIÓN

Con:

```text
FakeProviders
```

el resultado debe ser igual al de producción si:

```text
mismos valores
mismas versiones
mismo contexto lógico
```

---

## 120. CRITERIO DE CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Execution_Engine 5.md

CRITERIO DE CIERRE

El Runtime V1 se considera funcional cuando pueda:

```text
✓ cargar Artifact
✓ verificar precondiciones
✓ ejecutar Instruction Set
✓ administrar stack
✓ administrar locals
✓ resolver Contracts
✓ invocar Functions
✓ aplicar límites
✓ cancelar
✓ producir resultado
✓ producir errores
✓ producir métricas
✓ generar trace opcional
✓ mantener aislamiento
✓ respetar capabilities
✓ operar con simulación
✓ operar con producción
```

---

## 121. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

OBJETIVO

Implementar:

```text
Verified Artifact
 ↓
ExecutionContext
 ↓
Runtime Engine
 ↓
Providers / Functions
 ↓
Result
```

---

## 122. RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RESPONSABILIDADES

El Runtime debe:

```text
cargar Artifact
verificar Artifact
crear ExecutionContext
ejecutar instrucciones
resolver locals
resolver Contracts
resolver Functions
aplicar límites
capturar errores
producir resultado
```

---

## 123. NO RESPONSABILIDADES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

NO RESPONSABILIDADES

Runtime no debe:

```text
parsear Source
consultar PostgreSQL directamente
decidir permisos de usuario
modificar Rules
publicar Artifacts
ejecutar JavaScript generado
resolver nombres arbitrariamente
```

---

## 124. INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INPUT

```ts
VerifiedArtifact
ExecutionContext
```

---

## 125. OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

OUTPUT

```ts
ExecutionResult
```

con:

```text
status
value
error
metrics
trace metadata
```

---

## 126. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION CONTEXT

Debe contener:

```text
tenant
actor
rule
ruleVersion
artifact
providers
capabilities
limits
correlationId
clock
```

---

## 127. TENANT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TENANT

El Runtime debe conocer el tenant de ejecución:

```text
tenantId
```

pero no debe confiar en un valor proveniente directamente del Source.

---

## 128. ACTOR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ACTOR

Contexto opcional:

```text
actorId
actorRole
```

según necesidades de autorización.

---

## 129. RULE CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RULE CONTEXT

Debe identificar:

```text
ruleId
ruleVersionId
artifactHash
```

---

## 130. CORRELATION ID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CORRELATION ID

Toda ejecución debe tener:

```text
correlationId
```

para trazabilidad.

---

## 131. CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CLOCK

Funciones relacionadas con fecha/hora deben recibir:

```text
Clock
```

abstracto.

No utilizar directamente:

```ts
new Date()
```

dentro del Runtime si afecta determinismo.

---

## 132. CLOCK INTERFACE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CLOCK INTERFACE

Conceptualmente:

```ts
interface AELClock {
  now(): DateTimeValue
}
```

---

## 133. DETERMINISTIC CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

DETERMINISTIC CLOCK

Tests deben utilizar:

```text
FixedClock
```

---

## 134. RANDOMNESS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RANDOMNESS

No permitir:

```text
Math.random()
```

directamente.

Si existe randomness en una Function futura:

```text
capability explícita
```

y política definida.

---

## 135. RUNTIME ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RUNTIME ENGINE

El Engine recibe:

```text
Artifact
```

y ejecuta:

```text
instructions
```

---

## 136. EXECUTION MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION MODEL

V1 puede utilizar:

```text
stack-based virtual machine
```

---

## 137. STACK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

STACK

El Runtime mantiene:

```text
operandStack
```

---

## 138. LOCAL STORAGE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LOCAL STORAGE

Mantiene:

```text
locals[]
```

---

## 139. INSTRUCTION POINTER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INSTRUCTION POINTER

Mantiene:

```text
instructionPointer
```

---

## 140. CALL FRAME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CALL FRAME

Si Functions no son subprogramas AEL sino Providers externos, V1 puede no necesitar call stack complejo.

Si posteriormente se agregan funciones AEL definidas por el usuario, deberá incorporarse.

---

## 141. MAX STACK DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

MAX STACK DEPTH

Debe existir:

```text
maxStackDepth
```

y verificarse antes de push.

---

## 142. MAX INSTRUCTIONS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

MAX INSTRUCTIONS

Debe existir:

```text
maxInstructions
```

---

## 143. INSTRUCTION COUNTER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INSTRUCTION COUNTER

Cada instruction ejecutada incrementa:

```text
instructionCount
```

---

## 144. TIME LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TIME LIMIT

ExecutionContext debe tener:

```text
deadline
```

o:

```text
maxExecutionMs
```

---

## 145. TIME CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TIME CHECK

El Runtime debe comprobar límites periódicamente.

No confiar sólo en:

```text
Promise timeout
```

para loops internos síncronos.

---

## 146. PROVIDER CALL LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER CALL LIMIT

Debe existir:

```text
maxProviderCalls
```

---

## 147. FUNCTION CALL LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FUNCTION CALL LIMIT

Debe existir:

```text
maxFunctionCalls
```

---

## 148. MEMORY LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

MEMORY LIMIT

Si la plataforma permite medir memoria:

```text
maxMemory
```

puede aplicarse.

No depender exclusivamente de ella en V1.

---

## 149. PROVIDER PORT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER PORT

Runtime utiliza:

```ts
ContractProvider
```

---

## 150. CONTRACT PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CONTRACT PROVIDER

Conceptualmente:

```ts
interface ContractProvider {
  get(reference: ContractReference, context: ProviderContext): Promise<AELValue>
}
```

Si ejecución síncrona es requisito del engine, puede existir variante sync.

---

## 151. PROVIDER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER CONTEXT

Debe contener:

```text
tenantId
actor
correlationId
capabilities
```

---

## 152. PROVIDER AUTHORIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER AUTHORIZATION

Runtime verifica que la capability requerida por la dependency esté presente.

---

## 153. PROVIDER NO RAW DATABASE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER NO RAW DATABASE

ContractProvider no debe recibir acceso irrestricto a:

```text
PostgreSQL client
```

como contrato público de AEL.

---

## 154. PROVIDER ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER ISOLATION

Provider debe exponer únicamente:

```text
Contract result
```

---

## 155. FUNCTION PROVIDER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

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

## 156. FUNCTION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FUNCTION VALIDATION

Runtime debe validar:

```text
function dependency
argument count
capability
result type
```

---

## 157. FUNCTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FUNCTION RESULT

Una Function debe devolver:

```text
AELValue
```

no:

```text
raw JavaScript object
```

sin adaptación.

---

## 158. PROVIDER RESULT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER RESULT VALIDATION

Runtime debe verificar que el valor retornado cumple el Contract/Function signature.

---

## 159. INVALID PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INVALID PROVIDER RESULT

Error:

```text
AEL-RUNTIME-001
Provider returned an incompatible value.
```

---

## 160. OPCODE DISPATCH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

OPCODE DISPATCH

Runtime debe utilizar un dispatch controlado:

```text
switch opcode
```

o una tabla estática de handlers.

---

## 161. NO DYNAMIC EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

NO DYNAMIC EXECUTION

Prohibido:

```text
eval
new Function
dynamic code generation
```

---

## 162. LOAD_LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LOAD_LITERAL

```text
LOAD_LITERAL index
```

obtiene un valor del Constant Pool.

---

## 163. LOAD_LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LOAD_LOCAL

```text
LOAD_LOCAL index
```

push sobre stack.

---

## 164. STORE_LOCAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

STORE_LOCAL

```text
STORE_LOCAL index
```

consume stack.

---

## 165. LOAD_CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LOAD_CONTRACT

```text
LOAD_CONTRACT dependencyIndex
```

resuelve ContractProvider.

---

## 166. CALL_FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CALL_FUNCTION

```text
CALL_FUNCTION dependencyIndex argumentCount
```

consume argumentos y produce resultado.

---

## 167. UNARY_OP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

UNARY_OP

Ejecuta:

```text
NOT
PLUS
MINUS
```

según operator metadata.

---

## 168. BINARY_OP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

BINARY_OP

Ejecuta:

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

## 169. TYPE SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TYPE SAFETY

Runtime debe comprobar invariantes críticas aunque Analyzer ya haya validado.

---

## 170. STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

STACK UNDERFLOW

Si una instruction necesita:

```text
2 operands
```

y stack contiene:

```text
1
```

fallar con:

```text
AEL-RUNTIME-002
```

---

## 171. STACK OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

STACK OVERFLOW

Si push supera:

```text
maxStackDepth
```

fallar con:

```text
AEL-RUNTIME-003
```

---

## 172. INVALID LOCAL INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INVALID LOCAL INDEX

```text
AEL-RUNTIME-004
```

---

## 173. INVALID CONSTANT INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INVALID CONSTANT INDEX

```text
AEL-RUNTIME-005
```

---

## 174. INVALID DEPENDENCY INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INVALID DEPENDENCY INDEX

```text
AEL-RUNTIME-006
```

---

## 175. INVALID JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INVALID JUMP

```text
AEL-RUNTIME-007
```

---

## 176. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

DIVISION BY ZERO

```text
AEL-MATH-001
```

---

## 177. INVALID TYPE OPERATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INVALID TYPE OPERATION

```text
AEL-TYPE-003
```

si un Artifact corrupto logra llegar a ejecución.

---

## 178. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RETURN

`RETURN` debe:

```text
obtener result
terminar execution
```

---

## 179. MISSING RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

MISSING RETURN

Si execution llega a EOF sin return:

```text
AEL-RUNTIME-008
```

---

## 180. MULTIPLE RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

MULTIPLE RETURN

Primer return alcanzado termina execution.

Unreachable instructions no deben ejecutarse.

---

## 181. CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CONDITIONAL

`JUMP_IF_FALSE`:

```text
pop Boolean
if false → jump
else → continue
```

---

## 182. BOOLEAN VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

BOOLEAN VALIDATION

`JUMP_IF_FALSE` sólo acepta:

```text
Boolean
```

No truthiness.

---

## 183. JUMP SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

JUMP SAFETY

No permitir:

```text
negative index
index >= instructionCount
```

---

## 184. INSTRUCTION POINTER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INSTRUCTION POINTER

Debe avanzar de forma determinista.

---

## 185. EXECUTION LOOP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION LOOP

Conceptualmente:

```text
while instructionPointer < instructions.length:
    enforce limits
    instruction = instructions[ip]
    execute instruction
```

---

## 186. LOOP LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LOOP LIMIT

Aunque V1 no permita loops explícitos en Source, mantener:

```text
maxInstructions
```

como defensa.

---

## 187. ASYNC PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ASYNC PROVIDERS

Provider calls pueden ser:

```text
async
```

---

## 188. EXECUTION MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION MODEL

El Engine puede ser:

```text
async
```

para soportar:

```text
PostgreSQL
HTTP
Storage
```

a través de adapters.

---

## 189. SEQUENTIAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

SEQUENTIAL EXECUTION

V1 debe ejecutar instructions en orden.

No paralelizar automáticamente Provider calls.

---

## 190. FUTURE PARALLELISM

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FUTURE PARALLELISM

Optimización futura podría detectar:

```text
independent provider loads
```

pero no implementarlo en V1.

---

## 191. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER TIMEOUT

Cada Provider call debe estar sujeto a:

```text
providerTimeout
```

---

## 192. TOTAL EXECUTION TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TOTAL EXECUTION TIMEOUT

Además:

```text
overall deadline
```

---

## 193. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CANCELLATION

ExecutionContext puede recibir:

```text
AbortSignal
```

o equivalente.

---

## 194. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CANCELLATION

Runtime debe comprobar:

```text
aborted
```

antes de instrucciones costosas y Provider calls.

---

## 195. RETRIES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RETRIES

Runtime no debe reintentar automáticamente Providers.

Retry pertenece a:

```text
Provider policy / Worker
```

salvo Functions explícitamente idempotentes.

---

## 196. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

IDEMPOTENCY

Runtime execution debe ser conceptualmente:

```text
read/evaluate
```

No debe realizar side effects arbitrarios.

---

## 197. SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

SIDE EFFECTS

Si una Function produce side effect:

```text
capability explícita
```

y policy específica.

---

## 198. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

V1 RECOMMENDATION

AEL V1 debe favorecer:

```text
pure calculation
```

y limitar side effects.

---

## 199. RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RESULT

```ts
interface ExecutionResult {
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT'
  value?: AELValue
  error?: RuntimeError
  metrics: ExecutionMetrics
}
```

---

## 200. EXECUTION METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION METRICS

Mínimo:

```text
durationMs
instructionCount
providerCalls
functionCalls
```

---

## 201. ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ERROR

RuntimeError debe contener:

```text
code
message
instructionPointer
sourceSpan?
cause?
```

---

## 202. ERROR CHAIN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ERROR CHAIN

No exponer internals sensibles:

```text
database connection strings
secrets
provider credentials
```

---

## 203. SOURCE LOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

SOURCE LOCATION

Si Artifact tiene debug map:

```text
instructionPointer
→ SourceSpan
```

---

## 204. USER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

USER ERROR

Ejemplo:

```text
No se pudo obtener el área privada del inmueble.
```

Debe mantener código técnico:

```text
AEL-PROVIDER-001
```

---

## 205. INTERNAL ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

INTERNAL ERROR

Logs internos pueden incluir:

```text
provider
dependency
correlationId
```

pero nunca secretos.

---

## 206. EXECUTION TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION TRACE

Puede existir opcionalmente:

```text
trace mode
```

para debugging.

---

## 207. TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TRACE

No habilitar trazas extremadamente detalladas por defecto en producción.

---

## 208. TRACE SECURITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TRACE SECURITY

No registrar:

```text
sensitive Contract values
```

sin política explícita.

---

## 209. TRACE EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TRACE EXAMPLE

Seguro:

```text
LOAD_CONTRACT PROPERTY.AREA_PRIVATE → Quantity<M2>
```

Evitar registrar el valor si contiene datos sensibles.

---

## 210. EXECUTION CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION CONTEXT IMMUTABILITY

El Context debe tratarse como:

```text
read-only configuration
```

durante ejecución, salvo contadores internos controlados.

---

## 211. PROVIDER CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER CONTEXT

Provider recibe contexto mínimo necesario.

---

## 212. LEAST PRIVILEGE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LEAST PRIVILEGE

Provider no debe recibir:

```text
all capabilities
```

si sólo necesita una.

---

## 213. CAPABILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CAPABILITY CHECK

Antes de Provider:

```text
requiredCapability ∈ allowedCapabilities
```

---

## 214. CAPABILITY FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CAPABILITY FAILURE

```text
AEL-SECURITY-001
Required capability is not granted.
```

---

## 215. TENANT ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TENANT ISOLATION

Runtime debe transportar:

```text
tenantId
```

a Provider.

---

## 216. TENANT MISMATCH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TENANT MISMATCH

Si Provider intenta responder por otro tenant:

```text
execution blocked
```

La protección primaria sigue siendo:

```text
RLS / database policy
```

---

## 217. TRUST BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TRUST BOUNDARY

Runtime recibe:

```text
Artifact verified
```

y:

```text
ExecutionContext trusted by Application
```

---

## 218. ARTIFACT VERIFICATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ARTIFACT VERIFICATION

Antes de crear Engine:

```text
verifyArtifact()
```

---

## 219. VERIFIED ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

VERIFIED ARTIFACT

No pasar bytes crudos al Engine.

Utilizar:

```text
VerifiedArtifact
```

---

## 220. VERIFIED TYPE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

VERIFIED TYPE

Conceptualmente:

```ts
type VerifiedArtifact = AELArtifact & {
  readonly verified: true
}
```

El mecanismo real puede ser nominal/opaque type.

---

## 221. ENGINE API

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ENGINE API

```ts
execute(
  artifact: VerifiedArtifact,
  context: ExecutionContext
): Promise<ExecutionResult>
```

---

## 222. ENGINE CONSTRUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ENGINE CONSTRUCTION

Engine debe recibir dependencies explícitas:

```text
contractProvider
functionProvider
clock
limits
```

---

## 223. NO GLOBAL PROVIDERS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

NO GLOBAL PROVIDERS

Evitar:

```text
globalContractProvider
globalFunctionProvider
```

---

## 224. TEST DOUBLE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TEST DOUBLE

Tests deben utilizar:

```text
FakeContractProvider
FakeFunctionProvider
FixedClock
```

---

## 225. CANONICAL EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CANONICAL EXECUTION

Artifact:

```text
LOAD_CONTRACT AREA
LOAD_CONTRACT RATE
MULTIPLY
RETURN
```

Context:

```text
AREA = 120.5 M2
RATE = 4500 COP/M2
```

Result:

```text
542250 COP
```

---

## 226. EXECUTION DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION DETERMINISM

Con:

```text
same Artifact
same Provider results
same Clock
same context
```

resultado debe ser:

```text
same
```

---

## 227. EXTERNAL DATA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXTERNAL DATA

Si Provider retorna distinto valor:

```text
execution result may differ
```

Eso no rompe determinismo del Runtime; depende del input externo.

---

## 228. REPRODUCIBLE EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

REPRODUCIBLE EXECUTION

Para auditoría se debe conservar:

```text
artifactHash
inputs/context snapshot
provider result snapshot
```

cuando la política de negocio lo requiera.

---

## 229. PROVIDER SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER SNAPSHOT

No guardar automáticamente todos los valores sensibles.

Definir qué se audita.

---

## 230. EXECUTION HISTORY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION HISTORY

Application layer persiste:

```text
execution metadata
status
artifactHash
duration
error
```

---

## 231. RUNTIME NO PERSISTE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RUNTIME NO PERSISTE

Runtime debe devolver:

```text
ExecutionResult
```

La persistencia pertenece a Application/Infrastructure.

---

## 232. RUNTIME NO LOGGING FRAMEWORK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RUNTIME NO LOGGING FRAMEWORK

Runtime puede recibir:

```text
Logger interface
```

pero no depender de una librería concreta.

---

## 233. LOGGER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LOGGER

Eventos mínimos:

```text
execution started
provider failure
execution completed
execution failed
```

---

## 234. SENSITIVE LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

SENSITIVE LOGGING

Valores de Contract deben estar sujetos a:

```text
redaction policy
```

---

## 235. ERROR MAPPING

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ERROR MAPPING

Runtime codes deben ser estables.

---

## 236. ERROR CATEGORIES

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ERROR CATEGORIES

```text
ARTIFACT
RUNTIME
TYPE
MATH
PROVIDER
FUNCTION
SECURITY
LIMIT
CANCELLATION
```

---

## 237. LIMIT ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LIMIT ERROR

```text
AEL-LIMIT-001
Execution instruction limit exceeded.
```

---

## 238. TIMEOUT ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TIMEOUT ERROR

```text
AEL-LIMIT-002
Execution time limit exceeded.
```

---

## 239. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER TIMEOUT

```text
AEL-PROVIDER-002
Provider call timed out.
```

---

## 240. CANCELLATION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CANCELLATION ERROR

```text
AEL-RUNTIME-009
Execution cancelled.
```

---

## 241. FUNCTION FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FUNCTION FAILURE

```text
AEL-FUNCTION-003
Function execution failed.
```

---

## 242. ERROR PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ERROR PROPAGATION

No ocultar:

```text
known AEL errors
```

Transformar sólo cuando sea necesario para boundary.

---

## 243. PROVIDER EXCEPTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER EXCEPTION

Convertir a:

```text
AEL-PROVIDER-001
```

con:

```text
cause
```

sólo en logs internos.

---

## 244. RETRYABLE FLAG

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RETRYABLE FLAG

RuntimeError puede tener:

```text
retryable
```

pero Worker decide si reintenta.

---

## 245. SECURITY FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

SECURITY FAILURE

Nunca marcar como retryable por defecto:

```text
capability denied
tenant mismatch
artifact tampered
```

---

## 246. RESOURCE FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RESOURCE FAILURE

Provider timeout puede ser:

```text
retryable
```

según provider policy.

---

## 247. ENGINE RESET

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ENGINE RESET

Cada execution debe tener estado aislado.

No reutilizar:

```text
operandStack
locals
instructionPointer
```

entre ejecuciones.

---

## 248. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CONCURRENCY

Múltiples executions pueden correr simultáneamente si:

```text
ExecutionContext
```

es independiente.

---

## 249. THREAD SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

THREAD SAFETY

No almacenar estado mutable de execution en:

```text
singleton Runtime
```

---

## 250. RUNTIME CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RUNTIME CACHE

Caches globales sólo pueden contener:

```text
immutable Artifact
registry metadata
```

no:

```text
execution locals
```

---

## 251. PROVIDER CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER CACHE

No implementar automáticamente.

Puede afectar:

```text
freshness
tenant isolation
determinism
```

---

## 252. RUNTIME BENCHMARKS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RUNTIME BENCHMARKS

Medir:

```text
instruction throughput
provider latency
artifact load
verification
```

---

## 253. MICRO BENCHMARK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

MICRO BENCHMARK

Ejecutar:

```text
100000
```

operaciones aritméticas controladas para medir overhead.

---

## 254. PROVIDER BENCHMARK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER BENCHMARK

Separar:

```text
engine cost
provider cost
```

---

## 255. PROFILING

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROFILING

Runtime debe poder perfilar:

```text
instruction execution
provider calls
function calls
```

sin alterar semántica.

---

## 256. NO OPTIMIZE PREMATURELY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

NO OPTIMIZE PREMATURELY

Primero:

```text
correctness
security
determinism
```

Después:

```text
performance
```

---

## 257. RUNTIME TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

RUNTIME TESTS

Mínimo:

```text
load literal
locals
contract
function
arithmetic
comparison
conditional
return
errors
limits
```

---

## 258. STACK TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

STACK TESTS

```text
underflow
overflow
wrong type
```

---

## 259. ARTIFACT TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ARTIFACT TESTS

Runtime debe rechazar:

```text
invalid hash
invalid opcode
invalid index
invalid jump
unsupported version
```

---

## 260. PROVIDER TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PROVIDER TESTS

```text
valid result
invalid result
timeout
failure
capability denied
tenant mismatch
```

---

## 261. FUNCTION TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FUNCTION TESTS

```text
valid arguments
invalid arguments
wrong return type
failure
timeout
```

---

## 262. DETERMINISM TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

DETERMINISM TESTS

Ejecutar múltiples veces:

```text
same inputs
same providers
same clock
```

y comparar resultados.

---

## 263. CANCELLATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CANCELLATION TEST

Abortar durante:

```text
long execution
provider call
```

y verificar:

```text
CANCELLED
```

---

## 264. LIMIT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

LIMIT TEST

Exceder:

```text
instructions
stack
provider calls
time
```

y verificar error correcto.

---

## 265. SECURITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

SECURITY TEST

Intentar:

```text
unauthorized capability
```

y verificar:

```text
execution blocked
```

---

## 266. NO CODE EXECUTION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

NO CODE EXECUTION TEST

Artifact manipulado con datos que parecen:

```text
JavaScript
```

no debe ejecutar nada.

---

## 267. TENANT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

TENANT TEST

Mismo Artifact:

```text
tenant A
tenant B
```

debe utilizar el contexto correspondiente y no cruzar datos.

---

## 268. EXECUTION ISOLATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXECUTION ISOLATION TEST

Ejecutar dos Rules simultáneamente y verificar que:

```text
locals A ≠ locals B
stack A ≠ stack B
```

---

## 269. ERROR SOURCE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

ERROR SOURCE TEST

Con debug map:

```text
runtime error
→ correct source span
```

---

## 270. EXIT CRITERIA — AEL-RUNTIME-MVP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

EXIT CRITERIA — AEL-RUNTIME-MVP

```text
✓ VerifiedArtifact accepted
✓ ExecutionContext implemented
✓ Stack engine implemented
✓ Locals implemented
✓ Instruction pointer implemented
✓ Opcode dispatch implemented
✓ ContractProvider integrated
✓ FunctionProvider integrated
✓ Capability checks implemented
✓ Instruction limits implemented
✓ Stack limits implemented
✓ Time limits implemented
✓ Cancellation implemented
✓ Runtime errors structured
✓ Source spans supported
✓ ExecutionResult implemented
✓ Determinism tests pass
✓ Security tests pass
✓ No dynamic code execution
✓ No database dependency
```

---

## 271. FINAL PIPELINE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

FINAL PIPELINE

```text
VERIFIED ARTIFACT
       │
       ▼
EXECUTION CONTEXT
       │
       ▼
┌─────────────────────┐
│    RUNTIME ENGINE   │
│                     │
│ IP                  │
│ Stack               │
│ Locals              │
│ Limits              │
└─────────┬───────────┘
          │
    ┌─────┴─────┐
    ▼           ▼
Contract     Function
Provider     Provider
    │           │
    └─────┬─────┘
          ▼
       AELValue
          │
          ▼
       RESULT
```

---

## 272. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PRINCIPIO DE SEGURIDAD

El Runtime debe tratar todo lo externo como:

```text
untrusted input
```

excepto las dependencias explícitamente verificadas.

---

## 273. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PRINCIPIO DE AISLAMIENTO

Cada ejecución debe tener:

```text
estado propio
contexto propio
límites propios
correlationId propio
```

---

## 274. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PRINCIPIO DE DETERMINISMO

El Runtime no introduce:

```text
randomness
hidden I/O
implicit state
```

---

## 275. PRINCIPIO DE RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

PRINCIPIO DE RESPONSABILIDAD

```text
Compiler → produce Artifact
Runtime → ejecuta Artifact
Provider → obtiene datos
Function → ejecuta operación autorizada
Application → autoriza y persiste
Worker → orquesta async/retries
```

---

## 276. CIERRE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Engine 28.md

CIERRE

Con este documento queda definida la primera versión completa del motor de ejecución AEL.

El flujo ahora es:

```text
Source
 ↓
Lexer
 ↓
Parser
 ↓
AST
 ↓
Analyzer
 ↓
Semantic IR
 ↓
Artifact
 ↓
Verification
 ↓
Runtime
 ↓
Providers / Functions
 ↓
AELValue
 ↓
Result
```

> **AEL ya tiene definido el ciclo completo desde el texto escrito por el usuario hasta su ejecución controlada.**

El siguiente bloque importante será integrar este Runtime con **AQUILA, PostgreSQL, RLS, Contracts y Functions reales**, sin contaminar el Core ni el Runtime con infraestructura.

---

# FIN DEL DOCUMENTO 28

## AEL V1 — Runtime Engine

## 277. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OBJETIVO

Definir:

```text
Evaluation
Instruction execution
Value materialization
Contract resolution
Function invocation
Operand evaluation
Stack model
ExecutionContext
Execution state
Ordering
Determinism
Caching
Errors
Cancellation
Timeouts
```

---

## 278. MODELO GENERAL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MODELO GENERAL

```text
Source
 ↓
AST
 ↓
Semantic Analysis
 ↓
IR
 ↓
Artifact
 ↓
Verifier
 ↓
Runtime
 ↓
Evaluation
 ↓
AELValue
```

---

## 279. EVALUATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EVALUATION

Evaluar una expresión significa:

```text
ejecutar las instrucciones verificadas
```

hasta producir:

```text
AELValue
```

o:

```text
AEL ExecutionError
```

---

## 280. EXECUTION STATE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION STATE

Conceptualmente:

```ts
interface ExecutionState {
  instructionPointer: number
  stack: AELValue[]
  locals: AELValue[]
  context: ExecutionContext
  steps: number
}
```

---

## 281. INSTRUCTION POINTER

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

INSTRUCTION POINTER

El Runtime mantiene:

```text
instructionPointer
```

que identifica la siguiente instruction.

---

## 282. STACK

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STACK

La evaluación V1 utiliza una:

```text
operand stack
```

para instrucciones temporales.

---

## 283. STACK DISCIPLINE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STACK DISCIPLINE

Cada instruction debe declarar:

```text
inputs
outputs
```

---

## 284. STACK EXAMPLE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STACK EXAMPLE

Expression:

```text
A + B
```

puede producir:

```text
LOAD A
LOAD B
ADD
```

---

## 285. LOAD CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

LOAD CONTRACT

Conceptualmente:

```text
LOAD_CONTRACT dependencyIndex
```

resuelve:

```text
Contract
```

y coloca su resultado en stack.

---

## 286. LOAD LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

LOAD LITERAL

```text
LOAD_LITERAL
```

materializa:

```text
AELValue
```

---

## 287. CALL FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CALL FUNCTION

```text
CALL_FUNCTION dependencyIndex argumentCount
```

consume:

```text
arguments
```

y produce:

```text
result
```

---

## 288. OPERATOR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OPERATOR

```text
ADD
SUBTRACT
MULTIPLY
DIVIDE
```

consume operandos y produce un valor.

---

## 289. EXECUTION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION ORDER

Por defecto:

```text
left → right
```

---

## 290. EXPRESSION ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXPRESSION ORDER

Para:

```text
A + B
```

evaluar:

```text
A
```

antes que:

```text
B
```

---

## 291. FUNCTION ARGUMENT ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FUNCTION ARGUMENT ORDER

Para:

```text
F(A, B, C)
```

evaluar:

```text
A
B
C
```

en ese orden.

---

## 292. NO REORDERING

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO REORDERING

Runtime V1 no debe reordenar:

```text
Contract loads
Function calls
Operators
```

por optimización.

---

## 293. CONDITIONAL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONDITIONAL

Para:

```text
SI C ENTONCES A SINO B
```

evaluar:

```text
C
```

después sólo:

```text
A
```

o:

```text
B
```

---

## 294. SHORT-CIRCUIT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

SHORT-CIRCUIT

Para:

```text
C AND X
```

si:

```text
C = FALSO
```

no evaluar:

```text
X
```

---

## 295. OR SHORT-CIRCUIT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OR SHORT-CIRCUIT

Para:

```text
C OR X
```

si:

```text
C = VERDADERO
```

no evaluar:

```text
X
```

---

## 296. CONTRACT MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTRACT MATERIALIZATION

Un Contract se materializa cuando la instruction correspondiente es alcanzada.

---

## 297. NO PRE-FETCH

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO PRE-FETCH

Runtime no debe precargar todos los Contracts del Artifact.

---

## 298. BENEFIT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

BENEFIT

Esto preserva:

```text
lazy evaluation
tenant security
performance
correctness
```

---

## 299. CONTRACT RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTRACT RESOLUTION

La instruction contiene una referencia estable:

```text
dependencyIndex
```

---

## 300. DEPENDENCY INDEX

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DEPENDENCY INDEX

Artifact puede mantener:

```text
contractDependencies[]
functionDependencies[]
```

---

## 301. CONTRACT DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTRACT DEPENDENCY

Conceptualmente:

```ts
interface ContractDependency {
  code: string
  version: string
  definitionHash?: string
}
```

---

## 302. FUNCTION DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FUNCTION DEPENDENCY

```ts
interface FunctionDependency {
  name: string
  version: string
  definitionHash?: string
}
```

---

## 303. PROVIDER RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PROVIDER RESOLUTION

Runtime resuelve:

```text
dependency
→ Registry
→ Provider
```

---

## 304. RESOLUTION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

RESOLUTION VALIDATION

Antes de ejecución, Runtime debe verificar:

```text
dependency exists
version compatible
provider available
capability available
```

---

## 305. STARTUP VS EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STARTUP VS EXECUTION

Las validaciones estructurales deben ocurrir:

```text
antes de ejecutar
```

para evitar fallas parciales.

---

## 306. PRE-EXECUTION VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRE-EXECUTION VALIDATION

Runtime puede realizar:

```text
Artifact verification
Dependency verification
Provider verification
```

antes de iniciar evaluación.

---

## 307. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION CONTEXT

Cada execution recibe:

```text
ExecutionContext
```

---

## 308. CONTEXT CONTENT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTEXT CONTENT

Conceptualmente:

```text
tenantId
actorId
requestId
correlationId
clock
locale
timezone
capabilities
input
```

---

## 309. TENANT ID

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TENANT ID

Debe provenir de:

```text
trusted application context
```

---

## 310. NO USER TENANT OVERRIDE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO USER TENANT OVERRIDE

Source AEL no puede cambiar:

```text
tenantId
```

---

## 311. ACTOR ID

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md; Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ACTOR ID

Identifica el actor autorizado cuando aplique.

---

## 312. REQUEST ID

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

REQUEST ID

Permite correlacionar:

```text
execution
logs
audit
```

---

## 313. CORRELATION ID

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CORRELATION ID

Debe propagarse a:

```text
Provider
Function Adapter
database observability
```

cuando corresponda.

---

## 314. CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CLOCK

Las Functions dependientes de tiempo deben utilizar:

```text
context.clock
```

---

## 315. NO SYSTEM CLOCK DIRECT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO SYSTEM CLOCK DIRECT

Una Function AEL no debe consultar directamente:

```text
new Date()
```

fuera del abstraction boundary.

---

## 316. TIMEZONE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TIMEZONE

Debe estar explícitamente en Context cuando sea relevante.

---

## 317. LOCALE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

LOCALE

Debe estar explícitamente definido cuando una Function dependa de locale.

---

## 318. CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CAPABILITIES

ExecutionContext contiene:

```text
effectiveCapabilities
```

---

## 319. CAPABILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CAPABILITY CHECK

Antes de Provider/Function protegido:

```text
requireCapability(...)
```

---

## 320. FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FAILURE

Sin capability:

```text
AEL-AUTH-001
```

---

## 321. TENANT CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TENANT CHECK

Provider debe ejecutar dentro del tenant:

```text
context.tenantId
```

---

## 322. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

RLS

PostgreSQL/Supabase debe reforzar:

```text
tenant isolation
```

---

## 323. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DEFENSE IN DEPTH

La seguridad se implementa:

```text
AEL capability
+
Application context
+
Provider
+
RLS
```

---

## 324. AELVALUE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

AELVALUE

Toda expresión evaluada produce un:

```text
AELValue
```

---

## 325. VALUE INVARIANT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

VALUE INVARIANT

Cada AELValue debe conformar al:

```text
declared AELType
```

---

## 326. NUMBER MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NUMBER MATERIALIZATION

Number debe materializarse como:

```text
exact decimal representation
```

según política del Type System.

---

## 327. MONEY MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MONEY MATERIALIZATION

Money:

```text
amount: Decimal
currency: CurrencyCode
```

---

## 328. QUANTITY MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

QUANTITY MATERIALIZATION

Quantity:

```text
amount: Decimal
dimension: DimensionCode
unit: UnitCode
```

---

## 329. STRING MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STRING MATERIALIZATION

String debe ser:

```text
Unicode
```

---

## 330. BOOLEAN MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

BOOLEAN MATERIALIZATION

Boolean sólo:

```text
VERDADERO
FALSO
```

---

## 331. NULL MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NULL MATERIALIZATION

Null es un valor explícito:

```text
NullValue
```

---

## 332. RECORD MATERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

RECORD MATERIALIZATION

Record debe conservar:

```text
schema identity
field values
```

---

## 333. NO UN_TYPED OBJECT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO UN_TYPED OBJECT

No usar:

```text
Record<string, any>
```

como sustituto del Type System.

---

## 334. OPERATOR EVALUATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OPERATOR EVALUATION

Runtime recibe:

```text
typed operands
```

---

## 335. OPERATOR VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OPERATOR VALIDATION

Runtime comprueba:

```text
operand types
```

cuando corresponda.

---

## 336. OPERATOR EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OPERATOR EXECUTION

Luego ejecuta:

```text
OperatorSemantics
```

---

## 337. FUNCTION EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FUNCTION EXECUTION

Runtime:

```text
resolve Function
check capability
validate args
invoke adapter
validate result
push result
```

---

## 338. CONTRACT EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTRACT EXECUTION

Runtime:

```text
resolve Contract
check capability
invoke provider
validate result
push result
```

---

## 339. RESULT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

RESULT VALIDATION

Provider result debe coincidir con:

```text
Contract return type
```

---

## 340. FUNCTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md; Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION RESULT

Function result debe coincidir con:

```text
declared return type
```

---

## 341. NO SILENT CAST

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO SILENT CAST

Runtime no debe convertir silenciosamente un resultado incompatible.

---

## 342. PROVIDER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PROVIDER ERROR

Mapear a:

```text
AEL-PROVIDER-xxx
```

según catálogo.

---

## 343. FUNCTION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FUNCTION ERROR

Mapear a:

```text
AEL-FUNCTION-xxx
```

---

## 344. TYPE ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TYPE ERROR

```text
AEL-TYPE-xxx
```

---

## 345. MATH ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MATH ERROR

```text
AEL-MATH-xxx
```

---

## 346. AUTH ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

AUTH ERROR

```text
AEL-AUTH-xxx
```

---

## 347. ERROR PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ERROR PROPAGATION

Los errores deben detener la ejecución salvo que exista una construcción explícita de manejo de errores.

---

## 348. NO IMPLICIT ERROR RECOVERY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO IMPLICIT ERROR RECOVERY

V1 no transforma errores en:

```text
NULO
0
FALSO
```

---

## 349. TRY/CATCH

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TRY/CATCH

V1 no requiere:

```text
TRY/CATCH
```

en AEL.

---

## 350. APPLICATION ERROR HANDLING

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

APPLICATION ERROR HANDLING

La aplicación que invoca AEL debe manejar:

```text
AEL ExecutionError
```

---

## 351. EXECUTION RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION RESULT

Conceptualmente:

```ts
type ExecutionResult =
  | {
      ok: true
      value: AELValue
    }
  | {
      ok: false
      error: AELExecutionError
    }
```

---

## 352. STEP COUNT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STEP COUNT

Runtime debe contabilizar:

```text
steps
```

---

## 353. MAX STEPS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MAX STEPS

ExecutionContext o RuntimePolicy debe definir:

```text
maxSteps
```

---

## 354. RESOURCE LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

RESOURCE LIMIT

Evita:

```text
pathological Artifact
```

---

## 355. MAX STACK DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MAX STACK DEPTH

Runtime debe imponer:

```text
maxStackDepth
```

---

## 356. MAX FUNCTION CALLS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MAX FUNCTION CALLS

Puede existir:

```text
maxFunctionCalls
```

---

## 357. MAX PROVIDER CALLS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

MAX PROVIDER CALLS

Puede existir:

```text
maxContractCalls
```

---

## 358. TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TIMEOUT

Runtime debe respetar:

```text
executionDeadline
```

---

## 359. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CANCELLATION

Debe poder cancelar:

```text
Execution
```

---

## 360. ABORT SIGNAL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ABORT SIGNAL

Implementación TypeScript puede utilizar:

```text
AbortSignal
```

o abstraction equivalente.

---

## 361. CANCELLATION PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CANCELLATION PROPAGATION

Debe llegar a:

```text
Providers
Function adapters
database calls
external operations
```

cuando sea soportado.

---

## 362. TIMEOUT ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TIMEOUT ERROR

```text
AEL-EXECUTION-001
```

---

## 363. CANCELLATION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CANCELLATION ERROR

```text
AEL-EXECUTION-002
```

---

## 364. STEP LIMIT ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STEP LIMIT ERROR

```text
AEL-EXECUTION-003
```

---

## 365. STACK ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STACK ERROR

```text
AEL-EXECUTION-004
```

---

## 366. ARTIFACT INVALID

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ARTIFACT INVALID

```text
AEL-ARTIFACT-001
```

---

## 367. PRE-EXECUTION FAILURE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRE-EXECUTION FAILURE

Si Artifact no pasa verification:

```text
no execution begins
```

---

## 368. ATOMICITY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ATOMICITY

Una evaluación AEL no debe asumir transacción global automáticamente.

---

## 369. DATABASE TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DATABASE TRANSACTION

Si una Function/Provider requiere transacción:

```text
Integration Layer
```

debe definirla explícitamente.

---

## 370. CROSS-PROVIDER TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CROSS-PROVIDER TRANSACTION

No asumir transacciones distribuidas entre:

```text
PostgreSQL
external service
```

---

## 371. SIDE EFFECT POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

SIDE EFFECT POLICY

V1 prioriza:

```text
read-only evaluation
```

---

## 372. WRITE OPERATIONS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

WRITE OPERATIONS

Si se permiten posteriormente:

```text
explicit capability
explicit transaction policy
explicit audit
```

---

## 373. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

IDEMPOTENCY

Write Functions deben definir:

```text
idempotency strategy
```

---

## 374. RETRIES

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md; Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RETRIES

Runtime no reintenta automáticamente una Function con side effects.

---

## 375. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CACHE

V1 permite caching sólo si:

```text
semantics preserved
```

---

## 376. CONTRACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTRACT CACHE

Un Contract read-only puede cachearse durante una ejecución si:

```text
same dependency
same context
same semantics
```

---

## 377. NO CROSS-TENANT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md; Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO CROSS-TENANT CACHE

Nunca compartir resultados entre tenants.

---

## 378. CONTEXT CACHE KEY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTEXT CACHE KEY

Debe incluir como mínimo:

```text
tenant identity
dependency
relevant inputs
```

---

## 379. FUNCTION CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FUNCTION CACHE

Pure Functions pueden optimizarse mediante memoization si:

```text
pure
deterministic
same inputs
same context dependencies
```

---

## 380. NO CACHE CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO CACHE CLOCK

Una Function dependiente del Clock no puede cachearse sin incluir:

```text
clock state
```

---

## 381. EXTERNAL DATA CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXTERNAL DATA CACHE

No cachear externals por defecto.

Debe declararse:

```text
cache policy
```

---

## 382. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OBSERVABILITY

Registrar métricas:

```text
execution_total
execution_duration
execution_error_total
execution_timeout_total
execution_cancelled_total
```

---

## 383. CONTRACT METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTRACT METRICS

```text
contract_call_total
contract_call_duration
contract_call_error_total
```

---

## 384. FUNCTION METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FUNCTION METRICS

```text
function_call_total
function_call_duration
function_call_error_total
```

---

## 385. NO SENSITIVE ARGUMENT LOGGING

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO SENSITIVE ARGUMENT LOGGING

No registrar valores sensibles por defecto.

---

## 386. REDACTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

REDACTION

Inputs y resultados pueden marcarse:

```text
sensitive
```

---

## 387. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

AUDIT

Para ejecuciones auditables registrar:

```text
artifactId
artifactVersion
tenantId
actorId
requestId
correlationId
startedAt
completedAt
status
```

según política de privacidad.

---

## 388. PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PROVENANCE

Execution debe poder relacionarse con:

```text
Artifact
Contract versions
Function versions
```

---

## 389. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

REPRODUCIBILITY

Para reproducir una ejecución se requiere:

```text
same Artifact
same inputs
same relevant context
same dependency versions
same external state
```

---

## 390. EXTERNAL NON-DETERMINISM

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXTERNAL NON-DETERMINISM

Si una Function consulta información externa:

```text
resultado puede cambiar
```

Debe declararse.

---

## 391. DETERMINISTIC MODE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DETERMINISTIC MODE

Para tests puede utilizarse:

```text
FixedClock
mock Providers
mock Function adapters
```

---

## 392. TEST EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TEST EXECUTION CONTEXT

Debe poder construirse:

```text
TestExecutionContext
```

---

## 393. GOLDEN EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

GOLDEN EXECUTION

Mantener:

```text
Artifact
inputs
context
expected value
```

---

## 394. EXECUTION PARITY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION PARITY

Mismo Artifact debe producir mismo resultado bajo:

```text
same deterministic context
```

---

## 395. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONCURRENCY

Cada ejecución debe tener:

```text
ExecutionState independiente
```

---

## 396. NO SHARED STACK

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO SHARED STACK

Nunca compartir:

```text
operand stack
locals
instruction pointer
```

entre ejecuciones.

---

## 397. SHARED REGISTRY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md; Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SHARED REGISTRY

Registries pueden compartirse si son:

```text
immutable
thread-safe
```

---

## 398. PROVIDER THREAD SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PROVIDER THREAD SAFETY

Provider adapters compartidos deben ser:

```text
thread-safe
```

o gestionarse como instancias aisladas.

---

## 399. CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md; Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONTEXT IMMUTABILITY

ExecutionContext debe ser:

```text
immutable
```

durante la ejecución.

---

## 400. CONTEXT DERIVATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CONTEXT DERIVATION

Si una capa necesita contexto adicional:

```text
derive child context
```

sin mutar el original.

---

## 401. SECURITY CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

SECURITY CONTEXT

Capabilities no deben poder ser ampliadas por:

```text
Function
Provider
AEL Source
```

---

## 402. CAPABILITY NARROWING

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CAPABILITY NARROWING

Una capa puede reducir capacidades para una operación interna.

---

## 403. CAPABILITY ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

CAPABILITY ESCALATION

Nunca:

```text
provider → add capability
```

---

## 404. TENANT ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TENANT ESCALATION

Nunca:

```text
provider → change tenantId
```

---

## 405. ACTOR ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ACTOR ESCALATION

Nunca:

```text
provider → impersonate actor
```

sin una operación administrativa explícita y auditada fuera del lenguaje.

---

## 406. EXECUTION TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION TRACE

Puede existir modo:

```text
debug/trace
```

para desarrollo.

---

## 407. TRACE CONTENT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

TRACE CONTENT

Puede mostrar:

```text
instruction
stack types
source span
dependency
```

pero no secretos.

---

## 408. PRODUCTION TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRODUCTION TRACE

Debe estar:

```text
controlled
rate-limited
redacted
```

---

## 409. DEBUGGER

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DEBUGGER

V1 no requiere debugger interactivo.

---

## 410. STEP-BY-STEP

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

STEP-BY-STEP

El Runtime puede soportar internamente:

```text
single step
```

para tests/debug.

---

## 411. EXECUTION STATE SNAPSHOT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION STATE SNAPSHOT

No es requisito V1.

---

## 412. RESUME

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

RESUME

No soportar reanudación de ejecución arbitraria en V1.

---

## 413. DETERMINISTIC INSTRUCTION POINTER

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DETERMINISTIC INSTRUCTION POINTER

Mismo Artifact y mismo input:

```text
same branch decisions
```

bajo contexto determinista.

---

## 414. ERROR SOURCE SPAN

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ERROR SOURCE SPAN

Cada error debe intentar conservar:

```text
sourceSpan
```

del elemento que lo causó.

---

## 415. ERROR CHAIN

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ERROR CHAIN

Un error de Provider puede conservar:

```text
cause
```

internamente sin exponer secretos.

---

## 416. SAFE MESSAGE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

SAFE MESSAGE

Usuario recibe:

```text
mensaje seguro
```

---

## 417. INTERNAL DETAIL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

INTERNAL DETAIL

Logs internos pueden contener:

```text
diagnostic details
```

según seguridad.

---

## 418. EXECUTION LOG

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION LOG

No registrar automáticamente cada instruction en producción.

---

## 419. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PERFORMANCE

El dispatch de instructions debe ser eficiente.

---

## 420. OPCODE DISPATCH

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

OPCODE DISPATCH

Puede utilizar:

```text
switch
jump table
handler registry
```

según implementación.

---

## 421. V1 RECOMMENDATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

V1 RECOMMENDATION

Priorizar:

```text
switch/optimized dispatch
```

por simplicidad y rendimiento.

---

## 422. NO DYNAMIC EVAL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO DYNAMIC EVAL

Runtime no debe usar:

```text
eval()
new Function()
```

para ejecutar AEL.

---

## 423. NO JAVASCRIPT SOURCE GENERATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

NO JAVASCRIPT SOURCE GENERATION

V1 debe ejecutar:

```text
Artifact instructions
```

no JavaScript generado dinámicamente.

---

## 424. SECURITY BENEFIT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

SECURITY BENEFIT

Esto reduce:

```text
code injection
sandbox escape
runtime ambiguity
```

---

## 425. EXECUTION ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION ISOLATION

Artifact no puede acceder directamente a:

```text
filesystem
network
process
database
```

---

## 426. ONLY THROUGH CAPABILITIES

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

ONLY THROUGH CAPABILITIES

Acceso externo sólo mediante:

```text
Contract Provider
Function Provider
```

autorizados.

---

## 427. EXIT CRITERIA — AEL-EXECUTION-SEMANTICS

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXIT CRITERIA — AEL-EXECUTION-SEMANTICS

```text
✓ ExecutionState
✓ Instruction pointer
✓ Operand stack
✓ Typed values
✓ Contract materialization
✓ Function invocation
✓ Operator execution
✓ Evaluation order
✓ Lazy branches
✓ Short-circuit
✓ ExecutionContext
✓ Tenant isolation
✓ Capability enforcement
✓ RLS integration
✓ Error propagation
✓ Timeout
✓ Cancellation
✓ Resource limits
✓ Deterministic mode
✓ Caching policy
✓ Observability
✓ Audit/provenance
✓ Concurrency isolation
✓ No dynamic eval
✓ No arbitrary code execution
✓ Execution tests
```

---

## 428. FINAL EXECUTION MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

FINAL EXECUTION MODEL

```text
                    Artifact
                       │
                       ▼
                   Verifier
                       │
                       ▼
               Execution Engine
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Contract      Function     Operator
       Provider      Provider      Engine
          │            │            │
          └────────────┼────────────┘
                       ▼
                    AELValue
                       │
                       ▼
                  Final Result
```

---

## 429. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

EXECUTION CONTEXT

```text
ExecutionContext
├── tenantId
├── actorId
├── requestId
├── correlationId
├── clock
├── timezone
├── locale
├── capabilities
└── input
```

---

## 430. SECURITY FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

SECURITY FLOW

```text
AEL Artifact
    ↓
Verifier
    ↓
ExecutionContext
    ↓
Capability Check
    ↓
Provider
    ↓
RLS
    ↓
Data
```

---

## 431. DETERMINISM FLOW

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

DETERMINISM FLOW

```text
Artifact
+
Inputs
+
ExecutionContext
+
Pinned Dependencies
        ↓
   Deterministic Evaluation
        ↓
     AELValue
```

---

## 432. PRINCIPIO DE MATERIALIZACIÓN

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRINCIPIO DE MATERIALIZACIÓN

Un valor no se obtiene antes de necesitarlo.

```text
Instruction reached
      ↓
Resolve dependency
      ↓
Check authorization
      ↓
Provider
      ↓
Validate AELValue
      ↓
Stack
```

---

## 433. PRINCIPIO DE ORDEN

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRINCIPIO DE ORDEN

El orden de evaluación es parte de la semántica.

No es una sugerencia para el Runtime.

---

## 434. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRINCIPIO DE AISLAMIENTO

Cada ejecución posee su propio:

```text
stack
locals
instruction pointer
context
counters
```

---

## 435. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Execution_Semantics_Evaluation_Model 35.md

PRINCIPIO DE SEGURIDAD

AEL nunca ejecuta:

```text
código arbitrario
```

Sólo:

```text
Artifact verificado
```

---

## 436. OBJETIVO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OBJETIVO

Definir:

```text
Runtime
ExecutionEngine
Instruction Dispatch
Operand Stack
ExecutionContext
Provider Invocation
Function Invocation
Resource Limits
Cancellation
Timeouts
Errors
Isolation
Observability
Lifecycle
```

---

## 437. RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RESPONSABILIDAD

Runtime debe:

```text
recibir VerifiedArtifact
crear ExecutionState
ejecutar instrucciones
resolver dependencies
aplicar capabilities
materializar valores
producir resultado
```

---

## 438. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO RESPONSABILIDAD

Runtime no debe:

```text
parsear Source
compilar Source
corregir Artifact
inventar tipos
conceder permisos
acceder directamente a PostgreSQL
ejecutar JavaScript arbitrario
```

---

## 439. INPUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

INPUT

Runtime recibe:

```text
VerifiedArtifact
ExecutionContext
RuntimePolicy
```

---

## 440. OUTPUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OUTPUT

```ts
type ExecutionResult =
  | {
      ok: true
      value: AELValue
    }
  | {
      ok: false
      error: AELExecutionError
    }
```

---

## 441. EXECUTION ENGINE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION ENGINE

Componente central:

```text
ExecutionEngine
```

---

## 442. EXECUTION STATE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION STATE

Conceptualmente:

```ts
interface ExecutionState {
  instructionPointer: number
  stack: AELValue[]
  locals: AELValue[]
  steps: number
  functionCalls: number
  contractCalls: number
  startedAt: number
}
```

---

## 443. EXECUTION STATE ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION STATE ISOLATION

Cada ejecución posee su propio:

```text
instructionPointer
stack
locals
counters
```

---

## 444. NO SHARED EXECUTION STATE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO SHARED EXECUTION STATE

Nunca compartir estado mutable entre ejecuciones concurrentes.

---

## 445. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION CONTEXT

```ts
interface ExecutionContext {
  tenantId: string
  actorId?: string
  requestId: string
  correlationId?: string
  clock: Clock
  timezone?: string
  locale?: string
  capabilities: ReadonlySet<string>
  input: Readonly<Record<string, AELValue>>
  signal?: AbortSignal
}
```

---

## 446. CONTEXT DERIVATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONTEXT DERIVATION

Una capa interna puede crear:

```text
derived context
```

sin mutar el contexto original.

---

## 447. TENANT ID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TENANT ID

`tenantId` debe provenir del contexto confiable de la aplicación.

---

## 448. TENANT IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TENANT IMMUTABILITY

Artifact no puede modificar:

```text
tenantId
```

---

## 449. REQUEST ID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

REQUEST ID

Debe mantenerse para trazabilidad.

---

## 450. CORRELATION ID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CORRELATION ID

Se propaga a integraciones externas cuando corresponda.

---

## 451. CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CLOCK

Toda semántica temporal debe depender de:

```text
context.clock
```

---

## 452. NO SYSTEM CLOCK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO SYSTEM CLOCK

Runtime no debe permitir que una Function acceda directamente al reloj del sistema ignorando el contexto.

---

## 453. ABORT SIGNAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ABORT SIGNAL

Cancellation debe propagarse mediante:

```text
AbortSignal
```

o abstraction equivalente.

---

## 454. RUNTIME POLICY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RUNTIME POLICY

Conceptualmente:

```ts
interface RuntimePolicy {
  maxSteps: number
  maxStackDepth: number
  maxFunctionCalls: number
  maxContractCalls: number
  maxExecutionTimeMs: number
  maxArtifactSize: number
}
```

---

## 455. POLICY IMMUTABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

POLICY IMMUTABILITY

Policy debe quedar fijada al iniciar la ejecución.

---

## 456. PRE-EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRE-EXECUTION

Antes del loop principal:

```text
verify artifact
validate context
initialize counters
resolve execution dependencies
```

---

## 457. NO EXECUTION IF INVALID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO EXECUTION IF INVALID

Si falla una precondición:

```text
no instruction executes
```

---

## 458. DEPENDENCY RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DEPENDENCY RESOLUTION

Runtime utiliza:

```text
DependencyResolver
```

---

## 459. CONTRACT RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONTRACT RESOLUTION

```text
ContractDependency
→ ContractRegistry
→ Provider
```

---

## 460. FUNCTION RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION RESOLUTION

```text
FunctionDependency
→ FunctionRegistry
→ Adapter
```

---

## 461. RESOLUTION BEFORE EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RESOLUTION BEFORE EXECUTION

La disponibilidad de dependencies críticas puede verificarse antes de ejecutar la primera instruction.

---

## 462. LAZY DATA ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

LAZY DATA ACCESS

Resolver Provider no significa necesariamente:

```text
fetch data
```

La consulta de datos sólo ocurre cuando:

```text
LOAD_CONTRACT
```

es ejecutado.

---

## 463. PROVIDER INVOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER INVOCATION

Conceptualmente:

```ts
provider.read(contract, context)
```

---

## 464. PROVIDER BOUNDARY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER BOUNDARY

Provider es la única capa autorizada para realizar:

```text
database access
external API access
storage access
```

según capability.

---

## 465. DIRECT DATABASE ACCESS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DIRECT DATABASE ACCESS

Runtime no debe contener:

```text
SQL
Supabase client calls
database queries
```

de negocio.

---

## 466. POSTGRESQL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

POSTGRESQL

El acceso a PostgreSQL debe ocurrir mediante:

```text
Contract Provider
```

que respete:

```text
tenant context
RLS
security policy
```

---

## 467. RLS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RLS

AEL no reemplaza PostgreSQL RLS.

---

## 468. DEFENSE IN DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DEFENSE IN DEPTH

```text
ExecutionContext
+
Provider
+
PostgreSQL RLS
```

---

## 469. CAPABILITY CHECK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CAPABILITY CHECK

Antes de ejecutar una dependency protegida:

```text
requireCapability(...)
```

---

## 470. CAPABILITY SOURCE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CAPABILITY SOURCE

Capabilities vienen de:

```text
ExecutionContext
```

y no del Source.

---

## 471. NO CAPABILITY ESCALATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO CAPABILITY ESCALATION

Function/Provider no puede añadir capabilities.

---

## 472. PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER RESULT

Provider devuelve:

```text
AELValue
```

o un resultado transformable a AELValue mediante adapter controlado.

---

## 473. RESULT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RESULT VALIDATION

Runtime valida:

```text
result type
```

contra el Contract declarado.

---

## 474. INVALID PROVIDER RESULT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

INVALID PROVIDER RESULT

Produce:

```text
AEL-PROVIDER-002
```

---

## 475. FUNCTION INVOCATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION INVOCATION

Runtime:

```text
resolve
→ capability check
→ validate arguments
→ invoke
→ validate result
→ push
```

---

## 476. FUNCTION ARGUMENTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION ARGUMENTS

Arguments se extraen del stack en orden definido por Compiler.

---

## 477. FUNCTION ARGUMENT ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION ARGUMENT ORDER

Source:

```text
F(A, B, C)
```

debe preservar:

```text
A → B → C
```

---

## 478. FUNCTION ADAPTER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION ADAPTER

El Runtime no ejecuta directamente una implementación arbitraria.

Utiliza:

```text
trusted FunctionAdapter
```

---

## 479. FUNCTION SIDE EFFECTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION SIDE EFFECTS

Function Registry debe declarar:

```text
purity/effect classification
```

cuando aplique.

---

## 480. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

IDEMPOTENCY

Las operaciones mutables deben definir idempotency fuera del lenguaje.

---

## 481. INSTRUCTION LOOP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

INSTRUCTION LOOP

Conceptualmente:

```text
while not finished:
    check limits
    fetch instruction
    dispatch
    advance instruction pointer
```

---

## 482. DISPATCH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DISPATCH

V1 recomienda:

```text
switch(opcode)
```

u otra forma equivalente de dispatch eficiente y explícita.

---

## 483. NO DYNAMIC EVAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO DYNAMIC EVAL

No utilizar:

```text
eval()
new Function()
```

---

## 484. NO SOURCE INTERPRETATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO SOURCE INTERPRETATION

Runtime nunca procesa:

```text
AEL Source
```

como lenguaje.

---

## 485. LOAD_LITERAL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

LOAD_LITERAL

```text
constantPool[index]
→ stack
```

---

## 486. LOAD_CONTRACT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

LOAD_CONTRACT

```text
resolve dependency
→ capability
→ provider
→ validate result
→ stack
```

---

## 487. CALL_FUNCTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CALL_FUNCTION

```text
pop arguments
→ adapter
→ validate result
→ push result
```

---

## 488. BINARY OPERATOR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

BINARY OPERATOR

```text
pop right
pop left
→ OperatorSemantics
→ push result
```

---

## 489. OPERAND ORDER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OPERAND ORDER

Aunque el stack extraiga:

```text
right
left
```

la operación debe preservar:

```text
left operator right
```

---

## 490. DIVISION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DIVISION

Antes de ejecutar:

```text
check divisor
```

y aplicar política decimal.

---

## 491. OVERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OVERFLOW

Detectar según:

```text
DecimalPolicy
```

---

## 492. UNARY OPERATOR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

UNARY OPERATOR

```text
pop value
→ semantics
→ push result
```

---

## 493. JUMP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

JUMP

```text
instructionPointer = target
```

---

## 494. JUMP_IF_FALSE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

JUMP_IF_FALSE

```text
condition = pop()
if condition == FALSO:
    instructionPointer = target
else:
    instructionPointer++
```

---

## 495. JUMP_IF_TRUE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

JUMP_IF_TRUE

```text
condition = pop()
if condition == VERDADERO:
    instructionPointer = target
else:
    instructionPointer++
```

---

## 496. RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RETURN

```text
value = pop()
validate return type
finish execution
```

---

## 497. NO FALLTHROUGH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO FALLTHROUGH

Llegar al final del instruction stream sin RETURN:

```text
runtime error
```

aunque Verifier debería haberlo impedido.

---

## 498. DEFENSIVE RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DEFENSIVE RUNTIME

Runtime mantiene validaciones críticas aunque Artifact ya esté verificado.

---

## 499. STACK UNDERFLOW

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

STACK UNDERFLOW

Nunca ejecutar una pop inválida.

---

## 500. STACK DEPTH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

STACK DEPTH

No superar:

```text
maxStackDepth
```

---

## 501. STEP COUNT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

STEP COUNT

Cada instruction ejecutada incrementa:

```text
steps
```

---

## 502. STEP LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

STEP LIMIT

Si:

```text
steps > maxSteps
```

terminar con:

```text
AEL-EXECUTION-003
```

---

## 503. TIME LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TIME LIMIT

Comprobar:

```text
deadline
```

durante execution.

---

## 504. TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TIMEOUT

Produce:

```text
AEL-EXECUTION-001
```

---

## 505. CANCELLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CANCELLATION

Si:

```text
signal.aborted
```

terminar:

```text
AEL-EXECUTION-002
```

---

## 506. CHECK FREQUENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CHECK FREQUENCY

Cancellation/timeout debe comprobarse:

```text
antes de cada instruction
```

y antes/después de operaciones externas cuando sea necesario.

---

## 507. EXTERNAL CALL TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXTERNAL CALL TIMEOUT

Provider/Function adapters deben recibir:

```text
deadline
signal
```

cuando lo soporten.

---

## 508. NESTED TIMEOUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NESTED TIMEOUT

Un Provider no puede extender:

```text
execution deadline
```

---

## 509. RESOURCE LIMITS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RESOURCE LIMITS

Además de steps:

```text
stack
functionCalls
contractCalls
artifactSize
```

---

## 510. FUNCTION CALL LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION CALL LIMIT

Si excede:

```text
maxFunctionCalls
```

terminar.

---

## 511. CONTRACT CALL LIMIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONTRACT CALL LIMIT

Si excede:

```text
maxContractCalls
```

terminar.

---

## 512. MEMORY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

MEMORY

Runtime debe evitar crecimiento ilimitado de:

```text
stack
locals
temporary values
```

---

## 513. VALUE SIZE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

VALUE SIZE

AELValue puede tener límites:

```text
maxStringLength
maxRecordFields
maxListElements
```

si esos tipos están habilitados.

---

## 514. RECORD VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RECORD VALIDATION

Record debe cumplir:

```text
schema
field types
size limits
```

---

## 515. LIST VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

LIST VALIDATION

Si List está soportado:

```text
element type
element count
```

deben validarse.

---

## 516. ERROR MODEL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ERROR MODEL

Todos los errores Runtime deben ser estructurados.

---

## 517. ERROR STRUCTURE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ERROR STRUCTURE

```ts
interface AELExecutionError {
  code: string
  message: string
  instruction?: number
  sourceSpan?: SourceSpan
  cause?: unknown
}
```

---

## 518. SAFE MESSAGE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SAFE MESSAGE

Mensaje externo no debe revelar:

```text
credentials
SQL
internal stack
tokens
```

---

## 519. INTERNAL CAUSE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

INTERNAL CAUSE

Logs internos pueden conservar:

```text
cause
```

según policy.

---

## 520. ERROR PROPAGATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ERROR PROPAGATION

Un error termina la ejecución V1.

---

## 521. NO IMPLICIT NULL

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO IMPLICIT NULL

No convertir error a:

```text
NULO
0
FALSO
```

---

## 522. NO RETRY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO RETRY

Runtime no reintenta automáticamente una execution completa.

---

## 523. OBSERVABILITY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OBSERVABILITY

Registrar:

```text
execution_start
execution_success
execution_error
execution_timeout
execution_cancelled
```

---

## 524. METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

METRICS

```text
ael_execution_total
ael_execution_duration
ael_execution_error_total
ael_execution_steps
ael_contract_calls
ael_function_calls
```

---

## 525. ARTIFACT METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ARTIFACT METRICS

Registrar:

```text
artifactId
artifactHash
instructionCount
```

sin registrar Source completo.

---

## 526. TENANT METRICS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TENANT METRICS

Metrics multi-tenant deben aplicar:

```text
privacy
aggregation
access controls
```

---

## 527. TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TRACE

Debug mode puede registrar:

```text
instruction
stack type summary
source span
```

---

## 528. NO SECRET TRACE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO SECRET TRACE

No registrar automáticamente:

```text
full sensitive values
```

---

## 529. REDACTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

REDACTION

Values pueden marcarse:

```text
sensitive
```

---

## 530. AUDIT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

AUDIT

Execution audit puede incluir:

```text
artifactId
artifactVersion
tenantId
actorId
requestId
correlationId
status
timestamps
```

---

## 531. PROVENANCE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVENANCE

Execution debe poder rastrearse hacia:

```text
Rule
Artifact
Contracts
Functions
Compiler
```

---

## 532. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION ID

Cada execution puede tener:

```text
executionId
```

para correlación.

---

## 533. EXECUTION ID

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION ID

Debe ser único dentro del sistema de observabilidad.

---

## 534. DETERMINISTIC TEST MODE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DETERMINISTIC TEST MODE

Runtime debe permitir:

```text
FixedClock
mock ContractProviders
mock FunctionAdapters
```

---

## 535. TEST CONTEXT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TEST CONTEXT

```ts
TestExecutionContext
```

permite reproducir escenarios.

---

## 536. PURE EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PURE EXECUTION

Si todas las dependencies son:

```text
pure + deterministic
```

la execution puede ser reproducible.

---

## 537. EXTERNAL DATA

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXTERNAL DATA

Contract reads pueden depender del estado externo actual.

---

## 538. REPRODUCTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

REPRODUCTION

Para reproducir exactamente una ejecución externa se requiere:

```text
same external state
```

o:

```text
recorded provider fixture
```

---

## 539. CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONCURRENCY

ExecutionEngine puede procesar ejecuciones concurrentes.

---

## 540. SHARED IMMUTABLE ARTIFACT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SHARED IMMUTABLE ARTIFACT

VerifiedArtifact puede compartirse entre ejecuciones si es:

```text
immutable
```

---

## 541. NO SHARED MUTABLE LOCALS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO SHARED MUTABLE LOCALS

Locals son exclusivos de cada execution.

---

## 542. NO SHARED STACK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO SHARED STACK

Stack exclusivo.

---

## 543. PROVIDER CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER CONCURRENCY

Provider debe ser:

```text
thread-safe
```

o utilizar instancia aislada.

---

## 544. CONTEXT CONCURRENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONTEXT CONCURRENCY

ExecutionContext no se modifica durante execution.

---

## 545. CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CACHE

Runtime puede utilizar caches controlados.

---

## 546. CONTRACT CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONTRACT CACHE

Sólo si:

```text
semantics preserved
tenant-safe
context-safe
```

---

## 547. CACHE KEY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CACHE KEY

Debe incluir:

```text
tenantId
dependency identity
relevant context
inputs
```

---

## 548. FUNCTION CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION CACHE

Sólo para Functions declaradas:

```text
pure
deterministic
```

---

## 549. CLOCK DEPENDENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CLOCK DEPENDENCY

Una Function que depende de:

```text
clock
```

debe incluirlo en semantics antes de cachear.

---

## 550. EXTERNAL CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXTERNAL CACHE

No cachear por defecto.

---

## 551. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CACHE INVALIDATION

Cambio de dependency version debe invalidar:

```text
relevant cache
```

---

## 552. PROVIDER TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER TRANSACTION

Runtime no inicia transacción global automáticamente.

---

## 553. TRANSACTION OWNER

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TRANSACTION OWNER

Transaction policy pertenece a:

```text
Provider / Application Integration Layer
```

---

## 554. CROSS-SERVICE TRANSACTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CROSS-SERVICE TRANSACTION

No asumir:

```text
distributed transaction
```

---

## 555. SIDE EFFECT SAFETY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SIDE EFFECT SAFETY

Write operations requieren:

```text
explicit capability
explicit policy
audit
```

---

## 556. IDEMPOTENCY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

IDEMPOTENCY

Para operaciones write:

```text
idempotency key
```

debe gestionarse fuera de la semántica básica del Artifact.

---

## 557. PROVIDER ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER ERROR

Provider debe mapear errores a:

```text
AEL-PROVIDER-xxx
```

---

## 558. FUNCTION ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FUNCTION ERROR

Function adapter:

```text
AEL-FUNCTION-xxx
```

---

## 559. AUTH ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

AUTH ERROR

Capability failure:

```text
AEL-AUTH-001
```

---

## 560. ARTIFACT ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ARTIFACT ERROR

Structural invariant failure:

```text
AEL-ARTIFACT-xxx
```

---

## 561. RUNTIME INTERNAL ERROR

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RUNTIME INTERNAL ERROR

Unexpected invariant failure:

```text
AEL-RUNTIME-001
```

Debe generar alerta interna.

---

## 562. FAIL CLOSED

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FAIL CLOSED

Ante una violación de seguridad:

```text
stop execution
```

---

## 563. NO PARTIAL SUCCESS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO PARTIAL SUCCESS

Una execution fallida no devuelve resultado parcial como éxito.

---

## 564. OUTPUT VALIDATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OUTPUT VALIDATION

Antes de devolver:

```text
final AELValue
```

validar:

```text
declared return type
value invariants
```

---

## 565. OUTPUT SERIALIZATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OUTPUT SERIALIZATION

La capa externa puede convertir AELValue a:

```text
JSON
DTO
API response
```

pero Runtime conserva semántica tipada.

---

## 566. NO RAW OBJECT RETURN

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO RAW OBJECT RETURN

Runtime no debe devolver objetos JavaScript arbitrarios como resultado semántico.

---

## 567. SECURITY ISOLATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SECURITY ISOLATION

AEL no accede directamente a:

```text
process
filesystem
network
environment variables
database clients
```

---

## 568. ONLY CONTROLLED ADAPTERS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

ONLY CONTROLLED ADAPTERS

External access:

```text
Provider
Function Adapter
```

---

## 569. SANDBOX PRINCIPLE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SANDBOX PRINCIPLE

Runtime actúa como:

```text
restricted execution engine
```

---

## 570. NO USER CODE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO USER CODE

Users provide:

```text
declarative AEL
```

not executable JavaScript/TypeScript.

---

## 571. EXECUTION LIFECYCLE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION LIFECYCLE

```text
Created
 ↓
Preflight
 ↓
Running
 ↓
Completed
```

or:

```text
Running
 ↓
Failed
```

or:

```text
Running
 ↓
Cancelled
```

or:

```text
Running
 ↓
TimedOut
```

---

## 572. EXECUTION STATUS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXECUTION STATUS

Conceptualmente:

```ts
type ExecutionStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT'
```

---

## 573. PRE-FLIGHT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRE-FLIGHT

Incluye:

```text
Artifact verification
Context validation
Dependency resolution
```

---

## 574. RUNNING

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RUNNING

Instruction loop activo.

---

## 575. COMPLETED

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

COMPLETED

Se obtuvo:

```text
valid final AELValue
```

---

## 576. FAILED

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FAILED

Error no recuperable.

---

## 577. CANCELLED

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CANCELLED

AbortSignal solicitado.

---

## 578. TIMED_OUT

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TIMED_OUT

Deadline excedido.

---

## 579. CLEANUP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CLEANUP

Al finalizar:

```text
release temporary resources
finalize metrics
finalize tracing
```

---

## 580. NO STATE LEAK

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

NO STATE LEAK

Execution state no debe sobrevivir accidentalmente a otra execution.

---

## 581. PROVIDER CLEANUP

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PROVIDER CLEANUP

Adapters deben poder liberar recursos.

---

## 582. CORRELATION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CORRELATION

Toda operación externa debe conservar:

```text
requestId
correlationId
executionId
```

cuando corresponda.

---

## 583. PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PERFORMANCE

Runtime debe minimizar:

```text
allocation
reflection
dynamic lookup
```

en hot path.

---

## 584. DEPENDENCY PRE-RESOLUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DEPENDENCY PRE-RESOLUTION

Resolver referencias por índice reduce:

```text
string lookup
```

durante ejecución.

---

## 585. OPCODE DISPATCH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OPCODE DISPATCH

V1:

```text
switch(opcode)
```

o dispatch equivalente.

---

## 586. HOT PATH

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

HOT PATH

Operadores puros deben evitar:

```text
unnecessary provider calls
unnecessary allocations
```

---

## 587. DECIMAL PERFORMANCE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DECIMAL PERFORMANCE

Decimal arithmetic debe ser consistente con precisión financiera, priorizando correctness sobre micro-optimización.

---

## 588. RUNTIME CACHE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RUNTIME CACHE

Cache de VerifiedArtifact puede reducir:

```text
verification overhead
```

---

## 589. CACHE KEY

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CACHE KEY

```text
artifactHash
+
runtimeSemanticsVersion
```

---

## 590. TEST MATRIX

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TEST MATRIX

Mínimo:

```text
literal execution
contract execution
function execution
operator execution
conditional execution
short-circuit
return
invalid state defense
timeout
cancellation
step limit
stack limit
provider error
function error
capability denial
tenant isolation
concurrency
cache
deterministic mode
```

---

## 591. GOLDEN EXECUTION

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

GOLDEN EXECUTION

Fixtures:

```text
Artifact
ExecutionContext
Expected AELValue
```

---

## 592. SECURITY TESTS

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

SECURITY TESTS

Intentar:

```text
invalid artifact
invalid opcode
invalid stack
invalid jump
capability escalation
tenant override
provider bypass
dynamic eval
```

---

## 593. CONCURRENCY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CONCURRENCY TEST

Ejecutar el mismo Artifact simultáneamente en:

```text
multiple tenants
multiple requests
```

y verificar aislamiento.

---

## 594. DETERMINISM TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

DETERMINISM TEST

Mismo:

```text
Artifact
Input
FixedClock
Mock Providers
```

debe producir:

```text
same result
```

---

## 595. CANCELLATION TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

CANCELLATION TEST

Provider lento + AbortSignal:

```text
execution stops
```

---

## 596. TIMEOUT TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

TIMEOUT TEST

Execution que supera deadline:

```text
TIMED_OUT
```

---

## 597. RESOURCE TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

RESOURCE TEST

Artifact que excede:

```text
maxSteps
```

debe detenerse.

---

## 598. OBSERVABILITY TEST

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

OBSERVABILITY TEST

Cada execution produce métricas consistentes.

---

## 599. EXIT CRITERIA — AEL-RUNTIME

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

EXIT CRITERIA — AEL-RUNTIME

```text
✓ ExecutionEngine
✓ ExecutionState
✓ ExecutionContext
✓ Instruction dispatch
✓ Operand stack
✓ Contract invocation
✓ Function invocation
✓ Operator execution
✓ Lazy evaluation
✓ Capability enforcement
✓ Tenant isolation
✓ PostgreSQL/RLS boundary
✓ Resource limits
✓ Timeout
✓ Cancellation
✓ Error model
✓ Observability
✓ Audit/provenance
✓ Concurrency isolation
✓ Cache policy
✓ No dynamic execution
✓ Lifecycle
✓ Deterministic test mode
✓ Runtime security tests
```

---

## 600. FINAL RUNTIME ARCHITECTURE

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

FINAL RUNTIME ARCHITECTURE

```text
                    VerifiedArtifact
                           │
                           ▼
                    ExecutionEngine
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              ExecutionState  ExecutionContext
                    │             │
                    └──────┬──────┘
                           ▼
                    Instruction Loop
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
       Contract         Function         Operator
       Provider         Adapter           Engine
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                        AELValue
                           │
                           ▼
                         Result
```

---

## 601. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRINCIPIO DE AISLAMIENTO

Cada ejecución:

```text
own state
own stack
own counters
own context
```

---

## 602. PRINCIPIO DE AUTORIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRINCIPIO DE AUTORIDAD

Runtime ejecuta:

```text
Artifact permissions
∩
ExecutionContext capabilities
```

Nunca:

```text
Artifact permissions
+
arbitrary authority
```

---

## 603. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRINCIPIO DE SEGURIDAD

Toda operación externa pasa por:

```text
controlled adapter
```

---

## 604. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRINCIPIO DE DETERMINISMO

Bajo contexto determinista:

```text
same Artifact
+
same input
+
same dependencies
=
same result
```

---

## 605. PRINCIPIO DE FALL-CLOSED

> **Origen:** Motor de liquidacion_AEL_V1_Runtime_Architecture 39.md

PRINCIPIO DE FALL-CLOSED

Ante:

```text
invalid state
security violation
resource exhaustion
```

Runtime termina la ejecución.

---

## 606. REFERENCIAS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

REFERENCIAS

Implementa y consume:

```text
Documento 42 — Security Model & Threat Model
Documento 45 — Registry & Dependency Management
Documento 46 — Versioning & Compatibility
Documento 49 — Performance & Scalability
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 60 — Verifier & Static Safety Validation
Documento 61 — Artifact Format, Serialization & Integrity
```

---

## 607. OBJETIVO

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

OBJETIVO

Ejecutar exclusivamente:

```text
Verified Artifact
```

dentro de un:

```text
Execution Context
```

produciendo:

```text
Execution Result
```

---

## 608. PIPELINE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PIPELINE

```text
Artifact
 ↓
Artifact Validation
 ↓
Compatibility Check
 ↓
Execution Context
 ↓
Runtime
 ↓
Execution Result
```

---

## 609. TRUST BOUNDARY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TRUST BOUNDARY

Runtime debe rechazar:

```text
unverified artifact
invalid artifact
incompatible artifact
revoked artifact
```

---

## 610. PACKAGE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PACKAGE

```text
packages/ael-runtime/
```

---

## 611. NO RESPONSABILIDAD

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NO RESPONSABILIDAD

Runtime no debe:

```text
compilar source
modificar IR
resolver tipos nuevamente
consultar directamente PostgreSQL
usar secretos arbitrarios
bypassear capabilities
```

---

## 612. EXECUTION ENGINE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION ENGINE

API conceptual:

```ts
interface ExecutionEngine {
  execute(artifact: VerifiedArtifact, context: ExecutionContext): ExecutionResult
}
```

---

## 613. EXECUTION CONTEXT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION CONTEXT

Debe contener únicamente recursos explícitamente permitidos:

```text
inputs
tenant context
clock
capabilities
limits
execution metadata
```

---

## 614. INPUTS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

INPUTS

Los inputs deben validarse contra la firma del programa/Function antes de ejecución.

---

## 615. TENANT CONTEXT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TENANT CONTEXT

Cuando una capability lo requiera:

```text
tenantId
```

debe existir en el contexto autorizado.

Runtime no debe inferir tenant desde datos arbitrarios.

---

## 616. CLOCK

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CLOCK

El tiempo debe obtenerse mediante una abstracción:

```text
Clock
```

No utilizar directamente el reloj global desde lógica de ejecución.

---

## 617. DETERMINISTIC CLOCK

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DETERMINISTIC CLOCK

Para pruebas:

```text
FixedClock
```

debe permitir ejecuciones reproducibles.

---

## 618. RANDOMNESS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

RANDOMNESS

No disponible por defecto.

Si se incorpora posteriormente:

```text
Random capability
```

debe ser explícita.

---

## 619. CAPABILITY BROKER

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CAPABILITY BROKER

Las capabilities deben resolverse mediante:

```text
CapabilityBroker
```

---

## 620. CAPABILITY PRINCIPLE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CAPABILITY PRINCIPLE

AEL no obtiene acceso a infraestructura por conocer nombres de servicios.

Debe existir:

```text
declared capability
+
authorized capability
+
runtime implementation
```

---

## 621. EXTERNAL CALL

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXTERNAL CALL

Flujo:

```text
IR Call
 ↓
CapabilityBroker
 ↓
Authorized Capability
 ↓
Provider Adapter
 ↓
Result
```

---

## 622. DATABASE ACCESS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DATABASE ACCESS

Runtime no debe exponer:

```text
raw database connection
```

a AEL.

---

## 623. DATABASE CAPABILITY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DATABASE CAPABILITY

Si una liquidación necesita datos persistidos:

```text
data.read
```

o capability equivalente debe proporcionar una interfaz controlada.

---

## 624. NETWORK ACCESS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NETWORK ACCESS

HTTP/network no debe existir como primitive general.

Debe requerir capability explícita.

---

## 625. PROVIDER ISOLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER ISOLATION

Provider failures deben transformarse en errores de ejecución estructurados.

No filtrar:

```text
stack traces
database credentials
internal connection strings
```

al programa AEL.

---

## 626. VALUE MODEL

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

VALUE MODEL

Runtime utiliza los tipos definidos por Documento 55/51.

No convertir valores financieros a floating point.

---

## 627. DECIMAL

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DECIMAL

Las operaciones Decimal deben utilizar la implementación exacta aprobada por el Type System.

---

## 628. MONEY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

MONEY

Money debe conservar:

```text
amount
currency
```

y las invariantes definidas anteriormente.

---

## 629. RUNTIME TYPE CHECK

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

RUNTIME TYPE CHECK

No repetir Semantic Analysis.

Sólo aplicar guards requeridos por:

```text
Verifier
Runtime contracts
external data
```

---

## 630. EXECUTION FRAME

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION FRAME

Cada Function invocation crea:

```text
ExecutionFrame
```

con:

```text
parameters
locals
temporaries
return state
```

---

## 631. CALL STACK

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CALL STACK

Mantener:

```text
call stack
```

controlada por límite.

---

## 632. CALL DEPTH

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CALL DEPTH

Exceder:

```text
maxCallDepth
```

produce:

```text
AEL_RUNTIME_CALL_DEPTH
```

---

## 633. INSTRUCTION BUDGET

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

INSTRUCTION BUDGET

Cada execution recibe:

```text
instructionBudget
```

---

## 634. BUDGET DECREMENT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

BUDGET DECREMENT

Cada instruction ejecutada consume presupuesto según la policy.

---

## 635. BUDGET EXCEEDED

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

BUDGET EXCEEDED

Produce:

```text
AEL_RUNTIME_INSTRUCTION_LIMIT
```

---

## 636. LOOP BUDGET

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

LOOP BUDGET

Loops deben consumir presupuesto.

No permitir loops infinitos sin límite efectivo.

---

## 637. COLLECTION LIMIT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

COLLECTION LIMIT

Crear colecciones debe comprobar:

```text
maxCollectionSize
```

---

## 638. STRING LIMIT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

STRING LIMIT

Crear/concatenar strings debe respetar:

```text
maxStringLength
```

---

## 639. OBJECT LIMIT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

OBJECT LIMIT

Objetos deben respetar:

```text
maxObjectProperties
```

---

## 640. MEMORY BUDGET

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

MEMORY BUDGET

Cuando la plataforma lo permita, mantener un presupuesto de memoria lógico.

---

## 641. TIMEOUT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TIMEOUT

La ejecución debe poder tener:

```text
executionTimeout
```

como límite externo o cooperativo.

---

## 642. CANCELLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CANCELLATION

Runtime debe soportar cancelación controlada:

```text
CancellationToken
```

---

## 643. CANCELLED EXECUTION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CANCELLED EXECUTION

Produce:

```text
AEL_RUNTIME_CANCELLED
```

---

## 644. RETURN

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

RETURN

Una ejecución normal termina con:

```text
Return(value)
```

---

## 645. EXECUTION RESULT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION RESULT

Conceptualmente:

```ts
interface ExecutionResult {
  status: 'success' | 'error' | 'cancelled'
  value?: RuntimeValue
  diagnostics: Diagnostic[]
  metrics: ExecutionMetrics
}
```

---

## 646. EXECUTION ERROR

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION ERROR

Errores estructurados:

```text
code
message
sourceSpan
cause?
```

---

## 647. ERROR CATALOG

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ERROR CATALOG

Inicial:

```text
AEL_RUNTIME_INVALID_INPUT
AEL_RUNTIME_CALL_DEPTH
AEL_RUNTIME_INSTRUCTION_LIMIT
AEL_RUNTIME_MEMORY_LIMIT
AEL_RUNTIME_TIMEOUT
AEL_RUNTIME_CANCELLED
AEL_RUNTIME_DIVISION_BY_ZERO
AEL_RUNTIME_NUMERIC_OVERFLOW
AEL_RUNTIME_CAPABILITY_DENIED
AEL_RUNTIME_PROVIDER_ERROR
AEL_RUNTIME_TYPE_GUARD
AEL_RUNTIME_INVALID_ARTIFACT
```

---

## 648. DIVISION BY ZERO

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DIVISION BY ZERO

Si el Verifier dejó guard:

```text
division non-zero
```

Runtime debe comprobarla antes de dividir.

---

## 649. NUMERIC OVERFLOW

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NUMERIC OVERFLOW

Runtime debe aplicar la política numérica definida por los tipos.

No permitir overflow silencioso.

---

## 650. CURRENCY GUARD

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CURRENCY GUARD

Si currency compatibility depende de datos Runtime:

```text
check before operation
```

---

## 651. NULL GUARD

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NULL GUARD

Si un valor nullable requiere no-null:

```text
guard
```

debe ejecutarse antes del acceso.

---

## 652. CAPABILITY DENIED

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CAPABILITY DENIED

Si la capability no está autorizada:

```text
AEL_RUNTIME_CAPABILITY_DENIED
```

---

## 653. PROVIDER ERROR

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER ERROR

Provider error debe aislarse y mapearse a un diagnostic controlado.

---

## 654. RETRY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

RETRY

Runtime no debe realizar retries automáticamente de operaciones financieras sin una policy explícita.

---

## 655. IDEMPOTENCY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

IDEMPOTENCY

Las operaciones con efectos deben declarar si requieren:

```text
idempotency key
```

antes de ejecución.

---

## 656. TRANSACTION BOUNDARY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TRANSACTION BOUNDARY

Runtime no debe asumir una transacción de database global.

Los adapters/capabilities definen sus propias garantías.

---

## 657. SIDE EFFECT ORDER

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SIDE EFFECT ORDER

El orden de external calls debe ser determinista según el control flow de IR.

---

## 658. PURE EXECUTION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PURE EXECUTION

Functions puras no deben tener acceso a capabilities con efectos.

---

## 659. OBSERVABILITY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

OBSERVABILITY

Execution puede producir:

```text
executionId
artifactHash
duration
instructionCount
capabilitiesUsed
```

---

## 660. OBSERVABILITY PRIVACY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

OBSERVABILITY PRIVACY

No registrar automáticamente:

```text
secret values
full tenant data
financial payloads
```

---

## 661. EXECUTION METRICS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION METRICS

Conceptualmente:

```text
instructionsExecuted
durationMs
maxCallDepth
capabilityCalls
```

---

## 662. TRACE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TRACE

Tracing detallado debe ser opcional.

---

## 663. TRACE SECURITY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TRACE SECURITY

Trace no debe exponer:

```text
credentials
tokens
secrets
```

---

## 664. SOURCE DIAGNOSTICS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SOURCE DIAGNOSTICS

Cuando exista `sourceSpan` en IR:

```text
runtime error → source location
```

---

## 665. ARTIFACT HASH

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ARTIFACT HASH

Cada execution debe poder asociarse al:

```text
artifactHash
```

ejecutado.

---

## 666. EXECUTION ISOLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION ISOLATION

Cada ejecución debe tener estado independiente:

```text
locals
temporaries
call stack
budgets
metrics
```

---

## 667. NO GLOBAL EXECUTION STATE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NO GLOBAL EXECUTION STATE

No almacenar valores de una ejecución en estado global mutable.

---

## 668. CONCURRENCY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CONCURRENCY

Múltiples executions pueden ejecutarse simultáneamente si los adapters son thread-safe o aislados.

---

## 669. CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CONTEXT IMMUTABILITY

Los datos de configuración del execution context deben ser inmutables durante una ejecución, salvo interfaces explícitas como budgets/cancellation.

---

## 670. INPUT IMMUTABILITY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

INPUT IMMUTABILITY

El Runtime debe evitar que AEL modifique directamente los inputs externos.

---

## 671. OUTPUT ISOLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

OUTPUT ISOLATION

El resultado debe ser materializado fuera de referencias internas mutables.

---

## 672. SERIALIZABLE RESULT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SERIALIZABLE RESULT

Cuando se requiera persistir/transmitir resultado:

```text
RuntimeValue
```

debe convertirse mediante serializer controlado.

---

## 673. FINANCIAL OUTPUT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

FINANCIAL OUTPUT

Los resultados financieros deben conservar:

```text
exact amount
currency
scale/precision semantics
```

según Documento 51.

---

## 674. ROUNDING

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ROUNDING

Runtime sólo ejecuta rounding explícitamente representado en IR.

No aplicar rounding implícito al final de la ejecución.

---

## 675. EXECUTION ORDER

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION ORDER

La ejecución sigue:

```text
IR block
→ instruction
→ next instruction/block
```

sin reinterpretar AST.

---

## 676. INTERPRETER V1

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

INTERPRETER V1

Para V1 se recomienda:

```text
IR interpreter
```

en lugar de generar código nativo.

---

## 677. JUSTIFICATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

JUSTIFICATION

Un interpreter proporciona:

```text
determinism
security
debuggability
simple deployment
```

y reduce superficie de ataque.

---

## 678. FUTURE JIT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

FUTURE JIT

Un JIT puede agregarse posteriormente siempre que conserve:

```text
same semantics
same verification guarantees
same capability model
```

---

## 679. INTERPRETER LOOP

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

INTERPRETER LOOP

Conceptualmente:

```text
while execution active:
    fetch instruction
    validate runtime guards
    execute
    update budget
```

---

## 680. NO DYNAMIC CODE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NO DYNAMIC CODE

Runtime no debe generar ni ejecutar:

```text
eval
Function(...)
dynamic JavaScript
```

para ejecutar AEL.

---

## 681. NO REFLECTION ESCAPE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NO REFLECTION ESCAPE

AEL no debe acceder a objetos internos del host mediante reflection.

---

## 682. HOST OBJECT ISOLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

HOST OBJECT ISOLATION

Los valores expuestos al Runtime deben ser:

```text
AEL Runtime Values
```

no objetos arbitrarios del host.

---

## 683. ADAPTER BOUNDARY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ADAPTER BOUNDARY

External systems deben aparecer como:

```text
CapabilityAdapter
```

---

## 684. ADAPTER INPUT VALIDATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ADAPTER INPUT VALIDATION

Cada adapter valida sus inputs antes de cruzar la frontera externa.

---

## 685. ADAPTER OUTPUT VALIDATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ADAPTER OUTPUT VALIDATION

Outputs externos deben validarse contra el contrato esperado antes de regresar al Runtime.

---

## 686. PROVIDER TIMEOUT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER TIMEOUT

External calls deben tener timeout.

---

## 687. PROVIDER CANCELLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER CANCELLATION

External calls deben respetar cancellation cuando la tecnología subyacente lo permita.

---

## 688. PROVIDER RETRY POLICY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER RETRY POLICY

Retries deben ser responsabilidad de una policy/adaptor explícita.

---

## 689. PROVIDER CIRCUIT BREAKER

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER CIRCUIT BREAKER

Puede implementarse en infraestructura, no dentro del lenguaje AEL.

---

## 690. DATABASE CAPABILITY EXAMPLE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DATABASE CAPABILITY EXAMPLE

Conceptualmente:

```text
AEL
 ↓
data.read("unit")
 ↓
CapabilityBroker
 ↓
UnitDataAdapter
 ↓
database
```

Nunca:

```text
AEL
 ↓
SQL string
 ↓
database
```

---

## 691. SQL IS NOT A PRIMITIVE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SQL IS NOT A PRIMITIVE

No exponer SQL arbitrario a AEL.

---

## 692. HTTP IS NOT A PRIMITIVE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

HTTP IS NOT A PRIMITIVE

No exponer HTTP arbitrario.

---

## 693. FILESYSTEM IS NOT A PRIMITIVE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

FILESYSTEM IS NOT A PRIMITIVE

No exponer filesystem arbitrario.

---

## 694. ENVIRONMENT VARIABLES

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ENVIRONMENT VARIABLES

No exponer environment variables directamente.

---

## 695. SECRETS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SECRETS

Secrets sólo pueden ser usados internamente por adapters autorizados.

Nunca entregarlos al programa como texto salvo una capability específicamente diseñada y autorizada.

---

## 696. TENANT ISOLATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TENANT ISOLATION

Cada tenant-scoped capability debe validar:

```text
requested tenant
authorized tenant
```

antes de operar.

---

## 697. CROSS-TENANT DENIAL

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CROSS-TENANT DENIAL

Si no existe capability explícita:

```text
deny
```

---

## 698. AUDIT

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

AUDIT

Execution de operaciones financieras sensibles puede producir:

```text
audit event
```

mediante capability/infraestructura.

---

## 699. AUDIT DATA MINIMIZATION

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

AUDIT DATA MINIMIZATION

Audit debe registrar referencias necesarias, no payload financiero completo por defecto.

---

## 700. EXECUTION REPLAY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXECUTION REPLAY

Para debugging/testing, debe ser posible capturar inputs controlados y reproducir una ejecución cuando todas las dependencies sean deterministas.

---

## 701. REPLAY REQUIREMENTS

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

REPLAY REQUIREMENTS

Registrar:

```text
artifactHash
inputHash
registrySnapshot
clock configuration
capability responses
```

cuando la policy de replay lo requiera.

---

## 702. EXTERNAL RESPONSE REPLAY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

EXTERNAL RESPONSE REPLAY

Provider responses pueden sustituirse por fixtures en entorno de pruebas.

---

## 703. PRODUCTION REPLAY

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PRODUCTION REPLAY

No almacenar automáticamente datos sensibles sólo para facilitar replay.

---

## 704. BASIC EXECUTION TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

BASIC EXECUTION TEST

Artifact equivalente a:

```ael
let x = 10;
return x;
```

debe devolver:

```text
10
```

---

## 705. ARITHMETIC TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ARITHMETIC TEST

```ael
return 10 + 20;
```

resultado:

```text
30
```

sin floating point financiero.

---

## 706. MONEY TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

MONEY TEST

Ejecutar:

```text
Money × Rate
```

y validar exactitud según Documento 51.

---

## 707. DIVISION TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DIVISION TEST

División por cero debe producir:

```text
AEL_RUNTIME_DIVISION_BY_ZERO
```

---

## 708. CAPABILITY TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CAPABILITY TEST

Capability autorizada:

```text
success
```

Capability no autorizada:

```text
AEL_RUNTIME_CAPABILITY_DENIED
```

---

## 709. TENANT TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TENANT TEST

Tenant context válido:

```text
success
```

tenant context ausente/no autorizado:

```text
denied
```

---

## 710. LIMIT TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

LIMIT TEST

Superar instruction budget:

```text
AEL_RUNTIME_INSTRUCTION_LIMIT
```

---

## 711. LOOP TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

LOOP TEST

Loop debe detenerse al alcanzar:

```text
iteration/instruction budget
```

---

## 712. RECURSION TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

RECURSION TEST

Superar call depth:

```text
AEL_RUNTIME_CALL_DEPTH
```

---

## 713. CANCELLATION TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CANCELLATION TEST

Cancelar ejecución:

```text
AEL_RUNTIME_CANCELLED
```

---

## 714. PROVIDER TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PROVIDER TEST

Provider failure:

```text
AEL_RUNTIME_PROVIDER_ERROR
```

sin filtrar detalles internos.

---

## 715. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

DETERMINISM TEST

Mismo:

```text
artifact
inputs
clock
capability responses
```

debe producir:

```text
same result
```

---

## 716. CONCURRENCY TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

CONCURRENCY TEST

Dos ejecuciones simultáneas no deben compartir:

```text
locals
temporaries
budgets
```

---

## 717. ISOLATION TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

ISOLATION TEST

Una ejecución no debe alterar el resultado de otra.

---

## 718. NO EVAL TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

NO EVAL TEST

La suite debe comprobar que Runtime no utiliza:

```text
eval
Function constructor
dynamic code execution
```

como mecanismo de ejecución AEL.

---

## 719. SECURITY TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SECURITY TEST

Inputs hostiles no deben escapar del sandbox lógico.

---

## 720. RESOURCE TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

RESOURCE TEST

Verificar límites:

```text
strings
arrays
objects
calls
instructions
```

---

## 721. PERFORMANCE TEST

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PERFORMANCE TEST

Medir:

```text
instructions/sec
memory/execution
latency
```

sin sacrificar garantías.

---

## 722. SÉPTIMO VERTICAL SLICE

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

SÉPTIMO VERTICAL SLICE

Ejecutar una primera liquidación real únicamente a través de capabilities controladas.

---

## 723. TRUST MODEL

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

TRUST MODEL

```text
Compiler
  ↓
Verifier
  ↓
Artifact
  ↓
Runtime Validation
  ↓
Controlled Execution
```

El Runtime no sustituye al Verifier.

---

## 724. PRINCIPIO DE MÍNIMO PRIVILEGIO

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PRINCIPIO DE MÍNIMO PRIVILEGIO

AEL sólo puede hacer:

```text
what the Artifact declares
+
what the ExecutionContext authorizes
```

---

## 725. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PRINCIPIO FINANCIERO

La ejecución debe conservar las garantías del Type System:

```text
exact arithmetic
currency safety
explicit rounding
no silent overflow
```

---

## 726. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Runtime Architecture & Execution Engine 62.md

PRINCIPIO DE DETERMINISMO

Cuando las dependencies sean deterministas:

```text
same Artifact
+
same inputs
+
same environment
=
same result
```

---
