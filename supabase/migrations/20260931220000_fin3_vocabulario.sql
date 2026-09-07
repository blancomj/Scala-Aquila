-- ═══════════════════════════════════════════════════════════════════════
--  FIN-3 · Programación y ejecución de pagos por lote (1/8)
--
--  `lote_estado_t` gobierna toda la FSM del corte — invariante de
--  transición real (D-24), no vocabulario descriptivo, así que va como
--  enum con `comment on type`, no como `lista_tipos`.
--
--  Secuencia: borrador → programado → aprobado → ejecutado → conciliado.
--  Cualquier estado salvo 'ejecutado' y 'conciliado' puede pasar a
--  'anulado' — una vez que el dinero salió (ejecutado) o se conciliado
--  contra el extracto, anular ya no es una operación válida (correspondería
--  a un pago real hecho o confirmado, no a algo que se pueda deshacer con
--  un cambio de estado).
-- ═══════════════════════════════════════════════════════════════════════

create type public.lote_estado_t as enum (
  'borrador', 'programado', 'aprobado', 'ejecutado', 'conciliado', 'anulado'
);

comment on type public.lote_estado_t is
  'FIN-3 §3.1: FSM del lote de pago — borrador→programado→aprobado→ejecutado→conciliado; '
  'cualquiera salvo ejecutado/conciliado puede pasar a anulado (fn_finanzas_anular_lote). '
  'Gatilla efectos reales: aprobado→ejecutado crea presupuesto_ejecucion y mueve las facturas a '
  'pagada/pagada_parcial (fn_finanzas_ejecutar_lote); ejecutado→conciliado enlaza una línea del '
  'extracto bancario (fn_finanzas_conciliar_lote). Por eso gobierna lógica real, no es '
  'vocabulario descriptivo (D-24).';
