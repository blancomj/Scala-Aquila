-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (8/8)
--
--  Segunda adición sobre el corte original, encontrada al preparar el
--  fixture de prueba (no en producción): TODA hoja de egreso sembrada por
--  PUC_PH_CO exige `centro_costo_id` (`contable_cuenta.requiere_centro_costo`,
--  verificado contra la base real — mismo hallazgo que ya documentó
--  tests/contabilidad/materializacion.test.ts para sus propios fixtures).
--  Sin esta columna, fn_finanzas_aprobar_factura no tendría de dónde
--  sacar el centro_costo_id que presupuesto_ejecucion necesita para que
--  fn_contabilizar_comprobante (CO-2) no rechace la línea de gasto —
--  mismo estilo de adición documentada que presupuesto_cuenta_id
--  (20260931140000) y D-56/D-57 en DECISIONES.md.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.finanzas_facturas_proveedor
  add column centro_costo_id bigint references public.lista_tipos (id);

comment on column public.finanzas_facturas_proveedor.centro_costo_id is
  'Adición sobre el corte original (ver cabecera): toda hoja de presupuesto_cuenta de egreso '
  'exige centro_costo_id en su comprobante contable — sin esta columna, aprobar la factura no '
  'podría crear una fila de presupuesto_ejecucion contabilizable.';

create or replace function public.guard_finanzas_factura_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitida boolean := false;
begin
  -- ── 'pagada' es terminal: solo observaciones/updated_at pueden cambiar ──
  if tg_op = 'UPDATE' and old.estado = 'pagada' then
    if (to_jsonb(old) - 'observaciones' - 'updated_at')
       is distinct from (to_jsonb(new) - 'observaciones' - 'updated_at') then
      raise exception 'FACTURA_PAGADA_INMUTABLE: la factura % ya está pagada y no admite '
        'cambios sustantivos', old.id;
    end if;
  end if;

  -- ── Consistencia de tenant ──
  if not exists (select 1 from public.terceros where id = new.proveedor_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: el proveedor % no pertenece al tenant', new.proveedor_id;
  end if;
  if new.contrato_id is not null
     and not exists (select 1 from public.mant_contratos where id = new.contrato_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: el contrato % no pertenece al tenant', new.contrato_id;
  end if;
  if new.presupuesto_cuenta_id is not null
     and not exists (select 1 from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: la cuenta presupuestal % no pertenece al tenant', new.presupuesto_cuenta_id;
  end if;
  if new.presupuesto_cuenta_id is not null
     and not exists (select 1 from public.presupuesto_cuenta where id = new.presupuesto_cuenta_id and es_hoja) then
    raise exception 'CUENTA_NO_ES_HOJA: % agrupa subcuentas — una factura solo puede enlazarse '
      'a una cuenta hoja', new.presupuesto_cuenta_id;
  end if;
  if new.presupuesto_ejecucion_id is not null
     and not exists (select 1 from public.presupuesto_ejecucion where id = new.presupuesto_ejecucion_id and tenant_id = new.tenant_id) then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: la ejecución %  no pertenece al tenant', new.presupuesto_ejecucion_id;
  end if;
  if new.centro_costo_id is not null
     and not exists (select 1 from public.lista_tipos where id = new.centro_costo_id and tipo = 'CENTRO_COSTO') then
    raise exception 'FACTURA_TENANT_INCONSISTENTE: centro_costo_id % no pertenece a CENTRO_COSTO', new.centro_costo_id;
  end if;

  -- ── Duplicada: mensaje legible antes de que la unique falle en crudo ──
  if exists (
    select 1 from public.finanzas_facturas_proveedor
    where tenant_id = new.tenant_id and proveedor_id = new.proveedor_id
      and numero_documento = new.numero_documento and id <> new.id
  ) then
    raise exception 'FACTURA_DUPLICADA: el proveedor % ya tiene una factura con el número %',
      new.proveedor_id, new.numero_documento;
  end if;

  -- ── Una ejecución ya facturada no puede enlazarse a una segunda factura ──
  if new.presupuesto_ejecucion_id is not null and exists (
    select 1 from public.finanzas_facturas_proveedor
    where presupuesto_ejecucion_id = new.presupuesto_ejecucion_id and id <> new.id
  ) then
    raise exception 'EJECUCION_YA_FACTURADA: la ejecución % ya está enlazada a otra factura',
      new.presupuesto_ejecucion_id;
  end if;

  -- ── Aritmética ──
  if new.total_bruto is distinct from new.subtotal + new.iva_generado then
    raise exception 'FACTURA_ARITMETICA_INCONSISTENTE: total_bruto (%) debe ser subtotal (%) '
      'más iva_generado (%)', new.total_bruto, new.subtotal, new.iva_generado;
  end if;
  if new.total_neto_pagar is distinct from new.total_bruto - new.total_retenciones then
    raise exception 'FACTURA_ARITMETICA_INCONSISTENTE: total_neto_pagar (%) debe ser '
      'total_bruto (%) menos total_retenciones (%)', new.total_neto_pagar, new.total_bruto, new.total_retenciones;
  end if;

  -- ── IVA descontable solo si el tenant es responsable de IVA (CO-1) ──
  if new.iva_descontable > 0
     and not coalesce((select responsable_iva from public.tenants where id = new.tenant_id), false) then
    raise exception 'IVA_DESCONTABLE_INCONSISTENTE: el tenant % no es responsable de IVA — '
      'iva_descontable debe ser 0', new.tenant_id;
  end if;

  -- ── FSM (solo en UPDATE) ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'aprobada' then
      if coalesce(current_setting('aquila.aprobando_factura', true), 'false') <> 'true' then
        raise exception 'FACTURA_TRANSICION_INVALIDA: aprobar una factura exige '
          'fn_finanzas_aprobar_factura, no un UPDATE directo';
      end if;
      v_permitida := old.estado = 'en_revision';
    else
      v_permitida := case old.estado
        when 'borrador'        then new.estado in ('registrada', 'anulada')
        when 'registrada'      then new.estado in ('en_revision', 'anulada')
        when 'en_revision'     then new.estado in ('en_disputa', 'anulada')
        when 'en_disputa'      then new.estado in ('en_revision', 'anulada')
        when 'aprobada'        then new.estado in ('programada', 'anulada')
        when 'programada'      then new.estado in ('pagada_parcial', 'pagada', 'anulada')
        when 'pagada_parcial'  then new.estado in ('pagada', 'anulada')
        else false
      end;
    end if;

    if new.estado = 'anulada' and (new.motivo_rechazo is null or btrim(new.motivo_rechazo) = '') then
      raise exception 'FACTURA_ANULACION_SIN_MOTIVO: anular una factura exige motivo_rechazo';
    end if;
    if new.estado = 'en_disputa' and (new.motivo_disputa is null or btrim(new.motivo_disputa) = '') then
      raise exception 'FACTURA_DISPUTA_SIN_MOTIVO: marcar una factura en disputa exige motivo_disputa';
    end if;

    if not v_permitida then
      raise exception 'FACTURA_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.fn_finanzas_aprobar_factura(p_factura_id uuid)
returns public.finanzas_facturas_proveedor
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_factura       public.finanzas_facturas_proveedor%rowtype;
  v_ejecucion_id  uuid;
  v_periodo_id    uuid;
  v_monto_ejec    numeric;
  v_politica      public.finanzas_politica_aprobacion_pago;
begin
  select * into v_factura from public.finanzas_facturas_proveedor where id = p_factura_id;
  if v_factura.id is null then
    raise exception 'FACTURA_INEXISTENTE: la factura % no existe', p_factura_id;
  end if;

  if not public.has_role(v_factura.tenant_id, array['administrador']::public.tenant_role_t[]) then
    raise exception 'FORBIDDEN: se requiere rol administrador para aprobar una factura';
  end if;

  if v_factura.estado <> 'en_revision' then
    raise exception 'FACTURA_TRANSICION_INVALIDA: solo una factura en_revision puede aprobarse '
      '(estado actual: %)', v_factura.estado;
  end if;

  if v_factura.documento_soporte_id is null then
    raise exception 'FACTURA_APROBACION_SIN_SOPORTE: la factura % no tiene documento_soporte_id',
      p_factura_id;
  end if;

  -- ── Enlazar o crear la ejecución presupuestal (nunca un saldo propio) ──
  if v_factura.presupuesto_ejecucion_id is not null then
    select id, monto into v_ejecucion_id, v_monto_ejec
      from public.presupuesto_ejecucion where id = v_factura.presupuesto_ejecucion_id;
    if v_monto_ejec is distinct from v_factura.total_neto_pagar then
      raise exception 'FACTURA_EJECUCION_MONTO_DISCREPA: la ejecución % tiene monto % pero la '
        'factura exige %', v_ejecucion_id, v_monto_ejec, v_factura.total_neto_pagar;
    end if;
  else
    if v_factura.presupuesto_cuenta_id is null then
      raise exception 'FACTURA_SIN_CUENTA_PRESUPUESTAL: la factura % no tiene '
        'presupuesto_cuenta_id ni presupuesto_ejecucion_id — no hay contra qué rubro cargarla',
        p_factura_id;
    end if;

    select id into v_periodo_id from public.periodos
      where tenant_id = v_factura.tenant_id
        and anio = extract(year from v_factura.fecha_emision)
        and mes = extract(month from v_factura.fecha_emision);
    if v_periodo_id is null then
      raise exception 'PERIODO_INEXISTENTE: no existe un periodo % - % para la fecha de emisión '
        'de la factura %', extract(year from v_factura.fecha_emision),
        extract(month from v_factura.fecha_emision), p_factura_id;
    end if;

    insert into public.presupuesto_ejecucion (
      tenant_id, cuenta_id, periodo_id, monto, liquidacion, tercero_id, contrato_id,
      centro_costo_id, fecha_documento, descripcion, referencia
    ) values (
      v_factura.tenant_id, v_factura.presupuesto_cuenta_id, v_periodo_id, v_factura.total_neto_pagar,
      'por_pagar', v_factura.proveedor_id, v_factura.contrato_id, v_factura.centro_costo_id,
      v_factura.fecha_emision, 'Factura de proveedor ' || v_factura.numero_documento,
      v_factura.numero_documento
    )
    returning id into v_ejecucion_id;
  end if;

  -- ── Umbral de aprobación / órgano competente (GOB-1) ──
  v_politica := public.fn_finanzas_politica_aprobacion_vigente(v_factura.tenant_id);
  if v_politica.id is not null and v_politica.monto_umbral is not null
     and v_factura.total_neto_pagar > v_politica.monto_umbral then
    if to_regclass('public.gobierno_organos') is null then
      insert into public.finanzas_factura_advertencia (tenant_id, factura_id, codigo, mensaje)
      values (v_factura.tenant_id, p_factura_id, 'FACTURA_APROBACION_ORGANO_INCOMPETENTE',
        format('Factura %s por %s supera el umbral de aprobación (%s) — GOB-1 no existe '
               'todavía, no se pudo verificar aprobación por órgano competente.',
               v_factura.numero_documento, v_factura.total_neto_pagar, v_politica.monto_umbral));
    end if;
    -- Cuando GOB-1 exista: llamar gobierno_organo_competente(tenant, 'aprobar_gasto', hoy) y
    -- rechazar con FACTURA_APROBACION_ORGANO_INCOMPETENTE si no hay órgano competente vigente.
    -- Ver FIN_02_INFORME.md: propuesta de agregar 'aprobar_gasto' a ATRIBUCION_ORGANO.
  end if;

  perform set_config('aquila.aprobando_factura', 'true', true);
  update public.finanzas_facturas_proveedor
  set estado = 'aprobada', aprobada_por = auth.uid(), aprobada_at = now(),
      presupuesto_ejecucion_id = v_ejecucion_id
  where id = p_factura_id
  returning * into v_factura;
  perform set_config('aquila.aprobando_factura', 'false', true);

  return v_factura;
end;
$$;
