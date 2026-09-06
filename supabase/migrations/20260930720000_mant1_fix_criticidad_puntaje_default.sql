-- ═══════════════════════════════════════════════════════════════════════
--  MANT-1 · Fix: mant_activo_criticidad.puntaje sin default forzaba a
--  cualquier cliente a enviar un valor de relleno
--
--  `puntaje` es calculado por guard_activo_criticidad_puntaje (20260930690000)
--  a partir de criterio.escala[valor] — el cliente nunca debería tener que
--  proponer uno. Pero la columna era `not null` SIN default, así que
--  `pnpm db:types` generaba un Insert que lo exige de todos modos
--  (contradice la intención: "el cliente nunca lo escribe directo").
--  Encontrado por `tsc`, no por una prueba fallida (las pruebas ya
--  enviaban un valor de relleno sin darse cuenta del problema de tipos).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mant_activo_criticidad
  alter column puntaje set default 0;

comment on column public.mant_activo_criticidad.puntaje is
  'Resuelto de criterio.escala[valor] por guard_activo_criticidad_puntaje al insertar/actualizar '
  '— no es un dato independiente que alguien pueda hacer divergir de la escala. El default 0 '
  'existe solo para que el Insert generado no lo exija (siempre se sobrescribe antes de '
  'persistir); nunca queda en 0 tras el guard salvo que la propia escala mapee a 0.';
