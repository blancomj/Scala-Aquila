-- ═══════════════════════════════════════════════════════════════════════
--  FIN-4 · Flujo de caja proyectado y alertas de liquidez (6/8)
--
--  finanzas_tasa_recaudo_historica(): única fuente de la tasa de recaudo —
--  no existía ninguna función así en el repo (verificado por grep antes de
--  escribir esta). null cuando no hay historial suficiente (denominador 0)
--  — nunca inventa una tasa (§5 prueba 3 del corte).
--
--  finanzas_flujo_proyectado(): los 5 componentes, cada uno leído de una
--  función/tabla existente o calculado sobre datos reales, nunca digitados
--  (§7 criterio de aceptación). 'base' siempre usa la tasa histórica en
--  vivo; 'optimista' siempre 100% sin coeficiente; 'conservador' exige
--  finanzas_escenario_parametros vigente o el componente de ingresos queda
--  datos_insuficientes (ver 20260932570000). egresos_contratos se calcula
--  aquí mismo por periodicidad de mant_contratos — no existe hoy una
--  función que dé la fecha exacta del próximo pago (verificado). egresos_
--  mantenimiento solo toma la fila 'Correctivo esperado' de mant_proyeccion
--  (MANT-9) — las otras 3 filas de esa función (preventivo, contratos,
--  renovaciones) no aplican aquí para no duplicar egresos_contratos.
--
--  saldo_acumulado usa una window function (sum() over) para el acumulado
--  secuencial semana a semana desde saldo_inicial (finanzas_posicion_
--  tesoreria, FIN-1) — nunca se recalcula desde cero fuera de esta función.
-- ═══════════════════════════════════════════════════════════════════════

create function public.finanzas_tasa_recaudo_historica(
  p_tenant_id uuid, p_fecha date default current_date, p_meses integer default 12
)
returns numeric
language sql
stable
set search_path = ''
as $$
  with base as (
    select c.id, c.monto_original,
           coalesce((select sum(pa.monto) from public.pago_aplicaciones pa where pa.cargo_id = c.id), 0)
             as pagado
      from public.cargos c
      join public.periodos per on per.id = c.periodo_id
     where c.tenant_id = p_tenant_id
       and c.origen_tipo = 'liquidacion_linea'
       and coalesce(c.fecha_vencimiento, per.fecha_vencimiento)
             between (p_fecha - (p_meses || ' months')::interval)::date and p_fecha
  )
  select case when sum(monto_original) = 0 or sum(monto_original) is null then null
              else round(100.0 * sum(pagado) / sum(monto_original), 2)
         end
    from base;
$$;

comment on function public.finanzas_tasa_recaudo_historica(uuid, date, integer) is
  'FIN-4 §3.2: % de cargos ordinarios efectivamente pagados sobre los que vencieron en la ventana '
  '(12 meses por defecto). null si no hay cargos ordinarios vencidos en la ventana — nunca inventa '
  'una tasa. Fuente exclusiva del escenario ''base''.';

create function public.finanzas_flujo_proyectado(
  p_tenant_id uuid,
  p_horizonte_dias integer,
  p_escenario public.finanzas_flujo_escenario_t default 'base',
  p_fecha_calculo timestamptz default now()
)
returns table (
  semana                integer,
  ingresos_esperados    numeric(18, 2),
  ingresos_otros        numeric(18, 2),
  egresos_cxp           numeric(18, 2),
  egresos_contratos     numeric(18, 2),
  egresos_mantenimiento numeric(18, 2),
  flujo_neto            numeric(18, 2),
  saldo_acumulado       numeric(18, 2),
  componentes_insuficientes text[]
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha_base       date := p_fecha_calculo::date;
  v_semanas          int := ceil(p_horizonte_dias / 7.0)::int;
  v_pct              numeric;
  v_dias_extra       int := 0;
  v_saldo_inicial    numeric(18, 2);
  v_insuficientes    text[] := '{}';
  v_mant_insuficiente boolean;
begin
  if p_escenario = 'optimista' then
    v_pct := 100;
  elsif p_escenario = 'base' then
    v_pct := public.finanzas_tasa_recaudo_historica(p_tenant_id, v_fecha_base);
  else
    select ep.pct_recaudo_esperado, coalesce(ep.dias_adicionales_pago_proveedor, 0)
      into v_pct, v_dias_extra
      from public.finanzas_escenario_parametros ep
     where ep.tenant_id = p_tenant_id and ep.escenario = 'conservador' and ep.estado = 'vigente';
  end if;

  if v_pct is null then
    v_insuficientes := v_insuficientes || array['ingresos_esperados', 'ingresos_otros'];
  end if;

  select coalesce(sum(fp.monto_disponible), 0) into v_saldo_inicial
    from public.finanzas_posicion_tesoreria(p_tenant_id, p_fecha_calculo) fp
   where fp.utilizable;

  select coalesce(bool_or(coalesce(mp.datos_insuficientes, true)), true) into v_mant_insuficiente
    from generate_series(
           extract(year from v_fecha_base)::int,
           extract(year from v_fecha_base + p_horizonte_dias - 1)::int
         ) as anio
    left join lateral (
      select datos_insuficientes from public.mant_proyeccion(p_tenant_id, anio)
       where componente = 'Correctivo esperado'
    ) mp on true;

  if v_mant_insuficiente then
    v_insuficientes := v_insuficientes || array['egresos_mantenimiento'];
  end if;

  return query
  with semanas as (
    select s as num,
           v_fecha_base + (s - 1) * 7 as desde,
           least(v_fecha_base + s * 7 - 1, v_fecha_base + p_horizonte_dias - 1) as hasta
      from generate_series(1, v_semanas) as s
  ),
  ingresos_ordinarios as (
    select coalesce(c.fecha_vencimiento, per.fecha_vencimiento) as vencimiento,
           greatest(c.monto_original - coalesce(pa.pagado, 0), 0) as pendiente
      from public.cargos c
      join public.periodos per on per.id = c.periodo_id
      left join (
        select cargo_id, sum(monto) as pagado from public.pago_aplicaciones group by cargo_id
      ) pa on pa.cargo_id = c.id
     where c.tenant_id = p_tenant_id and c.origen_tipo = 'liquidacion_linea'
  ),
  ingresos_no_ordinarios as (
    select coalesce(c.fecha_vencimiento, per.fecha_vencimiento) as vencimiento,
           c.monto_original - coalesce(pa.pagado, 0) as pendiente
      from public.cargos c
      join public.periodos per on per.id = c.periodo_id
      left join (
        select cargo_id, sum(monto) as pagado from public.pago_aplicaciones group by cargo_id
      ) pa on pa.cargo_id = c.id
     where c.tenant_id = p_tenant_id and c.origen_tipo in ('novedad', 'interes', 'descuento')
  ),
  cxp as (
    select f.fecha_vencimiento, f.total_neto_pagar, f.contrato_id
      from public.finanzas_facturas_pagables(
             p_tenant_id, v_fecha_base + p_horizonte_dias - 1 + v_dias_extra, false
           ) f
     where f.fecha_vencimiento >= v_fecha_base
       and (
             (f.contrato_id is not null and f.fecha_vencimiento <= v_fecha_base + p_horizonte_dias - 1)
             or (f.contrato_id is null)
           )
  ),
  contratos_ocurrencia as (
    select mc.fecha_inicio as fecha, coalesce(mc.valor_periodico, mc.valor_total, 0) as monto
      from public.mant_contratos mc
      join public.lista_tipos lt on lt.id = mc.periodicidad_id
     where mc.tenant_id = p_tenant_id and mc.estado = 'vigente' and lt.codigo = 'unica'
    union all
    select ocurrencia::date, coalesce(mc.valor_periodico, mc.valor_total, 0)
      from public.mant_contratos mc
      join public.lista_tipos lt on lt.id = mc.periodicidad_id
      cross join lateral generate_series(
        mc.fecha_inicio::timestamptz,
        coalesce(mc.fecha_fin, v_fecha_base + p_horizonte_dias)::timestamptz,
        case lt.codigo
          when 'mensual' then interval '1 month'
          when 'bimestral' then interval '2 months'
          when 'trimestral' then interval '3 months'
          when 'semestral' then interval '6 months'
          when 'anual' then interval '1 year'
        end
      ) as ocurrencia
     where mc.tenant_id = p_tenant_id and mc.estado = 'vigente' and lt.codigo <> 'unica'
  ),
  mant_diario as (
    select d::date as dia, coalesce(mp.monto, 0) / 365.0 as monto_dia
      from generate_series(v_fecha_base, v_fecha_base + p_horizonte_dias - 1, interval '1 day') as d
      left join lateral (
        select monto from public.mant_proyeccion(p_tenant_id, extract(year from d)::int)
         where componente = 'Correctivo esperado'
      ) mp on true
  ),
  base as (
    select
      sem.num as semana,
      round(coalesce((
        select sum(pendiente) from ingresos_ordinarios io where io.vencimiento between sem.desde and sem.hasta
      ), 0) * coalesce(v_pct, 0) / 100.0, 2) as ingresos_esperados,
      round(coalesce((
        select sum(pendiente) from ingresos_no_ordinarios ino where ino.vencimiento between sem.desde and sem.hasta
      ), 0) * coalesce(v_pct, 0) / 100.0, 2) as ingresos_otros,
      round(coalesce((
        -- Proveedores no pactados (contrato_id null) en la última semana miran hasta
        -- v_dias_extra días más allá del horizonte — ver cxp arriba y la cabecera del corte.
        select sum(total_neto_pagar) from cxp
         where cxp.fecha_vencimiento between sem.desde
           and sem.hasta + (case when sem.num = v_semanas then v_dias_extra else 0 end)
      ), 0), 2) as egresos_cxp,
      round(coalesce((
        select sum(monto) from contratos_ocurrencia co where co.fecha between sem.desde and sem.hasta
      ), 0), 2) as egresos_contratos,
      round(coalesce((
        select sum(monto_dia) from mant_diario md where md.dia between sem.desde and sem.hasta
      ), 0), 2) as egresos_mantenimiento
      from semanas sem
  )
  select
    b.semana, b.ingresos_esperados, b.ingresos_otros, b.egresos_cxp, b.egresos_contratos,
    b.egresos_mantenimiento,
    (b.ingresos_esperados + b.ingresos_otros - b.egresos_cxp - b.egresos_contratos - b.egresos_mantenimiento)
      as flujo_neto,
    round(v_saldo_inicial + sum(
      b.ingresos_esperados + b.ingresos_otros - b.egresos_cxp - b.egresos_contratos - b.egresos_mantenimiento
    ) over (order by b.semana), 2) as saldo_acumulado,
    v_insuficientes
  from base b
  order by b.semana;
end;
$$;

comment on function public.finanzas_flujo_proyectado(uuid, integer, public.finanzas_flujo_escenario_t, timestamptz) is
  'FIN-4 §3.2: proyección de flujo de caja por semana. Cada componente viene de una función/tabla '
  'existente (finanzas_posicion_tesoreria, finanzas_facturas_pagables, mant_proyeccion) o de un '
  'cálculo sobre cargos/pago_aplicaciones/mant_contratos reales — ninguno digitado a mano. '
  'componentes_insuficientes marca qué columnas son 0 solo porque falta dato, no porque el valor '
  'real sea cero.';

create function public.finanzas_proyeccion_vs_real(p_snapshot_id uuid, p_hasta date)
returns table (semana integer, flujo_neto_proyectado numeric, flujo_neto_real numeric, desviacion numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_snap record;
begin
  select * into v_snap from public.finanzas_flujo_snapshot where id = p_snapshot_id;
  if v_snap.id is null then
    raise exception 'FINANZAS_SNAPSHOT_INEXISTENTE: % no existe o no es visible', p_snapshot_id;
  end if;

  return query
  with filas as (
    select (f ->> 'semana')::int as num,
           (f ->> 'flujo_neto')::numeric as flujo_proyectado,
           (v_snap.fecha_calculo::date + ((f ->> 'semana')::int - 1) * 7) as desde,
           least(v_snap.fecha_calculo::date + (f ->> 'semana')::int * 7 - 1, p_hasta) as hasta
      from jsonb_array_elements(v_snap.resultado) as f
     where (v_snap.fecha_calculo::date + ((f ->> 'semana')::int - 1) * 7) <= p_hasta
  ),
  con_real as (
    select filas.*,
           round(coalesce((
             select sum(p.monto) from public.pagos p
              where p.tenant_id = v_snap.tenant_id and p.fecha_pago between filas.desde and filas.hasta
           ), 0) - coalesce((
             select sum(pe.monto) from public.presupuesto_ejecucion pe
              where pe.tenant_id = v_snap.tenant_id
                and pe.liquidacion in ('pagado_banco', 'pagado_caja')
                and pe.fecha_documento between filas.desde and filas.hasta
           ), 0), 2) as flujo_real
      from filas
  )
  select num, flujo_proyectado, flujo_real, round(flujo_real - flujo_proyectado, 2)
    from con_real
   order by num;
end;
$$;

comment on function public.finanzas_proyeccion_vs_real(uuid, date) is
  'FIN-4 §3.4: para un snapshot, flujo neto proyectado vs. observado (pagos.fecha_pago - '
  'presupuesto_ejecucion pagado_banco/pagado_caja) semana a semana. Lo que hace que el módulo '
  'mejore con el tiempo — un tenant ve si su escenario fue realista.';

create function public.finanzas_flujo_snapshot_guardar(
  p_tenant_id uuid, p_horizonte_dias integer, p_escenario public.finanzas_flujo_escenario_t, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_resultado jsonb;
  v_saldo_inicial numeric(18, 2);
  v_parametros jsonb;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'UNAUTHENTICATED: se requiere rol auxiliar o superior para guardar un snapshot de flujo';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'FINANZAS_SNAPSHOT_SIN_MOTIVO: el snapshot requiere un motivo';
  end if;

  select coalesce(sum(fp.monto_disponible), 0) into v_saldo_inicial
    from public.finanzas_posicion_tesoreria(p_tenant_id, now()) fp
   where fp.utilizable;

  select jsonb_agg(jsonb_build_object(
           'semana', semana, 'ingresos_esperados', ingresos_esperados, 'ingresos_otros', ingresos_otros,
           'egresos_cxp', egresos_cxp, 'egresos_contratos', egresos_contratos,
           'egresos_mantenimiento', egresos_mantenimiento, 'flujo_neto', flujo_neto,
           'saldo_acumulado', saldo_acumulado, 'componentes_insuficientes', componentes_insuficientes
         ) order by semana)
    into v_resultado
    from public.finanzas_flujo_proyectado(p_tenant_id, p_horizonte_dias, p_escenario, now());

  select jsonb_build_object(
           'escenario_parametros', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'escenario', escenario, 'pct_recaudo_esperado', pct_recaudo_esperado,
                      'dias_adicionales_pago_proveedor', dias_adicionales_pago_proveedor
                    )), '[]'::jsonb)
               from public.finanzas_escenario_parametros
              where tenant_id = p_tenant_id and estado = 'vigente'
           ),
           'politica_tesoreria_id', (
             select id from public.finanzas_politica_tesoreria
              where tenant_id = p_tenant_id and estado = 'vigente'
           )
         ) into v_parametros;

  insert into public.finanzas_flujo_snapshot
    (tenant_id, horizonte_dias, escenario, saldo_inicial, parametros, resultado, motivo, generado_por)
  values
    (p_tenant_id, p_horizonte_dias, p_escenario, v_saldo_inicial, v_parametros,
     coalesce(v_resultado, '[]'::jsonb), p_motivo, (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.finanzas_flujo_snapshot_guardar(uuid, integer, public.finanzas_flujo_escenario_t, text) is
  'FIN-4 §3.3: única vía de escritura de finanzas_flujo_snapshot — recalcula del lado del servidor, '
  'un cliente no puede fabricar cifras. Exige motivo no vacío y rol auxiliar o superior.';
