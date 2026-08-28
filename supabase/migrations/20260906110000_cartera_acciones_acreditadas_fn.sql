-- ═══════════════════════════════════════════════════════════════════════
--  CAR §34 (1b/2) · Conteo de acciones acreditadas de un inmueble
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §34.2
--
--  Insumo de I-C23: un escalamiento a prejuridica o juridica exige al
--  menos UNA acción acreditada por canal con acuse técnico. Una llamada o
--  una visita registradas por el gestor prueban gestión, no notificación
--  (REC-CAR-017) — y por construcción no producen acuse de proveedor, así
--  que no entran en este conteo.
--
--  Sin ventana por etapa a propósito: cartera_etapas no guarda la fecha de
--  entrada a la etapa actual (updated_at también se mueve al proponer una
--  transición), así que acotar «acreditadas en esta etapa» exigiría
--  inventar un corte. Se cuenta sobre el inmueble, que es la lectura
--  conservadora: si ni una sola notificación del inmueble está probada,
--  no hay con qué sustentar el escalamiento, sea cual sea la ventana.
--
--  origen = 'proveedor' es la condición dura: un acuse manual —aun con su
--  documento— es constancia humana. Sirve para el expediente y para
--  acreditar diligencia, pero no habilita por sí solo el salto a la etapa
--  prejurídica.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_contar_acciones_acreditadas(
  p_tenant_id   uuid,
  p_inmueble_id uuid
) returns int
language sql
stable
security invoker
set search_path = ''
as $$
  with ultimo_por_envio as (
    select distinct on (a.envio_id)
           e.accion_id,
           a.estado,
           a.origen
    from public.acciones_cobranza_acuses a
    join public.acciones_cobranza_envios e on e.id = a.envio_id
    join public.acciones_cobranza ac on ac.id = e.accion_id
    where a.tenant_id = p_tenant_id
      and ac.tenant_id = p_tenant_id
      and ac.inmueble_id = p_inmueble_id
    order by a.envio_id, a.ocurrido_at desc, a.recibido_at desc, a.id desc
  )
  select count(distinct accion_id)::int
  from ultimo_por_envio
  where estado in ('entregado', 'leido')
    and origen = 'proveedor';
$$;

comment on function public.fn_contar_acciones_acreditadas(uuid, uuid) is
  'CAR §34.2 I-C23 — cuántas acciones de cobranza del inmueble están acreditadas por acuse '
  'técnico del proveedor (entregado/leido). Insumo de evaluarEscalamiento(): sin al menos '
  'una, no se escala a prejuridica ni a juridica. Las constancias humanas (llamada, visita, '
  'acuse manual) quedan fuera por REC-CAR-017 — prueban gestión, no notificación.';
