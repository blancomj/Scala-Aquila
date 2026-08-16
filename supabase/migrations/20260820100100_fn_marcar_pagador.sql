-- ═══════════════════════════════════════════════════════════════════════
--  fn_marcar_pagador — swap atómico del pagador vigente de un inmueble
--  Propietario: PROMPT_FICHA_INMUEBLE.md §7.3
--
--  SECURITY INVOKER (default, sin `security definer`): igual criterio que
--  fn_registrar_fuente_financiacion (20260814210000) —
--  inmueble_persona_rol_update_agent ya autoriza esta escritura vía RLS
--  (has_role(tenant_id, agent)); no hace falta escalar privilegios. Un
--  UPDATE directo sobre `es_pagador` desde el cliente puede violar el
--  índice único parcial inmueble_persona_rol_un_pagador_vigente si ya hay
--  otro pagador vigente — esta función existe para hacer el desmarcar +
--  marcar como una sola transacción, nunca dos UPDATE sueltos desde Vue.
--
--  p_tenant_id/p_inmueble_id se exigen como parámetros explícitos (no se
--  infieren de p_persona_rol_id) para que ambos UPDATE queden acotados
--  por columna directa, mismo criterio SEC-12 que el resto del dominio.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_marcar_pagador(
  p_persona_rol_id uuid,
  p_tenant_id uuid,
  p_inmueble_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.inmueble_persona_rol
  set es_pagador = false
  where tenant_id = p_tenant_id
    and inmueble_id = p_inmueble_id
    and es_pagador
    and vigente_hasta is null
    and id <> p_persona_rol_id;

  update public.inmueble_persona_rol
  set es_pagador = true
  where id = p_persona_rol_id
    and tenant_id = p_tenant_id
    and inmueble_id = p_inmueble_id
    and vigente_hasta is null;
end;
$$;

revoke execute on function public.fn_marcar_pagador(uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_marcar_pagador(uuid, uuid, uuid) to authenticated;
