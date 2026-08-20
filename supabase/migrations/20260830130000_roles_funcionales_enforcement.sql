-- ═══════════════════════════════════════════════════════════════════════
--  Enforcement de roles funcionales — piso 2 del plan de 3 piezas
--  (20260830120000 creó el catálogo/asignación; esto lo hace valer algo).
--
--  Corrección de diseño respecto a tiene_rol_funcional(): esa función es
--  ADITIVA (¿tiene X? sí/no) — no sirve sola para RESTRINGIR, que es lo
--  que en realidad se pidió: "aunque le des a abogado/contador el rol
--  auxiliar, hoy verían y podrían tocar TODO lo que un auxiliar ve".
--  puede_ver_modulo() invierte la lógica: si una membresía NO tiene
--  ningún rol funcional asignado, el comportamiento no cambia (compat
--  total con lo que existe hoy — nadie pierde acceso por default). Si SÍ
--  tiene al menos uno, queda acotada a los módulos que esos roles
--  funcionales cubren. administrador siempre ve todo, sin excepción,
--  incluso si por error le asignaran un rol funcional — es el rol máximo
--  del tenant (20260830100000).
--
--  Alcance de esta migración (deliberadamente acotado, no todas las
--  tablas): las 4 tablas de Jurídico (20260822340000) y las 7 de
--  Financiero/Presupuesto (20260814100200/20260823200000/20260823270000)
--  — los dos casos concretos que motivaron esta conversación (abogado vs.
--  contador/revisor fiscal). Tablas de dominio transversal (inmuebles,
--  terceros, conceptos, periodos, coeficientes) NO se tocan — las
--  necesita casi cualquier módulo para funcionar, acotarlas por rol
--  funcional es un paso futuro, no parte de este.
--
--  alter policy (no drop+create): conserva el nombre/identidad de cada
--  policy, solo redefine el using — menor diff, mismo criterio que
--  create or replace function.
-- ═══════════════════════════════════════════════════════════════════════

create function public.puede_ver_modulo(p_tenant uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_role(p_tenant, array['administrador']::public.tenant_role_t[])
    or not exists (
      select 1
      from public.membership_roles_funcionales mrf
      join public.memberships m on m.id = mrf.membership_id
      where m.user_id = (select auth.uid())
        and m.tenant_id = p_tenant
        and m.status = 'active'
    )
    or public.tiene_rol_funcional(p_tenant, p_modulo)
$$;

comment on function public.puede_ver_modulo is
  'Gate restrictivo para policies de select de un módulo sensible. true si: es '
  'administrador, o la membresía no tiene NINGÚN rol funcional asignado (compat: '
  'comportamiento sin cambios), o alguno de sus roles funcionales cubre p_modulo. '
  'Asignar el primer rol funcional a alguien es lo que empieza a restringirlo.';

-- ── Jurídico (módulo 'juridico') ────────────────────────────────────────
alter policy certificaciones_deuda_select_miembro on public.certificaciones_deuda
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'juridico'));

alter policy casos_juridicos_select_miembro on public.casos_juridicos
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'juridico'));

alter policy caso_juridico_actuaciones_select_miembro on public.caso_juridico_actuaciones
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'juridico'));

alter policy costas_judiciales_select_miembro on public.costas_judiciales
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'juridico'));

-- ── Financiero / Presupuesto (módulo 'financiero') ──────────────────────
alter policy politicas_financieras_select_miembro on public.politicas_financieras
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

alter policy presupuestos_select_miembro on public.presupuestos
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

alter policy presupuesto_rubros_select_miembro on public.presupuesto_rubros
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

alter policy fondos_select_miembro on public.fondos
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

alter policy fondo_movimientos_select_agent_auditor on public.fondo_movimientos
  using (
    public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'financiero')
  );

alter policy presupuesto_cuenta_select_miembro on public.presupuesto_cuenta
  using (public.is_member(tenant_id) and public.puede_ver_modulo(tenant_id, 'financiero'));

alter policy presupuesto_ejecucion_select_agent_auditor on public.presupuesto_ejecucion
  using (
    public.has_role(tenant_id, array['auxiliar', 'auditor']::public.tenant_role_t[])
    and public.puede_ver_modulo(tenant_id, 'financiero')
  );
