-- ═══════════════════════════════════════════════════════════════════════
--  GOB-9 (4/7) · Selector de segmentación de destinatarios
--  Ver GOB_09_comunicaciones_workflow.md §3.2, prueba 5.
--
--  Reutiliza lo que ya existe, sin listas manuales duplicadas:
--    - agrupacion: inmuebles.agrupacion_id + agrupacion_subarbol() (CO,
--      20260830250000) — ya resuelve "todos los inmuebles del Edificio A"
--      incluyendo sub-nodos.
--    - calidad: inmueble_persona_rol.rol_id (familia PERSONA_PREDIO,
--      GOB-0 20260931320000) — propietario/tenedor(es), vigente = hasta
--      is null.
--    - inmueble: filtro directo.
--    - miembro_organo: gobierno_miembros (GOB-1) vigente en un órgano de
--      un tipo dado (familia ORGANO_GOBIERNO).
--    - cartera_mora: v_cargo_saldo (CAR, derivado, nunca persistido —
--      mismo principio AP-01 que esta_en_mora) — monto_pendiente > 0 y
--      fecha_vencimiento ya pasada.
-- ═══════════════════════════════════════════════════════════════════════

create function public.gobierno_segmento_destinatarios(
  p_tenant_id uuid,
  p_criterio  text,
  p_valor     text
)
returns table (
  tercero_id  uuid,
  inmueble_id uuid,
  nombre      text,
  email       text,
  telefono    text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_criterio = 'agrupacion' then
    return query
    select t.id, i.id, t.nombre_completo, t.email::text, t.telefono::text
    from public.inmuebles i
    join public.inmueble_persona_rol ipr on ipr.inmueble_id = i.id and ipr.vigente_hasta is null
    join public.terceros t on t.id = ipr.tercero_id
    where i.tenant_id = p_tenant_id
      and i.agrupacion_id in (select id from public.agrupacion_subarbol(p_valor::uuid));

  elsif p_criterio = 'calidad' then
    return query
    select t.id, i.id, t.nombre_completo, t.email::text, t.telefono::text
    from public.inmueble_persona_rol ipr
    join public.lista_tipos lt on lt.id = ipr.rol_id and lt.tipo = 'PERSONA_PREDIO'
    join public.inmuebles i on i.id = ipr.inmueble_id
    join public.terceros t on t.id = ipr.tercero_id
    where i.tenant_id = p_tenant_id
      and ipr.vigente_hasta is null
      and lt.codigo = p_valor;

  elsif p_criterio = 'inmueble' then
    return query
    select t.id, i.id, t.nombre_completo, t.email::text, t.telefono::text
    from public.inmuebles i
    join public.inmueble_persona_rol ipr on ipr.inmueble_id = i.id and ipr.vigente_hasta is null
    join public.terceros t on t.id = ipr.tercero_id
    where i.tenant_id = p_tenant_id
      and i.id = p_valor::uuid;

  elsif p_criterio = 'miembro_organo' then
    return query
    select t.id, gm.inmueble_id, t.nombre_completo, t.email::text, t.telefono::text
    from public.gobierno_miembros gm
    join public.gobierno_organos go on go.id = gm.organo_id
    join public.lista_tipos lt on lt.id = go.tipo_id and lt.tipo = 'ORGANO_GOBIERNO'
    join public.terceros t on t.id = gm.tercero_id
    where go.tenant_id = p_tenant_id
      and (gm.hasta is null or gm.hasta >= current_date)
      and lt.codigo = p_valor;

  elsif p_criterio = 'cartera_mora' then
    return query
    select distinct t.id, i.id, t.nombre_completo, t.email::text, t.telefono::text
    from public.inmuebles i
    join public.inmueble_persona_rol ipr on ipr.inmueble_id = i.id and ipr.vigente_hasta is null
    join public.terceros t on t.id = ipr.tercero_id
    where i.tenant_id = p_tenant_id
      and exists (
        select 1 from public.v_cargo_saldo v
        where v.inmueble_id = i.id
          and v.monto_pendiente > 0
          and v.fecha_vencimiento < current_date
      );

  else
    raise exception 'SEGMENTO_CRITERIO_INVALIDO: % no es un criterio soportado '
      '(agrupacion, calidad, inmueble, miembro_organo, cartera_mora)', p_criterio;
  end if;
end;
$$;

comment on function public.gobierno_segmento_destinatarios(uuid, text, text) is
  'GOB-9 §3.2 — selector reutilizable de destinatarios, sin listas manuales duplicadas: resuelve '
  'siempre desde datos que ya existen (inmuebles.agrupacion_id, inmueble_persona_rol, '
  'gobierno_miembros, v_cargo_saldo). p_valor es el id/código del filtro según p_criterio '
  '(agrupacion: uuid de agrupaciones; calidad/miembro_organo: código de lista_tipos; inmueble: '
  'uuid de inmuebles; cartera_mora: ignorado).';
