-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Atributos técnicos dinámicos y criticidad (4/4b)
--
--  mant_criticidad(activo_id): puntaje total + banda + desglose por
--  criterio (§3.3 — "la criticidad sin desglose no sirve: nadie puede
--  discutirla"). Falla explícito si falta la evaluación de algún criterio
--  del set vigente (CRITICIDAD_EVALUACION_INCOMPLETA) — decisión del Plan
--  del corte, confirmada: un puntaje parcial que parezca completo es peor
--  que un error explícito.
-- ═══════════════════════════════════════════════════════════════════════

create function public.mant_criticidad(p_activo_id uuid)
returns table (
  puntaje_total numeric(6, 2),
  banda         text,
  desglose      jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant_id  uuid;
  v_set_id     uuid;
  v_faltantes  text;
  v_puntaje    numeric(8, 4);
  v_banda      text;
  v_desglose   jsonb;
begin
  select tenant_id into v_tenant_id from public.activos where id = p_activo_id;
  if v_tenant_id is null then
    raise exception 'ACTIVO_INVALIDO: % no existe o no es visible', p_activo_id;
  end if;

  select id into v_set_id
    from public.mant_criticidad_set
   where tenant_id = v_tenant_id and estado = 'vigente';
  if v_set_id is null then
    raise exception 'CRITICIDAD_SIN_SET_VIGENTE: el tenant % no tiene un set de criterios de '
      'criticidad vigente (MANT-1 §3.3)', v_tenant_id;
  end if;

  select string_agg(c.codigo, ', ' order by c.codigo) into v_faltantes
    from public.mant_criticidad_criterio c
    left join public.mant_activo_criticidad e
      on e.criterio_id = c.id and e.activo_id = p_activo_id
   where c.set_id = v_set_id and e.id is null;

  if v_faltantes is not null then
    raise exception 'CRITICIDAD_EVALUACION_INCOMPLETA: al activo % le falta evaluar el/los '
      'criterio(s) % del set vigente (MANT-1 §3.3)', p_activo_id, v_faltantes;
  end if;

  select
    sum(c.peso * e.puntaje / 100),
    jsonb_agg(jsonb_build_object(
      'criterio_codigo', c.codigo,
      'criterio_nombre', c.nombre,
      'peso', c.peso,
      'valor', e.valor,
      'puntaje', e.puntaje,
      'contribucion', round(c.peso * e.puntaje / 100, 4)
    ) order by c.codigo)
    into v_puntaje, v_desglose
  from public.mant_criticidad_criterio c
  join public.mant_activo_criticidad e on e.criterio_id = c.id and e.activo_id = p_activo_id
  where c.set_id = v_set_id;

  select b.etiqueta into v_banda
    from public.mant_criticidad_banda b
   where b.set_id = v_set_id
     and v_puntaje >= b.puntaje_desde
     and (b.puntaje_hasta is null or v_puntaje <= b.puntaje_hasta)
   order by b.orden
   limit 1;

  return query select round(v_puntaje, 2), v_banda, v_desglose;
end;
$$;

comment on function public.mant_criticidad(uuid) is
  'MANT-1 §3.3: puntaje total (Σ peso×puntaje/100 de cada criterio del set vigente del tenant), '
  'banda (de mant_criticidad_banda, null si ninguna cubre el puntaje) y desglose por criterio en '
  'jsonb — nunca solo el número (§3.3: "la criticidad sin desglose no sirve"). Falla explícito '
  '(CRITICIDAD_SIN_SET_VIGENTE / CRITICIDAD_EVALUACION_INCOMPLETA) en vez de devolver un puntaje '
  'parcial silencioso. SECURITY INVOKER: hereda el RLS normal de activos/mant_criticidad_*.';
