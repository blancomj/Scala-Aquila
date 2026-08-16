-- REQ-NOVEDAD-003 (PLAN_MAESTRO_IMPLEMENTACION.md §12.3, cerrado por D-23) —
-- una novedad DISCOUNT aprobada crea su propio cargo (categoria='otro',
-- fn_aprobar_novedad, 20260816110100) que calcularInteresMora() ignoraba
-- por completo (solo procesa categoria='capital'): el interés de mora
-- nunca tuvo en cuenta los descuentos. Se vuelve configurable por
-- política, con ese comportamiento histórico como default explícito.
create type public.interes_descuento_orden_t as enum (
  'interes_sobre_capital_completo',
  'descuento_antes_interes'
);

alter table public.politicas_financieras
  add column interes_descuento_orden public.interes_descuento_orden_t
    not null default 'interes_sobre_capital_completo';

comment on column public.politicas_financieras.interes_descuento_orden is
  'REQ-NOVEDAD-003. interes_sobre_capital_completo = el interés de mora '
  'ignora los DISCOUNT vigentes (comportamiento histórico — default). '
  'descuento_antes_interes = los DISCOUNT del mismo período reducen (piso '
  'cero) la base de capital antes de aplicar la tasa diaria. Ver '
  'packages/liquidation-engine/src/cuenta-corriente.ts::calcularInteresMora.';
