# Módulo de Fondos — BLOQUE A: diagnóstico y compatibilidad

**Fecha:** 2026-09-04
**Entrada normativa:** `Casos de uso/Fondos/Modelo_Maestro_Fondos_AQUILA.md` v1.0 +
`Casos de uso/Fondos/Prompt_Maestro_Modulo_Fondos_AQUILA.md` v1.0 (+ 4 mockups)
**Alcance de este documento:** FND-PR-01 … FND-PR-18. **No implementa nada.**

---

## 0. Veredicto

El Modelo Maestro **no es incompatible con AQUILA — es mucho más grande que AQUILA**.

Tres hechos gobiernan todo lo demás:

1. **`fondos` y `fondo_movimientos` ya existen desde F2** (14-08-2026), con RLS, trigger de
   saldo derivado, append-only y puente contable. No hay que crearlas: hay que **evolucionarlas**.
2. **Están muertas.** Nadie escribe un solo `fondo_movimientos` en todo el repo: ni una Edge
   Function, ni un store, ni una RPC, ni el motor de liquidación. En la base de dev hay **0 filas
   de movimientos** y **1 sola fila de `fondos`** (la del seed GC-001) entre ~170 tenants.
3. **La mitad del ciclo que el Modelo exige depende de dominios que AQUILA no tiene**: cuentas por
   pagar, proveedores, pagos salientes, contratos, proyectos e instrumentos financieros. No están
   "a medias": no existen.

Y un bloqueo de gobernanza que hay que resolver **antes** de tocar el esquema (§5 de este
documento).

---

## 1. Inventario factual: qué hay hoy

### 1.1 El núcleo de fondos

| Objeto | Dónde | Estado |
|---|---|---|
| `public.fondos` | `20260814100100_domain_tables.sql:318` | Existe |
| `public.fondo_movimientos` | íd. `:338` | Existe, **sin una sola fila** |
| `fondo_tipo_t` = `('imprevistos','otro')` | `20260814100000_domain_enums.sql:46` | Existe |
| `fondo_movimiento_tipo_t` = `('aporte','uso')` | íd. `:48` | Existe |
| `fondo_base_calculo_t` = `('presupuesto_anual','cuota_administracion')` | íd. `:38` | Existe |
| `fondos.contable_cuenta_id` | `20260830460000_contable_puentes_mapeo.sql:152` | Existe (1:1, grupo 11) |
| trigger `recalcular_saldo_fondo` | `20260814100300_domain_triggers.sql:190` | `after insert` únicamente |
| trigger `fondo_movimientos_append_only` | íd. `:214` | Existe (`forbid_mutation`) |
| unique parcial `fondos_imprevistos_unico` | `..100100:334` | **1 fondo de imprevistos por tenant** |
| RLS + FORCE en ambas | `..100100:330`, `:355` | Existe |
| Policies | `20260814100200_domain_rls_policies.sql:238-258` | select miembro / select agent+auditor / insert agent. **Sin UPDATE ni DELETE** |
| Gate de rol funcional (`modulo = 'financiero'`) | `20260830130000_roles_funcionales_enforcement.sql` | Ambas tablas ya están detrás de `puede_ver_modulo` |

Columnas reales de `fondos`: `id, tenant_id, tipo, nombre, saldo_actual, contable_cuenta_id,
created_at, updated_at`. **Nada más.**

Columnas reales de `fondo_movimientos`: `id, tenant_id, fondo_id, tipo, monto (>0), periodo_id,
liquidacion_id, descripcion, autorizado_por, created_at`.

### 1.2 Lo que ya está enganchado alrededor

- **Política financiera**: `politicas_financieras.fondo_imprevistos_porcentaje` y
  `fondo_imprevistos_base`, versionadas e inmutables, con UI en
  `components/politicas/PoliticasVersionDrawer.vue`.
- **Presupuesto**: `fuente_financiacion` con tipo `fondo_imprevistos`
  (`20260814200000_motor_presupuestal_financiacion.sql`, hoy vía `lista_tipos`), y el guard
  **FI-003** que rechaza declarar más de `fondos.saldo_actual`
  (`FONDO_INSUFICIENTE` / `FONDO_IMPREVISTOS_NO_EXISTE`).
- **AEL / liquidación**: parámetro `FONDO_IMPREVISTOS_ANUAL` disponible en el snapshot
  (`packages/liquidation-engine/src/snapshot-supabase.ts:464`), resuelto como Σ
  `fuente_financiacion.valor_aplicado`. Ninguna fórmula está obligada a usarlo. Es **el uso del
  fondo, no el aporte**.
- **Cuenta presupuestal de ingreso** `ing_fondo_imprevistos` → PUC `4115`, ya sembrada
  (`20260830550000_presupuesto_cuenta_plantilla_semilla.sql:111`). Un concepto puede colgarse de
  ella vía `conceptos.presupuesto_cuenta_id` — pero cobrar por esa cuenta **no genera ninguna fila
  en `fondo_movimientos`**: el circuito termina en el cargo y en la proyección contable.
- **Contabilidad (PC-1..PC-9)** — la parte mejor resuelta:
  - Doctrina **cerrada y correcta**: CTCP Concepto 0146/2025 → el fondo **no es pasivo ni
    patrimonio, es efectivo restringido**. Los grupos `27` y `32` fueron eliminados del PUC y
    están en `contable_codigo_retirado` (`20260830440000_contable_puc_fondo_imprevistos.sql`).
  - Cuentas con `requiere_fondo = true`: `111015`, `111020` (opcional), `1315`, `4115`, `4605`.
  - `contable_movimientos()` — bloque D — **ya deriva partida doble desde `fondo_movimientos`**
    y expone `fondo_id` como dimensión de salida.
- **Reutilizable sin tocar**: `documentos` (versionado, append-only, 7 buckets de Storage, actas
  como `TIPO_DOCUMENTO` en `lista_tipos`), `audit_log`, el módulo de auditoría interna (15 tablas),
  `cuentas_bancarias`, conciliación bancaria (`extracto_bancario` / `extracto_linea` /
  `conciliacion_propuesta` + 2 Edge Functions + matching difuso).

### 1.3 Lo que NO existe

**Del dominio fondos** (todas las entidades del Modelo Maestro §32 salvo dos):
`fondos_tipos`, `fondos_autorizaciones`, `fondos_fuentes`, `fondos_reglas`, `fondos_compromisos`,
`fondos_solicitudes_uso`, `fondos_instrumentos`, `fondos_remanentes`, `fondos_cierres`,
`fondos_alertas`. Tampoco existen en `fondos` las columnas `codigo`, `estado`, `objetivo`,
`destinacion`, `meta`, `fecha_inicio`, `fecha_fin`, `permanente`, `documento_principal_id`.

**Sin UI**: cero páginas, cero stores, cero ítems en `utils/navegacion.ts`. El único consumidor en
todo el frontend es `stores/presupuesto.ts:413` (`cargarFondoImprevistos`, lee `saldo_actual`), con
un comentario que dice literalmente que un solo consumidor no justifica un store propio.

**De los dominios de los que depende el ciclo completo:**

| Dominio | Veredicto | Evidencia |
|---|---|---|
| Cuentas por pagar / proveedores / egresos | **No existe** | Cero tablas. `proveedor` solo aparece como rótulo del PUC (`2205`, `2210`) y como enum de pasarela de pago |
| Pagos salientes | **Imposible hoy** | `pagos` tiene `check (monto > 0)` y `inmueble_id NOT NULL`: estructuralmente solo entrante |
| Contratos / proyectos / obras | **No existe** | `contrato` es solo un valor de `TIPO_DOCUMENTO_PREDIO` |
| Instrumentos financieros / CDT | **No existe** | Nada |
| Rendimientos financieros | **No existe** | La cuenta `4605` está en el PUC, pero nada la alimenta |
| Notificaciones in-app / alertas persistidas | **No existe** | Solo envío de cobranza (email/SMS) y alertas de cartera calculadas al vuelo |
| Conciliación bancaria — UI | **Falta** | Backend completo, sin página ni store |

---

## 2. Los 18 prerrequisitos

| ID | Prerrequisito | Resultado |
|---|---|---|
| FND-PR-01 | Auditar `fondos` | ✅ §1.1. Tabla mínima: 8 columnas, 1 tipo útil, sin estado |
| FND-PR-02 | Auditar `fondo_movimientos` | ✅ §1.1. Append-only correcto, 2 tipos, 0 filas |
| FND-PR-03 | Auditar triggers/funciones de saldo | ⚠️ `recalcular_saldo_fondo` solo dispara `after insert`; `saldo_actual` es escribible por fuera. Ver §4.1 |
| FND-PR-04 | Auditar inmutabilidad | ✅ `forbid_mutation` en `before update or delete` — sólida |
| FND-PR-05 | Integración con liquidación | ⚠️ Solo lectura: `FONDO_IMPREVISTOS_ANUAL`. **No hay concepto que cobre la cuota del fondo** |
| FND-PR-06 | Integración con Estado de cuenta | ❌ Ninguna |
| FND-PR-07 | Integración con recaudo | ❌ Ninguna. Un pago nunca alimenta un fondo |
| FND-PR-08 | Cuentas bancarias | ⚠️ Existen como ficha (`es_recaudo`, sin saldos ni libro). Sin relación con `fondos` |
| FND-PR-09 | Conciliación bancaria | ⚠️ Backend completo, **sin UI**. Consumible desde fondos |
| FND-PR-10 | Presupuesto y fuentes | ✅ `fuente_financiacion` + FI-003. Sin FK a `fondos` (ver §4.5) |
| FND-PR-11 | Contabilidad y dimensión `fondo_id` | ⚠️ La dimensión existe como **salida de proyección**, no como columna física. `requiere_fondo` no lo valida nadie (§4.3) |
| FND-PR-12 | Documentos / actas | ✅ Reutilizable tal cual |
| FND-PR-13 | Permisos / RLS | ⚠️ RLS sólida. Permisos: matriz de **12 genéricos** (`data:*`, `settings:manage`, `audit:view`), sin permisos por módulo (§4.8) |
| FND-PR-14 | Auditoría / trazabilidad | ✅ `audit_log` (escrito a mano, sin trigger genérico) + módulo de auditoría interna |
| FND-PR-15 | Referencias a `fondo_imprevistos` | ✅ 6 focos: enum `fondo_tipo_t`, `politicas_financieras` (2 col.), `fuente_financiacion`, 3 eventos contables, `FONDO_IMPREVISTOS_ANUAL`, `presupuesto.ts::cargarFondoImprevistos` |
| FND-PR-16 | Lógica que asume un solo fondo | ⚠️ **Sí, en 4 lugares**: `fondos_imprevistos_unico`, el guard FI-003 (busca por `tipo='imprevistos'`, no por id), `cargarFondoImprevistos`, backfill `contable_cuenta_id` |
| FND-PR-17 | Datos a migrar | ✅ **Prácticamente ninguno**: 1 fila de `fondos`, 0 de `fondo_movimientos`. La migración es barata *hoy* |
| FND-PR-18 | Compatibilidad hacia atrás | ⚠️ Solo FI-003 y la proyección contable rompen si cambia el modelo. Ambos son puntos únicos |

**Ningún prerrequisito crítico queda sin resolver.** Pero cuatro hallazgos (§4) deben cerrarse
antes o durante el bloque B.

---

## 3. Contraste: Modelo Maestro ↔ repositorio

| Exigencia del Modelo | Realidad AQUILA | Veredicto |
|---|---|---|
| §48 Fondo ≠ patrimonio ≠ pasivo | CTCP 0146/2025 ya aplicado, `27`/`32` retirados del PUC | ✅ **Ya cerrado, y mejor argumentado que el propio Modelo** |
| §29 Fondo como dimensión analítica | `fondo_id` sale de `contable_movimientos()`; `requiere_fondo` existe | ✅ Dirección correcta |
| §2.1 Imprevistos ≠ fondo genérico | El enum los distingue (`imprevistos` / `otro`) pero **todo lo demás es igual** | ⚠️ Distinción nominal, sin reglas propias |
| §4 Catálogo de tipos parametrizable | `CREATE TYPE ... AS ENUM` de 2 valores | ❌ Choca — y **D-24 exige `lista_tipos`**, no un enum |
| §5 8 estados de ciclo de vida | Sin columna `estado` | ❌ Falta entero |
| §11 8 tipos de movimiento | Enum de 2 (`aporte`, `uso`) | ❌ Falta |
| §14 Comprometido ≠ disponible | No existe el concepto | ❌ Falta — es el corazón del Modelo |
| §13 Solicitud de uso con flujo de aprobación | No existe | ❌ Falta |
| §16/§21 Varios fondos comparten cuenta bancaria | `fondos.contable_cuenta_id` es **1:1** | ⚠️ Choca al escalar (§4.7) |
| §17 Rendimientos ≠ aportes | No existen rendimientos | ❌ Falta |
| §27 Fondo → CxP → pago → banco | No hay CxP ni pagos salientes | 🚫 **Bloqueado por dominio inexistente** |
| §20 Fondos para proyectos | No hay proyectos | 🚫 Bloqueado |
| §23 Fondo como fuente presupuestal | `fuente_financiacion` ✅ | ✅ Ya existe |
| §24/§26 Regla → liquidación → cargo → recaudo → fondo | El circuito **no está conectado** en ningún punto | ❌ Falta entero |
| §28 Conciliación fondo vs banco | Conciliación bancaria existe (sin UI) | ⚠️ Consumible |
| §35 `tenant_id` + ENABLE + FORCE RLS | Es el estándar del repo desde F1 | ✅ |
| §36 10 permisos `fondos.*` | Matriz de 12 permisos genéricos, T-MATRIX la congela | ⚠️ Requiere decisión (§4.8) |
| §37 Menú "Finanzas → Fondos" | No existe grupo Finanzas. Módulo funcional `financiero` sí | ⚠️ Adaptable |
| §64 Usar notificaciones existentes | No hay sistema de notificaciones in-app | ❌ Falta |

### 3.1 Errores del prompt maestro que confirman que se escribió sin mirar el repo

- Dice **"Nuxt 3/Vue 3"**; el repo es **Nuxt 4** (D-15, explícito porque los docs viejos también
  decían 3).
- Nombra la tabla **`fondos_movimientos`**; la real es **`fondo_movimientos`** (singular).
- Propone **`solicitud_uso_fondo`** y **`fondos_tipos`** como tablas nuevas sin saber que
  `lista_tipos` es el mecanismo obligatorio de catálogo (D-24).
- Asume que existe un módulo de CxP/Pagos "cuando exista" — no existe, y eso invalida los
  bloques H, y buena parte de M y N.

Esto no invalida el Modelo: su §2 ("inspeccionar antes de cambiar") ya anticipa exactamente esto.
Pero sí significa que **el orden de bloques §68 no se puede seguir literalmente**.

---

## 4. Hallazgos: lo que está roto hoy

### 4.1 🔴 R8 está violado en datos reales

`PLAN_MAESTRO_IMPLEMENTACION.md` §6.7 declara la invariante
`R8: fondo.saldo_actual = Σ fondo_movimientos` y la matriz §10 la marca **Accepted**.

En la base de desarrollo, el tenant *JARDINES DE BABILONIA*:

```
fondos.saldo_actual = 250.000
Σ fondo_movimientos = 0        (0 filas)
```

Causa: `recalcular_saldo_fondo` solo dispara `after insert on fondo_movimientos`. El campo se
puede escribir directamente y **algo lo escribió** — casi con certeza a mano, para poder probar
FI-003, que valida contra ese mismo campo. `fn_resetear_copropiedad` también hace
`update public.fondos set saldo_actual = 0` (`20260928120000:87`).

Consecuencia: el único guard de negocio real que hoy consume fondos (FI-003, que **bloquea un
presupuesto**) depende de un número que nadie reconcilia. El Modelo Maestro §34 y §45 lo prohíben
explícitamente ("no hacer de `saldo_actual` la fuente primaria de verdad"; "no aprobar si el saldo
puede alterarse libremente").

### 4.2 🔴 Ninguna copropiedad real tiene fondo de imprevistos

De ~170 tenants en dev, **exactamente uno** tiene fila en `fondos`: el del seed GC-001. El alta de
copropiedad no lo crea (`insert into public.fondos` aparece una sola vez en todo el repo, en
`20260814100400_seed_gc001.sql:130`).

La Ley 675 art. 35 lo hace obligatorio (salvo la excepción VIS/VIP de ≤5 unidades, Ley 2079/2021).
Hoy cualquier copropiedad creada por la UI que intente usar el fondo como fuente de financiación
recibe `FONDO_IMPREVISTOS_NO_EXISTE`.

### 4.3 🟠 `requiere_fondo` es metadato muerto

Existe en `contable_plan_cuenta` y `contable_cuenta`, se copia al instanciar el plan, se edita en
`ContabilidadCuentaDrawer.vue` y se pinta como badge en `plan-de-cuentas.vue`. **Ningún trigger,
check ni función lo lee.** El comentario de la migración anuncia un guard que nunca se escribió.

### 4.4 🟠 Tres eventos contables sembrados y no consumidos

`CARTERA_FONDO_IMPREVISTOS` → `1315`, `INGRESO_FONDO_IMPREVISTOS` → `4115` y
`FONDO_IMPREVISTOS_EFECTIVO` → `111015` están en `contable_cuenta_default` (y en
`fn_sembrar_cuentas_default`), pero el CTE `d` de `contable_movimientos()` solo extrae 8 eventos y
ninguno de esos tres. El bloque D usa `f.contable_cuenta_id` y `d.banco_recaudo` directamente.

Es decir: **la contabilidad del fondo está diseñada pero solo medio cableada.**

### 4.5 🟠 `fuente_financiacion` no apunta a un fondo

No tiene FK `fondo_id`. El guard resuelve "el fondo" con
`where tenant_id = ... and tipo = 'imprevistos'`. Con N fondos eso deja de tener sentido.

### 4.6 🟠 El circuito de cobro del fondo no existe

No hay concepto, ni regla AEL, ni cargo, ni imputación de recaudo que alimente el fondo.

Las dos columnas de `politicas_financieras` (`fondo_imprevistos_porcentaje`,
`fondo_imprevistos_base`) son **parámetros que nadie lee**: el snapshot del motor selecciona
literalmente `.select('redondeo_modo, redondeo_escala')`
(`packages/liquidation-engine/src/snapshot-supabase.ts:386`) y expone
`politica: { redondeoModo, redondeoEscala }` y nada más. Sus únicos consumidores son el drawer que
las captura y la página que las muestra.

El §42 del Modelo (presupuesto → base → regla → liquidación → cargo → estado de cuenta → recaudo →
aporte → banco → conciliación → saldo) está roto en el primer eslabón.

Y el otro extremo también: `fuente_financiacion` de tipo `fondo_imprevistos` **no descuenta nada**.
`guard_presupuesto_reconciliado()` la trata como **tope**
(`Σ valor_aplicado <= monto_total` → `FINANCIACION_EXCEDE_PRESUPUESTO`), no como resta, y el guard
FI-003 no tiene ninguna rama que inserte un movimiento de tipo `uso`. Combinado con §4.2, en una
copropiedad real el saldo es 0 y **toda fuente de este tipo con valor > 0 se rechaza**.

### 4.7 🟡 `fondos.contable_cuenta_id` 1:1 contradice §16/§30 del Modelo

Hoy cada fondo apunta a **una** cuenta de efectivo del grupo 11. Funciona con un fondo. Con seis
fondos y una sola cuenta bancaria (el caso realista, "unidad de caja") obliga a abrir un auxiliar
del PUC por fondo — que es exactamente el "Fondo = cuenta contable" que el Modelo §41 prohíbe. La
alternativa correcta es la que el propio PC_01 §3.2 ya enuncia: **la trazabilidad la da la
dimensión `fondo_id`, no la cuenta**.

### 4.8 🟡 Los 10 permisos `fondos.*` no encajan en la matriz actual

`apps/web/app/types/permissions.ts` define 12 permisos genéricos, cobertura de test exigida al
**100 %**, y `tests/rbac/t-matrix.test.ts` falla si el TS y las policies RLS divergen. Añadir
`fondos.ver`/`fondos.autorizar`/… significa reescribir la matriz entera y sus policies. La
alternativa nativa del repo es: `data:read`/`data:create`/`settings:manage` + un **módulo de rol
funcional** `fondos` (o reutilizar `financiero`, donde `fondos` ya está).

---

## 5. 🔴 Bloqueo de gobernanza — resolver antes de tocar el esquema

`CLAUDE.md` / `PLAN §9.2`, prohibición absoluta:

> ✗ inventar tablas, roles, permisos, fórmulas o políticas **no cerradas en el plan**

`PLAN §4.3` cerró GAP-15 con una decisión deliberadamente mínima:

> *"el fondo de imprevistos es un concepto de cobro separado con saldo acumulado propio"* —
> `fondos(tenant_id, tipo, nombre, saldo_actual)` + `fondo_movimientos(aporte|uso)`.

El Modelo Maestro **reabre esa decisión cerrada**. Hay precedente exacto y reciente: el documento
E-16 del Motor Presupuestal reabrió el mismo §4.3 y su propia regla exigió registrar la reapertura
como gap formal (**GAP-19**) en `PLAN §7` *antes* de tocar `presupuesto_rubros` o `conceptos`.

**Por tanto, antes del bloque B hace falta:**

1. **GAP-22** en `PLAN_MAESTRO_IMPLEMENTACION.md §7`: "El dominio Fondos se reduce a
   `fondos`/`fondo_movimientos` con dos tipos y dos clases de movimiento — irrepresentable para
   destinación específica, compromisos, autorización y ciclo de vida (Ley 675 art. 35/38 + CTCP
   0146/2025)". Propuesta: adoptar el Modelo Maestro con alcance recortado (§6).
2. **Actualizar `PLAN §4.3`** con el modelo nuevo, para que deje de ser la fuente de verdad vieja.
3. Una **decisión D-xx en `DECISIONES.md`** por cada elección estructural: enum→`lista_tipos`,
   estrategia de permisos, `saldo_actual` derivado vs. materializado con reconciliación.
4. Y respetar **D-24**: nada de `CREATE TYPE ... AS ENUM` nuevo sin `COMMENT ON TYPE` que pruebe
   que el valor gatilla lógica real. Los tipos de fondo van a `lista_tipos`.

---

## 6. Alcance realmente ejecutable

Reordenando el §68 del prompt maestro contra la realidad del repo:

### Ejecutable ya, sin dependencias inexistentes

| Bloque | Contenido | Nota |
|---|---|---|
| **B** | Modelo general de Fondo (código, estado, objetivo, destinación, meta, vigencia, permanente) | Evoluciona `fondos`; migración barata (1 fila) |
| **C** | Tipos (`lista_tipos`) + autorizaciones (órgano, acta, fecha, documento) | Reutiliza `documentos` para el acta |
| **D** | Fuentes y reglas de alimentación | Enlaza con `fuente_financiacion` |
| **E** | Movimientos y saldos (8 tipos, reversión, reconciliación) | Cierra §4.1 |
| **F** | Compromisos (reserva interna: saldo − comprometido = disponible) | Sin `contrato_id` ni `obligacion_id`: quedan nullables |
| **G** | Solicitudes de uso + flujo de aprobación | Patrón calcado del de novedades (Edge Function + RPC atómica) |
| **J** | Presupuesto: FK real `fondo_id` en `fuente_financiacion` | Cierra §4.5 |
| **L** | Contabilidad: extender el bloque D de `contable_movimientos()` | Cierra §4.4; activar `requiere_fondo` cierra §4.3 |
| **O** | Cierre y remanentes | Puro estado + documento |
| **P** | Frontend (los 4 mockups) | `UiTabla`, `UiSelectorBuscable`, patrón de drawers |
| **R** | Auditoría | `audit_log` + controles del módulo de auditoría interna |
| **S/T** | Migración + QA | FND-T-001..030 |

### Bloqueado por dominios que no existen

| Bloque | Por qué |
|---|---|
| **H** — CxP / Pagos | No hay CxP, ni proveedores, ni pagos salientes. `pagos` es entrante por construcción |
| **M** — Rendimientos | Necesita instrumentos financieros y movimiento bancario real |
| **N** — Proyectos | No existe la entidad |
| **I** — Instrumentos | No existen; la conciliación bancaria sí, pero sin UI |

Estos cuatro **no se pueden hacer bien** sin construir primero el lado saliente del dinero. La
salida honesta es dejar los campos como referencias nullables y registrar el gap, **no** simular
un "uso" que reste saldo sin obligación real detrás (§27 del Modelo lo prohíbe expresamente).

### Ejecutable pero caro: bloque K (liquidación / estado de cuenta / recaudo)

Conectar `regla del fondo → concepto → cargo → estado de cuenta → recaudo → aporte al fondo`
implica crear un concepto de cobro nuevo y tocar la imputación de pagos. Es el trabajo que hace
que las dos columnas de `politicas_financieras` dejen de ser decorativas. Merece ser su propio
frente, después de B–G.

---

## 7. Criterios de no aprobación (§66) — estado de partida

| Criterio | Hoy |
|---|---|
| "solo existe un CRUD de fondos" | Ni eso: no hay UI |
| "el saldo es editable" | ❌ **Sí lo es** (§4.1) |
| "no existe comprometido/disponible" | ❌ No existe |
| "no existe autorización de uso" | ❌ No existe |
| "no puede saberse para qué se utilizó un recurso" | ❌ `fondo_movimientos.descripcion` es texto libre |
| "no existe relación con obligaciones/pagos" | ❌ No existe el dominio |
| "se confunde fondo con contabilidad" | ⚠️ Parcialmente (§4.7) |
| "se presenta como patrimonio automáticamente" | ✅ **Resuelto** (CTCP 0146/2025) |
| "se pierden movimientos históricos" | ✅ Append-only sólido |
| "existen referencias cruzadas entre tenants" | ✅ RLS + FORCE + tests |

---

## 8. Decisiones — tomadas el 2026-09-04

> Estado: **todas cerradas**. Se registró **GAP-22** en `PLAN §7`, se reescribió `PLAN §4.3` y se
> añadieron **D-36** (alcance y modelo) y **D-37** (permisos). Lo que sigue es el enunciado
> original de cada punto y cómo quedó.

1. **¿Registro GAP-22 + actualizo `PLAN §4.3`?** Es obligatorio por §9.2. Sin esto, cualquier
   tabla nueva viola una prohibición absoluta del repo.
2. **Alcance de la fase 1.** Propuesta: bloques B–G + J + L + O + P + R + S + T (fondo como
   dominio autónomo completo, con compromisos y solicitudes), dejando H/I/M/N como gaps
   registrados hasta que exista el lado saliente del dinero. ¿Se acepta o quieres el ciclo
   completo, lo que implica construir CxP primero?
3. **Permisos**: ¿matriz nueva `fondos:*` (toca `permissions.ts` con cobertura 100 % y T-MATRIX) o
   `data:*`/`settings:manage` + módulo funcional? Recomiendo lo segundo: es el patrón del repo.
4. **`fondo_tipo_t` → `lista_tipos`** (D-24), lo que además obliga a repensar
   `fondos_imprevistos_unico`. Los tres enums de fondo ya figuran como **legado** en
   `tests/governance/enum-lista-tipos-coverage.test.ts:40-42`, así que migrarlos es coherente con
   la gobernanza vigente. ¿Se confirma?
5. **`saldo_actual`**: ¿derivado puro por función, o materializado con función de reconciliación
   obligatoria (§34 del Modelo)? Y el saldo huérfano de 250.000: ¿se corrige ya o entra en la
   migración del bloque S?
6. **¿Se crea el fondo de imprevistos en el alta de copropiedad?** (Ley 675 art. 35, con la
   excepción VIS/VIP ≤5 unidades de la Ley 2079/2021.) → **Sí**, pendiente de implementar en el
   bloque de migración (§8.1).

### 8.1 Estado de avance

| Bloque | Migración / archivo | Estado |
|---|---|---|
| **A** Diagnóstico | este documento | ✅ |
| Gobernanza | GAP-22 (`PLAN §7`), `PLAN §4.3` reescrito, R9 nuevo, D-36, D-37 | ✅ |
| **B/C** Modelo general + tipos | `20260929100000_fondos_modelo_general.sql` | ✅ aplicada a desarrollo |
| **E** Movimientos: tipos y origen | `20260929110000_fondo_movimientos_tipos_y_origen.sql` | ✅ aplicada |
| **E** Saldo derivado + guards | `20260929120000_fondo_saldo_derivado_y_guards.sql` | ✅ aplicada — cierra §4.1 |
| **C** Autorizaciones (`fondo_autorizaciones`) | `20260929130000_fondo_autorizaciones_y_fuentes.sql` | ✅ aplicada |
| **D** Fuentes y reglas (`fondo_fuentes`) + FK `fuente_financiacion.fondo_id` | misma migración | ✅ aplicada — cierra §4.5 |
| **F** Compromisos (`fondo_compromisos`) + `fn_fondo_saldos` | `20260929140000_fondo_compromisos.sql` | ✅ aplicada — cierra el hallazgo de §7 (comprometido/disponible) |
| **G** Solicitudes de uso (`fondo_solicitudes_uso`) | `20260929150000_fondo_solicitudes_uso.sql` | ✅ aplicada — segregación de funciones D-37 |
| **L** Contabilidad: `RENDIMIENTO_FINANCIERO_FONDO`, `requiere_fondo`, bloque D corregido | `20260929160000_contabilidad_fondos_dimension.sql` | ✅ aplicada — cierra §4.3, arregla una regresión propia (ver más abajo) |
| Fondo de imprevistos en el alta de copropiedad (Ley 675 art. 35) | `20260929170000_fondo_imprevistos_alta_copropiedad.sql` | ✅ aplicada — cierra §4.2 |
| **K** Circuito de cobro (concepto `FONDO_IMPREVISTOS`, aporte por recaudo) | `20260929180000_fondo_imprevistos_circuito_cobro.sql` | ✅ aplicada — cierra §4.4 y §4.6, D-38 |
| Pruebas | `tests/tenancy/fondos-modelo-general.test.ts` (22) + `tests/contabilidad/fondos-dimension.test.ts` (6) + `tests/contabilidad/alta-parametrizacion-contable.test.ts` (+1) + `tests/liquidacion/fondo-imprevistos-cuota.test.ts` (5) | ✅ verdes — 90/90 en la corrida combinada (con `tests/liquidacion`) |
| **P** Frontend | `apps/web/app/stores/fondos.ts`, `app/pages/fondos/index.vue`, `app/components/fondos/*.vue` (8 componentes), `app/composables/useSeleccionFondo.ts`, `app/utils/fondos-labels.ts`, nav (`utils/navegacion.ts`, `components/nav/NavSidebar.vue`) | ✅ verificado en vivo contra Supabase de desarrollo (tenant JARDINES DE BABILONIA): dashboard (tarjetas saldo/comprometido/disponible, crear fondo, cambiar estado), Movimientos (aporte real registrado y persistido), Compromisos (crear, comprometer, liberar), Solicitudes de uso (crear, enviar a revisión, D-37 autoaprobación bloqueada en vivo, anular), Autorizaciones y fuentes (registrar autorización, registrar fuente porcentaje/valor, activar/desactivar). Pendiente: Edge Function opcional sobre las RPC de decisión (hoy solo RLS + guards) — no bloquea el cierre de P |
| **R** Auditoría | `20260930100000_fondo_auditoria.sql` | ✅ aplicada — cierra §37/§60. audit_log en fondos/fondo_compromisos/fondo_solicitudes_uso (creación + cada cambio de estado); 3 códigos nuevos en `auditoria_control_ejecutar` (FONDO_SIN_AUTORIZACION, FONDO_COMPROMISO_EXCEDE_DISPONIBLE, FONDO_CERRADO_CON_SALDO) verificados en vivo (control real creado y ejecutado contra FON-CMP, detectó la excepción genuina, creó el hallazgo, luego re-ejecutado tras autorizar dio PASS); `AuditarAhoraBoton` integrado en `FondoDetalleDrawer.vue`, probado en vivo (engagement creado y visible en Auditoría › Auditorías con badge "Desde fondo"); 4 tests nuevos en `tests/rls/auditoria-controles-automaticos.test.ts` — **FONDO_CERRADO_CON_SALDO pasó a defensa en profundidad tras BLOQUE O** (ver fila siguiente), su test se actualizó para reflejarlo |
| **O** Cierre y remanentes | `20260930120000_fondo_cierre_remanente.sql`, `20260930130000_fondo_compromiso_resolver_en_cierre.sql` | ✅ aplicadas — cierra §35/§36. `fondo_remanentes` (append-only, decisión del remanente: destino traslado/devolución/aplicación, órgano, decisión) + `fn_fondo_cerrar` (operación atómica, Prompt §53) + `guard_fondo_cierre_completo` (bloquea en_cierre→cerrado si quedan compromisos/solicitudes pendientes o saldo ≠ 0, incluso en un UPDATE directo que no pase por la RPC). Verificado en vivo contra FON-CMP (saldo real $135.000, un compromiso 'proyectado' heredado de una sesión anterior): el primer intento de cerrar lo bloqueó correctamente (`FONDO_COMPROMISOS_PENDIENTES`); anularlo reveló un candado real (`guard_fondo_compromiso`, BLOQUE F, exigía fondo 'activo' para *cualquier* UPDATE, incluido anular/liberar) — corregido en la segunda migración para permitir liberar/anular durante en_cierre; tras el fix, anular + registrar remanente (destino 'devolución', vía `FondosFondoCerrarDrawer`) cerró el fondo con saldo 0. También verificado el camino "traslado" (RPC directa, saldo acreditado en el fondo destino) y el camino "saldo ya 0" (cierra directo, sin drawer). 10 tests en `tests/tenancy/fondos-modelo-general.test.ts`. Fuera de alcance, explícito (mismo criterio D-36): "movimientos no conciliados" y "soportes faltantes" del Prompt §36 — dependen de infraestructura que no existe (conciliación bancaria por fondo, documento_id obligatorio) |

**BLOQUE P (frontend) — un defecto propio corregido, uno pre-existente detectado y derivado:**

1. **Defecto propio, corregido aquí.** `cambiarEstadoCompromiso`/`cambiarEstadoSolicitud`
   (`stores/fondos.ts`) refrescaban su propia lista pero no `saldosPorFondo` — al comprometer/liberar
   un compromiso o al comprometer una solicitud (que crea un compromiso), el tablero de Fondos
   seguía mostrando el comprometido/disponible viejo hasta un refresh completo de página. Se agregó
   `refrescarSaldoFondo(fondoId)` (una sola llamada a `fn_fondo_saldos` para ese fondo, sin recargar
   la lista completa) y se invoca desde ambas acciones. Verificado en vivo: cambiar un compromiso de
   `comprometido` a `liberado` en la pestaña Compromisos actualiza el disponible en la pestaña Fondos
   sin recargar la página.
2. **Defecto pre-existente, no de este bloque — derivado a tarea aparte, no corregido aquí.**
   Cualquier `UiSelectorBuscable` dentro de un `UiDrawer` envuelto en `.ficha-inmueble` (patrón usado
   por prácticamente todos los drawers del repo, incluidos los nuevos de fondos) renderiza su panel
   de opciones ilegible en tema oscuro — texto oscuro forzado por el CSS heredado de `.ficha-inmueble`
   sobre un fondo también oscuro (`dark:bg-neutral-900`) del propio panel. Reproducido de forma
   idéntica en un componente preexistente y no relacionado
   (`CopropiedadPersonaVinculadaForm.vue` → selector "Buscar tercero..." en `/configuracion` →
   Personas vinculadas). No es un bug introducido por fondos; se documentó y se derivó como tarea
   separada en vez de arreglarse aquí (mismo criterio que el hallazgo de `recibos_caja` de una
   sesión anterior).

**Defectos ya cerrados de §4:** §4.1 (R8 violado) — `guard_fondo_saldo_derivado` hace cumplir la
invariante comparando contra la derivación en vez de vigilar al llamador, y el saldo huérfano de
250.000 quedó reconciliado a 0 con registro en `audit_log`. §4.5 (`fuente_financiacion` sin FK a
`fondos`) — se añadió `fondo_id` nullable: se autorresuelve para `fondo_imprevistos`
(compatibilidad con el payload existente de `presupuesto-financiacion`) y se exige explícito para
cualquier otro tipo, habilitando que un fondo de destinación específica sea fuente presupuestal
(Modelo §23), verificado con un caso real de $120M.

**Criterio de no aprobación cerrado (§7 de este documento):** "no existe comprometido/disponible"
ya no aplica — `fn_fondo_saldos(fondo_id)` devuelve `saldo/comprometido/disponible`, un compromiso
`proyectado` no resta (es un estimado sin decisión firme), R9 impide que comprometer algo deje el
disponible en negativo, y un `uso` contra un `compromiso_id` avanza su ejecución automáticamente
(`comprometido → parcialmente_ejecutado → ejecutado`) sin permitir sobre-ejecutarlo ni ejecutar el
compromiso de otro fondo. Verificado end-to-end contra la base real antes de escribir las pruebas
formales.

**Otro criterio de no aprobación cerrado (§7):** "no existe autorización de uso" — el flujo
`fondo_solicitudes_uso` (BLOQUE G) hace cumplir D-37 en la base de datos: el solicitante no puede
decidir su propia solicitud (`SOLICITUD_AUTOAPROBACION`), decidir exige rol `administrador`
(`SOLICITUD_ROL_INSUFICIENTE`), aprobar valida el disponible del fondo (`SOLICITUD_EXCEDE_DISPONIBLE`,
Modelo §20), el aprobador no puede comprometer su propia decisión (`SOLICITUD_AUTOEJECUCION`), y
`ejecutada` nunca se asigna a mano — solo se deriva de que el compromiso vinculado llegue a
`ejecutado` (mismo mecanismo de bandera de sesión que ya usa `fn_resetear_copropiedad`). Verificado
end-to-end con tres usuarios reales (solicitante, aprobador, ejecutor) antes de escribir las
pruebas formales.

**BLOQUE L (contabilidad) — tres cosas cerradas, una regresión propia corregida:**

1. **Regresión que arrastraban los bloques E/F/G, corregida aquí.** El bloque D de
   `contable_movimientos()` seguía tratando cualquier tipo distinto de `aporte` como un `uso`
   simétrico — un `rendimiento` se proyectaba acreditando el banco, exactamente al revés de lo
   que exige el CTCP (debía acreditar `4605 Rendimientos financieros`, ingreso real, no una
   reclasificación de efectivo). Se corrigió reescribiendo el bloque D para decidir débito/crédito
   por el **signo** de `fn_fondo_movimiento_efecto` (ya no por el nombre del tipo), lo que además
   resuelve correctamente los 8 tipos de una sola vez, incluida una reversión (que hereda la
   familia de contrapartida del movimiento que corrige, vía `reversion_de_id`). Verificado contra
   datos reales: aporte → débito 111015/crédito 111005; rendimiento → débito 111015/**crédito
   4605**; reversión de un rendimiento → crédito 111015/débito 4605. El test preexistente
   `contable-movimientos.test.ts` sobre gc-001 sigue verde (cuadre estructural intacto).
2. **`RENDIMIENTO_FINANCIERO_FONDO` → 4605**, el evento contable que faltaba (los otros tres del
   dominio fondos ya estaban sembrados desde PC-3). Añadido con el mismo patrón PC-3c:
   `lista_tipos` + `fn_instanciar_cuentas_default` (create-or-replace, no tabla nueva) + backfill
   idempotente para las copropiedades existentes.
3. **§4.3 cerrado — `requiere_fondo` activado, donde es válido activarlo.**
   `contable_movimientos()` es una proyección de solo lectura: no hay INSERT que un trigger pueda
   bloquear. Se activó en los dos puntos donde SÍ hay escritura real —
   `guard_contable_cuenta_default` (un evento del dominio fondos no puede mapear a una cuenta sin
   `requiere_fondo`) y `guard_vinculo_cuenta_efectivo` (`fondos.contable_cuenta_id` tampoco) — y se
   agregó `contable_dimensiones_faltantes()`, que activa las **cuatro** dimensiones obligatorias
   del prompt maestro §35 (fondo/tercero/centro_costo/inmueble) como control observable, mismo
   patrón que `contable_parametrizacion_pendiente()`/`contable_cuadre()`: reporta la excepción, no
   la corrige sola — no hay forma arquitectónica de bloquear una derivación en el punto de
   escritura, porque el punto de escritura es otro (cargos, pagos, `fondo_movimientos`...).
4. **`CARTERA_FONDO_IMPREVISTOS`/`INGRESO_FONDO_IMPREVISTOS` seguían sin consumirse —
   correctamente, en ese momento.** Resuelven la CxC (1315) y el ingreso (4115) de la *cuota* del
   fondo, y esa cuota no existía hasta que el BLOQUE K (circuito de cobro) creara el concepto que
   la factura. Añadirlos entonces habría simulado un hecho que no ocurría; BLOQUE K los activa más
   abajo.

Se limpió también un fondo de prueba (`FON-CMP`) que había quedado huérfano en el tenant real
*JARDINES DE BABILONIA* de una verificación de una sesión anterior — se descubrió al notar que
`contable_movimientos()` devolvía líneas de un fondo inesperado. `fondo_movimientos` es append-only
incluso vía cascada desde `fondos` (a diferencia de la cascada desde `tenants`, que sí está
habilitada para ese caso — mismo mecanismo de `20260823250000`): borrar un fondo directamente con
movimientos reales está, correctamente, bloqueado. Quedó documentado aquí en vez de forzarse con un
bypass administrativo.

**§4.2 cerrado — el fondo de imprevistos ya nace con la copropiedad.** Antes, `create_tenant()`
dejaba la existencia del fondo de imprevistos (obligatorio por Ley 675 art. 35, no discrecional)
como un paso manual posterior — ninguna copropiedad nueva lo tenía hasta que alguien lo creara a
mano. Se añadió `fn_instanciar_fondo_imprevistos(tenant_id)` con el mismo contrato PC-3c que el
resto de `fn_instanciar_*` (idempotente, `SECURITY INVOKER`, existence-check antes de insertar) y
se enganchó a `create_tenant()` justo después de `fn_instanciar_plan_contable` y antes de
`fn_instanciar_cuentas_default` (para que el fondo ya exista cuando se resuelva la cuenta
`111015`). Nace `activo` (no `propuesto`: la ley lo manda, no es una decisión pendiente de asamblea),
`permanente`, vinculado a `111015`, y deliberadamente **sin** `fondo_autorizaciones` — no se inventa
un acta que nunca ocurrió (Modelo §7). Un backfill idempotente cubrió las copropiedades existentes
(11 fondos de imprevistos en total tras la migración, sin duplicar los que ya existían en
JARDINES/GC-001). Verificado end-to-end contra el alta real vía la Edge Function `create-tenant`, y
con pruebas formales en `tests/contabilidad/alta-parametrizacion-contable.test.ts` (estado,
permanencia, cuenta, cero autorizaciones, idempotencia) — la corrección obligó además a arreglar el
fixture de `tests/contabilidad/fondos-dimension.test.ts`, que insertaba a mano un segundo fondo de
imprevistos y ahora choca con `fondos_naturaleza_imprevistos_unico`.

**§4.4 y §4.6 cerrados (BLOQUE K, D-38) — el circuito de cobro existe, reusando la tubería de
facturación ya construida, sin tocar AEL.** Un cuarto concepto de plantilla, `FONDO_IMPREVISTOS`
(mismo mecanismo PC-3c que `ADMINISTRACION`/`CUOTA_EXTRA`/`NOVEDAD`), activa las dos columnas
dormidas de `politicas_financieras` (`fondo_imprevistos_porcentaje`/`_base`) con una fórmula que
solo usa una función que AEL ya traía (`PORCENTAJE(total, pct) -> MONEY`, `02_AEL_Language...md`):
`PORCENTAJE(CONCEPTO.ADMINISTRACION, porcentaje)` o `PORCENTAJE(PARAMETER.PRESUPUESTO_ANUAL,
porcentaje)` según la base configurada — ninguna capacidad nueva de AEL, solo dos parámetros más
expuestos en el snapshot. Cargo → estado de cuenta → recaudo no se tocaron (cartera no distingue
conceptos). El eslabón que faltaba, recaudo → aporte, es un trigger nuevo
(`trg_aporte_fondo_imprevistos`) calcado del patrón de `trg_descuento_pronto_pago`
(`AFTER INSERT ... REFERENCING NEW TABLE`, `SECURITY DEFINER`): cuando una aplicación de pago cubre
un cargo de `FONDO_IMPREVISTOS`, registra el aporte correspondiente (`fondo_movimientos.pago_id`,
sin usar desde el bloque E, existía justo para esto). `contable_movimientos()` distingue ahora
`concepto.codigo = 'FONDO_IMPREVISTOS'` en los bloques de cargos y de `pago_aplicaciones` para
resolver contra `CARTERA_FONDO_IMPREVISTOS`/`INGRESO_FONDO_IMPREVISTOS` en vez de la resolución
genérica, y puebla `fondo_id` en esas líneas (antes `null` ahí, lo que habría hecho que
`contable_dimensiones_faltantes()` las reportara incompletas, porque esas dos cuentas ya exigen
`requiere_fondo` desde BLOQUE L). Tres líneas contables por cuota cobrada — cargo, recaudo, aporte —
son intencionales, no una duplicación: es exactamente la cadena del Modelo §42 (`presupuesto → base
→ regla → liquidación → cargo → estado de cuenta → recaudo → aporte → banco`). Límite explícito
documentado en D-38: anular un pago que cubrió una cuota del fondo no reversa el aporte
automáticamente (mismo criterio que RC-2 ya adoptó para el descuento por pronto pago), y el trigger
filtra los montos negativos del espejo de anulación para no romper la propia anulación con una
excepción de `fondo_movimientos_monto_signo`. Verificado end-to-end contra la base real (concepto →
liquidación real vía `simular-liquidacion`/`fn_aplicar_liquidacion` → cargo → `registrar-pago` →
aporte → `contable_movimientos()` cuadrado → anulación sin excepción) antes de escribir las pruebas
formales en `tests/liquidacion/fondo-imprevistos-cuota.test.ts` (5 casos).

---

## 9. Trabajo en curso que toca fondos (no colisionar)

En los worktrees activos de Claude Code existen dos archivos que **no están en la rama `main`** y
que tocan fondos — ambos del lado del **borrado**, no de la alimentación:

- `apps/web/app/components/copropiedad/CopropiedadZonaPeligro.vue` →
  `{ etiqueta: 'Fondos', tablas: ['fondo_movimientos'] }`
- `tests/governance/resetear-copropiedad-coverage.test.ts` → documenta que `saldo_actual` se
  resetea a 0 aparte y que `fondo_movimientos` sí se borra.

Corresponden a la tarea de `fn_resetear_copropiedad` (`task_f3299a8d`). Cualquier cambio de
esquema en fondos tendrá que reconciliarse con ese trabajo al integrarlo.

---

## 10. Evidencia

Inventario de tablas extraído de las 264 migraciones de `supabase/migrations/`; consultas de
solo lectura contra el proyecto Supabase de desarrollo (`fondos`, `fondo_movimientos`, `tenants`,
`fuente_financiacion`); búsqueda exhaustiva de escrituras a `fondo_movimientos` en
`supabase/functions/`, `packages/`, `apps/web/app/` y `tests/` (único resultado: fixtures de
`tests/rls/domain-isolation.test.ts` y `tests/rls/motor-presupuestal-financiacion.test.ts`).

---

## 11. Pendiente / trabajo a futuro (índice, actualizado 2026-09-05 al cerrar B–G+J+L+K+P+R+O + Edge Function)

Consolidado aquí para no tener que releer cada bloque — esto es lo que un lector futuro necesita
saber antes de retomar el módulo.

**Del propio dominio Fondos:**

1. ~~S/T (migración + QA) sin ejecutar formalmente.~~ **Hecho 2026-09-05.** `pnpm test` completo
   corrido de punta a punta (1376 tests): 0 fallos atribuibles a Fondos — las 15 fallas de esa
   corrida son de `cartera-envio-evidencia`, `cartera-indicadores` y `tenant-predeterminado`
   (trabajo en curso de otras sesiones en el mismo working tree, ajeno a este módulo, confirmado
   por archivo). `pnpm build` limpio; `pnpm --filter @aquila/web typecheck` limpio en los archivos
   de Fondos (errores preexistentes en `ConceptosCondicionHoja.vue`/`seguridad/index.vue`/
   `stores/auth.ts` no son de este módulo). Migración real: sigue siendo prácticamente nula, como
   ya diagnosticó BLOQUE A.
2. **"Movimientos no conciliados" (Prompt §36) no se hace cumplir.** La conciliación bancaria
   tiene backend completo (`extracto_bancario`/`extracto_linea`/`conciliacion_propuesta`, 2 Edge
   Functions) pero no está enlazada por fondo — nada impide cerrar un fondo con movimientos
   bancarios sin conciliar. Bloqueado hasta que exista esa UI/enlace (FND-PR-09, todavía sin UI
   para toda la copropiedad, no solo para fondos).
3. **"Soportes faltantes" (Prompt §36) no se hace cumplir.** `documento_id` en `fondo_movimientos`
   es opcional a propósito — volverlo obligatorio rompería `fn_aplicar_aporte_fondo` (BLOQUE K),
   que registra el aporte automático por recaudo sin documento adjunto (su soporte real es
   `pago_id`, no un documento). Si algún día se quiere resolver de verdad, hay que diferenciar a
   nivel de guard "movimiento automático por el sistema" (respaldo = la fila que lo originó) de
   "movimiento manual" (respaldo = documento) — no una validación uniforme.
4. ~~Edge Function opcional sobre las RPC de decisión de solicitudes.~~ **Hecho 2026-09-05 (D-41).**
   `fondos-aprobar-solicitud`/`fondos-rechazar-solicitud`/`fondos-comprometer-solicitud`,
   desplegadas a desarrollo, wireadas en `stores/fondos.ts`/`FondosTabSolicitudes.vue`, 7 tests
   nuevos. No cambió el modelo de autorización (RLS + guards seguían siendo suficientes) — el
   valor es rate limit + error estructurado + logging. `fn_fondo_cerrar` (BLOQUE O) se dejó fuera
   a propósito: no tiene el mismo patrón de decisión repetida por terceros que solicitudes.
5. **Cuatro bloques bloqueados por dominios que AQUILA no tiene** (§6 de este documento, sin
   cambios): **H** (CxP/pagos salientes — `pagos` es entrante por construcción, `check (monto >
   0)`), **M** (rendimientos — necesita instrumentos financieros reales), **I** (instrumentos
   financieros — no existen), **N** (proyectos — no existe la entidad). No son builds a medias:
   genuinamente no se pueden hacer sin construir antes el lado saliente del dinero en AQUILA. Si
   se decide construir CxP/proveedores/pagos salientes como su propio dominio, estos cuatro se
   vuelven ejecutables.

**Fuera del dominio Fondos, pero tocado durante esta sesión:**

6. **Gap analysis completo del módulo de Auditoría (108 secciones)** — diferido explícitamente por
   el usuario hasta tener "un par de módulos nuevos" implementados (ver memoria
   `project-auditoria-gap-analysis-pendiente`). Fondos es un módulo grande y nuevo recién cerrado
   — vale la pena preguntar si esa condición ya se considera cumplida antes de asumir que sigue
   diferido.
7. ~~Bug de contraste en `UiSelectorBuscable`~~ y ~~`recibos_caja` sin excepción en la cascada de
   borrado de tenant~~ — **ambos commiteados 2026-09-05** (`846613a`, `26b6752`), junto con el
   módulo Fondos completo B–G+J+L+K+P+R+O (`cb0d372`). Nada de lo anterior sigue sin commitear.
