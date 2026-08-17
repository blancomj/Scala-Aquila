-- ═══════════════════════════════════════════════════════════════════════
--  Corrige 20260822340000_cartera_juridico.sql: expedida_por NOT NULL
--  hacía que el tipo Insert generado exigiera un valor del cliente para
--  una columna que guard_certificacion_insert() SIEMPRE sobreescribe
--  desde auth.uid() (nunca se confía del cliente, igual que propuesto_por
--  en acciones_cobranza/acuerdos_pago/cartera_etapas — todas nullable por
--  el mismo motivo). guard_certificacion_insert ya garantiza que nunca
--  queda en null en la práctica (exige auth.uid() is not null antes de
--  insertar); el NOT NULL a nivel de columna era redundante con esa
--  garantía y, a diferencia de esas otras tres tablas, rompía el patrón
--  de I/O de packages/liquidation-engine (hash calculado en TS + INSERT
--  directo, mismo criterio que registrarSnapshotPosicion) al exigir un
--  valor ficticio en el literal de inserción.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.certificaciones_deuda
  alter column expedida_por drop not null;
