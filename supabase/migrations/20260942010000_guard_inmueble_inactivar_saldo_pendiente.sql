-- ═══════════════════════════════════════════════════════════════════════
--  Hallazgo QA f2-17 (severidad media, qa/resultados.jsonl) — inactivar un
--  inmueble con saldo pendiente se permitía sin ninguna advertencia ni
--  bloqueo: el mismo menú "Inactivar inmueble" que para uno sin saldo, sin
--  diálogo intermedio. El saldo seguía siendo exigible después (v_cargo_saldo
--  sin cambios), pero eso no basta.
--
--  Decisión del usuario (2026-09-16, qa/decisiones.md § f2-17): no se debe
--  permitir inactivar un inmueble con saldo pendiente — hay que BLOQUEAR la
--  acción, no solo advertir. Mismo patrón que los demás guards de dominio
--  (LAST_AGENT, CARTERA_ETAPA_CONGELADA, etc.): un trigger BEFORE UPDATE que
--  rechaza la transición antes de que se persista, en vez de un chequeo del
--  lado del cliente que se puede saltar por API directa.
--
--  "Saldo pendiente" se define exactamente como en v_cargo_saldo
--  (monto_original - Σpago_aplicaciones) — la misma fuente de verdad que
--  usa el dashboard de cartera y el estado de cuenta, nunca un recálculo
--  paralelo.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_inmueble_inactivar_con_saldo()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_saldo_pendiente numeric;
begin
  if new.estado = 'inactivo' and old.estado is distinct from 'inactivo' then
    select coalesce(sum(vcs.monto_pendiente), 0) into v_saldo_pendiente
    from public.v_cargo_saldo vcs
    where vcs.inmueble_id = new.id
      and vcs.monto_pendiente > 0;

    if v_saldo_pendiente > 0 then
      raise exception 'INMUEBLE_SALDO_PENDIENTE: no se puede inactivar un inmueble con saldo '
        'pendiente ($%) — cóbralo, condónalo o reasígnalo antes de inactivar', v_saldo_pendiente;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_inmueble_inactivar_con_saldo() is
  'Bloquea estado=inactivo mientras v_cargo_saldo tenga algún monto_pendiente > 0 para ese '
  'inmueble (hallazgo QA f2-17, qa/decisiones.md) — nunca un recálculo propio del saldo.';

create trigger guard_inmueble_inactivar_con_saldo
  before update on public.inmuebles
  for each row execute function public.guard_inmueble_inactivar_con_saldo();

revoke execute on function public.guard_inmueble_inactivar_con_saldo() from public, anon, authenticated;
