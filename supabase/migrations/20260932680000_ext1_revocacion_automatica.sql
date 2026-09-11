-- ═══════════════════════════════════════════════════════════════════════
--  EXT-01 · Revocación automática (Hito 4, spec §3.4)
--
--  Un solo trigger genérico sobre inmueble_persona_rol, no dos mecanismos
--  separados (uno para "venta", otro para "cierre de tenedor") como
--  describía el spec original — desde D-60/GOB-0, propietario y tenedor
--  son la MISMA tabla, así que cerrar cualquiera de los dos siempre se
--  manifiesta como el mismo evento: inmueble_persona_rol.vigente_hasta
--  pasando de null a una fecha. Confirmado contra el código real
--  (fn_cerrar_rol_anterior, 20260822160000/20260822173000): tanto un
--  reemplazo de titular como cualquier cierre manual pasan por ahí.
--
--  inmueble_transferencias (CJ-8, 20260908100000) es solo evidencia — no
--  toca vigente_hasta por sí sola, así que no hace falta un segundo
--  trigger sobre esa tabla.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_actor_externo_revocar_por_cierre_rol()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vigente_hasta is not null and old.vigente_hasta is distinct from new.vigente_hasta then
    -- GREATEST(fecha de cierre, vigente_desde propio del vínculo) — mismo fix que
    -- fn_cerrar_rol_anterior (20260822173000): un vínculo creado HOY no puede cerrarse con una
    -- fecha anterior a su propio inicio sin violar ACTOR_EXTERNO_VIGENCIA_INVALIDA (encontrado
    -- por la prueba 7 de este corte: cerrar el rol con una fecha pasada, cuando el vínculo nació
    -- después, disparaba ese guard en cascada).
    update public.actor_externo_vinculo
    set vigente_hasta = greatest(new.vigente_hasta, vigente_desde)
    where persona_rol_id = new.id
      and vigente_hasta is null;
  end if;
  return new;
end;
$$;

comment on function public.fn_actor_externo_revocar_por_cierre_rol() is
  'EXT-01 §3.4 — al cerrarse un inmueble_persona_rol (venta, fin de arrendamiento, cualquier '
  'motivo), cierra cualquier actor_externo_vinculo todavía vigente que dependa de ese rol, con '
  'la fecha de cierre o su propio vigente_desde, lo que sea mayor (nunca antes de que empezó). '
  'Sin intervención manual.';

create trigger fn_actor_externo_revocar_por_cierre_rol
  after update of vigente_hasta on public.inmueble_persona_rol
  for each row execute function public.fn_actor_externo_revocar_por_cierre_rol();
