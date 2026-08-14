-- ═══════════════════════════════════════════════════════════════════════
--  E1 · Extensiones y tipos enumerados
--  Propietario: PROMPT_MAESTRO_FASE1.md §5.2
--  Depende de: nada
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists citext with schema extensions;

-- ── Roles de tenant ────────────────────────────────────────────────────
-- `admin` NO aparece aquí: es rol de plataforma, no de tenant (AD-09).
-- `guest` eliminado por AD-26: los copropietarios son datos, no usuarios.
create type public.tenant_role_t as enum ('agent', 'auditor');

create type public.user_status_t as enum ('active', 'suspended');

create type public.tenant_status_t as enum ('active', 'suspended', 'deleted');

create type public.member_status_t as enum ('active', 'revoked');

create type public.invite_status_t as enum ('pending', 'accepted', 'revoked', 'expired');

comment on type public.tenant_role_t is
  'Roles dentro de una copropiedad. agent = administrador (rol máximo del tenant), '
  'auditor = solo lectura incluida auditoría. El rol admin de plataforma vive en '
  'profiles.is_platform_admin (AD-09).';
