# Liquidación en dos tiempos

**Análisis y plan de ejecución — Motor de liquidación de AQUILA**
Revisado contra el código en `E:\proyectos\Scala\proyecto-web` · Docs 17/19/20 · CAR_00 · E9 / PC-5
v3 — implementación completa · 25 de agosto de 2026

Hoy liquidar un periodo es un acto único e irreversible que deja el periodo abierto, no toca la
contabilidad y no genera estados de cuenta. Esta propuesta lo parte en dos: una **Pre-Liquidación**
repetible sin consecuencias, y una **aplicación** atómica —solicitada por quien prepara, aprobada
por el administrador— que orquesta cartera, presupuesto, contabilidad y estados de cuenta en una
sola transacción.

> **Estado de la implementación · 25 de agosto de 2026.** Las ocho fases (L0-L7) y las cinco
> decisiones (D1-D5) están completas y verificadas contra cálculo real, congeladas en
> `tests/liquidacion/flujo-dos-tiempos.test.ts` (23 pruebas) más el resto de la suite de
> `tests/liquidacion/` (37 pruebas en total). El camino viejo que motivó este plan — la Edge
> Function `liquidar-periodo` y `guardarLiquidacion()`, el acto único e irreversible — se retiró del
> código y del proyecto de desarrollo el mismo día. Lo único pendiente es que el contador público
> matriculado de la copropiedad valide D2b (ver §07).

### Tres decisiones cerradas desde la primera versión

- **Nombre oficial:** Pre-Liquidación (no «ensayo»).
- **Alcance «todo en la BD»:** la escritura/orquestación es 100 % plpgsql atómico; el cálculo
  financiero se queda en TypeScript puro, tal como D-14 ya decidió y por las mismas razones.
- **Aplicar:** flujo de dos actores, propone → aprueba, igual que `acciones_cobranza`.

---

## 01 · Qué hay hoy, verificado

El núcleo de cálculo está sorprendentemente sano. Lo que falta no es el motor: es todo el
andamiaje alrededor del acto de liquidar.

| Pieza | Dónde vive | Estado | Qué le falta para esto |
|---|---|---|---|
| **Motor de cálculo** — grafo, orden topológico, AEL, allocate() | `liquidation-engine/liquidar.ts` · `executor.ts` | ✅ Sólido | Nada. Es puro, determinista, con `resultHash` y reconciliaciones R1/R3/R4 que *bloquean* en vez de ajustar. |
| **Ledger de cartera** — cargos · pagos · aplicaciones | `20260816100000_cuenta_corriente_ledger` | ✅ Sólido | Append-only con `forbid_mutation()`, saldo derivado en `v_cargo_saldo`. Correcto por diseño. |
| **Contabilidad** — partida doble derivada | `contable_movimientos()` · PC-5 | ✅ Sólido | El asiento se *deriva*, no se persiste: es imposible descuadrar o contabilizar dos veces. Ver §3. |
| **Persistencia del resultado** | `liquidaciones` · `liquidacion_lineas` | ⚠️ v0 mínimo | Dos estados (`completada`/`fallida`) y un `UNIQUE(tenant,periodo)` que **impide re-liquidar**. |
| **Orquestador** | `functions/liquidar-periodo` | ⚠️ Parcial | Sin simulación, sin lock, y tres escrituras **no atómicas**: si la tercera falla, queda a medias. |
| **Estado del periodo** | `guard_periodo_transicion` | ❌ Desconectado | La máquina existe y funciona, pero **nadie la invoca**: el periodo queda `abierto` para siempre tras liquidar. |
| **Ejecución presupuestal** | `presupuesto_cuenta_ejecucion()` · E9 | ✅ Ya resuelto | **Corregido al implementar L4:** el rollup ya suma `cargos` para las cuentas con concepto vinculado. En cuanto la liquidación crea los cargos, el ejecutado aparece solo. Ver §6/L4. |
| **Estados de cuenta** | `estados_cuenta_generados` | ❌ Manual | Se generan **uno por uno** desde la ficha del inmueble. No hay generación por lote tras liquidar. |

> **Esto no es deuda técnica accidental.** **D-14** lo decidió explícitamente: F5 implementaría el
> núcleo mínimo y se ampliaría «cuando un caso real lo exija, no antes». Tu requerimiento *es* ese
> caso real. El plan de abajo no corrige un error — ejecuta la ampliación que la propia decisión
> previó.

---

## 02 · Los nueve huecos entre hoy y lo que pides

Ordenados por lo que rompen. Los cinco primeros son bloqueantes para el flujo Pre-Liquidación → aplicar.

| # | Hueco | Consecuencia hoy | Estado |
|---|---|---|---|
| 01 | **No existe el estado «pre-liquidada»** — el enum solo tiene `completada`/`fallida`. | Liquidar es inmediatamente definitivo. No hay forma de ver el resultado antes de comprometerlo. | 🔴 → ✅ Resuelto (L0) |
| 02 | **`UNIQUE(tenant_id, periodo_id)`** sin condición de estado. | La segunda simulación choca contra la primera. Re-liquidar es literalmente imposible. | 🔴 → ✅ Resuelto (L0) |
| 03 | **El snapshot no se congela.** Se reconstruye desde la BD en cada corrida. | Revisas una pre-liquidación, alguien cambia un coeficiente, apruebas — y aplicas algo distinto a lo que revisaste. | 🔴 → ✅ Resuelto (L2/L3) |
| 04 | **La aplicación no es atómica.** Insert de líneas, luego cargos, luego novedades. | El propio código lo admite: *«la liquidación ya quedó guardada — un fallo aquí no la revierte»*. | 🔴 → ✅ Resuelto (L3) |
| 09 | ~~No hay separación proponer/aprobar~~ para el acto de aplicar. | Resuelto en L0/L3: propone `auxiliar` o `administrador`, solo `administrador` aprueba y aplica. | ✅ Resuelto |
| 05 | ~~El periodo nunca se cierra~~ ni se bloquea. | Resuelto en L3: `fn_aplicar_liquidacion` cierra el periodo dentro de la misma transacción. | ✅ Resuelto |
| 06 | ~~El presupuesto no se entera.~~ Era falso — diagnóstico corregido. | El rollup ya sumaba los cargos de las cuentas con concepto vinculado. Faltaba solo el modo caja, resuelto en L4 sin escribir un solo dato nuevo. | ✅ Descartado |
| 07 | ~~Sin generación de estados de cuenta por lote.~~ | Resuelto en L5: `fn_emitir_estados_cuenta` los emite en un solo `INSERT … SELECT` al aplicar. | ✅ Resuelto |
| 08 | ~~Sin anulación.~~ Si se aplica con un error, no hay salida. | Resuelto en L6: `fn_anular_liquidacion` emite contra-cargos y reabre el periodo — nunca `DELETE`. | ✅ Resuelto |

> **El descuento por pronto pago — ya resuelto (D3).** La cuenta `4695 · Descuento por pronto pago`
> ya estaba sembrada y mapeada (`20260830470000`), pero ningún código la producía. Se implementó en
> la imputación del pago (§7/D3), con dos modos configurables por copropiedad y desactivado por
> defecto.

---

## 03 · Qué hace el mercado — y dónde ya vamos delante

Conocimiento de dominio general sobre software de administración de PH y de facturación
recurrente, no una verificación hecha hoy contra cada producto. Conviene contrastarlo si alguna
afirmación va a sostener una decisión comercial.

**El patrón dominante en PH.** La mayoría de suites de administración de copropiedades liquidan en
un solo paso: se elige el periodo y se genera. La «revisión» ocurre *después*, mirando los recibos
ya emitidos.

**Cómo se corrige allá.** Reversar suele ser una operación de soporte o un borrado en cascada — no
una transición de estado auditada. De ahí que muchos administradores liquiden «en un mes de
prueba» y luego borren.

**Quién sí lo hace bien.** Los ERP de facturación recurrente (SAP, Oracle, y los motores de
*billing* tipo Zuora) llevan décadas con *test run* → revisión → *real run* con bloqueo. Es el
patrón maduro, y es exactamente el que describiste.

**El punto débil universal.** La contabilidad casi siempre es un módulo aparte que se alimenta por
interfaz o exportación. Cuando falla, operación y contabilidad divergen — y reconciliarlas es
trabajo manual.

### Tres ventajas que ya tenemos y conviene no perder

1. **La contabilidad no puede desincronizarse.** `contable_movimientos()` deriva el asiento de los
   hechos en vez de persistirlo. No hay dos verdades que reconciliar, y el cuadre es estructural:
   cada hecho declara débito, crédito y *un* importe, y un `LATERAL` lo expande a dos líneas. Es
   imposible escribir un asiento descuadrado. La mayoría del mercado no puede decir esto.
2. **El cálculo es determinista y verificable.** `resultHash` sobre serialización canónica: mismo
   snapshot ⇒ mismo hash. Eso convierte «¿por qué me cobraron esto?» en una pregunta con respuesta
   reproducible.
3. **Las reconciliaciones bloquean, no ajustan.** Si Σ líneas ≠ cuota del periodo, el motor lanza
   `ReconciliacionLiquidacionFallidaError` en vez de cuadrar la diferencia por su cuenta. Es la
   política correcta y muy poco común.

> **La oportunidad real.** Nadie en este mercado ofrece *«simula, compara contra el mes anterior,
> revisa los avisos, y solo entonces aplica — y al aplicar, cartera, presupuesto, contabilidad y
> estados de cuenta se mueven en un solo acto o no se mueve nada»*. Esa frase es el producto.

---

## 04 · La arquitectura propuesta

Cuatro estados centrales más los de flujo, no los quince de Docs 20 §61-68 (*Draft → Validated →
Finalized → Published*). Esto es esa máquina colapsada a lo que un administrador de copropiedad
realmente distingue.

```
                    ┌───────────────────────────┐
                    │   periodo sin liquidar    │
                    └─────────────┬─────────────┘
                                  │  Simular            (auxiliar o administrador)
                                  ▼
   Volver a simular ┌──────────────────────────────────────┐
  ┌──────────────────▶│  PRE_LIQUIDADA                       │
  │                  │  · cálculo completo, cero efectos    │
  └──────────────────┤  · reemplaza la pre-liquidación      │
                     │    anterior del mismo periodo        │
                     │  · congela snapshot + snapshot_hash  │
                     └──────┬────────────────────┬──────────┘
                            │ Solicitar          │ (se deja así,
                            │ aplicación         │  sin solicitar)
                            │ (auxiliar o admin) │
                            ▼                    ▼
              ┌──────────────────────┐   ┌──────────────────┐
              │ PENDIENTE_APROBACION │   │   DESCARTADA      │◀── una nueva
              │ propuesta_por = uid  │   │  (automático)     │    Pre-Liquidación
              └────┬─────────────┬───┘   └──────────────────┘    la reemplaza
                   │ Aprobar     │ Rechazar
                   │ (solo       │ (solo
                   │ administrador)│ administrador)
                   │             ▼
                   │      ┌──────────────┐
                   │      │  RECHAZADA   │  aprobada_por + motivo
                   │      └──────────────┘
                   ▼
   ┌─────────────────────────────────────────────────────┐
   │  APLICADA          una transacción, todo o nada     │
   │  ─────────────────────────────────────────────────  │
   │   0. revalida snapshot_hash   ¿cambió algo desde    │
   │      la solicitud? si sí, rechaza y pide re-simular │
   │   1. lock del periodo         FOR UPDATE            │
   │   2. re-corre fn_liquidacion_prevuelo (gates)       │
   │   3. cargos                   ← liquidacion_lineas  │
   │   4. presupuesto_ejecucion    ← si modo = causación │
   │   5. periodo → en_liquidacion → cerrado             │
   │   6. estados de cuenta        ← lote por inmueble   │
   │   ─────────────────────────────────────────────────  │
   │   contabilidad: automática, es derivada (PC-5)      │
   │   si modo = caja: el ingreso presupuestal/contable  │
   │   nace después, cuando entra el pago (ver L4)       │
   └──────────────────────┬──────────────────────────────┘
                          │  Anular  · solo si no hay pagos aplicados
                          ▼
   ┌─────────────────────────────────────────────────────┐
   │  ANULADA — por contra-cargos, nunca por DELETE      │
   └─────────────────────────────────────────────────────┘
```

### Las cuatro piezas que sostienen todo

**1 · El snapshot congelado.** Cada Pre-Liquidación guarda el `DataSnapshot` completo en JSONB con
su `snapshot_hash`. Al aprobar, se recalcula el hash contra la BD viva: si no coincide, se rechaza
y obliga a re-simular. Es el control de concurrencia optimista de **Docs 17 §34**, y es lo que
garantiza que se apruebe exactamente lo que se revisó — incluso si pasaron días entre solicitar y
aprobar.

**2 · El índice único parcial.** `UNIQUE (tenant_id, periodo_id) WHERE estado = 'aplicada'`. Un
solo resultado definitivo por periodo, pero Pre-Liquidaciones ilimitadas. Un cambio de una línea
que desbloquea todo el flujo.

**3 · Propone → aprueba, sin Edge Function intermedia.** Mismo patrón exacto que
`acciones_cobranza` (`20260822280000`): `propuesta_por` se asigna por trigger desde `auth.uid()`,
nunca del cliente; un guard de transición exige `has_role(tenant, ['administrador'])` —no basta
`auxiliar`— para `pendiente_aprobacion → aplicada/rechazada`. RLS + trigger, sin Edge Function
nueva para proponer.

**4 · La aplicación, 100 % en la base de datos.** El cálculo sigue en TypeScript puro (D-14, sin
cambios). Lo que se mueve a `plpgsql` es la *escritura*: `fn_aplicar_liquidacion(id)` hace las seis
cosas del diagrama en una sola transacción. La Edge Function de aprobar solo autoriza y llama la
RPC — cero orquestación en Deno.

> **La regla que hace segura la anulación.** Una liquidación aplicada **solo puede anularse si
> ninguno de sus cargos tiene pagos imputados**. Si ya entró dinero contra ella, no es una
> anulación: es un ajuste, y va por novedades. Sin esta regla, anular corrompería la imputación de
> pagos ya aplicados.

---

## 05 · La interfaz

Dos vistas de la misma pantalla, porque el flujo tiene dos actores: quien prepara y solicita
(`auxiliar`), y quien aprueba y compromete (`administrador`).

*(El mockup visual completo — con KPIs, verificación previa, comparación contra el periodo
anterior y los diálogos de solicitar/aprobar — está en el artefacto HTML publicado. Aquí el
resumen funcional de cada pantalla.)*

### Vista 1 · quien prepara (`auxiliar`)

Termina de simular, revisa, y solicita — sin poder de aplicar nada por sí sola.

- Encabezado: periodo, vencimiento, unidades, pill de estado **"Pre-liquidada"**.
- Acciones: `Descartar` · `Volver a simular` · `Solicitar aplicación`.
- Aviso: *"Esta Pre-Liquidación no ha modificado nada todavía. «Solicitar aplicación» tampoco
  aplica nada — pasa esta Pre-Liquidación a un administrador para su aprobación final."*
- KPIs: total a facturar, cuota ordinaria, intereses de mora, novedades.
- **Verificación previa** (gates de `fn_liquidacion_prevuelo`): presupuesto cuadrado, coeficientes
  = 100 %, fecha de vencimiento, reconciliaciones del motor (✓ bloquean si fallan) — más avisos
  informativos (cuentas sin mapeo contable, unidades sin propietario vigente).
- Pestañas de detalle: comparación con el periodo anterior, detalle por unidad, por concepto,
  efecto contable.
- Pie: hash del snapshot y del resultado, quién y cuándo simuló, botón exportar (XLSX).

**Diálogo "Solicitar aplicación"** — sin fricción tipográfica (esa se reserva para el paso
irreversible): explica que un administrador debe aprobar, que se puede seguir simulando pero no
re-simular *esta* solicitud (cualquier cambio la reemplaza), y un campo de nota opcional para quien
aprueba.

### Vista 2 · quien aprueba (`administrador`)

Misma pantalla, misma verificación previa **re-ejecutada en el momento de aprobar** — no se confía
en la de la solicitud, que puede tener horas.

- Encabezado: quién solicitó, cuándo, su nota. Pill **"Pendiente de aprobación"**.
- Acciones: `Rechazar` · `Aprobar y aplicar`.
- Aviso: si algo cambió desde la solicitud (coeficiente, novedad nueva), se muestra en rojo y
  bloquea "Aprobar" hasta volver a simular.

**Diálogo "Aprobar y aplicar"** — el único punto de todo el flujo con fricción deliberada:

1. Se crean 1.104 cargos por $ 26.184.902 en 184 unidades.
2. Se registra el ingreso presupuestal (modo causación) contra las cuentas de ingreso vinculadas.
3. El periodo pasa a cerrado — no admitirá más novedades.
4. Se emiten 184 estados de cuenta con corte al 30 de septiembre.

Exige escribir el nombre exacto del periodo (`SEPTIEMBRE 2026`) para confirmar — obliga a leer
*cuál* periodo se está aplicando. Ningún `auxiliar` ve este diálogo: el guard de transición exige
`has_role(tenant, ['administrador'])`.

---

## 06 · Plan de ejecución

Ocho fases. Las cuatro primeras son la columna vertebral; sin ellas nada más tiene sentido. Cada
una deja el sistema en un estado consistente y verificable.

### L0 — Cimientos ✅

Amplía `liquidacion_estado_t` (enum nativo, no `lista_tipos` — mismo criterio que
`periodo_estado_t`: un estado que un guard trigger valida en cada transición se beneficia de que la
BD lo rechace por definición de tipo) a:

```
pre_liquidada · pendiente_aprobacion · rechazada · aplicada · descartada · anulada · fallida
```

Sustituye el `UNIQUE` por un índice parcial sobre `estado = 'aplicada'`. Agrega `snapshot` JSONB +
`snapshot_hash` + `propuesta_por` / `aprobada_por` / `aplicada_at` (mismos nombres que
`acciones_cobranza`, mismo trigger que asigna `propuesta_por` desde `auth.uid()` en el INSERT).
Guard de transición análogo a `guard_accion_cobranza_transicion`, exigiendo `administrador`
explícito para `pendiente_aprobacion → aplicada/rechazada`.

**Archivos:** migración nueva · `database.generated.ts`

### L1 — Pre-vuelo ✅

`fn_liquidacion_prevuelo(tenant, periodo)` devuelve filas `(severidad, codigo, titulo, detalle)`.
Reutiliza lo que ya existe: `contable_parametrizacion_pendiente()`, el cuadre de
`presupuesto_rubros`, la suma de coeficientes, `fecha_vencimiento`. Es la misma función que
alimenta la UI y que `fn_aplicar_liquidacion` vuelve a exigir antes de escribir.

**Archivos:** migración nueva · reutiliza PC-3 · E8 · CAR

### L2 — Simular ✅

Edge Function `simular-liquidacion`: construye el snapshot, corre `liquidar()` sin tocar nada, y
persiste el resultado como `estado='pre_liquidada'`, marcando cualquier pre-liquidación previa del
mismo periodo (en `pre_liquidada` o `pendiente_aprobacion`) como `descartada`. Reutiliza el motor
tal cual — cero código de cálculo nuevo, exactamente como D-14 ya decidió.

**Archivos:** `functions/simular-liquidacion` · `liquidation-engine` (sin cambios)

### L3 — Solicitar → aprobar → transacción única ✅

**Solicitar** (rol `auxiliar` o `administrador`): un simple `UPDATE` RLS-protegido,
`pre_liquidada → pendiente_aprobacion`, sin Edge Function — mismo criterio que
`acciones_cobranza`, el guard trigger asigna `propuesta_por`.

**Aprobar** (solo `administrador`): Edge Function `aplicar-liquidacion` autoriza y llama
`fn_aplicar_liquidacion(id)`, una función plpgsql que hace, en una sola transacción: lock del
periodo, revalidación del `snapshot_hash` contra la BD viva, re-corrida de
`fn_liquidacion_prevuelo`, y los efectos de L4/L5. Todo o nada, de verdad esta vez — y 100 % dentro
de la base de datos: la Edge Function no orquesta nada, solo autoriza y llama una RPC.

**Archivos:** migración nueva (guard + `fn_aplicar_liquidacion`) · `functions/aplicar-liquidacion`

### L4 — Orquestación (presupuesto y contabilidad al unísono, con dos modos) ✅

> **Este plan estaba equivocado, y el esquema lo demostró.** Al implementarlo, la base rechazó el
> diseño propuesto con `CUENTA_CONCEPTO_AUTOMATICO: ya recibe su ejecutado automáticamente de un
> concepto vinculado — no admite movimientos manuales (evita doble conteo)`.
> `presupuesto_cuenta_ejecucion()` **ya sumaba** los cargos de toda cuenta con concepto vinculado —
> el modo causación funcionaba desde que L3 crea los cargos. Insertar filas habría contado cada peso
> dos veces, y ese guard existe precisamente para impedirlo.

**Lo que sí faltaba, y es todo L4:** el modo caja. No se resuelve escribiendo datos sino eligiendo
qué suma el rollup. Nuevo enum `presupuesto_reconocimiento_ingreso_t` en `politicas_financieras`, y
una rama condicional en `presupuesto_cuenta_ejecucion()`: `causacion` suma `cargos.monto_original`
(lo facturado), `caja` suma `pago_aplicaciones.monto` (lo cobrado), contando solo capital originado
en una liquidación.

Sin tabla nueva, sin trigger, sin dato duplicado: el ejecutado sigue siendo *derivado*, igual que
`contable_movimientos()` (PC-5). Como la política vigente es inmutable, cambiar de modo obliga a
versionarla.

**Archivos:** migración nueva (enum + columna) · `presupuesto_cuenta_ejecucion()` · E9 · PC-5

### L5 — Estados de cuenta (emisión por lote) ✅

`fn_emitir_estados_cuenta(liquidacion_id)`: un `INSERT … SELECT` que replica el formato JSON exacto
que ya consume la ficha del inmueble, ligado a la liquidación y al periodo. `fn_aplicar_liquidacion`
lo invoca al final de su transacción. Medido contra 66 unidades reales: 41 ms — sin riesgo para el
*lock* del periodo.

**Archivos:** `20260830620000` · `estados_cuenta_generados` + `liquidacion_id`/`periodo_id`

### L6 — Salida de emergencia (anulación por contra-cargo) ✅

`fn_anular_liquidacion(id, motivo)`: rechaza si existe cualquier pago imputado; si no, emite cargos
espejo de signo contrario, reabre el periodo con auditoría y marca la liquidación como `anulada`.
Nunca un `DELETE` — el ledger sigue siendo append-only. `guard_periodo_transicion` se amplió con
`cerrado → abierto`, permitida solo cuando no queda ninguna liquidación `aplicada` para ese periodo.

**Archivos:** `20260830630000` · `fn_anular_liquidacion` (RPC directa, sin Edge Function)

### L7 — Las dos pantallas de §5 ✅

Reescritura de `pages/liquidacion/index.vue` — antes una tabla de periodos con un botón, hoy un
selector de periodo más un panel único (`LiquidacionPanel.vue`) que se adapta al estado y al rol:
pre-vuelo, simular, solicitar, aprobar/rechazar, aplicar, anular. La confirmación escrita del
mockup (§5) se implementó tal cual en `LiquidacionConfirmar.vue`.

**Archivos:** `pages/liquidacion/index.vue` · `stores/liquidacion.ts` ·
`components/liquidacion/{Panel,Prevuelo,Confirmar}.vue`

> **Las ocho fases están cerradas.** L0→L3 corrieron en el orden secuencial previsto. L4 y L5 no se
> difirieron — «orquestar al unísono» quedó completo, no a medias. L6 y L7 se implementaron por
> separado, como se anticipaba aquí. El 25 de agosto se retiró además el camino viejo de un solo
> paso (Edge Function `liquidar-periodo`, `guardarLiquidacion()`) que motivó este plan.

---

## 07 · Decisiones

Las cinco quedaron resueltas. D2b sigue siendo la única que depende de alguien fuera de este
equipo: la firma del contador.

### ✅ D1 — ¿La Pre-Liquidación congela los datos o los relee? — Resuelta

**Relee, valida al aplicar.** Cada simulación parte de la BD viva; lo que se congela es el
`snapshot_hash` de la última Pre-Liquidación, y `fn_aplicar_liquidacion` lo revalida en el momento
de aprobar — no en el de solicitar, que puede ser horas antes.

### ✅ D2 — ¿Cuándo se reconoce el ingreso en el presupuesto y la contabilidad? — Implementada

**Ambos modos, configurables por copropiedad** — implementados sobre el rollup, no insertando
datos (ver el recuadro de L4 en §6). `causacion` es el default: es el devengo, y es lo que el
sistema ya hacía antes de que existiera la opción.

**D2b — en modo caja, ¿qué es la cartera? Resuelto según la recomendación.** `cargos` y
`v_cargo_saldo` se comportan **idénticamente en los dos modos**: lo que una unidad debe no depende
de cómo la copropiedad prefiera reportar sus ingresos. Si en caja la deuda no naciera hasta el
pago, no habría cartera, ni mora, ni cobranza — eso no sería una preferencia contable sino romper
el negocio. Verificado por test. **Queda pendiente que lo valide el contador**, porque es una
decisión suya, no técnica.

### ✅ D3 — ¿Dónde nace el descuento por pronto pago? — Implementada

**Al imputar el pago**, como se recomendaba — pero configurable en dos modos, no uno solo, porque
distintas copropiedades manejan el descuento de forma distinta:

- **`reduce_deuda`:** el residente paga el monto neto y queda a paz y salvo — el descuento reduce
  la deuda misma.
- **`saldo_a_favor`:** el residente debe pagar el monto completo; si lo hace a tiempo, el descuento
  se acredita como saldo a favor, no como reducción de lo que debía.

Porcentaje y días-antes-del-vencimiento se configuran en `políticas_financieras` (inmutable una vez
vigente, igual que el resto de la política — cambiarlo exige versionar). Desactivado por defecto
(0 %). Solo aplica a cargos de capital que vienen de una liquidación, no a intereses ni a
novedades. Verificado con 7 pruebas, ambos modos.

### ✅ D4 — ¿Qué avisos bloquean y cuáles solo informan? — Implementada

La lista final (`fn_liquidacion_prevuelo`, L1) difiere de la propuesta original en un punto,
corregido antes de escribir código: **coeficientes que no suman 100 % es aviso, no bloqueo** —
`allocate()` (financial-kernel) normaliza por la suma real de pesos, así que el reparto sigue
siendo proporcionalmente correcto aunque no sumen exactamente uno.

- **Bloquean:** periodo no abierto · sin fecha de vencimiento · periodo anterior sin liquidar · sin
  set de coeficientes vigente · inmueble sin coeficiente · presupuesto descuadrado.
- **Solo avisan:** presupuesto sin versión vigente · coeficientes que no suman 100 % · cuenta sin
  mapeo contable · concepto sin cuenta presupuestal · inmueble sin responsable · novedades
  pendientes · variación alta contra el periodo anterior.

### ✅ D5 — ¿Quién puede aplicar? — Resuelta

**Propone → aprueba, dos actores.** `auxiliar` o `administrador` simulan y solicitan; solo
`administrador` aprueba y aplica — mismo patrón que `acciones_cobranza`.

---

## 08 · Riesgos que asumo explícitamente

Dicho ahora, no descubierto en la fase 5.

| Riesgo | Mitigación en el plan |
|---|---|
| **La transacción de L3 puede ser larga** — 184 unidades × N conceptos + estados de cuenta en un solo `COMMIT`. | Medir con datos reales de GC-001 antes de cerrar L3. Si el *lock* del periodo resulta costoso, L5 sale de la transacción y pasa a ser un paso posterior reintentable e idempotente. |
| **Mover persistencia a plpgsql reduce la cobertura de tests en TypeScript**, donde hoy está toda la suite. | El cálculo — la parte con lógica financiera real — no se mueve. Lo que baja a SQL es escritura ordenada, que se prueba con tests de integración sobre la base de desarrollo. |
| ~~`guard_periodo_transicion` no permite reabrir~~ un periodo cerrado, y L6 lo necesita. | ✅ **Mitigado.** Se amplió el guard con `cerrado → abierto`, permitida solo cuando no queda ninguna liquidación `aplicada` para ese periodo. |
| **El snapshot JSONB puede pesar** en copropiedades grandes. | 184 unidades es del orden de decenas de KB comprimidos. Se revisa el umbral si aparece un tenant con miles de unidades; hoy no existe. |
| **El cambio de `UNIQUE` a índice parcial** toca una tabla con datos. | Migrar las liquidaciones existentes a `estado='aplicada'` antes de crear el índice. En desarrollo hay pocas; verificar el conteo real antes de aplicar. |
| **El flujo de dos actores agrega latencia** — si el administrador tarda en aprobar, el periodo espera. | No hay límite de tiempo en `pendiente_aprobacion`: puede reabrirse a `pre_liquidada` re-simulando, o simplemente esperar. Un tenant unipersonal donde la misma persona tiene ambos roles no pierde nada — solo pasa por los dos clics. |
| **Modo caja (D2) exige tocar `registrar-pago`**, una Edge Function que hoy no conoce presupuesto. | El cambio es aditivo — un insert condicional adicional, sin tocar la lógica de imputación existente (`packages/liquidation-engine/src/cuenta-corriente.ts`). Se prueba con los mismos tests de integración de pagos. |

---

**Estado final:** las ocho fases y las cinco decisiones están cerradas, el camino viejo está
retirado, y el ciclo completo queda congelado en tests de integración contra cálculo real. Lo
único que sigue pendiente de alguien fuera de este equipo es **D2b** — que el contador público
matriculado de la copropiedad valide formalmente el tratamiento contable del modo caja.
