-- PROMPT AUDITORÍA §35 — Papel de trabajo: "cada procedimiento debe generar
-- un workpaper mínimo": Objetivo, Criterio, Procedimiento, Muestra,
-- Resultado, Evidencia, Conclusión.
--
-- De esos 7 campos, 5 ya existen repartidos en tablas de
-- 20260910100000/20260912100000: Objetivo (auditoria_procedimientos.objetivo),
-- Procedimiento (la fila de auditoria_procedimientos misma), Muestra
-- (auditoria_muestras, vía auditoria_ejecuciones.id), Resultado
-- (auditoria_ejecuciones.resultado). Faltan 2: Criterio y Conclusión — y,
-- en la práctica, un lugar para dejar evidencia de una ejecución que no
-- generó hallazgo (auditoria_evidencias exige hallazgo_id NOT NULL —
-- correcto para su propio propósito de inmutabilidad post-cierre, PROMPT
-- AUDITORÍA §34/§70 — pero no sirve para "dejé constancia de que revisé X y
-- todo estaba bien"). Se agrega `evidencia text[]` en auditoria_ejecuciones,
-- mismo patrón ya usado en auditoria_controles.evidencia y
-- auditoria_hallazgos.evidencia (referencias/etiquetas, no almacenamiento
-- de archivo).
--
-- Ambas tablas están vacías (auditoria_procedimientos) o con filas propias
-- de Continuous Control Monitoring, no de procedimientos manuales
-- (auditoria_ejecuciones) — por eso `criterio` puede ir NOT NULL sin
-- backfill, mientras que `conclusion`/`evidencia` van nullable (no aplican
-- a una ejecución automática de CCM, que no es un "procedimiento" en el
-- sentido de este workpaper).

alter table public.auditoria_procedimientos
  add column criterio text not null;

comment on column public.auditoria_procedimientos.criterio is
  'Norma/política/estándar contra el que se prueba el procedimiento (PROMPT AUDITORÍA §35, campo "Criterio" del workpaper).';

alter table public.auditoria_ejecuciones
  add column conclusion text,
  add column evidencia text[];

comment on column public.auditoria_ejecuciones.conclusion is
  'Conclusión del workpaper (PROMPT AUDITORÍA §35) — nula para ejecuciones de Continuous Control Monitoring, que no pasan por un procedimiento manual.';
comment on column public.auditoria_ejecuciones.evidencia is
  'Evidencia de la ejecución cuando no generó hallazgo (referencias/etiquetas, igual patrón que auditoria_controles.evidencia) — auditoria_evidencias exige hallazgo_id y por diseño no cubre este caso (PROMPT AUDITORÍA §34/§70).';
