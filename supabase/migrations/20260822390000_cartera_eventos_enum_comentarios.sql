-- ═══════════════════════════════════════════════════════════════════════
--  D-24 (DECISIONES.md) — justificación de los 2 enums nativos de
--  20260822380000_cartera_eventos.sql, exigida por tests/governance/
--  enum-lista-tipos-coverage.test.ts.
-- ═══════════════════════════════════════════════════════════════════════

comment on type public.tipo_evento_cartera_t is
  'Por qué es enum nativo (D-24): catálogo CERRADO de eventos de dominio '
  '(CAR §19.1), usado como discriminante de índice compuesto '
  '(tenant_id, tipo, fecha_corte) y como componente de dedup_key '
  '(IDEM-03) — no es vocabulario descriptivo ampliable por tenant, es la '
  'taxonomía fija de eventos que el bloque de cartera puede emitir.';

comment on type public.origen_evento_t is
  'Por qué es enum nativo (D-24): 4 valores fijos que clasifican QUIÉN '
  'generó el evento (job/usuario/sistema/integracion) — invariante '
  'estructural de auditoría, no vocabulario de negocio ampliable por '
  'tenant.';
