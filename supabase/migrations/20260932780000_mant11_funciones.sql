-- ═══════════════════════════════════════════════════════════════════════
--  MANT-11 · Visitantes y control de acceso (4/5) — funciones SQL
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_11_visitantes_acceso.md §4.2-4.3
--
--  fn_autorizacion_visita_marcar_usada es la mitad SQL de "consumir": la
--  verificación criptográfica del QR (verificarTokenEnlace) vive en la Edge
--  Function autorizacion-visita-consumir (20260932820000, Deno/Web Crypto);
--  esta función solo hace la transición atómica de estado + el registro de
--  acceso, una vez que la Edge Function ya probó que el token es válido y
--  no está vencido. `for update` — mismo patrón exacto que accept_invitation
--  (20260814140000): sin este lock, dos porteros podrían leer 'vigente'
--  simultáneamente y ambos marcarían usada la misma autorización.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_autorizacion_visita_marcar_usada(
  p_autorizacion_id uuid,
  p_registrado_por uuid,
  p_observaciones text default null
)
returns public.mant_registros_acceso
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aut      public.mant_autorizaciones_visita;
  v_registro public.mant_registros_acceso;
begin
  select * into v_aut from public.mant_autorizaciones_visita where id = p_autorizacion_id for update;

  if v_aut.id is null then
    raise exception 'AUTORIZACION_INEXISTENTE: % no existe', p_autorizacion_id;
  end if;

  if v_aut.estado <> 'vigente' then
    raise exception 'AUTORIZACION_ESTADO_INVALIDO: % está en estado % — solo una autorización '
      'vigente puede consumirse', p_autorizacion_id, v_aut.estado;
  end if;

  if v_aut.qr_expira_at is not null and v_aut.qr_expira_at < now() then
    raise exception 'AUTORIZACION_VENCIDA: % venció el %', p_autorizacion_id, v_aut.qr_expira_at;
  end if;

  update public.mant_autorizaciones_visita set estado = 'usada' where id = p_autorizacion_id;

  insert into public.mant_registros_acceso (
    tenant_id, autorizacion_id, visitante_nombre, visitante_documento, inmueble_destino_id,
    registrado_por, observaciones
  ) values (
    v_aut.tenant_id, v_aut.id, v_aut.visitante_nombre, v_aut.visitante_documento, v_aut.inmueble_id,
    p_registrado_por, p_observaciones
  )
  returning * into v_registro;

  return v_registro;
end;
$$;

comment on function public.fn_autorizacion_visita_marcar_usada(uuid, uuid, text) is
  'MANT-11 §4.2: mitad SQL de "consumir un QR" — atómica vía for update. La verificación '
  'criptográfica del token vive en la Edge Function autorizacion-visita-consumir, que llama '
  'esta función SOLO después de confirmar que el token es válido y no está vencido.';

revoke execute on function public.fn_autorizacion_visita_marcar_usada(uuid, uuid, text)
  from public, anon, authenticated;

-- ── revocar: vigente -> revocada (el residente/staff cambia de idea) ───────
create function public.fn_autorizacion_visita_revocar(p_autorizacion_id uuid)
returns public.mant_autorizaciones_visita
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aut public.mant_autorizaciones_visita;
begin
  select * into v_aut from public.mant_autorizaciones_visita where id = p_autorizacion_id;
  if v_aut.id is null then
    raise exception 'AUTORIZACION_INEXISTENTE: % no existe', p_autorizacion_id;
  end if;

  if not public.has_role(v_aut.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o superior para revocar una autorización';
  end if;

  if v_aut.estado <> 'vigente' then
    raise exception 'AUTORIZACION_ESTADO_INMUTABLE: % está en estado % — solo una autorización '
      'vigente puede revocarse', p_autorizacion_id, v_aut.estado;
  end if;

  update public.mant_autorizaciones_visita
  set estado = 'revocada'
  where id = p_autorizacion_id
  returning * into v_aut;

  return v_aut;
end;
$$;

comment on function public.fn_autorizacion_visita_revocar(uuid) is
  'MANT-11 §4.1: vigente -> revocada. Una autorización usada/revocada es terminal '
  '(AUTORIZACION_ESTADO_INMUTABLE) — mismo criterio de guard que la tabla misma exige.';

revoke execute on function public.fn_autorizacion_visita_revocar(uuid) from public, anon;
grant execute on function public.fn_autorizacion_visita_revocar(uuid) to authenticated;

-- ── vista de autorizaciones vencidas: derivado, nunca escrito ──────────────
create function public.mant_autorizacion_visita_vigente_real(p_estado public.autorizacion_visita_estado_t, p_qr_expira_at timestamptz)
returns public.autorizacion_visita_estado_t
language sql
stable
set search_path = ''
as $$
  select case
    when p_estado = 'vigente' and p_qr_expira_at is not null and p_qr_expira_at < now()
      then 'vencida'::public.autorizacion_visita_estado_t
    else p_estado
  end;
$$;

comment on function public.mant_autorizacion_visita_vigente_real(public.autorizacion_visita_estado_t, timestamptz) is
  'MANT-11 §4.1: "vencida" nunca se escribe en la columna estado — se deriva en el momento de '
  'leer, comparando qr_expira_at contra now(). Úsese en SELECT (ej. select id, '
  'mant_autorizacion_visita_vigente_real(estado, qr_expira_at) as estado_real from '
  'mant_autorizaciones_visita) en vez de confiar en la columna estado cruda para decidir si una '
  'autorización sigue siendo válida.';

revoke execute on function public.mant_autorizacion_visita_vigente_real(public.autorizacion_visita_estado_t, timestamptz)
  from public, anon;
grant execute on function public.mant_autorizacion_visita_vigente_real(public.autorizacion_visita_estado_t, timestamptz)
  to authenticated;
