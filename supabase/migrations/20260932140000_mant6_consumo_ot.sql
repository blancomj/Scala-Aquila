-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Inventario de repuestos y costos (5/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_06_inventario_costos.md §4.3
--
--  Este archivo: las funciones de orquestación sobre mant_inventario_movimientos
--  — consumo desde una OT, devolución de material no usado, transferencia
--  entre almacenes, y el diagnóstico de lo que quedó sin contabilizar.
--
--  Decisión de diseño confirmada en el Plan del corte §5.B: "bloquea con
--  INVENTARIO_POLITICA_CONTABLE_NO_DEFINIDA" NO se implementa como una
--  excepción que aborte el registro físico — el prompt mismo dice que el
--  control físico "es útil por sí solo" y no debe perderse porque falte una
--  política contable. fn_mant_registrar_consumo SIEMPRE registra el
--  movimiento (presupuesto_ejecucion_id queda NULL, porque no existe
--  ninguna tabla de política de valoración en este corte);
--  mant_inventario_pendientes_contabilizar() lista cada consumo así, con el
--  código como dato — mismo patrón de diagnóstico de solo lectura que
--  contable_parametrizacion_pendiente() (PC-4).
--
--  fn_mant_transferir_repuesto usa la bandera de sesión
--  aquila.registrando_transferencia (mismo mecanismo que aquila.cerrando_ot
--  en fn_mant_cerrar_ot, MANT-4) para que el guard de
--  mant_inventario_movimientos (20260932110000) nunca acepte un INSERT
--  suelto de tipo 'transferencia' — el par completo (dos filas enlazadas,
--  direccion opuesta, almacenes distintos) solo se construye aquí, atómico.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Consumo de material en una OT (§4.3) ─────────────────────────────────
create function public.fn_mant_registrar_consumo(
  p_ot_id uuid,
  p_repuesto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_costo_unitario numeric default null
)
returns public.mant_inventario_movimientos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot public.mant_ordenes_trabajo;
  v_movimiento public.mant_inventario_movimientos;
begin
  select * into v_ot from public.mant_ordenes_trabajo where id = p_ot_id;
  if v_ot.id is null then
    raise exception 'OT_INEXISTENTE: %', p_ot_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_ot.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  insert into public.mant_inventario_movimientos (
    tenant_id, repuesto_id, almacen_id, tipo, cantidad, costo_unitario,
    orden_trabajo_id, registrado_por
  ) values (
    v_ot.tenant_id, p_repuesto_id, p_almacen_id, 'salida', p_cantidad, p_costo_unitario,
    p_ot_id, (select auth.uid())
  ) returning * into v_movimiento;

  return v_movimiento;
end;
$$;

comment on function public.fn_mant_registrar_consumo(uuid, uuid, uuid, numeric, numeric) is
  'MANT-6 §4.3: registra el consumo de un repuesto en una OT (salida enlazada por '
  'orden_trabajo_id). presupuesto_ejecucion_id queda NULL — sin política de valoración definida '
  '(prompt §3), no se genera ningún efecto contable aquí; ver '
  'mant_inventario_pendientes_contabilizar(). El guard de mant_inventario_movimientos valida '
  'stock suficiente (STOCK_INSUFICIENTE si no alcanza).';

-- ── Devolución de material no usado — movimiento NUEVO, nunca edición (§4.3) ─────────────
create function public.fn_mant_registrar_devolucion(
  p_ot_id uuid,
  p_repuesto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric
)
returns public.mant_inventario_movimientos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot public.mant_ordenes_trabajo;
  v_movimiento public.mant_inventario_movimientos;
begin
  select * into v_ot from public.mant_ordenes_trabajo where id = p_ot_id;
  if v_ot.id is null then
    raise exception 'OT_INEXISTENTE: %', p_ot_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_ot.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  insert into public.mant_inventario_movimientos (
    tenant_id, repuesto_id, almacen_id, tipo, cantidad, orden_trabajo_id, registrado_por
  ) values (
    v_ot.tenant_id, p_repuesto_id, p_almacen_id, 'entrada', p_cantidad, p_ot_id, (select auth.uid())
  ) returning * into v_movimiento;

  return v_movimiento;
end;
$$;

comment on function public.fn_mant_registrar_devolucion(uuid, uuid, uuid, numeric) is
  'MANT-6 §4.3: la devolución de material no usado en una OT es un movimiento de entrada NUEVO '
  'enlazado a la misma orden_trabajo_id — nunca una edición del consumo original (la tabla es '
  'append-only, ver mant_inventario_movimientos).';

-- ── Transferencia entre almacenes — par atómico (§4.1, Plan del corte §5.C) ──────────────
create function public.fn_mant_transferir_repuesto(
  p_tenant_id uuid,
  p_repuesto_id uuid,
  p_almacen_origen_id uuid,
  p_almacen_destino_id uuid,
  p_cantidad numeric
)
returns setof public.mant_inventario_movimientos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id_origen  uuid := gen_random_uuid();
  v_id_destino uuid := gen_random_uuid();
begin
  if p_almacen_origen_id = p_almacen_destino_id then
    raise exception 'TRANSFERENCIA_DESTINO_INVALIDO: el almacén origen y destino no pueden ser '
      'el mismo (%)', p_almacen_origen_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(p_tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  -- Bandera de sesión: el guard de mant_inventario_movimientos exige que tipo = 'transferencia'
  -- solo se inserte desde aquí (mismo mecanismo que aquila.cerrando_ot). Ambas filas se
  -- construyen con id explícito para poder referenciarse mutuamente sin ningún UPDATE
  -- posterior — la tabla es append-only, no admite editar el par tras crearlo.
  perform set_config('aquila.registrando_transferencia', 'true', true);

  insert into public.mant_inventario_movimientos (
    id, tenant_id, repuesto_id, almacen_id, tipo, direccion, cantidad,
    transferencia_par_id, registrado_por
  ) values (
    v_id_origen, p_tenant_id, p_repuesto_id, p_almacen_origen_id, 'transferencia', -1, p_cantidad,
    v_id_destino, (select auth.uid())
  );

  insert into public.mant_inventario_movimientos (
    id, tenant_id, repuesto_id, almacen_id, tipo, direccion, cantidad,
    transferencia_par_id, registrado_por
  ) values (
    v_id_destino, p_tenant_id, p_repuesto_id, p_almacen_destino_id, 'transferencia', 1, p_cantidad,
    v_id_origen, (select auth.uid())
  );

  perform set_config('aquila.registrando_transferencia', 'false', true);

  return query
    select * from public.mant_inventario_movimientos where id in (v_id_origen, v_id_destino);
end;
$$;

comment on function public.fn_mant_transferir_repuesto(uuid, uuid, uuid, uuid, numeric) is
  'MANT-6 §4.1: mueve stock entre dos almacenes — inserta el par completo (salida en origen, '
  'entrada en destino, direccion -1/+1, enlazadas por transferencia_par_id) atómicamente. Única '
  'vía legítima a tipo = ''transferencia'' (ver guard_mant_inventario_movimiento).';

-- ── Diagnóstico: consumos sin contabilizar (§3, mismo patrón que contable_parametrizacion_pendiente) ──
create function public.mant_inventario_pendientes_contabilizar(p_tenant_id uuid)
returns table (
  movimiento_id     uuid,
  orden_trabajo_id  uuid,
  repuesto_id       uuid,
  cantidad          numeric,
  registrado_at     timestamptz,
  motivo_bloqueo    text
)
language sql
stable
set search_path = ''
as $$
  select
    m.id,
    m.orden_trabajo_id,
    m.repuesto_id,
    m.cantidad,
    m.registrado_at,
    'INVENTARIO_POLITICA_CONTABLE_NO_DEFINIDA'
  from public.mant_inventario_movimientos m
  where m.tenant_id = p_tenant_id
    and m.tipo = 'salida'
    and m.orden_trabajo_id is not null
    and m.presupuesto_ejecucion_id is null;
$$;

comment on function public.mant_inventario_pendientes_contabilizar(uuid) is
  'MANT-6 §3: lista cada consumo de OT que no se pudo contabilizar (presupuesto_ejecucion_id '
  'NULL) porque no existe una política de valoración de inventario definida — diagnóstico de '
  'solo lectura, no una excepción (mismo criterio que contable_parametrizacion_pendiente, PC-4). '
  'Mientras este corte no defina esa política, TODO consumo de OT aparece aquí — es el '
  'comportamiento esperado (prompt §3: "la contabilización del consumo queda bloqueada").';
