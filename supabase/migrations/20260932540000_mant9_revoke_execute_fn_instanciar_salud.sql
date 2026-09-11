-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 addendum · revocar EXECUTE de fn_instanciar_salud_factores_default
--
--  Hallazgo propio, no reportado por el usuario: al revisar get_advisors tras
--  pushear 20260932530000, fn_instanciar_salud_factores_default aparece con
--  EXECUTE heredado de PUBLIC para anon/authenticated (default de Postgres al
--  crear una función) — igual que las OTRAS 7 funciones fn_instanciar_* ya
--  existentes (fn_instanciar_conceptos, _plan_contable, _cuentas_default,
--  _puentes_presupuesto, _fondo_imprevistos, _requisitos_cumplimiento,
--  _presupuesto_cuenta), verificado con has_function_privilege contra local.
--
--  Esas 7 son un hallazgo sistémico preexistente, fuera de alcance de este
--  addendum (no las escribí yo, tocarlas es decisión de otra sesión) — solo
--  se corrige aquí la propia, mismo criterio que MANT-9 ya aplicó a
--  cron_mant_salud_snapshot_mensual (20260932490000): ninguna función de
--  aprovisionamiento interno, llamada solo desde create_tenant()/un cron,
--  necesita ser invocable como RPC directo.
--
--  Riesgo real de la propia función (bajo, pero real): un usuario autenticado
--  sin membresía en el tenant podría invocarla vía RPC con un p_tenant_id
--  ajeno. El unique (tenant_id, version) la vuelve inofensiva en la práctica
--  (todo tenant ya tiene su v1 desde el alta → duplicate key, no inserta
--  nada) pero deja un canal de enumeración de tenant_id vía el tipo de error.
--  Se cierra de todos modos, no se confía en la protección incidental.
-- ═══════════════════════════════════════════════════════════════════════

revoke execute on function public.fn_instanciar_salud_factores_default(uuid)
  from public, anon, authenticated;
