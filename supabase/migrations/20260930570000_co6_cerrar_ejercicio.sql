-- ═══════════════════════════════════════════════════════════════════════
--  CO-6 · Cierre de ejercicio — fn_contable_cerrar_ejercicio(tenant, anio)
--  (CO_06_cierre_apertura_correccion.md §3.4)
--
--  Genera UN comprobante CIERRE que cancela las cuentas de resultado (clases 4, 5 y 6) contra la
--  cuenta mapeada al evento RESULTADO_EJERCICIO (contable_cuenta_default, típicamente 3310 — ese
--  mapeo ya existe, CO-3/PC-3, no se crea otro).
--
--  Por qué se agrupa por la tupla completa de dimensiones (cuenta_id, tercero_id,
--  centro_costo_id, fondo_id, inmueble_id, agrupacion_id) y NO "una línea por cuenta": el guard
--  COMPROBANTE_DIMENSION_REQUERIDA de fn_contabilizar_comprobante (CO-2) exige que cada línea de
--  una cuenta con requiere_tercero/centro_costo/fondo/inmueble tenga esa dimensión rellena.
--  Colapsar toda la actividad de una cuenta en una sola línea perdería esas dimensiones cuando
--  distintas líneas originales tuvieran valores distintos — violaría un guard existente (MARCO
--  §9.2 prohíbe relajarlo). Agrupando por la tupla completa, cada línea de cierre conserva
--  exactamente las dimensiones de su grupo, así que el guard se satisface por construcción, sin
--  tocarlo. presupuesto_cuenta_id se excluye a propósito de la tupla: no es una dimensión que el
--  guard exija, y agrupar por ella fragmentaría el cierre sin ningún propósito (muchas cuentas
--  presupuestales hoja mapean a la misma cuenta contable).
--
--  Idempotencia: se verifica explícitamente ANTES de construir nada (mensaje propio,
--  CONTABLE_EJERCICIO_YA_CERRADO) en vez de dejar que el índice único de origen (CO-2) aborte a
--  medio armar el comprobante. origen_id es el id del periodo de diciembre del propio ejercicio —
--  ya es único por (tenant, año, mes) vía periodos_unico, no hace falta inventar otra clave.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_contable_cerrar_ejercicio(p_tenant_id uuid, p_anio smallint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_periodo_dic     public.periodos%rowtype;
  v_n_total         integer;
  v_n_cerrado       integer;
  v_existente       uuid;
  v_tipo_cierre_id  bigint;
  v_cuenta_resultado uuid;
  v_comp_id         uuid;
  v_linea           smallint := 0;
  v_total_debito    numeric(18,2) := 0;
  v_total_credito   numeric(18,2) := 0;
  v_diferencia      numeric(18,2);
  v_grupo           record;
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol auxiliar o administrador para cerrar el ejercicio';
  end if;

  select count(*), count(*) filter (where contable_estado = 'cerrado')
    into v_n_total, v_n_cerrado
  from public.periodos where tenant_id = p_tenant_id and anio = p_anio;

  if v_n_total <> 12 or v_n_cerrado <> 12 then
    raise exception 'CONTABLE_EJERCICIO_PERIODOS_INCOMPLETOS: % de 12 periodos de % están '
      'cerrados (se requieren los 12)', v_n_cerrado, p_anio;
  end if;

  select * into v_periodo_dic from public.periodos
  where tenant_id = p_tenant_id and anio = p_anio and mes = 12;

  select c.id into v_existente
  from public.contable_comprobante c
  where c.tenant_id = p_tenant_id and c.origen_modulo = 'contabilidad'
    and c.origen_entidad = 'ejercicio' and c.origen_id = v_periodo_dic.id
    and c.origen_evento = 'cierre_ejercicio';
  if v_existente is not null then
    raise exception 'CONTABLE_EJERCICIO_YA_CERRADO: el ejercicio % ya tiene comprobante de '
      'cierre (%)', p_anio, v_existente;
  end if;

  select id into v_tipo_cierre_id from public.lista_tipos
    where tipo = 'TIPO_COMPROBANTE' and codigo = 'CIERRE' and tenant_id is null;

  select cd.contable_cuenta_id into v_cuenta_resultado
  from public.contable_cuenta_default cd
  join public.lista_tipos lt on lt.id = cd.evento_id
  where cd.tenant_id = p_tenant_id and lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = 'RESULTADO_EJERCICIO';
  if v_cuenta_resultado is null then
    raise exception 'CONTABLE_PARAMETRIZACION_PENDIENTE: evento_contable: RESULTADO_EJERCICIO no '
      'tiene cuenta contable predeterminada para este tenant';
  end if;

  insert into public.contable_comprobante (
    tenant_id, periodo_id, tipo_id, anio, fecha, descripcion,
    origen_modulo, origen_entidad, origen_id, origen_evento, creado_por
  ) values (
    p_tenant_id, v_periodo_dic.id, v_tipo_cierre_id, p_anio, make_date(p_anio, 12, 31),
    'Cierre del ejercicio ' || p_anio,
    'contabilidad', 'ejercicio', v_periodo_dic.id, 'cierre_ejercicio', (select auth.uid())
  )
  returning id into v_comp_id;

  for v_grupo in
    select
      det.cuenta_id, det.tercero_id, det.centro_costo_id, det.fondo_id, det.inmueble_id,
      det.agrupacion_id,
      sum(det.debito) - sum(det.credito) as saldo_neto
    from public.contable_comprobante_detalle det
    join public.contable_comprobante c on c.id = det.comprobante_id
    join public.contable_cuenta cc on cc.id = det.cuenta_id
    where c.tenant_id = p_tenant_id and c.estado = 'contabilizado' and c.anio = p_anio
      and cc.clase in (4, 5, 6)
    group by det.cuenta_id, det.tercero_id, det.centro_costo_id, det.fondo_id, det.inmueble_id,
      det.agrupacion_id
    having sum(det.debito) - sum(det.credito) <> 0
  loop
    v_linea := v_linea + 1;
    if v_grupo.saldo_neto > 0 then
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        tercero_id, centro_costo_id, fondo_id, inmueble_id, agrupacion_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_grupo.cuenta_id, 0, v_grupo.saldo_neto,
        'Cierre del ejercicio ' || p_anio,
        v_grupo.tercero_id, v_grupo.centro_costo_id, v_grupo.fondo_id, v_grupo.inmueble_id,
        v_grupo.agrupacion_id
      );
      v_total_credito := v_total_credito + v_grupo.saldo_neto;
    else
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion,
        tercero_id, centro_costo_id, fondo_id, inmueble_id, agrupacion_id
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_grupo.cuenta_id, -v_grupo.saldo_neto, 0,
        'Cierre del ejercicio ' || p_anio,
        v_grupo.tercero_id, v_grupo.centro_costo_id, v_grupo.fondo_id, v_grupo.inmueble_id,
        v_grupo.agrupacion_id
      );
      v_total_debito := v_total_debito + (-v_grupo.saldo_neto);
    end if;
  end loop;

  v_diferencia := v_total_debito - v_total_credito;
  if v_diferencia <> 0 then
    v_linea := v_linea + 1;
    if v_diferencia > 0 then
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_cuenta_resultado, 0, v_diferencia,
        'Excedente del ejercicio ' || p_anio
      );
    else
      insert into public.contable_comprobante_detalle (
        tenant_id, comprobante_id, linea, cuenta_id, debito, credito, descripcion
      ) values (
        p_tenant_id, v_comp_id, v_linea, v_cuenta_resultado, -v_diferencia, 0,
        'Déficit del ejercicio ' || p_anio
      );
    end if;
  end if;

  perform public.fn_contabilizar_comprobante(v_comp_id);

  update public.periodos set contable_estado = 'bloqueado'
  where tenant_id = p_tenant_id and anio = p_anio;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id, (select auth.uid()), 'contable.ejercicio.cerrado', 'contable_comprobante',
    v_comp_id, jsonb_build_object('anio', p_anio)
  );

  return v_comp_id;
end;
$$;

comment on function public.fn_contable_cerrar_ejercicio(uuid, smallint) is
  'CO-6 §3.4: exige los 12 periodos del año en contable_estado=''cerrado''. Cancela clases 4/5/6 '
  'agrupando por (cuenta_id, tercero_id, centro_costo_id, fondo_id, inmueble_id, agrupacion_id) '
  '— nunca ''una línea por cuenta'', para respetar COMPROBANTE_DIMENSION_REQUERIDA sin '
  'relajarlo — contra la cuenta mapeada a RESULTADO_EJERCICIO (contable_cuenta_default). Se '
  'contabiliza por fn_contabilizar_comprobante (que desde CO-6 admite excepcionalmente el '
  'periodo de diciembre ya ''cerrado'' para el tipo CIERRE — ver 20260930540000). Tras '
  'contabilizar, los 12 periodos pasan a ''bloqueado''.';
