-- ═══════════════════════════════════════════════════════════════════════
--  MANT-2 · create_tenant() aprende a instanciar los requisitos de
--  cumplimiento — mismo hueco que corrigió PC-3c (20260903120000) para las
--  cuentas contables: si no se engancha en el alta, toda copropiedad nueva
--  nace sin requisitos y no hay forma de llegar a ellos salvo backfill manual.
--
--  Se reproduce el cuerpo íntegro de create_tenant() tal como quedó en
--  20260903120000 (disciplina de "nunca editar una migración aplicada":
--  esto es una nueva migración con `create or replace`, no un parche sobre
--  la anterior) y se agrega una sola línea.
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
  perform public.fn_instanciar_cuentas_default(v_tenant.id);
  perform public.fn_instanciar_puentes_presupuesto(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);
  -- MANT-2: requisitos de cumplimiento normativo, con la misma semántica que las líneas de
  -- arriba — sembrado propio del tenant desde el instante del alta, nunca un catálogo externo
  -- que el tenant consulte en caliente.
  perform public.fn_instanciar_requisitos_cumplimiento(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;

-- Backfill: tenants creados antes de este corte (incluidos los de prueba insertados
-- directamente en `tenants`, que nunca pasaron por create_tenant()). Idempotente por
-- construcción de fn_instanciar_requisitos_cumplimiento.
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select id from public.tenants
  loop
    perform public.fn_instanciar_requisitos_cumplimiento(v_tenant);
  end loop;
end $$;
