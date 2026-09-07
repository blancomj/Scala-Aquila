-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (6/7)
--  §3.4 — enganche con CO-3, la parte que el corte pide "declarar y
--  coordinar con el prompt vigente de CO-3".
--
--  Analizado con el usuario en el Plan del corte (D-58): contable_hechos()
--  devuelve una fila por hecho con un solo par débito/crédito;
--  fn_contabilizar_periodo() inserta 2 líneas por hecho; contable_
--  movimientos() (la proyección de solo lectura — Libro Mayor, Balance,
--  Estados Financieros) es un wrapper directo sobre la misma fuente. La
--  prueba central de CO-3 (contable_conciliacion_proyeccion, "cero
--  diferencias siempre") compara, por cuenta, la suma de la proyección
--  contra la suma de lo persistido — si el comprobante de una factura
--  tiene más líneas que las que la proyección muestra, esa conciliación
--  revienta.
--
--  Solución MÁS QUIRÚRGICA que la esbozada en el Plan: NO hace falta
--  tocar contable_hechos() (su contrato de una fila por hecho queda
--  intacto, cero riesgo para nada que ya lo consuma). Basta con que los
--  DOS CONSUMIDORES —contable_movimientos() (proyección) y
--  fn_contabilizar_periodo() (persistido)— reconozcan, cada uno en su
--  propio punto de expansión a líneas, cuándo un hecho de
--  presupuesto_ejecucion viene de una factura, y en ese caso usen
--  finanzas_factura_descomposicion() (20260931160000) en vez de su
--  expansión genérica de 2 líneas. Mismo resultado que la opción
--  aprobada (contable_hechos()/fn_contabilizar_periodo() "extendidos"),
--  con menor superficie de cambio sobre código de CO-3 ya enviado.
--
--  contable_hechos() NO se toca — se reutiliza tal cual, sin `create or
--  replace`, en este archivo.
-- ═══════════════════════════════════════════════════════════════════════

-- ── contable_movimientos(): mismo nombre/firma/salida — la proyección ahora reconoce facturas ──
create or replace function public.contable_movimientos(
  p_tenant_id uuid,
  p_desde     date,
  p_hasta     date
)
returns table (
  fecha           date,
  origen          text,
  entidad         text,
  origen_id       uuid,
  documento       text,
  descripcion     text,
  cuenta_codigo   text,
  cuenta_nombre   text,
  debito          numeric,
  credito         numeric,
  tercero_id      uuid,
  inmueble_id     uuid,
  centro_costo_id bigint,
  agrupacion_id   uuid,
  fondo_id        uuid
)
language sql
stable
set search_path = ''
as $$
  select
    h.fecha, h.origen, h.entidad, h.origen_id, h.documento, h.descripcion,
    cc.codigo, cc.nombre,
    l.debito, l.credito,
    h.tercero_id, h.inmueble_id, h.centro_costo_id, h.agrupacion_id, h.fondo_id
  from public.contable_hechos(p_tenant_id, p_desde, p_hasta) h
  cross join lateral (
    -- Un hecho de presupuesto_ejecucion enlazado a una factura se proyecta con la MISMA
    -- descomposición que CO-3 persistirá (finanzas_factura_descomposicion) — nunca el par
    -- genérico cuenta_debito/cuenta_credito de contable_hechos(), que para este caso solo
    -- resuelve la contrapartida simplificada (gasto vs. neto), no el desglose de IVA/CxP.
    select fd.cuenta_id, fd.debito, fd.credito
    from public.finanzas_factura_descomposicion(h.origen_id) fd
    where h.entidad = 'presupuesto_ejecucion'

    union all

    select v.cuenta_id, v.debito, v.credito
    from (values
      (h.cuenta_debito,  greatest(h.monto, 0),  greatest(-h.monto, 0)),
      (h.cuenta_credito, greatest(-h.monto, 0), greatest(h.monto, 0))
    ) as v(cuenta_id, debito, credito)
    where h.entidad <> 'presupuesto_ejecucion'
       or not exists (
         select 1 from public.finanzas_facturas_proveedor ffp
         where ffp.presupuesto_ejecucion_id = h.origen_id
       )
  ) as l(cuenta_id, debito, credito)
  left join public.contable_cuenta cc on cc.id = l.cuenta_id
  order by h.fecha, h.origen_id, l.debito desc;
$$;

comment on function public.contable_movimientos(uuid, date, date) is
  'Proyección contable en partida doble (PC-5) de cartera, recaudo, anticipos (RC-1) y sus '
  'reversas (RC-2), ejecución presupuestal y fondos. No persiste asientos: los deriva. Un hecho '
  'de presupuesto_ejecucion enlazado a una factura (FIN-2) se proyecta con '
  'finanzas_factura_descomposicion() en vez del par genérico — mantiene "cero diferencias" '
  'contra fn_contabilizar_periodo() (contable_conciliacion_proyeccion, CO-3). El resto es '
  'idéntico a la versión de CO-3 (20260930230000): fondos por signo de '
  'fn_fondo_movimiento_efecto, BLOQUE K (D-38) para FONDO_IMPREVISTOS.';

-- ── fn_contabilizar_periodo(): Camino A reconoce facturas, resto sin cambios ───────────────
create or replace function public.fn_contabilizar_periodo(p_tenant_id uuid, p_periodo_id uuid)
returns table (
  categoria      text,
  hecho_entidad  text,
  hecho_id       uuid,
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
  v_factura_id             uuid;
  v_decomp                 record;
  v_alguna_sin_cuenta      boolean;
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
    -- ── FIN-2: un hecho de presupuesto_ejecucion enlazado a una factura se descompone en N
    -- líneas (finanzas_factura_descomposicion), no el par genérico de abajo. Rama enteramente
    -- aparte para no arriesgar el camino ya probado de todo lo que no es factura.
    v_factura_id := null;
    if v_hecho.entidad = 'presupuesto_ejecucion' then
      select ffp.id into v_factura_id from public.finanzas_facturas_proveedor ffp
      where ffp.presupuesto_ejecucion_id = v_hecho.origen_id;
    end if;

    if v_factura_id is not null then
      select bool_or(fd.cuenta_id is null) into v_alguna_sin_cuenta
      from public.finanzas_factura_descomposicion(v_hecho.origen_id) fd;

      if coalesce(v_alguna_sin_cuenta, true) then
        return query select 'sin_contrapartida'::text, v_hecho.entidad, v_hecho.origen_id, null::uuid,
          'sin contrapartida resoluble (factura sin cuenta contable configurada — '
          'IVA_DESCONTABLE/PROVEEDOR_SERVICIOS en contable_cuenta_default)';
        continue;
      end if;

      select id into v_existente from public.contable_comprobante
      where tenant_id = p_tenant_id and origen_modulo = 'presupuesto' and origen_entidad = v_hecho.entidad
        and origen_id = v_hecho.origen_id and origen_evento = 'materializacion';

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
          p_tenant_id, p_periodo_id, v_tipo_causacion, v_periodo.anio, v_hecho.fecha, v_hecho.descripcion,
          'presupuesto', v_hecho.entidad, v_hecho.origen_id, 'materializacion', (select auth.uid())
        )
        returning id into v_comp_id;

        v_linea := 1;
        for v_decomp in select * from public.finanzas_factura_descomposicion(v_hecho.origen_id) loop
          insert into public.contable_comprobante_detalle (
            tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
            tercero_id, inmueble_id, centro_costo_id, agrupacion_id, fondo_id, origen_entidad, origen_id
          ) values (
            p_tenant_id, v_comp_id, v_linea, v_decomp.cuenta_id, v_decomp.debito, v_decomp.credito,
            v_decomp.descripcion, v_hecho.tercero_id, v_hecho.inmueble_id, v_hecho.centro_costo_id,
            v_hecho.agrupacion_id, v_hecho.fondo_id, v_hecho.entidad, v_hecho.origen_id
          );
          v_linea := v_linea + 1;
        end loop;

        perform public.fn_contabilizar_comprobante(v_comp_id);
        return query select 'creado'::text, v_hecho.entidad, v_hecho.origen_id, v_comp_id, null::text;
      exception when others then
        return query select 'fallido'::text, v_hecho.entidad, v_hecho.origen_id, null::uuid, sqlerrm;
      end;

      continue;
    end if;

    -- ── Camino genérico (sin factura), exactamente como antes de FIN-2 ──
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
  'presupuesto_ejecucion/fondo_movimientos (D-46). Un hecho de presupuesto_ejecucion enlazado a '
  'una factura (FIN-2, D-58) se descompone en N líneas vía finanzas_factura_descomposicion() en '
  'vez del par genérico — mantiene "cero diferencias" contra contable_movimientos(). '
  'Idempotente: además del índice único de origen de CO-2, verifica existencia antes de '
  'intentar crear y reporta ''omitido'' en vez de reventar. Cada comprobante se aísla en su '
  'propio bloque BEGIN/EXCEPTION (savepoint implícito). Se contabiliza vía '
  'fn_contabilizar_comprobante (nunca INSERT directo). SECURITY DEFINER con verificación interna '
  'de has_role.';
