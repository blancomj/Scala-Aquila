-- ═══════════════════════════════════════════════════════════════════════
--  MANT-9 · Salud del activo y apoyo a la decisión (1/7)
--  Casos de uso/Tres Modulos/Mantenimiento/MANT_09_salud_decision.md
--
--  Plan del corte aprobado con el usuario: dos correcciones frente al
--  pseudo-esquema del §3.1.
--
--  (1) `fuente text` (texto libre en el spec) → `fuente_id` FK a
--  `lista_tipos` (familia nueva FUENTE_SALUD_FACTOR). Texto libre habría
--  hecho SALUD_FACTOR_FUENTE_INVALIDA imposible de validar de verdad — D-24
--  y la convención ya asentada del repo (TIPO_MANTENIMIENTO, CATEGORIA_
--  ACTIVO, etc.) resuelven exactamente este caso. Catálogo CERRADO —
--  mant_salud() solo sabe interpretar estos códigos, ninguno más.
--
--  (2) "documentación" del §11 del prompt original queda FUERA del
--  catálogo, a propósito (aprobado con el usuario, no omitido por
--  accidente): MANT-1 ya exige todo atributo obligatorio antes de que un
--  activo pase a en_servicio (ATRIBUTO_OBLIGATORIO_FALTANTE) — así que
--  "documentación completa" sería trivialmente 100% para cualquier activo
--  operativo, no discrimina nada. Pendiente para un corte futuro si se
--  define una fuente real distinta de "obligatorios completos".
-- ═══════════════════════════════════════════════════════════════════════

insert into public.tipos (codigo, nombre, descripcion) values
  ('FUENTE_SALUD_FACTOR', 'Fuente de un factor de salud',
   'MANT-9 §3.1: qué función/dato del sistema alimenta un factor del índice de salud. Catálogo '
   'CERRADO — mant_salud() tiene un dispatch fijo por código, un factor con fuente_id fuera de '
   'esta familia falla con SALUD_FACTOR_FUENTE_INVALIDA. Ampliar el catálogo (p.ej. una fuente '
   'real de "documentación") es decisión de un corte futuro, no de este.');

insert into public.lista_tipos (tipo, codigo, nombre, descripcion, orden) values
  ('FUENTE_SALUD_FACTOR', 'mttr', 'MTTR',
   'mant_indicador_mttr (MANT-8), filtrado por activo — horas entre reporte y cierre.', 10),
  ('FUENTE_SALUD_FACTOR', 'mtbf', 'MTBF',
   'mant_indicador_mtbf (MANT-8) — horas entre fallas consecutivas del activo.', 20),
  ('FUENTE_SALUD_FACTOR', 'disponibilidad', 'Disponibilidad',
   'mant_indicador_disponibilidad (MANT-8) — % del rango en_servicio.', 30),
  ('FUENTE_SALUD_FACTOR', 'cumplimiento_plan', 'Cumplimiento del plan',
   'mant_indicador_cumplimiento_plan (MANT-8), extendida con p_activo_id opcional en este corte.', 40),
  ('FUENTE_SALUD_FACTOR', 'ot_a_tiempo', 'OT cerradas a tiempo',
   'mant_indicador_ot_a_tiempo (MANT-8), extendida con p_activo_id opcional en este corte.', 50),
  ('FUENTE_SALUD_FACTOR', 'costo', 'Costo de mantenimiento',
   'mant_costos (MANT-6), sumado y filtrado por activo_id.', 60),
  ('FUENTE_SALUD_FACTOR', 'criticidad', 'Criticidad',
   'mant_criticidad (MANT-1) — puntaje_total ya calculado.', 70),
  ('FUENTE_SALUD_FACTOR', 'cumplimiento_normativo', 'Cumplimiento normativo',
   'mant_estado_cumplimiento (MANT-2), filtrado por activo_id — % de requisitos al_dia.', 80),
  ('FUENTE_SALUD_FACTOR', 'hallazgos_criticos', 'Hallazgos críticos abiertos',
   'mant_indicador_hallazgos_criticos (MANT-8), filtrado por activo_id — conteo.', 90),
  ('FUENTE_SALUD_FACTOR', 'tendencia_fallas', 'Tendencia de fallas',
   'mant_tendencia_fallas (MANT-8) — variación de la ventana más reciente.', 100),
  ('FUENTE_SALUD_FACTOR', 'edad', 'Edad relativa a la vida útil',
   'activos.fecha_puesta_servicio + vida_util_meses (MANT-0) — % de vida útil consumida.', 110),
  ('FUENTE_SALUD_FACTOR', 'condicion_inspeccion', 'Condición (última inspección)',
   'resultado de la inspección más reciente del activo (MANT-7): conforme/con_hallazgos/no_conforme.', 120);

-- ── §3.3: 3 valores cerrados y universales — a diferencia de FUENTE_SALUD_FACTOR (vocabulario
-- descriptivo abierto), tipo SÍ gatilla lógica estructural real: qué supuestos son obligatorios y
-- cómo arma el total mant_evaluar_escenario() difiere por tipo (D-24, enum justificado). ──
create type public.escenario_tipo_t as enum ('reparar', 'reemplazar', 'mantener');
comment on type public.escenario_tipo_t is
  'MANT-9 §3.3: qué opción compara un escenario. 3 valores cerrados, nunca extensibles por '
  'tenant — mant_evaluar_escenario() arma el total distinto según cuál sea.';
