-- PROMPT AUDITORÍA §62 — Root cause: "permitir clasificar causa: PERSONA,
-- PROCESO, TECNOLOGIA, DATOS, POLITICA, CONTROL, NORMATIVA, INTEGRACION,
-- CONFIGURACION. No exigir análisis de causa raíz profundo para
-- observaciones menores."
--
-- Columna nueva, no reemplaza `causa` (texto libre, la narrativa de qué
-- pasó) — `causa_raiz` es la clasificación estructurada de esa narrativa.
-- Se queda como `text` con CHECK, no `CREATE TYPE ... ENUM`: es vocabulario
-- descriptivo que no gatilla ninguna transición de estado ni lógica (D-24),
-- mismo criterio que ya se usó para auditoria_riesgos.prioridad /
-- auditoria_engagements.prioridad. Nullable siempre — "no exigir" se
-- cumple sin excepciones condicionadas al nivel del hallazgo.

alter table public.auditoria_hallazgos
  add column causa_raiz text check (
    causa_raiz in (
      'PERSONA', 'PROCESO', 'TECNOLOGIA', 'DATOS', 'POLITICA',
      'CONTROL', 'NORMATIVA', 'INTEGRACION', 'CONFIGURACION'
    )
  );

comment on column public.auditoria_hallazgos.causa_raiz is
  'Clasificación estructurada de causa raíz (PROMPT AUDITORÍA §62) — opcional, nunca exigida (observaciones menores no la necesitan). Distinta de `causa` (texto libre).';
