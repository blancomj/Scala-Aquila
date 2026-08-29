-- ═══════════════════════════════════════════════════════════════════════
--  CAR §11 / bloque 18 · Bandeja de escalamiento y aprobaciones
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §11
--
--  Mismo motivo que fn_bandeja_cobranza (20260906150000): cada fila
--  necesita días de mora y deuda actual, que no viven en cartera_etapas
--  (esa tabla es la etapa GOBERNADA, no una foto de deuda) — resolverlo
--  con una consulta aparte por fila sería N+1. fn_posicion_cartera (F1)
--  ya calcula deuda/mora en vivo por inmueble; se reutiliza vía LATERAL,
--  ningún cálculo se reimplementa aquí (REC-CAR-004).
--
--  Solo devuelve las filas con etapa_propuesta IS NOT NULL — el resto de
--  la bandeja (bloque 16) ya usa este mismo criterio: la bandeja son
--  colas de trabajo, no un listado completo de la tabla. El historial
--  (bitácora) NO necesita función propia: eventos_cartera (20260822380000)
--  ya es una tabla plana con RLS de solo-select para miembros — se
--  consulta directo desde el cliente, filtrando tipo='CARTERA_ETAPA_CAMBIO'
--  (mismo criterio documentado en fn_panel_acciones_cartera: el detalle
--  se consulta directo cuando no hace falta derivar/agregar nada).
--
--  security invoker: RLS decide qué ve cada quien. p_tenant_id es un
--  filtro, no un permiso — un miembro de otro tenant no obtiene filas
--  aunque lo pase.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_bandeja_escalamiento(
  p_tenant_id   uuid,
  p_fecha_corte date
) returns table (
  inmueble_id              uuid,
  inmueble_codigo          text,
  etapa                    public.etapa_cobranza_t,
  etapa_propuesta          public.etapa_cobranza_t,
  motivo_propuesta         text,
  propuesto_por            uuid,
  propuesto_at             timestamptz,
  dias_mora                int,
  deuda_total              numeric,
  cantidad_cargos_vencidos int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ce.inmueble_id,
    i.codigo,
    ce.etapa,
    ce.etapa_propuesta,
    ce.motivo_propuesta,
    ce.propuesto_por,
    ce.propuesto_at,
    coalesce(pos.dias_mora_maximo, 0),
    coalesce(pos.deuda_total, 0),
    coalesce(pos.cantidad_cargos_vencidos, 0)
  from public.cartera_etapas ce
  join public.inmuebles i on i.id = ce.inmueble_id
  left join lateral public.fn_posicion_cartera(p_tenant_id, p_fecha_corte, ce.inmueble_id) pos on true
  where ce.tenant_id = p_tenant_id
    and ce.etapa_propuesta is not null
  -- Lo que lleva más tiempo esperando decisión va primero — mismo
  -- criterio de urgencia que fn_bandeja_cobranza.
  order by ce.propuesto_at asc nulls last, ce.inmueble_id;
$$;

comment on function public.fn_bandeja_escalamiento(uuid, date) is
  'CAR §11/bloque 18 — filas de la bandeja de aprobaciones de escalamiento (cartera_etapas con '
  'etapa_propuesta pendiente), con días de mora y deuda actual resueltos vía fn_posicion_cartera '
  '(F1) — nunca leídos de una columna congelada, cartera_etapas no es una foto de deuda.';

revoke all on function public.fn_bandeja_escalamiento(uuid, date) from public, anon;
grant execute on function public.fn_bandeja_escalamiento(uuid, date) to authenticated;
