# PROMPT — Conciliación bancaria contable (instrumento real de validación banco ↔ libros)

> Documento de encargo para una sesión de implementación futura. Escrito tras auditar el
> código real (no lo que un doc anterior asumía) el 2026-09-13. **Antes de ejecutar este
> prompt, releer §3 contra el código vigente** — puede haber cambiado desde esta fecha,
> mismo criterio que el resto de memorias/roadmaps del repo.

## 0. Encargo del usuario, literal

> "Necesito implementar la conciliación bancaria, que a esta altura del proyecto no se ha
> realizado. La idea es hacerla de tal forma que sea un **real instrumento de validación y
> comparación bancaria contra los movimientos contables**."

Dos palabras hacen el encargo preciso y lo distinguen de lo que ya existe (§3): **"contra los
movimientos contables"**. Lo que hoy vive en el repo concilia banco↔residente (¿quién pagó?),
no banco↔libro (¿cuadra el saldo de caja según el banco con el saldo de caja según la
contabilidad?). Este prompt es para lo segundo.

---

## 1. Estándares y mejores prácticas consultadas

Investigación puntual (WebSearch, 2026-09-13) sobre la práctica estándar de conciliación
bancaria en control financiero — no reinventar el proceso, alinear el diseño con él:

- **El método de las dos columnas.** Se parte del saldo según banco y del saldo según libros
  por separado, cada uno se ajusta por las partidas que el OTRO lado todavía no conoce, hasta
  que ambos llegan al mismo saldo conciliado. No se "edita" ninguno de los dos directamente.
  - *Ajustes al saldo banco*: depósitos en tránsito (ya en libros, el banco aún no los
    procesó) y cheques/pagos girados aún no cobrados ("outstanding checks").
  - *Ajustes al saldo libros*: lo que el banco ya sabe y los libros no — comisiones,
    intereses, notas débito/crédito, domiciliaciones (ACH), pagos devueltos. Estos SÍ generan
    una entrada contable nueva (asiento de ajuste) — es la única partida de las cuatro que
    termina en un comprobante nuevo, nunca en editar uno existente.
- **Segregación de funciones.** Quien concilia no debe ser quien registra los recaudos/pagos
  ni quien firma cheques; quien aprueba la conciliación no debe ser quien la preparó — mismo
  principio de maker-checker que el repo ya aplica en cartera (art. 48, certificación) y en
  FIN-3 (`aprobar_lote`/`ejecutar_lote` por roles separados).
- **Frecuencia**: mensual como mínimo, alineado al cierre del período contable de AQUILA
  (`periodos`); cuentas de alto volumen se concilian con más frecuencia, pero el cierre formal
  sigue siendo mensual.
- **Partidas conciliatorias con antigüedad ("aged reconciling items")**: una partida abierta
  que envejece (cheque girado hace 3 meses y no cobrado, depósito en tránsito de hace 2
  semanas) es en sí misma una señal de riesgo — el repo ya tiene el concepto (control
  `BANCOS_CONCILIACION_PENDIENTE`, ver §3.6), hay que conectarlo, no reinventarlo.
- **KPIs de la industria**: % de partidas auto-cruzadas sin intervención humana, tiempo de
  ciclo (de recibido el extracto a conciliación cerrada), antigüedad de partidas abiertas,
  tasa de error. El repo ya tiene un precedente de este KPI para el motor de recaudo
  (`medirAutoConciliacion`, §3.2) — extender el mismo principio al nuevo motor contable.
- **Auditoría y trazabilidad**: cada conciliación cerrada debe quedar como un artefacto
  inmutable con quién la preparó, quién la certificó y cuándo — no un cálculo que se puede
  recalcular distinto mañana. Coincide exactamente con el patrón `append-only` +
  `audit_log` que ya usa todo el repo (cartera, fondos, comprobantes contables).

Fuentes: [SOG UNC — The Bank Reconciliation: A Key Internal Control](https://canons.sog.unc.edu/blog/2024/04/08/the-bank-reconciliation-a-key-internal-control-in-financial-management/) ·
[SolveXia — Internal Control Bank Reconciliation](https://www.solvexia.com/blog/internal-control-bank-reconciliation) ·
[Numeric — Bank Reconciliations: Steps, Examples, Best Practices](https://www.numeric.io/blog/bank-reconciliation) ·
[Washington SAO — Best Practices for Bank Reconciliations (PDF)](https://sao.wa.gov/sites/default/files/2026-03/2026%20Best%20Practices%20for%20Bank%20Reconciliations.pdf) ·
[Numeric — Automating Bank Reconciliations](https://www.numeric.io/blog/bank-reconciliation-automation) ·
[ScryAI — Account Reconciliation Metrics / KPIs 2026](https://scryai.com/blog/account-reconciliation-metrics/)

Nada de esto es exótico — es exactamente lo que un contador colombiano de PH espera ver. El
valor de este prompt es traducirlo a lo que YA existe en AQUILA sin duplicar motor, no
importar un concepto nuevo.

---

## 2. Glosario — 4 cosas del repo se llaman "conciliación" y NO son lo mismo

Confundir estas cuatro cuesta caro (releer código equivocado, tocar lo que no se debe). Antes
de escribir una sola línea, tener clarísimo cuál de las cuatro es cuál:

| # | Nombre en el repo | Qué compara | Dónde vive | Estado |
|---|---|---|---|---|
| 1 | **Conciliación de RECAUDO** (banco↔residente) | Una línea de extracto bancario contra qué inmueble/propietario la pagó | `extracto_bancario`/`extracto_linea`/`conciliacion_propuesta`, `conciliacion-matching.ts`, Edge Functions `importar-extracto-bancario`/`conciliar-linea` | **Backend completo y probado. Cero UI.** |
| 2 | **`contable_conciliacion_cartera`** | Lo que `contable_movimientos()` (proyección legacy) dice que debería existir vs. lo que `contable_comprobante_detalle` (materializado, CO-3) realmente tiene | Función SQL interna de CO-3, migración `20260930240000` | Herramienta de auto-verificación del propio motor contable, no del banco. **No tocar, no confundir.** |
| 3 | **`fn_finanzas_conciliar_lote`** | Un lote de pago saliente (FIN-3) ejecutado ↔ la línea de extracto que el usuario confirma que le corresponde | `finanzas_lotes_pago.extracto_linea_id`, migración `20260931290000` | Hecha, es solo una etiqueta pasiva de solo lectura — no valida nada, solo enlaza. |
| 4 | **Conciliación bancaria CONTABLE (banco↔libro, este prompt)** | El saldo del extracto bancario completo (todas las líneas, positivas y negativas) contra el saldo de la cuenta contable de bancos (`contable_comprobante_detalle` vía `cuentas_bancarias.contable_cuenta_id`) | **No existe.** | **Esto es lo que hay que construir.** |

La 1, 2 y 3 quedan intactas. Este prompt es exclusivamente sobre la 4, pero la 4 **reutiliza**
el esquema, los parsers y la ingesta de la 1 (mismo `extracto_bancario`/`extracto_linea` —
no se importa el archivo dos veces por dos motores distintos) y puede referenciar el enlace
pasivo de la 3.

---

## 3. Qué existe hoy, verificado contra el código (no contra ningún doc)

### 3.1 Esquema de ingesta y matching de recaudo — completo
`supabase/migrations/20260904170000_conciliacion_esquema.sql` (+
`20260904180000_storage_extractos_bancarios.sql`):
- `extracto_bancario` (archivo importado, hash de archivo único por tenant → reimportar no
  duplica), `extracto_linea` (cada movimiento, hash de línea único, máquina de estados
  `pendiente → {conciliada_auto|conciliada_manual|descartada}`, terminal, trigger
  `guard_conciliacion_transicion`), `conciliacion_propuesta` (candidatos, nunca aplica dinero
  sola). Ninguna de las tres tiene política de INSERT/UPDATE para `authenticated` — todo pasa
  por Edge Function con `service_role`, mismo criterio que `pagos`.
- **No hay `cuenta_bancaria_id` en `extracto_linea`** — vive en `extracto_bancario` (nullable,
  la Edge Function de importación lo recibe opcional). Para la conciliación contable (§6) hace
  falta que sea confiable: ver decisión D-CB-2.

### 3.2 Motor puro de matching — completo
`packages/liquidation-engine/src/conciliacion-matching.ts` (+ `conciliacion-parsers.ts`,
`conciliacion-supabase.ts`). Cascada determinista: referencia estructurada exacta → score 1 →
auto; monto exacto + ventana ±5 días → score 1 → auto (solo si un único candidato); heurístico
(similitud de nombre vía `fn_similitud_pagadores`, pg_trgm) → SOLO propone, nunca auto-aplica;
sin candidato → cola manual. Un monto ≤ 0 nunca es candidato a pago (`no_es_pago`) — **y ahí
se pierde el rastro**: hoy nada vuelve a mirar esas líneas negativas. Son justo las que la
conciliación contable necesita (comisiones, cheques, traspasos).
`medirAutoConciliacion()` ya calcula el KPI de industria (% auto-conciliado sobre candidatas a
pago) — precedente a replicar para el nuevo motor.

### 3.3 Ingesta — completa, un banco
`conciliacion-parsers.ts`: un solo parser real, `parserBancolombia`, contra un **formato
sintético no verificado con un archivo real** (documentado así en el propio código y en
DECISIONES.md). Solo CSV — XLSX está permitido en el bucket pero la Edge Function lo rechaza
explícitamente (`MIME_PERMITIDOS` solo CSV) porque no hay parser que lo lea todavía.

### 3.4 Edge Functions — completas
`supabase/functions/importar-extracto-bancario/index.ts` (multipart, sube a Storage, idempotente
en dos niveles, rollback de Storage si falla la inserción) y `conciliar-linea/index.ts`
(`aplicar_a_inmueble` / `crear_saldo_a_favor` / `descartar` — las tres pasan por
`registrarPago()`, nunca insertan en `pagos` por su cuenta; las tres quedan en `audit_log`).
Rol exigido: `auxiliar`. Rate-limited.

### 3.5 UI — **no existe ninguna pantalla**
`apps/web/app/pages/finanzas/` tiene `posicion.vue`, `facturas/`, `pagos/`, `flujo-proyectado.vue`,
`tablero.vue` — nada de conciliación. Ningún store (`stores/conciliacion*.ts` no existe). Un
usuario real no puede hoy subir un extracto ni resolver una línea desde el producto — el motor
entero es alcanzable solo por HTTP directo a la Edge Function. Esto es lo que el resumen de la
memoria de Fondos llama correctamente "backend completo, cero UI enlazada".

### 3.6 El puente banco↔contabilidad — ya existe, sin usar todavía
`supabase/migrations/20260830460000_contable_puentes_mapeo.sql` (PC-3):
`cuentas_bancarias.contable_cuenta_id` (FK a `contable_cuenta`, validado por trigger
`guard_cuenta_bancaria_contable` a que caiga en el grupo 11 — efectivo y equivalentes). Esta
es la pieza que hace VIABLE la conciliación contable real sin inventar esquema de mapeo desde
cero: cada cuenta bancaria ya sabe a qué cuenta del plan de cuentas corresponde (111005
corriente, 111010 ahorros, 111015 fondo de imprevistos, etc.).

### 3.7 El libro — dos fuentes, una es la real
- `contable_movimientos()` — proyección **legacy**, calculada al vuelo desde
  cargos/pagos/presupuesto_ejecucion/fondo_movimientos. Sirve hoy solo como oráculo de
  verificación interna de CO-3 (glosario #2), no es lo que leen libro mayor/balance de
  prueba/estados financieros ya construidos.
- `contable_comprobante` / `contable_comprobante_detalle` — el libro **persistido y real**
  (CO-2..CO-7), con estado `borrador/contabilizado/anulado`, inmutable una vez contabilizado.
  Es la fuente que alimenta libro mayor, balance de prueba y estados financieros. **Esta es la
  que debe usar la conciliación bancaria contable** (decisión D-CB-1, confirmar con el
  usuario, pero no hay ambigüedad real: es la única de las dos que es un libro de verdad).

### 3.8 Auditoría — el control ya está definido, apuntando al hueco equivocado
`BANCOS_CONCILIACION_PENDIENTE` (`CTRL-BAN-001`, `20260917100000`) ya evalúa líneas de
`extracto_linea` en `pendiente` que envejecen — es el control de la conciliación #1 (recaudo),
no de la #4 (contable). Cuando exista la conciliación contable, considerar un control hermano
(`CTRL-BAN-002`?) sobre períodos sin certificar / partidas conciliatorias envejecidas — no
obligatorio para el primer corte, dejar la puerta documentada.

---

## 4. Diagnóstico

Lo construido responde "¿quién pagó esta transferencia?" (útil, correcto, pero es AR — cuentas
por cobrar). El usuario pide "¿el saldo de banco cuadra con el saldo de libros, y si no, por
qué?" — eso es control de tesorería/caja, un instrumento distinto aunque comparta la materia
prima (el mismo extracto importado). Hoy, si un banco cobra una comisión de $15.000, la línea
de extracto correspondiente cae en `no_es_pago` y nunca más se vuelve a mirar — nadie se entera
de si esa comisión está o no contabilizada. Ese es el hueco real que hace que "conciliación
bancaria" no sea hoy, en ningún sentido de auditoría/contaduría, un hecho cumplido en AQUILA —
coincide con lo que ya señalaban `ANALISIS_FONDOS_BLOQUE_A.md §11` y D-59/D-36 (Modelo §36
"sin movimientos no conciliados" sigue sin hacerse cumplir).

---

## 5. Alcance propuesto — dos entregables, no confundir su orden

### Entregable A — Cerrar la UI del motor de recaudo ya construido
Barato, cero backend nuevo, y es requisito de facto para el entregable B (la conciliación
contable necesita poder ver qué pasó con cada línea, incluidas las que el motor de recaudo
ya resolvió). Pantalla(s) bajo `apps/web/app/pages/finanzas/conciliacion/` (o
`tesoreria/conciliacion/` si el usuario prefiere agrupar ahí — decisión D-CB-6):
- Importar extracto (selector de cuenta bancaria + subir CSV) → llama
  `importar-extracto-bancario`, muestra el resumen (`ResumenImportacion`: nuevas, ya existían,
  auto-conciliadas, propuestas, sin candidato, no es pago).
- Bandeja: lista de `extracto_linea` filtrable por estado/cuenta/rango de fecha, con las
  `conciliacion_propuesta` de cada línea pendiente visibles (score + explicación, tal como ya
  la modela el esquema).
- Resolver una línea: aplicar a inmueble / crear saldo a favor / descartar con motivo → llama
  `conciliar-linea`.
- KPI de `medirAutoConciliacion()` visible (% auto-conciliado del período) — exponerlo (nueva
  función RPC de solo lectura o extender una Edge Function existente; no hay hoy ningún
  endpoint que lo sirva al cliente).

### Entregable B — El instrumento real: conciliación bancaria contable
Por `cuenta_bancaria_id` + período (mensual, alineado a `periodos`):
1. **Saldo según banco**: saldo inicial (del período anterior conciliado, o 0 en el primero) +
   Σ `extracto_linea.monto` del período (TODAS las líneas, incluidas negativas — a diferencia
   del motor de recaudo, aquí no se descarta nada) = saldo final banco.
2. **Saldo según libros**: saldo inicial (mismo criterio) + Σ (débitos − créditos) de
   `contable_comprobante_detalle` donde `cuenta_id = cuentas_bancarias.contable_cuenta_id` y
   `contable_comprobante.estado = 'contabilizado'`, en el rango de fechas del período = saldo
   final libros.
3. **Cruce**: cada línea de banco intenta emparejarse con una línea de libro por monto + fecha
   (ventana) + referencia — mismo espíritu de cascada que `conciliacion-matching.ts`, pero acá
   el resultado NUNCA auto-aplica nada (a diferencia del motor de recaudo, que sí auto-concilia
   los casos deterministas): esto es una comparación de dos verdades ya existentes, no una
   decisión de a quién pertenece el dinero.
4. **Partidas no cruzadas**, clasificadas (ver `lista_tipos` propuesto en §6):
   - En banco, no en libros → depósito en tránsito (si es positivo y reciente) o nota
     débito/crédito bancaria sin registrar (comisión, GMF/4×1000, rendimiento) — esta última
     categoría es la que exige una acción real: crear un comprobante contable en borrador
     (`contable_comprobante`, `origen_modulo='conciliacion_bancaria'`) para que un auxiliar lo
     revise y contabilice — la conciliación NUNCA lo contabiliza sola (misma regla de oro que
     el motor de recaudo nunca inserta en `pagos` directamente).
   - En libros, no en banco → cheque/pago girado aún no cobrado, o transferencia saliente
     (lote de pago FIN-3) que aún no aparece en el extracto — aquí sí puede reutilizar
     `finanzas_lotes_pago.extracto_linea_id` (glosario #3) como pista, sin depender de que
     exista.
5. **Certificación**: cuando saldo final banco (ajustado) = saldo final libros (ajustado), el
   período queda `certificada` — snapshot inmutable con quién preparó y quién certificó
   (segregación de funciones, §1) — nunca recalculable "en caliente" después de certificado,
   mismo criterio append-only que el resto del repo.

---

## 6. Decisiones de diseño a cerrar ANTES de programar

Seguir la cultura del repo: estas se cierran explícitamente con el usuario y quedan como D-xx
en `DECISIONES.md`, no se infieren en silencio (PLAN §9.2: "inventar tablas/roles/políticas no
cerradas en el plan" está prohibido).

- **D-CB-1 — Fuente del lado "libros".** Recomendación de este prompt:
  `contable_comprobante_detalle` con `estado='contabilizado'` (§3.7), no
  `contable_movimientos()`. Confirmar — es la decisión más importante de todas, cambia todo el
  diseño de abajo si se decide lo contrario.
- **D-CB-2 — `extracto_linea` necesita saber su `cuenta_bancaria_id` de forma confiable.** Hoy
  vive en `extracto_bancario.cuenta_bancaria_id`, nullable. Opciones: (a) exigirlo NOT NULL
  para extractos nuevos (rompe nada retroactivo porque nadie usa esto en producción todavía,
  verificar); (b) dejarlo nullable y que la conciliación contable simplemente excluya
  extractos sin cuenta asignada, con aviso explícito en la UI. Recomendación: (a) — un extracto
  sin cuenta bancaria conocida no es conciliable contablemente por definición, mejor forzarlo
  en el punto de importación que descubrirlo tarde.
- **D-CB-3 — Tablas nuevas (borrador, sujeto a revisión).**
  - `conciliacion_bancaria` (cabecera): `tenant_id`, `cuenta_bancaria_id`, `periodo_id` (FK a
    `periodos`, no un rango de fechas suelto — reutilizar el concepto de período que ya
    gobierna cierres en todo el repo), `saldo_inicial_banco`, `saldo_final_banco`,
    `saldo_inicial_libros`, `saldo_final_libros`, `estado`
    (`borrador|certificada`, dos estados igual que la simplificación D-45 de CO-2, no seis),
    `preparado_por`, `preparado_at`, `certificado_por`, `certificado_at`. `ENABLE + FORCE RLS`
    en la misma migración (PLAN §9.1, no negociable). Único índice por
    `(tenant_id, cuenta_bancaria_id, periodo_id)` — una sola conciliación por cuenta y
    período.
  - `conciliacion_bancaria_partida` (líneas no cruzadas): `conciliacion_id`, `origen`
    (`banco|libro`), `tipo` (contra `lista_tipos` — `deposito_transito`,
    `nota_debito_banco`, `nota_credito_banco`, `cheque_pendiente`, `partida_salida_pendiente`,
    `otro`; **lista_tipos, no enum** — es vocabulario descriptivo sobre una partida, no un
    valor que gatille una transición de estado real, mismo criterio que
    `feedback_priorizar_lista_tipos_sobre_enums`), `extracto_linea_id` nullable,
    `contable_comprobante_detalle_id` nullable, `monto`, `descripcion`, `resuelta` boolean
    (para cuando la partida se aclara sin cerrar toda la conciliación — p. ej. el cheque por
    fin se cobra el mes siguiente).
  - Ninguna de las dos necesita política de INSERT/UPDATE para `authenticated`: el patrón ya
    establecido (glosario #1) es que el cálculo y la certificación pasan por Edge Function con
    `service_role`, con el rol verificado explícitamente dentro — mismo criterio de seguridad
    que "decidir si un movimiento bancario se convierte en algo real" (comentario textual de
    `20260904170000`).
  - Evaluar si `guard_conciliacion_bancaria_transicion` necesita ser tan estricto como
    `guard_conciliacion_transicion` (terminal, sin vuelta atrás) — probablemente sí:
    "certificada" debe ser terminal, reabrir exige un proceso explícito nuevo (o directamente
    no se permite, y un error se corrige con una conciliación del período siguiente que
    arrastra el ajuste — a decidir con el usuario, es una decisión de negocio/auditoría, no
    solo técnica).
- **D-CB-4 — Rol para certificar.** El motor de recaudo exige `auxiliar` para resolver una
  línea. Dado que certificar una conciliación es un control de cierre (segregación de
  funciones, §1), evaluar si debe exigir un rol superior (`agent`/administrador) distinto del
  que la preparó — mismo espíritu que el maker-checker de FIN-3
  (`aprobar_lote`/`ejecutar_lote`) y el art. 48 de cartera. Confirmar el nombre exacto de rol
  disponible en `tenant_role_t` antes de codificar (no asumir "administrador" sin verificar
  contra el enum real).
- **D-CB-5 — Notas débito/crédito bancarias sin registrar: ¿quién crea el comprobante?** La
  conciliación identifica la partida; recomendación de este prompt: un botón explícito "crear
  comprobante contable" desde la partida no cruzada, que abre un borrador prellenado
  (fecha, monto, cuenta banco ya resuelta vía `cuentas_bancarias.contable_cuenta_id`,
  contrapartida a elegir por el auxiliar — comisión bancaria, GMF, rendimiento financiero) en
  el módulo de comprobantes ya existente (CO-2) — la conciliación NUNCA inserta directo en
  `contable_comprobante_detalle`, solo pre-arma los datos y deja que el flujo normal de
  comprobantes (con sus propias guardas de inmutabilidad) haga el resto.
- **D-CB-6 — Ubicación en el menú/rutas.** `finanzas/conciliacion` (junto a lo que ya hay en
  `apps/web/app/pages/finanzas/`) vs. una sección nueva `tesoreria/`. Recomendación: bajo
  `finanzas/`, coherente con `cuentas_bancarias` y `finanzas_lotes_pago` ya viviendo ahí.

---

## 7. Fases de implementación sugeridas

Cada fase cierra con `pnpm verify` en verde y tests nuevos — no se avanza a la siguiente fase
con la anterior en rojo (regla de oro del repo).

1. **Entregable A completo** (§5-A): pantallas + store + tests de integración reales contra
   Supabase de desarrollo (patrón D-08) para importar/resolver/listar. Esto por sí solo ya
   cierra el hueco "backend completo, cero UI" que señalan tres memorias distintas del repo.
2. **Cerrar D-CB-1..6 con el usuario**, registrar como D-xx en `DECISIONES.md` antes de tocar
   una migración.
3. **Esquema** (§6, D-CB-3): las 2 tablas nuevas + guards + RLS + entrada en `lista_tipos` para
   el catálogo de tipo de partida. `extracto_linea` gana `cuenta_bancaria_id` obligatorio (o
   se resuelve por join, según D-CB-2).
4. **Motor puro de cruce** (nuevo módulo, mismo nivel de pureza que
   `conciliacion-matching.ts` — sin Supabase, 100% testable con fixtures): dado saldo inicial +
   lista de movimientos de banco + lista de movimientos de libro, produce partidas cruzadas y
   no cruzadas + saldos finales de ambos lados. Cobertura 100% si termina viviendo en
   `packages/liquidation-engine/src/**` o `packages/financial-kernel/src/**` (vitest.config.ts
   ya exige 100% ahí).
5. **Adaptador Supabase** + Edge Function(s) (`generar-conciliacion-bancaria`,
   `certificar-conciliacion-bancaria`) — mismo patrón exacto de rate-limit + verificación de
   rol + `audit_log` que `conciliar-linea/index.ts`.
6. **UI del acta de conciliación**: pantalla por cuenta bancaria + período, dos columnas
   (banco/libros) con sus ajustes, botón "crear comprobante" por partida tipo nota
   débito/crédito (D-CB-5), certificar.
7. **(Opcional, no bloqueante)** Control de auditoría hermano de `BANCOS_CONCILIACION_PENDIENTE`
   sobre conciliaciones sin certificar / partidas envejecidas (§3.8).

---

## 8. Definition of Done (hereda PLAN §9.1, específico de este módulo)

- Autorización aplicada en UI Y en RLS/Edge Function (no solo una de las dos).
- Migraciones con `ENABLE + FORCE ROW LEVEL SECURITY` en la misma migración que crea cada
  tabla nueva.
- `pnpm db:types` corrido tras cada migración — nunca tipos escritos a mano.
- Motor de cruce puro con tests unitarios (fixtures determinísticos, sin red) — 100% de
  cobertura si vive en un paquete con ese umbral.
- Tests RLS + integración real contra Supabase de desarrollo para las Edge Functions nuevas
  (patrón D-08, `fileParallelism: false`).
- `tsc --noEmit` / eslint / `supabase db lint` en cero.
- Verificado en navegador de punta a punta (importar extracto real de prueba → ver bandeja →
  generar conciliación → ver partidas → certificar) antes de reportar terminado — no basta con
  que pasen los tests (regla general del repo para cambios de UI).
- `DECISIONES.md` actualizado con las D-CB-x que se cerraron y cómo.

## 9. Prohibiciones explícitas (además de PLAN §9.2 general)

- No tocar la "regla de oro" del motor de recaudo existente: sigue sin escribir en `pagos`
  fuera de `registrarPago()`, sigue sin auto-aplicar heurísticos.
- La conciliación bancaria contable (Entregable B) **nunca** contabiliza sola — como mucho
  pre-arma un borrador de comprobante para que un humano lo confirme (D-CB-5). Auto-contabilizar
  sería repetir, un nivel más arriba, exactamente el error que el propio esquema de recaudo ya
  evita a propósito con los heurísticos.
- No usar `contable_movimientos()` (proyección legacy) como fuente de verdad del lado libros
  sin que el usuario confirme explícitamente lo contrario a la recomendación de D-CB-1.
- No mezclar esta tabla nueva con `contable_conciliacion_cartera` ni con
  `fn_finanzas_conciliar_lote` — son cosas distintas (glosario, §2). Si en algún punto del
  desarrollo parece que "ya existe una función que hace esto", verificar contra el glosario
  antes de asumirlo.
- No reimportar/re-parsear el extracto para el Entregable B — reutilizar
  `extracto_bancario`/`extracto_linea` ya poblados por el Entregable A. Un mismo archivo, dos
  lentes de lectura, nunca dos ingestas.
