-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (3/8)
--
--  finanzas_lotes_pago — la cabecera del lote. `numero`/`anio` (no un
--  `codigo text` persistido): mismo patrón que mant_ordenes_trabajo/
--  mant_incidencias (MANT-4) y contable_comprobante (CO-2) — ninguna otra
--  tabla del repositorio guarda el string formateado ("LP-2026-00001"), se
--  compone en la UI a partir de numero+anio. Desviación deliberada de la
--  letra del corte hacia el patrón ya establecido (confirmada en el Plan).
--
--  Tabla de consecutivo propia (finanzas_lotes_pago_consecutivo) — NO se
--  reutiliza mant_consecutivo ni contable_consecutivo: mezclar series de
--  dominios distintos en la misma tabla fue explícitamente rechazado por
--  el propio encabezado de MANT-4 (20260930900000). Una sola serie en este
--  dominio por ahora, así que la clave es (tenant_id, anio), sin la
--  dimensión serie_id que sí necesita MANT (que reutiliza una tabla para
--  incidencia Y orden de trabajo).
--
--  finanzas_lote_advertencia — mismo patrón que finanzas_factura_
--  advertencia (FIN-2): mientras GOB-1 (gobierno_organos) no exista, un
--  lote que supera el umbral de asamblea deja advertencia inspeccionable
--  en vez de bloquear.
--
--  Fuera de este corte: `codigo` compuesto, cálculo de "criticidad_
--  proveedor" (no existe ese concepto en el repo — MANT-1 solo tiene
--  criticidad de ACTIVOS, MANT-5 solo tiene evaluación de desempeño;
--  ninguna es "criticidad de proveedor" — confirmado con el usuario en el
--  Plan del corte, se omite en vez de inventar la equivalencia).
-- ═══════════════════════════════════════════════════════════════════════

create table public.finanzas_lotes_pago_consecutivo (
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  anio          smallint not null,
  ultimo_numero integer not null default 0,
  updated_at    timestamptz,
  primary key (tenant_id, anio)
);

alter table public.finanzas_lotes_pago_consecutivo enable row level security;
alter table public.finanzas_lotes_pago_consecutivo force row level security;

comment on table public.finanzas_lotes_pago_consecutivo is
  'FIN-3: contador (tenant_id, anio) -> último número usado, actualizado solo por '
  'fn_finanzas_lotes_pago_siguiente_numero vía on conflict do update — nunca sequence (marco §6.5, '
  'la consecutividad legal no admite huecos).';

create policy finanzas_lotes_pago_consecutivo_select_miembro
  on public.finanzas_lotes_pago_consecutivo for select
  to authenticated
  using (public.is_member(tenant_id));

create function public.fn_finanzas_lotes_pago_siguiente_numero(p_tenant_id uuid, p_anio smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero integer;
begin
  insert into public.finanzas_lotes_pago_consecutivo (tenant_id, anio, ultimo_numero, updated_at)
  values (p_tenant_id, p_anio, 1, now())
  on conflict (tenant_id, anio)
  do update set ultimo_numero = public.finanzas_lotes_pago_consecutivo.ultimo_numero + 1, updated_at = now()
  returning ultimo_numero into v_numero;
  return v_numero;
end;
$$;

comment on function public.fn_finanzas_lotes_pago_siguiente_numero(uuid, smallint) is
  'Mismo patrón que fn_mant_siguiente_numero (MANT-4): único punto que escribe en el contador, '
  'nunca llamado directo por el cliente — lo invoca guard_finanzas_lote_pago en el INSERT.';

-- ── Cabecera del lote ────────────────────────────────────────────────────
create table public.finanzas_lotes_pago (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  numero             integer not null,
  anio               smallint not null,
  descripcion        text,
  cuenta_bancaria_id uuid not null references public.cuentas_bancarias (id),
  fondo_id           uuid references public.fondos (id),
  fecha_programada   date not null,
  fecha_ejecucion    date,
  estado             public.lote_estado_t not null default 'borrador',
  monto_total        numeric(18, 2) not null default 0,
  cantidad_pagos     integer not null default 0,
  -- Motivo obligatorio solo cuando la aprobación salta una validación no bloqueante
  -- (proveedor con habilitación vencida/próxima a vencer) — fn_finanzas_aprobar_lote.
  justificacion      text,
  creado_por         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  aprobado_por       uuid references public.profiles (id),
  aprobado_at        timestamptz,
  ejecutado_por      uuid references public.profiles (id),
  ejecutado_at       timestamptz,
  anulado_por        uuid references public.profiles (id),
  anulado_at         timestamptz,
  anulado_motivo      text,
  updated_at         timestamptz,

  constraint finanzas_lotes_pago_numero_unico unique (tenant_id, anio, numero),
  constraint finanzas_lotes_pago_montos_validos check (monto_total >= 0 and cantidad_pagos >= 0)
);

alter table public.finanzas_lotes_pago enable row level security;
alter table public.finanzas_lotes_pago force row level security;

comment on table public.finanzas_lotes_pago is
  'FIN-3 §3.1: lote de pago — agrupa facturas aprobadas para pagarlas juntas contra una cuenta '
  'bancaria. monto_total/cantidad_pagos son agregados mantenidos por el guard de '
  'finanzas_lote_items (nunca calculados aparte, siempre en sincronía con sus ítems). '
  'extracto_linea_id se agrega en una migración posterior (fn_finanzas_conciliar_lote).';

comment on column public.finanzas_lotes_pago.fondo_id is
  'Opcional — si el lote paga contra un fondo específico (p. ej. imprevistos) en vez de la '
  'operación general de la cuenta. No afecta el compromiso bancario, que siempre es por cuenta.';

create policy finanzas_lotes_pago_select_miembro
  on public.finanzas_lotes_pago for select
  to authenticated
  using (public.is_member(tenant_id));

create policy finanzas_lotes_pago_insert_auxiliar
  on public.finanzas_lotes_pago for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create policy finanzas_lotes_pago_update_auxiliar
  on public.finanzas_lotes_pago for update
  to authenticated
  using (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.guard_finanzas_lote_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitida boolean := false;
begin
  -- ── 'conciliado' y 'anulado' son terminales: cualquier columna, no solo estado ──
  if tg_op = 'UPDATE' and old.estado in ('conciliado', 'anulado') then
    raise exception 'LOTE_CONCILIADO_INMUTABLE: el lote % está % y no admite modificaciones',
      old.id, old.estado;
  end if;

  if tg_op = 'INSERT' then
    new.anio := coalesce(new.anio, extract(year from new.fecha_programada)::smallint);
    new.numero := public.fn_finanzas_lotes_pago_siguiente_numero(new.tenant_id, new.anio);
  end if;

  -- ── Consistencia de tenant ──
  if not exists (
    select 1 from public.cuentas_bancarias where id = new.cuenta_bancaria_id and tenant_id = new.tenant_id
  ) then
    raise exception 'LOTE_TENANT_INCONSISTENTE: la cuenta bancaria % no pertenece al tenant',
      new.cuenta_bancaria_id;
  end if;
  if new.fondo_id is not null
     and not exists (select 1 from public.fondos where id = new.fondo_id and tenant_id = new.tenant_id) then
    raise exception 'LOTE_TENANT_INCONSISTENTE: el fondo % no pertenece al tenant', new.fondo_id;
  end if;

  -- ── FSM (solo en UPDATE) ──
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'aprobado' then
      if coalesce(current_setting('aquila.aprobando_lote', true), 'false') <> 'true' then
        raise exception 'LOTE_TRANSICION_INVALIDA: aprobar un lote exige fn_finanzas_aprobar_lote, '
          'no un UPDATE directo';
      end if;
      v_permitida := old.estado = 'programado';
    elsif new.estado = 'ejecutado' then
      if coalesce(current_setting('aquila.ejecutando_lote', true), 'false') <> 'true' then
        raise exception 'LOTE_TRANSICION_INVALIDA: ejecutar un lote exige fn_finanzas_ejecutar_lote, '
          'no un UPDATE directo';
      end if;
      v_permitida := old.estado = 'aprobado';
    elsif new.estado = 'conciliado' then
      if coalesce(current_setting('aquila.conciliando_lote', true), 'false') <> 'true' then
        raise exception 'LOTE_TRANSICION_INVALIDA: conciliar un lote exige fn_finanzas_conciliar_lote, '
          'no un UPDATE directo';
      end if;
      v_permitida := old.estado = 'ejecutado';
    elsif new.estado = 'anulado' then
      if coalesce(current_setting('aquila.anulando_lote', true), 'false') <> 'true' then
        raise exception 'LOTE_TRANSICION_INVALIDA: anular un lote exige fn_finanzas_anular_lote, '
          'no un UPDATE directo';
      end if;
      v_permitida := old.estado in ('borrador', 'programado', 'aprobado');
      if new.anulado_motivo is null or btrim(new.anulado_motivo) = '' then
        raise exception 'LOTE_ANULACION_SIN_MOTIVO: anular un lote exige anulado_motivo';
      end if;
    elsif new.estado = 'programado' then
      v_permitida := old.estado = 'borrador';
      if v_permitida and old.cantidad_pagos = 0 then
        raise exception 'LOTE_TRANSICION_INVALIDA: un lote sin ítems no puede programarse';
      end if;
    else
      v_permitida := false;
    end if;

    if not v_permitida then
      raise exception 'LOTE_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

comment on function public.guard_finanzas_lote_pago() is
  'FSM completa del lote (borrador→programado→aprobado→ejecutado→conciliado, cualquiera salvo '
  'ejecutado/conciliado→anulado) — cada transición sensible exige su propia función '
  '(fn_finanzas_aprobar_lote/ejecutar_lote/conciliar_lote/anular_lote) vía session setting, mismo '
  'mecanismo que aquila.aprobando_factura (FIN-2)/aquila.cerrando_ot (MANT-4). numero/anio se '
  'asignan siempre aquí, nunca los acepta el cliente (mismo criterio que mant_ordenes_trabajo).';

create trigger finanzas_lote_pago_guard
  before insert or update on public.finanzas_lotes_pago
  for each row execute function public.guard_finanzas_lote_pago();

-- ── Advertencia inspeccionable mientras GOB-1 no exista (mismo patrón que FIN-2) ──
create table public.finanzas_lote_advertencia (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  lote_id     uuid not null references public.finanzas_lotes_pago (id) on delete cascade,
  codigo      text not null,
  mensaje     text not null,
  created_at  timestamptz not null default now()
);

alter table public.finanzas_lote_advertencia enable row level security;
alter table public.finanzas_lote_advertencia force row level security;

create index finanzas_lote_advertencia_lote_idx on public.finanzas_lote_advertencia (lote_id);

comment on table public.finanzas_lote_advertencia is
  'FIN-3 §3.4: mismo patrón que finanzas_factura_advertencia (FIN-2) — log inspeccionable para '
  'LOTE_APROBACION_ORGANO_INCOMPETENTE mientras GOB-1 no exista, nunca un RAISE NOTICE. '
  'Append-only por convención.';

create policy finanzas_lote_advertencia_select_miembro
  on public.finanzas_lote_advertencia for select
  to authenticated
  using (public.is_member(tenant_id));
