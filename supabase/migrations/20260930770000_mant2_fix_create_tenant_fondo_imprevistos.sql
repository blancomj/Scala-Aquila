-- ═══════════════════════════════════════════════════════════════════════
--  MANT-2 · Fix: 20260930750000 reprodujo create_tenant() a partir de una
--  versión desactualizada (20260903120000) y perdió la llamada a
--  fn_instanciar_fondo_imprevistos() que GAP-22 (20260929170000) había
--  agregado después. Encontrado por la prueba GAP-22 existente
--  (tests/contabilidad/alta-parametrizacion-contable.test.ts), que sí
--  detectó el hueco — ninguna prueba nueva de MANT-2 podía verlo porque no
--  toca fondos.
--
--  Lección: antes de reproducir el cuerpo de una función para agregarle una
--  línea, `grep -rl "create or replace function public.<fn>"` sobre TODAS
--  las migraciones — no asumir que la única copia encontrada es la última.
--
--  Se reproduce el cuerpo íntegro tal como quedó en 20260929170000 (la
--  última redefinición real antes de esta), más la línea de MANT-2.
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

-- Backfill: cualquier tenant creado mientras 20260930750000 estuvo activa (ventana corta, solo
-- en este entorno de desarrollo) y que por tanto pueda haber quedado sin su fondo de
-- imprevistos. Idempotente por construcción de fn_instanciar_fondo_imprevistos.
do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_fondo_imprevistos(v_tenant);
  end loop;
end $$;
