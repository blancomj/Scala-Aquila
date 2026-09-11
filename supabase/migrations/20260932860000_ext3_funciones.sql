-- ═══════════════════════════════════════════════════════════════════════
--  EXT-03 · reservas desde External — crear, cancelar, listar
--  Ver Casos de uso/Solicitudes - Reservas - Visitantes/EXT_03_reservas.md §3.2-3.4.
--
--  Las tres funciones revalidan que p_vinculo_id pertenece a auth.uid()
--  (defensa en profundidad, mismo criterio que fn_solicitud_cancelar_externa/
--  fn_solicitud_mis_solicitudes_externas de EXT-02) además del chequeo que ya
--  hace guard_mant_reserva (RESERVA_INMUEBLE_NO_VINCULADO). Toda regla de
--  traslape/cupo/ventana/duración vive exclusivamente en MANT-10
--  (guard_mant_reserva + el exclude constraint) — cero validación propia de
--  este corte (spec, prueba 10).
--
--  Gotcha de plpgsql ya conocido (EXT-02, 20260932830000): una columna de
--  RETURNS TABLE llamada `id` se vuelve un parámetro OUT en TODA la función
--  — cualquier referencia sin calificar a `id` en otra consulta del cuerpo
--  queda ambigua. fn_reserva_mis_reservas_externas califica su chequeo de
--  dueño (`actor_externo_vinculo.id`) por eso.
-- ═══════════════════════════════════════════════════════════════════════

-- ── fn_reserva_crear_externa ──────────────────────────────────────────────
create function public.fn_reserva_crear_externa(
  p_vinculo_id uuid,
  p_inmueble_id uuid,
  p_zona_comun_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time
)
returns public.mant_reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo_auth uuid;
  v_tenant_id    uuid;
  v_reserva      public.mant_reservas;
begin
  select auth_user_id, tenant_id into v_vinculo_auth, v_tenant_id
    from public.actor_externo_vinculo
   where actor_externo_vinculo.id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'VINCULO_NO_PERTENECE: vínculo % inválido para este usuario', p_vinculo_id;
  end if;

  begin
    insert into public.mant_reservas (
      tenant_id, zona_comun_id, inmueble_id, solicitante_ref, solicitante_origen,
      fecha, hora_inicio, hora_fin
    ) values (
      v_tenant_id, p_zona_comun_id, p_inmueble_id, p_vinculo_id, 'externo',
      p_fecha, p_hora_inicio, p_hora_fin
    )
    returning * into v_reserva;
  exception
    when exclusion_violation then
      raise exception 'RESERVA_TRASLAPE: la franja solicitada ya está ocupada en esta zona';
  end;

  -- RETURNING captura la fila tal como queda tras los triggers BEFORE, no los AFTER — el cargo
  -- que mant_reserva_generar_cargo_auto_aprobada (AFTER INSERT) enlaza en cargo_id todavía no
  -- estaría en v_reserva sin este re-select.
  select * into v_reserva from public.mant_reservas where id = v_reserva.id;

  return v_reserva;
end;
$$;

comment on function public.fn_reserva_crear_externa(uuid, uuid, uuid, date, time, time) is
  'EXT-03 §3.2: el actor externo solicita una reserva para SU inmueble (resuelto por la Edge '
  'Function vía fn_actor_externo_mis_vinculos, nunca del cuerpo del cliente). Toda validación de '
  'negocio (duración/ventana/límite/cupo/vínculo) la hace guard_mant_reserva; esta función solo '
  'inserta y traduce el exclusion_violation crudo del exclude constraint (traslape, cupo=1) a un '
  'código limpio RESERVA_TRASLAPE — sin eso llegaba como INTERNAL_ERROR/500 en vez de un 409 '
  'esperado (parsearErrorRpc solo entiende el formato "CODE: mensaje"). Re-selecciona tras el '
  'insert para incluir cargo_id si mant_reserva_generar_cargo_auto_aprobada (AFTER INSERT) lo '
  'enlazó — RETURNING del insert no lo vería.';

-- ── fn_reserva_cancelar_externa ───────────────────────────────────────────
create function public.fn_reserva_cancelar_externa(p_vinculo_id uuid, p_reserva_id uuid)
returns public.mant_reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculo_auth uuid;
  v_reserva      public.mant_reservas;
begin
  select auth_user_id into v_vinculo_auth
    from public.actor_externo_vinculo
   where actor_externo_vinculo.id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'VINCULO_NO_PERTENECE: vínculo % inválido para este usuario', p_vinculo_id;
  end if;

  select * into v_reserva from public.mant_reservas where id = p_reserva_id;
  if v_reserva.id is null or v_reserva.solicitante_ref is distinct from p_vinculo_id
     or v_reserva.solicitante_origen is distinct from 'externo' then
    raise exception 'RESERVA_INEXISTENTE: % no existe para este vínculo', p_reserva_id;
  end if;

  update public.mant_reservas set estado = 'cancelada' where id = p_reserva_id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

comment on function public.fn_reserva_cancelar_externa(uuid, uuid) is
  'EXT-03 §3.3: el actor externo cancela SU reserva mientras siga en solicitada o aprobada '
  '(guard_mant_reserva, extendido por 20260932850000, rechaza cualquier otro origen con '
  'RESERVA_TRANSICION_INVALIDA). La penalidad por cancelación tardía, si aplica, la calcula y '
  'marca el mismo guard — esta función no decide nada al respecto, solo dispara la transición.';

-- ── fn_reserva_mis_reservas_externas ──────────────────────────────────────
create function public.fn_reserva_mis_reservas_externas(p_vinculo_id uuid)
returns table (
  id                  uuid,
  zona_comun_id       uuid,
  fecha               date,
  hora_inicio         time,
  hora_fin            time,
  estado              public.reserva_estado_t,
  penalizada          boolean,
  motivo_rechazo      text,
  created_at          timestamptz
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
    select r.id, r.zona_comun_id, r.fecha, r.hora_inicio, r.hora_fin, r.estado, r.penalizada,
      r.motivo_rechazo, r.created_at
    from public.mant_reservas r
    where r.solicitante_ref = p_vinculo_id and r.solicitante_origen = 'externo'
    order by r.fecha desc, r.hora_inicio desc;
end;
$$;

comment on function public.fn_reserva_mis_reservas_externas(uuid) is
  'EXT-03 §3.4 ("Mis reservas"): historial y próximas reservas del vínculo que llama — nunca las '
  'de otro vínculo/inmueble/tenant.';
