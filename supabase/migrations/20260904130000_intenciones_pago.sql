-- ═══════════════════════════════════════════════════════════════════════
--  Fase 2 · bloque 1 — intenciones de pago e idempotencia del recaudo por
--  pasarela. Propietario: Docs/evaluacion/05-evaluacion-pagos-conciliacion.md
--  §C.2.1 (idempotencia), §C.2.5 (referencia) y §C.2.6 (estados intermedios).
--
--  REGLA QUE GOBIERNA TODO ESTO: un pago de pasarela NO es un tipo de pago
--  nuevo, es un pago normal que entró por otro canal. Esta migración NO crea
--  un pipeline paralelo — conecta la pasarela al que ya existe (imputación en
--  cascada, recibo de caja, descuento por pronto pago, proyección contable).
--
--  Un pago PSE tarda minutos y uno en efectivo días: durante ese tiempo hay
--  una intención que TODAVÍA NO ES DINERO. Por eso vive en su propia tabla,
--  no contable, con expiración — el ledger solo se toca cuando la pasarela
--  confirma, y exactamente una vez.
-- ═══════════════════════════════════════════════════════════════════════

create type public.intencion_pago_estado_t as enum
  ('creada', 'pendiente', 'aprobada', 'rechazada', 'expirada');

comment on type public.intencion_pago_estado_t is
  'Ciclo de vida de una intención de pago por pasarela. Enum nativo y no lista_tipos (D-24) '
  'porque el valor gatilla una máquina de estados con transiciones validadas por '
  'guard_intencion_transicion y decide si el webhook puede materializar un pago en el ledger: '
  'solo la transición a aprobada inserta en pagos, y solo una vez. aprobada es terminal e '
  'inmutable — una devolución posterior es fn_anular_pago sobre el pago, nunca un cambio de '
  'estado aquí.';

create table public.intenciones_pago (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  inmueble_id     uuid not null references public.inmuebles (id),
  proveedor       public.pasarela_proveedor_t not null,
  referencia      text not null,
  monto           numeric(18, 2) not null check (monto > 0),
  estado          public.intencion_pago_estado_t not null default 'creada',
  transaction_id  text,
  metodo          text,
  pago_id         uuid references public.pagos (id),
  expira_at       timestamptz not null,
  -- null = la creó el propietario desde el enlace público del estado de
  -- cuenta: no tiene cuenta de usuario (AD-26), así que no hay actor_id.
  creada_por      uuid references public.profiles (id),
  -- Divergencia detectada al confirmar (monto distinto al esperado, típico en
  -- pagos parciales en efectivo). Se REGISTRA y se marca para revisión — nunca
  -- se ajusta en silencio (§4.1 del prompt de fase 2).
  revision_motivo text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

comment on table public.intenciones_pago is
  'Intención de pago por pasarela: el estado PREVIO al dinero, deliberadamente NO contable '
  '(§C.2.6). El pago solo entra al ledger cuando la pasarela confirma, vía '
  'fn_registrar_pago_pasarela. Sin política de INSERT/UPDATE para authenticated: crear y '
  'confirmar una intención tiene efectos de seguridad (define cuánto se cobra y cuándo se '
  'materializa un pago) que el cliente no debe poder eludir — mismo criterio que pagos '
  '(REQ-SEC-001). Se escribe desde Edge Functions con service_role.';

comment on column public.intenciones_pago.referencia is
  'Referencia estructurada {tenant_slug}-{codigo_inmueble}-{periodo}-{uuid_corto} (§C.2.5). Es '
  'la llave que alimentará la conciliación bancaria — determinista de construir y parseable. Su '
  'generación vive en una función pura testeable (packages/payment-gateways), no incrustada en '
  'una Edge Function.';

comment on column public.intenciones_pago.monto is
  'Monto ESPERADO. El confirmado por la pasarela puede diferir; si difiere se registra en '
  'revision_motivo y se marca para revisión manual, nunca se ajusta.';

alter table public.intenciones_pago enable row level security;
alter table public.intenciones_pago force row level security;

create index intenciones_pago_tenant_idx on public.intenciones_pago (tenant_id);
create index intenciones_pago_inmueble_idx on public.intenciones_pago (inmueble_id);
-- Para el job de expiración: intenciones vivas ya vencidas.
create index intenciones_pago_expiracion_idx
  on public.intenciones_pago (expira_at)
  where estado in ('creada', 'pendiente');

create unique index intenciones_pago_referencia_unica
  on public.intenciones_pago (tenant_id, referencia);

-- Idempotencia de primer nivel: un transaction_id del proveedor pertenece a
-- una sola intención.
create unique index intenciones_pago_transaccion_unica
  on public.intenciones_pago (proveedor, transaction_id)
  where transaction_id is not null;

-- Lectura para miembros (el administrador necesita su bandeja de
-- transacciones). Escritura: ninguna política — solo service_role.
create policy intenciones_pago_select_miembro on public.intenciones_pago
  for select to authenticated
  using (public.is_member(tenant_id));

-- ── Máquina de estados ─────────────────────────────────────────────────
-- creada → pendiente → aprobada | rechazada
-- creada → expirada · pendiente → expirada
-- aprobada → TERMINAL (inmutable)
--
-- A diferencia de guard_novedad_transicion, aquí NO hay atajo para no-ops
-- (`if new.estado = old.estado then return new`): ese atajo fue exactamente
-- el agujero del hallazgo S1 (20260831130000), donde aprobada→aprobada pasaba
-- sin excepción y se duplicaba un cargo. Una intención aprobada es
-- definitivamente inmutable, incluso contra sí misma.
create function public.guard_intencion_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'aprobada' then
    raise exception
      'INTENCION_TERMINAL: la intención % ya está aprobada y es inmutable (generó el pago %)',
      old.id, old.pago_id;
  end if;

  if new.estado <> old.estado then
    if not (
      (old.estado = 'creada'    and new.estado in ('pendiente', 'expirada', 'rechazada'))
      or (old.estado = 'pendiente' and new.estado in ('aprobada', 'rechazada', 'expirada'))
    ) then
      raise exception 'INTENCION_TRANSICION_INVALIDA: % -> % no es una transición válida (%)',
        old.estado, new.estado, old.id;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger intenciones_pago_transicion
  before update on public.intenciones_pago
  for each row execute function public.guard_intencion_transicion();

-- ── Idempotencia de último nivel, en el propio ledger ──────────────────
alter table public.pagos
  add column intencion_pago_id uuid references public.intenciones_pago (id);

comment on column public.pagos.intencion_pago_id is
  'Intención de pasarela que originó este pago (null = pago capturado a mano). El índice único '
  'parcial pagos_intencion_unica es la ÚLTIMA línea de defensa: aunque el webhook llegue cinco '
  'veces, no puede haber dos pagos para la misma intención.';

-- La columna nace nula, así que no hay backfill: el trigger pagos_append_only
-- (SEC-14) NO se desactiva en esta migración. Un ALTER TABLE ... ADD COLUMN no
-- lo dispara; un UPDATE de backfill sí lo haría.
create unique index pagos_intencion_unica
  on public.pagos (intencion_pago_id)
  where intencion_pago_id is not null;

-- ── fn_registrar_pago_pasarela — idempotente por diseño ────────────────
--
-- Patrón de 20260831130000 (hallazgo S1), al pie de la letra: el UPDATE lleva
-- `estado = 'pendiente'` EN EL PROPIO WHERE, no en un IF previo. Bajo
-- concurrencia real Postgres serializa ambas transacciones sobre el lock de
-- fila; cuando la segunda corre, la fila ya no cumple el WHERE y el UPDATE
-- afecta cero filas, que `FOUND` detecta.
--
-- DIFERENCIA CLAVE con fn_aprobar_novedad: allí la segunda invocación es un
-- ERROR (NOVEDAD_NO_PENDIENTE). Aquí es el comportamiento NORMAL — toda
-- pasarela entrega webhooks at-least-once — así que la segunda llamada
-- devuelve en silencio el pago ya existente. Éxito, no excepción.
--
-- Las aplicaciones llegan ya calculadas por imputarPago() (la política del
-- tenant, no una lógica propia de pasarela) como un arreglo de
-- (cargo_id, monto); esta función solo las materializa.
create function public.fn_registrar_pago_pasarela(
  p_intencion_id     uuid,
  p_transaction_id   text,
  p_monto            numeric,
  p_forma_pago_id    bigint,
  p_fecha_pago       date,
  p_aplicaciones     jsonb,
  p_revision_motivo  text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_intencion public.intenciones_pago;
  v_pago_id   uuid;
  v_aplicacion jsonb;
begin
  -- Idempotencia: si la intención ya no está pendiente, alguien ganó la
  -- carrera. Devolver su pago es la respuesta correcta a un webhook repetido.
  update public.intenciones_pago
     set estado = 'aprobada',
         transaction_id = coalesce(p_transaction_id, transaction_id),
         revision_motivo = p_revision_motivo
   where id = p_intencion_id and estado = 'pendiente'
  returning * into v_intencion;

  if not found then
    select pago_id into v_pago_id
    from public.intenciones_pago
    where id = p_intencion_id;

    if v_pago_id is null then
      -- Ni pendiente ni con pago: expirada, rechazada o inexistente. Eso sí
      -- es un error — no hay nada que devolver.
      raise exception
        'INTENCION_NO_PENDIENTE: la intención % no está pendiente y no tiene pago asociado',
        p_intencion_id;
    end if;

    return v_pago_id;
  end if;

  insert into public.pagos (
    tenant_id, inmueble_id, monto, fecha_pago, referencia,
    forma_pago_id, intencion_pago_id, registrado_por
  ) values (
    v_intencion.tenant_id, v_intencion.inmueble_id, p_monto, p_fecha_pago,
    v_intencion.referencia, p_forma_pago_id, v_intencion.id, v_intencion.creada_por
  )
  returning id into v_pago_id;

  -- Dispara trg_descuento_pronto_pago (statement-level sobre pago_aplicaciones).
  for v_aplicacion in select * from jsonb_array_elements(p_aplicaciones)
  loop
    insert into public.pago_aplicaciones (tenant_id, pago_id, cargo_id, monto)
    values (
      v_intencion.tenant_id,
      v_pago_id,
      (v_aplicacion ->> 'cargo_id')::uuid,
      (v_aplicacion ->> 'monto')::numeric
    );
  end loop;

  -- EL RECIBO DE CAJA NO SALE SOLO. El trigger trg_emitir_recibo_caja (AFTER
  -- INSERT ON pagos) fue RETIRADO en 20260903190000: emitía el snapshot antes
  -- de que existieran las filas de pago_aplicaciones, y el recibo salía con
  -- "por concepto de" vacío y todo el monto como anticipo. Por eso se llama
  -- aquí, explícitamente, DESPUÉS de insertar las aplicaciones — que es lo
  -- que aquella migración dejó anotado para todo camino de escritura nuevo.
  -- Aquí sale mejor que en el camino manual: esto es una sola transacción.
  perform public.fn_emitir_recibo_caja(v_pago_id);

  update public.intenciones_pago
     set pago_id = v_pago_id
   where id = p_intencion_id;

  return v_pago_id;
end;
$$;

comment on function public.fn_registrar_pago_pasarela(uuid, text, numeric, bigint, date, jsonb, text) is
  'Materializa en el ledger un pago confirmado por una pasarela, en UNA transacción: pagos + '
  'pago_aplicaciones + recibo de caja + estado de la intención. Idempotente por diseño (patrón '
  'S1, 20260831130000): el UPDATE exige estado=''pendiente'' en el WHERE, así que un webhook '
  'duplicado — que toda pasarela garantiza, entrega at-least-once — devuelve en silencio el pago '
  'ya existente en vez de crear un segundo. Llama fn_emitir_recibo_caja explícitamente porque el '
  'trigger automático se retiró en 20260903190000.';

revoke execute on function
  public.fn_registrar_pago_pasarela(uuid, text, numeric, bigint, date, jsonb, text)
  from public, anon, authenticated;
grant execute on function
  public.fn_registrar_pago_pasarela(uuid, text, numeric, bigint, date, jsonb, text)
  to service_role;
