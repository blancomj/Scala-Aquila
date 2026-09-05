-- ═══════════════════════════════════════════════════════════════════════
--  Dominio Fondos — BLOQUE C/D: autorización del fondo + fuentes de
--  alimentación. Cierra además §4.5 de ANALISIS_FONDOS_BLOQUE_A.md.
--  Propietario: PLAN_MAESTRO_IMPLEMENTACION.md §4.3 (GAP-22), D-36.
--
--  BLOQUE C — fondo_autorizaciones. Modelo Maestro §7: quién decidió, con
--  qué acta, con qué alcance. AQUILA NO decide competencia jurídica (§7/§34):
--  registra la decisión adoptada, no la valida contra el reglamento de cada
--  copropiedad. Por eso `tipo_decision`, `decision` y `alcance` son texto
--  libre — convertirlos en enums sería fingir que el sistema arbitra algo
--  que la Asamblea o el Consejo ya resolvieron fuera de AQUILA.
--
--  Es append-only (forbid_mutation, mismo patrón que audit_log/
--  fondo_movimientos): una autorización es un hecho jurídico ya ocurrido.
--  Si el acta que se transcribió estaba mal, se registra la corrección como
--  una autorización nueva — no se reescribe la historia.
--
--  BLOQUE D — fondo_fuentes. Modelo Maestro §9/§10: de dónde vienen los
--  recursos y bajo qué regla. A diferencia de fondo_autorizaciones, SÍ es
--  editable: es configuración vigente (activa/inactiva), no un hecho
--  puntual — mismo criterio que contable_cuenta_default, no el de
--  fondo_movimientos.
--
--  CIERRE DE §4.5 (ANALISIS_FONDOS_BLOQUE_A.md). `fuente_financiacion`
--  validaba el fondo de imprevistos buscándolo por `naturaleza='imprevistos'`
--  sin FK — irreproducible en cuanto exista más de un fondo elegible. Se
--  añade `fondo_id` nullable: el guard lo resuelve solo para
--  'fondo_imprevistos' (compatibilidad con el payload actual de
--  presupuesto-financiacion, que no lo envía) y lo exige explícito para
--  cualquier otro tipo que declare financiarse con un fondo — abriendo la
--  puerta a que un fondo de destinación específica sea fuente presupuestal
--  (Modelo §23) sin overload de la lectura por naturaleza.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Catálogo ORGANO_DECISORIO ────────────────────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values (
  'ORGANO_DECISORIO',
  'Órgano Decisorio',
  'Quién adoptó una decisión sobre un fondo (Modelo Maestro §7). Vocabulario descriptivo: AQUILA '
  'registra la decisión, no arbitra qué órgano tenía competencia — eso lo determina el '
  'reglamento de cada copropiedad.'
);

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('ORGANO_DECISORIO', 'asamblea', 'Asamblea de Copropietarios', 1),
  ('ORGANO_DECISORIO', 'consejo', 'Consejo de Administración', 2),
  ('ORGANO_DECISORIO', 'administrador', 'Administrador', 3),
  ('ORGANO_DECISORIO', 'reglamento', 'Reglamento de Propiedad Horizontal', 4),
  ('ORGANO_DECISORIO', 'otro', 'Otro', 5);

-- ── 2. fondo_autorizaciones ──────────────────────────────────────────────
create table public.fondo_autorizaciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  fondo_id       uuid not null references public.fondos (id) on delete cascade,
  organo_id      bigint not null references public.lista_tipos (id),
  tipo_decision  text not null,
  numero_acta    text,
  fecha_acta     date,
  decision       text not null,
  alcance        text,
  vigencia_desde date,
  vigencia_hasta date,
  documento_id   uuid references public.documentos (id),
  registrada_por uuid references public.profiles (id),
  created_at     timestamptz not null default now(),

  constraint fondo_autorizaciones_vigencia_coherente
    check (vigencia_hasta is null or vigencia_desde is null or vigencia_hasta >= vigencia_desde)
);

comment on table public.fondo_autorizaciones is
  'Decisión de creación, modificación o uso de un fondo, con su soporte (Modelo Maestro §7). '
  'Append-only: es el registro de un hecho jurídico ya ocurrido, no una configuración editable. '
  'AQUILA no decide competencia — registra lo que el órgano competente decidió.';
comment on column public.fondo_autorizaciones.tipo_decision is
  'Qué clase de decisión fue (creación, modificación de meta, autorización de erogación...). '
  'Texto libre a propósito: el catálogo de decisiones posibles no es cerrado ni AQUILA debe '
  'cerrarlo (Modelo §7/§34).';
comment on column public.fondo_autorizaciones.decision is
  'Qué se decidió, en lenguaje natural. No se interpreta ni se ejecuta automáticamente.';
comment on column public.fondo_autorizaciones.alcance is
  'Límites de la autorización cuando existen (monto máximo, destino específico). Texto libre: '
  'un límite ejecutable de verdad vive en fondo_fuentes o en fondo_compromisos, no aquí.';

alter table public.fondo_autorizaciones enable row level security;
alter table public.fondo_autorizaciones force row level security;

create index fondo_autorizaciones_tenant_idx on public.fondo_autorizaciones (tenant_id);
create index fondo_autorizaciones_fondo_idx on public.fondo_autorizaciones (fondo_id);

create policy fondo_autorizaciones_select_miembro
  on public.fondo_autorizaciones for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy fondo_autorizaciones_insert_agent
  on public.fondo_autorizaciones for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create trigger fondo_autorizaciones_append_only
  before update or delete on public.fondo_autorizaciones
  for each row execute function public.forbid_mutation();

create function public.guard_fondo_autorizacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.fondos f where f.id = new.fondo_id and f.tenant_id = new.tenant_id
  ) then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.organo_id
       and lt.tipo = 'ORGANO_DECISORIO'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'ORGANO_DECISORIO_INVALIDO: % no es un ORGANO_DECISORIO visible para el '
      'tenant %', new.organo_id, new.tenant_id;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  new.registrada_por := coalesce(new.registrada_por, (select auth.uid()));

  return new;
end;
$$;

create trigger guard_fondo_autorizacion
  before insert on public.fondo_autorizaciones
  for each row execute function public.guard_fondo_autorizacion();

-- ── 3. Catálogo TIPO_FUENTE_ALIMENTACION_FONDO ──────────────────────────
insert into public.tipos (codigo, nombre, descripcion) values (
  'TIPO_FUENTE_ALIMENTACION_FONDO',
  'Tipo de Fuente de Alimentación de Fondo',
  'De dónde provienen los recursos que alimentan un fondo (Modelo Maestro §9). No confundir con '
  'TIPO_FUENTE_FINANCIACION (fuente_financiacion): esa describe qué financia un PRESUPUESTO; '
  'esta describe qué ALIMENTA un FONDO — un fondo puede a su vez actuar como una de esas fuentes '
  '(Modelo §23), pero las dos direcciones no se fusionan.'
);

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'recargo_fondo_imprevistos', 'Recargo Fondo de Imprevistos', 1),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'cuota_extraordinaria', 'Cuota Extraordinaria', 2),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'apropiacion_presupuestal', 'Apropiación Presupuestal', 3),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'ingreso_especifico', 'Ingreso Específico', 4),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'rendimiento_financiero', 'Rendimiento Financiero', 5),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'donacion', 'Donación', 6),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'traslado_autorizado', 'Traslado Autorizado', 7),
  ('TIPO_FUENTE_ALIMENTACION_FONDO', 'otra', 'Otra', 8);

-- ── 4. fondo_fuentes ─────────────────────────────────────────────────────
create table public.fondo_fuentes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  fondo_id        uuid not null references public.fondos (id) on delete cascade,
  tipo_id         bigint not null references public.lista_tipos (id),
  base_calculo    text,
  porcentaje      numeric(6, 4),
  valor           numeric(18, 2),
  periodicidad    text,
  vigencia_desde  date,
  vigencia_hasta  date,
  autorizacion_id uuid references public.fondo_autorizaciones (id),
  documento_id    uuid references public.documentos (id),
  activa          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,

  constraint fondo_fuentes_porcentaje_o_valor check (porcentaje is not null or valor is not null),
  constraint fondo_fuentes_porcentaje_rango
    check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  constraint fondo_fuentes_valor_positivo check (valor is null or valor > 0),
  constraint fondo_fuentes_vigencia_coherente
    check (vigencia_hasta is null or vigencia_desde is null or vigencia_hasta >= vigencia_desde)
);

comment on table public.fondo_fuentes is
  'Regla de alimentación configurada para un fondo (Modelo Maestro §9/§10): de dónde vienen los '
  'recursos, con qué base/porcentaje/valor y con qué autorización. Configuración vigente, no un '
  'hecho puntual — se desactiva con activa=false, no se borra (histórico de reglas aplicadas).';
comment on column public.fondo_fuentes.base_calculo is
  'Sobre qué se calcula el aporte cuando es porcentual (p.ej. "presupuesto anual de gastos '
  'comunes"). Texto libre: la regla legal exacta no se codifica permanentemente (Modelo §10) '
  'porque puede cambiar sin que cambie el esquema.';
comment on column public.fondo_fuentes.periodicidad is
  'Con qué frecuencia aplica (mensual, anual, única vez...). Texto libre porque no gatilla '
  'ninguna rama de código propia — quien liquida decide cuándo generar el cargo.';
comment on column public.fondo_fuentes.autorizacion_id is
  'Autorización que sustenta esta regla, cuando la exige el tipo de decisión. Nullable: no toda '
  'fuente requiere un acta propia (p.ej. un rendimiento financiero no la necesita).';

alter table public.fondo_fuentes enable row level security;
alter table public.fondo_fuentes force row level security;

create index fondo_fuentes_tenant_idx on public.fondo_fuentes (tenant_id);
create index fondo_fuentes_fondo_idx on public.fondo_fuentes (fondo_id);

create trigger set_updated_at before update on public.fondo_fuentes
  for each row execute function public.set_updated_at();

create policy fondo_fuentes_select_miembro
  on public.fondo_fuentes for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy fondo_fuentes_insert_agent
  on public.fondo_fuentes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy fondo_fuentes_update_agent
  on public.fondo_fuentes for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_fondo_fuente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.fondos f where f.id = new.fondo_id and f.tenant_id = new.tenant_id
  ) then
    raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
      new.fondo_id, new.tenant_id;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.tipo_id
       and lt.tipo = 'TIPO_FUENTE_ALIMENTACION_FONDO'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'TIPO_FUENTE_FONDO_INVALIDO: % no es un TIPO_FUENTE_ALIMENTACION_FONDO '
      'visible para el tenant %', new.tipo_id, new.tenant_id;
  end if;

  if new.autorizacion_id is not null and not exists (
    select 1 from public.fondo_autorizaciones fa
     where fa.id = new.autorizacion_id and fa.fondo_id = new.fondo_id
  ) then
    raise exception 'AUTORIZACION_INVALIDA: % no es una autorización de este fondo',
      new.autorizacion_id;
  end if;

  if new.documento_id is not null and not exists (
    select 1 from public.documentos d
     where d.id = new.documento_id and d.tenant_id = new.tenant_id
  ) then
    raise exception 'DOCUMENTO_INVALIDO: % no pertenece al tenant %',
      new.documento_id, new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_fuente
  before insert or update on public.fondo_fuentes
  for each row execute function public.guard_fondo_fuente();

-- ── 5. Cierre de §4.5: fuente_financiacion gana una relación real con fondos ──
alter table public.fuente_financiacion
  add column fondo_id uuid references public.fondos (id);

comment on column public.fuente_financiacion.fondo_id is
  'Fondo concreto que financia esta línea presupuestal (Modelo §23, cierra §4.5 de '
  'ANALISIS_FONDOS_BLOQUE_A.md). Para tipo_id=fondo_imprevistos el guard lo resuelve solo si '
  'llega nulo (compatibilidad con el payload existente de presupuesto-financiacion, que no lo '
  'envía); para cualquier otro tipo que declare financiarse con un fondo, debe indicarse '
  'explícito — ya no hay "el" fondo único que buscar por naturaleza.';

create index fuente_financiacion_fondo_idx on public.fuente_financiacion (fondo_id)
  where fondo_id is not null;

-- Reproducción de guard_fuente_financiacion (20260929100000) + resolución de
-- fondo_id. El disponible se valida contra fn_fondo_saldo_derivado: todavía
-- no existe fn_fondo_saldos (bloque F, compromisos) — cuando exista, este
-- guard debe pasar a validar contra el DISPONIBLE, no contra el saldo.
create or replace function public.guard_fuente_financiacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado public.presupuesto_estado_t;
  v_saldo_fondo numeric(18, 2);
  v_tipo_familia text;
  v_tipo_tenant uuid;
  v_tipo_codigo text;
  v_cuenta_tenant uuid;
  v_cuenta_naturaleza text;
  v_fondo public.fondos;
begin
  select estado into v_estado
    from public.presupuestos
   where id = new.presupuesto_id;

  if v_estado in ('vigente', 'cerrado') then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', new.presupuesto_id, v_estado;
  end if;

  select tipo, tenant_id, codigo into v_tipo_familia, v_tipo_tenant, v_tipo_codigo
    from public.lista_tipos where id = new.tipo_id;

  if v_tipo_familia is null then
    raise exception 'TIPO_FUENTE_INEXISTENTE: tipo_id % no existe', new.tipo_id;
  end if;

  if v_tipo_familia is distinct from 'TIPO_FUENTE_FINANCIACION' then
    raise exception 'TIPO_FUENTE_INVALIDO: tipo_id % no pertenece a TIPO_FUENTE_FINANCIACION '
      '(es %)', new.tipo_id, v_tipo_familia;
  end if;

  if v_tipo_tenant is not null and v_tipo_tenant <> new.tenant_id then
    raise exception 'TIPO_FUENTE_TENANT_INCONSISTENTE: tipo_id % pertenece a otro tenant',
      new.tipo_id;
  end if;

  if v_tipo_codigo = 'fondo_imprevistos' then
    if new.fondo_id is null then
      -- Compatibilidad hacia atrás (D-36/§56): el payload actual de
      -- presupuesto-financiacion no envía fondo_id para este tipo. Como
      -- imprevistos sigue siendo único por tenant, se resuelve solo.
      select * into v_fondo
        from public.fondos where tenant_id = new.tenant_id and naturaleza = 'imprevistos';

      if v_fondo.id is null then
        raise exception 'FONDO_IMPREVISTOS_NO_EXISTE: el tenant % no tiene fondo de imprevistos '
          'configurado', new.tenant_id;
      end if;

      new.fondo_id := v_fondo.id;
    else
      select * into v_fondo from public.fondos where id = new.fondo_id;

      if v_fondo.id is null or v_fondo.tenant_id <> new.tenant_id then
        raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
          new.fondo_id, new.tenant_id;
      end if;

      if v_fondo.naturaleza <> 'imprevistos' then
        raise exception 'FONDO_NATURALEZA_INVALIDA: fondo_id % no es el fondo de imprevistos '
          'del tenant, pero tipo_id sí lo es', new.fondo_id;
      end if;
    end if;

    v_saldo_fondo := public.fn_fondo_saldo_derivado(new.fondo_id);

    if new.valor_disponible > v_saldo_fondo then
      raise exception 'FONDO_INSUFICIENTE: valor_disponible (%) excede el saldo actual del '
        'fondo de imprevistos (%) — FI-003', new.valor_disponible, v_saldo_fondo;
    end if;
  elsif new.fondo_id is not null then
    -- Cualquier otro tipo (Modelo §23: un fondo de destinación específica
    -- también puede ser fuente presupuestal) — aquí SÍ hace falta indicarlo
    -- explícito, no hay "el" fondo de esa naturaleza que buscar.
    if not exists (
      select 1 from public.fondos f where f.id = new.fondo_id and f.tenant_id = new.tenant_id
    ) then
      raise exception 'FONDO_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant %',
        new.fondo_id, new.tenant_id;
    end if;

    v_saldo_fondo := public.fn_fondo_saldo_derivado(new.fondo_id);

    if new.valor_disponible > v_saldo_fondo then
      raise exception 'FONDO_INSUFICIENTE: valor_disponible (%) excede el saldo actual del '
        'fondo (%) — FI-003', new.valor_disponible, v_saldo_fondo;
    end if;
  end if;

  if new.presupuesto_cuenta_id is not null then
    select tenant_id, naturaleza into v_cuenta_tenant, v_cuenta_naturaleza
      from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id;

    if v_cuenta_tenant is null then
      raise exception 'CUENTA_INEXISTENTE: presupuesto_cuenta_id % no existe',
        new.presupuesto_cuenta_id;
    end if;

    if v_cuenta_tenant <> new.tenant_id then
      raise exception 'CUENTA_TENANT_INCONSISTENTE: presupuesto_cuenta_id % pertenece a otro '
        'tenant', new.presupuesto_cuenta_id;
    end if;

    if v_cuenta_naturaleza <> 'ingreso' then
      raise exception 'CUENTA_NATURALEZA_INVALIDA: presupuesto_cuenta_id % no es una cuenta de '
        'Ingresos', new.presupuesto_cuenta_id;
    end if;
  end if;

  return new;
end;
$$;

-- El guard ahora puede escribir new.fondo_id (resolución automática de
-- imprevistos) — antes solo validaba, por eso antes bastaba con AFTER-like
-- semántica de BEFORE sin reasignar new. Se recrea el trigger BEFORE INSERT
-- existente para que quede explícito que esta función sí modifica new.
drop trigger if exists guard_fuente_financiacion on public.fuente_financiacion;
create trigger guard_fuente_financiacion
  before insert on public.fuente_financiacion
  for each row execute function public.guard_fuente_financiacion();

-- ── 6. fn_registrar_fuente_financiacion gana p_fondo_id opcional ────────
drop function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint, uuid
);

create function public.fn_registrar_fuente_financiacion(
  p_presupuesto_id uuid,
  p_tipo_id bigint,
  p_valor_disponible numeric,
  p_valor_aplicado numeric default 0,
  p_descripcion text default null,
  p_fundamento_normativo_id bigint default null,
  p_presupuesto_cuenta_id uuid default null,
  p_fondo_id uuid default null
)
returns public.fuente_financiacion
language plpgsql
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_fuente public.fuente_financiacion;
begin
  select tenant_id into v_tenant_id
    from public.presupuestos
   where id = p_presupuesto_id;

  if v_tenant_id is null then
    raise exception 'PRESUPUESTO_NO_ENCONTRADO: % no existe o no es accesible', p_presupuesto_id;
  end if;

  insert into public.fuente_financiacion (
    tenant_id, presupuesto_id, tipo_id, valor_disponible, valor_aplicado,
    descripcion, fundamento_normativo_id, presupuesto_cuenta_id, fondo_id
  )
  values (
    v_tenant_id, p_presupuesto_id, p_tipo_id, p_valor_disponible, p_valor_aplicado,
    p_descripcion, p_fundamento_normativo_id, p_presupuesto_cuenta_id, p_fondo_id
  )
  returning * into v_fuente;

  return v_fuente;
end;
$$;

comment on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint, uuid, uuid
) is
  'Registra una fuente de financiación presupuestal. p_fondo_id es opcional: para '
  'tipo_id=fondo_imprevistos el guard lo resuelve solo si se omite; para cualquier otro tipo que '
  'declare financiarse con un fondo de destinación específica (Modelo §23), debe indicarse '
  'explícito.';

revoke execute on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint, uuid, uuid
) from public, anon;

grant execute on function public.fn_registrar_fuente_financiacion(
  uuid, bigint, numeric, numeric, text, bigint, uuid, uuid
) to authenticated;
