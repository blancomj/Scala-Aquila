-- ═══════════════════════════════════════════════════════════════════════
--  MANT-5 · Proveedores, contratos y garantías (5/9)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_05_proveedores_contratos_garantias.md §4.3
--
--  DECISIÓN (confirmada con el usuario, el corte pedía justificar): 'por_vencer'/'vencido'
--  NUNCA entran a contrato_estado_t ni se almacenan. El enum solo tiene los 4 estados reales que
--  alguien decide (borrador/vigente/suspendido/terminado); mant_contrato_estado_visible()
--  calcula la etiqueta de presentación en cada consulta — mismo criterio ya sentado por
--  mant_estado_cumplimiento (MANT-2) y por el principio #1 del marco ("un estado agregado se
--  calcula, no se almacena, cuando es derivable"). Así nunca hay nada que "escribir mal": esos
--  dos valores no son estados guardables, con o sin guard.
--
--  El compromiso presupuestal NO vive en esta tabla. mant_contrato_ejecucion() lee
--  presupuesto_ejecucion.contrato_id (columna nueva, migración 20260931070000) para el
--  ejecutado real; "comprometido" es el propio valor_total del contrato (un término pactado, no
--  un saldo que pueda divergir) — nunca se calcula ni se guarda un total aparte.
-- ═══════════════════════════════════════════════════════════════════════

create type public.contrato_estado_t as enum ('borrador', 'vigente', 'suspendido', 'terminado');
comment on type public.contrato_estado_t is
  'MANT-5 §4.3: SOLO los 4 estados reales de un contrato, los que alguien decide. Gatilla '
  'guard_mant_contrato_transicion (borrador->vigente; vigente<->suspendido; cualquiera->'
  'terminado, terminal). ''por_vencer''/''vencido'' NO están aquí a propósito — se derivan de '
  'las fechas en mant_contrato_estado_visible(), nunca se almacenan (decisión confirmada con el '
  'usuario, ver cabecera de este archivo).';

create table public.mant_contratos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  codigo                text not null,
  tercero_id            uuid not null references public.terceros (id),
  tipo_id               bigint not null references public.lista_tipos (id),
  objeto                text not null,
  descripcion           text,
  fecha_inicio          date not null,
  fecha_fin             date,
  duracion_meses        integer,
  valor_total           numeric(18, 2),
  valor_periodico       numeric(18, 2),
  periodicidad_id       bigint references public.lista_tipos (id),
  -- Términos de pago pactados (ej. "45 días fecha factura") — texto libre a propósito: no hay
  -- norma ni invariante detrás, remisión a lo pactado con el proveedor (§4 del marco). Distinto
  -- de FORMA_PAGO (lista_tipos), que es el MEDIO de recaudo de cartera, no los términos de pago
  -- de un contrato — conceptos distintos, no se reutiliza ese catálogo.
  forma_pago            text,
  supervisor_ref        text,
  sla_respuesta_horas   integer,
  sla_solucion_horas    integer,
  estado                public.contrato_estado_t not null default 'borrador',
  renovacion_automatica boolean not null default false,
  preaviso_dias         integer,
  contrato_anterior_id  uuid references public.mant_contratos (id),
  -- GOB-5 no existe todavía: sin FK a propósito (mismo patrón que contrato_id en MANT-3/4).
  decision_id           uuid,
  presupuesto_cuenta_id uuid references public.presupuesto_cuenta (id),
  documento_id          uuid references public.documentos (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz,

  constraint mant_contratos_codigo_unico unique (tenant_id, codigo),
  constraint mant_contratos_fechas_validas check (fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint mant_contratos_valor_total_valido check (valor_total is null or valor_total >= 0),
  constraint mant_contratos_valor_periodico_valido check (valor_periodico is null or valor_periodico >= 0),
  constraint mant_contratos_sla_validos
    check ((sla_respuesta_horas is null or sla_respuesta_horas > 0)
       and (sla_solucion_horas is null or sla_solucion_horas > 0))
);

alter table public.mant_contratos enable row level security;
alter table public.mant_contratos force row level security;

create index mant_contratos_tenant_idx on public.mant_contratos (tenant_id);
create index mant_contratos_tercero_idx on public.mant_contratos (tercero_id);
create index mant_contratos_estado_idx on public.mant_contratos (tenant_id, estado);

comment on table public.mant_contratos is
  'MANT-5 §4.3: contrato con un tercero. No lleva su propio saldo comprometido/ejecutado — '
  'mant_contrato_ejecucion() los da, el ejecutado leído siempre de presupuesto_ejecucion.';
comment on column public.mant_contratos.decision_id is
  'La decisión de asamblea/consejo que lo aprobó (GOB-5) — nulable, GOB-5 no existe todavía.';

create policy mant_contratos_select_miembro
  on public.mant_contratos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_contratos_insert_auxiliar
  on public.mant_contratos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_contratos_update_auxiliar
  on public.mant_contratos for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_contrato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo        text;
  v_periodicidad text;
  v_tercero_tenant uuid;
  v_anterior    public.mant_contratos%rowtype;
  v_permitida   boolean := false;
begin
  if tg_op = 'UPDATE' and old.estado = 'terminado' then
    raise exception 'CONTRATO_TERMINADO_INMUTABLE: el contrato % ya está terminado y no admite '
      'cambios', old.id;
  end if;

  select tipo into v_tipo from public.lista_tipos where id = new.tipo_id;
  if v_tipo is distinct from 'TIPO_CONTRATO' then
    raise exception 'CONTRATO_TIPO_INVALIDO: tipo_id % no pertenece a TIPO_CONTRATO (es %)',
      new.tipo_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.periodicidad_id is not null then
    select tipo into v_periodicidad from public.lista_tipos where id = new.periodicidad_id;
    if v_periodicidad is distinct from 'PERIODICIDAD_CONTRATO' then
      raise exception 'CONTRATO_PERIODICIDAD_INVALIDA: periodicidad_id % no pertenece a '
        'PERIODICIDAD_CONTRATO (es %)', new.periodicidad_id, coalesce(v_periodicidad, 'inexistente');
    end if;
  end if;

  select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_id;
  if v_tercero_tenant is null or v_tercero_tenant <> new.tenant_id then
    raise exception 'CONTRATO_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
      new.tercero_id;
  end if;

  if new.presupuesto_cuenta_id is not null
     and not exists (
       select 1 from public.presupuesto_cuenta
       where id = new.presupuesto_cuenta_id and tenant_id = new.tenant_id and es_hoja
     ) then
    raise exception 'CUENTA_NO_ES_HOJA: presupuesto_cuenta_id % no es una cuenta hoja del tenant',
      new.presupuesto_cuenta_id;
  end if;

  if new.contrato_anterior_id is not null then
    if new.contrato_anterior_id = new.id then
      raise exception 'CONTRATO_ANTERIOR_INVALIDO: un contrato no puede ser su propio anterior';
    end if;
    select * into v_anterior from public.mant_contratos where id = new.contrato_anterior_id;
    if v_anterior.id is null or v_anterior.tenant_id <> new.tenant_id then
      raise exception 'CONTRATO_ANTERIOR_INVALIDO: contrato_anterior_id % no existe o no '
        'pertenece al tenant', new.contrato_anterior_id;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    v_permitida := case old.estado
      when 'borrador'   then new.estado = 'vigente'
      when 'vigente'    then new.estado in ('suspendido', 'terminado')
      when 'suspendido' then new.estado in ('vigente', 'terminado')
      else false
    end;
    if not v_permitida then
      raise exception 'CONTRATO_TRANSICION_INVALIDA: % -> % no está permitida',
        old.estado, new.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_contrato() is
  'MANT-5 §4.3: valida catálogos/tenant/cuenta hoja, la máquina de estados (solo los 4 reales) y '
  'bloquea cualquier cambio sobre un contrato terminado — terminal para cualquier columna, '
  'chequeo al inicio (lección D-54/D-55 aplicada desde el arranque).';

create trigger mant_contratos_guard
  before insert or update on public.mant_contratos
  for each row execute function public.guard_mant_contrato();

-- ── Estado visible: SIEMPRE calculado, jamás almacenado (ver cabecera) ──
create function public.mant_contrato_estado_visible(
  p_contrato_id uuid, p_fecha date default current_date, p_umbral_dias integer default 30
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when c.estado <> 'vigente' then c.estado::text
    when c.fecha_fin is null then 'vigente'
    when c.fecha_fin < p_fecha then 'vencido'
    when c.fecha_fin <= (p_fecha + (p_umbral_dias || ' days')::interval)::date then 'por_vencer'
    else 'vigente'
  end
  from public.mant_contratos c
  where c.id = p_contrato_id;
$$;

comment on function public.mant_contrato_estado_visible(uuid, date, integer) is
  'MANT-5 §4.3: etiqueta de presentación de un contrato — ''por_vencer''/''vencido'' solo cuando '
  'estado real = vigente y las fechas lo dicen; nunca se guardan en contrato_estado_t. Mismo '
  'patrón de parámetro con default (p_umbral_dias) que mant_estado_cumplimiento/'
  'mant_habilitaciones_semaforo.';

-- ── mant_contrato_activos — qué activos cubre ────────────────────────────
create table public.mant_contrato_activos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  contrato_id uuid not null references public.mant_contratos (id) on delete cascade,
  activo_id   uuid not null references public.activos (id),
  created_at  timestamptz not null default now(),

  constraint mant_contrato_activos_unico unique (contrato_id, activo_id)
);

alter table public.mant_contrato_activos enable row level security;
alter table public.mant_contrato_activos force row level security;

create index mant_contrato_activos_tenant_idx on public.mant_contrato_activos (tenant_id);
create index mant_contrato_activos_contrato_idx on public.mant_contrato_activos (contrato_id);

comment on table public.mant_contrato_activos is
  'MANT-5 §4.3: qué activos cubre un contrato — de aquí sale la ficha de un activo enlazando a '
  'su(s) contrato(s) vigente(s).';

create policy mant_contrato_activos_select_miembro
  on public.mant_contrato_activos for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_contrato_activos_insert_auxiliar
  on public.mant_contrato_activos for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_contrato_activos_delete_auxiliar
  on public.mant_contrato_activos for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_contrato_activos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contrato_tenant uuid;
  v_activo_tenant   uuid;
begin
  select tenant_id into v_contrato_tenant from public.mant_contratos where id = new.contrato_id;
  if v_contrato_tenant is null or v_contrato_tenant <> new.tenant_id then
    raise exception 'CONTRATO_TENANT_INCONSISTENTE: contrato_id % no pertenece al tenant',
      new.contrato_id;
  end if;

  select tenant_id into v_activo_tenant from public.activos where id = new.activo_id;
  if v_activo_tenant is null or v_activo_tenant <> new.tenant_id then
    raise exception 'ACTIVO_TENANT_INCONSISTENTE: activo_id % no pertenece al tenant',
      new.activo_id;
  end if;

  return new;
end;
$$;

create trigger mant_contrato_activos_guard
  before insert on public.mant_contrato_activos
  for each row execute function public.guard_mant_contrato_activos();

-- ── mant_contrato_clausulas — cláusulas relevantes, con soporte opcional ─
create table public.mant_contrato_clausulas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  contrato_id  uuid not null references public.mant_contratos (id) on delete cascade,
  titulo       text not null,
  texto        text not null,
  documento_id uuid references public.documentos (id),
  orden        smallint not null default 0,
  created_at   timestamptz not null default now(),

  constraint mant_contrato_clausulas_titulo_no_vacio check (btrim(titulo) <> '')
);

alter table public.mant_contrato_clausulas enable row level security;
alter table public.mant_contrato_clausulas force row level security;

create index mant_contrato_clausulas_contrato_idx on public.mant_contrato_clausulas (contrato_id);

comment on table public.mant_contrato_clausulas is
  'MANT-5 §4.3: cláusulas relevantes del contrato (SLA, penalidades, terminación anticipada...), '
  'con un extracto/anexo documental opcional — el contrato completo va en '
  'mant_contratos.documento_id, esto es solo lo que se quiere destacar.';

create policy mant_contrato_clausulas_select_miembro
  on public.mant_contrato_clausulas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy mant_contrato_clausulas_insert_auxiliar
  on public.mant_contrato_clausulas for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy mant_contrato_clausulas_delete_auxiliar
  on public.mant_contrato_clausulas for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_mant_contrato_clausulas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contrato_tenant uuid;
begin
  select tenant_id into v_contrato_tenant from public.mant_contratos where id = new.contrato_id;
  if v_contrato_tenant is null or v_contrato_tenant <> new.tenant_id then
    raise exception 'CONTRATO_TENANT_INCONSISTENTE: contrato_id % no pertenece al tenant',
      new.contrato_id;
  end if;
  return new;
end;
$$;

create trigger mant_contrato_clausulas_guard
  before insert on public.mant_contrato_clausulas
  for each row execute function public.guard_mant_contrato_clausulas();
