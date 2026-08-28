-- ═══════════════════════════════════════════════════════════════════════
--  Qué credenciales están guardadas — SOLO LOS NOMBRES.
--
--  La UI necesita saber si 'private_key' ya fue capturada, para mostrar
--  "••••••••" y un botón "Reemplazar" en vez de un campo vacío. Pero
--  pasarela_credencial no tiene política para `authenticated` (deliberado,
--  ver su COMMENT ON TABLE), así que el cliente no puede consultarla.
--
--  Esta función es la superficie mínima que resuelve eso: SECURITY DEFINER
--  para poder leer la tabla, con chequeo de membresía adentro, y un
--  RETURNS TABLE que expone (config_id, nombre) y NADA MÁS. No hay forma de
--  que devuelva un valor: vault_secret_id ni siquiera está en la proyección,
--  y el valor solo vive en Vault.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_pasarela_credenciales_presentes(p_tenant_id uuid)
returns table (config_id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_member(p_tenant_id) then
    raise exception 'FORBIDDEN: no es miembro de esta copropiedad';
  end if;

  return query
  select pc.config_id, pc.nombre
  from public.pasarela_credencial pc
  where pc.tenant_id = p_tenant_id
  order by pc.config_id, pc.nombre;
end;
$$;

comment on function public.fn_pasarela_credenciales_presentes(uuid) is
  'Nombres de las credenciales de pasarela guardadas por esta copropiedad, para que la UI muestre '
  '"ya está capturada" sin poder leerla. Devuelve (config_id, nombre) y nada más — el valor vive '
  'en Vault y no hay endpoint que lo retorne. SECURITY DEFINER porque pasarela_credencial no '
  'tiene política para authenticated; la membresía se verifica adentro.';

revoke execute on function public.fn_pasarela_credenciales_presentes(uuid) from public, anon;
grant execute on function public.fn_pasarela_credenciales_presentes(uuid) to authenticated;
