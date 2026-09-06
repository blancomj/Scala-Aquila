-- ═══════════════════════════════════════════════════════════════════════
--  CO-3 · Materialización — fn_contabilizar_periodo() y conciliación
--  (Casos de uso/Tres Modulos/Contabilidad/CO_03_materializacion_asientos.md §4.2-§4.4)
--
--  Decisión arquitectónica (D-46, DECISIONES.md): camino B (un comprobante por
--  (periodo, entidad)) para cartera — cargos → CAUSACION, pago_aplicaciones/pagos → INGRESO —
--  y camino A (un comprobante por hecho) para presupuesto_ejecucion (CAUSACION) y
--  fondo_movimientos (RECLASIFICACION). La línea de detalle SIEMPRE conserva el
--  origen_entidad/origen_id del hecho individual, sea cual sea el camino — así la trazabilidad
--  al cargo/pago concreto nunca se pierde ni siquiera dentro de un comprobante-lote.
--
--  Precondición dura (§4.2.1) — decisión confirmada por el usuario: contable_parametrizacion_
--  pendiente() se consulta TAL CUAL (no se le cambia la firma), pero se filtra su ámbito
--  'movimiento_sin_contrapartida' (presupuesto_ejecucion.liquidacion IS NULL, datos de antes de
--  PC-4) de lo que bloquea — esas filas no impiden materializar el resto del tenant, se excluyen
--  individualmente y se reportan como 'sin_contrapartida' (§4.4). El resto de los ámbitos
--  (cuentas/eventos/fondos/conceptos sin mapear) sí bloquean, sin importar el rango de fechas:
--  son configuración compartida entre periodos, no un dato de un periodo específico.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contabilizar_periodo(p_tenant_id uuid, p_periodo_id uuid)
returns table (
  categoria      text,   -- 'creado' | 'omitido' | 'fallido' | 'sin_contrapartida'
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

  select string_agg(ambito || ': ' || referencia || ' — ' || detalle, '; ')
    into v_pendientes
  from public.contable_parametrizacion_pendiente(p_tenant_id)
  where ambito <> 'movimiento_sin_contrapartida';

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
      -- Solo puede pasar por presupuesto_ejecucion.liquidacion IS NULL (§4.4): el resto de
      -- huecos de parametrización ya los bloqueó la precondición de arriba.
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

-- ── Conciliación proyección vs. persistido (§4.3) — el contrato verificable ────────────────────
create function public.contable_conciliacion_proyeccion(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date
)
returns table (
  cuenta_codigo       text,
  debito_proyeccion   numeric,
  credito_proyeccion  numeric,
  debito_persistido   numeric,
  credito_persistido  numeric,
  diferencia_debito   numeric,
  diferencia_credito  numeric
)
language sql
stable
set search_path = ''
as $$
  with proyeccion as (
    -- Excluye cuenta_codigo NULL: son los hechos sin contrapartida resoluble
    -- (presupuesto_ejecucion.liquidacion IS NULL), que fn_contabilizar_periodo excluye a
    -- propósito de la materialización (§4.4) y reporta aparte como 'sin_contrapartida' — no son
    -- una divergencia entre proyección y persistido, es lo mismo dato ya conocido en ambos lados.
    select cuenta_codigo, sum(debito) as debito, sum(credito) as credito
    from public.contable_movimientos(p_tenant_id, p_desde, p_hasta)
    where cuenta_codigo is not null
    group by cuenta_codigo
  ),
  persistido as (
    select cc.codigo as cuenta_codigo, sum(d.debito) as debito, sum(d.credito) as credito
    from public.contable_comprobante_detalle d
    join public.contable_comprobante c on c.id = d.comprobante_id
    join public.contable_cuenta cc on cc.id = d.cuenta_id
    where c.tenant_id = p_tenant_id
      and c.estado = 'contabilizado'
      and c.fecha between p_desde and p_hasta
    group by cc.codigo
  )
  select
    coalesce(p.cuenta_codigo, q.cuenta_codigo),
    coalesce(p.debito, 0), coalesce(p.credito, 0),
    coalesce(q.debito, 0), coalesce(q.credito, 0),
    coalesce(p.debito, 0) - coalesce(q.debito, 0),
    coalesce(p.credito, 0) - coalesce(q.credito, 0)
  from proyeccion p
  full join persistido q on q.cuenta_codigo = p.cuenta_codigo
  where coalesce(p.debito, 0) - coalesce(q.debito, 0) <> 0
     or coalesce(p.credito, 0) - coalesce(q.credito, 0) <> 0;
$$;

comment on function public.contable_conciliacion_proyeccion(uuid, date, date) is
  'CO-3: compara, por cuenta, lo que contable_movimientos() proyecta contra lo que hay '
  'persistido y contabilizado en el rango. Devuelve SOLO las diferencias — vacía significa '
  'conciliado. Es el mecanismo que hace verificable el contrato de materialización (§4.3): si '
  'no está vacía después de materializar, hay dos verdades y el corte no está terminado. '
  'Comprobantes ''borrador''/''anulado'' no cuentan como persistido (solo ''contabilizado'').';
