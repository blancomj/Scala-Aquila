-- ═══════════════════════════════════════════════════════════════════════
--  Tercer guard que fn_resetear_copropiedad no podía atravesar:
--  forbid_mutation() — hermana más estricta de
--  forbid_mutation_salvo_tenant_borrado() (20260823250000), sin siquiera
--  la excepción de "el tenant ya no existe". La usan 21 tablas, entre
--  ellas activo_estado_historial y solicitud_actuaciones, ambas en la
--  cobertura de 20260934070000. Verificado en vivo contra un tenant
--  real: "APPEND_ONLY: activo_estado_historial no admite DELETE
--  (SEC-14)", transacción abortada sin borrar nada.
--
--  Mismo patrón ya aplicado dos veces (SEC-14 en 20260934060000,
--  inmutabilidad contable en 20260934080000): se deja pasar el DELETE
--  únicamente bajo aquila.reset_context (local a la transacción,
--  exige auth+rol administrador+audit_log en fn_resetear_copropiedad).
--
--  NO se toca la diferencia real de fondo entre esta función y su
--  hermana: forbid_mutation() sigue sin la excepción de cascada por
--  tenant borrado. Si eso es deliberado (datos que deben sobrevivir
--  incluso a borrar el tenant) o un descuido de copia entre las dos
--  funciones es una pregunta aparte, más grande, que esta migración no
--  resuelve — solo desbloquea el caso puntual del reset.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'audit_log' and tg_op = 'DELETE'
     and current_setting('aquila.purge_context', true) = 'true'
  then
    return old;
  end if;

  if tg_op = 'DELETE' and current_setting('aquila.reset_context', true) = 'true' then
    return old;
  end if;

  raise exception 'APPEND_ONLY: % no admite % (SEC-14)', tg_table_name, tg_op;
end;
$$;

comment on function public.forbid_mutation() is
  'Sin UPDATE ni DELETE para ningún rol, con dos excepciones puntuales de DELETE: (1) purga de '
  'audit_log bajo aquila.purge_context, (2) fn_resetear_copropiedad bajo aquila.reset_context '
  '(20260934090000). A diferencia de forbid_mutation_salvo_tenant_borrado(), NO tiene excepción '
  'para cascada por tenant borrado — las tablas que usan esta función no se liberan ni siquiera '
  'al borrar el tenant completo.';
