-- ═══════════════════════════════════════════════════════════════════════
--  GAP-CAR-001 · Override de fecha_vencimiento por cargo + fix de
--  clasificación indeterminada en el dashboard
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §4.4
--
--  Contexto: el guard de periodos (20260822190000) ya impide que un
--  periodo entre a 'en_liquidacion' sin fecha_vencimiento, y
--  cuenta-corriente-supabase.ts ya lanza error explícito si el ledger de
--  UN inmueble depende de un periodo sin fecha (nunca infiere un
--  vencimiento — un vencimiento inventado produce una mora inventada).
--  Verificado contra la BD real (2026-08-18): 287/862 periodos siguen sin
--  fecha_vencimiento, todos en estado 'abierto' (ninguno bloqueado por el
--  guard) — casi en su totalidad tenants efímeros de la suite de tests,
--  no configuración real pendiente. 213 cargos dependen hoy de esos
--  periodos.
--
--  Dos cambios reales, aditivos, en esta migración:
--
--  1) cargos.fecha_vencimiento (Opción B de la decisión documentada en
--     §4.4): override opcional, nullable. fecha_vencimiento_efectiva =
--     coalesce(cargo.fecha_vencimiento, periodo.fecha_vencimiento).
--     Soporta cuotas con calendario propio (p.ej. extraordinarias) sin
--     tocar el periodo. No rompe append-only: columna nueva, sin backfill
--     inventado.
--
--  2) fn_dashboard_cartera tenía un bug real: un cargo cuyo periodo no
--     tiene fecha_vencimiento caía en dias_mora = null, y
--     deuda_corriente sumaba TODO lo que tuviera dias_mora null — es
--     decir, un cargo con vencimiento INDETERMINADO se contaba como "al
--     día" (corriente), no como "no se sabe". Eso subestima
--     deuda_vencida y sobreestima deuda_corriente exactamente en el
--     escenario que GAP-CAR-001 advertía. Se separa en 3 (vencida /
--     corriente / sin_vencimiento) — mismo principio que REC-CAR-004 en
--     TS: un denominador/estado indeterminado nunca se informa como si
--     fuera el caso "seguro" (0%, "al día"), se informa como null/aparte.
--     fn_posicion_cartera no tenía este bug (solo agrega vencidos, un
--     cargo sin fecha efectiva simplemente no puede ser "vencido" — eso
--     sigue igual), pero gana el mismo coalesce para respetar el
--     override de cargos.fecha_vencimiento.
--
--  3) fn_alertas_cartera gana un 4to conteo: obligaciones sin fecha de
--     vencimiento — antes esta condición era invisible en el dashboard
--     (silenciosamente excluida de "vencidos" en fn_posicion_cartera, y
--     ahora ya no escondida dentro de "corriente" en fn_dashboard_
--     cartera). Mismo patrón que los otros 3 conteos de la alerta
--     (20260823160000): cantidad+monto, sin ratio que calcular.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.cargos add column fecha_vencimiento date;

comment on column public.cargos.fecha_vencimiento is
  'GAP-CAR-001 Opción B: override opcional del vencimiento derivado de '
  'periodos.fecha_vencimiento. fecha_vencimiento_efectiva = '
  'coalesce(cargos.fecha_vencimiento, periodos.fecha_vencimiento). NULL por '
  'defecto — el periodo sigue siendo la fuente de verdad salvo excepción '
  'explícita (p.ej. cuota extraordinaria con calendario propio).';

-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_dashboard_cartera(uuid, date);

create function public.fn_dashboard_cartera(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  inmueble_id         uuid,
  codigo              text,
  deuda_total         numeric(18, 2),
  deuda_vencida       numeric(18, 2),
  deuda_corriente     numeric(18, 2),
  deuda_sin_vencimiento numeric(18, 2),
  interes_causado     numeric(18, 2),
  saldo_credito       numeric(18, 2),
  dias_mora_maximo    int,
  etapa_cobranza      text
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
      coalesce(c.fecha_vencimiento, per.fecha_vencimiento) as fecha_vencimiento_efectiva
    from public.cargos c
    join public.v_cargo_saldo s on s.id = c.id
    join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and s.monto_pendiente > 0
  ),
  clasificado as (
    select
      *,
      case
        -- GAP-CAR-001: sin fecha efectiva, la antigüedad es indeterminada
        -- — nunca se asume "al día" (dias_mora = 0) ni "vencido".
        when fecha_vencimiento_efectiva is null then null
        when fecha_vencimiento_efectiva < p_fecha_corte then p_fecha_corte - fecha_vencimiento_efectiva
        else 0
      end as dias_mora
    from abiertos
  ),
  agregado as (
    select
      inmueble_id,
      sum(monto_pendiente) as deuda_total,
      sum(monto_pendiente) filter (where dias_mora is not null and dias_mora > 0) as deuda_vencida,
      sum(monto_pendiente) filter (where dias_mora is not null and dias_mora = 0) as deuda_corriente,
      sum(monto_pendiente) filter (where dias_mora is null) as deuda_sin_vencimiento,
      sum(monto_pendiente) filter (where categoria = 'interes') as interes_causado
    from clasificado
    group by inmueble_id
  ),
  -- REC-CAR-010: mismo criterio de desempate que fn_posicion_cartera —
  -- el cargo vencido con saldo más antiguo decide dias_mora_maximo. Un
  -- cargo indeterminado (dias_mora null) nunca puede ganar este desempate.
  mas_antiguo as (
    select distinct on (inmueble_id)
      inmueble_id,
      dias_mora as dias_mora_maximo
    from clasificado
    where dias_mora is not null and dias_mora > 0
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
    inm.codigo as codigo,
    coalesce(a.deuda_total, 0) as deuda_total,
    coalesce(a.deuda_vencida, 0) as deuda_vencida,
    coalesce(a.deuda_corriente, 0) as deuda_corriente,
    coalesce(a.deuda_sin_vencimiento, 0) as deuda_sin_vencimiento,
    coalesce(a.interes_causado, 0) as interes_causado,
    coalesce(pg.total_pagado, 0) - coalesce(ap.total_aplicado, 0) as saldo_credito,
    coalesce(ma.dias_mora_maximo, 0) as dias_mora_maximo,
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
  '(vencidos + corrientes + sin_vencimiento) a una fecha de corte explícita '
  '[20260823180000, GAP-CAR-001: separa deuda_sin_vencimiento de deuda_corriente, '
  'antes se contaba como "al día" por error]. No clasifica ni escala (eso sigue '
  'siendo fn_posicion_cartera + clasificarCartera/evaluarEscalamiento, F1/F6) — esta '
  'función es de solo lectura para el dashboard (REC-CAR-004: reutiliza v_cargo_saldo, '
  'no reimplementa saldo).';

revoke execute on function public.fn_dashboard_cartera(uuid, date) from public, anon;
grant execute on function public.fn_dashboard_cartera(uuid, date) to authenticated;

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
    -- CAR §7.1/§7.2: dias_mora = GREATEST(0, fecha_corte − fecha_vencimiento
    -- efectiva), mismo cálculo que calcularAntiguedad(). Solo cargos con
    -- saldo > 0 (I-C01) y ya vencidos a fecha_corte participan.
    -- GAP-CAR-001 [20260823180000]: coalesce con el override de
    -- cargos.fecha_vencimiento — un cargo sin fecha efectiva (ni propia ni
    -- de su periodo) sigue, correctamente, sin poder ser "vencido".
    select
      c.id,
      c.inmueble_id,
      c.categoria,
      s.monto_pendiente,
      coalesce(c.fecha_vencimiento, per.fecha_vencimiento) as fecha_vencimiento,
      (p_fecha_corte - coalesce(c.fecha_vencimiento, per.fecha_vencimiento)) as dias_mora
    from public.cargos c
    join public.v_cargo_saldo s on s.id = c.id
    join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and (p_inmueble_id is null or c.inmueble_id = p_inmueble_id)
      and s.monto_pendiente > 0
      and coalesce(c.fecha_vencimiento, per.fecha_vencimiento) is not null
      and coalesce(c.fecha_vencimiento, per.fecha_vencimiento) < p_fecha_corte
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
  'duplica en SQL). [20260823180000, GAP-CAR-001: coalesce con cargos.fecha_vencimiento].';

-- security invoker: respeta el RLS de cargos/pagos/pago_aplicaciones del usuario
-- que llama, igual que v_cargo_saldo. authenticated ya está acotado por esos RLS.
revoke execute on function public.fn_posicion_cartera(uuid, date, uuid) from public, anon;
grant execute on function public.fn_posicion_cartera(uuid, date, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_alertas_cartera(uuid, date);

create function public.fn_alertas_cartera(
  p_tenant_id        uuid,
  p_fecha_referencia date
)
returns table (
  obligaciones_mayor_90_cantidad       int,
  obligaciones_mayor_90_monto          numeric(18, 2),
  promesas_por_vencer_cantidad         int,
  promesas_por_vencer_monto            numeric(18, 2),
  cuotas_acuerdo_vencidas_cantidad     int,
  cuotas_acuerdo_vencidas_monto        numeric(18, 2),
  obligaciones_sin_vencimiento_cantidad int,
  obligaciones_sin_vencimiento_monto    numeric(18, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with obligaciones as (
    select s.monto_pendiente
    from public.cargos c
    join public.v_cargo_saldo s on s.id = c.id
    join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and s.monto_pendiente > 0
      and coalesce(c.fecha_vencimiento, per.fecha_vencimiento) is not null
      and (p_fecha_referencia - coalesce(c.fecha_vencimiento, per.fecha_vencimiento)) > 90
  ),
  -- GAP-CAR-001: antes invisible — ni "vencida" ni "corriente", simplemente
  -- ausente del reporte. Ahora es su propia alerta operativa (mismo patrón
  -- que los otros 3 conteos de esta función).
  sin_vencimiento as (
    select s.monto_pendiente
    from public.cargos c
    join public.v_cargo_saldo s on s.id = c.id
    join public.periodos per on per.id = c.periodo_id
    where c.tenant_id = p_tenant_id
      and s.monto_pendiente > 0
      and coalesce(c.fecha_vencimiento, per.fecha_vencimiento) is null
  )
  select
    (select count(*)::int from obligaciones) as obligaciones_mayor_90_cantidad,
    (select coalesce(sum(monto_pendiente), 0) from obligaciones) as obligaciones_mayor_90_monto,
    (select count(*)::int
     from public.promesas_pago
     where tenant_id = p_tenant_id
       and estado = 'pendiente'
       and fecha_pago_prometida between p_fecha_referencia and p_fecha_referencia + 3
    ) as promesas_por_vencer_cantidad,
    (select coalesce(sum(monto_prometido), 0)
     from public.promesas_pago
     where tenant_id = p_tenant_id
       and estado = 'pendiente'
       and fecha_pago_prometida between p_fecha_referencia and p_fecha_referencia + 3
    ) as promesas_por_vencer_monto,
    (select count(*)::int
     from public.acuerdo_pago_cuotas
     where tenant_id = p_tenant_id and estado = 'vencida'
    ) as cuotas_acuerdo_vencidas_cantidad,
    (select coalesce(sum(monto - monto_pagado), 0)
     from public.acuerdo_pago_cuotas
     where tenant_id = p_tenant_id and estado = 'vencida'
    ) as cuotas_acuerdo_vencidas_monto,
    (select count(*)::int from sin_vencimiento) as obligaciones_sin_vencimiento_cantidad,
    (select coalesce(sum(monto_pendiente), 0) from sin_vencimiento) as obligaciones_sin_vencimiento_monto;
$$;

comment on function public.fn_alertas_cartera is
  'Dashboard de Cartera (frontend, 2026-08-17) — conteos+montos que no cubren ni el '
  'panel de acciones [§23.5, colas operativas] ni las tarjetas [§23.1, agregados por '
  'inmueble]: obligaciones >90 días a nivel de CARGO, promesas por vencer en 3 días '
  '[ventana distinta de "vencen hoy" del panel], cuotas de acuerdo vencidas [no '
  'acuerdos_pago.estado=incumplido, decisión explícita del usuario], y obligaciones sin '
  'fecha de vencimiento determinable [20260823180000, GAP-CAR-001 — antes invisible en '
  'el reporte]. security invoker: respeta RLS del usuario que llama, mismo criterio que '
  'el resto de F9.';

revoke all on function public.fn_alertas_cartera(uuid, date) from public, anon;
grant execute on function public.fn_alertas_cartera(uuid, date) to authenticated;
