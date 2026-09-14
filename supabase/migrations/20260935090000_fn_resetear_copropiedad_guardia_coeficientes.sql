-- ═══════════════════════════════════════════════════════════════════════
--  Retoma el audit de guardias de fn_resetear_copropiedad (D-99), donde se
--  detuvo deliberadamente en el quinto guard encontrado: IMMUTABLE_
--  COEFFICIENT_SET (guard_coeficiente_set_padre_inmutable, sobre
--  `coeficientes`) — coeficientes vigentes/históricos de copropiedad son
--  legalmente significativos (Ley 675 art. 111) y ese guard bloqueaba
--  cualquier DELETE, incluido el del reset.
--
--  Auditoría completa realizada esta vez (no "un guard, un parche"): se
--  consultó pg_trigger/pg_proc directamente (no se releyeron migraciones a
--  ojo) por los 19 triggers que disparan en DELETE sobre las 76 tablas que
--  fn_resetear_copropiedad borra explícitamente, más los que se disparan
--  por ON DELETE CASCADE desde tablas fuera de esa lista. De los 19+2, 20
--  ya leían `aquila.reset_context` (las 4 correcciones de D-99 cubrieron
--  correctamente forbid_mutation/forbid_mutation_salvo_tenant_borrado y
--  guard_contable_comprobante_detalle_inmutable). Solo este quedaba.
--
--  guard_coeficiente_set_inmutable (sobre coeficiente_sets, la tabla
--  padre) NO necesita el mismo tratamiento: ese trigger solo dispara en
--  UPDATE, nunca en DELETE — confirmado contra pg_trigger, no asumido.
--
--  Mismo patrón exacto que guard_contable_comprobante_detalle_inmutable
--  (20260934080000): la excepción se acota a `tg_op = 'DELETE' and
--  aquila.reset_context`, nunca a INSERT/UPDATE — un set vigente/histórico
--  sigue siendo inmutable para cualquier edición fuera de un reset.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_coeficiente_set_padre_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set_id    uuid;
  v_estado    public.vigencia_estado_t;
begin
  if tg_op = 'DELETE' and current_setting('aquila.reset_context', true) = 'true' then
    return old;
  end if;

  v_set_id := coalesce(new.set_id, old.set_id);

  select estado into v_estado
  from public.coeficiente_sets
  where id = v_set_id;

  if v_estado in ('vigente', 'historica') then
    raise exception 'IMMUTABLE_COEFFICIENT_SET: el set % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', v_set_id, v_estado;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.guard_coeficiente_set_padre_inmutable() is
  'Un coeficiente cuyo set padre está vigente/histórico es inmutable (16 §111) — corregir crea '
  'una versión nueva del set, nunca edita la congelada. Excepción acotada a DELETE bajo '
  'aquila.reset_context (fn_resetear_copropiedad, D-99/D-122): solo esa utilidad de QA puede '
  'borrar coeficientes de un set vigente/histórico, nunca INSERT/UPDATE.';
