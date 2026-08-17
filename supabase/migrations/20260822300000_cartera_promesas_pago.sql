-- ═══════════════════════════════════════════════════════════════════════
--  CAR F5 (1/2) · Promesas de pago
--  Propietario: Docs/Motor de gestion de cartera/CAR_00_Guia_Oficial.md §12
--
--  Promesa ≠ acuerdo (CAR §12.1): manifestación informal, sin efecto en
--  escalamiento, sin aprobación formal. Por eso NO lleva maker-checker —
--  cualquier agent la registra y la reevalúa, mismo criterio que registrar
--  una novedad simple.
--
--  registrada_por se estampa desde auth.uid() (guard_promesa_registrada),
--  nunca confiado del cliente — mismo criterio que propuesta_por en
--  acciones_cobranza (20260822280000).
-- ═══════════════════════════════════════════════════════════════════════

create type public.estado_promesa_t as enum (
  'pendiente', 'cumplida', 'incumplida', 'cancelada'
);

create table public.promesas_pago (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  inmueble_id          uuid not null references public.inmuebles (id),
  accion_cobranza_id   uuid references public.acciones_cobranza (id),
  fecha_promesa        date not null,
  monto_prometido      numeric(18, 2) not null check (monto_prometido > 0),
  fecha_pago_prometida date not null,
  estado               public.estado_promesa_t not null default 'pendiente',
  cumplida_at          timestamptz,
  pago_id              uuid references public.pagos (id),
  monto_cumplido       numeric(18, 2),
  registrada_por       uuid references public.profiles (id),
  notas                text,
  created_at           timestamptz not null default now(),

  constraint promesa_fecha_futura check (fecha_pago_prometida >= fecha_promesa),
  constraint promesa_monto_cumplido_no_negativo check (monto_cumplido is null or monto_cumplido >= 0)
);

alter table public.promesas_pago enable row level security;
alter table public.promesas_pago force row level security;

create index promesas_pago_tenant_idx on public.promesas_pago (tenant_id);
create index promesas_pago_inmueble_idx on public.promesas_pago (tenant_id, inmueble_id);
create index promesas_pago_pendientes_idx
  on public.promesas_pago (tenant_id, fecha_pago_prometida)
  where estado = 'pendiente';

comment on table public.promesas_pago is
  'Manifestación informal de intención de pago (CAR §12.1-12.2) — no formal, sin efecto en '
  'escalamiento (a diferencia de acuerdos_pago). Regla de cumplimiento (PH-C14/PH-C15) y de '
  'incumplimiento por el job diario: ver CAR §12.2.';

-- ── quién registró (solo en creación) ───────────────────────────────────
create function public.guard_promesa_registrada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.registrada_por := (select auth.uid());
  return new;
end;
$$;

create trigger guard_promesa_registrada
  before insert on public.promesas_pago
  for each row execute function public.guard_promesa_registrada();

-- ── transiciones de estado ───────────────────────────────────────────────
create function public.guard_promesa_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (old.estado = 'pendiente' and new.estado in ('cumplida', 'incumplida', 'cancelada')) then
    raise exception 'PROMESA_TRANSICION_INVALIDA: la promesa % no puede pasar de % a %',
      old.id, old.estado, new.estado;
  end if;

  if new.estado = 'cumplida' then
    new.cumplida_at := now();
  end if;

  return new;
end;
$$;

create trigger guard_promesa_transicion
  before update on public.promesas_pago
  for each row execute function public.guard_promesa_transicion();

-- ── RLS ──────────────────────────────────────────────────────────────────
create policy promesas_pago_select_miembro
  on public.promesas_pago for select
  to authenticated
  using (public.is_member(tenant_id));

create policy promesas_pago_insert_agent
  on public.promesas_pago for insert
  to authenticated
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));

create policy promesas_pago_update_agent
  on public.promesas_pago for update
  to authenticated
  using (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]))
  with check (public.has_role(tenant_id, array['agent']::public.tenant_role_t[]));
