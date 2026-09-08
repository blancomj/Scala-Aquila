-- ═══════════════════════════════════════════════════════════════════════
--  Fix — create_tenant() perdió tenant_predeterminado_id (regresión real,
--  no relacionada con GOB-6). Encontrada al montar Supabase LOCAL por
--  primera vez (D-08) y correr `pnpm test` completo contra una base
--  migrada desde cero: tests/tenancy/tenant-predeterminado.test.ts falla
--  tanto en local como en el proyecto remoto — verificado con
--  pg_get_functiondef contra ambos antes de escribir este fix, no asumido.
--
--  Origen: `20260904220000_tenant_predeterminado.sql` agregó
--  `tenant_predeterminado_id = coalesce(tenant_predeterminado_id, v_tenant.id)`
--  al UPDATE final de create_tenant(). `20260930770000_mant2_fix_create_
--  tenant_fondo_imprevistos.sql` reprodujo el cuerpo completo de la función
--  para restaurar una llamada perdida (fn_instanciar_fondo_imprevistos)
--  pero partió de una copia ANTERIOR a 20260904220000, perdiendo esa línea
--  en el proceso — la misma lección que ese propio informe ya dejó
--  documentada ("listar TODAS las migraciones que redefinen una función
--  antes de reproducir su cuerpo") se le escapó a sí mismo una vez más.
--
--  accept_invitation() SÍ conserva la lógica (verificado) — el hueco era
--  solo en create_tenant().
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);
  -- GAP-22: el fondo de imprevistos necesita el plan de cuentas para vincular 111015.
  perform public.fn_instanciar_fondo_imprevistos(v_tenant.id);
  perform public.fn_instanciar_cuentas_default(v_tenant.id);
  perform public.fn_instanciar_puentes_presupuesto(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);
  -- MANT-2: requisitos de cumplimiento normativo, sembrado propio del tenant desde el alta.
  perform public.fn_instanciar_requisitos_cumplimiento(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id,
      -- Restaurado (20260904220000): la primera copropiedad de un usuario es su
      -- predeterminada, pero coalesce nunca pisa una ya elegida.
      tenant_predeterminado_id = coalesce(tenant_predeterminado_id, v_tenant.id)
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;
