-- ═══════════════════════════════════════════════════════════════════════
--  Fix: v_cargo_saldo no heredó cargos.fecha_vencimiento (GAP-CAR-001,
--  20260823180000)
--
--  v_cargo_saldo se definió como `select c.*, ... from cargos c`
--  (20260816100000). En Postgres, `c.*` se expande a la lista de columnas
--  vigente AL MOMENTO de crear la vista — agregar una columna nueva a
--  `cargos` después no la propaga automáticamente a la vista. Peor: un
--  `create or replace view ... select c.*` directo falla, porque el `*`
--  ahora incluye fecha_vencimiento ANTES de monto_pendiente en el orden
--  físico de la tabla, lo que Postgres interpreta como "renombrar
--  monto_pendiente" (42P16 — CREATE OR REPLACE solo permite agregar
--  columnas AL FINAL de la lista de salida, nunca en medio). Se
--  reemplaza `c.*` por la lista explícita de columnas originales (mismo
--  orden que hoy tiene la vista, verificado contra information_schema),
--  con fecha_vencimiento agregada al final, después de monto_pendiente.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view public.v_cargo_saldo with (security_invoker = true) as
select
  c.id,
  c.tenant_id,
  c.inmueble_id,
  c.periodo_id,
  c.categoria,
  c.origen_tipo,
  c.liquidacion_linea_id,
  c.novedad_id,
  c.cargo_capital_origen_id,
  c.concepto_id,
  c.monto_original,
  c.created_at,
  c.monto_original - coalesce(
    (select sum(pa.monto) from public.pago_aplicaciones pa where pa.cargo_id = c.id), 0
  ) as monto_pendiente,
  c.fecha_vencimiento
from public.cargos c;

comment on view public.v_cargo_saldo is
  'cargos + monto_pendiente derivado — nunca fuente de verdad, se recalcula en cada consulta '
  '(mismo principio que fondos.saldo_actual, adaptado a una tabla append-only). '
  '[20260823190000: columnas explícitas en vez de c.*, para poder agregar '
  'fecha_vencimiento al final sin romper CREATE OR REPLACE VIEW — GAP-CAR-001].';
