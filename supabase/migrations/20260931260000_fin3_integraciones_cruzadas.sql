-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (5/8)
--
--  Dos obligaciones dejadas pendientes explícitamente por cortes previos,
--  que FIN-3 cierra ahora que sus propios objetos existen:
--
--  1. guard_finanzas_compromiso_bancario (FIN-1, 20260930780000): el
--     comentario de esa migración decía "lote_pago queda igual de
--     pendiente hasta FIN-3" — se agrega la validación de existencia real
--     de origen_id contra finanzas_lote_items, mismo criterio que FIN-2 ya
--     aplicó para 'factura_proveedor' (20260931180000). Reutiliza
--     COMPROMISO_BANCARIO_ORIGEN_INVALIDO, no inventa un código nuevo.
--
--  2. guard_finanzas_factura_proveedor (FIN-2): agrega la transición
--     programada→aprobada, alcanzable SOLO al retirar un ítem de un lote
--     (guard_finanzas_lote_item, 20260931250000) o al anular un lote —
--     nunca un UPDATE directo del cliente, mismo mecanismo
--     aquila.aprobando_factura ya usado para en_revision→aprobada.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_finanzas_compromiso_bancario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta public.cuentas_bancarias;
  v_reservado_otros numeric(18, 2);
  v_saldo numeric(18, 2);
begin
  if tg_op = 'UPDATE' and old.estado in ('ejecutado', 'liberado', 'anulado') then
    raise exception 'COMPROMISO_BANCARIO_TERMINAL_INMUTABLE: el compromiso % está % y no admite '
      'modificaciones', old.id, old.estado;
  end if;

  select * into v_cuenta from public.cuentas_bancarias where id = new.cuenta_bancaria_id;

  if v_cuenta.id is null then
    raise exception 'CUENTA_BANCARIA_INEXISTENTE: % no existe', new.cuenta_bancaria_id;
  end if;

  if v_cuenta.tenant_id <> new.tenant_id then
    raise exception 'CUENTA_BANCARIA_TENANT_INCONSISTENTE: la cuenta % no pertenece al tenant %',
      new.cuenta_bancaria_id, new.tenant_id;
  end if;

  if new.origen = 'manual' and new.origen_id is not null then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: un compromiso manual no lleva origen_id';
  end if;

  if new.origen in ('factura_proveedor', 'lote_pago') and new.origen_id is null then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: un compromiso de origen % exige origen_id',
      new.origen;
  end if;

  if new.origen = 'factura_proveedor'
     and not exists (
       select 1 from public.finanzas_facturas_proveedor
       where id = new.origen_id and tenant_id = new.tenant_id
     ) then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: la factura % no existe o no pertenece '
      'al tenant', new.origen_id;
  end if;

  -- FIN-3: finanzas_lote_items ya existe — cierra la obligación que FIN-1 dejó pendiente.
  if new.origen = 'lote_pago'
     and not exists (
       select 1 from public.finanzas_lote_items
       where id = new.origen_id and tenant_id = new.tenant_id
     ) then
    raise exception 'COMPROMISO_BANCARIO_ORIGEN_INVALIDO: el ítem de lote % no existe o no '
      'pertenece al tenant', new.origen_id;
  end if;

  if new.estado = 'reservado' then
    select coalesce(sum(fcbc.monto), 0) into v_reservado_otros
      from public.finanzas_cuenta_bancaria_compromiso fcbc
     where fcbc.cuenta_bancaria_id = new.cuenta_bancaria_id
       and fcbc.estado = 'reservado'
       and fcbc.id <> new.id;

    select d.saldo_contable into v_saldo
      from public.fn_cuenta_bancaria_disponible(new.cuenta_bancaria_id, now()) d;

    if v_reservado_otros + new.monto > coalesce(v_saldo, 0) then
      raise exception 'COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE: reservar % dejaría el disponible de '
        'la cuenta % en negativo (saldo %, ya reservado %)',
        new.monto, v_cuenta.numero_cuenta, v_saldo, v_reservado_otros;
    end if;
  end if;

  new.registrado_por := coalesce(new.registrado_por, (select auth.uid()));
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_compromiso_bancario() is
  'Valida consistencia de tenant, coherencia de origen/origen_id (factura_proveedor desde FIN-2, '
  'lote_pago desde FIN-3 — ambos cierran obligaciones que su corte de origen dejó pendientes), y '
  'la regla central: un compromiso reservado no puede dejar fn_cuenta_bancaria_disponible en '
  'negativo. Un compromiso en estado terminal (ejecutado/liberado/anulado) rechaza cualquier '
  'UPDATE, no solo un cambio de estado.';

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

  -- ── IVA descontable: solo si el tenant es responsable de IVA (CO-1), y nunca más de lo
  -- que la propia factura generó (no se puede deducir más IVA del que se pagó) ──
  if new.iva_descontable > 0
     and not coalesce((select responsable_iva from public.tenants where id = new.tenant_id), false) then
    raise exception 'IVA_DESCONTABLE_INCONSISTENTE: el tenant % no es responsable de IVA — '
      'iva_descontable debe ser 0', new.tenant_id;
  end if;
  if new.iva_descontable > new.iva_generado then
    raise exception 'IVA_DESCONTABLE_INCONSISTENTE: iva_descontable (%) no puede superar '
      'iva_generado (%)', new.iva_descontable, new.iva_generado;
  end if;

  -- ── FSM (solo en UPDATE) ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'aprobada' then
      if old.estado = 'en_revision' then
        if coalesce(current_setting('aquila.aprobando_factura', true), 'false') <> 'true' then
          raise exception 'FACTURA_TRANSICION_INVALIDA: aprobar una factura exige '
            'fn_finanzas_aprobar_factura, no un UPDATE directo';
        end if;
        v_permitida := true;
      elsif old.estado = 'programada' then
        -- FIN-3: retirar un ítem de lote (o anular el lote) desprograma la factura —
        -- solo alcanzable desde guard_finanzas_lote_item/fn_finanzas_anular_lote.
        if coalesce(current_setting('aquila.desprogramando_factura', true), 'false') <> 'true' then
          raise exception 'FACTURA_TRANSICION_INVALIDA: desprogramar una factura exige retirarla '
            'de su lote o anular el lote, no un UPDATE directo';
        end if;
        v_permitida := true;
      else
        v_permitida := false;
      end if;
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

comment on function public.guard_finanzas_factura_proveedor() is
  'FSM completa de la factura, incluida la reversión programada→aprobada (FIN-3) alcanzable solo '
  'vía aquila.desprogramando_factura — nunca un UPDATE directo del cliente.';
