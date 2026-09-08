-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (6/7) · Más funciones que faltaban en GOB-4/7/8 para el tablero
--  Ver GOB_09_comunicaciones_workflow.md §3.4.
--
--  Mismo criterio que 20260931990000: cada corte anterior expuso el dato
--  crudo (sla_vence_at, plazo_disposicion_limite, resuelta_at) pero
--  ninguno expuso el AGREGADO "cuántas están vencidas/próximas" que el
--  tablero necesita — se agrega aquí, con la firma que tendría si
--  hubiera nacido en su propio corte, para que gobierno_tablero_resumen()
--  no toque gobierno_actas/gobierno_impugnaciones/solicitudes crudas.
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_solicitudes_sla_estado(p_tenant_id uuid, p_dias_proximo integer default 3)
returns table (estado text, cantidad integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'vencida'::text, count(*)::integer
  from public.solicitudes s
  where s.tenant_id = p_tenant_id
    and s.resuelta_at is null and s.cerrada_at is null
    and s.sla_vence_at is not null and s.sla_vence_at < now()
  union all
  select 'proxima'::text, count(*)::integer
  from public.solicitudes s
  where s.tenant_id = p_tenant_id
    and s.resuelta_at is null and s.cerrada_at is null
    and s.sla_vence_at is not null
    and s.sla_vence_at >= now() and s.sla_vence_at <= now() + make_interval(days => p_dias_proximo)
$$;

comment on function public.gobierno_solicitudes_sla_estado(uuid, integer) is
  'GOB-8 (agregada por GOB-9 §3.4): cuántas solicitudes abiertas tienen SLA vencido o próximo a '
  'vencer — GOB-8 solo expuso sla_vence_at por fila, no este agregado.';

create function public.gobierno_actas_pendientes(p_tenant_id uuid)
returns table (concepto text, cantidad integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'sin_suscribir'::text, count(*)::integer
  from public.gobierno_actas a where a.tenant_id = p_tenant_id and a.suscrita_at is null
  union all
  select 'sin_disposicion'::text, count(*)::integer
  from public.gobierno_actas a where a.tenant_id = p_tenant_id and a.puesta_a_disposicion_at is null
$$;

comment on function public.gobierno_actas_pendientes(uuid) is
  'GOB-4 (agregada por GOB-9 §3.4): actas sin suscribir y sin poner a disposición todavía.';

create function public.gobierno_impugnaciones_en_tramite(p_tenant_id uuid)
returns table (impugnacion_id uuid, plazo_limite date, dias_restantes integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.plazo_limite, (i.plazo_limite - current_date)::integer
  from public.gobierno_impugnaciones i
  where i.tenant_id = p_tenant_id and i.resuelta_at is null
$$;

comment on function public.gobierno_impugnaciones_en_tramite(uuid) is
  'GOB-7 (agregada por GOB-9 §3.4): impugnaciones sin resolver, con días restantes a su plazo.';
