-- ═══════════════════════════════════════════════════════════════════════
--  E1 · Consola de plataforma — SOLO metadatos
--  Propietario: PROMPT_MAESTRO_FASE1.md §5.3, AD-09, SEC-10
-- ═══════════════════════════════════════════════════════════════════════
--
--  ⚠ ELUSIÓN DELIBERADA DE RLS — leer antes de tocar.
--
--  security_invoker = FALSE (la vista corre con privilegios del owner).
--  Es intencional: con security_invoker = true aplicaría la RLS de
--  `tenants`, el admin de plataforma no tiene membresía, y la vista
--  devolvería cero filas — inútil para su propósito.
--
--  La ÚNICA barrera es el `where public.is_platform_admin()` de abajo.
--  Por eso la vista expone exclusivamente metadatos (nombre, estado,
--  recuentos) y ninguna columna de datos operativos de la copropiedad.
--
--  Quien modifique esta vista debe preservar ambas cosas:
--    1. el filtro is_platform_admin()
--    2. la ausencia de columnas de datos de tenant
--  Verificado por T-SEC-10.
-- ═══════════════════════════════════════════════════════════════════════

create view public.platform_tenant_overview
with (security_invoker = false)
as
select
  t.id,
  t.name,
  t.slug,
  t.status,
  t.created_at,
  (
    select count(*)
    from public.memberships m
    where m.tenant_id = t.id and m.status = 'active'
  ) as member_count,
  (
    select max(a.created_at)
    from public.audit_log a
    where a.tenant_id = t.id
  ) as last_activity_at
from public.tenants t
where public.is_platform_admin();

comment on view public.platform_tenant_overview is
  'SEC-10: única superficie del admin de plataforma. Elude RLS por diseño; '
  'la barrera es el filtro is_platform_admin(). No expone ninguna columna de '
  'datos operativos de la copropiedad.';

revoke all on public.platform_tenant_overview from public, anon;
grant select on public.platform_tenant_overview to authenticated;
