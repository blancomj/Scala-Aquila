-- ═══════════════════════════════════════════════════════════════════════
--  FIN-2 · Factura de proveedor y retenciones aplicadas (9/8, fix de QA en vivo)
--
--  Encontrado probando la ficha en el navegador contra un tenant real
--  (responsable_iva = false, como JARDINES DE BABILONIA): al aprobar una
--  factura con iva_generado > 0 e iva_descontable = 0 (obligatorio para un
--  tenant no responsable de IVA), finanzas_factura_descomposicion() debitaba
--  solo el subtotal a la cuenta de gasto pero acreditaba total_neto_pagar
--  (subtotal + iva_generado) a proveedores — sum(debito) <> sum(credito)
--  para ese hecho, violando la invariante central de CO-3 ("cero
--  diferencias siempre", contable_conciliacion_proyeccion). Los 16 tests
--  del corte no lo detectaron porque el tenant de prueba es responsable de
--  IVA con iva_descontable = iva_generado siempre (recuperación total).
--
--  Corrección: el IVA no recuperado (iva_generado - iva_descontable) se
--  suma al gasto — es costo real de la copropiedad, no un activo. Cuando
--  iva_descontable = iva_generado (recuperación total) el gasto vuelve a
--  ser solo el subtotal, igual que antes.
--
--  De paso, cierra un hueco que este mismo bug expuso: nada impedía
--  iva_descontable > iva_generado (deducir más IVA del que la factura
--  generó), lo que habría producido un gasto negativo con la fórmula
--  nueva. Mismo código IVA_DESCONTABLE_INCONSISTENTE que ya usa la
--  validación de responsable_iva — es la misma familia de inconsistencia.
-- ═══════════════════════════════════════════════════════════════════════

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

create or replace function public.finanzas_factura_descomposicion(p_ejecucion_id uuid)
returns table (
  cuenta_id   uuid,
  debito      numeric,
  credito     numeric,
  descripcion text
)
language sql
stable
set search_path = ''
as $$
  with f as (
    select * from public.finanzas_facturas_proveedor where presupuesto_ejecucion_id = p_ejecucion_id
  ),
  pe as (
    select * from public.presupuesto_ejecucion where id = p_ejecucion_id
  ),
  d as (
    select
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'IVA_DESCONTABLE'))[1] as iva_descontable,
      (array_agg(cd.contable_cuenta_id) filter (where lt.codigo = 'PROVEEDOR_SERVICIOS'))[1] as proveedores
    from public.contable_cuenta_default cd
    join public.lista_tipos lt on lt.id = cd.evento_id
    where cd.tenant_id = (select tenant_id from f)
  )
  -- Gasto: debita la cuenta del rubro presupuestal de la propia ejecución (la misma resolución
  -- que contable_hechos() ya usa para cualquier egreso, factura o no). El IVA no recuperado
  -- (iva_generado - iva_descontable) engorda el gasto — es costo real, no un activo — para que
  -- sum(debito) = sum(credito) sin importar si el tenant es responsable de IVA o no.
  select pcc.contable_cuenta_id, f.subtotal + (f.iva_generado - f.iva_descontable),
    0::numeric, 'Gasto — factura ' || f.numero_documento
  from f join pe on true join public.presupuesto_cuenta pcc on pcc.id = pe.cuenta_id

  union all

  -- IVA descontable: solo si aplica (responsable_iva ya se validó al guardar la factura).
  select d.iva_descontable, f.iva_descontable, 0::numeric, 'IVA descontable — factura ' || f.numero_documento
  from f cross join d
  where f.iva_descontable > 0

  union all

  -- CxP proveedor: por el neto — ya descuenta las retenciones (siempre 0 mientras CO-8 no
  -- exista, ver 20260931150000). Cuando CO-8 exista, esta migración necesitará una línea de
  -- crédito adicional POR CADA retención (finanzas_factura_retencion), a su propia cuenta —
  -- pendiente de ese corte, documentado en FIN_02_INFORME.md.
  select d.proveedores, 0::numeric, f.total_neto_pagar, 'CxP proveedor — factura ' || f.numero_documento
  from f cross join d;
$$;
