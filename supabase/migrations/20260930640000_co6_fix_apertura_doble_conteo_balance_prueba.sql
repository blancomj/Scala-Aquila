-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Fix: contable_balance_prueba (CO-4) — mismo doble conteo que
--  contable_estado_financiero (20260930620000) y contable_libro_mayor (20260930630000).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_balance_prueba(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date,
  p_nivel     smallint default 5
)
returns table (
  codigo           text,
  nombre           text,
  naturaleza       public.contable_naturaleza_t,
  saldo_anterior   numeric,
  debitos_periodo  numeric,
  creditos_periodo numeric,
  saldo_final      numeric
)
language sql
stable
set search_path = ''
as $$
  with longitud(nivel, len) as (
    values (1::smallint, 1), (2::smallint, 2), (3::smallint, 4), (4::smallint, 6), (5::smallint, 8)
  ),
  agregado as (
    select
      left(cc.codigo, l.len)                                             as codigo_grupo,
      sum(d.debito)  filter (where c.fecha < p_desde)                    as debito_antes,
      sum(d.credito) filter (where c.fecha < p_desde)                    as credito_antes,
      sum(d.debito)  filter (where c.fecha between p_desde and p_hasta)  as debito_periodo,
      sum(d.credito) filter (where c.fecha between p_desde and p_hasta)  as credito_periodo
    from public.contable_comprobante_detalle d
    join public.contable_comprobante c on c.id = d.comprobante_id
    join public.contable_cuenta cc on cc.id = d.cuenta_id
    cross join longitud l
    where c.tenant_id = p_tenant_id
      and c.numero is not null
      and c.fecha <= p_hasta
      -- CO-6: mismo fix que contable_estado_financiero/contable_libro_mayor — 'apertura_ejercicio'
      -- reproduce un saldo que la actividad real ya cuenta, sumarlo también lo duplicaría.
      and coalesce(c.origen_evento, '') <> 'apertura_ejercicio'
      and l.nivel = p_nivel
    group by left(cc.codigo, l.len)
  )
  select
    a.codigo_grupo,
    cta.nombre,
    cta.naturaleza,
    case cta.naturaleza
      when 'debito' then coalesce(a.debito_antes, 0) - coalesce(a.credito_antes, 0)
      else coalesce(a.credito_antes, 0) - coalesce(a.debito_antes, 0)
    end,
    coalesce(a.debito_periodo, 0),
    coalesce(a.credito_periodo, 0),
    case cta.naturaleza
      when 'debito' then coalesce(a.debito_antes, 0) - coalesce(a.credito_antes, 0)
                          + coalesce(a.debito_periodo, 0) - coalesce(a.credito_periodo, 0)
      else coalesce(a.credito_antes, 0) - coalesce(a.debito_antes, 0)
                          + coalesce(a.credito_periodo, 0) - coalesce(a.debito_periodo, 0)
    end
  from agregado a
  join public.contable_cuenta cta
    on cta.tenant_id = p_tenant_id and cta.codigo = a.codigo_grupo
  order by a.codigo_grupo;
$$;

comment on function public.contable_balance_prueba(uuid, date, date, smallint) is
  'CO-4 §3.3: nivel 1=clase, 2=grupo, 3=cuenta, 4=subcuenta, 5=auxiliar. Débitos/créditos del '
  'periodo son sumas crudas, invariantes al nivel de agregación por construcción. El saldo '
  '(anterior y final) depende de la naturaleza propia de la fila de contable_cuenta. CO-6: '
  'excluye comprobantes origen_evento=''apertura_ejercicio'' de toda suma — mismo defecto y '
  'mismo fix que contable_estado_financiero (20260930620000) y contable_libro_mayor '
  '(20260930630000). Consumida por contable_libro_inventarios_balances, que hereda el fix sin '
  'cambio propio.';
