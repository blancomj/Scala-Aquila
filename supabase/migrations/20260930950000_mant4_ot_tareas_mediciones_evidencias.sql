-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (7/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.4
--
--  `requiere_medicion`/`requiere_evidencia_foto` no están en la lista de
--  columnas de mant_ot_tareas del corte original — sin ellas,
--  "mediciones obligatorias" y "evidencia mínima" (criterio de
--  OT_CIERRE_INCOMPLETO) serían irrepresentables. Se copian 1:1 de
--  mant_plan_tareas (MANT-3) cuando la OT nace de una programación.
--
--  Una medición fuera de rango genera automáticamente una incidencia de
--  anomalía enlazada (§3.4, prueba 9) — el bucle que hace que el
--  mantenimiento preventivo detecte problemas por sí mismo.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_ot_tareas (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants (id) on delete cascade,
  ot_id                   uuid not null references public.mant_ordenes_trabajo (id) on delete cascade,
  orden                   smallint not null,
  descripcion             text not null,
  obligatoria             boolean not null default true,
  requiere_medicion       boolean not null default false,
  requiere_evidencia_foto boolean not null default false,
  estado                  public.tarea_estado_t not null default 'pendiente',
  no_aplica_motivo        text,
  ejecutada_por           uuid references public.profiles (id),
  ejecutada_at            timestamptz,
  observaciones           text,
  created_at              timestamptz not null default now(),

  constraint mant_ot_tareas_orden_unico unique (ot_id, orden),
  constraint mant_ot_tareas_descripcion_no_vacia check (btrim(descripcion) <> '')
);

create index mant_ot_tareas_ot_idx on public.mant_ot_tareas (ot_id);

alter table public.mant_ot_tareas enable row level security;
alter table public.mant_ot_tareas force row level security;

comment on table public.mant_ot_tareas is
  'MANT-4 §3.4: actividades de una OT. requiere_medicion/requiere_evidencia_foto (adición sobre '
  'el corte original) determinan qué exige OT_CIERRE_INCOMPLETO — se copian de '
  'mant_plan_tareas cuando la OT nace de una programación (MANT-3).';

create policy mant_ot_tareas_select_miembro
  on public.mant_ot_tareas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_ot_tareas_insert_auxiliar
  on public.mant_ot_tareas for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and not exists (select 1 from public.mant_ordenes_trabajo o where o.id = ot_id and o.estado = 'cerrada')
  );

create policy mant_ot_tareas_update_auxiliar
  on public.mant_ot_tareas for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_ot_tarea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot_estado public.ot_estado_t;
begin
  select estado into v_ot_estado from public.mant_ordenes_trabajo where id = new.ot_id;
  if v_ot_estado = 'cerrada' then
    raise exception 'OT_CERRADA_INMUTABLE: la OT de esta tarea ya está cerrada';
  end if;

  if new.estado = 'no_aplica' and (new.no_aplica_motivo is null or btrim(new.no_aplica_motivo) = '') then
    raise exception 'TAREA_NO_APLICA_SIN_MOTIVO: marcar una tarea no_aplica exige no_aplica_motivo';
  end if;

  return new;
end;
$$;

create trigger mant_ot_tareas_guard
  before insert or update on public.mant_ot_tareas
  for each row execute function public.guard_mant_ot_tarea();

-- ── Mediciones (reutiliza mant_atributo_definicion, MANT-1 — mismo tipo de dato/unidad) ──
create table public.mant_ot_mediciones (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,
  ot_id                  uuid not null references public.mant_ordenes_trabajo (id) on delete cascade,
  tarea_id               uuid references public.mant_ot_tareas (id),
  atributo_definicion_id uuid not null references public.mant_atributo_definicion (id),
  valor                  numeric not null,
  unidad_id              bigint references public.lista_tipos (id),
  rango_min              numeric,
  rango_max              numeric,
  fuera_de_rango         boolean not null default false,
  observacion            text,
  incidencia_generada_id uuid references public.mant_incidencias (id),
  created_at             timestamptz not null default now(),

  constraint mant_ot_mediciones_rango_valido check (rango_min is null or rango_max is null or rango_min <= rango_max)
);

create index mant_ot_mediciones_ot_idx on public.mant_ot_mediciones (ot_id);
create index mant_ot_mediciones_tarea_idx on public.mant_ot_mediciones (tarea_id) where tarea_id is not null;

alter table public.mant_ot_mediciones enable row level security;
alter table public.mant_ot_mediciones force row level security;

comment on table public.mant_ot_mediciones is
  'MANT-4 §3.4: mediciones tomadas durante una OT, reutilizando el catálogo de atributos de '
  'MANT-1 (mismo tipo de dato/unidad, no un segundo catálogo de magnitudes). Una medición fuera '
  'de rango dispara guard_mant_ot_medicion, que genera una incidencia de anomalía enlazada.';

create policy mant_ot_mediciones_select_miembro
  on public.mant_ot_mediciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_ot_mediciones_insert_auxiliar
  on public.mant_ot_mediciones for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and not exists (select 1 from public.mant_ordenes_trabajo o where o.id = ot_id and o.estado = 'cerrada')
  );

-- Sin policy de update/delete para authenticated: una medición registrada no se corrige, se
-- reemplaza con una fila nueva (mismo criterio append-only que mant_cumplimiento, MANT-2).

create function public.guard_mant_ot_medicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot_estado public.ot_estado_t;
  v_def       public.mant_atributo_definicion;
begin
  select estado into v_ot_estado from public.mant_ordenes_trabajo where id = new.ot_id;
  if v_ot_estado = 'cerrada' then
    raise exception 'OT_CERRADA_INMUTABLE: la OT de esta medición ya está cerrada';
  end if;

  select * into v_def from public.mant_atributo_definicion where id = new.atributo_definicion_id;
  if v_def.tenant_id is distinct from new.tenant_id then
    raise exception 'OT_TENANT_INCONSISTENTE: la definición de atributo % no pertenece al tenant',
      new.atributo_definicion_id;
  end if;
  if new.unidad_id is null then
    new.unidad_id := v_def.unidad_id;
  end if;

  new.fuera_de_rango :=
    (new.rango_min is not null and new.valor < new.rango_min)
    or (new.rango_max is not null and new.valor > new.rango_max);

  return new;
end;
$$;

create trigger mant_ot_mediciones_guard
  before insert on public.mant_ot_mediciones
  for each row execute function public.guard_mant_ot_medicion();

-- ── El bucle: fuera de rango -> incidencia de anomalía enlazada (§3.4, prueba 9) ──
create function public.guard_mant_ot_medicion_generar_incidencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot            public.mant_ordenes_trabajo;
  v_anomalia_id   bigint;
  v_medicion_id   bigint;
  v_anio          smallint;
  v_numero        integer;
  v_incidencia_id uuid;
begin
  if not new.fuera_de_rango then
    return new;
  end if;

  select * into v_ot from public.mant_ordenes_trabajo where id = new.ot_id;
  select id into v_anomalia_id from public.lista_tipos where tipo = 'TIPO_INCIDENCIA' and codigo = 'anomalia';
  select id into v_medicion_id from public.lista_tipos where tipo = 'ORIGEN_REPORTE' and codigo = 'medicion';

  v_anio := extract(year from now())::smallint;
  v_numero := public.fn_mant_siguiente_numero(
    new.tenant_id, v_anio,
    (select id from public.lista_tipos where tipo = 'MANT_SERIE_CONSECUTIVO' and codigo = 'incidencia')
  );

  insert into public.mant_incidencias (
    tenant_id, numero, anio, activo_id, tipo_id, titulo, descripcion,
    origen_id, reportante_ref, registrada_por
  ) values (
    new.tenant_id, v_numero, v_anio, v_ot.activo_id, v_anomalia_id,
    'Medición fuera de rango en OT ' || v_ot.anio || '-' || v_ot.numero,
    format('Valor %s fuera del rango [%s, %s] registrado en la OT %s/%s',
      new.valor, new.rango_min, new.rango_max, v_ot.numero, v_ot.anio),
    v_medicion_id, 'Generada automáticamente por medición fuera de rango', (select auth.uid())
  ) returning id into v_incidencia_id;

  update public.mant_ot_mediciones set incidencia_generada_id = v_incidencia_id where id = new.id;

  return new;
end;
$$;

comment on function public.guard_mant_ot_medicion_generar_incidencia() is
  'MANT-4 §3.4, prueba central 9: una medición fuera de rango genera automáticamente una '
  'incidencia tipo anomalia, origen medicion, enlazada vía mant_ot_mediciones.incidencia_generada_id '
  '— el bucle que hace que el mantenimiento preventivo detecte problemas.';

create trigger mant_ot_mediciones_generar_incidencia
  after insert on public.mant_ot_mediciones
  for each row execute function public.guard_mant_ot_medicion_generar_incidencia();

-- ── Evidencias (documentos, la librería general — sin almacenamiento propio) ──
create table public.mant_ot_evidencias (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  ot_id        uuid not null references public.mant_ordenes_trabajo (id) on delete cascade,
  tarea_id     uuid references public.mant_ot_tareas (id),
  documento_id uuid not null references public.documentos (id),
  tipo_evidencia_id bigint references public.lista_tipos (id),
  subido_por   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index mant_ot_evidencias_ot_idx on public.mant_ot_evidencias (ot_id);
create index mant_ot_evidencias_tarea_idx on public.mant_ot_evidencias (tarea_id) where tarea_id is not null;

alter table public.mant_ot_evidencias enable row level security;
alter table public.mant_ot_evidencias force row level security;

comment on table public.mant_ot_evidencias is
  'MANT-4 §3.4: evidencia de una OT/tarea, siempre un documento de la librería general '
  '(documentos, versionada) — sin almacenamiento propio. tipo_evidencia_id resuelve contra '
  'EVIDENCIA_OT_TIPO (foto_antes/foto_despues/firma/otro).';

create policy mant_ot_evidencias_select_miembro
  on public.mant_ot_evidencias for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_ot_evidencias_insert_auxiliar
  on public.mant_ot_evidencias for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[])
    and not exists (select 1 from public.mant_ordenes_trabajo o where o.id = ot_id and o.estado = 'cerrada')
  );

insert into public.tipos (codigo, nombre, descripcion) values
  ('EVIDENCIA_OT_TIPO', 'Tipo de evidencia de OT',
   'Qué representa un documento adjunto a una OT/tarea (MANT-4 §3.4) — puramente descriptivo.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('EVIDENCIA_OT_TIPO', 'foto_antes', 'Foto antes', 10),
  ('EVIDENCIA_OT_TIPO', 'foto_despues', 'Foto después', 20),
  ('EVIDENCIA_OT_TIPO', 'firma', 'Firma de conformidad', 30),
  ('EVIDENCIA_OT_TIPO', 'otro', 'Otro', 40);
