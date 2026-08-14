# Evaluación técnica de la documentación canónica AEL / AQUILA

## Auditoría de los documentos 01–24 y su articulación con la Fase I

> **Corpus evaluado:** 26 archivos · ~2,4 MB · ~110.000 líneas
> **Método:** lectura completa de la capa de gobierno (00, 01, 0AEL, 21, 22, 23, 24),
> mapa estructural de 16–20, muestreo dirigido de 12, 16 y 19, y medición cuantitativa
> sobre el corpus completo.
> **Fecha:** 2026-08-13

---

# 1. Veredicto en una página

El corpus AEL/AQUILA es **un marco normativo de calidad alta y una especificación
ejecutable incompleta**. No son lo mismo, y la diferencia es la que bloquea el proyecto.

```text
Lo que el corpus SÍ hace, y hace muy bien
   define restricciones, invariantes, vocabulario, disciplina y criterios de aceptación

Lo que el corpus NO hace
   fijar los valores concretos que la implementación necesita para existir
```

Medición que sostiene el veredicto:

| Métrica                                                                               |     Valor | Lectura                                     |
| ------------------------------------------------------------------------------------- | --------: | ------------------------------------------- |
| Secciones consolidadas (marcadas `> **Origen:**`)                                     | **9.993** | ~11 líneas por sección                      |
| Aplazamientos de definición (`debe definirse`, `según policy`, `depende del modelo`…) |   **339** | cada uno es un STOP potencial               |
| Aplazamientos solo en doc 16 (dominio financiero)                                     |    **42** | el documento más crítico es el más diferido |
| Tablas de dominio de propiedad horizontal definidas                                   |     **0** | ver §3.3                                    |
| Golden cases financieros completos                                                    |     **0** | ver §3.7                                    |
| Requisitos con ID en la matriz de trazabilidad                                        |     **0** | ver §3.10                                   |

**Conclusión operativa:** si se entrega este corpus tal cual a un agente que respete las
reglas, el agente se detendrá legítimamente en la primera decisión de redondeo monetario
y no podrá continuar. Si no se detiene, estará violando la regla de no invención. Las dos
salidas son fallo. El corpus necesita una **capa de decisiones cerradas** antes de ser
ejecutable — exactamente el mismo tratamiento que ya aplicamos a la Fase I.

---

# 2. Fortalezas — lo que hay que conservar sin tocar

## 2.1 La capa de gobierno es superior a la media de la industria

Los documentos 21–24 y el Prompt Maestro definen una disciplina que la mayoría de equipos
nunca alcanza:

```text
precedencia explícita de fuentes          (21 §3, 0AEL §3)
prohibición de invención con protocolo    (21 §7, 0AEL §6)
regla de propietario único                (21 §5)
regla anti-redundancia                    (21 §6)
protocolo STOP ante ambigüedad            (0AEL §27)
DoD basado en evidencia, no en opinión    (24 §4, §59)
prohibición de falsa terminación          (0AEL §28, 24 §58)
trazabilidad bidireccional                (22 §9-11)
```

`0AEL §28` y `24 §58` — la prohibición de declarar `DONE` sin evidencia — son la mejor
defensa que existe contra el modo de fallo característico de los agentes de IA. Esto se
conserva íntegro.

## 2.2 El núcleo financiero identifica los problemas que de verdad rompen un motor de cobros

Esto no es documentación genérica. Quien la escribió entiende ingeniería de liquidación.
El corpus cubre explícitamente:

| Problema                                                              | Dónde             | Por qué importa                                        |
| --------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| Distribución del residual por mayor resto, con desempate determinista | 19 §23–31         | Es _la_ fuente de descuadres de centavos en prorrateos |
| Snapshot congelado, prohibición de lectura viva                       | 17 §13, §25       | Sin esto no hay reproducibilidad ni auditoría          |
| `zero ≠ missing`, `null ≠ zero`                                       | 17 §60, 18 §53–54 | Colapsar ambos produce cobros fantasma                 |
| Prohibición de punto flotante                                         | 19 §19, 20 §47    | Correcto y no negociable en dinero                     |
| Prohibición de comparación por epsilon                                | 19 §94            | Evita "cuadra por poquito"                             |
| Idempotencia y liquidación duplicada                                  | 16 §84–85         | Doble cobro es el peor defecto del dominio             |
| Inmutabilidad tras finalizar; corrección por versión nueva            | 16 §68, 20 §69–72 | Historia no destructiva                                |
| Explanation derivada del Trace, sin recálculo                         | 20 §73, 0AEL §30  | Impide que la explicación sea una segunda verdad       |
| Ciclos y orden topológico con desempate estable                       | 18 §13–19         | Determinismo del plan de cálculo                       |
| No asumir `sum(coeficientes) = 1.0`                                   | 16 §82            | Matiz real del dominio, bien visto                     |

Este conjunto es el activo más valioso del proyecto. **Es la razón por la que el corpus
merece rescatarse en vez de reescribirse.**

## 2.3 El alcance de AEL está bien acotado por negación

`01 §61 NO HACER TODAVÍA` rechaza explícitamente microservicio AEL, lenguaje visual,
compilación nativa, JS/Python embebido, SQL desde AEL, HTTP libre, filesystem y
marketplace. `01 §19` excluye `TRY/CATCH`, `SWITCH`, `MATCH`, `ASYNC`, `FOR`, `FOREACH`.
Esa contención es el instinto correcto y hay que defenderla.

## 2.4 El tipado dimensional encaja con el dominio

`M2 × COP/M2 = COP` (`01 §14, §16`) no es floritura académica: atrapa la clase de error
donde alguien multiplica área por la tarifa equivocada, que en propiedad horizontal es
un error real y caro. Buena decisión de diseño.

## 2.5 El modelo de seguridad es coherente

Capacidades explícitas por Provider (`01 §24`), prohibición de `eval` (`01 §30`),
verificación de Artifact por hash (`01 §29`), límites de ejecución (`01 §31`), RLS como
segunda línea de defensa (`01 §47`), acceso cross-tenant como defecto bloqueante
(`0AEL §19`). Consistente de punta a punta.

---

# 3. Debilidades — ordenadas por impacto

## 3.1 🔴 BLOQUEANTE — El corpus prohíbe inventar exactamente lo que nunca define

Este es el hallazgo central. Es un deadlock formal, no una crítica de estilo.

`0AEL §6` y `21 §7` prohíben al agente inventar, entre otros:

```text
financial formulas · rounding rules · statuses · state transitions · roles · permissions
```

Pero el corpus nunca los define. Evidencia literal:

| Ref       | Texto                                                                                              | Qué falta                       |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------------------- |
| `16 §44`  | "Ejemplos: HALF_UP, HALF_EVEN, DOWN, UP — **según soporte**"                                       | Cuál se usa                     |
| `16 §45`  | "**Debe definirse** si el redondeo ocurre per line / per concept / per subtotal / per final total" | Dónde redondea                  |
| `16 §79`  | "La fórmula exacta **depende del modelo final**, pero debe existir como invariant"                 | El invariante central del motor |
| `16 §82`  | "debe cumplir **policy definida**"                                                                 | Cuál policy                     |
| `19 §26`  | RESIDUAL POLICY "**debe definir**: distribution method, tie breaker, maximum residual"             | Los tres valores                |
| `19 §27`  | Mayor resto: "Método **recomendado**"                                                              | Recomendado ≠ obligatorio       |
| `12 §313` | "Los roles **deben pertenecer** a un modelo de autorización explícito"                             | Los roles, enumerados           |

339 aplazamientos de este tipo en el corpus; 42 solo en el documento 16.

**Consecuencia mecánica:** el agente llega a "redondear una cuota", consulta `16 §44`,
encuentra cuatro ejemplos y ninguna decisión, consulta `0AEL §6`, ve que no puede
inventar reglas de redondeo, y ejecuta `STOP → gap → solicitar decisión`. Correcto según
las reglas. Y el proyecto no avanza.

> El corpus está escrito como si un humano con autoridad fuera a rellenar los huecos en
> tiempo real. Un agente autónomo no tiene esa autoridad — por diseño, y con razón.

## 3.2 🔴 BLOQUEANTE — Dos roadmaps contradictorios dentro del conjunto canónico

```text
01 §57  →  FASE 0-8   (Especificación · Core · Language · Runtime · AQUILA · API · Builder · Security · Pilot)
01 §62  →  Hitos 1-7
23      →  M0-M19
```

No coinciden en el orden. `01 §57` sitúa _AQUILA Integration_ en FASE 4 y _Builder_ en
FASE 6. `23` sitúa _M8 Developer Experience_ **antes** de _M9 AQUILA Integration_.

Y la precedencia lo agrava en vez de resolverlo: `21 §3` y `0AEL §3` colocan los
**documentos 01–20 por encima del documento 23**. Formalmente gana el roadmap del doc 01
— pero `21 §10` y `0AEL §25` dicen que el orden de construcción es el del doc 23.

El corpus se contradice a sí mismo sobre cuál de sus dos roadmaps manda. Esto dispara el
protocolo STOP el primer día, antes de escribir una línea.

## 3.3 🔴 BLOQUEANTE — El esquema de dominio de propiedad horizontal no existe

El documento 12 tiene 4.887 líneas sobre persistencia y nombra **8 tablas**, todas
internas de AEL:

```text
ael_rules · ael_rule_versions · ael_artifacts · ael_contracts
ael_functions · ael_executions · ael_execution_results · ael_audit_events
```

No existe tabla alguna para:

```text
copropiedad · unidad · coeficiente · propietario · periodo
concepto de cobro · novedad · pago · saldo · liquidación
```

Pero `17 §15–23` exige construir el Snapshot a partir de Unit, Owner, Concept, Rate,
Payment, Novelty, Prior Balance y Parameters. **El motor lee un snapshot de tablas que
nunca fueron especificadas.** M13 no puede arrancar.

Estos conceptos existen en el doc 16 como _semántica_ (§7 Property, §8 Unit, §10 Unit
Coefficient, §12 Period, §17 Charge Concept, §26 Novelty, §69 Payment, §72 Balance) — pero
semántica no es esquema. No hay columnas, tipos, claves, ni restricciones.

## 3.4 🟠 ALTO — El orden de construcción contradice la premisa del proyecto

Tu planteamiento: _"el núcleo de liquidación es el concepto sobre el cual se sienta toda
la lógica estructural; a partir de ese núcleo debe crecer el resto"_.

El roadmap del doc 23 hace lo contrario:

```text
M1  ─┐
M2   │
M3   │  lenguaje, compilador, artifact, runtime,
M4   │  contratos, sandbox, QA, IDE, integración,
M5   │  persistencia, operaciones
M6   │
M7   │  ← 11 milestones
M8   │
M9   │
M10  │
M11 ─┘
M12    dominio financiero      ← primer peso calculado
M13-16 motor de liquidación    ← el núcleo, al final
```

Se construye un lenguaje de programación, un compilador, una máquina virtual y un IDE
**antes** de calcular la primera cuota. Riesgos concretos:

- Si el diseño de AEL no encaja con los casos reales de liquidación, se descubre en
  M13–M15 y el retrabajo golpea M1–M5.
- Cero valor demostrable durante los primeros 11 milestones.
- El corpus no contiene ni un solo caso de liquidación completo contra el que validar el
  diseño del lenguaje antes de construirlo (§3.7).

## 3.5 🟠 ALTO — Fragmentación extrema: el corpus no cabe en ningún agente

```text
9.993 secciones / ~110.000 líneas  ≈  11 líneas por sección
```

De esas 11, ~4 son estructura (título, línea `Origen:`, separador, línea en blanco).
El contenido real por sección son 4–6 líneas.

Consecuencias:

- El doc 15 solo tiene 10.567 líneas. Los docs 16–20 juntos, 18.500.
- `0AEL §2` ordena leer `01 → … → 24` antes de implementar. Es materialmente imposible
  dentro de una ventana de contexto junto con el código.
- La instrucción "leer los documentos aplicables" se vuelve inaplicable, y el agente
  leerá fragmentos — el peor escenario para un corpus cuyo valor está en los invariantes
  dispersos.

El origen es visible: cada sección arrastra `> **Origen:** …NN.md`. El corpus es una
consolidación mecánica de los 74 documentos históricos, sección por sección, sin fusión
semántica.

## 3.6 🟠 ALTO — El corpus viola su propia regla anti-redundancia

`22 §Propiedad documental`: _"Una regla transversal no se redefine en otro documento. Se
referencia."_ Sin embargo:

| Regla                         | Aparece en                                      |
| ----------------------------- | ----------------------------------------------- |
| Redondeo                      | `16 §44-46`, `19 §21-22`, `19 §74`, `20 §47`    |
| Consistencia de moneda        | `16 §41`, `19 §38-39`, `20 §32-34`              |
| Aislamiento multitenant       | `01 §47`, `08`, `12 §320`, `20 §85`, `0AEL §19` |
| Inmutabilidad histórica       | `16 §68`, `16 §111`, `20 §69-72`                |
| Prohibición de punto flotante | `19 §19`, `19 §96`, `20 §47`                    |

El agente recibe varias formulaciones parciales de la misma regla sin un propietario
único — precisamente el modo de fallo que la regla pretendía evitar.

## 3.7 🟠 ALTO — No existe ningún caso dorado financiero

El único caso numérico completo del corpus es `01 §52`:

```text
120.50 M2 × 4500 COP/M2 = 542250 COP
```

No hay ningún caso que atraviese: edificio con N unidades → coeficientes → concepto
prorrateado → novedad a mitad de periodo → pago parcial → interés de mora →
reconciliación → resultado.

Pero `24 §20` exige _"Financial Golden Cases reproducibles"_ y `23 §33` los convierte en
**gate obligatorio antes de M17**. El criterio de aceptación referencia artefactos que
nunca fueron escritos. El gate es vacío.

## 3.8 🟡 MEDIO — Cuestionar el tamaño de AEL antes de construirlo

Necesidad declarada: _que cada copropiedad defina por fórmula sus ítems de cobro
facturables._

AEL tal como está especificado es un lenguaje completo: lexer, parser, AST, analizador
semántico, IR, artifact tipo bytecode, verificador, VM con value stack + call stack +
instruction pointer, sistema de capacidades, álgebra dimensional, más un IDE con
autocompletado e inspector. Es un proyecto de 12–18 meses de equipo competente antes de
la primera factura.

Observación técnica concreta: `01 §19` ya prohíbe `FOR`/`FOREACH`/`TRY`/`MATCH`. **El
único constructo que obliga a una VM real con límite de instrucciones es `MIENTRAS`.**
Sin `MIENTRAS`, el lenguaje colapsa a un evaluador de expresiones sobre un DAG — que es
exactamente lo que el grafo de dependencias del doc 18 ya modela. Se conservan
determinismo, tipado dimensional, trazabilidad y auditoría; se elimina el compilador, el
bytecode, el verificador y la máquina virtual.

Esto no es una recomendación de recortar calidad: es señalar que hay una vía que entrega
la misma garantía financiera mucho antes. **Merece decisión explícita, no aceptación
silenciosa.**

## 3.9 🟡 MEDIO — El corpus es jurídicamente neutro, y el producto no puede serlo

No hay ninguna referencia al marco legal colombiano de propiedad horizontal. Para un
producto de PH en Colombia hay al menos tres puntos que alguien debe decidir si se
codifican como invariantes o se dejan como parámetros:

```text
coeficientes de copropiedad y su suma
fondo de imprevistos
tope de interés moratorio
```

`16 §82` acierta al no asumir `sum(coeficientes) = 1.0`, pero la razón por la que podría
tener que serlo es legal, y el corpus no la menciona.

> **A verificar con tu responsable legal/de dominio** antes de fijarlo en el motor — no
> tomes los tres puntos anteriores como afirmación normativa de mi parte, sino como
> preguntas abiertas que el corpus no formula.

## 3.10 🟡 MEDIO — La matriz de trazabilidad es una plantilla vacía

El doc 22 dedica 891 líneas a definir cómo funciona la trazabilidad. Su tabla de
requisitos (§34) tiene 19 filas de ejemplo y está explícitamente etiquetada como
_"un modelo; los IDs definitivos deben derivarse del catálogo aprobado"_.

Es decir: **cero requisitos reales con ID**. Y `24 §57` condiciona la release a
_"Document 22 coverage complete"_ — cobertura completa de un conjunto vacío. El gate más
importante del cierre es tautológico.

## 3.11 🟢 BAJO — Inconsistencias menores

- El doc `00_GUIA` (raíz) instruye colocar primero `AEL_AQUILA_PROMPT_MAESTRO_FINAL_V1.md`.
  El archivo que existe se llama `0AEL_AQUILA_PROMPT_MAESTRO_INICIAL_V1.md` (_INICIAL_, no
  _FINAL_), y su encabezado interno dice "PROMPT MAESTRO FINAL". Tres nombres para un
  archivo.
- `01_Matriz_Cobertura_1-74.md` comparte prefijo `01` con
  `01_AEL_Language_-_Master_Scope`. Colisión de numeración.
- El doc 01 cierra con "base consolidada para continuar con la especificación formal…
  que será el siguiente documento definitivo antes de iniciar la implementación", lo que
  sugiere que el doc 01 se redactó como borrador previo y quedó canonizado sin revisar.

---

# 4. Articulación con la Fase I

## 4.1 El problema de encaje

Los dos cuerpos documentales están en **altitudes y madurez distintas**:

```text
PROMPT_MAESTRO_FASE1.md          Docs/01-24
─────────────────────────        ─────────────────────────
decisiones cerradas              restricciones abiertas
esquema con columnas             semántica sin esquema
8 gaps resueltos                 339 aplazamientos
ejecutable hoy                   requiere capa de decisión
auth + tenant + dashboard        lenguaje + motor financiero
```

No compiten: la Fase I es el _sustrato de identidad y aislamiento_; AEL es el _motor de
negocio_. Pero hay tres colisiones concretas que resolver.

## 4.2 Colisiones concretas detectadas

| #   | Colisión              | Fase I dice                                                                                            | Docs 01–24 dicen                                                                               | Resolución propuesta                                                                                                                            |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Modelo de roles**   | `agent`/`auditor`/`guest` en `memberships.role`, `admin` de plataforma en `profiles.is_platform_admin` | `12 §313-319` exige "modelo explícito" sin enumerarlo; `01 §43` define 9 permisos `AEL_RULE_*` | Los permisos `AEL_RULE_*` se **añaden** a la matriz de Fase I como permisos de tenant del rol `agent`. No se crea un segundo modelo de roles.   |
| C2  | **Nombre del tenant** | `tenants` = copropiedad                                                                                | `16 §6` Tenant y `16 §7` Property/Copropiedad son **entidades distintas**                      | Decisión requerida: ¿un tenant = una copropiedad, o un tenant = una administradora con N copropiedades? Cambia todo el modelo de datos. Ver §6. |
| C3  | **Auditoría**         | `audit_log` con retención 24 meses                                                                     | `ael_audit_events` (`12`), más `20 §77` Audit del resultado                                    | Un solo `audit_log` particionado por dominio, no tres tablas. Propietario único: Fase I.                                                        |

C2 es la más grave y la trato como decisión bloqueante (§6).

## 4.3 Lo que la Fase I aporta al corpus

La Fase I ya resolvió, para su alcance, el problema que bloquea al corpus: **convirtió
aplazamientos en decisiones cerradas** (AD-01…AD-11, GAP-01…GAP-09). El mismo método es
la cura para los 339 aplazamientos de los docs 01–24.

---

# 5. Plan de implementación propuesto

## 5.1 Principio del reordenamiento

Invertir el roadmap para que **el núcleo de liquidación se construya primero contra
conceptos definidos en código**, y el lenguaje crezca después _sustituyendo_ esos
conceptos — no precediéndolos.

```text
Roadmap actual (doc 23)          Roadmap propuesto
──────────────────────           ─────────────────
lenguaje → … → motor             motor → lenguaje
11 milestones sin valor          valor demostrable en F4
AEL validado en M15              AEL validado contra motor real en F5
retrabajo golpea M1-M5           retrabajo aislado en F5
```

## 5.2 Fases

| Fase   | Contenido                                                                                                     | Entregable demostrable                                                                 | Docs fuente                    |
| ------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| **F0** | Fundación: monorepo, TS strict, CI, Supabase local                                                            | build verde                                                                            | `15`, Fase I E0                |
| **F1** | Identidad: auth, tenant, membresías, RBAC, RLS                                                                | login + aislamiento probado                                                            | **PROMPT_MAESTRO_FASE1** E1–E4 |
| **F2** | **Esquema de dominio PH** — el hueco del §3.3                                                                 | copropiedad, unidad, coeficiente, propietario, periodo, concepto, novedad, pago, saldo | `16 §6-30` + diseño nuevo      |
| **F3** | **Kernel financiero puro** — Money, Decimal, redondeo, allocation con residual, invariantes de reconciliación | golden cases verdes, sin BD ni lenguaje                                                | `16`, `19`                     |
| **F4** | **Motor de liquidación con conceptos en código** — snapshot, grafo, cálculo, resultado, trace, finalización   | **primera liquidación real de una copropiedad**                                        | `17`, `18`, `19`, `20`         |
| **F5** | **AEL v0 — evaluador de expresiones** (sin `MIENTRAS`), sustituye los conceptos en código                     | una copropiedad define su cuota por fórmula                                            | `01-03`, `07`, `18`            |
| **F6** | AEL v1 — artifact, verificador, versionado, publicación _(solo si F5 demuestra la necesidad)_                 | regla publicada e inmutable                                                            | `04`, `05`, `06`, `08`, `14`   |
| **F7** | Builder / IDE                                                                                                 | editor con diagnósticos y simulación                                                   | `10`                           |
| **F8** | Hardening, observabilidad, producción                                                                         | gates de `24`                                                                          | `13`, `09`, `24`               |

**Puerta crítica:** F4 no cierra sin un golden case de liquidación completo que reconcilie.
F5 no arranca sin F4 cerrado — así el lenguaje se diseña contra un motor que ya funciona.

## 5.3 Por qué F4 es el punto de inflexión

Al cerrar F4 existe un producto **demostrable y vendible**: liquidación de una
copropiedad real, con coeficientes, prorrateo, pagos, saldos, resultado auditable y
reconciliación — con los conceptos de cobro definidos en TypeScript.

A partir de ahí, AEL no es una apuesta: es un reemplazo incremental de algo que ya
funciona, validado contra golden cases existentes.

---

# 6. Decisiones bloqueantes — requieren tu respuesta

Ninguna puede resolverse por inferencia. Cada una bloquea la fase indicada.

| ID       | Decisión                                                                                                                                                     | Bloquea                          | Ref         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ----------- |
| **D-01** | **Alcance de AEL**: ¿lenguaje completo con compilador y VM (roadmap actual), o evaluador de expresiones primero y compilador solo si se demuestra necesario? | F5, F6                           | §3.8        |
| **D-02** | **Tenant vs Copropiedad**: ¿un tenant _es_ una copropiedad, o un tenant es una administradora que gestiona N copropiedades?                                  | F1, F2 — todo el modelo de datos | §4.2 C2     |
| **D-03** | **Política de redondeo**: modo (`HALF_UP`/`HALF_EVEN`), ubicación (por línea / concepto / subtotal / total) y decimales para COP                             | F3, F4                           | `16 §44-45` |
| **D-04** | **Política de residual**: ¿mayor resto con desempate por `targetId` ascendente, y residual máximo tolerado?                                                  | F3                               | `19 §26-30` |
| **D-05** | **Orden de imputación de pagos**: ¿interés → capital antiguo → capital nuevo, u otro?                                                                        | F4                               | `16 §71`    |
| **D-06** | **Fórmula del invariante financiero** (`16 §79`): confirmar o corregir `neto = cargos − descuentos + impuestos + interés + débitos − créditos`               | F3, F4                           | `16 §79`    |
| **D-07** | **Marco legal**: ¿se codifican restricciones de Ley 675 como invariantes del motor, o quedan como parámetros por copropiedad?                                | F2, F3                           | §3.9        |

D-01 y D-02 son las que más cambian el plan. Las demás son parametrizaciones que puedo
proponer con valores por defecto razonables si prefieres cerrarlas rápido.

---

# 7. Recomendaciones sobre el corpus documental

## 7.1 No reescribir — añadir una capa de decisión

Los docs 01–24 se conservan como **referencia normativa**. Encima se añade un documento
nuevo, corto y vinculante:

```text
25_DECISIONES_CERRADAS.md
   ├── resuelve los 339 aplazamientos que afecten al alcance activo
   ├── formato: ID · pregunta · decisión · justificación · documento afectado
   └── precedencia: por ENCIMA de 01-20 (es la capa que los completa)
```

Esto respeta `0AEL §36` ("no crear automáticamente un nuevo documento" — aquí sí está
justificado: es una responsabilidad nueva y real) y resuelve el deadlock sin tocar
9.993 secciones.

## 7.2 Resolver la contradicción de roadmaps

Derogar formalmente `01 §57` y `01 §62` (los dos roadmaps embebidos en el doc 01) y
dejar un único roadmap vigente. Sin esto, el conflicto de precedencia de §3.2 persiste.

## 7.3 Crear el documento de esquema de dominio

El hueco de §3.3 no se cubre con una decisión: hay que diseñar el esquema PH
(copropiedad, unidad, coeficiente, propietario, periodo, concepto, novedad, pago, saldo)
con columnas, tipos, claves y RLS. Es trabajo de F2 y su salida debe quedar documentada
como propietaria — nadie más define esas tablas.

## 7.4 Escribir el primer golden case antes de escribir el motor

Un caso completo, con números reales de una copropiedad pequeña (6–10 unidades),
calculado a mano y firmado por el responsable funcional. Ese caso es el contrato
ejecutable del motor y hoy no existe. Sin él, `23 §33` y `24 §20` son inaplicables.

## 7.5 Índice navegable por invariante

Dado que el corpus no cabe en contexto, generar un índice que mapee
`invariante → documento → sección`, para que el agente cargue solo las secciones
aplicables a la unidad de trabajo en curso. Es la única forma de que la regla "leer los
documentos aplicables" sea cumplible.

---

# 8. Resumen ejecutivo

```text
QUÉ ESTÁ BIEN
  · disciplina de gobierno superior a la media
  · el núcleo financiero identifica los problemas correctos y difíciles
  · alcance de AEL acotado por negación
  · seguridad coherente de punta a punta

QUÉ BLOQUEA
  · prohíbe inventar lo que nunca define        → 339 aplazamientos
  · dos roadmaps contradictorios y canónicos    → STOP el día 1
  · el esquema de dominio PH no existe          → M13 no puede arrancar

QUÉ CAMBIAR
  · invertir el orden: motor primero, lenguaje después
  · cerrar 7 decisiones bloqueantes
  · añadir doc 25 de decisiones, no reescribir el corpus
  · escribir un golden case antes que el motor

QUÉ HACE FALTA DE TI AHORA
  · D-01  alcance de AEL
  · D-02  tenant = copropiedad, o tenant = administradora
  · D-03 a D-07  parámetros financieros y marco legal
```

> El corpus no está mal escrito. Está **escrito para un lector con autoridad para decidir
> sobre la marcha** — y se va a entregar a un agente que, correctamente, no la tiene.
> Cerrar esas decisiones es todo lo que separa este corpus de ser ejecutable.
