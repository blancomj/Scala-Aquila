-- REQ-MORA-003 (PLAN_MAESTRO_IMPLEMENTACION.md §12.3, cerrado por D-23) —
-- el day-count del interés de mora estaba fijo en el código
-- (tasaMensual/30 × días calendario reales) sin haberse confirmado nunca
-- contra las 3 convenciones que lista Docs/16 §56 (ACTUAL_365, ACTUAL_360,
-- THIRTY_360). Se vuelve configurable por política, con el comportamiento
-- histórico como default explícito — ninguna política existente ni GC-001
-- cambia de resultado con este migrate.
create type public.interes_day_count_t as enum (
  'mensual_30_dias_reales',
  'actual_365',
  'actual_360',
  'treinta_360'
);

alter table public.politicas_financieras
  add column interes_day_count public.interes_day_count_t
    not null default 'mensual_30_dias_reales';

comment on column public.politicas_financieras.interes_day_count is
  'REQ-MORA-003. mensual_30_dias_reales = tasaMensual/30 × días calendario '
  'reales (comportamiento histórico del motor, sin nombre ISO estándar '
  'pero de uso común en Colombia — default, no rompe GC-001 ni políticas '
  'existentes). actual_365/actual_360/treinta_360 = las convenciones '
  'listadas en Docs/16 §56, ver packages/liquidation-engine/src/'
  'cuenta-corriente.ts::calcularInteresMora.';
