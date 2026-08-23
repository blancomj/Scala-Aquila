-- Cierra la deuda documentada desde antes de F6 (comment de
-- 20260814100100_domain_tables.sql, zonas_comunes: "un mismo bien nunca
-- existe en las dos tablas [inmuebles / zonas_comunes] debe validarse por
-- constraint, no solo por convención") y anotada de nuevo en
-- PLAN_DATOS_REALES.md línea 76-82.
--
-- La clave de identidad elegida es la matrícula inmobiliaria: es el único
-- identificador real de un predio en Colombia, compartido sin ambigüedad
-- entre "inmueble propiedad privada" (forma A, §4.3.1) y "bien común con
-- folio propio" (forma B) — un mismo folio no puede ser las dos cosas a la
-- vez. La mayoría de zonas comunes (piscina, salón social, escaleras) no
-- tienen matrícula propia, por eso la columna es nullable y el guard solo
-- actúa cuando sí se captura una.
--
-- No es un constraint único cruzado (Postgres no lo permite entre tablas
-- distintas) sino un guard en cada tabla que consulta la otra — mismo
-- criterio que guard_zona_comun_esencial_sin_uso_exclusivo.
alter table public.zonas_comunes
  add column matricula_inmobiliaria text;

create function public.guard_bien_matricula_no_duplicada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.matricula_inmobiliaria is null then
    return new;
  end if;

  if tg_table_name = 'zonas_comunes' then
    if exists (
      select 1 from public.inmuebles
      where tenant_id = new.tenant_id
        and matricula_inmobiliaria = new.matricula_inmobiliaria
    ) then
      raise exception
        'BIEN_MATRICULA_DUPLICADA: la matrícula % ya está registrada como inmueble',
        new.matricula_inmobiliaria;
    end if;
  else
    if exists (
      select 1 from public.zonas_comunes
      where tenant_id = new.tenant_id
        and matricula_inmobiliaria = new.matricula_inmobiliaria
    ) then
      raise exception
        'BIEN_MATRICULA_DUPLICADA: la matrícula % ya está registrada como zona común',
        new.matricula_inmobiliaria;
    end if;
  end if;

  return new;
end;
$$;

create trigger guard_zona_comun_matricula_no_duplicada
  before insert or update of matricula_inmobiliaria, tenant_id on public.zonas_comunes
  for each row execute function public.guard_bien_matricula_no_duplicada();

create trigger guard_inmueble_matricula_no_duplicada
  before insert or update of matricula_inmobiliaria, tenant_id on public.inmuebles
  for each row execute function public.guard_bien_matricula_no_duplicada();
