-- ═══════════════════════════════════════════════════════════════════════
--  PC-5b · El diagnóstico deja de ser una heurística
--
--  La primera corrida de contable_movimientos() sobre datos reales cuadró
--  (débito = crédito, diferencia 0) pero dejó 2 líneas sin cuenta contable,
--  con contable_parametrizacion_pendiente() reportando CERO pendientes. El
--  reporte que existe justamente para que nada falle en silencio estaba
--  fallando en silencio.
--
--  Las dos causas, ambas por el lado del ingreso de un cargo:
--
--    1. Un cargo cuyo concepto está ARCHIVADO y sin cuenta presupuestal. El
--       diagnóstico solo miraba conceptos en estado 'activo', porque su
--       pregunta era "¿qué falta configurar para operar?". Pero un concepto
--       archivado que ya emitió cargos sigue teniendo que explicarse
--       contablemente: el cargo existe y hay que exportarlo.
--    2. Un cargo de novedad cuyo motivo (lista_tipos TIPO_NOVEDAD) no está
--       en el mapa novedad_tipo_cuenta. El diagnóstico ni siquiera miraba
--       esa tabla.
--
--  La corrección de fondo no es agregar dos consultas más al mismo estilo,
--  sino cambiar la pregunta: en vez de enumerar catálogos que "deberían"
--  estar configurados, se pregunta por lo que la proyección REALMENTE no
--  puede resolver — los cargos ya emitidos cuya cuenta de ingreso sale
--  NULL. Ese criterio es el mismo coalesce que usa contable_movimientos(),
--  así que el diagnóstico y la proyección no pueden volver a divergir.
--
--  Se reporta agrupado por concepto o por motivo de novedad, no cargo por
--  cargo: lo accionable es "configura este motivo", no "estos 400 cargos".
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
  'usa contable_movimientos() para que diagnóstico y proyección no puedan divergir. Debe quedar '
  'vacío antes de exportar; contable_cuadre() lo confirma con sin_cuenta = 0.';
