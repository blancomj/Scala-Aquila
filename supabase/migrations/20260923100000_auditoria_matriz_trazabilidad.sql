-- PROMPT AUDITORÍA §91 — Matriz de trazabilidad: Riesgo → Control → Prueba →
-- Evidencia → Hallazgo → Acción → Seguimiento → Cierre ("una de las vistas
-- principales del sistema").
--
-- Sin tabla nueva: los 8 eslabones ya existen repartidos en
-- auditoria_riesgos / auditoria_controles / auditoria_procedimientos+
-- auditoria_ejecuciones (Prueba) / auditoria_evidencias (Evidencia) /
-- auditoria_hallazgos / auditoria_acciones (Acción Y Seguimiento — la
-- migración 20260911100000 ya las agrupa bajo el mismo comentario "Acciones
-- / Seguimiento": el estado de la acción ES el seguimiento) / hallazgo.estado
-- = 'CERRADO' (Cierre).
--
-- Grano de la fila = hallazgo, que es donde converge la cadena completa;
-- un riesgo/control sin hallazgos también aparece (con hallazgo_id null)
-- para que la matriz muestre la población completa, no solo los incidentes.
--
-- Un hallazgo puede resolver su riesgo por dos caminos (igual lógica que
-- fn_sugerir_plan_anual): riesgo_id directo (hallazgo cargado a mano) o
-- vía el control que lo generó (auditoria_control_ejecutar solo llena
-- control_id, no riesgo_id). Un hallazgo manual también puede no tener
-- NINGUNO de los dos (FindingPanel permite crear un hallazgo sin elegir
-- riesgo) — la cadena está genuinamente rota ahí, y eso es justo lo que
-- una matriz de trazabilidad debe mostrar, no ocultar: esas filas
-- aparecen con riesgo_id/riesgo_nombre en null en vez de descartarse.

create or replace function public.fn_matriz_trazabilidad(p_tenant_id uuid)
returns table (
  riesgo_id           uuid,
  riesgo_nombre       text,
  riesgo_inherente    integer,
  control_id          uuid,
  control_nombre      text,
  control_automatizado boolean,
  hallazgo_id         uuid,
  hallazgo_proceso    text,
  hallazgo_nivel      text,
  hallazgo_estado     text,
  cerrado             boolean,
  pruebas_count       integer,
  evidencias_count    integer,
  acciones_count      integer,
  acciones_abiertas   integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with filas as (
    -- Controles sin ningún hallazgo todavía — muestra Riesgo → Control "sano".
    select
      c.tenant_id,
      c.riesgo_id,
      c.id as control_id,
      c.nombre as control_nombre,
      c.automatizado as control_automatizado,
      null::uuid as hallazgo_id,
      null::text as hallazgo_proceso,
      null::text as hallazgo_nivel,
      null::text as hallazgo_estado,
      null::boolean as cerrado,
      (
        select count(*)::integer
        from public.auditoria_procedimientos p
        join public.auditoria_ejecuciones ej on ej.procedimiento_id = p.id
        where p.control_id = c.id
      ) as pruebas_count,
      0 as evidencias_count,
      0 as acciones_count,
      0 as acciones_abiertas
    from public.auditoria_controles c
    where c.tenant_id = p_tenant_id
      and not exists (select 1 from public.auditoria_hallazgos h where h.control_id = c.id)

    union all

    -- Un hallazgo por fila, con el resto de la cadena agregado.
    select
      h.tenant_id,
      coalesce(h.riesgo_id, c.riesgo_id) as riesgo_id,
      c.id as control_id,
      c.nombre as control_nombre,
      c.automatizado as control_automatizado,
      h.id as hallazgo_id,
      h.proceso as hallazgo_proceso,
      h.nivel as hallazgo_nivel,
      h.estado as hallazgo_estado,
      (h.estado = 'CERRADO') as cerrado,
      coalesce((
        select count(*)::integer
        from public.auditoria_procedimientos p
        join public.auditoria_ejecuciones ej on ej.procedimiento_id = p.id
        where p.control_id = c.id
      ), 0) as pruebas_count,
      (select count(*)::integer from public.auditoria_evidencias e where e.hallazgo_id = h.id) as evidencias_count,
      (select count(*)::integer from public.auditoria_acciones a where a.hallazgo_id = h.id) as acciones_count,
      (
        select count(*)::integer from public.auditoria_acciones a
        where a.hallazgo_id = h.id and a.estado not in ('CERRADA', 'RECHAZADA')
      ) as acciones_abiertas
    from public.auditoria_hallazgos h
    left join public.auditoria_controles c on c.id = h.control_id
    where h.tenant_id = p_tenant_id
  )
  select
    filas.riesgo_id,
    r.nombre as riesgo_nombre,
    r.riesgo_inherente,
    filas.control_id,
    filas.control_nombre,
    filas.control_automatizado,
    filas.hallazgo_id,
    filas.hallazgo_proceso,
    filas.hallazgo_nivel,
    filas.hallazgo_estado,
    filas.cerrado,
    filas.pruebas_count,
    filas.evidencias_count,
    filas.acciones_count,
    filas.acciones_abiertas
  from filas
  left join public.auditoria_riesgos r on r.id = filas.riesgo_id
  where filas.tenant_id = p_tenant_id
  order by r.riesgo_inherente desc nulls last, r.nombre nulls last, filas.control_nombre nulls last, filas.hallazgo_id nulls last;
$$;

revoke execute on function public.fn_matriz_trazabilidad(uuid) from public, anon;
grant execute on function public.fn_matriz_trazabilidad(uuid) to authenticated;
