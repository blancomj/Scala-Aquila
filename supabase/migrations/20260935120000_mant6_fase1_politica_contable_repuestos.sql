-- ═══════════════════════════════════════════════════════════════════════
--  MANT-6 · Fase 1 — política contable de repuestos (existencias vs. gasto)
--  Ver "Casos de uso/Manejo de Respuestos en Contabilidad/
--  CRITERIO_CONTABLE_INVENTARIO_REPUESTOS_AQUILA.md" — criterio híbrido,
--  parametrizable por artículo, basado en materialidad. Este corte NO
--  impone una regla universal ("todo repuesto = clase 14" o "todo repuesto
--  = gasto") — cada copropiedad decide por repuesto (§doc, prohibición
--  explícita).
--
--  Alcance de esta Fase 1 (BUSCAR EXISTENTE primero, ver
--  20260932100000/20260932110000/20260932140000): solo el lado de CONSUMO
--  (salida) de un repuesto ya marcado `politica_contable = 'inventario'`.
--  Cuando el consumo se puede valorizar (costo_unitario + periodo abiertos
--  + cuentas parametrizadas), genera un comprobante real (Débito gasto de
--  mantenimiento / Crédito inventario), mismo patrón de
--  origen_modulo/origen_entidad/origen_id/origen_evento que
--  fn_mant_capitalizar_activo/fn_mant_reconocer_depreciacion (MANT-0).
--
--  Deliberadamente FUERA de esta Fase 1 (no hay evidencia de que exista
--  hoy, ver Plan):
--    • Lado de ENTRADA (compra) — no hay puente CxP -> inventario todavía;
--      `gasto_directo` sigue reconociéndose donde ya se reconoce hoy (el
--      flujo normal de gasto/factura), sin cambio.
--    • Método de costeo (FIFO/promedio ponderado) — Fase 1 usa el
--      `costo_unitario` que el propio consumo declara, sin mantener un
--      costo promedio acumulado por repuesto.
--    • Componente capitalizable (bridge mant_repuestos <-> activos) — Fase 2.
--
--  Principio que esta fase preserva sin excepción (comentario original de
--  20260932140000, confirmado vigente): el registro FÍSICO del consumo
--  nunca se bloquea por falta de parametrización contable — "es útil por
--  sí solo". Por eso la generación del comprobante va en un bloque
--  BEGIN/EXCEPTION propio (mismo idioma que fn_mant_reconocer_depreciacion
--  usa por activo): si falta cualquier cosa (costo, periodo, cuentas), el
--  movimiento físico igual se registra y el consumo queda listado por
--  mant_inventario_pendientes_contabilizar(), ahora acotado a repuestos con
--  politica_contable = 'inventario' (los de 'gasto_directo' nunca generan
--  comprobante en el consumo — su gasto se reconoce en la compra, fuera de
--  este corte — así que no tiene sentido reportarlos como "pendientes").
--
--  presupuesto_ejecucion_id (columna existente en mant_inventario_movimientos,
--  20260932110000) se deja intacta y sigue NULL siempre: investigado en esta
--  sesión, esa tabla es el ledger de ejecución presupuestal ligado al ciclo
--  de facturas de proveedor (FIN-2/FIN-3, causación 'por_pagar'/'pagado_banco'
--  con crédito a proveedores) — no el mecanismo correcto para "débito gasto
--  / crédito inventario". El comprobante de consumo se ubica por
--  origen_entidad/origen_id, igual que activos — sin añadir una columna
--  nueva a un ledger append-only.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Política contable del repuesto — enum nativo (D-24) ──────────────
-- Gatilla una rama de código real (si el consumo intenta generar un asiento
-- contable o no, y contra qué cuenta) — no es vocabulario descriptivo
-- suelto, mismo criterio que movimiento_tipo_t (20260932110000).
create type public.politica_contable_repuesto_t as enum ('inventario', 'gasto_directo');
comment on type public.politica_contable_repuesto_t is
  'MANT-6 Fase 1: política contable de un repuesto (criterio del documento de investigación '
  'contable — CRITERIO_CONTABLE_INVENTARIO_REPUESTOS_AQUILA.md). ''inventario'' exige '
  'contable_cuenta_id (cuenta de existencias, clase 1) y hace que fn_mant_registrar_consumo '
  'intente generar un comprobante al consumir; ''gasto_directo'' (default) preserva el '
  'comportamiento anterior a este corte — ningún efecto contable al consumir, el gasto se '
  'reconoce donde ya se reconocía. Gatilla la rama contable real del consumo, no es vocabulario '
  'descriptivo — enum nativo, no lista_tipos (D-24).';

alter table public.mant_repuestos
  add column politica_contable public.politica_contable_repuesto_t not null default 'gasto_directo';

comment on column public.mant_repuestos.politica_contable is
  'MANT-6 Fase 1: ''gasto_directo'' (default, sin cambio de comportamiento) o ''inventario'' '
  '(exige contable_cuenta_id de clase 1 — ver guard_mant_repuesto — y activa la generación de '
  'comprobante en fn_mant_registrar_consumo). Cada copropiedad decide por repuesto según su '
  'propio criterio de materialidad — este corte no impone una regla universal.';

comment on column public.mant_repuestos.contable_cuenta_id is
  'MANT-6 Fase 1: cuenta de existencias (clase 1) de este repuesto — exigida y validada '
  '(guard_mant_repuesto) solo cuando politica_contable = ''inventario''. Si politica_contable = '
  '''gasto_directo'' sigue siendo decorativa, como nació en 20260932100000.';

-- ── 2. guard_mant_repuesto — exige y valida la cuenta cuando aplica ──────
create or replace function public.guard_mant_repuesto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria_tipo text;
  v_unidad_tipo text;
  v_tercero_tenant uuid;
  v_cuenta public.contable_cuenta%rowtype;
begin
  select tipo into v_categoria_tipo from public.lista_tipos where id = new.categoria_id;
  if v_categoria_tipo is distinct from 'CATEGORIA_REPUESTO' then
    raise exception 'REPUESTO_CATEGORIA_INVALIDA: categoria_id % no pertenece a CATEGORIA_REPUESTO '
      '(es %)', new.categoria_id, coalesce(v_categoria_tipo, 'inexistente');
  end if;

  if new.unidad_id is not null then
    select tipo into v_unidad_tipo from public.lista_tipos where id = new.unidad_id;
    if v_unidad_tipo is distinct from 'UNIDAD_MEDIDA' then
      raise exception 'REPUESTO_UNIDAD_INVALIDA: unidad_id % no pertenece a UNIDAD_MEDIDA (es %)',
        new.unidad_id, coalesce(v_unidad_tipo, 'inexistente');
    end if;
  end if;

  if new.tercero_preferido_id is not null then
    select tenant_id into v_tercero_tenant from public.terceros where id = new.tercero_preferido_id;
    if v_tercero_tenant is distinct from new.tenant_id then
      raise exception 'REPUESTO_TENANT_INCONSISTENTE: el tercero % no pertenece al tenant',
        new.tercero_preferido_id;
    end if;
  end if;

  if new.politica_contable = 'inventario' and new.contable_cuenta_id is null then
    raise exception 'REPUESTO_POLITICA_INVENTARIO_SIN_CUENTA: % requiere contable_cuenta_id '
      '(cuenta de existencias) cuando politica_contable = ''inventario''', new.nombre;
  end if;

  if new.contable_cuenta_id is not null then
    v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

    if new.politica_contable = 'inventario' and v_cuenta.clase <> 1 then
      raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es clase % — un repuesto con '
        'politica_contable ''inventario'' exige una cuenta de existencias (clase 1)',
        v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_mant_repuesto() is
  'MANT-6 §4.1 + Fase 1: categoria_id/unidad_id/tercero como antes; si politica_contable = '
  '''inventario'', contable_cuenta_id es obligatoria y debe ser una cuenta de existencias (clase '
  '1) vía validar_cuenta_contable_destino (PC-3) — si es ''gasto_directo'', la cuenta (si viene) '
  'sigue sin ninguna exigencia, igual que antes de esta fase.';

-- ── 3. Evento contable nuevo — sin cuenta por defecto (a propósito) ─────
-- No hay un código PUC "obvio" único para consumo de repuestos de mantenimiento (puede ir a
-- 5525/5530/5535/5590 según qué se consumió) — mismo criterio que RECONOCIMIENTO_BIEN_DESAFECTADO
-- (MANT-0): no se autoseeded, contable_parametrizacion_pendiente() ya lo reporta sin cambios
-- (recorre TODA fila de EVENTO_CONTABLE sin contable_cuenta_default para el tenant).
insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('EVENTO_CONTABLE', 'CONSUMO_REPUESTO_MANTENIMIENTO', 'Consumo de repuesto (política inventario)',
   'Débito del gasto de mantenimiento al consumir un repuesto cuya política contable es '
   '''inventario'' (MANT-6 Fase 1) — el crédito va directo a la cuenta de existencias del propio '
   'repuesto (mant_repuestos.contable_cuenta_id), no a esta cuenta.', 240);

-- ── 4. guard_contable_cuenta_default gana el evento nuevo (clase 5, gasto) ──
create or replace function public.guard_contable_cuenta_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia text;
  v_evento_tenant uuid;
  v_evento_codigo text;
  v_cuenta public.contable_cuenta%rowtype;
  v_clase_esperada smallint;
  v_grupo11_esperado boolean := false;
  v_requiere_fondo_esperado boolean := false;
begin
  select tipo, tenant_id, codigo into v_familia, v_evento_tenant, v_evento_codigo
  from public.lista_tipos where id = new.evento_id;

  if v_familia is distinct from 'EVENTO_CONTABLE' then
    raise exception 'EVENTO_CONTABLE_INVALIDO: evento_id % no pertenece a EVENTO_CONTABLE (es %)',
      new.evento_id, coalesce(v_familia, 'inexistente');
  end if;

  if v_evento_tenant is not null and v_evento_tenant <> new.tenant_id then
    raise exception 'EVENTO_CONTABLE_INVALIDO: el evento % pertenece a otro tenant',
      new.evento_id;
  end if;

  v_cuenta := public.validar_cuenta_contable_destino(new.contable_cuenta_id, new.tenant_id);

  v_clase_esperada := case
    when v_evento_codigo like 'CARTERA_%'                        then 1
    when v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL',
                              'FONDO_IMPREVISTOS_EFECTIVO')       then 1
    when v_evento_codigo = 'DETERIORO_CARTERA'                   then 1
    when v_evento_codigo = 'DEPRECIACION_ACUMULADA'              then 1
    when v_evento_codigo like 'PROVEEDOR_%'                      then 2
    when v_evento_codigo = 'RESULTADO_EJERCICIO'                 then 3
    when v_evento_codigo = 'RECONOCIMIENTO_BIEN_DESAFECTADO'     then 3
    when v_evento_codigo like 'INGRESO_%'                        then 4
    when v_evento_codigo = 'RENDIMIENTO_FINANCIERO_FONDO'        then 4
    when v_evento_codigo = 'GASTO_DETERIORO_CARTERA'             then 5
    when v_evento_codigo = 'GASTO_DEPRECIACION'                  then 5
    when v_evento_codigo = 'PERDIDA_RETIRO_ACTIVO'               then 5
    when v_evento_codigo = 'CONSUMO_REPUESTO_MANTENIMIENTO'      then 5
  end;

  if v_evento_codigo in ('BANCO_RECAUDO', 'CAJA_GENERAL', 'FONDO_IMPREVISTOS_EFECTIVO') then
    v_grupo11_esperado := true;
  end if;

  if v_evento_codigo in ('CARTERA_FONDO_IMPREVISTOS', 'INGRESO_FONDO_IMPREVISTOS',
                          'FONDO_IMPREVISTOS_EFECTIVO', 'RENDIMIENTO_FINANCIERO_FONDO') then
    v_requiere_fondo_esperado := true;
  end if;

  if v_clase_esperada is not null and v_cuenta.clase <> v_clase_esperada then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) es clase % — el evento % espera '
      'una cuenta de clase %', v_cuenta.codigo, v_cuenta.nombre, v_cuenta.clase, v_evento_codigo,
      v_clase_esperada;
  end if;

  if v_grupo11_esperado and left(v_cuenta.codigo, 2) <> '11' then
    raise exception 'CUENTA_CONTABLE_CLASE_INCOMPATIBLE: % (%) no es efectivo (grupo 11) — el '
      'evento % exige una cuenta de caja o bancos', v_cuenta.codigo, v_cuenta.nombre,
      v_evento_codigo;
  end if;

  if v_requiere_fondo_esperado and not v_cuenta.requiere_fondo then
    raise exception 'CUENTA_SIN_DIMENSION_FONDO: % (%) no tiene requiere_fondo activo — el '
      'evento % es propio del dominio Fondos y su cuenta debe llevar esa dimensión (GAP-22)',
      v_cuenta.codigo, v_cuenta.nombre, v_evento_codigo;
  end if;

  return new;
end;
$$;

comment on function public.guard_contable_cuenta_default() is
  'Cuentas predeterminadas por evento (PC-3), con coherencia de clase (PC-9) y de dimensión '
  'fondo (GAP-22). MANT-6 Fase 1 agrega CONSUMO_REPUESTO_MANTENIMIENTO -> clase 5 (gasto).';

-- ── 5. fn_mant_registrar_consumo — genera comprobante cuando aplica ─────
-- Arity change (memory: agregar un parámetro, aun con default, crea un segundo overload) — drop
-- explícito de la firma vieja antes de recrear.
drop function if exists public.fn_mant_registrar_consumo(uuid, uuid, uuid, numeric, numeric);

create function public.fn_mant_registrar_consumo(
  p_ot_id uuid,
  p_repuesto_id uuid,
  p_almacen_id uuid,
  p_cantidad numeric,
  p_costo_unitario numeric default null,
  p_periodo_id uuid default null
)
returns public.mant_inventario_movimientos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ot public.mant_ordenes_trabajo;
  v_repuesto public.mant_repuestos;
  v_movimiento public.mant_inventario_movimientos;
  v_periodo public.periodos%rowtype;
  v_cuenta_gasto uuid;
  v_tipo_causacion bigint;
  v_centro_costo bigint;
  v_monto numeric(18, 2);
  v_comp_id uuid;
begin
  select * into v_ot from public.mant_ordenes_trabajo where id = p_ot_id;
  if v_ot.id is null then
    raise exception 'OT_INEXISTENTE: %', p_ot_id;
  end if;

  if (select auth.uid()) is not null
     and not public.has_role(v_ot.tenant_id, array['auxiliar', 'administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: no tienes rol suficiente en este tenant';
  end if;

  select * into v_repuesto from public.mant_repuestos where id = p_repuesto_id;
  if v_repuesto.id is null then
    raise exception 'REPUESTO_INEXISTENTE: %', p_repuesto_id;
  end if;

  -- Registro físico: SIEMPRE, sin excepción — nunca se bloquea por falta de parametrización
  -- contable (criterio original de 20260932140000, preservado sin cambios en esta fase).
  insert into public.mant_inventario_movimientos (
    tenant_id, repuesto_id, almacen_id, tipo, cantidad, costo_unitario,
    orden_trabajo_id, registrado_por
  ) values (
    v_ot.tenant_id, p_repuesto_id, p_almacen_id, 'salida', p_cantidad, p_costo_unitario,
    p_ot_id, (select auth.uid())
  ) returning * into v_movimiento;

  if v_repuesto.politica_contable = 'inventario' then
    begin
      if p_costo_unitario is null then
        raise exception 'CONSUMO_COSTO_UNITARIO_REQUERIDO: % (politica_contable inventario) '
          'exige costo_unitario para valorizar el consumo', v_repuesto.nombre;
      end if;
      if p_periodo_id is null then
        raise exception 'CONTABLE_PERIODO_REQUERIDO: falta p_periodo_id para contabilizar el '
          'consumo de %', v_repuesto.nombre;
      end if;

      select * into v_periodo from public.periodos
        where id = p_periodo_id and tenant_id = v_ot.tenant_id;
      if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
        raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
          p_periodo_id;
      end if;

      select cd.contable_cuenta_id into v_cuenta_gasto
      from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
      where cd.tenant_id = v_ot.tenant_id and lt.tipo = 'EVENTO_CONTABLE'
        and lt.codigo = 'CONSUMO_REPUESTO_MANTENIMIENTO';
      if v_cuenta_gasto is null then
        raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: CONSUMO_REPUESTO_MANTENIMIENTO sin '
          'cuenta contable predeterminada para este tenant';
      end if;

      if v_repuesto.contable_cuenta_id is null then
        raise exception 'REPUESTO_POLITICA_INVENTARIO_SIN_CUENTA: % no tiene cuenta de '
          'existencias — no debería ser posible (ver guard_mant_repuesto)', v_repuesto.nombre;
      end if;

      select id into v_tipo_causacion from public.lista_tipos
        where tipo = 'TIPO_COMPROBANTE' and codigo = 'CAUSACION' and tenant_id is null;

      if v_ot.activo_id is not null then
        select centro_costo_id into v_centro_costo from public.activos where id = v_ot.activo_id;
      end if;

      v_monto := round(p_cantidad * p_costo_unitario, 2);

      insert into public.contable_comprobante (
        tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
        origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
      ) values (
        v_ot.tenant_id, p_periodo_id, v_tipo_causacion, v_periodo.anio,
        -- fn_contabilizar_comprobante exige fecha dentro del mes del periodo
        -- (COMPROBANTE_FECHA_FUERA_DE_PERIODO) — el consumo no necesariamente ocurre en el
        -- periodo en curso, así que se usa el último día del periodo dado, no current_date
        -- (mismo criterio que fn_mant_reconocer_depreciacion).
        (make_date(v_periodo.anio, v_periodo.mes, 1) + interval '1 month' - interval '1 day')::date,
        'Consumo de ' || v_repuesto.nombre || ' — OT ' || v_ot.anio || '-' || v_ot.numero,
        'mantenimiento', 'mant_inventario_movimientos', v_movimiento.id, 'consumo_repuesto',
        (select auth.uid())
      )
      returning id into v_comp_id;

      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        centro_costo_id, origen_entidad, origen_id
      ) values (
        v_ot.tenant_id, v_comp_id, 1, v_cuenta_gasto, v_monto, 0,
        'Consumo ' || v_repuesto.nombre, v_centro_costo, 'mant_repuestos', p_repuesto_id
      );

      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        origen_entidad, origen_id
      ) values (
        v_ot.tenant_id, v_comp_id, 2, v_repuesto.contable_cuenta_id, 0, v_monto,
        'Consumo ' || v_repuesto.nombre, 'mant_repuestos', p_repuesto_id
      );

      perform public.fn_contabilizar_comprobante(v_comp_id);
    exception when others then
      -- El físico ya quedó registrado arriba; cualquier falla al valorizar/contabilizar se
      -- absorbe aquí (mismo idioma que fn_mant_reconocer_depreciacion por activo) — el consumo
      -- reaparece en mant_inventario_pendientes_contabilizar() con el motivo real.
      null;
    end;
  end if;

  return v_movimiento;
end;
$$;

comment on function public.fn_mant_registrar_consumo(uuid, uuid, uuid, numeric, numeric, uuid) is
  'MANT-6 §4.3 + Fase 1: registra SIEMPRE el consumo físico (salida enlazada por '
  'orden_trabajo_id) — nunca se bloquea por falta de parametrización contable. Si el repuesto '
  'tiene politica_contable = ''inventario'', además intenta generar un comprobante (Débito '
  'CONSUMO_REPUESTO_MANTENIMIENTO / Crédito la cuenta de existencias del repuesto) usando '
  'p_costo_unitario y p_periodo_id — cualquier falla (costo/periodo faltante, periodo cerrado, '
  'parametrización pendiente) se absorbe sin abortar el registro físico; ver '
  'mant_inventario_pendientes_contabilizar(). Si politica_contable = ''gasto_directo'' (default), '
  'ningún comprobante se genera aquí — mismo comportamiento que antes de esta fase.';

-- ── 6. Diagnóstico — acotado a politica_contable = 'inventario' ─────────
create or replace function public.mant_inventario_pendientes_contabilizar(p_tenant_id uuid)
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
  join public.mant_repuestos r on r.id = m.repuesto_id
  where m.tenant_id = p_tenant_id
    and m.tipo = 'salida'
    and m.orden_trabajo_id is not null
    and r.politica_contable = 'gasto_directo'
  union all
  select
    m.id,
    m.orden_trabajo_id,
    m.repuesto_id,
    m.cantidad,
    m.registrado_at,
    'INVENTARIO_CONSUMO_SIN_CONTABILIZAR'
  from public.mant_inventario_movimientos m
  join public.mant_repuestos r on r.id = m.repuesto_id
  where m.tenant_id = p_tenant_id
    and m.tipo = 'salida'
    and m.orden_trabajo_id is not null
    and r.politica_contable = 'inventario'
    and not exists (
      select 1 from public.contable_comprobante c
      where c.tenant_id = m.tenant_id
        and c.origen_modulo = 'mantenimiento'
        and c.origen_entidad = 'mant_inventario_movimientos'
        and c.origen_id = m.id
        and c.origen_evento = 'consumo_repuesto'
    );
$$;

comment on function public.mant_inventario_pendientes_contabilizar(uuid) is
  'MANT-6 §3 + Fase 1: dos motivos posibles, ambos de solo lectura (mismo criterio que '
  'contable_parametrizacion_pendiente, PC-4). INVENTARIO_POLITICA_CONTABLE_NO_DEFINIDA: el '
  'repuesto sigue en ''gasto_directo'' (default) — su consumo nunca genera comprobante aquí, a '
  'propósito (el gasto se reconoce en la compra, fuera de esta fase). '
  'INVENTARIO_CONSUMO_SIN_CONTABILIZAR: el repuesto SÍ es ''inventario'' pero '
  'fn_mant_registrar_consumo no pudo generar el comprobante (costo/periodo faltante, periodo '
  'cerrado o cuentas sin parametrizar) — este es el caso que de verdad requiere acción.';
