-- ═══════════════════════════════════════════════════════════════════════
--  plantillas_email — plantillas de correo transaccional sincronizadas
--  con Brevo (plantillas del proveedor, no HTML inline)
--  Adaptado de Casos de uso/Configuracion de Plantillas correo-SMS/
--  PROMPT-modulo-configuracion-plantillas-email-brevo.md (spec portable,
--  dominio hospedaje) al esquema real de AQUILA.
--
--  Decisión de arquitectura (2026-08-17, explícita del usuario): el envío
--  de correo de este proyecto crecerá más allá de cartera, así que se usa
--  el modelo de PLANTILLAS DE BREVO (opción 1 del spec) — Brevo renderiza,
--  esta tabla es la copia local editable + el origen de sincronización —
--  en vez de mandar HTML inline en cada request como hace hoy
--  invite-user/index.ts. invite-user NO se migra en esta pieza (decisión
--  aparte, fuera de alcance aquí).
--
--  Desviaciones deliberadas sobre el spec original:
--
--  1. `tenant_id` + único por (tenant_id, event_type): igual que
--     plantillas_sms — el spec es single-tenant.
--
--  2. `brevo_template_id` es NULLABLE, no NOT NULL: el spec asume que el
--     id ya existe y se siembra verificado (§9 "verifica cada id
--     leyéndolo del proveedor antes de sembrar"). Para AQUILA no hay
--     ningún id que verificar todavía — no existe ninguna plantilla de
--     cartera en la cuenta de Brevo. Se INVENTARÍA un id si se forzara
--     NOT NULL. En su lugar, el primer guardado exitoso CREA la plantilla
--     en Brevo (POST /v3/smtp/templates) y guarda el id real que Brevo
--     devuelve; guardados siguientes la ACTUALIZAN (PUT). Ver
--     email_provider.ts.
--
--  3. Tipos Postgres reales, no MySQL (`BIGINT UNSIGNED`/`LONGTEXT`/
--     `TINYINT(1)` → `uuid`/`text`/`boolean`).
--
--  4. Mismo patrón de auditoría vía SECURITY DEFINER que plantillas_sms
--     (fn_guardar_plantilla_email): audit_log no tiene política INSERT
--     para authenticated.
--
--  5. Catálogo de eventos: se reutilizan los MISMOS 4 event_type que
--     packages/shared/src/sms.ts (cartera_recordatorio_pago,
--     cartera_pago_vencido, cartera_pago_confirmado,
--     cartera_acuerdo_pago_creado) — mismo evento de negocio, canal
--     distinto. Permite que estrategias_cobranza.plantilla_codigo
--     resuelva contra cualquiera de las dos tablas según el canal, sin
--     inventar una segunda taxonomía. El registro de campos por evento
--     (packages/shared/src/email.ts) es independiente del de SMS: el
--     correo puede tener más campos que el SMS del mismo evento.
-- ═══════════════════════════════════════════════════════════════════════

create table public.email_templates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  event_type         text not null,
  brevo_template_id  int,
  subject            text not null,
  html_content       text not null,
  is_synced          boolean not null default false,
  last_synced_at     timestamptz,
  updated_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz,
  unique (tenant_id, event_type)
);

alter table public.email_templates enable row level security;
alter table public.email_templates force row level security;

create index email_templates_tenant_idx on public.email_templates (tenant_id);

comment on table public.email_templates is
  'Copia local editable de plantillas de correo transaccional, sincronizada hacia Brevo '
  '(plantillas del proveedor, PROMPT-modulo-configuracion-plantillas-email-brevo.md). '
  'El catálogo de eventos y sus campos vive en código '
  '(packages/shared/src/email.ts), no en esta tabla. brevo_template_id es null hasta el '
  'primer guardado exitoso — ese guardado CREA la plantilla en Brevo, no se inventa el id. '
  'is_synced=false significa que lo guardado aquí no coincide con lo que hay en Brevo '
  '(edición local sin sincronizar, o la sincronización falló) — es la información más '
  'importante de la fila, no decorativa.';

create trigger set_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

-- ── RLS: mismo patrón que plantillas_sms (is_member / has_role agent) ──
create policy email_templates_select_miembro
  on public.email_templates for select
  to authenticated
  using (public.is_member(tenant_id));

create policy email_templates_insert_agent
  on public.email_templates for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy email_templates_update_agent
  on public.email_templates for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── fn_guardar_plantilla_email — guarda local + audita (CAR/spec §7) ────
-- Solo el paso "guardar local → auditar". La sincronización hacia Brevo
-- (llamada HTTP real) vive en la Edge Function guardar-plantilla-email,
-- nunca en SQL — is_synced/brevo_template_id/last_synced_at se
-- actualizan después, vía UPDATE directo desde esa función (RLS ya
-- permite a agent escribir esta tabla, no hace falta otra función
-- SECURITY DEFINER solo para esos tres campos).
create function public.fn_guardar_plantilla_email(
  p_tenant_id uuid,
  p_event_type text,
  p_subject text,
  p_html_content text
)
returns public.email_templates
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject_anterior text;
  v_row public.email_templates;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para guardar una plantilla de correo';
  end if;

  if not public.has_role(p_tenant_id, array['agent']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol agent en esta copropiedad';
  end if;

  if char_length(p_html_content) < 10 then
    raise exception 'EMAIL_BODY_TOO_SHORT: el contenido del correo es demasiado corto';
  end if;

  select subject into v_subject_anterior
  from public.email_templates
  where tenant_id = p_tenant_id and event_type = p_event_type;

  insert into public.email_templates (tenant_id, event_type, subject, html_content, is_synced, updated_by)
  values (p_tenant_id, p_event_type, p_subject, p_html_content, false, (select auth.uid()))
  on conflict (tenant_id, event_type) do update
    set subject = excluded.subject,
        html_content = excluded.html_content,
        is_synced = false,
        updated_by = excluded.updated_by
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    (select auth.uid()),
    'plantilla_email.guardada',
    'plantilla_email',
    v_row.id,
    jsonb_build_object(
      'event_type', p_event_type,
      'subject_anterior', v_subject_anterior,
      'subject_nuevo', p_subject
    )
  );

  return v_row;
end;
$$;

revoke execute on function public.fn_guardar_plantilla_email(uuid, text, text, text) from public, anon;
grant execute on function public.fn_guardar_plantilla_email(uuid, text, text, text) to authenticated;
