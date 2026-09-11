-- ═══════════════════════════════════════════════════════════════════════
--  MANT-10 · Reservas de zonas comunes (4/5) — fn_reserva_aprobar / rechazar
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_10_reservas_zonas_comunes.md §3.4-3.5
--
--  Mismo criterio de resolución de periodo que fn_aprobar_novedad
--  (20260816110100): el cargo nace del anio/mes de la fecha de la reserva.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_reserva_aprobar(p_reserva_id uuid)
returns public.mant_reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva public.mant_reservas;
  v_regla   public.mant_zona_reserva_regla;
  v_anio    int;
  v_mes     int;
  v_periodo_id uuid;
  v_cargo_id   uuid;
  v_monto      numeric(18, 2);
begin
  select * into v_reserva from public.mant_reservas where id = p_reserva_id;
  if v_reserva.id is null then
    raise exception 'RESERVA_INEXISTENTE: % no existe', p_reserva_id;
  end if;

  if not public.has_role(v_reserva.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para aprobar una reserva';
  end if;

  if v_reserva.estado <> 'solicitada' then
    raise exception 'RESERVA_ESTADO_INVALIDO: % está en estado % — solo una reserva solicitada '
      'puede aprobarse', p_reserva_id, v_reserva.estado;
  end if;

  select * into v_regla
    from public.mant_zona_reserva_regla
   where zona_comun_id = v_reserva.zona_comun_id
     and tenant_id = v_reserva.tenant_id
     and vigente_desde <= v_reserva.fecha
     and (vigente_hasta is null or vigente_hasta >= v_reserva.fecha)
   order by vigente_desde desc
   limit 1;

  if v_regla.genera_cargo then
    v_anio := extract(year from v_reserva.fecha);
    v_mes := extract(month from v_reserva.fecha);

    select id into v_periodo_id
      from public.periodos
     where tenant_id = v_reserva.tenant_id and anio = v_anio and mes = v_mes;
    if v_periodo_id is null then
      raise exception 'PERIODO_NO_ENCONTRADO_PARA_FECHA_RESERVA: no existe periodo %-% para el '
        'tenant % (reserva %)', v_anio, v_mes, v_reserva.tenant_id, p_reserva_id;
    end if;

    select valor_fijo into v_monto from public.conceptos where id = v_regla.concepto_id;

    insert into public.cargos (
      tenant_id, inmueble_id, periodo_id, categoria, origen_tipo, reserva_id, concepto_id, monto_original
    ) values (
      v_reserva.tenant_id, v_reserva.inmueble_id, v_periodo_id, 'otro', 'reserva',
      v_reserva.id, v_regla.concepto_id, v_monto
    )
    returning id into v_cargo_id;
  end if;

  update public.mant_reservas
  set estado = 'aprobada', aprobada_por = (select auth.uid()), aprobada_at = now(),
      cargo_id = coalesce(v_cargo_id, cargo_id)
  where id = p_reserva_id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

comment on function public.fn_reserva_aprobar(uuid) is
  'MANT-10 §3.4-3.5: solicitada -> aprobada. Si la regla vigente de la zona tiene '
  'genera_cargo=true, crea el cargo contra el inmueble (reutilizando conceptos/cargos, sin '
  'mecanismo de cobro propio) y lo enlaza en cargo_id.';

create function public.fn_reserva_rechazar(p_reserva_id uuid, p_motivo text)
returns public.mant_reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva public.mant_reservas;
begin
  select * into v_reserva from public.mant_reservas where id = p_reserva_id;
  if v_reserva.id is null then
    raise exception 'RESERVA_INEXISTENTE: % no existe', p_reserva_id;
  end if;

  if not public.has_role(v_reserva.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para rechazar una reserva';
  end if;

  if v_reserva.estado <> 'solicitada' then
    raise exception 'RESERVA_ESTADO_INVALIDO: % está en estado % — solo una reserva solicitada '
      'puede rechazarse', p_reserva_id, v_reserva.estado;
  end if;

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'RESERVA_RECHAZO_SIN_MOTIVO: rechazar % exige motivo', p_reserva_id;
  end if;

  update public.mant_reservas
  set estado = 'rechazada', motivo_rechazo = p_motivo
  where id = p_reserva_id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

comment on function public.fn_reserva_rechazar(uuid, text) is
  'MANT-10 §3.4: solicitada -> rechazada. Rechazar sin motivo no se permite '
  '(RESERVA_RECHAZO_SIN_MOTIVO), mismo criterio que el triage de solicitudes en otros cortes.';

revoke execute on function public.fn_reserva_aprobar(uuid) from public, anon;
revoke execute on function public.fn_reserva_rechazar(uuid, text) from public, anon;
grant execute on function public.fn_reserva_aprobar(uuid) to authenticated;
grant execute on function public.fn_reserva_rechazar(uuid, text) to authenticated;
