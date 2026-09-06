-- ═══════════════════════════════════════════════════════════════════════
--  CO-3 · Corrección de comentario (sin cambio de lógica) —
--  fn_contabilizar_periodo documentaba el disparador de 'sin_contrapartida'
--  como «presupuesto_ejecucion.liquidacion IS NULL, anterior a PC-4», pero
--  20260830490000 ya había purgado esas filas y puesto `liquidacion NOT
--  NULL` — ese caso es hoy irrepresentable (verificado: 0 filas con
--  liquidacion NULL en la base real). El ámbito 'movimiento_sin_contrapartida'
--  de contable_parametrizacion_pendiente() quedó como código inerte por la
--  misma razón (su condición `pe.liquidacion is null` nunca puede ser
--  cierta), pero se deja tal cual — no hace daño y no vale la pena tocar
--  esa función en un corte que no la tiene en su alcance.
--
--  El disparador REAL, hoy, de cuenta_debito/cuenta_credito null para
--  presupuesto_ejecucion es un dato de fila incompleto que ninguna
--  configuración de tenant puede prevenir: `liquidacion = 'pagado_banco'`
--  sin `cuenta_bancaria_id`. La lógica de fn_contabilizar_periodo no
--  cambia (ya comprueba cuenta_debito/cuenta_credito null de forma
--  genérica, sin asumir la causa) — solo se corrige el comentario para que
--  no describa un caso que ya no puede ocurrir.
-- ═══════════════════════════════════════════════════════════════════════

comment on function public.fn_contabilizar_periodo(uuid, uuid) is
  'CO-3: materializa un periodo — camino B (un comprobante por periodo+entidad) para cartera '
  '(cargos/pago_aplicaciones/pagos), camino A (un comprobante por hecho) para '
  'presupuesto_ejecucion/fondo_movimientos (D-46). Idempotente: además del índice único de '
  'origen de CO-2, verifica existencia antes de intentar crear y reporta ''omitido'' en vez de '
  'reventar. Cada comprobante se aísla en su propio bloque BEGIN/EXCEPTION (savepoint '
  'implícito): un hecho mal parametrizado no aborta el resto del periodo. Se contabiliza vía '
  'fn_contabilizar_comprobante (nunca INSERT directo) — las validaciones de CO-2 aplican igual '
  'a lo automático. SECURITY DEFINER con verificación interna de has_role. Columnas de retorno '
  '''hecho_entidad''/''hecho_id'' (no ''origen_*'') a propósito: evita la ambigüedad de PL/pgSQL entre '
  'OUT params y las columnas homónimas de contable_comprobante que el cuerpo referencia sin '
  'calificar. ''sin_contrapartida'' se reporta cuando cuenta_debito/cuenta_credito de '
  'contable_hechos() salen NULL para presupuesto_ejecucion — hoy eso solo pasa con '
  '''liquidacion = pagado_banco'' sin cuenta_bancaria_id en la fila (dato incompleto, no un hueco '
  'de configuración del tenant); el caso histórico ''liquidacion IS NULL'' que motivó este diseño '
  'ya no es representable desde que 20260830490000 puso esa columna NOT NULL.';
