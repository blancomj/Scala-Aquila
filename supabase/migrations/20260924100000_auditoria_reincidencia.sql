-- PROMPT AUDITORÍA §61 — Reincidencia: "si un hallazgo reaparece: relacionar
-- hallazgo anterior, hallazgo nuevo, causa común. La recurrencia debe
-- aumentar la prioridad del riesgo."
--
-- El vínculo es una decisión del auditor (reconocer que un hallazgo nuevo
-- es la misma falla que uno anterior), no un algoritmo de detección
-- automática — no hay forma honesta de inferir "es la misma falla" por
-- coincidencia de texto sin inventar heurísticas no pedidas en el prompt.
--
-- "Aumentar la prioridad del riesgo" tampoco se automatiza con una fórmula
-- inventada (no hay una cerrada en el prompt ni en Docs/01-24): se agrega
-- `auditoria_riesgos.prioridad` (mismo patrón ALTA/MEDIA/BAJA que
-- auditoria_engagements.prioridad y auditoria_plan_items.prioridad) para
-- que el auditor la suba él mismo — la UI marca visiblemente los riesgos
-- con hallazgos reincidentes para que no se le pase revisarla.

alter table public.auditoria_hallazgos
  add column reincidente boolean not null default false,
  add column hallazgo_anterior_id uuid references public.auditoria_hallazgos (id) on delete set null,
  add column causa_comun text;

alter table public.auditoria_hallazgos
  add constraint auditoria_hallazgos_reincidencia_coherente check (
    (reincidente = false and hallazgo_anterior_id is null and causa_comun is null)
    or (reincidente = true and hallazgo_anterior_id is not null and causa_comun is not null)
  ),
  add constraint auditoria_hallazgos_no_autorreferencia check (hallazgo_anterior_id is null or hallazgo_anterior_id <> id);

create index auditoria_hallazgos_anterior_idx on public.auditoria_hallazgos (tenant_id, hallazgo_anterior_id) where hallazgo_anterior_id is not null;

comment on column public.auditoria_hallazgos.reincidente is 'HALLAZGO_REINCIDENTE (PROMPT AUDITORÍA §61) — lo marca el auditor al reconocer que repite un hallazgo anterior, no se infiere automáticamente.';
comment on column public.auditoria_hallazgos.hallazgo_anterior_id is 'El hallazgo del que este es reincidencia. Obligatorio cuando reincidente=true.';
comment on column public.auditoria_hallazgos.causa_comun is 'Causa común entre el hallazgo anterior y este (PROMPT AUDITORÍA §61). Obligatoria cuando reincidente=true.';

-- ── auditoria_riesgos.prioridad ─────────────────────────────────────────
alter table public.auditoria_riesgos
  add column prioridad text check (prioridad in ('ALTA', 'MEDIA', 'BAJA'));

comment on column public.auditoria_riesgos.prioridad is
  'Prioridad de atención del riesgo (ALTA/MEDIA/BAJA), asignada por el auditor — distinta de riesgo_inherente (probabilidad × impacto). La reincidencia de un hallazgo (§61) es la señal más común para subirla, pero el cambio siempre lo hace una persona, nunca un cálculo automático.';
