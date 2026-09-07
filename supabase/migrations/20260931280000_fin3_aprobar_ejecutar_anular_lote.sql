-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (7/8)
--
--  Los tres únicos caminos que mueven un lote entre programado/aprobado/
--  ejecutado/anulado — cada uno set_config() su propia bandera de sesión
--  (aquila.aprobando_lote/ejecutando_lote/anulando_lote) para que
--  guard_finanzas_lote_pago (20260931240000) rechace cualquier UPDATE
--  directo de esas transiciones, mismo mecanismo que aquila.aprobando_
--  factura/aquila.cerrando_ot.
--
--  fn_finanzas_ejecutar_lote() es la única función de todo el corte que
--  escribe en presupuesto_ejecucion — y la regla de APENDICE_FIN.md se
--  cumple literal: crea el HECHO ('pagado_banco'), nunca un comprobante
--  contable. CO-3 lo materializa en su siguiente corrida.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_finanzas_aprobar_lote(p_lote_id uuid, p_justificacion text default null)
returns public.finanzas_lotes_pago
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote               public.finanzas_lotes_pago;
  v_politica           public.finanzas_politica_aprobacion_lote;
  v_requiere_admin     boolean;
  v_proveedor_id       uuid;
  v_necesita_justif    boolean := false;
begin
  select * into v_lote from public.finanzas_lotes_pago where id = p_lote_id;
  if v_lote.id is null then
    raise exception 'LOTE_INEXISTENTE: el lote % no existe', p_lote_id;
  end if;
  if v_lote.estado <> 'programado' then
    raise exception 'LOTE_TRANSICION_INVALIDA: solo un lote programado puede aprobarse (estado '
      'actual: %)', v_lote.estado;
  end if;

  v_politica := public.fn_finanzas_politica_aprobacion_lote_vigente(v_lote.tenant_id);
  -- Sin política vigente o sin umbral definido, TODO lote exige administrador — el sistema no
  -- decide por nadie cuánto es "grande" (APENDICE_FIN.md).
  v_requiere_admin := v_politica.id is null or v_politica.monto_umbral is null
    or v_lote.monto_total > v_politica.monto_umbral;

  if v_requiere_admin then
    if not public.has_role(v_lote.tenant_id, array['administrador']::public.tenant_role_t[]) then
      raise exception 'FORBIDDEN: este lote supera el umbral de aprobación (o no hay umbral '
        'definido) — se requiere rol administrador';
    end if;
  elsif not public.has_role(v_lote.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere membresía activa del tenant para aprobar un lote';
  end if;

  -- Validación no bloqueante: proveedor con habilitación vencida o próxima a vencer exige
  -- justificación explícita para aprobar de todos modos (§3.4).
  for v_proveedor_id in
    select distinct f.proveedor_id
    from public.finanzas_lote_items li
    join public.finanzas_facturas_proveedor f on f.id = li.factura_id
    where li.lote_id = p_lote_id
  loop
    if exists (
      select 1 from public.mant_habilitaciones_semaforo(v_proveedor_id) s where s.estado <> 'vigente'
    ) then
      v_necesita_justif := true;
    end if;
  end loop;

  if v_necesita_justif and (p_justificacion is null or btrim(p_justificacion) = '') then
    raise exception 'LOTE_APROBACION_SIN_JUSTIFICACION: al menos un proveedor del lote tiene una '
      'habilitación vencida o próxima a vencer — aprobar exige justificación explícita';
  end if;

  -- Umbral de asamblea / órgano competente (GOB-1) — mismo hueco declarado que FIN-2.
  if v_politica.id is not null and v_politica.monto_umbral is not null
     and v_lote.monto_total > v_politica.monto_umbral
     and to_regclass('public.gobierno_organos') is null then
    insert into public.finanzas_lote_advertencia (tenant_id, lote_id, codigo, mensaje)
    values (v_lote.tenant_id, p_lote_id, 'LOTE_APROBACION_ORGANO_INCOMPETENTE',
      format('Lote %s-%s por %s supera el umbral de aprobación (%s) — GOB-1 no existe todavía, '
             'no se pudo verificar aprobación por órgano competente.',
             v_lote.anio, v_lote.numero, v_lote.monto_total, v_politica.monto_umbral));
  end if;

  perform set_config('aquila.aprobando_lote', 'true', true);
  update public.finanzas_lotes_pago
  set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(),
      justificacion = p_justificacion
  where id = p_lote_id
  returning * into v_lote;
  perform set_config('aquila.aprobando_lote', 'false', true);

  return v_lote;
end;
$$;

comment on function public.fn_finanzas_aprobar_lote(uuid, text) is
  'FIN-3 §3.4: único camino a estado=aprobado. Administrador solo si supera el umbral vigente (o '
  'no hay umbral) — a diferencia de fn_finanzas_aprobar_factura (FIN-2), que siempre exige '
  'administrador sin importar el monto.';

create function public.fn_finanzas_ejecutar_lote(p_lote_id uuid, p_fecha_ejecucion date default current_date)
returns public.finanzas_lotes_pago
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote        public.finanzas_lotes_pago;
  v_item        record;
  v_periodo_id  uuid;
  v_ejec        public.presupuesto_ejecucion;
  v_estado_factura public.factura_estado_t;
begin
  select * into v_lote from public.finanzas_lotes_pago where id = p_lote_id;
  if v_lote.id is null then
    raise exception 'LOTE_INEXISTENTE: el lote % no existe', p_lote_id;
  end if;
  if not public.has_role(v_lote.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para ejecutar un lote';
  end if;
  if v_lote.estado <> 'aprobado' then
    raise exception 'LOTE_TRANSICION_INVALIDA: solo un lote aprobado puede ejecutarse (estado '
      'actual: %)', v_lote.estado;
  end if;

  select id into v_periodo_id from public.periodos
    where tenant_id = v_lote.tenant_id
      and anio = extract(year from p_fecha_ejecucion)
      and mes = extract(month from p_fecha_ejecucion);
  if v_periodo_id is null then
    raise exception 'PERIODO_INEXISTENTE: no existe un periodo % - % para la fecha de ejecución '
      'del lote %', extract(year from p_fecha_ejecucion), extract(month from p_fecha_ejecucion),
      p_lote_id;
  end if;

  for v_item in
    select li.id, li.factura_id, li.monto_a_pagar, li.es_pago_parcial, li.compromiso_bancario_id,
           f.numero_documento, f.presupuesto_ejecucion_id as factura_ejecucion_id
    from public.finanzas_lote_items li
    join public.finanzas_facturas_proveedor f on f.id = li.factura_id
    where li.lote_id = p_lote_id
  loop
    select * into v_ejec from public.presupuesto_ejecucion where id = v_item.factura_ejecucion_id;

    update public.finanzas_cuenta_bancaria_compromiso
      set estado = 'ejecutado'
      where id = v_item.compromiso_bancario_id;

    -- El HECHO económico que APENDICE_FIN.md exige — nunca un comprobante contable aquí. Copia
    -- cuenta/centro de costo/contrato/agrupación/activo de la ejecución 'por_pagar' ya creada al
    -- aprobar la factura (FIN-2), para que causación y pago queden sobre el mismo rubro.
    insert into public.presupuesto_ejecucion (
      tenant_id, cuenta_id, periodo_id, monto, liquidacion, tercero_id, contrato_id,
      centro_costo_id, cuenta_bancaria_id, agrupacion_id, activo_id, fecha_documento,
      descripcion, referencia
    ) values (
      v_lote.tenant_id, v_ejec.cuenta_id, v_periodo_id, v_item.monto_a_pagar, 'pagado_banco',
      v_ejec.tercero_id, v_ejec.contrato_id, v_ejec.centro_costo_id, v_lote.cuenta_bancaria_id,
      v_ejec.agrupacion_id, v_ejec.activo_id, p_fecha_ejecucion,
      format('Pago factura %s — lote %s-%s', v_item.numero_documento, v_lote.anio, v_lote.numero),
      v_item.numero_documento
    );

    -- es_pago_parcial ya fue validado por guard_finanzas_lote_item contra el pendiente REAL al
    -- crear el ítem — no hace falta recalcular aquí, ningún otro lote pudo tocar la misma
    -- factura mientras estuvo 'programada' (LOTE_ITEM_FACTURA_YA_PROGRAMADA lo impide).
    v_estado_factura := case when v_item.es_pago_parcial then 'pagada_parcial' else 'pagada' end;
    update public.finanzas_facturas_proveedor set estado = v_estado_factura where id = v_item.factura_id;
  end loop;

  perform set_config('aquila.ejecutando_lote', 'true', true);
  update public.finanzas_lotes_pago
  set estado = 'ejecutado', ejecutado_por = auth.uid(), ejecutado_at = now(),
      fecha_ejecucion = p_fecha_ejecucion
  where id = p_lote_id
  returning * into v_lote;
  perform set_config('aquila.ejecutando_lote', 'false', true);

  return v_lote;
end;
$$;

comment on function public.fn_finanzas_ejecutar_lote(uuid, date) is
  'FIN-3 §3.5: único camino a estado=ejecutado. Por cada ítem: compromiso→ejecutado, una fila de '
  'presupuesto_ejecucion con liquidacion=pagado_banco, y la factura a pagada/pagada_parcial. Cero '
  'comprobantes contables — CO-3 los materializa en su siguiente corrida (criterio de aceptación '
  'del corte).';

create function public.fn_finanzas_anular_lote(p_lote_id uuid, p_motivo text)
returns public.finanzas_lotes_pago
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote public.finanzas_lotes_pago;
  v_item record;
begin
  select * into v_lote from public.finanzas_lotes_pago where id = p_lote_id;
  if v_lote.id is null then
    raise exception 'LOTE_INEXISTENTE: el lote % no existe', p_lote_id;
  end if;
  if not public.has_role(v_lote.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para anular un lote';
  end if;
  if v_lote.estado not in ('borrador', 'programado', 'aprobado') then
    raise exception 'LOTE_TRANSICION_INVALIDA: un lote % no puede anularse', v_lote.estado;
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'LOTE_ANULACION_SIN_MOTIVO: anular un lote exige motivo';
  end if;

  for v_item in select * from public.finanzas_lote_items where lote_id = p_lote_id loop
    update public.finanzas_cuenta_bancaria_compromiso
      set estado = 'liberado',
          motivo_liberacion = format('Lote %s-%s anulado: %s', v_lote.anio, v_lote.numero, p_motivo)
      where id = v_item.compromiso_bancario_id;

    perform set_config('aquila.desprogramando_factura', 'true', true);
    update public.finanzas_facturas_proveedor set estado = 'aprobada' where id = v_item.factura_id;
    perform set_config('aquila.desprogramando_factura', 'false', true);
  end loop;

  perform set_config('aquila.anulando_lote', 'true', true);
  update public.finanzas_lotes_pago
  set estado = 'anulado', anulado_por = auth.uid(), anulado_at = now(), anulado_motivo = p_motivo
  where id = p_lote_id
  returning * into v_lote;
  perform set_config('aquila.anulando_lote', 'false', true);

  return v_lote;
end;
$$;

comment on function public.fn_finanzas_anular_lote(uuid, text) is
  'FIN-3 §3.5: único camino a estado=anulado desde borrador/programado/aprobado (ejecutado/'
  'conciliado son terminales, ver lote_estado_t). Revierte en bloque: compromisos liberados, '
  'facturas de vuelta a aprobada, cero filas creadas en presupuesto_ejecucion.';
