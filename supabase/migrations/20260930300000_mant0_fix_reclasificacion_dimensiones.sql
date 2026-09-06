-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Corrección — fn_mant_capitalizar_activo no conservaba las
--  dimensiones (centro_costo/tercero/agrupación) del pago original al
--  reclasificarlo de gasto a activo. Detectado con un smoke test manual
--  (no `supabase db lint`, que no puede ver esto — es una omisión de datos,
--  no un error de sintaxis): capitalizar un activo pagado contra una cuenta
--  de gasto que exige centro de costo fallaba con
--  COMPROBANTE_DIMENSION_REQUERIDA, porque la línea de crédito (reclasificación)
--  no llevaba ningún centro_costo_id — la inmensa mayoría de las cuentas de
--  gasto del PUC vigente lo exige (verificado en CO-3). Se corrige con
--  `create or replace` en vez de editar 20260930290000 ya aplicada.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_mant_capitalizar_activo(
  p_tenant_id uuid, p_activo_id uuid, p_periodo_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo public.activos%rowtype;
  v_periodo public.periodos%rowtype;
  v_pagado numeric(18,2);
  v_comp_id uuid;
  v_linea smallint := 1;
  v_fuente record;
  v_tipo_reclasificacion bigint;
  v_tipo_causacion bigint;
  v_cuenta_patrimonio uuid;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para capitalizar';
  end if;

  select * into v_activo from public.activos where id = p_activo_id and tenant_id = p_tenant_id;
  if v_activo.id is null then
    raise exception 'ACTIVO_INVALIDO: % no existe o no pertenece al tenant', p_activo_id;
  end if;
  if v_activo.capitalizado then
    raise exception 'ACTIVO_BLOQUE_CONTABLE_INCOMPLETO: % ya está capitalizado', p_activo_id;
  end if;
  if v_activo.naturaleza_bien = 'bien_comun_esencial' then
    raise exception 'ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE: % es un bien común esencial (Ley '
      '675 art. 20) — nunca puede capitalizarse', p_activo_id;
  end if;
  if v_activo.valor_adquisicion is null or v_activo.fecha_adquisicion is null
     or v_activo.contable_cuenta_id is null or v_activo.vida_util_meses is null then
    raise exception 'ACTIVO_BLOQUE_CONTABLE_INCOMPLETO: capitalizar exige valor_adquisicion, '
      'fecha_adquisicion, contable_cuenta_id y vida_util_meses';
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  select id into v_tipo_reclasificacion from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'RECLASIFICACION' and tenant_id is null;
  select id into v_tipo_causacion from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'CAUSACION' and tenant_id is null;

  select coalesce(sum(pe.monto), 0) into v_pagado
  from public.presupuesto_ejecucion pe where pe.activo_id = p_activo_id;

  if v_pagado > 0 then
    if v_pagado <> v_activo.valor_adquisicion then
      raise exception 'ACTIVO_VALOR_ADQUISICION_NO_CONCILIA: presupuesto_ejecucion vinculada '
        'suma % pero valor_adquisicion es % — revisa la captura', v_pagado, v_activo.valor_adquisicion;
    end if;

    insert into public.contable_comprobante (
      tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
      origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
    ) values (
      p_tenant_id, p_periodo_id, v_tipo_reclasificacion, v_periodo.anio, v_activo.fecha_adquisicion,
      'Capitalización de ' || v_activo.nombre, 'mantenimiento', 'activos', p_activo_id,
      'capitalizacion', (select auth.uid())
    )
    returning id into v_comp_id;

    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
      origen_entidad, origen_id
    ) values (
      p_tenant_id, v_comp_id, v_linea, v_activo.contable_cuenta_id, v_activo.valor_adquisicion, 0,
      'Capitalización ' || v_activo.nombre, 'activos', p_activo_id
    );
    v_linea := v_linea + 1;

    -- Cada línea conserva las dimensiones (centro_costo/tercero/agrupación) que ya traía el pago
    -- original en presupuesto_ejecucion — es la corrección de esta migración.
    for v_fuente in
      select pe.cuenta_id as presupuesto_cuenta_id, pc.contable_cuenta_id,
        pe.centro_costo_id, pe.tercero_id, pe.agrupacion_id, sum(pe.monto) as monto
      from public.presupuesto_ejecucion pe
      join public.presupuesto_cuenta pc on pc.id = pe.cuenta_id
      where pe.activo_id = p_activo_id
      group by pe.cuenta_id, pc.contable_cuenta_id, pe.centro_costo_id, pe.tercero_id, pe.agrupacion_id
    loop
      if v_fuente.contable_cuenta_id is null then
        raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: la cuenta presupuestal % no tiene '
          'cuenta contable vinculada', v_fuente.presupuesto_cuenta_id;
      end if;
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        centro_costo_id, tercero_id, agrupacion_id, origen_entidad, origen_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_fuente.contable_cuenta_id, 0, v_fuente.monto,
        'Reclasificación desde gasto — ' || v_activo.nombre,
        v_fuente.centro_costo_id, v_fuente.tercero_id, v_fuente.agrupacion_id, 'activos', p_activo_id
      );
      v_linea := v_linea + 1;
    end loop;
  else
    select cd.contable_cuenta_id into v_cuenta_patrimonio
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE'
      and lt.codigo = 'RECONOCIMIENTO_BIEN_DESAFECTADO';
    if v_cuenta_patrimonio is null then
      raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: RECONOCIMIENTO_BIEN_DESAFECTADO no '
        'tiene cuenta contable predeterminada para este tenant';
    end if;

    insert into public.contable_comprobante (
      tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
      origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
    ) values (
      p_tenant_id, p_periodo_id, v_tipo_causacion, v_periodo.anio, v_activo.fecha_adquisicion,
      'Reconocimiento de ' || v_activo.nombre, 'mantenimiento', 'activos', p_activo_id,
      'capitalizacion', (select auth.uid())
    )
    returning id into v_comp_id;

    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
      origen_entidad, origen_id
    ) values
      (p_tenant_id, v_comp_id, 1, v_activo.contable_cuenta_id, v_activo.valor_adquisicion, 0,
       'Reconocimiento inicial ' || v_activo.nombre, 'activos', p_activo_id),
      (p_tenant_id, v_comp_id, 2, v_cuenta_patrimonio, 0, v_activo.valor_adquisicion,
       'Reconocimiento inicial ' || v_activo.nombre, 'activos', p_activo_id);
  end if;

  perform public.fn_contabilizar_comprobante(v_comp_id);

  update public.activos
    set capitalizado = true,
        fecha_inicio_depreciacion = coalesce(fecha_inicio_depreciacion, v_activo.fecha_adquisicion)
    where id = p_activo_id;

  return v_comp_id;
end;
$$;

comment on function public.fn_mant_capitalizar_activo(uuid, uuid, uuid) is
  'MANT-0: única vía para llevar un activo a capitalizado = true — nunca un UPDATE directo. '
  'Si hay presupuesto_ejecucion.activo_id vinculada (bien comprado), reclasifica ese gasto ya '
  'pagado al activo (RECLASIFICACION), conservando las dimensiones (centro_costo/tercero/'
  'agrupación) que ya traía el pago original; si no (bien desafectado, caso raro), causa el '
  'reconocimiento inicial contra RECONOCIMIENTO_BIEN_DESAFECTADO (CAUSACION), sin cuenta por '
  'defecto. Bloquea ACTIVO_BIEN_ESENCIAL_NO_CAPITALIZABLE sin excepción — hallazgo de esta '
  'sesión (Ley 675 art. 20, CTCP 243/2025). SECURITY DEFINER con verificación interna de '
  'has_role, igual que fn_contabilizar_periodo (CO-3).';
