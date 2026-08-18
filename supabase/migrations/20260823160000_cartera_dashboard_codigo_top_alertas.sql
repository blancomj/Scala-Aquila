-- ═══════════════════════════════════════════════════════════════════════
--  CAR F9 (frontend) · Top 10 por inmueble + Alertas y pendientes
--  Propietario: dashboard de Cartera (piezas pedidas 2026-08-17)
--
--  Dos cambios independientes en esta migración:
--
--  1) fn_dashboard_cartera gana la columna `codigo` (inmuebles.codigo) —
--     DROP + CREATE porque cambia el `returns table` (CREATE OR REPLACE
--     no permite alterar la forma de retorno). Sin esto, "Top 10 por
--     inmueble" no tendría cómo identificar la fila para el usuario.
--     No se duplica la agregación de deuda/mora: el Top 10 se calcula en
--     TS a partir de las MISMAS filas que ya trae el dashboard
--     (calcularTopInmueblesCartera, packages/liquidation-engine) — no se
--     vuelve a consultar la base de datos (REC-CAR-004).
--
--  2) fn_alertas_cartera (nueva) — 3 conteos+montos que "Cartera por
--     etapa de cobranza"/"Cartera por antigüedad" no cubren:
--     · Obligaciones > 90 días: a nivel de CARGO individual (no de
--       inmueble, a diferencia de carteraMayor90 en las tarjetas) —
--       "128 obligaciones" en el diseño de referencia cuenta cargos, no
--       inmuebles.
--     · Promesas por vencer en 3 días: fecha_pago_prometida en
--       [p_fecha_referencia, p_fecha_referencia + 3] — ventana distinta
--       de "promesas_vencen_hoy" del panel de acciones (exacto el día).
--     · Cuotas de acuerdo vencidas: acuerdo_pago_cuotas.estado =
--       'vencida' — decisión explícita del usuario (2026-08-17):
--       "acuerdos vencidos" del diseño de referencia son cuotas
--       puntuales vencidas, no acuerdos_pago.estado='incumplido'
--       [evento distinto, más grave y menos frecuente].
--     El cuarto ítem del diseño ("Casos próximos a remisión jurídica")
--     NO vive aquí — se deriva en el frontend de dashboard.porEtapa
--     [prejuridica], ya cargado para "Cartera por etapa de cobranza"; no
--     se vuelve a consultar la base de datos. El quinto ítem
--     ("Notificaciones pendientes de envío") queda fuera de alcance por
--     completo — decisión del usuario: no es dominio de cartera.
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.fn_dashboard_cartera(uuid, date);

create function public.fn_dashboard_cartera(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  inmueble_id      uuid,
  codigo           text,
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
    inm.codigo as codigo,
    coalesce(a.deuda_total, 0) as deuda_total,
    coalesce(a.deuda_vencida, 0) as deuda_vencida,
    coalesce(a.deuda_corriente, 0) as deuda_corriente,
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
  '(vencidos + corrientes) a una fecha de corte explícita, incluyendo codigo '
  '[20260823160000, para Top 10 por inmueble]. No clasifica ni escala (eso sigue '
  'siendo fn_posicion_cartera + clasificarCartera/evaluarEscalamiento, F1/F6) — esta '
  'función es de solo lectura para el dashboard (REC-CAR-004: reutiliza v_cargo_saldo, '
  'no reimplementa saldo).';

revoke execute on function public.fn_dashboard_cartera(uuid, date) from public, anon;
grant execute on function public.fn_dashboard_cartera(uuid, date) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_alertas_cartera(
  p_tenant_id        uuid,
  p_fecha_referencia date
)
returns table (
  obligaciones_mayor_90_cantidad   int,
  obligaciones_mayor_90_monto      numeric(18, 2),
  promesas_por_vencer_cantidad     int,
  promesas_por_vencer_monto        numeric(18, 2),
  cuotas_acuerdo_vencidas_cantidad int,
  cuotas_acuerdo_vencidas_monto    numeric(18, 2)
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
      and per.fecha_vencimiento is not null
      and (p_fecha_referencia - per.fecha_vencimiento) > 90
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
    ) as cuotas_acuerdo_vencidas_monto;
$$;

comment on function public.fn_alertas_cartera is
  'Dashboard de Cartera (frontend, 2026-08-17) — 3 conteos+montos que no cubren ni el '
  'panel de acciones [§23.5, colas operativas] ni las tarjetas [§23.1, agregados por '
  'inmueble]: obligaciones >90 días a nivel de CARGO, promesas por vencer en 3 días '
  '[ventana distinta de "vencen hoy" del panel], cuotas de acuerdo vencidas [no '
  'acuerdos_pago.estado=incumplido, decisión explícita del usuario]. security invoker: '
  'respeta RLS del usuario que llama, mismo criterio que el resto de F9.';

revoke all on function public.fn_alertas_cartera(uuid, date) from public, anon;
grant execute on function public.fn_alertas_cartera(uuid, date) to authenticated;
