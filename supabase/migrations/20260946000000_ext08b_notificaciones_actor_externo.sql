-- ═══════════════════════════════════════════════════════════════════════
--  EXT-08b (Ola 2, M11/M12) · Mi Copropiedad — actuaciones visibles al
--  residente + notificaciones in-app para el actor externo.
--  Ver PROMPT_MI_COPROPIEDAD_FASE2.md §4.1/§7.2/§7.10.
--
--  Vía mínima explícita (P2-01, decisión del usuario): UN SOLO evento
--  conocido (respuesta de staff a una solicitud propia) — no un canal
--  genérico de comunicados/anuncios (§4.4, fuera de alcance de esta ola).
-- ═══════════════════════════════════════════════════════════════════════

-- ── M12: fn_solicitud_actuaciones_externas ──────────────────────────────
-- Mismo patrón exacto que fn_solicitud_estado_externo (20260932810000): solo funciona con la
-- sesión real del propio actor externo (RLS-scoped, nunca admin/service_role — auth.uid() sería
-- null en ese caso y la comparación fallaría por diseño). NUNCA devuelve una actuación con
-- es_respuesta=false — esas son notas internas del staff (GOB-8), no algo que el residente vea.
create function public.fn_solicitud_actuaciones_externas(
  p_vinculo_id uuid,
  p_solicitud_id uuid
)
returns table (
  fecha date,
  descripcion text,
  created_at timestamptz
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
  where id = p_vinculo_id;

  if v_vinculo_auth is null or v_vinculo_auth is distinct from (select auth.uid()) then
    raise exception 'SOLICITUD_EXTERNA_INMUEBLE_NO_VINCULADO: vínculo % inválido para este usuario',
      p_vinculo_id;
  end if;

  return query
    select sa.fecha, sa.descripcion, sa.created_at
    from public.solicitud_actuaciones sa
    join public.solicitudes s on s.id = sa.solicitud_id
    where sa.solicitud_id = p_solicitud_id
      and s.origen_actor_externo_id = p_vinculo_id
      and sa.es_respuesta = true
    order by sa.created_at asc;
end;
$$;

comment on function public.fn_solicitud_actuaciones_externas(uuid, uuid) is
  'GOB-8/EXT-08 §7.2: respuestas del staff a UNA solicitud propia del actor externo — nunca una '
  'actuación con es_respuesta=false (notas internas), nunca de una solicitud de otro vínculo.';

-- ── M11: notificaciones_actor_externo ────────────────────────────────────
-- Tabla APARTE de exs2_notificaciones a propósito (§4.4): esa se enruta por módulo + rol de
-- tenant_member (PLAN §10.4) — un actor externo nunca es tenant_member (AD-37), mezclar ahí un
-- destinatario individual habría forzado dos modelos de autorización distintos en una tabla común.
create table public.notificaciones_actor_externo (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants (id) on delete cascade,
  actor_externo_vinculo_id  uuid not null references public.actor_externo_vinculo (id) on delete cascade,
  titulo                    text not null,
  cuerpo                    text,
  enlace                    text,
  origen_entidad            text not null,
  origen_id                 uuid,
  origen_evento             text not null,
  leida_at                  timestamptz,
  created_at                timestamptz not null default now()
);

alter table public.notificaciones_actor_externo enable row level security;
alter table public.notificaciones_actor_externo force row level security;

create index notificaciones_actor_externo_vinculo_idx
  on public.notificaciones_actor_externo (actor_externo_vinculo_id);

-- Mismo criterio de idempotencia que notificaciones_origen_idx (exs2_notificaciones): reemitir la
-- misma detección no duplica nada. La clave incluye actor_externo_vinculo_id (a diferencia de la
-- de staff, que es por tenant) porque el destinatario aquí es un vínculo individual, no un rol.
create unique index notificaciones_actor_externo_origen_idx
  on public.notificaciones_actor_externo (
    actor_externo_vinculo_id, origen_entidad,
    coalesce(origen_id, '00000000-0000-0000-0000-000000000000'::uuid), origen_evento
  );

comment on table public.notificaciones_actor_externo is
  'EXT-08b (Ola 2, M11): bandeja in-app del actor externo, ligada a UN SOLO evento hoy (respuesta '
  'de staff a una solicitud propia, §4.4) — no un canal genérico de comunicados. Sin política RLS '
  'para `authenticated` (ni siquiera SELECT, a diferencia de exs2_notificaciones que sí lee '
  'directo por RLS) — AD-37: el actor externo nunca tiene política propia, todo pasa por '
  'external-notificaciones-listar (service_role).';

-- Sin ninguna política RLS para authenticated/anon: mismo criterio que contactos_emergencia/
-- correspondencia de esta misma ola — la única puerta es la Edge Function con service_role.

-- ── fn_notificar_actor_externo ────────────────────────────────────────────
-- Mismo patrón exacto que fn_notificar (EXS-2, 20260933020000): única puerta de escritura,
-- idempotente por ON CONFLICT DO NOTHING, revocada de todo salvo service_role.
create function public.fn_notificar_actor_externo(
  p_tenant_id                 uuid,
  p_actor_externo_vinculo_id  uuid,
  p_titulo                    text,
  p_cuerpo                    text,
  p_enlace                    text,
  p_origen_entidad            text,
  p_origen_id                 uuid,
  p_origen_evento             text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notificaciones_actor_externo (
    tenant_id, actor_externo_vinculo_id, titulo, cuerpo, enlace,
    origen_entidad, origen_id, origen_evento
  )
  values (
    p_tenant_id, p_actor_externo_vinculo_id, p_titulo, p_cuerpo, p_enlace,
    p_origen_entidad, p_origen_id, p_origen_evento
  )
  on conflict (
    actor_externo_vinculo_id, origen_entidad,
    coalesce(origen_id, '00000000-0000-0000-0000-000000000000'::uuid), origen_evento
  ) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fn_notificar_actor_externo is
  'EXT-08b (Ola 2, M11) — emisor único de notificaciones_actor_externo, mismo criterio que '
  'fn_notificar (EXS-2): idempotente por (vinculo, origen_entidad, origen_id, origen_evento), '
  'nunca falla al reemitir la misma detección.';

revoke execute on function public.fn_notificar_actor_externo(uuid, uuid, text, text, text, text, uuid, text) from public;
revoke execute on function public.fn_notificar_actor_externo(uuid, uuid, text, text, text, text, uuid, text) from authenticated;
revoke execute on function public.fn_notificar_actor_externo(uuid, uuid, text, text, text, text, uuid, text) from anon;
grant execute on function public.fn_notificar_actor_externo(uuid, uuid, text, text, text, text, uuid, text) to service_role;

-- ── Trigger: notificar al residente cuando el staff responde su solicitud ─
-- origen_id = la actuación misma (new.id), NO la solicitud — si se usara solicitud_id como
-- origen_id, una SEGUNDA respuesta del staff a la misma solicitud colisionaría con la clave de
-- idempotencia de la primera y jamás se notificaría (ON CONFLICT DO NOTHING la descartaría en
-- silencio). Cada actuación-respuesta es un evento propio y necesita su propia notificación.
create function public.trg_notificar_respuesta_solicitud_actor_externo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_solicitud public.solicitudes;
begin
  select * into v_solicitud from public.solicitudes where id = new.solicitud_id;

  if v_solicitud.origen_actor_externo_id is not null then
    perform public.fn_notificar_actor_externo(
      v_solicitud.tenant_id,
      v_solicitud.origen_actor_externo_id,
      'Nueva respuesta a tu solicitud',
      new.descripcion,
      '/mi-copropiedad/solicitudes/' || v_solicitud.id::text,
      'solicitud_actuacion',
      new.id,
      'respuesta'
    );
  end if;

  return new;
end;
$$;

comment on function public.trg_notificar_respuesta_solicitud_actor_externo() is
  'EXT-08b (Ola 2, M11): dispara solo cuando la solicitud fue creada por el propio actor externo '
  '(origen_actor_externo_id no nulo) — una solicitud creada por staff en nombre de alguien no '
  'tiene a quién avisar por este canal.';

create trigger notificar_respuesta_actor_externo
  after insert on public.solicitud_actuaciones
  for each row
  when (new.es_respuesta = true)
  execute function public.trg_notificar_respuesta_solicitud_actor_externo();

revoke execute on function public.trg_notificar_respuesta_solicitud_actor_externo() from public, anon, authenticated;
