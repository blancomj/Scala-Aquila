-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (7/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.4
--
--  mant_proyeccion() devuelve los COMPONENTES (una fila por concepto,
--  nunca un total propio) — la comparación contra el presupuesto aprobado
--  la hace la UI reutilizando mant_indicador_financiero_presupuesto
--  (MANT-8/9, passthrough de presupuesto_cuenta_ejecucion), nunca un
--  segundo camino de lectura de presupuesto_rubros (regla dura del §3.4:
--  "nunca de un total propio").
--
--  Repuestos NO es un componente aparte, a propósito: su consumo ya viaja
--  dentro de preventivo/correctivo porque se contabiliza en
--  presupuesto_ejecucion vía la OT que lo consume (MANT-6) — contarlo
--  aparte duplicaría.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_proyeccion(p_tenant_id uuid, p_anio integer)
returns table (
  componente text, monto numeric, metodo text, datos_insuficientes boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_anio_inicio date := make_date(p_anio, 1, 1);
  v_anio_fin date := make_date(p_anio, 12, 31);
  v_hist_desde date := (current_date - interval '1 year')::date;
  v_preventivo numeric;
  v_costo_promedio_preventivo numeric;
  v_ocurrencias_esperadas numeric;
  v_contratos numeric;
  v_correctivo numeric;
  v_meses_historia int;
  v_renovaciones numeric;
begin
  -- ── Preventivo planificado: ocurrencias esperadas del año × costo promedio histórico
  -- de una OT preventiva (mant_costos agrupado por tipo_mantenimiento). ──
  select coalesce(sum(12.0 / p.frecuencia_meses), 0) into v_ocurrencias_esperadas
    from public.mant_planes p
   where p.tenant_id = p_tenant_id and p.activo
     and (p.vigente_hasta is null or p.vigente_hasta >= v_anio_inicio);

  select case when count(*) = 0 then null else avg(x.monto) end into v_costo_promedio_preventivo
    from (
      select mc.monto
      from public.mant_costos(p_tenant_id, v_hist_desde, current_date) mc
      join public.lista_tipos lt on lt.id = mc.tipo_mantenimiento_id
      where lt.codigo = 'preventivo'
    ) x;

  v_preventivo := round(v_ocurrencias_esperadas * coalesce(v_costo_promedio_preventivo, 0), 2);

  componente := 'Preventivo planificado';
  monto := v_preventivo;
  metodo := 'Ocurrencias esperadas del año (Σ 12/frecuencia_meses de planes activos: '
    || round(v_ocurrencias_esperadas, 1) || ') × costo promedio histórico de una OT preventiva '
    || '(mant_costos, últimos 12 meses).';
  datos_insuficientes := v_costo_promedio_preventivo is null;
  return next;

  -- ── Contratos vigentes: valor_periodico × ocurrencias/año según periodicidad ──
  select coalesce(sum(
    c.valor_periodico * case pl.codigo
      when 'mensual' then 12 when 'bimestral' then 6 when 'trimestral' then 4
      when 'semestral' then 2 when 'anual' then 1 else 0
    end
  ), 0) into v_contratos
    from public.mant_contratos c
    left join public.lista_tipos pl on pl.id = c.periodicidad_id
   where c.tenant_id = p_tenant_id
     and c.estado in ('vigente', 'suspendido')
     and c.valor_periodico is not null
     and c.fecha_inicio <= v_anio_fin
     and (c.fecha_fin is null or c.fecha_fin >= v_anio_inicio);

  componente := 'Contratos vigentes';
  monto := round(v_contratos, 2);
  metodo := 'Σ valor_periodico × ocurrencias/año de la periodicidad de cada contrato vigente o '
    'suspendido con vigencia que toca ' || p_anio || '. Pagos "pago único" no se cuentan aquí.';
  datos_insuficientes := false;
  return next;

  -- ── Correctivo esperado: promedio histórico anual — datos_insuficientes si hay menos de
  -- 12 meses de historia real (ninguna incidencia/OT correctiva registrada hace más de un
  -- año), en vez de inventar un número sobre una muestra corta. ──
  select extract(year from age(current_date, min(reportada_at)))::int * 12
       + extract(month from age(current_date, min(reportada_at)))::int
    into v_meses_historia
    from public.mant_incidencias
   where tenant_id = p_tenant_id and estado <> 'descartada';

  select coalesce(sum(mc.monto), 0) into v_correctivo
    from public.mant_costos(p_tenant_id, v_hist_desde, current_date) mc
    join public.lista_tipos lt on lt.id = mc.tipo_mantenimiento_id
   where lt.codigo = 'correctivo';

  componente := 'Correctivo esperado';
  datos_insuficientes := coalesce(v_meses_historia, 0) < 12;
  monto := case when datos_insuficientes then null else round(v_correctivo, 2) end;
  metodo := 'Promedio del costo correctivo real de los últimos 12 meses (mant_costos, tipo '
    || 'correctivo) — se declara datos_insuficientes si el tenant tiene menos de 12 meses de '
    || 'historial de incidencias, en vez de proyectar sobre una muestra corta.';
  return next;

  -- ── Renovaciones: solo escenarios tipo=reemplazar YA DECIDIDOS (decision_id no nulo) con
  -- resultado evaluado, cuyo total cae dentro del año — nunca una proyección automática de
  -- qué se va a reemplazar (fuera de alcance del corte, §4). ──
  select coalesce(sum((e.resultado ->> 'total')::numeric), 0) into v_renovaciones
    from public.mant_escenario e
   where e.tenant_id = p_tenant_id
     and e.tipo = 'reemplazar'
     and e.decision_id is not null
     and e.resultado is not null
     and e.evaluado_at between v_anio_inicio::timestamptz and (v_anio_fin + 1)::timestamptz;

  componente := 'Renovaciones decididas';
  monto := round(v_renovaciones, 2);
  metodo := 'Σ total de escenarios tipo=reemplazar con una decisión de gobierno asociada '
    '(decision_id), evaluados dentro de ' || p_anio || '. Nunca una proyección automática de qué '
    'activo se va a reemplazar.';
  datos_insuficientes := false;
  return next;
end;
$$;

comment on function public.mant_proyeccion(uuid, integer) is
  'MANT-9 §3.4: componentes de la proyección de mantenimiento del año — preventivo planificado, '
  'contratos vigentes, correctivo esperado (datos_insuficientes si hay menos de 12 meses de '
  'historial), renovaciones ya decididas. Repuestos no es un componente aparte (ya viaja dentro '
  'de preventivo/correctivo vía presupuesto_ejecucion, MANT-6 — contarlo aparte duplicaría). La '
  'comparación contra el presupuesto aprobado la hace la UI con '
  'mant_indicador_financiero_presupuesto (MANT-8/9) — nunca un total propio, regla dura del §3.4.';
