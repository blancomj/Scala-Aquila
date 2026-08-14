# AEL V1 — Liquidation Engine — Dependency Graph & Calculation Context

> **Documento canónico consolidado.** La numeración histórica 1–74 se conserva sólo para trazabilidad. Las reglas transversales se definen una vez y se consumen por referencia.

## Fuentes absorbidas

```text
66 — Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md
67 — Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md
```

## 1. REFERENCIAS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

REFERENCIAS

Consume:

```text
Documento 50 — Business & Financial Domain Model
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 58 — Semantic Analyzer & Type System Implementation
Documento 59 — Intermediate Representation & Compiler Lowering
Documento 60 — Verifier & Static Safety Validation
Documento 62 — Runtime Architecture & Execution Engine
Documento 64 — Liquidation Execution Context & Data Snapshot
Documento 65 — Liquidation Calculation Pipeline & Execution Lifecycle
```

---

## 2. OBJETIVO

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

OBJETIVO

Transformar las dependencias declaradas entre conceptos en un plan ejecutable:

```text
Concept Definitions
       ↓
Dependency Graph
       ↓
Validation
       ↓
Topological Order
       ↓
Calculation Plan
       ↓
Runtime
```

---

## 3. PROBLEMA

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PROBLEMA

Si:

```text
Concept C
  depends on
Concept B
  depends on
Concept A
```

no debe ejecutarse:

```text
C → B → A
```

sino:

```text
A → B → C
```

---

## 4. PRINCIPIO

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRINCIPIO

El orden de cálculo debe derivarse de dependencias explícitas, no del orden accidental de almacenamiento.

---

## 5. CONCEPT NODE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONCEPT NODE

Conceptualmente:

```ts
interface ConceptNode {
  conceptId: ConceptId
  dependencies: ConceptId[]
  priority?: number
}
```

---

## 6. GRAPH

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH

El grafo:

```text
G = (V, E)
```

donde:

```text
V = concepts
E = dependency edges
```

---

## 7. EDGE SEMANTICS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

EDGE SEMANTICS

Una arista:

```text
A → B
```

significa:

```text
B depende de A
```

por lo tanto:

```text
A debe calcularse antes que B
```

---

## 8. DIRECT DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DIRECT DEPENDENCY

Ejemplo:

```text
administration_base
      ↓
administration_fee
```

---

## 9. TRANSITIVE DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

TRANSITIVE DEPENDENCY

Si:

```text
A → B
B → C
```

entonces:

```text
A → C
```

aunque C no declare A directamente.

---

## 10. GRAPH VALIDATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH VALIDATION

Antes de ejecutar:

```text
all nodes valid
all references exist
no invalid edges
no cycles
```

---

## 11. UNKNOWN DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

UNKNOWN DEPENDENCY

Si un Concept referencia otro inexistente:

```text
AEL_CALC_UNKNOWN_CONCEPT
```

---

## 12. SELF DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SELF DEPENDENCY

Un concepto:

```text
A → A
```

es inválido.

Error:

```text
AEL_CALC_SELF_DEPENDENCY
```

---

## 13. CYCLE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CYCLE

Ejemplo:

```text
A → B
B → C
C → A
```

es inválido para el cálculo normal.

---

## 14. CYCLE ERROR

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CYCLE ERROR

```text
AEL_CALC_CYCLIC_DEPENDENCY
```

---

## 15. CYCLE DIAGNOSTICS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CYCLE DIAGNOSTICS

El diagnóstico debe identificar el ciclo:

```text
A → B → C → A
```

para facilitar corrección.

---

## 16. TOPOLOGICAL SORT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

TOPOLOGICAL SORT

Usar un algoritmo de ordenamiento topológico.

Opciones válidas:

```text
Kahn
DFS post-order
```

La implementación debe producir resultado determinista.

---

## 17. DETERMINISM

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DETERMINISM

No depender de:

```text
hash map iteration
database row order
memory address
```

---

## 18. STABLE TIE BREAKER

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

STABLE TIE BREAKER

Cuando varios nodos no tienen dependencias pendientes:

```text
priority
```

puede resolver precedencia.

---

## 19. SECONDARY TIE BREAKER

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SECONDARY TIE BREAKER

Si priority coincide:

```text
canonical conceptId
```

debe proporcionar orden estable.

---

## 20. PRIORITY SEMANTICS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRIORITY SEMANTICS

Priority sólo debe resolver empates entre conceptos que ya sean ejecutables.

Nunca debe utilizarse para violar una dependencia.

---

## 21. INVALID PRIORITY USE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

INVALID PRIORITY USE

No permitir:

```text
A depends on B
```

pero ejecutar A antes sólo porque:

```text
priority(A) < priority(B)
```

---

## 22. CALCULATION PLAN

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CALCULATION PLAN

Conceptualmente:

```ts
interface CalculationPlan {
  nodes: CalculationStep[]
  graphHash: string
  planHash: string
}
```

---

## 23. CALCULATION STEP

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CALCULATION STEP

Puede contener:

```text
conceptId
dependencies
executionMode
```

---

## 24. EXECUTION MODE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

EXECUTION MODE

V1 puede soportar:

```text
Sequential
Parallel
```

---

## 25. SEQUENTIAL

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SEQUENTIAL

Conceptos independientes también pueden procesarse secuencialmente.

Ventaja:

```text
simple
predictable
easy debugging
```

---

## 26. PARALLEL

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PARALLEL

Conceptos sin dependencias entre sí pueden ejecutarse en paralelo.

Ejemplo:

```text
A      B
 \    /
   C
```

A y B pueden ejecutarse simultáneamente.

---

## 27. PARALLEL SAFETY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PARALLEL SAFETY

Sólo paralelizar si:

```text
no dependency
no shared mutable state
no conflicting effects
```

---

## 28. FINANCIAL DEFAULT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

FINANCIAL DEFAULT

Para V1:

```text
sequential deterministic execution
```

es el comportamiento por defecto.

---

## 29. FUTURE PARALLELISM

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

FUTURE PARALLELISM

Parallel execution puede optimizarse posteriormente sin modificar semantics.

---

## 30. LEVELS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

LEVELS

El grafo puede dividirse en niveles:

```text
Level 0: A B
Level 1: C D
Level 2: E
```

---

## 31. LEVEL SEMANTICS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

LEVEL SEMANTICS

Todos los nodos de un nivel deben depender sólo de niveles anteriores.

---

## 32. LEVEL PLAN

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

LEVEL PLAN

Puede representarse:

```ts
interface CalculationLevel {
  index: number
  concepts: ConceptId[]
}
```

---

## 33. GRAPH HASH

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH HASH

Calcular hash sobre representación canónica del grafo.

Debe incluir:

```text
nodes
edges
priorities
relevant versions
```

---

## 34. PLAN HASH

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLAN HASH

El plan hash identifica el orden y estrategia concreta de ejecución.

---

## 35. REPRODUCIBILITY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

REPRODUCIBILITY

Mismo:

```text
concept definitions
versions
dependencies
priority
policy
```

debe producir:

```text
same graphHash
same planHash
```

---

## 36. VERSIONED CONCEPTS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

VERSIONED CONCEPTS

Si un concepto cambia de versión y la versión forma parte de la semántica:

```text
graph identity
```

debe reflejarlo.

---

## 37. CONDITIONAL DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONDITIONAL DEPENDENCY

Una dependencia que sólo aplica bajo una condición debe tener una representación semántica explícita.

No esconderla en lógica host.

---

## 38. CONDITIONAL GRAPH

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONDITIONAL GRAPH

La ejecución puede producir un subgrafo activo:

```text
Full Graph
   ↓
Condition Evaluation
   ↓
Active Graph
```

---

## 39. ACTIVE GRAPH VALIDATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

ACTIVE GRAPH VALIDATION

El subgrafo activo debe seguir siendo acíclico.

---

## 40. DYNAMIC DEPENDENCIES

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DYNAMIC DEPENDENCIES

V1 debe minimizar dependencias creadas dinámicamente durante ejecución.

---

## 41. DYNAMIC DEPENDENCY POLICY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DYNAMIC DEPENDENCY POLICY

Si se requiere:

```text
runtime dependency
```

debe existir una capability/modelo explícito.

---

## 42. NO HIDDEN DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

NO HIDDEN DEPENDENCY

Un Concept no debe depender implícitamente de:

```text
execution order
global mutable variable
previous result accidental
```

---

## 43. RESULT REFERENCES

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

RESULT REFERENCES

Cuando un Concept consume otro resultado:

```text
explicit dependency
```

debe existir.

---

## 44. CONCEPT OUTPUT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONCEPT OUTPUT

Un Concept puede producir:

```text
ConceptResult
```

identificado por:

```text
conceptId
unitId
```

cuando corresponda.

---

## 45. RESULT ACCESS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

RESULT ACCESS

Sólo Concepts declarados como dependientes deben poder consumir resultados de otros Concepts.

---

## 46. RESULT MUTABILITY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

RESULT MUTABILITY

Concept results deben ser inmutables después de producirse.

---

## 47. MISSING RESULT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

MISSING RESULT

Si un Concept requiere un resultado que no existe:

```text
AEL_CALC_MISSING_DEPENDENCY_RESULT
```

---

## 48. FAILED DEPENDENCY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

FAILED DEPENDENCY

Si A depende de B y B falla:

```text
A no debe ejecutarse
```

salvo una policy explícita de error recovery.

---

## 49. FAILURE PROPAGATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

FAILURE PROPAGATION

Default:

```text
dependency failure
→ dependent blocked
```

---

## 50. BLOCKED STATUS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

BLOCKED STATUS

Puede existir:

```text
Blocked
```

para distinguirlo de:

```text
Failed
```

---

## 51. PARTIAL CALCULATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PARTIAL CALCULATION

Una ejecución batch puede registrar:

```text
Calculated
Failed
Blocked
Skipped
```

por Concept/Unit.

---

## 52. SKIPPED

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SKIPPED

Skipped debe tener una razón explícita:

```text
condition false
not applicable
policy
```

---

## 53. ZERO IS NOT SKIPPED

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

ZERO IS NOT SKIPPED

Resultado:

```text
0
```

es un cálculo válido, no un skipped.

---

## 54. NULL IS NOT ZERO

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

NULL IS NOT ZERO

`null` y `0` mantienen semántica distinta.

---

## 55. CONDITIONAL CONCEPT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONDITIONAL CONCEPT

Un Concept puede ser no aplicable según:

```text
unit state
period
parameters
business condition
```

pero la decisión debe ser explícita.

---

## 56. CONDITIONAL RESULT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONDITIONAL RESULT

Puede producir:

```text
NotApplicable
```

cuando el dominio lo requiera.

---

## 57. DEPENDENCY ON NOT APPLICABLE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DEPENDENCY ON NOT APPLICABLE

Debe definirse qué significa si un dependiente consume un Concept `NotApplicable`.

No asumir automáticamente cero.

---

## 58. POLICY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

POLICY

El comportamiento debe pertenecer a:

```text
domain rule
```

y no al planner genérico.

---

## 59. CONCEPT PRIORITY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONCEPT PRIORITY

Priority puede servir para:

```text
presentation
stable tie-breaking
execution preference
```

pero no sustituye dependency graph.

---

## 60. GRAPH NORMALIZATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH NORMALIZATION

Antes del hash:

```text
sort nodes canonically
sort dependency lists canonically
normalize priorities
normalize versions
```

---

## 61. GRAPH SERIALIZATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH SERIALIZATION

Utilizar representación canónica compatible con las reglas de Artifact.

---

## 62. PLAN SERIALIZATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLAN SERIALIZATION

El plan puede serializarse para:

```text
audit
debugging
replay
```

---

## 63. PLAN STORAGE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLAN STORAGE

No es obligatorio persistir el plan completo si puede reconstruirse de forma determinista desde el Artifact + Snapshot + policy.

---

## 64. PLAN PROVENANCE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLAN PROVENANCE

Una ejecución debe poder indicar:

```text
graphHash
planHash
artifactHash
snapshotHash
```

cuando sea necesario.

---

## 65. GRAPH BUILD INPUT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH BUILD INPUT

El planner puede recibir:

```text
Concept Registry
Artifact metadata
Domain policy
```

---

## 66. SNAPSHOT EFFECT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SNAPSHOT EFFECT

El Snapshot puede determinar qué Concepts están activos.

---

## 67. SCOPE EFFECT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SCOPE EFFECT

El scope puede reducir el conjunto de Concepts aplicables.

---

## 68. PERIOD EFFECT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PERIOD EFFECT

El período puede cambiar applicability:

```text
effective concept
```

según reglas del dominio.

---

## 69. GRAPH VS BUSINESS RULES

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH VS BUSINESS RULES

El planner determina:

```text
order
dependency validity
```

No determina:

```text
amount formula
```

---

## 70. FORMULA EXECUTION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

FORMULA EXECUTION

La fórmula sigue siendo responsabilidad de:

```text
AEL Runtime
```

---

## 71. PLANNER OUTPUT

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLANNER OUTPUT

Debe producir:

```text
validated calculation plan
```

no resultados financieros.

---

## 72. PLAN VALIDATOR

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLAN VALIDATOR

Crear:

```text
CalculationPlanValidator
```

---

## 73. VALIDATION CHECKS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

VALIDATION CHECKS

Debe comprobar:

```text
acyclic
references valid
order valid
priority valid
versions compatible
```

---

## 74. TOPOLOGICAL VALIDATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

TOPOLOGICAL VALIDATION

Para cada edge:

```text
dependencyIndex < dependentIndex
```

---

## 75. GRAPH CONNECTIVITY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH CONNECTIVITY

No es obligatorio que el grafo sea totalmente conectado.

Puede contener componentes independientes.

---

## 76. DISCONNECTED COMPONENTS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DISCONNECTED COMPONENTS

Ejemplo:

```text
A → B

C → D
```

son dos componentes válidos.

---

## 77. COMPONENT ORDER

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

COMPONENT ORDER

Componentes independientes deben ordenarse determinísticamente.

---

## 78. GRAPH COMPONENT HASH

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH COMPONENT HASH

Puede calcularse hash por componente para debugging.

---

## 79. EXPLANATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

EXPLANATION

Planner debe poder explicar:

```text
why Concept C executes after B
```

mediante dependency chain.

---

## 80. DEBUG PLAN

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DEBUG PLAN

Ejemplo:

```text
C
depends on B
B depends on A

execution:
A → B → C
```

---

## 81. DIAGNOSTICS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DIAGNOSTICS

Errores deben incluir:

```text
conceptId
dependencyId
graph context
sourceSpan
```

cuando esté disponible.

---

## 82. SOURCE SPAN

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SOURCE SPAN

Si dependency fue declarada en AEL:

```text
sourceSpan
```

debe permitir localizarla.

---

## 83. CYCLE SOURCE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CYCLE SOURCE

Cycle diagnostics deben señalar las declaraciones relevantes cuando sea posible.

---

## 84. LIMITS

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

LIMITS

Planner debe tener límites para:

```text
max concepts
max edges
max dependency depth
```

---

## 85. GRAPH SIZE ERROR

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

GRAPH SIZE ERROR

```text
AEL_CALC_GRAPH_SIZE_LIMIT
```

---

## 86. DEPTH ERROR

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DEPTH ERROR

```text
AEL_CALC_DEPENDENCY_DEPTH_LIMIT
```

---

## 87. EDGE ERROR

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

EDGE ERROR

```text
AEL_CALC_EDGE_LIMIT
```

---

## 88. PERFORMANCE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PERFORMANCE

Topological sort debe ser:

```text
O(V + E)
```

en su implementación estándar.

---

## 89. MEMORY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

MEMORY

La estructura del grafo debe evitar duplicación innecesaria.

---

## 90. CACHE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CACHE

Planes pueden cachearse por:

```text
artifactHash
graphHash
policyHash
```

cuando sea seguro.

---

## 91. CACHE INVALIDATION

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CACHE INVALIDATION

Cambios en:

```text
Artifact
Concept definitions
Policy
Dependency versions
```

deben invalidar el plan.

---

## 92. SNAPSHOT CACHE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SNAPSHOT CACHE

No asumir que un plan cached implica snapshot válido.

Son identidades diferentes.

---

## 93. PLAN REUSE

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PLAN REUSE

Un mismo plan puede utilizarse con distintos Snapshots si el conjunto de Concepts y dependencies no cambia.

---

## 94. ACTIVE PLAN

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

ACTIVE PLAN

Si Snapshot cambia applicability:

```text
active plan
```

debe recalcularse.

---

## 95. THREAD SAFETY

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

THREAD SAFETY

Planos cacheados deben ser inmutables/thread-safe.

---

## 96. BASIC GRAPH TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

BASIC GRAPH TEST

```text
A → B → C
```

produce:

```text
A, B, C
```

---

## 97. BRANCH TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

BRANCH TEST

```text
A → C
B → C
```

produce:

```text
A/B before C
```

con tie-break determinista.

---

## 98. MERGE TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

MERGE TEST

```text
A → C
B → C
```

C no debe iniciar antes de A y B.

---

## 99. CYCLE TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CYCLE TEST

```text
A → B
B → A
```

produce:

```text
AEL_CALC_CYCLIC_DEPENDENCY
```

---

## 100. UNKNOWN NODE TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

UNKNOWN NODE TEST

Dependency inexistente:

```text
AEL_CALC_UNKNOWN_CONCEPT
```

---

## 101. SELF DEPENDENCY TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

SELF DEPENDENCY TEST

```text
A → A
```

produce:

```text
AEL_CALC_SELF_DEPENDENCY
```

---

## 102. PRIORITY TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRIORITY TEST

Conceptos independientes:

```text
priority
```

determina orden.

---

## 103. PRIORITY VIOLATION TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRIORITY VIOLATION TEST

Priority no puede romper dependency.

---

## 104. DETERMINISM TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DETERMINISM TEST

Repetir planner varias veces:

```text
same planHash
```

---

## 105. COMPONENT TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

COMPONENT TEST

Dos componentes independientes deben mantener orden determinista.

---

## 106. CONDITIONAL TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CONDITIONAL TEST

Condition false:

```text
concept skipped/not applicable
```

según policy.

---

## 107. DEPENDENCY FAILURE TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

DEPENDENCY FAILURE TEST

Dependency failed:

```text
dependent blocked
```

---

## 108. RESULT ACCESS TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

RESULT ACCESS TEST

Concept sin dependency no puede leer resultado de otro Concept arbitrariamente.

---

## 109. LIMIT TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

LIMIT TEST

Exceder:

```text
maxConcepts
maxEdges
maxDepth
```

debe rechazar el plan.

---

## 110. CACHE TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

CACHE TEST

Misma identity:

```text
cache hit
```

Cambio de Artifact:

```text
cache invalid
```

---

## 111. REPLAY TEST

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

REPLAY TEST

Mismo Artifact/policy:

```text
same planHash
```

---

## 112. PRINCIPIO DE DETERMINISMO

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRINCIPIO DE DETERMINISMO

El mismo conjunto de conceptos, versiones, dependencias y policy debe producir el mismo plan.

---

## 113. PRINCIPIO DE EXPLICITUD

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRINCIPIO DE EXPLICITUD

Toda dependencia relevante debe ser visible para el planner.

No existen dependencias mágicas.

---

## 114. PRINCIPIO DE SEGURIDAD

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRINCIPIO DE SEGURIDAD

Un ciclo, referencia inexistente o grafo fuera de límites debe detener la ejecución antes de calcular.

---

## 115. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Concept Dependency Graph & Calculation Ordering 66.md

PRINCIPIO FINANCIERO

El orden de cálculo es parte de la semántica cuando existen dependencias financieras.

Cambiar el orden puede cambiar el resultado; por eso el plan debe ser verificable y reproducible.

---

## 116. REFERENCIAS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

REFERENCIAS

Consume:

```text
Documento 51 — Financial Types & Numeric Semantics
Documento 55 — Core Domain & Foundational Types
Documento 58 — Semantic Analyzer & Type System Implementation
Documento 59 — Intermediate Representation & Compiler Lowering
Documento 62 — Runtime Architecture & Execution Engine
Documento 64 — Liquidation Execution Context & Data Snapshot
Documento 65 — Liquidation Calculation Pipeline & Execution Lifecycle
Documento 66 — Concept Dependency Graph & Calculation Ordering
```

---

## 117. OBJETIVO

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OBJETIVO

Definir el estado de cálculo:

```text
Liquidation Context
      ↓
Calculation Context
      ↓
Variables / Inputs
      ↓
Concept Results
      ↓
Intermediate Values
      ↓
Final Result
```

---

## 118. PROBLEMA

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PROBLEMA

Durante una liquidación existen diferentes clases de valores:

```text
inputs
parameters
snapshot values
local variables
concept results
intermediate values
final outputs
```

No deben mezclarse ni compartir estado accidentalmente.

---

## 119. PRINCIPIO

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PRINCIPIO

Cada valor debe tener:

```text
scope
type
owner
lifetime
mutability policy
```

---

## 120. CALCULATION CONTEXT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CALCULATION CONTEXT

Conceptualmente:

```ts
interface CalculationContext {
  tenantId: TenantId
  periodId: PeriodId
  unitId: UnitId
  parameters: ParameterStore
  inputs: InputStore
  results: ConceptResultStore
}
```

---

## 121. SCOPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SCOPE

El contexto debe distinguir:

```text
Execution
Liquidation
Unit
Concept
Instruction
```

---

## 122. EXECUTION SCOPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

EXECUTION SCOPE

Pertenece a toda la ejecución.

Ejemplos:

```text
executionId
artifactHash
snapshotHash
limits
clock
```

---

## 123. LIQUIDATION SCOPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

LIQUIDATION SCOPE

Compartido por la liquidación:

```text
tenant
period
parameters
snapshot metadata
```

---

## 124. UNIT SCOPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

UNIT SCOPE

Pertenece a una Unit específica:

```text
unitId
coefficient
unit attributes
unit-specific inputs
```

---

## 125. CONCEPT SCOPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONCEPT SCOPE

Pertenece a un Concept:

```text
conceptId
concept inputs
local variables
intermediate values
```

---

## 126. INSTRUCTION SCOPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INSTRUCTION SCOPE

Pertenece a una instrucción concreta del IR:

```text
temporary values
stack values
operation operands
```

---

## 127. LIFETIME

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

LIFETIME

Un valor debe existir sólo durante el scope necesario.

---

## 128. VALUE CATEGORIES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

VALUE CATEGORIES

Categorías:

```text
InputValue
ParameterValue
SnapshotValue
LocalValue
ConceptResult
TemporaryValue
OutputValue
```

---

## 129. INPUT VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INPUT VALUE

Proviene del:

```text
LiquidationContext
```

y no debe ser modificado por AEL.

---

## 130. PARAMETER VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PARAMETER VALUE

Parámetro explícito del cálculo.

Debe ser compatible con la firma del Artifact.

---

## 131. SNAPSHOT VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SNAPSHOT VALUE

Proviene del:

```text
Frozen DataSnapshot
```

y es inmutable durante ejecución.

---

## 132. LOCAL VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

LOCAL VALUE

Variable creada por la ejecución de un Concept.

---

## 133. CONCEPT RESULT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONCEPT RESULT

Resultado publicado por un Concept para sus dependientes.

---

## 134. TEMPORARY VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

TEMPORARY VALUE

Valor interno de una instrucción.

No debe aparecer automáticamente en otro Concept.

---

## 135. OUTPUT VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT VALUE

Resultado seleccionado para formar parte del resultado final.

---

## 136. TYPE SAFETY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

TYPE SAFETY

Cada valor debe conservar su tipo definido por el Type System.

No almacenar:

```text
any
```

como escape semántico.

---

## 137. RUNTIME VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RUNTIME VALUE

El Runtime puede representar los valores mediante:

```text
RuntimeValue
```

pero debe conservar información suficiente para respetar los tipos AEL.

---

## 138. IMMUTABILITY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

IMMUTABILITY

Default:

```text
InputValue       immutable
ParameterValue   immutable
SnapshotValue    immutable
ConceptResult    immutable
```

---

## 139. MUTABLE LOCALS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MUTABLE LOCALS

V1 puede permitir mutación controlada de:

```text
LocalValue
```

sólo cuando la semántica del lenguaje lo permita.

---

## 140. NO SHARED MUTABLE STATE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

NO SHARED MUTABLE STATE

Conceptos diferentes no deben compartir variables mutables.

---

## 141. RESULT STORE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT STORE

Crear:

```text
ConceptResultStore
```

para almacenar resultados publicados.

---

## 142. RESULT KEY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT KEY

Un resultado debe identificarse como mínimo por:

```text
unitId
conceptId
```

cuando el cálculo sea unit-scoped.

---

## 143. TENANT IN RESULT KEY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

TENANT IN RESULT KEY

El tenant puede formar parte de la identidad lógica cuando el Store abarque múltiples tenants.

---

## 144. PERIOD IN RESULT KEY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PERIOD IN RESULT KEY

El period puede formar parte de la identidad lógica para evitar mezclar ejecuciones históricas.

---

## 145. EXECUTION ISOLATION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

EXECUTION ISOLATION

La identidad física recomendada:

```text
executionId
+
unitId
+
conceptId
```

evita colisiones entre ejecuciones.

---

## 146. RESULT VERSION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT VERSION

Si un Concept puede producir múltiples versiones durante una ejecución, debe distinguirse:

```text
attempt/version
```

aunque V1 recomienda un único resultado final por Concept.

---

## 147. RESULT WRITE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT WRITE

Un Concept sólo puede publicar su resultado cuando:

```text
calculation completed
result validated
```

---

## 148. RESULT IMMUTABILITY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT IMMUTABILITY

Una vez publicado:

```text
ConceptResult
```

no debe modificarse.

---

## 149. RESULT REPLACEMENT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT REPLACEMENT

Una corrección produce un nuevo execution context, no modifica el resultado anterior.

---

## 150. RESULT READ

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT READ

Un Concept sólo puede leer resultados de:

```text
declared dependencies
```

---

## 151. UNDECLARED READ

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

UNDECLARED READ

Intentar leer un resultado no declarado:

```text
AEL_CALC_UNDECLARED_RESULT_ACCESS
```

---

## 152. MISSING RESULT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MISSING RESULT

Si una dependencia no produjo resultado:

```text
AEL_CALC_MISSING_DEPENDENCY_RESULT
```

---

## 153. BLOCKED DEPENDENCY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

BLOCKED DEPENDENCY

Si la dependencia está:

```text
Failed
Blocked
```

el Concept dependiente no debe ejecutarse.

---

## 154. RESULT STATUS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT STATUS

Concept result puede tener:

```text
Pending
Running
Succeeded
Failed
Blocked
Skipped
NotApplicable
```

---

## 155. STATUS SEMANTICS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

STATUS SEMANTICS

`Skipped` y `NotApplicable` no significan automáticamente:

```text
amount = 0
```

---

## 156. ZERO

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ZERO

Zero es un valor financiero válido:

```text
Money(0, currency)
```

---

## 157. NULL

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

NULL

Null sólo puede existir donde el Type System lo permita.

---

## 158. ABSENCE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ABSENCE

La ausencia de resultado es diferente de:

```text
null
zero
empty
```

---

## 159. LOCAL STORE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

LOCAL STORE

Crear:

```text
LocalStore
```

para variables de Concept.

---

## 160. LOCAL IDENTITY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

LOCAL IDENTITY

Las variables deben tener identidad derivada de:

```text
scope
symbolId
```

no sólo del nombre textual.

---

## 161. SYMBOL ID

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SYMBOL ID

El Compiler/IR debe proporcionar identidad estable cuando corresponda.

---

## 162. VARIABLE SHADOWING

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

VARIABLE SHADOWING

Si AEL permite shadowing:

```text
inner scope
```

debe ocultar el símbolo exterior sólo dentro de ese scope.

---

## 163. NO CROSS-CONCEPT LOCAL

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

NO CROSS-CONCEPT LOCAL

Una variable local no puede ser leída por otro Concept.

---

## 164. STACK VALUES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

STACK VALUES

El Interpreter puede utilizar stack interno para operaciones.

Ese stack no pertenece al modelo de negocio.

---

## 165. STACK ISOLATION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

STACK ISOLATION

Cada ExecutionFrame posee su propio estado de stack.

---

## 166. FRAME LOCALS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

FRAME LOCALS

Cada Function call posee su propio conjunto de locals.

---

## 167. RETURN VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RETURN VALUE

El return de una Function se materializa como:

```text
RuntimeValue
```

y cruza sólo la frontera definida por la firma.

---

## 168. FUNCTION PARAMETERS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

FUNCTION PARAMETERS

Parameters deben ser:

```text
typed
validated
isolated
```

---

## 169. PARAMETER PASSING

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PARAMETER PASSING

V1 recomienda semántica de valores inmutables para datos financieros y de contexto.

---

## 170. COLLECTIONS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

COLLECTIONS

Collections deben respetar:

```text
element type
max size
immutability policy
```

---

## 171. COLLECTION MUTATION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

COLLECTION MUTATION

Si se permite mutación, debe estar restringida al scope autorizado.

---

## 172. MAPS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MAPS

Map keys deben tener tipos definidos.

No usar objetos host como keys semánticas.

---

## 173. OBJECT VALUES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OBJECT VALUES

Object values deben pertenecer al modelo AEL.

No exponer clases del host.

---

## 174. MONEY VALUES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MONEY VALUES

Money conserva:

```text
amount
currency
```

sin conversión a floating point.

---

## 175. DECIMAL VALUES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

DECIMAL VALUES

Decimal conserva exactitud según Documento 51.

---

## 176. DATE VALUES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

DATE VALUES

Dates deben conservar el tipo temporal definido por Core Domain.

---

## 177. ENUM VALUES

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ENUM VALUES

Enums deben representarse mediante el tipo definido.

---

## 178. IDENTIFIERS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

IDENTIFIERS

IDs no deben confundirse con strings arbitrarios cuando el Type System los distingue.

---

## 179. VALUE VALIDATION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

VALUE VALIDATION

Al ingresar al Calculation Context:

```text
validate type
validate range
validate invariants
```

---

## 180. INPUT NORMALIZATION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INPUT NORMALIZATION

Normalización debe realizarse antes de ejecutar el Concept.

No modificar inputs durante la fórmula.

---

## 181. CONTEXT LOOKUP

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONTEXT LOOKUP

API conceptual:

```ts
getInput(name)
getParameter(name)
getSnapshotValue(path)
getConceptResult(conceptId)
```

---

## 182. ACCESS CONTROL

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ACCESS CONTROL

Cada API debe comprobar que el acceso corresponde al scope y permisos del Concept.

---

## 183. PATH ACCESS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PATH ACCESS

Un path de Snapshot debe ser:

```text
declared
typed
validated
```

---

## 184. ARBITRARY PATH

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ARBITRARY PATH

No permitir:

```text
getSnapshotValue(userProvidedArbitraryPath)
```

como mecanismo genérico.

---

## 185. CONTEXT API

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONTEXT API

El Runtime debe exponer sólo operaciones necesarias.

---

## 186. NO DATABASE CONTEXT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

NO DATABASE CONTEXT

CalculationContext no contiene:

```text
database connection
repository
ORM client
```

---

## 187. NO PROVIDER OBJECT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

NO PROVIDER OBJECT

Tampoco contiene objetos Provider.

El acceso externo ocurre mediante Capability Broker.

---

## 188. CONTEXT IMMUTABILITY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONTEXT IMMUTABILITY

La configuración estructural del contexto es inmutable durante cálculo.

---

## 189. RUNTIME METADATA

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RUNTIME METADATA

Metadata operacional no debe ser visible a AEL salvo que esté definida como input.

---

## 190. EXECUTION ID

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

EXECUTION ID

No exponer automáticamente `executionId` como variable financiera.

---

## 191. CURRENT TIME

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CURRENT TIME

No exponer directamente el reloj del host.

Si es necesario:

```text
explicit currentDate/currentTime input
```

controlado por policy.

---

## 192. INTERMEDIATE RESULTS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INTERMEDIATE RESULTS

Un Concept puede generar valores intermedios:

```text
base
percentage
adjustment
subtotal
```

---

## 193. INTERMEDIATE VALUE LIFETIME

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INTERMEDIATE VALUE LIFETIME

Deben vivir sólo durante la evaluación del Concept, salvo que formen parte explícita del output.

---

## 194. INTERMEDIATE RESULT NAMING

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INTERMEDIATE RESULT NAMING

Los nombres de variables intermedias son internos.

No forman parte automáticamente del API del Concept.

---

## 195. CONCEPT OUTPUT CONTRACT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONCEPT OUTPUT CONTRACT

Cada Concept debe declarar qué resultados publica.

---

## 196. OUTPUT TYPE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT TYPE

Output debe tener tipo conocido:

```text
Money
Decimal
Integer
Boolean
Enum
Object
```

según definición.

---

## 197. MULTIPLE OUTPUTS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MULTIPLE OUTPUTS

Si un Concept produce múltiples outputs, deben tener nombres/tipos estables.

---

## 198. OUTPUT OBJECT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT OBJECT

Un Concept puede devolver:

```text
ConceptResultObject
```

con schema definido.

---

## 199. OUTPUT VALIDATION

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT VALIDATION

Antes de publicar:

```text
schema
type
financial invariants
```

deben validarse.

---

## 200. OUTPUT CURRENCY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT CURRENCY

Money outputs deben conservar currency.

---

## 201. OUTPUT ROUNDING

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT ROUNDING

No aplicar rounding implícito al publicar.

---

## 202. RESULT STORE READ CONSISTENCY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT STORE READ CONSISTENCY

Lecturas de ConceptResultStore deben ser consistentes con el Calculation Plan.

---

## 203. RESULT STORE CONCURRENCY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT STORE CONCURRENCY

Si se paralelizan conceptos, sólo deben escribirse resultados independientes.

---

## 204. WRITE CONFLICT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

WRITE CONFLICT

Dos conceptos intentando escribir la misma identidad:

```text
AEL_CALC_RESULT_WRITE_CONFLICT
```

---

## 205. RESULT OWNERSHIP

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT OWNERSHIP

Cada Concept es propietario de su resultado.

---

## 206. RESULT ACCESS GRAPH

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT ACCESS GRAPH

El planner puede construir:

```text
Concept A → Result A
Concept B → Result B
```

y autorizar accesos según edges.

---

## 207. RESULT PROVENANCE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT PROVENANCE

Cada result puede registrar:

```text
conceptId
unitId
executionId
artifactHash
snapshotHash
```

---

## 208. RESULT HASH

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT HASH

Puede calcularse:

```text
conceptResultHash
```

para auditoría/replay.

---

## 209. HASH INPUT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

HASH INPUT

Utilizar representación canónica del resultado.

---

## 210. REPLAY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

REPLAY

Mismo:

```text
Artifact
Snapshot
Parameters
Plan
```

debe producir los mismos ConceptResult cuando dependencies sean deterministas.

---

## 211. MEMORY RELEASE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MEMORY RELEASE

Al terminar un Concept:

```text
temporary values
```

deben poder liberarse.

---

## 212. UNIT CLEANUP

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

UNIT CLEANUP

Al terminar una Unit:

```text
unit locals
unit temporaries
```

deben liberarse.

---

## 213. EXECUTION CLEANUP

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

EXECUTION CLEANUP

Al terminar Execution:

```text
all mutable runtime state
```

debe quedar inaccesible.

---

## 214. MEMORY LIMITS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MEMORY LIMITS

Context stores deben respetar límites de Runtime.

---

## 215. VALUE COUNT LIMIT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

VALUE COUNT LIMIT

Puede existir:

```text
maxRuntimeValues
```

---

## 216. RESULT COUNT LIMIT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT COUNT LIMIT

Batch debe respetar:

```text
maxConceptResults
```

---

## 217. COLLECTION MEMORY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

COLLECTION MEMORY

Collections grandes deben contar contra el budget.

---

## 218. STRING MEMORY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

STRING MEMORY

Strings grandes deben contar contra el budget.

---

## 219. SECURITY

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SECURITY

No guardar secretos en CalculationContext.

---

## 220. PII

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PII

Sólo incluir PII estrictamente necesaria para cálculo.

---

## 221. SENSITIVE RESULT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SENSITIVE RESULT

Resultados financieros deben tratarse según policy de seguridad.

---

## 222. LOGGING

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

LOGGING

No loggear automáticamente:

```text
all variables
all inputs
all results
```

---

## 223. DEBUG SNAPSHOT

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

DEBUG SNAPSHOT

Debug puede capturar estado limitado, sujeto a masking.

---

## 224. MASKING

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MASKING

Datos sensibles deben poder enmascararse:

```text
owner identifiers
financial values
personal data
```

según policy.

---

## 225. ERROR DIAGNOSTICS

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ERROR DIAGNOSTICS

Un error de variable debe indicar:

```text
conceptId
symbolId
sourceSpan
errorCode
```

cuando esté disponible.

---

## 226. UNDEFINED VARIABLE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

UNDEFINED VARIABLE

```text
AEL_CALC_UNDEFINED_VARIABLE
```

---

## 227. TYPE MISMATCH

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

TYPE MISMATCH

```text
AEL_CALC_RUNTIME_TYPE_MISMATCH
```

---

## 228. INVALID VALUE

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

INVALID VALUE

```text
AEL_CALC_INVALID_VALUE
```

---

## 229. OUTPUT CONTRACT ERROR

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

OUTPUT CONTRACT ERROR

```text
AEL_CALC_OUTPUT_CONTRACT_VIOLATION
```

---

## 230. CONTEXT ACCESS ERROR

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

CONTEXT ACCESS ERROR

```text
AEL_CALC_CONTEXT_ACCESS_DENIED
```

---

## 231. BASIC VARIABLE TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

BASIC VARIABLE TEST

```text
let x = 10
return x
```

debe devolver:

```text
10
```

---

## 232. SCOPE TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SCOPE TEST

Variable de Concept A no visible en Concept B.

---

## 233. DEPENDENCY RESULT TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

DEPENDENCY RESULT TEST

B puede leer resultado de A sólo si:

```text
A → B
```

---

## 234. UNDECLARED ACCESS TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

UNDECLARED ACCESS TEST

B intenta leer C sin dependency:

```text
AEL_CALC_UNDECLARED_RESULT_ACCESS
```

---

## 235. IMMUTABILITY TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

IMMUTABILITY TEST

Intentar modificar SnapshotValue:

```text
rejected
```

---

## 236. RESULT IMMUTABILITY TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT IMMUTABILITY TEST

Modificar ConceptResult publicado:

```text
rejected
```

---

## 237. TYPE TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

TYPE TEST

Asignar Decimal a Integer:

```text
runtime/type guard failure
```

según semantics.

---

## 238. MONEY TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MONEY TEST

Mantener:

```text
amount
currency
```

durante toda la operación.

---

## 239. NULL TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

NULL TEST

Null no permitido:

```text
AEL_CALC_RUNTIME_TYPE_MISMATCH
```

o diagnostic equivalente.

---

## 240. ZERO TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

ZERO TEST

Zero debe permanecer como valor válido.

---

## 241. COLLECTION LIMIT TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

COLLECTION LIMIT TEST

Exceder colección:

```text
runtime limit
```

---

## 242. RESULT CONFLICT TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

RESULT CONFLICT TEST

Dos writers para mismo ConceptResult:

```text
AEL_CALC_RESULT_WRITE_CONFLICT
```

---

## 243. REPLAY TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

REPLAY TEST

Mismos inputs:

```text
same resultHash
```

---

## 244. MEMORY TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

MEMORY TEST

Liberar temporaries después del Concept.

---

## 245. SECURITY TEST

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

SECURITY TEST

No exponer:

```text
database client
provider
secrets
```

en CalculationContext.

---

## 246. PRINCIPIO DE AISLAMIENTO

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PRINCIPIO DE AISLAMIENTO

```text
Unit A
  ≠
Unit B
```

y:

```text
Concept A locals
  ≠
Concept B locals
```

---

## 247. PRINCIPIO DE INMUTABILIDAD

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PRINCIPIO DE INMUTABILIDAD

Inputs y resultados publicados no deben cambiar durante una ejecución.

---

## 248. PRINCIPIO DE TRAZABILIDAD

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PRINCIPIO DE TRAZABILIDAD

Cada resultado importante debe poder relacionarse con:

```text
execution
artifact
snapshot
unit
concept
```

---

## 249. PRINCIPIO FINANCIERO

> **Origen:** Motor de liquidacion_Calculation Context, Variables & Intermediate Results 67.md

PRINCIPIO FINANCIERO

Los valores monetarios no deben perder:

```text
precision
scale
currency
```

en ningún nivel del Calculation Context.

---
