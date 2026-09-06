-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Fix: contable_libro_mayor (CO-4) — mismo doble conteo que
--  contable_estado_financiero (20260930620000), misma causa, mismo fix.
--
--  Sin exclusión, un contable_libro_mayor(tenant, desde, hasta) pedido para un rango que incluya
--  la fecha del comprobante APERTURA (siempre el primer día del ejercicio nuevo) contaría ese
--  saldo dos veces: una vez desde la actividad económica real que ya lo generó, y otra vez desde
--  las líneas de apertura que lo reproducen. No hay ninguna prueba de este corte que ejerza este
--  libro específico después de una apertura, pero el defecto es real y sistémico — mismo
--  criterio que CO-5, corregido antes de que alguien lo encuentre en producción.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_libro_mayor(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date,
  p_cuenta_id uuid default null
)
returns table (
  cuenta_id          uuid,
  cuenta_codigo      text,
  cuenta_nombre      text,
  naturaleza         public.contable_naturaleza_t,
  saldo_inicial      numeric,
  movimiento_debito  numeric,
  movimiento_credito numeric,
  saldo_final        numeric
)
language sql
stable
set search_path = ''
as $$
  with movs as (
    select
      d.cuenta_id,
      sum(d.debito)  filter (where c.fecha < p_desde)                    as debito_antes,
      sum(d.credito) filter (where c.fecha < p_desde)                    as credito_antes,
      sum(d.debito)  filter (where c.fecha between p_desde and p_hasta)  as debito_periodo,
      sum(d.credito) filter (where c.fecha between p_desde and p_hasta)  as credito_periodo
    from public.contable_comprobante_detalle d
    join public.contable_comprobante c on c.id = d.comprobante_id
    where c.tenant_id = p_tenant_id
      and c.numero is not null
      and c.fecha <= p_hasta
      -- CO-6: 'apertura_ejercicio' reproduce un saldo que la actividad real ya generó; contarlo
      -- también lo duplicaría (mismo defecto y mismo fix que contable_estado_financiero, CO-5).
      and coalesce(c.origen_evento, '') <> 'apertura_ejercicio'
      and (p_cuenta_id is null or d.cuenta_id = p_cuenta_id)
    group by d.cuenta_id
  )
  select
    cc.id,
    cc.codigo,
    cc.nombre,
    cc.naturaleza,
    case cc.naturaleza
      when 'debito' then coalesce(m.debito_antes, 0) - coalesce(m.credito_antes, 0)
      else coalesce(m.credito_antes, 0) - coalesce(m.debito_antes, 0)
    end as saldo_inicial,
    coalesce(m.debito_periodo, 0),
    coalesce(m.credito_periodo, 0),
    case cc.naturaleza
      when 'debito' then coalesce(m.debito_antes, 0) - coalesce(m.credito_antes, 0)
                          + coalesce(m.debito_periodo, 0) - coalesce(m.credito_periodo, 0)
      else coalesce(m.credito_antes, 0) - coalesce(m.debito_antes, 0)
                          + coalesce(m.credito_periodo, 0) - coalesce(m.debito_periodo, 0)
    end as saldo_final
  from movs m
  join public.contable_cuenta cc on cc.id = m.cuenta_id
  order by cc.codigo;
$$;

comment on function public.contable_libro_mayor(uuid, date, date, uuid) is
  'CO-4 §3.2: saldo por cuenta de movimiento. El saldo SIEMPRE se calcula leyendo '
  'contable_cuenta.naturaleza, nunca infiriéndola de la clase. CO-6: excluye comprobantes '
  'origen_evento=''apertura_ejercicio'' de toda suma — reproducen un saldo que la actividad real '
  'ya cuenta, sumarlos también lo duplicaría (mismo defecto que contable_estado_financiero, '
  '20260930620000). Los de origen ''cierre_ejercicio'' sí se suman: reversan a cero por '
  'construcción, sin duplicar nada.';
