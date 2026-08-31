-- ═══════════════════════════════════════════════════════════════════════
--  CAR §8.5 / bloque 23 · Nueva versión (borrador) de una política de
--  clasificación, clonando tramos y estrategias de la política de origen.
--
--  El problema que resuelve: fn_sembrar_configuracion_cartera (20260906180000)
--  solo siembra la v1 desde cero (falla si YA existe una política). §8.5 /
--  REC-CAR-011 exige que corregir una política vigente sea "crear versión
--  nueva" — pero hasta hoy no había forma de crear esa v2+ sin escribir SQL
--  a mano tramo por tramo. Este RPC hace exactamente eso: parte de UNA
--  política existente (vigente o histórica) del mismo tenant, y clona sus
--  ocho tramos y sus estrategias en una política nueva, versión =
--  max(version)+1, estado='borrador' — misma técnica de
--  jsonb_object_agg(codigo,id) que fn_sembrar_configuracion_cartera usa
--  para remapear tramo_id.
--
--  Nace en borrador a propósito, igual que la siembra: los guards
--  (guard_tramo_politica_inmutable en borrador no bloquea nada) permiten
--  editar tramos y estrategias libremente hasta que se active. Activar
--  sigue el mismo patrón de dos UPDATE que politicaFinanciera.ts
--  (retirar la vigente actual a 'historica', promover la nueva a
--  'vigente') — sin RPC dedicado, tal como el resto del código.
--
--  security invoker, igual que fn_sembrar_configuracion_cartera: RLS decide
--  quién puede escribir (insert_agent exige has_role auxiliar/administrador
--  vía has_role — administrador hereda auxiliar).
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_crear_version_politica_clasificacion(
  p_politica_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant_id     uuid;
  v_nueva_version int;
  v_nueva_id      uuid;
  v_ids           jsonb;
begin
  select tenant_id into v_tenant_id
  from public.politicas_clasificacion_cartera
  where id = p_politica_id;

  if v_tenant_id is null then
    raise exception 'POLITICA_INVALIDA: % no existe o no es visible para este usuario', p_politica_id;
  end if;

  select coalesce(max(version), 0) + 1 into v_nueva_version
  from public.politicas_clasificacion_cartera
  where tenant_id = v_tenant_id;

  insert into public.politicas_clasificacion_cartera (tenant_id, version, estado, nombre, policy_hash)
  values (
    v_tenant_id, v_nueva_version, 'borrador',
    'Política de clasificación v' || v_nueva_version::text,
    'version-cartera-' || p_politica_id::text || '-' || v_nueva_version::text
  )
  returning id into v_nueva_id;

  -- ── Tramos: copia exacta de la política de origen ──────────────────
  insert into public.politica_clasificacion_tramos (
    tenant_id, politica_id, codigo, nombre, dias_min, dias_max,
    nivel_riesgo, etapa_cobranza, prioridad, orden
  )
  select tenant_id, v_nueva_id, codigo, nombre, dias_min, dias_max,
         nivel_riesgo, etapa_cobranza, prioridad, orden
  from public.politica_clasificacion_tramos
  where politica_id = p_politica_id;

  select jsonb_object_agg(codigo, id) into v_ids
  from public.politica_clasificacion_tramos
  where politica_id = v_nueva_id;

  -- ── Estrategias: copia exacta, remapeando tramo_id por código ──────
  insert into public.estrategias_cobranza (
    tenant_id, politica_id, tramo_id, codigo, nombre, tipo_accion, canal,
    dias_desde_clasificacion, frecuencia_dias, max_intentos, plantilla_codigo,
    rol_minimo, requiere_aprobacion, monto_minimo_deuda, activa, orden
  )
  select e.tenant_id, v_nueva_id, (v_ids ->> t_old.codigo)::uuid, e.codigo, e.nombre,
         e.tipo_accion, e.canal, e.dias_desde_clasificacion, e.frecuencia_dias,
         e.max_intentos, e.plantilla_codigo, e.rol_minimo, e.requiere_aprobacion,
         e.monto_minimo_deuda, e.activa, e.orden
  from public.estrategias_cobranza e
  join public.politica_clasificacion_tramos t_old on t_old.id = e.tramo_id
  where e.politica_id = p_politica_id;

  return v_nueva_id;
end;
$$;

comment on function public.fn_crear_version_politica_clasificacion(uuid) is
  'CAR §8.5, bloque 23 — clona tramos y estrategias de una política existente en una versión '
  'nueva (version = max+1, estado=borrador) del mismo tenant, para editarla sin tocar la '
  'vigente (REC-CAR-011: una política vigente es inmutable, corregir = versión nueva). '
  'security invoker: RLS decide quién puede escribir.';
