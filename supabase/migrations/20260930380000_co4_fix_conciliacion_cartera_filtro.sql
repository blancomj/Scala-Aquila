-- ═══════════════════════════════════════════════════════════════════════
--  CO-4 · fix — contable_conciliacion_cartera devolvía saldos legítimos,
--  no solo discrepancias
--
--  20260930370000 filtraba "diferencia <> 0 OR saldo_contable <> 0 OR
--  saldo_auxiliar <> 0" — la intención (§7 del corte, "cero filas =
--  cuadrado") es devolver SOLO inmuebles donde los dos lados no coinciden.
--  Con el filtro original, cualquier inmueble con un saldo pendiente
--  legítimo (p. ej. un cargo de interés todavía sin pagar, con
--  saldo_contable = saldo_auxiliar = 5.000 y diferencia = 0) aparecía
--  igual, porque el segundo/tercer término del OR son casi siempre
--  distintos de cero en cualquier cartera con movimiento real. Encontrado
--  por revisión antes de la primera corrida de pruebas — corregido antes
--  de que ningún dato dependiera del comportamiento anterior.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_conciliacion_cartera(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  inmueble_id    uuid,
  saldo_contable numeric,
  saldo_auxiliar numeric,
  diferencia     numeric
)
language sql
stable
set search_path = ''
as $$
  with contable as (
    select d.inmueble_id, sum(d.debito - d.credito) as saldo
    from public.contable_comprobante_detalle d
    join public.contable_comprobante c on c.id = d.comprobante_id
    join public.contable_cuenta cc on cc.id = d.cuenta_id
    where c.tenant_id = p_tenant_id
      and c.numero is not null
      and c.fecha <= p_fecha_corte
      and cc.clase = 1
      and left(cc.codigo, 2) = '13'
      and d.inmueble_id is not null
    group by d.inmueble_id
  ),
  cargado as (
    select ca.inmueble_id, sum(ca.monto_original) as total
    from public.cargos ca
    where ca.tenant_id = p_tenant_id
    group by ca.inmueble_id
  ),
  aplicado as (
    select ca.inmueble_id, sum(pa.monto) as total
    from public.pago_aplicaciones pa
    join public.cargos ca on ca.id = pa.cargo_id
    join public.pagos pg on pg.id = pa.pago_id
    where ca.tenant_id = p_tenant_id
      and pg.fecha_pago <= p_fecha_corte
    group by ca.inmueble_id
  )
  select
    coalesce(co.inmueble_id, ca.inmueble_id, ap.inmueble_id),
    coalesce(co.saldo, 0),
    coalesce(ca.total, 0) - coalesce(ap.total, 0),
    coalesce(co.saldo, 0) - (coalesce(ca.total, 0) - coalesce(ap.total, 0))
  from contable co
  full outer join cargado ca on ca.inmueble_id = co.inmueble_id
  full outer join aplicado ap on ap.inmueble_id = coalesce(co.inmueble_id, ca.inmueble_id)
  where coalesce(co.saldo, 0) - (coalesce(ca.total, 0) - coalesce(ap.total, 0)) <> 0;
$$;

comment on function public.contable_conciliacion_cartera(uuid, date) is
  'CO-4 §3.4/§7: reconciliación por inmueble entre el saldo contable (13xx, dimensión '
  'inmueble_id de contable_comprobante_detalle) y el auxiliar de cartera (cargos - '
  'pago_aplicaciones), calculados de forma independiente. Un inmueble con saldo pendiente '
  'legítimo (p.ej. un interés sin pagar) NO aparece si ambos lados coinciden — solo se '
  'devuelven discrepancias reales (diferencia <> 0); cero filas = cuadrado. Usada también como '
  'fuente del desglose de 13xx en contable_libro_inventarios_balances.';
