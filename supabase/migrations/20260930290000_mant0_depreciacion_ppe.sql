-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Registro de activos, ficha contable y depreciación (2/2)
--  §4.4 (motor de depreciación), §4.6 (funciones PPE para CO-4/CO-5/CO-6),
--  y la capitalización inicial + el retiro con efecto contable — ninguno
--  de estos dos últimos estaba resuelto por el corte original (ver Plan).
-- ═══════════════════════════════════════════════════════════════════════

-- ── §4.4 Eventos contables nuevos — GASTO_DEPRECIACION/DEPRECIACION_ACUMULADA
--    son gap real (confirmado por BUSCAR EXISTENTE); PERDIDA_RETIRO_ACTIVO y
--    RECONOCIMIENTO_BIEN_DESAFECTADO los agrega esta sesión para el retiro y
--    para el caso raro de un bien no esencial desafectado. ───────────────
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('EVENTO_CONTABLE', 'GASTO_DEPRECIACION', 'Gasto por depreciación',
   'Débito del gasto mensual de depreciación de un activo capitalizado (MANT-0 §4.4)', 200),
  ('EVENTO_CONTABLE', 'DEPRECIACION_ACUMULADA', 'Depreciación acumulada',
   'Crédito a la cuenta correctora de PP&E (1592) — MANT-0 §4.4', 210),
  ('EVENTO_CONTABLE', 'PERDIDA_RETIRO_ACTIVO', 'Pérdida en retiro de activos',
   'Valor neto en libros de un activo dado de baja sin contraprestación (MANT-0 §4.3)', 220),
  ('EVENTO_CONTABLE', 'RECONOCIMIENTO_BIEN_DESAFECTADO', 'Reconocimiento de bien desafectado',
   'Contrapartida patrimonial del reconocimiento inicial de un bien común no esencial '
   'desafectado (Ley 675 art. 20, CTCP 243/2025) — caso raro, sin cuenta por defecto: el '
   'tenant la mapea solo si alguna vez le aplica.', 230);

-- fn_instanciar_cuentas_default gana los dos pares con default sensato (GASTO_DEPRECIACION/
-- DEPRECIACION_ACUMULADA ya tienen cuenta obvia y sin ambigüedad en el PUC vigente: 5905/1592).
-- RECONOCIMIENTO_BIEN_DESAFECTADO y PERDIDA_RETIRO_ACTIVO NO se autoseeded — no hay una cuenta
-- "obvia" para la primera (gap real, ver Plan) y la segunda sí tiene default (5890).
create or replace function public.fn_instanciar_cuentas_default(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creadas integer := 0;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  insert into public.contable_cuenta_default (tenant_id, evento_id, contable_cuenta_id)
  select p_tenant_id, lt.id, cc.id
  from (values
    ('CARTERA_CUOTA_ORDINARIA','1305'),      ('CARTERA_CUOTA_EXTRAORDINARIA','1310'),
    ('CARTERA_FONDO_IMPREVISTOS','1315'),    ('CARTERA_INTERES_MORA','1320'),
    ('CARTERA_MULTA','1325'),                ('CARTERA_OTROS','1330'),
    ('INGRESO_CUOTA_ORDINARIA','4105'),      ('INGRESO_CUOTA_EXTRAORDINARIA','4110'),
    ('INGRESO_FONDO_IMPREVISTOS','4115'),    ('INGRESO_INTERES_MORA','4205'),
    ('INGRESO_MULTA','4505'),                ('BANCO_RECAUDO','111005'),
    ('CAJA_GENERAL','110505'),               ('PROVEEDOR_BIENES','2205'),
    ('PROVEEDOR_SERVICIOS','2210'),          ('FONDO_IMPREVISTOS_EFECTIVO','111015'),
    ('DETERIORO_CARTERA','1399'),            ('GASTO_DETERIORO_CARTERA','5915'),
    ('RESULTADO_EJERCICIO','3310'),          ('ANTICIPO_COPROPIETARIO','2605'),
    ('RENDIMIENTO_FINANCIERO_FONDO','4605'),
    ('GASTO_DEPRECIACION','5905'),           ('DEPRECIACION_ACUMULADA','1592'),
    ('PERDIDA_RETIRO_ACTIVO','5890')
  ) as m(evento, codigo_contable)
  join public.lista_tipos lt
    on lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = m.evento
   and lt.tenant_id is null and lt.activo
  join public.contable_cuenta cc
    on cc.tenant_id = p_tenant_id and cc.codigo = m.codigo_contable
   and cc.permite_movimiento and cc.activa
  on conflict (tenant_id, evento_id) do nothing;

  get diagnostics v_creadas = row_count;

  select count(*) into v_total
  from public.contable_cuenta_default where tenant_id = p_tenant_id;

  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_cuentas_default(uuid) is
  'Siembra el mapa evento contable -> cuenta (contable_cuenta_default, PC-3) de una '
  'copropiedad con las cuentas canónicas del PUC PH. Idempotente: ON CONFLICT DO NOTHING por '
  '(tenant_id, evento_id). MANT-0 agrega GASTO_DEPRECIACION->5905, '
  'DEPRECIACION_ACUMULADA->1592 y PERDIDA_RETIRO_ACTIVO->5890 (defaults sin ambigüedad en el '
  'PUC vigente); RECONOCIMIENTO_BIEN_DESAFECTADO se deja sin sembrar a propósito — no hay '
  'cuenta canónica para un caso que requiere, primero, un acto jurídico de desafectación que '
  'este corte no modela.';

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_cuentas_default(v_tenant);
  end loop;
end $$;

-- ── guard_contable_cuenta_default gana los cuatro eventos nuevos ────────
create or replace function public.guard_contable_cuenta_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_evento_tenant uuid;
  v_evento_codigo text;
  v_cuenta public.contable_cuenta%rowtype;
  v_clase_esperada smallint;
  v_grupo11_esperado boolean := false;
  v_requiere_fondo_esperado boolean := false;
begin
  select tipo, tenant_id, codigo into v_familia, v_evento_tenant, v_evento_codigo
  from public.lista_tipos where id = new.evento_id;

  if v_familia is distinct from 'EVENTO_CONTABLE' then
    raise exception 'EVENTO_CONTABLE_INVALIDO: evento_id % no pertenece a EVENTO_CONTABLE (es %)',
      new.evento_id, coalesce(v_familia, 'inexistente');
  end if;

  if v_evento_tenant is not null and v_evento_tenant <> new.tenant_id then
    raise exception 'EVENTO_CONTABLE_INVALIDO: el evento % pertenece a otro tenant',
      new.evento_id;
  end if;

  v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

  v_clase_esperada := case
    when v_evento_codigo like 'CARTERA_%'                        then 1
    when v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL',
                              'FONDO_IMPREVISTOS_EFECTIVO')       then 1
    when v_evento_codigo = 'DETERIORO_CARTERA'                   then 1
    when v_evento_codigo = 'DEPRECIACION_ACUMULADA'              then 1
    when v_evento_codigo like 'PROVEEDOR_%'                      then 2
    when v_evento_codigo = 'RESULTADO_EJERCICIO'                 then 3
    when v_evento_codigo = 'RECONOCIMIENTO_BIEN_DESAFECTADO'     then 3
    when v_evento_codigo like 'INGRESO_%'                        then 4
    when v_evento_codigo = 'RENDIMIENTO_FINANCIERO_FONDO'        then 4
    when v_evento_codigo = 'GASTO_DETERIORO_CARTERA'             then 5
    when v_evento_codigo = 'GASTO_DEPRECIACION'                  then 5
    when v_evento_codigo = 'PERDIDA_RETIRO_ACTIVO'               then 5
  end;

  if v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL', 'FONDO_IMPREVISTOS_EFECTIVO') then
    v_grupo11_esperado := true;
  end if;

  if v_evento_codigo in ('CARTERA_FONDO_IMPREVISTOS', 'INGRESO_FONDO_IMPREVISTOS',
                          'FONDO_IMPREVISTOS_EFECTIVO', 'RENDIMIENTO_FINANCIERO_FONDO') then
    v_requiere_fondo_esperado := true;
  end if;

  if v_clase_esperada is not null and v_cuenta.clase <> v_clase_esperada then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es clase % — el evento % espera '
      'una cuenta de clase %', v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase, v_evento_codigo,
      v_clase_esperada;
  end if;

  if v_grupo11_esperado and left(v_cuenta.codigo, 2) <> '11' then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) no es efectivo (grupo 11) — el '
      'evento % exige una cuenta de caja o bancos', v_cuenta.codigo, v_cuenta.nombre,
      v_evento_codigo;
  end if;

  if v_requiere_fondo_esperado and not v_cuenta.requiere_fondo then
    raise exception 'CUENTA_SIN_DIMENSION_FONDO: % (%) no tiene requiere_fondo activo — el '
      'evento % es propio del dominio Fondos y su cuenta debe llevar esa dimensión (GAP-22)',
      v_cuenta.codigo, v_cuenta.nombre, v_evento_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_cuenta_default() is
  'Cuentas predeterminadas por evento (PC-3), con coherencia de clase (PC-9) y de dimensión '
  'fondo (GAP-22). MANT-0 agrega la coherencia de clase de sus cuatro eventos nuevos.';

-- ── presupuesto_ejecucion gana activo_id (APENDICE_MANT.md principio #4:
--    "los costos viven en presupuesto_ejecucion... con activo_id") ───────
alter table public.presupuesto_ejecucion
  add column activo_id uuid references public.activos (id);

create index presupuesto_ejecucion_activo_idx on public.presupuesto_ejecucion (activo_id)
  where activo_id is not null;

comment on column public.presupuesto_ejecucion.activo_id is
  'MANT-0 (APENDICE_MANT.md principio #4): a qué activo corresponde este gasto, si alguno. '
  'fn_mant_capitalizar_activo lo usa para reclasificar el pago ya hecho, de gasto a activo.';

create or replace function public.guard_presupuesto_ejecucion_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.activo_id is not null and not exists (
    select 1 from public.activos where id = new.activo_id and tenant_id = new.tenant_id
  ) then
    raise exception 'ACTIVO_INVALIDO: % no pertenece al tenant %', new.activo_id, new.tenant_id;
  end if;
  return new;
end;
$$;

comment on function public.guard_presupuesto_ejecucion_activo() is
  'MANT-0: activo_id (si viene) debe pertenecer al mismo tenant — mismo patrón que '
  'DOCUMENTO_INVALIDO/TERCERO_INVALIDO en otros guards.';

create trigger presupuesto_ejecucion_guard_activo
  before insert or update on public.presupuesto_ejecucion
  for each row execute function public.guard_presupuesto_ejecucion_activo();

-- ── §4.2/hallazgo de esta sesión: capitalizar SIEMPRE pasa por esta función,
--    nunca por un UPDATE directo de `capitalizado` — necesaria para: (a)
--    bloquear un bien esencial pase lo que pase, y (b) generar el
--    comprobante de reconocimiento inicial atómicamente con el flag. ────
create table public.mant_depreciacion_detalle (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  activo_id         uuid not null references public.activos (id) on delete cascade,
  periodo_id        uuid not null references public.periodos (id),
  comprobante_id    uuid not null references public.contable_comprobante (id),
  base_depreciable  numeric(18, 2) not null,
  meses_transcurridos integer not null,
  acumulada_previa  numeric(18, 2) not null,
  cuota_periodo     numeric(18, 2) not null,
  acumulada_nueva   numeric(18, 2) not null,
  created_at        timestamptz not null default now(),

  constraint mant_depreciacion_detalle_unico unique (activo_id, periodo_id)
);

alter table public.mant_depreciacion_detalle enable row level security;
alter table public.mant_depreciacion_detalle force row level security;

create index mant_depreciacion_detalle_tenant_idx on public.mant_depreciacion_detalle (tenant_id);
create index mant_depreciacion_detalle_activo_idx on public.mant_depreciacion_detalle (activo_id);

comment on table public.mant_depreciacion_detalle is
  'Detalle por activo de cada corrida de fn_mant_reconocer_depreciacion (MANT-0 §4.4) — lo que '
  'CO-4/CO-5/CO-6 consumen en vez del saldo global de clase 15. `unique (activo_id, periodo_id)` '
  'es la idempotencia de fondo, adicional al índice de origen de contable_comprobante.';

-- ── mant_calcular_depreciacion — solo lectura, proyección (§4.4) ────────
create function public.mant_calcular_depreciacion(p_tenant_id uuid, p_periodo_id uuid)
returns table (
  activo_id           uuid,
  base_depreciable    numeric,
  meses_transcurridos integer,
  cuota_mensual       numeric,
  acumulada_previa    numeric,
  cuota_periodo       numeric,
  acumulada_nueva     numeric
)
language sql
stable
set search_path = ''
as $$
  with periodo as (
    select (make_date(p.anio, p.mes, 1) + interval '1 month' - interval '1 day')::date as fin
    from public.periodos p
    where p.id = p_periodo_id and p.tenant_id = p_tenant_id
  ),
  base as (
    select
      a.id,
      (a.valor_adquisicion - a.valor_residual) as base_depreciable,
      a.vida_util_meses,
      greatest(0, least(
        a.vida_util_meses,
        ((extract(year from periodo.fin) - extract(year from a.fecha_inicio_depreciacion)) * 12
          + (extract(month from periodo.fin) - extract(month from a.fecha_inicio_depreciacion))
          + 1)::integer
      )) as meses_transcurridos
    from public.activos a
    cross join periodo
    where a.tenant_id = p_tenant_id
      and a.capitalizado
      and a.estado <> 'retirado'
      and a.metodo_depreciacion = 'linea_recta'
      and a.fecha_inicio_depreciacion is not null
      and a.fecha_inicio_depreciacion <= periodo.fin
  )
  select
    b.id,
    b.base_depreciable,
    b.meses_transcurridos,
    round(b.base_depreciable / b.vida_util_meses, 2) as cuota_mensual,
    least(b.base_depreciable, round(b.base_depreciable / b.vida_util_meses, 2) * greatest(0, b.meses_transcurridos - 1)) as acumulada_previa,
    least(
      round(b.base_depreciable / b.vida_util_meses, 2),
      b.base_depreciable - least(b.base_depreciable, round(b.base_depreciable / b.vida_util_meses, 2) * greatest(0, b.meses_transcurridos - 1))
    ) as cuota_periodo,
    least(b.base_depreciable, round(b.base_depreciable / b.vida_util_meses, 2) * b.meses_transcurridos) as acumulada_nueva
  from base b;
$$;

comment on function public.mant_calcular_depreciacion(uuid, uuid) is
  'Proyección de solo lectura (MANT-0 §4.4): por activo capitalizado con método línea recta, '
  'base depreciable, meses transcurridos desde fecha_inicio_depreciacion (inclusive), cuota '
  'mensual, acumulada antes de este periodo, cuota de este periodo (ajustada para nunca superar '
  'la base depreciable — la última cuota se recorta sola) y la acumulada resultante.';

-- ── fn_mant_capitalizar_activo — la única vía para capitalizado = true ──
create function public.fn_mant_capitalizar_activo(
  p_tenant_id uuid, p_activo_id uuid, p_periodo_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo public.activos%rowtype;
  v_periodo public.periodos%rowtype;
  v_pagado numeric(18,2);
  v_comp_id uuid;
  v_linea smallint := 1;
  v_fuente record;
  v_tipo_reclasificacion bigint;
  v_tipo_causacion bigint;
  v_cuenta_patrimonio uuid;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para capitalizar';
  end if;

  select * into v_activo from public.activos where id = p_activo_id and tenant_id = p_tenant_id;
  if v_activo.id is null then
    raise exception 'ACTIVO_INVALIDO: % no existe o no pertenece al tenant', p_activo_id;
  end if;
  if v_activo.capitalizado then
    raise exception 'ACTIVO_BLOQUE_CONTABLE_INCOMPLETO: % ya está capitalizado', p_activo_id;
  end if;
  if v_activo.naturaleza_bien = 'bien_comun_esencial' then
    raise exception 'ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE: % es un bien común esencial (Ley '
      '675 art. 20) — nunca puede capitalizarse', p_activo_id;
  end if;
  if v_activo.valor_adquisicion is null or v_activo.fecha_adquisicion is null
     or v_activo.contable_cuenta_id is null or v_activo.vida_util_meses is null then
    raise exception 'ACTIVO_BLOQUE_CONTABLE_INCOMPLETO: capitalizar exige valor_adquisicion, '
      'fecha_adquisicion, contable_cuenta_id y vida_util_meses';
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  select id into v_tipo_reclasificacion from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'RECLASIFICACION' and tenant_id is null;
  select id into v_tipo_causacion from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'CAUSACION' and tenant_id is null;

  select coalesce(sum(pe.monto), 0) into v_pagado
  from public.presupuesto_ejecucion pe where pe.activo_id = p_activo_id;

  if v_pagado > 0 then
    -- Camino reclasificación: el gasto ya se pagó por la vía normal (presupuesto_ejecucion),
    -- ahora se mueve de gasto a activo. Debe coincidir exactamente con valor_adquisicion —
    -- si no, algo está mal capturado y es preferible abortar a inventar un ajuste.
    if v_pagado <> v_activo.valor_adquisicion then
      raise exception 'ACTIVO_VALOR_ADQUISICION_NO_CONCILIA: presupuesto_ejecucion vinculada '
        'suma % pero valor_adquisicion es % — revisa la captura', v_pagado, v_activo.valor_adquisicion;
    end if;

    insert into public.contable_comprobante (
      tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
      origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
    ) values (
      p_tenant_id, p_periodo_id, v_tipo_reclasificacion, v_periodo.anio, v_activo.fecha_adquisicion,
      'Capitalización de ' || v_activo.nombre, 'mantenimiento', 'activos', p_activo_id,
      'capitalizacion', (select auth.uid())
    )
    returning id into v_comp_id;

    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
      origen_entidad, origen_id
    ) values (
      p_tenant_id, v_comp_id, v_linea, v_activo.contable_cuenta_id, v_activo.valor_adquisicion, 0,
      'Capitalización ' || v_activo.nombre, 'activos', p_activo_id
    );
    v_linea := v_linea + 1;

    for v_fuente in
      select pe.cuenta_id as presupuesto_cuenta_id, pc.contable_cuenta_id, sum(pe.monto) as monto
      from public.presupuesto_ejecucion pe
      join public.presupuesto_cuenta pc on pc.id = pe.cuenta_id
      where pe.activo_id = p_activo_id
      group by pe.cuenta_id, pc.contable_cuenta_id
    loop
      if v_fuente.contable_cuenta_id is null then
        raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: la cuenta presupuestal % no tiene '
          'cuenta contable vinculada', v_fuente.presupuesto_cuenta_id;
      end if;
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        origen_entidad, origen_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_fuente.contable_cuenta_id, 0, v_fuente.monto,
        'Reclasificación desde gasto — ' || v_activo.nombre, 'activos', p_activo_id
      );
      v_linea := v_linea + 1;
    end loop;
  else
    -- Camino causación directa: no hay presupuesto_ejecucion vinculada (típico de un bien
    -- desafectado, que no se "compra" — nace de un acto jurídico de asamblea). Requiere que el
    -- tenant ya haya mapeado RECONOCIMIENTO_BIEN_DESAFECTADO — no se inventa una cuenta.
    select cd.contable_cuenta_id into v_cuenta_patrimonio
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE'
      and lt.codigo = 'RECONOCIMIENTO_BIEN_DESAFECTADO';
    if v_cuenta_patrimonio is null then
      raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: RECONOCIMIENTO_BIEN_DESAFECTADO no '
        'tiene cuenta contable predeterminada para este tenant';
    end if;

    insert into public.contable_comprobante (
      tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
      origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
    ) values (
      p_tenant_id, p_periodo_id, v_tipo_causacion, v_periodo.anio, v_activo.fecha_adquisicion,
      'Reconocimiento de ' || v_activo.nombre, 'mantenimiento', 'activos', p_activo_id,
      'capitalizacion', (select auth.uid())
    )
    returning id into v_comp_id;

    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
      origen_entidad, origen_id
    ) values
      (p_tenant_id, v_comp_id, 1, v_activo.contable_cuenta_id, v_activo.valor_adquisicion, 0,
       'Reconocimiento inicial ' || v_activo.nombre, 'activos', p_activo_id),
      (p_tenant_id, v_comp_id, 2, v_cuenta_patrimonio, 0, v_activo.valor_adquisicion,
       'Reconocimiento inicial ' || v_activo.nombre, 'activos', p_activo_id);
  end if;

  perform public.fn_contabilizar_comprobante(v_comp_id);

  update public.activos
    set capitalizado = true,
        fecha_inicio_depreciacion = coalesce(fecha_inicio_depreciacion, v_activo.fecha_adquisicion)
    where id = p_activo_id;

  return v_comp_id;
end;
$$;

comment on function public.fn_mant_capitalizar_activo(uuid, uuid, uuid) is
  'MANT-0: única vía para llevar un activo a capitalizado = true — nunca un UPDATE directo. '
  'Si hay presupuesto_ejecucion.activo_id vinculada (bien comprado), reclasifica ese gasto ya '
  'pagado al activo (RECLASIFICACION); si no (bien desafectado, caso raro), causa el '
  'reconocimiento inicial contra RECONOCIMIENTO_BIEN_DESAFECTADO (CAUSACION), sin cuenta por '
  'defecto. Bloquea ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE sin excepción — hallazgo de esta '
  'sesión (Ley 675 art. 20, CTCP 243/2025). SECURITY DEFINER con verificación interna de '
  'has_role, igual que fn_contabilizar_periodo (CO-3).';

-- ── fn_mant_reconocer_depreciacion — un comprobante por periodo (§4.4) ──
create function public.fn_mant_reconocer_depreciacion(p_tenant_id uuid, p_periodo_id uuid)
returns table (categoria text, activo_id uuid, comprobante_id uuid, detalle text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo public.periodos%rowtype;
  v_tipo_id bigint;
  v_evento_gasto uuid;
  v_evento_acumulada uuid;
  v_existente uuid;
  v_comp_id uuid;
  v_alguna boolean := false;
  v_linea smallint := 1;
  v_row record;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para reconocer depreciación';
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  select id into v_tipo_id from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'DEPRECIACION' and tenant_id is null;

  select cd.contable_cuenta_id into v_evento_gasto
  from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'GASTO_DEPRECIACION';
  select cd.contable_cuenta_id into v_evento_acumulada
  from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'DEPRECIACION_ACUMULADA';
  if v_evento_gasto is null or v_evento_acumulada is null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: GASTO_DEPRECIACION/DEPRECIACION_ACUMULADA '
      'sin cuenta contable predeterminada para este tenant';
  end if;

  select id into v_existente from public.contable_comprobante
  where tenant_id = p_tenant_id and origen_modulo = 'mantenimiento' and origen_entidad = 'activos'
    and origen_id = p_periodo_id and origen_evento = 'depreciacion_periodo';
  if v_existente is not null then
    return query
      select 'omitido'::text, a.id, v_existente, null::text
      from public.activos a
      where a.tenant_id = p_tenant_id and a.capitalizado and a.estado <> 'retirado';
    return;
  end if;

  for v_row in select * from public.mant_calcular_depreciacion(p_tenant_id, p_periodo_id) where cuota_periodo > 0
  loop
    begin
      if (select centro_costo_id from public.activos where id = v_row.activo_id) is null then
        return query select 'omitido'::text, v_row.activo_id, null::uuid,
          'sin centro_costo_id — la cuenta de gasto de depreciación lo exige (COMPROBANTE_DIMENSION_REQUERIDA)';
        continue;
      end if;

      if not v_alguna then
        insert into public.contable_comprobante (
          tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
          origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
        ) values (
          p_tenant_id, p_periodo_id, v_tipo_id, v_periodo.anio,
          (make_date(v_periodo.anio, v_periodo.mes, 1) + interval '1 month' - interval '1 day')::date,
          'Depreciación — periodo ' || v_periodo.anio || '-' || lpad(v_periodo.mes::text, 2, '0'),
          'mantenimiento', 'activos', p_periodo_id, 'depreciacion_periodo', (select auth.uid())
        )
        returning id into v_comp_id;
        v_alguna := true;
      end if;

      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        centro_costo_id, origen_entidad, origen_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_evento_gasto, v_row.cuota_periodo, 0,
        'Depreciación del periodo',
        (select centro_costo_id from public.activos where id = v_row.activo_id),
        'activos', v_row.activo_id
      );
      v_linea := v_linea + 1;

      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        origen_entidad, origen_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_evento_acumulada, 0, v_row.cuota_periodo,
        'Depreciación del periodo', 'activos', v_row.activo_id
      );
      v_linea := v_linea + 1;

      insert into public.mant_depreciacion_detalle (
        tenant_id, activo_id, periodo_id, comprobante_id, base_depreciable,
        meses_transcurridos, acumulada_previa, cuota_periodo, acumulada_nueva
      ) values (
        p_tenant_id, v_row.activo_id, p_periodo_id, v_comp_id, v_row.base_depreciable,
        v_row.meses_transcurridos, v_row.acumulada_previa, v_row.cuota_periodo, v_row.acumulada_nueva
      );

      return query select 'creado'::text, v_row.activo_id, v_comp_id, null::text;
    exception when others then
      return query select 'fallido'::text, v_row.activo_id, null::uuid, sqlerrm;
    end;
  end loop;

  if v_alguna then
    perform public.fn_contabilizar_comprobante(v_comp_id);
  end if;
end;
$$;

comment on function public.fn_mant_reconocer_depreciacion(uuid, uuid) is
  'MANT-0 §4.4: un solo comprobante DEPRECIACION por periodo (origen_id = periodo_id, mismo '
  'patrón de lote que fn_contabilizar_periodo/CO-3), con una línea débito/crédito por activo '
  '(centro_costo_id del activo en la línea de gasto, porque 5905 lo exige). Idempotente por '
  'periodo — reintentarlo devuelve todo como ''omitido''. Un activo sin centro_costo_id se '
  'reporta ''omitido'' sin abortar el resto; cualquier otro fallo por activo se aísla en su '
  'propio bloque BEGIN/EXCEPTION (savepoint implícito), igual que CO-3.';

-- ── fn_mant_dar_baja_activo — retiro con efecto contable (§4.3) ─────────
create function public.fn_mant_dar_baja_activo(
  p_tenant_id uuid, p_activo_id uuid, p_periodo_id uuid, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo public.activos%rowtype;
  v_periodo public.periodos%rowtype;
  v_acumulada numeric(18,2);
  v_perdida numeric(18,2);
  v_cuenta_acumulada uuid;
  v_cuenta_perdida uuid;
  v_tipo_id bigint;
  v_comp_id uuid;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para dar de baja un activo';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'ACTIVO_MOTIVO_REQUERIDO: el retiro exige un motivo';
  end if;

  select * into v_activo from public.activos where id = p_activo_id and tenant_id = p_tenant_id;
  if v_activo.id is null then
    raise exception 'ACTIVO_INVALIDO: % no existe o no pertenece al tenant', p_activo_id;
  end if;

  update public.activos set estado = 'retirado', fecha_retiro = current_date where id = p_activo_id;

  insert into public.activo_estado_historial (tenant_id, activo_id, estado_anterior, estado_nuevo, motivo, registrado_por)
  select p_tenant_id, p_activo_id, v_activo.estado, 'retirado', p_motivo, (select auth.uid())
  where v_activo.estado is distinct from 'retirado';

  if not v_activo.capitalizado then
    return null;
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  select coalesce(sum(d.cuota_periodo), 0) into v_acumulada
  from public.mant_depreciacion_detalle d where d.activo_id = p_activo_id;
  v_perdida := v_activo.valor_adquisicion - v_acumulada;

  select cd.contable_cuenta_id into v_cuenta_acumulada
  from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'DEPRECIACION_ACUMULADA';
  select cd.contable_cuenta_id into v_cuenta_perdida
  from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'PERDIDA_RETIRO_ACTIVO';
  if v_cuenta_acumulada is null or v_cuenta_perdida is null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: DEPRECIACION_ACUMULADA/PERDIDA_RETIRO_ACTIVO '
      'sin cuenta contable predeterminada para este tenant';
  end if;

  select id into v_tipo_id from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'AJUSTE' and tenant_id is null;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
  ) values (
    p_tenant_id, p_periodo_id, v_tipo_id, v_periodo.anio, current_date,
    'Baja de ' || v_activo.nombre || ' — ' || p_motivo,
    'mantenimiento', 'activos', p_activo_id, 'baja', (select auth.uid())
  )
  returning id into v_comp_id;

  insert into public.contable_comprobante_detalle (
    tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion, origen_entidad, origen_id
  ) values
    (p_tenant_id, v_comp_id, 1, v_cuenta_acumulada, v_acumulada, 0, 'Baja — depreciación acumulada', 'activos', p_activo_id),
    (p_tenant_id, v_comp_id, 2, v_cuenta_perdida, greatest(v_perdida, 0), 0, 'Baja — pérdida en retiro', 'activos', p_activo_id),
    (p_tenant_id, v_comp_id, 3, v_activo.contable_cuenta_id, 0, v_activo.valor_adquisicion, 'Baja — costo original', 'activos', p_activo_id);

  perform public.fn_contabilizar_comprobante(v_comp_id);
  return v_comp_id;
end;
$$;

comment on function public.fn_mant_dar_baja_activo(uuid, uuid, uuid, text) is
  'MANT-0 §4.3: retira el activo (transición de estado + historial) y, si estaba capitalizado, '
  'genera el comprobante de baja: acumulada a la fecha contra 1592, el neto en libros contra '
  'PERDIDA_RETIRO_ACTIVO (5890 por defecto — este corte no modela un precio de venta), y el '
  'costo original sale de la cuenta clase 15. Si no estaba capitalizado, el retiro es solo '
  'cambio de estado, sin comprobante (retorna NULL).';

-- ── §4.6 Funciones PPE — el contrato con CO-4/CO-5/CO-6 ─────────────────
create function public.mant_ppe_por_activo(p_tenant_id uuid, p_fecha_corte date)
returns table (
  activo_id uuid, cuenta_codigo text, categoria_codigo text,
  valor_adquisicion numeric, depreciacion_acumulada numeric, valor_neto numeric
)
language sql
stable
set search_path = ''
as $$
  select
    a.id, cc.codigo, cat.codigo, a.valor_adquisicion,
    coalesce((
      select sum(d.cuota_periodo) from public.mant_depreciacion_detalle d
      join public.periodos p on p.id = d.periodo_id
      where d.activo_id = a.id
        and (make_date(p.anio, p.mes, 1) + interval '1 month' - interval '1 day')::date <= p_fecha_corte
    ), 0) as depreciacion_acumulada,
    a.valor_adquisicion - coalesce((
      select sum(d.cuota_periodo) from public.mant_depreciacion_detalle d
      join public.periodos p on p.id = d.periodo_id
      where d.activo_id = a.id
        and (make_date(p.anio, p.mes, 1) + interval '1 month' - interval '1 day')::date <= p_fecha_corte
    ), 0) as valor_neto
  from public.activos a
  join public.contable_cuenta cc on cc.id = a.contable_cuenta_id
  join public.lista_tipos cat on cat.id = a.categoria_id
  where a.tenant_id = p_tenant_id and a.capitalizado
    and a.fecha_adquisicion <= p_fecha_corte;
$$;

comment on function public.mant_ppe_por_activo(uuid, date) is
  'MANT-0 §4.6, para el Libro de Inventarios y Balances (CO-4 §3.4): por activo capitalizado a '
  'la fecha de corte, valor de adquisición, depreciación acumulada real y valor neto — deja de '
  'usarse el saldo global con nota.';

create function public.mant_ppe_movimiento_ejercicio(p_tenant_id uuid, p_anio integer)
returns table (
  categoria_codigo text, saldo_inicial numeric, adiciones numeric,
  retiros numeric, depreciacion_ejercicio numeric, saldo_final numeric
)
language sql
stable
set search_path = ''
as $$
  with fin_anterior as (select make_date(p_anio - 1, 12, 31) as fecha),
  fin_ejercicio as (select make_date(p_anio, 12, 31) as fecha),
  saldos_iniciales as (
    select cat.codigo, sum(ppe.valor_neto) as saldo
    from public.activos a
    join public.lista_tipos cat on cat.id = a.categoria_id
    cross join fin_anterior
    cross join lateral public.mant_ppe_por_activo(p_tenant_id, fin_anterior.fecha) ppe
    where a.id = ppe.activo_id and a.tenant_id = p_tenant_id
    group by cat.codigo
  ),
  saldos_finales as (
    select cat.codigo, sum(ppe.valor_neto) as saldo
    from public.activos a
    join public.lista_tipos cat on cat.id = a.categoria_id
    cross join fin_ejercicio
    cross join lateral public.mant_ppe_por_activo(p_tenant_id, fin_ejercicio.fecha) ppe
    where a.id = ppe.activo_id and a.tenant_id = p_tenant_id
    group by cat.codigo
  ),
  adiciones as (
    select cat.codigo, sum(a.valor_adquisicion) as monto
    from public.activos a join public.lista_tipos cat on cat.id = a.categoria_id
    where a.tenant_id = p_tenant_id and a.capitalizado
      and extract(year from a.fecha_adquisicion) = p_anio
    group by cat.codigo
  ),
  retiros as (
    select cat.codigo, sum(a.valor_adquisicion) as monto
    from public.activos a join public.lista_tipos cat on cat.id = a.categoria_id
    where a.tenant_id = p_tenant_id and a.estado = 'retirado'
      and extract(year from a.fecha_retiro) = p_anio
    group by cat.codigo
  ),
  depreciacion as (
    select cat.codigo, sum(d.cuota_periodo) as monto
    from public.mant_depreciacion_detalle d
    join public.activos a on a.id = d.activo_id
    join public.lista_tipos cat on cat.id = a.categoria_id
    join public.periodos p on p.id = d.periodo_id
    where d.tenant_id = p_tenant_id and p.anio = p_anio
    group by cat.codigo
  ),
  categorias as (
    select codigo from saldos_iniciales union select codigo from saldos_finales
    union select codigo from adiciones union select codigo from retiros union select codigo from depreciacion
  )
  select
    c.codigo,
    coalesce(si.saldo, 0), coalesce(ad.monto, 0), coalesce(re.monto, 0), coalesce(dep.monto, 0),
    coalesce(sf.saldo, 0)
  from categorias c
  left join saldos_iniciales si on si.codigo = c.codigo
  left join saldos_finales sf on sf.codigo = c.codigo
  left join adiciones ad on ad.codigo = c.codigo
  left join retiros re on re.codigo = c.codigo
  left join depreciacion dep on dep.codigo = c.codigo;
$$;

comment on function public.mant_ppe_movimiento_ejercicio(uuid, integer) is
  'MANT-0 §4.6, para la nota 7 de PP&E (CO-5): por categoría de activo, saldo inicial (neto a '
  '31/dic del año anterior), adiciones (capitalizado durante el año), retiros (dado de baja '
  'durante el año, a su valor de adquisición), depreciación del ejercicio, y saldo final.';

create function public.mant_ppe_pendiente_depreciacion(p_tenant_id uuid, p_periodo_id uuid)
returns table (activo_id uuid, cuota_periodo numeric)
language sql
stable
set search_path = ''
as $$
  select c.activo_id, c.cuota_periodo
  from public.mant_calcular_depreciacion(p_tenant_id, p_periodo_id) c
  where c.cuota_periodo > 0
    and not exists (
      select 1 from public.mant_depreciacion_detalle d
      where d.activo_id = c.activo_id and d.periodo_id = p_periodo_id
    );
$$;

comment on function public.mant_ppe_pendiente_depreciacion(uuid, uuid) is
  'MANT-0 §4.6, para el hallazgo previo al cierre (CO-6): activos capitalizados que deberían '
  'haber depreciado este periodo y no lo hicieron todavía.';

create function public.mant_conciliacion_ppe(p_tenant_id uuid, p_fecha_corte date)
returns table (valor_neto_activos numeric, saldo_contable_clase_15 numeric, diferencia numeric)
language sql
stable
set search_path = ''
as $$
  with por_activo as (
    select coalesce(sum(ppe.valor_neto), 0) as neto
    from public.mant_ppe_por_activo(p_tenant_id, p_fecha_corte) ppe
  ),
  contable as (
    -- Todo clase 15 en un solo total (hojas de costo + 1592 correctora juntas): al sumarlas,
    -- el crédito de 1592 ya resta del débito de las hojas de costo, sin tener que separar
    -- cuál hoja corresponde a cuál activo — el mismo neto que da mant_ppe_por_activo.
    select coalesce(sum(d.debito) - sum(d.credito), 0) as saldo
    from public.contable_comprobante_detalle d
    join public.contable_comprobante c on c.id = d.comprobante_id
    join public.contable_cuenta cc on cc.id = d.cuenta_id
    where c.tenant_id = p_tenant_id and c.estado = 'contabilizado'
      and c.fecha <= p_fecha_corte and cc.clase = 1 and left(cc.codigo, 2) = '15'
  )
  select por_activo.neto, contable.saldo, por_activo.neto - contable.saldo
  from por_activo, contable
  where por_activo.neto - contable.saldo <> 0;
$$;

comment on function public.mant_conciliacion_ppe(uuid, date) is
  'MANT-0 §4.6 — prueba central del corte. Compara el neto agregado de todos los activos '
  '(mant_ppe_por_activo) contra el saldo contable real de TODA la clase 15 junta (hojas de costo '
  'y 1592 correctora en un solo total — sumar débito-crédito ya neta la correctora sin separar '
  'por hoja). Debe devolver cero filas tras reconocer la depreciación de un periodo — mismo '
  'contrato que contable_conciliacion_proyeccion (CO-3).';
