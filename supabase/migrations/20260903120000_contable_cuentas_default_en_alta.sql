-- ═══════════════════════════════════════════════════════════════════════
--  PC-3c · La parametrización contable se siembra en el alta, no en un
--          backfill de una sola vez
--
--  ═══ El hueco ═══
--
--  PC-3 (20260830460000) dejó dos puentes poblados con sendos bloques de
--  UPDATE/INSERT sueltos al final de la migración: el mapa evento ->
--  cuenta (contable_cuenta_default) y el mapa cuenta presupuestal ->
--  cuenta contable (presupuesto_cuenta.contable_cuenta_id). Ambos bloques
--  corrieron una única vez, sobre los tenants que existían ese día.
--
--  create_tenant() nunca los aprendió: siembra el árbol presupuestal
--  (fn_instanciar_presupuesto_cuenta), el plan de cuentas
--  (fn_instanciar_plan_contable) y los conceptos (fn_instanciar_conceptos),
--  y ahí se detiene. Toda copropiedad creada DESPUÉS de PC-3 nace con 145
--  cuentas contables y cero forma de llegar a ellas.
--
--  Verificado contra desarrollo antes de escribir esto, no supuesto:
--
--    • Simulación de create_tenant() en una transacción revertida →
--      145 cuentas contables, 0 filas en contable_cuenta_default,
--      55 hojas presupuestales sin cuenta contable, y
--      contable_parametrizacion_pendiente() con 75 filas
--      (20 evento_contable + 55 cuenta_presupuestal).
--
--    • "Conjunto Residencial Los Lareles" (alta real por UI el 2026-08-26
--      20:40) tiene sus 145 cuentas contables creadas en el mismo instante
--      del alta, pero sus 19 cuentas predeterminadas fechadas el 2026-08-27
--      12:06 — quince horas después, por una corrida manual fuera de
--      migración. Es exactamente el síntoma: el alta no lo hace, y hubo que
--      repararlo a mano para poder liquidar.
--
--  Consecuencia si no se corrige: contable_movimientos() devuelve
--  cuenta_codigo NULL en todas las líneas de esa copropiedad y
--  contable_cuadre() reporta sin_cuenta = número total de líneas.
--
--  ═══ La corrección ═══
--
--  Los dos bloques sueltos de PC-3 se convierten en funciones con el mismo
--  contrato que fn_instanciar_plan_contable (PC-2): idempotentes, SECURITY
--  INVOKER, una copropiedad por llamada, devuelven cuánto hicieron. Con eso
--  sirven simultáneamente para el alta y para el backfill, que es
--  justamente la propiedad que a PC-3 le faltaba.
--
--    fn_instanciar_cuentas_default()      evento contable -> cuenta
--    fn_instanciar_puentes_presupuesto()  cuenta presupuestal -> cuenta
--
--  Los mapas son los de PC-3 verbatim, más lo que se le agregó después:
--  ANTICIPO_COPROPIETARIO -> 2605 (RC-1, 20260903110000), las 12 cuentas de
--  ingreso de PC-3b (20260830470000) y egr_energia_torres -> 5405, que es
--  hoja en la plantilla PC-2b/PC-2c aunque en GC-001 sea el padre de las 19
--  torres. Sin esa última, una copropiedad nueva nacería con una hoja sin
--  clasificar de las 55.
--
--  Por qué SECURITY INVOKER, igual que PC-2: los INSERT/UPDATE pasan por
--  contable_cuenta_default_insert_auxiliar y por la policy de
--  presupuesto_cuenta tal cual; la autorización la resuelve RLS y no hay
--  que reimplementarla dentro de la función. Llamadas desde create_tenant()
--  (SECURITY DEFINER) corren con el rol del definidor, igual que ya lo hace
--  fn_instanciar_plan_contable.
--
--  Los dos filtros defensivos que PC-3 no tenía: la cuenta destino debe
--  seguir siendo de movimiento y estar activa. Si una copropiedad abrió
--  auxiliares bajo 1305, su 1305 dejó de admitir movimiento
--  (guard_contable_cuenta_arbol) y el guard del mapa rechazaría la fila
--  ABORTANDO el backfill entero — el trigger BEFORE corre antes de que
--  ON CONFLICT DO NOTHING pueda salvar nada. Con el filtro, esa cuenta
--  simplemente no se mapea sola y queda reportada en
--  contable_parametrizacion_pendiente() para que la copropiedad elija su
--  auxiliar. Hoy ninguna copropiedad de desarrollo está en ese caso
--  (verificado: las 20 cuentas objetivo existen, activas y de movimiento,
--  en las 8 copropiedades con plan contable).
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
--  1. Cuentas predeterminadas por evento contable
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_cuentas_default(p_tenant_id uuid)
returns table (creadas integer, existentes integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_creadas integer := 0;
  v_total   integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  insert into public.contable_cuenta_default (tenant_id, evento_id, contable_cuenta_id)
  select p_tenant_id, lt.id, cc.id
  from (values
    ('CARTERA_CUOTA_ORDINARIA','1305'),      ('CARTERA_CUOTA_EXTRAORDINARIA','1310'),
    ('CARTERA_FONDO_IMPREVISTOS','1315'),    ('CARTERA_INTERES_MORA','1320'),
    ('CARTERA_MULTA','1325'),                ('CARTERA_OTROS','1330'),
    ('INGRESO_CUOTA_ORDINARIA','4105'),      ('INGRESO_CUOTA_EXTRAORDINARIA','4110'),
    ('INGRESO_FONDO_IMPREVISTOS','4115'),    ('INGRESO_INTERES_MORA','4205'),
    ('INGRESO_MULTA','4505'),                ('BANCO_RECAUDO','111005'),
    ('CAJA_GENERAL','110505'),               ('PROVEEDOR_BIENES','2205'),
    ('PROVEEDOR_SERVICIOS','2210'),          ('FONDO_IMPREVISTOS_EFECTIVO','111015'),
    ('DETERIORO_CARTERA','1399'),            ('GASTO_DETERIORO_CARTERA','5915'),
    ('RESULTADO_EJERCICIO','3310'),          ('ANTICIPO_COPROPIETARIO','2605')
  ) as m(evento, codigo_contable)
  -- Solo el catálogo global: un evento que una copropiedad haya creado para sí misma no tiene
  -- cuenta canónica que adivinar, y contable_parametrizacion_pendiente() ya lo reporta.
  join public.lista_tipos lt
    on lt.tipo = 'EVENTO_CONTABLE' and lt.codigo = m.evento
   and lt.tenant_id is null and lt.activo
  join public.contable_cuenta cc
    on cc.tenant_id = p_tenant_id and cc.codigo = m.codigo_contable
   and cc.permite_movimiento and cc.activa
  on conflict (tenant_id, evento_id) do nothing;

  get diagnostics v_creadas = row_count;

  select count(*) into v_total
  from public.contable_cuenta_default where tenant_id = p_tenant_id;

  return query select v_creadas, (v_total - v_creadas)::integer;
end;
$$;

comment on function public.fn_instanciar_cuentas_default(uuid) is
  'Siembra el mapa evento contable -> cuenta (contable_cuenta_default, PC-3) de una '
  'copropiedad con las cuentas canónicas del PUC PH. Idempotente: ON CONFLICT DO NOTHING por '
  '(tenant_id, evento_id), así que nunca pisa una cuenta que la copropiedad haya reasignado. '
  'Solo mapea contra cuentas que existan, estén activas y admitan movimiento — si la '
  'copropiedad abrió auxiliares bajo la cuenta canónica, ese evento queda sin mapear y lo '
  'reporta contable_parametrizacion_pendiente(). SECURITY INVOKER: la autorización la resuelve '
  'la policy contable_cuenta_default_insert_auxiliar. Devuelve cuántas creó y cuántas ya '
  'estaban.';

-- ═══════════════════════════════════════════════════════════════════════
--  2. Puente cuenta presupuestal -> cuenta contable
--
--  Punto de partida verificable, no decisión contable cerrada: cada
--  copropiedad puede reasignar lo que quiera desde la UI de PC-6 — mismo
--  criterio con el que PC-3 sembró este mapa la primera vez.
-- ═══════════════════════════════════════════════════════════════════════

create function public.fn_instanciar_puentes_presupuesto(p_tenant_id uuid)
returns table (mapeadas integer, sin_mapear integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mapeadas integer := 0;
  v_sin      integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'TENANT_INEXISTENTE: %', p_tenant_id;
  end if;

  update public.presupuesto_cuenta pc
  set contable_cuenta_id = cc.id
  from (values
    -- egresos (PC-3)
    ('egr_administrador','5105'), ('egr_revisoria_fiscal','5110'),
    ('egr_contador_publico','5115'), ('egr_asesoria_juridica','5120'),
    ('vigilancia','5205'), ('egr_aseo','5305'),
    ('egr_elementos_aseo','5310'), ('egr_elementos_cafeteria','5310'),
    ('egr_mant_jardin','5320'),
    -- Hoja en la plantilla global; en GC-001 es el padre de las 19 torres, que se mapean una
    -- por una abajo. Las dos formas conviven porque el mapa es por código, no por posición.
    ('egr_energia_torres','5405'),
    ('egr_torre_1','5405'),  ('egr_torre_2','5405'),  ('egr_torre_3','5405'),
    ('egr_torre_4','5405'),  ('egr_torre_5','5405'),  ('egr_torre_6','5405'),
    ('egr_torre_7','5405'),  ('egr_torre_8','5405'),  ('egr_torre_9','5405'),
    ('egr_torre_10','5405'), ('egr_torre_11','5405'), ('egr_torre_12','5405'),
    ('egr_torre_13','5405'), ('egr_torre_14','5405'), ('egr_torre_15','5405'),
    ('egr_torre_16','5405'), ('egr_torre_17','5405'), ('egr_torre_18','5405'),
    ('egr_torre_19','5405'), ('egr_zonas_comunes','5405'),
    ('egr_acueducto','5410'), ('egr_telefono','5420'),
    ('egr_mant_bomba','5510'), ('egr_mant_planta','5520'),
    ('egr_instalaciones_electricas','5525'), ('egr_suministros_electricos','5525'),
    ('egr_mant_zonas_comunes','5530'), ('egr_cerramiento_conjunto','5530'),
    ('egr_mant_camara_video','5535'), ('egr_mant_puertas','5535'),
    ('egr_seguros','5605'), ('egr_gastos_legales','5705'), ('egr_gastos_asamblea','5710'),
    ('egr_papeleria_fotocopias','5805'), ('egr_gastos_bancarios','5820'),
    ('egr_taxis_buses','5825'), ('egr_impuestos_asumidos','5830'),
    ('egr_intereses_mora','5835'),
    ('egr_actividades_conjunto','5890'), ('egr_combustibles_lubricantes','5890'),
    ('egr_otros_servicios','5890'), ('egr_otros_gastos_diversos','5890'),
    ('egr_gastos_diversos','5890'), ('egr_gastos_ejercicios_anteriores','5890'),
    ('egr_amortizaciones','5910'),
    -- cuentas legacy planas del backfill E8 (categorías de lista_tipos)
    ('administracion','5105'), ('aseo','5305'), ('mantenimiento','5590'),
    ('servicios_publicos','5405'), ('seguros','5605'), ('otros','5890'),
    -- ingresos (PC-3)
    ('cuotas_administracion','4105'), ('ing_alquiler_salon','4305'),
    ('ing_usufructo_vehiculos','4310'), ('ing_usufructo_motos','4310'),
    ('ing_bicicletero','4310'), ('ing_energia_salon','4320'),
    ('ing_otros_operacionales','4690'),
    -- ingresos que cerró PC-3b (20260830470000)
    ('ing_fondo_imprevistos','4115'), ('ing_intereses_demora','4205'),
    ('ing_alquiler_salon_disponible','4305'), ('ing_usufructo_zona_comun','4310'),
    ('ing_sancion_inasistencia','4505'), ('ing_financieros','4605'),
    ('ing_reintegro_gastos','4610'),
    ('ing_descuento_pronto_pago','4695'), ('ing_descuentos_concedidos','4695'),
    ('ing_ajuste_peso','4690'), ('ing_aprovechamientos','4690'),
    ('ing_ingresos_ejercicios_anteriores','4690')
  ) as m(codigo_presupuestal, codigo_contable),
  public.contable_cuenta cc
  where cc.tenant_id = p_tenant_id
    and cc.codigo = m.codigo_contable
    and cc.permite_movimiento
    and cc.activa
    and pc.tenant_id = p_tenant_id
    and pc.codigo = m.codigo_presupuestal
    and pc.es_hoja
    -- Nunca pisa una clasificación existente: lo que la copropiedad ya decidió, manda.
    and pc.contable_cuenta_id is null;

  get diagnostics v_mapeadas = row_count;

  select count(*) into v_sin
  from public.presupuesto_cuenta
  where tenant_id = p_tenant_id and es_hoja and activa and contable_cuenta_id is null;

  return query select v_mapeadas, v_sin;
end;
$$;

comment on function public.fn_instanciar_puentes_presupuesto(uuid) is
  'Clasifica contablemente las hojas del árbol presupuestal de una copropiedad '
  '(presupuesto_cuenta.contable_cuenta_id, PC-3) con el mapa por código del PUC PH. '
  'Idempotente: solo toca hojas con contable_cuenta_id NULL, así que nunca pisa una '
  'reasignación hecha desde la UI. Cubre tanto los códigos de la plantilla global (PC-2b/PC-2c) '
  'como los del árbol histórico de GC-001 y los códigos planos legacy de E8. SECURITY INVOKER. '
  'Devuelve cuántas mapeó y cuántas hojas activas siguen sin clasificar — ese segundo número es '
  'el que debe llegar a cero antes de emitir información contable.';

-- ═══════════════════════════════════════════════════════════════════════
--  3. create_tenant() — el alta deja la copropiedad parametrizada
--
--  Orden obligado: los dos puentes necesitan que el plan de cuentas y el
--  árbol presupuestal ya existan, así que van después de
--  fn_instanciar_plan_contable y de fn_instanciar_presupuesto_cuenta.
--  Todo en la misma transacción del alta: o nace completa, o no nace.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.create_tenant(p_name text, p_slug text)
returns public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant public.tenants;
begin
  if (select auth.uid()) is null then
    raise exception 'UNAUTHENTICATED: se requiere sesión para crear una copropiedad';
  end if;

  insert into public.tenants (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), (select auth.uid()))
  returning * into v_tenant;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id)
  values (v_tenant.id, (select auth.uid()), 'tenant.created', 'tenant', v_tenant.id);

  insert into public.memberships (user_id, tenant_id, role, status)
  values ((select auth.uid()), v_tenant.id, 'administrador', 'active');

  -- PC-2b/PC-2c: siembra los árboles presupuestal y contable. Conceptos depende de
  -- presupuesto_cuenta (ADMINISTRACION se liga a cuotas_administracion por código), así que
  -- tiene que ir después de fn_instanciar_presupuesto_cuenta, en la misma transacción de alta.
  perform public.fn_instanciar_presupuesto_cuenta(v_tenant.id);
  perform public.fn_instanciar_plan_contable(v_tenant.id);
  -- PC-3c: y los dos puentes entre ambos árboles, sin los cuales toda la contabilidad
  -- proyectada de la copropiedad saldría sin cuenta.
  perform public.fn_instanciar_cuentas_default(v_tenant.id);
  perform public.fn_instanciar_puentes_presupuesto(v_tenant.id);
  perform public.fn_instanciar_conceptos(v_tenant.id);

  update public.profiles
  set active_tenant_id = v_tenant.id
  where id = (select auth.uid());

  return v_tenant;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN: ya existe una copropiedad con ese slug';
  when check_violation then
    raise exception 'SLUG_INVALID: el nombre o el slug no cumplen el formato requerido';
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
--  4. Backfill — las copropiedades que quedaron sin mapa
--
--  Mismo alcance que el sembrado original de PC-3: "cada copropiedad que
--  ya tenga plan contable". Una copropiedad sin plan de cuentas no tiene
--  contra qué mapear; recibirá ambos puentes cuando corra
--  fn_instanciar_plan_contable — las que hay así en desarrollo son tenants
--  de prueba creados por inserción directa en `tenants`, que nunca pasaron
--  por create_tenant().
--
--  Idempotente por construcción de las dos funciones, así que una
--  copropiedad ya parametrizada (todas las que arrastró el backfill de
--  PC-3 en su momento) no cambia en nada.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select distinct tenant_id from public.contable_cuenta
  loop
    perform public.fn_instanciar_cuentas_default(v_tenant);
    perform public.fn_instanciar_puentes_presupuesto(v_tenant);
  end loop;
end $$;
