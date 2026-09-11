-- ═══════════════════════════════════════════════════════════════════════
--  Revocar EXECUTE de las 7 funciones fn_instanciar_* de aprovisionamiento
--  interno de create_tenant()
--
--  Hallazgo del usuario: estas 7 funciones solo se invocan internamente
--  desde create_tenant() vía `perform ...`, pero conservan el EXECUTE por
--  defecto de PUBLIC (por tanto anon y authenticated vía PostgREST). Ninguna
--  valida que auth.uid() sea miembro del p_tenant_id recibido — un usuario
--  autenticado (posiblemente anon, según config de PostgREST) puede
--  invocarlas vía RPC con el tenant_id de OTRA copropiedad, forzando la
--  (re)siembra de datos de plantilla en un tenant ajeno. La mayoría son
--  idempotentes por diseño, pero eso no las vuelve autorizadas.
--
--  Verificado contra local (proyecto ligado a hwjmlyzzvpmhadldavbq) con
--  has_function_privilege: las 7 devuelven true para anon y authenticated
--  antes de este revoke.
--
--  Nota: de las 7, solo fn_instanciar_requisitos_cumplimiento es
--  `security definer` (bypasea RLS) — las otras 6 son `security invoker`
--  (corren con los privilegios del caller, sujetas a RLS igual). El riesgo
--  de exposición por RPC directo aplica a las 7 por igual (siembra de
--  plantilla en tenant ajeno vía invocación no autorizada), aunque el
--  bypass de RLS solo es real en la definer.
--
--  Mismo patrón ya establecido en 20260932490000 (cron_mant_salud_snapshot_mensual)
--  y 20260932540000 (fn_instanciar_salud_factores_default): ninguna función
--  de aprovisionamiento interno, llamada solo desde create_tenant(), necesita
--  ser invocable como RPC directo.
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.fn_instanciar_conceptos(uuid)
  from public, anon, authenticated;

revoke execute on function public.fn_instanciar_plan_contable(uuid, boolean, text)
  from public, anon, authenticated;

revoke execute on function public.fn_instanciar_cuentas_default(uuid)
  from public, anon, authenticated;

revoke execute on function public.fn_instanciar_puentes_presupuesto(uuid)
  from public, anon, authenticated;

revoke execute on function public.fn_instanciar_fondo_imprevistos(uuid)
  from public, anon, authenticated;

revoke execute on function public.fn_instanciar_requisitos_cumplimiento(uuid)
  from public, anon, authenticated;

revoke execute on function public.fn_instanciar_presupuesto_cuenta(uuid)
  from public, anon, authenticated;
