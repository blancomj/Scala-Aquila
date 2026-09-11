-- ═══════════════════════════════════════════════════════════════════════
--  MANT-8 · Indicadores y tendencias de mantenimiento (4/4)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_08_indicadores_tendencias.md §3.3
--
--  Detección de PATRONES, no predicción: comparación de ventanas consecutivas,
--  nunca regresión ni ningún modelo estadístico (decisión vinculante §2/§4).
--  datos_insuficientes es un resultado de primera clase, no un error.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_tendencia_fallas(
  p_tenant_id uuid, p_activo_id uuid, p_ventanas int,
  p_dias_ventana int default 90, p_umbral_observaciones int default 3
)
returns table (
  ventana int, desde date, hasta date, fallas int, costo numeric, mttr_horas numeric,
  variacion_pct numeric, tendencia text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoy date := current_date;
  v_fallas int[];
  v_costo numeric[];
  v_mttr numeric[];
  v_desde date[];
  v_hasta date[];
  v_total int := 0;
  i int;
  v_variacion numeric;
  v_tendencia text;
begin
  if p_ventanas < 2 then
    raise exception 'TENDENCIA_VENTANAS_INSUFICIENTES: p_ventanas % debe ser >= 2 para comparar ventanas consecutivas',
      p_ventanas;
  end if;
  if p_dias_ventana < 1 then
    raise exception 'TENDENCIA_DIAS_VENTANA_INVALIDO: p_dias_ventana % debe ser >= 1', p_dias_ventana;
  end if;

  for i in 1..p_ventanas loop
    v_hasta[i] := v_hoy - ((i - 1) * p_dias_ventana);
    v_desde[i] := v_hoy - (i * p_dias_ventana) + 1;

    v_fallas[i] := (
      select count(*)
      from public.mant_incidencias
      where tenant_id = p_tenant_id
        and activo_id = p_activo_id
        and estado <> 'descartada'
        and reportada_at::date between v_desde[i] and v_hasta[i]
    );

    v_costo[i] := (
      select coalesce(sum(mc.monto), 0)
      from public.mant_costos(p_tenant_id, v_desde[i], v_hasta[i]) mc
      where mc.activo_id = p_activo_id
    );

    v_mttr[i] := (
      select mi.mttr_horas
      from public.mant_indicador_mttr(p_tenant_id, v_desde[i], v_hasta[i], p_activo_id) mi
    );

    v_total := v_total + v_fallas[i];
  end loop;

  for i in 1..p_ventanas loop
    if v_total < p_umbral_observaciones then
      v_tendencia := 'datos_insuficientes';
      v_variacion := null;
    elsif i = p_ventanas then
      -- Ventana más antigua de la serie: no tiene ventana anterior contra la cual comparar.
      v_tendencia := null;
      v_variacion := null;
    elsif v_fallas[i + 1] = 0 then
      v_variacion := null;
      v_tendencia := case when v_fallas[i] > 0 then 'creciente' else 'estable' end;
    else
      v_variacion := round((v_fallas[i] - v_fallas[i + 1])::numeric / v_fallas[i + 1] * 100, 1);
      v_tendencia := case
        when v_variacion > 20 then 'creciente'
        when v_variacion < -20 then 'decreciente'
        else 'estable'
      end;
    end if;

    ventana := i;
    desde := v_desde[i];
    hasta := v_hasta[i];
    fallas := v_fallas[i];
    costo := v_costo[i];
    mttr_horas := v_mttr[i];
    variacion_pct := v_variacion;
    tendencia := v_tendencia;
    return next;
  end loop;
end;
$$;

comment on function public.mant_tendencia_fallas(uuid, uuid, int, int, int) is
  'MANT-8 §3.3: compara CADA ventana de p_dias_ventana días (default 90) contra la ventana '
  'inmediatamente anterior — nunca regresión ni modelo estadístico. ventana 1 = más reciente. '
  'tendencia es ''datos_insuficientes'' (resultado de primera clase, no error) si el TOTAL de '
  'fallas de toda la serie es menor que p_umbral_observaciones (default 3, conservador); '
  '''creciente''/''decreciente'' si la variación entre ventana y su anterior supera ±20%%, si no '
  '''estable''. La última ventana de la serie no tiene tendencia (no hay ventana anterior con qué '
  'compararla). TENDENCIA_VENTANAS_INSUFICIENTES si p_ventanas < 2.';
