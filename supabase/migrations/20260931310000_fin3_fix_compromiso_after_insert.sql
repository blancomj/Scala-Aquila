-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Fix real encontrado al correr las 16 pruebas (no en producción):
--  guard_finanzas_lote_item creaba el compromiso bancario DENTRO de su
--  propio BEFORE INSERT, con origen_id = new.id (el id ya existe por el
--  DEFAULT antes de que el trigger corra) — pero guard_finanzas_
--  compromiso_bancario (20260931260000) valida que ese origen_id resuelva
--  a una fila REAL de finanzas_lote_items, y esa fila TODAVÍA NO EXISTE en
--  la tabla: un BEFORE INSERT corre antes de que Postgres escriba la fila
--  en el heap, así que cualquier SELECT anidado contra la misma tabla
--  nunca la encuentra todavía. Resultado: TODO alta de ítem fallaba con
--  COMPROMISO_BANCARIO_ORIGEN_INVALIDO, incluso los casos que debían
--  tener éxito (8 de las 16 pruebas obligatorias, en cascada desde esta).
--
--  Corrección: la creación del compromiso se mueve a un AFTER INSERT
--  (donde la fila de finanzas_lote_items ya es visible), seguido de un
--  UPDATE que rellena compromiso_bancario_id — mismo patrón que "medición
--  genera incidencia" de MANT-4 tuvo que evitar (D-56, un AFTER INSERT con
--  UPDATE de vuelta no se refleja en el RETURNING de la sentencia
--  original), salvo que aquí SÍ es aceptable: el cliente vuelve a
--  consultar la fila si necesita ver compromiso_bancario_id (el store de
--  UI hace un select tras el insert, no depende del RETURNING crudo).
--  aquila.creando_lote_item autoriza ese único UPDATE interno — el mismo
--  mecanismo de bandera de sesión que aquila.aprobando_factura.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_finanzas_lote_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote        public.finanzas_lotes_pago;
  v_factura     public.finanzas_facturas_proveedor;
  v_pendiente   numeric(18, 2);
begin
  if tg_op = 'DELETE' then
    select * into v_lote from public.finanzas_lotes_pago where id = old.lote_id;
    if v_lote.estado not in ('borrador', 'programado') then
      raise exception 'LOTE_ITEM_LOTE_NO_MODIFICABLE: el lote % está % — solo '
        'fn_finanzas_anular_lote puede revertir sus ítems desde aquí en adelante',
        old.lote_id, v_lote.estado;
    end if;

    update public.finanzas_cuenta_bancaria_compromiso
      set estado = 'liberado', motivo_liberacion = 'Ítem retirado del lote antes de aprobar'
      where id = old.compromiso_bancario_id;

    perform set_config('aquila.desprogramando_factura', 'true', true);
    update public.finanzas_facturas_proveedor set estado = 'aprobada' where id = old.factura_id;
    perform set_config('aquila.desprogramando_factura', 'false', true);

    update public.finanzas_lotes_pago
      set monto_total = monto_total - old.monto_a_pagar, cantidad_pagos = cantidad_pagos - 1
      where id = old.lote_id;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.factura_id is distinct from old.factura_id
       or new.monto_a_pagar is distinct from old.monto_a_pagar
       or new.es_pago_parcial is distinct from old.es_pago_parcial
       or new.lote_id is distinct from old.lote_id then
      raise exception 'LOTE_ITEM_LOTE_NO_MODIFICABLE: un ítem ya creado es inmutable salvo '
        'observaciones — retíralo y créalo de nuevo si necesitas otro monto';
    end if;
    -- compromiso_bancario_id solo puede pasar de null a un valor, y solo desde el AFTER INSERT
    -- que lo crea (fn_finanzas_lote_item_crear_compromiso) — nunca un UPDATE directo del cliente.
    if new.compromiso_bancario_id is distinct from old.compromiso_bancario_id then
      if old.compromiso_bancario_id is not null
         or coalesce(current_setting('aquila.creando_lote_item', true), 'false') <> 'true' then
        raise exception 'LOTE_ITEM_LOTE_NO_MODIFICABLE: compromiso_bancario_id lo asigna siempre '
          'el sistema al crear el ítem, nunca un UPDATE directo';
      end if;
    end if;
    return new;
  end if;

  -- ── INSERT: validación y efectos colaterales que NO dependen de que este ítem ya exista en
  -- la tabla (la creación del compromiso, que sí lo necesita, se movió al AFTER INSERT) ──
  select * into v_lote from public.finanzas_lotes_pago where id = new.lote_id;
  if v_lote.id is null or v_lote.tenant_id <> new.tenant_id then
    raise exception 'LOTE_TENANT_INCONSISTENTE: el lote % no pertenece al tenant', new.lote_id;
  end if;
  if v_lote.estado not in ('borrador', 'programado') then
    raise exception 'LOTE_ITEM_LOTE_NO_MODIFICABLE: el lote % está % — no admite nuevos ítems',
      new.lote_id, v_lote.estado;
  end if;

  select * into v_factura from public.finanzas_facturas_proveedor where id = new.factura_id;
  if v_factura.id is null or v_factura.tenant_id <> new.tenant_id then
    raise exception 'LOTE_TENANT_INCONSISTENTE: la factura % no pertenece al tenant', new.factura_id;
  end if;

  if exists (
    select 1 from public.finanzas_lote_items li
    join public.finanzas_lotes_pago l on l.id = li.lote_id
    where li.factura_id = new.factura_id and l.estado <> 'anulado' and li.id <> new.id
  ) then
    raise exception 'LOTE_ITEM_FACTURA_YA_PROGRAMADA: la factura % ya está en un lote activo',
      new.factura_id;
  end if;

  if v_factura.estado <> 'aprobada' then
    raise exception 'LOTE_ITEM_FACTURA_NO_APROBADA: la factura % está % — debe estar aprobada '
      'para entrar a un lote', new.factura_id, v_factura.estado;
  end if;

  select v_factura.total_neto_pagar - coalesce(sum(li.monto_a_pagar), 0) into v_pendiente
    from public.finanzas_lote_items li
    join public.finanzas_lotes_pago l on l.id = li.lote_id
    where li.factura_id = new.factura_id and l.estado in ('ejecutado', 'conciliado');

  if not new.es_pago_parcial and new.monto_a_pagar <> v_pendiente then
    raise exception 'LOTE_ITEM_MONTO_INCONSISTENTE: monto_a_pagar (%) debe ser igual al pendiente '
      'de la factura (%) cuando no es pago parcial', new.monto_a_pagar, v_pendiente;
  end if;
  if new.es_pago_parcial and new.monto_a_pagar >= v_pendiente then
    raise exception 'LOTE_ITEM_PARCIAL_INVALIDO: monto_a_pagar (%) debe ser menor al pendiente de '
      'la factura (%) cuando es pago parcial', new.monto_a_pagar, v_pendiente;
  end if;

  perform set_config('aquila.desprogramando_factura', 'true', true);
  update public.finanzas_facturas_proveedor set estado = 'programada' where id = new.factura_id;
  perform set_config('aquila.desprogramando_factura', 'false', true);

  update public.finanzas_lotes_pago
    set monto_total = monto_total + new.monto_a_pagar, cantidad_pagos = cantidad_pagos + 1
    where id = new.lote_id;

  return new;
end;
$$;

comment on function public.guard_finanzas_lote_item() is
  'Valida elegibilidad/aritmética y aplica los efectos sobre factura/lote — la creación del '
  'compromiso bancario (que necesita que este ítem ya exista en la tabla) vive en el AFTER INSERT '
  'fn_finanzas_lote_item_crear_compromiso, no aquí (ver cabecera de 20260931310000).';

create function public.fn_finanzas_lote_item_crear_compromiso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cuenta_bancaria_id uuid;
  v_fecha_programada   date;
  v_compromiso         uuid;
begin
  select cuenta_bancaria_id, fecha_programada into v_cuenta_bancaria_id, v_fecha_programada
    from public.finanzas_lotes_pago where id = new.lote_id;

  -- guard_finanzas_compromiso_bancario (FIN-1/FIN-2/FIN-3) rechaza por construcción si esto deja
  -- el disponible de la cuenta en negativo (COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE, prueba central
  -- del corte) y ya puede validar que new.id resuelve a una fila real (el AFTER INSERT corre
  -- después de que Postgres escribe la fila en el heap).
  insert into public.finanzas_cuenta_bancaria_compromiso (
    tenant_id, cuenta_bancaria_id, origen, origen_id, monto, estado, fecha_esperada_ejecucion
  ) values (
    new.tenant_id, v_cuenta_bancaria_id, 'lote_pago', new.id, new.monto_a_pagar, 'reservado',
    v_fecha_programada
  )
  returning id into v_compromiso;

  perform set_config('aquila.creando_lote_item', 'true', true);
  update public.finanzas_lote_items set compromiso_bancario_id = v_compromiso where id = new.id;
  perform set_config('aquila.creando_lote_item', 'false', true);

  return null;
end;
$$;

comment on function public.fn_finanzas_lote_item_crear_compromiso() is
  'AFTER INSERT — crea el compromiso reservado y rellena compromiso_bancario_id. Ver cabecera de '
  '20260931310000 para la razón de por qué esto no puede vivir en el BEFORE INSERT.';

create trigger finanzas_lote_item_crear_compromiso
  after insert on public.finanzas_lote_items
  for each row execute function public.fn_finanzas_lote_item_crear_compromiso();
