-- ═══════════════════════════════════════════════════════════════════════
--  E1 · Tablas núcleo de identidad
--  Propietario: PROMPT_MAESTRO_FASE1.md §5.3
--
--  AD-08 / SEC-01: toda tabla nace con RLS ENABLE + FORCE en la MISMA
--  migración que la crea. Sin políticas todavía: deny-by-default.
-- ═══════════════════════════════════════════════════════════════════════

-- ── tenants (= copropiedad, AD-24) ─────────────────────────────────────
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        extensions.citext not null unique,
  status      public.tenant_status_t not null default 'active',
  settings    jsonb not null default '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,

  constraint tenants_slug_formato
    check (slug ~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$'),
  constraint tenants_name_no_vacio
    check (length(btrim(name)) > 0)
);

alter table public.tenants enable row level security;
alter table public.tenants force row level security;

comment on table public.tenants is
  'Una copropiedad. Es la frontera de aislamiento RLS, la unidad de liquidación '
  'y la unidad de facturación del SaaS (AD-24, AD-25, AD-27).';

-- ── profiles (1:1 con auth.users) ──────────────────────────────────────
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              extensions.citext not null,
  full_name          text,
  avatar_url         text,
  phone              text,
  active_tenant_id   uuid references public.tenants (id) on delete set null,
  is_platform_admin  boolean not null default false,
  status             public.user_status_t not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

comment on column public.profiles.active_tenant_id is
  'AD-02: la copropiedad activa se resuelve en BD, no vía claim de JWT. '
  'Solo puede apuntar a un tenant con membresía activa (trigger guard_active_tenant).';

comment on column public.profiles.is_platform_admin is
  'AD-09: plano de autorización de plataforma, separado del rol de tenant. '
  'Solo modificable fuera de banda (trigger guard_privileged_columns, SEC-06).';

alter table public.tenants
  add constraint tenants_created_by_fkey
  foreign key (created_by) references public.profiles (id);

-- ── memberships ────────────────────────────────────────────────────────
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  role        public.tenant_role_t not null,
  status      public.member_status_t not null default 'active',
  invited_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,

  constraint memberships_user_tenant_unico unique (user_id, tenant_id)
);

alter table public.memberships enable row level security;
alter table public.memberships force row level security;

create index memberships_tenant_status_idx on public.memberships (tenant_id, status);
create index memberships_user_status_idx   on public.memberships (user_id, status);

-- ── invitations ────────────────────────────────────────────────────────
create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  email        extensions.citext not null,
  role         public.tenant_role_t not null,
  token_hash   text not null unique,
  status       public.invite_status_t not null default 'pending',
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id),
  invited_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,

  -- AD-04: se almacena sha256(token) en hex. El token en claro solo va al email.
  constraint invitations_token_hash_formato check (token_hash ~ '^[a-f0-9]{64}$')
);

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

-- Una sola invitación pendiente por (copropiedad, email)
create unique index invitations_pendiente_unica
  on public.invitations (tenant_id, email)
  where status = 'pending';

create index invitations_tenant_status_idx on public.invitations (tenant_id, status);

-- ── audit_log (append-only) ────────────────────────────────────────────
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references public.tenants (id) on delete set null,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  metadata     jsonb not null default '{}'::jsonb,
  ip           inet,
  user_agent   text,
  created_at   timestamptz not null default now()
);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create index audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);

comment on table public.audit_log is
  'Append-only. SEC-14: sin UPDATE ni DELETE para ningún rol. '
  'Retención 24 meses (PLAN §11.3).';
