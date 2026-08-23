-- Completa el catálogo de zonas_comunes para poder gestionarlo desde la UI
-- (hoy solo existía schema+RLS, sin ningún CRUD — ver PLAN_DATOS_REALES.md
-- línea 28). Dos columnas nuevas, mismo criterio que `agrupaciones`:
--
--  - `descripcion`: nota libre opcional (igual que agrupaciones.descripcion).
--  - `activa`: baja lógica en vez de borrado — un bien que se demuele o se
--    independiza no debe desaparecer del histórico si ya tuvo asignación.
--  - `es_esencial`: distinción legal real (Ley 675/2001 Art. 19-20). Un bien
--    común ESENCIAL (estructura, fachada, escaleras, redes principales)
--    nunca puede asignarse en uso exclusivo a un inmueble — solo los NO
--    esenciales admiten esa figura. El guard de abajo lo hace cumplir en
--    vez de confiar en que quien captura el dato lo recuerde.
alter table public.zonas_comunes
  add column descripcion  text,
  add column activa       boolean not null default true,
  add column es_esencial  boolean not null default false;

create function public.guard_zona_comun_esencial_sin_uso_exclusivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.es_esencial and new.uso_exclusivo_inmueble_id is not null then
    raise exception
      'ZONA_COMUN_ESENCIAL_SIN_USO_EXCLUSIVO: un bien común esencial (%) no puede '
      'asignarse en uso exclusivo a un inmueble', new.nombre;
  end if;
  return new;
end;
$$;

create trigger guard_zona_comun_esencial_sin_uso_exclusivo
  before insert or update of es_esencial, uso_exclusivo_inmueble_id on public.zonas_comunes
  for each row execute function public.guard_zona_comun_esencial_sin_uso_exclusivo();
