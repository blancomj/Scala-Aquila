-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (3/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.1
--
--  Lo que ningún prompt anterior modelaba: si el contratista tiene
--  afiliación vigente a seguridad social/ARL, certificación de alturas,
--  pólizas vigentes. Una habilitación sin certificado es una afirmación —
--  documento_id nace NULLABLE a nivel de columna (para que el guard
--  devuelva HABILITACION_SIN_SOPORTE con mensaje propio, no el genérico
--  de Postgres) pero el guard lo exige en todo INSERT/UPDATE.
--
--  Estado vigente/próximo_a_vencer/vencida: calculado en
--  mant_habilitaciones_semaforo, NUNCA almacenado — mismo criterio que
--  mant_estado_cumplimiento (MANT-2), incluido el parámetro p_umbral_dias
--  con default 30 en vez de un umbral incrustado.
-- ═══════════════════════════════════════════════════════════════════════

create table public.mant_proveedor_habilitacion (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  tercero_id        uuid not null references public.terceros (id) on delete cascade,
  tipo_id           bigint not null references public.lista_tipos (id),
  numero_referencia text,
  entidad_emisora   text,
  vigente_desde     date,
  vigente_hasta     date,
  documento_id      uuid references public.documentos (id),
  verificado_por    uuid references public.profiles (id),
  verificado_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,

  constraint mant_proveedor_habilitacion_fechas_validas
    check (vigente_desde is null or vigente_hasta is null or vigente_hasta >= vigente_desde)
);

alter table public.mant_proveedor_habilitacion enable row level security;
alter table public.mant_proveedor_habilitacion force row level security;

create index mant_proveedor_habilitacion_tenant_idx on public.mant_proveedor_habilitacion (tenant_id);
create index mant_proveedor_habilitacion_tercero_idx on public.mant_proveedor_habilitacion (tercero_id);

comment on table public.mant_proveedor_habilitacion is
  'MANT-5 §4.1: documentos/certificaciones que acreditan a un tercero para trabajar como '
  'contratista/proveedor. documento_id es NULLABLE a nivel de columna a propósito — el guard '
  '(no un NOT NULL genérico) es quien exige el soporte, para poder emitir '
  'HABILITACION_SIN_SOPORTE con mensaje propio.';
comment on column public.mant_proveedor_habilitacion.vigente_hasta is
  'NULL = sin vencimiento conocido. El estado vigente/próximo_a_vencer/vencida se calcula en '
  'mant_habilitaciones_semaforo, nunca se almacena aquí.';

create policy mant_proveedor_habilitacion_select_miembro
  on public.mant_proveedor_habilitacion for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_proveedor_habilitacion_insert_auxiliar
  on public.mant_proveedor_habilitacion for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_proveedor_habilitacion_update_auxiliar
  on public.mant_proveedor_habilitacion for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_proveedor_habilitacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo            text;
  v_tercero_tenant  uuid;
  v_documento_tenant uuid;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_HABILITACION' then
    raise exception 'HABILITACION_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_HABILITACION (es %)',
      new.tipo_id, coalesce(v_tipo, 'inexistente');
  end if;

  select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
  if v_tercero_tenant is null or v_tercero_tenant <> new.tenant_id then
    raise exception 'HABILITACION_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
      new.tercero_id;
  end if;

  if new.documento_id is null then
    raise exception 'HABILITACION_SIN_SOPORTE: la habilitación exige un documento de soporte — '
      'una afirmación sin certificado no es una habilitación';
  end if;

  select tenant_id into v_documento_tenant from public.documentos where id = new.documento_id;
  if v_documento_tenant is null or v_documento_tenant <> new.tenant_id then
    raise exception 'HABILITACION_TENANT_INCONSISTENTE: el documento % no pertenece al tenant',
      new.documento_id;
  end if;

  if new.verificado_por is not null and new.verificado_at is null then
    new.verificado_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_proveedor_habilitacion() is
  'MANT-5 §4.1: valida catálogo/tenant y exige documento_id (HABILITACION_SIN_SOPORTE) — el '
  'guard es la única barrera, la columna nace nullable para poder emitir un mensaje propio en '
  'vez del NOT NULL genérico de Postgres.';

create trigger mant_proveedor_habilitacion_guard
  before insert or update on public.mant_proveedor_habilitacion
  for each row execute function public.guard_mant_proveedor_habilitacion();

-- ── Semáforo de habilitación — SIEMPRE calculado, nunca almacenado ──────
create function public.mant_habilitaciones_semaforo(
  p_tercero_id uuid, p_fecha date default current_date, p_umbral_dias integer default 30
)
returns table (
  habilitacion_id   uuid,
  tipo_id           bigint,
  tipo_nombre       text,
  vigente_desde     date,
  vigente_hasta     date,
  estado            text
)
language sql
stable
set search_path = ''
as $$
  select
    h.id,
    h.tipo_id,
    lt.nombre,
    h.vigente_desde,
    h.vigente_hasta,
    case
      when h.vigente_hasta is null then 'vigente'
      when h.vigente_hasta < p_fecha then 'vencida'
      when h.vigente_hasta <= (p_fecha + (p_umbral_dias || ' days')::interval)::date then 'proximo_a_vencer'
      else 'vigente'
    end as estado
  from public.mant_proveedor_habilitacion h
  join public.lista_tipos lt on lt.id = h.tipo_id
  where h.tercero_id = p_tercero_id
  order by lt.orden;
$$;

comment on function public.mant_habilitaciones_semaforo(uuid, date, integer) is
  'MANT-5 §4.6: semáforo de habilitación de la ficha de proveedor — lo primero que debe verse, '
  'antes que la calificación. Mismo criterio que mant_estado_cumplimiento (MANT-2): el estado '
  'nunca se almacena, y el umbral de "próximo a vencer" es un parámetro con default (30), no un '
  'valor incrustado.';
