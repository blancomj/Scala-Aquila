-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Fix: contable_parametrizacion_pendiente() nunca aprendió la
--  resolución especial de FONDO_IMPREVISTOS que contable_movimientos() ya
--  tiene desde el BLOQUE K (20260929180000) — un cargo de ese concepto
--  siempre tiene presupuesto_cuenta_id NULL a propósito (su cuenta de
--  ingreso la resuelve el evento contable INGRESO_FONDO_IMPREVISTOS, no el
--  árbol presupuestal), pero el ámbito 'cargo_sin_cuenta_ingreso' no conocía
--  esa excepción y lo reportaba como pendiente igual que un concepto
--  realmente mal configurado — bloqueando fn_contabilizar_periodo con
--  CONTABLE_PARAMETRIZACION_PENDIENTE para cualquier tenant que use el
--  circuito de cobro del fondo (encontrado al construir el fixture de
--  tests/contabilidad/estados-financieros.test.ts, CO-5, antes de que
--  ningún test previo hubiera materializado un cargo de este concepto).
--
--  Mismo criterio que la excepción ya existente para categoria='interes'
--  (que tampoco pasa por concepto/novedad, sino por el evento predeterminado
--  INGRESO_INTERES_MORA) — se añade la misma excepción para el codigo
--  reservado 'FONDO_IMPREVISTOS'.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.contable_parametrizacion_pendiente(p_tenant_id uuid)
returns table (ambito text, referencia text, detalle text)
language sql
stable
set search_path = ''
as $$
  -- ── configuración que falta (preventivo) ──
  select 'cuenta_presupuestal', pc.codigo, pc.nombre
  from public.presupuesto_cuenta pc
  where pc.tenant_id = p_tenant_id
    and pc.es_hoja and pc.activa and pc.contable_cuenta_id is null
  union all
  select 'evento_contable', lt.codigo, lt.nombre
  from public.lista_tipos lt
  where lt.tipo = 'EVENTO_CONTABLE'
    and (lt.tenant_id is null or lt.tenant_id = p_tenant_id)
    and lt.activo
    and not exists (
      select 1 from public.contable_cuenta_default d
      where d.tenant_id = p_tenant_id and d.evento_id = lt.id
    )
  union all
  select 'fondo', f.nombre, 'sin cuenta de efectivo restringido asociada'
  from public.fondos f
  where f.tenant_id = p_tenant_id and f.contable_cuenta_id is null
  union all
  select 'cuenta_bancaria', cb.numero_cuenta, 'sin cuenta contable asociada'
  from public.cuentas_bancarias cb
  where cb.tenant_id = p_tenant_id and cb.activa and cb.contable_cuenta_id is null
  union all
  select 'concepto', c.codigo, 'concepto activo sin cuenta presupuestal de ingreso'
  from public.conceptos c
  where c.tenant_id = p_tenant_id
    and c.estado = 'activo' and c.presupuesto_cuenta_id is null
    -- BLOQUE K: FONDO_IMPREVISTOS nunca tiene (ni necesita) presupuesto_cuenta_id propio —
    -- su cuenta de ingreso es el evento predeterminado INGRESO_FONDO_IMPREVISTOS, igual que
    -- el concepto no pasa por el árbol presupuestal en contable_movimientos().
    and c.codigo <> 'FONDO_IMPREVISTOS'

  -- ── movimientos ya emitidos que la proyección no puede resolver (detectivo) ──
  union all
  select
    'cargo_sin_cuenta_ingreso',
    coalesce(lt.nombre, co.codigo, 'sin concepto ni motivo'),
    count(*)::text || ' cargo(s) por ' || sum(c.monto_original)::text
      || ' sin cuenta de ingreso — '
      || case
           when c.novedad_id is not null
             then 'asigna el motivo en Configuración › Motivos de novedad'
           else 'asigna la cuenta presupuestal del concepto'
         end
  from public.cargos c
  left join public.conceptos co on co.id = c.concepto_id
  left join public.novedades n on n.id = c.novedad_id
  left join public.lista_tipos lt on lt.id = n.tipo_novedad_id
  where c.tenant_id = p_tenant_id
    -- Mismo coalesce que contable_movimientos(): concepto primero, novedad después.
    and coalesce(co.presupuesto_cuenta_id, n.presupuesto_cuenta_id) is null
    -- Los intereses no pasan por concepto ni novedad: su cuenta es el evento predeterminado
    -- INGRESO_INTERES_MORA, cuya ausencia ya reporta el ámbito 'evento_contable'.
    and c.categoria <> 'interes'
    -- BLOQUE K (D-38, fix CO-5): FONDO_IMPREVISTOS resuelve contra
    -- CARTERA_FONDO_IMPREVISTOS/INGRESO_FONDO_IMPREVISTOS (evento predeterminado), nunca contra
    -- presupuesto_cuenta_id — mismo motivo que la excepción de interés, mismo criterio.
    and coalesce(co.codigo, '') <> 'FONDO_IMPREVISTOS'
  group by lt.nombre, co.codigo, (c.novedad_id is not null)

  union all
  select
    'movimiento_sin_contrapartida',
    pe.id::text,
    coalesce(pe.descripcion, 'movimiento del ' || pe.created_at::date::text)
  from public.presupuesto_ejecucion pe
  where pe.tenant_id = p_tenant_id and pe.liquidacion is null;
$$;

comment on function public.contable_parametrizacion_pendiente(uuid) is
  'Lista todo lo que impide que una copropiedad emita información contable. Combina lo '
  'preventivo (catálogos sin configurar: cuentas presupuestales sin mapear, eventos sin cuenta '
  'predeterminada, fondos, cuentas bancarias, conceptos activos) con lo detectivo (PC-5b): '
  'cargos YA emitidos cuya cuenta de ingreso no resuelve, evaluados con el mismo criterio que '
  'usa contable_movimientos() para que diagnóstico y proyección no puedan divergir — incluida la '
  'resolución especial de FONDO_IMPREVISTOS (BLOQUE K) y de interés (evento predeterminado), '
  'ninguna de las dos pasa por presupuesto_cuenta_id. Debe quedar vacío antes de exportar; '
  'contable_cuadre() lo confirma con sin_cuenta = 0.';
