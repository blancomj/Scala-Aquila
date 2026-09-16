-- ═══════════════════════════════════════════════════════════════════════
--  RPT-01 · Las tres vistas de reporting de la primera versión
--  (PLAN_MOTOR_REPORTES.md §6, D-136)
--
--  DECISIÓN ESTRUCTURAL DEL MOTOR: una fuente = UNA vista ya aplanada.
--
--  El compilador (fn_reporte_ejecutar) nunca arma un join dinámico: recibe
--  campos, filtros, agrupación y orden, y los aplica sobre UN objeto. Todos
--  los joins de una fuente se resuelven aquí, de una vez, revisados en una
--  migración. Eso hace que el compilador sea trivial de auditar (select
--  <campos> from <vista> where <filtros> group by <...> order by <...>) y
--  que la superficie de ataque quede acotada a lo que estas vistas exponen.
--
--  Las tres llevan `security_invoker = true`: la RLS del usuario aplica
--  sobre las tablas base, sin excepción ni duplicación de la matriz de
--  seguridad (§54 del prompt; mismo patrón que v_cargo_saldo). Cada vista
--  expone tenant_id a propósito — no para filtrar (de eso se encarga la
--  RLS) sino para que el compilador pueda pedirlo cuando lo necesite y
--  para que un `explain` sea legible.
--
--  Ninguna de las tres CALCULA nada de negocio (R-09 / §96-100): la deuda
--  viene ya clasificada por la autoridad de cartera, el pendiente por
--  cargo viene de v_cargo_saldo, y el recaudo es la suma de los pagos tal
--  como se registraron. Lo único que se hace aquí es unir y renombrar.
--
--  Los nombres de tabla se verificaron contra el esquema real, no contra
--  las migraciones de origen: `inmueble_propietario`/`propietarios` fueron
--  generalizados a `inmueble_persona_rol` + `terceros` (rol copropietario),
--  e `inmuebles.tipo` pasó a `tipo_id` → lista_tipos.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Fuente 1 · Cartera por inmueble ────────────────────────────────────
--  Grano: un inmueble por fecha de corte. Sale de
--  posiciones_cartera_snapshot, que ya es el resultado congelado del motor
--  de cartera (con su política y su hash) — reporting no reclasifica nada.
create view public.vr_cartera_inmueble with (security_invoker = true) as
select
  p.tenant_id,
  p.fecha_corte,
  coalesce(ag.nombre, 'Sin agrupar')              as agrupacion,
  coalesce(lt_ag.nombre, 'Sin tipo')              as agrupacion_tipo,
  i.codigo                                        as inmueble,
  coalesce(lt_inm.nombre, 'Sin tipo')             as inmueble_tipo,
  i.estado::text                                  as inmueble_estado,
  -- Un inmueble puede tener varios copropietarios vigentes (porcentajes):
  -- se concatenan en vez de multiplicar la fila, que falsearía los totales.
  coalesce(prop.nombres, 'Sin propietario')       as propietario,
  p.deuda_total,
  p.deuda_capital,
  p.deuda_interes,
  p.deuda_otros,
  p.saldo_credito,
  p.dias_mora_maximo,
  p.cantidad_cargos_vencidos,
  p.fecha_vencimiento_mas_antigua,
  p.clasificacion_codigo                          as clasificacion,
  p.nivel_riesgo::text                            as nivel_riesgo,
  p.etapa_cobranza::text                          as etapa_cobranza
from public.posiciones_cartera_snapshot p
join public.inmuebles i on i.id = p.inmueble_id
left join public.lista_tipos lt_inm on lt_inm.id = i.tipo_id
left join public.agrupaciones ag on ag.id = i.agrupacion_id
left join public.lista_tipos lt_ag on lt_ag.id = ag.tipo_id
left join lateral (
  select string_agg(
    coalesce(
      t.nombre_completo,
      t.razon_social,
      nullif(trim(concat_ws(' ', t.primer_nombre, t.segundo_nombre,
                                 t.primer_apellido, t.segundo_apellido)), '')
    ),
    ', ' order by ipr.porcentaje desc nulls last
  ) as nombres
  from public.inmueble_persona_rol ipr
  join public.terceros t on t.id = ipr.tercero_id
  join public.lista_tipos rol on rol.id = ipr.rol_id
  where ipr.inmueble_id = i.id
    and rol.codigo = 'copropietario'
    -- Vigencia a la fecha de corte, no a hoy: el reporte de un corte
    -- pasado debe decir quién era el propietario entonces.
    and ipr.vigente_desde <= p.fecha_corte
    and (ipr.vigente_hasta is null or ipr.vigente_hasta >= p.fecha_corte)
) prop on true;

comment on view public.vr_cartera_inmueble is
  'Fuente de reporting "Cartera por inmueble" (RPT-01). Lee posiciones_cartera_snapshot tal '
  'cual: la clasificación, el nivel de riesgo y los días de mora ya los produjo el motor de '
  'cartera con su política versionada — reporting no reclasifica ni recalcula (D-136 R-09). '
  'El propietario se concatena en una sola celda a propósito: multiplicar la fila por cada '
  'copropietario duplicaría la deuda en cualquier total. La vigencia del rol se evalúa a la '
  'fecha de corte, no a hoy.';

-- ── Fuente 2 · Cuenta corriente ────────────────────────────────────────
--  Grano: un cargo. El pendiente sale de v_cargo_saldo (que lo deriva de
--  pago_aplicaciones en cada consulta), no de una columna acumulada.
create view public.vr_cuenta_corriente with (security_invoker = true) as
select
  c.tenant_id,
  i.codigo                                   as inmueble,
  coalesce(ag.nombre, 'Sin agrupar')         as agrupacion,
  per.anio                                   as periodo_anio,
  per.mes                                    as periodo_mes,
  to_char(make_date(per.anio, per.mes, 1), 'YYYY-MM') as periodo,
  per.estado::text                           as periodo_estado,
  coalesce(con.codigo, '')                   as concepto_codigo,
  coalesce(con.nombre, c.categoria::text)    as concepto,
  c.categoria::text                          as categoria,
  c.origen_tipo::text                        as origen,
  c.fecha_vencimiento,
  c.created_at::date                         as fecha_cargo,
  c.monto_original,
  c.monto_pendiente,
  c.monto_original - c.monto_pendiente       as monto_pagado,
  -- Días vencidos a hoy. Solo tiene sentido con saldo pendiente: un cargo
  -- saldado no "lleva" días de mora por más que su vencimiento sea viejo.
  case
    when c.monto_pendiente > 0 and c.fecha_vencimiento is not null
      then greatest(0, current_date - c.fecha_vencimiento)
    else 0
  end                                        as dias_vencido,
  (c.monto_pendiente > 0)                    as pendiente
from public.v_cargo_saldo c
join public.inmuebles i on i.id = c.inmueble_id
join public.periodos per on per.id = c.periodo_id
left join public.conceptos con on con.id = c.concepto_id
left join public.agrupaciones ag on ag.id = i.agrupacion_id;

comment on view public.vr_cuenta_corriente is
  'Fuente de reporting "Cuenta corriente" (RPT-01), a grano de cargo. monto_pendiente viene de '
  'v_cargo_saldo, que lo deriva de pago_aplicaciones en cada consulta — no hay saldo acumulado '
  'que pueda quedar desfasado. dias_vencido es 0 cuando el cargo está saldado: un cargo pagado '
  'no acumula mora aunque su vencimiento sea antiguo.';

-- ── Fuente 3 · Recaudos ────────────────────────────────────────────────
--  Grano: un pago. Incluye las reversas, y eso es deliberado: una anulación
--  es una fila con monto exactamente opuesto y pago_original_id apuntando
--  al original (20260903130000), así que SUMAR todo da el recaudo neto.
--  Filtrar las reversas dejaría el original inflado — el error clásico de
--  un reporte de recaudo.
create view public.vr_recaudos with (security_invoker = true) as
select
  pg.tenant_id,
  pg.fecha_pago,
  pg.fecha_registro::date                    as fecha_registro,
  i.codigo                                   as inmueble,
  coalesce(ag.nombre, 'Sin agrupar')         as agrupacion,
  coalesce(lt_fp.nombre, 'Sin forma')        as forma_pago,
  coalesce(pg.referencia, '')                as referencia,
  coalesce(pg.pagador_nombre, '')            as pagador,
  pg.monto,
  coalesce(apl.aplicado, 0)                  as monto_aplicado,
  pg.monto - coalesce(apl.aplicado, 0)       as monto_sin_aplicar,
  (pg.pago_original_id is not null)          as es_anulacion,
  coalesce(pg.anulado_motivo, '')            as anulado_motivo
from public.pagos pg
join public.inmuebles i on i.id = pg.inmueble_id
left join public.agrupaciones ag on ag.id = i.agrupacion_id
left join public.lista_tipos lt_fp on lt_fp.id = pg.forma_pago_id
left join lateral (
  select sum(pa.monto) as aplicado
  from public.pago_aplicaciones pa
  where pa.pago_id = pg.id
) apl on true;

comment on view public.vr_recaudos is
  'Fuente de reporting "Recaudos" (RPT-01), a grano de pago. INCLUYE las reversas a propósito: '
  'una anulación es una fila de monto opuesto (20260903130000), así que la suma de `monto` ya '
  'es el recaudo neto. Excluirlas dejaría contado el pago anulado — por eso la fuente expone '
  'es_anulacion como dimensión para analizar, no como filtro que haya que recordar poner.';
