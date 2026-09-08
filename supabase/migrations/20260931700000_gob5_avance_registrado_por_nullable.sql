-- ═══════════════════════════════════════════════════════════════════════
--  GOB-5 · fix: gobierno_compromiso_avances.registrado_por debe ser nullable
--
--  Mismo motivo que 20260822360000 (caso_juridico_actuaciones.registrada_por):
--  guard_gobierno_compromiso_avance_registrado_por SIEMPRE sobrescribe la
--  columna desde auth.uid() — nunca se confía del cliente. NOT NULL a nivel
--  de columna era redundante con esa garantía y rompía el I/O directo desde
--  TS/el cliente admin (service_role, sin sesión, auth.uid() null).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.gobierno_compromiso_avances
  alter column registrado_por drop not null;
