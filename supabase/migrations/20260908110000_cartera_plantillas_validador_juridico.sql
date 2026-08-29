-- ═══════════════════════════════════════════════════════════════════════
--  CJ-4 §11.3 (PROMPT-CAR-JUR-001) · Validador de afirmaciones prohibidas
--  Propietario: Docs/Motor de gestion de cartera/VALUACION CAR_10_cONSULTA
--  JURIDICA_DE _MOTOR_CARTERA_GOBIERNO_JURIDICO.md §11.3, auditoría 2026-08-29.
--
--  Auditoría 2026-08-29 confirmó que plantillas_sms/email_templates son
--  texto libre sin ningún validador — un administrador puede guardar
--  "queda constituido en mora por este envío" o "será reportado a
--  centrales de riesgo" sin que nada lo impida. §11.3 exige que el rechazo
--  sea PROGRAMÁTICO, no solo documental.
--
--  Catálogo global (sin tenant_id), mismo criterio que tasas_referencia
--  (20260822220000, CLAUDE.md §25): es una regla de cumplimiento de la
--  plataforma, no una preferencia de copropiedad — lectura abierta a
--  authenticated, escritura restringida a is_platform_admin().
--
--  Coincidencia por subcadena (ILIKE), no regex ni NLP: es un primer catálogo
--  de frases/palabras clave literales tomadas de los siete supuestos de
--  §11.3, no un clasificador semántico. Deliberadamente conservador —
--  puede haber falsos negativos (frases prohibidas dichas de otra forma) y
--  se extiende agregando filas, nunca reescribiendo esta migración. Los
--  supuestos de §11.3 que dependen de estado real (p. ej. "amenaza de
--  medida judicial inexistente") no son verificables por texto solo y
--  quedan fuera de este validador — el catálogo cubre las frases que SÍ
--  son detectables como texto, sin importar el estado del caso.
--
--  El rechazo ocurre dentro de fn_guardar_plantilla_sms/email (redefinidas
--  aquí sobre el cuerpo vigente tras PRQ-CAR-021, 20260907130000) — mismo
--  patrón que guard_politica_financiera_tope_legal (20260901110000):
--  RAISE EXCEPTION con la frase y el fundamento, no un warning silencioso.
-- ═══════════════════════════════════════════════════════════════════════

create table public.plantillas_frases_prohibidas (
  id          bigint generated always as identity primary key,
  patron      text not null check (char_length(btrim(patron)) > 0),
  categoria   text not null,
  descripcion text not null,
  fundamento  text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.plantillas_frases_prohibidas enable row level security;
alter table public.plantillas_frases_prohibidas force row level security;

comment on table public.plantillas_frases_prohibidas is
  'CJ-4 §11.3 — catálogo global (no por tenant) de frases/palabras que una plantilla de '
  'cobranza no puede contener sin sustento. Coincidencia por subcadena (ILIKE), no regex/NLP. '
  'Escritura restringida a is_platform_admin() — es una regla de cumplimiento, no una '
  'preferencia de copropiedad.';

create policy plantillas_frases_prohibidas_select_authenticated
  on public.plantillas_frases_prohibidas for select
  to authenticated
  using (true);

create policy plantillas_frases_prohibidas_insert_platform_admin
  on public.plantillas_frases_prohibidas for insert
  to authenticated
  with check (public.is_platform_admin());

insert into public.plantillas_frases_prohibidas (patron, categoria, descripcion, fundamento) values
  ('constituye en mora', 'constitucion_mora_indebida',
   'Forma performativa ("por este medio se constituye en mora") en vez de descriptiva.',
   'CJ-4 §11.1-11.2: la mora la constituye el vencimiento del plazo, no el envío de la comunicación.'),
  ('queda constituido en mora', 'constitucion_mora_indebida',
   'Forma performativa equivalente a "constituye en mora".',
   'CJ-4 §11.1-11.2.'),
  ('embargo inminente', 'amenaza_no_sustentada',
   'Anuncia una medida cautelar sin que exista un proceso judicial que la respalde.',
   'CJ-4 §11.3: prohibido anunciar embargo inminente automático.'),
  ('procederemos a embargar', 'amenaza_no_sustentada',
   'Amenaza de embargo sin proceso judicial en curso.',
   'CJ-4 §11.3.'),
  ('central de riesgo', 'reporte_no_sustentado',
   'Afirma reporte a centrales de riesgo sin base para asegurarlo desde una plantilla genérica.',
   'CJ-4 §11.3: prohibido anunciar reporte automático a centrales de riesgo.'),
  ('centrales de riesgo', 'reporte_no_sustentado',
   'Variante plural del mismo supuesto.',
   'CJ-4 §11.3.'),
  ('datacrédito', 'reporte_no_sustentado',
   'Nombra una central de riesgo específica como destino de reporte automático.',
   'CJ-4 §11.3.'),
  ('suspensión del servicio', 'suspension_no_sustentada',
   'Anuncia suspensión automática sin base contractual/reglamentaria verificada en el envío.',
   'CJ-4 §11.3: prohibido anunciar suspensión automática de servicios.'),
  ('suspenderemos el servicio', 'suspension_no_sustentada',
   'Variante en primera persona del mismo supuesto.',
   'CJ-4 §11.3.'),
  ('será publicado en', 'publicacion_no_sustentada',
   'Anuncia publicación pública de datos de mora sin canal restringido verificado.',
   'CJ-4 §11.3 + CJ-7 §14.2: publicación pública en Internet bloqueada por defecto.'),
  ('consecuencias penales', 'consecuencia_no_aplicable',
   'El cobro de expensas comunes es un asunto civil; no genera consecuencias penales.',
   'CJ-4 §11.3: prohibido anunciar consecuencias disciplinarias o penales no aplicables.'),
  ('proceso penal', 'consecuencia_no_aplicable',
   'Variante del mismo supuesto.',
   'CJ-4 §11.3.'),
  ('antecedentes penales', 'consecuencia_no_aplicable',
   'Variante del mismo supuesto.',
   'CJ-4 §11.3.');

create function public.fn_validar_contenido_plantilla(p_texto text)
returns table (patron text, categoria text, descripcion text, fundamento text)
language sql
stable
set search_path = ''
as $$
  select f.patron, f.categoria, f.descripcion, f.fundamento
  from public.plantillas_frases_prohibidas f
  where f.activo and p_texto ilike '%' || f.patron || '%';
$$;

comment on function public.fn_validar_contenido_plantilla(text) is
  'CJ-4 §11.3 — devuelve las filas de plantillas_frases_prohibidas que hacen match (ILIKE) '
  'contra el texto dado. Vacío = sin coincidencias. Usada por fn_guardar_plantilla_sms/email '
  'para rechazar el guardado, no solo advertir.';

-- ── fn_guardar_plantilla_sms — agrega el validador antes del upsert ─────
-- Cuerpo idéntico al vigente (20260907130000) salvo el bloque de validación
-- agregado al inicio.
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
  v_match record;
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

  select * into v_match from public.fn_validar_contenido_plantilla(p_cuerpo) limit 1;
  if v_match.patron is not null then
    raise exception 'CONTENIDO_PROHIBIDO: el texto contiene "%" (%) — %',
      v_match.patron, v_match.categoria, v_match.fundamento;
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
  v_match record;
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

  select * into v_match from public.fn_validar_contenido_plantilla(p_subject || ' ' || p_html_content) limit 1;
  if v_match.patron is not null then
    raise exception 'CONTENIDO_PROHIBIDO: el texto contiene "%" (%) — %',
      v_match.patron, v_match.categoria, v_match.fundamento;
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
