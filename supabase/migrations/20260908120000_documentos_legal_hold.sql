-- ═══════════════════════════════════════════════════════════════════════
--  CJ-3 §10.6 (PROMPT-CAR-JUR-001) · legal_hold sobre documentos
--  Propietario: Docs/Motor de gestion de cartera/VALUACION CAR_10_cONSULTA
--  JURIDICA_DE _MOTOR_CARTERA_GOBIERNO_JURIDICO.md §10.6, auditoría 2026-08-29.
--
--  §10.6: "mientras no exista una regla jurídica específica suficiente para
--  definir una purga segura: NO PURGAR AUTOMÁTICAMENTE. Implementa
--  legal_hold para bloquear purga futura cuando exista controversia,
--  actuación o caso jurídico."
--
--  Auditoría 2026-08-29 confirmó dos cosas: (1) no existe legal_hold en
--  ningún lugar del esquema, y (2) tampoco existe NINGÚN job de purga sobre
--  documentos/expediente probatorio — así que hoy no hay violación activa,
--  pero tampoco existe la pieza protectora para cuando alguien construya
--  purga más adelante sin conocer esta restricción. Esto es exactamente ese
--  prerrequisito estructural: nada lo consume todavía (no hay purga que
--  construir aquí — no se inventa una), solo deja el freno listo.
--
--  Tabla separada, no una columna en `documentos`: documentos es
--  append-only con forbid_mutation() (20260820100300) — un UPDATE ahí es
--  literalmente imposible. El hold protege por documento_grupo_id (la
--  identidad estable de un documento a través de sus versiones), no una
--  fila puntual, porque purgar "el documento" purgaría todas sus versiones.
--
--  Mutable con auditoría en audit_log (no append-only): el propio hold no
--  es evidencia de un hecho jurídico, es un interruptor operativo de
--  protección — mismo criterio que fn_toggle_plantilla_sms (20260822240000).
--  Escritura exclusivamente vía las dos funciones SECURITY DEFINER de abajo,
--  igual que fn_guardar_plantilla_sms: sin política INSERT/UPDATE para
--  authenticated en la tabla.
-- ═══════════════════════════════════════════════════════════════════════

create table public.documentos_legal_holds (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  documento_grupo_id  uuid not null,
  activo              boolean not null default true,
  motivo              text not null check (char_length(btrim(motivo)) > 0),
  caso_id             uuid references public.casos_juridicos (id),

  creado_por          uuid not null references public.profiles (id),
  created_at          timestamptz not null default now(),
  actualizado_por     uuid references public.profiles (id),
  updated_at          timestamptz not null default now(),

  constraint documentos_legal_holds_grupo_unico unique (tenant_id, documento_grupo_id)
);

alter table public.documentos_legal_holds enable row level security;
alter table public.documentos_legal_holds force row level security;

create index documentos_legal_holds_tenant_idx on public.documentos_legal_holds (tenant_id);
create index documentos_legal_holds_activo_idx
  on public.documentos_legal_holds (tenant_id, documento_grupo_id)
  where activo;

comment on table public.documentos_legal_holds is
  'CJ-3 §10.6 — freno de purga por documento_grupo_id. activo=true bloquea cualquier purga '
  'futura de ese documento (todas sus versiones). No hay ningún job de purga hoy — esta tabla '
  'es el prerrequisito estructural, no una función completa. Escritura solo vía '
  'fn_activar_legal_hold/fn_liberar_legal_hold.';

create policy documentos_legal_holds_select_miembro
  on public.documentos_legal_holds for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_activar_legal_hold(
  p_tenant_id uuid, p_documento_grupo_id uuid, p_motivo text, p_caso_id uuid default null
)
returns public.documentos_legal_holds
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.documentos_legal_holds;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para activar un legal hold';
  end if;

  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar en esta copropiedad';
  end if;

  if char_length(btrim(p_motivo)) = 0 then
    raise exception 'MOTIVO_REQUERIDO: el motivo del legal hold no puede estar vacío';
  end if;

  if not exists (
    select 1 from public.documentos where grupo_id = p_documento_grupo_id and tenant_id = p_tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: no existe ningún documento con grupo_id % en el tenant %',
      p_documento_grupo_id, p_tenant_id;
  end if;

  if p_caso_id is not null and not exists (
    select 1 from public.casos_juridicos where id = p_caso_id and tenant_id = p_tenant_id
  ) then
    raise exception 'CASO_JURIDICO_INVALIDO: % no pertenece al tenant %', p_caso_id, p_tenant_id;
  end if;

  insert into public.documentos_legal_holds
    (tenant_id, documento_grupo_id, activo, motivo, caso_id, creado_por, actualizado_por)
  values
    (p_tenant_id, p_documento_grupo_id, true, p_motivo, p_caso_id, (select auth.uid()), (select auth.uid()))
  on conflict (tenant_id, documento_grupo_id) do update
    set activo = true,
        motivo = excluded.motivo,
        caso_id = excluded.caso_id,
        actualizado_por = excluded.actualizado_por,
        updated_at = now()
  returning * into v_row;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'documento.legal_hold_activado', 'documento', p_documento_grupo_id,
    jsonb_build_object('motivo', p_motivo, 'caso_id', p_caso_id)
  );

  return v_row;
end;
$function$;

revoke execute on function public.fn_activar_legal_hold(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.fn_activar_legal_hold(uuid, uuid, text, uuid) to authenticated;

create function public.fn_liberar_legal_hold(
  p_tenant_id uuid, p_documento_grupo_id uuid, p_motivo text
)
returns public.documentos_legal_holds
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.documentos_legal_holds;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para liberar un legal hold';
  end if;

  if not public.has_role(p_tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador en esta copropiedad para liberar un legal hold';
  end if;

  update public.documentos_legal_holds
  set activo = false,
      actualizado_por = (select auth.uid()),
      updated_at = now()
  where tenant_id = p_tenant_id and documento_grupo_id = p_documento_grupo_id and activo
  returning * into v_row;

  if v_row.id is null then
    raise exception 'LEGAL_HOLD_NO_ENCONTRADO: no hay un legal hold activo para grupo_id % en el tenant %',
      p_documento_grupo_id, p_tenant_id;
  end if;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'documento.legal_hold_liberado', 'documento', p_documento_grupo_id,
    jsonb_build_object('motivo', p_motivo)
  );

  return v_row;
end;
$function$;

revoke execute on function public.fn_liberar_legal_hold(uuid, uuid, text) from public, anon;
grant execute on function public.fn_liberar_legal_hold(uuid, uuid, text) to authenticated;

comment on function public.fn_activar_legal_hold(uuid, uuid, text, uuid) is
  'CJ-3 §10.6 — activa (o reactiva) el freno de purga sobre un documento_grupo_id. Rol mínimo '
  'auxiliar: activar un hold es una acción protectora, de riesgo bajo.';
comment on function public.fn_liberar_legal_hold(uuid, uuid, text) is
  'CJ-3 §10.6 — libera el freno de purga. Rol mínimo administrador: retirar una protección es '
  'de mayor riesgo que activarla.';
