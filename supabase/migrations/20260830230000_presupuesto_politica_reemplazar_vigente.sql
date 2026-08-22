-- Mismo arreglo que 20260830220000 (coeficiente_sets), aplicado ahora a
-- presupuestos y politicas_financieras: ambos guards bloqueaban CUALQUIER
-- update una vez que old.estado era vigente, incluida la propia transición
-- que activar*() necesita para retirar la versión anterior antes de
-- promover la nueva (sus índices únicos parciales solo admiten una fila
-- vigente a la vez — presupuestos_vigente_unico por (tenant_id, anio),
-- politicas_financieras_vigente_unica por tenant_id).
--
-- Se usa una comparación por to_jsonb() en vez de listar cada columna a
-- mano — ambas tablas tienen muchas columnas (politicas_financieras 23) y
-- esto no se desactualiza si se agrega una columna nueva más adelante.

-- presupuestos: el único estado "cerrado" real es 'cerrado' (no existe un
-- 'historica' separado en presupuesto_estado_t) — retirar el vigente actual
-- es la misma transición vigente -> cerrado que ya significa "de solo
-- lectura, corregir crea una versión nueva" (DESCRIPCION_ESTADO_PRESUPUESTO).
create or replace function public.guard_presupuesto_inmutable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.estado = 'cerrado' then
    raise exception 'IMMUTABLE_BUDGET: el presupuesto % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'cerrado'
       or (to_jsonb(old) - 'estado' - 'vigente_hasta' - 'updated_at')
          is distinct from (to_jsonb(new) - 'estado' - 'vigente_hasta' - 'updated_at') then
      raise exception 'IMMUTABLE_BUDGET: el presupuesto % (versión %) es inmutable en estado % '
        '— corrige creando una versión nueva (16 §111)', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.guard_politica_inmutable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: la política % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (PLAN §4.3)', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    if new.estado is distinct from 'historica'
       or (to_jsonb(old) - 'estado' - 'vigente_hasta' - 'updated_at')
          is distinct from (to_jsonb(new) - 'estado' - 'vigente_hasta' - 'updated_at') then
      raise exception 'IMMUTABLE_POLICY: la política % (versión %) es inmutable en estado % '
        '— corrige creando una versión nueva (PLAN §4.3)', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$function$;
