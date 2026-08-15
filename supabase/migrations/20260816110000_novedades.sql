-- ═══════════════════════════════════════════════════════════════════════
--  Novedades — solicitud/evento de negocio con aprobación (Docs/16 §26-30,
--  Docs/19 sección Novelty/Adjustment). AD-29/AD-30.
--
--  Novelty ≠ Adjustment (Docs/19 §254): la novedad es la solicitud; el
--  cargo categoria='otro' que genera fn_aprobar_novedad es el efecto
--  financiero. La aprobación NUNCA la hace el motor de cálculo
--  (Docs/19 §284 NO APPROVAL BY RUNTIME) — liquidar-periodo nunca lee
--  novedades, solo fn_aprobar_novedad materializa el cargo.
-- ═══════════════════════════════════════════════════════════════════════

-- AD-29: enum nativo — el motor lee este valor para lógica de control,
-- mismo criterio que 20260814160000_tipos_lista_tipos.sql (cabecera §0).
create type public.novedad_tipo_t as enum ('CHARGE', 'DISCOUNT', 'ADJUSTMENT', 'REFUND', 'CREDIT', 'DEBIT');
create type public.novedad_estado_t as enum ('pendiente', 'aprobada', 'rechazada');

create table public.novedades (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  inmueble_id     uuid not null references public.inmuebles (id),
  concepto_id     uuid references public.conceptos (id),
  tipo            public.novedad_tipo_t not null,
  -- AD-30: firmado — CHARGE/DEBIT positivo, DISCOUNT/CREDIT/REFUND negativo,
  -- ADJUSTMENT cualquier signo no-cero. La regla de signo por tipo se valida
  -- en la Edge Function crear-novedad; aquí solo se garantiza no-cero.
  monto           numeric(18, 2) not null check (monto <> 0),
  descripcion     text not null,
  fecha_efectiva  date not null,
  estado          public.novedad_estado_t not null default 'pendiente',
  created_by      uuid not null references public.profiles (id),
  created_at      timestamptz not null default now(),
  approved_by     uuid references public.profiles (id),
  approved_at     timestamptz,
  rejected_reason text
);

alter table public.novedades enable row level security;
alter table public.novedades force row level security;

create index novedades_tenant_idx on public.novedades (tenant_id);
create index novedades_inmueble_idx on public.novedades (inmueble_id);

comment on table public.novedades is
  'Solicitud/evento de negocio con aprobación (Docs/16 §26-30, Docs/19 Novelty). '
  'fn_aprobar_novedad materializa el efecto financiero como cargos.categoria=otro (AD-33).';

-- Guard de transición — mismo patrón exacto que guard_periodo_transicion
-- (20260814100300_domain_triggers.sql).
create function public.guard_novedad_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado = old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'pendiente' and new.estado = 'aprobada')
    or (old.estado = 'pendiente' and new.estado = 'rechazada')
  ) then
    raise exception 'INVALID_TRANSITION: novedad % no puede pasar de % a % (Docs/19 estados)',
      old.id, old.estado, new.estado;
  end if;

  return new;
end;
$$;

create trigger guard_novedad_transicion
  before update on public.novedades
  for each row execute function public.guard_novedad_transicion();

-- ── RLS: lectura por rol; creación por agent; SIN política de UPDATE ────
-- La transición pendiente→aprobada tiene un efecto colateral que debe ser
-- atómico con el cambio de estado (crear el cargo, AD-33) — igual que
-- liquidaciones, se deja sin política de UPDATE para `authenticated` y se
-- fuerza a pasar por fn_aprobar_novedad/fn_rechazar_novedad vía
-- service_role (Edge Functions aprobar-novedad/rechazar-novedad).
create policy novedades_select_agent_auditor
  on public.novedades for select
  to authenticated
  using (public.has_role(tenant_id, array['agent', 'auditor']::public.tenant_role_t[]));

create policy novedades_insert_agent
  on public.novedades for insert
  to authenticated
  with check (
    public.has_role(tenant_id, array['agent']::public.tenant_role_t[])
    and estado = 'pendiente'
  );

-- ── Cierra la FK diferida de cargos.novedad_id (20260816100000, E1: la
--    tabla novedades no existía todavía — mismo patrón que
--    fondo_movimientos.liquidacion_id en 20260814110000). ─────────────────
alter table public.cargos
  add constraint cargos_novedad_id_fkey
  foreign key (novedad_id) references public.novedades (id);
