-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE E (1/2): tipos de movimiento y origen del hecho.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), D-36.
--
--  QUÉ RESUELVE. `fondo_movimientos` nació con dos tipos (aporte/uso) y sin
--  forma de responder "¿qué hecho originó esto?" más allá de una descripción
--  de texto libre. El Modelo Maestro §11/§12/§33 exige ocho tipos y un origen
--  reconstruible. La tabla sigue siendo la misma y sigue siendo append-only:
--  no se corrige un movimiento, se revierte con otro que lo referencia.
--
--  POR QUÉ ESTA MIGRACIÓN NO USA LOS VALORES NUEVOS. `ALTER TYPE ... ADD
--  VALUE` no permite referenciar el valor recién añadido dentro de la misma
--  transacción (excepto en cuerpos plpgsql, que se parsean al ejecutarse).
--  Todo lo que decide POR TIPO —el signo del saldo, la exigencia de motivo,
--  la coherencia de origen— vive por eso en 20260929120000, la siguiente.
--  Aquí solo se amplía el vocabulario y se abren las columnas de origen.
--
--  NO SE AÑADE `monto` NEGATIVO. El check `monto > 0` se conserva: el signo
--  lo decide el tipo, no el dato. Una reversión es un movimiento del tipo
--  contrario con `reversion_de_id`, no un importe negativo — así el histórico
--  se lee sin tener que interpretar signos, y la proyección contable
--  (bloque D de contable_movimientos) sigue recibiendo importes positivos.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Los seis tipos que faltaban (Modelo §11) ─────────────────────────
alter type public.fondo_movimiento_tipo_t add value 'rendimiento'      after 'uso';
alter type public.fondo_movimiento_tipo_t add value 'traslado_entrada' after 'rendimiento';
alter type public.fondo_movimiento_tipo_t add value 'traslado_salida'  after 'traslado_entrada';
alter type public.fondo_movimiento_tipo_t add value 'ajuste'           after 'traslado_salida';
alter type public.fondo_movimiento_tipo_t add value 'reversion'        after 'ajuste';
alter type public.fondo_movimiento_tipo_t add value 'cierre_remanente' after 'reversion';

comment on type public.fondo_movimiento_tipo_t is
  'Clase de hecho económico del fondo (PLAN §4.3, GAP-22). Enum nativo y no lista_tipos (D-24) '
  'porque el valor decide el signo con que el movimiento entra al saldo y qué soporte exige: '
  'aporte/rendimiento/traslado_entrada suman; uso/traslado_salida/cierre_remanente restan; '
  'ajuste y reversion exigen motivo y —reversion— el movimiento que corrigen. Un rendimiento '
  'NO es un aporte (Modelo §17/§23): son plata de origen distinto y tratamiento contable '
  'distinto, y confundirlos es uno de los criterios de no aprobación del módulo.';

-- ── 2. Fecha del hecho, distinta de la fecha de registro ────────────────
-- created_at dice cuándo se tecleó; fecha dice cuándo ocurrió. Un aporte de
-- abril registrado en mayo debe caer en abril tanto en el reporte del fondo
-- como en la proyección contable.
alter table public.fondo_movimientos
  add column fecha date not null default current_date;

update public.fondo_movimientos set fecha = created_at::date;

comment on column public.fondo_movimientos.fecha is
  'Fecha del hecho económico, no la de captura (created_at). El bloque D de contable_movimientos '
  'ya prefería make_date(periodo) sobre created_at por esta misma razón; ahora hay un campo '
  'explícito para los movimientos sin periodo.';

-- ── 3. Origen del movimiento (Modelo §12/§16/§33) ──────────────────────
-- Todas nullables y todas por una razón distinta: no todo movimiento nace de
-- un recaudo, ni todo uso pasa por banco, ni todo aporte tiene un escaneo el
-- mismo día. `periodo_id` y `liquidacion_id` ya existían desde F2.
alter table public.fondo_movimientos
  add column pago_id           uuid references public.pagos (id),
  add column extracto_linea_id uuid references public.extracto_linea (id),
  add column documento_id      uuid references public.documentos (id),
  add column reversion_de_id   uuid references public.fondo_movimientos (id),
  add column motivo            text,
  add column registrado_por    uuid references public.profiles (id);

comment on column public.fondo_movimientos.pago_id is
  'Recaudo que originó este aporte. Se usa el pago canónico existente — el fondo NO crea un flujo '
  'de pagos paralelo (Modelo §26). Nullable: un traslado autorizado o un rendimiento no vienen de '
  'un pago de propietario.';
comment on column public.fondo_movimientos.extracto_linea_id is
  'Línea de extracto bancario conciliada que respalda el movimiento. Consume la conciliación '
  'existente; el fondo no tiene ni tendrá un motor de conciliación propio (Modelo §22/§46).';
comment on column public.fondo_movimientos.documento_id is
  'Soporte del movimiento (factura, acta, comprobante). Nullable — la exigencia de soporte por '
  'tipo la impone guard_fondo_movimiento (20260929120000), no el esquema.';
comment on column public.fondo_movimientos.reversion_de_id is
  'Movimiento que este revierte. La tabla es append-only: corregir es revertir y volver a '
  'registrar, nunca editar (Modelo §11/§15). Un movimiento se revierte una sola vez '
  '(fondo_movimientos_reversion_unica).';
comment on column public.fondo_movimientos.motivo is
  'Por qué se hizo un ajuste o una reversión. Obligatorio para esos dos tipos — mismo criterio '
  'que novedades.inhabilitada_motivo: una corrección sin razón escrita no es auditable.';
comment on column public.fondo_movimientos.registrado_por is
  'Quién tecleó el movimiento. Distinto de autorizado_por: quien registra y quien autoriza no '
  'deben ser la misma persona cuando el uso exige autorización (segregación de funciones, D-37).';

create index fondo_movimientos_fecha_idx on public.fondo_movimientos (tenant_id, fecha);
create index fondo_movimientos_pago_idx on public.fondo_movimientos (pago_id)
  where pago_id is not null;

-- Un movimiento se revierte una sola vez: sin esto, dos reversiones
-- concurrentes del mismo aporte lo descontarían dos veces del saldo.
create unique index fondo_movimientos_reversion_unica
  on public.fondo_movimientos (reversion_de_id)
  where reversion_de_id is not null;
