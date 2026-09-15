-- ═══════════════════════════════════════════════════════════════════════
--  Fix — service_role pierde EXECUTE sobre las 7 funciones de
--  aprovisionamiento interno de create_tenant() (20260932550000)
--
--  20260932550000 revocó EXECUTE de estas 7 funciones "from public, anon,
--  authenticated" por una razón de seguridad real: cualquier autenticado
--  podía invocarlas vía RPC con el tenant_id de OTRA copropiedad, forzando
--  la resiembra de datos de plantilla en un tenant ajeno.
--
--  Efecto colateral no buscado: NINGÚN rol (ni siquiera service_role) tenía
--  un GRANT EXECUTE propio sobre estas 7 funciones — todos dependían del
--  EXECUTE por defecto de PUBLIC que ese REVOKE retiró. service_role solo
--  se usa desde infraestructura confiable (fixtures de test, tooling
--  interno) — nunca se expone a un navegador — así que restringir su
--  acceso no aporta nada a la mitigación real (que es bloquear anon/
--  authenticated vía PostgREST), y sí rompió en silencio dos fixtures ya
--  existentes que predatan el revoke: tests/contabilidad/tributario.test.ts
--  (tenantConPlan) y tests/contabilidad/alta-parametrizacion-contable.test.ts
--  (prueba de idempotencia de fn_instanciar_fondo_imprevistos) —
--  encontrado corriendo la suite completa al implementar el gap ReteIVA/
--  ReteICA/ICA/depreciación (2026-09-14). tenantConPlan se corrigió aparte
--  para pasar por create_tenant() en vez de invocar
--  fn_instanciar_plan_contable directo (más correcto: ejercita el camino
--  real); la prueba de idempotencia de fn_instanciar_fondo_imprevistos SÍ
--  necesita seguir invocando la función directo, así que esta migración le
--  restaura el EXECUTE únicamente a service_role.
--
--  anon y authenticated quedan exactamente como los dejó 20260932550000 —
--  esta migración no los toca.
-- ═══════════════════════════════════════════════════════════════════════

grant execute on function public.fn_instanciar_conceptos(uuid) to service_role;
grant execute on function public.fn_instanciar_plan_contable(uuid, boolean, text) to service_role;
grant execute on function public.fn_instanciar_cuentas_default(uuid) to service_role;
grant execute on function public.fn_instanciar_puentes_presupuesto(uuid) to service_role;
grant execute on function public.fn_instanciar_fondo_imprevistos(uuid) to service_role;
grant execute on function public.fn_instanciar_requisitos_cumplimiento(uuid) to service_role;
grant execute on function public.fn_instanciar_presupuesto_cuenta(uuid) to service_role;
