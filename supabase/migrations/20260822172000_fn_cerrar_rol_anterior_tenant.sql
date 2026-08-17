-- ═══════════════════════════════════════════════════════════════════════
--  fn_cerrar_rol_anterior_tenant — mismo criterio que fn_cerrar_rol_anterior
--  (20260822160000, personas↔inmueble) pero para personas↔copropiedad
--  (tenant_tercero_rol): al vincular una persona nueva a un rol, cierra la
--  vigencia de quien tenía ese mismo rol activo en la copropiedad.
--  Propietario: conversación de diseño de esta sesión.
--
--  Revierte la decisión documentada en 20260822090000_tenant_tercero_rol
--  ("puede haber varios administradores o contadores a la vez") — decisión
--  explícita del usuario en esta sesión: dos personas vinculadas a la
--  copropiedad no pueden compartir el mismo rol vigente al mismo tiempo,
--  igual que ya rige para inmueble_persona_rol.
--
--  Sin excepción tipo "copropietario" — ese concepto no existe en este
--  nivel (PERSONA_COPROPIEDAD son roles administrativos: administrador,
--  contador, abogado, revisor fiscal), así que se aplica sin excepciones
--  a todos los roles.
--
--  SECURITY INVOKER (default): tenant_tercero_rol_update_agent ya autoriza
--  este UPDATE vía RLS. Se llama DESPUÉS de insertar la asociación nueva,
--  mismo patrón secuencial que fn_cerrar_rol_anterior en
--  stores/terceros.ts.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_cerrar_rol_anterior_tenant(
  p_tenant_tercero_rol_id uuid,
  p_tenant_id uuid,
  p_rol_id bigint,
  p_vigente_desde date
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.tenant_tercero_rol
  set vigente_hasta = p_vigente_desde
  where tenant_id = p_tenant_id
    and rol_id = p_rol_id
    and vigente_hasta is null
    and id <> p_tenant_tercero_rol_id;
end;
$$;

revoke execute on function public.fn_cerrar_rol_anterior_tenant(uuid, uuid, bigint, date) from public, anon;
grant execute on function public.fn_cerrar_rol_anterior_tenant(uuid, uuid, bigint, date) to authenticated;
