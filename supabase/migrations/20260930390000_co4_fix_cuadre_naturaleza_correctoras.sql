-- ═══════════════════════════════════════════════════════════════════════
--  CO-4 · fix — contable_libro_inventarios_balances sumaba saldos de
--  clase 1 sin invertir el signo de las correctoras (naturaleza crédito)
--
--  20260930370000 calculaba `activo` como SUM(saldo_final) crudo de todas
--  las cuentas de clase 1, tratándolas como si todas tuvieran la misma
--  naturaleza. Pero 1399 (Deterioro de cartera) es naturaleza crédito
--  DENTRO de clase 1 (correctora) — su saldo_final ya viene positivo en
--  SU propio lado (prueba §5.4, ver contable_libro_mayor), así que sumarlo
--  tal cual al activo lo estaba ADICIONANDO en vez de RESTARLO, rompiendo
--  la ecuación activo = pasivo + patrimonio + resultado (§8) en cuanto
--  hubiera cualquier movimiento real en una correctora. Encontrado por
--  revisión antes de la primera corrida de pruebas.
--
--  Fix: la naturaleza de la FILA (contable_cuenta.naturaleza, nunca
--  inferida) se compara contra la naturaleza de la CUENTA DE CLASE misma
--  (codigo = '1'/'2'/'3', que ya existe como fila propia del plan — mismo
--  principio que contable_balance_prueba usa para resolver cada nivel).
--  Si coinciden, el saldo suma tal cual; si no (una correctora), se resta.
--  El saldo MOSTRADO por cuenta (columna `saldo` del resultado) no cambia
--  — sigue en su propio lado natural, igual que el Mayor — solo cambia
--  cómo se netea para el total de control CUADRE.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_libro_inventarios_balances(
  p_tenant_id   uuid,
  p_fecha_corte date
)
returns table (
  codigo      text,
  nombre      text,
  clase       smallint,
  saldo       numeric,
  cuadra      boolean,
  diferencia  numeric
)
language sql
stable
set search_path = ''
as $$
  with balance as (
    select codigo, nombre, naturaleza, saldo_final
    from public.contable_balance_prueba(p_tenant_id, '0001-01-01'::date, p_fecha_corte, 3::smallint)
  ),
  naturaleza_clase as (
    select codigo, naturaleza
    from public.contable_cuenta
    where tenant_id = p_tenant_id and codigo in ('1', '2', '3')
  ),
  resultado_ejercicio as (
    -- Resultado del ejercicio en curso: ingresos (clase 4) - gastos (clase 5), desde el 1 de
    -- enero del año de p_fecha_corte — CO-6 (cierre) todavía no traslada esto a patrimonio, así
    -- que el libro lo incorpora aquí para que activo = pasivo + patrimonio cuadre (§8) mientras
    -- no exista un asiento de cierre real.
    select
      coalesce(sum(d.credito) filter (where cc.clase = 4), 0)
        - coalesce(sum(d.debito) filter (where cc.clase = 4), 0)
        - coalesce(sum(d.debito) filter (where cc.clase = 5), 0)
        + coalesce(sum(d.credito) filter (where cc.clase = 5), 0) as resultado
    from public.contable_comprobante_detalle d
    join public.contable_comprobante c on c.id = d.comprobante_id
    join public.contable_cuenta cc on cc.id = d.cuenta_id
    where c.tenant_id = p_tenant_id
      and c.numero is not null
      and cc.clase in (4, 5)
      and c.fecha between make_date(extract(year from p_fecha_corte)::int, 1, 1) and p_fecha_corte
  ),
  filas as (
    select
      b.codigo, b.nombre, left(b.codigo, 1)::smallint as clase, b.saldo_final as saldo,
      case when b.naturaleza = nc.naturaleza then b.saldo_final else -b.saldo_final end as saldo_neto
    from balance b
    join naturaleza_clase nc on nc.codigo = left(b.codigo, 1)
    where left(b.codigo, 1) in ('1', '2', '3')
  ),
  totales as (
    select
      coalesce(sum(saldo_neto) filter (where clase = 1), 0) as activo,
      coalesce(sum(saldo_neto) filter (where clase = 2), 0) as pasivo,
      coalesce(sum(saldo_neto) filter (where clase = 3), 0) as patrimonio
    from filas
  )
  select
    f.codigo, f.nombre, f.clase, f.saldo,
    true as cuadra,
    0::numeric as diferencia
  from filas f
  union all
  select
    'CUADRE', 'Activo = Pasivo + Patrimonio + Resultado del ejercicio', null::smallint,
    t.activo,
    (t.activo = t.pasivo + t.patrimonio + r.resultado),
    t.activo - (t.pasivo + t.patrimonio + r.resultado)
  from totales t cross join resultado_ejercicio r;
$$;

comment on function public.contable_libro_inventarios_balances(uuid, date) is
  'CO-4 §3.4/§8: detalle de saldos de las cuentas de balance (clases 1/2/3) a nivel 3 (cuenta), '
  'más una fila de control CUADRE que verifica activo = pasivo + patrimonio + resultado del '
  'ejercicio. El saldo por cuenta se muestra en su propio lado natural (naturaleza propia, '
  'nunca inferida); el total de cada clase para el CUADRE neta correctamente las correctoras '
  '(1399/1592/1698: naturaleza crédito dentro de clase 1) comparando la naturaleza de cada fila '
  'contra la naturaleza de la cuenta de clase misma (codigo=1/2/3), no asumiendo que toda la '
  'clase comparte una sola naturaleza. El desglose de 13xx (cartera) lo aporta '
  'contable_conciliacion_cartera y el de 15xx (PP&E) mant_ppe_por_activo (MANT-0) — este libro '
  'no recalcula ninguno de los dos.';
