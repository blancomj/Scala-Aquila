-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · Paso reforzado (Hito 4, spec §3.5)
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_actor_externo_paso_reforzado_solicitar(
  p_auth_user_id uuid,
  p_accion text,
  p_contexto_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_codigo text;
begin
  if p_auth_user_id <> (select auth.uid()) and (select auth.role()) <> 'service_role' then
    raise exception 'FORBIDDEN: solo puedes solicitar tu propio paso reforzado';
  end if;

  v_codigo := lpad(floor(random() * 1000000)::int::text, 6, '0');

  insert into public.actor_externo_paso_reforzado (auth_user_id, accion, contexto_id, codigo_hash, expira_at)
  values (p_auth_user_id, p_accion, p_contexto_id, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), now() + interval '10 minutes');

  -- Devuelve el código en claro — quien llama (siempre con sesión propia,
  -- ver el chequeo de arriba) es la única parte legítima que debe verlo,
  -- para enviarlo por el canal que corresponda o mostrarlo si el propio
  -- corte consumidor decide otro mecanismo de entrega.
  return v_codigo;
end;
$$;

comment on function public.fn_actor_externo_paso_reforzado_solicitar(uuid, text, uuid) is
  'EXT-01 §3.5 — genera el código de paso reforzado. El corte consumidor (futuro voto remoto) '
  'decide qué acciones lo requieren; esta función solo entrega la primitiva.';

create function public.fn_actor_externo_paso_reforzado_confirmar(
  p_auth_user_id uuid,
  p_accion text,
  p_contexto_id uuid,
  p_codigo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.actor_externo_paso_reforzado;
  v_hash text := encode(extensions.digest(p_codigo, 'sha256'), 'hex');
begin
  if p_auth_user_id <> (select auth.uid()) and (select auth.role()) <> 'service_role' then
    raise exception 'FORBIDDEN: solo puedes confirmar tu propio paso reforzado';
  end if;

  select * into v_solicitud
  from public.actor_externo_paso_reforzado
  where auth_user_id = p_auth_user_id and accion = p_accion and contexto_id = p_contexto_id
  order by creado_at desc
  limit 1
  for update;

  if v_solicitud.id is null or v_solicitud.confirmado_at is not null
    or v_solicitud.expira_at < now() or v_solicitud.intentos >= 3
  then
    raise exception 'PASO_REFORZADO_AGOTADO: la solicitud no existe, ya se usó, venció o agotó sus intentos';
  end if;

  if v_solicitud.codigo_hash <> v_hash then
    -- No se puede `update intentos+1` y luego `raise` en la misma llamada: Postgres revierte todo
    -- lo que la función hizo en su propia transacción al lanzar una excepción, incluida esa
    -- actualización (comprobado empíricamente). Por eso un código incorrecto que TODAVÍA no agota
    -- los 3 intentos no lanza — incrementa (que sí persiste, al no haber ningún raise después) y
    -- devuelve false; recién la LLAMADA SIGUIENTE, con el contador ya persistido, entra al guard
    -- de arriba (intentos >= 3) y ahí sí puede lanzar sin perder nada, porque no escribió nada
    -- todavía en esa nueva llamada.
    update public.actor_externo_paso_reforzado set intentos = intentos + 1 where id = v_solicitud.id;
    return false;
  end if;

  update public.actor_externo_paso_reforzado set confirmado_at = now() where id = v_solicitud.id;
  return true;
end;
$$;

comment on function public.fn_actor_externo_paso_reforzado_confirmar(uuid, text, uuid, text) is
  'EXT-01 §3.5 — confirma el paso reforzado; no ejecuta ninguna acción por sí mismo, solo prueba '
  'que el código se completó. Se agota tras 3 intentos fallidos (PASO_REFORZADO_AGOTADO).';
