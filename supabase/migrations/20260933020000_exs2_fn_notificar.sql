-- ═══════════════════════════════════════════════════════════════════════
--  EXS-2 · Notificaciones in-app (3/4) — emisor único
--  Casos de uso/Experiencia y servicios/EXS_02_INFORME.md
--
--  Una sola puerta de escritura. El prompt 06 §16 lo pide explícitamente
--  ("evitar que Vue/RPC/Edge Function/trigger generen varias veces la
--  misma notificación: debe existir una fuente clara de verdad") y aquí
--  se cumple de forma estructural, no por convención: notificaciones no
--  tiene policy de insert, así que esta función security definer es
--  literalmente el único camino para un cliente autenticado.
--
--  Idempotente por diseño: el ON CONFLICT contra notificaciones_origen_idx
--  hace que reemitir la misma detección no duplique nada. Los emisores son
--  crons diarios que vuelven a ver lo mismo cada día; sin esto la campana
--  se llenaría de repeticiones.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_notificar(
  p_tenant_id      uuid,
  p_modulo         text,
  p_tipo_codigo    text,
  p_prioridad      text,
  p_titulo         text,
  p_origen_modulo  text,
  p_origen_entidad text,
  p_origen_evento  text,
  p_origen_id      uuid default null,
  p_cuerpo         text default null,
  p_enlace         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_id      bigint;
  v_prioridad_id bigint;
  v_id           uuid;
begin
  select id into v_tipo_id
    from public.lista_tipos
   where tipo = 'TIPO_NOTIFICACION' and codigo = p_tipo_codigo;
  if v_tipo_id is null then
    raise exception 'NOTIFICACION_TIPO_INVALIDO: % no existe en TIPO_NOTIFICACION', p_tipo_codigo;
  end if;

  select id into v_prioridad_id
    from public.lista_tipos
   where tipo = 'PRIORIDAD_NOTIFICACION' and codigo = p_prioridad;
  if v_prioridad_id is null then
    raise exception 'NOTIFICACION_PRIORIDAD_INVALIDA: % no existe en PRIORIDAD_NOTIFICACION', p_prioridad;
  end if;

  insert into public.notificaciones (
    tenant_id, modulo, tipo_id, prioridad_id, titulo, cuerpo, enlace,
    origen_modulo, origen_entidad, origen_id, origen_evento
  )
  values (
    p_tenant_id, p_modulo, v_tipo_id, v_prioridad_id, p_titulo, p_cuerpo, p_enlace,
    p_origen_modulo, p_origen_entidad, p_origen_id, p_origen_evento
  )
  -- Se repite la expresión del índice, no su nombre: notificaciones_origen_idx
  -- es un índice único CON expresión (coalesce), y las constraints de
  -- Postgres no admiten expresiones — `on conflict on constraint` no aplica.
  on conflict (
    tenant_id, origen_entidad, coalesce(origen_id, '00000000-0000-0000-0000-000000000000'::uuid), origen_evento
  ) do nothing
  returning id into v_id;

  -- v_id null = ya existía: la reemisión es un no-op silencioso, no un
  -- error. El llamador (un trigger de detección) no debe fallar por eso.
  return v_id;
end;
$$;

comment on function public.fn_notificar is
  'EXS-2 — emisor único de notificaciones in-app. Idempotente por (tenant, origen_entidad, '
  'origen_id, origen_evento): reemitir la misma detección devuelve null sin insertar, nunca '
  'falla. Es el único camino de escritura a notificaciones (esa tabla no tiene policy de '
  'insert), de modo que la "fuente clara de verdad" del prompt 06 §16 queda garantizada por el '
  'esquema y no por disciplina.';

-- EXECUTE solo para quien lo necesita. Los triggers de detección corren
-- como definer y no dependen de este grant; se concede a service_role
-- para que las Edge Functions y los crons puedan emitir directamente.
revoke execute on function public.fn_notificar(uuid, text, text, text, text, text, text, text, uuid, text, text) from public;
revoke execute on function public.fn_notificar(uuid, text, text, text, text, text, text, text, uuid, text, text) from authenticated;
revoke execute on function public.fn_notificar(uuid, text, text, text, text, text, text, text, uuid, text, text) from anon;
grant execute on function public.fn_notificar(uuid, text, text, text, text, text, text, text, uuid, text, text) to service_role;
