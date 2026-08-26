-- ═══════════════════════════════════════════════════════════════════════
--  PC-2c · Nivel 3 genérico en la plantilla presupuestal
--  Propietario: conversación con el usuario, 2026-09-01 — "en una de las
--  copropiedades se implementó un modelo de Plan de cuentas presupuestal
--  bastante completo para el sector".
--
--  Contexto: PC-2b (20260830550000) sembró la plantilla global
--  (presupuesto_cuenta_plantilla) solo hasta Nivel 2, asumiendo que el
--  Nivel 3 real de GC-001 era geometría específica de ese edificio (el
--  ejemplo citado ahí: "Energía eléctrica — torres" desglosado en 19
--  cuentas, una por torre — Torre 1..19).
--
--  Verificado ahora contra el árbol real de GC-001 (90 cuentas, no las 50
--  de la plantilla): de las 40 cuentas de Nivel 3 que tiene hoy, 21 NO son
--  geometría de ese edificio — son categorías que le sirven a cualquier
--  PH (intereses de mora, descuentos concedidos, elementos de aseo,
--  gastos de asamblea, mantenimiento de zonas comunes genérico...). Solo
--  las 19 "Torre 1".."Torre 19" bajo "Energía eléctrica — torres" siguen
--  siendo específicas de GC-001 y se quedan FUERA de la plantilla — esa
--  cuenta sigue como hoja vacía en Nivel 2, cada tenant agrega sus propias
--  torres/edificios ahí a mano.
--
--  Códigos y nombres se copian tal cual de GC-001 (mismo criterio que
--  PC-2b) — no son inventados para esta migración.
--
--  Alcance:
--    • 21 filas nuevas en presupuesto_cuenta_plantilla, Nivel 3, cada una
--      resuelta contra su padre Nivel 2 por código (mismo patrón de join
--      que PC-2b usó para Nivel 2 contra Nivel 1).
--    • fn_instanciar_presupuesto_cuenta: el loop pasa de "1..2" a "1..3".
--      Único cambio real de la función — el resto del cuerpo (idempotente
--      por (tenant_id, codigo) vía ON CONFLICT DO NOTHING) ya generaliza
--      a cualquier profundidad porque cada nivel resuelve su padre contra
--      lo que el nivel anterior ya materializó en el tenant.
--    • create_tenant() NO cambia — ya llama a
--      fn_instanciar_presupuesto_cuenta(), así que todo tenant nuevo nace
--      con las 71 cuentas (50 + 21) sin ningún paso manual de onboarding.
--    • Backfill: se reejecuta la función contra TODOS los tenants
--      existentes. Idempotente — un tenant que ya tiene alguna de estas
--      21 cuentas con el mismo código (como GC-001, que las tiene con los
--      mismos códigos de origen) no la duplica; uno que solo tenía las 50
--      originales (como cualquier tenant creado entre PC-2b y hoy) recibe
--      las 21 que le faltan sin tocar nada que el tenant ya personalizó.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. Nivel 3 en la plantilla global
-- ═══════════════════════════════════════════════════════════════════════

-- El check original (PC-2b) solo admitía nivel 1-2 — la plantilla apenas
-- llegaba hasta Subgrupo. Se amplía a 1-3 para admitir el nuevo nivel de
-- detalle genérico.
alter table public.presupuesto_cuenta_plantilla
  drop constraint presupuesto_cuenta_plantilla_nivel_valido;
alter table public.presupuesto_cuenta_plantilla
  add constraint presupuesto_cuenta_plantilla_nivel_valido check (nivel in (1, 2, 3));

insert into public.presupuesto_cuenta_plantilla (parent_id, naturaleza, codigo, nombre, nivel, orden)
select p.id, v.naturaleza::public.presupuesto_cuenta_naturaleza_t, v.codigo, v.nombre, 3, v.orden
from (values
  -- ing_recuperaciones
  ('ing_recuperaciones', 'ingreso', 'ing_descuentos_concedidos',      'Descuentos concedidos',            1),
  ('ing_recuperaciones', 'ingreso', 'ing_reintegro_gastos',           'Reintegro de otros gastos',        2),
  -- ing_otras_actividades
  ('ing_otras_actividades', 'ingreso', 'ing_intereses_demora',            'Intereses por demora en el pago', 1),
  ('ing_otras_actividades', 'ingreso', 'ing_sancion_inasistencia',        'Sanción por inasistencia',        2),
  ('ing_otras_actividades', 'ingreso', 'ing_alquiler_salon_disponible',   'Alquiler salón disponible',       3),
  ('ing_otras_actividades', 'ingreso', 'ing_usufructo_zona_comun',        'Usufructo zona común',            4),
  -- ing_diversos
  ('ing_diversos', 'ingreso', 'ing_aprovechamientos',              'Aprovechamientos',                 1),
  ('ing_diversos', 'ingreso', 'ing_ajuste_peso',                   'Ajuste al peso',                    2),
  ('ing_diversos', 'ingreso', 'ing_ingresos_ejercicios_anteriores', 'Ingresos de ejercicios anteriores', 3),
  -- egr_elementos_aseo_cafeteria
  ('egr_elementos_aseo_cafeteria', 'egreso', 'egr_elementos_aseo',       'Elementos de aseo',       1),
  ('egr_elementos_aseo_cafeteria', 'egreso', 'egr_elementos_cafeteria',  'Elementos de cafetería',  2),
  -- egr_reparaciones_locativas
  ('egr_reparaciones_locativas', 'egreso', 'egr_suministros_electricos', 'Suministros eléctricos',    1),
  ('egr_reparaciones_locativas', 'egreso', 'egr_cerramiento_conjunto',   'Cerramiento del conjunto',  2),
  -- egr_gastos_representacion
  ('egr_gastos_representacion', 'egreso', 'egr_gastos_asamblea',        'Gastos asamblea',           1),
  ('egr_gastos_representacion', 'egreso', 'egr_actividades_conjunto',   'Actividades del conjunto',  2),
  -- egr_construcciones_edificaciones
  ('egr_construcciones_edificaciones', 'egreso', 'egr_mant_jardin',         'Mantenimiento jardín',          1),
  ('egr_construcciones_edificaciones', 'egreso', 'egr_mant_bomba',          'Mantenimiento bomba',           2),
  ('egr_construcciones_edificaciones', 'egreso', 'egr_mant_planta',         'Mantenimiento planta',          3),
  ('egr_construcciones_edificaciones', 'egreso', 'egr_mant_zonas_comunes',  'Mantenimiento zonas comunes',   4),
  ('egr_construcciones_edificaciones', 'egreso', 'egr_mant_camara_video',   'Mantenimiento cámara de video', 5),
  ('egr_construcciones_edificaciones', 'egreso', 'egr_mant_puertas',        'Mantenimiento puertas',         6)
) as v(padre_codigo, naturaleza, codigo, nombre, orden)
join public.presupuesto_cuenta_plantilla p on p.codigo = v.padre_codigo;

-- ═══════════════════════════════════════════════════════════════════════
--  2. fn_instanciar_presupuesto_cuenta — profundiza a Nivel 3
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.fn_instanciar_presupuesto_cuenta(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nivel   int;
  v_creadas integer := 0;
  v_lote    integer;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  -- De arriba hacia abajo: cada nivel encuentra a su padre ya materializado
  -- en el tenant por código (la plantilla resuelve el padre por su propio
  -- parent_id, no por prefijo de texto, porque el código aquí es un slug).
  for v_nivel in 1..3 loop
    insert into public.presupuesto_cuenta (tenant_id, parent_id, naturaleza, codigo, nombre, orden)
    select
      p_tenant_id,
      padre.id,
      pl.naturaleza,
      pl.codigo,
      pl.nombre,
      pl.orden
    from public.presupuesto_cuenta_plantilla pl
    left join public.presupuesto_cuenta_plantilla padre_pl on padre_pl.id = pl.parent_id
    left join public.presupuesto_cuenta padre
      on padre.tenant_id = p_tenant_id and padre.codigo = padre_pl.codigo
    where pl.nivel = v_nivel
      and (pl.parent_id is null or padre.id is not null)
    on conflict (tenant_id, codigo) do nothing;

    get diagnostics v_lote = row_count;
    v_creadas := v_creadas + v_lote;
  end loop;

  select count(*) into v_total from public.presupuesto_cuenta_plantilla;
  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_presupuesto_cuenta(uuid) is
  'Copia la plantilla global Nivel 1-3 (presupuesto_cuenta_plantilla) al árbol presupuestal de '
  'una copropiedad (PC-2b/PC-2c). Idempotente: ON CONFLICT DO NOTHING por (tenant_id, codigo). '
  'SECURITY INVOKER: la autorización la resuelve presupuesto_cuenta_insert_agent, no la función. '
  'El detalle específico de cada edificio (p. ej. energía por torre) se agrega después, a mano.';

-- ═══════════════════════════════════════════════════════════════════════
--  3. Backfill — todos los tenants existentes reciben las 21 cuentas
--     nuevas que les falten; idempotente, no toca nada más.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select id from public.tenants
  loop
    perform public.fn_instanciar_presupuesto_cuenta(v_tenant);
  end loop;
end $$;
