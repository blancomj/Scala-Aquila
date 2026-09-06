-- ═══════════════════════════════════════════════════════════════════════
--  MANT-0 · Corrección — guard_activo_transicion no permitía "cualquiera ->
--  retirado", que es exactamente lo que dice el diagrama del propio corte
--  (MANT_00_activos_ficha_contable.md §4.3):
--
--    planificado → adquirido → instalado → en_servicio
--    en_servicio ↔ en_mantenimiento / fuera_de_servicio / en_reparacion
--    cualquiera  → retirado → dispuesto
--
--  Detectado con la suite de pruebas (no con `supabase db lint`, que no
--  puede ver una regla de negocio incompleta): retirar un activo recién
--  creado en 'planificado' (una compra planeada que se cancela antes de
--  instalarse, por ejemplo) fallaba con ACTIVO_TRANSICION_INVALIDA.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.guard_activo_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitida boolean := false;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.estado = old.estado then
    return new;
  end if;

  v_permitida := case
    when new.estado = 'retirado' then old.estado <> 'dispuesto'
    when old.estado = 'planificado'       then new.estado = 'adquirido'
    when old.estado = 'adquirido'         then new.estado = 'instalado'
    when old.estado = 'instalado'         then new.estado = 'en_servicio'
    when old.estado = 'en_servicio'       then new.estado in
      ('en_mantenimiento', 'fuera_de_servicio', 'en_reparacion')
    when old.estado = 'en_mantenimiento'  then new.estado = 'en_servicio'
    when old.estado = 'fuera_de_servicio' then new.estado = 'en_servicio'
    when old.estado = 'en_reparacion'     then new.estado = 'en_servicio'
    when old.estado = 'retirado'          then new.estado = 'dispuesto'
    else false
  end;

  if not v_permitida then
    raise exception 'ACTIVO_TRANSICION_INVALIDA: % -> % no está permitida', old.estado, new.estado;
  end if;

  insert into public.activo_estado_historial (
    tenant_id, activo_id, estado_anterior, estado_nuevo, registrado_por
  ) values (
    new.tenant_id, new.id, old.estado, new.estado, (select auth.uid())
  );

  return new;
end;
$$;

comment on function public.guard_activo_transicion() is
  'Máquina de estados del ciclo de vida físico (MANT-0 §4.3). "retirado" es alcanzable desde '
  'cualquier estado salvo "dispuesto" (el propio diagrama del corte: "cualquiera -> retirado -> '
  'dispuesto") — corregido en 20260930310000, la primera versión solo lo permitía desde '
  'en_servicio/en_mantenimiento/fuera_de_servicio/en_reparacion. Registra cada transición real '
  'en activo_estado_historial (append-only) — el INSERT inicial no genera fila de historial.';
