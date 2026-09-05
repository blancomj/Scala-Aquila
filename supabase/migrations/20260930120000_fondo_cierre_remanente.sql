-- ═══════════════════════════════════════════════════════════════════════
--  BLOQUE O — Cierre y remanentes del dominio Fondos
--  (Prompt Maestro Módulo Fondos §35 REMANENTES, §36 CIERRE; PLAN §7 GAP-22,
--   ANALISIS_FONDOS_BLOQUE_A.md §6 — descrito ahí como "puro estado +
--   documento", pero §36 exige más que eso: "no cerrar si hay remanente sin
--   decisión / compromisos pendientes", y eso no se hace cumplir con un
--   simple cambio de estado sin guardar).
--
--  LA PIEZA QUE YA EXISTÍA (BLOQUE E/F, 20260929120000/140000) —
--  guard_fondo_movimiento ya reserva el tipo 'cierre_remanente' para cuando
--  un fondo está en_cierre ("en_cierre admite únicamente el tratamiento del
--  remanente"), y fn_fondo_movimiento_efecto ya sabe que resta del saldo.
--  Lo que faltaba era (a) el punto de entrada que registra esa decisión —
--  quién, con qué autorización, hacia dónde va el remanente— y (b) la
--  guarda que impide llegar a 'cerrado' saltándose ese paso.
--
--  LA CADENA DEL §35 ("saldo final → remanente → decisión competente →
--  destino → traslado/devolución/aplicación → cierre"), implementada:
--
--    fondo_remanentes         — la decisión (quién, por qué, hacia dónde),
--                               append-only: un hecho jurídico ya ocurrido,
--                               mismo criterio que fondo_autorizaciones.
--    fn_fondo_cerrar()        — operación atómica (Prompt §53): valida que
--                               no queden compromisos/solicitudes pendientes,
--                               calcula el saldo derivado, si es > 0 exige
--                               destino/órgano/decisión y registra el
--                               movimiento 'cierre_remanente' (+ un
--                               'traslado_entrada' en el fondo destino si
--                               el destino es 'traslado'), y solo entonces
--                               pasa el fondo a 'cerrado'. Si el saldo ya es
--                               0, cierra directo (nada que decidir).
--    guard_fondo_cierre_completo — trigger adicional (no reemplaza
--                               guard_fondo_estado_transicion, que sigue
--                               validando solo el grafo de estados) que
--                               bloquea específicamente en_cierre→cerrado
--                               si el saldo derivado no es cero o si quedan
--                               compromisos/solicitudes sin resolver — así
--                               un UPDATE directo que se salte fn_fondo_cerrar
--                               (p. ej. cuando el saldo ya es 0 y el store
--                               llama cambiarEstadoFondo() sin pasar por la
--                               RPC) sigue protegido por la misma regla.
--
--  "Nunca eliminar el saldo histórico" (§35): fondo_movimientos sigue
--  append-only, cierre_remanente es un movimiento más, no un ajuste que
--  borre nada.
--
--  LÍMITE EXPLÍCITO — lo que el Prompt §36 pide y este bloque NO hace
--  cumplir, porque la infraestructura de la que depende no existe (mismo
--  criterio que el resto de D-36): "movimientos no conciliados" exigiría
--  conciliación bancaria enlazada por fondo (existe el backend de
--  conciliación, pero fondo_movimientos no tiene FK a extracto_linea salvo
--  la columna ya existente, sin flujo de conciliación real contra ella);
--  "soportes faltantes" exigiría volver documento_id obligatorio en todo
--  fondo_movimientos, lo que rompería el aporte automático por recaudo de
--  BLOQUE K (fn_fondo_credito_recaudo no adjunta documento). Ninguno de los
--  dos se simula con una validación superficial — quedan fuera, igual que
--  CxP/instrumentos/proyectos.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. fondo_remanentes — la decisión sobre el saldo final ─────────────
create table public.fondo_remanentes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  fondo_id         uuid not null references public.fondos (id) on delete cascade,
  monto            numeric(18, 2) not null check (monto > 0),
  destino          text not null check (destino in ('traslado', 'devolucion', 'aplicacion')),
  fondo_destino_id uuid references public.fondos (id),
  organo_id        bigint not null references public.lista_tipos (id),
  decision         text not null,
  documento_id     uuid references public.documentos (id),
  movimiento_id    uuid not null references public.fondo_movimientos (id),
  registrado_por   uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  check ((destino = 'traslado') = (fondo_destino_id is not null))
);

alter table public.fondo_remanentes enable row level security;
alter table public.fondo_remanentes force row level security;

create index fondo_remanentes_tenant_idx on public.fondo_remanentes (tenant_id);
create index fondo_remanentes_fondo_idx on public.fondo_remanentes (fondo_id);

comment on table public.fondo_remanentes is
  'Decisión sobre el remanente de un fondo al cerrarse (Modelo §35): quién decidió, hacia dónde va '
  'el saldo, qué movimiento lo materializó. Append-only — es un hecho jurídico ya ocurrido, mismo '
  'criterio que fondo_autorizaciones. Solo existe una fila por cierre: no se decide el remanente '
  'dos veces sobre el mismo fondo (fn_fondo_cerrar es la única vía que la escribe, y un fondo '
  'cerrado es terminal — guard_fondo_estado_transicion no permite volver a en_cierre).';
comment on column public.fondo_remanentes.destino is
  'traslado|devolucion|aplicacion — vocabulario cerrado porque gobierna la lógica: "traslado" exige '
  'fondo_destino_id y produce un traslado_entrada ahí; los otros dos no producen ningún segundo '
  'movimiento (Modelo §35 "no decidir automáticamente el destino" — este check solo valida forma, '
  'la decisión de cuál es siempre humana).';
comment on column public.fondo_remanentes.movimiento_id is
  'El fondo_movimientos (tipo=cierre_remanente) que esta decisión generó — enlaza el hecho jurídico '
  'con su efecto financiero. Validado por guard_fondo_remanente_referencias: debe pertenecer al '
  'mismo fondo y valer exactamente el mismo monto.';

create policy fondo_remanentes_select_miembro
  on public.fondo_remanentes for select
  to authenticated
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

create policy fondo_remanentes_insert_agent
  on public.fondo_remanentes for insert
  to authenticated
  with check (public.has_role(tenant_id, array['auxiliar']::public.tenant_role_t[]));

create function public.forbid_mutation_fondo_remanentes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'FONDO_REMANENTE_INMUTABLE: fondo_remanentes es append-only — % no está permitido', tg_op;
end;
$$;

create trigger fondo_remanentes_append_only
  before update or delete on public.fondo_remanentes
  for each row execute function public.forbid_mutation_fondo_remanentes();

-- ── 2. Coherencia de referencias ────────────────────────────────────────
create function public.guard_fondo_remanente_referencias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_destino public.fondos;
  v_movimiento public.fondo_movimientos;
begin
  select * into v_fondo from public.fondos where id = new.fondo_id;
  if v_fondo.id is null or v_fondo.tenant_id <> new.tenant_id then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe o no pertenece al tenant %', new.fondo_id, new.tenant_id;
  end if;

  select * into v_movimiento from public.fondo_movimientos where id = new.movimiento_id;
  if v_movimiento.id is null
     or v_movimiento.fondo_id <> new.fondo_id
     or v_movimiento.tipo <> 'cierre_remanente'
     or v_movimiento.monto <> new.monto then
    raise exception 'FONDO_REMANENTE_MOVIMIENTO_INVALIDO: % no es un movimiento cierre_remanente '
      'de % por %', new.movimiento_id, new.fondo_id, new.monto;
  end if;

  if new.destino = 'traslado' then
    select * into v_destino from public.fondos where id = new.fondo_destino_id;
    if v_destino.id is null or v_destino.tenant_id <> new.tenant_id then
      raise exception 'FONDO_DESTINO_INVALIDO: % no existe o no pertenece al tenant %',
        new.fondo_destino_id, new.tenant_id;
    end if;
    if v_destino.id = new.fondo_id then
      raise exception 'FONDO_DESTINO_INVALIDO: un fondo no puede trasladarse su remanente a sí mismo';
    end if;
  end if;

  if not exists (
    select 1 from public.lista_tipos lt
     where lt.id = new.organo_id
       and lt.tipo = 'ORGANO_DECISORIO'
       and (lt.tenant_id is null or lt.tenant_id = new.tenant_id)
  ) then
    raise exception 'ORGANO_DECISORIO_INVALIDO: % no es un ORGANO_DECISORIO visible para el tenant %',
      new.organo_id, new.tenant_id;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_remanente_referencias
  before insert on public.fondo_remanentes
  for each row execute function public.guard_fondo_remanente_referencias();

-- ── 3. No cerrar con remanente sin decidir ni compromisos pendientes ────
-- Trigger ADICIONAL a guard_fondo_estado_transicion (20260929100000), que
-- sigue siendo la única fuente de verdad del grafo de estados válido. Este
-- solo añade la precondición de negocio para la arista en_cierre → cerrado
-- (Modelo §36) — se mantiene separado para no tocar una función ya cubierta
-- por tests existentes.
create function public.guard_fondo_cierre_completo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pendientes_compromiso integer;
  v_pendientes_solicitud integer;
  v_saldo numeric(18, 2);
begin
  if not (old.estado = 'en_cierre' and new.estado = 'cerrado') then
    return new;
  end if;

  select count(*) into v_pendientes_compromiso
    from public.fondo_compromisos
   where fondo_id = old.id and estado in ('proyectado', 'comprometido', 'parcialmente_ejecutado');
  if v_pendientes_compromiso > 0 then
    raise exception 'FONDO_COMPROMISOS_PENDIENTES: el fondo % tiene % compromiso(s) sin resolver — '
      'no se puede cerrar (Modelo §36)', old.codigo, v_pendientes_compromiso;
  end if;

  select count(*) into v_pendientes_solicitud
    from public.fondo_solicitudes_uso
   where fondo_id = old.id and estado in ('borrador', 'en_revision', 'aprobada', 'comprometida');
  if v_pendientes_solicitud > 0 then
    raise exception 'FONDO_SOLICITUDES_PENDIENTES: el fondo % tiene % solicitud(es) de uso sin '
      'resolver — no se puede cerrar (Modelo §36)', old.codigo, v_pendientes_solicitud;
  end if;

  v_saldo := public.fn_fondo_saldo_derivado(old.id);
  if v_saldo <> 0 then
    raise exception 'FONDO_REMANENTE_SIN_DECISION: el fondo % tiene saldo % sin decidir — usa '
      'fn_fondo_cerrar para registrar el remanente antes de cerrar (Modelo §35/§36)',
      old.codigo, v_saldo;
  end if;

  return new;
end;
$$;

create trigger guard_fondo_cierre_completo
  before update of estado on public.fondos
  for each row execute function public.guard_fondo_cierre_completo();

comment on function public.guard_fondo_cierre_completo() is
  'Precondición de negocio para en_cierre → cerrado (Modelo §36): sin compromisos ni solicitudes '
  'de uso pendientes, y con el saldo derivado en 0 (remanente ya decidido vía fn_fondo_cerrar). No '
  'valida el grafo de estados — eso lo sigue haciendo guard_fondo_estado_transicion.';

-- ── 4. fn_fondo_cerrar — operación atómica (Prompt §53) ─────────────────
create function public.fn_fondo_cerrar(
  p_fondo_id uuid,
  p_destino text default null,
  p_organo_id bigint default null,
  p_decision text default null,
  p_fondo_destino_id uuid default null,
  p_documento_id uuid default null
)
returns public.fondos
language plpgsql
set search_path = ''
as $$
declare
  v_fondo public.fondos;
  v_saldo numeric(18, 2);
  v_movimiento_id uuid;
  v_actor uuid := (select auth.uid());
begin
  select * into v_fondo from public.fondos where id = p_fondo_id;
  if v_fondo.id is null then
    raise exception 'FONDO_NO_ENCONTRADO: % no existe', p_fondo_id;
  end if;
  if v_fondo.estado <> 'en_cierre' then
    raise exception 'FONDO_ESTADO_INVALIDO: el fondo % debe estar en_cierre para cerrarse, está %',
      v_fondo.codigo, v_fondo.estado;
  end if;

  -- Chequeo temprano — la misma regla la hace cumplir guard_fondo_cierre_completo
  -- sobre el UPDATE de más abajo; esto solo evita insertar el movimiento y la
  -- decisión del remanente para descubrir después, en el UPDATE, que igual
  -- había compromisos pendientes (ambos dentro de la misma transacción, así
  -- que un rollback no deja nada huérfano, pero el mensaje llega antes).
  if exists (
    select 1 from public.fondo_compromisos
     where fondo_id = p_fondo_id and estado in ('proyectado', 'comprometido', 'parcialmente_ejecutado')
  ) then
    raise exception 'FONDO_COMPROMISOS_PENDIENTES: el fondo % tiene compromisos sin resolver '
      '(Modelo §36)', v_fondo.codigo;
  end if;
  if exists (
    select 1 from public.fondo_solicitudes_uso
     where fondo_id = p_fondo_id and estado in ('borrador', 'en_revision', 'aprobada', 'comprometida')
  ) then
    raise exception 'FONDO_SOLICITUDES_PENDIENTES: el fondo % tiene solicitudes de uso sin '
      'resolver (Modelo §36)', v_fondo.codigo;
  end if;

  v_saldo := public.fn_fondo_saldo_derivado(p_fondo_id);

  if v_saldo > 0 then
    if p_destino is null or p_organo_id is null or p_decision is null or btrim(p_decision) = '' then
      raise exception 'FONDO_REMANENTE_SIN_DECISION: el fondo % tiene saldo % — decide destino, '
        'órgano y decisión antes de cerrar (Modelo §35/§36)', v_fondo.codigo, v_saldo;
    end if;
    if p_destino = 'traslado' and p_fondo_destino_id is null then
      raise exception 'FONDO_REMANENTE_SIN_DESTINO: el destino "traslado" exige un fondo destino';
    end if;
    if p_destino <> 'traslado' and p_fondo_destino_id is not null then
      raise exception 'FONDO_REMANENTE_DESTINO_INCONSISTENTE: solo "traslado" admite fondo destino';
    end if;

    insert into public.fondo_movimientos (tenant_id, fondo_id, tipo, monto, registrado_por)
    values (v_fondo.tenant_id, p_fondo_id, 'cierre_remanente', v_saldo, v_actor)
    returning id into v_movimiento_id;

    insert into public.fondo_remanentes (
      tenant_id, fondo_id, monto, destino, fondo_destino_id, organo_id, decision,
      documento_id, movimiento_id, registrado_por
    ) values (
      v_fondo.tenant_id, p_fondo_id, v_saldo, p_destino, p_fondo_destino_id, p_organo_id, p_decision,
      p_documento_id, v_movimiento_id, v_actor
    );

    if p_destino = 'traslado' then
      insert into public.fondo_movimientos (tenant_id, fondo_id, tipo, monto, registrado_por)
      values (v_fondo.tenant_id, p_fondo_destino_id, 'traslado_entrada', v_saldo, v_actor);
    end if;
  elsif v_saldo < 0 then
    -- No debería ser alcanzable (guard_fondo_saldo_derivado + R9 lo impiden en la
    -- escritura normal), pero si algo lo dejara en negativo, cerrar sin decidirlo
    -- ocultaría el problema en vez de exponerlo.
    raise exception 'FONDO_SALDO_NEGATIVO: el fondo % tiene saldo %, no se puede cerrar',
      v_fondo.codigo, v_saldo;
  end if;

  update public.fondos
     set estado = 'cerrado'
   where id = p_fondo_id and estado = 'en_cierre'
  returning * into v_fondo;

  if not found then
    raise exception 'FONDO_ESTADO_INVALIDO: % ya no está en_cierre — cierre concurrente', p_fondo_id;
  end if;

  return v_fondo;
end;
$$;

comment on function public.fn_fondo_cerrar(uuid, text, bigint, text, uuid, uuid) is
  'Cierra un fondo en_cierre (Modelo §35/§36) — operación atómica (Prompt §53): valida compromisos '
  '/solicitudes pendientes, y si el saldo derivado es > 0 exige destino/órgano/decisión, registra '
  'el movimiento cierre_remanente (+ traslado_entrada en el destino si aplica) y la decisión en '
  'fondo_remanentes, y solo entonces pasa el fondo a cerrado. Si el saldo ya es 0 no exige nada de '
  'eso. SECURITY INVOKER: las mismas políticas RLS que protegen un insert directo protegen esto.';

grant execute on function public.fn_fondo_cerrar(uuid, text, bigint, text, uuid, uuid) to authenticated;
