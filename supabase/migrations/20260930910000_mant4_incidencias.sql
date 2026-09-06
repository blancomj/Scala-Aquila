-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · Incidencias y órdenes de trabajo (3/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_04_incidencias_ordenes_trabajo.md §3.1/§3.2
--
--  AD-26: `reportante_ref`/`reportante_contacto` son texto libre — el
--  reportante NUNCA es un principal de autenticación. El INSERT lo hace
--  siempre un usuario con sesión (auxiliar/administrador); lo que no
--  requiere cuenta es la persona que reportó, no quien registra el dato.
--
--  `prioridad_sugerida_id` vs `prioridad_id`: la primera es lo que calculó
--  mant_prioridad_sugerida en el momento del alta (o null si no se pudo
--  calcular — activo sin criticidad, sin matriz configurada, etc., nunca
--  bloqueante); la segunda es el valor final, editable. Si difieren sin
--  `prioridad_sobrescrita_motivo`, el guard rechaza (§3.2).
--
--  `orden_trabajo_id` sin FK todavía: mant_ordenes_trabajo se crea en
--  20260930940000, dentro de este mismo corte — la FK se agrega en
--  20260930970000.
-- ═══════════════════════════════════════════════════════════════════════

create type public.incidencia_estado_t as enum (
  'reportada', 'en_evaluacion', 'convertida', 'resuelta', 'descartada'
);
comment on type public.incidencia_estado_t is
  'Ciclo de vida de una incidencia (MANT-4 §3.1). Gatilla guard_mant_incidencia_transicion — '
  '''descartada'' exige motivo (INCIDENCIA_DESCARTE_SIN_MOTIVO), ''resuelta''/''descartada'' son '
  'terminales. No es vocabulario descriptivo suelto.';

create table public.mant_incidencias (
  id                          uuid primary key default gen_random_uuid(),
  tenant_id                   uuid not null references public.tenants (id) on delete cascade,
  numero                      integer not null,
  anio                        smallint not null,

  activo_id                   uuid references public.activos (id),
  zona_comun_id               uuid references public.zonas_comunes (id),
  agrupacion_id               uuid references public.agrupaciones (id),

  tipo_id                     bigint not null references public.lista_tipos (id),
  titulo                      text not null,
  descripcion                 text,

  severidad_id                bigint references public.lista_tipos (id),
  prioridad_sugerida_id       bigint references public.lista_tipos (id),
  prioridad_id                bigint references public.lista_tipos (id),
  prioridad_sobrescrita_motivo text,

  estado                      public.incidencia_estado_t not null default 'reportada',

  -- AD-26: el reportante es SIEMPRE dato, nunca un principal de autenticación.
  reportante_ref              text,
  reportante_inmueble_id      uuid references public.inmuebles (id),
  reportante_contacto         text,
  origen_id                   bigint not null references public.lista_tipos (id),
  reportada_at                timestamptz not null default now(),

  orden_trabajo_id            uuid,
  incidencia_padre_id         uuid references public.mant_incidencias (id),
  descartada_motivo           text,

  registrada_por              uuid references public.profiles (id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz,

  constraint mant_incidencias_numero_unico unique (tenant_id, anio, numero),
  constraint mant_incidencias_titulo_no_vacio check (btrim(titulo) <> '')
);

create index mant_incidencias_tenant_idx on public.mant_incidencias (tenant_id);
create index mant_incidencias_activo_idx on public.mant_incidencias (activo_id) where activo_id is not null;
create index mant_incidencias_estado_idx on public.mant_incidencias (tenant_id, estado);

alter table public.mant_incidencias enable row level security;
alter table public.mant_incidencias force row level security;

comment on table public.mant_incidencias is
  'MANT-4 §3.1: incidencia reportada sobre un activo/zona común/agrupación, o de copropiedad en '
  'general. AD-26: el reportante es siempre texto libre (reportante_ref/reportante_contacto), '
  'nunca un principal de autenticación — el INSERT lo hace un usuario con sesión.';
comment on column public.mant_incidencias.orden_trabajo_id is
  'Se puebla al convertir la incidencia en OT (fn_mant_convertir_incidencia_a_ot). Sin FK hasta '
  '20260930970000 (mant_ordenes_trabajo se crea después, dentro de este mismo corte).';

create policy mant_incidencias_select_miembro
  on public.mant_incidencias for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_incidencias_insert_auxiliar
  on public.mant_incidencias for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_incidencias_update_auxiliar
  on public.mant_incidencias for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

-- ── Bitácora append-only ─────────────────────────────────────────────────
create table public.mant_incidencia_actuaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  incidencia_id  uuid not null references public.mant_incidencias (id) on delete cascade,
  tipo_actuacion text not null,
  descripcion    text not null,
  registrado_por uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);

create index mant_incidencia_actuaciones_incidencia_idx
  on public.mant_incidencia_actuaciones (incidencia_id, created_at);

alter table public.mant_incidencia_actuaciones enable row level security;
alter table public.mant_incidencia_actuaciones force row level security;

comment on table public.mant_incidencia_actuaciones is
  'MANT-4 §3.1: bitácora append-only de una incidencia (mismo patrón que '
  'caso_juridico_actuaciones) — cada cambio de estado real se registra aquí automáticamente '
  '(guard_mant_incidencia_transicion); un usuario también puede agregar una nota manual.';

create policy mant_incidencia_actuaciones_select_miembro
  on public.mant_incidencia_actuaciones for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_incidencia_actuaciones_insert_auxiliar
  on public.mant_incidencia_actuaciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger mant_incidencia_actuaciones_append_only
  before update or delete on public.mant_incidencia_actuaciones
  for each row execute function public.forbid_mutation();

-- ── Guard de la ficha (validaciones + auto-relleno de prioridad sugerida) ─
create function public.guard_mant_incidencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_origen text;
  v_severidad text;
  v_prioridad text;
  v_sugerida record;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_INCIDENCIA' then
    raise exception 'INCIDENCIA_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_INCIDENCIA (es %)',
      new.tipo_id, coalesce(v_tipo, 'inexistente');
  end if;

  select tipo into v_origen from public.lista_tipos where id = new.origen_id;
  if v_origen is distinct from 'ORIGEN_REPORTE' then
    raise exception 'INCIDENCIA_ORIGEN_INVALIDO: origen_id % no pertenece a ORIGEN_REPORTE (es %)',
      new.origen_id, coalesce(v_origen, 'inexistente');
  end if;

  if new.severidad_id is not null then
    select tipo into v_severidad from public.lista_tipos where id = new.severidad_id;
    if v_severidad is distinct from 'SEVERIDAD_INCIDENCIA' then
      raise exception 'INCIDENCIA_SEVERIDAD_INVALIDA: severidad_id % no pertenece a '
        'SEVERIDAD_INCIDENCIA (es %)', new.severidad_id, coalesce(v_severidad, 'inexistente');
    end if;
  end if;

  if new.prioridad_id is not null then
    select tipo into v_prioridad from public.lista_tipos where id = new.prioridad_id;
    if v_prioridad is distinct from 'PRIORIDAD' then
      raise exception 'INCIDENCIA_PRIORIDAD_INVALIDA: prioridad_id % no pertenece a PRIORIDAD '
        '(es %)', new.prioridad_id, coalesce(v_prioridad, 'inexistente');
    end if;
  end if;

  -- ── Consistencia de tenant ──
  if new.activo_id is not null
     and not exists (select 1 from public.activos where id = new.activo_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: el activo % no pertenece al tenant', new.activo_id;
  end if;
  if new.zona_comun_id is not null
     and not exists (select 1 from public.zonas_comunes where id = new.zona_comun_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: la zona común % no pertenece al tenant', new.zona_comun_id;
  end if;
  if new.agrupacion_id is not null
     and not exists (select 1 from public.agrupaciones where id = new.agrupacion_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: la agrupación % no pertenece al tenant', new.agrupacion_id;
  end if;
  if new.reportante_inmueble_id is not null
     and not exists (select 1 from public.inmuebles where id = new.reportante_inmueble_id and tenant_id = new.tenant_id) then
    raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: el inmueble % no pertenece al tenant', new.reportante_inmueble_id;
  end if;
  if new.incidencia_padre_id is not null then
    if new.incidencia_padre_id = new.id then
      raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: una incidencia no puede ser su propio padre';
    end if;
    if not exists (select 1 from public.mant_incidencias where id = new.incidencia_padre_id and tenant_id = new.tenant_id) then
      raise exception 'INCIDENCIA_TENANT_INCONSISTENTE: la incidencia padre % no pertenece al tenant', new.incidencia_padre_id;
    end if;
  end if;

  -- ── Prioridad sugerida (§3.2): auto-calculada al alta, nunca bloqueante ──
  if tg_op = 'INSERT' and new.activo_id is not null and new.severidad_id is not null then
    begin
      select * into v_sugerida from public.mant_prioridad_sugerida(new.activo_id, new.severidad_id);
    exception when others then
      v_sugerida := null;
    end;
    if v_sugerida.prioridad_id is not null then
      new.prioridad_sugerida_id := v_sugerida.prioridad_id;
      if new.prioridad_id is null then
        new.prioridad_id := v_sugerida.prioridad_id;
      end if;
    end if;
  end if;

  if new.prioridad_id is not null and new.prioridad_sugerida_id is not null
     and new.prioridad_id is distinct from new.prioridad_sugerida_id
     and (new.prioridad_sobrescrita_motivo is null or btrim(new.prioridad_sobrescrita_motivo) = '') then
    raise exception 'PRIORIDAD_SOBRESCRITA_SIN_MOTIVO: prioridad_id difiere de la sugerida (%) — '
      'exige prioridad_sobrescrita_motivo', new.prioridad_sugerida_id;
  end if;

  -- ── Descartar exige motivo (§3.1) ──
  if new.estado = 'descartada' and (new.descartada_motivo is null or btrim(new.descartada_motivo) = '') then
    raise exception 'INCIDENCIA_DESCARTE_SIN_MOTIVO: descartar una incidencia exige descartada_motivo';
  end if;

  -- ── Transición de estado (solo en UPDATE) + bitácora automática ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if not (
      (old.estado = 'reportada' and new.estado in ('en_evaluacion', 'descartada'))
      or (old.estado = 'en_evaluacion' and new.estado in ('convertida', 'resuelta', 'descartada'))
      or (old.estado = 'convertida' and new.estado = 'resuelta')
    ) then
      raise exception 'INCIDENCIA_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
    end if;

    insert into public.mant_incidencia_actuaciones (tenant_id, incidencia_id, tipo_actuacion, descripcion, registrado_por)
    values (new.tenant_id, new.id, 'cambio_estado', old.estado || ' -> ' || new.estado, (select auth.uid()));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_incidencia() is
  'MANT-4 §3.1/§3.2: valida catálogos y consistencia de tenant, auto-calcula la prioridad '
  'sugerida al alta (mant_prioridad_sugerida, nunca bloqueante), exige motivo si se sobrescribe '
  'o si se descarta, valida la máquina de estados y registra cada transición real en '
  'mant_incidencia_actuaciones.';

create trigger mant_incidencias_guard
  before insert or update on public.mant_incidencias
  for each row execute function public.guard_mant_incidencia();
