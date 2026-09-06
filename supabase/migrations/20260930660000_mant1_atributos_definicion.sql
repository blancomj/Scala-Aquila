-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Atributos técnicos dinámicos y criticidad (1/4)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_01_atributos_criticidad.md
--
--  Este archivo: catálogo UNIDAD_MEDIDA (§3.1), enum atributo_tipo_dato_t y
--  mant_atributo_definicion (esquema de atributos por tipo de activo, por
--  tenant). La columna jsonb en `activos` y su trigger de validación van en
--  20260930670000 (necesitan este catálogo ya creado).
--
--  Decisión de diseño (Plan del corte, confirmada con el usuario): jsonb +
--  catálogo de esquema, no EAV — sin precedente de EAV en el repositorio,
--  jsonb ya es el patrón para datos extensibles (estados_cuenta_datos_jsonb,
--  presupuesto_ejecucion).
--
--  Fuera de este corte (§4, vinculante): índice de salud (MANT-9), medición
--  de campo en una OT (MANT-4), lecturas de contadores/IoT.
-- ═══════════════════════════════════════════════════════════════════════

-- ── §3.1 Unidades de medida — lista_tipos, vocabulario descriptivo (D-24) ──
insert into public.tipos (codigo, nombre, descripcion) values
  ('UNIDAD_MEDIDA', 'Unidad de medida',
   'Unidad física de un atributo técnico de activo (MANT-1 §3.1) — puramente descriptiva, sin '
   'ningún guard que dependa de cuál sea.');

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('UNIDAD_MEDIDA', 'kw', 'kW', 10),
  ('UNIDAD_MEDIDA', 'v', 'V', 20),
  ('UNIDAD_MEDIDA', 'a', 'A', 30),
  ('UNIDAD_MEDIDA', 'hp', 'HP', 40),
  ('UNIDAD_MEDIDA', 'l_min', 'l/min', 50),
  ('UNIDAD_MEDIDA', 'bar', 'bar', 60),
  ('UNIDAD_MEDIDA', 'm3', 'm³', 70),
  ('UNIDAD_MEDIDA', 'celsius', '°C', 80),
  ('UNIDAD_MEDIDA', 'rpm', 'RPM', 90),
  ('UNIDAD_MEDIDA', 'kg', 'kg', 100),
  ('UNIDAD_MEDIDA', 'lb', 'lb', 110),
  ('UNIDAD_MEDIDA', 'm', 'm', 120),
  ('UNIDAD_MEDIDA', 'kgf_cm2', 'kgf/cm²', 130),
  ('UNIDAD_MEDIDA', 'unidad', 'Unidad (sin dimensión física)', 140);

-- ── §3.1 Tipo de dato del atributo — enum: gobierna la validación (D-24) ──
create type public.atributo_tipo_dato_t as enum ('numero', 'texto', 'booleano', 'fecha', 'opcion');

comment on type public.atributo_tipo_dato_t is
  'MANT-1 §3.1: tipo de dato declarado por mant_atributo_definicion. Gatilla la validación de '
  'guard_activo_atributos (20260930670000) sobre activos.atributos — no es vocabulario '
  'descriptivo, cada valor determina qué forma de dato acepta el jsonb.';

-- ── §3.1 Esquema de atributos por tipo de activo, por tenant ────────────
create table public.mant_atributo_definicion (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  tipo_activo_id bigint not null references public.lista_tipos (id),
  codigo        text not null,
  nombre        text not null,
  tipo_dato     public.atributo_tipo_dato_t not null,
  unidad_id     bigint references public.lista_tipos (id),
  -- Solo se usa (y se exige) cuando tipo_dato = 'opcion' — validado en el guard de abajo.
  opciones      text[],
  obligatorio   boolean not null default false,
  orden         smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz,

  constraint mant_atributo_definicion_codigo_unico unique (tenant_id, tipo_activo_id, codigo)
);

alter table public.mant_atributo_definicion enable row level security;
alter table public.mant_atributo_definicion force row level security;

create index mant_atributo_definicion_tenant_idx on public.mant_atributo_definicion (tenant_id);
create index mant_atributo_definicion_tipo_idx on public.mant_atributo_definicion (tipo_activo_id);

comment on table public.mant_atributo_definicion is
  'MANT-1 §3.1: esquema de atributos técnicos por tipo de activo, por tenant — no es EAV, es el '
  'catálogo contra el que guard_activo_atributos (20260930670000) valida activos.atributos '
  '(jsonb). Sin filas sembradas por defecto (marco §6.6): cada copropiedad adopta o modifica su '
  'propio esquema. Cambiar o borrar una fila no borra valores ya guardados en activos.atributos '
  '— quedan huérfanos, reportados por mant_atributos_huerfanos (20260930670000), nunca borrados.';
comment on column public.mant_atributo_definicion.opciones is
  'Solo aplica cuando tipo_dato = ''opcion'' — validado por guard_atributo_definicion_valida. '
  'NULL para cualquier otro tipo_dato.';

-- ── Guard: consistencia de la definición ────────────────────────────────
create function public.guard_atributo_definicion_valida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_tipo   text;
  v_unidad_tipo text;
begin
  select tipo into v_tipo_tipo from public.lista_tipos where id = new.tipo_activo_id;
  if v_tipo_tipo is distinct from 'TIPO_ACTIVO' then
    raise exception 'ATRIBUTO_DEFINICION_TIPO_ACTIVO_INVALIDO: tipo_activo_id % no pertenece a '
      'TIPO_ACTIVO (es %)', new.tipo_activo_id, coalesce(v_tipo_tipo, 'inexistente');
  end if;

  if new.unidad_id is not null then
    select tipo into v_unidad_tipo from public.lista_tipos where id = new.unidad_id;
    if v_unidad_tipo is distinct from 'UNIDAD_MEDIDA' then
      raise exception 'ATRIBUTO_DEFINICION_UNIDAD_INVALIDA: unidad_id % no pertenece a '
        'UNIDAD_MEDIDA (es %)', new.unidad_id, coalesce(v_unidad_tipo, 'inexistente');
    end if;
  end if;

  if new.tipo_dato = 'opcion' and coalesce(array_length(new.opciones, 1), 0) = 0 then
    raise exception 'ATRIBUTO_DEFINICION_OPCIONES_REQUERIDAS: tipo_dato = ''opcion'' exige al '
      'menos una opción en %', new.codigo;
  end if;
  if new.tipo_dato <> 'opcion' and new.opciones is not null then
    raise exception 'ATRIBUTO_DEFINICION_OPCIONES_REQUERIDAS: opciones solo aplica cuando '
      'tipo_dato = ''opcion'' (definición %)', new.codigo;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_atributo_definicion_valida() is
  'MANT-1 §3.1: tipo_activo_id pertenece a TIPO_ACTIVO, unidad_id (si viene) a UNIDAD_MEDIDA, y '
  'opciones presente si y solo si tipo_dato = ''opcion''.';

create trigger mant_atributo_definicion_guard_valida
  before insert or update on public.mant_atributo_definicion
  for each row execute function public.guard_atributo_definicion_valida();

-- ── RLS ──────────────────────────────────────────────────────────────────
create policy mant_atributo_definicion_select_miembro
  on public.mant_atributo_definicion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_atributo_definicion_insert_auxiliar
  on public.mant_atributo_definicion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_atributo_definicion_update_auxiliar
  on public.mant_atributo_definicion for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_atributo_definicion_delete_auxiliar
  on public.mant_atributo_definicion for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));
