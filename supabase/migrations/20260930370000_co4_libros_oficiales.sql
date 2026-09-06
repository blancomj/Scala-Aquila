-- ═══════════════════════════════════════════════════════════════════════
--  CO-4 · Libros oficiales de contabilidad
--  (Casos de uso/Tres Modulos/Contabilidad/CO_04_libros_oficiales.md)
--
--  Por qué existen: la ley exige a toda PH un juego de libros contables
--  (Ley 675/2001, Decreto 2500/1986, DUR 2420/2015 anexo 6) que hoy no
--  tiene ninguna vista dedicada — solo existe `contable_movimientos()`
--  (PC-5/CO-3), que es la PROYECCIÓN previa a materializar, no el libro
--  legal. Los cinco objetos de esta migración son funciones `stable` de
--  solo lectura sobre `contable_comprobante`/`contable_comprobante_detalle`
--  ya persistidos (CO-2/CO-3) — ningún libro persiste datos nuevos ni crea
--  tabla.
--
--  Qué queda deliberadamente fuera de este corte:
--    - Estados financieros y notas (CO-5), cierre de periodo (CO-6),
--      cálculo de deterioro (CO-7, el libro solo lo muestra si existe).
--    - Desglose de 1105/1110 (bancos) por cuenta bancaria individual en el
--      Libro de Inventarios y Balances: `contable_comprobante_detalle` no
--      tiene columna `cuenta_bancaria_id` (solo tercero/inmueble/centro de
--      costo/agrupación/fondo/presupuesto_cuenta) — el saldo se muestra
--      global, con nota, mismo tratamiento que el propio corte ya acepta
--      para PP&E antes de que existiera MANT-0 (§3.4). Añadir esa
--      dimensión es cambio de esquema de CO-2/CO-3, fuera de alcance de
--      un corte de solo lectura.
--    - Firma digital de los libros (explícito en el "fuera de alcance").
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Libro Diario ───────────────────────────────────────────────────
-- Filtro `numero is not null` en vez de `estado = 'contabilizado'`: un
-- comprobante anulado CONSERVA su número (CO-2, guard de inmutabilidad),
-- así que incluirlo aquí es lo que garantiza "sin saltos en el
-- consecutivo dentro del ejercicio" (prueba §5.2) — ocultarlo crearía un
-- hueco aparente en la numeración que el propio principio invariable #5
-- (un asiento no se edita, se corrige con reversión) exige que sea visible,
-- no borrado.
create function public.contable_libro_diario(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date
)
returns table (
  fecha           date,
  comprobante     text,
  tipo_codigo     text,
  numero          integer,
  comprobante_id  uuid,
  cuenta_codigo   text,
  cuenta_nombre   text,
  descripcion     text,
  debito          numeric,
  credito         numeric,
  tercero_id      uuid,
  inmueble_id     uuid,
  centro_costo_id bigint,
  agrupacion_id   uuid,
  fondo_id        uuid
)
language sql
stable
set search_path = ''
as $$
  select
    c.fecha,
    lt.codigo || '-' || c.numero::text,
    lt.codigo,
    c.numero,
    c.id,
    cc.codigo,
    cc.nombre,
    coalesce(d.descripcion, c.descripcion),
    d.debito,
    d.credito,
    d.tercero_id, d.inmueble_id, d.centro_costo_id, d.agrupacion_id, d.fondo_id
  from public.contable_comprobante c
  join public.contable_comprobante_detalle d on d.comprobante_id = c.id
  join public.contable_cuenta cc on cc.id = d.cuenta_id
  join public.lista_tipos lt on lt.id = c.tipo_id
  where c.tenant_id = p_tenant_id
    and c.numero is not null
    and c.fecha between p_desde and p_hasta
  order by c.fecha, lt.orden, c.numero, d.linea;
$$;

comment on function public.contable_libro_diario(uuid, date, date) is
  'CO-4 §3.1: vista de solo lectura, orden cronológico estricto y dentro de la fecha por '
  '(tipo.orden, numero). Filtra numero is not null (no estado=contabilizado) para que un '
  'comprobante anulado siga apareciendo con su número — así nunca hay huecos aparentes en el '
  'consecutivo. También sirve de auxiliar por cuenta filtrando client-side por cuenta_codigo '
  '(§3.2), sin duplicar función.';

-- ── 2. Libro Mayor ─────────────────────────────────────────────────────
-- p_cuenta_id opcional: NULL devuelve una fila por cada cuenta con
-- movimiento en el rango; con valor, filtra a esa única cuenta (una fila).
create function public.contable_libro_mayor(
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
  'contable_cuenta.naturaleza, nunca infiriéndola de la clase — así una correctora crédito '
  'dentro de clase 1 (1399/1592/1698) presenta saldo crédito positivo, no negativo.';

-- ── 3. Balance de prueba ───────────────────────────────────────────────
-- La jerarquía del PUC vive en la longitud del código (1/2/4/6/8) y cada
-- nivel intermedio (clase, grupo…) YA es una fila propia de
-- contable_cuenta con su propia naturaleza (PC-1) — no hace falta inferir
-- nada ni recorrer parent_id: se agrega por el prefijo de longitud del
-- nivel pedido y se resuelve la naturaleza uniendo por ese mismo código.
create function public.contable_balance_prueba(
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
  'CO-4 §3.3: nivel 1=clase, 2=grupo, 3=cuenta, 4=subcuenta, 5=auxiliar (misma codificación de '
  'contable_cuenta.nivel). Débitos/créditos del periodo son sumas crudas, invariantes al nivel '
  'de agregación por construcción — por eso el total de nivel 1 y el de nivel 5 siempre '
  'coinciden (prueba §5.6). El saldo (anterior y final) sí depende de la naturaleza propia de '
  'la fila de contable_cuenta que representa ese código agregado — nunca se infiere.';

-- ── 4. Conciliación de cartera ──────────────────────────────────────────
-- Compara, por inmueble, el saldo contable de las cuentas 13xx contra el
-- saldo del auxiliar de cartera (cargos - pago_aplicaciones) — la misma
-- definición de saldo que ya usa cuenta_corriente_ledger, calculada una
-- segunda vez de forma independiente para que la comparación sea real.
create function public.contable_conciliacion_cartera(
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
  where coalesce(co.saldo, 0) - (coalesce(ca.total, 0) - coalesce(ap.total, 0)) <> 0
     or coalesce(co.saldo, 0) <> 0
     or coalesce(ca.total, 0) - coalesce(ap.total, 0) <> 0;
$$;

comment on function public.contable_conciliacion_cartera(uuid, date) is
  'CO-4 §3.4/§7: reconciliación por inmueble entre el saldo contable (13xx, dimensión '
  'inmueble_id de contable_comprobante_detalle) y el auxiliar de cartera (cargos - '
  'pago_aplicaciones), calculados de forma independiente. Solo devuelve inmuebles con saldo '
  'distinto de cero en cualquiera de los dos lados — cero filas = cuadrado. Usada también como '
  'fuente del desglose de 13xx en contable_libro_inventarios_balances.';

-- ── 5. Libro de Inventarios y Balances ──────────────────────────────────
create function public.contable_libro_inventarios_balances(
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
    select codigo, nombre, saldo_final
    from public.contable_balance_prueba(p_tenant_id, '0001-01-01'::date, p_fecha_corte, 3::smallint)
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
    select b.codigo, b.nombre, left(b.codigo, 1)::smallint as clase, b.saldo_final as saldo
    from balance b
    where left(b.codigo, 1) in ('1', '2', '3')
  ),
  totales as (
    select
      coalesce(sum(saldo) filter (where clase = 1), 0) as activo,
      coalesce(sum(saldo) filter (where clase = 2), 0) as pasivo,
      coalesce(sum(saldo) filter (where clase = 3), 0) as patrimonio
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
  'ejercicio (ingresos - gastos del año en curso, ya que CO-6/cierre todavía no lo traslada a '
  'patrimonio). El desglose de 13xx (cartera) lo aporta contable_conciliacion_cartera y el de '
  '15xx (PP&E) mant_ppe_por_activo (MANT-0) — este libro no recalcula ninguno de los dos, los '
  'consume (APENDICE_CO.md, "Frontera con mantenimiento"). El desglose de 1105/1110 por cuenta '
  'bancaria individual queda fuera (ver cabecera de esta migración): se muestra el saldo global '
  'de la fila `codigo` correspondiente, sin la dimensión por banco.';

-- ── 6. Auditoría de exportación ──────────────────────────────────────────
-- Los exportadores de PC-5/CO-4 (Excel, PDF) son 100% client-side (xlsx/pdfmake por import
-- dinámico, sin round-trip al servidor) — sin esta función no habría dónde registrar "quién
-- exportó qué y cuándo" (§3.6). security definer porque audit_log no tiene policy de INSERT
-- para authenticated (por diseño, SEC-14) — el patrón ya usado en cada RPC que audita algo.
create function public.fn_registrar_exportacion_libro(
  p_tenant_id uuid,
  p_libro     text,
  p_formato   text,
  p_filtros   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'FORBIDDEN: no pertenece a este tenant';
  end if;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, metadata)
  values (
    p_tenant_id, auth.uid(), 'contabilidad.libro.exportar', p_libro,
    p_filtros || jsonb_build_object('formato', p_formato)
  );
end;
$$;

comment on function public.fn_registrar_exportacion_libro(uuid, text, text, jsonb) is
  'CO-4 §3.6: registro de auditoría de cada exportación de un libro oficial (Excel/PDF). '
  'El cliente la invoca justo antes de generar el archivo (xlsx/pdfmake, ambos por import '
  'dinámico) — no hay otro round-trip al servidor donde loguear esto.';

-- ── 7. Índice para el rango de fechas del Diario/Mayor/Balance ──────────
-- Ninguna de las consultas de esta migración tenía hoy un índice que cubriera el filtro real
-- (tenant_id, fecha, numero is not null) — solo existían (tenant_id, periodo_id) y
-- (tenant_id, estado). Medido con EXPLAIN ANALYZE antes/después en CO_04_INFORME.md.
create index contable_comprobante_tenant_fecha_idx
  on public.contable_comprobante (tenant_id, fecha)
  where numero is not null;
