-- ═══════════════════════════════════════════════════════════════════════
--  MANT-7 · Inspecciones, hallazgos y acciones correctivas (3/7)
--
--  mant_inspecciones + mant_inspeccion_respuestas: el evento completo de
--  una inspección ejecutada, con todas sus respuestas. Append-only
--  (forbid_mutation, mismo criterio que mant_inventario_movimientos) —
--  corregir una inspección ya registrada es una inspección nueva, nunca un
--  UPDATE.
--
--  formato_version es una copia congelada de mant_inspeccion_formatos.version
--  en el momento de la ejecución (no una referencia "resuelta en vivo" al
--  vigente actual) — así una edición futura del formato nunca altera esta
--  inspección ya registrada. Mismo principio que coeficiente_sets: el
--  consumidor guarda el número de versión, no solo el FK al padre.
--
--  Ambas tablas solo se pueden insertar a través de
--  fn_mant_registrar_inspeccion (20260932230000) — la bandera de sesión
--  aquila.registrando_inspeccion lo garantiza, mismo mecanismo que
--  aquila.registrando_transferencia (MANT-6) — porque generar la
--  inspección, sus hallazgos y su cumplimiento debe ser una sola operación
--  atómica, no INSERTs sueltos que puedan quedar a medias.
--
--  resultado_sugerido: public.cumplimiento_resultado_t (MANT-2) reutilizado
--  tal cual — mismos 3 valores (conforme/con_hallazgos/no_conforme) que
--  pide el prompt, no se crea un enum nuevo para lo mismo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_inspecciones (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  formato_id             uuid not null references public.mant_inspeccion_formatos (id),
  formato_version        int not null,
  activo_id              uuid references public.activos (id),
  fecha                  date not null,
  tercero_id             uuid references public.terceros (id),
  acreditacion_referencia text,
  resultado_sugerido     public.cumplimiento_resultado_t not null,
  resultado              public.cumplimiento_resultado_t not null,
  resultado_motivo       text,
  cumplimiento_id        uuid references public.mant_cumplimiento (id),
  registrada_por         uuid references public.profiles (id),
  created_at             timestamptz not null default now()
);

alter table public.mant_inspecciones enable row level security;
alter table public.mant_inspecciones force row level security;

create index mant_inspecciones_tenant_idx on public.mant_inspecciones (tenant_id);
create index mant_inspecciones_formato_idx on public.mant_inspecciones (formato_id);
create index mant_inspecciones_activo_idx on public.mant_inspecciones (activo_id) where activo_id is not null;

comment on table public.mant_inspecciones is
  'MANT-7: una inspección ejecutada — append-only. formato_version congela la versión del '
  'formato usada (nunca se recalcula desde el vigente actual). resultado_sugerido lo calcula '
  'fn_mant_registrar_inspeccion desde las respuestas; resultado es el que queda (puede diferir '
  'del sugerido solo con resultado_motivo — INSPECCION_RESULTADO_SOBRESCRITO_SIN_MOTIVO). '
  'cumplimiento_id (nullable) enlaza el mant_cumplimiento generado si el formato tiene '
  'requisito_id.';

create trigger mant_inspecciones_append_only
  before update or delete on public.mant_inspecciones
  for each row execute function public.forbid_mutation();

create function public.guard_mant_inspeccion_registrada_por()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.registrada_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_mant_inspeccion_registrada_por
  before insert on public.mant_inspecciones
  for each row execute function public.guard_mant_inspeccion_registrada_por();

create function public.guard_mant_inspeccion_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('aquila.registrando_inspeccion', true), 'false') <> 'true' then
    raise exception 'INSPECCION_REGISTRO_DIRECTO_PROHIBIDO: registrar una inspección exige '
      'fn_mant_registrar_inspeccion, no un INSERT directo';
  end if;
  return new;
end;
$$;

comment on function public.guard_mant_inspeccion_flag() is
  'Impide INSERT directo en mant_inspecciones/mant_inspeccion_respuestas fuera de '
  'fn_mant_registrar_inspeccion (20260932230000) — la generación de hallazgos y cumplimiento '
  'debe ser atómica con el registro de la inspección, mismo mecanismo que '
  'aquila.registrando_transferencia (MANT-6).';

create trigger guard_mant_inspeccion_flag
  before insert on public.mant_inspecciones
  for each row execute function public.guard_mant_inspeccion_flag();

create policy mant_inspecciones_select_miembro
  on public.mant_inspecciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_inspecciones_insert_auxiliar
  on public.mant_inspecciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- Sin policy de update ni delete: append-only, forbid_mutation ya lo garantiza.

-- ═══════════════════════════════════════════════════════════════════════
--  Respuestas por ítem — hijas de una inspección, mismo régimen append-only
--  y misma bandera de sesión.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_inspeccion_respuestas (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  inspeccion_id          uuid not null references public.mant_inspecciones (id) on delete cascade,
  item_id                uuid not null references public.mant_inspeccion_formato_items (id),
  valor                  public.respuesta_valor_t not null,
  observacion            text,
  evidencia_documento_id uuid references public.documentos (id),
  created_at             timestamptz not null default now()
);

alter table public.mant_inspeccion_respuestas enable row level security;
alter table public.mant_inspeccion_respuestas force row level security;

create index mant_inspeccion_respuestas_tenant_idx on public.mant_inspeccion_respuestas (tenant_id);
create index mant_inspeccion_respuestas_inspeccion_idx on public.mant_inspeccion_respuestas (inspeccion_id);

comment on table public.mant_inspeccion_respuestas is
  'MANT-7: respuesta a un ítem de checklist dentro de una inspección — append-only, hija de '
  'mant_inspecciones. valor = ''no_conforme'' es lo único que dispara la creación automática de '
  'un mant_hallazgos (fn_mant_registrar_inspeccion).';

create trigger mant_inspeccion_respuestas_append_only
  before update or delete on public.mant_inspeccion_respuestas
  for each row execute function public.forbid_mutation();

create trigger guard_mant_inspeccion_flag
  before insert on public.mant_inspeccion_respuestas
  for each row execute function public.guard_mant_inspeccion_flag();

create policy mant_inspeccion_respuestas_select_miembro
  on public.mant_inspeccion_respuestas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_inspeccion_respuestas_insert_auxiliar
  on public.mant_inspeccion_respuestas for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
