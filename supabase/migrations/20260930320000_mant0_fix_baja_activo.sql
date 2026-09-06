-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Corrección — dos bugs reales en fn_mant_dar_baja_activo,
--  encontrados por la suite de pruebas (no por `supabase db lint`, que no
--  puede ver ninguno de los dos):
--
--  1. El comprobante de baja usaba `fecha = current_date` (la fecha real de
--     hoy) en vez de una fecha dentro del periodo recibido — igual que el
--     bug de `fn_reversar_comprobante` en CO-2, pero aquí nunca se corrigió
--     porque no existía antes. Con un periodo de prueba ficticio (2035),
--     current_date jamás cae dentro → COMPROBANTE_FECHA_FUERA_DE_PERIODO.
--  2. Si el activo aún no tiene depreciación reconocida (acumulada = 0) o
--     ya está totalmente depreciado (pérdida = 0), la línea correspondiente
--     queda con débito y crédito en cero — viola
--     contable_comprobante_detalle_un_solo_lado (CO-2). Se corrige
--     insertando solo las líneas con importe distinto de cero.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_mant_dar_baja_activo(
  p_tenant_id uuid, p_activo_id uuid, p_periodo_id uuid, p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activo public.activos%rowtype;
  v_periodo public.periodos%rowtype;
  v_acumulada numeric(18,2);
  v_perdida numeric(18,2);
  v_cuenta_acumulada uuid;
  v_cuenta_perdida uuid;
  v_tipo_id bigint;
  v_comp_id uuid;
  v_linea smallint := 1;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para dar de baja un activo';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'ACTIVO_MOTIVO_REQUERIDO: el retiro exige un motivo';
  end if;

  select * into v_activo from public.activos where id = p_activo_id and tenant_id = p_tenant_id;
  if v_activo.id is null then
    raise exception 'ACTIVO_INVALIDO: % no existe o no pertenece al tenant', p_activo_id;
  end if;

  update public.activos set estado = 'retirado', fecha_retiro = current_date where id = p_activo_id;

  insert into public.activo_estado_historial (tenant_id, activo_id, estado_anterior, estado_nuevo, motivo, registrado_por)
  select p_tenant_id, p_activo_id, v_activo.estado, 'retirado', p_motivo, (select auth.uid())
  where v_activo.estado is distinct from 'retirado';

  if not v_activo.capitalizado then
    return null;
  end if;

  select * into v_periodo from public.periodos where id = p_periodo_id and tenant_id = p_tenant_id;
  if v_periodo.id is null or v_periodo.contable_estado <> 'abierto' then
    raise exception 'CONTABLE_PERIODO_CERRADO: el periodo % no existe o no admite asientos',
      p_periodo_id;
  end if;

  select coalesce(sum(d.cuota_periodo), 0) into v_acumulada
  from public.mant_depreciacion_detalle d where d.activo_id = p_activo_id;
  v_perdida := v_activo.valor_adquisicion - v_acumulada;

  select cd.contable_cuenta_id into v_cuenta_acumulada
  from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'DEPRECIACION_ACUMULADA';
  select cd.contable_cuenta_id into v_cuenta_perdida
  from public.contable_cuenta_default cd join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'PERDIDA_RETIRO_ACTIVO';
  if v_cuenta_acumulada is null or v_cuenta_perdida is null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: DEPRECIACION_ACUMULADA/PERDIDA_RETIRO_ACTIVO '
      'sin cuenta contable predeterminada para este tenant';
  end if;

  select id into v_tipo_id from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'AJUSTE' and tenant_id is null;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
  ) values (
    p_tenant_id, p_periodo_id, v_tipo_id, v_periodo.anio,
    make_date(v_periodo.anio, v_periodo.mes, 1),
    'Baja de ' || v_activo.nombre || ' — ' || p_motivo,
    'mantenimiento', 'activos', p_activo_id, 'baja', (select auth.uid())
  )
  returning id into v_comp_id;

  -- Solo las líneas con importe distinto de cero: un activo sin depreciación reconocida
  -- todavía (acumulada = 0) o ya totalmente depreciado (pérdida = 0) no debe generar una línea
  -- con ambos lados en cero (contable_comprobante_detalle_un_solo_lado, CO-2).
  if v_acumulada > 0 then
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion, origen_entidad, origen_id
    ) values (
      p_tenant_id, v_comp_id, v_linea, v_cuenta_acumulada, v_acumulada, 0, 'Baja — depreciación acumulada', 'activos', p_activo_id
    );
    v_linea := v_linea + 1;
  end if;

  if v_perdida > 0 then
    insert into public.contable_comprobante_detalle (
      tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion, origen_entidad, origen_id
    ) values (
      p_tenant_id, v_comp_id, v_linea, v_cuenta_perdida, v_perdida, 0, 'Baja — pérdida en retiro', 'activos', p_activo_id
    );
    v_linea := v_linea + 1;
  end if;

  insert into public.contable_comprobante_detalle (
    tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion, origen_entidad, origen_id
  ) values (
    p_tenant_id, v_comp_id, v_linea, v_activo.contable_cuenta_id, 0, v_activo.valor_adquisicion, 'Baja — costo original', 'activos', p_activo_id
  );

  perform public.fn_contabilizar_comprobante(v_comp_id);
  return v_comp_id;
end;
$$;

comment on function public.fn_mant_dar_baja_activo(uuid, uuid, uuid, text) is
  'MANT-0 §4.3: retira el activo (transición de estado + historial) y, si estaba capitalizado, '
  'genera el comprobante de baja dentro del periodo recibido (nunca current_date — mismo bug '
  'que tuvo fn_reversar_comprobante en CO-2): acumulada a la fecha contra 1592 (solo si > 0), '
  'el neto en libros contra PERDIDA_RETIRO_ACTIVO (solo si > 0 — este corte no modela un precio '
  'de venta), y el costo original sale de la cuenta clase 15. Si no estaba capitalizado, el '
  'retiro es solo cambio de estado, sin comprobante (retorna NULL).';
