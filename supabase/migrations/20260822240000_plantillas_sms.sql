-- ═══════════════════════════════════════════════════════════════════════
--  plantillas_sms — configuración de mensajería SMS transaccional
--  Adaptado de Casos de uso/Configuracion de Plantillas correo-SMS/
--  PROMPT-modulo-configuracion-sms.md (spec portable, dominio hospedaje)
--  al dominio real de AQUILA (cartera/copropiedades, multi-tenant).
--
--  Desviaciones deliberadas del spec original, y por qué:
--
--  1. `tenant_id` + único por (tenant_id, event_type), no global: el spec
--     asume plataforma single-tenant. AQUILA es SaaS multi-tenant — cada
--     copropiedad redacta su propio texto, mismo patrón que cualquier
--     tabla de dominio (cuentas_bancarias, tenant_tercero_rol).
--
--  2. `activo boolean` en la propia tabla, no en un sistema de config
--     genérico (`notifications.sms_x_enabled`): ese sistema no existe en
--     este repo. `tenants.settings` (jsonb) está deliberadamente sin
--     forma definida (ver CopropiedadConfiguracion.vue) y no se le
--     inventa estructura aquí. El precedente real es baja lógica vía
--     columna booleana en la tabla de dominio (cuentas_bancarias.activa).
--
--  3. Sin política de DELETE: no hay borrado, solo upsert de texto y
--     cambio de `activo` — ambos vía función, nunca UPDATE/INSERT directo
--     del cliente, porque ambos deben auditarse.
--
--  4. fn_guardar_plantilla_sms / fn_toggle_plantilla_sms son
--     SECURITY DEFINER: audit_log no tiene política INSERT para
--     `authenticated` (ver 20260813190300_rls_policies.sql) — todo
--     insert a audit_log pasa por una función SECURITY DEFINER, mismo
--     patrón que create_tenant() en 20260814130000_create_tenant_audit.sql.
--     Al ser SECURITY DEFINER, RLS queda bypaseada dentro del cuerpo de
--     la función: el chequeo de rol se hace a mano, igual que create_tenant().
-- ═══════════════════════════════════════════════════════════════════════

create table public.plantillas_sms (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  event_type  text not null,
  cuerpo      text not null check (char_length(cuerpo) <= 480),
  activo      boolean not null default false,
  updated_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  unique (tenant_id, event_type)
);

alter table public.plantillas_sms enable row level security;
alter table public.plantillas_sms force row level security;

create index plantillas_sms_tenant_idx on public.plantillas_sms (tenant_id);

comment on table public.plantillas_sms is
  'Plantillas de SMS transaccional por evento de cartera, una fila por '
  '(tenant_id, event_type). El catálogo de eventos y sus variables vive en '
  'código (packages/shared/src/sms/registry.ts), no en esta tabla — un '
  'evento del registro sin fila aquí simplemente no ha sido redactado '
  'todavía. activo es la baja/alta lógica del envío para ese evento.';

-- ── RLS: mismo patrón que el resto del dominio (is_member / has_role agent) ──
create policy plantillas_sms_select_miembro
  on public.plantillas_sms for select
  to authenticated
  using (public.is_member(tenant_id));

create policy plantillas_sms_insert_agent
  on public.plantillas_sms for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy plantillas_sms_update_agent
  on public.plantillas_sms for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create trigger set_updated_at
  before update on public.plantillas_sms
  for each row execute function public.set_updated_at();

-- ── fn_guardar_plantilla_sms — upsert de texto + auditoría atómica ─────
create function public.fn_guardar_plantilla_sms(
  p_tenant_id uuid,
  p_event_type text,
  p_cuerpo text
)
returns public.plantillas_sms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuerpo_anterior text;
  v_row public.plantillas_sms;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para guardar una plantilla SMS';
  end if;

  if not public.has_role(p_tenant_id, array['agent']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol agent en esta copropiedad';
  end if;

  -- Backstop de integridad — la validación rica de variables/registro ya
  -- la hizo la Edge Function antes de invocar esta función.
  if char_length(p_cuerpo) > 480 then
    raise exception 'SMS_BODY_TOO_LONG: el texto excede el máximo de 480 caracteres';
  end if;

  select cuerpo into v_cuerpo_anterior
  from public.plantillas_sms
  where tenant_id = p_tenant_id and event_type = p_event_type;

  insert into public.plantillas_sms (tenant_id, event_type, cuerpo, updated_by)
  values (p_tenant_id, p_event_type, p_cuerpo, (select auth.uid()))
  on conflict (tenant_id, event_type) do update
    set cuerpo = excluded.cuerpo,
        updated_by = excluded.updated_by
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'plantilla_sms.guardada',
    'plantilla_sms',
    v_row.id,
    jsonb_build_object(
      'event_type', p_event_type,
      'cuerpo_anterior', v_cuerpo_anterior,
      'cuerpo_nuevo', p_cuerpo
    )
  );

  return v_row;
end;
$$;

revoke execute on function public.fn_guardar_plantilla_sms(uuid, text, text) from public, anon;
grant execute on function public.fn_guardar_plantilla_sms(uuid, text, text) to authenticated;

-- ── fn_toggle_plantilla_sms — interruptor + auditoría, acción independiente
-- de guardar el texto (spec del módulo §10: "son dos acciones distintas") ──
create function public.fn_toggle_plantilla_sms(
  p_tenant_id uuid,
  p_event_type text,
  p_activo boolean
)
returns public.plantillas_sms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.plantillas_sms;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para cambiar el interruptor de una plantilla SMS';
  end if;

  if not public.has_role(p_tenant_id, array['agent']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol agent en esta copropiedad';
  end if;

  update public.plantillas_sms
  set activo = p_activo
  where tenant_id = p_tenant_id and event_type = p_event_type
  returning * into v_row;

  if v_row.id is null then
    raise exception 'SMS_TEMPLATE_NOT_FOUND: no existe una plantilla guardada para este evento';
  end if;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'plantilla_sms.interruptor_cambiado',
    'plantilla_sms',
    v_row.id,
    jsonb_build_object('event_type', p_event_type, 'activo', p_activo)
  );

  return v_row;
end;
$$;

revoke execute on function public.fn_toggle_plantilla_sms(uuid, text, boolean) from public, anon;
grant execute on function public.fn_toggle_plantilla_sms(uuid, text, boolean) to authenticated;
