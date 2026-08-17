-- ═══════════════════════════════════════════════════════════════════════
--  CAR F6 · Escalamiento — máquina de estados de la etapa de cobranza
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §11
--
--  cartera_etapas guarda la etapa GOBERNADA de cada inmueble (una fila
--  "actual" por inmueble, no un log de eventos) — distinta de
--  posiciones_cartera_snapshot.etapa_cobranza, que es la etapa SUGERIDA
--  por la clasificación en un instante dado (recalculable, CAR §6.3).
--  cartera_etapas es la que de verdad rige: solo avanza a través de esta
--  máquina de estados, puede congelarse por un acuerdo vigente (§12.5) y
--  algunas transiciones exigen aprobación humana (REQ-CAR-011).
--
--  Mismo maker-checker que acciones_cobranza (20260822280000) y
--  acuerdos_pago (20260822310000): sin Edge Function (no hay efecto
--  colateral externo), propuesto_por/aprobado_por estampados desde
--  auth.uid(), rol administrador explícito + bloqueo de autoaprobación
--  para las transiciones que lo exigen. A diferencia de esas dos tablas
--  (un INSERT nuevo por cada acción/acuerdo), aquí hay UNA fila por
--  inmueble que se actualiza en el tiempo — el "propuesto/aprobado" vive
--  en columnas etapa_propuesta/propuesto_*/aprobado_* que se limpian
--  después de cada transición resuelta, no en filas nuevas.
--
--  Matriz de transiciones (CAR §11.3) espejada en PL/pgSQL — MISMA matriz
--  que TRANSICIONES_ETAPA_COBRANZA en
--  packages/liquidation-engine/src/cartera-escalamiento.ts. Cualquier
--  cambio a una debe replicarse en la otra.
--
--  Deuda con F7 (GAP-CAR-007, casos_juridicos): juridica→judicial se
--  permite aquí sin exigir "demanda radicada" (no hay casos_juridicos
--  todavía) — el disparador real queda pendiente para cuando exista esa
--  tabla. juridica/judicial→preventiva "requiere cierre del caso" (CAR
--  §11.3) tampoco se valida en base de datos todavía por el mismo motivo
--  — solo se exige rol administrador + no autoaprobación, como el resto
--  de transiciones con aprobación.
-- ═══════════════════════════════════════════════════════════════════════

create table public.cartera_etapas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  inmueble_id       uuid not null references public.inmuebles (id),
  etapa             public.etapa_cobranza_t not null default 'preventiva',
  etapa_anterior    public.etapa_cobranza_t,

  -- Propuesta pendiente — REQ-CAR-011: transiciones de alto impacto exigen
  -- aprobación humana. etapa NO cambia hasta que la propuesta se confirma.
  etapa_propuesta   public.etapa_cobranza_t,
  motivo_propuesta  text,
  propuesto_por     uuid references public.profiles (id),
  propuesto_at      timestamptz,

  aprobado_por      uuid references public.profiles (id),
  aprobado_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz,

  unique (tenant_id, inmueble_id)
);

alter table public.cartera_etapas enable row level security;
alter table public.cartera_etapas force row level security;

create index cartera_etapas_tenant_idx on public.cartera_etapas (tenant_id);

comment on table public.cartera_etapas is
  'Etapa GOBERNADA de cobranza de un inmueble (CAR §11) — una fila actual por inmueble, no un '
  'log. Distinta de posiciones_cartera_snapshot.etapa_cobranza (la sugerida por clasificación '
  'en un instante, recalculable). Solo cambia a través de guard_cartera_etapa_transicion(), que '
  'exige aprobación humana para las transiciones de alto impacto (REQ-CAR-011) y bloquea '
  'cualquier cambio mientras el inmueble tiene un acuerdo de pago vigente (CAR §12.5).';

comment on column public.cartera_etapas.etapa_propuesta is
  'Transición pendiente de aprobación (evaluarEscalamiento() con requiereAprobacion=true, '
  'PH-C19/PH-C20). etapa no cambia hasta que un administrador distinto de propuesto_por la '
  'confirma escribiendo el mismo valor en etapa.';

create trigger set_updated_at
  before update on public.cartera_etapas
  for each row execute function public.set_updated_at();

-- ── RLS: mismo patrón que acciones_cobranza/acuerdos_pago ───────────────
create policy cartera_etapas_select_miembro
  on public.cartera_etapas for select
  to authenticated
  using (public.is_member(tenant_id));

create policy cartera_etapas_insert_agent
  on public.cartera_etapas for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy cartera_etapas_update_agent
  on public.cartera_etapas for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

-- ── matriz de transiciones (CAR §11.3) — funciones puras reutilizables ──
create function public.cartera_etapa_transicion_valida(p_desde public.etapa_cobranza_t, p_hacia public.etapa_cobranza_t)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_desde, p_hacia) in (
    ('preventiva', 'administrativa'),
    ('administrativa', 'preventiva'),
    ('administrativa', 'prejuridica'),
    ('prejuridica', 'administrativa'),
    ('prejuridica', 'preventiva'),
    ('prejuridica', 'juridica'),
    ('juridica', 'judicial'),
    ('juridica', 'prejuridica'),
    ('juridica', 'preventiva'),
    ('judicial', 'preventiva')
  )
$$;

create function public.cartera_etapa_requiere_aprobacion(p_desde public.etapa_cobranza_t, p_hacia public.etapa_cobranza_t)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_desde, p_hacia) in (
    ('administrativa', 'prejuridica'),
    ('prejuridica', 'juridica'),
    ('juridica', 'prejuridica'),
    ('juridica', 'preventiva'),
    ('judicial', 'preventiva')
  )
$$;

comment on function public.cartera_etapa_transicion_valida is
  'CAR §11.3 — matriz de transiciones permitidas. Espejo exacto de TRANSICIONES_ETAPA_COBRANZA '
  'en packages/liquidation-engine/src/cartera-escalamiento.ts.';
comment on function public.cartera_etapa_requiere_aprobacion is
  'CAR §11.3 — subconjunto de cartera_etapa_transicion_valida() que exige rol administrador '
  'explícito y bloquea autoaprobación (REQ-CAR-011, REC-CAR-013).';

-- ── INSERT: solo puede nacer en preventiva ──────────────────────────────
-- Mismo motivo que guard_accion_cobranza_propuesta (20260822280000): sin
-- este chequeo, un INSERT directo podría nacer ya en 'judicial' y saltarse
-- por completo la máquina de estados y sus aprobaciones — el guard de
-- transición de abajo solo vigila UPDATE, nunca ve el INSERT.
create function public.guard_cartera_etapa_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.etapa <> 'preventiva' then
    raise exception 'CARTERA_ETAPA_INICIAL_INVALIDA: la etapa de un inmueble solo puede crearse '
      'en preventiva, no % (CAR §11.1 — toda etapa avanzada se alcanza escalando, no se siembra)',
      new.etapa;
  end if;
  if new.etapa_propuesta is not null then
    raise exception 'CARTERA_ETAPA_INICIAL_INVALIDA: no puede nacer con una propuesta pendiente';
  end if;
  return new;
end;
$$;

create trigger guard_cartera_etapa_inicial
  before insert on public.cartera_etapas
  for each row execute function public.guard_cartera_etapa_inicial();

-- ── UPDATE: proponer, retirar propuesta, o confirmar la transición ──────
create function public.guard_cartera_etapa_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_congelada boolean;
begin
  if new.tenant_id is distinct from old.tenant_id or new.inmueble_id is distinct from old.inmueble_id then
    raise exception 'CARTERA_ETAPA_CONTEXTO_INMUTABLE: tenant_id/inmueble_id no se pueden '
      'modificar (fila %)', old.id;
  end if;

  if new.etapa = old.etapa and new.etapa_propuesta is not distinct from old.etapa_propuesta then
    -- No-op real (p.ej. solo cambia motivo_propuesta) — ninguna columna
    -- estampada por el servidor se confía del cliente en ningún camino.
    new.etapa_anterior := old.etapa_anterior;
    new.propuesto_por := old.propuesto_por;
    new.propuesto_at := old.propuesto_at;
    new.aprobado_por := old.aprobado_por;
    new.aprobado_at := old.aprobado_at;
    return new;
  end if;

  select exists(
    select 1 from public.acuerdos_pago
    where inmueble_id = new.inmueble_id and estado = 'vigente'
  ) into v_congelada;
  if v_congelada then
    raise exception 'CARTERA_ETAPA_CONGELADA: hay un acuerdo de pago vigente para este inmueble '
      '(CAR §12.5) — ningún cambio de etapa es posible mientras esté vigente';
  end if;

  -- Caso 1: la etapa real no cambia — se está registrando o retirando una PROPUESTA.
  if new.etapa = old.etapa then
    new.etapa_anterior := old.etapa_anterior;
    new.aprobado_por := old.aprobado_por;
    new.aprobado_at := old.aprobado_at;

    if new.etapa_propuesta is not null then
      if not public.cartera_etapa_transicion_valida(old.etapa, new.etapa_propuesta) then
        raise exception 'CARTERA_ETAPA_TRANSICION_INVALIDA: % no puede pasar a % (CAR §11.3)',
          old.etapa, new.etapa_propuesta;
      end if;
      if not public.has_role(new.tenant_id, array['agent']::public.tenant_role_t[]) then
        raise exception 'FORBIDDEN: se requiere rol agent para proponer una transición de etapa';
      end if;
      new.propuesto_por := v_actor;
      new.propuesto_at := now();
    else
      -- se limpia la propuesta (retiro/rechazo) — no exige administrador, cualquier agent puede retirarla.
      new.propuesto_por := null;
      new.propuesto_at := null;
      new.motivo_propuesta := null;
    end if;
    return new;
  end if;

  -- Caso 2: la etapa real SÍ cambia — se está confirmando la transición.
  if not public.cartera_etapa_transicion_valida(old.etapa, new.etapa) then
    raise exception 'CARTERA_ETAPA_TRANSICION_INVALIDA: % no puede pasar a % (CAR §11.3)',
      old.etapa, new.etapa;
  end if;

  if public.cartera_etapa_requiere_aprobacion(old.etapa, new.etapa) then
    if old.etapa_propuesta is distinct from new.etapa then
      raise exception 'CARTERA_ETAPA_SIN_PROPUESTA: esta transición exige proponerla primero '
        '(etapa_propuesta) antes de confirmarla (REQ-CAR-011)';
    end if;
    if not public.has_role(new.tenant_id, array['administrador']::public.tenant_role_t[]) then
      raise exception 'CARTERA_ETAPA_REQUIERE_ADMINISTRADOR: confirmar % → % requiere rol '
        'administrador (CAR §11.3/REQ-CAR-011)', old.etapa, new.etapa;
    end if;
    if old.propuesto_por is not null and old.propuesto_por = v_actor then
      raise exception 'CARTERA_ETAPA_AUTOAPROBACION: no puedes confirmar una transición de etapa '
        'que tú mismo propusiste (CAR §11, mismo criterio que acciones_cobranza/acuerdos_pago)';
    end if;
    new.aprobado_por := v_actor;
    new.aprobado_at := now();
  else
    if not public.has_role(new.tenant_id, array['agent']::public.tenant_role_t[]) then
      raise exception 'FORBIDDEN: se requiere rol agent para confirmar una transición automática de etapa';
    end if;
    new.aprobado_por := null;
    new.aprobado_at := null;
  end if;

  new.etapa_anterior := old.etapa;
  new.etapa_propuesta := null;
  new.propuesto_por := null;
  new.propuesto_at := null;
  new.motivo_propuesta := null;

  return new;
end;
$$;

create trigger guard_cartera_etapa_transicion
  before update on public.cartera_etapas
  for each row execute function public.guard_cartera_etapa_transicion();
