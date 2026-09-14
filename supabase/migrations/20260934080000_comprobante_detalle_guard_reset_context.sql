-- ═══════════════════════════════════════════════════════════════════════
--  Segundo guard que fn_resetear_copropiedad (20260934070000) no podía
--  atravesar: guard_contable_comprobante_detalle_inmutable() (CO-2 §3.6)
--  rechaza cualquier cambio al detalle de un comprobante que ya no está
--  en 'borrador' — incluido el DELETE que el reset necesita. Verificado
--  en vivo contra un tenant real con un comprobante contabilizado:
--  "COMPROBANTE_CONTABILIZADO_INMUTABLE: el comprobante ... ya no admite
--  cambios en su detalle", transacción abortada sin borrar nada.
--
--  Mismo patrón ya aplicado al guard de SEC-14 (20260934060000): se deja
--  pasar el DELETE únicamente bajo aquila.reset_context (local a la
--  transacción de fn_resetear_copropiedad, exige auth+rol administrador+
--  audit_log — ver esa migración para el razonamiento completo de por
--  qué esto no abre una puerta general).
--
--  Acotado a propósito a DELETE: un UPDATE sobre el detalle de un
--  comprobante contabilizado sigue prohibido siempre, incluso durante
--  un reset — el reset solo borra filas completas, nunca las edita.
--
--  Esto es, deliberadamente, punchar a través de una regla de
--  integridad contable (un asiento posteado no se borra, se reversa).
--  Aceptado para esta función explícitamente porque es una utilidad de
--  desarrollo/QA que deja rastro en audit_log, no una vía de producción
--  para corregir contabilidad — corregir un comprobante posteado real
--  sigue exigiendo fn_anular_comprobante + reversión, nunca este reset.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_contable_comprobante_detalle_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.contable_comprobante_estado_t;
begin
  select estado into v_estado from public.contable_comprobante
  where id = coalesce(new.comprobante_id, old.comprobante_id);

  if v_estado is distinct from 'borrador'
     and not (tg_op = 'DELETE' and current_setting('aquila.reset_context', true) = 'true') then
    raise exception 'COMPROBANTE_CONTABILIZADO_INMUTABLE: el comprobante % ya no admite cambios '
      'en su detalle', coalesce(new.comprobante_id, old.comprobante_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.guard_contable_comprobante_detalle_inmutable() is
  'CO-2 §3.6: el detalle de un comprobante no-borrador es inmutable, con UNA excepción: el '
  'DELETE que dispara fn_resetear_copropiedad bajo aquila.reset_context (20260934080000). Un '
  'UPDATE sigue prohibido siempre, incluso en reset_context — el reset solo borra filas '
  'completas, nunca las edita.';
