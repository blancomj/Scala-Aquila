-- Permite reemplazar un coeficiente_sets vigente por una versión nueva.
--
-- Gap real documentado en stores/coeficientes.ts: guard_coeficiente_set_inmutable
-- bloqueaba CUALQUIER update una vez que old.estado era vigente/historica, incluida
-- la propia transición vigente -> historica que activarCoeficienteSet necesita para
-- retirar la versión anterior antes de promover la nueva (el índice único parcial
-- coeficiente_sets_vigente_unico solo admite una fila vigente a la vez). En la
-- práctica esto dejaba "Activar" permanentemente roto para cualquier tenant que ya
-- tuviera una versión vigente (DUPLICATE_KEY contra coeficiente_sets_vigente_unico).
--
-- El mismo patrón existe también en presupuestos y politicas_financieras (mismo
-- comentario "gap real del esquema, no se inventa uno aquí" en sus stores) — se deja
-- sin tocar a propósito, esta migración es específica de coeficiente_sets.
create or replace function public.guard_coeficiente_set_inmutable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_COEFFICIENT_SET: el set % (versión %) es inmutable en estado % '
      '— corrige creando una versión nueva (16 §111)', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    -- Único cambio permitido sobre un set vigente: retirarlo a 'historica' (con su
    -- vigente_hasta) cuando lo reemplaza una versión nueva — todo lo demás sigue
    -- bloqueado, incluida cualquier edición de sus coeficientes ya congelados.
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.vigente_desde is distinct from old.vigente_desde
       or new.suma_total is distinct from old.suma_total then
      raise exception 'IMMUTABLE_COEFFICIENT_SET: el set % (versión %) es inmutable en estado % '
        '— corrige creando una versión nueva (16 §111)', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$function$;
