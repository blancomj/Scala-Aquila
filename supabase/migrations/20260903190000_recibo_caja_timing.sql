-- ═══════════════════════════════════════════════════════════════════════
--  Corrige una condición de carrera en la emisión del recibo de caja
--  (RC-3, 20260903160000) — descubierta 2026-08-27 verificando el nuevo
--  formulario de imputación manual.
--
--  trg_emitir_recibo_caja (AFTER INSERT ON pagos) armaba el snapshot del
--  recibo en el instante en que se insertaba la fila de `pagos` — pero
--  registrarPago() (cuenta-corriente-supabase.ts) inserta `pagos` y
--  `pago_aplicaciones` en dos llamadas .insert() SEPARADAS (dos requests
--  a PostgREST, no una transacción). El trigger siempre corría antes de
--  que existieran las filas de pago_aplicaciones, así que "por concepto
--  de" salía vacío y todo el monto se guardaba como anticipo — aunque el
--  pago sí se hubiera aplicado a cargos reales. Confirmado con datos
--  reales de esta sesión: los recibos RC000004-RC000009 (dev) quedaron
--  todos así.
--
--  fn_emitir_recibo_caja es idempotente (si el pago ya tiene recibo,
--  devuelve el existente) — eso significa que ni siquiera se podía
--  "corregir" llamándola de nuevo más tarde: la primera llamada (mal
--  sincronizada) ya había ganado. recibos_caja es append-only, así que
--  los recibos ya emitidos con el dato incorrecto quedan así para
--  siempre — esta migración no los toca, solo corrige la emisión hacia
--  adelante.
--
--  Corrección: se retira el trigger. registrarPago() ahora llama
--  fn_emitir_recibo_caja(pago.id) explícitamente, DESPUÉS de insertar
--  pago_aplicaciones — así la función ve la foto completa. Es el único
--  camino de escritura real de `pagos` hoy (confirmado: ni anular-pago
--  necesita recibo para una reversa — fn_emitir_recibo_caja ya excluye
--  reversas —, ni existe otro insertor en el código). Si en el futuro
--  aparece un segundo camino (carga masiva, conciliación), ese camino
--  deberá llamar fn_emitir_recibo_caja explícitamente también, una vez
--  que sepa sus propias aplicaciones — no hay forma de que un trigger
--  automático adivine eso antes de tiempo.
-- ═══════════════════════════════════════════════════════════════════════

drop trigger trg_emitir_recibo_caja on public.pagos;
drop function public.trg_emitir_recibo_caja();

comment on function public.fn_emitir_recibo_caja(uuid) is
  'Motor del recibo de caja (RC-3): arma el snapshot de HECHOS de un pago real (nunca de una '
  'reversa) — monto en letras y hash de verificación se derivan al leer, no se guardan aquí '
  '(mismo principio que ver-estado-cuenta). Idempotente: si el pago ya tiene recibo, devuelve el '
  'existente en vez de duplicar. Se llama EXPLÍCITAMENTE desde registrarPago() (cuenta-corriente-'
  'supabase.ts) después de insertar pago_aplicaciones — ya NO hay trigger automático en pagos '
  '(retirado en 20260903190000: corría antes de que existieran las aplicaciones, una condición '
  'de carrera real — ver cabecera de esa migración).';
