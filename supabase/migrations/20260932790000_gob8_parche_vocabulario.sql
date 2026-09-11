-- ═══════════════════════════════════════════════════════════════════════
--  GOB-8 (parche) · recepción externa de solicitudes con triage — vocabulario
--  Ver GOB_08_PARCHE_RECEPCION_EXTERNA.md §3.1.
--
--  Solo agrega los dos valores del enum en esta migración: Postgres no
--  permite USAR un valor de enum recién agregado dentro de la misma
--  transacción que lo agrega (mismo hallazgo documentado en
--  20260830570000), y `supabase db push` corre cada migración en una
--  transacción propia. Las columnas/CHECK/funciones que SÍ usan estos
--  valores van en las dos migraciones siguientes.
-- ═══════════════════════════════════════════════════════════════════════

alter type public.solicitud_estado_t add value 'recibida_externa';
alter type public.solicitud_estado_t add value 'rechazada_triage';

comment on type public.solicitud_estado_t is
  'D-24: FSM de solicitudes (atención al propietario/residente, GOB-8; recepción externa con '
  'triage, parche GOB-8) — buena práctica, sin base legal (spec §2). en_espera pausa el reloj '
  'del SLA (solicitudes.en_espera_desde); resuelta exige al menos una actuación con '
  'es_respuesta=true (ATENCION_CIERRE_SIN_RESPUESTA); anulada exige motivo. recibida_externa: '
  'llegó por AQUILA External, pendiente de triage humano, no cuenta para SLA. rechazada_triage: '
  'terminal, nunca llegó a ser una solicitud real, exige motivo. resuelta/cerrada/anulada/'
  'rechazada_triage son terminales.';
