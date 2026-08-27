-- ═══════════════════════════════════════════════════════════════════════
--  RC-3 (2/2) · El motor del recibo de caja, en SQL — decisión del usuario
--  2026-08-27. Mismo principio que fn_emitir_estados_cuenta (E15): el
--  snapshot se arma una vez, en la base, y queda inmutable.
--
--  ═══ QUÉ SÍ GUARDA EL SNAPSHOT, QUÉ NO ═══
--
--  `datos` guarda HECHOS: quién pagó, cuánto, cuándo, por qué concepto(s),
--  cómo, y el saldo que le quedó al inmueble. NO guarda el monto en letras
--  ("Cien mil pesos M/CTE") ni el hash de verificación — ambos son
--  DERIVACIONES de presentación, igual que ya hace ver-estado-cuenta con el
--  hash SHA-256 (lo calcula al leer, no lo persiste) y como cualquier
--  página de este proyecto formatea moneda en el momento de mostrarla.
--  montoEnLetras() vive en packages/shared (numero-a-letras.ts) — un
--  algoritmo puro y ya probado; reescribirlo en PL/pgSQL sería la MISMA
--  clase de duplicación de lógica entre dos productores que costó una
--  corrección completa en el estado de cuenta esta sesión (20260902150000).
--  Aquí no se repite: el motor arma los hechos, el renderer los presenta.
--
--  ═══ EMISIÓN AUTOMÁTICA, DECISIÓN DEL USUARIO ═══
--
--  "Recibo automático con cada pago" — se implementa como trigger AFTER
--  INSERT en `pagos`, no como un paso dentro de registrar-pago: así cubre
--  cualquier camino que inserte un pago real, hoy o mañana (una carga
--  masiva, una conciliación), sin que cada uno tenga que acordarse de
--  llamar al motor. Se excluyen las REVERSAS (pago_original_id not null) y
--  cualquier pago no positivo: una reversa es dinero saliendo, no un
--  recibo de caja — es la clase de documento que el usuario dejó fuera de
--  este plan (comprobante_egreso), no un recibo con monto negativo.
--
--  ═══ "RECIBÍ DE" ═══
--
--  Prioridad: pagador_tercero_id (quien pagó, seleccionado explícitamente
--  de terceros al registrar el pago, RC-0) → pagador_nombre (texto libre,
--  cuando quien paga no es tercero registrado) → inferencia por
--  inmueble_persona_rol.es_pagador (mismo criterio que ya usa
--  notificarPagoConfirmado en registrar-pago/index.ts) → null si nada de
--  eso resuelve (el recibo se emite igual, sin ese dato).
--
--  ═══ "POR CONCEPTO DE" ═══
--
--  Un arreglo de líneas {descripcion, monto}, una por cada cargo que este
--  pago cubrió — MISMA resolución de descripción real que
--  20260902150000_estado_cuenta_descripcion_real.sql (novedad.descripcion,
--  "Capital · CÓDIGO", "Interés · CÓDIGO"). Se preferió un arreglo fiel a
--  una frase sintética: un pago puede cubrir varios cargos de naturaleza
--  distinta (capital + una multa, por ejemplo) y forzarlo a una sola
--  oración le mentiría al lector. `anticipo` es la parte que no se aplicó
--  a ningún cargo (0 si no aplica) — el renderer la omite si es 0.
-- ═══════════════════════════════════════════════════════════════════════

create table public.recibos_caja (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  pago_id       uuid not null references public.pagos (id),
  inmueble_id   uuid not null references public.inmuebles (id),
  folio         text not null,
  datos         jsonb not null,
  generado_por  uuid references public.profiles (id),
  created_at    timestamptz not null default now(),

  constraint recibos_caja_folio_unica unique (folio),
  -- Un pago real (nunca una reversa) tiene a lo sumo un recibo — la
  -- emisión automática nunca debería duplicar, esto lo hace imposible
  -- incluso si algo llamara al motor dos veces por error.
  constraint recibos_caja_un_pago unique (pago_id)
);

alter table public.recibos_caja enable row level security;
alter table public.recibos_caja force row level security;

create index recibos_caja_tenant_idx on public.recibos_caja (tenant_id);
create index recibos_caja_inmueble_idx on public.recibos_caja (inmueble_id);

comment on table public.recibos_caja is
  'Snapshot inmutable del recibo de caja de cada pago real (RC-3) — un pago, un recibo, emitido '
  'automáticamente por trg_emitir_recibo_caja. "¿Está anulado?" se DERIVA en el momento de leer '
  '(existe una reversa cuyo pago_original_id = recibos_caja.pago_id), no se persiste aquí — '
  'mismo principio que todo lo demás en este ledger: los hechos derivados no se guardan dos veces.';

create trigger recibos_caja_append_only
  before update or delete on public.recibos_caja
  for each row execute function public.forbid_mutation();

create policy recibos_caja_select_miembro
  on public.recibos_caja for select
  to authenticated
  using (public.is_member(tenant_id));

-- ── el motor ─────────────────────────────────────────────────────────
create function public.fn_emitir_recibo_caja(p_pago_id uuid)
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

  -- "Recibí de" — prioridad descrita en la cabecera.
  if v_pago.pagador_tercero_id is not null then
    select t.nombre_completo, lt.nombre, t.numero_documento
      into v_recibi_nombre, v_recibi_doc_tipo, v_recibi_doc_numero
    from public.terceros t
    left join public.lista_tipos lt on lt.id = t.tipo_identificacion_id
    where t.id = v_pago.pagador_tercero_id;
  elsif v_pago.pagador_nombre is not null then
    v_recibi_nombre := v_pago.pagador_nombre;
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

comment on function public.fn_emitir_recibo_caja(uuid) is
  'Motor del recibo de caja (RC-3): arma el snapshot de HECHOS de un pago real (nunca de una '
  'reversa) — monto en letras y hash de verificación se derivan al leer, no se guardan aquí '
  '(mismo principio que ver-estado-cuenta). Idempotente: si el pago ya tiene recibo, devuelve el '
  'existente en vez de duplicar.';

create function public.trg_emitir_recibo_caja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_emitir_recibo_caja(new.id);
  return null;
end;
$$;

create trigger trg_emitir_recibo_caja
  after insert on public.pagos
  for each row execute function public.trg_emitir_recibo_caja();

comment on function public.trg_emitir_recibo_caja() is
  'Emite el recibo de caja automáticamente con cada pago real (RC-3, decisión del usuario '
  '2026-08-27) — de fila, no de sentencia: cada pago es su propio recibo. fn_emitir_recibo_caja '
  'ya filtra las reversas y es idempotente, así que este trigger no necesita duplicar esa lógica.';
