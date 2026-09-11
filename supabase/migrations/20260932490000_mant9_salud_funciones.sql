-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (5/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md §3.1/§3.2
--
--  mant_salud() SIEMPRE calcula en vivo con el set VIGENTE — el snapshot
--  (migración anterior) es la única foto congelada. mant_salud_explicacion
--  llama a mant_salud() dos veces (p_desde/p_hasta) y diffea el desglose —
--  no depende de que existan snapshots en ambas fechas.
--
--  Factor sin dato disponible (ningún dato en la ventana, ej. un activo
--  sin ninguna inspección todavía): su contribución es null y se EXCLUYE
--  del índice, que se renormaliza sobre el peso efectivamente disponible
--  (índice = Σcontribución_disponible / Σpeso_disponible × 100) — nunca
--  arrastra el índice a 0 por un factor sin dato, ni lo infla a 100.
--  Si NINGÚN factor tiene dato, el índice es null (dato insuficiente, no
--  un número inventado).
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_salud_aplicar_escala(p_valor numeric, p_escala jsonb)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select (tramo ->> 'puntaje')::numeric
  from jsonb_array_elements(p_escala) as tramo
  where p_valor <= (tramo ->> 'hasta')::numeric or tramo ->> 'hasta' is null
  order by (tramo ->> 'hasta') is null, (tramo ->> 'hasta')::numeric asc
  limit 1;
$$;

comment on function public.mant_salud_aplicar_escala(numeric, jsonb) is
  'MANT-9 §3.1: traduce un dato crudo a puntaje 0-100 según los tramos de mant_salud_factor.escala '
  '(ordenados por "hasta" ascendente, null = sin techo) — DSL mínima sin motor de expresiones '
  'genérico, mismo criterio que las fórmulas de contable_estado_linea (CO-5).';

create function public.mant_salud(p_tenant_id uuid, p_activo_id uuid, p_fecha date default current_date)
returns table (indice numeric, set_id uuid, version int, desglose jsonb)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_set record;
  v_factor record;
  v_desde date;
  v_raw numeric;
  v_puntaje numeric;
  v_desglose jsonb := '[]'::jsonb;
  v_suma_contribucion numeric := 0;
  v_suma_peso numeric := 0;
begin
  select * into v_set from public.mant_salud_set
    where tenant_id = p_tenant_id and estado = 'vigente';

  if v_set.id is null then
    indice := null; set_id := null; version := null; desglose := '[]'::jsonb;
    return next;
    return;
  end if;

  for v_factor in
    select f.*, lt.codigo as fuente_codigo
    from public.mant_salud_factor f
    join public.lista_tipos lt on lt.id = f.fuente_id
    where f.set_id = v_set.id
    order by f.codigo
  loop
    v_desde := p_fecha - v_factor.ventana_dias;
    v_raw := null;

    case v_factor.fuente_codigo
      when 'mttr' then
        select i.mttr_horas into v_raw
        from public.mant_indicador_mttr(p_tenant_id, v_desde, p_fecha, p_activo_id) i;
      when 'mtbf' then
        select i.mtbf_horas into v_raw
        from public.mant_indicador_mtbf(p_tenant_id, p_activo_id, v_desde, p_fecha) i;
      when 'disponibilidad' then
        select i.disponibilidad_pct into v_raw
        from public.mant_indicador_disponibilidad(p_tenant_id, p_activo_id, v_desde, p_fecha) i;
      when 'cumplimiento_plan' then
        select i.pct into v_raw
        from public.mant_indicador_cumplimiento_plan(p_tenant_id, v_desde, p_fecha, p_activo_id) i;
      when 'ot_a_tiempo' then
        select i.pct into v_raw
        from public.mant_indicador_ot_a_tiempo(p_tenant_id, v_desde, p_fecha, p_activo_id) i;
      when 'costo' then
        select coalesce(sum(c.monto), 0) into v_raw
        from public.mant_costos(p_tenant_id, v_desde, p_fecha) c
        where c.activo_id = p_activo_id;
      when 'criticidad' then
        select c.puntaje_total into v_raw from public.mant_criticidad(p_activo_id) c;
      when 'cumplimiento_normativo' then
        select case when count(*) = 0 then null
                 else round(100.0 * count(*) filter (where e.estado = 'al_dia') / count(*), 1)
               end into v_raw
        from public.mant_estado_cumplimiento(p_tenant_id, p_fecha) e
        where e.activo_id = p_activo_id;
      when 'hallazgos_criticos' then
        select count(*) into v_raw
        from public.mant_indicador_hallazgos_criticos(p_tenant_id) h
        where h.activo_id = p_activo_id;
      when 'tendencia_fallas' then
        select t.fallas into v_raw
        from public.mant_tendencia_fallas(p_tenant_id, p_activo_id, 2, v_factor.ventana_dias) t
        where t.ventana = 1;
      when 'edad' then
        select case
                 when a.fecha_puesta_servicio is null or a.vida_util_meses is null or a.vida_util_meses = 0
                   then null
                 else round(least(100.0,
                   100.0 * (extract(epoch from (p_fecha::timestamptz - a.fecha_puesta_servicio::timestamptz)) / 86400.0 / 30.44)
                   / a.vida_util_meses), 1)
               end into v_raw
        from public.activos a where a.id = p_activo_id and a.tenant_id = p_tenant_id;
      when 'condicion_inspeccion' then
        select case i.resultado
                 when 'conforme' then 100 when 'con_hallazgos' then 50 when 'no_conforme' then 0
               end into v_raw
        from public.mant_inspecciones i
        where i.activo_id = p_activo_id and i.tenant_id = p_tenant_id and i.fecha <= p_fecha
        order by i.fecha desc, i.created_at desc
        limit 1;
      else
        v_raw := null;
    end case;

    if v_raw is null then
      v_puntaje := null;
    else
      v_puntaje := public.mant_salud_aplicar_escala(v_raw, v_factor.escala);
      v_suma_contribucion := v_suma_contribucion + (v_puntaje * v_factor.peso / 100.0);
      v_suma_peso := v_suma_peso + v_factor.peso;
    end if;

    v_desglose := v_desglose || jsonb_build_object(
      'factor_codigo', v_factor.codigo,
      'factor_nombre', v_factor.nombre,
      'fuente_codigo', v_factor.fuente_codigo,
      'dato_crudo', v_raw,
      'puntaje', v_puntaje,
      'peso', v_factor.peso,
      'contribucion', case when v_puntaje is null then null else round(v_puntaje * v_factor.peso / 100.0, 2) end
    );
  end loop;

  set_id := v_set.id;
  version := v_set.version;
  desglose := v_desglose;
  indice := case when v_suma_peso = 0 then null else round(v_suma_contribucion / v_suma_peso * 100, 1) end;
  return next;
end;
$$;

comment on function public.mant_salud(uuid, uuid, date) is
  'MANT-9 §3.1: índice de salud del activo (0-100) Y su desglose completo en UN SOLO retorno — no '
  'existe (a propósito) ninguna función que devuelva solo el índice, restricción técnica '
  'deliberada para que nunca se muestre el número sin su desglose (prueba 3). Calcula SIEMPRE '
  'con el set vigente al momento de la llamada — cambiar los pesos cambia el resultado de la '
  'próxima llamada, nunca reescribe un mant_salud_snapshot ya guardado (version_factores). Un '
  'factor sin dato disponible se excluye y el índice se renormaliza sobre el peso disponible — '
  'nunca arrastra a 0 ni infla a 100 por datos faltantes.';

create function public.fn_mant_registrar_salud_snapshot(
  p_tenant_id uuid, p_activo_id uuid, p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_salud record;
  v_id uuid;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'UNAUTHENTICATED: se requiere rol auxiliar o superior para registrar un snapshot de salud';
  end if;

  select * into v_salud from public.mant_salud(p_tenant_id, p_activo_id, p_fecha);

  if v_salud.indice is null then
    raise exception 'SALUD_SIN_DATOS: el activo % no tiene datos suficientes para calcular su '
      'índice de salud en %', p_activo_id, p_fecha;
  end if;

  insert into public.mant_salud_snapshot
    (tenant_id, activo_id, fecha, indice, detalle, version_factores, registrado_por)
  values
    (p_tenant_id, p_activo_id, p_fecha, v_salud.indice, v_salud.desglose, v_salud.version, (select auth.uid()))
  on conflict (activo_id, fecha) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fn_mant_registrar_salud_snapshot(uuid, uuid, date) is
  'MANT-9 §3.1: congela un mant_salud() en mant_salud_snapshot — idempotente por (activo_id, '
  'fecha) via ON CONFLICT DO NOTHING. Llamable manualmente (botón "Guardar snapshot" en la ficha) '
  'y desde el cron mensual (siguiente función).';

-- ── mant_salud_explicacion: diff en vivo entre dos fechas + hechos concretos ──
create function public.mant_salud_explicacion(
  p_tenant_id uuid, p_activo_id uuid, p_desde date, p_hasta date
)
returns table (
  factor_codigo text, factor_nombre text,
  contribucion_desde numeric, contribucion_hasta numeric, variacion numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_desde record;
  v_hasta record;
  v_f_desde jsonb;
  v_f_hasta jsonb;
  v_item jsonb;
begin
  select * into v_desde from public.mant_salud(p_tenant_id, p_activo_id, p_desde);
  select * into v_hasta from public.mant_salud(p_tenant_id, p_activo_id, p_hasta);

  for v_item in select jsonb_array_elements(coalesce(v_hasta.desglose, '[]'::jsonb))
  loop
    v_f_hasta := v_item;
    select f into v_f_desde
      from jsonb_array_elements(coalesce(v_desde.desglose, '[]'::jsonb)) f
      where f ->> 'factor_codigo' = v_f_hasta ->> 'factor_codigo'
      limit 1;

    factor_codigo := v_f_hasta ->> 'factor_codigo';
    factor_nombre := v_f_hasta ->> 'factor_nombre';
    contribucion_desde := nullif(v_f_desde ->> 'contribucion', 'null')::numeric;
    contribucion_hasta := nullif(v_f_hasta ->> 'contribucion', 'null')::numeric;
    variacion := case
      when contribucion_desde is null or contribucion_hasta is null then null
      else round(contribucion_hasta - contribucion_desde, 2)
    end;
    return next;
  end loop;
end;
$$;

comment on function public.mant_salud_explicacion(uuid, uuid, date, date) is
  'MANT-9 §3.2: variación del índice por factor entre dos fechas, calculada llamando mant_salud() '
  'dos veces (siempre con el set VIGENTE actual, nunca con la versión histórica de cada fecha) — '
  'no depende de que existan snapshots guardados en ninguna de las dos fechas. Los hechos '
  'concretos ("2 fallas en 45 días", "24% más de costo") los arma la UI consultando las mismas '
  'funciones de MANT-8/6/2/7 que alimentan cada factor, con el mismo rango — mant_salud_factor.'
  'fuente_id le dice a la UI qué consulta hacer por factor, sin necesitar una tabla de hechos '
  'nueva ni una segunda fuente de verdad.';

-- ── Cron mensual: snapshot de todo activo cuyo tenant tenga un set vigente ──
create function public.cron_mant_salud_snapshot_mensual()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila record;
  v_procesados int := 0;
begin
  for v_fila in
    select a.tenant_id, a.id as activo_id
    from public.activos a
    join public.mant_salud_set s on s.tenant_id = a.tenant_id and s.estado = 'vigente'
    join public.tenants t on t.id = a.tenant_id and t.status = 'active'
    where a.estado not in ('retirado', 'dispuesto')
  loop
    begin
      perform public.fn_mant_registrar_salud_snapshot(v_fila.tenant_id, v_fila.activo_id, current_date);
      v_procesados := v_procesados + 1;
    exception when others then
      raise warning 'MANT9_CRON_SALUD_FALLIDO: activo % — %', v_fila.activo_id, sqlerrm;
    end;
  end loop;

  raise notice 'MANT9_CRON_SALUD: % activos procesados', v_procesados;
end;
$$;

revoke execute on function public.cron_mant_salud_snapshot_mensual() from public, anon, authenticated;

comment on function public.cron_mant_salud_snapshot_mensual() is
  'MANT-9 §3.1 — snapshot mensual de todo activo no retirado/dispuesto cuyo tenant tenga un set '
  'de salud vigente. Un activo sin datos suficientes (SALUD_SIN_DATOS) no detiene a los demás '
  '(raise warning). Corre vía pg_cron (job "mant-salud-snapshot-mensual"), mismo mecanismo que '
  'mant3_cron/gob9, sin scheduler nuevo.';

select cron.schedule(
  'mant-salud-snapshot-mensual',
  '0 6 1 * *',
  $$select public.cron_mant_salud_snapshot_mensual()$$
);
