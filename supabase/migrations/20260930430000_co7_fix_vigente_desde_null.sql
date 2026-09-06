-- ═══════════════════════════════════════════════════════════════════════
--  CO-7 · Fix: contable_calcular_deterioro nunca encontraba una política
--  cuyo vigente_desde quedó en null (columna nullable a propósito — una
--  política puede activarse sin fecha explícita).
--
--  `vigente_desde <= p_fecha_corte` con vigente_desde = null evalúa a NULL, no a true, así que
--  el WHERE la descartaba silenciosamente y toda simulación fallaba con DETERIORO_SIN_POLITICA
--  aunque la política SÍ estuviera vigente. Encontrado en verificación manual en el navegador
--  (no en las 11 pruebas, que siempre pasan vigente_desde='2000-01-01' explícito — un gap real
--  de cobertura de pruebas, documentado en el informe).
--
--  Semántica correcta: sin fecha explícita, la política rige desde siempre (coalesce a una
--  fecha mínima), igual que contable_libro_inventarios_balances (CO-4) trata un p_desde
--  extremadamente temprano como "desde el origen".
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_calcular_deterioro(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  inmueble_id          uuid,
  cuenta_cartera_id    uuid,
  cuenta_codigo        text,
  cuenta_nombre        text,
  saldo                numeric(18, 2),
  dias_vencido         int,
  tramo_id             uuid,
  porcentaje           numeric(5, 2),
  deterioro_calculado  numeric(18, 2),
  deterioro_reconocido numeric(18, 2),
  ajuste               numeric(18, 2)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_politica public.contable_politica_deterioro%rowtype;
begin
  select * into v_politica
    from public.contable_politica_deterioro
   where tenant_id = p_tenant_id
     and estado = 'vigente'
     and coalesce(vigente_desde, '0001-01-01'::date) <= p_fecha_corte
     and (vigente_hasta is null or vigente_hasta >= p_fecha_corte);

  if v_politica.id is null then
    raise exception 'DETERIORO_SIN_POLITICA: no hay política de deterioro vigente para % en % '
      '(CO-7 §4.2)', p_tenant_id, p_fecha_corte;
  end if;

  if v_politica.metodo = 'individual' then
    raise exception 'DETERIORO_METODO_NO_IMPLEMENTADO: el método individual no tiene cálculo '
      'implementado en CO-7 — requiere diseño de un corte futuro (política %)', v_politica.id;
  end if;

  return query
  with cuentas as (
    select
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_CUOTA_ORDINARIA'))[1] as ordinaria,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_INTERES_MORA'))[1]    as interes,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'CARTERA_OTROS'))[1]           as otros
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id
  ),
  saldo_cargo as (
    select
      c.id as cargo_id,
      c.inmueble_id,
      case
        when c.categoria = 'capital' then (select ordinaria from cuentas)
        when c.categoria = 'interes' then (select interes from cuentas)
        else (select otros from cuentas)
      end as cuenta_cartera_id,
      c.monto_original - coalesce(sum(pa.monto), 0) as saldo,
      greatest((p_fecha_corte - p.fecha_vencimiento), 0) as dias_vencido
    from public.cargos c
    join public.periodos p on p.id = c.periodo_id
    left join public.pago_aplicaciones pa on pa.cargo_id = c.id
    where c.tenant_id = p_tenant_id
      and (
        not v_politica.excluir_cargos_con_acuerdo_vigente
        or not exists (
          select 1 from public.acuerdos_pago ap
          where ap.tenant_id = p_tenant_id
            and ap.inmueble_id = c.inmueble_id
            and ap.estado = 'vigente'
        )
      )
    group by c.id, c.inmueble_id, c.categoria, c.monto_original, p.fecha_vencimiento
    having c.monto_original - coalesce(sum(pa.monto), 0) <> 0
  ),
  con_tramo as (
    select
      sc.*,
      case when v_politica.metodo = 'antiguedad' then t.id end as tramo_id,
      case
        when v_politica.metodo = 'antiguedad' then t.porcentaje
        else v_politica.porcentaje_global
      end as porcentaje
    from saldo_cargo sc
    left join public.contable_politica_deterioro_tramo t
      on v_politica.metodo = 'antiguedad'
     and t.politica_id = v_politica.id
     and sc.dias_vencido >= t.dias_desde
     and (t.dias_hasta is null or sc.dias_vencido <= t.dias_hasta)
  ),
  agregado as (
    select
      con_tramo.inmueble_id,
      con_tramo.cuenta_cartera_id,
      sum(con_tramo.saldo) as saldo,
      max(con_tramo.dias_vencido) as dias_vencido,
      (array_agg(con_tramo.tramo_id order by con_tramo.dias_vencido desc))[1] as tramo_id,
      (array_agg(con_tramo.porcentaje order by con_tramo.dias_vencido desc))[1] as porcentaje,
      sum(round(con_tramo.saldo * coalesce(con_tramo.porcentaje, 0) / 100, 2)) as deterioro_calculado
    from con_tramo
    group by con_tramo.inmueble_id, con_tramo.cuenta_cartera_id
  ),
  previo as (
    select dd.inmueble_id, dd.cuenta_cartera_id, sum(dd.ajuste) as reconocido
    from public.contable_deterioro_detalle dd
    join public.contable_comprobante c on c.id = dd.comprobante_id
    where c.tenant_id = p_tenant_id and c.numero is not null and c.fecha <= p_fecha_corte
    group by dd.inmueble_id, dd.cuenta_cartera_id
  )
  select
    a.inmueble_id,
    a.cuenta_cartera_id,
    cc.codigo as cuenta_codigo,
    cc.nombre as cuenta_nombre,
    a.saldo,
    a.dias_vencido,
    a.tramo_id,
    a.porcentaje,
    a.deterioro_calculado,
    coalesce(p.reconocido, 0) as deterioro_reconocido,
    a.deterioro_calculado - coalesce(p.reconocido, 0) as ajuste
  from agregado a
  left join previo p
    on p.inmueble_id = a.inmueble_id and p.cuenta_cartera_id = a.cuenta_cartera_id
  left join public.contable_cuenta cc on cc.id = a.cuenta_cartera_id;
end;
$$;

comment on function public.contable_calcular_deterioro(uuid, date) is
  'Solo lectura (§8: la simulación nunca escribe). Por inmueble y cuenta de cartera: saldo '
  'pendiente, antigüedad (desde periodos.fecha_vencimiento del cargo), tramo/porcentaje '
  'aplicado, deterioro calculado, lo ya reconocido en comprobantes previos y el ajuste '
  'resultante — nunca el total (CO-7 §4.2/§4.3). Falla con DETERIORO_SIN_POLITICA si no hay '
  'política vigente para la fecha de corte — el cero silencioso está prohibido. '
  'vigente_desde nulo se trata como "vigente desde siempre" (fix 20260930430000).';
