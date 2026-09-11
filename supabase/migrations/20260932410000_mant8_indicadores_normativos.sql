-- ═══════════════════════════════════════════════════════════════════════
--  MANT-8 · Indicadores y tendencias de mantenimiento (2/4)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_08_indicadores_tendencias.md §3.1
--
--  Cumplimiento normativo, hallazgos críticos abiertos y habilitaciones
--  vencidas — todos envuelven funciones ya existentes de MANT-2/MANT-5, no
--  reimplementan su lógica (prueba 9: mant_indicador_cumplimiento_normativo
--  tiene que coincidir exactamente con mant_estado_cumplimiento).
-- ═══════════════════════════════════════════════════════════════════════

-- ── Cumplimiento normativo: resumen de mant_estado_cumplimiento (MANT-2) ──
create function public.mant_indicador_cumplimiento_normativo(
  p_tenant_id uuid, p_fecha date default current_date, p_umbral_dias integer default 30
)
returns table (estado text, cantidad int)
language sql
stable
set search_path = ''
as $$
  select estado, count(*)::int
  from public.mant_estado_cumplimiento(p_tenant_id, p_fecha, p_umbral_dias)
  group by estado;
$$;

comment on function public.mant_indicador_cumplimiento_normativo(uuid, date, integer) is
  'MANT-8 §3.1/prueba 9: agrupa por estado el resultado de mant_estado_cumplimiento (MANT-2) sin '
  'volver a calcularlo — mismo estado (al_dia/proximo_a_vencer/vencido/nunca_cumplido) y mismos '
  'parámetros p_fecha/p_umbral_dias, así que coincide con MANT-2 por construcción.';

-- ── Hallazgos críticos abiertos, con su antigüedad ──
create function public.mant_indicador_hallazgos_criticos(p_tenant_id uuid)
returns table (
  hallazgo_id uuid, activo_id uuid, inspeccion_id uuid, descripcion text,
  estado public.hallazgo_estado_t, fecha_limite date, dias_abierto int
)
language sql
stable
set search_path = ''
as $$
  select
    h.id, i.activo_id, h.inspeccion_id, h.descripcion, h.estado, h.fecha_limite,
    extract(day from now() - h.created_at)::int
  from public.mant_hallazgos h
  join public.mant_inspecciones i on i.id = h.inspeccion_id
  where h.tenant_id = p_tenant_id
    and h.severidad = 'critico'
    and h.estado in ('abierto', 'en_tratamiento')
  order by h.created_at;
$$;

comment on function public.mant_indicador_hallazgos_criticos(uuid) is
  'MANT-8 §3.1: hallazgos de severidad ''critico'' (MANT-7) en estado abierto o en_tratamiento — '
  'aceptado/cerrado quedan fuera, ya tienen resolución. dias_abierto es días corridos desde '
  'created_at hasta ahora.';

-- ── Habilitaciones vencidas de contratistas activos (tenant-wide) ──
create function public.mant_indicador_habilitaciones_vencidas(
  p_tenant_id uuid, p_fecha date default current_date, p_umbral_dias integer default 30
)
returns table (
  tercero_id uuid, tercero_nombre text, habilitacion_id uuid,
  tipo_id bigint, tipo_nombre text, vigente_hasta date, estado text
)
language sql
stable
set search_path = ''
as $$
  select distinct on (s.habilitacion_id)
    c.tercero_id, t.nombre_completo, s.habilitacion_id, s.tipo_id, s.tipo_nombre,
    s.vigente_hasta, s.estado
  from public.mant_contratos c
  join public.terceros t on t.id = c.tercero_id
  cross join lateral public.mant_habilitaciones_semaforo(c.tercero_id, p_fecha, p_umbral_dias) s
  where c.tenant_id = p_tenant_id
    and c.estado = 'vigente'
    and s.estado in ('vencida', 'proximo_a_vencer')
  order by s.habilitacion_id;
$$;

comment on function public.mant_indicador_habilitaciones_vencidas(uuid, date, integer) is
  'MANT-8 §3.1: envuelve mant_habilitaciones_semaforo (MANT-5, por-tercero) sobre TODOS los '
  'terceros con al menos un contrato en estado ''vigente'' — la función de MANT-5 es por-tercero '
  'a propósito (la ficha de proveedor la llama con un solo tercero_id), esta la agrega tenant-wide '
  'para el tablero de indicadores. distinct on (habilitacion_id): una habilitación pertenece al '
  'tercero, no al contrato — un tercero con dos contratos vigentes no la duplica.';
