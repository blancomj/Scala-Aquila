-- ═══════════════════════════════════════════════════════════════════════
--  E8 · Reordenar una cuenta con hijos también arrastra su ruta
--
--  Limitación conocida documentada en 20260823200000/20260823210000:
--  cambiar `orden` en una cuenta que ya tiene hijos recalculaba SU PROPIA
--  ruta (guard_presupuesto_cuenta_arbol ya lo hacía) pero no la de sus
--  descendientes, que seguían arrastrando el prefijo viejo — quedaban mal
--  ordenados en cualquier listado que ordene por `ruta` (aunque el nivel,
--  y por lo tanto la jerarquía real y el rollup, nunca estuvo mal).
--
--  propagar_presupuesto_cuenta_ruta (20260823210000) ya sabe hacer
--  exactamente este trabajo — reemplazar el prefijo de ruta antiguo por
--  el nuevo en todos los descendientes — solo estaba enganchado a
--  parent_id. La condición interna ya usaba una comparación sobre ruta en
--  espíritu; aquí se generaliza a `old.ruta is distinct from new.ruta`
--  (cierto tanto al reparentar como al reordenar) y el trigger pasa a
--  escuchar también `orden`.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.propagar_presupuesto_cuenta_ruta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ruta is distinct from new.ruta then
    with recursive descendientes as (
      select id, ruta, nivel from public.presupuesto_cuenta where parent_id = new.id
      union all
      select c.id, c.ruta, c.nivel
      from public.presupuesto_cuenta c
      join descendientes d on c.parent_id = d.id
    )
    update public.presupuesto_cuenta pc
    set ruta = new.ruta || substring(d.ruta from length(old.ruta) + 1),
        nivel = pc.nivel + (new.nivel - old.nivel)
    from descendientes d
    where pc.id = d.id;
  end if;
  return null;
end;
$$;

comment on function public.propagar_presupuesto_cuenta_ruta() is
  'AFTER UPDATE OF parent_id, orden en presupuesto_cuenta (E8) — recalcula nivel/ruta de todos '
  'los descendientes cuando la ruta propia de la fila cambió (reparentado u orden). Solo escribe '
  'nivel/ruta, nunca parent_id/naturaleza/orden, así que no reactiva guard_presupuesto_cuenta_arbol '
  'ni a sí mismo (sin recursión).';

drop trigger propagar_presupuesto_cuenta_ruta on public.presupuesto_cuenta;
create trigger propagar_presupuesto_cuenta_ruta
  after update of parent_id, orden on public.presupuesto_cuenta
  for each row execute function public.propagar_presupuesto_cuenta_ruta();

comment on column public.presupuesto_cuenta.ruta is
  'Path materializado (ej. ''0003.0012'') — orden de despliegue y ancestría sin recursión. '
  'Reparentar u ordenar una cuenta con hijos propaga correctamente a sus descendientes vía '
  'propagar_presupuesto_cuenta_ruta (20260823210000/20260823220000).';
