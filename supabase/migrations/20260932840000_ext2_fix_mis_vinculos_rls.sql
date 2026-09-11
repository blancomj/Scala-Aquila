-- ═══════════════════════════════════════════════════════════════════════
--  EXT-02 · fix de fn_actor_externo_mis_vinculos (bug preexistente de EXT-01)
--
--  Hallazgo durante la implementación de EXT-02, no en el Plan del corte:
--  fn_actor_externo_mis_vinculos (20260932690000, EXT-01) es `security
--  invoker` con el comentario "la política actor_externo_vinculo_select ya
--  limita a propios o de mi tenant como staff" — pero la función JOINEA
--  también `inmueble_persona_rol` y `tenants`, cuyas propias políticas RLS
--  exigen `is_member(tenant_id)`. Un actor externo NUNCA es tenant_member
--  (AD-37) — el JOIN queda bloqueado por esas dos tablas y la función
--  devuelve CERO filas para el propio dueño del vínculo, aunque exista.
--
--  Nunca se detectó en las 17 pruebas de EXT-01 porque las que verifican
--  contenido real la llaman con el cliente `admin` (bypassa RLS); la única
--  prueba que la llama con un cliente de actor externo (13) verifica
--  aislamiento — "debe devolver vacío" — así que el bug era indistinguible
--  del comportamiento correcto en ese caso. Confirmado empíricamente con
--  un script de depuración: `mis_vinculos` vacío pese a que
--  `actor_externo_vinculo` tenía la fila real.
--
--  Fix: `security definer`, reproduciendo DENTRO de la función la misma
--  regla que la RLS de `actor_externo_vinculo` ya expresaba ("propio o
--  soy staff de ese tenant") — ya no depende de que las tablas
--  intermedias del JOIN sean visibles para el caller.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_actor_externo_mis_vinculos(p_auth_user_id uuid)
returns table (
  vinculo_id uuid,
  tenant_id uuid,
  tenant_nombre text,
  inmueble_id uuid,
  persona_tipo public.actor_externo_persona_t,
  rol_codigo text,
  vigente_desde date,
  vigente_hasta date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.tenant_id, t.name, ipr.inmueble_id, v.persona_tipo, lt.codigo,
    v.vigente_desde, v.vigente_hasta
  from public.actor_externo_vinculo v
  join public.tenants t on t.id = v.tenant_id
  join public.inmueble_persona_rol ipr on ipr.id = v.persona_rol_id
  join public.lista_tipos lt on lt.id = ipr.rol_id
  where v.auth_user_id = p_auth_user_id
    and (v.vigente_hasta is null or v.vigente_hasta >= current_date)
    and (
      (select auth.uid()) is null
      or p_auth_user_id = (select auth.uid())
      or public.is_member(v.tenant_id)
    )
$$;

comment on function public.fn_actor_externo_mis_vinculos(uuid) is
  'EXT-01 §3.3 — vínculos vigentes de una cuenta, con tenant/inmueble/rol. `security definer` '
  '(corregido en EXT-02, 20260932840000): reproduce dentro de la función la regla "propio o soy '
  'staff de ese tenant" — como `security invoker`, el JOIN contra inmueble_persona_rol/tenants '
  'quedaba bloqueado por sus propias políticas RLS (is_member) para el actor externo dueño real '
  'del vínculo, que nunca es tenant_member (AD-37). `(select auth.uid()) is null` deja pasar al '
  'service_role sin chequeo — mismo criterio ya establecido en gobierno_crear_solicitud/'
  'gobierno_registrar_actuacion_solicitud (GOB-8) para distinguir una llamada de backend/tests de '
  'una de un usuario real. Un caller autenticado pasando un p_auth_user_id ajeno sin ser staff de '
  'ese tenant sigue viendo cero filas.';
