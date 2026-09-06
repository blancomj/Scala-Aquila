-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Fix: contable_conciliacion_cartera (CO-4) — mismo doble conteo que
--  contable_estado_financiero (20260930620000), contable_libro_mayor
--  (20260930630000) y contable_balance_prueba (20260930640000).
--
--  Las cuentas 13xx (cartera) exigen dimensión inmueble_id (contable_plan_cuenta.
--  requiere_inmueble = true) — fn_contable_abrir_ejercicio (CO-6) reproduce su saldo por
--  inmueble en el comprobante APERTURA, exactamente igual que cualquier otra cuenta de balance.
--  Sin esta exclusión, cualquier inmueble con saldo de cartera pendiente al cierre del ejercicio
--  aparecería con el lado "contable" duplicado tras la apertura, generando una diferencia
--  espuria contra el auxiliar (cargos - pago_aplicaciones), que no duplica nada porque no
--  proviene de contable_comprobante_detalle.
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
      -- CO-6: 'apertura_ejercicio' reproduce un saldo de cartera que la actividad real
      -- (cargos/pago_aplicaciones) ya cuenta del lado auxiliar; sumarlo también lo duplicaría.
      and coalesce(c.origen_evento, '') <> 'apertura_ejercicio'
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
  'devuelven discrepancias reales (diferencia <> 0); cero filas = cuadrado. CO-6: excluye '
  'comprobantes origen_evento=''apertura_ejercicio'' del lado contable — mismo defecto y mismo '
  'fix que contable_estado_financiero (20260930620000), contable_libro_mayor (20260930630000) y '
  'contable_balance_prueba (20260930640000). Usada también como fuente del desglose de 13xx en '
  'contable_libro_inventarios_balances.';
