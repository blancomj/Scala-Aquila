-- ═══════════════════════════════════════════════════════════════════════
--  Puente entre pasarela_credencial y Supabase Vault.
--
--  Vault solo se manipula desde SQL (vault.create_secret / update_secret /
--  vault.decrypted_secrets), así que la Edge Function no puede escribir un
--  secreto por sí sola: necesita estas dos funciones. Ambas son
--  SECURITY DEFINER y están revocadas para authenticated — se ejecutan
--  únicamente con service_role, desde configurar-pasarela/index.ts, que ya
--  verificó el rol del usuario antes de llegar aquí.
--
--  NINGUNA de las dos devuelve jamás el valor de una credencial:
--   · fn_guardar_credencial_pasarela devuelve el uuid del secreto en Vault
--   · fn_credenciales_pasarela_descifrables devuelve un CONTEO
--  Esa es la propiedad que hace verificable el "una credencial no se puede
--  leer de vuelta" — no hay superficie por donde salga, ni siquiera para el
--  administrador del tenant.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_guardar_credencial_pasarela(
  p_config_id uuid,
  p_tenant_id uuid,
  p_nombre    text,
  p_valor     text,
  p_actor_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id  uuid;
  v_existente  uuid;
  v_proveedor  public.pasarela_proveedor_t;
begin
  select proveedor into v_proveedor
  from public.pasarela_config
  where id = p_config_id and tenant_id = p_tenant_id;

  if not found then
    raise exception 'PASARELA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  select vault_secret_id into v_existente
  from public.pasarela_credencial
  where config_id = p_config_id and nombre = p_nombre;

  if v_existente is null then
    -- El nombre del secreto en Vault debe ser único a nivel de proyecto, por
    -- eso lleva config_id: dos copropiedades pueden tener ambas una
    -- 'private_key' de Wompi.
    v_secret_id := vault.create_secret(
      p_valor,
      'pasarela_' || p_config_id::text || '_' || p_nombre,
      'Credencial de pasarela de pago. Escrita por configurar-pasarela.'
    );

    insert into public.pasarela_credencial
      (config_id, tenant_id, nombre, vault_secret_id, created_by)
    values (p_config_id, p_tenant_id, p_nombre, v_secret_id, p_actor_id);
  else
    -- Reemplazo: se conserva la misma fila y el mismo secreto en Vault, solo
    -- cambia el valor cifrado.
    perform vault.update_secret(v_existente, p_valor);
    v_secret_id := v_existente;
  end if;

  -- Guardar una credencial invalida la verificación anterior y desactiva la
  -- pasarela: lo que se probó ya no es lo que hay. Volver a probar es
  -- explícito, no implícito.
  update public.pasarela_config
  set verificada_at = null,
      activa = false,
      updated_at = now()
  where id = p_config_id and tenant_id = p_tenant_id;

  -- Auditoría: SOLO el nombre del campo y quién lo cambió. NUNCA el valor.
  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_tenant_id,
    p_actor_id,
    'pasarela.credencial_actualizada',
    'pasarela_config',
    p_config_id,
    jsonb_build_object(
      'proveedor', v_proveedor,
      'credencial', p_nombre,
      'reemplazo', v_existente is not null
    )
  );

  return v_secret_id;
end;
$$;

comment on function public.fn_guardar_credencial_pasarela(uuid, uuid, text, text, uuid) is
  'Guarda o reemplaza una credencial de pasarela en Vault y deja la referencia en '
  'pasarela_credencial. Devuelve el uuid del secreto, NUNCA su valor. Audita solo el nombre del '
  'campo. Invalida verificada_at y desactiva la pasarela: cambiar una credencial obliga a volver '
  'a probar. Solo service_role (Edge Function configurar-pasarela), que ya verificó el rol.';

revoke execute on function public.fn_guardar_credencial_pasarela(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_guardar_credencial_pasarela(uuid, uuid, text, text, uuid)
  to service_role;

-- ── Verificación de que las credenciales se pueden descifrar ───────────
-- Devuelve un CONTEO, no los valores: es lo máximo que se puede comprobar
-- en la fase de estructura (que Vault las tiene y las puede leer). La
-- verificación real contra la API del proveedor llega con su integración.
create function public.fn_credenciales_pasarela_descifrables(
  p_config_id uuid,
  p_tenant_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if not exists (
    select 1 from public.pasarela_config
    where id = p_config_id and tenant_id = p_tenant_id
  ) then
    raise exception 'PASARELA_NO_CONFIGURADA: la configuración % no existe en esta copropiedad',
      p_config_id;
  end if;

  select count(*) into v_total
  from public.pasarela_credencial pc
  join vault.decrypted_secrets ds on ds.id = pc.vault_secret_id
  where pc.config_id = p_config_id
    and ds.decrypted_secret is not null
    and length(ds.decrypted_secret) > 0;

  return v_total;
end;
$$;

comment on function public.fn_credenciales_pasarela_descifrables(uuid, uuid) is
  'Cuántas credenciales de esta configuración están en Vault y se pueden descifrar. Devuelve un '
  'CONTEO, jamás los valores — es lo que permite a "probar conexión" verificar el almacén sin '
  'crear una superficie por donde una credencial pueda salir. Solo service_role.';

revoke execute on function public.fn_credenciales_pasarela_descifrables(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_credenciales_pasarela_descifrables(uuid, uuid)
  to service_role;
