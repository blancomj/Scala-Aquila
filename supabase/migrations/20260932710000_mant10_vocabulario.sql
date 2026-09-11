-- ═══════════════════════════════════════════════════════════════════════
--  MANT-10 · Reservas de zonas comunes (1/5) — vocabulario
--  Casos de uso/Solicitudes - Reservas - Visitantes/MANT_10_reservas_zonas_comunes.md
--
--  zonas_comunes (20260814100100) es solo catálogo — código, nombre, tipo,
--  área, uso exclusivo. No tiene disponibilidad ni reglas de reserva. Todo
--  lo de este corte es dominio nuevo; no se crea un segundo catálogo de
--  zonas, cada mant_zona_reserva_regla referencia una fila existente.
-- ═══════════════════════════════════════════════════════════════════════

create type public.reserva_estado_t as enum (
  'solicitada', 'aprobada', 'rechazada', 'cancelada', 'completada', 'no_show'
);

comment on type public.reserva_estado_t is
  'Ciclo de vida de una reserva de zona común (MANT-10 §3.2): solicitada -> aprobada -> '
  'completada; solicitada -> rechazada; aprobada -> cancelada; aprobada -> no_show (lo registra '
  'staff tras el hecho, nunca automático). Gatilla el guard de traslapes (solo solicitada/'
  'aprobada cuentan como ocupación) y la generación del cargo al aprobar.';

create type public.reserva_solicitante_t as enum ('externo', 'staff');

comment on type public.reserva_solicitante_t is
  'Quién origina la reserva (MANT-10 §3.2): staff (un miembro operando por el inmueble) o '
  'externo (un actor_externo_vinculo, EXT-01). Gatilla el guard RESERVA_INMUEBLE_NO_VINCULADO, '
  'que solo aplica cuando el origen es externo — un staff puede reservar para cualquier '
  'inmueble del tenant, un actor externo solo para el suyo.';

-- Desviación frente al spec §3.5: cargos.origen_tipo (cargo_origen_t) no tenía un valor propio
-- para "nace de una reserva" — reusar 'novedad' falsearía el origen real del cargo. ALTER TYPE
-- ADD VALUE no puede usarse en la misma transacción en que se referencia (a diferencia de RENAME
-- VALUE) — el valor se consume recién en 20260932740000_mant10_funciones.sql, mismo patrón que
-- 20260822250000_rol_administrador_enum.sql con tenant_role_t.
alter type public.cargo_origen_t add value 'reserva';
