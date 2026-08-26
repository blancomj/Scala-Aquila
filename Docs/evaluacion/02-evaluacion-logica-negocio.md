# Evaluación de Lógica de Negocio y Flujo — Presupuesto → Liquidación → Cartera

**Proyecto:** Aquila PH (monorepo pnpm, Supabase/Postgres + Deno Edge Functions + Vue)
**Alcance:** lógica de negocio y flujo funcional presupuesto→liquidación→cartera, motor financiero, SQL, tipos, tests y preparación para módulos futuros.

---

## 1. Descripción del flujo actual (end-to-end)

### 1.1 Presupuesto
- **Presupuesto anual** (`presupuestos`, estado `borrador|vigente`) con **árbol de cuentas presupuestales** (`presupuesto_cuenta` con `parent_id`, reparentado controlado y orden en cascada). Existe semilla de plantilla.
- **Fuentes de financiación** (`fuente_financiacion`: otros ingresos, cuota extraordinaria, fondo imprevistos, saldo aplicable) con trazabilidad jurídica (`fundamento_normativo`).
- El presupuesto vigente entra al motor como parámetros derivados: `PRESUPUESTO_ANUAL`, `OTROS_INGRESOS_ANUAL`, `CUOTA_EXTRAORDINARIA_ANUAL`, `FONDO_IMPREVISTOS_ANUAL`.
- **Ejecución presupuestal derivada**, no persistida: `presupuesto_cuenta_ejecucion()` suma `cargos.monto_original` (modo causación por defecto; modo caja configurable por política). Buena decisión: una sola fuente de verdad (el ledger de cargos), cero datos duplicables.

### 1.2 Conceptos y fórmulas
- `conceptos`: `modo_calculo directo|distribucion`, `modo_valor fijo|formulado` con **fórmulas AEL** (DSL propio: `packages/ael-language`, `ael-runtime`), prioridad, orden topológico con detección de ciclos, alcance `todos|calculado` con condiciones sobre atributos del inmueble, recurrencia `recurrente|unico|por_periodo|novedad` + periodicidad bimensual…anual.
- **Maker-checker** de conceptos: borrador→en_revision→activo, aprobador ≠ enviador, contenido editable solo en borrador.
- **Historial append-only** de versiones con hash SHA-256 (`concepto_versiones`).

### 1.3 Coeficientes e inmuebles
- `coeficiente_sets` con **un solo set vigente** (índice parcial único), reemplazo vigente→histórica controlado por trigger. El motor **no asume suma = 1**: normaliza por la suma real; si no suma 1 es *aviso*, no bloqueo, citando Ley 675 art. 26.

### 1.4 Liquidación en dos tiempos (L0–L7) — el corazón del flujo
Máquina de estados `pre_liquidada → pendiente_aprobacion → aplicada`, con salidas `descartada/rechazada/anulada/fallida`:

1. **Simular** (Edge Function `simular-liquidacion`): construye snapshot inmutable → ejecuta el motor puro → persiste vía `fn_crear_preliquidacion` que descarta la corrida anterior, sella el escenario (`fn_liquidacion_sello_datos`, md5 sobre coeficientes/unidades/conceptos/presupuesto/novedades/política/vencimiento) e inserta cabecera+líneas en UNA transacción. Índices parciales hacen del descarte un invariante de BD.
2. **Solicitar/Aprobar**: solo administrador aprueba/rechaza/anula (`guard_liquidacion_transicion`); autoaprobación permitida deliberadamente (justificado con Ley 675 art. 51).
3. **Aplicar** (Edge Function + `fn_aplicar_liquidacion`): lock `FOR UPDATE` del periodo → revalida sello de datos → revalida prevuelo (gates) dentro del lock → INSERT…SELECT de cargos desde líneas → cargos de novedades → cierre del periodo → estados de cuenta por lote. Todo o nada.
4. **Pre-vuelo** (`fn_liquidacion_prevuelo`): bloqueos (periodo no abierto, sin vencimiento, periodos anteriores sin liquidar, sin set vigente, unidad sin coeficiente, presupuesto descuadrado) vs avisos (coeficientes ≠1, sin presupuesto vigente, cuentas sin mapeo contable, unidades sin responsable, novedades pendientes, variación >15%).
5. **Anular** (L6): por contra-cargos espejo (`cargo_reversado_id`), nunca borrado; prohibido si hay pagos imputados; reabre el periodo.

### 1.5 Cartera / estado de cuenta
- Ledger append-only: `cargos` (capital/interes/otro/descuento), `pagos`, `pago_aplicaciones`, saldo derivado en vista `v_cargo_saldo`.
- **Imputación de pagos** waterfall greedy con estrategias `deuda_mas_antigua|periodo_actual` y orden categoría interés→capital→otro.
- **Interés de mora**: devengo diario solo sobre capital pendiente (no compone), días de gracia, day-count configurable, tope legal aplicado, segmentación por tramos de tasa certificada.
- **Cobranza completa**: clasificación de cartera, escalamiento por etapas, promesas de pago (sin maker-checker), acuerdos de pago (con maker-checker, condonación exige acta — art. 48 L675), jurídico con certificaciones anulables-inmutables, job diario puro con hash de reproducibilidad.
- **Descuento por pronto pago** al imputar el pago, dos modos (`reduce_deuda|saldo_a_favor`).

---

## 2. Motor financiero

**Fortalezas (verificadas):**
- **Decimal, nunca float**: `decimal.js` clonado a precisión 34 como única puerta; eslint prohíbe importar decimal.js fuera del kernel; igualdad exacta sin epsilon; frontera Decimal→number acotada y validada para unidades residuales.
- **Reparto mayor-resto** con floor + residual por mayor resto, desempate determinista por id, reconciliación exacta Σ=fuente. Doble reparto anual→12 periodos→inmuebles con el mismo motor. Reconciliaciones R1/R3/R4 redundantes por diseño.
- Intereses no componen sobre intereses; piso cero con descuentos; redondeo único al final incluso segmentado.

### Hallazgos del motor

| # | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| H1 | **ALTA** | **Sumas monetarias en float JS en el snapshot builder**: `sumaPorCodigo` acumula `valor_aplicado` con `+` numérico antes de envolverlo en `money()`, y `saldoActual` ídem. Viola la regla propia decimal-only del kernel. | `snapshot-supabase.ts:386`, `:155` |
| H2 | **ALTA** | **Sin prorrateo temporal por inmueble**: un inmueble activo paga la cuota del mes completo aunque se integre/retire a mitad de periodo. Hoy la única vía es crear manualmente una novedad DISCOUNT — paso manual frágil y propenso a omisión. | `snapshot-supabase.ts:222-228`, `executor.ts:118,159` |
| H3 | **MEDIA** | **Créditos/saldos a favor no compensan la base de mora**: `calcularInteresMora` ignora cargos negativos. Un inmueble con saldo a favor en un periodo sigue causando mora sobre capital vencido de otro periodo. | `cuenta-corriente.ts:401-413` |
| H4 | **MEDIA** | Solo `DISCOUNT` reduce base de mora cuando se activa `descuento_antes_interes`; `CREDIT`/`REFUND` nunca la reducen aunque económicamente sean equivalentes. Semántica inconsistente entre tipos de novedad. | `cuenta-corriente.ts:268-277` |
| H5 | **BAJA/MEDIA** | `p_snapshot_hash` es en realidad el **result hash**: funciona como control optimista pero contradice la documentación del esquema y encadena dos corridas completas del motor por aplicación. | `simular-liquidacion/index.ts`, `aplicar-liquidacion/index.ts` |
| H6 | **BAJA** | `contarUnidadesResiduales` convierte a `number` — acotado por construcción, pero cualquier cambio futuro a escala 2 multiplica ×100 el conteo. | `financial-operation-service.ts:87-93` |

---

## 3. Reglas SQL: integridad, idempotencia, concurrencia, versionamiento

**Fortalezas:**
- Transaccionalidad real en aplicar (`fn_aplicar_liquidacion`): lock + sello + gates + escrituras en una transacción.
- Inmutabilidad estructural: append-only en `cargos/pagos/pago_aplicaciones/concepto_versiones/tasas_referencia`; resultado de liquidación inmutable.
- Concurrencia: locks de periodo en crear y aplicar; unicidad parcial "una viva / una aplicada" por periodo.
- Máquinas de estado con guards de transición en liquidaciones, periodos, novedades, conceptos, acciones de cobranza, acuerdos.
- Trazabilidad maker-checker estampada desde `auth.uid()`, nunca del cliente.

### Hallazgos SQL

| # | Severidad | Hallazgo | Evidencia |
|---|---|---|---|
| S1 | **ALTA** | **`fn_aprobar_novedad` no es idempotente ni está protegida contra carrera**: la RPC no revalida `estado='pendiente'`; una segunda invocación (doble clic, reintento, carrera TOCTOU) inserta un **cargo duplicado**. La protección vive solo en la Edge Function, fuera de la transacción. | `20260827100000:150-201`, guard `20260816110000:56-58` |
| S2 | **MEDIA** | La validación del tope legal de mora es **opt-in**: si `interes_tipo_tasa`/`interes_multiplicador` son NULL el trigger retorna sin validar. Políticas sin declarar fuente escapan al control legal. | `20260822220000_cartera_tasas_referencia.sql:124-126` |
| S3 | **MEDIA** | **Concepto activo puede volver a `borrador`** y editarse. Las líneas de liquidación guardan `concepto_id`, no la versión — sin congelamiento puntual de la definición usada. | `20260818100100:52-58`; `liquidacion_lineas.concepto_id` sin FK a versión |
| S4 | **BAJA** | Estados de cuenta por lote dentro de la transacción de aplicar: riesgo reconocido de lock prolongado en tenants grandes (plan de salida documentado pero no implementado ni medido). | `20260830620000` |
| S5 | **BAJA** | Anulación prohibida tras el primer pago imputado — correcto, pero no existe aún el camino complementario guiado de "ajuste". | `20260830630000:25-34` |

---

## 4. Cartera

Bien cubierta: tasas de referencia globales append-only con exclusion constraint anti-solape, intereses idempotentes por cargo, clasificación/escalamiento/jurídico/promesas/acuerdos coherentes con el job puro. Brechas: H3/H4 arriba (compensación de créditos), S2 (tope opt-in), y la **resolución de destinatarios de acciones de cobranza no existe todavía** (`cartera-job.ts:14-25` lo admite): el ciclo de cobranza automático no puede cerrar sin esa pieza.

---

## 5. Riesgos legales/fiscales colombianos

1. **Correcto y destacable**: tope de mora modelado como 1,5× IBC certificado por la Superfinanciera (art. 30 Ley 675/2001), con resolución trazable — *no* el "1% mensual" que suele citarse de memoria. Fondo de imprevistos ≥1% del presupuesto sembrado en PUC.
2. **Riesgo S2**: tope legal exigible solo si el tenant declara tipo/multiplicador — un tenant mal configurado podría superar el tope sin rechazo de BD.
3. **H2**: cobrar cuota completa a quien ingresa a mitad de mes contradice práctica esperada en PH; hoy depende de disciplina manual (riesgo de cobro indebido).
4. **H3**: causar mora pese a saldo a favor es atacable comercial/legalmente.
5. Acuerdos de pago: composición discriminada art. 48 L675 y condonación con acta — bien alineados. Certificación para jurídico con anulación inmutable y motivada — bien.

---

## 6. Consistencia TypeScript ↔ SQL

`database.generated.ts` está **actualizado** con las migraciones más recientes: contiene `sello_datos`, `avisos_aceptados`, `novedad_cuotas`/`prorrateable`, `interes_day_count_t`, `descuento_pronto_pago_*`. No se detectó desincronización material. Observación menor: el mapeo `alcance_condiciones as unknown as ...` es un cast ciego de jsonb — un cambio de forma fallaría en runtime, no en compile-time.

---

## 7. Tests: cobertura y huecos

Existen suites sólidas de RLS/tenancy/liquidación, incluida `flujo-dos-tiempos.test.ts`. **Escenarios críticos NO cubiertos:**

1. **Concurrencia**: ninguna prueba de dos `fn_aplicar_liquidacion` simultáneos ni de doble aprobación de novedad (S1).
2. **Liquidación retroactiva / re-apertura tras anular con pagos posteriores**: el camino post-pago (ajuste) no tiene test ni flujo.
3. **Cambio de coeficiente_set a mitad de año**: efecto sobre periodos ya liquidados vs por liquidar.
4. **Inmueble nuevo/retirado a mitad de periodo** (H2).
5. **Cierre contable**: `contable_movimientos()`/proyección y contrapartidas sin tests de integración.
6. **Descuento por pronto pago**: sin test encontrado.
7. **Interés con cambio de tasa a mitad de mora** (segmentos): probado unitario, no end-to-end contra BD.
8. **Saldo a favor vs mora** (H3): sin test que fije el comportamiento actual.

---

## 8. Preparación para módulos futuros (cartera avanzada, finanzas, mantenimiento, contabilidad)

El modelo **facilita** mucho: ledger append-only único del que derivan ejecución presupuestal, contabilidad (puentes de mapeo PUC ya sembrados), estados de cuenta y cartera — movimientos contables derivados es exactamente la arquitectura correcta para crecer hacia finanzas/contabilidad. Lo **dificulta**: la resolución de destinatarios ausente (bloquea automatizar cobranza), la falta de prorrateo temporal (mantenimiento/ocupación lo necesitarán), y la semántica de créditos dispersa (cuatro mecanismos de "dinero a favor" con reglas distintas).

---

## Las 8 brechas prioritarias antes de crecer

1. **Cerrar S1**: revalidar estado y serializar `fn_aprobar_novedad` (chequeo dentro de la RPC + lock o transición exclusiva pendiente→aprobada que falle en segundo intento).
2. **Eliminar floats de dinero en `snapshot-supabase.ts`** (H1): sumar con Decimal.
3. **Definir y automatizar prorrateo de inmuebles a mitad de periodo** (H2) — mayor riesgo de cobro indebido y requisito duro del mercado.
4. **Política de compensación de créditos contra mora y entre periodos** (H3/H4): decidir y hacerla consistente entre CREDIT/REFUND/DISCOUNT/saldo_a_favor.
5. **Hacer obligatoria la trazabilidad del tope legal** (S2): exigir `interes_tipo_tasa`+`multiplicador` no nulos para políticas vigentes nuevas.
6. **Tests de concurrencia y de los caminos de dinero críticos** (doble aplicar, doble aprobar novedad, pronto pago, segmentos de tasa end-to-end, anulación con pagos).
7. **Resolver destinatarios de acciones de cobranza** antes del módulo de cartera avanzada.
8. **Versionar el contenido efectivo usado por cada liquidación** (S3): congelar definición de concepto (versión) en `liquidacion_lineas` o endurecer la transición activo→borrador.

---

## Veredicto general

La arquitectura de dominio es notablemente madura — decimal exacto, reconciliaciones exactas, dos tiempos con sello/hash/lock, append-only integral, normativa colombiana correctamente interpretada (Ley 675 arts. 26, 30, 48, 51). Los riesgos concentrados son de *casos borde temporales* (prorrateo, créditos), *una idempotencia débil* (novedades) y *huecos de prueba* en los caminos concurrentes y contables.
