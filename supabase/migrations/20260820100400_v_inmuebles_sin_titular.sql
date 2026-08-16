-- ═══════════════════════════════════════════════════════════════════════
--  v_inmuebles_sin_titular — inmuebles sin copropietario vigente (T0.5)
--  Propietario: PROMPT_FICHA_INMUEBLE.md §4.2
--
--  Se consulta, no se marca a mano — no existe columna ni catálogo para
--  "sin titular", es puramente derivado de inmueble_persona_rol.
-- ═══════════════════════════════════════════════════════════════════════

create view public.v_inmuebles_sin_titular
with (security_invoker = true) as
select i.*
from public.inmuebles i
where not exists (
  select 1
  from public.inmueble_persona_rol ipr
  join public.lista_tipos lt on lt.id = ipr.rol_id
  where ipr.inmueble_id = i.id
    and ipr.vigente_hasta is null
    and lt.codigo = 'copropietario'
);

comment on view public.v_inmuebles_sin_titular is
  'Inmuebles sin ninguna fila vigente en inmueble_persona_rol con rol=copropietario. '
  'security_invoker=true: respeta el RLS de inmuebles/inmueble_persona_rol del usuario '
  'que consulta.';
