-- ═══════════════════════════════════════════════════════════════════════
--  CO-5 · Estado de cambios en el patrimonio (ECP) y Estado de flujos de
--  efectivo (EFE) — exclusivos de Grupo 2 (DUR 2420 anexo Grupo 2).
--
--  Ambos usan modo_valor='variacion': el motor (próxima migración) distingue cuenta nominal
--  (clase 4/5 — movimiento del periodo, igual que ER) de cuenta real (clase 1/2/3 — cambio de
--  saldo acumulado entre inicio y fin de ejercicio) según la clase de las cuentas que matchea
--  cada selector_cuentas — no es un tercer modo inventado sin fundamento, es la distinción
--  contable estándar entre cuentas temporales y permanentes.
--
--  EFE §3/§4.2 (vinculante, prueba 8): el traslado 111005↔111015 (banco↔fondo de imprevistos,
--  ambos dentro de la cuenta 11) NUNCA debe verse como flujo. Se logra por construcción: ninguna
--  línea de actividad (operación/inversión/financiación) selecciona la cuenta 11 — solo aparece
--  en la línea de conciliación de apertura/cierre de efectivo, que es la que se está
--  reconciliando, no una actividad generadora de flujo.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  v_plantilla_id uuid;
begin
  -- ── ECP ──────────────────────────────────────────────────────────────
  insert into public.contable_estado_plantilla (codigo, nombre, marco_grupo, modo_valor)
  values ('estado_cambios_patrimonio', 'Estado de cambios en el patrimonio', 'grupo_2', 'variacion')
  returning id into v_plantilla_id;

  insert into public.contable_estado_linea
    (plantilla_id, codigo, orden, nivel, etiqueta, tipo_linea, selector_cuentas, signo, formula, nota_referencia, momento)
  values
    (v_plantilla_id, 'patrimonio_social_inicio', 10, 2, 'Patrimonio social — saldo inicial', 'detalle', '31', 1, null, 9, 'inicio'),
    (v_plantilla_id, 'patrimonio_social_movimiento', 20, 2, 'Patrimonio social — movimiento del ejercicio', 'detalle', '31', 1, null, 9, null),
    (v_plantilla_id, 'patrimonio_social_fin', 30, 2, 'Patrimonio social — saldo final', 'total', null, 1,
      'patrimonio_social_inicio+patrimonio_social_movimiento', 9, null),

    (v_plantilla_id, 'resultados_anteriores_inicio', 40, 2, 'Resultados de ejercicios anteriores — saldo inicial', 'detalle', '33', 1, null, 9, 'inicio'),
    (v_plantilla_id, 'resultados_anteriores_movimiento', 50, 2, 'Resultados de ejercicios anteriores — movimiento del ejercicio', 'detalle', '33', 1, null, 9, null),
    (v_plantilla_id, 'resultados_anteriores_fin', 60, 2, 'Resultados de ejercicios anteriores — saldo final', 'total', null, 1,
      'resultados_anteriores_inicio+resultados_anteriores_movimiento', 9, null),

    -- 'resultado_ejercicio': codigo reservado, inyectado por la función (igual que en ESF/ER).
    -- Un excedente del ejercicio siempre arranca en cero al inicio de un ejercicio nuevo — no
    -- tiene saldo de arrastre propio, por eso su línea "_inicio" es la constante 0, no un selector.
    (v_plantilla_id, 'resultado_ejercicio_inicio', 70, 2, 'Excedente (déficit) del ejercicio — saldo inicial', 'calculada', null, 1, '0', 9, null),
    (v_plantilla_id, 'resultado_ejercicio', 80, 2, 'Excedente (déficit) del ejercicio — movimiento', 'calculada', null, 1, 'resultado_ejercicio_inyectado', 9, null),
    (v_plantilla_id, 'resultado_ejercicio_fin', 90, 2, 'Excedente (déficit) del ejercicio — saldo final', 'total', null, 1,
      'resultado_ejercicio_inicio+resultado_ejercicio', 9, null),

    (v_plantilla_id, 'total_patrimonio_inicio', 100, 1, 'TOTAL PATRIMONIO — saldo inicial', 'total', null, 1,
      'patrimonio_social_inicio+resultados_anteriores_inicio+resultado_ejercicio_inicio', null, null),
    (v_plantilla_id, 'total_patrimonio_movimiento', 110, 1, 'TOTAL PATRIMONIO — movimiento del ejercicio', 'total', null, 1,
      'patrimonio_social_movimiento+resultados_anteriores_movimiento+resultado_ejercicio', null, null),
    (v_plantilla_id, 'total_patrimonio_fin', 120, 1, 'TOTAL PATRIMONIO — saldo final', 'total', null, 1,
      'patrimonio_social_fin+resultados_anteriores_fin+resultado_ejercicio_fin', null, null);

  -- ── EFE (método indirecto) ───────────────────────────────────────────
  insert into public.contable_estado_plantilla (codigo, nombre, marco_grupo, modo_valor)
  values ('estado_flujos_efectivo', 'Estado de flujos de efectivo', 'grupo_2', 'variacion')
  returning id into v_plantilla_id;

  insert into public.contable_estado_linea
    (plantilla_id, codigo, orden, nivel, etiqueta, tipo_linea, selector_cuentas, signo, formula, nota_referencia, momento)
  values
    (v_plantilla_id, 'operacion_titulo', 10, 1, 'Actividades de operación', 'grupo', null, 1, null, null, null),
    -- codigo reservado, inyectado por la función.
    (v_plantilla_id, 'resultado_ejercicio', 20, 2, 'Excedente (déficit) del ejercicio', 'calculada', null, 1, 'resultado_ejercicio_inyectado', 9, null),
    (v_plantilla_id, 'efe_deterioro_no_monetario', 30, 2, 'Más: deterioro de cartera (partida no monetaria)', 'detalle', '5915', 1, null, 6, null),
    (v_plantilla_id, 'efe_variacion_cxc', 40, 2, 'Variación en cuentas por cobrar', 'detalle', '13', -1, null, 6, null),
    (v_plantilla_id, 'efe_variacion_proveedores', 50, 2, 'Variación en proveedores y contratistas', 'detalle', '22', 1, null, 8, null),
    (v_plantilla_id, 'efe_variacion_cxp', 60, 2, 'Variación en cuentas por pagar', 'detalle', '23', 1, null, 8, null),
    (v_plantilla_id, 'efectivo_operacion', 70, 1, 'Efectivo neto de actividades de operación', 'subtotal', null, 1,
      'resultado_ejercicio+efe_deterioro_no_monetario+efe_variacion_cxc+efe_variacion_proveedores+efe_variacion_cxp', null, null),

    (v_plantilla_id, 'inversion_titulo', 100, 1, 'Actividades de inversión', 'grupo', null, 1, null, null, null),
    (v_plantilla_id, 'efe_variacion_ppe', 110, 2, 'Variación en propiedad, planta y equipo', 'detalle', '15', -1, null, 7, null),
    (v_plantilla_id, 'efe_variacion_intangibles', 120, 2, 'Variación en activos intangibles', 'detalle', '16', -1, null, null, null),
    (v_plantilla_id, 'efectivo_inversion', 130, 1, 'Efectivo neto de actividades de inversión', 'subtotal', null, 1,
      'efe_variacion_ppe+efe_variacion_intangibles', null, null),

    (v_plantilla_id, 'financiacion_titulo', 200, 1, 'Actividades de financiación', 'grupo', null, 1, null, null, null),
    (v_plantilla_id, 'efe_variacion_obligaciones_financieras', 210, 2, 'Variación en obligaciones financieras', 'detalle', '21', 1, null, null, null),
    (v_plantilla_id, 'efectivo_financiacion', 220, 1, 'Efectivo neto de actividades de financiación', 'subtotal', null, 1,
      'efe_variacion_obligaciones_financieras', null, null),

    (v_plantilla_id, 'variacion_neta_efectivo', 300, 1, 'Aumento (disminución) neto de efectivo', 'total', null, 1,
      'efectivo_operacion+efectivo_inversion+efectivo_financiacion', null, null),
    -- Único lugar donde aparece la cuenta 11 (efectivo, incluye 111005 Y 111015) — el traslado
    -- entre ambas nunca es una línea de actividad, así que nunca puede verse como flujo (§4.2
    -- prueba 8). El saldo final se calcula sumando la variación neta al inicial (formula), no
    -- releyendo la cuenta 11 en fecha_corte — así la conciliación cuadra por construcción.
    (v_plantilla_id, 'efectivo_inicio_ejercicio', 310, 1, 'Efectivo y equivalentes al inicio del ejercicio', 'detalle', '11', 1, null, 4, 'inicio'),
    (v_plantilla_id, 'efectivo_fin_ejercicio', 320, 1, 'Efectivo y equivalentes al final del ejercicio', 'total', null, 1,
      'variacion_neta_efectivo+efectivo_inicio_ejercicio', 4, null);
end;
$$;
