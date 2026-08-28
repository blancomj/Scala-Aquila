-- ═══════════════════════════════════════════════════════════════════════
--  Fase 2 · bloque 2 — la ÚNICA función que devuelve el VALOR descifrado de
--  una credencial de pasarela. Propietario: prompt de fase 2 §5.2/§6.1.
--
--  Hasta hoy (20260904110000) solo existían dos lecturas sobre
--  pasarela_credencial, y las dos a propósito NUNCA devuelven el valor:
--    · fn_pasarela_credenciales_presentes  → (config_id, nombre) para la UI
--    · fn_credenciales_pasarela_descifrables → un CONTEO, para "probar conexión"
--
--  Cobrar de verdad exige lo que esas dos deliberadamente no dan: el valor
--  real de public_key/integrity_secret (para construir la URL de Web
--  Checkout y firmarla) y de events_secret/public_key (para validar un
--  webhook y hacer la verificación doble contra la API). Esta función es esa
--  tercera lectura — service_role únicamente, nunca expuesta a
--  `authenticated` ni a `anon`, y las Edge Functions que la llaman
--  (crear-intencion-pago, webhook-pasarela) tienen la regla explícita en su
--  propia cabecera: el valor nunca sale en una respuesta HTTP, un log, ni
--  audit_log.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_leer_credenciales_pasarela(p_config_id uuid, p_tenant_id uuid)
returns table (nombre text, valor text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pasarela_config
    where id = p_config_id and tenant_id = p_tenant_id
  ) then
    raise exception 'PASARELA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  return query
  select pc.nombre, ds.decrypted_secret
  from public.pasarela_credencial pc
  join vault.decrypted_secrets ds on ds.id = pc.vault_secret_id
  where pc.config_id = p_config_id;
end;
$$;

comment on function public.fn_leer_credenciales_pasarela(uuid, uuid) is
  'ÚNICA función que devuelve el VALOR descifrado de una credencial de pasarela — todo lo demás '
  '(fn_pasarela_credenciales_presentes, fn_credenciales_pasarela_descifrables) devuelve '
  'deliberadamente nombres o conteos, nunca valores. Existe porque cobrar de verdad (fase 2) exige '
  'la public_key/integrity_secret/events_secret reales para construir y validar firmas contra el '
  'proveedor. Revocada para authenticated y anon: solo service_role, desde crear-intencion-pago y '
  'webhook-pasarela, que ya tienen la regla explícita de nunca dejar salir el valor en una '
  'respuesta HTTP, un log ni audit_log.';

revoke execute on function public.fn_leer_credenciales_pasarela(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_leer_credenciales_pasarela(uuid, uuid) to service_role;
