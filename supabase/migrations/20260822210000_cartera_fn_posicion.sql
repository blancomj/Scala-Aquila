-- ═══════════════════════════════════════════════════════════════════════
--  CAR F1 · Posición de cartera — agregación SQL, sin clasificación
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §6.2
--
--  REC-CAR-004/REC-CAR-005: fn_posicion_cartera() SOLO agrega deuda/crédito
--  por inmueble — la misma responsabilidad de calcularPosicionCartera()
--  (packages/liquidation-engine/src/cartera.ts), expresada en SQL porque
--  una vista/consulta de solo-lectura no puede invocar TypeScript.
--
--  NO clasifica. La clasificación (clasificarCartera) exige la política
--  vigente versionada y su provenance congelada (REC-CAR-011/REC-CAR-012)
--  — es responsabilidad de la capa de aplicación (Edge Function
--  cartera-posicion, CAR §22.3), no de esta función. Duplicar el lookup de
--  tramos aquí violaría REC-CAR-004: dos motores de clasificación en dos
--  lenguajes divergirían con el tiempo.
--
--  fecha_corte es parámetro explícito, nunca CURRENT_DATE implícito
--  (AD-32/REC-CAR-008) — reproducible para cualquier fecha histórica.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_posicion_cartera(
  p_tenant_id   uuid,
  p_fecha_corte date,
  p_inmueble_id uuid default null
)
returns table (
  inmueble_id                   uuid,
  deuda_total                   numeric(18, 2),
  deuda_capital                 numeric(18, 2),
  deuda_interes                 numeric(18, 2),
  deuda_otros                   numeric(18, 2),
  saldo_credito                 numeric(18, 2),
  cargo_vencido_mas_antiguo_id  uuid,
  fecha_vencimiento_mas_antigua date,
  dias_mora_maximo              int,
  cantidad_cargos_vencidos      int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with cargos_vencidos as (
    -- CAR §7.1/§7.2: dias_mora = GREATEST(0, fecha_corte − fecha_vencimiento),
    -- mismo cálculo que calcularAntiguedad(). Solo cargos con saldo > 0
    -- (I-C01) y ya vencidos a fecha_corte participan.
    select
      c.id,
      c.inmueble_id,
      c.categoria,
      s.monto_pendiente,
      per.fecha_vencimiento,
      (p_fecha_corte - per.fecha_vencimiento) as dias_mora
    from public.cargos c
    join public.v_cargo_saldo s on s.id = c.id
    join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and (p_inmueble_id is null or c.inmueble_id = p_inmueble_id)
      and s.monto_pendiente > 0
      and per.fecha_vencimiento is not null
      and per.fecha_vencimiento < p_fecha_corte
  ),
  agregado as (
    select
      inmueble_id,
      sum(monto_pendiente) filter (where categoria = 'capital') as deuda_capital,
      sum(monto_pendiente) filter (where categoria = 'interes') as deuda_interes,
      sum(monto_pendiente) filter (where categoria = 'otro')    as deuda_otros,
      count(*) as cantidad_cargos_vencidos
    from cargos_vencidos
    group by inmueble_id
  ),
  -- REC-CAR-010: el cargo que clasifica es el más antiguo CON SALDO — mayor
  -- dias_mora, empate determinista por id (mismo criterio que esMasAntiguo()
  -- en cartera.ts).
  mas_antiguo as (
    select distinct on (inmueble_id)
      inmueble_id,
      id as cargo_vencido_mas_antiguo_id,
      fecha_vencimiento as fecha_vencimiento_mas_antigua,
      dias_mora as dias_mora_maximo
    from cargos_vencidos
    order by inmueble_id, dias_mora desc, id asc
  ),
  pagado as (
    select p.inmueble_id, sum(p.monto) as total_pagado
    from public.pagos p
    where p.tenant_id = p_tenant_id
      and (p_inmueble_id is null or p.inmueble_id = p_inmueble_id)
    group by p.inmueble_id
  ),
  -- I-C06: un sobrepago no desaparece — saldo_credito = pagado − aplicado,
  -- nunca se netea contra la deuda de periodos futuros implícitamente.
  aplicado as (
    select pp.inmueble_id, sum(pa.monto) as total_aplicado
    from public.pago_aplicaciones pa
    join public.pagos pp on pp.id = pa.pago_id
    where pp.tenant_id = p_tenant_id
      and (p_inmueble_id is null or pp.inmueble_id = p_inmueble_id)
    group by pp.inmueble_id
  )
  select
    inm.id as inmueble_id,
    coalesce(a.deuda_capital, 0) + coalesce(a.deuda_interes, 0) + coalesce(a.deuda_otros, 0)
      as deuda_total,
    coalesce(a.deuda_capital, 0) as deuda_capital,
    coalesce(a.deuda_interes, 0) as deuda_interes,
    coalesce(a.deuda_otros, 0) as deuda_otros,
    coalesce(pg.total_pagado, 0) - coalesce(ap.total_aplicado, 0) as saldo_credito,
    ma.cargo_vencido_mas_antiguo_id,
    ma.fecha_vencimiento_mas_antigua,
    coalesce(ma.dias_mora_maximo, 0) as dias_mora_maximo,
    coalesce(a.cantidad_cargos_vencidos, 0) as cantidad_cargos_vencidos
  from public.inmuebles inm
  left join agregado a    on a.inmueble_id = inm.id
  left join mas_antiguo ma on ma.inmueble_id = inm.id
  left join pagado pg      on pg.inmueble_id = inm.id
  left join aplicado ap    on ap.inmueble_id = inm.id
  where inm.tenant_id = p_tenant_id
    and (p_inmueble_id is null or inm.id = p_inmueble_id);
$$;

comment on function public.fn_posicion_cartera(uuid, date, uuid) is
  'Agregación de deuda/crédito por inmueble a una fecha de corte explícita (CAR §6.2). '
  'NO clasifica — devuelve dias_mora_maximo para que la capa de aplicación llame a '
  'clasificarCartera() con la política vigente (REC-CAR-004: la clasificación no se '
  'duplica en SQL).';

-- security invoker: respeta el RLS de cargos/pagos/pago_aplicaciones del usuario
-- que llama, igual que v_cargo_saldo. authenticated ya está acotado por esos RLS.
revoke execute on function public.fn_posicion_cartera(uuid, date, uuid) from public, anon;
grant execute on function public.fn_posicion_cartera(uuid, date, uuid) to authenticated;
