-- ═══════════════════════════════════════════════════════════════════════
--  EXT-02 · solicitudes desde External — vocabulario
--  Ver EXT_02_solicitudes.md §3.2.
--
--  Solo el valor nuevo del enum en esta migración — mismo hallazgo ya
--  documentado en 20260830570000 y en el parche de GOB-8
--  (20260932790000): Postgres no permite usar un valor de enum recién
--  agregado dentro de la misma transacción que lo agrega, y cada
--  migración corre en una transacción propia. El CHECK que exime a este
--  nuevo estado (igual que ya hace con recibida_externa/rechazada_triage)
--  y las funciones que lo usan van en la migración siguiente.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.solicitud_estado_t add value 'cancelada_por_solicitante';

comment on type public.solicitud_estado_t is
  'D-24: FSM de solicitudes (atención al propietario/residente, GOB-8; recepción externa con '
  'triage, parche GOB-8; cancelación por el propio solicitante, EXT-02) — buena práctica, sin '
  'base legal (spec §2). en_espera pausa el reloj del SLA (solicitudes.en_espera_desde); '
  'resuelta exige al menos una actuación con es_respuesta=true (ATENCION_CIERRE_SIN_RESPUESTA); '
  'anulada exige motivo. recibida_externa: llegó por AQUILA External, pendiente de triage humano, '
  'no cuenta para SLA. rechazada_triage: terminal, nunca llegó a ser una solicitud real, exige '
  'motivo. cancelada_por_solicitante: terminal, el propio actor externo la retiró ANTES de que el '
  'staff la mirara (solo desde recibida_externa, EXT-02 §3.2). resuelta/cerrada/anulada/'
  'rechazada_triage/cancelada_por_solicitante son terminales.';
