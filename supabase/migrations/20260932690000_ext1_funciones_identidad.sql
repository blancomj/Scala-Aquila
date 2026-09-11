-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · Funciones de identidad (Hito 4)
--
--  fn_actor_externo_solicitar_otp / fn_actor_externo_confirmar_otp son
--  INTERNAS: revocadas de anon/authenticated, llamadas solo por las Edge
--  Functions con service_role (actor-externo-solicitar-otp/confirmar-otp).
--  Exponerlas directo por RPC permitiría a cualquier autenticado enumerar
--  qué contactos existen en el sistema — exactamente lo que el spec §5.1.2
--  de EXT_APP_MOVIL_PROMPT_MAESTRO.md prohíbe ("nunca revela si el
--  contacto existe").
--
--  El código real (auth.users) lo crea la Edge Function vía Admin API
--  (supabase.auth.admin.createUser), no esta migración — mismo patrón ya
--  establecido en accept-invitation/index.ts (§comentario de cabecera:
--  "dos pasos, en dos sistemas distintos, no atómicos entre sí — una
--  limitación real de la arquitectura de Supabase, no una elección").
--  fn_actor_externo_confirmar_otp valida y "quema" el código, y devuelve
--  los roles vigentes que ese contacto verificó — la Edge Function crea o
--  encuentra el auth.users y llama fn_actor_externo_registrar_vinculo por
--  cada fila devuelta.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_actor_externo_solicitar_otp(p_canal text, p_contacto text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contacto text;
  v_codigo text;
  v_existe boolean;
begin
  if p_canal not in ('email', 'sms') then
    raise exception 'ACTOR_EXTERNO_CANAL_INVALIDO: % no es un canal soportado', p_canal;
  end if;
  v_contacto := case when p_canal = 'email' then lower(btrim(p_contacto)) else btrim(p_contacto) end;

  select exists (
    select 1
    from public.terceros t
    join public.inmueble_persona_rol ipr on ipr.tercero_id = t.id
    join public.lista_tipos lt on lt.id = ipr.rol_id
    where lt.tipo = 'PERSONA_PREDIO'
      and lt.codigo in ('copropietario', 'arrendatario', 'inquilino', 'locatario', 'usufructuario')
      and ipr.vigente_desde <= current_date
      and (ipr.vigente_hasta is null or ipr.vigente_hasta >= current_date)
      and (
        (p_canal = 'email' and t.email is not null and lower(t.email::text) = v_contacto)
        or (p_canal = 'sms' and t.telefono is not null and t.telefono = v_contacto)
      )
  ) into v_existe;

  -- Siempre se escribe una fila de OTP, exista o no el contacto — así la
  -- respuesta de la Edge Function no varía en tiempo/forma según el caso,
  -- reforzando "nunca revela si el contacto existe".
  v_codigo := lpad(floor(random() * 1000000)::int::text, 6, '0');

  insert into public.actor_externo_otp (canal, contacto, codigo_hash, expira_at)
  values (p_canal, v_contacto, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), now() + interval '10 minutes');

  if not v_existe then
    return null;
  end if;
  return v_codigo;
end;
$$;

comment on function public.fn_actor_externo_solicitar_otp(text, text) is
  'EXT-01 §3.2 — genera y guarda un OTP para (canal, contacto). Devuelve el código en claro '
  'SOLO si el contacto está registrado y vigente para algún rol propietario/tenedor; si no, '
  'devuelve null (la fila igual se crea, para no filtrar la diferencia por comportamiento '
  'observable). El código en claro nunca se persiste, solo su hash.';

revoke execute on function public.fn_actor_externo_solicitar_otp(text, text) from public, anon, authenticated;

create function public.fn_actor_externo_confirmar_otp(p_canal text, p_contacto text, p_codigo text)
returns table (
  persona_rol_id uuid,
  tenant_id uuid,
  tercero_id uuid,
  rol_codigo text,
  email text,
  telefono text,
  nombre_completo text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contacto text;
  v_otp public.actor_externo_otp;
  v_hash text;
begin
  v_contacto := case when p_canal = 'email' then lower(btrim(p_contacto)) else btrim(p_contacto) end;
  v_hash := encode(extensions.digest(p_codigo, 'sha256'), 'hex');

  select * into v_otp
  from public.actor_externo_otp
  where canal = p_canal and contacto = v_contacto
  order by creado_at desc
  limit 1
  for update;

  if v_otp.id is null or v_otp.usado_at is not null or v_otp.expira_at < now() or v_otp.intentos >= 3 then
    raise exception 'OTP_INVALIDO_O_VENCIDO: código inválido, vencido o ya usado';
  end if;

  if v_otp.codigo_hash <> v_hash then
    -- No se puede `update ... intentos+1` y luego `raise exception` en la misma llamada: Postgres
    -- revierte TODO lo que la función hizo en su propia transacción al lanzar la excepción,
    -- incluida esa actualización (comprobado empíricamente, no supuesto). Por eso este camino no
    -- lanza — incrementa intentos (que si persiste, al no haber ningún raise después) y devuelve
    -- cero filas; quien llama (la Edge Function) interpreta "cero filas, sin error" como código
    -- incorrecto y responde OTP_INVALIDO_O_VENCIDO al cliente igual. El intento ya usado/vencido/
    -- agotado de arriba sí puede lanzar directo: no hay ninguna escritura previa en esa misma
    -- llamada que perder.
    update public.actor_externo_otp set intentos = intentos + 1 where id = v_otp.id;
    return;
  end if;

  update public.actor_externo_otp set usado_at = now() where id = v_otp.id;

  return query
  select ipr.id, ipr.tenant_id, t.id, lt.codigo, t.email::text, t.telefono, t.nombre_completo
  from public.terceros t
  join public.inmueble_persona_rol ipr on ipr.tercero_id = t.id
  join public.lista_tipos lt on lt.id = ipr.rol_id
  where lt.tipo = 'PERSONA_PREDIO'
    and lt.codigo in ('copropietario', 'arrendatario', 'inquilino', 'locatario', 'usufructuario')
    and ipr.vigente_desde <= current_date
    and (ipr.vigente_hasta is null or ipr.vigente_hasta >= current_date)
    and (
      (p_canal = 'email' and t.email is not null and lower(t.email::text) = v_contacto)
      or (p_canal = 'sms' and t.telefono is not null and t.telefono = v_contacto)
    );
end;
$$;

comment on function public.fn_actor_externo_confirmar_otp(text, text, text) is
  'EXT-01 §3.2 — valida y "quema" el OTP de (canal, contacto). Devuelve una fila por cada rol '
  'vigente (propietario/tenedor) que ese contacto verificó — puede ser más de una (§3.3, '
  'multi-relación). La Edge Function crea/encuentra el auth.users y llama '
  'fn_actor_externo_registrar_vinculo por cada fila.';

revoke execute on function public.fn_actor_externo_confirmar_otp(text, text, text) from public, anon, authenticated;

create function public.fn_actor_externo_registrar_vinculo(
  p_tenant_id uuid,
  p_auth_user_id uuid,
  p_persona_rol_id uuid,
  p_persona_tipo public.actor_externo_persona_t,
  p_origen public.actor_externo_origen_t,
  p_creado_por uuid default null
)
returns public.actor_externo_vinculo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.actor_externo_vinculo;
begin
  if p_origen = 'staff'
    and (select auth.role()) <> 'service_role'
    and not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[])
  then
    raise exception 'FORBIDDEN: alta manual requiere rol auxiliar o superior';
  end if;

  insert into public.actor_externo_vinculo
    (tenant_id, auth_user_id, persona_rol_id, persona_tipo, origen, creado_por)
  values
    (p_tenant_id, p_auth_user_id, p_persona_rol_id, p_persona_tipo, p_origen, p_creado_por)
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.fn_actor_externo_registrar_vinculo(uuid, uuid, uuid, public.actor_externo_persona_t, public.actor_externo_origen_t, uuid) is
  'EXT-01 — único camino de alta de actor_externo_vinculo (todos los guards de '
  'guard_actor_externo_vinculo corren aquí). origen=''staff'' exige rol auxiliar+ salvo que '
  'llame service_role (la Edge Function de confirmación de OTP, origen=''autoverificacion'').';

create function public.fn_actor_externo_mis_vinculos(p_auth_user_id uuid)
returns table (
  vinculo_id uuid,
  tenant_id uuid,
  tenant_nombre text,
  inmueble_id uuid,
  persona_tipo public.actor_externo_persona_t,
  rol_codigo text,
  vigente_desde date,
  vigente_hasta date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    v.id, v.tenant_id, t.name, ipr.inmueble_id, v.persona_tipo, lt.codigo,
    v.vigente_desde, v.vigente_hasta
  from public.actor_externo_vinculo v
  join public.tenants t on t.id = v.tenant_id
  join public.inmueble_persona_rol ipr on ipr.id = v.persona_rol_id
  join public.lista_tipos lt on lt.id = ipr.rol_id
  where v.auth_user_id = p_auth_user_id
    and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
$$;

comment on function public.fn_actor_externo_mis_vinculos(uuid) is
  'EXT-01 §3.3 — vínculos vigentes de una cuenta, con tenant/inmueble/rol. security invoker: '
  'la política actor_externo_vinculo_select ya limita a "propios o de mi tenant como staff", '
  'así que un actor externo pasando un p_auth_user_id ajeno simplemente ve cero filas.';
