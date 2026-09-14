-- ═══════════════════════════════════════════════════════════════════════
--  La ÚNICA función que devuelve el VALOR descifrado de una credencial de
--  proveedor de IA. Mismo patrón y mismo motivo exacto que
--  fn_leer_credenciales_pasarela (20260904200000).
--
--  Existe para "consumir servicios de IA al momento en que se requiera"
--  (encargo del usuario, 2026-09-13): el primer módulo que necesite hablar
--  de verdad con Anthropic/OpenAI/Google (p. ej. extracción asistida de
--  extractos bancarios en PDF) resuelve el proveedor/modelo activo del
--  tenant con una consulta normal a ia_config (RLS ya autoriza SELECT a
--  cualquier miembro) y llama a ESTA función, con service_role, para
--  obtener la clave real — nunca antes, nunca desde el cliente.
--
--  Cualquier Edge Function que la use hereda la misma regla que ya rige
--  crear-intencion-pago/webhook-pasarela: el valor nunca sale en una
--  respuesta HTTP, un log, ni audit_log.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_leer_credenciales_ia(p_config_id uuid, p_tenant_id uuid)
returns table (nombre text, valor text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.ia_config
    where id = p_config_id and tenant_id = p_tenant_id
  ) then
    raise exception 'IA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  return query
  select ic.nombre, ds.decrypted_secret
  from public.ia_credencial ic
  join vault.decrypted_secrets ds on ds.id = ic.vault_secret_id
  where ic.config_id = p_config_id;
end;
$$;

comment on function public.fn_leer_credenciales_ia(uuid, uuid) is
  'ÚNICA función que devuelve el VALOR descifrado de una credencial de proveedor de IA — todo lo '
  'demás (fn_ia_credenciales_presentes, fn_credenciales_ia_descifrables) devuelve deliberadamente '
  'nombres o conteos, nunca valores. Revocada para authenticated y anon: solo service_role, desde '
  'la Edge Function que consuma el proveedor cuando algún módulo lo necesite, que debe mantener '
  'la regla explícita de nunca dejar salir el valor en una respuesta HTTP, un log ni audit_log.';

revoke execute on function public.fn_leer_credenciales_ia(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_leer_credenciales_ia(uuid, uuid) to service_role;
