-- ═══════════════════════════════════════════════════════════════════════
--  EXT-04 · visitantes desde External — revocar, listar
--  Ver Casos de uso/Solicitudes - Reservas - Visitantes/EXT_04_visitantes.md §3.2-3.3.
--
--  "Crear" NO tiene función SQL propia — a diferencia de EXT-02/03, firmar el
--  QR exige Web Crypto de Deno (_shared/link_token.ts), irreproducible en
--  plpgsql. La Edge Function external-visitas-crear duplica el mismo patrón
--  de dos pasos que ya usa autorizacion-visita-crear (MANT-11): insertar,
--  firmar con el id ya real, adjuntar después — sin tocar esa función
--  existente (ya en producción, staff-only), mismo criterio de diff mínimo
--  que el resto de la sesión.
--
--  guard_mant_autorizacion_visita (MANT-11) YA valida
--  AUTORIZACION_INMUEBLE_NO_VINCULADO cuando autorizado_por_origen='externo'
--  — no hace falta ningún guard nuevo, a diferencia de EXT-03 con
--  guard_mant_reserva. fn_autorizacion_visita_revocar (MANT-11) solo
--  permite staff (has_role) — se agrega una función nueva y pequeña para el
--  camino externo en vez de tocarla, mismo criterio que
--  fn_solicitud_cancelar_externa/fn_reserva_cancelar_externa.
-- ═══════════════════════════════════════════════════════════════════════

-- ── fn_autorizacion_visita_revocar_externa ────────────────────────────────
create function public.fn_autorizacion_visita_revocar_externa(p_vinculo_id uuid, p_autorizacion_id uuid)
returns public.mant_autorizaciones_visita
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo_auth uuid;
  v_aut          public.mant_autorizaciones_visita;
begin
  select auth_user_id into v_vinculo_auth
    from public.actor_externo_vinculo
   where actor_externo_vinculo.id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'VINCULO_NO_PERTENECE: vínculo % inválido para este usuario', p_vinculo_id;
  end if;

  select * into v_aut from public.mant_autorizaciones_visita where id = p_autorizacion_id;
  if v_aut.id is null or v_aut.autorizado_por_ref is distinct from p_vinculo_id
     or v_aut.autorizado_por_origen is distinct from 'externo' then
    raise exception 'AUTORIZACION_INEXISTENTE: % no existe para este vínculo', p_autorizacion_id;
  end if;

  -- Deja que guard_mant_autorizacion_visita rechace usada/revocada con
  -- AUTORIZACION_ESTADO_INMUTABLE (MANT-11, ya probado) — no se duplica ese chequeo aquí.
  update public.mant_autorizaciones_visita
  set estado = 'revocada'
  where id = p_autorizacion_id
  returning * into v_aut;

  return v_aut;
end;
$$;

comment on function public.fn_autorizacion_visita_revocar_externa(uuid, uuid) is
  'EXT-04 §3.2: el actor externo revoca SU autorización mientras siga vigente. '
  'fn_autorizacion_visita_revocar (MANT-11) sigue intacta, staff-only — esta función es su '
  'contraparte para el camino externo, misma decisión "función nueva y pequeña" que EXT-02/03.';

-- ── fn_autorizacion_visita_mis_autorizaciones_externas ────────────────────
create function public.fn_autorizacion_visita_mis_autorizaciones_externas(p_vinculo_id uuid)
returns table (
  id                  uuid,
  visitante_nombre    text,
  visitante_documento text,
  tipo_id             bigint,
  fecha_prevista      date,
  hora_desde          time,
  hora_hasta          time,
  estado              public.autorizacion_visita_estado_t,
  qr_token            text,
  qr_expira_at        timestamptz,
  created_at          timestamptz,
  ingreso_at          timestamptz,
  egreso_at           timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo_auth uuid;
begin
  select auth_user_id into v_vinculo_auth
    from public.actor_externo_vinculo
   where actor_externo_vinculo.id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'VINCULO_NO_PERTENECE: vínculo % inválido para este usuario', p_vinculo_id;
  end if;

  return query
    select
      a.id, a.visitante_nombre, a.visitante_documento, a.tipo_id, a.fecha_prevista, a.hora_desde,
      a.hora_hasta, public.mant_autorizacion_visita_vigente_real(a.estado, a.qr_expira_at),
      a.qr_token, a.qr_expira_at, a.created_at, r.ingreso_at, r.egreso_at
    from public.mant_autorizaciones_visita a
    left join public.mant_registros_acceso r on r.autorizacion_id = a.id
    where a.autorizado_por_ref = p_vinculo_id and a.autorizado_por_origen = 'externo'
    order by a.created_at desc;
end;
$$;

comment on function public.fn_autorizacion_visita_mis_autorizaciones_externas(uuid) is
  'EXT-04 §3.3 ("Mis visitas"): historial y autorizaciones vigentes del vínculo que llama, con el '
  'estado real (vencida derivada, mant_autorizacion_visita_vigente_real, MANT-11) y, si ya fue '
  'usada, el ingreso/egreso real vía mant_registros_acceso — nunca un campo propio de este corte.';
