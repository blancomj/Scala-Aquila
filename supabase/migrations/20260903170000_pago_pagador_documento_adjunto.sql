-- ═══════════════════════════════════════════════════════════════════════
--  Recibo de caja — cierra tres huecos señalados por el usuario tras
--  revisar el formulario en vivo (2026-08-27):
--
--  1. "Nombre y cédula": cuando quien paga NO es un tercero registrado
--     (pagador_nombre, texto libre), no había forma de capturar su
--     documento — v_recibi_doc_numero quedaba null en ese camino. Se
--     agrega pagos.pagador_documento y fn_emitir_recibo_caja lo usa en la
--     misma rama que ya usa pagador_nombre.
--  2. "Documento adjunto al pago": se generaliza `documentos` una vez más
--     (mismo patrón que caso_juridico_id en 20260822340000) con
--     pago_id nullable — un comprobante escaneado (foto del recibo físico,
--     el comprobante bancario) puede colgar del pago sin inventar una
--     tabla paralela. subir-documento valida que, cuando viene pago_id, el
--     pago pertenezca al mismo tenant.
--  3. "Campo de observaciones": nota libre sobre el pago (ej. "cheque
--     posfechado al 15"), interna — se persiste en pagos.observaciones y
--     también viaja al snapshot del recibo (es un HECHO del pago, mismo
--     criterio que el resto de `datos` en fn_emitir_recibo_caja).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.pagos
  add column pagador_documento text,
  add column observaciones text;

comment on column public.pagos.pagador_documento is
  'Cédula/NIT de quien paga cuando pagador_nombre (texto libre) se usó en vez de '
  'pagador_tercero_id — sin esto, "Recibí de" en el recibo de caja no tenía documento que mostrar '
  'para un pagador no registrado. Null cuando pagador_tercero_id resuelve el documento desde '
  'terceros.numero_documento.';

comment on column public.pagos.observaciones is
  'Nota libre sobre el pago (ej. "cheque posfechado"). Viaja al snapshot de recibos_caja.datos.';

-- ── documentos — generalización #3: pago_id nullable ────────────────────
alter table public.documentos
  add column pago_id uuid references public.pagos (id);

comment on column public.documentos.pago_id is
  'Nullable, igual que inmueble_id/caso_juridico_id: un documento puede ser el soporte adjunto '
  'de un pago concreto (foto del recibo físico, comprobante bancario). subir-documento lo acepta '
  'como campo opcional del FormData.';

create or replace function public.guard_documento_tipo_familia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_tenant_inmueble uuid;
  v_tenant_caso uuid;
  v_tenant_pago uuid;
begin
  select tipo into v_tipo from public.lista_tipos where id = new.tipo_documento_id;

  if v_tipo is distinct from 'TIPO_DOCUMENTO' then
    raise exception 'TIPO_DOCUMENTO_INVALIDO: tipo_documento_id % no pertenece a TIPO_DOCUMENTO (es %)',
      new.tipo_documento_id, coalesce(v_tipo, 'inexistente');
  end if;

  if new.inmueble_id is not null then
    select tenant_id into v_tenant_inmueble from public.inmuebles where id = new.inmueble_id;
    if v_tenant_inmueble is distinct from new.tenant_id then
      raise exception 'INMUEBLE_INVALIDO: % no pertenece al tenant %', new.inmueble_id, new.tenant_id;
    end if;
  end if;

  if new.caso_juridico_id is not null then
    select tenant_id into v_tenant_caso from public.casos_juridicos where id = new.caso_juridico_id;
    if v_tenant_caso is distinct from new.tenant_id then
      raise exception 'CASO_JURIDICO_INVALIDO: % no pertenece al tenant %', new.caso_juridico_id, new.tenant_id;
    end if;
  end if;

  if new.pago_id is not null then
    select tenant_id into v_tenant_pago from public.pagos where id = new.pago_id;
    if v_tenant_pago is distinct from new.tenant_id then
      raise exception 'PAGO_INVALIDO: % no pertenece al tenant %', new.pago_id, new.tenant_id;
    end if;
  end if;

  return new;
end;
$$;

-- ── nuevo código de catálogo: ninguno de los 16 existentes describe un
--    comprobante de pago (el más cercano, "otro_documento", perdería la
--    posibilidad de filtrar por tipo en la lista de documentos del pago).
insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_DOCUMENTO', 'comprobante_pago', 'Comprobante de pago', 16);

-- ── fn_emitir_recibo_caja: usa pagador_documento y suma observaciones ───
create or replace function public.fn_emitir_recibo_caja(p_pago_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago         public.pagos%rowtype;
  v_tenant       public.tenants%rowtype;
  v_inmueble     public.inmuebles%rowtype;
  v_forma_pago   text;
  v_recibi_nombre text;
  v_recibi_doc_tipo text;
  v_recibi_doc_numero text;
  v_conceptos    jsonb;
  v_aplicado     numeric(18, 2);
  v_saldo_despues numeric(18, 2);
  v_folio        text;
  v_recibo_id    uuid;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'PAGO_NO_ENCONTRADO: no existe el pago %', p_pago_id;
  end if;
  if v_pago.pago_original_id is not null or v_pago.monto <= 0 then
    -- Una reversa no genera recibo de caja (ver cabecera). Silencioso a
    -- propósito: el trigger llama esto para TODO insert en pagos.
    return null;
  end if;
  if exists (select 1 from public.recibos_caja where pago_id = p_pago_id) then
    return (select id from public.recibos_caja where pago_id = p_pago_id);
  end if;

  select * into v_tenant from public.tenants where id = v_pago.tenant_id;
  select * into v_inmueble from public.inmuebles where id = v_pago.inmueble_id;

  select nombre into v_forma_pago from public.lista_tipos where id = v_pago.forma_pago_id;

  -- "Recibí de" — prioridad descrita en 20260903160000. pagador_documento
  -- (nuevo, 2026-08-27) llena el documento cuando el pagador es texto
  -- libre — antes ese camino dejaba v_recibi_doc_numero en null.
  if v_pago.pagador_tercero_id is not null then
    select t.nombre_completo, lt.nombre, t.numero_documento
      into v_recibi_nombre, v_recibi_doc_tipo, v_recibi_doc_numero
    from public.terceros t
    left join public.lista_tipos lt on lt.id = t.tipo_identificacion_id
    where t.id = v_pago.pagador_tercero_id;
  elsif v_pago.pagador_nombre is not null then
    v_recibi_nombre := v_pago.pagador_nombre;
    v_recibi_doc_numero := v_pago.pagador_documento;
  else
    select t.nombre_completo, lt.nombre, t.numero_documento
      into v_recibi_nombre, v_recibi_doc_tipo, v_recibi_doc_numero
    from public.inmueble_persona_rol ipr
    join public.terceros t on t.id = ipr.tercero_id
    left join public.lista_tipos lt on lt.id = t.tipo_identificacion_id
    where ipr.tenant_id = v_pago.tenant_id
      and ipr.inmueble_id = v_pago.inmueble_id
      and ipr.es_pagador
      and ipr.vigente_hasta is null
    limit 1;
  end if;

  -- "Por concepto de" — mismo criterio de descripción real que
  -- 20260902150000 (fn_emitir_estados_cuenta): novedad.descripcion,
  -- "Capital · CÓDIGO", "Interés · CÓDIGO", 'Otro' como último recurso.
  select coalesce(jsonb_agg(jsonb_build_object(
           'descripcion', case c.categoria
             when 'capital' then
               case when co.codigo is not null then 'Capital · ' || co.codigo else 'Capital' end
             when 'interes' then
               case when co.codigo is not null then 'Interés · ' || co.codigo else 'Interés' end
             else coalesce(n.descripcion, 'Otro')
           end,
           'monto', pa.monto
         ) order by pa.created_at), '[]'::jsonb),
         coalesce(sum(pa.monto), 0)
    into v_conceptos, v_aplicado
  from public.pago_aplicaciones pa
  join public.cargos c on c.id = pa.cargo_id
  left join public.conceptos co on co.id = c.concepto_id
  left join public.novedades n on n.id = c.novedad_id
  where pa.pago_id = p_pago_id;

  select coalesce(sum(vs.monto_pendiente), 0) into v_saldo_despues
  from public.v_cargo_saldo vs
  where vs.inmueble_id = v_pago.inmueble_id and vs.monto_pendiente > 0;

  v_folio := public.fn_siguiente_consecutivo(v_pago.tenant_id, 'recibo_caja');

  insert into public.recibos_caja (tenant_id, pago_id, inmueble_id, folio, datos, generado_por)
  values (
    v_pago.tenant_id, p_pago_id, v_pago.inmueble_id, v_folio,
    jsonb_build_object(
      'tenant_nombre',    v_tenant.name,
      'tenant_nit',       v_tenant.nit,
      'tenant_direccion', v_tenant.direccion,
      'tenant_ciudad',    v_tenant.ciudad,
      'tenant_telefono',  v_tenant.telefono_1,
      'tenant_email',     v_tenant.email,
      'inmueble_codigo',  v_inmueble.codigo,
      'recibi_de_nombre',       v_recibi_nombre,
      'recibi_de_documento_tipo',   v_recibi_doc_tipo,
      'recibi_de_documento_numero', v_recibi_doc_numero,
      'monto',            v_pago.monto,
      'fecha_pago',       to_char(v_pago.fecha_pago, 'YYYY-MM-DD'),
      'forma_pago',       v_forma_pago,
      'referencia',       v_pago.referencia,
      'observaciones',    v_pago.observaciones,
      'conceptos',        v_conceptos,
      'anticipo',         v_pago.monto - v_aplicado,
      'saldo_pendiente_despues', v_saldo_despues,
      'generado_en',      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    v_pago.registrado_por
  )
  returning id into v_recibo_id;

  return v_recibo_id;
end;
$$;
