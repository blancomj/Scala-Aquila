-- ═══════════════════════════════════════════════════════════════════════
--  MANT-4 · fix: numero/anio necesitan un DEFAULT a nivel de columna.
--
--  guard_mant_incidencia/guard_mant_ot ya los asignan siempre en el
--  INSERT (numero incondicional, anio con coalesce) — pero sin ningún
--  DEFAULT de columna, el generador de tipos de Supabase los marca como
--  REQUERIDOS en el tipo Insert de TypeScript (una columna NOT NULL sin
--  default nunca se infiere opcional), obligando a todo el código
--  cliente — UI y tests por igual — a inventar un valor que el guard va a
--  ignorar/sobrescribir de todas formas. Los valores por defecto de abajo
--  son placeholders sin significado propio (numero: 0, anio: el año
--  actual) — el guard los reemplaza siempre antes de guardar.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mant_incidencias
  alter column numero set default 0,
  alter column anio set default extract(year from now())::smallint;

alter table public.mant_ordenes_trabajo
  alter column numero set default 0,
  alter column anio set default extract(year from now())::smallint;

comment on column public.mant_incidencias.numero is
  'Asignado siempre por guard_mant_incidencia vía fn_mant_siguiente_numero — el DEFAULT 0 es un '
  'placeholder para que el tipo generado lo marque opcional, nunca el valor real guardado.';
comment on column public.mant_ordenes_trabajo.numero is
  'Asignado siempre por guard_mant_ot vía fn_mant_siguiente_numero — el DEFAULT 0 es un '
  'placeholder para que el tipo generado lo marque opcional, nunca el valor real guardado.';
