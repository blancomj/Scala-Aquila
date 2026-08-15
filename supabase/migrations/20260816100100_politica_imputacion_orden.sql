-- ═══════════════════════════════════════════════════════════════════════
--  Cierra PLAN_MAESTRO_IMPLEMENTACION.md §6.3 (orden de imputación) y AD-36
--  (estrategia de imputación configurable por política).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.politicas_financieras
  add column imputacion_estrategia public.politica_imputacion_estrategia_t
    not null default 'deuda_mas_antigua';

comment on column public.politicas_financieras.imputacion_estrategia is
  'AD-36: qué periodo se sirve primero al imputar un pago — deuda_mas_antigua '
  '(FIFO cruzando periodos) o periodo_actual (prioriza el periodo vigente, '
  'cascadea el resto a la deuda más vieja). El orden de categoría '
  '(imputacion_orden) se mantiene igual en ambas.';

alter table public.politicas_financieras
  alter column imputacion_orden set default '["interes","capital","otro"]'::jsonb;

-- Backfill: la política vigente de GC-001 (20260814100400_seed_gc001.sql) se
-- insertó antes de que este orden existiera y quedó en el default anterior
-- ('[]'). guard_politica_inmutable bloquea el UPDATE porque su estado ya es
-- 'vigente' — se desactiva puntualmente para esta sola sentencia, mismo
-- patrón que 20260815000000_seed_gc001_otros_ingresos.sql.
do $$
begin
  alter table public.politicas_financieras disable trigger guard_politica_inmutable;

  update public.politicas_financieras
     set imputacion_orden = '["interes","capital","otro"]'::jsonb
   where imputacion_orden = '[]'::jsonb;

  alter table public.politicas_financieras enable trigger guard_politica_inmutable;
end $$;
