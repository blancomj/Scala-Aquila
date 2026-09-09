-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Inventario de repuestos y costos (3/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md §4.4
--
--  presupuesto_ejecucion.orden_trabajo_id — corrección sobre el prompt
--  original (ver Plan del corte §1): su §4.4 dice que lo único que falta es
--  `activo_id`, pero esa columna ya existe desde MANT-0
--  (20260930290000_mant0_depreciacion_ppe.sql). Lo que de verdad falta es
--  `orden_trabajo_id` — sin ella, mant_costos() (20260932130000) no puede
--  agrupar por "tipo de mantenimiento" (una de las cuatro dimensiones del
--  prompt §4.4), porque esa dimensión solo vive en
--  mant_ordenes_trabajo.tipo_mantenimiento_id, no en activo_id.
--
--  Mismo patrón incremental ya usado sobre esta tabla (activo_id en MANT-0,
--  agrupacion_id/centro_costo_id en PC, contrato_id en MANT-5): se extiende
--  guard_presupuesto_ejecucion_activo (creada en MANT-0, ya extendida una
--  vez en MANT-5 para contrato_id) en vez de crear un guard nuevo.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.presupuesto_ejecucion
  add column orden_trabajo_id uuid references public.mant_ordenes_trabajo (id);

create index presupuesto_ejecucion_orden_trabajo_idx
  on public.presupuesto_ejecucion (orden_trabajo_id)
  where orden_trabajo_id is not null;

comment on column public.presupuesto_ejecucion.orden_trabajo_id is
  'MANT-6 §4.4: a qué orden de trabajo corresponde este gasto, si alguno. Necesaria para que '
  'mant_costos() pueda agrupar por tipo de mantenimiento (mant_ordenes_trabajo.tipo_mantenimiento_id) '
  '— activo_id (MANT-0) no basta para esa dimensión.';

create or replace function public.guard_presupuesto_ejecucion_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo_tenant   uuid;
  v_contrato_tenant uuid;
  v_ot_tenant       uuid;
begin
  if new.activo_id is not null then
    select tenant_id into v_activo_tenant from public.activos where id = new.activo_id;
    if v_activo_tenant is null or v_activo_tenant <> new.tenant_id then
      raise exception 'ACTIVO_TENANT_INCONSISTENTE: activo_id % no pertenece al tenant',
        new.activo_id;
    end if;
  end if;

  if new.contrato_id is not null then
    select tenant_id into v_contrato_tenant from public.mant_contratos where id = new.contrato_id;
    if v_contrato_tenant is null or v_contrato_tenant <> new.tenant_id then
      raise exception 'CONTRATO_TENANT_INCONSISTENTE: contrato_id % no pertenece al tenant',
        new.contrato_id;
    end if;
  end if;

  if new.orden_trabajo_id is not null then
    select tenant_id into v_ot_tenant from public.mant_ordenes_trabajo where id = new.orden_trabajo_id;
    if v_ot_tenant is null or v_ot_tenant <> new.tenant_id then
      raise exception 'OT_TENANT_INCONSISTENTE: orden_trabajo_id % no pertenece al tenant',
        new.orden_trabajo_id;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_presupuesto_ejecucion_activo() is
  'MANT-0/MANT-5/MANT-6: activo_id, contrato_id y orden_trabajo_id (si vienen) deben pertenecer '
  'al mismo tenant — mismo patrón que el resto de los guards de esta tabla.';
