-- ═══════════════════════════════════════════════════════════════════════
--  CAR F9 (frontend) · Actividad reciente en cartera
--  Propietario: dashboard de Cartera (pieza pedida 2026-08-17)
--
--  fn_actividad_reciente_cartera — feed de las últimas gestiones de
--  cartera registradas, uniendo el evento de REGISTRO de cada una de las
--  4 tablas de gestión (no su ciclo de vida completo: una promesa
--  cumplida no genera una segunda fila aquí, solo su alta):
--    · pagos            → fecha_pago
--    · promesas_pago     → fecha_promesa
--    · acuerdos_pago      → fecha_acuerdo
--    · casos_juridicos    → fecha_remision
--  "notificaciones" queda fuera a propósito — mismo criterio ya aplicado
--  en fn_alertas_cartera (20260823160000): no es dominio de cartera.
--  security invoker: respeta RLS del usuario que llama, mismo criterio
--  que el resto de F9.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_actividad_reciente_cartera(
  p_tenant_id uuid,
  p_limite    int default 15
)
returns table (
  tipo        text,
  fecha       date,
  inmueble_id uuid,
  codigo      text,
  monto       numeric(18, 2)
)
language sql
stable
security invoker
set search_path = ''
as $$
  with eventos as (
    select 'pago'::text as tipo, p.fecha_pago as fecha, p.inmueble_id, p.monto
    from public.pagos p
    where p.tenant_id = p_tenant_id

    union all

    select 'promesa'::text, pp.fecha_promesa, pp.inmueble_id, pp.monto_prometido
    from public.promesas_pago pp
    where pp.tenant_id = p_tenant_id

    union all

    select 'acuerdo'::text, ap.fecha_acuerdo, ap.inmueble_id, ap.monto_total
    from public.acuerdos_pago ap
    where ap.tenant_id = p_tenant_id

    union all

    select 'caso_juridico'::text, cj.fecha_remision, cj.inmueble_id, cj.monto_pretension
    from public.casos_juridicos cj
    where cj.tenant_id = p_tenant_id
  )
  select e.tipo, e.fecha, e.inmueble_id, inm.codigo, e.monto
  from eventos e
  join public.inmuebles inm on inm.id = e.inmueble_id
  order by e.fecha desc
  limit p_limite;
$$;

comment on function public.fn_actividad_reciente_cartera(uuid, int) is
  'Dashboard de Cartera (frontend, 2026-08-17) — feed de las últimas gestiones '
  'registradas [alta de pago/promesa/acuerdo/caso jurídico, no su ciclo de vida '
  'completo], ordenado por fecha de registro descendente. "notificaciones" fuera '
  'de alcance a propósito, mismo criterio que fn_alertas_cartera.';

revoke all on function public.fn_actividad_reciente_cartera(uuid, int) from public, anon;
grant execute on function public.fn_actividad_reciente_cartera(uuid, int) to authenticated;
