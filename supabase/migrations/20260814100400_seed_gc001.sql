-- ═══════════════════════════════════════════════════════════════════════
--  F2 · Seed — Golden Case GC-001
--  Propietario: paso0/INFORME_PASO_0.md §3.1-3.2
--
--  Carga en BD los datos de ENTRADA de GC-001 (copropiedad, coeficientes,
--  presupuesto, política financiera) para que F5 pueda construir un
--  DataSnapshot real contra ellos. Los importes de SALIDA (CUOTA_ADMIN por
--  inmueble, §3.3) NO se persisten aquí — eso lo escribe la orquestación
--  de F5 la primera vez que liquida el periodo, no un seed.
--
--  GAP abierto: PARAMETER.OTROS_INGRESOS_ANUAL (20.000.000 COP en GC-001)
--  no tiene columna en el esquema de `presupuestos` (PLAN §4.3 solo define
--  monto_total y presupuesto_rubros, que son GASTO, no ingreso). No se
--  inventa una columna aquí — F5 debe decidir cómo su ExecutionContext
--  resuelve ese PARAMETER (¿tabla nueva de ingresos? ¿campo en políticas?)
--  antes de poder ejecutar CUOTA_BASICA.ael contra datos reales.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_tenant_id       uuid;
  v_presupuesto_id  uuid;
  v_set_id          uuid;
  v_inmueble_101    uuid;
  v_inmueble_102    uuid;
  v_inmueble_201    uuid;
  v_inmueble_202    uuid;
  v_inmueble_301    uuid;
  v_inmueble_302    uuid;
  v_mes             int;
begin
  insert into public.tenants (name, slug, moneda, zona_horaria)
  values ('Copropiedad GC-001 (demo)', 'gc-001', 'COP', 'America/Bogota')
  returning id into v_tenant_id;

  -- ── Política financiera vigente — paso0/INFORME_PASO_0.md §3.1:
  -- "Política: HALF_UP · escala 0 · mayor resto · desempate id ASC" ──────
  -- policy_hash: placeholder — el cálculo real sobre contenido canónico
  -- (19 §73) todavía no existe como función; se sustituye cuando exista.
  insert into public.politicas_financieras (
    tenant_id, version, estado, vigente_desde,
    redondeo_modo, redondeo_escala, residual_metodo,
    coeficientes_suma_esperada, policy_hash
  ) values (
    v_tenant_id, 1, 'vigente', date '2026-01-01',
    'half_up', 0, 'mayor_resto',
    1.0, 'PENDIENTE-policy_hash-real-19§73'
  );

  -- ── Presupuesto anual — 120.000.000 COP (acta 001-2026) ────────────────
  insert into public.presupuestos (
    tenant_id, anio, version, estado, monto_total, acta_asamblea, fecha_aprobacion,
    vigente_desde
  ) values (
    v_tenant_id, 2026, 1, 'borrador', 120000000.00, 'Acta 001-2026', date '2025-12-01',
    date '2026-01-01'
  )
  returning id into v_presupuesto_id;

  -- Rubros de ejemplo (GC-001 no fija el desglose, solo el total) — deben
  -- reconciliar exactamente con monto_total para poder aprobar el presupuesto.
  insert into public.presupuesto_rubros (tenant_id, presupuesto_id, codigo, nombre, categoria, monto_anual)
  values
    (v_tenant_id, v_presupuesto_id, 'ADMIN',  'Administración',       'administracion',      60000000.00),
    (v_tenant_id, v_presupuesto_id, 'VIG',    'Vigilancia',           'vigilancia',           30000000.00),
    (v_tenant_id, v_presupuesto_id, 'ASEO',   'Aseo',                 'aseo',                 15000000.00),
    (v_tenant_id, v_presupuesto_id, 'MANT',   'Mantenimiento',        'mantenimiento',        10000000.00),
    (v_tenant_id, v_presupuesto_id, 'SSPP',   'Servicios públicos',   'servicios_publicos',    3000000.00),
    (v_tenant_id, v_presupuesto_id, 'SEG',    'Seguros',              'seguros',                2000000.00);

  update public.presupuestos set estado = 'aprobado' where id = v_presupuesto_id;
  update public.presupuestos set estado = 'vigente'  where id = v_presupuesto_id;

  -- ── Inmuebles — paso0/INFORME_PASO_0.md §3.1 ────────────────────────────
  insert into public.inmuebles (tenant_id, codigo, tipo, area_privada)
  values (v_tenant_id, 'INM-101', 'apartamento', 75.50) returning id into v_inmueble_101;
  insert into public.inmuebles (tenant_id, codigo, tipo, area_privada)
  values (v_tenant_id, 'INM-102', 'apartamento', 75.50) returning id into v_inmueble_102;
  insert into public.inmuebles (tenant_id, codigo, tipo, area_privada)
  values (v_tenant_id, 'INM-201', 'apartamento', 82.30) returning id into v_inmueble_201;
  insert into public.inmuebles (tenant_id, codigo, tipo, area_privada)
  values (v_tenant_id, 'INM-202', 'apartamento', 82.30) returning id into v_inmueble_202;
  insert into public.inmuebles (tenant_id, codigo, tipo, area_privada)
  values (v_tenant_id, 'INM-301', 'apartamento', 95.00) returning id into v_inmueble_301;
  insert into public.inmuebles (tenant_id, codigo, tipo, area_privada)
  values (v_tenant_id, 'INM-302', 'apartamento', 95.00) returning id into v_inmueble_302;

  -- Zona común — R6: no produce línea de liquidación.
  insert into public.zonas_comunes (tenant_id, codigo, nombre, tipo)
  values (v_tenant_id, 'ZC-001', 'Piscina', 'recreativa');

  -- ── Coeficientes — paso0/INFORME_PASO_0.md §3.1, Σ = 1.0000000000 ──────
  insert into public.coeficiente_sets (tenant_id, version, vigente_desde, estado, suma_total)
  values (v_tenant_id, 1, date '2026-01-01', 'borrador', 1.0000000000)
  returning id into v_set_id;

  insert into public.coeficientes (tenant_id, set_id, inmueble_id, valor)
  values
    (v_tenant_id, v_set_id, v_inmueble_101, 0.1500000000),
    (v_tenant_id, v_set_id, v_inmueble_102, 0.1500000000),
    (v_tenant_id, v_set_id, v_inmueble_201, 0.1650000000),
    (v_tenant_id, v_set_id, v_inmueble_202, 0.1650000000),
    (v_tenant_id, v_set_id, v_inmueble_301, 0.1850000000),
    (v_tenant_id, v_set_id, v_inmueble_302, 0.1850000000);

  update public.coeficiente_sets set estado = 'vigente' where id = v_set_id;

  -- ── Periodos — ejercicio 2026, los 12 meses, todos abiertos ────────────
  for v_mes in 1..12 loop
    insert into public.periodos (tenant_id, anio, mes, estado)
    values (v_tenant_id, 2026, v_mes, 'abierto');
  end loop;

  -- ── Concepto CUOTA_ADMIN — modo distribución (PLAN §4.3.2) ─────────────
  -- formula_ael = paso0/reglas/CUOTA_BASICA.ael: calcula el TOTAL anual a
  -- recuperar; el reparto por inmueble lo hace el motor de allocation (19),
  -- nunca la fórmula (regla vinculante de §4.3.2).
  insert into public.conceptos (tenant_id, codigo, nombre, tipo_base, modo_calculo, formula_ael, prioridad, estado)
  values (
    v_tenant_id, 'CUOTA_ADMIN', 'Cuota de administración', 'coeficiente', 'distribucion',
    E'REGLA CUOTA_BASICA\n' ||
    E'DEFINIR presupuesto_anual = PARAMETER.PRESUPUESTO_ANUAL\n' ||
    E'DEFINIR otros_ingresos_anual = PARAMETER.OTROS_INGRESOS_ANUAL\n' ||
    E'RETORNAR presupuesto_anual - otros_ingresos_anual',
    100,
    'activo'
  );

  -- ── Fondo de imprevistos — sin movimientos aún ──────────────────────────
  insert into public.fondos (tenant_id, tipo, nombre, saldo_actual)
  values (v_tenant_id, 'imprevistos', 'Fondo de imprevistos', 0);
end $$;
