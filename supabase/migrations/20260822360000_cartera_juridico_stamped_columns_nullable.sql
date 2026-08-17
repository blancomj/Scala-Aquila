-- ═══════════════════════════════════════════════════════════════════════
--  Corrige 20260822340000_cartera_juridico.sql: mismo motivo que
--  20260822350000 (expedida_por) — casos_juridicos.aprobado_por,
--  caso_juridico_actuaciones.registrada_por y costas_judiciales.
--  registrada_por quedaron NOT NULL, pero sus respectivos triggers
--  (guard_caso_juridico_insert, guard_caso_juridico_actuacion_
--  registrada_por, guard_costa_judicial_insert) SIEMPRE los sobreescriben
--  desde auth.uid() — nunca se confían del cliente. NOT NULL a nivel de
--  columna era redundante con esa garantía y rompía el I/O directo desde
--  TS (mismo patrón que propuesto_por en acciones_cobranza/acuerdos_pago/
--  cartera_etapas, todas nullable por el mismo motivo).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.casos_juridicos
  alter column aprobado_por drop not null;

alter table public.caso_juridico_actuaciones
  alter column registrada_por drop not null;

alter table public.costas_judiciales
  alter column registrada_por drop not null;
