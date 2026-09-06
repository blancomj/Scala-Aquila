-- ═══════════════════════════════════════════════════════════════════════
--  CO-3 · Corrección — fn_contabilizar_periodo referenciaba `detalle` sin
--  calificar dentro del string_agg que arma el mensaje de
--  CONTABLE_PARAMETRIZACION_PENDIENTE: `detalle` es ambiguo entre la
--  columna de contable_parametrizacion_pendiente() y la columna de retorno
--  homónima de la propia función. `supabase db lint` lo detectó tras
--  aplicar 20260930240000 (sqlState 42702). Se corrige con
--  `create or replace` en vez de editar la migración ya aplicada.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_contabilizar_periodo(p_tenant_id uuid, p_periodo_id uuid)
returns table (
  categoria      text,
  origen_entidad text,
  origen_id      uuid,
  comprobante_id uuid,
  detalle        text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo               public.periodos%rowtype;
  v_desde                  date;
  v_hasta                  date;
  v_pendientes             text;
  v_tipo_causacion         bigint;
  v_tipo_ingreso           bigint;
  v_tipo_reclasificacion   bigint;
  v_batch                  record;
  v_comp_id                uuid;
  v_existente              uuid;
  v_linea                  smallint;
  v_hecho                  record;
  v_alguna                 boolean;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para materializar';
  end if;

  select * into v_periodo from public.periodos
  where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  select string_agg(pend.ambito || ': ' || pend.referencia || ' — ' || pend.detalle, '; ')
    into v_pendientes
  from public.contable_parametrizacion_pendiente(p_tenant_id) pend
  where pend.ambito <> 'movimiento_sin_contrapartida';

  if v_pendientes is not null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: %', v_pendientes;
  end if;

  v_desde := make_date(v_periodo.anio, v_periodo.mes, 1);
  v_hasta := (v_desde + interval '1 month' - interval '1 day')::date;

  select id into v_tipo_causacion from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'CAUSACION' and tenant_id is null;
  select id into v_tipo_ingreso from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'INGRESO' and tenant_id is null;
  select id into v_tipo_reclasificacion from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'RECLASIFICACION' and tenant_id is null;

  -- ── Camino B: un comprobante por (periodo, entidad) para cartera ────────
  for v_batch in
    select * from (values
      ('cargos'::text, v_tipo_causacion,
        'Causación de cartera — periodo ' || v_periodo.anio || '-' || lpad(v_periodo.mes::text, 2, '0')),
      ('pago_aplicaciones'::text, v_tipo_ingreso,
        'Recaudo aplicado — periodo ' || v_periodo.anio || '-' || lpad(v_periodo.mes::text, 2, '0')),
      ('pagos'::text, v_tipo_ingreso,
        'Anticipos — periodo ' || v_periodo.anio || '-' || lpad(v_periodo.mes::text, 2, '0'))
    ) as t(entidad, tipo_id, descripcion)
  loop
    select id into v_existente from public.contable_comprobante
    where tenant_id = p_tenant_id and origen_modulo = 'cartera' and origen_entidad = v_batch.entidad
      and origen_id = p_periodo_id and origen_evento = 'materializacion_periodo';

    if v_existente is not null then
      return query select 'omitido'::text, v_batch.entidad, p_periodo_id, v_existente, null::text;
      continue;
    end if;

    v_alguna := false;
    v_comp_id := null;
    begin
      for v_hecho in
        select * from public.contable_hechos(p_tenant_id, v_desde, v_hasta) h
        where h.entidad = v_batch.entidad
      loop
        if not v_alguna then
          insert into public.contable_comprobante (
            tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
            origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
          ) values (
            p_tenant_id, p_periodo_id, v_batch.tipo_id, v_periodo.anio, v_desde, v_batch.descripcion,
            'cartera', v_batch.entidad, p_periodo_id, 'materializacion_periodo', (select auth.uid())
          )
          returning id into v_comp_id;
          v_linea := 1;
          v_alguna := true;
        end if;

        insert into public.contable_comprobante_detalle (
          tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
          tercero_id, inmueble_id, centro_costo_id, agrupacion_id, fondo_id,
          origen_entidad, origen_id
        ) values (
          p_tenant_id, v_comp_id, v_linea, v_hecho.cuenta_debito,
          greatest(v_hecho.monto, 0), greatest(-v_hecho.monto, 0), v_hecho.descripcion,
          v_hecho.tercero_id, v_hecho.inmueble_id, v_hecho.centro_costo_id, v_hecho.agrupacion_id,
          v_hecho.fondo_id, v_hecho.entidad, v_hecho.origen_id
        );
        v_linea := v_linea + 1;

        insert into public.contable_comprobante_detalle (
          tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
          tercero_id, inmueble_id, centro_costo_id, agrupacion_id, fondo_id,
          origen_entidad, origen_id
        ) values (
          p_tenant_id, v_comp_id, v_linea, v_hecho.cuenta_credito,
          greatest(-v_hecho.monto, 0), greatest(v_hecho.monto, 0), v_hecho.descripcion,
          v_hecho.tercero_id, v_hecho.inmueble_id, v_hecho.centro_costo_id, v_hecho.agrupacion_id,
          v_hecho.fondo_id, v_hecho.entidad, v_hecho.origen_id
        );
        v_linea := v_linea + 1;
      end loop;

      if v_alguna then
        perform public.fn_contabilizar_comprobante(v_comp_id);
        return query select 'creado'::text, v_batch.entidad, p_periodo_id, v_comp_id, null::text;
      end if;
    exception when others then
      return query select 'fallido'::text, v_batch.entidad, p_periodo_id, null::uuid, sqlerrm;
    end;
  end loop;

  -- ── Camino A: un comprobante por hecho — presupuesto_ejecucion y fondo_movimientos ──
  for v_hecho in
    select * from public.contable_hechos(p_tenant_id, v_desde, v_hasta) h
    where h.entidad in ('presupuesto_ejecucion', 'fondo_movimientos')
  loop
    if v_hecho.cuenta_debito is null or v_hecho.cuenta_credito is null then
      return query select 'sin_contrapartida'::text, v_hecho.entidad, v_hecho.origen_id,
        null::uuid,
        'sin contrapartida resoluble (presupuesto_ejecucion.liquidacion IS NULL, anterior a PC-4)';
      continue;
    end if;

    select id into v_existente from public.contable_comprobante
    where tenant_id = p_tenant_id
      and origen_modulo = (case when v_hecho.entidad = 'presupuesto_ejecucion'
                                 then 'presupuesto' else 'fondos' end)
      and origen_entidad = v_hecho.entidad
      and origen_id = v_hecho.origen_id
      and origen_evento = 'materializacion';

    if v_existente is not null then
      return query select 'omitido'::text, v_hecho.entidad, v_hecho.origen_id, v_existente, null::text;
      continue;
    end if;

    v_comp_id := null;
    begin
      insert into public.contable_comprobante (
        tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
        origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
      ) values (
        p_tenant_id, p_periodo_id,
        case when v_hecho.entidad = 'presupuesto_ejecucion' then v_tipo_causacion else v_tipo_reclasificacion end,
        v_periodo.anio, v_hecho.fecha, v_hecho.descripcion,
        case when v_hecho.entidad = 'presupuesto_ejecucion' then 'presupuesto' else 'fondos' end,
        v_hecho.entidad, v_hecho.origen_id, 'materializacion', (select auth.uid())
      )
      returning id into v_comp_id;

      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        tercero_id, inmueble_id, centro_costo_id, agrupacion_id, fondo_id, origen_entidad, origen_id
      ) values
      (p_tenant_id, v_comp_id, 1, v_hecho.cuenta_debito,
        greatest(v_hecho.monto, 0), greatest(-v_hecho.monto, 0), v_hecho.descripcion,
        v_hecho.tercero_id, v_hecho.inmueble_id, v_hecho.centro_costo_id, v_hecho.agrupacion_id,
        v_hecho.fondo_id, v_hecho.entidad, v_hecho.origen_id),
      (p_tenant_id, v_comp_id, 2, v_hecho.cuenta_credito,
        greatest(-v_hecho.monto, 0), greatest(v_hecho.monto, 0), v_hecho.descripcion,
        v_hecho.tercero_id, v_hecho.inmueble_id, v_hecho.centro_costo_id, v_hecho.agrupacion_id,
        v_hecho.fondo_id, v_hecho.entidad, v_hecho.origen_id);

      perform public.fn_contabilizar_comprobante(v_comp_id);
      return query select 'creado'::text, v_hecho.entidad, v_hecho.origen_id, v_comp_id, null::text;
    exception when others then
      return query select 'fallido'::text, v_hecho.entidad, v_hecho.origen_id, null::uuid, sqlerrm;
    end;
  end loop;
end;
$$;

comment on function public.fn_contabilizar_periodo(uuid, uuid) is
  'CO-3: materializa un periodo — camino B (un comprobante por periodo+entidad) para cartera '
  '(cargos/pago_aplicaciones/pagos), camino A (un comprobante por hecho) para '
  'presupuesto_ejecucion/fondo_movimientos (D-46). Idempotente: además del índice único de '
  'origen de CO-2, verifica existencia antes de intentar crear y reporta ''omitido'' en vez de '
  'reventar. Cada comprobante se aísla en su propio bloque BEGIN/EXCEPTION (savepoint '
  'implícito): un hecho mal parametrizado no aborta el resto del periodo. Se contabiliza vía '
  'fn_contabilizar_comprobante (nunca INSERT directo) — las validaciones de CO-2 aplican igual '
  'a lo automático. SECURITY DEFINER con verificación interna de has_role.';
