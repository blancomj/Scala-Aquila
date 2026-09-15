-- ═══════════════════════════════════════════════════════════════════════
--  Wrapper autorizado para fn_instanciar_plan_contable — restaura el flujo
--  real de "Instalar plan base" desde el navegador sin reabrir el hueco
--  que 20260932550000 cerró
--
--  20260932550000 revocó EXECUTE de fn_instanciar_plan_contable (y sus 6
--  hermanas fn_instanciar_*) de public/anon/authenticated: son
--  aprovisionamiento interno de create_tenant(), sin chequeo propio de que
--  auth.uid() pertenezca al p_tenant_id recibido, así que exponerlas por
--  RPC directo permitía a cualquier autenticado forzar la resiembra de
--  plantilla en un tenant ajeno pasando su id.
--
--  Pero fn_instanciar_plan_contable SÍ tiene un consumidor legítimo desde
--  el navegador: apps/web/app/pages/contabilidad/plan-de-cuentas.vue
--  (botones "Instalar plan base"/"Instalar con cuentas opcionales") vía
--  contabilidad.ts::instanciarPlan(), para que un auxiliar instale el plan
--  de cuentas de SU PROPIA copropiedad. El revoke bloqueó ese flujo real —
--  confirmado contra producción (hwjmlyzzvpmhadldavbq,
--  has_function_privilege('authenticated', 'fn_instanciar_plan_contable(uuid,boolean,text)',
--  'execute') = false) — sin que ningún test lo hubiera detectado, porque
--  el único test de la función la invoca con el cliente admin (service_role),
--  no como el usuario autenticado real (tests/contabilidad/marco-contable-tenant.test.ts).
--
--  Esta función resuelve ambos lados: valida has_role(p_tenant_id,
--  'auxiliar') —mismo chequeo que ya usa contable_cuenta_insert_auxiliar
--  (20260830430000) para el INSERT que la función hace por dentro— y solo
--  entonces delega en fn_instanciar_plan_contable. SECURITY DEFINER porque
--  ni el dueño de la sesión (authenticated) tiene EXECUTE directo sobre
--  ella; el chequeo de autorización no depende del rol de Postgres sino de
--  auth.uid() (vía has_role, que lo lee de la sesión/GUC, no del rol
--  actual), así que sigue validando al usuario real aunque el wrapper
--  corra con los privilegios de su dueño.
--
--  fn_instanciar_plan_contable sigue SIN EXECUTE para authenticated: esta
--  wrapper es la única vía autorizada hacia ella desde RPC directo. Las
--  otras 6 fn_instanciar_* no se invocan desde apps/web (verificado por
--  grep) — no necesitan wrapper equivalente.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instalar_plan_contable(
  p_tenant_id           uuid,
  p_incluir_opcionales  boolean default false,
  p_plan_codigo         text default 'PUC_PH_CO'
)
returns table (creadas integer, existentes integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'PLAN_CONTABLE_NO_AUTORIZADO: se requiere rol auxiliar (o superior) en la '
      'copropiedad % para instalar su plan de cuentas', p_tenant_id;
  end if;

  return query
    select * from public.fn_instanciar_plan_contable(p_tenant_id, p_incluir_opcionales, p_plan_codigo);
end;
$$;

comment on function public.fn_instalar_plan_contable(uuid, boolean, text) is
  'Wrapper autorizado de fn_instanciar_plan_contable para invocación directa desde el navegador '
  '(apps/web/app/stores/contabilidad.ts::instanciarPlan()). Valida has_role(p_tenant_id, '
  '''auxiliar'') antes de delegar — mismo criterio que contable_cuenta_insert_auxiliar. '
  'fn_instanciar_plan_contable en sí no tiene EXECUTE para authenticated (20260932550000): '
  'esta es la única vía autorizada desde RPC directo.';

grant execute on function public.fn_instalar_plan_contable(uuid, boolean, text) to authenticated;
