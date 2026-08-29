-- ═══════════════════════════════════════════════════════════════════════
--  PRQ-CAR-021 — Versionado recuperable de plantillas (bloque 24)
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §24.1
--
--  Hasta hoy plantillas_sms/email_templates se editan EN SITIO — una sola
--  fila por (tenant_id, event_type), sin rastro de lo que decían ayer. La
--  prueba fiel de lo que salió YA existe (acciones_cobranza_envios.
--  contenido_renderizado, 20260906130000) — este bloque no toca eso. Lo
--  que falta es poder recuperar el TEXTO de la plantilla en un momento
--  dado, para revisión administrativa y para que plantilla_version en el
--  envío deje de ser un 0 con comentario "no se escribe 1 para
--  disimular" y pase a ser un número real.
--
--  Diseño: append-only, mismo patrón que posiciones_cartera_snapshot —
--  cada fila de _versiones es una foto INMUTABLE del texto en el momento
--  del guardado, nunca se reescribe ni se borra (salvo cascada por borrado
--  de tenant, forbid_mutation_salvo_tenant_borrado(), ya existente desde
--  20260823250000 — no se reinventa el guard). "Recuperar" una versión
--  vieja es un acto humano en la interfaz: cargarla en el editor y volver
--  a guardar, lo que crea una versión NUEVA con ese texto — nunca se
--  reescribe la fila viva para "volver atrás" en el tiempo.
--
--  version en la fila viva (plantillas_sms/email_templates) es la versión
--  ACTUAL, denormalizada para que el worker de despacho (despacho_
--  cobranza.ts) la lea sin un JOIN extra en cada envío — el número real
--  vive también en la fila de _versiones correspondiente (mismo valor).
--
--  No se versiona en cada `guardar`: si el texto (cuerpo / subject+html)
--  no cambió respecto a la fila viva, no se crea una fila nueva — evita
--  historial ruidoso por reguardar sin editar nada. `activo`/is_synced no
--  disparan versión — PRQ-CAR-021 es sobre el TEXTO, no sobre el
--  interruptor ni el estado de sincronización con Brevo.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.plantillas_sms add column version int not null default 1;
alter table public.email_templates add column version int not null default 1;

comment on column public.plantillas_sms.version is
  'Versión actual del texto — denormalizada desde plantillas_sms_versiones para lectura barata '
  'en el worker de despacho (PRQ-CAR-021).';
comment on column public.email_templates.version is
  'Versión actual del texto (subject+html_content) — denormalizada desde plantillas_email_versiones '
  '(PRQ-CAR-021).';

-- ── plantillas_sms_versiones ────────────────────────────────────────────
create table public.plantillas_sms_versiones (
  id           uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.plantillas_sms (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  event_type   text not null,
  version      int not null check (version > 0),
  cuerpo       text not null,
  creado_por   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (plantilla_id, version)
);

alter table public.plantillas_sms_versiones enable row level security;
alter table public.plantillas_sms_versiones force row level security;

create index plantillas_sms_versiones_tenant_idx on public.plantillas_sms_versiones (tenant_id);
create index plantillas_sms_versiones_plantilla_idx on public.plantillas_sms_versiones (plantilla_id, version desc);

comment on table public.plantillas_sms_versiones is
  'Historial append-only de plantillas_sms.cuerpo (PRQ-CAR-021) — una fila por guardado que '
  'cambió el texto. Solo lectura para authenticated: la escritura vive dentro de '
  'fn_guardar_plantilla_sms (SECURITY DEFINER), nunca INSERT directo del cliente.';

create policy plantillas_sms_versiones_select_miembro
  on public.plantillas_sms_versiones for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger plantillas_sms_versiones_append_only
  before update or delete on public.plantillas_sms_versiones
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

-- ── plantillas_email_versiones ──────────────────────────────────────────
create table public.plantillas_email_versiones (
  id           uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.email_templates (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  event_type   text not null,
  version      int not null check (version > 0),
  subject      text not null,
  html_content text not null,
  creado_por   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (plantilla_id, version)
);

alter table public.plantillas_email_versiones enable row level security;
alter table public.plantillas_email_versiones force row level security;

create index plantillas_email_versiones_tenant_idx on public.plantillas_email_versiones (tenant_id);
create index plantillas_email_versiones_plantilla_idx on public.plantillas_email_versiones (plantilla_id, version desc);

comment on table public.plantillas_email_versiones is
  'Historial append-only de email_templates.(subject, html_content) (PRQ-CAR-021) — mismo '
  'criterio que plantillas_sms_versiones. Solo lectura para authenticated.';

create policy plantillas_email_versiones_select_miembro
  on public.plantillas_email_versiones for select
  to authenticated
  using (public.is_member(tenant_id));

create trigger plantillas_email_versiones_append_only
  before update or delete on public.plantillas_email_versiones
  for each row execute function public.forbid_mutation_salvo_tenant_borrado();

-- ── Backfill: la primera fila de historial para lo que ya existe hoy ────
-- version ya es 1 en toda fila existente (recién agregada con default 1),
-- así que el backfill es consistente con la numeración que seguirá fn_guardar_*.
insert into public.plantillas_sms_versiones (plantilla_id, tenant_id, event_type, version, cuerpo, creado_por, created_at)
select id, tenant_id, event_type, version, cuerpo, updated_by, coalesce(updated_at, created_at)
from public.plantillas_sms;

insert into public.plantillas_email_versiones (plantilla_id, tenant_id, event_type, version, subject, html_content, creado_por, created_at)
select id, tenant_id, event_type, version, subject, html_content, updated_by, coalesce(updated_at, created_at)
from public.email_templates;

-- ── fn_guardar_plantilla_sms — agrega versionado al upsert existente ────
-- Cuerpo idéntico al desplegado (20260830140000, rol 'auxiliar') salvo:
-- version se incrementa SOLO si el texto cambió, y esa nueva versión se
-- fotografía en plantillas_sms_versiones dentro de la misma transacción.
create or replace function public.fn_guardar_plantilla_sms(
  p_tenant_id uuid, p_event_type text, p_cuerpo text
)
returns plantillas_sms
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cuerpo_anterior text;
  v_row public.plantillas_sms;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para guardar una plantilla SMS';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  if char_length(p_cuerpo) > 480 then
    raise exception 'SMS_BODY_TOO_LONG: el texto excede el máximo de 480 caracteres';
  end if;

  select cuerpo into v_cuerpo_anterior
  from public.plantillas_sms
  where tenant_id = p_tenant_id and event_type = p_event_type;

  insert into public.plantillas_sms (tenant_id, event_type, cuerpo, updated_by, version)
  values (p_tenant_id, p_event_type, p_cuerpo, (select auth.uid()), 1)
  on conflict (tenant_id, event_type) do update
    set cuerpo = excluded.cuerpo,
        updated_by = excluded.updated_by,
        version = case
          when public.plantillas_sms.cuerpo is distinct from excluded.cuerpo
          then public.plantillas_sms.version + 1
          else public.plantillas_sms.version
        end
  returning * into v_row;

  if v_cuerpo_anterior is distinct from p_cuerpo then
    insert into public.plantillas_sms_versiones (plantilla_id, tenant_id, event_type, version, cuerpo, creado_por)
    values (v_row.id, p_tenant_id, p_event_type, v_row.version, v_row.cuerpo, (select auth.uid()));
  end if;

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
      'cuerpo_nuevo', p_cuerpo,
      'version', v_row.version
    )
  );

  return v_row;
end;
$function$;

-- ── fn_guardar_plantilla_email — mismo tratamiento para subject+html ────
create or replace function public.fn_guardar_plantilla_email(
  p_tenant_id uuid, p_event_type text, p_subject text, p_html_content text
)
returns email_templates
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_subject_anterior text;
  v_html_anterior text;
  v_row public.email_templates;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para guardar una plantilla de correo';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  if char_length(p_html_content) < 10 then
    raise exception 'EMAIL_BODY_TOO_SHORT: el contenido del correo es demasiado corto';
  end if;

  select subject, html_content into v_subject_anterior, v_html_anterior
  from public.email_templates
  where tenant_id = p_tenant_id and event_type = p_event_type;

  insert into public.email_templates (tenant_id, event_type, subject, html_content, is_synced, updated_by, version)
  values (p_tenant_id, p_event_type, p_subject, p_html_content, false, (select auth.uid()), 1)
  on conflict (tenant_id, event_type) do update
    set subject = excluded.subject,
        html_content = excluded.html_content,
        is_synced = false,
        updated_by = excluded.updated_by,
        version = case
          when (public.email_templates.subject, public.email_templates.html_content)
               is distinct from (excluded.subject, excluded.html_content)
          then public.email_templates.version + 1
          else public.email_templates.version
        end
  returning * into v_row;

  if (v_subject_anterior, v_html_anterior) is distinct from (p_subject, p_html_content) then
    insert into public.plantillas_email_versiones
      (plantilla_id, tenant_id, event_type, version, subject, html_content, creado_por)
    values (v_row.id, p_tenant_id, p_event_type, v_row.version, v_row.subject, v_row.html_content, (select auth.uid()));
  end if;

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
      'subject_nuevo', p_subject,
      'version', v_row.version
    )
  );

  return v_row;
end;
$function$;

-- ── acciones_cobranza_envios.plantilla_version deja de significar
-- "sin versionado" — ya existe el versionado. 0 pasa a significar
-- exclusivamente "se usó la plantilla de correo del sistema por defecto,
-- no una propia versionada" (email sin plantilla propia redactada); en
-- SMS siempre hay plantilla propia (el despacho rechaza sin ella), así
-- que un SMS nunca despacha con plantilla_version = 0. El código que
-- escribe esta columna (despacho_cobranza.ts) se actualiza junto con
-- esta migración, no en una pieza aparte — hasta el redeploy de
-- ejecutar-accion-cobranza/cartera-ejecutar-lote seguiría escribiendo 0.
comment on column public.acciones_cobranza_envios.plantilla_version is
  'Versión de plantillas_sms/email_templates.version vigente al momento del envío (PRQ-CAR-021, '
  '20260907130000). 0 = correo despachado con la plantilla del sistema por defecto (sin plantilla '
  'propia redactada) — nunca ocurre en SMS. La prueba fiel del contenido sigue siendo '
  'contenido_renderizado, no este número: incluso sabiendo la versión, reconstruir el texto exacto '
  'enviado a un destinatario requiere también los valores de campos de ESE envío.';
