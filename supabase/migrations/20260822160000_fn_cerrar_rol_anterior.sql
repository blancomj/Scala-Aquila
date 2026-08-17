-- ═══════════════════════════════════════════════════════════════════════
--  fn_cerrar_rol_anterior — al asociar una persona nueva a un rol, cierra
--  la vigencia de quien tenía ese mismo rol activo en el inmueble.
--  Propietario: conversación de diseño de esta sesión.
--
--  Excepción explícita: copropietario. Ese rol sí admite varias personas
--  activas a la vez (copropiedad compartida, con `porcentaje` cada una) —
--  aplicar esta regla ahí rompería ese caso. El resto de roles
--  (arrendatario, apoderado, administrador...) se asume de un solo titular
--  vigente a la vez — decisión explícita del usuario.
--
--  SECURITY INVOKER (default): mismo criterio que fn_marcar_pagador —
--  inmueble_persona_rol_update_agent ya autoriza este UPDATE vía RLS, no
--  hace falta escalar privilegios. Se llama DESPUÉS de insertar la
--  asociación nueva (mismo patrón secuencial que marcarPagador en
--  stores/terceros.ts) — no es una sola transacción con el insert, mismo
--  riesgo ya aceptado en ese flujo.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_cerrar_rol_anterior(
  p_persona_rol_id uuid,
  p_tenant_id uuid,
  p_inmueble_id uuid,
  p_rol_id bigint,
  p_vigente_desde date
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.lista_tipos where id = p_rol_id and codigo = 'copropietario'
  ) then
    return;
  end if;

  update public.inmueble_persona_rol
  set vigente_hasta = p_vigente_desde
  where tenant_id = p_tenant_id
    and inmueble_id = p_inmueble_id
    and rol_id = p_rol_id
    and vigente_hasta is null
    and id <> p_persona_rol_id;
end;
$$;

revoke execute on function public.fn_cerrar_rol_anterior(uuid, uuid, uuid, bigint, date) from public, anon;
grant execute on function public.fn_cerrar_rol_anterior(uuid, uuid, uuid, bigint, date) to authenticated;
