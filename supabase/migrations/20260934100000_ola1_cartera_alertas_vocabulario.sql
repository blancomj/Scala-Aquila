-- ═══════════════════════════════════════════════════════════════════════
--  OLA 1 (ENFOQUE_CONSOLIDACION, 06_PROMPT_O1_CONSOLIDACION.md §2.2) ·
--  Cartera empieza a notificar (1/3) — vocabulario.
--
--  `TIPO_ALERTA_CARTERA` (lista_tipos, catálogo descriptivo del sistema,
--  mismo criterio que TIPO_ALERTA_LIQUIDEZ en FIN-4 — 20260932560000):
--  los 4 códigos que fn_alertas_cartera(uuid,date) ya devuelve
--  (20260823180000). Sin tabla de regla configurable por tenant — a
--  diferencia de finanzas, cartera usa umbral fijo (90 días), ya
--  documentado así en 02_ESTADO_VERIFICADO.md §2. El catálogo de tipos es
--  platform-wide; cartera_alertas_evaluar() (20260934120000) tiene un
--  dispatch fijo por código, no una regla configurable.
--
--  `TIPO_NOTIFICACION.alerta_cartera` — el hueco que 02_ESTADO_VERIFICADO
--  §2 documentaba: cartera es el único de los cuatro dominios de alerta
--  que detecta y no avisa. Un solo tipo de notificación para las cuatro
--  condiciones, mismo criterio que alerta_liquidez cubre las cinco reglas
--  de FIN-4 — el detalle de cuál condición disparó vive en el título del
--  aviso, no en el vocabulario de notificación.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_ALERTA_CARTERA', 'Tipo de alerta de cartera',
   'Ola 1 §2.2: qué condición de fn_alertas_cartera(uuid,date) disparó una fila en '
   'cartera_alerta_emitida. Catálogo CERRADO — cartera_alertas_evaluar() tiene un dispatch fijo '
   'por código; no hay tabla de regla configurable por tenant porque cartera usa umbral fijo '
   '(90 días), a diferencia de FIN-4.');

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('TIPO_ALERTA_CARTERA', 'obligaciones_mayor_90',
   'Obligaciones con mora mayor a 90 días',
   'obligaciones_mayor_90_cantidad/monto de fn_alertas_cartera — cargos abiertos cuya fecha de '
   'vencimiento efectiva antecede en más de 90 días a la fecha de referencia.', 10),
  ('TIPO_ALERTA_CARTERA', 'promesas_por_vencer',
   'Promesas de pago próximas a vencer',
   'promesas_por_vencer_cantidad/monto — promesas pendientes cuya fecha prometida cae dentro de '
   'los 3 días siguientes a la fecha de referencia.', 20),
  ('TIPO_ALERTA_CARTERA', 'cuotas_acuerdo_vencidas',
   'Cuotas de acuerdo de pago vencidas',
   'cuotas_acuerdo_vencidas_cantidad/monto — cuotas de acuerdo_pago_cuotas en estado vencida.', 30),
  ('TIPO_ALERTA_CARTERA', 'obligaciones_sin_vencimiento',
   'Obligaciones sin fecha de vencimiento efectiva',
   'obligaciones_sin_vencimiento_cantidad/monto (GAP-CAR-001) — cargos abiertos sin fecha de '
   'vencimiento efectiva ni en el cargo ni en su período: indeterminados, no "al día".', 40);

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_NOTIFICACION', 'alerta_cartera', 'Alerta de cartera', 40);
