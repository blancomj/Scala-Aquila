-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Fix: mant_criticidad_set no podía nunca activar una segunda
--  versión de criterios
--
--  20260930680000 reutilizó guard_politica_inmutable() tal cual (el mismo
--  guard genérico de politicas_financieras/contable_politica_deterioro).
--  Ese guard bloquea CUALQUIER update sobre una fila cuyo old.estado ya sea
--  'vigente' o 'historica' — incluida la propia transición vigente ->
--  historica que hace falta para retirar la versión anterior antes de
--  poder promover una nueva (el índice único parcial
--  mant_criticidad_set_vigente_unico solo admite una fila vigente a la
--  vez). Sin este fix, la prueba obligatoria 7 del corte ("cambiar los
--  pesos no altera las evaluaciones ya registradas con la versión
--  anterior") sería IRREALIZABLE — nunca se podría crear una segunda
--  versión vigente.
--
--  Mismo gap, ya documentado y ya resuelto en este repositorio para
--  coeficiente_sets (20260830220000_coeficiente_set_reemplazar_vigente.sql)
--  — se aplica aquí el mismo patrón: un guard dedicado que permite
--  exactamente UN cambio sobre una fila vigente (retirarla a historica,
--  con su vigente_hasta), y bloquea todo lo demás igual que antes.
--
--  No se toca guard_politica_inmutable (función compartida con otras
--  tablas fuera del alcance de este corte) ni coeficiente_sets/
--  politicas_financieras/contable_politica_deterioro — cada quien con su
--  propio guard, encontrado antes de escribir ninguna prueba, no
--  descubierto por una prueba fallida.
-- ═══════════════════════════════════════════════════════════════════════

create function public.guard_criticidad_set_inmutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.estado = 'historica' then
    raise exception 'IMMUTABLE_POLICY: el set de criticidad % (versión %) es inmutable en '
      'estado % — corrige creando una versión nueva (MANT-1 §3.3)', old.id, old.version, old.estado;
  end if;

  if old.estado = 'vigente' then
    -- Único cambio permitido sobre un set vigente: retirarlo a 'historica' (con su
    -- vigente_hasta) cuando lo reemplaza una versión nueva — mismo patrón que
    -- guard_coeficiente_set_inmutable (20260830220000). Todo lo demás sigue bloqueado,
    -- incluida cualquier edición de sus criterios/bandas ya congelados (ver
    -- guard_criticidad_set_hijo_inmutable, 20260930680000).
    if new.estado is distinct from 'historica'
       or new.version is distinct from old.version
       or new.vigente_desde is distinct from old.vigente_desde then
      raise exception 'IMMUTABLE_POLICY: el set de criticidad % (versión %) es inmutable en '
        'estado % — corrige creando una versión nueva (MANT-1 §3.3)', old.id, old.version, old.estado;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_criticidad_set_inmutable() is
  'MANT-1 §3.3: reemplaza el uso genérico de guard_politica_inmutable en mant_criticidad_set '
  '(gap real: ese guard bloqueaba también la transición vigente->historica, imposibilitando '
  'activar una segunda versión). Único cambio permitido sobre una fila vigente: retirarla a '
  'historica. Mismo patrón que guard_coeficiente_set_inmutable (20260830220000).';

drop trigger guard_politica_inmutable on public.mant_criticidad_set;

create trigger guard_criticidad_set_inmutable
  before update on public.mant_criticidad_set
  for each row execute function public.guard_criticidad_set_inmutable();
