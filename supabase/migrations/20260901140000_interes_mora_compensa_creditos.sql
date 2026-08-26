-- ═══════════════════════════════════════════════════════════════════════
--  H3/H4 (auditoría externa 2026-08-26, Docs/evaluacion/02) — CREDIT/REFUND
--  no compensaban la base de mora, solo DISCOUNT, aunque los tres son
--  dinero a favor real (negativo, AD-30) que ya reduce el saldo de la
--  cuenta corriente exactamente igual. Decisión del usuario (2026-08-26):
--  configurable por política, no fijo en código — algunos tenants pueden
--  querer que una nota crédito no toque la mora de ESA cuota, otros no.
--
--  Aprovecha el mismo interruptor maestro que ya existía
--  (interes_descuento_orden='descuento_antes_interes', 20260819110100):
--  esta columna solo importa cuando ese ya está activo — es una extensión
--  de ESE mecanismo, no uno nuevo y paralelo.
--
--  Además (decisión aparte del usuario, misma fecha): el mecanismo pasa de
--  "solo el mismo periodo" a un pool acumulado consumido cronológicamente
--  (capital más antiguo primero, mismo criterio que la estrategia de
--  imputación deuda_mas_antigua) — un crédito de enero ahora SÍ puede
--  compensar la mora de febrero. Esto cambia el comportamiento incluso
--  para DISCOUNT-only (esta columna en false), no solo para quien active
--  compensa_creditos — es un solo mecanismo con dos perillas independientes,
--  no dos mecanismos distintos. Ver cuenta-corriente.ts::calcularBasesConPool.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.politicas_financieras
  add column interes_mora_compensa_creditos boolean not null default false;

comment on column public.politicas_financieras.interes_mora_compensa_creditos is
  'Solo aplica cuando interes_descuento_orden=''descuento_antes_interes''. false (default, '
  'retrocompatible) = solo DISCOUNT reduce la base de mora. true = CREDIT y REFUND también, con '
  'el mismo tratamiento que DISCOUNT. Ver '
  'packages/liquidation-engine/src/cuenta-corriente.ts::calcularInteresMora/calcularBasesConPool.';
