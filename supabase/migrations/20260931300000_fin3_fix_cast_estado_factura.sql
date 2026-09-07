-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Fix de db lint: fn_finanzas_ejecutar_lote asignaba un `case`
--  entre literales de texto sin cast a una variable
--  `public.factura_estado_t` — Postgres no castea automáticamente text a
--  enum en una asignación de variable plpgsql (a diferencia de una
--  comparación o de un INSERT/UPDATE contra una columna tipada, donde el
--  cast implícito sí aplica). Encontrado por `supabase db lint --linked`
--  antes de escribir las pruebas, no en producción.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_finanzas_ejecutar_lote(p_lote_id uuid, p_fecha_ejecucion date default current_date)
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

    if v_item.es_pago_parcial then
      v_estado_factura := 'pagada_parcial'::public.factura_estado_t;
    else
      v_estado_factura := 'pagada'::public.factura_estado_t;
    end if;
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
