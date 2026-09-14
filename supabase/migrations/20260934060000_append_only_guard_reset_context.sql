-- ═══════════════════════════════════════════════════════════════════════
--  Fix: fn_resetear_copropiedad (20260928120000) nunca pudo funcionar
--  contra una copropiedad con datos reales. Su primera línea enciende
--  `aquila.reset_context` con la intención evidente de que el guard de
--  SEC-14 la reconozca como excepción — pero forbid_mutation_salvo_
--  tenant_borrado() nunca leía esa variable, así que cualquier tenant
--  con filas en pago_aplicaciones, documentos, pagos, cargos,
--  liquidacion_lineas o eventos_cartera hacía fallar el RPC completo con
--  "APPEND_ONLY: ... no admite DELETE (SEC-14)" en la primera de esas
--  tablas que tocara — sin borrar nada (verificado en vivo contra un
--  tenant con datos reales: pago_aplicaciones fue la que abortó).
--
--  Esta migración conecta la señal que ya existía. Tres candados, no
--  uno, acotan el alcance:
--    1. `aquila.reset_context` se enciende con set_config(..., true) —
--       local a la transacción de fn_resetear_copropiedad. Termina esa
--       llamada (éxito o error) y la bandera desaparece sola.
--    2. Ninguna otra función del repo enciende esta variable (grep
--       verificado) — no es un interruptor general de "modo desarrollo".
--    3. fn_resetear_copropiedad ya exige auth.uid() no nulo + rol
--       administrador en ESE tenant + deja rastro en audit_log — el
--       guard no releva ninguno de esos tres requisitos, solo deja de
--       bloquear el DELETE cuando ya se cumplieron.
--
--  No se toca la otra rama del guard (tenant ya no existe, para el
--  borrado en cascada) ni la política para UPDATE, que sigue prohibido
--  sin excepción en ambos casos.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.forbid_mutation_salvo_tenant_borrado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and (
    not exists (select 1 from public.tenants where id = old.tenant_id)
    or current_setting('aquila.reset_context', true) = 'true'
  ) then
    return old;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

comment on function public.forbid_mutation_salvo_tenant_borrado() is
  'Igual que forbid_mutation() (sin UPDATE ni DELETE para ningún rol), con DOS excepciones para '
  'DELETE: (1) la FK tenant_id ... on delete cascade al borrar el tenant dueño, y (2) el contexto '
  'de fn_resetear_copropiedad (aquila.reset_context, local a esa transacción — 20260934060000). '
  'Nunca un DELETE arbitrario mientras el tenant sigue existiendo fuera de esos dos caminos, '
  'ambos ya gobernados por sus propios candados (cascada real de FK; auth+rol admin+audit_log). '
  'Compartida por las 10 tablas append-only con tenant_id CASCADE (ver cabecera de 20260823250000); '
  'audit_log usa su propia versión (forbid_mutation_audit_log, SET NULL en vez de CASCADE) y '
  'tasas_referencia no tiene tenant_id, así que ninguna de las dos usa esta función.';
