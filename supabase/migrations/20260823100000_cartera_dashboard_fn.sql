-- ═══════════════════════════════════════════════════════════════════════
--  fn_dashboard_cartera — CAR F9 (Docs/Motor de gestion de cartera/
--  CAR_00_Guia_Oficial.md §23.1/§23.2). Propietario: este bloque.
--
--  Distinto de fn_posicion_cartera (F1, 20260822210000): ese solo agrega
--  cargos VENCIDOS (para clasificación/escalamiento, REC-CAR-010 — el
--  cargo más antiguo con saldo decide la etapa del inmueble). Este agrega
--  TODOS los cargos abiertos (vencidos + corrientes) porque §23.1 exige
--  CARTERA TOTAL/CARTERA CORRIENTE/INTERESES CAUSADOS, que fn_posicion_
--  cartera deliberadamente no cubre (su filtro `fecha_vencimiento <
--  fecha_corte` los excluye por diseño). No se reimplementa la lógica de
--  escalamiento aquí — F1-F8 (clasificarCartera/evaluarEscalamiento) no
--  se tocan; esta función es de solo lectura para BI, un consumidor
--  nuevo con una forma de dato distinta (REC-CAR-004: se reutiliza
--  v_cargo_saldo, no se reimplementa el cálculo de saldo pendiente).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_dashboard_cartera(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  inmueble_id      uuid,
  deuda_total      numeric(18, 2),
  deuda_vencida    numeric(18, 2),
  deuda_corriente  numeric(18, 2),
  interes_causado  numeric(18, 2),
  saldo_credito    numeric(18, 2),
  dias_mora_maximo int,
  etapa_cobranza   text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with abiertos as (
    select
      c.id,
      c.inmueble_id,
      c.categoria,
      s.monto_pendiente,
      per.fecha_vencimiento,
      case
        when per.fecha_vencimiento is not null and per.fecha_vencimiento < p_fecha_corte
          then p_fecha_corte - per.fecha_vencimiento
        else null
      end as dias_mora
    from public.cargos c
    join public.v_cargo_saldo s on s.id = c.id
    join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and s.monto_pendiente > 0
  ),
  agregado as (
    select
      inmueble_id,
      sum(monto_pendiente) as deuda_total,
      sum(monto_pendiente) filter (where dias_mora is not null) as deuda_vencida,
      sum(monto_pendiente) filter (where dias_mora is null) as deuda_corriente,
      sum(monto_pendiente) filter (where categoria = 'interes') as interes_causado
    from abiertos
    group by inmueble_id
  ),
  -- REC-CAR-010: mismo criterio de desempate que fn_posicion_cartera —
  -- el cargo vencido con saldo más antiguo decide dias_mora_maximo.
  mas_antiguo as (
    select distinct on (inmueble_id)
      inmueble_id,
      dias_mora as dias_mora_maximo
    from abiertos
    where dias_mora is not null
    order by inmueble_id, dias_mora desc, id asc
  ),
  pagado as (
    select p.inmueble_id, sum(p.monto) as total_pagado
    from public.pagos p
    where p.tenant_id = p_tenant_id
    group by p.inmueble_id
  ),
  aplicado as (
    select pp.inmueble_id, sum(pa.monto) as total_aplicado
    from public.pago_aplicaciones pa
    join public.pagos pp on pp.id = pa.pago_id
    where pp.tenant_id = p_tenant_id
    group by pp.inmueble_id
  )
  select
    inm.id as inmueble_id,
    coalesce(a.deuda_total, 0) as deuda_total,
    coalesce(a.deuda_vencida, 0) as deuda_vencida,
    coalesce(a.deuda_corriente, 0) as deuda_corriente,
    coalesce(a.interes_causado, 0) as interes_causado,
    coalesce(pg.total_pagado, 0) - coalesce(ap.total_aplicado, 0) as saldo_credito,
    coalesce(ma.dias_mora_maximo, 0) as dias_mora_maximo,
    -- sin fila en cartera_etapas todavía = nunca evaluado por el job (F8) =
    -- 'preventiva' (mismo default que guard_cartera_etapa_inicial, F6).
    coalesce(ce.etapa::text, 'preventiva') as etapa_cobranza
  from public.inmuebles inm
  left join agregado a      on a.inmueble_id = inm.id
  left join mas_antiguo ma  on ma.inmueble_id = inm.id
  left join pagado pg       on pg.inmueble_id = inm.id
  left join aplicado ap     on ap.inmueble_id = inm.id
  left join public.cartera_etapas ce
    on ce.tenant_id = p_tenant_id and ce.inmueble_id = inm.id
  where inm.tenant_id = p_tenant_id;
$$;

comment on function public.fn_dashboard_cartera(uuid, date) is
  'BI (CAR §23.1/§23.2) — agregación por inmueble de TODOS los cargos abiertos '
  '(vencidos + corrientes) a una fecha de corte explícita. No clasifica ni '
  'escala (eso sigue siendo fn_posicion_cartera + clasificarCartera/'
  'evaluarEscalamiento, F1/F6) — este función es de solo lectura para el '
  'dashboard (REC-CAR-004: reutiliza v_cargo_saldo, no reimplementa saldo).';

-- security invoker: respeta el RLS de cargos/pagos/pago_aplicaciones/
-- cartera_etapas del usuario que llama — mismo criterio que
-- fn_posicion_cartera (SEC-03, PH-C34: nunca agrega cross-tenant).
revoke execute on function public.fn_dashboard_cartera(uuid, date) from public, anon;
grant execute on function public.fn_dashboard_cartera(uuid, date) to authenticated;
