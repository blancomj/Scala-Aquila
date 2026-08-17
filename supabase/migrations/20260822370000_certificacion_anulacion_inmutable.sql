-- ═══════════════════════════════════════════════════════════════════════
--  Corrige guard_certificacion_transicion() (20260822340000): una
--  certificación ya anulada podía "re-anularse" cambiando anulada_motivo
--  libremente, porque new.estado = old.estado ('anulada' = 'anulada')
--  caía en la rama de no-op sin revisar anulada_por/anulada_at/
--  anulada_motivo. Una vez fijado el estado (vigente o anulada), esas
--  tres columnas quedan tan inmutables como el resto del contenido —
--  documento_url sigue siendo la única excepción real.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_certificacion_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.inmueble_id is distinct from old.inmueble_id
     or new.consecutivo is distinct from old.consecutivo
     or new.fecha_expedicion is distinct from old.fecha_expedicion
     or new.fecha_corte is distinct from old.fecha_corte
     or new.monto_expensas_ordinarias is distinct from old.monto_expensas_ordinarias
     or new.monto_expensas_extraordinarias is distinct from old.monto_expensas_extraordinarias
     or new.monto_intereses_mora is distinct from old.monto_intereses_mora
     or new.monto_sanciones is distinct from old.monto_sanciones
     or new.monto_otros is distinct from old.monto_otros
     or new.monto_total is distinct from old.monto_total
     or new.detalle_cargos is distinct from old.detalle_cargos
     or new.politica_financiera_id is distinct from old.politica_financiera_id
     or new.politica_version is distinct from old.politica_version
     or new.certificacion_hash is distinct from old.certificacion_hash
     or new.expedida_por is distinct from old.expedida_por
     or new.cargo_firmante is distinct from old.cargo_firmante
  then
    raise exception 'CERTIFICACION_INMUTABLE: una certificación de deuda no admite modificar su '
      'contenido (%), solo anularse (REC-CAR-014) — documento_url es la única excepción', old.id;
  end if;

  if new.estado = old.estado then
    -- Fijado el estado (vigente o anulada), anulada_por/anulada_at/anulada_motivo
    -- quedan tan inmutables como el resto: no se puede "re-anular" cambiando el
    -- motivo, ni editar la anulación después del hecho.
    if new.anulada_por is distinct from old.anulada_por
       or new.anulada_at is distinct from old.anulada_at
       or new.anulada_motivo is distinct from old.anulada_motivo
    then
      raise exception 'CERTIFICACION_INMUTABLE: anulada_por/anulada_at/anulada_motivo no se '
        'pueden modificar una vez fijados (%)', old.id;
    end if;
    return new; -- no-op de contenido (p.ej. solo documento_url).
  end if;

  if not (old.estado = 'vigente' and new.estado = 'anulada') then
    raise exception 'CERTIFICACION_TRANSICION_INVALIDA: % no puede pasar a %', old.estado, new.estado;
  end if;
  if new.anulada_motivo is null then
    raise exception 'CERTIFICACION_ANULACION_SIN_MOTIVO: anular exige explicar el motivo';
  end if;
  if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'CERTIFICACION_REQUIERE_ADMINISTRADOR: anular una certificación de deuda '
      'exige rol administrador';
  end if;

  new.anulada_por := v_actor;
  new.anulada_at := now();
  return new;
end;
$$;
