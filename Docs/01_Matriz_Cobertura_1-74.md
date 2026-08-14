# Matriz de cobertura completa — 1–74 → secuencia canónica

| Canónico | Tema                                                                 | Origen                 | Secciones antes | Secciones después |
| -------: | -------------------------------------------------------------------- | ---------------------- | --------------: | ----------------: |
|       01 | AEL Language — Master, Scope & Governing Rules                       | 1                      |              65 |                65 |
|       02 | AEL Language — Formal Syntax, Operators & Control Flow               | 2, 33, 34              |             380 |               376 |
|       03 | AEL Language — Type System & Value Semantics                         | 3, 32, 55              |             410 |               408 |
|       04 | AEL Language — AST, IR, Artifact & Serialization                     | 4, 27, 36, 59, 61      |             661 |               660 |
|       05 | AEL Language — Compiler Pipeline & Semantic Analysis                 | 7, 25, 26, 38, 58      |             713 |               713 |
|       06 | AEL Runtime — Execution Semantics & Runtime Architecture             | 5, 28, 35, 39, 62      |             732 |               726 |
|       07 | AEL Contracts — Functions, Providers & Capabilities                  | 6, 18, 30, 31, 63      |             689 |               686 |
|       08 | AEL Security — Verification, Sandbox & Threat Model                  | 8, 37, 42, 60          |             620 |               619 |
|       09 | AEL Quality — Testing, Conformance & QA                              | 9, 44                  |             275 |               275 |
|       10 | AEL Developer Experience — Builder, Editor & Rule Workspace          | 10, 21                 |             262 |               262 |
|       11 | AQUILA — Integration Layer, APIs & Application Services              | 11, 13, 20, 29, 40     |             711 |               711 |
|       12 | AQUILA — Persistence, Data Model, PostgreSQL/Supabase & RLS          | 12, 19, 41             |             436 |               435 |
|       13 | AEL Platform — Deployment, Operations, Observability & Performance   | 14, 22, 47, 48, 49     |             732 |               731 |
|       14 | AEL Platform — Errors, Registry, Versioning & Compatibility          | 43, 45, 46             |             441 |               441 |
|       15 | AEL Architecture — Implementation Blueprint, Repository & Boundaries | 15, 16, 17, 23, 24, 54 |             891 |               888 |
|       16 | AEL Financial Domain — Domain Model, Numeric Semantics & Settlement  | 50, 51, 52, 53, 68     |             721 |               720 |
|       17 | Liquidation Engine — Execution Context, Snapshot & Lifecycle         | 64, 65                 |             258 |               258 |
|       18 | Liquidation Engine — Dependency Graph & Calculation Context          | 66, 67                 |             249 |               249 |
|       19 | Liquidation Engine — Allocation, Payments, Balance & Adjustments     | 69, 70, 71             |             384 |               376 |
|       20 | Liquidation Engine — Result, Explanation, Audit & Validation         | 72, 73, 74             |             397 |               394 |

## Propiedad documental

```text
Regla de negocio AQUILA
        ↓
Contrato/arquitectura AEL propietario
        ↓
Implementación
```

Una regla transversal no se redefine en otro documento. Se referencia.
