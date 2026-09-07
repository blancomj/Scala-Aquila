-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (4/8)
--
--  finanzas_lote_items — cada fila reserva disponibilidad de la cuenta
--  bancaria EN EL MISMO ACTO de crearse (§3.2, "razón por la que FIN-3 no
--  puede existir sin FIN-1"). Por eso la creación no es un INSERT
--  declarativo simple: el guard hace todo el trabajo en una sola
--  transacción (mismo criterio que "medición genera incidencia" de MANT-4,
--  BEFORE INSERT, no AFTER — lección de D-56, un AFTER INSERT con UPDATE
--  de vuelta no se refleja en el RETURNING de la sentencia original):
--
--    1. Valida que la factura esté 'aprobada' y no esté ya en otro lote activo.
--    2. Valida la aritmética (monto completo vs. parcial, contra el PENDIENTE
--       real de la factura — no contra total_neto_pagar a secas, para que un
--       segundo pago parcial sobre una factura ya parcialmente pagada calcule
--       bien el remanente).
--    3. Crea el compromiso bancario reservado (guard_finanzas_compromiso_
--       bancario de FIN-1 ya rechaza por construcción si excede disponible —
--       COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE, prueba central del corte).
--    4. Pasa la factura a 'programada'.
--    5. Actualiza los agregados del lote (monto_total/cantidad_pagos).
--
--  No hay una función RPC para "agregar ítem": un INSERT directo alcanza
--  porque todo el efecto colateral vive en el guard, igual que crear una
--  factura no necesita RPC (solo aprobarla la necesita). El DELETE (retirar
--  un ítem antes de que el lote se apruebe) revierte los mismos cuatro
--  efectos. Una vez que el lote deja borrador/programado, los ítems quedan
--  bloqueados — from ahí en adelante solo fn_finanzas_anular_lote puede
--  revertir todo junto.
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_lote_items (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants (id) on delete cascade,
  lote_id               uuid not null references public.finanzas_lotes_pago (id) on delete cascade,
  factura_id            uuid not null references public.finanzas_facturas_proveedor (id),
  monto_a_pagar         numeric(18, 2) not null check (monto_a_pagar > 0),
  es_pago_parcial       boolean not null default false,
  observaciones         text,
  compromiso_bancario_id uuid references public.finanzas_cuenta_bancaria_compromiso (id),
  created_at            timestamptz not null default now(),

  constraint finanzas_lote_items_factura_unica_por_lote unique (lote_id, factura_id)
);

alter table public.finanzas_lote_items enable row level security;
alter table public.finanzas_lote_items force row level security;

comment on table public.finanzas_lote_items is
  'FIN-3 §3.2: ítems del lote — cada uno crea su propio compromiso bancario reservado al '
  'insertarse (guard_finanzas_lote_item). compromiso_bancario_id lo asigna siempre el guard, '
  'nunca el cliente.';

create index finanzas_lote_items_factura_idx on public.finanzas_lote_items (factura_id);

create policy finanzas_lote_items_select_miembro
  on public.finanzas_lote_items for select
  to authenticated
  using (public.is_member(tenant_id));

create policy finanzas_lote_items_insert_auxiliar
  on public.finanzas_lote_items for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_lote_items_update_auxiliar
  on public.finanzas_lote_items for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_lote_items_delete_auxiliar
  on public.finanzas_lote_items for delete
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_finanzas_lote_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote        public.finanzas_lotes_pago;
  v_factura     public.finanzas_facturas_proveedor;
  v_pendiente   numeric(18, 2);
  v_compromiso  uuid;
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
       or new.compromiso_bancario_id is distinct from old.compromiso_bancario_id
       or new.lote_id is distinct from old.lote_id then
      raise exception 'LOTE_ITEM_LOTE_NO_MODIFICABLE: un ítem ya creado es inmutable salvo '
        'observaciones — retíralo y créalo de nuevo si necesitas otro monto';
    end if;
    return new;
  end if;

  -- ── INSERT ──
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

  -- Pendiente real: descuenta lo ya pagado en lotes previos ya ejecutados/conciliados de esta
  -- misma factura (un pago parcial anterior deja un remanente distinto de total_neto_pagar).
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

  -- Compromiso reservado — guard_finanzas_compromiso_bancario (FIN-1) rechaza por construcción
  -- si esto deja el disponible de la cuenta en negativo (COMPROMISO_BANCARIO_EXCEDE_DISPONIBLE).
  insert into public.finanzas_cuenta_bancaria_compromiso (
    tenant_id, cuenta_bancaria_id, origen, origen_id, monto, estado, fecha_esperada_ejecucion
  ) values (
    new.tenant_id, v_lote.cuenta_bancaria_id, 'lote_pago', new.id, new.monto_a_pagar, 'reservado',
    v_lote.fecha_programada
  )
  returning id into v_compromiso;
  new.compromiso_bancario_id := v_compromiso;

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
  'Único punto de entrada para agregar/retirar un ítem del lote — sin RPC aparte, el INSERT/'
  'DELETE directo alcanza porque todo el efecto colateral (compromiso, estado de la factura, '
  'agregados del lote) vive aquí. Usa aquila.desprogramando_factura para poder mover '
  'programada→aprobada al retirar un ítem, transición que guard_finanzas_factura_proveedor '
  'rechaza fuera de este mecanismo (ver 20260931270000).';

create trigger finanzas_lote_item_guard
  before insert or update or delete on public.finanzas_lote_items
  for each row execute function public.guard_finanzas_lote_item();
