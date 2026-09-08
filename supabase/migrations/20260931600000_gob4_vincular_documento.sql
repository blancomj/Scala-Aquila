-- ═══════════════════════════════════════════════════════════════════════
--  GOB-4 · fn_gobierno_vincular_documento_acta
--
--  gobierno_actas no tiene policy update para authenticated (toda escritura
--  pasa por RPC, ver 20260931570000) — vincular el PDF firmado (subido vía
--  subir-documento, RC-3/documentos.ts, ya existente) necesita su propia
--  función. Se permite en cualquier estado del acta (incluida suscrita): el
--  PDF firmado se sube DESPUÉS de suscribir en el flujo real (firma física,
--  luego escaneo), no antes.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_gobierno_vincular_documento_acta(p_acta_id uuid, p_documento_id uuid)
returns public.gobierno_actas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acta public.gobierno_actas;
  v_documento_tenant uuid;
begin
  select * into v_acta from public.gobierno_actas where id = p_acta_id;
  if v_acta.id is null then
    raise exception 'ACTA_INEXISTENTE: acta_id % no existe', p_acta_id;
  end if;

  if (select auth.uid()) is not null and not public.has_role(v_acta.tenant_id, array['auxiliar']::public.tenant_role_t[]) then
    raise exception 'ACTA_TRANSICION_REQUIERE_AUXILIAR: se requiere rol auxiliar o superior';
  end if;

  select tenant_id into v_documento_tenant from public.documentos where id = p_documento_id;
  if v_documento_tenant is distinct from v_acta.tenant_id then
    raise exception 'ACTA_DOCUMENTO_INVALIDO: documento_id % no pertenece al tenant % del acta', p_documento_id, v_acta.tenant_id;
  end if;

  update public.gobierno_actas set documento_id = p_documento_id, updated_at = now()
  where id = p_acta_id
  returning * into v_acta;

  return v_acta;
end;
$$;

comment on function public.fn_gobierno_vincular_documento_acta(uuid, uuid) is
  'GOB-4: vincula el PDF firmado (subido vía subir-documento) a un acta ya existente — permitido '
  'en cualquier estado, el PDF se sube después de suscribir en el flujo real. ACTA_INEXISTENTE, '
  'ACTA_TRANSICION_REQUIERE_AUXILIAR, ACTA_DOCUMENTO_INVALIDO (tenant no coincide).';
