-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · Identidad del actor externo — vocabulario (Hito 4)
--
--  Dos enums, ambos gatillan lógica real (D-24, marco §5.3):
--    - actor_externo_persona_t: determina, en el alta, si persona_rol_id se
--      valida contra un rol_id 'copropietario' (propietario) o contra la
--      familia 'arrendatario'/'inquilino'/'locatario'/'usufructuario'
--      (tenedor) — dos ramas de validación distintas, no vocabulario
--      descriptivo.
--    - actor_externo_origen_t: distingue si el alta exige un OTP confirmado
--      (autoverificacion) o no (staff) — gatilla el guard
--      ACTOR_EXTERNO_ALTA_SIN_VERIFICACION.
--
--  Qué queda deliberadamente fuera: cualquier tercer valor de origen (p.ej.
--  "migrado") — el spec (EXT_01_identidad_actor_externo.md §3.1) solo pide
--  estos dos.
-- ═══════════════════════════════════════════════════════════════════════

create type public.actor_externo_persona_t as enum ('propietario', 'tenedor');

comment on type public.actor_externo_persona_t is
  'EXT-01 — determina contra qué familia de rol_id de inmueble_persona_rol se valida el alta: '
  '''propietario'' exige rol_id.codigo=''copropietario''; ''tenedor'' exige uno de '
  'arrendatario/inquilino/locatario/usufructuario (mismo criterio que fn_tenedores_vigentes, '
  'GOB-0). Snapshot al alta, no se recalcula si el rol cambia después.';

create type public.actor_externo_origen_t as enum ('autoverificacion', 'staff');

comment on type public.actor_externo_origen_t is
  'EXT-01 — ''autoverificacion'' exige un OTP confirmado en los últimos minutos '
  '(ACTOR_EXTERNO_ALTA_SIN_VERIFICACION si falta); ''staff'' es alta manual sin ese '
  'requisito, para el caso de excepción de alguien sin acceso a su correo registrado.';
