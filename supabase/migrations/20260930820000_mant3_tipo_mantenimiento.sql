-- ═══════════════════════════════════════════════════════════════════════
--  MANT-3 · Planes de mantenimiento y motor de programación (1/6)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_03_planes_programacion.md §3.1
--
--  Vocabulario descriptivo puro (D-24): ninguna transición ni cálculo
--  depende de cuál sea el tipo de mantenimiento, así que va a lista_tipos,
--  no a un enum — mismo criterio que CATEGORIA_ACTIVO/TIPO_ACTIVO (MANT-0).
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('TIPO_MANTENIMIENTO', 'Tipo de mantenimiento',
   'Naturaleza del mantenimiento que ejecuta un plan (MANT-3 §3.1) — puramente descriptivo, '
   'ningún guard depende de cuál sea.')
on conflict (codigo) do nothing;

insert into public.lista_tipos (tipo, codigo, nombre, orden) values
  ('TIPO_MANTENIMIENTO', 'preventivo', 'Preventivo', 10),
  ('TIPO_MANTENIMIENTO', 'correctivo', 'Correctivo', 20),
  ('TIPO_MANTENIMIENTO', 'predictivo', 'Predictivo', 30),
  ('TIPO_MANTENIMIENTO', 'reglamentario', 'Reglamentario', 40),
  ('TIPO_MANTENIMIENTO', 'mejora', 'Mejora', 50);
