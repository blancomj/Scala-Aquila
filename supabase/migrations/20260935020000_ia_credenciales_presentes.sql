-- ═══════════════════════════════════════════════════════════════════════
--  Qué credenciales están guardadas — SOLO LOS NOMBRES. Mismo patrón y
--  mismo motivo exacto que fn_pasarela_credenciales_presentes
--  (20260904120000): la UI necesita saber si 'api_key' ya fue capturada
--  para mostrar "••••••••" y un botón "Reemplazar", pero ia_credencial no
--  tiene política para `authenticated` (deliberado, ver su COMMENT ON
--  TABLE), así que el cliente no puede consultarla directo.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_ia_credenciales_presentes(p_tenant_id uuid)
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
  select ic.config_id, ic.nombre
  from public.ia_credencial ic
  where ic.tenant_id = p_tenant_id
  order by ic.config_id, ic.nombre;
end;
$$;

comment on function public.fn_ia_credenciales_presentes(uuid) is
  'Nombres de las credenciales de proveedor de IA guardadas por esta copropiedad, para que la UI '
  'muestre "ya está capturada" sin poder leerla. Devuelve (config_id, nombre) y nada más — el '
  'valor vive en Vault. SECURITY DEFINER porque ia_credencial no tiene política para '
  'authenticated; la membresía se verifica adentro.';

revoke execute on function public.fn_ia_credenciales_presentes(uuid) from public, anon;
grant execute on function public.fn_ia_credenciales_presentes(uuid) to authenticated;
