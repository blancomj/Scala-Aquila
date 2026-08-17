-- ═══════════════════════════════════════════════════════════════════════
--  Fix: fn_cerrar_rol_anterior / fn_cerrar_rol_anterior_tenant podían
--  violar el check constraint de fechas (*_fechas_validas: vigente_hasta
--  IS NULL OR vigente_hasta >= vigente_desde) cuando la persona nueva
--  tiene un vigente_desde ANTERIOR al vigente_desde propio de la persona
--  que se está cerrando (p. ej. un titular con fecha de inicio futura ya
--  registrado, y se agrega otro con fecha de inicio anterior a esa).
--  Reproducido en esta sesión probando fn_cerrar_rol_anterior_tenant en
--  vivo — error real 23514, no hipotético.
--
--  Fix: la fecha de cierre es GREATEST(vigente_desde de la persona nueva,
--  vigente_desde propio de la fila que se cierra) — nunca se cierra una
--  relación antes de que empezó.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_cerrar_rol_anterior(
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
  set vigente_hasta = greatest(p_vigente_desde, vigente_desde)
  where tenant_id = p_tenant_id
    and inmueble_id = p_inmueble_id
    and rol_id = p_rol_id
    and vigente_hasta is null
    and id <> p_persona_rol_id;
end;
$$;

create or replace function public.fn_cerrar_rol_anterior_tenant(
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
  set vigente_hasta = greatest(p_vigente_desde, vigente_desde)
  where tenant_id = p_tenant_id
    and rol_id = p_rol_id
    and vigente_hasta is null
    and id <> p_tenant_tercero_rol_id;
end;
$$;
